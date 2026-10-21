import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Menu } from './ui.jsx';
import { ColumnsMenu, BreakdownMenu, ReportsMenu, ExportMenu } from './ToolbarMenus.jsx';
import { PRESETS } from './lib.js';
import { I, MenuIcons } from './fid-toolbar-icons.jsx';
import './fid-tip.css';
import './fid-tip.js';
import './fid-toolbar.css';
import './fid-toolbar2.css';

// The toolbar above the table (Create, Duplicate, Edit, Analyse, A/B test, More ... Columns, Breakdown, Reports, Export, Charts).
// `t` carries everything it needs from the app:
//   level, viewer (true would grey out Duplicate/Edit/A-B/Reports/Export/Charts; the app now passes false on both entrances), noDelete, uniqueSelected (selected rows),
//   one (the single selected row or null), preset, cols, tw (table width in design px), breakdown, pane ('view' | 'charts' | null),
//   menus + open(key)(bool): open/close state of every dropdown, tip(text) -> {'data-tip': text}, comingSoon(what)(), toast(msg),
//   customOpen/setCustomOpen, clipboardCount (rows in the Duplicate menu's clipboard: Paste / See copied items are disabled at 0),
//   actions: { create, duplicate (opens the Duplicate dialog), quickDuplicate, copy, paste, seeCopied, preview, edit, analyse, abTest,
//              exportCSV, exportXLSX (optional: without it "Export as .xlsx" does nothing), downloadTemplate, addData, history, remove, setBreakdown, togglePane, openCharts, viewCreativePerformance,
//              createReport, setPresetCols, toggleCol, clearSelection, turn(on) (Edit > General > Turn on / Turn off for the selected rows) }
//   optional: analyseActive (true while the Meta AI panel is open: the Analyse button shows its pressed look)
//
// Keyboard shortcuts (one window listener, see onShortcut): Ctrl+Shift+D Duplicate dialog, Ctrl+D quick duplicate, Ctrl+C copy, Ctrl+V paste.
//
// With rows selected the toolbar changes like in Ads Manager: Create | Duplicate v | Edit v | trash | A/B test | Preview | More.
// When the table area gets narrower the labels drop out, widest first (see HIDE_ORDER): Columns / Breakdown, then Analyse, ...;
// as a last resort the carets of the icon buttons (Columns / Breakdown / Reports) and of the split buttons (Duplicate / Edit / Export) go too.

// widths of the buttons in design px (measured from the reference screenshots) - used to decide which labels still fit
const GAP = 9, SPACER = 16, PAD = 18, CHARTS_PANE_TW = 1090;
const W = { create: 105.8, dupS: 170.7, editS: 130.7, dup: 127.1, edit: 87.1, ico: 44.4, an: 114.7, ab: 118.7, pv: 116.4, more: 97.8, cols: 143.1, bd: 161.8, iconCaret: 71.1, exp: 88.9, charts: 44.4 };
// keys: cb Columns/Breakdown labels, an Analyse label, ab A/B test label, pv Preview label, de Duplicate/Edit labels, cr Create label,
//       mr More label, cc carets of Columns/Breakdown/Reports, sc carets of the split buttons (Duplicate, Edit, Export)
const ORDER = { idle: ['cb', 'an', 'ab', 'de', 'cr', 'mr', 'cc', 'sc'], sel: ['cb', 'pv', 'ab', 'de', 'cr', 'mr', 'cc', 'sc'] };
const HIDE_ORDER = {};
for (const k of Object.keys(ORDER)) HIDE_ORDER[k] = ORDER[k].reduce((acc, key) => [...acc, [...acc[acc.length - 1], key]], [[]]);
function needed(sel, hide) {
  const h = (k) => hide.includes(k);
  const split = h('de') ? (h('sc') ? W.ico : W.ico * 2) : null; // Duplicate / Edit with their carets
  const left = sel
    ? [h('cr') ? W.ico : W.create, split || W.dupS, split || W.editS, W.ico, 1, h('ab') ? W.ico : W.ab, h('pv') ? W.ico : W.pv, h('mr') ? W.ico : W.more]
    : [h('cr') ? W.ico : W.create, h('de') ? W.ico : W.dup, h('de') ? W.ico : W.edit, 1, h('an') ? W.ico : W.an, h('ab') ? W.ico : W.ab, h('mr') ? W.ico : W.more];
  const ic = h('cc') ? W.ico : W.iconCaret;
  const right = [h('cb') ? ic : W.cols, h('cb') ? ic : W.bd, ic, h('sc') ? W.ico : W.exp, W.charts];
  const sum = (a) => a.reduce((s, x) => s + x, 0) + GAP * (a.length - 1);
  return PAD + sum(left) + sum(right) + GAP + SPACER; // + the wider gap in front of Reports
}
export function toolbarHidden(sel, tw) {
  const plans = HIDE_ORDER[sel ? 'sel' : 'idle'];
  if (!(tw > 0)) return plans[0];
  return plans.find((p) => needed(sel, p) <= tw) || plans[plans.length - 1];
}

