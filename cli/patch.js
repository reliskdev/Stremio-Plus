// Spicetify-style patch: make stock Stremio itself load the Stremio+ UI, so every way of opening it (Dock, Spotlight,
// Start menu, stremio:// links) goes straight to the mods: no close-and-reopen.
//
// macOS: Stremio's window loads https://web.stremio.com/ through its bundled streaming server
// (localhost:11470/proxy/…, Contents/MacOS/server.js). The patch teaches that proxy to serve the Stremio+ UI from
// 127.0.0.1:7011 instead, falling back to the real web.stremio.com whenever the Stremio+ server is down or the
// vanilla flag is set. Editing server.js breaks the app's signature seal, so the app is re-signed ad hoc with its
// original entitlements. The original server.js, main executable and _CodeSignature are backed up first; `restore`
// puts them back and the original Apple signature verifies again.
const fs = require('fs');
const path = require('path');
const P = require('./paths');
const { run } = require('./util');

const BEGIN = '/*stremio-plus:begin*/';
const END = '/*stremio-plus:end*/';

// ---------- macOS ----------

const MAC_APP = '/Applications/Stremio.app';
const MAC = {
    server: `${MAC_APP}/Contents/MacOS/server.js`,
    exe: `${MAC_APP}/Contents/MacOS/Stremio`,
    sig: `${MAC_APP}/Contents/_CodeSignature`,
    plist: `${MAC_APP}/Contents/Info.plist`,
};

// Anchors in Stremio's server.js (shell 5.1.x). If an update changes them, patching refuses instead of guessing.
const FETCH_CALL = '})), handleFetchWithRedirects(dest, req, headers, httpsAgent, opts, cfgOpts).then(';
const IS_WEBUI = 'isWebUI = "https:" === source.protocol && webUIHosts.includes(source.host)';
const UI_HOST = new URL(P.UI_URL).host;

