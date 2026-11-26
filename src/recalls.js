// Recall Watch (/api/recalls, game plan GP-11.1): is anything in the house recalled? The page sends only the words that
// name a thing (its make, its model number, what kind of thing it is), never the record itself, and gets back the US
// Consumer Product Safety Commission's recalls that mention them, from its public Recalls Retrieval web service.
//   GET /api/recalls?model=SMS6&maker=Bosch&kind=dishwasher
//     → { recalls: [{ n, date, title, url, why: "model" | "maker", products: [{ name, model }], makers, hazards, remedies, options, contact, units, image }] }
// A model number is asked for on its own (a recall lists the model numbers it covers); a make with a kind of thing is asked
// for together. Answers are cached at the edge for 12 hours, so the same question doesn't reach the CPSC twice, and each
// connection can ask 300 times a day.
const CPSC = "https://www.saferproducts.gov/RestWebServices/Recall", DAY = 864e5, ASKS_DAY = 300, MAX = 25;
const err = (m, s = 400) => Object.assign(new Error(m), { status: s });
const word = (x, n) => String(x == null ? "" : x).replace(/[^\p{L}\p{N} .&'\/+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, n);
const get = (o, ...ks) => { for (const k of ks) if (o && o[k] != null && o[k] !== "") return o[k]; return null; };
const names = (a, ...ks) => (Array.isArray(a) ? a : []).map((x) => (typeof x === "string" ? x : get(x, ...ks))).filter(Boolean).map((s) => String(s).replace(/\s+/g, " ").trim()).filter((s, i, all) => all.indexOf(s) === i).slice(0, 12);

// one recall, as the page needs it (field names as the CPSC writes them, with their lower-case forms too)
export function recallOf(r, why) {
  const n = String(get(r, "RecallNumber", "recallNumber") || get(r, "RecallID", "recallID") || ""); if (!n) return null;
  const date = String(get(r, "RecallDate", "recallDate") || "").slice(0, 10);
  const products = (Array.isArray(get(r, "Products", "products")) ? get(r, "Products", "products") : []).map((p) => ({ name: String(get(p, "Name", "name") || "").slice(0, 200), model: String(get(p, "Model", "model") || "").slice(0, 400), units: String(get(p, "NumberOfUnits", "numberOfUnits") || "").slice(0, 80) })).filter((p) => p.name || p.model).slice(0, 8);
  const img = (Array.isArray(get(r, "Images", "images")) ? get(r, "Images", "images") : []).map((i) => get(i, "URL", "url")).find((u) => /^https:\/\//.test(String(u || "")));
  const url = String(get(r, "URL", "url") || "");
  return { n, date, why, title: String(get(r, "Title", "title") || "").slice(0, 300), url: /^https:\/\/(www\.)?cpsc\.gov\//.test(url) ? url : "",
    products, makers: names(get(r, "Manufacturers", "manufacturers"), "Name", "name"), hazards: names(get(r, "Hazards", "hazards"), "Name", "name"),
    remedies: names(get(r, "Remedies", "remedies"), "Name", "name"), options: names(get(r, "RemedyOptions", "remedyOptions"), "Option", "option"),
    contact: String(get(r, "ConsumerContact", "consumerContact") || "").slice(0, 600), units: products.map((p) => p.units).find(Boolean) || "", ...(img ? { image: img } : {}) };
}

export async function recalls(req, env, json, { fetchFn = fetch } = {}) {
  try {
    if (req.method !== "GET") throw err("not here", 404);
    const u = new URL(req.url), model = word(u.searchParams.get("model"), 40), maker = word(u.searchParams.get("maker"), 40), kind = word(u.searchParams.get("kind"), 40);
    if (model.replace(/[^\p{L}\p{N}]/gu, "").length < 3 && !(maker.length >= 2 && kind.length >= 3)) throw err("send a model number, or a make and what kind of thing it is");
    const ip = req.headers.get("cf-connecting-ip") || "anon", st = env.STORE.get(env.STORE.idFromName("main"));
    if (!(await st.hit("recalls:" + ip, ASKS_DAY, DAY))) throw err("that's today's " + ASKS_DAY + " recall checks from this connection", 429);
    const ask = async (params, why) => {
      const q = new URLSearchParams({ format: "json", ...params });
      const r = await fetchFn(CPSC + "?" + q, { headers: { accept: "application/json", "user-agent": "mentifaber.org Recall Watch" }, cf: { cacheTtl: 43200, cacheEverything: true }, signal: AbortSignal.timeout(20000) }).catch(() => null);
      if (!r || !r.ok) throw err("the CPSC's recall service didn't answer" + (r ? " (" + r.status + ")" : "") + "; try again later", 502);
      const j = await r.json().catch(() => null); if (!Array.isArray(j)) throw err("the CPSC's recall service sent something unexpected; try again later", 502);
      return j.map((x) => recallOf(x, why)).filter(Boolean);
    };
    const out = new Map();
    if (model.replace(/[^\p{L}\p{N}]/gu, "").length >= 3) for (const x of await ask({ ProductModel: model }, "model")) out.set(x.n, x);
    if (maker.length >= 2 && kind.length >= 3) for (const x of await ask({ Manufacturer: maker, ProductName: kind }, "maker")) if (!out.has(x.n)) out.set(x.n, x);
    const list = [...out.values()].sort((a, b) => (a.why === b.why ? (b.date > a.date ? 1 : -1) : a.why === "model" ? -1 : 1)).slice(0, MAX);
    return json({ recalls: list }, 200, { "cache-control": "private, max-age=3600" });
  } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, e.status || 500); }
}
