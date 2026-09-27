"""Mentifaber Display — Roman capital proportions, machined construction.

Construction rules (the whole font + logo derive from these):
  * Thick verticals / thin horizontals (Roman stress), thick down-diagonals.
  * Every outside corner is cut with a 45-degree chamfer (C).
  * Every inside corner gets a tool-radius fillet (R), like a milled pocket.
  * Serifs are short slabs; the fillet turns them into machined brackets.
"""
import math
from shapely.geometry import box, Point, Polygon, MultiPolygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely import affinity

CAP = 700
T = 104      # thick stroke
t = 44       # thin stroke
SH = 42      # serif height
SE = 44      # serif extension
OV = 12      # overshoot for rounds
R = 26       # inside tool radius
C = 19       # outside chamfer
BEAK = 108   # arm-end beak length

U = unary_union

# ---------------------------------------------------------------- primitives
def ellipse(cx, cy, rx, ry):
    return affinity.scale(Point(cx, cy).buffer(1, quad_segs=48), rx, ry, origin=(cx, cy))

def ring(cx, cy, rx, ry, th=T, tv=t):
    return ellipse(cx, cy, rx, ry).difference(ellipse(cx, cy, rx - th, ry - tv))

def diag(xb, xt, w, y0=0, y1=CAP):
    """Stroke with horizontal cut ends; w = perpendicular width."""
    a = math.atan2(y1 - y0, xt - xb)
    hw = abs(w / math.sin(a)) / 2
    p = Polygon([(xb - hw, y0), (xb + hw, y0), (xt + hw, y1), (xt - hw, y1)])
    return p, (xb - hw, xb + hw), (xt - hw, xt + hw), hw

def serif_b(xl, xr, left=True, right=True):
    return box(xl - (SE if left else 0), 0, xr + (SE if right else 0), SH)

def serif_t(xl, xr, left=True, right=True):
    return box(xl - (SE if left else 0), CAP - SH, xr + (SE if right else 0), CAP)

def stem(x0, w=T, y0=0, y1=CAP, top=True, bot=True, tl=True, tr=True, bl=True, br=True):
    parts = [box(x0, y0, x0 + w, y1)]
    if bot: parts.append(serif_b(x0, x0 + w, bl, br))
    if top: parts.append(serif_t(x0, x0 + w, tl, tr))
    return U(parts)

def halfplane(p1, p2, keep):
    L = 5000
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    n = math.hypot(dx, dy); dx, dy = dx / n, dy / n
    nx, ny = -dy, dx
    if (keep[0] - p1[0]) * nx + (keep[1] - p1[1]) * ny < 0:
        nx, ny = -nx, -ny
    a = (p1[0] - dx * L, p1[1] - dy * L); b = (p1[0] + dx * L, p1[1] + dy * L)
    return Polygon([a, b, (b[0] + nx * L, b[1] + ny * L), (a[0] + nx * L, a[1] + ny * L)])

def bowl(xs, cx, yb, yt, rx, th=T, tv=t):
    cy, ry = (yb + yt) / 2, (yt - yb) / 2
    right = box(cx, -2000, 5000, 2000)
    outer = U([box(xs, yb, cx, yt), ellipse(cx, cy, rx, ry).intersection(right)])
    inner = U([box(xs - 1, yb + tv, cx, yt - tv),
               ellipse(cx, cy, rx - th, ry - tv).intersection(right)])
    return outer.difference(inner)

def bez(p0, p1, p2, p3, n=90):
    out = []
    for i in range(n + 1):
        s = i / n; u = 1 - s
        out.append((u**3*p0[0] + 3*u*u*s*p1[0] + 3*u*s*s*p2[0] + s**3*p3[0],
                    u**3*p0[1] + 3*u*u*s*p1[1] + 3*u*s*s*p2[1] + s**3*p3[1]))
    return out

def sweep(segs, rx=T / 2, ry=t / 2):
    """Translate a flat elliptical nib along cubic segments -> Roman contrast."""
    nib = ellipse(0, 0, rx, ry)
    pts = []
    for sgm in segs:
        pts += bez(*sgm)
    hulls = []
    for a, b in zip(pts, pts[1:]):
        hulls.append(U([affinity.translate(nib, *a), affinity.translate(nib, *b)]).convex_hull)
    return U(hulls)

