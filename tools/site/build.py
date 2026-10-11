"""Builds Mentifaber 2: every app page from tools/site/content/<id>.json and the registry, its web-app manifest,
its icon, and the home page. Run from anywhere:  python3 tools/site/build.py [ids…]   (no ids: everything with content)
Then rasterise the icons:  node tools/site/raster.js"""
import html, json, os, re, sys, hashlib
from registry import ROOT, apps, CATS

A = {a["id"]: a for a in apps()}
CONTENT = os.path.join(ROOT, "tools/site/content")
esc = lambda t: html.escape(str(t or ""), quote=True)
MARK = open(os.path.join(ROOT, "assets/brand/mark.svg"), encoding="utf-8").read().replace('role="img" aria-label="Mentifaber"', 'aria-hidden="true"')

THEME = '<script>try{var t=localStorage.getItem("mf:theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>'
SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>'
THEME_BTN = f'<button class="iconbtn" data-theme-toggle aria-label="Light or dark">{SUN}</button>'

def ver(path):  # cache-busting stamp from the file's contents
    try: return hashlib.sha1(open(os.path.join(ROOT, path), "rb").read()).hexdigest()[:8]
    except OSError: return "0"

def glyph(a, cls="tile"):
    return f'<span class="{cls}" style="--h:{a["hue"]}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{a["glyph"]}</svg></span>'

STATUS = {"live": ("live", "Live"), "private": ("lock", "Private · login"), "build": ("build", "In the works"), "concept": ("build", "Concept"), "stalled": ("build", "Paused"), "music": ("live", "Music")}
def status_chip(a):
    cls, label = STATUS.get(a["status"], ("live", a["status"].title()))
    return f'<span class="chip {cls}"><span class="dot"></span>{esc(label)}</span>'

def cap(t):
    t = t.strip(); return t[:1].upper() + t[1:] if t else t

def preview(i):
    for ext in ("webp", "png"):
        if os.path.exists(os.path.join(ROOT, f"assets/previews/{i}.{ext}")): return f"assets/previews/{i}.{ext}"
    return None

def head(a, title, desc, extra=""):
    shot = preview(a["id"]); og = "https://mentifaber.org/" + (shot.replace(".webp", ".png") if shot else "assets/previews/home.png")
    man = f'<link rel="manifest" href="assets/manifests/{a["id"]}.webmanifest">' if a.get("app") else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="theme-color" content="#05060a">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:image" content="{og}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="assets/icons/v2/{a["id"]}.svg" type="image/svg+xml"><link rel="icon" href="assets/icons/v2/{a["id"]}-192.png" sizes="192x192"><link rel="apple-touch-icon" href="assets/icons/v2/{a["id"]}-180.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="{esc(a["name"])}"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
{man}
<link rel="preload" href="assets/fonts/MentifaberDisplay-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/ui/ui.css?v={ver("assets/ui/ui.css")}">
<style>:root{{--h:{a["hue"]}}}</style>{THEME}{extra}
</head>"""

def bar(a, launch=True):
    cat = dict((k, n) for k, n, _ in CATS).get(a["cat"], "")
    btns = (f'<button class="btn sm" data-install hidden>Install</button><button class="btn sm pri" data-launch>Launch</button>' if launch else "")
    return f"""<div class="mf-sky"><i></i></div>
