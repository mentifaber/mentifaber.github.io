"""Every app icon, drawn here: one idea per app, its own palette and composition, poster-bold at 48 px and rich at 512.
Writes tools/site/icons/<id>.svg (the source build.py and raster.js turn into every size).
    python3 tools/site/icon_studio.py [ids…]
Shared: a fine film grain, soft drop shadows, and a light from the top left. Everything else is the app's own."""
import math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "tools/site/icons")


def lg(i, *stops, x1=0, y1=0, x2=0, y2=1):
    s = "".join(f'<stop offset="{o}" stop-color="{c}"' + (f' stop-opacity="{a}"' if a is not None else "") + "/>" for o, c, a in [(t + (None,))[:3] for t in stops])
    return f'<linearGradient id="{i}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{s}</linearGradient>'


def rg(i, *stops, cx=.5, cy=.5, r=.5, fx=None, fy=None):
    s = "".join(f'<stop offset="{o}" stop-color="{c}"' + (f' stop-opacity="{a}"' if a is not None else "") + "/>" for o, c, a in [(t + (None,))[:3] for t in stops])
    f = (f' fx="{fx}" fy="{fy}"' if fx is not None else "")
    return f'<radialGradient id="{i}" cx="{cx}" cy="{cy}" r="{r}"{f}>{s}</radialGradient>'


COMMON = ('<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/>'
          '<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>'
          '<filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity=".38"/></filter>'
          '<filter id="sh2" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".3"/></filter>'
          '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
          '<filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter><filter id="blur20"><feGaussianBlur stdDeviation="20"/></filter>'
          '<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>')


def svg(defs, body, grain=.07, sheen=True):
    g = f'<rect width="512" height="512" fill="#808080" filter="url(#grain)" opacity="{grain}" style="mix-blend-mode:overlay"/>' if grain else ""
    s = '<rect width="512" height="256" fill="url(#sheen)" opacity=".5"/>' if sheen else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n<defs>{COMMON}{defs}</defs>\n{body}\n{s}{g}\n</svg>\n'


def poly(cx, cy, r, n, rot=0):
    return " ".join(f"{cx + r * math.cos(rot + k * 2 * math.pi / n):.1f},{cy + r * math.sin(rot + k * 2 * math.pi / n):.1f}" for k in range(n))


def star(cx, cy, r1, r2, n, rot=-math.pi / 2):
    return " ".join(f"{cx + (r1 if k % 2 == 0 else r2) * math.cos(rot + k * math.pi / n):.1f},{cy + (r1 if k % 2 == 0 else r2) * math.sin(rot + k * math.pi / n):.1f}" for k in range(2 * n))


ICONS = {}
def icon(f): ICONS[f.__name__.replace("_", "-")] = f; return f


# ── Be Not Afraid: the wheel within a wheel, full of eyes ──────────────────────────────────────────────────────────────
@icon
def angels():
    eye = lambda x, y, s, rot: (f'<g transform="translate({x:.1f} {y:.1f}) rotate({rot:.1f}) scale({s})"><path d="M-20 0Q0-16 20 0Q0 16-20 0Z" fill="#fff8e1" stroke="#a8661a" stroke-width="1.5"/>'
                                f'<circle r="7" fill="#1b1340"/><circle r="3" fill="#ffd36a"/><circle cx="-2" cy="-2" r="1.6" fill="#fff"/></g>')
    ring1 = "".join(eye(256 + 150 * math.cos(a), 256 + 150 * math.sin(a), 2.5, math.degrees(a) + 90) for a in [k * math.pi / 4 + math.pi / 8 for k in range(8)])
    ring2 = "".join(eye(256 + 60 * math.cos(a) , 256 + 150 * math.sin(a) * .0 + 150 * math.sin(a), .8, 0) for a in [])
    tilt = "".join(eye(256 + 92 * math.cos(a), 256 + 92 * math.sin(a) * .42, 1.1, 0) for a in [k * math.pi / 3 for k in range(6)])
    d = lg("an-bg", (0, "#2a1a6b"), (1, "#0b0620")) + rg("an-gl", (0, "#ffe08a", .8), (1, "#ffe08a", 0)) + lg("an-gold", (0, "#fff1b8"), (.5, "#f1b840"), (1, "#a8661a"))
    rays = "".join(f'<path d="M256 256L{256 + 300 * math.cos(a - .05):.0f} {256 + 300 * math.sin(a - .05):.0f}L{256 + 300 * math.cos(a + .05):.0f} {256 + 300 * math.sin(a + .05):.0f}Z" fill="#ffe08a" opacity=".07"/>' for a in [k * math.pi / 12 for k in range(24)])
    b = (f'<rect width="512" height="512" fill="url(#an-bg)"/>{rays}<circle cx="256" cy="256" r="200" fill="url(#an-gl)" opacity=".45"/>'
         f'<circle cx="256" cy="256" r="150" fill="none" stroke="url(#an-gold)" stroke-width="30" filter="url(#sh)"/><circle cx="256" cy="256" r="150" fill="none" stroke="#fff6d0" stroke-width="2" opacity=".6"/>'
         f'{ring1}<ellipse cx="256" cy="256" rx="92" ry="40" fill="none" stroke="url(#an-gold)" stroke-width="16" transform="rotate(-24 256 256)"/>'
         f'<g transform="rotate(-24 256 256)">{tilt}</g><circle cx="256" cy="256" r="26" fill="#fff4c8" filter="url(#glow)"/>{eye(256, 256, 1.9, 0)}')
    return svg(d, b)


# ── Mechanic's Arsenal: an engine in exploded view, one part flying out ────────────────────────────────────────────────
@icon
def arsenal():
    d = lg("ar-bg", (0, "#1d5fa8"), (1, "#0a2a55")) + lg("ar-st", (0, "#f4f8ff"), (.5, "#b8c8dc"), (1, "#6a7e98")) + lg("ar-or", (0, "#ffb15a"), (1, "#e8571c"))
    grid = "".join(f'<path d="M{x} 0V512" stroke="#bfe0ff" stroke-opacity=".12"/>' for x in range(0, 512, 32)) + "".join(f'<path d="M0 {y}H512" stroke="#bfe0ff" stroke-opacity=".12"/>' for y in range(0, 512, 32))
    pts = star(256, 256, 150, 120, 12, 0)
    half = lambda side, dx: (f'<clipPath id="ar-c{side}"><rect x="{0 if side < 0 else 256}" y="0" width="256" height="512"/></clipPath>'
                             f'<g transform="translate({dx} 0)" clip-path="url(#ar-c{side})" filter="url(#sh)"><polygon points="{pts}" fill="url(#ar-st)" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>'
                             f'<circle cx="256" cy="256" r="88" fill="none" stroke="#6a7e98" stroke-width="4"/><circle cx="256" cy="256" r="46" fill="#0a2a55" stroke="#fff" stroke-width="5"/></g>')
    bolt = lambda y, r: f'<g transform="translate(256 {y}) rotate({r})" filter="url(#sh2)"><polygon points="{poly(0, -18, 16, 6)}" fill="url(#ar-or)" stroke="#fff" stroke-width="3"/><rect x="-7" y="-4" width="14" height="40" rx="3" fill="url(#ar-or)"/>' + "".join(f'<path d="M-7 {6 + k * 8}L7 {2 + k * 8}" stroke="#a83a0a" stroke-width="2"/>' for k in range(4)) + "</g>"
    b = (f'<rect width="512" height="512" fill="url(#ar-bg)"/>{grid}{half(-1, -44)}{half(1, 44)}'
         f'<g stroke="#ffb15a" stroke-width="4" stroke-dasharray="8 8" stroke-linecap="round"><path d="M256 70V120M256 392V442"/><path d="M150 256H96M362 256H416"/></g>'
         f'{bolt(166, -16)}{bolt(320, 14)}'
         f'<g stroke="#e8f4ff" stroke-width="5" stroke-linecap="round"><path d="M86 236L66 256 86 276M426 236L446 256 426 276"/></g>')
    return svg(d, b)


# ── Ballast: a boat that sits level, its hull a calendar, on a calm sea at sunset ─────────────────────────────────────
@icon
def ballast():
    d = lg("ba-sky", (0, "#ff9e6b"), (.55, "#ffcf8a"), (1, "#ffe7b8")) + lg("ba-sea", (0, "#1f4d7a"), (1, "#0c2440")) + lg("ba-hull", (0, "#ffffff"), (1, "#dfe6f0"))
    cal = "".join(f'<rect x="{168 + c * 36}" y="{298 + r * 26}" width="26" height="18" rx="4" fill="{"#ff7a59" if (r, c) == (0, 3) else "#9db3cc"}"/>' for r in range(2) for c in range(5))
    b = (f'<rect width="512" height="512" fill="url(#ba-sky)"/><circle cx="256" cy="250" r="96" fill="#fff3d6" opacity=".9"/>'
         f'<rect y="330" width="512" height="182" fill="url(#ba-sea)"/>'
         f'<g stroke="#ffcf8a" stroke-width="6" stroke-linecap="round" opacity=".55"><path d="M90 372H190M300 372H430M140 410H250M320 410H380M200 448H320"/></g>'
         f'<path d="M256 108V276" stroke="#3b2a40" stroke-width="8"/><path d="M262 116L362 262H262Z" fill="#fff" stroke="#3b2a40" stroke-width="5" stroke-linejoin="round"/>'
         f'<path d="M250 140L170 262H250Z" fill="#ff7a59" stroke="#3b2a40" stroke-width="5" stroke-linejoin="round"/>'
         f'<g filter="url(#sh2)"><path d="M136 278H376L344 358H168Z" fill="url(#ba-hull)" stroke="#3b2a40" stroke-width="6" stroke-linejoin="round"/>{cal}</g>'
         f'<path d="M256 358V396" stroke="#3b2a40" stroke-width="10"/><path d="M232 396H280L270 420H242Z" fill="#3b2a40"/>'
         f'<path d="M150 346Q256 372 362 346" fill="none" stroke="#7fb0e0" stroke-width="4" opacity=".7"/>')
    return svg(d, b)


# ── Barycenter: two bodies around a shared centre, their orbits making one shape ──────────────────────────────────────
@icon
def barycenter():
    d = (rg("by-bg", (0, "#4a1660"), (.6, "#1a0a2e"), (1, "#07030f"), cx=.5, cy=.45, r=.75) + rg("by-a", (0, "#fff"), (.35, "#ffd0f0"), (1, "#ff4fb0"), fx=.35, fy=.35)
         + rg("by-b", (0, "#fff"), (.35, "#c8e8ff"), (1, "#4f9dff"), fx=.35, fy=.35))
    stars = "".join(f'<circle cx="{(k * 97) % 512}" cy="{(k * 211) % 512}" r="{1 + (k % 3) * .6}" fill="#fff" opacity="{.3 + (k % 4) * .15}"/>' for k in range(40))
    b = (f'<rect width="512" height="512" fill="url(#by-bg)"/>{stars}'
         f'<ellipse cx="216" cy="256" rx="140" ry="92" fill="none" stroke="#ff7ac8" stroke-width="5" opacity=".75" transform="rotate(-20 256 256)"/>'
         f'<ellipse cx="296" cy="256" rx="140" ry="92" fill="none" stroke="#7ab8ff" stroke-width="5" opacity=".75" transform="rotate(-20 256 256)"/>'
         f'<circle cx="256" cy="256" r="60" fill="#ffd0f0" opacity=".12" filter="url(#blur20)"/>'
         f'<path d="M256 238L262 250 276 252 266 262 268 276 256 269 244 276 246 262 236 252 250 250Z" fill="#fff" filter="url(#glow)"/>'
         f'<circle cx="112" cy="300" r="46" fill="url(#by-a)" filter="url(#glow)"/><circle cx="400" cy="212" r="40" fill="url(#by-b)" filter="url(#glow)"/>'
         f'<rect x="242" y="296" width="28" height="22" rx="5" fill="#fff" opacity=".85"/><path d="M247 296V288A9 9 0 0 1 265 288V296" fill="none" stroke="#fff" stroke-width="4" opacity=".85"/>')
    return svg(d, b, grain=.09)


# ── Bill Watch: a receipt whose torn edge is the chart of what it costs ───────────────────────────────────────────────
@icon
def bills():
    d = lg("bi-bg", (0, "#0e3b33"), (1, "#062019")) + lg("bi-p", (0, "#fffdf3"), (1, "#e9e2cc"))
    pts = [(120, 330), (160, 312), (200, 318), (240, 296), (280, 300), (320, 262), (360, 196), (392, 150)]
    line = " ".join(f"{x},{y}" for x, y in pts)
    b = (f'<rect width="512" height="512" fill="url(#bi-bg)"/>'
         f'<g filter="url(#sh)"><path d="M120 330L160 312 200 318 240 296 280 300 320 262 360 196 392 150V430H120Z" fill="url(#bi-p)"/></g>'
         f'<polyline points="{line}" fill="none" stroke="#ff5a4e" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>'
         f'<circle cx="392" cy="150" r="16" fill="#ff5a4e" stroke="#fffdf3" stroke-width="5"/>'
         f'<g fill="#0e3b33" opacity=".6"><rect x="150" y="352" width="120" height="10" rx="5"/><rect x="150" y="376" width="80" height="10" rx="5"/><rect x="300" y="352" width="60" height="10" rx="5"/><rect x="300" y="376" width="60" height="10" rx="5"/></g>'
         f'<path d="M150 404H362" stroke="#0e3b33" stroke-width="4" stroke-dasharray="6 6" opacity=".5"/>'
         f'<text x="96" y="140" font-family="Georgia, serif" font-size="88" font-weight="700" fill="#7de0b8" opacity=".9">$</text>'
         f'<path d="M408 112L418 92 428 112" fill="none" stroke="#ff5a4e" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>')
    return svg(d, b)


# ── Blackout Kit: the one lit window on a dark street ──────────────────────────────────────────────────────────────────
@icon
def blackout():
    d = lg("bk-bg", (0, "#141a3a"), (1, "#05070f")) + rg("bk-w", (0, "#fff2b8"), (.6, "#ffc04a"), (1, "#e07a12")) + rg("bk-spill", (0, "#ffc04a", .55), (1, "#ffc04a", 0))
    city = "".join(f'<rect x="{x}" y="{y}" width="{w}" height="{512 - y}" fill="#0c1128"/>' for x, y, w in [(0, 300, 70), (60, 250, 60), (400, 270, 60), (450, 230, 62)])
    b = (f'<rect width="512" height="512" fill="url(#bk-bg)"/><circle cx="390" cy="110" r="34" fill="#e8ecff" opacity=".9"/><circle cx="404" cy="100" r="30" fill="#141a3a"/>'
         f'{city}<path d="M0 150Q140 190 260 160T512 170" fill="none" stroke="#3a4270" stroke-width="3"/>'
         f'<path d="M232 162L246 186 234 188 248 214" fill="none" stroke="#ffc04a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
         f'<circle cx="256" cy="320" r="170" fill="url(#bk-spill)"/>'
         f'<g filter="url(#sh)"><path d="M150 262L256 180 362 262V430H150Z" fill="#1d2550" stroke="#3a4a8a" stroke-width="4" stroke-linejoin="round"/></g>'
         f'<path d="M136 270L256 172 376 270" fill="none" stroke="#2a3570" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>'
         f'<rect x="206" y="270" width="100" height="90" rx="6" fill="url(#bk-w)" filter="url(#glow)"/><path d="M256 270V360M206 315H306" stroke="#5a3a10" stroke-width="6"/>'
         f'<rect x="232" y="380" width="48" height="50" rx="4" fill="#0c1128"/>'
         f'<path d="M262 330Q256 314 262 300Q272 314 266 330Z" fill="#fff" opacity=".9"/>')
    return svg(d, b)


# ── Balloon: a numbered inspection balloon rising off its drawing like a hot-air balloon ────────────────────────────────
@icon
def bubble_editor():
    d = lg("be-bg", (0, "#f4efe3"), (1, "#e2d9c3")) + rg("be-b", (0, "#ff8a7a"), (1, "#d92d3a"), fx=.35, fy=.3)
    grid = "".join(f'<path d="M{x} 0V512" stroke="#5a7aa0" stroke-opacity=".12"/>' for x in range(0, 512, 24)) + "".join(f'<path d="M0 {y}H512" stroke="#5a7aa0" stroke-opacity=".12"/>' for y in range(0, 512, 24))
    b = (f'<rect width="512" height="512" fill="url(#be-bg)"/>{grid}'
         f'<g fill="none" stroke="#2c4a70" stroke-width="5" stroke-linejoin="round"><path d="M80 420H330V340H260V300H150V340H80Z"/><circle cx="205" cy="380" r="22"/></g>'
         f'<g stroke="#2c4a70" stroke-width="3"><path d="M80 446H330M80 438V454M330 438V454"/><path d="M356 340V420M348 340H364M348 420H364"/></g>'
         f'<path d="M260 300L330 220" stroke="#d92d3a" stroke-width="4" stroke-dasharray="7 6"/>'
         f'<g filter="url(#sh)"><path d="M330 72C392 72 432 116 432 168C432 214 398 248 366 270H306C274 248 240 214 240 168C240 116 276 72 330 72Z" fill="url(#be-b)"/>'
         f'<path d="M330 72C312 110 306 220 322 270M330 72C352 110 360 220 344 270" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="4"/>'
         f'<path d="M306 270L318 296H346L356 270" fill="none" stroke="#6a3a20" stroke-width="4"/><rect x="316" y="292" width="32" height="24" rx="4" fill="#b07a40"/></g>'
         f'<text x="336" y="196" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="76" fill="#fff">1</text>'
         f'<circle cx="128" cy="176" r="30" fill="#fff" stroke="#d92d3a" stroke-width="5"/><text x="128" y="190" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="38" fill="#d92d3a">2</text>'
         f'<path d="M140 204L170 300" stroke="#d92d3a" stroke-width="3" stroke-dasharray="6 5"/>')
    return svg(d, b, sheen=False)


# ── Care Circle: hands, cupped together around one heart ─────────────────────────────────────────────────────────────
@icon
def care():
    d = lg("ca-bg", (0, "#ffd8c2"), (1, "#f59a86")) + rg("ca-h", (0, "#ff8a8a"), (1, "#d6304a"), fx=.35, fy=.3)
    hand = lambda sx, col: (f'<g transform="translate(256 0) scale({sx} 1) translate(-256 0)"><path d="M256 418C222 418 176 404 150 372C126 342 118 300 124 268C128 248 152 246 160 266C168 288 176 310 196 324C200 300 196 270 204 250C210 234 232 236 234 254L238 300C240 270 244 240 252 222C258 206 278 210 278 228"'
                             f' fill="none" stroke="none"/><path d="M256 420C220 420 170 404 146 370C124 338 118 296 126 266C132 246 156 248 162 268C170 292 182 316 206 330C230 344 256 346 256 346Z" fill="{col}" stroke="#fff" stroke-opacity=".55" stroke-width="3"/>'
                             f'<path d="M150 300C156 318 164 330 176 340" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="5" stroke-linecap="round"/></g>')
    b = (f'<rect width="512" height="512" fill="url(#ca-bg)"/><circle cx="256" cy="250" r="190" fill="#fff" opacity=".18"/>'
         f'<g filter="url(#sh2)">{hand(1, "#f2b089")}{hand(-1, "#b77a52")}</g>'
         f'<g filter="url(#sh)"><path d="M256 330C200 296 160 262 160 220C160 186 186 162 216 162C236 162 248 172 256 188C264 172 276 162 296 162C326 162 352 186 352 220C352 262 312 296 256 330Z" fill="url(#ca-h)"/></g>'
         f'<path d="M190 214C192 196 204 186 220 186" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="8" stroke-linecap="round"/>'
         f'<g fill="#fff" opacity=".85"><circle cx="372" cy="138" r="7"/><circle cx="140" cy="128" r="5"/><circle cx="392" cy="196" r="4"/></g>')
    return svg(d, b)


