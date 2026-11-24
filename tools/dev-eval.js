#!/usr/bin/env node
// Run JS inside the real (patched) Stremio window through the chrome dylib's dev channel.
// Needs addon/data/dev/ to exist when Stremio starts. Usage: node tools/dev-eval.js '<async function body>' | -f file.js
// The body may `await` and `return` a JSON-able value.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'addon', 'data', 'dev');
const args = process.argv.slice(2);
const body = args[0] === '-f' ? fs.readFileSync(args[1], 'utf8') : args.join(' ');
const out = path.join(dir, 'eval.out.json');
fs.mkdirSync(dir, { recursive: true });
fs.rmSync(out, { force: true });
fs.writeFileSync(path.join(dir, 'eval.js'), body);
const deadline = Date.now() + Number(process.env.EVAL_TIMEOUT || 30000);
const poll = () => {
    if (fs.existsSync(out)) {
        const r = JSON.parse(fs.readFileSync(out, 'utf8'));
        console.log(JSON.stringify(r.error ? r : r.result, null, 2));
        process.exit(r.error ? 1 : 0);
    }
    if (Date.now() > deadline) { console.error('timeout (is Stremio running with the dylib and addon/data/dev/?)'); process.exit(2); }
    setTimeout(poll, 150);
};
poll();
