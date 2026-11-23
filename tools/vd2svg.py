#!/usr/bin/env python3
"""Convert an Android VectorDrawable (BirDS ic_ds_*.xml) to an SVG file.

    python3 tools/vd2svg.py ic_ds_angle_left_24_outline.xml -o assets/x/angle-left.svg
    python3 tools/vd2svg.py in.xml --size 20x20 --color "#9496AC"        # keep markup size, tint
    python3 tools/vd2svg.py in.xml --color "#000000@0.5"                  # tint with opacity
    python3 tools/vd2svg.py in.xml --like assets/x/old.svg               # size + colour of an existing SVG

Mapping
  <vector>   android:width/height (dp)       -> width/height (px, 1dp = 1px)
             android:viewportWidth/Height    -> viewBox
             android:alpha                   -> opacity on a wrapping <g>
             android:tint (literal colour)   -> colour override (like --color)
  <group>    translateX/Y, scaleX/Y, rotation, pivotX/Y -> transform (Android order)
  <clip-path android:pathData>               -> <clipPath>, clips the following siblings
  <path>     pathData -> d; fillColor/strokeColor -> fill/stroke (#RGB/#ARGB/#RRGGBB/#AARRGGBB,
             the alpha byte goes to *-opacity); fillAlpha/strokeAlpha -> fill-/stroke-opacity;
             strokeWidth, strokeLineCap, strokeLineJoin, strokeMiterLimit; fillType="evenOdd"
             -> fill-rule="evenodd"; <aapt:attr> gradients -> linear/radialGradient
Colours that are resources (@color/..., ?attr/...) cannot be resolved here: they take
--color (or the colour read from --like). Without either they fall back to currentColor.
--color replaces every fill/stroke colour, as an Android tint does; "#RRGGBB@a" also
replaces the path alpha with a, otherwise the drawable's own alpha is kept.
"""
import argparse
import itertools
import math
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

A = "{http://schemas.android.com/apk/res/android}"
AAPT = "{http://schemas.android.com/aapt}"


def num(v, default=None):
    if v is None:
        return default
    v = re.sub(r"(dp|dip|px|sp)$", "", str(v).strip())
    return float(v)


def fmt(x):
    s = f"{x:.4f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def parse_color(v):
    """-> (css colour or None for a resource reference, alpha 0..1)."""
    if v is None:
        return None, 1.0
    v = v.strip()
    if v.startswith(("@", "?")):
        return None, 1.0
    if not v.startswith("#"):
        return v, 1.0
    h = v[1:]
    if len(h) == 3:
        return "#" + "".join(c * 2 for c in h).upper(), 1.0
    if len(h) == 4:
        return "#" + "".join(c * 2 for c in h[1:]).upper(), int(h[0] * 2, 16) / 255
    if len(h) == 6:
        return "#" + h.upper(), 1.0
    if len(h) == 8:
        return "#" + h[2:].upper(), int(h[:2], 16) / 255
    raise ValueError(f"bad colour {v}")


