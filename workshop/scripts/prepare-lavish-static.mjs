#!/usr/bin/env node

// Validates a hand-authored or generated HTML file as a Lavish review
// artifact, IN PLACE. Nothing is copied or rewritten: Lavish live-reloads the
// original file, so agent edits show up in the open review immediately.
//
// Used by `workshop/scripts/lavish-review open <file.html>` for static
// artifacts (the Second Brain map, plans, diagrams, generic review pages).

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const maximumArtifactBytes = 5 * 1024 * 1024

const artifactArgument = process.argv[2]
if (!artifactArgument) {
  console.error('Usage: prepare-lavish-static.mjs <artifact.html>')
  process.exit(2)
}
const artifactFile = path.resolve(artifactArgument)

function failValidation(message) {
  console.error(`Static review artifact is not usable: ${message}`)
  process.exit(1)
}

if (!/\.html?$/i.test(artifactFile)) {
  failValidation(`${artifactFile} is not an .html file.`)
}

let metadata
try {
  metadata = await stat(artifactFile)
} catch {
  failValidation(`${artifactFile} does not exist.`)
}
if (!metadata.isFile()) failValidation(`${artifactFile} is not a regular file.`)
if (metadata.size === 0) failValidation(`${artifactFile} is empty.`)
if (metadata.size > maximumArtifactBytes) {
  failValidation(
    `${artifactFile} is ${metadata.size} bytes; review artifacts must stay under ` +
    `${maximumArtifactBytes} bytes. Inline fewer assets or trim the page.`,
  )
}

const html = await readFile(artifactFile, 'utf8')

if (!/<\/body\s*>/i.test(html)) {
  failValidation('the file has no closing </body> tag, so it is not a complete HTML page.')
}

// The artifact renders inside Lavish's sandboxed iframe: nesting another
// iframe or pointing at a local/forwarded server produces a trust page, a
// blank screen, or an inert review. These are hard failures on purpose.
const forbiddenPatterns = [
  [/<iframe\b/i, 'an <iframe> element'],
  [/(?:https?:)?\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i, 'a localhost or loopback URL'],
  [/[a-z0-9-]+\.app\.github\.dev/i, 'a Codespaces forwarded URL'],
]
for (const [pattern, description] of forbiddenPatterns) {
  if (pattern.test(html)) {
    failValidation(
      `it contains ${description}. Review artifacts must be self-contained; ` +
      'inline the content instead of embedding a served URL.',
    )
  }
}

// Storage is denied inside the sandboxed artifact origin; a page that needs
// localStorage at startup renders blank. Static artifacts must not depend on it.
if (/\b(?:localStorage|sessionStorage)\b/.test(html)) {
  failValidation(
    'it references localStorage or sessionStorage, which the Lavish sandbox denies. ' +
    'Author static review artifacts without browser storage.',
  )
}

const remoteReferences = html.match(/https?:\/\/[^"'`\s)]+/gi) || []
if (remoteReferences.length > 0) {
  const uniqueHosts = [...new Set(remoteReferences.map((reference) => {
    try {
      return new URL(reference).host
    } catch {
      return reference
    }
  }))]
  console.error(
    `Note: the artifact references remote URLs (${uniqueHosts.slice(0, 5).join(', ')}). ` +
    'They load only while the reviewer is online; prefer inlined content.',
  )
}

console.log(`Validated static review artifact: ${artifactFile}`)
