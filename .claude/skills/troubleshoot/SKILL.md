---
name: troubleshoot
description: Diagnose and safely resolve workshop, setup, tooling, Git, port, provider, Lavish review, and application problems from a plain-English description. Use when something is broken, missing, unavailable, confusing, or not behaving as expected, including Lavish forbidden-host errors, invalid Codespaces URLs, blank or unstyled artifacts, failed feedback polling, and port 4387 conflicts. Inspect objective evidence, apply only low-risk fixes automatically, preserve user work, verify the result, and give one clear next action. Do not use for normal MVP feature implementation; use build instead.
argument-hint: "<describe what happened>"
---

# Troubleshoot the Workshop

Diagnose the problem underneath the attendee's plain-English description. Do
not make them choose or understand diagnostic commands.

Problem description: $ARGUMENTS

If the description is empty, inspect obvious workshop health signals first,
then ask one simple question about what the attendee saw.

## Method

Follow this order:

1. **Understand:** Restate the symptom briefly. Distinguish an environment or
   setup fault from an unfinished MVP feature.
2. **Observe:** Inspect objective evidence before guessing. Start with narrow,
   read-only checks and retain `git status --short` as a baseline. Read only the
   relevant section of [`references/diagnostics.md`](references/diagnostics.md).
3. **Diagnose:** Identify the most likely cause and the evidence supporting it.
   Distinguish local configuration from account, subscription, rate-limit,
   outage, or external provisioning problems.
4. **Fix safely:** Apply the smallest low-risk, reversible fix within the
   attendee's request. Explain and ask before a consequential action.
5. **Verify:** Re-run a focused check or exercise the failed behavior. Never
   claim success from an edit alone.
6. **Tell the attendee:** Give the cause, what changed, and one exact next
   action. Do not dump logs.

For any Lavish symptom, follow the deterministic route in the `Lavish` section
of `references/diagnostics.md`. Run the tracked checks and review script from
there instead of reconstructing proxy, port, iframe, or asset commands from
memory.

Do not repeat the same failed operation. Escalate progressively: smallest fix,
local restart/retry, targeted reinstall/rebuild, Codespace rebuild, and only
then Codespace recreation. Protect attendee work before high-level recovery.

Keep routine troubleshooting in the current session. Do not delegate a narrow
diagnosis such as a missing plan, command, file, or port. For a genuinely broad
problem, use at most one read-only subagent only when it clearly shortens the
investigation, and continue directly if delegation is unavailable.

## Safe action boundary

You may perform an obvious low-risk fix such as restarting the correct local
development server, installing a clearly missing declared project dependency,
refreshing a generated cache or CodeGraph index, or correcting a small
non-destructive local configuration error.

Explain and ask first before deleting files or state, rebuilding/resetting an
environment, replacing configuration, changing authentication or remotes,
switching branches with dirty work, removing containers or volumes with
meaningful state, or performing Docker cleanup.

Never:

- expose, print, invent, or request credentials, tokens, API keys, or secrets;
- run `git reset --hard`, `git clean -fd`, force-push, discard work, or alter
  Git history;
- kill unrelated processes, delete lockfiles, reinstall everything, or rebuild
  the container as a first guess;
- bypass provider limits, pretend an external failure can be repaired locally,
  or configure Lavish public sharing;
- automatically commit or push.

If tracked files change, preserve unrelated work and show the focused diff. The
`build` skill remains the only workflow that automatically commits a completed
plan step. If the “problem” is unfinished planned functionality, direct the
attendee back to Claude `/build` or Codex `$build`.

## Response format

Use this compact shape unless a different one is clearer:

**Problem:** One sentence.

**Found:** One or two sentences with the relevant evidence.

**Fix:** What you safely changed, or the one manual action required.

**Next:** One exact action.

Show only relevant error lines. If you cannot fix the issue from here, name the
boundary plainly and give the smallest exact UI or account action.
