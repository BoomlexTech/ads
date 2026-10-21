// "When and where ads showed" (Insights and reports): this section's own campaigns, table rows
// and daily figures, the report its page reads and the admin's edits. Nothing here reads or
// changes the Ads section's data (Campaign, AdGroup, Ad, Stat).
import mongoose from 'mongoose';
import { distribute } from './rescale.js';
import { addDays, daysBetween, eachDay, parseISO, toISO, todayISO } from '../shared/dates.js';
import {
  WW_TABS, WW_DATA_START, WW_BASE, WW_METRICS, WW_EXTRAS, VIEW_ONLY, CAMPAIGN_TYPES, CAMPAIGN_STATUSES, DEVICES, LEVELS,
  PLACEMENT_TYPES, DAYS, isViewType, isWwMetric, isExtra, isAdditive, solveWw, parseWw, parseBidAdj, fmtWw, fmtBidAdj,
  fmtAdGroupBidAdj, hourLabel, colLabelWw, tabOf,
} from '../shared/whenwhere.js';

const { Schema } = mongoose;

export const WwCampaign = mongoose.model('WwCampaign', new Schema({
  name: String,
  type: String, // 'Search' | 'Display' | 'Video' | 'Demand Gen'
  status: String, // 'enabled' | 'paused' | 'removed'
  order: Number,
}));

// One line of a tab's table; each tab uses its own fields and leaves the others empty.
export const WwRow = mongoose.model('WwRow', new Schema({
  tab: { type: String, index: true }, // 'devices' | 'when' | 'where' | 'locations'
  campaignId: Schema.Types.ObjectId,
  campaignLabel: { type: String, default: '' }, // this row's Campaign / Added to text; '' = the campaign's name
  order: Number,
  device: String, // devices
  level: String,
  bidAdj: { type: Number, default: null }, // whole percent
  adGroupBidAdj: { type: Number, default: null },
  dow: Number, // when: 0 = Sunday
  hour: Number, // 0-23
  placement: String, // where
  placementType: String,
  adGroup: String,
  location: String, // locations
  extras: { type: Schema.Types.Mixed, default: () => ({}) }, // typed-in figures (WW_EXTRAS), one per row
  added: { type: Boolean, default: false }, // made by the admin (Duplicate): starts without figures
}));

const statSchema = new Schema({
  rowId: Schema.Types.ObjectId,
  tab: String,
  date: String, // YYYY-MM-DD; a 'when' row only has days on its own weekday
  impressions: { type: Number, default: null },
  interactions: { type: Number, default: null },
  clicks: { type: Number, default: null },
  views: { type: Number, default: null },
  cost: { type: Number, default: null }, // cents
  conversions: { type: Number, default: null }, // hundredths
});
statSchema.index({ rowId: 1, date: 1 }, { unique: true });
statSchema.index({ tab: 1, date: 1 });
export const WwStat = mongoose.model('WwStat', statSchema);

const TABS = WW_TABS.map((t) => t.key);
// A removed campaign keeps its figures in the account and type totals; the page's default view
// (Campaign status: Enabled, Paused) leaves it out.
const STATUSES = [...CAMPAIGN_STATUSES, 'removed'];
const SEGMENTS = ['week', 'month', 'quarter', 'year', 'dow'];
const HOURS = Array.from({ length: 24 }, (_, h) => hourLabel(h));
const MAX_IDS = 1500; // a whole tab's rows fit, and the request stays under the 50 kB body limit
const MAX_CAMPAIGNS = 100; // campaigns one delete may take
const MAX_NEW_DAYS = 60000; // daily rows one figure edit may add

