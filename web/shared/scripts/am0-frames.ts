// AM0 preview (Gate M): write the animator's six walk frames, made from each repository alien's frame 01, beside the
// hand-drawn ones, for tools/art/am0_sheet.py to render. Run from web/: node shared/scripts/am0-frames.ts <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";
import { animate } from "../src/animator/animator.ts";

const ALIENS = join(import.meta.dirname, "..", "..", "..", "art", "svg", "aliens");
const FAMILIES = ["blob", "shell", "slime", "guard", "patch", "mite"];
const out = argv[2];
if (out === undefined) throw new Error("usage: node shared/scripts/am0-frames.ts <out-dir>");
mkdirSync(out, { recursive: true });
for (const family of FAMILIES) {
  const first = readFileSync(join(ALIENS, `alien-${family}-walk-01.svg`), "utf8");
  animate(first).forEach((svg, i) => writeFileSync(join(out, `derived-${family}-0${i + 1}.svg`), svg));
}
console.log(`am0: ${FAMILIES.length * 6} derived frames in ${out}`);
