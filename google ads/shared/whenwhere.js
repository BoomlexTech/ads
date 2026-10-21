// "When and where ads showed" (Insights and reports): its tabs, columns, formulas and formatting,
// shared by server and client. This section keeps its own data (server/whenwhere.js) and never
// reads or changes the Ads section's campaigns, ads or figures.
//
// Stored units: impressions / interactions / clicks / views = whole counts, cost = whole cents
// (hundredths of the currency), conversions = hundredths. null means "no value" and shows a dash.

// Currency symbol in front of every amount in this section (the Ads section is not affected).
export const WW_CURRENCY = '$';

export const WW_TITLE = 'When and where ads showed';
// First day the section's data can start ("All time" begins here).
export const WW_DATA_START = '2025-03-21';
export const DASH = '–';

// Tabs: `page` is the app page key (Shell.jsx), `path` its address.
export const WW_TABS = [
  { key: 'devices', page: 'wwDevices', path: '/aw/devices', label: 'Devices', columnsTitle: 'Modify columns for devices', chart: true },
  { key: 'when', page: 'wwWhen', path: '/aw/adschedule', label: 'When ads showed', columnsTitle: 'Modify columns for hour and day of the week', chart: false },
  { key: 'where', page: 'wwWhere', path: '/aw/placements', label: 'Where ads showed', columnsTitle: 'Modify columns', chart: true },
  { key: 'locations', page: 'wwLocations', path: '/aw/matchedlocations', label: 'Matched locations', columnsTitle: 'Modify columns for locations', chart: false },
];
export const WW_PAGES = WW_TABS.map((t) => t.page);
export const tabOf = (key) => WW_TABS.find((t) => t.key === key) || WW_TABS[0];
export const tabOfPage = (page) => WW_TABS.find((t) => t.page === page) || null;

export const CAMPAIGN_TYPES = ['Search', 'Display', 'Video', 'Demand Gen'];
// Campaign types whose ads are watched: they count views (TrueView columns) and engagements.
export const VIEW_TYPES = ['Video', 'Demand Gen'];
export const isViewType = (type) => VIEW_TYPES.includes(type);
export const CAMPAIGN_STATUSES = ['enabled', 'paused', 'removed'];
export const DEVICES = ['Computers', 'Mobile phones', 'Tablets', 'TV screens'];
export const LEVELS = ['Campaign', 'Ad group'];
export const PLACEMENT_TYPES = ['YouTube channel', 'YouTube video', 'Website', 'Mobile application'];
// Day of the week as stored (JS getDay(): 0 = Sunday) and as shown.
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const h12 = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
// 16 -> "4 PM – 5 PM", 23 -> "11 PM – 12 AM".
export const hourLabel = (h) => (h == null ? DASH : `${h12(h)} – ${h12((h + 1) % 24)}`);

// What an interaction is for each campaign type ("777 engagements", "596 clicks, engagements").
export const INTERACTION_WORDS = { Search: ['clicks'], Display: ['clicks'], Video: ['engagements'], 'Demand Gen': ['clicks', 'engagements'] };
export function interactionWords(types) {
  const words = new Set();
  for (const t of types) for (const w of INTERACTION_WORDS[t] || []) words.add(w);
  return ['clicks', 'engagements'].filter((w) => words.has(w)).join(', ');
}

// ---------------------------------------------------------------- metrics
// Base figures are stored per row and day; everything else is worked out from them.
export const WW_BASE = ['impressions', 'interactions', 'clicks', 'views', 'cost', 'conversions'];
// Sums over view-type rows only (TrueView avg. CPV and view rate).
export const WW_VIEW_SUMS = ['vCost', 'vImpr'];

