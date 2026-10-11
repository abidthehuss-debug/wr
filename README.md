# AI Workshop

This repository contains the ready-made development environment for the
beginner-friendly workshop. You do not need coding experience or the right
technical words.

1. Open this repository in GitHub Codespaces.
2. Wait for `Post-create setup complete.`
3. Sign in to Claude Code or Codex, then open its VS Code panel or run `claude`
   or `codex` in the terminal.

The core workshop is already configured. Choose one of three ways to start.

## 1. Build your own idea

```text
Claude: /workshop
Codex:  $workshop
```

Tell the AI what you want to build. You do not need coding experience or the
right technical words.

## 2. Community Events Board

Build a friendly web app for browsing, finding, and managing local events.

```text
Claude: /workshop workshop/starters/community-events
Codex:  $workshop workshop/starters/community-events
```

## 3. Second Brain Lite

Build a simple personal memory system that works across fresh AI sessions.

```text
Claude: /workshop workshop/starters/second-brain
Codex:  $workshop workshop/starters/second-brain
```

## What happens next?

The AI asks a few simple questions and creates `workshop/PLAN.md`.

Then start a **new AI session** and run:

```text
Claude: /build
Codex:  $build
```

The agent completes one part of the plan, verifies it, and saves the work in a
local Git commit. Start another fresh session and run build again. Repeat until
the MVP is complete.

## Need help?

```text
Claude: /guide
Codex:  $guide
```

The guide checks the current project state and gives you one clear next action.

## Something broken?

Describe the problem in ordinary language:

```text
Claude: /troubleshoot describe the problem
Codex:  $troubleshoot describe the problem
```

## Visual feedback

When visual feedback is useful, the agent opens a private Lavish review so you
can point at what you want changed. Nothing is shared publicly unless you
explicitly ask. In Codespaces, the workshop reviews a sandbox-safe application
build with its critical CSS, JavaScript, and local assets inlined instead of
nesting another forwarded development port, avoiding the trust-page,
blank-screen, and unstyled-page loops that browser iframes can cause. If the
review sandbox denies browser storage, the artifact automatically uses
in-memory storage for that review; real refresh persistence is checked on the
application's normal URL.

## Git

The build workflow creates local commits automatically. Nothing is pushed
automatically; you remain in control of pushing your work to GitHub. Before
deleting a Codespace, make sure important work is committed and pushed to a
branch or repository you control.

Where supported, AI conversations survive a rebuild of the same Codespace, but
recovery never depends on chat history: `workshop/PLAN.md`, repository files,
and Git commits carry the work. Deleting a Codespace also deletes its private
workspace storage and local transcripts.

Never put passwords, API keys, access tokens, or other secrets in project files
or chat prompts.

## Licence

This workshop repository is available under the [MIT License](LICENSE).
