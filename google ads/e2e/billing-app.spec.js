import { test, expect } from '@playwright/test';
import QRCode from 'qrcode';
import { CREDS } from '../playwright.config.js';
import { BRAND } from '../shared/brand.js';
import { ACCOUNT_DEFAULTS } from '../shared/account.js';
import { formatValue } from '../shared/metrics.js';
import { todayISO, addDays, daysBetween } from '../shared/dates.js';

// The "Get the app" card at the bottom of the side navigation (its QR code is made from the link
// an admin adds) and Rail > Billing: Summary (worked out from the account's cost figures),
// Settings (the billing profile admins edit) and the pages that stay empty with no payment
// provider connected.

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
}
// An API session of its own (the page keeps whoever signed in there).
async function signIn(request, who) {
  const r = await request.post('/api/login', { data: CREDS[who] });
  expect(r.ok()).toBeTruthy();
}
const card = (page) => page.getByTestId('app-card');
const toast = (page) => page.locator('.toast');
const history = async (page) => (await page.request.get('/api/history')).json();
// The QR code's dark squares, as the library draws them for a link.
async function qrPath(url) {
  const svg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  return svg.match(/<path stroke="#000000" d="([^"]+)"/)[1];
}
const field = (page, name) => page.getByTestId('billing-profile').first().locator(`[data-field=${name}]`);
const BILLING_NAV = ['Summary', 'Billing activity', 'Documents', 'Payment methods', 'Promotions', 'Billing transfers', 'Settings'];
const EMPTY = [
  ['Billing activity', 'billing activity', '/aw/billing/activity'],
  ['Documents', 'documents', '/aw/billing/documents'],
  ['Payment methods', 'payment methods', '/aw/billing/paymentmethods'],
  ['Promotions', 'promotions', '/aw/billing/promotions'],
  ['Billing transfers', 'billing transfers', '/aw/billing/transfers'],
];

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('read-only users see no app card until an admin adds a link, then its QR code and link', async ({ page, request }) => {
  await login(page, '/', 'viewer');
  await expect(card(page)).toHaveCount(0);
  // Viewers can't set the link themselves.
  const res = await page.request.patch('/api/account', { data: { field: 'appUrl', value: 'https://example.com/app' } });
  expect(res.status()).toBe(403);

  const url = 'https://example.com/get-our-app?ref=nav';
  await signIn(request, 'admin');
  expect((await request.patch('/api/account', { data: { field: 'appUrl', value: url } })).ok()).toBeTruthy();
  await page.reload();
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByTestId('app-card-title')).toHaveText(ACCOUNT_DEFAULTS.appTitle);
  await expect(card(page).getByTestId('app-card-title')).toHaveText(`Get the ${BRAND.name} app`);
  await expect(card(page).getByTestId('app-card-text')).toHaveText(ACCOUNT_DEFAULTS.appText);
  const qr = card(page).getByTestId('app-qr');
  await expect(qr.locator('svg path[stroke]')).toHaveAttribute('d', await qrPath(url));
  await expect(qr).toHaveAttribute('href', url);
  const open = card(page).getByTestId('app-open-link');
  await expect(open).toHaveText('Open link');
  await expect(open).toHaveAttribute('href', url);
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  // No editors for read-only users.
  await expect(card(page).locator('[data-edit]')).toHaveCount(0);
  await expect(card(page)).not.toContainText('Change link');

  // The card belongs to the Campaigns section of the side navigation.
  await page.locator('.rail-item', { hasText: 'Billing' }).click();
  await expect(card(page)).toHaveCount(0);
  await page.locator('.rail-item', { hasText: 'Campaigns' }).click();
  await expect(card(page)).toBeVisible();
});

