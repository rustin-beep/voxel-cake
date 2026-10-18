#!/usr/bin/env python3
"""Build birthday-cake.svg.

Single-file, self-contained flat-vector birthday cake with soft
volumetric shading.  Design space is 1200x1200; the art is placed in a
1080x1350 (4:5) viewBox with width/height 100% so it scales cleanly to
phone widths.

Run:  python build_cake.py
"""

import math
import pathlib
import random

# --------------------------------------------------------------------------
# canvas / placement
# --------------------------------------------------------------------------
VW, VH = 1080, 1350          # output viewBox (4:5 portrait)
SCALE = 1.20
TX = VW / 2 - 600 * SCALE    # -180
TY = -77.4

# --------------------------------------------------------------------------
# palette
# --------------------------------------------------------------------------
BG_TOP = "#FFF3E4"
BG_BOT = "#F7DEC2"
PLATE_HI = "#FFFFFF"
PLATE_MID = "#FBF2E6"
PLATE_EDGE = "#EBDCC7"
FOOT_TOP = "#FFFDF8"
FOOT_LO = "#EFE1CE"
STEM_HI = "#FFFDF8"
STEM_LO = "#E7D8C3"
PINK_HI = "#F9BDB4"
PINK_MID = "#F5A9A8"
PINK_LO = "#E58C96"
CREAM_HI = "#FFF9EC"
CREAM_MID = "#FBEDD6"
CREAM_LO = "#EDD5B2"
ICING_HI = "#FFFEF9"
ICING_MID = "#FFF9EC"
ICING_LO = "#F6E4C9"
IPINK_HI = "#FDB7BD"
IPINK_MID = "#F9A1AC"
IPINK_LO = "#EC8496"

SPRINKLE_COLORS = ["#D8415E", "#6FC2AF", "#F2BC57", "#FFFFFF", "#F49AA6"]
CONFETTI_COLORS = ["#F3B2AD", "#A9D9CB", "#F6CE86", "#BCC9EC", "#EFAAC9", "#F7C9A6"]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def f(v):
    v = round(float(v), 2)
    if abs(v) < 1e-9:
        v = 0.0
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def P(x, y):
    return f"{f(x)},{f(y)}"


def smooth_segments(pts):
    """Catmull-Rom through pts -> cubic bezier segments (no moveto)."""
    out = []
    n = len(pts)
    for i in range(n - 1):
        p1, p2 = pts[i], pts[i + 1]
        p0 = pts[i - 1] if i > 0 else (2 * p1[0] - p2[0], 2 * p1[1] - p2[1])
        p3 = pts[i + 2] if i + 2 < n else (2 * p2[0] - p1[0], 2 * p2[1] - p1[1])
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        out.append(f"C {P(*c1)} {P(*c2)} {P(*p2)}")
    return " ".join(out)


def ellipse(cx, cy, rx, ry, fill, extra=""):
    e = f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{fill}"'
    if extra:
        e += " " + extra
    return e + "/>"


def tier_body(cx, top, bot, rx, ry):
    return (
        f"M {P(cx - rx, top)} L {P(cx - rx, bot)} "
        f"A {f(rx)},{f(ry)} 0 0 0 {P(cx + rx, bot)} "
        f"L {P(cx + rx, top)} "
        f"A {f(rx)},{f(ry)} 0 0 0 {P(cx - rx, top)} Z"
    )


def rim_y(x, cx, cy, rx, ry):
    u = max(-1.0, min(1.0, (x - cx) / rx))
    return cy + ry * math.sqrt(max(0.0, 1.0 - u * u))


