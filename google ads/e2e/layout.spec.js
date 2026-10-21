import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';
import { BRAND, DEFAULT_ACCOUNT } from '../shared/brand.js';

// Layout checks for the pinned title bar / toolbar / column header strip and the
// pinned horizontal scrollbar of the ads table. Short viewport so #main scrolls.
test.use({ viewport: { width: 1536, height: 760 } });

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.locator('h1', { hasText: 'Ads' })).toBeVisible();
}

const row = (page, i) => page.getByTestId('ad-row').nth(i);
const cell = (page, i, metric) => row(page, i).locator(`td[data-metric=${metric}]`);

// Wait until the table has rendered and loading has finished, so geometry is stable.
async function ready(page) {
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
  await expect(page.locator('.progress')).toHaveCount(0);
}

const rect = (r) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height });

async function mainViewport(page) {
  return page.evaluate(() => {
    const m = document.getElementById('main');
    const r = m.getBoundingClientRect();
    const top = r.top + m.clientTop;
    return { top, bottom: top + m.clientHeight, scrollTop: m.scrollTop, scrollHeight: m.scrollHeight, clientHeight: m.clientHeight };
  });
}

// Scroll #main so the top of .grid-wrap sits `offset` px above (positive) or
// below (negative) the top of the #main viewport.
async function scrollMainPastTable(page, offset) {
  return page.evaluate((off) => {
    const m = document.getElementById('main');
    const wrap = document.querySelector('.grid-wrap');
    const wrapTopInContent = wrap.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop;
    m.scrollTop = wrapTopInContent + off;
    return m.scrollTop;
  }, offset);
}

async function scrollLefts(page) {
  return page.evaluate(() => ({
    head: document.querySelector('.grid-head').scrollLeft,
    body: document.querySelector('.grid-body').scrollLeft,
    bar: document.querySelector('.grid-hscroll').scrollLeft,
  }));
}

// Left/right x of each header th and of each td in the first body row.
async function columnEdges(page) {
  return page.evaluate(() => {
    const ths = [...document.querySelectorAll('.grid-head thead th')];
    const tds = [...document.querySelectorAll('.grid-body tr[data-testid=ad-row]:first-child td')];
    return {
      th: ths.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, cls: e.className.trim() }; }),
      td: tds.map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right }; }),
    };
  });
}

function expectAligned(edges, label) {
  expect(edges.th.length, `${label}: header and body column counts`).toBe(edges.td.length);
  expect(edges.th.length).toBeGreaterThan(6);
  edges.th.forEach((h, i) => {
    expect(Math.abs(h.l - edges.td[i].l), `${label}: left edge of column ${i} (${h.cls})`).toBeLessThanOrEqual(1);
    expect(Math.abs(h.r - edges.td[i].r), `${label}: right edge of column ${i} (${h.cls})`).toBeLessThanOrEqual(1);
  });
}

async function setScrollLeft(page, selector, x) {
  await page.locator(selector).evaluate((el, v) => { el.scrollLeft = v; }, x);
}

