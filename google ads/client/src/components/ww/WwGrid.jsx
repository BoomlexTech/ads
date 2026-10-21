import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown, HelpLink, Icon, MenuItem } from '../Common.jsx';
import { EditSelect, EditText } from '../Editable.jsx';
import {
  DASH, DAYS, DEVICES, LEVELS, PLACEMENT_TYPES, WW_ATTRS, WW_METRICS, WW_REC_HIDE, WW_REC_NOTE, WW_TABLES,
  allowedWw, colLabelWw, editTextWw, fmtAdGroupBidAdj, fmtBidAdj, fmtWw, helpWw, hourLabel, isExtra, isWwMetric, parseBidAdj,
  WW_ALL_METRICS,
} from '../../../../shared/whenwhere.js';
import './ww-grid.css';

// The report table of "When and where ads showed". Like the ads tables it is two tables that
// share their column widths: the header (pinned under the toolbar, with the summary rows that sit
// on top) and the body, scrolled sideways together by the bar pinned to the bottom of the window.
// Sizes follow the reference at 100% (its screenshots were taken at 125%).

const SIZES = [10, 30, 50, 100, 200, 500];
const OPEN_DELAY = 450;
const CLOSE_DELAY = 180;
const CARD_W = 320;
const OPEN_DELAY_NOTE = 300;
// The selection column: Devices has a wider one (its first label starts 64px in, the other
// tables' 56px in); with it the first, frozen column is 144px (143px) together.
const CHECK_W = { devices: 56, where: 48, locations: 48 };
const FIRST_W = { devices: 88, where: 95, locations: 95 };

// Starting width of a column; columns that don't fill the card all grow by the same amount.
function baseWidth(tab, k, first) {
  if (first) return FIRST_W[tab] ?? 96;
  if (k === 'campaign') return tab === 'where' ? 234 : 96;
  if (k === 'adGroup') return 216;
  if (k === 'bidAdj') return 112;
  if (WW_ATTRS[k]) return 96;
  if (k === 'cost' || k === 'costPerConv') return 88;
  return 80;
}

// Width of a run of cell text (12px Roboto), remembered: columns are measured on every render.
const widthCache = new Map();
let measureCtx = null;
function textW(s) {
  let w = widthCache.get(s);
  if (w == null) {
    if (!measureCtx) {
      measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = '400 12px Roboto, Arial, sans-serif';
    }
    w = measureCtx.measureText(s).width;
    widthCache.set(s, w);
  }
  return w;
}
// Hours and days stay on one line; figures wrap only between words ("11,805 clicks, engagements").
const ONE_LINE = new Set(['day', 'hour']);
function fitText(k, item, sym) {
  if (ONE_LINE.has(k)) {
    const v = item.attrs?.[k];
    if (v == null) return 0;
    return textW(typeof v === 'number' ? (k === 'day' ? DAYS[v] : hourLabel(v)) : String(v));
  }
  const v = item.values?.[k];
  let w = textW(fmtWw(k, v, sym));
  if (k === 'interactions' && item.words && v > 0) for (const word of item.words.split(' ')) w = Math.max(w, textW(word));
  return w;
}

const isNum = (k) => isWwMetric(k) || !!WW_ATTRS[k]?.num;
const show = (v) => (v == null || v === '' ? DASH : v);
const withCurrent = (list, v) => (v && !list.includes(v) ? [...list, v] : list);
const HOURS = Array.from({ length: 24 }, (_, h) => [String(h), hourLabel(h)]);
const DAY_OPTIONS = DAYS.map((d, i) => [String(i), d]);

// Hover card with an open delay that stays while the pointer is on its trigger or on the card.
function useHoverCard(openDelay) {
  const [card, setCard] = useState(null);
  const timers = useRef({});
  useEffect(() => () => {
    clearTimeout(timers.current.open);
    clearTimeout(timers.current.close);
  }, []);
  // The card is placed for where things are now: scrolling or resizing hides it.
  useEffect(() => {
    if (!card) return undefined;
    const hide = () => setCard(null);
    const main = document.getElementById('main');
    main?.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
    return () => {
      main?.removeEventListener('scroll', hide);
      window.removeEventListener('resize', hide);
    };
  }, [card]);
  const open = (make) => {
    clearTimeout(timers.current.close);
    clearTimeout(timers.current.open);
    timers.current.open = setTimeout(() => setCard(make()), openDelay);
  };
  const leave = () => {
    clearTimeout(timers.current.open);
    clearTimeout(timers.current.close);
    timers.current.close = setTimeout(() => setCard(null), CLOSE_DELAY);
  };
  const stay = () => clearTimeout(timers.current.close);
  const close = () => {
    clearTimeout(timers.current.open);
    clearTimeout(timers.current.close);
    setCard(null);
  };
  return { card, open, leave, stay, close };
}

