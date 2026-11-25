#!/usr/bin/env python3
"""Build the course on black-hole perturbation theory inside the Black Hole Lab.

Lesson texts live in tools/course/<slug>.html as HTML fragments; this script
wraps them in the site's header, footer and lesson navigation and writes
lab/course/index.html plus one page per written lesson. The header and footer
are taken from about.html, so the course always matches the rest of the site.

    python3 tools/build-course.py
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "course"
OUT = ROOT / "lab" / "course"
SITE = "https://svykho.github.io"
BG = "#07090e"

PARTS = [
    ("I", "Foundations"),
    ("II", "Ringing black holes"),
    ("III", "Beyond"),
]

# slug, title, one-line description, part
LESSONS = [
    ("why-perturb", "Why perturb a black hole", "What a ringdown is, why small deformations are enough to describe it, and how the course is organised.", "I"),
    ("leaky-oscillators", "Leaky oscillators", "Ringing that fades: complex frequencies, open systems and a bump you can solve exactly.", "I"),
    ("schwarzschild", "Just enough Schwarzschild", "The metric, the horizon, the light ring and the tortoise coordinate.", "I"),
    ("scalar-field", "A scalar field first", "Separate a wave equation on a black hole and meet the effective potential.", "I"),
    ("gravitational-perturbations", "Gravitational perturbations", "Polar and axial deformations, gauge freedom and the Regge–Wheeler and Zerilli equations.", "II"),
    ("scattering", "Scattering", "Reflection and transmission by the potential barrier, and what greybody factors measure.", "II"),
    ("quasinormal-modes", "Quasinormal modes", "The black hole's own frequencies: what they are, how to compute them and how to hear them.", "II"),
    ("excitation", "What a black hole rings with", "The Green's function, excitation factors and which modes a given perturbation excites.", "II"),
    ("tails", "Late-time tails", "Why the ringing gives way to a slow power-law decay, and why it is often so weak.", "II"),
    ("kerr", "Spinning black holes", "Kerr, the Teukolsky and Sasaki–Nakamura equations, mode labels and superradiance.", "III"),
    ("sources", "Sources and real ringdowns", "Falling particles, fitting real signals and choosing when the ringdown starts.", "III"),
    ("frontiers", "Frontiers", "Nonlinear modes, echoes, exotic compact objects and tests of gravity.", "III"),
]

LEDES = {
    "why-perturb": "A black hole that has just formed rings like a struck bell. Why that ringing can be described by small deformations, and what this course will build.",
    "leaky-oscillators": "Before any black hole: what it means for something to ring and fade, and why the natural language for it is a complex frequency.",
    "schwarzschild": "The few facts about the simplest black hole that the rest of the course needs: the horizon, the light ring and a coordinate that sends the horizon to minus infinity.",
    "scalar-field": "Separate a wave equation on a black hole into multipoles, and each one becomes a wave on a line meeting a single potential barrier.",
    "gravitational-perturbations": "Shake the geometry of a black hole a little, and Einstein's equations reduce to one wave equation for each multipole.",
    "scattering": "Send a wave of one frequency at the barrier: how much comes back, how much falls in, and what that says about Hawking radiation and the area a black hole presents to waves.",
    "quasinormal-modes": "A black hole rings at a ladder of complex frequencies set only by its mass. What they are, how to compute them, and how to hear them.",
    "excitation": "The notes are fixed by the black hole, but how loudly each one sounds depends on how it was struck. The Green's function splits the two.",
    "tails": "After the ringing, a slow decay that never oscillates. Where it comes from, the power law it follows, and why it is so faint after a merger.",
    "kerr": "Real black holes spin. Spin shrinks the horizon, splits the spectrum by sense of rotation and lets waves steal energy from the hole.",
    "sources": "Where real perturbations come from, what a falling body radiates, and how to measure the ringing of a real signal without fooling yourself.",
    "frontiers": "Nonlinear modes, the fragile spectrum, echoes from objects without horizons and tests of gravity: where black-hole perturbation theory is heading.",
}

FONTS = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&family=Newsreader:ital,opsz,wght@0,6..72,300..500;1,6..72,300..400&display=swap"

MATHJAX = """  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
      },
      svg: { fontCache: 'global' }
    };
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js"></script>"""


def fail(msg):
    sys.exit(f"build-course: {msg}")


def shell():
    about = (ROOT / "about.html").read_text(encoding="utf-8")
    top = re.search(r'<header class="top">.*?</header>', about, re.S).group(0)
    foot = re.search(r'<footer class="foot">.*?</footer>', about, re.S).group(0)
    fix = lambda s: re.sub(r'href="(index|about|research|lab|cv|gallery)\.html"', r'href="../../\1.html"', s)
    top = fix(top).replace(' aria-current="page"', "")
    top = top.replace('href="../../lab.html"', 'href="../../lab.html" aria-current="true"')
    return top, fix(foot)


def written(slug):
    return (SRC / f"{slug}.html").exists()


def num(i):
    return f"{i:02d}"


def page(title, desc, canonical, body, math=False):
    top, foot = shell()
    t = html.escape(title, quote=True)
    d = html.escape(desc, quote=True)
    extra = "\n" + MATHJAX if math else ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{t}</title>
  <meta name="description" content="{d}">
  <meta name="theme-color" content="{BG}">
  <meta property="og:title" content="{t}">
  <meta property="og:description" content="{d}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="{SITE}/images/wormhole.jpg">
  <link rel="canonical" href="{canonical}">
  <link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="{FONTS}" rel="stylesheet">
  <link rel="stylesheet" href="../../assets/css/site.css">
  <link rel="stylesheet" href="../../assets/css/lab.css">
  <link rel="stylesheet" href="../../assets/css/course.css">
  <script src="../../assets/js/site.js" defer></script>
  <script src="../../assets/js/course.js" defer></script>{extra}
