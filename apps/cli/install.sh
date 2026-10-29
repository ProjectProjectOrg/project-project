#!/bin/sh
set -eu

REPOSITORY="ProjectProjectOrg/project-project"
VERSION="${PP_VERSION:-latest}"
SERVER="${PP_SERVER:-}"
INSTALL_DIR="${PP_INSTALL_DIR:-$HOME/.local/bin}"

say() { printf '%s\n' "$*"; }
fail() { printf 'pp install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "pp runs on macOS and Linux; this is $(uname -s)." ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) fail "pp isn't built for $(uname -m) processors." ;;
esac

if [ -n "${PP_DOWNLOAD_BASE:-}" ]; then
  base="$PP_DOWNLOAD_BASE"
elif [ "$VERSION" = "latest" ]; then
  base="https://github.com/$REPOSITORY/releases/latest/download"
else
  base="https://github.com/$REPOSITORY/releases/download/$VERSION"
fi

asset="pp-$os-$arch.gz"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT INT TERM

say "Downloading pp ($VERSION, $os $arch)…"
curl -fsSL "$base/$asset" -o "$work/$asset" || fail "couldn't download $base/$asset."
curl -fsSL "$base/SHA256SUMS" -o "$work/SHA256SUMS" || fail "couldn't download $base/SHA256SUMS."

expected="$(awk -v name="$asset" '$2 == name || $2 == "*" name { print $1 }' "$work/SHA256SUMS")"
[ -n "$expected" ] || fail "SHA256SUMS has no entry for $asset."
if command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$work/$asset" | awk '{ print $1 }')"
else
  actual="$(sha256sum "$work/$asset" | awk '{ print $1 }')"
fi
[ "$actual" = "$expected" ] || fail "the download doesn't match its checksum, so it wasn't installed. Try again."

gunzip -c "$work/$asset" > "$work/pp"
chmod 755 "$work/pp"
mkdir -p "$INSTALL_DIR"
mv "$work/pp" "$INSTALL_DIR/pp"
say "Installed pp to $INSTALL_DIR/pp."

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    case "$(basename "${SHELL:-sh}")" in
      zsh) profile="$HOME/.zshrc" ;;
      bash) profile="$HOME/.bash_profile" ;;
      *) profile="" ;;
    esac
    line="export PATH=\"$INSTALL_DIR:\$PATH\""
    if [ -n "$profile" ] && [ -z "${PP_NO_PROFILE:-}" ]; then
      if ! grep -qsF "$line" "$profile"; then
        printf '\n# Added by the pp installer\n%s\n' "$line" >> "$profile"
      fi
      say "Added $INSTALL_DIR to your PATH in $profile. Open a new terminal to use pp."
    else
      say "Add $INSTALL_DIR to your PATH to use pp: $line"
    fi
    ;;
esac

if [ -n "$SERVER" ] && [ -z "${PP_SKIP_LOGIN:-}" ]; then
  say "Signing in to $SERVER…"
  if (exec < /dev/tty) 2>/dev/null; then
    "$INSTALL_DIR/pp" login "$SERVER" < /dev/tty
  else
    "$INSTALL_DIR/pp" login "$SERVER" < /dev/null
  fi
fi
