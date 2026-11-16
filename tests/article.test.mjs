/**
 * The fetch half: what reaches the model when it fetches a page.
 *
 * The extraction tests run on four saved pages (`tests/fixtures/sources.md` records where each came from),
 * and they assert structure rather than exact prose: chrome gone, markup gone, the page's own sentences kept,
 * the cap marked. The request tests stub `fetch`, so the redirect policy, the non-2xx outcome and the byte
 * bound are all exercised without the network.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { ArticleFetchError, ArticleFetchProvider, MAX_BYTES, MAX_CHARS, extractArticle } from '../article.js'
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

test('the page itself says where its article is, and the rail around it is not read', () => {
  const text = extractArticle(fixture('article-csdn-post.html'))
  assert.match(text, /一句话总结/, 'the post is kept')
  assert.ok(!text.includes('相关推荐'), 'the related rail is not the article')
  assert.ok(!text.includes('墨衍会员'), 'the promotion banner is not the article')
  assert.ok(text.length < 5000, `the page's own container is what is handed over; got ${text.length} characters`)
})

test('a live repository page hands over its article, not the header and the sidebar around it', () => {
  const text = extractArticle(fixture('article-github-repo-live.html'))
  assert.match(text, /A real result page, not an account balance/, 'the README survives')
  assert.ok(!text.includes('Open more actions menu'), 'the header is outside the article')
  assert.ok(!text.includes('Contributors'), 'the sidebar is outside the article')
  assert.ok(text.length < 21000, `the article is 20 465 of that page's 21 325 characters; got ${text.length}`)
})

test('a container under the floor is a teaser, so the page keeps its shape', () => {
  const body = `<p>${'A body sentence outside whatever the tag calls an article. '.repeat(30)}</p>`
  const pages = [
    `<article><p>One.</p><p>Two.</p></article>${body}`,
    `<article><p>One.</p><p>Two.</p><p>Three.</p><p>Four.</p></article>${body}`,
    `<div id="content"><p>One.</p><p>Two.</p></div>${body}`,
  ]
  for (const html of pages) {
    const text = extractArticle(html)
    assert.match(text, /A body sentence outside/, 'a candidate the floor refuses leaves the page alone')
    assert.match(text, /One\./)
  }
})

test('an element whose id names it content is the article when no tag says so', () => {
  const prose = 'The paragraph the page named as its content is kept in full. '.repeat(20)
  const html = `<div id="content"><p>${prose}</p><p>${prose}</p><p>${prose}</p></div>`
    + '<div class="rail"><p>The rail prose the page did not name.</p>'
    + '<ul><li><a href="/a">One</a></li><li><a href="/b">Two</a></li></ul></div>'
  const text = extractArticle(html)
  assert.match(text, /The paragraph the page named as its content/)
  assert.ok(!text.includes('The rail prose'), 'the element outside the named container is not read')
  assert.ok(text.length >= 1000, `the named container clears the floor; got ${text.length}`)
})

test('a nested wrapper is kept whole rather than truncated at the inner close', () => {
  const prose = 'A sentence the article carries, long enough to clear the floor by itself. '.repeat(6)
  const inner = `<div id="content"><p>${prose}</p><p>${prose}</p><p>${prose}</p></div>`
  const html = `<div id="content">${inner}<p>The tail after the nested wrapper survives.</p></div>`
    + '<div class="rail"><p>The rail the page did not name.</p></div>'
  const text = extractArticle(html)
  assert.match(text, /The tail after the nested wrapper survives/, 'the whole wrapper, not its first close')
  assert.ok(!text.includes('The rail the page did not name'), 'the outer wrapper is the one chosen')
})

test('an XHTML-style anchor closer still measures the anchor text', () => {
  const html = '<ul><li><a href="/a">Alpha</a ></li><li><a href="/b">Beta</a ></li>'
    + '<li><a href="/c">Gamma</a ></li></ul><p>The body the page carries.</p>'
  const text = extractArticle(html)
  assert.ok(!text.includes('Alpha'), 'the link list is navigation, whether its closer carries a space or not')
  assert.match(text, /The body the page carries/)
})

test('an element a page hides is not read, and an attribute that merely starts with hidden is', () => {
  const text = extractArticle(fixture('article-github-repo.html'))
  assert.ok(!text.includes('You signed in'), 'the stale-session notice is hidden')
  assert.ok(!text.includes('You switched accounts'), 'and so are its two siblings')
  assert.ok(text.length < 100, `what is left of that page is small; got ${text.length} characters`)

  const inline = [
    '<div hidden>bare hidden</div>',
    '<div aria-hidden="true">aria hidden</div>',
    '<div style="display: none">display none</div>',
    '<div style="visibility:hidden">visibility hidden</div>',
    '<div class="hidden-summary"><p>A class that merely starts with hidden stays.</p></div>',
  ].join('')
  const kept = extractArticle(inline)
  assert.ok(!kept.includes('bare hidden'), 'a bare hidden attribute')
  assert.ok(!kept.includes('aria hidden'), 'aria-hidden="true"')
  assert.ok(!kept.includes('display none'), 'display:none')
  assert.ok(!kept.includes('visibility hidden'), 'visibility:hidden')
  assert.match(kept, /A class that merely starts with hidden stays/)
})

test("a line that is the page's own furniture goes, and a sentence is not touched", () => {
  const html = [
    '<p>Skip to content</p>',
    '<p>You signed in with another tab or window. Reload to refresh your session.</p>',
    '<p>Dismiss alert</p>',
    '<p>Folders and files</p>',
    '<p>Skip to the end of the argument, which is a sentence and not a skip link.</p>',
  ].join('')
  const text = extractArticle(html)
  assert.ok(!text.includes('Skip to content'), 'a bare skip link is furniture')
  assert.ok(!text.includes('You signed in with another tab'), 'the stale-session line is furniture')
  assert.ok(!text.includes('Dismiss alert'))
  assert.ok(!text.includes('Folders and files'))
  assert.match(text, /Skip to the end of the argument/, 'a line the whole-line patterns do not cover stays')

  // The same rule on the saved page: the container rule leaves 40 characters there, and the two lines it
  // still owes are the page's furniture.
  const leftover = extractArticle(fixture('article-github-repo.html'))
  assert.ok(!leftover.includes('Skip to content'))
  assert.ok(!leftover.includes('Dismiss alert'))
  assert.ok(leftover.length < 40, `the last lines of that page are furniture; got ${leftover.length} characters`)
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
  const cut = await readBody(bounded, 10)
  assert.equal(cut.text, 'x'.repeat(10))
  assert.equal(cut.capped, true, 'the bound stopped the read, and the reader reports it')
  const read = await readBody(whole, undefined)
  assert.equal(read.text.length, 5000, 'without a bound the whole body is read')
  assert.equal(read.capped, false, 'reading to the end caps nothing')
})

test('a page the 5 MB bound cut is reported as truncated, even when its prose is short', async () => {
  // The regression this pins: `truncated` used to be re-derived from `html.length > MAX_BYTES`, and a
  // body decoded from at most MAX_BYTES bytes can never be longer than that — so a page cut at 5 MB said
  // `truncated: false`. The prose here is short on purpose: the character cap cannot be what reports the
  // cut, only the reader's own report can.
  const body = `<p>Small page.</p><script>${'x'.repeat(1000)}</script>${' '.repeat(MAX_BYTES)}`
  assert.ok(body.length > MAX_BYTES, 'the response is longer than the read bound')
  const { stub } = queuedFetch([
    () => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
  ])
  await withFetch(stub, async () => {
    const result = await new ArticleFetchProvider().fetch({ url: 'https://example.com/huge' })
    assert.equal(result.truncated, true, 'a bound dropped the tail, and the caller is told')
    assert.equal(result.body.content, 'Small page.', 'what the read reached is handed over as prose')
  })
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

test('a redirect whose Location is not a URL is reported, not thrown as a bare TypeError', async () => {
  // `new URL('http://', base)` rejects with a TypeError carrying no code. Unwrapped, it escaped as a
  // TypeError instead of the seam's WebError, which is the one contract a provider failure has to keep.
  const { calls, stub } = queuedFetch([
    () => new Response('', { status: 302, headers: { location: 'http://' } }),
  ])
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new ArticleFetchProvider().fetch({ url: 'https://example.com/page' }),
      (error) => {
        assert.ok(error instanceof ArticleFetchError, 'the provider failure type, not a bare TypeError')
        assert.equal(error.code, 'WEB_PROVIDER_ERROR')
        assert.ok(error.cause instanceof TypeError, 'the URL parse failure is kept as the cause')
        assert.match(error.message, /"http:\/\/"/, 'the malformed target is named')
        return true
      },
    )
    assert.equal(calls.length, 1, 'a Location it cannot read follows no hop')
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

test('a transport failure says where it failed, offers the re-issue, and keeps its cause', async () => {
  const cause = new TypeError('fetch failed')
  const { calls, stub } = queuedFetch([() => { throw cause }])
  await withFetch(stub, async () => {
    await assert.rejects(
      () => new ArticleFetchProvider().fetch({ url: 'https://example.com/unreachable' }),
      (error) => {
        assert.ok(error instanceof ArticleFetchError)
        assert.equal(error.code, 'WEB_PROVIDER_ERROR')
        assert.equal(error.cause, cause, 'the transport failure is preserved as the cause')
        assert.match(error.message, /transport layer/, 'the message names the layer that failed')
        assert.match(error.message, /re-issuing the call may succeed/, 'and says what the caller can do')
        return true
      },
    )
    assert.equal(calls.length, 1, 'a re-issue is the caller\'s decision: the provider does not retry')
  })
})
