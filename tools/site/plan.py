"""Mentifaber · THE WORKSHOP AT NIGHT. The home page is the workshop's floor plan in gold on black (six rooms off a corridor,
every project a bench, live instruments on the corridor wall); a project's page is that bench's datasheet, with the thing
itself running on it. Same registry and content as before; build.py calls home() and page().
Styles: assets/ui/plan.css · behaviour: assets/ui/plan.js (walls, lantern, walker, compass, find) + shell.js (install, suite)."""
import html, json, os, re, datetime
from registry import ROOT, CATS
import build as B

esc = lambda t: html.escape(str(t or ""), quote=True)
A, CONTENT, links, preview, ver, NOW, OWN_ICON = B.A, B.CONTENT, B.links, B.preview, B.ver, B.NOW, B.OWN_ICON
WL = dict(B.NOW + B.WIDGET_EXTRA)
LAYOUT = [["signals", "ai", "world"], ["tools", "play", "craft"]]  # three rooms above the corridor, three below
ROOMNO = {k: i + 1 for i, k in enumerate(LAYOUT[0] + LAYOUT[1])}  # numbered as you'd walk the plan: the top row, then the bottom
NAMES = {k: (n, b) for k, n, b in CATS}
ORDER = [a for k in LAYOUT[0] + LAYOUT[1] for a in A.values() if a["cat"] == k]  # the walk: room by room, bench by bench
FEAT = {"hive", "barycenter", "nullspace", "pilotfish"}
LAMP = {"live": "live", "android": "live", "music": "music", "private": "lock", "build": "build", "soon": "build", "concept": "build", "stalled": ""}
STATUS = {"live": "live", "android": "live · Android app", "music": "music · live", "private": "private", "build": "being built", "soon": "coming soon", "concept": "a concept", "stalled": "paused"}
NOT_READY = {"soon", "build", "concept", "stalled"}   # demos, simulators, samples and site pages: shown, but never offered as an app to install
NATIVE = {"android"}   # the real thing is an Android app on Foundry (the web version is its demo): no web install, a link to Foundry
LOGO = '<img src="assets/brand/mentifaber-mark-96.png" alt="" width="52" height="52">'
FIND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>'
SUITE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6"/></svg>'
DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>'
# the first-time path: five public things that run the moment you open them, said plainly (home(): "Start here")
START = [("hive", "Talk to an AI that remembers you, out loud or in text, or set a whole swarm of them on a project."),
         ("mentiplayer", "Free films, TV, radio, music and podcasts from open archives, in one player."),
         ("orbit", "See which satellites cross your sky tonight, and which ones you can spot by eye."),
         ("cartograph", "Fly from the planets out to the first galaxies, each object where it really is."),
         ("tether", "A one-finger rope-swinging game over lava, with live races against whoever else is playing.")]
SHOW = [("all", "", "Everything"), ("live", "live", "Running"), ("install", "", "Installs as an app"), ("private", "lock", "Private"), ("build", "build", "Being built")]
SHEET_OF = {a["id"]: n + 2 for n, a in enumerate(x for x in ORDER if B.has_page(x["id"]))}  # sheet 01 is the plan; each datasheet after it
SHEETS = len(SHEET_OF) + 1


def pno(a):  # part number: room · bench
    xs = [x for x in ORDER if x["cat"] == a["cat"]]
    return f"MF-{ROOMNO[a['cat']]:02d}·{xs.index(a) + 1:02d}"
def href(a): op, ab = links(a); return ab or op or "./"
def glyph(a): return f'<svg class="g" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="bevel" aria-hidden="true">{a["glyph"]}</svg>'
def short(a): return a["desc"].split(" — ")[0].split(". ")[0]
def index_json():
    return json.dumps([{"n": a["name"], "d": a["desc"], "h": href(a), "p": pno(a), "s": STATUS.get(a["status"], a["status"]), "r": NAMES[a["cat"]][0]} for a in ORDER], ensure_ascii=False)


def head(title, desc, a=None, og=None):
    own = OWN_ICON.get(a["id"]) if a else None
    if own: icons = f'<link rel="icon" href="{own["fav"]}" sizes="48x48"><link rel="icon" href="{own["tile"]}" sizes="192x192"><link rel="apple-touch-icon" href="{own["apple"]}">'
    elif a: icons = f'<link rel="icon" href="assets/icons/v2/{a["id"]}.svg" type="image/svg+xml"><link rel="icon" href="assets/icons/v2/{a["id"]}-192.png" sizes="192x192"><link rel="apple-touch-icon" href="assets/icons/v2/{a["id"]}-180.png">'
    else: icons = '<link rel="icon" href="assets/brand/mark.svg" type="image/svg+xml"><link rel="icon" href="assets/icons/v2/mentifaber-48.png" sizes="48x48"><link rel="apple-touch-icon" href="assets/icons/v2/mentifaber-180.png">'
    man = f'assets/manifests/{a["id"]}.webmanifest' if a and a.get("app") and a["status"] not in NOT_READY | NATIVE else ("assets/manifests/mentifaber.webmanifest" if not a else "")
    name = a["name"] if a else "Mentifaber"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="theme-color" content="#080705">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:image" content="{og}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
{icons}
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="{esc(name)}"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
{f'<link rel="manifest" href="{man}">' if man else ""}
<link rel="preload" href="assets/fonts/MentifaberDisplay-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/SchibstedGrotesk-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/ui/plan.css?v={ver("assets/ui/plan.css")}">
</head>"""


def titleblock(middle, sheet, at, acts):
    today = datetime.date.today().strftime("%d.%m.%Y")
    return f"""<header class="tb">
  <a class="tb-mark" href="./" aria-label="Mentifaber, the workshop">{LOGO}</a>
  <a class="tb-name" href="./"><b class="gold-text">MENTIFABER</b><span>The workshop · drawn at night</span></a>
  {middle}
  <dl class="tb-meta"><div title="Sheet 01 is this plan; each project with a datasheet has a sheet after it"><dt>Sheet</dt><dd>{f"{sheet:02d} / {SHEETS:02d}" if sheet else "—"}</dd></div><div><dt>Grid</dt><dd class="at">{at}</dd></div><div><dt>Drawn</dt><dd>Anders</dd></div><div><dt>Date</dt><dd>{today}</dd></div></dl>
  <div class="tb-act"><button class="key" data-find aria-label="Find a project">{FIND}<span>Find</span></button>{acts}</div>
