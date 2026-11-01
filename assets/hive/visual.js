// Genesis · visual answers. A reply can carry a ```chart block (a small JSON description of the numbers), drawn here as
// an SVG with its data in a table underneath; or a ```widget block (one self-contained HTML page: a calculator, converter,
// timer, small simulation), run inline in a sandboxed frame. The frame has an opaque origin (no allow-same-origin) and a
// Content-Security-Policy with no network at all, so a widget can't reach the app, its storage, or anywhere else; it can
// only tell the page its height.
(() => {
"use strict";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const TYPES = ["bar", "line", "area", "pie"];

// a chart spec, checked: { type, title, labels, series: [{ name, data }], unit } or null
function spec(raw) {
  let j; try { j = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { return null; }
  if (!j || typeof j !== "object") return null;
  const type = TYPES.includes(j.type) ? j.type : "bar";
  let series = Array.isArray(j.series) ? j.series : Array.isArray(j.data) ? [{ name: j.title || "", data: j.data }] : null; if (!series) return null;
  series = series.slice(0, 6).map((s, i) => ({ name: String((s && s.name) || (series.length > 1 ? "Series " + (i + 1) : "")).slice(0, 40), data: (Array.isArray(s && s.data) ? s.data : []).slice(0, 200).map((v) => (v == null || v === "" ? null : +v)) }));
  const n = Math.max(0, ...series.map((s) => s.data.length)); if (!n || series.some((s) => s.data.some((v) => v != null && !isFinite(v)))) return null;
  const labels = (Array.isArray(j.labels) ? j.labels : []).slice(0, n).map((l) => String(l).slice(0, 24)); while (labels.length < n) labels.push(String(labels.length + 1));
  if (type === "pie" && series[0].data.some((v) => v < 0)) return null;
  return { type, title: String(j.title || "").slice(0, 90), labels, series, unit: String(j.unit || "").slice(0, 8) };
}
// round axis steps: 1, 2 or 5 times a power of ten
function ticks(lo, hi) {
  if (lo === hi) { hi = lo + 1; lo = Math.min(0, lo); }
  const span = hi - lo, raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw);
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, out = []; for (let v = a; v <= b + step / 2; v += step) out.push(+v.toPrecision(12));
  return out;
}
const fmt = (v, unit) => { const a = Math.abs(v), s = a >= 1e9 ? (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B" : a >= 1e6 ? (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M" : a >= 1e4 ? (v / 1e3).toFixed(0) + "k" : +v.toFixed(2) + ""; return unit === "%" || unit === "°" ? s + unit : unit && unit.length <= 2 && /[$€£¥]/.test(unit) ? unit + s : s; };

function chart(raw) {
  const c = spec(raw); if (!c) return null;
  const W = 640, H = 340, L = 56, R = 14, T = c.title ? 34 : 14, B = 58, iw = W - L - R, ih = H - T - B, n = c.labels.length;
  const title = c.title ? "<text class='ct' x='" + W / 2 + "' y='20' text-anchor='middle'>" + esc(c.title) + "</text>" : "";
  const legend = c.series.length > 1 || c.type === "pie" ? "<div class='clegend'>" + (c.type === "pie" ? c.labels : c.series.map((s) => s.name)).map((nm, i) => "<span><i class='s" + (i % 8) + "'></i>" + esc(nm) + "</span>").join("") + "</div>" : "";
  let body = "";
  if (c.type === "pie") {
    const d = c.series[0].data.map((v) => v || 0), tot = d.reduce((a, b) => a + b, 0) || 1, cx = W / 2, cy = T + ih / 2 + 10, r = Math.min(ih, iw) / 2; let a0 = -Math.PI / 2;
    body = d.map((v, i) => { const a1 = a0 + (v / tot) * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0, x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1), mid = (a0 + a1) / 2;
      const path = v >= tot ? "<circle class='s" + (i % 8) + "' cx='" + cx + "' cy='" + cy + "' r='" + r + "'/>" : "<path class='s" + (i % 8) + "' d='M" + cx + " " + cy + "L" + x0.toFixed(1) + " " + y0.toFixed(1) + "A" + r + " " + r + " 0 " + big + " 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + "Z'><title>" + esc(c.labels[i] + ": " + fmt(v, c.unit)) + "</title></path>";
      const pct = v / tot, lab = pct >= 0.06 ? "<text class='cl' x='" + (cx + r * 0.62 * Math.cos(mid)).toFixed(1) + "' y='" + (cy + r * 0.62 * Math.sin(mid) + 4).toFixed(1) + "' text-anchor='middle'>" + Math.round(pct * 100) + "%</text>" : "";
      a0 = a1; return path + lab; }).join("");
  } else {
    const all = c.series.flatMap((s) => s.data).filter((v) => v != null), tk = ticks(Math.min(0, ...all), Math.max(0, ...all)), lo = tk[0], hi = tk[tk.length - 1];
    const y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih, band = iw / n, x = (i) => L + band * i + band / 2;
    body += tk.map((t) => "<line class='cg' x1='" + L + "' x2='" + (W - R) + "' y1='" + y(t).toFixed(1) + "' y2='" + y(t).toFixed(1) + "'/><text class='cy' x='" + (L - 6) + "' y='" + (y(t) + 4).toFixed(1) + "' text-anchor='end'>" + esc(fmt(t, c.unit)) + "</text>").join("");
    const every = Math.ceil(n / 12), tilt = n > 6;
    body += c.labels.map((l, i) => i % every ? "" : "<text class='cx' x='" + x(i).toFixed(1) + "' y='" + (T + ih + 16) + "' text-anchor='" + (tilt ? "end" : "middle") + "'" + (tilt ? " transform='rotate(-35 " + x(i).toFixed(1) + " " + (T + ih + 16) + ")'" : "") + ">" + esc(l) + "</text>").join("");
    if (c.type === "bar") { const k = c.series.length, bw = Math.max(2, (band * 0.8) / k);
      body += c.series.map((s, si) => s.data.map((v, i) => v == null ? "" : "<rect class='s" + (si % 8) + "' x='" + (L + band * i + band * 0.1 + bw * si).toFixed(1) + "' y='" + Math.min(y(v), y(0)).toFixed(1) + "' width='" + (bw - 1).toFixed(1) + "' height='" + Math.max(1, Math.abs(y(v) - y(0))).toFixed(1) + "'><title>" + esc((s.name ? s.name + " · " : "") + c.labels[i] + ": " + fmt(v, c.unit)) + "</title></rect>").join("")).join("");
    } else {
      body += c.series.map((s, si) => { const pts = s.data.map((v, i) => (v == null ? null : [x(i), y(v)])), segs = []; let cur = []; pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
        return segs.map((sg) => (c.type === "area" ? "<path class='a" + (si % 8) + "' d='M" + sg[0][0].toFixed(1) + " " + y(Math.max(lo, 0)).toFixed(1) + sg.map((p) => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("") + "L" + sg[sg.length - 1][0].toFixed(1) + " " + y(Math.max(lo, 0)).toFixed(1) + "Z'/>" : "") +
          "<polyline class='l" + (si % 8) + "' points='" + sg.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ") + "'/>").join("") +
          (n <= 40 ? s.data.map((v, i) => v == null ? "" : "<circle class='s" + (si % 8) + "' cx='" + x(i).toFixed(1) + "' cy='" + y(v).toFixed(1) + "' r='3'><title>" + esc((s.name ? s.name + " · " : "") + c.labels[i] + ": " + fmt(v, c.unit)) + "</title></circle>").join("") : ""); }).join("");
    }
    body += "<line class='ca' x1='" + L + "' x2='" + (W - R) + "' y1='" + y(Math.max(lo, 0)).toFixed(1) + "' y2='" + y(Math.max(lo, 0)).toFixed(1) + "'/>";
  }
  const table = "<details class='cdata'><summary>The numbers</summary><div class='perf'><table><thead><tr><th></th>" + c.series.map((s) => "<th>" + esc(s.name || "Value") + "</th>").join("") + "</tr></thead><tbody>" +
    c.labels.map((l, i) => "<tr><td>" + esc(l) + "</td>" + c.series.map((s) => "<td>" + (s.data[i] == null ? "—" : esc(s.data[i] + (c.unit ? " " + c.unit : ""))) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div></details>";
  return "<figure class='vchart'><svg viewBox='0 0 " + W + " " + H + "' role='img' aria-label='" + esc((c.title || c.type + " chart") + ": " + c.labels.length + " points") + "'>" + title + body + "</svg>" + legend + table + "</figure>";
}

// a widget's page: the CSP goes first in <head>, so nothing in the page can load from or send to the network
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:";
function widgetDoc(html, id) {
  let h = String(html || ""); if (!/<html[\s>]|<!doctype/i.test(h)) h = "<!doctype html><html><head></head><body>" + h + "</body></html>"; if (!/<head[\s>]/i.test(h)) h = h.replace(/<html[^>]*>/i, (m) => m + "<head></head>");
  const top = "<meta charset='utf-8'><meta http-equiv='Content-Security-Policy' content=\"" + CSP + "\"><meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<style>html{color-scheme:dark light}body{margin:0;padding:12px;font:14px/1.5 system-ui,sans-serif}</style>" +
    "<script>(function(){var s=function(){try{parent.postMessage({hiveWidget:'" + id + "',h:Math.ceil(document.documentElement.getBoundingClientRect().height)},'*')}catch(e){}};addEventListener('load',s);addEventListener('resize',s);try{new ResizeObserver(s).observe(document.documentElement)}catch(e){setInterval(s,800)}})()</script>";
  return h.replace(/<head[^>]*>/i, (m) => m + top);
}
function widget(html) {
  const id = "w" + Math.random().toString(36).slice(2, 10);
  return "<div class='vwidget'><iframe data-widget='" + id + "' sandbox='allow-scripts' title='An interactive widget from this answer' loading='lazy' srcdoc=\"" + esc(widgetDoc(html, id)) + "\"></iframe><small class='dim'>Runs sandboxed: no network, no access to this app.</small></div>";
}
// widgets say how tall they are; only the frame they came from is resized
if (typeof addEventListener === "function") addEventListener("message", (e) => {
  const d = e.data; if (!d || typeof d.hiveWidget !== "string" || typeof document === "undefined") return;
  const f = document.querySelector("iframe[data-widget='" + d.hiveWidget.replace(/[^\w]/g, "") + "']"); if (f && e.source === f.contentWindow) f.style.height = Math.max(60, Math.min(900, +d.h || 0) + 4) + "px";
});

// A page from a reply, opened in its own tab without the app's origin: the tab holds no script of its own, only a frame
// sandboxed without allow-same-origin, so the page can't use the owner's session or read the app's storage.
const SANDBOX = "allow-scripts allow-modals allow-forms allow-pointer-lock allow-popups allow-downloads";
function sandboxedPage(html, title) {
  return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>" + esc(title || "Preview") + "</title><style>html,body{margin:0;height:100%;background:#fff}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe sandbox='" + SANDBOX + "' srcdoc=\"" + esc(html) + "\"></iframe></body></html>";
}
function openSafe(html, title) { const w = window.open("", "_blank"); if (!w) return false; w.document.open(); w.document.write(sandboxedPage(html, title)); w.document.close(); try { w.opener = null; } catch (e) {} return true; }

const api = { spec, ticks, chart, widget, widgetDoc, sandboxedPage, openSafe, CSP, SANDBOX };
if (typeof window !== "undefined") window.HiveVisual = api;
if (typeof module !== "undefined") module.exports = api;
})();
