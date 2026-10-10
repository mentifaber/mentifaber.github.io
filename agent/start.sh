#!/bin/sh
# MENTIFABER AGENT 1.0 · pull the model from the site's R2 bucket (through /api/agent/weights), then serve it
# OpenAI-style on :8080. Downloads resume where they stopped; the size must match before the server starts.
set -u
M=/models/agent.gguf
mkdir -p /models
size() { if [ -f "$M" ]; then stat -c %s "$M"; else echo 0; fi; }
n=0
while [ "$(size)" != "${MODEL_SIZE:-0}" ]; do
  n=$((n + 1)); if [ "$n" -gt 10 ]; then echo "model download failed"; exit 1; fi
  curl -fsSL --retry 3 --retry-delay 2 -C - -o "$M" "$MODEL_URL" || sleep 3
  if [ "${MODEL_SIZE:-0}" = "0" ]; then break; fi
done
# -fa on + q8_0 cache: the conversation memory takes half the RAM, so twice as much context fits beside the weights
# --cache-reuse: a follow-up message reuses the already-read conversation instead of reading it all again
# --timeout 3600: a long reply on CPU can take many minutes; the server mustn't hang up first
exec /app/llama-server -m "$M" --host 0.0.0.0 --port 8080 -c "${CTX:-8192}" -t "${THREADS:-4}" --parallel 1 --jinja \
  -fa on --cache-type-k q8_0 --cache-type-v q8_0 --cache-reuse 256 -b 2048 -ub 512 --timeout 3600 \
  --alias "${ALIAS:-mentifaber-agent-1.0}"
