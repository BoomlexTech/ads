import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';
import { BRAND, DEFAULT_ACCOUNT } from '../shared/brand.js';

// The shell around every page: the Quick help panel, Send feedback (dialog, API and the admins'
// Feedback page), the top search dropdown, the rail and side navigation, Appearance > Spacing,
// and the window events other parts of the app use to open the side panels.

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
}

const help = (page) => page.getByTestId('quick-help');
// Page addresses have no '?': ids are path parts and every address ends in /<brand slug>.
const S = BRAND.slug;
const fire =(page, type, detail) => page.evaluate(([t, d]) => window.dispatchEvent(new CustomEvent(t, { detail: d })), [type, detail]);
// Holds matching requests until the returned release() is called (later requests pass).
async function holdRequests(page, url, method = 'GET') {
  let release;
  const held = new Promise((r) => { release = r; });
  let on = true;
  await page.route(url, async (route) => {
    if (on && route.request().method() === method) await held;
    await route.continue();
  });
  return () => { on = false; release(); };
}
const heightOf = (loc) => loc.evaluate((el) => el.getBoundingClientRect().height);

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('Help opens Quick help: most relevant article, Read more, articles, search and back', async ({ page }) => {
  await login(page, '/', 'viewer');
  await page.getByTestId('help-button').click();
  const qh = help(page);
  await expect(qh.locator('h2')).toHaveText('Quick help');
  await expect(page.getByTestId('help-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(qh.getByTestId('qh-search')).toHaveAttribute('placeholder', 'Search Quick help');

  // On the ads page the most relevant article is about the figures; Read more expands it in place.
  const rel = qh.getByTestId('qh-relevant');
  await expect(rel).toHaveAttribute('data-topic', 'metrics');
  await expect(rel.locator('li')).toHaveCount(0);
  await rel.getByRole('button', { name: 'Read more' }).click();
  await expect(rel.locator('li').first()).toBeVisible();
  await expect(rel.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');

  // Another article opens in the panel, with a back arrow.
  await qh.getByTestId('qh-article-link').filter({ hasText: 'Images for your ad' }).click();
  const art = qh.getByTestId('qh-article');
  await expect(art).toHaveAttribute('data-topic', 'images');
  await expect(art).toContainText('up to 15');
  await qh.getByTestId('qh-back').click();
  await expect(art).toHaveCount(0);
  await expect(rel).toBeVisible();

  // Search looks through every article, title matches first.
  await qh.getByTestId('qh-search').fill('segment');
  await expect(qh.getByTestId('qh-article-link').first()).toHaveText(/Segments$/);
  await qh.getByTestId('qh-search').fill('zzzz');
  await expect(qh.getByTestId('qh-results')).toContainText('No help articles match');

  // Quick help and Ask Advisor share the right side: opening one closes the other.
  await page.getByTestId('ask-advisor').click();
  await expect(page.getByTestId('advisor')).toBeVisible();
  await expect(qh).toHaveCount(0);
  await page.getByTestId('help-button').click();
  await expect(qh).toBeVisible();
  await expect(page.getByTestId('advisor')).toHaveCount(0);
  await expect(page.getByTestId('top-search')).toHaveCount(0);
  await qh.getByLabel('Close Quick help').click();
  await expect(qh).toHaveCount(0);
  await expect(page.getByTestId('top-search')).toBeVisible();
});

test('help links open Quick help on their topic; Notifications is empty; app:ask asks Advisor', async ({ page }) => {
  await login(page, '/', 'viewer');
  await fire(page, 'app:help', { topic: 'time-zone' });
  const art = help(page).getByTestId('qh-article');
  await expect(art).toHaveAttribute('data-topic', 'time-zone');
  // Another link while the panel is open switches the article; Back shows it as most relevant.
  await fire(page, 'app:help', { topic: 'columns' });
  await expect(art).toHaveAttribute('data-topic', 'columns');
  await help(page).getByTestId('qh-back').click();
  await expect(help(page).getByTestId('qh-relevant')).toHaveAttribute('data-topic', 'columns');

  // Notifications are switched off: no badge, no items (no conversion tracking tip), just a note.
  const bell = page.locator('.topact', { hasText: 'Notifications' });
  await expect(page.locator('.notif-badge')).toHaveCount(0);
  await bell.click();
  const panel = page.getByTestId('notifications');
  await expect(panel.getByTestId('notif-empty')).toHaveText('You have no notifications.');
  await expect(panel.locator('.notif-item')).toHaveCount(0);
  await expect(panel).not.toContainText('conversion tracking');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  // Quick help is left as it was.
  await expect(help(page).getByTestId('qh-relevant')).toHaveAttribute('data-topic', 'columns');
  expect(new URL(page.url()).pathname).toBe(`/aw/ads/${S}`);

  // A question sent with app:ask opens Ask Advisor (closing Quick help) and is answered.
  await fire(page, 'app:ask', { question: 'How much did I spend?' });
  const adv = page.getByTestId('advisor');
  await expect(adv.locator('.adv-msg.me')).toHaveText('How much did I spend?');
  await expect(adv.locator('.adv-msg.bot').last()).toContainText('You spent $');
  await expect(help(page)).toHaveCount(0);
});

test('Send feedback from the top search is saved, and admins read it on the Feedback page', async ({ page }) => {
  await login(page, '/', 'viewer');
  await page.getByTestId('top-search').click();
  await page.getByTestId('search-feedback').click();
  const dlg = page.getByTestId('feedback-dialog');
  await expect(dlg).toBeVisible();
  await expect(page.getByTestId('search-drop')).toHaveCount(0);
  await expect(dlg.getByTestId('feedback-about')).toHaveValue('Search');
  await expect(dlg.getByTestId('feedback-send')).toBeDisabled();
  await dlg.getByTestId('feedback-text').fill('The recent campaigns list is handy.\nMore filters, please.');
  await dlg.getByTestId('feedback-page').check();
  await dlg.getByTestId('feedback-send').click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('Thanks, your feedback was sent');

  // Viewers can't read feedback and have no Feedback page, not even by its address.
  expect((await page.request.get('/api/feedback')).status()).toBe(403);
  await expect(page.locator('.nav-item', { hasText: /^Feedback$/ })).toHaveCount(0);
  await page.goto(`/aw/feedback/${S}`);
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  expect(new URL(page.url()).pathname).toBe(`/aw/ads/${S}`);

  await page.request.post('/api/logout');
  await login(page, '/admin', 'admin');
  await page.locator('.nav-item', { hasText: /^Feedback$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/aw/feedback/${S}$`));
  await expect(page.locator('h1')).toHaveText('Feedback');
  await expect(page).toHaveTitle(`Feedback - ${BRAND.name}`);
  const row = page.getByTestId('feedback-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('The recent campaigns list is handy.');
  await expect(row).toContainText('Read-only');
  await expect(row).toContainText('Search');
  await expect(row.locator('td.fb-page')).toContainText('/aw/ads');
  // The page's address reopens it.
  await page.reload();
  await expect(page.getByTestId('feedback-row')).toHaveCount(1);
});

test('feedback dialog opens from app:feedback; the API checks, caps and limits sends', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await fire(page, 'app:feedback', { about: 'Select view' });
  const dlg = page.getByTestId('feedback-dialog');
  await expect(dlg.getByTestId('feedback-about')).toHaveValue('Select view');
  await expect(dlg.getByTestId('feedback-text')).toBeFocused();
  await expect(dlg.getByTestId('feedback-text')).toHaveAttribute('maxlength', '2000');
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await fire(page, 'app:feedback', {});
  await expect(dlg.getByTestId('feedback-about')).toHaveValue('General');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(dlg).toHaveCount(0);

  // Text is required and up to 2,000 characters; "about" is capped; only a path on this site is kept.
  const post = (data) => page.request.post('/api/feedback', { data });
  expect((await post({ text: '   ' })).status()).toBe(400);
  expect((await post({ text: 'x'.repeat(2001) })).status()).toBe(400);
  expect((await post({ about: 'y'.repeat(300), text: 'Fine', page: 'https://elsewhere.example/x' })).status()).toBe(200);
  const [saved] = await (await page.request.get('/api/feedback')).json();
  expect(saved.about).toHaveLength(100);
  expect(saved.page).toBe('');
  expect(saved.role).toBe('admin');
  expect(saved.text).toBe('Fine');
  // 20 sends an hour per user.
  for (let i = 1; i < 20; i++) expect((await post({ text: `Note ${i}` })).status()).toBe(200);
  expect((await post({ text: 'One too many' })).status()).toBe(429);
  expect(await (await page.request.get('/api/feedback')).json()).toHaveLength(20);
});

test('top search: placeholder and keys, recent campaigns first, Ask Advisor and help matches', async ({ page }) => {
  await login(page, '/', 'viewer');
  const box = page.getByTestId('top-search');
  await expect(box).toHaveAttribute('placeholder', '"What are my biggest opportunities for growth right now?"');
  await expect(page.getByTestId('search-keys')).toHaveCount(0);
  await box.click();
  const drop = page.getByTestId('search-drop');
  const recent = drop.locator('[data-kind=recent]');
  await expect(drop.locator('.sd-title').first()).toHaveText('Recent campaigns (all but removed)');
  await expect(recent).toHaveCount(5);
  // Newest first until campaigns are opened.
  await expect(recent.first()).toContainText('Leads-Display-1');
  await expect(recent.first().locator('.sd-ic')).toHaveText('web');
  await expect(drop.locator('[data-kind=ask]')).toHaveCount(4);
  await expect(drop.locator('[data-kind=ask]').last()).toHaveText('Ask something else');
  await expect(drop).toContainText('Send feedback');

  // An opened campaign moves to the top of the list.
  await recent.filter({ hasText: 'Video views - 2025-04-04' }).click();
  await expect(page).toHaveURL(new RegExp(`/aw/adgroups/[0-9a-f]{24}/${S}$`));
  await box.click();
  await expect(recent.first()).toContainText('Video views - 2025-04-04');

  // Typing matches help articles too; one opens in Quick help.
  await box.fill('column');
  const helpHit = drop.locator('[data-kind=help]').first();
  await expect(helpHit).toContainText('Choosing columns');
  await helpHit.click();
  await expect(help(page).getByTestId('qh-article')).toHaveAttribute('data-topic', 'columns');
});

// A side-nav item looks like every other one: not muted, not aria-disabled, its own label as tip.
async function expectPlainNavItem(item) {
  await expect(item).not.toHaveClass(/\boff\b/);
  await expect(item).not.toHaveAttribute('aria-disabled');
  await expect(item).toBeEnabled();
  await expect(item).toHaveAttribute('data-tip', (await item.locator('.nav-label').innerText()).trim());
}

test('rail and side nav: Billing has its pages, items without a page look the same and do nothing, Create shows for everyone', async ({ page }) => {
  await login(page, '/', 'viewer');
  await expect(page.locator('.rail-item .rail-label')).toHaveText(['Campaigns', 'Goals', 'Tools', 'Billing', 'Admin']);
  await expect(page.getByTestId('rail-create')).toHaveCount(1);
  // No item anywhere in the nav says "Not available yet".
  await expect(page.locator('.navpanel [data-tip*="Not available"]')).toHaveCount(0);
  const overview = page.locator('.nav-item', { hasText: 'Overview' });
  await expectPlainNavItem(overview);
  await expect(overview).toHaveAttribute('data-tip', 'Overview');
  await expectPlainNavItem(page.locator('.nav-group .nav-item', { hasText: /^Ads$/ }));
  // Clicking an item without a page does nothing.
  await overview.click();
  expect(new URL(page.url()).pathname).toBe(`/aw/ads/${S}`);
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await expect(overview).not.toHaveClass(/\bactive\b/);

  await page.locator('.rail-item', { hasText: 'Goals' }).click();
  const goals = page.locator('.navpanel .nav-item');
  await expect(goals).toHaveCount(3);
  for (const item of await goals.all()) await expectPlainNavItem(item);
  await goals.first().click();
  expect(new URL(page.url()).pathname).toBe(`/aw/ads/${S}`);
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  // Every Billing item opens a page (see billing-app.spec.js).
  await page.locator('.rail-item', { hasText: 'Billing' }).click();
  const billing = page.locator('.navpanel .nav-item');
  await expect(billing).toHaveCount(7);
  for (const item of await billing.all()) await expectPlainNavItem(item);
});

test('admin Create menu opens the matching page and its create menu', async ({ page }) => {
  await login(page, '/admin', 'admin');
  // The Create button shows the four-colour plus: red, blue, green and yellow bars.
  const bars = page.getByTestId('rail-create').locator('svg rect');
  await expect(bars).toHaveCount(4);
  expect(await bars.evaluateAll((els) => els.map((e) => e.getAttribute('fill').toLowerCase())))
    .toEqual(['#ea4335', '#4285f4', '#34a853', '#fbbc04']);
  await page.getByTestId('rail-create').click();
  const menu = page.getByTestId('rail-create-menu');
  await expect(menu.locator('.menu-item .mi-label')).toHaveText(['Campaign', 'Ad group', 'Search keywords', 'Conversion action', 'Asset']);
  await menu.getByText('Campaign', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/aw/campaigns/${S}$`));
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await expect(page.locator('.table-toolbar .create-menu')).toContainText('New campaign');
  await page.keyboard.press('Escape');
  await expect(page.locator('.table-toolbar .create-menu')).toHaveCount(0);

  // An item without a page yet just closes the menu.
  await page.getByTestId('rail-create').click();
  await page.getByTestId('rail-create-menu').getByText('Search keywords').click();
  await expect(page.getByTestId('rail-create-menu')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/admin/aw/campaigns/${S}$`));
});

test('the feedback dialog stays open while a send is in flight, then closes once it lands', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const release = await holdRequests(page, '**/api/feedback', 'POST');
  await fire(page, 'app:feedback', { about: 'Search' });
  const dlg = page.getByTestId('feedback-dialog');
  await dlg.getByTestId('feedback-text').fill('Sent on a slow connection');
  await dlg.getByTestId('feedback-send').click();
  await expect(dlg.getByTestId('feedback-send')).toBeDisabled();
  await expect(dlg.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await expect(dlg.getByRole('button', { name: 'Close' })).toBeDisabled();
  // Esc and the scrim don't close it, and another Send feedback doesn't replace it.
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await fire(page, 'app:feedback', { about: 'Quick help' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByTestId('feedback-text')).toHaveValue('Sent on a slow connection');
  await expect(dlg.getByTestId('feedback-about')).toHaveValue('Search');

  release();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveText('Thanks, your feedback was sent');
  const saved = await (await page.request.get('/api/feedback')).json();
  expect(saved.map((f) => f.text)).toEqual(['Sent on a slow connection']);
});

test('broken or oversized request bodies get a 4xx reply, not a server error', async ({ page }) => {
  const raw = (data) => page.request.post('/api/feedback', { headers: { 'Content-Type': 'application/json' }, data });
  // Signed out: the body is read before sign-in is checked.
  let res = await raw('{"text": "hi"');
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: 'Bad request' });
  res = await raw(JSON.stringify({ text: 'x'.repeat(60 * 1024) }));
  expect(res.status()).toBe(413);
  expect(await res.json()).toEqual({ error: 'Request is too large' });
  // A missing built file is a 404.
  res = await page.request.get('/assets/no-such-file-e2e.js');
  expect(res.status()).toBe(404);
});

test('Change history and Feedback opened from their address still know the campaigns; Notifications stays empty', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const bell = page.locator('.topact', { hasText: 'Notifications' });
  await page.goto(`/admin/aw/changehistory/${S}`);
  await expect(page.getByTestId('history-table')).toBeVisible();
  await expect(bell.locator('.notif-badge')).toHaveCount(0);
  const box = page.getByTestId('top-search');
  const drop = page.getByTestId('search-drop');
  await box.click();
  await expect(drop.locator('[data-kind=recent]')).toHaveCount(5);
  await box.fill('Leads');
  await drop.locator('[data-kind=campaign]', { hasText: 'Leads-Display-1' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/aw/adgroups/[0-9a-f]{24}/${S}$`));
  await expect(page.getByTestId('adgroup-row')).toHaveCount(1);

  await page.goto(`/admin/aw/feedback/${S}`);
  await expect(page.locator('h1')).toHaveText('Feedback');
  await expect(bell.locator('.notif-badge')).toHaveCount(0);
  await bell.click();
  await expect(page.getByTestId('notif-empty')).toHaveText('You have no notifications.');
  await expect(page.getByTestId('notifications').locator('.notif-item')).toHaveCount(0);
});

test('top search: G T opens it, Esc closes it from its items, and so does Tab past the end', async ({ page }) => {
  await login(page, '/', 'viewer');
  const box = page.getByTestId('top-search');
  const drop = page.getByTestId('search-drop');
  const scrim = page.locator('.search-scrim');
  await page.keyboard.press('g');
  await page.keyboard.press('t');
  await expect(box).toBeFocused();
  await expect(drop).toBeVisible();
  // Into the list, then Esc: the list and the grey scrim go.
  await page.keyboard.press('Tab');
  await expect(drop.locator('.sd-item').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drop).toHaveCount(0);
  await expect(scrim).toHaveCount(0);

  // Tab past the last item (Send feedback) moves focus out to the top bar: the list closes.
  await box.click();
  await expect(drop).toBeVisible();
  await page.getByTestId('search-feedback').focus();
  await page.keyboard.press('Tab');
  await expect(drop).toHaveCount(0);
  await expect(scrim).toHaveCount(0);
  await expect(page.getByTestId('feedback-dialog')).toHaveCount(0);

  // Arrow keys move the highlight; Enter opens the highlighted result.
  await box.fill('Campaig');
  const items = drop.locator('.sd-item');
  await expect(items.first()).toHaveAttribute('aria-selected', 'true');
  await expect(items.first()).toHaveAttribute('data-kind', 'page');
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(items.first()).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('ArrowUp');
  await expect(items.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toHaveText('Campaigns');
  await expect(drop).toHaveCount(0);
});

test('a question from the top search that Advisor never answered is dropped when Quick help replaces it', async ({ page }) => {
  await login(page, '/', 'viewer');
  const release = await holdRequests(page, /\/api\/report\?/);
  await page.getByTestId('top-search').fill('How much did I spend?');
  await page.getByTestId('search-drop').locator('[data-kind=ask]').last().click();
  const adv = page.getByTestId('advisor');
  await expect(adv).toBeVisible();
  // Before Advisor's data arrives, Quick help takes its place.
  await page.getByTestId('help-button').click();
  await expect(help(page)).toBeVisible();
  await expect(adv).toHaveCount(0);
  release();

  // Opened again later, Advisor doesn't ask the old question by itself.
  await page.getByTestId('ask-advisor').click();
  await expect(adv.getByTestId('adv-snapshot')).toBeVisible();
  await expect(adv.locator('.adv-msg.me')).toHaveCount(0);
  await adv.getByLabel('Chat history').click();
  await expect(adv.locator('.adv-hist-item')).toHaveCount(0);
});

test('Quick help and Ask Advisor show above the edit page dialogs; Appearance is not on the edit page', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const r = page.getByTestId('ad-row').filter({ has: page.locator('td.c-camp', { hasText: 'Leads-Display-1' }) }).first();
  await r.hover();
  await r.getByTestId('edit-ad').click();
  await expect(page).toHaveURL(new RegExp(`/admin/aw/ads/edit/display/[0-9a-f]{24}/${S}$`));
  await expect(page.getByTestId('appearance-button')).toHaveCount(0);
  await page.getByTestId('ad-edit').getByTestId('edit-images').click();
  await expect(page.getByTestId('asset-dialog')).toBeVisible();

  // A help link while the dialog is open: the panel is on top, not hidden behind the dialog.
  await fire(page, 'app:help', { topic: 'images' });
  const panel = help(page);
  await expect(panel.getByTestId('qh-article')).toHaveAttribute('data-topic', 'images');
  const onTop = (loc) => loc.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
  });
  expect(await onTop(panel)).toBe(true);
  expect(await panel.evaluate((el) => [getComputedStyle(el).position, getComputedStyle(el).zIndex])).toEqual(['relative', '95']);
  await fire(page, 'app:ask', {});
  await expect(page.getByTestId('advisor')).toBeVisible();
  expect(await onTop(page.getByTestId('advisor'))).toBe(true);
});

