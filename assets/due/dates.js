/* Due Dates (game plan GP-10.2): the dates in letters, renewals and notices that ask something of you, each with the
   sentence it's in, worked out on the device (nothing is sent anywhere). Exposed as window.DueDates, and to Node as
   module.exports for the tests:
     DueDates.find(text, { now, dayFirst, source }) → [{ date: "YYYY-MM-DD", time: "HH:MM" | null, kind, label, sentence, source }]
     DueDates.ics(items, { now })                   → an iCalendar file: one event per date, with a reminder before it
   A date counts when its sentence asks for something by or on it (pay, renew, reply, an appointment, an expiry, a
   deadline). The letter's own date, dates in the past and dates in passing ("since 2019") are left out. */
(function (root) {
  "use strict";
  const DAY = 864e5, MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const MONRE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
  const WD = "(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?,?\\s+)?";
  // every way a letter writes a date; each gives [index, length, y, m (0-11), d] or null
  const PATTERNS = [
    [new RegExp("\\b" + WD + "(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+" + MONRE + ",?(?:\\s+(\\d{4}))?\\b", "gi"), (m) => [m[3] ? +m[3] : null, MON.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1]]],
    [new RegExp("\\b" + WD + MONRE + "\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b", "gi"), (m) => [m[3] ? +m[3] : null, MON.indexOf(m[1].slice(0, 3).toLowerCase()), +m[2]]],
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m) => [+m[1], +m[2] - 1, +m[3]]],
    [/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4}|\d{2})\b/g, (m, df) => { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return df ? [y, +m[2] - 1, +m[1]] : [y, +m[1] - 1, +m[2]]; }],
  ];
  const TIME = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)|\b(?:at\s+)(\d{1,2}):(\d{2})\b|\b(\d{1,2}):(\d{2})\s*(?:hrs|h)\b/i;
  // what the sentence asks, in order of how specific it is
  const KINDS = [
    ["appointment", "Appointment", /\b(appointment|attend|hearing|jury|summon(s|ed)|interview|exam(ination)?|clinic|surgery|consultation|visit (from|by)|engineer will|technician will|inspection|scheduled for|report to)\b/i],
    ["pay", "Pay", /\b(pay(ment)?s? (is |are )?(due|by|before|no later)|pay (the|your|this|it|in full)|amount due|balance due|due date|direct debit will|will be (debited|taken|charged)|charged on|bill(ed)? on|minimum payment|payment of)\b/i],
    ["renew", "Renew", /\b(renew(al|s|ed)?|re-?register|reapply)\b/i],
    ["reply", "Reply", /\b(respond|reply|return (the|this|your)|send (us|back|the)|submit|appeal|complete (the|this|and)|sign and return|contact us|call us|let us know|tell us|claim (by|before)|register (by|before)|opt[- ]out|object)\b/i],
    ["expires", "Expires", /\b(expir(es|y|ing|ation|ed)|valid (until|through|to|thru)|ends? on|end date|will end|runs out|no longer (be )?valid|cover(age)? (ends|until))\b/i],
    ["deadline", "Deadline", /\b(by|before|no later than|not later than|deadline|must|within|on or before|closing date|last day)\b/i],
  ];
  const IN_PASSING = /\b(since|dated|as of|from|issued( on)?|received( on)?|sent( on)?|on file|last (paid|payment|updated)|statement date|date of (this )?(letter|notice|issue|birth)|born|member since|effective( from| date)?)\s*:?\s*$/i;
  const pad = (n) => String(n).padStart(2, "0"), iso = (y, m, d) => y + "-" + pad(m + 1) + "-" + pad(d);
  const valid = (y, m, d) => { const t = Date.UTC(y, m, d), x = new Date(t); return y > 1900 && x.getUTCMonth() === m && x.getUTCDate() === d ? t : null; };

  function sentences(text) {
    const out = []; for (const para of String(text || "").replace(/\r/g, "").split(/\n\s*\n|\n(?=[A-Z0-9•\-–*])/)) {
      const flat = para.replace(/\s+/g, " ").trim(); if (!flat) continue;
      for (const s of flat.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)) if (s.trim()) out.push(s.trim()); }
    return out;
  }
  function find(text, o = {}) {
    const now = o.now || Date.now(), today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
    const out = [], seen = new Set(), ss = sentences(text);
    ss.forEach((s, si) => {
      const hits = [];
      for (const [re, get] of PATTERNS) { re.lastIndex = 0; let m; while ((m = re.exec(s))) { if (hits.some((h) => m.index < h.i + h.len && h.i < m.index + m[0].length)) continue; const v = get(m, !!o.dayFirst); if (!v || v[1] < 0) continue; hits.push({ i: m.index, len: m[0].length, v }); } }
      for (const h of hits.sort((a, b) => a.i - b.i)) {
        let [y, mo, d] = h.v, t;
        if (y === null) { y = new Date(now).getUTCFullYear(); t = valid(y, mo, d); if (t !== null && t < today - 30 * DAY) t = valid(++y, mo, d); } else t = valid(y, mo, d);
        if (t === null || t < today) continue; // gone already, or not a date
        const before = s.slice(Math.max(0, h.i - 40), h.i);
        if (IN_PASSING.test(before)) continue;
        // the words that go with this date: from the previous date (or the sentence's start) to the next one
        const around = s.slice(Math.max(0, h.i - 120), h.i + h.len + 60);
        const k = KINDS.find(([, , re]) => re.test(around)); if (!k) continue; // a date in passing
        if (si === 0 && ss.length > 2 && s.length < 40 && !/\b(by|before|on)\b/i.test(before)) continue; // the letter's own date, at the top
        const tm = TIME.exec(s.slice(h.i, h.i + h.len + 40)) || TIME.exec(before.slice(-25));
        let time = null; if (tm) { let hh = +(tm[1] || tm[4] || tm[6]), mm = +(tm[2] || tm[5] || tm[7] || 0); const ap = (tm[3] || "").toLowerCase(); if (ap.startsWith("p") && hh < 12) hh += 12; if (ap.startsWith("a") && hh === 12) hh = 0; if (hh < 24 && mm < 60) time = pad(hh) + ":" + pad(mm); }
        const date = iso(y, mo, d), key = date + "|" + k[0] + "|" + s.slice(0, 60); if (seen.has(key)) continue; seen.add(key);
        out.push({ date, time, kind: k[0], label: k[1], sentence: s.slice(0, 400), at: h.i, len: h.len, ...(o.source ? { source: String(o.source).slice(0, 120) } : {}) });
      }
    });
    return out.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  }

  // ── iCalendar ── all-day events unless there's a time; a reminder 3 days before a deadline, 1 day before an appointment
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = (line) => { const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line; const out = []; let cur = "";
    for (const ch of line) { if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch; } out.push(cur); return out.join("\r\n "); };
  const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  function ics(items, o = {}) {
    const now = o.now || Date.now(), L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mentifaber//Due Dates//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    items.forEach((it, i) => {
      const d = it.date.replace(/-/g, ""), uid = d + "-" + i + "-" + (Math.abs([...(it.title || it.sentence || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36)) + "@due.mentifaber.org";
      L.push("BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + stamp(now));
      if (it.time) { const [hh, mm] = it.time.split(":"); L.push("DTSTART:" + d + "T" + hh + mm + "00", "DURATION:PT1H"); }
      else { const nx = new Date(Date.parse(it.date + "T00:00:00Z") + DAY).toISOString().slice(0, 10).replace(/-/g, ""); L.push("DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + nx); }
      L.push("SUMMARY:" + esc(it.title || it.label + ": " + it.sentence.slice(0, 60)), "DESCRIPTION:" + esc([it.sentence, it.source ? "From: " + it.source : ""].filter(Boolean).join("\n\n")));
      L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(it.title || it.label), "TRIGGER:-P" + (it.kind === "appointment" ? 1 : 3) + "D", "END:VALARM", "END:VEVENT");
    });
    L.push("END:VCALENDAR"); return L.map(fold).join("\r\n") + "\r\n";
  }
  const api = { find, ics, sentences, KINDS: KINDS.map(([k, l]) => [k, l]) };
  if (typeof module === "object" && module.exports) module.exports = api; else root.DueDates = api;
})(typeof window !== "undefined" ? window : globalThis);