// kind: int | money | dec2 | pct. rec: recommended column (dashed header, help card note).
// group: the Columns panel section. extra: a figure kept per row (not per day), typed in by an
// admin; `sum` tells whether its total adds the rows up.
export const WW_METRICS = {
  impressions: { label: 'Impr.', kind: 'int', base: true, group: 'performance' },
  interactions: { label: 'Interactions', kind: 'int', base: true, group: 'performance' },
  clicks: { label: 'Clicks', kind: 'int', base: true, group: 'performance' },
  views: { label: 'TrueView views', kind: 'int', base: true, group: 'performance', views: true },
  cost: { label: 'Cost', kind: 'money', base: true, group: 'performance' },
  conversions: { label: 'Conversions', kind: 'dec2', base: true, group: 'conversions', rec: true },
  ctr: { label: 'CTR', kind: 'pct', formula: 'Clicks ÷ Impr.', group: 'performance' },
  avgCpc: { label: 'Avg. CPC', kind: 'money', formula: 'Cost ÷ Clicks', group: 'performance' },
  avgCpm: { label: 'Avg. CPM', kind: 'money', formula: 'Cost ÷ Impr. × 1,000', group: 'performance' },
  interactionRate: { label: 'Interaction rate', kind: 'pct', formula: 'Interactions ÷ Impr.', group: 'performance' },
  avgCost: { label: 'Avg. cost', kind: 'money', formula: 'Cost ÷ Interactions', group: 'performance' },
  avgCpv: { label: 'TrueView avg. CPV', note: '(Video only)', kind: 'money', formula: 'Video cost ÷ TrueView views', group: 'performance', views: true },
  viewRate: { label: 'TrueView view rate', kind: 'pct', formula: 'TrueView views ÷ video impr.', group: 'performance', views: true },
  convRate: { label: 'Conv. rate', kind: 'pct', formula: 'Conversions ÷ Interactions', group: 'conversions', rec: true },
  costPerConv: { label: 'Cost / conv.', kind: 'money', formula: 'Cost ÷ Conversions', group: 'conversions', rec: true },
};

// Columns the Columns panel offers that have no formula here: an admin types each row's figure.
// Counts and amounts add up over rows; rates (pct) and the averages and ratios (`avg`) don't.
const extra = (label, kind, group, more = {}) => ({ label, kind, group, extra: true, sum: kind !== 'pct', ...more });
const avg = { sum: false };
export const WW_EXTRAS = {
  engagements: extra('Engagements', 'int', 'performance'),
  engagementRate: extra('Engagement rate', 'pct', 'performance'),
  avgCpe: extra('Avg. CPE', 'money', 'performance', avg),
  imprCoViewed: extra('Impr. (co-viewed)', 'int', 'performance', { note: '(Video only)' }),
  imprAbsTop: extra('Impr. (Abs. Top) %', 'pct', 'performance'),
  imprTop: extra('Impr. (Top) %', 'pct', 'performance'),
  viewableImpr: extra('Viewable impr.', 'int', 'viewability'),
  viewableRate: extra('Viewable rate', 'pct', 'viewability'),
  avgViewableCpm: extra('Avg. viewable CPM', 'money', 'viewability', avg),
  measurableImpr: extra('Measurable impr.', 'int', 'viewability'),
  measurableRate: extra('Measurable rate', 'pct', 'viewability'),
  convValue: extra('Conv. value', 'dec2', 'conversions'),
  convValueCost: extra('Conv. value / cost', 'dec2', 'conversions', avg),
  allConv: extra('All conv.', 'dec2', 'conversions'),
  allConvRate: extra('All conv. rate', 'pct', 'conversions'),
  costPerAllConv: extra('Cost / all conv.', 'money', 'conversions', avg),
  allConvValue: extra('All conv. value', 'dec2', 'conversions'),
  allConvValueCost: extra('All conv. value / cost', 'dec2', 'conversions', avg),
  allConvValueClick: extra('All conv. value / click', 'dec2', 'conversions', avg),
  valuePerAllConv: extra('Value / all conv.', 'dec2', 'conversions', avg),
  crossDeviceConv: extra('Cross-device conv.', 'dec2', 'conversions'),
  viewThroughConv: extra('View-through conv.', 'int', 'conversions'),
  searchImprShare: extra('Search impr. share', 'pct', 'competitive'),
  searchTopIs: extra('Search top IS', 'pct', 'competitive'),
  searchAbsTopIs: extra('Search abs. top IS', 'pct', 'competitive'),
  earnedViews: extra('Earned views', 'int', 'youtube'),
  earnedSubscribers: extra('Earned subscribers', 'int', 'youtube'),
  earnedLikes: extra('Earned likes', 'int', 'youtube'),
  earnedShares: extra('Earned shares', 'int', 'youtube'),
  estClicksTop: extra('Est. add. clicks/wk (top page bid)', 'int', 'bidsim'),
  estCostTop: extra('Est. add. cost/wk (top page bid)', 'money', 'bidsim'),
  estClicksUp30: extra('Est. add. clicks/wk (+30% bid adj.)', 'int', 'bidsim'),
  estClicksUp100: extra('Est. add. clicks/wk (+100% bid adj.)', 'int', 'bidsim'),
  estClicksDown30: extra('Est. add. clicks/wk (-30% bid adj.)', 'int', 'bidsim'),
  estConvUp30: extra('Est. add. conv./wk (+30% bid adj.)', 'dec2', 'bidsim'),
  estConvUp100: extra('Est. add. conv./wk (+100% bid adj.)', 'dec2', 'bidsim'),
  estConvDown30: extra('Est. add. conv./wk (-30% bid adj.)', 'dec2', 'bidsim'),
  estConvTop: extra('Est. add. conv./wk (top page bid)', 'dec2', 'bidsim'),
  estCostUp30: extra('Est. add. cost/wk (+30% bid adj.)', 'money', 'bidsim'),
  estCostUp100: extra('Est. add. cost/wk (+100% bid adj.)', 'money', 'bidsim'),
  estCostDown30: extra('Est. add. cost/wk (-30% bid adj.)', 'money', 'bidsim'),
};
// Every figure column (formula and typed-in ones).
export const WW_ALL_METRICS = { ...WW_METRICS, ...WW_EXTRAS };
// Own keys only: names like 'constructor' or 'toString' are no column.
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
export const isWwMetric = (k) => own(WW_ALL_METRICS, k);
export const isExtra = (k) => own(WW_EXTRAS, k);
// Whether a column's total adds its rows up (base figures, typed-in counts and amounts), so an edit
// of several rows is split over them. Formula columns are worked out from the base figures, and
// typed-in rates, averages and ratios are the same on every row an edit covers.
export const isAdditive = (k) => (own(WW_METRICS, k) ? !!WW_METRICS[k].base : isExtra(k) && WW_EXTRAS[k].sum);