const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);
// `field`: the request field the message is about (the add dialog shows it under that field).
const fail = (msg, status = 400, field) => Object.assign(new Error(msg), { status, expose: true, ...(field && { field }) });
// One line of plain text: control characters and runs of spaces collapsed, length capped.
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const required = (v, max) => {
  const s = clean(v, max);
  if (!s) throw fail('Enter some text');
  return s;
};
const idList = (ids, msg, max = MAX_IDS) => {
  if (!Array.isArray(ids) || !ids.length || ids.length > max || !ids.every(isId)) throw fail(msg);
  return [...new Set(ids)];
};
const sum = (list) => list.reduce((a, b) => a + b, 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// The first of make(1), make(2)… that isn't taken.
function firstFree(used, make) {
  for (let n = 1; ; n++) if (!used.has(make(n))) return make(n);
}
// One more than the highest order of the documents matching `q` (0 for the first).
const nextOrder = async (Model, q = {}) => ((await Model.findOne(q, { order: 1 }).sort({ order: -1 }).lean())?.order ?? -1) + 1;

// The app's change log (History, registered by models.js, which this section doesn't import).
async function log(req, entry) {
  await mongoose.model('History').create({ user: req.session.user, level: 'When and where', ...entry });
}

// First and last day of the week (Monday start) / month / quarter / year holding a date.
function periodOf(kind, iso) {
  const d = parseISO(iso);
  if (kind === 'week') {
    const start = addDays(iso, -((d.getDay() + 6) % 7));
    return [start, addDays(start, 6)];
  }
  const span = kind === 'month' ? 1 : kind === 'quarter' ? 3 : 12;
  const first = kind === 'year' ? 0 : Math.floor(d.getMonth() / span) * span;
  return [toISO(new Date(d.getFullYear(), first, 1)), toISO(new Date(d.getFullYear(), first + span, 0))];
}

// Base figures added up over daily rows: null for a figure none of them has.
function sumDocs(docs) {
  const out = {};
  for (const m of WW_BASE) {
    let s = 0;
    let n = 0;
    for (const d of docs) if (d[m] != null) { s += d[m]; n++; }
    out[m] = n ? s : null;
  }
  return out;
}
const ZERO = Object.fromEntries(WW_BASE.map((m) => [m, 0]));
const hasFigures = (d) => WW_BASE.some((m) => d[m] > 0);
// The base figure a column is worked back to (CTR -> clicks, Avg. CPM -> cost…).
const ONES = Object.fromEntries(WW_BASE.map((m) => [m, 1]));
const baseOf = (metric) => solveWw(metric, 0, ONES).base;

// ---------------------------------------------------------------- report
// The page's data for one tab and date range: the campaigns, the tab's rows with their figures over
// the range (0 when a row has no days in it), the chart's daily series and, when asked, each row's
// figures per period (Segment > Time). `rows` are the tab's rows to include, `stats` their daily
// rows (others are ignored).
export function buildReport({ campaigns, rows, stats, from, to, segment, today = todayISO() }) {
  const types = new Map(campaigns.map((c) => [String(c._id), c.type]));
  const byRow = new Map(rows.map((r) => [String(r._id), []]));
  for (const d of stats) {
    if (d.date >= from && d.date <= to) byRow.get(String(d.rowId))?.push(d);
  }
  const viewRow = new Set(rows.filter((r) => isViewType(types.get(String(r.campaignId)))).map((r) => String(r._id)));

  const byDate = new Map();
  for (const [id, docs] of byRow) {
    for (const d of docs) {
      if (!byDate.has(d.date)) byDate.set(d.date, { docs: [], vCost: 0, vImpr: 0 });
      const e = byDate.get(d.date);
      e.docs.push(d);
      if (viewRow.has(id)) {
        e.vCost += d.cost || 0;
        e.vImpr += d.impressions || 0;
      }
    }
  }
  const series = eachDay(from, to).map((date) => {
    const e = byDate.get(date);
    return e ? { date, ...sumDocs(e.docs), vCost: e.vCost, vImpr: e.vImpr } : { date, ...ZERO, vCost: 0, vImpr: 0 };
  });

  let segments;
  if (segment) {
    const parts = new Map();
    for (const [rowId, docs] of byRow) {
      for (const d of docs) {
        const [start, end] = segment === 'dow' ? [from, to] : periodOf(segment, d.date);
        const key = segment === 'dow' ? parseISO(d.date).getDay() : start;
        const k = `${rowId}|${key}`;
        if (!parts.has(k)) parts.set(k, { rowId, key, from: start < from ? from : start, to: end > to ? to : end, docs: [] });
        parts.get(k).docs.push(d);
      }
    }
    segments = [...parts.values()].map(({ docs, ...p }) => ({ ...p, ...sumDocs(docs) }));
  }

  return {
    today, dataStart: WW_DATA_START,
    campaigns: campaigns.map((c) => ({ id: String(c._id), name: c.name, type: c.type, status: c.status, order: c.order })),
    rows: rows.map((r) => {
      const docs = byRow.get(String(r._id));
      return {
        id: String(r._id), tab: r.tab, campaignId: String(r.campaignId), campaignLabel: r.campaignLabel || '',
        device: r.device ?? null, level: r.level ?? null, bidAdj: r.bidAdj ?? null, adGroupBidAdj: r.adGroupBidAdj ?? null,
        dow: r.dow ?? null, hour: r.hour ?? null, placement: r.placement ?? null, placementType: r.placementType ?? null,
        adGroup: r.adGroup ?? null, location: r.location ?? null, extras: r.extras || {}, order: r.order ?? 0, added: !!r.added,
        has: docs.some(hasFigures), ...(docs.length ? sumDocs(docs) : ZERO),
      };
    }),
    series,
    ...(segments && { segments }),
  };
}

// ---------------------------------------------------------------- row fields
// Which tabs' rows each field belongs to.
const FIELD_TABS = {
  device: ['devices'], level: ['devices'], bidAdj: ['devices'], adGroupBidAdj: ['devices'],
  campaignLabel: TABS, dow: ['when'], hour: ['when'],
  placement: ['where'], placementType: ['where'], adGroup: ['where'], location: ['locations'],
};
// The table column each field shows in (for the change log).
const FIELD_COLUMN = { campaignLabel: 'campaign', dow: 'day' };

// A day / hour as its number or as shown ("Monday", "4 PM – 5 PM"); undefined when neither.
function choiceIndex(value, labels) {
  const s = String(value ?? '').trim();
  if (/^\d{1,2}$/.test(s) && Number(s) < labels.length) return Number(s);
  const i = labels.indexOf(s);
  return i >= 0 ? i : undefined;
}

// The value to store for a row field the admin typed or picked; throws (400, with a message to
// show) when it isn't valid.
export function parseRowField(field, value) {
  const text = (max) => {
    if (typeof value !== 'string') throw fail('Enter some text');
    return clean(value, max);
  };
  switch (field) {
    case 'device':
      if (!DEVICES.includes(value)) throw fail('Pick a device');
      return value;
    case 'level':
      if (!LEVELS.includes(value)) throw fail('Pick a level');
      return value;
    case 'campaignLabel': return text(100);
    case 'bidAdj': case 'adGroupBidAdj': {
      const v = parseBidAdj(value);
      if (v === undefined) throw fail('Enter a percentage from -100 to 900');
      return v;
    }
    case 'dow': {
      const v = choiceIndex(value, DAYS);
      if (v === undefined) throw fail('Pick a day');
      return v;
    }
    case 'hour': {
      const v = choiceIndex(value, HOURS);
      if (v === undefined) throw fail('Pick an hour');
      return v;
    }
    case 'placement': return required(text(120), 120);
    case 'placementType': return text(60);
    case 'adGroup': return text(100);
    case 'location': return required(text(100), 100);
    default: throw fail('This field can’t be edited');
  }
}

// What a row the admin adds starts with, per tab; undefined: the admin must give it.
const NEW_ROW = {
  devices: { device: DEVICES[0], level: LEVELS[0], bidAdj: null, adGroupBidAdj: null },
  when: { dow: 1, hour: 9 }, // Monday, 9 AM – 10 AM
  where: { placement: undefined, placementType: PLACEMENT_TYPES[0], adGroup: '' },
  locations: { location: undefined },
};

// A new row's fields from the add dialog: those of its tab only (others are ignored), each checked
// as an edit of it would be, missing ones (null or left out) at their defaults.
export function newRowFields(tab, body) {
  const out = {};
  for (const [field, def] of Object.entries(NEW_ROW[tab])) {
    const v = body[field];
    try {
      out[field] = v == null && def !== undefined ? def : parseRowField(field, v);
    } catch (e) {
      throw Object.assign(e, { field });
    }
  }
  return out;
}

// Daily figures of 'when' rows moved to another weekday (0 = Sunday). Each day goes to that weekday
// of its own week (Monday start, as the Week segment and the chart count weeks), or, when that is
// before `lo` (the data start) or after `hi` (today), where no range can show it, to the nearest one
// inside them. Days of a row that land on the same date are added up into one. Returns `keep`, the
// docs to change ({ _id, date, and the added-up figures when merged }), and `drop`, the ids of the
// docs merged into another.
export function moveToWeekday(docs, dow, lo, hi) {
  const groups = new Map();
  for (const d of docs) {
    let t = addDays(d.date, ((dow + 6) % 7) - ((parseISO(d.date).getDay() + 6) % 7));
    const late = daysBetween(hi, t);
    if (late > 0) t = addDays(t, -7 * Math.ceil(late / 7));
    const early = daysBetween(t, lo);
    if (early > 0) t = addDays(t, 7 * Math.ceil(early / 7));
    const k = `${d.rowId}|${t}`;
    if (!groups.has(k)) groups.set(k, { date: t, list: [] });
    groups.get(k).list.push(d);
  }
  const keep = [];
  const drop = [];
  for (const { date, list } of groups.values()) {
    // A doc already on that date stays the one kept, so the others never move onto a taken date.
    const main = list.find((d) => d.date === date) || list[0];
    for (const d of list) if (d !== main) drop.push(d._id);
    if (list.length > 1) keep.push({ _id: main._id, date, ...sumDocs(list) });
    else if (main.date !== date) keep.push({ _id: main._id, date });
  }
  return { keep, drop };
}

function shownField(field, v, campaignName) {
  if (field === 'bidAdj') return fmtBidAdj(v);
  if (field === 'adGroupBidAdj') return fmtAdGroupBidAdj(v);
  if (field === 'dow') return DAYS[v] ?? '';
  if (field === 'hour') return v == null ? '' : hourLabel(v);
  if (field === 'campaignLabel') return v || campaignName || '';
  return v ?? '';
}

// A row as the change log names it: "Mobile phones (Video views - 2025-04-04)".
function rowName(r, names) {
  const what = r.tab === 'devices' ? r.device : r.tab === 'when' ? `${DAYS[r.dow] ?? ''} ${hourLabel(r.hour)}`
    : r.tab === 'where' ? r.placement : r.location;
  return `${what} (${r.campaignLabel || names.get(String(r.campaignId)) || ''})`;
}
const rowsName = (rows, names) => (rows.length === 1 ? rowName(rows[0], names) : `${tabOf(rows[0].tab).label}: ${rows.length} rows`);

// ---------------------------------------------------------------- routes
export function registerWhenWhere(app, { auth, adminOnly, validRange }) {
  const route = (method, path, fn) => app[method](path, auth, adminOnly, async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e.expose) return res.status(e.status).json({ error: e.message, ...(e.field && { field: e.field }) });
      next(e);
    }
  });
  const range = (body) => {
    if (!validRange(body.from, body.to)) throw fail('Bad date range');
    return { from: body.from, to: body.to };
  };
  const campaignInfo = async () => {
    const list = await WwCampaign.find({}, { name: 1, type: 1 }).lean();
    return { names: new Map(list.map((c) => [String(c._id), c.name])), types: new Map(list.map((c) => [String(c._id), c.type])) };
  };
  const rowsOf = async (ids) => {
    const rows = await WwRow.find({ _id: { $in: idList(ids, 'Pick the rows') } }).sort({ order: 1, _id: 1 }).lean();
    if (!rows.length) throw fail('Row not found', 404);
    return rows;
  };
  // The campaign the admin picked for rows (it must still be there).
  const campaignOf = async (id) => {
    const c = isId(id) && await WwCampaign.findOne({ _id: id }, { name: 1 }).lean();
    if (!c) throw fail('Pick a campaign', 400, 'campaignId');
    return c;
  };

  // ?tab&from&to[&campaigns=id,id|none][&segment=week|month|quarter|year|dow]
  app.get('/api/ww/report', auth, async (req, res, next) => {
    try {
      const { tab, from, to, segment } = req.query;
      if (!TABS.includes(tab)) return res.status(400).json({ error: 'Bad tab' });
      if (!validRange(from, to)) return res.status(400).json({ error: 'Bad date range' });
      if (segment !== undefined && !SEGMENTS.includes(segment)) return res.status(400).json({ error: 'Bad segment' });
      // Optional: only some campaigns' rows ('none' or '' for none at all).
      let only = null;
      if (req.query.campaigns !== undefined) {
        const v = req.query.campaigns;
        const ids = typeof v === 'string' && v !== 'none' ? v.split(',').filter(Boolean) : [];
        if (typeof v !== 'string' || ids.length > MAX_IDS || !ids.every((id) => /^[0-9a-f]{24}$/i.test(id))) {
          return res.status(400).json({ error: 'Bad campaigns' });
        }
        only = new Set(ids.map((id) => id.toLowerCase()));
      }
      const [campaigns, all, stats] = await Promise.all([
        WwCampaign.find().sort({ order: 1, _id: 1 }).lean(),
        WwRow.find({ tab }).sort({ order: 1, _id: 1 }).lean(),
        WwStat.find({ tab, date: { $gte: from, $lte: to } }, { _id: 0, tab: 0, __v: 0 }).lean(),
      ]);
      const rows = only ? all.filter((r) => only.has(String(r.campaignId))) : all;
      res.json(buildReport({ campaigns, rows, stats, from, to, segment }));
    } catch (e) { next(e); }
  });

  // A typed figure for some rows over a date range (formula columns are worked back to the base
  // figure they come from), spread over those rows' days in proportion to what is there now, so
  // every total and the chart follow. A typed-in column (WW_EXTRAS) is set on the rows themselves.
  // `dow` (0-6, optional): only the days on that weekday (a Day of the week segment row, whose
  // range is the whole report's).
  route('patch', '/api/ww/metric', async (req, res) => {
    const body = req.body || {};
    const { metric, value } = body;
    if (!isWwMetric(metric)) throw fail('This column can’t be edited');
    const dow = body.dow ?? null;
    if (dow !== null && !(Number.isInteger(dow) && dow >= 0 && dow <= 6)) throw fail('Bad day of the week');
    let rows = await rowsOf(body.rowIds);
    const v = parseWw(metric, value);
    if (v === undefined) throw fail('Enter a number');
    const { names, types } = await campaignInfo();
    const what = clean(body.label, 100) || rowsName(rows, names);

    if (isExtra(metric)) {
      // Kept per row, not per day.
      if (dow !== null) throw fail('This column can’t be set for one day of the week');
      const key = `extras.${metric}`;
      const now = rows.map((r) => r.extras?.[metric] ?? null);
      // Counts and amounts are split over the rows like their current values; rates, averages and
      // ratios are the same on each row.
      const adds = isAdditive(metric);
      const parts = v == null ? null : adds ? distribute(now.map((x) => x || 0), v) : rows.map(() => v);
      await WwRow.bulkWrite(rows.map((r, i) => ({
        updateOne: { filter: { _id: r._id }, update: parts ? { $set: { [key]: parts[i] } } : { $unset: { [key]: '' } } },
      })));
      const had = now.filter((x) => x != null);
      const before = !had.length ? null : adds ? sum(had) : had.every((x) => x === had[0]) ? had[0] : null;
      await log(req, { entityName: what, column: WW_EXTRAS[metric].label, before: fmtWw(metric, before), after: fmtWw(metric, v) });
      return res.json({ ok: true });
    }

    const { from, to } = range(body);
    if (VIEW_ONLY.has(metric)) rows = rows.filter((r) => isViewType(types.get(String(r.campaignId))));
    if (!rows.length) throw fail('There are no Video or Demand Gen campaigns here');
    const ids = rows.map((r) => r._id);
    const date = { $gte: from, $lte: to };
    const onDay = (iso) => dow === null || parseISO(iso).getDay() === dow;
    const findDocs = async () => (await WwStat.find({ rowId: { $in: ids }, date }).lean()).filter((d) => onDay(d.date));
    let docs = await findDocs();
    const sums = Object.fromEntries(WW_BASE.map((m) => [m, sum(docs.map((d) => d[m] || 0))]));
    // An emptied cell empties the base figure the column comes from.
    const solved = v === null ? { base: baseOf(metric), total: null } : solveWw(metric, v, sums);
    if (solved.error) throw fail(solved.error);
    const { base, total } = solved;
    let weights = docs.map((d) => d[base] || 0);
    if (total && !weights.some((w) => w > 0)) {
      // None of this figure yet: follow the rows' other figures, or else spread it evenly over
      // every day of the range (or of `dow` in it; 'when' rows: the days on their weekday).
      weights = docs.map((d) => d.impressions || d.interactions || d.clicks || d.views || d.cost || 0);
      if (!weights.some((w) => w > 0)) {
        const have = new Set(docs.map((d) => `${d.rowId}|${d.date}`));
        const days = eachDay(from, to).filter(onDay);
        const add = [];
        for (const r of rows) {
          for (const day of days) {
            if (r.tab === 'when' && parseISO(day).getDay() !== r.dow) continue;
            // New days start at zero (views only for Video and Demand Gen rows), so the row's other
            // figures read 0, not a dash, once this one is typed in.
            if (!have.has(`${r._id}|${day}`)) {
              add.push({ rowId: r._id, tab: r.tab, date: day, impressions: 0, interactions: 0, clicks: 0, cost: 0, conversions: 0,
                views: isViewType(types.get(String(r.campaignId))) ? 0 : null });
            }
            if (add.length > MAX_NEW_DAYS) throw fail('Pick a shorter date range for this figure');
          }
        }
        if (add.length) {
          await WwStat.insertMany(add);
          docs = await findDocs();
        }
        weights = docs.map(() => 0);
      }
    }
    // E.g. a 'when' row whose weekday isn't in the range (or isn't the segment's).
    if (total && !docs.length) throw fail('There are no days for this figure in the date range');
    const parts = total == null ? docs.map(() => null) : distribute(weights, total);
    // Search and Display interactions are their clicks: the two stay equal.
    const linked = { clicks: 'interactions', interactions: 'clicks' }[base];
    const plain = new Set(rows.filter((r) => !isViewType(types.get(String(r.campaignId)))).map((r) => String(r._id)));
    if (docs.length) {
      await WwStat.bulkWrite(docs.map((d, i) => ({
        updateOne: {
          filter: { _id: d._id },
          update: { $set: { [base]: parts[i], ...(linked && plain.has(String(d.rowId)) && { [linked]: parts[i] }) } },
        },
      })));
    }
    const before = fmtWw(base, docs.some((d) => d[base] != null) ? sums[base] : null);
    await log(req, {
      entityName: what, column: WW_METRICS[metric].label, before,
      after: `${fmtWw(metric, v)} (${WW_METRICS[base].label} ${fmtWw(base, total)}, ${from} – ${to}${dow === null ? '' : `, ${DAYS[dow]}s`})`,
    });
    res.json({ ok: true });
  });

  // A new row the admin fills in afterwards: { tab, campaignId, ...that tab's fields } -> { id }. It
  // starts without figures and goes last in its tab.
  route('post', '/api/ww/rows', async (req, res) => {
    const body = req.body || {};
    const { tab } = body;
    if (!TABS.includes(tab)) throw fail('Bad tab');
    const camp = await campaignOf(body.campaignId);
    const fields = newRowFields(tab, body);
    const row = await WwRow.create({
      tab, campaignId: camp._id, campaignLabel: '', order: await nextOrder(WwRow, { tab }), ...fields, extras: {}, added: true,
    });
    await log(req, { entityName: rowName(row, new Map([[String(camp._id), camp.name]])), column: 'Row added', before: '', after: tabOf(tab).label });
    res.json({ id: String(row._id) });
  });

  // A text field or setting on some rows: { ids, field, value } -> { changed: rows changed }.
  route('patch', '/api/ww/rows', async (req, res) => {
    const { field, value } = req.body || {};
    const rows = await rowsOf(req.body?.ids);
    if (field === 'campaignId') {
      // To another campaign: the rows take their figures with them and show its name.
      const camp = await campaignOf(value);
      const changed = rows.filter((r) => String(r.campaignId) !== String(camp._id));
      if (!changed.length) return res.json({ changed: 0 });
      await WwRow.updateMany({ _id: { $in: changed.map((r) => r._id) } }, { $set: { campaignId: camp._id, campaignLabel: '' } });
      const { names } = await campaignInfo();
      await log(req, {
        entityName: rowsName(changed, names), column: colLabelWw('campaign'),
        before: names.get(String(changed[0].campaignId)) ?? '', after: camp.name,
      });
      return res.json({ changed: changed.length });
    }
    const v = parseRowField(field, value);
    if (!rows.every((r) => FIELD_TABS[field].includes(r.tab))) throw fail('This field can’t be edited');
    const changed = rows.filter((r) => (r[field] ?? (field === 'campaignLabel' ? '' : null)) !== v);
    if (!changed.length) return res.json({ changed: 0 });
    if (field === 'dow') {
      // A 'when' row's days stay on its weekday: they move to the new one, inside the dates a range
      // can show. Days merged away go first, so no day moves onto a date still taken (rowId + date
      // is unique).
      const docs = await WwStat.find({ rowId: { $in: changed.map((r) => r._id) } }).lean();
      const { keep, drop } = moveToWeekday(docs, v, WW_DATA_START, todayISO());
      const ops = [
        ...drop.map((_id) => ({ deleteOne: { filter: { _id } } })),
        ...keep.map(({ _id, ...set }) => ({ updateOne: { filter: { _id }, update: { $set: set } } })),
      ];
      if (ops.length) await WwStat.bulkWrite(ops);
    }
    await WwRow.updateMany({ _id: { $in: changed.map((r) => r._id) } }, { $set: { [field]: v } });
    const { names } = await campaignInfo();
    const name = names.get(String(changed[0].campaignId));
    await log(req, {
      entityName: rowsName(changed, names), column: colLabelWw(FIELD_COLUMN[field] || field),
      before: shownField(field, changed[0][field] ?? null, name), after: shownField(field, v, name),
    });
    res.json({ changed: changed.length });
  });

  // Copies of rows (without figures, typed-in ones included: totals would count them twice), each
  // right after its original: { ids } -> { ids: the copies }.
  route('post', '/api/ww/rows/duplicate', async (req, res) => {
    const rows = await rowsOf(req.body?.ids);
    const copyOf = new Map();
    for (const tab of new Set(rows.map((r) => r.tab))) {
      const all = await WwRow.find({ tab }).sort({ order: 1, _id: 1 }).lean();
      const picked = new Set(rows.filter((r) => r.tab === tab).map((r) => String(r._id)));
      const copies = [];
      const moves = [];
      let order = 0;
      for (const r of all) {
        if (r.order !== order) moves.push({ updateOne: { filter: { _id: r._id }, update: { $set: { order } } } });
        order++;
        if (!picked.has(String(r._id))) continue;
        const { _id, __v, ...fields } = r;
        const copy = { ...fields, extras: {}, _id: new mongoose.Types.ObjectId(), order: order++, added: true };
        copies.push(copy);
        copyOf.set(String(_id), String(copy._id));
      }
      if (moves.length) await WwRow.bulkWrite(moves);
      await WwRow.insertMany(copies);
    }
    const { names } = await campaignInfo();
    await log(req, { entityName: rowsName(rows, names), column: 'Row copied', before: '', after: `${rows.length} new` });
    res.json({ ids: [...copyOf.values()] });
  });

  // Removes rows with their daily figures.
  route('delete', '/api/ww/rows', async (req, res) => {
    const rows = await rowsOf(req.body?.ids);
    const ids = rows.map((r) => r._id);
    // Figures first: if anything fails half-way the rows are still there to remove again.
    await WwStat.deleteMany({ rowId: { $in: ids } });
    await WwRow.deleteMany({ _id: { $in: ids } });
    const { names } = await campaignInfo();
    await log(req, { entityName: rowsName(rows, names), column: 'Row removed', before: rows.length === 1 ? 'Row' : `${rows.length} rows`, after: '(removed)' });
    res.json({ deleted: rows.length });
  });

  route('patch', '/api/ww/campaigns/:id', async (req, res) => {
    const { field, value } = req.body || {};
    if (!isId(req.params.id)) throw fail('Campaign not found', 404);
    const c = await WwCampaign.findById(req.params.id);
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
        if (!STATUSES.includes(value)) throw fail('Pick enabled, paused or removed');
        column = 'Campaign status'; before = c.status; c.status = after = value;
        break;
      default: throw fail('This field can’t be edited');
    }
    if (before === after) return res.json({ changed: false });
    await c.save();
    await log(req, { entityName: c.name, column, before, after });
    res.json({ changed: true });
  });

  // A new campaign, without rows, last in the list: { name?, type?, status? } -> { id }.
  route('post', '/api/ww/campaigns', async (req, res) => {
    const body = req.body || {};
    const or = (v, def) => (v == null || v === '' ? def : v);
    const type = or(body.type, 'Search');
    const status = or(body.status, 'enabled');
    if (body.name != null && typeof body.name !== 'string') throw fail('Enter a campaign name', 400, 'name');
    if (!CAMPAIGN_TYPES.includes(type)) throw fail('Pick a campaign type', 400, 'type');
    if (!STATUSES.includes(status)) throw fail('Pick enabled, paused or removed', 400, 'status');
    const used = new Set((await WwCampaign.find({}, { name: 1 }).lean()).map((c) => c.name));
    const c = await WwCampaign.create({
      name: clean(body.name, 100) || firstFree(used, (n) => `Campaign #${n}`), type, status, order: await nextOrder(WwCampaign),
    });
    await log(req, { entityName: c.name, column: 'Campaign added', before: '', after: type });
    res.json({ id: String(c._id) });
  });

  // Deletes campaigns with all their rows and the rows' daily figures: { ids } -> { deleted, rows }.
  route('delete', '/api/ww/campaigns', async (req, res) => {
    const ids = idList(req.body?.ids, 'Pick the campaigns to delete', MAX_CAMPAIGNS);
    const camps = await WwCampaign.find({ _id: { $in: ids } }).lean();
    if (!camps.length) throw fail('Campaign not found', 404);
    const cIds = camps.map((c) => c._id);
    const rows = await WwRow.find({ campaignId: { $in: cIds } }, { campaignId: 1 }).lean();
    // Children first: if anything fails half-way the campaign is still there to delete again.
    await WwStat.deleteMany({ rowId: { $in: rows.map((r) => r._id) } });
    await WwRow.deleteMany({ campaignId: { $in: cIds } });
    await WwCampaign.deleteMany({ _id: { $in: cIds } });
    for (const c of camps) {
      const n = rows.filter((r) => String(r.campaignId) === String(c._id)).length;
      await log(req, { entityName: c.name, column: 'Campaign deleted', before: c.type || 'Campaign', after: '(deleted)', detail: `With ${plural(n, 'row')}` });
    }
    res.json({ deleted: camps.length, rows: rows.length });
  });
}


