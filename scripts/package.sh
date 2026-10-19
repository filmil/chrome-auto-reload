#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Packages extension/ as a zip for the Chrome Web Store or "Load unpacked",
# with the given version in its manifest, and writes the zip's SHA-256.
#
# usage: scripts/package.sh VERSION OUTDIR
#   VERSION: 1 to 4 dot-separated integers, each 0 to 65535 (Chrome's rule).
set -euo pipefail
version="${1:?version}"; out="${2:?output directory}"
[[ "$version" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]] || { echo "bad version: $version" >&2; exit 1; }
IFS=. read -ra parts <<< "$version"
for p in "${parts[@]}"; do
  (( 10#$p <= 65535 )) || { echo "version part over 65535: $p" >&2; exit 1; }
done

root="$(cd "$(dirname "$0")/.." && pwd)"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp -r "$root/extension" "$stage/extension"
VERSION="$version" node -e '
  const fs = require("fs");
  const f = process.argv[1];
  const m = JSON.parse(fs.readFileSync(f, "utf8"));
  m.version = process.env.VERSION;
  fs.writeFileSync(f, JSON.stringify(m, null, 2) + "\n");
' "$stage/extension/manifest.json"

mkdir -p "$out"
zip_name="auto-reload-$version.zip"
# Sorted names and fixed times, so the same source makes the same zip.
(cd "$stage/extension" && find . -type f | LC_ALL=C sort | sed 's|^\./||' \
  | TZ=UTC xargs touch -d '2026-01-01 00:00:00' && find . -type f | LC_ALL=C sort | sed 's|^\./||' \
  | TZ=UTC zip -q -X "$stage/$zip_name" -@)
mv "$stage/$zip_name" "$out/"
(cd "$out" && sha256sum "$zip_name" > "$zip_name.sha256")
echo "$out/$zip_name"
