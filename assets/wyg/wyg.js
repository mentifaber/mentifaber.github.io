/* Watch Your Grass (a.k.a. Arm A Garden). Arena defense on a 6×6 lawn, rebuilt for the browser from the paper design:
   ten plant and terrain types, six kinds of visitor, sun to spend, and a house to protect. Visitors walk in through the
   gate and path toward the house around whatever you've planted; ground cover can be walked on, everything else is in
   the way. The original's fixes are kept: a unit with no legal move tramples one non-boulder plant instead of
   freezing (getNextMove's fallback), the tree cap is 3 and never grows, and every animation runs at the doubled,
   calmer timing. */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const N = 6, GATE = { r: 2, c: 0 }, HOME = { r: 2, c: 5 }, TREE_CAP = 3, START_SUN = 120;
const PLANTS = {
  grass:    { i: "🌱", name: "Grass", cost: 20, walk: true, dmg: 1, every: 2.5, reach: "on", desc: "ground cover · nips whoever stands on it" },
  vines:    { i: "🥀", name: "Rose Vines", cost: 40, walk: true, dmg: 1, every: 2, reach: "on", slow: 0.5, desc: "ground cover · thorns and a slow" },
  pond:     { i: "💧", name: "Pond", cost: 30, walk: true, slow: 0.4, desc: "terrain · wading is slow" },
  roses:    { i: "🌹", name: "Roses", cost: 50, dmg: 3, every: 2.8, reach: 1, all: true, desc: "thorns for everyone beside it" },
  mushroom: { i: "🍄", name: "Mushroom", cost: 60, poison: 1, every: 3, reach: "ring", desc: "spores poison all eight around it" },
  mint:     { i: "🌿", name: "Mint", cost: 35, income: 12, desc: "+12 sun after every round" },
  sunflower:{ i: "🌻", name: "Sunflower", cost: 50, sun: 6, every: 6, desc: "+6 sun every few seconds in a round" },
  tree:     { i: "🌳", name: "Tree", cost: 75, dmg: 2, every: 2, reach: 2, tree: true, desc: "reaches two tiles · cap 3" },
  locust:   { i: "🌲", name: "Honey Locust", cost: 110, dmg: 4, every: 2.2, reach: 1, tree: true, desc: "big thorns · shares the tree cap" },
  boulder:  { i: "🪨", name: "Boulder", cost: 15, rock: true, desc: "blocks the way · nobody moves it" },
};
const SHOVEL = { i: "⛏️", name: "Dig up", cost: 0, desc: "pull a plant · half the sun back" };
const KINDS = {
  stroller: { i: "🚶", name: "Stroller", hp: 6, step: 1.4, harm: 1 },
  jogger:   { i: "🏃", name: "Jogger", hp: 4, step: 0.7, harm: 1 },
  kid:      { i: "🧒", name: "Kid with a ball", hp: 4, step: 0.9, harm: 1, erratic: 0.3 },
  dog:      { i: "🐕", name: "Off-leash dog", hp: 3, step: 0.55, harm: 1, digs: 0.3 },
  mower:    { i: "🚜", name: "Mower", hp: 22, step: 2, harm: 3, mows: true },
  boss:     { i: "👷", name: "Landscaper", hp: 45, step: 1.8, harm: 5, clears: 4 },
};
// one table for difficulty: who comes in round r, and how tough
function wave(r) {
  const list = [], n = 2 + Math.floor(r * 1.4), hpx = 1 + (r - 1) * 0.12;
  for (let k = 0; k < n; k++) { const roll = Math.random(); list.push(r >= 4 && roll < 0.18 ? "dog" : r >= 3 && roll < 0.38 ? "kid" : r >= 2 && roll < 0.62 ? "jogger" : "stroller"); }
  if (r >= 6 && r % 2 === 0) list.splice(Math.floor(n / 2), 0, "mower");
  if (r % 5 === 0) list.push("boss");
  return { list, hpx, gap: Math.max(0.7, 1.7 - r * 0.06) };
}