def make_drip(cx, cy, rx, ry, base, fingers, fillet=15.0):
    """Build the icing band of one tier.

    The band's lower edge is a thick layer plus a handful of drip fingers.
    Each finger has vertical shoulders, a filleted join to the layer and a
    semicircular cap, which is what makes the edge read as poured icing
    instead of a sawtooth.  Returns (band path, lower-edge path, edge_y).
    """
    def fade(x):
        u = min(1.0, abs(x - cx) / rx)
        return max(0.0, 1.0 - u ** 12)

    def base_y(x):
        return rim_y(x, cx, cy, rx, ry) + base * fade(x)

    def edge_y(x):
        for xc, w, depth in fingers:
            r = w / 2.0
            if abs(x - xc) <= r:
                dx = x - xc
                return base_y(xc) + depth - r + math.sqrt(max(0.0, r * r - dx * dx))
        return base_y(x)

    x_left, x_right = cx - rx, cx + rx
    d = [f"M {P(x_left, cy)}"]
    cur = x_left

    def follow(tx):
        """walk the layer's lower edge along the rim to tx"""
        nonlocal cur
        n = max(1, int(math.ceil((tx - cur) / 7.0)))
        for i in range(1, n + 1):
            x = cur + (tx - cur) * i / n
            d.append(f"L {P(x, base_y(x))}")
        cur = tx

    for xc, w, depth in sorted(fingers):
        r = w / 2.0
        y0 = base_y(xc - r)
        y1 = base_y(xc + r)
        cap = base_y(xc) + depth - r
        follow(xc - r - fillet)
        d.append(f"Q {P(xc - r, y0)} {P(xc - r, y0 + fillet)}")
        d.append(f"L {P(xc - r, cap)}")
        d.append(f"A {f(r)},{f(r)} 0 0 0 {P(xc + r, cap)}")
        d.append(f"L {P(xc + r, y1 + fillet)}")
        d.append(f"Q {P(xc + r, y1)} {P(xc + r + fillet, base_y(xc + r + fillet))}")
        cur = xc + r + fillet

    follow(x_right)
    lower = " ".join(d)
    band = (f"{lower} L {P(x_right, cy)} "
            f"A {f(rx)},{f(ry - 8)} 0 0 1 {P(x_left, cy)} Z")
    return band, lower, edge_y


def sparkle(x, y, r, col, op, inner=0.3):
    pts = []
    for i in range(8):
        a = -math.pi / 2 + i * math.pi / 4
        rr = r if i % 2 == 0 else r * inner
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    d = "M " + " L ".join(P(px, py) for px, py in pts) + " Z"
    return f'<path d="{d}" fill="{col}" opacity="{op}"/>'


# --------------------------------------------------------------------------
# geometry (design space 1200x1200)
# --------------------------------------------------------------------------
PLATE_CY, PLATE_RX, PLATE_RY, PLATE_RIM = 748, 312, 80, 9
FOOT_CY, FOOT_RX, FOOT_RY = 952, 122, 28

B = dict(cx=600, top=540, bot=730, rx=230, ry=62)   # bottom tier (pink)
T = dict(cx=600, top=364, bot=540, rx=158, ry=42)   # top tier (cream)

# (center x, width, how far the tip hangs below the icing layer)
B_FINGERS = [(426, 34, 60), (513, 30, 78), (600, 36, 54), (687, 30, 74), (774, 32, 58)]
T_FINGERS = [(480, 28, 38), (552, 32, 52), (624, 26, 34), (696, 30, 44)]

B_DRIP = make_drip(600, B["top"], B["rx"], B["ry"], 17, B_FINGERS, fillet=15)
T_DRIP = make_drip(600, T["top"], T["rx"], T["ry"], 18, T_FINGERS, fillet=14)

CANDLES = [
    dict(x=520, base=374, h=86, grad="cndL", wax="#D3F0E7"),
    dict(x=600, base=374, h=102, grad="cndC", wax="#FFC9D1"),
    dict(x=684, base=374, h=78, grad="cndR", wax="#FFE5B4"),
]


