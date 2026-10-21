import React from 'react';
import { X } from 'lucide-react';
import FilterMenu from './FilterMenu.jsx';
import { RealSearch } from './real-icons.jsx';
import './fid-filter.css';

// The search / filter bar under the quick views, with the filter dropdown that opens under it.
//   searchRef (ref of the wrapper: used for outside clicks)   menus + open(key)(bool)   qvChips: chips of the active quick view
//   onRemoveQv()   filters / onRemoveFilter(i)   filterLabel(f) -> node   selOnly (Set or null) / onClearSelOnly()
//   search / setSearch   hasAnyFilter / onClearAll()
//   filterMenuProps: props handed to <FilterMenu> (initial, levelName, filters, setFilters, selectedCount, onSelectedOnly, onSuggest, close)

// The "search with a sparkle" glyph of the real bar: the real page's own SVG (16 px), see real-icons.jsx.
const SearchGlyph = () => <RealSearch className="fs-glyph" />;

const XIcon = () => <X size={14} strokeWidth={2.2} />;

export default function SearchBar({ searchRef, menus, open, qvChips, onRemoveQv, filters, onRemoveFilter, filterLabel, selOnly, onClearSelOnly, search, setSearch, hasAnyFilter, onClearAll, filterMenuProps }) {
  return (
    <div className="sbar fid-filter" ref={searchRef}>
      <div className="fs-wrap">
        <div className={`search ${menus.filter ? 'focus' : ''}`} onClick={(e) => { e.currentTarget.querySelector('input')?.focus(); open('filter')(true); }}>
          <SearchGlyph />
          {qvChips.map((c, i) => <span className="chip" key={'q' + i}><span className="chip-t">{c}</span><button type="button" onClick={(e) => { e.stopPropagation(); onRemoveQv(); }} aria-label="Remove filter"><XIcon /></button></span>)}
          {filters.map((f, i) => <span className="chip" key={i}><span className="chip-t">{filterLabel(f)}</span><button type="button" onClick={(e) => { e.stopPropagation(); onRemoveFilter(i); }} aria-label="Remove filter"><XIcon /></button></span>)}
          {selOnly && <span className="chip"><span className="chip-t">Selected rows ({selOnly.size})</span><button type="button" onClick={(e) => { e.stopPropagation(); onClearSelOnly(); }} aria-label="Remove filter"><XIcon /></button></span>}
          <input value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => open('filter')(true)} placeholder="Describe what you're looking for" aria-label="Search" />
          {hasAnyFilter && <button type="button" className="clr" onClick={(e) => { e.stopPropagation(); onClearAll(); }}>Clear</button>}
        </div>
        {menus.filter && <div className="pop filterpop"><FilterMenu key={filterMenuProps.key} {...Object.fromEntries(Object.entries(filterMenuProps).filter(([k]) => k !== 'key'))} /></div>}
      </div>
    </div>
  );
}
