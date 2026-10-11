#!/usr/bin/env bash
# L4: live provider end-to-end. Creates a disposable template-shaped copy of
# the repository with the community-events-at-w05 fixture overlaid, drives a
# REAL provider agent (Claude Code or Codex) headlessly through the W05 visual
# review step, plays the human attendee with a headless browser, and asserts
# the golden loop: review opens → app visible → annotation + feedback → agent
# poll wakes → agent edits REAL source → artifact refreshes → empty Send & End
# ends → step completes with a local commit.
#
# Usage: run-provider-e2e.sh <claude|codex> [--runs N] [--fixture NAME] [--keep]
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
evidence_dir="$repo_root/.workshop-local/verification"
logs_dir="$evidence_dir/logs"

provider="${1:-}"
shift || true
runs=1
fixture="community-events-at-w05"
keep_on_success=false
while [ $# -gt 0 ]; do
  case "$1" in
    --runs)
      shift
      runs="${1:-1}"
      ;;
    --fixture)
      shift
      fixture="${1:-$fixture}"
      ;;
    --keep) keep_on_success=true ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
  shift || true
done
case "$provider" in claude | codex) ;; *)
  echo "Usage: run-provider-e2e.sh <claude|codex> [--runs N] [--fixture NAME] [--keep]" >&2
  exit 2
  ;;
esac
command -v "$provider" >/dev/null 2>&1 || { echo "FAIL: $provider CLI is not installed." >&2; exit 1; }

# Fixture contract: KIND (vite|static), MARKER_TEXT (change the human requests),
# WATCH_PATH (file or dir the agent's edit must land in), HAS_APP, FINAL_STEP.
# shellcheck disable=SC1090
source "$script_dir/fixtures/$fixture/fixture.env"

record() { # record <iteration> <result> <duration>
  mkdir -p "$evidence_dir"
  printf '{"ts":"%s","layer":"e2e-%s","fixture":"%s","iteration":%s,"result":"%s","duration_s":%s}\n' \
    "$(date -u +%FT%TZ)" "$provider" "$fixture" "$1" "$2" "$3" >>"$evidence_dir/runs.jsonl"
}

