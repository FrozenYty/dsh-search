/**
 * Request-layer tests: what the provider sends, and what it does with an answer.
 *
 * `globalThis.fetch` is stubbed, never reached over the network, so these tests describe the request
 * this provider constructs — its URL, its single host, its redirect policy — and every failure branch a
 * saved page cannot show. The live run is the manual acceptance step; this is the part of it that can
 * run in CI.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { BingSearchError, BingSearchProvider, SEARCH_ENDPOINT } from '../bing.js'

const FIXTURE = readFileSync(new URL('./fixtures/bing-deepseek-harness.html', import.meta.url), 'utf8')

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

/** A stub recording every request, answering with an HTML body. */
function recordingFetch(body, init = {}) {
  const calls = []
  const stub = async (url, options) => {
    calls.push({ url, options })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init })
  }
  return { calls, stub }
}

test('one search is one GET against the endpoint, with the query encoded and no redirect followed', async () => {
  const { calls, stub } = recordingFetch(FIXTURE)
  await withFetch(stub, async () => {
    const result = await new BingSearchProvider().search({ query: 'deepseek harness', maxResults: 3 })
    assert.equal(result.truncated, false, 'the seam owns maxResults, so the provider never truncates')
    assert.ok(result.sources.length >= 5, `expected the page's sources, got ${result.sources.length}`)
  })
  assert.equal(calls.length, 1, 'exactly one request')
  const [call] = calls
  assert.equal(call.url, `${SEARCH_ENDPOINT}?q=deepseek+harness`)
  assert.equal(new URL(call.url).host, 'cn.bing.com')
  assert.equal(call.options.method, 'GET')
  assert.equal(call.options.redirect, 'manual', 'a redirect must never be followed')
  assert.match(call.options.headers['user-agent'], /^Mozilla\/5\.0/)
})

test('the query is trimmed, and an empty one never reaches the network', async () => {
  const { calls, stub } = recordingFetch(FIXTURE)
  await withFetch(stub, async () => {
    await new BingSearchProvider().search({ query: '  spaced query  ' })
    assert.equal(calls[0].url, `${SEARCH_ENDPOINT}?q=spaced+query`)
    await assert.rejects(
      () => new BingSearchProvider().search({ query: '   ' }),
      (error) => error instanceof BingSearchError && error.code === 'WEB_PROVIDER_ERROR',
    )
  })
  assert.equal(calls.length, 1, 'the empty query made no request')
})

test('a redirect is reported, not followed', async () => {
  const stub = async () => new Response('', {
    status: 302,
    headers: { location: 'https://www.bing.com/search?q=deepseek+harness' },
  })
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new BingSearchProvider().search({ query: 'deepseek harness' }),
      (error) => {
        assert.ok(error instanceof BingSearchError)
        assert.equal(error.code, 'WEB_PROVIDER_ERROR')
        assert.match(error.message, /HTTP 302/)
        assert.match(error.message, /https:\/\/www\.bing\.com\/search/)
        return true
      },
    )
  })
})

test('a non-2xx answer is a provider error naming the status', async () => {
  const stub = async () => new Response('server error', { status: 503 })
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new BingSearchProvider().search({ query: 'deepseek harness' }),
      (error) => error instanceof BingSearchError && error.code === 'WEB_PROVIDER_ERROR' && /HTTP 503/.test(error.message),
    )
  })
})

test('a 200 page with no result block fails loudly instead of answering with nothing', async () => {
  const stub = async () => new Response('<html><body><p>nothing here</p></body></html>', { status: 200 })
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new BingSearchProvider().search({ query: 'deepseek harness' }),
      (error) => error instanceof BingSearchError && /no parseable result block/.test(error.message),
    )
  })
})

test('a challenge page is named as a challenge, not as an empty result set', async () => {
  const stub = async () => new Response('<html><body><h1>Verify you are human</h1></body></html>', { status: 200 })
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new BingSearchProvider().search({ query: 'deepseek harness' }),
      (error) => error instanceof BingSearchError && /challenge page/.test(error.message),
    )
  })
})

test('a transport failure is a provider error carrying its cause', async () => {
  const failure = new TypeError('fetch failed')
  const stub = async () => {
    throw failure
  }
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new BingSearchProvider().search({ query: 'deepseek harness' }),
      (error) => error instanceof BingSearchError && error.code === 'WEB_PROVIDER_ERROR' && error.cause === failure,
    )
  })
})

test('an already-cancelled search is WEB_ABORTED and never dispatches', async () => {
  const { calls, stub } = recordingFetch(FIXTURE)
  await withFetch(stub, async () => {
    const preAborted = AbortSignal.abort('caller gave up')
    await assert.rejects(
      () => new BingSearchProvider().search({ query: 'deepseek harness' }, preAborted),
      (error) => error instanceof BingSearchError && error.code === 'WEB_ABORTED',
    )
    assert.equal(calls.length, 0, 'an already-cancelled search made no request')
  })
})

test('a cancellation during the request is WEB_ABORTED, not a transport failure', async () => {
  const controller = new AbortController()
  const stub = async () => {
    controller.abort()
    throw new DOMException('This operation was aborted', 'AbortError')
  }
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new BingSearchProvider().search({ query: 'deepseek harness' }, controller.signal),
      (error) => error instanceof BingSearchError && error.code === 'WEB_ABORTED',
    )
  })
})
