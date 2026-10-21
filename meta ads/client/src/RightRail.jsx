import React from 'react';
import { RailBars, RailPencil, RailClock } from './fid-topbar-icons.jsx';
import './fid-topbar.css';

// The dark tool rail at the right edge of the page: performance charts, edit selected, activity history.
//   viewer (charts and edit are disabled on the main site)   onCharts()   onEdit()   onHistory()
//   selectedCount (OPTIONAL, number of selected rows): in the real page "Edit" and "Activity history" are drawn dim (60 % white)
//   while nothing is selected and bright as soon as a row is selected. Only the look changes: the buttons stay clickable.
//   When the prop is left out the two glyphs stay bright.
// The real page shows no tooltips on these glyphs; `title` is kept for accessibility.
export default function RightRail({ viewer, onCharts, onEdit, onHistory, selectedCount }) {
  const none = selectedCount === 0;
  return (
    <aside className="rail-r fid-rail-r" aria-label="Tools">
      <button title={viewer ? undefined : 'Performance charts'} aria-label="Performance charts" disabled={viewer} onClick={onCharts}><RailBars /></button>
      <button className={viewer || none ? 'fid-rr-dim' : undefined} title={viewer ? undefined : 'Edit selected'} aria-label="Edit selected" disabled={viewer} onClick={onEdit}><RailPencil /></button>
      <button className={none ? 'fid-rr-dim' : undefined} title="Activity history" aria-label="Activity history" onClick={onHistory}><RailClock /></button>
    </aside>
  );
}