const S = { grid: [], sun: START_SUN, round: 1, lawn: 10, best: 0, sel: "grass", units: [], running: false, speed: 1, queue: [], spawnT: 0, kills: 0, uid: 0 };
try { S.best = +localStorage.getItem("wyg:best") || 0; } catch (e) {}
const at = (r, c) => (r >= 0 && c >= 0 && r < N && c < N ? S.grid[r][c] : undefined);
const isGate = (r, c) => r === GATE.r && c === GATE.c, isHome = (r, c) => r === HOME.r && c === HOME.c;
const walkable = (r, c) => { if (r < 0 || c < 0 || r >= N || c >= N) return false; const p = S.grid[r][c]; return !p || PLANTS[p.k].walk; };
const trees = () => S.grid.flat().filter((p) => p && PLANTS[p.k].tree).length;
const DIRS = [[0, 1], [1, 0], [-1, 0], [0, -1]];

// shortest walk from a tile to the house through walkable tiles (null if there is none)
function route(r0, c0, block) {
  const prev = new Map(), key = (r, c) => r * N + c, q = [[r0, c0]]; prev.set(key(r0, c0), null);
  while (q.length) { const [r, c] = q.shift(); if (isHome(r, c)) { const path = []; let k = key(r, c); while (k != null) { path.unshift([Math.floor(k / N), k % N]); k = prev.get(k); } return path; }
    for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc; if (prev.has(key(nr, nc)) || !walkable(nr, nc) || (block && block[0] === nr && block[1] === nc)) continue; prev.set(key(nr, nc), key(r, c)); q.push([nr, nc]); } }
  return null;
}

// ── log ──
function log(t, cls) { const p = document.createElement("p"); p.className = cls || ""; p.textContent = t; const L = $("log"); L.appendChild(p); while (L.childNodes.length > 250) L.firstChild.remove(); L.scrollTop = L.scrollHeight; }
function tip(t, warn) { $("tip").innerHTML = warn ? '<span class="warn">' + t + "</span>" : t; }

// ── planting ──
function place(r, c) {
  if (isGate(r, c)) return bad(r, c, "The gate stays clear. clearSpawnTile() would only wipe it.");
  if (isHome(r, c)) return bad(r, c, "That's the house.");
  const cur = S.grid[r][c];
  if (S.sel === "shovel") { if (!cur) return bad(r, c, "Nothing to dig up."); const back = Math.floor(PLANTS[cur.k].cost / 2); S.grid[r][c] = null; S.sun += back; log("Dug up " + PLANTS[cur.k].name + " (+" + back + " sun)"); render(); return; }
  const p = PLANTS[S.sel];
  if (cur) return bad(r, c, "Something's growing there. Use the shovel first.");
  if (S.sun < p.cost) return bad(r, c, "Not enough sun.");
  if (p.tree && trees() >= TREE_CAP) return bad(r, c, "The tree cap is 3, and it never grows with the round.");
  if (p.rock && !route(GATE.r, GATE.c, [r, c])) return bad(r, c, "A boulder there would seal the lawn. Nobody can move a boulder, so leave them a way through.");
  S.grid[r][c] = { k: S.sel, t: 0 }; S.sun -= p.cost; tip("Planted <b>" + p.name + "</b>. " + (p.walk ? "They can walk on it." : "They'll have to go around.")); render();
}
function bad(r, c, why) { tip(why, true); const el = tileEl(r, c); el.classList.remove("bad"); void el.offsetWidth; el.classList.add("bad"); }

