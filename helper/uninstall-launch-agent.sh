#!/bin/bash
set -euo pipefail

PLIST="$HOME/Library/LaunchAgents/io.github.wlrnjs.branchport.plist"
LEGACY_PLIST="$HOME/Library/LaunchAgents/com.quedot.localhost-worktree-label.plist"
launchctl bootout "gui/$(id -u)/io.github.wlrnjs.branchport" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.quedot.localhost-worktree-label" 2>/dev/null || true
rm -f "$PLIST" "$LEGACY_PLIST"
echo "Uninstalled: io.github.wlrnjs.branchport"
