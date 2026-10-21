import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { AccountContext, ACCOUNT_DEFAULTS, initialOf } from '../account.js';
import { EditText } from './Editable.jsx';
import { Icon, Logo, Dropdown, MenuItem } from './Common.jsx';
import { BRAND } from '../../../shared/brand.js';
import { todayISO, addDays } from '../../../shared/dates.js';
import AdsPage from './AdsPage.jsx';
import Advisor, { AdvisorIcon } from './Advisor.jsx';
import TopSearch, { rememberCampaign } from './TopSearch.jsx';
import HistoryPage from './HistoryPage.jsx';
import QuickHelp from './QuickHelp.jsx';
import FeedbackHost, { FeedbackPage } from './Feedback.jsx';
import AdEditPage from './adedit/AdEditPage.jsx';
import AssetDetailsPage from './AssetDetailsPage.jsx';
import BillingPage, { BILLING_PAGES, isBillingPage } from './BillingPage.jsx';
import WhenWherePage from './ww/WhenWherePage.jsx';
import { WW_TABS, WW_PAGES, WW_TITLE } from '../../../shared/whenwhere.js';
import './shell-more.css';

// Page addresses (admin site: under /admin): Campaigns, Ad groups (of every campaign, or of
// ?campaignId=…), Ads (of every campaign, a campaign, or ?campaignId=…&adGroupId=…), Change
// history, Feedback, the Billing pages and the display ad edit page. Addresses have no '?': the
// campaign / ad group / ad ids are path parts and every address ends in /<brand slug>, e.g.
// /aw/ads/<campaignId>/<adGroupId>/adspiolots. (Older ?campaignId=… / ?adId=… links still open.)
const EDIT_PATH = '/aw/ads/edit/display';
const PATHS = {
  campaigns: '/aw/campaigns', adgroups: '/aw/adgroups', ads: '/aw/ads', history: '/aw/changehistory', feedback: '/aw/feedback',
  ...Object.fromEntries(Object.entries(BILLING_PAGES).map(([k, p]) => [k, p.path])),
  // Insights and reports > When and where ads showed: one address per tab.
  ...Object.fromEntries(WW_TABS.map((t) => [t.page, t.path])),
};
const isWwPage = (p) => WW_PAGES.includes(p);
// Pages only admins have; on the viewer site their addresses show the ads page.
const ADMIN_PAGES = ['history', 'feedback'];
const adminPage = (p) => ADMIN_PAGES.includes(p);
const prefix = (admin) => (admin ? '/admin' : '');
const isId = (v) => typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v);
// The page, with only the scope that page uses.
export function normRoute({ page = 'ads', campaignId = '', adGroupId = '' } = {}) {
  const p = PATHS[page] ? page : 'ads';
  const c = (p === 'adgroups' || p === 'ads') && isId(campaignId) ? campaignId : '';
  return { page: p, campaignId: c, adGroupId: p === 'ads' && c && isId(adGroupId) ? adGroupId : '' };
}
export function pageUrl(admin, route) {
  const r = normRoute(route);
  const q = new URLSearchParams();
  if (r.campaignId) q.set('campaignId', r.campaignId);
  if (r.adGroupId) q.set('adGroupId', r.adGroupId);
  const ids = [r.campaignId, r.adGroupId].filter(Boolean).map((id) => `/${id}`).join('');
  return `${prefix(admin)}${PATHS[r.page]}${ids}/${BRAND.slug}`;
}
// The path after the site prefix, without the /<brand slug> ending.
const sitePath = (admin) => location.pathname.slice(prefix(admin).length).replace(new RegExp(`/${BRAND.slug}$`), '');
// The page shown at the current address, or null when the address isn't a page.
export function routeFromUrl(admin) {
  // Trailing id parts (campaign, then ad group) come off before the page path is matched.
  const parts = sitePath(admin).split('/');
  const ids = [];
  while (ids.length < 2 && isId(parts[parts.length - 1])) ids.unshift(parts.pop());
  const path = parts.join('/');
  const page = Object.keys(PATHS).find((k) => PATHS[k] === path);
  if (!page) return null;
  const q = new URLSearchParams(location.search);
  return normRoute({ page, campaignId: ids[0] || q.get('campaignId') || '', adGroupId: ids[1] || q.get('adGroupId') || '' });
}
const routeKey = (r) => `${r.page}|${r.campaignId}|${r.adGroupId}`;
export const adsUrl = (admin) => pageUrl(admin, { page: 'ads' });
export const editUrl = (admin, id) => `${prefix(admin)}${EDIT_PATH}/${encodeURIComponent(id)}/${BRAND.slug}`;
// The ad id in an /<base>/<id>/<slug> address (or an older <base>?adId=<id> one), else null.
function idAfter(admin, base) {
  const path = sitePath(admin);
  if (path === base) return new URLSearchParams(location.search).get('adId') || null;
  if (!path.startsWith(`${base}/`)) return null;
  const rest = path.slice(base.length + 1);
  if (!rest || rest.includes('/')) return null;
  try { return decodeURIComponent(rest); } catch { return null; }
}
export const editIdFromUrl = (admin) => idAfter(admin, EDIT_PATH);
// Asset details page of one ad (opened from "View asset details" in the ads table).
const ASSETS_PATH = '/aw/ads/assets';
export const assetsUrl = (admin, id) => `${prefix(admin)}${ASSETS_PATH}/${encodeURIComponent(id)}/${BRAND.slug}`;
export const assetsIdFromUrl = (admin) => idAfter(admin, ASSETS_PATH);
const DISCARD = 'Discard unsaved changes?';
const NAV_PAGE = { Campaigns: 'campaigns', 'Ad groups': 'adgroups', Ads: 'ads' };
const NAV_GROUP_PAGES = Object.values(NAV_PAGE);

