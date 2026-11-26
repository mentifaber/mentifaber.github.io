/* Subscription Sweep (game plan GP-10.1): every charge that comes back, found in a bank or card statement, worked out on
   the device (nothing is sent anywhere). Exposed as window.SubSweep, and to Node as module.exports for the tests:
     SubSweep.read(text, { now })   → { tx: [{ date, desc, amount, raw }], format, dayFirst }   amount: cents, + = money out
     SubSweep.find(tx, { now })     → { subs, perMonth, perYear, overlaps, due }
     SubSweep.letter(sub, { name }) → a cancellation letter
   A statement is a bank's CSV export (comma, semicolon or tab; one amount column, or debit and credit columns) or the
   text of a PDF statement (a line that starts with a date and ends with an amount). Charges are grouped by who took them
   (the description with card numbers, references, places and payment-processor words taken out), and a group is a
   subscription when its charges come back at a steady interval (weekly, every two weeks, monthly, quarterly or yearly) for
   about the same amount. */
(function (root) {
  "use strict";
  const DAY = 864e5;
  const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const utc = (y, m, d) => { const t = Date.UTC(y, m, d); const x = new Date(t); return x.getUTCMonth() === m && x.getUTCDate() === d ? t : null; };
  const y4 = (y) => (y < 100 ? 2000 + y : y);

  // ── dates ── "2026-03-05", "03/05/2026" (month first unless the statement shows otherwise), "5 Mar 2026", "Mar 5, 2026", "03/05" (no year)
  function dateOf(s, dayFirst, year) {
    s = String(s || "").trim().toLowerCase();
    let m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(s); if (m) return utc(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?\b/.exec(s);
    if (m) { const a = +m[1], b = +m[2], y = m[3] ? y4(+m[3]) : year; if (!y) return null; return dayFirst ? utc(y, b - 1, a) : utc(y, a - 1, b); }
    m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3})[a-z]*\.?[\s-]*(\d{2,4})?\b/.exec(s); if (m && MON.includes(m[2])) { const y = m[3] ? y4(+m[3]) : year; return y ? utc(y, MON.indexOf(m[2]), +m[1]) : null; }
    m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/.exec(s); if (m && MON.includes(m[1])) { const y = m[3] ? +m[3] : year; return y ? utc(y, MON.indexOf(m[1]), +m[2]) : null; }
    return null;
  }
  // does the statement write the day first? Any "13/02" settles it; else month first
  const dayFirstIn = (dates) => { let d = 0, mo = 0; for (const s of dates) { const m = /^(\d{1,2})[-\/.](\d{1,2})/.exec(String(s).trim()); if (!m) continue; if (+m[1] > 12) d++; if (+m[2] > 12) mo++; } return d > mo; };

  // ── amounts ── "-15.49", "(15.49)", "$1,234.56", "15.49 CR", "15,49" (comma decimals), "−15.49"
  function cents(s) {
    s = String(s == null ? "" : s).trim(); if (!s) return null;
    const neg = /^[-−–]|^\(.*\)$|[-−–]$|\bcr\b/i.test(s) || /^\$?\s*-/.test(s);
    let t = s.replace(/[^\d.,]/g, ""); if (!/\d/.test(t)) return null;
    if (/,\d{2}$/.test(t) && !/\.\d{2}$/.test(t)) t = t.replace(/\./g, "").replace(",", "."); else t = t.replace(/,/g, "");
    const n = Number(t); if (!isFinite(n)) return null; return (neg ? -1 : 1) * Math.round(n * 100);
  }

  // ── CSV ──
  function csvRows(text) {
    const first = text.split("\n").slice(0, 5).join("\n"), delim = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
      if (c === '"') q = true; else if (c === delim) { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c; }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }
  function readCsv(text, now) {
    const rows = csvRows(text); if (rows.length < 2) return null;
    const hi = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /desc|payee|merchant|narrative|details|memo|name|transaction/i.test(c))); if (hi < 0) return null;
    const h = rows[hi].map((c) => c.trim().toLowerCase()), col = (re, not) => h.findIndex((c) => re.test(c) && !(not && not.test(c)));
    const cd = col(/date/, /post/) >= 0 ? col(/date/, /post/) : col(/date/), cdesc = [col(/desc/), col(/payee|merchant/), col(/narrative|details/), col(/^name$/), col(/transaction/, /date|id|type|time|no/), col(/memo/)].find((i) => i >= 0);
    const cdeb = col(/debit|withdraw|paid out|money out|outflow/), ccred = col(/credit|deposit|paid in|money in|inflow/), camt = col(/amount|value/, /balance/);
    if (cd < 0 || cdesc === undefined || (camt < 0 && cdeb < 0)) return null;
    const body = rows.slice(hi + 1), dayFirst = dayFirstIn(body.map((r) => r[cd]));
    let tx = [];
    for (const r of body) { const date = dateOf(r[cd], dayFirst); if (date === null) continue; const desc = String(r[cdesc] || "").replace(/\s+/g, " ").trim(); if (!desc) continue;
      let amount; if (cdeb >= 0) { const d = cents(r[cdeb]), c = ccred >= 0 ? cents(r[ccred]) : null; amount = d ? Math.abs(d) : c ? -Math.abs(c) : null; } else amount = cents(r[camt]);
      if (amount === null || amount === 0) continue; tx.push({ date, desc, amount, raw: r.join(" · ").replace(/\s+/g, " ").trim() }); }
    // one amount column: spending is whichever sign most rows have (most banks show it negative; some positive)
    if (cdeb < 0) { const negs = tx.filter((t) => t.amount < 0).length; if (negs > tx.length / 2) tx = tx.map((t) => ({ ...t, amount: -t.amount })); }
    return { tx, format: "csv", dayFirst };
  }
  // ── a PDF's text, or pasted lines ── "03/05 NETFLIX.COM 866-579-7172 CA 15.49"
  function readText(text, now) {
    const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const years = (text.match(/\b20\d\d\b/g) || []).map(Number), year = years.length ? Math.max(...years.filter((y) => y <= new Date(now).getUTCFullYear() + 1)) : new Date(now).getUTCFullYear();
    const DATE = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?|\d{1,2}\s+[A-Za-z]{3}[a-z]*\.?(?:\s+\d{4})?|[A-Za-z]{3}[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?)\s+/;
    const AMT = /\s(\(?[-−–]?\$?\s?\d{1,3}(?:[,.]\d{3})*[.,]\d{2}\)?(?:\s?(?:CR|DR|-))?)(?:\s+\(?[-−–]?\$?\d{1,3}(?:[,.]\d{3})*[.,]\d{2}\)?)?$/i;
    const dayFirst = dayFirstIn(lines.map((l) => (DATE.exec(l) || [])[1]).filter(Boolean));
    const tx = [];
    for (const l of lines) { const d = DATE.exec(l); if (!d) continue; let date = dateOf(d[1], dayFirst, year); if (date === null) continue;
      if (!/\d{4}/.test(d[1]) && date > now + 7 * DAY) date = dateOf(d[1], dayFirst, year - 1) ?? date; // a December line on a January statement
      let rest = l.slice(d[0].length); const d2 = DATE.exec(rest); if (d2 && dateOf(d2[1], dayFirst, year) !== null) rest = rest.slice(d2[0].length); // the posting date too
      const a = AMT.exec(" " + rest); if (!a) continue; let amount = cents(a[1].replace(/\s?DR$/i, "")); if (amount === null) continue;
      if (/\bDR$/i.test(a[1])) amount = Math.abs(amount);
      const desc = (" " + rest).slice(0, a.index).trim(); if (!/[a-z]{2}/i.test(desc) || /\b(balance|total)\b/i.test(desc)) continue;
      tx.push({ date, desc, amount, raw: l }); }
    // a card statement lists charges as positive and payments as negative; a bank's text the other way round
    const negs = tx.filter((t) => t.amount < 0).length; return { tx: negs > tx.length / 2 ? tx.map((t) => ({ ...t, amount: -t.amount })) : tx, format: "text", dayFirst };
  }
  function read(text, o = {}) { const now = o.now || Date.now(); text = String(text || "").replace(/\r\n?/g, "\n"); return readCsv(text, now) || readText(text, now); }

  // ── who took it ──
  const NOISE = new Set("pos purchase debit credit card visa mastercard mc amex recurring payment pmt ach autopay auto bill billing online www com net org co inc llc ltd limited corp gmbh the of us usa uk ca au eu intl international subscription subscr sub membership monthly annual renewal dd direct directdebit standing order so sto fpi faster transaction trans txn ref reference id no nr checkcard chkcard pre authorized preauth electronic withdrawal ppd web sq tst des indn co: help helppay digital services service to from at via for".split(" "));
  const PROCESSOR = /^(paypal|pp|apple ?com ?bill|google|amzn|amazon mktp|stripe|sq|tst|sp|dd|fs|pypl)\s*\*\s*/i;
  const STATES = new Set("al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc on qc bc ab".split(" "));
  function who(desc) {
    let s = String(desc || "").toLowerCase();
    const viaApple = /apple\.com\/bill|apple com bill|itunes/.test(s), viaGoogle = /^google \*/.test(s);
    s = s.replace(PROCESSOR, ""); { const i = s.indexOf("*"); if (i > 0 && /[a-z]{3}/.test(s.slice(0, i))) s = s.slice(0, i); } // "ADOBE *CREATIVE CLOUD": the merchant, then what was bought
    s = s.replace(/\b(www\.)?([a-z0-9-]+)\.(com|net|org|co|io|tv|fm|app)(\.[a-z]{2})?\b/g, " $2 ").replace(/https?:\/\/\S+/g, " ");
    s = s.replace(/\*\S*/g, " ").replace(/#\S*/g, " ").replace(/\b\d[\d-]{2,}\b/g, " ").replace(/\b[a-z]*\d[a-z\d]{3,}\b/g, " ").replace(/[^a-z& ]+/g, " ");
    let w = s.split(/\s+/).filter((x) => x && x.length > 1 && !NOISE.has(x)); while (w.length > 1 && STATES.has(w[w.length - 1])) w.pop();
    const key = w.slice(0, 2).join(" ") || (viaApple ? "apple" : viaGoogle ? "google" : "");
    return key;
  }
  const pretty = (key) => key.replace(/\b\w/g, (c) => c.toUpperCase());

  // ── what kind of thing it is, for overlaps ──
  const KINDS = [["Video streaming", /netflix|hulu|disney|hbo|max\b|paramount|peacock|crunchyroll|youtube premium|youtube tv|apple tv|prime video|sling|fubo|britbox|mubi|discovery|starz|showtime/],
    ["Music and audio", /spotify|apple music|tidal|deezer|pandora|sirius|audible|youtube music|soundcloud|amazon music/],
    ["Cloud storage", /icloud|dropbox|google one|google storage|onedrive|box\b|backblaze|pcloud|idrive|mega\b/],
    ["News and reading", /times|post|journal|guardian|economist|atlantic|substack|medium|kindle unlimited|scribd|news|magazine|patreon/],
    ["Fitness", /gym|fitness|peloton|strava|planet|classpass|anytime|crunch|equinox|yoga|myfitnesspal|whoop|fitbit/],
    ["Software and apps", /adobe|microsoft|office|canva|notion|1password|lastpass|nordvpn|expressvpn|surfshark|openai|chatgpt|claude|anthropic|github|grammarly|evernote|zoom|slack/],
    ["Gaming", /xbox|playstation|psn|nintendo|steam|ea play|game pass|ubisoft|twitch/],
    ["Food and delivery", /hellofresh|blue apron|doordash|dashpass|uber one|instacart|grubhub|deliveroo|factor|home chef/],
    ["Phone and internet", /verizon|at&t|att\b|t mobile|tmobile|comcast|xfinity|spectrum|cox|vodafone|o2\b|ee\b|mint mobile|visible|cricket|fios/],
    ["Insurance", /insurance|geico|progressive|allstate|state farm|lemonade|aviva|admiral/]];
  const NO_OVERLAP = new Set(["Phone and internet", "Insurance"]);
  const kindOf = (key, desc) => { const s = (key + " " + desc).toLowerCase(), joined = s.replace(/[^a-z&]+/g, ""); for (const [k, re] of KINDS) { const flat = new RegExp(re.source.replace(/ /g, ""), re.flags); if (re.test(s) || flat.test(joined)) return k; } return null; };

  // ── the cadences ── [name, days between, how far off a charge can be, how many a year]
  const CAD = [["weekly", 7, 1.5, 52], ["every two weeks", 14, 2, 26], ["monthly", 30.4, 4, 12], ["every three months", 91, 8, 4], ["every six months", 182, 12, 2], ["yearly", 365, 12, 1]];
  const median = (a) => { const s = [...a].sort((x, y) => x - y), i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };

  function find(tx, o = {}) {
    const now = o.now || Date.now(), groups = new Map();
    for (const t of tx) { if (t.amount <= 0) continue; const k = who(t.desc); if (!k) continue; (groups.get(k) || groups.set(k, []).get(k)).push(t); }
    const subs = [];
    for (const [key, all] of groups) {
      const ch = [...all].sort((a, b) => a.date - b.date); if (ch.length < 2) continue;
      // the same charge twice on one day (a statement pasted twice, or a pending and a posted line) counts once
      const list = ch.filter((t, i) => !ch.slice(0, i).some((u) => u.date === t.date && u.amount === t.amount && u.desc === t.desc));
      if (list.length < 2) continue;
      const gaps = list.slice(1).map((t, i) => (t.date - list[i].date) / DAY); if (gaps.some((g) => g < 4)) continue; // more often than weekly: shopping, not a subscription
      const g = median(gaps), cad = CAD.find(([, d, tol]) => Math.abs(g - d) <= tol); if (!cad) continue;
      const on = gaps.filter((x) => Math.abs(x - cad[1]) <= cad[2] || Math.abs(x - 2 * cad[1]) <= 2 * cad[2]).length; // a missed month still counts
      if (on < Math.max(1, Math.ceil(gaps.length * 0.75))) continue;
      if (cad[3] >= 26 && list.length < 3) continue; // two charges a week apart prove nothing
      const amts = list.map((t) => t.amount), mid = median(amts), last = list[list.length - 1];
      const near = amts.filter((a) => Math.abs(a - mid) <= Math.max(50, mid * 0.1)).length >= Math.ceil(amts.length * 0.75); // a subscription charges about the same each time
      const stepping = amts.slice(1).every((b, i) => Math.abs(b - amts[i]) <= Math.max(50, amts[i] * 0.02) || (b > amts[i] && b <= amts[i] * 1.6)); // the same, or a price rise
      if (!near && !stepping) continue; // amounts all over the place: groceries, fuel
      const rose = []; for (let i = 1; i < list.length; i++) { const a = list[i - 1].amount, b = list[i].amount; if (b > a * 1.02 && b - a >= 10 && b <= a * 1.6) rose.push({ from: a, to: b, date: list[i].date }); }
      const every = cad[1] * DAY, next = last.date + Math.round(every / DAY) * DAY, lapsed = now - last.date > every * 1.6 + 5 * DAY;
      const desc = last.desc, kind = kindOf(key, desc);
      subs.push({ key, name: pretty(key), desc, cadence: cad[0], every: cad[1], count: list.length, first: list[0].date, last: last.date, amount: last.amount, perYear: Math.round(last.amount * cad[3]),
        perMonth: Math.round(last.amount * cad[3] / 12), next, lapsed, rose, kind, sure: list.length >= 3 ? "sure" : "likely", lines: list.map((t) => t.raw) });
    }
    subs.sort((a, b) => (a.lapsed - b.lapsed) || b.perYear - a.perYear);
    const live = subs.filter((s) => !s.lapsed), by = {};
    for (const s of live) if (s.kind && !NO_OVERLAP.has(s.kind)) (by[s.kind] = by[s.kind] || []).push(s.key);
    const overlaps = Object.entries(by).filter(([, k]) => k.length > 1).map(([kind, keys]) => ({ kind, keys }));
    const due = live.filter((s) => s.next >= now - DAY && s.next <= now + 31 * DAY).sort((a, b) => a.next - b.next).map((s) => s.key);
    return { subs, perMonth: live.reduce((n, s) => n + s.perMonth, 0), perYear: live.reduce((n, s) => n + s.perYear, 0), overlaps, due };
  }

  const money = (c) => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toFixed(2);
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  function letter(s, o = {}) {
    const me = String(o.name || "").trim() || "[your name]", acct = String(o.account || "").trim() || "[the email or account number on the subscription]";
    return "Subject: Please cancel my subscription\n\nHello,\n\nPlease cancel my subscription with " + s.name + ", which charges " + money(s.amount) + " " + s.cadence + " (most recently on " + day(s.last) + "), and stop any further charges to my card or account.\n\n" +
      "Account: " + acct + "\n\nPlease confirm in writing that it's cancelled and the date of the last charge. If a charge is taken after today, I'll ask for it to be refunded.\n\nThank you,\n" + me + "\n";
  }
  const api = { read, find, letter, who, dateOf, cents, money, KINDS: KINDS.map((k) => k[0]) };
  if (typeof module === "object" && module.exports) module.exports = api; else root.SubSweep = api;
})(typeof window !== "undefined" ? window : globalThis);