const Caret = () => <svg className="caret" width="12.3" height="7.2" viewBox="0 0 10 6" aria-hidden="true"><path d="M0 0h10L5 6z" fill="currentColor" /></svg>;

// one toolbar button: icon, optional label, optional caret
function B({ cls = '', icon, label, caret, on, children, ...rest }) {
  return (
    <button type="button" className={`tb fb ${cls}${on ? ' on' : ''}`} {...rest}>
      {icon}{label ? <span className="fb-l">{label}</span> : null}{children}{caret ? <Caret /> : null}
    </button>
  );
}

// ---------- keyboard shortcuts ----------
const typingIn = (el) => !!el && el.nodeType === 1 && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const hasTextSelection = () => { try { const s = window.getSelection && window.getSelection(); return !!s && !s.isCollapsed && s.toString().length > 0; } catch { return false; } };
// Ctrl+Shift+D -> duplicate dialog, Ctrl+D -> quick duplicate, Ctrl+C -> copy, Ctrl+V -> paste (Cmd works the same on a Mac).
// Does nothing for viewers, while typing in a field, while a dialog is open, with no rows selected (paste: with an empty clipboard),
// and Ctrl+C leaves a text selection alone. preventDefault is only called when the shortcut was handled (Ctrl+D would bookmark the page).
function onShortcut(e, t) {
  if (!t || e.defaultPrevented || e.altKey || e.isComposing) return;
  if (e.ctrlKey === e.metaKey) return;                       // exactly one of Ctrl / Cmd
  const m = /^[a-z]$/i.test(e.key || '') ? e.key.toLowerCase() : (/^Key([A-Z])$/.exec(e.code || '') || [])[1]?.toLowerCase(); // letter even on other keyboard layouts
  if (m !== 'd' && m !== 'c' && m !== 'v') return;
  if (e.shiftKey && m !== 'd') return;                       // Ctrl+Shift+C / V belong to the browser
  const A = t.actions || {};
  if (t.viewer) return;
  if (typingIn(e.target) || typingIn(document.activeElement)) return;
  if (document.querySelector('.overlay, .modal, [aria-modal="true"]')) return;
  const sel = (t.uniqueSelected || []).length > 0;
  let run = null;
  if (m === 'd') { if (sel) run = e.shiftKey ? A.duplicate : A.quickDuplicate; }
  else if (m === 'c') { if (sel && !hasTextSelection()) run = A.copy; }
  else if (t.clipboardCount > 0) run = A.paste;
  if (typeof run !== 'function') return;
  e.preventDefault();
  if (!e.repeat) run();                                      // a held key must not repeat the action
}

// ---------- the Duplicate caret dropdown (ref 34) ----------
const Key = ({ children }) => <span className="tbm-key">{children}</span>;
function DuplicateMenu({ close, viewer, sel, clipboardCount, comingSoon, A }) {
  const items = [
    ['Quick duplicate', 'Ctrl + D', viewer || !sel, A.quickDuplicate],
    ['By Images', null, viewer || !sel, comingSoon('Duplicate by images')],
    ['Copy', 'Ctrl + C', viewer || !sel, A.copy],
    ['Paste', 'Ctrl + V', viewer || !(clipboardCount > 0), A.paste],
    ['See copied items', null, viewer || !(clipboardCount > 0), A.seeCopied],
  ];
  const row = (it) => (
    <button key={it[0]} type="button" role="menuitem" className="tbm-item" disabled={it[2]} aria-keyshortcuts={it[1] ? it[1].replace(/ /g, '').replace('Ctrl', 'Control') : undefined} onClick={() => { close(); if (it[3]) it[3](); }}>
      <span className="tbm-lbl">{it[0]}</span>{it[1] ? <Key>{it[1]}</Key> : null}
    </button>
  );
  return (
    <div className="fid-tbm fid-tbm-dup" role="menu" aria-label="Duplicate options">
      <div className="tbm-title">Duplicate</div>
      {row(items[0])}{row(items[1])}
      <div className="tbm-line" role="separator" />
      <div className="tbm-title">Clipboard</div>
      {row(items[2])}{row(items[3])}{row(items[4])}
    </div>
  );
}

