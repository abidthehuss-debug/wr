#!/usr/bin/env bash
# L0 static checks: syntax, config validity, skill parity, tracked-state
# invariants, and single-source version coherence. No network, no server.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
cd "$repo_root"

failures=0
fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}
ok() {
  echo "ok: $*"
}

# --- shell and JavaScript syntax --------------------------------------------

while IFS= read -r script; do
  if bash -n "$script" 2>/dev/null; then
    ok "bash syntax: $script"
  else
    fail "bash syntax error in $script"
  fi
done < <(git ls-files '*.sh' 'workshop/scripts/lavish-review' 'workshop/scripts/lavish-verify')

if command -v shellcheck >/dev/null 2>&1; then
  while IFS= read -r script; do
    if shellcheck -S warning "$script" >/dev/null; then
      ok "shellcheck: $script"
    else
      fail "shellcheck warnings in $script (run: shellcheck $script)"
    fi
  done < <(git ls-files 'workshop/scripts/lavish-review' 'workshop/scripts/lavish-verify' 'workshop/scripts/tests/*.sh')
else
  echo "note: shellcheck not installed here; CI runs it."
fi

while IFS= read -r script; do
  case "$script" in
    workshop/scripts/tests/fixtures/*) continue ;;
  esac
  if node --check "$script" 2>/dev/null; then
    ok "node syntax: $script"
  else
    fail "node syntax error in $script"
  fi
done < <(git ls-files 'workshop/scripts/*.mjs' 'workshop/scripts/*.js' 'workshop/scripts/tests/*.mjs' 'workshop/scripts/tests/lib/*.mjs')

# --- configuration validity --------------------------------------------------

if node -e '
  const fs = require("fs");
  const text = fs.readFileSync(".devcontainer/devcontainer.json", "utf8");
  JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
' 2>/dev/null; then
  ok "devcontainer.json parses"
else
  fail "devcontainer.json does not parse as JSONC"
fi

for json_file in .claude/settings.json workshop/vendor/lavish/package.json workshop/vendor/lavish/package-lock.json; do
  if node -e "JSON.parse(require('fs').readFileSync('$json_file','utf8'))" 2>/dev/null; then
    ok "valid JSON: $json_file"
  else
    fail "invalid JSON: $json_file"
  fi
done

if command -v python3 >/dev/null 2>&1; then
  for toml_file in .codex/config.toml .codex/agents/workshop-reviewer.toml; do
    if python3 -c "import tomllib,sys; tomllib.load(open('$toml_file','rb'))" 2>/dev/null; then
      ok "valid TOML: $toml_file"
    else
      fail "invalid TOML: $toml_file"
    fi
  done
fi

while IFS= read -r skill_file; do
  if awk 'NR==1 && $0!="---" {exit 1} END {exit 0}' "$skill_file" \
    && grep -q '^name:' "$skill_file" && grep -q '^description:' "$skill_file"; then
    ok "skill frontmatter: $skill_file"
  else
    fail "missing or malformed frontmatter in $skill_file"
  fi
done < <(git ls-files '*/SKILL.md')

# --- provider parity ---------------------------------------------------------

# The four duplicated skills may differ ONLY in argument plumbing (Claude's
# $ARGUMENTS templating vs Codex's "$<skill>" prose) and Claude-only
# frontmatter. Any other divergence is drift — the class of bug that once left
# Claude attendees with stale Lavish troubleshooting. Text is flattened before
# comparison so re-wrapped lines never mask or fake drift; the explicit
# allowlist below names every permitted plumbing sentence. Editing those
# sections means updating this list deliberately.
for skill in build guide troubleshoot workshop; do
  if node -e '
    const fs = require("fs");
    const plumbing = [
      /The attendee.s optional question is: \$ARGUMENTS ?/g,
      /Use (the optional question above|any question supplied with `\$guide`) to focus the response\./g,
      /Problem description: \$ARGUMENTS ?/g,
      /(If the description is empty,|Treat all text following `\$troubleshoot` as the problem description\. If none is provided,) inspect obvious workshop health signals first, then ask one simple question about what the attendee saw\./g,
      /Optional starter path: \$ARGUMENTS ?/g,
      /(The attendee may optionally supply a starter path after `\$workshop`\. Treat that text as the requested starter path\. )?No supplied text means the normal free-form workflow\./g,
    ];
    const normalize = (file) => {
      let text = fs.readFileSync(file, "utf8");
      text = text.replace(/^---\n[\s\S]*?\n---\n/, "");
      text = text.replace(/\s+/g, " ").trim();
      for (const pattern of plumbing) text = text.replace(pattern, "");
      return text.replace(/\s+/g, " ").trim();
    };
    const skill = process.argv[1];
    const a = normalize(`.claude/skills/${skill}/SKILL.md`);
    const b = normalize(`.agents/skills/${skill}/SKILL.md`);
    if (a !== b) {
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
      console.error(`divergence near: …${a.slice(Math.max(0, i - 40), i + 60)}…`);
      process.exit(1);
    }
  ' "$skill"; then
    ok "provider parity: $skill"
  else
    fail "provider drift in $skill/SKILL.md beyond argument plumbing (diff .claude/skills/$skill/SKILL.md .agents/skills/$skill/SKILL.md)"
  fi
