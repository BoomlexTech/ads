import { Campaign, AdGroup, Ad, Stat, History, Setting, Asset } from './models.js';
import { ensureSampleAssets, sampleLibrary, sampleCreative, tableFieldsOf } from './creative.js';
import { eachDay, addDays } from '../shared/dates.js';
import { DEFAULT_ACCOUNT } from '../shared/brand.js';

export const DATA_START = '2026-01-01';
// Daily budget (cents) a campaign of each type starts with.
export const DEFAULT_BUDGET = { Search: 5000, Display: 4000, Video: 2500, 'Demand Gen': 3000 };
// Value of one conversion (whole currency units) for an ad: fixed per ad, 20-60.
export const convValuePer = (order) => 20 + ((Number(order) || 0) * 13) % 41;
const withValue = (s, order) => ({ ...s, convValue: s.conversions == null ? null : s.conversions * convValuePer(order) });
const ZERO = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
// A search ad's starting description, built from its headlines (stored, so the admin can change it).
// Longest description the editor accepts (server/editing.js stores at most this many characters).
export const DESCRIPTION_MAX = 200;
export const startingDescription = (headlines) => {
  const s = headlines?.length ? `${[...headlines].reverse().join('. ')}. ${headlines[0]}\u2026` : '';
  return s.length > DESCRIPTION_MAX ? `${s.slice(0, DESCRIPTION_MAX - 1).trimEnd()}\u2026` : s;
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const CAMPAIGNS = [
  { name: 'Demand Gen - 2025-04-18', type: 'Demand Gen', status: 'paused', groups: [
    { name: 'Ad group 1', ads: [{ name: 'Ad 1', format: 'video', adType: 'Demand Gen video ad', mediaCount: 3, hue: 30, strength: 'Average',
      headlines: ['Secrets ti…', 'Learn mor…', 'Share your videos …', DEFAULT_ACCOUNT.name], extraCounts: [1, 2],
      reasons: ['Campaign has ended', 'Campaign is paused'], profile: 'video', activeUntil: '2026-03-31' }] }] },
  { name: 'FR Video Conversions - 2025-03-21 #2', type: 'Demand Gen', status: 'paused', groups: [
    { name: 'Ad group 1', ads: [{ name: 'Ad 1', format: 'video', adType: 'Demand Gen video ad', mediaCount: 2, hue: 200, strength: null,
      headlines: ['Get more con…', 'Watch now …', DEFAULT_ACCOUNT.name], extraCounts: [2, 1],
      reasons: ['Campaign has ended', 'Campaign is paused'], profile: 'none' }] }] },
  { name: 'Video test views - 2025-04-18', type: 'Video', status: 'paused', groups: [
    { name: 'Video views - 2025-04-18', ads: [{ name: 'Ad #1', format: 'video', adType: 'Responsive video ad', mediaCount: 2, hue: 100, strength: null,
      headlines: ['Subscribe', 'Boost Your Poor cr…', 'Knowledge for a Be…', 'Increase Crop Yield…'], videoTitle: 'Harvest festival',
      reasons: ['Campaign has ended', 'Campaign is paused'], profile: 'video', activeUntil: '2026-02-28' }] }] },
  { name: 'Video views - 2025-04-04', type: 'Video', status: 'paused', groups: [
    { name: 'Video views - 2025-04-04', ads: [{ name: 'Ad #1', format: 'video', adType: 'Responsive video ad', mediaCount: 1, hue: 50, strength: null,
      headlines: ['Subscribe', 'Zero Budget Farming', 'High yield Farming …', 'Secrets of the Season…'], videoTitle: 'Revolutionizing farming',
      reasons: ['Policy (Unreliable claims)', 'Campaign has ended', '+1'], profile: 'video', activeUntil: '2026-02-15' }] }] },
  { name: 'Website traffic-Search-1', type: 'Search', status: 'paused', groups: [
    { name: 'Ad group 1', ads: [{ name: 'Ad #1', format: 'search', adType: 'Responsive search ad', strength: 'Good', displayUrl: 'www.example.com',
      headlines: ['Organic Farming Tips', 'Grow More With Less', 'Free Expert Advice'],
      reasons: ['Campaign is paused'], profile: 'search', activeUntil: '2026-04-30' }] }] },
  { name: 'Website traffic-Search-JAN2026', type: 'Search', status: 'enabled', optimizationScore: 81.3, groups: [
    { name: 'Ad group 1', targetCpa: 1500, ads: [
      { name: 'Ad #1', format: 'search', adType: 'Responsive search ad', strength: 'Excellent', displayUrl: 'www.example.com/crops',
        headlines: ['Best Seeds For Rabi Season', 'Certified Quality Seeds', 'Order Online Today'], profile: 'search' },
      { name: 'Ad #2', format: 'search', adType: 'Responsive search ad', strength: 'Good', displayUrl: 'www.example.com/soil',
        headlines: ['Soil Testing Made Easy', 'Know Your Soil Health', 'Book A Free Visit'], profile: 'search' },
    ] }] },
  { name: 'Leads-Display-1', type: 'Display', status: 'enabled', optimizationScore: 72.4,
    statusLabel: 'Eligible (Limited)', statusReasons: ['Conversion tracking setup is incomplete'], groups: [
    { name: 'Ad group 1', ads: [
      { name: 'Ad #1', format: 'display', adType: 'Responsive display ad', mediaCount: 5, hue: 220, strength: 'Good',
        headlines: ['Grow …', 'Harvest …', 'Seeds …'], extraCounts: [5, 5, 6], profile: 'display' },
      { name: 'Ad #2', format: 'display', adType: 'Responsive display ad', mediaCount: 7, hue: 140, strength: 'Good',
        headlines: ['Your …', 'Farm …', 'Yield …'], extraCounts: [4, 3, 7], profile: 'display' },
    ] }] },
];

function dayStats(profile, r) {
  if (profile === 'display') {
    const impressions = Math.round(38000 + r() * 6000);
    const clicks = Math.round(impressions * (0.031 + r() * 0.003));
    return { impressions, clicks, cost: Math.round(clicks * (1.75 + r() * 0.15)), conversions: 0 };
  }
  if (profile === 'search') {
    const impressions = Math.round(1200 + r() * 600);
    const clicks = Math.round(impressions * (0.045 + r() * 0.02));
    return { impressions, clicks, cost: Math.round(clicks * (38 + r() * 14)), conversions: Math.round(clicks * (0.02 + r() * 0.03)) * 100 };
  }
  const impressions = Math.round(5000 + r() * 2500);
  const clicks = Math.round(impressions * (0.004 + r() * 0.003));
  return { impressions, clicks, cost: Math.round(impressions * (0.09 + r() * 0.04)), conversions: 0 };
}

export async function seed(endDate) {
  await Promise.all([
    Campaign.deleteMany({}), AdGroup.deleteMany({}), Ad.deleteMany({}), Stat.deleteMany({}), History.deleteMany({}), Setting.deleteMany({}),
    Asset.deleteMany({}),
  ]);
  await ensureSampleAssets();
  // Display ads use the library's own pictures, so the asset dialogs show them as picked.
  const library = await sampleLibrary();
  const days = eachDay(DATA_START, endDate);
  const r = rng(42);
  const stats = [];
  let ci = 0;
  let ai = 0;
  for (const c of CAMPAIGNS) {
    const camp = await Campaign.create({
      name: c.name, type: c.type, status: c.status, order: ci++, budget: DEFAULT_BUDGET[c.type],
      statusLabel: c.statusLabel || '', statusReasons: c.statusReasons || [], optimizationScore: c.optimizationScore ?? null,
    });
    for (const g of c.groups) {
      const group = await AdGroup.create({
        campaignId: camp._id, name: g.name, status: 'enabled', statusLabel: '', statusReasons: [], targetCpa: g.targetCpa ?? null, groupType: '',
      });
      for (const a of g.ads) {
        const enabled = c.status === 'enabled';
        const ad = await Ad.create({
          campaignId: camp._id, adGroupId: group._id, name: a.name, format: a.format, adType: a.adType,
          status: 'enabled', headlines: a.headlines, extraCounts: a.extraCounts || [], mediaCount: a.mediaCount || 0,
          hue: a.hue || 0, strength: a.strength, displayUrl: a.displayUrl, videoTitle: a.videoTitle, profile: a.profile,
          ...(a.format === 'search' && { description: a.description ?? startingDescription(a.headlines) }),
          eligibility: enabled ? 'Eligible' : 'Not eligible', reasons: a.reasons || [], order: ai++,
        });
        if (a.format === 'display') {
          // Full sample content for the edit page; the table lines follow from it.
          const creative = sampleCreative(ad, DEFAULT_ACCOUNT.name, library);
          ad.creative = creative;
          ad.markModified('creative');
          Object.assign(ad, tableFieldsOf(creative));
          ad.media = { url: creative.images[0].url, type: 'image', provider: 'asset' };
          await ad.save();
        }
        if (a.profile === 'none') continue;
        for (const d of days) {
          const active = enabled || (a.activeUntil && d <= a.activeUntil);
          const s = withValue(active ? dayStats(a.profile, r) : ZERO, ad.order);
          stats.push({ adId: ad._id, adGroupId: group._id, campaignId: camp._id, date: d, ...s });
        }
      }
    }
  }
  await Stat.insertMany(stats);
}

// Keep enabled campaigns (and ad groups) serving: add daily rows for days after the last stored day.
export async function topUp(endDate) {
  const last = await Stat.findOne().sort({ date: -1 }).lean();
  if (!last || last.date >= endDate) return;
  const days = eachDay(addDays(last.date, 1), endDate);
  const camps = new Map((await Campaign.find().lean()).map((c) => [String(c._id), c]));
  const paused = new Set((await AdGroup.find({ status: 'paused' }, { _id: 1 }).lean()).map((g) => String(g._id)));
  const ads = await Ad.find({ profile: { $nin: [null, 'none'] } }).lean();
  const r = rng(Number(last.date.replace(/-/g, '')));
  const docs = [];
  for (const ad of ads) {
    const enabled = camps.get(String(ad.campaignId))?.status === 'enabled' && !paused.has(String(ad.adGroupId));
    for (const d of days) {
      const s = withValue(enabled ? dayStats(ad.profile, r) : ZERO, ad.order);
      docs.push({ adId: ad._id, adGroupId: ad.adGroupId, campaignId: ad.campaignId, date: d, ...s });
    }
  }
  if (docs.length) await Stat.insertMany(docs, { ordered: false }).catch(() => {});
}

// Databases from before a field existed: fill it in only where it is missing, never
// overwriting what the admin set (a budget cleared on purpose stays null).
export async function upgradeData() {
  for (const [type, budget] of Object.entries(DEFAULT_BUDGET)) {
    await Campaign.updateMany({ type, budget: { $exists: false } }, { $set: { budget } });
  }
  // Conv. value = conversions x the ad's fixed value per conversion, as the seed does.
  const ads = await Ad.find({}, { order: 1 }).lean();
  const per = ads.length
    ? { $switch: { branches: ads.map((a) => ({ case: { $eq: ['$adId', a._id] }, then: convValuePer(a.order) })), default: convValuePer(0) } }
    : convValuePer(0);
  await Stat.collection.updateMany({ convValue: { $exists: false } }, [{ $set: { convValue: { $multiply: ['$conversions', per] } } }]);
  // Search ads used to show a description made from their headlines without storing it: store
  // that text once, on the first start after the change (a description the admin cleared is ''
  // and stays cleared; search ads added later start with '').
  if (!(await Setting.exists({ key: 'searchDescriptionsStored' }))) {
    for (const a of await Ad.find({ format: 'search', description: { $exists: false } }, { headlines: 1 }).lean()) {
      await Ad.updateOne({ _id: a._id, description: { $exists: false } }, { $set: { description: startingDescription(a.headlines) } });
    }
    await Setting.updateOne({ key: 'searchDescriptionsStored' }, { $set: { value: true } }, { upsert: true });
  }
}
