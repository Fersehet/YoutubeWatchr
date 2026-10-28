// Settings from the environment or a .env file next to server.js.
// Without ADMIN_PASSWORD the server runs locally as before: no login, only on 127.0.0.1.
// With ADMIN_PASSWORD it runs online: the editor needs a login and the music needs a key.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Variables that are already set (e.g. by Docker) win over the file.
function loadEnv(file) {
  if (!fs.existsSync(file)) return false;
  const raw = fs.readFileSync(file);
  // Windows editors sometimes save UTF-16 or add a BOM
  const text = (raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8')).replace(/^﻿/, '');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return true;
}
loadEnv(path.join(ROOT, '.env'));

const env = process.env;
const online = !!env.ADMIN_PASSWORD;

module.exports = {
  ROOT,
  online,
  port: Number(env.PORT) || 8974,
  // Online: reachable from the network and from Docker. Local: only this computer.
  host: env.HOST || (online ? '0.0.0.0' : '127.0.0.1'),
  dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
  // Optional folder with a start page for / (e.g. the YoutubeWatchr website). Without it, / leads to the editor.
  siteDir: path.resolve(ROOT, env.SITE_DIR || 'website'),
  adminUser: (env.ADMIN_USER || 'admin').trim(),
  adminPassword: env.ADMIN_PASSWORD || '',
  sessionSecret: (env.SESSION_SECRET || '').trim(),
};
