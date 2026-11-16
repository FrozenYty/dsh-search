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
const NO_RESULTS_PAGE = readFileSync(new URL('./fixtures/bing-no-results.html', import.meta.url), 'utf8')

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

test('a status that is not ok is explained as one, without blaming the redirect policy', async () => {
  // The message used to say "this provider follows no redirect, so the response body was not parsed" for
  // every non-2xx, which is false for a 429 or a 500. Only a 3xx carrying a Location is a redirect story.
  for (const [status, location] of [[429, undefined], [503, 'https://elsewhere.example/']]) {
    const stub = async () => new Response('not ok', {
      status,
      ...(location === undefined ? {} : { headers: { location } }),
    })
    await withFetch(stub, async () => {
      await assert.rejects(
        () => new BingSearchProvider().search({ query: 'deepseek harness' }),
        (error) => {
          assert.ok(error instanceof BingSearchError)
          assert.equal(error.code, 'WEB_PROVIDER_ERROR')
          assert.match(error.message, new RegExp(`HTTP ${status}`), 'the status is stated')
          assert.match(error.message, /not ok/, 'the answer is named as not ok')
          assert.doesNotMatch(error.message, /redirect/i, `HTTP ${status} is not a redirect problem`)
          return true
        },
      )
    })
  }
})

test('a 3xx without a Location is a not-ok answer, not a redirect to name', async () => {
  const stub = async () => new Response('', { status: 302 })
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new BingSearchProvider().search({ query: 'deepseek harness' }),
      (error) => error instanceof BingSearchError
        && /HTTP 302/.test(error.message)
        && /not ok/.test(error.message)
        && !/redirect/i.test(error.message),
    )
  })
})

test("Bing's own no-results page is a legal empty answer, not a failure", async () => {
  // Why this matters beyond the message: the tool aborts every query in one call on the first provider
  // failure, so a throwing empty page would lose the sources the other three queries in the batch found.
  // The page states its own emptiness in `<li class="b_no">`; the fixture is that page, captured real.
  const stub = async () => new Response(NO_RESULTS_PAGE, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
  await withFetch(stub, async () => {
    const result = await new BingSearchProvider().search({ query: 'asdkjhqweoiuzxcvbnm' })
    assert.deepEqual(result, { sources: [], truncated: false }, 'empty is a result when the page says so')
  })
})

test('a page that only looks like results still fails loudly instead of answering with nothing', async () => {
  // The other arm: a page with no b_algo and no b_no is drift, and silence there would report a broken
  // parser as "this query has no results".
  const stub = async () => new Response('<html><body><p>nothing here</p></body></html>', { status: 200 })
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new BingSearchProvider().search({ query: 'deepseek harness' }),
      (error) => error instanceof BingSearchError
        && error.code === 'WEB_PROVIDER_ERROR'
        && /no parseable result block/.test(error.message)
        && /shape may have changed/.test(error.message),
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

test('the body is decoded with the charset the response declares', async () => {
  // 中文 / 内容 in GBK, which is not UTF-8 and would arrive as replacement characters if the header were
  // ignored. The markup around them is ASCII, so the only non-ASCII bytes are the ones under test.
  const body = Buffer.concat([
    Buffer.from('<li class="b_algo"><h2><a href="https://example.com/zh">'),
    Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
    Buffer.from('</a></h2><p class="b_lineclamp">'),
    Buffer.from([0xc4, 0xda, 0xc8, 0xdd]),
    Buffer.from('</p></li>'),
  ])
  const stub = async () => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=gbk' } })
  await withFetch(stub, async () => {
    const result = await new BingSearchProvider().search({ query: 'gbk page' })
    assert.equal(result.sources.length, 1)
    assert.equal(result.sources[0].title, '中文')
    assert.equal(result.sources[0].snippet, '内容')
  })
})

test('an unusable charset label falls back to UTF-8 rather than losing the search', async () => {
  const stub = async () => new Response(FIXTURE, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=not-a-charset' },
  })
  await withFetch(stub, async () => {
    const result = await new BingSearchProvider().search({ query: 'deepseek harness' })
    assert.ok(result.sources.length >= 5, 'a header typo is not a reason to lose the result set')
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
