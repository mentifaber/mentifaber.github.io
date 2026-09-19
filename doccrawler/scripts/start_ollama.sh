#!/data/data/com.termux/files/usr/bin/bash
# start_ollama.sh -- start the Ollama server inside the proot-distro Debian
# container for a new Termux session. Ollama does not auto-start after a
# container restart, so run this once per session before using
# `doccrawler ask` or `doccrawler serve`.
#
# Usage:
#   bash scripts/start_ollama.sh
set -euo pipefail

DISTRO="debian"

log() { echo -e "\n==> $*"; }

if ! command -v proot-distro >/dev/null 2>&1; then
  echo "proot-distro is not installed. Run scripts/setup_ollama.sh first." >&2
  exit 1
fi

# IMPORTANT: `proot` traces its child process tree with ptrace. Backgrounding
# `ollama serve` *inside* a `proot-distro login ... -- bash -lc '...'`
# session (with nohup/disown run from inside that session) does not
# actually detach it -- when that login session's own shell exits, proot
# tears down its whole traced process tree, killing the "backgrounded"
# Ollama along with it. A `curl` check run inside the same session succeeds
# because it happens before the session exits, which made this look like
# it worked right up until the script returned and Ollama was gone.
#
# The fix is to background the entire `proot-distro login ... -- ollama
# serve` invocation at the outer Termux shell instead, so the process tree
# is a background job of this shell/session and survives the script
# finishing. proot does not isolate networking, so `curl` against
# 127.0.0.1:11434 from Termux directly reaches the server inside the
# container -- no need to go through `proot-distro login` for that, or for
# finding/killing a stale process (it's a normal process from Termux's
# point of view too).
OLLAMA_LOG="${PREFIX:-/data/data/com.termux/files/usr}/tmp/doccrawler-ollama-serve.log"

log "Starting Ollama server inside the '${DISTRO}' proot container..."

if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  log "Ollama is already running and responding."
else
  # Anchored (^...$) so this matches only a process whose *entire* command
  # line is exactly "ollama serve" -- an unanchored substring match also
  # matches wrapper scripts that merely mention that text.
  if pgrep -f "^ollama serve$" >/dev/null 2>&1; then
    log "Found a stale ollama serve process that is not responding; restarting it."
    pkill -f "^ollama serve$" >/dev/null 2>&1 || true
    sleep 1
  fi
  nohup proot-distro login "${DISTRO}" -- ollama serve > "${OLLAMA_LOG}" 2>&1 &
  disown
  log "Started ollama serve in the background (log: ${OLLAMA_LOG})."
  ready=0
  for i in $(seq 1 40); do
    if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
      log "Ollama is responding on http://127.0.0.1:11434"
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

log "Ollama should now be reachable at http://127.0.0.1:11434 from Termux."
log "You can now run 'doccrawler ask \"...\"' or 'doccrawler serve'."
