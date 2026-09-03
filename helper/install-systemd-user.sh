#!/bin/bash
set -euo pipefail

TOOL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT="$UNIT_DIR/branchport.service"

mkdir -p "$UNIT_DIR"
cat > "$UNIT" <<EOF
[Unit]
Description=Branchport local helper

[Service]
ExecStart=$NODE_BIN $TOOL_DIR/helper/server.js
WorkingDirectory=$TOOL_DIR
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now branchport.service
echo "Installed and started: branchport.service"