# --------------------------------------------------------------------------
# defs
# --------------------------------------------------------------------------
def defs():
    d = []
    a = d.append
    a('<defs>')
    a(f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
      f'<stop offset="0" stop-color="{BG_TOP}"/><stop offset="1" stop-color="{BG_BOT}"/></linearGradient>')
    a('<radialGradient id="halo" cx="50%" cy="50%" r="50%">'
      '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.7"/>'
      '<stop offset="0.55" stop-color="#FFF6E7" stop-opacity="0.30"/>'
      '<stop offset="1" stop-color="#FFF6E7" stop-opacity="0"/></radialGradient>')
    a('<radialGradient id="shadow" cx="50%" cy="50%" r="50%">'
      '<stop offset="0" stop-color="#8E6247" stop-opacity="0.32"/>'
      '<stop offset="0.55" stop-color="#8E6247" stop-opacity="0.14"/>'
      '<stop offset="1" stop-color="#8E6247" stop-opacity="0"/></radialGradient>')
    a('<radialGradient id="pinkShadow" cx="50%" cy="50%" r="50%">'
      '<stop offset="0" stop-color="#A34A5E" stop-opacity="0.30"/>'
      '<stop offset="0.55" stop-color="#A34A5E" stop-opacity="0.12"/>'
      '<stop offset="1" stop-color="#A34A5E" stop-opacity="0"/></radialGradient>')
    a('<radialGradient id="sheen" cx="50%" cy="50%" r="50%">'
      '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.60"/>'
      '<stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.22"/>'
      '<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>')
    a(f'<linearGradient id="plateTop" x1="0" y1="0" x2="0" y2="1">'
      f'<stop offset="0" stop-color="{PLATE_HI}"/><stop offset="0.62" stop-color="{PLATE_MID}"/>'
      f'<stop offset="1" stop-color="#F6EBDC"/></linearGradient>')
    a(f'<linearGradient id="footTop" x1="0" y1="0" x2="0" y2="1">'
      f'<stop offset="0" stop-color="{FOOT_TOP}"/><stop offset="1" stop-color="{FOOT_LO}"/></linearGradient>')
    a(f'<linearGradient id="stem" x1="0" y1="0" x2="1" y2="0">'
      f'<stop offset="0" stop-color="{STEM_HI}"/><stop offset="0.38" stop-color="#FFF7EA"/>'
      f'<stop offset="0.8" stop-color="{STEM_LO}"/><stop offset="1" stop-color="#DECCB5"/></linearGradient>')
    a(f'<linearGradient id="pinkBody" x1="0" y1="0" x2="1" y2="0">'
      f'<stop offset="0" stop-color="{PINK_HI}"/><stop offset="0.30" stop-color="{PINK_MID}"/>'
      f'<stop offset="0.70" stop-color="#F39DA2"/><stop offset="1" stop-color="{PINK_LO}"/></linearGradient>')
    a(f'<linearGradient id="creamBody" x1="0" y1="0" x2="1" y2="0">'
      f'<stop offset="0" stop-color="{CREAM_HI}"/><stop offset="0.30" stop-color="{CREAM_MID}"/>'
      f'<stop offset="0.70" stop-color="#F8E7CB"/><stop offset="1" stop-color="{CREAM_LO}"/></linearGradient>')
    a('<linearGradient id="pinkShade" x1="0" y1="0" x2="1" y2="0">'
      '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/>'
      '<stop offset="0.16" stop-color="#FFFFFF" stop-opacity="0.07"/>'
      '<stop offset="0.34" stop-color="#FFFFFF" stop-opacity="0"/>'
      '<stop offset="0.66" stop-color="#7A2C3E" stop-opacity="0"/>'
      '<stop offset="0.86" stop-color="#7A2C3E" stop-opacity="0.10"/>'
      '<stop offset="1" stop-color="#7A2C3E" stop-opacity="0.20"/></linearGradient>')
    a('<linearGradient id="creamShade" x1="0" y1="0" x2="1" y2="0">'
      '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.18"/>'
      '<stop offset="0.16" stop-color="#FFFFFF" stop-opacity="0.08"/>'
      '<stop offset="0.34" stop-color="#FFFFFF" stop-opacity="0"/>'
      '<stop offset="0.66" stop-color="#A97B45" stop-opacity="0"/>'
      '<stop offset="0.86" stop-color="#A97B45" stop-opacity="0.07"/>'
      '<stop offset="1" stop-color="#A97B45" stop-opacity="0.16"/></linearGradient>')
    a('<linearGradient id="pinkBottom" x1="0" y1="0" x2="0" y2="1">'
      '<stop offset="0.58" stop-color="#7A2C3E" stop-opacity="0"/>'
      '<stop offset="1" stop-color="#7A2C3E" stop-opacity="0.14"/></linearGradient>')
    a('<linearGradient id="creamBottom" x1="0" y1="0" x2="0" y2="1">'
      '<stop offset="0.55" stop-color="#A97B45" stop-opacity="0"/>'
      '<stop offset="1" stop-color="#A97B45" stop-opacity="0.12"/></linearGradient>')
    a('<radialGradient id="creamTop" cx="38%" cy="28%" r="80%">'
      '<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#FFF7E8"/>'
      '<stop offset="1" stop-color="#F7E3C6"/></radialGradient>')
    a('<radialGradient id="pinkTop" cx="38%" cy="28%" r="80%">'
      '<stop offset="0" stop-color="#FFCCCA"/><stop offset="0.6" stop-color="#FAA9B1"/>'
      '<stop offset="1" stop-color="#EF8F9E"/></radialGradient>')
    a(f'<linearGradient id="icingCream" x1="0" y1="0" x2="0" y2="1">'
      f'<stop offset="0" stop-color="{ICING_HI}"/><stop offset="0.42" stop-color="{ICING_MID}"/>'
      f'<stop offset="1" stop-color="{ICING_LO}"/></linearGradient>')
    a(f'<linearGradient id="icingPink" x1="0" y1="0" x2="0" y2="1">'
      f'<stop offset="0" stop-color="{IPINK_HI}"/><stop offset="0.5" stop-color="{IPINK_MID}"/>'
      f'<stop offset="1" stop-color="{IPINK_LO}"/></linearGradient>')
    a('<radialGradient id="beadCream" cx="35%" cy="28%" r="75%">'
      '<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.7" stop-color="#FCEFD9"/>'
      '<stop offset="1" stop-color="#EFDAB9"/></radialGradient>')
    a('<radialGradient id="beadPink" cx="35%" cy="28%" r="75%">'
      '<stop offset="0" stop-color="#FFD3D2"/><stop offset="0.7" stop-color="#F9A6AF"/>'
      '<stop offset="1" stop-color="#EE8D9C"/></radialGradient>')
    a('<linearGradient id="cndL" x1="0" y1="0" x2="1" y2="0">'
      '<stop offset="0" stop-color="#A9E3D4"/><stop offset="0.35" stop-color="#7FC9B7"/>'
      '<stop offset="0.75" stop-color="#66B7A4"/><stop offset="1" stop-color="#57A794"/></linearGradient>')
    a('<linearGradient id="cndC" x1="0" y1="0" x2="1" y2="0">'
      '<stop offset="0" stop-color="#F6A2B1"/><stop offset="0.35" stop-color="#EC8499"/>'
      '<stop offset="0.75" stop-color="#DC7086"/><stop offset="1" stop-color="#CB6077"/></linearGradient>')
    a('<linearGradient id="cndR" x1="0" y1="0" x2="1" y2="0">'
      '<stop offset="0" stop-color="#FBD99A"/><stop offset="0.35" stop-color="#F5C169"/>'
      '<stop offset="0.75" stop-color="#E9AE52"/><stop offset="1" stop-color="#D89C42"/></linearGradient>')
    a('<linearGradient id="flame" x1="0" y1="0" x2="0" y2="1">'
      '<stop offset="0" stop-color="#FF8A3F"/><stop offset="0.5" stop-color="#FFAF4A"/>'
      '<stop offset="1" stop-color="#FFD47A"/></linearGradient>')
    a('<linearGradient id="flameIn" x1="0" y1="0" x2="0" y2="1">'
      '<stop offset="0" stop-color="#FFE79B"/><stop offset="1" stop-color="#FFF8DE"/></linearGradient>')
    a('<radialGradient id="glow" cx="50%" cy="50%" r="50%">'
      '<stop offset="0" stop-color="#FFC46B" stop-opacity="0.40"/>'
      '<stop offset="0.45" stop-color="#FFB757" stop-opacity="0.15"/>'
      '<stop offset="1" stop-color="#FFB757" stop-opacity="0"/></radialGradient>')
    a('<radialGradient id="pool" cx="50%" cy="50%" r="50%">'
      '<stop offset="0" stop-color="#FFD88A" stop-opacity="0.34"/>'
      '<stop offset="1" stop-color="#FFD88A" stop-opacity="0"/></radialGradient>')
    a(f'<clipPath id="clipB"><path d="{tier_body(**B)}"/></clipPath>')
    a(f'<clipPath id="clipT"><path d="{tier_body(**T)}"/></clipPath>')
    a('</defs>')
    return "\n".join(d)


