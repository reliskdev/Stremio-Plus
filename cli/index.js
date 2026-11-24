#!/usr/bin/env node
// Stremio+ CLI (macOS, Windows, Linux). Run through bin/stremio-plus (macOS/Linux) or bin\stremio-plus.cmd (Windows).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./paths');
const { sleep, run, ping, getJson, alive, readPid, stamp, readConfig, writeConfig } = require('./util');
const patcher = require('./patch');

const platform = (() => {
    try { return require(`./platform/${process.platform}`); } catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND') throw e;
        console.error(`Stremio+ doesn't support ${process.platform} yet.`);
        process.exit(1);
    }
})();

const HELP = `Stremio+ ${P.version()} (${platform.name})

  stremio-plus launch      start the server (if needed) and open Stremio with the mods  [default]
  stremio-plus vanilla     reopen Stremio with its normal UI (the agent leaves it alone until the next launch)
  stremio-plus enable      login agent: server always on, Stremio always opens with the mods
  stremio-plus disable     remove the login agent
  stremio-plus start|stop|restart   control the server (addon :7010 + UI :7011)
  stremio-plus patch       make Stremio itself open with the mods (any launch: Dock, Spotlight, links)
  stremio-plus restore     undo the patch: put the original Stremio files back
  stremio-plus logs        follow the server log
  stremio-plus shortcut    (re)create the Stremio+ launcher (app / Start menu / desktop entry)
  stremio-plus setup       install dependencies and the launcher (run by the installer)
  stremio-plus uninstall   remove the launcher and agent${P.isDevCheckout() ? '' : ', then this copy of Stremio+'}
  stremio-plus version
${P.isDevCheckout() ? `
  development:
  stremio-plus build       rebuild the modded UI (web/) into web/build
  stremio-plus apply       build, restart the server, relaunch Stremio
  stremio-plus test [step] screenshot the UI in a headless browser (tools/ui-test)
` : ''}`;

const requireStremio = () => {
    const problem = platform.check();
    if (problem) { console.error(problem); process.exit(1); }
};

// ---------- server ----------

const serverUp = () => ping(`${P.ADDON_URL}manifest.json`);

const start = async ({ quiet = false } = {}) => {
    if (await serverUp()) { if (!quiet) console.log('server already running'); return; }
    if (!fs.existsSync(path.join(P.ADDON, 'node_modules'))) await npmInstall();
    fs.mkdirSync(P.DATA, { recursive: true });
    const log = fs.openSync(P.LOG, 'a');
    const child = spawn(process.execPath, ['server.js'], {
        cwd: P.ADDON, detached: true, windowsHide: true, stdio: ['ignore', log, log],
    });
    fs.writeFileSync(P.SERVER_PID, String(child.pid));
    child.unref();
    for (let i = 0; i < 40; i++) {
        if (await serverUp()) { if (!quiet) console.log('server started (addon :7010, UI :7011)'); return; }
        await sleep(200);
    }
    throw new Error(`server failed to start; see ${P.LOG}`);
};

// Only ever stop our own server: another Stremio+ copy (a dev checkout next to an install) may own the ports.
const stop = async ({ quiet = false } = {}) => {
    let pid = readPid(P.SERVER_PID);
    const info = await getJson(`${P.UI_URL}__stremio-plus`);
    if (info && path.resolve(info.root) === path.resolve(P.ADDON)) pid = info.pid;
    else if (info) {
        if (!quiet) console.log(`the running server belongs to another Stremio+ copy (${path.dirname(info.root)}); leaving it alone`);
        pid = null;
    } else if (!pid && P.isDevCheckout() && process.platform !== 'win32' && await serverUp()) {
        run('pkill', ['-f', 'node server.js']); // a server from before the CLI rewrite (no pid file, no info route)
        pid = -1;
    }
    if (pid > 0 && alive(pid)) { try { process.kill(pid); } catch {} }
    fs.rmSync(P.SERVER_PID, { force: true });
    if (pid) for (let i = 0; i < 25 && await serverUp(); i++) await sleep(200);
    if (!quiet) console.log(pid ? 'server stopped' : 'server not running');
};

