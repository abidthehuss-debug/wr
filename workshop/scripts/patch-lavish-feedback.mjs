#!/usr/bin/env node

// Workshop compatibility patch for the pinned lavish-axi release.
//
// Applied once, at install time, to the workshop-owned copy under
// workshop/vendor/lavish/node_modules/lavish-axi (never to a global npm tree).
// Repair is always: `npm ci` at the vendor prefix (restores pristine sources
// from the integrity-locked tarball), then re-apply this patch.
//
// What it fixes, and why each fix is required:
//
// 1. Codespaces feedback delivery (S1, S4). GitHub's port-forwarding proxy
//    delivers correct `X-Forwarded-Host`/`X-Forwarded-Proto: https` headers and
//    an untouched `Referer`, but REWRITES the browser's own `Origin` header to
//    the container-local form `http://localhost:<port>` (measured 2026-08-13
//    with a header-echo server; foreign origins pass through unchanged).
//    Stock `isSameOriginRequest` treats a present Origin as decisive, so every
//    feedback POST from a real browser tab is rejected with 403 even though
//    the request is genuinely same-origin. The patch treats exactly that
//    proxy-rewritten self-referential Origin on a forwarded request as
//    inconclusive and decides via the untouched Referer against the same
//    expected origin. Foreign origins arrive unrewritten and are still
//    rejected; a page cannot forge its browser-set Origin or Referer. The
//    DNS-rebinding host allowlist runs before this check and is untouched.
//    The browser end route (`POST /api/:key/end`) is ungated in stock 0.1.50;
//    because this workshop's artifact path is deterministic (session keys are
//    path-derived), the patch adds the same same-origin gate there so a
//    drive-by cross-site POST cannot end an attendee's review session.
//
// 2. Send & End with an empty queue (C1). Broken in every upstream release
//    0.1.38-0.1.50: clicking "Send & End" with nothing queued is a silent
//    no-op, which is exactly the golden workshop flow (send feedback, agent
//    applies it, attendee ends the review without typing anything new).
//
// 3. Snapshot correlation (C2-C4, S3). Stock correlates snapshot requests and
//    responses through a shared FIFO array; a lost or reordered response
//    wedges Send with no visible error. The patch keys requests by id and
//    submits after a bounded timeout when the artifact never answers.
//
// 4. Silent failure surfacing (C5-C8, C9-C10). Stock leaves endSession() and
//    submitQueued() promise rejections unhandled and throws generic errors;
//    the patch attaches handlers and surfaces the server's own error text so
//    a beginner sees an actionable message instead of nothing.
//
// 5. Sandboxed-iframe SDK delivery (the "annotation does nothing in a real
//    browser" failure). Stock injects the artifact SDK into the served
//    artifact as an external `<script src="/sdk.js?...">` subresource. The
//    artifact iframe is deliberately sandboxed WITHOUT allow-same-origin, so
//    its opaque origin gets an empty partitioned cookie jar: a real browser
//    fetches /sdk.js with no credentials and GitHub's port-forwarding proxy
//    answers 302 -> github.dev/pf-signin (measured 2026-08-13 with curl).
//    The SDK never runs; annotation, snapshots, and layout diagnostics die
//    silently while the app itself still renders (its assets are inlined),
//    and the chrome's availability probe stays quiet because the artifact
//    DOCUMENT — fetched from the credentialed chrome context — answers 200.
//    Header-authenticated test browsers mask the bug (setExtraHTTPHeaders
//    attaches the token to every request, including the iframe's). The patch
//    inlines the SDK source into the served artifact document, so the
//    sandboxed iframe needs no authenticated subresource at all.
//
// Explicitly NOT patched (kept stock, on purpose): the artifact iframe
// sandbox, the `X-Frame-Options`/`frame-ancestors` headers on the session
// page, the host allowlist, and the prompts-route authorization structure.
// Unlike the previous generation of this patch there is no `Origin: null`
// acceptance and no bearer-style handoff token: the sandboxed (opaque-origin)
// artifact must NOT be able to post feedback, per GHSA-w887-pf37-frrv.

