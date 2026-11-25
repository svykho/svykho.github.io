#!/usr/bin/env python3
"""Build the notebooks of Lesson 12, "Compute it yourself".

Each notebook is written as a plain Python file in tools/course/code/<name>.py,
with cells separated by "# %%" lines ("# %% [markdown]" for text cells, whose
lines start with "# "). This script turns each file into a Jupyter notebook, runs
it from top to bottom so that the published copy shows every result and figure,
and writes it to lab/course/code/<name>.ipynb.

    python3 tools/build-notebooks.py            # all notebooks
    python3 tools/build-notebooks.py leaver     # only some
"""
import re
import sys
import time
from pathlib import Path

import nbformat
from nbconvert.preprocessors import ExecutePreprocessor

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "course" / "code"
OUT = ROOT / "lab" / "course" / "code"


def cells(text):
    out = []
    for block in re.split(r"^# %%", text, flags=re.M)[1:]:
        head, _, body = block.partition("\n")
        body = body.strip("\n")
        if "[markdown]" in head:
            lines = [re.sub(r"^# ?", "", ln) for ln in body.splitlines()]
            out.append(nbformat.v4.new_markdown_cell("\n".join(lines).strip()))
        elif body.strip():
            out.append(nbformat.v4.new_code_cell(body))
    return out


def build(path):
    nb = nbformat.v4.new_notebook()
    nb.cells = cells(path.read_text(encoding="utf-8"))
    nb.metadata = {
        "kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
        "language_info": {"name": "python"},
    }
    t0 = time.time()
    ExecutePreprocessor(timeout=900, kernel_name="python3").preprocess(nb, {"metadata": {"path": str(SRC)}})
    for c in nb.cells:
        c.metadata.pop("execution", None)
        for o in c.get("outputs", []):
            o.get("metadata", {}).pop("execution", None)
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"{path.stem}.ipynb"
    nbformat.write(nb, dest)
    kb = dest.stat().st_size / 1024
    print(f"notebooks: {dest.relative_to(ROOT)}  ({time.time() - t0:.0f} s, {kb:.0f} KB)")


def main():
    names = sys.argv[1:]
    files = sorted(SRC.glob("*.py"))
    if names:
        files = [f for f in files if f.stem in names]
        if len(files) != len(names):
            sys.exit(f"build-notebooks: unknown notebook in {names}")
    for f in files:
        build(f)


if __name__ == "__main__":
    main()
