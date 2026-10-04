// Thoughtform, headless: a deterministic top-down simulation of the arena for AI agents.
// Same thoughts, instruments, abilities, waves, insights and scoring as the browser game,
// flattened to the floor plane (x, z) and played in steps: choose an action, the world runs
// for that many seconds at 60 Hz. Everything random comes from the run's seed, so a run is
// a seed plus its list of actions and the server can replay it to verify the score.
const R = 33, DAIS = 7, HZ = 60;
const KIND = [
  { name: "DOUBT", r: .9, hp: 34, sp: 7.4, pts: 100, touch: 11, focus: 9 },
  { name: "ECHO", r: 1.15, hp: 60, sp: 4.2, pts: 180, touch: 11, focus: 14 },
  { name: "KNOT", r: 1.8, hp: 240, sp: 2.4, pts: 400, touch: 22, focus: 30 },
  { name: "WHISPER", r: .85, hp: 26, sp: 9.5, pts: 140, touch: 11, focus: 11 },
  { name: "LANCE", r: .85, hp: 50, sp: 3.4, pts: 220, touch: 10, focus: 16 },
  { name: "SWARM", r: .5, hp: 14, sp: 11, pts: 60, touch: 6, focus: 4 },
  { name: "THE CRITIC", r: 3.2, hp: 1700, sp: 2.4, pts: 3000, touch: 30, focus: 100 },
  null,
  { name: "LOOP", r: .95, hp: 70, sp: 5, pts: 260, touch: 14, focus: 18 },
  { name: "DENIAL", r: 1.2, hp: 120, sp: 2.6, pts: 350, touch: 8, focus: 20 },
];
const WEAP = { quill: { cd: .11, heat: .055 }, scatter: { cd: .6, heat: .2 }, cannon: { cd: .85, heat: .3 }, beam: { cd: .05, heat: .03 } };
const PERKS = [
  ["sharp", "SHARPER QUILL", "+20% damage", (m) => (m.dmg *= 1.2)],
  ["cool", "COOL HEAD", "25% less heat", (m) => (m.heat *= .75)],
  ["wind", "SECOND WIND", "+25 max resolve, healed", (m, p) => { p.max += 25; p.hp = p.max; }],
  ["leech", "LEECH THOUGHTS", "kills heal 3", (m) => (m.leech += 3)],
  ["chain", "CHAIN OF THOUGHT", "quill hits arc to a second thought", (m) => (m.chain += .6)],
  ["step", "QUICK STEP", "dash recharges 35% faster", (m) => (m.dashCd *= .65)],
  ["focus", "DEEP FOCUS", "+40% focus from kills", (m) => (m.focus *= 1.4)],
  ["vol", "VOLATILE IDEAS", "kills burst for 30 nearby", (m) => (m.volatile += 30)],
  ["wide", "WIDE SCATTER", "+4 scatter pellets", (m) => (m.pellets += 4)],
  ["proof", "HEAVY PROOF", "cannon 30% wider and harder", (m) => (m.blast *= 1.3)],
  ["skin", "THICK SKIN", "15% less damage taken", (m) => (m.armor *= .85)],
  ["quick", "QUICK MIND", "shockwave and barrier recharge 30% faster", (m) => (m.abil *= .7)],
  ["keen", "KEEN EYE", "+8% crit chance", (m) => (m.crit += .08)],
  ["over", "OVERCLOCK", "weapons fire 15% faster", (m) => (m.rate *= .85)],
];
export const TF_MODES = { endless: { hp: 100, hpK: 1, spK: 1, mult: 1 }, hard: { hp: 60, hpK: 1.35, spK: 1.18, mult: 2 }, blitz: { hp: 100, hpK: 1, spK: 1, mult: 1, clock: 180, spawnK: 1.4 } };
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hyp = Math.hypot, r1 = (v) => Math.round(v * 10) / 10;

