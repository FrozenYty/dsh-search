/**
 * The fetch half: what reaches the model when it fetches a page.
 *
 * The extraction tests run on three saved pages (`tests/fixtures/sources.md` records where each came from),
 * and they assert structure rather than exact prose: chrome gone, markup gone, the page's own sentences kept,
 * the cap marked. The request tests stub `fetch`, so the redirect policy, the non-2xx outcome and the byte
 * bound are all exercised without the network.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { ArticleFetchError, ArticleFetchProvider, MAX_CHARS, extractArticle } from '../article.js'
import { readBody } from '../bing.js'

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

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

/** A stub recording every request and answering from a queue of factories. */
function queuedFetch(answers) {
  const calls = []
  const stub = async (url, options) => {
    calls.push({ url, options })
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)]
    return answer()
  }
  return { calls, stub }
}

test('the article survives and the chrome does not', () => {
  const text = extractArticle(fixture('article-mdn-fetch.html'))
  assert.match(text, /The Fetch API provides an interface for fetching resources/, 'the article body is kept')
  assert.ok(!text.includes('Privacy'), 'the footer is gone')
  assert.ok(!text.includes('Reference'), 'the sidebar navigation is gone')
  assert.ok(!/<[a-z]/i.test(text), 'no markup survives into the text')
  assert.ok(text.length > 500, `a documentation page keeps its prose; got ${text.length} characters`)
})

test('a page cut before its article yields little, and no markup, rather than a half-tag', () => {
  // This fixture is 200 000 characters of a repository landing page — truncated before the README begins,
  // which is the measurement that made the provider fetch pages itself instead of transforming a capped
  // body: what is left is chrome. The test pins the two things that must hold for such a page anyway:
  // nothing markup-shaped survives, and the tail is not a half-open tag.
  const text = extractArticle(fixture('article-github-repo.html'))
  assert.ok(!/<[a-z!/]/i.test(text), 'no markup survives, not even an unterminated tag at the cut')
  assert.ok(!text.includes('<a data-component'), 'the truncated anchor is gone, not pasted into the text')
  assert.ok(text.length < 2000, `a page cut before its content yields little; got ${text.length} characters`)
})

test('a blog post keeps its sentences and loses the banner furniture', () => {
  const text = extractArticle(fixture('article-csdn-post.html'))
  assert.ok(!/<[a-z]/i.test(text), 'no markup survives into the text')
  assert.ok(!text.includes('<script'), 'no script text survives')
  assert.ok(text.length > 3000, `an article-length page keeps thousands of characters; got ${text.length}`)
})

test('a navigation list or table goes, and one that carries sentences stays', () => {
  const html = [
    '<div><ul><li><a href="/a">Alpha</a></li><li><a href="/b">Beta</a></li><li><a href="/c">Gamma</a></li></ul>',
    '<ul><li>Retries are refused because nothing failed in twenty-five searches.</li>',
    '<li>The cache never keeps a challenge page.</li></ul>',
    // A repository's file tree: a table whose cells are links. It is navigation by the same ratio.
    '<table><tr><td><a href="/f/a.js">article.js</a></td><td><a href="/c/1">last commit</a></td></tr>',
    '<tr><td><a href="/f/b.js">bing.js</a></td><td><a href="/c/2">last commit</a></td></tr></table>',
    // A table of results: cells carry sentences, so it is content.
    '<table><tr><td>Chrome, lower bound</td><td>61.3% of what arrived</td></tr>',
    '<tr><td>Prose inside p</td><td>1.4% of what arrived</td></tr></table>',
    // A link-dense block that carries a paragraph: GitHub's About sidebar. The paragraph is the reason to
    // keep the block, whatever its link density says.
    '<table><tr><td><p>A keyless web-search provider for DeepSeek Harness, with no account behind it.</p>',
    '<a href="/stars">0 stars</a> <a href="/forks">0 forks</a></td></tr></table></div>',
  ].join('')
  const text = extractArticle(html)
  assert.ok(!text.includes('Alpha'), 'the link list was navigation')
  assert.ok(!text.includes('article.js'), 'the file tree was navigation too, and it is a table')
  assert.match(text, /Retries are refused/, 'the list that carries sentences is content')
  assert.match(text, /challenge page/)
  assert.match(text, /61\.3% of what arrived/, 'a table whose cells are sentences is content')
  assert.match(text, /keyless web-search provider/, 'a paragraph is a reason to keep a block')
})