function ratio(a, b) {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

// One row's view-type sub-sums: only Video and Demand Gen rows count views.
export function viewSums(r, type) {
  const v = isViewType(type);
  return { vCost: v ? r.cost ?? null : null, vImpr: v ? r.impressions ?? null : null };
}

// Column totals of base figures, view sums and `extras`. Typed-in columns that add up are summed;
// a rate, average or ratio is the value its rows share (one row, or an edit that set them all),
// else their average weighted by impressions (a plain one when they have none). A column with no
// values stays null.
export function sumWw(rows) {
  const out = {};
  for (const m of [...WW_BASE, ...WW_VIEW_SUMS]) {
    let s = 0;
    let n = 0;
    for (const r of rows) if (r[m] != null) { s += r[m]; n++; }
    out[m] = n ? s : null;
  }
  const ex = {};
  for (const [k, d] of Object.entries(WW_EXTRAS)) {
    const have = rows.filter((r) => r.extras?.[k] != null);
    if (!have.length) continue;
    const vals = have.map((r) => r.extras[k]);
    const total = vals.reduce((a, b) => a + b, 0);
    if (d.sum) ex[k] = total;
    else if (vals.every((v) => v === vals[0])) ex[k] = vals[0];
    else {
      const w = have.map((r) => r.impressions || 0);
      const W = w.reduce((a, b) => a + b, 0);
      const mean = W > 0 ? vals.reduce((a, v, i) => a + v * w[i], 0) / W : total / vals.length;
      // Amounts stay in whole stored units (cents, hundredths); rates are fractions.
      ex[k] = d.kind === 'pct' ? mean : Math.round(mean);
    }
  }
  out.extras = ex;
  return out;
}

// Base figures (+ view sums) -> every column. Conv. rate and Cost / conv. are 0 (not a dash)
// when there are no conversions, as the reports show them.
export function deriveWw(t) {
  const conv = t.conversions == null ? null : t.conversions / 100;
  const perImpr = ratio(t.cost, t.impressions);
  const out = {
    ...t,
    ctr: ratio(t.clicks, t.impressions),
    avgCpc: ratio(t.cost, t.clicks),
    avgCpm: perImpr == null ? null : perImpr * 1000,
    interactionRate: ratio(t.interactions, t.impressions),
    avgCost: ratio(t.cost, t.interactions),
    avgCpv: ratio(t.vCost, t.views),
    viewRate: ratio(t.views, t.vImpr),
    convRate: conv == null ? null : conv === 0 ? 0 : ratio(conv, t.interactions),
    costPerConv: conv == null ? null : conv === 0 ? (t.cost == null ? null : 0) : ratio(t.cost, conv),
  };
  for (const k of Object.keys(WW_EXTRAS)) out[k] = t.extras?.[k] ?? null;
  return out;
}

// What base figure an edit of each column changes, and its new total over the edited rows
// (s = their current sums). Returns { base, total } or { error }. Extras are set directly.
export function solveWw(metric, v, s) {
  const need = (x, what) => (x > 0 ? null : { error: `Needs ${what} first` });
  const r = Math.round;
  switch (metric) {
    case 'impressions': case 'interactions': case 'clicks': case 'views': case 'cost': case 'conversions':
      return { base: metric, total: v };
    case 'ctr':
      if (v > 1) return { error: 'A rate can’t be above 100%' };
      return need(s.impressions, 'impressions') || { base: 'clicks', total: r(v * s.impressions) };
    case 'interactionRate':
      if (v > 1) return { error: 'A rate can’t be above 100%' };
      return need(s.impressions, 'impressions') || { base: 'interactions', total: r(v * s.impressions) };
    case 'viewRate':
      if (v > 1) return { error: 'A rate can’t be above 100%' };
      return need(s.impressions, 'video impressions') || { base: 'views', total: r(v * s.impressions) };
    case 'avgCpc':
      return need(s.clicks, 'clicks') || { base: 'cost', total: r(v * s.clicks) };
    case 'avgCost':
      return need(s.interactions, 'interactions') || { base: 'cost', total: r(v * s.interactions) };
    case 'avgCpv':
      return need(s.views, 'TrueView views') || { base: 'cost', total: r(v * s.views) };
    case 'avgCpm':
      return need(s.impressions, 'impressions') || { base: 'cost', total: r((v * s.impressions) / 1000) };
    case 'convRate':
      return need(s.interactions, 'interactions') || { base: 'conversions', total: r(v * s.interactions * 100) };
    case 'costPerConv':
      if (v === 0) return { base: 'conversions', total: 0 };
      return need(s.cost, 'cost') || { base: 'conversions', total: r((s.cost / v) * 100) };
    default:
      return { error: 'This column can’t be edited' };
  }
}
// Metrics whose edit only touches view-type rows (Video and Demand Gen campaigns).
export const VIEW_ONLY = new Set(['views', 'avgCpv', 'viewRate']);

// ---------------------------------------------------------------- formatting
const money = (cents, sym) => `${sym}${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function fmtWw(metric, v, sym = WW_CURRENCY) {
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return DASH;
  const kind = WW_ALL_METRICS[metric]?.kind || 'int';
  if (kind === 'int') return Math.round(v).toLocaleString('en-US');
  if (kind === 'money') return money(v, sym);
  if (kind === 'dec2') return (v / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${(v * 100).toFixed(2)}%`;
}
// Bid adjustments are whole percents: -100 -> "-100%", 20 -> "+20%", null -> "–".
export const fmtBidAdj = (v) => (v == null ? DASH : `${v > 0 ? '+' : ''}${v}%`);
// Ad group bid adjustment: null shows "None".
export const fmtAdGroupBidAdj = (v) => (v == null ? 'None' : fmtBidAdj(v));
// "-100", "+20", "20%", "" -> number (or null for empty); undefined when it isn't one.
export function parseBidAdj(text) {
  const s = String(text ?? '').trim().replace(/%$/, '').replace(/^\+/, '').trim();
  if (s === '' || s === DASH || /^none$/i.test(s)) return null;
  if (!/^-?\d{1,4}$/.test(s)) return undefined;
  const n = Number(s);
  return n < -100 || n > 900 ? undefined : n;
}

