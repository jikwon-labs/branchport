#!/bin/bash
set -euo pipefail

TOOL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/io.github.wlrnjs.branchport.plist"
LEGACY_PLIST="$HOME/Library/LaunchAgents/com.quedot.localhost-worktree-label.plist"
LOG_DIR="$HOME/Library/Logs/branchport"
SERVICE_TARGET="gui/$(id -u)/io.github.wlrnjs.branchport"
LEGACY_TARGET="gui/$(id -u)/com.quedot.localhost-worktree-label"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>io.github.wlrnjs.branchport</string>
  <key>ProgramArguments</key><array><string>$NODE_BIN</string><string>$TOOL_DIR/helper/server.js</string></array>
  <key>WorkingDirectory</key><string>$TOOL_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/output.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/error.log</string>
</dict></plist>
EOF

launchctl bootout "$SERVICE_TARGET" 2>/dev/null || true
launchctl bootout "$LEGACY_TARGET" 2>/dev/null || true

# launchd can briefly retain the old label after bootout and reject an immediate
# bootstrap with error 5. Wait for removal, then retry once for the same race.
for _ in {1..20}; do
  if ! launchctl print "$SERVICE_TARGET" >/dev/null 2>&1 \
    && ! launchctl print "$LEGACY_TARGET" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

rm -f "$LEGACY_PLIST"

if ! launchctl bootstrap "gui/$(id -u)" "$PLIST"; then
  sleep 0.5
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
fi
echo "Installed and started: io.github.wlrnjs.branchport"
