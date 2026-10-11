#!/usr/bin/env bash
# Full-journey validation: drive a REAL provider from `/workshop <starter>`
# through plan approval and every fresh-session `/build` to plan completion,
# playing the human attendee (browser annotation loop) whenever a build step
# opens a Lavish review. One journey per invocation.
#
# Usage: run-full-journey.sh <claude|codex> [--starter workshop/starters/community-events]
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
evidence_dir="$repo_root/.workshop-local/verification"
logs_dir="$evidence_dir/logs"
marker_text="Our Community Events"

provider="${1:-}"
shift || true
starter="workshop/starters/community-events"
while [ $# -gt 0 ]; do
  case "$1" in
    --starter)
      shift
      starter="${1:-$starter}"
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift || true
done
case "$provider" in claude | codex) ;; *)
  echo "Usage: run-full-journey.sh <claude|codex> [--starter <path>]" >&2
  exit 2
  ;;
esac
command -v "$provider" >/dev/null 2>&1 || { echo "FAIL: $provider CLI missing." >&2; exit 1; }

mkdir -p "$logs_dir"
run_dir="/tmp/lavish-journey/${provider}-$(date +%s)"
copy="$run_dir/repo"
journey_log="$logs_dir/journey-${provider}-$(date -u +%Y%m%dT%H%M%SZ).log"
mkdir -p "$run_dir"

record() { # record <result> <duration>
  printf '{"ts":"%s","layer":"journey-%s","fixture":"%s","iteration":1,"result":"%s","duration_s":%s}\n' \
    "$(date -u +%FT%TZ)" "$provider" "$starter" "$1" "$2" >>"$evidence_dir/runs.jsonl"
}

started="$(date +%s)"
fail() {
  echo "FAIL: $*" >&2
  record fail "$(( $(date +%s) - started ))"
  echo "Artifacts kept at $run_dir (log: $journey_log)" >&2
  exit 1
}

# Port 4387 must be free.
if curl -sS -m 2 http://127.0.0.1:4387/health >/dev/null 2>&1; then
  bash "$repo_root/workshop/scripts/lavish-review" stop >/dev/null 2>&1 || true
  sleep 1
  curl -sS -m 2 http://127.0.0.1:4387/health >/dev/null 2>&1 && fail "port 4387 busy"
fi

# Template-shaped copy of the current tree (no fixture overlay — the journey
# starts from the starter brief, exactly like an attendee).
mkdir -p "$copy"
(cd "$repo_root" && git ls-files --cached --others --exclude-standard -z | tar --null -cf - -T -) | tar -xf - -C "$copy"
(
  cd "$copy"
  git init -q && git add -A
  git -c user.email=workshop@example.invalid -c user.name='Workshop Harness' commit -qm 'Template state' >/dev/null
  bash workshop/scripts/lavish-review install >/dev/null
)

scrub=(env -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_MESSAGING_SOCKET \
  -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_PID -u CLAUDE_CODE_ENTRYPOINT)

run_provider_turn() { # run_provider_turn <label> <prompt> [resume_id] -> prints session id (claude) on stdout
  local label="$1" prompt="$2" resume="${3:-}"
  echo "=== turn: $label ===" >>"$journey_log"
  if [ "$provider" = claude ]; then
    local args=(-p "$prompt" --permission-mode bypassPermissions --verbose --output-format stream-json)
    [ -n "$resume" ] && args=(--resume "$resume" "${args[@]}")
    (cd "$copy" && "${scrub[@]}" claude "${args[@]}") >>"$journey_log" 2>&1 || return 1
    grep -o '"session_id":"[a-f0-9-]*"' "$journey_log" | tail -1 | cut -d'"' -f4
  else
    if [ -n "$resume" ]; then
      (cd "$copy" && "${scrub[@]}" codex exec resume --last --dangerously-bypass-approvals-and-sandbox --json "$prompt") >>"$journey_log" 2>&1 || return 1
    else
      (cd "$copy" && "${scrub[@]}" codex exec --dangerously-bypass-approvals-and-sandbox --json "$prompt") >>"$journey_log" 2>&1 || return 1
    fi
    echo ""
  fi
}

