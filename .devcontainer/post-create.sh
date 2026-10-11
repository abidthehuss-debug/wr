#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

echo "Running workshop devcontainer post-create setup..."

# Both official CLI installers use this user-local directory. Export it before
# either install so first-run verification works in this same non-login shell.
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"

# Do not create a physical .env file. Projects can document safe defaults in
# env.example and receive real secrets through Codespaces secrets.
echo "Environment secrets: use Codespaces secrets or process environment variables."

echo "Configuring rebuild-persistent agent CLI sessions..."
bash .devcontainer/persist-agent-sessions.sh

echo "Installing Codex CLI..."

if command -v codex >/dev/null 2>&1; then
  echo "Codex CLI already installed: $(codex --version || true)"
else
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates

  curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh

  echo "Codex CLI installed."
fi

echo "Verifying Codex CLI..."

if command -v codex >/dev/null 2>&1; then
  codex --version || true
else
  echo "Codex was installed but is not currently on PATH."
  echo "Try opening a new terminal in the devcontainer, then run: codex --version"
fi

echo "Installing Claude Code CLI..."

if command -v claude >/dev/null 2>&1; then
  echo "Claude Code CLI already installed: $(claude --version || true)"
else
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates

  curl -fsSL https://claude.ai/install.sh | bash

  echo "Claude Code CLI installed."
fi

echo "Verifying Claude Code CLI..."

if command -v claude >/dev/null 2>&1; then
  claude --version || true
else
  echo "Claude Code CLI was installed but is not currently on PATH."
  echo "Try opening a new terminal in the devcontainer, then run: claude --version"
fi

echo "Configuring Lavish visual review..."

# One canonical Lavish integration. The pinned runtime lives inside the
# repository (workshop/vendor/lavish, integrity-locked) and every operation
# goes through workshop/scripts/lavish-review; that command also owns the only
# server lifecycle policy (start on open, replace only a proven-stale Lavish,
# idle self-stop). A global lavish-axi binary would invite bypassing the
# canonical command, so any leftover global copy is removed.
if command -v npm >/dev/null 2>&1 && npm ls --global lavish-axi >/dev/null 2>&1; then
  echo "Removing the obsolete global lavish-axi copy..."
  npm rm --global lavish-axi \
    || echo "WARNING: the obsolete global lavish-axi copy could not be removed." >&2
fi

lavish_ready=false
if bash workshop/scripts/lavish-review install; then
  lavish_ready=true
else
  echo "WARNING: the pinned Lavish runtime could not be installed (network problem?)." >&2
  echo "         Non-visual workshop steps remain available; run troubleshoot before a required visual review." >&2
fi

echo "Checking the Lavish review workflow..."
if $lavish_ready && bash workshop/scripts/lavish-verify post-create; then
  echo "Lavish workflow checks passed."
else
  echo "WARNING: Lavish workflow checks failed; run troubleshoot before a required visual review." >&2
fi

echo "Configuring the optional Time MCP for Codex and Claude Code..."

# Time MCP is a small, credential-free teaching aid. Pin both the uv runner and
# server package so container rebuilds do not silently pick up mutable releases.
uv_version="0.12.3"
time_mcp_version="2026.7.10"
# The server currently imports the SDK's pre-1.24 exception spelling. Keep the
# known-compatible SDK pinned until the upstream package declares/fixes it.
time_mcp_sdk_version="1.23.0"

uv_ready=false
if command -v uv >/dev/null 2>&1 && [ "$(uv --version | awk '{print $2}')" = "$uv_version" ]; then
  echo "uv already installed: $(uv --version)"
  uv_ready=true
elif curl -LsSf "https://astral.sh/uv/$uv_version/install.sh" | sh; then
  uv_ready=true
else
  echo "WARNING: uv could not be installed; optional Time MCP setup was skipped." >&2
fi

# Warm the pinned package cache during setup. Normal workshop operation and the
# finished application do not depend on this optional MCP being healthy.
time_mcp_ready=false
if $uv_ready; then
  uvx_path="$(command -v uvx)"
  if "$uvx_path" --from "mcp-server-time==$time_mcp_version" \
    --with "mcp==$time_mcp_sdk_version" mcp-server-time --help >/dev/null; then
    echo "Time MCP $time_mcp_version is ready."
    time_mcp_ready=true
  else
    echo "WARNING: optional Time MCP could not be prepared; workshop and build remain available." >&2
  fi
fi

if $time_mcp_ready; then
  if codex mcp get time >/dev/null 2>&1; then
    echo "Codex Time MCP already configured."
  elif ! codex mcp add time -- "$uvx_path" --from "mcp-server-time==$time_mcp_version" \
    --with "mcp==$time_mcp_sdk_version" mcp-server-time; then
    echo "WARNING: optional Time MCP could not be registered with Codex." >&2
  fi

  if claude mcp get time >/dev/null 2>&1; then
    echo "Claude Code Time MCP already configured."
  elif ! claude mcp add --scope user time -- "$uvx_path" \
    --from "mcp-server-time==$time_mcp_version" \
    --with "mcp==$time_mcp_sdk_version" mcp-server-time; then
    echo "WARNING: optional Time MCP could not be registered with Claude Code." >&2
  fi
fi

echo "Configuring CodeGraph for Codex and Claude Code..."

codegraph_version="1.5.0"

