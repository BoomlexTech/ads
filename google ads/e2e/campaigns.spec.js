import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';
import { BRAND, DEFAULT_ACCOUNT } from '../shared/brand.js';

// Campaigns and Ad groups pages: left nav, drilling down from a campaign to its ad groups
// and from an ad group to its ads, the page addresses (Back, Forward, reload), admin
// editing of every campaign / ad group field and number, adding and deleting campaigns and
// ad groups, and read-only viewers.

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
const toast = (page) => page.locator('.toast');
const ID = '[0-9a-f]{24}';
// Page addresses have no '?': ids are path parts and every address ends in /<brand slug>.
const S = BRAND.slug;

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

async function typeInto(page, target, text) {
  await target.dblclick();
  const input = page.locator('.inline-input, .cell-input, .sc-input').first();
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await settled(page);
}

async function history(page) {
  return (await page.request.get('/api/history')).json();
}

async function openCampaigns(page) {
  await nav(page, 'Campaigns').click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await settled(page);
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('left nav and names drill down from campaigns to ad groups to ads; addresses survive Back, Forward and reload', async ({ page }) => {
  await login(page, '/', 'viewer');
  await expect(nav(page, 'Ads')).toHaveClass(/active/);

  await openCampaigns(page);
  expect(new URL(page.url()).pathname).toBe(`/aw/campaigns/${S}`);
  await expect(page.locator('h1')).toHaveText('Campaigns');
  await expect(nav(page, 'Campaigns')).toHaveClass(/active/);
  await expect(nav(page, 'Ads')).not.toHaveClass(/active/);
  await expect(page).toHaveTitle(`Campaigns-${DEFAULT_ACCOUNT.name}-${BRAND.name}`);
  await expect(page.getByTestId('drafts-row')).toContainText('Drafts in progress: 0');
  await expect(page.getByTestId('total-view')).toContainText('Total: All but removed campaigns in your current view');
  await expect(page.getByTestId('total-account')).toContainText('Total: Account');
  const leads = campaignRow(page, 'Leads-Display-1');
  await expect(leads.locator('td.c-budget')).toHaveText(/\$40\.00\/day/);
  await expect(leads.locator('td.c-estatus')).toContainText('Eligible (Limited)');
  await expect(leads.locator('td.c-estatus')).toContainText('Conversion tracking setup is incomplete');
  await expect(leads.locator('td.c-optScore')).toHaveText('72.4%');
  await expect(leads.locator('td.c-campaignType')).toHaveText('Display');
  // The card says only what the numbers show (no learning-phase data exists).
  await expect(page.getByTestId('learning-card')).toContainText('Your campaign Leads-Display-1 had no conversions in the selected date range.');
  await expect(page.getByTestId('learning-card')).not.toContainText('learning phase');

  // Campaign name -> that campaign's ad groups, with its status bar and title chip.
  await leads.getByTestId('campaign-link').click();
  await expect(page).toHaveURL(new RegExp(`/aw/adgroups/${ID}/${S}$`));
  await expect(page.locator('h1')).toHaveText('Ad groups');
  await expect(nav(page, 'Ad groups')).toHaveClass(/active/);
  const bar = page.getByTestId('campaign-bar');
  for (const t of ['Enabled', 'Status:', 'Eligible (Limited)', 'Type:', 'Display', 'Budget:', '$40.00/day', 'Optimization score:', '72.4%', 'Campaign settings']) {
    await expect(bar).toContainText(t);
  }
  await expect(page.getByTestId('scope-chip')).toContainText('Campaign');
  await expect(page.getByTestId('scope-chip')).toContainText('Leads-Display-1');
  await expect(page.locator('.viewbar')).toHaveCount(0);
  await expect(page.locator('.toolbtn', { hasText: 'Layers' })).toBeVisible();
  await expect(adGroupRows(page)).toHaveCount(1);
  await expect(page.getByTestId('total-scope')).toContainText('Total: Campaign');
  await expect(page.locator('.grid-head th.c-ecamp')).toHaveCount(0);
  const groupUrl = page.url();

  // Ad group name -> its ads.
  await adGroupRows(page).first().getByTestId('adgroup-link').click();
  await expect(page).toHaveURL(new RegExp(`/aw/ads/${ID}/${ID}/${S}$`));
  await expect(page.locator('h1')).toHaveText('Ads');
  await expect(nav(page, 'Ads')).toHaveClass(/active/);
  await expect(page.getByTestId('adgroup-bar')).toContainText('Ad group settings');
  await expect(page.getByTestId('scope-chip')).toContainText('Ad group 1');
  await expect(page.getByTestId('ad-row')).toHaveCount(2);
  await expect(page.locator('.grid-head th.c-camp, .grid-head th.c-group')).toHaveCount(0);
  await expect(page.getByTestId('total-scope')).toContainText('Total: Ad group');
  const adsUrl = page.url();

  // The display ad edit page opened from here returns here.
  const ad = page.getByTestId('ad-row').first();
  await ad.hover();
  await ad.getByTestId('edit-ad').click();
  await expect(page).toHaveURL(new RegExp(`/aw/ads/edit/display/${ID}/${S}$`));
  await page.getByTestId('close-edit').click();
  await expect(page).toHaveURL(adsUrl);
  await expect(page.getByTestId('adgroup-bar')).toBeVisible();
  await expect(page.getByTestId('ad-row')).toHaveCount(2);

  // Back / Forward / reload.
  await page.goBack();
  await expect(page).toHaveURL(groupUrl);
  await expect(adGroupRows(page)).toHaveCount(1);
  await page.goBack();
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await page.goForward();
  await expect(page).toHaveURL(groupUrl);
  await page.goForward();
  await expect(page).toHaveURL(adsUrl);
  await page.reload();
  await expect(page.getByTestId('ad-row')).toHaveCount(2);
  await expect(page.getByTestId('adgroup-bar')).toBeVisible();
  await expect(nav(page, 'Ads')).toHaveClass(/active/);

  // Nav keeps the scope: Ad groups keeps the campaign; Campaigns clears it; Ads then shows every ad.
  await nav(page, 'Ad groups').click();
  await expect(page).toHaveURL(groupUrl);
  await nav(page, 'Ads').click();
  await expect(page).toHaveURL(new RegExp(`/aw/ads/${ID}/${S}$`));
  await expect(page.getByTestId('campaign-bar')).toBeVisible();
  await expect(page.getByTestId('ad-row')).toHaveCount(2);
  await openCampaigns(page);
  await nav(page, 'Ad groups').click();
  await expect(page).toHaveURL(new RegExp(`/aw/adgroups/${S}$`));
  await expect(adGroupRows(page)).toHaveCount(7);
  await expect(page.locator('.grid-head th.c-ecamp')).toHaveText('Campaign');
  // An ad group's campaign link on the unscoped Ad groups page.
  await adGroupRows(page).filter({ hasText: 'Website traffic-Search-JAN2026' }).locator('td.c-ecamp a').click();
  await expect(page.getByTestId('scope-chip')).toContainText('Website traffic-Search-JAN2026');
  await nav(page, 'Ads').click();
  await expect(page.getByTestId('ad-row')).toHaveCount(2);
  await openCampaigns(page);
  await nav(page, 'Ads').click();
  expect(new URL(page.url()).pathname).toBe(`/aw/ads/${S}`);
  expect(new URL(page.url()).search).toBe('');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  // The ads table's campaign / ad group names drill down too.
  await page.getByTestId('ad-row').filter({ hasText: 'Leads-Display-1' }).first().locator('td.c-group a').click();
  await expect(page.getByTestId('adgroup-bar')).toBeVisible();
  await expect(page.getByTestId('ad-row')).toHaveCount(2);
  await page.goBack();
  await page.getByTestId('ad-row').filter({ hasText: 'Leads-Display-1' }).first().locator('td.c-camp a').click();
  await expect(page).toHaveURL(new RegExp(`/aw/adgroups/${ID}/${S}$`));
  await expect(page.getByTestId('scope-chip')).toContainText('Leads-Display-1');

  // The title chip switches campaign.
  await page.getByTestId('scope-chip').click();
  await page.getByRole('dialog', { name: 'Select a campaign' }).getByRole('button', { name: 'Website traffic-Search-JAN2026' }).click();
  await expect(page.getByTestId('scope-chip')).toContainText('Website traffic-Search-JAN2026');
  await expect(adGroupRows(page).locator('td.c-targetCpa')).toHaveText('$15.00');
});

test('admin edits campaign fields, status and numbers inline; the settings dialog saves; all logged', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await openCampaigns(page);
  let row = campaignRow(page, 'Leads-Display-1');

  // Rename with the hover pencil, then with a double-click (which must not open the campaign).
  await row.hover();
  await row.getByRole('button', { name: 'Edit campaign name' }).click();
  await page.locator('.inline-input').fill('Leads Display Autumn');
  await page.locator('.inline-input').press('Enter');
  await settled(page);
  row = campaignRow(page, 'Leads Display Autumn');
  await expect(row).toHaveCount(1);
  await typeInto(page, row.locator('[data-edit="campaign name"]'), 'Leads Display');
  row = campaignRow(page, 'Leads Display');
  await expect(row).toHaveCount(1);
  expect(new URL(page.url()).pathname).toBe(`/admin/aw/campaigns/${S}`);

  await typeInto(page, row.locator('[data-edit=budget]'), '55.5');
  await expect(row.locator('td.c-budget')).toHaveText(/\$55\.50\/day/);

  await row.locator('[data-edit=status]').dblclick();
  await row.locator('select.inline-select').selectOption('Not eligible');
  await settled(page);
  await expect(row.locator('td.c-estatus .st-line').first()).toHaveText('Not eligible');
  await typeInto(page, row.locator('[data-edit="status reasons"]'), 'Policy review, Billing issue');
  await expect(row.locator('td.c-estatus')).toContainText('Billing issue');

  await typeInto(page, row.locator('[data-edit="optimization score"]'), '101');
  await expect(toast(page)).toHaveText('Enter a score from 0 to 100');
  await typeInto(page, row.locator('[data-edit="optimization score"]'), '88.5');
  await expect(row.locator('td.c-optScore')).toHaveText('88.5%');

  await row.locator('[data-edit="campaign type"]').dblclick();
  await row.locator('select.inline-select').selectOption('Search');
  await settled(page);
  await expect(row.locator('td.c-campaignType')).toHaveText('Search');

  await row.locator('select[aria-label="Change campaign status"]').selectOption('paused');
  await settled(page);
  await expect(row.locator('td.c-dot .paused-ic')).toHaveCount(1);

  // Its figures are read-only.
  await expect(row.locator('td[data-metric=clicks]')).not.toHaveClass(/editable/);
  await expect(page.getByTestId('total-account').locator('td[data-metric=impressions]')).not.toHaveClass(/editable/);

  let h = await history(page);
  for (const c of ['Campaign name', 'Budget', 'Status', 'Status reasons', 'Optimization score', 'Campaign type', 'Campaign status']) {
    expect(h.map((x) => x.column)).toContain(c);
  }
  expect(h.find((x) => x.column === 'Budget')).toMatchObject({ before: '$40.00/day', after: '$55.50/day' });

  // Settings dialog from the gear.
  await row.hover();
  await row.getByRole('button', { name: 'Campaign settings' }).click();
  const dlg = page.getByTestId('entity-settings');
  await dlg.getByLabel('Average daily budget').fill('70');
  await dlg.getByLabel('Status', { exact: true }).selectOption('enabled');
  await dlg.getByTestId('settings-save').click();
  await expect(dlg).toHaveCount(0);
  await expect(toast(page)).toHaveText('Campaign settings saved');
  await expect(row.locator('td.c-budget')).toHaveText(/\$70\.00\/day/);
  await expect(row.locator('td.c-dot .dot.green')).toHaveCount(1);

  // Ad group page of that campaign: its own fields and numbers, and the status bar.
  await row.getByTestId('campaign-link').click();
  await expect(adGroupRows(page)).toHaveCount(1);
  await settled(page);
  const g = adGroupRows(page).first();
  await typeInto(page, g.locator('[data-edit="ad group name"]'), 'Farmers 25-40');
  await expect(g.getByTestId('adgroup-link')).toHaveText('Farmers 25-40');
  expect(new URL(page.url()).pathname).toMatch(new RegExp(`^/admin/aw/adgroups/${ID}/${S}$`));
  await typeInto(page, g.locator('[data-edit="target CPA"]'), '12.34');
  // (The cell also holds the hover pencil, so check the value itself.)
  await expect(g.locator('td.c-targetCpa [data-edit="target CPA"]')).toHaveText('$12.34');
  await g.locator('[data-edit="ad group type"]').dblclick();
  await g.locator('select.inline-select').selectOption('Standard');
  await settled(page);
  await expect(g.locator('td.c-groupType')).toHaveText('Standard');
  await g.locator('[data-edit=status]').dblclick();
  await g.locator('select.inline-select').selectOption('Eligible (Limited)');
  await settled(page);
  await expect(g.locator('td.c-estatus')).toHaveText('Eligible (Limited)');
  await g.locator('select[aria-label="Change ad group status"]').selectOption('paused');
  await settled(page);
  await expect(g.locator('td.c-dot .paused-ic')).toHaveCount(1);
  await expect(g.locator('td[data-metric=impressions]')).not.toHaveClass(/editable/);

  // Status bar fields.
  const bar = page.getByTestId('campaign-bar');
  await typeInto(page, bar.locator('[data-edit=budget]'), '80');
  await expect(bar).toContainText('$80.00/day');
  await bar.locator('[data-edit="campaign status label"]').dblclick();
  await bar.locator('select.inline-select').selectOption('');
  await settled(page);
  await expect(bar).toContainText('Status:Eligible');

  h = await history(page);
  for (const c of ['Ad group name', 'Target CPA', 'Ad group type', 'Ad group status']) expect(h.map((x) => x.column)).toContain(c);
});

