import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';
import { BRAND } from '../shared/brand.js';

// Asset details page of one ad (/aw/ads/assets/<adId>/<brand slug>): opened from "View asset details" in the
// ads table or from its own address, the assets listed from the ad's content (or a search ad's
// row, reloaded by Refresh), an ad never set up in the edit page (its own record only, with a
// note), sorting, the .csv download, Expand next to the side panels, the Ask Advisor card, the
// policy strip, help links and read-only viewers.

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
}

const assetsPage = (page) => page.getByTestId('asset-details');
const assetRows = (page) => page.getByTestId('asset-row');
const adRowIn = (page, campaign) => page.getByTestId('ad-row').filter({ has: page.locator('td.c-camp', { hasText: campaign }) }).first();
const typesShown = (page) => assetRows(page).evaluateAll((els) => els.map((e) => e.dataset.type));
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
// Page addresses have no '?': the ad id is a path part and every address ends in /<brand slug>.
const assetsAddress = (id) => `/aw/ads/assets/${id}/${BRAND.slug}`;
const editAddress = (id) => `/aw/ads/edit/display/${id}/${BRAND.slug}`;

// Opens the asset details page from the "View asset details" link of the first ad in `campaign`.
async function openAssets(page, campaign) {
  const r = adRowIn(page, campaign);
  const id = await r.getAttribute('data-id');
  await r.getByText(/View assets? details/).click();
  await expect(page).toHaveURL(new RegExp(`${assetsAddress(id)}$`));
  await expect(assetsPage(page).locator('h1')).toHaveText('Asset details');
  await expect(assetRows(page).first()).toBeVisible();
  return id;
}

async function creativeOf(page, id) {
  const res = await page.request.get(`/api/ads/${id}/creative`);
  expect(res.ok()).toBe(true);
  return (await res.json()).creative;
}

const filled = (list) => list.map((s) => String(s).trim()).filter(Boolean);
const STARTING = /This ad hasn.t been set up in the edit page yet\. These are its starting assets\./;
const refresh = (page) => page.locator('.topact[data-tip=Refresh]').click();

// The .csv as saved: UTF-8 with a byte order mark (checked here), split into lines.
async function csvLines(page) {
  await page.getByTestId('asset-download').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('asset-csv').click()]);
  expect(dl.suggestedFilename()).toBe('asset-details.csv');
  const text = fs.readFileSync(await dl.path(), 'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  return text.slice(1).split('\n');
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('display ad: every asset of its content, with image sizes, status and library dates', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openAssets(page, 'Leads-Display-1');
  const c = await creativeOf(page, id);
  const heads = filled(c.headlines);
  const descs = filled(c.descriptions);

  const expected = [
    ...heads.map(() => 'headline'), 'longHeadline', ...descs.map(() => 'description'), 'businessName',
    ...c.images.map(() => 'image'), ...c.logos.map(() => 'logo'), ...c.videos.map(() => 'video'), 'cta', 'finalUrl',
  ];
  expect(await typesShown(page)).toEqual(expected);
  await expect(page.getByTestId('asset-count')).toHaveText(`1 - ${expected.length} of ${expected.length}`);
  await expect(assetsPage(page).getByTestId('asset-ad')).toContainText('Leads-Display-1');

  const first = assetRows(page).first();
  await expect(first.locator('.asd-text')).toHaveText(heads[0]);
  await expect(first.locator('td.asd-c-type')).toContainText('Headline');
  await expect(first.locator('td.asd-c-date')).toHaveText('—');
  await expect(page.locator('[data-testid=asset-row][data-type=longHeadline] .asd-text')).toHaveText(c.longHeadline);
  await expect(page.locator('[data-testid=asset-row][data-type=cta] .asd-text')).toHaveText(c.options.cta);
  await expect(page.locator('[data-testid=asset-row][data-type=finalUrl] .asd-text')).toHaveText(c.finalUrl);

  // Pictures show a thumbnail and their size; library pictures show the day they were added.
  const img = page.locator('[data-testid=asset-row][data-type=image]').first();
  await expect(img.locator('img')).toBeVisible();
  await expect(img.getByTestId('asset-size')).toHaveText(`${c.images[0].w} × ${c.images[0].h}`);
  await expect(img.locator('td.asd-c-date')).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  await expect(page.locator('[data-testid=asset-row][data-type=logo] img').first()).toBeVisible();

  // An eligible ad: no policy strip, every asset "Eligible".
  await expect(page.getByTestId('asset-policy')).toHaveCount(0);
  await expect(page.locator('td.asd-c-status', { hasText: 'Eligible' })).toHaveCount(expected.length);
  await expect(page.locator('td.asd-c-status .red')).toHaveCount(0);

  // Content set up in the edit page: no "starting assets" note. No filter controls that filter
  // nothing; the admin's pencil opens the edit page.
  await expect(page.getByTestId('asset-starting')).toHaveCount(0);
  await expect(page.getByTestId('asset-status-chip')).toHaveCount(0);
  await expect(assetsPage(page).getByRole('button', { name: 'Filters' })).toHaveCount(0);
  await page.getByTestId('asset-edit').click();
  await expect(page).toHaveURL(new RegExp(`${editAddress(id)}$`));
  await expect(page.getByTestId('ad-edit')).toBeVisible();
});