# ── Cartograph: powers of ten, a planet inside its system inside its galaxy ───────────────────────────────────────────
@icon
def cartograph():
    d = rg("cg-bg", (0, "#16255a"), (1, "#03061a"), r=.75) + rg("cg-p", (0, "#9ff0ff"), (1, "#1a7ab0"), fx=.35, fy=.35) + rg("cg-sun", (0, "#fff"), (.4, "#ffe08a"), (1, "#ff9a2a", 0))
    arms = "".join(f'<path d="{" ".join(("M" if k == 0 else "L") + f"{256 + (20 + k * 9) * math.cos(a + k * .22):.1f} {256 + (20 + k * 9) * math.sin(a + k * .22) * .55:.1f}" for k in range(22))}" fill="none" stroke="#b8a0ff" stroke-width="{10 - 0}" stroke-linecap="round" opacity=".22"/>' for a in [0, math.pi])
    b = (f'<rect width="512" height="512" fill="url(#cg-bg)"/>'
         + "".join(f'<circle cx="{(k * 131) % 512}" cy="{(k * 197) % 512}" r="{.8 + (k % 3) * .7}" fill="#fff" opacity="{.25 + (k % 4) * .15}"/>' for k in range(50))
         + f'<g transform="rotate(-18 256 256)">{arms}<ellipse cx="256" cy="256" rx="206" ry="114" fill="none" stroke="#c8b8ff" stroke-width="2" opacity=".35"/>'
         f'<ellipse cx="256" cy="256" rx="150" ry="82" fill="none" stroke="#ffd36a" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" opacity=".8"/>'
         f'<ellipse cx="256" cy="256" rx="96" ry="52" fill="none" stroke="#ffd36a" stroke-width="3" opacity=".7"/></g>'
         f'<circle cx="256" cy="256" r="34" fill="url(#cg-sun)" filter="url(#glow)"/>'
         f'<g filter="url(#sh)"><circle cx="356" cy="200" r="42" fill="url(#cg-p)"/><path d="M318 186C340 176 372 178 396 190" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5"/></g>'
         f'<ellipse cx="356" cy="200" rx="66" ry="14" fill="none" stroke="#ffe7b0" stroke-width="5" transform="rotate(-18 356 200)" opacity=".9"/>'
         f'<g fill="none" stroke="#fff" stroke-width="3" opacity=".8"><path d="M336 180H376V220H336Z" stroke-dasharray="6 5"/></g>')
    return svg(d, b, grain=.09)


# ── Quiet Check-in: the porch light left on, its glow keeping a pulse ─────────────────────────────────────────────────
@icon
def checkin():
    d = lg("ci-bg", (0, "#0f3a44"), (1, "#041419")) + rg("ci-l", (0, "#fff6cf"), (.3, "#ffd76a"), (1, "#ffd76a", 0))
    b = (f'<rect width="512" height="512" fill="url(#ci-bg)"/><circle cx="256" cy="220" r="210" fill="url(#ci-l)" opacity=".55"/>'
         f'<path d="M0 512V300H512V512Z" fill="#06191e"/><path d="M0 300H512" stroke="#1f5560" stroke-width="4"/>'
         f'<g filter="url(#sh)"><path d="M226 120H286L296 200H216Z" fill="#1f5560" stroke="#7ad6c0" stroke-width="4" stroke-linejoin="round"/>'
         f'<rect x="222" y="200" width="68" height="74" rx="10" fill="#fff6cf" filter="url(#glow)"/><path d="M214 274H298L288 290H224Z" fill="#1f5560"/><path d="M256 80V120" stroke="#7ad6c0" stroke-width="6"/></g>'
         f'<path d="M110 384H196L218 340 244 428 270 358 286 384H402" fill="none" stroke="#7af0c8" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>'
         f'<rect x="186" y="430" width="140" height="82" fill="#06171c"/><circle cx="300" cy="470" r="7" fill="#ffd76a"/>')
    return svg(d, b)


# ── Claim Kit: the folder, clipped shut and stamped ──────────────────────────────────────────────────────────────────
@icon
def claim():
    d = lg("cl-bg", (0, "#f2c14e"), (1, "#e09a1e")) + lg("cl-f", (0, "#f7e4b5"), (1, "#e0c07a"))
    b = (f'<rect width="512" height="512" fill="url(#cl-bg)"/>'
         + "".join(f'<path d="M{-100 + k * 64} 512L{156 + k * 64} 0" stroke="#fff" stroke-opacity=".07" stroke-width="26"/>' for k in range(12))
         + f'<g filter="url(#sh)"><path d="M96 150H210L234 176H416V410H96Z" fill="#c98a2e"/>'
         f'<rect x="124" y="130" width="270" height="250" rx="6" fill="#fffdf6" transform="rotate(-4 256 256)"/>'
         f'<path d="M96 196H416V410H96Z" fill="url(#cl-f)"/></g>'
         f'<g transform="rotate(-4 256 256)" fill="#8a7a5a" opacity=".55"><rect x="150" y="150" width="150" height="10" rx="5"/></g>'
         f'<g transform="rotate(-14 300 300)"><rect x="196" y="250" width="200" height="92" rx="10" fill="none" stroke="#d22a2a" stroke-width="9"/>'
         f'<text x="296" y="314" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="50" fill="#d22a2a" letter-spacing="2">FILED</text></g>'
         f'<path d="M150 104V230C150 250 182 250 182 230V124C182 112 166 112 166 124V214" fill="none" stroke="#6a7a8a" stroke-width="9" stroke-linecap="round"/>')
    return svg(d, b, sheen=False)


# ── Unlit: a globe at night, the war zones its only embers ────────────────────────────────────────────────────────────
@icon
def conflict_atlas():
    d = rg("ua-g", (0, "#46506a"), (.75, "#1a2030"), (1, "#0e1018"), fx=.35, fy=.3) + rg("ua-e", (0, "#ffd08a"), (.4, "#ff5a2a"), (1, "#ff5a2a", 0))
    embers = "".join(f'<circle cx="{x}" cy="{y}" r="{r * 2.6}" fill="url(#ua-e)"/><circle cx="{x}" cy="{y}" r="{r * .55}" fill="#fff2d0"/>' for x, y, r in [(300, 200, 13), (334, 240, 9), (246, 262, 11), (364, 296, 8), (196, 220, 7), (290, 322, 8)])
    b = (f'<rect width="512" height="512" fill="#0a0b10"/>'
         f'<circle cx="256" cy="256" r="196" fill="#ff5a2a" opacity=".12" filter="url(#blur20)"/><g filter="url(#sh)"><circle cx="256" cy="256" r="176" fill="url(#ua-g)" stroke="#ff8a4a" stroke-opacity=".5" stroke-width="4"/></g>'
         f'<g fill="none" stroke="#4a5468" stroke-width="2" opacity=".6"><ellipse cx="256" cy="256" rx="176" ry="60"/><ellipse cx="256" cy="256" rx="176" ry="124"/><ellipse cx="256" cy="256" rx="70" ry="176"/><ellipse cx="256" cy="256" rx="130" ry="176"/><path d="M80 256H432M256 80V432"/></g>'
         f'<path d="M190 150C230 134 290 140 320 166C340 186 372 190 380 214C390 244 360 260 352 290C344 318 300 330 286 356C270 376 240 360 238 334C236 310 214 300 206 276C196 248 166 236 170 206C172 182 170 160 190 150Z" fill="#2a3244" opacity=".95"/>'
         f'{embers}<path d="M120 400A176 176 0 0 0 420 360" fill="none" stroke="#ff8a4a" stroke-width="3" opacity=".35"/>')
    return svg(d, b, grain=.1)


# ── Per Capita: a skyline that is a bar chart, each tower measured against its people ────────────────────────────────
@icon
def crime_dashboard():
    d = lg("pc-bg", (0, "#13233f"), (1, "#060c18")) + lg("pc-t", (0, "#3c6fb0"), (1, "#1a355e")) + lg("pc-hot", (0, "#ffcf5a"), (1, "#f07a1a"))
    towers = [(96, 300, "url(#pc-t)"), (150, 236, "url(#pc-t)"), (204, 180, "url(#pc-hot)"), (258, 262, "url(#pc-t)"), (312, 214, "url(#pc-t)"), (366, 280, "url(#pc-t)")]
    win = lambda x, y: "".join(f'<rect x="{x + 10 + (k % 2) * 18}" y="{y + 16 + (k // 2) * 24}" width="10" height="12" rx="2" fill="#ffe7a8" opacity="{.15 + ((k * 7 + x) % 5) * .14:.2f}"/>' for k in range(int((400 - y) / 24) * 2))
    b = (f'<rect width="512" height="512" fill="url(#pc-bg)"/>'
         + "".join(f'<path d="M64 {y}H448" stroke="#5a7ab0" stroke-opacity=".25" stroke-dasharray="4 8"/>' for y in (160, 240, 320))
         + "".join(f'<g filter="url(#sh2)"><rect x="{x}" y="{y}" width="46" height="{400 - y}" rx="4" fill="{f}"/>{win(x, y)}</g>' for x, y, f in towers)
         + f'<path d="M64 400H448" stroke="#9ab8e0" stroke-width="5"/>'
         f'<g transform="translate(227 152)"><circle r="18" fill="#fff" stroke="#f07a1a" stroke-width="5"/><text y="7" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="20" fill="#f07a1a">1</text></g>'
         + "".join(f'<g transform="translate({x} 436)" fill="#9ab8e0"><circle cy="-14" r="7"/><path d="M-10 10C-10-2 10-2 10 10Z"/></g>' for x in (120, 172, 224, 276, 328, 380))
         + f'<text x="440" y="130" text-anchor="end" font-family="Georgia, serif" font-style="italic" font-size="46" fill="#ffcf5a">÷</text>')
    return svg(d, b)


# ── CryptoVault: a glass padlock, so you can see every pin inside it ─────────────────────────────────────────────────
@icon
def cryptovault():
    d = lg("cv-bg", (0, "#0b3a2e"), (1, "#03140f")) + lg("cv-gl", (0, "#bff8e0", .45), (1, "#3ad6a0", .16)) + lg("cv-sh", (0, "#e8fff4"), (1, "#7ad6b4"))
    code = "".join(f'<text x="{24 + (k % 9) * 56}" y="{40 + (k // 9) * 56}" font-family="Courier New, monospace" font-size="20" fill="#3ad6a0" opacity="{.08 + (k % 5) * .03:.2f}">{format((k * 2654435761) % 256, "02x")}</text>' for k in range(81))
    pins = "".join(f'<rect x="{196 + k * 32}" y="{300 - (k % 3) * 14}" width="18" height="{56 + (k % 3) * 14}" rx="5" fill="#ffd36a" stroke="#fff3c4" stroke-width="2"/>' for k in range(4))
    b = (f'<rect width="512" height="512" fill="url(#cv-bg)"/>{code}'
         f'<path d="M184 236V180C184 138 216 108 256 108C296 108 328 138 328 180V236" fill="none" stroke="url(#cv-sh)" stroke-width="30" stroke-linecap="round" filter="url(#sh2)"/>'
         f'<g filter="url(#sh)"><rect x="140" y="226" width="232" height="190" rx="28" fill="url(#cv-gl)" stroke="#d8fff0" stroke-width="5"/></g>'
         f'<path d="M176 300H336" stroke="#d8fff0" stroke-width="3" opacity=".6"/>{pins}'
         f'<path d="M196 384H316" stroke="#d8fff0" stroke-width="4" opacity=".5"/><circle cx="256" cy="372" r="14" fill="none" stroke="#d8fff0" stroke-width="4"/>'
         f'<path d="M160 242C200 236 250 236 300 242" stroke="#fff" stroke-opacity=".6" stroke-width="6" stroke-linecap="round" fill="none"/>')
    return svg(d, b, grain=.09)


# ── DocCrawler: a beetle whose wing cases are two pages of a document ────────────────────────────────────────────────
@icon
def doccrawler():
    d = lg("dc-bg", (0, "#e7dcc0"), (1, "#c8b88f")) + lg("dc-w", (0, "#fffdf5"), (1, "#e4dcc8")) + lg("dc-b", (0, "#5a4a30"), (1, "#2a2014"))
    legs = "".join(f'<path d="M{256 + s * 40} {250 + k * 44}L{256 + s * 112} {224 + k * 52}L{256 + s * 136} {244 + k * 52}" fill="none" stroke="#2a2014" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' for s in (-1, 1) for k in range(3))
    txt = lambda x0, s: "".join(f'<path d="M{x0} {214 + k * 22}H{x0 + s * (70 - (k % 3) * 16)}" stroke="#7a6a50" stroke-width="7" stroke-linecap="round" opacity=".7"/>' for k in range(7))
    b = (f'<rect width="512" height="512" fill="url(#dc-bg)"/>'
         + "".join(f'<path d="M{x} 0V512" stroke="#8a7a58" stroke-opacity=".12" stroke-width="2"/>' for x in range(16, 512, 30))
         + f'<path d="M226 150C210 112 186 96 164 92M286 150C302 112 326 96 348 92" fill="none" stroke="#2a2014" stroke-width="8" stroke-linecap="round"/>'
         f'<circle cx="164" cy="92" r="9" fill="#2a2014"/><circle cx="348" cy="92" r="9" fill="#2a2014"/>{legs}'
         f'<g filter="url(#sh)"><ellipse cx="256" cy="168" rx="58" ry="44" fill="url(#dc-b)"/>'
         f'<path d="M256 196C190 196 166 250 166 312C166 380 210 420 256 420Z" fill="url(#dc-w)" stroke="#2a2014" stroke-width="6"/>'
         f'<path d="M256 196C322 196 346 250 346 312C346 380 302 420 256 420Z" fill="url(#dc-w)" stroke="#2a2014" stroke-width="6"/></g>'
         f'<g transform="translate(-8 0)">{txt(194, 1)}</g><g transform="translate(8 0)">{txt(318, -1)}</g>'
         f'<path d="M232 254H246" stroke="#e8572c" stroke-width="10" stroke-linecap="round"/>'
         f'<circle cx="234" cy="160" r="10" fill="#fff8e0"/><circle cx="278" cy="160" r="10" fill="#fff8e0"/><circle cx="236" cy="162" r="4" fill="#2a2014"/><circle cx="280" cy="162" r="4" fill="#2a2014"/>')
    return svg(d, b, sheen=False)


# ── Due Dates: the date, postmarked on the letter that was hiding it ──────────────────────────────────────────────────
@icon
def due():
    d = lg("du-bg", (0, "#7fb8f0"), (1, "#3a78c8")) + lg("du-e", (0, "#fffdf6"), (1, "#e9e0cc"))
    b = (f'<rect width="512" height="512" fill="url(#du-bg)"/>'
         + "".join(f'<circle cx="{(k * 89) % 512}" cy="{(k * 151) % 512}" r="{14 + (k % 4) * 6}" fill="#fff" opacity=".07"/>' for k in range(18))
         + f'<g filter="url(#sh)" transform="rotate(-8 256 280)"><rect x="96" y="176" width="320" height="216" rx="14" fill="url(#du-e)"/>'
         f'<path d="M96 190L256 300 416 190" fill="none" stroke="#c8bca0" stroke-width="5" stroke-linejoin="round"/>'
         f'<rect x="330" y="198" width="62" height="74" rx="4" fill="#ffd36a" stroke="#fff" stroke-width="4" stroke-dasharray="6 4"/>'
         f'<path d="M346 222H376M346 240H370" stroke="#c87a1a" stroke-width="5" stroke-linecap="round"/></g>'
         f'<g transform="rotate(10 200 250)"><circle cx="200" cy="250" r="88" fill="none" stroke="#d6283a" stroke-width="9"/><circle cx="200" cy="250" r="72" fill="#fff" fill-opacity=".85" stroke="#d6283a" stroke-width="3"/>'
         f'<text x="200" y="232" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="22" fill="#d6283a" letter-spacing="4">DUE</text>'
         f'<text x="200" y="290" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="58" fill="#d6283a">14</text>'
         f'<path d="M296 236H420M296 254H420M296 272H420" stroke="#d6283a" stroke-width="6" stroke-linecap="round"/></g>')
    return svg(d, b)


# ── Duely: an overdue invoice, folded into a paper plane and sent off politely, bow tie and all ──────────────────────
@icon
def duely():
    d = lg("dy-bg", (0, "#ffd1e0"), (1, "#f08ab0")) + lg("dy-p1", (0, "#ffffff"), (1, "#f1e8ee")) + lg("dy-p2", (0, "#e8dce4"), (1, "#c8b4c2"))
    b = (f'<rect width="512" height="512" fill="url(#dy-bg)"/>'
         f'<path d="M60 420C140 400 170 340 230 330" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="4 14" stroke-linecap="round" opacity=".9"/>'
         f'<g filter="url(#sh)"><path d="M104 304L436 120 300 410 248 316Z" fill="url(#dy-p1)"/><path d="M248 316L436 120 270 360Z" fill="url(#dy-p2)"/><path d="M248 316L270 360 300 410Z" fill="#b8a0b2"/></g>'
         f'<g stroke="#a04a7a" stroke-width="6" stroke-linecap="round" opacity=".5"><path d="M210 290L330 210M236 304L340 232"/></g>'
         f'<g transform="translate(322 244) rotate(-30)"><path d="M0 0L-26-16V16Z M0 0L26-16V16Z" fill="#7a2a5a"/><circle r="8" fill="#a04a7a"/></g>'
         f'<text x="140" y="168" font-family="Georgia, serif" font-style="italic" font-size="54" fill="#7a2a5a" opacity=".85">please</text>')
    return svg(d, b)


# ── Digital Estate: a key whose bow is a family tree ─────────────────────────────────────────────────────────────────
@icon
def estate():
    d = lg("es-bg", (0, "#3a1d5c"), (1, "#140826")) + lg("es-g", (0, "#ffe9a8"), (.5, "#e8b440"), (1, "#a06a14")) + rg("es-l", (0, "#b8f0a0"), (1, "#3a9a5a"), fx=.35, fy=.3)
    leaves = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#es-l)" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>' for x, y, r in [(256, 118, 36), (206, 136, 30), (306, 136, 30), (176, 180, 28), (336, 180, 28), (220, 186, 30), (292, 186, 30), (256, 170, 34)])
    b = (f'<rect width="512" height="512" fill="url(#es-bg)"/><circle cx="256" cy="170" r="150" fill="#ffe9a8" opacity=".08"/>'
         f'<g filter="url(#sh)">{leaves}'
         f'<path d="M256 230V430" stroke="#e8b440" stroke-width="30" stroke-linecap="round"/>'
         f'<path d="M256 230C256 210 232 200 220 192M256 230C256 210 280 200 292 192M256 214V176" fill="none" stroke="#e8b440" stroke-width="12" stroke-linecap="round"/>'
         f'<path d="M256 330H306V354H286V378H306V400H256" fill="url(#es-g)"/></g>'
         f'<circle cx="256" cy="252" r="44" fill="none" stroke="#e8b440" stroke-width="14"/>'
         f'<path d="M244 250A12 12 0 1 1 268 250A12 12 0 1 1 244 250Z" fill="#140826"/>')
    return svg(d, b)


