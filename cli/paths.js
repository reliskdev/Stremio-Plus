// Shared locations for the Stremio+ CLI. Works both in a dev checkout (UI built into web/build) and in an
// installed copy (prebuilt UI shipped in ui/).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADDON = path.join(ROOT, 'addon');
const DATA = path.join(ADDON, 'data');
const WEB = path.join(ROOT, 'web');

module.exports = {
    ROOT,
    ADDON,
    DATA,
    WEB,
    LOG: path.join(DATA, 'server.log'),
    AGENT_LOG: path.join(DATA, 'agent.log'),
    SERVER_PID: path.join(DATA, 'server.pid'),
    DAEMON_PID: path.join(DATA, 'daemon.pid'),
    VANILLA_FLAG: path.join(DATA, '.vanilla'),
    CONFIG: path.join(DATA, 'config.json'),
    UI_URL: 'http://127.0.0.1:7011/',
    ADDON_URL: 'http://127.0.0.1:7010/',
    // A dev checkout has the stremio-web fork in web/; an installed copy doesn't.
    isDevCheckout: () => fs.existsSync(path.join(WEB, 'package.json')),
    version: () => {
        try { return require(path.join(ROOT, 'package.json')).version; } catch { return '0.0.0'; }
    },
};
