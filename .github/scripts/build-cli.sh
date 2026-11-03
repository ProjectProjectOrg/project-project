#!/bin/sh
set -eu

version="${1:?usage: build-cli.sh <version> [out-dir]}"
out="${2:-dist/cli}"
root="$(cd "$(dirname "$0")/../.." && pwd)"

mkdir -p "$out"
for target in darwin-arm64 darwin-x64 linux-arm64 linux-x64; do
  bun build "$root/apps/cli/src/main.ts" \
    --compile --minify \
    --target="bun-$target" \
    --define "PP_BUILD=\"$version\"" \
    --outfile "$out/pp-$target"
  gzip -9 -f "$out/pp-$target"
done
cp "$root/apps/cli/install.sh" "$out/install.sh"
cp "$root/apps/cli/vendor/glyph-kit/LICENSE" "$out/THIRD_PARTY_LICENSE-glyph-kit.txt"
cd "$out"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 pp-*.gz > SHA256SUMS
else
  sha256sum pp-*.gz > SHA256SUMS
fi
