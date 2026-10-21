import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';
import { BRAND } from '../shared/brand.js';
import { textIdeas, testUrls } from '../shared/creative.js';

// Display ad edit page, second part: the guideline cards and "Learn more" links (Quick help
// events), the suggested images card, the text ideas dialog ("More ideas"), additional format
// options, Ad URL options with Test, the honest image dialog tabs, and viewers' controls doing nothing.

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
}

const editPage = (page) => page.getByTestId('ad-edit');
const box = (page, name) => editPage(page).getByRole('textbox', { name, exact: true });
const rowOf = (page, id) => page.locator(`[data-testid=ad-row][data-id="${id}"]`);
const toast = (page) => page.locator('.toast');

// Opens the edit page from the pencil on a display ad row (the first one, or the ad `id`).
async function openEdit(page, id) {
  const r = id ? rowOf(page, id) : page.getByTestId('ad-row').filter({ has: page.locator('td.c-camp', { hasText: 'Leads-Display-1' }) }).first();
  const adId = id || (await r.getAttribute('data-id'));
  await r.hover();
  await r.getByTestId('edit-ad').click();
  await expect(page).toHaveURL(new RegExp(`/aw/ads/edit/display/${adId}/${BRAND.slug}$`));
  await expect(box(page, 'Final URL')).toBeVisible();
  return adId;
}

async function saveAd(page) {
  await page.getByTestId('save-ad').click();
  await expect(editPage(page)).toHaveCount(0);
  await expect(toast(page)).toHaveText('Your ad was saved');
}

async function creativeOf(page, id) {
  const res = await page.request.get(`/api/ads/${id}/creative`);
  expect(res.ok()).toBe(true);
  return (await res.json()).creative;
}

// Records the Quick help and feedback requests the page sends (window events).
async function watchEvents(page) {
  await page.evaluate(() => {
    window.__events = [];
    for (const type of ['app:help', 'app:feedback']) window.addEventListener(type, (e) => window.__events.push({ type, ...e.detail }));
  });
}
const lastEvent = async (page) => (await page.evaluate(() => window.__events)).at(-1);

// Every write (POST / PUT / PATCH / DELETE) the page sends to the API from now on.
function watchWrites(page) {
  const writes = [];
  page.on('request', (r) => {
    const { pathname } = new URL(r.url());
    if (r.method() !== 'GET' && pathname.startsWith('/api/')) writes.push(`${r.method()} ${pathname}`);
  });
  return writes;
}

// Every toast text the page shows from now on (a MutationObserver keeps short-lived ones too).
async function watchToasts(page) {
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.toast')) window.__toasts.push(el.textContent);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}
const toasts = (page) => page.evaluate(() => window.__toasts);
const helpTopics = async (page) => (await page.evaluate(() => window.__events)).filter((e) => e.type === 'app:help').map((e) => e.topic);

// True when nothing covers the element: it's what shows at the middle of its top edge.
const onTop = (loc) => loc.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 24)));
});

// Quick help opened from inside a dialog: in view above it on the right topic, the dialog still
// open; then closed with its own X (a click that only works when nothing covers the panel).
async function expectHelpOverDialog(page, dlg, topic) {
  const help = page.getByTestId('quick-help');
  await expect(help.getByTestId('qh-article')).toHaveAttribute('data-topic', topic);
  expect(await onTop(help)).toBe(true);
  await expect(dlg).toBeVisible();
  await help.getByRole('button', { name: 'Close Quick help' }).click();
  await expect(help).toHaveCount(0);
  await expect(dlg).toBeVisible();
}

