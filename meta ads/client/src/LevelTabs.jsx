import React, { useEffect, useRef } from 'react';
import { TabIcons } from './fid-toolbar-icons.jsx';
import gX from './assets/toolbar/g-x.png';
import './fid-tip.css';
import './fid-tip.js';
import './fid-toolbar.css';

// The Campaigns / Ad sets / Ads tabs above the table.
//   tabs: [[id, label, Icon]]   level: active id   onSwitch(id)   labelOf(id, baseLabel) -> text
//   selectedCount: rows selected on the active level   onClearSel()   tip(text) -> {'data-tip': text}
// Tooltips read "Campaigns (Alt + 1)" ...; the Alt + 1 / 2 / 3 keys switch the tab.
// The active tab shows a blue "N selected  x" pill while rows are selected (x clears the selection).
const glyph = (id, active, Fallback) => {
  if (id === 'campaign') return <TabIcons.campaign />;
  if (id === 'adset') return <TabIcons.adset />;
  if (id === 'ad') return active ? <TabIcons.adActive /> : <TabIcons.adIdle />;
  return Fallback ? <Fallback active={active} /> : null;
};

export default function LevelTabs({ tabs, level, onSwitch, labelOf, selectedCount, onClearSel, tip }) {
  // Alt + 1 / 2 / 3 -> Campaigns / Ad sets / Ads (always uses the latest props)
  const latest = useRef({ tabs, onSwitch });
  latest.current = { tabs, onSwitch };
  useEffect(() => {
    const k = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      // only the digit row (Alt + Numpad digits type characters on Windows) and never while typing in a field
      const m = /^Digit([1-9])$/.exec(e.code || '');
      if (!m) return;
      const t = e.target;
      if (t && t.nodeType === 1 && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const tab = latest.current.tabs[Number(m[1]) - 1];
      if (!tab) return;
      e.preventDefault();
      latest.current.onSwitch(tab[0]);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const tipOf = (text) => (tip ? tip(text) : { 'data-tip': text });
  return (
    <div className="tabs fid-tabs" role="tablist">
      {tabs.map(([id, label, Icon], i) => {
        const active = level === id;
        const clearable = active && selectedCount > 0;
        return (
          <button key={id} role="tab" aria-selected={active} className={`tab fid-tab ${active ? 'active' : ''}`} onClick={() => onSwitch(id)} {...tipOf(`${label} (Alt + ${i + 1})`)}>
            {glyph(id, active, Icon)}
            <span className="fid-tab-l">{labelOf(id, label)}</span>
            {clearable && (
              <span className="fid-sel">
                <span className="fid-sel-t">{selectedCount} selected</span>
                <span className="fid-sel-x" role="button" tabIndex={0} aria-label="Clear selection"
                  onClick={(e) => { e.stopPropagation(); if (onClearSel) onClearSel(); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (onClearSel) onClearSel(); } }}>
                  <i className="fid-sel-xi" style={{ WebkitMaskImage: `url(${gX})`, maskImage: `url(${gX})` }} />
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
