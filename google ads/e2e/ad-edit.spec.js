import zlib from 'node:zlib';
import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';
import { adStrength } from '../shared/creative.js';
import { BRAND } from '../shared/brand.js';

// Responsive display ad edit page: opening it from the ads table, editing and saving every
// kind of content, the image / video dialogs, admin page settings, read-only viewers and
// the page's own address (Back, Cancel, reload).

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
// Page addresses have no '?': the ad id is a path part and every address ends in /<brand slug>.
const S = BRAND.slug;
const editAddress = (id, base = '') => `${base}/aw/ads/edit/display/${id}/${S}`;
const adsAddress = (base = '') => new RegExp(`${base}/aw/ads/${S}$`);

// Opens the edit page from the pencil on a display ad row (the first one, or the ad `id`).
async function openEdit(page, id) {
  const r = id ? rowOf(page, id) : page.getByTestId('ad-row').filter({ has: page.locator('td.c-camp', { hasText: 'Leads-Display-1' }) }).first();
  const adId = id || (await r.getAttribute('data-id'));
  await r.hover();
  await r.getByTestId('edit-ad').click();
  await expect(page).toHaveURL(new RegExp(`${editAddress(adId)}$`));
  await expect(box(page, 'Final URL')).toBeVisible();
  return adId;
}

// Save, then back on the ads page with the toast.
async function saveAd(page) {
  await page.getByTestId('save-ad').click();
  await expect(editPage(page)).toHaveCount(0);
  await expect(toast(page)).toHaveText('Your ad was saved');
  await expect(page).toHaveURL(adsAddress());
}

async function creativeOf(page, id) {
  const res = await page.request.get(`/api/ads/${id}/creative`);
  expect(res.ok()).toBe(true);
  return (await res.json()).creative;
}

// The ad's picture strip shows the first 6 images, then a "+N" tile.
async function expectThumbs(page, n) {
  const thumbs = editPage(page).getByTestId('image-thumbs');
  await expect(thumbs.locator(':scope > img')).toHaveCount(Math.min(n, 6));
  if (n > 6) await expect(thumbs.locator('.ae-more-tile')).toHaveText(`+${n - 6}`);
  else await expect(thumbs.locator('.ae-more-tile')).toHaveCount(0);
}

// Every visible icon is a glyph from the subset font, not its name as text.
async function textIcons(page) {
  await page.evaluate(() => document.fonts.ready);
  return page.locator('.material-symbols-outlined').evaluateAll((els) => els
    .filter((el) => el.offsetParent !== null)
    .filter((el) => el.getBoundingClientRect().width > parseFloat(getComputedStyle(el).fontSize) * 1.6)
    .map((el) => el.textContent));
}

// A small solid-colour RGB PNG, built in memory.
function png(w, h) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [0x34, 0xa8, 0x53]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Records PUTs of ad content, to check that a blocked save never reaches the server.
function watchSaves(page) {
  const puts = [];
  page.on('request', (r) => { if (r.method() === 'PUT' && r.url().includes('/creative')) puts.push(r.url()); });
  return puts;
}

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

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('admin opens a display ad: top bar, ad strength, form and previews', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  expect(new URL(page.url()).pathname).toBe(editAddress(id, '/admin'));
  const c = await creativeOf(page, id);
  const s = adStrength(c);

  // Edit mode: close X instead of the menu, no Refresh, no left rail.
  await expect(page.getByTestId('close-edit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Main menu' })).toHaveCount(0);
  await expect(page.locator('.topact[data-tip=Refresh]')).toHaveCount(0);
  await expect(page.locator('.rail')).toBeHidden();

  const bar = page.getByTestId('strength-bar');
  await expect(bar).toContainText('Ad strength');
  await expect(page.getByTestId('strength-level')).toHaveText(s.level);
  await expect(page.getByTestId('strength-tip')).toHaveText(s.tips[0]);
  const checks = bar.locator('.ae-check');
  await expect(checks).toHaveText(['Images', 'Videos', 'Headlines', 'Descriptions']);
  for (const [i, k] of ['images', 'videos', 'headlines', 'descriptions'].entries()) {
    await expect(checks.nth(i)).toHaveAttribute('data-state', s.checklist[k]);
  }

  await expect(page.getByTestId('edit-breadcrumb')).toContainText('Leads-Display-1');
  await expect(box(page, 'Final URL')).toHaveValue(c.finalUrl);
  await expect(box(page, 'Business name')).toHaveValue(c.businessName);
  await expectThumbs(page, c.images.length);
  await expect(editPage(page).getByTestId('logo-thumbs').locator('img')).toHaveCount(c.logos.length);
  for (const [i, h] of c.headlines.entries()) {
    await expect(box(page, `Headline ${i + 1}`)).toHaveValue(h);
    await expect(editPage(page).locator(`[data-field="headlines.${i}"] .ae-count`)).toHaveText(`${[...h].length} / 30`);
  }
  await expect(box(page, 'Long headline')).toHaveValue(c.longHeadline);
  await expect(editPage(page).locator('[data-field=longHeadline] .ae-count')).toHaveText(`${c.longHeadline.length} / 90`);
  await expect(box(page, 'Description 1')).toHaveValue(c.descriptions[0]);
  await expect(page.getByTestId('save-ad')).toBeEnabled();
  expect(await textIcons(page)).toEqual([]);

  // Preview panel: placement tabs switch.
  const preview = page.getByRole('region', { name: 'Preview' });
  const tab = (name) => preview.getByRole('tab', { name, exact: true });
  await expect(tab('Display')).toHaveAttribute('aria-selected', 'true');
  await tab('Gmail').click();
  await expect(tab('Gmail')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Display')).toHaveAttribute('aria-selected', 'false');
  await tab('YouTube').click();
  await expect(tab('YouTube')).toHaveAttribute('aria-selected', 'true');

  // Full-screen "Preview ads": opens, switches tabs, Esc closes it.
  await preview.getByRole('button', { name: 'Preview ads' }).click();
  const modal = page.getByRole('dialog', { name: 'Preview ads' });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true');
  await modal.getByRole('tab', { name: 'YouTube', exact: true }).click();
  await expect(modal.getByText('Add more assets to unlock these formats')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(editPage(page)).toBeVisible();
});

