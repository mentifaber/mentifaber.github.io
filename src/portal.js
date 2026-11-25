// The Workshop Portal (/api/portal/*): one link per client, one board for the workshop.
//
// The owner (a Vigil session) opens jobs: a title, the service, the client's name, a quote with line items, status,
// an invoice, a Device Passport link, the address of a site the workshop hosts for them, and private notes. Each job
// has a random 128-bit token; the client's link (/portal#<id>.<token>) shows their job without the private notes and
// lets them approve the quote and write to the workshop. Nothing else is reachable without the owner's session.
//
// Jobs are kept in the Store Durable Object (key "job:<id>"). A hosted site's status is checked from here (a HEAD
// request) because a browser can't read another site's status: when someone opens the job (at most every 5 minutes),
// and around the clock by uptimeSweep() on the 15-minute cron. Two failed checks in a row tell the workshop (an urgent
// AutoFaber alert on its phone); the first good check after that says it's back and notes the outage on the job's
// timeline, where the client sees it too. Each job keeps its last 30 days of checks, so both sides see the uptime.
// The ids of jobs with a site are kept in "portal:sites", so the sweep reads only those jobs.
const STATUSES = ["quote", "approved", "in-progress", "ready", "done", "cancelled"];
const SERVICES = ["repair", "it", "hosting", "websites", "software", "other"];
const MAX_JOBS = 500, MAX_TIMELINE = 200, CLIENT_MSGS_DAY = 30, UPTIME_DAYS = 30, FAILS_TO_ALERT = 2;
const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, n);
const money = (v) => { const n = Number(v); return isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : undefined; };
const rid = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const same = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

