#!/usr/bin/env node

// Patch unit tests: exercise workshop/scripts/patch-lavish-feedback.mjs
// against a copy of the pristine vendored package. Requires the vendored
// runtime to be installed (workshop/scripts/lavish-review install) because a
// fresh `npm ci` tree is the only honest stock source.

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../../..')
const patchScript = path.join(repoRoot, 'workshop/scripts/patch-lavish-feedback.mjs')
const vendorPackage = path.join(repoRoot, 'workshop/vendor/lavish/node_modules/lavish-axi')
const vendorCache = path.join(repoRoot, 'workshop/vendor/lavish')

let failures = 0
function ok(message) {
  console.log(`ok: ${message}`)
}
function fail(message) {
  failures += 1
  console.error(`FAIL: ${message}`)
}
async function expect(condition, message) {
  if (condition) ok(message)
  else fail(message)
}

function runPatch(target, ...flags) {
  try {
    const stdout = execFileSync('node', [patchScript, ...flags, target], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { status: 0, output: stdout }
  } catch (error) {
    return { status: error.status ?? 1, output: `${error.stdout || ''}${error.stderr || ''}` }
  }
}

const { patchLavishChromeClientSource, patchLavishCliSource, patchMarker, affectedVersion } =
  await import(`file://${patchScript}`)

const work = await mkdtemp(path.join(tmpdir(), 'lavish-patch-test-'))
try {
  // A pristine tree, restored via npm ci semantics: copy the tarball-extracted
  // package then revert its two dist files from a fresh extraction. Simpler
  // and offline: copy the (possibly patched) vendored package, then restore
  // stock text by asking npm for the cached tarball only when needed. Here we
  // detect the state and derive a stock copy by reversing with npm ci when the
  // vendored tree is patched.
  const pristine = path.join(work, 'lavish-axi')
  await cp(vendorPackage, pristine, { recursive: true })

  const cliFile = path.join(pristine, 'dist/cli.mjs')
  const chromeFile = path.join(pristine, 'dist/chrome-client.js')

  const cliIsPatched = (await readFile(cliFile, 'utf8')).includes('workshop_feedback_patch')
  if (cliIsPatched) {
    // Re-extract stock files from the npm cache tarball (offline).
    execFileSync('npm', ['pack', `lavish-axi@${affectedVersion}`, '--pack-destination', work], {
      cwd: vendorCache, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    execFileSync('tar', ['-xzf', path.join(work, `lavish-axi-${affectedVersion}.tgz`), '-C', work], { stdio: 'ignore' })
    await cp(path.join(work, 'package/dist/cli.mjs'), cliFile)
    await cp(path.join(work, 'package/dist/chrome-client.js'), chromeFile)
  }

  const stockCli = await readFile(cliFile, 'utf8')
  const stockChrome = await readFile(chromeFile, 'utf8')

  // 1. Pure functions: stock sources patch cleanly and idempotently.
  const chromeOnce = patchLavishChromeClientSource(stockChrome)
  const cliOnce = patchLavishCliSource(stockCli)
  await expect(chromeOnce.changed && cliOnce.changed, 'stock sources are recognized and patched')
  const chromeTwice = patchLavishChromeClientSource(chromeOnce.source)
  const cliTwice = patchLavishCliSource(cliOnce.source)
  await expect(!chromeTwice.changed && !cliTwice.changed, 'patched sources are recognized as complete (idempotent)')
  await expect(cliOnce.source.includes(`workshop_feedback_patch: ${patchMarker}`), `health marker ${patchMarker} present after patch`)
  await expect(
    !cliOnce.source.includes('chrome_load_token') || stockCli.includes('chrome_load_token'),
    'patch introduces no token machinery beyond stock',
  )
  await expect(
    /app\.post\("\/api\/:key\/end", async \(req, res, next\) => \{\n    try \{\n      if \(!isSameOriginRequest/.test(cliOnce.source),
    'browser end route gains the same-origin gate',
  )
  await expect(
    (chromeOnce.source.match(/function showSubmissionFailure\s*\(/g) || []).length === 1,
    'exactly one submission-failure handler after patch',
  )
  await expect(
    chromeOnce.source.includes('if (firstArtifactMessage) {') &&
      chromeOnce.source.includes('enabled: annotation && !ended'),
    'first artifact SDK message reasserts annotation mode after a fast iframe load',
  )
  await expect(
    cliOnce.source.includes('data-lavish-sdk="inline"') &&
      !cliOnce.source.includes('<script src="/sdk.js?key='),
    'served artifact SDK is inlined (sandboxed iframe needs no authenticated subresource)',
  )

  // 2. CLI mode: check fails on stock, apply succeeds, check passes, reapply is a no-op.
  let result = runPatch(cliFile, '--check')
  await expect(result.status !== 0, 'CLI --check fails on a stock tree')
  result = runPatch(cliFile)
  await expect(result.status === 0, 'CLI apply succeeds on a stock tree')
  result = runPatch(cliFile, '--check')
  await expect(result.status === 0, 'CLI --check passes after apply')
  result = runPatch(cliFile)
  await expect(result.status === 0 && result.output.includes('ready'), 'CLI reapply is an idempotent no-op')

  // 3. Half-patched tree: revert one file, apply completes the other.
  await writeFile(chromeFile, stockChrome)
  result = runPatch(cliFile)
  await expect(result.status === 0, 'apply completes a half-patched tree')
  await expect((await readFile(chromeFile, 'utf8')).includes('showSubmissionFailure'), 'half-patched chrome file was repaired')

  // 4. Wrong version is refused with the install hint.
  const packageFile = path.join(pristine, 'package.json')
  const packageMetadata = JSON.parse(await readFile(packageFile, 'utf8'))
  await writeFile(packageFile, JSON.stringify({ ...packageMetadata, version: '9.9.9' }, null, 2))
  result = runPatch(cliFile, '--check')
  await expect(result.status !== 0 && result.output.includes('lavish-review install'), 'wrong version is refused with the repair hint')
  await writeFile(packageFile, JSON.stringify(packageMetadata, null, 2))

  // 5. Wrong package name is refused.
  await writeFile(packageFile, JSON.stringify({ ...packageMetadata, name: 'not-lavish' }, null, 2))
  result = runPatch(cliFile, '--check')
  await expect(result.status !== 0 && result.output.includes('unexpected package'), 'wrong package name is refused')
  await writeFile(packageFile, JSON.stringify(packageMetadata, null, 2))

  // 6. Unexpected source (duplicated block) is refused, and the tree is untouched.
  const duplicated = stockChrome + '\n' + stockChrome.slice(stockChrome.indexOf('function requestSnapshot'), stockChrome.indexOf('function sendQueued'))
  await writeFile(chromeFile, duplicated)
  result = runPatch(cliFile)
  await expect(result.status !== 0 && result.output.includes('refusing an unsafe partial patch'), 'duplicated source blocks are refused')
  await expect((await readFile(chromeFile, 'utf8')) === duplicated, 'refused apply leaves the tree untouched')
  await writeFile(chromeFile, stockChrome)

  // 7. Concurrent applies: both exit cleanly, tree ends patched exactly once.
  await writeFile(cliFile, stockCli)
  const concurrent = await Promise.all([0, 1].map(() =>
    new Promise((resolve) => {
      import('node:child_process').then(({ execFile }) => {
        execFile('node', [patchScript, '--quiet', cliFile], (error) => resolve(error ? (error.code ?? 1) : 0))
      })
    }),
  ))
  await expect(concurrent.every((code) => code === 0), 'concurrent applies both exit cleanly')
  result = runPatch(cliFile, '--check')
  await expect(result.status === 0, 'tree is correctly patched after concurrent applies')
  const finalChrome = await readFile(chromeFile, 'utf8')
  await expect((finalChrome.match(/function showSubmissionFailure\s*\(/g) || []).length === 1, 'no duplicate patching under concurrency')

  // 8. --check never writes.
  await writeFile(chromeFile, stockChrome)
  const before = await readFile(chromeFile, 'utf8')
  runPatch(cliFile, '--check')
  await expect((await readFile(chromeFile, 'utf8')) === before, '--check is read-only')
} finally {
  await rm(work, { recursive: true, force: true })
}

console.log('')
if (failures > 0) {
  console.error(`check-patch: ${failures} failure(s).`)
  process.exit(1)
}
console.log('check-patch: all checks passed.')
