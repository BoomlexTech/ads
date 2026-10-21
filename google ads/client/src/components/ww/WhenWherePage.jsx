import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAccount, useNotify } from '../../account.js';
import { HelpLink } from '../Common.jsx';
import { presets } from '../DatePicker.jsx';
import { BRAND, tabTitle } from '../../../../shared/brand.js';
import { todayISO, daysBetween, fmtRange, parseISO } from '../../../../shared/dates.js';
import {
  WW_TITLE, WW_TABS, WW_TABLES, WW_DATA_START, WW_CURRENCY, WW_TOTAL_HELP, CAMPAIGN_TYPES, DAYS, tabOf, tabOfPage,
  deriveWw, sumWw, viewSums, hourLabel, colLabelWw, fmtWw, fmtBidAdj, fmtAdGroupBidAdj, isWwMetric, sectionItems,
} from '../../../../shared/whenwhere.js';
import { WwViewBar, WwFilterBar, WwTitleBar, WwTabs } from './WwHeader.jsx';
import WwChart from './WwChart.jsx';
import WwToolbar from './WwToolbar.jsx';
import WwGrid from './WwGrid.jsx';
import WwColumns from './WwColumns.jsx';
import { WwAddRow, WwAddCampaign } from './WwAddRow.jsx';
import { exportTable } from './wwExport.js';
import './ww-page.css';

// Insights and reports > When and where ads showed: Devices, When ads showed, Where ads showed and
// Matched locations. Its figures live in their own collections (server/whenwhere.js); nothing here
// reads or changes the Ads section's data.

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage off */ }
}