# --- 1. Plan the project, then approve the plan ------------------------------
echo "Journey($provider): planning via the workshop skill..."
if [ "$provider" = claude ]; then
  session_id="$(run_provider_turn plan "/workshop $starter")" || fail "workshop planning turn failed"
  run_provider_turn approve "Yes, I approve this plan exactly as proposed. Please save it to workshop/PLAN.md now." "$session_id" >/dev/null \
    || fail "plan approval turn failed"
else
  run_provider_turn plan "Use \$workshop with the starter path $starter to plan my project." >/dev/null || fail "workshop planning turn failed"
  run_provider_turn approve "Yes, I approve this plan exactly as proposed. Please save it to workshop/PLAN.md now." resume >/dev/null \
    || fail "plan approval turn failed"
fi
[ -f "$copy/workshop/PLAN.md" ] || fail "workshop/PLAN.md was not created"
grep -q 'Status: TODO' "$copy/workshop/PLAN.md" || fail "the plan has no TODO steps"
echo "Plan created with $(grep -c '^### ' "$copy/workshop/PLAN.md") steps."

# --- 2. Build every step in a fresh session; play the human on review steps --
max_steps=8
for step in $(seq 1 "$max_steps"); do
  grep -q 'Status: TODO' "$copy/workshop/PLAN.md" || break
  echo "Journey($provider): build session $step..."
  rm -f "$copy/.lavish/active-review.json"
  if [ "$provider" = claude ]; then
    build_prompt="/build"
  else
    build_prompt='Use $build to complete exactly one workshop plan step. I am ready to review in the browser when needed.'
  fi
  (
    cd "$copy"
    if [ "$provider" = claude ]; then
      "${scrub[@]}" claude -p "$build_prompt" --permission-mode bypassPermissions --verbose --output-format stream-json
    else
      "${scrub[@]}" codex exec --dangerously-bypass-approvals-and-sandbox --ephemeral --json "$build_prompt"
    fi
  ) >>"$journey_log" 2>&1 &
  build_pid=$!

  # If this step opens a review, play the human; otherwise just wait.
  while kill -0 "$build_pid" 2>/dev/null; do
    if [ -f "$copy/.lavish/active-review.json" ]; then
      session_key="$(node -p "require('$copy/.lavish/active-review.json').url.split('/session/')[1]" 2>/dev/null || true)"
      if [ -n "$session_key" ]; then
        echo "Journey($provider): review opened; playing the attendee..."
        node "$script_dir/lib/e2e-human.mjs" "http://127.0.0.1:4387/session/$session_key" "$copy/src" "$marker_text" \
          || fail "the attendee review loop failed during the journey"
        break
      fi
    fi
    sleep 5
  done
  wait "$build_pid" || fail "build session $step exited non-zero (see $journey_log)"
done

grep -q 'Status: TODO' "$copy/workshop/PLAN.md" && fail "TODO steps remain after $max_steps build sessions"
commit_count="$(git -C "$copy" rev-list --count HEAD)"
[ "$commit_count" -ge 3 ] || fail "expected one commit per completed step; found $commit_count total"
grep -rq "$marker_text" "$copy/src" || fail "the review feedback never reached the source"
bash "$repo_root/workshop/scripts/lavish-review" stop >/dev/null 2>&1 || true
curl -sS -m 2 http://127.0.0.1:4387/health >/dev/null 2>&1 && fail "a Lavish server was left running"

duration=$(( $(date +%s) - started ))
record pass "$duration"
rm -rf "$run_dir"
echo "=== FULL JOURNEY ($provider) PASSED in ${duration}s: planned, built every step, reviewed, committed ==="
