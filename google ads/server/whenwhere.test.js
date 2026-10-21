import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  buildWhenWhere, buildReport, parseRowField, seedPlan, moveToWeekday, registerWhenWhere, ensureWhenWhere, resetWhenWhere, WW_SEED_VERSION,
  WwCampaign, WwRow, WwStat,
} from './whenwhere.js';
import {
  deriveWw, sumWw, solveWw, parseWw, fmtWw, viewSums, parseBidAdj, editTextWw, hourLabel, isAdditive, isExtra, isWwMetric,
  WW_BASE, WW_DATA_START, DAYS, isViewType,
} from '../shared/whenwhere.js';
import { addDays, parseISO, eachDay, isISO, todayISO } from '../shared/dates.js';

const TODAY = '2026-10-16';
const ALL_TIME = { from: '2025-03-21', to: TODAY };
const show = (values, keys) => Object.fromEntries(keys.map((k) => [k, fmtWw(k, values[k])]));
const row = (type, t) => ({ ...t, ...viewSums(t, type) });
// The columns the When ads showed table shows, in its order.
const WHEN_COLS = ['avgCpv', 'avgCpm', 'impressions', 'interactions', 'interactionRate', 'avgCost', 'cost', 'convRate', 'conversions', 'costPerConv'];
// The Matched locations table's columns.
const LOC_COLS = ['clicks', 'impressions', 'ctr', 'avgCpc', 'cost', 'convRate', 'conversions', 'costPerConv'];
// What follows the Interactions figure, as the page words it.
const wordsOf = (v) => (!v.interactions ? '' : [v.clicks > 0 && 'clicks', v.interactions > v.clicks && 'engagements'].filter(Boolean).join(', '));

test('a When ads showed row: Monday 4 PM, Video views', () => {
  const v = deriveWw(sumWw([row('Video', { impressions: 1892, interactions: 777, clicks: 0, views: 393, cost: 5902, conversions: 0 })]));
  assert.deepEqual(show(v, ['impressions', 'interactions', 'cost', 'avgCpm', 'interactionRate', 'avgCost', 'avgCpv', 'convRate', 'conversions', 'costPerConv']), {
    impressions: '1,892', interactions: '777', cost: '$59.02', avgCpm: '$31.19', interactionRate: '41.07%', avgCost: '$0.08',
    avgCpv: '$0.15', convRate: '0.00%', conversions: '0.00', costPerConv: '$0.00',
  });
});

test('a row without figures: dashes for rates, zeros for money and conversions', () => {
  const v = deriveWw(sumWw([row('Video', { impressions: 0, interactions: 0, clicks: 0, views: 0, cost: 0, conversions: 0 })]));
  assert.deepEqual(show(v, ['avgCpv', 'avgCpm', 'impressions', 'interactions', 'interactionRate', 'avgCost', 'cost', 'convRate', 'conversions', 'costPerConv', 'ctr']), {
    avgCpv: '–', avgCpm: '–', impressions: '0', interactions: '0', interactionRate: '–', avgCost: '–', cost: '$0.00',
    convRate: '0.00%', conversions: '0.00', costPerConv: '$0.00', ctr: '–',
  });
  assert.equal(fmtWw('cost', null), '–');
});

// All-time figures per campaign type (every campaign), the removed campaigns' part, and the view
// (Campaign status: Enabled, Paused) — the reference report's totals.
const TARGETS = {
  Search: { impressions: 14561, interactions: 695, clicks: 695, views: null, cost: 85825, conversions: 0 },
  Video: { impressions: 43877, interactions: 11959, clicks: 183, views: 6400, cost: 123149, conversions: 100 },
  'Demand Gen': { impressions: 5676, interactions: 596, clicks: 38, views: 299, cost: 28693, conversions: 400 },
};
const REMOVED = {
  'Website traffic-Search-2': { impressions: 3021, interactions: 57, clicks: 57, views: null, cost: 7107, conversions: 0 },
  'Video reach - 2025-05-10': { impressions: 14474, interactions: 1388, clicks: 0, views: 350, cost: 30922, conversions: 0 },
};
const IN_VIEW = {
  Search: { impressions: 11540, interactions: 638, clicks: 638, views: null, cost: 78718, conversions: 0 },
  Video: { impressions: 29403, interactions: 10571, clicks: 183, views: 6050, cost: 92227, conversions: 100 },
  'Demand Gen': TARGETS['Demand Gen'],
};
const typed = (targets) => Object.entries(targets).map(([type, t]) => row(type, t));
const DISPLAY = row('Display', Object.fromEntries(WW_BASE.map((m) => [m, 0])));

test('total rows read like the reference report', () => {
  const view = deriveWw(sumWw(typed(IN_VIEW)));
  assert.deepEqual(show(view, [...WHEN_COLS, 'clicks', 'ctr', 'avgCpc']), {
    avgCpv: '$0.19', avgCpm: '$42.82', impressions: '46,619', interactions: '11,805', interactionRate: '25.32%', avgCost: '$0.17',
    cost: '$1,996.38', convRate: '0.04%', conversions: '5.00', costPerConv: '$399.28', clicks: '859', ctr: '1.84%', avgCpc: '$2.32',
  });
  assert.equal(wordsOf(view), 'clicks, engagements');
  const account = deriveWw(sumWw([...typed(TARGETS), DISPLAY]));
  assert.deepEqual(show(account, [...WHEN_COLS, 'clicks', 'ctr', 'avgCpc']), {
    avgCpv: '$0.23', avgCpm: '$37.07', impressions: '64,114', interactions: '13,250', interactionRate: '20.67%', avgCost: '$0.18',
    cost: '$2,376.67', convRate: '0.04%', conversions: '5.00', costPerConv: '$475.33', clicks: '916', ctr: '1.43%', avgCpc: '$2.59',
  });
  const type = (t) => deriveWw(sumWw([row(t, TARGETS[t])]));
  assert.deepEqual(show(type('Video'), [...WHEN_COLS, 'clicks', 'ctr', 'avgCpc']), {
    avgCpv: '$0.19', avgCpm: '$28.07', impressions: '43,877', interactions: '11,959', interactionRate: '27.26%', avgCost: '$0.10',
    cost: '$1,231.49', convRate: '0.01%', conversions: '1.00', costPerConv: '$1,231.49', clicks: '183', ctr: '0.42%', avgCpc: '$6.73',
  });
  assert.deepEqual(show(type('Demand Gen'), [...WHEN_COLS, 'clicks', 'ctr', 'avgCpc']), {
    avgCpv: '$0.96', avgCpm: '$50.55', impressions: '5,676', interactions: '596', interactionRate: '10.50%', avgCost: '$0.48',
    cost: '$286.93', convRate: '0.67%', conversions: '4.00', costPerConv: '$71.73', clicks: '38', ctr: '0.67%', avgCpc: '$7.55',
  });
  assert.deepEqual(show(type('Search'), [...WHEN_COLS, 'clicks', 'ctr', 'avgCpc']), {
    avgCpv: '–', avgCpm: '$58.94', impressions: '14,561', interactions: '695', interactionRate: '4.77%', avgCost: '$1.23',
    cost: '$858.25', convRate: '0.00%', conversions: '0.00', costPerConv: '$0.00', clicks: '695', ctr: '4.77%', avgCpc: '$1.23',
  });
  assert.equal(wordsOf(type('Search')), 'clicks');
  assert.deepEqual(show(deriveWw(sumWw([DISPLAY])), ['avgCpv', 'avgCpm', 'impressions', 'interactions', 'interactionRate', 'avgCost', 'cost', 'ctr', 'avgCpc']), {
    avgCpv: '–', avgCpm: '–', impressions: '0', interactions: '0', interactionRate: '–', avgCost: '–', cost: '$0.00', ctr: '–', avgCpc: '–',
  });
  const removed = sumWw(Object.values(REMOVED).map((t, i) => row(i ? 'Video' : 'Search', t)));
  assert.deepEqual([removed.impressions, removed.interactions, removed.clicks, removed.cost, removed.conversions], [17495, 1445, 57, 38029, 0]);
});

test('typed figures: parsing and working back to a base figure', () => {
  assert.equal(parseWw('impressions', '1,892'), 1892);
  assert.equal(parseWw('cost', '59.02'), 5902);
  assert.equal(parseWw('avgCpm', '31.2'), 3120);
  assert.equal(parseWw('conversions', '4'), 400);
  assert.equal(parseWw('interactionRate', '41.07'), 0.4107);
  assert.equal(parseWw('cost', ''), null);
  assert.equal(parseWw('cost', '1.234'), undefined);
  assert.equal(parseWw('impressions', '12a'), undefined);
  assert.equal(editTextWw('cost', 5902), '59.02');
  const s = { impressions: 1892, interactions: 777, clicks: 0, views: 393, cost: 5902, conversions: 0 };
  assert.deepEqual(solveWw('avgCpm', 3120, s), { base: 'cost', total: 5903 });
  assert.deepEqual(solveWw('interactionRate', 0.5, s), { base: 'interactions', total: 946 });
  assert.deepEqual(solveWw('avgCost', 10, s), { base: 'cost', total: 7770 });
  assert.deepEqual(solveWw('convRate', 0.01, s), { base: 'conversions', total: 777 });
  assert.deepEqual(solveWw('costPerConv', 2951, s), { base: 'conversions', total: 200 });
  assert.deepEqual(solveWw('ctr', 0.1, { ...s, impressions: 0 }), { error: 'Needs impressions first' });
  assert.ok(solveWw('ctr', 1.5, s).error);
});

