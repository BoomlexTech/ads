import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, HelpLink } from '../Common.jsx';
import {
  tabOf, WW_TABLES, WW_SECTIONS, sectionItems, WW_ALL_METRICS, WW_METRICS, WW_ATTRS, colLabelWw, helpWw, WW_REC_NOTE,
} from '../../../../shared/whenwhere.js';
import './ww-columns.css';

// "Modify columns" for one tab of When and where ads showed. It takes the place of the chart and
// the table until Apply or Cancel. `cols` / `onApply(list, rec)`: the tab's chosen (non-locked)
// columns, in order; `rec` is { showRec } when "Show recommended columns in your tables" was
// switched (the page applies it to the other tabs' tables).

const known = (k) => !!(WW_ALL_METRICS[k] || WW_ATTRS[k]);
const noteOf = (k) => WW_ALL_METRICS[k]?.note || '';

// Saved column sets live in this browser, one list per tab.
const SET_NAME_MAX = 40;
const SET_COUNT_MAX = 20;
const setsKey = (tab) => `ww.colsets.${tab}`;
const REC_KEY = 'ww.showRec';
function loadSets(tab, locked) {
  try {
    const v = JSON.parse(localStorage.getItem(setsKey(tab)));
    if (!Array.isArray(v)) return [];
    return v.filter((s) => s && typeof s.name === 'string' && Array.isArray(s.cols))
      .map((s) => ({ name: s.name, cols: s.cols.filter((k) => known(k) && !locked.includes(k)) }));
  } catch {
    return [];
  }
}
function storeSets(tab, sets) {
  try { localStorage.setItem(setsKey(tab), JSON.stringify(sets)); } catch { /* storage off: the set lasts this visit */ }
}
function loadShowRec() {
  try { return localStorage.getItem(REC_KEY) !== '0'; } catch { return true; }
}
function storeShowRec(on) {
  try { localStorage.setItem(REC_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The section chevron is thinner than the icon font's, so it is drawn (16.8 x 9.6 like the reference).
function Chevron({ up }) {
  return (
    <span className="ww-cc-chevbox" aria-hidden="true">
      <svg width="18" height="11" viewBox="0 0 18 11">
        <path d={up ? 'M1.2 9.8 9 2l7.8 7.8' : 'M1.2 1.2 9 9l7.8-7.8'} fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    </span>
  );
}

// A checkbox with its 40px hover halo; `mixed` shows the recommended (indeterminate) dash.
function Check({ checked, mixed = false, onChange, ...rest }) {
  return (
    <span className="ww-cc-box">
      <input type="checkbox" checked={checked} onChange={onChange} ref={(el) => { if (el) el.indeterminate = mixed; }} {...rest} />
    </span>
  );
}

// Help card for a hovered column: it opens with a short loading bar, then the column's help text.
function HelpCard({ tip, onEnter, onLeave }) {
  const ref = useRef(null);
  // Keep the card inside the window: flip above the label when there's no room below.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(tip.x, window.innerWidth - width - 8));
    const top = tip.y + height > window.innerHeight - 8 ? Math.max(8, tip.top - 6 - height) : tip.y;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });
  const help = helpWw(tip.k);
  const ready = tip.phase === 'ready';
  return createPortal(
    <div ref={ref} className={`ww-cc-tip ${ready ? 'ready' : 'load'}`} role="tooltip" style={{ left: tip.x, top: tip.y }}
      onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {ready ? (
        <>
          {help.paras.map((p, i) => (
            <p key={i}>{typeof p === 'string' ? p : p.map((seg, j) => (typeof seg === 'string' ? seg : <b key={j}>{seg.b}</b>))}</p>
          ))}
          {help.link && <p><HelpLink topic="metrics" className="ww-cc-tip-link">{help.link}</HelpLink></p>}
          {WW_METRICS[tip.k]?.rec && (
            <>
              <div className="ww-cc-tip-sep" />
              <p>{WW_REC_NOTE}</p>
            </>
          )}
        </>
      ) : <span className="ww-cc-bar" />}
    </div>,
    document.body,
  );
}

// A new tab starts a fresh draft (its columns, sections and saved sets differ).
export default function WwColumns(props) {
  return <ColumnsPanel key={props.tab} {...props} />;
}

// locked: the table's fixed columns as the page shows them now (they follow the When mode and the
// Matched locations view); the tab's usual ones when not given.
function ColumnsPanel({ tab, locked: lockedNow, cols, onApply, onCancel }) {
  const table = WW_TABLES[tab];
  const locked = lockedNow || table.locked;
  const sections = table.sections.map((s) => ({ key: s, title: WW_SECTIONS[s].title, items: sectionItems(tab, s).filter(known) }));
  // With "Show recommended columns" on, these show the dash instead of a tick.
  const REC = sections.find((s) => s.key === 'recommended')?.items || [];

  const [draft, setDraft] = useState(() => cols.filter((k) => known(k) && !locked.includes(k)));
  const [open, setOpen] = useState({});
  const [query, setQuery] = useState(null);
  const [drag, setDrag] = useState(null);
  const [save, setSave] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [sets, setSets] = useState(() => loadSets(tab, locked));
  const [picked, setPicked] = useState(null);
  // On while every recommended column is in the table (and the viewer hasn't switched it off).
  const [recStart] = useState(() => REC.length > 0 && loadShowRec() && REC.every((k) => cols.includes(k)));
  const [recommended, setRecommended] = useState(recStart);
  // Only the switch itself changes the setting (unticking one recommended column doesn't).
  const switched = useRef(false);

  const switchRecommended = () => {
    const on = !recommended;
    switched.current = true;
    setRecommended(on);
    setDraft((d) => (on ? [...d, ...REC.filter((k) => !d.includes(k))] : d.filter((k) => !REC.includes(k))));
  };
  // Unticking a recommended column switches "Show recommended columns" off, so Apply keeps it out.
  const toggle = (k) => {
    if (recommended && REC.includes(k) && draft.includes(k)) setRecommended(false);
    setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));
  };

  const q = (query || '').trim().toLowerCase();
  const matches = (k) => !q || `${colLabelWw(k)} ${noteOf(k)}`.toLowerCase().includes(q);
  const shown = sections.map((s) => ({ ...s, items: s.items.filter(matches) })).filter((s) => !q || s.items.length);

  // ---- help cards
  const [tip, setTip] = useState(null);
  const timers = useRef({});
  const clear = (...names) => names.forEach((n) => clearTimeout(timers.current[n]));
  const hoverItem = (k, el) => {
    if (tip?.k === k) { clear('close'); return; }
    clear('open', 'phase', 'close');
    setTip(null);
    if (!helpWw(k)) return;
    timers.current.open = setTimeout(() => {
      const r = el.querySelector('.ww-cc-text').getBoundingClientRect();
      setTip({ k, x: r.left - 13, y: r.bottom + 6, top: r.top, phase: 'load' });
      timers.current.phase = setTimeout(() => setTip((t) => (t && t.k === k ? { ...t, phase: 'ready' } : t)), 450);
    }, 450);
  };
  const leave = () => {
    clear('open', 'close');
    timers.current.close = setTimeout(() => { clear('phase'); setTip(null); }, 150);
  };
  const closeTip = () => { clear('open', 'phase', 'close'); setTip(null); };
  useEffect(() => () => clear('open', 'phase', 'close'), []);
  // The card is pinned to the window, so it goes away when anything under it scrolls.
  useEffect(() => {
    if (!tip) return undefined;
    window.addEventListener('scroll', closeTip, true);
    return () => window.removeEventListener('scroll', closeTip, true);
  }, [!!tip]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Your columns: drag (or Alt + arrow keys) to reorder
  const move = (k, to) => {
    const from = draft.indexOf(k);
    if (from < 0 || to < 0 || to >= draft.length || from === to) return;
    const next = [...draft];
    next.splice(from, 1);
    next.splice(to, 0, k);
    setDraft(next);
  };
  // Swap only once the pointer is past the target's middle, so rows of different heights don't
  // trade places back and forth.
  const dragOver = (e, k) => {
    e.preventDefault();
    if (drag == null || drag === k) return;
    const from = draft.indexOf(drag);
    const to = draft.indexOf(k);
    const r = e.currentTarget.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if ((from < to && e.clientY < mid) || (from > to && e.clientY > mid)) return;
    move(drag, to);
  };

  // ---- saved column sets
  const pickSet = (s) => {
    setDraft(s.cols);
    setRecommended(REC.length > 0 && REC.every((k) => s.cols.includes(k)));
    setPicked(s.name);
    setName(s.name);
    setNameError('');
  };
  const deleteSet = (s) => {
    const next = sets.filter((x) => x.name !== s.name);
    setSets(next);
    storeSets(tab, next);
    if (picked === s.name) setPicked(null);
  };
  const apply = () => {
    if (save) {
      const n = name.trim();
      if (!n) return setNameError('Enter a name for this column set');
      if (n.length > SET_NAME_MAX) return setNameError(`Use ${SET_NAME_MAX} characters or fewer`);
      if (!draft.length) return setNameError('Pick at least one column to save');
      const others = sets.filter((s) => !sameName(s.name, n));
      if (others.length >= SET_COUNT_MAX) return setNameError(`You can keep up to ${SET_COUNT_MAX} column sets: delete one first`);
      const next = [...others, { name: n, cols: draft }];
      setSets(next);
      storeSets(tab, next);
    }
    // The switch is for all the tables: a flip is saved and handed to the page for the other tabs.
    const flip = switched.current && REC.length > 0 && recommended !== recStart;
    if (flip) storeShowRec(recommended);
    closeTip();
    return onApply(draft, flip ? { showRec: recommended } : undefined);
  };

  const item = (k) => {
    const mixed = recommended && REC.includes(k) && draft.includes(k);
    const note = noteOf(k);
    return (
      <label key={k} className="ww-cc-item" onMouseEnter={(e) => hoverItem(k, e.currentTarget)} onMouseLeave={leave}>
        <Check checked={draft.includes(k)} mixed={mixed} onChange={() => { closeTip(); toggle(k); }} />
        <span className="ww-cc-text">
          <span className={WW_METRICS[k]?.rec ? 'ww-cc-label rec' : 'ww-cc-label'}>{colLabelWw(k)}</span>
          {note && <span className="ww-cc-note">{note}</span>}
        </span>
      </label>
    );
  };

  return (
    <section className="ww-cc" data-testid="ww-columns">
      <div className="ww-cc-main">
        <div className="ww-cc-head">
          <h2 className="ww-cc-title">{tabOf(tab).columnsTitle}</h2>
          {query != null && (
            <input className="ww-cc-search" autoFocus placeholder="Search columns" aria-label="Search columns" value={query}
              onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQuery(null); }} />
          )}
          <button type="button" className="iconbtn ww-cc-searchbtn" aria-label={query == null ? 'Search columns' : 'Close search'}
            onClick={() => setQuery(query == null ? '' : null)}>
            <Icon name={query == null ? 'search' : 'close'} />
          </button>
        </div>
        <div className="ww-cc-list">
          {sets.length > 0 && !q && (
            <div className="ww-cc-sets" data-testid="ww-column-sets">
              <div className="ww-cc-sets-title">Your column sets</div>
              {sets.map((s) => (
                <div key={s.name} className={`ww-cc-set ${picked === s.name ? 'on' : ''}`}>
                  <button type="button" className="ww-cc-set-pick" aria-pressed={picked === s.name} onClick={() => pickSet(s)}>
                    <Icon name="view_column" />
                    <span className="ww-cc-set-name">{s.name}</span>
                    <span className="ww-cc-set-count"><span data-metric="live">{s.cols.length}</span> {s.cols.length === 1 ? 'column' : 'columns'}</span>
                  </button>
                  <button type="button" className="iconbtn ww-cc-set-del" aria-label={`Delete column set ${s.name}`} onClick={() => deleteSet(s)}>
                    <Icon name="delete" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {shown.map((s) => {
            const isOpen = q ? true : !!open[s.key];
            return (
              <div key={s.key} className={`ww-cc-sec ${isOpen ? 'open' : ''}`}>
                <button type="button" className="ww-cc-sechead" aria-expanded={isOpen}
                  onClick={() => !q && setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}>
                  <span>{s.title}</span>
                  <Chevron up={isOpen} />
                </button>
                {isOpen && (s.items.length
                  ? <div className="ww-cc-grid">{s.items.map(item)}</div>
                  : <div className="ww-cc-empty">No columns in this category</div>)}
              </div>
            );
          })}
          {q && !shown.length && <div className="ww-cc-empty">No columns match your search</div>}
        </div>
      </div>

      <div className="ww-cc-side">
        <div className="ww-cc-yhead">
          <div className="ww-cc-ytitle">Your columns</div>
          <div className="ww-cc-ysub">Drag and drop to reorder</div>
        </div>
        <div className="ww-cc-ylist" data-testid="ww-your-columns">
          {locked.map((k) => (
            <div key={k} className="ww-cc-yitem locked"><Icon name="lock" /><span className="ww-cc-yname">{colLabelWw(k)}</span></div>
          ))}
          {draft.length > 0 && <div className="ww-cc-ydiv" />}
          {draft.map((k) => (
            <div key={k} className={`ww-cc-yitem drag ${drag === k ? 'dragging' : ''}`} draggable tabIndex={0}
              aria-label={`${colLabelWw(k)}. Alt and arrow keys move it`}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k); setDrag(k); }}
              onDragOver={(e) => dragOver(e, k)} onDrop={(e) => { e.preventDefault(); setDrag(null); }} onDragEnd={() => setDrag(null)}
              onKeyDown={(e) => {
                if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                e.preventDefault();
                move(k, draft.indexOf(k) + (e.key === 'ArrowUp' ? -1 : 1));
              }}>
              <Icon name="drag_handle" />
              <span className="ww-cc-yname">
                {colLabelWw(k)}
                {noteOf(k) && <small>{noteOf(k)}</small>}
              </span>
              <button type="button" className="iconbtn ww-cc-remove" aria-label={`Remove ${colLabelWw(k)}`} draggable={false}
                onClick={() => toggle(k)}>
                <Icon name="cancel" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="ww-cc-foot">
        <div className="ww-cc-frow">
          <label className="ww-cc-save">
            <Check checked={save} data-testid="ww-save-column-set" onChange={(e) => { setSave(e.target.checked); setNameError(''); }} />
            <span>Save your column set (name required)</span>
          </label>
          {save && (
            <span className="ww-cc-namebox">
              <input className={`ww-cc-name ${nameError ? 'bad' : ''}`} autoFocus value={name} maxLength={SET_NAME_MAX}
                placeholder="Column set name" aria-label="Column set name" aria-invalid={!!nameError} data-testid="ww-column-set-name"
                onChange={(e) => { setName(e.target.value); setNameError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} />
              {nameError
                ? <small className="ww-cc-error" aria-live="polite">{nameError}</small>
                : <small>Saving under an existing name replaces that set</small>}
            </span>
          )}
          <span className="ww-cc-reclabel" id="ww-cc-rec">Show recommended columns in your tables</span>
          <button type="button" className={`ww-cc-switch ${recommended ? 'on' : ''}`} role="switch" aria-checked={recommended}
            aria-labelledby="ww-cc-rec" data-testid="ww-recommended-toggle" onClick={switchRecommended}>
            <span />
          </button>
        </div>
        <div className="ww-cc-actions">
          <button type="button" className="ww-cc-apply" onClick={apply}>Apply</button>
          <button type="button" className="ww-cc-cancel" onClick={() => { closeTip(); onCancel(); }}>Cancel</button>
        </div>
      </div>
      {tip && <HelpCard tip={tip} onEnter={() => clear('close')} onLeave={leave} />}
    </section>
  );
}
