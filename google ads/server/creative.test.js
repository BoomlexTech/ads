import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanCreative, fieldErrors, tableFieldsOf, sampleCreative, defaultCreative, changedParts, summaryOf,
  youTubeRef, assertDisplayAd, rowUpdates, sampleAssetDocs, pickSamples, textLibrary,
} from './creative.js';
import { sampleSvg, parseSample, sceneFile, logoFile, VARIANTS } from './samples.js';
import {
  adStrength, normalizeCreative, aspectLabel, LIMITS, textIdeas, testUrls, TEXT_LIMIT, MAX_BYTES, capLabel, validateCreative,
} from '../shared/creative.js';

const img = (n, extra) => ({ url: `/api/sample/scene-10-${n % 6}-1200x628.svg`, w: 1200, h: 628, bytes: 1000, name: `a-${n}.svg`, ...extra });

// Tags balance, attributes are quoted, and nothing active or external slips in.
function assertWellFormedSvg(svg) {
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(svg, /NaN|undefined|Infinity|<script|\son\w+=|href=|url\((?!#)/i);
  const stack = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g;
  let pos = 0;
  let m;
  while ((m = tag.exec(svg))) {
    assert.equal(svg.slice(pos, m.index).trim(), '', `stray text before ${m[0].slice(0, 40)}`);
    pos = tag.lastIndex;
    if (m[1]) assert.equal(stack.pop(), m[2], `closing </${m[2]}>`);
    else if (!m[4]) stack.push(m[2]);
  }
  assert.equal(pos, svg.length, 'unparsed tail');
  assert.deepEqual(stack, []);
}

test('cleanCreative keeps only the stored shape with tidy text', () => {
  const c = cleanCreative({
    finalUrl: '  https://www.example.com/  ',
    businessName: 'Demo\n  Farm',
    headlines: ['  Fresh   seeds ', '', '   ', 'Grow\tmore'],
    descriptions: ['', 'Good soil, good crops.'],
    longHeadline: 'Grow  more today',
    images: [img(1, { assetId: 'nope', extra: 'x' }), { url: '' }, { url: 'java script:x' }],
    videos: [{ url: 'https://youtu.be/abcdefg', title: '  My\nclip ' }],
    options: {
      cta: 'Buy everything', pricePrefix: 'Up to', mainColor: '#1a73e8', accentColor: 'red', nativeFormats: false,
      customParams: [{ key: 'season', value: ' spring ' }, { key: '', value: '  ' }, { key: 'bad key', value: 'x' }, { key: '', value: 'y' }],
      useMobileUrl: 'yes',
    },
    admin: { strength: 'Great', tips: ['a', '', 'b'.repeat(200)], checklist: { images: 'done', videos: 'weird' }, afterSave: 'later' },
    surprise: true,
  });
  assert.equal(c.finalUrl, 'https://www.example.com/');
  assert.equal(c.businessName, 'Demo Farm');
  assert.deepEqual(c.headlines, ['Fresh seeds', 'Grow more']);
  assert.deepEqual(c.descriptions, ['Good soil, good crops.']);
  assert.equal(c.longHeadline, 'Grow more today');
  assert.deepEqual(c.images, [{ url: img(1).url, w: 1200, h: 628, bytes: 1000, name: 'a-1.svg' }]);
  assert.deepEqual(c.videos, [{ url: 'https://youtu.be/abcdefg', title: 'My clip' }]);
  assert.equal(c.options.cta, 'Automated');
  assert.equal(c.options.pricePrefix, 'Up to');
  assert.equal(c.options.mainColor, '#1A73E8');
  assert.equal(c.options.accentColor, '');
  assert.equal(c.options.nativeFormats, false);
  assert.equal(c.options.useMobileUrl, false);
  // Rows with a name or a value are kept (and checked); wholly empty rows are dropped.
  assert.deepEqual(c.options.customParams, [{ key: 'season', value: 'spring' }, { key: 'bad key', value: 'x' }, { key: '', value: 'y' }]);
  assert.equal(c.admin.strength, '');
  assert.equal(c.admin.tips.length, 2);
  assert.equal(c.admin.tips[1].length, 200, 'not cut: reported by validation instead');
  assert.deepEqual(c.admin.checklist, { images: 'done', videos: 'auto', headlines: 'auto', descriptions: 'auto' });
  assert.equal(c.admin.afterSave, 'pending');
  assert.equal(cleanCreative({ admin: { afterSave: 'keep' } }).admin.afterSave, 'keep');
  assert.equal('surprise' in c, false);
});

test('fieldErrors points at the boxes the client sent', () => {
  const raw = { ...sampleCreative({ hue: 10, name: 'x' }, 'Demo'), headlines: ['One', '', 'one', 'x'.repeat(31)] };
  const e = fieldErrors(raw, cleanCreative(raw));
  assert.equal(e['headlines.2'], 'This headline is a duplicate');
  assert.equal(e['headlines.3'], 'Headline is too long');
  const empty = cleanCreative({});
  assert.deepEqual(Object.keys(fieldErrors({}, empty)).sort(), ['businessName', 'descriptions', 'finalUrl', 'headlines', 'images', 'longHeadline']);
});

test('extra spaces count the same on client and server', () => {
  const raw = { ...sampleCreative({ hue: 10, name: 'x' }, 'Demo'), headlines: ['Fresh  seeds', 'Fresh seeds', `${'x'.repeat(15)}   ${'y'.repeat(14)}`] };
  const e = fieldErrors(raw, cleanCreative(raw));
  assert.equal(e['headlines.1'], 'This headline is a duplicate');
  assert.equal(e['headlines.2'], undefined, '30 characters once the spaces are collapsed');
});

test('over-limit text is reported, never silently cut or dropped', () => {
  const base = sampleCreative({ hue: 10, name: 'x' }, 'Demo');
  const raw = {
    ...base,
    options: {
      ...base.options,
      promoText: 'Free delivery on every order this whole week',
      price: '1234567890123456789012345',
      customParams: [{ key: 'ok', value: 'v' }, { key: '', value: '' }, { key: '', value: 'summer' }, { key: 'a b', value: 'x' }, { key: 'OK', value: 'w' }],
    },
    admin: {
      ...base.admin,
      tips: ['t'.repeat(LIMITS.tip + 1)],
      suggestedHeadlines: Array.from({ length: LIMITS.suggestions + 2 }, (_, i) => `Headline ${i}`),
      suggestedDescriptions: ['d'.repeat(LIMITS.description + 5)],
    },
  };
  const c = cleanCreative(raw);
  assert.equal(c.options.promoText, raw.options.promoText);
  assert.equal(c.options.price, raw.options.price);
  assert.equal(c.admin.suggestedHeadlines.length, LIMITS.suggestions + 2);
  const e = fieldErrors(raw, c);
  assert.equal(e['options.promoText'], 'Promotion text is too long');
  assert.equal(e['options.price'], 'Price is too long');
  // Indexes are the rows on the page (the empty row 1 counts).
  assert.equal(e['options.customParams.0'], undefined);
  assert.equal(e['options.customParams.2'], 'Enter a parameter name');
  assert.match(e['options.customParams.3'], /letters, numbers or underscores/);
  assert.equal(e['options.customParams.4'], 'This parameter name is already used');
  assert.ok(e['admin.tips']);
  assert.ok(e['admin.suggestedHeadlines']);
  assert.ok(e['admin.suggestedDescriptions']);
  const many = { ...base, options: { ...base.options, customParams: Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, value: 'v' })) } };
  assert.ok(fieldErrors(many, cleanCreative(many))['options.customParams']);
});