async function expectThumbs(page, n) {
  const thumbs = editPage(page).getByTestId('image-thumbs');
  await expect(thumbs.locator(':scope > img')).toHaveCount(Math.min(n, 6));
  if (n > 6) await expect(thumbs.locator('.ae-more-tile')).toHaveText(`+${n - 6}`);
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('guideline cards and every Learn more on the page open the right Quick help topic', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await openEdit(page);
  await watchEvents(page);
  const card = editPage(page).locator('.ae-hp-card');

  await editPage(page).getByRole('button', { name: 'About logos' }).click();
  await expect(card).toContainText('Logo guidelines');
  for (const t of ['Square logo (1:1) (recommended)', 'Recommended size: 1200 × 1200 pixels', '128 × 128 pixels',
    'Landscape logo (4:1)', '1200 × 300 pixels', '512 × 128 pixels', 'Largest file: 5 MB']) {
    await expect(card).toContainText(t);
  }
  await card.getByRole('button', { name: 'Learn more' }).click();
  await expect(card).toHaveCount(0);
  expect(await lastEvent(page)).toEqual({ type: 'app:help', topic: 'logos' });

  await editPage(page).getByRole('button', { name: 'About images' }).click();
  await expect(card).toContainText('Image guidelines');
  await expect(card).toContainText('Landscape (1.91:1)');
  await expect(card).toContainText('Largest file: 10 MB');
  await expect(card).toContainText('up to 15 per ad');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);

  await editPage(page).getByRole('button', { name: 'About videos' }).click();
  await expect(card).toContainText('Up to 5 videos per ad');
  await expect(card).toContainText('MP4, MOV or WebM, up to 50 MB');
  await card.getByRole('button', { name: 'Learn more' }).click();

  await editPage(page).locator('section[data-field=images] .ae-sub').getByRole('button', { name: 'Learn more' }).click();
  await editPage(page).locator('.ae-notes').getByRole('button', { name: 'Learn more' }).click();
  await page.getByTestId('strength-bar').getByRole('button', { name: 'About ad strength' }).click();
  await page.getByTestId('strength-bar').locator('.ae-hp-card').getByRole('button', { name: 'Learn more' }).click();
  await editPage(page).getByRole('button', { name: 'About headlines' }).click();
  await card.getByRole('button', { name: 'Learn more' }).click();
  expect(await helpTopics(page)).toEqual(['logos', 'videos', 'images', 'ad-versions', 'ad-strength', 'headlines']);
  // No dead "#" links are left on the page.
  await expect(editPage(page).locator('a[href="#"]')).toHaveCount(0);
});

