// Admin editing: names, text, statuses, settings and performance figures.
import mongoose from 'mongoose';
import { Campaign, AdGroup, Ad, Stat, History, Setting } from './models.js';
import {
  BASE_METRICS, METRICS, METRIC_SCOPE, EDITABLE, formatValue, parseInput, solveMetric,
} from '../shared/metrics.js';
import { distribute } from './rescale.js';
import { addDays, daysBetween } from '../shared/dates.js';
import {
  CAMPAIGN_TYPES, CAMPAIGN_STATUS_LABELS, AD_GROUP_STATUS_LABELS, AD_GROUP_TYPES, parseScore, formatScore,
} from '../shared/entities.js';
import { DEFAULT_BUDGET, DESCRIPTION_MAX } from './seed.js';
import { fileInUse } from './creative.js';
import {
  ACCOUNT_DEFAULTS, ACCOUNT_LABELS, ACCOUNT_MAX, ADDRESS_LINES, CURRENCY_CODES,
} from '../shared/account.js';

const STRENGTHS = ['Excellent', 'Good', 'Average', 'Poor'];

const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);
const fail = (msg, status = 400) => Object.assign(new Error(msg), { status, expose: true });
// One line of plain text: control characters and runs of spaces collapsed, length capped.
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const count = (v) => {
  const s = String(v ?? '').trim();
  if (!/^\d{1,2}$/.test(s)) throw fail('Enter a whole number from 0 to 99');
  return Number(s);
};
const required = (v, max) => {
  const s = clean(v, max);
  if (!s) throw fail('Enter some text');
  return s;
};