const npmInstall = () => new Promise((resolve, reject) => {
    // Use the npm that ships with the node running us (the installer may have downloaded a private copy).
    const dir = path.dirname(process.execPath);
    const local = path.join(dir, process.platform === 'win32' ? 'npm.cmd' : 'npm');
    const npm = fs.existsSync(local) ? local : 'npm';
    console.log('installing server dependencies…');
    const child = spawn(`"${npm}" install --omit=dev --no-audit --no-fund --no-update-notifier --loglevel=error`, {
        cwd: P.ADDON, stdio: 'inherit', shell: true, env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` },
    });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`npm install failed (exit ${code})`)));
    child.on('error', reject);
});

// ---------- Stremio ----------

const isModded = (p) => p.args.includes('--webui-url');
const patched = () => patcher.status() === 'patched';

// Patched Stremio loads the mods by itself (see cli/patch.js); otherwise it is launched with --webui-url.
const launch = async () => {
    requireStremio();
    const wasVanilla = fs.existsSync(P.VANILLA_FLAG);
    fs.rmSync(P.VANILLA_FLAG, { force: true });
    await start();
    const list = platform.procs();
    if (patched()) {
        // A window still showing stock (vanilla) or the old --webui-url origin has to reload into the patched UI.
        if (list.length && !wasVanilla && !list.some(isModded)) { platform.focus(); return; }
        if (list.length) await platform.quit(list.map((p) => p.pid));
        platform.openPatched();
        return;
    }
    if (list.some(isModded)) { platform.focus(); return; }
    if (list.length) await platform.quit(list.map((p) => p.pid));
    platform.openModded();
};

const vanilla = async () => {
    requireStremio();
    fs.mkdirSync(P.DATA, { recursive: true });
    fs.writeFileSync(P.VANILLA_FLAG, '');
    const list = platform.procs();
    if (list.length) await platform.quit(list.map((p) => p.pid));
    platform.openStock();
};

// ---------- patch ----------

const patch = async () => {
    requireStremio();
    const running = platform.procs();
    console.log(patcher.patch());
    writeConfig({ patch: true });
    if (running.length) {
        console.log('restarting Stremio to load the patch…');
        await launch();
    }
};

const restore = async () => {
    const running = platform.procs();
    writeConfig({ patch: false }); // first, so the agent doesn't re-patch while files are being put back
    console.log(patcher.restore());
    if (running.length) {
        await platform.quit(running.map((p) => p.pid));
        platform.openStock();
    }
};

// ---------- login agent ----------

const agentLog = (msg) => {
    const line = `${stamp()} ${msg}\n`;
    // launchd already sends the agent's stdout to agent.log; elsewhere nobody is listening.
    if (process.platform === 'darwin') process.stdout.write(line);
    else fs.appendFileSync(P.AGENT_LOG, line);
};

// Files whose change should reload a long-running agent, so it never keeps running stale launch code.
const watched = () => [
    path.join(P.ROOT, 'bin', 'stremio-plus'),
    ...fs.readdirSync(__dirname).filter((f) => f.endsWith('.js')).map((f) => path.join(__dirname, f)),
    path.join(__dirname, 'platform', `${process.platform}.js`),
].filter((f) => fs.existsSync(f));
const fingerprint = () => watched().map((f) => fs.statSync(f).mtimeMs).join(',');

const restartDaemon = () => {
    fs.rmSync(P.DAEMON_PID, { force: true });
    if (platform.restartDaemon) return platform.restartDaemon();
    spawn(process.execPath, [__filename, 'daemon'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    process.exit(0);
};

const daemon = async () => {
    const other = readPid(P.DAEMON_PID);
    if (other && other !== process.pid && alive(other)) { agentLog(`agent already running (pid ${other})`); return; }
    fs.mkdirSync(P.DATA, { recursive: true });
    fs.writeFileSync(P.DAEMON_PID, String(process.pid));
    process.on('exit', () => { if (readPid(P.DAEMON_PID) === process.pid) fs.rmSync(P.DAEMON_PID, { force: true }); });
    agentLog('agent started');
    const print = fingerprint();
    for (;;) {
        // A failed step must never stop the agent (on macOS launchd would restart it and kill the server with it).
        try {
            if (fingerprint() !== print) { agentLog('CLI changed; reloading agent'); restartDaemon(); }
            if (!await serverUp()) await start({ quiet: true });
            // A Stremio update replaces the patched files: patch the new version (unless the user restored).
            if (patcher.supported() && readConfig().patch !== false && patcher.status() === 'stock') {
                try { agentLog(patcher.patch()); writeConfig({ patch: true }); } catch (e) { agentLog(`patch failed: ${e.message}`); }
            }
            // Patched Stremio needs no swapping; only unpatched launches get closed and reopened with --webui-url.
            if (!patched() && !fs.existsSync(P.VANILLA_FLAG) && !platform.check()) {
                const stock = platform.procs().find((p) => !isModded(p) && p.age < 20);
                if (stock) {
                    agentLog(`stock Stremio opened (pid ${stock.pid}); reopening with the mods`);
                    await platform.quit([stock.pid]);
                    let ok = false;
                    for (let attempt = 1; attempt <= 6 && !ok; attempt++) {
                        // LaunchServices refuses to open an app that is still shutting down (error -600): retry.
                        ok = platform.openModded();
                        if (ok) agentLog(`reopened with the mods (attempt ${attempt})`);
                        else await sleep(1000);
                    }
                    if (!ok) agentLog('could not reopen Stremio');
                    await sleep(5000);
                }
            }
        } catch (e) {
            agentLog(`error: ${e.message}`);
        }
        await sleep(1000);
    }
};

const stopDaemon = async () => {
    if (platform.stopAutostart) platform.stopAutostart();
    const pid = readPid(P.DAEMON_PID);
    if (pid && alive(pid)) { try { process.kill(pid); } catch {} }
    for (let i = 0; i < 20 && pid && alive(pid); i++) await sleep(100);
    fs.rmSync(P.DAEMON_PID, { force: true });
};

const enable = async () => {
    requireStremio();
    await stopDaemon();
    platform.enableAutostart();
    if (process.platform !== 'darwin') {
        spawn(process.execPath, [__filename, 'daemon'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    console.log('agent enabled: the server runs at login and Stremio always opens with the mods');
};

const disable = async () => {
    platform.disableAutostart();
    await stopDaemon();
    console.log('agent disabled');
};

// ---------- install / uninstall ----------

const shortcut = () => {
    requireStremio();
    console.log(`launcher: ${platform.createShortcut()}`);
};

const setup = async () => {
    await npmInstall(); // cheap when nothing changed; picks up new dependencies after an update
    platform.buildChrome();
    const problem = platform.check();
    if (problem) {
        console.warn(`\n${problem}\nInstall Stremio, then run: stremio-plus shortcut`);
    } else {
        shortcut();
        let agent = platform.autostartEnabled();
        if (patcher.supported() && readConfig().patch !== false) {
            try {
                console.log(patcher.patch());
                writeConfig({ patch: true });
                agent = true; // a patched Stremio needs the server up whenever it opens (it falls back to stock otherwise)
            } catch (e) {
                console.warn(`couldn't patch Stremio (${e.message}); the Stremio+ launcher still opens it with the mods`);
            }
        }
        if (agent) await enable();
    }
};

