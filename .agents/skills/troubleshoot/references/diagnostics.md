# Focused Diagnostic Routes

Read only the section matching the symptom. Prefer available project commands
and current repository conventions. Keep command output internal except for the
few lines that explain the cause.

## Contents

- Codespaces
- Devcontainer
- Docker
- Claude Code
- Codex
- Skills and subagents
- Workshop plan
- Git and GitHub
- Application and dependencies
- Time MCP
- Second Brain
- Ports and browser access
- CodeGraph
- Lavish
- Network and provider services
- Disk, memory, and processes

## Codespaces

- Confirm the repository root, workspace mount, Codespace state, storage, and
  resource pressure before suggesting a rebuild.
- For missing Claude or Codex CLI sessions after a rebuild, inspect the current
  user and `HOME`, prove the repository is on the persistent workspace mount,
  and run `.devcontainer/persist-agent-sessions.sh --check`. Check the expected
  symlinks and session-file counts without printing transcript contents. If the
  persistent targets still exist, rerun the helper without `--check` to safely
  merge local state and repair the mappings; never move auth files.
- Creation or provisioning failures outside the running Codespace require a
  GitHub UI action. Name the exact action, such as opening the repository's
  **Code > Codespaces** menu, viewing creation logs, stopping/starting the
  Codespace, or rebuilding its container.
- Before recreation, ensure work is committed and pushed to a branch the
  attendee controls. Never imply unpushed work will survive deletion.

## Devcontainer

- Inspect `.devcontainer/devcontainer.json`, referenced Dockerfiles, features,
  mounts, `remoteUser`, environment settings, and post-create scripts.
- Locate the first meaningful build or post-create error. Check JSON/JSONC and
  shell syntax, command availability, permissions, and PATH.
- Explain when a configuration edit needs **Dev Containers: Rebuild Container**
  to take effect. Ask before triggering a rebuild.

## Docker

- Check client and daemon separately, then inspect only the relevant container,
  image, Compose service, port, mount, and recent logs.
- Preserve the existing Docker-in-Docker architecture. Do not replace it with
  host Docker or broad cleanup.
- Diagnose permission, daemon, build, Compose, bind-mount, port, storage, and
  container-exit faults before restarting or rebuilding the affected item.

## Claude Code

- Check the installed CLI and extension, PATH, authentication state,
  `.claude/settings.json`, project trust, `/doctor`, and the relevant discovery
  menu (`/skills`, `/agents`, `/memory`, or `/mcp`).
- Project skills belong at `.claude/skills/<name>/SKILL.md`. A newly created
  top-level skills directory can require a new Claude session; ordinary edits
  are watched live.
- Treat missing commands/settings as configuration. Treat sign-in, plan usage,
  subscription, rate limits, and provider outages as account/service issues;
  never attempt a bypass.

## Codex

- Check the installed CLI and extension, PATH, authentication, `codex doctor`,
  strict config health, sandbox/approval settings, and `/skills` in a fresh
  session.
- Project skills belong at `.agents/skills/<name>/SKILL.md`. Codex usually
  detects changes automatically; restart when a skill still does not appear.
- Distinguish configuration and discovery faults from authentication, usage,
  rate-limit, or provider-service restrictions.

## Skills and subagents

- Verify exact paths, directory names, readable `SKILL.md` files, YAML
  frontmatter, symlink targets, and provider-specific agent formats.
- Expected attendee skills are `workshop`, `build`, `guide`, and
  `troubleshoot`; Lavish and `workshop-reviewer` are supporting capabilities.
- Check the provider's discovery command before rewriting configuration. A
  stale session is often fixed by starting a fresh session.

## Workshop plan

- Treat `workshop/PLAN.md` as persistent state. Determine whether it is absent,
  malformed, `TODO`, `IN PROGRESS`, `BLOCKED`, or fully `DONE`.
- Resume an interrupted `IN PROGRESS` step through `build`; do not discard sound
  work or expand scope. Compare plan completion notes with Git state and actual
  verification when they disagree.
- A missing plan normally means the attendee should invoke `workshop`, not that
  a replacement plan should be invented during troubleshooting.
- For a missing starter, verify the normalized path stays under
  `workshop/starters/` and that `README.md` and `BRIEF.md` exist. For malformed
  starter data, validate its JSON without modifying the reusable starter.