# ── Fix or Replace: the same mug, mended on one side, brand new on the other ──────────────────────────────────────────
@icon
def fix():
    d = lg("fx-l", (0, "#ff9a4a"), (1, "#e0601a")) + lg("fx-r", (0, "#3ac8c0"), (1, "#14807a")) + lg("fx-m", (0, "#fffdf6"), (1, "#e4dccc"))
    b = (f'<path d="M0 0H512V512H0Z" fill="url(#fx-l)"/><path d="M512 0V512H0Z" fill="url(#fx-r)"/>'
         f'<g filter="url(#sh)"><path d="M150 170H362V352C362 394 330 420 290 420H222C182 420 150 394 150 352Z" fill="url(#fx-m)"/>'
         f'<path d="M362 220C412 220 424 252 424 276C424 306 400 330 362 330" fill="none" stroke="#e4dccc" stroke-width="22"/></g>'
         f'<path d="M190 170L214 236 192 280 226 330 210 420" fill="none" stroke="#c8a030" stroke-width="7" stroke-linejoin="round"/>'
         f'<path d="M190 170L214 236 192 280 226 330 210 420" fill="none" stroke="#ffe08a" stroke-width="2"/>'
         f'<g transform="translate(330 150) rotate(18)"><path d="M0 0H60L82 22 60 44H0Z" fill="#fff" stroke="#14807a" stroke-width="4"/><circle cx="62" cy="22" r="6" fill="#14807a"/>'
         f'<text x="28" y="32" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="28" fill="#14807a">$</text></g>'
         f'<path d="M150 170H362" stroke="#fff" stroke-width="6" opacity=".7"/>'
         f'<g fill="#fff" opacity=".85"><path d="M404 380L410 394 424 400 410 406 404 420 398 406 384 400 398 394Z"/><path d="M440 330L444 338 452 342 444 346 440 354 436 346 428 342 436 338Z"/></g>'
         f'<text x="256" y="112" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-weight="700" font-size="64" fill="#fff" opacity=".9">or</text>')
    return svg(d, b)


# ── Flutterbloom: a butterfly made of petals, kept under a glass dome like a gift ─────────────────────────────────────
@icon
def flutterbloom():
    d = (lg("fb-bg", (0, "#f6d6f0"), (1, "#b48ad8")) + lg("fb-dome", (0, "#ffffff", .5), (1, "#ffffff", .08), x2=1, y2=0)
         + rg("fb-p1", (0, "#ffe0f0"), (1, "#ff6aa8"), fx=.3, fy=.3) + rg("fb-p2", (0, "#fff2c8"), (1, "#ffaa3a"), fx=.3, fy=.3))
    wing = lambda sx, f1, f2: (f'<g transform="translate(256 0) scale({sx} 1) translate(-256 0)"><path d="M256 250C230 190 170 150 136 176C108 198 132 250 180 262C214 270 246 262 256 250Z" fill="{f1}" stroke="#fff" stroke-width="3"/>'
                                f'<path d="M256 262C226 270 180 290 178 324C176 352 214 356 236 330C250 312 256 286 256 262Z" fill="{f2}" stroke="#fff" stroke-width="3"/></g>')
    b = (f'<rect width="512" height="512" fill="url(#fb-bg)"/>'
         + "".join(f'<circle cx="{(k * 113) % 512}" cy="{(k * 67) % 300}" r="{2 + k % 3}" fill="#fff" opacity=".6"/>' for k in range(14))
         + f'<ellipse cx="256" cy="420" rx="150" ry="22" fill="#6a3a8a" opacity=".35"/>'
         f'<rect x="120" y="396" width="272" height="34" rx="10" fill="#8a5aa8"/><rect x="120" y="396" width="272" height="10" rx="5" fill="#b48ad8"/>'
         f'<path d="M256 396V300" stroke="#4a9a5a" stroke-width="6"/><path d="M256 360C230 350 222 330 228 318C246 326 254 342 256 360Z" fill="#6aca7a"/>'
         f'<g filter="url(#sh2)">{wing(1, "url(#fb-p1)", "url(#fb-p2)")}{wing(-1, "url(#fb-p1)", "url(#fb-p2)")}</g>'
         f'<path d="M256 222V312" stroke="#5a2a5a" stroke-width="8" stroke-linecap="round"/><path d="M252 226C246 206 236 196 226 194M260 226C266 206 276 196 286 194" fill="none" stroke="#5a2a5a" stroke-width="4" stroke-linecap="round"/>'
         f'<path d="M136 396V220C136 150 190 96 256 96C322 96 376 150 376 220V396" fill="url(#fb-dome)" stroke="#fff" stroke-width="5" stroke-opacity=".85"/>'
         f'<path d="M166 220C166 170 196 132 234 120" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".7"/><circle cx="256" cy="88" r="12" fill="#fff" opacity=".9"/>')
    return svg(d, b)


# ── Frames: a run of photographs on a contact strip, one light leak across them ──────────────────────────────────────
@icon
def frames():
    d = lg("fr-bg", (0, "#1a1410"), (1, "#0a0806")) + lg("fr-leak", (0, "#ff6a2a", 0), (.5, "#ffb05a", .55), (1, "#ff6a2a", 0), x2=1, y2=1)
    shots = [("#e8a06a", "#5a3a6a"), ("#7ab8d8", "#2a4a3a"), ("#f0d08a", "#8a3a2a")]
    frame = lambda x, c: (f'<rect x="{x}" y="186" width="120" height="140" rx="4" fill="{c[0]}"/><path d="M{x} 286L{x + 40} 250 {x + 70} 276 {x + 96} 240 {x + 120} 270V326H{x}Z" fill="{c[1]}"/>'
                           f'<circle cx="{x + 88}" cy="216" r="12" fill="#fff3d6" opacity=".85"/>')
    holes = "".join(f'<rect x="{x}" y="{y}" width="16" height="12" rx="3" fill="#0a0806"/>' for x in range(52, 470, 32) for y in (152, 348))
    b = (f'<rect width="512" height="512" fill="url(#fr-bg)"/>'
         f'<g filter="url(#sh)" transform="rotate(-8 256 256)"><rect x="36" y="140" width="440" height="232" rx="10" fill="#2a221a"/>{holes}'
         f'{frame(60, shots[0])}{frame(196, shots[1])}{frame(332, shots[2])}</g>'
         f'<rect width="512" height="512" fill="url(#fr-leak)"/>'
         f'<text x="70" y="452" font-family="Courier New, monospace" font-weight="700" font-size="30" fill="#ffb05a" opacity=".85">28 ▸</text>')
    return svg(d, b, grain=.14, sheen=False)


# ── Graveyard Shift: a dish under the stars, keeping a satellite talking until the dawn line ─────────────────────────
@icon
def graveyard():
    d = lg("gy-bg", (0, "#130a3a"), (.62, "#3a1a6a"), (.85, "#c8507a"), (1, "#ffa05a")) + lg("gy-d", (0, "#e0e4ff"), (1, "#8a90c0"))
    b = (f'<rect width="512" height="512" fill="url(#gy-bg)"/>'
         + "".join(f'<circle cx="{(k * 97) % 512}" cy="{(k * 53) % 290}" r="{.8 + (k % 3) * .7}" fill="#fff" opacity="{.3 + (k % 4) * .15}"/>' for k in range(46))
         + f'<path d="M0 430Q256 400 512 430V512H0Z" fill="#0a0620"/>'
         + "".join(f'<path d="M{x} 446V{y}A18 18 0 0 1 {x + 36} {y}V446Z" fill="#1a1238"/>' for x, y in [(60, 410), (412, 404), (110, 420)])
         + f'<g filter="url(#sh2)"><path d="M232 440L256 352 280 440Z" fill="#2a2058"/><path d="M180 260A110 110 0 0 0 340 380Z" fill="url(#gy-d)" transform="rotate(-30 260 320)"/></g>'
         f'<path d="M262 330L334 210" stroke="#e0e4ff" stroke-width="5"/>'
         + "".join(f'<path d="M{344 + k * 0} {196 - k * 0}" />' for k in range(0))
         + f'<g fill="none" stroke="#7af0d0" stroke-width="5" stroke-linecap="round" opacity=".85"><path d="M354 178A30 30 0 0 1 380 196"/><path d="M362 156A56 56 0 0 1 404 190"/></g>'
         f'<g transform="translate(410 120) rotate(30)" filter="url(#glow)"><rect x="-10" y="-10" width="20" height="20" fill="#ffe08a"/><rect x="-44" y="-7" width="28" height="14" fill="#7ab8ff"/><rect x="16" y="-7" width="28" height="14" fill="#7ab8ff"/></g>')
    return svg(d, b, grain=.1)


# ── House Manual: a house whose roof is the open handbook ────────────────────────────────────────────────────────────
@icon
def house():
    d = lg("hm-bg", (0, "#4ac8b4"), (1, "#1a7a74")) + lg("hm-p", (0, "#fffdf6"), (1, "#e8e0cc")) + lg("hm-w", (0, "#ff8a5a"), (1, "#d8502a"))
    b = (f'<rect width="512" height="512" fill="url(#hm-bg)"/><circle cx="400" cy="110" r="44" fill="#fff4c8" opacity=".85"/>'
         f'<g filter="url(#sh)"><path d="M140 270H372V420H140Z" fill="url(#hm-w)"/>'
         f'<path d="M256 120C220 100 160 100 110 116V280C160 266 220 266 256 286Z" fill="url(#hm-p)"/>'
         f'<path d="M256 120C292 100 352 100 402 116V280C352 266 292 266 256 286Z" fill="url(#hm-p)"/></g>'
         f'<path d="M256 120V286" stroke="#c8bca0" stroke-width="4"/>'
         + "".join(f'<path d="M136 {150 + k * 24}C170 {142 + k * 24} 210 {142 + k * 24} 236 {152 + k * 24}" fill="none" stroke="#9a8e70" stroke-width="5" stroke-linecap="round" opacity=".55"/>' for k in range(5))
         + "".join(f'<path d="M276 {152 + k * 24}C302 {142 + k * 24} 342 {142 + k * 24} 376 {150 + k * 24}" fill="none" stroke="#9a8e70" stroke-width="5" stroke-linecap="round" opacity=".55"/>' for k in range(5))
         + f'<rect x="226" y="340" width="60" height="80" rx="6" fill="#5a2a1a"/><circle cx="274" cy="384" r="5" fill="#ffd36a"/>'
         f'<rect x="164" y="312" width="44" height="40" rx="4" fill="#fff4c8"/><rect x="304" y="312" width="44" height="40" rx="4" fill="#fff4c8"/>'
         f'<path d="M186 312V352M164 332H208M326 312V352M304 332H348" stroke="#d8502a" stroke-width="4"/>'
         f'<path d="M360 104V176L376 162 392 176V104" fill="#e8402a" transform="translate(-8 4)"/>')
    return svg(d, b)


# ── In Case: the star of life on a card, bold enough to find in a hurry ──────────────────────────────────────────────
@icon
def incase():
    d = lg("ic-bg", (0, "#ff5a5a"), (1, "#c41a2a")) + lg("ic-c", (0, "#ffffff"), (1, "#eef0f4"))
    arm = lambda a: f'<rect x="-22" y="-92" width="44" height="184" rx="8" transform="rotate({a})"/>'
    b = (f'<rect width="512" height="512" fill="url(#ic-bg)"/>'
         + "".join(f'<path d="M0 {y}H512" stroke="#fff" stroke-opacity=".06" stroke-width="14"/>' for y in range(20, 512, 44))
         + f'<g filter="url(#sh)" transform="rotate(-6 256 256)"><rect x="76" y="136" width="360" height="240" rx="26" fill="url(#ic-c)"/>'
         f'<g transform="translate(176 256)" fill="#1d5ad8">{arm(0)}{arm(60)}{arm(120)}</g>'
         f'<g transform="translate(176 256)"><path d="M0 -56V56" stroke="#fff" stroke-width="7"/><path d="M-12 -40C10 -34 10 -18 -6 -12C-22 -6 -18 12 8 16C22 18 14 34 0 40" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/></g>'
         f'<g fill="#2a2a3a"><rect x="282" y="190" width="120" height="14" rx="7"/><rect x="282" y="220" width="90" height="12" rx="6" opacity=".5"/><rect x="282" y="244" width="100" height="12" rx="6" opacity=".5"/></g>'
         f'<rect x="326" y="282" width="76" height="76" rx="6" fill="#fff" stroke="#2a2a3a" stroke-width="3"/>'
         f'<g fill="#2a2a3a"><rect x="334" y="290" width="20" height="20"/><rect x="374" y="290" width="20" height="20"/><rect x="334" y="330" width="20" height="20"/><rect x="362" y="320" width="8" height="8"/><rect x="378" y="336" width="8" height="8"/><rect x="386" y="320" width="8" height="8"/></g></g>')
    return svg(d, b)


# ── House Kitty: the kitty, literally — a cat-shaped money box ───────────────────────────────────────────────────────
@icon
def kitty():
    d = lg("kt-bg", (0, "#3ac0b0"), (1, "#127a70")) + rg("kt-c", (0, "#fff0b0"), (.6, "#ffcf4a"), (1, "#e0961a"), fx=.35, fy=.3) + rg("kt-coin", (0, "#fff6c8"), (1, "#d8961a"), fx=.35, fy=.3)
    b = (f'<rect width="512" height="512" fill="url(#kt-bg)"/>'
         + "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" opacity=".08"/>' for x, y, r in [(80, 90, 40), (440, 420, 60), (420, 90, 20)])
         + f'<g filter="url(#sh)"><path d="M150 230L160 140 214 196C238 188 274 188 298 196L352 140 362 230C392 262 400 300 392 334C380 390 322 420 256 420C190 420 132 390 120 334C112 300 120 262 150 230Z" fill="url(#kt-c)"/>'
         f'<path d="M392 330C430 330 448 300 440 270" fill="none" stroke="#e0961a" stroke-width="18" stroke-linecap="round"/></g>'
         f'<path d="M166 176L170 214 196 196Z M346 176L342 214 316 196Z" fill="#ff9a8a"/>'
         f'<rect x="222" y="206" width="68" height="12" rx="6" fill="#7a4a10"/>'
         f'<path d="M206 286Q220 274 234 286M278 286Q292 274 306 286" fill="none" stroke="#5a3408" stroke-width="7" stroke-linecap="round"/>'
         f'<path d="M248 304L256 312 264 304Z" fill="#ff7a7a"/><path d="M256 312V320M256 320Q244 330 236 322M256 320Q268 330 276 322" fill="none" stroke="#5a3408" stroke-width="4" stroke-linecap="round"/>'
         f'<g stroke="#5a3408" stroke-width="3" stroke-linecap="round" opacity=".6"><path d="M200 310L160 302M200 320L162 326M312 310L352 302M312 320L350 326"/></g>'
         f'<path d="M170 250C176 232 190 222 206 220" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="8" stroke-linecap="round"/>'
         f'<g transform="translate(256 132)" filter="url(#sh2)"><ellipse rx="30" ry="30" fill="url(#kt-coin)" stroke="#fff6c8" stroke-width="3"/>'
         f'<text y="13" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="36" fill="#8a4a08">$</text></g>'
         f'<path d="M256 168V194" stroke="#fff" stroke-width="4" stroke-dasharray="3 6" stroke-linecap="round" opacity=".8"/>')
    return svg(d, b)


# ── Lexicon: a new word, lifting off the dictionary page in light ────────────────────────────────────────────────────
@icon
def lexicon():
    d = lg("lx-bg", (0, "#1a2a5a"), (1, "#070c22")) + lg("lx-p", (0, "#fffaf0"), (1, "#e6dcc4")) + rg("lx-gl", (0, "#ffe7a0", .9), (1, "#ffe7a0", 0))
    b = (f'<rect width="512" height="512" fill="url(#lx-bg)"/><ellipse cx="256" cy="190" rx="200" ry="150" fill="url(#lx-gl)" opacity=".45"/>'
         f'<g filter="url(#sh)"><path d="M256 330C214 306 150 300 88 312V430C150 420 214 424 256 448Z" fill="url(#lx-p)"/><path d="M256 330C298 306 362 300 424 312V430C362 420 298 424 256 448Z" fill="url(#lx-p)"/></g>'
         f'<path d="M256 330V448" stroke="#c8bca0" stroke-width="4"/>'
         + "".join(f'<path d="M{108 if s < 0 else 276} {352 + k * 20}H{236 if s < 0 else 404}" stroke="#a8987a" stroke-width="5" stroke-linecap="round" opacity=".5"/>' for s in (-1, 1) for k in range(4))
         + f'<text x="256" y="226" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-style="italic" font-size="120" fill="#ffe7a0" filter="url(#glow)">verel</text>'
         f'<text x="256" y="276" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#c8d4ff" opacity=".8" letter-spacing="3">/ˈvɛr·əl/  n.</text>'
         + "".join(f'<circle cx="{180 + k * 38}" cy="{310 - (k % 3) * 10}" r="{2 + k % 2}" fill="#ffe7a0" opacity=".8"/>' for k in range(5))
         + f'<path d="M404 92L380 200" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M404 92C440 100 452 130 430 156C414 140 402 120 404 92Z" fill="#fff" opacity=".9"/>')
    return svg(d, b, grain=.09)


# ── Street Library: a little book house on a post, a ladder leaning on it to borrow ───────────────────────────────────
@icon
def library():
    d = lg("sl-bg", (0, "#bfe8a8"), (1, "#5aa86a")) + lg("sl-r", (0, "#ff7a5a"), (1, "#c83a2a")) + lg("sl-w", (0, "#f7e7c8"), (1, "#d8c098"))
    books = [("#3a7ad8", 26, 76), ("#f0b030", 22, 86), ("#e8503a", 28, 70), ("#6ac08a", 20, 82), ("#8a5ad8", 24, 74)]
    x, bk = 176, ""
    for c, w, h in books: bk += f'<rect x="{x}" y="{306 - h}" width="{w}" height="{h}" rx="3" fill="{c}" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>'; x += w + 4
    b = (f'<rect width="512" height="512" fill="url(#sl-bg)"/><circle cx="96" cy="100" r="54" fill="#fff8d0" opacity=".8"/>'
         f'<path d="M0 420Q256 380 512 420V512H0Z" fill="#3a8a4a"/>'
         f'<rect x="240" y="320" width="32" height="110" fill="#7a4a2a"/>'
         f'<g filter="url(#sh)"><rect x="146" y="184" width="220" height="144" rx="10" fill="url(#sl-w)"/><rect x="166" y="204" width="180" height="108" rx="6" fill="#4a2a1a"/>{bk}'
         f'<path d="M126 196L256 104 386 196Z" fill="url(#sl-r)" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linejoin="round"/></g>'
         f'<rect x="166" y="204" width="180" height="108" rx="6" fill="#fff" opacity=".12"/><path d="M256 204V312" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>'
         f'<g transform="rotate(14 380 330)"><path d="M366 190V430M406 190V430" stroke="#c8902a" stroke-width="10" stroke-linecap="round"/>'
         + "".join(f'<path d="M366 {214 + k * 40}H406" stroke="#c8902a" stroke-width="8"/>' for k in range(6))
         + f'</g><circle cx="256" cy="150" r="14" fill="#fff8d0"/>')
    return svg(d, b)