def finish(g):
    g = g.buffer(R, join_style="round", quad_segs=6).buffer(-R, join_style="round", quad_segs=6)
    g = g.buffer(-C, join_style="mitre", mitre_limit=20).buffer(C, join_style="bevel")
    return g.simplify(0.25)

# ---------------------------------------------------------------- glyphs
G = {}
SB = {}   # (lsb, rsb)

def glyph(name, l, r):
    def deco(fn):
        G[name] = fn; SB[name] = (l, r); return fn
    return deco

@glyph("A", 10, 10)
def _A():
    thin, tb, tt, _ = diag(100, 330, t)
    thick, kb, kt, _ = diag(610, 372, T)
    bar = box(0, 190, 800, 190 + t).intersection(U([thin, thick]).convex_hull)
    return U([thin, thick, bar, serif_b(*tb), serif_b(*kb)])

@glyph("B", 30, 34)
def _B():
    return U([stem(0, tr=False, br=False),
              bowl(0, 215, 372, CAP, 215), bowl(0, 235, 0, 372 + t, 245)])

@glyph("C", 40, 20)
def _C():
    cx, rx = 340, 340
    g = ring(cx, 350, rx, 350 + OV)
    return g.difference(box(cx + 0.60 * rx, -100, 2000, 900))

@glyph("D", 30, 40)
def _D():
    return U([stem(0, tr=False, br=False), bowl(0, 300, 0, CAP, 380)])

def arm(x1, y0, y1, beak_up):
    parts = [box(0, y0, x1, y1)]
    if beak_up: parts.append(box(x1 - 52, y0, x1, y0 + BEAK))
    else: parts.append(box(x1 - 52, y1 - BEAK, x1, y1))
    return U(parts)

@glyph("E", 30, 20)
def _E():
    mid = 356
    return U([stem(0, tr=False, br=False),
              arm(430, CAP - t, CAP, False), arm(450, 0, t, True),
              box(0, mid - t/2, 370, mid + t/2),
              box(370 - 50, mid - t/2 - 44, 370, mid + t/2 + 44)])

@glyph("F", 30, 20)
def _F():
    mid = 340
    return U([stem(0, tr=False),
              arm(430, CAP - t, CAP, False),
              box(0, mid - t/2, 370, mid + t/2),
              box(370 - 50, mid - t/2 - 44, 370, mid + t/2 + 44)])

@glyph("G", 40, 24)
def _G():
    cx, rx, cy = 350, 350, 350
    g = ring(cx, cy, rx, 350 + OV)
    g = g.difference(box(cx + 0.60 * rx, cy - 30, 2000, 900))
    spur = box(cx + rx - T, 90, cx + rx, cy - 30)
    bar = box(cx + 0.18 * rx, cy - 30 - t, cx + rx, cy - 30)
    return U([g, spur, bar])

@glyph("H", 30, 30)
def _H():
    return U([stem(0), stem(536), box(0, 360, 640, 360 + t)])

@glyph("I", 30, 30)
def _I():
    return stem(0)

@glyph("J", 10, 30)
def _J():
    rx, ry, cy = 210, 190, 50
    cx = T - rx
    hook = ring(cx, cy, rx, ry).intersection(box(cx - 0.62 * rx, -900, 2000, cy))
    return U([stem(0, y0=cy, bot=False), hook])

@glyph("K", 30, 6)
def _K():
    armp, ab, at, ahw = diag(31, 500, t, 180, CAP)
    leg, lb, lt, _ = diag(560, 170, T, 0, 560)
    cut = halfplane((31 + ahw, 180), (500 + ahw, CAP), (900, -100))
    leg = leg.intersection(cut)
    return U([stem(0), armp, leg, serif_t(*at), serif_b(*lb)])

@glyph("L", 30, 10)
def _L():
    return U([stem(0, br=False), arm(440, 0, t, True)])

