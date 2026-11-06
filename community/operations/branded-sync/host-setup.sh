#!/bin/bash
# Runs only on the branded host, from a fresh private SSH staging directory.
set -euo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
mode="${1:-}"
case "$mode" in check|install|rollback|status) ;; *) exit 2;; esac
fail() { echo "$*" >&2; exit 1; }
[[ $EUID == 0 ]] || fail "Run on the branded host using its root SSH account."

unit=kapukai-branded-sync
code="/usr/local/lib/$unit"
units=/etc/systemd/system
state="/var/lib/$unit"
receipt="$state/host-setup"
lockdir="/run/$unit-setup"
staged=$(pwd -P)
names=(sync.py source.py "$unit.service" "$unit.timer")
targets=("$code/sync.py" "$code/source.py" "$units/$unit.service" "$units/$unit.timer")

trusted_dir() {
  # Every ancestor must be a real directory owned by root with no group/public write.
  local dir=$1 bits
  while [[ "$dir" != / ]]; do
    [[ -d "$dir" && ! -L "$dir" && $(stat -c %u "$dir") == 0 ]] ||
      fail "Unexpected directory or owner: $dir"
    bits=$(stat -c %a "$dir")
    (( (8#$bits & 022) == 0 )) || fail "Writable by another user: $dir"
    dir=$(dirname -- "$dir")
  done
}
absent() { [[ ! -e "$1" && ! -L "$1" ]]; }
regular() {
  local bits
  [[ -f "$1" && ! -L "$1" && $(stat -c %u "$1") == 0 ]] || return 1
  bits=$(stat -c %a "$1")
  (( (8#$bits & 022) == 0 ))
}
service_info() {
  local value status
  if value=$(systemctl show "$1" --property="$2" --value); then
    printf '%s\n' "$value"
  else
    status=$?
    # Some systemd versions report 4 when a named unit is absent.
    [[ $status == 4 && ( "$2" == FragmentPath || "$2" == DropInPaths ) ]] || return "$status"
  fi
}
ensure_private_dir() {
  if absent "$1"; then mkdir -m 0700 -- "$1"; fi
  trusted_dir "$1"
  [[ $(stat -c %a "$1") == 700 ]] || fail "Expected private (0700) directory: $1"
}

for dir in /run /var/lib /usr/local/lib "$units"; do trusted_dir "$dir"; done
ensure_private_dir "$lockdir"
if ! absent "$lockdir/lock"; then regular "$lockdir/lock" || fail "Unexpected setup lock."; fi
exec 9>>"$lockdir/lock"
flock -w 60 9 || fail "Another setup operation is active."
[[ -d /run/systemd/system ]] || fail "This installer requires a running systemd host."
/usr/bin/python3 -c 'import sys; sys.exit(sys.version_info < (3, 9))' ||
  fail "Python 3.9 or later is required."
for item in "${names[@]}"; do
  regular "$staged/$item" || fail "Expected a staged regular file: $item"
done

# A durable manifest is written before installing components. A repeat invocation
# can safely finish an interrupted install only with the original package.
if ! absent "$state"; then ensure_private_dir "$state"; fi
if ! absent "$receipt"; then ensure_private_dir "$receipt"; fi
managed=0
manifest="$receipt/package.sha256"
if ! absent "$manifest"; then
  regular "$manifest" || fail "Unexpected setup receipt."
  (cd -- "$staged"; sha256sum -- "${names[@]}") | cmp -s - "$manifest" ||
    fail "A different package owns this installation. Use its original installer to roll back first."
  managed=1
fi

if ! absent "$code"; then
  (( managed )) || fail "Unmanaged code directory exists: $code"
  trusted_dir "$code"
  # Refuse unfamiliar files, including hidden names, before claiming this directory.
  [[ -z $(find "$code" -mindepth 1 -maxdepth 1 ! -name sync.py ! -name source.py -print -quit) ]] ||
    fail "Unexpected files in $code; review before continuing."
fi
for i in "${!names[@]}"; do
  target=${targets[$i]}
  if ! absent "$target"; then
    (( managed )) && regular "$target" && cmp -s -- "$staged/${names[$i]}" "$target" ||
      fail "Existing or modified file would conflict: $target"
  fi
done
for item in "$unit.service" "$unit.timer"; do
  location=$(service_info "$item" FragmentPath)
  overrides=$(service_info "$item" DropInPaths)
  [[ -z "$overrides" ]] || fail "Unexpected systemd drop-in for $item"
  if [[ -n "$location" ]]; then
    (( managed )) && [[ "$location" == "$units/$item" ]] ||
      fail "A different unit already owns $item ($location)."
  fi
done

if [[ "$mode" == check ]]; then
  /usr/bin/python3 -E -s -B "$staged/sync.py" check
  exit
fi
if [[ "$mode" == status ]]; then
  if (( ! managed )); then echo "Branded sync is not installed."; exit 0; fi
  systemctl --no-pager list-timers --all "$unit.timer"
  echo "Last verification result: $(service_info "$unit.service" Result)"
  exit
fi

disable_timer_and_wait() {
  if [[ -f "$units/$unit.timer" ]]; then systemctl disable --now "$unit.timer"; fi
  # Allow any existing atomic publish operation to finish instead of killing it.
  local attempts=0 activity
  if [[ -f "$units/$unit.service" ]]; then
    while true; do
      activity=$(service_info "$unit.service" ActiveState)
      case "$activity" in inactive|failed) break;; esac
      (( attempts++ < 400 )) || fail "Timer disabled. Service is still busy; run rollback again once it finishes."
      sleep 2
    done
  fi
}

if [[ "$mode" == rollback ]]; then
  if (( ! managed )); then echo "No managed installation to roll back."; exit 0; fi
  disable_timer_and_wait
  # Keep components and receipts if restoration fails, so the same command can retry.
  /usr/bin/python3 -E -s -B "$staged/sync.py" rollback
  for target in "${targets[@]}"; do if ! absent "$target"; then rm -- "$target"; fi; done
  if [[ -d "$code" ]]; then rmdir -- "$code"; fi
  systemctl daemon-reload
  rm -- "$manifest"
  rmdir -- "$receipt"
  echo "Branded sync was removed. Worker records and backups remain in $state."
  exit
fi

# Stage validates the source, target web root and conflicts before installing units.
# An interrupted setup can resume with the same command and package.
if (( ! managed )); then
  /usr/bin/python3 -E -s -B "$staged/sync.py" check
  ensure_private_dir "$state"
  ensure_private_dir "$receipt"
  tmp_manifest=$(mktemp "$receipt/.package.XXXXXXXX")
  (cd -- "$staged"; sha256sum -- "${names[@]}") >"$tmp_manifest"
  mv -T -- "$tmp_manifest" "$manifest"
fi
ensure_private_dir "$code"
for i in "${!names[@]}"; do
  target=${targets[$i]}
  if absent "$target"; then
    tmp=$(mktemp "$(dirname -- "$target")/.kapukai-setup.XXXXXXXX")
    install -m 0644 -- "$staged/${names[$i]}" "$tmp"
    # link rather than rename: even a non-cooperating admin's new file is preserved.
    ln -- "$tmp" "$target"
    rm -- "$tmp"
  fi
done
systemctl daemon-reload
for item in "$unit.service" "$unit.timer"; do
  [[ $(service_info "$item" FragmentPath) == "$units/$item" && -z $(service_info "$item" DropInPaths) ]] ||
    fail "Unit resolution for $item changed after installation. Review systemd before starting."
done
if ! systemctl start "$unit.service"; then
  echo "Initial verification failed. The timer was not newly enabled. Inspect: journalctl -u $unit.service -n 30" >&2
  echo "Rerun this package to resume, or run rollback to restore the previous pages." >&2
  exit 1
fi
systemctl enable --now "$unit.timer"
systemctl is-active --quiet "$unit.timer" && systemctl is-enabled --quiet "$unit.timer" ||
  fail "Pages verified. Timer activation failed; rerun install or use rollback."
echo "Branded pages verified. The server checks for new releases every 15 minutes."
