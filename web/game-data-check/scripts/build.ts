// Bundle the handler into one ES module for Lambda (Node 24, handler `index.handler`): dist/index.mjs, with game-core
// inlined and nothing else (it imports no packages and no AWS SDK). Not minified, so a stack trace in the logs reads
// as the source does. scripts/build_lambdas.py runs this and zips dist/ reproducibly. Run from web/:
//
//   npm run build --workspace @scd/game-data-check
import { rmSync } from "node:fs";
import { join } from "node:path";
import { rolldown } from "rolldown";

const root = join(import.meta.dirname, "..");
const out = join(root, "dist");
rmSync(out, { recursive: true, force: true });
const bundle = await rolldown({ input: join(root, "src", "handler.ts"), platform: "node", logLevel: "warn" });
await bundle.write({ file: join(out, "index.mjs"), format: "esm", sourcemap: false, minify: false });
await bundle.close();
console.log(`game-data-check: wrote ${join(out, "index.mjs")}`);