@glyph("M", 12, 12)
def _M():
    l, lb, lt, _ = diag(60, 100, t + 10)
    d1, _, _, _ = diag(400, 132, T)
    d2, _, _, _ = diag(412, 690, t)
    r, rb, rt, _ = diag(760, 718, T)
    return U([l, d1, d2, r, serif_b(*lb), serif_b(*rb),
              serif_t(lt[0], lt[1], right=False), serif_t(rt[0], rt[1], left=False)])

@glyph("N", 30, 30)
def _N():
    d, _, _, _ = diag(596, 40, T)
    body = U([box(0, 0, 56, CAP), box(580, 0, 636, CAP), d]).intersection(box(0, -50, 636, 800))
    return U([body, serif_b(0, 56), serif_t(0, 56, right=False), serif_t(580, 636)])

@glyph("O", 40, 40)
def _O():
    return ring(360, 350, 360, 350 + OV)

@glyph("P", 30, 30)
def _P():
    return U([stem(0, tr=False), bowl(0, 215, 320, CAP, 255)])

@glyph("Q", 40, 30)
def _Q():
    tail, _, _, _ = diag(700, 330, t + 4, -150, 20)
    return U([ring(360, 350, 360, 350 + OV), tail])

@glyph("R", 30, 8)
def _R():
    leg, lb, _, _ = diag(510, 250, T, 0, 420)
    leg = leg.intersection(box(-100, -100, 2000, 330 + t))
    return U([stem(0, tr=False), bowl(0, 220, 330, CAP, 255), leg, serif_b(lb[0], lb[1], left=False)])

@glyph("S", 30, 30)
def _S():
    segs = [((372, 600), (372, 665), (300, 690), (215, 690)),
            ((215, 690), (110, 690), (52, 640), (52, 545)),
            ((52, 545), (52, 430), (378, 310), (378, 170)),
            ((378, 170), (378, 70), (310, 10), (215, 10)),
            ((215, 10), (120, 10), (58, 40), (58, 120))]
    g = sweep(segs)
    g = g.difference(box(300, 440, 600, 590)).difference(box(-100, 130, 110, 300))
    return g

@glyph("T", 12, 12)
def _T():
    return U([arm(600, CAP - t, CAP, False),
              box(0, CAP - BEAK, 52, CAP),
              stem(248, top=False)])

@glyph("U", 30, 30)
def _U():
    cy, W, tr_ = 300, 640, 50
    outer = U([box(0, cy, W, CAP), ellipse(W / 2, cy, W / 2, cy + OV).intersection(box(-9, -99, 999, cy))])
    ix0, ix1 = T, W - tr_
    inner = U([box(ix0, cy, ix1, CAP + 10),
               ellipse((ix0 + ix1) / 2, cy, (ix1 - ix0) / 2, cy + OV - t).intersection(box(-9, -99, 999, cy))])
    return U([outer.difference(inner), box(ix1, 0, W, cy),
              serif_t(0, T), serif_t(ix1, W), serif_b(ix1, W, left=False)])

@glyph("V", 10, 10)
def _V():
    k, _, kt, _ = diag(330, 70, T)
    n, _, nt, _ = diag(350, 620, t)
    return U([k, n, serif_t(*kt), serif_t(*nt)])

@glyph("W", 8, 8)
def _W():
    parts = []
    for off in (0, 370):
        k, _, kt, _ = diag(off + 285, off + 60, T)
        n, _, nt, _ = diag(off + 305, off + 530, t)
        parts += [k, n, serif_t(*kt), serif_t(*nt)]
    return U(parts)

@glyph("X", 8, 8)
def _X():
    k, kb, kt, _ = diag(570, 80, T)
    n, nb, nt, _ = diag(80, 560, t)
    return U([k, n, serif_t(*kt), serif_t(*nt), serif_b(*kb), serif_b(*nb)])

@glyph("Y", 8, 8)
def _Y():
    k, _, kt, _ = diag(322, 70, T, 300)
    n, _, nt, _ = diag(334, 590, t, 300)
    return U([k, n, stem(270, top=False, y1=360), serif_t(*kt), serif_t(*nt)])

