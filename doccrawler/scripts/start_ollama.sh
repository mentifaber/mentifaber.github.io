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

log "Starting Ollama server inside the '${DISTRO}' proot container..."
proot-distro login "${DISTRO}" -- bash -lc '
  set -e

  # A pgrep hit is not proof the server is usable -- a previous attempt can
  # crash under proot (e.g. OOM) and leave a dead/zombie process that still
  # shows up in the process table. Always confirm with a real HTTP probe
  # before deciding whether to (re)start it.
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "Ollama is already running and responding."
  else
    if pgrep -f "ollama serve" >/dev/null 2>&1; then
      echo "Found a stale ollama serve process that is not responding; restarting it."
      pkill -f "ollama serve" >/dev/null 2>&1 || true
      sleep 1
    fi
    nohup ollama serve > /tmp/ollama-serve.log 2>&1 &
    disown
    echo "Started ollama serve in the background (log: /tmp/ollama-serve.log inside the container)."
    ready=0
    for i in $(seq 1 20); do
      if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        echo "Ollama is responding on http://127.0.0.1:11434"
        ready=1
        break
      fi
      sleep 0.5
    done
    if [ "$ready" -ne 1 ]; then
      echo "Ollama did not respond after starting it. Last log lines:" >&2
      tail -n 30 /tmp/ollama-serve.log >&2 || true
      exit 1
    fi
  fi
'

log "Ollama should now be reachable at http://127.0.0.1:11434 from Termux."
log "You can now run 'doccrawler ask \"...\"' or 'doccrawler serve'."