test('Appearance > Spacing: four spacings, the current one marked, sizes change and the choice is remembered', async ({ page }) => {
  await login(page, '/', 'viewer');
  const shell = page.locator('.app-shell');
  await expect(shell).toHaveAttribute('data-density', 'large');
  const sizes = async () => ({
    // A display or video ad (search ad rows are as tall as their text).
    row: await heightOf(page.getByTestId('ad-row').filter({ has: page.locator('.adcell:not(.search)') }).first()),
    head: await heightOf(page.locator('.grid-head th').first()),
    nav: await heightOf(page.locator('.nav-item', { hasText: 'Overview' })),
    card: await heightOf(page.getByTestId('scorecard-impressions')),
  });
  const large = await sizes();

  // Viewers can use it too: it only changes this browser's view.
  const btn = page.getByTestId('appearance-button');
  await expect(btn).toHaveAttribute('data-tip', 'Appearance');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  const menu = page.getByTestId('appearance-menu');
  await expect(menu.locator('.menu-title')).toHaveText('Spacing');
  const items = menu.getByRole('menuitemradio');
  await expect(items).toHaveText(['Large', 'Medium', 'Small', 'Extra small']);
  await expect(items.nth(0)).toHaveAttribute('aria-checked', 'true');
  await expect(items.nth(0)).toHaveClass(/\bselected\b/);
  await expect(menu.locator('[aria-checked=true]')).toHaveCount(1);
  // Each icon has one more line than the one before, so its lines sit closer together.
  expect(await items.evaluateAll((els) => els.map((e) => e.querySelectorAll('svg line').length))).toEqual([2, 3, 4, 5]);

  await items.nth(3).click();
  await expect(menu).toHaveCount(0);
  await expect(shell).toHaveAttribute('data-density', 'xsmall');
  const xsmall = await sizes();
  for (const k of Object.keys(large)) expect(xsmall[k], k).toBeLessThan(large[k]);

  await btn.click();
  await expect(items.nth(3)).toHaveAttribute('aria-checked', 'true');
  await items.nth(1).click();
  await expect(shell).toHaveAttribute('data-density', 'medium');
  const medium = await sizes();
  for (const k of Object.keys(large)) {
    expect(medium[k], k).toBeLessThan(large[k]);
    expect(medium[k], k).toBeGreaterThan(xsmall[k]);
  }

  // Kept in this browser: a reload keeps Medium.
  await page.reload();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await expect(shell).toHaveAttribute('data-density', 'medium');
  await btn.click();
  await expect(items.nth(1)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // Back to Large: the standard sizes again.
  await btn.click();
  await items.nth(0).click();
  await expect(shell).toHaveAttribute('data-density', 'large');
  expect(await sizes()).toEqual(large);
});

test('Spacing also tightens the campaigns table and the Change history table', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await page.evaluate(() => localStorage.setItem('ap.density', 'xsmall'));
  await page.goto(`/admin/aw/campaigns/${S}`);
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-density', 'xsmall');
  const campHead = await heightOf(page.locator('.grid-head th').first());
  await page.locator('.nav-item', { hasText: /^Change history$/ }).click();
  await expect(page.getByTestId('history-table')).toBeVisible();
  const histHead = await heightOf(page.getByTestId('history-table').locator('thead th').first());

  await page.getByTestId('appearance-button').click();
  await page.getByTestId('appearance-menu').getByRole('menuitemradio', { name: 'Large' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-density', 'large');
  expect(await heightOf(page.getByTestId('history-table').locator('thead th').first())).toBeGreaterThan(histHead);
  await page.locator('.nav-group .nav-item', { hasText: /^Campaigns$/ }).click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  expect(await heightOf(page.locator('.grid-head th').first())).toBeGreaterThan(campHead);
});

test('Rail > Create: a wait left from an earlier Create stops when the page changes', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const release = await holdRequests(page, /\/api\/report\?/);
  // New ad group while the ad groups' data is held back, then away and back again.
  await page.getByTestId('rail-create').click();
  await page.getByTestId('rail-create-menu').getByText('Ad group', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/aw/adgroups/${S}$`));
  await page.locator('.nav-group .nav-item', { hasText: /^Campaigns$/ }).click();
  await page.locator('.nav-group .nav-item', { hasText: /^Ad groups$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/aw/adgroups/${S}$`));
  release();
  await expect(page.getByTestId('adgroup-row').first()).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator('.table-toolbar .create-menu')).toHaveCount(0);
});

