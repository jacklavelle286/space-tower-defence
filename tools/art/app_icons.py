#!/usr/bin/env python3
"""App icons (Phase 66; D10.8 "favicon and app icons from the logo").

The on-dark logo (web/player/public/assets/ui/logo-on-dark.svg, an emblem with no lettering) centred on the game's
night-blue square, rendered with headless Chrome as tools/art/render.py renders the art:

    web/player/public/assets/ui/app-icon-512.png   web app icon (and a large share preview)
    web/player/public/assets/ui/app-icon-192.png   web app icon
    web/player/public/assets/ui/apple-touch-icon.png  180 px, the home-screen icon on an iPad or iPhone

The admin site's tab icon is the logo itself, /assets/ui/logo.svg, which the admin build carries with the battle
preview's art (web/player/vite.preview.config.ts).

Usage: python3 tools/art/app_icons.py
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "web/player/public/assets/ui"
LOGO = UI / "logo-on-dark.svg"
BACKGROUND = "#141633"  # the battle page's background (web/player/index.html)
SIZES = {"app-icon-512.png": 512, "app-icon-192.png": 192, "apple-touch-icon.png": 180}
CHROME = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")


def render(png: Path, size: int) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        html = Path(tmp) / "page.html"
        pad = round(size * 0.1)
        html.write_text(
            f"<html><head><style>html,body{{margin:0;background:{BACKGROUND};overflow:hidden}}</style></head>"
            f'<body><img src="{LOGO.as_uri()}" width="{size - 2 * pad}" height="{size - 2 * pad}" '
            f'style="display:block;margin:{pad}px"></body></html>'
        )
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={size},{size}",
             f"--screenshot={png}", html.as_uri()],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60,
        )


def main() -> int:
    if not CHROME:
        print("google-chrome or chromium is required", file=sys.stderr)
        return 2
    for name, size in SIZES.items():
        render(UI / name, size)
        print(f"{UI / name} ({size} px)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
