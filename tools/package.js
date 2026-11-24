#!/usr/bin/env node
// Builds the release tarball dist/stremio-plus.tar.gz that install.sh / install.ps1 download:
// the addon server, the CLI, the prebuilt modded UI (ui/) and, on macOS, a universal window-chrome dylib.
//   node tools/package.js            build the UI, then package
//   node tools/package.js --no-build package the current web/build as is
//   node tools/package.js --release  also publish it as a GitHub release (needs the gh CLI, logged in)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const P = require('../cli/paths');

const args = process.argv.slice(2);
const DIST = path.join(P.ROOT, 'dist');
const STAGE = path.join(DIST, 'stremio-plus');
const TARBALL = path.join(DIST, 'stremio-plus.tar.gz');
const REPO = 'reliskdev/Stremio-Plus';

const sh = (cmd, cmdArgs, opts = {}) => {
    const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });
    if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} failed`);
};

const copy = (from, to, filter = () => true) => fs.cpSync(path.join(P.ROOT, from), path.join(STAGE, to || from), {
    recursive: true, filter: (src) => filter(src) && !src.endsWith('.DS_Store'),
});

if (!P.isDevCheckout()) throw new Error('run this from a development checkout (needs web/)');
if (!args.includes('--no-build')) sh(process.execPath, [path.join(P.ROOT, 'cli', 'index.js'), 'build']);
const BUILD = path.join(P.WEB, 'build');
if (!fs.existsSync(path.join(BUILD, 'index.html'))) throw new Error('no web/build; run bin/stremio-plus build');

if (process.platform === 'darwin') {
    require('../cli/platform/darwin').buildChrome(true);
    const lipo = spawnSync('lipo', ['-archs', path.join(P.ROOT, 'shell', 'build', 'libstremio-plus-chrome.dylib')], { encoding: 'utf8' });
    console.log(`chrome dylib: ${(lipo.stdout || 'missing').trim()}`);
} else {
    console.warn('not on macOS: the package will have no prebuilt window-chrome dylib');
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
const ADDON_SKIP = new Set(['node_modules', 'data', 'test']);
copy('addon', 'addon', (src) => !ADDON_SKIP.has(path.relative(path.join(P.ROOT, 'addon'), src).split(path.sep)[0]));
copy('cli');
copy('bin');
copy('shell/chrome.m');
copy('shaders');
if (fs.existsSync(path.join(P.ROOT, 'shell', 'build'))) copy('shell/build');
copy('web/build', 'ui', (src) => !src.endsWith('.map'));
['package.json', 'README.md', 'install.sh', 'install.ps1'].forEach((f) => copy(f));

// Make the dylib newer than its source after extraction, so installs never try to recompile it.
const lib = path.join(STAGE, 'shell', 'build', 'libstremio-plus-chrome.dylib');
if (fs.existsSync(lib)) { const t = new Date(Date.now() + 60000); fs.utimesSync(lib, t, t); }

// COPYFILE_DISABLE keeps macOS tar from adding ._ AppleDouble files.
sh('tar', ['-czf', TARBALL, '-C', DIST, 'stremio-plus'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
const mb = (fs.statSync(TARBALL).size / 1e6).toFixed(1);
console.log(`\n${path.relative(P.ROOT, TARBALL)} (${mb} MB), version ${P.version()}`);

if (args.includes('--release')) {
    const tag = `v${P.version()}`;
    sh('gh', ['release', 'create', tag, TARBALL, '--repo', REPO, '--title', `Stremio+ ${tag}`, '--generate-notes']);
} else {
    console.log(`Publish: gh release create v${P.version()} dist/stremio-plus.tar.gz --repo ${REPO}`);
    console.log('   (or upload it on GitHub → Releases; the installers fetch releases/latest/download/stremio-plus.tar.gz)');
}