// ── a round ──
function sendRound() {
  if (S.running || S.lawn <= 0) return;
  const w = wave(S.round); S.queue = w.list.map((k) => ({ k, hpx: w.hpx })); S.gap = w.gap; S.spawnT = 0; S.running = true;
  log("— round " + S.round + ": " + w.list.length + " visitors" + (w.list.includes("boss") ? ", including the Landscaper" : "") + " —", "round"); render();
}
function spawn(item) {
  // clearSpawnTile(): nothing may materialise inside a wall (the gate can't be planted, but stay honest about it)
  if (S.grid[GATE.r][GATE.c]) { S.grid[GATE.r][GATE.c] = null; log("clearSpawnTile: cleared the gate", "fix"); }
  const K = KINDS[item.k], hp = Math.round(K.hp * item.hpx);
  const u = { id: ++S.uid, k: item.k, r: GATE.r, c: GATE.c, hp, max: hp, t: 0.2, pois: 0, clr: K.clears || 0 };
  S.units.push(u); log(K.name + " came through the gate", "spawn"); drawUnit(u, true);
}
function stepUnit(u) {
  const K = KINDS[u.k];
  if (K.erratic && Math.random() < K.erratic) { const opts = DIRS.map(([a, b]) => [u.r + a, u.c + b]).filter(([r, c]) => walkable(r, c) && !isGate(r, c)); if (opts.length) return move(u, ...opts[Math.floor(Math.random() * opts.length)]); }
  const path = route(u.r, u.c);
  if (path && path.length > 1) return move(u, path[1][0], path[1][1]);
  // getNextMove fallback: no legal path, so trample one adjacent non-boulder plant instead of freezing forever
  const near = DIRS.map(([a, b]) => [u.r + a, u.c + b]).filter(([r, c]) => at(r, c) && !PLANTS[at(r, c).k].rock);
  if (near.length) { const [r, c] = near[Math.floor(Math.random() * near.length)]; log("getNextMove fallback: " + K.name + " tramples the " + PLANTS[S.grid[r][c].k].name + " to get through", "fix"); S.grid[r][c] = null; renderTiles(); }
}
function move(u, r, c) {
  u.r = r; u.c = c; const K = KINDS[u.k], p = at(r, c);
  if (p && K.mows && PLANTS[p.k].walk && p.k !== "pond") { S.grid[r][c] = null; log("The Mower flattened the " + PLANTS[p.k].name, "fight"); renderTiles(); }
  else if (p && K.digs && p.k === "grass" && Math.random() < K.digs) { S.grid[r][c] = null; log("The dog dug up some Grass", "fight"); renderTiles(); }
  if (isHome(r, c)) { S.lawn = Math.max(0, S.lawn - K.harm); log(K.name + " reached the house (−" + K.harm + " lawn)", "bad"); kill(u, false); return; }
  drawUnit(u);
}
function hurt(u, d, why) { u.hp -= d; floatText(u, "−" + d); if (u.hp <= 0) { log(KINDS[u.k].name + " gave up (" + why + ")", "fight"); kill(u, true); } else drawUnit(u); }
function kill(u, won) { S.units = S.units.filter((x) => x !== u); const el = document.querySelector('[data-u="' + u.id + '"]'); if (el) el.remove(); if (won) { S.kills++; S.sun += Math.max(3, Math.round(u.max / 2)); } }
const dist = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
function plantsAct(dt) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const p = S.grid[r][c]; if (!p) continue; const P = PLANTS[p.k]; if (!P.every) continue;
    p.t += dt; if (p.t < P.every) continue;
    if (P.sun) { p.t = 0; S.sun += P.sun; flashPlant(r, c); continue; }
    const me = { r, c }, inReach = S.units.filter((u) => P.reach === "on" ? u.r === r && u.c === c : P.reach === "ring" ? Math.max(Math.abs(u.r - r), Math.abs(u.c - c)) === 1 : dist(u, me) <= P.reach && dist(u, me) > 0);
    if (!inReach.length) continue; p.t = 0; flashPlant(r, c);
    if (P.poison) { inReach.forEach((u) => { u.pois = Math.min(8, u.pois + 4); }); log(P.name + " poisoned " + inReach.length, "fight"); continue; }
    const targets = P.all ? inReach : [inReach.sort((a, b) => (route(a.r, a.c) || []).length - (route(b.r, b.c) || []).length)[0]];
    targets.forEach((u) => hurt(u, P.dmg, P.name));
  }
}

