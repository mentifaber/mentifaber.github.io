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

# 4. Start the Ollama server if it is not already responding, then pull the
#    requested model.
#
# IMPORTANT: `proot` traces its child process tree with ptrace. An earlier
# version of this script backgrounded `ollama serve` *inside* a
# `proot-distro login ... -- bash -lc '...'` session (nohup/disown run from
# inside that session). That does not actually detach it: when the login
# session's own shell exits, proot tears down its whole traced process
# tree, killing the "backgrounded" Ollama along with it. The `curl` check
# run inside that same session succeeded because it ran before the session
# exited, which made this look like it worked right up until the script
# returned and Ollama was gone.
#
# Fix: background the entire `proot-distro login ... -- ollama serve`
# invocation at this outer Termux shell instead, so it's a background job
# of this shell/session and survives the script finishing. proot does not
# isolate networking, so `curl` against 127.0.0.1:11434 from Termux
# directly reaches the server inside the container -- no need to go
# through `proot-distro login` for that, or for finding/killing a stale
# process (it's a normal process from Termux's point of view too).
OLLAMA_LOG="${PREFIX:-/data/data/com.termux/files/usr}/tmp/doccrawler-ollama-serve.log"

log "Starting Ollama server..."
if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  log "Ollama server already running and responding."
else
  # Anchored (^...$) so this matches only a process whose *entire* command
  # line is exactly "ollama serve" -- an unanchored substring match also
  # matches wrapper scripts that merely mention that text.
  if pgrep -f "^ollama serve$" >/dev/null 2>&1; then
    log "Found a stale ollama serve process that is not responding; restarting it."
    pkill -f "^ollama serve$" >/dev/null 2>&1 || true
    sleep 1
  fi
  log "Starting ollama serve in the background (log: ${OLLAMA_LOG})..."
  # Use `bash -lc` (a login shell) for the actual exec, not a raw
  # `-- ollama serve`. A raw exec skips whatever the login wrapper does to
  # set up the container's environment (HOME=/root and friends), so an
  # earlier version of this script that dropped the login shell to fix
  # proot's ptrace-teardown issue ended up with `ollama serve` inheriting
  # Termux's own $HOME instead of the container's -- OLLAMA_MODELS then
  # defaulted to the wrong (empty) directory and every chat request
  # 404'd with "model not found" despite Ollama itself being reachable.
  nohup proot-distro login "${DISTRO}" -- bash -lc 'exec ollama serve' > "${OLLAMA_LOG}" 2>&1 &
  disown
  ready=0
  for i in $(seq 1 40); do
    if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 0.5
  done
  if [ "${ready}" -ne 1 ]; then
    log "Ollama did not respond after starting it. Last log lines:"
    tail -n 30 "${OLLAMA_LOG}" >&2 || true
    exit 1
  fi
fi

log "Pulling model '${MODEL}' (this can be several GB on first run)..."
proot-distro login "${DISTRO}" -- ollama pull "${MODEL}"

log "Done. Ollama is running inside the '${DISTRO}' proot container with model '${MODEL}' pulled."
log "For future sessions (after closing Termux or restarting the container), run:"
log "  bash scripts/start_ollama.sh"
log "before starting 'doccrawler serve' or running 'doccrawler ask'."
