// Ask Advisor answers, computed from the account's own report data (no external AI).
import { formatValue, withDerived, sumRows, DASH } from '../../../shared/metrics.js';
import { campaignStatusLabel, formatScore } from '../../../shared/entities.js';
import { adStrength, normalizeCreative, normText } from '../../../shared/creative.js';

const f = formatValue;

// Per-campaign totals for the period from the report rows (ads: the campaign's report rows).
export function campaignStats(report) {
  const byId = new Map(report.campaigns.map((c) => [c.id, { ...c, rows: [] }]));
  for (const r of report.rows) byId.get(r.campaignId)?.rows.push(r);
  return [...byId.values()].map((c) => ({
    id: c.id, name: c.name, type: c.type, status: c.status,
    statusLabel: c.statusLabel || '', statusReasons: c.statusReasons || [], budget: c.budget ?? null,
    optimizationScore: c.optimizationScore ?? null, ads: c.rows,
    eligible: c.rows.some((r) => r.eligibility === 'Eligible'),
    ...withDerived(sumRows(c.rows)),
  }));
}

const running = (c) => c.status === 'enabled' && c.eligible;
// Rounded share; only all of it reads 100% and only none of it 0%.
const share = (part, whole) => {
  const p = part >= whole ? 100 : part <= 0 ? 0 : Math.min(99, Math.max(1, Math.round((part / whole) * 100)));
  return `${p}%`;
};
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
// Why an ad isn't showing, without the "+1"-style overflow markers kept for the table.
const reasonsOf = (r) => (r.reasons || []).filter((x) => !/^\+\d+$/.test(x));
const tidy = (h) => String(h).replace(/\u2026$/, '').trim();
const quoted = (arr) => arr.map((x) => `\u201c${x}\u201d`);
const uniq = (arr) => [...new Set(arr)];

// Lower case, curly apostrophes made straight and runs of spaces collapsed, for matching.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const wordChar = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);
// True when `name` appears in `text` on its own, not as part of a longer word or name.
function mentions(text, name) {
  if (!name) return false;
  for (let i = text.indexOf(name); i !== -1; i = text.indexOf(name, i + 1)) {
    if (!wordChar(text[i - 1]) && !wordChar(text[i + name.length])) return true;
  }
  return false;
}
// "above", "below" or "in line with" a reference figure (within 10% counts as in line).
function versus(v, ref) {
  if (v == null || ref == null || !(ref > 0)) return null;
  const d = (v - ref) / ref;
  if (Math.abs(d) < 0.1) return 'in line with';
  return d > 0 ? 'above' : 'below';
}

function pctChange(cur, prev) {
  if (cur == null || prev == null) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return (cur - prev) / prev;
}
export function changeText(metric, cur, prev) {
  if (cur == null) return 'No data';
  const p = pctChange(cur, prev);
  if (p == null) return prev == null ? 'No earlier data' : `Up from ${f(metric, prev)}`;
  if (p === 0) return 'No change from the previous 30 days';
  return `${p > 0 ? 'Up' : 'Down'} ${Math.abs(p * 100).toFixed(1)}% from ${f(metric, prev)}`;
}
// Short form for the snapshot card ("+3.2%", "−1.0%", "No change"); null when there's nothing to compare.
export function changeShort(cur, prev) {
  const p = pctChange(cur, prev);
  if (p == null) return null;
  if (p === 0) return { text: 'No change', dir: 0 };
  return { text: `${p > 0 ? '+' : '−'}${Math.abs(p * 100).toFixed(1)}%`, dir: p > 0 ? 1 : -1 };
}

const list = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);

// Welcome text and the "Last 30 days" snapshot (clicks, impressions, cost).
export function overview(report) {
  const camps = campaignStats(report);
  const cur = withDerived(report.totals.account);
  const prev = withDerived(report.totals.previous);
  const live = camps.filter(running);
  const ads = report.rows;
  const liveAds = ads.filter((r) => r.eligibility === 'Eligible');
  const parts = [];
  if (!camps.length) parts.push('This account has no campaigns yet.');
  else if (!live.length) parts.push(`None of your ${camps.length} campaigns are running, so your ads aren't showing right now.`);
  else parts.push(`${live.length} of your ${camps.length} campaigns ${live.length === 1 ? 'is' : 'are'} running (${list(live.map((c) => c.name))}), with ${liveAds.length} of ${ads.length} ads eligible to show.`);
  if ((cur.impressions ?? 0) > 0) {
    parts.push(`In the last 30 days your ads were shown ${f('impressions', cur.impressions)} times and got ${f('clicks', cur.clicks)} clicks `
      + `(${f('ctr', cur.ctr)} CTR) for ${f('cost', cur.cost)}`
      + ((cur.conversions ?? 0) > 0 ? `, with ${f('conversions', cur.conversions)} conversions.` : '.'));
    const p = pctChange(cur.clicks, prev.clicks);
    if (p === 0) parts.push('Clicks are level with the 30 days before.');
    else if (p != null) parts.push(`Clicks are ${p > 0 ? 'up' : 'down'} ${Math.abs(p * 100).toFixed(1)}% on the 30 days before.`);
  } else if (camps.length) {
    parts.push('Your ads had no impressions in the last 30 days.');
  }
  return {
    intro: parts.join(' '),
    snapshot: [['clicks', 'Clicks'], ['impressions', 'Impressions'], ['cost', 'Cost']].map(([key, label]) => ({
      key, label, value: f(key, cur[key]), change: changeShort(cur[key], prev[key]), note: changeText(key, cur[key], prev[key]),
    })),
  };
}

