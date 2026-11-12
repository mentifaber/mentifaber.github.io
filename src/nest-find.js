// The Nest Registry's product finder: for one registry item ("Crib", with the parents' notes, size, colour, budget), a
// model proposes specific products from different brands and price levels; each is searched on the web (the owner's
// search key, through Hive). Its photo must be the product itself: taken from the product page's own product data or from
// the search's image results, downloaded, and checked (a real photo, big enough, roughly square: not a logo, an icon or a
// 1200×630 share banner). A product without such a photo is left out; nothing is shown with a placeholder. Kept photos go
// straight into the registry's storage, so the previews never depend on a store's server.
import { complete } from "./hive-kit.js";

const PICKER = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SKIP = /(^|\.)(youtube\.com|youtu\.be|reddit\.com|wikipedia\.org|pinterest\.[a-z.]+|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|quora\.com)$/i;
const NOFETCH = /(^|\.)(amazon\.[a-z.]+|walmart\.com)$/i; // they turn away page readers: linked, but not read
const BADIMG = /(logo|icon|sprite|favicon|banner|placeholder|no[-_]?image|default|social|share|og[-_]?image|opengraph|avatar|badge|flag|payment|seal|hero|header|swatch|thumb_?s\b|1x1|pixel|spacer)/i;
const IMAGE = /^image\/(jpeg|png|webp|gif)$/, IMG_MAX = 3e6;
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const timed = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("took too long")), ms))]);
const unent = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2F;/gi, "/");
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
export const publicHttps = (u) => { try { const x = new URL(u); return x.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i.test(x.hostname) && /\./.test(x.hostname) ? x.href : null; } catch (e) { return null; } };

// Workers AI's free daily allowance (and similar limits) running out: worth waiting for, not worth retrying now
export const quota = (msg) => /4006|neurons|daily (free )?allocation|quota|rate.?limit|too many requests|\b429\b/i.test(String(msg || ""));

export function parseProposals(out, max = 8) {
  const m = /\{[\s\S]*\}/.exec(String(out || "")); let j = null; try { j = m && JSON.parse(m[0]); } catch (e) {}
  const list = j && Array.isArray(j.products) ? j.products : [];
  const seen = new Set();
  return list.map((p) => ({ brand: clip(p && p.brand, 40), model: clip(p && p.model, 80), why: clip(p && p.why, 140), tier: /^(budget|mid|premium)$/.test(p && p.tier) ? p.tier : "mid", price: Number(p && p.price) > 0 ? Math.round(Number(p.price)) : null }))
    .filter((p) => p.brand && p.model && !seen.has((p.brand + p.model).toLowerCase()) && seen.add((p.brand + p.model).toLowerCase())).slice(0, max);
}

// a picture's size from its first bytes (PNG, GIF, WebP, JPEG): { w, h } or null
export function imageSize(b) {
  b = b instanceof Uint8Array ? b : new Uint8Array(b); const u16 = (i) => (b[i] << 8) | b[i + 1], le16 = (i) => b[i] | (b[i + 1] << 8);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { w: ((b[16] << 24) | (b[17] << 16) | u16(18)) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | u16(22)) >>> 0 };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: le16(6), h: le16(8) };
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    const c = String.fromCharCode(...b.slice(12, 16));
    if (c === "VP8 ") return { w: le16(26) & 0x3fff, h: le16(28) & 0x3fff };
    if (c === "VP8L") return { w: 1 + (((b[22] & 0x3f) << 8) | b[21]), h: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
    if (c === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]; if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { w: u16(i + 7), h: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
  }
  return null;
}
// is this the kind of picture a product preview is? a real photo, big enough, roughly square (not a banner, not a logo)
export const productShaped = (s) => !!s && s.w >= 250 && s.h >= 250 && s.w / s.h >= 0.62 && s.w / s.h <= 1.6;