test('typed-in columns: counts add up; rates, averages and ratios are shared or averaged', () => {
  // One row's typed rate shows (it used to read as a dash).
  const one = deriveWw(sumWw([{ impressions: 10, extras: { engagementRate: 0.125, engagements: 7 } }]));
  assert.deepEqual([fmtWw('engagementRate', one.engagementRate), fmtWw('engagements', one.engagements)], ['12.50%', '7']);
  // Rows sharing an Avg. CPE (as an edit of their total sets it): the total shows it, not the sum.
  const shared = deriveWw(sumWw([{ impressions: 100, extras: { avgCpe: 50, engagements: 3 } }, { impressions: 300, extras: { avgCpe: 50, engagements: 4 } }]));
  assert.deepEqual([fmtWw('avgCpe', shared.avgCpe), shared.engagements], ['$0.50', 7]);
  // Different values: weighted by impressions ((10×100 + 21×300) ÷ 400 = 18.25 paise -> whole paise),
  // or a plain average when the rows have no impressions. Rows without a value don't count.
  const mixed = sumWw([{ impressions: 100, extras: { avgCpe: 10, searchImprShare: 0.2 } }, { impressions: 300, extras: { avgCpe: 21, searchImprShare: 0.6 } }, { impressions: 50 }]);
  assert.deepEqual([mixed.extras.avgCpe, mixed.extras.searchImprShare], [18, 0.5]);
  assert.equal(sumWw([{ impressions: 0, extras: { convValueCost: 300 } }, { extras: { convValueCost: 101 } }]).extras.convValueCost, 201);
  assert.equal(deriveWw(sumWw([{ impressions: 5 }])).engagementRate, null);
  for (const k of ['impressions', 'cost', 'conversions', 'engagements', 'convValue', 'allConv', 'viewableImpr', 'estCostTop']) assert.equal(isAdditive(k), true, k);
  for (const k of ['ctr', 'avgCpm', 'costPerConv', 'engagementRate', 'avgCpe', 'avgViewableCpm', 'convValueCost', 'costPerAllConv',
    'allConvValueCost', 'allConvValueClick', 'valuePerAllConv', 'searchImprShare']) assert.equal(isAdditive(k), false, k);
  // Names every object has are no column.
  for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 7]) {
    assert.deepEqual([isWwMetric(k), isExtra(k), isAdditive(k)], [false, false, false], String(k));
  }
});

test('row fields: bid adjustments, days, hours and text', () => {
  assert.equal(parseBidAdj('-100%'), -100);
  assert.equal(parseRowField('bidAdj', '+20'), 20);
  assert.equal(parseRowField('bidAdj', ''), null);
  assert.equal(parseRowField('adGroupBidAdj', 'None'), null);
  assert.throws(() => parseRowField('bidAdj', '-101'), { message: 'Enter a percentage from -100 to 900', status: 400 });
  assert.throws(() => parseRowField('bidAdj', 'abc'), { message: 'Enter a percentage from -100 to 900' });
  assert.equal(parseRowField('dow', 'Monday'), 1);
  assert.equal(parseRowField('dow', 6), 6);
  assert.throws(() => parseRowField('dow', 7), { message: 'Pick a day' });
  assert.equal(parseRowField('hour', '4 PM – 5 PM'), 16);
  assert.equal(parseRowField('hour', '23'), 23);
  assert.throws(() => parseRowField('hour', 24), { message: 'Pick an hour' });
  assert.equal(parseRowField('device', 'Tablets'), 'Tablets');
  assert.throws(() => parseRowField('device', 'Phones'), { message: 'Pick a device' });
  assert.equal(parseRowField('campaignLabel', '  My   label '), 'My label');
  assert.equal(parseRowField('campaignLabel', ''), '');
  assert.throws(() => parseRowField('placement', '   '), { message: 'Enter some text' });
  assert.equal(parseRowField('placement', 'x'.repeat(200)).length, 120);
  assert.throws(() => parseRowField('views', '1'), { message: 'This field can’t be edited' });
});

test('start-up seeding: empty, older and current data', () => {
  assert.equal(WW_SEED_VERSION, 2);
  assert.equal(seedPlan(false, undefined), 'seed');
  assert.equal(seedPlan(false, 1), 'seed');
  // Emptied by the admin (every campaign deleted): stays empty.
  assert.equal(seedPlan(false, 2), null);
  assert.equal(seedPlan(true, undefined), 'reseed');
  assert.equal(seedPlan(true, 1), 'reseed');
  assert.equal(seedPlan(true, 2), null);
  assert.equal(seedPlan(true, 3), null);
});

// ---------------------------------------------------------------- the starting data
const seed = buildWhenWhere(TODAY);
const campOf = new Map(seed.campaigns.map((c) => [String(c._id), c]));
const rowById = new Map(seed.rows.map((r) => [String(r._id), r]));
const typeOfRow = (id) => campOf.get(String(rowById.get(String(id)).campaignId)).type;
const inView = (campaignId) => campOf.get(String(campaignId)).status !== 'removed';
const zero = () => Object.fromEntries(WW_BASE.map((m) => [m, 0]));
// Base figures added up per key over daily docs (null for a figure no doc has, like Search views).
function addUp(docs, keyOf) {
  const out = {};
  const seen = {};
  for (const d of docs) {
    const k = keyOf(d);
    const t = (out[k] ||= zero());
    for (const m of WW_BASE) {
      if (d[m] == null) continue;
      t[m] += d[m];
      (seen[k] ||= new Set()).add(m);
    }
  }
  for (const [k, t] of Object.entries(out)) for (const m of WW_BASE) if (!seen[k]?.has(m)) t[m] = null;
  return out;
}

test('starting data: 10 campaigns, the last two removed', () => {
  assert.deepEqual(seed.campaigns.map((c) => [c.name, c.type, c.status, c.order]), [
    ['Video views - 2025-04-04', 'Video', 'paused', 0],
    ['Video test views - 2025-04-18', 'Video', 'paused', 1],
    ['Demand Gen - 2025-04-18', 'Demand Gen', 'paused', 2],
    ['Website traffic-Search-1', 'Search', 'paused', 3],
    ['Website traffic-Video-1', 'Video', 'paused', 4],
    ['FR Video Conversions - 2025-03-21 #2', 'Demand Gen', 'paused', 5],
    ['Website traffic-Search-JAN2026', 'Search', 'paused', 6],
    ['Website traffic-Display-1', 'Display', 'paused', 7],
    ['Website traffic-Search-2', 'Search', 'removed', 8],
    ['Video reach - 2025-05-10', 'Video', 'removed', 9],
  ]);
});

test('starting data: every tab adds up to the account, removed and view totals', () => {
  const byName = (c) => c.name;
  for (const tab of ['devices', 'when', 'where', 'locations']) {
    const docs = seed.stats.filter((d) => d.tab === tab);
    // Where ads showed lists placements of Video and Demand Gen campaigns only.
    const only = (t) => (tab === 'where' ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'Search')) : t);
    assert.deepEqual(addUp(docs, (d) => typeOfRow(d.rowId)), only(TARGETS), tab);
    const view = docs.filter((d) => inView(rowById.get(String(d.rowId)).campaignId));
    assert.deepEqual(addUp(view, (d) => typeOfRow(d.rowId)), only(IN_VIEW), `${tab} view`);
    const removed = docs.filter((d) => !inView(rowById.get(String(d.rowId)).campaignId));
    const want = tab === 'where' ? { 'Video reach - 2025-05-10': REMOVED['Video reach - 2025-05-10'] } : REMOVED;
    assert.deepEqual(addUp(removed, (d) => byName(campOf.get(String(rowById.get(String(d.rowId)).campaignId)))), want, `${tab} removed`);
  }
  // Each tab splits the same campaign-day figures (Where: its view-type campaigns' days).
  const perDay = (tab) => addUp(seed.stats.filter((d) => d.tab === tab), (d) => `${rowById.get(String(d.rowId)).campaignId}|${d.date}`);
  const when = perDay('when');
  assert.deepEqual(perDay('devices'), when);
  assert.deepEqual(perDay('locations'), when);
  const viewDays = Object.fromEntries(Object.entries(when).filter(([k]) => isViewType(campOf.get(k.split('|')[0]).type)));
  assert.deepEqual(perDay('where'), viewDays);
});