</header>"""


def kind(a):  # what the "Show" chips sort on
    s = a["status"]; return "live" if s in ("live", "music", "android") else s if s == "private" else "paused" if s == "stalled" else "build"
def installable(a):  # public and installs as its own app (what "Install the suite" offers, less the private ones)
    return bool(a.get("app")) and a["status"] not in NOT_READY | NATIVE | {"private"} and os.path.exists(os.path.join(ROOT, f"assets/manifests/{a['id']}.webmanifest"))
def since(a):
    d = a.get("added"); return datetime.date.fromisoformat(d).strftime("%b %Y") if d else ""


def bench(a, here=False):
    st = STATUS.get(a["status"], a["status"]); inst = installable(a)
    return (f'<li><a class="bench{" feat" if a["id"] in FEAT else ""}{" here" if here else ""}" href="{esc(href(a))}" style="--h:{a["hue"]}" data-pn="{pno(a)}" data-st="{esc(st)}" data-desc="{esc(a["desc"])}" data-room="{esc(NAMES[a["cat"]][0])}"'
            f' data-k="{kind(a)}"{" data-inst" if inst else ""} data-since="{since(a)}">'
            f'{glyph(a)}<b>{esc(a["name"])}</b><i class="lamp {LAMP.get(a["status"], "")}" title="{esc(st)}"></i><small>{esc(short(a))}</small><span class="sr">, {esc(st)}{", installs as an app" if inst else ""}</span></a></li>')


def pick(i, why):  # a "Start here" card: what it is in a sentence, its status, and a key that opens the running thing
    a = A[i]; op, ab = links(a); st = STATUS.get(a["status"], a["status"])
    sheet = f'<a class="key" href="{esc(ab)}" aria-label="{esc(a["name"])}: the datasheet">Datasheet</a>' if ab and op else ""
    return (f'<li class="pick" style="--h:{a["hue"]}"><div class="pick-h">{glyph(a)}<h3>{esc(a["name"])}</h3><span class="tag {LAMP.get(a["status"], "")}">{esc(st)}</span></div>'
            f'<p>{esc(why)}</p><div class="pick-go"><a class="key pri" href="{esc(op or ab)}" aria-label="Open {esc(a["name"])}">Open it</a>{sheet}</div></li>')


def start():
    return (f'<section class="start" aria-labelledby="start-h"><header><span class="lbl">Detail A · first time in</span><h2 id="start-h">Start with one of these</h2>'
            f'<p>Five that run the moment you open them, no account needed. Every other bench is on the plan below.</p>'
            f'<nav class="paths" aria-label="Four ways in"><a class="key" href="#signals">Explore the workshop</a><a class="key" href="hive#try-it">Try AutoFaber</a><a class="key" href="store">Install the apps · Foundry</a><a class="key" href="services">Hire the workshop</a></nav></header>'
            f'<ol class="picks">{"".join(pick(i, w) for i, w in START if i in A)}</ol></section>')


def sift(L):
    n = {"all": len(L), "install": sum(1 for a in L if installable(a))}
    for a in L: n[kind(a)] = n.get(kind(a), 0) + 1
    lamp = lambda l: f'<i class="lamp {l}"></i>' if l else ""
    chips = "".join(f'<button class="chip" type="button" data-show="{k}" aria-pressed="{"true" if k == "all" else "false"}">{lamp(l)}{esc(t)} <b>{n.get(k, 0)}</b></button>' for k, l, t in SHOW if n.get(k))
    return (f'<nav class="sift" aria-label="Show benches"><span class="lbl">Show</span><div class="chips" role="group" aria-label="Show only">{chips}</div><output class="lbl" aria-live="polite"></output>'
            f'<span class="sp"></span><button class="key" type="button" data-find>{FIND}<span>Find a bench</span><kbd>/</kbd></button>'
            f'<span class="hint"><kbd>← ↑ → ↓</kbd> walk the benches <kbd>↵</kbd> open</span></nav>')


def room(k):
    xs = [a for a in ORDER if a["cat"] == k]; n, b = NAMES[k]
    return (f'<section class="room" id="{k}" style="--n:{len(xs)}" aria-labelledby="r-{k}"><span class="dimx" aria-hidden="true"><span>{len(xs)} benches</span></span>'
            f'<header><span class="rn">{ROOMNO[k]:02d}</span><h2 id="r-{k}">{esc(n)}</h2><p>{esc(b)}</p></header><ul class="benches">{"".join(bench(a) for a in xs)}</ul></section>')


def instruments(keys):
    return "".join(f'<a class="w" data-w="{k}" data-label="{esc(WL.get(k, k))}"><span class="wl">{esc(WL.get(k, k))}</span><div class="wv">&nbsp;</div><div class="ws">&nbsp;</div></a>' for k in keys)


COMPASS = ('<figure class="compass" aria-label="North, and where the sun is now"><svg viewBox="0 0 92 92" aria-hidden="true">'
           '<circle class="ring" cx="46" cy="46" r="34"/><circle class="ring" cx="46" cy="46" r="22" stroke-dasharray="2 3"/>'
           '<path class="n" d="M46 14L51 46H41z"/><path class="s" d="M46 78L51 46H41z"/><circle cx="46" cy="46" r="2.4" fill="#080705" stroke="#d6a647"/>'
           '<text x="46" y="7" text-anchor="middle">N</text><circle class="sun" cx="46" cy="12" r="4.2"/></svg><figcaption></figcaption></figure>')


def refs(cls, items): return f'<div class="refs {cls}" aria-hidden="true">{"".join(f"<span>{x}</span>" for x in items)}</div>'


def home():
    L = ORDER; live = sum(1 for a in L if a["status"] in ("live", "music", "android"))
    title = "Mentifaber · Anders Powell, builder of minds and the systems that hold them"
    desc = f"{len(L)} projects by Anders Powell: AI agents and swarms, private messengers, live atlases of the sky and the world, local-first tools and games."
    say = f'<p class="tb-say"><span><b>Anders Powell, builder of minds and the systems that hold them.</b> {len(L)} things on the benches of one workshop, {live} of them running right now. Walk in and point at a bench: someone will take you there.</span></p>'
    acts = f'<button class="key" data-suite aria-label="Install the suite">{SUITE}<span>Suite</span></button><button class="key" data-install hidden>{DOWN}<span>Install</span></button>'
    X, Y = "ABCDEFGH", "12345"
    page_ = f"""{head(title, desc, og="https://mentifaber.org/assets/brand/og.jpg")}
<body class="wk home">
{titleblock(say, 1, "—", acts)}
{start()}
{sift(L)}
<div class="drawing">
  {refs("x", X)}{refs("y", Y)}{refs("x b", X)}{refs("y r", Y)}
  <main class="plan" aria-label="The workshop, plan">
    <div class="floor">
      <div class="lantern" aria-hidden="true"></div>
      <div class="row top">{"".join(room(k) for k in LAYOUT[0])}</div>
      <div class="hall"><div class="entry"><img src="assets/brand/mentifaber-mark-96.png" alt="" width="44" height="44"><span class="in">IN</span><p>MENS · FABER</p></div><div class="instruments" role="region" tabindex="0" aria-label="Instruments: live readings">{instruments(k for k, _ in NOW)}</div></div>
      <div class="row bot">{"".join(room(k) for k in LAYOUT[1])}</div>
    </div>
    {COMPASS}
  </main>
</div>
<div class="instruments-slot"></div>
<footer class="sheetnotes">
  <div><h3>Notes</h3><ol>
    <li>Every bench is a working thing. Its datasheet runs it in place: press <b>Power on</b>.</li>
    <li>The instruments on the corridor wall read live feeds: your weather, the Moon, the ISS, the ground, the markets, the swarm.</li>
    <li>Some benches are private: they belong to the people they were made for, and say so.</li>
    <li>Prefer it as a flight? <a href="atlas.html">The atlas</a> shows every project in 3D.</li>
    <li>Questions about a project, a lathe, a radio or a mind: <a href="mailto:anders@mentifaber.org">anders@mentifaber.org</a> · <a href="contact.html">contact</a></li>
  </ol></div>
  <div><h3>Legend</h3><div class="legend"><span><i class="lamp live"></i>running, open to anyone</span><span><i class="lamp lock"></i>private: made for someone</span><span><i class="lamp build"></i>being built, or a concept</span><span><i class="lamp music"></i>music</span><span><i class="lamp"></i>paused</span></div>
    <h3 style="margin-top:18px">Keys</h3><div class="keys"><kbd>/</kbd><span>find a bench</span><kbd>← ↑ → ↓</kbd><span>walk bench to bench</span><kbd>↵</kbd><span>open it</span></div></div>
  <div><h3>Elsewhere</h3><div class="elsewhere"><a href="os">FaberOS</a><a href="makers">Make apps for FaberOS</a><a href="store">Foundry: the apps</a><a href="services">Services: repair, IT, hosting, websites</a><a href="privacy">Privacy</a><a href="terms">Terms</a><a href="credits.html">Credits</a><a href="atlas.html">The atlas</a><a href="atlas-classic.html">Classic atlas</a><a href="widgets/">Home-screen widgets</a><a href="wx/">Quick weather</a><a href="contact.html">Contact</a><a href="https://github.com/mentifaber">GitHub</a><a href="https://x.com/mentifaber">X</a><a href="https://instagram.com/mentifaber">Instagram</a><a href="https://soundcloud.com/sonicveil">SoundCloud</a></div>
    <p class="copy">© Anders Powell · Mentifaber · mens, faber: a mind, a maker</p></div>
