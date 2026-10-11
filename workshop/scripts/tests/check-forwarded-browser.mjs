#!/usr/bin/env node

// Codespaces-only browser probe: drive the real forwarded HTTPS review page
// with a real browser. This complements the local browser loop by exercising
// GitHub's authenticated proxy boundary with the same credential split a real
// attendee browser has: the sandboxed artifact iframe (opaque origin) sends
// its subresource requests without credentials.
//
// Uses the workshop's own Vite fixture so the probe is deterministic on a
// fresh template repo, before any attendee application exists. `--fresh`
// gives every run a unique artifact path (and so a unique session), keeping
// the probe independent of prior review state on the shared server.

import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  annotateElement,
  artifactFrame,
  launchBrowser,
  runReview,
  screenshot,
  spawnPoll,
  waitGateCleared,
  waitSendEnabled,
} from './check-browser-loop.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../../..')
const fixtureDir = path.join(scriptDir, 'fixtures/vite-app')
const activeRecord = path.join(repoRoot, '.lavish/active-review.json')

if (process.env.CODESPACES !== 'true' || !process.env.GITHUB_TOKEN) {
  console.log('check-forwarded-browser: skipped (not an authenticated Codespace).')
  process.exit(0)
}

const realEnv = { ...process.env }
delete realEnv.LAVISH_AXI_PORT
const savedActiveRecord = await readFile(activeRecord, 'utf8').catch(() => null)
let browser = null
let freshArtifactDir = null

try {
  const opened = await runReview(['open', fixtureDir, '--fresh'], realEnv)
  if (opened.status !== 0) throw new Error(`Could not open forwarded review: ${opened.stderr || opened.stdout}`)
  const url = (opened.stdout.split('\n').find((line) => line.startsWith('Review URL: ')) || '').replace('Review URL: ', '').trim()
  if (!url.startsWith('https://') || !url.includes('-4387.')) throw new Error(`Unexpected forwarded URL: ${url}`)
  try {
    const record = JSON.parse(await readFile(activeRecord, 'utf8'))
    const candidate = path.dirname(String(record.artifact || ''))
    if (candidate.startsWith(path.join(fixtureDir, '.lavish'))) freshArtifactDir = candidate
  } catch { /* cleanup stays best-effort */ }

  browser = await launchBrowser()
  const page = await browser.newPage()
  // A real browser attaches the GitHub port-forwarding auth cookie to
  // chrome-context requests and to frame navigations, but the artifact iframe
  // is sandboxed without allow-same-origin: its opaque origin has an empty
  // partitioned cookie jar, so its subresource fetches reach the proxy with
  // no credentials and die on the pf-signin redirect. Reproduce that split —
  // a blanket setExtraHTTPHeaders would mask exactly that failure mode.
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const subframeSubresource = request.frame()?.parentFrame() && !request.isNavigationRequest()
    request.continue(subframeSubresource ? {} : { headers: { ...request.headers(), 'X-Github-Token': process.env.GITHUB_TOKEN } })
  })
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  if (!await page.$('#annotation')) {
    const continued = await page.evaluate(() => {
      const control = [...document.querySelectorAll('button, a, input[type="submit"]')]
        .find((element) => (element.textContent || element.getAttribute('value') || '').trim() === 'Continue')
      if (!control) return false
      control.click()
      return true
    })
    if (!continued) throw new Error('Forwarded page was not Lavish and had no Codespaces Continue control')
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    await page.waitForSelector('#annotation', { visible: true, timeout: 30000 })
  }
  await waitGateCleared(page)

  const toggleState = await page.$eval('#annotation', (element) => element.getAttribute('aria-pressed'))
  if (toggleState !== 'true') throw new Error(`Annotate toggle was not on (aria-pressed=${toggleState})`)

  const frame = await artifactFrame(page)
  const heading = await frame.$eval('h1', (element) => element.textContent || '')
  if (!heading.includes('Workshop Fixture App')) throw new Error(`Fixture app heading did not render: ${heading}`)

  await annotateElement(page, frame, 'h1', 'forwarded annotation probe')
  const poll = spawnPoll(realEnv, 45000)
  await new Promise((resolve) => setTimeout(resolve, 1500))
  await waitSendEnabled(page, '#send')
  await page.click('#send')
  const result = await poll.done
  if (result.code !== 0 || !result.output().includes('forwarded annotation probe')) {
    throw new Error(`Forwarded annotation did not reach the poll: ${result.output()}`)
  }

  await runReview(['reply', 'Forwarded annotation probe received', '--timeout-ms', '2500'], realEnv)
  await runReview(['end'], realEnv)
  console.log('ok: forwarded fixture heading opened an annotation card (uncredentialed iframe subresources)')
  console.log('ok: forwarded annotation text reached the protected poll')
  console.log(`ok: evidence screenshot: ${await screenshot(page, 'forwarded-fixture-annotation')}`)
  await page.close()
} catch (error) {
  if (browser) {
    const pages = await browser.pages().catch(() => [])
    if (pages.at(-1)) console.error(`evidence screenshot: ${await screenshot(pages.at(-1), 'forwarded-fixture-annotation-failure').catch(() => 'unavailable')}`)
  }
  throw error
} finally {
  if (browser) await browser.close().catch(() => {})
  await runReview(['stop'], realEnv).catch(() => {})
  if (freshArtifactDir) await rm(freshArtifactDir, { recursive: true, force: true })
  if (savedActiveRecord === null) await rm(activeRecord, { force: true })
  else await writeFile(activeRecord, savedActiveRecord)
}

console.log('check-forwarded-browser: all checks passed.')
