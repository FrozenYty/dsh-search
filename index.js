/**
 * dsh-search — a keyless Bing-backed search provider for the `ctx.web` seam.
 *
 * The bundle is one provider and nothing else: it registers `bing-html` with the web seam, and
 * `web_search` then runs one HTTPS GET against Bing's public result page instead of an auxiliary model
 * call against an API account. That is the whole point of the plugin — search keeps working when the
 * account behind the shipped DeepSeek provider has no balance, and it spends no model quota
 * (docs/architecture-en.md).
 *
 * WHY THIS ENTRY IMPORTS SOMETHING, WHEN THE SIBLING PLUGINS IMPORT NOTHING
 * A profile-link bundle usually cannot resolve a bare `@deepseek-ai/*` specifier: the link is a real
 * path outside the profile, so Node walks up from it and never reaches the profile's `node_modules`.
 * The Host makes one exception, and this bundle is built on it: at each ancestor `node_modules`
 * position of a *linked* root, a package name the linked root's own `package.json` declares as a peer
 * and that the runtime table carries resolves to the runtime's copy. Declaring the seam as a peer is
 * therefore what makes this import resolve, and the file below is the bundle's only harness import —
 * `bing.js` stays import-free so plain `node` can exercise the real search path
 * (docs/adr/0002-peer-dependency-on-the-web-seam.md).
 *
 * The import exists for one reason: a provider failure is a `WebError` carrying the seam's code, so
 * callers and the model route on it rather than on a message. `bing.js` decides the code and the
 * message where the request is; this file only moves the failure into the seam's class.
 *
 * The id is `bing-html`, and the class is the provider the seam's own registry consumes:
 * `{ id, available(), search(request, signal) }`. No `Config` schema: there is nothing to configure
 * (ADR 0003).
 */

import { WebError } from '@deepseek-ai/dsh-web'

import { BingSearchError, BingSearchProvider } from './bing.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-search'

/** The web seam this provider registers into. */
export const inject = ['web']

/**
 * Register the Bing HTML search provider with `ctx.web`.
 *
 * The provider is registered whether or not the profile pins it. An unpinned seam with two usable
 * providers answers `WEB_PROVIDER_AMBIGUOUS`, so the bundle patch points `web.searchProvider` at
 * `bing-html` — that entry, not this call, is what selects it (docs/architecture-en.md).
 *
 * @param {object} ctx - the plugin context, supplying `ctx.web`.
 */
export function apply(ctx) {
  const provider = new BingSearchProvider()
  ctx.web.registerSearchProvider({
    id: provider.id,
    available: () => provider.available(),
    async search(request, signal) {
      try {
        return await provider.search(request, signal)
      } catch (error) {
        if (!(error instanceof BingSearchError)) throw error
        throw new WebError(error.message, error.code, { cause: error })
      }
    },
  })
}
