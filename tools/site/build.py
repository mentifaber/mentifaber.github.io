"""Builds Mentifaber: every app's datasheet from tools/site/content/<id>.json and the registry, its web-app manifest,
its icon, and the home page (the workshop's floor plan; the pages themselves are drawn by plan.py). Run from anywhere:  python3 tools/site/build.py [ids…]   (no ids: everything with content)
Then rasterise the icons:  node tools/site/raster.js"""
import html, json, os, re, sys, hashlib
from registry import ROOT, apps, CATS

A = {a["id"]: a for a in apps()}
CONTENT = os.path.join(ROOT, "tools/site/content")
esc = lambda t: html.escape(str(t or ""), quote=True)
def ver(path):  # cache-busting stamp from the file's contents
    try: return hashlib.sha1(open(os.path.join(ROOT, path), "rb").read()).hexdigest()[:8]
    except OSError: return "0"

# apps whose icon was chosen by hand (not generated): their own images everywhere
OWN_ICON = {"hive": {"tile": "assets/icons/hive-genesis-192.png", "fav": "assets/icons/hive-genesis-48.png", "apple": "assets/icons/hive-genesis-apple.png",
                     "manifest": [{"src": "../icons/hive-genesis-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"}, {"src": "../icons/hive-genesis-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                                  {"src": "../icons/hive-genesis-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"}, {"src": "../icons/hive-genesis-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}}

def cap(t):
    t = t.strip(); return t[:1].upper() + t[1:] if t else t

def preview(i):
    for ext in ("webp", "png"):
        if os.path.exists(os.path.join(ROOT, f"assets/previews/{i}.{ext}")): return f"assets/previews/{i}.{ext}"
    return None

def manifest(a, c):
    app = "/" + a["app"]
    common = os.path.commonprefix(["/" + (a["href"] or ""), app]).rstrip("-_.")  # one scope that holds the page and the app
    m = {"id": "/" + a["id"], "name": a["name"] + (" · Mentifaber" if len(a["name"]) < 12 else ""), "short_name": a["name"][:12], "description": a["desc"],
         "start_url": app, "scope": common if len(common) > 1 else "/", "display": "standalone", "background_color": "#080705", "theme_color": "#080705",
         "icons": [{"src": f"../icons/v2/{a['id']}-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                   {"src": f"../icons/v2/{a['id']}-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                   {"src": f"../icons/v2/{a['id']}-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    if a["id"] in OWN_ICON: m["icons"] = OWN_ICON[a["id"]]["manifest"]
    m.update(c.get("manifest") or {})  # per-app extras: orientation, categories, colours
    json.dump(m, open(os.path.join(ROOT, f"assets/manifests/{a['id']}.webmanifest"), "w"), indent=2, ensure_ascii=False)

def icon_svg(a, mask=False):  # 512 × 512 tile: the app's glyph lit in its own hue
    h = a["hue"]
    shape = '<rect width="512" height="512"/>' if mask else '<rect width="512" height="512" rx="116"/>'
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><radialGradient id="b" cx="28%" cy="18%" r="105%"><stop offset="0" stop-color="hsl({h} 72% 34%)"/><stop offset=".55" stop-color="hsl({h + 18} 78% 14%)"/><stop offset="1" stop-color="hsl({h + 32} 80% 6%)"/></radialGradient>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="c">{shape}</clipPath></defs>
<g clip-path="url(#c)"><rect width="512" height="512" fill="url(#b)"/><rect width="512" height="512" fill="url(#s)"/>
<circle cx="256" cy="256" r="{150 if mask else 190}" fill="hsl({h} 95% 60%)" opacity=".10"/></g>
<g transform="translate(256 256) scale({9.2 if mask else 11.6}) translate(-12 -12)" fill="none" stroke-linecap="round" stroke-linejoin="round" color="hsl({h} 96% 76%)">
<g stroke="hsl({h} 100% 62%)" stroke-width="5.2" opacity=".10">{a["glyph"]}</g><g stroke="hsl({h} 100% 66%)" stroke-width="3" opacity=".22">{a["glyph"]}</g><g stroke="hsl({h} 96% 78%)" stroke-width="1.55">{a["glyph"]}</g></g>
{"" if mask else '<rect x="2" y="2" width="508" height="508" rx="114" fill="none" stroke="hsl(' + str(h) + ' 85% 70%)" stroke-opacity=".28" stroke-width="3"/>'}
</svg>"""

def art_icon(i, mask=False):  # hand-drawn art (tools/site/icons/<id>.svg, a full-bleed 512 square) instead of the glyph tile
    src = os.path.join(ROOT, "tools/site/icons", i + ".svg")
    if not os.path.exists(src): return None
    art = open(src, encoding="utf-8").read()
    inner = re.sub(r"^\s*<svg[^>]*>|</svg>\s*$", "", art.strip())
    if mask: return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{inner}</svg>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><clipPath id="r"><rect width="512" height="512" rx="116"/></clipPath><g clip-path="url(#r)">{inner}</g>'
            '<rect x="2" y="2" width="508" height="508" rx="114" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="3"/></svg>')

def icons(ids):
    d = os.path.join(ROOT, "assets/icons/v2"); os.makedirs(d, exist_ok=True)
    for i in ids:
        a = A[i]
        open(os.path.join(d, i + ".svg"), "w").write(art_icon(i) or icon_svg(a))
        open(os.path.join(d, i + "-mask.svg"), "w").write(art_icon(i, True) or icon_svg(a, True))


# ── the home page ─────────────────────────────────────────────────────────────────────────────────────────────────────
NOW = [("weather", "Weather"), ("moon", "Moon"), ("pass", "Next ISS pass"), ("iss", "ISS"), ("quakes", "Quakes"), ("kp", "Space weather"), ("btc", "Bitcoin"), ("hive", "Genesis"), ("agent", "Mentifaber Agent"), ("suite", "Your suite")]
WIDGET_EXTRA = [("hf", "HF conditions")]  # kinds used on app pages only
def has_page(i): return os.path.exists(os.path.join(CONTENT, i + ".json"))

def links(a):  # (open, about): what the card's buttons point at
    if not a.get("href"): return None, None
    if a.get("app") and has_page(a["id"]): return a["href"] + "#app", a["href"]
    if a.get("app"): return a["app"], a["href"]
    return a["href"], None

def brand_icons():  # the Mentifaber app's manifest; its icons are the logo, made by tools/site/logo.py
    m = {"id": "/", "name": "Mentifaber", "short_name": "Mentifaber", "description": "Builder of minds and the systems that hold them: every Mentifaber app in one place.",
         "start_url": "/", "scope": "/", "display": "standalone", "background_color": "#080705", "theme_color": "#080705",
         "icons": [{"src": "../icons/v2/mentifaber-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                   {"src": "../icons/v2/mentifaber-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                   {"src": "../icons/v2/mentifaber-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
         "shortcuts": [{"name": A[i]["name"], "url": "/" + i + ".html#app", "icons": [{"src": ("../" + OWN_ICON[i]["tile"].replace("assets/", "")) if i in OWN_ICON else f"../icons/v2/{i}-192.png", "sizes": "192x192"}]}
                       for i in ("hive", "barycenter", "nullspace", "pi", "orbit", "ballast", "vigil", "cartograph") if i in A]}
    json.dump(m, open(os.path.join(ROOT, "assets/manifests/mentifaber.webmanifest"), "w"), indent=2, ensure_ascii=False)

def suite():  # assets/suite.json: what "Install the suite" walks through, one app at a time
    order = [c[0] for c in CATS]; out = []
    for a in sorted(A.values(), key=lambda a: order.index(a["cat"]) if a["cat"] in order else 99):
        i = a["id"]
        page = os.path.join(ROOT, f"{i}.html")
        if not (os.path.exists(os.path.join(ROOT, f"assets/manifests/{i}.webmanifest")) and os.path.exists(page) and 'id="mf-app"' in open(page, encoding="utf-8").read()): continue  # the page must carry the shell, which runs the step
        out.append({"id": i, "n": a["name"], "p": f"{i}.html", "ic": OWN_ICON[i]["tile"] if i in OWN_ICON else f"assets/icons/v2/{i}-192.png", "c": dict((c[0], c[1]) for c in CATS).get(a["cat"], ""), "lock": a["status"] == "private"})
    json.dump(out, open(os.path.join(ROOT, "assets/suite.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    return f"assets/suite.json ({len(out)} apps)"

def sitemap():  # sitemap.xml: every public page, skipping noindex pages and whatever robots.txt keeps out
    import subprocess, datetime
    blocked = [l.split(":", 1)[1].strip() for l in open(os.path.join(ROOT, "robots.txt")) if l.lower().startswith("disallow:")]
    pages = sorted(f for f in os.listdir(ROOT) if f.endswith(".html") and f != "404.html") + ["wx/index.html", "widgets/index.html"]
    rows = []
    for f in pages:
        url = "/" + f.replace("index.html", "")
        if any(b and url.startswith(b) for b in blocked) or "noindex" in open(os.path.join(ROOT, f), encoding="utf-8").read(): continue
        day = subprocess.run(["git", "-C", ROOT, "log", "-1", "--format=%cs", "--", f], capture_output=True, text=True).stdout.strip() or datetime.date.today().isoformat()
        pri = "1.0" if url == "/" else "0.8" if has_page(f[:-5]) else "0.6" if f.endswith("-app.html") else "0.5"
        rows.append(f"  <url><loc>https://mentifaber.org{url}</loc><lastmod>{day}</lastmod><priority>{pri}</priority></url>")
    open(os.path.join(ROOT, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n")
    return f"sitemap.xml ({len(rows)} pages)"

if __name__ == "__main__":
    ids = sys.argv[1:] or [f[:-5] for f in sorted(os.listdir(CONTENT)) if f.endswith(".json")]
    icons(list(A)); brand_icons()
    import plan
    for i in ids: print("built", plan.page(i))
    if not sys.argv[1:]: print("built", plan.home()); print("built", plan.contact()); print("built", plan.notfound()); print("built", suite()); print("built", sitemap())
