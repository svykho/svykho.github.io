#!/usr/bin/env python3
"""Brings the Black Hole Lab simulators from the group's website into this one.

    python3 tools/sync-lab.py [path/to/uib-perturbation-theory.github.io]

Numerics, workers and data are copied byte for byte. Only the files that draw
something are restyled, through the exact replacements listed below. If the
group's code changes so that one of them no longer applies, the script stops
instead of producing a half-styled page. It never writes to the group's repo.
"""
import hashlib
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GROUP = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT.parent / "uib-perturbation-theory.github.io"
GROUP_URL = "https://uib-perturbation-theory.github.io"
OUT = ROOT / "assets" / "lab"

SIMS = {
    "regge-wheeler": ("rw", "rw-sim.js"),
    "sasaki-nakamura": ("sn", "sn-sim.js"),
    "wormhole": ("wh", "wh-sim.js"),
}
RESTYLED = {"rw-sim.js", "rw-panels.js", "sn-sim.js", "sn-panels.js", "sn-volume.js", "wh-sim.js", "wh-panels.js"}

# ---------------------------------------------------------------- palette

INK = "#edeff3"
BG = "#07090e"
ACCENT = "#8cbcff"
POS = "#ff9a56"
NEG = "#6ea8f7"
PULSE = "#ffb27a"
MUTED = "#8b93a2"

COLOURS = [
    ('"#0b1220"', f'"{INK}"'),
    ("0x0b1220", "0xedeff3"),
    ("rgba(11,18,32,", "rgba(237,239,243,"),
    ('"#f2762e"', f'"{POS}"'),
    ('"#d8611c"', f'"{PULSE}"'),
    ("0xd8611c", "0xffb27a"),
    ("rgba(216,97,28,", "rgba(255,178,122,"),
    ('"#3e7cb1"', f'"{NEG}"'),
    ('"#2a78d6"', f'"{ACCENT}"'),
    ("rgba(42,120,214,", "rgba(140,188,255,"),
    ('"#efebe3"', '"#10151f"'),  # the sheet at rest
    ('"#e4e8ee"', '"#0c111a"'),  # the other universe
    ('"#7a8492"', f'"{MUTED}"'),
    ('"#8a93a1"', f'"{MUTED}"'),
    ('"#a3abb8"', '"#6f7786"'),
    ('"#fff"', f'"{BG}"'),  # halo of the markers on the plots
    ('"rgba(255,255,255,0.9)"', '"rgba(7,9,14,0.9)"'),
    ('"rgba(255,255,255,0.85)"', '"rgba(7,9,14,0.85)"'),
    ("0xb8b0a2", "0x2b3444"),  # ground light
    ("0xffeedd", "0xdfe9ff"),  # fill light
    ("0xe9e4da", "0xedeff3"),
    ('"#ff8a3d"', f'"{POS}"'),
    ('"#4f9be0"', f'"{NEG}"'),
    ('"IBM Plex Mono"', '"DM Mono"'),
    # sequential ramp: on a dark page, large values are the bright ones
    ('["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]',
     '["#0a1220", "#0f2038", "#163255", "#1f4878", "#2f659f", "#4f8aca", "#8cbcff"]'),
    ("light (small) to dark (large)", "dark (small) to bright (large)"),
]

# Rings and meridians on the sheet, in the accent colour, like the home page.
GRID = """float ang = atan(vXZ.y, vXZ.x) * 5.72958;
        float angW = min(fwidth(ang), fwidth(fract(ang + 0.5)));
        float angLine = 1.0 - smoothstep(0.0, angW * 1.2, abs(fract(ang + 0.5) - 0.5));
        float lit = max(gridLine, angLine * @FADE@);"""

# The wave glows instead of looking like lit plastic; the grid is drawn in light.
GLOW = """diffuseColor.rgb *= sheetCol * 0.42;
        totalEmissiveRadiance += sheetCol * 0.2 * pow(abs(vv), 0.7) + vec3(0.04, 0.085, 0.19) * lit;"""

