/* Duely · the reminder desk. One overdue invoice in, a dated three-email sequence out: friendly, then firm, then final,
   and never a threat. Every draft is checked against hard guardrails (no legal action, no collections, no credit
   reports), because this is invoice-reminder software, not a collection agency, and collectors need licences. Nothing is
   sent from here: each email opens in your own mail app, in your own name. Optional: polish a draft with Genesis, which is
   held to the same guardrails. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const DAY = 864e5, today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const long = (d) => d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const short = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const money = (n, cur) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n); } catch (e) { return cur + " " + n.toFixed(2); } };
const late = (inv) => Math.max(0, Math.round((today() - parseDay(inv.due)) / DAY));
let INV = []; try { INV = JSON.parse(store.get("duely:invoices") || "[]"); } catch (e) {}
const save = () => store.set("duely:invoices", JSON.stringify(INV));
let sel = INV[0] ? INV[0].id : null;

// ── the guardrails: phrases a reminder must never contain ──
const GUARD = [
  [/\b(legal action|lawsuit|sue|suing|court|small claims|attorneys?|lawyers?|litigation)\b/i, "threatens legal action"],
  [/\bcollections?\b|\bcollect(or|ors|ion agency)\b|\bdebt\b/i, "sounds like a collection agency"],
  [/\bcredit (report|bureau|score|rating)s?\b/i, "mentions credit reporting"],
  [/\b(garnish\w*|seize|repossess\w*|police|arrest|criminal|fraud)\b/i, "is a threat"],
  [/\b(late fees?|interest charges?|penalt(y|ies))\b/i, "adds charges that may not be in your agreement"],
  [/\b(final warning|or else|consequences)\b/i, "reads as an ultimatum"],
];
const check = (text) => GUARD.filter(([re]) => re.test(text)).map(([re, why]) => ({ hit: text.match(re)[0], why }));

// ── the sequence ──
function draft(inv) {
  const amt = money(inv.amount, inv.cur), due = long(parseDay(inv.due)), pay = inv.link ? "\n\nYou can pay here: " + inv.link : "", first = inv.client.split(/\s+/)[0];
  const start = parseDay(inv.created), closeBy = long(new Date(start.getTime() + 21 * DAY));
  return [
    { day: 0, k: "friendly", subj: "Invoice " + inv.num + ": a quick reminder", body: "Hi " + first + ",\n\nI hope all's well. A quick note that invoice " + inv.num + " for " + inv.what + " (" + amt + ") was due on " + due + ".\n\nIf it's already on its way, thank you, and please ignore this." + pay + "\n\nThanks,\n" + inv.me },
    { day: 7, k: "firm", subj: "Following up: invoice " + inv.num + " (" + amt + ")", body: "Hi " + first + ",\n\nI'm following up on invoice " + inv.num + " for " + inv.what + ". It was due on " + due + " and I haven't received payment yet.\n\nCould you let me know when I can expect it? If something's holding it up, like a question about the work or the amount, just reply and we'll sort it out." + pay + "\n\nThank you,\n" + inv.me },
    { day: 14, k: "final", subj: "Last reminder: invoice " + inv.num, body: "Hi " + first + ",\n\nThis is my last reminder about invoice " + inv.num + " for " + inv.what + " (" + amt + "), which was due on " + due + ".\n\nI'd like to close this out by " + closeBy + ". If there's a problem with the invoice, please reply and tell me what it is, and I'll do what I can to fix it." + pay + "\n\nThank you,\n" + inv.me },
  ].map((s) => ({ ...s, sent: null }));
}

// ── drawing ──
function drawList() {
  const open = INV.filter((i) => !i.paid);
  $("tot").innerHTML = open.length ? "<b>" + open.length + "</b> open · " + Object.entries(open.reduce((a, i) => ((a[i.cur] = (a[i.cur] || 0) + i.amount), a), {})).map(([c, v]) => "<b>" + esc(money(v, c)) + "</b>").join(" + ") + " outstanding" : INV.length ? "all paid" : "";
  $("invs").innerHTML = INV.map((i) => { const s = stage(i);
    return '<button class="inv' + (i.id === sel ? " on" : "") + '" data-id="' + i.id + '"><span class="r1"><b>' + esc(i.client) + '</b><span class="tag ' + s.cls + '">' + esc(s.t) + "</span></span><small>#" + esc(i.num) + " · " + esc(money(i.amount, i.cur)) + (i.paid ? "" : " · " + late(i) + " days late") + "</small></button>"; }).join("");
}
function stage(i) { if (i.paid) return { t: "paid", cls: "paid" }; const n = i.steps.filter((s) => s.sent).length; return n >= 3 ? { t: "all sent", cls: "final" } : n === 2 ? { t: "final next", cls: "final" } : { t: n ? "firm next" : "start", cls: "late" }; }
function drawDesk() {
  const inv = INV.find((i) => i.id === sel), d = $("desk");
  if (!inv) { d.innerHTML = '<div class="empty"><h2>Get paid without the awkward part.</h2><p>Log an overdue invoice and Duely drafts three reminders, friendly, then firm, then final, dated a week apart. Each one is checked against hard guardrails: no threats, no legal talk, nothing that sounds like a collection agency. You read each one and send it yourself.</p><div class="row" style="justify-content:center"><button class="btn pri" data-act="new">+ Overdue invoice</button><button class="btn" data-act="example">Load an example</button></div></div>'; return; }
  const start = parseDay(inv.created), now = today();
  const nextIdx = inv.steps.findIndex((s) => !s.sent);
  let h = '<div class="head"><div><h2>' + esc(inv.client) + '</h2><div class="sub">Invoice #' + esc(inv.num) + " · " + esc(inv.what) + " · due " + esc(short(parseDay(inv.due))) + '</div></div><div class="big"><b>' + esc(money(inv.amount, inv.cur)) + "</b><small>" + (inv.paid ? "paid " + esc(short(new Date(inv.paid))) : late(inv) + " days past due") + "</small></div></div>";
  if (inv.paid) {
    const card = inv.amount * 0.029 + 0.3, fee = (inv.amount * (inv.fee ?? 5)) / 100;
    h += '<div class="paid"><h3>Paid. Nicely done.</h3><div class="fee"><span>Invoice</span><span>' + esc(money(inv.amount, inv.cur)) + '</span><span>Card processing (example: 2.9% + 0.30)</span><span>− ' + esc(money(card, inv.cur)) + '</span><span>Duely\'s fee, only because it worked: <input type="number" min="0" max="20" step="0.5" value="' + (inv.fee ?? 5) + '" data-fee> %</span><span>− ' + esc(money(fee, inv.cur)) + '</span><span class="net">You keep</span><span class="net">' + esc(money(inv.amount - card - fee, inv.cur)) + '</span></div><p class="note">On the real thing, the split happens inside the payment itself (Stripe Connect), so there\'s never a bill for using the reminder tool. Nothing is charged here.</p><div class="row"><button class="btn sm" data-act="unpaid">Mark unpaid</button></div></div>';
  }
  h += '<div class="seq">' + inv.steps.map((s, k) => { const when = new Date(start.getTime() + s.day * DAY), isDue = !inv.paid && k === nextIdx && when <= now, flags = check(s.subj + "\n" + s.body);
    const mail = "mailto:" + encodeURIComponent(inv.email || "") + "?subject=" + encodeURIComponent(s.subj) + "&body=" + encodeURIComponent(s.body);
    return '<div class="step' + (s.sent ? " sent" : isDue ? " due" : "") + '" data-k="' + k + '"><div class="sh"><span class="k">' + (k + 1) + " · " + s.k + '</span><span class="when">' + (s.sent ? "sent " + esc(short(new Date(s.sent))) : isDue ? "send today" : when < now ? "was due " + esc(short(when)) : esc(long(when))) + '</span><span class="g"></span>' + (s.ai ? '<span class="tag">AI-polished</span>' : "") + "</div>" +
      '<input class="subj" value="' + esc(s.subj) + '" data-f="subj" aria-label="Subject"><textarea data-f="body" aria-label="Email body">' + esc(s.body) + "</textarea>" +
      '<div class="flags">' + (flags.length ? flags.map((f) => '<span class="flag">✕ “' + esc(f.hit) + "” " + esc(f.why) + ". Duely never sends that.</span>").join("") : '<span class="flag ok">✓ passes the guardrails</span>') + "</div>" +
      '<div class="row"><a class="btn sm' + (isDue ? " pri" : "") + '" href="' + esc(mail) + '" data-act="mail"' + (flags.length ? ' aria-disabled="true" style="pointer-events:none;opacity:.45"' : "") + '>Open in my mail app</a><button class="btn sm" data-act="copy">Copy</button><button class="btn sm" data-act="ai">Polish with AI</button><button class="btn sm" data-act="sent">' + (s.sent ? "Mark not sent" : "Mark sent") + "</button></div></div>"; }).join("") + "</div>";
  h += '<div class="row" style="margin-top:16px">' + (inv.paid ? "" : '<button class="btn pri" data-act="paid">They paid</button>') + '<button class="btn" data-act="redraft">Redraft all three</button><button class="btn" data-act="del">Delete</button></div>';
  h += '<p class="guard">Guardrails: no legal action, no courts or lawyers, nothing about collections or debt, no credit reporting, no added fees or penalties, no ultimatums. Every email is in your name, about your own invoice. That\'s what keeps this invoice-reminder software rather than a collection agency, which needs a licence and falls under the FDCPA.</p>';
  d.innerHTML = h;
}
function draw() { drawList(); drawDesk(); }

// ── actions ──
$("invs").onclick = (e) => { const b = e.target.closest("[data-id]"); if (b) { sel = b.dataset.id; draw(); } };
$("new").onclick = () => openForm();
function openForm() { const f = $("form"); f.reset(); f.due.value = iso(new Date(today().getTime() - 14 * DAY)); const last = INV[0]; if (last) f.me.value = last.me; $("dlg").showModal(); }
$("dlg").addEventListener("close", () => {
  if ($("dlg").returnValue !== "ok") return; const f = $("form"), amount = parseFloat(String(f.amount.value).replace(/[^\d.]/g, ""));
  if (!(amount > 0)) return;
  const inv = { id: "i" + Date.now().toString(36), me: f.me.value.trim(), client: f.client.value.trim(), email: f.email.value.trim(), num: f.num.value.trim().replace(/^#/, ""), cur: f.cur.value, amount, due: f.due.value, what: f.what.value.trim(), link: /^https?:\/\//.test(f.link.value.trim()) ? f.link.value.trim() : "", created: iso(today()), paid: null, fee: 5 };
  inv.steps = draft(inv); INV.unshift(inv); sel = inv.id; save(); draw();
});
$("desk").addEventListener("input", (e) => { const st = e.target.closest(".step"), inv = INV.find((i) => i.id === sel); if (!inv) return;
  if (e.target.dataset.fee != null) { inv.fee = Math.max(0, Math.min(20, +e.target.value || 0)); save(); return; }
  if (!st) return; const s = inv.steps[+st.dataset.k]; s[e.target.dataset.f] = e.target.value; s.ai = false; save();
  const flags = check(s.subj + "\n" + s.body), fl = st.querySelector(".flags"); fl.innerHTML = flags.length ? flags.map((f) => '<span class="flag">✕ “' + esc(f.hit) + "” " + esc(f.why) + ". Duely never sends that.</span>").join("") : '<span class="flag ok">✓ passes the guardrails</span>';
  const a = st.querySelector('[data-act="mail"]'); a.href = "mailto:" + encodeURIComponent(inv.email || "") + "?subject=" + encodeURIComponent(s.subj) + "&body=" + encodeURIComponent(s.body); a.style.pointerEvents = flags.length ? "none" : ""; a.style.opacity = flags.length ? ".45" : "";
});
$("desk").addEventListener("change", (e) => { if (e.target.dataset.fee != null) drawDesk(); });
$("desk").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return; const act = b.dataset.act, inv = INV.find((i) => i.id === sel), st = b.closest(".step"), s = inv && st ? inv.steps[+st.dataset.k] : null;
  if (act === "new") return openForm();
  if (act === "example") { const inv2 = { id: "i" + Date.now().toString(36), me: "Green Acre Lawn Care", client: "Dana Whitfield", email: "", num: "1042", cur: "USD", amount: 150, due: iso(new Date(today().getTime() - 19 * DAY)), what: "lawn care, three visits in September", link: "", created: iso(new Date(today().getTime() - 8 * DAY)), paid: null, fee: 5 }; inv2.steps = draft(inv2); inv2.steps[0].sent = today().getTime() - 8 * DAY; INV.unshift(inv2); sel = inv2.id; save(); return draw(); }
  if (act === "mail") { if (s && !s.sent) setTimeout(() => { if (confirm("Did it send? Mark this reminder as sent.")) { s.sent = Date.now(); save(); draw(); } }, 1200); return; }
  e.preventDefault();
  if (act === "copy") { const t = "Subject: " + s.subj + "\n\n" + s.body; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400); }, () => { b.textContent = "Select and copy"; }); }
  else if (act === "sent") { s.sent = s.sent ? null : Date.now(); save(); draw(); }
  else if (act === "paid") { inv.paid = Date.now(); save(); draw(); }
  else if (act === "unpaid") { inv.paid = null; save(); draw(); }
  else if (act === "redraft") { if (confirm("Replace all three drafts with fresh ones? Your edits will be lost.")) { const sent = inv.steps.map((x) => x.sent); inv.steps = draft(inv); inv.steps.forEach((x, k) => (x.sent = sent[k])); save(); draw(); } }
  else if (act === "del") { if (confirm("Delete this invoice from Duely?")) { INV = INV.filter((i) => i.id !== sel); sel = INV[0] ? INV[0].id : null; save(); draw(); } }
  else if (act === "ai") polish(inv, s, b);
});
async function polish(inv, s, b) {
  b.disabled = true; b.textContent = "Polishing…";
  const sys = "You polish payment reminder emails for small businesses and freelancers. Keep it short, warm and clear, in the sender's own voice, signed with their name. Keep every fact (amount, invoice number, dates, payment link) exactly as given. Keep the tone the step asks for. NEVER mention legal action, courts, lawyers, collections, debt, credit reports, late fees, penalties, interest or consequences, and never sound like a collection agency. Reply with the email body only, no subject line, no commentary.";
  const prompt = "Tone: " + s.k + " (" + (s.k === "friendly" ? "first, light" : s.k === "firm" ? "second, direct" : "last, clear and calm") + ").\n\nPolish this email:\n\n" + s.body;
  try {
    const ms = await fetch("/api/hive/models").then((r) => r.json()), pick = (ms.models || []).find((m) => /gpt-oss-120b/.test(m.id)) || (ms.models || []).find((m) => /^workers-ai\|/.test(m.id));
    if (!pick) throw new Error("no model");
    const r = await fetch("/api/hive/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: pick.id, system: sys, messages: [{ role: "user", text: prompt }] }) }).then((x) => x.json());
    const text = String((r && r.text) || "").trim().replace(/^subject:.*\n+/i, "");
    if (!text) throw new Error("empty");
    const flags = check(text), facts = [inv.num, String(inv.amount).split(".")[0]].every((f) => text.includes(f));
    if (flags.length) { alert("The AI draft broke a guardrail (“" + flags[0].hit + "” " + flags[0].why + "), so your draft stays as it was."); }
    else if (!facts) { alert("The AI draft dropped the invoice number or amount, so your draft stays as it was."); }
    else { s.body = text; s.ai = true; save(); }
  } catch (err) { alert("AutoFaber couldn't be reached just now. Your draft is unchanged, and it already passes the guardrails."); }
  draw();
}
if (!sel && INV[0]) sel = INV[0].id;
draw();
window.Duely = { INV: () => INV, check, draft };
})();
