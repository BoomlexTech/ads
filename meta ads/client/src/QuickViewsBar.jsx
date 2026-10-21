import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Menu } from './ui.jsx';
import { rectCss } from './HeadMenus.jsx';
import { FILTER_FIELDS } from './lib.js';
import { FolderFill, FolderLine, ActionsIcon, PlaneIcon, MailIcon, PencilIcon, BackArrow, ChevronRight, PlusBold, PlusThin, SlidersIcon, RecoIcon } from './fid-qv-icons.jsx';
import './fid-qv.css';

// The quick-views row under the top bar: built-in views, up to two saved views, the "See more" dropdown and, on the
// right, "Create a view" and the settings button.
//   items: [[id, label, Icon]]  built-in views             qv: id of the active view
//   views: [{id, name}]         saved views                applyQv(id)   removeView(id)
//   onCreateView()  onSettings()  showCreateButton (true while "All ads" is active)  tip(text) -> {'data-tip': text}
//   onEditView(id)  OPTIONAL: the pencil of a view in the dropdown. Without it the pencil just applies the view.
//
// The "See more" dropdown is a small multi-page panel: root ("Quick views"), "Suggested views", "My views", "Shared views".

// glyphs of the built-in views (by id); a view with another id falls back to the icon it was given
const GLYPH = { actions: () => <ActionsIcon />, active: () => <PlaneIcon row />, delivery: () => <MailIcon /> };
const PANEL_GLYPH = { actions: () => <ActionsIcon panel />, active: () => <PlaneIcon />, delivery: () => <MailIcon /> };
// the suggested views, in the order of the real page; only those that exist in `items` are listed. Actions has no pencil.
const SUGGESTED = [['actions', 'Actions', false], ['active', 'Active ads', true], ['delivery', 'Had delivery', true]];

// ----- the white card under a hovered / focused quick view: what the view filters, groups, ... -----
const TIP_W = 320, TIP_DX = 8.6, TIP_DY = 8.9, TIP_ID = 'fid-qv-tip'; // design px (reference: 359 / 9.6 / 10 screenshot px)
const OPS = { gt: '>', lt: '<', eq: '=', gte: '≥', lte: '≤', contains: 'contains', not: 'does not contain', is: 'is' };
const F_IMPR = 'Impressions (Campaign) > 0';
const F_ACTIVE = <>Campaign delivery is<i className="fid-qv-dot" />Active</>;
const F_RECO = <>Campaign actions one of <span className="fid-qv-reco"><RecoIcon />Recommendations</span></>;
const BASE_FILTERS = { actions: [F_RECO], active: [F_IMPR, F_ACTIVE], delivery: [F_IMPR] };
const filterText = (f) => {
  const def = FILTER_FIELDS.find((x) => x.id === f.field);
  if (f.field === 'delivery' && f.op === 'is' && f.value === 'Active') return <>Delivery is<i className="fid-qv-dot" />Active</>;
  return `${def ? def.label : f.field} ${OPS[f.op] || f.op} ${f.value}`;
};
// -> [[label, value]] of a view's card, or null when the view has none ("All ads" shows everything)
function describeView(id, view) {
  if (id === 'all') return null;
  const lines = (fs, rest) => [['Filters', fs.length ? fs.map((f, i) => <React.Fragment key={i}>{i ? ' ' : ''}{f}{i < fs.length - 1 ? ',' : ''}</React.Fragment>) : 'None'], ...rest];
  if (id === 'actions') return lines(BASE_FILTERS.actions, [['Columns', 'Performance'], ['Breakdowns', 'None'], ['Grouping', 'None'], ['Attribution settings', 'None']]);
  if (BASE_FILTERS[id]) return lines(BASE_FILTERS[id], [['Grouping', 'None']]);
  if (!view) return null;
  const fs = [...(BASE_FILTERS[view.base] || []), ...(view.filters || []).filter((f) => f && f.value !== '').map(filterText)];
  if (view.search) fs.push(`Name contains ${view.search}`);
  return lines(fs, [['Grouping', 'None']]);
}

