// Runs a CloudFront Function file's handler() under node for scripts/tests/test_spa_fallback.py.
// Usage: node cf_function_runner.mjs <function.js>   (stdin: JSON list of events; stdout: JSON list of results)
// cloudfront-js-2.0 is an ES5.1-plus subset, so plain node runs the same code; the file is evaluated in a bare context.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(process.argv[2], 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const events = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(events.map((event) => ctx.handler(event))));
