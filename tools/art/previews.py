"""Full-height family preview sheets (contact_sheet.py layout, but sized to content, big frames scaled to fit)."""
import html, json, re, subprocess, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/art"))
from render import frame_files, svg_path
entries = json.loads((ROOT / "docs/art/asset-catalogue.json").read_text())["assets"]
OUT = ROOT / "docs/art/previews"; CAP = 360; WIDTH = 1600; MAXH = 15000

def cells_for(chosen, scale, only_first):
    cells = []
    for e in chosen:
        w, h = (v * scale for v in e["displaySize"])
        if w > CAP: h, w = h * CAP / w, CAP
        names = frame_files(e)[:1] if only_first else frame_files(e)
        for n in names:
            cells.append(f'<figure><img src="{svg_path(e, n).as_uri()}" width="{int(w)}" height="{int(h)}">'
                         f'<figcaption>{html.escape(n)}</figcaption></figure>')
    return cells

def page(cells, height_probe):
    probe = ("<script>addEventListener('load',()=>{document.body.setAttribute('data-h',document.documentElement.scrollHeight)})</script>"
             if height_probe else "")
    return f"""<html><head><style>body{{margin:0;font:12px sans-serif;color:#fff;width:{WIDTH}px}}
.band{{display:flex;flex-wrap:wrap;gap:16px;padding:16px;align-items:flex-end}}
.ground{{background:#9C8FD6}} .space{{background:#141633}} figure{{margin:0;text-align:center}}
figcaption{{max-width:200px;word-break:break-all}}</style></head><body>
<div class="band ground">{''.join(cells)}</div><div class="band space">{''.join(cells)}</div>{probe}</body></html>"""

def shoot(cells, out):
    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp) / "p.html"
        f.write_text(page(cells, True))
        dom = subprocess.run(["google-chrome", "--headless=new", "--disable-gpu", "--virtual-time-budget=10000",
                              f"--window-size={WIDTH},800", "--dump-dom", f.as_uri()], capture_output=True, text=True).stdout
        hgt = int(re.search(r'data-h="(\d+)"', dom).group(1))
        if hgt > MAXH and len(cells) > 1:
            return None
        f.write_text(page(cells, False))
        subprocess.run(["google-chrome", "--headless=new", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=10000",
                        f"--window-size={WIDTH},{hgt}", f"--screenshot={out}", f.as_uri()],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
        return hgt

def emit(cells, name):
    """Write name.png, or split into name-1.png, name-2.png... when too tall."""
    for old in OUT.glob(f"{name}-*.png"):
        if re.fullmatch(rf"{re.escape(name)}-\d+\.png", old.name): old.unlink()
    if shoot(cells, OUT / f"{name}.png"):
        return [f"{name}.png"]
    (OUT / f"{name}.png").unlink(missing_ok=True)
    parts, n = [], 2
    while True:
        size = -(-len(cells) // n); chunks = [cells[i:i + size] for i in range(0, len(cells), size)]
        tmpdir = Path(tempfile.mkdtemp())
        if all(shoot(c, tmpdir / f"{i}.png") for i, c in enumerate(chunks)):
            for i in range(len(chunks)):
                (tmpdir / f"{i}.png").rename(OUT / f"{name}-{i + 1}.png"); parts.append(f"{name}-{i + 1}.png")
            return parts
        n += 1

OUT.mkdir(parents=True, exist_ok=True)
fams = list(dict.fromkeys(e["family"] for e in entries))
for f in fams:
    print(f, emit(cells_for([e for e in entries if e["family"] == f], 1, False), f), flush=True)
lineup = [next(e for e in entries if e["id"] == f"{n}-l{l}-idle") for n in ["nova", "pip", "sol", "juno", "mira", "orion"] for l in (1, 2, 3)]
print("lineup", emit(cells_for(lineup, 2, True), "lineup"))
