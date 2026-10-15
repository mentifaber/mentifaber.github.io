"""Mentifaber 3 · THE WORKSHOP (prototype). The home page as the workshop's floor plan and a project page as that part's
datasheet, from the same registry and content as build.py. Writes next.html and next-<id>.html at the site root.
    python3 tools/site/next.py [ids…]   (default: the floor plan, plus datasheets for a few benches)"""
import html, json, os, re, sys, datetime
from registry import ROOT, apps, CATS
sys.path.insert(0, os.path.dirname(__file__))
from build import A, CONTENT, links, preview, ver, NOW, status_chip

esc = lambda t: html.escape(str(t or ""), quote=True)
# the mark: a gunmetal plate with the type's two 45° chamfers, the M engraved with bevelled (chamfered) joins, an inspection mark
MARK = ('<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 3.5H60.5V47L47 60.5H3.5V17z" fill="#16191d" stroke="#d9dde2" stroke-width="2.4" stroke-linejoin="bevel"/>'
        '<path d="M18.2 7.5H56.5V45.4L45.4 56.5H7.5V18.2z" fill="none" stroke="#d9dde2" stroke-opacity=".22" stroke-width=".9" stroke-linejoin="bevel"/>'
        '<path d="M18.5 45V20.5L32 34 45.5 20.5V45" fill="none" stroke="#eef0f2" stroke-width="4.4" stroke-linecap="square" stroke-linejoin="bevel"/>'
        '<rect x="29.6" y="44.6" width="4.8" height="4.8" fill="#ff6a1a" transform="rotate(45 32 47)"/></svg>')
DOOR = '<span class="door" aria-hidden="true"><svg viewBox="0 0 42 42"><path d="M0 42V0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M0 0A42 42 0 0 1 42 42" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/></svg></span>'
LAYOUT = [["signals", "ai", "world"], ["tools", "play", "craft"]]  # three rooms above the corridor, three below
ROOMNO = {k: i + 1 for i, k in enumerate(LAYOUT[0] + LAYOUT[1])}  # numbered as you'd walk the plan: the top row, then the bottom
NAMES = {k: (n, b) for k, n, b in CATS}
L = list(A.values())
LAMP = {"live": "live", "music": "music", "private": "lock", "build": "build", "concept": "build", "stalled": ""}
STATUS = {"live": "live", "music": "music · live", "private": "private", "build": "being built", "concept": "a concept", "stalled": "paused"}
THEME = '<script>try{var t=localStorage.getItem("mf:theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>'
FIND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>'
SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg>'
DATASHEETS = ["pilotfish", "hive", "orbit", "tether"]  # the prototype's benches with a datasheet (the rest still open their current page)

def pno(a):  # part number: room · bench
    xs = [x for x in L if x["cat"] == a["cat"]]
    return f"MF-{ROOMNO[a['cat']]:02d}·{xs.index(a) + 1:02d}"
def sheet_for(i): return f"next-{i}.html" if i in DATASHEETS else (A[i].get("href") or i + ".html")
def glyph(a): return f'<svg class="g" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="bevel" aria-hidden="true">{a["glyph"]}</svg>'

def head(title, desc):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0e1012">
<link rel="icon" href="assets/brand/mark.svg" type="image/svg+xml">
<link rel="preload" href="assets/fonts/MentifaberDisplay-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/SchibstedGrotesk-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/ui/next.css?v={ver("assets/ui/next.css")}">
{THEME}
</head>"""

def titleblock(middle):
    today = datetime.date.today().strftime("%d.%m.%Y")
    return f"""<header class="tb">
  <a class="tb-mark" href="next.html" aria-label="The workshop">{MARK}</a>
  <a class="tb-name" href="next.html"><b>MENTIFABER</b><span>The workshop · plan at bench height</span></a>
  {middle}
  <dl class="tb-meta"><div><dt>Sheet</dt><dd>01 / 01</dd></div><div><dt>Rev</dt><dd>3.0</dd></div><div><dt>Drawn</dt><dd>Anders</dd></div><div><dt>Date</dt><dd>{today}</dd></div></dl>
  <div class="tb-act"><button class="key" data-find aria-label="Find a project">{FIND}<span>Find</span></button><button class="key" data-theme-toggle aria-label="Light or dark">{SUN}<span>Light</span></button></div>
