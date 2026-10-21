import express from 'express';
import multer from 'multer';
import { Campaign, AdSet, Ad, Stat, History, Setting, SETTING_DEFAULTS } from './models.js';
import { derive, resolveStat, eachDay, period, fmtDate, isRealDate, addDays, MAX_RANGE_DAYS } from './formulas.js';
import { saveMedia, deleteMedia, cloudinaryOn, MEDIA_TYPES, MAX_MEDIA_BYTES } from './media.js';
import mongoose from 'mongoose';
import { actor, requireAdmin } from './auth.js';

const r = express.Router();
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_BYTES, files: 1, fields: 25, fieldSize: 20 * 1024, parts: 30 },
  fileFilter: (_q, f, cb) => (MEDIA_TYPES[f.mimetype] ? cb(null, true) : cb(bad('Unsupported file type - use JPG, PNG, GIF, WEBP, MP4, MOV or WEBM'))),
});
// actor is re-entered here: AsyncLocalStorage context does not survive multer's callbacks
const wrap = (fn) => (req, res) => actor.run({ email: req.admin, name: req.actorName }, () => fn(req, res)).catch((e) => {
  const invalid = e.name === 'CastError' || e.name === 'ValidationError';
  const status = e.status || (invalid ? 400 : 500);
  if (status >= 500) console.error(e);
  res.status(status).json({ error: invalid && !e.status ? 'Invalid data' : status >= 500 && !e.expose ? 'Server error' : e.message });
});
// One change to the numbers at a time: edits, daily-data writes and deletes must not interleave day by day
// (otherwise a delete can be undone by an edit that read the rows just before, or reach can end up above impressions).
let lane = Promise.resolve();
const serial = (fn) => { const run = lane.then(fn); lane = run.catch(() => {}); return run; };
const inLane = (fn) => (req, res) => serial(() => fn(req, res));
const PLAIN_NUM = /^\s*(\d+(\.\d+)?|\.\d+)\s*$/; // digits and at most one point: no hex, exponents, signs, grouping
const MIN_DATE = '2020-01-01'; // nothing older can be added (keeps the "Maximum" date range sane)
const LIMITS = { campaign: 200, adset: 500, ad: 1000 }; // demo-sized caps so nobody can fill the database
const NUM_MAX = { spend: 1e9, impressions: 1e12, reach: 1e12, linkClicks: 1e12, cpm: 1e6, cpc: 1e6, ctr: 100, reachRate: 1 };
// what a day's numbers add up to must stay inside the same maxima (spend = impressions x cpm / 1000 can overflow them)
const checkResolved = (v) => {
  if (v.spend > NUM_MAX.spend || v.impressions > NUM_MAX.impressions || v.reach > NUM_MAX.reach || v.linkClicks > NUM_MAX.linkClicks) throw bad('Those numbers are too large');
};
// plain non-negative numbers only (no arrays, booleans, hex...) and sane maxima
const checkNums = (b) => {
  for (const [k, max] of Object.entries(NUM_MAX)) {
    const v0 = b[k];
    if (v0 === undefined || v0 === null || v0 === '') continue;
    if (typeof v0 !== 'number' && typeof v0 !== 'string') throw bad(`${k} must be a number`);
    if (typeof v0 === 'string' && !/^\s*(\d+(\.\d+)?|\.\d+)\s*$/.test(v0)) throw bad(`${k} must be a non-negative number`);
    const n = Number(v0);
    if (!Number.isFinite(n) || n < 0) throw bad(`${k} must be a non-negative number`);
    if (n > max) throw bad(`${k} is too large (the most is ${max.toLocaleString('en-US')})`);
    if ((k === 'cpm' || k === 'cpc') && n > 0 && n < 0.0001) throw bad(`${k} is too small`);
  }
};
const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);
const needId = (v, what = 'id') => { if (!isId(v)) throw bad(`Invalid ${what}`); return v; };

const M = { campaign: Campaign, adset: AdSet, ad: Ad };
const money = (v) => '$' + (+v).toFixed(2); // the ad account is in US dollars
const label = (level) => (level === 'adset' ? 'ad set' : level);
const log = (entityType, e, action, summary, changes = []) =>
  History.create({ entityType, entityId: String(e._id), entityName: e.name, by: actor.getStore()?.name || 'System', action, summary, changes });

// Level is validated before multer buffers an upload, so junk requests are rejected cheaply.
const checkLevel = (req, _res, next) => (Object.hasOwn(M, req.params.level) ? next() : next(bad('Bad level', 404)));

// Delete a stored file only when no other ad (e.g. a duplicate) still points at it.
const plain = (m) => (m && m.publicId ? { url: m.url, publicId: m.publicId, type: m.type, provider: m.provider } : null);
const releaseMedia = async (media) => {
  if (!media?.publicId || (await Ad.exists({ 'media.publicId': media.publicId }))) return;
  await deleteMedia(media);
};

r.get('/health', (_q, res) => res.json({ ok: true, storage: cloudinaryOn() ? 'cloudinary' : 'local' }));

