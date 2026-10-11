/* Mentifaber 2 · the home page's finder: search, a category filter and "live only", over the server-rendered cards.
   "/" focuses the search; Enter opens the first match. The filter is remembered for this tab. */
(() => {
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const q = $("#q"), seg = $("#seg"), live = $("#live-only"), none = $("#none");
  if (!q) return;
  let cat = "all", onlyLive = false;
  try { const s = JSON.parse(sessionStorage.getItem("mf:finder") || "{}"); cat = s.cat || "all"; onlyLive = !!s.live; } catch (e) {}
  const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function apply(scroll) {
    const words = norm(q.value.trim()).split(/\s+/).filter(Boolean);
    let shown = 0;
    $$(".cat").forEach((sec) => {
      let n = 0;
      $$(".app", sec).forEach((a) => {
        const ok = (cat === "all" || a.dataset.cat === cat) && (!onlyLive || a.dataset.status === "live") && words.every((w) => a.dataset.q.includes(w));
        a.hidden = !ok; if (ok) n++;
      });
      sec.hidden = !n; shown += n;
    });
    none.classList.toggle("on", !shown);
    $$("button", seg).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === cat)));
    live.setAttribute("aria-pressed", String(onlyLive));
    try { sessionStorage.setItem("mf:finder", JSON.stringify({ cat, live: onlyLive })); } catch (e) {}
    if (scroll) { const f = $("#apps"); if (f.getBoundingClientRect().top < 0) scrollTo({ top: scrollY + f.getBoundingClientRect().top - 70, behavior: "smooth" }); }
  }
  seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; cat = b.dataset.cat; apply(true); });
  live.addEventListener("click", () => { onlyLive = !onlyLive; apply(true); });
  q.addEventListener("input", () => apply(false));
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const a = $$(".app").find((x) => !x.hidden); if (a) location.href = ($(".go .pri", a) || $(".cover", a)).href; }
    if (e.key === "Escape") { q.value = ""; apply(false); q.blur(); }
  });
  addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); $("#apps").scrollIntoView({ behavior: "smooth" }); setTimeout(() => q.focus({ preventScroll: true }), 300); }
  });
  $$("[data-find]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); $("#apps").scrollIntoView({ behavior: "smooth" }); setTimeout(() => q.focus({ preventScroll: true }), 400); }));
  // the crumb on every app page links to ./#<category>: open on that category
  const h = location.hash.slice(1), jump = $$("button", seg).some((b) => b.dataset.cat === h);
  if (jump) { cat = "all"; onlyLive = false; }
  apply(false);
  if (jump) requestAnimationFrame(() => document.getElementById(h).scrollIntoView());
})();
