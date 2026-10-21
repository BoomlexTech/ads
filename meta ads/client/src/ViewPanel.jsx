import React, { useLayoutEffect, useRef, useState } from 'react';
import { FILTER_FIELDS, colById } from './lib.js';
import gCols from './assets/view/g-cols.png';
import gSort from './assets/view/g-sort.png';
import gUp from './assets/view/g-up.png';
import gGear from './assets/view/g-gear.png';
import gSortOpt from './assets/view/g-sortopt.png';
import gBd from './assets/view/g-bd.png';
import gCaret from './assets/view/g-caret.png';
import './fid-view.css';

// The right-hand "Create view" / "Save edits" pane (quick views). Looks like the real Ads Manager pane:
//   white panel with a soft shadow, own header (title + close), a scrolling settings area (with its own scrollbar) and a footer
//   with the Save button; the whole panel has a second, outer scrollbar like the real page.
//   mode: 'create' | 'edit'   base: { name, desc, access, inc? }   onSave({ name, desc, access, inc }, asCopy)   onClose()
//   ctx (optional, for the settings blocks): { cols, preset, sort: {col, dir}, breakdown, filters, onAddFilter, onRemoveFilter }
//     onAddFilter()      called by the "+ Add" row under Filters
//     onRemoveFilter(i)  optional: when given, the filter chips get a small remove button
//   `inc` (the settings turned on) is passed to onSave: { filters, columns, breakdown, grouping, attribution } (all on by default)
const K = 1.125; // reference screenshot px per design px