r.get('/tree', wrap(async (_q, res) => {
  const [campaigns, adsets, ads, first] = await Promise.all([
    Campaign.find().sort({ createdAt: 1 }).lean(), AdSet.find().sort({ createdAt: 1 }).lean(),
    Ad.find().sort({ createdAt: 1 }).lean(), Stat.findOne().sort({ date: 1 }).lean(),
  ]);
  res.json({ campaigns, adsets, ads, minDate: first?.date || null });
}));

// ---------------------------------------------------------------- report
r.get('/report', wrap(async (req, res) => {
  const { level = 'ad', from, to, breakdown = 'none' } = req.query;
  for (const k of ['level', 'from', 'to', 'breakdown', 'campaignIds', 'adSetIds']) if (req.query[k] !== undefined && typeof req.query[k] !== 'string') throw bad('Bad request');
  if (!Object.hasOwn(M, level)) throw bad('bad level');
  if (!isRealDate(from) || !isRealDate(to) || from > to) throw bad('from/to must be valid dates (YYYY-MM-DD), from <= to');
  const ids = (k) => (req.query[k] || '').split(',').filter(Boolean);
  const cIds = new Set(ids('campaignIds')), sIds = new Set(ids('adSetIds'));

  const [campaigns, adsets, ads, stats] = await Promise.all([
    Campaign.find().lean(), AdSet.find().lean(), Ad.find().lean(),
    Stat.find({ date: { $gte: from, $lte: to } }).lean(),
  ]);
  const C = new Map(campaigns.map((x) => [String(x._id), x]));
  const S = new Map(adsets.map((x) => [String(x._id), x]));
  const A = new Map(ads.map((x) => [String(x._id), x]));

  const delivery = (own, ...parents) => {
    if (own.deliveryOverride) return own.deliveryOverride; // pinned by the admin
    if (own.status === 'off') return 'Off';
    const p = parents.find((x) => x.p && x.p.status === 'off');
    return p ? `${p.label} off` : 'Active';
  };

  const ov = (x) => (x.textOverrides instanceof Map ? Object.fromEntries(x.textOverrides) : x.textOverrides && typeof x.textOverrides === 'object' ? x.textOverrides : {});
  let entities;
  if (level === 'campaign') {
    entities = campaigns.map((c) => ({ id: String(c._id), key: String(c._id), name: c.name, status: c.status,
      delivery: delivery(c), objective: c.objective, budget: 'Using ad set budget', overrides: ov(c), createdAt: c.createdAt }));
  } else if (level === 'adset') {
    entities = adsets.filter((s) => !cIds.size || cIds.has(String(s.campaignId))).map((s) => {
      const c = C.get(String(s.campaignId));
      return { id: String(s._id), key: String(s._id), name: s.name, status: s.status, parentId: String(s.campaignId),
        parentName: c?.name, objective: c?.objective, delivery: delivery(s, { p: c, label: 'Campaign' }), budget: s.dailyBudget,
        budgetLabel: 'Daily', bidStrategy: s.bidStrategy, overrides: ov(s), createdAt: s.createdAt };
    });
  } else {
    entities = ads.filter((a) => (!cIds.size || cIds.has(String(a.campaignId))) && (!sIds.size || sIds.has(String(a.adSetId))))
      .map((a) => {
        const s = S.get(String(a.adSetId)), c = C.get(String(a.campaignId));
        return { id: String(a._id), key: String(a._id), name: a.name, status: a.status, media: a.media,
          pageName: a.pageName, primaryText: a.primaryText, headline: a.headline, description: a.description,
          cta: a.cta, websiteUrl: a.websiteUrl, displayLink: a.displayLink,
          parentId: String(a.adSetId), parentName: s?.name, campaignName: c?.name, objective: c?.objective,
          delivery: delivery(a, { p: s, label: 'Ad set' }, { p: c, label: 'Campaign' }), budget: s ? s.dailyBudget : null, budgetLabel: 'Daily',
          bidStrategy: s?.bidStrategy, overrides: ov(a), createdAt: a.createdAt };
      });
  }
  const E = new Map(entities.map((e) => [e.key, e]));

  const acc = new Map();
  for (const st of stats) {
    const ad = A.get(String(st.adId));
    if (!ad) continue;
    const key = level === 'ad' ? String(ad._id) : level === 'adset' ? String(ad.adSetId) : String(ad.campaignId);
    if (!E.has(key)) continue;
    const per = breakdown === 'none' ? { key: '', label: '' } : period(st.date, breakdown, from, to);
    const k = key + '|' + per.key;
    const a = acc.get(k) || { key, period: per, spend: 0, impressions: 0, reach: 0, linkClicks: 0 };
    a.spend += st.spend; a.impressions += st.impressions; a.reach += st.reach; a.linkClicks += st.linkClicks;
    acc.set(k, a);
  }
  for (const a of acc.values()) a.spend = Math.round(a.spend * 100) / 100; // sums of cents: no floating-point dust in what the table shows

  let rows;
  if (breakdown === 'none') {
    rows = entities.map((e) => ({ ...e, ...derive(acc.get(e.key + '|') || {}) }));
  } else {
    rows = [...acc.values()]
      .sort((a, b) => E.get(a.key).name.localeCompare(E.get(b.key).name) || a.key.localeCompare(b.key) || (a.period.key < b.period.key ? 1 : a.period.key > b.period.key ? -1 : 0))
      .map((a) => ({ ...E.get(a.key), id: E.get(a.key).id + '|' + a.period.key, entityId: a.key,
        period: a.period.label, periodKey: a.period.key, ...derive(a) }));
  }
  const total = rows.reduce((t, x) => ({ spend: t.spend + x.spend, impressions: t.impressions + x.impressions,
    reach: t.reach + x.reach, linkClicks: t.linkClicks + x.linkClicks }), { spend: 0, impressions: 0, reach: 0, linkClicks: 0 });
  total.spend = Math.round(total.spend * 100) / 100;
  res.json({ rows, totals: derive(total) });
}));