const halt = async () => { await stopDaemon(); await stop({ quiet: true }); };

const uninstall = async () => {
    await halt();
    if (patcher.status() === 'patched') console.log(patcher.restore());
    platform.disableAutostart();
    platform.removeShortcut();
    console.log('removed the launcher and login agent');
    if (P.isDevCheckout() || fs.existsSync(path.join(P.ROOT, '.git'))) {
        console.log(`left ${P.ROOT} in place (development checkout)`);
        return;
    }
    if (process.platform === 'win32') {
        // Our own node.exe may live inside the folder; delete it once we have exited.
        spawn('cmd.exe', ['/c', `ping -n 3 127.0.0.1 >nul & rmdir /s /q "${P.ROOT}"`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else {
        fs.rmSync(P.ROOT, { recursive: true, force: true });
    }
    console.log(`deleted ${P.ROOT}`);
};

// ---------- development ----------

const devOnly = () => {
    if (!P.isDevCheckout()) { console.error('this command needs a development checkout with web/ (the stremio-web fork)'); process.exit(1); }
};

const build = () => new Promise((resolve, reject) => {
    devOnly();
    const child = spawn('npx webpack --mode production', {
        cwd: P.WEB, shell: true, env: { ...process.env, SERVICE_WORKER_DISABLED: 'true' },
    });
    let buf = '';
    const filter = (d) => {
        buf += d;
        const lines = buf.split('\n');
        buf = lines.pop();
        lines.filter((l) => /ERROR|Module not found|compiled/.test(l)).forEach((l) => console.log(l));
    };
    child.stdout.on('data', filter);
    child.stderr.on('data', filter);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`build failed (exit ${code})`)));
});

const apply = async () => {
    await build();
    platform.buildChrome();
    await stop({ quiet: true });
    await start();
    const list = platform.procs();
    if (list.length) await platform.quit(list.map((p) => p.pid));
    await launch();
};

const test = async (step) => {
    devOnly();
    await start({ quiet: true });
    await new Promise((resolve) => spawn(process.execPath, ['test.js', step || 'all'], {
        cwd: path.join(P.ROOT, 'tools', 'ui-test'), stdio: 'inherit',
    }).on('exit', resolve));
};

const logs = () => {
    if (!fs.existsSync(P.LOG)) { console.log(`no log yet (${P.LOG})`); return; }
    const text = fs.readFileSync(P.LOG, 'utf8');
    process.stdout.write(text.split('\n').slice(-40).join('\n'));
    let pos = fs.statSync(P.LOG).size;
    fs.watchFile(P.LOG, { interval: 500 }, (cur) => {
        if (cur.size < pos) pos = 0;
        if (cur.size === pos) return;
        const stream = fs.createReadStream(P.LOG, { start: pos, end: cur.size - 1 });
        stream.pipe(process.stdout, { end: false });
        pos = cur.size;
    });
};

// ---------- main ----------

const COMMANDS = {
    launch, vanilla, enable, disable, daemon, start, stop,
    restart: async () => { await stop({ quiet: true }); await start(); },
    logs, shortcut, setup, uninstall, halt, build, apply, test, patch, restore,
    status: () => console.log(`Stremio: ${patcher.status()}`),
    version: () => console.log(P.version()),
    help: () => console.log(HELP),
};

const [cmd = 'launch', ...args] = process.argv.slice(2);
const fn = COMMANDS[cmd];
if (!fn) { console.log(HELP); process.exit(1); }
Promise.resolve(fn(...args)).catch((e) => { console.error(e.message || e); process.exit(1); });