const helper = () => `${BEGIN};globalThis.__stremioPlusFetch = function (dest, req, headers, agent, opts, cfg, fetchIt) {
    var stock = function () { return fetchIt(dest, req, headers, agent, opts, cfg); };
    if (["web.stremio.com", "web.strem.io", "app.strem.io"].indexOf(dest.host) < 0) return stock();
    try { if (require("fs").existsSync(${JSON.stringify(P.VANILLA_FLAG)})) return stock(); } catch (e) {}
    var pathname = dest.pathname || ""; // the proxy hands over the path without its leading slash
    if (pathname.charAt(0) !== "/") pathname = "/" + pathname;
    var local = require("url").parse(${JSON.stringify(`http://${UI_HOST}`)} + pathname + (dest.search || ""));
    return fetchIt(local, req, headers, undefined, opts, cfg).then(function (res) { return res.ok ? res : stock(); }, stock);
};${END}\n`;

const macVersion = () => run('plutil', ['-extract', 'CFBundleVersion', 'raw', MAC.plist]).out || 'unknown';
const macBackupDir = () => path.join(P.DATA, 'stremio-backup', `macos-${macVersion()}`);

// The agent asks every second; server.js is ~7 MB, so only re-read it when it changes.
let statusCache = { key: '', value: '' };
const macStatus = () => {
    if (!fs.existsSync(MAC.server)) return 'missing';
    const st = fs.statSync(MAC.server);
    const key = `${st.mtimeMs}:${st.size}`;
    if (statusCache.key === key) return statusCache.value;
    const value = readStatus();
    statusCache = { key, value };
    return value;
};

const readStatus = () => {
    const src = fs.readFileSync(MAC.server, 'utf8');
    if (src.includes(BEGIN)) return 'patched';
    return src.includes(FETCH_CALL) && src.includes(IS_WEBUI) ? 'stock' : 'unsupported';
};

// ditto keeps extended attributes: the signatures of non-Mach-O files in Contents/MacOS (server.js) live there.
const ditto = (from, to) => {
    const r = run('ditto', [from, to]);
    if (!r.ok) throw new Error(`copy failed (${from} → ${to}): ${r.err}`);
};

const sign = (entitlements) => {
    // server.js sits in Contents/MacOS, so it is signed as code of its own (signature in xattrs) before the bundle.
    const js = run('codesign', ['--force', '--sign', '-', MAC.server]);
    if (!js.ok) throw new Error(`signing server.js failed: ${js.err}`);
    const r = run('codesign', ['--force', '--sign', '-', '--options', 'runtime', '--entitlements', entitlements, MAC_APP]);
    if (!r.ok) throw new Error(`re-signing Stremio failed: ${r.err}`);
    const v = run('codesign', ['--verify', '--strict', MAC_APP]);
    if (!v.ok) throw new Error(`Stremio's signature doesn't verify after patching: ${v.err}`);
};

const macBackup = () => {
    const dir = macBackupDir();
    if (fs.existsSync(path.join(dir, 'complete'))) return dir;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    ditto(MAC.server, path.join(dir, 'server.js'));
    ditto(MAC.exe, path.join(dir, 'Stremio'));
    ditto(MAC.sig, path.join(dir, '_CodeSignature'));
    const ent = run('codesign', ['-d', '--entitlements', ':-', MAC_APP]);
    if (!ent.ok || !ent.out.includes('<plist')) throw new Error('could not read Stremio\'s entitlements');
    fs.writeFileSync(path.join(dir, 'entitlements.plist'), ent.out);
    fs.writeFileSync(path.join(dir, 'complete'), new Date().toISOString());
    return dir;
};

const macPatch = () => {
    const status = macStatus();
    if (status === 'patched') return 'already patched';
    if (status === 'missing') throw new Error(`Stremio isn't installed in ${MAC_APP}`);
    if (status === 'unsupported') throw new Error(`this Stremio version (${macVersion()}) isn't supported by the patch yet`);
    try { fs.accessSync(MAC.server, fs.constants.W_OK); } catch {
        throw new Error(`no write access to ${MAC_APP}; reinstall Stremio as your user or run with sudo`);
    }
    const dir = macBackup();
    const src = fs.readFileSync(MAC.server, 'utf8');
    const patched = helper() + src
        .replace(FETCH_CALL, '})), globalThis.__stremioPlusFetch(dest, req, headers, httpsAgent, opts, cfgOpts, handleFetchWithRedirects).then(')
        .replace(IS_WEBUI, `${IS_WEBUI} || ${JSON.stringify(UI_HOST)} === source.host`);
    fs.writeFileSync(MAC.server, patched);
    try {
        // A broken server.js means Stremio starts without its streaming server: check with Stremio's own node first.
        const check = run(`${MAC_APP}/Contents/MacOS/node`, ['--check', MAC.server]);
        if (!check.ok) throw new Error(`patched server.js doesn't parse: ${check.err.split('\n').slice(0, 4).join(' ')}`);
        sign(path.join(dir, 'entitlements.plist'));
    } catch (e) {
        macRestore();
        throw e;
    }
    return `patched Stremio ${macVersion()}`;
};

const macRestore = () => {
    const dir = macBackupDir();
    if (!fs.existsSync(path.join(dir, 'complete'))) {
        if (macStatus() === 'patched') throw new Error(`no backup for Stremio ${macVersion()}; reinstall Stremio to undo the patch`);
        return 'Stremio is not patched';
    }
    fs.rmSync(MAC.server, { force: true }); // replace the file, not just its bytes, so its xattr signature comes back too
    ditto(path.join(dir, 'server.js'), MAC.server);
    ditto(path.join(dir, 'Stremio'), MAC.exe);
    fs.rmSync(MAC.sig, { recursive: true, force: true });
    ditto(path.join(dir, '_CodeSignature'), MAC.sig);
    const v = run('codesign', ['--verify', '--strict', '--deep', MAC_APP]);
    return v.ok ? 'restored the original Stremio (Apple signature verifies)' : `restored, but the signature check failed: ${v.err}`;
};

// ---------- dispatch ----------

const impl = {
    darwin: { status: macStatus, patch: macPatch, restore: macRestore },
};

const forPlatform = () => impl[process.platform] || null;

module.exports = {
    supported: () => !!forPlatform(),
    status: () => (forPlatform() ? forPlatform().status() : 'unsupported'),
    patch: () => {
        if (!forPlatform()) throw new Error(`patching isn't available on ${process.platform} yet`);
        return forPlatform().patch();
    },
    restore: () => (forPlatform() ? forPlatform().restore() : 'nothing to restore'),
};
