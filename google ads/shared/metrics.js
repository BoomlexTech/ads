// Metric definitions, formulas and formatting shared by server and client.
// Stored units: impressions/clicks = integer counts, cost = integer cents,
// conversions / convValue = integer hundredths. null means "no value" and renders as a dash.

export const BASE_METRICS = ['impressions', 'clicks', 'cost', 'conversions', 'convValue'];
// Sub-totals some formulas need: video-ad cost/clicks (Avg. CPV) and Demand Gen
// cost/conversions/conv. value (the "platform comparable" columns).
export const EXTRA_SUMS = ['vCost', 'vClicks', 'pCost', 'pConv', 'pValue'];

export const METRICS = {
  impressions: { label: 'Impr.', kind: 'int', base: true,
    help: 'Counted each time your ad is shown on a page or in a feed.' },
  clicks: { label: 'Clicks', kind: 'int', base: true,
    help: 'Counted each time someone <b>clicks</b> your ad.' },
  cost: { label: 'Cost', kind: 'money', base: true,
    help: 'What you spent on clicks and impressions during this period.' },
  conversions: { label: 'Conversions', kind: 'dec2', base: true,
    help: 'Valuable actions (purchases, sign-ups, calls) that happened after someone interacted with your ad.' },
  convValue: { label: 'Conv. value', kind: 'dec2', base: true,
    help: 'The total value of your conversions, such as sales revenue.' },
  ctr: { label: 'CTR', kind: 'pct', formula: 'Clicks ÷ Impr.',
    help: 'Clickthrough rate: clicks divided by impressions.' },
  avgCpc: { label: 'Avg. CPC', kind: 'money', formula: 'Cost ÷ Clicks',
    help: 'Average cost per click: cost divided by clicks.' },
  avgCpm: { label: 'Avg. CPM', kind: 'money', formula: 'Cost ÷ Impr. × 1,000',
    help: 'Average cost per thousand impressions.' },
  interactions: { label: 'Interactions', kind: 'int', editAs: 'clicks', formula: 'Clicks (the main action for each ad format)',
    help: 'The main action people take with your ad: clicks for text ads, views for video ads.' },
  interactionRate: { label: 'Interaction rate', kind: 'pct', formula: 'Interactions ÷ Impr.',
    help: 'How often people interact with your ad after it is shown.' },
  avgCost: { label: 'Avg. cost', kind: 'money', formula: 'Cost ÷ Interactions',
    help: 'The average amount you paid per interaction.' },
  avgCpv: { label: 'Avg. CPV', note: '(Video only)', kind: 'money', formula: 'Video cost ÷ video interactions',
    help: 'Average cost per view: what you paid on average for each view of your video ads.' },
  convRate: { label: 'Conv. rate', kind: 'pct', formula: 'Conversions ÷ Interactions',
    help: 'Conversions divided by interactions.' },
  costPerConv: { label: 'Cost / conv.', kind: 'money', formula: 'Cost ÷ Conversions',
    help: 'Cost divided by conversions.' },
  convPlatform: { label: 'Conv. (Platform Comparable)', kind: 'dec2', formula: 'Conversions of Demand Gen campaigns',
    help: 'Conversions counted the way other ad platforms count them. Reported for Demand Gen campaigns only.' },
  costPerConvPlatform: { label: 'Cost / Conv. (Platform Comparable)', kind: 'money', formula: 'Demand Gen cost ÷ Conv. (Platform Comparable)',
    help: 'Average cost of a platform-comparable conversion.' },
  convValueCostPlatform: { label: 'Conv. value / Cost (Platform Comparable)', kind: 'pct', formula: 'Demand Gen conv. value ÷ Demand Gen cost',
    help: 'Conversion value divided by cost, counted the way other ad platforms count it.' },
};
export const METRIC_KEYS = Object.keys(METRICS);
// Metrics that can be shown on the scorecards above the chart.
export const SCORECARD_KEYS = ['impressions', 'clicks', 'cost', 'conversions', 'ctr', 'avgCpc', 'avgCpm', 'interactions', 'interactionRate', 'avgCost', 'convRate', 'costPerConv'];

