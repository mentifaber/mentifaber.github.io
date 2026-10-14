// Genesis's own record of the world. Every 15 minutes it reads GDELT's newest event file (world news, machine-coded every
// 15 minutes) and, until it holds a week, a dozen older ones, and keeps hourly counts in its own storage: violence by
// country, and how the big powers deal with each other (cooperation, demands, threats, shows of force, violence, and the
// Goldstein tone of it all). From that it can say whether a conflict is rising or levelling off, and whether friction
// between two powers is above its own baseline: measured against what it has seen, not guessed.
import { unzipFirst } from "./vigil.js";

const FILE = 900e3, HOUR = 3600e3, DAY = 864e5, WEEK = 7 * DAY, KEEP = 15 * DAY;
const NATO = "USA GBR FRA DEU POL ITA CAN TUR ESP NLD BEL NOR DNK ROU CZE LTU LVA EST FIN SWE GRC PRT HUN SVK BGR HRV SVN ALB MNE MKD LUX ISL EUR".split(" ");
// [key, side A, side B, how to say it]; an event counts for a pair when one actor is on each side (either way round)
export const DYADS = [
  ["USA-RUS", ["USA"], ["RUS"], "United States – Russia"], ["NATO-RUS", NATO, ["RUS"], "NATO and Europe – Russia"], ["USA-CHN", ["USA"], ["CHN"], "United States – China"],
  ["CHN-TWN", ["CHN"], ["TWN"], "China – Taiwan"], ["RUS-UKR", ["RUS"], ["UKR"], "Russia – Ukraine"], ["USA-IRN", ["USA"], ["IRN"], "United States – Iran"], ["ISR-IRN", ["ISR"], ["IRN"], "Israel – Iran"],
  ["IND-PAK", ["IND"], ["PAK"], "India – Pakistan"], ["PRK-OPP", ["PRK"], ["KOR", "USA", "JPN"], "North Korea – South Korea, US, Japan"], ["CHN-JPN", ["CHN"], ["JPN"], "China – Japan"],
  ["CHN-PHL", ["CHN"], ["PHL"], "China – Philippines"], ["CHN-IND", ["CHN"], ["IND"], "China – India"],
];
const GREAT = new Set(["USA-RUS", "NATO-RUS", "USA-CHN", "CHN-TWN", "USA-IRN", "ISR-IRN", "IND-PAK", "PRK-OPP", "CHN-IND"]); // pairs whose friction is worth a phone alert
export function worldTables(q) {
  q.exec("CREATE TABLE IF NOT EXISTS gdf(name TEXT PRIMARY KEY, ts INTEGER, rows INTEGER)"); // files read
  q.exec("CREATE TABLE IF NOT EXISTS gdh(h INTEGER, k TEXT, n INTEGER, m INTEGER, q3 INTEGER, q4 INTEGER, v INTEGER, th INTEGER, gs REAL, PRIMARY KEY(h, k))"); // hourly counts
}
const stamp = (t) => new Date(t).toISOString().replace(/[-:T]/g, "").slice(0, 14);
const unstamp = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
const country = (full) => { const s = String(full || "").split(",").map((x) => x.trim()).filter(Boolean); return s.length ? s[s.length - 1].replace(/ \(general\)$/, "") : ""; };
// one export file → counts. Columns (GDELT 2.0 events): 7/17 actor countries, 28 root code, 29 quad class, 30 Goldstein,
// 31 mentions, 52 where it happened. Root codes 18–20 are violence; 13 threats and 15 shows of force.
export function digest(text) {
  const c = new Map(), d = new Map(), g = { n: 0, v: 0 };
  for (const line of String(text || "").split("\n")) {
    const f = line.split("\t"); if (f.length < 61) continue; g.n++;
    const root = +f[28], quad = +f[29], gs = +f[30] || 0, mn = +f[31] || 1, viol = root >= 18 && root <= 20;
    if (viol) { g.v++; const name = country(f[52]); if (name) { const x = c.get(name) || { n: 0, m: 0 }; x.n++; x.m += mn; c.set(name, x); } }
    const a1 = f[7], a2 = f[17]; if (!a1 || !a2 || a1 === a2) continue;
    for (const [k, A, B] of DYADS) if ((A.includes(a1) && B.includes(a2)) || (A.includes(a2) && B.includes(a1))) {
      const x = d.get(k) || { n: 0, m: 0, q3: 0, q4: 0, v: 0, th: 0, gs: 0 };
      x.n++; x.m += mn; if (quad === 3) x.q3++; if (quad === 4) x.q4++; if (viol) x.v++; if (root === 13 || root === 15) x.th++; x.gs += gs; d.set(k, x);
    }
  }
  return { c, d, g };
}
function record(q, hour, dg) {
  const up = (k, o) => q.exec("INSERT INTO gdh(h,k,n,m,q3,q4,v,th,gs) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(h,k) DO UPDATE SET n=n+excluded.n, m=m+excluded.m, q3=q3+excluded.q3, q4=q4+excluded.q4, v=v+excluded.v, th=th+excluded.th, gs=gs+excluded.gs",
    hour, k, o.n | 0, o.m | 0, o.q3 | 0, o.q4 | 0, o.v | 0, o.th | 0, Math.round((o.gs || 0) * 10) / 10);
  up("g", { n: dg.g.n, v: dg.g.v });
  for (const [name, x] of dg.c) up("c:" + name.slice(0, 60), x);
  for (const [k, x] of dg.d) up("d:" + k, x);
}
// read the newest file and, until a week is on file, older ones (newest first); a file GDELT never published counts as read
export async function ingest(h, max = 16) {
  if (h._world) return { read: 0, busy: true }; h._world = true; // the 15-minute watch and the hourly tick can overlap: one reader at a time, or a file is counted twice
  try { return await ingestNow(h, max); } finally { h._world = false; }
}
async function ingestNow(h, max) {
  const q = h.sql(); worldTables(q);
  const lu = await fetch("https://data.gdeltproject.org/gdeltv2/lastupdate.txt", { signal: AbortSignal.timeout(10000) });
  const m = /(\d{14})\.export\.CSV\.zip/.exec(lu.ok ? await lu.text() : ""); if (!m) throw new Error("GDELT lists no export file" + (lu.ok ? "" : " (" + lu.status + ")"));
  const top = unstamp(m[1]), have = new Set(q.exec("SELECT name FROM gdf WHERE ts > ?", top - WEEK).toArray().map((r) => r.name)), want = [];
  for (let t = top; t > top - WEEK && want.length < max; t -= FILE) if (!have.has(stamp(t))) want.push(t);
  let read = 0, rows = 0, failed = 0;
  for (const t of want) {
    let text = "";
    try { const r = await fetch("https://data.gdeltproject.org/gdeltv2/" + stamp(t) + ".export.CSV.zip", { signal: AbortSignal.timeout(20000) }); if (r.ok) text = await unzipFirst(await r.arrayBuffer()); else if (r.status !== 404) { failed++; continue; } }
    catch (e) { failed++; continue; }
    const dg = digest(text); record(q, Math.floor(t / HOUR) * HOUR, dg); q.exec("INSERT OR REPLACE INTO gdf(name,ts,rows) VALUES(?,?,?)", stamp(t), t, dg.g.n); read++; rows += dg.g.n;
  }
  const cut = Date.now() - KEEP; q.exec("DELETE FROM gdh WHERE h < ?", cut); q.exec("DELETE FROM gdf WHERE ts < ?", cut);
  return { read, rows, failed, files: have.size + read, week: 7 * 96, latest: top };
}