// Typed text -> stored units; null for empty; undefined when invalid.
export function parseWw(metric, text) {
  const s = String(text ?? '').trim().replace(/,/g, '');
  if (s === '') return null;
  const kind = WW_ALL_METRICS[metric]?.kind;
  if (kind === 'int') return /^\d{1,12}$/.test(s) ? Number(s) : undefined;
  if (kind === 'pct') {
    if (!/^\d{0,6}(\.\d{0,2})?$/.test(s) || s === '.') return undefined;
    return Number(s) / 100;
  }
  if (kind !== 'money' && kind !== 'dec2') return undefined;
  if (!/^\d{0,12}(\.\d{0,2})?$/.test(s) || s === '.') return undefined;
  const [w, f = ''] = s.split('.');
  return Number(w || '0') * 100 + Number((f + '00').slice(0, 2));
}
// The figure as the edit box starts with it (no symbol, commas or %).
export function editTextWw(metric, v) {
  if (v == null || !Number.isFinite(v)) return '';
  const kind = WW_ALL_METRICS[metric]?.kind;
  if (kind === 'int') return String(Math.round(v));
  if (kind === 'pct') return (v * 100).toFixed(2);
  return (v / 100).toFixed(2);
}
// What the edit box lets through while typing.
export function allowedWw(metric) {
  const kind = WW_ALL_METRICS[metric]?.kind;
  if (kind === 'int') return /^\d{0,12}$/;
  if (kind === 'pct') return /^\d{0,6}(\.\d{0,2})?$/;
  return /^\d{0,12}(\.\d{0,2})?$/;
}

