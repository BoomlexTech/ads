import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { METRICS, EDITABLE, formatValue } from '../../../shared/metrics.js';
import { MetricInput } from './Editable.jsx';
import { fmtDay, parseISO } from '../../../shared/dates.js';

function niceMax(v) {
  if (!(v > 0)) return 2;
  const e = 10 ** Math.floor(Math.log10(v));
  const f = v / e;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * e;
}

function compact(n) {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
function axisLabel(metric, v) {
  const k = METRICS[metric].kind;
  if (k === 'int') return compact(v);
  if (k === 'money') return '$' + compact(v / 100);
  if (k === 'dec2') return compact(v / 100);
  return (v * 100).toFixed(v * 100 < 10 ? 1 : 0) + '%';
}

// Stored units -> the units shown (dollars, conversions, percent), so stacked metrics add up
// the way they read; `toStored` turns an axis value back for axisLabel.
const SHOWN = { money: 100, dec2: 100, pct: 0.01, int: 1 };
const shownValue = (metric, v) => (v == null ? 0 : v / SHOWN[METRICS[metric].kind]);
const toStored = (metric, v) => v * SHOWN[METRICS[metric].kind];

// points: [{ date, label, values: {metric: v} }], metrics: [{ key, color }]
// canEdit: clicking the chart pins the hover card at that point; double-clicking a
// value in the pinned card edits that day's (or week's/month's) total.
// stacked: the metrics are drawn as areas on top of each other on one shared axis.
const Chart = forwardRef(function Chart({ points, metrics, height, weekends, canEdit, onEditPoint, stacked = false }, svgRef) {
  const wrap = useRef(null);
  const [w, setW] = useState(900);
  const [hoverAt, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [editing, setEditing] = useState(null);
  const n = points.length;
  // New points (another range, period or page) can be fewer than before: an index left over from
  // the old ones is ignored on this render and cleared by the effect below.
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
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const padL = 56;
  const padR = metrics.length > 1 && !stacked ? 70 : 48;
  const padT = 24;
  const padB = 33;
  const iw = w - padL - padR;
  const ih = height - padT - padB;
  const x = (i) => padL + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const scales = metrics.map((m) => ({
    ...m,
    max: niceMax(Math.max(0, ...points.map((p) => p.values[m.key] ?? 0))),
  }));
  const y = (v, s) => padT + ih - (v / s.max) * ih;

  const bands = [];
  if (weekends && n <= 92) {
    points.forEach((p, i) => {
      if (parseISO(p.date).getDay() === 6 && i + 1 < n) bands.push(i);
    });
  }

  const paths = stacked ? [] : scales.map((s) => {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      const v = p.values[s.key];
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v, s).toFixed(1)}`;
      pen = true;
    });
    return { ...s, d };
  });

  // Stacked: running totals per point (missing values count as 0); each metric's area runs from
  // the total below it to its own total. One axis, labelled in the metrics' unit when they share one.
  const tops = stacked ? points.map((p) => {
    let acc = 0;
    return metrics.map((m) => (acc += shownValue(m.key, p.values[m.key])));
  }) : [];
  const stackMax = niceMax(Math.max(0, ...tops.map((t) => t[t.length - 1] ?? 0)));
  const ys = (v) => padT + ih - (v / stackMax) * ih;
  const oneKind = metrics.every((m) => METRICS[m.key].kind === METRICS[metrics[0]?.key]?.kind);
  const stackLabel = (v) => (metrics.length && oneKind ? axisLabel(metrics[0].key, toStored(metrics[0].key, v)) : compact(v));
  const areas = stacked ? metrics.map((m, j) => {
    if (!n) return { ...m, d: '', line: '' };
    const top = points.map((p, i) => `${x(i).toFixed(1)},${ys(tops[i][j]).toFixed(1)}`);
    const bottom = points.map((p, i) => `${x(i).toFixed(1)},${ys(j ? tops[i][j - 1] : 0).toFixed(1)}`).reverse();
    return { ...m, d: `M${top.join('L')}L${bottom.join('L')}Z`, line: `M${top.join('L')}` };
  }) : [];
  const dotY = (s, j, i) => (stacked ? ys(tops[i][j]) : y(points[i].values[s.key], s));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (n === 0) return;
    const i = Math.round(((px - padL) / Math.max(1, iw)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, n <= 1 ? 0 : i)));
  };

  const ticks = [0, 0.5, 1];
  return (
    <div className="chart" ref={wrap} style={{ height }} data-type={stacked ? 'stacked' : 'line'} data-testid="chart">
      <svg ref={svgRef} width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        onClick={canEdit ? () => { setEditing(null); setPinned((p) => (p == null ? hover : null)); } : undefined}
        style={canEdit ? { cursor: 'pointer' } : undefined} xmlns="http://www.w3.org/2000/svg" fontFamily="Roboto, Arial, sans-serif">
        <rect width={w} height={height} fill="#fff" />
        {bands.map((i) => <rect key={i} x={x(i)} y={padT} width={x(i + 1) - x(i)} height={ih} fill="#f1f3f4" />)}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={padL + iw} y1={padT + ih - t * ih} y2={padT + ih - t * ih} stroke="#dadce0" shapeRendering="crispEdges" />
            {stacked && scales[0] && <text x={padL - 6} y={padT + ih - t * ih + 4} textAnchor="end" fontSize="12" fill="#3c4043">{stackLabel(stackMax * t)}</text>}
            {!stacked && scales[0] && <text x={padL - 6} y={padT + ih - t * ih + 4} textAnchor="end" fontSize="12" fill="#3c4043">{axisLabel(scales[0].key, scales[0].max * t)}</text>}
            {!stacked && scales[1] && <text x={padL + iw + 6} y={padT + ih - t * ih + 4} fontSize="12" fill="#3c4043">{axisLabel(scales[1].key, scales[1].max * t)}</text>}
          </g>
        ))}
        {paths.map((p) => <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" />)}
        {areas.map((a) => (
          <g key={a.key} className="chart-area" data-metric={a.key}>
            <path d={a.d} fill={a.color} fillOpacity="0.28" stroke="none" />
            <path d={a.line} fill="none" stroke={a.color} strokeWidth="2" strokeLinejoin="round" />
          </g>
        ))}
        {n > 0 && <text x={padL} y={padT + ih + 17} fontSize="12" fill="#3c4043">{points[0].label}</text>}
        {n > 1 && <text x={padL + iw} y={padT + ih + 17} fontSize="12" fill="#3c4043" textAnchor="end">{points[n - 1].label}</text>}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="#5f6368" strokeDasharray="1 3" />
            {scales.map((s, j) => points[hover].values[s.key] != null && (
              <circle key={s.key} cx={x(hover)} cy={dotY(s, j, hover)} r="4.5" fill={s.color} />
            ))}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className={`chart-tip ${pinned != null ? 'pinned' : ''}`} style={{ left: Math.min(x(hover) + 12, w - 230), top: padT }} data-testid="chart-tip">
          <div className="chart-tip-date">{points[hover].long}</div>
          {canEdit && pinned == null && scales.some((s) => EDITABLE.has(s.key)) && <div className="ctm-hint">Click to pin and edit</div>}
          {scales.map((s) => (
            <div key={s.key} className="chart-tip-metric">
              <div className="ctm-label">{METRICS[s.key].label}</div>
              <div className="ctm-val"><span className="ctm-dash" style={{ background: s.color }} />
                {editing === s.key
                  ? <MetricInput metric={s.key} value={points[hover].values[s.key]} className="ctm-input"
                    onCancel={() => setEditing(null)}
                    onCommit={(t) => { const p = points[hover]; setEditing(null); setPinned(null); onEditPoint(p, s.key, t); }} />
                  : (
                    <span className={pinned != null && EDITABLE.has(s.key) ? 'editable' : ''} title={pinned != null && EDITABLE.has(s.key) ? 'Double-click to edit' : undefined}
                      onDoubleClick={pinned != null && EDITABLE.has(s.key) ? () => setEditing(s.key) : undefined}>
                      {formatValue(s.key, points[hover].values[s.key])}
                    </span>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default Chart;
export { fmtDay };