</footer>
<div class="note" aria-hidden="true"><div class="card"><span class="lbl"></span><h4></h4><p></p><div class="go">click: walk in →</div></div></div>
<div class="find" role="dialog" aria-modal="true" aria-label="Find a project"><div class="box"><div class="find-top"><input type="search" placeholder="Find a bench…" aria-label="Find a bench"><button class="find-x" type="button" aria-label="Close">✕</button></div><ol></ol></div></div>
<script type="application/json" id="wk-index">{index_json()}</script>
<script type="application/json" id="mf-app">{json.dumps({"name": "Mentifaber"})}</script>
<script src="assets/ui/shell.js?v={ver("assets/ui/shell.js")}" defer></script>
<script src="assets/ui/plan.js?v={ver("assets/ui/plan.js")}" defer></script>
<script src="assets/ui/widgets.js?v={ver("assets/ui/widgets.js")}" defer></script>
</body>
</html>
"""
    open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(page_)
    return "index.html"


def keyplan(a):
    """The whole workshop, small, with this bench lit: every room and every bench is a link."""
    W, top, hall, bot = 300, 46, 22, 46
    out = [f'<rect class="kh" x="1" y="{top + 1}" width="{W - 2}" height="{hall - 2}"/>']
    for r, row in enumerate(LAYOUT):
        n = [len([x for x in ORDER if x["cat"] == k]) for k in row]; x0 = 1; y0 = 1 if r == 0 else top + hall
        for k, c in zip(row, n):
            w = (W - 2) * c / sum(n); xs = [x for x in ORDER if x["cat"] == k]
            out.append(f'<a href="./#{k}"><title>Room {ROOMNO[k]:02d} · {esc(NAMES[k][0])}</title><rect class="kr{" here" if k == a["cat"] else ""}" x="{x0:.1f}" y="{y0}" width="{w:.1f}" height="{top - 2 if r == 0 else bot - 1}"/></a>')
            out.append(f'<text x="{x0 + 5:.1f}" y="{y0 + 10}">{ROOMNO[k]:02d}</text>')
            cols = max(1, int((w - 10) // 13))
            for j, b in enumerate(xs):
                cx = x0 + 9 + (j % cols) * 13; cy = y0 + 20 + (j // cols) * 10
                out.append(f'<a href="{esc(href(b))}"><title>{esc(b["name"])}</title><circle class="kd{" here" if b is a else ""}" cx="{cx:.1f}" cy="{cy:.1f}" r="{3.6 if b is a else 2.6}"/></a>')
            x0 += w
    out.append(f'<path d="M1 {top + hall / 2}h-8m4 -3l4 3-4 3" fill="none" stroke="#d6a647"/>')
    return f'<figure class="keyplan"><svg viewBox="-10 0 {W + 11} {top + hall + bot + 1}" role="group" aria-label="Key plan: where {esc(a["name"])} is in the workshop">{"".join(out)}</svg><figcaption class="lbl">Key plan · room {ROOMNO[a["cat"]]:02d}, {esc(NAMES[a["cat"]][0])}</figcaption></figure>'


def try_card(x):  # "Try it": one thing to do, said plainly, and a key that goes straight there
    return (f'<li class="pick"><div class="pick-h"><h3>{esc(x["t"])}</h3></div><p>{esc(x["d"])}</p>'
            f'<div class="pick-go"><a class="key pri" href="{esc(x["href"])}">{esc(x["k"])}</a></div></li>')


def ratings(r):  # who gets what: visitor and owner, side by side
    rows = "".join(f'<tr><th scope="row">{esc(a)}</th><td data-h="A visitor">{esc(v)}</td><td data-h="The owner">{esc(o)}</td></tr>' for a, v, o in r["rows"])
    return (f'<div class="rate-wrap"><table class="rate"><thead><tr><th scope="col"><span class="sr">What</span></th><th scope="col">A visitor</th><th scope="col">The owner</th></tr></thead>'
            f'<tbody>{rows}</tbody></table></div>' + (f'<p class="prose" style="margin-top:12px">{esc(r["note"])}</p>' if r.get("note") else ""))


FEATURES = [  # what an app's code uses → the permission its iframe needs
    (r"getUserMedia|mediaDevices", "camera; microphone"), (r"geolocation", "geolocation"), (r"wakeLock", "screen-wake-lock"),
    (r"navigator\.share\b|navigator\.canShare", "web-share"), (r"clipboard\.(read|readText)\(", "clipboard-read"),
    (r"DeviceOrientation|DeviceMotion|Gyroscope|Accelerometer|Magnetometer", "gyroscope; accelerometer; magnetometer"), (r"navigator\.xr\b", "xr-spatial-tracking")]
VENDORED = ("assets/maps/leaflet/",)  # other people's libraries, served from this site
def allow_for(app):
    if not app or "://" in app: return ""
    path = os.path.join(ROOT, app.split("#")[0].split("?")[0])
    if not os.path.exists(path): return ""
    code = open(path, encoding="utf-8", errors="ignore").read()
    for src in re.findall(r'<script[^>]+src="(?!https?:)/?([^"?#]+)', code):  # its own scripts too
        if src.startswith(VENDORED): continue  # a library's unused features (Leaflet can locate you) aren't the app asking for them
        f = os.path.join(ROOT, src)
        if os.path.exists(f): code += open(f, encoding="utf-8", errors="ignore").read()
    out = ["fullscreen", "autoplay", "clipboard-write"] + [perm for pat, perm in FEATURES if re.search(pat, code)]
    return "; ".join(out)


def page(i):
    a, c = A[i], json.load(open(os.path.join(CONTENT, i + ".json"), encoding="utf-8"))
    n, _ = NAMES[a["cat"]]; op, _ = links(a); app = a.get("app"); shot = c.get("shot") or preview(i)
    title = f'{a["name"]} — {c.get("titleTail") or short(a)} · Mentifaber'
    desc = a["desc"] or ""
    og = "https://mentifaber.org/" + (shot.replace(".webp", ".png") if shot else "assets/previews/home.png")
    stack = []; [stack.append(s) for x in c.get("cards", []) for s in x.get("stack", []) if s not in stack]
    caps = c.get("caps", [])
    rows = [("Part no.", pno(a)), ("Room", f'<a href="./#{a["cat"]}">{ROOMNO[a["cat"]]:02d} · {esc(n)}</a>'), ("Status", esc(STATUS.get(a["status"], a["status"]))),
            ("Does", esc(" · ".join(caps))) if caps else None, ("Runs as", esc(c.get("launchSub", ""))) if c.get("launchSub") else None,
            ("Made with", esc(" · ".join(stack[:8]))) if stack else None,
            ("Data", esc(c["data"])) if c.get("data") else None]
    specs = "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in [r for r in rows if r])
    st = {"live": "live", "android": "live", "music": "music", "private": "lock"}.get(a["status"], "build")
    feats = "".join(f'<li><b>{esc(f["t"])}</b><span>{B.cap(f["d"])}</span></li>' for f in c.get("features", []))
    cards = "".join(f'<div class="prose part"><h3>{esc(x["n"]).capitalize()}</h3>{x["html"]}{"<div class=stack>" + "".join(f"<span>{esc(s)}</span>" for s in x.get("stack", [])) + "</div>" if x.get("stack") else ""}</div>' for x in c.get("cards", []))
    near = [x for x in ORDER if x["cat"] == a["cat"] and x["id"] != i][:6]
    k_ = ORDER.index(a); prv, nxt = ORDER[k_ - 1], ORDER[(k_ + 1) % len(ORDER)]
    crumb = f'<nav class="tb-crumb" aria-label="Where you are"><a href="./">The workshop</a><a href="./#{a["cat"]}">Room {ROOMNO[a["cat"]]:02d} · {esc(n)}</a><a href="#" aria-current="page">{pno(a)} · {esc(a["name"])}</a></nav>'
    k = [0]
    def S(t, body):
        k[0] += 1; sid = re.sub(r"[^a-z0-9]+", "-", re.sub(r"<[^>]+>", "", t).lower()).strip("-"); return f'<section class="sec" id="{sid}"><h2><i>{k[0]:02d}</i>{t}</h2><div>{body}</div></section>'
    story = c.get("story") or {}
    body = "".join([
        S("Why it exists", (f'<h3 class="story">{story["title"]}</h3>' if story.get("title") else "") + f'<div class="prose">{c.get("lede", "")}</div>') if c.get("lede") else "",
        S("Try it", f'<ol class="picks tries">{"".join(try_card(x) for x in c["tryit"])}</ol>') if c.get("tryit") else "",
        S("Views", '<div class="figs">' + "".join(f'<figure class="fig{" tall" if f.get("tall") else ""}"><a href="{esc(f["src"])}" target="_blank" rel="noopener" aria-label="Open full size"><img src="{esc(f["src"])}" alt="{esc(a["name"])}: {esc(f["cap"])}" loading="lazy"></a><figcaption class="lbl">Fig. {n_ + 2} · {esc(f["cap"])}</figcaption></figure>' for n_, f in enumerate(c["figs"])) + "</div>") if c.get("figs") else "",
        S("Parts list", f'<ol class="bom">{feats}</ol>' + (f'<p class="prose" style="margin-top:14px">{c["featuresNote"]}</p>' if c.get("featuresNote") else "")) if feats else "",
        S("Ratings", ratings(c["ratings"])) if c.get("ratings") else "",
        S("Interlocks", '<ul class="locks">' + "".join(f"<li>{esc(x)}</li>" for x in c["interlocks"]) + '</ul><p class="lbl" style="margin-top:8px">what it may and may not do on its own</p>') if c.get("interlocks") else "",
        S("Instruments", f'<div class="instr">{instruments(c["widgets"])}</div>') if c.get("widgets") else "",
        S("Construction", cards) if cards else "",
        S("Tolerances", f'<div class="prose">{c["scope"]}</div><p class="lbl" style="margin-top:6px">what it is not, said plainly</p>') if c.get("scope") else "",
        S("Inscription", f'<p class="closing gold-text">{c.get("closing", "")}</p>') if c.get("closing") else "",
        S("The same room", f'<ul class="benches adj">{"".join(bench(x) for x in near)}</ul>') if near else "",
    ])
    if app and a["status"] in NOT_READY: acts = f'<button class="key pri big" data-power>Preview</button><a class="key big" href="{esc(app)}">Full screen</a><span class="key big soon" title="Not an app you can install yet">Coming soon</span>'
    elif app and a["status"] in NATIVE: acts = f'<button class="key pri big" data-power>Try the demo</button><a class="key big" href="{esc(app)}">Full screen</a><a class="key big" href="store#app/{esc(a.get("android", ""))}" title="The real remote, from Foundry">{DOWN}Get it for Android</a>'
    elif app: acts = f'<button class="key pri big" data-power>Power on</button><a class="key big" href="{esc(app)}">Full screen</a><button class="key big" data-install hidden>{DOWN}Install</button>'
    elif op and op != a.get("href"): acts = f'<a class="key pri big" href="{esc(op)}">Open</a>'
    else: acts = ""
    piece = (f"""<figure class="piece" data-app="{esc(app or "")}" data-allow="{esc(allow_for(app))}">
      <span class="dimw" aria-hidden="true"><span>workpiece · {esc(a["name"])}</span></span><span class="dimh" aria-hidden="true"><span>{"live" if app else "as built"}</span></span>
      <div class="frame"><div style="background-image:url('{esc(shot)}')">{'<button class="key pri big power" data-power>Power on</button>' if app else ""}</div></div>
      <figcaption><span>Fig. 1 · {esc(a["name"])}, {"on the bench: power it on to run it here" if app else "as it stands"}</span><span>{pno(a)}</span></figcaption>
    </figure>""") if shot else ""
    cfg = json.dumps({"id": i, "name": a["name"], "app": app, "h": a["hue"]})
    page_ = f"""{head(title, desc, a, og)}
