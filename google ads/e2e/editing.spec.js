import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';

// Admin editing: text, selects and account details. Performance figures are read-only for
// everyone, and viewers can't edit anything.

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
}

const row = (page, i) => page.getByTestId('ad-row').nth(i);
const settled = (page) => expect(page.locator('.progress')).toHaveCount(0);

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

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('admin edits ad text, campaign and ad group names, selects and account details', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const r = row(page, 0);

  await typeInto(page, r.locator('[data-edit="ad name"]'), 'Harvest promo');
  await expect(r.locator('.ad-name')).toHaveText('Harvest promo');

  await typeInto(page, r.locator('[data-edit="line 1"]'), 'Fresh seeds every week');
  await expect(r.locator('.ad-line').first()).toContainText('Fresh seeds every week');

  await typeInto(page, r.locator('[data-edit="campaign name"]'), 'Autumn Demand Gen');
  await expect(r.locator('td.c-camp')).toHaveText('Autumn Demand Gen');

  await typeInto(page, r.locator('[data-edit="ad group name"]'), 'Farmers 25-40');
  await expect(r.locator('td.c-group')).toHaveText('Farmers 25-40');

  await r.locator('[data-edit="ad strength"]').dblclick();
  await r.locator('select.inline-select').selectOption('Excellent');
  await settled(page);
  await expect(r.locator('td.c-strength')).toHaveText('Excellent');

  await r.locator('[data-edit="status"]').first().dblclick();
  await r.locator('select.inline-select').selectOption('Eligible');
  await settled(page);
  await expect(r.locator('td.c-status')).toHaveText('Eligible');

  await typeInto(page, page.locator('[data-edit="account name"]'), 'Green Fields Co');
  await expect(page.locator('.acct-text')).toContainText('Green Fields Co');
  await expect(page.locator('.avatar').first()).toHaveText('G');
  await typeInto(page, page.locator('[data-edit="account ID"]'), 'not-an-id');
  await expect(page.getByRole('alert').last()).toContainText('123-456-7890');

  const h = await history(page);
  const cols = h.map((x) => x.column);
  for (const c of ['Ad name', 'Text line 1', 'Campaign name', 'Ad group name', 'Ad strength', 'Status', 'Account name']) {
    expect(cols).toContain(c);
  }
  expect(h.find((x) => x.column === 'Ad name')).toMatchObject({ before: 'Ad 1', after: 'Harvest promo', level: 'Ad' });
});

test('performance figures are read-only, even for the admin', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const r = row(page, 5);
  // Every figure column shown, on an ad row and on the account total row.
  for (const where of [r, page.getByTestId('total-account')]) {
    expect(await where.locator('td[data-metric]').count()).toBeGreaterThan(3);
    await expect(where.locator('td[data-metric].editable')).toHaveCount(0);
  }
  await expect(page.locator('.scorecard .editable')).toHaveCount(0);
  const id = await r.getAttribute('data-id');
  const range = { from: '2026-09-01', to: '2026-09-07' };
  const calls = [
    page.request.patch(`/api/ads/${id}/metric`, { data: { metric: 'ctr', value: '5', ...range } }),
    page.request.patch('/api/totals/metric', { data: { scope: 'account', metric: 'cost', value: '1', ...range } }),
  ];
  for (const res of await Promise.all(calls)) expect(res.status()).toBe(404);
});

test('viewer sees no editors and every edit route is refused', async ({ page }) => {
  await login(page, '/', 'viewer');
  await expect(page.locator('.editable')).toHaveCount(0);
  await expect(page.locator('.thumb-upload')).toHaveCount(0);
  const id = await row(page, 0).getAttribute('data-id');
  const calls = [
    page.request.patch(`/api/ads/${id}`, { data: { field: 'name', value: 'x' } }),
    page.request.patch('/api/account', { data: { field: 'name', value: 'x' } }),
    page.request.patch(`/api/campaigns/${id}`, { data: { field: 'name', value: 'x' } }),
    page.request.patch(`/api/adgroups/${id}`, { data: { field: 'name', value: 'x' } }),
  ];
  for (const res of await Promise.all(calls)) expect(res.status()).toBe(403);
});

test('scorecard colours: blue, green, amber with dark text, red', async ({ page }) => {
  await login(page, '/', 'viewer');
  const cards = page.locator('.scorecard');
  for (let i = 0; i < 4; i++) {
    const c = cards.nth(i);
    if (!(await c.getAttribute('class')).includes('selected')) await c.click();
  }
  const styles = await cards.evaluateAll((els) => els.map((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]));
  expect(styles[0][0]).toBe('rgb(26, 115, 232)');
  expect(styles[1][0]).toBe('rgb(30, 142, 62)');
  expect(styles[2]).toEqual(['rgb(249, 171, 0)', 'rgb(32, 33, 36)']);
  expect(styles[3][0]).toBe('rgb(217, 48, 37)');
});

test('chart points and the scorecard change line are read-only; the profile menu is editable', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const svg = page.locator('.chart svg');
  const box = await svg.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await svg.click();
  const tip = page.getByTestId('chart-tip');
  await expect(tip).toHaveClass(/pinned/);
  await expect(tip.locator('.editable')).toHaveCount(0);
  await expect(page.getByTestId('scorecard-clicks').locator('.sc-delta .editable')).toHaveCount(0);

  // Profile menu: display name and email.
  await page.locator('button.avatar').click();
  await typeInto(page, page.locator('[data-edit="profile name"]'), 'Priya Admin');
  await expect(page.locator('.acct-menu-head .acct-name')).toHaveText('Priya Admin');
  await expect(page.locator('.acct-menu-head .avatar-edit')).toBeVisible();
});

test('search ads: add a headline, and rename / edit them in the details dialog', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const r = page.getByTestId('ad-row').filter({ has: page.locator('.adcell.search') }).first();
  await typeInto(page, r.locator('[data-edit="new headline"]'), 'Soil Testing Kits');
  await expect(r.locator('.sa-head')).toContainText('Soil Testing Kits');

  await r.getByTestId('edit-ad').click();
  const dlg = page.getByTestId('ad-details');
  await typeInto(page, dlg.locator('[data-edit="ad name"]'), 'Soil kits ad');
  await expect(dlg.locator('.add-title')).toHaveText('Soil kits ad');
  await typeInto(page, dlg.locator('[data-edit="details description"]'), 'Order a soil test today.');
  await expect(r.locator('.sa-desc')).toHaveText('Order a soil test today.');

  // Clearing the description leaves it empty (no made-up text comes back).
  await typeInto(page, dlg.locator('[data-edit="details description"]'), '');
  await expect(r.locator('.sa-desc')).toHaveText('Add description');
  const h = await history(page);
  expect(h.map((x) => x.column)).toEqual(expect.arrayContaining(['Text line added', 'Ad name', 'Description']));
});
