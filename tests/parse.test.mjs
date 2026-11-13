/**
 * Parsing tests over saved Bing result pages.
 *
 * The two fixtures are full responses captured from the endpoint this provider requests; nothing here
 * re-forms the markup. What they prove is acceptance item 1 — a saved page yields at least five
 * sources, and every one of them carries a non-empty title, an absolute https URL and a snippet — plus
 * the parser rules that a real page does not happen to exhibit (a class list with more than one token,
 * a block without a heading link).
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { decodeHtml, parseBingHtml } from '../bing.js'

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

/** Assert one parsed source has the three fields acceptance item 1 requires. */
function assertComplete(source, label) {
  assert.equal(typeof source.url, 'string', `${label}: url is a string`)
  assert.ok(source.url.startsWith('https://'), `${label}: url is absolute https (${source.url})`)
  assert.equal(new URL(source.url).href, source.url, `${label}: url is already normalized`)
  assert.equal(typeof source.title, 'string', `${label}: title is a string`)
  assert.ok(source.title.length > 0, `${label}: title is not empty`)
  assert.equal(typeof source.snippet, 'string', `${label}: snippet is a string`)
  assert.ok(source.snippet.length > 0, `${label}: snippet is not empty`)
}

test('a saved result page yields at least five complete sources', () => {
  const sources = parseBingHtml(fixture('bing-deepseek-harness.html'))
  assert.ok(sources.length >= 5, `expected at least 5 sources, parsed ${sources.length}`)
  sources.forEach((source, index) => assertComplete(source, `source ${index + 1}`))
  assert.equal(new Set(sources.map((source) => source.url)).size, sources.length, 'sources are unique by URL')
  // The first result, field by field. A count and three non-empty fields would survive a parser that
  // read the site-icon anchor above the heading, or that kept the markup inside the text; this pins
  // which anchor and which text the source came from.
  assert.equal(sources[0].url, 'https://www.deepseek.com/harness/')
  assert.equal(sources[0].title, 'DeepSeek Harness | Explore the limits of intelligence')
  assert.match(sources[0].snippet, /^2026年8月12日 · /)
  assert.match(sources[0].snippet, /DeepSeek Harness is in preview/)
})

test('the same URL twice on a page is one source', () => {
  const page = [
    '<li class="b_algo"><h2><a href="https://example.com/once">First title</a></h2>',
    '<p class="b_lineclamp2">First snippet</p></li>',
    '<li class="b_algo"><h2><a href="https://example.com/once">Second title</a></h2>',
    '<p class="b_lineclamp2">Second snippet</p></li>',
  ].join('')
  assert.deepEqual(parseBingHtml(page), [
    { url: 'https://example.com/once', title: 'First title', snippet: 'First snippet' },
  ])
})

test('a second saved page parses too, so the parser is not tuned to one query', () => {
  const sources = parseBingHtml(fixture('bing-node-fetch-redirect.html'))
  assert.ok(sources.length >= 3, `expected at least 3 sources, parsed ${sources.length}`)
  sources.forEach((source, index) => assertComplete(source, `source ${index + 1}`))
})

test('a class list that carries more than the b_algo token still starts a block', () => {
  const page = [
    '<ol><li class="b_algo b_algoBorder" data-id iid=SERP.1>',
    '<h2><a href="https://example.com/a">Example A</a></h2>',
    '<p class="b_lineclamp2">Snippet A</p>',
    '</li></ol>',
  ].join('')
  const sources = parseBingHtml(page)
  assert.deepEqual(sources, [{ url: 'https://example.com/a', title: 'Example A', snippet: 'Snippet A' }])
})

test('a block without a heading link is not a result', () => {
  const page = [
    '<li class="b_algo"><div class="b_tpcn"><a href="https://example.com/site">site</a></div></li>',
    '<li class="b_algo"><h2><a href="https://example.com/kept">Kept</a></h2></li>',
  ].join('')
  assert.deepEqual(parseBingHtml(page), [{ url: 'https://example.com/kept', title: 'Kept' }])
})

test('a relative or non-web link is resolved against the endpoint or dropped', () => {
  const page = [
    '<li class="b_algo"><h2><a href="/relative">Relative</a></h2></li>',
    '<li class="b_algo"><h2><a href="javascript:void(0)">Not a destination</a></h2></li>',
    '<li class="b_algo"><h2><a href="//example.com/protocol-relative">Protocol relative</a></h2></li>',
  ].join('')
  assert.deepEqual(parseBingHtml(page), [
    { url: 'https://cn.bing.com/relative', title: 'Relative' },
    { url: 'https://example.com/protocol-relative', title: 'Protocol relative' },
  ])
})

test('a page with no result block parses to no sources', () => {
  assert.deepEqual(parseBingHtml('<html><body><p>No results.</p></body></html>'), [])
})

test('decodeHtml reads the entity forms Bing emits', () => {
  assert.equal(decodeHtml('a &amp; b'), 'a & b')
  assert.equal(decodeHtml('x&ensp;y&nbsp;z'), 'x y z')
  assert.equal(decodeHtml('&#0183;'), '\u00b7')
  assert.equal(decodeHtml('&#x1F600;'), '\u{1F600}')
  assert.equal(decodeHtml('<strong>DeepSeek Harness</strong> | Explore'), 'DeepSeek Harness | Explore')
  assert.equal(decodeHtml(null), '')
})

test('a numeric entity outside the Unicode range stays text instead of failing the parse', () => {
  assert.equal(decodeHtml('&#x110000; &#9999999999; &#0;'), '&#x110000; &#9999999999; &#0;')
  assert.equal(decodeHtml('ok &#183; &#x110000; end'), 'ok \u00b7 &#x110000; end')
})
