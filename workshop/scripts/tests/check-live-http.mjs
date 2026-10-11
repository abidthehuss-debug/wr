#!/usr/bin/env node

// L2 live-HTTP checks. Scenario A runs anywhere (CI included): a real Lavish
// server on an ephemeral port with simulated Codespaces environment and
// proxy-shaped headers, proving the wrapper env contract, host gate, origin
// matrix, poll delivery, reply, Send & End, and the stale-server policy.
// Scenario B runs only inside a real Codespace: the same proofs through the
// actual forwarded HTTPS origin with GitHub authentication.

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFile as execFileCallback, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFile = promisify(execFileCallback)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../../..')
const lavishReview = path.join(repoRoot, 'workshop/scripts/lavish-review')
const patchScript = path.join(repoRoot, 'workshop/scripts/patch-lavish-feedback.mjs')
const { patchMarker } = await import(`file://${patchScript}`)
const staticFixture = path.join(scriptDir, 'fixtures/static-html/review.html')
const activeRecord = path.join(repoRoot, '.lavish/active-review.json')
const lastPoll = path.join(repoRoot, '.lavish/last-poll.txt')
const pendingFeedback = path.join(repoRoot, '.lavish/pending-feedback.txt')
const pendingFeedbackArtifact = path.join(repoRoot, '.lavish/pending-feedback.artifact')
const pollLock = path.join(repoRoot, '.lavish/poll.lock')

let failures = 0
const ok = (message) => console.log(`ok: ${message}`)
const fail = (message) => {
  failures += 1
  console.error(`FAIL: ${message}`)
}
const expect = (condition, message) => (condition ? ok(message) : fail(message))

const port = 20000 + Math.floor(Math.random() * 20000)
const fakeCodespace = 'example-space'
const fakeDomain = 'app.github.dev'
const fakeForwardedHost = `${fakeCodespace}-${port}.${fakeDomain}`
const simulatedEnv = {
  ...process.env,
  CODESPACES: 'true',
  CODESPACE_NAME: fakeCodespace,
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: fakeDomain,
  LAVISH_AXI_PORT: String(port),
  // Hostile inherited values the wrapper must override.
  LAVISH_AXI_ALLOWED_HOSTS: '*',
  LAVISH_AXI_HOST: '0.0.0.0',
  LAVISH_AXI_NO_OPEN: '0',
}

function runReview(args, { env = simulatedEnv } = {}) {
  return execFile('bash', [lavishReview, ...args], { env, encoding: 'utf8' })
    .then(({ stdout, stderr }) => ({ status: 0, stdout, stderr }))
    .catch((error) => ({ status: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }))
}

function spawnReview(args, { env = simulatedEnv } = {}) {
  const child = spawn('bash', [lavishReview, ...args], { env })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  return new Promise((resolve) => child.on('close', (code) => resolve({ status: code ?? 1, stdout, stderr })))
}

// node:http/https instead of fetch: undici silently drops a caller-set Host
// header (fetch-spec forbidden), which these proxy-shape probes depend on.
async function request(url, { method = 'GET', headers = {}, body } = {}) {
  const { request: httpRequest } = url.startsWith('https:')
    ? await import('node:https')
    : await import('node:http')
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = httpRequest(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers,
      },
      (response) => {
        let text = ''
        response.on('data', (chunk) => { text += chunk })
        response.on('end', () => resolve({ status: response.statusCode, text }))
      },
    )
    client.on('error', reject)
    if (body) client.write(body)
    client.end()
  })
}

const baseUrl = `http://127.0.0.1:${port}`
const proxyHeaders = {
  Host: `localhost:${port}`,
  'X-Forwarded-Host': fakeForwardedHost,
  'X-Forwarded-Proto': 'https',
}
const browserShape = (key) => ({
  ...proxyHeaders,
  Origin: `http://localhost:${port}`, // what the proxy rewrites the real Origin to
  Referer: `https://${fakeForwardedHost}/session/${key}`,
  'Content-Type': 'application/json',
})

async function startFakeServer(healthBody) {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(healthBody))
      return
    }
    if (req.url === '/shutdown' && req.method === 'POST') {
      res.end('{"ok":true}')
      setTimeout(() => server.close(), 50)
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', resolve).on('error', reject))
  return server
}

const savedRecords = {}
for (const file of [activeRecord, lastPoll, pendingFeedback, pendingFeedbackArtifact, pollLock]) {
  savedRecords[file] = await readFile(file, 'utf8').catch(() => null)
}

const work = await mkdtemp(path.join(tmpdir(), 'lavish-live-'))
const artifact = path.join(work, `review-${Date.now()}.html`)
await cp(staticFixture, artifact)

