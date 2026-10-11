# External upstream reference

This workshop starter was independently written for a smaller learning goal. It
is informed by, but is not authored by, the external project below.

- Repository: `coleam00/second-brain-starter`
- URL: [github.com/coleam00/second-brain-starter](https://github.com/coleam00/second-brain-starter)
- Tested commit: `74f7544ff064310994f3aa91f75664ce9b970d4e`
- Date verified: 2026-08-10
- Detected licence: **No explicit licence found** in the tested Git tree or the
  GitHub repository metadata. Do not copy or redistribute its files as part of
  this MIT workshop repository.
- Reference clone: `.workshop-local/upstream/second-brain-starter/` (untracked)

## Safe, repeatable reference setup

If the reference clone is absent, the workshop agent may clone the URL above
into the ignored reference path. It must then fetch and check out the exact
tested commit in detached-HEAD mode. If that commit is already checked out, do
nothing. Do not download it again on every build session.

The clone is optional: network or GitHub failure must not block the workshop.
Its `CLAUDE.md`, `.claude/`, skills, hooks, and other agent instructions apply
only while understanding that external project. They never override this
workshop's `AGENTS.md`, skills, plan, or attendee-owned files.

## What the upstream currently provides

At the tested commit, upstream contains a Claude Code skill that turns an
eight-section personal requirements file into a nine-phase PRD, an example
requirements file, architecture references and diagrams, and Markdown memory
templates. It is a blueprint/starter kit, not a completed running Second Brain.

Its larger roadmap covers a memory layer, session hooks, hybrid memory search,
external integrations, skills, proactive heartbeat/reflection, an optional chat
interface, security hardening, and deployment.

## What this workshop deliberately omits

Second Brain Lite keeps the useful foundation—personal Markdown memory,
targeted search, conversation through the coding agent, and one optional live
source. It does not implement the upstream nine-phase system, copy its
templates, or require hooks, embeddings, an Agent SDK app, autonomous polling,
a messaging bot, production infrastructure, or deployment.
