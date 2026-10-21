import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { useAccount, useNotify } from '../account.js';
import { BRAND, tabTitle } from '../../../shared/brand.js';
import { MetricInput } from './Editable.jsx';
import { Icon, Dropdown, ToolBtn, MenuItem, SubMenu, HelpLink, download, csvCell } from './Common.jsx';
import DatePicker, { presets, rangeLabel } from './DatePicker.jsx';
import Chart from './Chart.jsx';
import AdsTable from './AdsTable.jsx';
import CampaignsTable from './CampaignsTable.jsx';
import AdGroupsTable from './AdGroupsTable.jsx';
import ColumnsPanel from './ColumnsPanel.jsx';
import MetricsPanel from './MetricsPanel.jsx';
import {
  CampaignBar, AdGroupBar, ScopeChip, CampaignPanel, AdGroupPanel, EntitySettings, LearningCard, TYPE_ICON, perDay,
} from './Entity.jsx';
import { LEVELS, colsFor, colLabel, isMetric } from './columns.js';
import { METRICS, SCORECARD_KEYS as METRIC_KEYS, BASE_METRICS, EDITABLE, formatValue, withDerived, sumRows, editText, parseInput } from '../../../shared/metrics.js';
import { CAMPAIGN_TYPES, campaignStatusLabel, adGroupStatusLabel, adGroupType, formatScore } from '../../../shared/entities.js';
import { todayISO, addDays, daysBetween, eachDay, fmtDay, fmtRange, parseISO, toISO } from '../../../shared/dates.js';
import { LIMITS, MAX_BYTES, FILE_TYPES, capLabel, fmtBytes } from '../../../shared/creative.js';

const CARD_COLORS = ['#1a73e8', '#1e8e3e', '#f9ab00', '#d93025'];
// Text on a selected card: white, except on the amber card where it's dark.
const CARD_INK = ['#fff', '#fff', '#202124', '#fff'];
const PERIODS = [['daily', 'Daily', 1], ['weekly', 'Weekly', 14], ['monthly', 'Monthly', 60], ['quarterly', 'Quarterly', 180], ['yearly', 'Yearly', 730]];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Clicks joined the ads table's default columns later, just before Impr.: put it there once in a
// column list saved before.
function withClicks(level, list) {
  if (level !== 'ads' || !Array.isArray(list) || load('ap.cols.clicksBeforeImpr', false)) return list;
  try { localStorage.setItem('ap.cols.clicksBeforeImpr', 'true'); } catch { /* keep going */ }
  const rest = list.filter((k) => k !== 'clicks');
  const at = rest.indexOf('impressions');
  return at < 0 ? [...rest, 'clicks'] : [...rest.slice(0, at), 'clicks', ...rest.slice(at)];
}

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function store(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

function bucketKey(period, iso) {
  const d = parseISO(iso);
  if (period === 'weekly') return addDays(iso, -((d.getDay() + 6) % 7));
  if (period === 'monthly') return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
  if (period === 'quarterly') return toISO(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1));
  if (period === 'yearly') return toISO(new Date(d.getFullYear(), 0, 1));
  return iso;
}
function bucketLabel(period, iso) {
  const d = parseISO(iso);
  if (period === 'monthly') return `${MON[d.getMonth()]} ${d.getFullYear()}`;
  if (period === 'quarterly') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  if (period === 'yearly') return String(d.getFullYear());
  return fmtDay(iso);
}

// Segment > Time: each table row split into one row per day, week (Monday start), month,
// quarter or year of the date range.
const SEGMENT_TIMES = [['day', 'Day', 'daily'], ['week', 'Week', 'weekly'], ['month', 'Month', 'monthly'], ['quarter', 'Quarter', 'quarterly'], ['year', 'Year', 'yearly']];
const PERIOD_OF = Object.fromEntries(SEGMENT_TIMES.map(([k, , p]) => [k, p]));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Segments with no data behind them: listed, but can't be picked.
// Without the server's per-period numbers, the client asks for one report per period, up to this many.
const MAX_SPLIT = 62;
const baseOf = (x) => Object.fromEntries(BASE_METRICS.map((m) => [m, x[m] ?? null]));

// The periods of a date range for one Time choice, each cut to the range: [{ key, from, to }].
function periodsOf(segment, from, to) {
  const out = [];
  for (const d of eachDay(from, to)) {
    const k = bucketKey(PERIOD_OF[segment], d);
    if (out.length && out[out.length - 1].key === k) out[out.length - 1].to = d;
    else out.push({ key: k, from: d, to: d });
  }
  return out;
}
function periodLabel(segment, from, to) {
  if (segment === 'day') return `${DOW[parseISO(from).getDay()]}, ${fmtDay(from)}`;
  if (segment === 'week') return fmtRange(from, to);
  return bucketLabel(PERIOD_OF[segment], from);
}
// Each ad's numbers per period: [{ adId, from, to, impressions, clicks, ... }]. The report answers
// this itself when it knows `segment`; otherwise one report per period gives each ad's totals.
async function loadSegments(q, segment) {
  const scope = {};
  for (const k of ['campaignId', 'adGroupId', 'campaignType']) if (q[k]) scope[k] = q[k];
  const res = await api.report({ from: q.from, to: q.to, ...scope, segment });
  if (Array.isArray(res.segments)) return res.segments;
  const periods = periodsOf(segment, q.from, q.to);
  if (periods.length > MAX_SPLIT) {
    throw new Error(`This date range has too many ${segment === 'day' ? 'days' : `${segment}s`} to split: pick a longer period or a shorter date range`);
  }
  const out = [];
  for (let i = 0; i < periods.length; i += 6) {
    const part = periods.slice(i, i + 6);
    const replies = await Promise.all(part.map((p) => api.report({ from: p.from, to: p.to, ...scope })));
    replies.forEach((r, j) => r.rows.forEach((row) => out.push({ adId: row.id, from: part[j].from, to: part[j].to, ...baseOf(row) })));
  }
  return out;
}

// Status filters. Each page keeps its own: its own status (always applied) and, above an
// unscoped table, the status of the campaigns / ad groups the rows belong to.
const STATUSES = [['enabled', 'Enabled'], ['paused', 'Paused']];
const ALL_STATUSES = STATUSES.map(([v]) => v);
const FILTER_LABEL = { campaign: 'Campaign status', adgroup: 'Ad group status', ad: 'Ad status' };
const OWN_FILTER = { campaigns: 'campaign', adgroups: 'adgroup', ads: 'ad' };
const BAR_FILTERS = { campaigns: ['campaign'], adgroups: ['campaign', 'adgroup'], ads: ['campaign', 'adgroup'] };
const statusText = (list) => STATUSES.filter(([v]) => list.includes(v)).map(([, l]) => l).join(', ');
const onOff = (s) => (s === 'paused' ? 'paused' : 'enabled');

// Pick the statuses a filter keeps; at least one stays ticked.
function StatusFilterCard({ k, value, onApply, onCancel }) {
  const [draft, setDraft] = useState(value);
  const flip = (v) => setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : ALL_STATUSES.filter((x) => x === v || d.includes(x))));
  return (
    <div className="sf-card" role="dialog" aria-label={`${FILTER_LABEL[k]} filter`} data-testid="status-filter">
      <div className="sf-title">{FILTER_LABEL[k]}</div>
      {STATUSES.map(([v, l]) => {
        const on = draft.includes(v);
        const last = on && draft.length === 1;
        return (
          <label key={v} className={`colcheck ${last ? 'last' : ''}`}>
            <input type="checkbox" checked={on} disabled={last} onChange={() => flip(v)} />
            <span>{l}</span>
          </label>
        );
      })}
      <div className="sf-note muted">At least one status stays ticked</div>
      <div className="sf-foot">
        <button type="button" className="btn-text" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary" onClick={() => onApply(draft)} data-testid="status-filter-apply">Apply</button>
      </div>
    </div>
  );
}

// "<Field> status: Enabled, Paused" chip; opens the filter's editor.
function StatusChip({ k, value, onApply, className = 'chip' }) {
  return (
    <Dropdown trigger={(open, toggle) => (
      <button type="button" className={className} onClick={toggle} aria-expanded={open} data-testid={`filter-chip-${k}`}>
        {FILTER_LABEL[k]}: {statusText(value)}
      </button>
    )}>
      {(close) => <StatusFilterCard k={k} value={value} onCancel={close} onApply={(v) => { close(); onApply(k, v); }} />}
    </Dropdown>
  );
}

// Controls with nothing behind them yet: shown like the others (no greyed-out state or note,
// at the owner's request); clicking them does nothing.
function UnavailableItem({ label, icon, sub }) {
  return <MenuItem icon={icon} sub={sub}>{label}</MenuItem>;
}
function UnavailableButton({ className = '', children }) {
  return <span className={`na-wrap ${className}`}>{children}</span>;
}

// The funnel's menu: every status filter on this table; picking one opens its editor in place.
// unavailable: other fields listed under them, which can't be filtered on yet.
function FilterMenu({ keys, valueOf, onApply, close, unavailable = [], testId = 'filter-menu' }) {
  const [editing, setEditing] = useState(null);
  if (editing) return <StatusFilterCard k={editing} value={valueOf(editing)} onCancel={close} onApply={(v) => { close(); onApply(editing, v); }} />;
  return (
    <div className="menu" data-testid={testId}>
      {keys.map((k) => <MenuItem key={k} selected onClick={() => setEditing(k)}>{FILTER_LABEL[k]}: {statusText(valueOf(k))}</MenuItem>)}
      {unavailable.length > 0 && <div className="menu-sep" />}
      {unavailable.map((f) => <UnavailableItem key={f} label={f} />)}
    </div>
  );
}