test('suggested images: captions, enlarge and select, hide one, view more, hide the card and show it again', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const before = await creativeOf(page, id);
  await watchEvents(page);
  const sg = editPage(page).getByTestId('suggested-images');
  await expect(sg.locator('.ae-sg-title')).toHaveText('Suggested images');
  const items = sg.locator('.ae-sg-item');
  expect(await items.count()).toBeGreaterThan(1);
  const captions = await sg.locator('.ae-sg-cap').allInnerTexts();
  // (A caption starts with its icon's name, e.g. "lightbulb", then the label.)
  for (const c of captions) expect(['Suggested', 'From a website', 'Generated'].some((w) => c.trim().endsWith(w))).toBe(true);

  // Hovering shows Enlarge, the menu and Select; Select in the enlarged view adds the image.
  const first = items.first();
  await first.hover();
  await expect(first.getByRole('button', { name: /^Select/ })).toBeVisible();
  await first.getByRole('button', { name: /^Enlarge/ }).click();
  const zoom = page.getByTestId('image-zoom');
  await expect(zoom).toBeVisible();
  await zoom.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(zoom).toHaveCount(0);
  await expectThumbs(page, before.images.length + 1);
  const left = await items.count();

  // One image's menu: hide it, then the card's menu offers to show it again.
  await items.first().hover();
  await items.first().getByRole('button', { name: /^More options for/ }).click();
  await sg.locator('.ae-sg-imenu').getByRole('button', { name: 'Hide this image' }).click();
  await expect(items).toHaveCount(left - 1);
  const menuBtn = sg.getByRole('button', { name: 'Suggested images options' });
  await menuBtn.click();
  await page.getByRole('button', { name: 'Show 1 hidden image' }).click();
  await expect(items).toHaveCount(left);

  // View more images: the image dialog on its Suggested tab.
  await menuBtn.click();
  await page.getByRole('button', { name: 'View more images' }).click();
  const dlg = page.getByTestId('asset-dialog');
  await expect(dlg.getByRole('tab', { name: 'Suggested' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);

  // Hide the whole card: remembered in this browser across a reload, and it can come back.
  await menuBtn.click();
  await page.getByRole('button', { name: 'Hide suggested images' }).click();
  await expect(sg).toHaveCount(0);
  await expect(editPage(page).getByTestId('suggested-images-hidden')).toBeVisible();
  page.once('dialog', (d) => d.accept()); // the added image isn't saved
  await page.reload();
  await expect(box(page, 'Final URL')).toBeVisible();
  await expect(editPage(page).getByTestId('suggested-images-hidden')).toBeVisible();
  await editPage(page).getByRole('button', { name: 'Show suggested images' }).click();
  await expect(editPage(page).getByTestId('suggested-images').locator('.ae-sg-item').first()).toBeVisible();

  // Provide feedback hands over to the feedback dialog.
  await watchEvents(page);
  await editPage(page).getByRole('button', { name: 'Suggested images options' }).click();
  await page.getByRole('button', { name: 'Provide feedback' }).click();
  expect(await lastEvent(page)).toEqual({ type: 'app:feedback', about: 'Suggested images' });
});

test('More ideas for headlines: suggested, asset library, generated, create and edit, then save', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const c = await creativeOf(page, id);
  expect(c.headlines).toHaveLength(5);

  await editPage(page).getByTestId('headlines-ideas').click();
  const dlg = page.getByTestId('text-dialog');
  await expect(dlg.getByRole('heading', { name: 'Choose up to 5 headlines' })).toBeVisible();
  await expect(dlg.getByRole('tab', { name: 'Suggested' })).toHaveAttribute('aria-selected', 'true');
  const head = dlg.locator('.adlg-picked-head');
  const tray = dlg.getByTestId('text-tray');
  await expect(head).toContainText('Headlines for your ad (5/5)');
  await expect(dlg.locator('.tdlg-full')).toContainText('You’ve picked all 5 headlines');
  for (const h of c.headlines) await expect(tray.locator('.tdlg-pick', { hasText: h })).toHaveCount(1);

  // Full: a suggestion can't be added until one is removed.
  const suggestion = c.admin.suggestedHeadlines[0];
  const chip = dlg.locator('.tdlg-chips').getByRole('button', { name: suggestion, exact: true });
  await chip.click();
  await expect(toast(page)).toHaveText('You can add up to 5 headlines');
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await tray.getByRole('button', { name: `Remove ${c.headlines[0]}` }).click();
  await expect(head).toContainText('(4/5)');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(head).toContainText('(5/5)');

  // Asset library: headlines other ads use, such as a search ad's.
  await dlg.getByRole('tab', { name: 'Asset library' }).click();
  await expect(dlg.getByTestId('text-library').getByRole('button', { name: 'Soil Testing Made Easy', exact: true })).toBeVisible();
  await dlg.getByRole('textbox', { name: 'Search headlines' }).fill('soil');
  await expect(dlg.getByTestId('text-library').getByRole('button', { name: 'Know Your Soil Health', exact: true })).toBeVisible();
  for (const t of await dlg.getByTestId('text-library').getByRole('button').allInnerTexts()) expect(t.toLowerCase()).toContain('soil');

  // Generated: ideas built from the typed words, in the order the shared templates give.
  await dlg.getByRole('tab', { name: 'Generated' }).click();
  await expect(dlg.getByText('No AI service is used')).toBeVisible();
  const description = 'Organic vegetable seeds and garden tools for home gardens. Advice from local growers.';
  await dlg.getByTestId('idea-input').fill(description);
  await expect(dlg.getByText(`${description.length} / 1500`)).toBeVisible();
  await dlg.getByRole('button', { name: 'Generate ideas' }).click();
  const picked = [...c.headlines.slice(1), suggestion];
  const ideas = textIdeas({ kind: 'headline', description, businessName: c.businessName, finalUrl: c.finalUrl, headlines: c.headlines, exclude: picked });
  expect(ideas.length).toBeGreaterThan(3);
  const results = dlg.getByTestId('idea-results');
  await expect(results.locator('.tdlg-run')).toHaveCount(1);
  await expect(results.locator('.tdlg-run-head')).toContainText('Just now');
  await expect(results.locator('.tdlg-chip')).toHaveText(ideas);
  await tray.getByRole('button', { name: `Remove ${c.headlines[1]}` }).click();
  await results.getByRole('button', { name: ideas[0], exact: true }).click();
  await expect(results.getByRole('button', { name: ideas[0], exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Create one by typing, then edit it with its pencil.
  await tray.getByRole('button', { name: `Remove ${c.headlines[2]}` }).click();
  await tray.getByRole('button', { name: 'Create' }).click();
  await tray.getByRole('textbox', { name: 'New headline' }).fill('Farm Fresh Picks');
  await page.keyboard.press('Enter');
  await tray.getByRole('button', { name: 'Edit Farm Fresh Picks' }).click();
  const editBox = tray.getByRole('textbox', { name: 'Edit headline' });
  await expect(editBox).toHaveValue('Farm Fresh Picks');
  await editBox.fill('This one is far too long for a headline');
  await page.keyboard.press('Enter');
  await expect(tray.locator('.tdlg-edit-err')).toHaveText('Use 30 characters or fewer');
  await editBox.fill('Farm Fresh Picks Daily');
  await page.keyboard.press('Enter');
  await expect(head).toContainText('(5/5)');

  const want = [c.headlines[3], c.headlines[4], suggestion, ideas[0], 'Farm Fresh Picks Daily'];
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dlg).toHaveCount(0);
  for (const [i, h] of want.entries()) await expect(box(page, `Headline ${i + 1}`)).toHaveValue(h);

  // Reopening shows the generated batch again (kept in this browser).
  await editPage(page).getByTestId('headlines-ideas').click();
  await dlg.getByRole('tab', { name: 'Generated' }).click();
  await expect(dlg.getByTestId('idea-results').locator('.tdlg-run')).toHaveCount(1);
  await dlg.getByRole('button', { name: 'Cancel' }).click();

  await saveAd(page);
  expect((await creativeOf(page, id)).headlines).toEqual(want);
});

test('More ideas for descriptions and the long headline', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const c = await creativeOf(page, id);
  const dlg = page.getByTestId('text-dialog');

  await editPage(page).getByTestId('descriptions-ideas').click();
  await expect(dlg.getByRole('heading', { name: 'Choose up to 5 descriptions' })).toBeVisible();
  await expect(dlg.locator('.adlg-picked-head')).toContainText(`Descriptions for your ad (${c.descriptions.length}/5)`);
  const pick = c.admin.suggestedDescriptions[0];
  await dlg.locator('.tdlg-chips').getByRole('button', { name: pick, exact: true }).click();
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(box(page, `Description ${c.descriptions.length + 1}`)).toHaveValue(pick);

  // The long headline: one at a time, so picking another replaces it. No Suggested tab.
  await editPage(page).getByTestId('longHeadline-ideas').click();
  await expect(dlg.getByRole('heading', { name: 'Choose a long headline' })).toBeVisible();
  await expect(dlg.getByRole('tab', { name: 'Suggested' })).toHaveCount(0);
  await expect(dlg.getByRole('tab', { name: 'Generated' })).toHaveAttribute('aria-selected', 'true');
  await expect(dlg.locator('.adlg-picked-head')).toContainText('Long headline for your ad (1/1)');
  const description = 'Seasonal seeds and expert advice for small farms';
  await dlg.getByTestId('idea-input').fill(description);
  await dlg.getByRole('button', { name: 'Generate ideas' }).click();
  const ideas = textIdeas({
    kind: 'longHeadline', description, businessName: c.businessName, finalUrl: c.finalUrl, headlines: c.headlines, exclude: [c.longHeadline],
  });
  expect(ideas.every((s) => [...s].length <= 90)).toBe(true);
  await dlg.getByTestId('idea-results').getByRole('button', { name: ideas[0], exact: true }).click();
  await expect(dlg.locator('.adlg-picked-head')).toContainText('(1/1)');
  await expect(dlg.getByTestId('text-tray').locator('.tdlg-pick-t')).toHaveText([ideas[0]]);
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(box(page, 'Long headline')).toHaveValue(ideas[0]);

  await saveAd(page);
  const after = await creativeOf(page, id);
  expect(after.longHeadline).toBe(ideas[0]);
  expect(after.descriptions).toEqual([...c.descriptions, pick]);
});

test('text library API: every signed-in user can read it; it needs a known kind and a session', async ({ page, request }) => {
  await login(page, '/', 'viewer');
  const res = await page.request.get('/api/text-assets?kind=headline');
  expect(res.ok()).toBe(true);
  const { items } = await res.json();
  expect(items).toEqual(expect.arrayContaining([expect.objectContaining({ text: 'Soil Testing Made Easy', ads: 1 })]));
  expect(items.every((it) => [...it.text].length <= 30 && !it.text.endsWith('…'))).toBe(true);
  const descs = await (await page.request.get('/api/text-assets?kind=description')).json();
  expect(descs.items.length).toBeGreaterThan(0);
  expect((await page.request.get('/api/text-assets?kind=images')).status()).toBe(400);
  expect((await request.get('/api/text-assets?kind=headline')).status()).toBe(401);
});

test('additional format options are saved with the ad', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  await watchEvents(page);
  await editPage(page).getByRole('button', { name: 'Additional format options' }).click();
  await expect(editPage(page).locator('.ae-infobox')).toBeVisible();
  const opt = (name) => editPage(page).getByRole('checkbox', { name, exact: true });
  for (const name of ['Allow asset enhancements', 'Allow auto-generated video', 'Allow native formats']) await expect(opt(name)).toBeChecked();
  await opt('Allow asset enhancements').uncheck();
  await opt('Allow auto-generated video').uncheck();
  await editPage(page).locator('[data-field="options.autoVideo"]').getByRole('button', { name: 'Learn more' }).click();
  await editPage(page).locator('[data-field="options.nativeFormats"]').getByRole('button', { name: 'Learn more' }).click();
  expect(await helpTopics(page)).toEqual(['auto-video', 'native-formats']);

  await saveAd(page);
  const c = await creativeOf(page, id);
  expect(c.options).toMatchObject({ assetEnhancements: false, autoVideo: false, nativeFormats: true });
  const h = await (await page.request.get('/api/history')).json();
  expect(h.find((x) => x.column === 'Ad assets').detail).toContain('Format options');

  await openEdit(page, id);
  await editPage(page).getByRole('button', { name: 'Additional format options' }).click();
  await expect(opt('Allow asset enhancements')).not.toBeChecked();
  await expect(opt('Allow auto-generated video')).not.toBeChecked();
  await expect(opt('Allow native formats')).toBeChecked();
});

