const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');
const P = require('./paths');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts });
    return { ok: r.status === 0, status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
};

const has = (cmd) => process.platform === 'win32'
    ? run('where', [cmd]).ok
    : run('/bin/sh', ['-c', `command -v ${cmd}`]).ok;

const ping = (url, timeout = 2000) => new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => { res.resume(); resolve(res.statusCode < 500); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
});

const getJson = (url, timeout = 2000) => new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => { try { resolve(res.statusCode === 200 ? JSON.parse(body) : null); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
});

const alive = (pid) => {
    if (!pid) return false;
    try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

const readPid = (file) => {
    try { return parseInt(fs.readFileSync(file, 'utf8'), 10) || null; } catch { return null; }
};

const readConfig = () => {
    try { return JSON.parse(fs.readFileSync(P.CONFIG, 'utf8')); } catch { return {}; }
};

const writeConfig = (patch) => {
    fs.mkdirSync(P.DATA, { recursive: true });
    fs.writeFileSync(P.CONFIG, JSON.stringify({ ...readConfig(), ...patch }, null, 2));
};

const stamp = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().replace('T', ' ').slice(0, 19);
};

module.exports = { sleep, run, has, ping, getJson, alive, readPid, readConfig, writeConfig, stamp };