// ---------------------------------------------------------------- entities
export const DELIVERY_STATES = ['Active', 'Learning', 'Learning limited', 'In review', 'Rejected', 'In draft', 'Scheduled', 'Completed', 'Off', 'Campaign off', 'Ad set off', 'Not delivering'];
const parseBody = (b) => {
  const o = {};
  if (b.name !== undefined) { if (typeof b.name !== 'string') throw bad('The name must be text'); o.name = b.name.trim().slice(0, 200); }
  if (b.status !== undefined) { if (b.status !== 'on' && b.status !== 'off') throw bad('Status must be on or off'); o.status = b.status; }
  if (b.dailyBudget !== undefined && b.dailyBudget !== '') {
    if (typeof b.dailyBudget !== 'number' && !(typeof b.dailyBudget === 'string' && PLAIN_NUM.test(b.dailyBudget))) throw bad('Daily budget must be a positive amount');
    const n = Number(b.dailyBudget);
    if (!Number.isFinite(n) || n < 0) throw bad('Daily budget must be a positive amount');
    if (n > 1e9) throw bad('Daily budget is too large (the most is 1,000,000,000)');
    o.dailyBudget = n;
  }
  if (b.deliveryOverride !== undefined) {
    const v = String(b.deliveryOverride).trim();
    if (v && !DELIVERY_STATES.includes(v)) throw bad('Unknown delivery status');
    o.deliveryOverride = v;
  }
  if (b.objective) o.objective = String(b.objective).slice(0, 60);
  if (b.bidStrategy) o.bidStrategy = String(b.bidStrategy).slice(0, 60);
  for (const [k, max] of [['pageName', 80], ['primaryText', 2000], ['headline', 100], ['description', 200], ['cta', 40], ['websiteUrl', 500], ['displayLink', 100]])
    if (b[k] !== undefined) o[k] = String(b[k]).replace(/\r\n?/g, '\n').slice(0, max);
  return o;
};

r.post('/entities/:level', checkLevel, upload.single('media'), wrap(async (req, res) => {
  const { level } = req.params;
  if (req.body.deliveryOverride !== undefined && req.role !== 'admin') throw bad('Admin access required.', 403);
  const data = parseBody(req.body);
  if (!data.name) throw bad('Name is required');
  if ((await M[level].estimatedDocumentCount()) >= LIMITS[level]) throw bad(`You can have at most ${LIMITS[level]} ${label(level)}s - delete some first`, 409);
  if (level === 'adset') {
    if (!isId(req.body.parentId) || !(await Campaign.exists({ _id: req.body.parentId }))) throw bad('Choose a campaign');
    data.campaignId = req.body.parentId;
  }
  if (level === 'ad') {
    const s = isId(req.body.parentId) && (await AdSet.findById(req.body.parentId));
    if (!s) throw bad('Choose an ad set');
    data.adSetId = s._id; data.campaignId = s.campaignId;
    if (req.file) data.media = await saveMedia(req.file);
  }
  const doc = await M[level].create(data);
  await log(level, doc, 'Created', `Created ${label(level)} “${doc.name}”${doc.media?.url ? ' with media' : ''}`);
  res.status(201).json(doc);
}));

