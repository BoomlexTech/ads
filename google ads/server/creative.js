// Display ad edit page: the ad's content (images, headlines, options...) and the shared
// image / logo / video library. Shapes and checks live in shared/creative.js.
import mongoose from 'mongoose';
import { Campaign, AdGroup, Ad, Asset, History, Setting } from './models.js';
import {
  LIMITS, EDIT_FORMATS, STRENGTH_LEVELS, CHECK_KEYS, CHECK_STATES, CTA_OPTIONS, PRICE_PREFIXES, AFTER_SAVE, MAX_BYTES, TEXT_KINDS, TEXT_LIMIT,
  normalizeCreative, validateCreative, adStrength, normText, isYouTube, youTubeUrl, capLabel,
} from '../shared/creative.js';
import { VARIANTS, SAMPLE_PREFIX, sceneFile, logoFile, sampleUrl, sampleRef, parseSample } from './samples.js';

const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);
// `fields` ({ key: message }) lets the edit page highlight the section the error is about.
const fail = (msg, status = 400, fields) => Object.assign(new Error(msg), { status, expose: true, ...(fields && { fields }) });
// One line of plain text, normalised like the client checks it (shared normText), length
// capped in characters (never splitting an emoji).
const cut = (s, max) => (s.length <= max ? s : [...s].slice(0, max).join(''));
const clean = (v, max) => cut(normText(String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ')), max);
const int = (v, lo, hi) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : 0;
};
const list = (v) => (Array.isArray(v) ? v : []);

export const ASSET_KINDS = ['image', 'logo', 'video'];
export const ASSET_SOURCES = ['suggested', 'generated', 'website', 'stock', 'upload'];
const TABLE_STRENGTHS = ['Excellent', 'Good', 'Average', 'Poor'];
// Generous caps before validation, so a too-long entry or list is reported rather than cut.
const TEXT_CAP = 500;
const LIST_CAP = 50;
const NAME_MAX = 80;

// ---------------- pure helpers (unit tested) ----------------
function urlOf(v) {
  const s = String(v ?? '').trim();
  return s.length <= 2048 && !/[\s"'<>\\]/.test(s) ? s : '';
}
function imageRef(x) {
  const ref = { url: urlOf(x?.url), w: int(x?.w, 0, 20000), h: int(x?.h, 0, 20000), bytes: int(x?.bytes, 0, 1e11), name: clean(x?.name, 120) };
  return isId(x?.assetId) ? { assetId: x.assetId, ...ref } : ref;
}
function videoRef(x) {
  const ref = { url: urlOf(x?.url), title: clean(x?.title, 100) };
  if (isId(x?.assetId)) return { assetId: x.assetId, ...ref };
  return x?.own === true ? { ...ref, own: true } : ref;
}
const YOUTUBE_HINT = 'Use a YouTube link, like https://www.youtube.com/watch?v=…';
// A YouTube video ref in its one stored form (https://www.youtube.com/watch?v=<id>), or null.
export function youTubeRef(ref) {
  return isYouTube(ref?.url) ? { url: youTubeUrl(ref.url), title: clean(ref.title, 100) || 'YouTube video' } : null;
}
const refs = (v, shape) => list(v).slice(0, LIST_CAP).map(shape).filter((r) => r.url);
const texts = (v, max = TEXT_CAP) => list(v).slice(0, LIST_CAP).map((s) => clean(s, max)).filter(Boolean);
// Custom parameter rows the user typed something into (wholly empty rows are dropped).
const paramRows = (v) => list(v).slice(0, LIST_CAP)
  .map((p) => ({ key: clean(p?.key, TEXT_CAP), value: clean(p?.value, TEXT_CAP) }));
const typed = (p) => !!(p.key || p.value);

// Text the user types is only capped generously here; validateCreative reports anything
// over its limit, so nothing is silently cut or dropped.
function cleanOptions(o = {}) {
  const color = (v) => (/^#[0-9a-f]{6}$/i.test(String(v ?? '').trim()) ? String(v).trim().toUpperCase() : '');
  return {
    cta: CTA_OPTIONS.includes(o.cta) ? o.cta : 'Automated',
    promoText: clean(o.promoText, TEXT_CAP),
    pricePrefix: PRICE_PREFIXES.includes(o.pricePrefix) ? o.pricePrefix : '',
    price: clean(o.price, TEXT_CAP),
    mainColor: color(o.mainColor),
    accentColor: color(o.accentColor),
    assetEnhancements: o.assetEnhancements !== false,
    autoVideo: o.autoVideo !== false,
    nativeFormats: o.nativeFormats !== false,
    // The page's boxes stop at these limits already.
    trackingTemplate: clean(o.trackingTemplate, LIMITS.trackingTemplate),
    finalUrlSuffix: clean(o.finalUrlSuffix, LIMITS.finalUrlSuffix),
    customParams: paramRows(o.customParams).filter(typed),
    useMobileUrl: o.useMobileUrl === true,
    mobileUrl: clean(o.mobileUrl, LIMITS.finalUrl),
  };
}

function cleanAdmin(a = {}) {
  return {
    strength: STRENGTH_LEVELS.includes(a.strength) ? a.strength : '',
    tips: texts(a.tips),
    checklist: Object.fromEntries(CHECK_KEYS.map((k) => [k, CHECK_STATES.includes(a.checklist?.[k]) ? a.checklist[k] : 'auto'])),
    suggestedHeadlines: texts(a.suggestedHeadlines),
    suggestedDescriptions: texts(a.suggestedDescriptions),
    afterSave: AFTER_SAVE.includes(a.afterSave) ? a.afterSave : AFTER_SAVE[0],
  };
}

// Everything the client sent, reduced to the stored shape: single-line text, known option
// values only, empty headline/description boxes and parameter rows dropped. Image refs are
// shaped here and checked against the library in the PUT route.
export function cleanCreative(raw) {
  const c = normalizeCreative(raw && typeof raw === 'object' ? raw : {});
  return {
    finalUrl: clean(c.finalUrl, LIMITS.finalUrl + 50),
    businessName: clean(c.businessName, TEXT_CAP),
    images: refs(c.images, imageRef),
    logos: refs(c.logos, imageRef),
    videos: refs(c.videos, videoRef),
    headlines: texts(c.headlines, TEXT_CAP),
    longHeadline: clean(c.longHeadline, TEXT_CAP),
    descriptions: texts(c.descriptions, TEXT_CAP),
    options: cleanOptions(c.options),
    admin: cleanAdmin(c.admin),
  };
}

// validateCreative() on the cleaned content, with 'headlines.N' / 'options.customParams.N'
// keys pointing back at the box the client sent (empty boxes were dropped before checking).
export function fieldErrors(raw, cleaned) {
  const e = validateCreative(cleaned);
  const n = normalizeCreative(raw && typeof raw === 'object' ? raw : {});
  const kept = (items, keep) => items.map((x, i) => [keep(x), i]).filter(([k]) => k).map(([, i]) => i);
  const maps = {
    headlines: kept(n.headlines.slice(0, LIST_CAP), (s) => clean(s, TEXT_CAP)),
    descriptions: kept(n.descriptions.slice(0, LIST_CAP), (s) => clean(s, TEXT_CAP)),
    'options.customParams': kept(paramRows(n.options.customParams), typed),
  };
  return Object.fromEntries(Object.entries(e).map(([k, msg]) => {
    const m = /^(headlines|descriptions|options\.customParams)\.(\d+)$/.exec(k);
    return [m ? `${m[1]}.${maps[m[1]][Number(m[2])] ?? m[2]}` : k, msg];
  }));
}

export { EDIT_FORMATS };
// Only ads in EDIT_FORMATS open in the edit page.
export function assertDisplayAd(ad) {
  if (!EDIT_FORMATS.includes(ad?.format)) throw fail('Only display and video ads can be edited here', 404);
  return ad;
}

// The ads table's lines for a display ad: first headline, long headline, first description,
// with "+ N more" for the other headlines/descriptions, and the other images as "+ N images".
export function tableFieldsOf(creative) {
  const c = normalizeCreative(creative);
  const heads = c.headlines.map((s) => String(s).trim()).filter(Boolean);
  const descs = c.descriptions.map((s) => String(s).trim()).filter(Boolean);
  const lines = [
    [heads[0], Math.max(0, heads.length - 1)],
    [c.longHeadline.trim(), 0],
    [descs[0], Math.max(0, descs.length - 1)],
  ].filter(([t]) => t);
  const level = adStrength(c).level;
  return {
    headlines: lines.map(([t]) => t),
    extraCounts: lines.map(([, n]) => n),
    mediaCount: Math.max(0, c.images.length - 1),
    strength: TABLE_STRENGTHS.includes(level) ? level : null,
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export function summaryOf(c) {
  const heads = c.headlines.filter((s) => String(s).trim()).length;
  const descs = c.descriptions.filter((s) => String(s).trim()).length;
  return [plural(heads, 'headline'), plural(descs, 'description'), plural(c.images.length, 'image'), plural(c.logos.length, 'logo'), plural(c.videos.length, 'video')].join(' · ');
}

const FORMAT_KEYS = ['cta', 'promoText', 'pricePrefix', 'price', 'mainColor', 'accentColor', 'assetEnhancements', 'autoVideo', 'nativeFormats'];
const URL_KEYS = ['trackingTemplate', 'finalUrlSuffix', 'customParams', 'useMobileUrl', 'mobileUrl'];
const PARTS = [
  ['Final URL', (c) => c.finalUrl], ['Business name', (c) => c.businessName], ['Images', (c) => c.images],
  ['Logos', (c) => c.logos], ['Videos', (c) => c.videos], ['Headlines', (c) => c.headlines],
  ['Long headline', (c) => c.longHeadline], ['Descriptions', (c) => c.descriptions],
  ['Format options', (c) => FORMAT_KEYS.map((k) => c.options[k])], ['Ad URL options', (c) => URL_KEYS.map((k) => c.options[k])],
  ['Ad strength settings', (c) => c.admin],
];
// Stable JSON (sorted keys) so key order never counts as a change.
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
export function changedParts(before, after) {
  return PARTS.filter(([, get]) => stable(get(before)) !== stable(get(after))).map(([label]) => label);
}
const SETTINGS_PART = 'Ad strength settings';
const TEXT_PARTS = ['Headlines', 'Long headline', 'Descriptions'];

// What a save changes on the ads table row ({ eligibility, headlines, media, ... }). Only the
// columns whose content changed are rewritten, so edits made in the table itself survive an
// unrelated save. The thumbnail follows a new first image (or fills an empty one), and changed
// content goes back to review unless the page settings say to keep the status.
export function rowUpdates(row, before, next) {
  const parts = changedParts(before, next);
  const set = {};
  if (!parts.length) return set;
  const was = tableFieldsOf(before);
  const now = tableFieldsOf(next);
  if (TEXT_PARTS.some((p) => parts.includes(p))) Object.assign(set, { headlines: now.headlines, extraCounts: now.extraCounts });
  const isVideo = row.format === 'video';
  // "+ N images" on display ads, "+ N videos" on video ads.
  if (isVideo ? parts.includes('Videos') : parts.includes('Images')) set.mediaCount = isVideo ? Math.max(0, next.videos.length - 1) : now.mediaCount;
  if (isVideo && parts.includes('Videos')) set.videoTitle = next.videos[0]?.title || '';
  if (now.strength !== was.strength || before.admin?.strength !== next.admin?.strength) set.strength = now.strength;
  const first = next.images[0];
  const media = row.media?.url ? row.media : null;
  if (isVideo && media?.type === 'video') {
    // A video ad keeps its uploaded video as the thumbnail; removing it from the Videos list
    // moves the thumbnail to the next uploaded video, else the first image.
    const removed = before.videos.some((v) => v.url === media.url) && !next.videos.some((v) => v.url === media.url);
    if (removed) {
      const vid = next.videos.find((v) => v.url && !isYouTube(v.url));
      set.media = vid ? { url: vid.url, type: 'video', provider: 'asset' } : first ? { url: first.url, type: 'image', provider: 'asset' } : null;
    }
  } else if (first && first.url !== media?.url && (!media || first.url !== before.images[0]?.url)) {
    // No publicId: the file belongs to the library (or is a sample), never deleted for this ad.
    set.media = { url: first.url, type: 'image', provider: 'asset' };
    // A row that showed no picture yet gets this ad's image count along with its thumbnail.
    if (!media && !isVideo) set.mediaCount = now.mediaCount;
  }
  if (parts.some((p) => p !== SETTINGS_PART) && normalizeCreative(next).admin.afterSave === 'pending' && row.eligibility !== 'Pending') {
    Object.assign(set, { eligibility: 'Pending', reasons: ['Under review'] });
  }
  return set;
}

// Every headline / long headline / description the ads use, for the "Asset library" tab of the
// edit page's text ideas dialog: { text, ads } (how many ads use it), most used first. Saved edit
// page content counts; ads never opened there count with their table lines (search headlines
// and descriptions, complete lines only: not ones cut short with "…"). Texts over the length
// limit are left out, since the page couldn't use them.
export function textLibrary(ads, kind) {
  const max = TEXT_LIMIT[kind];
  if (!max) return [];
  const whole = (s) => !/(…|\.\.\.)\s*$/.test(String(s ?? ''));
  const found = new Map();
  for (const ad of list(ads)) {
    let texts = [];
    if (ad?.creative && typeof ad.creative === 'object') {
      const c = normalizeCreative(ad.creative);
      texts = kind === 'headline' ? c.headlines : kind === 'description' ? c.descriptions : [c.longHeadline];
    } else if (kind === 'headline') {
      texts = list(ad?.headlines).filter(whole);
    } else if (kind === 'description' && ad?.format === 'search') {
      texts = [ad.description].filter(whole);
    }
    const once = new Set(); // an ad counts once per text
    for (const raw of texts) {
      const t = clean(raw, TEXT_CAP);
      const key = t.toLowerCase();
      if (!t || [...t].length > max || once.has(key)) continue;
      once.add(key);
      const hit = found.get(key);
      if (hit) hit.ads += 1;
      else found.set(key, { text: t, ads: 1 });
    }
  }
  return [...found.values()].sort((a, b) => b.ads - a.ads || a.text.localeCompare(b.text)).slice(0, 500);
}

// ---------------- sample content ----------------
const SUGGESTED_HEADLINES = ['Fresh Seeds Every Season', 'Grow More With Less', 'Expert Garden Advice', 'Healthy Soil, Better Crops', 'Plan Your Best Harvest'];
const SUGGESTED_DESCRIPTIONS = [
  'Practical tips and quality supplies to help your garden thrive all year.',
  'From planting to harvest, find simple advice for healthier crops.',
  'Discover seeds, tools and know-how chosen for your local growing season.',
];
const SAMPLE_DESCRIPTION = 'Simple, practical ideas to help your crops and garden grow.';
const SAMPLE_TEXT = [
  {
    headlines: ['Latest Farming News', 'Smarter Soil Care', 'Seeds That Grow Strong', 'Plan Your Next Harvest', 'Garden Tools & Guides'],
    longHeadline: 'Boost Your Crop',
    descriptions: ['Farming news, seasonal guides and expert tips in one place.', 'Learn simple ways to improve soil health and grow better yields.'],
  },
  {
    headlines: ['Fresh Tips for Every Season', 'Grow Healthier Crops', 'Shop Seeds & Supplies', 'Boost Your Harvest Now', 'Trusted Farm Know-How'],
    longHeadline: 'Grow More Today',
    descriptions: ['Practical guides, seasonal tips and quality supplies for your farm.', 'Plan, plant and harvest with confidence using expert advice.'],
  },
];

function sceneRef(hue, variant, w, h, n = 1) {
  return sampleRef(sampleUrl(sceneFile(hue, variant, w, h)), `${VARIANTS[variant]}-${n}.svg`);
}
function logoRef(hue, n = 1) {
  return sampleRef(sampleUrl(logoFile(hue)), `leaf-badge-${n}.svg`);
}
const baseVariant = (hue) => Math.floor((Number(hue) || 0) / 60) % 6;
const hueOf = (ref) => parseSample(String(ref?.url || '').slice(SAMPLE_PREFIX.length))?.hue;
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

// `count` built-in library images for an ad (a run from the first wide 1.91:1 picture at or
// after a spot set by the ad's hue, so the ads table gets a wide thumbnail) and the logo
// closest to its hue. library: { images, logos } of ImageRefs with assetId (sampleLibrary).
export function pickSamples(library, hue, count) {
  const imgs = list(library?.images);
  if (!imgs.length) return null;
  const h = ((Number(hue) || 0) % 360 + 360) % 360;
  const spot = Math.floor((h / 360) * imgs.length);
  const wide = (r) => r.w && r.h && Math.abs(r.w / r.h - 1.91) < 0.05;
  const skip = imgs.findIndex((_, i) => wide(imgs[(spot + i) % imgs.length]));
  const start = spot + Math.max(0, skip);
  const images = Array.from({ length: Math.min(count, imgs.length) }, (_, i) => imgs[(start + i) % imgs.length]);
  const logos = list(library?.logos);
  const logo = logos.reduce((best, r) => (hueGap(hueOf(r) ?? 999, h) < hueGap(hueOf(best) ?? 999, h) ? r : best), logos[0]);
  return { images: images.map((r) => ({ ...r })), logos: logo ? [{ ...logo }] : [] };
}

// What the edit page starts from for an ad that was never edited there.
export function defaultCreative(ad, accountName, library = null) {
  const seen = new Set();
  const heads = [];
  for (const raw of list(ad.headlines)) {
    const s = clean(String(raw).replace(/\s*(…|\.\.\.)\s*$/, ''), LIMITS.headline).trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    heads.push(s);
    if (heads.length >= LIMITS.headlines) break;
  }
  if (!heads.length) heads.push('New headline');
  let longHeadline = '';
  for (const h of heads) {
    const next = longHeadline ? `${longHeadline}. ${h}` : h;
    if ([...next].length > LIMITS.longHeadline) break;
    longHeadline = next;
  }
  const hue = Number(ad.hue) || 0;
  const v = baseVariant(hue);
  const lib = pickSamples(library, hue, 4);
  const media = ad.media?.url && ad.media.type === 'image'
    ? [{ url: ad.media.url, w: 0, h: 0, bytes: 0, name: ad.media.url.split('/').pop().slice(0, 120) }]
    : lib?.images || [sceneRef(hue, v, 1200, 628), sceneRef(hue, (v + 1) % 6, 1200, 1200), sceneRef(hue, (v + 2) % 6, 1200, 628), sceneRef(hue, (v + 3) % 6, 960, 1200)];
  // A video ad's own uploaded video (ads table) is its first video.
  const ownVideo = ad.format === 'video' && ad.media?.url && ad.media.type === 'video'
    ? [{ url: ad.media.url, title: clean(ad.videoTitle, 100) || 'Video', own: true }]
    : [];
  return normalizeCreative({
    finalUrl: ad.displayUrl ? `https://${ad.displayUrl}` : 'https://www.example.com/',
    businessName: clean(accountName, LIMITS.businessName).trim(),
    images: media,
    logos: lib?.logos.length ? lib.logos : [logoRef(hue)],
    videos: ownVideo,
    headlines: heads,
    longHeadline,
    descriptions: [clean(ad.description, LIMITS.description) || SAMPLE_DESCRIPTION],
    admin: { suggestedHeadlines: SUGGESTED_HEADLINES, suggestedDescriptions: SUGGESTED_DESCRIPTIONS },
  });
}

// A complete sample display ad (8 images, 5 headlines, 2 descriptions, 1 logo) for the seed,
// with its pictures taken from the built-in library when one is given.
export function sampleCreative(ad, accountName, library = null) {
  const hue = Number(ad.hue) || 0;
  const pick = [...String(ad.name || '')].reduce((s, ch) => s + ch.charCodeAt(0), hue) % SAMPLE_TEXT.length;
  const t = SAMPLE_TEXT[pick];
  const v = [2, 0][pick]; // open on a bright field or orchard picture
  const shapes = [[0, 1200, 628], [1, 1200, 1200], [2, 1200, 628], [3, 960, 1200], [4, 1200, 675], [5, 1200, 800], [0, 1200, 1200], [1, 1200, 742]];
  const count = {};
  const lib = pickSamples(library, hue, shapes.length);
  const images = lib?.images || shapes.map(([dv, w, h], i) => {
    const variant = (v + dv) % 6;
    count[variant] = (count[variant] || 0) + 1;
    return sceneRef((hue + i * 23) % 360, variant, w, h, count[variant]);
  });
  return normalizeCreative({
    finalUrl: 'https://www.example.com/',
    businessName: clean(accountName, LIMITS.businessName).trim(),
    images,
    logos: lib?.logos.length ? lib.logos : [logoRef(hue)],
    videos: [],
    headlines: t.headlines,
    longHeadline: t.longHeadline,
    descriptions: t.descriptions,
    admin: { suggestedHeadlines: SUGGESTED_HEADLINES, suggestedDescriptions: SUGGESTED_DESCRIPTIONS },
  });
}

// The built-in library: every tab gets each common shape (1.91:1, 1:1, 16:9, 4:5, 3:2).
const SAMPLE_SIZES = [[1200, 628], [1200, 1200], [1200, 675], [960, 1200], [1200, 800]];
const SAMPLE_HUES = [95, 40, 200, 140, 25, 310, 170, 55, 230, 120, 15, 280, 80, 190, 35, 160, 260, 105, 45, 215, 130, 0, 250, 65];
// [source, how many, first variant, first size]
const SAMPLE_PLAN = [['suggested', 6, 0, 0], ['generated', 5, 2, 1], ['website', 5, 5, 2], ['stock', 8, 1, 3]];
export function sampleAssetDocs(now = Date.now()) {
  const docs = [];
  const named = {};
  let i = 0;
  for (const [source, n, vShift, sShift] of SAMPLE_PLAN) {
    for (let k = 0; k < n; k++, i++) {
      const variant = (k + vShift) % VARIANTS.length;
      const [w, h] = SAMPLE_SIZES[(k + sShift) % SAMPLE_SIZES.length];
      named[variant] = (named[variant] || 0) + 1;
      const ref = sceneRef(SAMPLE_HUES[i % SAMPLE_HUES.length], variant, w, h, named[variant]);
      docs.push({ kind: 'image', source, ...ref, provider: 'sample', type: 'image', createdAt: new Date(now - docs.length * 60e3) });
    }
  }
  [['suggested', 140], ['suggested', 30], ['website', 210]].forEach(([source, hue], k) => {
    docs.push({ kind: 'logo', source, ...logoRef(hue, k + 1), provider: 'sample', type: 'image', createdAt: new Date(now - docs.length * 60e3) });
  });
  return docs;
}

// Added once per database (a Setting records it), so items the admin deletes stay deleted.
// A database that already has the samples just gets the flag.
export async function ensureSampleAssets() {
  if (await Setting.exists({ key: 'sampleAssets' })) return;
  if (!(await Asset.exists({ provider: 'sample' }))) await Asset.insertMany(sampleAssetDocs());
  await Setting.updateOne({ key: 'sampleAssets' }, { $set: { value: { addedAt: new Date() } } }, { upsert: true });
}

// The built-in images and logos still in the library, newest first, as ImageRefs.
export async function sampleLibrary() {
  const docs = await Asset.find({ provider: 'sample', kind: { $in: ['image', 'logo'] } }).sort({ createdAt: -1, _id: -1 }).lean();
  const ref = (a) => ({ assetId: String(a._id), url: a.url, w: a.w || 0, h: a.h || 0, bytes: a.bytes || 0, name: a.name || '' });
  return { images: docs.filter((a) => a.kind === 'image').map(ref), logos: docs.filter((a) => a.kind === 'logo').map(ref) };
}

export const publicAsset = (a) => ({
  id: String(a._id), kind: a.kind, source: a.source, url: a.url, w: a.w ?? null, h: a.h ?? null,
  bytes: a.bytes ?? null, name: a.name || '', title: a.title || '', createdAt: a.createdAt,
});

// Check before deleting an uploaded file: true while any ad (its content or table thumbnail)
// or library item still uses it. Call it after saving the change that let go of the file.
export async function fileInUse(url) {
  if (!url) return false;
  const byAd = await Ad.exists({ $or: [{ 'creative.images.url': url }, { 'creative.logos.url': url }, { 'creative.videos.url': url }, { 'media.url': url }] });
  return !!(byAd || (await Asset.exists({ url })));
}

// ---------------- routes ----------------
export function registerCreative(app, { auth, adminOnly, upload, saveMedia, deleteMedia, getAccount }) {
  const handle = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e.expose || e.status) return res.status(e.status || 400).json({ error: e.message, ...(e.fields && { fields: e.fields }) });
      next(e);
    }
  };
  const log = (req, entry) => History.create({ user: req.session.user, ...entry });

  async function loadAd(id) {
    if (!isId(id)) throw fail('Ad not found', 404);
    const ad = await Ad.findById(id);
    if (!ad) throw fail('Ad not found', 404);
    assertDisplayAd(ad);
    const [camp, group] = await Promise.all([Campaign.findById(ad.campaignId).lean(), AdGroup.findById(ad.adGroupId).lean()]);
    return { ad, camp, group };
  }
  const publicAd = (ad, camp, group) => ({
    id: String(ad._id), name: ad.name, format: ad.format, adType: ad.adType, status: ad.status,
    eligibility: ad.eligibility, reasons: [...(ad.reasons || [])], campaign: camp?.name ?? '', campaignId: String(ad.campaignId),
    adGroup: group?.name ?? '', adGroupId: String(ad.adGroupId),
  });
  const currentCreative = async (ad) => (ad.creative
    ? normalizeCreative(ad.creative)
    : defaultCreative(ad, (await getAccount()).name, await sampleLibrary()));

  app.get('/api/ads/:id/creative', auth, handle(async (req, res) => {
    const { ad, camp, group } = await loadAd(req.params.id);
    // stored: false while the ad has only its starting content (never saved from the edit page).
    res.json({ ad: publicAd(ad, camp, group), creative: await currentCreative(ad), stored: !!ad.creative });
  }));

  // Picked images must come from the library (copied from its record), the built-in samples,
  // or already be on this ad; videos may also be YouTube links.
  async function resolveRefs(c, ad) {
    const ids = [...c.images, ...c.logos, ...c.videos].map((r) => r.assetId).filter(Boolean);
    const assets = new Map((ids.length ? await Asset.find({ _id: { $in: ids } }).lean() : []).map((a) => [String(a._id), a]));
    const known = new Map();
    for (const r of [...list(ad.creative?.images), ...list(ad.creative?.logos), ...list(ad.creative?.videos)]) if (r?.url) known.set(r.url, r);
    const mediaUrl = ad.media?.url;
    const resolve = (ref, kind) => {
      const noun = kind === 'logo' ? 'logos' : `${kind}s`;
      const reject = (msg) => {
        throw fail(msg, 400, { [noun]: msg });
      };
      const a = ref.assetId && assets.get(ref.assetId);
      if (a && a.kind === kind) {
        return kind === 'video'
          ? { assetId: ref.assetId, url: a.url, title: ref.title || clean(a.title || a.name, 100) || 'Video' }
          : { assetId: ref.assetId, url: a.url, w: a.w || 0, h: a.h || 0, bytes: a.bytes || 0, name: a.name || '' };
      }
      if (kind === 'video') {
        const yt = youTubeRef(ref);
        if (yt) return yt;
      }
      // Already on this ad (also when it has since been removed from the library): keep its copy.
      const old = known.get(ref.url);
      if (old) {
        return kind === 'video'
          ? { ...(old.assetId ? { assetId: old.assetId } : {}), url: old.url, title: clean(ref.title, 100) || clean(old.title, 100) || 'Video', ...(old.own ? { own: true } : {}) }
          : { ...(old.assetId ? { assetId: old.assetId } : {}), url: old.url, w: old.w || 0, h: old.h || 0, bytes: old.bytes || 0, name: clean(old.name, 120) };
      }
      if (kind !== 'video' && ref.url.startsWith(SAMPLE_PREFIX)) {
        const s = sampleRef(ref.url, ref.name);
        if (s) return s;
      }
      if (mediaUrl && ref.url === mediaUrl && ad.media?.type === (kind === 'video' ? 'video' : 'image')) {
        return kind === 'video'
          ? { url: ref.url, title: ref.title || clean(ad.videoTitle, 100) || 'Video', own: true }
          : { url: ref.url, w: ref.w, h: ref.h, bytes: ref.bytes, name: ref.name };
      }
      if (ref.assetId) reject(`One of the ${noun} is no longer in your asset library. Choose it again.`);
      reject(kind === 'video' ? YOUTUBE_HINT : `Choose ${noun} from your asset library`);
    };
    const all = (refsIn, kind) => {
      const seen = new Set();
      return refsIn.map((r) => resolve(r, kind)).filter((r) => !seen.has(r.url) && seen.add(r.url));
    };
    return { ...c, images: all(c.images, 'image'), logos: all(c.logos, 'logo'), videos: all(c.videos, 'video') };
  }

  app.put('/api/ads/:id/creative', auth, adminOnly, handle(async (req, res) => {
    const { ad, camp, group } = await loadAd(req.params.id);
    const body = req.body || {};
    if (!body.creative || typeof body.creative !== 'object' || Array.isArray(body.creative)) throw fail('Nothing to save');
    const fields = {};
    let name = ad.name;
    if (body.name !== undefined) {
      name = clean(body.name, TEXT_CAP);
      if (!name) fields.name = 'Enter an ad name';
      else if ([...name].length > NAME_MAX) fields.name = 'Ad name is too long';
    }
    const cleaned = cleanCreative(body.creative);
    Object.assign(fields, fieldErrors(body.creative, cleaned));
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Fix the highlighted fields', fields });
    const next = await resolveRefs(cleaned, ad);
    const after = validateCreative(next); // only counts can change after resolving (duplicates merged)
    if (Object.keys(after).length) return res.status(400).json({ error: 'Fix the highlighted fields', fields: after });

    const before = cleanCreative(await currentCreative(ad));
    const parts = changedParts(before, next);
    const oldName = ad.name;
    if (!parts.length && name === oldName) {
      return res.json({ changed: false, ad: publicAd(ad, camp, group), creative: normalizeCreative(before), stored: !!ad.creative });
    }
    ad.name = name;
    const prevMedia = ad.media?.url ? ad.toObject().media : null;
    const oldStatus = ad.eligibility;
    const set = rowUpdates({ media: prevMedia, eligibility: oldStatus, format: ad.format }, before, next);
    if (parts.length) {
      ad.creative = next;
      ad.markModified('creative');
      Object.assign(ad, set);
    }
    await ad.save();
    // An uploaded table thumbnail the new first image replaced: delete it unless something still uses it.
    const dropMedia = 'media' in set && prevMedia?.publicId ? prevMedia : null;
    if (dropMedia && !(await fileInUse(dropMedia.url))) await deleteMedia(dropMedia);
    const entityName = `${ad.name} (${camp?.name ?? ''})`;
    if (name !== oldName) await log(req, { level: 'Ad', entityName, column: 'Ad name', before: oldName, after: name });
    if (parts.length) {
      await log(req, {
        level: 'Ad', entityName, column: 'Ad assets', before: summaryOf(before), after: summaryOf(next), detail: `Changed: ${parts.join(', ')}`,
      });
    }
    if (dropMedia) {
      await log(req, { level: 'Ad', entityName, column: 'Media', before: `Custom ${dropMedia.type || 'image'}`, after: set.media?.type === 'video' ? 'Another video of the ad' : set.media ? 'First image of the ad' : 'No media' });
    }
    if (set.eligibility) await log(req, { level: 'Ad', entityName, column: 'Status', before: oldStatus || '', after: set.eligibility });
    res.json({ changed: true, ad: publicAd(ad, camp, group), creative: normalizeCreative(next), stored: true });
  }));

  // Read-only: the texts any ad uses (see textLibrary), for every signed-in user.
  app.get('/api/text-assets', auth, handle(async (req, res) => {
    const { kind } = req.query;
    if (!TEXT_KINDS.includes(kind)) throw fail('Unknown text kind');
    const ads = await Ad.find({}, { format: 1, headlines: 1, description: 1, creative: 1 }).lean();
    res.json({ kind, items: textLibrary(ads, kind) });
  }));

  // ---------------- asset library ----------------
  app.get('/api/assets', auth, handle(async (req, res) => {
    const { kind } = req.query;
    if (!ASSET_KINDS.includes(kind)) throw fail('Unknown asset kind');
    const items = await Asset.find({ kind }).sort({ createdAt: -1, _id: -1 }).limit(500).lean();
    res.json({ assets: items.map(publicAsset) });
  }));

  app.post('/api/assets', auth, adminOnly, upload.single('media'), handle(async (req, res) => {
    const { kind, source = 'upload' } = req.body || {};
    if (!ASSET_KINDS.includes(kind)) throw fail('Unknown asset kind');
    if (!ASSET_SOURCES.includes(source)) throw fail('Unknown asset source');
    const file = req.file;
    if (!file) throw fail('Choose a file');
    if (kind === 'video' ? !file.mimetype.startsWith('video/') : !file.mimetype.startsWith('image/')) {
      throw fail(kind === 'video' ? 'Choose a video (MP4, MOV or WEBM)' : 'Choose an image (JPG, PNG, GIF or WEBP)');
    }
    // The caps the edit page's guidelines show (logos are smaller than other images).
    if (file.size > MAX_BYTES[kind]) throw fail(`${kind === 'logo' ? 'Logos' : kind === 'video' ? 'Videos' : 'Images'} can be up to ${capLabel(MAX_BYTES[kind])}`, 413);
    const saved = await saveMedia(file);
    const dim = (v) => int(v, 1, 20000) || undefined; // optional; missing or bad -> unknown
    const name = clean(String(file.originalname || '').split(/[\\/]/).pop(), 120) || `${kind}.${saved.url.split('.').pop()}`;
    let doc;
    try {
      doc = await Asset.create({
        kind, source, url: saved.url, publicId: saved.publicId, provider: saved.provider, type: saved.type,
        w: dim(req.body.w), h: dim(req.body.h), bytes: file.size, name, title: kind === 'video' ? name : undefined,
      });
    } catch (e) {
      await deleteMedia(saved);
      throw e;
    }
    const label = { image: 'Image', logo: 'Logo', video: 'Video' }[kind];
    await log(req, { level: 'Asset library', entityName: name, column: `${label} added`, before: '', after: `${label} (${source})` });
    res.json({ asset: publicAsset(doc) });
  }));

  app.delete('/api/assets/:id', auth, adminOnly, handle(async (req, res) => {
    if (!isId(req.params.id)) throw fail('Asset not found', 404);
    const a = await Asset.findByIdAndDelete(req.params.id).lean();
    if (!a) throw fail('Asset not found', 404);
    // Ads keep their own copy of picked assets, so the file stays while any ad uses it.
    if (a.provider !== 'sample' && !(await fileInUse(a.url))) await deleteMedia(a);
    const label = { image: 'Image', logo: 'Logo', video: 'Video' }[a.kind] || 'Asset';
    await log(req, { level: 'Asset library', entityName: a.name || label, column: `${label} removed`, before: `${label} (${a.source})`, after: '(removed)' });
    res.json({ ok: true });
  }));
}