test('admin adds the app link on the card: a real QR code of it, edits logged and kept', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const c = card(page);
  await expect(c).toBeVisible();
  await expect(c.getByTestId('app-card-body')).toContainText('Add your app link');
  await expect(c.getByTestId('app-qr')).toHaveCount(0);

  const url = 'https://apps.example.com/ai-pilots/download';
  await c.getByRole('button', { name: 'Edit app link' }).click();
  const box = c.locator('input[aria-label="Edit app link"]');
  await box.fill(url);
  await box.press('Enter');
  const qr = c.getByTestId('app-qr');
  await expect(qr).toHaveAttribute('data-ready', 'true');
  await expect(qr.locator('svg')).toHaveCount(1);
  await expect(qr.locator('svg path[stroke]')).toHaveAttribute('d', await qrPath(url));
  await expect(c.getByTestId('app-open-link')).toHaveAttribute('href', url);
  await expect(c.getByTestId('app-open-link')).toHaveAttribute('rel', 'noopener noreferrer');

  // Title and text are edited on the card.
  await c.locator('[data-edit="app card title"]').dblclick();
  await c.locator('input[aria-label="Edit app card title"]').fill('Our phone app');
  await page.keyboard.press('Enter');
  await expect(c.getByTestId('app-card-title')).toHaveText('Our phone app');
  await c.locator('[data-edit="app card text"]').dblclick();
  await c.locator('input[aria-label="Edit app card text"]').fill('Scan to install it');
  await page.keyboard.press('Enter');
  await expect(c.getByTestId('app-card-text')).toHaveText('Scan to install it');

  // A new link redraws the QR code.
  const url2 = 'https://example.org/app';
  await c.getByRole('button', { name: 'Edit app link' }).click();
  await c.locator('input[aria-label="Edit app link"]').fill(url2);
  await page.keyboard.press('Enter');
  await expect(qr.locator('svg path[stroke]')).toHaveAttribute('d', await qrPath(url2));

  // Kept on the server and listed in Change history.
  await page.reload();
  await expect(c.getByTestId('app-card-title')).toHaveText('Our phone app');
  await expect(c.getByTestId('app-open-link')).toHaveAttribute('href', url2);
  const h = await history(page);
  const row = (column) => h.filter((x) => x.column === column).map((x) => [x.level, x.before, x.after]);
  expect(row('App link')).toEqual([['Account', url, url2], ['Account', '', url]]);
  expect(row('App card title')).toEqual([['Account', ACCOUNT_DEFAULTS.appTitle, 'Our phone app']]);
  expect(row('App card text')).toEqual([['Account', ACCOUNT_DEFAULTS.appText, 'Scan to install it']]);

  // Collapse folds the card to its header; Close hides it for this browser session.
  await c.getByTestId('app-card-fold').click();
  await expect(c.getByTestId('app-card-body')).toHaveCount(0);
  await expect(c.getByTestId('app-card-fold')).toHaveAttribute('aria-label', 'Expand');
  await c.getByTestId('app-card-fold').click();
  await expect(c.getByTestId('app-card-body')).toBeVisible();
  await c.getByTestId('app-card-close').click();
  await expect(c).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await expect(c).toHaveCount(0);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(c).toBeVisible();

  // Clearing the link removes the QR code (and the card, for read-only users).
  await c.getByRole('button', { name: 'Edit app link' }).click();
  await c.locator('input[aria-label="Edit app link"]').fill('');
  await page.keyboard.press('Enter');
  await expect(c.getByTestId('app-card-body')).toContainText('Add your app link');
  expect((await (await page.request.get('/api/account')).json()).appUrl).toBe('');
});