test('YouTube links in their usual forms are stored as one watch link; others are reported', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`, `https://m.youtube.com/watch?v=${id}`, `http://www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/watch?feature=shared&v=${id}`, `https://youtu.be/${id}?t=1:20`, `https://youtu.be/${id}?si=abc`,
    `https://WWW.YOUTUBE.COM/watch?v=${id}#t=10`, `https://www.youtube.com/shorts/${id}`,
  ]) {
    assert.deepEqual(youTubeRef({ url, title: '' }), { url: `https://www.youtube.com/watch?v=${id}`, title: 'YouTube video' }, url);
  }
  assert.equal(youTubeRef({ url: `https://www.youtube.com/watch?v=${id}`, title: ' My\nclip ' }).title, 'My clip');
  for (const url of ['https://vimeo.com/12345', `https://youtube.com.evil.test/watch?v=${id}`, 'https://youtu.be/short', 'javascript:alert(1)', '']) {
    assert.equal(youTubeRef({ url }), null, url);
  }
  const base = sampleCreative({ hue: 10, name: 'x' }, 'Demo');
  const raw = { ...base, videos: [{ url: 'https://vimeo.com/12345', title: 'Clip' }] };
  assert.match(fieldErrors(raw, cleanCreative(raw)).videos, /YouTube link/);
  const ok = { ...base, videos: [{ url: `https://m.youtube.com/watch?v=${id}`, title: 'Clip' }] };
  assert.equal(fieldErrors(ok, cleanCreative(ok)).videos, undefined);
});