</header>"""

def bench(a):
    op, ab = links(a); href = sheet_for(a["id"]) if a["id"] in DATASHEETS else (ab or op or "#")
    return (f'<li><a class="bench" href="{esc(href)}" style="--h:{a["hue"]}" data-pn="{pno(a)}" data-st="{esc(STATUS.get(a["status"], a["status"]))}" data-desc="{esc(a["desc"])}" data-room="{esc(NAMES[a["cat"]][0])}">'
            f'{glyph(a)}<b>{esc(a["name"])}</b><i class="lamp {LAMP.get(a["status"], "")}" title="{esc(STATUS.get(a["status"], a["status"]))}"></i><small>{esc(a["desc"].split(" — ")[0].split(". ")[0])}</small></a></li>')

def room(k):
    xs = [a for a in L if a["cat"] == k]; n, b = NAMES[k]
    return (f'<section class="room" id="{k}" aria-labelledby="r-{k}">{DOOR}<span class="dim" aria-hidden="true"><span>{len(xs)} benches</span></span>'
            f'<header><span class="rn">{ROOMNO[k]:02d}</span><h2 id="r-{k}">{esc(n)}</h2><p>{esc(b)}</p></header><ul class="benches">{"".join(bench(a) for a in xs)}</ul></section>')

def home():
    live = sum(1 for a in L if a["status"] in ("live", "music"))
    say = f'<p class="tb-say"><span><b>Builder of minds and the systems that hold them.</b> {len(L)} things on the benches of one workshop: {live} running right now. Walk in, pick a bench; each one opens on its own datasheet with the thing itself running on it.</span></p>'
    inst = "".join(f'<a class="w" data-w="{k}" data-label="{esc(t)}"><span class="wl">{esc(t)}</span><div class="wv">&nbsp;</div><div class="ws">&nbsp;</div></a>' for k, t in NOW)
    index = json.dumps([{"n": a["name"], "d": a["desc"], "h": sheet_for(a["id"]) if a["id"] in DATASHEETS else (links(a)[1] or links(a)[0] or "#"), "p": pno(a), "s": STATUS.get(a["status"], a["status"]), "r": NAMES[a["cat"]][0]} for a in L], ensure_ascii=False)
    page = f"""{head("Mentifaber · the workshop", "The workshop of Anders: AI swarms and agents, private messengers, live atlases of the sky and the world, local-first tools and games, drawn as the place they're built in.")}
<body class="nx" style="--h:22">
{titleblock(say)}
<main class="plan" aria-label="The workshop, plan">
  <div class="floor">
    <div class="row top">{"".join(room(k) for k in LAYOUT[0])}</div>
    <div class="hall"><div class="entry"><span class="in">IN</span><p>MENS · FABER</p></div><div class="instruments" aria-label="Instruments: live readings">{inst}</div></div>
    <div class="row bot">{"".join(room(k) for k in LAYOUT[1])}</div>
  </div>
</main>
<footer class="sheetnotes">
  <div><h3>Notes</h3><ol>
    <li>Every bench is a working thing. Its datasheet runs it in place: press <b>Power on</b>.</li>
    <li>The instruments on the corridor wall read live feeds: your weather, the Moon, the ISS, the ground, the markets, the swarm.</li>
    <li>Some benches are private: they belong to the people they were made for, and say so.</li>
    <li>Prefer it as a flight? <a href="atlas.html">The atlas</a> shows every project in 3D.</li>
    <li>Questions about a project, a lathe, a radio or a mind: <a href="mailto:anders@mentifaber.org">anders@mentifaber.org</a> · <a href="contact.html">contact</a></li>
  </ol></div>
  <div><h3>Legend</h3><div class="legend"><span><i class="lamp live"></i>running, open to anyone</span><span><i class="lamp lock"></i>private: made for someone</span><span><i class="lamp build"></i>being built, or a concept</span><span><i class="lamp music"></i>music</span><span><i class="lamp"></i>paused</span></div></div>
