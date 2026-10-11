---
name: build
description: Continue a workshop MVP from workshop/PLAN.md by safely completing, verifying, documenting, and locally committing exactly one unfinished plan step. Use for each fresh build session. Never push and never work ahead.
disable-model-invocation: true
---

# Build One Workshop Step

Complete exactly one plan step, save it in one local commit, then stop. The
repository is the memory; never rely on earlier chat history.

## 1. Find the plan first

Look for `workshop/PLAN.md` before doing anything else.

If it does not exist, stop and say:

“No workshop plan exists yet.

Claude: run `/workshop`
Codex: run `$workshop`”

If it exists, read it first. Then inspect only enough of `AGENTS.md`,
`CLAUDE.md` when present, the repository, and Git state to understand completed
work and the first incomplete step. Use CodeGraph if installed and useful; do
not require it.

## 2. Protect existing work

Run `git status --short` before editing and retain that baseline. Also record
the initial staged paths and inspect their staged diff. Treat them as attendee
baseline unless either the current step has a `Commit pending:` note that
explicitly names matching staged paths, or the recovery check in section 3
proves that matching staged paths belong to a prior step whose finalization was
interrupted before a note could be written. Only those verified paths remain
step-owned work. Never reset, clean, overwrite, unstage, or discard attendee
work.

If unrelated uncommitted changes exist, work around them and later stage only
explicit files from this step. If this step must touch a file that already has
unrelated changes, or a clean isolated commit cannot be made safely, ask the
attendee rather than guessing.

Never run `git reset --hard`, `git clean -fd`, any force push, or `git push`.

## 3. Select exactly one step

Before advancing to a later unfinished step, inspect whether any preceding
`DONE` step exists only in uncommitted or staged work, and verify that the most
recent preceding step and its relevant implementation changes are present in a
local commit. Use the plan history, relevant status/diffs, and completion
notes. If any prior step is not durable, treat the earliest such step as
interrupted finalization: change it back to `IN PROGRESS`, preserve its work,
and select it instead. This recovery check takes priority over every later
`TODO`, `IN PROGRESS`, or `BLOCKED` step.

Find the first Build Plan step whose status is not `DONE`.

- `TODO`: change only that step to `IN PROGRESS`, then implement it.
- `IN PROGRESS`: assume a prior session was interrupted. Inspect the plan, Git
  status and diff, relevant files, and verification evidence. Resume this same
  step without discarding or repeating sound work.
- `BLOCKED`: inspect whether the recorded blocker is now resolved. If it is,
  change the step to `IN PROGRESS` and resume it. Otherwise leave it blocked,
  explain exactly what is needed, and stop.

Never skip an incomplete step, combine steps, or implement a later feature.

If every step is `DONE`, inspect Git status, relevant diffs, the plan's
completion notes, and the recent commit that contains `workshop/PLAN.md` before
calling the plan complete. The terminal state is valid only when no
uncommitted completion work remains and the recorded final checks and required
review are present. If the latest `DONE` step has uncommitted work, a missing
commit, or a missing required final review, treat that step as interrupted
finalization: change only it back to `IN PROGRESS`, preserve its work and
notes, and resume it through the remaining verification, review, and commit.
Never claim work is locally committed without Git evidence.

When the all-`DONE` state is valid, make no code or plan changes. State that
the MVP is complete, how to run it, what was built, that work is locally
committed, and that pushing is manual.

## 4. Implement the smallest solution

Read the selected step's Goal, Acceptance criteria, Verification, Visual
review, Notes, and prior completion notes. Implement only the smallest coherent
change that satisfies them. Preserve recorded decisions and avoid speculative
dependencies or architecture.

Ask the attendee only when important information is missing or a significant
choice would contradict the plan.

If an environment or tooling fault blocks the step and cannot be resolved with
one small safe fix, do not turn the build into a broad diagnostic session. Leave
the work intact and tell the attendee to run Claude
`/troubleshoot <short description>` or Codex
`$troubleshoot <short description>`.

## 5. Verify before completion

Run checks relevant to this step, such as focused tests, lint, type checking,
build, starting the app, checking an endpoint, or exercising the changed user
journey. Fix failures belonging to this step. Do not mark it `DONE` merely
because code was written, and do not run unrelated enormous suites.

After implementation and verification, inspect the relevant diff yourself.

## 6. Complete required visual review

If the step says `Visual review: REQUIRED`, or visual feedback is clearly
necessary, invoke the existing `lavish` skill and follow it fully. It drives one
canonical command — `workshop/scripts/lavish-review` — which prepares the
artifact, prints the attendee's review URL, and runs the feedback loop; follow
each printed next action. Apply reasonable feedback that belongs to this step to
the real project source, and let the review refresh before rechecking.

Do not mark the step complete until the attendee provides feedback or
explicitly confirms they are happy. Record requests for future features briefly
in the plan instead of expanding this step.

## 7. Review the final step result

After all required visual feedback has been applied and rechecked, delegate one
focused review to the `workshop-reviewer` subagent for every non-trivial step
and always for the final plan step. Wait for it. Give the reviewer the current
step, acceptance criteria, initial Git baseline, full changed-path list,
relevant final diff, verification evidence, and relevant files. Ask for
material findings only, address valid findings, and re-run affected checks. If
a reviewer-driven change affects the visible result, return to the Lavish
feedback step and obtain approval for the refreshed result. After any later
material change, re-run the focused reviewer. Skip delegation only for
genuinely tiny, non-final steps.

## 8. Update the handover

Only after acceptance criteria, verification, reviewer checks when applicable,
and required visual approval all pass:

- change this step's status from `IN PROGRESS` to `DONE`;
- add a short `Completed:` list naming what changed, how it was verified, the
  reviewer outcome when one was required, and any important decision or visual
  review;
- update `How to run it` if this step established or changed those commands.

Keep the plan concise. Never paste raw logs into it.

If genuinely blocked, set the current step to `BLOCKED`, add one short reason,
tell the attendee what is needed, and stop. Never mark blocked work `DONE`.

## 9. Commit locally and stop

After a successful plan update, inspect `git status --short` and focused diffs.
Stage only explicit implementation paths for this step, closely related
necessary paths, and `workshop/PLAN.md`. Never use `git add .`, and never
unstage or otherwise alter unrelated paths that were already staged in the
initial baseline. A path explicitly recorded and verified as this step's
`Commit pending:` work may be updated and restaged; it is not unrelated
attendee staging. Inspect the staged diff and confirm every newly staged change
belongs to this step.

If unrelated paths were already staged, preserve their staged patch exactly
and use a path-limited commit such as `git commit --only -- <explicit step
paths>` so they are excluded from this commit. Verify afterward that their
staged patch is unchanged. If the commit cannot be isolated confidently, leave
the current step `IN PROGRESS`, explain the conflict, and ask the attendee
instead of modifying their index.

Create one local commit with a simple message such as
`workshop: complete W02 task creation`. Do not create an empty commit. If Git
cannot commit, leave every implementation change intact, change this step back
to `IN PROGRESS`, and add a concise `Commit pending:` note with the exact
failure and explicit step-owned staged paths. Stage only the updated
`workshop/PLAN.md` again so the staged plan does not falsely say `DONE`.
Preserve every unrelated initial staged path, explain the problem, and ask the
attendee for the one action needed. Never push.

After committing, get the short commit hash and stop. Do not begin the next
step or offer to continue it. End with this compact format:

“✓ W02 complete
✓ Verified
✓ Saved in Git commit abc1234
✓ Nothing was pushed

Next: start a NEW AI session and run:

Claude: `/build`
Codex: `$build`”
