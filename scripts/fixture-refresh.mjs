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
 * A regression is a page that now parses to fewer sources than the stored fixture, or one whose parse
 * throws at all. A page that parses to *more* is reported but not a failure.
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

/** The pages under tests/fixtures, with the query each was captured for. */
const CAPTURES = [
  { file: 'bing-deepseek-harness.html', query: 'deepseek harness' },
  { file: 'bing-node-fetch-redirect.html', query: 'node fetch redirect manual' },
  { file: 'bing-dated-snippets.html', query: 'DeepSeek Harness 插件' },
]

const realFetch = globalThis.fetch
let captured
globalThis.fetch = async (url, init) => {
  const requested = String(url)
  const target = via === undefined ? requested : requested.replace(new URL(requested).host, via)
  const response = await realFetch(target, init)
  captured = await response.clone().text()
  return response
}

const problems = []
console.log(
  via === undefined
    ? 'endpoint: the provider\'s own request, one per fixture'
    : `endpoint: the provider's own request, rewritten in transit to ${via}, one per fixture`,
)
for (const capture of CAPTURES) {
  const stored = readFileSync(join(fixtures, capture.file), 'utf8')
  const before = parseBingHtml(stored).length
  captured = undefined
  let after
  let fetched
  try {
    const result = await new BingSearchProvider().search({ query: capture.query })
    after = result.sources.length
    fetched = captured
  } catch (error) {
    problems.push(`${capture.file}: the live search threw ${error.name}: ${error.message}`)
    console.log(`  ${capture.file}\n    query: ${capture.query}\n    live: FAILED — ${error.message}`)
    continue
  }
  const dated = parseBingHtml(fetched).filter((source) => source.publishedAt !== undefined).length
  if (fetched === undefined) problems.push(`${capture.file}: no response body was captured`)
  console.log(`  ${capture.file}`)
  console.log(`    query: ${capture.query}`)
  console.log(`    stored fixture: ${before} sources | live page: ${after} sources, ${dated} with a date`)
  if (after < before) problems.push(`${capture.file}: the live page parses to ${after} sources, the stored one to ${before}`)
  if (shouldWrite && fetched !== undefined) {
    writeFileSync(join(fixtures, capture.file), fetched)
    console.log(`    written over the stored fixture`)
  }
}

if (shouldWrite) {
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

if (problems.length > 0) {
  console.error('fixture refresh found a regression:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('Re-run with --write once you have read the page and know the parser is right.')
  process.exit(1)
}
console.log(shouldWrite ? 'fixtures refreshed' : 'every fixture still parses to at least what it held')
