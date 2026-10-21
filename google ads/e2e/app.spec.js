import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.locator('h1', { hasText: 'Ads' })).toBeVisible();
}

const row = (page, i) => page.getByTestId('ad-row').nth(i);
const cell = (page, i, metric) => row(page, i).locator(`td[data-metric=${metric}]`);

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('wrong password is rejected', async ({ page }) => {
  await page.goto('/');
  await page.fill('input[name=username]', CREDS.viewer.username);
  await page.fill('input[name=password]', 'nope');
  await page.click('button:has-text("Sign in")');
  await expect(page.getByRole('alert')).toHaveText('Wrong username or password');
});

test('viewer can browse but not edit, and cannot open admin', async ({ page }) => {
  await login(page, '/', 'viewer');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await cell(page, 5, 'cost').dblclick();
  await expect(cell(page, 5, 'cost').locator('input')).toHaveCount(0);
  const res = await page.request.patch('/api/ads/x', { data: { field: 'name', value: 'x' } });
  expect(res.status()).toBe(403);
  await page.goto('/admin');
  await expect(page.getByRole('alert')).toContainText('cannot open the admin site');
});

test('date presets, search, and columns panel', async ({ page }) => {
  await login(page, '/', 'viewer');
  await expect(page.getByTestId('preset-label')).toHaveText('Last 7 days');
  await page.click('text=Show last 30 days');
  await expect(page.getByTestId('preset-label')).toHaveText('Last 30 days');
  await page.getByTestId('date-trigger').click();
  await page.click('.dp-preset:has-text("Yesterday")');
  await expect(page.getByTestId('preset-label')).toHaveText('Yesterday');

  await page.click('.toolbtn:has-text("Search")');
  await page.getByTestId('find-ads').fill('Leads-Display');
  await expect(page.getByTestId('ad-row')).toHaveCount(2);

  await page.click('.toolbtn:has-text("Columns")');
  await expect(page.getByTestId('columns-panel')).toBeVisible();
  await page.click('.colsec-head:has-text("Performance")');
  await page.locator('.colsec.open .colcheck', { hasText: /^CTR$/ }).locator('input').uncheck();
  await page.click('.colpanel-actions button:has-text("Apply")');
  await expect(page.locator('th', { hasText: /^CTR$/ })).toHaveCount(0);
});