test('Ad URL options: examples, custom parameters with +, and Test shows the landing page without opening it', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const c = await creativeOf(page, id);
  await watchEvents(page);
  // Requests to anywhere but this app (web fonts that load late don't count).
  const outside = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(new URL(page.url()).origin) && !['font', 'stylesheet'].includes(r.resourceType())) outside.push(r.url());
  });

  await editPage(page).getByRole('button', { name: 'Ad URL options' }).click();
  await expect(editPage(page).locator('[data-field="options.trackingTemplate"] .ae-hint')).toContainText('{lpurl}');
  await expect(editPage(page).locator('[data-field="options.finalUrlSuffix"] .ae-hint')).toHaveText('Example: param1=value1&param2=value2');
  await editPage(page).getByRole('button', { name: 'About tracking template' }).click();
  await editPage(page).locator('.ae-hp-card').getByRole('button', { name: 'Learn more' }).click();
  expect(await helpTopics(page)).toEqual(['url-options']);

  const template = '{lpurl}?src=ads&k={_season}&d={device}';
  await box(page, 'Tracking template').fill(template);
  await box(page, 'Final URL suffix').fill('utm_source={_season}');
  // One empty row is there to type into; + adds the next one and moves to it.
  await editPage(page).getByRole('textbox', { name: 'Parameter 1 name' }).fill('season');
  await editPage(page).getByRole('textbox', { name: 'Parameter 1 value' }).fill('spring');
  await editPage(page).getByRole('button', { name: 'Add a custom parameter' }).click();
  await expect(editPage(page).getByRole('textbox', { name: 'Parameter 2 name' })).toBeFocused();
  await page.keyboard.type('camp');
  await editPage(page).getByRole('textbox', { name: 'Parameter 2 value' }).fill('c1');

  await editPage(page).getByTestId('test-url').click();
  const dlg = page.getByTestId('url-test');
  const params = [{ key: 'season', value: 'spring' }, { key: 'camp', value: 'c1' }];
  const want = testUrls({ ...c, options: { ...c.options, trackingTemplate: template, finalUrlSuffix: 'utm_source={_season}', customParams: params } });
  expect(want.landing).toContain('utm_source=spring');
  await expect(dlg.getByTestId('test-landing').locator('.ae-test-url')).toHaveText(want.landing);
  await expect(dlg.getByTestId('test-tracking').locator('.ae-test-url')).toHaveText(want.tracking);
  await expect(dlg).toContainText('{device} is only known when someone clicks');
  await expect(dlg).toContainText('No page was opened');
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(dlg).toHaveCount(0);
  expect(outside).toEqual([]);

  await saveAd(page);
  const after = await creativeOf(page, id);
  expect(after.options).toMatchObject({ trackingTemplate: template, finalUrlSuffix: 'utm_source={_season}', customParams: params });
});

