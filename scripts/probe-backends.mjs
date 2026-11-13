#!/usr/bin/env node
/**
 * Ask the network, not a memory, which search backends this machine can actually use.
 *
 * "Can we add Google?" and "should we keep only Bing?" are questions about *this* network path, and they
 * change when it changes: a VPN, a proxy, a new region, an engine that starts rate-limiting. This script
 * is how that question stays answerable in one command instead of in a paragraph of stale prose.
 *
 * It sends exactly one request per candidate and judges the answer by what a parser would need:
 *
 *   usable      2xx, and the page carries result blocks a rule could read
 *   wrapped     2xx with results, but every result URL is the engine's own redirect
 *   challenge   2xx, but the page is a captcha or a consent gate rather than results
 *   blocked     a non-2xx status
 *   unreachable the request never completed
 *
 * `wrapped` matters more than it looks: `web_fetch` follows **same-origin** redirects only, so a result
 * URL on the engine's own host is a URL the model cannot open.
 *
 * Usage: node scripts/probe-backends.mjs [query]
 * Exits non-zero when the backend this bundle depends on — Bing's — is not usable.
 */

const query = process.argv[2] ?? 'deepseek harness'
const ENCODED = encodeURIComponent(query)

/** The candidates, each with the marker a parser would look for and the host it answers on. */
const CANDIDATES = [
  {
    name: 'bing',
    primary: true,
    url: `https://cn.bing.com/search?q=${ENCODED}&form=QBLH`,
    results: /<li\b[^>]*\bclass\s*=\s*"[^"]*\bb_algo\b[^"]*"/gi,
    wrapped: false,
  },
  {
    name: 'google',
    url: `https://www.google.com/search?q=${ENCODED}&hl=zh-CN&num=10`,
    results: /<a\b[^>]*\bhref\s*=\s*"\/url\?q=/gi,
    wrapped: true,
  },
  {
    name: 'duckduckgo',
    url: `https://html.duckduckgo.com/html/?q=${ENCODED}`,
    results: /<a\b[^>]*\bclass\s*=\s*"[^"]*\bresult__a\b[^"]*"/gi,
    wrapped: false,
  },
  {
    name: 'brave',
    url: `https://search.brave.com/search?q=${ENCODED}`,
    results: /<a\b[^>]*\bclass\s*=\s*"[^"]*\bresult-header\b[^"]*"/gi,
    wrapped: false,
  },
  {
    name: 'mojeek',
    url: `https://www.mojeek.com/search?q=${ENCODED}`,
    results: /<a\b[^>]*\bclass\s*=\s*"[^"]*\btitle\b[^"]*"[^>]*href="https?:/gi,
    wrapped: false,
  },
  {
    name: 'baidu',
    url: `https://www.baidu.com/s?wd=${ENCODED}&rn=20`,
    results: /<div[^>]*\bclass\s*=\s*"result[^"]*"[^>]*\bmu\s*=\s*"https?:/gi,
    wrapped: false,
  },
  {
    name: 'so360',
    url: `https://www.so.com/s?q=${ENCODED}`,
    results: /<h3[^>]*>[\s\S]{0,200}?<a\b[^>]*href="https?:\/\//gi,
    wrapped: true,
  },
  {
    name: 'sogou',
    url: `https://www.sogou.com/web?query=${ENCODED}`,
    results: /<h3[^>]*>[\s\S]{0,200}?<a\b[^>]*href="https?:\/\//gi,
    wrapped: true,
  },
  {
    name: 'searxng',
    url: `https://searx.be/search?q=${ENCODED}`,
    results: /<article\b[^>]*\bclass\s*=\s*"[^"]*\bresult\b[^"]*"/gi,
    wrapped: false,
  },
]

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
}
const CHALLENGE = /captcha|verify you are human|are you a robot|unusual traffic|enable javascript|请启用|人机验证|安全验证/i

const outcomes = []
for (const candidate of CANDIDATES) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  let verdict
  let detail = ''
  try {
    const response = await fetch(candidate.url, { redirect: 'manual', headers: HEADERS, signal: controller.signal })
    const body = await response.text()
    const blocks = (body.match(candidate.results) ?? []).length
    if (response.status < 200 || response.status >= 300) {
      verdict = response.status >= 300 && response.status < 400 ? 'challenge' : 'blocked'
      detail = `HTTP ${response.status}${response.headers.get('location') === null ? '' : ` → ${new URL(response.headers.get('location'), candidate.url).host}`}`
    } else if (CHALLENGE.test(body.slice(0, 20000))) {
      verdict = 'challenge'
      detail = 'the page says so in its own words'
    } else if (blocks < 3) {
      verdict = 'challenge'
      detail = `${blocks} result block(s) matched`
    } else {
      verdict = candidate.wrapped ? 'wrapped' : 'usable'
      detail = `${blocks} result blocks`
    }
    outcomes.push({ name: candidate.name, primary: candidate.primary === true, verdict, detail, bytes: body.length })
  } catch (error) {
    outcomes.push({ name: candidate.name, primary: candidate.primary === true, verdict: 'unreachable', detail: error.message.slice(0, 60), bytes: 0 })
  } finally {
    clearTimeout(timer)
  }
}

console.log(`query: ${query}\n`)
for (const outcome of outcomes) {
  console.log(`${outcome.name.padEnd(11)} ${outcome.verdict.padEnd(12)} ${String(outcome.bytes).padStart(8)} bytes  ${outcome.detail}`)
}
const usable = outcomes.filter((outcome) => outcome.verdict === 'usable')
console.log(`\nusable backends: ${usable.length === 0 ? 'none' : usable.map((outcome) => outcome.name).join(', ')}`)
const primary = outcomes.find((outcome) => outcome.primary)
if (primary?.verdict !== 'usable') {
  console.error(`\nthe backend this bundle depends on (${primary?.name}) is ${primary?.verdict}: ${primary?.detail}`)
  process.exit(1)
}
console.log('a second backend is worth adding when one of these reads "usable" and stays that way — see docs/adr/0004')