test('admin edits text, saves, and the ads table, status and history follow', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const before = await creativeOf(page, id);
  expect(before.longHeadline.length).toBeLessThan(30);

  await box(page, 'Headline 1').fill('Fresh Picks Daily');
  await expect(editPage(page).locator('[data-field="headlines.0"] .ae-count')).toHaveText('17 / 30');

  const tip = page.getByTestId('strength-tip');
  await expect(tip).toContainText('long headline is a little short');
  const longHeadline = 'Fresh produce and farm tips every week';
  await box(page, 'Long headline').fill(longHeadline);
  await expect(tip).not.toContainText('long headline');

  // A suggestion chip adds a new description box with its text.
  const descs = editPage(page).locator('section[data-field=descriptions]');
  const chip = descs.locator('.ae-chip').first();
  const suggestion = await chip.locator(':scope > span:not(.ic)').innerText();
  expect(before.descriptions).not.toContain(suggestion);
  await chip.click();
  await expect(box(page, `Description ${before.descriptions.length + 1}`)).toHaveValue(suggestion);
  await expect(descs.locator('.ae-chip', { hasText: suggestion })).toHaveCount(0);

  await box(page, 'Business name').fill('Green Valley Farms');
  await saveAd(page);

  const row = rowOf(page, id);
  await expect(row.locator('.ad-line').first()).toContainText('Fresh Picks Daily');
  await expect(row.locator('.ad-line').nth(1)).toContainText(longHeadline);
  await expect(row.locator('td.c-status')).toContainText('Pending');
  await expect(row.locator('td.c-status')).toContainText('Under review');

  const h = await (await page.request.get('/api/history')).json();
  const assets = h.find((x) => x.column === 'Ad assets');
  expect(assets).toBeTruthy();
  for (const part of ['Business name', 'Headlines', 'Long headline', 'Descriptions']) expect(assets.detail).toContain(part);
  expect(h.find((x) => x.column === 'Status')).toMatchObject({ before: 'Eligible', after: 'Pending' });

  // Reopening shows what was saved.
  await openEdit(page, id);
  await expect(box(page, 'Headline 1')).toHaveValue('Fresh Picks Daily');
  await expect(box(page, 'Long headline')).toHaveValue(longHeadline);
  await expect(box(page, 'Business name')).toHaveValue('Green Valley Farms');
  await expect(box(page, `Description ${before.descriptions.length + 1}`)).toHaveValue(suggestion);
  const after = await creativeOf(page, id);
  expect(after.headlines.slice(1)).toEqual(before.headlines.slice(1));
  expect(after.images).toEqual(before.images);
});