test('scorecards and total rows on campaign and ad group pages are read-only and scoped', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await openCampaigns(page);
  await campaignRow(page, 'Website traffic-Search-JAN2026').getByTestId('campaign-link').click();
  await expect(adGroupRows(page)).toHaveCount(1);
  await settled(page);

  await expect(page.getByTestId('scorecard-cost').locator('.sc-value .editable')).toHaveCount(0);
  // The campaign total is the sum of its (single) ad group.
  await expect(page.getByTestId('total-scope').locator('td[data-metric=cost]'))
    .toHaveText(await adGroupRows(page).first().locator('td[data-metric=cost]').innerText());

  await adGroupRows(page).first().getByTestId('adgroup-link').click();
  await expect(page.getByTestId('ad-row')).toHaveCount(2);
  await settled(page);
  await expect(page.getByTestId('total-scope').locator('td[data-metric=impressions]')).not.toHaveClass(/editable/);
  await expect(page.getByTestId('total-view').locator('td[data-metric=impressions]'))
    .toHaveText(await page.getByTestId('total-scope').locator('td[data-metric=impressions]').innerText());

  // The account total opens under the ad group total.
  await expect(page.getByTestId('total-account')).toHaveCount(0);
  await page.getByTestId('account-toggle').click();
  await expect(page.getByTestId('total-account')).toContainText('Total: Account');

  // Campaigns page: the "in your current view" total covers the campaigns left by the search;
  // the account's budget doesn't change with the search.
  await openCampaigns(page);
  const budget = page.getByTestId('total-account').locator('td.c-budget');
  const accountBudget = await budget.innerText();
  expect(accountBudget).toMatch(/\/day$/);
  await page.locator('.toolbtn', { hasText: 'Search' }).click();
  await page.getByTestId('find-rows').fill('Search-JAN');
  await expect(page.getByTestId('campaign-row')).toHaveCount(1);
  await expect(budget).toHaveText(accountBudget);
  await expect(page.getByTestId('total-view').locator('td[data-metric=conversions]'))
    .toHaveText(await page.getByTestId('campaign-row').locator('td[data-metric=conversions]').innerText());
});

