// Linux: Stremio's Qt shell (Flatpak com.stremio.Stremio, or a native `stremio` binary) reads --webui-url too.
// Shortcut and login agent are freedesktop .desktop files. Best effort: not tested on a Linux machine yet.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const P = require('../paths');
const { run, has, sleep, alive, readConfig } = require('../util');

const FLATPAK_ID = 'com.stremio.Stremio';
const XDG_DATA = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const XDG_CONFIG = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const MENU_ENTRY = path.join(XDG_DATA, 'applications', 'stremio-plus.desktop');
const AUTOSTART_ENTRY = path.join(XDG_CONFIG, 'autostart', 'stremio-plus-agent.desktop');
const CLI = path.join(P.ROOT, 'bin', 'stremio-plus');

let cached;
const command = () => {
    if (cached !== undefined) return cached;
    const custom = process.env.STREMIO_PATH || readConfig().stremioPath;
    if (custom && fs.existsSync(custom)) cached = { cmd: custom, pre: [] };
    else if (has('flatpak') && run('flatpak', ['info', FLATPAK_ID]).ok) cached = { cmd: 'flatpak', pre: ['run', FLATPAK_ID] };
    else if (has('stremio')) cached = { cmd: 'stremio', pre: [] };
    else if (fs.existsSync('/opt/stremio/stremio')) cached = { cmd: '/opt/stremio/stremio', pre: [] };
    else cached = null;
    return cached;
};

const check = () => command() ? null
    : 'Stremio wasn\'t found (Flatpak com.stremio.Stremio or `stremio` on PATH). Get it from https://www.stremio.com/downloads';

const etime = (s) => {
    const [days, rest] = s.includes('-') ? s.split('-') : [0, s];
    return rest.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0) + Number(days) * 86400;
};

// The shell's own process (not its bundled streaming server, which runs under node).
const procs = () => run('ps', ['-eo', 'pid=,etime=,args=']).out.split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/))
    .filter((m) => m && /(^|\/)stremio(\s|$)/.test(m[3]) && !/server\.js/.test(m[3]))
    .map((m) => ({ pid: Number(m[1]), age: etime(m[2]), args: m[3] }));

const launch = (args) => {
    const c = command();
    const child = spawn(c.cmd, [...c.pre, ...args], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
};

const openModded = () => launch([`--webui-url=${P.UI_URL}`]);
const openStock = () => launch([]);
const focus = () => true;

const quit = async (pids) => {
    pids.forEach((pid) => { try { process.kill(pid, 'SIGTERM'); } catch {} });
    for (let i = 0; i < 40 && pids.some(alive); i++) await sleep(250);
    pids.filter(alive).forEach((pid) => { try { process.kill(pid, 'SIGKILL'); } catch {} });
    await sleep(500);
};

const desktopFile = (name, args, extra = '') => `[Desktop Entry]
Type=Application
Name=${name}
Comment=Stremio with the Stremio+ mods
Exec="${CLI}" ${args}
Icon=${FLATPAK_ID}
Terminal=false
Categories=AudioVideo;Video;Player;
${extra}`;

const enableAutostart = () => {
    fs.mkdirSync(path.dirname(AUTOSTART_ENTRY), { recursive: true });
    fs.writeFileSync(AUTOSTART_ENTRY, desktopFile('Stremio+ agent', 'daemon', 'NoDisplay=true\nX-GNOME-Autostart-enabled=true\n'));
    return true;
};
// Entries are per user, so another Stremio+ copy may own them: only touch the ones that point at this copy.
const ours = (file) => { try { return fs.readFileSync(file, 'utf8').includes(`Exec="${CLI}"`); } catch { return false; } };
const disableAutostart = () => { if (ours(AUTOSTART_ENTRY)) fs.rmSync(AUTOSTART_ENTRY, { force: true }); };
const autostartEnabled = () => ours(AUTOSTART_ENTRY);

const createShortcut = () => {
    fs.mkdirSync(path.dirname(MENU_ENTRY), { recursive: true });
    fs.writeFileSync(MENU_ENTRY, desktopFile('Stremio+', 'launch'));
    return MENU_ENTRY;
};
const removeShortcut = () => { if (ours(MENU_ENTRY)) fs.rmSync(MENU_ENTRY, { force: true }); };

module.exports = {
    name: 'Linux', check, procs, openModded, openStock, focus, quit, buildChrome: () => {},
    enableAutostart, disableAutostart, autostartEnabled, createShortcut, removeShortcut,
};