// design px per screen px: the whole app is scaled with CSS zoom on #root (see fid-tip.js)
const zoomOf = () => { const r = typeof document !== 'undefined' && document.getElementById('root'); const z = r && parseFloat(r.style.zoom); return z > 0 ? z : 1; };

// ---------- the Edit caret dropdown: General / Identity / Creative / Tracking, each opening a list to its right ----------
// Rows of a list are [label, action or null (= greyed out like in the real menu)].
function EditMenu({ close, one, uniqueSelected, comingSoon, toast, A }) {
  const [openKey, setOpenKey] = useState(null);
  const [pos, setPos] = useState(null); // { left, top } of the open list in design px
  const fly = useRef(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  // keep the list inside the window: a long one (Creative) is pushed up until it fits
  useLayoutEffect(() => {
    if (!pos || !fly.current) return;
    const z = zoomOf(), h = fly.current.getBoundingClientRect().height / z, vh = window.innerHeight / z;
    const top = Math.max(8, Math.min(pos.top, vh - h - 8));
    if (Math.abs(top - pos.top) > 0.5) setPos({ ...pos, top });
  }, [pos, openKey]);
  const show = (key, el, now) => {
    clearTimeout(timer.current);
    const go = () => {
      const z = zoomOf(), r = el.getBoundingClientRect(), panel = el.closest('.fid-tbm-edit');
      setOpenKey(key); setPos({ left: (panel ? panel.getBoundingClientRect().right : r.right) / z, top: r.top / z - 1 });
    };
    if (now || !openKey) go(); else timer.current = setTimeout(go, 110); // a short pause, so crossing another row on the way to the list does not switch it
  };
  const edit = one ? A.edit : () => toast('Select one item to edit it');
  const allOn = uniqueSelected.every((r) => r.status === 'on'), allOff = uniqueSelected.every((r) => r.status !== 'on');
  const LISTS = [
    ['General', [['End date', comingSoon('End date')], ['Find and replace', comingSoon('Find and replace')], ['Name', edit], ['Start date', comingSoon('Start date')],
      ['Turn off', allOff ? null : () => A.turn(false)], ['Turn on', allOn ? null : () => A.turn(true)]]],
    ['Identity', [['Page', edit]]],
    ['Creative', [['Advantage+ creative', comingSoon('Advantage+ creative')], ['App store details', comingSoon('App store details')], ['Call to action', edit], ['Creative setup', edit],
      ['Description', null], ['Display link', edit], ['Headline', null], ['Multi-advertiser ads', comingSoon('Multi-advertiser ads')], ['Primary text', null], ['Product browsing', null],
      ['Related media', null], ['Shop', comingSoon('Shop')], ['Website URL', edit]]],
    ['Tracking', [['URL parameters', comingSoon('URL parameters')]]],
  ];
  return (
    <div className="fid-tbm fid-tbm-edit" role="menu" aria-label="Edit options">
      {LISTS.map(([key, rows]) => (
        <div className="tbm-sub" key={key} onMouseEnter={(e) => show(key, e.currentTarget)}>
          <button type="button" role="menuitem" className={`tbm-item${openKey === key ? ' open' : ''}`} aria-haspopup="menu" aria-expanded={openKey === key}
            onClick={(e) => show(key, e.currentTarget.parentElement, true)}
            onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); show(key, e.currentTarget.parentElement, true); } else if (e.key === 'ArrowLeft') setOpenKey(null); }}>
            <span className="tbm-lbl">{key}</span><span className="tbm-end"><MenuIcons.ChevronRight /></span>
          </button>
          {openKey === key && pos && (
            <div className="tbm-fly fid-tbm-edit-fly" role="menu" aria-label={key} ref={fly} style={{ left: pos.left, top: pos.top }} onMouseEnter={() => clearTimeout(timer.current)}>
              {rows.map(([label, fn]) => (
                <button key={label} type="button" role="menuitem" className="tbm-item" disabled={!fn} onClick={() => { close(); fn(); }}><span className="tbm-lbl">{label}</span></button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// "Export >" row of the More dropdown: hovering / clicking it opens the export choices to the right of the panel.
// The flyout is fixed-positioned (the panel scrolls when it does not fit the window, which would clip an absolute child).
const EXP_W = 278.4, EXP_H = 291.2; // size of the export card in design px, see .fid-menus-exp
function ExportRow({ disabled, close, exportCSV, exportXLSX, comingSoon, toast }) {
  const [pos, setPos] = useState(null); // { left, top } in design px while the flyout is open
  const ref = useRef(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = () => {
    clearTimeout(timer.current);
    if (disabled || !ref.current) return;
    const z = zoomOf(), r = ref.current.getBoundingClientRect(), panel = ref.current.closest('.fid-tbm-more');
    // the export card must stay inside the window
    setPos({ left: Math.max(8, Math.min((panel ? panel.getBoundingClientRect().right : r.right) / z - 5, window.innerWidth / z - EXP_W - 8)), top: Math.max(8, Math.min(r.top / z - 4, window.innerHeight / z - EXP_H - 8)) });
  };
  const hide = () => { clearTimeout(timer.current); setPos(null); };
  const hideSoon = () => { clearTimeout(timer.current); timer.current = setTimeout(hide, 220); }; // crossing the panel's scrollbar must not close it
  useEffect(() => {
    if (!pos) return undefined;
    const sc = ref.current && ref.current.closest('.fid-tbm-more');
    window.addEventListener('resize', hide);
    if (sc) sc.addEventListener('scroll', hide);
    return () => { window.removeEventListener('resize', hide); if (sc) sc.removeEventListener('scroll', hide); };
  }, [pos]);
  return (
    <div className="tbm-sub" ref={ref} onMouseEnter={show} onMouseLeave={hideSoon}>
      <button type="button" role="menuitem" className={`tbm-item${pos ? ' open' : ''}`} aria-haspopup="menu" aria-expanded={!!pos} disabled={disabled}
        onClick={show} onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); show(); } else if (e.key === 'ArrowLeft') hide(); }}>
        <span className="tbm-lbl">Export</span><span className="tbm-end"><MenuIcons.ChevronRight /></span>
      </button>
      {pos && !disabled && <div className="tbm-fly" style={{ left: pos.left, top: pos.top }}><ExportMenu close={close} exportCSV={exportCSV} exportXLSX={exportXLSX} comingSoon={comingSoon} toast={toast} /></div>}
    </div>
  );
}

// ---------- the More dropdown (ref 39) + the clone's own "Selected items" block ----------
function MoreMenu({ close, viewer, level, one, noDelete, uniqueSelected, comingSoon, toast, A }) {
  // the panel is taller than the space under the toolbar on a normal window: it scrolls instead of running off the page
  const box = useRef(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = box.current;
      if (!el) return;
      el.style.maxHeight = '';
      const room = window.innerHeight / zoomOf() - el.getBoundingClientRect().top / zoomOf() - 12;
      if (room > 0 && el.scrollHeight > room) el.style.maxHeight = `${Math.max(room, 160)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const item = (label, onClick, { disabled, end } = {}) => (
    <button type="button" role="menuitem" className="tbm-item" disabled={disabled} onClick={() => { close(); onClick(); }}>
      <span className="tbm-lbl">{label}</span>{end ? <span className="tbm-end">{end}</span> : null}
    </button>
  );
  const title = (text) => <div className="tbm-title">{text}</div>;
  const line = () => <div className="tbm-line" role="separator" />;
  return (
    <div className="fid-tbm fid-tbm-more" role="menu" aria-label="More" ref={box}>
      {item('Analyse', A.analyse)}
      {line()}
      {title('Automated rules')}
      {item('Create a new rule', comingSoon('Automated rules'))}
      {item('Apply an existing rule', comingSoon('Automated rules'))}
      {item('View active rules', comingSoon('Automated rules'))}
      {item('Manage rules', comingSoon('Automated rules'), { end: <MenuIcons.External /> })}
      {line()}
      {title('Save audience')}
      {item('Save audience', comingSoon('Save audience'))}
      {line()}
      {title('Import and export ad configuration')}
      {item('Import ads in bulk', comingSoon('Bulk import'))}
      <ExportRow disabled={viewer} close={close} exportCSV={A.exportCSV} exportXLSX={A.exportXLSX} comingSoon={comingSoon} toast={toast} />
      {item('Download Excel template', A.downloadTemplate)}
      {line()}
      {title('Selected items')}
      {item('Add / edit data', A.addData, { disabled: viewer || level !== 'ad' || !one })}
      {item('View history', A.history)}
      {item('Delete', A.remove, { disabled: noDelete || !uniqueSelected.length })}
    </div>
  );
}

export default function Toolbar({ t }) {
  const { viewer, noDelete, uniqueSelected, one, level, preset, cols, tw, breakdown, pane, menus, open, tip, comingSoon, toast, customOpen, setCustomOpen, analyseActive, clipboardCount = 0, actions: A } = t;
  const sel = uniqueSelected.length > 0;
  // one window listener that always reads the latest props
  const latest = useRef(t);
  latest.current = t;
  useEffect(() => {
    const k = (e) => onShortcut(e, latest.current);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  // with the compare pane open the real tool leaves ~1090 design px (ref 28), so never lay the toolbar out wider than that
  const hide = toolbarHidden(sel, pane === 'charts' && tw > 0 ? Math.min(tw, CHARTS_PANE_TW) : tw);
  const h = (k) => hide.includes(k);
  const chartsOn = pane === 'charts';
  const preview = () => { if (A.preview) A.preview(); else comingSoon('Preview')(); }; // opens the Ad preview dialog (App.jsx)
  const tipIf = (cond, text) => (cond ? tip(text) : {});

  const moreMenu = (
    <Menu open={!!menus.more} setOpen={open('more')} button={<B cls={`more ${h('mr') ? 'ico' : ''}`} on={!!menus.more} label={h('mr') ? null : 'More'} aria-label="More" caret />}>
      {(close) => <MoreMenu close={close} viewer={viewer} level={level} one={one} noDelete={noDelete} uniqueSelected={uniqueSelected} comingSoon={comingSoon} toast={toast} A={A} />}
    </Menu>
  );

  return (
    <div className={`toolbar fid-toolbar ${sel ? 'is-sel' : ''}`}>
      <B cls={`green create ${h('cr') ? 'ico' : ''}`} onClick={A.create} icon={<I.Plus />} label={h('cr') ? null : 'Create'} aria-label="Create" />

      {sel ? (
        <>
          <span className={`fid-split${h('sc') ? ' nocaret' : ''}`} {...tipIf(!viewer, 'Duplicate (Ctrl+Shift+D)')}>
            <B cls={`dupm ${h('de') ? 'ico' : ''}`} icon={<I.Duplicate />} label={h('de') ? null : 'Duplicate'} aria-label="Duplicate" aria-keyshortcuts="Control+Shift+D" disabled={viewer || !sel} onClick={A.duplicate} />
            {!h('sc') && <Menu open={!!menus.dupc} setOpen={open('dupc')} right button={<B cls="splitc" aria-label="More duplicate options" disabled={viewer || !sel} caret on={!!menus.dupc} />}>
              {(close) => <DuplicateMenu close={close} viewer={viewer} sel={sel} clipboardCount={clipboardCount} comingSoon={comingSoon} A={A} />}
            </Menu>}
          </span>
          <span className={`fid-split${h('sc') ? ' nocaret' : ''}`}>
            <B cls={`editm ${h('de') ? 'ico' : ''}`} icon={<I.Edit />} label={h('de') ? null : 'Edit'} aria-label="Edit" disabled={viewer || !sel} onClick={one ? A.edit : () => toast('Select one item to edit it')} />
            {!h('sc') && <Menu open={!!menus.edc} setOpen={open('edc')} button={<B cls="splitc" aria-label="More edit options" disabled={viewer || !sel} caret on={!!menus.edc} />}>
              {(close) => <EditMenu close={close} one={one} uniqueSelected={uniqueSelected} comingSoon={comingSoon} toast={toast} A={A} />}
            </Menu>}
          </span>
          <B cls="ico trash" icon={<I.Trash />} aria-label="Delete" disabled={noDelete || !sel} onClick={A.remove} {...tip('Delete')} />
          <span className="fid-sep" />
          <B cls={`ab ${h('ab') ? 'ico' : ''}`} icon={<I.Flask />} label={h('ab') ? null : 'A/B test'} aria-label="A/B test" disabled={viewer} onClick={A.abTest} {...tipIf(h('ab') && !viewer, 'A/B test')} />
          <B cls={`pv ${h('pv') ? 'ico' : ''}`} icon={<I.Preview />} label={h('pv') ? null : 'Preview'} aria-label="Preview" onClick={preview} {...tip('Preview creative')} />
        </>
      ) : (
        <>
          <B cls={`dup ${h('de') ? 'ico' : ''}`} icon={<I.Duplicate />} label={h('de') ? null : 'Duplicate'} aria-label="Duplicate" disabled onClick={A.duplicate} />
          <B cls={`edit ${h('de') ? 'ico' : ''}`} icon={<I.Edit />} label={h('de') ? null : 'Edit'} aria-label="Edit" disabled onClick={A.edit} />
          <span className="fid-sep" />
          <B cls={`an ${h('an') ? 'ico' : ''}`} on={!!analyseActive} icon={<I.Analyse />} label={h('an') ? null : 'Analyse'} aria-label="Analyse" onClick={A.analyse} {...tip('Analyse ads')} />
          <B cls={`ab ${h('ab') ? 'ico' : ''}`} icon={<I.Flask />} label={h('ab') ? null : 'A/B test'} aria-label="A/B test" disabled={viewer} onClick={A.abTest} {...tipIf(h('ab') && !viewer, 'A/B test')} />
        </>
      )}
      {moreMenu}

      <span className="grow" />

      <Menu open={!!menus.cols} setOpen={open('cols')} right className="colpop" button={<B cls={`cols ${h('cc') ? 'ico' : h('cb') ? 'ic' : ''}`} on={!!menus.cols} icon={<I.Columns />} label={h('cb') ? null : 'Columns'} caret={!h('cc')} aria-label="Columns" {...tip('Change table columns and metrics')} />}>
        {(close) => <ColumnsMenu preset={preset} presets={Object.keys(PRESETS)} cols={cols} setPresetCols={A.setPresetCols} toggleCol={A.toggleCol} customOpen={customOpen} setCustomOpen={setCustomOpen} close={close} comingSoon={comingSoon} />}
      </Menu>
      <Menu open={!!menus.bd} setOpen={open('bd')} right button={<B cls={`bd ${h('cc') ? 'ico' : h('cb') ? 'ic' : ''}`} on={!!menus.bd} icon={<I.Breakdown />} label={h('cb') ? null : 'Breakdown'} caret={!h('cc')} aria-label="Breakdown" {...tip('View rows by specific metrics')}>{breakdown !== 'none' && <span className="badge">1</span>}</B>}>
        {(close) => <BreakdownMenu breakdown={breakdown} setBreakdown={A.setBreakdown} viewer={viewer} openCharts={A.openCharts} close={close} toast={toast} />}
      </Menu>
      <Menu open={!!menus.rep} setOpen={open('rep')} right button={<B cls={`rep wider ${h('cc') ? 'ico' : 'ic'}`} on={!!menus.rep} icon={<I.Reports />} caret={!h('cc')} disabled={viewer} aria-label="Reports" {...tipIf(!viewer, 'Reports')} />}>
        {(close) => <ReportsMenu close={close} createReport={A.createReport} viewCreativePerformance={A.viewCreativePerformance} comingSoon={comingSoon} />}
      </Menu>
      <span className={`fid-split exp${h('sc') ? ' nocaret' : ''}`}>
        <B cls="ico expm" icon={<I.Export />} aria-label="Export" disabled={viewer} onClick={A.exportCSV} {...tipIf(!viewer, 'Export')} />
        {!h('sc') && <Menu open={!!menus.exp} setOpen={open('exp')} right button={<B cls="ico expc" aria-label="More export options" disabled={viewer} caret on={!!menus.exp} />}>
          {(close) => <ExportMenu close={close} exportCSV={A.exportCSV} exportXLSX={A.exportXLSX} comingSoon={comingSoon} toast={toast} />}
        </Menu>}
      </span>
      <B cls={`ico charts${chartsOn ? ' pressed' : ''}`} icon={<I.Charts on={chartsOn} />} disabled={viewer} aria-label="Charts" aria-pressed={chartsOn} onClick={A.togglePane}
        {...tipIf(!viewer, sel ? 'View charts' : 'Select one or more ads to see charts')} />
    </div>
  );
}
