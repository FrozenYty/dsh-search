/**
 * Routing tests: which provider serves a search, for each value of the row's `provider` field.
 *
 * These load the real seam (`@deepseek-ai/dsh-web`) the way `tests/entry.test.mjs` does, and supply a
 * stand-in for the *shipped* provider — the point here is this bundle's routing, not DeepSeek's search.
 * The same skip applies: without the seam resolvable these tests skip rather than fail, and
 * `scripts/check.mjs` refuses a CI workflow that stops installing it.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

const FIXTURE = new URL('./fixtures/bing-deepseek-harness.html', import.meta.url)
const seam = await import('@deepseek-ai/dsh-web').then((module) => module, (error) => error)
const unavailable = seam instanceof Error
  ? `@deepseek-ai/dsh-web is not resolvable (${seam.code ?? seam.message}); run npm install to exercise the routing tests`
  : undefined
const skip = unavailable === undefined ? {} : { skip: unavailable }
const entry = seam instanceof Error ? undefined : await import('../index.js')

/** A shipped-provider stand-in that records its calls. */
function officialStub(options = {}) {
  const calls = []
  const provider = {
    id: 'deepseek-official',
    available: () => options.available ?? true,
    calls,
    async search(request, signal) {
      calls.push(request.query)
      if (options.throws !== undefined) throw options.throws
      return { sources: [{ url: 'https://official.example/one', title: 'From the account' }], truncated: false }
    },
  }
  return provider
}

/** Apply the entry with a config and a stand-in shipped provider, and return the registered provider. */
function register(config, official) {
  const registered = []
  const searchProviders = new Map([[official.id, official]])
  entry.apply({
    web: {
      searchProviders,
      registerSearchProvider(provider) {
        registered.push(provider)
        return () => {}
      },
      // The entry registers the fetch half too; these tests are about which provider serves a search.
      registerFetchProvider() {
        return () => {}
      },
    },
  }, config)
  const searches = registered.filter((provider) => provider.id === 'bing-html')
  assert.equal(searches.length, 1, 'apply registers exactly one search provider')
  return searches[0]
}

/**
 * Apply the entry against one fake web registry, and return the registered search provider.
 *
 * The seam's registry changed shape inside this bundle's peer range: 0.2.2-rc.3 answers registration
 * through `listProviders()` and keeps `searchProviders` private in its typings. A fake is how each shape
 * is exercised without the real class, which cannot be several versions at once.
 *
 * @param {object} web - the registry fields and methods this fake seam exposes.
 * @param {{provider?: string}} [config] - this bundle's row config.
 * @returns {object} the registered search provider.
 */
function registerWith(web, config) {
  const registered = []
  entry.apply({
    web: {
      ...web,
      registerSearchProvider(provider) {
        registered.push(provider)
        return () => {}
      },
      registerFetchProvider() {
        return () => {}
      },
    },
  }, config)
  const searches = registered.filter((provider) => provider.id === 'bing-html')
  assert.equal(searches.length, 1, 'apply registers exactly one search provider')
  return searches[0]
}

/** Stub `fetch` with one body, and count the requests the keyless path makes. */
async function withFetch(body, run) {
  const requested = []
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    requested.push(String(url))
    return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
  try {
    return { result: await run(), requested }
  } finally {
    globalThis.fetch = original
  }
}

test('the default mode is keyless: no account is consulted, and one request goes to Bing', skip, async () => {
  const official = officialStub()
  const provider = register(undefined, official)
  const page = await (await import('node:fs')).readFileSync(FIXTURE, 'utf8')
  const { result, requested } = await withFetch(page, () => provider.search({ query: 'deepseek harness' }))
  assert.ok(result.sources.length >= 5)
  assert.deepEqual(official.calls, [], 'the shipped provider is not called in keyless mode')
  assert.equal(requested.length, 1)
  assert.equal(new URL(requested[0]).host, 'cn.bing.com')
})

test('an unknown mode string falls back to keyless rather than refusing to search', skip, async () => {
  const official = officialStub()
  const provider = register({ provider: 'whatever-this-is' }, official)
  const page = (await import('node:fs')).readFileSync(FIXTURE, 'utf8')
  const { result } = await withFetch(page, () => provider.search({ query: 'deepseek harness' }))
  assert.ok(result.sources.length >= 5)
  assert.deepEqual(official.calls, [])
})

test('provider: official serves the search through the shipped provider', skip, async () => {
  const official = officialStub()
  const provider = register({ provider: 'official' }, official)
  const { result, requested } = await withFetch('', () => provider.search({ query: 'deepseek harness' }))
  assert.deepEqual(official.calls, ['deepseek harness'])
  assert.deepEqual(result.sources, [{ url: 'https://official.example/one', title: 'From the account' }])
  assert.deepEqual(requested, [], 'nothing is fetched from Bing when the account serves the search')
})