LIGHTS_RW_SN = [
    ("HemisphereLight(0xffffff, 0xb8b0a2, 1.25)", "HemisphereLight(0xffffff, 0xb8b0a2, 0.8)", 1),
    ("DirectionalLight(0xffffff, 1.4)", "DirectionalLight(0xffffff, 0.8)", 1),
    ("DirectionalLight(0xffffff, 2.1)", "DirectionalLight(0xffffff, 1.3)", 1),
    ("DirectionalLight(0xffeedd, 0.55)", "DirectionalLight(0xffeedd, 0.35)", 1),
]
LIGHTS_WH = [
    ("HemisphereLight(0xffffff, 0xb8b0a2, 1.2)", "HemisphereLight(0xffffff, 0xb8b0a2, 0.8)", 1),
    ("DirectionalLight(0xffffff, 1.3)", "DirectionalLight(0xffffff, 0.8)", 1),
    ("DirectionalLight(0xffffff, 2.0)", "DirectionalLight(0xffffff, 1.3)", 1),
    ("DirectionalLight(0xffeedd, 0.55)", "DirectionalLight(0xffeedd, 0.35)", 1),
]

SHEET_RW_SN = [
    ("varying float vRing;", "varying float vRing;\n        varying vec2 vXZ;", 2),
    ("vRing = aRing;", "vRing = aRing;\n        vXZ = position.xz;", 1),
    ("sheetCol *= 1.0 - 0.14 * gridLine;", GRID.replace("@FADE@", "smoothstep(11.0, 36.0, length(vXZ))"), 1),
    ("diffuseColor.rgb *= sheetCol;", GLOW, 1),
] + LIGHTS_RW_SN
PATCHES = {
    "rw-sim.js": SHEET_RW_SN,
    "sn-sim.js": SHEET_RW_SN + [
        ('new URL("./incl/index.json", import.meta.url)', f'new URL("{GROUP_URL}/js/sn/incl/index.json")', 1),
    ],
    "wh-sim.js": [
        ("varying float vArc;", "varying float vArc;\n        varying vec2 vXZ;", 2),
        ("vArc = aArc;", "vArc = aArc;\n        vXZ = position.xz;", 1),
        ("sheetCol *= 1.0 - 0.12 * gridLine;", GRID.replace("@FADE@", "1.0"), 1),
        ("diffuseColor.rgb *= sheetCol;", GLOW, 1),
    ] + LIGHTS_WH,
}
TEXT = {"regge-wheeler": [("The dark curve is", "The white curve is")]}

LEFTOVERS = re.compile(r"#0b1220|0x0b1220|rgba\(11,18,32|#f2762e|#d8611c|#3e7cb1|#2a78d6|#efebe3|\"#fff\"|IBM Plex")


def fail(msg):
    sys.exit(f"sync-lab: {msg}")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def restyle(name, src):
    for old, new, count in PATCHES.get(name, []):
        if src.count(old) != count:
            fail(f"{name}: expected {count} of {old!r}, found {src.count(old)}")
        src = src.replace(old, new)
    for old, new in COLOURS:
        src = src.replace(old, new)
    hit = LEFTOVERS.search(src)
    if hit:
        fail(f"{name}: colour left unstyled: {hit.group(0)}")
    return src


def copy_code():
    tmp = OUT.with_name("lab.new")
    if tmp.exists():
        shutil.rmtree(tmp)
    same = changed = 0
    for folder in ("rw", "sn", "wh"):
        (tmp / folder).mkdir(parents=True)
        for f in sorted((GROUP / "js" / folder).iterdir()):
            if not f.is_file():
                continue  # the inclined-plunge data stays on the group's site
            target = tmp / folder / f.name
            if f.name in RESTYLED:
                target.write_text(restyle(f.name, f.read_text(encoding="utf-8")), encoding="utf-8")
                changed += 1
            else:
                shutil.copyfile(f, target)
                if digest(f) != digest(target):
                    fail(f"{f.name}: copy differs")
                same += 1
    if OUT.exists():
        shutil.rmtree(OUT)
    tmp.rename(OUT)
    return same, changed


def shell():
    about = (ROOT / "about.html").read_text(encoding="utf-8")
    top = re.search(r'<header class="top">.*?</header>', about, re.S).group(0)
    foot = re.search(r'<footer class="foot">.*?</footer>', about, re.S).group(0)
    fix = lambda s: re.sub(r'href="(index|about|research|lab|cv|gallery)\.html"', r'href="../\1.html"', s)
    top = fix(top).replace(' aria-current="page"', "")
    top = top.replace('href="../lab.html"', 'href="../lab.html" aria-current="true"')
    return top, fix(foot)