// Outlined house with a solid door (the Material "home" glyphs have an outlined door).
function HomeIcon() {
  return (
    <svg className="vs-home" viewBox="0 0 20 20" width="18" height="18" fill="#5f6368" aria-hidden="true">
      <path fillRule="evenodd" d="M10 2 2.5 7.6V18h15V7.6L10 2Zm5.8 14.3H4.2V8.4L10 4.1l5.8 4.3v7.9Z" />
      <rect x="7.5" y="11" width="5" height="6.5" />
    </svg>
  );
}

// Views on the unscoped pages: every campaign, or the campaigns of one type.
const VIEWS = [
  { type: '', label: 'All campaigns' },
  { type: 'Search', label: 'Search campaigns', icon: 'pageview' },
  { type: 'Video', label: 'Video campaigns', icon: 'videocam' },
  { type: 'Demand Gen', label: 'Demand Gen campaigns', icon: 'featured_video' },
  { type: 'Display', label: 'Display campaigns', icon: 'ad' },
];
const viewOf = (type) => VIEWS.find((v) => v.type === type) || VIEWS[0];
function ViewLabel({ type }) {
  const v = viewOf(type);
  return <>{v.icon ? <Icon name={v.icon} fill className="vs-type" /> : <HomeIcon />}{v.label}</>;
}
// Saved filter of each page: which rows it keeps.
const SAVED_FILTERS = {
  ads: { label: 'Disapproved ads', keep: (r) => r.eligibility === 'Not eligible' },
  campaigns: { label: 'Limited campaigns', keep: (r) => /Limited/.test(campaignStatusLabel(r)) },
  adgroups: { label: 'Paused ad groups', keep: (r) => r.status === 'paused' },
};

function ViewPanel({ close, view, types, onPick }) {
  const pick = (t) => { close(); onPick(t); };
  return (
    <div className="view-panel" role="dialog" aria-label="Select view">
      <div className="vp-head">
        <span>Select view</span>
        <ToolBtn icon="rate_review" label="Feedback" data-testid="view-feedback"
          onClick={() => { close(); window.dispatchEvent(new CustomEvent('app:feedback', { detail: { about: 'Views' } })); }} />
      </div>
      <div className="vp-list">
        <div className="menu-title">Campaign types</div>
        <button type="button" className={`menu-item ${view ? '' : 'selected'}`} onClick={() => pick('')} data-testid="view-all">
          <span className="mi-label"><HomeIcon />All campaigns</span>
          <span className="vp-trail"><Icon name="edit" /><Icon name="more_vert" /></span>
        </button>
        {VIEWS.filter((v) => v.type && types.includes(v.type)).map((v) => (
          <MenuItem key={v.type} selected={view === v.type} onClick={() => pick(v.type)}><Icon name={v.icon} fill className="mi-icon" />{v.label}</MenuItem>
        ))}
      </div>
      <UnavailableButton className="vp-create-na" up>
        <button type="button" className="btn-text vp-create"><Icon name="add_circle" fill />Create view</button>
      </UnavailableButton>
    </div>
  );
}

function Scorecard({ metric, value, prev, color, ink, selected, onClick, onPick, onEditValue, onEditPrev, onError }) {
  const [tip, setTip] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingDelta, setEditingDelta] = useState(false);
  // The change line is current minus previous period, so editing it sets the previous period's total.
  const setPrev = (p) => {
    if (p == null || !(p >= 0)) return onError('The previous period can\u2019t go below zero');
    onEditPrev(editText(metric, p));
  };
  const delta = value != null && prev != null ? value - prev : null;
  const pct = delta == null || prev === 0 ? (delta === 0 ? 0 : null) : delta / prev;
  const deltaText = delta == null ? '–' : formatValue(metric, Math.abs(delta));
  return (
    <div className={`scorecard ${selected ? 'selected' : ''}`} style={selected ? { background: color, color: ink } : undefined}
      onClick={onClick} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)} data-testid={`scorecard-${metric}`}>
      <Dropdown className="sc-label-dd" trigger={(open, toggle) => (
        <button className="sc-label" onClick={(e) => { e.stopPropagation(); toggle(); }}>{METRICS[metric].label}</button>
      )}>
        {(close) => (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            {METRIC_KEYS.map((m) => (
              <MenuItem key={m} selected={m === metric} onClick={() => { onPick(m); close(); }}>{METRICS[m].label}</MenuItem>
            ))}
          </div>
        )}
      </Dropdown>
      <div className="sc-value">
        {editing
          ? <MetricInput metric={metric} value={value} className="sc-input" onCancel={() => setEditing(false)} onCommit={(t) => { setEditing(false); onEditValue(t); }} />
          : (
            <span className={onEditValue ? 'editable' : ''} title={onEditValue ? 'Double-click to edit' : undefined}
              onDoubleClick={onEditValue ? (e) => { e.stopPropagation(); setTip(false); setEditing(true); } : undefined}>
              {formatValue(metric, value)}
            </span>
          )}
      </div>
      <div className="sc-delta">
        <span className={onEditPrev && delta != null ? 'editable' : ''} title={onEditPrev && delta != null ? 'Double-click to flip up/down' : undefined}
          onDoubleClick={onEditPrev && delta != null ? (e) => { e.stopPropagation(); setPrev(value + (value - prev)); } : undefined}>
          <Icon name={delta < 0 ? 'arrow_downward' : 'arrow_upward'} />
        </span>
        {editingDelta
          ? <MetricInput metric={metric} value={delta == null ? null : Math.abs(delta)} className="sc-delta-input"
            onCancel={() => setEditingDelta(false)}
            onCommit={(t) => {
              setEditingDelta(false);
              const d = parseInput(metric, t);
              if (d == null || d === undefined) return;
              setPrev(delta < 0 ? value + d : value - d);
            }} />
          : (
            <span className={onEditPrev && value != null ? 'editable' : ''} title={onEditPrev && value != null ? 'Double-click to edit' : undefined}
              onDoubleClick={onEditPrev && value != null ? (e) => { e.stopPropagation(); setTip(false); setEditingDelta(true); } : undefined}>
              {deltaText}
            </span>
          )}
      </div>
      {tip && (
        <div className="sc-tip" onClick={(e) => e.stopPropagation()}>
          <p dangerouslySetInnerHTML={{ __html: METRICS[metric].help }} />
          {METRICS[metric].formula && <p>Formula: {METRICS[metric].formula}</p>}
          <p>The <b>{METRICS[metric].label}</b> metric has changed by <b>{delta == null ? '–' : (delta < 0 ? '-' : '') + deltaText}</b>
            {pct != null && <> (<b>{pct >= 0 ? '+' : ''}{(pct * 100).toFixed(2)}%</b>)</>} compared to the previous period.</p>
        </div>
      )}
    </div>
  );
}

// Scorecards that don't fit are clipped, with arrows to step through them.
function ScoreStrip({ count, children }) {
  const box = useRef(null);
  const track = useRef(null);
  const [fit, setFit] = useState({ over: false, max: 0 });
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !track.current) return;
      const max = Math.max(0, track.current.scrollWidth - box.current.clientWidth);
      setFit({ over: max > 1, max });
      setShift((s) => Math.min(s, max));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [count]);
  const step = 180;
  return (
    <div className={`sc-strip ${fit.over ? 'over' : ''}`} ref={box}>
      <div className="sc-track" ref={track} style={{ transform: `translateX(${-shift}px)` }}>{children}</div>
      {fit.over && shift > 0 && (
        <button type="button" className="sc-arrow left" aria-label="Previous metrics" onClick={() => setShift((s) => Math.max(0, s - step))}><Icon name="chevron_left" /></button>
      )}
      {fit.over && shift < fit.max && (
        <button type="button" className="sc-arrow right" aria-label="More metrics" data-testid="sc-more" onClick={() => setShift((s) => Math.min(fit.max, s + step))}><Icon name="chevron_right" /></button>
      )}
    </div>
  );
}

const TITLES = { campaigns: 'Campaigns', adgroups: 'Ad groups', ads: 'Ads' };
const NEW_ADS = [
  ['search', 'Responsive search ad', 'Create an ad that automatically adapts to show relevant messages to your customers'],
  ['video', 'Video ad', 'Create a video ad that plays before, during or after other videos'],
  ['display', 'Responsive display ad', 'Create an ad that adjusts its size and layout to fit the space where it shows'],
  ['demandgen', 'Demand Gen ad', 'Create an image or video ad for feeds where people browse and discover'],
];

// Upload display ads: the chosen images go into the asset library, then one new responsive
// display ad in the picked ad group (of a display campaign) gets them as its images.
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const UPLOAD_ACCEPT = [...UPLOAD_TYPES, '.jpg', '.jpeg', '.png', '.gif', '.webp'].join(',');
const UPLOAD_STATE = { ready: 'Ready to upload', uploading: 'Uploading…', done: 'Uploaded' };
const MODAL_FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
let uploadSeq = 0;

function readImageSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = src;
  });
}
// A server refusal, with the fields it names ("Fix the highlighted fields" alone says little here).
const errorText = (e) => {
  const fields = e?.data?.fields ? Object.values(e.data.fields).filter(Boolean) : [];
  return fields.length ? fields.join('; ') : e?.message || 'Something went wrong';
};

// Files checked here first (type, size, how many an ad takes), so nothing is sent for nothing;
// the server's own refusals show on their file too.
function initialItems(files) {
  let usable = 0;
  return files.map((file) => {
    const key = `u${(uploadSeq += 1)}`;
    if (!UPLOAD_TYPES.includes(file.type)) return { key, file, state: 'error', error: `Only ${FILE_TYPES.image} images can be uploaded` };
    if (file.size > MAX_BYTES.image) return { key, file, state: 'error', error: `Images can be up to ${capLabel(MAX_BYTES.image)}` };
    if (usable >= LIMITS.images) return { key, file, state: 'skipped', error: `Not used: an ad can have up to ${LIMITS.images} images` };
    usable += 1;
    return { key, file, state: 'ready', preview: '', w: 0, h: 0 };
  });
}

