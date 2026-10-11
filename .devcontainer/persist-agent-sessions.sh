#!/usr/bin/env bash

set -euo pipefail
umask 077

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
script_path="$script_dir/$(basename -- "${BASH_SOURCE[0]}")"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null || pwd)"
persistent_root="$repo_root/.workshop-local/sessions"
claude_root="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
codex_root="${CODEX_HOME:-$HOME/.codex}"
run_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
check_only=false

if [ "${1:-}" = "--check" ]; then
  check_only=true
elif [ "$#" -ne 0 ]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

verify_workspace_storage() {
  local mount_target mount_source root_source mount_options

  command -v findmnt >/dev/null 2>&1 || {
    echo "ERROR: findmnt is required to verify persistent workspace storage." >&2
    return 1
  }

  mount_target="$(findmnt -n -T "$repo_root" -o TARGET)"
  mount_source="$(findmnt -n -T "$repo_root" -o SOURCE)"
  root_source="$(findmnt -n -T / -o SOURCE)"
  mount_options="$(findmnt -n -T "$repo_root" -o OPTIONS)"

  if [ "$mount_target" = "/" ] || [ "$mount_source" = "$root_source" ]; then
    echo "ERROR: $repo_root is on the disposable container filesystem, not a separate workspace mount." >&2
    return 1
  fi

  case ",$mount_options," in
    *,rw,*) ;;
    *)
      echo "ERROR: the workspace mount containing $repo_root is not writable." >&2
      return 1
      ;;
  esac

  if [ "${CODESPACES:-false}" = "true" ]; then
    echo "Persistent Codespaces workspace verified: $mount_target ($mount_source)"
  else
    echo "Workspace bind mount verified: $mount_target ($mount_source)"
    echo "NOTE: rebuild persistence outside GitHub Codespaces depends on the host workspace mount."
  fi
}

same_target() {
  local link_path="$1" target_path="$2"
  [ -L "$link_path" ] &&
    [ "$(readlink -f "$link_path" 2>/dev/null || true)" = "$(readlink -f "$target_path" 2>/dev/null || true)" ]
}

file_is_prefix() {
  local shorter="$1" longer="$2" shorter_size longer_size
  shorter_size="$(stat -c %s "$shorter")"
  longer_size="$(stat -c %s "$longer")"
  [ "$shorter_size" -le "$longer_size" ] && cmp -s -n "$shorter_size" "$shorter" "$longer"
}

merge_regular_file() {
  local source_file="$1" target_file="$2" label="$3"
  local conflict_path

  if [ ! -e "$target_file" ]; then
    mkdir -p "$(dirname "$target_file")"
    cp -a "$source_file" "$target_file"
  elif cmp -s "$source_file" "$target_file"; then
    return 0
  elif file_is_prefix "$target_file" "$source_file"; then
    cp -a "$source_file" "$target_file"
  elif file_is_prefix "$source_file" "$target_file"; then
    return 0
  else
    conflict_path="$persistent_root/migration-conflicts/$label/$run_stamp"
    mkdir -p "$conflict_path"
    cp -a "$source_file" "$conflict_path/source-copy"
    echo "ERROR: divergent $label data was preserved under migration-conflicts; no mapping was replaced." >&2
    return 1
  fi
}

merge_directory() {
  local source_dir="$1" target_dir="$2" label="$3"
  local source_file relative target_file

  mkdir -p "$target_dir"
  cp -a --update=none "$source_dir"/. "$target_dir"/

  while IFS= read -r -d '' source_file; do
    relative="${source_file#"$source_dir"/}"
    target_file="$target_dir/$relative"
    merge_regular_file "$source_file" "$target_file" "$label/$relative"
  done < <(find -L "$source_dir" -type f -print0)
}

backup_and_link() {
  local source_path="$1" target_path="$2" backup_path

  if [ -L "$source_path" ]; then
    rm "$source_path"
  elif [ -e "$source_path" ]; then
    backup_path="$source_path.pre-persistence-backup.$run_stamp.$$"
    mv "$source_path" "$backup_path"
  fi

  mkdir -p "$(dirname "$source_path")"
  ln -s "$target_path" "$source_path"
  same_target "$source_path" "$target_path" || {
    echo "ERROR: failed to map $source_path to persistent storage." >&2
    return 1
  }
}

map_directory() {
  local source_path="$1" target_path="$2" label="$3" previous

  # A live agent may still hold a file descriptor in the retained pre-migration
  # copy. Re-merging these copies makes a later idempotent run catch up safely.
  for previous in "$source_path".pre-persistence-backup.*; do
    [ -d "$previous" ] || continue
    merge_directory "$previous" "$target_path" "$label"
  done

  if same_target "$source_path" "$target_path"; then
    return 0
  fi

  if [ -L "$source_path" ]; then
    if [ -d "$source_path" ]; then
      merge_directory "$source_path" "$target_path" "$label"
    elif [ -e "$source_path" ]; then
      echo "ERROR: expected a directory at $source_path." >&2
      return 1
    fi
  elif [ -d "$source_path" ]; then
    merge_directory "$source_path" "$target_path" "$label"
  elif [ -e "$source_path" ]; then
    echo "ERROR: expected a directory at $source_path." >&2
    return 1
  else
    mkdir -p "$target_path"
  fi

  backup_and_link "$source_path" "$target_path"
}

