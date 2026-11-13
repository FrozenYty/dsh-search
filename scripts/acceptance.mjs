#!/usr/bin/env node
/**
 * The manual acceptance run: items 2 and 3 of `PLAN.md`, against the live endpoint.
 *
 * It is deliberately not part of CI — it needs the network, and a red CI job that means "Bing was slow"
 * is a gate people learn to ignore. What it does is the same thing `scripts/check.mjs` does offline, with
 * the real `fetch` underneath: it wraps the request layer, records every URL that leaves the process,
 * calls the provider's own search entry point, and prints the hosts and the parsed sources. It exits
 * non-zero when there are fewer than three sources, when a URL is not absolute https, or when a request
 * went to a host other than `cn.bing.com`.
 *
 * Usage: node scripts/acceptance.mjs [query]
 */

import { BingSearchProvider, SEARCH_ENDPOINT } from '../bing.js'

const query = process.argv[2] ?? 'deepseek harness'
const requested = []
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  requested.push(String(url))
  return realFetch(url, init)
}

const problems = []
let result
try {
  result = await new BingSearchProvider().search({ query })
} catch (error) {
  console.error(`the search threw: ${error.name}: ${error.message}`)
  process.exit(1)
}

console.log(`query: ${query}`)
console.log(`endpoint constant: ${SEARCH_ENDPOINT}`)
console.log(`requests recorded at the request layer: ${requested.length}`)
for (const url of requested) {
  let host = '(not an absolute URL)'
  try {
    host = new URL(url).host
  } catch {
    problems.push(`request layer: ${url} is not an absolute URL`)
  }
  console.log(`  ${host}  ${url}`)
}
const hosts = [...new Set(requested.map((url) => {
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}))]
console.log(`hosts: ${hosts.join(', ')}`)

console.log(`sources: ${result.sources.length}`)
for (const source of result.sources) {
  console.log(`  ${source.url}`)
  console.log(`    title: ${source.title}`)
  console.log(`    snippet: ${source.snippet ?? '(none)'}`)
}

if (requested.length === 0) problems.push('request layer: no request was made, so the host assertions prove nothing')
if (hosts.length !== 1 || hosts[0] !== 'cn.bing.com') {
  problems.push(`request layer: the only host may be cn.bing.com; the run used ${hosts.join(', ') || '(none)'}`)
}
for (const forbidden of ['www.bing.com', 'api.deepseek.com']) {
  if (hosts.includes(forbidden)) problems.push(`request layer: a request went to ${forbidden} (acceptance item 3)`)
}
if (result.sources.length < 3) problems.push(`acceptance item 2: ${result.sources.length} sources, expected at least 3`)
for (const source of result.sources) {
  if (!source.url.startsWith('https://')) problems.push(`acceptance item 2: ${source.url} is not absolute https`)
}

if (problems.length > 0) {
  console.error('acceptance failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('acceptance 2 and 3 passed')