</head>
<body class="course" data-sky="still">
<a class="skip" href="#main">Skip to content</a>

{top}

<main id="main">
  <div class="wrap">
{body}
  </div>
</main>

{foot}
</body>
</html>
"""


def index_page():
    groups = []
    for key, name in PARTS:
        items = []
        for i, (slug, title, line, part) in enumerate(LESSONS):
            if part != key:
                continue
            inner = f'<span class="n">{num(i)}</span><h3>{title}</h3>'
            if written(slug):
                items.append(f'<li><a href="{slug}.html">{inner}<span class="tag">Read →</span><p>{line}</p></a></li>')
            else:
                items.append(f'<li><div class="soon">{inner}<span class="tag">in preparation</span><p>{line}</p></div></li>')
        groups.append(f"""    <section class="row" data-float>
      <h2 class="label">Part {key} · {name}</h2>
      <div class="body">
        <ol class="lessons">
          {(chr(10) + "          ").join(items)}
        </ol>
      </div>
    </section>""")

    first = next(slug for slug, *_ in LESSONS if written(slug))
    body = f"""    <div class="head">
      <div>
        <a class="back" href="../../lab.html">← Black Hole Lab</a>
        <span class="label" data-float>Course</span>
        <h1 data-float>Black-hole perturbation theory</h1>
        <p class="lede" data-float>From a leaky oscillator to the ringing of real black holes, in twelve short lessons.</p>
      </div>
    </div>

    <section class="row course-intro" data-float>
      <h2 class="label">How it works</h2>
      <div class="body t">
        <p>When a black hole is disturbed, by a merger or by anything that falls in, it rings like a bell and settles down. Black-hole perturbation theory is the art of describing that ringing with small deformations of the geometry, and it is how we read the end of every gravitational-wave signal.</p>
        <p>Each lesson tells the story first, with a figure you can play with, and keeps the full calculation folded away until you want it. Every number on these pages was computed for the course, most of them live in your browser. Start with <a href="{first}.html">{dict((s, t) for s, t, *_ in LESSONS)[first]}</a>, or jump to any lesson below.</p>
        <dl class="facts">
          <div><dt>You need</dt><dd>Waves, complex numbers and some calculus. General relativity helps but is not required.</dd></div>
          <div><dt>Units</dt><dd><i>G</i> = <i>c</i> = 1, with lengths and times measured in units of the black-hole mass <i>M</i>.</dd></div>
          <div><dt>Each lesson</dt><dd>A story, live figures, the full calculation, one exercise and further reading.</dd></div>
        </dl>
      </div>
    </section>

{chr(10).join(groups)}
"""
    return page(
        "Black-hole perturbation theory · Alejandro Svyatkovskyy Kholyavka",
        "A short introductory course on black-hole perturbation theory: quasinormal modes, the Regge–Wheeler and Zerilli equations and the ringdown, with interactive figures.",
        f"{SITE}/lab/course/",
        body,
    )


def nav_link(i, cls):
    if i < 0 or i >= len(LESSONS):
        return f'<span class="{cls}"></span>'
    slug, title = LESSONS[i][0], LESSONS[i][1]
    word = "Previous" if cls == "prev" else "Next"
    arrow_l = "← " if cls == "prev" else ""
    arrow_r = " →" if cls == "next" else ""
    if written(slug):
        return f'<div class="{cls}"><a href="{slug}.html"><small>{arrow_l}{word} · {num(i)}{arrow_r}</small><b>{title}</b></a></div>'
    return f'<div class="{cls}"><span class="off"><small>{word} · {num(i)} · in preparation</small><b>{title}</b></span></div>'


def lesson_page(i):
    slug, title, line, part = LESSONS[i]
    fragment = (SRC / f"{slug}.html").read_text(encoding="utf-8").strip()
    if "<h1" in fragment:
        fail(f"{slug}: the fragment must not contain its own <h1>")
    lede = LEDES.get(slug, line)
    part_name = dict(PARTS)[part]
    body = f"""    <div class="head">
      <div>
        <a class="back" href="./">← Course contents</a>
        <span class="label" data-float>Lesson {num(i)} · Part {part} · {part_name}</span>
        <h1 data-float>{title}</h1>
        <p class="lede" data-float>{lede}</p>
      </div>
    </div>

    <article class="lesson">
{fragment}
    </article>

    <nav class="lesson-nav" aria-label="Lessons">
      {nav_link(i - 1, "prev")}
      <a class="all" href="./">All lessons</a>
      {nav_link(i + 1, "next")}
    </nav>"""
    return page(
        f"{title} · Black-hole perturbation theory · Alejandro Svyatkovskyy Kholyavka",
        f"Lesson {i} of a short course on black-hole perturbation theory. {line}",
        f"{SITE}/lab/course/{slug}.html",
        body,
        math=True,
    )


def main():
    if not SRC.is_dir():
        fail(f"no lesson sources in {SRC}")
    known = {slug for slug, *_ in LESSONS}
    for f in SRC.glob("*.html"):
        if f.stem not in known:
            fail(f"{f.name} is not in the list of lessons")
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.html"):
        old.unlink()
    (OUT / "index.html").write_text(index_page(), encoding="utf-8")
    n = 0
    for i, (slug, *_rest) in enumerate(LESSONS):
        if written(slug):
            (OUT / f"{slug}.html").write_text(lesson_page(i), encoding="utf-8")
            n += 1
    print(f"course: index and {n} of {len(LESSONS)} lessons written to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
