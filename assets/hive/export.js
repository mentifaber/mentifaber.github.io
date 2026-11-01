// Genesis · exports: an answer, downloaded as a Word document (.doc: HTML that Word, Pages and Google Docs open), a slide
// deck (one self-contained .html: a slide per heading, arrow keys to move, prints one slide per page), a spreadsheet of
// its tables (.csv) or Markdown. All made in the browser from the answer as shown; nothing is sent anywhere.
(() => {
"use strict";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// every Markdown table in the text, as rows of cells
function tables(md) {
  const out = [], lines = String(md || "").replace(/```[\s\S]*?```/g, "").split("\n"); let cur = null;
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replace(/\*\*|__|`/g, ""));
  for (const l of lines) {
    if (/^\s*\|.*\|\s*$/.test(l)) { if (/-/.test(l) && !/[^|\s:-]/.test(l)) continue; (cur = cur || []).push(cells(l)); } // the |---| line is skipped
    else if (cur) { if (cur.length > 1) out.push(cur); cur = null; }
  }
  if (cur && cur.length > 1) out.push(cur);
  return out;
}
const cell = (c) => (/[",\r\n]/.test(c) || /^[=+\-@]/.test(c) ? '"' + (/^[=+\-@]/.test(c) ? "'" : "") + c.replace(/"/g, '""') + '"' : c); // and no formulas run on open
function csv(md) { return tables(md).map((t) => t.map((r) => r.map(cell).join(",")).join("\r\n")).join("\r\n\r\n"); }

// the answer as shown, without the app's controls: widgets become a note, code keeps its text
function clean(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll("button, .acts, .fups, .ck, .cknote, .pyrun, .pre > header, .vwidget small").forEach((x) => x.remove());
  c.querySelectorAll(".vwidget").forEach((x) => { const p = document.createElement("p"); p.innerHTML = "<i>[An interactive widget: open this answer in AutoFaber to use it.]</i>"; x.replaceWith(p); });
  c.querySelectorAll("details").forEach((x) => x.setAttribute("open", ""));
  c.querySelectorAll("a.cite").forEach((a) => { a.textContent = "[" + a.textContent + "]"; });
  return c.innerHTML;
}
function doc(html, title) {
  return "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>" + esc(title) + "</title>" +
    "<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#111}h1,h2,h3,h4{font-family:'Calibri Light',Arial,sans-serif;color:#1d2b3a}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #9aa;padding:4px 8px}th{background:#eef1f4}pre,code{font-family:Consolas,monospace;font-size:10pt}pre{background:#f4f5f6;padding:8px}svg{max-width:16cm}a{color:#1f5fbf}</style></head>" +
    "<body><h1>" + esc(title) + "</h1>" + html + "<p style='color:#777;font-size:9pt'>Made with AutoFaber · mentifaber.org</p></body></html>";
}
// a slide per heading (h1–h3); a long stretch without one is split every few blocks
function slides(html, title) {
  const box = document.createElement("div"); box.innerHTML = html; const deck = [{ h: title, body: [] }];
  for (const n of [...box.childNodes]) {
    if (n.nodeType === 1 && /^H[1-3]$/.test(n.tagName)) deck.push({ h: n.textContent, body: [] });
    else if (n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim())) { const cur = deck[deck.length - 1]; if (cur.body.length >= 6) deck.push({ h: cur.h + " (continued)", body: [] }); deck[deck.length - 1].body.push(n.nodeType === 1 ? n.outerHTML : "<p>" + esc(n.textContent) + "</p>"); }
  }
  const list = deck.filter((s, i) => i === 0 || s.body.length);
  if (list.length > 1 && !list[0].body.length) list[0].body.push("<p class='sub'>" + (list.length - 1) + " slides · AutoFaber</p>");
  const secs = list.map((s, i) => "<section class='slide" + (i ? "" : " title") + "'><h2>" + esc(s.h) + "</h2>" + s.body.join("") + "<footer>" + (i + 1) + " / " + list.length + "</footer></section>").join("");
  return "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>" + esc(title) + "</title><style>" +
    "html,body{margin:0;background:#101418;color:#eef0ea;font:24px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}.slide{box-sizing:border-box;width:100vw;height:100vh;padding:7vh 8vw;display:none;flex-direction:column;justify-content:center;position:relative;overflow:auto}" +
    ".slide.on{display:flex}.slide h2{font-size:1.9em;margin:0 0 .6em;color:#f3d68f}.slide.title h2{font-size:2.6em}.slide .sub{color:#9aa3a0}.slide footer{position:absolute;right:3vw;bottom:2.5vh;font-size:.6em;color:#7b827e}" +
    "table{border-collapse:collapse}td,th{border:1px solid #3a4448;padding:.25em .6em}pre{background:#0a0d0f;padding:.6em;font-size:.7em;overflow:auto}svg{max-width:100%;height:auto;max-height:55vh}a{color:#8fb7ff}" +
    "@media print{html,body{background:#fff;color:#111}.slide{display:flex!important;page-break-after:always;height:100vh}.slide h2{color:#1d2b3a}}</style></head><body>" + secs +
    "<script>(function(){var s=[].slice.call(document.querySelectorAll('.slide')),i=0;function go(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(x,k){x.classList.toggle('on',k===i)})}" +
    "addEventListener('keydown',function(e){if(/^(ArrowRight|ArrowDown|PageDown| )$/.test(e.key))go(i+1);if(/^(ArrowLeft|ArrowUp|PageUp)$/.test(e.key))go(i-1);if(e.key==='Home')go(0);if(e.key==='End')go(s.length-1)});" +
    "addEventListener('click',function(e){if(!e.target.closest('a'))go(e.clientX>innerWidth/3?i+1:i-1)});go(0)})()</script></body></html>";
}
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
const slug = (t) => String(t || "autofaber").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "autofaber";
// kind: doc | slides | csv | md
function save(kind, el, md, title) {
  const n = slug(title);
  if (kind === "doc") return download(n + ".doc", doc(clean(el), title), "application/msword");
  if (kind === "slides") return download(n + "-slides.html", slides(clean(el), title), "text/html");
  if (kind === "csv") return download(n + ".csv", "﻿" + csv(md), "text/csv");
  return download(n + ".md", "# " + title + "\n\n" + md + "\n", "text/markdown");
}
const api = { tables, csv, doc, slides, clean, save, slug };
if (typeof window !== "undefined") window.HiveExport = api;
if (typeof module !== "undefined") module.exports = api;
})();
