// Holds the OBS WebSocket (protocol v5) for the YouTube Music tabs. It lives here
// and not in the content script because Chrome blocks web pages, and the content
// scripts running in them, from opening connections to 127.0.0.1.
const tabs = new Set(); // ports of open YouTube Music tabs
let cfg = null, ws = null, ready = false, retry = 0, delay = 1000, reqId = 0;

const sha = async s => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))));
const setStatus = state => chrome.storage.local.set({ status: { state, at: Date.now() } });

async function config() {
  const s = await chrome.storage.local.get(['port', 'password']);
  return { port: +s.port || 4455, password: s.password || '' };
}

async function connect() {
  clearTimeout(retry);
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  ready = false;
  if (!tabs.size) return setStatus('closed');
  cfg = await config();
  const sock = ws = new WebSocket('ws://127.0.0.1:' + cfg.port);
  sock.onmessage = async e => {
    const m = JSON.parse(e.data);
    if (m.op === 0) { // Hello
      const id = { rpcVersion: 1, eventSubscriptions: 0 }; // we only send
      const a = m.d.authentication;
      if (a) id.authentication = await sha(await sha(cfg.password + a.salt) + a.challenge);
      sock.send(JSON.stringify({ op: 1, d: id }));
    } else if (m.op === 2) { // Identified
      ready = true; delay = 1000; setStatus('connected');
      for (const p of tabs) p.postMessage('resend');
    }
  };
  sock.onclose = e => {
    if (ws !== sock) return;
    ready = false; ws = null;
    setStatus(e.code === 4009 ? 'wrong-password' : 'offline');
    retry = setTimeout(connect, delay = Math.min(delay * 2, 10000));
  };
}

function send(payload) {
  if (!ready || ws.bufferedAmount > 1 << 16) return; // OBS slow or gone: drop frames instead of piling up
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
  if (ch.port || ch.password) { delay = 1000; connect(); }
});