// ---------------------------------------------------------------- columns per tab
// Attribute (text) columns. `lock`: always shown, first. `link`: shown as a link.
export const WW_ATTRS = {
  device: { label: 'Device' },
  level: { label: 'Level' },
  addedTo: { label: 'Added to', link: true },
  bidAdj: { label: 'Bid adj.', num: true },
  adGroupBidAdj: { label: 'Ad group bid adj.' },
  day: { label: 'Day' },
  hour: { label: 'Hour' },
  campaign: { label: 'Campaign', link: true },
  placement: { label: 'Placement', link: true },
  placementType: { label: 'Type' },
  adGroup: { label: 'Ad group', link: true },
  location: { label: 'Matched location', link: true },
};
export const colLabelWw = (k) => WW_ATTRS[k]?.label || WW_ALL_METRICS[k]?.label || k;

// locked: fixed first columns; defaults: the rest, in order; sort: starting sort column.
// checkbox: a selection column; total: where the total rows sit ('top' | 'bottom').
export const WW_TABLES = {
  devices: {
    locked: ['device', 'level', 'addedTo', 'bidAdj'],
    defaults: ['adGroupBidAdj', 'avgCpv', 'avgCpm', 'impressions', 'interactions', 'interactionRate', 'avgCost', 'cost', 'convRate', 'conversions', 'costPerConv'],
    attrs: ['adGroupBidAdj'],
    sort: { key: 'interactions', dir: 'desc' }, checkbox: true, total: 'bottom', frozen: ['device'],
    sections: ['recommended', 'performance', 'conversions', 'attributes', 'bidsim'],
    empty: 'You don’t have any devices yet',
  },
  when: {
    locked: ['day', 'hour', 'campaign'],
    defaults: ['avgCpv', 'avgCpm', 'impressions', 'interactions', 'interactionRate', 'avgCost', 'cost', 'convRate', 'conversions', 'costPerConv'],
    attrs: [],
    sort: { key: 'interactions', dir: 'desc' }, checkbox: false, total: 'top', frozen: [],
    sections: ['recommended', 'performance', 'viewability', 'conversions', 'attributes', 'competitive', 'youtube'],
    empty: 'There are no statistics for the selected date range. Please select a different date range.',
  },
  where: {
    locked: ['placement', 'placementType', 'campaign', 'adGroup'],
    defaults: ['avgCpv', 'avgCpm', 'impressions', 'interactions', 'interactionRate', 'avgCost', 'cost', 'convRate', 'conversions', 'costPerConv'],
    attrs: [],
    sort: { key: 'interactions', dir: 'desc' }, checkbox: true, total: 'top', frozen: ['placement'],
    sections: ['recommended', 'performance', 'viewability', 'conversions', 'attributes'],
    empty: 'You don’t have any placements yet',
  },
  locations: {
    locked: ['location'],
    defaults: ['clicks', 'impressions', 'ctr', 'avgCpc', 'cost', 'convRate', 'conversions', 'costPerConv'],
    attrs: [],
    sort: { key: 'clicks', dir: 'desc' }, checkbox: true, total: 'top', frozen: ['location'],
    sections: ['recommended', 'performance', 'conversions'],
    empty: 'There are no statistics for the selected date range. Please select a different date range.',
  },
};