async function expectInSync(page, x) {
  await expect.poll(() => scrollLefts(page)).toEqual({ head: x, body: x, bar: x });
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('1. header strip stays pinned under the toolbar, title bar at the top of #main', async ({ page }) => {
  await login(page, '/', 'viewer');
  await ready(page);

  const before = await scrollMainPastTable(page, 0);
  const scrolled = await scrollMainPastTable(page, 500);
  expect(scrolled, '#main actually scrolled down past the table top').toBeGreaterThan(before);

  await expect(page.locator('.grid-head')).toBeVisible();
  const g = await page.evaluate(() => {
    const m = document.getElementById('main');
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return {
      mainTop: m.getBoundingClientRect().top + m.clientTop,
      mainBottom: m.getBoundingClientRect().top + m.clientTop + m.clientHeight,
      title: r('.titlebar'),
      toolbar: r('.table-toolbar'),
      head: r('.grid-head'),
      body: r('.grid-body'),
      wrapTop: r('.grid-wrap').top,
    };
  });
  // We really are past the natural table top.
  expect(g.wrapTop).toBeLessThan(g.mainTop - 300);
  // Title bar pinned to the top of the scrolling area.
  expect(Math.abs(g.title.top - g.mainTop)).toBeLessThanOrEqual(1);
  // Toolbar pinned directly under the title bar.
  expect(Math.abs(g.toolbar.top - g.title.bottom)).toBeLessThanOrEqual(1);
  // Header strip pinned directly under the toolbar and inside the viewport.
  expect(Math.abs(g.head.top - g.toolbar.bottom)).toBeLessThanOrEqual(1);
  expect(g.head.height).toBeGreaterThan(40);
  expect(g.head.bottom).toBeLessThan(g.mainBottom);
  // Body rows scroll underneath the header.
  expect(g.body.top).toBeLessThan(g.head.top);

  // The pinned header is on top (not covered by the body rows scrolling under it).
  // Campaign is a non-sticky column that is inside the visible strip at scrollLeft 0.
  const hit = await page.evaluate(() => {
    const th = document.querySelector('.grid-head th.c-camp');
    const r = th.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && !!el.closest('.grid-head');
  });
  expect(hit, 'center of the pinned Campaign header hits the header strip').toBe(true);
});

test('2. header and body columns stay aligned and scroll together', async ({ page }) => {
  await login(page, '/', 'viewer');
  await ready(page);
  await scrollMainPastTable(page, -150);

  const hs = page.getByTestId('grid-hscroll');
  await expect(hs).not.toHaveClass(/\bnone\b/);
  expect(await page.locator('.grid-body').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(400);

  expectAligned(await columnEdges(page), 'initial');
  await expectInSync(page, 0);

  await setScrollLeft(page, '.grid-body', 400);
  await expectInSync(page, 400);
  expectAligned(await columnEdges(page), 'after body scrollLeft=400');

  await setScrollLeft(page, '.grid-hscroll', 150);
  await expectInSync(page, 150);
  expectAligned(await columnEdges(page), 'after hscroll scrollLeft=150');

  // Wheel over the header strip scrolls the table horizontally as well.
  const head = await page.locator('.grid-head th.c-strength').boundingBox();
  await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2);
  await page.mouse.wheel(200, 0);
  await expect.poll(async () => (await scrollLefts(page)).body).toBeGreaterThan(150);
  const s = await scrollLefts(page);
  await expectInSync(page, s.body);
  expectAligned(await columnEdges(page), 'after wheel over header');
});

test('3. horizontal scrollbar is pinned to the bottom of #main while the table is in view', async ({ page }) => {
  await login(page, '/', 'viewer');
  await ready(page);
  const hs = page.getByTestId('grid-hscroll');
  await expect(hs).not.toHaveClass(/\bnone\b/);
  // The bar is a real scroller as wide as the table. (Its scrollbar thickness is 0 in
  // headless runs because Playwright launches Chromium with --hide-scrollbars, so we
  // check it is scrollable and pinned rather than its pixel height.)
  expect(await hs.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(400);

  // Offsets keep the table body running past the bottom of the viewport (search-ad rows are
  // content-height, so the table is shorter than a fixed 140px-per-row table).
  for (const offset of [-200, 300, 600]) {
    await scrollMainPastTable(page, offset);
    const g = await page.evaluate(() => {
      const m = document.getElementById('main');
      const top = m.getBoundingClientRect().top + m.clientTop;
      return {
        mainTop: top,
        mainBottom: top + m.clientHeight,
        bar: document.querySelector('.grid-hscroll').getBoundingClientRect().toJSON(),
        body: document.querySelector('.grid-body').getBoundingClientRect().toJSON(),
      };
    });
    // Table body is in view and continues below the viewport.
    expect(g.body.top, `offset ${offset}: body top above viewport bottom`).toBeLessThan(g.mainBottom);
    expect(g.body.bottom, `offset ${offset}: body continues below viewport`).toBeGreaterThan(g.mainBottom);
    expect(g.bar.height, `offset ${offset}: scrollbar is laid out`).toBeGreaterThan(0);
    expect(g.bar.top, `offset ${offset}: scrollbar is inside the viewport`).toBeGreaterThan(g.mainTop);
    expect(Math.abs(g.bar.bottom - g.mainBottom), `offset ${offset}: scrollbar bottom == #main bottom`).toBeLessThanOrEqual(1);
  }

  // Scrolled to the very end of the page, the bar sits at the end of the table, not over the footer.
  await page.evaluate(() => { const m = document.getElementById('main'); m.scrollTop = m.scrollHeight; });
  const end = await page.evaluate(() => ({
    bar: document.querySelector('.grid-hscroll').getBoundingClientRect().toJSON(),
    body: document.querySelector('.grid-body').getBoundingClientRect().toJSON(),
  }));
  expect(Math.abs(end.bar.top - end.body.bottom)).toBeLessThanOrEqual(1);
});

test('4. sticky left columns stay put during horizontal scroll', async ({ page }) => {
  await login(page, '/', 'viewer');
  await ready(page);
  await scrollMainPastTable(page, -150);

  const measure = () => page.evaluate(() => {
    const first = document.querySelector('.grid-body tr[data-testid=ad-row]');
    const x = (el) => el.getBoundingClientRect().left;
    return {
      check: x(first.querySelector('td.c-check')),
      dot: x(first.querySelector('td.c-dot')),
      ad: x(first.querySelector('td.c-ad')),
      adHead: x(document.querySelector('.grid-head th.c-ad')),
      camp: x(first.querySelector('td.c-camp')),
    };
  });
  const before = await measure();
  await setScrollLeft(page, '.grid-hscroll', 400);
  await expectInSync(page, 400);
  const after = await measure();

  expect(Math.abs(after.camp - (before.camp - 400)), 'non-sticky column moved').toBeLessThanOrEqual(1);
  expect(Math.abs(after.ad - before.ad), 'Ad cell left unchanged').toBeLessThanOrEqual(1);
  expect(Math.abs(after.adHead - before.adHead), 'Ad header left unchanged').toBeLessThanOrEqual(1);
  expect(Math.abs(after.check - before.check)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.dot - before.dot)).toBeLessThanOrEqual(1);

  // The sticky Ad cell paints above the columns scrolling underneath it.
  const onTop = await page.evaluate(() => {
    const td = document.querySelector('.grid-body tr[data-testid=ad-row] td.c-ad');
    const r = td.getBoundingClientRect();
    const el = document.elementFromPoint(r.right - 4, r.top + r.height / 2);
    return !!el && el.closest('td') === td;
  });
  expect(onTop, 'Ad cell is on top of scrolled columns').toBe(true);
});

test('5. no account alert banner; Notifications has no badge and no items', async ({ page }) => {
  await login(page, '/', 'viewer');
  await ready(page);
  await expect(page.getByTestId('account-alert')).toHaveCount(0);
  await expect(page.locator('.alert-banner')).toHaveCount(0);
  // No badge (mark) on the Notifications button; the panel just says there's nothing.
  const bell = page.locator('.topact', { hasText: 'Notifications' });
  await expect(page.locator('.notif-badge')).toHaveCount(0);
  await bell.click();
  const panel = page.getByTestId('notifications');
  await expect(panel.getByTestId('notif-empty')).toHaveText('You have no notifications.');
  await expect(panel.locator('.notif-item')).toHaveCount(0);
  await expect(panel).not.toContainText("aren't running");
});

test('6. document title on the viewer site', async ({ page }) => {
  await login(page, '/', 'viewer');
  await expect(page).toHaveTitle(`Ads-${DEFAULT_ACCOUNT.name}-${BRAND.name}`);
});

test('7a. sorting by clicking a header still works after a horizontal scroll', async ({ page }) => {
  await login(page, '/', 'viewer');
  await ready(page);
  await setScrollLeft(page, '.grid-hscroll', 400);
  await expectInSync(page, 400);

  // Empty cells show "–" (null) and the app always sorts them last, in both directions.
  const impr = async () => (await page.getByTestId('ad-row').locator('td[data-metric=impressions]').allInnerTexts())
    .map((t) => (/\d/.test(t) ? Number(t.replace(/[^\d.]/g, '')) : null));
  const expectSorted = (vals, dir) => {
    const nums = vals.filter((v) => v != null);
    const firstNull = vals.indexOf(null);
    if (firstNull >= 0) expect(vals.slice(firstNull).every((v) => v == null), 'empty values sort last').toBe(true);
    expect(nums).toEqual([...nums].sort((a, b) => (dir === 'desc' ? b - a : a - b)));
    expect(new Set(nums).size).toBeGreaterThan(1);
  };
  const th = page.locator('.grid-head th.c-impressions');

  await th.click();
  await expect(th.locator('.sort-ic')).toHaveText('arrow_downward');
  const desc = await impr();
  expectSorted(desc, 'desc');

  await th.click();
  await expect(th.locator('.sort-ic')).toHaveText('arrow_upward');
  const asc = await impr();
  expectSorted(asc, 'asc');
  expect(asc.filter((v) => v != null)).toEqual(desc.filter((v) => v != null).reverse());

  // Still aligned and in sync after re-sorting.
  const s = await scrollLefts(page);
  expect(s.head).toBe(s.body);
  expect(s.bar).toBe(s.body);
  expectAligned(await columnEdges(page), 'after sort');
});

test('7b. double-clicking a figure after a horizontal scroll opens no editor and keeps columns aligned', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await ready(page);
  await setScrollLeft(page, '.grid-hscroll', 700);
  await expectInSync(page, 700);

  const target = cell(page, 5, 'cost');
  const shown = await target.innerText();
  await target.dblclick();
  await expect(target.locator('input')).toHaveCount(0);
  await expect(target).toHaveText(shown);

  // Header strip, body and bar still agree, and the edited column lines up with its header.
  const s = await scrollLefts(page);
  expect(s.head).toBe(s.body);
  expect(s.bar).toBe(s.body);
  const [thBox, tdBox] = await Promise.all([
    page.locator('.grid-head th.c-cost').evaluate((e) => e.getBoundingClientRect().left),
    target.evaluate((e) => e.getBoundingClientRect().left),
  ]);
  expect(Math.abs(thBox - tdBox)).toBeLessThanOrEqual(1);
});

