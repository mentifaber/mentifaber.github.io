/* Bill Watch: this month's bill against last month's, worked out on the device (nothing is sent anywhere).
   A bill from the same provider is laid out the same way each month, so each charge is matched to last month's by its
   label (dates taken out), and every line shown is quoted from the bill as written. Exposed as window.BillWatch, and to
   Node as module.exports for the tests:
     BillWatch.parse(text)            → { lines: [{ label, key, amount, raw, kind, n }], total, notes }
     BillWatch.compare(before, after) → { rows, total, explained, unexplained, notes, questions, counts } */
(function (root) {
  "use strict";
  const MON = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const DATES = [new RegExp("\\b(?:" + MON + ")\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b", "gi"), new RegExp("\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:" + MON + ")\\.?(?:,?\\s+\\d{4})?\\b", "gi"),
    new RegExp("\\b(?:" + MON + ")\\.?\\s+\\d{4}\\b", "gi"), /\b\d{4}-\d{1,2}-\d{1,2}\b/g, /\b\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?\b/g];
  // "payment 4 of 24" is last month's "payment 3 of 24"; a money amount at the end of a line: 45.00, $1,234.56, -$10.00, −10.00, ($10.00), 10.00 CR
  const AMT = /(?:^|\s)([-−–]\s*)?(\()?\s*([-−–]\s*)?(?:US)?\$?\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})\s*(\))?\s*(CR|cr|Cr)?\s*$/;
  const TOTAL = /\b(sub-?total|total|amount due|balance due|due by|pay this amount)\b/i;
  const ACCOUNT = /\b(previous balance|balance forward|last bill|thank you|amount paid|paid on|payments? (received|made|applied))\b/i, PAYMENT = /^payments?\b/i;
  const DISCOUNT = /\b(discount|credit|promo(tion(al)?)?|savings?|rebate|bundle|loyalty|autopay|paperless)\b/i;
  const TAX = /\b(tax(es)?|vat|gst|hst|pst)\b/i;
  const HEADS = /\b(will (increase|change|rise|go up)|price (change|increase|rise)|rate (change|increase)|new (rate|price)|(promo(tion(al)?)?|discount|offer|introductory)\w*\s+(\w+\s+){0,5}(ends?|ended|expires?|expired|expiring)|no longer|last month of)\b/i;
  const PRIORITY = [/\b(total )?(current|new) charges\b|\bcharges this (month|period)\b/i, /\btotal (amount )?due\b|\bamount due\b|\bbalance due\b|\bpay this amount\b/i, /^\s*total\b/i];

  const cents = (x) => Math.round(x * 100);
  const key = (label) => { let s = label.toLowerCase(); for (const r of DATES) s = s.replace(r, " "); s = s.replace(/\b\d+\s*of\s*(\d+)\b/g, "n of $1"); return s.replace(/[^a-z0-9%]+/g, " ").replace(/\s+/g, " ").trim(); };
  function parse(text) {
    const lines = [], notes = [], totals = [];
    for (const rawLine of String(text || "").replace(/\r/g, "").split("\n")) {
      const raw = rawLine.replace(/\s+/g, " ").trim(); if (!raw || raw.length > 200) continue;
      if (HEADS.test(raw)) notes.push(raw);
      const m = AMT.exec(raw); if (!m) continue;
      const label = raw.slice(0, m.index).replace(/[\s:.…·•\-–—]+$/, "").trim(); const k = key(label);
      if (!k || !/[a-z]/.test(k)) continue;
      const neg = !!(m[1] || m[3] || (m[2] && m[6]) || m[7]), amount = (neg ? -1 : 1) * cents(Number(m[4].replace(/,/g, "") + "." + m[5]));
      const kind = TOTAL.test(label) ? "total" : ACCOUNT.test(label) || PAYMENT.test(label) && amount < 0 ? "account" : amount < 0 || DISCOUNT.test(label) && amount <= 0 ? "discount" : TAX.test(label) ? "tax" : "charge";
      const line = { label, key: k, amount, raw, kind };
      if (kind === "total") totals.push(line); else lines.push(line);
    }
    const seen = new Map(); for (const l of lines) { l.n = (seen.get(l.key) || 0) + 1; seen.set(l.key, l.n); }
    let total = null; for (const p of PRIORITY) { const t = totals.filter((x) => p.test(x.label) && !/sub-?total/i.test(x.label)); if (t.length) { total = t[t.length - 1]; break; } }
    return { lines, total, notes };
  }

  const money = (c) => (c < 0 ? "−" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (c) => (c > 0 ? "+" : c < 0 ? "−" : "") + "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function compare(beforeText, afterText) {
    const B = typeof beforeText === "string" ? parse(beforeText) : beforeText, A = typeof afterText === "string" ? parse(afterText) : afterText;
    const id = (l) => l.key + "#" + l.n, was = new Map(B.lines.filter((l) => l.kind !== "account").map((l) => [id(l), l])), rows = [];
    for (const a of A.lines) { if (a.kind === "account") continue; const b = was.get(id(a)); was.delete(id(a)); rows.push(row(b || null, a)); }
    for (const b of was.values()) rows.push(row(b, null));
    const explained = rows.reduce((s, r) => s + r.change, 0);
    const total = B.total && A.total ? { before: B.total, after: A.total, change: A.total.amount - B.total.amount } : null;
    const unexplained = total ? total.change - explained : null;
    const notes = A.notes.filter((x) => !B.notes.includes(x)), questions = [];
    for (const r of rows) {
      if (r.status === "up" && (r.after.kind !== "tax" || r.change >= 500)) questions.push("“" + r.label + "” went from " + money(r.before.amount) + " to " + money(r.after.amount) + " (" + signed(r.change) + "). Why, and can it go back to " + money(r.before.amount) + "?");
      else if (r.status === "new") questions.push("There's a new charge, “" + r.label + "” (" + money(r.after.amount) + "). What is it, and when did I agree to it?");
      else if (r.status === "discount-ended") questions.push("My “" + r.label + "” (" + money(r.before.amount) + ") isn't on this bill. Has it ended? Can it be renewed, or is there a current offer that matches it?");
      else if (r.status === "discount-smaller") questions.push("“" + r.label + "” went from " + money(r.before.amount) + " to " + money(r.after.amount) + ". Why is it smaller?");
    }
    if (total && Math.abs(unexplained) >= 100) questions.push("The bill went " + (total.change >= 0 ? "up" : "down") + " by " + money(Math.abs(total.change)) + ", but the charges listed account for " + signed(explained) + ". What's the other " + money(Math.abs(unexplained)) + "?");
    for (const x of notes) questions.push("The bill says: “" + x.replace(/[.!\s]+$/, "") + ".” What will that mean for what I pay, and from when?");
    const counts = {}; for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
    return { rows, total, explained, unexplained, notes, questions, counts, before: B, after: A };
  }
  function row(b, a) {
    const l = a || b, label = l.label, isDisc = (b ? b.kind : a.kind) === "discount" || (a && a.kind === "discount"), change = (a ? a.amount : 0) - (b ? b.amount : 0);
    let status;
    if (!b) status = isDisc ? "discount-new" : "new";
    else if (!a) status = isDisc ? "discount-ended" : "gone";
    else if (change === 0) status = "same";
    else if (isDisc) status = Math.abs(a.amount) < Math.abs(b.amount) ? "discount-smaller" : "discount-bigger";
    else status = change > 0 ? "up" : "down";
    return { label, before: b, after: a, change, pct: b && a && b.amount > 0 ? Math.round((change / b.amount) * 100) : null, status };
  }
  const api = { parse, compare, money, signed };
  if (typeof module === "object" && module.exports) module.exports = api; else root.BillWatch = api;
})(typeof self !== "undefined" ? self : this);
