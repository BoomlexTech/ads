import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';

// Every icon must render as a single glyph from the subset font. A missing icon
// falls back to its name as text (e.g. "arrow_drop_down"), which is much wider.
async function textIcons(page) {
  await page.evaluate(() => document.fonts.ready);
  return page.locator('.material-symbols-outlined').evaluateAll((els) => els
    .filter((el) => el.offsetParent !== null)
    .filter((el) => el.getBoundingClientRect().width > parseFloat(getComputedStyle(el).fontSize) * 1.6)
    .map((el) => el.textContent));
}

test('all icons render from the icon font', async ({ page, request }) => {
  await request.post('/api/test/reset');
  await page.goto('/admin');
  await page.fill('input[name=username]', CREDS.admin.username);
  await page.fill('input[name=password]', CREDS.admin.password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  expect(await textIcons(page)).toEqual([]);

  await page.getByTestId('account-toggle').click();
  await page.locator('.grid-head th[data-col=campaign]').click();
  await page.getByTestId('ask-advisor').click();
  await expect(page.getByTestId('advisor').locator('.adv-value').first()).toBeVisible();
  expect(await textIcons(page)).toEqual([]);

  const font = await page.evaluate(async () => {
    const r = performance.getEntriesByType('resource').find((e) => e.name.includes('material-symbols'));
    return r ? r.name : null;
  });
  expect(font).toContain('material-symbols-subset');
});