// Columns panel sections: title and the columns listed in each (in order). Keys that are
// neither in WW_METRICS nor WW_EXTRAS nor WW_ATTRS are not offered.
export const WW_SECTIONS = {
  recommended: { title: 'Recommended columns', items: ['convRate', 'conversions', 'costPerConv'] },
  performance: {
    title: 'Performance',
    items: ['clicks', 'cost', 'impressions', 'ctr', 'interactions', 'interactionRate', 'engagements', 'engagementRate', 'avgCpc',
      'avgCost', 'avgCpe', 'avgCpm', 'avgCpv', 'views', 'viewRate', 'imprCoViewed', 'imprAbsTop', 'imprTop'],
  },
  viewability: { title: 'Viewability', items: ['viewableImpr', 'viewableRate', 'avgViewableCpm', 'measurableImpr', 'measurableRate'] },
  conversions: {
    title: 'Conversions',
    items: ['conversions', 'convRate', 'costPerConv', 'convValue', 'convValueCost', 'allConv', 'allConvRate', 'costPerAllConv',
      'allConvValue', 'allConvValueCost', 'allConvValueClick', 'valuePerAllConv', 'crossDeviceConv', 'viewThroughConv'],
  },
  attributes: { title: 'Attributes', items: ['adGroupBidAdj'] },
  competitive: { title: 'Competitive metrics', items: ['searchImprShare', 'searchTopIs', 'searchAbsTopIs'] },
  youtube: { title: 'YouTube Earned actions', items: ['earnedViews', 'earnedSubscribers', 'earnedLikes', 'earnedShares'] },
  bidsim: {
    title: 'Bid simulator',
    items: ['estClicksTop', 'estCostTop', 'estClicksUp30', 'estClicksUp100', 'estClicksDown30', 'estConvUp30', 'estConvUp100',
      'estConvDown30', 'estConvTop', 'estCostUp30', 'estCostUp100', 'estCostDown30'],
  },
};
// Tabs whose sections list fewer columns than WW_SECTIONS (Matched locations has no engagement or
// co-viewed columns).
const SECTION_SKIP = { locations: { performance: ['engagements', 'engagementRate', 'avgCpe', 'imprCoViewed'] } };
// The columns a tab's section lists (Attributes: the tab's own attribute columns).
export function sectionItems(tab, sec) {
  if (sec === 'attributes') return WW_TABLES[tab].attrs;
  const skip = SECTION_SKIP[tab]?.[sec] || [];
  return WW_SECTIONS[sec].items.filter((k) => !skip.includes(k));
}

