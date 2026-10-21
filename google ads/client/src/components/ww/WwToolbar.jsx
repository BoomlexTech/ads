import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dropdown, Icon, MenuItem } from '../Common.jsx';
import { WW_TABLES, WW_SECTIONS, WW_ATTRS, colLabelWw, sectionItems, isWwMetric } from '../../../../shared/whenwhere.js';
import { WW_DOWNLOAD_FORMATS } from './wwExport.js';
import { NEW_ROW_LABEL } from './WwAddRow.jsx';
import './ww-toolbar.css';

// Table toolbar of When and where ads showed: the filters on the left (funnel, Level chip on
// Devices, Add filter), the table tools on the right (they differ per tab), their menus and the
// Download dialog. Menus open in a layer over the whole window (the Download menu reaches up over
// the app bar), placed next to their button the way each one opens in the reference.

const GAP = 6; // menus stay this far inside the window
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

// Placements: (button rect, natural menu size, window size) -> { top, left, maxHeight?, minWidth? }.
const PLACE = {
  // Right under the button, left edges lined up.
  below: (a, s, v) => ({ top: a.bottom, left: clamp(a.left, GAP, v.w - s.w - GAP), maxHeight: v.h - a.bottom - GAP }),
  // Under a field, at least as wide as it.
  field: (a, s, v) => ({ top: a.bottom, left: clamp(a.left, GAP, v.w - Math.max(s.w, a.width) - GAP), maxHeight: v.h - a.bottom - GAP, minWidth: a.width }),
  // Level popover: a little below its chip.
  chip: (a, s, v) => ({ top: a.bottom + 9, left: clamp(a.left, GAP, v.w - s.w - GAP), maxHeight: v.h - a.bottom - 9 - GAP }),
  // Add filter menu: over the link, its search row level with the bottom of the chip row.
  addFilter: (a, s, v) => {
    const top = a.top + a.height / 2 + 16;
    return { top, left: clamp(a.left + 2, GAP, v.w - s.w - GAP), maxHeight: v.h - top - GAP };
  },
  // Segment: centred under the button; when that runs past the window bottom, to the left of the
  // button, centred on it.
  segment: (a, s, v) => {
    const top = a.bottom - 1;
    if (top + s.h <= v.h - GAP) return { top, left: clamp(a.left + a.width / 2 - s.w / 2, GAP, v.w - s.w - GAP) };
    return { top: clamp(a.top + a.height / 2 - s.h / 2, GAP, v.h - s.h - GAP), left: Math.max(GAP, a.left - s.w) };
  },
  // Download: to the left of the button, bottoms lined up, growing upward and scrolling when the
  // window is too short; downward instead when there is clearly more room below.
  download: (a, s, v) => {
    const left = Math.max(GAP, a.left - s.w);
    const up = a.bottom - GAP;
    const down = v.h - a.top - GAP;
    if (s.h <= up || up >= down) {
      const h = Math.min(s.h, up);
      return { top: a.bottom - h, left, maxHeight: h };
    }
    return { top: a.top, left, maxHeight: down };
  },
};

let scrollbar = null;
function scrollbarWidth() {
  if (scrollbar == null) {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;top:-200px;width:100px;height:100px;overflow:scroll;';
    document.body.appendChild(d);
    scrollbar = d.offsetWidth - d.clientWidth;
    d.remove();
  }
  return scrollbar;
}

