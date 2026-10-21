import fs from 'node:fs';
import zlib from 'node:zlib';
import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';
import { fmtDay } from '../shared/dates.js';

// Table controls: status filters and the View's filter count, submenus by click and keyboard,
// viewers' create, select and settings controls doing nothing, saved column sets, the stacked chart, Layers, Segment, the week
// start of the date presets, the links that open Quick help / Advisor / Feedback, views,
// sorting and CSV columns, controls with nothing behind them (shown like the others), the
// date box's blue border after a pick, the footer's time zone, and Upload display ads.

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
}

const settled = (page) => expect(page.locator('.progress')).toHaveCount(0);
const nav = (page, label) => page.locator('.nav-group .nav-item:not(.group-head)', { hasText: new RegExp(`^${label}$`) });
const campaignRow = (page, name) => page.getByTestId('campaign-row').filter({ has: page.getByTestId('campaign-link').filter({ hasText: name }) });
const adGroupRows = (page) => page.getByTestId('adgroup-row');
const toolBtn = (page, label) => page.locator('.table-toolbar .toolbtn', { hasText: label });
const num = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;

async function openCampaigns(page) {
  await nav(page, 'Campaigns').click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await settled(page);
}

async function openAds(page) {
  await nav(page, 'Ads').click();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await settled(page);
}

// Every app:help / app:ask / app:feedback event the page sends, in order.
async function recordEvents(page) {
  await page.evaluate(() => {
    window.__events = [];
    for (const t of ['app:help', 'app:ask', 'app:feedback']) window.addEventListener(t, (e) => window.__events.push([t, e.detail]));
  });
}
const events = (page) => page.evaluate(() => window.__events);

// Untick / tick statuses in an open status filter editor, then Apply.
async function setStatuses(page, want) {
  const card = page.getByTestId('status-filter');
  await expect(card).toBeVisible();
  // Tick first, so the last ticked box is never the one being unticked.
  for (const s of want) await card.getByLabel(s, { exact: true }).check();
  for (const s of ['Enabled', 'Paused'].filter((x) => !want.includes(x))) await card.getByLabel(s, { exact: true }).uncheck();
  await card.getByTestId('status-filter-apply').click();
  await expect(card).toHaveCount(0);
}

// A small solid-colour RGB PNG, built in memory (as in ad-edit.spec.js).
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
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [0x1a, 0x73, 0xe8]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A CSV file as rows of cells (quoted cells may hold commas and doubled quotes).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

const rowIds = (page) => page.getByTestId('ad-row').evaluateAll((els) => els.map((e) => e.dataset.id));
const createItem = (page, label) => page.locator('.create-menu .menu-item', { hasText: label });

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

