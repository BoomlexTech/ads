import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Campaign, AdGroup, Ad, Stat, History, Feedback } from './models.js';
import { seed, topUp, upgradeData, DATA_START } from './seed.js';
import { registerEditing, getAccount, publicAccount } from './editing.js';
import { registerCreative, ensureSampleAssets, fileInUse, defaultCreative, sampleLibrary, EDIT_FORMATS } from './creative.js';
import { registerSamples } from './samples.js';
import { registerWhenWhere, ensureWhenWhere, resetWhenWhere } from './whenwhere.js';
import { errorReply } from './errors.js';
import multer from 'multer';
import { initCloudinary, saveMedia, deleteMedia, uploadsDir, cloudinaryOn, MAX_MEDIA_BYTES } from './media.js';
import { BASE_METRICS, sumRows } from '../shared/metrics.js';
import { todayISO, addDays, isISO, daysBetween, parseISO, toISO } from '../shared/dates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 3000);
const MEMORY_DB = process.env.MEMORY_DB === '1';

// ---- Accounts (environment only, never in code) ----
// ADMIN_ENABLED=0 serves the viewer site only: no admin login, /admin and edit APIs are off.
const ADMIN_ENABLED = process.env.ADMIN_ENABLED !== '0';
const ACCOUNTS = [
  ...(ADMIN_ENABLED ? [{ role: 'admin', user: process.env.ADMIN_USERNAME, pass: process.env.ADMIN_PASSWORD }] : []),
  { role: 'viewer', user: process.env.VIEWER_USERNAME, pass: process.env.VIEWER_PASSWORD },
];
for (const a of ACCOUNTS) {
  if (!a.user || !a.pass) {
    const p = a.role.toUpperCase();
    console.error(`Missing ${p}_USERNAME / ${p}_PASSWORD environment variables`);
    process.exit(1);
  }
}
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function safeEq(a, b) {
  const A = crypto.createHash('sha256').update(String(a)).digest();
  const B = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(A, B);
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "sandbox; default-src 'none'");
  },
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MEDIA_BYTES, files: 1 } });

const failures = new Map();
function tooMany(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.at > 15 * 60e3) return false;
  return f.n >= 10;
}

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (tooMany(ip)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  const { username = '', password = '' } = req.body || {};
  let role = null;
  for (const a of ACCOUNTS) {
    const ok = safeEq(username, a.user) & safeEq(password, a.pass);
    if (ok && !role) role = a.role;
  }
  if (!role) {
    const f = failures.get(ip) || { n: 0, at: Date.now() };
    failures.set(ip, { n: f.n + 1, at: f.at });
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  failures.delete(ip);
  const token = jwt.sign({ role, user: username }, JWT_SECRET, { expiresIn: '12h' });
  res.cookie('sess', token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 12 * 3600e3 });
  res.json({ role, user: username });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('sess');
  res.json({ ok: true });
});

