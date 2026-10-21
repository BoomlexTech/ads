import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';
import { BRAND } from '../shared/brand.js';

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('entry points open the full ads address', async ({ page }) => {
  await login(page, '/', 'viewer');
  expect(new URL(page.url()).pathname).toBe(`/aw/ads/${BRAND.slug}`);
  expect(new URL(page.url()).search).toBe('');
  await expect(page.locator('.brand-name')).toHaveText(BRAND.name);
  await expect(page.locator('.demo-chip')).toHaveCount(0);
  await page.goto('/admin');
  await expect(page.locator('button', { hasText: 'Sign in' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/admin/aw/ads/${BRAND.slug}`);
  expect(new URL(page.url()).search).toBe('');
});

test('Ask Advisor opens, shows the overview and answers from the data', async ({ page }) => {
  await login(page, '/', 'viewer');
  await page.getByTestId('ask-advisor').click();
  const adv = page.getByTestId('advisor');
  await expect(adv.locator('.adv-welcome')).toHaveText(/^Welcome, /);
  await expect(adv.getByTestId('adv-snapshot')).toContainText('Last 30 days');
  await expect(adv.locator('.adv-value').first()).toHaveText(/^[\d,]+$/);
  // Search box turns into a Search button while the panel is open.
  await expect(page.getByTestId('top-search')).toHaveCount(0);
  await expect(page.locator('.topact', { hasText: 'Search' })).toBeVisible();

  await adv.getByRole('button', { name: 'Which campaigns are paused?' }).click();
  await expect(adv.locator('.adv-msg.me')).toHaveText('Which campaigns are paused?');
  await expect(adv.locator('.adv-msg.bot').last()).toContainText("aren't running");
  await expect(adv.locator('.adv-msg.bot').last().locator('li')).toHaveCount(5);

  await adv.getByLabel('Type message').fill('How much did I spend?');
  await adv.getByLabel('Send').click();
  await expect(adv.locator('.adv-msg.bot').last()).toContainText('You spent $');

  await adv.getByLabel('Chat history').click();
  await expect(adv.locator('.adv-hist-item')).toHaveCount(2);
  await adv.getByLabel('Close Ask Advisor').click();
  await expect(adv).toHaveCount(0);
  await expect(page.getByTestId('top-search')).toBeVisible();
});

test('top search: prompts, pages, campaigns and asking the advisor', async ({ page }) => {
  await login(page, '/', 'viewer');
  await page.getByTestId('top-search').click();
  const drop = page.getByTestId('search-drop');
  await expect(drop.locator('[data-kind=ask]')).toHaveCount(4);
  await expect(drop.locator('[data-kind=ask]').first()).toHaveText('What are my top performing campaigns?');
  await expect(drop).toContainText('Send feedback');
  await expect(page.locator('.search-scrim')).toBeVisible();

  // A campaign opens its ad groups; its ads are one nav click away.
  await page.getByTestId('top-search').fill('Leads');
  await drop.locator('.sd-item', { hasText: 'Leads-Display-1' }).click();
  await expect(page).toHaveURL(new RegExp(`/aw/adgroups/[0-9a-f]{24}/${BRAND.slug}$`));
  await expect(page.getByTestId('scope-chip')).toContainText('Leads-Display-1');
  await expect(page.getByTestId('adgroup-row')).toHaveCount(1);
  await page.locator('.nav-group .nav-item', { hasText: /^Ads$/ }).click();
  await expect(page.getByTestId('ad-row')).toHaveCount(2);

  // Pages: Campaigns.
  await page.getByTestId('top-search').fill('Campaig');
  await drop.locator('.sd-item', { hasText: 'Campaigns › Campaigns' }).click();
  await expect(page.locator('h1')).toHaveText('Campaigns');
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);

  await page.getByTestId('top-search').click();
  await page.getByTestId('search-drop').locator('[data-kind=ask]').first().click();
  const adv = page.getByTestId('advisor');
  await expect(adv.locator('.adv-msg.me')).toHaveText('What are my top performing campaigns?');
  await expect(adv.locator('.adv-msg.bot').last()).toContainText('top');
});

test('scorecards get a "more" arrow when the advisor narrows the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, '/', 'viewer');
  await page.getByTestId('ask-advisor').click();
  const more = page.getByTestId('sc-more');
  await expect(more).toBeVisible();
  await more.click();
  await expect(page.locator('.sc-arrow.left')).toBeVisible();
});

test('a question from the top search is dropped if Advisor is closed before its data arrives', async ({ page }) => {
  await login(page, '/', 'viewer');
  // Hold Advisor's report back until the panel has been closed.
  let release;
  const held = new Promise((r) => { release = r; });
  let holding = true;
  await page.route(/\/api\/report\?/, async (route) => {
    if (holding) await held;
    await route.continue();
  });
  await page.getByTestId('top-search').fill('Which campaigns are paused?');
  await page.getByTestId('search-drop').locator('[data-kind=ask]').last().click();
  const adv = page.getByTestId('advisor');
  await expect(adv).toBeVisible();
  await adv.getByLabel('Close Ask Advisor').click();
  await expect(adv).toHaveCount(0);
  holding = false;
  release();

  // Opened again from the top bar: no question is asked or saved by itself.
  await page.getByTestId('ask-advisor').click();
  await expect(adv.getByTestId('adv-snapshot')).toBeVisible();
  await expect(adv.locator('.adv-msg')).toHaveCount(0);
  await adv.getByLabel('Chat history').click();
  await expect(adv.locator('.adv-hist-item')).toHaveCount(0);

  // A question asked while the panel stays open is still answered once the data is in.
  await adv.getByLabel('Close Ask Advisor').click();
  await page.getByTestId('top-search').fill('How much did I spend?');
  await page.getByTestId('search-drop').locator('[data-kind=ask]').last().click();
  await expect(adv.locator('.adv-msg.me')).toHaveText('How much did I spend?');
  await expect(adv.locator('.adv-msg.bot').last()).toContainText('You spent $');
});
