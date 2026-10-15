"""Hive Strata: the typeface of Hive, built here and nowhere else.

Construction rules (every glyph, both weights, and the Hive wordmark derive from these):
  * Monoline strokes drawn on centre lines; horizontals are a touch thinner than verticals (K), so curves breathe.
  * Rounds are settled pebbles: superellipses, rounder above (NTOP) and flatter below (NBOT), as if every bowl had come to
    rest on the line, the way sediment settles.
  * Every stroke end is cut flat, square to the page: horizontal or vertical, never round.
  * Every dot is a crystal: a tall rhombus (i, j, the period, the colon, the zero's core).
  * Diagonals meet in small flats, never in points; l has a foot, Q a crystal for a tail.

    python3 hive-strata.py [outdir]   -> HiveStrata-Light / -Regular / -SemiBold .woff2 (+ .ttf)
"""
import math, sys
from shapely.geometry import LineString, LinearRing, Polygon, MultiPolygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely import affinity

U = unary_union
XH, CH, AS, DS, O = 520, 700, 742, -205, 12   # x-height, cap height, ascender, descender, overshoot
NTOP, NBOT = 2.25, 3.3                       # pebble exponents: rounder above, flatter where it rests
K = 0.84                                     # horizontal / vertical stroke ratio
W = 80                                       # stem (set per weight below)


def h():
    return W * K


# ---------------------------------------------------------------- primitives
def se(cx, cy, ax, ay, t):
    c, s = math.cos(t), math.sin(t)
    e = 2.0 / (NTOP if s >= 0 else NBOT)
    return (cx + ax * math.copysign(abs(c) ** e, c), cy + ay * math.copysign(abs(s) ** e, s))