<body class="wk sheet-page" style="--h:{a["hue"]}">
{titleblock(crumb, SHEET_OF[a["id"]], pno(a), "")}
<main class="ds">
  <aside class="spec"><div class="stick">
    <span class="pno">{pno(a)} · {esc(n)}</span>
    <h1 style="--vt:bench-name;--len:{max(len(w) for w in a["name"].split())}">{esc(a["name"])}</h1>
    <span class="tag {st}">{esc(STATUS.get(a["status"], a["status"]))}</span>
    {f'<p class="say1">{esc(c["plain"])}</p>' if c.get("plain") else ""}<p class="tagline">{c.get("tagline", "")}</p>
    <div class="acts">{acts}</div>
    <table class="specs">{specs}</table>
    {keyplan(a)}
  </div></aside>
  <section class="work" aria-label="{esc(a["name"])}, on the bench">
    {piece}
    {body}
    <nav class="walkon" aria-label="Walk on"><a class="prev" href="{esc(href(prv))}"><span class="lbl">← {pno(prv)}</span><b>{esc(prv["name"])}</b></a><a class="next" href="{esc(href(nxt))}"><span class="lbl">{pno(nxt)} →</span><b>{esc(nxt["name"])}</b></a></nav>
  </section>
</main>
<div class="find" role="dialog" aria-modal="true" aria-label="Find a project"><div class="box"><div class="find-top"><input type="search" placeholder="Find a bench…" aria-label="Find a bench"><button class="find-x" type="button" aria-label="Close">✕</button></div><ol></ol></div></div>
<script type="application/json" id="wk-index">{index_json()}</script>
<script type="application/json" id="mf-app">{cfg}</script>
<script src="assets/ui/shell.js?v={ver("assets/ui/shell.js")}" defer></script>
<script src="assets/ui/plan.js?v={ver("assets/ui/plan.js")}" defer></script>
{f'<script src="assets/ui/widgets.js?v={ver("assets/ui/widgets.js")}" defer></script>' if c.get("widgets") else ""}
</body>
</html>
"""
    out = a["href"] if a.get("href", "").endswith(".html") else i + ".html"
    open(os.path.join(ROOT, out), "w", encoding="utf-8").write(page_)
    if app: B.manifest(a, c)
    return out


def plain(file, title, desc, crumb, body, extra="", base=""):
    """A page that isn't a bench (contact, the 404) on the same sheet: title block, one gold-ruled panel."""
    page_ = f"""{head(title, desc, og="https://mentifaber.org/assets/brand/og.jpg")}
<body class="wk plain-page">
{titleblock(f'<nav class="tb-crumb" aria-label="Where you are"><a href="./">The workshop</a><a href="#" aria-current="page">{crumb}</a></nav>', 0, "—", "")}
<main class="plain">{body}</main>
<div class="find" role="dialog" aria-modal="true" aria-label="Find a project"><div class="box"><div class="find-top"><input type="search" placeholder="Find a bench…" aria-label="Find a bench"><button class="find-x" type="button" aria-label="Close">✕</button></div><ol></ol></div></div>
<script type="application/json" id="wk-index">{index_json()}</script>
<script src="assets/ui/plan.js?v={ver("assets/ui/plan.js")}" defer></script>
{extra}
</body>
</html>
"""
    if base: page_ = page_.replace("<head>", "<head>\n" + base, 1)  # the 404 is served at any depth: resolve everything from the root
    open(os.path.join(ROOT, file), "w", encoding="utf-8").write(page_)
    return file


def contact():
    body = """<span class="pno">Correspondence · the line is open</span>
  <h1>Write to the <span class="gold-text">workshop</span></h1>
  <p class="tagline">A question about one of the systems, a build you want to talk through, a commission, or just a hello. It reaches a person, not a queue.</p>
  <div class="addr"><a class="mail" id="mail" href="mailto:anders@mentifaber.org">anders@mentifaber.org</a>
    <div class="acts"><button class="key" type="button" id="copy">Copy address</button><a class="key pri" href="mailto:anders@mentifaber.org">Open email</a></div></div>
  <form id="f" class="form" novalidate>
    <h2 class="lbl">Quick reach-out</h2>
    <div class="row2"><label>Your name<input id="name" autocomplete="name" maxlength="80" placeholder="Who's writing"></label>
      <label>Your email<input id="from" type="email" autocomplete="email" maxlength="120" placeholder="So I can write back"></label></div>
    <div><span class="lbl">What's it about</span><div class="chips" id="chips">
      <button type="button" class="chip" aria-pressed="true">Just saying hi</button><button type="button" class="chip" aria-pressed="false">A project on the site</button>
      <button type="button" class="chip" aria-pressed="false">Work / commission</button><button type="button" class="chip" aria-pressed="false">Repair / IT / hosting</button><button type="button" class="chip" aria-pressed="false">Music</button><button type="button" class="chip" aria-pressed="false">Bug report</button></div></div>
    <label>Message<textarea id="msg" maxlength="2000" placeholder="A couple of lines is plenty."></textarea></label>
    <div class="count lbl" id="count">0 / 2000</div>
    <input class="hp" id="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="acts"><button class="key pri big" type="submit">Send message</button><span class="status" id="status" role="status"></span></div>
    <p class="fine">Sending opens your own email app with everything filled in, and the message travels like any other email, through your email provider and mine. Nothing you type here is sent to or stored on this site. If nothing opens, copy the address above.</p>
  </form>
  <h2 class="lbl" style="margin-top:34px">Elsewhere</h2>
  <div class="elsewhere big"><a href="https://github.com/mentifaber" target="_blank" rel="noopener">GitHub · mentifaber</a><a href="https://x.com/mentifaber" target="_blank" rel="noopener">X · @mentifaber</a><a href="https://instagram.com/mentifaber" target="_blank" rel="noopener">Instagram · @mentifaber</a><a href="https://soundcloud.com/sonicveil" target="_blank" rel="noopener">SoundCloud · Sonic Veil</a></div>"""
    js = open(os.path.join(os.path.dirname(__file__), "contact.js.part"), encoding="utf-8").read()
    return plain("contact.html", "Contact · Mentifaber", "Write to Mentifaber: send a quick note or email anders@mentifaber.org.", "Correspondence", body, js)