@glyph("Z", 26, 26)
def _Z():
    d, _, _, _ = diag(62, 478, T * 0.95)
    return U([box(30, CAP - t, 540, CAP), box(30, CAP - BEAK, 82, CAP),
              box(0, 0, 580, t), box(528, 0, 580, BEAK), d])

# ---------------------------------------------------------------- figures
@glyph("zero", 36, 36)
def _0():
    return ring(260, 350, 260, 350 + OV)

@glyph("one", 50, 50)
def _1():
    flag, _, _, _ = diag(20, 130, t, 520, CAP)
    return U([box(120, 0, 224, CAP), box(40, 0, 304, SH), flag])

@glyph("two", 30, 30)
def _2():
    segs = [((72, 560), (80, 650), (160, 690), (250, 690)),
            ((250, 690), (360, 690), (420, 630), (420, 540)),
            ((420, 540), (420, 400), (240, 260), (80, 30))]
    g = sweep(segs).difference(box(-100, 400, 150, 560))
    return U([g, box(30, 0, 470, t + 4), box(418, 0, 470, BEAK)])

@glyph("three", 30, 30)
def _3():
    top = [((70, 590), (90, 670), (160, 690), (245, 690)),
           ((245, 690), (345, 690), (400, 640), (400, 560)),
           ((400, 560), (400, 450), (320, 398), (190, 398))]
    low = [((190, 398), (360, 398), (438, 320), (438, 210)),
           ((438, 210), (438, 80), (350, 10), (240, 10)),
           ((240, 10), (140, 10), (80, 40), (62, 110))]
    g = U([sweep(top), sweep(low)])
    return g.difference(box(-100, 420, 130, 590)).difference(box(-100, 110, 120, 300))

@glyph("four", 20, 30)
def _4():
    d, _, _, _ = diag(40, 350, t + 6, 190, CAP)
    return U([box(318, 0, 422, CAP), box(270, 0, 470, SH), box(10, 190, 500, 190 + t), d])

@glyph("five", 30, 30)
def _5():
    segs = [((150, 420), (190, 445), (230, 455), (262, 455)),
            ((262, 455), (390, 455), (450, 370), (450, 240)),
            ((450, 240), (450, 90), (360, 10), (240, 10)),
            ((240, 10), (140, 10), (80, 40), (62, 110))]
    g = sweep(segs).difference(box(-100, 110, 120, 300))
    return U([g, box(100, 400, 186, CAP), box(100, CAP - t, 440, CAP), box(388, CAP - BEAK, 440, CAP)])

def six():
    cx, rx, cy, ry = 255, 210, 230, 242
    loop = ring(cx, cy, rx, ry)
    up = sweep([((cx - rx + T / 2, 240), (cx - rx + T / 2, 520), (170, 690), (330, 690)),
                ((330, 690), (380, 690), (415, 675), (440, 630))])
    return U([loop, up]).difference(box(430, 560, 700, 900))

@glyph("six", 36, 30)
def _6():
    return six()

@glyph("nine", 30, 36)
def _9():
    return affinity.rotate(six(), 180, origin=(250, 350))

@glyph("seven", 20, 20)
def _7():
    d, _, _, _ = diag(170, 440, T * 0.9, 0, CAP - 10)
    return U([box(40, CAP - t, 470, CAP), box(40, CAP - BEAK, 92, CAP), d])

@glyph("eight", 30, 30)
def _8():
    return U([ring(250, 530, 190, 182, T * 0.92), ring(250, 190, 222, 202)])

# ---------------------------------------------------------------- punctuation
def dot(x=0, y=0):
    return box(x, y, x + T, y + T)

def comma_shape(y=0):
    tail, _, _, _ = diag(8, T - 36, 42, y - 170, y + 40)
    return U([dot(0, y), tail])

@glyph("period", 50, 50)
def _period(): return dot()

@glyph("comma", 50, 50)
def _comma(): return comma_shape()

@glyph("colon", 50, 50)
def _colon(): return U([dot(), dot(0, 440)])

@glyph("semicolon", 50, 50)
def _semicolon(): return U([comma_shape(), dot(0, 440)])

@glyph("hyphen", 40, 40)
def _hyphen(): return box(0, 330, 270, 392)

