// YoutubeWatchr server: passes the music from YouTube Music on to the OBS browser source.
// No dependencies: run with `node server.js` (Node 18+).
//
// Two ways to run it (see .env.example):
// - Online, with ADMIN_PASSWORD set: on your own server behind a reverse proxy. The editor needs a
//   login, the extension sends with a personal key and OBS loads https://your-domain/overlay/<key>.
// - Locally, without .env: on 127.0.0.1 for this computer only, no login, as before.
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./lib/config');
const { Auth } = require('./lib/auth');
const { Store } = require('./lib/store');
const ws = require('./lib/ws');

const { ROOT, online } = config;
const auth = online ? new Auth(path.join(config.dataDir, 'session-secret'), config.sessionSecret, { name: config.adminUser, password: config.adminPassword }) : null;
const store = online ? new Store(path.join(config.dataDir, 'users.json')) : null;
if (online) store.user(config.adminUser); // keys exist before the first login

// ---- channels: one per user online, a single one locally ---------------------------
const channels = new Map();
function channel(id) {
  if (!channels.has(id)) channels.set(id, { track: null, clients: new Set(), seen: 0 });
  return channels.get(id);
}
function broadcast(id, event, data) {
  const ch = channel(id);
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of ch.clients) res.write(msg);
}
function receive(id, msg) {
  const ch = channel(id);
  ch.seen = Date.now();
  if (msg.track && typeof msg.track === 'object') { ch.track = msg.track; broadcast(id, 'track', ch.track); }
  if (Array.isArray(msg.bands)) broadcast(id, 'bands', msg.bands.slice(0, 64));
}
const LOCAL = 'local';

// ---- helpers --------------------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

function sendFile(res, file, status = 200) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function redirect(res, to) {
  res.writeHead(302, { Location: to });
  res.end();
}
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}
function readBody(req, limit = 1e5) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Behind a reverse proxy (Nginx Proxy Manager, Docker): the real visitor IP for the
// login lockout and https detection for secure cookies. Only trusted from private addresses.
function isPrivate(ip) {
  return /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip) || ip === '::1' || /^f[cd]/i.test(ip);
}
function clientInfo(req) {
  const peer = req.socket.remoteAddress || '';
  const proxied = isPrivate(peer);
  const fwd = proxied && req.headers['x-forwarded-for'];
  req.ip = fwd ? fwd.split(',')[0].trim() : peer;
  req.secure = !!req.socket.encrypted || (proxied && req.headers['x-forwarded-proto'] === 'https');
}

// The page that sends the music: the extension, or the userscript on music.youtube.com.
function senderOrigin(origin) {
  return !origin || /^(chrome|moz|safari-web)-extension:\/\//.test(origin) || origin === 'https://music.youtube.com';
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return null; }
}

function sse(req, res, id) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx (and Nginx Proxy Manager): pass every event on right away
    'Access-Control-Allow-Origin': '*', // the editor opened as a file previews the local server
  });
  res.write('retry: 2000\n\n');
  const ch = channel(id);
  if (ch.track) res.write(`event: track\ndata: ${JSON.stringify(ch.track)}\n\n`);
  ch.clients.add(res);
  req.on('close', () => ch.clients.delete(res));
}