test('starting data: daily figures, limits and the same figures every time', () => {
  assert.ok(seed.stats.length < 20000, `${seed.stats.length} daily docs`);
  for (const d of seed.stats) {
    assert.ok(d.date >= '2025-03-21' && d.date <= '2026-02-15');
    for (const m of WW_BASE) assert.ok(d[m] == null || (Number.isInteger(d[m]) && d[m] >= 0), `${m} ${d[m]}`);
    if (isViewType(typeOfRow(d.rowId))) {
      assert.ok(d.interactions <= d.impressions && d.clicks <= d.interactions && d.views <= d.interactions, JSON.stringify(d));
    } else {
      assert.equal(d.interactions, d.clicks);
      assert.equal(d.views, null);
      assert.ok(d.clicks <= d.impressions);
    }
    assert.ok(d.impressions > 0 || d.cost === 0);
    assert.ok(d.interactions > 0 || d.conversions === 0);
  }
  // FR Video Conversions and the Display campaign never served.
  const silent = new Set(seed.campaigns.filter((c) => ['FR Video Conversions - 2025-03-21 #2', 'Website traffic-Display-1'].includes(c.name)).map((c) => String(c._id)));
  assert.ok(!seed.stats.some((d) => silent.has(String(rowById.get(String(d.rowId)).campaignId))));
  assert.ok(seed.rows.filter((r) => silent.has(String(r.campaignId))).every((r) => r.tab === 'devices'));
  // Demand Gen - 2025-04-18: everything on one Friday, in one hour.
  const dg = seed.campaigns.find((c) => c.name === 'Demand Gen - 2025-04-18');
  const dgDocs = seed.stats.filter((d) => String(rowById.get(String(d.rowId)).campaignId) === String(dg._id));
  assert.deepEqual([...new Set(dgDocs.map((d) => d.date))], ['2025-04-18']);
  assert.equal(parseISO('2025-04-18').getDay(), 5);
  assert.deepEqual(seed.rows.filter((r) => r.tab === 'when' && String(r.campaignId) === String(dg._id)).map((r) => [r.dow, r.hour]), [[5, 11]]);
  // Same figures every time.
  const again = buildWhenWhere(TODAY);
  assert.deepEqual(again.stats.map(({ rowId, ...d }) => d), seed.stats.map(({ rowId, ...d }) => d));
  assert.deepEqual(again.rows.map(({ _id, campaignId, ...r }) => r), seed.rows.map(({ _id, campaignId, ...r }) => r));
});

const reportOf = (tab, range, segment) => buildReport({
  campaigns: seed.campaigns, rows: seed.rows.filter((r) => r.tab === tab), stats: seed.stats.filter((d) => d.tab === tab), ...range, segment, today: TODAY,
});
// The page's default view of a tab for All time: rows of campaigns that aren't removed (Devices: all
// of them; other tabs: those with figures), each with its columns worked out.
function viewOf(tab) {
  const rep = reportOf(tab, ALL_TIME);
  const type = new Map(rep.campaigns.map((c) => [c.id, c.type]));
  const removed = new Set(rep.campaigns.filter((c) => c.status === 'removed').map((c) => c.id));
  const name = new Map(rep.campaigns.map((c) => [c.id, c.name]));
  const figures = (list) => deriveWw(sumWw(list.map((r) => ({ ...r, ...viewSums(r, type.get(r.campaignId)) }))));
  const all = rep.rows.filter((r) => tab === 'devices' || r.has);
  return { rep, all, rows: all.filter((r) => !removed.has(r.campaignId)), name, figures };
}
// Interactions descending; equal figures keep the stored order (as the page sorts).
const byInteractions = (list) => [...list].sort((a, b) => b.interactions - a.interactions || a.order - b.order);

test('When ads showed: 224 rows in the view and the busiest hours of All time', () => {
  const { rep, all, rows, name, figures } = viewOf('when');
  assert.equal(rep.rows.length, all.length);
  assert.equal(rows.length, 224);
  assert.ok(all.length > 224, 'the removed campaigns have hours too');
  const shown = byInteractions(rows).slice(0, 6).map((r) => {
    const v = figures([r]);
    return [DAYS[r.dow], hourLabel(r.hour), name.get(r.campaignId), ...Object.values(show(v, WHEN_COLS)), wordsOf(v)];
  });
  assert.deepEqual(shown, [
    ['Monday', '4 PM – 5 PM', 'Video views - 2025-04-04', '$0.15', '$31.19', '1,892', '777', '41.07%', '$0.08', '$59.02', '0.00%', '0.00', '$0.00', 'engagements'],
    ['Friday', '10 PM – 11 PM', 'Video views - 2025-04-04', '$0.23', '$22.49', '2,542', '650', '25.57%', '$0.09', '$57.16', '0.00%', '0.00', '$0.00', 'engagements'],
    ['Friday', '11 AM – 12 PM', 'Demand Gen - 2025-04-18', '$0.96', '$50.55', '5,676', '596', '10.50%', '$0.48', '$286.93', '0.67%', '4.00', '$71.73', 'clicks, engagements'],
    ['Saturday', '4 PM – 5 PM', 'Video test views - 2025-04-18', '$0.12', '$31.68', '817', '397', '48.59%', '$0.07', '$25.88', '0.00%', '0.00', '$0.00', 'engagements'],
    ['Friday', '11 PM – 12 AM', 'Video views - 2025-04-04', '$0.22', '$23.39', '1,400', '381', '27.21%', '$0.09', '$32.75', '0.00%', '0.00', '$0.00', 'engagements'],
    ['Monday', '3 PM – 4 PM', 'Video views - 2025-04-04', '$0.14', '$31.77', '747', '364', '48.73%', '$0.07', '$23.73', '0.00%', '0.00', '$0.00', 'engagements'],
  ]);
  assert.ok(byInteractions(rows)[6].interactions < 364);
  // Words follow the figures.
  for (const r of rows) {
    const w = wordsOf(r);
    if (r.clicks === 0) assert.equal(w, 'engagements');
    else if (r.interactions > r.clicks) assert.equal(w, 'clicks, engagements');
    else assert.equal(w, 'clicks');
  }
  // Totals: the view on top, then the account's and one per campaign type.
  const type = new Map(rep.campaigns.map((c) => [c.id, c.type]));
  assert.deepEqual(show(figures(rows), WHEN_COLS), {
    avgCpv: '$0.19', avgCpm: '$42.82', impressions: '46,619', interactions: '11,805', interactionRate: '25.32%', avgCost: '$0.17',
    cost: '$1,996.38', convRate: '0.04%', conversions: '5.00', costPerConv: '$399.28',
  });
  assert.deepEqual(show(figures(all), WHEN_COLS), {
    avgCpv: '$0.23', avgCpm: '$37.07', impressions: '64,114', interactions: '13,250', interactionRate: '20.67%', avgCost: '$0.18',
    cost: '$2,376.67', convRate: '0.04%', conversions: '5.00', costPerConv: '$475.33',
  });
  const ofType = (t) => show(figures(all.filter((r) => type.get(r.campaignId) === t)), WHEN_COLS);
  assert.deepEqual(ofType('Search'), {
    avgCpv: '–', avgCpm: '$58.94', impressions: '14,561', interactions: '695', interactionRate: '4.77%', avgCost: '$1.23',
    cost: '$858.25', convRate: '0.00%', conversions: '0.00', costPerConv: '$0.00',
  });
  assert.deepEqual(ofType('Video'), {
    avgCpv: '$0.19', avgCpm: '$28.07', impressions: '43,877', interactions: '11,959', interactionRate: '27.26%', avgCost: '$0.10',
    cost: '$1,231.49', convRate: '0.01%', conversions: '1.00', costPerConv: '$1,231.49',
  });
  assert.deepEqual(ofType('Demand Gen'), {
    avgCpv: '$0.96', avgCpm: '$50.55', impressions: '5,676', interactions: '596', interactionRate: '10.50%', avgCost: '$0.48',
    cost: '$286.93', convRate: '0.67%', conversions: '4.00', costPerConv: '$71.73',
  });
  // 'When' rows only have days on their own weekday.
  for (const d of seed.stats.filter((x) => x.tab === 'when')) assert.equal(parseISO(d.date).getDay(), rowById.get(String(d.rowId)).dow);
  assert.equal(rep.series.length, eachDay(ALL_TIME.from, ALL_TIME.to).length);
  const series = sumWw(rep.series);
  assert.equal(series.impressions, 64114);
  assert.equal(series.vCost, 123149 + 28693);
  assert.equal(series.vImpr, 43877 + 5676);
});