function UploadDisplayDialog({ files, campaigns, adGroups, campaignId, adGroupId, onClose, onCreated }) {
  const [items, setItems] = useState(() => initialItems(files));
  // Ad groups of display campaigns, under their campaign, in the campaigns' order.
  const options = useMemo(() => campaigns.filter((c) => c.type === 'Display')
    .map((c) => ({ c, groups: adGroups.filter((g) => g.campaignId === c.id) }))
    .filter((o) => o.groups.length), [campaigns, adGroups]);
  const groups = options.flatMap((o) => o.groups);
  // The ad group picked here, else this page's ad group / campaign when it is a display one, else the first.
  const [groupId, setGroupId] = useState('');
  const picked = groups.find((g) => g.id === groupId) || groups.find((g) => g.id === adGroupId)
    || groups.find((g) => g.campaignId === campaignId) || groups[0] || null;
  const [phase, setPhase] = useState('idle'); // idle | busy | done
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const busy = phase === 'busy';
  const box = useRef(null);
  const sizes = useRef(new Map());
  const set = (key, patch) => setItems((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  // A preview of each picture, and its own size (sent with the upload, like the asset library does).
  useEffect(() => {
    let live = true;
    const made = [];
    for (const it of items) {
      if (it.state !== 'ready') continue;
      const preview = URL.createObjectURL(it.file);
      made.push(preview);
      const p = readImageSize(preview);
      sizes.current.set(it.key, p);
      set(it.key, { preview });
      p.then(({ w, h }) => { if (live) set(it.key, { w, h }); });
    }
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { if (!busy) onClose(); };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const back = document.activeElement;
    box.current?.querySelector('select, [data-testid=upload-create]:not([disabled]), .es-foot .btn-text')?.focus();
    const onKey = (e) => {
      if (!box.current || e.isComposing) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const els = [...box.current.querySelectorAll(MODAL_FOCUSABLE)].filter((el) => el.getClientRects().length);
        if (!els.length) return;
        const at = document.activeElement;
        let to = null;
        if (!box.current.contains(at)) to = e.shiftKey ? els[els.length - 1] : els[0];
        else if (e.shiftKey && at === els[0]) to = els[els.length - 1];
        else if (!e.shiftKey && at === els[els.length - 1]) to = els[0];
        if (to) { e.preventDefault(); to.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (back?.isConnected && typeof back.focus === 'function') back.focus();
    };
  }, []);

  const todo = items.filter((it) => it.state === 'ready');
  const create = async () => {
    const group = picked;
    if (!group || !todo.length || busy) return;
    setPhase('busy');
    setError('');
    // One at a time, so the ad's images keep the order the files were chosen in.
    const refs = [];
    for (const [i, it] of todo.entries()) {
      setProgress(`Uploading image ${i + 1} of ${todo.length}…`);
      set(it.key, { state: 'uploading' });
      try {
        const { w, h } = await (sizes.current.get(it.key) || { w: 0, h: 0 });
        const { asset } = await api.uploadAsset(it.file, { kind: 'image', source: 'upload', w, h });
        refs.push({ assetId: asset.id, url: asset.url, w: asset.w || 0, h: asset.h || 0, bytes: asset.bytes || 0, name: asset.name || '' });
        set(it.key, { state: 'done' });
      } catch (e) {
        set(it.key, { state: 'error', error: e.message || 'Upload failed' });
      }
    }
    const stop = (msg) => {
      setPhase('idle');
      setProgress('');
      setError(msg);
    };
    if (!refs.length) return stop('None of the images could be uploaded, so no ad was created');
    setProgress('Creating the ad…');
    let id;
    try {
      ({ id } = await api.addAd('display', group.campaignId, group.id));
    } catch (e) {
      setPhase('done');
      setProgress('');
      setError(`The ad couldn’t be created: ${errorText(e)}. The uploaded images are in your asset library.`);
      return;
    }
    setProgress('Adding the images to the ad…');
    let saved = true;
    try {
      const { creative } = await api.creative(id);
      await api.saveCreative(id, { creative: { ...creative, images: refs } });
    } catch (e) {
      saved = false;
      setError(`The ad was created, but its images couldn’t be added to it: ${errorText(e)}. They are in your asset library.`);
    }
    const all = refs.length === todo.length;
    setPhase('done');
    setProgress(saved ? `Display ad created with ${refs.length} ${refs.length === 1 ? 'image' : 'images'}${all ? '' : `: ${todo.length - refs.length} couldn’t be uploaded`}` : '');
    await onCreated();
    if (saved && all) onClose();
  };

  const shown = (it) => {
    if (it.state === 'error' || it.state === 'skipped') return it.error;
    return UPLOAD_STATE[it.state];
  };
  const camp = (id) => campaigns.find((c) => c.id === id);
  return createPortal(
    <>
      <div className="es-scrim" onClick={close} />
      <div className="es-dialog ud-dialog" role="dialog" aria-modal="true" aria-label="Upload display ads" data-testid="upload-display-dialog" ref={box}>
        <div className="es-head">
          <div>
            <h2>Upload display ads</h2>
            <div className="es-sub">One responsive display ad is created, with these images</div>
          </div>
          <button type="button" className="iconbtn" aria-label="Close" onClick={close} disabled={busy}><Icon name="close" /></button>
        </div>
        <div className="es-body">
          <ul className="ud-files" aria-label="Chosen files">
            {items.map((it) => (
              <li key={it.key} className={`ud-file ${it.state}`} data-state={it.state} data-testid="upload-file">
                {it.preview ? <img src={it.preview} alt="" className="ud-thumb" /> : <span className="ud-thumb ud-none"><Icon name="hide_image" /></span>}
                <span className="ud-info">
                  <span className="ud-name" title={it.file.name}>{it.file.name}</span>
                  <span className="ud-meta">{[it.w && it.h ? `${it.w} × ${it.h}` : '', fmtBytes(it.file.size)].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="ud-state" data-testid="upload-file-state">
                  {it.state === 'done' && <Icon name="check_circle" fill className="ud-ok" />}
                  {it.state === 'error' && <Icon name="error" fill className="ud-bad" />}
                  {shown(it)}
                </span>
              </li>
            ))}
          </ul>
          {groups.length
            ? (
              <label className="es-field">
                <span className="es-label">Ad group</span>
                <select value={picked?.id || ''} onChange={(e) => setGroupId(e.target.value)} aria-label="Ad group" disabled={phase !== 'idle'} data-testid="upload-ad-group">
                  {options.map(({ c, groups: gs }) => (
                    <optgroup key={c.id} label={c.name}>
                      {gs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                {picked && <small className="es-hint">Campaign: {camp(picked.campaignId)?.name}</small>}
              </label>
            )
            : (
              <div className="ud-empty" role="status" data-testid="upload-no-groups">
                There are no ad groups in display campaigns, so there is nowhere to put a display ad. Add a display campaign, or an ad group to one, first.
              </div>
            )}
          {busy && <div className="ud-bar" aria-hidden="true"><span /></div>}
          {progress && <div className="ud-progress" role="status" aria-live="polite" data-testid="upload-progress">{progress}</div>}
          {error && <div className="ud-error" role="alert" data-testid="upload-error">{error}</div>}
        </div>
        <div className="es-foot">
          <button type="button" className="btn-text" onClick={close} disabled={busy}>{phase === 'done' ? 'Close' : 'Cancel'}</button>
          {phase !== 'done' && (
            <button type="button" className="btn-primary" onClick={create} disabled={busy || !groups.length || !todo.length} data-testid="upload-create">
              {busy ? 'Creating…' : 'Create ad'}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// Text a row is found by in the table's search box, per page.
const searchText = {
  ads: (x) => [x.name, x.campaign, x.adGroup, x.adType, ...(x.headlines || [])],
  campaigns: (x) => [x.name, x.type, campaignStatusLabel(x)],
  adgroups: (x) => [x.name, x.campaign, adGroupStatusLabel(x)],
};
// What a column sorts by: what the column shows (on the ads page mostly the row's own field).
function sortValue(level, x, k) {
  if (isMetric(k)) return withDerived(x)[k];
  if (level === 'ads') {
    // Status shows the ad's eligibility; Video its video's title.
    if (k === 'status') return x.eligibility;
    if (k === 'video') return x.videoTitle || null;
    return x[k];
  }
  if (k === 'status') return level === 'campaigns' ? campaignStatusLabel(x) : adGroupStatusLabel(x);
  if (k === 'optScore') return x.optimizationScore;
  if (k === 'campaignType') return x.type;
  if (k === 'groupType') return adGroupType(x, x.campaignType);
  return x[k];
}
// Dates and times follow this device's clock, so the footer names its time zone and current
// offset, e.g. "(GMT+05:30) Asia/Kolkata", or just "this device's time zone" when unknown.
function deviceTimeZone() {
  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* unknown */ }
  if (!zone) return 'this device’s time zone';
  const off = -new Date().getTimezoneOffset();
  const abs = Math.abs(off);
  const gmt = `GMT${off < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `(${gmt}) ${zone}`;
}
// The account alert's numbers (Notifications): all ads, and those that can serve.
const adCounts = (rows) => ({ total: rows.length, eligible: rows.filter((r) => r.eligibility === 'Eligible').length });

// The Campaigns, Ad groups and Ads pages: the same date range, scorecards, chart and table card,
// with the table of that level. scope: { campaignId, adGroupId } narrows the page to one campaign
// (Ad groups, Ads) or one ad group (Ads); the page then shows its status bar instead of the view bars.
// onNavigate(route, { replace }) changes page; linkTo(route) gives a page's address.
export default function AdsPage({ level = 'ads', scope = {}, canEdit, onStatus, onOpenEdit, onOpenAssets, onNavigate, linkTo, hidden = false }) {
  const today = todayISO();
  const campaignId = level === 'campaigns' ? '' : scope.campaignId || '';
  const adGroupId = level === 'ads' && campaignId ? scope.adGroupId || '' : '';
  const scopeKey = `${campaignId}|${adGroupId}`;
  const [range, setRange] = useState(() => presets(today, '2026-01-01').find((p) => p.key === 'last7'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const setToast = useNotify();
  const [cards, setCards] = useState(() => load('ap.cards', ['impressions', 'cost', 'conversions', 'clicks']));
  const [selected, setSelected] = useState(() => load('ap.selected', [0]));
  // Column choices are kept per page.
  const [colsBy, setColsBy] = useState(() => Object.fromEntries(Object.entries(LEVELS).map(([l, d]) => [l, colsFor(l, withClicks(l, load(d.storeKey, d.defaults)))])));
  const cols = colsBy[level];
  const setCols = (next) => setColsBy((c) => ({ ...c, [level]: typeof next === 'function' ? next(c[level]) : next }));
  const [period, setPeriod] = useState('daily');
  // Chart type: lines, or the metrics stacked as areas (remembered like the scorecards).
  const [chartType, setChartType] = useState(() => (load('ap.chartType', 'line') === 'stacked' ? 'stacked' : 'line'));
  const [chartBig, setChartBig] = useState(false);
  const [overviewHidden, setOverviewHidden] = useState(false);
  const [tableFull, setTableFull] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [search, setSearch] = useState(null);
  // View (campaign type, unscoped pages only) and the page's saved filter.
  const [view, setView] = useState('');
  const [savedOn, setSavedOn] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'desc' });
  const [busyCell, setBusyCell] = useState(null);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [dismissed, setDismissed] = useState(() => load('ap.learnDismissed', []));
  // Status filters, per page: { [level]: { campaign|adgroup|ad: ['enabled', 'paused'] } }.
  const [filtersBy, setFiltersBy] = useState({});
  // Layers (rows under their ad group / campaign) and Segment (sub-rows per period or ad format).
  const [layered, setLayered] = useState(false);
  const [segment, setSegment] = useState(null);
  const [segData, setSegData] = useState(null);
  const [segBusy, setSegBusy] = useState(false);
  // Upload display ads (admin, ads page): the file picker, and the images chosen with it.
  const uploadInput = useRef(null);
  const [uploadFiles, setUploadFiles] = useState(null);
  // Another page: its own search, sort, column panel, layers and segments.
  const [shownLevel, setShownLevel] = useState(level);
  if (shownLevel !== level) {
    setShownLevel(level);
    setSearch(null);
    setSort({ key: null, dir: 'desc' });
    setColsOpen(false);
    setSavedOn(false);
    setLayered(false);
    setSegment(null);
  }
  const svgRef = useRef(null);
  const toolbarRef = useRef(null);
  const [condensed, setCondensed] = useState(false);
  // The + button sits on the toolbar's top edge until the toolbar pins under the title bar.
  const [lift, setLift] = useState(false);
  const updateLift = useCallback(() => {
    const tb = toolbarRef.current;
    const title = tb && tb.closest('.page')?.querySelector('.titlebar');
    setLift(!!tb && !!title && tb.getBoundingClientRect().top > title.getBoundingClientRect().bottom + 0.5);
  }, []);
  useEffect(() => {
    const main = document.getElementById('main');
    if (!main) return undefined;
    const on = () => {
      setCondensed(main.scrollTop > 110);
      updateLift();
    };
    main.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', updateLift);
    return () => {
      main.removeEventListener('scroll', on);
      window.removeEventListener('resize', updateLift);
    };
  }, [updateLift]);

  useEffect(() => store('ap.cards', cards), [cards]);
  useEffect(() => store('ap.selected', selected), [selected]);
  useEffect(() => store('ap.chartType', chartType), [chartType]);
  useEffect(() => { for (const [l, d] of Object.entries(LEVELS)) store(d.storeKey, colsBy[l]); }, [colsBy]);

  // A fetch reads the query of the page on screen when it starts, and only the latest fetch's
  // reply is used: a slow reply for another page or date range never lands on this one.
  const query = useRef(null);
  const viewType = campaignId ? '' : view;
  query.current = { from: range.from, to: range.to, campaignId, adGroupId, campaignType: viewType };
  const fetchSeq = useRef(0);
  // The figures on screen (read when a fetch fails).
  const dataRef = useRef(null);
  dataRef.current = data;
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  // The account alert counts every ad, which a scoped page's report leaves out: there it's
  // asked for on its own, when not known yet and after a change made on the page.
  const countsStale = useRef(true);
  const countsSeq = useRef(0);
  const fetchCounts = useCallback(async (from, to) => {
    const n = ++countsSeq.current;
    try {
      const res = await api.report({ from, to });
      if (n === countsSeq.current) statusRef.current?.(adCounts(res.rows));
    } catch {
      if (n === countsSeq.current) countsStale.current = true;
    }
  }, []);
  const fetchData = useCallback(async () => {
    const q = query.current;
    const n = ++fetchSeq.current;
    setLoading(true);
    try {
      const params = { from: q.from, to: q.to };
      if (q.campaignId) params.campaignId = q.campaignId;
      if (q.adGroupId) params.adGroupId = q.adGroupId;
      if (q.campaignType) params.campaignType = q.campaignType;
      const res = await api.report(params);
      if (n !== fetchSeq.current) return;
      // key + view: the scope and the view the reply covers (a view's reply has its ads only);
      // shownRange: its date range.
      setData({ ...res, key: `${q.campaignId}|${q.adGroupId}`, view: q.campaignType || '', shownRange: { from: q.from, to: q.to } });
      if (!q.campaignId && !q.campaignType) {
        // Unscoped: the reply carries every ad, so the counts come from it (see below).
        countsStale.current = false;
        countsSeq.current += 1;
      } else if (countsStale.current) {
        countsStale.current = false;
        fetchCounts(q.from, q.to);
      }
    } catch (e) {
      if (n !== fetchSeq.current) return;
      if (e.status === 401) location.reload();
      else {
        setToast(e.message);
        // A bad campaign / ad group in the address: show the level above instead (other
        // refusals, such as a bad date range, leave the page where it is).
        if (e.status === 400 && q.campaignId && /campaign|ad group/i.test(e.message)) navRef.current(q.adGroupId ? { page: 'adgroups', campaignId: q.campaignId } : { page: 'campaigns' }, { replace: true });
        else {
          // The page still shows the last range's figures: put the date range back to match
          // them, rather than leave them under the new range's dates.
          const shown = dataRef.current;
          const r = shown?.shownRange;
          if (r && shown.key === `${q.campaignId}|${q.adGroupId}` && shown.view === (q.campaignType || '') && (r.from !== q.from || r.to !== q.to)) {
            setRange({ from: r.from, to: r.to });
          }
        }
      }
    } finally {
      if (n === fetchSeq.current) setLoading(false);
    }
  }, [fetchCounts]); // eslint-disable-line react-hooks/exhaustive-deps
  // After a change that can start or stop ads (or a Refresh): the page, and the alert's counts.
  const refresh = useCallback(() => {
    countsStale.current = true;
    return fetchData();
  }, [fetchData]);

  useEffect(() => { fetchData(); }, [range.from, range.to, campaignId, adGroupId, viewType, fetchData]);
  const account = useAccount();
  // (Not while another page, e.g. asset details, is shown over this one.)
  useEffect(() => { if (!hidden) document.title = tabTitle(`${TITLES[level]}-${account.name}-${BRAND.name}`); }, [account.name, level, hidden]);
  // Rail > Create: an open Columns panel makes way for the table and its create menu.
  useEffect(() => {
    const f = () => setColsOpen(false);
    window.addEventListener('app:create-start', f);
    return () => window.removeEventListener('app:create-start', f);
  }, []);
  // Campaign list for the top search, and the account alert (from the unscoped ads).
  useEffect(() => {
    if (!data || !onStatus) return;
    const st = { campaigns: data.campaigns, adGroups: data.adGroups || [] };
    // Only a reply with no scope and no view has every ad of the account.
    if (data.key === '|' && !data.view) Object.assign(st, adCounts(data.rows));
    onStatus(st);
  }, [data, onStatus]);
  useEffect(() => {
    window.addEventListener('app:refresh', refresh);
    return () => window.removeEventListener('app:refresh', refresh);
  }, [refresh]);

  // The data on hand is for this page: same scope and same view (until then nothing is shown,
  // rather than another view's rows and totals under this view's name).
  const ready = !!data && data.key === scopeKey && (data.view || '') === viewType;
  const campaigns = useMemo(() => data?.campaigns || [], [data]);
  // The campaigns of the view (every campaign without one): the campaign picker's list.
  const viewCampaigns = useMemo(() => campaigns.filter((c) => !viewType || c.type === viewType), [campaigns, viewType]);
  const adGroups = useMemo(() => data?.adGroups || [], [data]);
  const campById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const campaign = campaignId ? campById.get(campaignId) : null;
  const adGroup = adGroupId ? adGroups.find((g) => g.id === adGroupId) : null;
  // A campaign / ad group that no longer exists (deleted, or an old address): go one level up.
  useEffect(() => {
    if (!ready) return;
    if (campaignId && !campaign) {
      setToast('That campaign no longer exists');
      onNavigate({ page: 'campaigns' }, { replace: true });
    } else if (adGroupId && !adGroup) {
      setToast('That ad group no longer exists');
      onNavigate({ page: 'adgroups', campaignId }, { replace: true });
    }
  }, [ready, campaignId, adGroupId, campaign, adGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataStart = data?.dataStart || '2026-01-01';
  const presetList = presets(today, dataStart);
  const len = daysBetween(range.from, range.to) + 1;
  const shift = (dir) => {
    const from = addDays(range.from, dir * len);
    const to = addDays(range.to, dir * len);
    if (to > today) return;
    setRange({ from, to });
  };

  // Rows of this page's table: ads, or campaigns / ad groups with their ads' numbers added up.
  const baseRows = useMemo(() => {
    if (!ready) return [];
    if (level === 'ads') return data.rows;
    const by = new Map();
    for (const r of data.rows) {
      const k = level === 'campaigns' ? r.campaignId : r.adGroupId;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    }
    // adCount: a campaign / ad group without ads has nothing to put typed numbers on.
    if (level === 'campaigns') {
      return campaigns.filter((c) => !viewType || c.type === viewType)
        .map((c) => ({ ...c, adCount: (by.get(c.id) || []).length, ...sumRows(by.get(c.id) || []) }));
    }
    return adGroups.filter((g) => (!campaignId || g.campaignId === campaignId) && (!viewType || campById.get(g.campaignId)?.type === viewType)).map((g) => {
      const c = campById.get(g.campaignId);
      return { ...g, campaign: c?.name ?? '', campaignType: c?.type, adCount: (by.get(g.id) || []).length, ...sumRows(by.get(g.id) || []) };
    });
  }, [ready, data, level, campaigns, adGroups, campById, campaignId, viewType]);

  // Status filters on this page: its own status, plus the filter bar's on an unscoped page.
  const groupById = useMemo(() => new Map(adGroups.map((g) => [g.id, g])), [adGroups]);
  const filterOf = (k) => filtersBy[level]?.[k] || ALL_STATUSES;
  const setFilter = (k, v) => setFiltersBy((f) => ({ ...f, [level]: { ...f[level], [k]: v } }));
  const appliedFilters = [...new Set([OWN_FILTER[level], ...(campaignId ? [] : BAR_FILTERS[level])])];

  const rows = useMemo(() => {
    let r = baseRows;
    const statusOf = (k, x) => (k === OWN_FILTER[level] ? x.status
      : k === 'campaign' ? campById.get(x.campaignId)?.status : groupById.get(x.adGroupId)?.status);
    for (const k of [...new Set([OWN_FILTER[level], ...(campaignId ? [] : BAR_FILTERS[level])])]) {
      const keep = filtersBy[level]?.[k];
      if (keep && keep.length < ALL_STATUSES.length) r = r.filter((x) => keep.includes(onOff(statusOf(k, x))));
    }
    if (savedOn) r = r.filter(SAVED_FILTERS[level].keep);
    const q = (search || '').trim().toLowerCase();
    if (q) r = r.filter((x) => searchText[level](x).join(' ').toLowerCase().includes(q));
    if (sort.key) {
      const val = (x) => sortValue(level, x, sort.key);
      r = [...r].sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return sort.dir === 'desc' ? -c : c;
      });
    }
    return r;
  }, [baseRows, search, sort, level, savedOn, filtersBy, campaignId, campById, groupById]);

  // Segment: each ad's numbers per period (from the server) or per ad format (from the rows),
  // added up per table row: Map of row id -> [{ key, label, values }].
  const segKey = `${segment}|${range.from}|${range.to}|${campaignId}|${adGroupId}|${viewType}`;
  useEffect(() => {
    if (!ready || !segment || segment === 'format') return undefined;
    let live = true;
    const q = query.current;
    const key = `${segment}|${q.from}|${q.to}|${q.campaignId}|${q.adGroupId}|${q.campaignType}`;
    setSegBusy(true);
    loadSegments(q, segment)
      .then((list) => { if (live) setSegData({ key, list }); })
      .catch((e) => {
        if (!live) return;
        setToast(e.message);
        setSegment(null);
      })
      .finally(() => { if (live) setSegBusy(false); });
    return () => {
      live = false;
      setSegBusy(false);
    };
  }, [ready, data, segment]); // eslint-disable-line react-hooks/exhaustive-deps
  const segRows = useMemo(() => {
    if (!ready || !segment) return null;
    let list;
    if (segment === 'format') {
      list = data.rows.map((r) => ({ adId: r.id, key: r.adType || r.format, label: r.adType || r.format, ...baseOf(r) }));
    } else {
      if (!segData || segData.key !== segKey) return null;
      list = segData.list.map((s) => ({ ...s, key: s.from, label: periodLabel(segment, s.from, s.to) }));
    }
    const ads = new Map(data.rows.map((r) => [r.id, r]));
    const parentOf = level === 'ads' ? (a) => a.id : level === 'campaigns' ? (a) => a.campaignId : (a) => a.adGroupId;
    const by = new Map();
    for (const s of list) {
      const ad = ads.get(s.adId);
      // A period (or format) with no numbers at all gets no row.
      if (!ad || BASE_METRICS.every((m) => s[m] == null)) continue;
      const id = parentOf(ad);
      if (!by.has(id)) by.set(id, new Map());
      const parts = by.get(id);
      if (!parts.has(s.key)) parts.set(s.key, { key: s.key, label: s.label, list: [] });
      // Format and campaign type feed the video-only and Demand Gen sub-totals.
      parts.get(s.key).list.push({ ...baseOf(s), format: ad.format, campaignType: ad.campaignType });
    }
    const order = segment === 'format' ? (a, b) => a.label.localeCompare(b.label) : (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    return new Map([...by].map(([id, parts]) => [id, [...parts.values()].sort(order).map((p) => ({ key: p.key, label: p.label, values: withDerived(sumRows(p.list)) }))]));
  }, [ready, data, segment, segData, segKey, level]);

  const cur = ready ? withDerived(data.totals.current) : {};
  const prev = ready ? withDerived(data.totals.previous) : {};

  const points = useMemo(() => {
    if (!ready) return [];
    const byDate = new Map(data.series.map((s) => [s.date, s]));
    const buckets = new Map();
    for (const d of eachDay(range.from, range.to)) {
      const k = bucketKey(period, d);
      if (!buckets.has(k)) buckets.set(k, { list: [], from: d, to: d });
      const b = buckets.get(k);
      b.list.push(byDate.get(d) || {});
      b.to = d;
    }
    return [...buckets.entries()].map(([k, { list, from, to }]) => ({
      date: k,
      from,
      to,
      label: bucketLabel(period, k),
      long: period === 'weekly' ? `Week of ${fmtDay(k)}` : period === 'daily' ? `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseISO(k).getDay()]}, ${fmtDay(k)}` : bucketLabel(period, k),
      values: withDerived(sumRows(list)),
    }));
  }, [ready, data, period, range.from, range.to]);

  const chartMetrics = selected.filter((i) => i < cards.length).map((i) => ({ key: cards[i], color: CARD_COLORS[i] }));

  const toggleCard = (i) => {
    setSelected((s) => {
      if (s.includes(i)) return s.length > 1 ? s.filter((x) => x !== i) : s;
      return [...s, i].slice(-4);
    });
  };

  // What the scorecards, chart and the campaign / ad group total cover when typed into.
  const pageScope = adGroupId ? { scope: 'adgroup', adGroupId } : campaignId ? { scope: 'campaign', campaignId } : null;
  // Typed numbers are spread over ads, so a page (or total) with no ads behind it can't take them.
  const hasAds = ready && data.rows.length > 0;
  const totalScope = ready && pageScope
    ? { key: adGroupId ? 'adgroup' : 'campaign', label: adGroupId ? 'Ad group' : 'Campaign', totals: data.totals.current, edit: pageScope, editable: hasAds }
    : null;
  const overviewScope = () => pageScope || { scope: 'view', adIds: data.rows.map((r) => r.id) };
  // The ads behind the rows on screen (the "in your current view" total).
  const viewAdIds = () => {
    if (level === 'ads') return rows.map((r) => r.id);
    const ids = new Set(rows.map((r) => r.id));
    return data.rows.filter((r) => ids.has(level === 'campaigns' ? r.campaignId : r.adGroupId)).map((r) => r.id);
  };

  // Numbers: the server turns any typed value into stored totals; when whole clicks or
  // conversions can't hit the typed value exactly, say what it landed on.
  const report = (r, label) => {
    if (r && r.exact === false && r.after) setToast(`${label} set to the closest possible value: ${r.after}${r.detail ? ` (${r.detail})` : ''}`);
  };
  const onEdit = async (row, metric, text) => {
    setBusyCell(`${row.id}:${metric}`);
    try {
      report(await api.edit(row.id, { metric, value: text, from: range.from, to: range.to }), METRICS[metric].label);
      await fetchData();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusyCell(null);
    }
  };
  // A campaign / ad group row's number: spread over that campaign's / ad group's ads.
  const onEditEntity = async (row, metric, text) => {
    setBusyCell(`${row.id}:${metric}`);
    try {
      const target = level === 'campaigns' ? { scope: 'campaign', campaignId: row.id } : { scope: 'adgroup', adGroupId: row.id };
      report(await api.editTotal({ from: range.from, to: range.to, ...target, metric, value: text }), METRICS[metric].label);
      await fetchData();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusyCell(null);
    }
  };
  const onEditTotal = async (target, metric, text) => {
    setLoading(true);
    try {
      report(await api.editTotal({ from: range.from, to: range.to, ...target, metric, value: text }), METRICS[metric].label);
      await fetchData();
    } catch (e) {
      setToast(e.message);
      setLoading(false);
    }
  };
  // Total rows: "in your current view" covers the ads behind the rows on screen.
  const onEditTableTotal = (target, metric, text) => {
    if (target.scope !== 'view') return onEditTotal(target, metric, text);
    const adIds = viewAdIds();
    if (!adIds.length) return setToast('There are no ads in this view');
    return onEditTotal({ scope: 'view', adIds }, metric, text);
  };
  // Text and settings on ads, campaigns and ad groups.
  const onField = async (kind, id, body) => {
    try {
      if (kind === 'ad') await api.editAd(id, body);
      else if (kind === 'campaign') await api.editCampaign(id, body.field, body.value);
      else if (kind === 'adgroup') await api.editAdGroup(id, body.field, body.value);
      await refresh();
    } catch (e) {
      setToast(e.message);
    }
  };
  // Settings dialog: one change after another; stops at the first one the server refuses.
  const onSaveSettings = async (kind, id, changes) => {
    let ok = true;
    try {
      for (const [field, value] of changes) {
        if (kind === 'campaign') await api.editCampaign(id, field, value);
        else await api.editAdGroup(id, field, value);
      }
      setToast(kind === 'campaign' ? 'Campaign settings saved' : 'Ad group settings saved');
    } catch (e) {
      setToast(e.message);
      ok = false;
    }
    await refresh();
    return ok;
  };

  // (For read-only users these actions simply do nothing.)
  const guard = (fn) => (...args) => (canEdit ? fn(...args) : undefined);
  // Admin: add a new ad row (into this ad group / campaign, else the first campaign of that type).
  const onAddAd = guard(async (kind) => {
    setLoading(true);
    try {
      await api.addAd(kind, campaignId, adGroupId);
      setSearch(null);
      await refresh();
      setToast('Ad added - double-click its text and numbers to fill it in');
    } catch (e) {
      setToast(e.message);
      setLoading(false);
    }
  });
  // Admin: Upload display ads. The images picked here open the dialog that makes the ad.
  const pickDisplayUploads = guard(() => uploadInput.current?.click());
  const onDisplayAdCreated = async () => {
    setSearch(null);
    await refresh();
    setToast('Display ad created');
  };
  const onAddCampaign = guard(async (type) => {
    setLoading(true);
    try {
      await api.addCampaign({ type });
      setSearch(null);
      await refresh();
      setToast('Campaign added - double-click its name and budget to change them. Its numbers can be set once it has an ad');
    } catch (e) {
      setToast(e.message);
      setLoading(false);
    }
  });
  const onAddAdGroup = guard(async (cid) => {
    setLoading(true);
    try {
      await api.addAdGroup({ campaignId: cid });
      setSearch(null);
      await fetchData();
      setToast('Ad group added - double-click its name to change it. Its numbers can be set once it has an ad');
    } catch (e) {
      setToast(e.message);
      setLoading(false);
    }
  });
  // Deleting rows (after a confirm): ads, or campaigns / ad groups with everything in them.
  const deleter = (call, one, many, warn) => async (ids) => {
    const single = ids.length === 1;
    if (!window.confirm(`Delete ${single ? `this ${one}` : `these ${ids.length} ${many}`}? ${warn(single)} This can't be undone.`)) return false;
    setLoading(true);
    try {
      const r = await call(ids);
      await refresh();
      setToast(r.deleted === 1 ? `${one[0].toUpperCase()}${one.slice(1)} deleted` : `${r.deleted} ${many} deleted`);
      return true;
    } catch (e) {
      setToast(e.message);
      setLoading(false);
      return false;
    }
  };
  const onDeleteAds = deleter(api.deleteAds, 'ad', 'ads', (s) => `${s ? 'Its' : 'Their'} numbers and media are removed too.`);
  const onDeleteCampaigns = deleter(api.deleteCampaigns, 'campaign', 'campaigns', (s) => `${s ? 'Its' : 'Their'} ad groups, ads and numbers are removed too.`);
  const onDeleteAdGroups = deleter(api.deleteAdGroups, 'ad group', 'ad groups', (s) => `${s ? 'Its' : 'Their'} ads and numbers are removed too.`);

  const onUpload = async (row, file) => {
    setBusyCell(`${row.id}:media`);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('media', file);
      const r = await fetch(`/api/ads/${row.id}/media`, { method: 'POST', body: fd, credentials: 'same-origin' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Upload failed');
      await fetchData();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusyCell(null);
      setLoading(false);
    }
  };

  const downloadChart = (type) => {
    if (type === 'csv') {
      const head = ['Date', ...chartMetrics.map((m) => METRICS[m.key].label)];
      const lines = points.map((p) => [p.label, ...chartMetrics.map((m) => formatValue(m.key, p.values[m.key]))].map(csvCell).join(','));
      download('chart.csv', [head.join(','), ...lines].join('\n'), 'text/csv');
      return;
    }
    const svg = svgRef.current;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = svg.width.baseVal.value * 2;
      c.height = svg.height.baseVal.value * 2;
      const ctx = c.getContext('2d');
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      c.toBlob((b) => download('chart.png', b));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  };

  const downloadTable = () => {
    const cell = (r, v, k) => {
      if (isMetric(k)) return formatValue(k, v[k]);
      if (k === 'optScore') return formatScore(r.optimizationScore);
      if (k === 'campaignType') return level === 'campaigns' ? r.type : r.campaignType;
      if (k === 'targetCpa') return formatValue('cost', r.targetCpa);
      if (k === 'groupType') return adGroupType(r, r.campaignType);
      // The Video column shows the ad's video title (ad rows have no `video` field).
      if (k === 'video') return r.videoTitle ?? '';
      return r[k] ?? '';
    };
    const lead = {
      ads: [['Ad', 'Campaign', 'Ad group', 'Status'], (r) => [r.name, r.campaign, r.adGroup, r.eligibility], 'Ads in your current view'],
      campaigns: [['Campaign', 'Budget', 'Status'], (r) => [r.name, perDay(r.budget), campaignStatusLabel(r)], 'All but removed campaigns in your current view'],
      adgroups: [['Ad group', 'Campaign', 'Status'], (r) => [r.name, r.campaign, adGroupStatusLabel(r)], 'All but removed ad groups in your current view'],
    }[level];
    const pad = lead[0].slice(1).map(() => '');
    const totalLine = (label, t) => [`Total: ${label}`, ...pad, ...cols.map((k) => (isMetric(k) ? formatValue(k, withDerived(t)[k]) : ''))];
    const out = [[...lead[0], ...cols.map(colLabel)], ...rows.map((r) => [...lead[1](r), ...cols.map((k) => cell(r, withDerived(r), k))])];
    out.push(totalLine(lead[2], sumRows(rows)));
    if (totalScope) out.push(totalLine(totalScope.label, totalScope.totals));
    out.push(totalLine('Account', data.totals.account));
    download(`${level}.csv`, out.map((l) => l.map(csvCell).join(',')).join('\n'), 'text/csv');
  };

  const showOverview = !overviewHidden && !tableFull;
  const periodOk = (min) => len >= min;
  // No-conversions card: the first enabled campaign with no conversions in the date range (until
  // dismissed). It says only that: no learning-phase data exists, so it claims none.
  const learning = level === 'campaigns' && ready && !tableFull
    ? baseRows.find((c) => c.status !== 'paused' && !(c.conversions > 0) && !dismissed.includes(c.id))
    : null;
  useLayoutEffect(updateLift, [updateLift, showOverview, chartBig, colsOpen, tableFull, data, level, learning]);
  const dismissLearning = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    store('ap.learnDismissed', next);
  };

  // Where campaign / ad group names lead.
  const go = (route) => ({ href: linkTo(route), open: () => onNavigate(route) });
  const links = {
    campaign: (x) => go({ page: 'adgroups', campaignId: x.campaignId ?? x.id }),
    adGroup: (x) => go({ page: 'ads', campaignId: x.campaignId, adGroupId: x.adGroupId ?? x.id }),
  };
  const openSettings = (kind, entity) => setSettings({ kind, id: entity.id });
  const settingsEntity = settings && (settings.kind === 'campaign' ? campById.get(settings.id) : adGroups.find((g) => g.id === settings.id));
  const scoped = !!campaignId;
  const lockedCols = level === 'campaigns' ? LEVELS.campaigns.locked
    : level === 'adgroups' ? ['Ad group', !scoped && 'Campaign', 'Status'].filter(Boolean)
      : ['Ad', !scoped && 'Campaign', !adGroupId && 'Ad group', 'Status'].filter(Boolean);
  const pickCampaign = (page) => (id) => onNavigate(id ? { page, campaignId: id } : { page: page === 'adgroups' && level === 'campaigns' ? 'campaigns' : page });
  const noun = { ads: 'ads', campaigns: 'campaigns', adgroups: 'ad groups' }[level];
  // "View (N filters)": the filters of the view, i.e. the chips in the filter bar.
  const viewCount = BAR_FILTERS[level].length;
  const viewFilters = `View (${viewCount} ${viewCount === 1 ? 'filter' : 'filters'})`;
  // Chips over the table (their count is the funnel's badge): the page's own status where the
  // filter bar doesn't show it, and the saved filter.
  const tableFilters = level === 'ads' ? ['ad'] : level === 'adgroups' && scoped ? ['adgroup'] : [];
  const tableFilterCount = tableFilters.length + (savedOn ? 1 : 0);
  // Asks Advisor how to get that campaign converting (the shell opens Advisor with the question).
  const askOptimize = (c) => window.dispatchEvent(new CustomEvent('app:ask', { detail: { question: `How can I optimize ${c.name}?` } }));

  const createMenu = (close) => {
    if (level === 'campaigns') {
      return (
        <div className="menu create-menu">
          <SubMenu label="New campaign" side="right">
            {CAMPAIGN_TYPES.map((t) => (
              <MenuItem key={t} onClick={() => { close(); onAddCampaign(t); }}><Icon name={TYPE_ICON[t]} className="mi-icon" />{t} campaign</MenuItem>
            ))}
          </SubMenu>
        </div>
      );
    }
    if (level === 'adgroups') {
      return (
        <div className="menu create-menu">
          {campaignId
            ? <MenuItem icon="add" onClick={() => { close(); onAddAdGroup(campaignId); }}>New ad group</MenuItem>
            : (
              <SubMenu label="New ad group" side="right">
                <div className="menu-title">Add it to campaign</div>
                {campaigns.map((c) => (
                  <MenuItem key={c.id} onClick={() => { close(); onAddAdGroup(c.id); }}><Icon name={TYPE_ICON[c.type] || 'campaign'} className="mi-icon" />{c.name}</MenuItem>
                ))}
              </SubMenu>
            )}
        </div>
      );
    }
    return (
      <div className="menu create-menu">
        {NEW_ADS.map(([kind, l, tip]) => (
          <MenuItem key={l} icon="add" data-tip={tip} onClick={() => { close(); onAddAd(kind); }}>{l}</MenuItem>
        ))}
        <div className="menu-sep" />
        <UnavailableItem icon="add" label="Ad variation" />
        <div className="menu-sep" />
        <MenuItem icon="upload" data-tip="Create a display ad from image files you upload" onClick={() => { close(); pickDisplayUploads(); }} data-testid="upload-display-ads">Upload display ads</MenuItem>
      </div>
    );
  };

  const table = () => {
    // (The type totals show on unscoped pages, where data.rows holds every ad.)
    const byType = (data.totals.byType || []).map((t) => ({ ...t, editable: data.rows.some((r) => r.campaignType === t.type) }));
    const common = {
      rows, account: data.totals.account, byType, cols, canEdit, onField, busyCell, links, segments: segRows,
      onEditTotal: onEditTableTotal, onHideColumn: (k) => setCols((c) => c.filter((x) => x !== k)),
      sort, onSort: (k) => setSort((s) => ({ key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc' })),
    };
    if (level === 'campaigns') {
      // allRows: every campaign of the account, for the "Total: Account" budget (not just the view's).
      return <CampaignsTable {...common} allRows={campaigns} onEditMetric={onEditEntity} onDelete={canEdit ? onDeleteCampaigns : undefined} onSettings={(c) => openSettings('campaign', c)} />;
    }
    if (level === 'adgroups') {
      return <AdGroupsTable {...common} scope={totalScope} onEditMetric={onEditEntity} onDelete={canEdit ? onDeleteAdGroups : undefined} onSettings={(g) => openSettings('adgroup', g)} layered={scoped && layered} />;
    }
    return <AdsTable {...common} allRows={baseRows} scope={totalScope} onEdit={onEdit} onUpload={onUpload} onDelete={canEdit ? onDeleteAds : undefined} onOpenEdit={onOpenEdit} onOpenAssets={onOpenAssets} layered={scoped && layered} />;
  };

  return (
    <div className="page" data-level={level}>
      {(loading || segBusy) && <div className="progress"><span /></div>}
      {!tableFull && scoped && (
        adGroup
          ? <AdGroupBar g={adGroup} campaign={campaign} canEdit={canEdit} onField={onField} onSettings={() => openSettings('adgroup', adGroup)} />
          : campaign && !adGroupId
            ? <CampaignBar c={campaign} canEdit={canEdit} onField={onField} onSettings={() => openSettings('campaign', campaign)} />
            : <div className="ent-bar" />
      )}
      {!tableFull && !scoped && (
        <>
          <div className="viewbar">
            <Dropdown trigger={(open, toggle) => (
              <button className="viewsel active-under" onClick={toggle} aria-expanded={open}>
                <span className="vs-small" data-testid="view-filters">{viewFilters}</span>
                <span className="vs-main" data-testid="view-label"><ViewLabel type={viewType} /></span>
                <Icon name="arrow_drop_down" className="vs-caret" />
              </button>
            )}>
              {(close) => <ViewPanel close={close} view={viewType} types={[...new Set(campaigns.map((c) => c.type))]} onPick={setView} />}
            </Dropdown>
            <Dropdown panelClass="camp-pop" trigger={(open, toggle) => (
              <button className="viewsel" onClick={toggle} data-testid="campaign-select" aria-expanded={open}>
                <span className="vs-small" data-testid="campaign-count">Campaigns ({viewCampaigns.length})</span>
                <span className="vs-main">Select a campaign</span>
                <Icon name="arrow_drop_down" className="vs-caret" />
              </button>
            )}>
              {(close) => <CampaignPanel campaigns={viewCampaigns} campaignId="" onPick={(id) => { close(); pickCampaign(level === 'ads' ? 'ads' : 'adgroups')(id); }} />}
            </Dropdown>
          </div>
          <div className="filterbar">
            <span className="fb-label">Filters</span>
            {BAR_FILTERS[level].map((k) => <StatusChip key={k} k={k} value={filterOf(k)} onApply={setFilter} />)}
            {/* The status filters of the bar can be changed from here too; the other fields can't be filtered on yet. */}
            <Dropdown trigger={(open, toggle) => <button className="add-filter" onClick={toggle} aria-expanded={open} data-testid="bar-add-filter">Add filter</button>}>
              {(close) => (
                <FilterMenu keys={BAR_FILTERS[level]} valueOf={filterOf} onApply={setFilter} close={close} testId="bar-filter-menu"
                  unavailable={['Bid strategy name', 'Bid strategy type', 'Campaign label', 'Campaign name']} />
              )}
            </Dropdown>
            <span className="spacer" />
            <UnavailableButton>
              <ToolBtn icon="save" label="Save" className="save-btn" />
            </UnavailableButton>
          </div>
        </>
      )}
      <div className={`titlebar ${condensed ? 'condensed' : ''}`}>
        <h1>{TITLES[level]}</h1>
        {scoped && !adGroupId && (
          <ScopeChip small="Campaign" icon={TYPE_ICON[campaign?.type] || 'campaign'} name={campaign?.name || '…'}>
            {(close) => <CampaignPanel campaigns={campaigns} campaignId={campaignId} onPick={(id) => { close(); pickCampaign(level)(id); }} />}
          </ScopeChip>
        )}
        {adGroupId && (
          <ScopeChip small="Ad group" name={adGroup?.name || '…'}>
            {(close) => (
              <AdGroupPanel campaign={campaign} groups={adGroups.filter((g) => g.campaignId === campaignId)} adGroupId={adGroupId}
                onPick={(id) => { close(); onNavigate({ page: 'ads', campaignId, adGroupId: id }); }} />
            )}
          </ScopeChip>
        )}
        {condensed && !scoped && (
          <button className="viewsel mini" onClick={() => document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span className="vs-small">{viewFilters}</span>
            <span className="vs-main"><ViewLabel type={viewType} /></span>
          </button>
        )}
        <span className="spacer" />
        <span className="preset-label" data-testid="preset-label">{rangeLabel(range, presetList)}</span>
        <DatePicker range={range} today={today} dataStart={dataStart} onChange={setRange} />
        <button className="iconbtn arrow" onClick={() => shift(-1)} aria-label="Previous period"><Icon name="chevron_left" /></button>
        <button className="iconbtn arrow" onClick={() => shift(1)} disabled={addDays(range.to, len) > today} aria-label="Next period"><Icon name="chevron_right" /></button>
        <button className="link-btn" onClick={() => setRange(presetList.find((p) => p.key === (rangeLabel(range, presetList) === 'Last 30 days' ? 'last7' : 'last30')))}>
          {rangeLabel(range, presetList) === 'Last 30 days' ? 'Show last 7 days' : 'Show last 30 days'}
        </button>
      </div>

      {colsOpen && <ColumnsPanel level={level} locked={lockedCols} cols={cols} onApply={(c) => { setCols(c); setColsOpen(false); }} onCancel={() => setColsOpen(false)} />}

      {showOverview && !colsOpen && (
        <section className="card overview">
          <div className="sc-row">
            <ScoreStrip count={cards.length}>
              {cards.map((m, i) => (
                <Scorecard key={i} metric={m} value={cur[m]} prev={prev[m]} color={CARD_COLORS[i]} ink={CARD_INK[i]} selected={selected.includes(i)}
                  onEditValue={canEdit && hasAds && EDITABLE.has(m) ? (t) => onEditTotal(overviewScope(), m, t) : undefined}
                  onEditPrev={canEdit && hasAds && EDITABLE.has(m) ? (t) => onEditTotal({ ...overviewScope(), from: data.previousRange.from, to: data.previousRange.to }, m, t) : undefined}
                  onError={setToast}
                  onClick={() => toggleCard(i)} onPick={(nm) => setCards((c) => c.map((x, j) => (j === i ? nm : x)))} />
              ))}
            </ScoreStrip>
            <div className="sc-tools">
              <ToolBtn icon="add_chart" label="Metrics" active={metricsOpen} onClick={() => setMetricsOpen(true)} />
              <Dropdown align="center" trigger={(open, toggle) => <ToolBtn icon="tune" label="Adjust" active={open} onClick={toggle} />}>
                {(close) => (
                  <div className="menu">
                    <SubMenu label="Time period" side="right">
                      {PERIODS.map(([k, label, min]) => (
                        <MenuItem key={k} selected={period === k} disabled={!periodOk(min)} onClick={() => { setPeriod(k); close(); }}>{label}</MenuItem>
                      ))}
                    </SubMenu>
                    <SubMenu label="Chart type">
                      <MenuItem icon="show_chart" selected={chartType === 'line'} onClick={() => { setChartType('line'); close(); }}>Time series chart</MenuItem>
                      <MenuItem icon="stacked_line_chart" selected={chartType === 'stacked'} onClick={() => { setChartType('stacked'); close(); }}>Stacked time series chart</MenuItem>
                    </SubMenu>
                  </div>
                )}
              </Dropdown>
              <Dropdown align="center" trigger={(open, toggle) => <ToolBtn icon="download" label="Download" active={open} onClick={toggle} />}>
                {(close) => (
                  <div className="menu narrow">
                    <MenuItem onClick={() => { downloadChart('csv'); close(); }}>.csv</MenuItem>
                    <MenuItem onClick={() => { downloadChart('png'); close(); }}>.png</MenuItem>
                  </div>
                )}
              </Dropdown>
              <ToolBtn icon={chartBig ? 'fullscreen_exit' : 'fullscreen'} label={chartBig ? 'Collapse' : 'Expand'} onClick={() => setChartBig((b) => !b)} />
            </div>
          </div>
          <Chart ref={svgRef} points={points} metrics={chartMetrics} height={chartBig ? 258 : 200} weekends={period === 'daily'} stacked={chartType === 'stacked'}
            canEdit={canEdit && hasAds} onEditPoint={(p, m, t) => onEditTotal({ ...overviewScope(), from: p.from, to: p.to }, m, t)} />
        </section>
      )}

      {metricsOpen && createPortal(
        <MetricsPanel cards={cards} onCancel={() => setMetricsOpen(false)} onApply={(next) => {
          setCards(next);
          setSelected((s) => { const f = s.filter((i) => i < next.length); return f.length ? f : [0]; });
          setMetricsOpen(false);
        }} />,
        document.body,
      )}

      {learning && !colsOpen && (
        <LearningCard campaign={learning} onDismiss={() => dismissLearning(learning.id)} onOptimize={() => askOptimize(learning)} />
      )}

      {!colsOpen && (
        <section className="card tablecard">
          <div className={`table-toolbar ${lift && !learning ? 'lift' : ''}`} ref={toolbarRef}>
            <Dropdown trigger={(open, toggle) => {
              const label = level === 'ads' ? 'Create ad' : level === 'campaigns' ? 'Create campaign' : 'Create ad group';
              return <button className="fab" aria-label={label} data-tip={open ? undefined : label} onClick={toggle}><Icon name="add" /></button>;
            }}>
              {createMenu}
            </Dropdown>
            <Dropdown trigger={(open, toggle) => (
              <button className={`filter-ic ${tableFilterCount ? '' : 'idle'}`} onClick={toggle} aria-label="Filters" aria-expanded={open} data-testid="filter-funnel">
                <Icon name="filter_alt" />{tableFilterCount > 0 && <span className="badge">{tableFilterCount}</span>}
              </button>
            )}>
              {(close) => <FilterMenu keys={appliedFilters} valueOf={filterOf} onApply={setFilter} close={close} />}
            </Dropdown>
            {search == null ? (
              <>
                {tableFilters.map((k) => <StatusChip key={k} k={k} value={filterOf(k)} onApply={setFilter} className="chip toolbar-chip" />)}
                {savedOn && (
                  <span className="chip toolbar-chip saved-chip" data-testid="saved-filter-chip">
                    {SAVED_FILTERS[level].label}
                    <button type="button" className="iconbtn xs" aria-label="Remove filter" onClick={() => setSavedOn(false)}><Icon name="close" /></button>
                  </span>
                )}
                <Dropdown trigger={(open, toggle) => <button className="add-filter big" onClick={toggle}>Add filter</button>}>
                  {(close) => (
                    <div className="menu filter-search">
                      <div className="fs-input">
                        <input placeholder="Search" autoFocus value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} aria-label="Search filters" />
                        <Icon name="search" />
                      </div>
                      {(() => {
                        const fq = filterQuery.trim().toLowerCase();
                        const has = (t) => !fq || t.toLowerCase().includes(fq);
                        const saved = SAVED_FILTERS[level].label;
                        const groups = ['Performance', 'Viewability', 'Conversions', 'Attribution', 'Attributes', 'Analytics', 'Call details', 'Message details'].filter(has);
                        return (
                          <>
                            {has(saved) && <div className="menu-title">Saved filters</div>}
                            {has(saved) && <MenuItem selected={savedOn} onClick={() => { close(); setFilterQuery(''); setSavedOn(true); }}>{saved}</MenuItem>}
                            {has(saved) && groups.length > 0 && <div className="menu-sep" />}
                            {groups.map((s) => <UnavailableItem key={s} label={s} />)}
                            {!has(saved) && !groups.length && <div className="menu-empty muted">No filters match</div>}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </Dropdown>
              </>
            ) : (
              <label className="find-ads">
                <Icon name="search" />
                <input autoFocus placeholder={`Find ${noun}`} value={search} onChange={(e) => setSearch(e.target.value)} data-testid={level === 'ads' ? 'find-ads' : 'find-rows'} />
                <button className="iconbtn sm" onClick={() => setSearch(null)} aria-label="Clear search"><Icon name="close" /></button>
              </label>
            )}
            <span className="spacer" />
            <ToolBtn icon="search" label="Search" onClick={() => setSearch((s) => (s == null ? '' : null))} active={search != null} />
            {scoped && (
              <Dropdown align="right" trigger={(open, toggle) => <ToolBtn icon="layers" label="Layers" active={open || layered} onClick={toggle} />}>
                {(close) => (
                  <div className="menu segment-menu">
                    <div className="menu-title">Show layers</div>
                    <MenuItem selected={!layered} onClick={() => { setLayered(false); close(); }}>None</MenuItem>
                    <MenuItem selected={layered} onClick={() => { setLayered(true); close(); }}>{level === 'ads' ? 'Ad group' : 'Campaign'}</MenuItem>
                  </div>
                )}
              </Dropdown>
            )}
            <Dropdown align="right" trigger={(open, toggle) => <ToolBtn icon="segment" label="Segment" active={open || !!segment} onClick={toggle} />}>
              {(close) => (
                <div className="menu segment-menu">
                  <div className="menu-title">Segment</div>
                  <MenuItem selected={!segment} onClick={() => { setSegment(null); close(); }}>None</MenuItem>
                  <SubMenu label="Time">
                    {SEGMENT_TIMES.map(([k, l]) => (
                      <MenuItem key={k} selected={segment === k} onClick={() => { setSegment(k); close(); }}>{l}</MenuItem>
                    ))}
                  </SubMenu>
                  {[['Click type'], ['Conversions', true], ['Device'], ['Network (with search partners)'], ['Top vs. Other'], ['Ad destination'], ['Keyword text']].map(([l, sub]) => (
                    <MenuItem key={l} sub={sub}>{l}</MenuItem>
                  ))}
                  <MenuItem selected={segment === 'format'} onClick={() => { setSegment('format'); close(); }}>Ad format</MenuItem>
                </div>
              )}
            </Dropdown>
            <ToolBtn icon="view_column" label="Columns" onClick={() => setColsOpen(true)} />
            <UnavailableButton>
              <ToolBtn icon="insert_chart" label="Reports" />
            </UnavailableButton>
            <Dropdown align="right" trigger={(open, toggle) => <ToolBtn icon="download" label="Download" active={open} onClick={toggle} />}>
              {(close) => <div className="menu narrow"><MenuItem onClick={() => { if (ready) downloadTable(); close(); }}>.csv</MenuItem></div>}
            </Dropdown>
            <ToolBtn icon={tableFull ? 'fullscreen_exit' : 'fullscreen'} label={tableFull ? 'Collapse' : 'Expand'} onClick={() => setTableFull((f) => !f)} />
            <Dropdown align="right" trigger={(open, toggle) => <ToolBtn icon="more_vert" label="More" active={open} onClick={toggle} />}>
              {(close) => <div className="menu"><MenuItem onClick={() => { refresh(); close(); }}>Refresh data</MenuItem><MenuItem onClick={() => { setCols(LEVELS[level].defaults); close(); }}>Reset columns</MenuItem></div>}
            </Dropdown>
            <span className="vsep tall" />
            <button className="iconbtn chart-toggle" aria-label={overviewHidden ? 'Show chart' : 'Hide chart'} data-tip={overviewHidden ? 'Show chart' : 'Hide chart'} onClick={() => setOverviewHidden((h) => !h)}>
              <Icon name={overviewHidden ? 'expand_more' : 'expand_less'} />
            </button>
          </div>
          {ready && table()}
          <div className="pager">
            <span>{rows.length ? `1 - ${rows.length} of ${rows.length}` : '0 of 0'}</span>
          </div>
        </section>
      )}

      {settings && settingsEntity && (
        <EntitySettings key={`${settings.kind}:${settings.id}`} kind={settings.kind} entity={settingsEntity} canEdit={canEdit}
          campaign={settings.kind === 'adgroup' ? campById.get(settingsEntity.campaignId) : null}
          onSave={(changes) => onSaveSettings(settings.kind, settings.id, changes)} onClose={() => setSettings(null)} />
      )}

      {canEdit && level === 'ads' && (
        <input ref={uploadInput} type="file" multiple hidden accept={UPLOAD_ACCEPT} data-testid="upload-display-input"
          onChange={(e) => {
            const files = [...(e.target.files || [])];
            e.target.value = '';
            if (files.length) setUploadFiles(files);
          }} />
      )}
      {canEdit && uploadFiles && (
        <UploadDisplayDialog files={uploadFiles} campaigns={campaigns} adGroups={adGroups} campaignId={campaignId} adGroupId={adGroupId}
          onClose={() => setUploadFiles(null)} onCreated={onDisplayAdCreated} />
      )}

      <footer className="page-foot">
        {/* Each line's text is one piece, so an admin's double-tap edit changes the whole sentence. */}
        <p data-slot="foot-1"><HelpLink topic="reporting-delay">Reporting is not real-time.</HelpLink>{` Time zone for all dates and times: ${deviceTimeZone()}. `}<HelpLink topic="time-zone" /></p>
        <p data-slot="foot-2">{`All data shown in this demo is sample data. Columns that are calculated: ${['ctr', 'avgCpc', 'avgCpm', 'convRate', 'costPerConv'].map((k) => `${METRICS[k].label} = ${METRICS[k].formula}`).join('; ')}.`}</p>
        <p data-slot="foot-3">{`© ${BRAND.name}, 2026.`}</p>
      </footer>
    </div>
  );
}