// Money typed as "1,200.00", "$40" or "40.00/day" -> cents; '' -> null; undefined when invalid.
export function parseMoney(text) {
  const s = String(text ?? '').trim().replace(/^\$/, '').replace(/\s*\/\s*day$/i, '').trim();
  if (s.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) return undefined;
  return parseInput('cost', s.replace(/,/g, ''));
}
// Comma-separated status reasons -> up to 6 tidy lines.
export const parseReasons = (text) => String(text ?? '').split(',').map((x) => clean(x, 80)).filter(Boolean).slice(0, 6);
// '' (follow the status / campaign type) or one of the allowed labels; undefined when invalid.
export function parseChoice(text, allowed) {
  const s = clean(text, 40);
  return !s || allowed.includes(s) ? s : undefined;
}
// The first name in make(1), make(2)… that isn't taken.
export function firstFree(used, make) {
  for (let n = 1; ; n++) if (!used.has(make(n))) return make(n);
}
const money = (cents) => formatValue('cost', cents);
const perDay = (cents) => (cents == null ? money(null) : `${money(cents)}/day`);
const orAuto = (v) => v || 'Automatic';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function getAccount() {
  const doc = await Setting.findOne({ key: 'account' }).lean();
  return { ...ACCOUNT_DEFAULTS, ...(doc?.value || {}) };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Plain text over several lines: each line tidied like clean(), blank lines dropped.
const cleanLines = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').split('\n')
  .map((l) => l.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim())
  .filter(Boolean).slice(0, ADDRESS_LINES).join('\n').slice(0, max).trim();
// '' clears an optional field; anything longer than max is refused rather than cut short.
const optional = (v, max, what) => {
  const s = clean(v, max + 1);
  if (s.length > max) throw fail(`Use ${what} of up to ${max} characters`);
  return s;
};

// The value to store for one account detail typed by an admin; throws (400, with a message to
// show) when it isn't valid. Free text is tidied and capped; links, emails, phone numbers and
// tax IDs must have the right form.
export function parseAccountField(field, value) {
  if (typeof value !== 'string') throw fail(field === 'avatar' ? 'Upload a photo instead' : 'Enter some text');
  switch (field) {
    case 'id': {
      const s = clean(value, 20);
      if (!/^\d{3}-\d{3}-\d{4}$/.test(s)) throw fail('Use the format 123-456-7890');
      return s;
    }
    case 'name': case 'profileName': return required(value, 60);
    case 'email': {
      const s = clean(value, 100);
      if (!EMAIL.test(s)) throw fail('Enter an email address');
      return s;
    }
    case 'avatar':
      if (value !== '') throw fail('Upload a photo instead');
      return '';
    case 'appUrl': {
      const s = value.trim();
      if (!s) return '';
      if (s.length > ACCOUNT_MAX.appUrl) throw fail(`Use a link of up to ${ACCOUNT_MAX.appUrl} characters`);
      let u = null;
      try { u = new URL(s); } catch { /* checked below */ }
      if (!u || !/^https:\/\/[^/]/i.test(s) || /[\s\u0000-\u001f\u007f]/.test(s) || u.protocol !== 'https:'
        || !u.hostname.includes('.') || u.username || u.password) {
        throw fail('Enter a full link that starts with https://, like https://example.com/app');
      }
      return s;
    }
    // Cleared: back to the standard wording.
    case 'appTitle': return clean(value, ACCOUNT_MAX.appTitle) || ACCOUNT_DEFAULTS.appTitle;
    case 'appText': return clean(value, ACCOUNT_MAX.appText) || ACCOUNT_DEFAULTS.appText;
    case 'billingName': return clean(value, ACCOUNT_MAX.billingName);
    case 'billingAddress': return cleanLines(value, ACCOUNT_MAX.billingAddress);
    case 'billingEmail': {
      const s = optional(value, ACCOUNT_MAX.billingEmail, 'an email address');
      if (s && !EMAIL.test(s)) throw fail('Enter an email address');
      return s;
    }
    case 'billingPhone': {
      const s = optional(value, ACCOUNT_MAX.billingPhone, 'a phone number');
      if (s && (!/^\+?[0-9 ().-]+$/.test(s) || s.replace(/\D/g, '').length < 5)) {
        throw fail('Enter a phone number: digits, spaces and + ( ) - . only');
      }
      return s;
    }
    case 'taxId': {
      const s = optional(value, ACCOUNT_MAX.taxId, 'a tax ID');
      if (s && !/^[A-Za-z0-9][A-Za-z0-9 ./-]*$/.test(s)) throw fail('Use letters, numbers, spaces and - . / only');
      return s;
    }
    case 'currency':
      if (!CURRENCY_CODES.includes(value)) throw fail('Pick a currency');
      return value;
    default: throw fail('This field can’t be edited');
  }
}
// What the browser gets: no storage ids.
export const publicAccount = ({ avatarMedia, ...a }) => a;

async function log(req, entry) {
  await History.create({ user: req.session.user, ...entry });
}

async function campaignMap() {
  return new Map((await Campaign.find().lean()).map((c) => [String(c._id), c]));
}

const idList = (ids, msg) => {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(isId)) throw fail(msg);
  return ids;
};

// Removes ads with their daily rows. A media file goes only once nothing else (another
// ad, an ad's edit-page images, the asset library) uses it.
async function removeAds(ads, deleteMedia) {
  const ids = ads.map((a) => a._id);
  await Stat.deleteMany({ adId: { $in: ids } });
  await Ad.deleteMany({ _id: { $in: ids } });
  const done = new Set();
  for (const a of ads) {
    if (!a.media?.publicId || done.has(a.media.publicId)) continue;
    done.add(a.media.publicId);
    if (!(await fileInUse(a.media.url))) await deleteMedia(a.media);
  }
}

