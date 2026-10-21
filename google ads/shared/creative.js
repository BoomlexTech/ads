// Responsive display ad content (the edit page): limits, defaults, checks, and the ad
// strength / tips / checklist shown in the edit page's top bar. Used by client and server.

export const LIMITS = {
  finalUrl: 2048, businessName: 25, headline: 30, longHeadline: 90, description: 90,
  images: 15, logos: 5, videos: 5, headlines: 5, descriptions: 5,
  promoText: 30, price: 20, pricePrefix: 20, trackingTemplate: 2048, finalUrlSuffix: 2048, customParams: 8, paramKey: 16, paramValue: 250,
  tip: 150, tips: 10, suggestions: 10,
  ideaInput: 1500, // "Describe what you're advertising" in the text ideas dialog
};

// Upload caps by library kind (the server refuses anything bigger), the file types each takes,
// and the shapes the edit page recommends. Sizes are [width, height] in pixels; `least` is the
// smallest that still looks sharp (smaller files upload, but may look blurry).
export const MAX_BYTES = { image: 10 * 1024 * 1024, logo: 5120 * 1024, video: 50 * 1024 * 1024 };
export const FILE_TYPES = { image: 'JPG, PNG, GIF or WebP', logo: 'JPG, PNG, GIF or WebP', video: 'MP4, MOV or WebM' };
export const ASSET_GUIDES = {
  image: [
    { shape: 'Landscape (1.91:1)', best: [1200, 628], least: [600, 314] },
    { shape: 'Square (1:1)', best: [1200, 1200], least: [300, 300] },
    { shape: 'Portrait (4:5)', best: [960, 1200], least: [480, 600] },
  ],
  logo: [
    { shape: 'Square logo (1:1)', best: [1200, 1200], least: [128, 128], recommended: true },
    { shape: 'Landscape logo (4:1)', best: [1200, 300], least: [512, 128] },
  ],
};
// "5 MB" / "512 KB" for an upload cap.
export const capLabel = (n) => (n % 1048576 === 0 ? `${n / 1048576} MB` : `${Math.round(n / 1024)} KB`);

// Ads that open in the edit page: display and video / Demand Gen ads (built from images and
// text). Search ads are text-only and show their assets in the table's details dialog.
export const EDIT_FORMATS = ['display', 'video'];
export const STRENGTH_LEVELS =['Incomplete', 'Poor', 'Average', 'Good', 'Excellent'];
export const CHECK_KEYS = ['images', 'videos', 'headlines', 'descriptions'];
export const CHECK_STATES = ['auto', 'done', 'partial', 'empty'];
export const CTA_OPTIONS = [
  'Automated', 'Apply now', 'Book now', 'Contact us', 'Download', 'Get quote', 'Learn more',
  'Shop now', 'Sign up', 'Subscribe', 'Visit site',
];
export const PRICE_PREFIXES = ['', 'From', 'Up to', 'Average'];
// What saving does to the ad's status in the ads table: send it for review, or leave it.
export const AFTER_SAVE = ['pending', 'keep'];

export const blankCreative = () => ({
  finalUrl: '',
  businessName: '',
  images: [], // [{ assetId?, url, w, h, bytes, name }]
  logos: [],
  videos: [], // [{ assetId?, url, title }]
  headlines: [''],
  longHeadline: '',
  descriptions: [''],
  options: {
    cta: 'Automated', promoText: '', pricePrefix: '', price: '', mainColor: '', accentColor: '',
    // Additional format options: settings saved with the ad (on unless turned off).
    assetEnhancements: true, autoVideo: true, nativeFormats: true,
    trackingTemplate: '', finalUrlSuffix: '', customParams: [], useMobileUrl: false, mobileUrl: '',
  },
  admin: {
    strength: '', // '' = worked out from the content
    tips: [], // empty = automatic tips
    checklist: { images: 'auto', videos: 'auto', headlines: 'auto', descriptions: 'auto' },
    suggestedHeadlines: [],
    suggestedDescriptions: [],
    afterSave: 'pending',
  },
});

