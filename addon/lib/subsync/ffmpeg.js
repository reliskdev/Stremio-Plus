// Finds ffmpeg / ffprobe (Stremio bundles both next to its streaming server) and decodes audio windows as
// 16 kHz mono s16le. Input seeking (-ss before -i) means only the bytes around each window are fetched, so a
// torrent served by Stremio's streaming server doesn't need to be downloaded in full.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RATE = 16000;
const EXE = process.platform === 'win32' ? '.exe' : '';

function candidates(name) {
  const home = os.homedir();
  const dirs = [];
  if (process.env.STREMIO_PLUS_FFMPEG_DIR) dirs.push(process.env.STREMIO_PLUS_FFMPEG_DIR);
  if (process.platform === 'darwin') {
    dirs.push('/Applications/Stremio.app/Contents/MacOS', path.join(home, 'Applications/Stremio.app/Contents/MacOS'));
  } else if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    dirs.push(path.join(local, 'Programs', 'Stremio'), path.join(local, 'Programs', 'LNV', 'Stremio-5'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Stremio'));
  } else {
    dirs.push('/opt/stremio', '/usr/share/stremio', '/usr/lib/stremio');
  }
  return dirs.map((d) => path.join(d, name + EXE));
}

const found = {};
function locate(name) {
  if (found[name] !== undefined) return found[name];
  let hit = candidates(name).find((p) => fs.existsSync(p)) || null;
  if (!hit) {
    try {
      execFileSync(name + EXE, ['-version'], { stdio: 'ignore', timeout: 5000 });
      hit = name + EXE; // on PATH
    } catch { /* not installed */ }
  }
  found[name] = hit;
  return hit;
}

// Network inputs only: no file://, concat:, subfile: etc. from a URL someone passed in.
const PROTOCOLS = ['-protocol_whitelist', 'http,https,tcp,tls,crypto,httpproxy'];

function run(bin, args, { timeout = 120000, binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${path.basename(bin)} timed out`)); }, timeout);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { if (err.length < 4000) err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`${path.basename(bin)} exited ${code}: ${err.trim().split('\n').pop()}`));
      const buf = Buffer.concat(out);
      resolve(binary ? buf : buf.toString('utf8'));
    });
  });
}

async function probeDuration(url) {
  const bin = locate('ffprobe');
  if (!bin) throw new Error('ffprobe not found (Stremio not installed?)');
  const out = await run(bin, ['-v', 'error', ...PROTOCOLS, '-show_entries', 'format=duration', '-of', 'csv=p=0', url], { timeout: 60000 });
  const d = parseFloat(out);
  if (!(d > 0)) throw new Error('could not read the stream duration');
  return d;
}

// → Int16Array of mono 16 kHz samples for [start, start + length).
async function decodeWindow(url, start, length) {
  const bin = locate('ffmpeg');
  if (!bin) throw new Error('ffmpeg not found (Stremio not installed?)');
  const buf = await run(bin, ['-v', 'error', ...PROTOCOLS, '-ss', String(start), '-t', String(length), '-i', url,
    '-vn', '-sn', '-dn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'], { binary: true });
  return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2));
}

module.exports = { RATE, locate, probeDuration, decodeWindow };
