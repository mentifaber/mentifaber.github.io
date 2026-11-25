// Second Opinion (POST /api/hive/quote): a quote or an invoice from any shop or contractor in; each line out, with what
// that kind of work or part typically costs and whether this line is high, fair or low. The same rule as Fine Print:
// the model only proposes. A line whose words aren't in the quote word for word is dropped; an amount, hours or a rate
// that isn't written on that line is dropped; and the verdict isn't the model's opinion but worked out here from the
// amount and the typical range, as is the arithmetic (do the lines add up to the total; is hours × rate the line's
// amount). Nothing is kept.
import { norm } from "./hive-fine.js";
export const QUOTE_DAY = 12; // a visitor's quotes a day (each is one larger model call)
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_TEXT = 16000, MAX_LINES = 40;
const KINDS = ["part", "labour", "fee", "tax", "discount", "other"];

const SYSTEM = `You check quotes and invoices for ordinary people: car repairs, plumbing, electrical, roofing, appliance and
device repairs, moving, cleaning, landscaping and the like, in the United States, at 2026 prices.
Reply with JSON only:
{"trade":"what kind of work, in a few words","lines":[{"quote":"...","desc":"...","kind":"part|labour|fee|tax|discount|other","amount":0,"hours":0,"rate":0,"lo":0,"hi":0,"why":"..."}],"total":{"quote":"...","amount":0},"notes":["..."]}
Rules: one entry per priced line of the quote. "quote" is that line copied EXACTLY from the document, never paraphrased,
at most 200 characters. "amount" is the line's price in dollars as written on it. "hours" and "rate" only when the line
states them. "lo" and "hi" are what that part or that work typically costs in the US in 2026, for the whole line; leave
them out if you can't tell. "why" says in one plain sentence what the line is for and how it compares. "total" is the
quote's own total line, copied exactly. "notes" (at most 4) are things a careful customer would ask about: no warranty
stated, labour hours missing, a vague line, a fee that's often waived. Never invent a line that isn't in the document.`;

const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, n);
// the numbers written in a piece of text: "$1,234.50" → 1234.5, "2.5 hrs" → 2.5
export const numbersIn = (s) => (String(s).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((x) => Number(x.replace(/,/g, ""))).filter((x) => isFinite(x));
const near = (a, b) => Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.005);
const nth = (s, q, k) => { let i = -1; for (let j = 0; j <= k; j++) i = s.indexOf(q, i + 1); return i; }; // where the k-th copy of q starts
const written = (n, quote) => { const v = Math.abs(Number(n)); return isFinite(v) && v > 0 && numbersIn(quote).some((x) => near(x, v)) ? Math.round(v * 100) / 100 : null; };

export function checkQuote(raw, text) {
  let j = raw; if (typeof raw === "string") { const m = raw.match(/\{[\s\S]*\}/); if (!m) return null; try { j = JSON.parse(m[0]); } catch (e) { return null; } }
  if (!j || !Array.isArray(j.lines)) return null;
  const doc = norm(text), seen = new Map(), lines = [];
  for (const l of j.lines.slice(0, MAX_LINES * 2)) {
    const quote = clean(l && l.quote, 200).replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""), q = norm(quote);
    // not in the quote word for word: dropped; a line written twice in the quote (the same work charged twice) may
    // appear twice, but a line written once appears once
    const times = q.length < 3 ? 0 : doc.split(q).length - 1, used = seen.get(q) || 0;
    if (!times || used >= times) continue;
    seen.set(q, used + 1);
    const kind = KINDS.includes(l.kind) ? l.kind : "other", amount = written(l.amount, quote), hours = written(l.hours, quote), rate = written(l.rate, quote);
    let lo = Number(l.lo), hi = Number(l.hi); const range = isFinite(lo) && isFinite(hi) && lo >= 0 && hi > 0 && hi >= lo && hi <= 1e6 && !["tax", "discount"].includes(kind);
    const out = { quote, at: nth(doc, q, used), desc: clean(l.desc, 120) || quote, kind, amount, why: clean(l.why, 300) };
    if (hours != null) out.hours = hours; if (rate != null) out.rate = rate;
    if (range) out.typical = { lo: Math.round(lo), hi: Math.round(hi) };
    // the verdict is worked out here, from the line's own amount and the typical range, with a little give either way
    out.verdict = amount == null || !range ? "unclear" : amount > hi * 1.15 ? "high" : amount < lo * 0.85 ? "low" : "fair";
    if (hours != null && rate != null && amount != null) out.math = near(hours * rate, amount) ? "ok" : "off"; // hours × rate is the line's amount, or it isn't
    lines.push(out); if (lines.length >= MAX_LINES) break;
  }
  if (!lines.length) return null;
  // the same work charged twice
  const descs = new Map(); for (const l of lines) { const k = norm(l.desc).replace(/[^a-z ]/g, ""); if (k.length > 3) descs.set(k, (descs.get(k) || 0) + 1); }
  for (const l of lines) if (descs.get(norm(l.desc).replace(/[^a-z ]/g, "")) > 1) l.twice = true;
  // does it add up: the lines (less any discount) against the quote's own total line, if it has one
  const tq = clean(j.total && j.total.quote, 200), total = { stated: null, sum: null, ok: null };
  if (tq && doc.includes(norm(tq))) total.stated = written(j.total.amount, tq);
  const priced = lines.filter((l) => l.amount != null && !norm(l.quote).includes("total"));
  if (priced.length) total.sum = Math.round(priced.reduce((s, l) => s + (l.kind === "discount" ? -l.amount : l.amount), 0) * 100) / 100;
  if (total.stated != null && total.sum != null) total.ok = near(total.sum, total.stated) || Math.abs(total.sum - total.stated) < 0.02;
  const notes = (Array.isArray(j.notes) ? j.notes : []).slice(0, 4).map((x) => clean(x, 200)).filter(Boolean);
  return { trade: clean(j.trade, 80), lines, total, notes };
}

export async function secondOpinion(h, body) {
  const text = clean(body.text, MAX_TEXT + 1);
  if (text.length < 40 || !/\d/.test(text)) throw Object.assign(new Error("that doesn't look like a quote: it needs its lines and prices"), { status: 400 });
  const cut = text.length > MAX_TEXT, doc = text.slice(0, MAX_TEXT);
  const t0 = Date.now(), reply = await h.cheap(MODEL, SYSTEM, [{ role: "user", text: "The quote" + (body.name ? " (" + clean(body.name, 120) + ")" : "") + ":\n\n" + doc }], 2000);
  const r = checkQuote(reply, doc);
  if (!r) throw Object.assign(new Error("AutoFaber couldn't read the lines of that one just now; try again"), { status: 502 });
  return { ...r, cut, read: doc.length, ms: Date.now() - t0 };
}