test('sort by asset type and by asset', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openAssets(page, 'Leads-Display-1');
  const c = await creativeOf(page, id);
  const LABEL = {
    headline: 'Headline', longHeadline: 'Long headline', description: 'Description', businessName: 'Business name',
    image: 'Image', logo: 'Logo', video: 'Video', cta: 'Call to action', finalUrl: 'Final URL', displayUrl: 'Display URL',
  };
  const labels = async () => (await typesShown(page)).map((t) => LABEL[t]);
  const unsorted = await labels();

  await page.getByTestId('sort-type').click();
  await expect(page.locator('th', { has: page.getByTestId('sort-type') })).toHaveAttribute('aria-sort', 'ascending');
  const asc = await labels();
  expect(asc).toEqual([...unsorted].sort(collator.compare));
  await page.getByTestId('sort-type').click();
  await expect(page.locator('th', { has: page.getByTestId('sort-type') })).toHaveAttribute('aria-sort', 'descending');
  expect(await labels()).toEqual([...unsorted].sort((a, b) => collator.compare(b, a)));

  // Asset: the text (or file name) of each asset, A to Z then Z to A.
  const headlineTexts = () => page.locator('[data-testid=asset-row][data-type=headline] .asd-text').allInnerTexts();
  const heads = filled(c.headlines);
  await page.getByTestId('sort-asset').click();
  await expect(page.locator('th', { has: page.getByTestId('sort-asset') })).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('th', { has: page.getByTestId('sort-type') })).toHaveAttribute('aria-sort', 'none');
  expect(await headlineTexts()).toEqual([...heads].sort(collator.compare));
  await page.getByTestId('sort-asset').click();
  expect(await headlineTexts()).toEqual([...heads].sort((a, b) => collator.compare(b, a)));
  await expect(assetRows(page)).toHaveCount(unsorted.length);
});