@glyph("endash", 30, 30)
def _endash(): return box(0, 330, 520, 392)

@glyph("emdash", 20, 20)
def _emdash(): return box(0, 330, 900, 392)

@glyph("exclam", 60, 60)
def _exclam():
    return U([Polygon([(0, CAP), (T, CAP), (T - 20, 220), (20, 220)]), dot()])

@glyph("question", 30, 40)
def _question():
    segs = [((70, 580), (80, 660), (150, 690), (230, 690)),
            ((230, 690), (330, 690), (390, 630), (390, 540)),
            ((390, 540), (390, 420), (232, 400), (232, 280))]
    g = sweep(segs).difference(box(-100, 420, 110, 580)).difference(box(0, 200, 400, 250))
    return U([g, dot(180, 0)])

@glyph("quotesingle", 50, 50)
def _quotesingle():
    return Polygon([(0, CAP), (T * 0.85, CAP), (T * 0.6, 470), (T * 0.25, 470)])

@glyph("quotedbl", 50, 50)
def _quotedbl():
    q = Polygon([(0, CAP), (T * 0.85, CAP), (T * 0.6, 470), (T * 0.25, 470)])
    return U([q, affinity.translate(q, 150, 0)])

@glyph("slash", 10, 10)
def _slash():
    s, _, _, _ = diag(20, 330, t + 14, -110, CAP + 60)
    return s

@glyph("parenleft", 50, 20)
def _parenleft():
    return sweep([((230, 770), (110, 670), (60, 500), (60, 300)),
                  ((60, 300), (60, 100), (110, -70), (230, -170))], T * 0.8 / 2, 24)

@glyph("parenright", 20, 50)
def _parenright():
    return affinity.scale(_parenleft(), -1, 1, origin=(150, 0))

@glyph("plus", 40, 40)
def _plus():
    return U([box(0, 330, 460, 392), box(199, 131, 261, 591)])

@glyph("equal", 40, 40)
def _equal():
    return U([box(0, 250, 460, 306), box(0, 416, 460, 472)])

# ---------------------------------------------------------------- lowercase
# Same machine, smaller part: x-height 480, ascenders to 740, descenders to -230.
XH, ASC, DSC = 480, 740, -230
Tl, tl = 96, 42          # lowercase thick / thin (a touch lighter than caps)

def lserif_b(xl, xr, y=0, left=True, right=True):
    return box(xl - (SE if left else 0), y, xr + (SE if right else 0), y + SH)

def lserif_t(xl, xr, y=XH, left=True, right=True):
    return box(xl - (SE if left else 0), y - SH, xr + (SE if right else 0), y)

def lstem(x0, y0=0, y1=XH, top="l", bot="lr", w=Tl):
    parts = [box(x0, y0, x0 + w, y1)]
    if top: parts.append(lserif_t(x0, x0 + w, y1, "l" in top, "r" in top))
    if bot: parts.append(lserif_b(x0, x0 + w, y0, "l" in bot, "r" in bot))
    return U(parts)

def arch(x0, x1, ytop=XH, ry=190):
    """Upper half of a ring spanning x0..x1 — the shoulder of n, m, h."""
    cx, rx = (x0 + x1) / 2, (x1 - x0) / 2
    cy = ytop - ry
    r = ring(cx, cy, rx, ry + OV / 2, Tl * 0.9, tl)
    return r.intersection(box(x0 - 50, cy, x1 + 50, ytop + 50)), cy

def lring(cx, cy=XH / 2, rx=240, ry=XH / 2 + OV):
    return ring(cx, cy, rx, ry, Tl, tl)

@glyph("a.l", 30, 20)
def _a():
    W = 400
    top, cy = arch(40, W, XH, 170)
    top = top.difference(box(-100, cy - 10, 150, cy + 95))          # open terminal
    stem_ = box(W - Tl, 0, W, cy)
    bowl_ = ring(210, 135, 190, 140 + OV / 2, Tl * 0.9, tl).difference(box(W - Tl / 2, -100, 900, 900))
    link = box(150, 260, W - 20, 260 + tl)
    return U([top, stem_, bowl_, link, lserif_b(W - Tl, W, 0, False, True)])

