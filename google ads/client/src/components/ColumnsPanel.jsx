import { useState } from 'react';
import { Icon, HelpLink } from './Common.jsx';
import { LEVELS, sectionsFor, colLabel, colsFor, helpTopic, ATTR_COLS } from './columns.js';
import { METRICS } from '../../../shared/metrics.js';

// Saved column sets: kept in this browser, one list per table.
const SET_NAME_MAX = 40;
const SET_COUNT_MAX = 20;
const setsKey = (level) => `ap.colsets.${level}`;
function loadSets(level) {
  try {
    const v = JSON.parse(localStorage.getItem(setsKey(level)));
    return Array.isArray(v) ? v.filter((s) => s && typeof s.name === 'string' && Array.isArray(s.cols)) : [];
  } catch {
    return [];
  }
}
function storeSets(level, sets) {
  try { localStorage.setItem(setsKey(level), JSON.stringify(sets)); } catch { /* ignore */ }
}
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// level: which table ('campaigns' | 'adgroups' | 'ads'); locked: the always-shown columns
// (defaults to the table's own list).
export default function ColumnsPanel({ cols, onApply, onCancel, level = 'ads', locked }) {
  const SECTIONS = sectionsFor(level);
  const LOCKED = locked || LEVELS[level].locked;
  // With "Show recommended columns" on, these show as recommended (indeterminate) and are
  // not listed under Your columns.
  const REC = SECTIONS[0].items;
  const [draft, setDraft] = useState(cols);
  const [open, setOpen] = useState({});
  const [query, setQuery] = useState(null);
  const [drag, setDrag] = useState(null);
  const [save, setSave] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [sets, setSets] = useState(() => loadSets(level));
  const [picked, setPicked] = useState(null);
  // On while every recommended column is in the table; switching it adds or removes them all.
  const [recommended, setRecommended] = useState(() => REC.every((k) => cols.includes(k)));
  const switchRecommended = () => {
    const on = !recommended;
    setRecommended(on);
    setDraft((d) => (on ? [...d, ...REC.filter((k) => !d.includes(k))] : d.filter((k) => !REC.includes(k))));
  };

  // Unticking a recommended column turns "Show recommended columns" off, so Apply keeps it out
  // (and the other recommended columns show under Your columns, where they can be removed too).
  const toggle = (k) => {
    if (recommended && REC.includes(k) && draft.includes(k)) setRecommended(false);
    setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));
  };
  const q = (query || '').trim().toLowerCase();
  const matches = (label) => !q || label.toLowerCase().includes(q);

  const onDrop = (target) => {
    if (drag == null || drag === target) return;
    const next = draft.filter((k) => k !== drag);
    next.splice(next.indexOf(target) + (draft.indexOf(drag) < draft.indexOf(target) ? 1 : 0), 0, drag);
    setDraft(next);
    setDrag(null);
  };

  // A saved set fills in the columns (Apply puts them in the table); its name is kept so
  // saving again under it updates that set.
  const pickSet = (s) => {
    const list = colsFor(level, s.cols);
    setDraft(list);
    setRecommended(REC.every((k) => list.includes(k)));
    setPicked(s.name);
    setName(s.name);
    setNameError('');
  };
  const deleteSet = (s) => {
    const next = sets.filter((x) => x.name !== s.name);
    setSets(next);
    storeSets(level, next);
    if (picked === s.name) setPicked(null);
  };
  const apply = () => {
    const list = recommended ? [...draft, ...REC.filter((k) => !draft.includes(k))] : draft;
    if (save) {
      const n = name.trim();
      if (!n) return setNameError('Enter a name for this column set');
      if (n.length > SET_NAME_MAX) return setNameError(`Use ${SET_NAME_MAX} characters or fewer`);
      if (!list.length) return setNameError('Pick at least one column to save');
      const others = sets.filter((s) => !sameName(s.name, n));
      if (others.length >= SET_COUNT_MAX) return setNameError(`You can keep up to ${SET_COUNT_MAX} column sets: delete one first`);
      const next = [...others, { name: n, cols: list }];
      setSets(next);
      storeSets(level, next);
    }
    return onApply(list);
  };

  return (
    <section className="card colpanel" data-testid="columns-panel">
      <div className="colpanel-main">
        <div className="colpanel-head">
          <h2>Modify columns for {LEVELS[level].noun}</h2>
          {query == null
            ? <button className="iconbtn" aria-label="Search columns" onClick={() => setQuery('')}><Icon name="search" /></button>
            : <input className="col-search" autoFocus placeholder="Search columns" value={query} onChange={(e) => setQuery(e.target.value)} />}
          <span className="vsep" />
          <span className="na-wrap">
            <button type="button" className="btn-text with-icon"><Icon name="add" />Custom column</button>
          </span>
        </div>
        <div className="colpanel-body">
          {sets.length > 0 && !q && (
            <div className="colsets" data-testid="column-sets">
              <div className="colsets-title">Saved column sets</div>
              {sets.map((s) => (
                <div key={s.name} className={`colset ${picked === s.name ? 'on' : ''}`} data-testid="column-set">
                  <button type="button" className="colset-pick" onClick={() => pickSet(s)} aria-pressed={picked === s.name}>
                    <Icon name="view_column" />
                    <span className="colset-name">{s.name}</span>
                    <small className="muted">{s.cols.length} {s.cols.length === 1 ? 'column' : 'columns'}</small>
                  </button>
                  <button type="button" className="iconbtn sm" aria-label={`Delete column set ${s.name}`} title="Delete this column set" onClick={() => deleteSet(s)}>
                    <Icon name="delete" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {SECTIONS.map((s) => {
            const items = s.items.filter((it) => matches(typeof it === 'string' ? colLabel(it) : it.label));
            if (q && !items.length) return null;
            const isOpen = q ? true : !!open[s.title];
            return (
              <div className={`colsec ${isOpen ? 'open' : ''}`} key={s.title}>
                <button className="colsec-head" onClick={() => setOpen((o) => ({ ...o, [s.title]: !o[s.title] }))}>
                  <span>{s.title}</span>
                  <Icon name={isOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} />
                </button>
                {isOpen && (
                  <div className="colsec-grid">
                    {items.length === 0 && <div className="muted">No custom columns yet</div>}
                    {items.map((it, i) => {
                      if (typeof it === 'string') {
                        const help = METRICS[it]?.help || ATTR_COLS[it]?.help;
                        const formula = METRICS[it]?.formula;
                        const rec = recommended && REC.includes(it) && draft.includes(it);
                        return (
                          <div className="colcheck-wrap" key={it + i}>
                            <label className="colcheck">
                              <input type="checkbox" checked={draft.includes(it)} onChange={() => toggle(it)}
                                ref={(el) => { if (el) el.indeterminate = rec; }} />
                              <span className={s.title === 'Recommended columns' || ATTR_COLS[it]?.dashed ? 'dashed' : ''}>{colLabel(it)}</span>
                            </label>
                            {help && (
                              <div className="colcheck-tip" role="tooltip">
                                {/* Static help copy from shared/metrics.js / columns.js (it may contain <b>). */}
                                <span dangerouslySetInnerHTML={{ __html: formula ? `${help} Formula: ${formula}` : help }} />
                                <HelpLink className="tip-link" topic={helpTopic(it)} />
                              </div>
                            )}
                          </div>
                        );
                      }
                      return (
                        <label className="colcheck disabled" key={it.label}>
                          <input type="checkbox" disabled />
                          <span>{it.label}{it.note && <small> {it.note}</small>}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="colpanel-side">
        <div className="yc-head">
          <div className="yc-title">Your columns</div>
          <div className="yc-sub">Drag and drop to reorder</div>
        </div>
        <div className="yc-list">
          {LOCKED.map((l) => <div className="yc-item locked" key={l}><Icon name="lock" /><span>{l}</span></div>)}
          <div className="yc-div" />
          {draft.filter((k) => !(recommended && REC.includes(k))).map((k) => (
            <div key={k} className={`yc-item ${drag === k ? 'dragging' : ''}`} draggable
              onDragStart={() => setDrag(k)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(k)} onDragEnd={() => setDrag(null)}>
              <Icon name="drag_handle" />
              <span>{colLabel(k)}</span>
              <button className="iconbtn sm" aria-label={`Remove ${colLabel(k)}`} onClick={() => toggle(k)}><Icon name="cancel" /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="colpanel-foot">
        <label className="colcheck">
          <input type="checkbox" checked={save} data-testid="save-column-set" onChange={(e) => { setSave(e.target.checked); setNameError(''); }} />
          <span>Save your column set (name required)</span>
        </label>
        {save && (
          <span className="colset-namebox">
            <input className={`colset-input ${nameError ? 'bad' : ''}`} autoFocus value={name} maxLength={SET_NAME_MAX} placeholder="Column set name"
              aria-label="Column set name" aria-invalid={!!nameError} data-testid="column-set-name"
              onChange={(e) => { setName(e.target.value); setNameError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} />
            {nameError
              ? <small className="colset-error" aria-live="polite" data-testid="column-set-error">{nameError}</small>
              : <small className="muted">Saving under an existing name replaces that set</small>}
          </span>
        )}
        <span className="spacer" />
        <span>Show recommended columns in your tables</span>
        <button className={`toggle ${recommended ? 'on' : ''}`} role="switch" aria-checked={recommended} onClick={switchRecommended} data-testid="recommended-toggle"><span /></button>
        <div className="colpanel-actions">
          <button className="btn-primary" onClick={apply}>Apply</button>
          <button className="btn-text" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </section>
  );
}