# --------------------------------------------------------------------------
# scene pieces
# --------------------------------------------------------------------------
def confetti():
    rng = random.Random(20261018)
    regions = [
        (52, 64, 420, 300, 11),
        (660, 64, 1028, 300, 11),
        (38, 330, 158, 1140, 7),
        (922, 330, 1042, 1140, 7),
        (54, 1186, 440, 1292, 4),
        (640, 1186, 1026, 1292, 4),
    ]
    out = ['<g id="confetti">']
    for x0, y0, x1, y1, count in regions:
        for _ in range(count):
            x = rng.uniform(x0, x1)
            y = rng.uniform(y0, y1)
            col = rng.choice(CONFETTI_COLORS)
            op = round(rng.uniform(0.45, 0.85), 2)
            rot = rng.uniform(0, 360)
            kind = rng.choices(["dot", "bar", "sq", "star"], [4, 4, 2, 1])[0]
            if kind == "dot":
                r = rng.uniform(6, 11)
                out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{col}" opacity="{op}"/>')
            elif kind == "bar":
                w = rng.uniform(18, 28)
                out.append(f'<g transform="translate({f(x)},{f(y)}) rotate({f(rot)})">'
                           f'<rect x="{f(-w/2)}" y="-3.6" width="{f(w)}" height="7.2" rx="3.6" '
                           f'fill="{col}" opacity="{op}"/></g>')
            elif kind == "sq":
                s = rng.uniform(10, 16)
                out.append(f'<g transform="translate({f(x)},{f(y)}) rotate({f(rot)})">'
                           f'<rect x="{f(-s/2)}" y="{f(-s/2)}" width="{f(s)}" height="{f(s)}" rx="2.8" '
                           f'fill="{col}" opacity="{op}"/></g>')
            else:
                out.append(sparkle(x, y, rng.uniform(11, 17), col, op))
    out.append('</g>')
    return "\n".join(out)


