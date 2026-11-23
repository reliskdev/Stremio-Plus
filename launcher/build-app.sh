#!/bin/bash
# Builds ~/Applications/Stremio+.app from launcher.applescript, using Stremio's icon.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Applications/Stremio+.app"
rm -rf "$APP"
osacompile -o "$APP" "$DIR/launcher.applescript"
cp /Applications/Stremio.app/Contents/Resources/AppIcon.icns "$APP/Contents/Resources/applet.icns"
rm -f "$APP/Contents/Resources/Assets.car"
plutil -remove CFBundleIconName "$APP/Contents/Info.plist" 2>/dev/null || true
codesign --force -s - "$APP" >/dev/null 2>&1
touch "$APP"
echo "built $APP"
