import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { BRAND, tabTitle } from '../../../shared/brand.js';
import { EDIT_FORMATS, LIMITS, normalizeCreative, normText, isYouTube, displayHost } from '../../../shared/creative.js';
import { todayISO } from '../../../shared/dates.js';
import { Icon, Dropdown, ToolBtn, MenuItem, HelpLink, openHelp, download, csvCell } from './Common.jsx';
import { AdvisorIcon } from './Advisor.jsx';
import './asset-details.css';

// Asset details of one ad: every headline, description, image, logo, video and URL it is built
// from, with the ad's status. Display and video ads load their content from the server
// (GET /api/ads/:id/creative); search ads list the text kept on their ads table row (reloaded
// from the report on Refresh). A display or video ad never set up in the edit page lists only
// what its own record holds (its ads table row), under a note saying so, never the edit page's
// sample starting content. Read-only for everyone; admins get a pencil that opens the ad's own
// editor (onEdit).

const NOT_FOUND = 'This ad couldn’t be found. It may have been deleted.';
const DISMISS_KEY = 'ap.assetAdvisor';
const DASH = '—';
const COLS = 5;

// Asset types: label and Quick help topic (none for the call to action and a search ad's display URL).
const TYPES = {
  headline: ['Headline', 'headlines'],
  longHeadline: ['Long headline', 'long-headline'],
  description: ['Description', 'descriptions'],
  businessName: ['Business name', 'business-name'],
  image: ['Image', 'images'],
  logo: ['Logo', 'logos'],
  video: ['Video', 'videos'],
  cta: ['Call to action', null],
  finalUrl: ['Final URL', 'final-url'],
  displayUrl: ['Display URL', null],
};
const typeLabel = (a) => TYPES[a.type][0];

const isWeb = (s) => /^https?:\/\//i.test(s);
const fileName = (url) => {
  const last = String(url || '').split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
  try { return decodeURIComponent(last); } catch { return last; }
};
const absUrl = (url) => {
  try { return new URL(url, location.href).href; } catch { return url || ''; }
};
const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
// "Campaign has ended, Campaign is paused +1": a "+N" entry follows the one before it.
const reasonText = (list) => (list || []).reduce((s, r) => (!s ? r : /^\+\d+$/.test(r) ? `${s} ${r}` : `${s}, ${r}`), '');
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const sortText = (a) => a.text || a.title || a.name || fileName(a.url);

// A display or video ad's content, as rows in the order the edit page lists it.
function assetsOfCreative(c) {
  const out = [];
  const add = (type, a) => out.push({ key: `${type}-${out.length}`, type, ...a });
  const text = (type, list) => list.map(normText).filter(Boolean).forEach((t) => add(type, { text: t }));
  const media = (type, list) => list.filter((r) => r?.url).forEach((r) => add(type, {
    url: r.url, name: r.name || '', title: r.title || '', w: r.w || 0, h: r.h || 0, assetId: r.assetId || '',
  }));
  text('headline', c.headlines);
  text('longHeadline', [c.longHeadline]);
  text('description', c.descriptions);
  text('businessName', [c.businessName]);
  media('image', c.images);
  media('logo', c.logos);
  media('video', c.videos);
  text('cta', [c.options?.cta || '']);
  const url = normText(c.finalUrl);
  if (url) add('finalUrl', { text: url, href: isWeb(url) ? url : '' });
  return out;
}

// A search ad's text, from its ads table row.
function assetsOfSearchAd(row) {
  const out = [];
  const add = (type, t) => t && out.push({ key: `${type}-${out.length}`, type, text: t });
  (row.headlines || []).map(normText).forEach((t) => add('headline', t));
  add('description', normText(row.description));
  // The path shown under the ad's headlines, not its landing page (search ads have no final URL).
  add('displayUrl', normText(row.displayUrl));
  return out;
}

// One ad's ads table row (today's report), or null when there is no such ad.
const findRow = (id) => {
  const today = todayISO();
  return api.report({ from: today, to: today }).then((rep) => (rep.rows || []).find((x) => x.id === id) || null);
};

