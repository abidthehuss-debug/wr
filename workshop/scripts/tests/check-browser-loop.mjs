#!/usr/bin/env node

// L3: drive the REAL Lavish chrome UI with a headless browser on the loopback
// origin, exactly as an attendee would drive the forwarded page. Proves the
// attendee-visible loop: page renders, annotation card works, Send delivers to
// a live poll, reply appears, artifact refresh shows the change, and both
// Send & End variants (queued and empty) end the session.
//
// Dev-only tooling: uses puppeteer-core from workshop/scripts/tests
// (lavish-verify installs it on demand; attendees never need it).

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFile as execFileCallback, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const execFile = promisify(execFileCallback)

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../../..')
const lavishReview = path.join(repoRoot, 'workshop/scripts/lavish-review')
const evidenceDir = path.join(repoRoot, '.workshop-local/verification/screenshots')

export function localEnv(port, extra = {}) {
  const env = { ...process.env, LAVISH_AXI_PORT: String(port), ...extra }
  // Local-origin mode: the headless browser cannot authenticate through the
  // Codespaces proxy, and the loopback origin is the same server.
  delete env.CODESPACES
  delete env.CODESPACE_NAME
  delete env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
  return env
}

export function runReview(args, env) {
  return execFile('bash', [lavishReview, ...args], { env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .then(({ stdout, stderr }) => ({ status: 0, stdout, stderr }))
    .catch((error) => ({ status: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }))
}

export function spawnPoll(env, timeoutMs = 45000, extraArgs = []) {
  const child = spawn('bash', [lavishReview, 'poll', '--timeout-ms', String(timeoutMs), ...extraArgs], { env })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  const done = new Promise((resolve) => child.on('close', (code) => resolve({ code, output: () => output })))
  return { child, done, output: () => output }
}

export async function resolveChrome() {
  if (process.env.WORKSHOP_TEST_CHROME) return process.env.WORKSHOP_TEST_CHROME
  const { globSync } = await import('node:fs')
  const candidates = [
    ...globSync(path.join(process.env.HOME || '/root', '.cache/ms-playwright/chromium-*/chrome-linux*/chrome')),
    ...globSync(path.join(process.env.HOME || '/root', '.cache/ms-playwright/chromium-*/chrome-linux*/headless_shell')),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ]
  for (const candidate of candidates) {
    try {
      await execFile(candidate, ['--version'])
      return candidate
    } catch { /* try the next candidate */ }
  }
  console.error('No local Chrome found; downloading a pinned chrome-headless-shell (one-time, maintainers only)...')
  const { install, Browser, BrowserTag, detectBrowserPlatform, resolveBuildId } = require('@puppeteer/browsers')
  const cacheDir = path.join(process.env.HOME || '/root', '.cache/workshop-test-chrome')
  const platform = detectBrowserPlatform()
  if (!platform) throw new Error('Could not detect the browser platform')
  const buildId = await resolveBuildId(Browser.CHROMEHEADLESSSHELL, platform, BrowserTag.STABLE)
  const installed = await install({ browser: Browser.CHROMEHEADLESSSHELL, buildId, buildIdAlias: BrowserTag.STABLE, cacheDir, platform })
  return installed.executablePath
}

export async function launchBrowser() {
  const puppeteer = require('puppeteer-core')
  const executablePath = await resolveChrome()
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  return browser
}

// The layout gate ("Checking layout. One moment.") curtains the artifact for
// up to ~12s after open and intercepts clicks. A real attendee waits or hits
// "Show anyway"; the simulated one does the same.
export async function waitGateCleared(page) {
  // The chrome toggles the overlay via its `hidden` attribute (it is
  // position:fixed, so offsetParent is useless as a visibility signal).
  const gateGone = () => page.waitForFunction(() => {
    const overlay = document.querySelector('#layoutGateOverlay')
    return !overlay || overlay.hidden || getComputedStyle(overlay).display === 'none'
  }, { timeout: 15000 })
  try {
    await gateGone()
  } catch {
    const showAnyway = await page.$('#layoutGateAction')
    if (showAnyway) await showAnyway.click()
    await gateGone()
  }
}

export async function artifactFrame(page) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const frame = page.frames().find((candidate) => candidate.url().includes('/artifact/'))
    if (frame) {
      try {
        const ready = await frame.evaluate(() => document.readyState !== 'loading' && document.body !== null)
        if (ready) return frame
      } catch { /* frame is navigating; retry */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('artifact iframe never became ready')
}

export async function screenshot(page, label) {
  await mkdir(evidenceDir, { recursive: true })
  const file = path.join(evidenceDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.png`)
  await page.screenshot({ path: file, fullPage: false })
  return file
}

// Click an element inside the sandboxed artifact iframe the way a human does:
// real page-level mouse input at the element's viewport coordinates. Direct
// frame.click() input routing into the out-of-process iframe is unreliable.
export async function clickInFrame(page, frame, selector) {
  const handle = await frame.waitForSelector(selector, { visible: true, timeout: 15000 })
  const box = await handle.boundingBox()
  if (!box) throw new Error(`${selector} has no clickable geometry`)
  await page.mouse.click(box.x + Math.min(30, box.width / 2), box.y + box.height / 2)
}

export async function annotateElement(page, frame, selector, text) {
  await clickInFrame(page, frame, selector)
  const textarea = await frame.waitForSelector('pierce/.lavish-annotation-card textarea', { visible: true, timeout: 15000 })
  await textarea.type(text)
  const send = await frame.waitForSelector('pierce/.lavish-annotation-card button.lavish-send', { visible: true, timeout: 5000 })
  await send.click()
  await page.waitForFunction(
    () => (document.querySelector('#annotationPills')?.children.length ?? 0) > 0,
    { timeout: 10000 },
  )
}

export async function waitSendEnabled(page, id = '#send') {
  await page.waitForFunction(
    (buttonId) => {
      const button = document.querySelector(buttonId)
      return button && !button.disabled
    },
    { timeout: 20000 },
    id,
  )
}

async function main() {
  let failures = 0
  const ok = (message) => console.log(`ok: ${message}`)
  const fail = (message) => { failures += 1; console.error(`FAIL: ${message}`) }
  const expect = (condition, message) => (condition ? ok(message) : fail(message))

  const port = 20000 + Math.floor(Math.random() * 20000)
  const work = await mkdtemp(path.join(tmpdir(), 'lavish-browser-'))
  // Fresh session state per iteration: the fixture artifact path (and so its
  // session key) repeats across runs, and a prior iteration's user-initiated
  // Send & End would otherwise correctly block this one's plain reopen.
  const env = localEnv(port, { LAVISH_AXI_STATE_DIR: path.join(work, 'lavish-state') })
  const fixtureDir = path.join(scriptDir, 'fixtures/vite-app')
  let browser = null

  try {
    // Fresh artifact via the canonical CLI (rebuilds the vite fixture).
    let result = await runReview(['open', fixtureDir, '--no-gate'], env)
    if (result.status !== 0) {
      console.error(result.stdout, result.stderr)
      throw new Error('lavish-review open failed')
    }
    const url = (result.stdout.split('\n').find((line) => line.startsWith('Review URL: ')) || '').replace('Review URL: ', '').trim()
    expect(url.startsWith(`http://127.0.0.1:${port}/session/`), `local review URL printed (${url})`)

    browser = await launchBrowser()
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitGateCleared(page)

    // 1. The app is genuinely visible inside the sandboxed artifact frame.
    const frame = await artifactFrame(page)
    await frame.waitForSelector('h1', { visible: true, timeout: 20000 })
    const heading = await frame.$eval('h1', (element) => element.textContent || '')
    expect(heading.includes('Workshop Fixture App'), 'application heading renders inside the review sandbox')
    const headingBox = await (await frame.$('h1')).boundingBox()
    expect(headingBox && headingBox.width > 50 && headingBox.height > 10, 'heading has visible geometry (not a blank page)')
    const tokens = await frame.$eval('[data-testid="tokens"]', (element) => element.textContent || '')
    expect(tokens.includes('$` $& $\''), 'String.replace tokens render intact in the live page')
    // Storage-dependent startup worked despite the sandbox denying Web Storage.
    const cards = await frame.$$('.card')
    expect(cards.length >= 1, 'storage-backed content rendered (in-memory fallback active)')
    const shot1 = await screenshot(page, 'browser-loop-rendered')
    ok(`evidence screenshot: ${shot1}`)

    // 2. Interactivity inside the review: annotation mode is ON by default and
    //    consumes clicks, so the attendee toggles it off to use the app.
    await page.click('#annotation')
    await page.waitForFunction(
      () => document.querySelector('#annotation')?.getAttribute('aria-pressed') === 'false',
      { timeout: 5000 },
    )
    // The mode change reaches the in-frame SDK via postMessage; let it land.
    await new Promise((resolve) => setTimeout(resolve, 800))
    await clickInFrame(page, frame, 'button.add-note')
    await frame.waitForFunction(() => document.querySelectorAll('.card').length >= 2, { timeout: 5000 })
    ok('application button click works with annotation mode off')
    await page.click('#annotation')
    await page.waitForFunction(
      () => document.querySelector('#annotation')?.getAttribute('aria-pressed') === 'true',
      { timeout: 5000 },
    )
    await new Promise((resolve) => setTimeout(resolve, 800))

    // 3. Annotation on a clicked element (annotation mode back on).
    await annotateElement(page, frame, 'h1', 'Make this heading smaller')
    ok('annotation card accepted text and queued a pill')

    // 4. Typed chat feedback + Send to a live poll.
    const poll = spawnPoll(env, 45000)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await page.type('#chatInput', 'Also add more spacing below the header')
    await waitSendEnabled(page, '#send')
    await page.click('#send')
    const pollResult = await poll.done
    expect(pollResult.code === 0, 'poll exits cleanly after Send')
    expect(pollResult.output().includes('Status: feedback'), 'Send to agent wakes the polling agent')
    expect(pollResult.output().includes('Make this heading smaller'), 'annotation text delivered to the agent')
    expect(pollResult.output().includes('Also add more spacing'), 'typed feedback delivered to the agent')

    // 5. Agent reply + artifact refresh with a real change.
    const mainSource = path.join(fixtureDir, 'src/main.jsx')
    const savedMain = await readFile(mainSource, 'utf8')
    await writeFile(mainSource, savedMain.replace('Workshop Fixture App', 'Workshop Fixture App v2'))
    try {
      result = await runReview(['reply', 'Reduced the heading and updated the title', '--timeout-ms', '2500'], env)
      expect(result.status === 0, 'reply (rebuild + re-poll) succeeds')
      await page.waitForFunction(
        () => document.querySelector('#chatLog')?.textContent?.includes('Reduced the heading'),
        { timeout: 20000 },
      )
      ok('agent reply appears in the review conversation')
      const refreshedFrame = await artifactFrame(page)
      await refreshedFrame.waitForFunction(
        () => document.querySelector('h1')?.textContent?.includes('Workshop Fixture App v2'),
        { timeout: 30000 },
      )
      ok('artifact refreshed and shows the applied change')
      await screenshot(page, 'browser-loop-refreshed')

      // 6. Send & End with queued content.
      const endPoll = spawnPoll(env, 45000)
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await page.type('#chatInput', 'Looks good now, thanks!')
      await waitSendEnabled(page, '#sendAndEnd')
      await page.click('#sendAndEnd')
      const endResult = await endPoll.done
      expect(endResult.code === 0 && endResult.output().includes('Status: ended'), 'Send & End delivers final feedback and ends the session')
      expect(endResult.output().includes('Looks good now'), 'final feedback text delivered')
      await page.waitForSelector('#endedOverlay', { visible: true, timeout: 15000 })
      ok('review shows the ended state')
    } finally {
      await writeFile(mainSource, savedMain)
    }
    await page.close()

    // 7. Empty-queue Send & End (the upstream bug the patch fixes): a fresh
    //    session where the attendee clicks Send & End without typing anything.
    const emptyArtifact = path.join(work, 'empty-end.html')
    await cp(path.join(scriptDir, 'fixtures/static-html/review.html'), emptyArtifact)
    result = await runReview(['open', emptyArtifact, '--no-gate'], env)
    expect(result.status === 0, 'second session opens for the empty Send & End variant')
    const emptyUrl = (result.stdout.split('\n').find((line) => line.startsWith('Review URL: ')) || '').replace('Review URL: ', '').trim()
    const emptyPage = await browser.newPage()
    await emptyPage.goto(emptyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitGateCleared(emptyPage)
    await artifactFrame(emptyPage)
    const emptyPoll = spawnPoll(env, 45000)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await waitSendEnabled(emptyPage, '#sendAndEnd')
    await emptyPage.click('#sendAndEnd')
    const emptyResult = await emptyPoll.done
    expect(emptyResult.code === 0 && emptyResult.output().includes('Status: ended'), 'EMPTY Send & End still ends the session (patched upstream bug)')
    await emptyPage.waitForSelector('#endedOverlay', { visible: true, timeout: 15000 })
    ok('empty-queue variant shows the ended state')
    await emptyPage.close()
  } finally {
    if (browser) await browser.close().catch(() => {})
    await runReview(['stop'], env)
    await rm(work, { recursive: true, force: true })
    await rm(path.join(repoRoot, '.lavish/active-review.json'), { force: true })
  }

  console.log('')
  if (failures > 0) {
    console.error(`check-browser-loop: ${failures} failure(s).`)
    process.exit(1)
  }
  console.log('check-browser-loop: all checks passed.')
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href
if (isMain) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
