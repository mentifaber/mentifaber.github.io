# MENTIFABER AGENT 1.0: llama.cpp's official CPU server image; the model itself is pulled from R2 at start (start.sh).
FROM ghcr.io/ggml-org/llama.cpp:server
RUN command -v curl >/dev/null 2>&1 || (apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*)
COPY start.sh /start.sh
RUN chmod +x /start.sh
EXPOSE 8080
ENTRYPOINT ["/start.sh"]