## Git and GitHub

- Begin with status, branch, HEAD, remotes, conflicts, identity, and focused
  diffs. Never print credential material.
- Preserve dirty work. Do not switch branches, change remotes, resolve ambiguous
  conflicts, or alter authentication without explaining and asking.
- Separate local commit failures from remote permission/authentication. An
  attendee often cannot push to the upstream public repository and may need a
  fork or a branch/repository they control.
- `build` may make its one local plan-step commit. Push is always manual.

## Application and dependencies

- Read the declared run scripts, lockfiles, safe `env.example` templates,
  focused build output, tests, and the smallest relevant log. Prefer the
  repository's chosen package manager. Do not bypass the read denial for
  `.env` or `.env.*`; a safe template should use `env.example` instead.
- Check whether the process started, exited, or is listening elsewhere before
  reinstalling. Fix the cause of syntax, dependency, build, API, frontend/backend,
  or missing-variable failures.
- Never delete dependency folders or lockfiles as the opening move. Never ask
  for a secret in chat; explain the safe environment-variable or Codespaces
  secret action.
- Browser `localStorage` belongs to one origin (scheme, host, and port). Check
  the current forwarded URL before concluding saved data was lost.

## Time MCP

- Time MCP is an optional agent-side verification aid, not an application
  dependency. Check `codex mcp list` or `claude mcp list` and the pinned `uvx`
  command only when that demonstration fails.
- If a small targeted repair does not restore it, say: “Time MCP is optional.
  Continue the build using normal verification.” Never block the MVP on it.

## Second Brain

- Use `workshop/PLAN.md` to find the recorded project root, Memory path,
  upstream URL/commit, and optional connector choice. Keep local memory usable
  even when upstream or an external service is unavailable.
- For a missing upstream clone, verify `.workshop-local/upstream/` is ignored,
  then clone or fetch the recorded repository and check out the exact recorded
  commit. Never stage the nested repository and never copy its `.claude`
  configuration into the workshop root.
- For missing memory, verify `second-brain/Memory/` and the plan's expected
  Markdown files. Restore only attendee-owned files from Git or the workshop's
  original sample data; do not substitute upstream templates.
- For a missing `brain` skill, check both project skill locations and provider
  discovery in a fresh session. For empty answers, inspect the targeted search
  terms and relevant Markdown before broadening retrieval.
- For a missing, unauthenticated, or disconnected Gmail/Calendar connector,
  check only user-scoped MCP state and the provider's current auth status. Never
  print its URL or credentials. State that live data is optional and give one
  next connection or reauthentication step; local memory remains functional.

## Ports and browser access

- Determine the actual listening port and interface, whether the process is
  alive, and whether Codespaces forwarded that port.
- Distinguish container `localhost` from the attendee's browser URL. In a
  Codespace, an app generally needs to listen on `0.0.0.0` and be opened from
  the VS Code **Ports** tab or forwarded URL.
- For collisions, identify the owning process before stopping anything. Do not
  kill unrelated processes.

## CodeGraph

- Check command discovery, installed integration, repository index, daemon, and
  index health only for code-structure or dependency-navigation problems.
- Refresh an obviously stale generated index when safe. Do not use CodeGraph to
  diagnose login, Docker, network, disk, or provider issues.
- CodeGraph is optional infrastructure: continue with normal file search and
  inspection when repairing it would distract from the original problem.

## Lavish

Every Lavish operation in this workshop goes through one command:
`workshop/scripts/lavish-review`. There is deliberately no global `lavish-axi`
binary; the pinned runtime lives in `workshop/vendor/lavish`. Use this
low-freedom recovery sequence; do not reconstruct proxy or artifact commands
manually:

1. Run `workshop/scripts/lavish-review status`. It is read-only and prints one
   `OK:`/`FAIL:` line per check (runtime, patch, port 4387 state, forwarded
   host, active session). Every `FAIL` line names its repair.
2. If the runtime or its workshop compatibility patch is missing or mismatched,
   run `workshop/scripts/lavish-review install`. It restores the pinned release
   with an integrity-locked `npm ci` and re-applies the patch. Never install
   Lavish globally, never use `npx`, and never edit package files by hand.
