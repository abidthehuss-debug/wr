#!/usr/bin/env bash
# L1 artifact-builder checks: run the real builders over checked-in fixtures
# and assert the invariants that keep reviews from rendering blank, unstyled,
# or embedded. No Lavish server involved.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
fixtures_dir="$script_dir/fixtures"
prepare_vite="$repo_root/workshop/scripts/prepare-lavish-vite.mjs"
prepare_static="$repo_root/workshop/scripts/prepare-lavish-static.mjs"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/lavish-artifacts.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

failures=0
fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}
ok() {
  echo "ok: $*"
}

assert_self_contained() {
  local html_file="$1" label="$2"
  if grep -qiE '<iframe\b' "$html_file"; then
    fail "$label contains an iframe"
  elif grep -qiE '(https?:)?//(localhost|127\.0\.0\.1|0\.0\.0\.0)(:[0-9]+)?' "$html_file"; then
    fail "$label contains a localhost/loopback URL"
  elif grep -qiE '[a-z0-9-]+\.app\.github\.dev' "$html_file"; then
    fail "$label contains a Codespaces forwarded URL"
  else
    ok "$label is self-contained (no iframe, no served URLs)"
  fi
}

# --- static HTML fixtures ----------------------------------------------------

for fixture in static-html/review.html second-brain-map/map.html; do
  if node "$prepare_static" "$fixtures_dir/$fixture" >/dev/null; then
    ok "static validator accepts $fixture"
  else
    fail "static validator rejected the valid fixture $fixture"
  fi
  assert_self_contained "$fixtures_dir/$fixture" "$fixture"
done

# Negative static cases, generated in the workdir.
printf '<!doctype html><body><iframe src="x"></iframe></body>' > "$work_dir/bad-iframe.html"
printf '<!doctype html><body><a href="http://localhost:5173/">app</a></body>' > "$work_dir/bad-localhost.html"
printf '<!doctype html><body><script>localStorage.getItem("x")</script></body>' > "$work_dir/bad-storage.html"
printf '<!doctype html><p>no body close' > "$work_dir/bad-nobody.html"
for bad in bad-iframe bad-localhost bad-storage bad-nobody; do
  if node "$prepare_static" "$work_dir/$bad.html" >/dev/null 2>&1; then
    fail "static validator accepted invalid fixture $bad.html"
  else
    ok "static validator rejects $bad.html"
  fi
done

# --- storage compatibility shim ---------------------------------------------