r.patch('/entities/:level/:id', checkLevel, upload.single('media'), wrap(async (req, res) => {
  const { level, id } = req.params;
  needId(id);
  const doc = await M[level].findById(id);
  if (!doc) throw bad('Not found', 404);
  if (req.body.deliveryOverride !== undefined && req.role !== 'admin') throw bad('Admin access required.', 403);
  const patch = parseBody(req.body);
  for (const k of Object.keys(patch)) if (!M[level].schema.path(k)) delete patch[k]; // fields this level does not have: ignored, not logged
  // flipping Off/On puts delivery back to automatic, so a switched-off ad can't keep showing a pinned "Active"
  let autoCleared = false;
  if (patch.status !== undefined && patch.status !== doc.status && patch.deliveryOverride === undefined && doc.deliveryOverride) { patch.deliveryOverride = ''; autoCleared = true; }
  const changes = [];
  let oldMedia = null, newMedia = null;
  for (const [k, v] of Object.entries(patch)) if (doc[k] !== v) { changes.push({ field: k, from: doc[k], to: v }); doc[k] = v; }
  if (level === 'ad') {
    if (req.file) { const m = await saveMedia(req.file); oldMedia = plain(doc.media); changes.push({ field: 'media', from: doc.media?.url, to: m.url }); doc.media = newMedia = m; }
    else if (req.body.removeMedia === 'true' && doc.media?.url) {
      if (req.role === 'demo') throw bad("You don't have permission to remove media.", 403); oldMedia = plain(doc.media); changes.push({ field: 'media', from: doc.media.url, to: null }); doc.media = undefined; }
  }
  if (!changes.length) return res.json(doc);
  try { await doc.save(); } catch (e) { if (newMedia) await deleteMedia(newMedia); throw e; } // a refused save must not leave the new file behind
  await releaseMedia(oldMedia); // the replaced/removed file, unless a duplicate still uses it
  const shown = changes.filter((c) => !(autoCleared && c.field === 'deliveryOverride'));
  const only = shown.length === 1 ? shown[0] : null;
  const isStatus = only?.field === 'status';
  const summary = isStatus
    ? `Turned ${only.to} ${label(level)} “${doc.name}”`
    : `Updated ${label(level)} “${doc.name}” (${changes.map((c) => c.field).join(', ')})`;
  await log(level, doc, isStatus ? (only.to === 'on' ? 'Turned on' : 'Turned off') : 'Edited', summary, changes);
  res.json(doc);
}));

async function clone(level, doc, parent = {}) {
  const copy = doc.toObject();
  delete copy._id; delete copy.createdAt; delete copy.updatedAt; delete copy.__v;
  const { keepName, ...refs } = parent;
  Object.assign(copy, refs);
  if (!keepName) copy.name = (doc.name + ' – Copy').slice(0, 200);
  const made = await M[level].create({ ...copy, status: 'off' });
  if (level === 'campaign') for (const s of await AdSet.find({ campaignId: doc._id }))
    await clone('adset', s, { campaignId: made._id, keepName: true });
  if (level === 'adset') for (const a of await Ad.find({ adSetId: doc._id }))
    await clone('ad', a, { adSetId: made._id, campaignId: made.campaignId, keepName: true });
  return made;
}
r.post('/entities/:level/:id/duplicate', checkLevel, wrap(async (req, res) => {
  const { level, id } = req.params;
  needId(id);
  const doc = await M[level].findById(id);
  if (!doc) throw bad('Not found', 404);
  if ((await M[level].estimatedDocumentCount()) >= LIMITS[level]) throw bad(`You can have at most ${LIMITS[level]} ${label(level)}s - delete some first`, 409);
  const made = await clone(level, doc);
  await log(level, made, 'Duplicated', `Duplicated “${doc.name}” → “${made.name}” (turned off, no data copied)`);
  res.status(201).json(made);
}));

r.delete('/entities/:level/:id', checkLevel, wrap(inLane(async (req, res) => {
  const { level, id } = req.params;
  needId(id);
  const doc = await M[level].findById(id);
  if (!doc) throw bad('Not found', 404);
  const ads = level === 'campaign' ? await Ad.find({ campaignId: id }) : level === 'adset' ? await Ad.find({ adSetId: id }) : [doc];
  const adIds = ads.map((x) => x._id);
  await Stat.deleteMany({ adId: { $in: adIds } });
  await Ad.deleteMany({ _id: { $in: adIds } });
  if (level === 'campaign') await AdSet.deleteMany({ campaignId: id });
  if (level !== 'ad') await doc.deleteOne();
  for (const a of ads) await releaseMedia(plain(a.media));
  await log(level, doc, 'Deleted', `Deleted ${label(level)} “${doc.name}” and its data`);
  res.json({ ok: true });
})));

// ---------------------------------------------------------------- daily data
r.get('/stats', wrap(async (req, res) => {
  res.json(await Stat.find({ adId: needId(req.query.adId, 'adId') }).sort({ date: -1 }).limit(2000).lean());
}));

r.put('/stats', wrap(inLane(async (req, res) => {
  const { adId, date } = req.body;
  const ad = isId(adId) && (await Ad.findById(adId));
  if (!ad) throw bad('Ad not found', 404);
  if (!isRealDate(date) || date < MIN_DATE) throw bad('Bad date');
  if (date > addDays(new Date().toISOString().slice(0, 10), 1)) throw bad("Can't add data for a future date");
  checkNums(req.body);
  const v = resolveStat(req.body);
  checkResolved(v);
  const before = await Stat.findOne({ adId, date }).lean();
  const doc = await Stat.findOneAndUpdate({ adId, date }, v, { upsert: true, new: true, setDefaultsOnInsert: true });
  const changes = before ? Object.keys(v).filter((k) => before[k] !== v[k]).map((k) => ({ field: k, from: before[k], to: v[k] })) : [];
  if (!before || changes.length)
    await log('stat', ad, before ? 'Edited data' : 'Added data',
      `${before ? 'Edited' : 'Added'} data for ${fmtDate(date)}: ${money(v.spend)} spent, ${v.impressions.toLocaleString('en-US')} impressions`, changes);
  res.json(doc);
})));

