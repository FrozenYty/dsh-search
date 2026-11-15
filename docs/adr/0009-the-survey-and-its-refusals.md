# 0009 — The survey, and the upgrades it refused

- **Status:** accepted, 2026-11-15
- **Supersedes:** ADR 0005's description of *how* Claude Code's search and fetch are wired (its decision — that
  a local keyless provider is the right shape here — stands)
- **Related:** ADR 0001 (endpoint), ADR 0004 (one backend), ADR 0008 (the one upgrade adopted with code)

## Context

Ask a plugin to "get better" and the honest first move is to find out what better looks like, because the
alternatives are a blog-post checklist and cargo-culting. Three surveys were run in parallel, each required to
cite a file, a line or a fetched document rather than a reputation:

1. **The GitHub landscape** — the DSH family's own search plugins, and the mature scrapers and MCP servers that
   are the real reference points (`searxng/searxng` 39.5k stars, `deedy5/ddgs` 3.1k with a release four weeks
   ago, `Nv7-GitHub/googlesearch` 787, plus the keyed MCP servers).
2. **Claude Code** — the installed package read at byte offsets, plus Anthropic's published server-tool docs.
3. **Codex and PI** — the Codex CLI's two wirings, and what `pi`/`pi-ai` actually is.

The findings that changed the picture are in the next two sections; the refusals are the rest of the ADR.

## What the survey found, corrected

**Claude Code's search is not a server tool declared in the conversation.** `WebSearch` is a *client* tool: when
the model calls it, Claude Code issues a separate nested model request whose system prompt is "You are an
assistant for performing a web search tool use" and which *declares* `{"type":"web_search_20250305",
"max_uses":8, "allowed_domains", "blocked_domains"}` as an extra tool schema. Anthropic's infrastructure runs
the search for that inner call, and only titles and URLs come back to the main conversation, followed by a
`REMINDER` to cite them. That is a sharper statement than ADR 0005's "the API runs the searches", and it
explains why the main model never sees page text it did not ask for.

**Claude Code's fetch does not use the `web_fetch_*` server tool at all** — that string does not occur in the
binary. It fetches client-side: 10 MB body cap, 60 s timeout, `maxRedirects: 0` with same-host hops, Turndown
with `style/script/noscript/iframe` removed, a 1 MB HTML cap, 100 000 characters of markdown with an explicit
truncation marker, a 15-minute page cache, and then a *small, fast* model applies the caller's own prompt,
capped at 125 characters of quotation. So the product's "fetch" is a summarise-with-a-cheaper-model step, not
a fetch — and that is the one thing a keyless local plugin cannot copy, because it has no model to spend.

**Codex has two wirings, both remote.** A hosted `web_search` tool with `filters.allowed_domains`,
`user_location`, `search_context_size` and modes `disabled|cached|indexed|live` — **`cached` is the default** —
enabled by `--search`; and a standalone `web.run` that is client-*executed* but not local: one POST to the
provider's search endpoint, with commands for open/find/click rather than any local page reading.

**PI has no search of its own.** `earendil-works/pi` is an agent toolkit whose coding agent's tool set is
read/bash/powershell/edit/write/grep/find/ls; the one `web_search` in that repository is registered by a test.
What DSH's `dsh-llm-pi-ai` adapts is its provider layer, so its relevance here is that it carries
caller-declared tools to the provider — a reason **not** to teach it anything about search.

Two corroborations are worth recording because they say the local choices were right for the same reasons the
products chose them: Claude Code also refuses to follow a cross-host redirect and hands back an explicit
re-request recipe, which is what this provider already does with its "it redirects to X" message; and every
product bounds a call in the contract (`max_uses: 8`, `maxResultSizeChars`), which the shipped `web_search`
does with `searchMaxResults` and `searchMaxQueries` — not something this bundle should duplicate.

## Decision

**One upgrade is adopted, one correctness fix, and eight well-argued upgrades are refused with the measurement
that refuses them.** A refused upgrade is a result, not an omission: this repository's ADRs 0001 and 0004
already settled three questions this way, and the survey's value is mostly in knowing what not to build.

### Adopted

- **A reuse window** — ADR 0008. Best-evidenced item in the corpus (four scrapers, Claude Code's page cache,
  Codex's `cached` default), and the request count is the resource that can get this client challenged.
- **Decode the charset the response declares.** Not in any ranked list; found by reading our own code.
  `Response.text()` decodes UTF-8 whatever the header says, so a mis-declared page would arrive as
  correct-looking mojibake with the same source count — the one failure mode worse than an error, because the
  drift job cannot see it. Two tests: a GBK body parses to the right characters, and an unusable label falls
  back to UTF-8 instead of losing the page.

### Refused, with the measurement that refuses it

| Upgrade | Evidence for it | Why this bundle still does not |
|---|---|---|
| Retry a transport failure, with backoff | `searxng` retries only statuses `[403,429]`, ≤3 attempts elsewhere; but its rationale is *"on each retry, SearXNG uses a different proxy and source ip"* | 25 sequential live searches: **0 failures**, p50 151 ms, max 220 ms. Retrying from the same egress is the documented anti-pattern, and this client has one egress |
| Normalise URLs before dedupe | asserted as best practice all over; **no implementation in the corpus actually does it** (the only normalisation present unwraps the engine's own redirect wrapper) | 90 parsed results across 9 pages: **0 exact duplicates, 0 duplicates modulo tracking parameter, trailing slash or `www.`**. Code that cannot fire |
| Cap the snippet length | `mcp-server-fetch` caps at 5 000 chars — for *pages*, not for SERP snippets | 70 snippets: min 35, p50 78, p90 126, **max 132** characters. A 1 000-char cap would be insurance against a distribution nobody has seen |
| Reject off-topic / navigational result sets | one implementation does it, with two named real failures | There is no second engine to hand off to (ADR 0004), so the guard can only turn a plausible-but-wrong answer into an error. A downgrade until a fallback exists |
| Cap the response body | every MCP fetch server has one | 9 pages: 101 757–104 021 bytes, a **2 % spread**. The caller's deadline bounds the read; a cap would be a number invented above a distribution this flat |
| A provider-side timeout | `mcp-server-fetch` defaults to 30 s | 25 searches, **max 220 ms** against a 60 s budget set by the tool. A second deadline cannot fire before the first |
| UA rotation, browser disguise | `ddgs` randomises a feature-phone UA, `googlesearch` switched to Lynx to fix empty results | Measured earlier: a browser disguise turns CSDN's 200 into **521** and does not fix Zhihu's 403. The UA is already chosen for the endpoint, which is one decision, not a knob |
| An internal error taxonomy (`timeout`, `transient`, …) | `ddgs`, `Walvez` and others name error kinds | The seam carries exactly two codes to the model and this bundle has no logging surface. A taxonomy with nowhere to be published is decoration |

Also refused, for the reason the ADR already gave: paging (every offset, count, `FPIG` next link, cookie and
RSS form returns page one), multi-engine fallback (nine candidates measured twice), and domain filtering
(the seam's search request carries only `query` and `maxResults`, so there is no field to filter by).

## Consequences

- The bundle is one provider, one endpoint, one request per miss, a five-minute window on a hit, and the
  charset the page declares.
- The next survey has a baseline to argue against rather than to redo: every refusal above names the number
  that produced it, so a future measurement that moves one of them says so by name.
- `docs/adr/0005-local-search-vs-server-side.md` keeps its decision and now has a corrected description of the
  thing it compares against, one ADR later. That is the second time a "how the other product works" claim has
  needed the binary or the docs rather than a memory of a talk.