test('admin adds and deletes campaigns and ad groups', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await openCampaigns(page);

  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.locator('.menu-item', { hasText: 'New campaign' }).hover();
  await page.locator('.submenu .menu-item', { hasText: 'Display campaign' }).click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(8);
  await expect(toast(page)).toContainText('Campaign added');
  const fresh = campaignRow(page, 'New Display campaign');
  await expect(fresh.locator('td.c-budget')).toHaveText(/\/day/);
  // Figures are read-only for every campaign.
  await expect(fresh.locator('td[data-metric=clicks]')).not.toHaveClass(/editable/);
  await expect(campaignRow(page, 'Leads-Display-1').locator('td[data-metric=clicks]')).not.toHaveClass(/editable/);

  await fresh.getByTestId('campaign-link').click();
  await expect(adGroupRows(page)).toHaveCount(1);
  await expect(adGroupRows(page).first()).toContainText('Ad group 1');
  await settled(page);
  await expect(adGroupRows(page).first().locator('td[data-metric=clicks]')).not.toHaveClass(/editable/);
  await expect(page.getByTestId('total-scope').locator('td[data-metric=clicks]')).not.toHaveClass(/editable/);
  await expect(page.getByTestId('scorecard-impressions').locator('.sc-value .editable')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create ad group' }).click();
  await page.locator('.menu-item', { hasText: 'New ad group' }).click();
  await expect(adGroupRows(page)).toHaveCount(2);
  await expect(adGroupRows(page).nth(1)).toContainText('Ad group 2');

  // Delete the new ad group with its checkbox (the confirm is accepted).
  await adGroupRows(page).nth(1).locator('input[type=checkbox]').check();
  await expect(page.getByTestId('selection-bar')).toContainText('1 selected');
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('delete-selected').click();
  await expect(adGroupRows(page)).toHaveCount(1);
  await expect(toast(page)).toHaveText('Ad group deleted');

  // A dismissed confirm keeps the campaign; an accepted one deletes it.
  await nav(page, 'Campaigns').click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(8);
  await campaignRow(page, 'New Display campaign').locator('input[type=checkbox]').check();
  page.once('dialog', (d) => d.dismiss());
  await page.getByTestId('delete-selected').click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(8);
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('delete-selected').click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await expect(toast(page)).toHaveText('Campaign deleted');

  const cols = (await history(page)).map((x) => x.column);
  for (const c of ['Campaign added', 'Ad group added', 'Ad group deleted', 'Campaign deleted']) expect(cols).toContain(c);

  // Going Back to the deleted campaign's ad groups page lands on Campaigns instead.
  await page.goBack();
  await expect(toast(page)).toHaveText('That campaign no longer exists');
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await expect(page).toHaveURL(new RegExp(`/admin/aw/campaigns/${S}$`));
});