r.delete('/stats/:id', wrap(inLane(async (req, res) => {
  const st = await Stat.findByIdAndDelete(needId(req.params.id));
  const ad = st && (await Ad.findById(st.adId));
  if (ad) await log('stat', ad, 'Deleted data', `Deleted data for ${fmtDate(st.date)} (${money(st.spend)})`);
  res.json({ ok: true });
})));

// Generate a run of days from a few knobs (daily spend, CPM, CTR, reach %, day-to-day variance).
r.post('/stats/bulk', wrap(inLane(async (req, res) => {
  const { adId, from, to, dailySpend, cpm, ctr = 3, reachRate = 0.9, variance = 10, overwrite = true } = req.body;
  const ad = isId(adId) && (await Ad.findById(adId));
  if (!ad) throw bad('Ad not found', 404);
  if (!isRealDate(from) || !isRealDate(to) || from > to) throw bad('Bad date range');
  if ([dailySpend, cpm, ctr, reachRate, variance].some((v) => (typeof v !== 'number' && typeof v !== 'string') || (typeof v === 'string' && !PLAIN_NUM.test(v)))) throw bad('Numbers expected');
  if (from < MIN_DATE) throw bad('Bad date range');
  if (+dailySpend > 1e8 || +cpm > 1e6) throw bad('Amounts are too large');
  if (!(+dailySpend > 0) || !(+cpm > 0)) throw bad('Daily spend and CPM must be greater than 0');
  if (+cpm < 0.0001) throw bad('CPM is too small');
  if (!(+ctr >= 0 && +ctr <= 100)) throw bad('CTR must be between 0 and 100');
  if (!(+reachRate >= 0 && +reachRate <= 1)) throw bad('Reach % must be between 0 and 100');
  if (!(+variance >= 0 && +variance <= 100)) throw bad('Daily variance must be between 0 and 100');
  if (to > addDays(new Date().toISOString().slice(0, 10), 1)) throw bad("Can't generate data for future dates");
  const days = eachDay(from, to);
  if (days.length > MAX_RANGE_DAYS) throw bad(`Range too long - generate at most ${MAX_RANGE_DAYS} days at a time`);
  const j = (pct) => 1 + ((Math.random() * 2 - 1) * pct) / 100;
  const ops = days.map((date) => {
    const v = resolveStat({ spend: +dailySpend * j(+variance), cpm: +cpm * j(+variance / 3), ctr: +ctr * j(+variance / 2), reachRate: Math.min(1, +reachRate * j(Math.min(2, +variance))) });
    checkResolved(v);
    return { updateOne: { filter: { adId, date }, update: overwrite ? { $set: v } : { $setOnInsert: v }, upsert: true } };
  });
  await Stat.bulkWrite(ops);
  await log('stat', ad, 'Added data',
    `Generated ${days.length} day(s) of data (${fmtDate(from)} → ${fmtDate(to)}) at ~${money(dailySpend)}/day, CPM ${money(cpm)}, CTR ${ctr}%`);
  res.json({ ok: true, days: days.length });
})));

// ---------------------------------------------------------------- change marker
// Every change (admin edits, toggles, uploads, data) writes a history row, so its count + newest id is a cheap
// "has anything changed?" token. The main site polls it so edits made in the admin panel show up on their own.
r.get('/version', wrap(async (_q, res) => {
  const [n, last] = await Promise.all([History.estimatedDocumentCount(), History.findOne().sort({ _id: -1 }).select('_id').lean()]);
  res.json({ v: n + ':' + (last ? last._id : '') });
}));

// ---------------------------------------------------------------- admin: edit a total in place
// A table cell shows a total over the selected dates, but the data is stored per ad per day. Typing a new total
// rescales the underlying days in proportion (largest-remainder rounding, so the total comes out exactly as typed)
// and every dependent metric (CPM, CTR, CPC, frequency, cost per result) follows from the formulas.
const METRIC_LABEL = { spend: 'Amount spent', impressions: 'Impressions', reach: 'Reach', linkClicks: 'Link clicks', results: 'Results', cpm: 'CPM', cpc: 'CPC', cpr: 'Cost per result', ctr: 'CTR', frequency: 'Frequency' };
const METRIC_DP = { cpm: 2, cpc: 3, cpr: 3, ctr: 2, frequency: 2 }; // decimals the table shows for derived metrics
const FIELD_MAX = { spend: 1e9, impressions: 1e12, reach: 1e12, linkClicks: 1e12, results: 1e12, cpm: 1e6, cpc: 1e6, cpr: 1e6, ctr: 100, frequency: 1e6 };
// CPM is shown with two decimals cut off, not rounded (0.069 -> 0.06); the same rule as trunc2 in client/src/lib.js
const trunc2 = (v) => Math.floor(Number((v * 100).toPrecision(12))) / 100;
const fmtMetric = (f, v) => {
  if (v == null) return '—';
  if (f === 'spend') return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (f === 'cpm') return '$' + trunc2(v).toFixed(2);
  if (f === 'cpc' || f === 'cpr') return '$' + v.toFixed(3);
  if (f === 'ctr') return v.toFixed(2) + '%';
  if (f === 'frequency') return v.toFixed(2);
  return Math.round(v).toLocaleString('en-US');
};
const sumOf = (a) => a.reduce((s, x) => s + x, 0);
// Share `total` whole units over slots in proportion to `weights`, never giving a slot more than its cap.
export function spread(total, weights, caps) {
  const n = weights.length;
  const out = new Array(n).fill(0);
  let left = total;
  let open = weights.map((_, i) => i);
  for (let guard = 0; left > 0 && open.length && guard < n + 8; guard++) {
    let w = open.map((i) => weights[i]);
    let ws = sumOf(w);
    if (ws <= 0) { w = open.map(() => 1); ws = open.length; } // nothing to go on: share equally
    const ideal = open.map((_, k) => (left * w[k]) / ws);
    if (open.some((i, k) => out[i] + ideal[k] > caps[i])) {
      for (const [k, i] of open.entries()) if (out[i] + ideal[k] >= caps[i]) { left -= caps[i] - out[i]; out[i] = caps[i]; }
      open = open.filter((i) => out[i] < caps[i]);
      continue;
    }
    const base = ideal.map(Math.floor);
    const order = ideal.map((x, k) => [x - base[k], k]).sort((a, b) => b[0] - a[0]);
    for (let j = 0, rem = Math.min(left - sumOf(base), order.length); j < rem; j++) base[order[j][1]]++;
    open.forEach((i, k) => { out[i] += Math.min(base[k], caps[i] - out[i]); });
    left = total - sumOf(out);
    open = open.filter((i) => out[i] < caps[i]);
  }
  return { out, left };
}