# The workshop takes work: the same hands that built every bench here, offered as services. Each line says what's
# included and how a job runs; prices are quoted per job, in writing, before anything starts.
SERVICES = [
    ("repair", "Tech repair", "Phones, laptops, desktops, consoles and the odd strange gadget.",
     ["Diagnosis first, in plain words: what's wrong, what it costs, whether it's worth it", "Screens, batteries, ports, storage and RAM upgrades, cleaning and thermal work",
      "Slow machines made fast again; malware and pop-up junk removed", "Data rescue from failing drives and dead phones, where it's still there to rescue"],
     "Mail-in, by arrangement: no drop-off or visits for now. Anything software is fixed remotely. Every repair comes with a signed Device Passport."),
    ("it", "IT services", "The tech side of a home, a studio or a small business, handled.",
     ["Wi-Fi, networks, printers and shared drives set up properly, with you on the line", "Backups that run by themselves, and a test restore so you know they work",
      "Accounts, passwords and two-step sign-in sorted for the whole household or team", "Security check-ups: what's exposed, what's out of date, what to fix first"],
     "Remote only, one-off or ongoing: you show me the setup on a call, or I connect with your permission. If a job truly needs hands on site, the quote says so first."),
    ("hosting", "Web hosting", "Sites kept up on the same global edge network this workshop runs on.",
     ["Every plan: HTTPS and a global CDN, behind Cloudflare with its standard DDoS protection", "Every plan: uptime checked around the clock, with an alert to me when a site goes down",
      "Every plan: updates applied, and nightly backups of the site's files and data", "Your own domain, set up and renewed; email forwarding and DNS handled",
      "Room to grow: forms, sign-ins, storage and APIs when the site needs them"],
     "Monthly plans, quoted to the site; your quote says how long backups are kept. Moving an existing site in is part of the job. See the hosting terms for what a restore covers."),
    ("websites", "Websites", "Designed and built by hand, fast on any phone, and yours to keep.",
     ["Portfolios, shops, booking pages, landing pages and full business sites", "Written to be found: search-ready pages, real descriptions, fast loads",
      "Accessible, works offline where it helps, and installable as an app", "A redesign of the site you already have, without losing what works"],
     "Fixed price per project, with the plan agreed before building starts."),
    ("software", "Custom software & AI", "The kind of thing on every bench of this workshop, built for you.",
     ["Web and Android apps, internal tools, dashboards and automations", "AI assistants grounded in your own documents, with your data kept private",
      "Integrations: hook the services you already pay for together", "Prototypes in days, to find out if an idea works before it costs much"],
     "Scoped together first; built in short steps you can see and steer."),
]
SERVICES_CSS = """<style>.svc-jump{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 4px}.svc-jump a{border:1px solid var(--line);padding:6px 12px;border-radius:99px;text-decoration:none;font-size:.9rem}
.svc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:16px;margin-top:22px}
.svc{border:1px solid var(--line);border-radius:12px;padding:18px 18px 16px;display:flex;flex-direction:column;gap:8px;scroll-margin-top:80px}
.svc h2{margin:0;font-size:1.25rem}.svc-lead{margin:0;color:var(--ink-2,#c9bc9f)}.svc ul{margin:4px 0 0;padding-left:18px;display:grid;gap:5px;font-size:.93rem}
.svc-how{margin:auto 0 0;padding-top:8px;font-size:.88rem;color:var(--dim,#8d877a)}.svc .key{align-self:flex-start}
.svc-steps{display:grid;gap:8px;padding-left:20px}.svc-steps b{font-weight:600}
.svc .key{max-width:100%;white-space:normal;text-align:left}
.form select{width:100%;font:400 16px/1.5 var(--font);color:var(--ink);background:var(--floor-2);border:1px solid var(--line-2);padding:11px 13px;border-radius:0;text-transform:none;letter-spacing:0}.form select:focus{border-color:var(--gold);outline:none}</style>"""
SERVICES_JS = r"""<script>
(() => {
  const TO = "anders@mentifaber.org", $ = (id) => document.getElementById(id), status = (t) => { $("status").textContent = t; };
  let topic = document.querySelector("#chips .chip").textContent;
  const pick = (name) => document.querySelectorAll("#chips .chip").forEach((c) => { const on = c.textContent === name; c.setAttribute("aria-pressed", on); if (on) topic = name; });
  $("chips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) pick(b.textContent); });
  document.querySelectorAll("[data-svc]").forEach((b) => b.addEventListener("click", () => { pick(b.dataset.svc); $("f").scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => $("what").focus({ preventScroll: true }), 400); }));
  const card = location.hash.length > 1 && document.getElementById(location.hash.slice(1)), cb = card && card.querySelector && card.querySelector("[data-svc]"); if (cb) pick(cb.dataset.svc);
  $("msg").addEventListener("input", () => { $("count").textContent = $("msg").value.length + " / 2000"; });
  $("f").addEventListener("submit", (e) => {
    e.preventDefault(); if ($("hp").value) return;
    const name = $("name").value.trim(), from = $("from").value.trim(), what = $("what").value.trim(), msg = $("msg").value.trim(), when = $("when").value;
    if (!msg) { status("Say a little about what's going on first."); $("msg").focus(); return; }
    if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) { status("That email looks off: check it or leave it blank."); $("from").focus(); return; }
    const subject = "[Services] " + topic + (what ? " · " + what : "") + (name ? " · " + name : "");
    const body = "Service: " + topic + "\n" + (what ? "Device / site / system: " + what + "\n" : "") + "How soon: " + when + "\n\n" + msg + "\n\n—\n" + (name || "Sent from mentifaber.org/services") + (from ? "\nReply to: " + from : "");
    location.href = "mailto:" + TO + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    status("Opening your email app…");
  });
})();
</script>"""
def services():
    def card(k, n, lead, items, how):
        lis = "".join("<li>" + esc(x) + "</li>" for x in items)
        return (f'<article class="svc" id="{k}"><h2>{esc(n)}</h2><p class="svc-lead">{esc(lead)}</p><ul>{lis}</ul>'
                f'<p class="svc-how">{esc(how)}</p><button class="key" type="button" data-svc="{esc(n)}">Ask about {esc(n.lower())}</button></article>')
    cards = "".join(card(*x) for x in SERVICES)
    chips = "".join(f'<button type="button" class="chip" aria-pressed="{"true" if i == 0 else "false"}">{esc(x[1])}</button>' for i, x in enumerate(SERVICES))
    jump = "".join(f'<a href="#{x[0]}">{esc(x[1])}</a>' for x in SERVICES)
    body = f"""<span class="pno">Services · the workshop takes work</span>
  <h1>Repair, IT, hosting, <span class="gold-text">websites</span> and software</h1>
  <p class="tagline">Everything on this site was designed and built here, and is kept running here: forty-odd apps, an AI and an operating system. The same hands can fix your laptop, look after your network, host your site and build the thing you've been imagining.</p>
  <nav class="svc-jump" aria-label="Services">{jump}</nav>
  <div class="svc-grid">{cards}</div>
  <h2 class="lbl" style="margin-top:34px">Where the work happens</h2>
  <p>Everything is <b>remote or mail-in</b> for now: there's no drop-off counter and no on-site visits. Software problems, IT help, hosting, websites and custom software are done remotely, wherever you are. A device that needs hands-on repair comes by mail: once you've approved the quote, you get the address and packing notes, you send it tracked and insured, and it comes back the same way. Shipping both ways is set out in the quote.</p>
  <h2 class="lbl" style="margin-top:34px">How a job runs</h2>
  <ol class="svc-steps"><li><b>Tell me what's going on.</b> The form below, or an email. A photo or a link helps.</li>
    <li><b>A written quote.</b> What's wrong or what you need, what it will take and the price, before anything starts.</li>
    <li><b>You say yes, or don't.</b> Nothing is done or charged until you approve the quote, from your own private link in the <a href="portal">Workshop Portal</a>. There you can read and approve the quote, follow each step of the job, write to me, see the invoice, and open your repair's Device Passport or your hosted site's status. No account or password: the link is your key.</li>
    <li><b>Done and explained.</b> You get a short write-up of what was done, and a repaired device gets a signed <a href="passport">Device Passport</a>.</li></ol>
  <p class="fine">Payments, refunds, the repair warranty, data and backups, and hosting cancellation: see the <a href="terms">terms</a>.</p>
  <h2 class="lbl" style="margin-top:34px">The proof</h2>
  <div class="elsewhere big"><a href="./">The workshop: every project</a><a href="os">FaberOS, an operating system in the browser</a><a href="autofaber">AutoFaber, the AI</a><a href="store">Foundry: the apps</a></div>
  <form id="f" class="form" novalidate style="margin-top:34px">
    <h2 class="lbl">Ask for a quote</h2>
    <div class="row2"><label>Your name<input id="name" autocomplete="name" maxlength="80" placeholder="Who's asking"></label>
      <label>Your email<input id="from" type="email" autocomplete="email" maxlength="120" placeholder="So I can send the quote"></label></div>
    <div><span class="lbl">Which service</span><div class="chips" id="chips">{chips}</div></div>
    <div class="row2"><label>Device, site or system<input id="what" maxlength="120" placeholder="e.g. 2019 MacBook Pro, example.com, office Wi-Fi"></label>
      <label>How soon<select id="when"><option>Whenever suits</option><option>This week</option><option>It's urgent</option></select></label></div>
    <label>What's going on<textarea id="msg" maxlength="2000" placeholder="What happened, what you need, anything you've tried."></textarea></label>
    <div class="count lbl" id="count">0 / 2000</div>
    <input class="hp" id="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="acts"><button class="key pri big" type="submit">Send the request</button><span class="status" id="status" role="status"></span></div>
    <p class="fine">Sending opens your own email app with everything filled in, and the message travels like any other email, through your email provider and mine. Nothing you type here is sent to or stored on this site. Or write straight to <a href="mailto:anders@mentifaber.org">anders@mentifaber.org</a>.</p>
  </form>"""
    return plain("services.html", "Services · repair, IT, hosting, websites · Mentifaber", "Tech repair, IT support, web hosting, websites, and custom software and AI, from the workshop that built every app on mentifaber.org. Quoted before work starts.", "Services", body, SERVICES_CSS + "\n" + SERVICES_JS)