# ── AutoFaber Offline: a mind in a phone, the cloud left behind ──────────────────────────────────────────────────────
@icon
def local_ai():
    d = lg("la-bg", (0, "#5a2ad8"), (1, "#1a0a5a")) + lg("la-ph", (0, "#2a1a5a"), (1, "#120838")) + rg("la-br", (0, "#fff"), (.4, "#d8b8ff"), (1, "#8a4aff"), fx=.4, fy=.35)
    b = (f'<rect width="512" height="512" fill="url(#la-bg)"/>'
         f'<g opacity=".55"><path d="M330 120C300 120 296 92 318 84C320 58 356 50 370 70C384 50 420 58 418 86C440 90 438 120 410 120Z" fill="#fff" opacity=".35"/>'
         f'<path d="M310 60L430 136" stroke="#ff7ab0" stroke-width="10" stroke-linecap="round"/></g>'
         f'<g filter="url(#sh)"><rect x="160" y="110" width="192" height="320" rx="34" fill="url(#la-ph)" stroke="#b89aff" stroke-width="5"/></g>'
         f'<rect x="226" y="124" width="60" height="10" rx="5" fill="#b89aff" opacity=".6"/>'
         f'<circle cx="256" cy="270" r="80" fill="#d8b8ff" opacity=".18" filter="url(#blur20)"/>'
         f'<g filter="url(#glow)"><path d="M256 212C226 196 192 212 196 242C176 250 178 284 200 290C198 316 226 330 246 318C250 326 262 326 266 318C286 330 314 316 312 290C334 284 336 250 316 242C320 212 286 196 256 212Z" fill="url(#la-br)"/></g>'
         f'<path d="M256 214V320M226 244C238 250 244 262 240 276M286 244C274 250 268 262 272 276M210 270H230M282 270H302" fill="none" stroke="#5a2ad8" stroke-width="5" stroke-linecap="round" opacity=".7"/>'
         f'<g transform="translate(372 340) rotate(-30)"><path d="M-30 0H30M0 -6L-14 -26H-4L14 -6M0 6L-14 26H-4L14 6M-26 -4L-34 -14M-26 4L-34 14" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>')
    return svg(d, b)


# ── MentiPlayer: a play button built from a film strip, a sound wave and a radio dial ─────────────────────────────────
@icon
def mentiplayer():
    d = lg("mp-bg", (0, "#ff5a5a"), (1, "#a81a3a")) + lg("mp-f", (0, "#2a1a1a"), (1, "#120808"))
    b = (f'<rect width="512" height="512" fill="url(#mp-bg)"/>'
         f'<clipPath id="mp-tri"><path d="M168 104L420 256 168 408Z"/></clipPath>'
         f'<g filter="url(#sh)"><path d="M168 104L420 256 168 408Z" fill="#fff"/></g>'
         f'<g clip-path="url(#mp-tri)"><rect x="150" y="100" width="280" height="96" fill="url(#mp-f)"/>'
         + "".join(f'<rect x="{170 + k * 30}" y="108" width="16" height="12" rx="2" fill="#fff"/><rect x="{170 + k * 30}" y="176" width="16" height="12" rx="2" fill="#fff"/><rect x="{168 + k * 30}" y="128" width="24" height="40" rx="3" fill="#ff9a6a" opacity="{.4 + (k % 3) * .2:.1f}"/>' for k in range(9))
         + f'<rect x="150" y="196" width="280" height="110" fill="#ffd8d0"/>'
         + "".join(f'<rect x="{172 + k * 16}" y="{251 - h}" width="10" height="{2 * h}" rx="5" fill="#d8283a"/>' for k, h in enumerate([10, 22, 36, 18, 44, 30, 14, 34, 24, 12, 20, 8, 14, 6, 4]))
         + f'<rect x="150" y="306" width="280" height="110" fill="#2a1a1a"/>'
         + "".join(f'<path d="M{176 + k * 14} 330V{346 if k % 5 else 356}" stroke="#ffd8d0" stroke-width="3"/>' for k in range(18))
         + f'<path d="M232 322V372" stroke="#ff5a5a" stroke-width="6"/><circle cx="210" cy="388" r="10" fill="#ffd8d0"/></g>'
         f'<path d="M168 104L420 256 168 408Z" fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>')
    return svg(d, b)


# ── Hopline: a message hopping node to node across the mesh, no towers ───────────────────────────────────────────────
@icon
def meshnet():
    d = lg("hl-bg", (0, "#1f4a2a"), (1, "#0a1f10")) + rg("hl-n", (0, "#eaffb0"), (1, "#7ad62a"), fx=.35, fy=.3)
    nodes = [(96, 380), (180, 300), (278, 340), (352, 240), (430, 150)]
    links = "".join(f'<path d="M{a[0]} {a[1]}L{b2[0]} {b2[1]}" stroke="#7ad62a" stroke-width="4" stroke-dasharray="3 9" stroke-linecap="round" opacity=".7"/>' for a, b2 in zip(nodes, nodes[1:]))
    arcs = "".join(f'<path d="M{a[0]} {a[1] - 22}Q{(a[0] + b2[0]) / 2} {min(a[1], b2[1]) - 90} {b2[0]} {b2[1] - 22}" fill="none" stroke="#eaffb0" stroke-width="5" stroke-linecap="round" opacity="{.35 + k * .15:.2f}"/>' for k, (a, b2) in enumerate(zip(nodes, nodes[1:])))
    b = (f'<rect width="512" height="512" fill="url(#hl-bg)"/>'
         + "".join(f'<path d="M{x} 512L{x + 40} 440 {x + 80} 512Z" fill="#14361c"/>' for x in range(-20, 520, 70))
         + f'{links}{arcs}'
         + "".join(f'<g transform="translate({x} {y})"><path d="M-14 26L0 -8 14 26" fill="none" stroke="#c8f08a" stroke-width="5" stroke-linejoin="round"/><circle cy="-14" r="14" fill="url(#hl-n)" filter="url(#glow)"/></g>' for x, y in nodes)
         + f'<g transform="translate(366 92)" filter="url(#sh2)"><path d="M-46 -30H46C56 -30 62 -24 62 -14V14C62 24 56 30 46 30H-14L-36 50V30H-46C-56 30 -62 24 -62 14V-14C-62 -24 -56 -30 -46 -30Z" fill="#eaffb0"/>'
         f'<circle cx="-22" r="7" fill="#1f4a2a"/><circle r="7" fill="#1f4a2a"/><circle cx="22" r="7" fill="#1f4a2a"/></g>')
    return svg(d, b)


# ── The Monstrosity: a homelab rack, opened up layer by layer and stitched back together ──────────────────────────────
@icon
def monstrosity():
    d = lg("mo-bg", (0, "#3a5a3a"), (1, "#121e12")) + lg("mo-u", (0, "#5a6a5a"), (1, "#2a342a")) + rg("mo-l", (0, "#e8ffb0"), (1, "#7ad62a"))
    unit = lambda y, dx, rot: (f'<g transform="translate({dx} 0) rotate({rot} 256 {y + 30})" filter="url(#sh2)"><rect x="140" y="{y}" width="232" height="60" rx="8" fill="url(#mo-u)" stroke="#a8c8a0" stroke-width="3"/>'
                                + "".join(f'<rect x="{160 + k * 18}" y="{y + 18}" width="10" height="24" rx="2" fill="#1a221a"/>' for k in range(6))
                                + f'<circle cx="320" cy="{y + 30}" r="7" fill="url(#mo-l)" filter="url(#glow)"/><circle cx="346" cy="{y + 30}" r="7" fill="#ff7a3a"/></g>')
    stitch = lambda y: f'<path d="M170 {y}H342" stroke="#d8c8a0" stroke-width="4"/>' + "".join(f'<path d="M{176 + k * 24} {y - 9}V{y + 9}" stroke="#d8c8a0" stroke-width="4" stroke-linecap="round"/>' for k in range(7))
    b = (f'<rect width="512" height="512" fill="url(#mo-bg)"/>'
         + "".join(f'<path d="M{x} 0V512" stroke="#000" stroke-opacity=".12" stroke-width="18"/>' for x in range(30, 512, 64))
         + unit(96, -18, -4) + stitch(170) + unit(180, 24, 3) + stitch(254) + unit(264, -10, -2) + stitch(338) + unit(348, 14, 2)
         + f'<g stroke="#9aa89a" stroke-width="10" stroke-linecap="round"><path d="M110 140H136M110 392H136"/></g><circle cx="104" cy="140" r="14" fill="#9aa89a"/><circle cx="104" cy="392" r="14" fill="#9aa89a"/>'
         f'<path d="M420 120L400 170 424 168 402 222" fill="none" stroke="#e8ffb0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>')
    return svg(d, b)


# ── Synodic: two moons in their phases, their overlap a heart ─────────────────────────────────────────────────────────
@icon
def moon_compatibility():
    d = rg("sy-bg", (0, "#2a3a7a"), (1, "#080c24"), r=.75) + rg("sy-m1", (0, "#ffffff"), (1, "#c8ccf0"), fx=.35, fy=.3) + rg("sy-m2", (0, "#fff4d8"), (1, "#f0c87a"), fx=.35, fy=.3)
    b = (f'<rect width="512" height="512" fill="url(#sy-bg)"/>'
         + "".join(f'<circle cx="{(k * 89) % 512}" cy="{(k * 173) % 512}" r="{.8 + (k % 3) * .6}" fill="#fff" opacity="{.25 + (k % 4) * .15}"/>' for k in range(40))
         + f'<clipPath id="sy-a"><circle cx="200" cy="256" r="120"/></clipPath>'
         f'<g filter="url(#sh)"><circle cx="200" cy="256" r="120" fill="url(#sy-m1)"/><circle cx="312" cy="256" r="120" fill="url(#sy-m2)" opacity=".92"/></g>'
         f'<circle cx="152" cy="256" r="110" fill="#1a2250" opacity=".45" clip-path="url(#sy-a)"/>'
         f'<g clip-path="url(#sy-a)"><circle cx="312" cy="256" r="120" fill="#ff7aa8" opacity=".85"/></g>'
         f'<path d="M256 300C232 284 222 270 222 256C222 244 232 236 242 236C248 236 254 240 256 246C258 240 264 236 270 236C280 236 290 244 290 256C290 270 280 284 256 300Z" fill="#fff"/>'
         + "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#a8acd8" opacity=".5"/>' for x, y, r in [(150, 200, 14), (130, 290, 10), (190, 330, 8)])
         + "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#d8a85a" opacity=".45"/>' for x, y, r in [(370, 210, 12), (390, 300, 16), (340, 340, 8)]))
    return svg(d, b, grain=.09)


# ── Move-in, Move-out: one door, clean on the way in and scuffed on the way out ──────────────────────────────────────
@icon
def movein():
    d = lg("mi-bg", (0, "#d8f4e4"), (1, "#8ad0aa")) + lg("mi-d1", (0, "#3ab88a"), (1, "#1a7a5a")) + lg("mi-d2", (0, "#a8907a"), (1, "#6a5040"))
    b = (f'<rect width="512" height="512" fill="url(#mi-bg)"/>'
         f'<g filter="url(#sh)"><rect x="140" y="80" width="232" height="370" rx="10" fill="#f7f2e8"/></g>'
         f'<clipPath id="mi-l"><rect x="160" y="100" width="96" height="350"/></clipPath><clipPath id="mi-r"><rect x="256" y="100" width="96" height="350"/></clipPath>'
         f'<g clip-path="url(#mi-l)"><rect x="160" y="100" width="192" height="350" fill="url(#mi-d1)"/><rect x="180" y="124" width="152" height="120" rx="8" fill="#fff" opacity=".18"/><rect x="180" y="268" width="152" height="150" rx="8" fill="#fff" opacity=".12"/></g>'
         f'<g clip-path="url(#mi-r)"><rect x="160" y="100" width="192" height="350" fill="url(#mi-d2)"/><rect x="180" y="124" width="152" height="120" rx="8" fill="#fff" opacity=".1"/><rect x="180" y="268" width="152" height="150" rx="8" fill="#fff" opacity=".08"/>'
         f'<path d="M280 180L310 200M300 330L330 312M290 380L318 396M320 150L336 166" stroke="#3a2a1a" stroke-width="4" stroke-linecap="round" opacity=".7"/><circle cx="320" cy="250" r="12" fill="#3a2a1a" opacity=".25"/></g>'
         f'<path d="M256 96V452" stroke="#fff" stroke-width="5" stroke-dasharray="10 8"/>'
         f'<circle cx="328" cy="296" r="10" fill="#ffd36a"/>'
         f'<g fill="#fff"><path d="M200 168L206 182 220 188 206 194 200 208 194 194 180 188 194 182Z"/><path d="M226 330L230 338 238 342 230 346 226 354 222 346 214 342 222 338Z"/></g>'
         f'<text x="208" y="78" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="34" fill="#1a7a5a">IN</text>'
         f'<text x="304" y="78" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="34" fill="#6a5040">OUT</text>')
    return svg(d, b)


# ── muse: a lyre whose strings are its own sound wave ────────────────────────────────────────────────────────────────
@icon
def muse():
    d = lg("mu-bg", (0, "#3a1060"), (1, "#12041f")) + lg("mu-g", (0, "#ffe8a8"), (1, "#d89a2a"))
    strings = "".join(f'<path d="M{206 + k * 25} 186 ' + " ".join(f"L{206 + k * 25 + 9 * math.sin(y / 14 + k):.1f} {y}" for y in range(196, 372, 8)) + f'" fill="none" stroke="{c}" stroke-width="4" filter="url(#glow)"/>' for k, c in enumerate(["#ff7ad8", "#c87aff", "#7ab8ff", "#7af0e0", "#ffe07a"]))
    b = (f'<rect width="512" height="512" fill="url(#mu-bg)"/>'
         + "".join(f'<circle cx="{(k * 71) % 512}" cy="{(k * 149) % 512}" r="{1 + (k % 3) * .6}" fill="#ffb8f0" opacity="{.2 + (k % 4) * .12}"/>' for k in range(30))
         + f'<g filter="url(#sh)"><path d="M176 380C140 330 136 230 170 170C184 146 214 132 226 150C236 166 214 176 206 196C196 220 202 300 222 360Z" fill="url(#mu-g)"/>'
         f'<path d="M336 380C372 330 376 230 342 170C328 146 298 132 286 150C276 166 298 176 306 196C316 220 310 300 290 360Z" fill="url(#mu-g)"/>'
         f'<rect x="170" y="364" width="172" height="34" rx="12" fill="url(#mu-g)"/><path d="M196 184H316" stroke="#d89a2a" stroke-width="14" stroke-linecap="round"/></g>{strings}'
         f'<g fill="#ffe8a8"><circle cx="380" cy="128" r="10"/><path d="M388 128V70L420 62V112" fill="none" stroke="#ffe8a8" stroke-width="6"/><circle cx="412" cy="114" r="10"/></g>')
    return svg(d, b)


# ── The Nest Registry: a nest, an egg wrapped like a present ─────────────────────────────────────────────────────────
@icon
def nest():
    d = lg("ne-bg", (0, "#ffe4d0"), (1, "#f5b8a0")) + rg("ne-egg", (0, "#ffffff"), (1, "#dfe8f0"), fx=.35, fy=.3) + lg("ne-n", (0, "#c8905a"), (1, "#7a4a24"))
    twigs = "".join(f'<path d="M{110 + k * 9} {300 + (k * 13) % 30}Q256 {360 + (k * 7) % 40} {402 - k * 9} {300 + (k * 17) % 30}" fill="none" stroke="{["#8a5a30", "#a8743e", "#6a4020"][k % 3]}" stroke-width="7" stroke-linecap="round"/>' for k in range(14))
    b = (f'<rect width="512" height="512" fill="url(#ne-bg)"/>'
         + "".join(f'<path d="M{x} {y}l6 12 12 6-12 6-6 12-6-12-12-6 12-6z" fill="#fff" opacity=".7"/>' for x, y in [(96, 120), (410, 96), (440, 220)])
         + f'<g filter="url(#sh)"><ellipse cx="256" cy="220" rx="78" ry="98" fill="url(#ne-egg)"/></g>'
         f'<path d="M256 122V318" stroke="#ff6a8a" stroke-width="18"/><path d="M178 226H334" stroke="#ff6a8a" stroke-width="18"/>'
         f'<path d="M256 124C226 96 196 104 204 124C212 142 240 134 256 124C272 134 300 142 308 124C316 104 286 96 256 124Z" fill="#ff4a72" stroke="#fff" stroke-width="3"/><circle cx="256" cy="124" r="10" fill="#d8285a"/>'
         f'<ellipse cx="228" cy="180" rx="14" ry="26" fill="#fff" opacity=".8" transform="rotate(20 228 180)"/>'
         f'<g filter="url(#sh2)"><path d="M100 290C108 380 176 420 256 420C336 420 404 380 412 290C360 322 152 322 100 290Z" fill="url(#ne-n)"/>{twigs}</g>')
    return svg(d, b)


# ── Moodfield: a face made of neurons, one half lifting, one half falling ────────────────────────────────────────────
@icon
def neural_sim():
    d = lg("mf-l", (0, "#ffd36a"), (1, "#ff8a3a"), x2=1, y2=1) + lg("mf-r", (0, "#3a7ad8"), (1, "#1a2a6a"), x2=1, y2=1)
    nodes = [(170, 190), (210, 150), (256, 140), (302, 150), (342, 190), (196, 230), (316, 230), (226, 300), (286, 300), (256, 250), (150, 260), (362, 260)]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (4, 6), (5, 9), (6, 9), (5, 7), (6, 8), (7, 8), (0, 10), (4, 11), (10, 7), (11, 8), (2, 9)]
    b = (f'<path d="M0 0H256V512H0Z" fill="url(#mf-l)"/><path d="M256 0H512V512H256Z" fill="url(#mf-r)"/>'
         f'<circle cx="256" cy="246" r="160" fill="#fff" opacity=".12"/>'
         + "".join(f'<path d="M{nodes[a][0]} {nodes[a][1]}L{nodes[c][0]} {nodes[c][1]}" stroke="#fff" stroke-width="4" opacity=".55"/>' for a, c in edges)
         + "".join(f'<circle cx="{x}" cy="{y}" r="{12 if x != 256 else 14}" fill="{"#fff8d8" if x < 256 else ("#d8e8ff" if x > 256 else "#fff")}" stroke="#fff" stroke-width="3" filter="url(#glow)"/>' for x, y in nodes)
         + f'<circle cx="206" cy="210" r="16" fill="#5a2a08"/><circle cx="306" cy="210" r="16" fill="#0a1238"/>'
         f'<path d="M184 352Q220 392 256 372" fill="none" stroke="#5a2a08" stroke-width="12" stroke-linecap="round"/><path d="M256 372Q292 352 328 380" fill="none" stroke="#0a1238" stroke-width="12" stroke-linecap="round"/>'
         f'<path d="M330 236C326 252 334 262 340 256C346 250 338 240 330 236Z" fill="#9ad8ff"/>')
    return svg(d, b)