function auth(req, res, next) {
  try {
    req.session = jwt.verify(req.cookies.sess || '', JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sign in required' });
  }
}
function adminOnly(req, res, next) {
  if (!ADMIN_ENABLED) return res.status(404).json({ error: 'Not found' });
  if (req.session?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

app.get('/api/health', (req, res) => {
  const db = mongoose.connection.readyState === 1;
  res.status(db ? 200 : 503).json({ ok: db, db: db ? 'connected' : 'down' });
});

app.get('/api/me', auth, (req, res) => res.json({ role: req.session.role, user: req.session.user }));

// ---- Aggregation helpers (empty values are excluded; all-empty -> null) ----
async function sumsBy(field, match) {
  const g = { _id: field ? '$' + field : null };
  for (const m of BASE_METRICS) {
    g[m] = { $sum: '$' + m };
    g[m + '_n'] = { $sum: { $cond: [{ $gt: ['$' + m, null] }, 1, 0] } };
  }
  const out = await Stat.aggregate([{ $match: match }, { $group: g }]);
  return out.map((o) => {
    const r = { key: o._id == null ? null : String(o._id) };
    for (const m of BASE_METRICS) r[m] = o[m + '_n'] ? o[m] : null;
    return r;
  });
}
const empty = () => Object.fromEntries(BASE_METRICS.map((m) => [m, null]));
// Totals over per-ad sums; each ad's format and campaign type feed the sub-totals
// that some formulas need (video-only Avg. CPV, Demand Gen platform-comparable columns).
function combine(perAd, meta) {
  return sumRows(perAd.map((s) => ({ ...s, ...meta.get(s.key) })));
}
const TYPE_ORDER = ['Search', 'Video', 'Demand Gen', 'Display'];
// Segment > Time on the tables: first and last day of the day / week (Monday start) / month /
// quarter / year holding a date.
const SEGMENT_KINDS = ['day', 'week', 'month', 'quarter', 'year'];
function periodOf(kind, iso) {
  const d = parseISO(iso);
  if (kind === 'day') return [iso, iso];
  if (kind === 'week') {
    const start = addDays(iso, -((d.getDay() + 6) % 7));
    return [start, addDays(start, 6)];
  }
  const span = kind === 'month' ? 1 : kind === 'quarter' ? 3 : 12;
  const first = kind === 'year' ? 0 : Math.floor(d.getMonth() / span) * span;
  return [toISO(new Date(d.getFullYear(), first, 1)), toISO(new Date(d.getFullYear(), first + span, 0))];
}
function validRange(from, to) {
  return isISO(from) && isISO(to) && from <= to && daysBetween(from, to) <= 3700;
}

app.get('/api/report', auth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!validRange(from, to)) return res.status(400).json({ error: 'Bad date range' });
    // Optional scope: one campaign and/or one of its ad groups (ids compared as hex strings).
    const scope = {};
    for (const [key, label] of [['campaignId', 'campaign'], ['adGroupId', 'ad group']]) {
      const v = req.query[key];
      if (!v) continue;
      if (typeof v !== 'string' || !/^[0-9a-f]{24}$/i.test(v)) return res.status(400).json({ error: `Bad ${label}` });
      scope[key] = new mongoose.Types.ObjectId(v);
    }
    const campaignId = scope.campaignId && String(scope.campaignId);
    const adGroupId = scope.adGroupId && String(scope.adGroupId);
    // Optional view: only campaigns of one type (Search, Video, ...).
    const { campaignType } = req.query;
    if (campaignType !== undefined && !TYPE_ORDER.includes(campaignType)) return res.status(400).json({ error: 'Bad campaign type' });
    const { segment } = req.query;
    if (segment !== undefined && !SEGMENT_KINDS.includes(segment)) return res.status(400).json({ error: 'Bad segment' });
    if (campaignId && adGroupId) {
      const g = await AdGroup.findById(scope.adGroupId, { campaignId: 1 }).lean();
      if (String(g?.campaignId) !== campaignId) return res.status(400).json({ error: 'That ad group isn’t in this campaign' });
    }
    const len = daysBetween(from, to) + 1;
    const pFrom = addDays(from, -len);
    const pTo = addDays(from, -1);
    const range = { date: { $gte: from, $lte: to } };
    if (campaignType) {
      const ids = (await Campaign.find({ type: campaignType }, { _id: 1 }).lean()).map((c) => c._id);
      scope.campaignId = scope.campaignId ? (ids.some((id) => String(id) === campaignId) ? scope.campaignId : { $in: [] }) : { $in: ids };
    }
    const [campaigns, groups, allAds, perAdAll, perAdPrev, series] = await Promise.all([
      Campaign.find().sort({ order: 1 }).lean(),
      AdGroup.find().sort({ _id: 1 }).lean(),
      Ad.find().sort({ order: 1 }).lean(),
      sumsBy('adId', range),
      sumsBy('adId', { date: { $gte: pFrom, $lte: pTo }, ...scope }),
      sumsBy('date', { ...range, ...scope }),
    ]);
    // An ad never opened in the edit page shows the same starting images the edit page does.
    const library = allAds.some((a) => EDIT_FORMATS.includes(a.format) && !a.media?.url && !a.creative?.images?.length) ? await sampleLibrary() : null;
    const cById = new Map(campaigns.map((c) => [String(c._id), c]));
    const meta = new Map(allAds.map((a) => [String(a._id), {
      format: a.format, campaignType: cById.get(String(a.campaignId))?.type, campaignId: String(a.campaignId), adGroupId: String(a.adGroupId),
    }]));
    const inScope = (id) => {
      const m = meta.get(id);
      return (!campaignId || m?.campaignId === campaignId) && (!adGroupId || m?.adGroupId === adGroupId)
        && (!campaignType || m?.campaignType === campaignType);
    };
    const ads = allAds.filter((a) => inScope(String(a._id)));
    const perAd = perAdAll.filter((s) => inScope(s.key));
    const current = combine(perAd, meta);
    const previous = combine(perAdPrev, meta);
    const account = combine(perAdAll, meta);
    const types = TYPE_ORDER.filter((t) => campaigns.some((c) => c.type === t));
    const byType = types.map((type) => ({ type, ...combine(perAdAll.filter((s) => meta.get(s.key)?.campaignType === type), meta) }));
    const gById = new Map(groups.map((g) => [String(g._id), g]));
    const sById = new Map(perAd.map((s) => [s.key, s]));
    // The table thumbnail: the row's own media, else the ad's first image (or uploaded video).
    const rowMedia = (a) => {
      if (a.media?.url) return { url: a.media.url, type: a.media.type };
      const img = a.creative?.images?.find((i) => i?.url);
      if (img) return { url: img.url, type: 'image' };
      const vid = a.creative?.videos?.find((v) => v?.url && !/youtu\.?be/.test(v.url));
      if (vid) return { url: vid.url, type: 'video' };
      const first = EDIT_FORMATS.includes(a.format) && !a.creative ? defaultCreative(a, '', library).images[0] : null;
      return first?.url ? { url: first.url, type: 'image' } : null;
    };
    const rows = ads.map((a) => {
      const s = sById.get(String(a._id)) || empty();
      const c = cById.get(String(a.campaignId));
      return {
        id: String(a._id), name: a.name, format: a.format, adType: a.adType, status: a.status,
        headlines: a.headlines, extraCounts: a.extraCounts, mediaCount: a.mediaCount, hue: a.hue,
        strength: a.strength, eligibility: a.eligibility, reasons: a.reasons, videoTitle: a.videoTitle,
        displayUrl: a.displayUrl, description: a.description, adGroupId: String(a.adGroupId), media: rowMedia(a), campaign: a.campaignLabel || c?.name, campaignId: String(a.campaignId), campaignStatus: c?.status,
        campaignType: c?.type, adGroup: a.adGroupLabel || gById.get(String(a.adGroupId))?.name,
        ...Object.fromEntries(BASE_METRICS.map((m) => [m, s[m]])),
      };
    });
    // Per-ad sums for each period of the range (Segment > Time), periods cut to the range.
    let segments;
    if (segment) {
      const g = { _id: { adId: '$adId', date: '$date' } };
      for (const m of BASE_METRICS) {
        g[m] = { $sum: '$' + m };
        g[m + '_n'] = { $sum: { $cond: [{ $gt: ['$' + m, null] }, 1, 0] } };
      }
      const daily = await Stat.aggregate([{ $match: { ...range, ...scope } }, { $group: g }]);
      const by = new Map();
      for (const o of daily) {
        const adId = String(o._id.adId);
        if (!inScope(adId)) continue;
        const [start, end] = periodOf(segment, o._id.date);
        const key = `${adId}|${start}`;
        if (!by.has(key)) by.set(key, { adId, from: start < from ? from : start, to: end > to ? to : end, ...empty() });
        const e = by.get(key);
        for (const m of BASE_METRICS) if (o[m + '_n']) e[m] = (e[m] ?? 0) + o[m];
      }
      segments = [...by.values()];
    }
    res.json({
      today: todayISO(), dataStart: DATA_START,
      campaigns: campaigns.map((c) => ({
        id: String(c._id), name: c.name, status: c.status, type: c.type, budget: c.budget ?? null,
        statusLabel: c.statusLabel || '', statusReasons: c.statusReasons || [], optimizationScore: c.optimizationScore ?? null,
      })),
      // Every ad group (not narrowed by the scope), for the pickers and status bars.
      adGroups: groups.map((g) => ({
        id: String(g._id), name: g.name, status: g.status || 'enabled', statusLabel: g.statusLabel || '',
        statusReasons: g.statusReasons || [], targetCpa: g.targetCpa ?? null, groupType: g.groupType || '', campaignId: String(g.campaignId),
      })),
      rows, totals: { current, previous, account, byType },
      series: series.map((s) => ({ date: s.key, ...Object.fromEntries(BASE_METRICS.map((m) => [m, s[m]])) }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
      previousRange: { from: pFrom, to: pTo },
      ...(segments && { segments }),
    });
  } catch (e) { next(e); }
});

// ---- Admin editing (numbers, text, account): see server/editing.js ----
app.get('/api/account', auth, async (req, res, next) => {
  try { res.json(publicAccount(await getAccount())); } catch (e) { next(e); }
});
registerEditing(app, { auth, adminOnly, validRange, upload, saveMedia, deleteMedia });
// Display ad edit page content + asset library (server/creative.js); built-in sample art (public).
registerCreative(app, { auth, adminOnly, upload, saveMedia, deleteMedia, getAccount });
registerSamples(app);
// Insights and reports > When and where ads showed: its own data (server/whenwhere.js).
registerWhenWhere(app, { auth, adminOnly, validRange });

// Admin: replace an ad's preview image/video (Cloudinary when configured, else local disk).
app.post('/api/ads/:id/media', auth, adminOnly, upload.single('media'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Ad not found' });
    const ad = await Ad.findById(req.params.id);
    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    if (!req.file) return res.status(400).json({ error: 'Choose a file' });
    const saved = await saveMedia(req.file);
    const old = ad.media?.publicId ? { ...ad.media.toObject?.() ?? ad.media } : null;
    ad.media = saved;
    await ad.save();
    // The old upload may also be one of the ad's images (edit page), another ad's or in the library.
    if (old && old.publicId !== saved.publicId && !(await fileInUse(old.url))) await deleteMedia(old);
    const camp = await Campaign.findById(ad.campaignId).lean();
    await History.create({
      user: req.session.user, level: 'Ad', entityName: `${ad.name} (${camp?.name ?? ''})`, column: 'Media',
      before: old?.url ? 'Custom ' + (old.type || 'image') : 'Default preview', after: 'Uploaded ' + saved.type,
    });
    res.json({ media: { url: saved.url, type: saved.type } });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

app.get('/api/history', auth, adminOnly, async (req, res, next) => {
  try {
    const items = await History.find().sort({ at: -1, _id: -1 }).limit(1000).lean();
    res.json(items.map(({ _id, __v, ...h }) => ({ id: String(_id), ...h })));
  } catch (e) { next(e); }
});

// ---- Feedback: any signed-in user sends it, admins read the latest ----
const FEEDBACK_MAX = 2000;
const FEEDBACK_PER_HOUR = 20;
const feedbackSent = new Map(); // 'role:user' -> times of the sends in the last hour
const oneLine = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

app.post('/api/feedback', auth, async (req, res, next) => {
  try {
    const { about, text, page } = req.body || {};
    // Line breaks and tabs stay; other control characters are dropped.
    const body = typeof text === 'string' ? text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : '';
    if (!body) return res.status(400).json({ error: 'Write your feedback first' });
    if ([...body].length > FEEDBACK_MAX) return res.status(400).json({ error: 'Feedback can be up to 2,000 characters' });
    const who = `${req.session.role}:${req.session.user}`;
    const now = Date.now();
    const recent = (feedbackSent.get(who) || []).filter((t) => now - t < 3600e3);
    if (recent.length >= FEEDBACK_PER_HOUR) {
      feedbackSent.set(who, recent);
      return res.status(429).json({ error: 'You’ve sent a lot of feedback in the last hour. Try again later.' });
    }
    feedbackSent.set(who, [...recent, now]);
    // Only an address on this site (a path) is kept.
    const where = oneLine(page, 500);
    const doc = await Feedback.create({
      user: req.session.user, role: req.session.role, about: oneLine(about, 100) || 'General', text: body,
      page: where.startsWith('/') && !where.startsWith('//') ? where : '',
    });
    res.json({ ok: true, id: String(doc._id) });
  } catch (e) { next(e); }
});

app.get('/api/feedback', auth, adminOnly, async (req, res, next) => {
  try {
    const items = await Feedback.find().sort({ at: -1, _id: -1 }).limit(200).lean();
    res.json(items.map(({ _id, __v, ...f }) => ({ id: String(_id), ...f })));
  } catch (e) { next(e); }
});

// Test-only reset, available only with the in-memory database.
if (MEMORY_DB) {
  app.post('/api/test/reset', async (req, res) => {
    await seed(todayISO());
    await resetWhenWhere(todayISO());
    await Feedback.deleteMany({});
    feedbackSent.clear();
    res.json({ ok: true });
  });
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

if (fs.existsSync(DIST)) {
  // Built files have content hashes in their names, so browsers can keep them for a year.
  app.use('/assets', express.static(path.join(DIST, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.use(express.static(DIST, { index: false }));
  if (!ADMIN_ENABLED) app.get(['/admin', '/admin/*'], (req, res) => res.redirect('/'));
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// Bad, oversized or unparsable requests (uploads, JSON bodies, missing built files) get their
// own 4xx reply without a log line (see server/errors.js); anything else is a server fault.
app.use((err, req, res, next) => {
  const reply = errorReply(err);
  if (reply) return res.status(reply.status).json({ error: reply.error });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

async function main() {
  let uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (MEMORY_DB) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    // One fixed folder per port, emptied on start: a force-stopped test server can't
    // leave throwaway database folders piling up in the temp directory.
    const dbPath = path.join(os.tmpdir(), `adpilot-memdb-${PORT}`);
    fs.rmSync(dbPath, { recursive: true, force: true });
    fs.mkdirSync(dbPath, { recursive: true });
    const mem = await MongoMemoryServer.create({ instance: { dbPath } });
    const stop = () => mem.stop({ doCleanup: true, force: true }).finally(() => process.exit(0));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    uri = mem.getUri();
    console.log('Using in-memory MongoDB');
  }
  if (!uri) {
    console.error('Set MONGO_URI (or MEMORY_DB=1 for tests)');
    process.exit(1);
  }
  await mongoose.connect(uri, MEMORY_DB ? {} : { dbName: process.env.MONGO_DB || 'google-ads-demo' });
  if (!MEMORY_DB) initCloudinary();
  // Seed only a brand-new database: one whose campaigns were all deleted by the admin
  // still has their history, and must not be wiped and refilled on the next start.
  if ((await Campaign.countDocuments()) === 0 && (await History.countDocuments()) === 0) await seed(todayISO());
  else {
    await upgradeData();
    await topUp(todayISO());
  }
  await ensureSampleAssets();
  await ensureWhenWhere(todayISO());
  setInterval(() => topUp(todayISO()).catch(console.error), 3600e3).unref();
  app.listen(PORT, () => console.log(`Listening on :${PORT} - db: ${mongoose.connection.name} - media: ${cloudinaryOn() && !MEMORY_DB ? 'cloudinary' : 'local disk'}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