export function createThoughtform(seed, modeName) {
  const M = TF_MODES[modeName] || TF_MODES.endless, rnd = mulberry(seed >>> 0 || 1);
  const P = { x: 0, z: 4, vx: 0, vz: 0, hp: M.hp, max: M.hp, focus: 0, heat: 0, over: 0, cd: 0, shock: 0, bar: 0, barT: 0, dash: 0, dashT: 0, inv: 0, air: 0, slow: 0,
    m: { dmg: 1, heat: 1, leech: 0, chain: 0, dashCd: 1, focus: 1, volatile: 0, pellets: 8, blast: 1, armor: 1, abil: 1, crit: 0, rate: 1 }, perks: [] };
  let E = [], orbs = [], slam = null, wave = 0, toSpawn = 0, left = 0, spawnT = 0, breath = 0, score = 0, combo = 0, comboT = 0, kills = 0, t = 0, nid = 0, dead = false, why = "", choice = null, clock = M.clock || 0, events = [];
  const say = (s) => { if (events.length < 12) events.push(s); };
  function spawn(k, at) {
    if (E.length >= 18) return false; const K = KIND[k], a = rnd() * 6.283;
    const e = { id: ++nid, k, x: at ? at.x : Math.cos(a) * 30, z: at ? at.z : Math.sin(a) * 30, hp: K.hp * (1 + wave * .06) * M.hpK, r: K.r, fire: 1.5 + rnd() * 1.5, touch: 0, orbit: rnd() < .5 ? 1 : -1, charge: 0, aim: null, ph: rnd() * 9, grow: at ? 1 : 0, elite: false };
    if (k < 6 && wave >= 3 && !at && rnd() < Math.min(.06 + wave * .01, .18)) { e.elite = true; e.hp *= 2.5; e.r *= 1.3; }
    e.max = e.hp; E.push(e); return true;
  }
  function kindFor() {
    const r = rnd(), w = wave;
    if (w >= 6 && rnd() < .08) return 8; if (w >= 7 && rnd() < .06) return 9;
    if (w >= 3 && r < Math.min(.12 + w * .015, .25)) return 2; if (w >= 2 && rnd() < .22) return 3;
    if (w >= 4 && rnd() < .12) return 4; if (w >= 4 && rnd() < .1) return 5;
    if (w >= 2 && r < Math.min(.3 + w * .03, .55)) return 1; return 0;
  }
  function nextWave() {
    wave++; toSpawn = Math.round((4 + wave * 2 + Math.floor(wave * wave * .15)) * (M.spawnK || 1)); left = toSpawn; spawnT = .6; breath = 0;
    if (wave % 5 === 0) { toSpawn = 3 + wave / 5; left = toSpawn + 1; spawn(6, { x: 0, z: -16 }); E[E.length - 1].grow = 0; say("THE CRITIC arrives (boss). Its floor ring hurts unless you jump as it passes."); }
    else say("wave " + wave + " begins");
  }
  function hurt(n) {
    if (P.inv > 0 || dead) return; if (P.barT > 0) n *= .3; n *= P.m.armor; P.hp -= n; P.inv = .35;
    if (P.hp <= 0) { P.hp = 0; dead = true; why = "RESOLVE GONE"; }
  }
  function damage(e, d, depth) {
    if (e.dead) return; d *= P.m.dmg; if (!depth && rnd() < .12 + P.m.crit) d *= 2; e.hp -= d;
    if (e.hp > 0) return;
    e.dead = true; kills++; combo++; comboT = 2.4; const K = KIND[e.k];
    const pts = Math.round(K.pts * M.mult * (e.elite ? 2.5 : 1) * Math.min(4, 1 + (combo - 1) * .25) * (P.slow > 0 ? 1.5 : 1)); score += pts;
    P.focus = Math.min(100, P.focus + K.focus * P.m.focus * (P.slow > 0 ? 0 : 1)); if (P.m.leech) P.hp = Math.min(P.max, P.hp + P.m.leech);
    if (e.elite) P.hp = Math.min(P.max, P.hp + 8);
    if (P.m.volatile && (depth || 0) < 2) for (const o of E) if (!o.dead && o !== e && hyp(o.x - e.x, o.z - e.z) < 4) damage(o, P.m.volatile / P.m.dmg, (depth || 0) + 1);
    if (e.k === 6) { P.hp = P.max; P.focus = 100; slam = null; say("THE CRITIC falls (+" + pts + ")"); } else say(K.name + " #" + e.id + " erased +" + pts);
    if (e.k === 2) for (let i = 0; i < 2; i++) if (spawn(0, { x: e.x + (i ? 1 : -1), z: e.z })) left++;
    left--;
  }
  const near = () => { let b = null, bd = 1e9; for (const e of E) { if (e.dead) continue; const d = hyp(e.x - P.x, e.z - P.z); if (d < bd) { bd = d; b = e; } } return b; };
  // aim error grows with distance and your own speed, as it does for a person
  const lands = (e) => { const d = hyp(e.x - P.x, e.z - P.z), miss = (.1 + hyp(P.vx, P.vz) * .006) * d; return rnd() * (miss + e.r) < e.r * 1.05; };
  function fire(wn, tgt) {
    if (P.over > 0 || P.cd > 0 || !tgt || tgt.dead) return; const W = WEAP[wn];
    P.cd = W.cd * P.m.rate * (P.slow > 0 ? .65 : 1); P.heat += W.heat * P.m.heat * (P.slow > 0 ? .4 : 1); if (P.heat >= 1) { P.over = 1.3; say("overheated: weapons locked 1.3s"); }
    const dx = tgt.x - P.x, dz = tgt.z - P.z, dl = hyp(dx, dz) || 1, ux = dx / dl, uz = dz / dl, two = P.slow > 0 ? 2 : 1;
    if (wn === "quill") { if (lands(tgt)) { damage(tgt, 15 * two); if (P.m.chain) { let nb = null, nd = 8; for (const q of E) if (q !== tgt && !q.dead && hyp(q.x - tgt.x, q.z - tgt.z) < nd) { nd = hyp(q.x - tgt.x, q.z - tgt.z); nb = q; } if (nb) damage(nb, 15 * two * P.m.chain, 1); } } }
    if (wn === "scatter") for (let i = 0; i < P.m.pellets; i++) { const sp = (rnd() - .5) * .16, cx = ux * Math.cos(sp) - uz * Math.sin(sp), cz = ux * Math.sin(sp) + uz * Math.cos(sp);
      let best = null, bt = 26; for (const e of E) { if (e.dead) continue; const px = e.x - P.x, pz = e.z - P.z, tt = px * cx + pz * cz; if (tt > 0 && tt < bt && hyp(px - cx * tt, pz - cz * tt) < e.r) { bt = tt; best = e; } }
      if (best) damage(best, 11 * Math.max(.35, 1 - bt / 26) * two, i > 0 ? 1 : 0); }
    if (wn === "cannon") { const at = { x: tgt.x, z: tgt.z }, rad = 5.5 * P.m.blast; for (const e of E) { if (e.dead) continue; const d = hyp(e.x - at.x, e.z - at.z); if (d < rad) damage(e, 120 * Math.sqrt(P.m.blast) * (1 - d / (rad + 1.5)) * (P.slow > 0 ? 1.5 : 1)); } }
    if (wn === "beam") { const hit = E.filter((e) => { if (e.dead) return false; const px = e.x - P.x, pz = e.z - P.z, tt = px * ux + pz * uz; return tt > 0 && tt < 45 && hyp(px - ux * tt, pz - uz * tt) < e.r; }).slice(0, 6); hit.forEach((e, i) => damage(e, 7 * two, i ? 1 : 0)); }
  }
  function tick(act, dt) {
    if (dead || choice) return; t += dt; const es = P.slow > 0 ? .35 : 1, edt = dt * es;
    if (t > 900) { dead = true; why = "TIME LIMIT (15 minutes)"; return; }
    if (clock) { clock -= dt; if (clock <= 0) { clock = 0; dead = true; why = "TIME (blitz over)"; return; } }
    // move: a direction held for the step, or a dash burst
    let mx = act.mx || 0, mz = act.mz || 0; const ml = hyp(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    if (P.dashT > 0) P.dashT -= dt; else { P.vx += (mx * 9.5 - P.vx) * Math.min(1, 14 * dt); P.vz += (mz * 9.5 - P.vz) * Math.min(1, 14 * dt); }
    P.x += P.vx * dt; P.z += P.vz * dt; const pr = hyp(P.x, P.z); if (pr > R - .8) { P.x *= (R - .8) / pr; P.z *= (R - .8) / pr; }
    for (const k of ["cd", "shock", "bar", "barT", "dash", "inv", "air", "slow"]) P[k] = Math.max(-1, P[k] - dt);
    if (P.over > 0) { P.over -= dt; P.heat = Math.max(0, P.heat - dt * .8); } else P.heat = Math.max(0, P.heat - dt * (act.weapon ? .32 : .62));
    comboT -= dt; if (comboT <= 0) combo = 0;
    if (act.weapon) { const tgt = act.target ? E.find((e) => e.id === act.target && !e.dead) : near(); fire(act.weapon, tgt || near()); }
    // waves
    if (toSpawn > 0) { spawnT -= edt; if (spawnT <= 0) { const k = kindFor(); if (spawn(k)) { toSpawn--; spawnT = Math.max(.35, 1.4 - wave * .07) * (M.spawnK ? .6 : 1);
      if (k === 5) { const a = E[E.length - 1]; for (let i = 0; i < 3; i++) if (spawn(5, { x: a.x + Math.cos(i * 2.1) * 1.4, z: a.z + Math.sin(i * 2.1) * 1.4 })) left++; } } else spawnT = .5; } }
    else if (left <= 0 && !E.some((e) => !e.dead)) {
      if (!breath) { P.hp = Math.min(P.max, P.hp + 20); const pool = PERKS.slice(), pick = []; while (pick.length < 3) pick.push(pool.splice(rnd() * pool.length | 0, 1)[0]); choice = pick; breath = 1; say("wave " + wave + " CLEAR: +20 resolve. Choose an insight."); return; }
      breath -= dt; if (breath <= 0) nextWave();
    }
    // the Critic's floor ring
    if (slam) { slam.t += edt; if (slam.t > 0) { const R2 = slam.t * 17, d = hyp(P.x - slam.x, P.z - slam.z); if (!slam.hit && P.air <= 0 && Math.abs(d - R2) < 1.1) { slam.hit = true; hurt(26); } if (R2 > 36) slam = null; } }
    for (const e of E) {
      if (e.dead) continue; const K = KIND[e.k]; e.grow = Math.min(1, e.grow + edt * 1.4); e.ph += edt;
      const dx = P.x - e.x, dz = P.z - e.z, dist = hyp(dx, dz) || 1; let tx = dx / dist, tz = dz / dist;
      if (e.k === 3) { const side = Math.sin(e.ph * 1.3) > 0 ? 1 : -1, l = dist < 7 ? 1.4 : .55; const ox = -tz * side, oz = tx * side; tx = tx * l + ox; tz = tz * l + oz; }
      if (e.k === 5) { tx += Math.sin(e.ph * 7) * .6; tz += Math.cos(e.ph * 6) * .6; }
      if (e.k === 1 || e.k === 4 || e.k === 9) { const want = e.k === 1 ? 15 : e.k === 4 ? 21 : 18, rad = dist > want + 2 ? 1 : dist < want - 2 ? -1 : 0, ox = -tz * e.orbit, oz = tx * e.orbit; tx = tx * rad + ox * .8; tz = tz * rad + oz * .8; if (e.charge > 0) { tx *= .1; tz *= .1; } }
      if (e.k === 6) { const a = e.ph * .22, qx = Math.cos(a) * 11 - e.x, qz = Math.sin(a) * 11 - e.z, ql = hyp(qx, qz) || 1; tx = qx / ql; tz = qz / ql; }
      for (const o of E) { if (o === e || o.dead) continue; const qx = e.x - o.x, qz = e.z - o.z, qd = hyp(qx, qz), m = e.r + o.r + .3; if (qd < m && qd > .01) { tx += qx / qd * (m - qd); tz += qz / qd * (m - qd); } }
      const tl = hyp(tx, tz) || 1, sp = M.spK * K.sp * (e.k === 0 ? 1 + Math.min(wave, 10) * .03 : 1) * e.grow;
      e.x += tx / tl * sp * edt; e.z += tz / tl * sp * edt;
      e.touch -= edt; if (dist < e.r + .55 && e.touch <= 0 && e.grow > .9) { hurt(K.touch); e.touch = .7; }
      if (e.grow < 1) continue;
      if (e.k === 1) { e.fire -= edt; if (e.fire <= 0) { e.fire = Math.max(1.1, 2.6 - wave * .08) * (.8 + rnd() * .4); const ax = P.x + P.vx * .5 - e.x, az = P.z + P.vz * .5 - e.z, al = hyp(ax, az) || 1; if (orbs.length < 24) orbs.push({ x: e.x, z: e.z, vx: ax / al * 13, vz: az / al * 13, t: 6 }); } }
      if (e.k === 4) { if (e.charge > 0) { e.charge -= edt; if (e.charge > .45) e.aim = { x: P.x, z: P.z }; if (e.charge <= 0) { if (hyp(P.x - e.aim.x, P.z - e.aim.z) < .85) hurt(20); e.fire = 3.4 + rnd() * 1.5; } } else { e.fire -= edt; if (e.fire <= 0) { e.charge = 1.35; e.aim = { x: P.x, z: P.z }; } } }
      if (e.k === 8) { e.fire -= edt; if (e.fire <= 0) { e.fire = 3 + rnd() * 1.5; const a = rnd() * 6.283, d2 = 6 + rnd() * 3; e.x = P.x + Math.cos(a) * d2; e.z = P.z + Math.sin(a) * d2; } }
      if (e.k === 9) { e.fire -= edt; if (e.fire <= 0) { e.fire = 2.2; let w = null; for (const o of E) if (o !== e && !o.dead && o.k !== 9 && o.hp < o.max && hyp(o.x - e.x, o.z - e.z) < 14 && (!w || o.hp / o.max < w.hp / w.max)) w = o; if (w) w.hp = Math.min(w.max, w.hp + w.max * .25); } }
      if (e.k === 6) { e.fire -= edt; if (e.fire <= 0) { e.fire = e.hp < e.max * .5 ? 2.4 : 3.4; e.atk = ((e.atk || 0) + 1) % 3;
        if (e.atk === 0) for (let i = 0; i < 12 && orbs.length < 24; i++) { const a = i / 12 * 6.283 + e.ph; orbs.push({ x: e.x, z: e.z, vx: Math.cos(a) * 9, vz: Math.sin(a) * 9, t: 6 }); }
        if (e.atk === 1) slam = { x: e.x, z: e.z, t: -1.15, hit: false };
        if (e.atk === 2) for (let i = 0; i < 3; i++) if (spawn(5, { x: e.x + Math.cos(i * 2.1) * 3, z: e.z + Math.sin(i * 2.1) * 3 })) left++; } }
    }
    E = E.filter((e) => !e.dead);
    for (const o of orbs) { o.x += o.vx * edt; o.z += o.vz * edt; o.t -= edt; const od = hyp(o.x - P.x, o.z - P.z); if (P.barT > 0 && od < 2.2) { o.t = 0; P.focus = Math.min(100, P.focus + 4); } else if (od < .87) { hurt(9); o.t = 0; } if (hyp(o.x, o.z) > 34) o.t = 0; }
    orbs = orbs.filter((o) => o.t > 0);
  }
  nextWave();
  const g = {
    // act: {weapon: quill|scatter|cannon|beam|null, target: enemy id, move: [x,z] direction, dash: [x,z], ability: shockwave|barrier|rewrite|jump, pick: 0|1|2}
    step(a, secs) {
      events = []; if (dead) return 0;
      if (choice) { const i = Math.max(0, Math.min(2, a.pick | 0)); const k = choice[i]; k[3](P.m, P); P.perks.push(k[1]); say("insight taken: " + k[1]); choice = null; return 0; }
      const ab = a.ability;
      if (ab === "shockwave" && P.shock <= 0) { P.shock = 8 * P.m.abil; for (const e of E) { const d = hyp(e.x - P.x, e.z - P.z); if (d < 9) { damage(e, 55 * (1 - d / 11)); const k = 30 / (d || 1); e.x += (e.x - P.x) / (d || 1) * Math.min(4, k * .15); e.z += (e.z - P.z) / (d || 1) * Math.min(4, k * .15); } } orbs = orbs.filter((o) => hyp(o.x - P.x, o.z - P.z) > 9); say("shockwave"); }
      if (ab === "barrier" && P.bar <= 0) { P.bar = 15 * P.m.abil; P.barT = 5; say("barrier up for 5s (blocks orbs, 70% less damage)"); }
      if (ab === "rewrite" && P.focus >= 100 && P.slow <= 0) { P.focus = 0; P.slow = 7; P.heat = 0; P.over = 0; say("REWRITE: time slows for 7s, double damage"); }
      if (ab === "jump" && P.air <= 0) P.air = .75;
      if (a.dash && P.dash <= 0) { const dl = hyp(a.dash[0], a.dash[1]) || 1; P.vx = a.dash[0] / dl * 26; P.vz = a.dash[1] / dl * 26; P.dashT = .16; P.dash = .9 * P.m.dashCd; P.inv = .25; }
      const act = { weapon: WEAP[a.weapon] ? a.weapon : null, target: +a.target || 0, mx: a.move ? +a.move[0] || 0 : 0, mz: a.move ? +a.move[1] || 0 : 0 };
      const n = Math.max(1, Math.min(HZ * 3, Math.round(secs * HZ))); let k = 0;
      for (; k < n && !dead && !choice; k++) tick(act, 1 / HZ);
      return k;
    },
    over: () => dead,
    obs() {
      const es = E.filter((e) => !e.dead).map((e) => ({ id: e.id, kind: KIND[e.k].name, x: r1(e.x), z: r1(e.z), dist: r1(hyp(e.x - P.x, e.z - P.z)), hp: Math.ceil(e.hp), elite: e.elite || undefined, charging: e.k === 4 && e.charge > 0 ? r1(e.charge) : undefined, spawning: e.grow < 1 || undefined })).sort((a, b) => a.dist - b.dist);
      let threat = null; for (const o of orbs) { const d = hyp(o.x - P.x, o.z - P.z), closing = ((P.x - o.x) * o.vx + (P.z - o.z) * o.vz) > 0; if (closing && (!threat || d < threat.dist)) threat = { dist: r1(d), from: [r1(o.x), r1(o.z)] }; }
      return {
        time: r1(t), wave, score, kills, combo, resolve: Math.ceil(P.hp), max_resolve: P.max, focus: Math.floor(P.focus), heat: r1(P.heat), overheated: P.over > 0,
        you: { x: r1(P.x), z: r1(P.z) }, arena_radius: R, ready: { shockwave: P.shock <= 0, barrier: P.bar <= 0, barrier_active: P.barT > 0, dash: P.dash <= 0, rewrite: P.focus >= 100 && P.slow <= 0, rewriting: P.slow > 0 },
        thoughts_left_in_wave: Math.max(0, left), thoughts: es.slice(0, 12), orbs_flying: orbs.length, nearest_orb_closing: threat,
        critic_ring: slam ? (slam.t < 0 ? "WARNING: ring fires in " + r1(-slam.t) + "s, jump when it reaches you" : "ring expanding, radius " + r1(slam.t * 17) + ", your distance " + r1(hyp(P.x - slam.x, P.z - slam.z))) : undefined,
        insight_choice: choice ? choice.map((c, i) => ({ pick: i, name: c[1], does: c[2] })) : undefined, insights: P.perks, blitz_seconds_left: clock ? Math.ceil(clock) : undefined,
        events, over: dead || undefined, ended_by: dead ? why : undefined,
      };
    },
    get t() { return t; },
  };
  return g;
}
