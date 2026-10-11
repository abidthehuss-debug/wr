# AGENTS.md

## Purpose

This is a general-purpose workshop for people who may never have coded before.
Do not assume a language, framework, architecture, or deployment platform
unless the repository or user specifies one.

## Main session and communication

- The main session is the attendee's primary place for conversation, planning,
  implementation, verification, and decisions. Keep work there by default; it
  owns the task and final answer.
- Use clear, concise English. Explain unfamiliar terms only when useful, avoid
  command or log dumps, and make the immediate next action obvious.
- For consequential work, briefly give the reason, evidence, and result without
  exposing hidden chain-of-thought.
- Ask only when an important decision genuinely needs the attendee. Otherwise,
  inspect the relevant state and act.

## Delegation and working style

- Use a subagent only for a concrete, independent subtask when delegation
  materially improves speed or quality. Keep routine, trivial, or tightly
  coupled work in the main session.
- Conserve tokens when delegating: use as few agents as needed, provide only the
  relevant context, avoid duplicate work, and keep ownership clear.
- When model and reasoning controls are available, choose them in proportion to
  task complexity and risk. Use lighter models and effort for scoped lookups or
  checks; reserve stronger models and higher effort for complex or consequential
  work.
- Prefer small, reliable changes and existing conventions. Preserve unrelated
  work and review the focused diff before finishing.

Use CodeGraph when it materially improves structural or dependency discovery;
otherwise use normal file inspection. It must never block progress.

Use `lavish` when visual review is materially clearer than prose. Keep reviews
local unless the user explicitly asks to share one.

Run appropriate tests or focused checks. Do not claim completion without
reasonable verification.

## Workshop workflow

- `workshop/PLAN.md` is the persistent source of truth for the active MVP.
- `workshop` creates a small approved MVP plan.
- `build` completes, verifies, and locally commits exactly one unfinished plan
  step per fresh session.
- `guide` explains the environment and tells a beginner what to do next.
- `troubleshoot` diagnoses workshop, setup, tooling, and application problems.
- Verify work before marking it complete. Use Lavish when the plan requires it.
- Every Lavish operation goes through `workshop/scripts/lavish-review`
  (open/poll/reply/end); follow the `lavish` skill. The generated review
  artifact supplies in-memory Web Storage only when the Lavish sandbox denies
  real storage; verify refresh persistence separately on the application's
  normal origin.
- Only the explicitly invoked `build` skill may automatically create its local
  plan-step commit. Never automatically push.

Detailed procedures belong in the skills, not here.

## Safety and Git

- Work within this repository unless the task clearly requires otherwise.
- Never expose, print, commit, or invent secrets. Use environment variables and
  safe `env.example` template files; never commit a real `.env` or use a
  `.env.*` name for a readable template.
- Treat `.workshop-local/sessions/` as private conversation state. Never use it
  for project continuity or inspect/enumerate its contents except for targeted
  session-persistence troubleshooting; then check only mappings, permissions,
  and counts, not transcript content.
- Do not destroy or discard state, access external accounts/private networks, or
  make consequential external changes without the user's clear request.
- Never rewrite Git history, force-push, or automatically push.
- Do not commit unless the user asks, except for the one local commit required
  by an explicitly invoked `build` run.

## Completion

Briefly state what changed, how it was verified, how to run or view it, and the
one important next action, if any.
