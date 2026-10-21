import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dropdown, Icon, MenuItem, SubMenu, ToolBtn } from '../Common.jsx';
import { addDays, daysBetween, fmtDay, parseISO, toISO } from '../../../../shared/dates.js';
import {
  WW_ALL_METRICS, WW_METRICS, WW_SECTIONS, WW_CURRENCY, deriveWw, sumWw, fmtWw, editTextWw, allowedWw,
} from '../../../../shared/whenwhere.js';
import './ww-chart.css';

// The "When and where ads showed" time chart (Devices and Where ads showed tabs): two metric
// pickers, Chart type / Expand / Adjust, and a line (or stacked) plot of the daily series bucketed
// by period. It sits on the grey page background, not in a card.

const COLORS = ['#1a73e8', '#d93025'];
// [period, label, shortest range in days it makes sense for]
const PERIODS = [['daily', 'Daily', 1], ['weekly', 'Weekly', 14], ['monthly', 'Monthly', 60], ['quarterly', 'Quarterly', 180], ['yearly', 'Yearly', 730]];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GROUPS = [['performance', 'Performance'], ['viewability', 'Viewability'], ['conversions', 'Conversions']];

// Plot geometry (CSS px, measured from the reference): the top gridline sits 62 below the area top,
// the zero line 35 above its bottom; the plot is inset 52 / 41 from the area's sides.
const HEIGHT = 232;
const HEIGHT_BIG = 502;
const PAD_T = 62;
const PAD_B = 35;
const PAD_L = 52;
const PAD_R = 41;
const TICK_GAP = 6;

const rangeDays = (range) => (range?.from && range?.to ? daysBetween(range.from, range.to) + 1 : 0);
const periodOk = (min, key, days) => days >= min && !(key === 'daily' && days > 366);
// The period to draw with: the chosen one when the range allows it, else the finest that does.
export function fitPeriod(period, range) {
  const days = rangeDays(range);
  const ok = PERIODS.filter(([k, , min]) => periodOk(min, k, days)).map(([k]) => k);
  return ok.includes(period) ? period : ok[0] || 'daily';
}

function bucketKey(period, iso) {
  const d = parseISO(iso);
  if (period === 'weekly') return addDays(iso, -((d.getDay() + 6) % 7));
  if (period === 'monthly') return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
  if (period === 'quarterly') return toISO(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1));
  if (period === 'yearly') return toISO(new Date(d.getFullYear(), 0, 1));
  return iso;
}

