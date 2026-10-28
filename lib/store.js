// Per-user data for the online server, kept in data/users.json:
// the keys for the overlay and the extension, and the saved overlay settings.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const newKey = n => crypto.randomBytes(n).toString('base64url');

class Store {
  constructor(file) {
    this.file = file;
    try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.data = {}; }
  }

  /** The user's entry, created with fresh keys on first use. */
  user(name) {
    const id = name.toLowerCase();
    if (!this.data[id]) {
      this.data[id] = { overlayKey: newKey(9), sendKey: newKey(18), query: '', editor: null };
      this.save();
    }
    return this.data[id];
  }

  byOverlayKey(key) {
    return Object.keys(this.data).find(id => this.data[id].overlayKey === key) || null;
  }

  bySendKey(key) {
    const k = Buffer.from(String(key));
    return Object.keys(this.data).find(id => {
      const s = Buffer.from(this.data[id].sendKey);
      return s.length === k.length && crypto.timingSafeEqual(s, k);
    }) || null;
  }

  update(name, fields) {
    Object.assign(this.user(name), fields);
    this.save();
    return this.user(name);
  }

  /** New key: the old OBS URL or extension key stops working. */
  renew(name, which) {
    return this.update(name, which === 'overlay' ? { overlayKey: newKey(9) } : { sendKey: newKey(18) });
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