export default function QuickViewsBar({ items, qv, views, applyQv, removeView, onCreateView, onSettings, onEditView, showCreateButton, tip }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState('root'); // root | suggested | my | shared
  const [dir, setDir] = useState('');       // slide direction of the last page change ('' = no animation yet)
  const pageRef = useRef(null);
  const [card, setCard] = useState(null);   // the description card: { id, left, top } in design px
  const cardTimer = useRef(0);
  const hideCard = () => { clearTimeout(cardTimer.current); setCard(null); };
  const showCard = (id, el, delay) => {
    clearTimeout(cardTimer.current);
    if (!describeView(id, views.find((v) => v.id === id))) return;
    cardTimer.current = setTimeout(() => {
      if (!el.isConnected) return;
      // design px: rectCss() of the button for the window width, #root (wide, so its ratio is exact) for the scale factor
      const root = document.getElementById('root'), b = el.getBoundingClientRect(), c = rectCss(el);
      const k = root && root.offsetWidth ? root.getBoundingClientRect().width / root.offsetWidth : b.left / (c.left || 1) || 1;
      setCard({ id, left: Math.max(8, Math.min(b.left / k - TIP_DX, c.vw - TIP_W - 8)), top: b.bottom / k + TIP_DY });
    }, delay);
  };
  useEffect(() => () => clearTimeout(cardTimer.current), []);
  useEffect(() => {
    if (!card) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') hideCard(); };
    window.addEventListener('keydown', onKey, true); window.addEventListener('resize', hideCard); window.addEventListener('blur', hideCard);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', hideCard); window.removeEventListener('blur', hideCard); };
  }, [card]);
  useEffect(() => { if (open) hideCard(); }, [open]);
  // hover / keyboard-focus handlers of a view button (the card never takes the pointer, so clicks still reach the button)
  const cardProps = (id) => ({
    onPointerEnter: (e) => { if (e.pointerType !== 'touch') showCard(id, e.currentTarget, 150); },
    onPointerLeave: hideCard,
    onFocus: (e) => { if (e.currentTarget.matches(':focus-visible')) showCard(id, e.currentTarget, 0); },
    onBlur: hideCard,
    'aria-describedby': card && card.id === id ? TIP_ID : undefined,
  });
  const cardLines = card ? describeView(card.id, views.find((v) => v.id === card.id)) : null;
  useEffect(() => { if (!open) { setPage('root'); setDir(''); } }, [open]);
  useEffect(() => { if (open && dir) pageRef.current?.focus({ preventScroll: true }); }, [page]); // keep keyboard focus inside the panel after a page change
  const go = (p, d) => { setDir(d); setPage(p); };
  const label = (id, fallback) => (items.find((it) => it[0] === id) || [])[1] || fallback;
  const rowIcon = (id, Ic, selected) => {
    if (id === 'all') return selected ? <FolderFill /> : <FolderLine />;
    if (GLYPH[id]) return GLYPH[id]();
    return Ic ? <span className="fid-qv-fb"><Ic size={18} /></span> : <FolderLine />;
  };
  const edit = (id, close) => { close(); if (onEditView) onEditView(id); else applyQv(id); };

  const create = (close) => (
    <button type="button" className="fid-qv-create" onClick={() => { close(); onCreateView(); }}><PlusThin />Create view</button>
  );
  const viewRow = (id, icon, text, pencil, close) => (
    <div key={id} className="fid-qv-row" onClick={() => { applyQv(id); close(); }}>
      <button type="button" className="fid-qv-rb"><span className="fid-qv-ri">{icon}</span><span className="fid-qv-rt">{text}</span></button>
      {pencil && <button type="button" className="fid-qv-pen" aria-label={`Edit ${text}`} onClick={(e) => { e.stopPropagation(); edit(id, close); }}><PencilIcon /></button>}
    </div>
  );
  const navRow = (text, to) => (
    <button key={to} type="button" className="fid-qv-nav" onClick={() => go(to, 'fwd')}><span className="fid-qv-rt">{text}</span><ChevronRight /></button>
  );
  const head = (title) => (
    <div className="fid-qv-head">
      <button type="button" className="fid-qv-back" aria-label="Back" onClick={() => go('root', 'back')}><BackArrow /></button>
      <span className="fid-qv-ht">{title}</span>
    </div>
  );

  const shown = views.slice(0, 2);
  const extra = views.slice(2);
  const suggested = SUGGESTED.filter(([id]) => items.some((it) => it[0] === id));
  const hiddenOn = extra.some((v) => v.id === qv); // the active view lives only in the dropdown: mark the button that opens it

  return (
    <div className="qv fid-qv">
      {items.map(([id, text, Ic]) => (
        <button key={id} className={`qvb fid-qv-v ${qv === id ? 'on' : ''} ${card && card.id === id ? 'tipped' : ''}`} {...cardProps(id)} onClick={() => { hideCard(); applyQv(id); }}>
          <span className="fid-qv-i">{rowIcon(id, Ic, qv === id)}</span><span className="fid-qv-l">{text}</span>
        </button>
      ))}
      {shown.map((v) => (
        <button key={v.id} className={`qvb fid-qv-v fid-qv-sv ${qv === v.id ? 'on' : ''} ${card && card.id === v.id ? 'tipped' : ''}`} {...cardProps(v.id)} onClick={() => { hideCard(); applyQv(v.id); }}>
          <span className="fid-qv-i"><FolderLine /></span><span className="fid-qv-l">{v.name}</span>
          <span className="qvx" title="Delete view" onClick={(e) => { e.stopPropagation(); hideCard(); removeView(v.id); }}><X size={13} /></span>
        </button>
      ))}
      <Menu open={open} setOpen={setOpen} right className="fid-qv-pop"
        button={<button type="button" className={`qvb bare fid-qv-more ${open ? "open" : ""} ${hiddenOn ? "fid-qv-sel" : ""}`} aria-haspopup="true" aria-expanded={open}><span className="fid-qv-pl"><PlusBold /></span><span className="fid-qv-l">See more</span></button>}>
        {(close) => (
          <div className="fid-qv-panel">
            <div key={page} ref={pageRef} tabIndex={-1} className={`fid-qv-page ${dir}`}>
              {page === 'root' && <>
                <div className="fid-qv-title">Quick views</div>
                <div className={`fid-qv-list ${extra.length ? '' : 'fid-qv-list-0'}`}>
                  {extra.map((v) => viewRow(v.id, <FolderLine />, v.name, true, close))}
                </div>
                <div className="fid-qv-hr" />
                <div className="fid-qv-navs">
                  {navRow('Suggested views', 'suggested')}
                  {navRow('My views', 'my')}
                  {navRow('Shared views', 'shared')}
                </div>
                {create(close)}
              </>}
              {page === 'suggested' && <>
                {head('Suggested views')}
                <div className="fid-qv-list">
                  {suggested.map(([id, fb, pencil]) => viewRow(id, PANEL_GLYPH[id](), label(id, fb), pencil, close))}
                </div>
                <div className="fid-qv-hr sub" />
                {create(close)}
              </>}
              {page === 'my' && <>
                {head('My views')}
                {views.length
                  ? <><div className="fid-qv-list">{views.map((v) => viewRow(v.id, <FolderLine />, v.name, true, close))}</div><div className="fid-qv-hr sub" /></>
                  : <div className="fid-qv-none">There are no additional views available.</div>}
                {create(close)}
              </>}
              {page === 'shared' && <>
                {head('Shared views')}
                <div className="fid-qv-none">There are no shared views available.</div>
                {create(close)}
              </>}
            </div>
          </div>
        )}
      </Menu>
      <span className="grow" />
      {showCreateButton && <button className="qvb fid-qv-cv" onClick={onCreateView}><span className="fid-qv-l">Create a view</span></button>}
      <button className="qvb sq" aria-label="Settings" {...tip('Settings')} onClick={onSettings}><SlidersIcon /></button>
      {card && cardLines && createPortal(
        <div className="fid-qv-tip" id={TIP_ID} role="tooltip" style={{ left: card.left, top: card.top }}>
          {cardLines.map(([k, v]) => <div key={k} className="fid-qv-tl"><b>{k}:</b> {v}</div>)}
        </div>,
        document.getElementById('root') || document.body,
      )}
    </div>
  );
}
