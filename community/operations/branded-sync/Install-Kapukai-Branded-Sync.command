#!/bin/bash
# Place this launcher beside the other files extracted from the ZIP.
set -euo pipefail
case "${1:-install}" in
  install|check|rollback|status) mode="${1:-install}";;
  *) echo "Usage: $0 [check|install|status|rollback]" >&2; exit 2;;
esac
cd -- "$(dirname -- "$0")"
files=(host-setup.sh sync.py source.py overlay.py nginx_route.py kapukai-branded-sync.service kapukai-branded-sync.timer)
for file in "${files[@]}"; do
  if [[ ! -f "$file" || -L "$file" ]]; then
    echo "Extract the whole ZIP first. Missing or unexpected file: $file" >&2
    exit 1
  fi
done

# Only fixed, named local files enter a fresh root-owned staging directory.
# SSH uses the Mac's normal key and known_hosts configuration.
export COPYFILE_DISABLE=1
remote='set -eu
umask 077
stage=$(mktemp -d /tmp/kapukai-branded-sync.XXXXXXXX)
trap '\''rm -rf -- "$stage"'\'' 0
cd -- "$stage"
tar --no-same-owner --no-same-permissions -xzf -
/bin/bash ./host-setup.sh'
tar --format=ustar -czf - "${files[@]}" |
  ssh -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
    root@195.246.230.42 "$remote $mode"