// ---------------------------------------------------------------- starting data
// The same deterministic generator as the Ads seed, with its own stream.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// cost in cents, conversions whole (stored as hundredths).
const fig = (impressions, interactions, clicks, views, cost, conversions = 0) => ({ impressions, interactions, clicks, views, cost, conversions });
const [CHANNEL, VIDEO, SITE, APP] = PLACEMENT_TYPES;

// The campaigns, in table order. status: 'paused' unless given; removed campaigns are left out of
// the page's default view (Campaign status: Enabled, Paused) but count in the account and type
// totals. from / to: the days they served; hours: the hours of the day they served in (skip:
// "dow/hour" cells they didn't); total: their all-time figures (Search: interactions are the
// clicks, no views); off: devices with a -100% bid adjustment (no traffic); when / devices: rows with
// fixed figures; placements: how many rows Where ads showed lists, the first ones fixed.
// The video views campaigns count engagements only; the other Video campaigns bring the clicks.
const SEED = [
  {
    key: 'vv', name: 'Video views - 2025-04-04', type: 'Video', from: '2025-04-04', to: '2025-04-24', hours: [11, 13, 15, 16, 19, 20, 22, 23],
    total: fig(9180, 2900, 0, 1450, 24260), off: ['Tablets', 'TV screens'],
    when: { '1/16': fig(1892, 777, 0, 393, 5902), '5/22': fig(2542, 650, 0, 249, 5716), '5/23': fig(1400, 381, 0, 149, 3275), '1/15': fig(747, 364, 0, 170, 2373) },
    adGroup: 'Video views - 2025-04-04', placements: { n: 40 },
  },
  {
    key: 'vt', name: 'Video test views - 2025-04-18', type: 'Video', from: '2025-04-18', to: '2025-05-08', hours: [9, 10, 12, 13, 14, 16, 17, 18, 20, 21],
    total: fig(17190, 7000, 72, 4080, 60180), when: { '6/16': fig(817, 397, 0, 216, 2588) },
    devices: { 'Mobile phones': fig(14057, 6184, 58, 3551, 49715) }, adGroup: 'Video views - 2025-04-18',
    placements: { n: 80, fixed: [['5s Crafts', CHANNEL, fig(370, 170, 0, 104, 1140)], ['JOGRANA81 Vlogs', CHANNEL, fig(347, 154, 0, 108, 1409)]] },
  },
  {
    // One Friday, one hour.
    key: 'dg', name: 'Demand Gen - 2025-04-18', type: 'Demand Gen', from: '2025-04-18', to: '2025-04-18', hours: [11],
    total: fig(5676, 596, 38, 299, 28693, 4), off: ['Computers', 'Tablets', 'TV screens'], adGroup: 'Ad group 1', placements: { n: 10 },
  },
  { key: 's1', name: 'Website traffic-Search-1', type: 'Search', from: '2025-09-01', to: '2025-10-12', hours: [9, 11, 14, 17, 19], total: fig(6912, 391, 391, null, 47906) },
  {
    key: 'wv', name: 'Website traffic-Video-1', type: 'Video', from: '2025-06-09', to: '2025-06-29', hours: [12, 14, 17, 18, 20, 22],
    total: fig(3033, 671, 111, 520, 7787, 1), adGroup: 'Ad group 1', placements: { n: 12 },
  },
  { key: 'fr', name: 'FR Video Conversions - 2025-03-21 #2', type: 'Demand Gen' },
  {
    key: 'sj', name: 'Website traffic-Search-JAN2026', type: 'Search', from: '2026-01-05', to: '2026-02-15', hours: [10, 15, 18], skip: ['0/10'],
    total: fig(4628, 247, 247, null, 30812),
  },
  { key: 'd1', name: 'Website traffic-Display-1', type: 'Display' },
  {
    key: 's2', name: 'Website traffic-Search-2', type: 'Search', status: 'removed', from: '2025-07-14', to: '2025-08-17', hours: [10, 13, 16, 19],
    total: fig(3021, 57, 57, null, 7107),
  },
  {
    key: 'vr', name: 'Video reach - 2025-05-10', type: 'Video', status: 'removed', from: '2025-05-10', to: '2025-05-30', hours: [9, 12, 17, 20, 21],
    total: fig(14474, 1388, 0, 350, 30922), adGroup: 'Ad group 1', placements: { n: 16 },
  },
];