def stand():
    o = ['<g id="stand">']
    # stem
    o.append('<path d="M 544,800 C 542,850 536,900 500,950 L 700,950 '
             'C 664,900 658,850 656,800 Z" fill="url(#stem)"/>')
    o.append('<path d="M 558,812 C 556,858 550,900 522,942" fill="none" stroke="#FFFFFF" '
             'stroke-opacity="0.6" stroke-width="7" stroke-linecap="round"/>')
    # foot
    o.append(ellipse(600, 968, 124, 28, PLATE_EDGE))
    o.append(ellipse(600, FOOT_CY, FOOT_RX, FOOT_RY, "url(#footTop)"))
    o.append('<path d="M 490,948 A 122,28 0 0 1 566,930" fill="none" stroke="#FFFFFF" '
             'stroke-opacity="0.75" stroke-width="4" stroke-linecap="round"/>')
    # plate
    o.append(ellipse(600, PLATE_CY + PLATE_RIM, PLATE_RX, PLATE_RY, PLATE_EDGE))
    o.append(ellipse(600, PLATE_CY, PLATE_RX, PLATE_RY, "url(#plateTop)"))
    o.append('<ellipse cx="600" cy="744" rx="292" ry="72" fill="none" stroke="#EFE1CD" '
             'stroke-width="2.4" opacity="0.7"/>')
    o.append('<path d="M 310,719.8 A 312,80 0 0 1 430,680.9" fill="none" stroke="#FFFFFF" '
             'stroke-opacity="0.8" stroke-width="6" stroke-linecap="round"/>')
    o.append('</g>')
    return "\n".join(o)


