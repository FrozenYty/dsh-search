/**
 * The reuse window: a page parsed minutes ago answers the same question again, and a failure never does.
 *
 * The clock is injected rather than slept through, so the boundary is exercised in microseconds and the
 * test says what it means. What these tests protect is a request count, not a latency: the number of
 * requests is the one resource that can get this client challenged (docs/adr/0008-reusing-a-recent-page.md).
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { BingSearchProvider } from '../bing.js'

const FIXTURE = readFileSync(new URL('./fixtures/bing-deepseek-harness.html', import.meta.url), 'utf8')

/** How long the provider reuses a page; the tests move the clock past it rather than waiting. */
const WINDOW_MS = 5 * 60 * 1000

/**
 * Run one body with `globalThis.fetch` replaced, restoring it afterwards.
 *
 * @param {(url: string, init: object) => Promise<Response> | Response} stub - the replacement.
 * @param {() => Promise<void>} body - what to run while it is installed.
 */
async function withFetch(stub, body) {
  const original = globalThis.fetch
  globalThis.fetch = stub
  try {
    await body()
  } finally {
    globalThis.fetch = original
  }
}

/**
 * A stub that records every request, answering with the saved page.
 *
 * @param {() => Response} [answer] - what to answer with; the saved page by default.
 * @returns {{calls: Array<object>, stub: (url: string, init: object) => Promise<Response>}} the recorder.
 */
function recordingFetch(answer) {
  const calls = []
  const stub = async (url, options) => {
    calls.push({ url, options })
    return answer === undefined
      ? new Response(FIXTURE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      : answer()
  }
  return { calls, stub }
}

/** A provider whose clock this test controls. */
function providerAt(clock) {
  return new BingSearchProvider({ now: () => clock.at })
}

test('the same query inside the window is one request, and the same sources', async () => {
  const clock = { at: 1_000 }
  const { calls, stub } = recordingFetch()
  const provider = providerAt(clock)
  await withFetch(stub, async () => {
    const first = await provider.search({ query: 'deepseek harness' })
    clock.at += WINDOW_MS - 1
    const second = await provider.search({ query: 'deepseek harness' })
    assert.equal(calls.length, 1, 'the second search was answered from the reused page')
    assert.deepEqual(second, first, 'a reuse returns what the first search returned')
  })
})

test('the window closes: one millisecond past it, the query asks again', async () => {
  const clock = { at: 1_000 }
  const { calls, stub } = recordingFetch()
  const provider = providerAt(clock)
  await withFetch(stub, async () => {
    await provider.search({ query: 'deepseek harness' })
    clock.at += WINDOW_MS
    await provider.search({ query: 'deepseek harness' })
    assert.equal(calls.length, 2, 'an aged-out page is fetched again')
  })
})

test('a different query is a different entry, and its own request', async () => {
  const { calls, stub } = recordingFetch()
  const provider = providerAt({ at: 1_000 })
  await withFetch(stub, async () => {
    await provider.search({ query: 'deepseek harness' })
    await provider.search({ query: 'deepseek harness plugin' })
    await provider.search({ query: ' deepseek harness ' })
    assert.equal(calls.length, 2, 'the trimmed query is the key, so the pad is the same entry')
  })
})

test('a failure is never reused: the page that failed is asked for again', async () => {
  const clock = { at: 1_000 }
  let answer = () => new Response('<html><body>Verify you are human</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
  const { calls, stub } = recordingFetch(() => answer())
  const provider = providerAt(clock)
  await withFetch(stub, async () => {
    await assert.rejects(() => provider.search({ query: 'deepseek harness' }), /challenge page/)
    answer = () => new Response(FIXTURE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    const result = await provider.search({ query: 'deepseek harness' })
    assert.equal(calls.length, 2, 'a challenge page must be retried, not remembered')
    assert.ok(result.sources.length >= 5)
  })
})

test('the newest entries survive the bound and the oldest do not', async () => {
  const { calls, stub } = recordingFetch()
  const provider = providerAt({ at: 1_000 })
  await withFetch(stub, async () => {
    for (let index = 0; index < 33; index += 1) await provider.search({ query: `query ${index}` })
    assert.equal(calls.length, 33)
    // The 33rd is still in the window, the 1st was dropped to make room for it.
    await provider.search({ query: 'query 32' })
    await provider.search({ query: 'query 0' })
    assert.equal(calls.length, 34, 'only the evicted entry went back to the network')
  })
})

test('a caller cannot edit the reused page through either result it was given', async () => {
  const { calls, stub } = recordingFetch()
  const provider = providerAt({ at: 1_000 })
  await withFetch(stub, async () => {
    // Phase one: the object the network path returned. A cache that stored that object would now be
    // holding the caller's edits.
    const first = await provider.search({ query: 'deepseek harness' })
    const expected = first.sources[0].url
    first.sources.length = 1
    first.sources[0].url = 'https://edited.example/'
    const second = await provider.search({ query: 'deepseek harness' })
    assert.equal(calls.length, 1)
    assert.ok(second.sources.length >= 5, 'the caller truncated its own copy, not the cache')
    assert.equal(second.sources[0].url, expected)

    // Phase two: the object the reuse path returned. A cache that handed out its own entry would now be
    // holding these edits instead.
    second.sources.length = 0
    const third = await provider.search({ query: 'deepseek harness' })
    assert.equal(calls.length, 1)
    assert.ok(third.sources.length >= 5, 'a reused page is a copy, not the cache itself')
    assert.equal(third.sources[0].url, expected)
  })
})