// Matched locations outside India, in the order the table lists them, with the campaigns their
// traffic came from: [campaign, impressions, interactions, clicks, cost]. India has the rest of every
// campaign's traffic (all of it for the removed campaigns).
const ABROAD = [
  ['Bangladesh', ['vt', 300, 160, 1, 1210], ['wv', 122, 50, 1, 507]],
  ['Nepal', ['vt', 80, 39, 1, 300], ['s1', 50, 1, 1, 205]],
  ['Algeria', ['s1', 44, 1, 1, 135]],
  ['Laos', ['sj', 8, 1, 1, 12]],
  ['Pakistan', ['vt', 449, 240, 1, 1324]],
  ['Philippines', ['wv', 121, 58, 1, 502]],
  ['Tanzania', ['dg', 9, 3, 1, 49]],
  ['Sri Lanka', ['vv', 48, 24, 0, 210]],
  ['United Arab Emirates', ['vt', 35, 17, 0, 160]],
  ['United States', ['vv', 31, 14, 0, 142]],
  ['Indonesia', ['wv', 24, 9, 0, 98]],
  ['Nigeria', ['dg', 19, 4, 0, 71]],
  ['Kenya', ['vv', 17, 8, 0, 66]],
  ['Saudi Arabia', ['vt', 16, 8, 0, 72]],
  ['Malaysia', ['vv', 14, 6, 0, 60]],
  ['Myanmar', ['vt', 12, 6, 0, 41]],
  ['Ethiopia', ['vv', 11, 5, 0, 38]],
  ['Ghana', ['vv', 10, 4, 0, 35]],
  ['Uganda', ['vt', 9, 4, 0, 30]],
  ['Cambodia', ['vv', 8, 3, 0, 26]],
  ['Morocco', ['wv', 7, 3, 0, 31]],
  ['Iraq', ['vv', 6, 3, 0, 24]],
  ['Oman', ['vt', 5, 2, 0, 22]],
  ['Qatar', ['vv', 4, 2, 0, 19]],
  ['Kuwait', ['vt', 3, 1, 0, 15]],
  ['Singapore', ['vv', 2, 1, 0, 12]],
  ['Vietnam', ['vv', 4, 1, 0, 0]],
  ['Zimbabwe', ['vv', 1, 0, 0, 0]],
  ['Thailand', ['vt', 3, 1, 0, 0]],
  ['Tunisia', ['vv', 4, 2, 0, 47]],
  ['North Macedonia', ['wv', 1, 0, 0, 10]],
  ['Egypt', ['vv', 96, 48, 0, 188]],
];
const LOCATIONS = ['India', ...ABROAD.map(([location]) => location)];

