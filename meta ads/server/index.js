import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import routes from './routes.js';
import auth, { requireAuth, demoGuard } from './auth.js';
import { seedIfEmpty } from './seed.js';
import { Ad, Stat } from './models.js';
import { initCloudinary, uploadsDir, cloudinaryOn } from './media.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.set('trust proxy', 1); // behind Coolify's Traefik: needed for req.secure / req.ip
app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); next(); });
app.use(express.json({ limit: '1mb' }));
// a page on another site must not be able to make changes with the visitor's cookie
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: 'Forbidden' });
  next();
});
initCloudinary();
fs.mkdirSync(uploadsDir, { recursive: true });
// Uploaded media is served inertly: no sniffing, and a sandbox CSP in case a file is opened directly.
app.use('/uploads', express.static(uploadsDir, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  },
}));
// everything under /api needs the admin session, except the login endpoints and the health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', auth);
// at most 120 changes a minute per signed-in user + address (reads are not counted)
const hits = new Map();
const writeLimit = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const key = `${req.admin || ''}|${req.ip}`, now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset <= now) hits.set(key, { n: 1, reset: now + 60000 });
  else if (++h.n > 120) return res.status(429).json({ error: 'Too many changes in a minute - slow down a little.' });
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  next();
};
app.use('/api', requireAuth, writeLimit, demoGuard, routes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
// JSON errors for everything thrown outside route handlers (multer limits, bad JSON bodies...)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const brokenForm = /^(Multipart:|Unexpected end of form|Malformed part header|Boundary)/.test(err.message || '');
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.name === 'MulterError' || brokenForm ? 400 : err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 50 MB)' : brokenForm ? 'The upload was malformed' : status >= 500 ? 'Server error' : err.message });
});

const dist = path.join(root, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  // pages fall back to the app; a missing file (anything with an extension) is a real 404, not the app in disguise
  app.get('*', (req, res) => (path.extname(req.path) ? res.status(404).end() : res.sendFile(path.join(dist, 'index.html'))));
}

let uri = process.env.MONGO_URI;
if (!uri) {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  uri = (await MongoMemoryServer.create()).getUri();
  console.warn('MONGO_URI not set - using a temporary in-memory database (data resets on restart)');
}
await mongoose.connect(uri);
if (process.env.SEED_ON_EMPTY !== 'false') await seedIfEmpty();
{ // days left behind by anything deleted in the past (they would skew the "Maximum" date range)
  const ids = await Ad.distinct('_id');
  if (ids.length) { // never sweep when the ad list came back empty
    const gone = await Stat.deleteMany({ adId: { $nin: ids } });
    if (gone.deletedCount) console.log(`removed ${gone.deletedCount} orphan day rows`);
  }
}

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`API on :${port} - media: ${cloudinaryOn() ? 'cloudinary' : 'local disk'}`));