CREDITS = [
    ("Data", [
        ("NOAA SWPC, the National Weather Service, USGS and NASA", "U.S. government work, public domain"),
        ("Weather data by <a href=\"https://open-meteo.com\">Open-Meteo.com</a>", "CC BY 4.0"),
        ("The GDELT Project", "world event records, cited as source"),
        ("CelesTrak", "satellite element sets"),
        ("The Space Devs, Launch Library 2", "rocket launches"),
        ("Where the ISS at?", "ISS position"),
        ("GDACS, European Commission Joint Research Centre", "disaster alerts"),
        ("adsb.lol", "aircraft positions, ODbL 1.0"),
        ("adsb.fi and the OpenSky Network", "aircraft positions"),
        ("Planespotters.net", "aircraft photos © their photographers, credited on each photo"),
        ("Data provided by <a href=\"https://www.coingecko.com\">CoinGecko</a>; Coinbase; Yahoo Finance; Frankfurter (ECB rates)", "prices and currencies"),
        ("Open Food Facts and Open Beauty Facts", "database ODbL 1.0, images CC BY-SA"),
        ("Wikipedia", "text CC BY-SA 4.0, quoted with links"),
        ("arXiv and OpenAlex", "paper metadata, CC0"),
        ("Hugging Face Hub", "each dataset and model under its own licence"),
    ]),
    ("Maps", [
        ("© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors", "ODbL 1.0"),
        ("Esri World Imagery", "satellite imagery"),
        ("Natural Earth, via world-atlas (© Michael Bostock, ISC)", "land, borders and names: public domain; drawn by the site itself, no tile service"),
        ("RainViewer", "weather radar"),
    ]),
    ("AI models", [
        ("Built with Llama", "Meta Llama 3.1, 3.2, 3.3 and 4, under the Llama Community License"),
        ("Gemma and SEA-LION", "Gemma Terms of Use"),
        ("Qwen, Mistral, GPT-OSS, Granite, FLUX.1 [schnell], Hermes 2 Pro", "Apache-2.0"),
        ("DeepSeek R1 Distill, Whisper, MeloTTS, BGE", "MIT"),
        ("Deepgram Aura and Flux", "voices and listening, via Cloudflare Workers AI"),
        ("Cloudflare Workers AI", "the platform most of these run on"),
    ]),
    ("Software", [
        ("Leaflet", "BSD-2-Clause"), ("three.js", "MIT"), ("GSAP", "GreenSock Standard License"),
        ("PDF.js", "Apache-2.0"), ("Mammoth", "BSD-2-Clause"), ("Tesseract.js", "Apache-2.0"),
        ("Pyodide", "MPL-2.0"), ("WebLLM (MLC)", "Apache-2.0, for AutoFaber Offline"), ("satellite.js", "MIT"), ("Font Awesome Free", "icons CC BY 4.0, fonts OFL, code MIT"), ("llama.cpp", "MIT"),
    ]),
    ("Type", [
        ("Literata, Schibsted Grotesk, Martian Mono, Azeret Mono", "SIL Open Font License 1.1"),
        ("Typefaces from Google Fonts", "SIL Open Font License 1.1 or Apache-2.0"),
        ("Mentifaber Display and Hive Strata", "drawn here, by our own scripts"),
    ]),
]

# P1.04 / P2.07: one place that says, plainly, where things go (each line checked against the code it describes)
PRIVACY = [
    ("AutoFaber: your conversations", [
        ("Visitors", "Your list of conversations is kept in your own browser, not on the server. Nothing you say is added to AutoFaber's memory."),
        ("The owner", "With the Mind on, the owner's messages are kept in AutoFaber's storage so it can remember them; things it notices wait for a yes before they're kept, and the Mind view can export or forget everything."),
        ("No-memory sessions", "Not saved on the device and not added to memory. The message still goes to the model that answers it: no memory doesn't mean no provider."),
        ("Reply health", "For every reply: which model, how long it took and how long it was, never the text. Kept for 30 days, to route around slow or failing models."),
    ]),
    ("Who reads your message", [
        ("The model you use", "Each message goes to the model that answers it: Cloudflare Workers AI for the free models, or the provider of a key in the vault (OpenAI, Anthropic, Google, Groq and others). Their own terms apply to what they receive."),
        ("Visitors", "Only the free models: Workers AI and free-tier keys the owner has chosen to share with visitors. Paid keys answer only the owner."),
        ("Web search", "When search is on, your question goes to the owner's search provider, or to Wikipedia when there isn't one."),
    ]),
    ("Keys and accounts", [
        ("API keys", "Sealed with AES-GCM in AutoFaber's storage the moment they're added, never shown again, and used only for the calls they're meant for."),
        ("Sign-ins", "The site keeps only a fingerprint (a hash) of each password, never the password itself. Sessions are a cookie that holds a random token."),
    ]),
    ("Your location", [
        ("Weather and the sky", "The home page asks Cloudflare for a city-level guess from your connection, to show your weather and the next ISS pass. No prompt, nothing stored."),
        ("Apps that ask", "An app that wants your exact location (Overhead, for passes over you) asks through your browser first, and only the apps that use a feature are allowed to ask for it."),
    ]),
    ("Running on its own", [
        ("Autonomy", "When the owner turns it on, AutoFaber may start at most 8 Swarm missions and 1,100 model calls of its own a day, two at a time. What it builds waits for the owner: nothing deploys on its own."),
        ("Scheduled jobs", "Reflection on recent conversations, the owner's scheduled tasks and alerts run in the background, for the owner only, within a daily budget."),
    ]),
    ("FaberOS", [
        ("On your device", "Its settings, your permission answers, notifications and the files on the Shelf stay in your browser. Nothing is sent anywhere, and Settings can forget all of it."),
        ("Asking it to arrange", "Commands like \"open Ballast\" or \"put Overhead next to Unlit\" are read on your device. Only when you choose \"Let AutoFaber arrange it\" do your sentence and the names of the apps go to AutoFaber's model, which sends back which apps to open and where; nothing is kept."),
        ("Asking apps to act", "When AutoFaber plans a verb (\"log $40 for gas\"), your sentence and the list of verbs the apps offer go to its model; your data in those apps doesn't. The app does the work in your browser, and anything that changes your data asks you first."),
    ]),
    ("Witness and Device Passports", [
        ("Witness", "Your photo stays on your phone. Only its SHA-256 fingerprint, its name and size, your note and (if you tick the box) the position your phone reports go to the site, which signs them with its own clock and keeps nothing. Visitors get 100 records a day, counted by connection."),
        ("Quiet Check-in", "Kept for each check-in: the person's first name, the time and time zone of their daily check-in, when they last checked in (and whether by the button or a device), the dates of the last 14 check-ins, a date they're away until if they set one, and the family's phone alert addresses (at most 10). The keys in the links (the person's, the family's, and a device's if one is made) are kept only as fingerprints. A device's link only checks in; it sends nothing else and can't read anything. Deleting it with the person's link removes everything."),
        ("Sealed Letters", "Your letter is encrypted in your browser and its key is split among the friends you choose; the site keeps only the sealed letter, its lock and (for a locked letter) a release secret that opens nothing on its own. It never sees the letter, its key or any friend's link. Deleting it with your writer key removes it."),
        ("Workshop Portal", "A job the workshop opens for you is kept in the site's storage: its title, your name, the quote, its status, the invoice and the messages on it. Your email, if you gave it, and the workshop's private notes are seen only by the workshop. Your link is a long random key; deleting the job ends it."),
        ("Device Passports", "A passport lives entirely in its link: the site signs it when the workshop issues it and stores nothing. The part after # in the link is never sent to any server; checking happens in your browser."),
    ]),
    ("The other apps", [
        ("Private messengers", "Barycenter and Pilotfish are encrypted end to end and kept on the devices of the people who use them."),
        ("The Nest Registry", "A private registry for one family, by invitation only; it isn't listed on the site. Kept in its own storage, open only to the parents and the guests they invite; each device keeps a copy of the list it last saw so it still opens when the site is resting."),
        ("DocCrawler's Fine Print", "Your library stays in your browser. Only when you press Fine Print does that one document's text (up to 24,000 characters) go to AutoFaber's model to be read; nothing is kept. Visitors get 12 readings a day."),
        ("Contact and quotes", "The contact and quote forms open your own email app with the message filled in. Nothing you type is sent to or stored on this site; the message travels like any other email, through your email provider and mine."),
    ]),
]
def privacy():
    rows = "".join(f'<h2 class="lbl" style="margin-top:30px">{esc(h)}</h2><dl class="priv">' + "".join(f"<div><dt>{esc(a)}</dt><dd>{esc(b)}</dd></div>" for a, b in items) + "</dl>" for h, items in PRIVACY)
    body = f"""<span class="pno">Privacy · where things go</span>
  <h1>What happens to <span class="gold-text">what you send</span></h1>
  <p class="tagline">Mentifaber is one person's workshop, not a company that sells data. This page says, in one place, what each part keeps, who else sees it, and for how long.</p>
  {rows}
  <p class="fine" style="margin-top:30px">A question about your data, or something here that doesn't match what you see? Write to <a href="mailto:anders@mentifaber.org">anders@mentifaber.org</a>.</p>"""
    css = "<style>.priv{margin:10px 0 0}.priv div{display:grid;grid-template-columns:minmax(120px,190px) 1fr;gap:6px 18px;padding:10px 0;border-top:1px solid var(--line)}.priv dt{font-weight:600}.priv dd{margin:0;color:var(--ink-2,#c9bc9f)}@media (max-width:620px){.priv div{grid-template-columns:1fr}}</style>"
    return plain("privacy.html", "Privacy · Mentifaber", "Where what you send goes on Mentifaber: conversations, memory, keys, location and models, said plainly in one place.", "Privacy", body, css)


