const $ = id => document.getElementById(id);
const fields = ['server', 'key', 'port', 'password'];
const box = $('status'), text = $('statusText');
// The same languages as the editor, picked by the browser's language. English otherwise.
const T = {
  en: {
    sendTo: 'Send the music to', server: 'Server address', key: 'Key', keyPh: 'From the editor, under Connection',
    serverHint: 'Both are in the YoutubeWatchr editor under Connection. For the server on this computer, use <b>http://127.0.0.1:8974</b> and leave the key empty.',
    port: 'OBS WebSocket port', password: 'Password', passwordPh: 'Empty if authentication is off',
    obsHint: 'No server needed. Find both in OBS under Tools → WebSocket Server Settings.',
    saved: 'Changes are saved right away.', open: 'Open YouTube Music',
    connectedServer: 'Connected to the server', connectedObs: 'Connected to OBS',
    offlineServer: 'Server not reachable. Check the address.', offlineObs: 'OBS not reachable. Is OBS open with the WebSocket server on?',
    wrongPassword: 'Wrong password', wrongKey: 'Wrong key. Copy it again from the editor.', noServer: 'Enter the server address',
  },
  de: {
    sendTo: 'Musik senden an', server: 'Serveradresse', key: 'Schlüssel', keyPh: 'Aus dem Editor, unter Verbindung',
    serverHint: 'Beides steht im YoutubeWatchr-Editor unter Verbindung. Für den Server auf diesem Computer nimm <b>http://127.0.0.1:8974</b> und lass den Schlüssel leer.',
    port: 'Port des OBS-WebSockets', password: 'Passwort', passwordPh: 'Leer, wenn die Authentifizierung aus ist',
    obsHint: 'Kein Server nötig. Beides findest du in OBS unter Werkzeuge → WebSocket-Servereinstellungen.',
    saved: 'Änderungen werden sofort gespeichert.', open: 'YouTube Music öffnen',
    connectedServer: 'Mit dem Server verbunden', connectedObs: 'Mit OBS verbunden',
    offlineServer: 'Server nicht erreichbar. Prüfe die Adresse.', offlineObs: 'OBS nicht erreichbar. Ist OBS offen und der WebSocket-Server an?',
    wrongPassword: 'Falsches Passwort', wrongKey: 'Falscher Schlüssel. Kopiere ihn noch einmal aus dem Editor.', noServer: 'Serveradresse eintragen',
  },
  ru: {
    sendTo: 'Куда отправлять музыку', server: 'Адрес сервера', key: 'Ключ', keyPh: 'Из редактора, раздел «Подключение»',
    serverHint: 'Оба значения есть в редакторе YoutubeWatchr в разделе «Подключение». Для сервера на этом компьютере укажи <b>http://127.0.0.1:8974</b> и оставь ключ пустым.',
    port: 'Порт OBS WebSocket', password: 'Пароль', passwordPh: 'Пусто, если аутентификация выключена',
    obsHint: 'Сервер не нужен. Оба значения есть в OBS: Сервис → Настройки сервера WebSocket.',
    saved: 'Изменения сохраняются сразу.', open: 'Открой YouTube Music',
    connectedServer: 'Подключено к серверу', connectedObs: 'Подключено к OBS',
    offlineServer: 'Сервер недоступен. Проверь адрес.', offlineObs: 'OBS недоступен. OBS открыт и сервер WebSocket включён?',
    wrongPassword: 'Неверный пароль', wrongKey: 'Неверный ключ. Скопируй его из редактора ещё раз.', noServer: 'Введи адрес сервера',
  },
  fr: {
    sendTo: 'Envoyer la musique vers', server: 'Adresse du serveur', key: 'Clé', keyPh: 'Dans l\'éditeur, sous Connexion',
    serverHint: 'Les deux se trouvent dans l\'éditeur YoutubeWatchr, sous Connexion. Pour le serveur sur cet ordinateur, utilise <b>http://127.0.0.1:8974</b> et laisse la clé vide.',
    port: 'Port du WebSocket OBS', password: 'Mot de passe', passwordPh: 'Vide si l\'authentification est désactivée',
    obsHint: 'Pas besoin de serveur. Les deux se trouvent dans OBS : Outils → Paramètres du serveur WebSocket.',
    saved: 'Les changements sont enregistrés tout de suite.', open: 'Ouvre YouTube Music',
    connectedServer: 'Connecté au serveur', connectedObs: 'Connecté à OBS',
    offlineServer: 'Serveur injoignable. Vérifie l\'adresse.', offlineObs: 'OBS injoignable. OBS est-il ouvert avec le serveur WebSocket activé ?',
    wrongPassword: 'Mot de passe incorrect', wrongKey: 'Clé incorrecte. Copie-la de nouveau depuis l\'éditeur.', noServer: 'Saisis l\'adresse du serveur',
  },
};
const lang = navigator.language.slice(0, 2);
const t = key => (Object.hasOwn(T, lang) ? T[lang] : T.en)[key];
document.documentElement.lang = Object.hasOwn(T, lang) ? lang : 'en';
document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
document.querySelectorAll('[data-i18n-aria-label]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)));
const LABELS = {
  connected: { server: t('connectedServer'), obs: t('connectedObs') },
  offline: { server: t('offlineServer'), obs: t('offlineObs') },
  'wrong-password': t('wrongPassword'),
  'wrong-key': t('wrongKey'),
  'no-server': t('noServer'),
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
  text.textContent = !label ? t('open') : typeof label === 'string' ? label : label[mode];
}