if node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  import { createContext, Script } from 'node:vm';
  const shim = readFileSync('$repo_root/workshop/scripts/lavish-storage-compat.js', 'utf8');

  // Denied storage: accessing localStorage throws, as in the Lavish sandbox.
  const denied = { console };
  Object.defineProperty(denied, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  Object.defineProperty(denied, 'sessionStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  denied.globalThis = denied;
  denied.Storage = function Storage() {};
  createContext(denied);
  new Script(shim).runInContext(denied);
  denied.localStorage.setItem('k', 'v');
  if (denied.localStorage.getItem('k') !== 'v') throw new Error('fallback storage did not store');
  if (denied.localStorage.length !== 1) throw new Error('fallback storage length wrong');

  // Working storage must NOT be replaced.
  const store = new Map();
  const real = {
    setItem: (k, v) => store.set(String(k), String(v)),
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    removeItem: (k) => store.delete(String(k)),
  };
  const working = { console, localStorage: real, sessionStorage: real, Storage: function Storage() {} };
  working.globalThis = working;
  createContext(working);
  new Script(shim).runInContext(working);
  if (working.localStorage !== real) throw new Error('working storage was replaced');
"; then
  ok "storage shim: installs fallback when denied, preserves working storage"
else
  fail "storage shim behavior regressed"
fi

# --- Vite fixture through the real build ------------------------------------

vite_fixture="$fixtures_dir/vite-app"
if [ ! -d "$vite_fixture/node_modules" ]; then
  (cd "$vite_fixture" && npm ci --ignore-scripts --no-audit --no-fund --prefer-offline >/dev/null)
fi
(cd "$vite_fixture" && npm run build --silent -- --base ./ --logLevel error >/dev/null)
rm -rf "$vite_fixture/.lavish"
if node "$prepare_vite" "$vite_fixture/dist" "$vite_fixture/.lavish/app-review" >/dev/null; then
  ok "vite preparer builds the fixture artifact"
else
  fail "vite preparer failed on the fixture"
fi

artifact="$vite_fixture/.lavish/app-review/index.html"
if [ -f "$artifact" ]; then
  assert_self_contained "$artifact" "vite artifact"
  for marker in 'data-lavish-inline="storage-compat"' 'data-lavish-inline="vite-style"' 'data-lavish-inline="vite-bundle"'; do
    if grep -qF "$marker" "$artifact"; then
      ok "vite artifact carries $marker"
    else
      fail "vite artifact is missing $marker"
    fi
  done
  if grep -qF '$` $& $'"'" "$artifact"; then
    ok "String.replace tokens survive intact in the artifact"
  else
    fail "String.replace tokens were corrupted or dropped in the artifact"
  fi
  if grep -qE '<script type="module"' "$artifact"; then
    fail "vite artifact still contains a module script tag"
  else
    ok "vite artifact contains no module script tags"
  fi
  # The bundle must execute after the mount node exists.
  if node -e "
    const html = require('fs').readFileSync('$artifact', 'utf8');
    const root = html.indexOf('id=\"root\"');
    const bundle = html.indexOf('data-lavish-inline=\"vite-bundle\"');
    if (root === -1 || bundle === -1 || bundle < root) process.exit(1);
  "; then
    ok "application bundle is placed after the mount node"
  else
    fail "application bundle does not follow the mount node"
  fi
  if [ -f "$vite_fixture/.lavish/app-review/.lavish-review-artifact" ]; then
    ok "artifact directory carries the generation marker"
  else
    fail "artifact directory is missing the generation marker"
  fi
else
  fail "vite artifact was not produced"
fi

# Prune: rebuilding must leave exactly one asset generation.
node "$prepare_vite" "$vite_fixture/dist" "$vite_fixture/.lavish/app-review" >/dev/null
asset_count="$(find "$vite_fixture/.lavish/app-review/assets" -type f 2>/dev/null | wc -l | tr -d ' ')"
expected_count="$(find "$vite_fixture/dist/assets" -type f | wc -l | tr -d ' ')"
if [ "$asset_count" = "$expected_count" ]; then
  ok "rebuild prunes stale assets ($asset_count file(s), matching dist)"
else
  fail "stale assets accumulate: $asset_count in app-review vs $expected_count in dist"
fi

# Unmarked output directories are never deleted.
mkdir -p "$work_dir/precious-output"
printf 'not ours' > "$work_dir/precious-output/keep.txt"
if node "$prepare_vite" "$vite_fixture/dist" "$work_dir/precious-output" >/dev/null 2>&1; then
  fail "preparer overwrote a directory it did not create"
else
  if [ -f "$work_dir/precious-output/keep.txt" ]; then
    ok "preparer refuses to overwrite an unmarked directory"
  else
    fail "preparer deleted an unmarked directory's contents"
  fi
fi

# --- Vite negatives ----------------------------------------------------------

# A code-split bundle must be rejected with the actionable module message.
mkdir -p "$work_dir/split-dist/assets"
cat > "$work_dir/split-dist/index.html" <<'HTML'
<!doctype html><html><head><script type="module" src="./assets/entry.js"></script></head>
<body><div id="root"></div></body></html>
HTML
printf 'import { x } from "./chunk.js"; console.log(x);' > "$work_dir/split-dist/assets/entry.js"
printf 'export const x = 1;' > "$work_dir/split-dist/assets/chunk.js"
if output="$(node "$prepare_vite" "$work_dir/split-dist" "$work_dir/split-out" 2>&1)"; then
  fail "preparer accepted a code-split bundle"
else
  if grep -q 'module imports or exports' <<<"$output"; then
    ok "code-split bundle rejected with an actionable message"
  else
    fail "code-split rejection lacks the actionable message"
  fi
fi

# A local CSS @import must be rejected.
mkdir -p "$work_dir/import-dist/assets"
cat > "$work_dir/import-dist/index.html" <<'HTML'
<!doctype html><html><head><link rel="stylesheet" href="./assets/a.css"><script src="./assets/app.js"></script></head>
<body><div id="root"></div></body></html>
HTML
printf '@import "./b.css";' > "$work_dir/import-dist/assets/a.css"
printf 'body{}' > "$work_dir/import-dist/assets/b.css"
printf 'console.log(1)' > "$work_dir/import-dist/assets/app.js"
if node "$prepare_vite" "$work_dir/import-dist" "$work_dir/import-out" >/dev/null 2>&1; then
  fail "preparer accepted a local CSS @import"
else
  ok "local CSS @import rejected"
fi

# An entry page that embeds an iframe must be rejected by the artifact guard.
mkdir -p "$work_dir/iframe-dist/assets"
cat > "$work_dir/iframe-dist/index.html" <<'HTML'
<!doctype html><html><head><script src="./assets/app.js"></script></head>
<body><div id="root"></div><iframe src="./x.html"></iframe></body></html>
HTML
printf 'console.log(1)' > "$work_dir/iframe-dist/assets/app.js"
if node "$prepare_vite" "$work_dir/iframe-dist" "$work_dir/iframe-out" >/dev/null 2>&1; then
  fail "preparer accepted an entry page containing an iframe"
else
  ok "iframe in the entry page rejected by the artifact guard"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "check-artifacts: $failures failure(s)." >&2
  exit 1
fi
echo "check-artifacts: all checks passed."