TERMS_UPDATED = "24 November 2026"
TERMS = [
    ("Quotes and approval", [
        "Every job starts with a written quote: what's wrong or what you need, what it will take, and the price. It's sent to your private link in the Workshop Portal.",
        "Nothing is done or charged until you approve the quote. If the job turns out to need more than the quote says, I stop and send a new quote before going further.",
    ]),
    ("Payments", [
        "Repairs and IT work are paid on completion, by the method on the invoice. Parts ordered for your job are paid when you approve the quote, before they're ordered.",
        "Websites and custom software are paid by the milestones in the quote. Hosting is paid monthly, in advance.",
    ]),
    ("Refunds", [
        "If a repair can't be done, you pay nothing for it. A diagnosis fee is charged only if the quote said so before work started.",
        "Parts ordered for your job are refunded if the supplier takes them back; otherwise they're yours, sent back with your device.",
        "If a repair covered by the warranty below fails, I fix it again at no charge or, if I can't, refund what you paid for that repair.",
        "If you stop a website or software project, you pay for the milestones already delivered and nothing more.",
    ]),
    ("Repair warranty: 30 days", [
        "Covers the fault I repaired and the parts I fitted, for 30 days from when the device is sent back to you.",
        "Doesn't cover: new damage (drops, cracks, liquid, pressure), faults unrelated to the repair, a device opened or repaired by someone else since, problems caused by software installed afterwards, normal wear, or a device that already had liquid damage when the quote says so.",
        "To use it, write to me through your portal link or by email within the 30 days.",
    ]),
    ("Your data and backups", [
        "Back up anything you can before sending a device or starting a job. Repairs can mean replacing storage or resetting software, and I'm not responsible for data lost during a repair.",
        "Data rescue is an attempt, not a promise. A failing drive or phone can fail completely during the attempt, and some data is beyond recovery. You're charged for data rescue only as the quote sets out.",
        "I look at your files only as far as the job needs. Copies of recovered data are deleted from my equipment once you've confirmed you have them.",
    ]),
    ("Mail-in", [
        "All hands-on repairs come by mail for now; there's no drop-off and no on-site visits. After you approve the quote, you get the address and packing notes.",
        "Pack the device well and send it tracked and insured; I'm not responsible for damage in transit on the way to me. It's sent back tracked and insured. Shipping costs both ways are set out in the quote.",
    ]),
    ("Hosting", [
        "Every plan includes HTTPS and a global CDN behind Cloudflare with its standard DDoS protection, uptime checks around the clock with an alert to me when a site goes down, updates applied, and nightly backups.",
        "No uptime percentage is promised. When a site goes down I'm alerted and work on it; outages at Cloudflare or other providers are outside my control.",
        "Backups cover the site I host: its files and the data it stores with the hosting. They don't cover email, files kept elsewhere, or outside services the site connects to. How long backups are kept is in your quote. A restore brings the site back to the latest good backup; anything changed after it may need redoing. Backups make losing a site very unlikely, but can't promise that nothing is ever lost.",
        "Plans are month to month. Cancel any time through your portal link or by email: hosting ends at the end of the month you've paid for, with no refund for part of a month. You get a copy of your site's files and data, and your domain is transferred to you.",
        "I can decline or stop hosting anything unlawful, or anything that puts other sites or people at risk, and I'll tell you why.",
    ]),
    ("Websites and software", [
        "The plan and the price are agreed before building starts. Once it's paid in full, the site or software built for you is yours. Libraries and services it uses stay under their own licences.",
    ]),
    ("If something goes wrong", [
        "If I make a mistake, I'll put it right. Beyond that, my responsibility for a job is limited to what you paid for it, except where the law doesn't allow that limit.",
    ]),
    ("Changes", [
        "These terms can change. A job is held to the terms in place when you approved its quote; hosting plans follow the current terms, with a month's notice of any change that affects you.",
    ]),
]
def terms():
    rows = "".join(f'<h2 class="lbl" style="margin-top:28px">{esc(h)}</h2><ul class="terms">' + "".join(f"<li>{esc(x)}</li>" for x in items) + "</ul>" for h, items in TERMS)
    body = f"""<span class="pno">Terms · for the work the workshop takes</span>
  <h1>Customer <span class="gold-text">terms</span></h1>
  <p class="tagline">For repair, IT, hosting, websites and software from <a href="services">Mentifaber's services</a>, in plain words. Each quote can add to these for its own job. Last updated {TERMS_UPDATED}.</p>
  {rows}
  <p class="fine" style="margin-top:30px">What happens to your information is on the <a href="privacy">privacy page</a>. A question about these terms? Write to <a href="mailto:anders@mentifaber.org">anders@mentifaber.org</a>.</p>"""
    css = "<style>.terms{margin:8px 0 0;padding-left:20px;display:grid;gap:7px}.terms li{color:var(--ink-2,#c9bc9f)}</style>"
    return plain("terms.html", "Terms · Mentifaber", "Customer terms for Mentifaber's repair, IT, hosting, website and software work: quotes, payments, refunds, the repair warranty, data and backups, and hosting cancellation.", "Terms", body, css)


def credits():
    rows = "".join(f'<h2 class="lbl" style="margin-top:30px">{h}</h2><ul class="credits">' + "".join(f"<li><span>{a}</span><span>{b}</span></li>" for a, b in items) + "</ul>" for h, items in CREDITS)
    body = f"""<span class="pno">Credits · standing on shoulders</span>
  <h1>What this workshop <span class="gold-text">runs on</span></h1>
  <p class="tagline">Mentifaber's own work is all rights reserved. These parts are other people's, used under their licences and terms, with thanks.</p>
  {rows}
  <p class="fine" style="margin-top:30px">The full list with versions is in THIRD_PARTY_NOTICES.md alongside the code. Something missing or credited wrongly? Write to <a href="mailto:anders@mentifaber.org">anders@mentifaber.org</a>.</p>"""
    css = "<style>.credits{list-style:none;margin:10px 0 0;padding:0}.credits li{display:flex;justify-content:space-between;gap:18px;padding:9px 0;border-top:1px solid var(--line)}.credits li span:last-child{color:var(--dim,#8d877a);text-align:right}@media(max-width:600px){.credits li{flex-direction:column;gap:2px}.credits li span:last-child{text-align:left}}</style>"
    return plain("credits.html", "Credits · Mentifaber", "The libraries, data, maps, fonts and AI models Mentifaber runs on, and their licences.", "Credits", body, css)


def notfound():
    import random
    pick = [a for a in ORDER if a["status"] in ("live", "music")]
    body = f"""<span class="pno">404 · not on the plan</span>
  <h1>This room was never <span class="gold-text">built</span></h1>
  <p class="tagline">Nothing stands here: maybe it moved, maybe it was never drawn. These benches are real, though.</p>
  <ul class="benches adj" id="lost">{"".join(bench(a) for a in pick)}</ul>
  <div class="acts" style="margin-top:22px"><a class="key pri big" href="./">Back to the workshop</a><button class="key big" data-find>Find a bench</button></div>"""
    shuffle = '<script>(function(){var u=document.getElementById("lost"),l=[].slice.call(u.children);l.sort(function(){return Math.random()-.5});u.innerHTML="";l.slice(0,6).forEach(function(x){u.appendChild(x)})})()</script>'
    return plain("404.html", "Not on the plan · Mentifaber", "This page isn't on the workshop's plan.", "404 · not on the plan", body, shuffle, base='<base href="/">')


