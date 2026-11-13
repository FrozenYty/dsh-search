#!/usr/bin/env node
/**
 * Mutation scan: prove the tests notice when a load-bearing line changes.
 *
 * A test that cannot fail is decoration. Each mutation below changes one line of `bing.js` that some
 * claim in `docs/architecture-en.md`, `README.md` or an ADR depends on, then runs the whole test suite
 * against the changed module in a throwaway directory. A mutation the suite still passes is a
 * **survivor**: no test stands behind that line, and this script exits non-zero naming it.
 *
 * Why a scan and not a coverage number: coverage counts executed lines, not checked ones. The two
 * regressions this bundle exists for — one request to `cn.bing.com`, and a redirect that is never
 * followed — are covered the moment the suite runs at all. Only breaking them shows whether anything
 * would have noticed.
 *
 * What it does not cover: `index.js`. The entry imports the seam, so plain `node` cannot load it; its
 * shape is checked structurally by `scripts/check.mjs`, and its translation of a provider failure into
 * the seam's error is exercised by a live call, not here.
 *
 * Usage: node scripts/mutation-scan.mjs [name-substring]
 */

import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, openSync, closeSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'bing.js'), 'utf8')

/**
 * The mutations, each with the line it breaks and the claim that line carries.
 *
 * `from` is matched literally against `bing.js`, so a refactor that changes the text fails this script
 * by name instead of quietly mutating nothing.
 */
const MUTATIONS = [
  {
    name: 'endpoint-moves-to-www',
    claim: 'every request goes to cn.bing.com (ADR 0001, acceptance item 3)',
    from: "export const SEARCH_ENDPOINT = 'https://cn.bing.com/search'",
    to: "export const SEARCH_ENDPOINT = 'https://www.bing.com/search'",
  },
  {
    name: 'redirect-is-followed',
    claim: 'a redirect is never followed (ADR 0001, acceptance item 3)',
    from: "        redirect: 'manual',",
    to: "        redirect: 'follow',",
  },
  {
    name: 'result-block-token-changes',
    claim: 'organic results are the blocks carrying the b_algo token',
    from: '\\bb_algo\\b',
    to: '\\bb_algo_none\\b',
  },
  {
    name: 'title-reads-any-anchor',
    claim: 'the title and URL come from the heading anchor, not from the site-icon anchor above it',
    from: '<h2[^>]*>\\s*<a\\b',
    to: '<a\\b',
  },
  {
    name: 'snippet-shape-changes',
    claim: 'a result carries the snippet Bing renders beside it',
    from: '\\bb_lineclamp[^"\']*',
    to: '\\bb_lineclamp_none[^"\']*',
  },
  {
    name: 'duplicate-urls-are-kept',
    claim: 'sources are deduplicated by URL',
    from: '    if (source === undefined || seen.has(source.url)) continue',
    to: '    if (source === undefined) continue',
  },
  {
    name: 'non-web-scheme-is-kept',
    claim: 'a link that is not an http(s) destination is dropped',
    from: "  return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined",
    to: '  return url.href',
  },
  {
    name: 'html-tags-are-kept',
    claim: 'markup is stripped out of a title and a snippet',
    from: "    .replace(/<[^>]*>/g, '')",
    to: '',
  },
  {
    name: 'entities-are-kept',
    claim: 'the entities Bing emits are decoded',
    from: '    .replace(/&#(\\d+);/g, (match, decimal) => decodedCodePoint(parseInt(decimal, 10), match))',
    to: '',
  },
  {
    name: 'invalid-entity-throws',
    claim: 'a numeric entity outside the Unicode range stays text instead of failing the parse',
    from: '  return Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : raw',
    to: '  return String.fromCodePoint(value)',
  },
  {
    name: 'http-status-is-ignored',
    claim: 'a non-2xx answer is a provider failure, not a body to parse',
    from: '    if (!response.ok) {',
    to: '    if (false) {',
  },
  {
    name: 'empty-page-is-a-success',
    claim: 'a page with no parseable result fails loudly',
    from: '    if (sources.length === 0) {',
    to: '    if (false) {',
  },
  {
    name: 'cancellation-is-a-transport-failure',
    claim: 'a cancelled request is reported as WEB_ABORTED',
    from: '      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)',
    to: '      if (false) throw aborted(signal, error)',
  },
]

const wanted = process.argv[2]
const selected = wanted === undefined ? MUTATIONS : MUTATIONS.filter((mutation) => mutation.name.includes(wanted))
if (selected.length === 0) {
  console.error(`no mutation matches ${JSON.stringify(wanted)}`)
  process.exit(1)
}

/** The first failing test the runner reported, for the mutation's one-line verdict. */
function firstFailure(output) {
  const match = /^\s*(?:✖|not ok \d+ -)\s+(.*)$/m.exec(output)
  return match === null ? 'the suite failed' : match[1].trim().slice(0, 80)
}

const results = []
for (const mutation of selected) {
  if (!source.includes(mutation.from)) {
    results.push({ mutation, verdict: 'stale', detail: `bing.js no longer contains ${JSON.stringify(mutation.from)}` })
    continue
  }
  const directory = mkdtempSync(join(tmpdir(), 'dsh-search-mutation-'))
  try {
    writeFileSync(join(directory, 'bing.js'), source.replace(mutation.from, mutation.to))
    mkdirSync(join(directory, 'tests'))
    cpSync(join(root, 'tests', 'fixtures'), join(directory, 'tests', 'fixtures'), { recursive: true })
    for (const name of ['parse.test.mjs', 'request.test.mjs']) {
      cpSync(join(root, 'tests', name), join(directory, 'tests', name))
    }
    const out = join(directory, 'stdout.txt')
    const err = join(directory, 'stderr.txt')
    // File descriptors, not pipes: a sandboxed child cannot open the named pipe `stdio: 'pipe'` needs.
    const outFd = openSync(out, 'w')
    const errFd = openSync(err, 'w')
    let status
    try {
      status = spawnSync(process.execPath, ['--test', '--test-isolation=none', join(directory, 'tests', 'parse.test.mjs'), join(directory, 'tests', 'request.test.mjs')], {
        cwd: directory,
        stdio: ['ignore', outFd, errFd],
      }).status
    } finally {
      closeSync(outFd)
      closeSync(errFd)
    }
    const output = `${readFileSync(out, 'utf8')}\n${readFileSync(err, 'utf8')}`
    results.push(status === 0
      ? { mutation, verdict: 'survived', detail: 'the suite passed, so nothing checks this line' }
      : { mutation, verdict: 'killed', detail: firstFailure(output) })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

let survivors = 0
for (const { mutation, verdict, detail } of results) {
  const mark = verdict === 'killed' ? 'killed  ' : verdict === 'survived' ? 'SURVIVED' : 'STALE   '
  if (verdict !== 'killed') survivors += 1
  console.log(`${mark}  ${mutation.name.padEnd(36)}  ${detail}`)
  console.log(`          claim: ${mutation.claim}`)
}
console.log(`\n${results.length} mutation(s): ${results.length - survivors} killed, ${survivors} not`)
if (survivors > 0) {
  console.error('mutation scan failed: a line no test stands behind is a line nothing protects')
  process.exit(1)
}
console.log('mutation scan passed')
