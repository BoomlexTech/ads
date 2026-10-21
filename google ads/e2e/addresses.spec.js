import { test, expect } from '@playwright/test';
import { CREDS } from '../playwright.config.js';
import { BRAND } from '../shared/brand.js';

// Page addresses: no '?' anywhere, the campaign / ad group / ad ids are path parts and every
// address ends in /<brand slug>. Walking the pages gives those addresses, loading each one
// directly reopens the same page, and older ?campaignId= / ?adId= links are rewritten on load.

const S = BRAND.slug;

async function login(page, path, who) {
  await page.goto(path);
  await page.fill('input[name=username]', CREDS[who].username);
  await page.fill('input[name=password]', CREDS[who].password);
  await page.click('button:has-text("Sign in")');
  await expect(page.getByTestId('ad-row')).toHaveCount(9);
}

const nav = (page, label) => page.locator('.nav-group .nav-item:not(.group-head)', { hasText: new RegExp(`^${label}$`) });
const sideItem = (page, label) => page.locator('.navpanel .nav-item', { hasText: new RegExp(`^${label}$`) });
const settled = (page) => expect(page.locator('.progress')).toHaveCount(0);
const assetsPage = (page) => page.getByTestId('asset-details');

// The address shown is exactly `path`: nothing after it, and no '?' anywhere.
async function expectAddress(page, path) {
  await expect.poll(() => {
    const u = new URL(page.url());
    return u.pathname + u.search + u.hash;
  }).toBe(path);
  expect(page.url()).not.toContain('?');
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/test/reset');
});

