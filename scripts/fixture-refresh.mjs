#!/usr/bin/env node
/**
 * The drift tool: re-fetch the pages the fixtures came from, through the provider's own request, and say
 * whether the parser still reads them.
 *
 * It exists because the alternative is a four-step ritual someone has to remember: build a request by
 * hand, save the body, keep the headers identical, and remember which query each fixture came from. The
 * request here is the provider's own — `globalThis.fetch` is wrapped so the real response body is captured
 * while the provider does its normal work — so the headers cannot drift from the ones the bundle sends.
 *
 * Refreshing a fixture is a deliberate act, never an automatic repair:
 *
 *   node scripts/fixture-refresh.mjs            compare only (the default); exits non-zero on a regression
 *   node scripts/fixture-refresh.mjs --write    overwrite the fixtures with what the endpoint serves now
 *   node scripts/fixture-refresh.mjs --via www.bing.com
 *                                               ask a different Bing host for the same query
 *
 * `--via` exists for one machine: GitHub's runners sit outside the endpoint's region, and `cn.bing.com`
 * answers them `301 → https://www.bing.com/?q=…` (measured on a dispatched run), which the provider refuses
 * by design (ADR 0001). It rewrites the request host *in transit, inside this script* — the provider's
 * endpoint stays a constant — so a scheduled job can still exercise the parser against Bing's markup. What
 * `--via` cannot check is the CN endpoint itself; that is what a local run, the default, does.
 *
 * The two modes therefore ask different questions, and the criteria differ with them. The default asks "is
 * the page we saved still the page we get?" and fails on a count that dropped. `--via` asks "does the parser
 * still find results at all?" — another region serves a different, often smaller, set for the same query
 * (measured: 10 / 7 / 8 sources from `www.bing.com` against 10 / 10 / 10 here), so it fails only under a
 * structural floor rather than on a count that was never comparable.
 *
 * A `--via` run answered by a redirect is neither a regression nor a check. The flag exists for one
 * direction (`cn → www` on a runner); a network where the answer comes back the other way gets the rewrite
 * redirected and the provider refuses it by design (ADR 0001), which says nothing about the parser. Those
 * fixtures are counted apart from a page that parsed too few, so the verdict names what actually happened
 * instead of blaming the parse for a routing direction.
 *
 * A regression is a page that now parses to fewer sources than the stored fixture (default mode), one that
 * parses under the floor (`--via`), or one whose parse throws at all. A page that parses to *more* is
 * reported but not a failure.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BingSearchProvider, parseBingHtml } from '../bing.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = join(root, 'tests', 'fixtures')
const shouldWrite = process.argv.includes('--write')
const viaIndex = process.argv.indexOf('--via')
const via = viaIndex === -1 ? undefined : process.argv[viaIndex + 1]
/** How much of a page the parser must still read when the host is not the one the fixtures came from. */
const STRUCTURAL_FLOOR = 5

/** The pages under tests/fixtures, with the query each was captured for. */
const CAPTURES = [
  { file: 'bing-deepseek-harness.html', query: 'deepseek harness' },
  { file: 'bing-node-fetch-redirect.html', query: 'node fetch redirect manual' },
  { file: 'bing-dated-snippets.html', query: 'DeepSeek Harness 插件' },
]

const realFetch = globalThis.fetch
let captured
/** The redirect a request was answered with, when it was answered with one: `{ status, location }`. */
let redirect
globalThis.fetch = async (url, init) => {
  const requested = String(url)
  const target = via === undefined ? requested : requested.replace(new URL(requested).host, via)
  const response = await realFetch(target, init)
  captured = await response.clone().text()
  redirect = response.status >= 300 && response.status < 400
    ? { status: response.status, location: response.headers.get('location') ?? 'a location it did not name' }
    : undefined
  return response
}

