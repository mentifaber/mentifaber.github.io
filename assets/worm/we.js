/* Worm Eater · the scanner. Looks a product up in the open databases (Open Food Facts, then Open Beauty Facts), splits the
   label into ingredients, rates each one from the table with its reason, and keeps the unknowns visible. The score
   only counts what was understood, and says how much that was. Two old bugs are fixed here on purpose: substitutes
   never include the product itself, and anything below a coverage floor (or with a suspiciously short list) is kept
   out of the substitute ranking, because absence isn't good news. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const { T, E } = window.WE_TABLE;
const DB = [["Open Food Facts", "https://world.openfoodfacts.org"], ["Open Beauty Facts", "https://world.openbeautyfacts.org"]];
const FIELDS = "code,product_name,product_name_en,brands,image_front_small_url,image_front_url,ingredients_text,ingredients_text_en,categories_tags,quantity";
const TIERS = [[85, "PRISTINE", "var(--ok)"], [65, "DECENT", "#b6e36a"], [45, "SUSPECT", "var(--mid)"], [25, "CRAWLING", "#ff9a4a"], [0, "INFESTED", "var(--bad)"]];
const COVER_MIN = 0.5, ALT_COVER = 0.6;
const get = (u, ms) => fetch(u, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms || 15000) : undefined }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });

// ── reading a label ──
function split(text) { // top-level items, keeping (sub, items) with their parent
  const out = []; let depth = 0, cur = "";
  for (const ch of String(text || "")) { if ("([".includes(ch)) depth++; if (")]".includes(ch)) depth = Math.max(0, depth - 1); if ((ch === "," || ch === ";") && depth === 0) { out.push(cur); cur = ""; } else cur += ch; }
  out.push(cur); return out.map((s) => s.trim()).filter(Boolean);
}
const norm = (s) => s.toLowerCase().replace(/^ingredients?\s*:\s*/, "").replace(/\b(contains )?(\d+(\.\d+)?\s*%|2% or less of|less than 2% of|one or more of the following)\b:?/g, "").replace(/\*|_|\.$/g, "").replace(/\borganic\b|\bbio\b/g, "").replace(/^[a-z][a-z \-]{2,30}:\s*/, "").replace(/\s+/g, " ").trim(); // "emulsifier: x" → "x"
function rate(raw) {
  const full = norm(raw), m = full.match(/^([^(\[]*)[(\[](.*)[)\]]\s*$/), name = (m ? m[1] : full).trim(), inner = m ? m[2] : "";
  const look = (n) => { if (!n) return null; if (T[n]) return T[n]; const e = n.replace(/[\s-]/g, "").match(/^e(\d{3,4}[a-z]?)$/); if (e && E["e" + e[1]] && T[E["e" + e[1]]]) return T[E["e" + e[1]]]; if (n.endsWith("s") && T[n.slice(0, -1)]) return T[n.slice(0, -1)]; return null; };
  const en = full.match(/\be\s?-?(\d{3,4}[a-z]?)\b/);
  let hit = look(name) || look(inner) || (en ? T["e" + en[1]] || (E["e" + en[1]] && T[E["e" + en[1]]]) || null : null);
  if (!hit) { // the longest known name inside it, as a whole phrase
    let best = null; for (const k in T) if (k.length >= 5 && k.length > (best ? best.length : 0) && new RegExp("(^|[^a-z])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?($|[^a-z])").test(name + " " + inner)) best = k;
    if (best) hit = T[best];
  }
  return { label: raw.replace(/\s+/g, " ").trim().replace(/^ingredients?\s*:\s*/i, ""), name, inner, r: hit ? hit.r : "unk", why: hit ? hit.why : "Not in the table. Shown here instead of being quietly counted as fine.", known: !!hit && hit.r !== "unk", sub: !hit && inner.includes(",") ? split(inner) : null };
}
function analyse(text) {
  let items = split(text).map(rate);
  items = items.flatMap((it) => (it.sub && it.r === "unk" ? [it, ...it.sub.map(rate).map((x) => ({ ...x, child: true }))].filter((x, i) => i > 0 || !x.sub) : [it])); // an unknown parent is judged by what it's made of
  const top = items, n = top.length, cut = Math.ceil(n / 3);
  // labels are in order of weight, so the first few ingredients ARE the product: weight them heavily
  const W = [3, 2.2, 1.6], sugar = (x) => /^Added sugar/.test(x.why);
  let score = 100; top.forEach((x, i) => { const w = W[i] || (i < cut ? 1.3 : 1); if (x.r === "bad") score -= 14 * w; else if (x.r === "mid") score -= 7 * w; if (i < 2 && sugar(x)) score -= 15; });
  const known = top.filter((x) => x.known).length, cover = n ? known / n : 0;
  return { items: top, n, known, cover, score: Math.max(0, Math.min(100, Math.round(score))), short: n > 0 && n <= 2, cut: /(\.\.\.|…)\s*$/.test(String(text || "").trim()) };
}
const tier = (s) => TIERS.find(([min]) => s >= min);

// ── the databases ──
async function byCode(code) {
  for (const [name, base] of DB) { try { const j = await get(base + "/api/v2/product/" + encodeURIComponent(code) + ".json?fields=" + FIELDS); if (j && j.status === 1 && j.product) return { p: { ...j.product, code: j.product.code || code }, src: name, base }; } catch (e) {} }
  return null;
}
async function search(q) {
  const out = [];
  for (const [name, base] of DB) { try { const j = await get(base + "/cgi/search.pl?search_terms=" + encodeURIComponent(q) + "&search_simple=1&action=process&json=1&page_size=12&fields=code,product_name,brands,image_front_small_url,quantity"); (j.products || []).forEach((p) => p.code && p.product_name && out.push({ ...p, src: name })); } catch (e) {} if (out.length >= 8) break; }
  return out;
}
async function alternatives(prod, a) {
  const cats = (prod.p.categories_tags || []).filter((c) => /^en:/.test(c)); const cat = cats[cats.length - 1]; if (!cat) return [];
  const j = await get(prod.base + "/api/v2/search?categories_tags=" + encodeURIComponent(cat) + "&fields=" + FIELDS + "&page_size=40&sort_by=unique_scans_n", 20000).catch(() => ({ products: [] }));
  return (j.products || []).filter((p) => p.code && p.code !== prod.p.code) // bug 1: never the product itself
    .map((p) => ({ p, a: analyse(p.ingredients_text_en || p.ingredients_text) }))
    .filter((x) => x.a.n >= 3 && x.a.cover >= ALT_COVER && !x.a.cut && x.a.score > a.score) // bug 2: incomplete lists can't win
    .sort((x, y) => y.a.score - x.a.score).slice(0, 3);
}

// ── screens ──
const show = (id) => { ["intro", "results", "product"].forEach((x) => ($(x).hidden = x !== id)); scrollTo({ top: 0 }); };
const loading = (where) => { $(where).innerHTML = '<div class="spin"></div>'; show(where); };
async function find(q) {
  q = String(q || "").trim(); if (!q) return;
  if (/^\d{6,14}$/.test(q)) return open(q);
  loading("results"); const hits = await search(q);
  $("results").innerHTML = "<h3>Results for “" + esc(q) + "”</h3>" + (hits.length ? '<div class="list">' + hits.map((p) => '<button class="hit" data-code="' + esc(p.code) + '">' + (p.image_front_small_url ? '<img src="' + esc(p.image_front_small_url) + '" alt="" loading="lazy">' : '<img alt="">') + "<span><b>" + esc(p.product_name) + "</b><small>" + esc([p.brands, p.quantity, p.src].filter(Boolean).join(" · ")) + "</small></span></button>").join("") + "</div>" : '<p class="empty">Nothing found in the open databases. Try a barcode, or fewer words.</p>');
}
async function open(code) {
  loading("product"); history.replaceState(null, "", "?code=" + encodeURIComponent(code));
  const prod = await byCode(code);
  if (!prod) { $("product").innerHTML = '<div class="card"><h2>Not in the open databases</h2><p class="empty">Barcode ' + esc(code) + " isn't in Open Food Facts or Open Beauty Facts yet. Anyone can add it at <a href=\"https://world.openfoodfacts.org\" target=\"_blank\" rel=\"noopener\">openfoodfacts.org</a>.</p></div>"; return; }
  const p = prod.p, text = p.ingredients_text_en || p.ingredients_text || "", a = analyse(text), name = p.product_name_en || p.product_name || "Unnamed product";
  remember(code, name);
  const t = tier(a.score), scored = a.n && a.cover >= COVER_MIN;
  const seg = (r, col) => { const k = a.items.filter((x) => x.r === r).length; return k ? '<i style="width:' + (k / a.n) * 100 + "%;background:" + col + '"></i>' : ""; };
  $("product").innerHTML = '<div class="card"><div class="head">' + (p.image_front_small_url ? '<img src="' + esc(p.image_front_small_url) + '" alt="">' : "<img alt=\"\">") +
    "<div><h2>" + esc(name) + "</h2><small>" + esc([p.brands, p.quantity, prod.src, "#" + p.code].filter(Boolean).join(" · ")) + "</small></div>" +
    (scored ? '<div class="score"><b style="color:' + t[2] + '">' + a.score + '</b><span style="color:' + t[2] + '">' + t[1] + "</span></div>" : '<div class="score dim"><b>?</b><span>' + (a.n ? "TOO MUCH UNKNOWN" : "NO LABEL") + "</span></div>") + "</div>" +
    (a.n ? '<div class="cov"><div class="bar">' + seg("ok", "var(--ok)") + seg("mid", "var(--mid)") + seg("bad", "var(--bad)") + seg("unk", "var(--unk)") + "</div><p><b>" + a.known + " of " + a.n + "</b> ingredients understood (" + Math.round(a.cover * 100) + "% coverage). " + (scored ? "The score stands only on those." : "That's too little of the label to stand behind a number, so there isn't one.") + "</p></div>" : '<p class="empty">The open databases have no ingredient list for this one, so there is nothing honest to score.</p>') +
    (a.short || a.cut ? '<div class="warn">' + (a.cut ? "The ingredient list looks cut off. " : "Only " + a.n + " ingredient" + (a.n > 1 ? "s" : "") + " listed. ") + "A short list can just be an incomplete record, and a clean-looking score on incomplete data is exactly the mistake this app exists to avoid.</div>" : "") +
    '<div class="ings" id="ings">' + a.items.map((x, i) => '<button class="ing r-' + x.r + (x.child ? " child" : "") + '" data-i="' + i + '"><i></i><span>' + (x.child ? "↳ " : "") + esc(x.label) + '</span><span class="tag">' + { ok: "FINE", mid: "WATCH", bad: "AVOID", unk: "UNKNOWN" }[x.r] + '</span><span class="why">' + esc(x.why) + "</span></button>").join("") + "</div>" +
    (a.items.some((x) => x.r === "unk") ? '<div class="row"><button class="btn" id="ai">Ask AI about the ' + a.items.filter((x) => x.r === "unk").length + " unknowns</button><small>Provisional reads from a free model, marked as provisional. They don't change the score.</small></div>" : "") +
    '</div><h3>Better in the same category</h3><div class="alts" id="alts"><div class="spin"></div></div>';
  $("ings").addEventListener("click", (e) => { const b = e.target.closest(".ing"); if (b) b.classList.toggle("open"); });
  const ai = $("ai"); if (ai) ai.addEventListener("click", () => classify(a, ai));
  show("product");
  const alts = await alternatives(prod, a).catch(() => []);
  $("alts").innerHTML = alts.length ? alts.map((x) => { const tt = tier(x.a.score); return '<button class="hit" data-code="' + esc(x.p.code) + '">' + (x.p.image_front_small_url ? '<img src="' + esc(x.p.image_front_small_url) + '" alt="" loading="lazy">' : "<img alt=\"\">") + "<span><b>" + esc(x.p.product_name || "Unnamed") + "</b><small>" + esc(x.p.brands || "") + " · " + x.a.score + " " + tt[1] + " · " + Math.round(x.a.cover * 100) + "% understood</small></span></button>"; }).join("") + '<p class="empty" style="padding:6px 0 0;font-size:13px">Never the product itself, and nothing with a short or poorly understood label.</p>'
    : '<p class="empty">Nothing in this category scores higher with a label complete enough to trust.</p>';
}
async function classify(a, btn) {
  btn.disabled = true; btn.textContent = "Asking…";
  const unk = a.items.map((x, i) => [x, i]).filter(([x]) => x.r === "unk").slice(0, 25);
  try {
    const ms = await get("/api/hive/models", 10000), pick = (ms.models || []).find((m) => /gpt-oss-120b/.test(m.id)) || (ms.models || []).find((m) => /^workers-ai\|/.test(m.id));
    if (!pick) throw new Error("no model available right now");
    const prompt = "You rate food and cosmetic ingredients for a label scanner. For each ingredient below, answer with a JSON array of objects {\"name\": exact name, \"rating\": \"ok\" | \"mid\" | \"bad\" | \"unk\", \"reason\": at most 22 words, measured, no alarmism}. Use \"unk\" when it's a vague category (like 'flavouring') or you aren't sure. Reply with the JSON only.\n\n" + unk.map(([x]) => "- " + x.label).join("\n");
    const r = await fetch("/api/hive/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: pick.id, messages: [{ role: "user", text: prompt }] }) }).then((x) => x.json());
    if (r.error) throw new Error(r.error);
    const arr = JSON.parse((String(r.text).match(/\[[\s\S]*\]/) || ["[]"])[0]);
    unk.forEach(([x, i], k) => { const v = arr.find((o) => String(o.name || "").toLowerCase() === x.label.toLowerCase()) || arr[k]; if (!v) return; const el = document.querySelector('.ing[data-i="' + i + '"]'); const rr = ["ok", "mid", "bad"].includes(v.rating) ? v.rating : "unk";
      el.className = "ing r-" + rr + " prov open"; el.querySelector(".tag").textContent = { ok: "FINE?", mid: "WATCH?", bad: "AVOID?", unk: "UNKNOWN" }[rr]; el.querySelector(".why").textContent = "Provisional (" + pick.name + "): " + (v.reason || "no reason given") + " Not part of the score."; });
    btn.textContent = "Provisional reads added";
  } catch (e) { btn.disabled = false; btn.textContent = "Couldn't ask: " + String(e.message || e).slice(0, 60); }
}

// ── camera ──
let stream = null, scanning = false;
async function scan() {
  if (!("BarcodeDetector" in window)) { alert("This browser can't read barcodes from the camera (Chrome on Android can). Type the number under the barcode instead."); $("q").focus(); return; }
  try {
    const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); const v = $("vid"); v.srcObject = stream; await v.play(); $("cam").hidden = false; scanning = true;
    const tick = async () => { if (!scanning) return; try { const codes = await det.detect(v); if (codes.length) { stopCam(); $("q").value = codes[0].rawValue; open(codes[0].rawValue); return; } } catch (e) {} setTimeout(tick, 180); }; tick();
  } catch (e) { stopCam(); alert("Couldn't open the camera: " + (e.message || e)); }
}
function stopCam() { scanning = false; $("cam").hidden = true; if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; }

// ── recent ──
function remember(code, name) { try { const r = JSON.parse(localStorage.getItem("we:recent") || "[]").filter((x) => x.code !== code); r.unshift({ code, name: name.slice(0, 40) }); localStorage.setItem("we:recent", JSON.stringify(r.slice(0, 8))); } catch (e) {} drawRecent(); }
function drawRecent() { let r = []; try { r = JSON.parse(localStorage.getItem("we:recent") || "[]"); } catch (e) {} $("recent").innerHTML = r.map((x) => '<button data-try="' + esc(x.code) + '">' + esc(x.name) + "</button>").join(""); }

$("find").addEventListener("submit", (e) => { e.preventDefault(); find($("q").value); });
$("scan").addEventListener("click", scan); $("camX").addEventListener("click", stopCam);
document.addEventListener("click", (e) => { const t = e.target.closest("[data-try]"); if (t) { $("q").value = t.dataset.try; find(t.dataset.try); } const h = e.target.closest(".hit[data-code]"); if (h) open(h.dataset.code); });
document.querySelector(".brand").addEventListener("click", () => { history.replaceState(null, "", location.pathname); show("intro"); });
drawRecent();
const c = new URLSearchParams(location.search).get("code"); if (c) open(c);
window.WormEater = { analyse, rate, open, find };
})();