test('image dialog: honest Generated and website tabs, read-only details, help and legal links', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await openEdit(page);
  await watchEvents(page);
  await editPage(page).getByTestId('generated-images').click();
  const dlg = page.getByTestId('asset-dialog');
  await expect(dlg.getByRole('heading', { name: 'Choose up to 15 images for your ad' })).toBeVisible();
  await expect(dlg.getByRole('tab', { name: 'Generated' })).toHaveAttribute('aria-selected', 'true');
  await expect(dlg).toContainText(`${BRAND.name} doesn’t create images`);
  await expect(dlg.getByRole('button', { name: 'Generate', exact: true })).toHaveCount(0);
  await expect(dlg.getByRole('textbox', { name: /Describe the image/ })).toHaveCount(0);
  await dlg.getByRole('tab', { name: 'Website or social' }).click();
  await expect(dlg.getByRole('button', { name: 'Scan', exact: true })).toHaveCount(0);
  await expect(dlg).toContainText('saved to your asset library from web pages');
  await dlg.getByRole('tab', { name: 'Suggested' }).click();
  await expect(dlg).not.toContainText('Based on your final URL');

  // The picked image's button shows read-only details.
  const tile = dlg.locator('.adlg-stile').first();
  await tile.hover();
  await tile.getByRole('button', { name: /^Details for/ }).click();
  await expect(dlg.locator('.adlg-detail')).toContainText('Used as it is');

  // Learn more and the legal links open Quick help in view, above the dialog.
  await dlg.getByRole('button', { name: 'Image requirements' }).click();
  await expect(dlg.locator('.adlg-helpcard')).toContainText('JPG, PNG, GIF or WebP, up to 10 MB');
  await dlg.locator('.adlg-helpcard').getByRole('button', { name: 'Learn more' }).click();
  const help = page.getByTestId('quick-help');
  await expect(help.getByTestId('qh-article')).toHaveAttribute('data-topic', 'images');
  expect(await onTop(help)).toBe(true);

  // Keyboard users can use the panel too: Esc and Tab typed there are the panel's (the dialog
  // stays open), and Tab goes on from the dialog's last control into the panel and back.
  await help.getByTestId('qh-search').click();
  await page.keyboard.press('Escape');
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(help.locator(':focus')).toHaveCount(1);
  const policy = dlg.getByRole('button', { name: `${BRAND.name} Generative AI Use Policy` });
  await policy.focus();
  await page.keyboard.press('Tab');
  await expect(help.getByTestId('qh-back')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(policy).toBeFocused();
  await help.locator('.qh-fb').focus();
  await page.keyboard.press('Tab');
  await expect(dlg.locator('.adlg-x')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(help.locator('.qh-fb')).toBeFocused();
  await expectHelpOverDialog(page, dlg, 'images');

  await dlg.locator('.adlg-banner').getByRole('button', { name: 'Learn more' }).click();
  await expectHelpOverDialog(page, dlg, 'ai-labels');
  await dlg.getByRole('button', { name: `${BRAND.name} Terms of Service` }).click();
  await expectHelpOverDialog(page, dlg, 'terms');
  await policy.click();
  await expectHelpOverDialog(page, dlg, 'ai-policy');
  expect(await helpTopics(page)).toEqual(['images', 'ai-labels', 'terms', 'ai-policy']);
  await expect(dlg.locator('a[href="#"]')).toHaveCount(0);
  // With Quick help closed, Esc closes the dialog again.
  await policy.focus();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
});

test('the (?) in More ideas opens Quick help in view; Esc there leaves the dialog open', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await openEdit(page);
  await editPage(page).getByTestId('headlines-ideas').click();
  const dlg = page.getByTestId('text-dialog');
  await dlg.getByRole('button', { name: 'About headlines' }).click();
  const help = page.getByTestId('quick-help');
  await expect(help.getByTestId('qh-article')).toHaveAttribute('data-topic', 'headlines');
  expect(await onTop(help)).toBe(true);
  await help.getByTestId('qh-search').click();
  await page.keyboard.type('logo');
  await expect(help.getByTestId('qh-results')).toBeVisible();
  await page.keyboard.press('Escape'); // clears the panel's search
  await expect(help.getByTestId('qh-search')).toHaveValue('');
  await page.keyboard.press('Escape'); // nothing more to clear: still not the dialog's
  await expect(dlg).toBeVisible();
  // Back in the dialog, Esc closes it as before and Quick help stays open.
  await dlg.locator('.adlg-x').focus();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(help).toBeVisible();
});