// Daily series -> one point per day / week (Monday start) / month / quarter / year. `from`/`to`
// are the first and last days of the bucket that the series covers (so cut to the range).
export function bucketSeries(series, period) {
  const by = new Map();
  for (const s of series || []) {
    const key = bucketKey(period, s.date);
    let b = by.get(key);
    if (!b) by.set(key, (b = { key, from: s.date, to: s.date, list: [] }));
    if (s.date < b.from) b.from = s.date;
    if (s.date > b.to) b.to = s.date;
    b.list.push(s);
  }
  return [...by.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map(({ list, ...b }) => ({ ...b, values: deriveWw(sumWw(list)) }));
}

// X-axis text: "Sep 16, 2026" (daily, weekly), "Mar 2025", "Q1 2025", "2025".
function axisDate(period, key, from) {
  const d = parseISO(key);
  if (period === 'monthly') return `${MON[d.getMonth()]} ${d.getFullYear()}`;
  if (period === 'quarterly') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  if (period === 'yearly') return String(d.getFullYear());
  return fmtDay(from);
}
// Tooltip heading: "Sun, Oct 4, 2026" for a day; a month, quarter or year by its name
// ("November 2025", "Q4 2025", "2025": from the bucket's key, so a month the range starts inside
// still reads as that month); else the days the point covers ("Oct 9 – 15, 2026",
// "Sep 28 – Oct 4, 2026", "Dec 29, 2025 – Jan 4, 2026").
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function tipDate(period, key, from, to) {
  const k = parseISO(key);
  if (period === 'monthly') return `${MONTH[k.getMonth()]} ${k.getFullYear()}`;
  if (period === 'quarterly') return `Q${Math.floor(k.getMonth() / 3) + 1} ${k.getFullYear()}`;
  if (period === 'yearly') return String(k.getFullYear());
  if (from === to) return `${DOW[parseISO(from).getDay()]}, ${fmtDay(from)}`;
  const a = parseISO(from);
  const b = parseISO(to);
  if (a.getFullYear() !== b.getFullYear()) return `${fmtDay(from)} – ${fmtDay(to)}`;
  const end = a.getMonth() === b.getMonth() ? b.getDate() : `${MON[b.getMonth()]} ${b.getDate()}`;
  return `${MON[a.getMonth()]} ${a.getDate()} – ${end}, ${b.getFullYear()}`;
}

// Stored units -> the units the axis reads in (currency, conversions, percent).
const SHOWN = { int: 1, dec2: 100, money: 100, pct: 0.01 };
const kindOf = (k) => WW_ALL_METRICS[k]?.kind || 'int';
const shown = (k, v) => (v == null ? null : v / SHOWN[kindOf(k)]);
const exact = (n) => Number(n.toPrecision(10));

// Nice axis: `parts` equal steps of 1, 2, 2.5 or 5 × 10^n that reach past `max`. With no data
// the steps are 1 (0, 1, 2 …); counts never get fractional steps.
function niceAxis(max, parts, whole) {
  let step = 1;
  if (max > 0) {
    const raw = max / parts;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const f = raw / mag;
    step = exact((f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag);
    if (whole) step = Math.max(1, Math.ceil(step));
  }
  const dec = Math.min(2, (String(step).split('.')[1] || '').length);
  return { top: exact(step * parts), ticks: Array.from({ length: parts + 1 }, (_, i) => exact(step * i)), dec };
}
function tickText(kind, v, dec, sym, big) {
  const d = kind === 'money' && dec ? 2 : dec;
  const n = big
    ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
    : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (kind === 'money') return `${sym}${n}`;
  if (kind === 'pct') return `${n}%`;
  return n;
}

// Tick label widths decide how much room the axes need.
let measureCtx;
function textWidth(s) {
  if (measureCtx === undefined) {
    try { measureCtx = document.createElement('canvas').getContext('2d'); } catch { measureCtx = null; }
    if (measureCtx) measureCtx.font = '12px Roboto, Arial, sans-serif';
  }
  return measureCtx ? measureCtx.measureText(s).width : s.length * 7;
}

// Picker menu groups: formula and base metrics by Columns-panel section order. Viewability
// (Where ads showed only) lists its typed-in columns disabled: they have no daily figures.
function metricGroups(tab) {
  return GROUPS.filter(([g]) => g !== 'viewability' || tab === 'where').map(([g, title]) => ({
    key: g,
    title,
    items: g === 'viewability'
      ? WW_SECTIONS.viewability.items.map((k) => ({ k, off: true }))
      : WW_SECTIONS[g].items.filter((k) => WW_METRICS[k]?.group === g).map((k) => ({ k, off: false })),
  }));
}
const metricLabel = (k) => WW_ALL_METRICS[k]?.label || k;

function MetricMenu({ tab, allowNone, other, onPick }) {
  const [q, setQ] = useState('');
  const [side, setSide] = useState('right');
  const ref = useRef(null);
  // Submenus open to the right unless the window has no room for them there.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && window.innerWidth - r.right < 220) setSide('left');
  }, []);
  const groups = metricGroups(tab);
  const query = q.trim().toLowerCase();
  const item = ({ k, off }) => (
    <MenuItem key={k} disabled={off || k === other} onClick={() => onPick(k)} data-testid={`ww-metric-opt-${k}`}>{metricLabel(k)}</MenuItem>
  );
  const found = query ? groups.flatMap((g) => g.items).filter(({ k }) => metricLabel(k).toLowerCase().includes(query)) : [];
  const noneFound = allowNone && query && 'none'.includes(query);
  return (
    <div className="menu ww-ch-menu ww-pick-menu" ref={ref} role="menu">
      <label className="ww-msearch">
        <input autoFocus value={q} placeholder="Search" aria-label="Search metrics" onChange={(e) => setQ(e.target.value)} />
        <Icon name="search" />
      </label>
      {query ? (
        <>
          {noneFound && <MenuItem onClick={() => onPick(null)}>None</MenuItem>}
          {found.map(item)}
          {!found.length && !noneFound && <div className="ww-ch-menu-empty">No matches</div>}
        </>
      ) : (
        <>
          {allowNone && <MenuItem onClick={() => onPick(null)} data-testid="ww-metric-opt-none">None</MenuItem>}
          {groups.map((g) => <SubMenu key={g.key} label={g.title} side={side}>{g.items.map(item)}</SubMenu>)}
        </>
      )}
    </div>
  );
}