</footer>
<aside class="detail" aria-hidden="true"><div><span class="lbl"></span><h4></h4><p></p></div></aside>
<div class="find" role="dialog" aria-label="Find a project"><div class="box"><input type="search" placeholder="Find a bench…" aria-label="Find a bench"><ol></ol></div></div>
<script type="application/json" id="nx-index">{index}</script>
<script src="assets/ui/next.js?v={ver("assets/ui/next.js")}" defer></script>
<script src="assets/ui/widgets.js?v={ver("assets/ui/widgets.js")}" defer></script>
</body>
</html>
"""
    open(os.path.join(ROOT, "next.html"), "w", encoding="utf-8").write(page)
    return "next.html"

def datasheet(i):
    a, c = A[i], json.load(open(os.path.join(CONTENT, i + ".json"), encoding="utf-8"))
    n, _ = NAMES[a["cat"]]; op, _ = links(a); shot = c.get("shot") or preview(i)
    stack = []; [stack.append(s) for x in c.get("cards", []) for s in x.get("stack", []) if s not in stack]
    caps = c.get("caps", [])
    rows = [("Part no.", pno(a)), ("Room", f'<a href="next.html#{a["cat"]}">{ROOMNO[a["cat"]]:02d} · {esc(n)}</a>'), ("Status", esc(STATUS.get(a["status"], a["status"]))),
            ("Does", esc(", ".join(caps))) if caps else None, ("Runs as", esc(c.get("launchSub", ""))) if c.get("launchSub") else None,
            ("Made with", esc(" · ".join(stack[:8]))) if stack else None, ("On the bench", esc(a.get("added", ""))) if a.get("added") else None]
    specs = "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in [r for r in rows if r])
    st = {"live": "live", "music": "music", "private": "lock"}.get(a["status"], "build")
    feats = "".join(f'<li><b>{esc(f["t"])}</b><span>{f["d"]}</span></li>' for f in c.get("features", []))
    cards = "".join(f'<div class="prose" style="margin-bottom:14px"><h3>{esc(x["n"]).capitalize()}</h3>{x["html"]}{"<div class=stack>" + "".join(f"<span>{esc(s)}</span>" for s in x.get("stack", [])) + "</div>" if x.get("stack") else ""}</div>' for x in c.get("cards", []))
    near = [x for x in L if x["cat"] == a["cat"] and x["id"] != i][:6]
    adj = "".join(bench(x) for x in near)
    crumb = f'<nav class="tb-crumb" aria-label="Where you are"><a href="next.html">The workshop</a><a href="next.html#{a["cat"]}">Room {ROOMNO[a["cat"]]:02d} · {esc(n)}</a><a href="#" aria-current="page">{pno(a)} · {esc(a["name"])}</a></nav>'
    app = a.get("app")
    sec = lambda no, t, body: f'<section class="sec"><h2><i>{no:02d}</i>{t}</h2><div>{body}</div></section>'
    k = [0]
    def S(t, body):
        k[0] += 1; return sec(k[0], t, body)
    body = "".join([
        S("Why it exists", f'<div class="prose">{c.get("lede", "")}</div>') if c.get("lede") else "",
        S("Parts list", f'<ol class="bom">{feats}</ol>') if feats else "",
        S("Construction", cards) if cards else "",
        S("Tolerances", f'<div class="prose">{c["scope"]}</div><p class="lbl" style="margin-top:6px">what it is not, said plainly</p>') if c.get("scope") else "",
        S("Inscription", f'<p class="closing">{c.get("closing", "")}</p>') if c.get("closing") else "",
        S("Next benches", f'<ul class="benches adj">{adj}</ul>') if adj else "",
    ])
    page = f"""{head(a["name"] + " · datasheet · Mentifaber", a["desc"])}
<body class="nx" style="--h:{a["hue"]}">
{titleblock(crumb)}
<main class="ds">
  <aside class="spec">
    <span class="pno">{pno(a)}</span>
    <h1 style="--n:{max(4, len(a["name"]))}">{esc(a["name"])}</h1>
    <span class="tag {st}">{esc(STATUS.get(a["status"], a["status"]))}</span>
    <p class="tagline">{c.get("tagline", "")}</p>
    <div class="acts">{f'<button class="key pri big" data-power>Power on</button><a class="key big" href="{esc(app)}">Full screen</a>' if app else (f'<a class="key pri big" href="{esc(op)}">Open</a>' if op else "")}</div>
    <table class="specs">{specs}</table>
  </aside>
  <section class="work" aria-label="{esc(a["name"])}, on the bench">
    <figure class="piece" data-app="{esc(app or "")}">
      <span class="dim w" aria-hidden="true"><span>workpiece · {esc(a["name"])}</span></span><span class="dim h" aria-hidden="true"><span>live</span></span>
      <div class="frame"><div style="background-image:url('{esc(shot)}')">{f'<button class="key pri big power" data-power>Power on</button>' if app else ""}</div></div>
      <figcaption><span>Fig. 1 · {esc(a["name"])}, {"running on the bench" if app else "as it stands"}</span><span>{pno(a)}</span></figcaption>
    </figure>
    {body}
  </section>
</main>
<div class="find" role="dialog" aria-label="Find a project"><div class="box"><input type="search" placeholder="Find a bench…" aria-label="Find a bench"><ol></ol></div></div>
<script type="application/json" id="nx-index">{json.dumps([{"n": x["name"], "d": x["desc"], "h": sheet_for(x["id"]) if x["id"] in DATASHEETS else (links(x)[1] or links(x)[0] or "#"), "p": pno(x), "s": STATUS.get(x["status"], x["status"]), "r": NAMES[x["cat"]][0]} for x in L], ensure_ascii=False)}</script>
<script src="assets/ui/next.js?v={ver("assets/ui/next.js")}" defer></script>
</body>
</html>
"""
    out = f"next-{i}.html"; open(os.path.join(ROOT, out), "w", encoding="utf-8").write(page); return out

if __name__ == "__main__":
    print("built", home())
    for i in (sys.argv[1:] or DATASHEETS): print("built", datasheet(i))