test('More ideas: removing a pick while a too-long edit is open keeps that edit on its own pick', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const c = await creativeOf(page, id);
  expect(c.headlines).toHaveLength(5);
  const [a, b, mid, d, last] = c.headlines;
  await editPage(page).getByTestId('headlines-ideas').click();
  const dlg = page.getByTestId('text-dialog');
  const tray = dlg.getByTestId('text-tray');
  const chips = tray.locator('.tdlg-pick-t');
  const editBox = tray.getByRole('textbox', { name: 'Edit headline' });

  // Edit the third pick past the limit, then remove the first: the remove works at once, and
  // the editor stays on the third pick (now second) with its text, rather than moving on.
  await tray.getByRole('button', { name: `Edit ${mid}`, exact: true }).click();
  await editBox.fill('This one is far too long for a headline');
  await tray.getByRole('button', { name: `Remove ${a}`, exact: true }).click();
  await expect(chips).toHaveText([b, d, last]);
  await expect(editBox).toHaveValue('This one is far too long for a headline');
  await editBox.press('Enter');
  await expect(tray.locator('.tdlg-edit-err')).toHaveText('Use 30 characters or fewer');
  await editBox.fill('Farm Fresh Picks Daily');
  await editBox.press('Enter');
  await expect(chips).toHaveText([b, 'Farm Fresh Picks Daily', d, last]);

  // The same with the last pick: the editor stays in view, and Esc only drops the edit.
  await tray.getByRole('button', { name: `Edit ${last}`, exact: true }).click();
  await editBox.fill('Another line that is far too long');
  await tray.getByRole('button', { name: `Remove ${b}`, exact: true }).click();
  await expect(editBox).toBeVisible();
  await expect(chips).toHaveText(['Farm Fresh Picks Daily', d]);
  await editBox.press('Escape');
  await expect(dlg).toBeVisible();
  await expect(chips).toHaveText(['Farm Fresh Picks Daily', d, last]);

  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dlg).toHaveCount(0);
  for (const [i, h] of ['Farm Fresh Picks Daily', d, last].entries()) await expect(box(page, `Headline ${i + 1}`)).toHaveValue(h);
});

