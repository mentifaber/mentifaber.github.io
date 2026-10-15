/* Mentifaber 3 · THE WORKSHOP: light or dark, Find (the parts index, also on "/"), the detail callout for the bench
   you point at, and Power on (the app starts in place, on its own bench). */
(() => {
  const $ = (s, el) => (el || document).querySelector(s), $$ = (s, el) => [...(el || document).querySelectorAll(s)], root = document.documentElement;
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // light (vellum) or dark (gunmetal)
  const label = () => $$("[data-theme-toggle] span").forEach((s) => (s.textContent = root.dataset.theme === "light" ? "Dark" : "Light"));
  $$("[data-theme-toggle]").forEach((b) => (b.onclick = () => { root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light"; try { localStorage.setItem("mf:theme", root.dataset.theme); } catch (e) {} label(); }));
  label();
  // the detail callout: point at a bench, read it (wide screens with a pointer)
  const det = $(".detail");
  if (det && matchMedia("(hover: hover) and (min-width: 901px)").matches) {
    let t = 0; const show = (b) => { clearTimeout(t); $(".lbl", det).textContent = b.dataset.pn + " · " + b.dataset.room + " · " + b.dataset.st; $("h4", det).textContent = $("b", b).textContent; $("p", det).textContent = b.dataset.desc; det.style.setProperty("--h", b.style.getPropertyValue("--h")); det.classList.add("on"); };
    $$(".plan .bench").forEach((b) => { b.addEventListener("mouseenter", () => show(b)); b.addEventListener("focus", () => show(b)); b.addEventListener("mouseleave", () => { t = setTimeout(() => det.classList.remove("on"), 120); }); b.addEventListener("blur", () => det.classList.remove("on")); });
  }
  // find: the parts index
  const fd = $(".find"), idx = JSON.parse(($("#nx-index") || {}).textContent || "[]");
  if (fd) {
    const inp = $("input", fd), ol = $("ol", fd); let sel = 0, hits = [];
    const draw = () => { const q = inp.value.trim().toLowerCase(), ws = q.split(/\s+/).filter(Boolean);
      const score = (x) => { const n = x.n.toLowerCase(); return ws.reduce((t, w) => t + (n.startsWith(w) ? 4 : n.includes(w) ? 3 : x.r.toLowerCase().includes(w) ? 1 : 0), 0); }; // names first, then rooms, then words in the description
      hits = idx.filter((x) => ws.every((w) => (x.n + " " + x.d + " " + x.r + " " + x.s + " " + x.p).toLowerCase().includes(w))).map((x, i) => [x, score(x), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map((x) => x[0]).slice(0, 40); sel = Math.min(sel, Math.max(0, hits.length - 1));
      ol.innerHTML = hits.map((x, i) => '<li><a href="' + esc(x.h) + '"' + (i === sel ? ' class="on"' : "") + '><span class="pn">' + esc(x.p) + "</span><span><b>" + esc(x.n) + "</b><small>" + esc(x.d) + '</small></span><span class="pn">' + esc(x.s) + "</span></a></li>").join("") || '<li style="padding:14px;color:var(--dim)">No bench matches. Fewer words?</li>'; };
    const open = () => { fd.classList.add("on"); inp.value = ""; sel = 0; draw(); setTimeout(() => inp.focus(), 20); }, close = () => fd.classList.remove("on");
    $$("[data-find]").forEach((b) => (b.onclick = open));
    fd.addEventListener("click", (e) => { if (e.target === fd) close(); });
    inp.addEventListener("input", () => { sel = 0; draw(); });
    inp.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, Math.min(hits.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1))); draw(); } else if (e.key === "Enter" && hits[sel]) location.href = hits[sel].h; else if (e.key === "Escape") close(); });
    addEventListener("keydown", (e) => { if (e.key === "/" && !/input|textarea|select/i.test((document.activeElement || {}).tagName || "") && !fd.classList.contains("on")) { e.preventDefault(); open(); } });
  }
  // power on: the app starts on its bench
  const piece = $(".piece");
  $$("[data-power]").forEach((b) => (b.onclick = () => {
    if (!piece || !piece.dataset.app) return; const box = $(".frame > div", piece);
    if (!$("iframe", box)) { const f = document.createElement("iframe"); f.src = piece.dataset.app; f.title = $("h1") ? $("h1").textContent : "the app"; f.allow = "clipboard-write; fullscreen; geolocation; microphone; camera"; box.appendChild(f); }
    piece.classList.add("on"); $$("[data-power]").forEach((x) => { x.textContent = "Running"; x.disabled = true; });
    if (innerWidth < 901) piece.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
})();
