// ---------- formulas (mirror of server/formulas.js so totals & previews recalc instantly) ----------
const num = (v) => (Number.isFinite(+v) ? +v : 0);
export function derive(s) {
  const spend = num(s.spend), impressions = num(s.impressions), reach = num(s.reach), linkClicks = num(s.linkClicks);
  return {
    spend, impressions, reach, linkClicks,
    cpm: impressions ? (spend / impressions) * 1000 : null,
    frequency: reach ? impressions / reach : null,
    ctr: impressions ? (linkClicks / impressions) * 100 : null,
    cpc: linkClicks ? spend / linkClicks : null,
    results: linkClicks,
    cpr: linkClicks ? spend / linkClicks : null,
    hasData: impressions > 0 || spend > 0,
  };
}
// The totals row ("Results from N ads"): the four raw figures are SUMmed over the visible rows, then every other figure is
// recomputed from those sums with the same formulas as a single row (CPM = spend / impressions x 1000, Frequency = impressions / reach,
// CTR = link clicks / impressions, CPC = CPR = spend / link clicks) - never an average of the row values.
export const sumRows = (rows) => derive(rows.reduce((t, r) => ({
  spend: t.spend + r.spend, impressions: t.impressions + r.impressions, reach: t.reach + r.reach, linkClicks: t.linkClicks + r.linkClicks,
}), { spend: 0, impressions: 0, reach: 0, linkClicks: 0 }));

