import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { api } from './api.js';
import { derive, addDays, fmtDay, fInt, fMoney, fMoney3, fCpm, fPct, fDec, FILTER_FIELDS, TEXT_OPS, NUM_OPS } from './lib.js';

/* ------------------------------------------------------------------ activity history */
const fv = (v) => (v == null ? '∅' : typeof v === 'number' ? String(Math.round(v * 10000) / 10000) : String(v).length > 48 ? String(v).slice(0, 45) + '…' : String(v));
const when = (iso) => new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function HistoryDrawer({ entity, onClose, refreshKey }) {
  const [items, setItems] = useState(null);
  const [scope, setScope] = useState(entity ? 'one' : 'all');
  const [type, setType] = useState('all');
  const [by, setBy] = useState('all');
  const shown = (items || []).filter((h) => (type === 'all' || (type === 'status' ? /^Turned (on|off)/.test(h.action) : h.entityType === type)) && (by === 'all' || h.by === by));
  useEffect(() => {
    let live = true;
    api.history(scope === 'one' && entity ? entity.entityId || entity.id : '').then((r) => live && (setItems(r), setBy((b) => (b === 'all' || r.some((h) => h.by === b) ? b : 'all')))).catch(() => live && setItems([]));
    return () => { live = false; };
  }, [scope, entity, refreshKey]);
  return (
    <div className="drawer" role="dialog" aria-label="Activity history">
      <div className="mh"><h2>Activity history</h2><button className="x" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      {entity && (
        <div style={{ padding: '10px 20px 0' }}>
          <div className="seg" style={{ marginBottom: 8 }}>
            <button className={scope === 'one' ? 'on' : ''} onClick={() => setScope('one')}>{entity.name.length > 24 ? entity.name.slice(0, 22) + '…' : entity.name}</button>
            <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All activity</button>
          </div>
        </div>
      )}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <div className="hist-filters">
          <label><span>Activity types</span>
            <select className="inp" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All activity</option><option value="campaign">Campaigns</option><option value="adset">Ad sets</option><option value="ad">Ads</option><option value="stat">Performance data</option>
              <option value="status">Run status</option>
            </select></label>
          <label><span>Changed by</span>
            <select className="inp" value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="all">Anyone</option>{[...new Set((items || []).map((h) => h.by).filter(Boolean))].map((b) => <option key={b} value={b}>{b}</option>)}
            </select></label>
        </div>
        {items === null && <div className="empty">Loading…</div>}
        {items && !shown.length && <div className="empty">No activity yet.</div>}
        {shown.map((h) => (
          <div className="hist-item" key={h._id}>
            <div className="top"><span className={`act ${h.action.replace(/ /g, '-')}`}>{h.action}</span><span className="t">{when(h.createdAt)}</span></div>
            <div>{h.summary}</div>
            {h.by && <div className="hist-by">by {h.by}</div>}
            {h.changes?.filter((c) => c.field !== 'media').slice(0, 6).map((c, i) => (
              <div className="chg" key={i}><b>{c.field}</b>: {fv(c.from)} → {fv(c.to)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ charts */
const METRICS = [
  ['spend', 'Amount spent', fMoney], ['impressions', 'Impressions', fInt], ['reach', 'Reach', fInt], ['linkClicks', 'Link clicks', fInt],
  ['cpm', 'CPM', fCpm], ['ctr', 'CTR (all)', fPct], ['cpc', 'CPC (all)', fMoney3], ['frequency', 'Frequency', fDec],
];

export function ChartsPanel({ from, to, adIds, onClose, refreshKey }) {
  const [metric, setMetric] = useState('spend');
  const [series, setSeries] = useState(null);
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(1000);
  const box = useRef(null);

  // fit the drawing to the panel so text and dots keep their size
  useLayoutEffect(() => {
    const fit = () => box.current && setW(Math.max(320, Math.floor(box.current.clientWidth)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    let live = true;
    setSeries(null);
    const ids = new Set(adIds ? adIds.split(',') : []);
    api.report({ from, to, level: 'ad', breakdown: 'day' }).then(({ rows }) => {
      if (!live) return;
      const by = new Map();
      for (const r of rows) {
        if (!ids.has(r.entityId)) continue; // follow the table: only the rows it shows / has selected
        const a = by.get(r.periodKey) || { spend: 0, impressions: 0, reach: 0, linkClicks: 0 };
        a.spend += r.spend; a.impressions += r.impressions; a.reach += r.reach; a.linkClicks += r.linkClicks;
        by.set(r.periodKey, a);
      }
      // every calendar day in the range, so days without data stay visible as gaps
      const out = [];
      for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push({ key: d, label: fmtDay(d), ...derive(by.get(d) || {}) });
      setSeries(out);
    }).catch(() => live && setSeries([]));
    return () => { live = false; };
  }, [from, to, adIds, refreshKey]);

  const [, label, fmt] = METRICS.find((m) => m[0] === metric);
  const H = 190, P = { l: 56, r: 12, t: 10, b: 26 };
  const pts = useMemo(() => (series || []).map((s) => (s.hasData ? s[metric] : null)), [series, metric]); // null = no data that day
  const max = Math.max(...pts.map((v) => v ?? 0), 0) * 1.1 || 1;
  const bw = pts.length ? (W - P.l - P.r) / pts.length : 0;
  const y = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
  const isRate = ['cpm', 'ctr', 'cpc', 'frequency'].includes(metric);
  const cx = (i) => P.l + bw * i + bw / 2;
  // polyline that breaks across days without data instead of dropping to zero / joining over gaps
  const path = pts.map((v, i) => (v == null ? null : `${pts[i - 1] == null ? 'M' : 'L'}${cx(i)},${y(v)}`)).filter(Boolean).join(' ');
  const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor((W - P.l) / 90))));

  return (
    <div className="chartpanel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="metrics">{METRICS.map(([id, l]) => <button key={id} className={metric === id ? 'on' : ''} onClick={() => setMetric(id)}>{l}</button>)}</div>
        <button className="x mh-x" style={{ border: 0, background: 'none' }} onClick={onClose} aria-label="Close charts"><X size={18} /></button>
      </div>
      <div ref={box} style={{ position: 'relative' }}>
        {series === null ? <div className="empty" style={{ padding: 40 }}>Loading…</div> : !series.length || pts.every((v) => v == null) ? <div className="empty" style={{ padding: 40 }}>No data for the selected rows in this range.</div> : (
          <>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <g key={t}><line x1={P.l} x2={W - P.r} y1={y(max * t)} y2={y(max * t)} stroke="#e4e6eb" /><text x={P.l - 8} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="#65676b">{fmt(max * t).replace(/\.\d+/, (d) => (max > 20 ? '' : d))}</text></g>
              ))}
              {!isRate && pts.map((v, i) => v != null && <rect key={i} x={P.l + bw * i + bw * 0.15} width={Math.max(1, bw * 0.7)} y={y(v)} height={H - P.b - y(v)} rx="2" fill={hover === i ? '#08679f' : '#0a78be'} />)}
              {isRate && <path d={path} fill="none" stroke="#0a78be" strokeWidth="2.5" strokeLinejoin="round" />}
              {isRate && pts.map((v, i) => v != null && <circle key={i} cx={cx(i)} cy={y(v)} r={hover === i ? 5 : 3} fill="#0a78be" />)}
              {pts.map((_, i) => <rect key={'h' + i} x={P.l + bw * i} width={bw} y={P.t} height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />)}
              {series.map((s, i) => i % every === 0 && <text key={s.key} x={cx(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#65676b">{s.label.replace(/ \d{4}$/, '')}</text>)}
            </svg>
            {hover != null && series[hover] && (
              <div style={{ position: 'absolute', top: 4, right: 12, background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.25)', borderRadius: 6, padding: '6px 10px', fontSize: 12.5 }}>
                <b>{series[hover].label}</b><br />{label}: {pts[hover] == null ? 'No data' : fmt(pts[hover])}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ filters (Meta style) */
export function FilterPanel({ filters, setFilters, close }) {
  const [draft, setDraft] = useState(filters.length ? filters : [{ field: 'name', op: 'contains', value: '' }]);
  const upd = (i, p) => setDraft((d) => d.map((f, j) => {
    if (j !== i) return f;
    const n = { ...f, ...p };
    if (p.field) { const isText = FILTER_FIELDS.find((x) => x.id === p.field).text; n.op = isText ? 'contains' : 'gt'; n.value = ''; }
    return n;
  }));
  return (
    <div style={{ padding: 4 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Filter rows</div>
      {draft.map((f, i) => {
        const def = FILTER_FIELDS.find((x) => x.id === f.field);
        return (
          <div className="frow" key={i}>
            <select className="inp" value={f.field} onChange={(e) => upd(i, { field: e.target.value })}>{FILTER_FIELDS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
            <select className="inp" value={f.op} onChange={(e) => upd(i, { op: e.target.value })}>{(def.text ? TEXT_OPS : NUM_OPS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input className="inp" value={f.value} type={def.text ? 'text' : 'number'} step="any" placeholder="Value" onChange={(e) => upd(i, { value: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (setFilters(draft.filter((x) => x.value !== '')), close())} />
            <button className="btn" style={{ padding: 0 }} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={15} /></button>
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <button className="btn" onClick={() => setDraft((d) => [...d, { field: 'spend', op: 'gt', value: '' }])}><Plus size={14} style={{ verticalAlign: -2 }} /> Add filter</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => { setFilters([]); close(); }}>Clear all</button>
          <button className="btn primary" onClick={() => { setFilters(draft.filter((x) => x.value !== '')); close(); }}>Apply</button>
        </div>
      </div>
    </div>
  );
}