// ── the loop ──
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000) * S.speed; last = now;
  if (!S.running) return;
  S.spawnT -= dt; if (S.queue.length && S.spawnT <= 0) { spawn(S.queue.shift()); S.spawnT = S.gap; }
  for (const u of [...S.units]) {
    const K = KINDS[u.k], p = at(u.r, u.c), slow = p && PLANTS[p.k].slow ? PLANTS[p.k].slow : 1;
    if (u.pois > 0) { u.pois -= dt; u.pt = (u.pt || 0) + dt; if (u.pt >= 1) { u.pt = 0; hurt(u, 1, "spores"); if (!S.units.includes(u)) continue; } }
    if (K.clears) { u.clr -= dt; if (u.clr <= 0) { u.clr = K.clears; const near = DIRS.map(([a, b]) => [u.r + a, u.c + b]).filter(([r, c]) => at(r, c) && !PLANTS[at(r, c).k].rock); if (near.length) { const [r, c] = near[0]; log("The Landscaper pulled up the " + PLANTS[S.grid[r][c].k].name, "fight"); S.grid[r][c] = null; renderTiles(); } } }
    u.t -= dt * slow; if (u.t <= 0) { u.t = K.step; stepUnit(u); }
  }
  plantsAct(dt);
  if (S.lawn <= 0) return over();
  if (!S.queue.length && !S.units.length) endRound();
  hud();
}
function endRound() {
  S.running = false; const mint = S.grid.flat().filter((p) => p && PLANTS[p.k].income).reduce((a, p) => a + PLANTS[p.k].income, 0), pay = 40 + 5 * S.round + mint;
  S.sun += pay; log("Round " + S.round + " held. +" + pay + " sun" + (mint ? " (" + mint + " from the mint)" : ""), "round");
  S.round++; if (S.round - 1 > S.best) { S.best = S.round - 1; try { localStorage.setItem("wyg:best", S.best); } catch (e) {} }
  tip("Round " + (S.round - 1) + " held. Plant, then send the next one."); render();
}
function over() {
  S.running = false; S.units.forEach((u) => { const el = document.querySelector('[data-u="' + u.id + '"]'); if (el) el.remove(); }); S.units = []; S.queue = [];
  $("o-p").textContent = "You held " + (S.round - 1) + " round" + (S.round === 2 ? "" : "s") + " and turned " + S.kills + " visitors away." + (S.round - 1 >= S.best && S.best ? " A new best." : ""); $("over").hidden = false; hud();
}
function reset() {
  S.grid = Array.from({ length: N }, () => Array(N).fill(null)); S.sun = START_SUN; S.round = 1; S.lawn = 10; S.units = []; S.queue = []; S.running = false; S.kills = 0;
  document.querySelectorAll(".u").forEach((e) => e.remove()); $("over").hidden = true; $("log").innerHTML = ""; log("A fresh lawn. They come through the gate on the left.", "round");
  tip("Plant something. They come through the gate on the left and head for the house."); render();
}

