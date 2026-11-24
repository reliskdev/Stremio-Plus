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
const { run, readConfig } = require('./util');

const BEGIN = '/*stremio-plus:begin*/';
const END = '/*stremio-plus:end*/';

// ---------- macOS ----------

const MAC_APP = '/Applications/Stremio.app';
const MAC = {
    server: `${MAC_APP}/Contents/MacOS/server.js`,
    exe: `${MAC_APP}/Contents/MacOS/Stremio`,
    sig: `${MAC_APP}/Contents/_CodeSignature`,
    plist: `${MAC_APP}/Contents/Info.plist`,
    ffmpeg: `${MAC_APP}/Contents/MacOS/ffmpeg`,
    splashVideo: `${MAC_APP}/Contents/MacOS/splash.mp4`,
    splashImage: `${MAC_APP}/Contents/MacOS/splash.jpg`,
    chromeLib: `${MAC_APP}/Contents/MacOS/libstremio-plus-chrome.dylib`,
    chromeRoot: `${MAC_APP}/Contents/MacOS/libstremio-plus-chrome.root`,
};
const CHROME_LOAD = '@executable_path/libstremio-plus-chrome.dylib';
const CHROME_BUILT = path.join(P.ROOT, 'shell', 'build', 'libstremio-plus-chrome.dylib');

// ---------- Mach-O: weak-load the window chrome from Stremio's own executable ----------
// A weak LC_LOAD_DYLIB means Stremio still starts if the dylib is ever missing. Thin 64-bit executables only (Stremio
// ships arm64 and x86_64 builds separately); the command goes in the padding between the load commands and the first
// section, which Stremio's linker leaves (192 bytes in 5.1.31; this needs 72).
const LC_SEGMENT_64 = 0x19;
const LC_LOAD_DYLIB = 0xc;
const LC_LOAD_WEAK_DYLIB = 0x80000018;

const loadCommands = (buf) => {
    if (buf.readUInt32LE(0) !== 0xfeedfacf) throw new Error('not a thin 64-bit Mach-O executable');
    const ncmds = buf.readUInt32LE(16);
    const sizeofcmds = buf.readUInt32LE(20);
    let off = 32;
    let firstSection = Infinity;
    const dylibs = [];
    for (let i = 0; i < ncmds; i++) {
        const cmd = buf.readUInt32LE(off);
        const size = buf.readUInt32LE(off + 4);
        if (cmd === LC_SEGMENT_64) {
            const nsects = buf.readUInt32LE(off + 64);
            for (let k = 0; k < nsects; k++) {
                const sect = off + 72 + k * 80;
                const fileOff = buf.readUInt32LE(sect + 48);
                if (fileOff && buf.readBigUInt64LE(sect + 40) > 0n) firstSection = Math.min(firstSection, fileOff);
            }
        }
        if (cmd === LC_LOAD_DYLIB || cmd === LC_LOAD_WEAK_DYLIB) {
            dylibs.push(buf.toString('utf8', off + buf.readUInt32LE(off + 8), off + size).replace(/\0+$/, ''));
        }
        off += size;
    }
    return { ncmds, sizeofcmds, end: 32 + sizeofcmds, firstSection, dylibs };
};

const hasChromeLoad = () => {
    try { return loadCommands(fs.readFileSync(MAC.exe)).dylibs.includes(CHROME_LOAD); } catch { return false; }
};

const addWeakDylib = (file, name) => {
    const buf = fs.readFileSync(file);
    const lc = loadCommands(buf);
    if (lc.dylibs.includes(name)) return;
    const str = Buffer.from(`${name}\0`);
    const size = Math.ceil((24 + str.length) / 8) * 8;
    if (lc.end + size > lc.firstSection) throw new Error(`no room for another load command (${lc.firstSection - lc.end} bytes free)`);
    const cmd = Buffer.alloc(size);
    cmd.writeUInt32LE(LC_LOAD_WEAK_DYLIB, 0);
    cmd.writeUInt32LE(size, 4);
    cmd.writeUInt32LE(24, 8);          // name offset
    cmd.writeUInt32LE(2, 12);          // timestamp
    cmd.writeUInt32LE(0x10000, 16);    // current version 1.0.0
    cmd.writeUInt32LE(0x10000, 20);    // compatibility version 1.0.0
    str.copy(cmd, 24);
    if (buf.subarray(lc.end, lc.end + size).some((b) => b !== 0)) throw new Error('header padding is not empty');
    cmd.copy(buf, lc.end);
    buf.writeUInt32LE(lc.ncmds + 1, 16);
    buf.writeUInt32LE(lc.sizeofcmds + size, 20);
    fs.writeFileSync(file, buf);
};

// Copy the built dylib into the app (and where to find the Stremio+ folder, for the vanilla flag).
const installChrome = () => {
    require('./platform/darwin').buildChrome();
    if (!fs.existsSync(CHROME_BUILT)) return [];
    fs.rmSync(MAC.chromeLib, { force: true });
    fs.copyFileSync(CHROME_BUILT, MAC.chromeLib);
    fs.writeFileSync(MAC.chromeRoot, `${P.ROOT}\n`);
    return [MAC.chromeLib, MAC.chromeRoot];
};

const chromeCurrent = () => fs.existsSync(MAC.chromeLib) && fs.existsSync(CHROME_BUILT)
    && fs.readFileSync(MAC.chromeLib).equals(fs.readFileSync(CHROME_BUILT))
    && fs.existsSync(MAC.chromeRoot) && fs.readFileSync(MAC.chromeRoot, 'utf8').trim() === P.ROOT;

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

