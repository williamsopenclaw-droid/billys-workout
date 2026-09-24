const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FATAL: no inline <script> block found'); process.exit(1); }
const tmp = path.join(__dirname, '_script_check.js');
fs.writeFileSync(tmp, m[1]);
const cp = require('node:child_process');
const r = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
fs.unlinkSync(tmp);
if (r.status === 0) { console.log('SYNTAX_OK'); process.exit(0); }
console.error(r.stderr || r.stdout); process.exit(1);
