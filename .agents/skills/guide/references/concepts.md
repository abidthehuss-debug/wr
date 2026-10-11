# Workshop Concepts

Use only the entry the attendee asked about. Keep the final explanation to one
to three short sentences and adapt it to their situation.

- **GitHub:** A website that stores and shares coding projects. It is also where
  this workshop repository and optional online backup can live.
- **Repository:** The project folder plus its saved history. Think of it as the
  complete binder for one project.
- **Git:** The tool that records checkpoints of file changes on your computer.
- **Commit:** A named local checkpoint in Git. It saves a coherent set of
  changes in the project's history.
- **Push:** Sending local Git commits to a remote service such as GitHub. In
  this workshop, pushing is always a human choice.
- **Branch:** A separate line of Git work, like making a copy of a draft so you
  can change it without disturbing another version.
- **Codespace:** A development computer hosted by GitHub and opened through the
  browser or VS Code. It gives the workshop a prepared environment without
  requiring local setup.
- **Container:** A pre-prepared development computer in a box. Everyone gets
  essentially the same tools and setup.
- **Sandbox:** A safety boundary that limits what an AI or command can access or
  change.
- **VS Code:** The editor window used to view files, run commands, and work with
  Claude Code or Codex.
- **VS Code extension:** An add-on that gives VS Code a new feature, such as the
  Claude Code or Codex side panel.
- **Terminal:** A text window for asking the computer to run commands.
- **CLI:** A command-line interface: a program used by typing into a terminal
  instead of clicking buttons.
- **Claude Code:** Anthropic's AI coding assistant. In this repository its
  workshop skills are invoked with slash commands such as `/build`.
- **Codex:** OpenAI's AI coding assistant. In this repository its workshop
  skills are mentioned with `$`, such as `$build`.
- **AGENTS.md:** The short shared rulebook Codex reads for this repository.
  Claude receives the same rules through `CLAUDE.md`.
- **CLAUDE.md:** Claude Code's project instruction file. Here it imports the
  shared rules from `AGENTS.md` instead of copying them.
- **Settings or config:** Files that control tool behavior, permissions, and
  integrations. They are machine instructions, not workshop lessons.
- **Skill:** A reusable set of focused AI instructions, like a recipe for one
  job. Workshop skills cover planning, building, guidance, and troubleshooting.
- **Subagent:** A specialist AI helper given one bounded task, such as reviewing
  a completed build step.
- **Workshop skill:** The planning workflow. It turns an idea into the small,
  persistent MVP plan that later sessions follow.
- **Build skill:** The implementation workflow. Each fresh run completes,
  verifies, and locally commits exactly one unfinished plan step.
- **CodeGraph:** An optional map of code structure and relationships that can
  help an AI navigate a growing project. The workshop can continue with normal
  file inspection if it is unavailable.
- **Lavish:** A local visual review page. When a visual review is ready, the
  agent shares a link; the attendee opens it in a browser tab, clicks or
  highlights what they want changed, types feedback, and sends it back — the
  agent receives it and applies the changes. "Send & End" finishes the review.
  Nothing is shared publicly unless the attendee explicitly asks.
- **Docker:** A tool for running applications and services in containers so
  their setup is repeatable.
- **Port:** A numbered doorway through which a running app can be reached. In a
  Codespace, the port may also need to be forwarded to the browser.
- **Devcontainer:** The recipe that tells Codespaces or VS Code how to prepare
  this project's development container, tools, extensions, and startup setup.
