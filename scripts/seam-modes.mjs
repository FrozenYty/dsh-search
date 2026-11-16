#!/usr/bin/env node
/**
 * Drive the **real** seam runtime through every provider mode this bundle offers.
 *
 * The unit tests call `apply()` with a hand-made context, which is right for the entry's own logic but says
 * nothing about the seam's behaviour: which provider a pin selects, whether `official` really avoids the
 * keyless request, whether `auto` remembers a failed account. This script builds the seam's own
 * `WebRuntime`, registers the bundle through it, and asks it to search — so the selection path the Host runs
 * is the code under test.
 *
 * Offline on purpose: the keyless search reads a saved result page, and the shipped provider is a stub. That
 * makes it a check a person can run anywhere, and it is not a CI step because it stubs the Cordis context
 * members the seam touches (`effect`, `provide`, `reflect.provide`) — a test written against those stubs
 * would fail for the wrong reason the day the seam grows another one.
 *
 *   node scripts/seam-modes.mjs
 *
 * Exit code 1 means one of the four expectations below did not hold.
 */
import { readFileSync } from 'node:fs'

const repo = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, repo), 'utf8')

const seam = await import('@deepseek-ai/dsh-web')
const entry = await import(new URL('index.js', repo).href)
const fixture = read('tests/fixtures/bing-deepseek-harness.html')

/**
 * The Cordis context members the seam's own code touches. `effect(generator)` runs an effect up to its first
 * yield — where `registerProvider` inserts the provider into the runtime's map — and returns a disposer.
 */
function effect(generator) {
  generator().next()
  return () => {}
}

/** A context just complete enough for the seam's `Service` base and its registration. */
const seamContext = (config) => new seam.WebRuntime({ reflect: { provide() {} }, provide() {}, effect }, config)

const failures = []
const expect = (name, condition, detail) => {
  if (condition) {
    console.log(`ok    ${name}${detail === undefined ? '' : ` — ${detail}`}`)
    return
  }
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  failures.push(name)
}

const bingRequests = []
globalThis.fetch = async (url) => {
  bingRequests.push(String(url))
  return new Response(fixture, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

const shipped = (search) => ({ id: 'deepseek-official', available: () => true, search })

// 1. The pin is what chooses. `searchProvider: bing-html` must route the real seam to this bundle.
let web = seamContext({ searchProvider: 'bing-html', fetchProvider: 'article' })
entry.apply({ web }, { provider: 'keyless' })
let result = await web.search({ query: 'deepseek harness', maxResults: 3 })
expect('a pinned id is the provider the seam selects', result.sources.length === 3 && bingRequests.length === 1,
  `${result.sources.length} source(s), one request`)
expect('the seam enforces the result bound', result.sources.length <= 3)

// 2. `provider: official` serves through the shipped provider and never touches the endpoint.
bingRequests.length = 0
web = seamContext({ searchProvider: 'bing-html', fetchProvider: 'article' })
web.registerSearchProvider(shipped(async () => ({ sources: [{ url: 'https://shipped.example/', title: 'shipped' }], truncated: false })))
entry.apply({ web }, { provider: 'official' })
result = await web.search({ query: 'anything', maxResults: 3 })
expect('official serves through the shipped provider', result.sources[0]?.title === 'shipped', `first: ${result.sources[0]?.title}`)
expect('official sends no keyless request', bingRequests.length === 0, `${bingRequests.length} request(s)`)

// 3. `provider: auto` falls back to keyless when the account cannot answer, and does not ask it twice.
bingRequests.length = 0
let accountAsked = 0
web = seamContext({ searchProvider: 'bing-html', fetchProvider: 'article' })
web.registerSearchProvider(shipped(async () => {
  accountAsked += 1
  throw Object.assign(new Error('DeepSeek API error (HTTP 402)'), { code: 'WEB_PROVIDER_ERROR' })
}))
entry.apply({ web }, { provider: 'auto' })
const first = await web.search({ query: 'deepseek harness', maxResults: 3 })
await web.search({ query: 'deepseek harness', maxResults: 3 })
expect('auto falls back to the keyless provider', first.sources.length === 3, `${first.sources.length} source(s)`)
expect('auto remembers a failed account instead of paying twice', accountAsked === 1, `asked ${accountAsked} time(s) over two searches`)

// 4. `provider: official` with nothing registered is a refusal, not a silent fallback.
web = seamContext({ searchProvider: 'bing-html', fetchProvider: 'article' })
entry.apply({ web }, { provider: 'official' })
let refused
try {
  await web.search({ query: 'anything', maxResults: 3 })
} catch (error) {
  refused = error
}
expect('official with no shipped provider refuses by the seam\'s code', refused?.code === 'WEB_PROVIDER_CONFIGURED_MISSING',
  refused === undefined ? 'it searched instead' : `${refused.code}: ${refused.message.slice(0, 60)}`)

if (failures.length > 0) {
  console.error(`seam modes: ${failures.length} expectation(s) failed`)
  process.exit(1)
}
console.log('seam modes: every expectation held')
