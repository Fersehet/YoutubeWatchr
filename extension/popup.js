const port = document.getElementById('port'), password = document.getElementById('password');
const box = document.getElementById('status'), text = document.getElementById('statusText');
const LABELS = {
  connected: 'Connected to OBS',
  offline: 'OBS not reachable. Is OBS open with the WebSocket server on?',
  'wrong-password': 'Wrong password',
};

chrome.storage.local.get(['port', 'password', 'status'], s => {
  port.value = s.port || '';
  password.value = s.password || '';
  show(s.status);
});
chrome.storage.onChanged.addListener(ch => { if (ch.status) show(ch.status.newValue); });

let timer = 0;
for (const el of [port, password]) el.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => chrome.storage.local.set({ port: +port.value || 4455, password: password.value }), 400);
});

function show(s) {
  // The YouTube Music tab reports its state. While it can't reach OBS it retries
  // (and reports) at least every 10 s, so an older report means the tab is gone.
  const live = s && s.state !== 'closed' && (s.state === 'connected' || Date.now() - s.at < 15000);
  box.className = 'status ' + (live ? s.state : '');
  text.textContent = live ? LABELS[s.state] : 'Open YouTube Music';
}