// Open layers (menus, popovers, the dialog), newest last: Esc and outside clicks close the newest.
const layers = [];
function useLayer(onClose, panel, anchors) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const me = {};
    layers.push(me);
    const isTop = () => layers[layers.length - 1] === me;
    // Esc pressed outside the layer (inside, its own onKeyDown runs after any submenu had its turn).
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.isComposing || !isTop() || panel.current?.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      closeRef.current(true);
    };
    const onDown = (e) => {
      const t = e.target;
      if (panel.current?.contains(t) || anchors.some((r) => r.current?.contains(t))) return;
      // A layer opened on top (the dialog's format list) handles its own clicks.
      if (!isTop() && t.closest?.('.ww-layer')) return;
      closeRef.current(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      layers.splice(layers.indexOf(me), 1);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

const FOCUSABLE = 'button.menu-item:not(:disabled), button.ww-addf-head, input.ww-menu-input';

// A menu or popover in its own layer, placed by `place` next to anchors[0]. Focus moves to its
// first item (`focus`), as the reference menus open with their first row highlighted.
function Pop({ anchors, place, onClose, focus = 'button.menu-item:not(:disabled)', className = '', children }) {
  const panel = useRef(null);
  useLayer((byKey) => {
    onClose();
    if (byKey) anchors[0].current?.focus();
  }, panel, anchors);
  useLayoutEffect(() => {
    const p = panel.current;
    const fit = () => {
      const a = anchors[0].current;
      if (!a || !p) return;
      const keep = p.scrollTop;
      p.style.width = '';
      p.style.minWidth = '';
      p.style.maxHeight = '';
      p.style.overflowY = '';
      const rect = a.getBoundingClientRect();
      const win = { w: window.innerWidth, h: window.innerHeight };
      const size = { w: p.offsetWidth, h: p.offsetHeight };
      let at = place(rect, size, win);
      const scrolls = at.maxHeight != null && at.maxHeight < size.h;
      // A scrolling menu is wider by its scrollbar; place it again at that width.
      if (scrolls) at = place(rect, { ...size, w: size.w + scrollbarWidth() }, win);
      p.style.top = `${Math.round(at.top)}px`;
      p.style.left = `${Math.round(at.left)}px`;
      if (at.minWidth) p.style.minWidth = `${at.minWidth}px`;
      if (scrolls) {
        p.style.maxHeight = `${Math.max(48, at.maxHeight)}px`;
        p.style.overflowY = 'auto';
        p.style.width = `${size.w + scrollbarWidth()}px`;
        p.scrollTop = keep;
      }
      p.style.visibility = 'visible';
    };
    fit();
    p.querySelector(focus)?.focus({ preventScroll: true });
    const main = document.getElementById('main');
    main?.addEventListener('scroll', fit, { passive: true });
    window.addEventListener('resize', fit);
    // Sections that open, search results: the menu changes size.
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    if (p.firstElementChild) ro?.observe(p.firstElementChild);
    return () => {
      main?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
      ro?.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      anchors[0].current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const menu = e.target.closest('.ww-menu');
    if (!menu) return;
    const items = [...menu.querySelectorAll(FOCUSABLE)].filter((el) => el.closest('.ww-menu') === menu);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(e.target);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
  };

  return createPortal(
    <div ref={panel} className={`ww-pop ww-layer ${className}`} onKeyDown={onKeyDown}>{children}</div>,
    document.body,
  );
}

// The pointer moves the highlight (focus) to the row under it, as in the reference menus, except
// while the menu's search box is being typed in.
function hoverFocus(e) {
  const el = e.currentTarget;
  if (!el.disabled && !document.activeElement?.matches?.('input, textarea')) el.focus({ preventScroll: true });
}

// A menu row.
function Item({ children, ...rest }) {
  return <MenuItem role="menuitem" onMouseEnter={hoverFocus} {...rest}>{children}</MenuItem>;
}

// A row that opens a submenu flush against the menu's right edge: top-aligned with the row, or
// centred on it when that would run past the window bottom.
function SubMenu({ label, children }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const sub = useRef(null);
  useLayoutEffect(() => {
    const s = sub.current;
    if (!open || !s) return;
    const row = wrap.current.getBoundingClientRect();
    const h = s.offsetHeight;
    let top = row.top + h > window.innerHeight - GAP ? row.height / 2 - h / 2 : 0;
    top = clamp(top, GAP - row.top, window.innerHeight - GAP - h - row.top);
    s.style.top = `${Math.round(top)}px`;
    // No room on the right: open on the left side instead.
    s.classList.toggle('ww-left', row.right + s.offsetWidth > window.innerWidth - GAP);
  }, [open]);
  const first = () => requestAnimationFrame(() => sub.current?.querySelector('button.menu-item:not(:disabled)')?.focus());
  const onKeyDown = (e) => {
    const onRow = e.target === wrap.current?.firstElementChild;
    if (onRow && (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
      first();
    } else if (open && !onRow && (e.key === 'Escape' || e.key === 'ArrowLeft') && !e.nativeEvent.isComposing) {
      // Only the submenu closes.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      wrap.current?.firstElementChild?.focus();
    }
  };
  return (
    <div ref={wrap} className={`ww-sub ${open ? 'open' : ''}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onKeyDown={onKeyDown}>
      <Item sub aria-haspopup="true" aria-expanded={open} onClick={() => { setOpen(true); first(); }}>{label}</Item>
      {open && <div ref={sub} className="ww-menu ww-submenu" role="menu">{children}</div>}
    </div>
  );
}

// Expand / Collapse: the reference's four-corner glyphs are smaller than the icon font's, so they
// are drawn here.
const CORNERS = {
  fullscreen: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  fullscreen_exit: 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z',
};

// Icon over a label, the table tools on the right.
function ToolButton({ icon, label, onClick, open, active, tip, btnRef, className = '' }) {
  return (
    <button ref={btnRef} type="button" className={`ww-tbtn ${open ? 'open' : ''} ${active ? 'active' : ''} ${tip ? 'ww-tipped' : ''} ${className}`}
      onClick={onClick} aria-expanded={open === undefined ? undefined : open} data-ww-tip={open ? undefined : tip}>
      {CORNERS[icon]
        ? <svg className="ww-tb-svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={CORNERS[icon]} fill="currentColor" /></svg>
        : <Icon name={icon} />}
      <span>{label}</span>
    </button>
  );
}

// "Day & hour ▾" / "Account view ▾": a text dropdown with its options.
function TextSelect({ value, options, onChange, isOpen, onToggle, onClose, btnRef }) {
  return (
    <>
      <button ref={btnRef} type="button" className={`ww-tb-select ${isOpen ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={isOpen} onClick={onToggle}>
        <span>{options.find(([k]) => k === value)?.[1] ?? options[0][1]}</span>
        <Icon name="arrow_drop_down" />
      </button>
      {isOpen && (
        <Pop anchors={[btnRef]} place={PLACE.below} onClose={onClose}>
          <div className="ww-menu" role="menu">
            {options.map(([k, l]) => <Item key={k} selected={k === value} onClick={() => { onClose(); onChange(k); }}>{l}</Item>)}
          </div>
        </Pop>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Level filter (Devices)
// Display order of the levels (chip text and popover rows).
const LEVEL_ORDER = ['Ad group', 'Campaign'];

function Check({ checked, onChange, children, className = '' }) {
  return (
    <label className={`ww-check ${className}`}>
      <span className="ww-check-hit"><input type="checkbox" className="ww-cb" checked={checked} onChange={onChange} /></span>
      <span className="ww-check-label">{children}</span>
    </label>
  );
}

function LevelPopover({ levels, onApply, onClose }) {
  const [draft, setDraft] = useState(levels);
  const flip = (l) => setDraft((d) => (d.includes(l) ? d.filter((x) => x !== l) : [...d, l]));
  return (
    <div className="ww-level" role="dialog" aria-label="Level" tabIndex={-1}>
      <div className="ww-level-head">
        <span className="ww-level-title">Level</span>
        <button type="button" className="ww-round ww-tipped" data-ww-tip="Close" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="ww-level-note">Matches any:</div>
      <div className="ww-level-list">
        {LEVEL_ORDER.map((l) => <Check key={l} checked={draft.includes(l)} onChange={() => flip(l)}>{l}</Check>)}
      </div>
      <div className="ww-level-foot">
        {/* The filter keeps at least one level. */}
        <button type="button" className="ww-text-btn" disabled={!draft.length} onClick={() => onApply(LEVEL_ORDER.filter((l) => draft.includes(l)))}>Apply</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Add filter menu
// Plain filter rows under the sections, per tab (Devices shows "Bid adj.").
const FILTER_ATTRS = { devices: ['bidAdj'], when: ['campaign'], where: ['campaign', 'adGroup'], locations: ['location'] };
const known = (k) => isWwMetric(k) || !!WW_ATTRS[k];

function AddFilterMenu({ tab, onPick }) {
  const [q, setQ] = useState('');
  const [openSecs, setOpenSecs] = useState([]);
  const secs = WW_TABLES[tab].sections.filter((s) => s !== 'recommended')
    .map((s) => ({ key: s, title: WW_SECTIONS[s].title, items: sectionItems(tab, s).filter(known).map(colLabelWw) }))
    .filter((s) => s.items.length);
  const plain = FILTER_ATTRS[tab].map(colLabelWw);
  const query = q.trim().toLowerCase();
  const hits = query ? [...new Set([...secs.flatMap((s) => s.items), ...plain])].filter((l) => l.toLowerCase().includes(query)) : [];
  return (
    <div className="ww-menu ww-addf" role="menu">
      <label className="ww-menu-search">
        <input className="ww-menu-input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search filters" />
        <Icon name="search" />
      </label>
      {query ? (
        <div className="ww-addf-hits">
          {hits.length ? hits.map((l) => <Item key={l} onClick={onPick}>{l}</Item>) : <div className="ww-menu-empty">No filters match</div>}
        </div>
      ) : (
        <>
          <div className="ww-addf-secs">
            {secs.map((s) => {
              const open = openSecs.includes(s.key);
              return (
                <div key={s.key} className={`ww-addf-sec ${open ? 'open' : ''}`}>
                  <button type="button" className="ww-addf-head" aria-expanded={open}
                    onMouseEnter={hoverFocus}
                    onClick={() => setOpenSecs((o) => (open ? o.filter((k) => k !== s.key) : [...o, s.key]))}>
                    <span>{s.title}</span>
                    <Icon name={open ? 'expand_less' : 'expand_more'} />
                  </button>
                  {open && s.items.map((l) => <Item key={l} onClick={onPick}>{l}</Item>)}
                </div>
              );
            })}
          </div>
          <div className="ww-addf-plain">{plain.map((l) => <Item key={l} onClick={onPick}>{l}</Item>)}</div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Segment menu
const SEGMENT_TIMES = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year'], ['dow', 'Day of the week']];
// Rows after Conversions, per tab (they have no data here: picking one only closes the menu).
const SEGMENT_MORE = { devices: ['Network (with search partners)', 'Top vs. Other'], where: ['Device'], locations: ['Device'] };

function SegmentMenu({ tab, segment, onSegment, close }) {
  const pick = (s) => { close(); onSegment(s); };
  return (
    <div className="ww-menu ww-segment" role="menu">
      <div className="ww-menu-title">Segment</div>
      <Item selected={!segment} onClick={() => pick(null)}>None</Item>
      <SubMenu label="Time">
        {/* Day: the daily figures are the table's own rows already. */}
        {SEGMENT_TIMES.map(([k, l]) => <Item key={k} disabled={k === 'day'} selected={segment === k} onClick={() => pick(k)}>{l}</Item>)}
      </SubMenu>
      <Item onClick={close}>Click type</Item>
      <SubMenu label="Conversions">
        {['Conversion action', 'Conversion category', 'Conversion source'].map((l) => <Item key={l} onClick={close}>{l}</Item>)}
      </SubMenu>
      {(SEGMENT_MORE[tab] || []).map((l) => <Item key={l} onClick={close}>{l}</Item>)}
    </div>
  );
}

// ---------------------------------------------------------------- Download dialog
const SEGMENT_LABEL = Object.fromEntries(SEGMENT_TIMES);

function DownloadDialog({ segment, onDownload, onClose }) {
  const [format, setFormat] = useState(WW_DOWNLOAD_FORMATS[0].key);
  const [seg, setSeg] = useState(segment && segment !== 'day' ? segment : null);
  const [compress, setCompress] = useState(false);
  const [inc, setInc] = useState({ title: true, totals: true, reports: false });
  const [menu, setMenu] = useState(null); // 'format' | 'segments'
  const card = useRef(null);
  const formatBtn = useRef(null);
  const segBox = useRef(null);
  useLayer(onClose, card, []);
  // Focus goes into the dialog without lighting up a field (the reference opens with none focused).
  useEffect(() => { card.current?.focus(); }, []);
  const flip = (k) => setInc((s) => ({ ...s, [k]: !s[k] }));
  const openSegments = () => setMenu((m) => (m === 'segments' ? null : 'segments'));
  return createPortal(
    <div className="ww-dl-scrim">
      <div ref={card} className="ww-dl" role="dialog" aria-modal="true" aria-labelledby="ww-dl-title" tabIndex={-1}
        onKeyDown={(e) => { if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.stopPropagation(); onClose(); } }}>
        <h2 id="ww-dl-title" className="ww-dl-title">Download</h2>
        <button ref={formatBtn} type="button" className={`ww-dl-select ${menu === 'format' ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={menu === 'format'}
          aria-label="File format" onClick={() => setMenu((m) => (m === 'format' ? null : 'format'))}>
          <span>{WW_DOWNLOAD_FORMATS.find((f) => f.key === format).label}</span>
          <Icon name="arrow_drop_down" />
        </button>
        {menu === 'format' && (
          <Pop anchors={[formatBtn]} place={PLACE.field} onClose={() => setMenu(null)} className="ww-over-dialog"
            focus="button.menu-item.selected">
            <div className="ww-menu" role="listbox">
              {WW_DOWNLOAD_FORMATS.map((f) => (
                <Item key={f.key} role="option" aria-selected={f.key === format} selected={f.key === format}
                  onClick={() => { setFormat(f.key); setMenu(null); formatBtn.current?.focus(); }}>{f.label}</Item>
              ))}
            </div>
          </Pop>
        )}
        <Check className="ww-dl-check" checked={compress} onChange={() => setCompress((c) => !c)}>Compress file</Check>
        <div className="ww-dl-label">
          Segments
          <span className="ww-dl-help ww-tipped" tabIndex={0} data-ww-tip="Split each row by the time period you pick" aria-label="About segments"><Icon name="help" /></span>
        </div>
        <div ref={segBox} className={`ww-dl-segs ${menu === 'segments' ? 'open' : ''}`} role="button" tabIndex={0} aria-haspopup="menu" aria-expanded={menu === 'segments'}
          onClick={openSegments} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSegments(); } }}>
          {seg ? (
            <span className="ww-dl-seg">
              {SEGMENT_LABEL[seg]}
              <button type="button" className="ww-dl-seg-x" aria-label="Remove segment" onClick={(e) => { e.stopPropagation(); setSeg(null); }}><Icon name="close" /></button>
            </span>
          ) : <span className="ww-dl-ph">Add segments</span>}
        </div>
        {menu === 'segments' && (
          <Pop anchors={[segBox]} place={PLACE.below} onClose={() => setMenu(null)} className="ww-over-dialog">
            <div className="ww-menu" role="menu">
              {SEGMENT_TIMES.filter(([k]) => k !== 'day').map(([k, l]) => (
                <Item key={k} selected={seg === k} onClick={() => { setSeg(k); setMenu(null); segBox.current?.focus(); }}>{l}</Item>
              ))}
            </div>
          </Pop>
        )}
        <div className="ww-dl-label">Include:</div>
        <div className="ww-dl-includes">
          <Check className="ww-dl-check" checked={inc.title} onChange={() => flip('title')}>Title and date range</Check>
          <Check className="ww-dl-check" checked={inc.totals} onChange={() => flip('totals')}>Totals</Check>
          <Check className="ww-dl-check" checked={inc.reports} onChange={() => flip('reports')}>Save to Reports</Check>
        </div>
        <div className="ww-dl-actions">
          <button type="button" className="ww-dl-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="ww-dl-go" onClick={() => { onClose(); onDownload(format, { compress, title: inc.title, totals: inc.totals, segment: seg }); }}>Download</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- toolbar
const WHEN_MODES = [['dayhour', 'Day & hour'], ['day', 'Day'], ['hour', 'Hour']];
const LOC_VIEWS = [['account', 'Account view'], ['campaign', 'Campaign view']];
const QUICK = { compress: false, title: true, totals: true };

// Admin: whether the toolbar is pinned under the title bar (or, on Matched locations, the top of
// the window). Until it is, the + button sits on the card's top edge.
// `layout`: changes when what sits above the toolbar does (it moves without a scroll).
function usePinned(barRef, active, layout) {
  // The page opens at its top, where the toolbar isn't pinned (so the button doesn't float up).
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const main = document.getElementById('main');
    const look = () => {
      const el = barRef.current;
      if (!el) return;
      const at = parseFloat(getComputedStyle(el).top) || 0;
      const top = el.getBoundingClientRect().top - (main ? main.getBoundingClientRect().top : 0);
      setPinned(top <= at + 0.5);
    };
    look();
    main?.addEventListener('scroll', look, { passive: true });
    window.addEventListener('resize', look);
    return () => {
      main?.removeEventListener('scroll', look);
      window.removeEventListener('resize', look);
    };
  }, [active, barRef, layout]);
  return pinned;
}

// canEdit + onCreate('row' | 'campaign'): the + button and its menu (admins only).
export default function WwToolbar({
  tab, levels = [], onLevels, search, onSearch, segment, onSegment, whenMode, onWhenMode, locView, onLocView,
  onColumns, onDownload, expanded, onExpand, chartHidden, onChartHidden, hasChart, sticky, canEdit, onCreate,
}) {
  // The one open menu: funnel | level | add | segment | download | when | loc.
  const [open, setOpen] = useState(null);
  const [dialog, setDialog] = useState(false);
  const funnelRef = useRef(null);
  const chipRef = useRef(null);
  const addRef = useRef(null);
  const closeRef = useRef(null);
  const segmentRef = useRef(null);
  const downloadRef = useRef(null);
  const selectRef = useRef(null);
  const findRef = useRef(null);
  const barRef = useRef(null);
  useEffect(() => { setOpen(null); setDialog(false); }, [tab]);
  const creating = !!(canEdit && onCreate);
  const pinned = usePinned(barRef, creating, `${tab}|${hasChart}|${chartHidden}|${expanded}`);
  // Lifted only over the chart: with nothing but the tabs above the card it would cover them.
  const lift = creating && hasChart && !chartHidden && !expanded && !pinned;
  const createTip = `Create ${NEW_ROW_LABEL[tab].replace(/^New /, '')}`;
  const toggle = (k) => setOpen((o) => (o === k ? null : k));
  const close = () => setOpen(null);

  const levelOn = tab === 'devices' && levels.length > 0;
  const levelText = LEVEL_ORDER.filter((l) => levels.includes(l)).join(', ');
  // A filter editor (Level popover or Add filter menu) is open: the tools give way to Close.
  const editing = open === 'level' || open === 'add';
  const finding = tab === 'where' && search != null;

  const chev = hasChart && (
    <>
      <span className="ww-tb-sep" />
      <button type="button" className="ww-tb-chev ww-tipped" aria-label={chartHidden ? 'Show chart' : 'Hide chart'} data-ww-tip={chartHidden ? 'Show chart' : 'Hide chart'}
        onClick={() => onChartHidden(!chartHidden)}>
        <Icon name={expanded || chartHidden ? 'expand_more' : 'expand_less'} />
      </button>
    </>
  );
  const segmentBtn = <ToolButton btnRef={segmentRef} icon="segment" label="Segment" open={open === 'segment'} active={!!segment} onClick={() => toggle('segment')} />;
  const tools = (
    <>
      <ToolButton icon="view_column" label="Columns" onClick={() => { close(); onColumns(); }} />
      <ToolButton btnRef={downloadRef} icon="download" label="Download" open={open === 'download'} onClick={() => toggle('download')} />
      <ToolButton icon={expanded ? 'fullscreen_exit' : 'fullscreen'} label={expanded ? 'Collapse' : 'Expand'} tip={expanded ? 'Collapse table' : 'Expand table'} onClick={onExpand} />
    </>
  );
  let right;
  if (editing) {
    right = <ToolButton btnRef={closeRef} icon="close" label="Close" className="ww-tb-close" onClick={close} />;
  } else if (tab === 'when') {
    right = (
      <>
        <TextSelect btnRef={selectRef} value={whenMode} options={WHEN_MODES} onChange={onWhenMode} isOpen={open === 'when'} onToggle={() => toggle('when')} onClose={close} />
        <span className="ww-tb-sep" />
        {tools}
      </>
    );
  } else if (tab === 'locations') {
    right = (
      <>
        <TextSelect btnRef={selectRef} value={locView} options={LOC_VIEWS} onChange={onLocView} isOpen={open === 'loc'} onToggle={() => toggle('loc')} onClose={close} />
        <span className="ww-tb-sep" />
        {segmentBtn}
        {tools}
      </>
    );
  } else {
    right = (
      <>
        {tab === 'where' && (
          <ToolButton icon="search" label="Search" className="ww-tb-search" active={finding}
            onClick={() => { close(); onSearch(finding ? null : ''); }} />
        )}
        {segmentBtn}
        {tools}
        {chev}
      </>
    );
  }

  return (
    <div ref={barRef} className={`ww-toolbar ${sticky ? 'ww-sticky' : ''} ${editing ? 'editing' : ''}`}>
      {creating && (
        <Dropdown className="ww-fab-dd" trigger={(isOpen, flip) => (
          <button type="button" className={`ww-fab ${lift ? 'lift' : ''}`} aria-label={createTip} aria-haspopup="menu" aria-expanded={isOpen}
            data-tip={isOpen ? undefined : createTip} data-testid="ww-create" onClick={() => { close(); flip(); }}>
            <Icon name="add" />
          </button>
        )}>
          {(done) => (
            <div className="menu create-menu" role="menu">
              <MenuItem icon="add" role="menuitem" onClick={() => { done(); onCreate('row'); }}>{NEW_ROW_LABEL[tab]}</MenuItem>
              <MenuItem icon="add" role="menuitem" onClick={() => { done(); onCreate('campaign'); }}>New campaign</MenuItem>
            </div>
          )}
        </Dropdown>
      )}
      <button ref={funnelRef} type="button" className={`ww-tb-funnel ${levelOn ? 'on' : ''} ${open === 'funnel' ? 'open' : ''}`}
        aria-label="Filters" aria-expanded={open === 'funnel' || (!levelOn && open === 'add')}
        // With no filter set, the funnel goes straight to Add filter.
        onClick={() => toggle(levelOn ? 'funnel' : 'add')}>
        <Icon name="filter_alt" />
        {levelOn && <span className="ww-tb-badge" data-metric="live">1</span>}
      </button>
      {levelOn && (
        <button ref={chipRef} type="button" className={`ww-tb-chip ${open === 'level' ? 'open' : ''}`} aria-haspopup="dialog" aria-expanded={open === 'level'}
          onClick={() => toggle('level')}>
          {`Level: ${levelText}`}
        </button>
      )}
      <button ref={addRef} type="button" className={`ww-tb-add ${open === 'add' ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={open === 'add'} onClick={() => toggle('add')}>Add filter</button>
      <span className="ww-tb-space" />
      {right}

      {finding && (
        <div className="ww-tb-find">
          <label className="ww-tb-find-box">
            <Icon name="search" />
            <input ref={findRef} autoFocus placeholder="Find placements" value={search} aria-label="Find placements"
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.stopPropagation(); onSearch(null); } }} />
            {search !== '' && (
              <button type="button" className="ww-tb-find-x" aria-label="Clear search" onClick={() => { onSearch(''); findRef.current?.focus(); }}><Icon name="close" /></button>
            )}
          </label>
        </div>
      )}

      {open === 'funnel' && (
        <Pop anchors={[funnelRef]} place={PLACE.below} onClose={close}>
          <div className="ww-menu ww-funnel-menu" role="menu">
            <Item onClick={() => setOpen('level')}>{`Level: ${levelText}`}</Item>
          </div>
        </Pop>
      )}
      {open === 'level' && levelOn && (
        <Pop anchors={[chipRef, funnelRef, closeRef]} place={PLACE.chip} onClose={close} focus=".ww-level">
          <LevelPopover levels={levels} onClose={close} onApply={(next) => { close(); onLevels(next); }} />
        </Pop>
      )}
      {open === 'add' && (
        <Pop anchors={[addRef, funnelRef, closeRef]} place={PLACE.addFilter} onClose={close} focus="input.ww-menu-input">
          <AddFilterMenu tab={tab} onPick={close} />
        </Pop>
      )}
      {open === 'segment' && (
        <Pop anchors={[segmentRef]} place={PLACE.segment} onClose={close}>
          <SegmentMenu tab={tab} segment={segment} onSegment={onSegment} close={close} />
        </Pop>
      )}
      {open === 'download' && (
        <Pop anchors={[downloadRef]} place={PLACE.download} onClose={close}>
          <div className="ww-menu" role="menu">
            {WW_DOWNLOAD_FORMATS.map((f) => <Item key={f.key} onClick={() => { close(); onDownload(f.key, QUICK); }}>{f.label}</Item>)}
            {/* Spreadsheet export, Email now and Schedule aren't available here: they only close the menu. */}
            <Item onClick={close}>Sheets</Item>
            <div className="ww-menu-sep" role="separator" />
            <Item onClick={close}>Email now</Item>
            <Item onClick={close}>Schedule</Item>
            <Item onClick={() => { close(); setDialog(true); }}>More options</Item>
          </div>
        </Pop>
      )}
      {dialog && (
        <DownloadDialog segment={segment} onDownload={onDownload}
          onClose={() => { setDialog(false); downloadRef.current?.focus(); }} />
      )}
    </div>
  );
}