test('invalid fields block Save on the page and never reach the server', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const before = await creativeOf(page, id);
  const puts = watchSaves(page);

  await box(page, 'Final URL').fill('');
  await box(page, 'Headline 2').fill('This headline is far too long to fit');
  await expect(editPage(page).locator('[data-field="headlines.1"] .ae-count')).toHaveClass(/over/);
  // Same text as headline 1 apart from extra spaces: a duplicate, as the server sees it.
  await box(page, 'Headline 3').fill(`  ${before.headlines[0].replace(' ', '   ')} `);

  await page.getByTestId('save-ad').click();
  const err = (k) => editPage(page).locator(`[data-field="${k}"] .ae-err`);
  await expect(err('finalUrl')).toHaveText('Enter a final URL');
  await expect(err('headlines.1')).toHaveText('Headline is too long');
  await expect(err('headlines.2')).toHaveText('This headline is a duplicate');
  await expect(box(page, 'Final URL')).toHaveAttribute('aria-invalid', 'true');
  await expect(box(page, 'Final URL')).toBeFocused();
  await expect(editPage(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${editAddress(id)}$`));
  expect(puts).toEqual([]);

  // The server refuses the same content with field errors.
  const res = await page.request.put(`/api/ads/${id}/creative`, {
    data: { creative: { ...before, finalUrl: '', headlines: [before.headlines[0], 'This headline is far too long to fit'] } },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).fields).toMatchObject({ finalUrl: 'Enter a final URL', 'headlines.1': 'Headline is too long' });

  // Fixing the fields clears the errors and the save goes through.
  await box(page, 'Final URL').fill('https://www.example.com/fresh');
  await box(page, 'Headline 2').fill('Short and sweet');
  await box(page, 'Headline 3').fill('Another fresh line');
  await expect(editPage(page).locator('.ae-err:not(:empty)')).toHaveCount(0);
  await saveAd(page);
  expect(puts).toHaveLength(1);
  expect((await creativeOf(page, id)).finalUrl).toBe('https://www.example.com/fresh');
});

test('image dialog: seeded images are picked, remove one, upload a new one, save', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const before = await creativeOf(page, id);
  const n = before.images.length;
  expect(n).toBeGreaterThan(6);

  await editPage(page).getByTestId('edit-images').click();
  const dlg = page.getByTestId('asset-dialog');
  await expect(dlg).toBeVisible();
  const head = dlg.locator('.adlg-picked-head');
  await expect(head).toContainText(`Images for your ad (${n}/15)`);
  await dlg.getByRole('tab', { name: 'Asset library' }).click();
  const picked = dlg.locator('.adlg-tile[aria-pressed=true]');
  await expect(picked).toHaveCount(n);
  await expect(dlg.getByText('Not in your asset library')).toHaveCount(0);
  expect(await textIcons(page)).toEqual([]);

  const removed = await picked.first().locator('img').getAttribute('src');
  await picked.first().click();
  await expect(head).toContainText(`(${n - 1}/15)`);
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await expectThumbs(page, n - 1);

  // Upload a PNG: it lands in the library and is picked for the ad straight away.
  await editPage(page).getByTestId('edit-images').click();
  await expect(head).toContainText(`(${n - 1}/15)`);
  await dlg.getByRole('tab', { name: 'Upload' }).click();
  const chooser = page.waitForEvent('filechooser');
  await dlg.getByRole('button', { name: 'Upload from computer' }).click();
  await (await chooser).setFiles({ name: 'e2e-upload.png', mimeType: 'image/png', buffer: png(40, 20) });
  const tile = dlg.locator('.adlg-tile[aria-label="e2e-upload.png"]');
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await expect(head).toContainText(`(${n}/15)`);
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await expectThumbs(page, n);

  await saveAd(page);
  const after = await creativeOf(page, id);
  expect(after.images).toHaveLength(n);
  expect(after.images.map((im) => im.url)).not.toContain(removed);
  const up = after.images.find((im) => im.name === 'e2e-upload.png');
  expect(up).toMatchObject({ w: 40, h: 20, url: expect.stringMatching(/\/uploads\//) });
  expect(up.assetId).toBeTruthy();
  const lib = await (await page.request.get('/api/assets?kind=image')).json();
  expect(lib.assets.find((a) => a.id === up.assetId)).toMatchObject({ source: 'upload', url: up.url });

  // Tidy up the uploaded file: take it off the ad, then delete it from the library.
  const put = await page.request.put(`/api/ads/${id}/creative`, { data: { creative: { ...after, images: before.images } } });
  expect(put.ok()).toBe(true);
  expect((await page.request.delete(`/api/assets/${up.assetId}`)).ok()).toBe(true);
});

test('deleting a library image: the saved ad keeps its copy, a pick not saved with the ad yet goes with it', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const row = page.getByTestId('ad-row').filter({ has: page.locator('td.c-camp', { hasText: 'Leads-Display-1' }) }).first();
  const id = await row.getAttribute('data-id');
  const start = await creativeOf(page, id);
  // Three images to start from, so there's room for the upload below.
  const three = start.images.slice(0, 3);
  expect((await page.request.put(`/api/ads/${id}/creative`, { data: { creative: { ...start, images: three } } })).ok()).toBe(true);
  await openEdit(page, id);
  await expectThumbs(page, 3);
  const dlg = page.getByTestId('asset-dialog');
  const head = dlg.locator('.adlg-picked-head');
  const asked = [];
  const deleteFromLibrary = async (tile) => {
    await tile.hover();
    page.once('dialog', (d) => { asked.push(d.message()); d.accept(); });
    await tile.getByRole('button', { name: 'Delete from asset library' }).click();
  };

  // An image the saved ad uses: it stays picked and is listed as the ad's own copy.
  await editPage(page).getByTestId('edit-images').click();
  await dlg.getByRole('tab', { name: 'Asset library' }).click();
  const keep = dlg.locator('.adlg-tile[aria-pressed=true]').first();
  const keepName = await keep.getAttribute('aria-label');
  await deleteFromLibrary(keep);
  await expect(dlg.getByText('Not in your asset library')).toBeVisible();
  await expect(dlg.locator(`.adlg-tile[aria-label="${keepName}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(head).toContainText('(3/15)');
  expect(asked).toEqual([`Delete "${keepName}" from the asset library? Ads that already use it keep their copy.`]);
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(dlg).toHaveCount(0);

  // Upload one and Save the dialog: it's in the form, but the ad isn't saved yet.
  await editPage(page).getByTestId('edit-images').click();
  await dlg.getByRole('tab', { name: 'Upload' }).click();
  const chooser = page.waitForEvent('filechooser');
  await dlg.getByRole('button', { name: 'Upload from computer' }).click();
  await (await chooser).setFiles({ name: 'e2e-drop.png', mimeType: 'image/png', buffer: png(40, 20) });
  await expect(dlg.locator('.adlg-tile[aria-label="e2e-drop.png"]')).toHaveAttribute('aria-pressed', 'true');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await expectThumbs(page, 4);

  // Deleting it from the library on a later visit takes it out of the picks and the form too
  // (its file is deleted, so it couldn't be saved), even when the dialog is then cancelled.
  await editPage(page).getByTestId('edit-images').click();
  await expect(head).toContainText('(4/15)');
  await dlg.getByRole('tab', { name: 'Asset library' }).click();
  await deleteFromLibrary(dlg.locator('.adlg-tile[aria-label="e2e-drop.png"]'));
  await expect(dlg.locator('.adlg-tile[aria-label="e2e-drop.png"]')).toHaveCount(0);
  await expect(head).toContainText('(3/15)');
  expect(asked[1]).toBe('Delete "e2e-drop.png" from the asset library? It will also be removed from the images you picked for this ad.');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(dlg).toHaveCount(0);
  await expectThumbs(page, 3);

  // The page saves: the ad keeps its copy of the first image, and the deleted upload is gone.
  await saveAd(page);
  const after = await creativeOf(page, id);
  expect(after.images.map((im) => im.url)).toEqual(three.map((im) => im.url));
  const lib = await (await page.request.get('/api/assets?kind=image')).json();
  expect(lib.assets.some((a) => a.name === 'e2e-drop.png' || a.name === keepName)).toBe(false);
});

test('a pasted mobile YouTube link is saved in its canonical form', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const videos = page.getByTestId('strength-bar').locator('.ae-check').nth(1);
  await expect(videos).toHaveAttribute('data-state', 'empty');

  await editPage(page).getByTestId('add-videos').click();
  const vd = page.getByTestId('video-dialog');
  const search = vd.getByRole('textbox', { name: 'Search for a video or paste a YouTube URL' });
  await expect(search).toBeFocused();
  await search.fill('https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ');
  await expect(vd.locator('.vdlg-paste')).toContainText('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await search.press('Enter');
  await expect(vd.locator('.vdlg-row.sel')).toHaveCount(1);
  await expect(vd.locator('.vdlg-row.sel')).toContainText('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await vd.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(vd).toHaveCount(0);
  await expect(editPage(page).getByTestId('video-list').locator('li')).toHaveCount(1);
  await expect(videos).toHaveAttribute('data-state', 'done');

  await saveAd(page);
  const c = await creativeOf(page, id);
  expect(c.videos).toEqual([{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'YouTube video' }]);
});

test('admin page settings set the ad strength and tip, and viewers see them', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const tipText = 'Try a seasonal offer in one of your headlines.';

  await page.getByTestId('page-settings-btn').click();
  const sheet = page.getByTestId('page-settings');
  await expect(sheet).toBeVisible();
  await sheet.locator('select').first().selectOption('Excellent');
  await sheet.getByLabel('Tips', { exact: true }).fill(tipText);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('strength-level')).toHaveText('Excellent');
  await expect(page.getByTestId('strength-tip')).toHaveText(tipText);

  await saveAd(page);
  const row = rowOf(page, id);
  await expect(row.locator('td.c-strength')).toHaveText('Excellent');
  // Only page settings changed, so the ad isn't sent for review.
  await expect(row.locator('td.c-status')).toHaveText('Eligible');
  const c = await creativeOf(page, id);
  expect(c.admin).toMatchObject({ strength: 'Excellent', tips: [tipText] });

  await openEdit(page, id);
  await expect(page.getByTestId('strength-level')).toHaveText('Excellent');
  await expect(page.getByTestId('strength-tip')).toHaveText(tipText);

  await page.context().clearCookies();
  await login(page, '/', 'viewer');
  await openEdit(page, id);
  await expect(page.getByTestId('strength-level')).toHaveText('Excellent');
  await expect(page.getByTestId('strength-tip')).toHaveText(tipText);
  await expect(page.getByTestId('page-settings-btn')).toHaveCount(0);
});

test('viewer can open and type in the edit page, but nothing is saved', async ({ page }) => {
  await login(page, '/', 'viewer');
  const id = await openEdit(page);
  expect(new URL(page.url()).pathname).toBe(editAddress(id));
  const before = await creativeOf(page, id);
  const puts = watchSaves(page);
  const writes = watchWrites(page);
  await watchToasts(page);
  const choosers = [];
  page.on('filechooser', (fc) => choosers.push(fc));
  await expect(page.getByTestId('page-settings-btn')).toHaveCount(0);
  await expect(editPage(page).locator('.editable')).toHaveCount(0);

  // The image dialog has no delete buttons; its Upload tab shows, but uploading opens no file chooser.
  await editPage(page).getByTestId('edit-images').click();
  const dlg = page.getByTestId('asset-dialog');
  await dlg.getByRole('tab', { name: 'Asset library' }).click();
  await expect(dlg.locator('.adlg-tile').first()).toBeVisible();
  await expect(dlg.locator('.adlg-del')).toHaveCount(0);
  await dlg.getByRole('tab', { name: 'Upload' }).click();
  await dlg.getByRole('button', { name: 'Upload from computer' }).click();
  await page.waitForTimeout(300);
  expect(choosers).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);

  // Save shows as for admins; for a viewer it sends nothing and stays on the page.
  await box(page, 'Headline 1').fill('Viewer was here');
  await expect(box(page, 'Headline 1')).toHaveValue('Viewer was here');
  await expect(page.getByTestId('read-only-note')).toHaveCount(0);
  await expect(page.getByTestId('cancel-edit')).toBeVisible();
  await page.getByTestId('save-ad').click();
  await page.waitForTimeout(300);
  await expect(editPage(page)).toBeVisible();
  await expect(box(page, 'Headline 1')).toHaveValue('Viewer was here');
  await expect(page).toHaveURL(new RegExp(`${editAddress(id)}$`));
  expect(puts).toEqual([]);
  expect(writes).toEqual([]);
  expect(await toasts(page)).toEqual([]);
  await expect(toast(page)).toHaveCount(0);

  // Every write route is admin-only.
  const put = await page.request.put(`/api/ads/${id}/creative`, { data: { creative: { ...before, headlines: ['Viewer was here'] } } });
  expect(put.status()).toBe(403);
  const post = await page.request.post('/api/assets', {
    multipart: { kind: 'image', source: 'upload', media: { name: 'v.png', mimeType: 'image/png', buffer: png(4, 4) } },
  });
  expect(post.status()).toBe(403);
  const lib = await (await page.request.get('/api/assets?kind=image')).json();
  expect((await page.request.delete(`/api/assets/${lib.assets[0].id}`)).status()).toBe(403);
  const after = await (await page.request.get('/api/assets?kind=image')).json();
  expect(after.assets).toHaveLength(lib.assets.length);
  expect((await creativeOf(page, id)).headlines).toEqual(before.headlines);
});