test('display and video ads open in the edit page, search ads do not', () => {
  assert.equal(assertDisplayAd({ format: 'display' }).format, 'display');
  assert.equal(assertDisplayAd({ format: 'video' }).format, 'video');
  for (const ad of [{ format: 'search' }, {}, null]) {
    assert.throws(() => assertDisplayAd(ad), (e) => e.status === 404 && /Only display and video ads/.test(e.message));
  }
});

test('a save rewrites only the table columns whose content changed', () => {
  const before = cleanCreative(sampleCreative({ hue: 220, name: 'Ad #1' }, 'Demo'));
  const custom = { url: '/uploads/custom.png', publicId: 'custom.png', type: 'image', provider: 'local' };
  const row = { media: custom, eligibility: 'Eligible' };

  const urlOnly = rowUpdates(row, before, { ...before, finalUrl: 'https://www.example.org/' });
  assert.deepEqual(urlOnly, { eligibility: 'Pending', reasons: ['Under review'] }, 'table lines and thumbnail untouched');

  const heads = rowUpdates(row, before, { ...before, headlines: ['New first line', ...before.headlines.slice(1)] });
  assert.deepEqual(heads.headlines, ['New first line', before.longHeadline, before.descriptions[0]]);
  assert.equal('media' in heads, false, 'custom thumbnail kept');
  assert.equal('mediaCount' in heads, false);

  const more = rowUpdates(row, before, { ...before, images: [...before.images, { url: '/api/sample/logo-1.svg', w: 1, h: 1, bytes: 1, name: 'x' }] });
  assert.equal(more.mediaCount, 8);
  assert.equal('media' in more, false, 'first image unchanged');

  const swapped = [before.images[1], before.images[0], ...before.images.slice(2)];
  assert.deepEqual(rowUpdates(row, before, { ...before, images: swapped }).media, { url: swapped[0].url, type: 'image', provider: 'asset' });
  // No thumbnail yet: it (and the image count) follows the first image on any save.
  const filled = rowUpdates({ eligibility: 'Eligible' }, before, { ...before, finalUrl: 'https://www.example.org/' });
  assert.equal(filled.media.url, before.images[0].url);
  assert.equal(filled.mediaCount, 7);
  assert.equal('headlines' in filled, false);
  // Strength follows a pinned level, or a computed one that moved.
  assert.equal(rowUpdates(row, before, { ...before, admin: { ...before.admin, strength: 'Excellent' } }).strength, 'Excellent');
  assert.equal('strength' in heads, false);
});

test('changed content goes back to review unless the page settings say to keep the status', () => {
  const before = cleanCreative(sampleCreative({ hue: 220, name: 'Ad #1' }, 'Demo'));
  const row = { media: { url: before.images[0].url }, eligibility: 'Not eligible' };
  const edited = { ...before, longHeadline: 'Grow more with every season' };
  assert.deepEqual(rowUpdates(row, before, edited), {
    headlines: [before.headlines[0], edited.longHeadline, before.descriptions[0]], extraCounts: [4, 0, 1],
    eligibility: 'Pending', reasons: ['Under review'],
  });
  const keep = { ...edited, admin: { ...before.admin, afterSave: 'keep' } };
  assert.equal('eligibility' in rowUpdates(row, { ...before, admin: keep.admin }, keep), false);
  assert.equal('eligibility' in rowUpdates({ ...row, eligibility: 'Pending' }, before, edited), false, 'already pending');
  const settingsOnly = { ...before, admin: { ...before.admin, tips: ['Try a longer headline'] } };
  assert.deepEqual(rowUpdates(row, before, settingsOnly), {}, 'page settings alone are not sent for review');
  assert.deepEqual(rowUpdates(row, before, before), {});
});

