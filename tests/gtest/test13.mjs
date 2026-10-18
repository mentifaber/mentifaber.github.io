// Markets (any ticker, crypto fallback, chat material for owner and visitors, watchlist + big-move alerts) and Genesis's
// world record (GDELT ingest over a simulated week, trends, great-power friction, alerts, chat material, health check).
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
const ok = (m) => console.log("  ✓ " + m);
// ── upstream mocks ──
const now = Date.now(), TOP = Math.floor(now / 900e3) * 900e3 - 900e3, stamp = (t) => new Date(t).toISOString().replace(/[-:T]/g, "").slice(0, 14);
const yahooMeta = { XOM: { p: 177.01, prev: 174.08, pct: 1.683, name: "ExxonMobil Holdings Corporation", type: "EQUITY", ex: "NYSE" }, "^GSPC": { p: 7718.94, prev: 7805.45, pct: -1.108, name: "S&P 500", type: "INDEX", ex: "SNP" }, "XRP-USD": { p: 1.3332, prev: 1.3646, pct: -2.679, name: "XRP USD", type: "CRYPTOCURRENCY", ex: "CCC" }, NVDA: { p: 212.4, prev: 196.2, pct: 8.26, name: "NVIDIA Corporation", type: "EQUITY", ex: "NasdaqGS" } };
let yahooDown = new Set(), gdeltCalls = 0, fileHits = new Map();
const zip = (text) => { const data = deflateRawSync(Buffer.from(text)), name = Buffer.from("x.export.CSV"); const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(text.length, 22); lh.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(text.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42);
  const cdOff = lh.length + name.length + data.length, eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(1, 8); eo.writeUInt16LE(1, 10); eo.writeUInt32LE(cd.length + name.length, 12); eo.writeUInt32LE(cdOff, 16);
  return Buffer.concat([lh, name, data, cd, name, eo]); };
const row = (a1, a2, root, quad, gs, place) => { const c = new Array(61).fill(""); c[7] = a1; c[17] = a2; c[26] = root + "0"; c[28] = root; c[29] = String(quad); c[30] = String(gs); c[31] = "4"; c[52] = place || ""; c[60] = "https://news.example/x"; return c.join("\t"); };
function gdeltFile(t) { // a simulated week: steady until the last 24 h, when US–Russia turns hostile and Sudan flares
  const recent = TOP - t < 24 * 3600e3, rows = [];
  for (let i = 0; i < 6; i++) rows.push(row("UKR", "RUS", "19", 4, -10, "Kharkiv, Kharkivs'ka Oblast', Ukraine"));
  for (let i = 0; i < (recent ? 8 : 2); i++) rows.push(row("SDN", "", "19", 4, -10, "Khartoum, Khartoum, Sudan"));
  for (let i = 0; i < 6; i++) rows.push(row("USA", "RUS", recent ? (i < 2 ? "13" : i < 4 ? "11" : "04") : (i < 1 ? "11" : "04"), recent ? (i < 4 ? 3 : 1) : (i < 2 ? 3 : 1), recent ? -4 : 1, "Washington, District of Columbia, United States"));
  for (let i = 0; i < 4; i++) rows.push(row("USA", "CHN", "04", 1, 2, "Beijing, Beijing, China"));
  for (let i = 0; i < 10; i++) rows.push(row("FRA", "DEU", "05", 1, 3, "Paris, Ile-de-France, France"));
  return rows.join("\n") + "\n";
}
globalThis.fetch = async (u) => {
  const url = typeof u === "string" ? u : u.url, J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "content-type": "application/json" } });
  let m = /finance\.yahoo\.com\/v8\/finance\/chart\/([^?]+)/.exec(url);
  if (m) { const s = decodeURIComponent(m[1]), y = yahooMeta[s]; if (!y || yahooDown.has(s)) return J({ chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } }, 404);
    return J({ chart: { result: [{ meta: { currency: "USD", symbol: s, exchangeName: y.ex, fullExchangeName: y.ex, instrumentType: y.type, regularMarketTime: Math.floor(now / 1000) - 120, regularMarketPrice: y.p, regularMarketChangePercent: y.pct, chartPreviousClose: y.prev, previousClose: y.prev, longName: y.name, regularMarketDayHigh: y.p * 1.01, regularMarketDayLow: y.p * 0.98, fiftyTwoWeekHigh: y.p * 1.2, fiftyTwoWeekLow: y.p * 0.7, currentTradingPeriod: { regular: { start: Math.floor(now / 1000) - 3600, end: Math.floor(now / 1000) + 3600 } } }, timestamp: [1, 2, 3], indicators: { quote: [{ close: [y.prev, (y.prev + y.p) / 2, y.p] }] } }], error: null } }); }
  if (/finance\.yahoo\.com\/v1\/finance\/search/.test(url)) return J({ quotes: /rheinmetall/i.test(url) ? [{ symbol: "RHM.DE", quoteType: "EQUITY" }] : [] });
  if (/coingecko\.com\/api\/v3\/coins\/markets/.test(url)) return J([{ id: "ripple", name: "XRP", current_price: 1.33, price_change_24h: -0.035, price_change_percentage_24h: -2.54, high_24h: 1.38, low_24h: 1.32, last_updated: new Date().toISOString(), sparkline_in_7d: { price: [1.4, 1.38, 1.35, 1.33] } }]);
  if (/frankfurter/.test(url)) return J({ rates: { EUR: 0.92, GBP: 0.78 } });
  if (/gdeltv2\/lastupdate\.txt/.test(url)) { gdeltCalls++; return new Response("92583 x http://data.gdeltproject.org/gdeltv2/" + stamp(TOP) + ".export.CSV.zip\n"); }
  m = /gdeltv2\/(\d{14})\.export\.CSV\.zip/.exec(url);
  if (m) { fileHits.set(m[1], (fileHits.get(m[1]) || 0) + 1); const t = Date.UTC(+m[1].slice(0, 4), +m[1].slice(4, 6) - 1, +m[1].slice(6, 8), +m[1].slice(8, 10), +m[1].slice(10, 12)); if (m[1].endsWith("3000") && t % (6 * 3600e3) === 1800e3) return new Response("missing", { status: 404 }); return new Response(zip(gdeltFile(t))); }
  return J({}, 404);
};
const H = await import("./harness.mjs"); const { call, calls, db, hive, env } = H;
const M = await import("./src/markets.js"), W = await import("./src/hive-world.js"), { Genesis } = await import("./src/hive-genesis.js");