const sign = (entitlements, files) => {
    // Files in Contents/MacOS (server.js, the splash) are signed as code of their own (signature in xattrs), then the bundle.
    for (const file of files) {
        const r = run('codesign', ['--force', '--sign', '-', file]);
        if (!r.ok) throw new Error(`signing ${path.basename(file)} failed: ${r.err}`);
    }
    const r = run('codesign', ['--force', '--sign', '-', '--options', 'runtime', '--entitlements', entitlements, MAC_APP]);
    if (!r.ok) throw new Error(`re-signing Stremio failed: ${r.err}`);
    const v = run('codesign', ['--verify', '--strict', MAC_APP]);
    if (!v.ok) throw new Error(`Stremio's signature doesn't verify after patching: ${v.err}`);
};

const backupSplash = (dir) => {
    // Backups made before the splash existed (task 044) lack it; Stremio's splash was never touched before, so take it now.
    for (const file of [MAC.splashVideo, MAC.splashImage]) {
        const copy = path.join(dir, path.basename(file));
        if (!fs.existsSync(copy) && fs.existsSync(file)) ditto(file, copy);
    }
};

const macBackup = () => {
    const dir = macBackupDir();
    if (fs.existsSync(path.join(dir, 'complete'))) { backupSplash(dir); return dir; }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    ditto(MAC.server, path.join(dir, 'server.js'));
    ditto(MAC.exe, path.join(dir, 'Stremio'));
    ditto(MAC.sig, path.join(dir, '_CodeSignature'));
    const ent = run('codesign', ['-d', '--entitlements', ':-', MAC_APP]);
    if (!ent.ok || !ent.out.includes('<plist')) throw new Error('could not read Stremio\'s entitlements');
    fs.writeFileSync(path.join(dir, 'entitlements.plist'), ent.out);
    backupSplash(dir);
    fs.writeFileSync(path.join(dir, 'complete'), new Date().toISOString());
    return dir;
};

// Render the Stremio+ splash once per Stremio version (cached in addon/data/splash/<version>/). Optional: a failure
// (no sharp yet, ffmpeg missing) leaves Stremio's own splash.
const prepareSplash = async (backup) => {
    if (readConfig().splash === false) return null;
    const out = path.join(P.DATA, 'splash', macVersion());
    const ready = ['splash.mp4', 'splash.jpg'].every((f) => fs.existsSync(path.join(out, f)))
        && fs.statSync(path.join(out, 'splash.mp4')).mtimeMs >= fs.statSync(path.join(__dirname, 'splash.js')).mtimeMs;
    if (!ready) {
        fs.mkdirSync(out, { recursive: true });
        await require('./splash').render({
            ffmpeg: MAC.ffmpeg,
            srcVideo: path.join(backup, 'splash.mp4'),
            srcImage: path.join(backup, 'splash.jpg'),
            outDir: out,
        });
    }
    return { video: path.join(out, 'splash.mp4'), image: path.join(out, 'splash.jpg') };
};

const macPatch = async () => {
    const status = macStatus();
    if (status === 'patched') {
        if (readConfig().chrome === false) return 'already patched';
        // Patched before the bundled window chrome existed: redo the whole patch from the backup.
        if (!hasChromeLoad()) { macRestore(); return macPatch(); }
        require('./platform/darwin').buildChrome();
        if (chromeCurrent()) return 'already patched';
        const files = installChrome();
        sign(path.join(macBackupDir(), 'entitlements.plist'), files);
        return 'updated the window chrome in Stremio';
    }
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
    let splash = null;
    try { splash = await prepareSplash(dir); } catch (e) { console.warn(`keeping Stremio's splash (${e.message.split('\n')[0]})`); }
    fs.writeFileSync(MAC.server, patched);
    const files = [MAC.server];
    try {
        if (splash) {
            fs.copyFileSync(splash.video, MAC.splashVideo);
            fs.copyFileSync(splash.image, MAC.splashImage);
            files.push(MAC.splashVideo, MAC.splashImage);
        }
        if (readConfig().chrome !== false) {
            try {
                const chrome = installChrome();
                if (chrome.length) { addWeakDylib(MAC.exe, CHROME_LOAD); files.push(...chrome); }
            } catch (e) {
                console.warn(`window chrome stays launcher-only (${e.message})`);
                fs.rmSync(MAC.chromeLib, { force: true });
                fs.rmSync(MAC.chromeRoot, { force: true });
                ditto(path.join(dir, 'Stremio'), MAC.exe);
            }
        }
        // A broken server.js means Stremio starts without its streaming server: check with Stremio's own node first.
        const check = run(`${MAC_APP}/Contents/MacOS/node`, ['--check', MAC.server]);
        if (!check.ok) throw new Error(`patched server.js doesn't parse: ${check.err.split('\n').slice(0, 4).join(' ')}`);
        sign(path.join(dir, 'entitlements.plist'), files);
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
    for (const file of [MAC.splashVideo, MAC.splashImage]) {
        const copy = path.join(dir, path.basename(file));
        if (fs.existsSync(copy)) { fs.rmSync(file, { force: true }); ditto(copy, file); }
    }
    ditto(path.join(dir, 'Stremio'), MAC.exe);
    fs.rmSync(MAC.chromeLib, { force: true });
    fs.rmSync(MAC.chromeRoot, { force: true });
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
    // Patched Stremio loads the window chrome itself; the launcher must not inject a second copy.
    chromeBundled: () => process.platform === 'darwin' && macStatus() === 'patched' && hasChromeLoad() && fs.existsSync(MAC.chromeLib),
    supported: () => !!forPlatform(),
    status: () => (forPlatform() ? forPlatform().status() : 'unsupported'),
    patch: () => {
        if (!forPlatform()) throw new Error(`patching isn't available on ${process.platform} yet`);
        return forPlatform().patch();
    },
    restore: () => (forPlatform() ? forPlatform().restore() : 'nothing to restore'),
};