3. Reopen the review: `workshop/scripts/lavish-review open <project-root>` for
   a Vite app, or `open <file>.html` for a static artifact. Pass `--reopen`
   only when the attendee asked to resume a review they ended.
4. Continue the loop with `workshop/scripts/lavish-review poll`, `reply`, and
   `end`. Never hand-edit or commit generated `.lavish/` files.
5. For a deeper end-to-end proof (live server, real proxy headers, feedback
   delivery), run `workshop/scripts/lavish-verify live`.

Interpret symptoms with this map:

- **`forbidden host`, an HTTP link, or a URL ending in external `:4387`:** the
  server was started outside the canonical command. Run `status`; the next
  `open` replaces a confirmed stale Lavish server with correctly configured
  env. Internally Lavish listens on `127.0.0.1:4387`; the attendee URL must be
  `https://<codespace>-4387.<forwarding-domain>/session/<id>` with no trailing
  port. Never bind `0.0.0.0` and never set `LAVISH_AXI_ALLOWED_HOSTS=*`.
- **The browser shows `cross-origin prompt submission rejected` or
  `cross-origin session end rejected`:** the running server is missing the
  workshop compatibility patch (GitHub's proxy rewrites the browser's Origin
  header, which stock Lavish rejects). Run `status`, then `install` if needed;
  the next `open` replaces the unpatched server. Queued browser comments are
  retained; the attendee can resend after the reopen.
- **Port 4387 is occupied:** `status` distinguishes a stale Lavish (replaced on
  the next `open`) from an unknown program (never killed automatically — stop
  that program or set `LAVISH_AXI_PORT`). Keep application servers, normally
  Vite on 5173, on their own ports.
- **`open` printed a URL but the browser cannot connect (often Codex):** the
  review server started inside a sandbox's private network namespace. Stop it
  (`workshop/scripts/lavish-review stop`), then rerun the `lavish-review`
  command with escalated permissions so the server runs on the host network.
- **Refused connection, Codespaces trust page, or nested login page:** the
  artifact embedded localhost or a forwarded URL. The builders reject iframes
  and served URLs; regenerate through `open` and fix the source it names.
- **Blank artifact:** regenerate through `open` rather than editing the
  artifact. The builder rejects unresolved module imports, places the classic
  bundle after the mount node, inlines assets, protects minified
  `String.replace` tokens, and installs an in-memory Web Storage fallback for
  the sandbox. If still blank, inspect `artifact_failures` in the poll output
  and `.lavish/last-poll.txt`.
- **Content appears without styling or fonts/images are missing:** an external
  stylesheet or CSS asset escaped inlining. Regenerate through `open`; do not
  copy ad hoc CSS into `.lavish/`.
- **Visible controls fail or clicks do nothing:** inspect `artifact_failures`,
  fix the application source, and regenerate. Exercise add/edit/delete
  visually in Lavish, but verify refresh persistence on the real application
  origin because the in-memory sandbox fallback cannot prove persistence.
- **The attendee pressed Send and nothing seems to happen:** feedback queues
  server-side and is never lost. Make sure a `workshop/scripts/lavish-review
  poll` loop is actually running in the active main session and poll again.
  Since the patch, the review page itself shows the exact server error when a
  submission truly fails.
- **A poll "hangs":** it does not — polls are bounded (about 90 seconds) and
  return `Status: waiting` when there is no feedback yet. That is the normal
  quiet state; poll again.

`workshop/scripts/lavish-verify live` is the clean-environment smoke test: it
proves the pinned runtime, patch, live server, proxy-shaped origin handling,
feedback delivery, and Send & End against real HTTP. The attendee's browser
remains the final proof that the private Codespaces port is authenticated and
visually reachable. Never use `share` or make port 4387 public as a repair.

## Network and provider services

- Use a small connectivity check appropriate to the failing endpoint. Separate
  DNS, package registry, GitHub, Anthropic, OpenAI, and general network faults.
- Check official service status when an outage is plausible. Do not keep
  retrying a rate limit, account restriction, or external outage.

## Disk, memory, and processes

- Inspect available disk/inodes, memory pressure, and the specific process tree
  before changing anything.
- Identify large paths without printing secrets or scanning unrelated private
  data. Prefer targeted cleanup and ask before deleting caches or state.
- Confirm a duplicate or runaway process belongs to this workshop before
  stopping it. Re-check resources and the failed behavior afterward.