def lexicon():
    """The lexicon: every term coined in this work, defined, dated and sourced (tools/site/lexicon.json). Each term has its
    own anchor (lexicon#verel), and the page carries schema.org DefinedTermSet data so search engines read them as terms
    that originate here. Adding a word is adding an entry to the JSON and running the build."""
    import re
    L = json.load(open(os.path.join(os.path.dirname(__file__), "lexicon.json"), encoding="utf-8"))
    terms = sorted([t for t in L["terms"] if not t.get("draft")], key=lambda t: t["word"].lower())  # drafts stay off the page until they're adopted
    plain = lambda h: re.sub(r"<[^>]+>", "", h)
    base = "https://mentifaber.org/lexicon"
    ld = {"@context": "https://schema.org", "@type": "DefinedTermSet", "@id": base, "name": L["title"], "url": base,
          "creator": {"@type": "Person", "name": L["author"]}, "dateModified": L["revised"],
          "hasDefinedTerm": [{"@type": "DefinedTerm", "@id": base + "#" + t["id"], "name": t["word"], "termCode": t["id"], "url": base + "#" + t["id"],
                              "description": plain(t["senses"][0]["text"]), "inDefinedTermSet": base} for t in terms]
          + [{"@type": "DefinedTerm", "@id": base + "#" + x["id"], "name": x["pos"], "termCode": x["id"], "url": base + "#" + x["id"], "description": plain(x["text"]),
              "inDefinedTermSet": base, "subjectOf": base + "#" + t["id"]} for t in terms for x in t["senses"] if x.get("id")]}
    if L.get("doi"): ld["identifier"] = "https://doi.org/" + L["doi"]
    when = lambda d: datetime.date.fromisoformat(d).strftime("%-d %B %Y")
    def ety(t):
        e = t["ety"]
        if e.get("coined"): return f'<div class="formula"><span class="lbl">Etymology</span><p class="roots">A coinage, with no source roots.</p><small>{e["note"]}</small></div>'
        parts = '<span class="op">+</span>'.join(f'<span class="root"><i>{esc(p[0])}</i><small>{esc(p[1])} · {esc(p[2])}</small></span>' for p in e["parts"])
        return f'<div class="formula"><span class="lbl">Etymology</span><p class="roots">{parts}</p><small>{e.get("note", "")}</small></div>'
    def entry(n, t):
        senses = "".join(f'<li{" id=" + chr(34) + s["id"] + chr(34) if s.get("id") else ""}><span class="pos">{esc(s["pos"])}{"<small>" + esc(s["kind"]) + "</small>" if s.get("kind") else ""}</span><p>{s["text"]}</p></li>' for s in t["senses"])
        ex = "".join(f'<blockquote class="ex">“{esc(x)}”</blockquote>' for x in t.get("examples", []))
        notes = ("<h4 class=\"lbl\">Usage notes</h4><ul class=\"notes\">" + "".join(f"<li>{x}</li>" for x in t["notes"]) + "</ul>") if t.get("notes") else ""
        rec = "".join(f"<dt>{esc(k)}</dt><dd>{v}</dd>" for k, v in t["record"])
        see = " · ".join(f'<a href="{esc(h)}">{esc(k)}</a>' for k, h in t.get("see", []))
        cite = f'{L["author"].split()[-1]}, {L["author"].split()[0][0]}. ({L["revised"][:4]}). {t["word"]}. In {L["title"]}. {base}#{t["id"]}'
        return f"""<article class="lx-entry" id="{t["id"]}" data-q="{esc((t["word"] + " " + " ".join(plain(s["text"]) + " " + s["pos"] for s in t["senses"]) + " " + plain(t["ety"].get("note", "")) + " " + " ".join(" ".join(x) for x in t["ety"].get("parts", []))).lower())}">
      <header><span class="pno">L·{n:02d}</span><h2 class="headword"><a href="#{t["id"]}">{esc(t["word"])}</a></h2>
        <p class="say"><span class="ipa">{esc(t["ipa"])}</span><span class="resp">{esc(t["say"])}</span></p></header>
      {ety(t)}
      <ol class="senses">{senses}</ol>
      {ex}{notes}
      <dl class="rec">{rec}{f"<dt>See also</dt><dd>{see}</dd>" if see else ""}</dl>
      <div class="acts"><button class="key" data-cite="{esc(cite)}">Copy citation</button><button class="key" data-link="{base}#{t["id"]}">Copy link</button></div>
    </article>"""
    idx = "".join(f'<li><a href="#{t["id"]}"><b>{esc(t["word"])}</b><small>{esc(t["senses"][0]["pos"])} · {esc(plain(t["senses"][0]["text"]))}</small></a></li>' for t in terms)
    att = L.get("attestations") or []
    att_html = ("<table class=\"specs att\"><tr><th>Date</th><th>Term</th><th>Who</th><th>Where</th><th>Quote</th></tr>" + "".join(
        f'<tr><td>{esc(a["date"])}</td><td><a href="#{esc(a["term"])}">{esc(a["term"])}</a></td><td>{esc(a["author"])}</td><td><a href="{esc(a["url"])}">{esc(a["where"])}</a></td><td>“{esc(a["quote"])}”</td></tr>' for a in att) + "</table>"
        if att else '<p class="prose">None logged yet. When someone other than the coiner uses one of these words in durable, published work (a paper, a book, an article, an archived post), it is recorded here with the date and the quote. If you have used one, write to <a href="mailto:anders@mentifaber.org">anders@mentifaber.org</a>.</p>')
    revs = "".join(f"<li><b>{when(d)}</b> {t}</li>" for d, t in L.get("revisions", []))
    cite_all = f'{L["author"].split()[-1]}, {L["author"].split()[0][0]}. ({L["revised"][:4]}). <em>{esc(L["title"])}</em>. <code>{base}</code>' + (f' · <a href="https://doi.org/{esc(L["doi"])}">doi.org/{esc(L["doi"])}</a>' if L.get("doi") else "")
    body = f"""<main class="lex">
  <aside class="lex-side"><div class="stick">
    <span class="pno">Lexicon · {len(terms)} term{"s" if len(terms) != 1 else ""}</span>
    <h1>The <span class="gold-text">Lexicon</span></h1>
    <p class="tagline">{L["intro"]}</p>
    <label class="lex-q"><span class="lbl">Find a word</span><input type="search" placeholder="a word, or what it means" aria-label="Find a word"></label>
    <ol class="lex-idx">{idx}</ol>
    <p class="lbl lex-rev">Last revised {when(L["revised"])}</p>
  </div></aside>
  <section class="lex-body" aria-label="Entries">
    {"".join(entry(n + 1, t) for n, t in enumerate(terms))}
    <p class="prose lex-none" hidden>No word matches that.</p>
    <section class="sec"><h2><i>A</i>Seen elsewhere</h2><div>{att_html}</div></section>
    <section class="sec"><h2><i>B</i>Revisions</h2><div><ul class="revs">{revs}</ul></div></section>
    <section class="sec"><h2><i>C</i>To cite</h2><div><p class="prose">{cite_all}</p><p class="prose fine">Each entry has its own address (<code>/lexicon#verel</code>) and its own citation above. The roots of a compound are documented in the usual dictionaries; what this page fixes is the compound, its meaning and its date.</p></div></section>
  </section>
</main>"""
    title = "Lexicon · " + ", ".join(t["word"] for t in terms) + " · Mentifaber"
    page_ = f"""{head(title, "Canonical definitions, etymology and coinage record for the terms coined in the Mentifaber practice: " + ", ".join(t["word"] for t in terms) + ".", og="https://mentifaber.org/assets/brand/og.jpg")}
<body class="wk lex-page">
{titleblock('<nav class="tb-crumb" aria-label="Where you are"><a href="./">The workshop</a><a href="#" aria-current="page">Lexicon</a></nav>', 0, "—", "")}
{body}
<div class="find" role="dialog" aria-modal="true" aria-label="Find a project"><div class="box"><div class="find-top"><input type="search" placeholder="Find a bench…" aria-label="Find a bench"><button class="find-x" type="button" aria-label="Close">✕</button></div><ol></ol></div></div>
<script type="application/json" id="wk-index">{index_json()}</script>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False, indent=1)}</script>
<script src="assets/ui/plan.js?v={ver("assets/ui/plan.js")}" defer></script>
</body>
</html>
"""
    page_ = page_.replace("<head>", '<head>\n<link rel="canonical" href="' + base + '">', 1)
    open(os.path.join(ROOT, "lexicon.html"), "w", encoding="utf-8").write(page_)
    return "lexicon.html"


# new names, old addresses: each renamed project keeps its page and app where they were (installed apps and links keep
# working) and gets a short address under its new name that forwards there
ALIASES = {"nobody": "pi", "eightysixty": "roku", "phosphor": "roku", "hopline": "meshnet", "skipline": "novarac", "bodywake": "proximity", "moodfield": "neural-sim",
           "balloon": "bubble-editor", "per-capita": "crime-dashboard", "overhead": "orbit", "unlit": "conflict-atlas", "synodic": "moon-compatibility",
           "autofaber": "hive", "fabe": "hive", "genesis": "hive"}


def aliases():
    for new, old in ALIASES.items():
        a = A[old]; to = "/" + (a["href"] if a.get("href") else old + ".html").removesuffix(".html")
        open(os.path.join(ROOT, new + ".html"), "w", encoding="utf-8").write(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>{esc(a["name"])} · Mentifaber</title>
<link rel="canonical" href="https://mentifaber.org{to}">
<script>location.replace("{to}" + location.search + location.hash)</script>
<meta http-equiv="refresh" content="0; url={to}">
</head>
<body style="background:#080705;color:#f1e8d4;font:16px system-ui;padding:24px"><a href="{to}" style="color:#f6dc94">{esc(a["name"])}</a></body>
</html>
""")
    return f"{len(ALIASES)} short addresses"