test('built-in library: every tab has a mix of shapes, and ads are seeded from it', () => {
  const docs = sampleAssetDocs(Date.UTC(2026, 0, 1));
  const images = docs.filter((d) => d.kind === 'image');
  assert.equal(new Set(images.map((d) => d.url)).size, images.length, 'no repeats');
  for (const source of ['suggested', 'generated', 'website', 'stock']) {
    const labels = new Set(images.filter((d) => d.source === source).map((d) => aspectLabel(d.w, d.h)));
    for (const want of ['Horizontal (1.91:1)', 'Square (1:1)', 'Horizontal (16:9)', 'Vertical (4:5)', 'Horizontal (3:2)']) {
      assert.ok(labels.has(want), `${source} has ${want}`);
    }
  }
  assert.equal(docs.filter((d) => d.kind === 'logo').length, 3);
  for (const d of docs) assert.equal(parseSample(d.url.split('/').pop()) !== null, true, d.url);

  const ref = (d, i) => ({ assetId: `65f0000000000000000000${String(i).padStart(2, '0')}`, url: d.url, w: d.w, h: d.h, bytes: d.bytes, name: d.name });
  const library = { images: images.map(ref), logos: docs.filter((d) => d.kind === 'logo').map(ref) };
  for (const hue of [220, 140]) {
    const c = sampleCreative({ hue, name: 'Ad #1' }, 'Demo', library);
    assert.equal(c.images.length, 8);
    assert.ok(c.images.every((r) => r.assetId && library.images.some((x) => x.url === r.url)), 'library refs');
    assert.equal(aspectLabel(c.images[0].w, c.images[0].h), 'Horizontal (1.91:1)', 'wide picture first, for the table');
    assert.ok(new Set(c.images.map((r) => aspectLabel(r.w, r.h))).size >= 3);
    assert.equal(c.logos.length, 1);
    assert.ok(c.logos[0].assetId);
    assert.deepEqual(tableFieldsOf(c).mediaCount, 7);
  }
  assert.equal(sampleCreative({ hue: 140, name: 'x' }, 'Demo', library).logos[0].url, '/api/sample/logo-140.svg', 'closest hue');
  const d = defaultCreative({ hue: 220, headlines: ['Grow'] }, 'Demo', library);
  assert.equal(d.images.length, 4);
  assert.ok(d.images.every((r) => r.assetId));
  assert.equal(d.logos[0].url, '/api/sample/logo-210.svg');
  for (let hue = 0; hue < 360; hue += 7) {
    const first = defaultCreative({ hue, headlines: ['Grow'] }, 'Demo', library).images[0];
    assert.equal(aspectLabel(first.w, first.h), 'Horizontal (1.91:1)', `hue ${hue}`);
  }
  assert.deepEqual(defaultCreative({ hue: 0, headlines: [], media: { url: '/uploads/a.png', type: 'image' } }, 'Demo', library).images.map((r) => r.url), ['/uploads/a.png']);
  assert.equal(pickSamples({ images: [], logos: [] }, 10, 4), null);
});

test('tableFieldsOf gives the ads table lines, counts and strength', () => {
  const c = sampleCreative({ hue: 220, name: 'Ad #1' }, 'Demo Account');
  assert.deepEqual(tableFieldsOf(c), {
    headlines: [c.headlines[0], c.longHeadline, c.descriptions[0]],
    extraCounts: [4, 0, 1],
    mediaCount: 7,
    strength: 'Good',
  });
  const small = normalizeCreative({ headlines: ['Only'], longHeadline: '', descriptions: ['  '], images: [] });
  assert.deepEqual(tableFieldsOf(small), { headlines: ['Only'], extraCounts: [0], mediaCount: 0, strength: null });
  const pinned = normalizeCreative({ ...c, admin: { strength: 'Excellent' } });
  assert.equal(tableFieldsOf(pinned).strength, 'Excellent');
});

test('default content for an ad that was never edited', () => {
  const d = defaultCreative({ hue: 30, headlines: ['Grow …', 'Harvest...', 'grow', 'Seeds'], displayUrl: 'www.example.com/crops' }, 'A very long account name for testing');
  assert.equal(d.finalUrl, 'https://www.example.com/crops');
  assert.equal(d.businessName, 'A very long account name');
  assert.deepEqual(d.headlines, ['Grow', 'Harvest', 'Seeds']);
  assert.equal(d.longHeadline, 'Grow. Harvest. Seeds');
  assert.equal(d.images.length, 4);
  assert.equal(d.logos.length, 1);
  assert.ok(d.admin.suggestedHeadlines.every((s) => s.length <= 30));
  assert.ok(d.admin.suggestedDescriptions.every((s) => s.length <= 90));
  const withMedia = defaultCreative({ hue: 0, headlines: [], media: { url: '/uploads/abc.png', type: 'image' } }, 'Demo');
  assert.deepEqual(withMedia.headlines, ['New headline']);
  assert.deepEqual(withMedia.images.map((i) => i.url), ['/uploads/abc.png']);
});