// ── drawing ──
const board = $("board");
function tileEl(r, c) { return board.children[r * N + c]; }
function renderTiles() {
  const path = S.running ? null : route(GATE.r, GATE.c), onPath = new Set((path || []).map(([r, c]) => r * N + c));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const el = tileEl(r, c), p = S.grid[r][c];
    el.className = "t" + (isGate(r, c) ? " gate" : isHome(r, c) ? " home" : "") + (onPath.has(r * N + c) && !isGate(r, c) && !isHome(r, c) && !p ? " path" : "");
    el.innerHTML = isGate(r, c) ? "🚪" : isHome(r, c) ? "🏡" : p ? '<span class="p">' + PLANTS[p.k].i + "</span>" : "";
    el.title = p ? PLANTS[p.k].name + " · " + PLANTS[p.k].desc : isGate(r, c) ? "The gate" : isHome(r, c) ? "The house" : "";
  }
}
function flashPlant(r, c) { const s = tileEl(r, c).querySelector(".p"); if (!s) return; s.classList.remove("hit"); void s.offsetWidth; s.classList.add("hit"); }
function cellBox(r, c) { const el = tileEl(r, c); return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; }
function drawUnit(u, first) {
  let el = board.querySelector('[data-u="' + u.id + '"]');
  if (!el) { el = document.createElement("div"); el.className = "u"; el.dataset.u = u.id; el.innerHTML = KINDS[u.k].i + '<span class="hp"><i></i></span>'; board.appendChild(el); }
  const b = cellBox(u.r, u.c), K = KINDS[u.k], p = at(u.r, u.c), slow = p && PLANTS[p.k].slow ? PLANTS[p.k].slow : 1;
  el.style.setProperty("--d", first ? "0s" : (K.step / slow / S.speed).toFixed(2) + "s");
  el.style.left = b.x + "px"; el.style.top = b.y + "px"; el.style.width = b.w + "px"; el.style.height = b.h + "px";
  el.classList.toggle("slow", slow < 1); el.classList.toggle("pois", u.pois > 0); el.querySelector(".hp i").style.width = Math.max(0, (u.hp / u.max) * 100) + "%";
}
function floatText(u, t) { const b = cellBox(u.r, u.c), el = document.createElement("div"); el.className = "fx"; el.textContent = t; el.style.left = b.x + b.w * 0.62 + "px"; el.style.top = b.y + 4 + "px"; board.appendChild(el); setTimeout(() => el.remove(), 900); }
function hud() {
  $("sun").textContent = S.sun; $("round").textContent = S.round; $("lawn").textContent = S.lawn; $("trees").textContent = trees(); $("best").textContent = S.best;
  $("go").disabled = S.running || S.lawn <= 0; $("go").textContent = S.running ? "Round " + S.round + "…" : "Send round " + S.round;
  document.querySelectorAll(".buy").forEach((b) => { const k = b.dataset.k, P = PLANTS[k]; b.disabled = !!P && (S.sun < P.cost || (P.tree && trees() >= TREE_CAP)); b.classList.toggle("on", k === S.sel); });
}
function render() { renderTiles(); hud(); }

// ── wiring ──
for (let k = 0; k < N * N; k++) { const el = document.createElement("div"); el.setAttribute("role", "gridcell"); el.addEventListener("click", () => place(Math.floor(k / N), k % N)); board.appendChild(el); }
$("shop").innerHTML = [...Object.entries(PLANTS), ["shovel", SHOVEL]].map(([k, P]) => '<button class="buy" data-k="' + k + '"><span class="i">' + P.i + "</span><b>" + P.name + "</b>" + (P.cost ? '<span class="c">' + P.cost + "</span>" : "") + "<small>" + P.desc + "</small></button>").join("");
$("shop").addEventListener("click", (e) => { const b = e.target.closest(".buy"); if (!b || b.disabled) return; S.sel = b.dataset.k; hud(); tip(b.dataset.k === "shovel" ? "Tap a plant to dig it up for half its sun." : "<b>" + PLANTS[S.sel].name + "</b>: " + PLANTS[S.sel].desc + ". Tap a tile."); });
$("go").addEventListener("click", sendRound);
$("speed").addEventListener("click", () => { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1; $("speed").textContent = S.speed + "×"; });
$("again").addEventListener("click", reset);
$("filters").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const f = b.dataset.f, L = $("log");
  if (f === "mute") { b.classList.toggle("on"); L.classList.toggle("mute"); return; }
  document.querySelectorAll('#filters [data-f="all"], #filters [data-f="fight"]').forEach((x) => x.classList.toggle("on", x === b)); L.classList.toggle("fights", f === "fight"); });
addEventListener("resize", () => S.units.forEach((u) => drawUnit(u, true)));
reset(); requestAnimationFrame(loop);
window.WYG = { S, PLANTS, KINDS, place, sendRound, route, reset };
})();