// Moves a fixed card up (or left) so it stays inside the window once its size is known.
function useFit(card, place) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!card || !ref.current) return;
    const { offsetWidth: w, offsetHeight: h } = ref.current;
    setPos({ card, ...place(card, w, h) });
  }, [card]); // eslint-disable-line react-hooks/exhaustive-deps
  // Until measured it sits where asked (the fix lands before the browser paints).
  const style = pos?.card === card ? { left: pos.left, top: pos.top } : { left: card?.left, top: card?.top };
  return [ref, style];
}

// Column help under a header: centred on the label, its right edge on the label's centre when it
// would run off the window, moved up to the window's bottom edge when it is too tall.
function HelpCard({ card, onStay, onLeave, onHide }) {
  const [ref, style] = useFit(card, (c, w, h) => ({ left: c.left, top: c.top + h > window.innerHeight ? Math.max(0, window.innerHeight - h) : c.top }));
  if (!card) return null;
  const help = helpWw(card.key);
  if (!help) return null;
  const rec = !!WW_METRICS[card.key]?.rec;
  return createPortal(
    <div ref={ref} className="ww-g-tip" role="tooltip" data-testid="ww-help-card" style={style} onMouseEnter={onStay} onMouseLeave={onLeave}>
      <div className="ww-g-tip-body">
        {help.paras.map((p, i) => (
          <p key={i}>{typeof p === 'string' ? p : p.map((x, j) => (typeof x === 'string' ? x : <b key={j}>{x.b}</b>))}</p>
        ))}
        {help.link && <p><HelpLink topic="metrics">{help.link}</HelpLink></p>}
      </div>
      {rec && (
        <>
          <div className="ww-g-tip-sep" />
          <p className="ww-g-tip-note">{WW_REC_NOTE}<br /><HelpLink topic="columns" /></p>
          {onHide && <button type="button" className="ww-g-tip-hide" onClick={() => onHide(card.key)}>{WW_REC_HIDE}</button>}
        </>
      )}
    </div>,
    document.body,
  );
}

// What a total row's (?) covers: a small card just below and right of the icon.
function NoteCard({ card, onStay, onLeave }) {
  const [ref, style] = useFit(card, (c, w, h) => ({
    left: Math.max(8, Math.min(c.left, document.documentElement.clientWidth - w - 8)),
    top: c.top + h > window.innerHeight ? Math.max(0, c.anchorTop - h - 1) : c.top,
  }));
  if (!card) return null;
  return createPortal(
    <div ref={ref} className="ww-ttip" role="tooltip" data-testid="ww-total-tip" style={style} onMouseEnter={onStay} onMouseLeave={onLeave}>
      {card.text}
    </div>,
    document.body,
  );
}

// Number box for a figure: digits (and one decimal point where the column has decimals) only.
// Enter or leaving the box saves; Esc or an unchanged value cancels.
function NumInput({ metric, value, onCommit, onCancel }) {
  const start = editTextWw(metric, value);
  const [text, setText] = useState(start);
  const pattern = allowedWw(metric);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    if (text === start) onCancel();
    else onCommit(text);
  };
  return (
    <input className="ww-num-input" autoFocus value={text} aria-label={`Edit ${colLabelWw(metric)}`}
      inputMode={WW_ALL_METRICS[metric]?.kind === 'int' ? 'numeric' : 'decimal'}
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => { if (pattern.test(e.target.value)) setText(e.target.value); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { done.current = true; onCancel(); }
      }}
      onBlur={commit} />
  );
}

// A figure: the formatted value ("777 engagements" for interactions); admins double-click it to
// type a new one.
function FigureCell({ k, value, words, sym, canEdit, onSave, className = '' }) {
  const [editing, setEditing] = useState(false);
  const text = fmtWw(k, value, sym);
  return (
    <td className={`ww-num ${canEdit ? 'ww-editable' : ''} ${className}`} data-metric={k}
      title={canEdit && !editing ? 'Double-click to edit' : undefined}
      onDoubleClick={canEdit && !editing ? (e) => { e.preventDefault(); setEditing(true); } : undefined}>
      {editing
        ? <NumInput metric={k} value={value} onCancel={() => setEditing(false)} onCommit={(t) => { setEditing(false); onSave(k, t); }} />
        : (k === 'interactions' && words && value > 0 ? `${text} ${words}` : text)}
    </td>
  );
}

// Campaign name that opens the campaign. For admins a single click waits a moment, so a
// double-click can rename it instead.
function CampaignLink({ text, canEdit, onOpen }) {
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = (e) => {
    e.preventDefault();
    clearTimeout(timer.current);
    if (!canEdit || e.detail === 0) { onOpen(); return; }
    if (e.detail > 1) return;
    timer.current = setTimeout(onOpen, 280);
  };
  return <a href="#" className="ww-link" onClick={click} onDoubleClick={() => clearTimeout(timer.current)}>{text}</a>;
}