// a glyph cropped from the reference (ink painted in currentColor through a CSS mask); w / h in reference px
const Glyph = ({ src, w, h, rot, className = '' }) => (
  <span className={`fid-view-gl ${className}`} aria-hidden="true"
    style={{ width: w / K, height: h / K, WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`, transform: rot ? `rotate(${rot}deg)` : undefined }} />
);
// small solid caret (cropped from the reference: the real one has softly rounded corners)
const Caret = ({ className = 'fid-view-caret' }) => <Glyph src={gCaret} w={16} h={10} className={className} />;
// close glyph: two flat-ended diagonals, 16 reference px
const Cross = () => (
  <svg width="14.2" height="14.2" viewBox="0 0 16 16" aria-hidden="true"><path d="M.7 .7 15.3 15.3M15.3 .7.7 15.3" fill="none" stroke="currentColor" strokeWidth="1.75" /></svg>
);
// plus of the "+ Add" rows: two flat-ended strokes, 16 reference px
const Plus = () => (
  <svg width="14.2" height="14.2" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0V16M0 8H16" fill="none" stroke="currentColor" strokeWidth="1.75" /></svg>
);
const InfoDot = () => (
  <svg className="fid-view-info" width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
    <circle cx="7.5" cy="7.5" r="7.5" fill="currentColor" /><circle cx="7.5" cy="4" r="1.1" fill="#fff" /><rect x="6.5" y="6.1" width="2" height="5.6" rx=".5" fill="#fff" />
  </svg>
);

const BD_LABEL = { none: 'None selected', day: 'Day', week: 'Week', '2weeks': '2 weeks', month: 'Month' };
const bdLabel = (b) => BD_LABEL[b] || String(b || 'none').replace(/^x:/, '') || 'None selected';
const OPS = { gt: '>', lt: '<', eq: '=', gte: '\u2265', lte: '\u2264', contains: 'contains', not: 'does not contain', is: 'is' };
const filterText = (f) => `${FILTER_FIELDS.find((x) => x.id === f.field)?.label || f.field} ${OPS[f.op] || f.op} ${f.value}`;

// switch (ON: light-blue track, blue knob at the right)
const Switch = ({ on, onChange, label }) => (
  <button type="button" className={`fid-view-sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><i /></button>
);

export default function ViewPanel({ mode, base, onSave, onClose, ctx }) {
  const [name, setName] = useState(base?.name || '');
  const [desc, setDesc] = useState(base?.desc || '');
  const [access, setAccess] = useState(base?.access || 'Only you');
  const [inc, setInc] = useState(() => ({ filters: true, columns: true, breakdown: true, grouping: true, attribution: true, ...(base?.inc || {}) }));
  const [sh, setSh] = useState({ top: false, bottom: false }); // content scrolled away at the top / still more below the footer
  const bodyRef = useRef(null);
  const edit = mode === 'edit';
  const c = ctx || {};
  const set = (k) => (v) => setInc((s) => ({ ...s, [k]: v }));
  const filters = c.filters || [];
  const sortCol = colById[c.sort?.col]?.label || (c.sort?.col ? String(c.sort.col) : 'Delivery');
  const asc = c.sort?.dir === 'asc'; // the real pane shows the arrow the other way round than the table header (header: down arrow = pane: up arrow)
  const colsTip = c.preset && c.preset !== 'Custom' ? `Columns: ${c.preset}` : c.cols ? `Columns: ${c.cols.length} columns` : 'Columns';
  const canSave = !!name.trim();

  // scroll shadows of the settings area: under the header once scrolled, above the footer while more content is below
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const check = () => {
      const top = el.scrollTop > 0, bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setSh((s) => (s.top === top && s.bottom === bottom ? s : { top, bottom }));
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(check); ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    return () => { el.removeEventListener('scroll', check); if (ro) ro.disconnect(); };
  }, []);

  const save = (asCopy) => () => onSave({ name, desc, access, inc }, asCopy);
  const title = edit ? 'Save edits' : 'Create view';

  return (
    <aside className="fid-view" aria-label={title}>
      <div className="fid-view-panel"><div className="fid-view-scroll">
        <div className={`fid-view-head${sh.top ? ' sh' : ''}`}>
          <h3>{title}</h3>
          <button type="button" className="fid-view-x" onClick={onClose} aria-label="Close"><Cross /></button>
        </div>

        <div className="fid-view-body" ref={bodyRef}>
          <div className="fid-view-in">
            <label className="fid-view-f">
              <span className="fid-view-lbl">Name{edit && <InfoDot />}</span>
              <span className="fid-view-inp"><input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Enter a name for this view." /><em>{name.length}/100</em></span>
            </label>
            <label className="fid-view-f">
              <span className="fid-view-lbl">Description</span>
              <span className="fid-view-inp"><input value={desc} maxLength={350} onChange={(e) => setDesc(e.target.value)} placeholder="Describe what this view is about." /><em>{desc.length}/350</em></span>
            </label>
            <label className="fid-view-f">
              <span className="fid-view-lbl">Access</span>
              <span className="fid-view-sel">
                <select value={access} onChange={(e) => setAccess(e.target.value)}><option>Only you</option><option>Everyone with access to this ad account</option></select>
                <Caret className="fid-view-selcaret" />
              </span>
            </label>

            <div className="fid-view-hr" />
            <h4 className="fid-view-h">Settings</h4>
            <p className="fid-view-p">Turn on the settings to apply them when you open this quick view.</p>

            {/* Filters */}
            <div className="fid-view-row"><b>Filters</b><Switch on={inc.filters} onChange={set('filters')} label="Filters" /></div>
            {filters.length > 0 && (
              <div className="fid-view-chips">
                {filters.map((f, i) => (
                  <span className="fid-view-chip" key={i} title={filterText(f)}><span>{filterText(f)}</span>
                    {c.onRemoveFilter && <button type="button" aria-label={`Remove filter ${filterText(f)}`} onClick={() => c.onRemoveFilter(i)}>{'\u00d7'}</button>}
                  </span>
                ))}
              </div>
            )}
            <button type="button" className="fid-view-add" disabled={!inc.filters} onClick={() => c.onAddFilter && c.onAddFilter()}><Plus /><span>Add</span></button>

            {/* Columns / Sorting */}
            <div className="fid-view-row"><b>Columns</b><Switch on={inc.columns} onChange={set('columns')} label="Columns" /></div>
            <div className="fid-view-line">
              <button type="button" className="fid-view-btn grow" disabled={!inc.columns} aria-label={colsTip}><Glyph src={gCols} w={22} h={18} /><span>Columns</span><Caret /></button>
              <button type="button" className="fid-view-btn sq" disabled={!inc.columns} aria-label="Column settings"><Glyph src={gGear} w={21} h={18} /></button>
            </div>
            <div className="fid-view-line">
              <button type="button" className="fid-view-btn grow" disabled={!inc.columns}><Glyph src={gSort} w={22} h={18} /><span>Sorting: {sortCol}</span><Caret /></button>
              <button type="button" className="fid-view-btn sq" disabled={!inc.columns} aria-label={asc ? 'Ascending' : 'Descending'}><Glyph src={gUp} w={16} h={18} rot={asc ? 180 : 0} /></button>
              <button type="button" className="fid-view-btn sq" disabled={!inc.columns} aria-label="Sorting options"><Glyph src={gSortOpt} w={20} h={19} /></button>
            </div>

            {/* Breakdowns */}
            <div className="fid-view-row"><b>Breakdowns</b><Switch on={inc.breakdown} onChange={set('breakdown')} label="Breakdowns" /></div>
            <div className="fid-view-line">
              <button type="button" className="fid-view-btn grow bd" disabled={!inc.breakdown} data-tip="View rows by specific metrics"><Glyph src={gBd} w={20} h={20} /><span>Breakdowns: {bdLabel(c.breakdown)}</span><Caret /></button>
            </div>

            {/* Grouping */}
            <div className="fid-view-row"><b>Grouping</b><Switch on={inc.grouping} onChange={set('grouping')} label="Grouping" /></div>

            {/* Attribution settings */}
            <div className="fid-view-row"><b>Attribution settings</b><Switch on={inc.attribution} onChange={set('attribution')} label="Attribution settings" /></div>
            <button type="button" className="fid-view-add" disabled={!inc.attribution}><Plus /><span>Add comparison</span></button>
          </div>
        </div>

        <div className={`fid-view-foot${sh.bottom ? ' sh' : ''}`}>
          {edit && <button type="button" className="fid-view-save alt" disabled={!canSave} onClick={save(true)}>Save copy</button>}
          <button type="button" className="fid-view-save" disabled={!canSave} onClick={save(false)}>{edit ? 'Save edits' : 'Save'}</button>
        </div>
        <div className="fid-view-tail" />
      </div></div>
    </aside>
  );
}
