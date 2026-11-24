#!/usr/bin/env bash
# Stremio+ installer for macOS and Linux. Installs (or updates) the latest release:
#
#   curl -fsSL https://raw.githubusercontent.com/reliskdev/Stremio-Plus/main/install.sh | bash
#
# Needs the official Stremio app. Uses your Node.js if it is 20+, otherwise downloads a private copy.
# Env overrides: STREMIO_PLUS_DIR (install folder), STREMIO_PLUS_URL (release tarball, or a local path).
set -euo pipefail

REPO="reliskdev/Stremio-Plus"
NODE_VERSION="v22.12.0"
URL="${STREMIO_PLUS_URL:-https://github.com/$REPO/releases/latest/download/stremio-plus.tar.gz}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) OS=darwin; DIR="${STREMIO_PLUS_DIR:-$HOME/.stremio-plus}" ;;
  Linux)  OS=linux;  DIR="${STREMIO_PLUS_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/stremio-plus}" ;;
  *) die "Unsupported system $(uname -s). On Windows, run install.ps1 in PowerShell." ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64)  ARCH=x64 ;;
  *) die "Unsupported CPU $(uname -m)" ;;
esac
command -v curl >/dev/null || die "curl is required"
command -v tar >/dev/null || die "tar is required"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

bold "Downloading Stremio+..."
if [[ -f "$URL" ]]; then cp "$URL" "$TMP/sp.tar.gz"; else curl -fL --progress-bar "$URL" -o "$TMP/sp.tar.gz"; fi
tar -xzf "$TMP/sp.tar.gz" -C "$TMP"
NEW="$TMP/stremio-plus"
[[ -f "$NEW/cli/index.js" ]] || die "The download doesn't look like a Stremio+ release"

node_ok() {
  command -v node >/dev/null 2>&1 && [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 20 ]]
}
if [[ ! -x "$DIR/runtime/node/bin/node" ]] && ! node_ok; then
  bold "Downloading Node.js $NODE_VERSION (private copy, used only by Stremio+)..."
  NODE_TGZ="node-$NODE_VERSION-$OS-$ARCH.tar.gz"
  curl -fL --progress-bar "https://nodejs.org/dist/$NODE_VERSION/$NODE_TGZ" -o "$TMP/node.tar.gz"
  mkdir -p "$NEW/runtime/node"
  tar -xzf "$TMP/node.tar.gz" -C "$NEW/runtime/node" --strip-components 1
fi

# Update in place: stop the running copy, keep caches and settings (addon/data) and the private Node.
if [[ -d "$DIR" ]]; then
  bold "Updating $DIR..."
  [[ -x "$DIR/bin/stremio-plus" ]] && "$DIR/bin/stremio-plus" halt >/dev/null 2>&1 || true
  [[ -d "$DIR/addon/data" ]] && mv "$DIR/addon/data" "$NEW/addon/data"
  [[ -d "$DIR/runtime" && ! -d "$NEW/runtime" ]] && mv "$DIR/runtime" "$NEW/runtime"
  rm -rf "$DIR"
fi
mkdir -p "$(dirname "$DIR")"
mv "$NEW" "$DIR"

"$DIR/bin/stremio-plus" setup

# `stremio-plus` on the PATH (~/.local/bin).
mkdir -p "$HOME/.local/bin"
printf '#!/bin/sh\nexec "%s/bin/stremio-plus" "$@"\n' "$DIR" > "$HOME/.local/bin/stremio-plus"
chmod +x "$HOME/.local/bin/stremio-plus"

echo
bold "Stremio+ $("$DIR/bin/stremio-plus" version) is installed in $DIR"
if [[ "$OS" == darwin ]]; then
  echo "Open it with Stremio+ in ~/Applications (Spotlight: \"Stremio+\")."
else
  echo "Open it with Stremio+ in your app menu, or run: stremio-plus"
fi
echo "First run: log in to your Stremio account once, then add the Rotten Tomatoes addon from"
echo "  http://127.0.0.1:7010/configure"
echo "Always open Stremio with the mods: stremio-plus enable   ·   Uninstall: stremio-plus uninstall"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "(add ~/.local/bin to your PATH to use the stremio-plus command)";; esac