test('Back, Cancel, the close X and reload on the edit page', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openEdit(page);
  const before = await creativeOf(page, id);
  const adsPage = adsAddress('/admin');

  // Browser Back returns to the ads page; Forward reopens the ad.
  await page.goBack();
  await expect(page).toHaveURL(adsPage);
  await expect(editPage(page)).toHaveCount(0);
  await expect(rowOf(page, id)).toBeVisible();
  await page.goForward();
  await expect(box(page, 'Final URL')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${editAddress(id, '/admin')}$`));

  // With unsaved changes Cancel asks first: dismissing keeps the edits, accepting leaves.
  await box(page, 'Headline 1').fill('Not saved');
  const asked = [];
  page.once('dialog', (d) => { asked.push(d.message()); d.dismiss(); });
  await page.getByTestId('cancel-edit').click();
  await expect(box(page, 'Headline 1')).toHaveValue('Not saved');
  page.once('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await page.getByTestId('cancel-edit').click();
  await expect(editPage(page)).toHaveCount(0);
  await expect(page).toHaveURL(adsPage);
  expect(asked).toEqual(['Discard unsaved changes?', 'Discard unsaved changes?']);
  expect((await creativeOf(page, id)).headlines).toEqual(before.headlines);

  // Back with unsaved changes asks too.
  await openEdit(page, id);
  await box(page, 'Headline 1').fill('Not saved either');
  page.once('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await page.goBack();
  await expect(editPage(page)).toHaveCount(0);
  await expect(page).toHaveURL(adsPage);
  expect(asked).toHaveLength(3);

  // Reloading the edit address reopens the edit page; the X closes it without asking.
  await openEdit(page, id);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${editAddress(id, '/admin')}$`));
  await expect(box(page, 'Headline 1')).toHaveValue(before.headlines[0]);
  await page.getByTestId('close-edit').click();
  await expect(editPage(page)).toHaveCount(0);
  await expect(page).toHaveURL(adsPage);
  await expect(rowOf(page, id)).toBeVisible();
  expect(asked).toHaveLength(3);
});

