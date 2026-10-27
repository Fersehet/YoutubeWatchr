const $ = id => document.getElementById(id);
const fields = ['server', 'key', 'port', 'password'];
const box = $('status'), text = $('statusText');
const LABELS = {
  connected: { server: 'Connected to the server', obs: 'Connected to OBS' },
  offline: { server: 'Server not reachable. Check the address.', obs: 'OBS not reachable. Is OBS open with the WebSocket server on?' },
  'wrong-password': 'Wrong password',
  'wrong-key': 'Wrong key',
  'no-server': 'Enter the server address',
};
let mode = 'server';

chrome.storage.local.get(['mode', ...fields, 'status'], s => {
  mode = s.mode || (s.port || s.password ? 'obs' : 'server');
  $('server').value = s.server || '';
  $('key').value = s.key || '';
  $('port').value = s.port || '';
  $('password').value = s.password || '';
  showMode();
  show(s.status);
});
chrome.storage.onChanged.addListener(ch => { if (ch.status) show(ch.status.newValue); });

document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  mode = b.dataset.mode;
  showMode();
  chrome.storage.local.set({ mode });
});

let timer = 0;
for (const id of fields) $(id).addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => chrome.storage.local.set({
    mode, server: $('server').value.trim(), key: $('key').value.trim(), port: +$('port').value || 4455, password: $('password').value,
  }), 400);
});

function showMode() {
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
  $('server-box').hidden = mode !== 'server';
  $('obs-box').hidden = mode !== 'obs';
}

function show(s) {
  // The YouTube Music tab reports its state. While it can't connect it retries
  // (and reports) at least every 10 s, so an older report means the tab is gone.
  const live = s && s.state !== 'closed' && (s.state === 'connected' || s.state === 'no-server' || Date.now() - s.at < 15000);
  box.className = 'status ' + (live ? s.state : '');
  const label = live && LABELS[s.state];
  text.textContent = !label ? 'Open YouTube Music' : typeof label === 'string' ? label : label[mode];
}