test('changedParts and summaryOf describe a save', () => {
  const a = sampleCreative({ hue: 220, name: 'Ad #1' }, 'Demo');
  const b = { ...a, finalUrl: 'https://www.example.org/', images: a.images.slice(1), options: { ...a.options, cta: 'Shop now' } };
  assert.deepEqual(changedParts(a, b), ['Final URL', 'Images', 'Format options']);
  assert.deepEqual(changedParts(a, JSON.parse(JSON.stringify(a))), []);
  assert.equal(summaryOf(a), '5 headlines · 2 descriptions · 8 images · 1 logo · 0 videos');
});

test('sample file names: valid ones render, anything else is refused', () => {
  assert.deepEqual(parseSample('scene-120-3-1200x628.svg'), { kind: 'scene', hue: 120, variant: 3, w: 1200, h: 628 });
  assert.deepEqual(parseSample('scene-0-0-99999x5.svg'), { kind: 'scene', hue: 0, variant: 0, w: 2400, h: 16 });
  assert.equal(parseSample('logo-359.svg').kind, 'logo');
  for (const bad of ['scene-360-0-10x10.svg', 'scene-1-6-10x10.svg', 'scene-01-0-10x10.svg', 'scene-1-0-0x10.svg', 'logo-400.svg',
    'logo-1.png', '../logo-1.svg', 'scene-1-0-10x10.svg.html', 'x.svg', '']) {
    assert.equal(sampleSvg(bad), null, bad);
  }
  assert.equal(sceneFile(370, 2, 960, 1200), 'scene-10-2-960x1200.svg');
  assert.equal(logoFile(-20), 'logo-340.svg');
});

test('sample artwork is well-formed SVG for every variant and shape', () => {
  for (let v = 0; v < VARIANTS.length; v++) {
    for (const [w, h] of [[1200, 628], [1200, 1200], [960, 1200], [16, 2400]]) {
      const svg = sampleSvg(sceneFile(v * 61, v, w, h));
      assertWellFormedSvg(svg);
      assert.match(svg, new RegExp(`width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"`));
      assert.equal(sampleSvg(sceneFile(v * 61, v, w, h)), svg, 'deterministic');
    }
  }
  assertWellFormedSvg(sampleSvg(logoFile(140)));
});

test('ad strength: 8 images, 5 headlines, 2 descriptions, 1 logo, short long headline -> Good', () => {
  const c = normalizeCreative({
    finalUrl: 'https://www.example.com/', businessName: 'Demo',
    images: Array.from({ length: 8 }, (_, i) => img(i)), logos: [img(9)], videos: [],
    headlines: ['One', 'Two', 'Three', 'Four', 'Five'], longHeadline: 'Boost Your Crop', descriptions: ['First line', 'Second line'],
  });
  assert.equal(c.longHeadline.length, 15);
  const s = adStrength(c);
  assert.equal(s.level, 'Good');
  assert.match(s.tips[0], /long headline/i);
  assert.deepEqual(s.checklist, { images: 'done', videos: 'empty', headlines: 'done', descriptions: 'partial' });
});