test('every page address has no "?" and ends in the brand slug; each reloads to its page; old ?id links are rewritten', async ({ page }) => {
  await login(page, '/admin', 'admin');
  await expectAddress(page, `/admin/aw/ads/${S}`);

  // Each page and what shows it, checked on the walk and again when its address is loaded.
  const pages = {
    campaigns: async () => {
      await expect(page.locator('h1')).toHaveText('Campaigns');
      await expect(page.getByTestId('campaign-row')).toHaveCount(7);
    },
    adGroups: async () => {
      await expect(page.locator('h1')).toHaveText('Ad groups');
      await expect(page.getByTestId('scope-chip')).toContainText('Leads-Display-1');
      await expect(page.getByTestId('campaign-bar')).toBeVisible();
      await expect(page.getByTestId('adgroup-row')).toHaveCount(1);
    },
    groupAds: async () => {
      await expect(page.locator('h1')).toHaveText('Ads');
      await expect(page.getByTestId('adgroup-bar')).toBeVisible();
      await expect(page.getByTestId('scope-chip')).toContainText('Ad group 1');
      await expect(page.getByTestId('ad-row')).toHaveCount(2);
    },
    campaignAds: async () => {
      await expect(page.locator('h1')).toHaveText('Ads');
      await expect(page.getByTestId('campaign-bar')).toBeVisible();
      await expect(page.getByTestId('adgroup-bar')).toHaveCount(0);
      await expect(page.getByTestId('ad-row')).toHaveCount(2);
    },
    assets: async () => {
      await expect(assetsPage(page).locator('h1')).toHaveText('Asset details');
      await expect(page.getByTestId('asset-row').first()).toBeVisible();
      await expect(page.getByTestId('ad-edit')).toHaveCount(0);
    },
    edit: async () => {
      await expect(page.getByTestId('ad-edit')).toBeVisible();
      await expect(page.getByTestId('ad-edit').getByRole('textbox', { name: 'Final URL', exact: true })).toBeVisible();
    },
    billing: async () => {
      await expect(page.locator('h1')).toHaveText('Billing summary');
      await expect(page.locator('.navpanel .nav-item.active')).toHaveText('Summary');
    },
    history: async () => {
      await expect(page.locator('h1')).toHaveText('Change history');
      await expect(page.getByTestId('history-table')).toBeVisible();
    },
  };

  // Campaigns.
  await nav(page, 'Campaigns').click();
  await pages.campaigns();
  await expectAddress(page, `/admin/aw/campaigns/${S}`);
  await settled(page);

  // A campaign -> its ad groups: /aw/adgroups/<campaignId>/<slug>.
  const campaign = page.getByTestId('campaign-row').filter({ has: page.getByTestId('campaign-link').filter({ hasText: 'Leads-Display-1' }) });
  const campaignId = await campaign.getAttribute('data-id');
  expect(campaignId).toMatch(/^[0-9a-f]{24}$/);
  await campaign.getByTestId('campaign-link').click();
  await pages.adGroups();
  await expectAddress(page, `/admin/aw/adgroups/${campaignId}/${S}`);
  await settled(page);

  // An ad group -> its ads: /aw/ads/<campaignId>/<adGroupId>/<slug>.
  const group = page.getByTestId('adgroup-row').first();
  const adGroupId = await group.getAttribute('data-id');
  expect(adGroupId).toMatch(/^[0-9a-f]{24}$/);
  await group.getByTestId('adgroup-link').click();
  await pages.groupAds();
  const groupAdsUrl = `/admin/aw/ads/${campaignId}/${adGroupId}/${S}`;
  await expectAddress(page, groupAdsUrl);
  await settled(page);

  // An ad's asset details: /aw/ads/assets/<adId>/<slug>; Back returns to the ad group's ads.
  const ad = page.getByTestId('ad-row').first();
  const adId = await ad.getAttribute('data-id');
  expect(adId).toMatch(/^[0-9a-f]{24}$/);
  await ad.getByText(/View assets? details/).click();
  await pages.assets();
  await expectAddress(page, `/admin/aw/ads/assets/${adId}/${S}`);
  await page.goBack();
  await expect(assetsPage(page)).toHaveCount(0);
  await pages.groupAds();
  await expectAddress(page, groupAdsUrl);

  // The ad's edit page: /aw/ads/edit/display/<adId>/<slug>; closing it returns to the ad group's ads.
  await ad.hover();
  await ad.getByTestId('edit-ad').click();
  await pages.edit();
  await expectAddress(page, `/admin/aw/ads/edit/display/${adId}/${S}`);
  await page.getByTestId('close-edit').click();
  await expect(page.getByTestId('ad-edit')).toHaveCount(0);
  await pages.groupAds();
  await expectAddress(page, groupAdsUrl);

  // Rail > Billing > Summary.
  await page.locator('.rail-item', { hasText: 'Billing' }).click();
  await sideItem(page, 'Summary').click();
  await pages.billing();
  await expectAddress(page, `/admin/aw/billing/summary/${S}`);

  // Rail > Campaigns > Change history.
  await page.locator('.rail-item', { hasText: 'Campaigns' }).click();
  await sideItem(page, 'Change history').click();
  await pages.history();
  await expectAddress(page, `/admin/aw/changehistory/${S}`);

  // Each address loaded directly shows the same page and keeps its address.
  const direct = [
    [`/admin/aw/campaigns/${S}`, pages.campaigns],
    [`/admin/aw/adgroups/${campaignId}/${S}`, pages.adGroups],
    [`/admin/aw/ads/${campaignId}/${S}`, pages.campaignAds],
    [groupAdsUrl, pages.groupAds],
    [`/admin/aw/ads/assets/${adId}/${S}`, pages.assets],
    [`/admin/aw/ads/edit/display/${adId}/${S}`, pages.edit],
    [`/admin/aw/billing/summary/${S}`, pages.billing],
    [`/admin/aw/changehistory/${S}`, pages.history],
  ];
  for (const [url, shows] of direct) {
    await page.goto(url);
    await shows();
    await expectAddress(page, url);
    // A reload keeps it too.
    await page.reload();
    await shows();
    await expectAddress(page, url);
  }

  // Older addresses still open, rewritten to the current form.
  const old = [
    [`/admin/aw/adgroups?campaignId=${campaignId}`, `/admin/aw/adgroups/${campaignId}/${S}`, pages.adGroups],
    [`/admin/aw/ads/edit/display?adId=${adId}`, `/admin/aw/ads/edit/display/${adId}/${S}`, pages.edit],
    [`/admin/aw/ads/assets?adId=${adId}`, `/admin/aw/ads/assets/${adId}/${S}`, pages.assets],
    [`/admin/aw/ads?campaignId=${campaignId}&adGroupId=${adGroupId}`, groupAdsUrl, pages.groupAds],
    [`/admin/aw/campaigns?/${S}`, `/admin/aw/campaigns/${S}`, pages.campaigns],
    ['/admin/aw/billing/summary', `/admin/aw/billing/summary/${S}`, pages.billing],
  ];
  for (const [from, to, shows] of old) {
    await page.goto(from);
    await shows();
    await expectAddress(page, to);
  }
});
