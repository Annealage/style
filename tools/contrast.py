#!/usr/bin/env python3
"""Check tokens.css for WCAG AA contrast.

Reads the tokens straight from tokens.css (so it can't drift), resolves them for
both schemes and every product, and checks each text token on every surface
theme.css puts it on. Translucent tokens (--hover, --press, --temper-wash) are
composited over the surface beneath them first.

    python3 tools/contrast.py            # table of the worst ratios, exit 1 on a failure
    python3 tools/contrast.py --all      # every pair

Text needs 4.5:1. The lines temper draws (tab underline, focus ring) need 3:1.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRODUCTS = [None, "loom", "trace", "mesh", "canvas", "pod"]
SCHEMES = ["light", "dark"]

# (text token, surfaces it is used on). A surface is a stack, bottom first.
# --ink-3 is absent from washed and pressed surfaces on purpose: theme.css
# redefines it as --ink-2 there. Anything on the well that takes a hover is
# --ink-2 or --ink, never --ink-3.
PLAIN = [["ground"], ["well"], ["field"], ["ground", "hover"], ["field", "hover"]]
ON_WELL = [["well", "hover"]]
WASHED = [["ground", "temper-wash"], ["ground", "press"], ["ground", "temper-wash", "hover"]]
TEXT = [
    ("ink", PLAIN + ON_WELL + WASHED),
    ("ink-2", PLAIN + ON_WELL + WASHED),
    ("ink-3", PLAIN),
    ("temper-text", [["ground"], ["field"], ["ground", "hover"], ["ground", "temper-wash"]]),
    ("quench", [["ground"], ["field"], ["well"], ["ground", "hover"], ["ground", "temper-wash"]]),
    ("danger", [["ground"], ["field"], ["well"], ["ground", "hover"], ["ground", "temper-wash"]]),
    ("warn", [["ground"], ["field"], ["well"], ["ground", "hover"], ["ground", "temper-wash"]]),
    ("on-ember", [["ember"]]),
    ("on-temper", [["temper"]]),
    ("on-callout", [["callout"]]),
    ("on-pin", [["pin"]]),
    ("ground", [["ink"]]),            # a primary button
    ("paper-ink", [["paper"]]),       # a marker's number on an outlined pin
    # Source code (.src, .tok-*): syntax colour is data styling inside a mono block.
    ("syn-keyword", PLAIN + ON_WELL + WASHED),
    ("syn-def", PLAIN + ON_WELL + WASHED),
    ("syn-meta", PLAIN + ON_WELL + WASHED),
    ("syn-comment", PLAIN),
    ("syn-string", PLAIN + ON_WELL + [["ground", "temper-wash"]]),
    ("syn-number", PLAIN + ON_WELL + [["ground", "temper-wash"]]),
    ("syn-invalid", [["ground"], ["field"], ["well"], ["ground", "hover"], ["ground", "temper-wash"]]),
]
LINES = [  # 3:1
    ("temper-text", [["ground"], ["field"], ["well"]]),
    ("focus", [["ground"], ["field"], ["well"]]),
    # Scene axes, drawn on the well.
    ("mv-axis-x", [["well"]]),
    ("mv-axis-y", [["well"]]),
    ("mv-axis-z", [["well"]]),
    # The sketch stroke is one value in both schemes and is baked into an image,
    # so it carries a casing: a surface only needs one of the two at 3:1, and the
    # stroke must stand out from its own casing.
    ("sketch", [["sketch-halo"]]),
    (("sketch", "sketch-halo"), [["well"]] + [[f"mv-part-{n}"] for n in range(1, 9)]),
]


def parse(css):
    """{selector-product-or-None: {token: raw value}}"""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    blocks = {}
    for sel, body in re.findall(r"(:root[^{]*)\{([^}]*)\}", css):
        m = re.search(r"data-product=(\w+)", sel)
        if "data-theme" in sel:
            continue
        key = m.group(1) if m else None
        for name, value in re.findall(r"--([\w-]+)\s*:\s*([^;]+);", body):
            blocks.setdefault(key, {})[name] = " ".join(value.split())
    return blocks


def split_top(s):
    """Split 'a, b' at the top-level comma."""
    depth = 0
    for i, ch in enumerate(s):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            return s[:i].strip(), s[i + 1:].strip()
    raise ValueError(s)


def resolve(tokens, name, scheme, seen=()):
    """-> (r, g, b, a) with channels 0-255 and a 0-1."""
    if name in seen:
        raise ValueError("cycle at --" + name)
    return colour(tokens, tokens[name], scheme, seen + (name,))


def colour(tokens, value, scheme, seen):
    value = value.strip()
    if value.startswith("light-dark("):
        light, dark = split_top(value[len("light-dark("):-1])
        return colour(tokens, light if scheme == "light" else dark, scheme, seen)
    if value.startswith("var("):
        return resolve(tokens, value[4:-1].strip().lstrip("-"), scheme, seen)
    if value.startswith("#"):
        h = value[1:]
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (1.0,)
    m = re.fullmatch(r"rgba?\(([^)]+)\)", value)
    if m:
        parts = [float(p) for p in m.group(1).replace("/", ",").split(",")]
        return (parts[0], parts[1], parts[2], parts[3] if len(parts) > 3 else 1.0)
    raise ValueError("can't read colour: " + value)


def over(top, bottom):
    a = top[3]
    return tuple(top[i] * a + bottom[i] * (1 - a) for i in range(3)) + (1.0,)


def lum(c):
    def lin(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])


def ratio(a, b):
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def main():
    blocks = parse((ROOT / "tokens.css").read_text())
    show_all = "--all" in sys.argv
    rows, failures = [], []
    for product in PRODUCTS:
        tokens = dict(blocks[None])
        tokens.update(blocks.get(product, {}))
        for scheme in SCHEMES:
            for need, table in ((4.5, TEXT), (3.0, LINES)):
                for text, surfaces in table:
                    for stack in surfaces:
                        base = resolve(tokens, stack[0], scheme)
                        for layer in stack[1:]:
                            base = over(resolve(tokens, layer, scheme), base)
                        # A tuple is a stroke with a casing: the better of the two counts.
                        names = text if isinstance(text, tuple) else (text,)
                        r = max(ratio(over(resolve(tokens, n, scheme), base), base) for n in names)
                        row = (r, need, product or "platform", scheme, "/".join(names), " + ".join(stack))
                        rows.append(row)
                        if r < need:
                            failures.append(row)
    rows.sort()
    shown = rows if show_all else rows[:16]
    print(f"{len(rows)} pairs checked, {len(failures)} below their minimum.\n")
    print(f"{'ratio':>6}  {'min':>4}  {'product':9} {'scheme':6} {'text':12} on")
    for r, need, product, scheme, text, surface in shown:
        flag = "  FAIL" if r < need else ""
        print(f"{r:6.2f}  {need:4.1f}  {product:9} {scheme:6} --{text:10} {surface}{flag}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
