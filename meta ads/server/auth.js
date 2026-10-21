import crypto from 'crypto';
import express from 'express';
import { AsyncLocalStorage } from 'async_hooks';

export const actor = new AsyncLocalStorage(); // lets history logging know who made the change

// Accounts come from the environment (passwords are hashed in memory with scrypt, never stored in the DB):
//   ADMIN_EMAIL, ADMIN_PASSWORD  full access
//   DEMO_EMAIL,  DEMO_PASSWORD   optional shareable demo login: everything except deleting data
//   SESSION_SECRET               signs the session cookie; if unset a random one is used and sessions reset on restart
const COOKIE = 'ma_session';
const TTL = 7 * 24 * 3600 * 1000;

const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const salt = crypto.randomBytes(16);
const accounts = [];
const addAccount = (email, password, role) => {
  if (email && password) {
    const e = email.trim().toLowerCase();
    accounts.push({ email: e, role, name: role === 'demo' ? 'User' : 'Admin', hash: crypto.scryptSync(password, salt, 64), fp: crypto.createHmac('sha256', secret).update(`${role}|${e}|${password}`).digest('hex').slice(0, 16) });
  }
};
let adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  adminPassword = crypto.randomBytes(9).toString('base64url');
  console.warn(`ADMIN_PASSWORD not set - generated one for this run: ${adminPassword}  (login: ${process.env.ADMIN_EMAIL || 'admin@adsmanager.demo'})`);
}
addAccount(process.env.ADMIN_EMAIL || 'admin@adsmanager.demo', adminPassword, 'admin');
addAccount(process.env.DEMO_EMAIL, process.env.DEMO_PASSWORD, 'demo');
adminPassword = null;
const dummy = crypto.scryptSync('x', salt, 64);

const sign = (data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

function makeToken(email, role, v) {
  const payload = Buffer.from(JSON.stringify({ e: email, r: role, v, exp: Date.now() + TTL })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
const parts = (token) => { const p = String(token || '').split('.'); return p.length === 2 && p[0] && p[1] ? p : null; }; // exactly payload.signature
function readToken(token) {
  const p = parts(token);
  if (!p) return null;
  const [payload, sig] = p;
  if (!safeEqual(Buffer.from(sig), Buffer.from(sign(payload)))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return d.exp > Date.now() ? d : null;
  } catch { return null; }
}
const cookies = (header = '') => Object.fromEntries(header.split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter((p) => p[0]));
const live = (d) => d && accounts.find((a) => a.email === d.e && a.role === d.r && a.fp === d.v);
const revoked = new Map(); // signature -> expiry; stops a copied cookie working after logout
const sweep = () => { const now = Date.now(); for (const [t, exp] of revoked) if (exp < now) revoked.delete(t); };
export const sessionOf = (req) => { const t = cookies(req.headers.cookie)[COOKIE]; const p = parts(t); if (!p || revoked.has(p[1])) return null; const d = readToken(t); return live(d) ? d : null; };

export function requireAuth(req, res, next) {
  const s = sessionOf(req);
  if (!s) return res.status(401).json({ error: 'Please log in' });
  req.admin = s.e;
  req.role = s.r || 'admin';
  req.actorName = live(s).name;
  actor.run({ email: s.e, name: req.actorName }, next);
}

// endpoints that only the admin account may call (the admin panel's inline editing)
export function requireAdmin(req, res, next) {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

// The shareable demo account is view-only apart from what the main site still offers: the Off/On switch and Create.
// Default-deny: anything not listed here (editing, duplicating, daily data, uploads onto existing ads, deleting) needs the admin.
const onlyStatus = (b) => b && typeof b === 'object' && !Array.isArray(b) && Object.keys(b).length === 1 && (b.status === 'on' || b.status === 'off');
export function demoGuard(req, res, next) {
  if (req.role !== 'demo') return next();
  const m = req.method;
  if (m === 'GET' || m === 'HEAD') return next();
  let p = req.path.toLowerCase(); // routing ignores case and a trailing slash, so do the same here (linear scan: no regex backtracking)
  if (p.length > 200) return res.status(404).json({ error: 'Not found' });
  let end = p.length;
  while (end > 1 && p.charCodeAt(end - 1) === 47) end--;
  p = p.slice(0, end);
  if (m === 'POST' && /^\/entities\/(campaign|adset|ad)$/.test(p)) return next();
  if (m === 'PATCH' && /^\/entities\/(campaign|adset|ad)\/[^/]+$/.test(p) && onlyStatus(req.body)) return next();
  return res.status(403).json({ error: "You don't have permission to make this change." });
}

// crude brute-force guard: 8 failed attempts per IP per 10 minutes
// 8 failures per address and 40 per account in 10 minutes (the account cap stops guesses spread over many addresses).
// A successful login deliberately does NOT clear the address counter: the demo login is shared, so anyone could
// otherwise log in with it between guesses and start the count again.
const fails = new Map();
const over = (key, max) => { const f = fails.get(key); return !!f && f.reset > Date.now() && f.count >= max; };
const bump = (key) => { const f = fails.get(key); if (!f || f.reset <= Date.now()) fails.set(key, { count: 1, reset: Date.now() + 600000 }); else f.count++; };
const blocked = (ip, email) => over('ip:' + ip, 8) || over('acct:' + email, 40);
const fail = (ip, email) => {
  bump('ip:' + ip); bump('acct:' + email);
  if (fails.size > 5000) { const now = Date.now(); for (const [k, v] of fails) if (v.reset <= now) fails.delete(k); }
};

const cookieOpts = (req, maxAge) =>
  `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${req.secure ? '; Secure' : ''}`;

const router = express.Router();

router.post('/login', (req, res) => {
  const ip = req.ip;
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
  if (blocked(ip, email)) { res.setHeader('Retry-After', '600'); return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' }); }
  const password = String(req.body?.password || '');
  if (password.length > 256 || email.length > 254) return res.status(400).json({ error: 'The email or password you entered is incorrect.' });
  // always run the hash so timing does not reveal whether the email exists
  const given = crypto.scryptSync(password, salt, 64);
  void dummy;
  const acct = accounts.find((x) => x.email === email);
  if (!acct || !safeEqual(given, acct.hash)) {
    fail(ip, email);
    return res.status(401).json({ error: 'The email or password you entered is incorrect.' });
  }
  if (req.body?.adminOnly === true && acct.role !== 'admin') return res.status(403).json({ error: 'This account does not have admin access. Log in with the admin account.' });
  res.setHeader('Set-Cookie', `${COOKIE}=${makeToken(acct.email, acct.role, acct.fp)}; ${cookieOpts(req, TTL)}`);
  res.json({ email: acct.email, role: acct.role });
});

router.post('/logout', (req, res) => {
  const site = req.headers['sec-fetch-site']; // a page on another site must not be able to log people out
  if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: 'Forbidden' });
  const t = cookies(req.headers.cookie)[COOKIE];
  const d = readToken(t);
  const p = parts(t);
  if (p && d) { revoked.set(p[1], d.exp); sweep(); }
  res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieOpts(req, 0)}`);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const s = sessionOf(req);
  if (!s) return res.json({ email: null }); // logged out is a normal answer (no 401 noise in the console)
  res.json({ email: s.e, role: s.r || 'admin' });
});

export default router;