@glyph("b.l", 30, 34)
def _b():
    return U([lstem(0, 0, ASC, top="l", bot=None),
              lring(270, rx=240).difference(box(-100, -100, Tl / 2, 900))])

@glyph("c.l", 36, 20)
def _c():
    return lring(240).difference(box(240 + 0.55 * 240, -100, 2000, 900))

@glyph("d.l", 36, 30)
def _d():
    return affinity.scale(_b(), -1, 1, origin=(0, 0))

@glyph("e.l", 36, 26)
def _e():
    cx, rx = 245, 245
    g = lring(cx, rx=rx).difference(box(cx + 0.30 * rx, -100, 2000, XH / 2 - 30))
    bar = box(cx - rx, XH / 2 - 10, cx + rx, XH / 2 - 10 + tl).intersection(ellipse(cx, XH / 2, rx, XH / 2 + OV))
    return U([g, bar])

@glyph("f.l", 4, -36)
def _f():
    hook = ring(Tl + 110, ASC - 150, 110 + Tl, 150 + OV / 2, Tl * 0.9, tl).intersection(box(Tl / 2, ASC - 150, 900, 900))
    beak = box(Tl + 110 + Tl - 44, ASC - 110, Tl + 110 + Tl + 8, ASC + OV / 2)
    return U([box(0, 0, Tl, ASC - 150), hook, beak, box(-24, XH - tl, 240, XH), lserif_b(0, Tl)])

@glyph("g.l", 30, 30)
def _g():
    W = 470
    bowl_ = lring(225, cy=XH / 2 + 30, rx=225, ry=XH / 2 - 10).difference(box(W - Tl / 2, -300, 900, 900))
    stem_ = box(W - Tl, -60, W, XH)
    ear = box(W - Tl, XH - SH, W + SE, XH)
    hook = ring(W / 2 + 10, -60, W / 2 - 10 + 5, 170, Tl * 0.9, tl).intersection(box(W * 0.18, -900, 900, -60))
    return U([bowl_, stem_, ear, hook])

@glyph("h.l", 30, 30)
def _h():
    W = 470
    top, cy = arch(0, W)
    return U([lstem(0, 0, ASC), top, lstem(W - Tl, 0, cy, top=None)])

@glyph("i.l", 30, 30)
def _i():
    return U([lstem(0), box(0, XH + 90, Tl, XH + 90 + Tl)])

@glyph("j.l", 10, 30)
def _j():
    rx, ry, cy = 170, 150, -80
    cx = Tl - rx
    hook = ring(cx, cy, rx, ry, Tl, tl).intersection(box(cx - 0.62 * rx, -900, 2000, cy))
    return U([box(0, cy, Tl, XH), lserif_t(0, Tl, XH, True, False), hook, box(0, XH + 90, Tl, XH + 90 + Tl)])

@glyph("k.l", 30, 6)
def _k():
    armp, ab, at, ahw = diag(Tl - 20, 400, tl, 130, XH)
    leg, lb, lt, _ = diag(450, 150, Tl, 0, 330)
    cut = halfplane((Tl - 20 + ahw, 130), (400 + ahw, XH), (900, -100))
    return U([lstem(0, 0, ASC), armp, leg.intersection(cut), lserif_t(*at, XH), lserif_b(*lb)])

@glyph("l.l", 30, 30)
def _l():
    return lstem(0, 0, ASC)

@glyph("m.l", 30, 30)
def _m():
    W1, W2 = 380, 760
    a1, cy = arch(0, W1)
    a2, _ = arch(W1 - Tl, W2)
    return U([lstem(0), a1, lstem(W1 - Tl, 0, cy, top=None), a2, lstem(W2 - Tl, 0, cy, top=None)])

@glyph("n.l", 30, 30)
def _n():
    W = 470
    top, cy = arch(0, W)
    return U([lstem(0), top, lstem(W - Tl, 0, cy, top=None)])

@glyph("o.l", 36, 36)
def _o():
    return lring(250, rx=250)

@glyph("p.l", 30, 34)
def _p():
    return U([lstem(0, DSC, XH, top="l", bot="lr"),
              lring(270, rx=240).difference(box(-100, -100, Tl / 2, 900))])