// ── markets ──
let qs = await M.quotes(["XOM", "XRP-USD"]);
assert.equal(qs[0].price, 177.01); assert.equal(qs[0].prev, 174.08); assert.equal(qs[0].chg, 2.93); assert.equal(qs[0].pct, 1.68); assert.equal(qs[0].kind, "stock"); assert.equal(qs[0].open, true); assert.equal(qs[0].spark.length, 3);
assert.equal(qs[1].kind, "crypto"); assert.equal(qs[1].price, 1.3332); ok("Yahoo: XOM $177.01 +2.93 (+1.68%), XRP $1.3332, with day range and sparkline");
assert.match(M.quoteText(qs[0]), /^XOM — ExxonMobil Holdings Corporation \(NYSE, stock\): \$177\.01, \+2\.93 \(\+1\.68%\) on the day; day range .+; 52-week .+; market open \[Yahoo Finance\]$/);
assert.match(M.quoteText(qs[1]), /XRP-USD — XRP USD .*\$1\.3332, .*\(-2\.68%\) since 00:00 UTC; .*trades around the clock/); ok("quote lines say what changed, over what window, and whether the market is open");
yahooDown.add("XRP-USD"); qs = await M.quotes(["XRP-USD"]); assert.equal(qs[0].src, "CoinGecko"); assert.equal(qs[0].pct, -2.54); assert.equal(qs[0].window, "24h"); yahooDown.clear(); ok("crypto falls back to CoinGecko (24 h change) when Yahoo has nothing");
qs = await M.quotes(["ZZZZ"]); assert.ok(qs[0].error); ok("an unknown symbol is reported as such, not invented");
assert.deepEqual(await M.symbolsFor("What is Rheinmetall stock at?"), ["RHM.DE"]); ok("names are looked up (Rheinmetall → RHM.DE)");

// owner chat: the exact question from his transcript
let r = await call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", messages: [{ role: "user", text: "Hey real quick what are stock markets looking like for XRP and XOM?" }] });
let sys = calls[calls.length - 1].sys; assert.match(sys, /XOM — ExxonMobil.*\$177\.01/); assert.match(sys, /XRP-USD — XRP USD.*\$1\.3332/); assert.ok(r.tools.some((t) => /markets/.test(t)), JSON.stringify(r.tools)); ok("his question “XRP and XOM” now brings both quotes as MATERIAL");
// visitor chat
r = await call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", messages: [{ role: "user", text: "What's the price of NVDA today?" }] }, false, { "cf-connecting-ip": "198.51.100.7" });
sys = calls[calls.length - 1].sys; assert.match(sys, /LIVE QUOTES, read just now:\nNVDA — NVIDIA Corporation/); assert.ok(r.tools.includes("checked prices for NVDA")); ok("visitors get live quotes too (public data)");
// watchlist: saved, quoted, and big moves alert once
r = await call("/genesis/watchlist", { symbols: ["nvda", "XOM", "bad symbol!", "XRP-USD"] }); assert.deepEqual(r.symbols, ["NVDA", "XOM", "XRP-USD"]);
r = await call("/genesis/watchlist?quotes=1"); assert.equal(r.quotes.length, 3); ok("watchlist: cleaned, saved, quoted");
r = await call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", messages: [{ role: "user", text: "how's my watchlist doing?" }] }); sys = calls[calls.length - 1].sys;
assert.match(sys, /NVDA — NVIDIA/); assert.match(sys, /XOM — Exxon/); ok("“how's my watchlist” brings his watchlist's quotes");

