#!/bin/bash
set -euo pipefail

UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
systemctl --user disable --now branchport.service 2>/dev/null || true
rm -f "$UNIT_DIR/branchport.service"
systemctl --user daemon-reload
echo "Uninstalled: branchport.service"