test('Rail > Create closes an open Columns panel and opens the create menu', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await page.locator('.nav-group .nav-item', { hasText: /^Campaigns$/ }).click();
  await expect(page.getByTestId('campaign-row')).toHaveCount(7);
  await page.locator('.table-toolbar .toolbtn', { hasText: 'Columns' }).click();
  await expect(page.getByTestId('columns-panel')).toBeVisible();
  await page.getByTestId('rail-create').click();
  await page.getByTestId('rail-create-menu').getByText('Campaign', { exact: true }).click();
  await expect(page.getByTestId('columns-panel')).toHaveCount(0);
  await expect(page.locator('.table-toolbar .create-menu')).toContainText('New campaign');
  // Nothing opens again on its own after the menu is closed.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await expect(page.locator('.table-toolbar .create-menu')).toHaveCount(0);
});

test('asset details opened from its address keeps its tab title; closing it shows the ads title', async ({ page }) => {
  await login(page, '/', 'viewer');
  const id = await page.getByTestId('ad-row').first().getAttribute('data-id');
  await page.goto(`/aw/ads/assets/${id}/${S}`);
  await expect(page.getByTestId('asset-details').locator('h1')).toHaveText('Asset details');
  await expect(page).toHaveTitle(`Asset details - ${BRAND.name}`);
  await page.getByTestId('asset-crumb').click();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await expect(page).toHaveTitle(`Ads-${DEFAULT_ACCOUNT.name}-${BRAND.name}`);
});

test('help articles state the real upload caps, search keys and where Advisor questions are kept', async ({ page }) => {
  await login(page, '/', 'viewer');
  const art = help(page).getByTestId('qh-article');
  await fire(page, 'app:help', { topic: 'logos' });
  await expect(art).toContainText('up to 5 MB each');
  await expect(art).not.toContainText('10 MB');
  await fire(page, 'app:help', { topic: 'images' });
  await expect(art).toContainText('up to 10 MB each');
  await fire(page, 'app:help', { topic: 'videos' });
  await expect(art).toContainText('up to 50 MB');
  await fire(page, 'app:help', { topic: 'search' });
  await expect(art).toContainText('Enter opens the highlighted result');
  await expect(art).not.toContainText('Press Enter on your own words');
  await fire(page, 'app:help', { topic: 'advisor' });
  await expect(art).toContainText('saved in this browser, even after you reload or sign out');
  await expect(art).not.toContainText('until you reload the page');
  // The Spacing article is found by searching for it.
  await help(page).getByTestId('qh-back').click();
  await help(page).getByTestId('qh-search').fill('spacing');
  await expect(help(page).getByTestId('qh-article-link').first()).toHaveText(/Spacing$/);
});
