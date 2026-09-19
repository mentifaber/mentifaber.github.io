#!/data/data/com.termux/files/usr/bin/bash
# setup_ollama.sh -- one-time setup of Ollama for DocCrawler's The
# Librarian feature, running inside a proot-distro Debian container on Termux.
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
#
# Two earlier approaches both proved unreliable across proot-distro
# versions/devices: grepping `proot-distro list` output (its format isn't a
# stable contract), and guessing proot-distro's internal rootfs directory
# layout (it doesn't live at the path this script assumed on every
# version). The one thing that's actually guaranteed to mean "the container
# exists and works" is that we can log into it and run a command -- so use
# that as the source of truth instead of guessing proot-distro's internals.
if proot-distro login "${DISTRO}" -- true >/dev/null 2>&1; then
  log "proot-distro '${DISTRO}' container already installed and usable, skipping."
else
  log "Installing proot-distro '${DISTRO}' container (this downloads a base rootfs, may take a while)..."
  # Tolerate an "already exists" error from a container that's registered
  # but that our login probe above couldn't reach for some other reason,
  # rather than letting set -e kill the whole script over it.
  if ! proot-distro install "${DISTRO}"; then
    if proot-distro login "${DISTRO}" -- true >/dev/null 2>&1; then
      log "proot-distro install reported an error but the '${DISTRO}' container logs in fine; continuing."
    else
      log "proot-distro install failed and the '${DISTRO}' container is still not usable." >&2
      log "Try 'proot-distro reset ${DISTRO}' manually to force a clean reinstall, then re-run this script." >&2
      exit 1
    fi
  fi
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
#    is not already responding, then pull the requested model.
log "Starting Ollama server and pulling model '${MODEL}'..."
proot-distro login "${DISTRO}" -- bash -lc "
  set -e

  # A pgrep hit alone doesn't prove the server is usable -- a previous
  # attempt can crash under proot (e.g. OOM) and leave a dead/zombie
  # process still visible in the process table. Confirm with a real HTTP
  # probe before deciding whether to (re)start it.
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo 'Ollama server already running and responding.'
  else
    if pgrep -f 'ollama serve' >/dev/null 2>&1; then
      echo 'Found a stale ollama serve process that is not responding; restarting it.'
      pkill -f 'ollama serve' >/dev/null 2>&1 || true
      sleep 1
    fi
    echo 'Starting ollama serve in the background...'
    nohup ollama serve > /tmp/ollama-serve.log 2>&1 &
    disown
    # Give the server a moment to bind before we try to talk to it.
    ready=0
    for i in \$(seq 1 20); do
      if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        ready=1
        break
      fi
      sleep 0.5
    done
    if [ \"\$ready\" -ne 1 ]; then
      echo 'Ollama did not respond after starting it. Last log lines:' >&2
      tail -n 30 /tmp/ollama-serve.log >&2 || true
      exit 1
    fi
  fi

  echo \"Pulling model '${MODEL}' (this can be several GB on first run)...\"
  ollama pull '${MODEL}'
"

log "Done. Ollama is running inside the '${DISTRO}' proot container with model '${MODEL}' pulled."
log "For future sessions (after closing Termux or restarting the container), run:"
log "  bash scripts/start_ollama.sh"
log "before starting 'doccrawler serve' or running 'doccrawler ask'."
