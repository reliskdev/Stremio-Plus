// Windows: Stremio 5 (stremio-shell-ng.exe, WebView2) accepts --webui-url like the macOS app. It is single-instance
// (a second launch only forwards to the running window), so the stock instance has to exit before the modded one
// starts. Shortcuts and the login agent go through bin\hidden.vbs so no console window flashes up.
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../paths');
const { run, sleep, alive, readConfig, writeConfig } = require('../util');
const { spawn } = require('child_process');

const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const ROAMING = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const STARTMENU = path.join(ROAMING, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
const STARTUP = path.join(STARTMENU, 'Startup');
const AGENT_LNK = path.join(STARTUP, 'Stremio+ agent.lnk');
const MENU_LNK = path.join(STARTMENU, 'Stremio+.lnk');
const HIDDEN_VBS = path.join(P.ROOT, 'bin', 'hidden.vbs');

const CANDIDATES = [
    path.join(LOCAL, 'Programs', 'Stremio', 'stremio-shell-ng.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Stremio', 'stremio-shell-ng.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Stremio', 'stremio-shell-ng.exe'),
    path.join(LOCAL, 'Programs', 'LNV', 'Stremio-5', 'stremio-shell-ng.exe'),
    path.join(LOCAL, 'Programs', 'LNV', 'Stremio-4', 'stremio.exe'),
];

const ps = (script, env = {}) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { env: { ...process.env, ...env } });

// Ask the uninstall registry where Stremio lives (covers per-user and machine-wide installs in custom folders).
const fromRegistry = () => {
    const r = ps(`$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*';
Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Stremio*' } | ForEach-Object { $_.DisplayIcon; if ($_.InstallLocation) { Join-Path $_.InstallLocation 'stremio-shell-ng.exe' } }`);
    return r.out.split(/\r?\n/).map((l) => l.trim().replace(/^"|"$/g, '').replace(/,\d+$/, '').replace(/^"|"$/g, ''))
        .filter((p) => /stremio[^\\]*\.exe$/i.test(p));
};

let cachedExe = null;
const exe = () => {
    if (cachedExe) return cachedExe;
    const cfg = readConfig();
    const list = [process.env.STREMIO_PATH, cfg.stremioPath, ...CANDIDATES].filter(Boolean);
    let found = list.find((p) => fs.existsSync(p));
    if (!found) {
        found = fromRegistry().find((p) => fs.existsSync(p));
        if (found) writeConfig({ stremioPath: found });
    }
    cachedExe = found || null;
    return cachedExe;
};

const check = () => exe() ? null
    : 'Stremio isn\'t installed (or wasn\'t found). Get it from https://www.stremio.com/downloads, or set STREMIO_PATH to stremio-shell-ng.exe';

// tasklist is cheap enough to poll every second; the PowerShell CIM query that gives command lines is not, so it
// only runs when the set of Stremio pids changes.
let cache = { key: '', at: 0, list: [] };
const procs = () => {
    const file = exe();
    if (!file) return [];
    const name = path.basename(file);
    const pids = run('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/FO', 'CSV', '/NH']).out.split(/\r?\n/)
        .map((l) => l.match(/^"[^"]+","(\d+)"/)).filter(Boolean).map((m) => Number(m[1])).sort();
    const key = pids.join(',');
    if (key === cache.key) {
        const dt = (Date.now() - cache.at) / 1000;
        return cache.list.map((p) => ({ ...p, age: p.age + dt }));
    }
    let list = [];
    if (pids.length) {
        const r = ps(`Get-CimInstance Win32_Process -Filter "Name='${name}'" | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; args = $_.CommandLine; age = ((Get-Date) - $_.CreationDate).TotalSeconds } } | ConvertTo-Json -Compress`);
        try { list = [].concat(JSON.parse(r.out || '[]')).map((p) => ({ pid: p.pid, args: p.args || '', age: p.age })); } catch {}
    }
    cache = { key, at: Date.now(), list };
    return list;
};

const launch = (args) => {
    const child = spawn(exe(), args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
};

const openModded = () => launch([`--webui-url=${P.UI_URL}`]);
const openStock = () => launch([]);
const focus = () => launch([`--webui-url=${P.UI_URL}`]); // forwarded to the running window, which comes to front

const quit = async (pids) => {
    pids.forEach((pid) => run('taskkill', ['/PID', String(pid), '/T']));
    for (let i = 0; i < 16 && pids.some(alive); i++) await sleep(250);
    // Closing the window can send Stremio to the tray instead of exiting.
    pids.filter(alive).forEach((pid) => run('taskkill', ['/PID', String(pid), '/T', '/F']));
    for (let i = 0; i < 20 && pids.some(alive); i++) await sleep(250);
    await sleep(500);
};

const shortcut = (lnk, args, icon) => {
    const r = ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:SP_LNK)
$s.TargetPath = Join-Path $env:SystemRoot 'System32\\wscript.exe'
$s.Arguments = '"' + $env:SP_VBS + '" ' + $env:SP_ARGS
$s.WorkingDirectory = $env:SP_ROOT
if ($env:SP_ICON) { $s.IconLocation = $env:SP_ICON + ',0' }
$s.Description = 'Stremio with the Stremio+ mods'
$s.Save()`, { SP_LNK: lnk, SP_VBS: HIDDEN_VBS, SP_ARGS: args, SP_ROOT: P.ROOT, SP_ICON: icon || '' });
    if (!r.ok) throw new Error(`could not create ${lnk}: ${r.err}`);
};

const desktopDir = () => ps('[Environment]::GetFolderPath("Desktop")').out || path.join(os.homedir(), 'Desktop');

// Shortcuts are per user, so another Stremio+ copy may own them: only touch the ones that point at this copy.
const ours = (lnk) => {
    try {
        const buf = fs.readFileSync(lnk);
        return buf.includes(Buffer.from(HIDDEN_VBS, 'utf16le')) || buf.includes(Buffer.from(HIDDEN_VBS, 'latin1'));
    } catch { return false; }
};

const enableAutostart = () => { fs.mkdirSync(STARTUP, { recursive: true }); shortcut(AGENT_LNK, 'daemon', exe()); return true; };
const disableAutostart = () => { if (ours(AGENT_LNK)) fs.rmSync(AGENT_LNK, { force: true }); };
const autostartEnabled = () => ours(AGENT_LNK);

const createShortcut = () => {
    shortcut(MENU_LNK, 'launch', exe());
    const desk = path.join(desktopDir(), 'Stremio+.lnk');
    shortcut(desk, 'launch', exe());
    return `${MENU_LNK} and ${desk}`;
};

const removeShortcut = () => {
    [MENU_LNK, path.join(desktopDir(), 'Stremio+.lnk')].filter(ours).forEach((lnk) => fs.rmSync(lnk, { force: true }));
};

module.exports = {
    name: 'Windows', check, procs, openModded, openStock, focus, quit, buildChrome: () => {},
    enableAutostart, disableAutostart, autostartEnabled, createShortcut, removeShortcut,
};