const isStr = (v) => typeof v === 'string';
const NUMBER_TEXT = /^[$₹€£]?\s?((\d{1,3}(,\d{2,3})+|\d+)(\.\d+)?|\.\d+)$/; // "1,234.50", "1,00,000", "$99", ".5" - nothing exotic, and no adjacent quantifiers so it cannot backtrack

// ---------------------------------------------------------------- admin: empty a value cell
// A value cell holds a number. The admin may also leave it empty: the cell then shows a dash ("—", no value) instead of the
// calculated figure. That is kept per row and column; the daily data underneath is not touched, so totals, sorting and charts keep using the numbers.
const NO_VALUE = '—';
const TEXT_FIELDS = { results: 'Results', cpr: 'Cost per result', spend: 'Amount spent', budget: 'Budget', impressions: 'Impressions', cpm: 'CPM', reach: 'Reach', frequency: 'Frequency', ctr: 'CTR', linkClicks: 'Link clicks', cpc: 'CPC' };
r.put('/admin/text', requireAdmin, wrap(async (req, res) => {
  const { level, id, field, value } = req.body;
  if (![level, id, field, value].every(isStr)) throw bad('Bad request');
  if (!Object.hasOwn(M, level)) throw bad('Bad level');
  needId(id);
  if (!Object.hasOwn(TEXT_FIELDS, field)) throw bad('That column cannot be emptied');
  if (value !== '' && value !== NO_VALUE) throw bad('Enter a number'); // '' = show the calculated figure again, the dash = no value
  const text = value;
  const doc = await M[level].findById(id);
  if (!doc) throw bad('Not found', 404);
  if (!doc.textOverrides) doc.textOverrides = new Map();
  const before = doc.textOverrides.get(field) || '';
  if (before === text) return res.json({ ok: true, unchanged: true });
  if (text) doc.textOverrides.set(field, text); else doc.textOverrides.delete(field);
  await doc.save();
  await log(level, doc, 'Edited', text ? `Admin emptied ${TEXT_FIELDS[field]} of “${doc.name}” (shows —)` : `${TEXT_FIELDS[field]} of “${doc.name}” shows its figure again`, [{ field, from: before, to: text }]);
  res.json({ ok: true });
}));

