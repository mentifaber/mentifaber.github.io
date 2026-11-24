// Fine Print (DocCrawler, POST /api/hive/fineprint): a bill, a lease, a contract or terms of service in; the lines that
// matter out, each with the exact words it rests on. The model only proposes: a flag whose quote isn't found word for
// word in the document (spacing, case and curly quotes aside) is dropped here, so nothing reaches the reader that
// the document doesn't actually say. Nothing is kept.
export const FINE_DAY = 12; // a visitor's documents a day (each is one larger model call)
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_TEXT = 24000, MAX_FLAGS = 12;
const KINDS = ["auto-renewal", "cancellation", "fee", "price change", "penalty", "liability", "arbitration", "data sharing", "deadline", "deposit", "termination", "unusual"];

const SYSTEM = `You read documents for ordinary people: bills, leases, contracts, terms of service, loan and insurance papers.
Find the clauses a careful reader would want flagged before signing or paying: automatic renewals, how to cancel and
what it costs, fees and when they apply, prices that can change, penalties, limits on liability, arbitration or giving
up the right to sue, sharing or selling personal data, deadlines, deposits, termination, and anything unusual for this
kind of document.
Reply with JSON only: {"kind":"what the document is, in a few words","flags":[{"quote":"...","kind":"...","severity":"high"|"medium"|"low","why":"..."}]}
Rules: "quote" is copied EXACTLY from the document, one sentence or clause, at most 300 characters; never paraphrase it.
"kind" is one of: ${KINDS.join(", ")}. "why" says in one plain sentence what it means for the reader. At most ${MAX_FLAGS}
flags, most important first. If nothing needs flagging, return an empty list.`;

const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, n);
// how text is compared: case, runs of spaces and curly quotes don't count
export const norm = (s) => String(s).toLowerCase().replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

export function checkFlags(raw, text) {
  let j = raw; if (typeof raw === "string") { const m = raw.match(/\{[\s\S]*\}/); if (!m) return null; try { j = JSON.parse(m[0]); } catch (e) { return null; } }
  if (!j || !Array.isArray(j.flags)) return null;
  const doc = norm(text), seen = new Set(), flags = [];
  for (const f of j.flags.slice(0, MAX_FLAGS * 2)) {
    const quote = clean(f && f.quote, 300).replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""), q = norm(quote);
    if (q.length < 12 || !doc.includes(q) || seen.has(q)) continue; // not in the document, word for word: dropped
    seen.add(q);
    flags.push({ quote, at: doc.indexOf(q), kind: KINDS.includes(f.kind) ? f.kind : "unusual", severity: ["high", "medium", "low"].includes(f.severity) ? f.severity : "medium", why: clean(f.why, 300) });
    if (flags.length >= MAX_FLAGS) break;
  }
  return { kind: clean(j.kind, 80), flags };
}

export async function finePrint(h, body) {
  const text = clean(body.text, MAX_TEXT + 1);
  if (text.length < 80) throw Object.assign(new Error("that's too short to read for fine print"), { status: 400 });
  const cut = text.length > MAX_TEXT, doc = text.slice(0, MAX_TEXT);
  const t0 = Date.now(), reply = await h.cheap(MODEL, SYSTEM, [{ role: "user", text: "The document" + (body.name ? " (" + clean(body.name, 120) + ")" : "") + ":\n\n" + doc }], 1400);
  const r = checkFlags(reply, doc);
  if (!r) throw Object.assign(new Error("AutoFaber couldn't read that one just now; try again"), { status: 502 });
  return { ...r, cut, read: doc.length, ms: Date.now() - t0 };
}