// Fill in anything missing so the page never has to guard against holes.
export function normalizeCreative(c) {
  const b = blankCreative();
  const x = c || {};
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    ...b,
    ...x,
    images: list(x.images),
    logos: list(x.logos),
    videos: list(x.videos),
    headlines: list(x.headlines).length ? list(x.headlines).map(String) : b.headlines,
    descriptions: list(x.descriptions).length ? list(x.descriptions).map(String) : b.descriptions,
    finalUrl: String(x.finalUrl ?? ''),
    businessName: String(x.businessName ?? ''),
    longHeadline: String(x.longHeadline ?? ''),
    options: { ...b.options, ...(x.options || {}), customParams: list(x.options?.customParams) },
    admin: {
      ...b.admin,
      ...(x.admin || {}),
      tips: list(x.admin?.tips),
      checklist: { ...b.admin.checklist, ...(x.admin?.checklist || {}) },
      suggestedHeadlines: list(x.admin?.suggestedHeadlines),
      suggestedDescriptions: list(x.admin?.suggestedDescriptions),
      afterSave: AFTER_SAVE.includes(x.admin?.afterSave) ? x.admin.afterSave : b.admin.afterSave,
    },
  };
}

export function isUrl(s) {
  try {
    const u = new URL(String(s || '').trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && /\.[a-z]{2,}$/i.test(u.hostname);
  } catch {
    return false;
  }
}

// Text as the server stores it: one line, runs of spaces collapsed.
export const normText = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const filled = (list) => (list || []).map(normText).filter(Boolean);
const len = (s) => [...String(s ?? '')].length;

// YouTube links in their usual shapes (watch?…v=, youtu.be/, shorts/, embed/, m./music. hosts).
export function youTubeId(url) {
  let u;
  try {
    u = new URL(String(url || '').trim());
  } catch {
    return '';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = '';
  if (host === 'youtu.be') id = u.pathname.split('/')[1] || '';
  else if (host === 'youtube.com') {
    id = u.pathname === '/watch' ? u.searchParams.get('v') || '' : (/^\/(shorts|embed|live)\/([^/]+)/.exec(u.pathname) || [])[2] || '';
  }
  return /^[\w-]{11}$/.test(id) ? id : '';
}
export const isYouTube = (url) => !!youTubeId(url);
// A video the ad can use: from the library (assetId), a YouTube link, or the video ad's own
// uploaded video (own: true, kept as it was uploaded from the ads table).
export const videoRefOk = (v) => !!(v?.assetId || v?.own === true || isYouTube(v?.url));
export const youTubeUrl = (url) => `https://www.youtube.com/watch?v=${youTubeId(url)}`;

// Problems that block saving, keyed by field ('headlines.2' = the third headline).
export function validateCreative(c) {
  const e = {};
  const url = normText(c.finalUrl);
  if (!url) e.finalUrl = 'Enter a final URL';
  else if (!isUrl(url) || len(url) > LIMITS.finalUrl) e.finalUrl = 'Enter a valid URL, like https://www.example.com';
  const bn = normText(c.businessName);
  if (!bn) e.businessName = 'Enter your business name';
  else if (len(bn) > LIMITS.businessName) e.businessName = 'Business name is too long';
  if (!c.images?.length) e.images = 'Add at least 1 image';
  else if (c.images.length > LIMITS.images) e.images = `You can add up to ${LIMITS.images} images`;
  if ((c.logos?.length || 0) > LIMITS.logos) e.logos = `You can add up to ${LIMITS.logos} logos`;
  if ((c.videos?.length || 0) > LIMITS.videos) e.videos = `You can add up to ${LIMITS.videos} videos`;
  else if ((c.videos || []).some((v) => !videoRefOk(v))) e.videos = 'Use a YouTube link, like https://www.youtube.com/watch?v=…';
  const textList = (key, max, each, noun) => {
    const list = c[key] || [];
    if (!filled(list).length) e[key] = `Add at least 1 ${noun}`;
    if (list.length > max) e[key] = `You can add up to ${max} ${noun}s`;
    list.forEach((s, i) => {
      if (len(normText(s)) > each) e[`${key}.${i}`] = `${noun[0].toUpperCase()}${noun.slice(1)} is too long`;
    });
    const seen = new Map();
    list.forEach((s, i) => {
      const k = normText(s).toLowerCase();
      if (!k) return;
      if (seen.has(k)) e[`${key}.${i}`] = `This ${noun} is a duplicate`;
      else seen.set(k, i);
    });
  };
  textList('headlines', LIMITS.headlines, LIMITS.headline, 'headline');
  textList('descriptions', LIMITS.descriptions, LIMITS.description, 'description');
  const lh = normText(c.longHeadline);
  if (!lh) e.longHeadline = 'Enter a long headline';
  else if (len(lh) > LIMITS.longHeadline) e.longHeadline = 'Long headline is too long';
  const o = c.options || {};
  if (o.useMobileUrl && !isUrl(o.mobileUrl)) e['options.mobileUrl'] = 'Enter a valid URL, like https://m.example.com';
  // Checked as the server stores it (spaces at the ends dropped), so a pasted space doesn't block Save.
  const tt = normText(o.trackingTemplate);
  if (tt && !/^(https?:\/\/|\{lpurl)/i.test(tt)) e['options.trackingTemplate'] = 'Start with {lpurl} or a URL';
  for (const k of ['mainColor', 'accentColor']) {
    if (o[k] && !/^#[0-9a-f]{6}$/i.test(o[k])) e[`options.${k}`] = 'Use a hex color, like #1A73E8';
  }
  if (len(normText(o.promoText)) > LIMITS.promoText) e['options.promoText'] = 'Promotion text is too long';
  if (len(normText(o.price)) > LIMITS.price) e['options.price'] = 'Price is too long';
  const params = o.customParams || [];
  if (params.length > LIMITS.customParams) e['options.customParams'] = `You can add up to ${LIMITS.customParams} custom parameters`;
  const keys = new Set();
  params.forEach((p, i) => {
    const key = String(p?.key ?? '').trim();
    const value = normText(p?.value);
    if (!key && !value) return;
    if (!key) e[`options.customParams.${i}`] = 'Enter a parameter name';
    else if (!/^[a-z0-9_]{1,16}$/i.test(key)) e[`options.customParams.${i}`] = 'Use up to 16 letters, numbers or underscores';
    else if (keys.has(key.toLowerCase())) e[`options.customParams.${i}`] = 'This parameter name is already used';
    else if (!value) e[`options.customParams.${i}`] = 'Enter a value';
    else if (len(value) > LIMITS.paramValue) e[`options.customParams.${i}`] = 'Value is too long';
    keys.add(key.toLowerCase());
  });
  // Admin-only page settings: a list of lines each, with its own caps.
  const a = c.admin || {};
  const lines = (key, list, max, noun) => {
    const l = filled(list);
    if (l.length > LIMITS.suggestions) e[`admin.${key}`] = `Use at most ${LIMITS.suggestions} ${noun}s`;
    else if (l.some((s) => len(s) > max)) e[`admin.${key}`] = `Keep each ${noun} to ${max} characters or fewer`;
  };
  lines('tips', a.tips, LIMITS.tip, 'tip');
  lines('suggestedHeadlines', a.suggestedHeadlines, LIMITS.headline, 'headline');
  lines('suggestedDescriptions', a.suggestedDescriptions, LIMITS.description, 'description');
  return e;
}

// Ad strength, the tips the top bar steps through, and the 4 checklist marks.
// Admin overrides (creative.admin) win over the worked-out values.
export function adStrength(c) {
  const imgs = c.images?.length || 0;
  const logos = c.logos?.length || 0;
  const vids = c.videos?.length || 0;
  const heads = filled(c.headlines);
  const descs = filled(c.descriptions);
  const lh = len(normText(c.longHeadline));

  const missing = [];
  if (!isUrl(c.finalUrl)) missing.push('Add a final URL');
  if (!normText(c.businessName)) missing.push('Add your business name');
  if (!imgs) missing.push('Add at least 1 image');
  if (!heads.length) missing.push('Add at least 1 headline');
  if (!lh) missing.push('Add a long headline');
  if (!descs.length) missing.push('Add at least 1 description');

  const unique = (l) => new Set(l.map((s) => s.toLowerCase())).size === l.length;
  const score = Math.min(imgs, 5) * 6 + heads.length * 5 + descs.length * 4 + (logos ? 10 : 0) + (vids ? 10 : 0) + (lh >= 30 ? 5 : 0);
  let level = 'Poor';
  if (missing.length) level = 'Incomplete';
  else if (score >= 90) level = 'Excellent';
  else if (score >= 65) level = 'Good';
  else if (score >= 40) level = 'Average';

  const tips = missing.length ? missing : [
    lh < 30 && 'Your long headline is a little short. Aim for at least 30 characters.',
    imgs < 5 && 'Add more images. Ads with 5 or more images can show in more places.',
    heads.length < 5 && 'Add more headlines. Aim for 5 different headlines.',
    !unique(heads) && 'Make your headlines more unique.',
    descs.length < 5 && 'Add more descriptions. Aim for 5 different descriptions.',
    !logos && 'Add a logo so people recognize your business.',
    !vids && 'Add a video to show your ad in more formats.',
  ].filter(Boolean);
  if (!tips.length) tips.push('Your ad has everything it needs to perform well.');

  const mark = (n, full) => (n >= full ? 'done' : n > 0 ? 'partial' : 'empty');
  const auto = {
    images: mark(imgs, 5),
    videos: vids ? 'done' : 'empty',
    headlines: mark(heads.length, 5),
    descriptions: mark(descs.length, 5),
  };
  const a = c.admin || {};
  const checklist = Object.fromEntries(CHECK_KEYS.map((k) => {
    const o = a.checklist?.[k];
    return [k, o && o !== 'auto' ? o : auto[k]];
  }));
  return {
    level: STRENGTH_LEVELS.includes(a.strength) ? a.strength : level,
    autoLevel: level,
    tips: filled(a.tips).length ? filled(a.tips) : tips,
    autoTips: tips,
    checklist,
    autoChecklist: auto,
  };
}

// "Horizontal (16:9)" style label for an image's shape.
const RATIOS = [[1.91, '1.91:1'], [16 / 9, '16:9'], [3 / 2, '3:2'], [4 / 3, '4:3'], [1, '1:1'], [4 / 5, '4:5'], [3 / 4, '3:4'], [2 / 3, '2:3'], [9 / 16, '9:16'], [4, '4:1']];
export function aspectLabel(w, h) {
  if (!w || !h) return '';
  const r = w / h;
  const hit = RATIOS.find(([v]) => Math.abs(v - r) / v < 0.02);
  const label = hit ? hit[1] : `${r.toFixed(2).replace(/0$/, '')}:1`;
  const shape = Math.abs(r - 1) < 0.02 ? 'Square' : r > 1 ? 'Horizontal' : 'Vertical';
  return `${shape} (${label})`;
}

export function fmtBytes(n) {
  if (!n) return '';
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

// The host shown in previews ("example.com" from "https://www.example.com/shop").
export function displayHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// ---------- "Test" in Ad URL options ----------

// The addresses a click would use, worked out here from the ad's URL options (nothing is
// opened or requested): the landing page (final URL + final URL suffix) and, with a tracking
// template, the tracking URL ({lpurl} = the landing page). {_name} custom parameters are filled
// in; placeholders only known at click time ({device}, {network}...) stay as they are and are
// listed in `pending`. { error } when the URL to test isn't valid.
export function testUrls(c, { mobile = false } = {}) {
  const o = c?.options || {};
  const values = new Map();
  for (const p of o.customParams || []) {
    const k = String(p?.key ?? '').trim().toLowerCase();
    const v = normText(p?.value);
    if (k && v && !values.has(k)) values.set(k, v);
  }
  const fill = (s) => s.replace(/\{_([a-z0-9_]+)\}/gi, (m, k) => (values.has(k.toLowerCase()) ? encodeURIComponent(values.get(k.toLowerCase())) : m));
  const base = normText(mobile ? o.mobileUrl : c?.finalUrl);
  if (!isUrl(base)) return { error: mobile ? 'Enter a valid mobile final URL first' : 'Enter a valid final URL first' };
  let landing = fill(base);
  const suffix = fill(normText(o.finalUrlSuffix)).replace(/^[?&]+/, '');
  if (suffix) {
    const hash = landing.indexOf('#');
    const head = hash >= 0 ? landing.slice(0, hash) : landing;
    const frag = hash >= 0 ? landing.slice(hash) : '';
    const join = !head.includes('?') ? '?' : /[?&]$/.test(head) ? '' : '&';
    landing = `${head}${join}${suffix}${frag}`;
  }
  let tracking = '';
  const tpl = normText(o.trackingTemplate);
  if (tpl) {
    // {lpurl} at the very start stays readable; anywhere else it's escaped, like a query value.
    // One pass with a function, so the landing page goes in as it is: a "$&" or "{lpurl}" in it
    // is never read as a replacement pattern or filled in again.
    tracking = fill(tpl).replace(/\{(unescaped|escaped)?lpurl\}/gi, (m, how, at) => (
      (how ? how.toLowerCase() === 'unescaped' : at === 0) ? landing : encodeURIComponent(landing)));
  }
  const pending = [...new Set(`${landing} ${tracking}`.match(/\{[^{}\s]+\}/g) || [])];
  return { landing, tracking, pending };
}

// ---------- Text ideas ("More ideas" > Generated) ----------

// Headline, long headline and description ideas built only from the advertiser's own words:
// what they typed, the business name, the final URL's domain and the ad's current headlines.
// Fixed templates, no AI service, and nothing the advertiser didn't say (no prices, offers or
// "best"-style claims). The same input always gives the same ideas.
export const TEXT_KINDS = ['headline', 'longHeadline', 'description'];
export const TEXT_LIMIT = { headline: LIMITS.headline, longHeadline: LIMITS.longHeadline, description: LIMITS.description };

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'with']);
// Words trimmed off the ends of a phrase ("We sell organic seeds." -> "organic seeds").
const EDGE_WORDS = new Set([...SMALL_WORDS, 'we', 'our', 'ours', 'us', 'you', 'your', 'yours', 'i', 'my', 'me', 'they', 'their', 'it', 'its',
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'that', 'this', 'these', 'those', 'which', 'who', 'what', 'will', 'can', 'could',
  'should', 'would', 'may', 'might', 'do', 'does', 'did', 'have', 'has', 'had', 'so', 'also', 'just', 'very', 'all', 'any', 'some',
  'more', 'most', 'other', 'than', 'then', 'there', 'here', 'about', 'like', 'such', 'if', 'when', 'while', 'where', 'how', 'why',
  'not', 'no', 'only', 'offer', 'offers', 'sell', 'sells', 'provide', 'provides', 'make', 'makes', 'get', 'gets']);
// Where a clause splits into smaller phrases ("seeds and tools for home gardens").
const SPLIT_WORDS = new Set(['and', 'or', '&', 'for', 'with', 'from', 'by', 'that', 'which', 'who', 'so', 'because', 'while']);
const ACTION_WORDS = new Set(['apply', 'book', 'buy', 'call', 'choose', 'contact', 'discover', 'download', 'explore', 'find', 'grow', 'join',
  'learn', 'order', 'read', 'save', 'see', 'shop', 'sign', 'start', 'subscribe', 'try', 'visit', 'watch']);
// A comma right before a digit ("1,000") stays in its number.
const CLAUSE = /[.!?]+(?=\s|$)|[;:\n\r•|()[\]]+|,(?!\p{N})\s*/u;
// A word keeps the signs that are part of what was said: "30%", "$20", "20€", "50+", "#1", "1,000".
const WORD = /[#\p{Sc}]?[\p{L}\p{N}](?:(?:[\p{L}\p{N}'’&+./%\p{Sc}-]|,(?=\p{N}))*[\p{L}\p{N}%+\p{Sc}])?|&/gu;

// "AI", "iPhone" and other words with their own capitals keep them.
const ownCaps = (w) => /\p{Lu}/u.test(w.slice(1)) || (w.length <= 4 && w === w.toUpperCase() && /\p{L}/u.test(w));
const capital = (w) => (ownCaps(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
const titleCase = (words) => words.map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : capital(w))).join(' ');
const sentence = (s) => {
  const t = normText(s);
  if (!t) return '';
  const first = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
};

// Phrases from free text: each clause trimmed of filler words, plus its parts around "and",
// "for", "with"... `start` = the phrase opens its clause (so its first capital is only the
// sentence's, and can be lowered mid-sentence).
function phrasesOf(text) {
  const out = [];
  const seen = new Set();
  const add = (words, start) => {
    let a = 0;
    let b = words.length;
    while (a < b && EDGE_WORDS.has(words[a].toLowerCase())) a += 1;
    while (b > a && EDGE_WORDS.has(words[b - 1].toLowerCase())) b -= 1;
    const w = words.slice(a, b);
    const key = w.join(' ').toLowerCase();
    if (!w.length || w.length > 8 || seen.has(key)) return;
    seen.add(key);
    out.push({ words: w, start: start && a === 0 });
  };
  for (const clause of String(text || '').split(CLAUSE)) {
    const words = clause.match(WORD) || [];
    if (!words.length) continue;
    add(words, true);
    let part = [];
    let at = 0;
    words.forEach((w, i) => {
      if (SPLIT_WORDS.has(w.toLowerCase())) {
        if (part.length < words.length) add(part, at === 0);
        part = [];
        at = i + 1;
      } else part.push(w);
    });
    if (part.length < words.length) add(part, at === 0);
  }
  return out;
}

// Whole clauses of the typed text as sentences ("organic seeds for home gardens" ->
// "Organic seeds for home gardens.").
const clausesOf = (text) => String(text || '').split(/[.!?]+(?=\s|$)|[;\n\r•|]+/).map(sentence).filter((s) => s.split(' ').length >= 3);

export function textIdeas({ kind = 'headline', description = '', businessName = '', finalUrl = '', headlines = [], exclude = [], max = 12 } = {}) {
  const limit = TEXT_LIMIT[kind] || LIMITS.headline;
  const biz = normText(businessName);
  const host = displayHost(normText(finalUrl));
  const phrases = phrasesOf(description).slice(0, 12).map(({ words, start }) => {
    const inner = [...words];
    // Lower the sentence-start capital ("Organic seeds" -> "organic seeds") unless the word has its own.
    if (start && !ownCaps(inner[0])) inner[0] = inner[0].toLowerCase();
    const first = words[0].toLowerCase();
    return {
      P: titleCase(words),
      p: inner.join(' '),
      // Starts with a verb ("Delivered to your door"), so "Discover ..." style templates don't fit.
      act: ACTION_WORDS.has(first) || (first.length > 4 && /(ed|ing)$/.test(first)),
      has: (w) => ` ${words.join(' ').toLowerCase()} `.includes(` ${w} `),
    };
  });
  const heads = (headlines || []).map(normText).filter(Boolean);
  const per = [];
  const extra = [];
  if (kind === 'headline') {
    per.push(
      ({ P }) => P,
      ({ P, act }) => !act && `Discover ${P}`,
      ({ P, has }) => biz && !has('by') && `${P} by ${biz}`,
      ({ P, act }) => !act && `Explore ${P}`,
      ({ P, has }) => !has('for') && `${P} for You`,
      ({ P, act }) => !act && `Find ${P}`,
      ({ P, act }) => !act && `Choose ${P}`,
    );
    extra.push(biz && `Discover ${biz}`, biz && `Choose ${biz}`, host && `Visit ${host}`);
  } else if (kind === 'longHeadline') {
    per.push(
      ({ P, has }) => biz && !has('from') && `${P} from ${biz}`,
      ({ p, act, has }) => biz && !act && !has('with') && `Discover ${p} with ${biz}`,
      ({ p, act, has }) => host && !act && !has('at') && `Explore ${p} at ${host}`,
      ({ P, has }) => host && !has('at') && `${P} at ${host}`,
    );
    extra.push(...clausesOf(description).map((s) => s.replace(/\.$/, '')));
    for (let i = 0; i + 1 < heads.length; i++) extra.push(`${heads[i]}. ${heads[i + 1]}`);
    extra.push(...heads.map((h) => biz && `${h} with ${biz}`));
  } else {
    per.push(
      ({ p, act, has }) => biz && !act && !has('with') && `Discover ${p} with ${biz}.`,
      ({ p, act }) => host && !act && `Learn more about ${p} at ${host}.`,
      ({ p, act }) => biz && host && !act && `${biz} brings you ${p}. Visit ${host} to find out more.`,
      ({ p, act }) => !act && `Looking for ${p}? Find out more today.`,
    );
    const clauses = clausesOf(description);
    extra.push(...clauses);
    for (let i = 0; i + 1 < clauses.length; i++) extra.push(`${clauses[i]} ${clauses[i + 1]}`);
    for (let i = 0; i + 1 < heads.length; i++) extra.push(`${heads[i]}. ${heads[i + 1]}.`);
  }
  // Round robin, so the first ideas use different templates and different phrases.
  const cands = [];
  for (let r = 0; r < per.length; r++) phrases.forEach((ph, i) => cands.push(per[(r + i) % per.length](ph)));
  // Clauses of the typed text first for descriptions (they're the advertiser's own sentences).
  const ordered = kind === 'description' ? [...extra.slice(0, 3), ...cands, ...extra.slice(3)] : [...cands, ...extra];
  const used = new Set((exclude || []).map((s) => normText(s).toLowerCase()).filter(Boolean));
  const out = [];
  for (const raw of ordered) {
    if (typeof raw !== 'string') continue; // a template that didn't apply
    const t = normText(raw);
    const k = t.toLowerCase();
    if (!t || len(t) < 3 || len(t) > limit || used.has(k)) continue;
    used.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