test('Devices: the 30 rows of the view, -100% devices without figures', () => {
  const { all, rows, name, figures } = viewOf('devices');
  assert.equal(all.length, 37);
  assert.equal(rows.length, 30);
  assert.deepEqual(rows.map((r) => [name.get(r.campaignId), r.device, r.bidAdj]), [
    ['Video views - 2025-04-04', 'Computers', null], ['Video views - 2025-04-04', 'Mobile phones', null],
    ['Video views - 2025-04-04', 'Tablets', -100], ['Video views - 2025-04-04', 'TV screens', -100],
    ['Video test views - 2025-04-18', 'Computers', null], ['Video test views - 2025-04-18', 'Mobile phones', null],
    ['Video test views - 2025-04-18', 'Tablets', null], ['Video test views - 2025-04-18', 'TV screens', null],
    ['Demand Gen - 2025-04-18', 'Computers', -100], ['Demand Gen - 2025-04-18', 'Mobile phones', null],
    ['Demand Gen - 2025-04-18', 'Tablets', -100], ['Demand Gen - 2025-04-18', 'TV screens', -100],
    ['Website traffic-Search-1', 'Computers', null], ['Website traffic-Search-1', 'Mobile phones', null], ['Website traffic-Search-1', 'Tablets', null],
    ['Website traffic-Video-1', 'Computers', null], ['Website traffic-Video-1', 'Mobile phones', null],
    ['Website traffic-Video-1', 'Tablets', null], ['Website traffic-Video-1', 'TV screens', null],
    ['FR Video Conversions - 2025-03-21 #2', 'Computers', null], ['FR Video Conversions - 2025-03-21 #2', 'Mobile phones', null],
    ['FR Video Conversions - 2025-03-21 #2', 'Tablets', null], ['FR Video Conversions - 2025-03-21 #2', 'TV screens', null],
    ['Website traffic-Search-JAN2026', 'Computers', null], ['Website traffic-Search-JAN2026', 'Mobile phones', null], ['Website traffic-Search-JAN2026', 'Tablets', null],
    ['Website traffic-Display-1', 'Computers', null], ['Website traffic-Display-1', 'Mobile phones', null],
    ['Website traffic-Display-1', 'Tablets', null], ['Website traffic-Display-1', 'TV screens', null],
  ]);
  assert.deepEqual(all.slice(30).map((r) => [name.get(r.campaignId), r.device]), [
    ['Website traffic-Search-2', 'Computers'], ['Website traffic-Search-2', 'Mobile phones'], ['Website traffic-Search-2', 'Tablets'],
    ['Video reach - 2025-05-10', 'Computers'], ['Video reach - 2025-05-10', 'Mobile phones'], ['Video reach - 2025-05-10', 'Tablets'],
    ['Video reach - 2025-05-10', 'TV screens'],
  ]);
  assert.ok(all.filter((r) => r.bidAdj === -100).every((r) => !r.has && r.impressions === 0));
  const phones = rows.find((r) => r.device === 'Mobile phones' && name.get(r.campaignId) === 'Video test views - 2025-04-18');
  const v = figures([phones]);
  assert.deepEqual(show(v, ['avgCpv', 'avgCpm', 'impressions', 'interactions', 'interactionRate', 'avgCost', 'cost']), {
    avgCpv: '$0.14', avgCpm: '$35.37', impressions: '14,057', interactions: '6,184', interactionRate: '43.99%', avgCost: '$0.08', cost: '$497.15',
  });
  assert.equal(wordsOf(v), 'clicks, engagements');
  assert.deepEqual(show(figures(all), ['impressions', 'interactions', 'cost', 'conversions']), { impressions: '64,114', interactions: '13,250', cost: '$2,376.67', conversions: '5.00' });
});

test('Where ads showed: placements of Video and Demand Gen campaigns, 5s Crafts first', () => {
  const { all, rows, name, figures, rep } = viewOf('where');
  const type = new Map(rep.campaigns.map((c) => [c.id, c.type]));
  assert.ok(all.every((r) => isViewType(type.get(r.campaignId))));
  const top = byInteractions(rows).slice(0, 2).map((r) => {
    const v = figures([r]);
    return [r.placement, r.placementType, name.get(r.campaignId), r.adGroup, ...Object.values(show(v, ['avgCpv', 'avgCpm', 'impressions', 'interactions', 'interactionRate'])), wordsOf(v)];
  });
  // The reference shows Avg. CPM $30.82 for 5s Crafts, which no whole-paise cost gives for 370
  // impressions ($11.40 -> $30.81, $11.41 -> $30.84).
  assert.deepEqual(top, [
    ['5s Crafts', 'YouTube channel', 'Video test views - 2025-04-18', 'Video views - 2025-04-18', '$0.11', '$30.81', '370', '170', '45.95%', 'engagements'],
    ['JOGRANA81 Vlogs', 'YouTube channel', 'Video test views - 2025-04-18', 'Video views - 2025-04-18', '$0.13', '$40.61', '347', '154', '44.38%', 'engagements'],
  ]);
  assert.ok(byInteractions(rows)[2].interactions < 154);
  assert.equal(new Set(rows.map((r) => `${r.campaignId}|${r.placement}`)).size, rows.length);
  assert.deepEqual(show(figures(rows), WHEN_COLS), {
    avgCpv: '$0.19', avgCpm: '$34.47', impressions: '35,079', interactions: '11,167', interactionRate: '31.83%', avgCost: '$0.11',
    cost: '$1,209.20', convRate: '0.04%', conversions: '5.00', costPerConv: '$241.84',
  });
  assert.deepEqual(show(figures(all.filter((r) => type.get(r.campaignId) === 'Video')), ['impressions', 'interactions', 'clicks', 'views', 'cost']),
    { impressions: '43,877', interactions: '11,959', clicks: '183', views: '6,400', cost: '$1,231.49' });
});

// The Matched locations table in its default (account) view: rows of the same place added up,
// most clicks first, equal clicks in stored order.
const LOCATIONS = [
  ['India', '850', '45,046', '1.89%', '$2.28', '$1,939.77', '0.05%', '5.00', '$387.95'],
  ['Bangladesh', '2', '422', '0.47%', '$8.59', '$17.17'],
  ['Nepal', '2', '130', '1.54%', '$2.53', '$5.05'],
  ['Algeria', '1', '44', '2.27%', '$1.35', '$1.35'],
  ['Laos', '1', '8', '12.50%', '$0.12', '$0.12'],
  ['Pakistan', '1', '449', '0.22%', '$13.24', '$13.24'],
  ['Philippines', '1', '121', '0.83%', '$5.02', '$5.02'],
  ['Tanzania', '1', '9', '11.11%', '$0.49', '$0.49'],
];
const ZERO_CLICKS = ['Sri Lanka', 'United Arab Emirates', 'United States', 'Indonesia', 'Nigeria', 'Kenya', 'Saudi Arabia', 'Malaysia', 'Myanmar',
  'Ethiopia', 'Ghana', 'Uganda', 'Cambodia', 'Morocco', 'Iraq', 'Oman', 'Qatar', 'Kuwait', 'Singapore'];
const LAST = [['Vietnam', '4', '$0.00'], ['Zimbabwe', '1', '$0.00'], ['Thailand', '3', '$0.00'], ['Tunisia', '4', '$0.47'], ['North Macedonia', '1', '$0.10'], ['Egypt', '96', '$1.88']];

test('Matched locations: 33 places adding up to the view', () => {
  const { all, rows, name, figures } = viewOf('locations');
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.location)) groups.set(r.location, []);
    groups.get(r.location).push(r);
  }
  const places = [...groups].map(([location, list]) => ({ location, order: list[0].order, v: figures(list) }))
    .sort((a, b) => b.v.clicks - a.v.clicks || a.order - b.order);
  assert.equal(places.length, 33);
  const cells = (p) => [p.location, ...Object.values(show(p.v, LOC_COLS))];
  assert.deepEqual(cells(places[0]), LOCATIONS[0]);
  for (const [i, want] of LOCATIONS.slice(1).entries()) {
    assert.deepEqual(cells(places[i + 1]), [...want, '0.00%', '0.00', '$0.00']);
  }
  const zeros = places.slice(8, 27);
  assert.deepEqual(zeros.map((p) => p.location), ZERO_CLICKS);
  assert.ok(zeros.every((p) => p.v.clicks === 0 && p.v.impressions >= 1));
  assert.deepEqual([sumWw(zeros.map((p) => p.v)).impressions, sumWw(zeros.map((p) => p.v)).cost], [281, 1172]);
  assert.deepEqual(places.slice(27).map((p) => [p.location, fmtWw('clicks', p.v.clicks), fmtWw('impressions', p.v.impressions), fmtWw('cost', p.v.cost)]),
    LAST.map(([l, impr, cost]) => [l, '0', impr, cost]));
  // The rows are stored in the table's order, India first and Egypt last.
  const order = [...new Set([...seed.rows].filter((r) => r.tab === 'locations').sort((a, b) => a.order - b.order).map((r) => r.location))];
  assert.deepEqual(order, places.map((p) => p.location));
  // Totals: the view's, the account's and per campaign type (Locations columns).
  assert.deepEqual(show(figures(rows), LOC_COLS), {
    clicks: '859', impressions: '46,619', ctr: '1.84%', avgCpc: '$2.32', cost: '$1,996.38', convRate: '0.04%', conversions: '5.00', costPerConv: '$399.28',
  });
  assert.equal(sumWw(rows).interactions, 11805);
  assert.deepEqual(show(figures(all), LOC_COLS), {
    clicks: '916', impressions: '64,114', ctr: '1.43%', avgCpc: '$2.59', cost: '$2,376.67', convRate: '0.04%', conversions: '5.00', costPerConv: '$475.33',
  });
  // Removed campaigns: India only.
  const removed = all.filter((r) => !rows.includes(r));
  assert.deepEqual(removed.map((r) => [name.get(r.campaignId), r.location]), [['Website traffic-Search-2', 'India'], ['Video reach - 2025-05-10', 'India']]);
});

