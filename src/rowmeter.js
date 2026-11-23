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

// The counts above live in memory, and an object that goes quiet is evicted, so they'd only ever cover "since it last
// woke". keep() folds them into a running total for the UTC day in the object's own storage, at most every 30 seconds
// (one row written each time), and touch() also schedules one last fold shortly after activity stops, before the object
// is evicted; dayReport() is that total plus what hasn't been folded in yet.
const dayKey = () => "rows:" + new Date().toISOString().slice(0, 10);
export async function keep(bag, storage, force) {
  if (!storage || !storage.get || (!force && Date.now() - (bag.saved || bag.at) < 30e3)) return;
  settle(bag); bag.saved = Date.now(); if (!bag.by.size) return;
  const k = dayKey(), cur = (await storage.get(k)) || {};
  for (const [sql, e] of bag.by) { const c = cur[sql] || { calls: 0, rows: 0 }; c.calls += e.calls; c.rows += e.rows; cur[sql] = c; }
  const top = Object.entries(cur).sort((a, b) => b[1].rows - a[1].rows).slice(0, 150); // a day's shapes, the heaviest kept
  await storage.put(k, Object.fromEntries(top)); bag.by = new Map(); bag.day = k; bag.dayRows = top.reduce((t, [, e]) => t + e.rows, 0);
}
// a daily budget for an object's own BACKGROUND work (alarms, scheduled jobs): when today's rows read pass its share, the
// background waits for 00:00 UTC, so it can never spend the allowance the people using the site need. Requests aren't gated.
export function spent(bag) {
  let n = bag.day === dayKey() ? bag.dayRows || 0 : 0;
  for (const e of bag.by.values()) n += e.rows; for (const [, c] of bag.cs) n += +(c && c.rowsRead) || 0;
  return n;
}
export const over = async (bag, share) => { if (bag.loading) await bag.loading; return spent(bag) >= share; };
export const nextDay = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 5); }; // 00:05 UTC
export function touch(bag, storage) {
  if (storage && storage.get && bag.day !== dayKey() && !bag.loading) { // woke up (or a new day): learn what today has spent already
    const k = dayKey(); bag.loading = Promise.resolve(storage.get(k)).then((cur) => { bag.day = k; bag.dayRows = Object.values(cur || {}).reduce((t, e) => t + e.rows, 0); }).catch(() => {}).finally(() => { bag.loading = null; });
  }
  keep(bag, storage).catch(() => {});
  if (!bag.timer && typeof setTimeout === "function") { bag.timer = setTimeout(() => { bag.timer = null; keep(bag, storage, true).catch(() => {}); }, 20e3); if (bag.timer && bag.timer.unref) bag.timer.unref(); }
}
export async function dayReport(bag, storage) {
  if (storage && storage.get && bag.day !== dayKey()) { const cur0 = (await storage.get(dayKey())) || {}; bag.day = dayKey(); bag.dayRows = Object.values(cur0).reduce((t, e) => t + e.rows, 0); }
  await keep(bag, storage, true); const cur = (storage && storage.get && (await storage.get(dayKey()))) || {};
  const all = Object.entries(cur).map(([sql, e]) => ({ sql, ...e }));
  return { day: dayKey().slice(5), limit: 5e6, rows: all.reduce((t, x) => t + x.rows, 0), calls: all.reduce((t, x) => t + x.calls, 0), top: all.sort((a, b) => b.rows - a.rows).slice(0, 30) };
}
