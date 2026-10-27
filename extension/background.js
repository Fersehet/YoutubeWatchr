// Holds the connection for the YouTube Music tabs and sends them on, either
// - to a YoutubeWatchr server (online with your key, or server.js on this computer), or
// - straight to OBS through OBS WebSocket (protocol v5), without any server.
// It lives here and not in the content script because Chrome blocks web pages, and the
// content scripts running in them, from opening connections to 127.0.0.1.
const tabs = new Set(); // ports of open YouTube Music tabs
let cfg = null, ws = null, ready = false, retry = 0, delay = 1000, reqId = 0;

const sha = async s => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))));
const setStatus = state => chrome.storage.local.set({ status: { state, at: Date.now() } });

async function config() {
  const s = await chrome.storage.local.get(['mode', 'server', 'key', 'port', 'password']);
  // Before the server mode existed the extension only spoke to OBS
  const mode = s.mode || (s.port || s.password ? 'obs' : 'server');
  return { mode, server: (s.server || '').trim().replace(/\/+$/, ''), key: (s.key || '').trim(), port: +s.port || 4455, password: s.password || '' };
}

async function connect() {
  clearTimeout(retry);
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  ready = false;
  if (!tabs.size) return setStatus('closed');
  cfg = await config();
  let url = 'ws://127.0.0.1:' + cfg.port;
  if (cfg.mode === 'server') {
    if (!/^https?:\/\/[^/]+/i.test(cfg.server)) return setStatus('no-server');
    url = cfg.server.replace(/^http/i, 'ws') + '/ws';
  }
  let sock;
  try { sock = ws = new WebSocket(url); } catch { return setStatus('no-server'); }
  sock.onopen = () => { if (cfg.mode === 'server') sock.send(JSON.stringify({ key: cfg.key })); };
  sock.onmessage = async e => {
    const m = JSON.parse(e.data);
    if (cfg.mode === 'server') {
      if (m.ok) online();
    } else if (m.op === 0) { // OBS Hello
      const id = { rpcVersion: 1, eventSubscriptions: 0 }; // we only send
      const a = m.d.authentication;
      if (a) id.authentication = await sha(await sha(cfg.password + a.salt) + a.challenge);
      sock.send(JSON.stringify({ op: 1, d: id }));
    } else if (m.op === 2) online(); // OBS Identified
  };
  sock.onclose = e => {
    if (ws !== sock) return;
    ready = false; ws = null;
    setStatus(e.code === 4009 ? 'wrong-password' : e.code === 4001 ? 'wrong-key' : 'offline');
    retry = setTimeout(connect, delay = Math.min(delay * 2, 10000));
  };
}

function online() {
  ready = true; delay = 1000; setStatus('connected');
  for (const p of tabs) p.postMessage('resend');
}

function send(payload) {
  if (!ready || ws.bufferedAmount > 1 << 16) return; // slow or gone: drop frames instead of piling up
  if (cfg.mode === 'server') return ws.send(JSON.stringify(payload));
  ws.send(JSON.stringify({ op: 6, d: {
    requestType: 'BroadcastCustomEvent', requestId: String(++reqId),
    requestData: { eventData: { ytw: 1, ...payload } },
  } }));
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'ytw') return;
  tabs.add(port);
  port.onMessage.addListener(send);
  port.onDisconnect.addListener(() => { tabs.delete(port); if (!tabs.size) connect(); });
  if (!ws) connect();
});

chrome.storage.onChanged.addListener(ch => {
  if (ch.mode || ch.server || ch.key || ch.port || ch.password) { delay = 1000; connect(); }
});