test('a capped extraction says so instead of looking complete', () => {
  const sentence = 'A page that loses its tail says so, which is what keeps it from looking complete. '
  const html = `<p>${sentence.repeat(400)}</p>`
  const text = extractArticle(html)
  assert.ok(text.length > MAX_CHARS, 'the marker is added after the cut')
  assert.match(text, new RegExp(`\\[Truncated at ${MAX_CHARS} characters: the page continues\\.\\]$`))
})

test('a declared charset is honoured for a page, as it is for a result page', async () => {
  const body = Buffer.concat([
    Buffer.from('<html><body><p>'),
    Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
    Buffer.from('</p></body></html>'),
  ])
  const { stub } = queuedFetch([
    () => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=gbk' } }),
  ])
  await withFetch(stub, async () => {
    const result = await new ArticleFetchProvider().fetch({ url: 'https://example.com/zh' })
    assert.match(result.body.content, /中文/)
  })
})

test('the byte bound stops the read instead of the page deciding how much to spend', async () => {
  // Two responses, not one clone: a clone tees the stream, and reading one branch while cancelling it
  // leaves the other branch waiting for data that never arrives.
  const bounded = new Response('x'.repeat(5000), { status: 200, headers: { 'content-type': 'text/plain' } })
  const whole = new Response('x'.repeat(5000), { status: 200, headers: { 'content-type': 'text/plain' } })
  assert.equal(await readBody(bounded, 10), 'x'.repeat(10))
  assert.equal((await readBody(whole, undefined)).length, 5000, 'without a bound the whole body is read')
})

test('a same-origin redirect is followed, and the final URL is what comes back', async () => {
  const { calls, stub } = queuedFetch([
    () => new Response('', { status: 302, headers: { location: '/moved/here' } }),
    () => new Response('<html><body><p>The page that answered.</p></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  ])
  await withFetch(stub, async () => {
    const result = await new ArticleFetchProvider().fetch({ url: 'https://example.com/start' })
    assert.equal(calls.length, 2)
    assert.equal(calls[0].options.redirect, 'manual', 'no hop happens without being looked at')
    assert.equal(result.url, 'https://example.com/moved/here')
    assert.equal(result.statusCode, 200)
    assert.match(result.body.content, /The page that answered/)
  })
})

test('a redirect to another origin is reported, not followed', async () => {
  const { calls, stub } = queuedFetch([
    () => new Response('', { status: 301, headers: { location: 'https://elsewhere.example/page' } }),
  ])
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new ArticleFetchProvider().fetch({ url: 'https://example.com/page' }),
      (error) => {
        assert.ok(error instanceof ArticleFetchError)
        assert.equal(error.code, 'WEB_PROVIDER_ERROR')
        assert.match(error.message, /redirects to https:\/\/elsewhere\.example\/page on another origin/)
        return true
      },
    )
    assert.equal(calls.length, 1, 'the second host was never requested')
  })
})

test('a non-2xx answer is a result, not a throw', async () => {
  const { stub } = queuedFetch([
    () => new Response('<html><body><h1>Not found</h1></body></html>', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    }),
  ])
  await withFetch(stub, async () => {
    const result = await new ArticleFetchProvider().fetch({ url: 'https://example.com/missing' })
    assert.equal(result.statusCode, 404)
    assert.equal(result.body.kind, 'text')
    assert.equal(result.truncated, false, 'extraction is not truncation: this page was read whole')
    assert.match(result.body.content, /Not found/, 'an error page is passed through as it answered')
  })
})

test('a URL this provider cannot fetch is named rather than attempted', async () => {
  const provider = new ArticleFetchProvider()
  await assert.rejects(() => provider.fetch({ url: '   ' }), /A fetch needs a URL/)
  await assert.rejects(() => provider.fetch({ url: 'not a url' }), /is not a URL/)
  await assert.rejects(() => provider.fetch({ url: 'ftp://example.com/file' }), /only http\(s\) destinations/)
})