class Converter:
    def __init__(self, color=None, color_alpha=None):
        self.color = color            # override / fallback colour
        self.color_alpha = color_alpha  # override alpha (None = keep the drawable's)
        self.defs = []
        self.ids = itertools.count(1)
        self.warnings = []

    # ---------- paint ----------
    def paint(self, el, kind):
        """kind = 'fill' | 'stroke' -> dict of svg attributes."""
        attrs = {}
        raw = el.get(A + ("fillColor" if kind == "fill" else "strokeColor"))
        grad = self.aapt_gradient(el, "android:" + ("fillColor" if kind == "fill" else "strokeColor"))
        alpha = num(el.get(A + ("fillAlpha" if kind == "fill" else "strokeAlpha")), 1.0)
        if grad is not None:
            attrs[kind] = f"url(#{grad})"
            if alpha != 1:
                attrs[kind + "-opacity"] = fmt(alpha)
            return attrs
        if raw is None:
            return {kind: "none"} if kind == "fill" else {}
        col, col_a = parse_color(raw)
        if col_a == 0:
            return {kind: "none"} if kind == "fill" else {}
        if self.color is not None:
            col = self.color
        elif col is None:
            col = "currentColor"
            self.warnings.append(f"{raw} has no --color: using currentColor")
        a = alpha * col_a if self.color_alpha is None else self.color_alpha
        attrs[kind] = col
        if a != 1:
            attrs[kind + "-opacity"] = fmt(a)
        return attrs

    def aapt_gradient(self, el, attr_name):
        for aa in el.findall(AAPT + "attr"):
            if aa.get("name") != attr_name:
                continue
            g = aa.find("gradient")
            if g is None:
                continue
            gid = f"g{next(self.ids)}"
            typ = g.get(A + "type", "linear")
            stops = []
            items = g.findall("item")
            if items:
                for it in items:
                    c, ca = parse_color(it.get(A + "color"))
                    stops.append((num(it.get(A + "offset"), 0), c, ca))
            else:
                for off, key in ((0, "startColor"), (0.5, "centerColor"), (1, "endColor")):
                    if g.get(A + key):
                        c, ca = parse_color(g.get(A + key))
                        stops.append((off, c, ca))
            stop_xml = "".join(
                f'<stop offset="{fmt(o)}" stop-color="{self.color or c or "currentColor"}"'
                + (f' stop-opacity="{fmt(ca)}"' if ca != 1 else "") + "/>" for o, c, ca in stops)
            if typ == "radial":
                self.defs.append(
                    f'<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" cx="{fmt(num(g.get(A + "centerX"), 0))}" '
                    f'cy="{fmt(num(g.get(A + "centerY"), 0))}" r="{fmt(num(g.get(A + "gradientRadius"), 0))}">{stop_xml}</radialGradient>')
            else:
                if typ != "linear":
                    self.warnings.append(f"{typ} gradient drawn as linear")
                self.defs.append(
                    f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{fmt(num(g.get(A + "startX"), 0))}" '
                    f'y1="{fmt(num(g.get(A + "startY"), 0))}" x2="{fmt(num(g.get(A + "endX"), 0))}" '
                    f'y2="{fmt(num(g.get(A + "endY"), 0))}">{stop_xml}</linearGradient>')
            return gid
        return None

    # ---------- nodes ----------
    def path(self, el, ind):
        d = el.get(A + "pathData")
        if not d:
            return ""
        attrs = {"d": d.strip()}
        attrs.update(self.paint(el, "fill"))
        stroke = self.paint(el, "stroke")
        sw = num(el.get(A + "strokeWidth"), 0)
        if stroke and stroke.get("stroke", "none") != "none" and sw > 0:
            attrs.update(stroke)
            attrs["stroke-width"] = fmt(sw)
            cap = el.get(A + "strokeLineCap")
            if cap and cap != "butt":
                attrs["stroke-linecap"] = cap
            join = el.get(A + "strokeLineJoin")
            if join and join != "miter":
                attrs["stroke-linejoin"] = join
            ml = el.get(A + "strokeMiterLimit")
            if ml and num(ml) != 4:
                attrs["stroke-miterlimit"] = fmt(num(ml))
        if el.get(A + "fillType", "nonZero").lower() == "evenodd":
            attrs["fill-rule"] = "evenodd"
            attrs["clip-rule"] = "evenodd"
        for t in ("trimPathStart", "trimPathEnd", "trimPathOffset"):
            if el.get(A + t) is not None:
                self.warnings.append(f"{t} ignored")
        return ind + "<path " + " ".join(f'{k}="{v}"' for k, v in attrs.items()) + "/>\n"

    def children(self, parent, ind):
        out = []
        kids = [k for k in parent if k.tag in ("path", "group", "clip-path")]
        i = 0
        while i < len(kids):
            k = kids[i]
            if k.tag == "clip-path":
                cid = f"c{next(self.ids)}"
                self.defs.append(f'<clipPath id="{cid}"><path d="{k.get(A + "pathData", "").strip()}"/></clipPath>')
                rest = ET.Element("rest")
                rest.extend(kids[i + 1:])
                out.append(f'{ind}<g clip-path="url(#{cid})">\n' + self.children(rest, ind + "  ") + f"{ind}</g>\n")
                break
            out.append(self.path(k, ind) if k.tag == "path" else self.group(k, ind))
            i += 1
        return "".join(out)

    def group(self, el, ind):
        tx, ty = num(el.get(A + "translateX"), 0), num(el.get(A + "translateY"), 0)
        sx, sy = num(el.get(A + "scaleX"), 1), num(el.get(A + "scaleY"), 1)
        rot = num(el.get(A + "rotation"), 0)
        px, py = num(el.get(A + "pivotX"), 0), num(el.get(A + "pivotY"), 0)
        # Android: p' = T(tx+px, ty+py) * R(rot) * S(sx, sy) * T(-px, -py) * p
        tf = []
        if tx + px or ty + py:
            tf.append(f"translate({fmt(tx + px)} {fmt(ty + py)})")
        if rot:
            tf.append(f"rotate({fmt(rot)})")
        if sx != 1 or sy != 1:
            tf.append(f"scale({fmt(sx)} {fmt(sy)})")
        if px or py:
            tf.append(f"translate({fmt(-px)} {fmt(-py)})")
        if not tf:  # plain grouping: flatten
            return self.children(el, ind)
        return f'{ind}<g transform="{" ".join(tf)}">\n{self.children(el, ind + "  ")}{ind}</g>\n'

    def convert(self, xml_text, size=None, comment=None):
        root = ET.fromstring(xml_text)
        if root.tag != "vector":
            raise ValueError(f"root is <{root.tag}>, expected <vector>")
        vw, vh = num(root.get(A + "viewportWidth")), num(root.get(A + "viewportHeight"))
        w, h = num(root.get(A + "width"), vw), num(root.get(A + "height"), vh)
        if size:
            w, h = size
        tint = root.get(A + "tint")
        if tint and self.color is None:
            c, ca = parse_color(tint)
            if c:
                self.color = c
                if ca != 1 and self.color_alpha is None:
                    self.color_alpha = ca
            else:
                self.warnings.append(f"android:tint={tint} is a resource: pass --color to tint")
        alpha = num(root.get(A + "alpha"), 1)
        if alpha != 1:
            body = f'  <g opacity="{fmt(alpha)}">\n' + self.children(root, "    ") + "  </g>\n"
        else:
            body = self.children(root, "  ")
        head = f'<svg width="{fmt(w)}" height="{fmt(h)}" viewBox="0 0 {fmt(vw)} {fmt(vh)}" fill="none" xmlns="http://www.w3.org/2000/svg">\n'
        if comment:
            head += f"  <!-- {comment} -->\n"
        defs = ("  <defs>" + "".join(self.defs) + "</defs>\n") if self.defs else ""
        return head + defs + body + "</svg>\n"


