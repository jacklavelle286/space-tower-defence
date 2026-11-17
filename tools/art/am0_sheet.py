"""AM0 preview sheet (Gate M; docs/validation/am0-animation.md): for six repository aliens, the hand-drawn walk frames
above the frames the shared animator makes from frame 01 alone (web/shared/src/animator), and an animated GIF of each
pair side by side. Needs google-chrome (as render.py) and ImageMagick.

    python3 tools/art/am0_sheet.py            # writes docs/validation/am0/sheet.png and <family>.gif
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render import ROOT, render  # noqa: E402

FAMILIES = ["blob", "shell", "slime", "guard", "patch", "mite"]
OUT = ROOT / "docs" / "validation" / "am0"
SIZE = 128


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        subprocess.run(["node", "shared/scripts/am0-frames.ts", str(work)], cwd=ROOT / "web", check=True)
        rows = []
        for family in FAMILIES:
            hand = [work / f"hand-{family}-0{n}.png" for n in range(1, 7)]
            made = [work / f"derived-{family}-0{n}.png" for n in range(1, 7)]
            for n in range(1, 7):
                render(ROOT / "art" / "svg" / "aliens" / f"alien-{family}-walk-0{n}.svg", hand[n - 1], SIZE, SIZE)
                render(work / f"derived-{family}-0{n}.svg", made[n - 1], SIZE, SIZE)
            row = work / f"row-{family}.png"
            subprocess.run(
                ["montage", *map(str, hand), *map(str, made), "-tile", "6x2", "-geometry", f"{SIZE}x{SIZE}+4+4",
                 "-background", "#2a1e3d", "-title", f"{family}: hand-drawn (top) and made from frame 01 (bottom)",
                 "-fill", "white", str(row)],
                check=True,
            )  # fmt: skip
            rows.append(row)
            pairs = []
            for n in range(6):
                pair = work / f"pair-{family}-{n}.png"
                subprocess.run(["montage", str(hand[n]), str(made[n]), "-tile", "2x1", "-geometry", f"{SIZE}x{SIZE}+6+6",
                                "-background", "#2a1e3d", str(pair)], check=True)  # fmt: skip
                pairs.append(pair)
            subprocess.run(["convert", "-delay", "12", "-loop", "0", "-dispose", "previous", *map(str, pairs),
                            str(OUT / f"{family}.gif")], check=True)  # fmt: skip
        subprocess.run(["convert", *map(str, rows), "-append", str(OUT / "sheet.png")], check=True)
    print(f"am0: {OUT / 'sheet.png'} and {len(FAMILIES)} GIFs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
