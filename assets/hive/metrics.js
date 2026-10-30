// How fast a reply came, measured honestly. Throughput is characters over the generation window (first word to last),
// and only when there is a real window to measure: at least 250 ms and 3 chunks. A reply that arrives in one burst (a
// provider that buffers, a fallback that answers whole) has no meaningful rate, so it is reported as a burst instead of
// a number like 909,024 ch/s.
(function (root) {
  function speedOf(chars, ttft, tLast, chunks) {
    const win = tLast - ttft;
    if (!chars || !ttft || !(win >= 250) || !(chunks >= 3)) return { cps: 0, burst: !!(chars && ttft) };
    return { cps: Math.round(chars / (win / 1000)), burst: false };
  }
  const api = { speedOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HiveMetrics = api;
})(typeof window !== "undefined" ? window : globalThis);
