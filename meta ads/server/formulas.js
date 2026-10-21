// Single source of truth for every derived Meta Ads metric.
const n = (v) => (Number.isFinite(+v) ? +v : 0);
const fin = (v) => (Number.isFinite(v) ? v : 0);

export function derive(s) {
  const spend = n(s.spend), impressions = n(s.impressions), reach = n(s.reach), linkClicks = n(s.linkClicks);
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

// Fill in whichever inputs are missing from the ones supplied:
//   impressions = spend / cpm * 1000      spend = impressions * cpm / 1000
//   reach       = impressions * reachRate linkClicks = impressions * ctr% | spend / cpc
export function resolveStat(i) {
  let { spend, impressions, reach, linkClicks } = i;
  const has = (v) => v !== undefined && v !== null && v !== '';
  if (!has(impressions) && has(spend) && +i.cpm > 0) impressions = Math.round((+spend / +i.cpm) * 1000);
  if (!has(spend) && has(impressions) && has(i.cpm)) spend = (+impressions * +i.cpm) / 1000;
  if (!has(reach) && has(impressions)) reach = Math.round(+impressions * (has(i.reachRate) ? +i.reachRate : 0.92));
  if (!has(linkClicks)) {
    if (has(i.ctr)) linkClicks = Math.round((+impressions * +i.ctr) / 100);
    else if (has(spend) && +i.cpc > 0) linkClicks = Math.round(+spend / +i.cpc);
  }
  const r = {
    spend: fin(Math.max(0, Math.round(n(spend) * 100) / 100)),
    impressions: Math.max(0, Math.round(n(impressions))),
    reach: Math.max(0, Math.round(n(reach))),
    linkClicks: Math.max(0, Math.round(n(linkClicks))),
  };
  if (r.reach > r.impressions) r.reach = r.impressions; // reach can never exceed impressions
  if (r.linkClicks > r.impressions) r.linkClicks = r.impressions; // neither can clicks (CTR <= 100%)
  return r;
}

// ---- date helpers (YYYY-MM-DD strings, calendar math in UTC so no TZ drift) ----
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toUTC = (d) => new Date(d + 'T00:00:00Z');
const iso = (dt) => dt.toISOString().slice(0, 10);
// Real calendar date in YYYY-MM-DD form (rejects 2025-13-01 and 2025-02-30).
export const isRealDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(toUTC(d).getTime()) && iso(toUTC(d)) === d;
export const MAX_RANGE_DAYS = 731;
export const addDays = (d, k) => { const dt = toUTC(d); dt.setUTCDate(dt.getUTCDate() + k); return iso(dt); };
export function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 1000; d = addDays(d, 1)) out.push(d);
  return out;
}
const fmt = (d) => { const dt = toUTC(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };
const daysDiff = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
export function period(d, kind, from, to) {
  const span = (start, end) => ({ key: start, label: `${fmt(from && start < from ? from : start)} – ${fmt(to && end > to ? to : end)}` }); // never show days outside the chosen range
  if (kind === 'day') return { key: d, label: fmt(d) };
  if (kind === '2weeks') { // 14-day blocks counted from the start of the selected range
    const start = addDays(from || d, Math.floor(daysDiff(from || d, d) / 14) * 14);
    return span(start, addDays(start, 13));
  }
  if (kind === 'week') {
    const start = addDays(d, -toUTC(d).getUTCDay());
    return span(start, addDays(start, 6));
  }
  const dt = toUTC(d);
  return { key: d.slice(0, 7), label: `${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` };
}
export { fmt as fmtDate };