// The overlay at /overlay/<key> starts with the settings saved in the editor,
// unless the URL brings its own options.
function sendOverlay(res, saved) {
  let html = fs.readFileSync(path.join(ROOT, 'overlay.html'), 'utf8');
  if (saved !== undefined) html = html.replace('<script>', `<script>window.YTW_SAVED = ${JSON.stringify(saved).replace(/</g, '\\u003c')};</script>\n<script>`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function siteFile(pathname) {
  if (!fs.existsSync(path.join(config.siteDir, 'index.html'))) return null;
  const file = path.join(config.siteDir, decodeURIComponent(pathname).replace(/\/$/, '/index.html'));
  if (!file.startsWith(config.siteDir + path.sep)) return null;
  try { return fs.statSync(file).isFile() ? file : null; } catch { return null; }
}

const LOGIN_ERRORS = {
  disabled: [503, 'Login is not set up on this server (ADMIN_PASSWORD is missing in .env).'],
  locked: [429, 'Too many attempts. Please try again in 15 minutes.'],
  wrong: [401, 'Wrong user name or password.'],
};

function account(name) {
  const u = store.user(name);
  return { user: name, overlayKey: u.overlayKey, sendKey: u.sendKey, editor: u.editor, live: Date.now() - channel(name.toLowerCase()).seen < 5000 };
}

// ---- routes ---------------------------------------------------------------------------
async function handle(req, res) {
  clientInfo(req);
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const get = req.method === 'GET' || req.method === 'HEAD';

  // Music in from the userscript (the extension uses /ws). Online it needs the key.
  if (p === '/update') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.end();
    if (req.method !== 'POST') return notFound(res);
    if (!senderOrigin(req.headers.origin)) { res.statusCode = 403; return res.end('forbidden'); }
    const id = online ? store.bySendKey((req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '') : LOCAL;
    if (!id) { res.statusCode = 401; return res.end('wrong key'); }
    try { receive(id, await readBody(req)); res.end('ok'); } catch { res.statusCode = 400; res.end('bad json'); }
    return;
  }

  if (p === '/favicon.svg' || p === '/favicon.ico') return sendFile(res, path.join(ROOT, 'docs', 'logo', 'favicon.svg'));
  if (p === '/logo.svg') return sendFile(res, path.join(ROOT, 'docs', 'logo', 'logo.svg'));

  // ---- local: everything on 127.0.0.1, no login -------------------------------------
  if (!online) {
    if (p === '/events') return sse(req, res, LOCAL);
    if (p === '/editor') return sendFile(res, path.join(ROOT, 'editor.html'));
    if (p === '/login.html') return redirect(res, '/editor');
    if (p === '/' || p === '/overlay.html') return sendFile(res, path.join(ROOT, 'overlay.html'));
    if (p === '/api/me') return json(res, 200, { online: false });
    return notFound(res);
  }

  // ---- online: public routes ----------------------------------------------------------
  const user = auth.user(req);
  let m;
  if (get && (m = p.match(/^\/overlay\/([\w-]+)(\/events)?$/))) {
    const id = store.byOverlayKey(m[1]);
    if (!id) return notFound(res);
    if (m[2]) return sse(req, res, id);
    return sendOverlay(res, store.data[id].query || '');
  }
  if (get && p === '/overlay.html') return sendFile(res, path.join(ROOT, 'overlay.html'));
  if (get && p === '/login.html') return sendFile(res, path.join(ROOT, 'login.html'));
  if (p === '/api/me') return json(res, 200, { online: true, user, loginEnabled: auth.enabled });
  if (p === '/api/login' && req.method === 'POST') {
    let body = {};
    try { body = await readBody(req, 4096); } catch {}
    const error = auth.login(req, res, String(body.user || ''), String(body.password || ''));
    if (error) return json(res, LOGIN_ERRORS[error][0], { error: LOGIN_ERRORS[error][1] });
    return json(res, 200, { ok: true });
  }
  if (p === '/api/logout' && req.method === 'POST') {
    auth.logout(res);
    res.statusCode = 204;
    return res.end();
  }
  // Optional start page (SITE_DIR), e.g. the YoutubeWatchr website
  if (get) {
    const file = siteFile(p);
    if (file) return sendFile(res, file);
  }

  // ---- online: only after login ---------------------------------------------------------
  if (!user) {
    if (p.startsWith('/api/')) return json(res, 401, { error: 'Please sign in' });
    if (get && (p === '/' || p === '/editor')) return redirect(res, '/login.html?next=' + encodeURIComponent('/editor'));
    return notFound(res);
  }
  // Changes only from our own pages, not from other sites in the same browser
  const origin = req.headers.origin;
  if (!get && origin && hostOf(origin) !== req.headers.host) return json(res, 403, { error: 'Foreign origin' });

  if (get && (p === '/' || p === '/editor.html')) return redirect(res, '/editor');
  if (get && p === '/editor') return sendFile(res, path.join(ROOT, 'editor.html'));
  if (get && p === '/api/account') return json(res, 200, account(user));

  // The editor saves the overlay settings; open overlays reload with them right away.
  if (p === '/api/settings' && req.method === 'PUT') {
    let body;
    try { body = await readBody(req, 2e4); } catch { return json(res, 400, { error: 'Bad request' }); }
    const query = String(body.query || '').replace(/^\?/, '');
    if (query.length > 4000) return json(res, 400, { error: 'Too long' });
    const before = store.user(user).query;
    store.update(user, { query, editor: body.editor && typeof body.editor === 'object' ? body.editor : null });
    if (query !== before) broadcast(user.toLowerCase(), 'settings', query);
    return json(res, 200, { ok: true });
  }

  // New key: the old OBS URL or extension key stops working right away.
  if (p === '/api/keys' && req.method === 'POST') {
    let body = {};
    try { body = await readBody(req, 1000); } catch {}
    const which = body.which === 'overlay' ? 'overlay' : 'send';
    store.renew(user, which);
    const id = user.toLowerCase();
    if (which === 'overlay') { for (const c of channel(id).clients) c.end(); channel(id).clients.clear(); }
    else for (const s of senders) if (s.id === id) s.ws.close(4001);
    return json(res, 200, account(user));
  }

  notFound(res);
}

// ---- the extension streams the music over a WebSocket ---------------------------------
// First message: {"key": "..."} (online) or anything (local). Then {track} / {bands} messages.
const senders = new Set();
function onUpgrade(req, socket) {
  clientInfo(req);
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws' || !senderOrigin(req.headers.origin)) return socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  const sock = ws.accept(req, socket);
  if (!sock) return;
  const entry = { ws: sock, id: null };
  const hello = setTimeout(() => sock.close(4001), 10000);
  sock.onmessage = text => {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!entry.id) {
      entry.id = online ? store.bySendKey(String(msg.key || '')) : LOCAL;
      clearTimeout(hello);
      if (!entry.id) return sock.close(4001); // wrong key
      senders.add(entry);
      return sock.send(JSON.stringify({ ok: true }));
    }
    receive(entry.id, msg);
  };
  sock.onclose = () => { clearTimeout(hello); senders.delete(entry); };
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) { res.statusCode = 500; res.end(); }
  });
});
server.on('upgrade', onUpgrade);
server.listen(config.port, config.host, () => {
  if (online) {
    console.log(`YoutubeWatchr is running online: http://localhost:${config.port}/editor`);
    console.log(`Sign in as "${config.adminUser}" with the password from .env.`);
  } else {
    console.log(`YoutubeWatchr is running locally: add http://127.0.0.1:${config.port}/ as an OBS Browser Source`);
    console.log(`Customize it in the editor: http://127.0.0.1:${config.port}/editor`);
  }
});

// Keep SSE connections alive through idle periods (and through proxies that close idle connections).
setInterval(() => {
  for (const ch of channels.values()) for (const res of ch.clients) res.write(': ping\n\n');
}, 15000);