const problems = []
const unchecked = []
/** Captured pages, held until every fixture has been captured: `--write` is all or nothing. */
const refreshed = []
let enough = 0
console.log(
  via === undefined
    ? 'endpoint: the provider\'s own request, one per fixture'
    : `endpoint: the provider's own request, rewritten in transit to ${via}, one per fixture`,
)
for (const capture of CAPTURES) {
  const stored = readFileSync(join(fixtures, capture.file), 'utf8')
  const before = parseBingHtml(stored).length
  captured = undefined
  redirect = undefined
  let after
  let fetched
  try {
    const result = await new BingSearchProvider().search({ query: capture.query })
    after = result.sources.length
    fetched = captured
  } catch (error) {
    if (via !== undefined && redirect !== undefined) {
      unchecked.push(capture.file)
      console.log(`  ${capture.file}`)
      console.log(`    query: ${capture.query}`)
      console.log(
        `    live: NOT CHECKED — the rewrite to ${via} was answered with HTTP ${redirect.status} → `
        + `${redirect.location}, and this provider follows no redirect by design (ADR 0001).`,
      )
      console.log(
        '    instead: run again without --via — where the rewrite is redirected back to the endpoint, '
        + 'the plain run is the one that checks the parser.',
      )
      continue
    }
    problems.push(`${capture.file}: the live search threw ${error.name}: ${error.message}`)
    console.log(`  ${capture.file}\n    query: ${capture.query}\n    live: FAILED — ${error.message}`)
    continue
  }
  const dated = parseBingHtml(fetched).filter((source) => source.publishedAt !== undefined).length
  if (fetched === undefined) problems.push(`${capture.file}: no response body was captured`)
  console.log(`  ${capture.file}`)
  console.log(`    query: ${capture.query}`)
  console.log(`    stored fixture: ${before} sources | live page: ${after} sources, ${dated} with a date`)
  let shortfall = ''
  if (via === undefined) {
    if (after < before) {
      shortfall = `${capture.file}: the live page parses to ${after} sources, the stored one to ${before}`
    }
  } else if (after < STRUCTURAL_FLOOR) {
    shortfall = `${capture.file}: ${after} sources from ${via} is under the structural floor of `
      + `${STRUCTURAL_FLOOR}; the parser, not the region, is the suspect`
  }
  if (shortfall === '') enough += 1
  else problems.push(shortfall)
  if (shouldWrite && fetched !== undefined) refreshed.push([capture.file, fetched])
}

if (shouldWrite) {
  // A capture date is a claim that a real page was captured on that day, so it is written only when this run
  // captured every fixture and found nothing wrong. A `--via` run whose rewrite was redirected captured
  // nothing at all; re-dating `sources.md` there would record evidence that does not exist, which is the one
  // mistake this repository's fixtures exist to prevent.
  if (problems.length > 0 || unchecked.length > 0) {
    console.error('refusing to write: this run did not capture and check every fixture, so nothing was changed')
    for (const problem of problems) console.error(`  - ${problem}`)
    for (const skipped of unchecked) console.error(`  - ${skipped}`)
    process.exit(1)
  }
  // Held-back pages are written now, together with the table, so a run that could not capture everything
  // leaves no fixture newer than the provenance that describes it.
  for (const [file, html] of refreshed) {
    writeFileSync(join(fixtures, file), html)
    console.log(`  ${file}: written over the stored fixture`)
  }
  const today = new Date().toISOString().slice(0, 10)
  const path = join(fixtures, 'sources.md')
  let table = readFileSync(path, 'utf8')
  for (const capture of CAPTURES) {
    const row = new RegExp(`(^\\| \`${capture.file.replace('.', '\\.')}\` \\|[^|]*\\| )\\d{4}-\\d{2}-\\d{2}`, 'm')
    if (!row.test(table)) {
      console.warn(`sources.md: no row to date for ${capture.file}`)
      continue
    }
    table = table.replace(row, `$1${today}`)
  }
  writeFileSync(path, table)
  console.log(`sources.md: capture dates set to ${today}`)
}

if (!shouldWrite) {
  if (via === undefined) {
    if (problems.length === 0) console.log('every fixture still parses to at least what it held')
  } else {
    console.log(`fixture refresh via ${via}: ${enough} parsed enough, ${problems.length} parsed too few or failed, `
      + `${unchecked.length} could not be checked because the rewrite was redirected`)
  }
}
if (problems.length > 0) {
  console.error('fixture refresh found a regression:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('Re-run with --write once you have read the page and know the parser is right.')
  process.exit(1)
}
if (shouldWrite) console.log('fixtures refreshed')