def arc(cx, cy, ax, ay, a0, a1):
    """Superellipse centre line from angle a0 to a1 (degrees; a1 < a0 runs clockwise)."""
    n = max(12, int(abs(a1 - a0) / 1.2))
    return [se(cx, cy, ax, ay, math.radians(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


def stroke(pts, closed=False, w=None):
    w = w or W
    sp = [(x, y / K) for x, y in pts]
    if closed:
        g = Polygon(sp).buffer(w / 2, join_style=2, mitre_limit=4).difference(Polygon(sp).buffer(-w / 2, join_style=2, mitre_limit=4))
    else:
        g = LineString(sp).buffer(w / 2, cap_style=2, join_style=2, mitre_limit=4)
    return affinity.scale(g, 1, K, origin=(0, 0))


def line(*pts):
    return stroke(list(pts))


def keep(g, x0=-3000, y0=-3000, x1=3000, y1=3000):
    return g.intersection(box(x0, y0, x1, y1))


def cut(g, x0=-3000, y0=-3000, x1=3000, y1=3000):
    return g.difference(box(x0, y0, x1, y1))


def gem(cx, cy, s=1.0):
    hw, hh = W * 0.74 * s, W * 1.0 * s
    return Polygon([(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)])


def bowl(x0, x1, y0, y1):
    """Centre-line superellipse for a round whose OUTER edges are x0..x1, y0..y1."""
    return (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - W / 2, (y1 - y0) / 2 - h() / 2


def ring(x0, x1, y0, y1):
    cx, cy, ax, ay = bowl(x0, x1, y0, y1)
    return stroke(arc(cx, cy, ax, ay, 0, 360)[:-1], closed=True)


def diag(xb, xt, y0, y1, w=None):
    """A straight stroke with horizontal cut ends: bottom centre xb at y0, top centre xt at y1."""
    w = w or W * 0.96
    a = math.atan2(y1 - y0, xt - xb)
    hw = abs(w / math.sin(a)) / 2
    return Polygon([(xb - hw, y0), (xb + hw, y0), (xt + hw, y1), (xt - hw, y1)])


def stem(x, y0, y1):
    return box(x, y0, x + W, y1)


def hbar(x0, x1, y):
    """Horizontal bar whose centre line is y."""
    return box(x0, y - h() / 2, x1, y + h() / 2)


# ---------------------------------------------------------------- glyphs
G, SB = {}, {}


def glyph(name, l, r):
    def deco(fn):
        G[name] = fn
        SB[name] = (l, r)
        return fn
    return deco


def arch(x0, x1, top, ya):
    """n/h/m shoulder: centre line from the left stem up over the top and down the right stem to the baseline."""
    cx, ax = (x0 + x1) / 2, (x1 - x0) / 2
    ay = top - h() / 2 - ya
    return stroke([(x0, ya)] + arc(cx, ya, ax, ay, 180, 0)[1:] + [(x1, 0)])


SHOULDER = 0.47


def n_(w=468, asc=XH):
    x0, x1 = W / 2, w - W / 2
    return U([stem(0, 0, asc), arch(x0, x1, XH + O * 0.6, XH * SHOULDER)])


@glyph("n", 66, 62)
def _n(): return n_()


@glyph("h", 66, 62)
def _h(): return n_(asc=AS)


@glyph("m", 66, 62)
def _m():
    w = 748
    x0, xm, x1 = W / 2, w / 2, w - W / 2
    return U([stem(0, 0, XH), arch(x0, xm, XH + O * 0.6, XH * SHOULDER), arch(xm, x1, XH + O * 0.6, XH * SHOULDER)])


@glyph("u", 62, 66)
def _u():
    w = 468
    x0, x1 = W / 2, w - W / 2
    cx, ax, ya = (x0 + x1) / 2, (x1 - x0) / 2, XH * (1 - SHOULDER)
    ay = ya - (-O * 0.6 + h() / 2)
    return U([stem(w - W, 0, XH), stroke([(x0, XH), (x0, ya)] + arc(cx, ya, ax, ay, 180, 360)[1:])])


@glyph("r", 66, 12)
def _r():
    x0, x1 = W / 2, 468 - W / 2
    cx, ax, ya = (x0 + x1) / 2, (x1 - x0) / 2, XH * SHOULDER
    ay = XH + O * 0.6 - h() / 2 - ya
    a = stroke([(x0, ya)] + arc(cx, ya, ax, ay, 180, 30)[1:])
    return U([stem(0, 0, XH), keep(a, x1=318)])


def o_(w=532, y0=-O, y1=XH + O):
    return ring(0, w, y0, y1)


@glyph("o", 46, 46)
def _o(): return o_()


@glyph("b", 66, 46)
def _b(): return U([o_(), stem(0, 0, AS)])


@glyph("d", 46, 66)
def _d(): return U([o_(), stem(532 - W, 0, AS)])


@glyph("p", 66, 46)
def _p(): return U([o_(), stem(0, DS, XH)])


@glyph("q", 46, 66)
def _q(): return U([o_(), stem(532 - W, DS, XH)])


@glyph("a", 46, 66)
def _a(): return U([o_(), stem(532 - W, 0, XH)])


def hook(xr, ytop, w=532, depth=DS):
    """Descender: right stem down from ytop, then a pebble curve to the left with a vertical cut."""
    cx, ax = w / 2, w / 2 - W / 2
    yc = 30
    ay = yc - (depth - O + h() / 2)
    pts = [(xr, ytop), (xr, yc)] + arc(cx, yc, ax, ay, 0, -180)[1:]
    return keep(stroke(pts), x0=w * 0.12)


@glyph("g", 46, 66)
def _g(): return U([o_(), hook(532 - W / 2, XH, 532)])


@glyph("j", -40, 62)
def _j():
    w = 300
    cx, ax = W / 2, (w - W) / 2
    s = stroke([(w - W / 2, XH), (w - W / 2, 30)] + arc(w / 2, 30, ax, 30 - (DS - O + h() / 2), 0, -150)[1:])
    s = keep(s, x0=12)
    return U([s, gem(w - W / 2, XH + 196)])


@glyph("i", 66, 66)
def _i(): return U([stem(0, 0, XH), gem(W / 2, XH + 196)])


def foot(x, top, reach=150, rise=150):
    """A stem that turns right at the foot (l, t) and ends in a vertical cut."""
    cx = x + reach
    ay = rise - h() / 2
    pts = [(x, top), (x, rise)] + arc(cx, rise, reach, ay, 180, 270)[1:] + [(cx + 70, h() / 2)]
    return stroke(pts)


@glyph("l", 66, 20)
def _l(): return foot(W / 2, AS, 132, 140)


@glyph("t", 22, 24)
def _t():
    x = 92
    return U([foot(x, XH + 162, 128, 140), hbar(0, x + 196, XH - h() / 2)])


@glyph("f", 22, 6)
def _f():
    x, r = 116, 128
    cx, ay = x + r, 150
    pts = [(x, 0), (x, AS - ay)] + arc(cx, AS - ay, r, ay - h() / 2, 180, 90)[1:] + [(cx + 86, AS - h() / 2)]
    return U([stroke(pts), hbar(0, x + 196, XH - h() / 2)])


@glyph("k", 66, 14)
def _k():
    w = 446
    arm = diag(W + 20, w - W * 0.5, 158, XH)
    leg = diag(w - W * 0.55, 186, 0, 292)
    return U([stem(0, 0, AS), keep(U([arm, leg]), y0=0, y1=XH, x0=W - 6)])


def halfw(xb, xt, y0, y1, w=None):
    w = w or W * 0.96
    return abs(w / math.sin(math.atan2(y1 - y0, xt - xb))) / 2


def vee(w, top, base=0, flat=0.42):
    """Two diagonals that meet in a small flat (flat x the stem) instead of a point: drawn as one outline, so nothing
    pokes out where the strokes cross."""
    f = W * flat
    xl, xr = W * 0.48, w - W * 0.48
    hw = halfw(w / 2, xl, base, top)
    bl, br = w / 2 - f / 2, w / 2 + f / 2                    # the flat
    # inner edges: from the far side of each stroke's foot up to the inside of its top
    p1, p2 = (bl + 2 * hw, base), (xl + hw, top)
    q1, q2 = (br - 2 * hw, base), (xr - hw, top)
    ix = LineString([p1, p2]).intersection(LineString([q1, q2]))
    crotch = (ix.x, ix.y) if not ix.is_empty else (w / 2, base + W)
    return Polygon([(bl, base), (xl - hw, top), (xl + hw, top), crotch, (xr - hw, top), (xr + hw, top), (br, base)])


def peak(w, top, base=0, flat=0.42):
    return affinity.scale(vee(w, top, base, flat), 1, -1, origin=(0, (top + base) / 2))


@glyph("v", 14, 14)
def _v(): return vee(470, XH)


@glyph("w", 14, 14)
def _w():
    return U([vee(390, XH), affinity.translate(vee(390, XH), 300, 0)])


@glyph("x", 16, 16)
def _x():
    w = 452
    return keep(U([diag(W * 0.5, w - W * 0.5, 0, XH), diag(w - W * 0.5, W * 0.5, 0, XH)]), y0=0, y1=XH)


@glyph("y", 14, 14)
def _y():
    w = 470
    right = diag(w * 0.30, w - W * 0.48, DS, XH)
    # where the right stroke crosses the baseline: the left arm meets it there
    xr = w * 0.30 + (w - W * 0.48 - w * 0.30) * (0 - DS) / (XH - DS)
    left = diag(xr, W * 0.48, 0, XH)
    return keep(U([right, left]), y0=DS, y1=XH)


@glyph("z", 34, 34)
def _z():
    w = 418
    d = diag(W * 0.62, w - W * 0.62, h(), XH - h())
    return U([hbar(10, w, XH - h() / 2), hbar(0, w - 10, h() / 2), d])


def ess(w, y0, y1, split=0.53, gap=0.30):
    """S: a smaller upper pebble running anticlockwise into a larger lower one; both ends cut flat (horizontal)."""
    H_ = y1 - y0
    ym = y0 + H_ * split                          # spine centre line
    ux0, ux1 = w * 0.04, w * 0.96
    ucx, uax = (ux0 + ux1) / 2, (ux1 - ux0) / 2 - W / 2
    uay = (y1 - h() / 2 - ym) / 2
    ucy = ym + uay
    lcx, lax = w / 2, w / 2 - W / 2
    lay = (ym - (y0 + h() / 2)) / 2
    lcy = ym - lay
    top = arc(ucx, ucy, uax, uay, 0, 270)
    bot = arc(lcx, lcy, lax, lay, 90, -180)
    g = stroke(top + bot[1:])
    g = cut(g, x0=ucx + uax * 0.1, y0=ym + h() / 2 + 2, y1=ucy + uay * gap)       # the upper end, cut flat
    g = cut(g, x1=lcx - lax * 0.1, y0=lcy - lay * gap, y1=ym - h() / 2 - 2)       # the lower end, cut flat
    return g


@glyph("s", 40, 40)
def _s(): return ess(430, -O, XH + O)


def cee(w, y0, y1, open_=0.40):
    cx, cy, ax, ay = bowl(0, w, y0, y1)
    g = ring(0, w, y0, y1)
    return cut(g, x0=cx + ax * 0.15, y0=cy - ay * open_, y1=cy + ay * open_)


@glyph("c", 46, 26)
def _c(): return cee(500, -O, XH + O, 0.40)


@glyph("e", 46, 38)
def _e():
    w = 524
    cx, cy, ax, ay = bowl(0, w, -O, XH + O)
    yb = cy + 18
    g = ring(0, w, -O, XH + O)
    g = cut(g, x0=cx + ax * 0.15, y0=cy - ay * 0.46, y1=yb - h() / 2)
    return U([g, hbar(W * 0.5, w - W * 0.5, yb)])


# ---------------------------------------------------------------- capitals
@glyph("A", 14, 14)
def _A():
    w = 612
    a = peak(w, CH + 0, 0, 0.5)
    bar_y = CH * 0.28
    inner = Polygon([(W * 0.48, 0), (w / 2, CH), (w - W * 0.48, 0)])
    return U([a, hbar(0, w, bar_y).intersection(inner.buffer(W * 0.3))]).intersection(box(0, 0, w, CH))


def dee(x0, x1, y0, y1):
    """D bowl: from the stem along the top, a pebble's right half, back along the bottom."""
    xs = x1 - (y1 - y0) / 2 * 0.95
    cx, ax = xs, x1 - W / 2 - xs
    cy, ay = (y0 + y1) / 2, (y1 - y0) / 2 - h() / 2
    pts = [(x0, y1 - h() / 2), (xs, y1 - h() / 2)] + arc(cx, cy, ax, ay, 90, -90)[1:] + [(x0, y0 + h() / 2)]
    return stroke(pts)


@glyph("B", 76, 50)
def _B():
    w = 520
    up = dee(W / 2, w - 34, CH * 0.52 - h() / 2, CH)
    lo = dee(W / 2, w, 0, CH * 0.52 + h() / 2)
    return U([stem(0, 0, CH), up, lo])


@glyph("C", 50, 30)
def _C(): return cee(640, -O, CH + O, 0.36)


@glyph("D", 76, 50)
def _D(): return U([stem(0, 0, CH), dee(W / 2, 640, 0, CH)])


@glyph("E", 76, 40)
def _E():
    w = 446
    return U([stem(0, 0, CH), hbar(0, w, CH - h() / 2), hbar(0, w - 46, CH * 0.5), hbar(0, w, h() / 2)])


@glyph("F", 76, 30)
def _F():
    w = 432
    return U([stem(0, 0, CH), hbar(0, w, CH - h() / 2), hbar(0, w - 50, CH * 0.5)])


@glyph("G", 50, 66)
def _G():
    w = 660
    cx, cy, ax, ay = bowl(0, w, -O, CH + O)
    g = ring(0, w, -O, CH + O)
    g = cut(g, x0=cx + ax * 0.15, y0=cy, y1=cy + ay * 0.42)
    bar = hbar(cx + ax * 0.08, w, cy + h() / 2 - 2)
    return U([g, keep(bar, x1=w - W * 0.3)])


@glyph("H", 76, 76)
def _H():
    w = 584
    return U([stem(0, 0, CH), stem(w - W, 0, CH), hbar(0, w, CH * 0.5)])


@glyph("I", 76, 76)
def _I(): return stem(0, 0, CH)


@glyph("J", 22, 76)
def _J():
    w = 392
    cx, ax = w / 2, w / 2 - W / 2
    yc = 200
    pts = [(w - W / 2, CH), (w - W / 2, yc)] + arc(cx, yc, ax, yc + O - h() / 2, 0, -180)[1:]
    return keep(stroke(pts), y0=-O - 10, x0=0).difference(box(-100, yc - 30, W * 1.1, 400))


@glyph("K", 76, 14)
def _K():
    w = 560
    arm = diag(W + 6, w - W * 0.5, CH * 0.30, CH)
    leg = diag(w - W * 0.52, W + 168, 0, CH * 0.52)
    return U([stem(0, 0, CH), keep(U([arm, leg]), y0=0, y1=CH, x0=W - 4)])


@glyph("L", 76, 24)
def _L():
    return U([stem(0, 0, CH), hbar(0, 440, h() / 2)])


@glyph("M", 76, 76)
def _M():
    w = 772
    v = vee(w, CH, 0, 0.5)
    return U([stem(0, 0, CH), stem(w - W, 0, CH), v])


@glyph("N", 76, 76)
def _N():
    w = 616
    d = diag(w - W * 0.62, W * 0.62, 0, CH)
    return U([stem(0, 0, CH), stem(w - W, 0, CH), keep(d, x0=W * 0.5, x1=w - W * 0.5)])


@glyph("O", 50, 50)
def _O(): return ring(0, 712, -O, CH + O)


@glyph("P", 76, 30)
def _P():
    return U([stem(0, 0, CH), dee(W / 2, 520, CH * 0.43, CH)])


@glyph("Q", 50, 50)
def _Q():
    w = 712
    g = ring(0, w, -O, CH + O)
    cx, cy, ax, ay = bowl(0, w, -O, CH + O)
    x, y = se(cx, cy, ax, ay, math.radians(-52))
    return U([g, gem(x + 16, y - 12, 1.42)])


@glyph("R", 76, 22)
def _R():
    bowl_ = dee(W / 2, 524, CH * 0.43, CH)
    leg = diag(530 - W * 0.55, 300, 0, CH * 0.43 + h() / 2)
    return U([stem(0, 0, CH), bowl_, keep(leg, y0=0, x0=200)])


@glyph("S", 40, 40)
def _S(): return ess(540, -O, CH + O, 0.53, 0.2)


@glyph("T", 16, 16)
def _T():
    w = 560
    return U([hbar(0, w, CH - h() / 2), stem(w / 2 - W / 2, 0, CH)])


@glyph("U", 70, 70)
def _U():
    w = 604
    cx, ax = w / 2, w / 2 - W / 2
    yc = 260
    pts = [(W / 2, CH), (W / 2, yc)] + arc(cx, yc, ax, yc + O - h() / 2, 180, 360)[1:] + [(w - W / 2, CH)]
    return stroke(pts)


@glyph("V", 12, 12)
def _V(): return vee(626, CH, 0, 0.6)


@glyph("W", 12, 12)
def _W(): return U([vee(520, CH, 0, 0.6), affinity.translate(vee(520, CH, 0, 0.6), 396, 0)])


@glyph("X", 14, 14)
def _X():
    w = 600
    return keep(U([diag(W * 0.5, w - W * 0.5, 0, CH), diag(w - W * 0.5, W * 0.5, 0, CH)]), y0=0, y1=CH)


@glyph("Y", 12, 12)
def _Y():
    w = 600
    v = vee(w, CH, CH * 0.42, 0.45)
    return U([v, stem(w / 2 - W / 2, 0, CH * 0.42 + 30)])


@glyph("Z", 34, 34)
def _Z():
    w = 540
    d = diag(W * 0.66, w - W * 0.66, h(), CH - h())
    return U([hbar(14, w, CH - h() / 2), hbar(0, w - 14, h() / 2), d])


# ---------------------------------------------------------------- figures
FIG = 560


@glyph("zero", 44, 44)
def _zero():
    return U([ring(0, 520, -O, CH + O), gem(260, CH / 2, 0.9)])


@glyph("one", 30, 70)
def _one():
    x = 170
    return U([stem(x, 0, CH), diag(30, x + W * 0.55, CH - 190, CH - 18, W * 0.86).difference(box(x + W, 0, 900, 900))]).union(box(x, CH - 60, x + W, CH))


@glyph("two", 40, 40)
def _two():
    w = 500
    cx, ax = w / 2, w / 2 - W / 2
    yc = CH - 220
    ay = 220 + O - h() / 2
    top = arc(cx, yc, ax, ay, 168, 0)
    pts = top + [(w - W / 2, yc - 30), (W * 0.62, h())]
    g = stroke(pts)
    g = keep(g, y0=h() * 0.5)
    return U([g, hbar(0, w, h() / 2)])


@glyph("three", 36, 44)
def _three():
    w = 500
    up = arc(w / 2 - 6, CH - 170, w / 2 - W / 2 - 22, 170 + O - h() / 2, 160, -90)
    lo = arc(w / 2, 190, w / 2 - W / 2, 190 + O - h() / 2, 90, -160)
    g = U([stroke(up), stroke(lo)])
    return g


@glyph("four", 24, 40)
def _four():
    w = 520
    x = w - W - 50
    d = diag(W * 0.4, x + W * 0.5, 210, CH)
    return U([stem(x, 0, CH), keep(d, y0=210), hbar(0, w, 210 + h() / 2)])


@glyph("five", 40, 44)
def _five():
    w = 500
    yc, ay = 220, 220 + O - h() / 2
    ax = w / 2 - W / 2
    lo = arc(w / 2, yc, ax, ay, 116, -158)
    pts = [(w - 20, CH - h() / 2), (W * 0.72, CH - h() / 2), (W * 0.72, 300)]
    return U([stroke(pts), stroke(lo), stem(W * 0.72 - W / 2, 330, CH - 4)])


@glyph("six", 44, 40)
def _six():
    w = 516
    r = ring(0, w, -O, 452)
    d = diag(W * 0.62, w * 0.72, 220, CH)
    return U([r, keep(d, y0=230, x1=w * 0.78)])


@glyph("seven", 30, 30)
def _seven():
    w = 500
    return U([hbar(0, w, CH - h() / 2), diag(130, w - W * 0.6, 0, CH - h())])


@glyph("eight", 40, 40)
def _eight():
    return U([ring(28, 492, 334, CH + O), ring(0, 520, -O, 360 + h())])


@glyph("nine", 40, 44)
def _nine():
    return affinity.rotate(_six(), 180, origin=(258, CH / 2))


# ---------------------------------------------------------------- marks
@glyph("period", 50, 50)
def _period(): return gem(W * 0.74, W * 1.0)


@glyph("comma", 50, 50)
def _comma():
    g = gem(W * 0.74, W * 1.0)
    tail = diag(W * 0.2, W * 0.74, -150, W * 0.7, W * 0.62)
    return U([g, keep(tail, y1=W * 0.8)])


@glyph("colon", 56, 56)
def _colon(): return U([gem(W * 0.74, W * 1.0), gem(W * 0.74, XH - W * 0.9)])


@glyph("semicolon", 56, 56)
def _semicolon(): return U([_comma(), gem(W * 0.74, XH - W * 0.9)])


@glyph("exclam", 60, 60)
def _exclam(): return U([stem(W * 0.74 - W / 2, 250, CH), gem(W * 0.74, W * 1.0)])


@glyph("question", 34, 34)
def _question():
    w = 430
    cx, ax = w / 2, w / 2 - W / 2
    yc = CH - 190
    pts = arc(cx, yc, ax, 190 + O - h() / 2, 168, -60) + [(cx, yc - 220), (cx, 250)]
    return U([stroke(pts), gem(cx, W * 1.0)])


@glyph("hyphen", 36, 36)
def _hyphen(): return hbar(0, 280, XH * 0.5)


@glyph("endash", 30, 30)
def _endash(): return hbar(0, 500, XH * 0.5)


@glyph("emdash", 30, 30)
def _emdash(): return hbar(0, 900, XH * 0.5)


@glyph("minus", 50, 50)
def _minus(): return hbar(0, 460, CH * 0.45)


@glyph("plus", 50, 50)
def _plus(): return U([hbar(0, 460, CH * 0.45), box(230 - W / 2, CH * 0.45 - 230, 230 + W / 2, CH * 0.45 + 230)])


@glyph("equal", 50, 50)
def _equal(): return U([hbar(0, 460, CH * 0.45 + 90), hbar(0, 460, CH * 0.45 - 90)])


@glyph("multiply", 50, 50)
def _multiply():
    c = CH * 0.45
    return U([line((0, c - 200), (400, c + 200)), line((0, c + 200), (400, c - 200))])


@glyph("quotesingle", 56, 56)
def _quotesingle(): return box(0, CH - 230, W * 0.9, CH + 20)


@glyph("quotedbl", 56, 56)
def _quotedbl(): return U([box(0, CH - 230, W * 0.9, CH + 20), box(W * 2.0, CH - 230, W * 2.9, CH + 20)])


@glyph("quoteright", 50, 50)
def _quoteright(): return affinity.translate(_comma(), 0, CH - W * 1.6)


@glyph("quoteleft", 50, 50)
def _quoteleft(): return affinity.rotate(_quoteright(), 180, origin=(W * 0.6, CH - W * 0.9))


@glyph("quotedblright", 50, 50)
def _quotedblright(): return U([_quoteright(), affinity.translate(_quoteright(), W * 2.1, 0)])


@glyph("quotedblleft", 50, 50)
def _quotedblleft(): return U([_quoteleft(), affinity.translate(_quoteleft(), W * 2.1, 0)])


@glyph("slash", 10, 10)
def _slash(): return diag(30, 360, -120, CH + 40, W * 0.92)


@glyph("parenleft", 64, 16)
def _parenleft():
    return stroke(arc(250, CH * 0.45, 200, 470, 120, 240))


@glyph("parenright", 16, 64)
def _parenright():
    return affinity.scale(_parenleft(), -1, 1, origin=(150, 0))


@glyph("bracketleft", 70, 20)
def _bracketleft():
    return U([stem(0, -150, CH + 60), hbar(0, 190, CH + 60 - h() / 2), hbar(0, 190, -150 + h() / 2)])


@glyph("bracketright", 20, 70)
def _bracketright():
    return affinity.scale(_bracketleft(), -1, 1, origin=(95, 0))


@glyph("periodcentered", 60, 60)
def _periodcentered(): return gem(W * 0.74, XH * 0.52)


@glyph("bullet", 60, 60)
def _bullet(): return gem(W * 0.9, XH * 0.52, 1.25)


@glyph("ellipsis", 50, 50)
def _ellipsis(): return U([gem(W * 0.74 + i * W * 2.6, W * 1.0) for i in range(3)])


@glyph("underscore", 0, 0)
def _underscore(): return hbar(0, 520, -120)


@glyph("bar", 80, 80)
def _bar(): return stem(0, -180, CH + 60)


@glyph("asterisk", 40, 40)
def _asterisk():
    c = (200, CH - 170)
    arms = [affinity.rotate(box(c[0] - W * 0.42, c[1], c[0] + W * 0.42, c[1] + 170), a, origin=c) for a in (0, 60, 120, 180, 240, 300)]
    return U(arms)


@glyph("percent", 30, 30)
def _percent():
    a = ring(0, 250, CH - 300, CH)
    b = ring(400, 650, 0, 300)
    return U([a, b, diag(110, 540, 0, CH, W * 0.8)])


@glyph("numbersign", 30, 30)
def _numbersign():
    return U([diag(120, 230, 0, CH, W * 0.8), diag(320, 430, 0, CH, W * 0.8), hbar(10, 540, 230), hbar(30, 560, 470)])


@glyph("less", 50, 50)
def _less():
    c = CH * 0.45
    return keep(stroke([(440, c + 220), (20, c), (440, c - 220)]), x0=0, x1=440)


@glyph("greater", 50, 50)
def _greater(): return affinity.scale(_less(), -1, 1, origin=(230, 0))


@glyph("ampersand", 40, 20)
def _ampersand():
    w = 600
    ucx, ucy, uax, uay = 218, CH - 160, 118, 160 + O - h() / 2
    lcx, lcy, lax, lay = 236, 200, 196, 200 + O - h() / 2
    up = arc(ucx, ucy, uax, uay, 228, -48)
    lo = arc(lcx, lcy, lax, lay, 150, 382)
    g = stroke([(w - 30, 0)] + up + lo)
    g = keep(g, y0=0)
    return cut(g, x0=lcx + lax * 0.55, y0=lcy + lay * 0.32, y1=lcy + lay * 1.2)


@glyph("at", 40, 40)
def _at():
    outer = ring(0, 840, -170, CH + 20)
    inner = ring(220, 560, 80, 470)
    st = stem(560 - W, 80, 470)
    return U([cut(outer, x0=600, y0=60, y1=300), inner, st, keep(stroke(arc(420, 230, 300, 300, 270, 360)), x0=560 - W)])


@glyph("arrowright", 40, 40)
def _arrowright():
    c = CH * 0.45
    return U([hbar(0, 560, c), keep(stroke([(380, c + 200), (580, c), (380, c - 200)]), x1=600)])


@glyph("arrowleft", 40, 40)
def _arrowleft(): return affinity.scale(_arrowright(), -1, 1, origin=(300, 0))


@glyph("arrowup", 40, 40)
def _arrowup():
    return affinity.rotate(_arrowright(), 90, origin=(300, CH * 0.45))


@glyph("arrowdown", 40, 40)
def _arrowdown():
    return affinity.rotate(_arrowright(), -90, origin=(300, CH * 0.45))


@glyph("dollar", 40, 40)
def _dollar(): return U([ess(460, 40, CH - 40), stem(230 - W / 2, -60, CH + 60)])


@glyph("degree", 40, 40)
def _degree(): return ring(0, 250, CH - 260, CH + O)


# ---------------------------------------------------------------- accents (Latin-1): a base glyph and a mark, as one shape
@glyph("dotlessi", 66, 66)
def _dotlessi(): return stem(0, 0, XH)


def mark(kind, cx, y0, cap):
    s = 0.82 if cap else 1.0
    hgt = (120 if cap else 150) * s
    if kind == "acute":
        return diag(cx - 34, cx + 52, y0, y0 + hgt, W * 0.86)
    if kind == "grave":
        return diag(cx + 34, cx - 52, y0, y0 + hgt, W * 0.86)
    if kind == "circumflex":
        return affinity.translate(peak(250, y0 + hgt, y0, 0.5), cx - 125, 0)
    if kind == "caron":
        return affinity.translate(vee(250, y0 + hgt, y0, 0.5), cx - 125, 0)
    if kind == "dieresis":
        return U([gem(cx - 100, y0 + 62, 0.86), gem(cx + 100, y0 + 62, 0.86)])
    if kind == "tilde":
        pts = [(cx - 135 + i * 9, y0 + 55 + 42 * math.sin((i / 30) * 2 * math.pi + math.pi * 0.15)) for i in range(31)]
        return stroke(pts, w=W * 0.86)
    if kind == "ring":
        return ring(cx - 92, cx + 92, y0, y0 + 168)
    if kind == "cedilla":
        return stroke([(cx + 8, 10), (cx + 8, -70)] + arc(cx - 40, -70, 48, 66, 0, -150)[1:], w=W * 0.8)
    if kind == "slash":
        return None
    raise KeyError(kind)


ACC = {  # char: (base glyph, mark)
    "À": ("A", "grave"), "Á": ("A", "acute"), "Â": ("A", "circumflex"), "Ã": ("A", "tilde"), "Ä": ("A", "dieresis"), "Å": ("A", "ring"),
    "Ç": ("C", "cedilla"), "È": ("E", "grave"), "É": ("E", "acute"), "Ê": ("E", "circumflex"), "Ë": ("E", "dieresis"),
    "Ì": ("I", "grave"), "Í": ("I", "acute"), "Î": ("I", "circumflex"), "Ï": ("I", "dieresis"), "Ñ": ("N", "tilde"),
    "Ò": ("O", "grave"), "Ó": ("O", "acute"), "Ô": ("O", "circumflex"), "Õ": ("O", "tilde"), "Ö": ("O", "dieresis"),
    "Ù": ("U", "grave"), "Ú": ("U", "acute"), "Û": ("U", "circumflex"), "Ü": ("U", "dieresis"), "Ý": ("Y", "acute"),
    "à": ("a", "grave"), "á": ("a", "acute"), "â": ("a", "circumflex"), "ã": ("a", "tilde"), "ä": ("a", "dieresis"), "å": ("a", "ring"),
    "ç": ("c", "cedilla"), "è": ("e", "grave"), "é": ("e", "acute"), "ê": ("e", "circumflex"), "ë": ("e", "dieresis"),
    "ì": ("dotlessi", "grave"), "í": ("dotlessi", "acute"), "î": ("dotlessi", "circumflex"), "ï": ("dotlessi", "dieresis"), "ñ": ("n", "tilde"),
    "ò": ("o", "grave"), "ó": ("o", "acute"), "ô": ("o", "circumflex"), "õ": ("o", "tilde"), "ö": ("o", "dieresis"),
    "ù": ("u", "grave"), "ú": ("u", "acute"), "û": ("u", "circumflex"), "ü": ("u", "dieresis"), "ý": ("y", "acute"), "ÿ": ("y", "dieresis"),
    "Š": ("S", "caron"), "š": ("s", "caron"), "Ž": ("Z", "caron"), "ž": ("z", "caron"), "Č": ("C", "caron"), "č": ("c", "caron"),
    "Ć": ("C", "acute"), "ć": ("c", "acute"), "Ń": ("N", "acute"), "ń": ("n", "acute"), "Ś": ("S", "acute"), "ś": ("s", "acute"),
    "Ź": ("Z", "acute"), "ź": ("z", "acute"), "Ğ": ("G", "caron"), "ğ": ("g", "caron"), "Ş": ("S", "cedilla"), "ş": ("s", "cedilla"),
}


def composite(base, kind, cap):
    def fn():
        g = G[base]()
        b = g.bounds
        cx = (b[0] + b[2]) / 2
        if base in ("a", "d", "g", "q"):
            cx = (b[0] + b[2] - W) / 2          # over the bowl, not the stem
        if base in ("b", "p"):
            cx = (b[0] + W + b[2]) / 2
        y0 = (CH + 64) if cap else (XH + 92)
        m = mark(kind, cx, y0, cap)
        return U([g, m]) if m is not None else g
    return fn


for ch, (base, kind) in ACC.items():
    nm = "uni%04X" % ord(ch)
    glyph(nm, *SB[base])(composite(base, kind, base[0].isupper() and base != "dotlessi"))


@glyph("Oslash", 50, 50)
def _Oslash(): return U([_O(), keep(diag(40, 672, -60, CH + 60, W * 0.9), x0=0, x1=712)])


@glyph("oslash", 46, 46)
def _oslash(): return U([_o(), keep(diag(30, 502, -50, XH + 50, W * 0.9), x0=0, x1=532)])


# ---------------------------------------------------------------- build
CMAP_EXTRA = {".": "period", ",": "comma", ":": "colon", ";": "semicolon", "-": "hyphen", "‐": "hyphen", "‑": "hyphen",
              "–": "endash", "—": "emdash", "−": "minus", "!": "exclam", "?": "question",
              "'": "quotesingle", '"': "quotedbl", "’": "quoteright", "‘": "quoteleft", "“": "quotedblleft", "”": "quotedblright",
              "/": "slash", "(": "parenleft", ")": "parenright", "[": "bracketleft", "]": "bracketright", "+": "plus", "=": "equal", "×": "multiply",
              "·": "periodcentered", "•": "bullet", "…": "ellipsis", "_": "underscore", "|": "bar", "*": "asterisk", "%": "percent",
              "#": "numbersign", "<": "less", ">": "greater", "&": "ampersand", "@": "at", "→": "arrowright", "←": "arrowleft",
              "↑": "arrowup", "↓": "arrowdown", "$": "dollar", "°": "degree"}
FIGS = "zero one two three four five six seven eight nine".split()


def finish(g):
    g = g.buffer(0)
    return g.simplify(0.35, preserve_topology=True)


def build(weight, style, out):
    global W
    W = weight
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

    order = [".notdef", "space", "nbspace"] + list(G.keys())
    shapes, adv = {}, {}
    for name, fn in G.items():
        g = finish(fn())
        l, r = SB[name]
        dx = l - g.bounds[0]
        g = affinity.translate(g, dx, 0)
        shapes[name] = g
        adv[name] = int(round(g.bounds[2] + r))
    for f in FIGS:  # tabular figures: every digit on the same advance, centred
        g = shapes[f]
        wd = g.bounds[2] - g.bounds[0]
        g = affinity.translate(g, (FIG - wd) / 2 - g.bounds[0], 0)
        shapes[f] = g
        adv[f] = FIG

    def draw(geom, pen):
        polys = geom.geoms if hasattr(geom, "geoms") else [geom]
        for p in polys:
            if p.is_empty or not isinstance(p, Polygon):
                continue
            p = orient(p, sign=-1.0)
            for rg in [p.exterior] + list(p.interiors):
                pts = []
                for x, y in rg.coords[:-1]:
                    q = (int(round(x)), int(round(y)))
                    if not pts or q != pts[-1]:
                        pts.append(q)
                if len(pts) > 1 and pts[0] == pts[-1]:
                    pts.pop()
                if len(pts) < 3:
                    continue
                pen.moveTo(pts[0])
                for q in pts[1:]:
                    pen.lineTo(q)
                pen.closePath()

    glyphs, metrics = {}, {}
    pen = TTGlyphPen(None)
    for i, q in enumerate([(60, 0), (60, CH), (440, CH), (440, 0)]):
        (pen.moveTo if i == 0 else pen.lineTo)(q)
    pen.closePath()
    glyphs[".notdef"] = pen.glyph(); metrics[".notdef"] = (500, 60)
    for sp in ("space", "nbspace"):
        glyphs[sp] = TTGlyphPen(None).glyph(); metrics[sp] = (250, 0)
    for name in G:
        pen = TTGlyphPen(None)
        draw(shapes[name], pen)
        glyphs[name] = pen.glyph()
        metrics[name] = (adv[name], int(round(shapes[name].bounds[0])) if not shapes[name].is_empty else 0)

    cmap = {32: "space", 0xA0: "nbspace"}
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz":
        if ch in G:
            cmap[ord(ch)] = ch
    for i, f in enumerate(FIGS):
        cmap[ord("0") + i] = f
    for ch, n in CMAP_EXTRA.items():
        cmap[ord(ch)] = n
    for ch in ACC:
        cmap[ord(ch)] = "uni%04X" % ord(ch)
    cmap[0x131] = "dotlessi"; cmap[0xD8] = "Oslash"; cmap[0xF8] = "oslash"

    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=930, descent=-270)
    fam = "Hive Strata"
    ps = "HiveStrata-" + style.replace(" ", "")
    fb.setupNameTable({"familyName": fam, "styleName": style, "uniqueFontIdentifier": ps + "-1.0", "fullName": fam + " " + style,
                       "psName": ps, "version": "Version 1.000", "copyright": "Copyright 2026 Anders / Mentifaber. Drawn for Hive."})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-220, sTypoLineGap=180, usWinAscent=960, usWinDescent=290,
                sCapHeight=CH, sxHeight=XH, achVendID="MNTF", fsType=0, usWeightClass={"Light": 300, "Regular": 400}.get(style, 600),
                fsSelection=0x40 if style == "Regular" else 0x00)
    fb.setupPost()
    fb.setupHead(unitsPerEm=1000)
    kern = """
    @ROUND_L = [o c d e g q a O C G Q];
    @DIAG = [v w y];
    feature kern {
      pos A [V W Y T] -64; pos [V W Y T] A -64; pos L [T V W Y] -70; pos [P F] A -50;
      pos [T] [a c d e g o q s u v w x y z] -62; pos [V W Y] [a c d e g o q s u] -40;
      pos [T V W Y P F] [period comma] -90; pos [r] [period comma] -60; pos @DIAG [period comma] -50;
      pos [r] [a c d e g o q] -14; pos [f] [a c d e g o q] -12; pos @DIAG @ROUND_L -12; pos @ROUND_L @DIAG -12;
      pos [k x] [o c d e g q a] -20; pos [L] quotesingle -70; pos [A] quotesingle -40;
      pos [O D Q] [A V W Y T X] -20; pos [K] [O C G Q] -24; pos R [V W Y T] -24;
    } kern;
    """
    addOpenTypeFeaturesFromString(fb.font, kern)
    fb.save(out + ".ttf")
    fb.font.flavor = "woff2"
    fb.font.save(out + ".woff2")
    return shapes, adv


if __name__ == "__main__":
    here = sys.argv[1] if len(sys.argv) > 1 else "."
    build(58, "Light", here + "/HiveStrata-Light")
    build(80, "Regular", here + "/HiveStrata-Regular")
    build(116, "SemiBold", here + "/HiveStrata-SemiBold")
    print("built", len(G), "glyphs x 3 weights")
