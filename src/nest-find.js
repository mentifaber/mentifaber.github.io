// The Nest Registry's product finder: for one registry item ("Stroller", with the parents' notes, size, colour, budget), a
// model proposes specific products from different brands and price levels; each is searched on the web (the owner's
// search key, through Hive); its page is read for the product's own photo, name and price (Open Graph and schema.org
// Product data). What comes back is a choice for the parents, not a purchase: they keep the ones closest to what they want.
import { complete } from "./hive-kit.js";

const PICKER = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SKIP = /(^|\.)(youtube\.com|youtu\.be|reddit\.com|wikipedia\.org|pinterest\.[a-z.]+|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|quora\.com)$/i;
const NOFETCH = /(^|\.)(amazon\.[a-z.]+|walmart\.com)$/i; // they turn away page readers: linked, but not read
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const timed = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("took too long")), ms))]);
const unent = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2F;/gi, "/");
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
export const publicHttps = (u) => { try { const x = new URL(u); return x.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i.test(x.hostname) && /\./.test(x.hostname) ? x.href : null; } catch (e) { return null; } };

export function parseProposals(out) {
  const m = /\{[\s\S]*\}/.exec(String(out || "")); let j = null; try { j = m && JSON.parse(m[0]); } catch (e) {}
  const list = j && Array.isArray(j.products) ? j.products : [];
  const seen = new Set();
  return list.map((p) => ({ brand: clip(p && p.brand, 40), model: clip(p && p.model, 80), why: clip(p && p.why, 140), tier: /^(budget|mid|premium)$/.test(p && p.tier) ? p.tier : "mid", price: Number(p && p.price) > 0 ? Math.round(Number(p.price)) : null }))
    .filter((p) => p.brand && p.model && !seen.has((p.brand + p.model).toLowerCase()) && seen.add((p.brand + p.model).toLowerCase())).slice(0, 6);
}

// a product page's own photo, name and price: schema.org Product first, then Open Graph / Twitter meta
export function pageProduct(html, base) {
  const t = String(html || "").slice(0, 900000), out = {};
  const meta = (k) => { const re = new RegExp("<meta[^>]+(?:property|name|itemprop)=[\"']" + k + "[\"'][^>]*>", "i"), tag = re.exec(t); if (!tag) return ""; const c = /content=["']([^"']*)["']/i.exec(tag[0]); return c ? unent(c[1]).trim() : ""; };
  for (const m of t.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch (e) { continue; }
    const all = [].concat(j, ...(Array.isArray(j) ? [] : [j["@graph"] || []]));
    const p = all.find((x) => x && /(^|,)\s*Product\b/.test([].concat(x["@type"] || []).join(","))); if (!p) continue;
    const img = [].concat(p.image || [])[0]; out.image = out.image || (typeof img === "string" ? img : img && (img.url || img.contentUrl));
    out.title = out.title || p.name;
    const off = [].concat(p.offers || [])[0]; const o2 = off && (off.price != null ? off : [].concat(off.offers || [])[0] || off);
    if (o2 && (o2.price != null || o2.lowPrice != null)) { out.price = Number(o2.price ?? o2.lowPrice); out.currency = o2.priceCurrency || ""; }
    break;
  }
  out.image = out.image || meta("og:image:secure_url") || meta("og:image") || meta("twitter:image") || meta("twitter:image:src");
  out.title = out.title || meta("og:title") || unent((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(t) || [])[1] || "");
  if (out.price == null) { const p = meta("product:price:amount") || meta("og:price:amount"); if (p && !isNaN(+p)) { out.price = +p; out.currency = meta("product:price:currency") || meta("og:price:currency") || ""; } }
  try { if (out.image) out.image = publicHttps(new URL(String(out.image).trim(), base).href); } catch (e) { out.image = null; }
  out.title = clip(unent(out.title), 120); if (!(out.price > 0)) { delete out.price; delete out.currency; }
  return out;
}
async function readProduct(u) {
  const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; MentifaberNest/1; +https://mentifaber.org)", accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(7000) });
  if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) throw new Error("HTTP " + r.status);
  return pageProduct((await r.text()).slice(0, 900000), r.url || u);
}

// h: { env, web(q) }. item: { name, cat, notes, brand, color, size, price, look }. → { products: [...] } or { error }
export async function findProducts(h, item) {
  const name = clip(item.name, 120); if (!name) return { error: "name the item first" };
  const wants = [item.look && "what they're looking for: " + clip(item.look, 200), item.notes && "their notes: " + clip(item.notes, 300), item.brand && "brand or model they mentioned: " + clip(item.brand, 80), item.color && "colour/style: " + clip(item.color, 60), item.size && "size: " + clip(item.size, 20), item.price && "around $" + Math.round(item.price) + " each"].filter(Boolean).join("; ");
  const sys = "You help new parents choose baby products. For the registry item, name 6 specific products that are on sale now: different brands, and a mix of price levels (2 budget, 2 mid-range, 2 premium) unless the parents' preferences say otherwise. Prefer well-reviewed, safety-certified products. Reply with ONLY JSON: {\"products\": [{\"brand\": \"...\", \"model\": \"...\", \"tier\": \"budget|mid|premium\", \"price\": 199, \"why\": \"one short reason a parent might pick it\"}]}";
  const ideas = parseProposals(await timed(complete(h.env, null, null, PICKER, sys, [{ role: "user", text: "ITEM: " + name + (item.cat ? " (" + clip(item.cat, 40) + ")" : "") + (wants ? "\nPARENTS' PREFERENCES: " + wants : "") }], 900), 25000).catch(() => ""));
  if (!ideas.length) return { error: "couldn't come up with products for that; try again, or describe what you're after" };
  const products = await Promise.all(ideas.map(async (p) => {
    const q = p.brand + " " + p.model;
    const hits = (await timed(h.web(q), 12000).catch(() => [])).map((x) => ({ ...x, url: publicHttps(x.url) })).filter((x) => x.url && !SKIP.test(host(x.url)));
    let best = null;
    for (const x of hits.filter((x) => !NOFETCH.test(host(x.url))).slice(0, 3)) {
      const got = await readProduct(x.url).catch(() => null);
      if (got && got.image) { best = { ...got, url: x.url }; break; }
    }
    const link = best ? best.url : hits[0] && hits[0].url;
    return { brand: p.brand, model: p.model, tier: p.tier, why: p.why, title: clip((best && best.title) || q, 120), url: link || null, store: link ? host(link) : "", image: (best && best.image) || null, price: best && best.price ? best.price : null, currency: best && best.currency || "", approx: p.price };
  }));
  return { products: products.filter((p) => p.url || p.image), searched: ideas.length };
}