// ----- a display / video ad that was never set up in the edit page -----
// Until then GET /api/ads/:id/creative answers with the edit page's starting content (server
// creative.js defaultCreative): sample library pictures and logo, a placeholder final URL and
// description, and a long headline joined from the table headlines. A `stored` flag in the reply
// says which it is; without one, the reply is recognised by comparing it with that starting
// content, worked out here from the ad's own record the same way the server does.
const PLACEHOLDER_URL = 'https://www.example.com/';
const SAMPLE_DESCRIPTION = 'Simple, practical ideas to help your crops and garden grow.';
const SAMPLE_PREFIX = '/api/sample/';
const cutTo = (s, max) => (s.length <= max ? s : [...s].slice(0, max).join(''));
const cleanTo = (v, max) => cutTo(normText(String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ')), max);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function startingTextOf(rec) {
  const seen = new Set();
  const heads = [];
  for (const raw of rec.headlines || []) {
    const s = cleanTo(String(raw).replace(/\s*(…|\.\.\.)\s*$/, ''), LIMITS.headline).trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    heads.push(s);
    if (heads.length >= LIMITS.headlines) break;
  }
  if (!heads.length) heads.push('New headline');
  let longHeadline = '';
  for (const h of heads) {
    const next = longHeadline ? `${longHeadline}. ${h}` : h;
    if ([...next].length > LIMITS.longHeadline) break;
    longHeadline = next;
  }
  return {
    headlines: heads,
    longHeadline,
    descriptions: [cleanTo(rec.description, LIMITS.description) || SAMPLE_DESCRIPTION],
    finalUrl: rec.displayUrl ? `https://${rec.displayUrl}` : PLACEHOLDER_URL,
  };
}

// True when content c is exactly what the edit page starts from for the ad with record rec.
function looksLikeStart(c, rec) {
  const t = startingTextOf(rec);
  const sample = (r) => String(r?.url || '').startsWith(SAMPLE_PREFIX);
  const own = (r) => !!r?.url && !r.assetId && !sample(r);
  return sameList(c.headlines, t.headlines) && c.longHeadline === t.longHeadline && sameList(c.descriptions, t.descriptions)
    && c.finalUrl === t.finalUrl && c.options.cta === 'Automated' && c.images.length <= 4 && c.logos.length <= 1
    && (c.images.every(sample) || (c.images.length === 1 && own(c.images[0]))) && c.logos.every(sample)
    && c.videos.every((v) => v?.own === true);
}

// What such an ad really has: its record's headlines, description, display URL and video title,
// and a picture or video uploaded for it from the ads table. Nothing from the sample content.
function assetsOfStart(rec, c) {
  const out = [];
  const add = (type, a) => out.push({ key: `${type}-${out.length}`, type, ...a });
  const ref = (r) => ({ url: r.url, name: r.name || '', title: r.title || '', w: r.w || 0, h: r.h || 0, assetId: '' });
  (rec.headlines || []).map(normText).filter(Boolean).forEach((t) => add('headline', { text: t }));
  const desc = normText(rec.description);
  if (desc) add('description', { text: desc });
  c.images.filter((r) => r?.url && !r.assetId && !String(r.url).startsWith(SAMPLE_PREFIX)).forEach((r) => add('image', ref(r)));
  const own = c.videos.filter((v) => v?.own === true && v.url);
  own.forEach((v) => add('video', ref(v)));
  const title = normText(rec.videoTitle);
  if (!own.length && title) add('video', { url: '', name: '', title, w: 0, h: 0, assetId: '' });
  const shown = normText(rec.displayUrl);
  if (shown) add('displayUrl', { text: shown });
  return out;
}

// A .csv cell: text starting like a formula (=, +, -, @) is opened as text, not run.
const csvText = (v) => {
  const s = String(v ?? '');
  return csvCell(/^[=+\-@\t\r]/.test(s) && !/^-?[\d.,]+%?$/.test(s) ? `'${s}` : s);
};

// When each library image / logo / video was added (library files never change after that).
async function libraryDates(c) {
  const kinds = [['image', c.images], ['logo', c.logos], ['video', c.videos]]
    .filter(([, list]) => list.some((r) => r?.assetId)).map(([k]) => k);
  const lists = await Promise.all(kinds.map((k) => api.assets(k).then((r) => r.assets || []).catch(() => [])));
  return Object.fromEntries(lists.flat().filter((a) => a.createdAt).map((a) => [a.id, a.createdAt]));
}

// ---------- cells ----------

// Image or logo thumbnail; reports the picture's own size once it has loaded.
function Picture({ a, onSize }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`asd-pic ${a.type === 'logo' ? 'logo' : ''}`}>
      {broken
        ? <Icon name="hide_image" />
        : <img src={a.url} alt="" loading="lazy" onError={() => setBroken(true)}
          onLoad={a.w && a.h ? undefined : (e) => onSize(a.url, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />}
    </span>
  );
}

// A video's first frame (uploaded files) or a plain player icon (YouTube links, unplayable files,
// a video known only by its title).
function VideoFrame({ a, onSize }) {
  const [broken, setBroken] = useState(false);
  if (broken || !a.url || isYouTube(a.url)) return <span className="asd-pic video"><Icon name="smart_display" /></span>;
  return (
    <span className="asd-pic video">
      <video src={`${a.url}#t=0.1`} muted playsInline preload="metadata" onError={() => setBroken(true)}
        onLoadedMetadata={(e) => onSize(a.url, e.currentTarget.videoWidth, e.currentTarget.videoHeight)} />
      <Icon name="play_circle" className="asd-play" />
    </span>
  );
}

// The picture / video cells are keyed by their address, so a replaced file (a fixed broken image)
// starts over instead of keeping the old one's broken state.
function AssetCell({ a, size, onSize }) {
  if (a.type === 'image' || a.type === 'logo') {
    return (
      <div className="asd-media">
        <Picture key={a.url} a={a} onSize={onSize} />
        <div className="asd-media-text">
          <span className="asd-size" data-testid="asset-size">{size || 'Size unknown'}</span>
          <span className="asd-file" title={a.name || a.url}>{a.name || fileName(a.url)}</span>
        </div>
      </div>
    );
  }
  if (a.type === 'video') {
    const yt = isYouTube(a.url);
    return (
      <div className="asd-media">
        <VideoFrame key={a.url} a={a} onSize={onSize} />
        <div className="asd-media-text">
          <span className="asd-title" title={a.title || a.url}>{a.title || fileName(a.url) || 'Video'}</span>
          {!a.url
            ? <span className="asd-file">No video file added yet</span>
            : yt
              ? <a className="link asd-file" href={a.url} target="_blank" rel="noopener noreferrer">{displayHost(a.url)}</a>
              : size && <span className="asd-file" data-testid="asset-size">{size}</span>}
        </div>
      </div>
    );
  }
  if (a.href) return <a className="link asd-text" href={a.href} target="_blank" rel="noopener noreferrer">{a.text}</a>;
  return <span className="asd-text">{a.text}</span>;
}

// The ad's status, shown for each of its assets: red when not eligible, with the reasons under it.
function StatusCell({ ad }) {
  const e = ad.eligibility || '';
  const reasons = e && e !== 'Eligible' ? ad.reasons || [] : [];
  return (
    <div className="status">
      <span className={`st-line ${reasons.length ? 'st-head' : ''} ${e === 'Not eligible' ? 'red' : ''}`}>{e || DASH}</span>
      {reasons.map((r, i) => <span key={i} className="st-line asd-reason">{r}{i < reasons.length - 1 && !/^\+\d+$/.test(reasons[i + 1]) ? ',' : ''}</span>)}
    </div>
  );
}

function TypeCell({ a }) {
  const [label, topic] = TYPES[a.type];
  return (
    <span className="asd-type">
      {label}
      {topic && (
        <button type="button" className="asd-help" aria-label={`Help: ${label}`} title={`About ${label.toLowerCase()} assets`}
          data-testid="asset-help" onClick={() => openHelp(topic)}>
          <Icon name="help" />
        </button>
      )}
    </span>
  );
}

function SortHead({ k, label, sort, onSort, className = '' }) {
  const on = sort.key === k;
  return (
    <th className={`sortable ${on ? 'sorted' : ''} ${className}`} aria-sort={on ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="asd-sort" data-testid={`sort-${k}`} onClick={() => onSort(k)}>
        <span className="th-label">{label}</span>
        {on && <Icon name={sort.dir === 'desc' ? 'arrow_downward' : 'arrow_upward'} className="sort-ic" />}
      </button>
    </th>
  );
}

// ---------- page ----------

export default function AssetDetailsPage({ adId, row, canEdit, onBack, onEdit }) {
  // A search ad passed in by the ads table is shown from its row (until a Refresh reloads it);
  // anything else is loaded.
  const given = row?.format === 'search' ? 'search' : row ? 'other' : 'none';
  const [phase, setPhase] = useState(given === 'search' ? 'ready' : 'loading'); // loading | ready | error
  const [loadError, setLoadError] = useState('');
  // { ad, creative, starting, rec } (display / video; rec: the ad's ads table row when starting)
  // or { ad } (search ad found by id)
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dates, setDates] = useState({});
  const [measured, setMeasured] = useState({});
  const [tick, setTick] = useState(0);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [full, setFull] = useState(false);
  const [advisorOff, setAdvisorOff] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === 'dismissed'; } catch { return false; }
  });

  useEffect(() => {
    // A search ad from the ads table shows that row until a Refresh asks for it again.
    if (given === 'search' && tick === 0) return undefined;
    let live = true;
    setBusy(true);
    (async () => {
      try {
        if (given === 'search') {
          const found = await findRow(adId);
          if (!live) return;
          if (!found) throw Object.assign(new Error(NOT_FOUND), { status: 404 });
          setData({ ad: found });
          setPhase('ready');
          return;
        }
        const r = await api.creative(adId);
        // Anything without the ad and its content (e.g. a page answered instead of the API) counts as missing.
        if (!r?.ad?.id || !r.creative || typeof r.creative !== 'object') throw Object.assign(new Error(NOT_FOUND), { status: 404 });
        const creative = normalizeCreative(r.creative);
        // Never set up in the edit page? Told by the reply's `stored` flag, else worked out from the
        // ad's own record (the ads table row it was opened from, or today's report).
        const known = typeof r.stored === 'boolean';
        let rec = null;
        if (!known || !r.stored) {
          rec = given === 'other' && tick === 0 ? row : await findRow(adId).catch(() => null);
        }
        if (!live) return;
        const starting = known ? !r.stored : !!rec && looksLikeStart(creative, rec);
        setData({ ad: r.ad, creative, starting, rec: starting ? rec : null });
        setPhase('ready');
        if (starting) return; // nothing from the library is listed
        const d = await libraryDates(creative);
        if (live) setDates(d);
      } catch (e) {
        if (!live) return;
        if (e.status === 401) { location.reload(); return; }
        // Opened from its address: a search ad has no edit page content, so find its row instead.
        if (e.status === 404 && given === 'none') {
          const found = await findRow(adId).catch(() => null);
          if (!live) return;
          if (found?.format === 'search') {
            setData({ ad: found });
            setPhase('ready');
            return;
          }
        }
        setData(null);
        setLoadError(e.status === 404 ? NOT_FOUND : e.message || 'This ad couldn’t be loaded.');
        setPhase('error');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [adId, given, row, tick]);

  // The top bar's Refresh (and a save on the edit page) reloads the content.
  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener('app:refresh', refresh);
    return () => window.removeEventListener('app:refresh', refresh);
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = tabTitle(`Asset details - ${BRAND.name}`);
    return () => { document.title = prev; };
  }, []);

  // Esc leaves the expanded table (an open menu takes the key first).
  useEffect(() => {
    if (!full) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) setFull(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [full]);

  const ready = phase === 'ready';
  const ad = data?.ad || (given === 'search' ? row : null);
  const creative = given === 'search' ? null : data?.creative;
  const starting = !!(creative && data?.starting);
  const record = data?.rec;
  const assets = useMemo(() => {
    if (!ready || !ad) return [];
    if (!creative) return assetsOfSearchAd(ad);
    return starting ? assetsOfStart(record || {}, creative) : assetsOfCreative(creative);
  }, [ready, ad, creative, starting, record]);
  const list = useMemo(() => {
    if (!sort.key) return assets;
    const val = sort.key === 'type' ? typeLabel : sortText;
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...assets].sort((a, b) => dir * collator.compare(val(a), val(b)));
  }, [assets, sort]);

  const onSort = (k) => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 'asc' ? 'desc' : 'asc' }));
  const onSize = (url, w, h) => {
    if (w && h) setMeasured((m) => (m[url] ? m : { ...m, [url]: [w, h] }));
  };
  const sizeOf = (a) => {
    const [w, h] = a.w && a.h ? [a.w, a.h] : measured[a.url] || [];
    return w && h ? `${w} × ${h}` : '';
  };
  const dateOf = (a) => (a.assetId && dates[a.assetId] ? fmtDate(dates[a.assetId]) : '');

  const dismissAdvisor = () => {
    setAdvisorOff(true);
    try { localStorage.setItem(DISMISS_KEY, 'dismissed'); } catch { /* storage off */ }
  };
  // Ad names repeat across campaigns ("Ad #1"), so the question names the campaign too; the ad's
  // id goes along for Advisor to pick out exactly this ad's row.
  const analyze = () => {
    if (!ad) return;
    const question = `Analyze my ad ${ad.name || 'Ad'}${ad.campaign ? ` in ${ad.campaign}` : ''}`;
    window.dispatchEvent(new CustomEvent('app:ask', { detail: { question, adId: ad.id } }));
  };

  const status = ad ? [ad.eligibility, reasonText(ad.eligibility !== 'Eligible' ? ad.reasons : [])].filter(Boolean).join(': ') : '';
  const downloadCsv = () => {
    const label = (a) => {
      if (a.type === 'image' || a.type === 'logo') return `${a.name || fileName(a.url)}${sizeOf(a) ? ` (${sizeOf(a)})` : ''}`;
      if (a.type === 'video') return a.title || fileName(a.url) || 'Video';
      return a.text;
    };
    const out = [
      ['Asset', 'Status', 'Asset type', 'Last updated', 'File URL'],
      ...list.map((a) => [label(a), status, typeLabel(a), dateOf(a), a.url ? absUrl(a.url) : '']),
    ];
    // UTF-8 with a byte order mark, so spreadsheet apps read "×", dashes and quotes correctly.
    const text = out.map((l) => l.map(csvText).join(',')).join('\n');
    download('asset-details.csv', new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  };

  const editable = !!(canEdit && onEdit && ad && EDIT_FORMATS.includes(ad.format));
  const limited = ad && (ad.eligibility === 'Not eligible' || ad.eligibility === 'Pending');
  const paused = ad?.status === 'paused';
  const context = ad ? [ad.name, [ad.campaign, ad.adGroup].filter(Boolean).join(' › ')].filter(Boolean).join(' · ') : '';

  return (
    <div className="page asd" data-testid="asset-details">
      {(busy || (!ready && phase === 'loading')) && <div className="progress"><span /></div>}
      <div className="asd-head">
        <nav className="asd-crumb" aria-label="Breadcrumb">
          <button type="button" className="asd-crumb-link" data-testid="asset-crumb" onClick={() => onBack?.()}>Ads</button>
          <Icon name="chevron_right" />
        </nav>
        <h1>Asset details</h1>
        {context && <div className="asd-sub" data-testid="asset-ad">{context}{ad.adType ? ` · ${ad.adType}` : ''}</div>}
      </div>

      {phase === 'error' && !ready ? (
        <div className="card asd-error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="btn-primary" onClick={() => onBack?.()}>Back to ads</button>
        </div>
      ) : (
        <>
          {!advisorOff && (
            <div className="learn-card asd-advisor" data-testid="asset-advisor">
              <span className="lc-ic"><AdvisorIcon size={22} /></span>
              <span className="lc-text">
                <span className="asd-adv-title">Analyze this ad with Ask Advisor</span>
                <span className="asd-adv-sub">
                  Ask Advisor works out its answers from this account’s own data.{' '}
                  <HelpLink topic="advisor" className="link" />
                </span>
              </span>
              <button type="button" className="btn-text" data-testid="advisor-dismiss" onClick={dismissAdvisor}>Dismiss</button>
              <button type="button" className="btn-primary" data-testid="advisor-analyze" disabled={!ad} onClick={analyze}>Analyze ad</button>
            </div>
          )}

          <section className={`card tablecard asd-card ${full ? 'full' : ''}`} data-testid="asset-card">
            {/* No filters: an ad's assets all share its status, so there is nothing to narrow down. */}
            <div className="table-toolbar asd-toolbar">
              <span className="spacer" />
              {editable && <ToolBtn icon="edit" label="Edit ad" data-testid="asset-edit" onClick={() => onEdit({ ...(row || {}), ...ad })} />}
              <Dropdown align="right" trigger={(open, toggle) => <ToolBtn icon="download" label="Download" active={open} onClick={toggle} data-testid="asset-download" />}>
                {(close) => <div className="menu narrow"><MenuItem disabled={!ready} data-testid="asset-csv" onClick={() => { downloadCsv(); close(); }}>.csv</MenuItem></div>}
              </Dropdown>
              <ToolBtn icon={full ? 'fullscreen_exit' : 'fullscreen'} label={full ? 'Collapse' : 'Expand'} active={full} aria-pressed={full}
                data-testid="asset-expand" onClick={() => setFull((f) => !f)} />
            </div>

            {limited && (
              <div className="asd-policy" role="status" data-testid="asset-policy">
                <Icon name="error" />
                <span className="asd-policy-text"><b>Ad may be limited:</b> {reasonText(ad.reasons) || (ad.eligibility === 'Pending' ? 'Under review' : ad.eligibility)}</span>
              </div>
            )}

            {ready && starting && (
              <div className="asd-start" role="status" data-testid="asset-starting">
                <Icon name="info" />
                <span>
                  This ad hasn’t been set up in the edit page yet. These are its starting assets.
                  {editable && ' Use Edit ad to set up its images, logos, videos and text.'}
                </span>
              </div>
            )}

            <table className="grid asd-grid" data-testid="asset-table">
              <colgroup>
                <col style={{ width: 40 }} /><col /><col style={{ width: 220 }} /><col style={{ width: 190 }} /><col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="asd-c-dot" aria-label="Asset status"><span className="dot grey" aria-hidden="true" /></th>
                  <SortHead k="asset" label="Asset" sort={sort} onSort={onSort} />
                  <th>Status</th>
                  <SortHead k="type" label="Asset type" sort={sort} onSort={onSort} />
                  <th>Last updated</th>
                </tr>
              </thead>
              <tbody>
                {ready && list.length === 0 && <tr><td colSpan={COLS} className="empty">This ad has no assets yet</td></tr>}
                {list.map((a) => (
                  <tr key={a.key} data-testid="asset-row" data-type={a.type}>
                    <td className="asd-c-dot">
                      {paused
                        ? <span title="Paused (the ad is paused)"><Icon name="pause_circle" className="paused-ic" fill /></span>
                        : <span className="dot green" title="Enabled" />}
                    </td>
                    <td className="asd-c-asset"><AssetCell a={a} size={sizeOf(a)} onSize={onSize} /></td>
                    <td className="asd-c-status"><StatusCell ad={ad} /></td>
                    <td className="asd-c-type"><TypeCell a={a} /></td>
                    <td className="asd-c-date" title={dateOf(a) ? 'Added to your asset library' : undefined}>{dateOf(a) || DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pager">
              {ready && <span data-testid="asset-count">{list.length ? `1 - ${list.length} of ${list.length}` : '0 of 0'}</span>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