test('the edit address with a search or unknown ad shows a message instead', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const other = page.getByTestId('ad-row').filter({ has: page.locator('.adcell.search') }).first();
  const id = await other.getAttribute('data-id');

  await page.goto(editAddress(id, '/admin'));
  const error = editPage(page).locator('.ae-error');
  await expect(error).toHaveText(/Only display and video ads can be edited here/);
  await expect(page.getByTestId('save-ad')).toHaveCount(0);
  await expect(page.getByTestId('strength-bar')).not.toContainText('Ad strength');
  await error.getByRole('button', { name: 'Back to ads' }).click();
  await expect(editPage(page)).toHaveCount(0);
  await expect(page).toHaveURL(adsAddress('/admin'));
  await expect(rowOf(page, id)).toBeVisible();

  await page.goto(editAddress('000000000000000000000000', '/admin'));
  await expect(editPage(page).locator('.ae-error')).toContainText('This ad couldn’t be found');
  await page.goto(editAddress('..%2F..%2Fme', '/admin'));
  await expect(editPage(page).locator('.ae-error')).toContainText('This ad couldn’t be found');
  // The same id in an older ?adId= link.
  await page.goto('/admin/aw/ads/edit/display?adId=..%2F..%2Fme');
  await expect(editPage(page).locator('.ae-error')).toContainText('This ad couldn’t be found');
  expect(new URL(page.url()).search).toBe('');

  expect((await page.request.get(`/api/ads/${id}/creative`)).status()).toBe(404);
  expect((await page.request.put(`/api/ads/${id}/creative`, { data: { creative: {} } })).status()).toBe(404);
});

test('a video ad opens the edit page too, saves, and keeps a picture in the table', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const r = page.getByTestId('ad-row').first();
  const id = await r.getAttribute('data-id');
  await expect(r.locator('.thumb img')).toHaveCount(1);
  await openEdit(page, id);
  await box(page, 'Headline 1').fill('Watch our harvest');
  await saveAd(page);
  await expect(rowOf(page, id).locator('.ad-line').first()).toContainText('Watch our harvest');
  await expect(rowOf(page, id).locator('.thumb img')).toHaveCount(1);
});
