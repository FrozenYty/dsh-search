#!/usr/bin/env node
/**
 * Build the installable tarball for a release.
 *
 * `npm pack` is the thing that knows what this package contains: it reads `files` from the manifest, so
 * the tarball is exactly the set the README describes and nothing from the working tree. The tarball is
 * what `dsh plugin add <file>` installs, and what the release workflow attaches to a tag — which is the
 * one install route that needs no npm registry and no GitHub network access at install time.
 *
 * npm is invoked through the shell with its output written to files, not pipes: a sandboxed child
 * cannot open the pipe `stdio: 'pipe'` needs. A cache inside the system temp directory keeps npm from
 * writing to (or being stopped by) a cache outside this workspace.
 *
 * Usage: node scripts/pack.mjs [outdir]        (default: dist)
 * Prints one `TARBALL=<path>` line and writes <outdir>/SHA256SUMS.txt.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = resolve(root, process.argv[2] ?? 'dist')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const filename = `${manifest.name}-${manifest.version}.tgz`

mkdirSync(outdir, { recursive: true })
const cache = mkdtempSync(join(tmpdir(), 'dsh-search-pack-'))
const log = join(cache, 'npm.log')
const fd = openSync(log, 'w')
let status
let failure
try {
  const result = spawnSync(`npm pack --pack-destination ${JSON.stringify(outdir)} --cache ${JSON.stringify(cache)}`, {
    cwd: root,
    shell: true,
    stdio: ['ignore', fd, fd],
  })
  status = result.status
  failure = result.error
} finally {
  closeSync(fd)
}
const output = readFileSync(log, 'utf8')

const tarball = join(outdir, filename)
if (status !== 0 || failure !== undefined || !existsSync(tarball)) {
  console.error(output.trim() || `npm pack exited with ${status}`)
  if (failure !== undefined) console.error(failure.message)
  rmSync(cache, { recursive: true, force: true })
  process.exit(1)
}
rmSync(cache, { recursive: true, force: true })

const digest = createHash('sha256').update(readFileSync(tarball)).digest('hex')
writeFileSync(join(outdir, 'SHA256SUMS.txt'), `${digest}  ${filename}\n`)

const listed = output.split(/\r?\n/).find((line) => line.includes('total files'))
console.log(`${filename}  ${(statSync(tarball).size / 1024).toFixed(1)} kB  sha256 ${digest}`)
if (listed !== undefined) console.log(listed.replace(/^npm notice\s*/, '').trim())
console.log(`TARBALL=${tarball}`)