// Left rail sections.
const RAIL = [
  { key: 'campaigns', icon: 'campaign', label: 'Campaigns' },
  { key: 'goals', icon: 'trophy', label: 'Goals' },
  { key: 'tools', icon: 'construction', label: 'Tools' },
  { key: 'billing', icon: 'credit_card', label: 'Billing' },
  { key: 'admin', icon: 'settings', label: 'Admin' },
];
// The rail section a page belongs to (the side navigation follows the page shown).
const sectionOf = (page) => (isBillingPage(page) ? 'billing' : 'campaigns');

// Side navigation of each rail section. Items with a page open it; the rest are listed
// but shown as not available yet.
const NAV = {
  campaigns: [
    { label: 'Overview' },
    { label: 'Recommendations', dot: true },
    { group: 'Insights and reports', children: [
      'Insights', { label: 'Dashboards', beta: true }, 'Brand report', 'Auction insights', 'Search terms',
      { label: WW_TITLE, page: WW_TABS[0].page, pages: WW_PAGES, wrap: true }, 'Channel performance', 'Landing pages', 'Stores',
      'Report editor', 'Dashboards (legacy)',
    ] },
    { group: 'Campaigns', children: ['Campaigns', 'Ad groups', 'Ads', 'Experiments', 'Campaign groups'] },
    { label: 'Assets', chevron: true },
    { label: 'Audiences, keywords and content', chevron: true },
    { label: 'Change history', page: 'history', adminOnly: true },
    { label: 'Feedback', page: 'feedback', adminOnly: true },
  ],
  goals: [{ label: 'Summary' }, { label: 'Conversions', chevron: true }, { label: 'Measurement', chevron: true }],
  tools: [
    { label: 'Asset studio' }, { label: 'Planning', chevron: true }, { label: 'App advertising hub' },
    { label: 'Shared library', chevron: true }, { label: 'Creator partnerships', beta: true },
    { label: 'Content suitability' }, { label: 'Data manager' }, { label: 'Troubleshooting', chevron: true },
    { label: 'Bulk actions', chevron: true }, { label: 'Budgets and bidding', chevron: true }, { label: 'Business data' },
  ],
  // Every Billing item has a page (see BillingPage.jsx).
  billing: Object.entries(BILLING_PAGES).map(([page, p]) => ({ label: p.label, page })),
  admin: [
    { label: 'Policy', chevron: true }, { label: 'Account settings' }, { label: 'Preferences' },
    { label: 'Notifications' }, { label: 'Access and security' },
  ],
};
// Rail > Create (everyone; not viewers on the When and where ads showed pages): Campaign and Ad group open their page and that page's own create (+)
// menu; the items without a page yet just close the menu.
const CREATE = [
  { kind: 'campaign', label: 'Campaign', page: 'campaigns' },
  { kind: 'adgroup', label: 'Ad group', page: 'adgroups' },
  { kind: 'keywords', label: 'Search keywords' },
  { kind: 'conversion', label: 'Conversion action' },
  { kind: 'asset', label: 'Asset' },
];

// Two overlapping outlined panels (short left, tall right) with the overlap filled.
function AppearanceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="9" width="12.5" height="12" /><rect x="9" y="3" width="12" height="18" /></g>
      <rect x="9" y="9" width="6.5" height="12" fill="currentColor" />
    </svg>
  );
}

