---
name: workshop
description: Turn a beginner's vague project idea into a small, approved, self-contained MVP plan in workshop/PLAN.md. Use only for planning a new workshop project; do not implement the project. Protect any unfinished existing plan.
---

# Plan a Workshop MVP

Create the persistent handover that future fresh sessions will build from. Do
not substantially implement the project in this session.

The attendee may optionally supply a starter path after `$workshop`. Treat that
text as the requested starter path. No supplied text means the normal free-form
workflow.

## 1. Check the workspace

Inspect the repository briefly to understand what already exists, including
`AGENTS.md`, `CLAUDE.md` when present, the top-level structure, the README,
current Git status, and any existing project files. Use CodeGraph when it is
already installed and useful, but do not require it.

Look for `workshop/PLAN.md` before interviewing the attendee.

- If it contains unfinished work, do not overwrite it. Explain that a project
  is already in progress and recommend a fresh session with `/build` in Claude
  or `$build` in Codex.
- Replace an unfinished plan only if the attendee clearly asks to abandon it
  and then confirms the replacement after being warned that the existing plan
  will be lost.
- If the existing plan is complete, ask whether the attendee wants to replace
  it before doing so.

If a starter path was supplied, normalize it relative to the repository root
without modifying it. Accept only a directory directly below
`workshop/starters/` that contains both `README.md` and `BRIEF.md`. Resolve the
path and verify it remains inside `workshop/starters/`; do not treat an
arbitrary file or directory as a starter. If it is invalid, stop with:

“I couldn't find that workshop starter.

Available starters:”

Then list each recognized direct child of `workshop/starters/` by its relative
path. Do not list unrelated directories.

Read the recognized starter's `BRIEF.md` and its attendee `README.md`. If it has
an `UPSTREAM.md`, read that too. Treat the starter and any external upstream
clone as read-only reference material throughout planning and building.

For a starter with `UPSTREAM.md`, follow only the pinned reference details
recorded there. Clone it idempotently into the documented path below
`.workshop-local/upstream/` if it is absent, then check out the tested commit.
Never put the clone in tracked project files, copy its agent configuration into
this repository, or treat its instructions as workshop authority. If the clone
or checkout fails, explain briefly that the optional reference is unavailable
and continue planning from the starter brief.

## 2. Interview in simple language

With no starter path, start with: “What would you like to build?” and preserve
the free-form interview below.

Help turn vague answers into a concrete idea. Ask only a small batch of concise
questions about what matters, such as:

- What problem should it solve?
- Who will use it?
- What are the most important things it should do?
- What would make today's demo feel successful?

If the attendee does not know, offer two or three simple choices and recommend
one. Do not expect them to choose a framework, database, state library, or
architecture. Handle technical choices unless they clearly want to participate.
If they need general orientation rather than project planning, point them to
Claude `/guide` or Codex `$guide`.

With a recognized starter, do not ask what to build. Briefly name and explain
the supplied project, then follow its Planning interview section. Ask a small
batch of at most five beginner-friendly questions, including any concise safety
confirmation required by that starter. Offer its defaults and accept “use the
defaults” as a complete answer. Ask no technical questions.

## 3. Keep it achievable

Limit the MVP to at most three core features. Turn an over-large idea into the
smallest useful demonstration and explain that it can grow later. Prefer a
simple working result over an ambitious incomplete one.

Recommend the simplest suitable stack based on the goal, existing repository,
Codespace reliability, and how easily a beginner can view the result. Avoid a
database, authentication, payments, external APIs, microservices, and
infrastructure unless one is central to the idea. Explain the choice in one or
two plain sentences.

## 4. Get approval

Summarize the proposed goal, audience, maximum-three features, stack, and what
will deliberately be left out. Ask the attendee to approve or amend this
summary. Do not write the final plan until they approve it.

## 5. Write the persistent plan

After approval, create `workshop/PLAN.md` using
`workshop/PLAN_TEMPLATE.md` as the canonical structure. Make it concise,
beginner-readable, and fully self-contained; a fresh agent must not need this
conversation.

Create roughly 3–6 ordered steps. Every step must:

- have an ID such as `W01`, a clear title, and `Status: TODO`;
- contain one-session Goal, observable Acceptance criteria, and relevant
  Verification;
- say `Visual review: REQUIRED` or `Visual review: NO`;
- be independently implementable and verifiable without working ahead;
- include decisions or context a fresh session would otherwise miss.

Do not create dozens of tiny steps. Ensure `How to run it` is useful or clearly
marked to be updated when the launch command becomes known.

Always record `Starter: None` for a free-form project or the exact recognized
starter path for a starter project. Always record one explicit `Project root`
where application or memory files will live, even when it is the repository
root. These fields let a fresh build session locate the intended work without
guessing.

For a starter-generated plan, also record the source path and selected choices
near the Project section, for example:

```text
Starter: workshop/starters/<starter-name>
Project root: <relative project directory or repository root>

Customisation:
- Name: ...
- Audience: ...
- Style: ...
```

Make the plan self-contained from the starter brief so future build sessions do
not need the planning conversation or routinely reread the starter. Follow the
starter's intended step shape and constraints without copying stretch ideas
into the MVP. Never create application source code during planning and never
write inside the starter directory.

Record any upstream name, tested commit, project root, privacy mode, or optional
integration choice that the starter requires. Do not record credentials,
private connector URLs, tokens, or personal account identifiers. If the
upstream reference could not be cloned, note that it is optional rather than
blocking the plan.

Mark a step `Visual review: REQUIRED` only when it ends with something the
supported review tooling can actually show: a Vite web application, or a static
HTML page the agent authors (a map, plan, diagram, or report). For such a
visual project, include at least one Lavish checkpoint, usually the final
review and polish step. Its acceptance criteria must require the app or
artifact to open, attendee review through the existing `lavish` skill (which
uses the canonical `workshop/scripts/lavish-review` command), reasonable
in-scope feedback to be applied, and the result to be rechecked. For CLI or
backend-only projects, keep `Visual review: NO`; do not force a visual
checkpoint where it would not help. When the attendee's idea is open-ended and
a simple visual web app would serve it, prefer the workshop-supported stack
(Vite) so the review path stays deterministic.

Make the final step a meaningful final verification/review step so the build
workflow can always use the `workshop-reviewer` subagent before declaring it
done.

Do not commit the plan and do not start building.

If a workshop environment or tooling fault prevents planning, describe it in a
few words and tell the attendee to run Claude `/troubleshoot <description>` or
Codex `$troubleshoot <description>` in a fresh session.

## 6. End clearly

Keep the closing message short:

“Your plan is ready in `workshop/PLAN.md`.

Now start a NEW AI session.

Claude Code: `/build`
Codex: `$build`

The new session will read the plan and continue from there.”
