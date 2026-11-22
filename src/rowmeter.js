// Rows read, per statement. On the free plan every Durable Object on the account shares 5 million SQLite rows read a day;
// past that, every object fails until 00:00 UTC ("Exceeded allowed rows read in Durable Objects free tier"). Cloudflare
// reports rowsRead on each cursor, so this wraps an object's SQL handle and adds them up by statement, to show which
// queries spend the allowance (GET /api/hive/rows, /api/tether/rows, /api/nest/rows: statement shapes and counts only).
export function metered(sql, bag) {
  return {
    exec(q, ...a) { const c = sql.exec(q, ...a); bag.cs.push([q, c]); if (bag.cs.length > 2000) settle(bag); return c; },
    get databaseSize() { return sql.databaseSize; },
  };
}
export const newBag = () => ({ at: Date.now(), cs: [], by: new Map() });
export function settle(bag) {
  for (const [q, c] of bag.cs) {
    const k = String(q).replace(/\s+/g, " ").trim().slice(0, 100), e = bag.by.get(k) || { calls: 0, rows: 0 };
    e.calls++; e.rows += +(c && c.rowsRead) || 0; bag.by.set(k, e);
  }
  bag.cs = [];
}
export function report(bag) {
  settle(bag); const all = [...bag.by].map(([sql, e]) => ({ sql, ...e }));
  return { since: new Date(bag.at).toISOString(), rows: all.reduce((t, x) => t + x.rows, 0), calls: all.reduce((t, x) => t + x.calls, 0), top: all.sort((a, b) => b.rows - a.rows).slice(0, 30) };
}