# ── Skipline: a radio wave skipping off the sky like a stone on water ────────────────────────────────────────────────
@icon
def novarac():
    d = lg("sk-bg", (0, "#0e1a4a"), (.55, "#3a2a7a"), (.8, "#e8705a"), (1, "#ffb86a")) + lg("sk-sea", (0, "#1a2a5a"), (1, "#070c22"))
    sky = "M0 120Q256 40 512 120"
    hops = [(70, 400), (190, 140), (300, 400), (400, 160), (470, 380)]
    wave = "M70 400 " + " ".join(f"Q{(a[0] + b2[0]) / 2} {min(a[1], b2[1]) - (30 if b2[1] < 300 else -20)} {b2[0]} {b2[1]}" for a, b2 in zip(hops, hops[1:]))
    b = (f'<rect width="512" height="512" fill="url(#sk-bg)"/>'
         + "".join(f'<circle cx="{(k * 89) % 512}" cy="{(k * 37) % 120}" r="{.8 + (k % 3) * .6}" fill="#fff" opacity=".6"/>' for k in range(26))
         + f'<path d="{sky}" fill="none" stroke="#b8a8ff" stroke-width="6" stroke-dasharray="2 12" stroke-linecap="round" opacity=".8"/>'
         f'<path d="M0 400H512V512H0Z" fill="url(#sk-sea)"/>'
         + "".join(f'<ellipse cx="{x}" cy="404" rx="{30 - k * 6}" ry="{6 - k}" fill="none" stroke="#ffb86a" stroke-width="3" opacity="{.8 - k * .25:.2f}"/>' for x in (70, 300) for k in range(3))
         + f'<path d="M70 400L190 140 300 400 400 160 470 380" fill="none" stroke="#ffe08a" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)"/>'
         + "".join(f'<circle cx="{x}" cy="{y}" r="9" fill="#fff"/>' for x, y in hops[1:4:2])
         + f'<g transform="translate(70 400)"><path d="M-10 0V-46M-22 -46H2M-16 -46L-10 -60 -4 -46" stroke="#fff" stroke-width="5" fill="none" stroke-linejoin="round"/></g>'
         f'<g fill="none" stroke="#ffe08a" stroke-width="4" stroke-linecap="round"><path d="M452 360A24 24 0 0 1 488 360"/><path d="M444 344A40 40 0 0 1 496 344"/></g>')
    return svg(d, b, grain=.09)


# ── NULLSPACE: the N, torn across a void in two colours ──────────────────────────────────────────────────────────────
@icon
def nullspace():
    d = (lg("ns-bg", (0, "#170a2e"), (1, "#03020a")) + rg("ns-void", (0, "#000"), (.6, "#12062a"), (1, "#3a10a0", 0))
         + '<pattern id="ns-scan" width="512" height="10" patternUnits="userSpaceOnUse"><rect width="512" height="1.5" y="8" fill="#3df2ff" opacity=".09"/></pattern>')
    N = "M156 386V126L356 386V126"
    slices = [(150, 182, -16), (230, 252, 22), (318, 336, -10)]
    clips = "".join(f'<clipPath id="ns-c{k}"><rect x="0" y="{y0}" width="512" height="{y1 - y0}"/></clipPath>' for k, (y0, y1, dx) in enumerate(slices))
    glitch = "".join(f'<g clip-path="url(#ns-c{k})" transform="translate({dx} 0)"><path d="{N}" fill="none" stroke="#f4f2ff" stroke-width="38" stroke-linecap="square" stroke-linejoin="miter"/></g>' for k, (y0, y1, dx) in enumerate(slices))
    b = (f'<defs>{clips}</defs><rect width="512" height="512" fill="url(#ns-bg)"/><circle cx="256" cy="256" r="230" fill="url(#ns-void)"/>'
         + "".join(f'<circle cx="256" cy="256" r="{r}" fill="none" stroke="#8b3dff" stroke-width="2" opacity="{.5 - k * .1:.1f}"/>' for k, r in enumerate([120, 170, 220]))
         + f'<g fill="none" stroke-width="38" stroke-linecap="square" stroke-linejoin="miter"><path d="{N}" stroke="#ff2bd6" transform="translate(-11 3)" opacity=".95"/><path d="{N}" stroke="#25f4ff" transform="translate(11 -3)" opacity=".95"/>'
         f'<path d="{N}" stroke="#f4f2ff" filter="url(#glow)"/></g>{glitch}'
         f'<rect x="96" y="232" width="320" height="6" fill="#25f4ff" opacity=".7"/><rect x="150" y="300" width="200" height="4" fill="#ff2bd6" opacity=".7"/>'
         f'<rect width="512" height="512" fill="url(#ns-scan)"/>'
         f'<g fill="none" stroke="#25f4ff" stroke-width="12" stroke-linecap="square"><path d="M64 140V64h76M448 372v76h-76"/></g>'
         f'<path d="M256 420l16 16-16 16-16-16z" fill="#ffe14a" filter="url(#glow)"/>'
         f'<text x="420" y="104" text-anchor="end" font-family="Courier New, monospace" font-weight="700" font-size="22" fill="#ff2bd6" opacity=".9">∅</text>')
    return svg(d, b, grain=.12, sheen=False)


# ── Omnilogos: many books fanned open into a sunburst, one light at the centre ───────────────────────────────────────
@icon
def omnilogos():
    d = rg("ol-bg", (0, "#5a1a1a"), (1, "#1a0606"), cy=.62, r=.8) + rg("ol-l", (0, "#fff8e0"), (.4, "#ffd36a"), (1, "#ff9a2a", 0))
    cols = ["#e8d8b0", "#f2e6c8", "#dcc89a", "#f7efd8", "#e0cca0"]
    fan = "".join(f'<g transform="rotate({a} 256 380)"><path d="M256 380L236 150Q256 140 276 150Z" fill="{cols[k % 5]}" stroke="#7a3a1a" stroke-width="2"/><path d="M256 370L256 160" stroke="#a8784a" stroke-width="1.5" opacity=".5"/></g>' for k, a in enumerate(range(-80, 81, 10)))
    b = (f'<rect width="512" height="512" fill="url(#ol-bg)"/><circle cx="256" cy="380" r="260" fill="url(#ol-l)" opacity=".35"/>'
         f'<g filter="url(#sh)">{fan}</g>'
         f'<circle cx="256" cy="380" r="54" fill="url(#ol-l)" filter="url(#glow)"/><circle cx="256" cy="380" r="22" fill="#fff8e0"/>'
         f'<path d="M96 440H416" stroke="#d8a85a" stroke-width="6" stroke-linecap="round"/>'
         f'<text x="256" y="104" text-anchor="middle" font-family="Georgia, serif" font-size="40" fill="#ffd36a" opacity=".9" letter-spacing="8">א Α A</text>')
    return svg(d, b)


# ── Overhead: a satellite crossing the sky over one house, its pass drawn in ─────────────────────────────────────────
@icon
def orbit():
    d = lg("ov-bg", (0, "#0a1f3a"), (.75, "#14476a"), (1, "#2a8aa0")) + rg("ov-s", (0, "#ffffff"), (1, "#7ad8ff", 0))
    b = (f'<rect width="512" height="512" fill="url(#ov-bg)"/>'
         + "".join(f'<circle cx="{(k * 97) % 512}" cy="{(k * 61) % 330}" r="{.8 + (k % 3) * .6}" fill="#fff" opacity="{.3 + (k % 4) * .14}"/>' for k in range(40))
         + f'<path d="M40 380Q256 40 472 380" fill="none" stroke="#7ad8ff" stroke-width="5" stroke-dasharray="3 14" stroke-linecap="round"/>'
         f'<path d="M40 380Q150 180 256 168" fill="none" stroke="#7ad8ff" stroke-width="6" stroke-linecap="round" opacity=".9"/>'
         f'<circle cx="256" cy="168" r="70" fill="url(#ov-s)" opacity=".4"/>'
         f'<g transform="translate(256 168) rotate(-12)" filter="url(#glow)"><rect x="-14" y="-12" width="28" height="24" rx="3" fill="#fff"/>'
         f'<rect x="-66" y="-10" width="44" height="20" fill="#3a8aff" stroke="#bfe8ff" stroke-width="2"/><rect x="22" y="-10" width="44" height="20" fill="#3a8aff" stroke="#bfe8ff" stroke-width="2"/>'
         f'<path d="M-44 -10V10M44 -10V10" stroke="#bfe8ff" stroke-width="2"/></g>'
         f'<path d="M0 440Q256 400 512 440V512H0Z" fill="#06121f"/>'
         f'<g filter="url(#sh2)"><path d="M206 440V380L256 340 306 380V440Z" fill="#0f2238"/><rect x="236" y="390" width="40" height="34" rx="3" fill="#ffd36a"/></g>'
         f'<path d="M256 330L256 240" stroke="#ffd36a" stroke-width="3" stroke-dasharray="4 6" opacity=".7"/>'
         f'<text x="452" y="96" text-anchor="end" font-family="Courier New, monospace" font-weight="700" font-size="26" fill="#bfe8ff">21:14</text>')
    return svg(d, b, grain=.09)


# ── About FaberOS: a cut gem, an F in its facets ─────────────────────────────────────────────────────────────────────
@icon
def os_about():
    d = rg("oa-bg", (0, "#4a2a08"), (1, "#120802"), r=.75) + lg("oa-a", (0, "#ffe9a8"), (1, "#e8a030")) + lg("oa-b", (0, "#d8901a"), (1, "#7a4a08")) + lg("oa-c", (0, "#fff4d0"), (1, "#f0c060"))
    cx, cy = 256, 256
    P = [(cx + 160 * math.cos(math.radians(a)), cy + 160 * math.sin(math.radians(a))) for a in range(-90, 270, 60)]
    facets = "".join(f'<path d="M{cx} {cy}L{P[k][0]:.1f} {P[k][1]:.1f}L{P[(k + 1) % 6][0]:.1f} {P[(k + 1) % 6][1]:.1f}Z" fill="url(#oa-{"abc"[k % 3]})" stroke="#fff3d0" stroke-width="2" stroke-opacity=".6"/>' for k in range(6))
    b = (f'<rect width="512" height="512" fill="url(#oa-bg)"/><circle cx="256" cy="256" r="220" fill="#ffd36a" opacity=".08"/>'
         f'<g filter="url(#sh)">{facets}</g>'
         f'<polygon points="{poly(cx, cy, 76, 6, -math.pi / 2)}" fill="#2a1604" stroke="#fff3d0" stroke-width="3"/>'
         f'<path d="M236 222H284M236 222V292M236 254H272" fill="none" stroke="#ffd36a" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>'
         f'<path d="M170 140L210 120" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".7"/>')
    return svg(d, b)


# ── Routines: the day going round, sun to moon, steps ticked off on the way ──────────────────────────────────────────
@icon
def os_routines():
    d = lg("or-bg", (0, "#1a8a6a"), (1, "#0a3a2e")) + rg("or-sun", (0, "#fff6c8"), (1, "#ffb83a"), fx=.35, fy=.35)
    b = (f'<rect width="512" height="512" fill="url(#or-bg)"/>'
         f'<circle cx="256" cy="256" r="166" fill="none" stroke="#bff0d8" stroke-width="14" stroke-dasharray="40 18" opacity=".35"/>'
         f'<path d="M256 90A166 166 0 0 1 420 236" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round"/><path d="M398 216L422 246 446 214" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>'
         f'<circle cx="150" cy="136" r="36" fill="url(#or-sun)" filter="url(#glow)"/>'
         f'<path d="M376 396A36 36 0 1 1 352 336A28 28 0 1 0 376 396Z" fill="#e8ecff"/>'
         f'<g filter="url(#sh)"><rect x="176" y="186" width="160" height="150" rx="20" fill="#fffdf6"/></g>'
         + "".join(f'<rect x="196" y="{206 + k * 40}" width="26" height="26" rx="7" fill="{"#1a8a6a" if k < 2 else "none"}" stroke="#1a8a6a" stroke-width="4"/>'
                   + (f'<path d="M202 {219 + k * 40}L208 {225 + k * 40} 217 {212 + k * 40}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' if k < 2 else "")
                   + f'<path d="M236 {219 + k * 40}H{312 - k * 16}" stroke="#7a8a80" stroke-width="8" stroke-linecap="round" opacity="{.8 if k < 2 else .45}"/>' for k in range(3)))
    return svg(d, b)


# ── Settings: a precision dial, its pointer set just so ──────────────────────────────────────────────────────────────
@icon
def os_settings():
    d = rg("os-bg", (0, "#2a4a8a"), (1, "#0a1430"), r=.75) + rg("os-k", (0, "#f4f6ff"), (.6, "#a8b4d8"), (1, "#5a6a98"), fx=.35, fy=.3) + lg("os-r", (0, "#3a4a7a"), (1, "#141c38"))
    ticks = "".join(f'<path d="M{256 + 150 * math.cos(math.radians(a)):.1f} {256 + 150 * math.sin(math.radians(a)):.1f}L{256 + (128 if k % 5 else 118) * math.cos(math.radians(a)):.1f} {256 + (128 if k % 5 else 118) * math.sin(math.radians(a)):.1f}" stroke="{"#7af0ff" if a < 30 + 135 and k <= 14 else "#7a8ab8"}" stroke-width="{5 if k % 5 == 0 else 3}" stroke-linecap="round"/>' for k, a in enumerate(range(135, 406, 9)))
    b = (f'<rect width="512" height="512" fill="url(#os-bg)"/>'
         f'<circle cx="256" cy="256" r="168" fill="url(#os-r)" stroke="#5a6aa8" stroke-width="3"/>{ticks}'
         f'<g filter="url(#sh)"><circle cx="256" cy="256" r="98" fill="url(#os-k)"/></g>'
         + "".join(f'<path d="M{256 + 98 * math.cos(math.radians(a)):.1f} {256 + 98 * math.sin(math.radians(a)):.1f}L{256 + 86 * math.cos(math.radians(a)):.1f} {256 + 86 * math.sin(math.radians(a)):.1f}" stroke="#5a6a98" stroke-width="3"/>' for a in range(0, 360, 12))
         + f'<circle cx="256" cy="256" r="70" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>'
         f'<path d="M256 256L{256 + 74 * math.cos(math.radians(-20)):.1f} {256 + 74 * math.sin(math.radians(-20)):.1f}" stroke="#ff6a3a" stroke-width="12" stroke-linecap="round"/>'
         f'<circle cx="256" cy="256" r="12" fill="#5a6a98"/>')
    return svg(d, b)


# ── Shelf: a floating wooden shelf, the apps a person keeps on it ────────────────────────────────────────────────────
@icon
def os_shelf():
    d = lg("sh-bg", (0, "#f2e2c8"), (1, "#d8b890")) + lg("sh-w", (0, "#b8743a"), (1, "#7a4a1f"))
    tile = lambda x, y, w, h, c: f'<g filter="url(#sh2)"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{w * .24:.0f}" fill="{c}"/><rect x="{x}" y="{y}" width="{w}" height="{h * .45:.0f}" rx="{w * .24:.0f}" fill="#fff" opacity=".18"/></g>'
    b = (f'<rect width="512" height="512" fill="url(#sh-bg)"/>'
         + "".join(f'<path d="M0 {y}H512" stroke="#c8a070" stroke-opacity=".25" stroke-width="2"/>' for y in range(20, 512, 40))
         + tile(120, 140, 78, 78, "#3a7ad8") + tile(214, 120, 88, 98, "#e8503a") + tile(318, 150, 70, 68, "#f0b030")
         + f'<rect x="96" y="218" width="320" height="22" rx="6" fill="url(#sh-w)" filter="url(#sh)"/>'
         + tile(132, 286, 66, 82, "#3ab88a") + tile(212, 276, 86, 92, "#8a5ad8") + tile(312, 300, 74, 68, "#1a2a5a")
         + f'<rect x="96" y="368" width="320" height="22" rx="6" fill="url(#sh-w)" filter="url(#sh)"/>'
         f'<path d="M232 152L262 170 232 188Z" fill="#fff"/><circle cx="159" cy="179" r="16" fill="none" stroke="#fff" stroke-width="6"/><path d="M332 170H374M332 186H364" stroke="#fff" stroke-width="6" stroke-linecap="round"/>'
         f'<path d="M150 326L164 340 186 312" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M255 296L262 312 280 314 266 324 270 342 255 332 240 342 244 324 230 314 248 312Z" fill="#fff"/>'
         f'<path d="M336 334A16 16 0 1 1 352 318A12 12 0 1 0 336 334Z" fill="#ffe08a"/>')
    return svg(d, b, sheen=False)


# ── Device Passport: a navy passport, stamped by every repair shop it's been through ─────────────────────────────────
@icon
def passport():
    d = lg("dp-bg", (0, "#e8c070"), (1, "#c08a2a")) + lg("dp-c", (0, "#24386a"), (1, "#0e1a3a")) + lg("dp-g", (0, "#fff0b8"), (1, "#c8902a"))
    b = (f'<rect width="512" height="512" fill="url(#dp-bg)"/>'
         f'<g filter="url(#sh)" transform="rotate(-6 256 256)"><rect x="128" y="88" width="250" height="340" rx="18" fill="url(#dp-c)"/><rect x="128" y="88" width="24" height="340" rx="10" fill="#000" opacity=".25"/>'
         f'<text x="265" y="142" text-anchor="middle" font-family="Georgia, serif" font-size="24" letter-spacing="6" fill="#e8c070">PASSPORT</text>'
         f'<rect x="222" y="170" width="86" height="148" rx="16" fill="none" stroke="url(#dp-g)" stroke-width="8"/><circle cx="265" cy="300" r="6" fill="#e8c070"/>'
         f'<path d="M242 244L258 260 290 226" fill="none" stroke="#e8c070" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'
         f'<path d="M190 362H340M210 388H320" stroke="#e8c070" stroke-width="5" stroke-linecap="round" opacity=".7"/></g>'
         f'<g transform="rotate(16 380 380)"><circle cx="380" cy="380" r="64" fill="#fff" fill-opacity=".8" stroke="#d6283a" stroke-width="6"/><circle cx="380" cy="380" r="50" fill="none" stroke="#d6283a" stroke-width="2" stroke-dasharray="5 5"/>'
         f'<path d="M358 400L392 366M388 362C394 356 404 358 404 366L398 368 396 362" fill="none" stroke="#d6283a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'
         f'<text x="380" y="342" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="13" fill="#d6283a" letter-spacing="2">REPAIRED</text></g>'
         f'<g transform="rotate(-20 110 140)"><rect x="60" y="110" width="110" height="60" rx="8" fill="none" stroke="#1a7a5a" stroke-width="5"/><text x="115" y="150" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="26" fill="#1a7a5a">OK</text></g>')
    return svg(d, b, sheen=False)


# ── Phone MCP: a phone whose screen is a console, plugged into a server ──────────────────────────────────────────────
@icon
def phone_mcp():
    d = lg("pm-bg", (0, "#3a0a4a"), (1, "#12031a")) + lg("pm-s", (0, "#14081e"), (1, "#0a0410"))
    b = (f'<rect width="512" height="512" fill="url(#pm-bg)"/>'
         + "".join(f'<path d="M0 {y}H512" stroke="#ff4ad8" stroke-opacity=".06" stroke-width="2"/>' for y in range(0, 512, 16))
         + f'<g filter="url(#sh)"><rect x="150" y="76" width="212" height="330" rx="34" fill="#2a1a3a" stroke="#ff7ae0" stroke-width="5"/><rect x="168" y="106" width="176" height="270" rx="14" fill="url(#pm-s)"/></g>'
         f'<text x="184" y="160" font-family="Courier New, monospace" font-weight="700" font-size="30" fill="#7af0c0">&gt; tools</text>'
         f'<text x="184" y="198" font-family="Courier New, monospace" font-size="22" fill="#ff9ae8" opacity=".85">· screenshot</text>'
         f'<text x="184" y="228" font-family="Courier New, monospace" font-size="22" fill="#ff9ae8" opacity=".85">· tap</text>'
         f'<text x="184" y="258" font-family="Courier New, monospace" font-size="22" fill="#ff9ae8" opacity=".85">· type</text>'
         f'<rect x="184" y="290" width="18" height="30" fill="#7af0c0" filter="url(#glow)"/>'
         f'<path d="M256 406V446C256 470 286 474 306 462L360 430" fill="none" stroke="#ff7ae0" stroke-width="12" stroke-linecap="round"/>'
         f'<g transform="translate(372 420) rotate(-30)"><rect x="-6" y="-22" width="40" height="44" rx="8" fill="#ff7ae0"/><path d="M34 -12H52M34 12H52" stroke="#ffd8f4" stroke-width="7" stroke-linecap="round"/></g>')
    return svg(d, b)