async function cleanup() {
  await runReview(['stop']).catch(() => {})
  for (const [file, content] of Object.entries(savedRecords)) {
    if (content === null) await rm(file, { force: true })
    else await writeFile(file, content)
  }
  await rm(work, { recursive: true, force: true })
}

try {
  // --- stale-server policy -------------------------------------------------
  const staleFake = await startFakeServer({ ok: true, app: 'lavish-axi', version: '0.0.1' })
  let result = await runReview(['open', artifact])
  await new Promise((resolve) => staleFake.close(resolve))
  expect(result.status === 0, 'open replaces a health-confirmed stale Lavish and proceeds')
  expect(result.stderr.includes('Replacing a stale Lavish server'), 'stale replacement is announced')

  // --- URL contract --------------------------------------------------------
  const urlLine = result.stdout.split('\n').find((line) => line.startsWith('Review URL: ')) || ''
  const url = urlLine.replace('Review URL: ', '').trim()
  expect(url.startsWith(`https://${fakeForwardedHost}/session/`), `printed URL uses the forwarded HTTPS origin (${url})`)
  expect(!url.includes(`:${port}`), 'printed URL has no external port suffix')
  const key = url.split('/session/')[1]
  expect(/^[0-9a-f]{16}$/.test(key || ''), 'session key extracted')

  // --- wrapper env contract, proven by server behavior ---------------------
  let response = await request(`${baseUrl}/health`)
  expect(response.status === 200 && response.text.includes(`"workshop_feedback_patch":${patchMarker}`), `server is the patched pinned runtime (marker ${patchMarker})`)
  response = await request(`${baseUrl}/health`, { headers: { Host: 'evil.example.com' } })
  expect(response.status === 403, 'host gate rejects a foreign Host header (hostile ALLOWED_HOSTS=* was overridden)')
  response = await request(`${baseUrl}/health`, { headers: { ...proxyHeaders, 'X-Forwarded-Host': 'evil.example.com' } })
  expect(response.status === 403, 'host gate rejects a foreign X-Forwarded-Host')
  response = await request(`${baseUrl}/session/${key}`, { headers: proxyHeaders })
  expect(response.status === 200 && response.text.includes('lavish-session'), 'session page loads through proxy-shaped headers')

  // --- sandboxed-iframe SDK delivery ---------------------------------------
  // The artifact iframe has an opaque origin, so a real browser fetches its
  // subresources without credentials and the Codespaces proxy rejects them.
  // The served artifact document must therefore carry the SDK inline.
  const sessionJson = JSON.parse((response.text.match(/<script id="lavish-session" type="application\/json">(.*?)<\/script>/s) || [])[1] || '{}')
  response = await request(`${baseUrl}/api/${key}/artifact-loads/begin`, {
    method: 'POST',
    headers: browserShape(key),
    body: JSON.stringify({ request_id: 'live-http-sdk-probe', request_sequence: 1, chrome_load_token: sessionJson.chromeLoadToken || '' }),
  })
  const artifactLoad = JSON.parse(response.text || '{}')
  expect(response.status === 200 && Boolean(artifactLoad.artifact_load_token), 'artifact load begins from the session chrome token')
  response = await request(
    `${baseUrl}/artifact/${key}/index.html?artifact_revision=${artifactLoad.artifact_revision ?? 0}&artifact_load_token=${encodeURIComponent(artifactLoad.artifact_load_token || '')}`,
    { headers: proxyHeaders },
  )
  expect(
    response.status === 200 && response.text.includes('data-lavish-sdk="inline"') && !response.text.includes('src="/sdk.js'),
    'served artifact inlines the review SDK (no subresource the sandboxed iframe cannot fetch)',
  )

  // --- origin matrix on feedback submission --------------------------------
  const promptBody = JSON.stringify({ prompts: [{ text: 'live-http probe' }] })
  response = await request(`${baseUrl}/api/${key}/prompts`, { method: 'POST', headers: browserShape(key), body: promptBody })
  expect(response.status === 200, 'proxied browser-tab submission accepted (rewritten Origin + intact Referer)')
  response = await request(`${baseUrl}/api/${key}/prompts`, {
    method: 'POST',
    headers: { ...proxyHeaders, Origin: 'https://evil.example.com', Referer: 'https://evil.example.com/x', 'Content-Type': 'application/json' },
    body: promptBody,
  })
  expect(response.status === 403, 'foreign origin rejected')
  response = await request(`${baseUrl}/api/${key}/prompts`, {
    method: 'POST',
    headers: { ...proxyHeaders, Origin: 'null', 'Content-Type': 'application/json' },
    body: promptBody,
  })
  expect(response.status === 403, 'opaque (null) origin rejected — no token backdoor')
  response = await request(`${baseUrl}/api/${key}/prompts`, {
    method: 'POST',
    headers: { ...proxyHeaders, Origin: `http://localhost:${port}`, Referer: 'https://evil.example.com/x', 'Content-Type': 'application/json' },
    body: promptBody,
  })
  expect(response.status === 403, 'rewritten Origin with a foreign Referer rejected (Referer anchors the decision)')
  response = await request(`${baseUrl}/api/${key}/prompts`, {
    method: 'POST',
    headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
    body: promptBody,
  })
  expect(response.status === 200, 'plain loopback same-origin submission accepted')

  // --- end-route gate ------------------------------------------------------
  response = await request(`${baseUrl}/api/${key}/end`, { method: 'POST' })
  expect(response.status === 403, 'drive-by session end (no origin, no referer) rejected')
  response = await request(`${baseUrl}/api/${key}/end`, {
    method: 'POST',
    headers: { ...proxyHeaders, Origin: 'https://evil.example.com', Referer: 'https://evil.example.com/x' },
  })
  expect(response.status === 403, 'cross-origin session end rejected')

  // --- poll delivery -------------------------------------------------------
  result = await runReview(['poll', '--timeout-ms', '8000'])
  expect(result.status === 0 && result.stdout.includes('Status: feedback'), 'poll returns the queued feedback')
  expect(result.stdout.includes('live-http probe'), 'feedback text is delivered intact')
  expect(!result.stdout.includes('next_step:'), "upstream next_step (which names the bare binary) is not shown")
  const savedPayload = await readFile(lastPoll, 'utf8').catch(() => '')
  expect(savedPayload.includes('live-http probe'), 'raw payload preserved in .lavish/last-poll.txt')

  // --- reply (is a re-poll) ------------------------------------------------
  result = await runReview(['reply', 'applied the probe feedback', '--timeout-ms', '2500'])
  expect(result.status === 0 && result.stdout.includes('Status: waiting'), 'reply posts and re-polls (waiting)')

  // --- empty-queue Send & End transport ------------------------------------
  response = await request(`${baseUrl}/api/${key}/prompts`, {
    method: 'POST', headers: browserShape(key), body: JSON.stringify({ prompts: [], endSession: true }),
  })
  expect(response.status === 200, 'Send & End transport accepted with an empty queue')
  result = await runReview(['poll', '--timeout-ms', '8000'])
  expect(result.status === 0 && result.stdout.includes('Status: ended'), 'poll reports the ended session')
  const recordAfterEnd = await readFile(activeRecord, 'utf8').catch(() => null)
  expect(recordAfterEnd === null, 'active review record cleared on end')

  // --- reopen contract ------------------------------------------------------
  // Only a user-initiated end (the browser End control → POST /api/:key/end)
  // blocks a plain reopen. Re-establish the session, end it as the user, then
  // prove both the refusal and the explicit --reopen escape hatch.
  result = await runReview(['open', artifact, '--reopen'])
  expect(result.status === 0, 'session reopens for the reopen-contract check')
  response = await request(`${baseUrl}/api/${key}/end`, { method: 'POST', headers: browserShape(key) })
  expect(response.status === 200, 'browser-shape user end accepted through the gate')
  result = await runReview(['open', artifact])
  expect(result.status !== 0 && `${result.stdout}${result.stderr}`.includes('--reopen'), 'user-ended session requires an explicit --reopen')
  result = await runReview(['open', artifact, '--reopen'])
  expect(result.status === 0, 'explicit --reopen resumes the session')

  // --- interrupted/overlapping poll recovery -------------------------------
  // Agent harnesses may interrupt a command while its child poll is still
  // alive. Two destructive upstream polls must not split final feedback from
  // the ended state: the wrapper serializes and replays the delivered payload.
  const firstPoll = spawnReview(['poll', '--timeout-ms', '8000'])
  await new Promise((resolve) => setTimeout(resolve, 300))
  const secondPoll = spawnReview(['poll', '--timeout-ms', '8000'])
  await new Promise((resolve) => setTimeout(resolve, 500))
  response = await request(`${baseUrl}/api/${key}/prompts`, {
    method: 'POST',
    headers: browserShape(key),
    body: JSON.stringify({
      prompts: [{ uid: '', prompt: 'overlapping poll probe', selector: '', tag: 'message', text: 'Freeform message' }],
      endSession: true,
    }),
  })
  expect(response.status === 200, 'final feedback accepted while overlapping wrapper polls exist')
  const [firstPollResult, secondPollResult] = await Promise.all([firstPoll, secondPoll])
  expect(firstPollResult.status === 0 && firstPollResult.stdout.includes('overlapping poll probe'), 'first poll receives final feedback')
  expect(secondPollResult.status === 0 && secondPollResult.stdout.includes('overlapping poll probe'), 'overlapping poll replays final feedback instead of losing it')
  expect(secondPollResult.stderr.includes('Another Lavish poll is finishing'), 'overlapping poll reports that it is recovering prior delivery')

  // --- foreign process on the port ------------------------------------------
  await runReview(['stop'])
  const foreignFake = await startFakeServer({ ok: true, app: 'something-else' })
  result = await runReview(['open', artifact])
  await new Promise((resolve) => foreignFake.close(resolve))
  expect(result.status !== 0 && `${result.stdout}${result.stderr}`.includes('another program'), 'a non-Lavish listener is never killed and fails clearly')

  // --- Scenario B: the real forwarded origin (Codespace only) ----------------
  const realCodespace = process.env.CODESPACE_NAME
  const realDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
  const githubToken = process.env.GITHUB_TOKEN
  if (process.env.CODESPACES === 'true' && realCodespace && realDomain && githubToken && !process.env.LAVISH_VERIFY_SKIP_FORWARDED) {
    const realPort = 4387
    const realEnv = { ...process.env }
    delete realEnv.LAVISH_AXI_PORT
    const forwardedBase = `https://${realCodespace}-${realPort}.${realDomain}`
    const priorHealth = await request(`http://127.0.0.1:${realPort}/health`).catch(() => null)
    const serverWasRunning = priorHealth?.status === 200

    const realArtifact = path.join(work, `forwarded-${Date.now()}.html`)
    await cp(staticFixture, realArtifact)
    result = await runReview(['open', realArtifact], { env: realEnv })
    expect(result.status === 0, 'forwarded: open succeeds on port 4387')
    const realUrl = (result.stdout.split('\n').find((line) => line.startsWith('Review URL: ')) || '').replace('Review URL: ', '').trim()
    expect(realUrl.startsWith(`${forwardedBase}/session/`), `forwarded: URL is the real Codespaces origin (${realUrl})`)
    const realKey = realUrl.split('/session/')[1] || ''

    const authed = { 'X-Github-Token': githubToken }
    response = await request(`${forwardedBase}/health`, { headers: authed })
    expect(response.status === 200 && response.text.includes(`"workshop_feedback_patch":${patchMarker}`), 'forwarded: health reaches the patched server through the proxy')
    response = await request(`${forwardedBase}/session/${realKey}`, { headers: authed })
    expect(response.status === 200 && response.text.includes('lavish-session'), 'forwarded: session page loads through the proxy')
    response = await request(`${forwardedBase}/health`)
    expect(response.status !== 200 || !response.text.includes('lavish-axi'), 'forwarded: unauthenticated requests do not reach the server')

    response = await request(`${forwardedBase}/api/${realKey}/prompts`, {
      method: 'POST',
      headers: { ...authed, Origin: forwardedBase, Referer: `${forwardedBase}/session/${realKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: [{ text: 'forwarded probe' }] }),
    })
    expect(response.status === 200, 'forwarded: real-proxy browser-shape feedback accepted')
    response = await request(`${forwardedBase}/api/${realKey}/prompts`, {
      method: 'POST',
      headers: { ...authed, Origin: 'https://evil.example.com', Referer: 'https://evil.example.com/x', 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: [{ text: 'evil' }] }),
    })
    expect(response.status === 403, 'forwarded: foreign origin still rejected through the real proxy')

    result = await runReview(['poll', '--timeout-ms', '8000'], { env: realEnv })
    expect(result.status === 0 && result.stdout.includes('forwarded probe'), 'forwarded: poll delivers the feedback')
    result = await runReview(['reply', 'applied the forwarded probe', '--timeout-ms', '2500'], { env: realEnv })
    expect(result.status === 0 && result.stdout.includes('Status: waiting'), 'forwarded: reply acknowledges delivered feedback')
    response = await request(`${forwardedBase}/api/${realKey}/prompts`, {
      method: 'POST',
      headers: { ...authed, Origin: forwardedBase, Referer: `${forwardedBase}/session/${realKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: [], endSession: true }),
    })
    expect(response.status === 200, 'forwarded: empty Send & End accepted')
    result = await runReview(['poll', '--timeout-ms', '8000'], { env: realEnv })
    expect(result.status === 0 && result.stdout.includes('Status: ended'), 'forwarded: session end delivered')
    if (!serverWasRunning) await runReview(['stop'], { env: realEnv })
  } else {
    console.log('note: forwarded-origin scenario skipped (not a Codespace or LAVISH_VERIFY_SKIP_FORWARDED set).')
  }
} finally {
  await cleanup()
}

console.log('')
if (failures > 0) {
  console.error(`check-live-http: ${failures} failure(s).`)
  process.exit(1)
}
console.log('check-live-http: all checks passed.')