// Made-up placement names: channels are two words from these lists.
const CHANNEL_WORDS = [
  ['Mitti', 'Kheti', 'Gaon', 'Desi', 'Kisan', 'Little', 'Smart', 'Daily', 'Village', 'Happy', 'Masala', 'Rangoli', 'Cricket', 'Bollywood', 'Gadget', 'Science', 'Funny', 'Sunny'],
  ['Music', 'Kitchen', 'Vlogs', 'Tales', 'Crafts', 'Tech', 'Diaries', 'Beats', 'Rhymes', 'Corner', 'Hub', 'Studio', 'TV', 'Life'],
];
const PLACEMENT_NAMES = {
  [CHANNEL]: CHANNEL_WORDS[0].flatMap((a) => CHANNEL_WORDS[1].map((b) => `${a} ${b}`)),
  [VIDEO]: ['Organic compost in 30 days', 'Drip irrigation explained', 'Monsoon sowing guide', 'Easy rangoli designs', 'Best seeds for rabi season',
    'Top 10 monsoon recipes', 'Tractor buying guide', 'Home garden in 10 minutes', 'How to grow tomatoes at home', 'Paneer butter masala at home',
    'Kids rhymes compilation', 'Mehndi designs for beginners', 'Phone camera tips', 'Budget smartphone review', 'Morning yoga for beginners',
    'Street food tour', 'Mango farming tips', 'Saree draping styles', 'Science experiments for kids', 'Cricket highlights in 5 minutes',
    'Masala chai recipe', 'Clay pot making', 'Bike service at home', 'Wedding dance steps', 'Vegetable seed sowing', 'Fish farming basics',
    'Poultry farming guide', 'Terrace garden ideas', 'Dairy farm tour', 'Solar pump explained'],
  [SITE]: ['farmnews.example.com', 'mandi-rates.example.in', 'recipes.example.org', 'weather.example.in', 'agri-market.example.com',
    'krishi-tips.example.in', 'cricket-scores.example.com', 'jobs-today.example.in', 'news-daily.example.com', 'movie-reviews.example.in',
    'health-tips.example.org', 'study-notes.example.in', 'travel-guide.example.com', 'tech-deals.example.in'],
  [APP]: ['Kisan Weather', 'Word Puzzle Garden', 'Ludo Masters 3D', 'Bubble Pop Garden', 'Quick Notes Lite', 'Cricket Live Scores', 'Daily Horoscope Pro',
    'Photo Frame Studio', 'Ringtone Maker', 'Hindi Keyboard Plus', 'Solitaire Classic', 'Mandi Bhav Today', 'Recipe Book Offline', 'Bike Race 3D'],
};
// How a campaign's placements split over the types (count), and how much traffic each type gets.
const PLACEMENT_MIX = { [CHANNEL]: 0.55, [VIDEO]: 0.2, [SITE]: 0.12, [APP]: 0.13 };
const PLACEMENT_SHARE = { [CHANNEL]: 1.2, [VIDEO]: 0.8, [SITE]: 0.5, [APP]: 0.6 };
// Most interactions one generated placement gets (the fixed ones lead the Where ads showed table).
const PLACEMENT_CAP = [95, 149];