// Insight cards for the welcome message, each worked out from the report. Every card has a
// stable id (used to remember the reader's thumbs up / down), and up to two follow-up
// questions that answer() knows; a question is only offered once across the cards.
export function insights(report) {
  const camps = campaignStats(report);
  const cur = withDerived(report.totals.account);
  const ads = report.rows;
  const out = [];

  const off = ads.filter((r) => r.eligibility !== 'Eligible');
  if (ads.length && off.length) {
    const none = off.length === ads.length;
    const counts = new Map();
    for (const r of off) for (const x of reasonsOf(r)) counts.set(x, (counts.get(x) || 0) + 1);
    const n = Math.max(0, ...counts.values());
    const top = [...counts].filter(([, k]) => k === n).map(([x]) => `“${x}”`);
    out.push({
      id: none ? 'ads-off:all' : `ads-off:${off.length}/${ads.length}`, icon: 'pause_circle', tone: none ? 'err' : 'warn',
      title: none ? 'None of your ads are running' : `${off.length} of your ${ads.length} ads aren't running`,
      text: (none
        ? `All ${plural(ads.length, 'ad')} are paused or not eligible to show, so they can't get impressions or clicks.`
        : `Only ${plural(ads.length - off.length, 'ad is', 'ads are')} eligible to show.`)
        + (n > 1 ? ` The most common ${top.length > 1 ? `reasons given are ${list(top)} (${n} ads each)` : `reason given is ${top[0]} (${n} ads)`}.` : ''),
      follow: ["Which ads aren't running?", 'Which campaigns are paused?'],
    });
  }

  if (camps.length && !((cur.impressions ?? 0) > 0)) {
    out.push({
      id: 'no-impr', icon: 'info', tone: 'info', title: 'No impressions in the last 30 days',
      text: 'None of your ads were shown in the last 30 days, so there are no results to look at yet.',
      follow: ['Which campaigns are paused?'],
    });
  }

  if ((cur.clicks ?? 0) > 0 && !((cur.conversions ?? 0) > 0)) {
    out.push({
      id: 'no-conv', icon: 'error', tone: 'warn', title: 'No conversions recorded',
      text: `Your ads got ${f('clicks', cur.clicks)} clicks in the last 30 days, but no conversions were recorded. `
        + 'If you expect sales, sign-ups or calls from your ads, conversion tracking may not be set up.',
      help: 'conversion-tracking',
      follow: ['Which campaigns have clicks but no conversions?'],
    });
  } else {
    const dry = camps.filter((c) => (c.clicks ?? 0) > 0 && !((c.conversions ?? 0) > 0)).sort((a, b) => b.clicks - a.clicks);
    if (dry.length) {
      out.push({
        id: `clicks-no-conv:${dry.map((c) => c.id).join(',')}`, icon: 'lightbulb', tone: 'tip', title: 'Clicks without conversions',
        text: dry.length === 1
          ? `${dry[0].name} got ${f('clicks', dry[0].clicks)} clicks for ${f('cost', dry[0].cost)} in the last 30 days and recorded no conversions.`
          : `${dry.length} campaigns got clicks but recorded no conversions in the last 30 days, led by ${dry[0].name} with ${f('clicks', dry[0].clicks)} clicks.`,
        help: 'conversion-tracking',
        follow: ['Which campaigns have clicks but no conversions?'],
      });
    }
  }

  const withData = camps.filter((c) => (c.impressions ?? 0) > 0 && c.ctr != null);
  if (withData.length >= 2) {
    const low = [...withData].sort((a, b) => a.ctr - b.ctr)[0];
    if (low.ctr < cur.ctr) {
      const searchLive = ads.some((r) => r.format === 'search' && (r.impressions ?? 0) > 0);
      out.push({
        id: `low-ctr:${low.id}`, icon: 'show_chart', tone: 'info', title: 'Lowest clickthrough rate',
        text: `${low.name} had a ${f('ctr', low.ctr)} CTR from ${f('impressions', low.impressions)} impressions in the last 30 days, `
          + `against ${f('ctr', cur.ctr)} for the whole account.`,
        follow: ['Show CTR for every campaign', ...(searchLive ? ['Show my best headlines'] : [])],
      });
    }
  }

  const spenders = camps.filter((c) => (c.cost ?? 0) > 0).sort((a, b) => b.cost - a.cost);
  const spent = spenders.reduce((s, c) => s + c.cost, 0);
  // More than half: an even split (say two campaigns at 50% each) isn't "most" for either.
  if (spenders.length && spenders[0].cost / spent > 0.5) {
    const top = spenders[0];
    out.push({
      id: `spend:${top.id}`, icon: 'money', tone: 'info',
      title: spenders.length === 1 ? 'All of your spend went to one campaign' : 'Most of your spend goes to one campaign',
      text: spenders.length === 1
        ? `${top.name} accounted for all ${f('cost', spent)} spent in the last 30 days.`
        : `${top.name} took ${share(top.cost, spent)} of the ${f('cost', spent)} spent in the last 30 days (${f('cost', top.cost)}).`,
      follow: ['How is my spend split across campaigns?'],
    });
  }

  const conv = camps.filter((c) => (c.conversions ?? 0) > 0).sort((a, b) => b.conversions - a.conversions);
  if (conv.length) {
    const top = conv[0];
    out.push({
      id: `top-conv:${top.id}`, icon: 'trophy', tone: 'good', title: 'Your top campaign for conversions',
      text: (conv.length === 1
        ? `${top.name} brought in all ${f('conversions', top.conversions)} conversions in the last 30 days`
        : `${top.name} brought in ${f('conversions', top.conversions)} of your ${f('conversions', cur.conversions)} conversions in the last 30 days`)
        + `, at ${f('costPerConv', top.costPerConv)} per conversion.`,
      follow: ['What are my top performing campaigns?'],
    });
  }

  const offered = new Set();
  return out.slice(0, 5).map((it) => ({
    ...it,
    follow: it.follow.filter((q) => !offered.has(q) && offered.add(q)).slice(0, 2),
  }));
}

