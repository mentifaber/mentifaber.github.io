"""Mentifaber · THE WORKSHOP AT NIGHT. The home page is the workshop's floor plan in gold on black (six rooms off a corridor,
every project a bench, live instruments on the corridor wall); a project's page is that bench's datasheet, with the thing
itself running on it. Same registry and content as before; build.py calls home() and page().
Styles: assets/ui/plan.css · behaviour: assets/ui/plan.js (walls, lantern, walker, compass, find) + shell.js (install, suite)."""
import html, json, os, datetime
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
LAMP = {"live": "live", "music": "music", "private": "lock", "build": "build", "concept": "build", "stalled": ""}
STATUS = {"live": "live", "music": "music · live", "private": "private", "build": "being built", "concept": "a concept", "stalled": "paused"}
LOGO = '<img src="assets/brand/mentifaber-mark-96.png" alt="" width="52" height="52">'
FIND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>'
SUITE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6"/></svg>'
DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>'
SHEETS = len([a for a in ORDER if B.has_page(a["id"])]) + 1


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
    man = f'assets/manifests/{a["id"]}.webmanifest' if a and a.get("app") else ("assets/manifests/mentifaber.webmanifest" if not a else "")
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
  <dl class="tb-meta"><div><dt>Sheet</dt><dd>{f"{sheet:02d} / {SHEETS:02d}" if sheet else "—"}</dd></div><div><dt>Grid</dt><dd class="at">{at}</dd></div><div><dt>Drawn</dt><dd>Anders</dd></div><div><dt>Date</dt><dd>{today}</dd></div></dl>
  <div class="tb-act"><button class="key" data-find aria-label="Find a project">{FIND}<span>Find</span></button>{acts}</div>
</header>"""


def bench(a, here=False):
    st = STATUS.get(a["status"], a["status"])
    return (f'<li><a class="bench{" feat" if a["id"] in FEAT else ""}{" here" if here else ""}" href="{esc(href(a))}" style="--h:{a["hue"]}" data-pn="{pno(a)}" data-st="{esc(st)}" data-desc="{esc(a["desc"])}" data-room="{esc(NAMES[a["cat"]][0])}">'
            f'{glyph(a)}<b>{esc(a["name"])}</b><i class="lamp {LAMP.get(a["status"], "")}" title="{esc(st)}"></i><small>{esc(short(a))}</small></a></li>')


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
    L = ORDER; live = sum(1 for a in L if a["status"] in ("live", "music"))
    title = "Mentifaber · builder of minds and the systems that hold them"
    desc = f"{len(L)} projects by Anders: AI swarms and agents, private messengers, live atlases of the sky and the world, local-first tools and games, drawn as the workshop they're built in."
    say = f'<p class="tb-say"><span><b>Builder of minds and the systems that hold them.</b> {len(L)} things on the benches of one workshop, {live} of them running right now. Walk in and point at a bench: someone will take you there.</span></p>'
    acts = f'<button class="key" data-suite aria-label="Install the suite">{SUITE}<span>Suite</span></button><button class="key" data-install hidden>{DOWN}<span>Install</span></button>'
    X, Y = "ABCDEFGH", "12345"
    page_ = f"""{head(title, desc, og="https://mentifaber.org/assets/brand/og.jpg")}
<body class="wk home">
{titleblock(say, 1, "—", acts)}
<div class="drawing">
  {refs("x", X)}{refs("y", Y)}{refs("x b", X)}{refs("y r", Y)}
  <main class="plan" aria-label="The workshop, plan">
    <div class="floor">
      <div class="lantern" aria-hidden="true"></div>
      <div class="row top">{"".join(room(k) for k in LAYOUT[0])}</div>
      <div class="hall"><div class="entry"><img src="assets/brand/mentifaber-mark-96.png" alt="" width="44" height="44"><span class="in">IN</span><p>MENS · FABER</p></div><div class="instruments" aria-label="Instruments: live readings">{instruments(k for k, _ in NOW)}</div></div>
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
  <div><h3>Elsewhere</h3><div class="elsewhere"><a href="atlas.html">The atlas</a><a href="atlas-classic.html">Classic atlas</a><a href="widgets/">Home-screen widgets</a><a href="wx/">Quick weather</a><a href="contact.html">Contact</a><a href="https://x.com/mentifaber">X</a><a href="https://instagram.com/mentifaber">Instagram</a><a href="https://soundcloud.com/sonicveil">SoundCloud</a></div>
    <p class="copy">© Mentifaber · mens, faber: a mind, a maker</p></div>