<header class="mf-bar"><a class="mf-brand" href="./" aria-label="Mentifaber home">{MARK}<b>MENTIFABER</b></a><span class="mf-crumb"><a href="./#{a["cat"]}">{esc(cat)}</a> / {esc(a["name"])}</span><span class="grow"></span>{THEME_BTN}{btns}</header>"""

def related(a):
    same = [b for b in A.values() if b["cat"] == a["cat"] and b["id"] != a["id"] and b.get("href")][:6]
    return "".join(f'<a class="rel" href="{esc(b["href"])}">{glyph(b, "tile md")}<span><b>{esc(b["name"])}</b><small>{esc(b["desc"][:90].rsplit(" ", 1)[0] + "…" if len(b["desc"]) > 90 else b["desc"])}</small></span></a>' for b in same)

def page(i):
    a, c = A[i], json.load(open(os.path.join(CONTENT, i + ".json"), encoding="utf-8"))
    name, has_app = a["name"], bool(a.get("app"))
    shot = c.get("shot") or preview(i)
    shot_png = shot.replace(".webp", ".png") if shot else None
    title = f'{name} — {c.get("titleTail") or a["desc"].split(" — ")[0].split(". ")[0]} · Mentifaber'
    desc = a["desc"] or re.sub("<[^>]+>", "", c.get("tagline", ""))
    chips = status_chip(a) + "".join(f'<span class="chip">{esc(x)}</span>' for x in c.get("caps", [])[:3])
    cta = (f'<button class="btn pri" data-launch><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>Launch {esc(name)}</button>'
           f'<button class="btn" data-install hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Install app</button>') if has_app else ""
    cta += '<a class="btn ghost" href="#story">How it works</a>'
    fig = f'<figure class="device reveal"><picture>{f"""<source type="image/webp" srcset="{shot}">""" if shot and shot.endswith(".webp") else ""}<img src="{esc(shot_png or shot)}" alt="{esc(name)}, inside" width="1280" height="800" fetchpriority="high"></picture></figure>' if shot else ""
    feats = "".join(f'<article class="card reveal"><span class="n">{k + 1:02d}</span><h3>{esc(f["t"]) if f["t"] else ""}</h3><p>{cap(f["d"])}</p></article>' for k, f in enumerate(c.get("features", [])))
    cards = "".join(f'<article class="card reveal"><span class="n">{esc(x["n"])}</span><div class="prose">{x["html"]}</div>{"<div class=stack>" + "".join(f"<span>{esc(s)}</span>" for s in x.get("stack", [])) + "</div>" if x.get("stack") else ""}</article>' for x in c.get("cards", []))
    scope = f'<article class="card scope reveal"><span class="n">honest scope</span><div class="prose">{c["scope"]}</div></article>' if c.get("scope") else ""
    morph = f"""<section class="morph" id="live" aria-label="{esc(name)}, live"><div class="stage">
  <div class="intro"><span class="kicker">step inside</span><h2>{esc(name)}, live</h2><p>keep scrolling · it opens right here</p></div>
  <div class="glow"></div>
  <div class="frame" role="button" tabindex="0" aria-label="Open {esc(name)}">{f'<div class="poster" style="background-image:url({esc(shot)})"></div>' if shot else ""}<div class="spin"></div></div>
  <button class="btn pri enter" data-launch>Open {esc(name)}</button>
</div></section>""" if has_app else ""
    cfg = json.dumps({"id": i, "name": name, "app": a.get("app"), "h": a["hue"]})
    body = f"""{head(a, title, desc)}
<body>
{bar(a, has_app)}
<main>
<section class="hero"><div class="wrap">
  <div>
    <span class="kicker">{esc(c.get("kicker") or a["cat"])}</span>
    <h1{' class="long"' if len(name) > 9 else ""}>{esc(name)}</h1>
    <div class="who">{glyph(a)}<div class="chips">{chips}</div></div>
    <p class="tag" style="margin-top:22px">{c.get("tagline", "")}</p>
    <div class="cta">{cta}</div>
    {f'<p class="sub">{esc(c["launchSub"])}</p>' if c.get("launchSub") else ""}
  </div>
  {fig}
</div><a class="scrollcue" href="#story" aria-label="Scroll"><i></i>scroll</a></section>

<section class="block" id="story"><div class="wrap reveal">
  <span class="kicker">{esc(c.get("ledeLabel") or c["story"].get("label") or "why this exists")}</span>
  <h2>{c["story"].get("title") or esc(name)}</h2>
  <div class="lede prose">{c.get("lede", "")}</div>
</div></section>

{f'''<section class="block"><div class="wrap">
  <span class="kicker reveal">{esc(c.get("featuresLabel") or "what it does")}</span>
  <h2 class="reveal">Inside {esc(name)}</h2>
  <div class="feat">{feats}</div>
  {f'<p class="lede reveal" style="margin-top:28px">{c["featuresNote"]}</p>' if c.get("featuresNote") else ""}
  <div class="split" style="margin-top:16px">{cards}{scope}</div>
</div></section>''' if feats else f'''<section class="block"><div class="wrap"><div class="split">{cards}{scope}</div></div></section>'''}

<section class="block"><div class="wrap">
  <p class="closing reveal" style="font:400 clamp(22px,3vw,32px)/1.4 var(--display);color:var(--ink-2);max-width:28em">{c.get("closing", "")}</p>
  <span class="kicker reveal" style="margin-top:46px">more in {esc(dict((k, n) for k, n, _ in CATS)[a["cat"]].lower())}</span>
  <div class="related reveal">{related(a)}</div>
  <div class="foot" style="border:0;padding-top:46px"><div class="row"><a href="./">← All of Mentifaber</a><span>{"Scroll on: the app opens right here." if has_app else ""}</span></div></div>