// ---------- formatting ----------
export const fInt = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
export const CURRENCY = '$'; // the ad account is in US dollars (USD)
export const fMoney = (v) => (v == null ? '—' : CURRENCY + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const fMoney3 = (v) => (v == null ? '—' : CURRENCY + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 }));
// CPM is shown with exactly two decimals, CUT OFF rather than rounded (0.069 -> 0.06, 54.839 -> 54.83). Only CPM does this.
// toPrecision(12) first: a value that really is x.xx but is stored a hair below it (1.15 as 1.1499999...) must not lose a cent.
export const trunc2 = (v) => Math.floor(Number((v * 100).toPrecision(12))) / 100;
export const fCpm = (v) => (v == null ? '—' : CURRENCY + trunc2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const fPct = (v) => (v == null ? '—' : v.toFixed(2) + '%');
export const fDec = (v) => (v == null ? '—' : v.toFixed(2));

// ---------- columns ----------
// v = value getter, f = formatter, foot = footer caption (like Meta's "Total Spent", "Per 1,000 Impressions")
export const COLUMNS = [
  { id: 'delivery', label: 'Delivery', w: 177, text: true, v: (r) => r.delivery },
  { id: 'results', label: 'Results', w: 163, v: (r) => (r.hasData ? r.results : null), f: fInt, foot: 'Link clicks' },
  { id: 'cpr', label: 'Cost per result', w: 161, v: (r) => r.cpr, f: fMoney3, foot: 'Per Link click' },
  { id: 'spend', label: 'Amount spent', w: 150, v: (r) => (r.hasData ? r.spend : null), f: fMoney, foot: 'Total Spent' },
  { id: 'budget', label: 'Budget', w: 120, v: (r) => (typeof r.budget === 'number' ? r.budget : null), f: fMoney, budget: true },
  { id: 'impressions', label: 'Impressions', w: 164, v: (r) => (r.hasData ? r.impressions : null), f: fInt, foot: 'Total' },
  { id: 'cpm', label: 'CPM (cost per 1,000 impressions)', w: 176, v: (r) => r.cpm, f: fCpm, foot: 'Per 1,000 Impressions' },
  { id: 'reach', label: 'Reach', w: 140, v: (r) => (r.hasData ? r.reach : null), f: fInt, foot: 'Meta accounts' },
  { id: 'frequency', label: 'Frequency', w: 160, v: (r) => r.frequency, f: fDec, foot: 'Per Meta account' },
  { id: 'ctr', label: 'CTR (all)', w: 130, v: (r) => r.ctr, f: fPct, foot: 'Per Impressions' },
  { id: 'linkClicks', label: 'Link clicks', w: 150, v: (r) => (r.hasData ? r.linkClicks : null), f: fInt, foot: 'Total' },
  { id: 'cpc', label: 'CPC (all)', w: 134, v: (r) => r.cpc, f: fMoney3, foot: 'Per Action' },
  { id: 'bid', label: 'Bid strategy', w: 150, text: true, v: (r) => r.bidStrategy || '—' },
];
// text of the white hover card shown over a column header
export const COL_TIPS = {
  status: { title: 'Off/On', body: 'When your campaign, ad set or ad is on, it will be able to run based on its schedule and settings. For an ad to run, the campaign, ad set and ad must all be on.' },
  delivery: { title: 'Delivery', body: 'The current delivery status of your campaign, ad set or ad, for example Active, In review, Rejected or Off.', learn: true },
  results: { title: 'Results', body: 'The number of times that your ad achieved an outcome, based on the objective and settings you selected.', est: true, learn: true, note: ['This only includes conversions that are attributed. To see all unattributed conversion events, go to Data sources in Events Manager.', 'Go to Events Manager'] },
  cpr: { title: 'Cost per result', body: 'The average cost per result from your adverts.', est: true, learn: true },
  spend: { title: 'Amount spent', body: 'The estimated total amount of money that you\'ve spent on your campaign, ad set or ad during its schedule.', learn: true },
  budget: { title: 'Budget', body: 'The maximum amount that you\'re willing to spend on your ad sets or campaigns, on average each day or over the lifetime of your scheduled ad sets or campaigns.', bold: 'This column does not apply to ads, only ad sets and campaigns.', learn: true },
  impressions: { title: 'Impressions', body: 'The number of times your ads were on screen.', learn: true },
  cpm: { title: 'CPM (cost per 1,000 impressions)', body: 'The average cost for 1,000 impressions.', learn: true },
  reach: { title: 'Reach', body: 'The number of Accounts Centre accounts that saw your ads at least once. Reach is different from impressions, which may include multiple views of your ads by the same Accounts Centre accounts. This metric is estimated.', learn: true },
  frequency: { title: 'Frequency', body: 'The average number of times each Accounts Centre account saw your ad. This metric is estimated.', learn: true },
  ctr: { title: 'CTR (all)', body: 'The percentage of times people saw your ad and performed a click (all).', learn: true },
  linkClicks: { title: 'Link clicks', body: 'The number of clicks on links within the ad that led to destinations or experiences, on or off Meta technologies.', learn: true },
  cpc: { title: 'CPC (all)', body: 'The average cost for each click (all).', learn: true },
  bid: { title: 'Bid strategy', body: 'The way your ad set or campaign bids for results in the ad auction.', learn: true },
};
// ---------- admin panel: which cells can be edited in place ----------
export const DELIVERY_STATES = ['Automatic', 'Active', 'Learning', 'Learning limited', 'In review', 'Rejected', 'In draft', 'Scheduled', 'Completed', 'Off', 'Campaign off', 'Ad set off', 'Not delivering'];
const EDITABLE = new Set(['delivery', 'results', 'cpr', 'spend', 'budget', 'impressions', 'cpm', 'reach', 'frequency', 'ctr', 'linkClicks', 'cpc', 'bid']);
export const canEditCell = (c, r) => EDITABLE.has(c.id) && (c.id !== 'budget' || typeof r.budget === 'number') && (c.id !== 'bid' || r.bidStrategy != null);
// what the edit box starts with: the number as shown, without currency symbols or separators
// What a number field may hold: digits and, where decimals make sense, one decimal point. Letters and symbols typed or pasted are dropped.
export const digitsOnly = (s, decimals = true) => {
  const t = String(s).replace(decimals ? /[^\d.]/g : /\D/g, '');
  const i = t.indexOf('.');
  return i < 0 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '');
};
export const WHOLE_NUMBER_COLS = new Set(['results', 'impressions', 'reach', 'linkClicks']); // counts: no decimal point
// true when the admin emptied this value cell (it shows a dash instead of its figure); ignored while a breakdown splits the row into periods
export const cellEmpty = (c, r) => !!(r && r.period === undefined && r.overrides && r.overrides[c.id]);
// The total of ONE column: the usual formulas (sumRows) over the rows that show a figure in that column. A cell the admin emptied is
// left out of its column's total, and when every row of the column is empty the total is empty too (null -> the dash).
export const columnTotal = (c, rows, totals) => {
  const live = rows.filter((r) => !cellEmpty(c, r));
  return live.length === rows.length ? totals : live.length ? sumRows(live) : null;
};
export function editInit(c, r) {
  if (cellEmpty(c, r)) return '';
  if (c.id === 'delivery') return r.delivery;
  if (c.id === 'bid') return r.bidStrategy || '';
  const v = c.v(r);
  if (v == null) return '';
  if (c.id === 'cpm') return trunc2(+v).toFixed(2); // the box starts with what the cell shows
  if (['budget', 'spend', 'ctr', 'frequency'].includes(c.id)) return (+v).toFixed(2);
  if (c.id === 'cpr' || c.id === 'cpc') return (+v).toFixed(3);
  return String(Math.round(v));
}
export const PRESETS = {
  Performance: ['delivery', 'results', 'cpr', 'budget', 'spend', 'impressions', 'reach', 'cpm'],
  Delivery: ['delivery', 'reach', 'impressions', 'frequency', 'cpm', 'spend'],
  Engagement: ['delivery', 'results', 'cpr', 'spend', 'reach', 'impressions', 'linkClicks', 'ctr'],
  'Performance and clicks': ['delivery', 'results', 'cpr', 'spend', 'impressions', 'linkClicks', 'cpc', 'ctr', 'cpm'],
  Traffic: ['delivery', 'spend', 'budget', 'impressions', 'cpm', 'reach', 'frequency', 'ctr', 'linkClicks', 'cpc'],
};
export const CTA_OPTIONS = ['Learn more', 'Shop now', 'Sign up', 'Book now', 'Contact us', 'Download', 'Get offer', 'Apply now', 'Install now', 'Watch more', 'Get quote', 'Subscribe', 'No button'];
export const colById = Object.fromEntries(COLUMNS.map((c) => [c.id, c]));