test('a video ad keeps its uploaded video: it starts in the Videos list and survives unrelated saves', () => {
  const vid = { url: '/uploads/clip.mp4', type: 'video', publicId: 'clip' };
  const ad = { format: 'video', name: 'Ad 1', headlines: ['Fresh seeds'], hue: 30, media: vid, videoTitle: 'Harvest clip' };
  const start = cleanCreative(defaultCreative(ad, 'Demo'));
  assert.deepEqual(start.videos, [{ url: vid.url, title: 'Harvest clip', own: true }]);
  assert.deepEqual(fieldErrors(start, start).videos, undefined);

  // A text-only save and a new first image leave the video thumbnail alone.
  const row = { media: vid, eligibility: 'Eligible', format: 'video' };
  const text = { ...start, headlines: ['Fresh seeds', 'Grow more'] };
  assert.equal('media' in rowUpdates(row, start, text), false);
  const pics = { ...start, images: [{ url: '/api/sample/scene-1-0-1200x628.svg', w: 1200, h: 628, bytes: 0, name: 'x' }, ...start.images] };
  assert.equal('media' in rowUpdates(row, start, pics), false);

  // Removing the video from the list moves the thumbnail to the first image.
  const gone = { ...start, videos: [] };
  assert.deepEqual(rowUpdates(row, start, gone).media, { url: start.images[0].url, type: 'image', provider: 'asset' });
  assert.equal(rowUpdates(row, start, gone).videoTitle, '');
  // "+ N videos" follows the Videos list.
  const more = { ...start, videos: [...start.videos, { url: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'Y' }] };
  assert.equal(rowUpdates(row, start, more).mediaCount, 1);

  // Someone else's video URL is not accepted as "own" unless it is in the ad already.
  assert.ok(fieldErrors({ ...start, videos: [{ url: '/uploads/other.mp4', title: 'x' }] }, cleanCreative({ ...start, videos: [{ url: '/uploads/other.mp4', title: 'x' }] })).videos);
});

test('a search ad starting description is built from its headlines and fits the editor limit', async () => {
  const { startingDescription, DESCRIPTION_MAX } = await import('./seed.js');
  assert.equal(startingDescription(['Fresh seeds', 'Grow more']), 'Grow more. Fresh seeds. Fresh seeds…');
  assert.equal(startingDescription([]), '');
  const long = startingDescription(Array(10).fill('x'.repeat(90)));
  assert.equal(long.length, DESCRIPTION_MAX);
  assert.ok(long.endsWith('…'));
});

test('additional format options are kept (on unless turned off) and count as format changes', () => {
  const on = cleanCreative({});
  assert.deepEqual([on.options.assetEnhancements, on.options.autoVideo, on.options.nativeFormats], [true, true, true]);
  const off = cleanCreative({ options: { assetEnhancements: false, autoVideo: false, nativeFormats: 'yes' } });
  assert.deepEqual([off.options.assetEnhancements, off.options.autoVideo, off.options.nativeFormats], [false, false, true]);
  const a = cleanCreative(sampleCreative({ hue: 220, name: 'Ad #1' }, 'Demo'));
  assert.deepEqual(changedParts(a, { ...a, options: { ...a.options, autoVideo: false } }), ['Format options']);
  // Content saved before these options existed reads them as on, so it doesn't count as changed.
  const old = JSON.parse(JSON.stringify(a));
  delete old.options.assetEnhancements;
  delete old.options.autoVideo;
  assert.deepEqual(changedParts(cleanCreative(old), a), []);
});

test('upload caps: logos up to 5 MB, other images 10 MB, videos 50 MB', () => {
  assert.equal(capLabel(MAX_BYTES.logo), '5 MB');
  assert.equal(capLabel(MAX_BYTES.image), '10 MB');
  assert.equal(capLabel(MAX_BYTES.video), '50 MB');
  assert.equal(capLabel(300 * 1024), '300 KB');
});

test('text library: every text any ad uses, counted once per ad, most used first', () => {
  const ads = [
    { format: 'display', creative: { headlines: ['Fresh Seeds', 'Grow More', 'fresh  seeds'], longHeadline: 'Grow more every season', descriptions: ['Seeds and tips.'] } },
    { format: 'display', creative: { headlines: ['Fresh seeds', 'x'.repeat(31)], longHeadline: '', descriptions: ['Seeds and tips.', ''] } },
    { format: 'search', headlines: ['Soil Testing Made Easy', 'Book A Free Visit'], description: 'Order a soil test today.' },
    { format: 'search', headlines: [], description: 'Book A Free Visit. Soil Testing Made Easy…' },
    { format: 'video', headlines: ['Subscribe', 'Boost Your Poor cr…', 'Knowledge...'] },
  ];
  assert.deepEqual(textLibrary(ads, 'headline'), [
    { text: 'Fresh Seeds', ads: 2 },
    { text: 'Book A Free Visit', ads: 1 },
    { text: 'Grow More', ads: 1 },
    { text: 'Soil Testing Made Easy', ads: 1 },
    { text: 'Subscribe', ads: 1 },
  ], 'too-long and cut-short lines are left out');
  assert.deepEqual(textLibrary(ads, 'longHeadline'), [{ text: 'Grow more every season', ads: 1 }]);
  assert.deepEqual(textLibrary(ads, 'description'), [{ text: 'Seeds and tips.', ads: 2 }, { text: 'Order a soil test today.', ads: 1 }]);
  assert.deepEqual(textLibrary(ads, 'images'), []);
  assert.deepEqual(textLibrary(null, 'headline'), []);
});

