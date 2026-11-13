# 0005 — Local search, contrasted with the server-side tool Claude Code uses

- **Status:** accepted, 2026-11-13
- **Related:** ADR 0001 (endpoint), ADR 0004 (one backend, measured)

## Context

The question was how Claude Code implements its `web_search`, and whether this bundle should copy it.
Answered by reading the shipped product rather than its documentation: Claude Code 2.1.178 ships as a native
binary (`@anthropic-ai/claude-code/bin/claude.exe`, 246 MB) with `sdk-tools.d.ts` describing every tool's
input and output. The binary's strings and that type file are the evidence below. (Fetching the online docs
failed in this environment — the URL cross-origin-redirects twice and `web_fetch` refuses cross-origin
redirects by design, which is itself an illustration of a limit this repository documents.)

## What Claude Code does

The client declares a **server tool** and Anthropic's servers run the search. From the binary:

```js
function LG5(H){return{type:"web_search_20250305",name:"web_search",
  allowed_domains:H.allowed_domains,blocked_domains:H.blocked_domains,max_uses:8}}
```

- **No search request leaves the client.** The tool is a declaration in the model request; the results come
  back inside the model's response stream.
- `max_uses: 8` bounds searches per request.
- Its input schema is `{ query, allowed_domains?, blocked_domains? }`, and its output is
  `{ query, results: [{ tool_use_id, content: [{ title, url }] } | string], durationSeconds }` — the hits are
  **title and URL**, and a `string` entry is described as "text commentary from the model".
- Its own tool description, also in the binary, says the search is **US-only**, tells the model to use the
  current month for recency, that the domain fields filter results, and to end with a `Sources:` list.
- The same binary documents newer versions, `web_search_20260209` / `web_fetch_20260209`, whose
  **dynamic filtering** lets "Claude write and execute code to filter search results before they reach the
  context".
- Its fetch tool is `{ url, prompt }`: the page is fetched and a **prompt is run over it**, i.e. a model step
  sits between the page and the context.

## Why this bundle is local instead

The official DSH provider (`@deepseek-ai/dsh-web-search-deepseek`) is the *same architecture* as Claude
Code's: the search happens on the provider's servers, on the account. That is exactly why it answers HTTP
402 when the balance is zero — measured, and the reason this bundle exists. Performing the search on the
machine is what makes the feature work with no key, no balance and no account, and it is why the engine had
to be chosen by measurement (ADR 0001, ADR 0004) instead of inherited from a vendor.

The two designs are not better and worse; they trade differently:

| | Claude Code | this bundle |
|---|---|---|
| who performs the search | Anthropic's servers, as a server tool | this machine, one GET to `cn.bing.com` |
| what it needs | an Anthropic account; US-only per its own description | nothing; reachable wherever Bing is |
| per-call bound | `max_uses: 8` | the seam's `searchMaxResults: 8`, `searchMaxQueries: 4` |
| a hit carries | title, URL | title, URL, snippet, and `publishedAt` when the page states one |
| domain filtering | `allowed_domains` / `blocked_domains` in the request | none — see below |
| filtering before the context | code execution, server-side (2026-02-09 versions) | none: one page is parsed locally and handed over |
| fetching a page | `WebFetch` with a prompt (a model step over the page) | the shipped HTTP provider returns text; the main model reads it |

## What we cannot close inside this bundle, and where it would close

- **Domain allow/block.** The seam's search request is `{ query, maxResults }`; there is no field for
  domains, so a provider cannot receive them. A model can write `site:` into the query, and measured on this
  endpoint that is honoured only when the query is nothing but the operator (ADR 0004's section on query
  operators). If the seam ever grows a domain field, that is the moment to match Claude Code here.
- **A prompt over fetched content.** The seam's fetch request has no prompt, so the shipped provider returns
  the page's text and the *main* model reads it. That is why a noisy page reaches the model with its
  navigation and ads attached: the difference is **where the filtering model sits**, not a defect. A
  `web_fetch` prompt field would be the seam's change to make, not ours.
- **Dynamic filtering.** Claude's newest versions filter results with generated code before they reach the
  context. We have one page and a parser, which is the cheap version of the same intent: the page never
  enters the context at all — only the parsed sources do.

## Consequences

- No code changes. This record exists so that "why don't we just do what Claude Code does?" has an answer
  with evidence, and so that the two seam fields above are recognised as the places where the gap would
  close — not as defects in this provider.
- Where this bundle is ahead, and it is worth saying plainly: a source here carries an excerpt and, when
  stated, a date that the tool renders as metadata. Claude Code's hits are a title and a URL.
- The per-call bound every implementation converges on — 8 searches, 8 results — is the same instinct in
  three places: `max_uses: 8` there, `searchMaxResults: 8` here.