# ── Nobody: a blank face, and where the mouth would be, a voice that never stops ─────────────────────────────────────
@icon
def pi():
    d = lg("nb-bg", (0, "#0a1a12"), (1, "#020806")) + rg("nb-f", (0, "#5a7a6a"), (.6, "#24382e"), (1, "#0e1812"), fx=.35, fy=.3)
    wave = "M156 330 " + " ".join(f"L{156 + k * 5} {330 + (math.sin(k * .55) * (6 + 22 * math.exp(-((k - 20) / 9) ** 2))):.1f}" for k in range(41))
    b = (f'<rect width="512" height="512" fill="url(#nb-bg)"/>'
         f'<g filter="url(#sh)"><path d="M256 74C170 74 124 146 128 236C132 330 186 418 256 418C326 418 380 330 384 236C388 146 342 74 256 74Z" fill="url(#nb-f)" stroke="#3aff9a" stroke-opacity=".7" stroke-width="5" filter="url(#glow)"/></g>'
         f'<path d="M190 120C214 102 244 96 270 98" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="10" stroke-linecap="round"/>'
         f'<path d="{wave}" fill="none" stroke="#3aff9a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>'
         f'<circle cx="420" cy="96" r="12" fill="#3aff9a" filter="url(#glow)"/>')
    return svg(d, b, grain=.1)