// How each campaign's traffic splits over devices (before some noise).
const DEVICE_SHARE = {
  Search: { Computers: 0.31, 'Mobile phones': 0.62, Tablets: 0.07 },
  Video: { Computers: 0.15, 'Mobile phones': 0.68, Tablets: 0.07, 'TV screens': 0.1 },
};

// Search and Display interactions are their clicks, and they have no views.
const metricsOf = (type) => (isViewType(type) ? WW_BASE : ['impressions', 'clicks', 'cost', 'conversions']);
// distribute() takes whole weights.
const weight = (x) => Math.max(1, Math.round(x * 1000));

// Rows x days of whole figures with given row totals and day totals (both adding up to the same
// number): each day is split over the rows in proportion to what each row still has to get, so
// no row goes over its total. Returns [day][row]. cap(day, row), when given, is the most a cell may
// hold: a cell over it trades the excess with another row and day (two cells up, two down), which
// keeps every row and day total.
function fill(rowTotals, dayTotals, cap) {
  const left = [...rowTotals];
  const grid = dayTotals.map((t) => {
    const parts = distribute(left, t);
    parts.forEach((p, i) => { left[i] -= p; });
    return parts;
  });
  if (cap) {
    const room = (t, i) => cap(t, i) - grid[t][i];
    grid.forEach((cells, t) => cells.forEach((_, i) => {
      for (let s = 0; s < grid.length && room(t, i) < 0; s++) {
        for (let j = 0; j < cells.length && room(t, i) < 0; j++) {
          if (s === t || j === i || room(s, i) <= 0 || grid[s][j] <= 0 || room(t, j) <= 0) continue;
          const k = Math.min(-room(t, i), room(s, i), grid[s][j], room(t, j));
          grid[t][i] -= k; grid[s][i] += k; grid[s][j] -= k; grid[t][j] += k;
        }
      }
    }));
  }
  return grid;
}

