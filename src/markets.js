// Quotes for anything with a ticker, keyless: stocks, ETFs, indices, futures and crypto from Yahoo Finance's public chart
// API (crypto falls back to CoinGecko, then Coinbase). The names people say ("Exxon", "the S&P", "gold", "XRP") map to
// symbols; anything else with "stock"/"shares" after it is looked up by name. Used by Vigil (board, watchlist, lookup)
// and by Hive's chat, so "what are XRP and XOM doing?" gets the numbers, not a promise to fetch them.
const UA = { "user-agent": "Mozilla/5.0 (compatible; mentifaber.org Vigil/1.0; +https://mentifaber.org/contact)", accept: "application/json" };
async function getJSON(url, ms = 9000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) { const e = new Error(new URL(url).hostname + " " + r.status); e.status = r.status; throw e; }
  return r.json();
}
// what people say → a Yahoo symbol (longest names are matched first)
const NAMES = {
  "s&p 500": "^GSPC", "s&p500": "^GSPC", "s&p": "^GSPC", "sp500": "^GSPC", "dow jones": "^DJI", "the dow": "^DJI", "nasdaq": "^IXIC", "russell 2000": "^RUT", "vix": "^VIX", "ftse 100": "^FTSE", "ftse": "^FTSE", "dax": "^GDAXI", "nikkei": "^N225", "hang seng": "^HSI",
  gold: "GC=F", silver: "SI=F", copper: "HG=F", platinum: "PL=F", oil: "CL=F", "crude oil": "CL=F", crude: "CL=F", wti: "CL=F", brent: "BZ=F", "natural gas": "NG=F", "nat gas": "NG=F", wheat: "ZW=F", corn: "ZC=F", "10-year": "^TNX", "10 year treasury": "^TNX", "treasury yield": "^TNX", "dollar index": "DX-Y.NYB",
  bitcoin: "BTC-USD", ethereum: "ETH-USD", ether: "ETH-USD", ripple: "XRP-USD", solana: "SOL-USD", dogecoin: "DOGE-USD", cardano: "ADA-USD", litecoin: "LTC-USD", chainlink: "LINK-USD", polkadot: "DOT-USD", "shiba inu": "SHIB-USD", avalanche: "AVAX-USD", tron: "TRX-USD", stellar: "XLM-USD", monero: "XMR-USD", toncoin: "TON11419-USD", "bitcoin cash": "BCH-USD",
  apple: "AAPL", microsoft: "MSFT", nvidia: "NVDA", amazon: "AMZN", google: "GOOGL", alphabet: "GOOGL", "meta platforms": "META", facebook: "META", tesla: "TSLA", netflix: "NFLX", exxon: "XOM", exxonmobil: "XOM", "exxon mobil": "XOM", chevron: "CVX", berkshire: "BRK-B", jpmorgan: "JPM",
  walmart: "WMT", costco: "COST", boeing: "BA", lockheed: "LMT", "lockheed martin": "LMT", raytheon: "RTX", "northrop grumman": "NOC", "general dynamics": "GD", palantir: "PLTR", intel: "INTC", coinbase: "COIN", microstrategy: "MSTR", disney: "DIS", "coca-cola": "KO", "coca cola": "KO", pepsi: "PEP",
  visa: "V", mastercard: "MA", gamestop: "GME", uber: "UBER", spotify: "SPOT", oracle: "ORCL", salesforce: "CRM", broadcom: "AVGO", tsmc: "TSM", toyota: "TM", pfizer: "PFE", moderna: "MRNA", nike: "NKE", starbucks: "SBUX", "mcdonald's": "MCD", mcdonalds: "MCD", ford: "F", "general motors": "GM",
  rivian: "RIVN", occidental: "OXY", "shell plc": "SHEL", "rheinmetall": "RHM.DE", "spy": "SPY", "qqq": "QQQ",
};
const NAME_RE = new RegExp("(?:^|[^\\w&])(" + Object.keys(NAMES).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?=$|[^\\w&])", "gi");
const CRYPTO = new Set("BTC ETH XRP SOL DOGE ADA LTC LINK DOT SHIB AVAX TRX XLM XMR BNB TON SUI PEPE HBAR BCH ATOM UNI NEAR APT ARB OP ICP FIL ETC XDC ALGO VET".split(" "));
const STOP = new Set("I A AN AM PM OK US USA UK EU UN UAE AI CEO CFO CTO GDP CPI PPI ETF ETFS IPO NYSE SEC FED FOMC ISS NASA NATO NOAA GDACS USGS WHO IMF OPEC TV PC IT ID HQ ASAP FYI DIY OMG LOL BTW AKA RIP PS FAQ API URL PDF YES NO OR AND THE FOR WHAT HOW WHY NOW NEW TOP BIG ALL ANY MY ME YOU HE SHE WE THEY IS ARE WAS ON IN AT TO OF UP DOWN".split(" "));
const MARKET = /\b(stocks?|shares?|prices?|priced|trading|trades?|ticker|quotes?|markets?|crypto\w*|coins?|tokens?|worth|portfolio|invest\w*|watchlist|valuation|market cap|earnings|rally|sell-?off|futures|index|etf)\b|\b(how|what)('?s| is| are| was| were)\b.{1,40}\b(doing|at|trading|worth|priced)\b/i;
// symbols mentioned in a message: cashtags, names, and ticker-looking words when the message is about markets
export function tickersIn(text, bare) { // bare: a lone word counts as a ticker (Vigil's lookup box), never in conversation
  const t = String(text || ""), out = [], add = (s) => { s = String(s || "").toUpperCase(); if (s && !out.includes(s) && out.length < 8) out.push(s); };
  for (const m of t.matchAll(/\$([A-Za-z]{1,6}(?:[.-][A-Za-z]{1,3})?)\b/g)) { const s = m[1].toUpperCase(); add(CRYPTO.has(s) ? s + "-USD" : s); }
  const one = bare && /^\s*([A-Za-z]{1,5}(?:[.-][A-Za-z]{1,3})?|\^[A-Za-z]{2,6}|[A-Za-z]{1,4}=F)\s*$/i.exec(t); // just a ticker: "xom", "xrp", "^vix", "gc=f"
  if (one && !NAMES[one[1].toLowerCase()]) { const s = one[1].toUpperCase(); add(CRYPTO.has(s) ? s + "-USD" : s); }
  for (const m of t.matchAll(NAME_RE)) add(NAMES[m[1].toLowerCase()]);
  if (MARKET.test(t) || out.length) for (const m of t.matchAll(/\b([A-Z]{2,5})\b/g)) if (!STOP.has(m[1])) add(CRYPTO.has(m[1]) ? m[1] + "-USD" : m[1]);
  return out;
}
// "Rheinmetall stock", "shares of Lucid": a name to look up when no symbol was found
export function namesIn(text) {
  const t = String(text || ""), out = [];
  for (const m of t.matchAll(/\b([A-Z][\w&.'-]+(?: [A-Z][\w&.'-]+)?)(?:'s)? (?:stock|shares|share price|stock price)\b/g)) out.push(m[1]);
  for (const m of t.matchAll(/\bshares of ([A-Z][\w&.'-]+(?: [A-Z][\w&.'-]+)?)/g)) out.push(m[1]);
  return [...new Set(out)].filter((n) => !STOP.has(n.toUpperCase())).slice(0, 3);
}
export async function lookup(name) {
  const j = await getJSON("https://query1.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(name) + "&quotesCount=3&newsCount=0");
  const q = (j.quotes || []).find((x) => /EQUITY|ETF|INDEX|CRYPTOCURRENCY|FUTURE/.test(x.quoteType || "")); return q ? q.symbol : null;
}
const KIND = { EQUITY: "stock", ETF: "etf", INDEX: "index", FUTURE: "future", CRYPTOCURRENCY: "crypto", CURRENCY: "fx", MUTUALFUND: "fund" };
const thin = (xs, n) => { if (xs.length <= n) return xs; const out = []; for (let i = 0; i < n; i++) out.push(xs[Math.round(i * (xs.length - 1) / (n - 1))]); return out; };
const r4 = (x) => (x == null || !isFinite(x) ? null : Math.abs(x) >= 100 ? Math.round(x * 100) / 100 : Math.round(x * 10000) / 10000);
async function yahoo(sym) {
  let j, err;
  for (const host of ["query1", "query2"]) { try { j = await getJSON("https://" + host + ".finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) + "?range=1d&interval=15m&includePrePost=false"); break; } catch (e) { err = e; if (e.status === 404) break; } }
  const r = j && j.chart && j.chart.result && j.chart.result[0], m = r && r.meta;
  if (!m || m.regularMarketPrice == null) throw err || new Error((j && j.chart && j.chart.error && j.chart.error.description) || "no quote for " + sym);
  const prev = m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose, price = m.regularMarketPrice, now = Date.now() / 1000, reg = m.currentTradingPeriod && m.currentTradingPeriod.regular;
  const closes = ((r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || []).filter((x) => x != null);
  const kind = KIND[m.instrumentType] || "stock", pct = m.regularMarketChangePercent != null ? m.regularMarketChangePercent : prev ? (price - prev) / prev * 100 : null;
  return { sym: m.symbol || sym, name: m.longName || m.shortName || sym, kind, price: r4(price), prev: r4(prev), chg: prev != null ? r4(price - prev) : null, pct: pct == null ? null : Math.round(pct * 100) / 100, cur: m.currency || "USD", ex: m.fullExchangeName || m.exchangeName || "",
    at: (m.regularMarketTime || 0) * 1000, open: kind === "crypto" ? true : !!(reg && now >= reg.start && now < reg.end), hi: r4(m.regularMarketDayHigh), lo: r4(m.regularMarketDayLow), w52: [r4(m.fiftyTwoWeekLow), r4(m.fiftyTwoWeekHigh)], spark: thin(closes, 32).map(r4), src: "Yahoo Finance" };
}
const GECKO = { BTC: "bitcoin", ETH: "ethereum", XRP: "ripple", SOL: "solana", DOGE: "dogecoin", ADA: "cardano", LTC: "litecoin", LINK: "chainlink", DOT: "polkadot", SHIB: "shiba-inu", AVAX: "avalanche-2", TRX: "tron", XLM: "stellar", XMR: "monero", BNB: "binancecoin", TON: "the-open-network", SUI: "sui", PEPE: "pepe", HBAR: "hedera-hashgraph", BCH: "bitcoin-cash" };
async function gecko(base) { // crypto when Yahoo can't: CoinGecko (24 h change, sparkline), else Coinbase's spot price
  try {
    let id = GECKO[base]; if (!id) { const s = await getJSON("https://api.coingecko.com/api/v3/search?query=" + encodeURIComponent(base)); const c = (s.coins || []).filter((x) => String(x.symbol).toUpperCase() === base).sort((a, b) => (a.market_cap_rank || 1e9) - (b.market_cap_rank || 1e9))[0]; id = c && c.id; }
    if (!id) throw new Error("unknown coin " + base);
    const [c] = await getJSON("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=" + encodeURIComponent(id) + "&sparkline=true&price_change_percentage=24h");
    if (!c) throw new Error("no CoinGecko price for " + base);
    const sp = (c.sparkline_in_7d && c.sparkline_in_7d.price) || [];
    return { sym: base + "-USD", name: c.name, kind: "crypto", price: r4(c.current_price), prev: r4(c.current_price - (c.price_change_24h || 0)), chg: r4(c.price_change_24h), pct: c.price_change_percentage_24h == null ? null : Math.round(c.price_change_percentage_24h * 100) / 100, cur: "USD", ex: "CoinGecko",
      at: Date.parse(c.last_updated) || Date.now(), open: true, hi: r4(c.high_24h), lo: r4(c.low_24h), w52: [null, null], spark: thin(sp.slice(-24), 32).map(r4), src: "CoinGecko", window: "24h" };
  } catch (e) {
    const j = await getJSON("https://api.coinbase.com/v2/prices/" + encodeURIComponent(base) + "-USD/spot");
    return { sym: base + "-USD", name: base, kind: "crypto", price: r4(+j.data.amount), prev: null, chg: null, pct: null, cur: "USD", ex: "Coinbase", at: Date.now(), open: true, hi: null, lo: null, w52: [null, null], spark: [], src: "Coinbase" };
  }
}
export async function quotes(syms) {
  return Promise.all([...new Set(syms.map((s) => String(s).toUpperCase()))].slice(0, 12).map(async (s) => {
    try { return await yahoo(s); }
    catch (e) { if (/-USD$/.test(s)) try { return await gecko(s.slice(0, -4)); } catch (x) {} return { sym: s, error: String(e.message || e).slice(0, 100) }; }
  }));
}
// what's in a question, resolved to symbols (names looked up when nothing else matched)
export async function symbolsFor(text, bare) {
  const syms = tickersIn(text, bare); if (syms.length) return syms;
  const out = []; for (const n of namesIn(text)) { const s = await lookup(n).catch(() => null); if (s && !out.includes(s)) out.push(s); }
  return out;
}
// the default board: US indices, volatility, rates, gold, oil, the dollar, bitcoin and ether
export const BOARD = ["^GSPC", "^DJI", "^IXIC", "^VIX", "^TNX", "GC=F", "CL=F", "DX-Y.NYB", "BTC-USD", "ETH-USD"];
const money = (q) => (q.kind === "index" || q.sym === "^TNX" ? "" : q.cur === "USD" ? "$" : "") + (q.price == null ? "?" : q.price.toLocaleString("en-US", { maximumFractionDigits: q.price < 10 ? 4 : 2 })) + (q.cur !== "USD" && q.kind !== "index" ? " " + q.cur : "");
const when = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 2 ? "just now" : m < 90 ? m + " min ago" : m < 36 * 60 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago"; };
// one line per quote, for Genesis to read
export function quoteText(q) {
  if (q.error) return q.sym + ": no quote (" + q.error + ")";
  const ch = q.pct == null ? "" : ", " + (q.chg != null ? (q.chg >= 0 ? "+" : "") + q.chg.toLocaleString("en-US", { maximumFractionDigits: q.price < 10 ? 4 : 2 }) + " " : "") + "(" + (q.pct >= 0 ? "+" : "") + q.pct.toFixed(2) + "%) " + (q.window === "24h" ? "over 24 h" : q.kind === "crypto" ? "since 00:00 UTC" : "on the day");
  return q.sym + " — " + q.name + (q.ex ? " (" + q.ex + ", " + q.kind + ")" : "") + ": " + money(q) + ch + (q.lo != null && q.hi != null ? "; day range " + q.lo + "–" + q.hi : "") + (q.w52 && q.w52[0] != null ? "; 52-week " + q.w52[0] + "–" + q.w52[1] : "") +
    "; " + (q.kind === "crypto" ? "trades around the clock" : q.open ? "market open" : "market closed, last trade " + when(q.at)) + " [" + q.src + "]";
}