test('text ideas: built from the advertiser’s words, within the limits, no repeats, no made-up claims', () => {
  const input = {
    description: 'We sell organic vegetable seeds and garden tools for home gardens. Advice from local growers; Delivered to your door.',
    businessName: 'Green Valley Farms',
    finalUrl: 'https://www.greenvalley.example/shop',
    headlines: ['Fresh Seeds Every Season', 'Grow More With Less'],
  };
  const words = (s) => s.toLowerCase().match(/[\p{L}\p{N}.]+/gu).map((w) => w.replace(/\.$/, ''));
  const typed = new Set(words(`${input.description} ${input.businessName} greenvalley.example ${input.headlines.join(' ')}`));
  const templateWords = new Set(['discover', 'explore', 'find', 'choose', 'you', 'by', 'from', 'with', 'at', 'learn', 'more', 'about',
    'brings', 'visit', 'to', 'out', 'looking', 'for', 'today', 'and']);
  for (const kind of ['headline', 'longHeadline', 'description']) {
    const ideas = textIdeas({ kind, ...input });
    assert.ok(ideas.length >= 6, `${kind}: ${ideas.length} ideas`);
    assert.ok(ideas.length <= 12);
    assert.deepEqual(textIdeas({ kind, ...input }), ideas, 'same input, same ideas');
    assert.equal(new Set(ideas.map((s) => s.toLowerCase())).size, ideas.length, 'no repeats');
    for (const idea of ideas) {
      assert.ok([...idea].length <= TEXT_LIMIT[kind], `${kind} fits: ${idea}`);
      assert.doesNotMatch(idea, /\bfree\b|\bbest\b|%|\$|\d|\bsale\b|\bdiscount/i, idea);
      for (const w of words(idea)) assert.ok(typed.has(w) || templateWords.has(w), `"${w}" in "${idea}" comes from the input or a template`);
    }
  }
  const heads = textIdeas({ kind: 'headline', ...input });
  assert.ok(heads.includes('Organic Vegetable Seeds'));
  assert.ok(!heads.some((h) => /^(Discover|Explore|Find|Choose) Delivered/.test(h)), 'verb phrases are not wrapped in a call to action');
  assert.ok(!textIdeas({ kind: 'headline', ...input, exclude: ['organic vegetable seeds'] }).includes('Organic Vegetable Seeds'), 'excluded');
  assert.ok(textIdeas({ kind: 'description', ...input })[0].startsWith('We sell organic vegetable seeds'), 'own sentences first');
  assert.deepEqual(textIdeas({ kind: 'headline' }), [], 'nothing typed, nothing made up');
  assert.equal(textIdeas({ kind: 'headline', ...input, max: 3 }).length, 3);
});

test('URL test: landing page and tracking URL built from the URL options, without opening anything', () => {
  const c = {
    finalUrl: 'https://www.example.com/shop?x=1#top',
    options: {
      finalUrlSuffix: '?src={_season}&b=2',
      trackingTemplate: '{lpurl}?id=5&next={lpurl}&d={device}',
      customParams: [{ key: 'season', value: 'early spring' }, { key: '', value: 'ignored' }],
      useMobileUrl: true,
      mobileUrl: 'https://m.example.com/',
    },
  };
  const r = testUrls(c);
  assert.equal(r.landing, 'https://www.example.com/shop?x=1&src=early%20spring&b=2#top');
  assert.equal(r.tracking, `${r.landing}?id=5&next=${encodeURIComponent(r.landing)}&d={device}`);
  assert.deepEqual(r.pending, ['{device}']);
  assert.equal(testUrls(c, { mobile: true }).landing, 'https://m.example.com/?src=early%20spring&b=2');
  assert.deepEqual(testUrls({ finalUrl: 'https://example.com', options: {} }), { landing: 'https://example.com', tracking: '', pending: [] });
  assert.equal(testUrls({ finalUrl: 'https://example.com/a?', options: { finalUrlSuffix: 'k=v' } }).landing, 'https://example.com/a?k=v');
  assert.equal(testUrls({ finalUrl: 'https://example.com/', options: { finalUrlSuffix: 'k={_nope}' } }).pending[0], '{_nope}');
  assert.match(testUrls({ finalUrl: 'not a url', options: {} }).error, /valid final URL/);
  assert.match(testUrls({ finalUrl: 'https://example.com', options: {} }, { mobile: true }).error, /mobile final URL/);
});