test('a link that isn’t a full https address is refused with a message', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const c = card(page);
  for (const bad of ['http://example.com/app', 'example.com/app', 'https://exa mple.com']) {
    await c.getByRole('button', { name: 'Edit app link' }).click();
    await c.locator('input[aria-label="Edit app link"]').fill(bad);
    await page.keyboard.press('Enter');
    await expect(toast(page)).toContainText('Enter a full link that starts with https://');
    await expect(c.getByTestId('app-card-body')).toContainText('Add your app link');
    await expect(c.getByTestId('app-qr')).toHaveCount(0);
  }
  const res = await page.request.patch('/api/account', { data: { field: 'appUrl', value: `https://example.com/${'a'.repeat(500)}` } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toContain('up to 200 characters');
  expect((await (await page.request.get('/api/account')).json()).appUrl).toBe('');
  expect((await history(page)).filter((x) => x.column === 'App link')).toEqual([]);
});

test('Billing in the rail: every item opens its page; Summary figures match the account’s cost data', async ({ page, request }) => {
  await login(page, '/', 'viewer');
  await expect(page.locator('.rail-item .rail-label')).toHaveText(['Campaigns', 'Goals', 'Tools', 'Billing', 'Admin']);
  await page.locator('.rail-item', { hasText: 'Billing' }).click();
  const items = page.locator('.navpanel .nav-item');
  await expect(items.locator('.nav-label')).toHaveText(BILLING_NAV);
  // None of them is muted or marked "Not available yet"; each one's tip is its label.
  for (const it of await items.all()) {
    await expect(it).not.toHaveClass(/\boff\b/);
    await expect(it).not.toHaveAttribute('aria-disabled');
    await expect(it).toHaveAttribute('data-tip', (await it.locator('.nav-label').innerText()).trim());
  }
  await items.filter({ hasText: /^Summary$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/aw/billing/summary/${BRAND.slug}$`));
  await expect(page.locator('h1')).toHaveText('Billing summary');
  await expect(items.filter({ hasText: /^Summary$/ })).toHaveClass(/\bactive\b/);

  // Expected figures, from the same report the tables use.
  const today = todayISO();
  const first = `${today.slice(0, 8)}01`;
  const prevEnd = addDays(first, -1);
  const prevStart = `${prevEnd.slice(0, 8)}01`;
  const report = async (from, to) => (await page.request.get(`/api/report?${new URLSearchParams({ from, to })}`)).json();
  const cost = async (from, to) => (await report(from, to)).totals.current.cost;
  const r = await report(first, today);
  const thisMonth = r.totals.current.cost;
  expect(thisMonth).toBeGreaterThan(0);
  const budgets = r.campaigns.filter((x) => x.status === 'enabled').reduce((s, x) => s + (x.budget ?? 0), 0);
  expect(budgets).toBeGreaterThan(0);
  const lastDay = addDays(`${addDays(first, 32).slice(0, 8)}01`, -1);
  const remaining = daysBetween(today, lastDay);

  const fig = (id) => page.locator(`[data-fig=${id}] [data-testid=billing-value]`);
  await expect(fig('thisMonth')).toHaveText(formatValue('cost', thisMonth));
  await expect(fig('lastMonth')).toHaveText(formatValue('cost', await cost(prevStart, prevEnd)));
  await expect(fig('last30')).toHaveText(formatValue('cost', await cost(addDays(today, -30), addDays(today, -1))));
  await expect(fig('budgets')).toHaveText(formatValue('cost', budgets));
  await expect(fig('estimate')).toHaveText(formatValue('cost', thisMonth + remaining * budgets));
  await expect(page.locator('[data-fig=estimate]')).toContainText(/estimate/i);
  await expect(page.locator('.bill-note').first()).toContainText("Figures come from your account's cost data.");
  // No balances, payments, credits or invoices on the page.
  await expect(page.locator('main')).not.toContainText(/balance|amount due|invoice number|credit/i);

  // Pausing a campaign takes its budget out of the daily budgets (admin change, seen on refresh).
  const enabled = r.campaigns.find((x) => x.status === 'enabled');
  await signIn(request, 'admin');
  expect((await request.patch(`/api/campaigns/${enabled.id}`, { data: { field: 'status', value: 'paused' } })).ok()).toBeTruthy();
  await page.locator('.topact', { hasText: 'Refresh' }).click();
  await expect(fig('budgets')).toHaveText(formatValue('cost', budgets - enabled.budget));

  // The address opens the same page, Billing section shown.
  await page.goto(`/aw/billing/summary/${BRAND.slug}`);
  await expect(page.locator('h1')).toHaveText('Billing summary');
  await expect(page.locator('.rail-item.active .rail-label')).toHaveText('Billing');
  await expect(page.locator('.navpanel .nav-item.active')).toHaveText('Summary');
  await expect(page).toHaveTitle(/^Billing summary-.*-/);
  // Learn more opens the billing article.
  await page.locator('.bill-note').getByRole('button', { name: 'Learn more' }).click();
  await expect(page.getByTestId('quick-help').getByTestId('qh-article')).toHaveAttribute('data-topic', 'billing');
});

test('admin edits the billing profile; read-only users see it without editors', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await page.goto(`/admin/aw/billing/settings/${BRAND.slug}`);
  await expect(page.locator('h1')).toHaveText('Billing settings');
  await expect(field(page, 'billingName')).toContainText('Not set');
  await expect(field(page, 'currency')).toContainText('USD – US dollar');
  await expect(field(page, 'currency')).toContainText("doesn't convert any figures");

  await field(page, 'billingName').locator('[data-edit]').dblclick();
  await page.locator('input[aria-label="Edit billing name"]').fill('Green Fields Co');
  await page.keyboard.press('Enter');
  await expect(field(page, 'billingName').locator('.bill-val')).toHaveText('Green Fields Co');

  // The address keeps its lines: Enter starts a new one, Ctrl+Enter saves.
  await field(page, 'billingAddress').locator('[data-edit]').dblclick();
  const area = page.locator('textarea[aria-label="Edit billing address"]');
  await area.pressSequentially('12 Main St');
  await area.press('Enter');
  await area.pressSequentially('Springfield 12345');
  await area.press('Control+Enter');
  await expect(field(page, 'billingAddress').locator('.bill-val')).toContainText('Springfield 12345');
  expect(await field(page, 'billingAddress').locator('.bill-val').evaluate((el) => el.innerText)).toBe('12 Main St\nSpringfield 12345');

  await field(page, 'currency').locator('[data-edit]').dblclick();
  await page.locator('select[aria-label="Change billing currency"]').selectOption('INR');
  await expect(field(page, 'currency').locator('.bill-val')).toHaveText('INR – Indian rupee');

  // Checked on the server: a bad email is refused with its message.
  await field(page, 'billingEmail').locator('[data-edit]').dblclick();
  await page.locator('input[aria-label="Edit billing email"]').fill('billing-at-example');
  await page.keyboard.press('Enter');
  await expect(toast(page)).toHaveText('Enter an email address');
  await expect(field(page, 'billingEmail')).toContainText('Not set');

  const h = await history(page);
  const cols = h.filter((x) => x.level === 'Account').map((x) => [x.column, x.before, x.after]);
  expect(cols).toEqual([
    ['Billing currency', 'USD', 'INR'],
    ['Billing address', '', '12 Main St, Springfield 12345'],
    ['Billing name', '', 'Green Fields Co'],
  ]);

  // Read-only: same values on Settings and Summary, no editors, and the API refuses changes.
  await page.context().clearCookies();
  await login(page, '/', 'viewer');
  await page.goto(`/aw/billing/settings/${BRAND.slug}`);
  await expect(field(page, 'billingName')).toContainText('Green Fields Co');
  await expect(field(page, 'currency')).toContainText('INR – Indian rupee');
  await expect(field(page, 'billingAddress')).toContainText('Springfield 12345');
  await expect(page.getByTestId('billing-profile').locator('[data-edit]')).toHaveCount(0);
  await expect(page.locator('.bill-hint')).toHaveCount(0);
  await field(page, 'billingName').locator('.bill-val').dblclick();
  await expect(page.locator('main input, main textarea, main select')).toHaveCount(0);
  await page.locator('.navpanel .nav-item', { hasText: /^Summary$/ }).click();
  await expect(page.locator('h1')).toHaveText('Billing summary');
  await expect(field(page, 'billingName')).toContainText('Green Fields Co');
  await expect(page.getByTestId('billing-profile').locator('[data-edit]')).toHaveCount(0);
});

test('Billing pages with no payment provider show their empty state, with nothing to edit', async ({ page }) => {
  for (const who of ['viewer', 'admin']) {
    const base = who === 'admin' ? '/admin' : '';
    await login(page, base || '/', who);
    await page.locator('.rail-item', { hasText: 'Billing' }).click();
    for (const [label, thing, path] of EMPTY) {
      await page.locator('.navpanel .nav-item', { hasText: new RegExp(`^${label}$`) }).click();
      await expect(page).toHaveURL(new RegExp(`${base}${path}/${BRAND.slug}$`));
      await expect(page.locator('h1')).toHaveText(label);
      const empty = page.getByTestId('billing-empty');
      await expect(empty).toContainText(`No ${thing} to show. These appear when a payment provider is connected to ${BRAND.name}.`);
      await expect(page.locator('main [data-edit], main input, main textarea, main select')).toHaveCount(0);
      await expect(page.locator('main table')).toHaveCount(0);
    }
    await page.getByTestId('billing-empty').getByRole('button', { name: 'Learn more' }).click();
    const art = page.getByTestId('quick-help').getByTestId('qh-article');
    await expect(art).toHaveAttribute('data-topic', 'billing');
    await expect(art).toContainText('payment provider');
    await page.context().clearCookies();
  }
});

test('changing the app card or billing profile is for admins only', async ({ page, request }) => {
  await login(page, '/', 'viewer');
  const values = {
    appUrl: 'https://example.com/app', appTitle: 'Title', appText: 'Text', billingName: 'Name', billingAddress: 'Street',
    billingEmail: 'billing@example.com', billingPhone: '+1 555 0100', taxId: 'GB123456789', currency: 'EUR',
  };
  for (const [f, value] of Object.entries(values)) {
    const res = await page.request.patch('/api/account', { data: { field: f, value } });
    expect(res.status(), f).toBe(403);
  }
  // Signed out: no access at all.
  expect((await request.patch('/api/account', { data: { field: 'billingName', value: 'x' } })).status()).toBe(401);
  // Nothing changed.
  const acct = await (await page.request.get('/api/account')).json();
  for (const f of Object.keys(values)) expect(acct[f], f).toBe(ACCOUNT_DEFAULTS[f]);
  // Admins can.
  await signIn(request, 'admin');
  for (const [f, value] of Object.entries(values)) {
    const res = await request.patch('/api/account', { data: { field: f, value } });
    expect(res.ok(), f).toBeTruthy();
    expect((await res.json()).account[f], f).toBe(value);
  }
  // Fields that aren't account details (and money records) can't be set.
  for (const f of ['balance', 'invoice', 'payment', 'cardNumber', 'promotion']) {
    expect((await request.patch('/api/account', { data: { field: f, value: '1' } })).status(), f).toBe(400);
  }
});