export function registerEditing(app, { auth, adminOnly, validRange, upload, saveMedia, deleteMedia }) {
  const route = (method, path, fn) => app[method](path, auth, adminOnly, async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e.expose) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  });
  const range = (body) => {
    if (!validRange(body.from, body.to)) throw fail('Bad date range');
    return { from: body.from, to: body.to };
  };

  // ---------------- performance figures ----------------
  // A typed figure for some ads over a date range: worked back to one stored metric's new total
  // (Avg. CPC -> cost, CTR -> clicks…) and spread over those ads' days in proportion to what is
  // there now, so every total, scorecard and chart built from the data follows.
  async function setFigure(req, adIds, metric, text, { from, to }, what) {
    if (!EDITABLE.has(metric)) throw fail('This column can’t be edited');
    const v = parseInput(metric, text);
    if (v === undefined) throw fail('Enter a number');
    let ads = await Ad.find({ _id: { $in: adIds } }, { format: 1, campaignId: 1, adGroupId: 1 }).lean();
    if (METRIC_SCOPE[metric] === 'video') ads = ads.filter((a) => a.format === 'video');
    if (METRIC_SCOPE[metric] === 'demandgen') {
      const dg = new Set((await Campaign.find({ type: 'Demand Gen' }, { _id: 1 }).lean()).map((c) => String(c._id)));
      ads = ads.filter((a) => dg.has(String(a.campaignId)));
    }
    if (!ads.length) throw fail(METRIC_SCOPE[metric] === 'video' ? 'There are no video ads here' : METRIC_SCOPE[metric] ? 'There are no Demand Gen ads here' : 'There are no ads here');
    const ids = ads.map((a) => a._id);
    const date = { $gte: from, $lte: to };
    let rows = await Stat.find({ adId: { $in: ids }, date }).lean();
    const sums = Object.fromEntries(BASE_METRICS.map((m) => [m, rows.reduce((n, r) => n + (r[m] || 0), 0)]));
    const solved = v === null ? { base: METRICS[metric].editAs || metric, total: null } : solveMetric(metric, v, sums);
    if (solved.error) throw fail(solved.error);
    const { base, total } = solved;
    if (!BASE_METRICS.includes(base)) throw fail('This column can’t be edited');
    // Nothing recorded yet for some of these ads' days: add those days so the figure has somewhere to go.
    if (total && !rows.some((r) => r[base] > 0)) {
      const have = new Set(rows.map((r) => `${r.adId}|${r.date}`));
      const add = [];
      for (const a of ads) {
        for (let d = 0; d <= daysBetween(from, to); d++) {
          const day = addDays(from, d);
          if (!have.has(`${a._id}|${day}`)) add.push({ adId: a._id, adGroupId: a.adGroupId, campaignId: a.campaignId, date: day });
        }
      }
      if (add.length) {
        await Stat.insertMany(add);
        rows = await Stat.find({ adId: { $in: ids }, date }).lean();
      }
    }
    const parts = total == null ? rows.map(() => null) : distribute(rows.map((r) => r[base] || 0), total);
    if (rows.length) {
      await Stat.bulkWrite(rows.map((r, i) => ({ updateOne: { filter: { _id: r._id }, update: { $set: { [base]: parts[i] } } } })));
    }
    const before = formatValue(base, rows.length && rows.some((r) => r[base] != null) ? sums[base] : null);
    const after = formatValue(base, total);
    await log(req, { level: 'Figures', entityName: what, column: METRICS[metric].label, before, after: `${formatValue(metric, v)} (${METRICS[base].label} ${after}, ${from} – ${to})` });
    return { exact: true, after: formatValue(metric, v) };
  }

  route('patch', '/api/ads/:id/metric', async (req, res) => {
    const { metric, value } = req.body || {};
    if (!isId(req.params.id)) throw fail('Ad not found', 404);
    const ad = await Ad.findById(req.params.id, { name: 1 }).lean();
    if (!ad) throw fail('Ad not found', 404);
    res.json(await setFigure(req, [ad._id], metric, value, range(req.body || {}), ad.name));
  });

  // A total: the ads on screen ('view'), the whole account, one campaign type, campaign or ad group.
  route('patch', '/api/totals/metric', async (req, res) => {
    const body = req.body || {};
    const { scope, metric, value } = body;
    let filter;
    let what;
    if (scope === 'view') {
      const ids = Array.isArray(body.adIds) ? body.adIds.filter(isId) : [];
      if (!ids.length) throw fail('There are no ads in this view');
      filter = { _id: { $in: ids } };
      what = 'Total: current view';
    } else if (scope === 'account') {
      filter = {};
      what = 'Total: account';
    } else if (scope === 'type') {
      const camps = await Campaign.find({ type: body.type }, { _id: 1 }).lean();
      filter = { campaignId: { $in: camps.map((c) => c._id) } };
      what = `Total: ${clean(body.type, 40)} campaigns`;
    } else if (scope === 'campaign' && isId(body.campaignId)) {
      filter = { campaignId: body.campaignId };
      what = (await Campaign.findById(body.campaignId, { name: 1 }).lean())?.name || 'Campaign';
    } else if (scope === 'adgroup' && isId(body.adGroupId)) {
      filter = { adGroupId: body.adGroupId };
      what = (await AdGroup.findById(body.adGroupId, { name: 1 }).lean())?.name || 'Ad group';
    } else {
      throw fail('Pick what to change');
    }
    const ids = (await Ad.find(filter, { _id: 1 }).lean()).map((a) => a._id);
    res.json(await setFigure(req, ids, metric, value, range(body), what));
  });

  // ---------------- text and settings ----------------
  route('patch', '/api/ads/:id', async (req, res) => {
    const { field, value, index } = req.body || {};
    if (!isId(req.params.id)) throw fail('Ad not found', 404);
    const ad = await Ad.findById(req.params.id);
    if (!ad) throw fail('Ad not found', 404);
    const camp = await Campaign.findById(ad.campaignId).lean();
    const i = Number(index);
    const lineOk = Number.isInteger(i) && i >= 0 && i < ad.headlines.length;
    let column;
    let before;
    let after;
    switch (field) {
      case 'name': column = 'Ad name'; before = ad.name; ad.name = after = required(value, 80); break;
      case 'headline': {
        if (!lineOk) throw fail('Unknown line');
        column = `Text line ${i + 1}`;
        before = ad.headlines[i];
        after = clean(value, 90);
        if (!after) {
          if (ad.headlines.length <= 1) throw fail('An ad needs at least one line of text');
          ad.headlines.splice(i, 1);
          if (ad.extraCounts.length > i) ad.extraCounts.splice(i, 1);
          after = '(removed)';
        } else {
          ad.headlines.set(i, after);
        }
        break;
      }
      case 'addHeadline': {
        if (ad.headlines.length >= 10) throw fail('An ad can show at most 10 lines');
        column = 'Text line added'; before = ''; after = required(value, 90);
        ad.headlines.push(after);
        break;
      }
      case 'extraCount': {
        if (!lineOk) throw fail('Unknown line');
        column = `"+ more" on line ${i + 1}`;
        const n = count(value);
        // Same fallback as the table: search ads show "+ 4 more" on line 1 when nothing is stored.
        while (ad.extraCounts.length <= i) ad.extraCounts.push(0);
        before = String(ad.extraCounts[i] ?? 0);
        ad.extraCounts.set(i, n);
        after = String(n);
        break;
      }
      case 'mediaCount': column = 'Media count'; before = String(ad.mediaCount || 0); ad.mediaCount = count(value); after = String(ad.mediaCount); break;
      case 'displayUrl': column = 'Display URL'; before = ad.displayUrl || ''; ad.displayUrl = after = required(value, 100); break;
      case 'description': column = 'Description'; before = ad.description || ''; ad.description = after = clean(value, DESCRIPTION_MAX); break;
      case 'campaignLabel': column = 'Campaign name'; before = ad.campaignLabel || camp?.name || ''; ad.campaignLabel = clean(value, 100); after = ad.campaignLabel || camp?.name || ''; break;
      case 'adGroupLabel': {
        const g = await AdGroup.findById(ad.adGroupId).lean();
        column = 'Ad group name'; before = ad.adGroupLabel || g?.name || ''; ad.adGroupLabel = clean(value, 100); after = ad.adGroupLabel || g?.name || ''; break;
      }
      case 'videoTitle': column = 'Video'; before = ad.videoTitle || ''; ad.videoTitle = after = clean(value, 80); break;
      case 'adType': column = 'Ad type'; before = ad.adType || ''; ad.adType = after = required(value, 60); break;
      case 'strength': {
        const s = clean(value, 20);
        if (s && !STRENGTHS.includes(s)) throw fail('Pick an ad strength');
        column = 'Ad strength'; before = ad.strength || '–'; ad.strength = s || null; after = s || '–';
        break;
      }
      case 'eligibility': {
        if (!['Eligible', 'Not eligible', 'Pending'].includes(value)) throw fail('Pick a status');
        column = 'Status'; before = ad.eligibility; ad.eligibility = after = value;
        if (value === 'Pending' && !ad.reasons.length) ad.reasons = ['Under review'];
        break;
      }
      case 'reasons': {
        const list = parseReasons(value);
        column = 'Status reasons'; before = ad.reasons.join(', '); ad.reasons = list; after = list.join(', ');
        break;
      }
      case 'status': {
        if (!['enabled', 'paused'].includes(value)) throw fail('Pick enabled or paused');
        column = 'Ad status'; before = ad.status; ad.status = after = value;
        break;
      }
      default: throw fail('This field can’t be edited');
    }
    if (String(before) === String(after)) return res.json({ changed: false });
    await ad.save();
    await log(req, { level: 'Ad', entityName: `${ad.name} (${camp?.name ?? ''})`, column, before: String(before), after: String(after) });
    res.json({ changed: true });
  });

  route('patch', '/api/campaigns/:id', async (req, res) => {
    const { field, value } = req.body || {};
    if (!isId(req.params.id)) throw fail('Campaign not found', 404);
    const c = await Campaign.findById(req.params.id);
    if (!c) throw fail('Campaign not found', 404);
    let column;
    let before;
    let after;
    switch (field) {
      case 'name': column = 'Campaign name'; before = c.name; c.name = after = required(value, 100); break;
      case 'type':
        if (!CAMPAIGN_TYPES.includes(value)) throw fail('Pick a campaign type');
        column = 'Campaign type'; before = c.type; c.type = after = value;
        break;
      case 'status':
        if (!['enabled', 'paused'].includes(value)) throw fail('Pick enabled or paused');
        column = 'Campaign status'; before = c.status; c.status = after = value;
        break;
      case 'budget': {
        const v = parseMoney(value);
        if (v === undefined || v === 0) throw fail('Enter a daily amount like 40.00');
        column = 'Budget'; before = perDay(c.budget); c.budget = v; after = perDay(v);
        break;
      }
      case 'statusLabel': {
        const v = parseChoice(value, CAMPAIGN_STATUS_LABELS);
        if (v === undefined) throw fail('Pick a status');
        column = 'Status'; before = orAuto(c.statusLabel); c.statusLabel = v; after = orAuto(v);
        break;
      }
      case 'statusReasons': {
        const list = parseReasons(value);
        column = 'Status reasons'; before = (c.statusReasons || []).join(', '); c.statusReasons = list; after = list.join(', ');
        break;
      }
      case 'optimizationScore': {
        const v = parseScore(value);
        if (v === undefined) throw fail('Enter a score from 0 to 100');
        column = 'Optimization score'; before = formatScore(c.optimizationScore); c.optimizationScore = v; after = formatScore(v);
        break;
      }
      default: throw fail('This field can’t be edited');
    }
    if (before === after) return res.json({ changed: false });
    await c.save();
    await log(req, { level: 'Campaign', entityName: c.name, column, before, after });
    res.json({ changed: true });
  });

  route('patch', '/api/adgroups/:id', async (req, res) => {
    const { field, value } = req.body || {};
    if (!isId(req.params.id)) throw fail('Ad group not found', 404);
    const g = await AdGroup.findById(req.params.id);
    if (!g) throw fail('Ad group not found', 404);
    let column;
    let before;
    let after;
    switch (field) {
      case 'name': column = 'Ad group name'; before = g.name; g.name = after = required(value, 100); break;
      case 'status':
        if (!['enabled', 'paused'].includes(value)) throw fail('Pick enabled or paused');
        column = 'Ad group status'; before = g.status || 'enabled'; g.status = after = value;
        break;
      case 'statusLabel': {
        const v = parseChoice(value, AD_GROUP_STATUS_LABELS);
        if (v === undefined) throw fail('Pick a status');
        column = 'Status'; before = orAuto(g.statusLabel); g.statusLabel = v; after = orAuto(v);
        break;
      }
      case 'statusReasons': {
        const list = parseReasons(value);
        column = 'Status reasons'; before = (g.statusReasons || []).join(', '); g.statusReasons = list; after = list.join(', ');
        break;
      }
      case 'targetCpa': {
        const v = parseMoney(value);
        if (v === undefined || v === 0) throw fail('Enter an amount like 15.00');
        column = 'Target CPA'; before = money(g.targetCpa); g.targetCpa = v; after = money(v);
        break;
      }
      case 'groupType': {
        const v = parseChoice(value, AD_GROUP_TYPES);
        if (v === undefined) throw fail('Pick an ad group type');
        column = 'Ad group type'; before = orAuto(g.groupType); g.groupType = v; after = orAuto(v);
        break;
      }
      default: throw fail('This field can’t be edited');
    }
    if (before === after) return res.json({ changed: false });
    await g.save();
    await log(req, { level: 'Ad group', entityName: g.name, column, before, after });
    res.json({ changed: true });
  });

  // ---------------- adding and removing campaigns and ad groups ----------------
  const nextOrder = async (Model) => ((await Model.findOne().sort({ order: -1 }).lean())?.order ?? -1) + 1;
  const newGroup = (campaignId, name) => AdGroup.create({
    campaignId, name, status: 'enabled', statusLabel: '', statusReasons: [], targetCpa: null, groupType: '',
  });

  route('post', '/api/campaigns', async (req, res) => {
    const { type, name } = req.body || {};
    if (!CAMPAIGN_TYPES.includes(type)) throw fail('Pick a campaign type');
    const used = new Set((await Campaign.find({}, { name: 1 }).lean()).map((c) => c.name));
    const c = await Campaign.create({
      name: clean(name, 100) || firstFree(used, (n) => `New ${type} campaign${n > 1 ? ` ${n}` : ''}`),
      type, status: 'enabled', budget: DEFAULT_BUDGET[type], statusLabel: '', statusReasons: [], optimizationScore: null,
      order: await nextOrder(Campaign),
    });
    await newGroup(c._id, 'Ad group 1');
    await log(req, { level: 'Campaign', entityName: c.name, column: 'Campaign added', before: '', after: type });
    res.json({ id: String(c._id) });
  });

  // Deletes the campaigns with their ad groups, ads and daily rows.
  route('delete', '/api/campaigns', async (req, res) => {
    const ids = idList(req.body?.ids, 'Pick the campaigns to delete');
    const camps = await Campaign.find({ _id: { $in: ids } }).lean();
    if (!camps.length) throw fail('Campaign not found', 404);
    const cIds = camps.map((c) => c._id);
    const [groups, ads] = await Promise.all([AdGroup.find({ campaignId: { $in: cIds } }).lean(), Ad.find({ campaignId: { $in: cIds } }).lean()]);
    // Children first: if anything fails half-way the campaign is still there to delete again.
    await removeAds(ads, deleteMedia);
    await Stat.deleteMany({ campaignId: { $in: cIds } });
    await AdGroup.deleteMany({ campaignId: { $in: cIds } });
    await Campaign.deleteMany({ _id: { $in: cIds } });
    for (const c of camps) {
      const of = (list) => list.filter((x) => String(x.campaignId) === String(c._id)).length;
      await log(req, {
        level: 'Campaign', entityName: c.name, column: 'Campaign deleted', before: c.type || 'Campaign', after: '(deleted)',
        detail: `With ${plural(of(groups), 'ad group')} and ${plural(of(ads), 'ad')}`,
      });
    }
    res.json({ deleted: camps.length });
  });

  route('post', '/api/adgroups', async (req, res) => {
    const { campaignId, name } = req.body || {};
    if (!isId(campaignId)) throw fail('Campaign not found', 404);
    const camp = await Campaign.findById(campaignId).lean();
    if (!camp) throw fail('Campaign not found', 404);
    const used = new Set((await AdGroup.find({ campaignId: camp._id }, { name: 1 }).lean()).map((g) => g.name));
    const g = await newGroup(camp._id, clean(name, 100) || firstFree(used, (n) => `Ad group ${n}`));
    await log(req, { level: 'Ad group', entityName: g.name, column: 'Ad group added', before: '', after: `In ${camp.name}` });
    res.json({ id: String(g._id) });
  });

  route('delete', '/api/adgroups', async (req, res) => {
    const ids = idList(req.body?.ids, 'Pick the ad groups to delete');
    const groups = await AdGroup.find({ _id: { $in: ids } }).lean();
    if (!groups.length) throw fail('Ad group not found', 404);
    const gIds = groups.map((g) => g._id);
    const [campaigns, ads] = await Promise.all([campaignMap(), Ad.find({ adGroupId: { $in: gIds } }).lean()]);
    await removeAds(ads, deleteMedia);
    await Stat.deleteMany({ adGroupId: { $in: gIds } });
    await AdGroup.deleteMany({ _id: { $in: gIds } });
    for (const g of groups) {
      const n = ads.filter((a) => String(a.adGroupId) === String(g._id)).length;
      await log(req, {
        level: 'Ad group', entityName: `${g.name} (${campaigns.get(String(g.campaignId))?.name ?? ''})`, column: 'Ad group deleted',
        before: 'Ad group', after: '(deleted)', detail: `With ${plural(n, 'ad')}`,
      });
    }
    res.json({ deleted: groups.length });
  });

  // ---------------- adding and removing ads ----------------
  // New ads start with no stats (shown as "–"); the admin types numbers in afterwards.
  const NEW_AD = {
    search: { type: 'Search', format: 'search', adType: 'Responsive search ad' },
    video: { type: 'Video', format: 'video', adType: 'Responsive video ad' },
    display: { type: 'Display', format: 'display', adType: 'Responsive display ad' },
    demandgen: { type: 'Demand Gen', format: 'video', adType: 'Demand Gen video ad' },
  };
  route('post', '/api/ads', async (req, res) => {
    const { kind, campaignId, adGroupId } = req.body || {};
    const spec = NEW_AD[kind];
    if (!spec) throw fail('Pick an ad type');
    let camp;
    let group;
    // Optional adGroupId (the ads page of one ad group) picks the group and its campaign.
    if (adGroupId) {
      if (!isId(adGroupId) || !(group = await AdGroup.findById(adGroupId).lean())) throw fail('Ad group not found', 404);
      if (campaignId && String(group.campaignId) !== String(campaignId)) throw fail('That ad group is in another campaign');
    }
    const cId = group ? String(group.campaignId) : campaignId;
    if (cId) {
      if (!isId(cId) || !(camp = await Campaign.findById(cId).lean())) throw fail('Campaign not found', 404);
    } else {
      camp = await Campaign.findOne({ type: spec.type }).sort({ order: 1 }).lean()
        || (await Campaign.create({
          name: `New ${spec.type} campaign`, type: spec.type, status: 'enabled', budget: DEFAULT_BUDGET[spec.type], order: await nextOrder(Campaign),
        })).toObject();
    }
    group = group || await AdGroup.findOne({ campaignId: camp._id }).lean() || (await newGroup(camp._id, 'Ad group 1')).toObject();
    const enabled = camp.status === 'enabled';
    const ad = await Ad.create({
      campaignId: camp._id, adGroupId: group._id, name: 'New ad', format: spec.format, adType: spec.adType, status: 'enabled',
      headlines: ['New headline'], extraCounts: [], mediaCount: 0, hue: Math.floor(Math.random() * 360), strength: null,
      displayUrl: spec.format === 'search' ? 'www.example.com' : undefined, description: spec.format === 'search' ? '' : undefined, profile: 'none',
      eligibility: enabled ? 'Eligible' : 'Not eligible', reasons: enabled ? [] : ['Campaign is paused'], order: await nextOrder(Ad),
    });
    await log(req, { level: 'Ad', entityName: `${ad.name} (${camp.name})`, column: 'Ad added', before: '', after: spec.adType });
    res.json({ id: String(ad._id) });
  });

  route('delete', '/api/ads', async (req, res) => {
    const ids = idList(req.body?.ids, 'Pick the ads to delete');
    const ads = await Ad.find({ _id: { $in: ids } }).lean();
    if (!ads.length) throw fail('Ad not found', 404);
    const campaigns = await campaignMap();
    await removeAds(ads, deleteMedia);
    for (const a of ads) {
      await log(req, { level: 'Ad', entityName: `${a.name} (${campaigns.get(String(a.campaignId))?.name ?? ''})`, column: 'Ad deleted', before: a.adType || 'Ad', after: '(deleted)' });
    }
    res.json({ deleted: ads.length });
  });

  route('patch', '/api/account', async (req, res) => {
    const { field, value } = req.body || {};
    const next = parseAccountField(field, value);
    const acct = await getAccount();
    if ((acct[field] ?? '') === next) return res.json({ changed: false, account: publicAccount(acct) });
    const updated = { ...acct, [field]: next };
    if (field === 'avatar') {
      if (acct.avatarMedia) await deleteMedia(acct.avatarMedia);
      updated.avatarMedia = null;
    }
    await Setting.updateOne({ key: 'account' }, { $set: { value: updated } }, { upsert: true });
    // One line per value in the log (an address keeps its lines apart with commas).
    const shown = (v) => String(v ?? '').replace(/\n+/g, ', ');
    await log(req, {
      level: 'Account', entityName: updated.name, column: ACCOUNT_LABELS[field],
      before: field === 'avatar' ? 'Photo' : shown(acct[field]), after: field === 'avatar' ? '(removed)' : shown(next),
    });
    res.json({ changed: true, account: publicAccount(updated) });
  });

  // Admin replacements for any text or number on a page (double-tap edit): { [page]: { [original]: replacement } }.
  // An empty value removes the replacement, so the original shows again.
  app.get('/api/text-overrides', auth, async (req, res, next) => {
    try { res.json((await Setting.findOne({ key: 'textOverrides' }).lean())?.value || {}); } catch (e) { next(e); }
  });
  route('patch', '/api/text-overrides', async (req, res) => {
    const { page, original, value, shown } = req.body || {};
    const tidy = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
    // The new text may run over several lines; each line is tidied and blank lines dropped.
    const lines = (v) => (typeof v === 'string' ? v.split(/\r?\n/).map(tidy).filter(Boolean).join('\n') : '');
    const key = tidy(original), next = lines(value), where = tidy(page) || '/';
    if (!key) throw fail('Pick the text to change');
    const all = (await Setting.findOne({ key: 'textOverrides' }).lean())?.value || {};
    const onPage = { ...(all[where] || {}) };
    // Numbers are saved by where they sit ("@..."); history shows the number that was there.
    const label = key.startsWith('@') ? tidy(shown) || key : key;
    const before = onPage[key] ?? label;
    if (next && next !== key) onPage[key] = next; else delete onPage[key];
    const updated = { ...all, [where]: onPage };
    if (!Object.keys(onPage).length) delete updated[where];
    await Setting.updateOne({ key: 'textOverrides' }, { $set: { value: updated } }, { upsert: true });
    await log(req, { level: 'Page text', entityName: where, column: 'Text', before, after: next || label });
    res.json(updated);
  });

  // Profile photo for the avatar (images only; Cloudinary when configured, else local disk).
  app.post('/api/account/avatar', auth, adminOnly, upload.single('media'), async (req, res, next) => {
    try {
      if (!req.file) throw fail('Choose a photo');
      if (!req.file.mimetype.startsWith('image/')) throw fail('Choose an image (JPG, PNG, GIF or WEBP)');
      const saved = await saveMedia(req.file);
      const acct = await getAccount();
      const old = acct.avatarMedia;
      const updated = { ...acct, avatar: saved.url, avatarMedia: saved };
      await Setting.updateOne({ key: 'account' }, { $set: { value: updated } }, { upsert: true });
      if (old?.publicId && old.publicId !== saved.publicId) await deleteMedia(old);
      await log(req, { level: 'Account', entityName: updated.name, column: 'Profile photo', before: old ? 'Photo' : 'Letter', after: 'New photo' });
      res.json({ changed: true, account: publicAccount(updated) });
    } catch (e) {
      if (e.expose || e.status) return res.status(e.status || 400).json({ error: e.message });
      next(e);
    }
  });
}