make_copy() { # make_copy <dir> — template-shaped copy of the CURRENT tree
  local copy="$1"
  mkdir -p "$copy"
  (cd "$repo_root" && git ls-files --cached --others --exclude-standard -z \
    | tar --null -cf - -T -) | tar -xf - -C "$copy"
  # Overlay the fixture: the plan, app files at the repository root when the
  # fixture has an app, and any other fixture content at its own paths.
  cp "$script_dir/fixtures/$fixture/PLAN.md" "$copy/workshop/PLAN.md"
  if [ -d "$script_dir/fixtures/$fixture/app" ]; then
    cp -r "$script_dir/fixtures/$fixture/app/." "$copy/"
  fi
  local entry
  for entry in "$script_dir/fixtures/$fixture"/*; do
    case "$(basename "$entry")" in
      PLAN.md | fixture.env | app) continue ;;
    esac
    cp -r "$entry" "$copy/"
  done
  (
    cd "$copy"
    git init -q
    git add -A
    git -c user.email=workshop@example.invalid -c user.name='Workshop Harness' commit -qm 'Template state at W05' >/dev/null
  )
}

wait_for_file() { # wait_for_file <path> <timeout_s>
  local deadline=$(( $(date +%s) + $2 ))
  while [ ! -f "$1" ]; do
    [ "$(date +%s)" -lt "$deadline" ] || return 1
    sleep 3
  done
}

run_once() { # run_once <iteration> -> 0 pass / 1 fail
  local iteration="$1" started status=0
  local run_dir copy provider_log provider_pid preview_port preview_pid=""
  started="$(date +%s)"
  run_dir="/tmp/lavish-e2e/${provider}-$(date +%s)-$iteration"
  copy="$run_dir/repo"
  mkdir -p "$logs_dir" "$run_dir"
  provider_log="$logs_dir/e2e-${provider}-$(date -u +%Y%m%dT%H%M%SZ)-$iteration.log"

  echo "=== e2e/$provider iteration $iteration: copy at $copy ==="
  # Port 4387 must be free and stay owned by this run.
  if curl -sS -m 2 http://127.0.0.1:4387/health >/dev/null 2>&1; then
    bash "$repo_root/workshop/scripts/lavish-review" stop >/dev/null 2>&1 || true
    sleep 1
    if curl -sS -m 2 http://127.0.0.1:4387/health >/dev/null 2>&1; then
      echo "FAIL: port 4387 is busy and could not be freed." >&2
      return 1
    fi
  fi

  make_copy "$copy"
  echo "Preparing the copy (lavish runtime)..."
  (cd "$copy" && bash workshop/scripts/lavish-review install >/dev/null)

  if [ "$HAS_APP" = true ]; then
    echo "Preparing the copy (app dependencies)..."
    if ! (cd "$copy" && npm ci --ignore-scripts --no-audit --no-fund --prefer-offline) >"$run_dir/npm-ci.log" 2>&1; then
      echo "FAIL: app dependency install failed:" >&2
      tail -20 "$run_dir/npm-ci.log" >&2
      return 1
    fi
    # The real application healthy on its own port, independent of the review.
    preview_port=$((24000 + RANDOM % 8000))
    if ! (cd "$copy" && npm run build --silent -- --logLevel error) >"$run_dir/build.log" 2>&1; then
      echo "FAIL: app build failed:" >&2
      tail -20 "$run_dir/build.log" >&2
      return 1
    fi
    (cd "$copy" && npx vite preview --host 127.0.0.1 --port "$preview_port" --strictPort) >"$run_dir/preview.log" 2>&1 &
    preview_pid=$!
    local preview_up=false
    for _ in $(seq 1 20); do
      if curl -sS -m 2 "http://127.0.0.1:${preview_port}/" 2>/dev/null | grep -qi '<title>'; then
        preview_up=true
        break
      fi
      sleep 1
    done
    if [ "$preview_up" = true ]; then
      echo "ok: real app serves on its own port ($preview_port)"
    else
      echo "FAIL: the real app did not serve on port $preview_port:" >&2
      tail -10 "$run_dir/preview.log" >&2
      kill "$preview_pid" 2>/dev/null || true
      return 1
    fi
  fi

  # Drive the real provider exactly as an attendee would: the build skill is
  # deliberately not model-invocable, so the prompt IS the attendee command.
  local prompt
  if [ "$provider" = claude ]; then
    prompt='/build'
  else
    prompt='Use $build to complete exactly one workshop plan step. I am ready to review in the browser.'
  fi
  (
    cd "$copy"
    env -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_MESSAGING_SOCKET \
        -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_PID -u CLAUDE_CODE_ENTRYPOINT \
      bash -c '
        set -euo pipefail
        provider="$1"; prompt="$2"
        if [ "$provider" = claude ]; then
          exec claude -p "$prompt" --permission-mode bypassPermissions --verbose --output-format stream-json
        else
          # Codex workspace-write puts each command in a private network
          # namespace, so a review server started there is invisible to the
          # attendee browser. Interactive attendees approve escalated
          # lavish-review commands (one dialog); the headless equivalent for
          # this disposable copy is the bypass flag.
          exec codex exec --dangerously-bypass-approvals-and-sandbox \
            --ephemeral --json "$prompt"
        fi
      ' _ "$provider" "$prompt"
  ) >"$provider_log" 2>&1 &
  provider_pid=$!
  echo "Provider $provider running (pid $provider_pid, log $provider_log)."

  # Wait for the agent to open the review, then play the human.
  if ! wait_for_file "$copy/.lavish/active-review.json" 420; then
    echo "FAIL: the agent never opened a Lavish review (see $provider_log)." >&2
    kill "$provider_pid" "$preview_pid" 2>/dev/null || true
    return 1
  fi
  local session_key session_url
  session_key="$(node -p "require('$copy/.lavish/active-review.json').url.split('/session/')[1]")"
  session_url="http://127.0.0.1:4387/session/${session_key}"
  echo "Review session detected: $session_url"

  if ! node "$script_dir/lib/e2e-human.mjs" "$session_url" "$copy/$WATCH_PATH" "$MARKER_TEXT"; then
    echo "FAIL: the simulated human could not complete the review loop (see $provider_log)." >&2
    kill "$provider_pid" "$preview_pid" 2>/dev/null || true
    return 1
  fi

  # The provider must now finish the step on its own.
  local wait_deadline=$(( $(date +%s) + 600 ))
  while kill -0 "$provider_pid" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$wait_deadline" ]; then
      echo "FAIL: the provider did not finish within 10 minutes of review end." >&2
      kill "$provider_pid" 2>/dev/null || true
      status=1
      break
    fi
    sleep 5
  done
  if [ "$status" -eq 0 ]; then
    wait "$provider_pid" || { echo "FAIL: provider process exited non-zero." >&2; status=1; }
  fi

  [ -n "$preview_pid" ] && kill "$preview_pid" 2>/dev/null || true
  bash "$repo_root/workshop/scripts/lavish-review" stop >/dev/null 2>&1 || true

  if [ "$status" -eq 0 ]; then
    if awk -v step="### $FINAL_STEP " 'index($0, step) == 1 {found=1} found && /^Status:/ {print $2; exit}' \
      "$copy/workshop/PLAN.md" | grep -q DONE; then
      echo "ok: $FINAL_STEP marked DONE"
    else
      echo "FAIL: $FINAL_STEP was not marked DONE in the plan." >&2
      status=1
    fi
    if ! grep -rq "$MARKER_TEXT" "$copy/$WATCH_PATH"; then
      echo "FAIL: the requested change is missing from the real source." >&2
      status=1
    fi
    if [ "$(git -C "$copy" rev-list --count HEAD)" -ge 2 ]; then
      echo "ok: the step produced a local commit"
    else
      echo "FAIL: no local commit was created for the completed step." >&2
      status=1
    fi
    if git -C "$copy" log -1 --format=%s | grep -qiE 'push'; then
      echo "FAIL: unexpected push-like activity in the copy." >&2
      status=1
    fi
  fi

  if curl -sS -m 2 http://127.0.0.1:4387/health >/dev/null 2>&1; then
    echo "FAIL: a Lavish server was left running after the run." >&2
    status=1
  fi

  local duration=$(( $(date +%s) - started ))
  if [ "$status" -eq 0 ]; then
    record "$iteration" "pass" "$duration"
    if [ "$keep_on_success" = true ]; then
      echo "Run artifacts kept at $run_dir"
    else
      rm -rf "$run_dir"
    fi
    echo "=== e2e/$provider iteration $iteration PASSED (${duration}s) ==="
    return 0
  fi
  record "$iteration" "fail" "$duration"
  echo "=== e2e/$provider iteration $iteration FAILED (${duration}s); artifacts kept at $run_dir ===" >&2
  return 1
}

passes=0
for iteration in $(seq 1 "$runs"); do
  if run_once "$iteration"; then
    passes=$((passes + 1))
  else
    echo "e2e/$provider: $passes consecutive pass(es) before failure." >&2
    exit 1
  fi
done
echo "e2e/$provider: $passes/$runs consecutive passes."