// Bid adjustment editor opened by the pencil: a percentage from -100 to 900, empty for none.
function BidEditor({ at, value, onSave, onClose }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [error, setError] = useState(false);
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const close = () => closeRef.current();
    const down = (e) => { if (!ref.current?.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const main = document.getElementById('main');
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    main?.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key, true);
      main?.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, []);
  const [fit, style] = useFit(at, (c, w) => ({ left: Math.max(8, Math.min(c.left, document.documentElement.clientWidth - w - 8)), top: c.top }));
  const save = () => {
    const v = parseBidAdj(text);
    if (v === undefined) { setError(true); return; }
    onSave(v == null ? '' : String(v));
  };
  return createPortal(
    <div ref={(el) => { ref.current = el; fit.current = el; }} className="ww-bid-pop" role="dialog" aria-label="Edit bid adjustment" style={style}>
      <div className="ww-bid-title">Bid adj.</div>
      <div className={`ww-bid-field ${error ? 'error' : ''}`}>
        <input autoFocus value={text} inputMode="numeric" aria-label="Bid adjustment, percent"
          onFocus={(e) => e.target.select()}
          onChange={(e) => { if (/^[-+]?\d{0,4}%?$/.test(e.target.value)) { setText(e.target.value); setError(false); } }}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <span className="ww-bid-pct">%</span>
      </div>
      <div className={`ww-bid-hint ${error ? 'error' : ''}`}>
        {error ? 'Enter a percentage from -100 to 900' : 'From -100% to +900%. Leave empty for none.'}
      </div>
      <div className="ww-bid-actions">
        <button type="button" className="ww-g-tbtn" onClick={onClose}>Cancel</button>
        <button type="button" className="ww-g-tbtn" onClick={save}>Save</button>
      </div>
    </div>,
    document.body,
  );
}

// "Move to campaign": a folder with an arrow (not in the icon font).
function MoveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor">
      <path d="m480-280 160-160-160-160-56 56 64 64H320v80h168l-64 64 56 56ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor">
      <path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Z" />
    </svg>
  );
}
// First / last page: a chevron against a bar (the icon font has no glyph for these).
function EdgeIcon({ last }) {
  return (
    <svg width="32" height="32" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor">
      <path d={last
        ? 'm280-240-56-56 184-184-184-184 56-56 240 240-240 240Zm360 0v-480h80v480h-80Z'
        : 'M240-240v-480h80v480h-80Zm440 0L440-480l240-240 56 56-184 184 184 184-56 56Z'} />
    </svg>
  );
}

