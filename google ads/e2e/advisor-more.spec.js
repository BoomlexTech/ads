import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';
import { BRAND, DEFAULT_ACCOUNT } from '../shared/brand.js';
import { formatValue } from '../shared/metrics.js';
import { todayISO, addDays } from '../shared/dates.js';

// Ask Advisor chat panel: the welcome summary, "Last 30 days" snapshot and insight cards are
// worked out from the report; follow-up links ask the next question; the message box, earlier
// questions, thumbs up / down, the ⋮ menu and Quick help links.

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
}

// Opens the panel (unless it is already open) and waits for the data-driven welcome message.
async function openAdvisor(page) {
  const adv = page.getByTestId('advisor');
  if (!(await adv.count())) await page.getByTestId('ask-advisor').click();
  await expect(adv.getByTestId('adv-summary')).toBeVisible();
  return adv;
}

// The report for the same 30 days the panel reads (yesterday and the 29 days before it).
async function last30Report(page) {
  const y = addDays(todayISO(), -1);
  const res = await page.request.get('/api/report?' + new URLSearchParams({ from: addDays(y, -29), to: y }));
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// Records the events the panel sends to the shell (Quick help, feedback).
async function recordEvents(page) {
  await page.evaluate(() => {
    window.__advEvents = [];
    for (const t of ['app:help', 'app:feedback']) window.addEventListener(t, (e) => window.__advEvents.push([t, e.detail]));
  });
}
const events = (page) => page.evaluate(() => window.__advEvents);

const card = (adv, title) => adv.getByTestId('adv-insight').filter({ hasText: title });
const lastAnswer = (adv) => adv.locator('.adv-msg.bot').last();
const lastQuestion = (adv) => adv.locator('.adv-msg.me').last();
// One line of an answer's table of figures, by its label.
const fig = (answer, label) => answer.locator('.adv-rows li').filter({ has: answer.page().getByText(label, { exact: true }) });
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (n, noun) => new RegExp(`(^|\\s)${n} ${noun}s?\\b`);
async function askTyped(adv, question) {
  await adv.getByLabel('Type message').fill(question);
  await adv.getByLabel('Type message').press('Enter');
  await expect(lastQuestion(adv)).toHaveText(question);
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('welcome message, snapshot and insight cards are worked out from the report', async ({ page }) => {
  await login(page, '/', 'viewer');
  const adv = await openAdvisor(page);
  const head = adv.locator('.adv-head');
  await expect(head.locator('h2')).toHaveText('Ask Advisor');
  await expect(head.locator('.adv-beta')).toHaveText('BETA');
  await expect(adv.locator('.adv-welcome')).toHaveText(`Welcome, ${DEFAULT_ACCOUNT.name}`);

  const t = (await last30Report(page)).totals.account;
  const summary = adv.getByTestId('adv-summary');
  await expect(summary).toContainText('2 of your 7 campaigns are running');
  await expect(summary).toContainText('with 4 of 9 ads eligible to show');
  await expect(summary).toContainText(`shown ${formatValue('impressions', t.impressions)} times`);
  await expect(summary).toContainText(`got ${formatValue('clicks', t.clicks)} clicks`);

  const snap = adv.getByTestId('adv-snapshot');
  await expect(snap.locator('.adv-snap-title')).toHaveText('Last 30 days');
  await expect(snap.locator('[data-metric]')).toHaveCount(3);
  for (const m of ['clicks', 'impressions', 'cost']) {
    await expect(snap.locator(`[data-metric=${m}] .adv-value`)).toHaveText(formatValue(m, t[m]));
  }
  await expect(snap.locator('[data-metric=cost] .adv-value')).toHaveText(/^\$[\d,]+\.\d\d$/);

  const cards = adv.getByTestId('adv-insight');
  await expect(cards).toHaveCount(5);
  await expect(cards.first()).toContainText("5 of your 9 ads aren't running");
  await expect(card(adv, 'Clicks without conversions')).toContainText('Leads-Display-1');
  await expect(card(adv, 'Lowest clickthrough rate')).toContainText('Leads-Display-1');
  await expect(card(adv, 'Most of your spend goes to one campaign')).toContainText('Website traffic-Search-JAN2026');
  await expect(card(adv, 'Your top campaign for conversions')).toContainText('Website traffic-Search-JAN2026');
  // Every card can be rated, and each follow-up question is offered only once.
  for (let i = 0; i < 5; i++) {
    await expect(cards.nth(i).getByRole('button', { name: 'Helpful', exact: true })).toBeVisible();
    await expect(cards.nth(i).getByRole('button', { name: 'Not helpful', exact: true })).toBeVisible();
  }
  const follow = await adv.locator('.adv-start .adv-follow-link').allTextContents();
  expect(follow.length).toBeGreaterThan(5);
  expect(new Set(follow).size).toBe(follow.length);

  await expect(adv.locator('.adv-foot')).toContainText('Answers are worked out from your account data and can be incomplete.');
  // The panel only reads: nothing to edit or upload.
  await expect(adv.locator('.editable, input[type=file]')).toHaveCount(0);
});

test('follow-up links ask the next question and the answers come from the data', async ({ page }) => {
  await login(page, '/', 'viewer');
  const adv = await openAdvisor(page);

  await card(adv, "ads aren't running").getByRole('button', { name: "Which ads aren't running?" }).click();
  await expect(lastQuestion(adv)).toHaveText("Which ads aren't running?");
  await expect(lastAnswer(adv)).toContainText("5 of your 9 ads aren't running");
  await expect(lastAnswer(adv).locator('li')).toHaveCount(5);
  await expect(lastAnswer(adv)).toContainText('Campaign is paused');

  await card(adv, 'Most of your spend').getByRole('button', { name: 'How is my spend split across campaigns?' }).click();
  await expect(lastQuestion(adv)).toHaveText('How is my spend split across campaigns?');
  await expect(lastAnswer(adv).locator('li')).toHaveCount(2);
  await expect(lastAnswer(adv).locator('li').first()).toContainText('Website traffic-Search-JAN2026');
  const shares = (await lastAnswer(adv).locator('li b').allTextContents()).map((s) => Number(/(\d+)% of spend/.exec(s)[1]));
  expect(shares[0]).toBeGreaterThanOrEqual(50);
  expect(Math.abs(shares[0] + shares[1] - 100)).toBeLessThanOrEqual(1);

  await card(adv, 'Lowest clickthrough rate').getByRole('button', { name: 'Show CTR for every campaign' }).click();
  await expect(lastQuestion(adv)).toHaveText('Show CTR for every campaign');
  await expect(lastAnswer(adv).locator('li')).toHaveCount(2);
  await expect(lastAnswer(adv).locator('li').first()).toContainText('Leads-Display-1');

  // Headlines of the search ads that were shown, with their ad's figures (results are per ad).
  await card(adv, 'Lowest clickthrough rate').getByRole('button', { name: 'Show my best headlines' }).click();
  await expect(lastQuestion(adv)).toHaveText('Show my best headlines');
  await expect(lastAnswer(adv).locator('li')).toHaveCount(6);
  await expect(lastAnswer(adv)).toContainText('Best Seeds For Rabi Season');
  await expect(lastAnswer(adv)).toContainText('Soil Testing Made Easy');
  await expect(lastAnswer(adv)).toContainText('not per headline');

  await card(adv, 'Clicks without conversions').getByRole('button', { name: 'Which campaigns have clicks but no conversions?' }).click();
  await expect(lastAnswer(adv).locator('li')).toHaveCount(1);
  await expect(lastAnswer(adv).locator('li')).toContainText('Leads-Display-1');
  await expect(lastAnswer(adv).locator('[data-help="conversion-tracking"]')).toBeVisible();

  await adv.getByTestId('adv-snapshot').getByRole('button', { name: 'Compare with the 30 days before' }).click();
  await expect(lastAnswer(adv).locator('li')).toHaveCount(5);
  for (const label of ['Impressions', 'Clicks', 'CTR', 'Cost', 'Conversions']) await expect(lastAnswer(adv)).toContainText(label);

  await expect(adv.locator('.adv-msg.me')).toHaveCount(6);
});

test('message box, earlier questions and clearing the conversation', async ({ page }) => {
  await login(page, '/', 'viewer');
  const adv = await openAdvisor(page);
  const box = adv.getByLabel('Type message');
  const send = adv.getByRole('button', { name: 'Send', exact: true });
  await expect(box).toHaveAttribute('placeholder', 'Type message');
  await expect(send).toBeDisabled();

  // Shift+Enter adds a line, Enter sends.
  await box.fill('How much did I');
  await box.press('Shift+Enter');
  await box.pressSequentially('spend?');
  await expect(box).toHaveValue('How much did I\nspend?');
  await box.press('Enter');
  await expect(box).toHaveValue('');
  await expect(lastQuestion(adv)).toHaveText(/How much did I\s+spend\?/);
  await expect(lastAnswer(adv)).toContainText('You spent $');

  await box.fill('Which campaigns are paused?');
  await send.click();
  await expect(lastAnswer(adv).locator('li')).toHaveCount(5);

  // Earlier questions, newest first; picking one asks it again.
  await adv.getByLabel('Chat history').click();
  const items = adv.locator('.adv-hist-item');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toHaveText(/Which campaigns are paused\?$/);
  await items.nth(1).click();
  await expect(adv.getByTestId('adv-history')).toHaveCount(0);
  await expect(adv.locator('.adv-msg.me')).toHaveCount(3);
  await expect(lastAnswer(adv)).toContainText('You spent $');

  // ⋮ > Clear conversation leaves the welcome message.
  await adv.getByLabel('More options').click();
  await page.locator('.menu-item', { hasText: 'Clear conversation' }).click();
  await expect(adv.locator('.adv-msg')).toHaveCount(0);
  await expect(adv.getByTestId('adv-insight')).toHaveCount(5);

  // Earlier questions are kept in this browser: still listed after a reload, until cleared.
  await page.reload();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await openAdvisor(page);
  await adv.getByLabel('Chat history').click();
  await expect(items).toHaveCount(2);
  await expect(items.first()).toHaveText(/How much did I\s+spend\?/);
  await adv.getByRole('button', { name: 'Clear history' }).click();
  await expect(items).toHaveCount(0);
  await expect(adv.getByTestId('adv-history')).toContainText('No questions yet.');
});

test('thumbs up / down on insight cards are remembered in this browser', async ({ page }) => {
  await login(page, '/', 'viewer');
  const adv = await openAdvisor(page);
  const ctr = card(adv, 'Lowest clickthrough rate');
  const up = ctr.getByRole('button', { name: 'Helpful', exact: true });
  const down = ctr.getByRole('button', { name: 'Not helpful', exact: true });
  await expect(up).toHaveAttribute('aria-pressed', 'false');
  await up.click();
  await expect(up).toHaveAttribute('aria-pressed', 'true');
  await down.click();
  await expect(up).toHaveAttribute('aria-pressed', 'false');
  await expect(down).toHaveAttribute('aria-pressed', 'true');
  // The other cards keep their own (empty) votes.
  await expect(adv.getByRole('button', { pressed: true, name: /helpful/i })).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await openAdvisor(page);
  await expect(down).toHaveAttribute('aria-pressed', 'true');
  // A second click takes the vote back.
  await down.click();
  await expect(down).toHaveAttribute('aria-pressed', 'false');
  await expect(adv.getByRole('button', { pressed: true, name: /helpful/i })).toHaveCount(0);
});

test('admin: insights follow the ad statuses and the welcome uses the account name', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const live = (await last30Report(page)).rows.filter((r) => r.eligibility === 'Eligible');
  expect(live).toHaveLength(4);
  for (const r of live) {
    const res = await page.request.patch(`/api/ads/${r.id}`, { data: { field: 'eligibility', value: 'Not eligible' } });
    expect(res.ok()).toBeTruthy();
  }
  expect((await page.request.patch('/api/account', { data: { field: 'name', value: 'Green Fields Co' } })).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('ad-row')).toHaveCount(9);

  const adv = await openAdvisor(page);
  await expect(adv.locator('.adv-welcome')).toHaveText('Welcome, Green Fields Co');
  await expect(adv.getByTestId('adv-summary')).toContainText('None of your 7 campaigns are running');
  const first = adv.getByTestId('adv-insight').first();
  await expect(first).toContainText('None of your ads are running');
  await expect(first).toHaveClass(/tone-err/);
  await first.getByRole('button', { name: "Which ads aren't running?" }).click();
  await expect(lastAnswer(adv)).toContainText('None of your 9 ads are running');
  await expect(lastAnswer(adv).locator('li')).toHaveCount(9);
  // The panel only reads, even for the admin: no editors or uploads in it.
  await expect(adv.locator('.editable, input[type=file]')).toHaveCount(0);
});

test('Send feedback names the panel; Learn more opens Quick help at the right topic', async ({ page }) => {
  await login(page, '/', 'viewer');
  const adv = await openAdvisor(page);
  await recordEvents(page);
  await adv.getByLabel('More options').click();
  await page.locator('.menu-item', { hasText: 'Send feedback' }).click();
  // Dispatched rather than clicked: the feedback form / Quick help panel opened by the shell may cover the panel.
  // Both at once: opening Quick help closes Ask Advisor (they share the right side).
  const cardHelp = await card(adv, 'Clicks without conversions').locator('[data-help]').elementHandle();
  const footHelp = await adv.locator('.adv-foot [data-help]').elementHandle();
  await page.evaluate(([a, b]) => { a.click(); b.click(); }, [cardHelp, footHelp]);
  const got = await events(page);
  expect(got).toContainEqual(['app:feedback', { about: 'Ask Advisor' }]);
  expect(got).toContainEqual(['app:help', { topic: 'conversion-tracking' }]);
  expect(got).toContainEqual(['app:help', { topic: 'advisor' }]);
});

test('"How can I optimize <campaign>?" (learning-phase card) answers with that campaign\'s own figures', async ({ page }) => {
  await login(page, '/', 'viewer');
  const adv = await openAdvisor(page);
  const rep = await last30Report(page);
  const camp = rep.campaigns.find((c) => c.name === 'Leads-Display-1');
  const rows = rep.rows.filter((r) => r.campaignId === camp.id);
  const sum = (m) => rows.reduce((s, r) => s + (r[m] ?? 0), 0);

  // Sent the way the card's "Optimize campaign" button sends it. "Leads" in the name used to
  // pull up the account-wide conversions answer instead.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('app:ask', { detail: { question: 'How can I optimize Leads-Display-1?' } })));
  await expect(lastQuestion(adv)).toHaveText('How can I optimize Leads-Display-1?');
  const a = lastAnswer(adv);
  await expect(a).toContainText("Here's what the last 30 days show for Leads-Display-1 (Display)");
  await expect(a).not.toContainText('brought in the most');
  await expect(fig(a, 'Status')).toContainText('Eligible (Limited): Conversion tracking setup is incomplete');
  await expect(fig(a, 'Ads')).toContainText(`${rows.filter((r) => r.eligibility === 'Eligible').length} of ${rows.length} ads eligible to show`);
  await expect(fig(a, 'Clicks')).toContainText(`${formatValue('clicks', sum('clicks'))} from ${formatValue('impressions', sum('impressions'))} impressions`);
  const t = rep.totals.account;
  await expect(fig(a, 'CTR')).toContainText(`${formatValue('ctr', sum('clicks') / sum('impressions'))} · account ${formatValue('ctr', t.clicks / t.impressions)}`);
  await expect(fig(a, 'Cost')).toContainText(formatValue('cost', sum('cost')));
  await expect(fig(a, 'Daily budget')).toContainText(formatValue('cost', camp.budget));
  await expect(fig(a, 'Optimization score')).toContainText(`${camp.optimizationScore.toFixed(1)}%`);

  // Suggestions that follow from those figures, with the Quick help topic they point to.
  const tips = a.getByTestId('adv-tips');
  await expect(tips.locator('h4')).toHaveText('Suggestions');
  await expect(tips).toContainText(`It got ${formatValue('clicks', sum('clicks'))} clicks for ${formatValue('cost', sum('cost'))}`);
  await expect(tips).toContainText('recorded no conversions');
  await expect(tips.locator('[data-help="conversion-tracking"]')).toHaveText('Learn more about conversion tracking');

  // Its weakest ad is offered next, and that question reviews just that ad.
  const next = a.locator('.adv-follow-link').first();
  await expect(next).toHaveText(/^Analyze my ad .+ in Leads-Display-1$/);
  const name = (await next.textContent()).replace(/^Analyze my ad /, '').replace(/ in Leads-Display-1$/, '');
  const ad = rows.find((r) => r.name === name);
  await next.click();
  const b = lastAnswer(adv);
  await expect(b).toContainText(`Here's how ${name} (Leads-Display-1 › ${ad.adGroup})`);
  await expect(fig(b, 'CTR')).toContainText(formatValue('ctr', ad.clicks / ad.impressions));
  await expect(fig(b, 'Ad strength')).toContainText(ad.strength || '–');
  await expect(b.getByRole('button', { name: 'How can I optimize Leads-Display-1?', exact: true })).toBeVisible();
});

test('Analyze ad on the asset details page reviews the ad that is open, from its own figures', async ({ page }) => {
  await login(page, '/', 'viewer');
  const rep = await last30Report(page);
  const r = page.getByTestId('ad-row').filter({ has: page.locator('td.c-camp', { hasText: 'Leads-Display-1' }) }).first();
  const id = await r.getAttribute('data-id');
  const ad = rep.rows.find((x) => x.id === id);
  await r.getByText(/View assets? details/).click();
  await expect(page).toHaveURL(new RegExp(`/aw/ads/assets/${id}/${BRAND.slug}$`));
  await page.getByTestId('asset-advisor').getByTestId('advisor-analyze').click();

  const adv = page.getByTestId('advisor');
  await expect(lastQuestion(adv)).toHaveText(new RegExp(`^Analyze my ad ${escapeRe(ad.name)}\\b`));
  const a = lastAnswer(adv);
  // Several ads share its name; the one open on the page is the one reviewed.
  await expect(a).toContainText(`Here's how ${ad.name} (Leads-Display-1 › ${ad.adGroup}) did in the last 30 days`);
  const t = rep.totals.account;
  await expect(fig(a, 'Status')).toContainText(ad.eligibility);
  await expect(fig(a, 'Clicks')).toContainText(`${formatValue('clicks', ad.clicks)} from ${formatValue('impressions', ad.impressions)} impressions`);
  await expect(fig(a, 'CTR')).toContainText(`${formatValue('ctr', ad.clicks / ad.impressions)} · account ${formatValue('ctr', t.clicks / t.impressions)}`);
  await expect(fig(a, 'Cost per click')).toContainText(`${formatValue('avgCpc', ad.cost / ad.clicks)} · account ${formatValue('avgCpc', t.cost / t.clicks)}`);
  await expect(fig(a, 'Conversions')).toContainText(formatValue('conversions', ad.conversions));
  await expect(fig(a, 'Ad strength')).toContainText(ad.strength || '–');
  // Headline and image counts come from the ad's own content.
  const { creative } = await (await page.request.get(`/api/ads/${id}/creative`)).json();
  await expect(fig(a, 'Content')).toContainText(`${creative.headlines.filter((h) => String(h).trim()).length} headline`);
  await expect(fig(a, 'Content')).toContainText(count(creative.images.length, 'image'));
  await expect(a.getByTestId('adv-tips')).toContainText('recorded no conversions');
});

test('an ad name several ads share asks which one; the follow-up reviews that ad', async ({ page }) => {
  await login(page, '/', 'viewer');
  const adv = await openAdvisor(page);
  const rep = await last30Report(page);
  const named = rep.rows.filter((r) => r.name === 'Ad #1');
  expect(named.length).toBeGreaterThan(1);

  await askTyped(adv, 'Analyze my ad Ad #1 and suggest improvements');
  const a = lastAnswer(adv);
  await expect(a).toContainText(`${named.length} ads are called “Ad #1”. Which one should I look at?`);
  await expect(a.locator('.adv-rows li')).toHaveCount(named.length);
  await expect(a.locator('.adv-follow-link')).toHaveCount(named.length);

  await a.getByRole('button', { name: 'Analyze my ad Ad #1 in Website traffic-Search-JAN2026', exact: true }).click();
  const ad = named.find((r) => r.campaign === 'Website traffic-Search-JAN2026');
  const b = lastAnswer(adv);
  await expect(b).toContainText(`Here's how Ad #1 (Website traffic-Search-JAN2026 › ${ad.adGroup})`);
  await expect(fig(b, 'Content')).toContainText(`${ad.headlines.length} headlines listed`);
  await expect(fig(b, 'Ad strength')).toContainText(ad.strength);
  await expect(fig(b, 'Conversions')).toContainText(formatValue('conversions', ad.conversions));
  await expect(b.getByRole('button', { name: 'Show my best headlines', exact: true })).toBeVisible();

  // An ad that doesn't exist is said not to, rather than answered from something else.
  await askTyped(adv, 'Analyze my ad Nothing Like This and suggest improvements');
  await expect(lastAnswer(adv)).toContainText('I couldn\'t find an ad called “Nothing Like This”');
});

test('admin: answers and the welcome follow edits made while the panel is open', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const adv = await openAdvisor(page);
  await expect(adv.getByTestId('adv-summary')).toContainText('2 of your 7 campaigns are running');
  const leads = (await last30Report(page)).campaigns.find((c) => c.name === 'Leads-Display-1');
  expect((await page.request.patch(`/api/campaigns/${leads.id}`, { data: { field: 'status', value: 'paused' } })).ok()).toBeTruthy();

  // No reload or Refresh: the answer is worked out from the data as it is now, and the
  // welcome above it follows.
  await askTyped(adv, 'Which campaigns are paused?');
  await expect(lastAnswer(adv)).toContainText("6 of your 7 campaigns aren't running; 1 is");
  await expect(lastAnswer(adv).locator('li', { hasText: 'Leads-Display-1' })).toContainText('Paused');
  await expect(adv.getByTestId('adv-summary')).toContainText('1 of your 7 campaigns is running');

  // An edit announced with app:data-changed (as the tables send after a save) is read straight away.
  expect((await page.request.patch(`/api/campaigns/${leads.id}`, { data: { field: 'status', value: 'enabled' } })).ok()).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event('app:data-changed')));
  await expect(adv.getByTestId('adv-summary')).toContainText('2 of your 7 campaigns are running');
});

test('admin: with every campaign deleted, the paused question says there are none', async ({ page }) => {
  await login(page, '/admin', 'admin');
  const ids = (await last30Report(page)).campaigns.map((c) => c.id);
  expect((await page.request.delete('/api/campaigns', { data: { ids } })).ok()).toBeTruthy();

  const adv = await openAdvisor(page);
  await expect(adv.getByTestId('adv-summary')).toHaveText('This account has no campaigns yet.');
  await expect(adv.getByTestId('adv-insight')).toHaveCount(0);
  await adv.locator('.adv-suggest').getByRole('button', { name: 'Which campaigns are paused?' }).click();
  await expect(lastAnswer(adv).locator('p').first()).toHaveText('This account has no campaigns yet.');
});