map_file() {
  local source_path="$1" target_path="$2" label="$3" initial_content="${4:-}"
  local previous

  for previous in "$source_path".pre-persistence-backup.*; do
    [ -f "$previous" ] || continue
    merge_regular_file "$previous" "$target_path" "$label"
  done

  if same_target "$source_path" "$target_path"; then
    return 0
  fi

  mkdir -p "$(dirname "$target_path")"
  if [ -L "$source_path" ]; then
    if [ -f "$source_path" ]; then
      merge_regular_file "$source_path" "$target_path" "$label"
    elif [ -e "$source_path" ]; then
      echo "ERROR: expected a regular file at $source_path." >&2
      return 1
    fi
  elif [ -f "$source_path" ]; then
    merge_regular_file "$source_path" "$target_path" "$label"
  elif [ -e "$source_path" ]; then
    echo "ERROR: expected a regular file at $source_path." >&2
    return 1
  elif [ ! -e "$target_path" ]; then
    printf '%s' "$initial_content" > "$target_path"
  fi

  backup_and_link "$source_path" "$target_path"
}

check_mapping() {
  local source_path="$1" target_path="$2"
  if same_target "$source_path" "$target_path"; then
    printf 'OK: %s -> %s\n' "$source_path" "$target_path"
  else
    printf 'BROKEN: %s is not mapped to %s\n' "$source_path" "$target_path" >&2
    return 1
  fi
}

verify_no_credential_files() {
  local forbidden
  forbidden="$(find "$persistent_root" -type f \( \
    -name 'auth.json' -o -name '.credentials.json' -o -name '.env' -o \
    -name '*.pem' -o -name '*.key' -o -name 'id_rsa' -o -name 'id_ed25519' \
    \) -print -quit 2>/dev/null || true)"
  if [ -n "$forbidden" ]; then
    echo "ERROR: a credential-like file exists in the persistent session root." >&2
    return 1
  fi
}

secure_persistent_permissions() {
  [ -d "$persistent_root" ] || return 0
  find "$persistent_root" -type d -exec chmod go-rwx {} +
  find "$persistent_root" -type f -exec chmod go-rwx {} +
}

verify_private_permissions() {
  local owner_uid
  if [ ! -d "$persistent_root" ]; then
    echo "ERROR: persistent session root does not exist: $persistent_root" >&2
    return 1
  fi
  owner_uid="$(stat -c %u "$persistent_root")"
  if [ "$owner_uid" != "$(id -u)" ]; then
    echo "ERROR: persistent session root is not owned by the current user." >&2
    return 1
  fi
  if find "$persistent_root" -maxdepth 0 -perm /077 -print -quit | grep -q .; then
    echo "ERROR: persistent session root is accessible to group or other users." >&2
    return 1
  fi
}

verify_workspace_storage

claude_target="$persistent_root/claude"
codex_target="$persistent_root/codex"

if $check_only; then
  status=0
  check_mapping "$claude_root/projects" "$claude_target/projects" || status=1
  check_mapping "$claude_root/history.jsonl" "$claude_target/history.jsonl" || status=1
  check_mapping "$claude_root/file-history" "$claude_target/file-history" || status=1
  check_mapping "$claude_root/stats-cache.json" "$claude_target/stats-cache.json" || status=1
  check_mapping "$codex_root/sessions" "$codex_target/sessions" || status=1
  check_mapping "$codex_root/archived_sessions" "$codex_target/archived_sessions" || status=1
  check_mapping "$codex_root/attachments" "$codex_target/attachments" || status=1
  check_mapping "$codex_root/history.jsonl" "$codex_target/history.jsonl" || status=1
  check_mapping "$codex_root/session_index.jsonl" "$codex_target/session_index.jsonl" || status=1
  verify_no_credential_files || status=1
  verify_private_permissions || status=1
  exit "$status"
fi

mkdir -p "$claude_root" "$codex_root" "$claude_target" "$codex_target"
secure_persistent_permissions

map_directory "$claude_root/projects" "$claude_target/projects" "claude/projects"
map_file "$claude_root/history.jsonl" "$claude_target/history.jsonl" "claude/history.jsonl"
map_directory "$claude_root/file-history" "$claude_target/file-history" "claude/file-history"
map_file "$claude_root/stats-cache.json" "$claude_target/stats-cache.json" "claude/stats-cache.json" '{}'

map_directory "$codex_root/sessions" "$codex_target/sessions" "codex/sessions"
map_directory "$codex_root/archived_sessions" "$codex_target/archived_sessions" "codex/archived_sessions"
map_directory "$codex_root/attachments" "$codex_target/attachments" "codex/attachments"
map_file "$codex_root/history.jsonl" "$codex_target/history.jsonl" "codex/history.jsonl"
map_file "$codex_root/session_index.jsonl" "$codex_target/session_index.jsonl" "codex/session_index.jsonl"

# Codex's state_*.sqlite files are live, derived runtime databases with WAL
# companions. Do not symlink them into workspace storage; rollout sessions,
# archives, attachments, history, and the legacy index are the safe persistent
# sources.
secure_persistent_permissions
verify_no_credential_files
verify_private_permissions
"$script_path" --check
echo "Agent CLI session persistence is ready."
