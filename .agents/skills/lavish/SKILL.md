---
name: lavish
description: Turn complex or visual agent responses into rich, reviewable HTML artifacts the user can annotate and send feedback on, using the lavish-axi CLI. Use when about to give a plan, comparison, diagram, table, code diff, report, or anything easier to grasp visually than as prose.
license: MIT
metadata:
  author: Kun Chen (kunchenguid)
  upstream: kunchenguid/lavish-axi, pinned in workshop/vendor/lavish/package.json
  argument-hint: <what the artifact should show>
  hermes-tags: html, review, artifacts, visualization
  hermes-category: productivity
---

# Lavish Editor

Lavish turns rich HTML artifacts into collaborative human review surfaces: the attendee opens a page in their browser, clicks or highlights what they want changed, types feedback, and sends it back to you. Use it whenever a response is easier to understand as a page than as prose, and whenever a workshop plan step requires a visual review.

In this workshop, **every Lavish operation goes through one command: `workshop/scripts/lavish-review`**. There is no separate `lavish-axi` binary. The command owns the pinned runtime, Codespaces host configuration, artifact preparation, the review URL, polling, and cleanup. Follow its printed output — each result ends with exactly one next action. Never use `npx`, install another Lavish copy, or hand-construct review commands.

If your provider sandbox isolates networking per command (Codex `workspace-write` does), run every `workshop/scripts/lavish-review` command with escalated permissions — otherwise the review server starts inside the sandbox's private network namespace and the attendee's browser can never reach it. Request escalation for these commands only; keep everything else sandboxed.

If the attendee invoked this skill with a request (text after the command), build an HTML artifact for that request now. If not, infer what to visualize from the conversation.

## What can be reviewed

- **A Vite web application** — `workshop/scripts/lavish-review open <project-root>`. This builds the app, produces a self-contained sandbox-safe review artifact (CSS, JavaScript, and local assets inlined; an in-memory Web Storage fallback added for the review sandbox only), and opens the review. Never hand-edit or commit the generated artifact.
- **A static HTML page you author** (a plan, diagram, comparison, report, or the Second Brain map) — write it to `.lavish/<name>.html`, reference any sibling assets with relative paths (never a leading `/`), then `workshop/scripts/lavish-review open .lavish/<name>.html`. The file is validated and served in place, so later edits to it live-reload in the open review.
- **CLI or backend-only work** — normally has no Lavish step; deliver results in conversation instead.

Hard rules for every artifact: it must be self-contained — never an `<iframe>`, never a `localhost`/`127.0.0.1` URL, never a Codespaces-forwarded application URL (those render as trust pages, blank screens, or dead click surfaces inside the review sandbox, and the tooling rejects them). Static artifacts must not rely on `localStorage`/`sessionStorage`; the sandbox denies browser storage.

## Workflow

1. Prepare the artifact (build the app, or author the HTML page).
2. `workshop/scripts/lavish-review open <target>` — fix any `self_paint_warning` it reports (give the page an explicit background and readable text), then give the attendee the printed `Review URL` exactly as shown and ask them to open it in a browser tab. A valid Codespaces review URL starts with `https://`, contains `-4387.`, and has no `:4387` suffix.
3. `workshop/scripts/lavish-review poll` — waits up to 90 seconds in the foreground and prints `Status: feedback`, `Status: waiting`, or `Status: ended`.
   - `waiting` → run `poll` again and keep waiting. Stay in this loop while the attendee reviews; never background the wait with `nohup`, `&`, `disown`, or a detached terminal, and never tell the attendee you are watching for feedback unless a poll loop is actually running.
   - `feedback` → apply the prompts to the **real project source** (not the generated artifact). A `layout-warnings` prompt is an explicit repair request: apply every listed fix in one pass. A `whiteboard` prompt carries an edit summary plus scene/preview file paths: read the summary, then apply the edits by updating the Mermaid source in the artifact. Then run `workshop/scripts/lavish-review reply "<what you changed>"` — this rebuilds a Vite artifact automatically so the attendee sees the change, posts your reply into the review, and keeps polling.
   - `ended` → the attendee finished (their final feedback, if any, was delivered in the same result). Apply anything outstanding, continue the build step, and do not reopen the review uninvited.
4. When you are the one finishing the review, run `workshop/scripts/lavish-review end`.
5. If a command fails, the page is blank, styling is missing, or clicks do nothing: stop improvising and run `workshop/scripts/lavish-review status`, then Claude `/troubleshoot Lavish review is broken` or Codex `$troubleshoot Lavish review is broken`.

Only reopen a review the attendee ended (`open <target> --reopen`) when they ask for another look or something genuinely needs their visual attention.

Storage note for application reviews: the review artifact substitutes in-memory storage only when the sandbox denies the real APIs, so add/edit/delete flows work in the review — but this cannot prove persistence. Verify refresh persistence separately on the application's normal origin (its own dev-server URL), never inside Lavish.

## Visual guidance

- Use visual hierarchy to make the most important decisions, risks, tradeoffs, and next actions obvious at a glance
- Use visual structure such as sections, cards, tables, diagrams, annotated snippets, and side-by-side comparisons instead of long prose
- Choose typography, spacing, color, and layout deliberately so the artifact has a clear point of view
- Prevent horizontal overflow at every nesting level: nested grid/flex children also need minmax(0, 1fr) tracks and min-width: 0, especially when badges, labels, or status text use wide pixel or monospace fonts; wrap, truncate, or contain long unbreakable text deliberately
- When the artifact would describe existing or current UI or state, show it instead: capture screenshots of the real pages (run the app read-only if needed) and embed them, rather than explaining the current look in prose; reserve prose for what cannot be shown such as rationale, trade-offs, and open questions

## Playbooks and design

Run `workshop/scripts/lavish-review playbook <id>` for focused guidance before authoring an artifact. One artifact often combines several playbooks (a plan with a comparison and a diagram), so open each matching playbook before writing HTML.

- `diagram` — map relationships, flows, state, and architecture (use the theme-aware Mermaid snippet from `workshop/scripts/lavish-review design`; rendered Mermaid diagrams in `.mermaid` containers become editable Excalidraw whiteboards in the browser)
- `table` — turn dense records into scan-friendly review surfaces
- `comparison` — show options, tradeoffs, and current vs target behavior
- `plan` — explain a product or technical plan before implementation
- `code` — render source code, patches, PR diffs, and before/after code
- `input` — collect attendee decisions, choices, or triage from within the artifact
- `slides` — create a deliberate presentation when slides are requested

Lavish injects no design system; artifacts render identically when opened directly. Decide the design direction in strict priority order: (1) a look or design system the user asked for; (2) the subject project's own design system (inspect its Tailwind/theme config, CSS variables, component library, or existing pages — especially when the artifact previews that app's UI); (3) only when both yield nothing, the Tailwind CSS browser v4 + DaisyUI v5 CDN snippet from `workshop/scripts/lavish-review design`. State which source you used.

## Exporting and sharing

- `workshop/scripts/lavish-review export <file.html> [--out <path>]` writes a portable single-file copy with local assets inlined.
- `workshop/scripts/lavish-review share <file.html> [--password <pw>]` publishes to ht-ml.app, a third-party host, **public by default**. Reviews stay local; run this only when the user explicitly asks to publish, and prefer `--password`.
