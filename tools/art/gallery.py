import json, sys, os
from pathlib import Path
ROOT = str(Path(__file__).resolve().parents[2])
sys.path.insert(0, ROOT + "/tools/art")
from render import frame_files, output_path, svg_path
from pathlib import Path
entries = json.load(open(ROOT + "/docs/art/asset-catalogue.json"))["assets"]
base = Path(ROOT) / "docs/art"
data = []
for e in entries:
    srcs = []
    for f in frame_files(e):
        p = output_path(e, f)
        if p is None or not p.exists():
            p = svg_path(e, f)
        srcs.append(os.path.relpath(p, base))
    data.append({"id": e["id"], "family": e["family"], "frames": len(srcs), "files": frame_files(e),
                 "src": srcs, "displaySize": e["displaySize"], "authorSize": e["authorSize"],
                 "anchor": e.get("anchor"), "appPath": e.get("appPath"), "rawPath": e.get("rawPath")})
html = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Space Colony Defence — art gallery</title>
<style>
:root{--bg:#0e1026;--panel:#1c1f45;--ink:#eef0ff;--muted:#a9acd6;--accent:#ffc94a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:#151838ee;padding:12px 16px;border-bottom:1px solid #2c3070}
h1{margin:0 0 8px;font-size:20px}
.row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
button{background:var(--panel);color:var(--ink);border:1px solid #3a3f8a;border-radius:16px;padding:4px 10px;cursor:pointer;font:inherit}
button.on{background:var(--accent);color:#1b1b1b;border-color:var(--accent)}
.lbl{color:var(--muted);margin-right:4px}
main{padding:16px}
h2{margin:24px 0 8px;font-size:18px;color:var(--accent)}
.grid{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
.card{background:var(--panel);border-radius:10px;padding:10px;max-width:100%}
.card h3{margin:0 0 6px;font-size:13px;font-family:ui-monospace,monospace}
.meta{color:var(--muted);font-size:11px;margin-bottom:6px}
.views{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
.stage{border-radius:6px;display:flex;align-items:flex-end;justify-content:center;padding:6px;max-width:100%;overflow:hidden}
.stage img{display:block;max-width:100%;height:auto;image-rendering:auto}
.cap{font-size:10px;color:var(--muted);text-align:center}
.strip{display:flex;gap:3px;flex-wrap:wrap;margin-top:6px;border-radius:6px;padding:4px}
.strip img{display:block}
body.bg-ground .stage,body.bg-ground .strip{background:#9C8FD6}
body.bg-space .stage,body.bg-space .strip{background:#141633}
body.bg-check .stage,body.bg-check .strip{background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/16px 16px}
.count{color:var(--muted);font-size:12px;font-weight:normal}
</style></head>
<body class="bg-ground">
<header>
<h1>Space Colony Defence — art gallery</h1>
<div class="row" id="fams"><span class="lbl">Family:</span></div>
<div class="row" style="margin-top:6px"><span class="lbl">Background:</span>
<button data-bg="ground" class="on">Moon ground</button><button data-bg="space">Deep space</button><button data-bg="check">Checkerboard</button>
<span class="lbl" style="margin-left:12px">Animation:</span><button id="pause">Pause</button></div>
</header>
<main id="main"></main>
<script>
const ASSETS = __DATA__;
const BIG = new Set(["screens","map","reference"]);
const FIT = 520;
const main = document.getElementById("main");
const fams = [...new Set(ASSETS.map(a => a.family))];
let current = "all", paused = false;
function sizeFor(a, scale){
  let [w,h] = a.displaySize; w*=scale; h*=scale;
  const lim = BIG.has(a.family) || w > FIT ? FIT*(scale>1?1.6:1) : Infinity;
  if (w > lim){ h = h*lim/w; w = lim; }
  return [Math.round(w), Math.round(h)];
}
function img(src,w,h){ const i=new Image(); i.src=src; i.width=w; i.height=h; i.loading="lazy"; i.alt=""; return i; }
const anims = [];
function build(){
  main.innerHTML=""; anims.length=0;
  for (const f of fams){
    if (current!=="all" && current!==f) continue;
    const list = ASSETS.filter(a=>a.family===f);
    const h2=document.createElement("h2"); h2.innerHTML=f+' <span class="count">'+list.length+' assets, '+list.reduce((n,a)=>n+a.frames,0)+' images</span>'; h2.id="fam-"+f; main.appendChild(h2);
    const grid=document.createElement("div"); grid.className="grid"; main.appendChild(grid);
    for (const a of list){
      const c=document.createElement("div"); c.className="card";
      c.innerHTML='<h3>'+a.id+'</h3><div class="meta">'+a.frames+' frame'+(a.frames>1?'s':'')+' · display '+a.displaySize.join('×')+' · author '+a.authorSize.join('×')+'<br>'+(a.appPath||a.rawPath||'')+'</div>';
      const views=document.createElement("div"); views.className="views";
      const scales = BIG.has(a.family) || a.displaySize[0] > FIT/2 ? [1] : [1,2];
      for (const s of scales){
        const [w,h]=sizeFor(a,s); const wrap=document.createElement("div");
        const st=document.createElement("div"); st.className="stage"; const im=img(a.src[0],w,h); st.appendChild(im);
        const cap=document.createElement("div"); cap.className="cap"; cap.textContent = BIG.has(a.family)||a.displaySize[0]*s>FIT ? "scaled to fit" : s+"x";
        wrap.appendChild(st); wrap.appendChild(cap); views.appendChild(wrap);
        if (a.frames>1) anims.push({a,im,i:0});
      }
      c.appendChild(views);
      if (a.frames>1){
        const strip=document.createElement("div"); strip.className="strip";
        let [w,h]=a.displaySize; const k=Math.min(1, 64/Math.max(w,h)); 
        for (let i=0;i<a.frames;i++){ const t=img(a.src[i],Math.round(w*k),Math.round(h*k)); t.title=a.files[i]; strip.appendChild(t); }
        c.appendChild(strip);
      }
      grid.appendChild(c);
    }
  }
}
function famButtons(){
  const box=document.getElementById("fams");
  for (const f of ["all",...fams]){
    const b=document.createElement("button"); b.textContent=f; if(f===current)b.classList.add("on");
    b.onclick=()=>{current=f; box.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b)); build(); scrollTo(0,0);};
    box.appendChild(b);
  }
}
document.querySelectorAll("[data-bg]").forEach(b=>b.onclick=()=>{
  document.body.className="bg-"+b.dataset.bg;
  document.querySelectorAll("[data-bg]").forEach(x=>x.classList.toggle("on",x===b));
});
document.getElementById("pause").onclick=e=>{paused=!paused; e.target.textContent=paused?"Play":"Pause";};
setInterval(()=>{ if(paused) return; for(const o of anims){ o.i=(o.i+1)%o.a.frames; o.im.src=o.a.src[o.i]; } }, 125);
const q=new URLSearchParams(location.hash.slice(1));
if (q.get("family")) current=q.get("family");
famButtons(); build();
if (q.get("bg")) document.querySelector('[data-bg="'+q.get("bg")+'"]').click();
</script>
</body></html>
"""
out = base / "gallery.html"
out.write_text(html.replace("__DATA__", json.dumps(data, separators=(",", ":"))))
print(out, len(data), sum(d["frames"] for d in data))