configure_codegraph() {
  local codegraph_arch
  local codegraph_bundle_dir
  local codegraph_download_dir
  local codegraph_sha256
  local codegraph_target

  if command -v codegraph >/dev/null 2>&1 \
    && [ "$(codegraph --version 2>/dev/null)" = "$codegraph_version" ]; then
    echo "CodeGraph already installed: $(codegraph --version)"
  else
    codegraph_arch="$(uname -m)"
    case "$codegraph_arch" in
      x86_64|amd64)
        codegraph_target="linux-x64"
        codegraph_sha256="2ba65e87a1210b706bb1e67d5e48b5fc4a1935e43dbb3fb5f31c5597840d2e58"
        ;;
      arm64|aarch64)
        codegraph_target="linux-arm64"
        codegraph_sha256="9f17750aedf45d51f68caae39ed21d6e2a7290b2326e5c53f95a165918ebd1d8"
        ;;
      *)
        echo "WARNING: CodeGraph has no bundle for $codegraph_arch." >&2
        return 1
        ;;
    esac

    codegraph_bundle_dir="$HOME/.codegraph/versions/v$codegraph_version"
    if ! codegraph_download_dir="$(mktemp -d)"; then
      echo "WARNING: CodeGraph download directory could not be created." >&2
      return 1
    fi

    echo "Installing CodeGraph $codegraph_version..."
    if ! curl -fsSL \
      "https://github.com/colbymchenry/codegraph/releases/download/v$codegraph_version/codegraph-$codegraph_target.tar.gz" \
      -o "$codegraph_download_dir/codegraph.tar.gz"; then
      rm -f "$codegraph_download_dir/codegraph.tar.gz"
      rmdir "$codegraph_download_dir" 2>/dev/null || true
      return 1
    fi
    if ! echo "$codegraph_sha256  $codegraph_download_dir/codegraph.tar.gz" | sha256sum -c -; then
      rm -f "$codegraph_download_dir/codegraph.tar.gz"
      rmdir "$codegraph_download_dir" 2>/dev/null || true
      return 1
    fi
    if ! install -d "$codegraph_bundle_dir" "$HOME/.local/bin"; then
      rm -f "$codegraph_download_dir/codegraph.tar.gz"
      rmdir "$codegraph_download_dir" 2>/dev/null || true
      return 1
    fi
    if ! tar -xzf "$codegraph_download_dir/codegraph.tar.gz" \
      -C "$codegraph_bundle_dir" \
      --strip-components=1; then
      rm -f "$codegraph_download_dir/codegraph.tar.gz"
      rmdir "$codegraph_download_dir" 2>/dev/null || true
      return 1
    fi
    if ! ln -sfn "$codegraph_bundle_dir/bin/codegraph" "$HOME/.local/bin/codegraph"; then
      rm -f "$codegraph_download_dir/codegraph.tar.gz"
      rmdir "$codegraph_download_dir" 2>/dev/null || true
      return 1
    fi

    rm -f "$codegraph_download_dir/codegraph.tar.gz"
    rmdir "$codegraph_download_dir" 2>/dev/null || true
  fi

  if ! codegraph --version; then
    return 1
  fi

  # User-scoped configuration inside the disposable Codespace is shared by
  # each tool's CLI and official VS Code extension. Explicit targets avoid
  # touching any other agents that an attendee may install later.
  if ! codegraph install \
    --target=codex,claude \
    --location=global \
    --yes; then
    return 1
  fi

  echo "Building the repository CodeGraph index..."

  if [ -f "$repo_root/.codegraph/codegraph.db" ]; then
    if ! codegraph sync "$repo_root"; then
      return 1
    fi
  elif ! codegraph init "$repo_root"; then
    return 1
  fi

  codegraph status "$repo_root"
}

if configure_codegraph; then
  echo "CodeGraph is ready."
else
  echo "WARNING: optional CodeGraph setup failed; the core workshop remains available." >&2
fi

echo "Configuring GitHub CLI..."

# Codespaces normally provides a repository-scoped GitHub token. Never start an
# unattended browser login; report the smallest manual step when one is needed.
if ! command -v gh >/dev/null 2>&1; then
  echo "NOTE: gh is not on PATH — rebuild the container to pick up the github-cli devcontainer feature."
elif gh auth status >/dev/null 2>&1; then
  gh auth setup-git >/dev/null 2>&1 \
    || gh auth setup-git --hostname github.com --force >/dev/null 2>&1 \
    || echo "WARNING: 'gh auth setup-git' failed; run it manually if git asks for a password on push."
  echo "GitHub CLI authenticated; git credential helper configured."
else
  echo "NOTE: gh is installed but not authenticated (no Codespaces token, or it has expired)."
  echo "      Run once in this terminal: gh auth login --web   (then: gh auth setup-git)"
fi

echo "Checking bubblewrap user namespace support..."

if command -v bwrap >/dev/null 2>&1 && bwrap --ro-bind / / --proc /proc --dev /dev true >/dev/null 2>&1; then
  echo "bubblewrap user namespace check passed."
else
  echo "NOTE: bubblewrap cannot create the user namespace Codex's sandbox expects in this environment."
  echo "      This repo's .codex/config.toml supplies project-scoped safety defaults; Codex CLI"
  echo "      flags still override home/project configuration when explicitly provided."
  echo "      Keep the repository's workspace-write/on-request defaults; do not enable"
  echo "      danger-full-access in shared or workshop configuration."
fi

echo "Post-create setup complete."
