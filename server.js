// Tiny relay between the YT Music userscript and the OBS browser source.
// No dependencies: run with `node server.js` (Node 18+).
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8974;
const clients = new Set();
let track = null; // last known track info, replayed to new overlays

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();

  if (req.method === 'POST' && req.url === '/update') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        if (msg.track) { track = msg.track; broadcast('track', track); }
        if (msg.bands) broadcast('bands', msg.bands);
        res.end('ok');
      } catch { res.statusCode = 400; res.end('bad json'); }
    });
    return;
  }

  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    if (track) res.write(`event: track\ndata: ${JSON.stringify(track)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.url === '/editor' || req.url.startsWith('/editor?')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return fs.createReadStream(path.join(__dirname, 'editor.html')).pipe(res);
  }

  if (req.url === '/' || req.url.startsWith('/?')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return fs.createReadStream(path.join(__dirname, 'overlay.html')).pipe(res);
  }

  res.statusCode = 404;
  res.end();
}).listen(PORT, '127.0.0.1', () => {
  console.log(`YT Music overlay running: add http://127.0.0.1:${PORT}/ as an OBS Browser Source`);
  console.log(`Customize it in the editor: http://127.0.0.1:${PORT}/editor`);
});

// Keep SSE connections alive through idle periods.
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 15000);