// ── the world record over a simulated week ──
let total = 0; for (let k = 0; k < 50; k++) { const w = await W.ingest(hive, 16); total += w.read; if (!w.read) break; }
assert.equal(total, 672); const once = [...fileHits.values()].every((n) => n === 1); assert.ok(once, "a file was read twice"); ok("a week of GDELT files read 16 at a time, newest first, each exactly once (" + total + " files; missing ones count as read)");
const busy = await Promise.all([W.ingest(hive, 2), W.ingest(hive, 2)]); assert.ok(busy.some((x) => x.busy)); ok("two overlapping watches never read the same file twice");
const t = W.trends(hive);
assert.ok(t.days >= 6.9, "days " + t.days);
const sudan = t.countries.find((c) => c.name === "Sudan"), ukr = t.countries.find((c) => c.name === "Ukraine");
assert.ok(sudan.day > 700 && sudan.base > 150 && sudan.base < 220, JSON.stringify(sudan)); assert.ok(sudan.change > 2.5); assert.ok(Math.abs(ukr.change) < 0.1); assert.equal(ukr.spark.length, 7);
assert.equal(t.movers[0].name, "Sudan"); ok("countries: Sudan ~4× its baseline and top mover, Ukraine level, each with a 7-day line");
const ur = t.dyads.find((d) => d.k === "USA-RUS"), uc = t.dyads.find((d) => d.k === "USA-CHN"), nr = t.dyads.find((d) => d.k === "NATO-RUS");
assert.equal(ur.trend, "rising"); assert.ok(ur.hostile > 0.6 && ur.hostileBase < 0.4, JSON.stringify(ur)); assert.ok(ur.threats > 150); assert.ok(ur.tone < 0 && ur.toneBase > 0);
assert.equal(uc.trend, "steady"); assert.equal(nr.trend, "rising"); assert.equal(t.dyads.find((d) => d.k === "CHN-TWN").trend, "quiet"); ok("pairs: US–Russia rising (" + Math.round(ur.hostile * 100) + "% hostile vs " + Math.round(ur.hostileBase * 100) + "%), US–China steady, China–Taiwan quiet");
const text = W.worldText(t); assert.match(text, /^GENESIS'S OWN WORLD RECORD .*6[67]\d of the last 672 files/); assert.match(text, /United States – Russia: \d+ interactions .*% hostile \(baseline \d+%\).*: rising\./); assert.match(text, /How to read it/); ok("the record in words, with baselines and a caution about news attention");
const fe = W.frictionEvents(t); assert.ok(fe.some((e) => e.key.startsWith("fr:USA-RUS:"))); assert.ok(fe.every((e) => e.cat === "world" && e.level === "notable")); ok("friction well above baseline becomes an alert (notable, never critical)");
// Genesis's watch: the record, friction and watchlist moves become journal notes and alerts
const before = db.prepare("SELECT COUNT(*) c FROM alert").get().c;
const wr = await Genesis.watch(hive); assert.ok(wr.world && !wr.world.error, JSON.stringify(wr));
const al = db.prepare("SELECT cat, title FROM alert ORDER BY id DESC LIMIT 10").all(); assert.ok(al.some((a) => a.cat === "world" && /Russia: friction above normal/.test(a.title)), JSON.stringify(al)); assert.ok(al.some((a) => a.cat === "markets" && /▲ NVDA \+8\.3%/.test(a.title)), JSON.stringify(al));
assert.ok(db.prepare("SELECT COUNT(*) c FROM alert").get().c > before); ok("watch: a friction alert and NVDA's +8.3% day are queued for his phone");
const again = await Genesis.watch(hive); assert.equal(db.prepare("SELECT COUNT(*) c FROM alert WHERE cat IN ('world','markets')").get().c, al.filter((a) => a.cat === "world" || a.cat === "markets").length); ok("…once each per day, not every 15 minutes");
r = await call("/genesis/push"); assert.ok(r.cats.world && r.cats.markets); assert.equal(r.prefs.cats.world, true); ok("the two new alert kinds appear in his alert settings, on by default");
// owner chat on war: the record comes along
r = await call("/chat", { model: "workers-ai|@cf/openai/gpt-oss-120b", messages: [{ role: "user", text: "Do you predict us having a world war anytime soon? Based on current events." }] });
sys = calls[calls.length - 1].sys; assert.match(sys, /GENESIS'S OWN WORLD RECORD/); assert.match(sys, /United States – Russia/); assert.ok(r.tools.some((x) => /world record \(7 days\)/.test(x)), JSON.stringify(r.tools)); ok("“world war?” brings the record: numbers and baselines to reason from");
r = await call("/genesis/world?text=1"); assert.ok(r.dyads.length >= 10 && r.countries.length === 2 && /WORLD RECORD/.test(r.text)); ok("/genesis/world serves the record for Vigil's panels");
r = await call("/genesis/health"); const wc = r.checks.find((c) => c.name === "World record (GDELT)"); assert.ok(wc && wc.ok, JSON.stringify(wc)); assert.match(wc.detail, /6[67]\d of 672 files/); ok("health check: " + wc.detail);
console.log("all passed");
