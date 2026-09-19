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
  if pgrep -f "ollama serve" >/dev/null 2>&1; then
    echo "Ollama server is already running."
  else
    nohup ollama serve > /tmp/ollama-serve.log 2>&1 &
    disown
    echo "Started ollama serve in the background (log: /tmp/ollama-serve.log inside the container)."
    for i in $(seq 1 20); do
      if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        echo "Ollama is responding on http://127.0.0.1:11434"
        break
      fi
      sleep 0.5
    done
  fi
'

log "Ollama should now be reachable at http://127.0.0.1:11434 from Termux."
log "You can now run 'doccrawler ask \"...\"' or 'doccrawler serve'."