test('report: last 30 days has no figures, rows show zeros', () => {
  const rep = reportOf('devices', { from: '2026-09-17', to: TODAY });
  assert.equal(rep.rows.length, 37);
  assert.ok(rep.rows.every((r) => !r.has && r.impressions === 0 && r.cost === 0 && r.views === 0));
  assert.ok(rep.series.every((p) => p.impressions === 0 && p.vCost === 0));
  assert.equal(rep.dataStart, '2025-03-21');
  assert.deepEqual(rep.campaigns.slice(-1).map((c) => [c.name, c.status]), [['Video reach - 2025-05-10', 'removed']]);
});

test('report: sums, empty figures and segments', () => {
  const campaigns = [{ _id: 'c1', name: 'V', type: 'Video', status: 'paused', order: 0 }, { _id: 'c2', name: 'S', type: 'Search', status: 'paused', order: 1 }];
  const rows = [
    { _id: 'r1', tab: 'devices', campaignId: 'c1', device: 'Computers', level: 'Campaign', bidAdj: null, order: 0 },
    { _id: 'r2', tab: 'devices', campaignId: 'c2', device: 'Tablets', level: 'Campaign', bidAdj: -100, order: 1 },
    { _id: 'r3', tab: 'devices', campaignId: 'c2', device: 'Computers', level: 'Campaign', bidAdj: null, order: 2 },
  ];
  const d = (rowId, date, impressions, cost, views = null) => ({ rowId, date, impressions, interactions: 1, clicks: 1, views, cost, conversions: 0 });
  const stats = [
    d('r1', '2026-03-30', 100, 50, 10), d('r1', '2026-04-02', 200, 70, 20), d('r1', '2026-04-06', 300, 90, 30),
    d('r3', '2026-04-02', 40, 30), d('r3', '2026-05-01', 999, 999),
  ];
  const rep = buildReport({ campaigns, rows, stats, from: '2026-04-01', to: '2026-04-07', segment: 'week', today: TODAY });
  const [r1, r2, r3] = rep.rows;
  assert.deepEqual([r1.impressions, r1.cost, r1.views, r1.has], [500, 160, 50, true]);
  // No days in the range: zeros. Days without a figure (Search has no views): empty.
  assert.deepEqual([r2.impressions, r2.views, r2.has], [0, 0, false]);
  assert.deepEqual([r3.impressions, r3.views, r3.has], [40, null, true]);
  assert.equal(r2.bidAdj, -100);
  assert.equal(rep.series.length, 7);
  assert.deepEqual(rep.series.find((p) => p.date === '2026-04-02'), {
    date: '2026-04-02', impressions: 240, interactions: 2, clicks: 2, views: 20, cost: 100, conversions: 0, vCost: 70, vImpr: 200,
  });
  assert.deepEqual(rep.series[0], { date: '2026-04-01', impressions: 0, interactions: 0, clicks: 0, views: 0, cost: 0, conversions: 0, vCost: 0, vImpr: 0 });
  // Weeks start on Monday and are cut to the range.
  const weeks = rep.segments.filter((s) => s.rowId === 'r1').map((s) => [s.key, s.from, s.to, s.impressions]);
  assert.deepEqual(weeks, [['2026-03-30', '2026-04-01', '2026-04-05', 200], ['2026-04-06', '2026-04-06', '2026-04-07', 300]]);
  const dow = buildReport({ campaigns, rows, stats, from: '2026-04-01', to: '2026-04-07', segment: 'dow', today: TODAY }).segments;
  assert.deepEqual(dow.filter((s) => s.rowId === 'r1').map((s) => [s.key, s.from, s.to]), [[4, '2026-04-01', '2026-04-07'], [1, '2026-04-01', '2026-04-07']]);
  assert.deepEqual(rep.campaigns[0], { id: 'c1', name: 'V', type: 'Video', status: 'paused', order: 0 });
});

// ---------------------------------------------------------------- changing a When row's day
const weekOf = (iso) => addDays(iso, -((parseISO(iso).getDay() + 6) % 7));
// The docs after a move: merged ones gone, the others with their new date (and added-up figures).
function moved(docs, { keep, drop }) {
  const gone = new Set(drop);
  const change = new Map(keep.map((k) => [k._id, k]));
  return docs.filter((d) => !gone.has(d._id)).map((d) => ({ ...d, ...change.get(d._id) }));
}

test('moving a When row to another day: same week, inside the data range, days merged', () => {
  // 2025-03-21 (the data start) and 2026-10-16 (today) are Fridays.
  const lo = '2025-03-21';
  const hi = '2026-10-16';
  const doc = (date, impressions) => ({ _id: date, rowId: 'r1', date, impressions, interactions: 1, clicks: 1, views: null, cost: 10, conversions: 0 });
  const fridays = [doc('2025-03-21', 5), doc('2025-03-28', 6), doc('2025-06-06', 7), doc('2026-10-09', 8), doc('2026-10-16', 9)];
  // Tuesday: each week's, but 2025-03-18 is before the data start, so that day joins the next week's.
  assert.deepEqual(moveToWeekday(fridays, 2, lo, hi), {
    keep: [
      { _id: '2025-03-21', date: '2025-03-25', impressions: 11, interactions: 2, clicks: 2, views: null, cost: 20, conversions: 0 },
      { _id: '2025-06-06', date: '2025-06-03' }, { _id: '2026-10-09', date: '2026-10-06' }, { _id: '2026-10-16', date: '2026-10-13' },
    ],
    drop: ['2025-03-28'],
  });
  // Saturday: this week's (Oct 17) is after today, so today's figures join last Saturday's.
  const sat = moveToWeekday(fridays, 6, lo, hi);
  assert.deepEqual(sat.drop, ['2026-10-16']);
  assert.deepEqual(sat.keep.map((k) => [k._id, k.date, k.impressions]), [
    ['2025-03-21', '2025-03-22', undefined], ['2025-03-28', '2025-03-29', undefined], ['2025-06-06', '2025-06-07', undefined], ['2026-10-09', '2026-10-10', 17],
  ]);
  // A doc already on the new day keeps it (no other doc moves onto a date still taken).
  const odd = [doc('2025-06-06', 1), { ...doc('2025-06-03', 2), _id: 'tue' }];
  assert.deepEqual(moveToWeekday(odd, 2, lo, hi), {
    keep: [{ _id: 'tue', date: '2025-06-03', impressions: 3, interactions: 2, clicks: 2, views: null, cost: 20, conversions: 0 }], drop: ['2025-06-06'],
  });
  // The starting data, every row to every day: same weeks, one doc a day, the same figures.
  const docs = seed.stats.filter((d) => d.tab === 'when').map((d, i) => ({ ...d, _id: i }));
  const was = new Map(docs.map((d) => [d._id, d.date]));
  const perRow = (list) => addUp(list, (d) => String(d.rowId));
  for (let dow = 0; dow < 7; dow++) {
    const after = moved(docs, moveToWeekday(docs, dow, WW_DATA_START, TODAY));
    assert.ok(after.every((d) => parseISO(d.date).getDay() === dow && weekOf(d.date) === weekOf(was.get(d._id))), DAYS[dow]);
    assert.equal(new Set(after.map((d) => `${d.rowId}|${d.date}`)).size, after.length);
    assert.deepEqual(perRow(after), perRow(docs));
  }
});

// ---------------------------------------------------------------- routes, on a stand-in database
// Each model's calls run on an array (only the queries and updates this section makes), so the
// routes and start-up are tested without a database server. `key`: a unique index besides _id.
const same = (a, b) => String(a) === String(b);
const isOp = (v) => v != null && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId);
// An $in list as a set of strings, made once per list (deleting a whole section matches every daily
// doc against hundreds of row ids).
const inSets = new WeakMap();
const inSet = (x) => inSets.get(x) || inSets.set(x, new Set(x.map(String))).get(x);
const OPS = { $in: (v, x) => inSet(x).has(String(v)), $gte: (v, x) => v >= x, $lte: (v, x) => v <= x, $lt: (v, x) => v < x };
const matches = (doc, q) => Object.entries(q).every(([k, want]) => (isOp(want)
  ? Object.entries(want).every(([op, x]) => OPS[op](doc[k], x)) : same(doc[k], want)));