// "(GMT+05:30) India Standard Time", from this device's clock (its zone id when it has no name).
function deviceTimeZone() {
  try {
    const long = new Intl.DateTimeFormat('en-US', { timeZoneName: 'long' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName')?.value;
    const name = long && !/^GMT/.test(long) ? long : Intl.DateTimeFormat().resolvedOptions().timeZone;
    const off = -new Date().getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
    const mm = String(Math.abs(off) % 60).padStart(2, '0');
    return name ? `(GMT${sign}${hh}:${mm}) ${name}` : 'this device’s time zone';
  } catch {
    return 'this device’s time zone';
  }
}

const PERIOD_MIN = { daily: 1, weekly: 14, monthly: 60, quarterly: 180, yearly: 730 };
const STATUS_OK = { all: () => true, enabled: (s) => s === 'enabled', enabledPaused: (s) => s === 'enabled' || s === 'paused' };

// A WwRow (or several, added up) as the table shows it: base figures + view sums -> every column.
// No rows at all (a campaign type without figures) still shows zeros, not dashes.
const ZERO_ROW = { impressions: 0, interactions: 0, clicks: 0, views: 0, cost: 0, conversions: 0 };
function figuresOf(list, typeOf) {
  const parts = (list.length ? list : [ZERO_ROW]).map((r) => ({ ...r, ...viewSums(r, typeOf(r)) }));
  return deriveWw(sumWw(parts));
}
// What the Interactions figure counts: "clicks", "engagements" (interactions that aren't clicks) or both.
function wordsOf(values) {
  const i = values.interactions || 0;
  const c = values.clicks || 0;
  if (!i) return '';
  return [c > 0 && 'clicks', i > c && 'engagements'].filter(Boolean).join(', ');
}

// Period segments (Segment > Time): label of one period.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function segLabel(kind, s) {
  if (kind === 'dow') return DAYS[s.key];
  const d = parseISO(s.from);
  if (kind === 'week') return `Week of ${fmtRange(s.from, s.from)}`;
  if (kind === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (kind === 'quarter') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  if (kind === 'year') return String(d.getFullYear());
  return fmtRange(s.from, s.to);
}

// Each display row's segment rows, from the report's per-row periods. A Day of the week part
// spans the whole range, so it carries its weekday: an edit there changes only that weekday's days.
function buildSegments(kind, list, displayRows, baseRows, typeOf) {
  const byRow = new Map();
  for (const s of list) {
    if (!byRow.has(s.rowId)) byRow.set(s.rowId, []);
    byRow.get(s.rowId).push(s);
  }
  const campaignOf = new Map(baseRows.map((b) => [b.id, b.campaignId]));
  const out = {};
  for (const r of displayRows) {
    const parts = new Map();
    for (const id of r.rowIds) {
      for (const s of byRow.get(id) || []) {
        const k = String(s.key ?? s.from);
        if (!parts.has(k)) parts.set(k, { key: k, from: s.from, to: s.to, list: [], src: s });
        parts.get(k).list.push({ ...s, campaignId: campaignOf.get(id) });
      }
    }
    out[r.key] = [...parts.values()].sort((a, b) => (kind === 'dow' ? Number(a.key) - Number(b.key) : a.from.localeCompare(b.from)))
      .map((p) => {
        const values = figuresOf(p.list, typeOf);
        return { key: p.key, from: p.from, to: p.to, dow: kind === 'dow' ? Number(p.key) : null, label: segLabel(kind, p.src), values, words: wordsOf(values) };
      });
  }
  return out;
}

// The recommended columns of a tab ("Show recommended columns in your tables").
const recOf = (t) => (WW_TABLES[t].sections.includes('recommended') ? sectionItems(t, 'recommended') : []);

export default function WhenWherePage({ page, canEdit, onNavigate }) {
  const tab = (tabOfPage(page) || WW_TABS[0]).key;
  const info = tabOf(tab);
  const table = WW_TABLES[tab];
  const notify = useNotify();
  const account = useAccount();
  const sym = WW_CURRENCY;
  const today = todayISO();

  // ---- date range (remembered: a preset by its key, otherwise the dates)
  const presetList = useMemo(() => presets(today, WW_DATA_START), [today]);
  const [range, setRangeState] = useState(() => {
    const saved = load('ww.range', null);
    const p = presetList.find((x) => x.key === (saved?.preset || 'last7'));
    if (saved?.preset && p) return { from: p.from, to: p.to };
    if (saved?.from && saved?.to && saved.from <= saved.to) return { from: saved.from, to: saved.to };
    const def = presetList.find((x) => x.key === 'last7');
    return { from: def.from, to: def.to };
  });
  const setRange = useCallback((r) => {
    const p = presetList.find((x) => !x.variantOf && x.from === r.from && x.to === r.to);
    store('ww.range', p ? { preset: p.key } : { from: r.from, to: r.to });
    setRangeState({ from: r.from, to: r.to });
  }, [presetList]);
  const rangeDays = daysBetween(range.from, range.to) + 1;

  // ---- header filters
  const [view, setView] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [filters, setFilters] = useState({ campaign: 'enabledPaused', adGroup: 'enabledPaused' });
  const [levels, setLevels] = useState(['Campaign']);

  // ---- chart
  const [chart, setChartState] = useState(() => ({ metrics: ['clicks', null], type: 'line', period: 'daily', ...load('ww.chart', {}) }));
  const setChart = (patch) => setChartState((c) => {
    const next = { ...c, ...patch };
    store('ww.chart', next);
    return next;
  });
  const [chartBig, setChartBig] = useState(false);
  const [chartHidden, setChartHidden] = useState(() => load('ww.chartHidden', false));

  // ---- table
  const [colsBy, setColsBy] = useState(() => Object.fromEntries(WW_TABS.map((t) => [t.key, load(`ww.cols.${t.key}`, WW_TABLES[t.key].defaults)])));
  const cols = colsBy[tab];
  const setCols = (list) => {
    store(`ww.cols.${tab}`, list);
    setColsBy((c) => ({ ...c, [tab]: list }));
  };
  // The Columns panel's "Show recommended columns in your tables" switch, flipped: every other
  // tab's table loses (or gets back, at the end) its recommended columns too.
  const setRecAll = (on) => setColsBy((c) => {
    const next = { ...c };
    for (const t of WW_TABS.map((x) => x.key)) {
      if (t === tab) continue;
      const rec = recOf(t);
      const list = on ? [...c[t], ...rec.filter((k) => !c[t].includes(k))] : c[t].filter((k) => !rec.includes(k));
      if (list.length === c[t].length) continue;
      store(`ww.cols.${t}`, list);
      next[t] = list;
    }
    return next;
  });
  const [sortBy, setSortBy] = useState(() => Object.fromEntries(WW_TABS.map((t) => [t.key, WW_TABLES[t.key].sort])));
  const sort = sortBy[tab];
  const [pageSize, setPageSizeState] = useState(() => load('ww.pageSize', 100));
  const [pageIdx, setPageIdx] = useState(0);
  const [search, setSearch] = useState(null);
  const [segmentBy, setSegmentBy] = useState({});
  const segment = segmentBy[tab] || null;
  const [whenMode, setWhenMode] = useState('dayhour');
  const [locView, setLocView] = useState('account');
  const [colsOpen, setColsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [condensed, setCondensed] = useState(false);

  // ---- data
  const [campaigns, setCampaigns] = useState([]);
  const [data, setData] = useState(null);
  const [accountRows, setAccountRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  // Reports received so far (a row just added waits for the next one).
  const loads = useRef(0);
  // The page stays mounted across the four tabs, so the last report may be another tab's: it is
  // set aside (until this tab's arrives, for good if that fails), never shown, edited or charted
  // under this tab's columns.
  const cur = data?.tab === tab ? data : null;
  const acctRows = accountRows?.tab === tab ? accountRows.rows : null;

  // The view: campaigns of the picked type whose status passes the Campaign status filter (removed
  // campaigns are left out by default); then the one picked campaign, if any.
  const viewCampaigns = useMemo(() => campaigns.filter((c) => (!view || c.type === view) && STATUS_OK[filters.campaign](c.status)),
    [campaigns, view, filters.campaign]);
  const included = useMemo(() => viewCampaigns.filter((c) => !campaignId || c.id === campaignId), [viewCampaigns, campaignId]);
  // A picked campaign that leaves the view (a filter, or its status or type, changed) is let go,
  // rather than leaving an empty table under "Select a campaign".
  useEffect(() => {
    if (campaignId && campaigns.length && !viewCampaigns.some((c) => c.id === campaignId)) setCampaignId('');
  }, [campaignId, campaigns, viewCampaigns]);
  // null: every campaign (no filter sent).
  const campaignParam = campaigns.length && included.length !== campaigns.length ? included.map((c) => c.id).join(',') : null;

  useEffect(() => {
    let live = true;
    const q = { tab, from: range.from, to: range.to };
    if (segment) q.segment = segment;
    const filtered = campaignParam != null;
    if (filtered) q.campaigns = campaignParam || 'none';
    setLoading(true);
    const jobs = [api.wwReport(q)];
    // The account total covers every campaign, whatever the view shows.
    if (filtered) jobs.push(api.wwReport({ tab, from: range.from, to: range.to }));
    Promise.all(jobs)
      .then(([r, all]) => {
        if (!live) return;
        loads.current += 1;
        // Tagged with the tab (and segment) asked for: see `cur`.
        setData({ ...r, tab, segment });
        setCampaigns(r.campaigns || []);
        setAccountRows({ tab, rows: (all || r).rows || [] });
      })
      .catch((e) => { if (live) notify(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [tab, range.from, range.to, campaignParam, segment, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Top bar > Refresh, and saves made elsewhere.
  useEffect(() => {
    window.addEventListener('app:refresh', refresh);
    return () => window.removeEventListener('app:refresh', refresh);
  }, [refresh]);

  // Tab title.
  useEffect(() => { document.title = tabTitle(`${info.label}-${account.name}-${BRAND.name.trim()}`); }, [info.label, account.name]);

  // A new tab or filter starts on the first page.
  useEffect(() => { setPageIdx(0); }, [tab, range.from, range.to, campaignParam, search, whenMode, locView, levels, pageSize]);
  useEffect(() => { if (tab !== 'where') setSearch(null); }, [tab]);

  // Compact header once the pickers and filters have scrolled away.
  useEffect(() => {
    const main = document.getElementById('main');
    if (!main) return undefined;
    const on = () => setCondensed(main.scrollTop > 110);
    on();
    main.addEventListener('scroll', on, { passive: true });
    return () => main.removeEventListener('scroll', on);
  }, []);

  // Expand: the table fills the screen (browser full screen when allowed); Esc leaves it.
  useEffect(() => {
    document.body.classList.toggle('ww-full', expanded);
    return () => document.body.classList.remove('ww-full');
  }, [expanded]);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setExpanded(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleExpand = () => {
    if (expanded) {
      setExpanded(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } else {
      setExpanded(true);
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }, []);

  // ---- rows as the table shows them
  const typeById = useMemo(() => new Map(campaigns.map((c) => [c.id, c.type])), [campaigns]);
  const nameById = useMemo(() => new Map(campaigns.map((c) => [c.id, c.name])), [campaigns]);
  const typeOf = useCallback((r) => typeById.get(r.campaignId) || '', [typeById]);
  const campaignText = useCallback((r) => r.campaignLabel || nameById.get(r.campaignId) || '', [nameById]);
  const incIds = useMemo(() => new Set(included.map((c) => c.id)), [included]);

  // The tab's rows in the view: Devices lists every row; the other tabs only rows with figures.
  const baseRows = useMemo(() => {
    const list = (cur?.rows || []).filter((r) => incIds.has(r.campaignId));
    if (tab === 'devices') return list.filter((r) => levels.includes(r.level || 'Campaign'));
    // Rows copied by an admin show straight away, before they have figures.
    let out = list.filter((r) => r.has || r.added);
    if (tab === 'where' && search) {
      const q = search.trim().toLowerCase();
      if (q) out = out.filter((r) => String(r.placement || '').toLowerCase().includes(q));
    }
    return out;
  }, [cur, incIds, tab, levels, search]);
  // The chart plots every row of the view's campaigns (the server's series knows nothing of the
  // Level filter or the placement search), so an edited point goes to those same rows and then
  // reads as typed.
  const seriesIds = useMemo(() => (cur?.rows || []).filter((r) => incIds.has(r.campaignId)).map((r) => r.id), [cur, incIds]);

  const groupKey = useCallback((r) => {
    if (tab === 'when') {
      if (whenMode === 'day') return `d${r.dow}|${r.campaignId}|${campaignText(r)}`;
      if (whenMode === 'hour') return `h${r.hour}|${r.campaignId}|${campaignText(r)}`;
    }
    if (tab === 'locations' && locView === 'account') return `l${String(r.location || '').toLowerCase()}`;
    return r.id;
  }, [tab, whenMode, locView, campaignText]);

  const displayRows = useMemo(() => {
    const groups = new Map();
    for (const r of baseRows) {
      const k = groupKey(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const out = [];
    for (const [key, list] of groups) {
      const r = list[0];
      const campaign = { text: campaignText(r), campaignId: r.campaignId };
      const attrs = {
        device: r.device, level: r.level || 'Campaign', addedTo: campaign, bidAdj: r.bidAdj ?? null, adGroupBidAdj: r.adGroupBidAdj ?? null,
        day: r.dow == null ? null : DAYS[r.dow], hour: r.hour == null ? null : hourLabel(r.hour), campaign,
        placement: r.placement, placementType: r.placementType, adGroup: r.adGroup, location: r.location,
        dow: r.dow, hourNum: r.hour,
      };
      const types = [...new Set(list.map(typeOf))];
      out.push({
        key, rowIds: list.map((x) => x.id), type: types.length === 1 ? types[0] : '', order: r.order ?? 0,
        attrs, values: figuresOf(list, typeOf),
        editable: canEdit ? { device: true, level: true, addedTo: true, campaign: true, bidAdj: true, adGroupBidAdj: true,
          day: whenMode !== 'hour', hour: whenMode !== 'day', placement: true, placementType: true, adGroup: true, location: true } : {},
      });
    }
    for (const r of out) r.words = wordsOf(r.values);
    return out;
  }, [baseRows, groupKey, campaignText, typeOf, canEdit, whenMode]);

  // Sorted (stable: equal figures keep the stored order).
  const sortedRows = useMemo(() => {
    const list = [...displayRows].sort((a, b) => a.order - b.order);
    if (!sort?.key) return list;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (r) => {
      if (isWwMetric(sort.key)) return r.values[sort.key];
      // Days and hours in time order (Sunday first, like the day lists), not by their names.
      if (sort.key === 'day') return r.attrs.dow ?? null;
      if (sort.key === 'hour') return r.attrs.hourNum ?? null;
      const v = r.attrs[sort.key];
      return v && typeof v === 'object' ? v.text : v;
    };
    return list.map((r, i) => [r, i]).sort(([a, i], [b, j]) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return i - j;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return c ? c * dir : i - j;
    }).map(([r]) => r);
  }, [displayRows, sort]);

  // Total rows. Devices: the account total at the bottom. The other tabs: the view's total at the
  // top (it stays under the header while scrolling), and at the bottom the view's total again, the
  // account's (which also counts removed campaigns) and, under it, one per campaign type.
  const [typesOpen, setTypesOpen] = useState(true);
  const totals = useMemo(() => {
    // An admin edit of a total goes to the rows it adds up (`list`). With none (no figures in the
    // range) it goes to `spare`, all of the total's rows, so a total that reads 0 can still be typed
    // in (the server adds the days). Typed-in columns, kept per row, only go to `list` (extraIds):
    // the total would not show them on the others.
    const make = (key, label, help, list, pos, more = {}, spare = []) => {
      const values = figuresOf(list, typeOf);
      const ids = (list.length ? list : spare).map((r) => r.id);
      return { key, label, help, pos, rowIds: ids, extraIds: list.map((r) => r.id), values, words: wordsOf(values), ...more };
    };
    const all = acctRows || [];
    const acct = all.filter((r) => tab === 'devices' || r.has || r.added);
    if (tab === 'devices') return [make('account', 'Total: Account', WW_TOTAL_HELP.account, acct, 'bottom')];
    const what = tab === 'when' ? `Total: ${whenMode === 'day' ? 'Day' : whenMode === 'hour' ? 'Hour' : 'Day & hour'}`
      : tab === 'where' ? 'Total: Where ads showed' : 'Total: Locations';
    const view = make('view', what, WW_TOTAL_HELP.filtered, baseRows, 'top');
    const types = CAMPAIGN_TYPES.filter((t) => campaigns.some((c) => c.type === t));
    const grouped = table.checkbox;
    // A campaign type with no rows on this tab has nothing to put figures on: it stays read-only.
    return [
      view,
      { ...view, key: 'view-foot', pos: 'bottom' },
      // The tables with a checkbox column show the type totals as a group the account total opens
      // and closes (shots 89–91); the When table lists them all, unindented.
      make('account', 'Total: Account', WW_TOTAL_HELP.account, acct, 'bottom',
        grouped ? { toggle: true, open: typesOpen, onToggle: () => setTypesOpen((o) => !o) } : {}, all),
      ...(typesOpen || !grouped ? types.map((t) => make(`type-${t}`, `Total: ${t} campaigns`, WW_TOTAL_HELP.type(t),
        acct.filter((r) => typeOf(r) === t), 'bottom', { indent: grouped }, all.filter((r) => typeOf(r) === t))) : []),
    ];
  }, [tab, table, acctRows, baseRows, typeOf, whenMode, campaigns, typesOpen]);

  // Segment rows under each row (Segment > Time), once the report for this segment is in.
  const segments = useMemo(() => (segment && cur?.segment === segment && cur.segments
    ? buildSegments(segment, cur.segments, displayRows, baseRows, typeOf) : null), [segment, cur, displayRows, baseRows, typeOf]);

  // ---- columns shown: the tab's fixed columns, then the chosen ones
  const locked = tab === 'when'
    ? (whenMode === 'day' ? ['day', 'campaign'] : whenMode === 'hour' ? ['hour', 'campaign'] : table.locked)
    : tab === 'locations' && locView === 'campaign' ? ['location', 'campaign'] : table.locked;
  const columns = [...locked, ...cols.filter((k) => !locked.includes(k))];

  // ---- edits (admin)
  const guard = async (fn) => {
    try {
      await fn();
      refresh();
    } catch (e) {
      notify(e.message);
    }
  };
  const onEditMetric = (rowIds, metric, text, period) => guard(() => api.wwEditMetric({
    rowIds, metric, value: text, from: period?.from || range.from, to: period?.to || range.to,
    // A Day of the week segment spans the whole range: the server keeps to that weekday's days.
    ...(Number.isInteger(period?.dow) && { dow: period.dow }),
  }));
  const onEditField = (rowIds, field, value) => guard(() => api.wwEditRows(rowIds, field, value));
  const onEditPoint = (point, metric, text) => onEditMetric(seriesIds, metric, text, point);
  const onEditCampaign = (id, field, value) => guard(() => api.wwEditCampaign(id, field, value));
  const onDuplicate = (ids) => guard(async () => { await api.wwDuplicateRows(ids); notify(ids.length === 1 ? 'Row copied' : `${ids.length} rows copied`); });
  // ids: the stored rows of `shown` table rows (more when the table adds rows up: the question
  // says so). The grid keeps the ticks: Cancel leaves them, and removed rows drop out of the selection.
  const onRemove = (ids, shown = ids.length) => {
    const them = shown === 1 ? 'this row' : `${shown} rows`;
    const ask = ids.length === shown
      ? (shown === 1 ? 'Remove this row and its figures?' : `Remove ${shown} rows and their figures?`)
      : `Remove ${them}? ${shown === 1 ? 'It adds' : 'They add'} up ${ids.length} rows, which are all removed with their figures.`;
    if (!window.confirm(ask)) return;
    guard(() => api.wwDeleteRows(ids));
  };
  // Rows that add up several stored rows (Matched locations' Account view: one location over every
  // campaign; When ads showed by Day or by Hour: a weekday or an hour of one campaign) would merge
  // a copy back into themselves (no new row, no figures). Copies are made in the plain view.
  const duplicateOff = tab === 'locations' && locView === 'account' ? 'To copy rows, switch to Campaign view'
    : tab === 'when' && whenMode !== 'dayhour' ? 'To copy rows, switch to Day & hour' : null;
  const onMove = (ids, id) => guard(async () => {
    const { changed } = await api.wwEditRows(ids, 'campaignId', id);
    notify(changed ? `${changed === 1 ? 'Row' : `${changed} rows`} moved to ${nameById.get(id) || 'the campaign'}` : 'Already in that campaign');
  });

  // ---- adding rows and campaigns, deleting campaigns (admin)
  const [adding, setAdding] = useState(null); // 'row' | 'campaign'
  useEffect(() => { setAdding(null); }, [tab]);
  // A row just added ({ id, after: reports received before it }) is brought into view once a report
  // has it: its page, then scrolled to (`scrollKey`). One that the next report leaves out is let go.
  const [reveal, setReveal] = useState(null);
  const [scrollKey, setScrollKey] = useState(null);
  const pageRef = useRef(null);
  const onRowAdded = (id, row) => {
    setAdding(null);
    // The table's own filters that would hide it give way; the view's (type, status) stay.
    const inView = viewCampaigns.some((c) => c.id === row.campaignId);
    if (inView && campaignId && campaignId !== row.campaignId) setCampaignId('');
    if (tab === 'devices' && !levels.includes(row.level)) setLevels((l) => [...l, row.level]);
    if (tab === 'where' && search?.trim() && !row.placement.toLowerCase().includes(search.trim().toLowerCase())) setSearch('');
    notify(inView ? 'Row added - double-click its text and numbers to fill it in'
      : `Row added to ${nameById.get(row.campaignId) || 'a campaign'}, which this view doesn’t show`);
    if (inView) setReveal({ id, after: loads.current });
    refresh();
  };
  useEffect(() => {
    if (!reveal || !cur) return;
    const i = sortedRows.findIndex((r) => r.rowIds.includes(reveal.id));
    if (i < 0) {
      if (loads.current > reveal.after) setReveal(null);
      return;
    }
    setReveal(null);
    // Sorted by a figure, a row without any may sit on a later page.
    setPageIdx(Math.floor(i / (pageSize > 0 ? pageSize : 100)));
    setScrollKey(sortedRows[i].key);
  }, [reveal, cur, sortedRows, pageSize]);
  useEffect(() => {
    if (!scrollKey) return;
    setScrollKey(null);
    [...(pageRef.current?.querySelectorAll('[data-testid="ww-row"]') || [])].find((x) => x.dataset.key === scrollKey)?.scrollIntoView({ block: 'center' });
  }, [scrollKey]);
  const onCampaignAdded = () => {
    setAdding(null);
    notify('Campaign added');
    refresh();
  };
  // Asks with the campaign's row count over all four tabs (fetched first; one delete at a time).
  const deletingRef = useRef(false);
  const onDeleteCampaign = async (c) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    try {
      let n = null;
      try {
        const reports = await Promise.all(WW_TABS.map((t) => api.wwReport({ tab: t.key, from: today, to: today, campaigns: c.id })));
        n = reports.reduce((a, r) => a + (r.rows?.length || 0), 0);
      } catch { /* only the question needs the count */ }
      const rows = n == null ? 'all its rows' : `its ${n} row${n === 1 ? '' : 's'}`;
      if (!window.confirm(`Delete ${c.name} and ${rows}?`)) return;
      await guard(async () => {
        await api.wwDeleteCampaigns([c.id]);
        notify(`Deleted ${c.name}`);
      });
    } finally {
      deletingRef.current = false;
    }
  };

  // ---- download
  const cellText = (r, k) => {
    if (isWwMetric(k)) {
      const s = fmtWw(k, r.values[k], sym);
      return k === 'interactions' && r.words && r.values[k] > 0 ? `${s} ${r.words}` : s;
    }
    const v = r.attrs?.[k];
    if (k === 'bidAdj') return fmtBidAdj(v);
    if (k === 'adGroupBidAdj') return fmtAdGroupBidAdj(v);
    if (v && typeof v === 'object') return v.text;
    return v ?? '';
  };
  // A total or segment line: its label in the first column, then only the figures.
  const figureLine = (x, label) => columns.map((k, i) => (i === 0 ? label : isWwMetric(k) ? cellText(x, k) : ''));
  // Segments: the download dialog's choice, else (the menu's quick formats) the table's. Each row's
  // periods follow it; a segment the table isn't showing is fetched for the file.
  const onDownload = async (format, opts = {}) => {
    const seg = opts.segment === undefined ? segment : opts.segment;
    let segMap = null;
    if (seg && seg === segment && segments) segMap = segments;
    else if (seg) {
      const q = { tab, from: range.from, to: range.to, segment: seg };
      if (campaignParam != null) q.campaigns = campaignParam || 'none';
      try {
        segMap = buildSegments(seg, (await api.wwReport(q)).segments || [], displayRows, baseRows, typeOf);
      } catch (e) {
        notify(e.message);
        return;
      }
    }
    const header = columns.map(colLabelWw);
    const rows = sortedRows.flatMap((r) => [columns.map((k) => cellText(r, k)), ...(segMap?.[r.key] || []).map((s) => figureLine(s, s.label))]);
    const tot = totals.filter((t) => t.key !== 'view-foot').map((t) => figureLine(t, t.label));
    exportTable(format, {
      fileBase: `${info.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: `${WW_TITLE}: ${info.label}`,
      rangeText: fmtRange(range.from, range.to),
      header, rows, totals: tot,
    }, opts);
  };

  // The chart's period: one the range is long enough for; long ranges (All time) show months.
  let chartPeriod = PERIOD_MIN[chart.period] > rangeDays ? 'daily' : chart.period;
  if (chartPeriod === 'daily' && rangeDays > 366) chartPeriod = 'monthly';

  const viewLabel = view ? `${view} campaigns` : 'All campaigns';
  const split = tab === 'locations';
  const titleBar = (
    <WwTitleBar condensed={condensed} viewLabel={viewLabel} onTop={() => document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
      range={range} today={today} dataStart={cur?.dataStart || WW_DATA_START} presetList={presetList} onRange={setRange}
      split={split} tabs={split ? <WwTabs tab={tab} onTab={(k) => onNavigate({ page: tabOf(k).page })} /> : null} />
  );
  // Sticky offsets: the title bar, then the toolbar, then the table header.
  // (The Matched locations title block isn't sticky: nothing sits above the toolbar there.)
  const titleH = split ? 0 : 64;
  const toolbarH = 57;

  return (
    <div ref={pageRef} className={`page ww-page ${expanded ? 'ww-expanded' : ''} ${split ? 'ww-split' : ''}`} data-level="ww" data-tab={tab}
      style={{ '--ww-title-h': `${titleH}px`, '--ww-toolbar-h': `${toolbarH}px` }}>
      {loading && <div className="progress"><span /></div>}
      {!expanded && (
        <>
          <WwViewBar view={view} onView={(t) => { setView(t); setCampaignId(''); }} campaigns={viewCampaigns} campaignId={campaignId}
            onCampaign={setCampaignId} canEdit={canEdit} onEditCampaign={onEditCampaign} campaignStatus={filters.campaign}
            onNewCampaign={canEdit ? () => setAdding('campaign') : undefined} onDeleteCampaign={canEdit ? onDeleteCampaign : undefined} />
          <WwFilterBar filters={filters} onFilter={(k, v) => setFilters((f) => ({ ...f, [k]: v }))} />
        </>
      )}
      {titleBar}
      {!split && <WwTabs tab={tab} onTab={(k) => onNavigate({ page: tabOf(k).page })} />}
      {colsOpen ? (
        <WwColumns tab={tab} locked={locked} cols={cols.filter((k) => !locked.includes(k))}
          onApply={(list, rec) => { setCols(list); if (rec) setRecAll(rec.showRec); setColsOpen(false); }} onCancel={() => setColsOpen(false)} />
      ) : (
        <>
          {info.chart && !chartHidden && !expanded && (
            <WwChart tab={tab} series={cur?.series || []} range={range} metrics={chart.metrics}
              onMetrics={(m) => setChart({ metrics: m, type: m[1] ? chart.type : 'line' })}
              chartType={chart.type} onChartType={(t) => setChart({ type: t })} big={chartBig} onBig={() => setChartBig((b) => !b)}
              period={chartPeriod} onPeriod={(p) => setChart({ period: p })} canEdit={canEdit && seriesIds.length > 0} onEditPoint={onEditPoint} sym={sym} />
          )}
          <section className="ww-tablecard">
            <WwToolbar tab={tab} levels={levels} onLevels={setLevels} search={search} onSearch={setSearch}
              segment={segment} onSegment={(s) => setSegmentBy((m) => ({ ...m, [tab]: s }))}
              whenMode={whenMode} onWhenMode={setWhenMode} locView={locView} onLocView={setLocView}
              onColumns={() => setColsOpen(true)} onDownload={onDownload} expanded={expanded} onExpand={toggleExpand}
              chartHidden={chartHidden} onChartHidden={(h) => { setChartHidden(h); store('ww.chartHidden', h); }}
              hasChart={info.chart} rangeDays={rangeDays} sticky canEdit={canEdit} onCreate={setAdding} />
            <WwGrid tab={tab} columns={columns} rows={sortedRows} totals={totals} totalPos={table.total}
              sort={sort} onSort={(k) => setSortBy((s) => {
                const was = s[tab];
                const dir = was?.key === k ? (was.dir === 'desc' ? 'asc' : 'desc') : isWwMetric(k) ? 'desc' : 'asc';
                return { ...s, [tab]: { key: k, dir } };
              })}
              canEdit={canEdit} onEditMetric={onEditMetric} onEditField={onEditField}
              onHideColumn={(k) => setCols(cols.filter((c) => c !== k))} onCampaign={(id) => setCampaignId(id)}
              segments={segments} pageSize={pageSize} onPageSize={(n) => { setPageSizeState(n); store('ww.pageSize', n); }}
              page={pageIdx} onPage={setPageIdx} emptyText={cur ? table.empty : ''} sym={sym}
              stickyTop={titleH + toolbarH} selectable={table.checkbox || !!canEdit} onDuplicate={onDuplicate} duplicateOff={duplicateOff} onRemove={onRemove}
              campaigns={campaigns} onMove={onMove} />
          </section>
        </>
      )}
      {adding === 'row' && (
        <WwAddRow tab={tab} campaigns={campaigns} campaignId={campaignId || viewCampaigns[0]?.id} onClose={() => setAdding(null)} onAdded={onRowAdded} />
      )}
      {adding === 'campaign' && (
        <WwAddCampaign campaigns={campaigns} type={view} onClose={() => setAdding(null)} onAdded={onCampaignAdded} />
      )}
      <footer className="ww-foot">
        <p data-slot="ww-foot-1">
          <HelpLink topic="reporting-delay">Reporting is not real-time.</HelpLink>
          {tab === 'where'
            ? ' Your account’s time zone is used for all dates and times. '
            : ` Time zone for all dates and times: ${deviceTimeZone()}. `}
          <HelpLink topic="time-zone" />
        </p>
        <p data-slot="ww-foot-2">Some placements may be sold to you through other companies.</p>
        <p data-slot="ww-foot-3">Columns with independently accredited measurement say so in their header’s hover text.</p>
        <p data-slot="ww-foot-4" className="ww-foot-copy">{`© ${BRAND.name.trim()}, 2026.`}</p>
      </footer>
    </div>
  );
}