test.describe('other modes keep working', () => {
  test('Expand + overview collapse: header still pins under the toolbar', async ({ page }) => {
    await login(page, '/', 'viewer');
    await ready(page);
    await page.getByRole('button', { name: 'Hide chart' }).click();
    await expect(page.locator('.overview')).toHaveCount(0);
    await page.locator('.table-toolbar .toolbtn', { hasText: 'Expand' }).click();
    await expect(page.locator('.viewbar')).toHaveCount(0);
    await expect(page.locator('.filterbar')).toHaveCount(0);

    await scrollMainPastTable(page, 400);
    const g = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const m = document.getElementById('main');
      return { mainTop: m.getBoundingClientRect().top + m.clientTop, title: r('.titlebar'), toolbar: r('.table-toolbar'), head: r('.grid-head') };
    });
    expect(Math.abs(g.title.top - g.mainTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.head.top - g.toolbar.bottom)).toBeLessThanOrEqual(1);
    expectAligned(await columnEdges(page), 'expanded');
  });

  test('Columns panel hides the table; search filter keeps alignment', async ({ page }) => {
    await login(page, '/', 'viewer');
    await ready(page);
    await page.click('.toolbtn:has-text("Columns")');
    await expect(page.getByTestId('columns-panel')).toBeVisible();
    await expect(page.locator('.grid-head')).toHaveCount(0);
    await expect(page.getByTestId('grid-hscroll')).toHaveCount(0);
    await page.click('.colpanel-actions button:has-text("Cancel")');
    await expect(page.locator('.grid-head')).toBeVisible();

    await page.click('.toolbtn:has-text("Search")');
    await page.getByTestId('find-ads').fill('Leads-Display');
    await expect(page.getByTestId('ad-row')).toHaveCount(2);
    await setScrollLeft(page, '.grid-body', 300);
    await expectInSync(page, 300);
    expectAligned(await columnEdges(page), 'filtered');
  });

  test('History page keeps the plain scrolling table and its own title', async ({ page }) => {
    await login(page, '/admin', 'admin');
    await ready(page);
    await page.click('.nav-item:has-text("Change history")');
    await expect(page.getByTestId('history-table')).toBeVisible();
    await expect(page.locator('.table-scroll .grid.history')).toHaveCount(1);
    await expect(page.locator('.grid-head')).toHaveCount(0);
    await expect(page).toHaveTitle(`Change history - ${BRAND.name}`);
  });
});