def between(s, start, end):
    a = s.find(start)
    b = s.find(end, a)
    if a < 0 or b < 0:
        fail(f"page structure changed near {start!r}")
    return s[a:b]


def float_sections(article):
    """Each explanatory section drifts as one block; the simulator itself does not."""
    open_tag = '<article class="rw-explain">'
    inner = article[len(open_tag):article.rindex("</article>")]
    refs_at = inner.find('<p class="rw-refs">')
    refs = inner[refs_at:] if refs_at >= 0 else ""
    inner = inner[:refs_at] if refs_at >= 0 else inner
    blocks = [b.strip() for b in re.split(r"(?=<h3[ >])", inner) if b.strip()]
    for b in blocks:
        if b.count("<div") != b.count("</div>"):
            fail("explanatory text has an unexpected structure")
    html = "\n".join(f'<section class="ex" data-float>\n{b}\n</section>' for b in blocks)
    if refs:
        html += f'\n<div class="ex" data-float>\n{refs.strip()}\n</div>'
    return f"{open_tag}\n{html}\n</article>"


def write_page(slug, folder, entry, top, foot):
    src = (GROUP / "lab" / f"{slug}.html").read_text(encoding="utf-8")
    for old, new in TEXT.get(slug, []):
        if old not in src:
            fail(f"{slug}: text not found: {old}")
        src = src.replace(old, new)

    title = re.search(r"<h1>(.*?)</h1>", src, re.S).group(1).strip()
    desc = re.search(r'<meta name="description" content="([^"]*)"', src).group(1)
    lede = re.search(r'<p class="lede">(.*?)</p>', src, re.S).group(1).strip()
    body = between(src, '<div class="rw-app"', '<footer class="footer">')
    body = body[:body.rindex("</section>")]
    body = body[:body.rindex("</div>")].rstrip()  # closes .rw-wrap

    art_at = body.index('<article class="rw-explain">')
    art_end = body.index("</article>", art_at) + len("</article>")
    body = body[:art_at] + float_sections(body[art_at:art_end]) + body[art_end:]

    body = body.replace('href="../lab.html"', 'href="@@LAB@@"')
    body = re.sub(r'href="\.\./([^"]+)"', lambda m: f'href="{GROUP_URL}/{m.group(1)}" rel="noopener"', body)
    body = body.replace('href="@@LAB@@"', 'href="../lab.html"')

    original = f"{GROUP_URL}/lab/{slug}.html"
    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} · Alejandro Svyatkovskyy Kholyavka</title>
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="{BG}">
  <link rel="canonical" href="{original}">
  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&family=Newsreader:ital,opsz,wght@0,6..72,300..500;1,6..72,300..400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/site.css">
  <link rel="stylesheet" href="../assets/css/lab.css">
  <script type="importmap">
    {{
      "imports": {{
        "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
      }}
    }}
  </script>
  <script src="../assets/js/site.js" defer></script>
  <script type="module" src="../assets/lab/{folder}/{entry}"></script>
  <script>
    window.MathJax = {{
      tex: {{
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
      }},
      svg: {{ fontCache: 'global' }}
    }};
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js"></script>
</head>
<body class="sim" data-sky="still">
<a class="skip" href="#main">Skip to content</a>

{top}

<main id="main">
  <div class="wrap">
    <div class="head">
      <div>
        <a class="back" href="../lab.html">← Black Hole Lab</a>
        <h1 data-float>{title}</h1>
        <p class="lede" data-float>{lede}</p>
      </div>
    </div>

    <div class="rw-wrap">
    {body}
    <p class="credit">Part of the Black Hole Lab of the <a href="{GROUP_URL}/" rel="noopener">Strong Gravity Group</a> at the UIB. <a href="{original}" rel="noopener">Original page</a>.</p>
    </div>
  </div>
</main>

{foot}
</body>
</html>
"""
    (ROOT / "lab").mkdir(exist_ok=True)
    (ROOT / "lab" / f"{slug}.html").write_text(page, encoding="utf-8")


def main():
    if not (GROUP / "lab" / "regge-wheeler.html").exists():
        fail(f"group site not found at {GROUP}")
    same, changed = copy_code()
    top, foot = shell()
    for slug, (folder, entry) in SIMS.items():
        write_page(slug, folder, entry, top, foot)
    print(f"{same} files copied byte for byte, {changed} restyled, {len(SIMS)} pages written")


if __name__ == "__main__":
    main()