// The tooltip's number box: starts with the figure, lets through only what the metric accepts.
function TipInput({ metric, value, onCommit, onCancel }) {
  const start = editTextWw(metric, value);
  const [text, setText] = useState(start);
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (save) => {
    if (done.current) return;
    done.current = true;
    if (save && text !== start) onCommit(text);
    else onCancel();
  };
  return (
    <input ref={ref} className="ww-ch-tip-input" value={text} aria-label={`${metricLabel(metric)} for this point`}
      inputMode={kindOf(metric) === 'int' ? 'numeric' : 'decimal'}
      onChange={(e) => { const t = e.target.value.replace(/,/g, ''); if (allowedWw(metric).test(t)) setText(t); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      }}
      onBlur={() => finish(true)} />
  );
}

export default function WwChart({
  tab, series, range, metrics, onMetrics, chartType, onChartType, big, onBig, period, onPeriod, canEdit, onEditPoint, sym = WW_CURRENCY,
}) {
  const wrap = useRef(null);
  const tipRef = useRef(null);
  const [w, setW] = useState(900);
  const [tipSize, setTipSize] = useState({ w: 150, h: 120 });
  const [hoverAt, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [editing, setEditing] = useState(null);

  const [m1, m2 = null] = metrics || [];
  const keys = [m1, m2].filter(Boolean);
  const stacked = chartType === 'stacked' && keys.length === 2;
  const days = rangeDays(range);
  const per = fitPeriod(period, range);
  // A range change can rule the chosen period out (Daily over a year, Weekly under two weeks).
  useEffect(() => { if (per !== period) onPeriod?.(per); }, [per, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const points = useMemo(() => bucketSeries(series, per), [series, per]);
  const n = points.length;
  // An index left from other points (another range or period) is ignored, then cleared.
  const at = pinned ?? hoverAt;
  const hover = at != null && at >= 0 && at < n ? at : null;
  useEffect(() => { setPinned(null); setEditing(null); setHover(null); }, [points]);
  useEffect(() => {
    if (pinned == null) return undefined;
    const out = (e) => { if (wrap.current && !wrap.current.contains(e.target)) { setPinned(null); setEditing(null); } };
    const esc = (e) => { if (e.key === 'Escape') { setPinned(null); setEditing(null); } };
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [pinned]);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  // The card's size decides which side of the hovered point it goes and how high it sits.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (el && (el.offsetWidth !== tipSize.w || el.offsetHeight !== tipSize.h)) setTipSize({ w: el.offsetWidth, h: el.offsetHeight });
  });

  const height = big ? HEIGHT_BIG : HEIGHT;
  const ih = height - PAD_T - PAD_B;
  // 3 ticks collapsed, 5 expanded (about 67 / 101 px apart).
  const parts = big ? 4 : 2;

  // One scale per metric (left = metric 1, right = metric 2); stacked metrics share the left one.
  const scales = stacked ? [] : keys.map((k) => {
    const kind = kindOf(k);
    const max = Math.max(0, ...points.map((p) => shown(k, p.values[k]) ?? 0));
    const ax = niceAxis(max, parts, kind === 'int');
    return { k, kind, ...ax, labels: ax.ticks.map((t) => tickText(kind, t, ax.dec, sym, ax.top >= 1e6)) };
  });
  const tops = stacked ? points.map((p) => { let acc = 0; return keys.map((k) => (acc += shown(k, p.values[k]) ?? 0)); }) : [];
  const stackKind = kindOf(m1) === kindOf(m2) ? kindOf(m1) : 'dec2';
  const stackAx = stacked ? niceAxis(Math.max(0, ...tops.map((t) => t[1])), parts, stackKind === 'int') : null;
  const blank = niceAxis(0, parts, true);
  const left = stacked
    ? { ...stackAx, labels: stackAx.ticks.map((t) => tickText(stackKind, t, stackAx.dec, sym, stackAx.top >= 1e6)) }
    : scales[0] || { ...blank, labels: blank.ticks.map(String) };
  const right = stacked ? null : scales[1] || null;

  const widest = (labels) => Math.max(0, ...labels.map(textWidth));
  const padL = Math.max(PAD_L, Math.ceil(widest(left.labels)) + TICK_GAP + 8);
  const padR = right ? Math.max(PAD_R, Math.ceil(widest(right.labels)) + TICK_GAP + 8) : PAD_R;
  const iw = Math.max(1, w - padL - padR);
  const base = PAD_T + ih;
  const x = (i) => padL + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const yOf = (v, top) => base - (v / top) * ih;
  const crisp = (y) => Math.round(y) + 0.5;

  const lines = scales.map((s, j) => {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      const v = shown(s.k, p.values[s.k]);
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${yOf(v, s.top).toFixed(1)}`;
      pen = true;
    });
    return { k: s.k, color: COLORS[j], d };
  });
  const areas = stacked && n ? keys.map((k, j) => {
    const top = points.map((p, i) => `${x(i).toFixed(1)},${yOf(tops[i][j], stackAx.top).toFixed(1)}`);
    const bottom = points.map((p, i) => `${x(i).toFixed(1)},${yOf(j ? tops[i][j - 1] : 0, stackAx.top).toFixed(1)}`).reverse();
    return { k, color: COLORS[j], d: `M${top.join('L')}L${bottom.join('L')}Z`, line: `M${top.join('L')}` };
  }) : [];
  const dotY = (j, i) => {
    if (stacked) return yOf(tops[i][j], stackAx.top);
    const v = shown(keys[j], points[i].values[keys[j]]);
    return v == null ? null : yOf(v, scales[j].top);
  };

  // X labels: only the first and last; with no points yet, the range's ends.
  const ends = n
    ? [axisDate(per, points[0].key, points[0].from), axisDate(per, points[n - 1].key, points[n - 1].from)]
    : range?.from ? [axisDate(per, bucketKey(per, range.from), range.from), axisDate(per, bucketKey(per, range.to), range.to)] : [];

  const onMove = (e) => {
    if (!n) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = n <= 1 ? 0 : Math.round(((px - padL) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const pick = (slot, k) => {
    if (slot === 0) onMetrics([k, m2 === k ? null : m2]);
    else onMetrics([m1, k]);
  };
  const picker = (slot) => {
    const k = slot ? m2 : m1;
    return (
      <Dropdown key={slot} className="ww-pick-dd" panelClass="ww-pick-pop" trigger={(open, toggle) => (
        <button type="button" className="ww-pick" aria-haspopup="menu" aria-expanded={open} onClick={toggle} data-testid={`ww-metric-${slot}`}>
          <span className="ww-pick-dash" style={{ background: COLORS[slot] }} />
          <span className="ww-pick-label">{k ? metricLabel(k) : 'None'}</span>
          <Icon name="arrow_drop_down" />
        </button>
      )}>
        {(close) => <MetricMenu tab={tab} allowNone={slot === 1} other={slot ? m1 : m2} onPick={(next) => { close(); pick(slot, next); }} />}
      </Dropdown>
    );
  };

  const hp = hover != null ? points[hover] : null;
  // 9 right of the point (left of it near the right edge), 6 under the top gridline, kept inside the area.
  const tipLeft = hp ? (x(hover) + 9 + tipSize.w > w - 4 ? Math.max(0, x(hover) - 9 - tipSize.w) : x(hover) + 9) : 0;
  const tipTop = Math.max(4, Math.min(PAD_T + 6, height - tipSize.h - 4));

  return (
    <div className="ww-chart" ref={wrap} style={{ height }} data-type={stacked ? 'stacked' : 'line'} data-testid="ww-chart">
      <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        onClick={canEdit ? () => { setEditing(null); setPinned((p) => (p == null ? hover : null)); } : undefined}
        style={canEdit && n ? { cursor: 'pointer' } : undefined} xmlns="http://www.w3.org/2000/svg">
        {left.ticks.map((t, i) => {
          const gy = crisp(base - (i / parts) * ih);
          return (
            <g key={i}>
              <line x1={padL} x2={padL + iw} y1={gy} y2={gy} className="ww-ch-gridline" />
              <text x={padL - TICK_GAP} y={gy + 4} textAnchor="end" data-metric="live">{left.labels[i]}</text>
              {right && <text x={padL + iw + TICK_GAP} y={gy + 4} data-metric="live">{right.labels[i]}</text>}
            </g>
          );
        })}
        {areas.map((a) => (
          <g key={a.k} data-metric={a.k}>
            <path d={a.d} fill={a.color} fillOpacity="0.28" stroke="none" />
            <path d={a.line} fill="none" stroke={a.color} strokeWidth="2" strokeLinejoin="round" />
          </g>
        ))}
        {lines.map((l) => <path key={l.k} d={l.d} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" data-metric={l.k} />)}
        {n === 1 && !stacked && scales.map((s, j) => dotY(j, 0) != null && <circle key={s.k} cx={x(0)} cy={dotY(j, 0)} r="3" fill={COLORS[j]} />)}
        {ends.length > 0 && (n === 1
          ? <text x={x(0)} y={base + 17} textAnchor="middle" data-metric="live">{ends[0]}</text>
          : (
            <>
              <text x={padL} y={base + 17} data-metric="live">{ends[0]}</text>
              <text x={padL + iw} y={base + 17} textAnchor="end" data-metric="live">{ends[1]}</text>
            </>
          ))}
        {hp && (
          <g className="ww-hover">
            <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={base} className="ww-hover-line" />
            {keys.map((k, j) => dotY(j, hover) != null && <circle key={k} cx={x(hover)} cy={dotY(j, hover)} r="4" fill={COLORS[j]} />)}
          </g>
        )}
      </svg>

      <div className="ww-chart-controls">
        {picker(0)}
        {picker(1)}
        <Dropdown className="ww-ct-dd" panelClass="ww-ct-pop" trigger={(open, toggle) => (
          <ToolBtn className="ww-cbtn" icon={stacked ? 'stacked_line_chart' : 'show_chart'} label="Chart type" active={open} onClick={toggle}
            aria-haspopup="menu" aria-expanded={open} data-testid="ww-chart-type" />
        )}>
          {(close) => (
            <div className="menu ww-ch-menu ww-ct-menu" role="menu">
              <MenuItem icon="show_chart" selected={!stacked} onClick={() => { close(); onChartType('line'); }}>Time series chart</MenuItem>
              <MenuItem icon="stacked_line_chart" selected={stacked} disabled={keys.length < 2} onClick={() => { close(); onChartType('stacked'); }}>Stacked time series chart</MenuItem>
            </div>
          )}
        </Dropdown>
        <ToolBtn className="ww-cbtn ww-exp" icon={big ? 'fullscreen_exit' : 'fullscreen'} label={big ? 'Collapse' : 'Expand'} active={big}
          onClick={() => onBig(!big)} data-testid="ww-chart-expand" />
        <Dropdown className="ww-adj-dd" align="right" panelClass="ww-adj-pop" trigger={(open, toggle) => (
          <ToolBtn className="ww-cbtn" icon="tune" label="Adjust" active={open} onClick={toggle} aria-haspopup="menu" aria-expanded={open} data-testid="ww-chart-adjust" />
        )}>
          {(close) => (
            <div className="menu ww-ch-menu ww-adj-menu" role="menu">
              {PERIODS.map(([k, label, min]) => (
                <MenuItem key={k} selected={k === per} disabled={!periodOk(min, k, days)} onClick={() => { close(); onPeriod(k); }}>{label}</MenuItem>
              ))}
            </div>
          )}
        </Dropdown>
      </div>

      {hp && (
        <div ref={tipRef} className={`ww-ch-tip ${pinned != null ? 'pinned' : ''}`} style={{ left: tipLeft, top: tipTop }} data-testid="ww-chart-tip">
          <div className="ww-ch-tip-date" data-metric="live">{tipDate(per, hp.key, hp.from, hp.to)}</div>
          {canEdit && pinned == null && <div className="ww-ch-tip-hint">Click to pin and edit</div>}
          {keys.map((k, j) => (
            <div key={k} className="ww-ch-tip-metric">
              <div className="ww-ch-tip-name">{metricLabel(k)}</div>
              <div className="ww-ch-tip-val">
                <span className="ww-ch-tip-dash" style={{ background: COLORS[j] }} />
                {editing === k
                  ? (
                    <span data-metric={k}>
                      <TipInput metric={k} value={hp.values[k]} onCancel={() => setEditing(null)}
                        onCommit={(t) => { setEditing(null); setPinned(null); onEditPoint({ from: hp.from, to: hp.to }, k, t); }} />
                    </span>
                  )
                  : (
                    <span data-metric={k} className={pinned != null && canEdit ? 'ww-ch-tip-edit' : undefined}
                      title={pinned != null && canEdit ? 'Double-click to edit' : undefined}
                      onDoubleClick={pinned != null && canEdit ? () => setEditing(k) : undefined}>
                      {fmtWw(k, hp.values[k], sym)}
                    </span>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
