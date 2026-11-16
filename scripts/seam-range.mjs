#!/usr/bin/env node
/**
 * Re-ask the registry whether the search-request shape this bundle is written against ever changed.
 *
 * The bundle reads exactly two fields from a search request — `query` and, when present, `maxResults` — and
 * its `peerDependencies` range is what decides which seam versions a profile may run it against. "The seam
 * never passes more" was asserted for three versions once, which is not the same claim as "for every version
 * the range admits"; this asks the registry for the whole range and reads each version's published typing.
 *
 * Online on purpose: CI has no registry access, so this is the same kind of check as
 * `scripts/probe-backends.mjs` — run it when the range moves, or when a new seam version appears.
 *
 *   node scripts/seam-range.mjs
 *
 * Exit code 1 means some version inside the range declares a request field this bundle does not read, so the
 * range is either too wide or the provider needs to handle the new field.
 */
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const range = manifest.peerDependencies?.['@deepseek-ai/dsh-web'] ?? ''
const expected = ['maxResults?', 'query']

/** Numeric parts and prerelease, so `>=` and `<` can be answered without a semver dependency. */
function order(version) {
  const [main, pre = ''] = version.split('-')
  const numbers = main.split('.').map(Number)
  return { numbers, pre: pre === '' ? [Number.MAX_SAFE_INTEGER] : pre.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : -1)) }
}

function compare(a, b) {
  const left = order(a)
  const right = order(b)
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index += 1) {
    const difference = (left.pre[index] ?? 0) - (right.pre[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

const [lower, upper] = range.split(/\s+/).map((part) => part.replace(/^>=/, '').replace(/^</, ''))
if (lower === undefined || upper === undefined) {
  console.error(`peerDependencies range not understood: ${JSON.stringify(range)}; expected ">=x <y"`)
  process.exit(1)
}
console.log(`range declared in package.json: ${range}  (lower ${lower}, upper ${upper})`)

const packument = await (await fetch('https://registry.npmjs.org/@deepseek-ai/dsh-web')).json()
const selected = Object.keys(packument.versions).filter((version) => compare(version, lower) >= 0 && compare(version, upper) < 0).sort(compare)
console.log(`versions inside it: ${selected.length}`)

const mismatches = []
let read = 0
for (const version of selected) {
  const response = await fetch(`https://cdn.jsdelivr.net/npm/@deepseek-ai/dsh-web@${version}/lib/types/types.d.ts`)
  if (!response.ok) {
    console.log(`  ${version}: typing not published (HTTP ${response.status}); not counted`)
    continue
  }
  const text = await response.text()
  const start = text.indexOf('interface WebSearchRequest')
  const body = start === -1 ? '' : text.slice(start, text.indexOf('\n}', start))
  const fields = [...body.matchAll(/readonly\s+(\w+)(\?)?\s*:/g)].map((match) => `${match[1]}${match[2] ?? ''}`).sort().join(' ')
  read += 1
  if (fields !== expected.join(' ')) mismatches.push(`${version}: [${fields || 'interface not found'}]`)
}

console.log(`typings read: ${read}/${selected.length}`)
if (mismatches.length > 0) {
  console.error(`request shape changed in ${mismatches.length} version(s) inside the declared range:`)
  for (const mismatch of mismatches) console.error(`  - ${mismatch}`)
  console.error(`this bundle reads [${expected.join(' ')}]; narrow the range or handle the new field`)
  process.exit(1)
}
console.log(`every version in the range declares exactly [${expected.join(' ')}]`)
