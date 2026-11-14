#!/usr/bin/env python3
"""Make a review contact sheet for one art family (or a list of ids) at real in-game display size.

Every frame is shown at its displaySize on two backgrounds (moon ground and deep space) with its file name,
so a reviewer can judge readability, consistency and silhouette at the size the child will see.
Output: art/review/<name>.png (git-ignored).

Usage:
  python3 tools/art/contact_sheet.py --family astronauts
  python3 tools/art/contact_sheet.py --ids nova-l1-idle,pip-l1-idle --name lineup --scale 1
  python3 tools/art/contact_sheet.py --family aliens --scale 2   # magnified view
"""
import argparse
import html
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render import CATALOGUE, ROOT, frame_files, svg_path  # noqa: E402

CHROME = shutil.which("google-chrome") or shutil.which("chromium")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--family")
    ap.add_argument("--ids")
    ap.add_argument("--name")
    ap.add_argument("--scale", type=float, default=1.0)
    args = ap.parse_args()
    entries = json.loads(CATALOGUE.read_text())["assets"]
    ids = set(args.ids.split(",")) if args.ids else None
    chosen = [e for e in entries if (not args.family or e["family"] == args.family) and (not ids or e["id"] in ids)]
    cells = []
    for e in chosen:
        w, h = (int(v * args.scale) for v in e["displaySize"])
        for name in frame_files(e):
            src = svg_path(e, name)
            body = (f'<img src="{src.as_uri()}" width="{w}" height="{h}">' if src.exists()
                    else f'<div class="miss" style="width:{w}px;height:{h}px">missing</div>')
            cells.append(f'<figure>{body}<figcaption>{html.escape(name)}</figcaption></figure>')
    name = args.name or args.family or "selection"
    page = f"""<html><head><style>
      body{{margin:0;font:12px sans-serif;color:#fff}}
      .band{{display:flex;flex-wrap:wrap;gap:16px;padding:16px;align-items:flex-end}}
      .ground{{background:#9C8FD6}} .space{{background:#141633}}
      figure{{margin:0;text-align:center}} figcaption{{max-width:200px;word-break:break-all}}
      .miss{{border:2px dashed #f55;display:flex;align-items:center;justify-content:center}}
    </style></head><body>
      <div class="band ground">{''.join(cells)}</div><div class="band space">{''.join(cells)}</div>
    </body></html>"""
    out = ROOT / "art/review" / f"{name}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        page_file = Path(tmp) / "sheet.html"
        page_file.write_text(page)
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1600,3000",
                        f"--screenshot={out}", page_file.as_uri()], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    subprocess.run(["convert", str(out), "-trim", "+repage", str(out)], check=False)
    print(out.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