// ---------- dates (all YYYY-MM-DD strings in local calendar terms) ----------
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, k) => { const d = parse(s); d.setDate(d.getDate() + k); return ymd(d); };
export const todayStr = () => ymd(new Date());
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDay = (s) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtLong = (s) => { const d = parse(s); return `${d.getDate()} ${LONG[d.getMonth()]} ${d.getFullYear()}`; };
export const rangeLabel = (r) => (r.from === r.to ? fmtDay(r.from) : `${fmtDay(r.from)} - ${fmtDay(r.to)}`);
// the date button reads "Last 30 days: 2 Sep 2026 - 1 Oct 2026" for a preset and just the dates for a custom range
export const rangeButtonLabel = (r) => { const p = r.id && r.id !== 'custom' && r.id !== 'maximum' ? RANGE_PRESETS.find(([id]) => id === r.id) : null; return p ? `${p[1]}: ${rangeLabel(r)}` : rangeLabel(r); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5) + 1;

export const RANGE_PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['today_yesterday', 'Today and yesterday'],
  ['last7', 'Last 7 days'], ['last14', 'Last 14 days'], ['last28', 'Last 28 days'], ['last30', 'Last 30 days'],
  ['this_week', 'This week'], ['last_week', 'Last week'], ['this_month', 'This month'], ['last_month', 'Last month'],
  ['maximum', 'Maximum'], ['custom', 'Custom'],
];
export function presetRange(id, minDate) {
  const t = todayStr(), d = parse(t);
  const sunday = addDays(t, -d.getDay());
  switch (id) {
    case 'today': return [t, t];
    case 'yesterday': return [addDays(t, -1), addDays(t, -1)];
    case 'today_yesterday': return [addDays(t, -1), t];
    case 'last7': return [addDays(t, -7), addDays(t, -1)];
    case 'last14': return [addDays(t, -14), addDays(t, -1)];
    case 'last28': return [addDays(t, -28), addDays(t, -1)];
    case 'last30': return [addDays(t, -30), addDays(t, -1)];
    case 'this_week': return [sunday, t];
    case 'last_week': return [addDays(sunday, -7), addDays(sunday, -1)];
    case 'this_month': return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), t];
    case 'last_month': return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))];
    case 'maximum': return [minDate || addDays(t, -90), t];
    default: return null;
  }
}