test('download the table as .csv, and expand it to the whole window', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openAssets(page, 'Leads-Display-1');
  const c = await creativeOf(page, id);
  const n = await assetRows(page).count();

  const lines = await csvLines(page);
  expect(lines[0]).toBe('Asset,Status,Asset type,Last updated,File URL');
  expect(lines).toHaveLength(n + 1);
  expect(lines[1]).toBe(`${filled(c.headlines)[0]},Eligible,Headline,,`);
  const imageLine = lines.find((l) => l.includes(',Image,'));
  expect(imageLine).toContain(`(${c.images[0].w} × ${c.images[0].h})`);
  expect(imageLine).toContain(c.images[0].url);

  const card = page.getByTestId('asset-card');
  await page.getByTestId('asset-expand').click();
  await expect(card).toHaveClass(/\bfull\b/);
  await expect(page.getByTestId('asset-expand')).toContainText('Collapse');
  const box = await card.boundingBox();
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBeGreaterThan(1500);
  await page.keyboard.press('Escape');
  await expect(card).not.toHaveClass(/\bfull\b/);
  await expect(page.getByTestId('asset-expand')).toContainText('Expand');

  // Expanded, a row's "?" opens Quick help beside the table, not hidden under it.
  await page.getByTestId('asset-expand').click();
  await expect(card).toHaveClass(/\bfull\b/);
  const first = assetRows(page).first();
  await first.hover();
  await first.getByTestId('asset-help').click();
  const help = page.getByTestId('quick-help');
  await expect(help).toBeVisible();
  const [cardBox, helpBox] = [await card.boundingBox(), await help.boundingBox()];
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(helpBox.x + 1);
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid=quick-help]'),
    [helpBox.x + helpBox.width / 2, helpBox.y + helpBox.height / 2])).toBe(true);
  await page.getByTestId('asset-expand').click();
  await expect(card).not.toHaveClass(/\bfull\b/);
});

test('.csv opens cleanly in spreadsheets: ad text that starts like a formula stays text', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await adRowIn(page, 'Leads-Display-1').getAttribute('data-id');
  const c = await creativeOf(page, id);
  const headlines = ['+50% more yield', '=HYPERLINK("http://x.io")', ...filled(c.headlines).slice(2)];
  const put = await page.request.put(`/api/ads/${id}/creative`, {
    data: { creative: { ...c, headlines, admin: { ...c.admin, afterSave: 'keep' } } },
  });
  expect(put.ok()).toBe(true);
  await openAssets(page, 'Leads-Display-1');
  await expect(assetRows(page).first().locator('.asd-text')).toHaveText('+50% more yield');

  const lines = await csvLines(page);
  expect(lines[1]).toBe("'+50% more yield,Eligible,Headline,,");
  expect(lines[2]).toBe('"\'=HYPERLINK(""http://x.io"")",Eligible,Headline,,');
  // Sizes keep their "×" (read back as UTF-8 above).
  expect(lines.find((l) => l.includes(',Image,'))).toMatch(/\(\d+ × \d+\)/);
});

test('Ask Advisor card: Analyze asks about this ad, Dismiss is remembered', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openAssets(page, 'Leads-Display-1');
  const card = page.getByTestId('asset-advisor');
  await expect(card).toContainText('Analyze this ad with Ask Advisor');

  // Ad names repeat ("Ad #1" is in several campaigns): the question names the campaign, and the
  // request carries the ad's id.
  await page.evaluate(() => {
    window.__ask = [];
    window.addEventListener('app:ask', (e) => window.__ask.push(e.detail));
  });
  await card.getByTestId('advisor-analyze').click();
  const adv = page.getByTestId('advisor');
  await expect(adv).toBeVisible();
  await expect(adv.locator('.adv-msg.me').last()).toHaveText('Analyze my ad Ad #1 in Leads-Display-1');
  expect(await page.evaluate(() => window.__ask)).toEqual([{ question: 'Analyze my ad Ad #1 in Leads-Display-1', adId: id }]);

  await card.getByTestId('advisor-dismiss').click();
  await expect(card).toHaveCount(0);
  // Reopened from its address: still dismissed, and the page loads on its own.
  await page.reload();
  await expect(assetsPage(page).locator('h1')).toHaveText('Asset details');
  await expect(assetRows(page).first()).toBeVisible();
  await expect(page.getByTestId('asset-advisor')).toHaveCount(0);
});