import { mkdir, realpath, readFile, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

export const affectedVersion = '0.1.50'
export const patchMarker = 4

// --- chrome-client.js -------------------------------------------------------

const brokenEmptyQueueBranch = `  if (!queued.length) {
    showSendHint();
    return;
  }`

const fixedEmptyQueueBranch = `  if (!queued.length) {
    if (endAfter) {
      endSession().catch(showSubmissionFailure);
      return;
    }
    showSendHint();
    return;
  }`

const brokenSnapshotState = `const snapshotRequests = [];
let endAfterSubmit = false;`

const fixedSnapshotState = `const snapshotRequests = new Map();
let snapshotRequestSequence = 0;
const snapshotSubmitTimeoutMs = 1500;
let endAfterSubmit = false;`

// Stock has no submission-failure handler at all, so it is inserted here as
// part of the requestSnapshot replacement (one block, no overlapping edits).
const brokenSnapshotRequest = `function requestSnapshot(action) {
  snapshotRequests.push(action);
  postToFrame({ type: "lavish:requestSnapshot" });
}`

const fixedSnapshotRequest = `function showSubmissionFailure(error) {
  const detail = error instanceof Error ? error.message : String(error || "unknown error");
  sendHint.textContent = \`Could not send feedback (\${detail}). Your comments are still queued; refresh and try again.\`;
  showSendHint();
}

function requestSnapshot(action) {
  const requestId = String(++snapshotRequestSequence);
  const timeout = window.setTimeout(() => {
    if (!snapshotRequests.has(requestId)) return;
    snapshotRequests.delete(requestId);
    if (action !== "submit") return;
    pendingSnapshot = "";
    submitQueued().catch(showSubmissionFailure);
  }, snapshotSubmitTimeoutMs);
  snapshotRequests.set(requestId, { action, timeout });
  postToFrame({ type: "lavish:requestSnapshot", request_id: requestId });
}`

const brokenSnapshotResponse = `  if (msg.type === "lavish:snapshot") {
    const snapshotAction = snapshotRequests.shift() || "submit";
    if (snapshotAction === "copy") {
      copyText(msg.snapshot || "");
    } else {
      pendingSnapshot = msg.snapshot || "";
      submitQueued();
    }
  }`

const fixedSnapshotResponse = `  if (msg.type === "lavish:snapshot") {
    const requestId = String(msg.request_id || "");
    const request = snapshotRequests.get(requestId);
    if (!request) return;
    snapshotRequests.delete(requestId);
    if (request.timeout) window.clearTimeout(request.timeout);
    if (request.action === "copy") {
      copyText(msg.snapshot || "");
    } else {
      pendingSnapshot = msg.snapshot || "";
      submitQueued().catch(showSubmissionFailure);
    }
  }`

// The stock chrome starts the iframe before registering its load listener. A
// fast cached load (common through the Codespaces proxy) can therefore miss
// the initial annotation-mode message even while the outer toggle says it is
// on. The first authenticated SDK message is a reliable ready handshake.
const brokenArtifactHandshake = `  const messageSequence = ++artifactMessageSequence;
  artifactSpokeToken = messageToken;
  clearTimeout(artifactSilenceTimer);`

const fixedArtifactHandshake = `  const messageSequence = ++artifactMessageSequence;
  const firstArtifactMessage = artifactSpokeToken !== messageToken;
  artifactSpokeToken = messageToken;
  clearTimeout(artifactSilenceTimer);
  if (firstArtifactMessage) {
    postToFrame({ type: "lavish:setAnnotationMode", enabled: annotation && !ended });
  }`

const brokenQueuedReplay = `      if (queued.length) {
        submitQueued();
      } else if (endAfterSubmit) {
        endAfterSubmit = false;
        endSession();
      }`

const fixedQueuedReplay = `      if (queued.length) {
        submitQueued().catch(showSubmissionFailure);
      } else if (endAfterSubmit) {
        endAfterSubmit = false;
        endSession().catch(showSubmissionFailure);
      }`

const brokenArtifactEnd = `  if (msg.type === "lavish:endSession") endSession();`
const fixedArtifactEnd = `  if (msg.type === "lavish:endSession") endSession().catch(showSubmissionFailure);`

const brokenMenuEnd = `endButton.onclick = () => {
  closeMenus();
  endSession();
};`

const fixedMenuEnd = `endButton.onclick = () => {
  closeMenus();
  endSession().catch(showSubmissionFailure);
};`

// Transport stays stock (same-origin application/json, no token). Only the
// error path changes: surface the server's own error text on screen.
const brokenPromptSubmission = `  const body = { prompts: prompts.map(stripInternalPromptFields), domSnapshot: pendingSnapshot };
  if (shouldEndSession) body.endSession = true;
  const response = await fetch("/api/" + key + "/prompts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 409) {
      const data = await response.json().catch(() => null);
      if (Array.isArray(data?.warnings)) setLayoutWarnings(data.warnings);
      endAfterSubmit = false;
      return false;
    }
    throw new Error("failed to submit queued prompts");
  }`

const fixedPromptSubmission = `  const body = { prompts: prompts.map(stripInternalPromptFields), domSnapshot: pendingSnapshot };
  if (shouldEndSession) body.endSession = true;
  const response = await fetch("/api/" + key + "/prompts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 409) {
      if (Array.isArray(data?.warnings)) setLayoutWarnings(data.warnings);
      endAfterSubmit = false;
      return false;
    }
    throw new Error(data?.error || \`HTTP \${response.status}\`);
  }`

const brokenBrowserEnd = `async function endSession() {
  if (ended) return;
  const response = await fetch("/api/" + key + "/end", { method: "POST" });
  if (!response.ok) throw new Error("failed to end session");
  markSessionEnded();
}`

const fixedBrowserEnd = `async function endSession() {
  if (ended) return;
  const response = await fetch("/api/" + key + "/end", { method: "POST" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || \`HTTP \${response.status}\`);
  }
  markSessionEnded();
}`

// --- cli.mjs ----------------------------------------------------------------

const brokenSdkSnapshotResponse = `    if (msg.type === "lavish:requestSnapshot") {
      postArtifactMessage("lavish:snapshot", { snapshot: snapshot() });
    }`

const fixedSdkSnapshotResponse = `    if (msg.type === "lavish:requestSnapshot") {
      postArtifactMessage("lavish:snapshot", {
        snapshot: snapshot(),
        request_id: String(msg.request_id || "")
      });
    }`

const brokenHealthRoute = `  app.get("/health", (req, res) => {
    res.json({ ok: true, app: "lavish-axi", version });
  });`

const fixedHealthRoute = `  app.get("/health", (req, res) => {
    res.json({ ok: true, app: "lavish-axi", version, workshop_feedback_patch: ${patchMarker} });
  });`

// The reverse-proxy origin fix. Everything before this tail (host parsing,
// the X-Forwarded-Host/Proto allowlist validation, expectedOrigin) is stock.
const brokenSameOriginTail = `  const expectedOrigin = normalizeOrigin(\`\${protocol}://\${authority.authority}\`);
  if (!expectedOrigin) return false;
  const origin = req.get("origin");
  if (origin) {
    return normalizeOrigin(origin) === expectedOrigin;
  }
  const referer = req.get("referer");
  return Boolean(referer) && normalizeOrigin(referer) === expectedOrigin;
}`

const fixedSameOriginTail = `  const expectedOrigin = normalizeOrigin(\`\${protocol}://\${authority.authority}\`);
  if (!expectedOrigin) return false;
  const origin = req.get("origin");
  const referer = req.get("referer");
  const refererMatchesExpected = Boolean(referer) && normalizeOrigin(referer) === expectedOrigin;
  if (origin) {
    if (normalizeOrigin(origin) === expectedOrigin) return true;
    const proxyLocalOrigin = forwardedHost ? normalizeOrigin(\`http://\${host.authority}\`) : "";
    if (proxyLocalOrigin && normalizeOrigin(origin) === proxyLocalOrigin) {
      return refererMatchesExpected;
    }
    return false;
  }
  return refererMatchesExpected;
}`

const brokenEndRoute = `  app.post("/api/:key/end", async (req, res, next) => {
    try {
      await store.endSession(req.params.key, "user");`

const fixedEndRoute = `  app.post("/api/:key/end", async (req, res, next) => {
    try {
      if (!isSameOriginRequest(req, allowedHostnames, allowAnyHostname)) {
        res.status(403).json({ error: "cross-origin session end rejected" });
        return;
      }
      await store.endSession(req.params.key, "user");`

// The sandboxed-iframe SDK delivery fix. `createSdkJs` already returns a fully
// self-contained IIFE (key, revision, and load token baked in), so it can be
// embedded directly in the served document. The two escapes keep the HTML
// parser from ending the script early; both sequences can only occur inside
// string literals or comments of the stringified SDK, where `<\/` and `<\!`
// are identical to the unescaped forms.
const brokenSdkInjection = `  const script = \`<script src="/sdk.js?key=\${encodeURIComponent(key)}\${revisionQuery}\${tokenQuery}"></script>\`;`

const fixedSdkInjection = `  const inlineSdkSource = createSdkJs(key, revision === null ? 0 : revision, token)
    .replace(/<\\/script/gi, "<\\\\/script")
    .replace(/<!--/g, "<\\\\!--");
  const script = \`<script data-lavish-sdk="inline">\${inlineSdkSource}</script>\`;`

// --- patch application ------------------------------------------------------

function occurrences(source, value) {
  if (!value) return 0
  let count = 0
  let offset = 0
  while ((offset = source.indexOf(value, offset)) !== -1) {
    count += 1
    offset += value.length
  }
  return count
}

function replaceCompatibilityBlock(source, broken, fixed, description) {
  const brokenCount = occurrences(source, broken)
  const fixedCount = occurrences(source, fixed)
  if (brokenCount === 0 && fixedCount === 1) return { changed: false, source }
  if (brokenCount !== 1 || fixedCount !== 0) {
    throw new Error(`Lavish ${affectedVersion} has an unexpected ${description} implementation; refusing an unsafe partial patch.`)
  }
  return { changed: true, source: source.replace(broken, fixed) }
}

export function patchLavishChromeClientSource(source) {
  let changed = false
  for (const [broken, fixed, description] of [
    [brokenEmptyQueueBranch, fixedEmptyQueueBranch, 'Send & End'],
    [brokenSnapshotState, fixedSnapshotState, 'snapshot state'],
    [brokenSnapshotRequest, fixedSnapshotRequest, 'snapshot request'],
    [brokenSnapshotResponse, fixedSnapshotResponse, 'snapshot response'],
    [brokenArtifactHandshake, fixedArtifactHandshake, 'artifact annotation handshake'],
    [brokenQueuedReplay, fixedQueuedReplay, 'queued submission replay'],
    [brokenPromptSubmission, fixedPromptSubmission, 'prompt submission'],
    [brokenBrowserEnd, fixedBrowserEnd, 'browser session end'],
    [brokenArtifactEnd, fixedArtifactEnd, 'artifact session end'],
    [brokenMenuEnd, fixedMenuEnd, 'menu session end'],
  ]) {
    const result = replaceCompatibilityBlock(source, broken, fixed, description)
    source = result.source
    changed ||= result.changed
  }
  if ((source.match(/function showSubmissionFailure\s*\(/g) || []).length !== 1) {
    throw new Error(`Lavish ${affectedVersion} has an unexpected number of submission-error handlers; refusing an unsafe partial patch.`)
  }
  return { changed, source }
}

export function patchLavishCliSource(source) {
  let changed = false
  for (const [broken, fixed, description] of [
    [brokenSdkSnapshotResponse, fixedSdkSnapshotResponse, 'artifact snapshot response'],
    [brokenHealthRoute, fixedHealthRoute, 'health marker'],
    [brokenSameOriginTail, fixedSameOriginTail, 'proxied same-origin validation'],
    [brokenEndRoute, fixedEndRoute, 'session end authorization'],
    [brokenSdkInjection, fixedSdkInjection, 'sandboxed SDK delivery'],
  ]) {
    const result = replaceCompatibilityBlock(source, broken, fixed, description)
    source = result.source
    changed ||= result.changed
  }
  return { changed, source }
}

async function lavishPackageFiles(binary) {
  const cliFile = await realpath(binary)
  const distDirectory = path.dirname(cliFile)
  return {
    chromeClientFile: path.join(distDirectory, 'chrome-client.js'),
    cliFile,
    packageFile: path.join(distDirectory, '..', 'package.json'),
  }
}

async function writeAtomically(file, source) {
  const metadata = await stat(file)
  const temporaryFile = `${file}.workshop-${process.pid}.tmp`
  try {
    await writeFile(temporaryFile, source, { mode: metadata.mode })
    await rename(temporaryFile, file)
  } catch (error) {
    await unlink(temporaryFile).catch(() => {})
    throw error
  }
}

async function acquirePackageLock(packageDirectory) {
  const lockDirectory = path.join(packageDirectory, '.workshop-lavish-feedback-patch.lock')
  const ownerFile = path.join(lockDirectory, 'owner')
  const deadline = Date.now() + 10_000
  while (true) {
    try {
      await mkdir(lockDirectory)
      try {
        await writeFile(ownerFile, String(process.pid))
      } catch (ownerError) {
        await rmdir(lockDirectory).catch(() => {})
        throw ownerError
      }
      return async () => {
        await unlink(ownerFile).catch(() => {})
        await rmdir(lockDirectory).catch(() => {})
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      const lockAge = Date.now() - (await stat(lockDirectory).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs
      const ownerPid = Number.parseInt(await readFile(ownerFile, 'utf8').catch(() => ''), 10)
      let ownerIsGone = false
      if (Number.isSafeInteger(ownerPid) && ownerPid > 0) {
        try {
          process.kill(ownerPid, 0)
        } catch (ownerError) {
          ownerIsGone = ownerError?.code === 'ESRCH'
        }
      }
      if (ownerIsGone || lockAge > 120_000) {
        await unlink(ownerFile).catch(() => {})
        await rmdir(lockDirectory).catch(() => {})
        continue
      }
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for another Lavish compatibility patch process to finish.')
      }
      await delay(50)
    }
  }
}

async function replaceFilesAsUnit(changes, verify) {
  const staged = []
  const replaced = []
  try {
    for (const change of changes) {
      const metadata = await stat(change.file)
      const temporaryFile = `${change.file}.workshop-stage-${process.pid}-${staged.length}.tmp`
      await writeFile(temporaryFile, change.next, { mode: metadata.mode })
      staged.push({ ...change, temporaryFile })
    }
    for (const change of staged) {
      await rename(change.temporaryFile, change.file)
      replaced.push(change)
    }
    await verify()
  } catch (error) {
    const rollbackErrors = []
    for (const change of replaced.reverse()) {
      try {
        await writeAtomically(change.file, change.previous)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], 'Lavish patch failed and could not be rolled back completely.')
    }
    throw error
  } finally {
    await Promise.all(staged.map((change) => unlink(change.temporaryFile).catch(() => {})))
  }
}

export async function applyPatch(binary, { checkOnly = false, quiet = false } = {}) {
  const { chromeClientFile, cliFile, packageFile } = await lavishPackageFiles(binary)
  // A check is deliberately read-only so any sandbox can verify the install.
  // Repair is never done in-band here; it is `lavish-review install`
  // (npm ci at the vendor prefix, then this script's apply mode).
  const releaseLock = checkOnly ? async () => {} : await acquirePackageLock(path.dirname(packageFile))
  try {
    const packageMetadata = JSON.parse(await readFile(packageFile, 'utf8'))
    if (packageMetadata.name !== 'lavish-axi') {
      throw new Error(`Refusing to patch an unexpected package: ${packageMetadata.name || 'unknown'}`)
    }

    if (packageMetadata.version !== affectedVersion) {
      throw new Error(
        `Lavish ${packageMetadata.version} does not match the workshop's pinned release ${affectedVersion}. ` +
        'Run workshop/scripts/lavish-review install to restore the pinned version.',
      )
    }

    const chromeSource = await readFile(chromeClientFile, 'utf8')
    const cliSource = await readFile(cliFile, 'utf8')
    const chromeResult = patchLavishChromeClientSource(chromeSource)
    const cliResult = patchLavishCliSource(cliSource)
    const changed = chromeResult.changed || cliResult.changed
    if (!changed) {
      if (!quiet) console.log(`Lavish ${affectedVersion} workshop compatibility patch is ready.`)
      return { changed: false, affected: true }
    }
    if (checkOnly) {
      throw new Error(`Lavish ${affectedVersion} is installed without the required workshop compatibility patch.`)
    }

    const changes = []
    if (chromeResult.changed) {
      changes.push({ file: chromeClientFile, previous: chromeSource, next: chromeResult.source })
    }
    if (cliResult.changed) {
      changes.push({ file: cliFile, previous: cliSource, next: cliResult.source })
    }
    await replaceFilesAsUnit(changes, async () => {
      const verifiedChrome = patchLavishChromeClientSource(await readFile(chromeClientFile, 'utf8'))
      const verifiedCli = patchLavishCliSource(await readFile(cliFile, 'utf8'))
      if (verifiedChrome.changed || verifiedCli.changed) {
        throw new Error('Lavish compatibility patch verification failed after writing the installed files.')
      }
    })

    if (!quiet) console.log(`Applied the Lavish ${affectedVersion} workshop compatibility patch.`)
    return { changed: true, affected: true }
  } finally {
    await releaseLock()
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check')
  const quiet = args.includes('--quiet')
  const positional = args.filter((value) => !value.startsWith('--'))
  const unsupported = args.some((value) => value.startsWith('--') && !['--check', '--quiet'].includes(value))
  if (positional.length !== 1 || unsupported) {
    console.error('Usage: patch-lavish-feedback.mjs [--check] [--quiet] <lavish-axi-cli-path>')
    process.exitCode = 2
  } else {
    applyPatch(positional[0], { checkOnly, quiet }).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
  }
}
