// Login for the editor, the same way as in FaceitWatchr: one account from the .env,
// stored so that more can be added later. The session is signed into the cookie,
// so a restart signs nobody out.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COOKIE = 'ytw_session';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

class Auth {
  constructor(secretFile, secretFromEnv, admin) {
    this.users = new Map();
    this.fails = new Map();
    if (admin.password) this.users.set(admin.name.toLowerCase(), hashUser(admin.name, admin.password));
    // The password goes into the key: changing it signs everyone out
    const secret = secretFromEnv || loadOrCreateSecret(secretFile);
    this.key = crypto.createHmac('sha256', secret).update(admin.password).digest();
  }

  get enabled() {
    return this.users.size > 0;
  }

  /** Signed-in user name, or null. */
  user(req) {
    const raw = readCookie(req, COOKIE);
    if (!raw) return null;
    const [payload, sig] = raw.split('.');
    if (!payload || !sig || !safeEqual(Buffer.from(sig), Buffer.from(this.sign(payload)))) return null;
    try {
      const { u, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (typeof u !== 'string' || typeof exp !== 'number' || exp < Date.now() / 1000) return null;
      return this.users.has(u.toLowerCase()) ? this.users.get(u.toLowerCase()).name : null;
    } catch {
      return null;
    }
  }

  /** Checks the credentials and sets the cookie. Returns why it failed, or null. */
  login(req, res, name, password) {
    if (!this.enabled) return 'disabled';
    const ip = req.ip;
    const now = Date.now();
    const entry = this.fails.get(ip);
    if (entry && entry.until > now && entry.count >= MAX_FAILS) return 'locked';

    const user = this.users.get(name.trim().toLowerCase());
    // Hash even for unknown names so the response time gives nothing away
    const hash = crypto.scryptSync(password, user ? user.salt : Buffer.alloc(16), 32);
    if (!user || !safeEqual(hash, user.hash)) {
      const fresh = !entry || entry.until <= now;
      this.fails.set(ip, { count: fresh ? 1 : entry.count + 1, until: fresh ? now + FAIL_WINDOW_MS : entry.until });
      return 'wrong';
    }
    this.fails.delete(ip);

    const payload = Buffer.from(JSON.stringify({ u: user.name, exp: Math.floor(now / 1000) + MAX_AGE_SECONDS })).toString('base64url');
    setCookie(res, `${COOKIE}=${payload}.${this.sign(payload)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`);
    return null;
  }

  logout(res) {
    setCookie(res, `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
  }

  sign(payload) {
    return crypto.createHmac('sha256', this.key).update(payload).digest('base64url');
  }
}

function hashUser(name, password) {
  const salt = crypto.randomBytes(16);
  return { name, salt, hash: crypto.scryptSync(password, salt, 32) };
}

function safeEqual(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function loadOrCreateSecret(file) {
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setCookie(res, value) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, value) : value);
}

module.exports = { Auth, safeEqual };