test('text ideas keep the advertiser’s percent and currency signs, so the offer reads as typed', () => {
  const b = { businessName: 'Green Leaf', finalUrl: 'https://www.greenleaf.example/' };
  const all = (description) => ['headline', 'longHeadline', 'description'].flatMap((kind) => textIdeas({ kind, description, ...b }));
  const heads = textIdeas({ kind: 'headline', description: '30% off garden tools', ...b });
  assert.ok(heads.includes('30% Off Garden Tools'), heads.join(' | '));
  assert.ok(heads.includes('Discover 30% Off Garden Tools'), heads.join(' | '));
  assert.ok(!all('30% off garden tools').some((s) => /(^|\s)30 off/i.test(s)), 'never "30 off"');
  assert.ok(textIdeas({ kind: 'headline', description: '$20 off your first order', ...b }).includes('$20 Off Your First Order'));
  assert.ok(!all('$20 off your first order').some((s) => /(^|\s)20 off/i.test(s)), 'never "20 off"');
  assert.ok(textIdeas({ kind: 'longHeadline', description: 'Up to 50% off organic seeds', ...b }).includes('Up to 50% Off Organic Seeds from Green Leaf'));
  assert.ok(textIdeas({ kind: 'description', description: '30% off garden tools this week', ...b }).includes('Discover 30% off garden tools this week with Green Leaf.'));
  const mixed = all('Save $1,000 on 20€ kits, 50+ varieties');
  assert.ok(mixed.some((s) => s.includes('$1,000')) && mixed.some((s) => s.includes('20€')) && mixed.some((s) => s.includes('50+')), mixed.join(' | '));
  assert.ok(!mixed.some((s) => /(^|\s)000\b|(^|\s)\$?1 |(^|\s)50 Varieties/i.test(s)), 'numbers are not cut apart');
});

test('URL test puts the landing page into the tracking URL as typed, even with "$" in it', () => {
  const t = (finalUrl, trackingTemplate) => testUrls({ finalUrl, options: { trackingTemplate } }).tracking;
  assert.equal(t('https://www.example.com/p?tag=$$', '{lpurl}&id=1'), 'https://www.example.com/p?tag=$$&id=1');
  assert.equal(t('https://www.example.com/p?a=$&b=1', '{lpurl}&id=1'), 'https://www.example.com/p?a=$&b=1&id=1');
  const odd = "https://www.example.com/p?a=$'x$`";
  assert.equal(t(odd, 'https://t.example/?u={unescapedlpurl}&e={escapedlpurl}&l={lpurl}'),
    `https://t.example/?u=${odd}&e=${encodeURIComponent(odd)}&l=${encodeURIComponent(odd)}`);
  assert.equal(t('https://www.example.com/p?x={lpurl}', '{lpurl}&id=1'), 'https://www.example.com/p?x={lpurl}&id=1', 'filled in once');
  assert.equal(t('https://www.example.com/p', '{LPURL}?x={lpurl}'), `https://www.example.com/p?x=${encodeURIComponent('https://www.example.com/p')}`);
});

test('a tracking template with spaces at the ends is checked as it will be stored', () => {
  const err = (trackingTemplate) => validateCreative(normalizeCreative({ options: { trackingTemplate } }))['options.trackingTemplate'];
  assert.equal(err(' https://t.example.com/?u={lpurl}'), undefined);
  assert.equal(err('\t{lpurl}?id=1 '), undefined);
  assert.equal(err('   '), undefined, 'only spaces is the same as empty');
  assert.equal(err(' t.example.com/?u={lpurl}'), 'Start with {lpurl} or a URL');
  // The server stores the trimmed value and agrees with the page.
  const raw = { options: { trackingTemplate: ' https://t.example.com/?u={lpurl}' } };
  const cleaned = cleanCreative(raw);
  assert.equal(cleaned.options.trackingTemplate, 'https://t.example.com/?u={lpurl}');
  assert.equal(fieldErrors(raw, cleaned)['options.trackingTemplate'], undefined);
});