# ── Pilotfish: the shark and its pilot fish, seen at the waterline, sunlight coming through ──────────────────────────
@icon
def pilotfish():
    d = (lg("pf-sky", (0, "#bff3f6"), (1, "#7fe3ea")) + lg("pf-sea", (0, "#2fb3c2"), (.6, "#137a90"), (1, "#0a3f55"))
         + lg("pf-fin", (0, "#4a6a7a"), (1, "#24404e")) + lg("pf-ray", (0, "#fff", .35), (1, "#fff", 0)))
    rays = "".join(f'<path d="M{x} 236L{x - 30} 512H{x + 30}Z" fill="url(#pf-ray)"/>' for x in (120, 250, 380))
    fish = lambda x, y, s, c: (f'<g transform="translate({x} {y}) scale({s})"><path d="M-46 0C-30-18 4-22 26-10L46-24V24L26 10C4 22-30 18-46 0Z" fill="{c}"/>'
                                f'<path d="M-30-12V12M-14-15V15M2-14V14" stroke="#0a3f55" stroke-width="6" opacity=".55"/><circle cx="-34" cy="-3" r="4" fill="#fff"/></g>')
    b = (f'<rect width="512" height="512" fill="url(#pf-sky)"/><circle cx="410" cy="96" r="38" fill="#fff" opacity=".85"/>'
         f'<path d="M0 236H512V512H0Z" fill="url(#pf-sea)"/>{rays}'
         f'<path d="M168 236C220 220 262 160 284 90C296 150 330 210 390 236Z" fill="url(#pf-fin)"/>'
         f'<g filter="url(#sh2)"><path d="M60 360C120 300 260 290 360 320C410 334 450 350 470 370C450 392 400 404 352 410C250 424 120 418 60 360Z" fill="url(#pf-fin)" opacity=".85"/></g>'
         f'<path d="M0 236C40 226 84 226 128 236S216 246 260 236 348 226 392 236 470 246 512 236" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>'
         f'{fish(150, 452, .8, "#ffd36a")}{fish(250, 466, .65, "#ffd36a")}'
         + "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>' for x, y, r in [(108, 420, 6), (96, 392, 4), (114, 370, 3)]))
    return svg(d, b, sheen=False)


# ── Privacy: a keyhole of light in a shield, a fingerprint behind it ─────────────────────────────────────────────────
@icon
def privacy():
    d = lg("pv-bg", (0, "#0a2a4a"), (1, "#031020")) + lg("pv-s", (0, "#3aa8e8"), (1, "#14508a")) + rg("pv-k", (0, "#fff"), (.5, "#bff0ff"), (1, "#7ad8ff"))
    fp = "".join(f'<path d="M{256 - r} {290 + r * .2:.0f}C{256 - r} {230 - r * .6:.0f} {256 + r} {230 - r * .6:.0f} {256 + r} {290 + r * .2:.0f}" fill="none" stroke="#7ad8ff" stroke-width="4" stroke-linecap="round" opacity=".35"/>' for r in range(30, 121, 18))
    b = (f'<rect width="512" height="512" fill="url(#pv-bg)"/>'
         f'<g filter="url(#sh)"><path d="M256 70L404 124V250C404 344 340 410 256 446C172 410 108 344 108 250V124Z" fill="url(#pv-s)"/></g>'
         f'<path d="M256 96L382 142V250C382 330 328 388 256 420Z" fill="#fff" opacity=".1"/>{fp}'
         f'<g filter="url(#glow)"><circle cx="256" cy="220" r="40" fill="url(#pv-k)"/><path d="M234 244H278L294 340H218Z" fill="url(#pv-k)"/></g>'
         f'<path d="M140 136L256 92" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".5"/>')
    return svg(d, b)


# ── Bodywake: Wi-Fi waves rippling round a body, its shadow the only trace ───────────────────────────────────────────
@icon
def proximity():
    d = lg("bw-bg", (0, "#0e3a2a"), (1, "#03140c")) + rg("bw-r", (0, "#7affc0", .0), (.7, "#7affc0", .0), (1, "#7affc0", .5))
    person = '<circle cx="300" cy="190" r="30"/><path d="M260 236C260 222 340 222 340 236L352 330H332L324 420H306L300 350L294 420H276L268 330H248Z"/>'
    arcs = "".join(f'<path d="M{110} {300 - r}A{r} {r} 0 0 1 {110} {300 + r}" fill="none" stroke="#7affc0" stroke-width="7" stroke-linecap="round" opacity="{.9 - k * .14:.2f}" stroke-dasharray="{"" if r < 150 else "28 14"}"/>' for k, r in enumerate(range(40, 330, 48)))
    b = (f'<rect width="512" height="512" fill="url(#bw-bg)"/>'
         + "".join(f'<path d="M0 {y}H512" stroke="#7affc0" stroke-opacity=".05" stroke-width="2"/>' for y in range(0, 512, 24))
         + f'<clipPath id="bw-c"><rect width="512" height="512"/></clipPath><g clip-path="url(#bw-c)">{arcs}</g>'
         f'<g fill="#03140c" stroke="#7affc0" stroke-width="5" stroke-dasharray="10 8" filter="url(#glow)">{person}</g>'
         f'<ellipse cx="300" cy="430" rx="70" ry="12" fill="#7affc0" opacity=".25"/>'
         f'<g transform="translate(110 300)"><circle r="20" fill="#7affc0" filter="url(#glow)"/><path d="M-8 30L0 60 8 30" fill="#7affc0"/></g>')
    return svg(d, b, grain=.1)


# ── Recall Watch: the toaster pops up a warning instead of toast ─────────────────────────────────────────────────────
@icon
def recall():
    d = lg("rw-bg", (0, "#ffe2a8"), (1, "#ffb05a")) + lg("rw-t", (0, "#e8eef6"), (.5, "#b8c4d4"), (1, "#7a889c")) + lg("rw-w", (0, "#ffe04a"), (1, "#ffb000"))
    b = (f'<rect width="512" height="512" fill="url(#rw-bg)"/>'
         + "".join(f'<path d="M{x} {y}L{x + 10} {y - 22}" stroke="#d8501a" stroke-width="7" stroke-linecap="round" opacity=".6"/>' for x, y in [(150, 120), (330, 108), (366, 140), (120, 160)])
         + f'<g filter="url(#sh2)" transform="translate(0 -18)"><path d="M256 88L338 232H174Z" fill="url(#rw-w)" stroke="#3a2600" stroke-width="8" stroke-linejoin="round"/>'
         f'<path d="M256 136V184" stroke="#3a2600" stroke-width="14" stroke-linecap="round"/><circle cx="256" cy="208" r="9" fill="#3a2600"/></g>'
         f'<g filter="url(#sh)"><path d="M120 248C120 220 140 206 170 206H342C372 206 392 220 392 248V384C392 408 374 424 350 424H162C138 424 120 408 120 384Z" fill="url(#rw-t)"/></g>'
         f'<rect x="180" y="220" width="152" height="18" rx="9" fill="#3a3f4a"/>'
         f'<path d="M140 250C150 236 166 230 186 230" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".8"/>'
         f'<rect x="392" y="290" width="22" height="50" rx="8" fill="#3a3f4a"/><circle cx="196" cy="350" r="22" fill="#d6283a" stroke="#fff" stroke-width="4"/>'
         f'<path d="M240 340H350M240 362H320" stroke="#7a889c" stroke-width="6" stroke-linecap="round"/>'
         f'<rect x="140" y="424" width="40" height="14" rx="5" fill="#3a3f4a"/><rect x="332" y="424" width="40" height="14" rx="5" fill="#3a3f4a"/>')
    return svg(d, b)


# ── The Home Record: the house's years as tree rings, read in its walls ──────────────────────────────────────────────
@icon
def record():
    d = lg("hr-bg", (0, "#2a4a8a"), (1, "#0e1a3a")) + rg("hr-w", (0, "#f4d8a8"), (1, "#b8823e"))
    rings = "".join(f'<circle cx="256" cy="300" r="{r}" fill="none" stroke="#8a5a26" stroke-width="{3 if k % 3 else 5}" opacity="{.55 + (k % 3) * .1:.2f}"/>' for k, r in enumerate(range(14, 160, 13)))
    b = (f'<rect width="512" height="512" fill="url(#hr-bg)"/>'
         f'<clipPath id="hr-h"><path d="M108 230L256 104 404 230V430H108Z"/></clipPath>'
         f'<g filter="url(#sh)"><path d="M108 230L256 104 404 230V430H108Z" fill="url(#hr-w)"/></g>'
         f'<g clip-path="url(#hr-h)">{rings}<path d="M256 300L380 196" stroke="#5a3410" stroke-width="3" opacity=".5"/></g>'
         f'<path d="M92 236L256 96 420 236" fill="none" stroke="#fff4dc" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>'
         + "".join(f'<g transform="translate({256 + r * .7:.0f} {300 - r * .7:.0f})"><circle r="9" fill="#ffd36a" stroke="#fff" stroke-width="3"/></g>' for r in (40, 92, 140))
         + f'<text x="404" y="470" text-anchor="end" font-family="Georgia, serif" font-style="italic" font-size="30" fill="#bfd4ff" opacity=".85">est. 1962</text>')
    return svg(d, b)


# ── Repair Café: a cup whose handle is a wrench, its steam turning a gear ────────────────────────────────────────────
@icon
def repair():
    d = lg("rc-bg", (0, "#2a8a5a"), (1, "#0e3a24")) + lg("rc-c", (0, "#fffaf0"), (1, "#e4d8c0")) + lg("rc-wr", (0, "#e8eef4"), (1, "#8a98a8"))
    gear = f'<polygon points="{star(256, 118, 46, 36, 10, 0)}" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round" opacity=".85"/><circle cx="256" cy="118" r="14" fill="none" stroke="#fff" stroke-width="7" opacity=".85"/>'
    b = (f'<rect width="512" height="512" fill="url(#rc-bg)"/>'
         f'<path d="M214 202C202 186 222 174 214 160M298 202C286 186 306 174 298 160" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".7"/>{gear}'
         f'<ellipse cx="256" cy="420" rx="170" ry="24" fill="#08241a" opacity=".6"/><ellipse cx="256" cy="412" rx="150" ry="18" fill="#e4d8c0"/>'
         f'<g filter="url(#sh)"><path d="M146 226H346V340C346 380 316 406 276 406H216C176 406 146 380 146 340Z" fill="url(#rc-c)"/>'
         f'<g transform="translate(346 300) rotate(-8)"><rect x="0" y="-12" width="70" height="24" rx="8" fill="url(#rc-wr)"/><path d="M62 -30C98 -30 104 0 92 12L80 2 72 12 82 24C66 34 52 20 56 0Z" fill="url(#rc-wr)"/></g></g>'
         f'<ellipse cx="246" cy="226" rx="100" ry="14" fill="#6a3a1a"/><ellipse cx="246" cy="224" rx="92" ry="10" fill="#8a4a22"/>'
         f'<path d="M226 300C226 286 240 278 250 286C260 278 274 286 274 300C274 316 250 330 250 330C250 330 226 316 226 300Z" fill="#e8503a"/>'
         f'<path d="M164 244V330" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".7"/>')
    return svg(d, b)


# ── Phosphor: the old set warming up, its screen one glowing amber dot ───────────────────────────────────────────────
@icon
def roku():
    d = lg("ph-bg", (0, "#2a1608"), (1, "#0a0502")) + lg("ph-tv", (0, "#7a4a24"), (1, "#3a1e0c")) + rg("ph-s", (0, "#fff2c0"), (.25, "#ffb03a"), (.7, "#5a2a08"), (1, "#1a0c04"))
    scan = "".join(f'<path d="M150 {y}H362" stroke="#000" stroke-opacity=".25" stroke-width="2"/>' for y in range(170, 360, 6))
    b = (f'<rect width="512" height="512" fill="url(#ph-bg)"/><circle cx="256" cy="262" r="200" fill="#ffb03a" opacity=".08" filter="url(#blur20)"/>'
         f'<path d="M210 132L162 64M302 132L350 64" stroke="#c8a070" stroke-width="6" stroke-linecap="round"/><circle cx="162" cy="64" r="8" fill="#ffd38a"/><circle cx="350" cy="64" r="8" fill="#ffd38a"/>'
         f'<g filter="url(#sh)"><rect x="104" y="132" width="304" height="262" rx="34" fill="url(#ph-tv)"/></g>'
         f'<rect x="132" y="156" width="248" height="212" rx="40" fill="url(#ph-s)"/>{scan}'
         f'<path d="M150 262H362" stroke="#fff4d0" stroke-width="3" opacity=".7" filter="url(#glow)"/><circle cx="256" cy="262" r="16" fill="#fff8e0" filter="url(#glow)"/>'
         f'<path d="M150 180C200 166 260 164 300 170" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="8" stroke-linecap="round"/>'
         f'<path d="M150 394L130 432M362 394L382 432" stroke="#3a1e0c" stroke-width="12" stroke-linecap="round"/>'
         f'<circle cx="388" cy="372" r="6" fill="#7aff7a" filter="url(#glow)"/>')
    return svg(d, b)


# ── Root Cause: a run of dominoes falling, the first one lit red ─────────────────────────────────────────────────────
@icon
def rootcause():
    d = lg("rt-bg", (0, "#1a1a2a"), (1, "#06060c")) + lg("rt-d", (0, "#f4f4f8"), (1, "#b8b8c8")) + lg("rt-r", (0, "#ff7a6a"), (1, "#c8141a"))
    dom = lambda x, rot, fill, dots: (f'<g transform="rotate({rot} {x + 22} 420)" filter="url(#sh2)"><rect x="{x}" y="250" width="44" height="170" rx="8" fill="{fill}"/>'
                                       f'<path d="M{x + 8} 335H{x + 36}" stroke="#1a1a2a" stroke-width="3" opacity=".5"/>' + "".join(f'<circle cx="{x + 22 + dx}" cy="{280 + dy}" r="5" fill="#1a1a2a"/>' for dx, dy in dots) + "</g>")
    b = (f'<rect width="512" height="512" fill="url(#rt-bg)"/><path d="M0 420H512V512H0Z" fill="#0e0e18"/><path d="M0 420H512" stroke="#3a3a5a" stroke-width="3"/>'
         + dom(400, 0, "url(#rt-d)", [(0, 0)]) + dom(322, 10, "url(#rt-d)", [(-10, -6), (10, 6)]) + dom(244, 24, "url(#rt-d)", [(-10, -8), (0, 0), (10, 8)])
         + dom(166, 40, "url(#rt-d)", [(-10, -8), (10, -8), (-10, 8), (10, 8)]) + dom(88, 56, "url(#rt-r)", [(0, 0)])
         + f'<g transform="translate(110 150)" filter="url(#glow)"><rect x="-34" y="-22" width="68" height="44" rx="10" fill="#ff4a3a"/><path d="M-12 -6H12M-12 6H6" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>'
         f'<g stroke="#ff7a6a" stroke-width="5" stroke-linecap="round"><path d="M54 126L40 118M54 174L40 182M166 126L180 118M166 174L180 182"/></g>')
    return svg(d, b)


# ── SayTap: a finger on one big button, and the word coming out of it ────────────────────────────────────────────────
@icon
def saytap():
    d = lg("st-bg", (0, "#2a5ae8"), (1, "#0e2a8a")) + lg("st-k", (0, "#ffe27a"), (1, "#f0a01a")) + lg("st-h", (0, "#ffd8b8"), (1, "#e8a07a"))
    b = (f'<rect width="512" height="512" fill="url(#st-bg)"/>'
         f'<g filter="url(#sh)"><ellipse cx="226" cy="356" rx="150" ry="58" fill="#b8740e"/><ellipse cx="226" cy="330" rx="150" ry="58" fill="url(#st-k)"/></g>'
         f'<ellipse cx="200" cy="316" rx="70" ry="18" fill="#fff" opacity=".35"/>'
         f'<g filter="url(#sh2)"><path d="M300 330C300 300 290 220 296 190C300 170 326 170 330 190L340 260C350 240 382 246 382 268C394 254 420 262 418 286C430 278 452 290 448 314C446 360 426 404 380 420C340 432 300 392 300 330Z" fill="url(#st-h)"/></g>'
         f'<g transform="translate(150 132)" filter="url(#sh2)"><path d="M-80 -46H80C96 -46 106 -36 106 -20V20C106 36 96 46 80 46H-20L-52 76V46H-80C-96 46-106 36-106 20V-20C-106-36-96-46-80-46Z" fill="#fff"/>'
         f'<text y="16" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="44" fill="#2a5ae8">Hi!</text></g>'
         f'<g stroke="#ffe27a" stroke-width="7" stroke-linecap="round"><path d="M290 160L278 132M330 152L338 122M356 174L380 156"/></g>')
    return svg(d, b)


# ── Second Opinion: two lenses over one quote, the second one finding what the first missed ──────────────────────────
@icon
def second():
    d = lg("so-bg", (0, "#3ac8e0"), (1, "#14708a")) + lg("so-p", (0, "#fffdf6"), (1, "#e8e0cc"))
    lens = lambda x, y, r, rot: (f'<g transform="rotate({rot} {x} {y})"><path d="M{x} {y + r}V{y + r + 90}" stroke="#2a2a3a" stroke-width="22" stroke-linecap="round"/>'
                                  f'<circle cx="{x}" cy="{y}" r="{r}" fill="#bff4ff" fill-opacity=".35" stroke="#2a2a3a" stroke-width="12"/>'
                                  f'<path d="M{x - r * .6:.0f} {y - r * .3:.0f}A{r * .7:.0f} {r * .7:.0f} 0 0 1 {x - r * .1:.0f} {y - r * .65:.0f}" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".8"/></g>')
    b = (f'<rect width="512" height="512" fill="url(#so-bg)"/>'
         f'<g filter="url(#sh)" transform="rotate(-4 256 256)"><rect x="126" y="84" width="240" height="320" rx="12" fill="url(#so-p)"/>'
         f'<text x="150" y="134" font-family="Georgia, serif" font-weight="700" font-size="28" fill="#2a2a3a">QUOTE</text>'
         + "".join(f'<path d="M150 {170 + k * 34}H{290 - (k % 2) * 40}" stroke="#a8a090" stroke-width="7" stroke-linecap="round"/><text x="342" y="{177 + k * 34}" text-anchor="end" font-family="Arial, sans-serif" font-weight="700" font-size="20" fill="#5a5a6a">{["$80", "$120", "$640", "$45", "$90"][k]}</text>' for k in range(5))
         + f'<ellipse cx="318" cy="238" rx="38" ry="20" fill="none" stroke="#e8283a" stroke-width="5"/></g>'
         f'{lens(186, 300, 54, 30)}{lens(318, 236, 62, -30)}'
         f'<g transform="translate(410 110)"><circle r="30" fill="#ffd36a" stroke="#fff" stroke-width="4"/><text y="11" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="30" fill="#7a4a08">2</text></g>')
    return svg(d, b)


# ── The Shop: a lathe cutting, a curl of bright metal spiralling off the tool ────────────────────────────────────────
@icon
def shop():
    d = lg("sp-bg", (0, "#2a2e38"), (1, "#0c0e14")) + lg("sp-st", (0, "#f4f6fa"), (.5, "#a8b0c0"), (1, "#5a6070")) + lg("sp-ch", (0, "#ffd38a"), (1, "#e87a1a"))
    curl = "M282 268 " + " ".join(f"L{282 + 9 * t * math.cos(t * 1.9):.1f} {268 - 30 - 7 * t - 9 * t * math.sin(t * 1.9) * .5:.1f}" for t in [k * .25 for k in range(1, 40)])
    b = (f'<rect width="512" height="512" fill="url(#sp-bg)"/>'
         f'<text x="40" y="70" font-family="Courier New, monospace" font-size="24" fill="#7af0c0" opacity=".6">G01 X12.5 Z-40 F0.2</text>'
         f'<g filter="url(#sh)"><rect x="60" y="214" width="90" height="110" rx="10" fill="#3a4050" stroke="#7a8090" stroke-width="3"/>'
         f'<rect x="150" y="236" width="230" height="66" fill="url(#sp-st)"/>'
         + "".join(f'<path d="M{160 + k * 14} 236V302" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>' for k in range(9))
         + f'<rect x="380" y="226" width="70" height="86" rx="8" fill="#3a4050" stroke="#7a8090" stroke-width="3"/>'
         f'<path d="M262 380L282 304 302 380Z" fill="#e8b440" stroke="#fff4d0" stroke-width="3"/><rect x="238" y="380" width="88" height="40" rx="6" fill="#3a4050"/></g>'
         f'<path d="{curl}" fill="none" stroke="url(#sp-ch)" stroke-width="6" stroke-linecap="round" filter="url(#glow)"/>'
         + "".join(f'<path d="M{282 + dx} 300L{282 + dx * 3} {300 + dy}" stroke="#ffd38a" stroke-width="3" stroke-linecap="round"/>' for dx, dy in [(14, 24), (-10, 30), (22, 8), (-20, 14)])
         + f'<path d="M100 236V302" stroke="#7af0c0" stroke-width="4" stroke-dasharray="4 6"/>')
    return svg(d, b)


# ── Sideways: a car drifting at sunset, its smoke trailing into a sound wave ─────────────────────────────────────────
@icon
def sideways():
    d = lg("sw-bg", (0, "#3a1a6a"), (.5, "#e8507a"), (.75, "#ffa05a"), (1, "#ffd08a")) + lg("sw-r", (0, "#2a1a3a"), (1, "#0e0818"))
    grid = "".join(f'<path d="M256 330L{x} 512" stroke="#ff7ad8" stroke-width="2" opacity=".5"/>' for x in range(-400, 920, 80)) + "".join(f'<path d="M0 {y}H512" stroke="#ff7ad8" stroke-width="2" opacity=".5"/>' for y in (350, 376, 412, 462))
    wave = "M60 410 " + " ".join(f"L{60 + k * 8} {410 + math.sin(k * .7) * (6 + k * .9):.1f}" for k in range(26))
    b = (f'<rect width="512" height="512" fill="url(#sw-bg)"/><circle cx="256" cy="300" r="110" fill="#fff4b0" opacity=".9"/>'
         + "".join(f'<rect x="146" y="{250 + k * 16}" width="220" height="{4 + k}" fill="#e8507a"/>' for k in range(4))
         + f'<path d="M0 330H512V512H0Z" fill="url(#sw-r)"/>{grid}'
         f'<path d="{wave}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".85" filter="url(#glow)"/>'
         f'<g transform="translate(310 420) rotate(-14)" filter="url(#sh)"><path d="M-80 0V-22C-80-34-70-40-58-40L-36-64H34L60-40H72C80-40 84-34 84-26V0Z" fill="#fff"/>'
         f'<path d="M-30-58H28L48-40H-46Z" fill="#7ad8ff"/><circle cx="-46" r="16" fill="#2a1a3a"/><circle cx="48" r="16" fill="#2a1a3a"/><circle cx="-46" r="6" fill="#ffa05a"/><circle cx="48" r="6" fill="#ffa05a"/></g>'
         f'<g fill="#fff"><circle cx="410" cy="122" r="10"/><path d="M420 122V70L446 64V112" fill="none" stroke="#fff" stroke-width="5"/><circle cx="438" cy="114" r="10"/></g>')
    return svg(d, b, sheen=False)


# ── Sketches: an afternoon's idea in pencil on graph paper, the pencil still on it ───────────────────────────────────
@icon
def sketches():
    d = lg("sc-bg", (0, "#fdfaf0"), (1, "#ece4cc"))
    grid = "".join(f'<path d="M{x} 0V512" stroke="#7aa8d8" stroke-opacity=".22"/>' for x in range(0, 512, 22)) + "".join(f'<path d="M0 {y}H512" stroke="#7aa8d8" stroke-opacity=".22"/>' for y in range(0, 512, 22))
    b = (f'<rect width="512" height="512" fill="url(#sc-bg)"/>{grid}<path d="M70 0V512" stroke="#e8707a" stroke-width="3" opacity=".6"/>'
         f'<g fill="none" stroke="#3a3a4a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">'
         f'<path d="M226 300C190 278 176 236 186 200C198 156 244 132 286 140C334 150 362 196 350 240C342 270 320 290 300 300"/>'
         f'<path d="M228 304C190 280 178 240 190 204C200 166 242 140 280 146" opacity=".4"/>'
         f'<path d="M226 300V346H300V300M230 364H296M236 384H290M244 402H282"/>'
         f'<path d="M246 300L238 252 256 268 274 252 266 300"/></g>'
         f'<g stroke="#f0b030" stroke-width="6" stroke-linecap="round"><path d="M256 110V86M330 130L346 112M182 130L166 112M376 196H400M136 196H112"/></g>'
         f'<g transform="rotate(38 390 340)" filter="url(#sh2)"><rect x="372" y="200" width="36" height="200" fill="#f0b030"/><rect x="372" y="200" width="12" height="200" fill="#fff" opacity=".3"/>'
         f'<rect x="372" y="186" width="36" height="20" fill="#c8c8d0"/><rect x="372" y="166" width="36" height="22" rx="6" fill="#ff8a9a"/>'
         f'<path d="M372 400L390 446 408 400Z" fill="#f4d8b0"/><path d="M384 432L390 446 396 432Z" fill="#3a3a4a"/></g>')
    return svg(d, b, sheen=False, grain=.06)


# ── Sealed Letters: an envelope under a wax seal pressed with an hourglass ───────────────────────────────────────────
@icon
def letters():
    d = lg("lt-bg", (0, "#5a1626"), (1, "#1e060c")) + lg("lt-e", (0, "#fbf1dc"), (1, "#e0caa0")) + rg("lt-w", (0, "#ff7a6a"), (.6, "#c41a2a"), (1, "#7a0a14"), fx=.35, fy=.3)
    blob = " ".join(f"{256 + (62 + 7 * math.sin(k * 2.7)) * math.cos(k * math.pi / 9):.1f},{290 + (62 + 7 * math.sin(k * 2.7)) * math.sin(k * math.pi / 9):.1f}" for k in range(18))
    b = (f'<rect width="512" height="512" fill="url(#lt-bg)"/>'
         + "".join(f'<path d="M{x} {y}l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#ffd38a" opacity=".55"/>' for x, y in [(80, 90), (440, 120), (420, 430), (70, 410)])
         + f'<g filter="url(#sh)"><rect x="86" y="146" width="340" height="236" rx="16" fill="url(#lt-e)"/></g>'
         f'<path d="M86 160L256 290 426 160" fill="none" stroke="#c8b088" stroke-width="5" stroke-linejoin="round"/><path d="M86 382L210 270M426 382L302 270" stroke="#d8c49a" stroke-width="4"/>'
         f'<g filter="url(#sh2)"><polygon points="{blob}" fill="url(#lt-w)"/></g>'
         f'<circle cx="256" cy="290" r="42" fill="none" stroke="#ffb0a0" stroke-width="3" opacity=".6"/>'
         f'<path d="M238 262H274M238 318H274M242 262C242 284 270 296 270 318M270 262C270 284 242 296 242 318" fill="none" stroke="#ffd8c8" stroke-width="5" stroke-linecap="round"/>'
         f'<path d="M248 304H264L256 296Z" fill="#ffd8c8"/>')
    return svg(d, b)


# ── Street Skills: a row of houses, each window showing what that neighbour can do ───────────────────────────────────
@icon
def skills():
    d = lg("ss-bg", (0, "#ffcf8a"), (1, "#f08a5a"))
    houses = [(70, "#5a3ad8", 150), (196, "#e8503a", 120), (322, "#1a8a6a", 160)]
    sym = [lambda x, y: f'<g transform="translate({x} {y}) rotate(-45)"><rect x="-5" y="-4" width="10" height="34" rx="4" fill="#3a2a1a"/><path d="M-16-14C-16-26 16-26 16-14L6-8V-2H-6V-8Z" fill="#3a2a1a"/></g>',
           lambda x, y: f'<path d="M{x} {y + 18}C{x - 26} {y} {x - 20} {y - 18} {x - 8} {y - 18}C{x - 2} {y - 18} {x} {y - 12} {x} {y - 12}C{x} {y - 12} {x + 2} {y - 18} {x + 8} {y - 18}C{x + 20} {y - 18} {x + 26} {y} {x} {y + 18}Z" fill="#e8283a"/>',
           lambda x, y: f'<g transform="translate({x} {y}) rotate(35)"><rect x="-5" y="-6" width="10" height="34" rx="4" fill="#8a6a40"/><rect x="-7" y="-14" width="14" height="10" fill="#9aa"/><path d="M-8-14C-8-30 8-30 8-14Z" fill="#1a8a6a"/></g>']
    b = (f'<rect width="512" height="512" fill="url(#ss-bg)"/><circle cx="400" cy="110" r="46" fill="#fff4c8" opacity=".85"/>'
         f'<path d="M0 420H512V512H0Z" fill="#5a3a2a"/>'
         + "".join(f'<g filter="url(#sh)"><path d="M{x} {420 - h}L{x + 60} {360 - h}L{x + 120} {420 - h}V420H{x}Z" fill="{c}"/></g>'
                   f'<rect x="{x + 26}" y="{436 - h}" width="68" height="68" rx="10" fill="#fff8e0" stroke="#fff" stroke-width="4"/>{sym[k](x + 60, 470 - h)}'
                   f'<rect x="{x + 44}" y="370" width="32" height="50" rx="4" fill="#3a2a1a" opacity=".7"/>' for k, (x, c, h) in enumerate(houses))
         + f'<g fill="#fff" opacity=".9">' + "".join(f'<circle cx="{x}" cy="{y}" r="5"/>' for x, y in [(130, 200), (256, 230), (382, 190)]) + '</g>'
         f'<path d="M130 200Q193 170 256 230Q319 170 382 190" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="4 10" stroke-linecap="round"/>')
    return svg(d, b)


# ── Sky Lens: a lens held to the dusk, showing the night sky that's really there ─────────────────────────────────────
@icon
def skylens():
    d = lg("sl2-bg", (0, "#7ab8e8"), (.6, "#e8a0b0"), (1, "#ffc890")) + rg("sl2-n", (0, "#1a2a6a"), (1, "#050a22"))
    con = [(196, 210), (236, 176), (286, 196), (316, 248), (276, 296), (226, 286)]
    b = (f'<rect width="512" height="512" fill="url(#sl2-bg)"/><path d="M0 420Q256 380 512 420V512H0Z" fill="#3a2a5a" opacity=".8"/>'
         f'<clipPath id="sl2-c"><circle cx="256" cy="236" r="140"/></clipPath>'
         f'<g filter="url(#sh)"><circle cx="256" cy="236" r="156" fill="#2a2e3a"/></g>'
         f'<g clip-path="url(#sl2-c)"><rect width="512" height="512" fill="url(#sl2-n)"/>'
         + "".join(f'<circle cx="{120 + (k * 61) % 280}" cy="{100 + (k * 97) % 280}" r="{.8 + (k % 3) * .7}" fill="#fff" opacity="{.4 + (k % 3) * .2}"/>' for k in range(40))
         + f'<polyline points="{" ".join(f"{x},{y}" for x, y in con + [con[0]])}" fill="none" stroke="#7ad8ff" stroke-width="3" opacity=".8"/>'
         + "".join(f'<circle cx="{x}" cy="{y}" r="7" fill="#fff" filter="url(#glow)"/>' for x, y in con)
         + f'<circle cx="340" cy="150" r="22" fill="#ffe8b0"/></g>'
         f'<circle cx="256" cy="236" r="148" fill="none" stroke="#c8ccd8" stroke-width="14"/><path d="M160 150A130 130 0 0 1 250 100" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".6"/>'
         f'<path d="M352 344L420 452" stroke="#2a2e3a" stroke-width="34" stroke-linecap="round"/>')
    return svg(d, b, sheen=False)


# ── Sleep Compression: the night squeezed between two brackets, the moon fitting tight ────────────────────────────────
@icon
def sleep_compression():
    d = lg("sc2-bg", (0, "#1a1a5a"), (1, "#060620")) + rg("sc2-m", (0, "#fffbe0"), (1, "#f0d87a"), fx=.35, fy=.35)
    b = (f'<rect width="512" height="512" fill="url(#sc2-bg)"/>'
         + "".join(f'<circle cx="{(k * 89) % 512}" cy="{(k * 151) % 512}" r="{.8 + (k % 3) * .6}" fill="#fff" opacity="{.25 + (k % 4) * .15}"/>' for k in range(40))
         + f'<g filter="url(#glow)"><path d="M290 150A110 110 0 1 0 330 330A90 90 0 1 1 290 150Z" fill="url(#sc2-m)"/></g>'
         f'<g fill="none" stroke="#9ab8ff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M126 120H96V392H126"/><path d="M386 120H416V392H386"/></g>'
         f'<g fill="#9ab8ff"><path d="M60 256L90 236V276Z"/><path d="M452 256L422 236V276Z"/></g>'
         f'<g font-family="Georgia, serif" font-style="italic" font-weight="700" fill="#cfd8ff"><text x="300" y="214" font-size="44">z</text><text x="330" y="180" font-size="32">z</text><text x="352" y="152" font-size="22">z</text></g>'
         f'<path d="M166 418H346" stroke="#9ab8ff" stroke-width="6" stroke-linecap="round" opacity=".6"/><path d="M166 418H262" stroke="#ffe08a" stroke-width="6" stroke-linecap="round"/>')
    return svg(d, b, grain=.09)


# ── Sonic Veil: sound hung like an aurora, waveform curtains in the dark ─────────────────────────────────────────────
@icon
def sonicveil():
    cols = ["#3af0d0", "#3ab8ff", "#8a5aff", "#ff5ad8"]
    d = lg("sv-bg", (0, "#04122a"), (1, "#010408")) + "".join(lg(f"sv-f{k}", (0, c, .45), (.5, c, .08), (1, c, 0)) for k, c in enumerate(cols))
    veils = "".join(f'<path d="M{-20} {170 + k * 40} ' + " ".join(f"Q{x + 32} {170 + k * 40 + (60 - k * 8) * math.sin(x / 70 + k)} {x + 64} {170 + k * 40}" for x in range(-20, 540, 64)) + f'V512H-20Z" fill="url(#sv-f{k})"/>' for k in range(4))
    lines = "".join(f'<path d="M{-20} {170 + k * 40} ' + " ".join(f"Q{x + 32} {170 + k * 40 + (60 - k * 8) * math.sin(x / 70 + k)} {x + 64} {170 + k * 40}" for x in range(-20, 540, 64)) + f'" fill="none" stroke="{cols[k]}" stroke-width="4" filter="url(#glow)"/>' for k in range(4))
    bars = "".join(f'<rect x="{60 + k * 26}" y="{420 - h}" width="14" height="{h}" rx="7" fill="#fff" opacity=".85"/>' for k, h in enumerate([20, 40, 66, 34, 80, 52, 28, 60, 90, 44, 24, 50, 30, 16, 8]))
    b = (f'<rect width="512" height="512" fill="url(#sv-bg)"/>'
         + "".join(f'<circle cx="{(k * 97) % 512}" cy="{(k * 41) % 150}" r="{.8 + (k % 3) * .5}" fill="#fff" opacity=".6"/>' for k in range(24))
         + f'{veils}{lines}{bars}')
    return svg(d, b, grain=.1, sheen=False)


# ── Foundry: the hammer coming down on the anvil, the sparks it throws are apps ──────────────────────────────────────
@icon
def store():
    d = rg("fd-bg", (0, "#6a2a0a"), (1, "#140602"), cy=.7, r=.8) + lg("fd-a", (0, "#5a5e6a"), (1, "#1e2028")) + lg("fd-hot", (0, "#fff2b0"), (1, "#ff7a1a")) + lg("fd-h", (0, "#a8aeb8"), (1, "#4a4e58"))
    sparks = "".join(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{s * .26:.0f}" fill="{c}" transform="rotate({r} {x + s / 2} {y + s / 2})" filter="url(#glow)"/>' for x, y, s, c, r in
                     [(110, 150, 34, "#ffd36a", -14), (176, 96, 26, "#ff8a3a", 10), (338, 120, 30, "#ffe8a0", 18), (392, 196, 22, "#ffb03a", -8), (88, 236, 20, "#ffb03a", 22)])
    b = (f'<rect width="512" height="512" fill="url(#fd-bg)"/><circle cx="256" cy="300" r="120" fill="#ff7a1a" opacity=".25" filter="url(#blur20)"/>'
         + "".join(f'<path d="M256 290L{256 + 220 * math.cos(a):.0f} {290 + 220 * math.sin(a):.0f}" stroke="#ffd36a" stroke-width="3" stroke-linecap="round" opacity=".5"/>' for a in [-2.6, -2.2, -1.8, -1.3, -.9, -.5])
         + f'{sparks}'
         f'<g filter="url(#sh)"><path d="M104 300H392C392 336 362 356 330 358L318 392H194L182 358C140 354 104 336 104 300Z" fill="url(#fd-a)"/><path d="M392 300C432 300 456 314 466 330C434 332 410 326 392 316Z" fill="url(#fd-a)"/>'
         f'<path d="M194 392H318L338 436H174Z" fill="#2a2a32"/></g><rect x="104" y="292" width="288" height="14" rx="7" fill="url(#fd-hot)"/>'
         f'<g transform="rotate(-38 300 200)" filter="url(#sh2)"><rect x="290" y="120" width="22" height="170" rx="8" fill="#8a5a2a"/><rect x="250" y="96" width="102" height="52" rx="10" fill="url(#fd-h)"/></g>')
    return svg(d, b)


# ── Street Board: the lamppost in an outage, notices pinned to it, one candle lit at its foot ────────────────────────
@icon
def street():
    d = lg("sb-bg", (0, "#1a1a3a"), (1, "#070712")) + rg("sb-c", (0, "#ffd36a", .7), (1, "#ffd36a", 0))
    note = lambda x, y, w, h, c, r: f'<g transform="rotate({r} {x + w / 2} {y + h / 2})"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="{c}"/>' + "".join(f'<path d="M{x + 10} {y + 18 + k * 14}H{x + w - 12}" stroke="#5a5040" stroke-width="4" stroke-linecap="round" opacity=".6"/>' for k in range(int((h - 20) / 14))) + f'<circle cx="{x + w / 2}" cy="{y + 6}" r="5" fill="#e8283a"/></g>'
    b = (f'<rect width="512" height="512" fill="url(#sb-bg)"/>'
         + "".join(f'<rect x="{x}" y="{y}" width="{w}" height="{512 - y}" fill="#0e0e22"/>' for x, y, w in [(0, 280, 80), (420, 250, 92)])
         + f'<circle cx="256" cy="430" r="170" fill="url(#sb-c)"/><path d="M0 450H512V512H0Z" fill="#0b0b1a"/>'
         f'<rect x="240" y="96" width="32" height="360" fill="#3a3a5a"/><path d="M226 96H286L276 70H236Z" fill="#3a3a5a"/><rect x="232" y="54" width="48" height="20" rx="6" fill="#5a5a7a"/><path d="M240 76L256 92 272 76" fill="#1a1a3a"/>'
         f'<g filter="url(#sh2)">{note(150, 170, 92, 108, "#fff6dc", -6)}{note(270, 150, 96, 84, "#ffe27a", 5)}{note(278, 260, 88, 92, "#bfe6ff", -3)}{note(158, 296, 82, 70, "#ffc2b8", 4)}</g>'
         f'<g transform="translate(212 410)"><rect x="-14" y="0" width="28" height="38" rx="4" fill="#fff4dc"/><path d="M0 -4C-8 -16 0 -28 2 -36C10 -26 10 -12 0 -4Z" fill="#ffb03a" filter="url(#glow)"/></g>')
    return svg(d, b)


# ── Subscription Sweep: a broom sweeping up the charges that keep coming round ───────────────────────────────────────
@icon
def subs():
    d = lg("ssw-bg", (0, "#ff8ab0"), (1, "#c83a72")) + rg("ssw-c", (0, "#fff6c8"), (1, "#e0a020"), fx=.35, fy=.3)
    coin = lambda x, y, r: (f'<g transform="translate({x} {y})" filter="url(#sh2)"><circle r="{r}" fill="url(#ssw-c)" stroke="#fff6c8" stroke-width="3"/>'
                             f'<path d="M{-r * .5:.0f} {-r * .1:.0f}A{r * .5:.0f} {r * .5:.0f} 0 1 1 {-r * .2:.0f} {r * .45:.0f}" fill="none" stroke="#8a5a08" stroke-width="{r * .14:.0f}" stroke-linecap="round"/>'
                             f'<path d="M{-r * .72:.0f} {-r * .22:.0f}L{-r * .5:.0f} {-r * .02:.0f} {-r * .28:.0f} {-r * .24:.0f}" fill="none" stroke="#8a5a08" stroke-width="{r * .12:.0f}" stroke-linecap="round" stroke-linejoin="round"/></g>')
    b = (f'<rect width="512" height="512" fill="url(#ssw-bg)"/><path d="M0 410H512V512H0Z" fill="#8a2a52" opacity=".55"/>'
         + coin(120, 380, 34) + coin(180, 396, 26) + coin(96, 330, 22) + coin(152, 334, 28)
         + f'<g stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"><path d="M220 360H262M224 384H280M232 408H270"/></g>'
         f'<g transform="rotate(32 340 270)" filter="url(#sh)"><rect x="326" y="60" width="26" height="250" rx="10" fill="#b8742a"/>'
         f'<path d="M300 300H378L408 420H270Z" fill="#ffd36a"/><path d="M300 300H378V330H300Z" fill="#d84a2a"/>'
         + "".join(f'<path d="M{284 + k * 14} 340L{278 + k * 16} 420" stroke="#c89a2a" stroke-width="3"/>' for k in range(9))
         + f'</g><g fill="#fff">' + "".join(f'<path d="M{x} {y}l5 11 11 5-11 5-5 11-5-11-11-5 11-5z"/>' for x, y in [(70, 260), (230, 300), (430, 130)]) + '</g>')
    return svg(d, b)


# ── Tether: one swing on a rope, the cave mouth above, the lava below ────────────────────────────────────────────────
@icon
def tether():
    d = lg("te-bg", (0, "#1a0a2a"), (.6, "#5a1020"), (1, "#ff5a1a")) + lg("te-lava", (0, "#ffe07a"), (.4, "#ff7a1a"), (1, "#c81a0a"))
    b = (f'<rect width="512" height="512" fill="url(#te-bg)"/>'
         f'<path d="M0 0H512V70C440 90 400 60 340 80C280 100 220 70 160 90C100 110 50 80 0 96Z" fill="#0a0410"/>'
         + "".join(f'<path d="M{x} {80 + (x * 7) % 20}L{x + 10} {130 + (x * 3) % 30} {x + 20} {84 + (x * 5) % 20}Z" fill="#0a0410"/>' for x in range(20, 500, 56))
         + f'<path d="M0 410C60 396 120 420 180 404S300 392 360 408 470 414 512 400V512H0Z" fill="url(#te-lava)" filter="url(#glow)"/>'
         + "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#ffd07a" filter="url(#glow)"/>' for x, y, r in [(120, 386, 6), (300, 380, 4), (420, 370, 7)])
         + f'<path d="M150 96Q190 250 330 298" fill="none" stroke="#e8d8b8" stroke-width="6" stroke-linecap="round"/><circle cx="150" cy="96" r="10" fill="#c8b890"/>'
         f'<g transform="translate(340 302) rotate(-30)" fill="#fff" filter="url(#sh2)"><circle cx="0" cy="-26" r="14"/><path d="M-10 -12H10L14 22 26 48H14L4 28-6 48H-18L-10 22Z"/><path d="M-6 -10L-26 -30M6 -10L-10 -28" stroke="#fff" stroke-width="8" stroke-linecap="round"/></g>'
         f'<path d="M150 96Q170 240 310 296" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="3 10" opacity=".3"/>')
    return svg(d, b, sheen=False)


# ── Thoughtform: a crystal mind under siege, shots of light coming in from the dark ──────────────────────────────────
@icon
def thoughtform():
    d = rg("tf-bg", (0, "#3a0a3a"), (1, "#08020e"), r=.75) + lg("tf-a", (0, "#ffd8f4"), (1, "#c83aa8")) + lg("tf-b", (0, "#9ad8ff"), (1, "#3a5ad8")) + lg("tf-c", (0, "#fff4ff"), (1, "#e8a8f0"))
    b = (f'<rect width="512" height="512" fill="url(#tf-bg)"/>'
         + "".join(f'<path d="M{x0} {y0}L{x1} {y1}" stroke="{c}" stroke-width="6" stroke-linecap="round" filter="url(#glow)"/><circle cx="{x0}" cy="{y0}" r="8" fill="{c}" filter="url(#glow)"/>' for x0, y0, x1, y1, c in
                   [(60, 120, 150, 170, "#ff5a8a"), (460, 90, 380, 150, "#5af0ff"), (470, 420, 390, 360, "#ff5a8a"), (50, 400, 140, 350, "#ffe05a")])
         + f'<ellipse cx="256" cy="400" rx="120" ry="20" fill="#c83aa8" opacity=".35" filter="url(#blur8)"/>'
         f'<g filter="url(#sh)"><path d="M256 80L340 220 256 400 172 220Z" fill="url(#tf-a)"/><path d="M256 80L340 220 256 260Z" fill="url(#tf-c)"/><path d="M256 80L172 220 256 260Z" fill="url(#tf-b)"/>'
         f'<path d="M172 220L256 260 256 400Z" fill="#7a2a9a"/><path d="M340 220L256 260 256 400Z" fill="#a83ac8"/></g>'
         f'<ellipse cx="256" cy="236" rx="150" ry="34" fill="none" stroke="#ffd36a" stroke-width="6" transform="rotate(-10 256 236)"/>'
         f'<circle cx="256" cy="236" r="190" fill="none" stroke="#ff5a8a" stroke-width="2" stroke-dasharray="6 14" opacity=".6"/>')
    return svg(d, b)


# ── Vigil: an eye whose iris is a radar sweep, blips of aircraft in it ───────────────────────────────────────────────
@icon
def vigil():
    d = rg("vg-bg", (0, "#0e2a1a"), (1, "#020a05"), r=.75) + rg("vg-i", (0, "#0a2a14"), (.85, "#1a6a3a"), (1, "#3aff8a")) + lg("vg-sw", (0, "#3aff8a", .7), (1, "#3aff8a", 0), x2=1, y2=0)
    b = (f'<rect width="512" height="512" fill="url(#vg-bg)"/>'
         + "".join(f'<path d="M0 {y}H512" stroke="#3aff8a" stroke-opacity=".05" stroke-width="2"/>' for y in range(0, 512, 12))
         + f'<g filter="url(#sh)"><path d="M40 256Q256 70 472 256Q256 442 40 256Z" fill="#e8f4ec"/></g>'
         f'<clipPath id="vg-c"><circle cx="256" cy="256" r="110"/></clipPath>'
         f'<circle cx="256" cy="256" r="110" fill="url(#vg-i)"/>'
         f'<g clip-path="url(#vg-c)"><path d="M256 256L366 256A110 110 0 0 0 334 178Z" fill="url(#vg-sw)"/>'
         + "".join(f'<circle cx="256" cy="256" r="{r}" fill="none" stroke="#3aff8a" stroke-width="2" opacity=".45"/>' for r in (36, 72))
         + f'<path d="M146 256H366M256 146V366" stroke="#3aff8a" stroke-width="2" opacity=".4"/>'
         + "".join(f'<g transform="translate({x} {y}) rotate({r})" fill="#d8ffe4" filter="url(#glow)"><path d="M0 -10L3 -2 12 2 3 3 2 9 5 11H-5L-2 9-3 3-12 2-3-2Z"/></g>' for x, y, r in [(306, 214, 40), (220, 300, -120), (300, 310, 160)])
         + f'</g><circle cx="256" cy="256" r="26" fill="#020a05"/><circle cx="242" cy="240" r="9" fill="#fff" opacity=".8"/>'
         f'<path d="M40 256Q256 70 472 256Q256 442 40 256Z" fill="none" stroke="#3aff8a" stroke-width="6"/>')
    return svg(d, b, grain=.1)


# ── Watch Your Grass: a gnome on guard over a perfect lawn, a mole surfacing anyway ─────────────────────────────────
@icon
def watchyourgrass():
    d = lg("wg-bg", (0, "#9ae8ff"), (1, "#d8f8ff")) + lg("wg-g", (0, "#7ad84a"), (1, "#2a8a2a"))
    tiles = "".join(f'<path d="M{256 + (c - r) * 40} {300 + (c + r) * 20}l40 20-40 20-40-20z" fill="{"#6ac83a" if (r + c) % 2 else "#58b030"}"/>' for r in range(5) for c in range(5))
    b = (f'<rect width="512" height="512" fill="url(#wg-bg)"/><circle cx="96" cy="96" r="44" fill="#fff8c8"/>'
         f'<path d="M256 300l200 100-200 100-200-100z" fill="#3a7a2a"/><g transform="translate(0 -14)">{tiles}</g>'
         f'<g transform="translate(330 386)"><ellipse rx="34" ry="12" fill="#6a4a2a"/><path d="M-22 0C-22 -34 22 -34 22 0Z" fill="#5a4a5a"/><circle cx="-8" cy="-14" r="4" fill="#000"/><circle cx="8" cy="-14" r="4" fill="#000"/><ellipse cy="-6" rx="7" ry="5" fill="#ff9ab0"/></g>'
         f'<g transform="translate(196 300)" filter="url(#sh)"><path d="M-40 60C-40 20 -24 0 0 0C24 0 40 20 40 60Z" fill="#3a6ad8"/><circle cy="-6" r="22" fill="#ffd8b8"/>'
         f'<path d="M-22 -4C-22 30 22 30 22 -4C14 18 -14 18 -22 -4Z" fill="#fff"/><path d="M-26 -14L0 -96 26 -14Z" fill="#e8283a"/><circle cx="-8" cy="-12" r="3" fill="#000"/><circle cx="8" cy="-12" r="3" fill="#000"/><circle cy="-4" r="5" fill="#ff8a7a"/>'
         f'<path d="M36 24L60 -20" stroke="#8a5a2a" stroke-width="7" stroke-linecap="round"/><path d="M52 -40L70 -14 60 -10 48 -30Z" fill="#c8c8d0"/></g>'
         + "".join(f'<path d="M{x} {y}l-6-18M{x} {y}l0-20M{x} {y}l6-18" stroke="#2a8a2a" stroke-width="4" stroke-linecap="round"/>' for x, y in [(120, 400), (400, 380), (300, 460), (180, 440)]))
    return svg(d, b, sheen=False)


# ── Weaver: two threads, one that thinks and one that acts, woven into one living strand ─────────────────────────────
@icon
def weaver():
    d = lg("wv-bg", (0, "#2a0a1a"), (1, "#0a0206")) + lg("wv-a", (0, "#ffd36a"), (1, "#ff7a3a")) + lg("wv-b", (0, "#ff7ad8"), (1, "#a83aff"))
    n = 3.5
    pa = "M256 70 " + " ".join(f"L{256 + 116 * math.sin(t):.1f} {70 + t * 380 / (n * math.pi):.1f}" for t in [k * .2 for k in range(1, int(n * math.pi / .2) + 1)])
    pb = "M256 70 " + " ".join(f"L{256 - 116 * math.sin(t):.1f} {70 + t * 380 / (n * math.pi):.1f}" for t in [k * .2 for k in range(1, int(n * math.pi / .2) + 1)])
    rungs = "".join(f'<path d="M{256 - 116 * abs(math.sin(t)) + 10:.1f} {70 + t * 380 / (n * math.pi):.1f}H{256 + 116 * abs(math.sin(t)) - 10:.1f}" stroke="#fff" stroke-width="3" opacity=".4"/>' for t in [k * math.pi / 4 + math.pi / 8 for k in range(int(4 * n))])
    b = (f'<rect width="512" height="512" fill="url(#wv-bg)"/>'
         + "".join(f'<path d="M{x} 0V512" stroke="#ff7a3a" stroke-opacity=".06" stroke-width="10"/>' for x in range(20, 512, 40))
         + f'{rungs}<path d="{pb}" fill="none" stroke="url(#wv-b)" stroke-width="24" stroke-linecap="round" filter="url(#glow)"/>'
         f'<path d="{pa}" fill="none" stroke="url(#wv-a)" stroke-width="24" stroke-linecap="round" filter="url(#glow)"/>'
         f'<circle cx="256" cy="452" r="14" fill="#fff" filter="url(#glow)"/>'
         f'<g transform="translate(120 400) rotate(-30)"><path d="M0 -40L10 40H-10Z" fill="#c8c8d0"/><ellipse cx="0" cy="-34" rx="6" ry="10" fill="none" stroke="#c8c8d0" stroke-width="4"/></g>')
    return svg(d, b)


# ── Witness: a photo with a notary's seal on it, the time pressed into the wax ───────────────────────────────────────
@icon
def witness():
    d = lg("wt-bg", (0, "#1a3a6a"), (1, "#081428")) + lg("wt-ph", (0, "#7ab8e8"), (1, "#3a6aa8")) + rg("wt-s", (0, "#fff0b0"), (.6, "#e8b440"), (1, "#a8741a"), fx=.35, fy=.3)
    seal = " ".join(f"{352 + (70 if k % 2 == 0 else 60) * math.cos(k * math.pi / 16):.1f},{350 + (70 if k % 2 == 0 else 60) * math.sin(k * math.pi / 16):.1f}" for k in range(32))
    b = (f'<rect width="512" height="512" fill="url(#wt-bg)"/>'
         f'<g filter="url(#sh)" transform="rotate(-6 230 240)"><rect x="96" y="96" width="268" height="300" rx="8" fill="#fffdf6"/><rect x="116" y="116" width="228" height="200" fill="url(#wt-ph)"/>'
         f'<path d="M116 280L176 220 222 260 270 206 344 270V316H116Z" fill="#2a5a3a"/><circle cx="300" cy="160" r="20" fill="#fff4c8"/>'
         f'<text x="230" y="356" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="20" fill="#5a5a6a">26·11·2026 17:30</text></g>'
         f'<path d="M318 400L300 470 330 452 352 480 360 410Z" fill="#d6283a"/><path d="M386 400L404 470 374 452 352 480 344 410Z" fill="#b81a28"/>'
         f'<g filter="url(#sh2)"><polygon points="{seal}" fill="url(#wt-s)"/></g><circle cx="352" cy="350" r="46" fill="none" stroke="#fff4c8" stroke-width="3"/>'
         f'<circle cx="352" cy="350" r="28" fill="none" stroke="#7a4a08" stroke-width="5"/><path d="M352 332V350L364 360" fill="none" stroke="#7a4a08" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')
    return svg(d, b)


# ── Worm Eater: an apple under the scanner, the worm admitting it isn't sure ─────────────────────────────────────────
@icon
def worm_eater():
    d = lg("we-bg", (0, "#fff2d8"), (1, "#ffcf9a")) + rg("we-a", (0, "#ff9a8a"), (.6, "#e8283a"), (1, "#9a0a1a"), fx=.35, fy=.3)
    b = (f'<rect width="512" height="512" fill="url(#we-bg)"/>'
         f'<g filter="url(#sh)"><path d="M256 170C210 140 130 150 122 230C114 310 170 410 230 410C246 410 250 400 256 400C262 400 266 410 282 410C342 410 398 310 390 230C382 150 302 140 256 170Z" fill="url(#we-a)"/></g>'
         f'<path d="M256 172C256 150 262 126 274 110" fill="none" stroke="#5a3410" stroke-width="10" stroke-linecap="round"/><path d="M270 128C290 100 326 98 342 110C326 132 296 138 270 128Z" fill="#4aa83a"/>'
         f'<path d="M160 220C170 196 190 184 210 182" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".6"/>'
         f'<rect x="60" y="270" width="392" height="10" fill="#3aff8a" opacity=".85" filter="url(#glow)"/>'
         f'<circle cx="330" cy="300" r="26" fill="#3a1a0a"/>'
         f'<g transform="translate(330 296)"><path d="M-6 6C-30 0 -40 -30 -20 -46C0 -60 24 -40 10 -24" fill="none" stroke="#ffb8c8" stroke-width="20" stroke-linecap="round"/>'
         f'<circle cx="-24" cy="-48" r="5" fill="#2a1a2a"/><circle cx="-10" cy="-52" r="5" fill="#2a1a2a"/><path d="M-30 -48H-4" stroke="#2a1a2a" stroke-width="2"/></g>'
         f'<g transform="translate(390 150)" filter="url(#sh2)"><circle r="36" fill="#fff"/><text y="16" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="48" fill="#e8283a">?</text></g>')
    return svg(d, b, sheen=False)


if __name__ == "__main__":
    ids = sys.argv[1:] or sorted(ICONS)
    for i in ids:
        open(os.path.join(OUT, i + ".svg"), "w").write(ICONS[i]())
    print("drew", len(ids))