test('a not eligible video ad shows the policy strip and red statuses; its pencil returns here', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openAssets(page, 'Video views - 2025-04-04');
  await expect(page.getByTestId('asset-policy').locator('.asd-policy-text')).toHaveText('Ad may be limited: Policy (Unreliable claims), Campaign has ended +1');
  // Never set up in the edit page: its own record (4 lines of text, its video), with a note.
  await expect(page.getByTestId('asset-starting')).toContainText(STARTING);
  const n = await assetRows(page).count();
  expect(n).toBe(5);
  await expect(page.locator('td.asd-c-status .red', { hasText: 'Not eligible' })).toHaveCount(n);
  await expect(assetRows(page).first().locator('td.asd-c-status')).toContainText('Campaign has ended');

  // Edit page and back again (top-bar X / browser Back) lands on the asset details page.
  await page.getByTestId('asset-edit').click();
  await expect(page).toHaveURL(new RegExp(`${editAddress(id)}$`));
  await page.getByTestId('close-edit').click();
  await expect(page).toHaveURL(new RegExp(`${assetsAddress(id)}$`));
  await expect(assetsPage(page)).toBeVisible();
  await expect(assetRows(page)).toHaveCount(n);
  await expect(page.getByTestId('asset-starting')).toBeVisible();
});

test('an ad never set up in the edit page lists only its own record, not sample content', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openAssets(page, 'Video test views - 2025-04-18');
  const note = page.getByTestId('asset-starting');
  await expect(note).toContainText(STARTING);
  await expect(note).toContainText('Use Edit ad');
  expect(await typesShown(page)).toEqual(['headline', 'headline', 'headline', 'headline', 'video']);
  expect(await page.locator('[data-testid=asset-row][data-type=headline] .asd-text').allInnerTexts())
    .toEqual(['Subscribe', 'Boost Your Poor cr…', 'Knowledge for a Be…', 'Increase Crop Yield…']);
  const video = page.locator('[data-testid=asset-row][data-type=video]');
  await expect(video).toContainText('Harvest festival');
  await expect(video).toContainText('No video file added yet');
  // None of the edit page's starting samples: placeholder URL and description, sample pictures.
  const table = page.getByTestId('asset-table');
  await expect(table).not.toContainText('example.com');
  await expect(table).not.toContainText('Simple, practical ideas');
  await expect(table.locator('img')).toHaveCount(0);
  const lines = await csvLines(page);
  expect(lines).toHaveLength(6);
  expect(lines.join('\n')).not.toContain('example.com');

  // Once saved from the edit page, its content is listed and the note goes (Refresh, then reload).
  const c = await creativeOf(page, id);
  const put = await page.request.put(`/api/ads/${id}/creative`, { data: { creative: { ...c, headlines: ['Fresh harvest picks', ...c.headlines.slice(1)] } } });
  expect(put.ok()).toBe(true);
  await refresh(page);
  await expect(note).toHaveCount(0);
  await expect(assetRows(page).first().locator('.asd-text')).toHaveText('Fresh harvest picks');
  await expect(page.locator('[data-testid=asset-row][data-type=image]').first()).toBeVisible();
  await page.reload();
  await expect(assetRows(page).first().locator('.asd-text')).toHaveText('Fresh harvest picks');
  await expect(page.getByTestId('asset-starting')).toHaveCount(0);
});

test('search ad: the text from its row, also when opened from the address; Ads goes back', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const r = adRowIn(page, 'Website traffic-Search-JAN2026');
  const headlines = await r.locator('.sa-head .link [data-edit^="line"]').allInnerTexts();
  await openAssets(page, 'Website traffic-Search-JAN2026');
  const expected = ['headline', 'headline', 'headline', 'description', 'displayUrl'];
  expect(await typesShown(page)).toEqual(expected);
  expect(await page.locator('[data-testid=asset-row][data-type=headline] .asd-text').allInnerTexts()).toEqual(headlines);
  // The path shown under the ad is its display URL (search ads have no final URL), with no help link.
  const shown = page.locator('[data-testid=asset-row][data-type=displayUrl]');
  await expect(shown.locator('.asd-text')).toHaveText('www.example.com/crops');
  await expect(shown.locator('td.asd-c-type')).toHaveText('Display URL');
  await expect(shown.getByTestId('asset-help')).toHaveCount(0);
  // Search ads have no edit page, so no pencil.
  await expect(page.getByTestId('asset-edit')).toHaveCount(0);

  await page.reload();
  await expect(assetRows(page)).toHaveCount(expected.length);
  expect(await typesShown(page)).toEqual(expected);

  await page.getByTestId('asset-crumb').click();
  await expect(page).toHaveURL(new RegExp(`/admin/aw/ads/${BRAND.slug}$`));
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
});

