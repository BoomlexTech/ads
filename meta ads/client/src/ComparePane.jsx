import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { derive, addDays, fmtDay, fInt, fMoney, fMoney3, fCpm, fPct, fDec } from './lib.js';
import './fid-pane.css';

// The right-hand "Compare all ads" pane (opened by the charts button): Trends / Breakdowns tabs, a granularity dropdown,
// the Metric card with its chart. Props: from, to (YYYY-MM-DD), adIds (comma list), selectedRows, level, onClose, refreshKey.
// Optional: inset (default true) - the pane draws its own light-blue frame (8px left, 4px right/bottom) like Ads Manager;
// pass inset={false} when the surrounding card already provides that frame.
const METRICS = [
  ['spend', 'Amount spent', fMoney], ['impressions', 'Impressions', fInt], ['reach', 'Reach', fInt], ['linkClicks', 'Link clicks', fInt],
  ['cpm', 'CPM (cost per 1,000 impressions)', fCpm], ['ctr', 'CTR (all)', fPct], ['cpc', 'CPC (all)', fMoney3], ['frequency', 'Frequency', fDec],
];
const RATE = ['cpm', 'ctr', 'cpc', 'frequency'];
const short = (l) => l.replace(/ \(.*/, '');

// small filled caret (same triangle as the toolbar carets)
const Caret = () => (
  <svg className="fid-pane-caret" width="12.4" height="7.1" viewBox="0 0 14 8" aria-hidden="true"><path d="M1.1 .9h11.8L7 7.1z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
);
// solid pencil (the "Metric" button icon)
const Pencil = () => (
  <svg className="fid-pane-pencil" width="16.9" height="16.9" viewBox="0 0 19 19" aria-hidden="true">
    <path fill="currentColor" d="M.5 18.5V13l10.4-10.4 5.5 5.5L6 18.5z" />
    <path fill="currentColor" d="M12.2 1.4a2.4 2.4 0 0 1 3.4 0l2 2a2.4 2.4 0 0 1 0 3.4l-.4.4-5.4-5.4z" />
  </svg>
);
// the close glyph: two flat-ended diagonals, 16x16 screenshot px (14.2 design px), stroke about 2 screenshot px
const Cross = () => (
  <svg className="fid-pane-cross" width="14.2" height="14.2" viewBox="0 0 16 16" aria-hidden="true"><path d="M.7 .7 15.3 15.3M15.3 .7.7 15.3" fill="none" stroke="currentColor" strokeWidth="1.95" /></svg>
);
// the empty-state illustration: a line chart made of nodes
const NodesIllustration = () => (
  <svg className="fid-pane-ill" width="50.7" height="41.8" viewBox="0 0 57 47" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path strokeWidth="3" d="M2 35.5c2.2-2 4.4-4.4 6-4.7 2.2-.4 3.6 3.6 5.2 5.4" />
    <path strokeWidth="3" d="M19.4 36.7 24.1 26.3M29.7 24.5 41.1 30.7M45.8 28.6 49.3 11" />
    <circle cx="17.6" cy="40.6" r="4.3" strokeWidth="3.4" />
    <circle cx="25.9" cy="22.4" r="4.3" strokeWidth="3.4" />
    <circle cx="44.9" cy="32.8" r="4.3" strokeWidth="3.4" />
    <circle cx="50.2" cy="6.8" r="4.3" strokeWidth="3.4" />
  </svg>
);

export default function ComparePane({ from, to, adIds, selectedRows, level, onClose, refreshKey, inset = true }) {
  const [tab, setTab] = useState('trends');
  const [metric, setMetric] = useState('spend');
  const [gran, setGran] = useState('day');
  const [menu, setMenu] = useState(false);
  const [series, setSeries] = useState(null);
  const [grand, setGrand] = useState(null); // headline total over the whole range (not just the charted days)
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(330);
  const [scrolls, setScrolls] = useState(false); // the inner area scrolls: the real page then also scrolls the whole pane a little
  const box = useRef(null);
  const bodyRef = useRef(null);
  const mmRef = useRef(null);
  const noun = level === 'ad' ? 'ads' : level === 'adset' ? 'ad sets' : 'campaigns';
  const n = selectedRows.length;

  // the chart is as wide as its box; the box shrinks when the inner scrollbar appears or the pane / window is resized, so it is observed
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => setW(Math.max(260, Math.floor(el.clientWidth)));
    fit();
    window.addEventListener('resize', fit);
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(fit); ro.observe(el); }
    return () => { window.removeEventListener('resize', fit); if (ro) ro.disconnect(); };
  }, [tab, n]);

  // does the inner area need its own scrollbar? (re-checked whenever its content or the pane size changes)
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const check = () => setScrolls(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [tab, n, series, menu]);

  // the Metric list closes on an outside click or Escape
  useEffect(() => {
    if (!menu) return undefined;
    mmRef.current?.querySelector('.fid-pane-menu')?.scrollIntoView({ block: 'nearest' });
    const away = (e) => { if (mmRef.current && !mmRef.current.contains(e.target)) setMenu(false); };
    // Escape: capture phase on window, so the first press only closes this list (the app's own Escape handler would close the pane too)
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); } };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc, true); };
  }, [menu]);

  useEffect(() => {
    if (!n) { setSeries([]); return undefined; }
    let live = true;
    setSeries(null);
    const ids = new Set(adIds ? adIds.split(',') : []);
    api.report({ from, to, level: 'ad', breakdown: gran }).then(({ rows }) => {
      if (!live) return;
      const by = new Map();
      for (const r of rows) {
        if (!ids.has(r.entityId)) continue;
        const a = by.get(r.periodKey) || { label: r.period, spend: 0, impressions: 0, reach: 0, linkClicks: 0 };
        a.spend += r.spend; a.impressions += r.impressions; a.reach += r.reach; a.linkClicks += r.linkClicks;
        by.set(r.periodKey, a);
      }
      let out;
      setGrand(derive([...by.values()].reduce((t, v) => ({ spend: t.spend + v.spend, impressions: t.impressions + v.impressions, reach: t.reach + v.reach, linkClicks: t.linkClicks + v.linkClicks }), { spend: 0, impressions: 0, reach: 0, linkClicks: 0 })));
      if (gran === 'day') { out = []; for (let d = from; d <= to && out.length < 1100; d = addDays(d, 1)) out.push({ key: d, label: fmtDay(d), ...derive(by.get(d) || {}) }); }
      else out = [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => ({ key: k, label: v.label, ...derive(v) }));
      setSeries(out);
    }).catch(() => live && setSeries([]));
    return () => { live = false; };
  }, [from, to, adIds, gran, refreshKey, n]);

  const [, label, fmt] = METRICS.find((m) => m[0] === metric);
  const H = 190, P = { l: 52, r: 8, t: 10, b: 24 };
  const pts = useMemo(() => (series || []).map((s) => (s.hasData ? s[metric] : null)), [series, metric]);
  const total = grand || derive({});
  const max = Math.max(...pts.map((v) => v ?? 0), 0) * 1.1 || 1;
  const bw = pts.length ? (W - P.l - P.r) / pts.length : 0;
  const y = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
  const cx = (i) => P.l + bw * i + bw / 2;
  const path = pts.map((v, i) => (v == null ? null : `${pts[i - 1] == null ? 'M' : 'L'}${cx(i)},${y(v)}`)).filter(Boolean).join(' ');
  const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor((W - P.l) / 80))));
  const title = n === 0 ? `Compare all ${noun}` : n === 1 ? selectedRows[0].name : `Compare ${n} ${noun}`;

  // Breakdowns tab: one bar per selected row for the chosen metric
  const metricOf = (r) => ({ spend: r.spend, impressions: r.impressions, reach: r.reach, linkClicks: r.linkClicks, cpm: r.cpm, ctr: r.ctr, cpc: r.cpc, frequency: r.frequency })[metric];
  const bars = selectedRows.map((r) => [r.name, metricOf(r)]);
  const bmax = Math.max(...bars.map((b) => b[1] ?? 0), 0) || 1;

  return (
    <aside className={`fid-pane${inset ? '' : ' flush'}`} aria-label="Charts">
      <div className="fid-pane-panel"><div className="fid-pane-scroll">
        <div className="fid-pane-head"><h3 title={title}>{title}</h3><button className="fid-pane-x" onClick={onClose} aria-label="Close"><Cross /></button></div>
        <div className="fid-pane-body" ref={bodyRef}>
          <div className="fid-pane-in">
            <div className="fid-pane-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'trends'} className={tab === 'trends' ? 'on' : ''} onClick={() => setTab('trends')}>Trends</button>
              <button role="tab" aria-selected={tab === 'breakdowns'} className={tab === 'breakdowns' ? 'on' : ''} onClick={() => setTab('breakdowns')}>Breakdowns</button>
            </div>
            {tab === 'trends' && <label className="fid-pane-sel"><select value={gran} onChange={(e) => setGran(e.target.value)} aria-label="Granularity"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select><Caret /></label>}
            <div className="fid-pane-card">
              <div className="fid-pane-top">
                <div className="fid-pane-mhead">
                  <div className="fid-pane-mt">{short(label)}</div>
                  {n ? <div className="fid-pane-mv">{fmt(total[metric])}</div> : <div className="fid-pane-mv dash" aria-label="No data"><i /><i /></div>}
                </div>
                <div className="fid-pane-mm" ref={mmRef}>
                  <button className="fid-pane-mbtn" onClick={() => setMenu(!menu)} aria-haspopup="listbox" aria-expanded={menu}><Pencil /><span>Metric</span><Caret /></button>
                  {menu && (
                    <div className="pop right fid-pane-menu" role="listbox">
                      {METRICS.map(([id, l]) => (
                        <button key={id} role="option" aria-selected={metric === id} className={`fid-pane-opt ${metric === id ? 'on' : ''}`} onClick={() => { setMetric(id); setMenu(false); }}>
                          <i className="fid-pane-radio" />{short(l)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {!n ? (
                <div className="fid-pane-empty"><NodesIllustration /><b>No rows selected</b><span>Select one or more {noun.replace(/s$/, '')} to see charts.</span></div>
              ) : tab === 'trends' ? (
                <div ref={box} className="fid-pane-chart">
                  {series === null ? <div className="fid-pane-load">Loading…</div> : (
                    <>
                      <svg className="fid-pane-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
                        {[0, 0.5, 1].map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(max * t)} y2={y(max * t)} className={t === 0 ? 'ax' : 'gl'} /><text x={P.l - 6} y={y(max * t) + 4} textAnchor="end">{fmt(max * t).replace(/\.\d+/, (d) => (max > 20 ? '' : d))}</text></g>)}
                        {!RATE.includes(metric) && pts.map((v, i) => v != null && <rect key={i} className={hover === i ? 'bar hov' : 'bar'} x={P.l + bw * i + bw * 0.15} width={Math.max(1, bw * 0.7)} y={y(v)} height={H - P.b - y(v)} rx="2" />)}
                        {RATE.includes(metric) && <path className="ln" d={path} fill="none" />}
                        {RATE.includes(metric) && pts.map((v, i) => v != null && <circle key={i} className="dot" cx={cx(i)} cy={y(v)} r={hover === i ? 5 : 3} />)}
                        {pts.map((_, i) => <rect key={'h' + i} x={P.l + bw * i} width={bw} y={P.t} height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />)}
                        {series.map((s, i) => i % every === 0 && <text key={s.key} x={cx(i)} y={H - 6} textAnchor="middle">{s.label.replace(/ \d{4}$/, '').replace(/ – .*/, '')}</text>)}
                      </svg>
                      {hover != null && series[hover] && <div className={`fid-pane-tip${hover * 2 >= pts.length ? ' left' : ''}`}><b>{series[hover].label}</b><br />{short(label)}: {pts[hover] == null ? 'No data' : fmt(pts[hover])}</div>}
                    </>
                  )}
                </div>
              ) : (
                <div className="fid-pane-bars">{bars.map(([nm, v]) => (
                  <div key={nm} className="fid-pane-bar"><span title={nm}>{nm}</span><div><i style={{ width: `${Math.max(2, ((v ?? 0) / bmax) * 100)}%` }} /></div><b>{v == null ? '—' : fmt(v)}</b></div>
                ))}</div>
              )}
            </div>
          </div>
        </div>
        {scrolls && <div className="fid-pane-tail" aria-hidden="true" />}
      </div></div>
    </aside>
  );
}