@glyph("q.l", 36, 30)
def _q():
    W = 510
    return U([box(W - Tl, DSC, W, XH), lserif_b(W - Tl, W, DSC),
              lring(W - 270, rx=240).difference(box(W - Tl / 2, -100, 2000, 900))])

@glyph("r.l", 30, 10)
def _r():
    cx, cy, rx, ry = Tl + 150, XH - 170, 150 + Tl, 170
    flag = ring(cx, cy, rx, ry + OV / 2, Tl * 0.85, tl).intersection(box(Tl / 2, cy + 20, cx + 30, 900))
    beak = box(cx - 10, XH - 120, cx + 44, XH + OV / 2)
    return U([lstem(0, 0, XH, top="l", bot="lr"), flag, beak])

@glyph("s.l", 30, 30)
def _s():
    k, kx = XH / 700, 0.8
    P = lambda p: (p[0] * kx, p[1] * k)
    segs = [((372, 600), (372, 665), (300, 690), (215, 690)),
            ((215, 690), (110, 690), (52, 640), (52, 545)),
            ((52, 545), (52, 430), (378, 310), (378, 170)),
            ((378, 170), (378, 70), (310, 10), (215, 10)),
            ((215, 10), (120, 10), (58, 40), (58, 120))]
    g = sweep([tuple(P(p) for p in sg) for sg in segs], Tl * 0.92 / 2, tl / 2)
    return g.difference(box(300 * kx, 440 * k, 600, 590 * k)).difference(box(-100, 130 * k, 110 * kx, 300 * k))

@glyph("t.l", 20, 10)
def _t():
    return U([box(40, 0, 40 + Tl, XH + 130), box(0, XH - tl, 280, XH),
              box(40, 0, 300, tl), box(300 - 46, 0, 300, 96)])

@glyph("u.l", 30, 30)
def _u():
    return affinity.rotate(_n(), 180, origin=(235, XH / 2))

@glyph("v.l", 10, 10)
def _v():
    k_, _, kt, _ = diag(260, 40, Tl, 0, XH)
    n_, _, nt, _ = diag(276, 480, tl, 0, XH)
    return U([k_, n_, lserif_t(*kt), lserif_t(*nt)])

@glyph("w.l", 8, 8)
def _w():
    parts = []
    for off in (0, 300):
        k_, _, kt, _ = diag(off + 230, off + 40, Tl, 0, XH)
        n_, _, nt, _ = diag(off + 246, off + 420, tl, 0, XH)
        parts += [k_, n_, lserif_t(*kt), lserif_t(*nt)]
    return U(parts)

@glyph("x.l", 8, 8)
def _x():
    k_, kb, kt, _ = diag(450, 60, Tl, 0, XH)
    n_, nb, nt, _ = diag(60, 440, tl, 0, XH)
    return U([k_, n_, lserif_t(*kt), lserif_t(*nt), lserif_b(*kb), lserif_b(*nb)])

@glyph("y.l", 10, 10)
def _y():
    k_, _, kt, _ = diag(270, 40, Tl, 0, XH)
    n_, nb, nt, _ = diag(110, 480, tl, DSC, XH)
    return U([k_, n_, lserif_t(*kt), lserif_t(*nt), box(nb[0] - 40, DSC, nb[1] + 10, DSC + SH)])

@glyph("z.l", 26, 26)
def _z():
    d, _, _, _ = diag(50, 380, Tl * 0.95, 0, XH)
    return U([box(20, XH - tl, 410, XH), box(20, XH - 90, 62, XH),
              box(0, 0, 440, tl), box(398, 0, 440, 90), d])

@glyph("periodcentered", 50, 50)
def _periodcentered(): return box(0, 300, T, 300 + T)


