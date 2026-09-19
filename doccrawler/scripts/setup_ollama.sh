#!/data/data/com.termux/files/usr/bin/bash
# setup_ollama.sh -- one-time setup of Ollama for DocCrawler's Engineering
# Librarian, running inside a proot-distro Debian container on Termux.
#
# Ollama has no native Termux/Android build, so it is installed and run
# inside a proot Linux container (proot-distro). This script is idempotent:
# it is safe to re-run, and each step is skipped if already done.
#
# Usage:
#   bash scripts/setup_ollama.sh [model]
#
# [model] defaults to llama3.2:3b.
set -euo pipefail

MODEL="${1:-llama3.2:3b}"
DISTRO="debian"

log() { echo -e "\n==> $*"; }

log "DocCrawler / The Librarian: Ollama setup (model: ${MODEL})"

# 1. Install proot-distro if missing.
if ! command -v proot-distro >/dev/null 2>&1; then
  log "Installing proot-distro via pkg..."
  pkg install -y proot-distro
else
  log "proot-distro already installed, skipping."
fi

# 2. Install the Debian container if not already installed.
if proot-distro list 2>/dev/null | grep -qi "^${DISTRO}.*installed"; then
  log "proot-distro '${DISTRO}' container already installed, skipping."
else
  log "Installing proot-distro '${DISTRO}' container (this downloads a base rootfs, may take a while)..."
  proot-distro install "${DISTRO}"
fi

# 3. Install Ollama inside the container (idempotent: the official install
#    script is safe to re-run and no-ops / upgrades in place if already
#    installed). This uses the command from Ollama's own Linux install docs:
#    https://ollama.com/download/linux -- curl -fsSL https://ollama.com/install.sh | sh
log "Installing Ollama inside the ${DISTRO} container..."
proot-distro login "${DISTRO}" -- bash -lc '
  set -e
  if command -v ollama >/dev/null 2>&1; then
    echo "Ollama already installed in container, skipping install step."
  else
    echo "Running official Ollama install script..."
    curl -fsSL https://ollama.com/install.sh | sh
  fi
'

# 4. Start the Ollama server in the background (inside the container) if it
#    is not already running, then pull the requested model.
log "Starting Ollama server and pulling model '${MODEL}'..."
proot-distro login "${DISTRO}" -- bash -lc "
  set -e
  if pgrep -f 'ollama serve' >/dev/null 2>&1; then
    echo 'Ollama server already running.'
  else
    echo 'Starting ollama serve in the background...'
    nohup ollama serve > /tmp/ollama-serve.log 2>&1 &
    disown
    # Give the server a moment to bind before we try to talk to it.
    for i in \$(seq 1 20); do
      if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
  fi

  echo \"Pulling model '${MODEL}' (this can be several GB on first run)...\"
  ollama pull '${MODEL}'
"

log "Done. Ollama is running inside the '${DISTRO}' proot container with model '${MODEL}' pulled."
log "For future sessions (after closing Termux or restarting the container), run:"
log "  bash scripts/start_ollama.sh"
log "before starting 'doccrawler serve' or running 'doccrawler ask'."
