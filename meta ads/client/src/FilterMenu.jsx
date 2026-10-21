import React, { useState } from 'react';
import { FILTER_FIELDS, TEXT_OPS, NUM_OPS } from './lib.js';
import sparkle from './assets/filter/ai-sparkle.png';
import './fid-filter.css';

// The filter dropdown under the search bar (rendered by SearchBar inside <div className="pop filterpop">).
//   levelName ("Ad" / "Ad set" / "Campaign")   filters / setFilters   selectedCount   onSelectedOnly()   close()   initial (field id to open on)
//   onSuggest(kind) OPTIONAL: an AI suggestion was picked ('top' | 'bottom' | 'lowcost'); without it the three rows do nothing

// order of the text fields as in Ads Manager; the metric fields the clone offers come below them under "Metrics"
const FIELD_ORDER = ['name', 'id', 'objective', 'delivery', 'bidStrategy'];
// the reference shows the first group of rows in a slightly different ink than the later ones; kept as is
const SOFT_INK = new Set(['name', 'id', 'delivery']);

const Caret = ({ up }) => (
  <svg className="ff-caret" width="10.7" height="7.1" viewBox="0 0 12 8" fill="none" aria-hidden="true" style={up ? undefined : { transform: 'rotate(180deg)' }}>
    <path d="M1.2 6.9L6 1.5l4.8 5.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function FilterMenu({ levelName, filters, setFilters, selectedCount, onSelectedOnly, close, initial, onSuggest }) {
  const [hidden, setHidden] = useState(false); // "Hide filters" collapses the list; resets whenever the panel is opened again
  const startEd = (f) => ({ field: f.id, op: f.text ? (f.id === 'delivery' ? 'is' : 'contains') : 'gt', value: '' });
  const [ed, setEd] = useState(() => { const f = initial && FILTER_FIELDS.find((x) => x.id === initial); return f ? startEd(f) : null; }); // {field, op, value}
  const add = (f) => { setFilters([...filters, f]); close(); };
  const byId = (id) => FILTER_FIELDS.find((f) => f.id === id);
  const texts = FIELD_ORDER.map(byId).filter(Boolean);
  const metrics = FILTER_FIELDS.filter((f) => !f.text);
  const def = ed && byId(ed.field);
  const plural = `${String(levelName || 'ad').toLowerCase()}s`;
  const suggest = (kind) => (onSuggest ? () => { onSuggest(kind); close(); } : undefined);
  const row = (f, cls = '') => (
    <button key={f.id} type="button" className={`ff-row ${SOFT_INK.has(f.id) ? 'soft' : ''} ${ed && ed.field === f.id ? 'on' : ''} ${cls}`} onClick={() => setEd(startEd(f))}>{f.label}</button>
  );
  return (
    <div className="fid-fm">
      <div className="ff-scroll">
        <div className="ff-title">AI suggestions</div>
        {[['top', `Top-performing ${plural}`], ['bottom', `Bottom-performing ${plural}`], ['lowcost', `Low cost per result ${plural}`]].map(([k, t]) => (
          <button key={k} type="button" className="ff-row ff-ai" onClick={suggest(k)}><img src={sparkle} alt="" draggable="false" />{t}</button>
        ))}
        <button type="button" className="ff-link" aria-expanded={!hidden} onClick={() => setHidden(!hidden)}>{hidden ? 'Show filters' : 'Hide filters'}<Caret up={!hidden} /></button>
        {!hidden && (
          <>
            <button type="button" className="ff-row soft" disabled={!selectedCount} onClick={() => { onSelectedOnly(); close(); }}>Filter selected rows only</button>
            {texts.map((f) => row(f))}
            <div className="ff-hr" />
            <div className="ff-cap">Metrics</div>
            {metrics.map((f) => row(f))}
          </>
        )}
      </div>
      {ed && def && (
        <div className="ff-ed">
          <b>{def.label}</b>
          <div className="ff-ed-r">
            <select value={ed.op} aria-label="Condition" onChange={(e) => setEd({ ...ed, op: e.target.value })}>{(def.text ? TEXT_OPS : NUM_OPS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input autoFocus value={ed.value} type={def.text ? 'text' : 'number'} step="any" placeholder="Value" aria-label="Value" onChange={(e) => setEd({ ...ed, value: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && ed.value !== '' && add(ed)} />
            <button type="button" className="ff-apply" disabled={ed.value === ''} onClick={() => add(ed)}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