function applyUpdate(doc, { $set = {}, $unset = {} }) {
  for (const [path, v] of Object.entries($set)) {
    const [a, b] = path.split('.');
    if (b) doc[a] = { ...doc[a], [b]: v };
    else doc[a] = v;
  }
  for (const path of Object.keys($unset)) {
    const [a, b] = path.split('.');
    doc[a] = { ...doc[a] };
    delete doc[a][b];
  }
}
const copy = (d) => d && { ...d, ...(d.extras && { extras: { ...d.extras } }) };
function fakeModel(model, key = () => null) {
  const docs = [];
  const index = new Set();
  const keysOf = (d) => [`id:${d._id}`, ...(key(d) == null ? [] : [`key:${key(d)}`])];
  const dupKey = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
  const put = (d) => {
    const doc = { _id: new mongoose.Types.ObjectId(), ...d };
    if (keysOf(doc).some((k) => index.has(k))) throw dupKey();
    keysOf(doc).forEach((k) => index.add(k));
    docs.push(doc);
    return doc;
  };
  const update = (doc, u) => {
    const next = copy(doc);
    applyUpdate(next, u);
    keysOf(doc).forEach((k) => index.delete(k));
    const clash = keysOf(next).some((k) => index.has(k));
    keysOf(clash ? doc : next).forEach((k) => index.add(k));
    if (clash) throw dupKey();
    docs[docs.indexOf(doc)] = next;
  };
  const keepOnly = (pred) => {
    const left = docs.filter(pred);
    docs.length = 0;
    index.clear();
    left.forEach(put);
  };
  const sorted = (list, spec) => [...list].sort((a, b) => {
    for (const [k, dir] of Object.entries(spec)) {
      const [x, y] = k === '_id' ? [String(a[k]), String(b[k])] : [a[k], b[k]];
      if (x !== y) return x < y ? -dir : dir;
    }
    return 0;
  });
  Object.assign(model, {
    find: (q = {}) => {
      let spec = {};
      const chain = { sort: (s) => { spec = s; return chain; }, lean: async () => sorted(docs.filter((d) => matches(d, q)), spec).map(copy) };
      return chain;
    },
    findOne: (q = {}) => {
      let spec = {};
      const chain = { sort: (s) => { spec = s; return chain; }, lean: async () => copy(sorted(docs.filter((d) => matches(d, q)), spec)[0]) ?? null };
      return chain;
    },
    exists: async (q) => (docs.some((d) => matches(d, q)) ? { _id: docs.find((d) => matches(d, q))._id } : null),
    create: async (d) => put(d),
    insertMany: async (list) => list.map(put),
    updateOne: async (q, u, opts = {}) => {
      const doc = docs.find((d) => matches(d, q));
      if (doc) return update(doc, u);
      if (!opts.upsert) return;
      const fresh = Object.fromEntries(Object.entries(q).filter(([, v]) => !isOp(v)));
      applyUpdate(fresh, u);
      put(fresh);
    },
    updateMany: async (q, u) => docs.filter((d) => matches(d, q)).forEach((d) => update(d, u)),
    deleteOne: async (q) => {
      const doc = docs.find((d) => matches(d, q));
      if (doc) keepOnly((d) => d !== doc);
    },
    deleteMany: async (q) => keepOnly((d) => !matches(d, q)),
    // In order, stopping at the first error (as an ordered bulk write does).
    bulkWrite: async (ops) => {
      for (const op of ops) {
        if (op.updateOne) await model.updateOne(op.updateOne.filter, op.updateOne.update);
        else await model.deleteOne(op.deleteOne.filter);
      }
    },
  });
  return { docs, put, clear: () => keepOnly(() => false) };
}
// The app's change log and settings (models.js registers them in the app).
const History = mongoose.model('History', new mongoose.Schema({}, { strict: false }));
const Setting = mongoose.model('Setting', new mongoose.Schema({ key: String, value: mongoose.Schema.Types.Mixed }));
const db = {
  campaigns: fakeModel(WwCampaign), rows: fakeModel(WwRow), stats: fakeModel(WwStat, (d) => `${d.rowId}|${d.date}`),
  history: fakeModel(History), settings: fakeModel(Setting, (d) => d.key), locks: fakeModel(mongoose.model('WwLock')),
};
const clearDb = () => Object.values(db).forEach((m) => m.clear());

