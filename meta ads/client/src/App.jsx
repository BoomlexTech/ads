import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Bell, Gauge, Table2, Newspaper, Users, Megaphone, CreditCard, Network, CircleHelp, Settings, Search, Bug, Folder, CircleArrowUp, Inbox, Send, Plus, SlidersHorizontal, RefreshCw, Trash2, MoreHorizontal, ChevronRight, ChevronDown, ExternalLink, Download, Database, Diff, PanelTop, FileText, BarChart3, Pencil, History, UserPlus, LogOut, Menu as HamburgerIcon } from 'lucide-react';
import { api } from './api.js';
import { Popover, Menu, Checkbox, useOutside, Modal, Field } from './ui.jsx';
import { IconCheck, Caret, TabCampaign, TabAdset, TabAds, IconPlus, IconDuplicate, IconEdit, IconFlask, IconColumns, IconBreakdown, IconReports, IconExport, IconCharts, MetaAI, AnalyseIcon } from './icons.jsx';
import Table from './Table.jsx';
import DatePicker from './DatePicker.jsx';
import { EntityEditor, StatEditor } from './Editors.jsx';
import { HistoryDrawer } from './Panels.jsx';
import ViewPanel from './ViewPanel.jsx';
import SearchBar from './SearchBar.jsx';
import LeftRail from './LeftRail.jsx';
import RightRail from './RightRail.jsx';
import TopBar from './TopBar.jsx';
import { DEFAULT_NAMES } from './AccountPanel.jsx';
import AdPreviewModal from './AdPreviewModal.jsx';
import AnalysePanel from './AnalysePanel.jsx';
import { downloadXLSX } from './ToolbarMenus.jsx';
import { MetaAILogo } from './fid-ai-icons.jsx';
import ComparePane from './ComparePane.jsx';
import QuickViewsBar from './QuickViewsBar.jsx';
import OppScore from './OppScore.jsx';
import Toolbar from './Toolbar.jsx';
import LevelTabs from './LevelTabs.jsx';
import './fid-shade.css'; // last: text weights matched to the real page
import { COLUMNS, PRESETS, colById, presetRange, resolveRange, compareRange, rangeLabel, rangeButtonLabel, sumRows, passes, toCSV, FILTER_FIELDS } from './lib.js';

