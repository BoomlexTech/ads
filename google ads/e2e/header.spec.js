import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';

// Column header behaviour: sort arrow placement, hover cards, "Don't show this
// column", the expandable account total and the chart toggle tooltip.

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
}

const head = (page, k) => page.locator(`.grid-head th[data-col=${k}]`);

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('sort arrow sits after text labels and before number labels', async ({ page }) => {
  await login(page, '/', 'viewer');
  await head(page, 'campaign').click();
  const campaign = await head(page, 'campaign').locator('.th-in').evaluate((el) => [...el.children].map((c) => c.className));
  expect(campaign[0]).toContain('th-label');
  expect(campaign[1]).toContain('sort-ic');
  const names = await page.locator('.grid-body td.c-camp').allInnerTexts();
  expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));

  await head(page, 'cost').click();
  const cost = await head(page, 'cost').locator('.th-in').evaluate((el) => [...el.children].map((c) => c.className));
  expect(cost[0]).toContain('sort-ic');
  expect(cost[1]).toContain('th-label');
  await expect(head(page, 'campaign').locator('.sort-ic')).toHaveCount(0);
});

test('hover card stays open on hover and "Don\'t show this column" removes the column', async ({ page }) => {
  await login(page, '/', 'viewer');
  await head(page, 'impressions').scrollIntoViewIfNeeded();
  await head(page, 'avgCost').hover();
  const tip = page.getByTestId('header-tip');
  await expect(tip).toContainText('How it works:');
  await expect(tip.locator('b').first()).toBeVisible();
  await expect(tip.getByText("Don't show this column")).toHaveCount(0);
  await tip.hover();
  await expect(tip).toBeVisible();

  await page.mouse.move(5, 5);
  await expect(tip).toHaveCount(0);
  await page.locator('.grid-hscroll').evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await head(page, 'conversions').hover();
  await expect(tip).toContainText('recommended for this table');
  await tip.getByText("Don't show this column").click();
  await expect(head(page, 'conversions')).toHaveCount(0);
  await expect(tip).toHaveCount(0);
});

test('Total: Account expands into per-campaign-type totals that add up', async ({ page }) => {
  await login(page, '/', 'viewer');
  await expect(page.getByTestId('total-type')).toHaveCount(0);
  await page.getByTestId('account-toggle').click();
  const types = page.getByTestId('total-type');
  await expect(types).toHaveCount(4);
  await expect(types.first()).toContainText('Total: Search campaigns');
  const num = (s) => Number(s.replace(/[^\d.]/g, '')) || 0;
  const parts = await types.locator('td[data-metric=impressions]').allInnerTexts();
  const acct = await page.getByTestId('total-account').locator('td[data-metric=impressions]').innerText();
  expect(parts.reduce((a, s) => a + num(s), 0)).toBe(num(acct));
  await page.getByTestId('account-toggle').click();
  await expect(types).toHaveCount(0);
});

test('chart toggle shows Hide chart / Show chart tooltips', async ({ page }) => {
  await login(page, '/', 'viewer');
  const btn = page.locator('.chart-toggle');
  await expect(btn).toHaveAttribute('data-tip', 'Hide chart');
  await btn.click();
  await expect(btn).toHaveAttribute('data-tip', 'Show chart');
  await expect(page.locator('.overview')).toHaveCount(0);
});