function ratio(a, b) {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

// Adds the sub-totals a single ad row contributes (needs row.format / row.campaignType).
export function rowExtras(r) {
  const video = r.format === 'video';
  const dg = r.campaignType === 'Demand Gen';
  return {
    ...r,
    vCost: video ? r.cost ?? null : null,
    vClicks: video ? r.clicks ?? null : null,
    pCost: dg ? r.cost ?? null : null,
    pConv: dg ? r.conversions ?? null : null,
    pValue: dg ? r.convValue ?? null : null,
  };
}

// t holds base metrics in stored units (or null); returns base + derived.
export function withDerived(t) {
  const x = t.vCost === undefined ? rowExtras(t) : t;
  const conv = x.conversions == null ? null : x.conversions / 100;
  const perImpr = ratio(x.cost, x.impressions);
  return {
    ...x,
    ctr: ratio(x.clicks, x.impressions),
    avgCpc: ratio(x.cost, x.clicks),
    avgCpm: perImpr == null ? null : perImpr * 1000,
    interactions: x.clicks ?? null,
    interactionRate: ratio(x.clicks, x.impressions),
    avgCost: ratio(x.cost, x.clicks),
    avgCpv: ratio(x.vCost, x.vClicks),
    convRate: ratio(conv, x.clicks),
    costPerConv: ratio(x.cost, conv),
    convPlatform: x.pConv ?? null,
    costPerConvPlatform: ratio(x.pCost, x.pConv == null ? null : x.pConv / 100),
    // Both in hundredths, so the plain ratio is the fraction shown as a percentage.
    convValueCostPlatform: ratio(x.pValue, x.pCost),
  };
}

// Column totals: empty cells are left out; a column with no values is null.
export function sumRows(rows) {
  const list = rows.map((r) => (r.vCost === undefined ? rowExtras(r) : r));
  const out = {};
  for (const m of [...BASE_METRICS, ...EXTRA_SUMS]) {
    let s = 0;
    let n = 0;
    for (const r of list) {
      if (r[m] != null) { s += r[m]; n++; }
    }
    out[m] = n ? s : null;
  }
  return out;
}

export const DASH = '–';

export function formatValue(metric, v) {
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return DASH;
  const kind = METRICS[metric].kind;
  if (kind === 'int') return Math.round(v).toLocaleString('en-US');
  if (kind === 'money') return '$' + (v / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (kind === 'dec2') return (v / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v * 100).toFixed(2) + '%';
}

// Typed text -> stored units; null for empty; undefined when invalid.
// Percentages are typed as "5.25" (meaning 5.25%) and stored as fractions.
export function parseInput(metric, text) {
  const s = String(text ?? '').trim();
  if (s === '') return null;
  const kind = METRICS[metric]?.kind;
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

// Exactly the figure the cell shows, minus "$", "," and "%", so leaving an untouched
// edit box never changes anything.
export function editText(metric, v) {
  if (v == null || !Number.isFinite(v)) return '';
  return formatValue(metric, v).replace(/[$,%]/g, '');
}

// What the edit box may contain while typing (letters never allowed).
export function allowedPattern(metric) {
  const kind = METRICS[metric].kind;
  if (kind === 'int') return /^\d{0,12}$/;
  if (kind === 'pct') return /^\d{0,6}(\.\d{0,2})?$/;
  return /^\d{0,12}(\.\d{0,2})?$/;
}

// Which ads a metric's total covers: all, video ads only (Avg. CPV) or Demand Gen
// campaigns only (platform-comparable columns).
export const METRIC_SCOPE = {
  avgCpv: 'video', convPlatform: 'demandgen', costPerConvPlatform: 'demandgen', convValueCostPlatform: 'demandgen',
};
// Columns an admin can type a figure into: the stored data behind them changes, so every
// total, scorecard and chart built from it follows.
export const EDITABLE = new Set(['impressions', 'clicks', 'cost', 'conversions', 'convValue', 'interactions', 'ctr', 'interactionRate',
  'avgCpc', 'avgCost', 'avgCpv', 'avgCpm', 'convRate', 'costPerConv', 'costPerConvPlatform', 'convPlatform', 'convValueCostPlatform']
  .filter((k) => METRICS[k]));

// Turn a typed value for any editable column into a new total for one stored metric,
// using the same formulas the table shows. s = current sums of the base metrics for
// the ads being edited (already narrowed to video / Demand Gen ads where that applies).
// Returns { base, total } or { error }.
export function solveMetric(metric, v, s) {
  const need = (x, what) => (x > 0 ? null : { error: `Needs ${what} first` });
  const r = Math.round;
  switch (metric) {
    case 'impressions': case 'clicks': case 'cost': case 'conversions': case 'convValue':
      return { base: metric, total: v };
    case 'interactions':
      return { base: 'clicks', total: v };
    case 'ctr': case 'interactionRate':
      if (v > 1) return { error: 'A rate can’t be above 100%' };
      return need(s.impressions, 'impressions') || { base: 'clicks', total: r(v * s.impressions) };
    case 'avgCpc': case 'avgCost': case 'avgCpv':
      return need(s.clicks, metric === 'avgCpv' ? 'video interactions' : 'clicks') || { base: 'cost', total: r(v * s.clicks) };
    case 'avgCpm':
      return need(s.impressions, 'impressions') || { base: 'cost', total: r((v * s.impressions) / 1000) };
    case 'convRate':
      return need(s.clicks, 'clicks') || { base: 'conversions', total: r(v * s.clicks * 100) };
    case 'costPerConv': case 'costPerConvPlatform':
      if (!(v > 0)) return { error: 'Enter an amount above 0' };
      return need(s.cost, 'cost') || { base: 'conversions', total: r((s.cost / v) * 100) };
    case 'convPlatform':
      return { base: 'conversions', total: v };
    case 'convValueCostPlatform':
      return need(s.cost, 'cost') || { base: 'convValue', total: r(v * s.cost) };
    default:
      return { error: 'This column can’t be edited' };
  }
}
