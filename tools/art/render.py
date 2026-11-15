#!/usr/bin/env python3
"""Render vector art sources (art/svg/...) to the game-ready PNGs listed in docs/art/asset-catalogue.json.

Each catalogue entry maps to SVG source files:
  still image : art/svg/<family>/<file stem>.svg
  animation   : art/svg/<family>/<frame file stem>.svg for every frame (framePattern with {nn} = 01..frames)
Each SVG is rendered with headless Chrome at the entry's authorSize, with a transparent background,
to the entry's appPath (shipped assets) or rawPath (reference sheets that are never shipped).

Usage:
  python3 tools/art/render.py                 # everything that has an SVG source
  python3 tools/art/render.py --family aliens # one family
  python3 tools/art/render.py --id moon-blob-idle
  python3 tools/art/render.py --check         # report missing SVG sources, render nothing
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOGUE = ROOT / "docs/art/asset-catalogue.json"
SVG_ROOT = ROOT / "art/svg"
CHROME = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")


def frame_files(entry):
    """Return the list of output file names for an entry (one per frame)."""
    frames = int(entry.get("frames") or 1)
    if frames <= 1:
        return [entry["file"]]
    pattern = entry.get("framePattern") or entry["file"]
    return [pattern.replace("{nn}", f"{n:02d}") for n in range(1, frames + 1)]


def output_path(entry, file_name):
    target = entry.get("appPath") or entry.get("rawPath")
    if not target:
        return None
    target = ROOT / target
    # appPath/rawPath name frame 01 (or the still); swap in this frame's file name.
    return target.with_name(file_name)


def svg_path(entry, file_name):
    return SVG_ROOT / entry["family"] / (Path(file_name).stem + ".svg")


def render(svg: Path, png: Path, width: int, height: int) -> None:
    png.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        html = Path(tmp) / "page.html"
        html.write_text(
            "<html><head><style>html,body{margin:0;background:transparent;overflow:hidden}</style></head>"
            f'<body><img src="{svg.as_uri()}" width="{width}" height="{height}" style="display:block"></body></html>'
        )
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--default-background-color=00000000", f"--window-size={width},{height}",
             f"--screenshot={png}", html.as_uri()],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60,
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--family")
    ap.add_argument("--id")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if not CHROME:
        print("google-chrome or chromium is required", file=sys.stderr)
        return 2
    entries = json.loads(CATALOGUE.read_text())["assets"]
    done = missing = 0
    for e in entries:
        if args.family and e["family"] != args.family:
            continue
        if args.id and e["id"] != args.id:
            continue
        w, h = e["authorSize"]
        for name in frame_files(e):
            src, dst = svg_path(e, name), output_path(e, name)
            if dst is None:
                continue
            if not src.exists():
                missing += 1
                if args.check:
                    print(f"missing {src.relative_to(ROOT)}")
                continue
            if not args.check:
                if dst.suffix == ".svg":
                    # Vector assets ship as SVG: copy the source as-is (Chrome cannot screenshot to .svg).
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(src, dst)
                else:
                    render(src, dst, w, h)
                done += 1
    print(f"rendered {done}, missing sources {missing}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