// Each route's handlers, middleware first; adminOnly turns away anyone but the admin as the app's does.
const handlers = {};
const pass = (req, res, next) => next();
const adminOnly = (req, res, next) => (req.session.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' }));
registerWhenWhere(Object.fromEntries(['get', 'patch', 'post', 'delete'].map((m) => [m, (path, ...fns) => { handlers[`${m} ${path}`] = fns; }])),
  { auth: pass, adminOnly, validRange: (from, to) => isISO(from) && isISO(to) && from <= to });
// Calls a route as the admin (or another role): { status, body }.
async function call(method, path, body, role = 'admin') {
  const out = { status: 200 };
  const res = { status(n) { out.status = n; return res; }, json(b) { out.body = b; return res; } };
  const req = { body, query: {}, params: {}, session: { user: role, role } };
  for (const fn of handlers[`${method} ${path}`]) {
    let go = false;
    let error;
    await fn(req, res, (e) => { error = e; go = !e; });
    if (error) throw error;
    if (!go) break;
  }
  return out;
}
// An empty database with one Video campaign; row() and stat() add to it.
function setup() {
  clearDb();
  const video = db.campaigns.put({ name: 'V', type: 'Video', status: 'paused', order: 0 });
  const row = (fields) => db.rows.put({ campaignId: video._id, campaignLabel: '', extras: {}, added: false, order: db.rows.docs.length, ...fields });
  const stat = (r, date, impressions) => db.stats.put({ rowId: r._id, tab: r.tab, date, impressions, interactions: 1, clicks: 0, views: 1, cost: 100, conversions: 0 });
  return { row, stat };
}
const docsOf = (r) => db.stats.docs.filter((d) => same(d.rowId, r._id));

test('a Day of the week segment edit changes only that weekday’s days', async () => {
  const { row, stat } = setup();
  const phones = row({ tab: 'devices', device: 'Mobile phones', level: 'Campaign' });
  // Monday, Tuesday, Monday.
  stat(phones, '2026-04-06', 100);
  stat(phones, '2026-04-07', 100);
  stat(phones, '2026-04-13', 300);
  const edit = (body, r = phones) => call('patch', '/api/ww/metric', { rowIds: [String(r._id)], from: '2026-04-06', to: '2026-04-13', ...body });
  const field = (r, m) => Object.fromEntries(docsOf(r).map((d) => [d.date, d[m]]));
  assert.deepEqual(await edit({ metric: 'impressions', value: '600', dow: 1 }), { status: 200, body: { ok: true } });
  assert.deepEqual(field(phones, 'impressions'), { '2026-04-06': 150, '2026-04-07': 100, '2026-04-13': 450 });
  // A formula column works from that weekday's figures: Avg. CPM $10 of 600 impressions is $6.00.
  await edit({ metric: 'avgCpm', value: '10', dow: 1 });
  assert.deepEqual(field(phones, 'cost'), { '2026-04-06': 300, '2026-04-07': 100, '2026-04-13': 300 });
  assert.equal(db.history.docs.at(-1).after, '$10.00 (Cost $6.00, 2026-04-06 – 2026-04-13, Mondays)');
  // Without one, the whole range as before.
  await edit({ metric: 'impressions', value: '1000' });
  assert.equal(Object.values(field(phones, 'impressions')).reduce((a, b) => a + b), 1000);
  // A row without figures gets new days on that weekday only.
  const tablets = row({ tab: 'devices', device: 'Tablets', level: 'Campaign' });
  await edit({ metric: 'clicks', value: '4', dow: 2, to: '2026-04-19' }, tablets);
  assert.deepEqual(field(tablets, 'clicks'), { '2026-04-07': 2, '2026-04-14': 2 });
  // A Tuesday row has no Monday to put a figure on.
  const tuesday = row({ tab: 'when', dow: 2, hour: 9 });
  assert.deepEqual(await edit({ metric: 'impressions', value: '5', dow: 1 }, tuesday),
    { status: 400, body: { error: 'There are no days for this figure in the date range' } });
  assert.deepEqual(docsOf(tuesday), []);
  for (const dow of [7, -1, 1.5, '1']) {
    assert.deepEqual(await edit({ metric: 'impressions', value: '1', dow }), { status: 400, body: { error: 'Bad day of the week' } }, String(dow));
  }
  // Typed-in columns are kept per row, not per day.
  assert.deepEqual(await edit({ metric: 'engagements', value: '5', dow: 1 }), { status: 400, body: { error: 'This column can’t be set for one day of the week' } });
});

test('typed-in column edits: rates and averages on every row, counts split; only real columns', async () => {
  const { row } = setup();
  const ids = [row({ tab: 'devices', device: 'Computers', extras: { engagements: 100 } }), row({ tab: 'devices', device: 'Tablets', extras: { engagements: 300 } })]
    .map((r) => String(r._id));
  const edit = (metric, value) => call('patch', '/api/ww/metric', { rowIds: ids, metric, value });
  const extras = () => db.rows.docs.map((r) => r.extras);
  await edit('avgCpe', '0.50');
  await edit('engagements', '800');
  assert.deepEqual(extras(), [{ engagements: 200, avgCpe: 50 }, { engagements: 600, avgCpe: 50 }]);
  const total = deriveWw(sumWw(db.rows.docs));
  assert.deepEqual([fmtWw('avgCpe', total.avgCpe), fmtWw('engagements', total.engagements)], ['$0.50', '800']);
  await edit('engagementRate', '12.5');
  assert.deepEqual(extras().map((x) => x.engagementRate), [0.125, 0.125]);
  await edit('engagementRate', '');
  assert.deepEqual(extras().map((x) => x.engagementRate), [undefined, undefined]);
  const last = db.history.docs.at(-1);
  assert.deepEqual([last.column, last.before, last.after], ['Engagement rate', '12.50%', '–']);
  // Names every object has: refused before anything is written or logged.
  const logged = db.history.docs.length;
  for (const metric of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.deepEqual(await edit(metric, ''), { status: 400, body: { error: 'This column can’t be edited' } }, metric);
  }
  assert.equal(db.history.docs.length, logged);
});

test('Duplicate: copies start without figures, typed-in ones included', async () => {
  const { row, stat } = setup();
  const phones = row({ tab: 'devices', device: 'Mobile phones', level: 'Campaign', extras: { engagements: 500 } });
  stat(phones, '2026-04-06', 100);
  const { body } = await call('post', '/api/ww/rows/duplicate', { ids: [String(phones._id)] });
  const copied = db.rows.docs.find((r) => same(r._id, body.ids[0]));
  assert.deepEqual([copied.device, copied.added, copied.extras, copied.order], ['Mobile phones', true, {}, 1]);
  assert.deepEqual(db.rows.docs.find((r) => same(r._id, phones._id)).extras, { engagements: 500 });
  assert.deepEqual(docsOf(copied), []);
  assert.equal(sumWw(db.rows.docs).extras.engagements, 500);
});

test('changing a When row’s day keeps its figures where a range can show them', async () => {
  const { row, stat } = setup();
  const today = todayISO();
  const friday = row({ tab: 'when', dow: 5, hour: 9 });
  // Fridays: the data start, the week after, one in June 2025, and the last two up to today.
  const lastFri = addDays(today, -((parseISO(today).getDay() + 2) % 7));
  ['2025-03-21', '2025-03-28', '2025-06-06', addDays(lastFri, -7), lastFri].forEach((d, i) => stat(friday, d, 10 + i));
  const setDay = (value) => call('patch', '/api/ww/rows', { ids: [String(friday._id)], field: 'dow', value });
  const impressions = () => docsOf(friday).reduce((a, d) => a + d.impressions, 0);
  assert.deepEqual(await setDay(2), { status: 200, body: { changed: 1 } });
  // Tuesday 2025-03-18 is before the data start: that day joins the next week's.
  assert.deepEqual(docsOf(friday).map((d) => d.date).sort(), ['2025-03-25', '2025-06-03', addDays(lastFri, -10), addDays(lastFri, -3)]);
  assert.equal(impressions(), 60);
  for (const dow of [6, 0, 1, 3, 4, 5]) {
    await setDay(dow);
    const docs = docsOf(friday);
    assert.ok(docs.every((d) => parseISO(d.date).getDay() === dow && d.date >= WW_DATA_START && d.date <= today), JSON.stringify(docs));
    assert.equal(impressions(), 60);
  }
  assert.equal(db.rows.docs[0].dow, 5);
});

test('start-up: two at once fill the section once; a claim left behind is taken over', async () => {
  clearDb();
  const filled = () => [db.campaigns.docs.length, db.rows.docs.length, db.stats.docs.length];
  await Promise.all([ensureWhenWhere(TODAY), ensureWhenWhere(TODAY)]);
  assert.deepEqual(filled(), [10, seed.rows.length, seed.stats.length]);
  assert.deepEqual(db.settings.docs.map((s) => [s.key, s.value]), [['wwSeedVersion', WW_SEED_VERSION]]);
  assert.deepEqual(db.locks.docs, []);
  // Another start-up is filling it: this one leaves it to that one.
  clearDb();
  db.locks.put({ _id: 'seed', at: Date.now() - 60e3 });
  await ensureWhenWhere(TODAY);
  assert.deepEqual(filled(), [0, 0, 0]);
  // A claim left by a start-up that stopped half-way, over 10 minutes ago, is taken over.
  db.locks.docs[0].at = Date.now() - 11 * 60e3;
  await ensureWhenWhere(TODAY);
  assert.deepEqual(filled(), [10, seed.rows.length, seed.stats.length]);
  assert.deepEqual(db.locks.docs, []);
});

// ---------------------------------------------------------------- adding rows, campaigns
const pick = (doc, keys) => Object.fromEntries(keys.map((k) => [k, doc[k]]));
const counts = () => [db.campaigns.docs.length, db.rows.docs.length, db.stats.docs.length, db.history.docs.length];

test('adding a row: each tab, with and without its fields, last in its tab and without figures', async () => {
  const { row, stat } = setup();
  const video = db.campaigns.docs[0];
  const search = db.campaigns.put({ name: 'S', type: 'Search', status: 'enabled', order: 1 });
  const phones = row({ tab: 'devices', device: 'Mobile phones', level: 'Campaign', order: 4 });
  row({ tab: 'when', dow: 2, hour: 9, order: 7 });
  stat(phones, '2026-04-06', 100);
  const add = (body, campaign = video) => call('post', '/api/ww/rows', { campaignId: String(campaign._id), ...body });
  // The new row, checked to come back as { id } only.
  const addOk = async (body, campaign) => {
    const out = await add(body, campaign);
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.deepEqual(Object.keys(out.body), ['id']);
    const doc = db.rows.docs.find((r) => same(r._id, out.body.id));
    assert.ok(same(doc.campaignId, (campaign || video)._id));
    return doc;
  };
  const NEW = { campaignLabel: '', extras: {}, added: true };
  const of = (doc, keys) => pick(doc, ['tab', 'order', ...Object.keys(NEW), ...keys]);

  // Devices: defaults, then every field given.
  assert.deepEqual(of(await addOk({ tab: 'devices' }), ['device', 'level', 'bidAdj', 'adGroupBidAdj']),
    { tab: 'devices', order: 5, ...NEW, device: 'Computers', level: 'Campaign', bidAdj: null, adGroupBidAdj: null });
  assert.deepEqual(of(await addOk({ tab: 'devices', device: 'Tablets', level: 'Ad group', bidAdj: '+20', adGroupBidAdj: '-50%' }, search),
    ['device', 'level', 'bidAdj', 'adGroupBidAdj']), { tab: 'devices', order: 6, ...NEW, device: 'Tablets', level: 'Ad group', bidAdj: 20, adGroupBidAdj: -50 });
  // When: Monday 9 AM by default; a day and hour as numbers or as shown.
  assert.deepEqual(of(await addOk({ tab: 'when' }), ['dow', 'hour']), { tab: 'when', order: 8, ...NEW, dow: 1, hour: 9 });
  assert.deepEqual(of(await addOk({ tab: 'when', dow: 'Saturday', hour: '4 PM – 5 PM' }), ['dow', 'hour']), { tab: 'when', order: 9, ...NEW, dow: 6, hour: 16 });
  assert.deepEqual(pick(await addOk({ tab: 'when', dow: 0, hour: 23 }), ['dow', 'hour']), { dow: 0, hour: 23 });
  // Where: the placement is needed; the first of a tab's rows is order 0.
  assert.deepEqual(of(await addOk({ tab: 'where', placement: '  5s   Crafts ' }), ['placement', 'placementType', 'adGroup']),
    { tab: 'where', order: 0, ...NEW, placement: '5s Crafts', placementType: 'YouTube channel', adGroup: '' });
  assert.deepEqual(of(await addOk({ tab: 'where', placement: 'news.example.com', placementType: 'Website', adGroup: 'Ad group 1' }), ['placement', 'placementType', 'adGroup']),
    { tab: 'where', order: 1, ...NEW, placement: 'news.example.com', placementType: 'Website', adGroup: 'Ad group 1' });
  // Locations: the location is needed. Other tabs' fields and the row's own settings are ignored.
  const nepal = await addOk({ tab: 'locations', location: 'Nepal', device: 'Phones', dow: 9, order: 99, added: false, extras: { engagements: 5 }, campaignLabel: 'Mine' });
  assert.deepEqual(nepal, { ...pick(nepal, ['_id', 'campaignId']), tab: 'locations', order: 0, ...NEW, location: 'Nepal' });
  // No figures: they show once the admin types them in.
  assert.deepEqual(db.stats.docs.map((d) => d.rowId), [phones._id]);
  assert.deepEqual(pick(db.history.docs.at(-1), ['level', 'entityName', 'column', 'before', 'after']),
    { level: 'When and where', entityName: 'Nepal (V)', column: 'Row added', before: '', after: 'Matched locations' });
  assert.deepEqual(buildReport({ campaigns: db.campaigns.docs, rows: [nepal], stats: [], from: '2026-04-01', to: '2026-04-07' }).rows
    .map((r) => [r.location, r.added, r.has, r.impressions]), [['Nepal', true, false, 0]]);
});

test('adding a row: a bad tab, campaign or field is refused, and only the admin may add', async () => {
  const { row } = setup();
  const video = db.campaigns.docs[0];
  const other = row({ tab: 'devices', device: 'Computers', level: 'Campaign' });
  const before = counts();
  const add = (body, role) => call('post', '/api/ww/rows', { tab: 'devices', campaignId: String(video._id), ...body }, role);
  const refused = async (body, error) => assert.deepEqual(await add(body), { status: 400, body: error }, JSON.stringify(body));
  for (const tab of [undefined, '', 'ads', 'Devices', '__proto__', 'constructor', ['devices']]) await refused({ tab }, { error: 'Bad tab' });
  const pickOne = { error: 'Pick a campaign', field: 'campaignId' };
  for (const campaignId of [undefined, '', 'nope', 42, String(new mongoose.Types.ObjectId()), String(other._id), [String(video._id)]]) {
    await refused({ campaignId }, pickOne);
  }
  await refused({ device: 'Phones' }, { error: 'Pick a device', field: 'device' });
  await refused({ level: 'Keyword' }, { error: 'Pick a level', field: 'level' });
  await refused({ bidAdj: '-101' }, { error: 'Enter a percentage from -100 to 900', field: 'bidAdj' });
  await refused({ adGroupBidAdj: 'lots' }, { error: 'Enter a percentage from -100 to 900', field: 'adGroupBidAdj' });
  await refused({ tab: 'when', dow: 7 }, { error: 'Pick a day', field: 'dow' });
  await refused({ tab: 'when', hour: '24' }, { error: 'Pick an hour', field: 'hour' });
  await refused({ tab: 'where' }, { error: 'Enter some text', field: 'placement' });
  await refused({ tab: 'where', placement: '   ' }, { error: 'Enter some text', field: 'placement' });
  await refused({ tab: 'where', placement: 'x', placementType: 5 }, { error: 'Enter some text', field: 'placementType' });
  await refused({ tab: 'locations', location: '' }, { error: 'Enter some text', field: 'location' });
  assert.deepEqual(await add({}, 'viewer'), { status: 403, body: { error: 'Admin only' } });
  // Nothing written or logged.
  assert.deepEqual(counts(), before);
});

test('moving rows to another campaign: their figures go with them, the campaign’s name shows', async () => {
  const { row, stat } = setup();
  const video = db.campaigns.docs[0];
  const search = db.campaigns.put({ name: 'S', type: 'Search', status: 'enabled', order: 1 });
  const a = row({ tab: 'devices', device: 'Computers', level: 'Campaign', campaignLabel: 'Old label' });
  const b = row({ tab: 'devices', device: 'Tablets', level: 'Campaign' });
  const c = row({ tab: 'devices', device: 'TV screens', level: 'Campaign' });
  stat(a, '2026-04-06', 100);
  const move = (ids, value, role) => call('patch', '/api/ww/rows', { ids: ids.map((r) => String(r._id)), field: 'campaignId', value }, role);
  const now = (r) => db.rows.docs.find((x) => same(x._id, r._id));
  assert.deepEqual(await move([a, b], String(search._id)), { status: 200, body: { changed: 2 } });
  assert.ok([a, b].every((r) => same(now(r).campaignId, search._id) && now(r).campaignLabel === ''));
  assert.ok(same(now(c).campaignId, video._id));
  assert.deepEqual(docsOf(a).map((d) => d.impressions), [100]);
  assert.deepEqual(pick(db.history.docs.at(-1), ['level', 'entityName', 'column', 'before', 'after']),
    { level: 'When and where', entityName: 'Devices: 2 rows', column: 'Campaign', before: 'V', after: 'S' });
  // Already there: nothing changes or is logged.
  const logged = db.history.docs.length;
  assert.deepEqual(await move([a, b], String(search._id)), { status: 200, body: { changed: 0 } });
  assert.equal(db.history.docs.length, logged);
  // Some there already: only the others move.
  assert.deepEqual(await move([a, c], String(video._id)), { status: 200, body: { changed: 1 } });
  assert.ok(same(now(a).campaignId, video._id));
  // A campaign that isn't there, or a viewer: refused, nothing moves.
  for (const value of [undefined, 'nope', String(new mongoose.Types.ObjectId()), String(b._id)]) {
    assert.deepEqual(await move([b], value), { status: 400, body: { error: 'Pick a campaign', field: 'campaignId' } }, String(value));
  }
  assert.deepEqual(await move([b], String(video._id), 'viewer'), { status: 403, body: { error: 'Admin only' } });
  assert.ok(same(now(b).campaignId, search._id));
});

test('adding and deleting campaigns: rows and their figures go with them', async () => {
  const { row, stat } = setup();
  const video = db.campaigns.docs[0];
  const add = (body, role) => call('post', '/api/ww/campaigns', body, role);
  const camp = (id) => pick(db.campaigns.docs.find((c) => same(c._id, id)), ['name', 'type', 'status', 'order']);
  // Without a name: the first free "Campaign #n"; Search, enabled, last.
  const first = (await add({})).body.id;
  assert.deepEqual(camp(first), { name: 'Campaign #1', type: 'Search', status: 'enabled', order: 1 });
  assert.deepEqual(camp((await add({ name: '  ', type: '', status: null })).body.id), { name: 'Campaign #2', type: 'Search', status: 'enabled', order: 2 });
  const brand = (await add({ name: '  Brand   push ', type: 'Video', status: 'paused' })).body.id;
  assert.deepEqual(camp(brand), { name: 'Brand push', type: 'Video', status: 'paused', order: 3 });
  assert.equal(camp((await add({ name: 'x'.repeat(150), type: 'Demand Gen', status: 'removed' })).body.id).name.length, 100);
  assert.deepEqual(pick(db.history.docs.at(-1), ['level', 'column', 'before', 'after']), { level: 'When and where', column: 'Campaign added', before: '', after: 'Demand Gen' });
  let before = counts();
  assert.deepEqual(await add({ type: 'TV' }), { status: 400, body: { error: 'Pick a campaign type', field: 'type' } });
  assert.deepEqual(await add({ status: 'live' }), { status: 400, body: { error: 'Pick enabled, paused or removed', field: 'status' } });
  assert.deepEqual(await add({ name: 5 }), { status: 400, body: { error: 'Enter a campaign name', field: 'name' } });
  assert.deepEqual(await add({ name: 'Mine' }, 'viewer'), { status: 403, body: { error: 'Admin only' } });
  assert.deepEqual(counts(), before);

  // Rows of two campaigns, with figures.
  const mine = [row({ tab: 'devices', device: 'Computers' }), row({ tab: 'when', dow: 1, hour: 9 }), row({ tab: 'where', placement: 'p' })];
  const theirs = row({ tab: 'locations', location: 'India', campaignId: db.campaigns.docs.find((c) => same(c._id, brand))._id });
  for (const r of [...mine, theirs]) stat(r, '2026-04-06', 10);
  stat(mine[0], '2026-04-07', 10);
  const del = (ids, role) => call('delete', '/api/ww/campaigns', { ids }, role);
  // A viewer, or a bad list: refused, nothing deleted.
  before = counts();
  assert.deepEqual(await del([String(video._id)], 'viewer'), { status: 403, body: { error: 'Admin only' } });
  const ids101 = Array.from({ length: 101 }, () => String(new mongoose.Types.ObjectId()));
  for (const ids of [undefined, [], 'x', ['nope'], [String(video._id), 7], ids101]) {
    assert.deepEqual(await del(ids), { status: 400, body: { error: 'Pick the campaigns to delete' } }, String(ids?.length));
  }
  assert.deepEqual(await del([String(new mongoose.Types.ObjectId())]), { status: 404, body: { error: 'Campaign not found' } });
  assert.deepEqual(counts(), before);
  // The campaign, its rows of every tab and their daily figures; the other campaigns' stay.
  assert.deepEqual(await del([String(video._id), String(video._id), String(new mongoose.Types.ObjectId())]), { status: 200, body: { deleted: 1, rows: 3 } });
  assert.ok(!db.campaigns.docs.some((c) => same(c._id, video._id)));
  assert.deepEqual(db.rows.docs.map((r) => r._id), [theirs._id]);
  assert.deepEqual(db.stats.docs.map((d) => d.rowId), [theirs._id]);
  assert.deepEqual(pick(db.history.docs.at(-1), ['level', 'entityName', 'column', 'before', 'after', 'detail']),
    { level: 'When and where', entityName: 'V', column: 'Campaign deleted', before: 'Video', after: '(deleted)', detail: 'With 3 rows' });
  // Several at once, one without rows.
  assert.deepEqual(await del([first, brand]), { status: 200, body: { deleted: 2, rows: 1 } });
  assert.deepEqual([db.rows.docs.length, db.stats.docs.length], [0, 0]);
  assert.deepEqual(db.history.docs.slice(-2).map((h) => [h.entityName, h.detail]).sort(), [['Brand push', 'With 1 row'], ['Campaign #1', 'With 0 rows']]);
  // Rows can't be added to a deleted campaign; a new campaign still goes last.
  assert.deepEqual(await call('post', '/api/ww/rows', { tab: 'locations', campaignId: brand, location: 'India' }),
    { status: 400, body: { error: 'Pick a campaign', field: 'campaignId' } });
  assert.equal(camp((await add({ name: 'Next' })).body.id).order, 5);
});

test('every campaign deleted: start-up leaves the section empty; the test reset fills it again', async () => {
  clearDb();
  const filled = () => [db.campaigns.docs.length, db.rows.docs.length, db.stats.docs.length];
  await ensureWhenWhere(TODAY);
  const ids = db.campaigns.docs.map((c) => String(c._id));
  assert.deepEqual(await call('delete', '/api/ww/campaigns', { ids }), { status: 200, body: { deleted: 10, rows: seed.rows.length } });
  assert.deepEqual(filled(), [0, 0, 0]);
  await ensureWhenWhere(TODAY);
  assert.deepEqual(filled(), [0, 0, 0]);
  await resetWhenWhere(TODAY);
  assert.deepEqual(filled(), [10, seed.rows.length, seed.stats.length]);
  assert.deepEqual(db.settings.docs.map((s) => [s.key, s.value]), [['wwSeedVersion', WW_SEED_VERSION]]);
});
