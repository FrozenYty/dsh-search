/**
 * Entry tests: the registration the Host performs, and the translation of a provider failure into the
 * seam's error type.
 *
 * `index.js` imports `@deepseek-ai/dsh-web`, so these tests load the **real** seam — the same class the
 * Host hands a linked bundle, not a stand-in. That is the point of them: the registration and the
 * `WebError` construction are the entry's only logic, and nothing else in this repository executes it.
 *
 * The seam has to be resolvable for that. It is a declared peer the Host resolves at runtime; in a
 * working tree it comes from `npm install` (what CI runs for this file, and what the README's
 * development section says). When it cannot be resolved the tests **skip with that reason** rather than
 * fail, because the bundle itself installs nothing — but a skip here means the entry is unverified, so
 * `scripts/check.mjs` fails if CI stops installing it.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const FIXTURE = readFileSync(new URL('./fixtures/bing-deepseek-harness.html', import.meta.url), 'utf8')

/** The real seam, or the failure that says why it is not here. */
const seam = await import('@deepseek-ai/dsh-web').then((module) => module, (error) => error)
const entry = seam instanceof Error ? undefined : await import('../index.js')
const unavailable = seam instanceof Error
  ? `@deepseek-ai/dsh-web is not resolvable (${seam.code ?? seam.message}); run npm install to exercise the entry tests`
  : undefined
const skip = unavailable === undefined ? {} : { skip: unavailable }

/**
 * Run `apply` against a context that records what it registers.
 *
 * @returns {Array<object>} the providers the entry registered.
 */
function register() {
  const registered = []
  entry.apply({
    web: {
      registerSearchProvider(provider) {
        registered.push(provider)
        return () => {}
      },
    },
  })
  return registered
}

test('the entry registers exactly one usable provider under the frozen id', skip, () => {
  assert.equal(entry.name, 'dsh-search')
  assert.deepEqual(entry.inject, ['web'])
  const registered = register()
  assert.equal(registered.length, 1, 'apply registers one provider and no more')
  const [provider] = registered
  assert.equal(provider.id, 'bing-html', 'the id a profile pins (ADR 0003)')
  assert.equal(provider.available(), true, 'a keyless provider is always locally available')
  assert.equal(typeof provider.search, 'function')
  // The seam reads an absent `ready()` as ready. That is what keeps web_search offered on a route
  // whose credential-backed provider cannot authenticate, so it is asserted rather than assumed.
  assert.equal(provider.ready, undefined)
})

test('the registered provider searches through the request layer', skip, async () => {
  const [provider] = register()
  const requested = []
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    requested.push(String(url))
    return new Response(FIXTURE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
  try {
    const result = await provider.search({ query: 'deepseek harness' })
    assert.ok(result.sources.length >= 5, `expected the page's sources, got ${result.sources.length}`)
    assert.equal(result.truncated, false)
  } finally {
    globalThis.fetch = original
  }
  assert.equal(requested.length, 1)
  assert.equal(new URL(requested[0]).host, 'cn.bing.com')
})

test('a provider failure reaches the seam as a real WebError carrying its code', skip, async () => {
  const [provider] = register()
  await assert.rejects(
    () => provider.search({ query: '   ' }),
    (error) => {
      assert.ok(error instanceof seam.WebError, 'the failure is the seam\'s error type, not a lookalike')
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.equal(error.cause?.name, 'BingSearchError', 'the provider failure is kept as the cause')
      return true
    },
  )
})

test('a cancelled search carries WEB_ABORTED through the same translation', skip, async () => {
  const [provider] = register()
  await assert.rejects(
    () => provider.search({ query: 'deepseek harness' }, AbortSignal.abort('caller gave up')),
    (error) => error instanceof seam.WebError && error.code === 'WEB_ABORTED',
  )
})