// ── reading the record ──
const F = (n) => Math.round(n).toLocaleString("en-US"), P = (x) => (x >= 0 ? "+" : "") + Math.round(x * 100) + "%";
export function trends(h) {
  const q = h.sql(); worldTables(q);
  const cur = Math.floor(Date.now() / HOUR) * HOUR + HOUR, d24 = cur - DAY, d7 = cur - WEEK;
  const files = (a, b) => q.exec("SELECT COUNT(*) c FROM gdf WHERE ts >= ? AND ts < ?", a, b).one().c;
  const f24 = files(d24, cur), fb = files(d7, d24), all = f24 + fb;
  if (!f24) return { files: all, week: 672, empty: true };
  const scale24 = 96 / f24, scaleB = fb ? 96 / fb : 0; // everything as "per day", so a part-filled week compares fairly
  const sums = (a, b, like) => new Map(q.exec("SELECT k, SUM(n) n, SUM(m) m, SUM(q3) q3, SUM(q4) q4, SUM(v) v, SUM(th) th, SUM(gs) gs FROM gdh WHERE h >= ? AND h < ? AND k LIKE ? GROUP BY k", a, b, like).toArray().map((r) => [r.k, r]));
  const g24 = sums(d24, cur, "g").get("g") || { n: 0, v: 0 }, gb = sums(d7, d24, "g").get("g") || { n: 0, v: 0 };
  const global = { day: g24.v * scale24, base: fb ? gb.v * scaleB : null };
  // countries: violence per day, last 24 h vs the days before, with a daily line for the week
  const c24 = sums(d24, cur, "c:%"), cb = sums(d7, d24, "c:%"), daily = new Map();
  for (const r of q.exec("SELECT k, (h - ?) / ? AS d, SUM(n) n FROM gdh WHERE h >= ? AND k LIKE 'c:%' GROUP BY k, d", d7, DAY, d7).toArray()) { const a = daily.get(r.k) || new Array(7).fill(0); a[Math.min(6, Math.max(0, Math.floor(r.d)))] += r.n; daily.set(r.k, a); }
  const perDayFiles = new Array(7).fill(0); for (const r of q.exec("SELECT (ts - ?) / ? AS d, COUNT(*) c FROM gdf WHERE ts >= ? GROUP BY d", d7, DAY, d7).toArray()) perDayFiles[Math.min(6, Math.max(0, Math.floor(r.d)))] += r.c;
  const countries = [...c24.entries()].map(([k, r]) => { const b = cb.get(k), day = r.n * scale24, base = fb ? (b ? b.n : 0) * scaleB : null;
    return { name: k.slice(2), day: Math.round(day), base: base == null ? null : Math.round(base * 10) / 10, change: base ? day / base - 1 : null, spark: (daily.get(k) || []).map((n, i) => (perDayFiles[i] ? Math.round(n * 96 / perDayFiles[i]) : null)) }; })
    .sort((a, b) => b.day - a.day);
  const lifted = countries.filter((c) => c.day >= 15 && c.base != null).map((c) => ({ ...c, lift: (c.day + 5) / (c.base + 5) })).sort((a, b) => b.lift - a.lift), movers = lifted.filter((c) => c.lift >= 1.3);
  // pairs of powers: how much of what passed between them was hostile, and is that more than usual?
  const d24s = sums(d24, cur, "d:%"), dbs = sums(d7, d24, "d:%");
  const dyads = DYADS.map(([k, , , label]) => {
    const r = d24s.get("d:" + k) || { n: 0, q3: 0, q4: 0, v: 0, th: 0, gs: 0 }, b = dbs.get("d:" + k) || { n: 0, q3: 0, q4: 0, v: 0, th: 0, gs: 0 };
    const hs = r.n ? (r.q3 + r.q4) / r.n : null, hb = b.n ? (b.q3 + b.q4) / b.n : null, th = r.th * scale24, thb = fb ? b.th * scaleB : null, v = r.v * scale24, vb = fb ? b.v * scaleB : null;
    let trend = "steady";
    if (r.n * scale24 < 6) trend = "quiet";
    else if (hb == null || b.n < 12) trend = "new";
    else if (hs - hb >= 0.08 || (th >= 3 && th >= 2 * (thb || 0)) || (v >= 3 && v >= 2.5 * (vb || 0))) trend = "rising";
    else if (hb - hs >= 0.08) trend = "easing";
    return { k, label, n: Math.round(r.n * scale24), nBase: fb ? Math.round(b.n * scaleB) : null, hostile: hs, hostileBase: hb, tone: r.n ? r.gs / r.n : null, toneBase: b.n ? b.gs / b.n : null, threats: Math.round(th * 10) / 10, threatsBase: thb == null ? null : Math.round(thb * 10) / 10, violent: Math.round(v * 10) / 10, violentBase: vb == null ? null : Math.round(vb * 10) / 10, trend, great: GREAT.has(k) };
  });
  return { at: Date.now(), files: all, week: 672, f24, fb, days: Math.round(all / 96 * 10) / 10, global, countries: countries.slice(0, 16), movers: movers.slice(0, 6), easing: lifted.slice().reverse().filter((c) => c.lift < 0.77).slice(0, 4), dyads };
}
// the record in words, for Genesis to reason from
export function worldText(t) {
  if (!t || t.empty) return "GENESIS'S WORLD RECORD: nothing on file yet (Genesis starts counting GDELT's world-news events on its next 15-minute watch).";
  const pct = (a, b) => (b ? " vs " + F(b) + "/day before (" + P(a / b - 1) + ")" : "");
  const lines = ["GENESIS'S OWN WORLD RECORD (Genesis counts GDELT's 15-minute world-news event files itself and keeps hourly tallies; " + t.files + " of the last " + t.week + " files on file, about " + t.days + " days" + (t.fb ? "" : "; no baseline yet, so no trends") + "):",
    "Violence reported worldwide: " + F(t.global.day) + " events in the last 24 h" + (t.global.base ? pct(t.global.day, t.global.base) + (Math.abs(t.global.day / t.global.base - 1) < 0.12 ? ": roughly level" : t.global.day > t.global.base ? ": up" : ": down") : "") + ".",
    "Where, last 24 h: " + t.countries.slice(0, 10).map((c) => c.name + " " + F(c.day) + (c.base ? " (" + P(c.change) + ")" : "")).join(", ") + "."];
  if (t.movers.length && t.fb) lines.push("Rising fastest against their own baseline: " + t.movers.slice(0, 5).map((c) => c.name + " " + F(c.day) + "/day vs " + F(c.base)).join(", ") + (t.easing.length ? ". Easing: " + t.easing.map((c) => c.name + " " + F(c.day) + " vs " + F(c.base)).join(", ") : "") + ".");
  lines.push("Between powers (per day; hostile = the share of reported dealings that were demands, threats, shows of force or violence; tone is Goldstein, −10 hostile to +10 cooperative):");
  for (const d of t.dyads.filter((x) => x.n >= 3 || x.great)) lines.push("- " + d.label + ": " + (d.n < 3 ? "barely in the news" : d.n + " interactions" + (d.nBase != null ? " (usually " + d.nBase + ")" : "") + ", " + Math.round(d.hostile * 100) + "% hostile" + (d.hostileBase != null ? " (baseline " + Math.round(d.hostileBase * 100) + "%)" : "") +
    ", " + d.threats + " threats or shows of force" + (d.threatsBase != null ? " (baseline " + d.threatsBase + ")" : "") + ", " + d.violent + " violent" + (d.violentBase != null ? " (baseline " + d.violentBase + ")" : "") + ", tone " + (d.tone == null ? "?" : d.tone.toFixed(1)) + (d.toneBase != null ? " (baseline " + d.toneBase.toFixed(1) + ")" : "")) + ": " + d.trend + ".");
  lines.push("How to read it: machine-coded from news reports, so it tracks attention as much as events. Compare each line with its own baseline, not with other lines; a spike in coverage isn't proof of escalation.");
  return lines.join("\n");
}
// what's worth telling him without being asked: a great-power pair clearly above its own baseline (at most once a day per pair)
export function frictionEvents(t) {
  if (!t || t.empty || t.days < 3) return [];
  return t.dyads.filter((d) => d.great && d.trend === "rising" && d.n >= 25 && (d.hostile - (d.hostileBase || 0) >= 0.12 || d.violent >= 3)).map((d) => ({
    key: "fr:" + d.k + ":" + new Date().toISOString().slice(0, 10), cat: "world", level: "notable", view: "world", title: "⚑ " + d.label + ": friction above normal",
    text: d.label + ": " + Math.round(d.hostile * 100) + "% of reported dealings hostile in the last 24 h (baseline " + Math.round((d.hostileBase || 0) * 100) + "%), " + d.threats + " threats or shows of force, " + d.violent + " violent (GDELT, Genesis's own count)" }));
}