r.put('/admin/metric', requireAdmin, wrap(async (req, res) => {
  const { level, id, field, from, to, breakdown = 'none', periodKey = '' } = req.body;
  if (![level, id, field, from, to, breakdown, periodKey].every(isStr)) throw bad('Bad request');
  if (!Object.hasOwn(M, level)) throw bad('Bad level');
  needId(id);
  if (!Object.hasOwn(METRIC_LABEL, field)) throw bad('That column cannot be edited here');
  if (!['none', 'day', 'week', '2weeks', 'month'].includes(breakdown)) throw bad('Bad breakdown');
  if (!isRealDate(from) || !isRealDate(to) || from > to || from < MIN_DATE) throw bad('Bad date range');
  if (eachDay(from, to).length > MAX_RANGE_DAYS) throw bad('Date range too long - pick a shorter one');
  const rawIn = req.body.value;
  if (typeof rawIn !== 'number' && !(isStr(rawIn) && rawIn.length <= 40 && NUMBER_TEXT.test(rawIn.trim()))) throw bad('Enter a number (0 or more)');
  const typed = typeof rawIn === 'number' ? rawIn : Number(rawIn.replace(/[$₹€£,\s]/g, ''));
  if (!Number.isFinite(typed) || typed < 0) throw bad('Enter a number (0 or more)');
  if (typed > FIELD_MAX[field]) throw bad(`That number is too large (the most ${METRIC_LABEL[field]} can be is ${FIELD_MAX[field].toLocaleString('en-US')})`);

  const result = await serial(async () => {
    const doc = await M[level].findById(id);
    if (!doc) throw bad('Not found', 404);
    const adFilter = level === 'ad' ? { _id: id } : level === 'adset' ? { adSetId: id } : { campaignId: id };
    const adIds = (await Ad.find(adFilter).select('_id').lean()).map((a) => a._id);
    if (!adIds.length) throw bad(`This ${label(level)} has no ads yet`);
    const inPeriod = (d) => breakdown === 'none' || period(d, breakdown, from, to).key === periodKey;
    const stats = (await Stat.find({ adId: { $in: adIds }, date: { $gte: from, $lte: to } }).lean()).filter((s) => inPeriod(s.date));
    const slots = stats.map((s) => ({ _id: s._id, adId: s.adId, date: s.date, spend: s.spend, impressions: s.impressions, reach: s.reach, linkClicks: s.linkClicks }));
    const today = new Date().toISOString().slice(0, 10);
    // nothing recorded for these dates yet: lay down empty days (never in the future) so there is something to scale
    if (!slots.length && (field === 'spend' || field === 'impressions') && typed > 0) {
      const limit = addDays(today, 1); // same upper bound as PUT /stats: an admin ahead of UTC can still edit their own "today"
      const days = eachDay(from, to < limit ? to : limit).filter(inPeriod);
      if (!days.length) throw bad(breakdown === 'none' ? "These dates have no days that can hold data (future dates can't be edited)" : 'Unknown period - reload and try again');
      if (days.length * adIds.length > 5000) throw bad('Too many days x ads - pick a shorter date range');
      for (const adId of adIds) for (const date of days) slots.push({ isNew: true, adId, date, spend: 0, impressions: 0, reach: 0, linkClicks: 0 });
    }
    const orig = slots.map((s) => ({ spend: s.spend, impressions: s.impressions, reach: s.reach, linkClicks: s.linkClicks }));
    const total = (k) => sumOf(slots.map((s) => s[k]));
    const T = { spend: Math.round(total('spend') * 100) / 100, impressions: total('impressions'), reach: total('reach'), linkClicks: total('linkClicks') };
    const before = derive(T);

    // which stored number does this column come down to, and what must it total?
    let base = field, target = typed;
    if (field === 'results') base = 'linkClicks';
    else if (field === 'cpm') { if (!T.impressions) throw bad('There are no impressions yet - set Impressions first'); base = 'spend'; target = (typed * T.impressions) / 1000; }
    else if (field === 'cpc' || field === 'cpr') { if (!T.linkClicks) throw bad('There are no link clicks yet - set Link clicks first'); base = 'spend'; target = typed * T.linkClicks; }
    else if (field === 'ctr') { if (!T.impressions) throw bad('There are no impressions yet - set Impressions first'); base = 'linkClicks'; target = (T.impressions * typed) / 100; }
    else if (field === 'frequency') {
      if (!T.impressions) throw bad('There are no impressions yet - set Impressions first');
      if (typed < 1) throw bad("Frequency can't be below 1 (reach can't exceed impressions)");
      if (typed > T.impressions) throw bad("Frequency can't be higher than the number of impressions");
      base = 'reach'; target = T.impressions / typed;
    }
    // retyping what the table already shows (rounded to its decimals) is not a change, even if the stored value differs a hair
    const asShown = (f, v) => (f === 'cpm' ? trunc2(v) : Number(v.toFixed(METRIC_DP[f]))); // what the table shows for this figure
    if (field in METRIC_DP && before[field] != null && asShown(field, before[field]) === asShown(field, typed)) return { ok: true, unchanged: true };
    if (!slots.length) {
      if (typed > 0 && (base === 'reach' || base === 'linkClicks')) throw bad('There are no impressions yet - set Impressions first');
      return { ok: true, unchanged: true };
    }
    if (base === 'spend' && target > FIELD_MAX.spend) throw bad(`That would make Amount spent more than ${FIELD_MAX.spend.toLocaleString('en-US')}`);

    // a typed CPM must come out as typed once its decimals are cut off, so the spend behind it is rounded UP to the next cent
    const units = field === 'cpm' ? Math.ceil(target * 100 - 1e-6) : base === 'spend' ? Math.round(target * 100) : Math.round(target);
    if (!Number.isSafeInteger(units)) throw bad('That value is too large for these totals');
    const weights = slots.map((s) => (base === 'spend' ? Math.round(s.spend * 100) : s[base]));
    const capped = base === 'reach' || base === 'linkClicks';
    if (capped && units > T.impressions) throw bad(`${METRIC_LABEL[field]} can't be more than impressions (${T.impressions.toLocaleString('en-US')})`);
    const { out, left } = spread(units, weights, slots.map((s) => (capped ? s.impressions : Infinity)));
    if (left > 0) throw bad("That value doesn't fit the days in this period");
    let clamped = false;
    const ops = [];
    slots.forEach((s, i) => {
      const set = { [base]: base === 'spend' ? out[i] / 100 : out[i] };
      s[base] = set[base];
      if (base === 'impressions') { // reach and clicks can never exceed impressions on any day
        for (const k of ['reach', 'linkClicks']) if (s[k] > s.impressions) { s[k] = s.impressions; set[k] = s.impressions; clamped = true; }
      }
      if (Object.keys(set).some((k) => set[k] !== orig[i][k])) ops.push(s.isNew
        ? { updateOne: { filter: { adId: s.adId, date: s.date }, update: { $set: set }, upsert: true } } // only brand-new days are created
        : { updateOne: { filter: { _id: s._id }, update: { $set: set } } }); // existing days are updated in place, never resurrected
    });
    if (!ops.length) return { ok: true, unchanged: true }; // typing what is already there changes nothing - and logs nothing
    await Stat.bulkWrite(ops);

    const after = derive({ spend: Math.round(total('spend') * 100) / 100, impressions: total('impressions'), reach: total('reach'), linkClicks: total('linkClicks') });
    const shown = field === 'results' ? 'linkClicks' : field;
    const was = before[shown], now = after[shown];
    const exact = field === 'cpm' ? trunc2(now) === trunc2(typed) : field in METRIC_DP ? Math.abs(now - typed) < 0.5 * 10 ** -METRIC_DP[field] : field === 'spend' ? Math.abs(now - typed) < 0.005 : Math.round(now) === Math.round(typed);
    const scope = breakdown === 'none' ? `${fmtDate(from)} – ${fmtDate(to)}` : period(slots[0].date, breakdown, from, to).label;
    await log(level, doc, 'Edited data', `Admin changed ${METRIC_LABEL[field]} of “${doc.name}” (${scope}): ${fmtMetric(field, was)} → ${fmtMetric(field, now)}${clamped ? ' (reach / clicks capped at impressions)' : ''}`,
      [{ field, from: was, to: now }]);
    return { ok: true, field, before: was, after: now, days: ops.length, clamped, exact };
  });
  res.json(result);
}));