test('generated ideas keep the percent and currency signs the advertiser typed', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const c = await creativeOf(page, id);
  await editPage(page).getByTestId('headlines-ideas').click();
  const dlg = page.getByTestId('text-dialog');
  await dlg.getByRole('tab', { name: 'Generated' }).click();
  const description = '30% off garden tools. $20 off your first order.';
  await dlg.getByTestId('idea-input').fill(description);
  await dlg.getByRole('button', { name: 'Generate ideas' }).click();
  const ideas = textIdeas({ kind: 'headline', description, businessName: c.businessName, finalUrl: c.finalUrl, headlines: c.headlines, exclude: c.headlines });
  expect(ideas).toEqual(expect.arrayContaining(['30% Off Garden Tools', '$20 Off Your First Order']));
  const results = dlg.getByTestId('idea-results');
  await expect(results.locator('.tdlg-chip')).toHaveText(ideas);
  for (const t of await results.locator('.tdlg-chip').allInnerTexts()) expect(t).not.toMatch(/(^|\s)(30|20) Off/);
});

test('Ad URL options: a space pasted before the tracking template doesn’t block Save, and "$" in the URL is kept', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  await box(page, 'Final URL').fill('https://www.example.com/p?a=$&b=1');
  await editPage(page).getByRole('button', { name: 'Ad URL options' }).click();
  await box(page, 'Tracking template').fill(' {lpurl}&id=1');
  await box(page, 'Tracking template').blur();
  await expect(editPage(page).locator('[data-field="options.trackingTemplate"] .ae-err')).toHaveText('');

  await editPage(page).getByTestId('test-url').click();
  const dlg = page.getByTestId('url-test');
  await expect(dlg.getByTestId('test-tracking').locator('.ae-test-url')).toHaveText('https://www.example.com/p?a=$&b=1&id=1');
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(dlg).toHaveCount(0);

  await saveAd(page);
  const after = await creativeOf(page, id);
  expect(after.finalUrl).toBe('https://www.example.com/p?a=$&b=1');
  expect(after.options.trackingTemplate).toBe('{lpurl}&id=1');
});

