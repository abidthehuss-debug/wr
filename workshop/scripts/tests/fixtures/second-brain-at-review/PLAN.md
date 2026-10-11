# Workshop MVP Plan

## Project

Name: Second Brain

One-sentence goal: A private, local Markdown memory vault the attendee's AI
agents can read, answer questions from, and deliberately write to.

Starter: workshop/starters/second-brain

Project root: second-brain/

## What we are building

A local-only Second Brain: a small Markdown vault under `second-brain/Memory/`
with projects, decisions, and people notes, exercised through agent questions
and deliberate memory writes, and finally reviewed as a visual map.

## Who it is for

Target user or audience: the attendee, as a private working memory for their
AI sessions.

## Core features

1. A structured Markdown memory vault with categories.
2. Question answering grounded in the vault content.
3. A deliberate memory write that survives a fresh session.

## Constraints

Local-only; no credentials; no external services; plain Markdown, no database,
no dashboard app.

## Technology

Chosen stack: Markdown files + the existing agent skills; a single
self-contained HTML page for the final visual map.

Why this was chosen: the smallest private setup that teaches memory-augmented
agent work, with a deterministic static-page path for the visual review.

## How to run it

1. Ask questions that the vault can answer.
2. Ask the agent to remember something new, then verify it in a fresh session.
3. Open the final map review when the plan reaches W05.

## Definition of Done

The vault answers project and decision questions, a deliberate memory write
persists, and the attendee has reviewed and approved the visual map of their
Second Brain through Lavish.

## Build Plan

### W01 - Vault structure

Status: DONE

Goal:

A `second-brain/Memory/` vault with README, projects, and decisions notes.

Acceptance criteria:

- The three Markdown files exist with real content.

Verification:

- List and read the vault files.

Visual review: NO

Notes:

Completed: vault seeded under `second-brain/Memory/`.

### W02 - Question answering

Status: DONE

Goal:

Project and decision questions answered from the vault.

Acceptance criteria:

- A project-status question cites `projects.md` content.
- A decision question cites `decisions.md` content.

Verification:

- Ask both questions and check the answers against the files.

Visual review: NO

Notes:

Completed: verified both question types against the seeded vault.

### W03 - Deliberate memory write

Status: DONE

Goal:

An explicit "remember this" flow that appends to the vault.

Acceptance criteria:

- A requested memory lands in the right category file.

Verification:

- Request a memory write, then read the file back.

Visual review: NO

Notes:

Completed: memory writes verified against the vault files.

### W04 - Privacy posture

Status: DONE

Goal:

The vault stays local and credential-free.

Acceptance criteria:

- No secrets in the vault; nothing leaves the machine.

Verification:

- Review vault contents; confirm no external calls are configured.

Visual review: NO

Notes:

Completed: local-only posture confirmed.

### W05 - Visual map review

Status: TODO

Goal:

The attendee reviews a visual map of their Second Brain and approves it.

Acceptance criteria:

- A self-contained map page is generated at `.lavish/second-brain-map.html`
  from the actual vault (categories, sources, one example question each, and
  the privacy posture) — no iframes, no served URLs, no browser storage.
- It opens through `workshop/scripts/lavish-review open
  .lavish/second-brain-map.html`.
- The attendee annotates it; reasonable structural feedback is applied to the
  map (and to the real vault when it concerns vault structure) and
  re-reviewed.

Verification:

- Complete the Lavish review loop until the attendee ends it.

Visual review: REQUIRED

Notes:

Do not build a dashboard app; the map is one static page generated from the
vault.
