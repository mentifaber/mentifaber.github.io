/* House Kitty's sums (game plan GP-10.3): who paid what, each person's share, and the fewest payments that settle everyone
   up. In cents throughout, so every share adds back to the cost exactly. Exposed as window.KittySums, and to Node as
   module.exports for the tests:
     KittySums.shares(cost)       → { personId: cents }      cost: { amount, among: [ids], weights?: { id: n } }
     KittySums.balances(kitty)    → { personId: cents }      + is owed money, − owes it; the balances add up to 0
     KittySums.settle(balances)   → [{ from, to, amount }]   the fewest payments that bring everyone to 0
   Fewest, not just few: people whose balances cancel out among themselves settle within their own group (a group of k
   needs k − 1 payments), so the most groups means the fewest payments. That's found exactly for up to 14 people with
   money to settle (by subsets), and greedily beyond. */
(function (root) {
  "use strict";
  // split a cost: evenly, or by weights (a double room counts 2); the leftover cents go one each to the first people
  function shares(c) {
    const among = (c.among || []).filter((x, i, a) => a.indexOf(x) === i); if (!among.length || !(c.amount > 0)) return {};
    const w = among.map((id) => { const x = c.weights && Number(c.weights[id]); return x > 0 ? x : c.weights ? 0 : 1; }), total = w.reduce((a, b) => a + b, 0);
    if (!total) return {};
    const exact = w.map((x) => (c.amount * x) / total), out = {}; let given = 0;
    among.forEach((id, i) => { out[id] = Math.floor(exact[i]); given += out[id]; });
    // the leftover cents, to whoever lost most to rounding (ties: the order they're listed)
    const order = among.map((id, i) => [id, exact[i] - out[id], i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]);
    for (let k = 0; given < c.amount; k++, given++) out[order[k % order.length][0]]++;
    return out;
  }
  function balances(K) {
    const b = {}; for (const p of K.people || []) b[p.id] = 0;
    const add = (id, n) => { if (id in b) b[id] += n; };
    for (const c of K.costs || []) { const s = shares(c); if (!Object.keys(s).length || !(c.paidBy in b)) continue; add(c.paidBy, c.amount); for (const [id, n] of Object.entries(s)) add(id, -n); }
    for (const p of K.paid || []) { add(p.from, p.amount); add(p.to, -p.amount); }
    return b;
  }
  // within a group whose balances cancel out: the biggest debt to the biggest credit, until everyone's at 0
  function greedy(list) {
    const cr = list.filter((x) => x.n > 0).map((x) => ({ ...x })), db = list.filter((x) => x.n < 0).map((x) => ({ ...x, n: -x.n })), out = [];
    for (;;) { cr.sort((a, b) => b.n - a.n); db.sort((a, b) => b.n - a.n); if (!cr.length || !db.length || !cr[0].n || !db[0].n) break;
      const n = Math.min(cr[0].n, db[0].n); out.push({ from: db[0].id, to: cr[0].id, amount: n }); cr[0].n -= n; db[0].n -= n;
      while (cr.length && !cr[0].n) cr.shift(); while (db.length && !db[0].n) db.shift(); }
    return out;
  }
  function settle(bal) {
    const P = Object.entries(bal).filter(([, n]) => n).map(([id, n]) => ({ id, n })), m = P.length;
    if (!m) return [];
    if (m > 14) return greedy(P);
    // dp[mask]: the most groups that cancel out, among the people in mask
    const N = 1 << m, sum = new Array(N).fill(0), dp = new Int8Array(N), from = new Int8Array(N);
    for (let mask = 1; mask < N; mask++) { const low = mask & -mask, i = 31 - Math.clz32(low); sum[mask] = sum[mask ^ low] + P[i].n; }
    for (let mask = 1; mask < N; mask++) { let best = -1, bi = 0; for (let i = 0; i < m; i++) if (mask & (1 << i)) { const v = dp[mask ^ (1 << i)]; if (v > best) { best = v; bi = i; } } dp[mask] = best + (sum[mask] === 0 ? 1 : 0); from[mask] = bi; }
    // walk back: each time the people left cancel out, the ones taken since are a group
    const groups = []; let mask = N - 1, cur = [];
    while (mask) { const i = from[mask]; cur.push(P[i]); mask ^= 1 << i; if (sum[mask] === 0) { groups.push(cur); cur = []; } }
    return groups.flatMap(greedy);
  }
  const api = { shares, balances, settle, greedy };
  if (typeof module === "object" && module.exports) module.exports = api; else root.KittySums = api;
})(typeof window !== "undefined" ? window : globalThis);