def read_like(svg_path):
    """Size and paint of an existing SVG: ((w, h), colour, opacity)."""
    s = pathlib.Path(svg_path).read_text(encoding="utf-8")
    tag = re.search(r"<svg\b[^>]*>", s).group(0)
    w = float(re.search(r'\swidth="([\d.]+)', tag).group(1))
    h = float(re.search(r'\sheight="([\d.]+)', tag).group(1))
    body = s[s.index(tag) + len(tag):]
    body = re.sub(r"<(mask|clipPath|defs)\b.*?</\1>", "", body, flags=re.S)
    m = re.search(r'<(?:path|circle|rect|use|ellipse)\b[^>]*\b(fill|stroke)="(#[0-9A-Fa-f]{3,8}|black|white)"[^>]*>', body)
    if not m:
        return (w, h), None, None
    el, kind = m.group(0), m.group(1)
    col = {"black": "#000000", "white": "#FFFFFF"}.get(m.group(2), m.group(2).upper())
    op = re.search(kind + r'-opacity="([\d.]+)"', el)
    g_op = re.findall(r'<g\b[^>]*\sopacity="([\d.]+)"', s)
    a = float(op.group(1)) if op else 1.0
    for g in g_op:
        a *= float(g)
    return (w, h), col, a


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("-o", "--output")
    ap.add_argument("--size", help="WxH of the root <svg> (default: android:width/height)")
    ap.add_argument("--color", help='"#RRGGBB" or "#RRGGBB@alpha": tint / resource fallback')
    ap.add_argument("--like", help="existing SVG: take its root size and its first paint colour/opacity")
    ap.add_argument("--comment", help="comment written into the SVG")
    a = ap.parse_args()

    size = color = alpha = None
    if a.like:
        size, color, alpha = read_like(a.like)
    if a.size:
        size = tuple(float(x) for x in a.size.lower().split("x"))
    if a.color:
        color, _, al = a.color.partition("@")
        alpha = float(al) if al else None
        color = color.upper()
    conv = Converter(color, alpha)
    svg = conv.convert(pathlib.Path(a.input).read_text(encoding="utf-8"), size,
                       a.comment or pathlib.Path(a.input).stem)
    for w in dict.fromkeys(conv.warnings):
        print("warning:", w, file=sys.stderr)
    if a.output:
        pathlib.Path(a.output).write_text(svg, encoding="utf-8")
    else:
        sys.stdout.write(svg)


if __name__ == "__main__":
    main()