test('logos over 5 MB are refused by the server', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(5121 * 1024)]);
  const res = await page.request.post('/api/assets', { multipart: { kind: 'logo', source: 'upload', media: { name: 'big.png', mimeType: 'image/png', buffer: big } } });
  expect(res.status()).toBe(413);
  expect((await res.json()).error).toBe('Logos can be up to 5 MB');
});

test('viewers get the same Save, upload and add controls, which do nothing and say nothing, and can still browse ideas', async ({ page }) => {
  await login(page, '/', 'viewer');
  const id = await openEdit(page);
  const before = await creativeOf(page, id);
  const writes = watchWrites(page);
  await watchToasts(page);
  const choosers = [];
  page.on('filechooser', (fc) => choosers.push(fc));
  await expect(page.getByTestId('save-ad')).toBeVisible();
  await expect(page.getByTestId('read-only-note')).toHaveCount(0);
  await expect(page.getByTestId('cancel-edit')).toHaveText('Cancel');

  // Save sends nothing and stays on the page.
  await page.getByTestId('save-ad').click();
  await page.waitForTimeout(300);
  await expect(editPage(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/aw/ads/edit/display/${id}/${BRAND.slug}$`));

  // Image picker: the Upload tab and "Add to this tab" show; neither opens a file chooser.
  await editPage(page).getByTestId('edit-images').click();
  const dlg = page.getByTestId('asset-dialog');
  await expect(dlg.getByRole('tab', { name: 'Asset library' })).toBeVisible();
  await expect(dlg.getByRole('tab', { name: 'Upload' })).toBeVisible();
  await dlg.getByRole('button', { name: 'Add to this tab' }).click();
  await dlg.getByRole('tab', { name: 'Upload' }).click();
  await dlg.getByRole('button', { name: 'Upload from computer' }).click();
  await page.waitForTimeout(300);
  await expect(dlg.locator('.adlg-tile')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);

  // Logo picker the same.
  await editPage(page).getByTestId('edit-logos').click();
  await expect(dlg.getByRole('tab', { name: 'Upload' })).toBeVisible();
  await dlg.getByRole('tab', { name: 'Upload' }).click();
  await dlg.getByRole('button', { name: 'Upload from computer' }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);

  // Video dialog: Upload video shows and does nothing.
  await editPage(page).getByTestId('add-videos').click();
  const vd = page.getByTestId('video-dialog');
  await expect(vd).toBeVisible();
  await expect(vd.getByRole('button', { name: 'Upload video' })).toBeVisible();
  await vd.getByRole('button', { name: 'Upload video' }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await expect(vd).toHaveCount(0);
  expect(choosers).toHaveLength(0);

  await editPage(page).getByTestId('headlines-ideas').click();
  const td = page.getByTestId('text-dialog');
  await td.getByRole('tab', { name: 'Asset library' }).click();
  await expect(td.getByTestId('text-library').getByRole('button').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(td).toHaveCount(0);

  // Nothing was sent or shown, and the ad and the libraries are as they were.
  expect(writes).toEqual([]);
  expect(await toasts(page)).toEqual([]);
  await expect(toast(page)).toHaveCount(0);
  expect(await creativeOf(page, id)).toEqual(before);

  // Cancel leaves without asking when nothing changed.
  await page.getByTestId('cancel-edit').click();
  await expect(editPage(page)).toHaveCount(0);
});