test('provider: official says which provider this profile missed, by the seam\'s code', skip, async () => {
  // Not registered at all.
  const registered = []
  entry.apply({ web: { searchProviders: new Map(), registerSearchProvider: (provider) => registered.push(provider), registerFetchProvider: () => () => {} } }, { provider: 'official' })
  await assert.rejects(
    () => registered[0].search({ query: 'x' }),
    (error) => error instanceof seam.WebError && error.code === 'WEB_PROVIDER_CONFIGURED_MISSING',
  )
  // Registered, and its own synchronous self-report says it cannot run. That report is all this bundle can
  // see: a dead credential or an empty balance is decided by the provider when it actually searches
  // (docs/adr/0014-the-official-mode-can-only-detect-presence.md).
  const unavailableOfficial = register({ provider: 'official' }, officialStub({ available: false }))
  await assert.rejects(
    () => unavailableOfficial.search({ query: 'x' }),
    (error) => error instanceof seam.WebError && error.code === 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE',
  )
})

test('official reads registration from a seam that lists providers, and still calls the listed one', skip, async () => {
  // The 0.2.2-rc.3 shape: `listProviders()` is public and returns `{ id, title, description }` entries,
  // while the provider object itself is still in the runtime map the typings mark private.
  const official = officialStub()
  const provider = registerWith({
    listProviders: () => ({ search: [{ id: 'deepseek-official', title: 'DeepSeek' }], fetch: [] }),
    searchProviders: new Map([[official.id, official]]),
  }, { provider: 'official' })
  const { result, requested } = await withFetch('', () => provider.search({ query: 'deepseek harness' }))
  assert.deepEqual(official.calls, ['deepseek harness'])
  assert.deepEqual(result.sources, [{ url: 'https://official.example/one', title: 'From the account' }])
  assert.deepEqual(requested, [], 'the listed account served the search')
})

test('an id the seam only lists as absent is "not registered", not "no registry"', skip, async () => {
  // The listing is authoritative: with `listProviders()` present and the id absent, the answer is the
  // provider-missing failure even when the map is gone entirely. Reading the map first would say
  // "no provider registry" here, which is the wrong diagnosis.
  const provider = registerWith({
    listProviders: () => ({ search: [{ id: 'some-other-provider' }], fetch: [] }),
  }, { provider: 'official' })
  await assert.rejects(
    () => provider.search({ query: 'x' }),
    (error) => error instanceof seam.WebError
      && error.code === 'WEB_PROVIDER_CONFIGURED_MISSING'
      && /is not registered/.test(error.message)
      && !/no provider registry/.test(error.message),
  )
})

test('a seam with no provider registry says so, rather than calling the provider missing', skip, async () => {
  const provider = registerWith({}, { provider: 'official' })
  await assert.rejects(
    () => provider.search({ query: 'x' }),
    (error) => error instanceof seam.WebError
      && error.code === 'WEB_PROVIDER_CONFIGURED_MISSING'
      && /no provider registry/.test(error.message)
      && !/is not registered/.test(error.message),
  )
})

test('a seam that lists the provider but hands over no object says it cannot reach one', skip, async () => {
  // `listProviders()` returns picker entries, not providers. If a future seam also removes the runtime
  // map, this bundle has nothing to call — and says that, instead of the provider being "not registered".
  const provider = registerWith({
    listProviders: () => ({ search: [{ id: 'deepseek-official' }], fetch: [] }),
  }, { provider: 'official' })
  await assert.rejects(
    () => provider.search({ query: 'x' }),
    (error) => error instanceof seam.WebError
      && error.code === 'WEB_PROVIDER_CONFIGURED_MISSING'
      && /no provider registry a provider can be reached through/.test(error.message),
  )
})

test('auto prefers the account and remembers a failure instead of paying for it twice', skip, async () => {
  const official = officialStub({ throws: new seam.WebError('HTTP 402', 'WEB_PROVIDER_ERROR') })
  const provider = register({ provider: 'auto' }, official)
  const page = (await import('node:fs')).readFileSync(FIXTURE, 'utf8')
  const first = await withFetch(page, () => provider.search({ query: 'deepseek harness' }))
  assert.ok(first.result.sources.length >= 5, 'the first search falls back to Bing')
  assert.equal(official.calls.length, 1, 'the account was tried once')
  const second = await withFetch(page, () => provider.search({ query: 'deepseek harness' }))
  assert.ok(second.result.sources.length >= 5)
  assert.equal(official.calls.length, 1, 'the account is not tried again in this process')
})

test('auto lets the account serve the search when it can', skip, async () => {
  const official = officialStub()
  const provider = register({ provider: 'auto' }, official)
  const { result, requested } = await withFetch('', () => provider.search({ query: 'deepseek harness' }))
  assert.deepEqual(result.sources, [{ url: 'https://official.example/one', title: 'From the account' }])
  assert.deepEqual(requested, [])
})

test('auto with no shipped provider at all searches keyless and does not fail', skip, async () => {
  const registered = []
  entry.apply({ web: { searchProviders: new Map(), registerSearchProvider: (provider) => registered.push(provider), registerFetchProvider: () => () => {} } }, { provider: 'auto' })
  const page = (await import('node:fs')).readFileSync(FIXTURE, 'utf8')
  const { result } = await withFetch(page, () => registered[0].search({ query: 'deepseek harness' }))
  assert.ok(result.sources.length >= 5)
})
