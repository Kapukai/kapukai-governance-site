#!/bin/sh
# Run on the operator's Mac with its existing, verified SSH access.
(
set -eu
circuit_commit='71a6d6f4345e73b30267b617a2f4043d04a6d0f4'
circuit_helper="$(mktemp "${TMPDIR:-/tmp}/kapukai-circuit.XXXXXXXX")"
trap 'rm -f "$circuit_helper"' EXIT
curl -fsSL "https://raw.githubusercontent.com/Kapukai/kapukai-governance-site/$circuit_commit/ops/circuit/publish.py" -o "$circuit_helper"
printf '%s  %s\n' 'a5852e4e2fa54f9d3bf126019fabe43fb6a6d4a788efd5cb4c4b45b335ebe249' "$circuit_helper" | shasum -a 256 -c -
python3 "$circuit_helper" --commit "$circuit_commit" --manifest-sha256 '2bb3f4a64209207eddb9eac24df259a95b9d73bc3546a265dcb687f97483ac9c'
)
