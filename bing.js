/**
 * dsh-search — the Bing HTML backend behind the `ctx.web` search seam.
 *
 * One module, no imports: it builds the query, performs the request, parses the result page and maps
 * what it parsed to the seam's source vocabulary. `index.js` registers this provider and owns the
 * bundle's only harness import, so this file loads and runs under plain `node` — which is what lets
 * the request-layer checks in `scripts/check.mjs` and the manual acceptance run exercise the real code
 * path without the Host.
 *
 * THE ENDPOINT IS FIXED, AND IT IS `cn.bing.com`
 * `www.bing.com` answers 302 with a `Location` pointing at `cn.bing.com`, and this provider never
 * follows it: the request sets `redirect: "manual"`, so a redirect comes back as a 3xx response and
 * surfaces as a named failure instead of a second request to a host the provider did not choose. That
 * is what makes "no request goes to www.bing.com" a property of this code rather than of today's
 * routing (docs/adr/0001-cn-bing-html-endpoint.md). The endpoint is a constant, not configuration:
 * every candidate backend was measured, and only this one answered with a parseable result page.
 *
 * NO KEY, NO ACCOUNT, NO MODEL CALL
 * One HTTPS GET against the public search page, so `available()` is a constant. `search()` reports
 * what one page holds; the seam owns `maxResults` and truncates after the provider returns, so this
 * module never trims to a request limit.
 *
 * The result page is markup, not an API: every field is parsed from today's shape, and a page that
 * stops matching it fails loudly instead of returning an empty list (docs/architecture-en.md).
 */

/** Stable id this provider registers under; the profile pins it as `searchProvider` (ADR 0003). */
export const PROVIDER_ID = 'bing-html'

/** The one endpoint this provider ever requests. */
export const SEARCH_ENDPOINT = 'https://cn.bing.com/search'

/**
 * A desktop browser User-Agent. Bing serves its normal result markup to one; it is also the shape that
 * a challenge page is least likely to be issued in place of.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** The language header the saved fixtures were captured with; Bing returns Chinese results either way. */
const ACCEPT_LANGUAGE = 'zh-CN,zh;q=0.9,en;q=0.8'

/**
 * The element Bing renders one organic result in: `<li class="b_algo" data-id iid=…>`. The class list
 * may grow (`b_algoBorder`), so the match is on the token, not on the whole attribute value.
 */
const RESULT_BLOCK = /<li\b[^>]*\bclass\s*=\s*(?:"[^"]*\bb_algo\b[^"]*"|'[^']*\bb_algo\b[^']*')[^>]*>/gi

/**
 * The title and the target URL: the heading anchor. It is the result's own link, so it is the only
 * anchor to read — every block also carries a site-icon anchor pointing at the site root.
 */
const TITLE_LINK = /<h2[^>]*>\s*<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i

/**
 * The snippet, in the two shapes Bing has used for it. The first is what both saved fixtures carry
 * (`<p class="b_lineclamp2">`); the second is the older `<div class="b_caption"><p>` wrapper. Every
 * pattern is tried and the longest match wins, so a page that nests one inside the other still reads
 * the inner text rather than the wrapper.
 */
const SNIPPETS = [
  /<p[^>]*\bclass\s*=\s*["'][^"']*\bb_lineclamp[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
  /<div[^>]*\bclass\s*=\s*["'][^"']*\bb_caption\b[^"']*["'][^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
]

/** The named entities Bing emits inside result text. Numeric forms are decoded separately. */
const NAMED_ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['ensp', ' '],
  ['emsp', ' '],
  ['thinsp', ' '],
])

/**
 * A provider failure that carries the seam's own error code.
 *
 * `index.js` translates this into the seam's `WebError` before it reaches the service; the code and the
 * message are decided here, where the request is, and the class itself is local so this module keeps no
 * harness import (docs/architecture-en.md).
 */
export class BingSearchError extends Error {
  /**
   * @param {string} message - what failed, in the words a model can act on.
   * @param {string} code - `WEB_PROVIDER_ERROR` or `WEB_ABORTED`, the seam's vocabulary.
   * @param {ErrorOptions} [options] - standard options; `cause` carries the transport failure.
   */
  constructor(message, code, options) {
    super(message, options)
    this.name = 'BingSearchError'
    this.code = code
  }
}

/** True for the `AbortError` a fetch raises when its signal fires. */
function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** The provider's cancellation failure, keeping the caller's reason when one exists. */
function aborted(signal, fallback) {
  return new BingSearchError(
    'Bing search aborted',
    'WEB_ABORTED',
    { cause: signal?.aborted === true ? signal.reason : fallback },
  )
}

/**
 * Decode the entities and strip the markup Bing puts in a title or a snippet.
 *
 * The entity forms are decoded before the tags are stripped, so an escaped `&lt;b&gt;` in a snippet
 * stays text instead of becoming a tag to strip. Whitespace is collapsed because the markup carries
 * newlines and `&ensp;` runs that the model should not see.
 *
 * @param {string | null | undefined} value - the raw fragment.
 * @returns {string} readable text, trimmed.
 */
export function decodeHtml(value) {
  if (value === null || value === undefined) return ''
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES.get(name.toLowerCase()) ?? match)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolve a result link to an absolute http(s) URL.
 *
 * Bing has served protocol-relative and root-relative links, so the href is resolved against the
 * endpoint rather than trusted to be absolute. A link to another scheme (`javascript:`, `data:`) is not
 * a search result and is dropped.
 *
 * @param {string} href - the raw anchor target.
 * @returns {string | undefined} the absolute URL, or undefined when it is not a web destination.
 */