# ---------------------------------------------------------------- build
if __name__ == "__main__":
    import sys
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

    TRACK = 22
    order = [".notdef", "space"] + list(G.keys())
    shapes, advances = {}, {}

    for name, fn in G.items():
        g = finish(fn())
        minx = g.bounds[0]
        l, r = SB[name]
        g = affinity.translate(g, l + TRACK - minx, 0)
        shapes[name] = g
        advances[name] = int(round(g.bounds[2] + r + TRACK))

    def draw(geom, pen):
        polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
        for p in polys:
            if p.is_empty: continue
            p = orient(p, sign=-1.0)  # TrueType: outer clockwise
            for ringc in [p.exterior] + list(p.interiors):
                pts = [(int(round(x)), int(round(y))) for x, y in ringc.coords[:-1]]
                clean = []
                for q in pts:
                    if not clean or q != clean[-1]:
                        clean.append(q)
                if len(clean) > 1 and clean[0] == clean[-1]:
                    clean.pop()
                if len(clean) < 3: continue
                pen.moveTo(clean[0])
                for q in clean[1:]:
                    pen.lineTo(q)
                pen.closePath()

    glyphs, metrics = {}, {}
    pen = TTGlyphPen(None)
    for q in [(50, 0), (50, 700), (450, 700), (450, 0)]:
        (pen.moveTo if q == (50, 0) else pen.lineTo)(q)
    pen.closePath()
    pen.moveTo((100, 50)); pen.lineTo((400, 50)); pen.lineTo((400, 650)); pen.lineTo((100, 650)); pen.closePath()
    glyphs[".notdef"] = pen.glyph(); metrics[".notdef"] = (500, 50)
    glyphs["space"] = TTGlyphPen(None).glyph(); metrics["space"] = (260, 0)
    for name in G:
        pen = TTGlyphPen(None)
        draw(shapes[name], pen)
        glyphs[name] = pen.glyph()
        metrics[name] = (advances[name], int(round(shapes[name].bounds[0])))

    cmap = {32: "space"}
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        cmap[ord(ch)] = ch; cmap[ord(ch.lower())] = ch.lower() + ".l"
    names = "zero one two three four five six seven eight nine".split()
    for i, n in enumerate(names): cmap[ord("0") + i] = n
    punct = {".": "period", ",": "comma", ":": "colon", ";": "semicolon", "-": "hyphen",
             "\u2013": "endash", "\u2014": "emdash", "!": "exclam", "?": "question",
             "'": "quotesingle", "\u2019": "quotesingle", "\u2018": "quotesingle",
             '"': "quotedbl", "\u201c": "quotedbl", "\u201d": "quotedbl", "/": "slash",
             "\u00b7": "periodcentered", "(": "parenleft", ")": "parenright", "+": "plus", "=": "equal"}
    for ch, n in punct.items(): cmap[ord(ch)] = n

    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900, descent=-250)
    fam = "Mentifaber Display"
    fb.setupNameTable({"familyName": fam, "styleName": "Regular",
                       "uniqueFontIdentifier": "MentifaberDisplay-Regular-0.2",
                       "fullName": fam + " Regular", "psName": "MentifaberDisplay-Regular",
                       "version": "Version 0.200", "copyright": "Copyright 2026 Anders / Mentifaber"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, sTypoLineGap=100,
                usWinAscent=950, usWinDescent=280, sCapHeight=CAP, sxHeight=480,
                achVendID="MNTF", fsType=0)
    fb.setupPost()
    fb.setupHead(unitsPerEm=1000)

    kern = """
    @LEFTDIAG = [A];
    @OPENRIGHT = [T V W Y];
    feature kern {
      pos A [V Y] -70; pos A W -45; pos A T -55; pos [V Y] A -70; pos W A -45; pos T A -55;
      pos L T -70; pos L [V Y] -70; pos L W -45; pos P A -45; pos F A -35;
      pos [T V W Y P F] [period comma] -80;
      pos [A L] quotesingle -60; pos [A L] quotedbl -60;
      pos T [O C G Q] -20; pos [O D Q] [A V W Y T X] -18; pos [V W Y] [O C G Q] -18;
      pos R [V W Y T] -20; pos K [O C G Q] -25;
    } kern;
    """
    addOpenTypeFeaturesFromString(fb.font, kern)
    fb.save("MentifaberDisplay-Regular.ttf")
    fb.font.flavor = "woff2"
    fb.font.save("MentifaberDisplay-Regular.woff2")
    print("built", len(G), "glyphs")