test('viewer browses the campaign pages read-only and every new write route is refused', async ({ page }) => {
  await login(page, '/', 'viewer');
  await openCampaigns(page);
  await expect(page.locator('.editable')).toHaveCount(0);
  await expect(page.locator('.st-pick select')).toHaveCount(0);
  await expect(page.locator('.ent-pencil')).toHaveCount(0);
  await expect(page.locator('.row-del')).toHaveCount(0);
  const writes = watchWrites(page);
  await watchToasts(page);
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });

  // Settings: the same form as for admins; for viewers Save keeps it open and saves nothing.
  const row = campaignRow(page, 'Leads-Display-1');
  await row.hover();
  await row.getByRole('button', { name: 'Campaign settings' }).click();
  const dlg = page.getByTestId('entity-settings');
  await expect(dlg.getByLabel('Average daily budget')).toBeEnabled();
  await expect(dlg.getByTestId('settings-save')).toBeVisible();
  await dlg.getByLabel('Average daily budget').fill('10');
  await dlg.getByTestId('settings-save').click();
  await page.waitForTimeout(300);
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(row.locator('td.c-budget')).toHaveText(/\$40\.00\/day/);
  // The create button shows for viewers too; picking a type adds nothing.
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.locator('.menu-item', { hasText: 'New campaign' }).hover();
  await page.locator('.submenu .menu-item', { hasText: 'Search campaign' }).click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  // Ticked campaigns show the selection bar; its Delete does nothing.
  await row.locator('input[type=checkbox]').check();
  await expect(page.getByTestId('selection-bar')).toContainText('1 selected');
  await page.getByTestId('delete-selected').click();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await page.getByRole('button', { name: 'Clear selection' }).click();

  await row.getByTestId('campaign-link').click();
  await expect(adGroupRows(page)).toHaveCount(1);
  await expect(page.locator('.editable')).toHaveCount(0);
  await expect(page.locator('.row-del')).toHaveCount(0);
  // Ad groups the same: New ad group adds nothing, Delete on the selection does nothing,
  // and the settings form's Save saves nothing.
  await page.getByRole('button', { name: 'Create ad group' }).click();
  await page.locator('.create-menu .menu-item', { hasText: 'New ad group' }).click();
  await page.waitForTimeout(300);
  await expect(adGroupRows(page)).toHaveCount(1);
  await adGroupRows(page).first().locator('input[type=checkbox]').check();
  await expect(page.getByTestId('selection-bar')).toContainText('1 selected');
  await page.getByTestId('delete-selected').click();
  await page.waitForTimeout(300);
  await expect(adGroupRows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear selection' }).click();
  const group = adGroupRows(page).first();
  const cpa = await group.locator('td.c-targetCpa').innerText();
  await group.hover();
  await group.getByRole('button', { name: 'Ad group settings' }).click();
  await expect(dlg.getByLabel('Target CPA')).toBeEnabled();
  await dlg.getByLabel('Target CPA').fill('10');
  await dlg.getByTestId('settings-save').click();
  await page.waitForTimeout(300);
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(group.locator('td.c-targetCpa')).toHaveText(cpa);

  // No request was sent, no confirm asked and no message shown.
  expect(writes).toEqual([]);
  expect(dialogs).toEqual([]);
  expect(await toasts(page)).toEqual([]);
  await expect(toast(page)).toHaveCount(0);

  // The campaign id is the path part before the slug: /aw/adgroups/<campaignId>/<slug>.
  const ids = new URL(page.url()).pathname.match(new RegExp(`^/aw/adgroups/(${ID})/${S}$`))[1];
  const groupId = await adGroupRows(page).first().getAttribute('data-id');
  const calls = [
    page.request.patch(`/api/campaigns/${ids}`, { data: { field: 'budget', value: '10' } }),
    page.request.patch(`/api/adgroups/${groupId}`, { data: { field: 'targetCpa', value: '10' } }),
    page.request.post('/api/campaigns', { data: { type: 'Search' } }),
    page.request.delete('/api/campaigns', { data: { ids: [ids] } }),
    page.request.post('/api/adgroups', { data: { campaignId: ids } }),
    page.request.delete('/api/adgroups', { data: { ids: [groupId] } }),
  ];
  for (const res of await Promise.all(calls)) expect(res.status()).toBe(403);
});