// ---------------------------------------------------------------- column help (hover cards)
// paras: plain strings or [{ b: 'bold lead-in' }, ' rest of the paragraph']. link: link text
// (opens Quick help). Recommended columns also get the "recommended" note and hide button.
export const WW_HELP = {
  device: { paras: ['The kind of device people used when your ad showed: computers, mobile phones, tablets or TV screens.'] },
  level: { paras: ['Where the device setting applies: to the whole campaign or to one ad group.'] },
  addedTo: { paras: ['The campaign or ad group the device setting belongs to.'] },
  bidAdj: {
    paras: [
      'A bid adjustment raises or lowers your bids when your ad could show on this device, so you can spend more where it works best. −100% stops ads showing on the device.',
      'Automated bid strategies may use some adjustments differently.',
    ],
    link: 'Learn more',
  },
  adGroupBidAdj: { paras: ['The device adjustment set on an ad group. It takes the place of the campaign’s adjustment for that ad group, like an exception to the campaign rule.'] },
  day: { paras: ['The day of the week your ad showed, in your account’s time zone.'] },
  hour: { paras: ['The hour of the day your ad showed, in your account’s time zone.'] },
  campaign: { paras: ['The campaign the figures in this row belong to.'] },
  placement: { paras: ['Where your ad appeared: a channel, video, website or app.'] },
  placementType: { paras: ['The kind of placement: a channel, a video, a website or a mobile app.'] },
  adGroup: { paras: ['The ad group the figures in this row belong to.'] },
  location: { paras: ['The location that matched your ads, added up across campaigns. It can be where people were, or a place they showed interest in.'] },
  impressions: { paras: ['An impression is counted each time your ad is shown. It tells you how often your ad was seen.'], link: 'Learn more' },
  interactions: {
    paras: [
      'An interaction is the main action people take with your ad for its format: a click on a text ad, a view or engagement on a video ad, and so on.',
      'Interactions help you see whether your ads are working toward your goals.',
    ],
  },
  clicks: { paras: ['Counted each time someone clicks your ad.'], link: 'Learn more' },
  views: { paras: ['How many times people watched your video ad: to 30 seconds (or the end of a shorter video), or interacted with it.'], link: 'Learn more' },
  cost: { paras: ['Everything you spent on your ads during the selected period.'], link: 'Learn more' },
  ctr: { paras: ['Clickthrough rate: how often people who see your ad click it. Clicks divided by impressions.'], link: 'Learn more' },
  avgCpc: { paras: ['The average amount you paid for a click: cost divided by clicks.'], link: 'Learn more' },
  avgCpm: { paras: ['What you paid on average for every 1,000 times your ad was shown.'] },
  interactionRate: { paras: ['How often people interact with your ad after it’s shown: interactions divided by impressions. It shows how engaging your ad is.'] },
  avgCost: {
    paras: [
      [{ b: 'The average amount you paid for each interaction with your ad.' }],
      [{ b: 'How it works:' }, ' your total cost divided by the total number of interactions.'],
      [{ b: 'Example:' }, ` two interactions, one costing ${WW_CURRENCY}30 and one costing ${WW_CURRENCY}40, give an average cost of ${WW_CURRENCY}35.`],
    ],
    link: 'More about interactions',
  },
  avgCpv: { paras: ['The average amount you paid each time someone viewed your video ad: video cost divided by TrueView views.'], link: 'About cost-per-view bidding' },
  viewRate: { paras: ['How often people watched your video ad after seeing it: TrueView views divided by video impressions.'], link: 'Learn more' },
  convRate: {
    paras: [
      'How often, on average, an interaction leads to a conversion: conversions divided by interactions.',
      'Interactions are clicks on text ads and views on video ads. Only interactions that could lead to a conversion are counted.',
    ],
    link: 'Learn more',
  },
  conversions: {
    paras: [
      'The number of conversions you got after people interacted with your ad, from the actions included in this column.',
      'Each conversion action has a setting that decides whether its conversions count here.',
      'Automated bidding works toward the conversions in this column.',
    ],
    link: 'Learn more',
  },
  costPerConv: {
    paras: [
      'What a conversion cost you on average: your cost divided by your conversions.',
      'With several conversion actions, the overall figure can be lower than each action’s own.',
      'Only the cost of interactions that could lead to a conversion is included.',
    ],
    link: 'Learn more',
  },
};
export const helpWw = (k) => WW_HELP[k] || (WW_EXTRAS[k] ? { paras: [`${WW_EXTRAS[k].label} for this row. An admin can type it in.`] } : null);
// The note and button at the foot of a recommended column's card.
export const WW_REC_NOTE = 'This column is recommended for this table based on your account and campaign settings.';
export const WW_REC_HIDE = 'Don’t show this column';

// Hover text of the total rows' (?) icons.
export const WW_TOTAL_HELP = {
  account: 'All traffic to your account',
  filtered: 'All traffic to the rows in this view',
  type: (t) => `All traffic to your ${t} campaigns`,
};
