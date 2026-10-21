import React, { useMemo, useRef, useState } from 'react';
import { IconChevron, IconCheck } from './icons.jsx';
import { useOutside } from './ui.jsx';
import { RANGE_PRESETS, COMPARE_OPTIONS, compareRange, presetRange, todayStr, parse, ymd, fmtDay, fmtLong } from './lib.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Month({ y, m, from, to, hover, today, onPick, onHover, setYM, minYear }) {
  const first = new Date(y, m, 1);
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) cells.push(ymd(new Date(y, m, d)));
  const end = to || hover;
  const [lo, hi] = from && end ? (from <= end ? [from, end] : [end, from]) : [from, from];
  const years = []; for (let i = Math.min(minYear, y); i <= Math.max(parse(today).getFullYear(), y); i++) years.push(i);
  return (
    <div className="dp-m">
      <div className="dp-mh">
        <select value={m} onChange={(e) => setYM(y, +e.target.value)}>{FULL_M.map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
        <select value={y} onChange={(e) => setYM(+e.target.value, m)}>{years.map((n) => <option key={n}>{n}</option>)}</select>
      </div>
      <div className="dp-grid">
        {DOW.map((d) => <div className="dp-dow" key={d}>{d}</div>)}
        {cells.map((c, i) => c === null ? <div key={i} /> : (
          <button key={c} disabled={c > today} onClick={() => onPick(c)} onMouseEnter={() => onHover(c)}
            className={`dp-day ${c >= lo && c <= hi ? 'inr' : ''} ${c === lo ? 'st' : ''} ${c === hi ? 'en' : ''} ${c === today ? 'today' : ''}`}>
            <span>{parse(c).getDate()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DatePicker({ value, minDate, onApply, onClose, boundary }) {
  const ref = useRef(null);
  useOutside(boundary || ref, onClose);
  const today = todayStr();
  const [sel, setSel] = useState({ id: value.id, from: value.from, to: value.to });
  const [cmp, setCmp] = useState({ on: !!value.compare, id: value.compare?.id || 'prev', from: value.compare?.from || '', to: value.compare?.to || '' });
  const cr = cmp.on ? compareRange(cmp.id, sel.from, sel.to, cmp) : null; // the comparison dates, live as the main range changes
  const [picking, setPicking] = useState(false); // true after first click of a custom range
  const [hover, setHover] = useState(null);
  const start = parse(value.from);
  const t0 = parse(today);
  const clampYM = ({ y, m }) => (y * 12 + m > t0.getFullYear() * 12 + t0.getMonth() ? { y: t0.getFullYear(), m: t0.getMonth() } : { y, m });
  const [ym, setYmRaw] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const setYm = (v) => setYmRaw((cur) => clampYM(typeof v === 'function' ? v(cur) : v));
  const next = ym.m === 11 ? { y: ym.y + 1, m: 0 } : { y: ym.y, m: ym.m + 1 };
  const minYear = Math.min(2024, parse(minDate || today).getFullYear());

  const choose = (id) => {
    if (id === 'custom') return setSel((s) => ({ ...s, id: 'custom' }));
    const [from, to] = presetRange(id, minDate);
    setSel({ id, from, to });
    const d = parse(from); setYm({ y: d.getFullYear(), m: d.getMonth() }); setPicking(false);
  };
  const pick = (d) => {
    if (!picking) { setSel({ id: 'custom', from: d, to: d }); setPicking(true); }
    else { const [from, to] = d < sel.from ? [d, sel.from] : [sel.from, d]; setSel({ id: 'custom', from, to }); setPicking(false); }
  };
  const shift = (k) => setYm(({ y, m }) => { const n = m + k; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });
  const canNext = ymd(new Date(next.y, next.m, 1)) <= today;

  return (
    <div className="dp" ref={ref}>
      <div className="dp-side">
        {RANGE_PRESETS.map(([id, label]) => (
          <button key={id} className={`dp-radio ${sel.id === id ? 'on' : ''}`} onClick={() => choose(id)}><i />{label}</button>
        ))}
      </div>
      <div className="dp-main">
        <div className="dp-cal">
          <button className="dp-nav" onClick={() => shift(-1)} aria-label="Previous month"><IconChevron dir="left" /></button>
          <div className="dp-months" style={{ flex: 1 }} onMouseLeave={() => setHover(null)}>
            <Month {...ym} from={sel.from} to={picking ? null : sel.to} hover={picking ? hover : null} today={today} onPick={pick} onHover={setHover}
              setYM={(y, m) => setYm({ y, m })} minYear={minYear} />
            <Month {...next} from={sel.from} to={picking ? null : sel.to} hover={picking ? hover : null} today={today} onPick={pick} onHover={setHover}
              setYM={(y, m) => m === 0 ? setYm({ y: y - 1, m: 11 }) : setYm({ y, m: m - 1 })} minYear={minYear} />
          </div>
          <button className="dp-nav" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month" style={{ opacity: canNext ? 1 : .35 }}><IconChevron dir="right" /></button>
        </div>
        <label className="dp-cmp"><button type="button" className={`chk ${cmp.on ? 'on' : ''}`} onClick={() => setCmp((c) => ({ ...c, on: !c.on }))} aria-label="Compare">{cmp.on && <IconCheck />}</button>Compare</label>
        <div className="dp-fields">
          <span className={`dp-dot ${cmp.on ? 'on' : ''}`} />
          <select className="fld sel" disabled={!cmp.on} value={cmp.on ? cmp.id : ''} onChange={(e) => setCmp((c) => ({ ...c, id: e.target.value }))}>
            <option value="" disabled>Select an item</option>
            {COMPARE_OPTIONS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
          {cmp.on && cmp.id === 'custom'
            ? <><input className="fld" type="date" max={today} value={cmp.from} onChange={(e) => setCmp((c) => ({ ...c, from: e.target.value }))} /><span>-</span><input className="fld" type="date" max={today} value={cmp.to} onChange={(e) => setCmp((c) => ({ ...c, to: e.target.value }))} /></>
            : <><div className="fld">{fmtLong(cr ? cr.from : sel.from)}</div><span>-</span><div className="fld">{fmtLong(cr ? cr.to : sel.to)}</div></>}
        </div>
        {cmp.on && cr && <div className="dp-note">Comparing {fmtDay(sel.from)} - {fmtDay(sel.to)} with {fmtDay(cr.from)} - {fmtDay(cr.to)}</div>}
        <div className="dp-foot">
          <small>Dates are shown in Kolkata Time</small>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={cmp.on && !cr} onClick={() => onApply({ ...sel, compare: cmp.on ? { id: cmp.id, from: cmp.from, to: cmp.to } : null })}>Update</button>
          </div>
        </div>
      </div>
    </div>
  );
}
