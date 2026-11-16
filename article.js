/**
 * dsh-search — the readable-text half of the bundle: the fetch provider that hands the model a page's prose
 * instead of a page.
 *
 * WHY THIS EXISTS AT ALL
 * `web_search` returns sources; the model then fetches one, and what it received was measured: across five
 * real pages, **61 % of the characters were chrome by a lower bound** (`<script>`, `<style>`, `<nav>`,
 * `<header>`, `<footer>`, `<aside>`, comments), prose inside `<p>` made up **1.4 %**, and on three of the
 * five the shipped provider's 100 000-character body cap was reached **before the article began** — a page
 * that big is truncated in its navigation, so no transformation of what arrives can recover its content.
 *
 * WHY IT FETCHES ITSELF
 * Delegating to the shipped `http` provider would re-earn no policy, which is what ADR 0004 wanted. It also
 * cannot work: the cap is applied to the raw body before anyone sees it, so the tail is gone by the time a
 * delegating provider runs. This provider therefore reads the page itself, with the shipped provider's own
 * numbers and rules as its starting point (its User-Agent, same-origin redirects only, a 5 MB byte cap, the
 * charset the response declares), and then extracts before capping — which is the difference between
 * "truncate the page" and "keep the article" (docs/adr/0010-the-other-half-of-the-result.md).
 *
 * WHAT IT RETURNS
 * `kind: 'text'`, because the tool converts an `html` body with its own markdown pass and passes a `text`
 * body through — so the extraction below is what reaches the model, unaltered, and without a second pass
 * over markup that no longer exists.
 *
 * The extraction is a rule, not a readability engine: remove the containers that are never prose, drop
 * navigation lists whose words are the anchors' words, keep headings, paragraphs, quotations, code and
 * tables in document order, collapse whitespace, and say so when the cap is reached. A rule that can be
 * stated in one sentence can also be tested on a saved page, which is the point.
 */

import { readBody } from './bing.js'

/** The id a profile pins to use this provider as the seam's fetch half. */
export const PROVIDER_ID = 'article'

/**
 * How much extracted text one fetch may hand over, in characters.
 *
 * Smaller than the shipped provider's 100 000-character body cap on purpose: that cap bounds what is *read*,
 * and this one bounds what is *paid for* on every later turn of a session. A page that loses its tail says
 * so, which is what keeps a truncated page from looking complete.
 */
export const MAX_CHARS = 24000

/** The most markup this provider will read, matching the shipped provider's `maxResponseBytes`. */
export const MAX_BYTES = 5_000_000

/** How many same-origin redirects one fetch will follow, matching the shipped provider's `maxRedirects`. */
export const MAX_REDIRECTS = 5

/**
 * The User-Agent this provider sends.
 *
 * The shipped provider's, deliberately: a browser disguise was measured earlier and made things worse
 * (CSDN answered 521 instead of 200, and Zhihu refused either way), so "who is asking" stays one decision
 * for the whole bundle rather than one per provider.
 */
const USER_AGENT = 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)'

/** Containers that never carry a page's prose, removed with their contents before anything is read. */
const CHROME = [
  'head',
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'form',
  'button',
  'select',
  'nav',
  'header',
  'footer',
  'aside',
  'dialog',
]

/** Block-level tags that become paragraph boundaries in the extracted text. */
const BLOCKS = /<\/?(?:p|div|section|article|main|h[1-6]|li|tr|blockquote|pre|figure|table|ul|ol|dl|dt|dd)\b[^>]*>/gi

/**
 * An element a page has marked as not to be shown: a bare `hidden`, `aria-hidden="true"`, or an inline
 * `display:none` / `visibility:hidden`.
 *
 * The attribute string this is tested against stops at the tag's `>`, so `$` here is that `>`: `hidden`
 * followed by whitespace, `/` or the end of the attributes is the attribute, while `hidden-summary` is not.
 */