done

for link in .claude/skills/lavish .claude/skills/troubleshoot/references .claude/skills/guide/references; do
  mode="$(git ls-files --format='%(objectmode)' "$link" 2>/dev/null || true)"
  if [ "$mode" = "120000" ] && [ -e "$link" ]; then
    ok "symlink tracked and resolves: $link"
  else
    fail "$link must be a tracked symlink (mode 120000) that resolves (mode: ${mode:-untracked})"
  fi
done

# --- executable bits ---------------------------------------------------------

for exe in workshop/scripts/lavish-review workshop/scripts/lavish-verify \
  workshop/scripts/tests/check-static.sh workshop/scripts/tests/check-artifacts.sh \
  workshop/scripts/tests/run-provider-e2e.sh workshop/scripts/tests/run-full-journey.sh \
  .devcontainer/post-create.sh .devcontainer/persist-agent-sessions.sh; do
  mode="$(git ls-files --format='%(objectmode)' "$exe" 2>/dev/null || true)"
  if [ "$mode" = "100755" ]; then
    ok "executable: $exe"
  else
    fail "$exe must be tracked with mode 100755 (found: ${mode:-untracked})"
  fi
done

# --- tracked-state hygiene ---------------------------------------------------

if git ls-files | grep -qE '^\.lavish/|^workshop/PLAN\.md$|\.tsbuildinfo$'; then
  fail "tracked attendee/session state found (.lavish/, workshop/PLAN.md, or *.tsbuildinfo)"
else
  ok "no tracked attendee or generated state"
fi

if git ls-files | grep -qE 'node_modules/'; then
  fail "tracked node_modules content found"
else
  ok "no tracked node_modules"
fi

if git grep -nE 'lavish-axi-safe|lavish-review-vite' -- ':!workshop/scripts/tests/check-static.sh' >/dev/null 2>&1; then
  fail "references to removed legacy scripts remain (git grep 'lavish-axi-safe|lavish-review-vite')"
else
  ok "no references to removed legacy Lavish scripts"
fi

# Actual assignments only; docs state the prohibition and the builders carry
# the rejection patterns, and tests use hostile values deliberately.
if git grep -nE 'LAVISH_AXI_HOST=["'"'"']?0\.0\.0\.0' -- 'workshop/scripts' '.devcontainer' ':!workshop/scripts/tests' >/dev/null 2>&1; then
  fail "a wildcard bind address is assigned in tooling"
else
  ok "no wildcard bind addresses assigned in tooling"
fi

if git grep -nE 'LAVISH_AXI_ALLOWED_HOSTS=["'"'"']?\*' -- 'workshop/scripts' '.devcontainer' ':!workshop/scripts/tests' >/dev/null 2>&1; then
  fail "a wildcard Lavish allowlist is assigned in tooling"
else
  ok "no wildcard Lavish allowlist assigned in tooling"
fi

# --- single-source version coherence ----------------------------------------

if node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  const manifest = JSON.parse(readFileSync('workshop/vendor/lavish/package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('workshop/vendor/lavish/package-lock.json', 'utf8'));
  const patch = await import('file://' + process.cwd() + '/workshop/scripts/patch-lavish-feedback.mjs');
  const pinned = manifest.dependencies['lavish-axi'];
  const locked = lock.packages['node_modules/lavish-axi'].version;
  if (pinned !== patch.affectedVersion) throw new Error(\`manifest pins \${pinned} but the patch targets \${patch.affectedVersion}\`);
  if (pinned !== locked) throw new Error(\`manifest pins \${pinned} but the lockfile resolves \${locked}\`);
  if (!lock.packages['node_modules/lavish-axi'].integrity) throw new Error('lockfile has no integrity hash for lavish-axi');
"; then
  ok "version coherence: manifest, lockfile, and patch agree"
else
  fail "version coherence: workshop/vendor/lavish/{package.json,package-lock.json} and patch-lavish-feedback.mjs disagree"
fi

# Prose must not hardcode the pinned version number anywhere else.
if git grep -nE 'lavish-axi@0\.1\.[0-9]+|lavish-axi-v0\.1\.[0-9]+' -- ':!workshop/vendor/lavish' ':!workshop/scripts/tests/check-static.sh' >/dev/null 2>&1; then
  fail "a hardcoded lavish-axi version literal exists outside workshop/vendor/lavish"
else
  ok "no stray version literals outside the vendor manifest"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "check-static: $failures failure(s)." >&2
  exit 1
fi
echo "check-static: all checks passed."