test('a slow reply for the page left behind never replaces the page on screen', async ({ page }) => {
  await login(page, '/', 'viewer');
  await settled(page);
  // Hold back the next report of every ad (the range change below) until after the campaign page shows.
  let release;
  const held = new Promise((r) => { release = r; });
  let holding = true;
  await page.route(/\/api\/report\?/, async (route) => {
    if (holding && !route.request().url().includes('campaignId')) {
      holding = false;
      await held;
    }
    await route.continue();
  });
  await page.locator('.link-btn', { hasText: 'Show last 30 days' }).click();
  await page.getByTestId('ad-row').filter({ hasText: 'Leads-Display-1' }).first().locator('td.c-camp a').click();
  await expect(adGroupRows(page)).toHaveCount(1);
  await settled(page);
  const stale = page.waitForResponse((r) => r.url().includes('/api/report?') && !r.url().includes('campaignId'));
  release();
  await stale;
  await page.waitForTimeout(300);
  await expect(adGroupRows(page)).toHaveCount(1);
  await expect(page.getByTestId('campaign-bar')).toBeVisible();
  await expect(page.getByTestId('scorecard-impressions').locator('.sc-value')).toHaveText(/\d/);
});

test('Notifications is empty on every page, also after a scoped reload; the settings dialog keeps focus', async ({ page }) => {
  await login(page, '/', 'viewer');
  const bell = page.locator('.topact', { hasText: 'Notifications' });
  const panel = page.getByTestId('notifications');
  const expectNoNotifications = async () => {
    await expect(bell.locator('.notif-badge')).toHaveCount(0);
    await bell.click();
    await expect(panel.getByTestId('notif-empty')).toHaveText('You have no notifications.');
    await expect(panel.locator('.notif-item')).toHaveCount(0);
    await expect(panel.getByRole('button')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  };

  // On the Campaigns page: no badge, no alert, nothing to View.
  await openCampaigns(page);
  await expectNoNotifications();
  await expect(page.locator('h1')).toHaveText('Campaigns');

  // Nor on a reloaded campaign page.
  await campaignRow(page, 'Leads-Display-1').getByTestId('campaign-link').click();
  await expect(adGroupRows(page)).toHaveCount(1);
  await page.reload();
  await expect(adGroupRows(page)).toHaveCount(1);
  await settled(page);
  await expectNoNotifications();
  await expect(adGroupRows(page)).toHaveCount(1);

  // The settings dialog keeps Tab inside and gives focus back to the gear on close.
  const gear = adGroupRows(page).first().getByRole('button', { name: 'Ad group settings' });
  await gear.focus();
  await page.keyboard.press('Enter');
  const dlg = page.getByTestId('entity-settings');
  await expect(dlg).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('[data-testid=entity-settings]'))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('[data-testid=entity-settings]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(gear).toBeFocused();
});

test('campaign and ad group tables keep the pinned header in line with the rows when scrolled sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 760 });
  await login(page, '/', 'viewer');
  for (const [label, rowId] of [['Campaigns', 'campaign-row'], ['Ad groups', 'adgroup-row']]) {
    await nav(page, label).click();
    await expect(page.getByTestId(rowId)).toHaveCount(7);
    await settled(page);
    const measure = () => page.evaluate((id) => {
      const ths = [...document.querySelectorAll('.grid-head thead th')].map((e) => e.getBoundingClientRect());
      const tds = [...document.querySelector(`.grid-body tr[data-testid=${id}]`).children].map((e) => e.getBoundingClientRect());
      return { ths: ths.map((r) => [r.left, r.right]), tds: tds.map((r) => [r.left, r.right]) };
    }, rowId);
    const aligned = (m) => {
      expect(m.ths.length).toBe(m.tds.length);
      m.ths.forEach(([l, r], i) => {
        expect(Math.abs(l - m.tds[i][0]), `${label} column ${i} left`).toBeLessThanOrEqual(1);
        expect(Math.abs(r - m.tds[i][1]), `${label} column ${i} right`).toBeLessThanOrEqual(1);
      });
    };
    const before = await measure();
    aligned(before);
    await expect(page.getByTestId('grid-hscroll')).not.toHaveClass(/none/);
    await page.getByTestId('grid-hscroll').evaluate((el) => { el.scrollLeft = 300; });
    await expect.poll(() => page.evaluate(() => ['.grid-head', '.grid-body', '.grid-hscroll'].map((s) => document.querySelector(s).scrollLeft)))
      .toEqual([300, 300, 300]);
    const after = await measure();
    aligned(after);
    // Checkbox, status dot and name stay put; the rest moves.
    for (const i of [0, 1, 2]) expect(Math.abs(after.tds[i][0] - before.tds[i][0])).toBeLessThanOrEqual(1);
    expect(Math.abs(after.tds[4][0] - (before.tds[4][0] - 300))).toBeLessThanOrEqual(1);
  }
});