// Top bar > Appearance > Spacing: how roomy the tables, the side navigation and the cards are
// (data-density on the app root; the rules are in shell-more.css). Large is the standard look,
// each step down tightens rows and paddings. Remembered in this browser.
const DENSITIES = [
  { key: 'large', label: 'Large', lines: 2 },
  { key: 'medium', label: 'Medium', lines: 3 },
  { key: 'small', label: 'Small', lines: 4 },
  { key: 'xsmall', label: 'Extra small', lines: 5 },
];
const DENSITY_KEY = 'ap.density';
const DEFAULT_DENSITY = 'large';
function loadDensity() {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    return DENSITIES.some((d) => d.key === v) ? v : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}
// Evenly spaced lines across the same height: the more lines, the closer together.
function SpacingIcon({ lines }) {
  const step = 14 / (lines - 1);
  return (
    <svg className="sp-ic" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <line key={i} x1="3" x2="21" y1={5 + i * step} y2={5 + i * step} stroke="currentColor" strokeWidth="1.5" />
      ))}
    </svg>
  );
}
function AppearanceMenu({ density, onDensity }) {
  return (
    <Dropdown panelClass="appearance-pop" trigger={(open, toggle) => (
      <button type="button" className={`topact ${open ? 'open' : ''}`} data-tip="Appearance" aria-haspopup="menu" aria-expanded={open}
        data-testid="appearance-button" onClick={toggle}>
        <AppearanceIcon /><span>Appearance</span>
      </button>
    )}>
      {(close) => (
        <div className="menu spacing-menu" role="menu" aria-label="Spacing" data-testid="appearance-menu">
          <div className="menu-title" aria-hidden="true">Spacing</div>
          {DENSITIES.map((d) => (
            <button key={d.key} type="button" role="menuitemradio" aria-checked={density === d.key} data-value={d.key}
              className={`menu-item ${density === d.key ? 'selected' : ''}`} onClick={() => { onDensity(d.key); close(); }}>
              <span className="mi-label">{d.label}</span>
              <SpacingIcon lines={d.lines} />
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  );
}


function showAds() {
  document.querySelector('.tablecard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// The same, once the ads page has its rows (after a page change its data may still be on the way).
function showAdsSoon(frames = 180) {
  const page = document.querySelector('.page[data-level="ads"]');
  if (!page) return;
  if (frames <= 0 || page.querySelector('[data-testid="ad-row"]')) showAds();
  else requestAnimationFrame(() => showAdsSoon(frames - 1));
}
// Rail > Create: once the page of that level has its table, open its create (+) menu. The
// page can handle the window 'app:create' event itself (calling preventDefault); if it
// doesn't, its + button is pressed.
// createGen numbers each Create and each page change: a wait left over from an earlier one
// stops, so a menu never opens later on its own.
let createGen = 0;
const CREATE_FRAMES = 600;
function openCreateSoon(kind, level, gen, frames = CREATE_FRAMES) {
  if (gen !== createGen) return;
  const page = document.querySelector(`.page[data-level="${level}"]`);
  // The Columns panel takes the table's place. Create asks the page to close it
  // ('app:create-start'); if it's still open a few frames later, give up rather than open the
  // menu whenever the panel happens to close.
  if (page?.querySelector('[data-testid="columns-panel"]') && frames < CREATE_FRAMES - 30) return;
  const fab = page?.querySelector('.table-toolbar .fab');
  const ready = fab && !page.querySelector(':scope > .progress') && page.querySelector('.tablecard .grid, .tablecard .grid-empty');
  if (!ready) {
    if (frames > 0) requestAnimationFrame(() => openCreateSoon(kind, level, gen, frames - 1));
    return;
  }
  const handled = !window.dispatchEvent(new CustomEvent('app:create', { detail: { kind }, cancelable: true }));
  if (!handled) {
    fab.scrollIntoView({ block: 'nearest' });
    fab.click();
  }
}

// (The account alert and the conversion tracking tip are switched off for now, at the owner's
// request; their items can be put back in this list.)
function NotificationsPanel({ close }) {
  const items = [];
  return (
    <div className="notif-panel" role="dialog" aria-label="Notifications" data-testid="notifications">
      <div className="notif-head">Notifications</div>
      <div className="notif-list">
        {!items.length && <div className="notif-empty" data-testid="notif-empty">You have no notifications.</div>}
        {items.map((n) => (
          <div className="notif-item" key={n.key}>
            <Icon name={n.icon} className={n.tone} />
            <div>
              <h4>{n.title}</h4>
              <p>{n.text}</p>
              <div className="notif-actions">
                <button type="button" className="btn-primary" onClick={() => { n.onAction(); close(); }}>{n.action}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Avatar: profile photo when set, otherwise the first letter of the profile name.
function Avatar({ account, big = false, canEdit, onPhoto, onRemove }) {
  const pick = (e) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp';
    input.onchange = () => input.files[0] && onPhoto(input.files[0]);
    input.click();
  };
  return (
    <div className={`avatar ${big ? 'big' : ''} ${account.avatar ? 'has-photo' : ''}`}>
      {account.avatar ? <img src={account.avatar} alt="" /> : initialOf(account)}
      {big && canEdit && (
        <>
          <button type="button" className="avatar-edit" aria-label="Change profile photo" title="Change profile photo" onClick={pick}><Icon name="photo_camera" /></button>
          {account.avatar && <button type="button" className="avatar-remove" aria-label="Remove profile photo" title="Remove photo" onClick={(e) => { e.stopPropagation(); onRemove(); }}><Icon name="close" /></button>}
        </>
      )}
    </div>
  );
}

// side: the open right-hand panel ('advisor', 'help' or null); the search box gives way to a
// Search button while one is open.
function TopBar({ me, onLogout, alert, side, onSide, onHelp, onAsk, search, account, canEdit, onAccount, onPhoto, editing, editBusy, onCloseEdit, onView, navOpen, onMenu, density, onDensity }) {
  const refresh = () => window.dispatchEvent(new Event('app:refresh'));
  const advisorOpen = side === 'advisor';
  const helpOpen = side === 'help';
  return (
    <header className={`topbar ${editing ? 'editing' : ''}`}>
      {editing
        ? (
          <button type="button" className="iconbtn hamburger" aria-label="Close" title={editBusy ? 'Saving…' : 'Close'} data-testid="close-edit"
            disabled={editBusy} onClick={onCloseEdit}>
            <Icon name="close" />
          </button>
        )
        : (
          <button type="button" className="iconbtn hamburger" aria-label={navOpen ? 'Hide navigation' : 'Show navigation'} title={navOpen ? 'Hide navigation' : 'Show navigation'}
            aria-expanded={navOpen} data-testid="main-menu" onClick={onMenu}>
            <Icon name="menu" />
          </button>
        )}
      <div className="brand">
        <Logo />
        <span className="brand-name">{BRAND.name}</span>
        {/* <span className="demo-badge" title="All figures in this demo are sample data">Demo · sample data</span> */}
      </div>
      {!side && <TopSearch {...search} onAsk={onAsk} onAdvisor={() => onSide('advisor')} />}
      <nav className="top-actions">
        {side && (
          <button type="button" className="topact" data-tip="Search" onClick={() => onSide(null)}><Icon name="search" /><span>Search</span></button>
        )}
        {/* Spacing changes the tables, nav and cards, none of which the edit page shows. */}
        {!editing && <AppearanceMenu density={density} onDensity={onDensity} />}
        {!editing && <button type="button" className="topact" data-tip="Refresh" onClick={refresh}><Icon name="refresh" /><span>Refresh</span></button>}
        <button type="button" className={`topact ${helpOpen ? 'open' : ''}`} data-tip="Open the quick help panel" data-testid="help-button" aria-pressed={helpOpen}
          onClick={() => (helpOpen ? onSide(null) : onHelp())}>
          <Icon name="help" /><span>Help</span>
        </button>
        <Dropdown align="right" panelClass="notif-pop" trigger={(open, toggle) => (
          <button type="button" className={`topact ${open ? 'open' : ''}`} data-tip="Notifications" onClick={toggle} aria-expanded={open}>
            <Icon name="notifications" />
            <span>Notifications</span>
          </button>
        )}>
          {(close) => <NotificationsPanel alert={alert} close={close} onView={onView} onHelp={onHelp} />}
        </Dropdown>
        <button type="button" className={`topact ${advisorOpen ? 'open' : ''}`} data-tip="Ask Advisor" data-testid="ask-advisor" aria-pressed={advisorOpen} onClick={() => onSide(advisorOpen ? null : 'advisor')}>
          <span className="beta">BETA</span>
          <AdvisorIcon />
          <span>Ask Advisor</span>
        </button>
      </nav>
      <div className="account">
        <div className="acct-text">
          <div><EditText value={account.id} canEdit={canEdit} maxLength={12} label="account ID" onSave={(v) => onAccount('id', v)} /></div>
          <div className="acct-email" title={account.email}><EditText value={account.email} canEdit={canEdit} maxLength={100} label="account email" onSave={(v) => onAccount('email', v)} /></div>
        </div>
        <Dropdown align="right" trigger={(open, toggle) => (
          <button className="avatar" onClick={toggle} aria-label="Account"><Avatar account={account} /></button>
        )}>
          {() => (
            <div className="menu acct-menu">
              <div className="acct-menu-head">
                <Avatar account={account} big canEdit={canEdit} onPhoto={onPhoto} onRemove={() => onAccount('avatar', '')} />
                <div className="acct-name">
                  <EditText value={account.profileName || me.user} canEdit={canEdit} maxLength={60} label="profile name" onSave={(v) => onAccount('profileName', v)} />
                </div>
                <div className="acct-mail">
                  <EditText value={account.email} canEdit={canEdit} maxLength={100} label="profile email" onSave={(v) => onAccount('email', v)} />
                </div>
                <div className="acct-mail">{me.role === 'admin' ? 'Admin access' : 'Read-only access'}</div>
                <button type="button" className="acct-manage" onClick={onLogout}>Sign out</button>
              </div>
            </div>
          )}
        </Dropdown>
      </div>
    </header>
  );
}

// A side-nav item (one without a page yet looks the same and does nothing when clicked).
function NavItem({ item, active, onClick }) {
  return (
    <button type="button" className={`nav-item ${active ? 'active' : ''} ${item.wrap ? 'ww-nav-wrap' : ''}`} data-tip={item.label} onClick={onClick}>
      <span className="nav-label">{item.label}</span>
      {item.beta && <span className="nav-beta">BETA</span>}
      {item.dot && <span className="nav-dot" />}
      {item.chevron && <Icon name="keyboard_arrow_down" />}
    </button>
  );
}

// Account-level alert (shown in Notifications), driven by the ads data (how many ads can actually serve).
function alertFor(status) {
  if (!status || !status.total) return null;
  if (status.eligible === 0) {
    return { title: 'None of your ads are running', text: 'Your campaigns and ad groups are paused or removed. Enable them to begin showing your ads.' };
  }
  if (status.eligible < status.total) {
    const n = status.total - status.eligible;
    return { title: "Some of your ads aren't running", text: `${n} of ${status.total} ads aren't eligible to show because their campaigns are paused or have ended.` };
  }
  return null;
}
// The alert's numbers from a report of every ad: all ads, and those that can serve.
const adCounts = (rows = []) => ({ total: rows.length, eligible: rows.filter((r) => r.eligibility === 'Eligible').length });

export default function Shell({ me, canEdit, admin, onLogout }) {
  const [status, setStatus] = useState(null);
  // The pages report the campaign list (always) and the ad counts behind the alert (unscoped pages).
  const onStatus = useCallback((st) => setStatus((s) => ({ ...s, ...st })), []);
  const alert = alertFor(status);
  // The page and its scope come from the address, so Back / Forward / reload restore them.
  const [route, setRoute] = useState(() => {
    const r = routeFromUrl(admin) || normRoute();
    return adminPage(r.page) && !canEdit ? normRoute() : r;
  });
  const page = route.page;
  const [section, setSection] = useState(() => sectionOf(page));
  // Opening a page shows its rail section (picking another section leaves the page as it is).
  useEffect(() => { setSection(sectionOf(page)); }, [page]);
  const onBilling = isBillingPage(page);
  // Change history, Feedback and the Billing pages have no ads page to report the campaign list
  // (top search) and the alert's counts, so they're asked for here: when not known yet (the page
  // was opened from its address) and on Refresh. A reply that comes after leaving the page is dropped.
  const onAdminPage = (adminPage(page) && canEdit) || onBilling || isWwPage(page);
  const statusKnown = !!status?.campaigns;
  useEffect(() => {
    if (!onAdminPage) return undefined;
    let live = true;
    const load = () => {
      const to = todayISO();
      api.report({ from: addDays(to, -6), to })
        .then((r) => { if (live) onStatus({ campaigns: r.campaigns, adGroups: r.adGroups || [], ...adCounts(r.rows) }); })
        .catch(() => {});
    };
    if (!statusKnown) load();
    window.addEventListener('app:refresh', load);
    return () => {
      live = false;
      window.removeEventListener('app:refresh', load);
    };
  }, [onAdminPage]); // eslint-disable-line react-hooks/exhaustive-deps
  // Top bar > Appearance > Spacing.
  const [density, setDensityState] = useState(loadDensity);
  const setDensity = useCallback((d) => {
    setDensityState(d);
    try { localStorage.setItem(DENSITY_KEY, d); } catch { /* storage off */ }
    // Parts that measure the layout (scorecard strip, pinned toolbar, table scrollbar) look again.
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }, []);
  const showRoute = useCallback((r) => setRoute((cur) => (routeKey(cur) === routeKey(r) ? cur : r)), []);
  const [account, setAccount] = useState(ACCOUNT_DEFAULTS);
  // The app card waits for the stored details, so it doesn't flash its empty state.
  const [accountLoaded, setAccountLoaded] = useState(false);
  // Each message is a new object, so the same text twice in a row (two saves) still gets its full 4 s.
  const [toast, setToastState] = useState(null);
  const setToast = useCallback((text) => setToastState(text ? { text } : null), []);
  useEffect(() => {
    api.account().then((a) => { setAccount(a); setAccountLoaded(true); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToastState(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  // Saves one account detail; a refusal shows its message. True once saved.
  const onAccount = useCallback(async (field, value) => {
    try {
      const r = await api.editAccount(field, value);
      if (r.account) setAccount(r.account);
      return true;
    } catch (e) {
      setToast(e.message);
      return false;
    }
  }, [setToast]);
  const onPhoto = async (file) => {
    try {
      const r = await api.uploadAvatar(file);
      if (r.account) setAccount(r.account);
    } catch (e) {
      setToast(e.message);
    }
  };
  // The right-hand panel: 'advisor' (Ask Advisor), 'help' (Quick help) or null. They share
  // the space, so opening one closes the other.
  const [side, setSide] = useState(null);
  // A question for Advisor (from the top search or 'app:ask'), asked once its data has loaded.
  // Closing Advisor, or opening Quick help in its place, drops a question not asked yet, so it
  // isn't asked later on its own.
  const [question, setQuestion] = useState(null);
  // The ad a question is about, when its sender knows it (asset details: 'Analyze ad').
  const [questionAdId, setQuestionAdId] = useState(null);
  const setSidePanel = useCallback((s) => {
    if (s !== 'advisor') setQuestion(null);
    setSide(s);
  }, []);
  const ask = useCallback((q, adId = null) => { setQuestion(q); setQuestionAdId(adId); setSide('advisor'); }, []);
  // The article Quick help opens on ({ topic, at }); at tells a repeated request apart.
  const [helpReq, setHelpReq] = useState(null);
  const helpN = useRef(0);
  const openHelp = useCallback((topic) => {
    helpN.current += 1;
    setHelpReq({ topic: typeof topic === 'string' ? topic : null, at: helpN.current });
    setSidePanel('help');
  }, [setSidePanel]);
  // Other parts of the app open the panels with window events: 'app:help' ({ topic }) from
  // Learn more links, 'app:ask' ({ question }) to put a question to Advisor.
  useEffect(() => {
    const onHelp = (e) => openHelp(e.detail?.topic);
    const onAsk = (e) => {
      const q = typeof e.detail?.question === 'string' ? e.detail.question.trim().slice(0, 500) : '';
      if (q) ask(q, typeof e.detail?.adId === 'string' ? e.detail.adId : null);
      else setSide('advisor');
    };
    window.addEventListener('app:help', onHelp);
    window.addEventListener('app:ask', onAsk);
    return () => {
      window.removeEventListener('app:help', onHelp);
      window.removeEventListener('app:ask', onAsk);
    };
  }, [openHelp, ask]);
  // Side navigation groups that are open. Moving into another group's pages (Ads pages <-> When and
  // where ads showed) opens that group; moving between the pages of one group leaves the toggles
  // as the user set them.
  const groupOf = (p) => (isWwPage(p) ? 'Insights and reports' : NAV_GROUP_PAGES.includes(p) ? 'Campaigns' : null);
  const [groupOpen, setGroupOpen] = useState(() => ({ [groupOf(page) || 'Campaigns']: true }));
  const lastGroup = useRef(groupOf(page));
  useEffect(() => {
    const g = groupOf(page);
    if (!g || g === lastGroup.current) return;
    lastGroup.current = g;
    setGroupOpen({ [g]: true });
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  // Side navigation shown or hidden from the main menu button (remembered in this browser).
  const [navOpen, setNavOpen] = useState(() => {
    try { return localStorage.getItem('ap.nav') !== 'closed'; } catch { return true; }
  });
  const toggleNav = () => setNavOpen((o) => {
    try { localStorage.setItem('ap.nav', o ? 'closed' : 'open'); } catch { /* storage off */ }
    return !o;
  });
  const items = NAV[section].filter((i) => !i.adminOnly || canEdit);
  const showCreate = canEdit || !isWwPage(page);
  const navCard = (g) => !!groupOpen[g] || (g === 'Campaigns' && !isWwPage(page));

  // Display ad edit page: opened from the ads table (pushes its own address), closed with
  // Save / Cancel / the top-bar X / browser Back. The ads page stays mounted underneath.
  const [editAdId, setEditAdId] = useState(() => editIdFromUrl(admin));
  const editRef = useRef(editAdId);
  editRef.current = editAdId;
  const dirtyRef = useRef(false);
  const setDirty = useCallback((d) => { dirtyRef.current = d; }, []);
  // A save in flight: the X is disabled, and leaving another way doesn't offer to discard (the save still lands).
  const [editBusy, setEditBusy] = useState(false);
  const busyRef = useRef(false);
  const setBusy = useCallback((b) => { busyRef.current = b; setEditBusy(b); }, []);
  const mainTop = useRef(null);
  const afterLeave = useRef(null);
  const openEdit = useCallback((row) => {
    createGen += 1;
    mainTop.current = document.getElementById('main')?.scrollTop ?? null;
    dirtyRef.current = false;
    setBusy(false);
    history.pushState({ adEdit: true }, '', editUrl(admin, row.id));
    setEditAdId(row.id);
  }, [admin, setBusy]);
  const leaveEdit = useCallback((saved) => {
    dirtyRef.current = false;
    setBusy(false);
    setEditAdId(null);
    if (history.state?.adEdit) history.back();
    else {
      // Opened straight from its address: show the ads page.
      history.replaceState(null, '', adsUrl(admin));
      showRoute(normRoute());
    }
    if (saved) {
      window.dispatchEvent(new Event('app:refresh'));
      setToast('Your ad was saved');
    }
  }, [admin, setBusy, showRoute]);
  // True when there's nothing to lose (or the user agreed to discard it).
  const okToLeave = () => !editRef.current || !dirtyRef.current || busyRef.current || window.confirm(DISCARD);
  const closeEdit = () => { if (!busyRef.current && okToLeave()) leaveEdit(false); };
  // Runs fn on the ads page: straight away, or once the edit page has closed and the ads page shows again.
  const leaveEditThen = (fn) => {
    if (!okToLeave()) return;
    if (!editRef.current) { fn(); return; }
    afterLeave.current = fn;
    leaveEdit(false);
  };
  // Asset details page: opened from the ads table (pushes its own address), closed with its
  // "Ads" breadcrumb or browser Back. Shown in place of the ads page, which stays mounted.
  const [assets, setAssets] = useState(() => {
    const id = assetsIdFromUrl(admin);
    return id ? { id, row: null } : null;
  });
  const assetsTop = useRef(null);
  const openAssets = useCallback((row) => {
    createGen += 1;
    assetsTop.current = document.getElementById('main')?.scrollTop ?? null;
    history.pushState({ adAssets: true }, '', assetsUrl(admin, row.id));
    setAssets({ id: row.id, row });
  }, [admin]);
  const closeAssets = useCallback(() => {
    setAssets(null);
    if (history.state?.adAssets) history.back();
    else {
      history.replaceState(null, '', adsUrl(admin));
      showRoute(normRoute());
    }
  }, [admin, showRoute]);
  useLayoutEffect(() => {
    const main = document.getElementById('main');
    if (!main) return;
    if (assets) main.scrollTop = 0;
    else if (assetsTop.current != null) {
      main.scrollTop = assetsTop.current;
      assetsTop.current = null;
    }
  }, [!!assets]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opens a page (left nav, campaign / ad group links, pickers). From the edit page this
  // replaces the edit page's address, after the usual discard check. False when the user stayed.
  const navigate = (to, { replace = false } = {}) => {
    let r = normRoute(to);
    if (adminPage(r.page) && !canEdit) r = normRoute();
    if (!okToLeave()) return false;
    createGen += 1;
    const url = pageUrl(admin, r);
    if (editRef.current) {
      dirtyRef.current = false;
      mainTop.current = null;
      setBusy(false);
      setEditAdId(null);
      history.replaceState(null, '', url);
    } else if (replace) history.replaceState(null, '', url);
    else if (location.pathname + location.search !== url) history.pushState(null, '', url);
    setAssets(null);
    showRoute(r);
    return true;
  };
  // Notifications > View: the ads of every campaign, scrolled to their table. From another
  // page, the scroll waits until the ads page has rendered (the effect below).
  const adsScroll = useRef(false);
  const viewAds = () => {
    if (route.page === 'ads' && !route.campaignId && !assets) leaveEditThen(showAds);
    else if (navigate({ page: 'ads' })) adsScroll.current = true;
  };
  useEffect(() => {
    if (editAdId || !adsScroll.current) return;
    adsScroll.current = false;
    requestAnimationFrame(() => showAdsSoon());
  });
  // Left nav: Ad groups keeps the campaign, Ads keeps the campaign and ad group, Campaigns clears them.
  const openNav = (p) => navigate({ page: p, campaignId: route.campaignId, adGroupId: route.adGroupId });
  // Rail > Create: the page for that kind (in the current campaign / ad group where it has
  // one), then its create menu.
  // The page closes its Columns panel on 'app:create-start' (the table, and its + button, are
  // hidden while the panel is open).
  const create = (c) => {
    const ok = c.kind === 'campaign' ? navigate({ page: 'campaigns' }) : openNav(c.page);
    if (!ok) return;
    createGen += 1;
    const gen = createGen;
    window.dispatchEvent(new CustomEvent('app:create-start', { detail: { kind: c.kind } }));
    requestAnimationFrame(() => openCreateSoon(c.kind, c.page, gen));
  };
  // Campaigns opened in any way (links, pickers, search) are offered first in the top search.
  useEffect(() => { rememberCampaign(route.campaignId); }, [route.campaignId]);
  // The viewer site has no Change history or Feedback page: their addresses show the ads page.
  useEffect(() => {
    if (adminPage(routeFromUrl(admin)?.page) && !canEdit) history.replaceState(null, '', adsUrl(admin));
  }, [admin, canEdit]);
  useEffect(() => {
    const onPop = () => {
      createGen += 1;
      const aid = assetsIdFromUrl(admin);
      setAssets((cur) => (aid ? (cur?.id === aid ? cur : { id: aid, row: null }) : null));
      const id = editIdFromUrl(admin);
      if (id !== editRef.current) {
        if (editRef.current && dirtyRef.current && !busyRef.current && !window.confirm(DISCARD)) {
          history.pushState({ adEdit: true }, '', editUrl(admin, editRef.current));
          return;
        }
        if (id && !editRef.current) mainTop.current = document.getElementById('main')?.scrollTop ?? null;
        dirtyRef.current = false;
        setBusy(false);
        setEditAdId(id);
      }
      if (!id && !aid) {
        const r = routeFromUrl(admin) || normRoute();
        showRoute(adminPage(r.page) && !canEdit ? normRoute() : r);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [admin, canEdit, setBusy, showRoute]);
  // A new page starts at the top.
  const key = routeKey(route);
  useLayoutEffect(() => {
    const main = document.getElementById('main');
    if (main) main.scrollTop = 0;
  }, [key]);
  // The hidden ads page loses its scroll position; put it back when the edit page closes,
  // then run anything that was waiting for the ads page (e.g. Notifications > View).
  useLayoutEffect(() => {
    if (editAdId) return;
    const main = document.getElementById('main');
    if (main && mainTop.current != null) main.scrollTop = mainTop.current;
    mainTop.current = null;
    const fn = afterLeave.current;
    afterLeave.current = null;
    fn?.();
  }, [editAdId]);

  return (
    <AccountContext.Provider value={{ account, setAccount, notify: setToast, editAccount: onAccount, accountLoaded }}>
    {/* Either side panel narrows the page the same way (the with-advisor rules). */}
    <div className={`app-shell ${side ? 'with-advisor' : ''} ${side === 'help' ? 'with-help' : ''}`} data-density={density}>
    <div className="app">
      <TopBar me={me} onLogout={onLogout} alert={alert} side={side} onSide={setSidePanel} onHelp={openHelp} onAsk={ask}
        account={account} canEdit={canEdit} onAccount={onAccount} onPhoto={onPhoto}
        editing={!!editAdId} editBusy={editBusy} onCloseEdit={closeEdit} onView={viewAds} navOpen={navOpen} onMenu={toggleNav}
        density={density} onDensity={setDensity}
        search={{
          campaigns: status?.campaigns,
          canEdit,
          onPage: (p) => navigate({ page: p }),
          onCampaign: (id) => navigate({ page: 'adgroups', campaignId: id }),
        }} />
      <div className={`body ${navOpen ? '' : 'nav-closed'}`} style={editAdId ? { display: 'none' } : undefined}>
        <aside className={`rail ${showCreate ? '' : 'no-create'}`}>
          {/* Create shows for everyone, except viewers on the When and where ads showed pages. */}
          {showCreate && (
            <Dropdown className="rail-create" panelClass="rail-create-pop" trigger={(open, toggle) => (
              <button type="button" className="create-btn" aria-label="Create" aria-expanded={open} data-testid="rail-create" onClick={toggle}>
                <span className="create-circle">
                  <svg viewBox="0 0 36 36" width="31" height="31" aria-hidden="true">
                    <rect x="16" y="4" width="4" height="14" fill="#ea4335" />
                    <rect x="20" y="16" width="12" height="4" fill="#4285f4" />
                    <rect x="16" y="18" width="4" height="14" fill="#34a853" />
                    <rect x="4" y="16" width="12" height="4" fill="#fbbc04" />
                  </svg>
                </span>
                <span>Create</span>
              </button>
            )}>
              {(close) => (
                <div className="menu create-menu rail-create-menu" data-testid="rail-create-menu">
                  {CREATE.map((c) => <MenuItem key={c.kind} onClick={() => { close(); if (c.page) create(c); }}>{c.label}</MenuItem>)}
                </div>
              )}
            </Dropdown>
          )}
          {RAIL.map((r) => (
            <button key={r.key} className={`rail-item ${section === r.key ? 'active' : ''}`} data-tip={r.label} onClick={() => setSection(r.key)}>
              <span className="rail-icon"><Icon name={r.icon} fill={section === r.key} /></span>
              <span className="rail-label">{r.label}</span>
            </button>
          ))}
        </aside>
        <nav className="navpanel">
          <div className="nav-scroll">
            {items.map((it) => it.group ? (
              // An open group is a white card with its items. Closed, the Campaigns group keeps its card
              // on the Ads pages (as it always has); elsewhere a closed group is a plain row with a tip.
              <div className={navCard(it.group) ? 'nav-group' : 'nav-group-closed'} key={it.group}>
                <button className={`nav-item ${navCard(it.group) ? 'group-head' : ''}`} aria-expanded={!!groupOpen[it.group]}
                  data-tip={navCard(it.group) ? undefined : it.group}
                  onClick={() => setGroupOpen((o) => ({ ...o, [it.group]: !o[it.group] }))}>
                  <span className="nav-label">{it.group}</span>
                  <Icon name={groupOpen[it.group] ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} />
                </button>
                {groupOpen[it.group] && it.children.map((c) => {
                  const child = typeof c === 'string' ? { label: c } : c;
                  const to = child.page || NAV_PAGE[child.label];
                  const on = child.pages ? child.pages.includes(page) : to === page;
                  return (
                    <NavItem key={child.label} item={child} active={on}
                      onClick={to ? () => (child.page ? navigate({ page: to }) : openNav(to)) : undefined} />
                  );
                })}
              </div>
            ) : (
              <NavItem key={it.label} item={it} active={it.page && page === it.page} onClick={it.page ? () => navigate({ page: it.page }) : undefined} />
            ))}
          </div>
        </nav>
        <main className="main" id="main">
          {assets && <AssetDetailsPage key={assets.id} adId={assets.id} row={assets.row} canEdit={canEdit} onBack={closeAssets} onEdit={openEdit} />}
          <div style={{ display: assets ? 'none' : 'contents' }}>
            {page === 'history' && canEdit && <HistoryPage />}
            {page === 'feedback' && canEdit && <FeedbackPage />}
            {onBilling && <BillingPage key={page} page={page} canEdit={canEdit} />}
            {isWwPage(page) && <WhenWherePage page={page} canEdit={canEdit} onNavigate={navigate} />}
            {/* hidden: under the asset details page, which then owns the tab title. */}
            {!(adminPage(page) && canEdit) && !onBilling && !isWwPage(page) && (
              <AdsPage level={adminPage(page) ? 'ads' : page} scope={route} canEdit={canEdit} onStatus={onStatus} onOpenEdit={openEdit}
                onOpenAssets={openAssets} onNavigate={navigate} linkTo={(r) => pageUrl(admin, r)} hidden={!!assets} />
            )}
          </div>
        </main>
      </div>
      {editAdId && (
        <div className="edit-scroll" id="edit-scroll">
          <AdEditPage key={editAdId} adId={editAdId} canEdit={canEdit} onClose={leaveEdit} onDirty={setDirty} onBusy={setBusy} />
        </div>
      )}
    </div>
    {side === 'advisor' && <Advisor onClose={() => setSidePanel(null)} question={question} questionAdId={questionAdId} onQuestionUsed={() => { setQuestion(null); setQuestionAdId(null); }} />}
    {side === 'help' && <QuickHelp request={helpReq} context={editAdId ? 'edit' : assets ? 'assets' : page} onClose={() => setSidePanel(null)} />}
    <FeedbackHost />
    {toast && <div className="toast" role="alert">{toast.text}</div>}
    </div>
    </AccountContext.Provider>
  );
}