</div></section>
{morph}
</main>
<script type="application/json" id="mf-app">{cfg}</script>
<script src="assets/ui/shell.js?v={ver("assets/ui/shell.js")}" defer></script>
</body>
</html>
"""
    out = a["href"] if a.get("href", "").endswith(".html") else i + ".html"
    open(os.path.join(ROOT, out), "w", encoding="utf-8").write(body)
    if has_app: manifest(a, c)
    return out

def manifest(a, c):
    app = "/" + a["app"]
    common = os.path.commonprefix(["/" + (a["href"] or ""), app]).rstrip("-_.")  # one scope that holds the page and the app
    m = {"id": "/" + a["id"], "name": a["name"] + (" · Mentifaber" if len(a["name"]) < 12 else ""), "short_name": a["name"][:12], "description": a["desc"],
         "start_url": app, "scope": common if len(common) > 1 else "/", "display": "standalone", "background_color": "#05060a", "theme_color": "#05060a",
         "icons": [{"src": f"../icons/v2/{a['id']}-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                   {"src": f"../icons/v2/{a['id']}-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                   {"src": f"../icons/v2/{a['id']}-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
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

def icons(ids):
    d = os.path.join(ROOT, "assets/icons/v2"); os.makedirs(d, exist_ok=True)
    for i in ids:
        a = A[i]
        open(os.path.join(d, i + ".svg"), "w").write(icon_svg(a))
        open(os.path.join(d, i + "-mask.svg"), "w").write(icon_svg(a, True))


# ── the home page ─────────────────────────────────────────────────────────────────────────────────────────────────────
ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>'
NOW = [("weather", "Weather"), ("moon", "Moon"), ("quakes", "Quakes"), ("iss", "ISS"), ("kp", "Space weather"), ("btc", "Bitcoin"), ("hive", "Hive"), ("agent", "Mentifaber Agent")]
FEATURED = [  # the messengers up top, then Hive across the full width
  ("barycenter", "A private universe for two", "Messages, voice notes, touch and presence, sealed end to end and kept on your own two devices. No one else gets in, including the server.", "Enter with your invite"),
  ("nullspace", "Comms with no account", "Pick a handle, tune a frequency, transmit. Talks over the internet and over LoRa mesh radio when the internet is gone.", "Open the deck"),
  ("pilotfish", "A quiet line for two", "A shared list and a signal line: what to grab, how you feel, what you need. Push alerts, photos, works offline.", "Open Pilotfish"),
]

def has_page(i): return os.path.exists(os.path.join(CONTENT, i + ".json"))

def links(a):  # (open, about): what the card's buttons point at
    if not a.get("href"): return None, None
    if a.get("app") and has_page(a["id"]): return a["href"] + "#app", a["href"]
    if a.get("app"): return a["app"], a["href"]
    return a["href"], None

def card(a):
    op, ab = links(a)
    verb = {"music": "Listen", "concept": "Read", "build": "Follow"}.get(a["status"], "Open")
    q = " ".join([a["name"], a["desc"], dict((k, n) for k, n, _ in CATS)[a["cat"]], a["status"], a["id"]]).lower()
    btns = (f'<a class="btn sm pri" href="{esc(op)}">{verb}</a>' if op else '<span class="chip build"><span class="dot"></span>Coming</span>') + (f'<a class="btn sm ghost" href="{esc(ab)}">About</a>' if ab else "")
    return (f'<article class="app" data-cat="{a["cat"]}" data-status="{a["status"]}" data-q="{esc(q)}" style="--h:{a["hue"]}">'
            + (f'<a class="cover" href="{esc(ab or op)}" aria-label="{esc(a["name"])}"></a>' if (ab or op) else "")
            + f'<div class="top">{glyph(a, "tile")}{status_chip(a)}</div><h4>{esc(a["name"])}</h4><p>{esc(a["desc"])}</p><div class="go">{btns}</div></article>')

def hero_mark():  # the brand mark, drawn in, with two slow orbits around it
    core = MARK.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">', '<svg class="core" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">')
    core = core.replace('"mfg"', '"mfg2"').replace("#mfg)", "#mfg2)").replace('"mfc"', '"mfc2"').replace("#mfc)", "#mfc2)")
    core = re.sub(r'(<path d="M32 3\.5[^"]*")', r'\1 class="hex" pathLength="160"', core)
    core = re.sub(r'(<path d="M19\.5 43[^"]*")', r'\1 class="em" pathLength="70"', core)
    k = [0]
    def nd(m):
        k[0] += 1; return m.group(0).replace("<circle", f'<circle class="nd" style="animation-delay:{.7 + k[0] * .16:.2f}s"')
    core = re.sub(r'<circle cx="\d+(\.\d+)?" cy="\d+(\.\d+)?" r="2\.7"/>', nd, core)
    core = core.replace('<circle cx="32" cy="34.5" r="3.6"', '<circle class="hub" cx="32" cy="34.5" r="3.6"')
    orb = lambda cls, rx, ry, rot, dots: (f'<svg class="orb {cls}" viewBox="0 0 200 200" aria-hidden="true"><g transform="rotate({rot} 100 100)"><ellipse cx="100" cy="100" rx="{rx}" ry="{ry}" fill="none" stroke="url(#hmg)" stroke-width=".8" opacity=".55"/>'
        + "".join(f'<circle cx="{100 + rx * c:.1f}" cy="{100 + ry * s_:.1f}" r="{r}" fill="#ffd27a"/>' for c, s_, r in dots) + '</g></svg>')
    defs = '<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="hmg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE29A"/><stop offset="1" stop-color="#FF5A36"/></linearGradient></defs></svg>'
    return f'<div class="h-mark">{defs}{orb("a", 96, 34, -24, [(1, 0, 2.6), (-.6, .8, 1.6)])}{orb("b", 92, 50, 38, [(-1, 0, 2), (.3, -.95, 1.4)])}{core}</div>'

def home():
    me = {"id": "mentifaber", "name": "Mentifaber", "hue": 34}
    L = list(A.values())
    n = lambda *st: sum(1 for a in L if a["status"] in st)
    title = "Mentifaber · builder of minds and the systems that hold them"
    desc = f"{len(L)} projects by Anders: AI swarms and agents, private messengers, live atlases of the sky and the world, local-first tools and games. Every page explains its app, then opens it as you scroll."
    stats = "".join(f'<span class="chip {c}"><span class="dot"></span><b>{v}</b>&nbsp;{t}</span>' for c, v, t in [("live", n("live", "music"), "live"), ("lock", n("private"), "private"), ("build", n("build", "concept", "stalled"), "in the works")]) + f'<span class="chip"><b>{len(L)}</b>&nbsp;projects</span>'
    widgets = "".join(f'<a class="w" data-w="{k}" data-label="{esc(t)}"><span class="wl"><span>{esc(t)}</span></span><div class="wv">&nbsp;</div><div class="ws">&nbsp;</div></a>' for k, t in NOW)
    feat = "".join(f"""<a class="fcard reveal" href="{esc(A[i]["href"])}" style="--h:{A[i]["hue"]}"><svg class="art" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round">{A[i]["glyph"]}</svg>
  <div class="top" style="display:flex;justify-content:space-between;align-items:center">{glyph(A[i])}{status_chip(A[i])}</div>
  <span class="kicker">{esc(k)}</span><h3>{esc(A[i]["name"])}</h3><p>{esc(d)}</p><span class="go">{esc(g)}{ARROW}</span></a>""" for i, k, d, g in FEATURED)
    hv = A["hive"]
    feat += f"""<a class="fcard wide reveal" href="hive" style="--h:{hv["hue"]}"><svg class="art" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=".7">{hv["glyph"]}</svg>{glyph(hv)}
  <div><span class="kicker">the swarm</span><h3>Hive</h3><p>Describe a project and release a swarm of AI models on it: a coordinator splits the work, each model takes the role it fits, critics send weak work back, and you watch it build live. Or just talk to it.</p></div><span class="go">Open Hive{ARROW}</span></a>"""
    seg = '<button data-cat="all" aria-pressed="true">All</button>' + "".join(f'<button data-cat="{k}" aria-pressed="false">{esc(nm.split(" & ")[0] if k != "world" else "Sky & World")}</button>' for k, nm, _ in CATS)
    cats = ""
    for k, nm, blurb in CATS:
        xs = [a for a in L if a["cat"] == k]
        cats += f'<section class="cat" id="{k}"><header><h3>{esc(nm)}</h3><span class="n">{len(xs):02d}</span><p>{esc(blurb)}</p></header><div class="grid">{"".join(card(a) for a in xs)}</div></section>'
    index = "[\n" + ",\n".join(json.dumps({k: j.get(k) for k in ("href", "name", "desc", "status", "cat", "added")}, ensure_ascii=False) for j in json.load(open(os.path.join(ROOT, "tools/site/site.json"), encoding="utf-8"))) + "\n]"
    page_ = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="theme-color" content="#05060a">
<meta property="og:title" content="Mentifaber"><meta property="og:description" content="{esc(desc)}"><meta property="og:image" content="https://mentifaber.org/assets/brand/og.png"><meta property="og:url" content="https://mentifaber.org/"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="assets/brand/mark.svg" type="image/svg+xml"><link rel="icon" href="assets/icons/v2/mentifaber-48.png" sizes="48x48"><link rel="apple-touch-icon" href="assets/icons/v2/mentifaber-180.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Mentifaber"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="assets/manifests/mentifaber.webmanifest">
<link rel="preload" href="assets/fonts/MentifaberDisplay-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/ui/ui.css?v={ver("assets/ui/ui.css")}">
<style>:root{{--h:34}}</style>{THEME}
</head>
<body class="home">
<div class="mf-sky"><i></i></div>
<header class="mf-bar"><a class="mf-brand" href="./" aria-label="Mentifaber home">{MARK}<b>MENTIFABER</b></a>
<nav class="mf-nav" aria-label="Sections"><a href="#now">Right now</a><a href="#new">New</a><a href="#apps">Everything</a><a href="atlas.html">Atlas</a></nav>
<span class="grow"></span><button class="iconbtn" data-find aria-label="Find a project">{SEARCH}</button>{THEME_BTN}<button class="btn sm" data-install hidden>Install</button></header>
<main>
<section class="h-hero"><div class="wrap">
  {hero_mark()}
  <span class="kicker">mens · faber · maker of minds</span>
  <h1>MENTIFABER</h1>
  <p class="tag">Builder of minds and the systems that hold them. AI swarms and agents, private messengers, live atlases of the sky, tools that keep your data on your own device, and games. Every page explains its app, then <em style="color:var(--ink);font-style:normal">opens it right there</em> as you scroll.</p>
  <div class="cta"><a class="btn pri" href="#apps">Explore everything{ARROW}</a><a class="btn" href="hive">Open Hive</a><button class="btn ghost" data-install hidden>Install Mentifaber</button></div>
  <div class="h-stats">{stats}</div>
</div><a class="scrollcue" href="#now" aria-label="Scroll"><i></i>scroll</a></section>

<section class="block" id="now"><div class="wrap">
  <div class="h-head reveal"><div><span class="kicker">right now</span><h2>The world, live</h2></div><p>Live feeds from the same sources the apps use: your weather, the sky, the ground, the markets and the swarm. Tap one to go deeper.</p></div>
  <div class="widgets reveal">{widgets}</div>
</div></section>

<section class="block" id="new"><div class="wrap">
  <div class="h-head reveal"><div><span class="kicker">new · signals</span><h2>Talk without the usual pipes</h2></div><p>Three messengers, each built for a different kind of quiet: one for two people, one for anyone with no account at all, one for the small daily signals.</p></div>
  <div class="feature">{feat}</div>
</div></section>

<section class="block" id="apps"><div class="wrap">
  <div class="h-head reveal"><div><span class="kicker">everything</span><h2>The whole workshop</h2></div><p>{len(L)} projects in six rooms. Open runs the app; About explains it first.</p></div>
  <div class="finder"><label class="q">{SEARCH}<input id="q" type="search" placeholder="Find a project" autocomplete="off" aria-label="Find a project"><kbd>/</kbd></label>
    <div class="seg" id="seg" role="group" aria-label="Category">{seg}</div>
    <button class="live-only" id="live-only" aria-pressed="false"><i></i>Live only</button></div>
  {cats}
  <p class="none" id="none">Nothing matches that. Try fewer words.</p>
</div></section>

<section class="block" id="atlas"><div class="wrap">
  <a class="atlas-cta reveal" href="atlas.html"><div><span class="kicker">the atlas</span><h2 style="margin:14px 0 12px">Fly through it instead</h2><p class="lede" style="font-size:18px">The original front page: every project as a point on a slow 3D flight, and the full timeline of when each one arrived.</p><span class="btn" style="margin-top:20px">Open the atlas{ARROW}</span></div>
  <picture><source type="image/webp" srcset="assets/previews/home.webp"><img src="assets/previews/home.png" alt="The atlas" width="1280" height="800" loading="lazy"></picture></a>
</div></section>

<section class="block"><div class="wrap">
  <div class="foot" style="border:0;padding-top:20px">
    <p class="lede" style="margin:0 0 34px">Questions about a project, a lathe, a radio or a mind? The line is open: <a href="mailto:anders@mentifaber.org" style="color:var(--gold)">anders@mentifaber.org</a></p>
    <div class="row"><div class="links"><a href="contact.html">Contact</a><a href="https://x.com/mentifaber">X</a><a href="https://instagram.com/mentifaber">Instagram</a><a href="https://soundcloud.com/sonicveil">SoundCloud</a><a href="widgets/">Home-screen widgets</a><a href="wx/">Quick weather</a><a href="atlas.html">Atlas</a><a href="atlas-classic.html">Classic atlas</a></div><span style="color:var(--mute)">© Mentifaber</span></div>
  </div>
</div></section>
</main>
<script type="application/json" id="mf-app">{json.dumps({"name": "Mentifaber"})}</script>
<script type="application/json" id="mf-index">
{index}
</script>
<script src="assets/ui/shell.js?v={ver("assets/ui/shell.js")}" defer></script>
<script src="assets/ui/home.js?v={ver("assets/ui/home.js")}" defer></script>
<script src="assets/ui/widgets.js?v={ver("assets/ui/widgets.js")}" defer></script>
</body>
</html>
"""
    open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(page_)
    return "index.html"