def tier_shading(clip_id, side, bottom, rx, top, bot, ry):
    x0, x1 = 600 - rx, 600 + rx
    y0, y1 = top - ry, bot + ry
    return (f'<g clip-path="url(#{clip_id})">'
            f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1-x0)}" height="{f(y1-y0)}" fill="url(#{side})"/>'
            f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1-x0)}" height="{f(y1-y0)}" fill="url(#{bottom})"/>'
            f'</g>')


def bead_border(cx, base_cy, rx, ry, r, fill, x0, x1, spacing, shadow_op=0.14, seed=0):
    rng = random.Random(seed)
    o = []
    n = max(2, int((x1 - x0) / spacing))
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        y = rim_y(x, cx, base_cy, rx, ry)
        rr = r * rng.uniform(0.94, 1.05)
        o.append(f'<circle cx="{f(x)}" cy="{f(y + rr * 0.35)}" r="{f(rr)}" fill="#8E4A5E" '
                 f'opacity="{shadow_op}"/>')
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        y = rim_y(x, cx, base_cy, rx, ry)
        rr = r * rng.uniform(0.94, 1.05)
        o.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr)}" fill="url(#{fill})"/>')
    return o


def sprinkles_on_band(edge_y, cx, cy, rx, ry, xs, rng):
    out = []
    for x in xs:
        rim = rim_y(x, cx, cy, rx, ry)
        edge = edge_y(x)
        span = edge - rim
        if span < 30:
            continue
        y = rim + span * rng.uniform(0.30, 0.58)
        ang = rng.uniform(-55, 55)
        col = rng.choice(SPRINKLE_COLORS)
        out.append(f'<g transform="translate({f(x)},{f(y)}) rotate({f(ang)})">'
                   f'<rect x="-8" y="-3" width="16" height="6" rx="3" fill="{col}"/></g>')
    return out


def bottom_tier():
    b_band, b_lower, b_edge = B_DRIP
    o = ['<g id="bottom-tier">']
    o.append('<ellipse cx="600" cy="792" rx="240" ry="46" fill="url(#shadow)" opacity="0.55"/>')
    o.append(f'<path d="{tier_body(**B)}" fill="url(#pinkBody)"/>')
    o.append(tier_shading("clipB", "pinkShade", "pinkBottom", B["rx"], B["top"], B["bot"], B["ry"]))
    # icing
    o.append(f'<path d="{b_band}" fill="url(#icingCream)"/>')
    o.append(f'<path d="{b_lower}" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" '
             f'stroke-width="3" stroke-linecap="round"/>')
    o.append(ellipse(B["cx"], B["top"], B["rx"], B["ry"], "url(#creamTop)"))
    o.append(f'<ellipse cx="508" cy="{B["top"]-16}" rx="86" ry="21" fill="url(#sheen)"/>')
    rng = random.Random(41)
    o += sprinkles_on_band(b_edge, B["cx"], B["top"], B["rx"], B["ry"],
                           [398, 428, 456, 492, 524, 556, 588, 620, 652, 684, 716, 748, 780], rng)
    # piped bead border at the base
    o.append('<g id="base-beads">')
    o += bead_border(600, 730, 230, 62, 9.6, "beadCream", 386, 814, 17.5, seed=3)
    o.append('</g>')
    o.append('</g>')
    return "\n".join(o)


def top_tier():
    t_band, t_lower, t_edge = T_DRIP
    o = ['<g id="top-tier">']
    o.append('<ellipse cx="600" cy="578" rx="168" ry="36" fill="url(#shadow)" opacity="0.38"/>')
    o.append(f'<path d="{tier_body(**T)}" fill="url(#creamBody)"/>')
    o.append(tier_shading("clipT", "creamShade", "creamBottom", T["rx"], T["top"], T["bot"], T["ry"]))
    o.append(f'<path d="{t_band}" fill="url(#icingPink)"/>')
    o.append(f'<path d="{t_lower}" fill="none" stroke="#FFDDE0" stroke-opacity="0.6" '
             f'stroke-width="2.6" stroke-linecap="round"/>')
    o.append(ellipse(T["cx"], T["top"], T["rx"], T["ry"], "url(#pinkTop)"))
    o.append(f'<ellipse cx="600" cy="{T["top"]+16}" rx="132" ry="30" fill="url(#pool)"/>')
    o.append(f'<ellipse cx="526" cy="{T["top"]-14}" rx="62" ry="16" fill="url(#sheen)"/>')
    rng = random.Random(77)
    o += sprinkles_on_band(t_edge, T["cx"], T["top"], T["rx"], T["ry"],
                           [455, 482, 510, 540, 570, 600, 630, 660, 690, 718], rng)
    # sprinkles on the pink top
    rng2 = random.Random(5)
    placed, tries = 0, 0
    while placed < 7 and tries < 400:
        tries += 1
        ang = rng2.uniform(0.18, math.pi - 0.18)
        rad = rng2.uniform(0.58, 0.88)
        x = 600 + T["rx"] * rad * math.cos(ang)
        y = T["top"] + T["ry"] * rad * math.sin(ang) + 3
        if any(abs(x - c["x"]) < 28 for c in CANDLES):
            continue
        o.append(f'<g transform="translate({f(x)},{f(y)}) rotate({f(rng2.uniform(-70,70))})">'
                 f'<rect x="-8" y="-3" width="16" height="6" rx="3" fill="{rng2.choice(SPRINKLE_COLORS)}"/></g>')
        placed += 1
    o.append('</g>')
    return "\n".join(o)


def top_base_beads():
    o = ['<g id="top-base-beads">']
    o += bead_border(600, 540, 158, 42, 8.0, "beadPink", 458, 742, 16, shadow_op=0.10, seed=9)
    o.append('</g>')
    return "\n".join(o)


def candle(c):
    x, base, h, grad = c["x"], c["base"], c["h"], c["grad"]
    w = 24.0
    top = base - h
    o = []
    o.append(f'<ellipse cx="{f(x)}" cy="{f(base + 1)}" rx="22" ry="9" fill="url(#pinkShadow)"/>')
    o.append(f'<path d="M {f(x-w/2)},{f(base)} L {f(x-w/2)},{f(top+10)} '
             f'Q {f(x-w/2)},{f(top)} {f(x-w/2+10)},{f(top)} L {f(x+w/2-10)},{f(top)} '
             f'Q {f(x+w/2)},{f(top)} {f(x+w/2)},{f(top+10)} L {f(x+w/2)},{f(base)} Z" '
             f'fill="url(#{grad})"/>')
    o.append(f'<rect x="{f(x-w/2+4.5)}" y="{f(top+8)}" width="4" height="{f(h-14)}" rx="2" '
             f'fill="#FFFFFF" opacity="0.30"/>')
    # wax cap + drips
    o.append(f'<path d="M {f(x-11.5)},{f(top+12)} L {f(x-11.5)},{f(top+6)} Q {f(x-11.5)},{f(top+1)} '
             f'{f(x-6)},{f(top+1)} L {f(x+6)},{f(top+1)} Q {f(x+11.5)},{f(top+1)} {f(x+11.5)},{f(top+6)} '
             f'L {f(x+11.5)},{f(top+12)} C {f(x+8)},{f(top+14)} {f(x+4)},{f(top+9)} {f(x+1)},{f(top+12)} '
             f'C {f(x-2)},{f(top+15)} {f(x-6)},{f(top+9)} {f(x-9)},{f(top+12)} Z" '
             f'fill="{c["wax"]}" opacity="0.85"/>')
    o.append(f'<path d="M {f(x-8)},{f(top+11)} C {f(x-11)},{f(top+20)} {f(x-3)},{f(top+21)} '
             f'{f(x-4)},{f(top+13)} Z" fill="{c["wax"]}" opacity="0.9"/>')
    o.append(f'<path d="M {f(x+3)},{f(top+11)} C {f(x+2)},{f(top+17)} {f(x+8)},{f(top+17)} '
             f'{f(x+7)},{f(top+12)} Z" fill="{c["wax"]}" opacity="0.9"/>')
    # wick
    o.append(f'<path d="M {f(x)},{f(top+2)} C {f(x+1.5)},{f(top-5)} {f(x-2)},{f(top-9)} '
             f'{f(x)},{f(top-11)}" fill="none" stroke="#5C4636" stroke-width="3" stroke-linecap="round"/>')
    return "\n".join(o)


def flame_shape(x, base, h, w):
    tip = base - h
    return (f"M {P(x, tip)} "
            f"C {P(x + w*0.72, base - h*0.60)} {P(x + w, base - h*0.24)} {P(x + w*0.62, base - h*0.06)} "
            f"C {P(x + w*0.30, base + h*0.035)} {P(x - w*0.30, base + h*0.035)} {P(x - w*0.62, base - h*0.06)} "
            f"C {P(x - w, base - h*0.24)} {P(x - w*0.72, base - h*0.60)} {P(x, tip)} Z")


def flame(c):
    x = c["x"]
    top = c["base"] - c["h"]
    base = top - 9
    h = c["h"] * 0.47
    w = 15.0
    return (f'<circle cx="{f(x)}" cy="{f(base - h*0.55)}" r="{f(h*1.75)}" fill="url(#glow)"/>'
            f'<path d="{flame_shape(x, base, h, w)}" fill="url(#flame)"/>'
            f'<path d="{flame_shape(x, base - 1, h*0.60, w*0.52)}" fill="url(#flameIn)"/>'
            f'<circle cx="{f(x)}" cy="{f(base - h*0.20)}" r="2.2" fill="#FFFFFF" opacity="0.5"/>')


def candles():
    o = ['<g id="candles">']
    for c in CANDLES:
        o.append(candle(c))
    for c in CANDLES:
        o.append(flame(c))
    o.append('</g>')
    return "\n".join(o)


# --------------------------------------------------------------------------
# assemble
# --------------------------------------------------------------------------
def build():
    svg = []
    svg.append('<?xml version="1.0" encoding="UTF-8"?>')
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {VH}" '
               f'width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" '
               f'aria-labelledby="cakeTitle cakeDesc">')
    svg.append('<title id="cakeTitle">\u751f\u65e5\u86cb\u7cd5\u63d2\u753b / Birthday cake</title>')
    svg.append('<desc id="cakeDesc">\u4e24\u5c42\u5976\u6cb9\u86cb\u7cd5\uff0c\u4e0a\u5c42\u6d82\u6df1\u7c89\u8272'
               '\u6dcb\u9762\uff0c\u63d2\u7740\u4e09\u6839\u8721\u709b\uff0c\u653e\u5728\u767d\u8272\u9ad8\u811a'
               '\u6258\u76d8\u4e0a\uff0c\u5468\u56f4\u98d8\u843d\u5f69\u5e26\u3002</desc>')
    svg.append(defs())
    svg.append(f'<rect width="{VW}" height="{VH}" fill="url(#bg)"/>')
    svg.append(f'<ellipse cx="{VW/2}" cy="690" rx="560" ry="660" fill="url(#halo)"/>')
    svg.append(confetti())
    svg.append(f'<g id="artwork" transform="translate({f(TX)},{f(TY)}) scale({SCALE})">')
    svg.append('<ellipse cx="600" cy="1004" rx="352" ry="38" fill="url(#shadow)"/>')
    svg.append(stand())
    svg.append(bottom_tier())
    svg.append(top_tier())
    svg.append(top_base_beads())
    svg.append(candles())
    svg.append('</g>')
    svg.append('</svg>')
    return "\n".join(svg)


if __name__ == "__main__":
    out = build()
    target = pathlib.Path(__file__).resolve().parent.parent / "src" / "fallback-cake.svg"
    with open(target, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(out + "\n")
    print(f"wrote {target}  ({len(out)} bytes)")