const HIDDEN_ELEMENT = /(?:\shidden(?=[\s/>]|$)|aria-hidden\s*=\s*["']?true|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden))/i

/** The words a page uses in an id or a class to name its own content. */
const CONTAINER_TOKEN = /(?:^|[^a-z])(?:content|article|post|entry|story)(?:[^a-z]|$)/i

/**
 * The floor a container candidate clears before it replaces the page.
 *
 * The rule's risk is an index page whose `<article>` wraps a teaser: the tag is right about where one item
 * is and wrong about the page. A candidate under a thousand characters, or carrying fewer than three
 * paragraphs, is not an article, and the page is left exactly as it was.
 */
const MIN_CONTAINER_CHARS = 1000
const MIN_CONTAINER_PARAGRAPHS = 3

/** Every open tag with its attributes, skipping the quoted regions that may carry a `>`. */
const ELEMENT_OPEN = /<([a-z][a-z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi

/** Tags that open and close in one tag, so nothing follows one to remove. */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/**
 * Whole lines that are a page's furniture wherever they appear.
 *
 * After the chrome is gone these are what is left of a page's own interface: a skip link, the stale-session
 * notices, a dismiss control and a repository's file-tree heading. A line goes only when the whole of it
 * matches, so a sentence that merely opens with "Skip to" survives.
 */
const DROP_LINES = [
  /^Skip to [\w ]{0,40}$/i,
  /^You (?:signed in|signed out|switched accounts) (?:with|on) (?:another|the) .{0,40}(?:tab or window).*$/i,
  /^Dismiss alert$/i,
  /^Folders and files$/i,
]

/**
 * Remove one tag's elements, contents included.
 *
 * @param {string} html - the markup.
 * @param {string} tag - the tag name.
 * @returns {string} the markup without them.
 */
function removeElements(html, tag) {
  const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>|<${tag}\\b[^>]*\\/>`, 'gi')
  return html.replace(pattern, ' ')
}

/**
 * The offset just past the element that opens at `start`, or undefined when it never closes.
 *
 * A non-greedy same-tag match stops at the first closing tag of that name, which is exact for the elements
 * that do not nest — but a wrapper that does would be cut short, and a page cut mid-element has no closing
 * tag at all. Counting the tag's own opens and closes keeps both cases honest: the caller gets a whole
 * element, or nothing to use.
 *
 * @param {string} html - the markup.
 * @param {number} start - the offset of the element's open tag.
 * @param {string} tag - the lower-case tag name.
 * @returns {number|undefined} the offset just past the element, or undefined.
 */
function elementEnd(html, start, tag) {
  const open = html.indexOf('>', start)
  if (open === -1) return undefined
  if (VOID_ELEMENTS.has(tag) || /\/\s*>$/.test(html.slice(start, open + 1))) return open + 1
  const pattern = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi')
  pattern.lastIndex = start
  let depth = 0
  let match
  while ((match = pattern.exec(html)) !== null) {
    if (match[0][1] === '/') {
      depth -= 1
      if (depth === 0) return match.index + match[0].length
    } else if (!/\/\s*>$/.test(match[0])) {
      depth += 1
    }
  }
  return undefined
}

/**
 * Every element in a page whose open tag `accept` approves, in document order.
 *
 * @param {string} html - the markup.
 * @param {(tag: string, attributes: string) => boolean} accept - whether an open tag is a candidate.
 * @returns {{start: number, end: number}[]} the spans of the elements that close.
 */
function elements(html, accept) {
  const found = []
  ELEMENT_OPEN.lastIndex = 0
  let match
  while ((match = ELEMENT_OPEN.exec(html)) !== null) {
    const tag = match[1].toLowerCase()
    if (!accept(tag, match[2])) continue
    const end = elementEnd(html, match.index, tag)
    if (end !== undefined) found.push({ start: match.index, end })
  }
  return found
}

/** True when an open tag's own id or class names it as content. */
function namesContent(attributes) {
  for (const match of attributes.matchAll(/(?:\sid|\sclass)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    if (CONTAINER_TOKEN.test(match[1] ?? match[2])) return true
  }
  return false
}

/** How many `<p>` elements a fragment carries. */
function paragraphCount(fragment) {
  return (fragment.match(/<p\b/gi) ?? []).length
}

/** The characters a fragment's `<p>` elements carry, markup and whitespace aside. */
function paragraphChars(fragment) {
  let total = 0
  for (const match of fragment.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    total += match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length
  }
  return total
}

/**
 * The one element a page names as its article, or undefined when it names none worth keeping.
 *
 * A page that says where its article is answers the question the chrome list only guesses at. Measured on
 * the saved pages: CSDN's `<article>` is 3 407 characters of a 21 547-character delivery with 20 of the
 * post's 20 sentences kept, the live repository page's `<article>` is 20 465 of 21 325, and MDN's `<main>`
 * is 2 711 of 2 749 — the rail, the banner, the sidebar and the header are what the page's own markup
 * identified as not the article.
 *
 * `<article>` is tried before `<main>`: the first is the page's own claim about which element is the
 * article, while the second is a layout region that can still carry a sidebar — measured on the live
 * repository page, where `<main>` keeps About, Stars and Contributors and `<article>` does not.
 *
 * A `<p>`-rich element whose id or class carries `content`, `article`, `post`, `entry` or `story` is the
 * same claim in words, and is tried only when the tags are absent or refused by the floor.
 *
 * @param {string} html - the markup.
 * @returns {string|undefined} the container's markup, or undefined when the page keeps its shape.
 */
function selectContainer(html) {
  for (const tag of ['article', 'main']) {
    const candidate = elements(html, (name) => name === tag)
      .map(({ start, end }) => html.slice(start, end))
      .map((fragment) => ({ fragment, chars: renderText(fragment).length }))
      .sort((a, b) => b.chars - a.chars)[0]
    if (candidate !== undefined && candidate.chars >= MIN_CONTAINER_CHARS
      && paragraphCount(candidate.fragment) >= MIN_CONTAINER_PARAGRAPHS) {
      return candidate.fragment
    }
  }
  const named = elements(html, (_tag, attributes) => namesContent(attributes))
    .map(({ start, end }) => {
      const fragment = html.slice(start, end)
      return { fragment, chars: renderText(fragment).length, paragraphs: paragraphChars(fragment) }
    })
    .filter(({ fragment, chars }) => chars >= MIN_CONTAINER_CHARS
      && paragraphCount(fragment) >= MIN_CONTAINER_PARAGRAPHS)
    .sort((a, b) => b.paragraphs - a.paragraphs)[0]
  return named?.fragment
}

/**
 * Remove, contents included, the elements a page marks as not shown.
 *
 * Measured: the truncated repository fixture delivers 268 characters, and 40 once the hidden stale-session
 * notices are gone — they are the page's own statement that a reader should not be looking at them.
 *
 * @param {string} html - the markup.
 * @returns {string} the markup without its hidden elements.
 */
function removeHiddenElements(html) {
  const hidden = elements(html, (_tag, attributes) => HIDDEN_ELEMENT.test(attributes))
  // An element inside another goes with it. Keeping only the outermost leaves spans that cannot overlap,
  // which is what makes one removal pass, from the end of the page backwards, correct.
  const outer = hidden.filter((span) => !hidden.some((other) => other.start < span.start && other.end >= span.end))
  let text = html
  for (const { start, end } of outer.reverse()) {
    text = text.slice(0, start) + ' ' + text.slice(end)
  }
  return text
}

/**
 * Remove a `<ul>`, `<ol>` or `<table>` whose text is almost entirely link text: a menu, a breadcrumb, a tag
 * cloud, a table of contents, a repository's file tree.
 *
 * The test is a ratio rather than a tag: a block whose words are the anchors' words is navigation, because a
 * reader cannot read a link — and the model cannot follow one from here either. A list or table that carries
 * sentences is content and stays, which is what keeps a numbered explanation, a bulleted argument or a table
 * of results intact. A table needs the rule as much as a list does: a repository's file tree is one, and its
 * cells are links. Removal repeats, because a nested block can hide one level deeper.
 *
 * @param {string} html - the markup.
 * @returns {string} the markup without its navigation blocks.
 */
function removeNavigationBlocks(html) {
  const linkOnly = (block) => {
    // A block that carries a paragraph is content whatever its link density: GitHub's "About" sidebar is a
    // table of links with a description paragraph in it, and dropping it would lose the description.
    if (/<p\b/i.test(block)) return false
    const all = block.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length
    if (all === 0) return true
    let linked = 0
    for (const match of block.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)) {
      linked += match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length
    }
    return linked / all >= 0.7
  }
  let current = html
  for (let pass = 0; pass < 3; pass += 1) {
    const next = current.replace(/<(ul|ol|table)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => (linkOnly(block) ? ' ' : block))
    if (next === current) break
    current = next
  }
  return current
}

/**
 * Extract the readable text of a page.
 *
 * The order is the rule: the container the page itself names is chosen first, then the elements it marks as
 * hidden go, then the containers that are never prose, then the navigation blocks, then the markup is
 * flattened, and last the lines that are a page's furniture on their own are dropped.
 *
 * @param {string} html - a full page.
 * @returns {string} the page's prose, in document order, capped and marked.
 */
export function extractArticle(html) {
  return renderText(selectContainer(html) ?? html)
}

/**
 * The readable text of one page's markup, with the container already chosen.
 *
 * Separate from `extractArticle` because choosing a container needs the extraction length of each
 * candidate, and a candidate can contain a nested one: a rule that called itself to score its own choices
 * would not terminate.
 *
 * @param {string} html - the markup to read.
 * @returns {string} the page's prose, in document order, capped and marked.
 */
function renderText(html) {
  let text = html.replace(/<!--[\s\S]*?-->/g, ' ')
  text = removeHiddenElements(text)
  for (const tag of CHROME) text = removeElements(text, tag)
  text = removeNavigationBlocks(text)
  text = text.replace(BLOCKS, '\n').replace(/<[^>]*>/g, ' ')
  // A page can end mid-tag — cut by a byte cap, or by the server — and an unterminated tag is the one
  // fragment no `<…>` strip can remove. Only something shaped like a tag is dropped, so prose that merely
  // compares two numbers survives.
  text = text.replace(/<[a-z!/][^>]*$/i, ' ')
  text = decodeEntities(text.replace(/\r/g, ''))
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => !DROP_LINES.some((pattern) => pattern.test(line)))
    .filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== ''))
    .join('\n')
    .trim()
  if (text.length <= MAX_CHARS) return text
  return `${text.slice(0, MAX_CHARS).trimEnd()}\n\n[Truncated at ${MAX_CHARS} characters: the page continues.]`
}

/**
 * Decode the entities and collapse the whitespace a page carries.
 *
 * `bing.js` owns the same job for result text and is the tested implementation of it; this is a thin
 * re-export so a page and a snippet cannot disagree about what `&amp;` means.
 *
 * @param {string} value - the raw text.
 * @returns {string} readable text.
 */
function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => safeCodePoint(parseInt(hex, 16), match))
    .replace(/&#(\d+);/g, (match, decimal) => safeCodePoint(parseInt(decimal, 10), match))
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED.get(name.toLowerCase()) ?? match)
}

/** The named entities a page emits in prose, and their characters. */
const NAMED = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['ensp', ' '],
  ['emsp', ' '],
  ['thinsp', ' '],
  ['hellip', '…'],
  ['mdash', '—'],
  ['ndash', '–'],
])

/**
 * One numeric entity as text, or the entity itself when it names no Unicode scalar value.
 *
 * @param {number} value - the parsed code point.
 * @param {string} raw - the entity as it appeared.
 * @returns {string} the decoded character, or `raw`.
 */
function safeCodePoint(value, raw) {
  return Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : raw
}

/**
 * A fetch failure that carries the seam's own error code.
 *
 * `index.js` translates this into the seam's `WebError`, exactly as it does for the search half: the code
 * and the message are decided here, where the request is, and this module keeps no harness import.
 */
export class ArticleFetchError extends Error {
  /**
   * @param {string} message - what failed, in words a model can act on.
   * @param {string} code - `WEB_PROVIDER_ERROR` or `WEB_ABORTED`, the seam's vocabulary.
   * @param {ErrorOptions} [options] - standard options; `cause` carries the transport failure.
   */
  constructor(message, code, options) {
    super(message, options)
    this.name = 'ArticleFetchError'
    this.code = code
  }
}

/** True for the `AbortError` a fetch raises when its signal fires. */
function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** The provider's cancellation failure, keeping the caller's reason when one exists. */
function aborted(signal, fallback) {
  return new ArticleFetchError('Fetch aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/**
 * Read one page, following same-origin redirects only.
 *
 * Two hosts are involved when a redirect changes origin, and a provider that follows one has handed its
 * caller a page it did not ask for. The refusal names the target instead, so the caller can decide — the same
 * rule the search half follows for a different reason (ADR 0001).
 *
 * @param {string} url - the absolute http(s) URL.
 * @param {AbortSignal} [signal] - the caller's cancellation signal.
 * @returns {Promise<{response: Response, finalUrl: URL, html: string, capped: boolean}>} the answered page,
 *   decoded, and whether the byte bound stopped the read.
 */
async function readPage(url, signal) {
  let current = new URL(url)
  const origin = current.origin
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response
    try {
      response = await fetch(current, {
        method: 'GET',
        // Never follow silently: a hop is inspected, and one that changes origin is reported.
        redirect: 'manual',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      throw new ArticleFetchError(
        `Fetching ${current.href} failed: ${String(error)}. The failure was at the transport layer, `
          + 'before the page answered, so re-issuing the call may succeed.',
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location !== null) {
      let target
      try {
        target = new URL(location, current)
      } catch (error) {
        await response.body?.cancel()
        throw new ArticleFetchError(
          `${current.href} answered a redirect whose Location "${location}" is not a URL; this provider could not follow it.`,
          'WEB_PROVIDER_ERROR',
          { cause: error },
        )
      }
      if (target.origin !== origin) {
        await response.body?.cancel()
        throw new ArticleFetchError(
          `${current.href} redirects to ${target.href} on another origin (${target.origin}); `
            + 'this provider follows same-origin redirects only. Fetch that URL if it is the page you want.',
          'WEB_PROVIDER_ERROR',
        )
      }
      await response.body?.cancel()
      current = target
      continue
    }
    let html
    let capped
    try {
      const body = await readBody(response, MAX_BYTES)
      html = body.text
      capped = body.capped
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error)
      throw new ArticleFetchError(
        `Reading ${current.href} failed: ${String(error)}`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }
    return { response, finalUrl: current, html, capped }
  }
  throw new ArticleFetchError(
    `${url} redirects more than ${MAX_REDIRECTS} times; this provider stops following there.`,
    'WEB_PROVIDER_ERROR',
  )
}

/**
 * The readable-text fetch provider registered with `ctx.web`.
 *
 * `available()` is a constant, for the same reason as the search half: nothing here needs configuring, and a
 * provider that reported itself unavailable would turn a fetch into an error the caller cannot act on.
 */
export class ArticleFetchProvider {
  /** @type {string} */
  id = PROVIDER_ID

  /** Whether this provider can run now; it can, without a key or a setting. */
  available() {
    return true
  }

  /**
   * Retrieve one URL as readable text.
   *
   * @param {{url: string}} request - the seam's fetch request.
   * @param {AbortSignal} [signal] - the caller's cancellation signal.
   * @returns {Promise<{url: string, statusCode: number, body: {kind: string, content: string}, truncated: boolean}>}
   *   the retrieval outcome; a non-2xx response is a result, not a throw.
   * @throws {ArticleFetchError} `WEB_ABORTED` when cancelled, `WEB_PROVIDER_ERROR` otherwise.
   */
  async fetch(request, signal) {
    const url = typeof request?.url === 'string' ? request.url.trim() : ''
    if (url.length === 0) throw new ArticleFetchError('A fetch needs a URL', 'WEB_PROVIDER_ERROR')
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      throw new ArticleFetchError(`"${url}" is not a URL`, 'WEB_PROVIDER_ERROR')
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new ArticleFetchError(
        `Refusing to fetch ${url}: only http(s) destinations are fetched.`,
        'WEB_PROVIDER_ERROR',
      )
    }
    if (signal?.aborted === true) throw aborted(signal)

    const { response, finalUrl, html, capped: readWasCapped } = await readPage(parsed.href, signal)
    // A non-2xx answer is a result, not a failure: the caller reads it and decides.
    const ok = response.status >= 200 && response.status < 300
    const contentType = response.headers.get('content-type') ?? ''
    const isMarkup = /html|xml/i.test(contentType) || html.trimStart().startsWith('<')
    const content = ok && isMarkup ? extractArticle(html) : html.slice(0, MAX_CHARS)
    // `truncated` says a *bound* took something, not that extraction removed chrome — that is what it is
    // for. A capped extraction is longer than the cap because the marker is appended to it; a capped read
    // is the reader's own report, because a decoded body can never be longer than the bound it was read
    // under, so re-deriving it from `html.length` would always answer false at the 5 MB cap.
    const capped = (ok && isMarkup) ? content.length > MAX_CHARS : html.length > MAX_CHARS
    return {
      url: finalUrl.href,
      statusCode: response.status,
      body: { kind: 'text', content },
      truncated: readWasCapped || capped,
    }
  }
}