function quoteOf(q) {
  if (!q || typeof q !== "object") return null;
  const items = (Array.isArray(q.items) ? q.items : []).slice(0, 30).map((i) => ({ desc: clean(i && i.desc, 160), amount: money(i && i.amount) })).filter((i) => i.desc && i.amount !== undefined);
  if (!items.length) return null;
  return { items, total: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100, note: clean(q.note, 600), currency: /^[A-Z]{3}$/.test(q.currency) ? q.currency : "USD" };
}
function siteOf(u) { u = clean(u, 200); if (!u) return null; try { const x = new URL(/^https?:\/\//.test(u) ? u : "https://" + u); return x.protocol === "https:" || x.protocol === "http:" ? x.origin + x.pathname : null; } catch (e) { return null; } }
function passportOf(u) { u = clean(u, 2000); return /^https:\/\/mentifaber\.org\/passport#[A-Za-z0-9_.-]+$/.test(u) || /^\/passport#[A-Za-z0-9_.-]+$/.test(u) ? u : null; }

// the last 30 days of checks: share of good ones, and how many
function uptimeOf(j) {
  const u = j.uptime; if (!u || !u.days) return null; let n = 0, ok = 0;
  for (const [c, g] of Object.values(u.days)) { n += c; ok += g; }
  return n ? { pct: Math.round((ok / n) * 10000) / 100, checks: n, days: Object.keys(u.days).length, down: u.down || null } : null;
}
// what the client sees: everything but the token and the workshop's private notes
const forClient = (j) => ({ id: j.id, title: j.title, service: j.service, status: j.status, client: { name: j.client.name }, quote: j.quote, approvedAt: j.approvedAt || null,
  invoice: j.invoice || null, passport: j.passport || null, site: j.site ? { url: j.site, check: j.siteCheck || null, uptime: uptimeOf(j) } : null, timeline: j.timeline.filter((t) => !t.private), created: j.created, updated: j.updated });

async function probe(url, f = fetch) {
  const t0 = Date.now();
  try { const r = await f(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "mentifaber.org Workshop Portal uptime check" } }); return { up: r.status < 500, status: r.status, ms: Date.now() - t0, at: Date.now() }; }
  catch (e) { return { up: false, status: 0, ms: Date.now() - t0, at: Date.now() }; }
}
async function checkSite(st, j) {
  if (!j.site || (j.siteCheck && Date.now() - j.siteCheck.at < 5 * 60e3)) return j;
  j.siteCheck = await probe(j.site); await st.kvPut("job:" + j.id, j); return j;
}
const hhmm = (t) => new Date(t).toISOString().slice(11, 16) + " UTC";
const mins = (ms) => { const m = Math.max(1, Math.round(ms / 60e3)); return m < 90 ? m + " minute" + (m === 1 ? "" : "s") : Math.round(m / 6) / 10 + " hours"; };
// one check into the job's record; says "down" (the second failure in a row) or "up" (the first good check after)
export function record(j, c, at = c.at) {
  const u = j.uptime || (j.uptime = { days: {}, fails: 0, down: null }), d = new Date(at).toISOString().slice(0, 10);
  const day = u.days[d] || (u.days[d] = [0, 0]); day[0]++; if (c.up) day[1]++;
  for (const k of Object.keys(u.days).sort().slice(0, -UPTIME_DAYS)) delete u.days[k];
  j.siteCheck = c;
  if (!c.up) { if (!u.fails) u.first = at; u.fails++; if (u.fails === FAILS_TO_ALERT && !u.down) { u.down = u.first; return "down"; } return null; }
  const was = u.down; u.fails = 0; u.first = null; u.down = null;
  if (!was) return null;
  j.timeline.push({ at, by: "workshop", text: "Your site didn't answer from " + hhmm(was) + " to " + hhmm(at) + " (about " + mins(at - was) + "). It's back up." });
  j.timeline = j.timeline.slice(-MAX_TIMELINE); j.updated = at; return "up";
}
// keep "portal:sites" in step with the jobs that have a site
async function siteIndex(st, j, gone) {
  let ids = await st.kvGet("portal:sites"); if (!Array.isArray(ids)) return; // built on the next sweep
  const want = !gone && !!j.site && j.status !== "cancelled", has = ids.includes(j.id);
  if (want !== has) await st.kvPut("portal:sites", want ? ids.concat(j.id) : ids.filter((x) => x !== j.id));
}
// every 15 minutes (worker.js): check each hosted site, record it, and tell the workshop when one goes down or comes back
export async function uptimeSweep(env, deps = {}, at = Date.now()) {
  const st = env.STORE.get(env.STORE.idFromName("main"));
  let ids = await st.kvGet("portal:sites");
  if (!Array.isArray(ids)) { ids = (await st.kvList("job:")).filter(([, j]) => j.site && j.status !== "cancelled").map(([, j]) => j.id); await st.kvPut("portal:sites", ids); }
  let checked = 0, told = 0;
  for (const id of ids) {
    const j = await st.kvGet("job:" + id); if (!j || !j.site || j.status === "cancelled") continue;
    const c = await probe(j.site, deps.fetch); c.at = at; const ev = record(j, c, at); await st.kvPut("job:" + id, j); checked++;
    if (ev && deps.alert) {
      const host = j.site.replace(/^https?:\/\//, "").replace(/\/$/, ""), who = (j.client && j.client.name) || j.title;
      await deps.alert(ev === "down"
        ? { level: "critical", title: "⚠ " + host + " is down", body: who + "'s site hasn't answered two checks in a row" + (c.status ? " (it said " + c.status + ")" : " (no answer)") + ", since " + hhmm(j.uptime.down) + ".", url: "/portal" }
        : { level: "notable", title: "✓ " + host + " is back", body: who + "'s site is answering again. The outage is on the job's timeline.", url: "/portal" }).catch(() => {});
      told++;
    }
  }
  return { checked, told };
}

function apply(j, b, now) {
  if (b.title !== undefined) { const t = clean(b.title, 120); if (!t) throw err("give the job a title"); j.title = t; }
  if (b.service !== undefined) { if (!SERVICES.includes(b.service)) throw err("unknown service"); j.service = b.service; }
  if (b.clientName !== undefined) j.client.name = clean(b.clientName, 80);
  if (b.clientEmail !== undefined) j.client.email = clean(b.clientEmail, 120);
  if (b.quote !== undefined) { const q = b.quote === null ? null : quoteOf(b.quote); if (b.quote !== null && !q) throw err("a quote needs at least one line with an amount"); j.quote = q; j.approvedAt = null; if (q) j.timeline.push({ at: now, by: "workshop", text: "Quote: " + q.currency + " " + q.total.toFixed(2) }); }
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) throw err("unknown status"); if (b.status !== j.status) j.timeline.push({ at: now, by: "workshop", text: "Status: " + b.status.replace("-", " ") }); j.status = b.status; }
  if (b.invoice !== undefined) { if (b.invoice === null) j.invoice = null; else { const a = money(b.invoice.amount); if (a === undefined) throw err("an invoice needs an amount"); j.invoice = { amount: a, due: /^\d{4}-\d\d-\d\d$/.test(b.invoice.due) ? b.invoice.due : null, paid: !!b.invoice.paid, note: clean(b.invoice.note, 300) }; } }
  if (b.passport !== undefined) { if (b.passport === null || b.passport === "") j.passport = null; else { const p = passportOf(b.passport); if (!p) throw err("that isn't a Device Passport link"); j.passport = p; j.timeline.push({ at: now, by: "workshop", text: "Device Passport issued" }); } }
  if (b.site !== undefined) { if (b.site === null || b.site === "") { j.site = null; j.siteCheck = null; } else { const s = siteOf(b.site); if (!s) throw err("that isn't a web address"); j.site = s; j.siteCheck = null; } }
  if (b.note !== undefined) { const t = clean(b.note, 2000); if (t) j.timeline.push({ at: now, by: "workshop", text: t, private: !!b.private }); }
  j.timeline = j.timeline.slice(-MAX_TIMELINE); j.updated = now; return j;
}

export async function portal(req, env, json, owner) {
  const url = new URL(req.url), parts = url.pathname.replace(/^\/api\/portal\/?/, "").split("/").filter(Boolean);
  const st = env.STORE.get(env.STORE.idFromName("main")), now = Date.now();
  let b = {}; if (req.method === "POST") { try { b = await req.json(); } catch (e) { return json({ error: "send JSON" }, 400); } if (!b || typeof b !== "object") b = {}; }
  try {
    // ── the workshop's board ──
    if (parts[0] === "jobs") {
      if (!owner) return json({ error: "only the workshop can see the board" }, 403);
      if (parts.length === 1 && req.method === "GET") { const all = (await st.kvList("job:")).map(([, j]) => j).sort((a, c) => c.updated - a.updated); return json({ jobs: all }); }
      if (parts.length === 1 && req.method === "POST") {
        if ((await st.kvList("job:")).length >= MAX_JOBS) throw err("the board is full: close out old jobs first", 409);
        const j = apply({ id: rid(5), token: rid(16), client: { name: "" }, status: "quote", service: "other", timeline: [], created: now, updated: now, title: "" }, { service: "other", ...b, title: b.title || "" }, now);
        j.timeline.unshift({ at: now, by: "workshop", text: "Job opened" }); await st.kvPut("job:" + j.id, j); await siteIndex(st, j); return json({ job: j });
      }
      const id = parts[1]; if (!/^[0-9a-f]{10}$/.test(id || "")) throw err("no such job", 404);
      const j = await st.kvGet("job:" + id); if (!j) throw err("no such job", 404);
      if (req.method === "POST") { apply(j, b, now); await st.kvPut("job:" + id, j); await siteIndex(st, j); return json({ job: j }); }
      if (req.method === "DELETE") { await st.kvDel("job:" + id); await siteIndex(st, j, true); return json({ ok: true }); }
      const seen = await checkSite(st, j); seen.uptimeSummary = uptimeOf(seen); if (seen.unread) { seen.unread = false; await st.kvPut("job:" + id, seen); seen.unread = true; } // opening it marks it read; this answer still says it was new
      return json({ job: seen });
    }
    // ── a client's view, by link ──
    if (parts[0] === "job" && /^[0-9a-f]{10}$/.test(parts[1] || "")) {
      const t = req.method === "POST" ? String(b.t || "") : url.searchParams.get("t") || "";
      const j = await st.kvGet("job:" + parts[1]); if (!j || !/^[0-9a-f]{32}$/.test(t) || !same(t, j.token)) throw err("this link doesn't open a job: ask the workshop for a new one", 404);
      if (req.method === "GET" && parts.length === 2) return json({ job: forClient(await checkSite(st, j)) });
      if (req.method === "POST" && parts[2] === "approve") {
        if (!j.quote) throw err("there's no quote to approve yet"); if (j.status !== "quote") throw err("this quote has already been answered", 409);
        j.status = "approved"; j.approvedAt = now; j.timeline.push({ at: now, by: "client", text: "Approved the quote (" + j.quote.currency + " " + j.quote.total.toFixed(2) + ")" }); j.updated = now;
        await st.kvPut("job:" + j.id, j); return json({ job: forClient(j) });
      }
      if (req.method === "POST" && parts[2] === "message") {
        const text = clean(b.text, 2000); if (!text) throw err("write something first");
        if (!(await st.hit("portal-msg:" + j.id, CLIENT_MSGS_DAY, 864e5))) throw err("that's today's " + CLIENT_MSGS_DAY + " messages on this job; the workshop will reply", 429);
        j.timeline.push({ at: now, by: "client", text }); j.timeline = j.timeline.slice(-MAX_TIMELINE); j.updated = now; j.unread = true;
        await st.kvPut("job:" + j.id, j); return json({ job: forClient(j) });
      }
    }
    return json({ error: "not here" }, 404);
  } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, e.status || 500); }
}