// ---------- One ad: "Analyze my ad <name> [in <campaign>[ › <ad group>]] and suggest improvements" ----------

// Words after "ad" that make it a question about ads in general ("check ad status"), not one ad.
const NOT_A_NAME = '(?!(?:groups?|status(?:es)?|strength|performance|spend|copy|text|assets?|headlines?|results?|ctr|clicks?)\\b)';
const AD_ASKS = [
  new RegExp('^(?:please\\s+)?(?:analy[sz]e|review|check|assess|evaluate|improve|optimi[sz]e)\\s+(?:my\\s+|the\\s+|this\\s+)?ad\\s+'
    + `${NOT_A_NAME}(.+?)(?:(?:\\s*,\\s*|\\s+and\\s+)(?:suggest|give|show|tell)\\b.*)?[\\s?.!]*$`, 'i'),
  new RegExp(`^how\\s+(?:is|was|did)\\s+(?:my\\s+|the\\s+)?ad\\s+${NOT_A_NAME}(.+?)\\s+(?:doing|performing|perform|do)\\b.*$`, 'i'),
];
// The ad a question asks about, as typed (null when it isn't a question about one ad).
function adSpec(question) {
  const q = String(question).replace(/\s+/g, ' ').trim();
  for (const re of AD_ASKS) {
    const m = re.exec(q);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}
const adKey = (s) => norm(s).replace(/["“”]/g, '').replace(/\s*(?:›|>)\s*/g, ' › ');
// Ads whose name (optionally with "in <campaign>" and " › <ad group>") is the one asked about,
// the most specific match first.
function findAds(spec, rows) {
  // A closing "?", "." or "!" belongs to the question, so it is left off both sides.
  const end = (x) => x.replace(/[\s?.!]+$/, '');
  const s = end(adKey(spec));
  let level = 0;
  let hits = [];
  for (const r of rows) {
    const n = adKey(r.name);
    const c = adKey(r.campaign);
    const forms = [[3, `${n} in ${c} › ${adKey(r.adGroup)}`], [2, `${n} in ${c}`], [1, n]];
    const m = forms.find(([, x]) => end(x) === s);
    if (!m) continue;
    if (m[0] > level) { level = m[0]; hits = [r]; } else if (m[0] === level) hits.push(r);
  }
  return hits;
}
// One ad out of the matches: the only one, else the one open on the page (asset details / edit).
const pickAd = (hits, viewingAdId) => (hits.length === 1 ? hits[0] : hits.find((r) => r.id === viewingAdId) || null);
// How a follow-up question names an ad so that it finds just that one.
function adRef(r, rows) {
  const same = rows.filter((x) => adKey(x.name) === adKey(r.name) && adKey(x.campaign) === adKey(r.campaign));
  return same.length > 1 ? `${r.name} in ${r.campaign} › ${r.adGroup}` : `${r.name} in ${r.campaign}`;
}
const analyzeAd = (r, rows) => `Analyze my ad ${adRef(r, rows)}`;

// The ad an "analyze my ad" question is about, when it is clear which one (null otherwise).
// opts.viewingAdId: the ad open on the page, which settles a name several ads share.
export function adToAnalyze(question, report, { viewingAdId } = {}) {
  const spec = adSpec(question);
  return spec == null ? null : pickAd(findAds(spec, report.rows), viewingAdId);
}

const FORMAT_NOUN = { search: 'search ad', display: 'display ad', video: 'video ad' };
const PARTS = { search: 'headlines', display: 'headlines and images', video: 'video and its text' };
const WEAK_STRENGTH = ['Incomplete', 'Poor', 'Average'];
const filledText = (l) => (l || []).map(normText).filter(Boolean);

// What the ad is made of, when the data says: display ads from their content (edit page),
// search ads from the headlines and description the table lists, video ads by their video.
function contentOf(r, creative) {
  if (r.format === 'display' && creative) {
    const c = normalizeCreative(creative);
    const text = [
      plural(filledText(c.headlines).length, 'headline'),
      normText(c.longHeadline) ? 'a long headline' : 'no long headline',
      plural(filledText(c.descriptions).length, 'description'),
      plural(c.images.length, 'image'), plural(c.logos.length, 'logo'), plural(c.videos.length, 'video'),
    ].join(' · ');
    const tips = adStrength(c).autoTips.filter((t) => !/everything it needs/i.test(t));
    return { text, tips };
  }
  if (r.format === 'search') {
    const heads = (r.headlines || []).map(tidy).filter(Boolean).length;
    return { text: `${plural(heads, 'headline')} listed · ${normText(r.description) ? 'a description' : 'no description'}`, tips: [] };
  }
  if (r.format === 'video' && r.videoTitle) return { text: `Video “${r.videoTitle}”`, tips: [] };
  return null;
}

function adReview(r, report, creative) {
  const d = withDerived(r);
  const cur = withDerived(report.totals.account);
  const noun = FORMAT_NOUN[r.format] || 'ad';
  const parts = PARTS[r.format] || 'content';
  const peerRows = report.rows.filter((x) => x.id !== r.id && x.format === r.format && (x.impressions ?? 0) > 0);
  const peers = peerRows.length ? withDerived(sumRows(peerRows)) : null;
  const ref = peers ? { name: `your other ${noun}s`, ...peers } : { name: 'the account', ...cur };
  const reasons = reasonsOf(r);
  const shown = (d.impressions ?? 0) > 0;
  const where = [r.campaign, r.adGroup].filter(Boolean).join(' › ');
  const content = contentOf(r, creative);
  const rows = [];
  const tips = [];
  let help;

  rows.push({ label: 'Status', value: r.eligibility === 'Eligible' ? 'Eligible' : [r.eligibility || 'Not eligible', reasons.join(', ')].filter(Boolean).join(': ') });
  if (!shown) rows.push({ label: 'Results', value: 'No impressions in the last 30 days' });
  else {
    rows.push({ label: 'Clicks', value: `${f('clicks', d.clicks)} from ${f('impressions', d.impressions)} impressions` });
    rows.push({ label: 'CTR', value: `${f('ctr', d.ctr)} · account ${f('ctr', cur.ctr)}${peers ? ` · other ${noun}s ${f('ctr', peers.ctr)}` : ''}` });
    rows.push({ label: 'Cost per click', value: (d.clicks ?? 0) > 0 ? `${f('avgCpc', d.avgCpc)} · account ${f('avgCpc', cur.avgCpc)}` : DASH });
    rows.push({ label: 'Cost', value: f('cost', d.cost) });
    rows.push({
      label: 'Conversions',
      value: (d.conversions ?? 0) > 0
        ? `${f('conversions', d.conversions)} · ${f('costPerConv', d.costPerConv)} each · account ${f('costPerConv', cur.costPerConv)}`
        : f('conversions', d.conversions),
    });
  }
  rows.push({ label: 'Ad strength', value: r.strength || DASH });
  if (content) rows.push({ label: 'Content', value: content.text });

  // Whether it can show at all comes first: nothing else changes while it can't.
  const why = reasons.length ? ` (${list(quoted(reasons))})` : '';
  if (r.eligibility === 'Pending') tips.push(`It's pending${why}, so it isn't eligible to show yet.`);
  else if (r.eligibility !== 'Eligible') tips.push(`It can't show right now${why}, so it gets no new impressions or clicks. Sort that out first.`);
  if (r.campaignStatus === 'removed') tips.push(`Its campaign, ${r.campaign}, has been removed.`);
  else if (r.campaignStatus === 'paused' || reasons.some((x) => /campaign is paused/i.test(x))) {
    tips.push(`Its campaign, ${r.campaign}, is paused. Enable the campaign if you want this ad to run.`);
  }
  if (reasons.some((x) => /polic/i.test(x))) tips.push("One reason is a policy issue: check the ad's text and images for what it names.");
  if (r.status === 'paused') tips.push('The ad itself is paused. Enable it if you want it to run.');

  if (!shown) {
    if (r.eligibility === 'Eligible') tips.push('It had no impressions in the last 30 days, so there are no results to judge it by yet.');
  } else {
    const ctrCmp = versus(d.ctr, ref.ctr);
    const best = peerRows.map(withDerived).filter((x) => x.ctr != null).sort((a, b) => b.ctr - a.ctr)[0];
    if (ctrCmp === 'below') {
      tips.push(`Its CTR (${f('ctr', d.ctr)}) is below ${ref.name} (${f('ctr', ref.ctr)}), so people who see it click less often.`
        + (best && best.ctr > d.ctr ? ` ${best.name} in ${best.campaign} has the best CTR of your ${noun}s (${f('ctr', best.ctr)}): compare its ${parts} with this ad's.` : ''));
    } else if (ctrCmp === 'above') {
      tips.push(`Its CTR (${f('ctr', d.ctr)}) is above ${ref.name} (${f('ctr', ref.ctr)}). Keep it running, and reuse what works in its ${parts} in your weaker ads.`);
    } else if (ctrCmp) {
      tips.push(`Its CTR (${f('ctr', d.ctr)}) is in line with ${ref.name} (${f('ctr', ref.ctr)}).`);
    }
    const cpcCmp = (d.clicks ?? 0) > 0 ? versus(d.avgCpc, ref.avgCpc) : null;
    if (cpcCmp === 'above') tips.push(`A click costs ${f('avgCpc', d.avgCpc)} on average, more than ${ref.name} (${f('avgCpc', ref.avgCpc)}).`);
    if ((d.clicks ?? 0) > 0 && !((d.conversions ?? 0) > 0)) {
      tips.push(`It got ${f('clicks', d.clicks)} clicks for ${f('cost', d.cost)} but recorded no conversions. If it should bring in sales or sign-ups, check that conversion tracking covers it.`);
      help = 'conversion-tracking';
    } else if ((d.conversions ?? 0) > 0) {
      const c = versus(d.costPerConv, cur.costPerConv);
      const acct = f('costPerConv', cur.costPerConv);
      tips.push(`It brought in ${f('conversions', d.conversions)} conversions at ${f('costPerConv', d.costPerConv)} each`
        + (c === 'below' ? `, less than the account's ${acct}.` : c === 'above' ? `, more than the account's ${acct}.` : c ? `, in line with the account's ${acct}.` : '.'));
    }
  }

  if (WEAK_STRENGTH.includes(r.strength)) {
    tips.push(`Its ad strength is ${r.strength}.`);
    if (!help) help = 'ad-strength';
  }
  // The edit page's own checks of the ad's content (counts of headlines, images and so on).
  if (content) tips.push(...content.tips.slice(0, 3));
  if (!tips.length) tips.push('Nothing in its figures stands out from the rest of the account.');

  return {
    text: `Here's how ${r.name}${where ? ` (${where})` : ''} did in the last 30 days, with the account for comparison:`,
    rows,
    tips: tips.slice(0, 8),
    help,
    follow: [...(r.campaign ? [`How can I optimize ${r.campaign}?`] : []), ...(r.format === 'search' ? ['Show my best headlines'] : [])],
  };
}

function answerAd(spec, report, opts) {
  const rows = report.rows;
  if (!rows.length) return { text: 'This account has no ads yet.' };
  const hits = findAds(spec, rows);
  const one = pickAd(hits, opts.viewingAdId);
  if (one) return adReview(one, report, opts.creatives?.[one.id]);
  if (!hits.length) {
    return {
      text: `I couldn't find an ad called “${spec}” in this account. Ad names are listed on the Ads page; ask again with one of them, `
        + `for example “${analyzeAd(rows[0], rows)}”.`,
    };
  }
  return {
    text: `${plural(hits.length, 'ad')} ${hits.length === 1 ? 'is' : 'are'} called “${hits[0].name}”. Which one should I look at?`,
    rows: hits.map((r) => ({
      label: [r.campaign, r.adGroup].filter(Boolean).join(' › '),
      value: `${r.eligibility || 'Not eligible'} · ${(r.impressions ?? 0) > 0
        ? `${f('clicks', r.clicks)} clicks · ${f('ctr', withDerived(r).ctr)} CTR`
        : 'no impressions in the last 30 days'}`,
    })),
    follow: uniq(hits.map((r) => analyzeAd(r, rows))),
  };
}

// ---------- One campaign: "How can I optimize <campaign>?" or any question naming one ----------

// The campaign a question names (the longest name found, so "Search-1" never hides "Search-10").
function campaignIn(q, camps) {
  let best = null;
  for (const c of camps) {
    const n = norm(c.name);
    if (n.length >= 3 && mentions(q, n) && (!best || n.length > norm(best.name).length)) best = c;
  }
  return best;
}

function campaignReview(c, report, camps) {
  const cur = withDerived(report.totals.account);
  const ads = c.ads;
  const live = ads.filter((r) => r.eligibility === 'Eligible');
  const shown = (c.impressions ?? 0) > 0;
  const peerCamps = camps.filter((x) => x.id !== c.id && x.type === c.type && (x.impressions ?? 0) > 0);
  const peers = peerCamps.length ? withDerived(sumRows(peerCamps.flatMap((x) => x.ads))) : null;
  const ref = peers ? { name: `your other ${c.type} campaigns`, ...peers } : { name: 'the account', ...cur };
  const stopped = c.status === 'paused' || c.status === 'removed';
  const label = c.status === 'removed' ? 'Removed' : c.status === 'paused' ? 'Paused' : campaignStatusLabel(c);
  const rows = [];
  const tips = [];
  const focus = [];
  let help;

  rows.push({ label: 'Status', value: [label, stopped ? '' : c.statusReasons.join(', ')].filter(Boolean).join(': ') });
  rows.push({ label: 'Ads', value: ads.length ? `${live.length} of ${plural(ads.length, 'ad')} eligible to show` : 'No ads yet' });
  if (!shown) rows.push({ label: 'Results', value: 'No impressions in the last 30 days' });
  else {
    rows.push({ label: 'Clicks', value: `${f('clicks', c.clicks)} from ${f('impressions', c.impressions)} impressions` });
    rows.push({ label: 'CTR', value: `${f('ctr', c.ctr)} · account ${f('ctr', cur.ctr)}${peers ? ` · other ${c.type} campaigns ${f('ctr', peers.ctr)}` : ''}` });
    rows.push({ label: 'Cost per click', value: (c.clicks ?? 0) > 0 ? `${f('avgCpc', c.avgCpc)} · account ${f('avgCpc', cur.avgCpc)}` : DASH });
    rows.push({ label: 'Cost', value: f('cost', c.cost) });
    rows.push({
      label: 'Conversions',
      value: (c.conversions ?? 0) > 0
        ? `${f('conversions', c.conversions)} · ${f('costPerConv', c.costPerConv)} each · account ${f('costPerConv', cur.costPerConv)}`
        : f('conversions', c.conversions),
    });
  }
  const perDay = (c.cost ?? 0) > 0 ? c.cost / 30 : null;
  if (c.budget != null) rows.push({ label: 'Daily budget', value: f('cost', c.budget) + (perDay != null ? ` · spent ${f('cost', perDay)} a day on average` : '') });
  if (c.optimizationScore != null) rows.push({ label: 'Optimization score', value: formatScore(c.optimizationScore) });

  // Whether it can run at all comes first.
  if (c.status === 'removed') tips.push("It has been removed, so it can't run.");
  else if (c.status === 'paused') tips.push("It's paused, so it isn't running. Enable it if you want it to get results again.");
  else if (!ads.length) tips.push('It has no ads, so there is nothing to show. Add an ad to start getting results.');
  else if (!live.length) {
    const why = uniq(ads.flatMap(reasonsOf));
    tips.push(`None of its ${plural(ads.length, 'ad')} is eligible to show${why.length ? ` (reasons given: ${list(quoted(why))})` : ''}, so it can't get impressions.`);
    focus.push(...ads);
  } else if (live.length < ads.length) {
    const off = ads.filter((r) => r.eligibility !== 'Eligible');
    tips.push(`${off.length} of its ${ads.length} ads ${off.length === 1 ? "isn't" : "aren't"} eligible to show: ${list(off.map((r) => r.name))}.`);
    focus.push(...off);
  }
  if (!stopped && c.statusReasons.length) {
    tips.push(`The ${c.statusReasons.length === 1 ? 'reason' : 'reasons'} given for its ${label} status: ${list(c.statusReasons)}. Sort that out first.`);
    if (c.statusReasons.some((x) => /conversion/i.test(x))) help = 'conversion-tracking';
  }

  if (!shown) {
    if (!stopped && live.length) tips.push('It had no impressions in the last 30 days, so there are no results to judge it by yet.');
  } else {
    const ctrCmp = versus(c.ctr, ref.ctr);
    const byCtr = ads.map(withDerived).filter((r) => (r.impressions ?? 0) > 0 && r.ctr != null).sort((a, b) => a.ctr - b.ctr);
    const weakest = byCtr.length > 1 ? byCtr[0] : null;
    if (ctrCmp === 'below') {
      tips.push(`Its CTR (${f('ctr', c.ctr)}) is below ${ref.name} (${f('ctr', ref.ctr)}).`
        + (weakest ? ` Its weakest ad by CTR is ${weakest.name} (${f('ctr', weakest.ctr)}), so start there.` : ''));
    } else if (ctrCmp === 'above') {
      tips.push(`Its CTR (${f('ctr', c.ctr)}) is above ${ref.name} (${f('ctr', ref.ctr)}).`
        + (weakest ? ` Its weakest ad by CTR is ${weakest.name} (${f('ctr', weakest.ctr)}).` : ''));
    } else if (ctrCmp) {
      tips.push(`Its CTR (${f('ctr', c.ctr)}) is in line with ${ref.name} (${f('ctr', ref.ctr)}).`
        + (weakest ? ` Its weakest ad by CTR is ${weakest.name} (${f('ctr', weakest.ctr)}).` : ''));
    }
    if (weakest) focus.unshift(ads.find((r) => r.id === weakest.id));

    const convCamps = camps.filter((x) => (x.conversions ?? 0) > 0 && x.costPerConv != null);
    const cheapest = [...convCamps].sort((a, b) => a.costPerConv - b.costPerConv)[0];
    let pointed = false; // the cheaper campaign is named once at most
    if ((c.clicks ?? 0) > 0 && !((c.conversions ?? 0) > 0)) {
      tips.push(`It got ${f('clicks', c.clicks)} clicks for ${f('cost', c.cost)} in the last 30 days and recorded no conversions. `
        + 'If it should bring in sales or sign-ups, check that conversion tracking covers it; until conversions are recorded there is no way to tell which clicks pay off.');
      help = 'conversion-tracking';
    } else if ((c.conversions ?? 0) > 0) {
      const cmp = versus(c.costPerConv, cur.costPerConv);
      const acct = f('costPerConv', cur.costPerConv);
      pointed = cmp === 'above' && !!cheapest && cheapest.id !== c.id;
      tips.push(`It brought in ${f('conversions', c.conversions)} conversions at ${f('costPerConv', c.costPerConv)} each`
        + (cmp === 'below' ? `, less than the account's ${acct}.` : cmp === 'above' ? `, more than the account's ${acct}.` : cmp ? `, in line with the account's ${acct}.` : '.')
        + (pointed ? ` ${cheapest.name} converts for less (${f('costPerConv', cheapest.costPerConv)}).` : ''));
    }

    // Share of spend against share of conversions.
    const spent = camps.reduce((s, x) => s + (x.cost ?? 0), 0);
    const spenders = camps.filter((x) => (x.cost ?? 0) > 0).length;
    if ((c.cost ?? 0) > 0 && spenders > 1) {
      const conv = cur.conversions ?? 0;
      const gap = conv > 0 ? c.cost / spent - (c.conversions ?? 0) / conv : 0;
      tips.push(`It took ${share(c.cost, spent)} of your spend in the last 30 days`
        + (conv > 0 ? ` and brought in ${share(c.conversions ?? 0, conv)} of your conversions.` : '.')
        + (gap > 0.2 && !pointed && cheapest && cheapest.id !== c.id
          ? ` ${cheapest.name} brought in conversions at ${f('costPerConv', cheapest.costPerConv)} each, so it's the first place to move budget to if you want more of them.`
          : ''));
    }
    if (c.budget > 0 && perDay != null && perDay >= c.budget * 0.9) {
      tips.push(`It spent ${f('cost', perDay)} a day on average against a ${f('cost', c.budget)} daily budget, so ${perDay >= c.budget ? 'its budget is fully used' : 'it uses nearly all of its budget'}.`
        + ((c.conversions ?? 0) > 0 && versus(c.costPerConv, cur.costPerConv) !== 'above' ? ' It also converts at or below the account\'s cost per conversion, so raising the budget is the obvious way to get more from it.' : ''));
    }
  }

  // Target cost per conversion set on its ad groups, against what conversions cost there.
  for (const g of (report.adGroups || []).filter((x) => x.campaignId === c.id && x.targetCpa > 0).slice(0, 2)) {
    const t = withDerived(sumRows(ads.filter((r) => r.adGroupId === g.id)));
    if ((t.conversions ?? 0) > 0) {
      tips.push(`${g.name} aims for ${f('cost', g.targetCpa)} per conversion and paid ${f('costPerConv', t.costPerConv)} in the last 30 days, `
        + `${t.costPerConv <= g.targetCpa ? 'within' : 'over'} that target.`);
    }
  }

  const weak = ads.filter((r) => WEAK_STRENGTH.includes(r.strength));
  if (weak.length) {
    tips.push(`Ad strength is ${list(weak.map((r) => `${r.strength} for ${r.name}`))}.`);
    focus.push(...weak);
    if (!help) help = 'ad-strength';
  }
  if (!tips.length) tips.push('Nothing in its figures stands out from the rest of the account.');

  const same = camps.filter((x) => norm(x.name) === norm(c.name)).length;
  return {
    text: `Here's what the last 30 days show for ${c.name}${c.type ? ` (${c.type})` : ''}`
      + (same > 1 ? `, the first of ${same} campaigns with this name` : '') + ':',
    rows,
    tips: tips.slice(0, 8),
    help,
    follow: uniq(focus.filter(Boolean).map((r) => analyzeAd(r, report.rows))).slice(0, 3),
  };
}

export const SUGGESTIONS = [
  'What are my top performing campaigns?',
  'How much did I spend?',
  'Which campaigns are paused?',
  'How is my clickthrough rate?',
];

// Returns { text, rows?, tips?, follow?, help?, suggest? }: rows is a small table [{ label, value }],
// tips the suggestions that follow from those figures, follow the next questions to offer and
// help a Quick help topic for "Learn more".
// opts: { viewingAdId } the ad open on the page (settles an ad name several ads share),
// { creatives } display ad content by ad id (edit page), for an ad's headline / image counts.
export function answer(question, report, opts = {}) {
  const q = norm(question);
  const camps = campaignStats(report);

  // The app's own "Analyze my ad <name> and suggest improvements" (asset details page).
  const spec = adSpec(question);
  if (spec != null) return answerAd(spec, report, opts);
  // A question naming a campaign is about that campaign ("How can I optimize <name>?" from the
  // learning-phase card): its own figures, never account-wide ones picked by words in its name.
  const named = campaignIn(q, camps);
  if (named) return campaignReview(named, report, camps);

  const cur = withDerived(report.totals.account);
  const prev = withDerived(report.totals.previous);
  const has = (...w) => w.some((x) => q.includes(x));
  const withData = camps.filter((c) => (c.impressions ?? 0) > 0);
  const ctrRows = () => [...withData].sort((a, b) => (a.ctr ?? 0) - (b.ctr ?? 0))
    .map((c) => ({ label: c.name, value: `${f('ctr', c.ctr)} CTR · ${f('clicks', c.clicks)} clicks · ${f('impressions', c.impressions)} impr.` }));

  // Headlines of the search ads that did best; results are per ad, so each headline shows its ad's figures.
  if (has('best headline', 'top headline', 'my headlines', 'which headlines', 'headlines work', 'headline perform')) {
    const search = report.rows.filter((r) => r.format === 'search' && r.headlines?.length).map(withDerived);
    if (!search.length) return { text: 'This account has no search ads, so there are no headlines to rank.' };
    const shown = search.filter((r) => (r.impressions ?? 0) > 0)
      .sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0) || (b.clicks ?? 0) - (a.clicks ?? 0));
    if (!shown.length) return { text: 'None of your search ads were shown in the last 30 days, so there are no results to rank their headlines by.' };
    const rows = shown.flatMap((r) => r.headlines.map(tidy).filter(Boolean)
      .map((h) => ({ label: h, value: `${r.name} · ${r.campaign} · ${f('ctr', r.ctr)} CTR · ${f('clicks', r.clicks)} clicks` })));
    return {
      text: `Here are the headlines of your ${plural(shown.length, 'search ad')} shown in the last 30 days, best clickthrough rate first. `
        + 'Results are counted per ad, not per headline, so headlines in the same ad share its figures:',
      rows: rows.slice(0, 10),
      follow: ['Create text assets from my best keywords.'],
    };
  }
  if (has('text asset', 'headline', 'keyword', 'ad copy', 'asset')) {
    const search = report.rows.filter((r) => r.format === 'search');
    const ranked = [...search].sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0));
    const best = ranked[0];
    if (!best) return { text: 'This account has no search ads yet, so there are no keywords or headlines to build from.' };
    // Every line is one of the account's own (editable) headlines; nothing is made up.
    const ideas = ranked.flatMap((r) => (r.headlines || []).map(tidy))
      .filter((h, i, a) => h && a.indexOf(h) === i).slice(0, 5);
    // Only call one "best" when clicks rank them; with no clicks the order means nothing.
    return {
      text: ((best.clicks ?? 0) > 0
        ? `These headlines come from your own search ads, starting with your best one (${best.name} in ${best.campaign}, ${f('clicks', best.clicks)} clicks in the last 30 days). `
        : "These headlines come from your own search ads (none got clicks in the last 30 days, so they aren't ranked). ")
        + 'Reuse them as text assets or as a starting point for new ones:',
      rows: ideas.map((h, i) => ({ label: h, value: `Headline ${i + 1} · ${h.length}/30 characters` })),
      help: 'headlines',
    };
  }
  if (has('which ads', 'ads aren', 'ads not', 'ads are not', 'ad status', 'disapproved')) {
    const ads = report.rows;
    if (!ads.length) return { text: 'This account has no ads yet.' };
    const off = ads.filter((r) => r.eligibility !== 'Eligible');
    if (!off.length) return { text: `All ${plural(ads.length, 'ad')} are eligible to show.` };
    return {
      text: off.length === ads.length ? `None of your ${plural(ads.length, 'ad')} are running:` : `${off.length} of your ${plural(ads.length, 'ad')} aren't running:`,
      rows: off.map((r) => ({ label: `${r.name} · ${r.campaign}`, value: reasonsOf(r).join(', ') || r.eligibility || 'Not eligible' })),
      follow: ['Which campaigns are paused?'],
    };
  }
  if (has('no conversion', 'without conversion', 'zero conversion', 'not converting', "don't convert", 'no conv')) {
    const dry = withData.filter((c) => (c.clicks ?? 0) > 0 && !((c.conversions ?? 0) > 0)).sort((a, b) => b.clicks - a.clicks);
    if (!dry.length) {
      return {
        text: withData.some((c) => (c.clicks ?? 0) > 0)
          ? 'Every campaign that got clicks in the last 30 days also recorded conversions.'
          : 'None of your campaigns got clicks in the last 30 days.',
      };
    }
    return {
      text: `${plural(dry.length, 'campaign')} got clicks but recorded no conversions in the last 30 days. `
        + (dry.length === 1 ? 'If it should bring in sales or sign-ups, check that conversion tracking covers it:' : 'If they should bring in sales or sign-ups, check that conversion tracking covers them:'),
      rows: dry.map((c) => ({ label: c.name, value: `${f('clicks', c.clicks)} clicks · ${f('cost', c.cost)} · no conversions` })),
      help: 'conversion-tracking',
    };
  }
  if (has('split', 'share of', 'breakdown', 'break down', 'concentrat')) {
    const spenders = camps.filter((c) => (c.cost ?? 0) > 0).sort((a, b) => b.cost - a.cost);
    if (!spenders.length) return { text: 'Nothing was spent in the last 30 days.' };
    const total = spenders.reduce((s, c) => s + c.cost, 0);
    return {
      text: `Here's how the ${f('cost', total)} you spent in the last 30 days was split across campaigns:`,
      rows: spenders.map((c) => ({ label: c.name, value: `${f('cost', c.cost)} · ${share(c.cost, total)} of spend · ${f('clicks', c.clicks)} clicks` })),
      follow: ['What are my top performing campaigns?'],
    };
  }
  if (has('ctr', 'clickthrough', 'click-through') && has('every', 'each', 'by campaign', 'all campaign', 'across')) {
    if (!withData.length) return { text: 'None of your campaigns had impressions in the last 30 days, so there is no clickthrough rate to compare.' };
    return {
      text: `Clickthrough rate by campaign for the last 30 days, lowest first (account: ${f('ctr', cur.ctr)}):`,
      rows: ctrRows(),
    };
  }
  if (has('worst', 'lowest', 'poor', 'underperform', 'diagnose')) {
    if (!withData.length) return { text: 'None of your campaigns had impressions in the last 30 days, so there is nothing to compare yet.' };
    const w = [...withData].sort((a, b) => (a.ctr ?? 0) - (b.ctr ?? 0))[0];
    return {
      text: `${w.name} has the lowest clickthrough rate in the last 30 days at ${f('ctr', w.ctr)}, from ${f('impressions', w.impressions)} impressions. Fresher headlines or tighter targeting usually help.`
        + (withData.length > 1 ? ' All campaigns with impressions, lowest CTR first:' : ''),
      rows: withData.length > 1 ? ctrRows() : undefined,
    };
  }
  if (has('compare', 'previous', 'last month', 'trend', ' vs', 'versus', 'days before')) {
    return {
      text: 'The last 30 days compared with the 30 days before:',
      rows: [['impressions', 'Impressions'], ['clicks', 'Clicks'], ['ctr', 'CTR'], ['cost', 'Cost'], ['conversions', 'Conversions']]
        .map(([m, label]) => ({ label, value: `${f(m, cur[m])} · ${changeText(m, cur[m], prev[m])}` })),
    };
  }
  if (/\btop\b/.test(q) || has('best', 'perform', 'winning')) {
    const ranked = [...withData].sort((a, b) => (b.conversions ?? 0) - (a.conversions ?? 0) || (b.clicks ?? 0) - (a.clicks ?? 0)).slice(0, 3);
    if (!ranked.length) return { text: 'None of your campaigns had impressions in the last 30 days, so there is no top performer yet. Enable a campaign to start collecting results.' };
    return {
      text: `Here are your top ${ranked.length} campaigns for the last 30 days, ranked by conversions and then clicks:`,
      rows: ranked.map((c) => ({ label: c.name, value: `${f('conversions', c.conversions)} conv. · ${f('clicks', c.clicks)} clicks · ${f('cost', c.cost)}` })),
    };
  }
  if (has('spend', 'spent', 'cost', 'budget', 'money')) {
    const top = [...camps].filter((c) => (c.cost ?? 0) > 0).sort((a, b) => b.cost - a.cost).slice(0, 3);
    return {
      text: `You spent ${f('cost', cur.cost)} in the last 30 days (${changeText('cost', cur.cost, prev.cost).toLowerCase()}).${top.length ? ' Most of it went to:' : ''}`,
      rows: top.map((c) => ({ label: c.name, value: f('cost', c.cost) })),
      follow: top.length > 1 ? ['How is my spend split across campaigns?'] : undefined,
    };
  }
  if (has('pause', 'running', 'eligible', 'status', 'active', 'stopped', 'not showing')) {
    if (!camps.length) return { text: 'This account has no campaigns yet.' };
    const off = camps.filter((c) => !running(c));
    const on = camps.filter(running);
    return {
      text: off.length
        ? `${off.length} of your ${camps.length} campaigns aren't running${on.length ? `; ${on.length} ${on.length === 1 ? 'is' : 'are'}` : ''}:`
        : 'All of your campaigns are running.',
      rows: off.map((c) => ({ label: c.name, value: c.status === 'paused' ? 'Paused' : c.status === 'removed' ? 'Removed' : 'Not eligible' })),
    };
  }
  if (has('ctr', 'clickthrough', 'click-through', 'click rate', 'clicks')) {
    const best = [...withData].sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))[0];
    return {
      text: `Your clickthrough rate for the last 30 days is ${f('ctr', cur.ctr)}: ${f('clicks', cur.clicks)} clicks from ${f('impressions', cur.impressions)} impressions.`
        + (best ? ` ${best.name} has the highest CTR at ${f('ctr', best.ctr)}.` : ''),
      follow: withData.length > 1 ? ['Show CTR for every campaign'] : undefined,
    };
  }
  if (has('conversion', 'conv', 'lead', 'sale')) {
    const best = [...withData].filter((c) => (c.conversions ?? 0) > 0).sort((a, b) => b.conversions - a.conversions)[0];
    return {
      text: `You got ${f('conversions', cur.conversions)} conversions in the last 30 days (${changeText('conversions', cur.conversions, prev.conversions).toLowerCase()}), `
        + `at ${f('costPerConv', cur.costPerConv)} per conversion.` + (best ? ` ${best.name} brought in the most: ${f('conversions', best.conversions)}.` : ''),
      follow: ['Which campaigns have clicks but no conversions?'],
    };
  }
  if (has('impression', 'reach', 'views', 'seen')) {
    return { text: `Your ads were shown ${f('impressions', cur.impressions)} times in the last 30 days (${changeText('impressions', cur.impressions, prev.impressions).toLowerCase()}).` };
  }
  if (has('hello', 'hi ', 'hey') || q.trim() === 'hi') {
    return { text: 'Hi! Ask me about your campaigns, spend, clicks, conversions or which campaigns are paused.' };
  }
  return {
    text: 'I can answer questions about the last 30 days of this account: top campaigns, spend and how it is split, clicks and CTR, '
      + "conversions, impressions, your best headlines, and which campaigns or ads aren't running. Try one of these:",
    suggest: true,
  };
}
