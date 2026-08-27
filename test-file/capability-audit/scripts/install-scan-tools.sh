#!/usr/bin/env bash
# Install Skill/MCP scan tools: SkillSpector + Cisco Skill Scanner (pip into scan-venv)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_ROOT="${TOOLS_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)/tools}"
VENV="$TOOLS_ROOT/scan-venv"
ENV_FILE="$TOOLS_ROOT/tools.env"

step() { echo "==> $*"; }

step "Tools root: $TOOLS_ROOT"

if [[ ! -d "$VENV" ]]; then
  step "Creating scan-venv"
  python3 -m venv "$VENV"
fi

PIP="$VENV/bin/pip"
if [[ ! -x "$PIP" ]]; then
  echo "ERROR: $PIP not found" >&2
  exit 1
fi

step "Installing SkillSpector..."
"$PIP" install --upgrade pip
"$PIP" install 'git+https://github.com/NVIDIA/SkillSpector.git'

step "Installing Cisco Skill Scanner..."
"$PIP" install 'cisco-ai-skill-scanner'

{
  echo "CAPABILITY_SCAN_SKILLSPECTOR_BIN=$VENV/bin/skillspector"
  echo "CAPABILITY_SCAN_CISCO_SKILL_SCANNER_BIN=$VENV/bin/skill-scanner"
  if command -v snyk-agent-scan >/dev/null 2>&1; then
    echo "CAPABILITY_SCAN_SNYK_AGENT_SCAN_BIN=$(command -v snyk-agent-scan)"
    echo "CAPABILITY_SCAN_SNYK_MCP_SERVER_TIMEOUT_SECONDS=5"
  fi
} >"$ENV_FILE"

step "Verify:"
"$VENV/bin/skillspector" --version || true
"$VENV/bin/skill-scanner" --help | head -n 1 || true

step "Wrote $ENV_FILE"
step "Install finished."