// The most a row (or one of its days) may hold of a figure, given its figures split before it
// (WW_BASE order; `other` is undefined for one the campaign type doesn't have): no more
// interactions than impressions, no more clicks or views than interactions, and no cost or
// conversions without traffic.
function capOf(m, other) {
  const traffic = other('interactions') ?? other('clicks');
  switch (m) {
    case 'interactions': return other('impressions');
    case 'clicks': return other('interactions') ?? other('impressions');
    case 'views': return other('interactions');
    case 'cost': return other('impressions') > 0 ? Infinity : 0;
    case 'conversions': return traffic > 0 ? Infinity : 0;
    default: return Infinity;
  }
}

// distribute() with no part above its cap: what would go over goes to the rows with room left.
function distributeCapped(weights, total, caps) {
  const parts = distribute(weights, total);
  const over = sum(parts.map((p, i) => Math.max(0, p - caps[i])));
  if (!over) return parts;
  const room = parts.map((p, i) => Math.min(total, Math.max(0, caps[i] - p)));
  if (sum(room) < over) throw new Error('The rows have no room for this figure');
  const extra = distribute(room, over);
  return parts.map((p, i) => Math.min(p, caps[i]) + extra[i]);
}

// Lowers the biggest weights until each row's expected share of `total` stays under its cap (with
// room for the noise added later), so a capped row keeps its figures in line with each other.
function clampWeights(w, total, caps, margin = 1.2) {
  let out = [...w];
  for (let k = 0; k < 100; k++) {
    const W = sum(out);
    const next = out.map((x, i) => Math.min(x, (caps[i] / margin) * (W / total)));
    if (next.every((x, i) => x === out[i])) break;
    out = next;
  }
  return out;
}

// A campaign's Where ads showed rows: its fixed placements, then made-up ones of each type.
function placementsOf(c, r) {
  const fixed = c.placements.fixed || [];
  const taken = new Set(fixed.map(([name]) => name));
  const types = Object.keys(PLACEMENT_MIX);
  const counts = distribute(types.map((t) => weight(PLACEMENT_MIX[t])), c.placements.n - fixed.length);
  const out = [...fixed];
  types.forEach((type, k) => {
    const free = PLACEMENT_NAMES[type].filter((name) => !taken.has(name));
    for (let i = 0; i < counts[k]; i++) out.push([free.splice(Math.floor(r() * free.length), 1)[0], type]);
  });
  return out;
}

