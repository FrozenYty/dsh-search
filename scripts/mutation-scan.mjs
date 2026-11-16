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
 * Both modules are mutated: `bing.js` for the request and the parse, `index.js` for the registration the
 * Host performs and the translation of a provider failure into the seam's error type. The copies live
 * under `.mutation/` inside this repository rather than in the system temp directory, so the entry tests
 * resolve the seam through the same `node_modules` they do when the suite runs normally — a copy in the
 * temp directory would import nothing and those tests would skip, which would make index.js mutations
 * look killed for the wrong reason.
 *
 * Usage: node scripts/mutation-scan.mjs [name-substring]
 */

import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, openSync, closeSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MUTATION_DIR = join(root, '.mutation')
const SOURCES = new Map([
  ['bing.js', readFileSync(join(root, 'bing.js'), 'utf8')],
  ['article.js', readFileSync(join(root, 'article.js'), 'utf8')],
  ['index.js', readFileSync(join(root, 'index.js'), 'utf8')],
])

/**
 * The mutations, each with the file and line it breaks and the claim that line carries.
 *
 * `from` is matched literally against that file, so a refactor which changes the text fails this script
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
    name: 'date-stays-in-the-snippet',
    claim: 'a stated date becomes metadata instead of the snippet\'s first words',
    from: '  return { text: snippet.slice(match[0].length), publishedAt }',
    to: '  return { text: snippet, publishedAt }',
  },
  {
    name: 'impossible-date-rolls-over',
    claim: 'a date that names no real day stays text instead of becoming a fake one',
    from: '  if (!real) return undefined',
    to: '  if (false) return undefined',
  },
  {
    name: 'published-at-dropped',
    claim: 'the seam receives the date the page stated',
    from: '  if (publishedAt !== undefined) source.publishedAt = publishedAt',
    to: '  if (false) source.publishedAt = publishedAt',
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
  {
    name: 'registration-reports-unavailable',
    file: 'index.js',
    claim: 'the registered provider reports itself available, so the seam can select it',
    from: '    available: () => provider.available(),',
    to: '    available: () => false,',
  },
  {
    name: 'registration-id-renamed',
    file: 'index.js',
    claim: 'the provider registers under the id a profile pins (ADR 0003)',
    from: '    id: provider.id,',
    to: "    id: 'bing-search',",
  },
  {
    name: 'provider-failure-untranslated',
    file: 'index.js',
    claim: 'a provider failure reaches the seam as the seam\'s own error type',
    from: '      throw new WebError(error.message, error.code, { cause: error })',
    to: '      throw error',
  },
  {
    name: 'failure-code-flattened',
    file: 'index.js',
    claim: 'the provider\'s code survives the translation, WEB_ABORTED included',
    from: '      throw new WebError(error.message, error.code, { cause: error })',
    to: "      throw new WebError(error.message, 'WEB_PROVIDER_ERROR', { cause: error })",
  },
  {
    name: 'configured-mode-ignored',
    file: 'index.js',
    claim: 'the row\'s `provider` field decides who serves the search',
    from: "  const mode = MODES.includes(config?.provider) ? config.provider : 'keyless'",
    to: "  const mode = 'keyless'",
  },
  {
    name: 'missing-shipped-provider-unreported',
    file: 'index.js',
    claim: 'asking for the shipped provider when it is not registered says so, by the seam\'s code',
    from: '    if (candidate === undefined) {',
    to: '    if (false) {',
  },
  {
    name: 'unavailable-shipped-provider-unreported',
    file: 'index.js',
    claim: 'asking for the shipped provider when it cannot run says so, by the seam\'s code',
    from: '    if (!candidate.available()) {',
    to: '    if (false) {',
  },
  {
    name: 'auto-retries-a-failed-account',
    file: 'index.js',
    claim: 'auto pays for a failed account once, not on every search',
    from: "    if (mode === 'auto' && !officialFailed) {",
    to: "    if (mode === 'auto') {",
  },
  {
    name: 'reuse-window-never-closes',
    file: 'bing.js',
    claim: 'a page older than the window is fetched again',
    from: '    if (this.#now() - entry.at >= CACHE_TTL_MS) {',
    to: '    if (this.#now() - entry.at > CACHE_TTL_MS) {',
  },
  {
    name: 'reuse-unbounded',
    file: 'bing.js',
    claim: 'the cache is bounded, and the oldest entry is the one that goes',
    from: '    while (this.#pages.size > CACHE_MAX_ENTRIES) this.#pages.delete(this.#pages.keys().next().value)',
    to: '    while (false) this.#pages.delete(this.#pages.keys().next().value)',
  },
  {
    name: 'reuse-hands-out-its-entry',
    file: 'bing.js',
    claim: 'a reused page is a copy, so a caller cannot edit the cache',
    from: '    return cloneResult(entry.result)',
    to: '    return entry.result',
  },
  {
    name: 'reuse-keeps-the-callers-object',
    file: 'bing.js',
    claim: 'the cache holds its own copy, so a caller cannot edit it after the fact',
    from: '    this.#pages.set(query, { at: this.#now(), result: cloneResult(result) })',
    to: '    this.#pages.set(query, { at: this.#now(), result })',
  },
  {
    name: 'declared-charset-ignored',
    file: 'bing.js',
    claim: 'the body is decoded with the charset the response declares',
    from: '  return match?.[1]',
    to: '  return undefined',
  },
  {
    name: 'unusable-charset-loses-the-page',
    file: 'bing.js',
    claim: 'an unusable charset label falls back to UTF-8 instead of failing the search',
    from: '  } catch {\n    return new TextDecoder(\'utf-8\').decode(bytes)\n  }',
    to: "  } catch {\n    return ''\n  }",
  },
  {
    name: 'fetch-follows-another-origin',
    file: 'article.js',
    claim: 'a redirect that changes origin is reported instead of followed',
    from: '      if (target.origin !== origin) {',
    to: '      if (false) {',
  },
  {
    name: 'fetch-cap-unmarked',
    file: 'article.js',
    claim: 'a capped extraction says so instead of looking complete',
    from: '  return `${text.slice(0, MAX_CHARS).trimEnd()}\\n\\n[Truncated at ${MAX_CHARS} characters: the page continues.]`',
    to: '  return text',
  },
  {
    name: 'extract-keeps-a-half-tag',
    file: 'article.js',
    claim: 'an unterminated tag at a page cut does not reach the model',
    from: '  text = text.replace(/<[a-z!/][^>]*$/i, \' \')',
    to: '  text = text',
  },
  {
    name: 'extract-drops-every-list',
    file: 'article.js',
    claim: 'a list that carries sentences is content, not navigation',
    from: '    return linked / all >= 0.7',
    to: '    return true',
  },
  {
    name: 'extract-keeps-navigation-tables',
    file: 'article.js',
    claim: 'a table whose cells are links is navigation, not content',
    from: '    const next = current.replace(/<(ul|ol|table)\\b[^>]*>[\\s\\S]*?<\\/\\1>/gi, (block) => (linkOnly(block) ? \' \' : block))',
    to: '    const next = current.replace(/<(ul|ol)\\b[^>]*>[\\s\\S]*?<\\/\\1>/gi, (block) => (linkOnly(block) ? \' \' : block))',
  },
  {
    name: 'extract-keeps-chrome',
    file: 'article.js',
    claim: 'the containers that are never prose are removed',
    from: '  for (const tag of CHROME) text = removeElements(text, tag)',
    to: '  for (const tag of []) text = removeElements(text, tag)',
  },
  {
    name: 'container-rule-disabled',
    file: 'article.js',
    claim: 'a page that names its own article container is read through it, not around it',
    from: '  return renderText(selectContainer(html) ?? html)',
    to: '  return renderText(html)',
  },
  {
    name: 'anchor-closer-loses-the-space',
    file: 'article.js',
    claim: 'an XHTML-style `</a >` closer still counts as anchor text',
    from: '    for (const match of block.matchAll(/<a\\b[^>]*>([\\s\\S]*?)<\\/a\\s*>/gi)) {',
    to: '    for (const match of block.matchAll(/<a\\b[^>]*>([\\s\\S]*?)<\\/a>/gi)) {',
  },
  {
    name: 'hidden-elements-are-kept',
    file: 'article.js',
    claim: 'an element the page marks as hidden is not read',
    from: '  const hidden = elements(html, (_tag, attributes) => HIDDEN_ELEMENT.test(attributes))',
    to: '  const hidden = []',
  },
  {
    name: 'ui-lines-are-kept',
    file: 'article.js',
    claim: "a line that is the page's own furniture, and nothing else, is dropped",
    from: '    .filter((line) => !DROP_LINES.some((pattern) => pattern.test(line)))',
    to: '    .filter((line) => true)',
  },
  {
    name: 'transport-failure-loses-the-offer',
    file: 'article.js',
    claim: 'a transport failure tells the reader the layer that failed and that a re-issue may succeed',
    from: "          + 'before the page answered, so re-issuing the call may succeed.',",
    to: "          + '',",
  },
]

const TEST_FILES = ['parse.test.mjs', 'request.test.mjs', 'entry.test.mjs', 'routing.test.mjs', 'cache.test.mjs', 'article.test.mjs']

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
  const file = mutation.file ?? 'bing.js'
  const source = SOURCES.get(file)
  if (!source.includes(mutation.from)) {
    results.push({ mutation, verdict: 'stale', detail: `${file} no longer contains ${JSON.stringify(mutation.from)}` })
    continue
  }
  // Inside the repository, not in the system temp directory: the entry tests resolve the seam by walking
  // up to the repository's node_modules, and a copy outside it would skip instead of failing.
  mkdirSync(MUTATION_DIR, { recursive: true })
  const directory = mkdtempSync(join(MUTATION_DIR, 'run-'))
  try {
    for (const [name, text] of SOURCES) {
      writeFileSync(join(directory, name), name === file ? text.replace(mutation.from, mutation.to) : text)
    }
    mkdirSync(join(directory, 'tests'))
    cpSync(join(root, 'tests', 'fixtures'), join(directory, 'tests', 'fixtures'), { recursive: true })
    for (const name of TEST_FILES) {
      cpSync(join(root, 'tests', name), join(directory, 'tests', name))
    }
    const out = join(directory, 'stdout.txt')
    const err = join(directory, 'stderr.txt')
    // File descriptors, not pipes: a sandboxed child cannot open the named pipe `stdio: 'pipe'` needs.
    const outFd = openSync(out, 'w')
    const errFd = openSync(err, 'w')
    let status
    try {
      status = spawnSync(process.execPath, ['--test', '--test-isolation=none', ...TEST_FILES.map((name) => join(directory, 'tests', name))], {
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
