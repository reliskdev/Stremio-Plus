// macOS: Stremio.app launched through LaunchServices, window chrome dylib injected with DYLD_INSERT_LIBRARIES,
// login agent via launchd, Stremio+.app launcher compiled from AppleScript.
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../paths');
const { run, sleep, alive } = require('../util');

const APP = '/Applications/Stremio.app';
const BIN = `${APP}/Contents/MacOS/Stremio`;
const CHROME_SRC = path.join(P.ROOT, 'shell', 'chrome.m');
const CHROME_LIB = path.join(P.ROOT, 'shell', 'build', 'libstremio-plus-chrome.dylib');
const AGENT_LABEL = 'com.stremio-plus.agent';
const AGENT_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${AGENT_LABEL}.plist`);
const LAUNCHER_APP = path.join(os.homedir(), 'Applications', 'Stremio+.app');
const uid = () => process.getuid();

const check = () => fs.existsSync(BIN) ? null : `Stremio isn't installed in ${APP}. Get it from https://www.stremio.com/downloads`;

// "[[dd-]hh:]mm:ss" → seconds
const etime = (s) => {
    const [days, rest] = s.includes('-') ? s.split('-') : [0, s];
    return rest.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0) + Number(days) * 86400;
};

const procs = () => run('ps', ['-axo', 'pid=,etime=,args=']).out.split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/))
    .filter((m) => m && m[3].startsWith(BIN))
    .map((m) => ({ pid: Number(m[1]), age: etime(m[2]), args: m[3] }));

const compilerAvailable = () => run('xcode-select', ['-p']).ok;

// Rebuild the dylib when its source is newer. Installed copies ship a prebuilt universal dylib, so users without
// the Xcode command line tools never need a compiler (and never see the "install developer tools" prompt).
const buildChrome = (universal = false) => {
    const stale = !fs.existsSync(CHROME_LIB) || fs.statSync(CHROME_SRC).mtimeMs > fs.statSync(CHROME_LIB).mtimeMs;
    if (!stale && !universal) return;
    if (!compilerAvailable()) return;
    fs.mkdirSync(path.dirname(CHROME_LIB), { recursive: true });
    const arch = universal ? ['-arch', 'arm64', '-arch', 'x86_64'] : ['-arch', process.arch === 'x64' ? 'x86_64' : 'arm64'];
    const r = run('xcrun', ['clang', '-dynamiclib', '-fobjc-arc', ...arch, '-mmacosx-version-min=11.0',
        '-framework', 'Cocoa', '-framework', 'WebKit', '-framework', 'MediaPlayer', '-o', CHROME_LIB, CHROME_SRC]);
    if (!r.ok) {
        console.error(`chrome dylib build failed; launching without it\n${r.err}`);
        fs.rmSync(CHROME_LIB, { force: true });
        return;
    }
    run('codesign', ['-f', '-s', '-', CHROME_LIB]);
};

const openModded = () => {
    buildChrome();
    const env = fs.existsSync(CHROME_LIB) ? ['--env', `DYLD_INSERT_LIBRARIES=${CHROME_LIB}`] : [];
    return run('open', ['-a', APP, ...env, '--args', `--webui-url=${P.UI_URL}`]).ok;
};

// Patched Stremio loads the mods itself; going through here only adds the window-chrome dylib.
const openPatched = () => {
    buildChrome();
    const env = fs.existsSync(CHROME_LIB) ? ['--env', `DYLD_INSERT_LIBRARIES=${CHROME_LIB}`] : [];
    return run('open', ['-a', APP, ...env]).ok;
};

const openStock = () => run('open', ['-a', APP]).ok;
const focus = () => run('open', ['-a', APP]).ok;

const quit = async (pids) => {
    run('osascript', ['-e', 'quit app "Stremio"']);
    for (let i = 0; i < 60 && pids.some(alive); i++) await sleep(250);
    pids.filter(alive).forEach((pid) => { try { process.kill(pid); } catch {} });
    await sleep(500);
};

const plist = (cli) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key><array><string>${cli}</string><string>daemon</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>AbandonProcessGroup</key><true/>
  <key>StandardOutPath</key><string>${P.AGENT_LOG}</string>
  <key>StandardErrorPath</key><string>${P.AGENT_LOG}</string>
</dict></plist>
`;

const enableAutostart = () => {
    fs.mkdirSync(path.dirname(AGENT_PLIST), { recursive: true });
    fs.writeFileSync(AGENT_PLIST, plist(path.join(P.ROOT, 'bin', 'stremio-plus')));
    run('launchctl', ['bootout', `gui/${uid()}/${AGENT_LABEL}`]);
    return run('launchctl', ['bootstrap', `gui/${uid()}`, AGENT_PLIST]).ok;
};

// The agent label is per user account, so another Stremio+ copy (dev checkout vs install) may own it: only touch
// it when it runs this copy.
const autostartEnabled = () => {
    try { return fs.readFileSync(AGENT_PLIST, 'utf8').includes(`<string>${path.join(P.ROOT, 'bin', 'stremio-plus')}</string>`); } catch { return false; }
};

const disableAutostart = () => {
    if (!autostartEnabled()) return;
    run('launchctl', ['bootout', `gui/${uid()}/${AGENT_LABEL}`]);
    fs.rmSync(AGENT_PLIST, { force: true });
};

const stopAutostart = () => { if (autostartEnabled()) run('launchctl', ['bootout', `gui/${uid()}/${AGENT_LABEL}`]); };

// launchd restarts the agent (KeepAlive), so a daemon that wants to reload just exits.
const restartDaemon = () => process.exit(0);

const createShortcut = () => {
    const cli = path.join(P.ROOT, 'bin', 'stremio-plus');
    const src = path.join(os.tmpdir(), 'stremio-plus-launcher.applescript');
    fs.writeFileSync(src, `-- "Stremio+" launcher: starts the server and opens Stremio with the modded UI.
do shell script "\\"${cli.replace(/(["\\])/g, '\\$1')}\\" launch > /dev/null 2>&1 &"
`);
    fs.rmSync(LAUNCHER_APP, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(LAUNCHER_APP), { recursive: true });
    const r = run('osacompile', ['-o', LAUNCHER_APP, src]);
    if (!r.ok) throw new Error(`osacompile failed: ${r.err}`);
    const icon = `${APP}/Contents/Resources/AppIcon.icns`;
    if (fs.existsSync(icon)) fs.copyFileSync(icon, `${LAUNCHER_APP}/Contents/Resources/applet.icns`);
    fs.rmSync(`${LAUNCHER_APP}/Contents/Resources/Assets.car`, { force: true });
    run('plutil', ['-remove', 'CFBundleIconName', `${LAUNCHER_APP}/Contents/Info.plist`]);
    run('codesign', ['--force', '-s', '-', LAUNCHER_APP]);
    const now = new Date();
    fs.utimesSync(LAUNCHER_APP, now, now);
    return LAUNCHER_APP;
};

const ownsShortcut = () => {
    const script = `${LAUNCHER_APP}/Contents/Resources/Scripts/main.scpt`;
    return fs.existsSync(script) && run('osadecompile', [script]).out.includes(path.join(P.ROOT, 'bin', 'stremio-plus'));
};
const removeShortcut = () => { if (ownsShortcut()) fs.rmSync(LAUNCHER_APP, { recursive: true, force: true }); };

module.exports = {
    name: 'macOS', check, procs, openModded, openPatched, openStock, focus, quit, buildChrome,
    enableAutostart, disableAutostart, autostartEnabled, stopAutostart, restartDaemon, createShortcut, removeShortcut,
};