function absoluteUrl(href) {
  let url
  try {
    url = new URL(href, SEARCH_ENDPOINT)
  } catch {
    return undefined
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
}

/**
 * The snippet text of one result block: the longest text any known snippet shape matches.
 *
 * @param {string} block - one `<li class="b_algo">` block.
 * @returns {string} readable snippet text, empty when the block carries none.
 */
function snippetOf(block) {
  let longest = ''
  for (const pattern of SNIPPETS) {
    const match = pattern.exec(block)
    if (match === null) continue
    const text = decodeHtml(match[1])
    if (text.length > longest.length) longest = text
  }
  return longest
}

/**
 * Parse one result block into a source.
 *
 * A block without a title link, without a usable destination, or without heading text is not a result
 * and is skipped; a block without a snippet is still a result, reported without one.
 *
 * @param {string} block - one `<li class="b_algo">` block.
 * @returns {{url: string, title: string, snippet?: string} | undefined} the source, or undefined.
 */
function sourceOf(block) {
  const title = TITLE_LINK.exec(block)
  if (title === null) return undefined
  const url = absoluteUrl(decodeHtml(title[1].trim()))
  if (url === undefined) return undefined
  const heading = decodeHtml(title[2])
  if (heading.length === 0) return undefined
  const snippet = snippetOf(block)
  return snippet.length > 0 ? { url, title: heading, snippet } : { url, title: heading }
}

/**
 * Parse a Bing result page into sources, in page order, deduplicated by URL.
 *
 * The page is scanned for block starts first and sliced between them, so a block never reads past its
 * own end into the next result: a snippet pattern that fails inside one block cannot borrow the text of
 * the next one.
 *
 * @param {string} html - the response body.
 * @returns {Array<{url: string, title: string, snippet?: string}>} the sources this page carries.
 */
export function parseBingHtml(html) {
  const starts = []
  for (const match of html.matchAll(RESULT_BLOCK)) starts.push(match.index)
  const sources = []
  const seen = new Set()
  for (let index = 0; index < starts.length; index += 1) {
    const block = html.slice(starts[index], starts[index + 1] ?? html.length)
    const source = sourceOf(block)
    if (source === undefined || seen.has(source.url)) continue
    seen.add(source.url)
    sources.push(source)
  }
  return sources
}

/**
 * True when a page carrying no parsed results is a bot gate rather than a page of no results.
 *
 * It is consulted only when nothing parsed, so a challenge word appearing in a normal result's snippet
 * cannot turn a good page into an error.
 *
 * @param {string} html - the response body.
 * @returns {boolean} whether the page looks like a challenge.
 */
function looksBlocked(html) {
  return /captcha|verify you are human|are you a robot|unusual traffic/i.test(html.slice(0, 20000))
}

/**
 * The keyless Bing search provider registered with `ctx.web`.
 *
 * `available()` is a constant because nothing here needs configuring: no credential, no endpoint choice,
 * no settings section. `ready()` is deliberately absent, which the seam reads as "always ready to
 * authenticate" — the property that keeps `web_search` offered on a route whose credential-backed
 * provider cannot authenticate (docs/architecture-en.md).
 */
export class BingSearchProvider {
  /** @type {string} */
  id = PROVIDER_ID

  /** Whether this provider can run now; it can, without a key. */
  available() {
    return true
  }

  /**
   * Run one search: one request against the endpoint, then parse its body.
   *
   * @param {{query: string, maxResults?: number}} request - the seam's search request.
   * @param {AbortSignal} [signal] - the caller's cancellation signal.
   * @returns {Promise<{sources: Array<{url: string, title: string, snippet?: string}>, truncated: boolean}>}
   *   the page's sources; `truncated` is false because the seam owns the result bound.
   * @throws {BingSearchError} `WEB_ABORTED` when cancelled, `WEB_PROVIDER_ERROR` otherwise.
   */
  async search(request, signal) {
    const query = typeof request?.query === 'string' ? request.query.trim() : ''
    if (query.length === 0) {
      throw new BingSearchError('Bing search requires a non-empty query', 'WEB_PROVIDER_ERROR')
    }
    if (signal?.aborted === true) throw aborted(signal)

    const url = `${SEARCH_ENDPOINT}?${new URLSearchParams({ q: query }).toString()}`
    let response
    try {
      response = await fetch(url, {
        method: 'GET',
        // Never follow: the only host this provider may request is the endpoint above (ADR 0001).
        redirect: 'manual',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': ACCEPT_LANGUAGE,
        },
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      throw new BingSearchError(
        `Bing search request failed: ${String(error)}\n\nThe request used ${url}.`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }

    if (!response.ok) {
      const location = response.headers.get('location')
      throw new BingSearchError(
        `Bing answered HTTP ${response.status} for ${url}`
          + (location === null
            ? '; this provider follows no redirect, so the response body was not parsed.'
            : `; it redirects to ${location}, and this provider follows no redirect (ADR 0001).`),
        'WEB_PROVIDER_ERROR',
      )
    }

    let html
    try {
      html = await response.text()
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      throw new BingSearchError(
        `Bing returned an unreadable response body: ${String(error)}`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }

    const sources = parseBingHtml(html)
    if (sources.length === 0) {
      throw new BingSearchError(
        looksBlocked(html)
          ? `Bing answered ${url} with a challenge page instead of results. Retry later, or search again from a browser session.`
          : `Bing answered ${url} with no parseable result block. The result page's shape may have changed, or the query has no results; the request reached Bing, so this is not a network failure.`,
        'WEB_PROVIDER_ERROR',
      )
    }
    return { sources, truncated: false }
  }
}