test('search ad opened from the ads table: Refresh shows changes made elsewhere, and a deleted ad', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const id = await openAssets(page, 'Website traffic-Search-JAN2026');
  await expect(page.getByTestId('asset-policy')).toHaveCount(0);

  // Changed in another session: a line of text and the status.
  for (const data of [{ field: 'headline', index: 0, value: 'Fresh Rabi Seeds' }, { field: 'eligibility', value: 'Not eligible' }]) {
    expect((await page.request.patch(`/api/ads/${id}`, { data })).ok()).toBe(true);
  }
  await refresh(page);
  await expect(assetRows(page).first().locator('.asd-text')).toHaveText('Fresh Rabi Seeds');
  await expect(page.getByTestId('asset-policy')).toBeVisible();
  await expect(page.locator('td.asd-c-status .red', { hasText: 'Not eligible' }).first()).toBeVisible();

  // Deleted in another session.
  expect((await page.request.delete('/api/ads', { data: { ids: [id] } })).ok()).toBe(true);
  await refresh(page);
  await expect(assetsPage(page).getByRole('alert')).toContainText('This ad couldn’t be found');
});

test('viewer: read-only page, help links open Quick help, unknown ads say so', async ({ page }) => {
  await login(page, '/', 'viewer');
  const videoId = await adRowIn(page, 'Video test views - 2025-04-18').getAttribute('data-id');
  const id = await openAssets(page, 'Leads-Display-1');
  await expect(page.getByTestId('asset-edit')).toHaveCount(0);
  await expect(assetsPage(page).getByRole('button', { name: 'Filters' })).toHaveCount(0);
  await expect(page.getByTestId('asset-status-chip')).toHaveCount(0);
  await expect(assetsPage(page).locator('.editable, input, textarea, select')).toHaveCount(0);
  await expect(page.getByTestId('asset-download')).toBeVisible();
  await expect(page.getByTestId('asset-expand')).toBeVisible();

  await page.evaluate(() => {
    window.__help = [];
    window.addEventListener('app:help', (e) => window.__help.push(e.detail.topic));
  });
  const first = assetRows(page).first();
  await first.hover();
  await first.getByTestId('asset-help').click();
  await page.getByTestId('asset-advisor').getByRole('link', { name: 'Learn more' }).dispatchEvent('click');
  await page.locator('[data-testid=asset-row][data-type=image]').first().getByTestId('asset-help').dispatchEvent('click');
  expect(await page.evaluate(() => window.__help)).toEqual(['headlines', 'advisor', 'images']);

  // Straight from the address (viewer site), and an ad that doesn't exist.
  await page.goto(assetsAddress(id));
  await expect(assetRows(page).first()).toBeVisible();
  // An ad not set up yet: the note, without pointing a viewer at Edit ad.
  await page.goto(assetsAddress(videoId));
  await expect(page.getByTestId('asset-starting')).toContainText(STARTING);
  await expect(page.getByTestId('asset-starting')).not.toContainText('Edit ad');
  await expect(page.getByTestId('asset-edit')).toHaveCount(0);
  await page.goto(assetsAddress('000000000000000000000000'));
  await expect(assetsPage(page).getByRole('alert')).toContainText('This ad couldn’t be found');
  await assetsPage(page).getByRole('button', { name: 'Back to ads' }).click();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
});