// + > Upload display ads, then the files picked in the file chooser; resolves to the dialog.
async function chooseUploads(page, files) {
  await page.getByRole('button', { name: 'Create ad' }).click();
  const chooser = page.waitForEvent('filechooser');
  await createItem(page, 'Upload display ads').click();
  const fc = await chooser;
  expect(fc.isMultiple()).toBe(true);
  await fc.setFiles(files);
  const dlg = page.getByTestId('upload-display-dialog');
  await expect(dlg).toBeVisible();
  return dlg;
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('status filters narrow each page on their own and the View counts its filters', async ({ page }) => {
  await login(page, '/', 'viewer');
  await expect(page.getByTestId('view-filters')).toHaveText('View (2 filters)');

  // Campaigns: one filter in the View; keep enabled campaigns only (2 of 7).
  await openCampaigns(page);
  await expect(page.getByTestId('view-filters')).toHaveText('View (1 filter)');
  const campChip = page.getByTestId('filter-chip-campaign');
  await expect(campChip).toHaveText('Campaign status: Enabled, Paused');
  await campChip.click();
  const card = page.getByTestId('status-filter');
  await card.getByLabel('Paused', { exact: true }).uncheck();
  // The last ticked status can't be unticked.
  await expect(card.getByLabel('Enabled', { exact: true })).toBeDisabled();
  await card.getByTestId('status-filter-apply').click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(2);
  await expect(campChip).toHaveText('Campaign status: Enabled');

  // Cancel leaves the filter as it was.
  await campChip.click();
  await card.getByLabel('Paused', { exact: true }).check();
  await card.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(2);

  // The Ads page keeps its own filters.
  await openAds(page);
  await expect(page.getByTestId('filter-chip-campaign')).toHaveText('Campaign status: Enabled, Paused');
  await expect(page.getByTestId('filter-chip-adgroup')).toHaveText('Ad group status: Enabled, Paused');
  await page.getByTestId('filter-chip-campaign').click();
  await setStatuses(page, ['Enabled']);
  await expect(page.getByTestId('ad-row')).toHaveCount(4);

  // Ad status (over the table): paused ads only -> none.
  await page.getByTestId('filter-chip-ad').click();
  await setStatuses(page, ['Paused']);
  await expect(page.getByTestId('ad-row')).toHaveCount(0);
  await expect(page.getByTestId('filter-chip-ad')).toHaveText('Ad status: Paused');

  // The funnel lists the page's filters and edits them too.
  await expect(page.getByTestId('filter-funnel').locator('.badge')).toHaveText('1');
  await page.getByTestId('filter-funnel').click();
  const menu = page.getByTestId('filter-menu');
  await expect(menu).toContainText('Ad status: Paused');
  await expect(menu).toContainText('Campaign status: Enabled');
  await menu.locator('.menu-item', { hasText: 'Ad status' }).click();
  await setStatuses(page, ['Enabled', 'Paused']);
  await expect(page.getByTestId('ad-row')).toHaveCount(4);

  // Back on Campaigns its own filter is still set; the funnel's menu clears it.
  await nav(page, 'Campaigns').click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(2);
  await expect(campChip).toHaveText('Campaign status: Enabled');
  await page.getByTestId('filter-funnel').click();
  await page.getByTestId('filter-menu').locator('.menu-item', { hasText: 'Campaign status: Enabled' }).click();
  await setStatuses(page, ['Enabled', 'Paused']);
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await expect(campChip).toHaveText('Campaign status: Enabled, Paused');
});

test('create submenus open by click and keyboard and close with Esc / Left arrow', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await openCampaigns(page);
  await page.getByRole('button', { name: 'Create campaign' }).click();
  const item = page.locator('.create-menu .menu-item', { hasText: 'New campaign' });
  const sub = page.locator('.create-menu .submenu');

  // A tap (click with no hover first) opens it.
  await item.dispatchEvent('click');
  await expect(sub).toBeVisible();
  await expect(item).toHaveAttribute('aria-expanded', 'true');

  // Keyboard: Esc closes only the submenu; Enter / Right arrow open it with focus on its first item.
  await item.focus();
  await page.keyboard.press('Escape');
  await expect(sub).toHaveCount(0);
  await expect(page.locator('.create-menu')).toBeVisible();
  await expect(item).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(sub.locator('.menu-item').first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(sub).toHaveCount(0);
  await expect(item).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(sub.locator('.menu-item').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('campaign-row')).toHaveCount(8);
});

test('viewers get the create button, row checkboxes and the settings form; using them changes nothing and shows no message', async ({ page }) => {
  await login(page, '/', 'viewer');
  const writes = watchWrites(page);
  await watchToasts(page);
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  const choosers = [];
  page.on('filechooser', (fc) => choosers.push(fc));

  // + > Video ad adds no row; + > Upload display ads opens no file chooser.
  const fab = page.getByRole('button', { name: 'Create ad' });
  await expect(fab).toBeVisible();
  await expect(fab).toHaveAttribute('data-tip', 'Create ad');
  await fab.click();
  await createItem(page, 'Video ad').click();
  await expect(page.locator('.create-menu')).toHaveCount(0);
  await fab.click();
  await createItem(page, 'Upload display ads').click();
  await expect(page.locator('.create-menu')).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await expect(page.getByTestId('upload-display-input')).toHaveCount(0);
  await expect(page.getByTestId('upload-display-dialog')).toHaveCount(0);
  expect(choosers).toHaveLength(0);

  // Row checkboxes and Select all show; the selection bar's Delete does nothing. No per-row trash button.
  const checks = page.locator('.grid-body [data-testid=ad-row] input[type=checkbox]');
  await expect(checks).toHaveCount(9);
  await expect(page.locator('.row-del')).toHaveCount(0);
  await page.locator('.grid-head').getByRole('checkbox', { name: 'Select all' }).check();
  await expect(page.getByTestId('selection-bar')).toContainText('9 selected');
  await page.getByTestId('delete-selected').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await expect(page.getByTestId('selection-bar')).toContainText('9 selected');
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await expect(page.getByTestId('selection-bar')).toHaveCount(0);
  await checks.first().check();
  await expect(page.getByTestId('selection-bar')).toContainText('1 selected');
  await page.getByTestId('delete-selected').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await expect(checks.first()).toBeChecked();
  await page.getByRole('button', { name: 'Clear selection' }).click();

  // Campaigns: the same create button and checkboxes.
  await openCampaigns(page);
  await expect(page.getByRole('button', { name: 'Create campaign' })).toBeVisible();
  await expect(page.locator('.grid-body [data-testid=campaign-row] input[type=checkbox]')).toHaveCount(7);
  await expect(page.locator('.grid-head').getByRole('checkbox', { name: 'Select all' })).toBeVisible();
  const row = campaignRow(page, 'Leads-Display-1');
  await row.locator('input[type=checkbox]').check();
  await expect(page.getByTestId('selection-bar')).toContainText('1 selected');
  await page.getByTestId('delete-selected').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await page.getByRole('button', { name: 'Clear selection' }).click();

  // The settings dialog is the admin's form (fields enabled, Cancel and Save); Save keeps it open and saves nothing.
  await row.hover();
  await row.getByRole('button', { name: 'Campaign settings' }).click();
  const dlg = page.getByTestId('entity-settings');
  await expect(dlg.getByTestId('settings-read-only')).toHaveCount(0);
  await expect(dlg.getByTestId('settings-close')).toHaveCount(0);
  await expect(dlg.getByLabel('Campaign name')).toHaveValue('Leads-Display-1');
  await expect(dlg.getByLabel('Average daily budget')).toBeEnabled();
  await expect(dlg.getByLabel('Status', { exact: true })).toBeEnabled();
  await expect(dlg.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(dlg.getByTestId('settings-save')).toBeVisible();
  await dlg.getByLabel('Average daily budget').fill('99');
  await dlg.getByLabel('Status', { exact: true }).selectOption('paused');
  await dlg.getByTestId('settings-save').click();
  await page.waitForTimeout(300);
  await expect(dlg).toBeVisible();
  await expect(dlg.getByLabel('Average daily budget')).toHaveValue('99');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(row.locator('td.c-budget')).toHaveText(/\$40\.00\/day/);
  await expect(row.locator('td.c-dot .dot.green')).toHaveCount(1);

  expect(writes).toEqual([]);
  expect(dialogs).toEqual([]);
  expect(await toasts(page)).toEqual([]);
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('admins keep the create button, row checkboxes and editable settings', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await expect(page.locator('.grid-body input[type=checkbox]')).toHaveCount(9);
  await expect(page.locator('.row-del')).toHaveCount(9);
  await page.getByRole('button', { name: 'Create ad' }).click();
  await expect(page.locator('.create-menu .menu-item', { hasText: 'Ad variation' })).toBeVisible();
  await expect(page.locator('.create-menu .menu-item', { hasText: 'Upload display ads' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await openCampaigns(page);
  const row = campaignRow(page, 'Leads-Display-1');
  await row.hover();
  await row.getByRole('button', { name: 'Campaign settings' }).click();
  const dlg = page.getByTestId('entity-settings');
  await expect(dlg.getByLabel('Average daily budget')).toBeEnabled();
  await expect(dlg.getByTestId('settings-save')).toBeVisible();
  await expect(dlg.getByTestId('settings-read-only')).toHaveCount(0);
});

test('column sets: a name is required, Apply saves the set, and it can be picked or deleted', async ({ page }) => {
  await login(page, '/', 'viewer');
  await openCampaigns(page);
  const ctr = page.locator('.grid-head th[data-col=ctr]');
  await expect(ctr).toHaveCount(1);
  const panel = page.getByTestId('columns-panel');
  const apply = () => panel.locator('.colpanel-actions button', { hasText: 'Apply' }).click();

  await toolBtn(page, 'Columns').click();
  await expect(panel.getByTestId('column-set-name')).toHaveCount(0);
  await panel.getByTestId('save-column-set').check();
  await apply();
  await expect(panel.getByTestId('column-set-error')).toHaveText('Enter a name for this column set');
  await panel.getByTestId('column-set-name').fill('   ');
  await apply();
  await expect(panel.getByTestId('column-set-error')).toBeVisible();

  await panel.getByTestId('column-set-name').fill('Lean set');
  await panel.locator('.colsec-head', { hasText: 'Performance' }).click();
  await panel.locator('.colsec.open .colcheck', { hasText: /^CTR$/ }).locator('input').uncheck();
  await apply();
  await expect(panel).toHaveCount(0);
  await expect(ctr).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ap.colsets.campaigns')));
  expect(saved.map((s) => s.name)).toEqual(['Lean set']);
  expect(saved[0].cols).not.toContain('ctr');

  // Reset the table's columns, then put the saved set back.
  await toolBtn(page, 'More').click();
  await page.locator('.menu-item', { hasText: 'Reset columns' }).click();
  await expect(ctr).toHaveCount(1);
  await toolBtn(page, 'Columns').click();
  await expect(panel.getByTestId('column-set')).toHaveCount(1);
  await panel.getByTestId('column-set').getByRole('button', { name: /^Lean set/ }).click();
  await apply();
  await expect(ctr).toHaveCount(0);

  // Sets are kept per table: the Ads page has none.
  await openAds(page);
  await toolBtn(page, 'Columns').click();
  await expect(panel.getByTestId('column-sets')).toHaveCount(0);
  await panel.locator('.colpanel-actions button', { hasText: 'Cancel' }).click();

  // Delete it.
  await openCampaigns(page);
  await toolBtn(page, 'Columns').click();
  await panel.getByRole('button', { name: 'Delete column set Lean set' }).click();
  await expect(panel.getByTestId('column-sets')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ap.colsets.campaigns')))).toEqual([]);
});

test('stacked time series chart draws one area per selected metric and is remembered', async ({ page }) => {
  await login(page, '/', 'viewer');
  const chart = page.getByTestId('chart');
  await expect(chart).toHaveAttribute('data-type', 'line');
  await page.locator('.sc-tools .toolbtn', { hasText: 'Adjust' }).click();
  await page.locator('.sc-tools .menu-item', { hasText: 'Chart type' }).click();
  const stacked = page.locator('.sc-tools .submenu .menu-item', { hasText: 'Stacked time series chart' });
  await expect(stacked).toBeEnabled();
  await stacked.click();
  await expect(chart).toHaveAttribute('data-type', 'stacked');
  await expect(chart.locator('.chart-area')).toHaveCount(1);
  await page.getByTestId('scorecard-cost').locator('.sc-value').click();
  await expect(chart.locator('.chart-area')).toHaveCount(2);

  await page.reload();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await expect(page.getByTestId('chart')).toHaveAttribute('data-type', 'stacked');
  await expect(page.getByTestId('chart').locator('.chart-area')).toHaveCount(2);

  await page.locator('.sc-tools .toolbtn', { hasText: 'Adjust' }).click();
  await page.locator('.sc-tools .menu-item', { hasText: 'Chart type' }).click();
  await page.locator('.sc-tools .submenu .menu-item', { hasText: 'Time series chart', hasNotText: 'Stacked' }).click();
  await expect(page.getByTestId('chart')).toHaveAttribute('data-type', 'line');
  await expect(page.getByTestId('chart').locator('.chart-area')).toHaveCount(0);
});

test('Layers group the rows of a campaign or ad group page under parent rows with subtotals', async ({ page }) => {
  await login(page, '/', 'viewer');
  await openCampaigns(page);
  await campaignRow(page, 'Website traffic-Search-JAN2026').getByTestId('campaign-link').click();
  await expect(adGroupRows(page)).toHaveCount(1);
  await settled(page);

  await toolBtn(page, 'Layers').click();
  await page.locator('.segment-menu .menu-item', { hasText: /^Campaign$/ }).click();
  const layer = page.getByTestId('layer-row');
  await expect(layer).toHaveCount(1);
  await expect(layer).toContainText('Website traffic-Search-JAN2026');
  await expect(layer.locator('td[data-metric=impressions]'))
    .toHaveText(await page.getByTestId('total-scope').locator('td[data-metric=impressions]').innerText());
  await layer.getByTestId('layer-toggle').click();
  await expect(adGroupRows(page)).toHaveCount(0);
  await layer.getByTestId('layer-toggle').click();
  await expect(adGroupRows(page)).toHaveCount(1);
  await toolBtn(page, 'Layers').click();
  await page.locator('.segment-menu .menu-item', { hasText: /^None$/ }).click();
  await expect(layer).toHaveCount(0);
  await expect(adGroupRows(page)).toHaveCount(1);

  // Ads of the ad group, under an "Ad group" parent row whose numbers add up its ads.
  await adGroupRows(page).first().getByTestId('adgroup-link').click();
  await expect(page.getByTestId('ad-row')).toHaveCount(2);
  await settled(page);
  await toolBtn(page, 'Layers').click();
  await page.locator('.segment-menu .menu-item', { hasText: /^Ad group$/ }).click();
  await expect(layer).toHaveCount(1);
  await expect(layer).toContainText('Ad group 1');
  await expect(layer).toContainText('(2)');
  const parts = await page.getByTestId('ad-row').locator('td[data-metric=impressions]').allInnerTexts();
  expect(num(await layer.locator('td[data-metric=impressions]').innerText())).toBe(parts.reduce((a, s) => a + num(s), 0));
});

test('Segment > Time splits rows into periods that add up; segments without data look like the others', async ({ page }) => {
  await login(page, '/', 'viewer');
  await settled(page);
  await toolBtn(page, 'Segment').click();
  const menu = page.locator('.segment-menu');
  // No greyed-out items and no "Not available" tips: they are plain menu items.
  await expect(menu.locator('.mi-na')).toHaveCount(0);
  await expect(menu.locator('[data-tip]')).toHaveCount(0);
  await expect(menu.locator('.menu-item:disabled')).toHaveCount(0);
  for (const l of ['Click type', 'Conversions', 'Device', 'Network (with search partners)', 'Top vs. Other', 'Ad destination', 'Keyword text']) {
    const item = menu.locator('.menu-item', { hasText: l });
    await expect(item).toHaveCount(1);
    await expect(item).toBeEnabled();
    await expect(item).not.toHaveAttribute('data-tip');
  }
  await menu.locator('.menu-item', { hasText: /^Time/ }).click();
  await expect(menu.locator('.submenu .menu-item')).toHaveText(['Day', 'Week', 'Month', 'Quarter', 'Year']);
  await menu.locator('.submenu .menu-item', { hasText: /^Day$/ }).click();
  await settled(page);

  const ad = page.getByTestId('ad-row').filter({ hasText: 'Leads-Display-1' }).first();
  const id = await ad.getAttribute('data-id');
  const days = page.locator(`[data-testid=segment-row][data-parent="${id}"]`);
  await expect(days.first()).toBeVisible();
  expect(await days.count()).toBeLessThanOrEqual(7);
  for (const m of ['impressions', 'cost']) {
    const parts = await days.locator(`td[data-metric=${m}]`).allInnerTexts();
    expect(parts.reduce((a, s) => a + num(s), 0)).toBeCloseTo(num(await ad.locator(`td[data-metric=${m}]`).innerText()), 2);
  }

  // Campaigns by month: one row per month of the range under each campaign.
  await openCampaigns(page);
  await toolBtn(page, 'Segment').click();
  await menu.locator('.menu-item', { hasText: /^Time/ }).click();
  await menu.locator('.submenu .menu-item', { hasText: /^Month$/ }).click();
  await settled(page);
  const leads = campaignRow(page, 'Leads-Display-1');
  const months = page.locator(`[data-testid=segment-row][data-parent="${await leads.getAttribute('data-id')}"]`);
  await expect(months.first()).toBeVisible();
  const parts = await months.locator('td[data-metric=impressions]').allInnerTexts();
  expect(parts.reduce((a, s) => a + num(s), 0)).toBe(num(await leads.locator('td[data-metric=impressions]').innerText()));

  await toolBtn(page, 'Segment').click();
  await menu.locator('.menu-item', { hasText: /^None$/ }).click();
  await expect(page.getByTestId('segment-row')).toHaveCount(0);
});

test('week presets can start on Sunday or Monday', async ({ page }) => {
  await login(page, '/', 'viewer');
  await page.getByTestId('date-trigger').click();
  await page.getByTestId('week-start-thisweek').click();
  await page.locator('.dp-week-opt', { hasText: 'Mon – Today' }).click();
  await expect(page.locator('.dp-panel')).toHaveCount(0);
  await expect(page.getByTestId('preset-label')).toHaveText(/This week|Today/);
  await page.getByTestId('date-trigger').click();
  expect(new Date(await page.getByLabel('Start date').inputValue()).getDay()).toBe(1);
  await expect(page.locator('.dp-week-row').first()).toContainText('This week (Mon – Today)');

  await page.getByTestId('week-start-lastweek').click();
  await page.locator('.dp-week-opt', { hasText: 'Mon – Sun' }).click();
  await page.getByTestId('date-trigger').click();
  expect(new Date(await page.getByLabel('Start date').inputValue()).getDay()).toBe(1);
  expect(new Date(await page.getByLabel('End date').inputValue()).getDay()).toBe(0);

  // Sunday start again.
  await page.getByTestId('week-start-lastweek').click();
  await page.locator('.dp-week-opt', { hasText: 'Sun – Sat' }).click();
  await page.getByTestId('date-trigger').click();
  expect(new Date(await page.getByLabel('Start date').inputValue()).getDay()).toBe(0);
  expect(new Date(await page.getByLabel('End date').inputValue()).getDay()).toBe(6);
});

test('the date box has a blue border right after a range is picked, until focus moves on', async ({ page }) => {
  await login(page, '/', 'viewer');
  await settled(page);
  const box = page.getByTestId('date-trigger');
  await expect(box).not.toHaveClass(/\bpicked\b/);

  // A preset: the panel closes, the range changes and the box turns blue.
  await box.click();
  await expect(box).not.toHaveClass(/\bpicked\b/);
  await page.locator('.dp-preset', { hasText: /^Yesterday$/ }).click();
  await expect(page.locator('.dp-panel')).toHaveCount(0);
  await expect(page.getByTestId('preset-label')).toHaveText('Yesterday');
  await expect(box).toHaveClass(/\bpicked\b/);
  await expect(box).toBeFocused();
  await settled(page);
  await expect(box).toHaveClass(/\bpicked\b/);
  // A click elsewhere takes the blue border away.
  await page.locator('.filterbar .fb-label').click();
  await expect(box).not.toHaveClass(/\bpicked\b/);

  // Apply does the same; Tab away takes it off too.
  await box.click();
  await page.locator('.dp-foot').getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.dp-panel')).toHaveCount(0);
  await expect(box).toHaveClass(/\bpicked\b/);
  await page.keyboard.press('Tab');
  await expect(box).not.toHaveClass(/\bpicked\b/);

  // Cancel picks nothing, so no blue border.
  await box.click();
  await page.locator('.dp-foot').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.dp-panel')).toHaveCount(0);
  await expect(box).not.toHaveClass(/\bpicked\b/);
});

test('help links open Quick help; View feedback and Optimize campaign send their requests', async ({ page }) => {
  await login(page, '/', 'viewer');
  await recordEvents(page);

  await page.locator('.page-foot a', { hasText: 'Reporting is not real-time.' }).dispatchEvent('click');
  await page.locator('.page-foot a', { hasText: 'Learn more' }).dispatchEvent('click');

  // Column header card.
  const head = page.locator('.grid-head th[data-col=impressions]');
  await head.scrollIntoViewIfNeeded();
  await head.hover();
  const tip = page.getByTestId('header-tip');
  await expect(tip).toBeVisible();
  await tip.getByRole('link', { name: 'Learn more' }).dispatchEvent('click');

  // Columns panel item card.
  await toolBtn(page, 'Columns').click();
  await page.locator('.colsec-head', { hasText: 'Performance' }).click();
  const wrap = page.locator('.colsec.open .colcheck-wrap', { has: page.locator('.colcheck', { hasText: /^Clicks$/ }) });
  await wrap.hover();
  await expect(wrap.locator('.colcheck-tip')).toBeVisible();
  await wrap.locator('.colcheck-tip a', { hasText: 'Learn more' }).dispatchEvent('click');
  await page.locator('.colpanel-actions button', { hasText: 'Cancel' }).click();

  // Select view > Feedback.
  await page.locator('.viewsel.active-under').click();
  await page.getByTestId('view-feedback').click();
  await expect(page.locator('.view-panel')).toHaveCount(0);
  await expect(page.getByTestId('feedback-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('feedback-dialog')).toHaveCount(0);

  // Learning-phase card > Optimize campaign asks Advisor about that campaign.
  await openCampaigns(page);
  await page.getByTestId('learning-card').getByRole('button', { name: 'Optimize campaign' }).click();
  await expect(page.getByTestId('entity-settings')).toHaveCount(0);

  expect(await events(page)).toEqual([
    ['app:help', { topic: 'reporting-delay' }],
    ['app:help', { topic: 'time-zone' }],
    ['app:help', { topic: 'metrics' }],
    ['app:help', { topic: 'metrics' }],
    ['app:feedback', { about: 'Views' }],
    ['app:ask', { question: 'How can I optimize Leads-Display-1?' }],
  ]);
});

test('a view narrows the campaign picker and shows nothing stale while it loads', async ({ page }) => {
  await login(page, '/', 'viewer');
  await settled(page);
  await expect(page.getByTestId('campaign-count')).toHaveText('Campaigns (7)');

  // Hold the view's reply: until it comes, the old rows don't show under the new view's name.
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route(/\/api\/report\?.*campaignType=Search/, async (route) => {
    await held;
    await route.continue();
  });
  await page.locator('.viewsel.active-under').click();
  await page.locator('.view-panel .menu-item', { hasText: 'Search campaigns' }).click();
  await expect(page.getByTestId('view-label')).toContainText('Search campaigns');
  await expect(page.getByTestId('ad-row')).toHaveCount(0);
  release();
  await expect(page.getByTestId('ad-row')).toHaveCount(3);
  await settled(page);

  // The picker counts and lists the view's campaigns only.
  await expect(page.getByTestId('campaign-count')).toHaveText('Campaigns (2)');
  await page.getByTestId('campaign-select').click();
  const picker = page.locator('.camp-panel');
  await expect(picker.getByLabel('Search campaigns')).toHaveAttribute('placeholder', 'Search 2 campaigns');
  await expect(picker).toContainText('View all 2 campaigns in this view');
  await expect(picker.locator('.cp-list .menu-item')).toHaveCount(3);
  await expect(picker).not.toContainText('Leads-Display-1');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
});

test('controls with nothing behind them look like the others: enabled, no Not available tip', async ({ page }) => {
  await login(page, '/', 'viewer');
  await settled(page);
  const noNaTips = () => expect(page.locator('[data-tip*="Not available"]')).toHaveCount(0);
  await noNaTips();
  // Filter bar: Save is an ordinary button; Add filter lists its status filters and the other
  // fields as ordinary items.
  const save = page.locator('.filterbar .save-btn');
  await expect(save).toBeEnabled();
  await expect(save).not.toHaveAttribute('data-tip');
  await expect(page.locator('.filterbar .na-wrap')).not.toHaveAttribute('data-tip');
  await page.getByTestId('bar-add-filter').click();
  const barMenu = page.getByTestId('bar-filter-menu');
  await expect(barMenu.locator('.menu-item .mi-label')).toHaveText(['Campaign status: Enabled, Paused', 'Ad group status: Enabled, Paused',
    'Bid strategy name', 'Bid strategy type', 'Campaign label', 'Campaign name']);
  await expect(barMenu.locator('.menu-item:disabled')).toHaveCount(0);
  await expect(barMenu.locator('.mi-na, [data-tip]')).toHaveCount(0);
  await barMenu.locator('.menu-item', { hasText: 'Campaign status' }).click();
  await setStatuses(page, ['Enabled']);
  await expect(page.getByTestId('ad-row')).toHaveCount(4);
  await expect(page.getByTestId('filter-chip-campaign')).toHaveText('Campaign status: Enabled');

  // Select view: Create view is an ordinary button.
  await page.locator('.viewsel.active-under').click();
  await expect(page.locator('.view-panel .vp-create')).toBeEnabled();
  await expect(page.locator('.view-panel [data-tip]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.view-panel')).toHaveCount(0);

  // Table toolbar: Add filter's field groups are ordinary items (the saved filter still works);
  // Reports is an ordinary button.
  await page.locator('.add-filter.big').click();
  const items = page.locator('.filter-search .menu-item');
  await expect(items.locator('.mi-label')).toHaveText(['Disapproved ads', 'Performance', 'Viewability', 'Conversions', 'Attribution',
    'Attributes', 'Analytics', 'Call details', 'Message details']);
  await expect(page.locator('.filter-search .menu-item:disabled')).toHaveCount(0);
  await expect(page.locator('.filter-search .mi-na, .filter-search [data-tip]')).toHaveCount(0);
  await page.locator('.filter-search .menu-item', { hasText: 'Disapproved ads' }).click();
  await expect(page.getByTestId('saved-filter-chip')).toBeVisible();
  await expect(toolBtn(page, 'Reports')).toBeEnabled();
  await expect(toolBtn(page, 'Reports')).not.toHaveAttribute('data-tip');
  await noNaTips();

  // Columns panel: Custom column is an ordinary button, named just "Custom column"; columns
  // without data still can't be ticked, but carry no tip.
  await toolBtn(page, 'Columns').click();
  const panel = page.getByTestId('columns-panel');
  await expect(panel.getByRole('button', { name: 'Custom column', exact: true })).toBeEnabled();
  await expect(panel.getByRole('button', { name: /Not available/ })).toHaveCount(0);
  await panel.locator('.colsec-head', { hasText: 'Viewability' }).click();
  const off = panel.locator('.colsec.open .colcheck.disabled');
  await expect(off.first()).toBeVisible();
  for (const c of await off.all()) {
    await expect(c.locator('input')).toBeDisabled();
    await expect(c).not.toHaveAttribute('data-tip');
  }
  await expect(panel.locator('[data-tip]')).toHaveCount(0);
  await noNaTips();
});

test('unticking a recommended column keeps it out of the table after Apply', async ({ page }) => {
  await login(page, '/', 'viewer');
  await expect(page.locator('.grid-head th[data-col=convRate]')).toHaveCount(1);
  await toolBtn(page, 'Columns').click();
  const panel = page.getByTestId('columns-panel');
  const rec = panel.getByTestId('recommended-toggle');
  await expect(rec).toHaveAttribute('aria-checked', 'true');
  await panel.locator('.colsec-head', { hasText: 'Recommended columns' }).click();
  await panel.locator('.colsec.open .colcheck', { hasText: /^Conv\. rate$/ }).locator('input').uncheck();
  // Recommended columns are no longer forced on: the others now show under Your columns.
  await expect(rec).toHaveAttribute('aria-checked', 'false');
  await expect(panel.locator('.yc-item > span:not(.ic)', { hasText: /^Conversions$/ })).toHaveCount(1);
  await panel.locator('.colpanel-actions button', { hasText: 'Apply' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.grid-head th[data-col=convRate]')).toHaveCount(0);
  await expect(page.locator('.grid-head th[data-col=conversions]')).toHaveCount(1);
});

test('the Ads table sorts Status by what it shows and Video by title; the CSV has the video titles', async ({ page }) => {
  await login(page, '/', 'viewer');
  await settled(page);
  const head = (k) => page.locator(`.grid-head th[data-col=${k}]`);
  const statuses = async () => (await page.getByTestId('ad-row').locator('td.c-status').allInnerTexts())
    .map((t) => (t.startsWith('Not eligible') ? 'Not eligible' : t.startsWith('Pending') ? 'Pending' : 'Eligible'));
  await head('status').click();
  const desc = await statuses();
  expect(new Set(desc).size).toBeGreaterThan(1);
  expect(desc).toEqual([...desc].sort((a, b) => b.localeCompare(a)));
  await head('status').click();
  const asc = await statuses();
  expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b)));

  // Video: ads with a video first, by title (Z to A), the others after.
  await head('video').click();
  const videos = await page.getByTestId('ad-row').locator('td.c-video').allInnerTexts();
  expect(videos[0]).toContain('Revolutionizing farming');
  expect(videos[1]).toContain('Harvest festival');
  expect(videos.slice(2).every((t) => !t.trim())).toBe(true);

  // Download > .csv: the Video column carries the titles.
  await toolBtn(page, 'Download').click();
  const download = page.waitForEvent('download');
  await page.locator('.menu.narrow .menu-item', { hasText: '.csv' }).click();
  const rows = parseCsv(fs.readFileSync(await (await download).path(), 'utf8'));
  const at = rows[0].indexOf('Video');
  expect(at).toBeGreaterThan(0);
  expect(rows.slice(1, 3).map((r) => r[at])).toEqual(['Revolutionizing farming', 'Harvest festival']);
});

test('the chart keeps working when fewer points come in under a resting mouse', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, '/', 'viewer');
  await page.locator('.link-btn', { hasText: 'Show last 30 days' }).click();
  await expect(page.getByTestId('preset-label')).toHaveText('Last 30 days');
  await settled(page);
  const svg = page.locator('.chart svg');
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + box.width - 60, box.y + box.height / 2);
  await expect(page.getByTestId('chart-tip')).toBeVisible();
  // The keyboard switches to 7 days while the mouse stays over one of the last of the 30 days.
  await page.locator('.link-btn', { hasText: 'Show last 7 days' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('preset-label')).toHaveText('Last 7 days');
  await settled(page);
  await expect(page.getByTestId('chart')).toBeVisible();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  expect(errors).toEqual([]);
});

test('a long "days up to yesterday" range starts on the first day with data', async ({ page }) => {
  await login(page, '/', 'viewer');
  await settled(page);
  await page.getByTestId('date-trigger').click();
  const n = page.getByLabel('Number of days up to yesterday');
  await n.fill('4000');
  await expect(page.getByLabel('Start date')).toHaveValue(fmtDay('2026-01-01'));
  const reply = page.waitForResponse((r) => r.url().includes('/api/report?') && r.url().includes('from=2026-01-01'));
  await n.press('Enter');
  expect((await reply).status()).toBe(200);
  await expect(page.locator('.dp-panel')).toHaveCount(0);
  await expect(page.getByTestId('date-trigger')).toContainText('Jan 1');
  await settled(page);
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
});

test('viewers get View ad buttons and no made-up "+ more" counts', async ({ page }) => {
  await login(page, '/', 'viewer');
  await expect(page.locator('[data-testid=edit-ad][aria-label="Edit ad"]')).toHaveCount(0);
  await expect(page.locator('[data-testid=edit-ad][aria-label="View ad"]')).toHaveCount(9);
  // Search ads with no extra headlines stored show no "+ N more".
  await expect(page.locator('.adcell.search')).toHaveCount(3);
  await expect(page.locator('.adcell.search .more')).toHaveCount(0);
});

test('admins get Edit ad on display and video ads; a new search ad has no made-up "+ more" count', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await settled(page);
  await expect(page.locator('[data-testid=edit-ad][aria-label="Edit ad"]')).toHaveCount(6);
  const before = await rowIds(page);
  await page.getByRole('button', { name: 'Create ad' }).click();
  await createItem(page, 'Responsive search ad').click();
  await expect(page.getByTestId('ad-row')).toHaveCount(10);
  const id = (await rowIds(page)).find((x) => !before.includes(x));
  const head = page.locator(`[data-testid=ad-row][data-id="${id}"] .sa-head`);
  await expect(head).toContainText('New headline');
  await expect(head.locator('.more')).toHaveText('+ 0 more');
});

test.describe('in another time zone', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('the footer names the device time zone, not a fixed one', async ({ page }) => {
    await login(page, '/', 'viewer');
    await expect(page.getByTestId('time-zone')).toHaveText(/^\(GMT-0[45]:00\) America\/New_York$/);
    await expect(page.locator('.page-foot')).not.toContainText('India Standard Time');
  });
});

test('Upload display ads makes one display ad from the chosen images, in an ad group of a display campaign', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await settled(page);
  const before = await rowIds(page);

  // The + menu: the new ad types, Ad variation (an ordinary item, though nothing is behind it yet),
  // then Upload display ads.
  await page.getByRole('button', { name: 'Create ad' }).click();
  await expect(page.locator('.create-menu .mi-label'))
    .toHaveText(['Responsive search ad', 'Video ad', 'Responsive display ad', 'Demand Gen ad', 'Ad variation', 'Upload display ads']);
  await expect(createItem(page, 'Ad variation')).toBeEnabled();
  await expect(createItem(page, 'Ad variation')).not.toHaveAttribute('data-tip');
  await expect(page.locator('.create-menu .mi-na')).toHaveCount(0);
  await page.keyboard.press('Escape');

  const dlg = await chooseUploads(page, [
    { name: 'wide.png', mimeType: 'image/png', buffer: png(120, 63) },
    { name: 'square.png', mimeType: 'image/png', buffer: png(50, 50) },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') },
  ]);
  const files = dlg.getByTestId('upload-file');
  await expect(files).toHaveCount(3);
  await expect(files.nth(0)).toContainText('wide.png');
  await expect(files.nth(0)).toContainText('120 × 63');
  await expect(files.nth(1)).toContainText('50 × 50');
  await expect(files.nth(2)).toHaveAttribute('data-state', 'error');
  await expect(files.nth(2)).toContainText('Only JPG, PNG, GIF or WebP images can be uploaded');

  // Only ad groups of display campaigns are offered.
  const rep = await (await page.request.get('/api/report?from=2026-01-01&to=2026-01-01')).json();
  const display = new Set(rep.campaigns.filter((c) => c.type === 'Display').map((c) => c.id));
  const want = rep.adGroups.filter((g) => display.has(g.campaignId)).map((g) => g.id).sort();
  const select = dlg.getByTestId('upload-ad-group');
  expect((await select.locator('option').evaluateAll((els) => els.map((e) => e.value))).sort()).toEqual(want);
  await expect(select.locator('optgroup')).toHaveAttribute('label', 'Leads-Display-1');

  await dlg.getByTestId('upload-create').click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('Display ad created');
  await expect(page.getByTestId('ad-row')).toHaveCount(before.length + 1);
  const id = (await rowIds(page)).find((x) => !before.includes(x));
  const r = page.locator(`[data-testid=ad-row][data-id="${id}"]`);
  await expect(r.locator('td.c-camp')).toHaveText('Leads-Display-1');
  await expect(r.locator('td.c-adType')).toHaveText('Responsive display ad');
  await expect(r.locator('img.thumb-media')).toHaveAttribute('src', /\/uploads\//);
  await expect(r.locator('td.c-status')).toContainText('Pending');

  // The ad's images are the uploads, in the order chosen, with their own sizes; both are in the library.
  const c = (await (await page.request.get(`/api/ads/${id}/creative`)).json()).creative;
  expect(c.images.map((im) => [im.name, im.w, im.h])).toEqual([['wide.png', 120, 63], ['square.png', 50, 50]]);
  const lib = (await (await page.request.get('/api/assets?kind=image')).json()).assets;
  for (const im of c.images) expect(lib.find((a) => a.id === im.assetId)).toMatchObject({ source: 'upload', url: im.url });

  // Tidy up the uploaded files: delete the ad, then the images from the library.
  expect((await page.request.delete('/api/ads', { data: { ids: [id] } })).ok()).toBe(true);
  for (const im of c.images) expect((await page.request.delete(`/api/assets/${im.assetId}`)).ok()).toBe(true);
});

test('Upload display ads shows the server refusals on their file, and says when there is no display ad group', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await settled(page);
  const before = await rowIds(page);
  // The server refuses the second image.
  let posts = 0;
  await page.route('**/api/assets', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    if (posts === 2) return route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ error: 'Images can be up to 10 MB' }) });
    return route.continue();
  });
  const dlg = await chooseUploads(page, [
    { name: 'one.png', mimeType: 'image/png', buffer: png(40, 40) },
    { name: 'two.png', mimeType: 'image/png', buffer: png(30, 30) },
  ]);
  await dlg.getByTestId('upload-create').click();
  const files = dlg.getByTestId('upload-file');
  await expect(files.nth(1)).toHaveAttribute('data-state', 'error');
  await expect(files.nth(1)).toContainText('Images can be up to 10 MB');
  await expect(files.nth(0)).toHaveAttribute('data-state', 'done');
  // The ad is still made with the image that went up; the dialog stays open to show what didn't.
  await expect(dlg.getByTestId('upload-progress')).toHaveText('Display ad created with 1 image: 1 couldn’t be uploaded');
  await expect(page.locator('.toast')).toHaveText('Display ad created');
  await expect(page.getByTestId('ad-row')).toHaveCount(before.length + 1);
  await expect(dlg.getByTestId('upload-create')).toHaveCount(0);
  await dlg.locator('.es-foot .btn-text', { hasText: 'Close' }).click();
  await expect(dlg).toHaveCount(0);
  const id = (await rowIds(page)).find((x) => !before.includes(x));
  const c = (await (await page.request.get(`/api/ads/${id}/creative`)).json()).creative;
  expect(c.images.map((im) => im.name)).toEqual(['one.png']);
  expect((await page.request.delete('/api/ads', { data: { ids: [id] } })).ok()).toBe(true);
  expect((await page.request.delete(`/api/assets/${c.images[0].assetId}`)).ok()).toBe(true);

  // With no ad group in a display campaign, the dialog says so and can't create anything.
  const rep = await (await page.request.get('/api/report?from=2026-01-01&to=2026-01-01')).json();
  for (const camp of rep.campaigns.filter((x) => x.type === 'Display')) {
    expect((await page.request.patch(`/api/campaigns/${camp.id}`, { data: { field: 'type', value: 'Search' } })).ok()).toBe(true);
  }
  await page.reload();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await settled(page);
  const empty = await chooseUploads(page, [{ name: 'three.png', mimeType: 'image/png', buffer: png(20, 20) }]);
  await expect(empty.getByTestId('upload-no-groups')).toContainText('There are no ad groups in display campaigns');
  await expect(empty.getByTestId('upload-create')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(empty).toHaveCount(0);
  expect(posts).toBe(2);
});