test('a refused date range leaves a campaign page where it is; a view keeps the account budget whole', async ({ page }) => {
  await login(page, '/', 'viewer');
  await openCampaigns(page);
  const budget = page.getByTestId('total-account').locator('td.c-budget');
  const accountBudget = await budget.innerText();
  expect(accountBudget).toMatch(/\/day$/);

  // Search campaigns view: 2 campaigns; the Total: Account budget still covers every campaign.
  await page.locator('.viewsel.active-under').click();
  await page.locator('.view-panel .menu-item', { hasText: 'Search campaigns' }).click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(2);
  await settled(page);
  await expect(budget).toHaveText(accountBudget);
  await page.locator('.viewsel.active-under').click();
  await page.getByTestId('view-all').click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await settled(page);

  // On a campaign page, a date range the server refuses is reported, and the page stays.
  await campaignRow(page, 'Leads-Display-1').getByTestId('campaign-link').click();
  await expect(adGroupRows(page)).toHaveCount(1);
  await settled(page);
  const url = page.url();
  await page.route(/\/api\/report\?/, (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Bad date range' }) }), { times: 1 });
  await page.locator('.link-btn', { hasText: 'Show last 30 days' }).click();
  await expect(toast(page)).toHaveText('Bad date range');
  // The range goes back to the one the figures on screen are for.
  await expect(page.getByTestId('preset-label')).toHaveText('Last 7 days');
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(url);
  await expect(page.getByTestId('campaign-bar')).toBeVisible();
  await expect(adGroupRows(page)).toHaveCount(1);
});
