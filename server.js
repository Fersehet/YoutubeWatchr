// YoutubeWatchr server: passes the music from YouTube Music on to the OBS browser source.
// No dependencies: run with `node server.js` (Node 18+). It only listens on this computer.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ws = require('./lib/ws');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8974;
const HOST = process.env.HOST || '127.0.0.1';

// ---- the music: last song for new overlays, everything else passed straight on ----------
let track = null;
const clients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
function receive(msg) {
  if (msg.track && typeof msg.track === 'object') { track = msg.track; broadcast('track', track); }
  if (Array.isArray(msg.bands)) broadcast('bands', msg.bands.slice(0, 64));
}

// ---- helpers --------------------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };

function sendFile(res, file) {
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
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

// The page that sends the music: the extension, or the userscript on music.youtube.com.
function senderOrigin(origin) {
  return !origin || /^(chrome|moz|safari-web)-extension:\/\//.test(origin) || origin === 'https://music.youtube.com';
}

function sse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*', // the editor opened as a file previews the local server
  });
  res.write('retry: 2000\n\n');
  if (track) res.write(`event: track\ndata: ${JSON.stringify(track)}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

// ---- routes ---------------------------------------------------------------------------
async function handle(req, res) {
  const p = new URL(req.url, 'http://x').pathname;

  // Music in from the userscript (the extension uses /ws)
  if (p === '/update') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.end();
    if (req.method !== 'POST') return notFound(res);
    if (!senderOrigin(req.headers.origin)) { res.statusCode = 403; return res.end('forbidden'); }
    try { receive(await readBody(req)); res.end('ok'); } catch { res.statusCode = 400; res.end('bad json'); }
    return;
  }

  if (p === '/favicon.svg' || p === '/favicon.ico') return sendFile(res, path.join(ROOT, 'docs', 'logo', 'favicon.svg'));
  if (p === '/logo.svg') return sendFile(res, path.join(ROOT, 'docs', 'logo', 'logo.svg'));
  if (p === '/events') return sse(req, res);
  if (p === '/editor') return sendFile(res, path.join(ROOT, 'editor.html'));
  if (p === '/' || p === '/overlay.html') return sendFile(res, path.join(ROOT, 'overlay.html'));
  notFound(res);
}

// ---- the extension streams the music over a WebSocket ---------------------------------
// After a first hello message come {track} / {bands} messages.
function onUpgrade(req, socket) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws' || !senderOrigin(req.headers.origin)) return socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
  const sock = ws.accept(req, socket);
  if (!sock) return;
  let hello = false;
  sock.onmessage = text => {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!hello) { hello = true; return sock.send(JSON.stringify({ ok: true })); }
    receive(msg);
  };
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) { res.statusCode = 500; res.end(); }
  });
});
server.on('upgrade', onUpgrade);
server.listen(PORT, HOST, () => {
  console.log(`YoutubeWatchr is running: add http://127.0.0.1:${PORT}/ as an OBS Browser Source`);
  console.log(`Customize it in the editor: http://127.0.0.1:${PORT}/editor`);
});

// Keep SSE connections alive through idle periods.
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 15000);
