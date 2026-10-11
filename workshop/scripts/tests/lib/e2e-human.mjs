#!/usr/bin/env node

// Plays the human attendee against a live Lavish review session that a REAL
// provider agent (Claude Code or Codex) opened and is polling. Driven by
// run-provider-e2e.sh.
//
// Usage: e2e-human.mjs <loopback-session-url> <watch-path> <marker-text>
//
// Sequence: verify the page renders → annotate the heading asking for the
// marker text → send to the agent → wait for the agent to change the real
// source (watch-path is a file or a directory) → wait for the refreshed
// artifact to show it → empty Send & End.

import path from 'node:path'
import process from 'node:process'
import { readFile, readdir, stat } from 'node:fs/promises'
import {
  launchBrowser,
  artifactFrame,
  annotateElement,
  waitGateCleared,
  waitSendEnabled,
  screenshot,
} from '../check-browser-loop.mjs'

const [sessionUrl, watchPath, markerText] = process.argv.slice(2)
if (!sessionUrl || !watchPath || !markerText) {
  console.error('Usage: e2e-human.mjs <session-url> <watch-path> <marker-text>')
  process.exit(2)
}

async function sourceContainsMarker() {
  const metadata = await stat(watchPath).catch(() => null)
  if (!metadata) return false
  if (metadata.isFile()) {
    const content = await readFile(watchPath, 'utf8').catch(() => '')
    return content.includes(markerText)
  }
  for (const entry of await readdir(watchPath)) {
    const content = await readFile(path.join(watchPath, entry), 'utf8').catch(() => '')
    if (content.includes(markerText)) return true
  }
  return false
}

const browser = await launchBrowser()
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(sessionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await waitGateCleared(page)

  let frame = await artifactFrame(page)
  await frame.waitForSelector('h1', { visible: true, timeout: 30000 })
  const heading = await frame.$eval('h1', (element) => element.textContent || '')
  if (!heading.trim()) throw new Error('artifact heading is empty — page not rendering')
  console.log(`human: app visible (heading: ${heading.trim()})`)
  await screenshot(page, 'e2e-before-feedback')

  await annotateElement(page, frame, 'h1', `Please change this heading to say "${markerText}"`)
  console.log('human: annotation queued')

  await page.type('#chatInput', 'One small change please, then I am happy.')
  await waitSendEnabled(page, '#send')
  await page.click('#send')
  console.log('human: feedback sent to the agent')

  const deadline = Date.now() + 6 * 60 * 1000
  while (Date.now() < deadline) {
    if (await sourceContainsMarker()) break
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  if (!(await sourceContainsMarker())) {
    await screenshot(page, 'e2e-agent-never-edited')
    throw new Error('the agent never applied the requested change to the real source')
  }
  console.log('human: agent changed the real source')

  const refreshDeadline = Date.now() + 3 * 60 * 1000
  let refreshed = false
  while (Date.now() < refreshDeadline) {
    try {
      frame = await artifactFrame(page)
      const current = await frame.$eval('h1', (element) => element.textContent || '')
      if (current.includes(markerText)) {
        refreshed = true
        break
      }
    } catch { /* frame reloading */ }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  if (!refreshed) {
    await screenshot(page, 'e2e-refresh-missing')
    throw new Error('the refreshed artifact never showed the applied change')
  }
  console.log('human: refreshed review shows the change')
  await screenshot(page, 'e2e-after-refresh')

  // A human re-clicks a button that appears to do nothing; the button can be
  // momentarily disabled around agent poll-cycle boundaries.
  let ended = false
  for (let attempt = 0; attempt < 3 && !ended; attempt += 1) {
    await waitSendEnabled(page, '#sendAndEnd')
    await page.click('#sendAndEnd')
    ended = await page
      .waitForSelector('#endedOverlay', { visible: true, timeout: 12000 })
      .then(() => true, () => false)
  }
  if (!ended) {
    await screenshot(page, 'e2e-end-missing')
    throw new Error('Send & End did not end the review after 3 attempts')
  }
  console.log('human: Send & End completed (empty queue)')
  await screenshot(page, 'e2e-ended')
} finally {
  await browser.close().catch(() => {})
}
console.log('human: done')