// a product page's own data: schema.org Product (its photo, name, price) and Open Graph
export function pageProduct(html, base) {
  const t = String(html || "").slice(0, 900000), out = { product: false };
  const meta = (k) => { const re = new RegExp("<meta[^>]+(?:property|name|itemprop)=[\"']" + k + "[\"'][^>]*>", "i"), tag = re.exec(t); if (!tag) return ""; const c = /content=["']([^"']*)["']/i.exec(tag[0]); return c ? unent(c[1]).trim() : ""; };
  for (const m of t.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch (e) { continue; }
    const all = [].concat(j, ...(Array.isArray(j) ? [] : [j["@graph"] || []]));
    const p = all.find((x) => x && /(^|,)\s*Product\b/.test([].concat(x["@type"] || []).join(","))); if (!p) continue;
    out.product = true;
    out.images = [].concat(p.image || []).map((i) => (typeof i === "string" ? i : i && (i.url || i.contentUrl))).filter(Boolean);
    out.title = p.name;
    const off = [].concat(p.offers || [])[0]; const o2 = off && (off.price != null ? off : [].concat(off.offers || [])[0] || off);
    if (o2 && (o2.price != null || o2.lowPrice != null)) { out.price = Number(o2.price ?? o2.lowPrice); out.currency = o2.priceCurrency || ""; }
    break;
  }
  if (/product/i.test(meta("og:type"))) out.product = true;
  out.og = meta("og:image:secure_url") || meta("og:image") || meta("twitter:image");
  out.title = out.title || meta("og:title") || unent((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(t) || [])[1] || "");
  if (out.price == null) { const p = meta("product:price:amount") || meta("og:price:amount"); if (p && !isNaN(+p)) { out.price = +p; out.currency = meta("product:price:currency") || meta("og:price:currency") || ""; } }
  const abs = (u) => { try { return publicHttps(new URL(String(u).trim(), base).href); } catch (e) { return null; } };
  out.images = (out.images || []).map(abs).filter(Boolean); out.og = out.og ? abs(out.og) : null;
  out.title = clip(unent(out.title), 120); if (!(out.price > 0)) { delete out.price; delete out.currency; }
  return out;
}
async function readPage(u) {
  const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; MentifaberNest/1; +https://mentifaber.org)", accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(6000) });
  if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) throw new Error("HTTP " + r.status);
  return { ...pageProduct((await r.text()).slice(0, 900000), r.url || u), url: u };
}
// download a candidate photo and keep it only if it is product-shaped
async function photo(u) {
  u = publicHttps(u); if (!u) return null; let path = ""; try { path = decodeURIComponent(new URL(u).pathname); } catch (e) { path = u; } if (BADIMG.test(path)) return null;
  const r = await fetch(u, { headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*", "user-agent": "Mozilla/5.0 (compatible; MentifaberNest/1)" }, redirect: "follow", signal: AbortSignal.timeout(8000) }).catch(() => null);
  const type = r && (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(); if (!r || !r.ok || !IMAGE.test(type || "")) return null;
  const buf = await r.arrayBuffer().catch(() => null); if (!buf || buf.byteLength < 6000 || buf.byteLength > IMG_MAX) return null;
  const size = imageSize(new Uint8Array(buf, 0, Math.min(buf.byteLength, 65536))); return productShaped(size) ? { url: u, buf, type, ...size } : null;
}

// h: { env, web(q, { images }), store(buf, type) → id }. item: { name, cat, notes, brand, color, size, price, look }. → { products } or { error }
export async function findProducts(h, item) {
  const name = clip(item.name, 120); if (!name) return { error: "name the item first" };
  const wants = [item.look && "what they're looking for: " + clip(item.look, 200), item.notes && "their notes: " + clip(item.notes, 300), item.brand && "brand or model they mentioned: " + clip(item.brand, 80), item.color && "colour/style: " + clip(item.color, 60), item.size && "size: " + clip(item.size, 20), item.price && "around $" + Math.round(item.price) + " each"].filter(Boolean).join("; ");
  const sys = "You help new parents choose baby products. For the registry item, name 8 specific products that are on sale now: different brands, and a mix of price levels (budget, mid-range, premium) unless the parents' preferences say otherwise. Prefer well-reviewed, safety-certified products sold by major baby retailers. Use each product's exact model name. Reply with ONLY JSON: {\"products\": [{\"brand\": \"...\", \"model\": \"...\", \"tier\": \"budget|mid|premium\", \"price\": 199, \"why\": \"one short reason a parent might pick it\"}]}";
  let why = "";
  const ideas = parseProposals(await timed(complete(h.env, null, null, PICKER, sys, [{ role: "user", text: "ITEM: " + name + (item.cat ? " (" + clip(item.cat, 40) + ")" : "") + (wants ? "\nPARENTS' PREFERENCES: " + wants : "") }], 1100), 25000).catch((e) => { why = String((e && e.message) || e); return ""; }));
  if (!ideas.length) return quota(why) ? { error: "the free daily AI allowance is used up; product finding carries on by itself tomorrow", later: true } : { error: "couldn't come up with products for that; try again, or describe what you're after" };
  const products = await Promise.all(ideas.map(async (p) => {
    const q = p.brand + " " + p.model + (new RegExp(name.split(/\s+/)[0], "i").test(p.model) ? "" : " " + name);
    const res = await timed(h.web(q, { images: true }), 15000).catch(() => []);
    const hits = res.map((x) => ({ ...x, url: publicHttps(x.url) })).filter((x) => x.url && !SKIP.test(host(x.url)));
    const pages = (await Promise.all(hits.filter((x) => !NOFETCH.test(host(x.url))).slice(0, 3).map((x) => readPage(x.url).catch(() => null)))).filter(Boolean);
    const shop = pages.find((x) => x.product) || null;
    // the product's own photos first, then the search's image results, then a product page's share image
    const cands = [...new Set([...pages.filter((x) => x.product).flatMap((x) => x.images), ...(res.images || []), ...pages.filter((x) => x.product && x.og).map((x) => x.og)])].slice(0, 8);
    let pic = null;
    for (let i = 0; i < cands.length && !pic; i += 3) pic = (await Promise.all(cands.slice(i, i + 3).map((u) => photo(u).catch(() => null)))).find(Boolean) || null;
    if (!pic) return null; // no real product photo: left out rather than shown with a placeholder
    const link = (shop && shop.url) || (hits[0] && hits[0].url) || null;
    const id = h.store ? await h.store(pic.buf, pic.type).catch(() => null) : null;
    return { brand: p.brand, model: p.model, tier: p.tier, why: p.why, title: clip((shop && shop.title) || q, 120), url: link, store: link ? host(link) : "", image: pic.url, i: id, w: pic.w, h: pic.h, price: shop && shop.price ? shop.price : null, currency: (shop && shop.currency) || "", approx: p.price };
  }));
  const found = products.filter(Boolean).slice(0, 6);
  return found.length ? { products: found, searched: ideas.length } : { error: "no products with a clear photo turned up; try describing what you're after", searched: ideas.length };
}