// Admin row tools: onRemove(ids, n) removes stored rows `ids` that make up n table rows (a row's
// trash can, or the ticked rows); onMove(ids, campaignId) moves them to one of `campaigns`.
export default function WwGrid({
  tab, columns, rows, totals = [], totalPos = 'bottom', sort, onSort, canEdit, onEditMetric, onEditField, onHideColumn,
  onCampaign, segments, pageSize = 100, onPageSize, page = 0, onPage, emptyText, sym, stickyTop = 0, selectable,
  onDuplicate, duplicateOff, onRemove, campaigns = [], onMove,
}) {
  const rootRef = useRef(null);
  const wrapRef = useRef(null);
  const headRef = useRef(null);
  const bodyRef = useRef(null);
  const barRef = useRef(null);
  const allRef = useRef(null);
  const [avail, setAvail] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const [bidEdit, setBidEdit] = useState(null);
  const tips = useHoverCard(OPEN_DELAY);
  const notes = useHoverCard(OPEN_DELAY_NOTE);

  const check = !!selectable;
  const hasRows = rows.length > 0;
  const checkW = check ? (CHECK_W[tab] ?? 56) : 0;
  const frozenKeys = WW_TABLES[tab]?.frozen || [];
  let frozenCount = 0;
  while (frozenCount < columns.length && frozenKeys.includes(columns[frozenCount])) frozenCount++;
  const hasFrozen = frozenCount > 0;

  // Column widths: the reference sizes (wider where a figure or an hour wouldn't fit), each grown by
  // the same amount when they don't fill the card.
  const colKey = columns.join('|');
  // Measured again once the web font has loaded (before that the fallback font's widths are used).
  const [fontsOk, setFontsOk] = useState(() => document.fonts?.status === 'loaded');
  useEffect(() => {
    if (fontsOk || !document.fonts) return undefined;
    let live = true;
    document.fonts.ready.then(() => {
      if (!live) return;
      widthCache.clear();
      setFontsOk(true);
    });
    return () => { live = false; };
  }, [fontsOk]);
  const fits = useMemo(() => {
    // Total rows only show with rows.
    const items = rows.length ? [...rows, ...totals, ...Object.values(segments || {}).flat()] : [];
    return columns.map((k, i) => {
      if (!isWwMetric(k) && !ONE_LINE.has(k)) return 0;
      let w = 0;
      for (const it of items) w = Math.max(w, fitText(k, it, sym));
      // Paddings, the column line and a pixel to spare.
      const pad = (i === 0 && !check ? 16 : 8) + (i === columns.length - 1 ? 16 : 8) + 2;
      return w ? Math.ceil(w + pad) : 0;
    });
  }, [rows, totals, segments, colKey, sym, check, fontsOk]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = columns.map((k, i) => Math.max(baseWidth(tab, k, i === 0 && check), fits[i] || 0));
  const baseTotal = checkW + base.reduce((a, b) => a + b, 0);
  const extra = avail > baseTotal && columns.length ? (avail - baseTotal) / columns.length : 0;
  const widths = base.map((w) => w + extra);
  const total = extra ? avail : baseTotal;
  const lefts = [];
  let x = checkW;
  for (let i = 0; i < frozenCount; i++) { lefts.push(x); x += widths[i]; }
  const frozenW = hasFrozen ? x : 0;
  const colgroup = (
    <colgroup>
      {check && <col style={{ width: checkW }} />}
      {widths.map((w, i) => <col key={columns[i]} style={{ width: w }} />)}
    </colgroup>
  );
  const tableStyle = { width: total };

  // Per-column classes: alignment, the outer paddings, the frozen block and its edge.
  const meta = columns.map((k, i) => {
    const sticky = i < frozenCount;
    const cls = [
      isNum(k) && 'ww-num',
      i === 0 && !check && 'ww-first',
      i === columns.length - 1 && 'ww-last',
      sticky && 'ww-sticky',
      sticky && i === frozenCount - 1 && 'ww-edge',
      k === 'bidAdj' && 'ww-c-bidAdj',
      ONE_LINE.has(k) && 'ww-nowrap',
    ].filter(Boolean).join(' ');
    return { k, i, cls, style: sticky ? { left: lefts[i] } : undefined };
  });

  // ---- sizes, sideways scrolling and the pinned header's shadow
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () => setAvail(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const syncFrom = (src) => {
    const left = src.scrollLeft;
    for (const el of [headRef.current, bodyRef.current, barRef.current]) {
      if (el && el !== src && el.scrollLeft !== left) el.scrollLeft = left;
    }
    setScrolled(left > 0);
  };
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    // The table's width, not the body's scroll width: with no rows the body has no height to scroll.
    const measure = () => {
      setOverflow(total > body.clientWidth + 1);
      if (hasRows) syncFrom(body);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => ro.disconnect();
  }, [total, hasRows]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sideways wheel / trackpad over the header scrolls the columns (and not the page sideways).
  useEffect(() => {
    const head = headRef.current;
    if (!head) return undefined;
    // Moves the bottom bar (it can scroll even when there are no rows); the rest follow it.
    const onWheel = (e) => {
      const bar = barRef.current;
      if (!bar) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? bar.clientWidth : 1;
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
      if (!dx) return;
      const max = bar.scrollWidth - bar.clientWidth;
      if (dx < 0 ? bar.scrollLeft <= 0 : bar.scrollLeft >= max - 1) return;
      e.preventDefault();
      bar.scrollLeft += dx;
      if (!e.shiftKey && e.deltaY) {
        const main = document.getElementById('main');
        if (main) main.scrollTop += e.deltaY * unit;
      }
    };
    head.addEventListener('wheel', onWheel, { passive: false });
    return () => head.removeEventListener('wheel', onWheel);
  }, []);
  // Once the header is pinned (the table has scrolled under it) it casts a shadow.
  useEffect(() => {
    const main = document.getElementById('main');
    const look = () => {
      const w = wrapRef.current;
      const g = rootRef.current;
      if (w && g) setStuck(w.getBoundingClientRect().top - g.getBoundingClientRect().top > 0.5);
    };
    look();
    main?.addEventListener('scroll', look, { passive: true });
    window.addEventListener('resize', look);
    return () => {
      main?.removeEventListener('scroll', look);
      window.removeEventListener('resize', look);
    };
  }, []);

  // ---- paging and selection
  const n = rows.length;
  const size = pageSize > 0 ? pageSize : 100;
  const lastPage = Math.max(0, Math.ceil(n / size) - 1);
  const pg = Math.min(Math.max(0, page || 0), lastPage);
  const from = pg * size;
  const pageRows = rows.slice(from, from + size);
  const goPage = (p) => onPage?.(Math.min(Math.max(0, p), lastPage));

  useEffect(() => { setChecked(new Set()); }, [tab]);
  // Rows that left the table (filtered out, removed) are no longer selected.
  useEffect(() => {
    setChecked((s) => {
      if (!s.size) return s;
      const keys = new Set(rows.map((r) => r.key));
      const next = new Set([...s].filter((k) => keys.has(k)));
      return next.size === s.size ? s : next;
    });
  }, [rows]);
  const allOn = pageRows.length > 0 && pageRows.every((r) => checked.has(r.key));
  const someOn = pageRows.some((r) => checked.has(r.key));
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = someOn && !allOn; }, [someOn, allOn]);
  const toggleRow = (key) => setChecked((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const toggleAll = () => setChecked((s) => {
    const next = new Set(s);
    for (const r of pageRows) {
      if (allOn) next.delete(r.key);
      else next.add(r.key);
    }
    return next;
  });
  const pickedIds = () => rows.filter((r) => checked.has(r.key)).flatMap((r) => r.rowIds || []);
  const clearPicked = () => setChecked(new Set());

  // ---- editing (admin)
  const can = (row, k) => !!canEdit && (row.editable ? !!row.editable[k] : true);
  const figureOk = (ids) => !!canEdit && !!onEditMetric && (ids?.length ?? 0) > 0;
  const field = (row, name) => (v) => onEditField?.(row.rowIds, name, v);

  // ---- header
  const showTip = (e, k) => {
    if (!helpWw(k)) return;
    const th = e.currentTarget;
    tips.open(() => {
      const tr = th.getBoundingClientRect();
      const lr = (th.querySelector('.ww-th-label') || th).getBoundingClientRect();
      // The part of the label in sight: inside its cell and right of the frozen columns.
      const minX = th.classList.contains('ww-sticky') ? tr.left : Math.max(tr.left, (headRef.current?.getBoundingClientRect().left ?? 0) + frozenW);
      const l = Math.max(lr.left, minX);
      const r = Math.max(l, Math.min(lr.right, tr.right));
      const center = (l + r) / 2;
      const vw = document.documentElement.clientWidth;
      let left = center - CARD_W / 2;
      if (left + CARD_W > vw - 8) left = center - CARD_W;
      return { key: k, left: Math.max(8, left), top: tr.bottom - 3 };
    });
  };
  const headCell = (m) => {
    const { k } = m;
    const sorted = sort?.key === k;
    const rec = !!WW_METRICS[k]?.rec;
    const doSort = () => { tips.close(); onSort?.(k); };
    return (
      <th key={k} className={`${m.cls} ${sorted ? 'ww-sorted' : ''}`} style={m.style} data-col={k} tabIndex={0}
        aria-sort={sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
        onClick={doSort} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSort(); } }}
        onMouseEnter={(e) => showTip(e, k)} onMouseLeave={tips.leave}>
        <div className="ww-th-in">
          {sorted && <Icon name={sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward'} className="ww-sort" size={16} />}
          <span className="ww-th-label"><span className={rec ? 'ww-dash' : undefined}>{colLabelWw(k)}</span></span>
        </div>
      </th>
    );
  };

  // ---- body cells
  const attrContent = (row, k) => {
    const a = row.attrs || {};
    const v = a[k];
    const ok = can(row, k);
    switch (k) {
      case 'device':
        return <EditSelect value={v ?? ''} options={withCurrent(DEVICES, v)} canEdit={ok} label="device" onSave={field(row, 'device')}>{show(v)}</EditSelect>;
      case 'level':
        return <EditSelect value={v ?? ''} options={withCurrent(LEVELS, v)} canEdit={ok} label="level" onSave={field(row, 'level')}>{show(v)}</EditSelect>;
      case 'placementType':
        return <EditSelect value={v ?? ''} options={withCurrent(PLACEMENT_TYPES, v)} canEdit={ok} label="type" onSave={field(row, 'placementType')}>{show(v)}</EditSelect>;
      case 'day': {
        const d = a.dow ?? (typeof v === 'number' ? v : DAYS.indexOf(v));
        return (
          <EditSelect value={d >= 0 ? String(d) : ''} options={DAY_OPTIONS} canEdit={ok && d >= 0} label="day" onSave={(s) => onEditField?.(row.rowIds, 'dow', Number(s))}>
            {typeof v === 'number' ? DAYS[v] : show(v)}
          </EditSelect>
        );
      }
      case 'hour': {
        const h = a.hourNum ?? (typeof v === 'number' ? v : HOURS.findIndex(([, l]) => l === v));
        return (
          <EditSelect value={h >= 0 ? String(h) : ''} options={HOURS} canEdit={ok && h >= 0} label="hour" onSave={(s) => onEditField?.(row.rowIds, 'hour', Number(s))}>
            {typeof v === 'number' ? hourLabel(v) : show(v)}
          </EditSelect>
        );
      }
      case 'addedTo':
      case 'campaign': {
        const c = v && typeof v === 'object' ? v : { text: v };
        return (
          <EditText value={c.text ?? ''} canEdit={ok} label="campaign" maxLength={100} onSave={field(row, 'campaignLabel')}>
            {c.text ? <CampaignLink text={c.text} canEdit={ok} onOpen={() => { if (c.campaignId) onCampaign?.(c.campaignId); }} /> : DASH}
          </EditText>
        );
      }
      case 'placement':
      case 'adGroup':
      case 'location':
        return (
          <EditText value={v ?? ''} canEdit={ok} label={colLabelWw(k).toLowerCase()} maxLength={k === 'placement' ? 120 : 100} onSave={field(row, k)}>
            {v ? <span className="ww-linktext">{v}</span> : DASH}
          </EditText>
        );
      default:
        return show(v);
    }
  };
  const bodyCell = (row, m) => {
    const { k } = m;
    if (isWwMetric(k)) {
      return (
        <FigureCell key={k} k={k} value={row.values?.[k]} words={row.words} sym={sym} className={m.cls}
          canEdit={figureOk(row.rowIds)} onSave={(key, t) => onEditMetric(row.rowIds, key, t)} />
      );
    }
    const v = row.attrs?.[k];
    if (k === 'bidAdj') {
      return (
        <td key={k} className={m.cls} style={m.style} data-metric="bidAdj">
          {fmtBidAdj(v)}
          {can(row, k) && onEditField && (
            <button type="button" className="ww-pencil" aria-label="Edit bid adjustment" title="Edit bid adjustment"
              onClick={(e) => {
                const r = e.currentTarget.closest('td').getBoundingClientRect();
                setBidEdit({ row, at: { left: r.left, top: r.top } });
              }}>
              <Icon name="edit" size={18} fill />
            </button>
          )}
        </td>
      );
    }
    if (k === 'adGroupBidAdj') {
      return (
        <td key={k} className={m.cls} style={m.style} data-metric="adGroupBidAdj">
          <EditText value={v == null ? '' : String(v)} canEdit={can(row, k)} label="ad group bid adjustment" maxLength={6}
            onSave={field(row, 'adGroupBidAdj')}>{fmtAdGroupBidAdj(v)}</EditText>
        </td>
      );
    }
    return (
      <td key={k} className={m.cls} style={m.style}>
        <div className="ww-txt">{attrContent(row, k)}</div>
      </td>
    );
  };

  // The frozen block (or the first column) of a total or segment row: one cell across it.
  const spanCols = Math.max(1, frozenCount);
  const leadCell = (content) => (
    <td className={`ww-lead ${hasFrozen ? 'ww-sticky ww-edge' : ''} ${spanCols === columns.length ? 'ww-last' : ''}`}
      colSpan={(check ? 1 : 0) + spanCols} style={hasFrozen ? { left: 0 } : undefined}>
      {content}
    </td>
  );
  // okKey(k): whether that figure of the line can be edited (all of them when not given).
  const restCells = (values, words, onSave, okKey) => meta.slice(spanCols).map((m) => (isWwMetric(m.k)
    ? <FigureCell key={m.k} k={m.k} value={values?.[m.k]} words={words} sym={sym} className={m.cls} canEdit={!!onSave && (!okKey || okKey(m.k))} onSave={onSave} />
    : <td key={m.k} className={`${m.cls} ww-blank`} style={m.style} />));

  const totalRow = (t) => {
    // Where the label starts (reference shots 89–91): a top total at the checkboxes' edge, the
    // bottom totals where the first column's text starts, the campaign type totals 16px further in,
    // and the account total after its show/hide arrow. Without a checkbox column every label sits
    // at the cell's padding. A label that doesn't fit is cut with an ellipsis before its (?).
    const top = (t.pos || totalPos) === 'top';
    const pad = !check ? 8 : top ? 24 : t.indent ? 71 : t.toggle ? 52 : 55;
    // A total's rowIds may include rows without figures in the range (so a total that reads 0 can
    // be typed in); typed-in columns, kept per row, go to the rows it adds up (extraIds).
    const idsFor = (k) => (isExtra(k) && t.extraIds ? t.extraIds : t.rowIds);
    const save = canEdit && onEditMetric ? (k, text) => onEditMetric(idsFor(k), k, text) : null;
    return (
      <tr key={t.key} className={`ww-total ${t.indent ? 'ww-sub' : ''} ${t.toggle ? 'ww-acct' : ''}`} data-testid="ww-total">
        {leadCell(
          <div className={`ww-tl ${t.toggle ? 'has-toggle' : ''}`} style={{ paddingLeft: pad }}>
            {t.toggle && (
              <button type="button" className="ww-tl-toggle" aria-expanded={!!t.open}
                aria-label={t.open ? 'Hide the campaign type totals' : 'Show the campaign type totals'} onClick={() => t.onToggle?.()}>
                <Icon name={t.open ? 'expand_less' : 'expand_more'} />
              </button>
            )}
            <span className="ww-tl-text">{t.label}</span>
            {t.help && (
              <span className="ww-help-hit" data-testid="ww-total-help"
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  notes.open(() => ({ text: t.help, left: r.right + 1, top: r.bottom + 1, anchorTop: r.top }));
                }}
                onMouseLeave={notes.leave}>
                <Icon name="help" size={18} />
              </span>
            )}
          </div>,
        )}
        {restCells(t.values, t.words, save, (k) => figureOk(idsFor(k)))}
      </tr>
    );
  };

  const segRows = (row) => (segments?.[row.key] || []).map((s) => {
    // A Day of the week part spans the whole range: its weekday narrows the edit to that day's figures.
    const save = figureOk(row.rowIds) ? (k, text) => onEditMetric(row.rowIds, k, text, { from: s.from, to: s.to, dow: s.dow }) : null;
    return (
      <tr key={`${row.key}~${s.key}`} className="ww-row ww-seg" data-testid="ww-segment-row">
        {leadCell(<div className="ww-seg-label" style={{ paddingLeft: (check ? checkW + 8 : 16) + 16 }} data-metric="live">{s.label}</div>)}
        {/* Typed-in columns are kept per row, not per period: here they always read as a dash, and
            an edit would change the whole row for every range, so they can't be edited. */}
        {restCells(s.values, s.words, save, (k) => !isExtra(k))}
      </tr>
    );
  });

  const empty = n === 0;
  const top = empty ? [] : totals.filter((t) => (t.pos || totalPos) === 'top');
  const bottom = empty ? [] : totals.filter((t) => (t.pos || totalPos) !== 'top');
  const picked = canEdit ? rows.filter((r) => checked.has(r.key)).length : 0;

  return (
    <div ref={rootRef} className={`ww-grid ${scrolled ? 'ww-scrolled' : ''}`} data-testid="ww-grid" data-tab={tab}>
      <div ref={wrapRef} className={`ww-headwrap ${stuck ? 'ww-stuck' : ''}`} style={{ top: stickyTop }}>
        <div className="ww-head" ref={headRef} onScroll={(e) => syncFrom(e.currentTarget)} data-testid="ww-head">
          <table className="ww-table" style={tableStyle} role="presentation">
            {colgroup}
            <thead>
              <tr>
                {check && (
                  <th className="ww-check ww-sticky" style={{ left: 0 }}>
                    <input ref={allRef} type="checkbox" aria-label="Select all rows" checked={allOn} disabled={empty} onChange={toggleAll} />
                  </th>
                )}
                {meta.map(headCell)}
              </tr>
            </thead>
            {top.length > 0 && <tbody>{top.map(totalRow)}</tbody>}
          </table>
        </div>
        {picked > 0 && (
          // Over the column headers while rows are ticked (the select-all box stays in sight).
          <div className="ww-selbar" style={{ left: checkW }} data-testid="ww-selbar">
            <span className="ww-sel-count"><span data-metric="live">{picked}</span> selected</span>
            {onDuplicate && (
              // duplicateOff: why copies can't be made here, shown on hover instead of copying.
              <button type="button" className={`ww-sel-btn ${duplicateOff ? 'off' : ''}`} aria-disabled={duplicateOff ? true : undefined}
                aria-description={duplicateOff || undefined} data-tip={duplicateOff || undefined}
                onClick={duplicateOff ? undefined : () => { const ids = pickedIds(); clearPicked(); onDuplicate(ids); }}>
                <CopyIcon />Duplicate
              </button>
            )}
            {onMove && campaigns.length > 0 && (
              // The ticked rows (with their figures) go to another campaign.
              <Dropdown className="ww-sel-dd" panelClass="ww-move-pop" trigger={(open, toggle) => (
                <button type="button" className={`ww-sel-btn ${open ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                  <MoveIcon />Move to campaign<Icon name="arrow_drop_down" size={20} className="ww-sel-caret" />
                </button>
              )}>
                {(close) => (
                  <div className="menu ww-move-menu" role="menu">
                    <div className="menu-title">Move to campaign</div>
                    {campaigns.map((c) => (
                      <MenuItem key={c.id} role="menuitem" onClick={() => { close(); const ids = pickedIds(); clearPicked(); onMove(ids, c.id); }}>{c.name}</MenuItem>
                    ))}
                  </div>
                )}
              </Dropdown>
            )}
            {onRemove && (
              // The ticks stay until the rows are gone (the page asks first; Cancel keeps them).
              <button type="button" className="ww-sel-btn danger" onClick={() => onRemove(pickedIds(), picked)}>
                <Icon name="delete" size={18} />Remove
              </button>
            )}
            <button type="button" className="ww-sel-close" aria-label="Clear selection" onClick={clearPicked}><Icon name="close" size={20} /></button>
          </div>
        )}
      </div>
      {empty && emptyText && (
        <div className="ww-empty" data-testid="ww-empty"><span className="ww-empty-text">{emptyText}</span></div>
      )}
      <div className="ww-body" ref={bodyRef} onScroll={(e) => syncFrom(e.currentTarget)}>
        <table className="ww-table" style={tableStyle}>
          {colgroup}
          {/* Hidden header row so screen readers can name each column. */}
          <thead className="ww-sr">
            <tr>
              {check && <th scope="col"><span className="sr-only">Select</span></th>}
              {columns.map((k) => (
                <th key={k} scope="col" aria-sort={sort?.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <span className="sr-only">{colLabelWw(k)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => [
              <tr key={row.key} className="ww-row" data-testid="ww-row" data-key={row.key}>
                {check && (
                  <td className="ww-check ww-sticky" style={{ left: 0 }}>
                    <input type="checkbox" aria-label="Select row" checked={checked.has(row.key)} onChange={() => toggleRow(row.key)} />
                    {/* Admin: removes this row (every stored row it adds up), after the page asks. */}
                    {canEdit && onRemove && (
                      <button type="button" className="ww-row-del" aria-label="Remove row" title="Remove row" data-testid="ww-row-del"
                        onClick={() => onRemove(row.rowIds, 1)}>
                        <Icon name="delete" />
                      </button>
                    )}
                  </td>
                )}
                {meta.map((m) => bodyCell(row, m))}
              </tr>,
              ...segRows(row),
            ])}
            {bottom.map(totalRow)}
          </tbody>
        </table>
      </div>
      {/* Starts at the frozen columns' right edge; same scroll range as the body. */}
      <div className={`ww-hscroll ${overflow ? '' : 'ww-none'}`} ref={barRef} onScroll={(e) => syncFrom(e.currentTarget)}
        style={{ marginLeft: frozenW }} data-testid="ww-hscroll">
        <div style={{ width: Math.max(0, total - frozenW), height: 1 }} />
      </div>
      {!empty && (
        <div className="ww-pager" data-testid="ww-pager">
          <span className="ww-pg-label">Show rows:</span>
          <Dropdown className="ww-rows" panelClass="ww-rows-pop"
            trigger={(open, toggle) => (
              <button type="button" className={`ww-rows-btn ${open ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open}
                aria-label="Rows per page" onClick={toggle}>
                <span data-metric="live">{size}</span>
                <Icon name="arrow_drop_down" size={24} />
              </button>
            )}>
            {(close) => (
              <div className="ww-rows-menu" role="listbox" aria-label="Rows per page">
                {SIZES.map((s) => (
                  <button key={s} type="button" role="option" aria-selected={s === size} className={`ww-rows-item ${s === size ? 'selected' : ''}`}
                    onClick={() => { close(); if (s !== size) { onPageSize?.(s); onPage?.(0); } }}>{s}</button>
                ))}
              </div>
            )}
          </Dropdown>
          <span className="ww-range" data-metric="live">
            {`${(from + 1).toLocaleString('en-US')} - ${(from + pageRows.length).toLocaleString('en-US')} of ${n.toLocaleString('en-US')}`}
          </span>
          <button type="button" className="ww-pg-btn" aria-label="First page" disabled={pg === 0} onClick={() => goPage(0)}><EdgeIcon /></button>
          <button type="button" className="ww-pg-btn" aria-label="Previous page" disabled={pg === 0} onClick={() => goPage(pg - 1)}>
            <Icon name="chevron_left" size={32} />
          </button>
          <button type="button" className="ww-pg-btn" aria-label="Next page" disabled={pg >= lastPage} onClick={() => goPage(pg + 1)}>
            <Icon name="chevron_right" size={32} />
          </button>
          <button type="button" className="ww-pg-btn" aria-label="Last page" disabled={pg >= lastPage} onClick={() => goPage(lastPage)}><EdgeIcon last /></button>
        </div>
      )}
      <HelpCard card={tips.card} onStay={tips.stay} onLeave={tips.leave}
        onHide={onHideColumn ? (k) => { tips.close(); onHideColumn(k); } : undefined} />
      <NoteCard card={notes.card} onStay={notes.stay} onLeave={notes.leave} />
      {bidEdit && (
        <BidEditor at={bidEdit.at} value={bidEdit.row.attrs?.bidAdj ?? null} onClose={() => setBidEdit(null)}
          onSave={(v) => { const ids = bidEdit.row.rowIds; setBidEdit(null); onEditField?.(ids, 'bidAdj', v); }} />
      )}
    </div>
  );
}
