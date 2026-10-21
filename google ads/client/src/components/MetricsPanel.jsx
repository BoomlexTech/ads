import { useEffect, useState } from 'react';
import { Icon } from './Common.jsx';
import { METRICS, SCORECARD_KEYS } from '../../../shared/metrics.js';

const MAX = 4;
const has = (k) => !!METRICS[k];
const SECTIONS = [
  { title: 'Recommended columns', items: ['clicks', 'cost', 'impressions', 'avgCpc', 'conversions'].filter(has) },
  { title: 'Performance', items: ['impressions', 'clicks', 'ctr', 'avgCpc', 'avgCpm', 'cost', 'interactions', 'interactionRate', 'avgCost'].filter((k) => has(k) && SCORECARD_KEYS.includes(k)) },
  { title: 'Conversions', items: ['conversions', 'convRate', 'costPerConv'].filter(has) },
];

// "Modify metrics" side drawer: pick up to four metrics for the scorecards/graph and order them.
export default function MetricsPanel({ cards, onApply, onCancel }) {
  const [draft, setDraft] = useState(cards.filter(has).slice(0, MAX));
  const [open, setOpen] = useState({ 'Recommended columns': true });
  const [query, setQuery] = useState(null);
  const [drag, setDrag] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const toggle = (k) => setDraft((d) => (d.includes(k) ? d.filter((x) => x !== k) : d.length < MAX ? [...d, k] : d));
  const q = (query || '').trim().toLowerCase();
  const onDrop = (target) => {
    if (drag == null || drag === target) return;
    const next = draft.filter((k) => k !== drag);
    next.splice(next.indexOf(target) + (draft.indexOf(drag) < draft.indexOf(target) ? 1 : 0), 0, drag);
    setDraft(next);
    setDrag(null);
  };

  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <aside className="metrics-drawer" role="dialog" aria-modal="true" aria-label="Modify metrics" data-testid="metrics-panel">
        <div className="md-head">
          <button type="button" className="iconbtn" aria-label="Close" onClick={onCancel}><Icon name="close" /></button>
          <h2>Modify metrics</h2>
        </div>
        <div className="md-body">
          <div className="md-main">
            <div className="md-sub">
              {query == null
                ? <><span>Select metrics to add to the graph</span><button type="button" className="iconbtn" aria-label="Search metrics" onClick={() => setQuery('')}><Icon name="search" /></button></>
                : <input className="col-search" autoFocus placeholder="Search metrics" value={query} onChange={(e) => setQuery(e.target.value)} />}
            </div>
            <div className="colpanel-body">
              {SECTIONS.map((s) => {
                const items = s.items.filter((k) => !q || METRICS[k].label.toLowerCase().includes(q));
                if (q && !items.length) return null;
                const isOpen = q ? true : !!open[s.title];
                return (
                  <div className={`colsec ${isOpen ? 'open' : ''}`} key={s.title}>
                    <button type="button" className="colsec-head" onClick={() => setOpen((o) => ({ ...o, [s.title]: !o[s.title] }))}>
                      <span>{s.title}</span>
                      <Icon name={isOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} />
                    </button>
                    {isOpen && (
                      <div className="colsec-grid">
                        {items.map((k) => {
                          const on = draft.includes(k);
                          return (
                            <label className={`colcheck ${!on && draft.length >= MAX ? 'disabled' : ''}`} key={k}>
                              <input type="checkbox" checked={on} disabled={!on && draft.length >= MAX} onChange={() => toggle(k)} />
                              <span>{METRICS[k].label}</span>
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
          <div className="md-side">
            <div className="yc-head">
              <div className="yc-title">Your columns</div>
              <div className="yc-sub">Drag and drop to reorder</div>
            </div>
            <div className="yc-list">
              {draft.map((k) => (
                <div key={k} className={`yc-item ${drag === k ? 'dragging' : ''}`} draggable
                  onDragStart={() => setDrag(k)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(k)} onDragEnd={() => setDrag(null)}>
                  <Icon name="drag_handle" />
                  <span>{METRICS[k].label}</span>
                  <button type="button" className="iconbtn sm" aria-label={`Remove ${METRICS[k].label}`} onClick={() => toggle(k)}><Icon name="cancel" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="md-foot">
          <button type="button" className="btn-primary" disabled={!draft.length} onClick={() => onApply(draft)}>Apply</button>
          <button type="button" className="btn-text" onClick={onCancel}>Cancel</button>
          <span className="md-note">Up to {MAX} metrics</span>
        </div>
      </aside>
    </>
  );
}