// ---------------------------------------------------------------- settings: the names in the account panel of the top bar
// Four names, kept in one document. Everybody signed in reads them; only the admin renames them (in place, in the admin panel).
const SETTING_KEYS = Object.keys(SETTING_DEFAULTS);
const SETTING_LABEL = { portfolioName: 'business portfolio', accountName: 'ad account', secondPortfolioName: 'second business portfolio', profileName: 'profile' };
const SETTING_MAX = 60;
// control characters, line / paragraph separators, text-direction overrides and zero-width spaces: a name is one line of plain text
const SETTING_JUNK = /[\u0000-\u001f\u007f-\u009f\u200b\u2028-\u202e\u2066-\u2069\ufeff]/g;
const settingsOf = (doc) => Object.fromEntries(SETTING_KEYS.map((k) => [k, doc && typeof doc[k] === 'string' && doc[k] ? doc[k] : SETTING_DEFAULTS[k]]));

r.get('/settings', wrap(async (_q, res) => {
  res.json(settingsOf(await Setting.findById('account').lean()));
}));

r.put('/admin/settings', requireAdmin, wrap(async (req, res) => {
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad('Bad request');
  const keys = Object.keys(b);
  if (!keys.length) throw bad('Nothing to change');
  const patch = {};
  for (const k of keys) {
    if (!Object.hasOwn(SETTING_DEFAULTS, k)) throw bad('Unknown setting');
    if (typeof b[k] !== 'string') throw bad(`The ${SETTING_LABEL[k]} name must be text`);
    if (b[k].length > 2000) throw bad(`The ${SETTING_LABEL[k]} name is too long (the most is ${SETTING_MAX} characters)`);
    const v = b[k].replace(SETTING_JUNK, '').trim();
    if (!v) throw bad(`The ${SETTING_LABEL[k]} name can't be empty`);
    if ([...v].length > SETTING_MAX) throw bad(`The ${SETTING_LABEL[k]} name is too long (the most is ${SETTING_MAX} characters)`);
    patch[k] = v;
  }
  const before = settingsOf(await Setting.findById('account').lean());
  const changes = Object.keys(patch).filter((k) => before[k] !== patch[k]).map((k) => ({ field: k, from: before[k], to: patch[k] }));
  if (!changes.length) return res.json(before); // typing what is already there changes nothing - and logs nothing
  const save = () => Setting.findByIdAndUpdate('account', { $set: patch }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  const after = settingsOf(await save().catch((e) => (e && e.code === 11000 ? save() : Promise.reject(e)))); // two first saves at once: the second one updates
  await log('account', { _id: 'account', name: after.accountName }, 'Renamed',
    changes.map((c) => `Renamed the ${SETTING_LABEL[c.field]} “${c.from}” → “${c.to}”`).join('; '), changes);
  res.json(after);
}));

// ---------------------------------------------------------------- history
r.get('/history', wrap(async (req, res) => {
  const q = typeof req.query.entityId === 'string' && req.query.entityId ? { entityId: req.query.entityId } : {};
  res.json(await History.find(q).sort({ createdAt: -1 }).limit(200).lean());
}));

export default r;