def brand_icons():  # the Mentifaber app icon: the mark on a dark tile (and full-bleed for maskable)
    d = os.path.join(ROOT, "assets/icons/v2")
    inner = re.sub(r"^<svg[^>]*>|</svg>\s*$", "", MARK.strip()).replace('id="mfg"', 'id="g1"').replace("url(#mfg)", "url(#g1)").replace('id="mfc"', 'id="g2"').replace("url(#mfc)", "url(#g2)")
    for mask in (False, True):
        sc = 5.0 if mask else 6.4
        shape = '<rect width="512" height="512"/>' if mask else '<rect width="512" height="512" rx="116"/>'
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#2a1a0c"/><stop offset=".6" stop-color="#0d0a12"/><stop offset="1" stop-color="#05060a"/></radialGradient><clipPath id="c">{shape}</clipPath></defs>
<g clip-path="url(#c)"><rect width="512" height="512" fill="url(#bg)"/><circle cx="256" cy="262" r="{170 if mask else 200}" fill="#ff8a3a" opacity=".12"/></g>
<g transform="translate(256 258) scale({sc}) translate(-32 -32)">{inner}</g>
{"" if mask else '<rect x="2" y="2" width="508" height="508" rx="114" fill="none" stroke="#f0a63a" stroke-opacity=".3" stroke-width="3"/>'}</svg>"""
        open(os.path.join(d, "mentifaber" + ("-mask" if mask else "") + ".svg"), "w").write(svg)
    m = {"id": "/", "name": "Mentifaber", "short_name": "Mentifaber", "description": "Builder of minds and the systems that hold them: every Mentifaber app in one place.",
         "start_url": "/", "scope": "/", "display": "standalone", "background_color": "#05060a", "theme_color": "#05060a",
         "icons": [{"src": "../icons/v2/mentifaber-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                   {"src": "../icons/v2/mentifaber-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                   {"src": "../icons/v2/mentifaber-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
         "shortcuts": [{"name": "Hive", "url": "/hive", "icons": [{"src": "../icons/v2/hive-192.png", "sizes": "192x192"}]},
                       {"name": "NULLSPACE", "url": "/nullspace.html", "icons": [{"src": "../icons/v2/nullspace-192.png", "sizes": "192x192"}]},
                       {"name": "Ballast", "url": "/ballast.html#app", "icons": [{"src": "../icons/v2/ballast-192.png", "sizes": "192x192"}]},
                       {"name": "Vigil", "url": "/vigil.html#app", "icons": [{"src": "../icons/v2/vigil-192.png", "sizes": "192x192"}]}]}
    json.dump(m, open(os.path.join(ROOT, "assets/manifests/mentifaber.webmanifest"), "w"), indent=2, ensure_ascii=False)

if __name__ == "__main__":
    ids = sys.argv[1:] or [f[:-5] for f in sorted(os.listdir(CONTENT)) if f.endswith(".json")]
    icons(list(A)); brand_icons()
    for i in ids: print("built", page(i))
    if not sys.argv[1:]: print("built", home())
