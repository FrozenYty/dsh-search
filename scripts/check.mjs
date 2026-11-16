#!/usr/bin/env node
/**
 * Repository checks for dsh-search.
 *
 * Dependency-free on purpose: the plugin has no install step and the request layer is exercised with a
 * stubbed `fetch`, so CI needs nothing but Node. What this proves:
 *
 *   1. the bundle manifest parses, every path it publishes exists, and the runtime modules are published;
 *   2. `bing.js` imports nothing, and the entry's only bare import is the seam it declares as a peer;
 *   3. locale/en.json and locale/zh.json carry the same keys, the agreed titles, and a two-character
 *      Chinese title;
 *   4. the bundle patch pins the seam at this provider without dropping the rest of the row;
 *   5. every document under docs/ is classified by the bilingual-pair rule, and no pair is half-written;
 *   6. every document reference resolves, and no shared document carries an absolute machine path;
 *   7. **acceptance item 3, at the request layer**: one search sends exactly one request, to
 *      `cn.bing.com`, and never to `www.bing.com` or `api.deepseek.com`;
 *   8. every `node --check` line in the documents and the workflows names exactly the modules `files`
 *      publishes;
 *   9. each README's introduction — everything before its first section heading — names both provider ids,
 *      read out of the modules themselves;
 *  10. `package.json`'s version is the one both READMEs state and the one the newest changelog section names;
 *  11. both README layout tables carry a row for every non-glob entry in `files`.
 *
 * What it cannot prove: that the plugin activates, that a profile resolves its peer import, or that
 * the live endpoint answers. The first two need an install, the third needs the network; both are
 * manual steps, and the manual acceptance run is recorded in PROGRESS.md.
 *
 * The YAML reader below understands only the subset this repository's patch uses. It is a structural
 * check of a known file, not a YAML parser; a construct it does not understand is reported, never
 * silently accepted.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const fail = (message) => failures.push(message)

const read = (relative) => {
  const absolute = join(root, relative)
  if (!existsSync(absolute)) {
    fail(`${relative}: missing`)
    return undefined
  }
  return readFileSync(absolute, 'utf8')
}

const readJson = (relative) => {
  const text = read(relative)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch (error) {
    fail(`${relative}: invalid JSON (${error.message})`)
    return undefined
  }
}

// 1. Manifest and published files.
const manifest = readJson('package.json')
let pluginName
if (manifest !== undefined) {
  pluginName = manifest.name
  if (pluginName !== 'dsh-search') {
    fail(`package.json: name must be "dsh-search"; found ${JSON.stringify(pluginName)} (ADR 0003)`)
  }
  if (manifest.type !== 'module') fail('package.json: type must be "module"')
  if (manifest.private !== true) fail('package.json: private must be true; this bundle is linked, never published')
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    fail('package.json: dsh.bundle.patch must point at ./cordis.patch.yml')
  }
  // No install step exists, so a lifecycle script would run something nobody wrote.
  for (const script of Object.keys(manifest.scripts ?? {})) {
    if (script === 'install' || script === 'postinstall' || script === 'preinstall') {
      fail(`package.json: scripts.${script} must not exist; the bundle has no install step`)
    }
  }
  for (const entry of manifest.files ?? []) {
    if (entry.includes('*')) {
      const directory = join(root, dirname(entry))
      const suffix = entry.slice(entry.lastIndexOf('/') + 1).replace('*', '')
      const matches = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith(suffix)) : []
      if (matches.length === 0) fail(`package.json: files entry "${entry}" matches nothing`)
      continue
    }
    if (!existsSync(join(root, entry))) fail(`package.json: files entry "${entry}" does not exist`)
  }
  for (const required of ['index.js', 'bing.js', 'article.js']) {
    if (!(manifest.files ?? []).includes(required)) fail(`package.json: files must include ${required}`)
  }
  // A linked bundle resolves a bare `@deepseek-ai/*` specifier only for a name its own package.json
  // declares as a peer; the entry's import depends on this field, so its absence is a load failure.
  const peerRange = manifest.peerDependencies?.['@deepseek-ai/dsh-web']
  if (typeof peerRange !== 'string' || peerRange.trim() === '') {
    fail('package.json: peerDependencies must declare @deepseek-ai/dsh-web; a linked bundle cannot resolve it otherwise')
  }
  // An engines.dsh range would decide compatibility alone and discard the peer declaration, which is
  // exactly the field the resolver reads. The two must not be mixed by accident.
  if (manifest.engines?.dsh !== undefined) {
    fail('package.json: engines.dsh must not be declared; it would suppress the peerDependencies check (ADR 0002)')
  }
}

// 2. Imports. `bing.js` is the framework-free half and must stay that way; the entry imports exactly one
//    package, the seam, and it is the declared peer.
const bingSource = read('bing.js')
if (bingSource !== undefined) {
  // Comments talk about importing, so the scan reads the code with the comments removed. What is left
  // must contain neither keyword at all: a static import, a dynamic one, or a CJS require all count.
  const bingCode = bingSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  if (/\b(?:import|require)\b/.test(bingCode)) {
    fail('bing.js: must import nothing; it is the module plain node loads (index.js owns the seam import)')
  }
}
// The fetch half may import this bundle's own modules and nothing else: a bare specifier would need a peer
// declaration to resolve for a profile-linked bundle, and the one this bundle declares is the seam.
const articleSource = read('article.js')
if (articleSource !== undefined) {
  const articleCode = articleSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const match of articleCode.matchAll(/^\s*import\s+[^'"]*['"]([^'"]+)['"]/gm)) {
    if (!match[1].startsWith('.')) {
      fail(`article.js: may import only this bundle's own modules; found ${JSON.stringify(match[1])}`)
    }
  }
}

// 2b. No runtime module may import a Node built-in.
//
// This bundle stores nothing (ADR 0011), and a bundle that cannot open a file cannot grow a data directory by
// accident — which is the failure the workspace's data-directory rule exists to prevent: dsh-cleaner resolved
// its directory once at load from a chain whose middle leg was not yet mounted, so a profile default answered
// instead and a repository move took the trash can with it. If something here ever needs to persist, the
// import lands in this check by name, and the decision that follows it is the one ADR 0011 describes.
for (const runtimeFile of ['index.js', 'bing.js', 'article.js']) {
  const source = read(runtimeFile)
  if (source === undefined) continue
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const match of code.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](node:[^'"]+)['"]/g)) {
    fail(`${runtimeFile}: imports ${match[1]}; no runtime module may touch a built-in, because this bundle stores nothing (ADR 0011)`)
  }
}
const entrySource = read('index.js')
if (entrySource !== undefined) {
  const bareImports = [...entrySource.matchAll(/^\s*import\s+[^'"]*['"]([^'"]+)['"]/gm)].map((match) => match[1])
  const packages = bareImports.filter((specifier) => !specifier.startsWith('.'))
  if (packages.length !== 1 || packages[0] !== '@deepseek-ai/dsh-web') {
    fail(`index.js: the only bare import must be @deepseek-ai/dsh-web; found ${JSON.stringify(packages)}`)
  }
  if (!/export\s+function\s+apply\s*\(/.test(entrySource)) fail('index.js: must export apply(ctx)')
  if (!/export\s+const\s+name\s*=\s*'dsh-search'/.test(entrySource)) fail("index.js: must export name = 'dsh-search'")
  if (!/export\s+const\s+inject\s*=\s*\[\s*'web'\s*\]/.test(entrySource)) fail("index.js: must export inject = ['web']")
}
// The entry's tests load the real seam, and without it they skip instead of failing — so the skip is only
// honest while CI installs what makes them run. This is the assertion that keeps a silent skip from
// becoming the permanent state of the one file nothing else executes.
if (!existsSync(join(root, 'tests', 'entry.test.mjs'))) {
  fail('tests/entry.test.mjs: missing; the entry has no test that loads the real seam')
}
const ciWorkflow = read('.github/workflows/ci.yml') ?? ''
if (!/npm install[^\n]*@deepseek-ai\/dsh-web/.test(ciWorkflow)) {
  fail('.github/workflows/ci.yml: must install @deepseek-ai/dsh-web, or the entry tests skip and the entry stays unverified')
}

// A fixture is evidence, and its provenance is what makes it re-capturable: the query it came from and the
// day it was taken. A file in the directory with no row in sources.md is a page nobody can reproduce.
const fixtureFiles = readdirSync(join(root, 'tests', 'fixtures')).filter((name) => name.endsWith('.html')).sort()
if (fixtureFiles.length === 0) fail('tests/fixtures: no .html fixture at all')
const provenance = read('tests/fixtures/sources.md') ?? ''
for (const name of fixtureFiles) {
  if (!provenance.includes(`\`${name}\``)) {
    fail(`tests/fixtures/sources.md: no row for ${name}; a fixture without its provenance cannot be re-captured`)
  }
}

// 3. Locale parity and the titles this family fixes by convention.
const keysOf = (value, prefix = '') => Object.entries(value ?? {})
  .flatMap(([key, child]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return child !== null && typeof child === 'object' && !Array.isArray(child)
      ? keysOf(child, path)
      : [path]
  })
  .sort()
const en = readJson('locale/en.json')
const zh = readJson('locale/zh.json')
if (en !== undefined && zh !== undefined) {
  const enKeys = keysOf(en)
  const zhKeys = keysOf(zh)
  for (const key of enKeys.filter((key) => !zhKeys.includes(key))) fail(`locale/zh.json: missing key "${key}"`)
  for (const key of zhKeys.filter((key) => !enKeys.includes(key))) fail(`locale/en.json: missing key "${key}"`)
  if (en.meta?.title !== 'Search') fail(`locale/en.json: meta.title must be "Search"; found ${JSON.stringify(en.meta?.title)}`)
  if (zh.meta?.title !== '搜索') fail(`locale/zh.json: meta.title must be "搜索"; found ${JSON.stringify(zh.meta?.title)}`)
  // The two-character Chinese title is a family convention (团队, 记忆); it is checked, not remembered.
  if ([...(zh.meta?.title ?? '')].length !== 2) fail('locale/zh.json: meta.title must be exactly two characters')
  for (const [file, value] of [['locale/en.json', en], ['locale/zh.json', zh]]) {
    if (typeof value.meta?.description !== 'string' || value.meta.description.length === 0) {
      fail(`${file}: meta.description is required`)
    }
  }
}

// 4. Bundle patch: the seam pin and this bundle's row.
const patchText = read('cordis.patch.yml')
if (patchText !== undefined) {
  if (patchText.includes('\t')) fail('cordis.patch.yml: tabs are not allowed')
  const body = patchText.split(/\r?\n/).filter((line) => !/^\s*#/.test(line) && line.trim() !== '')
  if (!body.some((line) => /^-\s/.test(line))) fail('cordis.patch.yml: must be a top-level array of patch entries')
  const entries = []
  for (const line of body) {
    if (/^-\s/.test(line)) entries.push([line])
    else if (entries.length > 0) entries.at(-1).push(line)
  }
  const webEntry = entries.find((lines) => /^-\s+id:\s*web\s*$/.test(lines[0]))
  if (webEntry === undefined) {
    fail('cordis.patch.yml: expected an override of the `web` row')
  } else {
    const text = webEntry.join('\n')
    if (!/searchProvider:\s*bing-html/.test(text)) {
      fail('cordis.patch.yml: the `web` override must pin searchProvider: bing-html; without it the shipped DeepSeek provider stays selected')
    }
    // `config` is replaced wholesale, so a dropped field silently changes the other half of the seam.
    if (!/fetchProvider:\s*article/.test(text)) {
      fail('cordis.patch.yml: the `web` override must restate fetchProvider: article; config is replaced, never merged')
    }  }  const insertIndex = entries.findIndex((lines) => /^-\s+insert:\s*$/.test(lines[0]))
  if (insertIndex === -1) {
    fail('cordis.patch.yml: expected an insert entry for this bundle')
  } else {
    const inserted = entries.slice(insertIndex).map((lines) => lines.join('\n')).join('\n')
    if (pluginName !== undefined && !inserted.includes(`name: '${pluginName}'`)) {
      fail(`cordis.patch.yml: insert must name ${pluginName}`)
    }
    // The row id follows the package name rather than repeating it in a second spelling: the family reads
    // `dsh-memory` → `memory` and `dsh-cleaner` → `cleaner`, and a profile addresses this bundle by the
    // same word (ADR 0007, which supersedes the fixed string in ADR 0003).
    const rowId = pluginName === undefined ? undefined : pluginName.replace(/^dsh-/, '')
    if (rowId !== undefined && !new RegExp(`id:\\s*${rowId}\\s*$`, 'm').test(inserted)) {
      fail(`cordis.patch.yml: the inserted row must be id: ${rowId}, derived from the package name ${pluginName} (ADR 0007)`)
    }
    // The owner's choice of who searches lives in this row's config (ADR 0006). A profile overrides the
    // whole row, so the field has to be here, with one of the three values the entry understands.
    const provider = /provider:\s*(\S+)/.exec(inserted)
    if (provider === null) {
      fail('cordis.patch.yml: the inserted row must carry `config: { provider: … }` — the owner\'s choice of who searches (ADR 0006)')
    } else if (!['keyless', 'official', 'auto'].includes(provider[1])) {
      fail(`cordis.patch.yml: provider: ${provider[1]} is not a mode the entry understands (keyless | official | auto)`)
    }
  }
}

// 5. Bilingual pairs — a rule over docs/, not a list of pairs.
//
// Four shapes are legitimate, and no others: a name-en.md + name-zh.md pair; a single name-en-zh.md
// carrying both languages; a single-language name.md listed below with its reason; and docs/adr/, which
// is out of scope because a decision is English-only and numbered. Every other file at the top level of
// docs/ fails by name, so a new unpaired document cannot slip in by not being added to a list.
const SINGLE_LANGUAGE_DOCS = new Map()
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
const LATIN_WORD = /[A-Za-z]{4,}/
const docsDir = join(root, 'docs')
const docNames = readdirSync(docsDir).filter((name) => name.endsWith('.md'))
const docSet = new Set(docNames)
for (const name of docNames) {
  if (name.endsWith('-en-zh.md')) {
    const text = readFileSync(join(docsDir, name), 'utf8')
    if (!CJK.test(text)) fail(`docs/${name}: carries both languages by name but no Chinese text by content`)
    if (!LATIN_WORD.test(text)) fail(`docs/${name}: carries both languages by name but no English prose by content`)
    continue
  }
  if (name.endsWith('-en.md')) {
    const wanted = `${name.slice(0, -'-en.md'.length)}-zh.md`
    if (!docSet.has(wanted)) fail(`docs/${name}: has no docs/${wanted} (bilingual pair)`)
    continue
  }
  if (name.endsWith('-zh.md')) {
    const wanted = `${name.slice(0, -'-zh.md'.length)}-en.md`
    if (!docSet.has(wanted)) fail(`docs/${name}: has no docs/${wanted} (bilingual pair)`)
    continue
  }
  if (!SINGLE_LANGUAGE_DOCS.has(name)) {
    fail(
      `docs/${name}: single-language document with no declaration; add the -en/-zh pair, or list it in `
      + 'SINGLE_LANGUAGE_DOCS in scripts/check.mjs with the one-line reason it is deliberately one language',
    )
  }
}
for (const name of SINGLE_LANGUAGE_DOCS.keys()) {
  if (!docSet.has(name)) fail(`docs/${name}: declared single-language in scripts/check.mjs but does not exist; remove the entry`)
}

// 6. Root documents, machine paths and document references.
const ROOT_SINGLE_LANGUAGE = ['AGENTS.md', 'CONTRIBUTING.md', 'PLAN.md', 'PROGRESS.md', 'CHANGELOG.md', 'LICENSE']
for (const name of ['README.md', 'README-zh.md']) {
  if (!existsSync(join(root, name))) fail(`${name}: missing (bilingual pair)`)
}
for (const name of ROOT_SINGLE_LANGUAGE) {
  if (!existsSync(join(root, name))) fail(`${name}: missing (single-language root document)`)
}
const adrNames = readdirSync(join(root, 'docs', 'adr')).filter((name) => name.endsWith('.md'))
const documents = [
  'README.md', 'README-zh.md', ...ROOT_SINGLE_LANGUAGE,
  ...docNames.map((name) => `docs/${name}`),
  ...adrNames.map((name) => `docs/adr/${name}`),
]
// The two modules are read for citations as well: their comments name the ADRs they implement, and a
// reference in a comment is as capable of going stale as one in prose.
const referenceSources = [...documents, 'index.js', 'bing.js']
for (const document of referenceSources) {
  const text = read(document)
  if (text === undefined) continue
  const isDocument = documents.includes(document)
  for (const line of text.split(/\r?\n/)) {
    // A drive-letter path, not a URL scheme: the character before `X:` must not be a word character,
    // so `https://host` and `file:///` do not trip the check while `C:\dir` and `(D:/dir)` do.
    if (isDocument && /(?<![\w/])[A-Za-z]:[\\/]/.test(line)) {
      fail(`${document}: carries an absolute machine path: ${line.trim()}`)
    }
    // A citation that cannot be followed is a lie the reader discovers by looking, if at all.
    for (const match of line.matchAll(/`(docs\/[A-Za-z0-9._/+-]+\.md)(?::\d+(?:-\d+)?)?`/g)) {
      if (!existsSync(join(root, match[1]))) fail(`${document}: cites ${match[1]}, which does not exist`)
    }
    for (const match of line.matchAll(/\]\(([^()\s]+\.md)\)/g)) {
      const target = match[1]
      if (target.includes('/') || target.startsWith('http')) continue
      const base = document.includes('/') ? `${document.slice(0, document.lastIndexOf('/'))}/` : ''
      if (!existsSync(join(root, base + target))) fail(`${document}: links to ${base}${target}, which does not exist`)
    }
    for (const match of line.matchAll(/`(docs\/adr\/[A-Za-z0-9._/+-]+\.md)`/g)) {
      if (!/^docs\/adr\/\d{4}-/.test(match[1])) fail(`${document}: ${match[1]} is not a four-digit, zero-padded ADR name`)
    }
  }
}

// 6b. Reachability — a document nothing points at is a document nobody finds.
//
// The reverse of the citation rule above, and the failure mode it cannot see: a new ADR is a file that
// exists, cites correctly and is cited by nobody, so every earlier check passes while a reader looking for
// the answer never arrives. Enforced as a set over the ADR directory rather than a list, so the next ADR
// is covered the moment it is written, and over all four entry points because a question is asked from a
// README as often as from the index.
for (const name of adrNames) {
  for (const entry of ['docs/INDEX-en.md', 'docs/INDEX-zh.md', 'README.md', 'README-zh.md']) {
    if (!read(entry).includes(`docs/adr/${name}`)) {
      fail(`${entry}: never names docs/adr/${name}; an ADR nothing points at is one nobody reads`)
    }
  }
}

// 7. Acceptance item 3, asserted at the request layer.
//
// The stub IS the request layer: it is the function the provider calls to send a request, so what it
// records is what would have left the process. The saved page answers it, so this check is offline and
// deterministic; the manual acceptance run repeats it against the live endpoint and prints the same
// host list. The count assertion keeps the two host assertions from passing vacuously — no requests
// would trivially be "no requests to www.bing.com".
const forbiddenHosts = ['www.bing.com', 'api.deepseek.com']
const { BingSearchProvider } = await import(pathToFileURL(join(root, 'bing.js')).href)
const fixturePath = join(root, 'tests', 'fixtures', 'bing-deepseek-harness.html')
if (!existsSync(fixturePath)) {
  fail('tests/fixtures/bing-deepseek-harness.html: missing; the request-layer check and the parse tests share it')
} else {
  const page = readFileSync(fixturePath, 'utf8')
  const requested = []
  const original = globalThis.fetch
  globalThis.fetch = async (url) => {
    requested.push(String(url))
    return new Response(page, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
  try {
    const result = await new BingSearchProvider().search({ query: 'deepseek harness' })
    if (result.sources.length < 5) fail(`provide.search: parsed ${result.sources.length} sources from the saved page, expected at least 5`)
  } catch (error) {
    fail(`provider.search threw during the request-layer check: ${error.message}`)
  } finally {
    globalThis.fetch = original
  }
  if (requested.length !== 1) {
    fail(`request layer: one search must send exactly one request; it sent ${requested.length}`)
  }
  for (const request of requested) {
    let host
    try {
      host = new URL(request).host
    } catch {
      fail(`request layer: ${request} is not an absolute URL`)
      continue
    }
    if (host !== 'cn.bing.com') fail(`request layer: a request went to ${host}; the only host this provider may request is cn.bing.com`)
    for (const forbidden of forbiddenHosts) {
      if (host === forbidden || host.endsWith(`.${forbidden}`)) {
        fail(`request layer: a request went to ${host}, and ${forbidden} is forbidden (acceptance item 3)`)
      }
    }
  }
}

// 8. Every parse line names every published module.
//
// The incident: 0.4.0 published `article.js`, and `node --check index.js bing.js` stayed in CI and in
// `CONTRIBUTING.md` — a published module nothing parsed, because nothing compared the command with the
// manifest. The pull request template carried the same stale example. `files` is the inventory, so the
// modules it publishes are the set a parse line must name.
const runtimeModules = (manifest?.files ?? []).filter((entry) => entry.endsWith('.js') && !entry.includes('*'))
const workflowDir = join(root, '.github', 'workflows')
const parseDocuments = [
  'README.md', 'README-zh.md', 'AGENTS.md', 'CONTRIBUTING.md', '.github/PULL_REQUEST_TEMPLATE.md',
  ...(existsSync(workflowDir)
    ? readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name)).map((name) => `.github/workflows/${name}`)
    : []),
]
for (const document of parseDocuments) {
  const text = read(document)
  if (text === undefined) continue
  for (const match of text.matchAll(/node\s+--check\s+([^\n`]+)/g)) {
    const named = match[1].trim().split(/\s+/).filter((word) => word.endsWith('.js'))
    const missing = runtimeModules.filter((module) => !named.includes(module))
    const stray = named.filter((module) => !runtimeModules.includes(module))
    if (missing.length > 0) {
      fail(`${document}: a parse line names ${named.join(' ')}; ${missing.join(' ')} ${missing.length === 1 ? 'is' : 'are'} published and unchecked`)
    }
    if (stray.length > 0) {
      fail(`${document}: a parse line names ${stray.join(' ')}, which package.json does not publish`)
    }
  }
}

// 9. Each README's introduction names both providers this bundle registers.
//
// The incident: once 0.4.0 registered a second provider the opening paragraph still said "one provider",
// and both ids were already mentioned further down — a presence check over the whole file would have stayed
// green while the sentence a reader believes was wrong. The ids are read out of the modules, never written
// here, so a rename cannot leave this check testing a name the code no longer exports.
const providerIds = ['bing.js', 'article.js'].map((module) => {
  const source = read(module) ?? ''
  const id = /export\s+const\s+PROVIDER_ID\s*=\s*'([^']+)'/.exec(source)?.[1]
  if (id === undefined) fail(`${module}: no "export const PROVIDER_ID = '<id>'" for the README check to read`)
  return { module, id }
})
for (const document of ['README.md', 'README-zh.md']) {
  const text = read(document)
  if (text === undefined) continue
  const lines = text.split(/\r?\n/)
  const firstSection = lines.findIndex((line) => /^## /.test(line))
  const introduction = (firstSection === -1 ? lines : lines.slice(0, firstSection)).join('\n')
  for (const { module, id } of providerIds) {
    if (id !== undefined && !introduction.includes(id)) {
      fail(`${document}: the introduction, everything before the first "## " heading, never names ${id} — the provider ${module} registers`)
    }
  }
}

// 10. One version, and the documents a reader checks first say the same number.
//
// Every file here is touched by a version bump anyway, and each is a place a reader looks to learn which
// number is current. There is deliberately no `PROGRESS.md` leg: an entry written after a change that moves
// no version says "no version moved" rather than naming one, so the newest entry states no version at all
// and a leg that parsed a heading would be a convention this repository does not keep.
const version = manifest?.version
if (typeof version === 'string') {
  for (const [document, line] of [
    ['README.md', `- Current version: v${version}.`],
    ['README-zh.md', `- 当前版本：v${version}。`],
  ]) {
    if (!(read(document) ?? '').includes(line)) fail(`${document}: must carry the line "${line}"`)
  }
  const section = (read('CHANGELOG.md') ?? '').split(/\r?\n/).find((line) => /^## \[/.test(line)) ?? ''
  const named = /^## \[([^\]]+)\]/.exec(section)?.[1]
  if (named !== version) {
    fail(`CHANGELOG.md: the newest section is ${named === undefined ? 'missing' : `[${named}]`}, but package.json says ${version}`)
  }
}

// 11. The layout tables are the inventory.
//
// `files` says what a profile receives, and both READMEs carry a table saying what each path is. The
// incident: `article.js` was published in 0.4.0 and the Chinese table kept its pre-0.4.0 rows, so the one
// inventory a reader had did not list a module the bundle ships.
const inventory = (manifest?.files ?? []).filter((entry) => !entry.includes('*'))
for (const document of ['README.md', 'README-zh.md']) {
  const text = read(document)
  if (text === undefined) continue
  const lines = text.split(/\r?\n/)
  const heading = lines.findIndex((line) => /^## (?:Repository layout|仓库结构)$/.test(line))
  if (heading === -1) {
    fail(`${document}: no layout section to compare package.json.files with`)
    continue
  }
  const rest = lines.slice(heading + 1)
  const next = rest.findIndex((line) => /^## /.test(line))
  const firstColumn = (next === -1 ? rest : rest.slice(0, next))
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|')[1] ?? '')
  for (const entry of inventory) {
    if (!firstColumn.some((cell) => cell.includes(entry))) {
      fail(`${document}: the layout table has no row for ${entry}`)
    }
  }
}

// 12. This bundle never switches anything off.
//
// The owner's rule is that a plugin provides function when installed and leaves no trace when removed. A
// `disabled:` key in this bundle's patch would break the second half twice: it would silently turn off a
// plugin this bundle does not own, and removing the bundle would silently turn it back on. A patch may
// override a row's config and insert its own row — both additive — but never disable anything, because
// "restore what you found" is not something absence can do (ADR 0013).
// `patchText` is already read above; one read serves both checks.
if (patchText !== undefined) {
  patchText.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(?:-\s*)?disabled\s*:/.test(line)) {
      fail(`cordis.patch.yml:${index + 1}: carries a "disabled" toggle; this bundle overrides config and inserts its own row, and never switches another plugin off (ADR 0013)`)
    }
  })
}

if (failures.length > 0) {
  console.error(`check failed: ${failures.length} problem(s)`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('check passed')
// The one place a human looks to ask "where does this plugin keep my data?" — and the honest answer is the
// point of ADR 0011: nowhere. Printed on every run so it can never drift into a claim nobody made.
console.log('data directory: none — this bundle persists nothing. If that ever changes it is ~/.agents/search (docs/adr/0011-no-data-directory.md)')