</footer>
<div class="note" aria-hidden="true"><div class="card"><span class="lbl"></span><h4></h4><p></p><div class="go">click: walk in →</div></div></div>
<div class="find" role="dialog" aria-label="Find a project"><div class="box"><input type="search" placeholder="Find a bench…" aria-label="Find a bench"><ol></ol></div></div>
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
    return f'<figure class="keyplan"><svg viewBox="-10 0 {W + 11} {top + hall + bot + 1}" role="img" aria-label="Key plan: where {esc(a["name"])} is in the workshop">{"".join(out)}</svg><figcaption class="lbl">Key plan · room {ROOMNO[a["cat"]]:02d}, {esc(NAMES[a["cat"]][0])}</figcaption></figure>'


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
            ("Made with", esc(" · ".join(stack[:8]))) if stack else None]
    specs = "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in [r for r in rows if r])
    st = {"live": "live", "music": "music", "private": "lock"}.get(a["status"], "build")
    feats = "".join(f'<li><b>{esc(f["t"])}</b><span>{B.cap(f["d"])}</span></li>' for f in c.get("features", []))
    cards = "".join(f'<div class="prose part"><h3>{esc(x["n"]).capitalize()}</h3>{x["html"]}{"<div class=stack>" + "".join(f"<span>{esc(s)}</span>" for s in x.get("stack", [])) + "</div>" if x.get("stack") else ""}</div>' for x in c.get("cards", []))
    near = [x for x in ORDER if x["cat"] == a["cat"] and x["id"] != i][:6]
    k_ = ORDER.index(a); prv, nxt = ORDER[k_ - 1], ORDER[(k_ + 1) % len(ORDER)]
    crumb = f'<nav class="tb-crumb" aria-label="Where you are"><a href="./">The workshop</a><a href="./#{a["cat"]}">Room {ROOMNO[a["cat"]]:02d} · {esc(n)}</a><a href="#" aria-current="page">{pno(a)} · {esc(a["name"])}</a></nav>'
    k = [0]
    def S(t, body):
        k[0] += 1; return f'<section class="sec"><h2><i>{k[0]:02d}</i>{t}</h2><div>{body}</div></section>'
    story = c.get("story") or {}
    body = "".join([
        S("Why it exists", (f'<h3 class="story">{story["title"]}</h3>' if story.get("title") else "") + f'<div class="prose">{c.get("lede", "")}</div>') if c.get("lede") else "",
        S("Views", '<div class="figs">' + "".join(f'<figure class="fig{" tall" if f.get("tall") else ""}"><a href="{esc(f["src"])}" target="_blank" rel="noopener" aria-label="Open full size"><img src="{esc(f["src"])}" alt="{esc(a["name"])}: {esc(f["cap"])}" loading="lazy"></a><figcaption class="lbl">Fig. {n_ + 2} · {esc(f["cap"])}</figcaption></figure>' for n_, f in enumerate(c["figs"])) + "</div>") if c.get("figs") else "",
        S("Parts list", f'<ol class="bom">{feats}</ol>' + (f'<p class="prose" style="margin-top:14px">{c["featuresNote"]}</p>' if c.get("featuresNote") else "")) if feats else "",
        S("Instruments", f'<div class="instr">{instruments(c["widgets"])}</div>') if c.get("widgets") else "",
        S("Construction", cards) if cards else "",
        S("Tolerances", f'<div class="prose">{c["scope"]}</div><p class="lbl" style="margin-top:6px">what it is not, said plainly</p>') if c.get("scope") else "",
        S("Inscription", f'<p class="closing gold-text">{c.get("closing", "")}</p>') if c.get("closing") else "",
        S("The same room", f'<ul class="benches adj">{"".join(bench(x) for x in near)}</ul>') if near else "",
    ])
    if app: acts = f'<button class="key pri big" data-power>Power on</button><a class="key big" href="{esc(app)}">Full screen</a><button class="key big" data-install hidden>{DOWN}Install</button>'
    elif op and op != a.get("href"): acts = f'<a class="key pri big" href="{esc(op)}">Open</a>'
    else: acts = ""
    piece = (f"""<figure class="piece" data-app="{esc(app or "")}">
      <span class="dimw" aria-hidden="true"><span>workpiece · {esc(a["name"])}</span></span><span class="dimh" aria-hidden="true"><span>{"live" if app else "as built"}</span></span>
      <div class="frame"><div style="background-image:url('{esc(shot)}')">{'<button class="key pri big power" data-power>Power on</button>' if app else ""}</div></div>
      <figcaption><span>Fig. 1 · {esc(a["name"])}, {"on the bench: power it on to run it here" if app else "as it stands"}</span><span>{pno(a)}</span></figcaption>
    </figure>""") if shot else ""
    cfg = json.dumps({"id": i, "name": a["name"], "app": app, "h": a["hue"]})
    page_ = f"""{head(title, desc, a, og)}
<body class="wk sheet-page" style="--h:{a["hue"]}">
{titleblock(crumb, k_ + 2, pno(a), "")}
<main class="ds">
  <aside class="spec"><div class="stick">
    <span class="pno">{pno(a)} · {esc(n)}</span>
    <h1 style="--vt:bench-name">{esc(a["name"])}</h1>
    <span class="tag {st}">{esc(STATUS.get(a["status"], a["status"]))}</span>
    <p class="tagline">{c.get("tagline", "")}</p>
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
<div class="find" role="dialog" aria-label="Find a project"><div class="box"><input type="search" placeholder="Find a bench…" aria-label="Find a bench"><ol></ol></div></div>
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
<div class="find" role="dialog" aria-label="Find a project"><div class="box"><input type="search" placeholder="Find a bench…" aria-label="Find a bench"><ol></ol></div></div>
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
      <button type="button" class="chip" aria-pressed="false">Work / commission</button><button type="button" class="chip" aria-pressed="false">Music</button><button type="button" class="chip" aria-pressed="false">Bug report</button></div></div>
    <label>Message<textarea id="msg" maxlength="2000" placeholder="A couple of lines is plenty."></textarea></label>
    <div class="count lbl" id="count">0 / 2000</div>
    <input class="hp" id="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="acts"><button class="key pri big" type="submit">Send message</button><span class="status" id="status" role="status"></span></div>
    <p class="fine">Sending opens your own email app with everything filled in: nothing is stored on this site, and no third party sees it. If nothing opens, copy the address above.</p>
  </form>
  <h2 class="lbl" style="margin-top:34px">Elsewhere</h2>
  <div class="elsewhere big"><a href="https://x.com/mentifaber" target="_blank" rel="noopener">X · @mentifaber</a><a href="https://instagram.com/mentifaber" target="_blank" rel="noopener">Instagram · @mentifaber</a><a href="https://soundcloud.com/sonicveil" target="_blank" rel="noopener">SoundCloud · Sonic Veil</a></div>"""
    js = open(os.path.join(os.path.dirname(__file__), "contact.js.part"), encoding="utf-8").read()
    return plain("contact.html", "Contact · Mentifaber", "Write to Mentifaber: send a quick note or email anders@mentifaber.org.", "Correspondence", body, js)


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