// The section's starting campaigns, rows and daily figures (plain documents with their ids). Every
// tab splits each campaign's days exactly, so each tab adds up to the same account totals.
export function buildWhenWhere(endDate) {
  const r = rng(20250404);
  const oid = () => new mongoose.Types.ObjectId();
  const campaigns = [];
  const rows = { devices: [], when: [], where: [], locations: [] };
  const stats = [];

  // A row's daily figures: values[m][k] for the k-th of `dayIdx` (indexes into the campaign's days).
  const addRow = (tab, c, camp, fields, days, dayIdx, values) => {
    const row = { _id: oid(), tab, campaignId: camp._id, campaignLabel: '', ...fields, extras: {}, added: false };
    rows[tab].push(row);
    const view = isViewType(c.type);
    dayIdx.forEach((i, k) => {
      const v = (m) => values[m]?.[k] ?? 0;
      const doc = {
        rowId: row._id, tab, date: days[i], impressions: v('impressions'), interactions: view ? v('interactions') : v('clicks'),
        clicks: v('clicks'), views: view ? v('views') : null, cost: v('cost'), conversions: v('conversions') * 100,
      };
      if (hasFigures(doc) && doc.date <= endDate) stats.push(doc);
    });
  };

  SEED.forEach((c, order) => {
    const camp = { _id: oid(), name: c.name, type: c.type, status: c.status || 'paused', order };
    campaigns.push(camp);
    const devices = DEVICES.filter((d) => c.type !== 'Search' || d !== 'TV screens');
    const deviceFields = (device) => ({ device, level: 'Campaign', bidAdj: c.off?.includes(device) ? -100 : null, adGroupBidAdj: null });
    if (!c.total) {
      // Set up, never served.
      for (const device of devices) addRow('devices', c, camp, deviceFields(device), [], [], {});
      return;
    }
    const metrics = metricsOf(c.type);
    const days = eachDay(c.from, c.to);
    const all = days.map((_, i) => i);
    const dows = new Set(days.map((d) => parseISO(d).getDay()));
    const skip = new Set(c.skip || []);

    // When ads showed first: each hour cell's total, split over that weekday's days. The days'
    // totals are the campaign's daily figures, which the other tabs then split their own way.
    const dowW = DAYS.map(() => 0.7 + 0.6 * r());
    const hourW = c.hours.map(() => 0.6 + 0.8 * r());
    const cells = [];
    for (let dow = 0; dow < 7; dow++) {
      if (!dows.has(dow)) continue;
      c.hours.forEach((hour, j) => {
        if (skip.has(`${dow}/${hour}`)) return;
        const pin = c.when?.[`${dow}/${hour}`];
        cells.push({ dow, hour, w: dowW[dow] * hourW[j] * (0.7 + 0.6 * r()), pin, sums: { ...pin }, values: {} });
      });
    }
    const dayW = days.map(() => 0.6 + 0.8 * r());
    const daily = {};
    const freeCells = cells.filter((x) => !x.pin);
    for (const m of metrics) {
      const parts = distributeCapped(freeCells.map((x) => weight(x.w * (0.85 + 0.3 * r()))),
        c.total[m] - sum(cells.filter((x) => x.pin).map((x) => x.pin[m])), freeCells.map((x) => capOf(m, (k) => x.sums[k])));
      freeCells.forEach((x, i) => { x.sums[m] = parts[i]; });
      daily[m] = days.map(() => 0);
      for (let dow = 0; dow < 7; dow++) {
        const mine = cells.filter((x) => x.dow === dow);
        if (!mine.length) continue;
        const idx = all.filter((i) => parseISO(days[i]).getDay() === dow);
        const totals = mine.map((x) => x.sums[m]);
        const dayTotals = distribute(idx.map((i) => weight(dayW[i] * (0.9 + 0.2 * r()))), sum(totals));
        const grid = fill(totals, dayTotals, (t, j) => capOf(m, (k) => mine[j].values[k]?.[t]));
        idx.forEach((i, k) => { daily[m][i] = dayTotals[k]; });
        mine.forEach((x, j) => { x.idx = idx; x.values[m] = grid.map((g) => g[j]); });
      }
    }
    for (const x of cells) addRow('when', c, camp, { dow: x.dow, hour: x.hour }, days, x.idx, x.values);

    // A tab's rows for this campaign: [{ fields, total? (fixed figures), w (share of the rest),
    // cap? (most interactions the row may get) }]; every day of the campaign is split over them.
    const spread = (tab, list) => {
      const free = list.flatMap((x, j) => (x.total ? [] : [j]));
      const fixed = (m) => sum(list.filter((x) => x.total).map((x) => x.total[m]));
      const w = free.some((j) => list[j].cap)
        ? clampWeights(free.map((j) => list[j].w), c.total.interactions - fixed('interactions'), free.map((j) => list[j].cap))
        : free.map((j) => list[j].w);
      const sums = list.map((x) => ({ ...x.total }));
      const values = list.map(() => ({}));
      for (const m of metrics) {
        const caps = free.map((j) => {
          const cap = capOf(m, (k) => sums[j][k]);
          return m === 'interactions' && list[j].cap ? Math.min(cap, list[j].cap) : cap;
        });
        const parts = distributeCapped(w.map((x) => (x > 0 ? weight(x * (0.85 + 0.3 * r())) : 0)), c.total[m] - fixed(m), caps);
        free.forEach((j, i) => { sums[j][m] = parts[i]; });
        const grid = fill(sums.map((s) => s[m]), daily[m], (t, j) => capOf(m, (k) => values[j][k]?.[t]));
        grid.forEach((g, i) => g.forEach((v, j) => { (values[j][m] ||= [])[i] = v; }));
      }
      list.forEach((x, j) => addRow(tab, c, camp, x.fields, days, all, values[j]));
    };

    const share = DEVICE_SHARE[c.type] || DEVICE_SHARE.Video;
    spread('devices', devices.map((device) => ({ fields: deviceFields(device), total: c.devices?.[device], w: c.off?.includes(device) ? 0 : share[device] })));

    if (c.placements) {
      spread('where', placementsOf(c, r).map(([placement, placementType, total]) => ({
        fields: { placement, placementType, adGroup: c.adGroup }, total, w: PLACEMENT_SHARE[placementType] * (0.3 + 1.2 * r()),
        cap: PLACEMENT_CAP[0] + Math.floor(r() * (PLACEMENT_CAP[1] - PLACEMENT_CAP[0] + 1)),
      })));
    }

    // Matched locations: the countries outside India with their fixed figures; India has the rest.
    const abroad = ABROAD.flatMap(([location, ...from]) => from.filter(([key]) => key === c.key)
      .map(([, impressions, interactions, clicks, cost]) => ({
        fields: { location },
        // A view is an interaction, and only a paid one counts.
        total: fig(impressions, interactions, clicks, cost > 0 ? Math.min(interactions, Math.round((impressions * c.total.views) / c.total.impressions)) : 0, cost),
      })));
    spread('locations', [...abroad, { fields: { location: 'India' }, w: 1 }]);
  });

  // Matched locations list each country's campaigns together, in the table's order.
  const campOrder = new Map(campaigns.map((c) => [String(c._id), c.order]));
  rows.locations.sort((a, b) => LOCATIONS.indexOf(a.location) - LOCATIONS.indexOf(b.location)
    || campOrder.get(String(a.campaignId)) - campOrder.get(String(b.campaignId)));
  const allRows = Object.values(rows).flatMap((list) => list.map((row, order) => ({ ...row, order })));
  return { campaigns, rows: allRows, stats };
}

// Version of the starting data, kept in the app's settings. A database an older version filled (no
// version stored, or a lower one) has this section's data, and only it, replaced once.
export const WW_SEED_VERSION = 2;
const SEED_KEY = 'wwSeedVersion';

// What start-up does: 'seed' an empty section, 'reseed' one an older version filled, else nothing.
// A section this version filled and the admin emptied (every campaign deleted) stays empty.
export function seedPlan(hasData, version) {
  if (Number(version) >= WW_SEED_VERSION) return null;
  return hasData ? 'reseed' : 'seed';
}

// This section's collections, emptied campaigns last: if start-up stops half-way, the next one
// still finds old data without the new version and starts over.
async function wipe() {
  await WwStat.deleteMany({});
  await WwRow.deleteMany({});
  await WwCampaign.deleteMany({});
}

// A start-up's claim on filling the section, so two starting at once on the same database (the live
// server and a local one) can't both fill it: one document whose _id, unique by nature, only one of
// them can create. `at`: when it was taken; an older claim than LOCK_STALE_MS was left by a start-up
// that stopped half-way, and the next one takes it over.
const WwLock = mongoose.model('WwLock', new Schema({ _id: String, at: Number }, { versionKey: false }));
const SEED_LOCK = 'seed';
const LOCK_STALE_MS = 10 * 60e3;

// Fills this section at start-up when it has no data yet, or data from an older starting set.
export async function ensureWhenWhere(endDate) {
  // The app's settings (registered by models.js, which this section doesn't import).
  const Setting = mongoose.model('Setting');
  const plan = async () => {
    const [has, stored] = await Promise.all([WwCampaign.exists({}), Setting.findOne({ key: SEED_KEY }).lean()]);
    return seedPlan(!!has, stored?.value);
  };
  if (!(await plan())) return;
  const at = Date.now();
  try {
    // Matches no claim or a stale one; with a fresh claim there the upsert's insert hits its _id.
    await WwLock.updateOne({ _id: SEED_LOCK, at: { $lt: at - LOCK_STALE_MS } }, { $set: { at } }, { upsert: true });
  } catch (e) {
    if (e?.code === 11000) return; // another start-up is filling it
    throw e;
  }
  try {
    // Another start-up may have filled it since the first look.
    if (!(await plan())) return;
    // Rows and figures left without campaigns go too.
    await wipe();
    const { campaigns, rows, stats } = buildWhenWhere(endDate);
    await WwCampaign.insertMany(campaigns);
    await WwRow.insertMany(rows);
    await WwStat.insertMany(stats);
    await Setting.updateOne({ key: SEED_KEY }, { $set: { value: WW_SEED_VERSION } }, { upsert: true });
  } finally {
    await WwLock.deleteOne({ _id: SEED_LOCK, at });
  }
}

// Tests (in-memory database only): back to the starting data.
export async function resetWhenWhere(endDate) {
  await wipe();
  await mongoose.model('Setting').deleteOne({ key: SEED_KEY });
  await ensureWhenWhere(endDate);
}
