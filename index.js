/**
 * dsh-search — a keyless Bing-backed search provider for the `ctx.web` seam, with the choice of who
 * serves a search left to the profile's owner.
 *
 * The bundle registers `bing-html` with the web seam, and `web_search` then runs one HTTPS GET against
 * Bing's public result page instead of an auxiliary model call against an API account. That is the whole
 * point of the plugin — search keeps working when the account behind the shipped DeepSeek provider has no
 * balance, and it spends no model quota (docs/architecture-en.md).
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
 * ONE CONFIGURED FIELD, AND WHY IT EXISTS
 * The seam selects exactly one search provider per call and takes no provider argument, so "who searches"
 * can only be decided where the seam reads it: the config of the row a profile loads. This bundle's row
 * carries `provider`, and its three values are the owner's choice rather than this bundle's
 * (docs/adr/0006-choosing-the-search-provider.md):
 *
 *   keyless   (default) Bing's result page, no account involved
 *   official            the shipped DeepSeek provider, on the account and its balance
 *   auto                the shipped provider when it can run, otherwise keyless
 *
 * There is no `Config` schema on purpose: Cordis passes a row's config through unchanged when a plugin
 * declares none, so the field costs no dependency and cannot reject a profile's config.
 */

import { WebError } from '@deepseek-ai/dsh-web'

import { ArticleFetchError, ArticleFetchProvider } from './article.js'
import { BingSearchError, BingSearchProvider } from './bing.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-search'

/** The web seam this provider registers into. */
export const inject = ['web']

/** The shipped provider a profile can hand a search to instead, when its owner says so. */
const OFFICIAL_PROVIDER_ID = 'deepseek-official'

/** The supported values of the row's `provider` field; anything else means the first one. */
const MODES = ['keyless', 'official', 'auto']

/**
 * Register the search provider with `ctx.web`, routing each search the way the row's config asks.
 *
 * The provider is registered whether or not the profile pins it. An unpinned seam with two usable
 * providers answers `WEB_PROVIDER_AMBIGUOUS`, so the bundle patch points `web.searchProvider` at
 * `bing-html` — that entry, not this call, is what selects it (docs/architecture-en.md).
 *
 * @param {object} ctx - the plugin context, supplying `ctx.web`.
 * @param {{provider?: string}} [config] - this bundle's row config: `keyless`, `official` or `auto`.
 */
export function apply(ctx, config) {
  const mode = MODES.includes(config?.provider) ? config.provider : 'keyless'
  const provider = new BingSearchProvider()
  // `auto` pays for a failed shipped provider once, not on every search: an account that cannot pay is a
  // property of the account, and re-asking it on each call would add a doomed request to every answer.
  let officialFailed = false

  /**
   * Whether the seam says the shipped provider is registered.
   *
   * 0.2.2-rc.3 answers this through `listProviders()`, a public listing, and keeps `searchProviders`
   * private in its published typings; a release with neither is one whose registry this bundle cannot
   * read at all. The two are told apart so the failure names the right thing: an id that is missing from
   * a registry this bundle can read is not the same answer as a seam that exposes no registry.
   *
   * @returns {boolean | undefined} true or false, or undefined when the seam exposes no registry.
   */
  function officialRegistered() {
    const web = ctx.web
    if (typeof web.listProviders === 'function') {
      return (web.listProviders()?.search ?? []).some((entry) => entry.id === OFFICIAL_PROVIDER_ID)
    }
    return web.searchProviders?.has(OFFICIAL_PROVIDER_ID)
  }

  /** The shipped provider, when it is registered and says it can run. */
  function officialProvider() {
    const registered = officialRegistered()
    if (registered !== true) {
      throw new WebError(
        registered === false
          ? `this profile asked for the shipped search provider "${OFFICIAL_PROVIDER_ID}", which is not registered; set provider: keyless on this bundle's row to search without an account`
          : `this seam exposes no provider registry, so the shipped search provider "${OFFICIAL_PROVIDER_ID}" cannot be looked up; set provider: keyless on this bundle's row to search without an account`,
        'WEB_PROVIDER_CONFIGURED_MISSING',
      )
    }
    // `listProviders()` answers registration with `{ id, title, description }` entries, not with the
    // provider: `available()` and `search()` are still reached through the runtime map, which the typings
    // mark private but 0.2.2-rc.3 keeps. A seam that lists a provider and hands over no object to call
    // cannot serve this mode, and says so rather than pretending the provider is absent.
    const candidate = ctx.web.searchProviders?.get(OFFICIAL_PROVIDER_ID)
    if (candidate === undefined) {
      throw new WebError(
        `this seam exposes no provider registry a provider can be reached through: it lists "${OFFICIAL_PROVIDER_ID}" but hands over no object to call; set provider: keyless on this bundle's row to search without an account`,
        'WEB_PROVIDER_CONFIGURED_MISSING',
      )
    }
    if (!candidate.available()) {
      throw new WebError(
        `the shipped search provider "${OFFICIAL_PROVIDER_ID}" is registered but reports itself unavailable; that synchronous self-report is all this bundle can see, so a dead credential or an empty balance surfaces later, from the provider's own failure`,
        'WEB_PROVIDER_CONFIGURED_UNAVAILABLE',
      )
    }
    return candidate
  }

  /** Bing's result page: the path that needs no account. */
  async function keyless(request, signal) {
    try {
      return await provider.search(request, signal)
    } catch (error) {
      if (!(error instanceof BingSearchError)) throw error
      throw new WebError(error.message, error.code, { cause: error })
    }
  }

  async function search(request, signal) {
    if (mode === 'official') return officialProvider().search(request, signal)
    if (mode === 'auto' && !officialFailed) {
      let candidate
      try {
        candidate = officialProvider()
      } catch {
        // Not registered, or registered and unable to run: nothing to remember, the choice falls through.
        candidate = undefined
      }
      if (candidate !== undefined) {
        try {
          return await candidate.search(request, signal)
        } catch (error) {
          if (signal?.aborted === true) throw error
          officialFailed = true
        }
      }
    }
    return keyless(request, signal)
  }

  // The picker shows a provider's `title` and falls back to its bare id when there is none, so both
  // halves of this bundle carry one; `description` is a `LocalizedText`, so each UI reads its own
  // language rather than a string this bundle picked for it.
  ctx.web.registerSearchProvider({
    id: provider.id,
    title: 'Bing Search',
    description: {
      en: 'No account, reads the page.',
      zh: '无需账户，直读网页。',
    },
    available: () => provider.available(),
    search,
  })

  // The fetch half: the same bundle, the other capability. A page's chrome is what the model pays for on
  // every later turn of a session, and it is measured, not assumed (docs/adr/0010-the-other-half-of-the-result.md).
  const article = new ArticleFetchProvider()
  ctx.web.registerFetchProvider({
    id: article.id,
    title: 'Readable Page',
    description: {
      en: 'Prose, not markup.',
      zh: '只交正文，不交标记。',
    },
    available: () => article.available(),
    async fetch(request, signal) {
      try {
        return await article.fetch(request, signal)
      } catch (error) {
        if (!(error instanceof ArticleFetchError)) throw error
        throw new WebError(error.message, error.code, { cause: error })
      }
    },
  })
}