// ---------- compare ("Compare" checkbox in the date picker) ----------
export const COMPARE_OPTIONS = [['prev', 'Previous period'], ['month', 'Previous month'], ['year', 'Previous year'], ['custom', 'Custom']];
export function compareRange(id, from, to, custom) {
  // shift by whole months, clamping to the last day (31 Mar -> 28 Feb, 29 Feb -> 28 Feb) instead of overflowing into the next month
  const shift = (s, months) => {
    const d = parse(s);
    const t = new Date(d.getFullYear(), d.getMonth() + months, 1);
    t.setDate(Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
    return ymd(t);
  };
  if (id === 'custom') {
    if (!(custom && custom.from && custom.to)) return null;
    return custom.from <= custom.to ? { from: custom.from, to: custom.to } : { from: custom.to, to: custom.from };
  }
  if (id === 'month') return { from: shift(from, -1), to: shift(to, -1) };
  if (id === 'year') return { from: shift(from, -12), to: shift(to, -12) };
  const len = daysBetween(from, to);
  return { from: addDays(from, -len), to: addDays(from, -1) }; // the equally long period right before
}
// lower is better for cost metrics, higher is better for volume metrics (spend is neutral)
export const GOOD_DIRECTION = { spend: 0, budget: 0, cpm: -1, cpc: -1, cpr: -1, frequency: 0, delivery: 0 };
export const pctChange = (cur, prev) => (cur == null || prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100);

// Relative presets ("Last 7 days", "Today", ...) are re-resolved against today's date, so a range
// saved yesterday does not silently keep yesterday's dates. Custom ranges keep their exact dates.
export function resolveRange(r, minDate) {
  const p = r.id && r.id !== 'custom' ? presetRange(r.id, minDate) : null;
  return p ? { ...r, from: p[0], to: p[1] } : r;
}

// ---------- filters ----------
export const FILTER_FIELDS = [
  { id: 'name', label: 'Name', text: true, v: (r) => r.name },
  { id: 'id', label: 'ID', text: true, v: (r) => r.entityId || r.id },
  { id: 'delivery', label: 'Delivery', text: true, v: (r) => r.delivery },
  { id: 'objective', label: 'Objectives', text: true, v: (r) => r.objective },
  { id: 'bidStrategy', label: 'Budget strategy', text: true, v: (r) => r.bidStrategy },
  { id: 'spend', label: 'Amount spent', v: (r) => r.spend },
  { id: 'impressions', label: 'Impressions', v: (r) => r.impressions },
  { id: 'cpm', label: 'CPM', v: (r) => r.cpm },
  { id: 'reach', label: 'Reach', v: (r) => r.reach },
  { id: 'frequency', label: 'Frequency', v: (r) => r.frequency },
  { id: 'ctr', label: 'CTR (all) %', v: (r) => r.ctr },
  { id: 'linkClicks', label: 'Link clicks', v: (r) => r.linkClicks },
  { id: 'cpc', label: 'CPC (all)', v: (r) => r.cpc },
];
export const TEXT_OPS = [['contains', 'contains'], ['not', 'does not contain'], ['is', 'is']];
export const NUM_OPS = [['gt', 'is greater than'], ['lt', 'is less than'], ['eq', 'equals'], ['gte', 'is at least'], ['lte', 'is at most']];
export function passes(row, f) {
  const def = FILTER_FIELDS.find((x) => x.id === f.field);
  if (!def || f.value === '') return true;
  const val = def.v(row);
  if (def.text) {
    const a = String(val ?? '').toLowerCase(), b = f.value.toLowerCase();
    return f.op === 'is' ? a === b : f.op === 'not' ? !a.includes(b) : a.includes(b);
  }
  if (val == null) return false;
  const n = +f.value;
  return { gt: val > n, lt: val < n, eq: Math.abs(val - n) < 1e-9, gte: val >= n - 1e-9, lte: val <= n + 1e-9 }[f.op];
}

export function toCSV(rows, cols, totals, level) {
  // quote every cell; neutralise spreadsheet formulas (=, +, -, @) in user-entered text such as names
  const q = (v) => {
    let t = String(v ?? '');
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const hasPeriod = rows[0]?.period !== undefined;
  const head = [level === 'campaign' ? 'Campaign' : level === 'adset' ? 'Ad set' : 'Ad', ...(hasPeriod ? ['Period'] : []), ...cols.map((c) => c.label)];
  const lines = [head.map(q).join(',')];
  const num = (c, r) => { const v = c.v(r); return c.text ? v : v == null ? '' : c.id === 'cpm' ? trunc2(+v) : +(+v).toFixed(4); };
  const cell = (c, r) => (cellEmpty(c, r) ? '' : num(c, r));
  for (const r of rows) lines.push([r.name, ...(hasPeriod ? [r.period] : []), ...cols.map((c) => cell(c, r))].map(q).join(','));
  lines.push(['Total', ...(hasPeriod ? [''] : []), ...cols.map((c) => { const t = columnTotal(c, rows, totals); return c.text || c.budget || !t ? '' : num(c, t); })].map(q).join(','));
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 names correctly
}