const TABS = [['campaign', 'Campaigns', TabCampaign], ['adset', 'Ad sets', TabAdset], ['ad', 'Ads', TabAds]];
const NAME = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };
const DEFAULT_SORT = { col: 'delivery', dir: 'desc' }; // Ads Manager opens sorted by Delivery
// built-in quick views; the predicates match the chips shown in the search bar
const QVP = { actions: () => false, delivery: (r) => r.impressions > 0, active: (r) => r.impressions > 0 && r.delivery === 'Active', lowctr: (r) => r.ctr != null && r.ctr < 3, highcpm: (r) => r.cpm != null && r.cpm > 0.8, nodata: (r) => !(r.impressions > 0) };
const derive0 = sumRows([]); // a row with no activity in the comparison period
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('ma2:' + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('ma2:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// the date button's calendar-grid glyph: thin outline like the real button (16 css px = 17.8 design px)
// the four names of the account panel as text, whatever the source (the server's answer, or what this browser remembered from last time)
const cleanNames = (o) => Object.fromEntries(Object.keys(DEFAULT_NAMES).map((k) => [k, o && typeof o[k] === 'string' && o[k] ? o[k] : DEFAULT_NAMES[k]]));

const CalGlyph = () => (
  <svg width="17.8" height="17.8" viewBox="0 0 16 16" fill="none" stroke="#1c2b33" strokeLinejoin="round" aria-hidden="true">
    <rect x="1" y="1" width="14" height="14" rx="2.4" strokeWidth="1.3" />
    <path d="M5.2 3.6H10.8" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M1 6.1H15M1 10.5H15M5.6 6.1V15M10.4 6.1V15" strokeWidth="1.05" opacity=".72" />
  </svg>
);

export default function App({ user, role, onLogout, admin }) {
  const noDelete = role === 'demo'; // the demo account can't delete (the server refuses): don't offer it
  const viewer = false; // Duplicate / Edit / A-B test / Reports / Export / Charts work on both entrances (the server decides what the signed-in account may change); /admin adds editing values in place
  const [tree, setTree] = useState({ campaigns: [], adsets: [], ads: [], minDate: null });
  const [level, setLevel] = useState(() => store.get('level', 'ad'));
  const [range, setRange] = useState(() => {
    const [from, to] = presetRange('last30');
    return resolveRange(store.get('range', { id: 'last30', from, to }), null); // presets are re-resolved against today
  });
  const [preset, setPreset] = useState(() => store.get('preset', 'Traffic'));
  const [cols, setCols] = useState(() => store.get('cols', PRESETS.Traffic));
  const [breakdown, setBreakdown] = useState('none');
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState([]);
  const [sel, setSel] = useState({ campaign: new Set(), adset: new Set(), ad: new Set() });
  const [data, setData] = useState({ rows: [], totals: sumRows([]), level: null, breakdown: null });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [showDate, setShowDate] = useState(false);
  const [menus, setMenus] = useState({});
  const [modal, setModal] = useState(null); // {type:'entity'|'stat', ...}
  const [drawer, setDrawer] = useState(null); // {entity?}
  const [toastMsg, setToastMsg] = useState(null);
  const [names, setNames] = useState(() => cleanNames(store.get('names', null))); // account panel: portfolio / ad account / profile names (the admin renames them)
  const searchRef = useRef(null);
  const [dup, setDup] = useState(null); // duplicate dialog {list, copies}
  const [customOpen, setCustomOpen] = useState(false);
  const [qv, setQv] = useState('all'); // active quick view
  const [views, setViews] = useState(() => store.get('views', []));
  const [pane, setPane] = useState(null); // right-hand pane: 'view' | 'charts'
  const [viewMode, setViewMode] = useState('create');
  const [hideResults, setHideResults] = useState(false); // "Hide results" on the totals row; never remembered, so a reload always shows the totals
  const [ai, setAi] = useState(false); // Meta AI "Analyse" panel
  const [profile, setProfile] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [, setClock] = useState(0);
  const [tw, setTw] = useState(1600); // width of the table area, drives which toolbar labels show
  const [selOnly, setSelOnly] = useState(null);
  const tareaRef = useRef(null);
  const narrow = ai;
  const [cmpData, setCmpData] = useState(null); // comparison-period rows, keyed by row id
  const dateRef = useRef(null);
  const minDateRef = useRef(null);

  const toast = useCallback((msg, err, ms) => { setToastMsg({ msg, err }); clearTimeout(toast.t); toast.t = setTimeout(() => setToastMsg(null), ms || (err ? 4500 : 2500)); }, []);
  const syncRef = useRef(null); // BroadcastChannel to this app's other tabs in the same browser
  // every change made here tells the other tabs straight away (the poller below covers other devices)
  const refresh = useCallback(() => { setTick((t) => t + 1); try { if (syncRef.current) syncRef.current.postMessage('changed'); } catch { /* ignore */ } }, []);
  const silentRef = useRef(false);
  const retryRef = useRef(null);
  const refreshQuietly = useCallback(() => { silentRef.current = true; setTick((t) => t + 1); }, []);
  // Everything lives in one database, so whatever the admin saves is what the main site shows. Tabs in the same
  // browser hear about it at once; other devices notice within seconds (the server's change marker is polled).
  const announce = () => { try { if (syncRef.current) syncRef.current.postMessage('changed'); } catch { /* ignore */ } };
  useEffect(() => {
    const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ma-sync') : null;
    syncRef.current = bc;
    if (bc) bc.onmessage = () => refreshQuietly();
    let last = null, stop = false;
    const poll = async (force) => {
      if (force !== true && document.visibilityState !== 'visible') return; // the very first look runs even in a background tab, so a later one can tell what changed
      try { const { v } = await api.version(); if (stop) return; if (last !== null && v !== last) refreshQuietly(); last = v; } catch { /* offline, or the 401 handler takes over */ }
    };
    poll(true);
    const t = setInterval(poll, 6000);
    const onVis = () => poll(false);
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis); if (bc) bc.close(); syncRef.current = null; };
  }, [refreshQuietly]);
  useEffect(() => { if (admin) toast('Admin mode: double-click any amount, name, status or image to edit it.', false, 6000); }, [admin, toast]);
  useEffect(() => { store.set('views', views); }, [views]);
  useEffect(() => { const t = setInterval(() => setClock((c) => c + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const el = tareaRef.current;
    if (!el || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => setTw(el.clientWidth));
    ro.observe(el); setTw(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') { setPane(null); setAi(false); setProfile(false); setDrawer(null); }
      else if (e.key === '/' || e.key === '?') {
        if (e.ctrlKey && e.shiftKey) { e.preventDefault(); setShortcuts(true); }
        else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { e.preventDefault(); searchRef.current?.querySelector('input')?.focus(); }
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const open = (k) => (v) => setMenus((m) => ({ ...m, [k]: v }));

  useEffect(() => {
    api.tree().then((t) => {
      setTree(t); minDateRef.current = t.minDate;
      setRange((r) => { const n = resolveRange(r, t.minDate); return n.from === r.from && n.to === r.to ? r : n; }); // 'Maximum' needs the first data date
    }).catch((e) => toast(e.message, true));
  }, [tick, toast]);
  // The names of the account panel live on the server: loaded with the page and again whenever something changed
  // (a refresh here, another tab, or the change poller noticing an edit made in the admin panel).
  const namesSeq = useRef(0);
  const applyNames = useCallback((n) => { const c = cleanNames(n); setNames(c); store.set('names', c); }, []);
  useEffect(() => {
    const seq = ++namesSeq.current;
    api.settings().then((n) => { if (seq === namesSeq.current) applyNames(n); }).catch(() => { /* keep what is shown */ });
  }, [tick, applyNames]);
  const saveNames = async (patch) => { // admin panel only; the caller shows the server's message when it is refused
    const n = await api.saveSettings(patch);
    namesSeq.current++; // an answer still on its way from before the save is out of date
    applyNames(n);
    announce();
  };
  // ----- drafts: every campaign, ad set and ad whose delivery the admin pinned to "In draft" -----
  const drafts = useMemo(() => [['campaign', tree.campaigns], ['adset', tree.adsets], ['ad', tree.ads]]
    .flatMap(([lv, list]) => (list || []).filter((x) => x.deliveryOverride === 'In draft').map((x) => ({ level: lv, id: x._id }))), [tree]);
  const draftBusy = useRef(false);
  // "Review and publish (N)" and "Discard Drafts": both put the delivery of every draft back to automatic
  const clearDrafts = async (publish) => {
    if (draftBusy.current) return;
    if (!drafts.length) return; // nothing in draft (the buttons are not shown then)
    if (!publish && !window.confirm('Discard all drafts?')) return;
    draftBusy.current = true;
    let done = 0;
    try {
      for (const d of drafts) {
        try { await api.patch(d.level, d.id, { deliveryOverride: '' }); done++; }
        catch (e) { if (e.message !== 'Not found') throw e; } // deleted elsewhere in the meantime
      }
      toast(publish ? `Published ${done} change${done === 1 ? '' : 's'}` : 'Drafts discarded');
    } catch (e) { toast(e.message, true); } // e.g. this account may not publish: the server says so
    finally { draftBusy.current = false; refresh(); }
  };
  // a tab left open overnight: roll "Today" / "Last 7 days" forward when the user comes back
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setRange((r) => { const n = resolveRange(r, minDateRef.current); return n.from === r.from && n.to === r.to ? r : n; });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  // child selections must stay consistent with their parents and with what still exists
  useEffect(() => {
    setSel((s) => {
      const camp = new Set([...s.campaign].filter((id) => tree.campaigns.some((c) => c._id === id)));
      const adset = new Set([...s.adset].filter((id) => { const a = tree.adsets.find((x) => x._id === id); return a && (!camp.size || camp.has(a.campaignId)); }));
      const ad = new Set([...s.ad].filter((id) => { const a = tree.ads.find((x) => x._id === id); return a && (!camp.size || camp.has(a.campaignId)) && (!adset.size || adset.has(a.adSetId)); }));
      const same = (a, b) => a.size === b.size;
      return same(camp, s.campaign) && same(adset, s.adset) && same(ad, s.ad) ? s : { campaign: camp, adset, ad };
    });
  }, [tree, sel.campaign, sel.adset]);
  useEffect(() => { store.set('level', level); store.set('range', range); store.set('preset', preset); store.set('cols', cols); }, [level, range, preset, cols]);

  // selections in the parent tabs narrow the child tabs, exactly like Ads Manager
  const campaignIds = level === 'campaign' ? '' : [...sel.campaign].join(',');
  const adSetIds = level === 'ad' ? [...sel.adset].join(',') : '';
  const query = useMemo(() => ({ from: range.from, to: range.to, campaignIds, adSetIds }), [range.from, range.to, campaignIds, adSetIds]);

  useEffect(() => {
    let live = true;
    const quiet = silentRef.current;
    if (!quiet) setLoading(true);
    silentRef.current = false;
    api.report({ ...query, level, breakdown }).then((d) => { if (live) { clearTimeout(retryRef.current); setData({ ...d, level, breakdown }); setLoading(false); setUpdatedAt(Date.now()); } })
      .catch((e) => {
        if (!live) return;
        setLoading(false);
        if (quiet) { clearTimeout(retryRef.current); retryRef.current = setTimeout(refreshQuietly, 8000); return; } // keep what is on screen, try again shortly
        setData({ rows: [], totals: sumRows([]), level, breakdown }); toast(e.message, true);
      });
    return () => { live = false; };
  }, [query, level, breakdown, tick, toast]);

  // "Compare" in the date picker: fetch the same rows for the comparison period
  const cr = useMemo(() => (range.compare && breakdown === 'none' ? compareRange(range.compare.id, range.from, range.to, range.compare) : null), [range, breakdown]);
  useEffect(() => {
    if (!cr) { setCmpData(null); return; }
    let live = true;
    api.report({ ...query, from: cr.from, to: cr.to, level, breakdown: 'none' })
      .then((d) => live && setCmpData({ level, rows: new Map(d.rows.map((r) => [r.id, r])) }))
      .catch(() => live && setCmpData(null));
    return () => { live = false; };
  }, [cr && cr.from, cr && cr.to, query.campaignIds, query.adSetIds, level, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderRef = useRef({ sig: '', pos: new Map() }); // the row order of the current sorting, see below
  // client-side search / filter / sort; totals always reflect what is visible
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    // never render rows that belong to a different level / breakdown than the one selected
    const raw = data.level === level && data.breakdown === breakdown ? data.rows : [];
    const prevOf = cmpData && cmpData.level === level && cr ? cmpData.rows : null;
    const base = prevOf ? raw.map((x) => ({ ...x, prev: prevOf.get(x.id) || derive0 })) : raw;
    const vw = views.find((x) => x.id === qv);
    const qpred = QVP[qv] || (vw?.base && QVP[vw.base]); // a saved view can build on a built-in one
    let r = base.filter((x) => (!qpred || qpred(x)) && (!selOnly || selOnly.has(x.entityId || x.id)) && (!q || x.name.toLowerCase().includes(q) || (x.entityId || x.id) === q || String(x.parentName || '').toLowerCase().includes(q)) && filters.every((f) => passes(x, f)));
    if (sort.col && (sort.col === 'name' || sort.col === 'status' || cols.includes(sort.col))) {
      const get = sort.col === 'name' ? (x) => x.name.toLowerCase() : sort.col === 'status' ? (x) => (x.status === 'on' ? 1 : 0) : sort.col === 'delivery' ? (x) => ({ Active: 3, Off: 0 })[x.delivery] ?? 1 : colById[sort.col].v;
      r = [...r].sort((a, b) => {
        const va = get(a), vb = get(b);
        if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
        return (va < vb ? -1 : va > vb ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
      });
    }
    // Rows keep their place while their values change (switching one off, an edit in the admin panel): like the real page, the table
    // is only re-ordered when the sorting, the tab, the breakdown or the dates change - otherwise a row would jump away under the pointer.
    const sig = [level, breakdown, sort.col, sort.dir, range.from, range.to].join('|');
    const held = orderRef.current;
    if (held.sig === sig && held.pos.size) {
      const sortedAt = new Map(r.map((x, i) => [x.id, i]));
      r = [...r].sort((x, y) => {
        const px = held.pos.has(x.id) ? held.pos.get(x.id) : Infinity, py = held.pos.has(y.id) ? held.pos.get(y.id) : Infinity;
        return px !== py ? px - py : sortedAt.get(x.id) - sortedAt.get(y.id); // rows that are new keep their sorted order, after the others
      });
      let next = held.pos.size;
      for (const x of r) if (!held.pos.has(x.id)) held.pos.set(x.id, next++);
    } else if (r.length) {
      orderRef.current = { sig, pos: new Map(r.map((x, i) => [x.id, i])) };
    }
    return r;
  }, [data, level, breakdown, search, filters, sort, cols, cmpData, cr, qv, selOnly, views, range.from, range.to]);
  const totals = useMemo(() => sumRows(rows), [rows]);
  const prevTotals = useMemo(() => (cr && rows.length && rows[0].prev ? sumRows(rows.map((r) => r.prev)) : null), [rows, cr]);

  const cur = sel[level];
  const keyOf = (r) => r.entityId || r.id;
  const selectedRows = rows.filter((r) => cur.has(keyOf(r)));
  const uniqueSelected = [...new Map(selectedRows.map((r) => [keyOf(r), r])).values()];
  const one = uniqueSelected.length === 1 ? uniqueSelected[0] : null;
  const idOf = (r) => keyOf(r);
  // the chart follows the table: selected rows if any, otherwise every visible (searched / filtered) row
  const chartAdIds = useMemo(() => {
    const keys = new Set(uniqueSelected.map(keyOf));
    return tree.ads.filter((a) => keys.has(level === 'ad' ? a._id : level === 'adset' ? a.adSetId : a.campaignId)).map((a) => a._id).sort().join(',');
  }, [rows, cur, tree.ads, level]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSel = (k) => setSel((s) => { const n = new Set(s[level]); n.has(k) ? n.delete(k) : n.add(k); return { ...s, [level]: n }; });
  const toggleAll = () => setSel((s) => {
    const keys = rows.map(keyOf); const all = keys.every((k) => s[level].has(k));
    return { ...s, [level]: all ? new Set() : new Set(keys) };
  });
  const switchLevel = (l) => { setLevel(l); setSort(DEFAULT_SORT); setSelOnly(null); };
  const openChild = (r) => { setSel((s) => ({ ...s, [level]: new Set([keyOf(r)]) })); switchLevel(level === 'campaign' ? 'adset' : 'ad'); };

  const setPresetCols = (p) => { setPreset(p); setCols(PRESETS[p]); };
  const toggleCol = (id) => { setPreset('Custom'); setCols((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])); };
  // header caret menu -> Columns: Move left / Move right / Add column after / Remove column / Customise columns
  const colApi = {
    move: (id, d) => { setPreset('Custom'); setCols((c) => { const i = c.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= c.length) return c; const n = [...c]; [n[i], n[j]] = [n[j], n[i]]; return n; }); },
    remove: (id) => { setPreset('Custom'); setCols((c) => (c.length > 1 ? c.filter((x) => x !== id) : c)); },
    add: (after, id) => { setPreset('Custom'); setCols((c) => { if (c.includes(id)) return c; const n = [...c]; n.splice(n.indexOf(after) + 1, 0, id); return n; }); },
    customise: () => { setCustomOpen(true); setMenus((m) => ({ ...m, cols: true })); },
  };
  const [filterField, setFilterField] = useState(null); // field the search-bar filter menu opens on
  useEffect(() => { if (!menus.filter) setFilterField(null); }, [menus.filter]);
  const headFilter = (id) => { setFilterField(id && FILTER_FIELDS.some((x) => x.id === id) ? id : null); setMenus((m) => ({ ...m, filter: true })); };

  // ----- admin panel: save a double-click edit -----
  const entityId = (r) => r.entityId || r.id;
  const asNumber = (s) => { const t = String(s).trim().replace(/^[$₹€£]\s*/, '').replace(/%$/, ''); return /^((\d{1,3}(,\d{2,3})+|\d+)(\.\d+)?|\.\d+)$/.test(t) ? Number(t.replace(/,/g, '')) : NaN; };
  // returns true when the value was saved, so the table can close the editor (a refused value keeps what was typed)
  const editCell = async (r, colId, raw) => {
    const id = entityId(r);
    const what = colId === 'name' ? 'name' : (colById[colId] ? colById[colId].label.replace(/ \(.*/, '') : colId);
    let ok = false;
    try {
      if (colId === 'name') {
        if (!raw.trim()) throw new Error("The name can't be empty");
        await api.patch(level, id, { name: raw.trim() });
      } else if (colId === 'delivery') {
        await api.patch(level, id, { deliveryOverride: raw === 'Automatic' ? '' : raw });
      } else if (colId === 'bid') {
        if (!raw.trim()) throw new Error('Enter a bid strategy');
        await api.patch('adset', level === 'ad' ? r.parentId : id, { bidStrategy: raw.trim() });
      } else {
        // a value cell takes a number (the data underneath is recalculated); left empty (or a dash) it shows "—" and the data is left alone
        const n = asNumber(raw), text = raw.trim(), had = !!(r.overrides && r.overrides[colId]);
        if (!Number.isFinite(n)) {
          if (text && !/^[-–—]+$/.test(text)) throw new Error(colId === 'budget' ? 'Enter a budget amount (or leave it empty for —)' : 'Enter a number (or leave it empty for —)');
          if (breakdown !== 'none') throw new Error('Turn the breakdown off to empty a cell');
          await api.text({ level, id, field: colId, value: '—' });
          toast(`${what} of “${r.name}” now shows —`);
          ok = true; return true;
        }
        if (had) await api.text({ level, id, field: colId, value: '' }); // a number replaces the dash
        if (colId === 'budget') {
          await api.patch('adset', level === 'ad' ? r.parentId : id, { dailyBudget: n });
          toast(`Updated ${what} of “${r.name}”`);
          ok = true; return true;
        }
        const res = await api.metric({ level, id, field: colId, value: n, from: range.from, to: range.to, breakdown, periodKey: r.periodKey || '' });
        if (res.unchanged) { toast(had ? `Updated ${what} of “${r.name}”` : 'Nothing to change'); ok = true; return true; }
        const note = res.clamped ? ' (Reach and Link clicks were capped at the new impressions)'
          : res.exact === false && colById[colId] ? ` (set to ${colById[colId].f(res.after)}, the closest these totals allow)` : '';
        toast(`Updated ${what} of “${r.name}”${note}`, false, note ? 6000 : undefined);
        ok = true; return true;
      }
      toast(`Updated ${what} of “${r.name}”`);
      ok = true;
    } catch (e) { toast(e.message, true); }
    finally { if (ok) refresh(); }
    return ok;
  };
  const editMedia = async (r, file) => {
    toast(`Uploading ${file.name}…`, false, 20000);
    try {
      const f = new FormData(); f.append('media', file);
      await api.update('ad', entityId(r), f);
      toast(`Updated the ${file.type.startsWith('video') ? 'video' : 'image'} of “${r.name}”`);
      announce();
    } catch (e) { toast(e.message, true); }
    finally { refresh(); }
  };

  const onToggle = async (r, on) => {
    const id = idOf(r);
    setData((d) => ({ ...d, rows: d.rows.map((x) => (idOf(x) === id ? { ...x, status: on ? 'on' : 'off', delivery: on ? (x.delivery === 'Off' ? 'Active' : x.delivery) : 'Off' } : x)) }));
    try { await api.setStatus(level, id, on ? 'on' : 'off'); toast(`${r.name} turned ${on ? 'on' : 'off'}`); announce(); }
    catch (e) { toast(e.message, true); }
    refresh();
  };
  const duplicate = async (list, copies = 1) => {
    let done = 0;
    try { for (const r of list) for (let c = 0; c < copies; c++) { await api.duplicate(level, idOf(r)); done++; } toast(`Duplicated ${done} ${NAME[level]}${done > 1 ? 's' : ''} (turned off)`); }
    catch (e) { toast(`${e.message}${done ? ` (${done} duplicated before the error)` : ''}`, true); }
    finally { refresh(); }
  };
  const remove = async (list) => {
    if (!window.confirm(`Delete ${list.length} ${NAME[level]}${list.length > 1 ? 's' : ''}${level !== 'ad' ? ' and everything inside' : ''}? This also deletes the daily data.`)) return;
    const gone = new Set();
    try {
      for (const r of list) {
        try { await api.remove(level, idOf(r)); gone.add(idOf(r)); }
        catch (e) { if (e.message === 'Not found') gone.add(idOf(r)); else throw e; } // already deleted elsewhere
      }
      toast('Deleted');
    } catch (e) { toast(e.message, true); }
    finally {
      setSel((s) => ({ ...s, [level]: new Set([...s[level]].filter((k) => !gone.has(k))) }));
      refresh();
    }
  };
  const exportCSV = () => {
    const visible = cols.map((id) => colById[id]).filter(Boolean);
    const blob = new Blob([toCSV(rows, visible, totals, level)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ads-${level}-${range.from}_${range.to}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const defaultsForCreate = () => ({ parentId: level === 'adset' ? [...sel.campaign][0] : level === 'ad' ? [...sel.adset][0] : undefined, campaignId: [...sel.campaign][0] });

  const tabLabel = (id, base) => {
    if (id === 'adset' && sel.campaign.size) return `${base} for ${sel.campaign.size} campaign${sel.campaign.size > 1 ? 's' : ''}`;
    if (id === 'ad' && sel.adset.size) return `${base} for ${sel.adset.size} ad set${sel.adset.size > 1 ? 's' : ''}`;
    if (id === 'ad' && sel.campaign.size) return `${base} for ${sel.campaign.size} campaign${sel.campaign.size > 1 ? 's' : ''}`;
    return base;
  };
  useOutside(searchRef, () => open('filter')(false), !!menus.filter);

  const levelName = { campaign: 'campaign', adset: 'ad set', ad: 'ad' }[level];
  // number boxes take digits only: also refuse the 'e', '+' and '-' a browser lets through
  useEffect(() => {
    const k = (e) => { const el = e.target; if (el && el.tagName === 'INPUT' && el.type === 'number' && ['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, []);
  useEffect(() => { document.title = `Ads Manager - Manage ads - ${{ campaign: 'Campaigns', adset: 'Ad sets', ad: 'Ads' }[level]}`; }, [level]);
  const rowActions = {
    lock: { edit: viewer, charts: viewer },
    charts: (r) => { setSel((s) => ({ ...s, [level]: new Set([idOf(r)]) })); setPane('charts'); },
    edit: (r) => setModal({ type: 'entity', mode: 'edit', level, entity: r }),
    compare: () => { setRange((rg) => ({ ...rg, compare: rg.compare ? null : { id: 'prev' } })); },
    more: (r) => [
      ['Duplicate', () => setDup({ list: [r], copies: 1 }), viewer],
      ['Add / edit data', () => setModal({ type: 'stat', ad: r }), level !== 'ad' || viewer],
      ['View history', () => setDrawer({ entity: r })],
      ['Delete', () => remove([r]), noDelete],
    ],
  };
  const ago = () => { const m = Math.floor((Date.now() - updatedAt) / 60000); return m < 1 ? 'Updated just now' : m === 1 ? 'Updated 1 minute ago' : `Updated ${m} minutes ago`; };
  const score = Math.max(35, Math.min(98, Math.round(45 + (totals.ctr || 0) * 12)));
  const initial = (user || '?')[0].toUpperCase();
  const comingSoon = () => () => {}; // a control with nothing behind it: clicking it does nothing, and no message is shown
  const QVB = [['all', 'All ads', Folder], ['active', 'Active ads', Send], ['delivery', 'Had delivery', Inbox], ['actions', 'Actions', CircleArrowUp]];
  const quickList = [['delivery', 'Had delivery'], ['actions', 'Actions'], ...views.map((v) => [v.id, v.name])];
  const full = tw >= 1500, mid = tw >= 1250, wide = tw >= 1400;
  const hasAnyFilter = filters.length > 0 || !!search || !!selOnly || qv !== 'all';
  const clearAll = () => { setFilters([]); setSearch(''); setSelOnly(null); setQv('all'); };
  const applyQv = (id) => { const v = views.find((x) => x.id === id); setQv(id); setFilters(v ? v.filters || [] : []); setSearch(v ? v.search || '' : ''); setSelOnly(null); if (v?.cols) { setCols(v.cols); setPreset('Custom'); } if (v?.breakdown) setBreakdown(v.breakdown); };
  const saveView = ({ name, desc, access, inc }, asCopy) => {
    const cur = views.find((x) => x.id === qv);
    const base = QVP[qv] ? qv : cur?.base || null; // built-in quick view this one builds on
    const v = { id: 'v' + Date.now(), name: name.trim().slice(0, 100), desc, access, base, filters: inc.filters ? filters : [], search: inc.filters ? search : '', cols: inc.columns ? cols : null, breakdown: inc.breakdown ? breakdown : null };
    if (viewMode === 'edit' && cur && !asCopy) { v.id = cur.id; setViews((vs) => vs.map((x) => (x.id === cur.id ? v : x))); } // Save edits
    else setViews((vs) => [...vs, v]); // Save / Save copy
    setQv(v.id); setPane(null); toast(asCopy ? 'View copy saved' : 'View saved');
  };
  const qvName = QVB.find((q) => q[0] === qv)?.[1] || views.find((v) => v.id === qv)?.name || '';
  const chipDefs = {
    actions: [<>Ad actions one of <b className="spark">✦</b> Recommendations</>],
    delivery: [<>Impressions (Campaign) <span>&gt; 0</span></>],
    active: [<>Impressions (Campaign) <span>&gt; 0</span></>, <>Campaign delivery is <i className="dotg" /> Active</>],
    lowctr: [<>CTR (all) <span>&lt; 3%</span></>], highcpm: [<>CPM <span>&gt; $0.80</span></>], nodata: [<>Impressions <span>= 0</span></>],
  };
  const qvChips = chipDefs[qv] || chipDefs[views.find((v) => v.id === qv)?.base] || [];
  const filterLabel = (f) => {
    const def = FILTER_FIELDS.find((x) => x.id === f.field);
    const op = ({ gt: '>', lt: '<', eq: '=', gte: '≥', lte: '≤', contains: 'contains', not: 'does not contain', is: 'is' })[f.op] || f.op;
    return f.field === 'delivery' && f.value === 'Active' ? <>{def.label} {op} <i className="dotg" /> Active</> : <>{def.label} <span>{op} {f.value}</span></>;
  };
  const resetApp = () => { try { Object.keys(localStorage).filter((k) => k.startsWith('ma2:')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } window.location.reload(); };
  const downloadTemplate = () => {
    const blob = new Blob(['﻿Ad name,Ad set,Primary text,Headline,Description,Website URL,Call to action\r\n'], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ads-import-template.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  const tip = (t) => ({ 'data-tip': t });
  const popTitle = (t) => <div className="pop-title">{t}</div>;

  // ----- Duplicate menu: Quick duplicate / Copy / Paste / See copied items -----
  const [clip, setClip] = useState(null); // { level, rows: [{ id, name }] }
  const [preview, setPreview] = useState(null); // selected ad rows shown in the Ad preview dialog
  const copyRows = () => {
    if (!uniqueSelected.length) return;
    setClip({ level, rows: uniqueSelected.map((r) => ({ id: idOf(r), name: r.name })) });
    toast(`Copied ${uniqueSelected.length} ${NAME[level]}${uniqueSelected.length > 1 ? 's' : ''}`);
  };
  const pasteRows = () => {
    if (!clip) { toast('Nothing copied yet'); return; }
    if (clip.level !== level) { toast(`Switch to the ${NAME[clip.level]}s tab to paste what you copied`, true); return; }
    duplicate(clip.rows, 1);
  };
  const seeCopied = () => toast(clip ? `Copied: ${clip.rows.map((r) => r.name).join(', ')}` : 'Nothing copied yet');
  // AI suggestions in the filter dropdown: sort the table by the metric they name
  const applySuggestion = (kind) => {
    const m = { top: { col: 'ctr', dir: 'desc' }, bottom: { col: 'ctr', dir: 'asc' }, lowcost: { col: 'cpr', dir: 'asc' } }[kind];
    if (!m) return;
    if (!cols.includes(m.col)) setCols((c) => [...c, m.col]);
    setSort(m); open('filter')(false);
  };
  const toolbarCtx = {
    clipboardCount: clip ? clip.rows.length : 0,
    level, viewer, noDelete, uniqueSelected, one, preset, cols, tw, breakdown, pane, menus, open, tip, comingSoon, toast, customOpen, setCustomOpen,
    actions: {
      create: () => setModal({ type: 'entity', mode: 'create', level, defaults: defaultsForCreate() }),
      duplicate: () => setDup({ list: uniqueSelected, copies: 1 }),
      quickDuplicate: () => duplicate(uniqueSelected, 1), copy: copyRows, paste: pasteRows, seeCopied,
      preview: () => { const ads = level === 'ad' ? uniqueSelected : []; if (!ads.length) { toast('Select an ad to preview it'); return; } setPreview(ads); },
      edit: () => setModal({ type: 'entity', mode: 'edit', level, entity: one }),
      turn: (on) => uniqueSelected.filter((r) => (r.status === 'on') !== on).forEach((r) => onToggle(r, on)),
      analyse: () => setAi(true),
      abTest: () => {},
      exportCSV, downloadTemplate,
      exportXLSX: () => downloadXLSX(toCSV(rows, cols.map((id) => colById[id]).filter(Boolean), totals, level), `ads-${level}-${range.from}_${range.to}.xlsx`), // the same table as the CSV, as a real Excel file
      addData: () => setModal({ type: 'stat', ad: one }),
      history: () => setDrawer({ entity: one }),
      remove: () => remove(uniqueSelected),
      setBreakdown,
      togglePane: () => setPane((p) => (p === 'charts' ? null : 'charts')),
      openCharts: () => setPane('charts'),
      viewCreativePerformance: () => { setLevel('ad'); setSort({ col: 'ctr', dir: 'desc' }); },
      createReport: () => setBreakdown('day'),
      setPresetCols, toggleCol,
      clearSelection: () => setSel((st) => ({ ...st, [level]: new Set() })),
    },
  };

  return (
    <div className={`shell ${narrow ? 'narrow' : ''}`}>
      <LeftRail toast={toast} comingSoon={comingSoon} />

      <div className="main">
        <TopBar level={level} user={user} initial={initial} narrow={narrow} updatedText={ago()} score={100} menus={menus} open={open} comingSoon={comingSoon} toast={toast}
          names={names} admin={admin} onSaveNames={saveNames} drafts={drafts.length} onPublish={() => clearDrafts(true)} onDiscard={() => clearDrafts(false)}
          onRefresh={() => { refresh(); toast('Refreshed'); }} onOpenAnalyse={() => setAi(true)} onProfile={() => setProfile(true)} onShortcuts={() => setShortcuts(true)}
          onReset={() => { if (window.confirm('Reset Ads Manager? This clears your saved date range, columns and quick views.')) resetApp(); }} />

        {/* ---------- quick views ---------- */}
        <QuickViewsBar items={QVB} qv={qv} views={views} applyQv={applyQv} tip={tip} showCreateButton={qv === 'all'}
          onEditView={(id) => { applyQv(id); setViewMode('edit'); setPane('view'); }}
          removeView={(id) => { setViews((vs) => vs.filter((x) => x.id !== id)); if (qv === id) setQv('all'); }}
          onCreateView={() => { setViewMode('create'); setPane('view'); }}
          onSettings={() => { setViewMode(qv === 'all' ? 'create' : 'edit'); setPane('view'); }} />

        {/* ---------- search / filters ---------- */}
        <SearchBar searchRef={searchRef} menus={menus} open={open} qvChips={qvChips} onRemoveQv={() => setQv('all')} filters={filters}
          onRemoveFilter={(i) => setFilters((fs) => fs.filter((_, j) => j !== i))} filterLabel={filterLabel} selOnly={selOnly} onClearSelOnly={() => setSelOnly(null)}
          search={search} setSearch={setSearch} hasAnyFilter={hasAnyFilter} onClearAll={clearAll}
          filterMenuProps={{ key: filterField || 'm', initial: filterField, levelName: levelName.replace(/^./, (c) => c.toUpperCase()), filters, setFilters, selectedCount: uniqueSelected.length,
            onSelectedOnly: () => setSelOnly(new Set(uniqueSelected.map(keyOf))), onSuggest: applySuggestion, comingSoon, close: () => open('filter')(false) }} />

        {/* ---------- level tabs + date ---------- */}
        <div className="tabsbar">
          <LevelTabs tabs={TABS} level={level} onSwitch={switchLevel} labelOf={tabLabel} selectedCount={cur.size} onClearSel={toolbarCtx.actions.clearSelection} tip={tip} />
          <div className="datewrap" ref={dateRef}>
            <button className="datebtn" onClick={() => setShowDate((v) => !v)}>
              <CalGlyph /><span>{rangeButtonLabel(range)}</span>{cr && <span className="vs">vs {rangeLabel(cr)}</span>}<Caret />
            </button>
            {showDate && <DatePicker value={range} minDate={tree.minDate} boundary={dateRef} onClose={() => setShowDate(false)}
              onApply={(s) => { setRange({ id: s.id, from: s.from, to: s.to, compare: s.compare || null }); setShowDate(false); }} />}
          </div>
        </div>

        <div className="card">
          <div className="tarea" ref={tareaRef}>
            <Toolbar t={toolbarCtx} />

            <Table level={level} rows={rows} totals={totals} cols={cols} sort={sort} setSort={setSort} selected={cur}
              toggleSel={toggleSel} toggleAll={toggleAll} onToggle={onToggle} onOpen={openChild} actions={rowActions} quick={quickList} onQuick={applyQv} onFilter={headFilter} colApi={colApi} admin={admin} onEditCell={editCell} onEditMedia={editMedia}
              hasPeriod={breakdown !== 'none'} loading={loading} compare={!!prevTotals} prevTotals={prevTotals}
              emptyKind={qv === 'actions' ? 'actions' : null} hideResults={hideResults} onHideResults={() => setHideResults((v) => !v)} />
          </div>

          {pane === 'view' && <ViewPanel ctx={{ cols, preset, sort, breakdown, filters, onAddFilter: () => open('filter')(true), onRemoveFilter: (i) => setFilters((fs) => fs.filter((_, j) => j !== i)) }} mode={viewMode} base={{ name: viewMode === 'edit' ? qvName : '' }} onSave={saveView} onClose={() => setPane(null)} />}
          {pane === 'charts' && <ComparePane from={range.from} to={range.to} adIds={chartAdIds} selectedRows={uniqueSelected} level={level} refreshKey={tick} onClose={() => setPane(null)} />}
        </div>
      </div>

      {/* ---------- right dark rail ---------- */}
      <RightRail viewer={viewer} selectedCount={uniqueSelected.length} onCharts={() => setPane((p) => (p === 'charts' ? null : 'charts'))}
        onEdit={() => (one ? setModal({ type: 'entity', mode: 'edit', level, entity: one }) : toast('Select one row, then click Edit'))} onHistory={() => setDrawer({})} />
      {preview && <AdPreviewModal ads={preview} toast={toast} onClose={() => setPreview(null)} />}
      {/* the round Meta AI button at the bottom right; its label appears to the left of it on hover, a click opens the assistant */}
      {!ai && (
        <button type="button" className="fid-aifab" aria-label="Meta AI business assistant" onClick={() => setAi(true)}>
          <MetaAILogo size={35} /><i className="fid-aifab-dot" aria-hidden="true" />
          <span className="fid-aifab-tip" role="tooltip">Meta AI business assistant</span>
        </button>
      )}
      {ai && <AnalysePanel ctx={{ rows, totals, prevTotals, level, rangeText: rangeLabel(range) }} onClose={() => setAi(false)} />}

      {profile && (
        <aside className="profile-pane" aria-label="Your profiles">
          <div className="pp-head"><div><h3>Your profiles</h3><p>These are your profiles for logging in to business tools, such as Ads Manager. You can save up to 10 profiles.</p></div><button className="pane-x" onClick={() => setProfile(false)} aria-label="Close"><X size={22} /></button></div>
          <div className="pp-me"><i className="pp-radio" /><span className="avatar sm">{initial}<i>f</i></span><b>{user}</b></div>
          <div className="pp-sec">Other saved profiles<ChevronDown size={18} style={{ transform: 'rotate(180deg)' }} /></div>
          <p className="pp-none">You don't have any saved profiles yet.</p>
          <button className="pp-other" onClick={onLogout}><UserPlus size={22} />Log in with another account</button>
          <p className="pp-note">Adding a user profile will turn on <b>saved profiles</b> on this device, so you can easily switch between profiles you use on business tools. Don't do this if you're using a shared device. You can remove profiles at any time.</p>
          <button className="pp-logout" onClick={onLogout}><LogOut size={20} />Log out</button>
        </aside>
      )}

      {modal?.type === 'entity' && (
        <EntityEditor key={modal.entity?.id || 'new'} {...modal} tree={tree} toast={toast} onClose={() => setModal(null)} onSaved={() => { setModal((m) => (m === modal ? null : m)); refresh(); }} />
      )}
      {modal?.type === 'stat' && <StatEditor ad={modal.ad} range={range} toast={toast} onClose={() => setModal(null)} onSaved={refresh} />}
      {dup && (
        <Modal title={`Duplicate ${dup.list.length} ${NAME[level]}${dup.list.length > 1 ? 's' : ''}`} onClose={() => setDup(null)}
          footer={<><button className="btn" onClick={() => setDup(null)}>Cancel</button><button className="btn primary" onClick={() => { const d = dup; setDup(null); duplicate(d.list, Math.min(5, Math.max(1, Math.floor(+d.copies) || 1))); }}>Duplicate</button></>}>
          <Field label="Number of copies"><input className="inp copies" type="number" min="1" max="5" value={dup.copies} onFocus={(e) => e.target.select()} onChange={(e) => setDup({ ...dup, copies: e.target.value })} /></Field>
          <p style={{ margin: 0, color: '#65676b', fontSize: 14 }}>Copies are created turned off and without performance data, so you can edit them before they start delivering.</p>
        </Modal>
      )}
      {shortcuts && (
        <Modal title="Keyboard shortcuts" onClose={() => setShortcuts(false)} footer={<button className="btn primary" onClick={() => setShortcuts(false)}>Done</button>}>
          {[['/', 'Search and filter'], ['Esc', 'Close the open panel or menu'], ['Ctrl + Shift + /', 'Show keyboard shortcuts'], ['Alt + 1 / 2 / 3', 'Campaigns / Ad sets / Ads'], ['Ctrl + Shift + D', 'Duplicate'], ['Ctrl + D', 'Quick duplicate'], ['Ctrl + C', 'Copy selected rows'], ['Ctrl + V', 'Paste copied rows']].map(([k, d]) => <div key={k} className="kb"><kbd>{k}</kbd><span>{d}</span></div>)}
        </Modal>
      )}
      {drawer && <HistoryDrawer key={drawer.entity ? drawer.entity.entityId || drawer.entity.id : 'all'} entity={drawer.entity} refreshKey={tick} onClose={() => setDrawer(null)} />}
      {toastMsg && <div className={`toast ${toastMsg.err ? 'err' : ''}`} role="status">{toastMsg.msg}</div>}
    </div>
  );
}
