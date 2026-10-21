import React from 'react';
import { Megaphone, EyeOff } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Checkbox, Toggle, Thumb, Popover, Modal, Field } from './ui.jsx';
import { HeadTip, HeadMenu, rectCss } from './HeadMenus.jsx';
import BudgetPopup from './BudgetPopup.jsx';
import { Caret } from './icons.jsx';
import { IcCharts, IcEdit, IcDup, IcCompare, IcDots, IcPen, IcZoom, IcInfo, IcEye } from './fid-rows-icons.jsx';
import { RealSortBoth, RealSortDown } from './real-icons.jsx';
import './fid-rows.css';
import { COLUMNS, COL_TIPS, colById, pctChange, GOOD_DIRECTION, canEditCell, editInit, cellEmpty, columnTotal, digitsOnly, WHOLE_NUMBER_COLS, DELIVERY_STATES } from './lib.js';

const HEAD = { campaign: 'Campaign', adset: 'Ad set', ad: 'Ad' };

// "no value": the long thin dash of the real table, drawn as a line so its length, weight and shade do not depend on the typeface
const Dash = () => <span className="nodash">—</span>;
const shown = (c, v) => (v == null ? <Dash /> : c.f(v));

// previous-period value + % change under a metric, like Ads Manager's compare view
function Cmp({ col, cur, prevRow }) {
  if (!prevRow || col.text || col.budget) return null;
  const pv = col.v(prevRow);
  const d = pctChange(cur, pv);
  const good = GOOD_DIRECTION[col.id] ?? 1;
  const cls = d == null || Math.abs(d) < 0.005 || good === 0 ? 'flat' : (d > 0) === (good > 0) ? 'up' : 'down';
  return <span className="cmp">{col.f(pv)}{d != null && <> <span className={cls}>{d > 0 ? '▲' : d < 0 ? '▼' : ''} {Math.abs(d).toFixed(1)}%</span></>}</span>;
}

// The small pills that appear under a row's name on hover: Charts · Edit · Duplicate · compare · …
function RowChips({ r, actions }) {
  const [open, setOpen] = React.useState(false);
  const [up, setUp] = React.useState(false);
  // open upwards when there is not enough room below the row inside the scrolling table
  const toggle = (e) => {
    if (!open) { const b = e.currentTarget.getBoundingClientRect(); const w = e.currentTarget.closest('.tablewrap')?.getBoundingClientRect(); setUp(!!w && w.bottom - b.bottom < 190); }
    setOpen(!open);
  };
  // Duplicate is one of the row actions (disabled for viewers like Edit); the app may also pass actions.duplicate
  const dup = actions.more(r).find((m) => m[0] === 'Duplicate');
  const dupOff = actions.duplicate ? !!actions.lock?.edit : !dup || !!dup[2];
  const doDup = () => (actions.duplicate ? actions.duplicate(r) : dup && dup[1]());
  return (
    <span className="chips">
      <button className="chip2 ch-charts" disabled={!!actions.lock?.charts} onClick={() => actions.charts(r)}><IcCharts />Charts</button>
      <button className="chip2 ch-edit" disabled={!!actions.lock?.edit} onClick={() => actions.edit(r)}><IcEdit />Edit</button>
      <button className="chip2 ch-dup" disabled={dupOff} onClick={doDup}><IcDup />Duplicate</button>
      <button className="chip2 icon cmpb" aria-label="Compare" data-tip="Compare" onClick={() => actions.compare(r)}><IcCompare /></button>
      <Popover open={open} setOpen={setOpen} className={up ? 'up' : ''} button={<button className="chip2 icon dotsb" aria-label="More" onClick={toggle}><IcDots /></button>}>
        {(close) => actions.more(r).map(([label, fn, disabled]) => (
          <button key={label} className="pop-item" disabled={disabled} onClick={() => { close(); fn(); }}>{label}</button>
        ))}
      </Popover>
    </span>
  );
}

export default function Table({ level, rows, totals, cols, sort, setSort, selected, toggleSel, toggleAll, onToggle, onOpen, hasPeriod, loading, compare, prevTotals, actions, emptyKind, hideResults, onHideResults, quick, onQuick, onFilter, colApi, admin, onEditCell, onEditMedia }) {
  const columns = cols.map((id) => colById[id]).filter(Boolean);
  const key = (r) => r.entityId || r.id;
  const count = new Set(rows.map(key)).size; // "Results from N ads" counts distinct ads even when a breakdown splits them into several rows
  const allState = rows.length && rows.every((r) => selected.has(key(r))) ? true : rows.some((r) => selected.has(key(r))) ? 'part' : false;
  const clickSort = (id) => setSort((s) => (s.col === id ? { col: id, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col: id, dir: id === 'name' ? 'asc' : 'desc' }));

  // ----- admin panel: double-click a value to edit it in place -----
  const [ed, setEd] = React.useState(null); // {row, col, v, orig, busy}
  const fileRef = React.useRef(null);
  const mediaRow = React.useRef(null);
  const navTimer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(navTimer.current), []);
  const startEdit = (row, col, init) => { closeFloat(); setEd({ row, col, v: init, orig: init }); };
  const stopEdit = () => setEd((s) => (s && s.busy ? s : null));
  const plainNum = (t) => Number(String(t).replace(/[$₹€£,%\s]/g, ''));
  const sameValue = (cur, val) => String(val).trim() === String(cur.orig).trim()
    || (!['name', 'delivery', 'bid'].includes(cur.col) && String(val).trim() !== '' && plainNum(val) === plainNum(cur.orig)); // 1,000 is 1000.00
  const commit = async (value, viaEnter) => {
    const cur = ed;
    if (!cur || cur.busy) return;
    const val = value === undefined ? cur.v : value;
    if (sameValue(cur, val)) { setEd(null); return; } // nothing changed: leave the data alone
    setEd({ ...cur, v: val, busy: true });
    let ok = false;
    try { ok = !!(await onEditCell(cur.row, cur.col, String(val))); }
    // only close the editor that was just saved (another cell may have been opened meanwhile); a refused value keeps what was typed
    finally { setEd((s) => (s && s.row.id === cur.row.id && s.col === cur.col ? (ok ? null : { ...s, busy: false, n: viaEnter ? (s.n || 0) + 1 : s.n }) : s)); }
  };
  const editKeys = (e) => {
    if (e.nativeEvent && (e.nativeEvent.isComposing || e.keyCode === 229)) return; // Enter that confirms an IME candidate
    if (e.key === 'Enter') { e.preventDefault(); commit(undefined, true); }
    else if (e.key === 'Escape') { e.stopPropagation(); setEd(null); }
  };
  // a value cell only takes digits (and a decimal point for amounts and rates); a name or bid strategy takes any text
  const cellInput = (label, textual, maxLen, whole) => (
    <input key={ed.n || 0} className="cell-in" autoFocus disabled={ed.busy} maxLength={maxLen || (textual ? 200 : 24)} value={ed.v} inputMode={textual ? 'text' : 'decimal'} aria-label={'Edit ' + label}
      onFocus={(e) => e.target.select()} onChange={(e) => setEd({ ...ed, v: textual ? e.target.value : digitsOnly(e.target.value, !whole) })} onKeyDown={editKeys} onBlur={() => commit()} />
  );
  const deliverySelect = () => {
    const opts = DELIVERY_STATES.includes(ed.orig) ? DELIVERY_STATES : [ed.orig, ...DELIVERY_STATES];
    return (
      <select key={ed.n || 0} className="cell-in" autoFocus disabled={ed.busy} value={ed.v} aria-label="Edit delivery"
        ref={(el) => { if (el && !el.dataset.opened) { el.dataset.opened = '1'; try { el.showPicker(); } catch { /* needs a user gesture */ } } }} onChange={(e) => commit(e.target.value)} onBlur={stopEdit}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEd(null); } }}>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  };
  // In the admin panel a campaign / ad set name is both a link and an editable value: wait out the double-click
  const navRow = React.useRef(null);
  const navAt = React.useRef(0);
  const nameClick = (r) => {
    if (level === 'ad') return;
    if (!admin) { onOpen(r); return; }
    clearTimeout(navTimer.current);
    navRow.current = r.id;
    navTimer.current = setTimeout(() => { navRow.current = null; navAt.current = Date.now(); onOpen(r); }, 450);
  };
  const nameDouble = (r) => {
    if (!admin) return;
    clearTimeout(navTimer.current);
    if (Date.now() - navAt.current < 800) return; // the first click already opened the next level: this is a click on another row
    if (navRow.current !== null && navRow.current !== r.id) { navRow.current = null; return; }
    navRow.current = null;
    startEdit(r, 'name', r.name);
  };

  // ----- hover card over a header, and the dropdown behind its caret -----
  const [tipAt, setTipAt] = React.useState(null);
  const [menu, setMenu] = React.useState(null);
  const [sortDlg, setSortDlg] = React.useState(null);
  const [hscr, setHscr] = React.useState(false); // scrolled sideways: the pinned columns cast a shadow
  const [bud, setBud] = React.useState(null); // the Daily budget popup (admin): { row, at }
  const timers = React.useRef({});
  const closeFloat = () => { clearTimeout(timers.current.show); setTipAt(null); setMenu(null); };
  React.useEffect(() => {
    window.addEventListener('resize', closeFloat);
    return () => { window.removeEventListener('resize', closeFloat); clearTimeout(timers.current.show); clearTimeout(timers.current.hide); };
  }, []);
  const hideTip = () => { clearTimeout(timers.current.show); clearTimeout(timers.current.hide); timers.current.hide = setTimeout(() => setTipAt(null), 150); };
  const keepTip = () => clearTimeout(timers.current.hide);
  const tipFor = (id) => (COL_TIPS[id] ? { ...COL_TIPS[id], sub: id === 'budget' && level === 'ad' ? 'Ad set' : undefined } : null);
  const showTip = (e, id) => {
    if (menu) return;
    clearTimeout(timers.current.hide); clearTimeout(timers.current.show);
    const cell = e.currentTarget.closest('th') || e.currentTarget;
    timers.current.show = setTimeout(() => {
      const r = rectCss(cell); const W = 360;
      let left = r.left - W - 3; // Ads Manager opens the card to the left of the column ...
      if (left < 8) left = r.right - 14; // ... or to the right when the first columns leave no room
      setTipAt({ id, left: Math.min(left, r.vw - W - 8), top: r.top + 13, vh: r.vh });
    }, tipAt ? 60 : 250);
  };
  const short = (l) => l.replace(/ \(.*/, '');
  const sortOpts = [['name', HEAD[level]], ['status', 'Off/On'], ...columns.filter((c) => !c.budget).map((c) => [c.id, short(c.label)])];
  const specFor = (id) => {
    const isName = id === 'name';
    const def = colById[id];
    const i = cols.indexOf(id);
    return {
      quick: isName || id === 'delivery' ? quick : null,
      fieldLabel: isName ? HEAD[level] : short(def.label),
      onQuick, onFilter: () => onFilter(id), onMore: () => onFilter(null),
      sort: id !== 'budget', text: isName || !!def.text,
      onSort: (dir) => setSort({ col: id, dir }),
      onCustomSort: () => setSortDlg({ col: sortOpts.some((o) => o[0] === sort.col) ? sort.col : 'name', dir: sort.dir || 'asc' }),
      cols: isName ? null : {
        canLeft: i > 0, canRight: i >= 0 && i < cols.length - 1, canRemove: cols.length > 1,
        move: (d) => colApi.move(id, d), remove: () => colApi.remove(id), customise: colApi.customise,
        addable: COLUMNS.filter((c) => !cols.includes(c.id)).map((c) => [c.id, short(c.label)]), add: (nid) => colApi.add(id, nid),
      },
    };
  };
  const toggleMenu = (e, id) => {
    e.stopPropagation(); clearTimeout(timers.current.show); setTipAt(null);
    if (menu && menu.id === id) { setMenu(null); return; }
    setMenu({ id, at: rectCss(e.currentTarget) });
  };
  const th = (id, label, extra, o = {}) => {
    const sortable = o.sortable !== false;
    const on = sortable && sort.col === id;
    const sortIcon = on ? <RealSortDown className="sorticon" up={sort.dir === 'asc'} /> : <RealSortBoth className="sorticon" />;
    const hasTip = !!COL_TIPS[id];
    const cls = ['hd', on && 'sorted', !sortable && 'nosort', tipAt && tipAt.id === id && 'tipped', menu && menu.id === id && 'menuopen'].filter(Boolean).join(' ');
    return (
      <div className={cls} onClick={sortable ? () => { closeFloat(); clickSort(id); } : undefined}
        onMouseEnter={hasTip ? (e) => showTip(e, id) : undefined} onMouseLeave={hasTip ? hideTip : undefined}>
        <span className="hl"><span className="lbl">{label}{extra && <span className="sub">{extra}</span>}</span>{sortable && sortIcon}</span>
        {o.caret !== false && (
          <button type="button" className="hcaret" aria-label={label + ' options'} aria-haspopup="menu" aria-expanded={!!menu && menu.id === id}
            onMouseEnter={() => { clearTimeout(timers.current.show); setTipAt(null); }} onClick={(e) => toggleMenu(e, id)}><Caret /></button>
        )}
      </div>
    );
  };

  return (
    <div className={'tablewrap fid-rows' + (hscr ? ' hscr' : '')} onScroll={(e) => { closeFloat(); const v = e.currentTarget.scrollLeft > 0; setHscr((s) => (s === v ? s : v)); }}>
      {loading && <div className="loadbar" />}
      {admin && (
        <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
          onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f && mediaRow.current) onEditMedia(mediaRow.current, f); }} />
      )}
      {tipAt && !menu && tipFor(tipAt.id) && <HeadTip tip={tipFor(tipAt.id)} at={tipAt} onEnter={keepTip} onLeave={hideTip} />}
      {menu && <HeadMenu at={menu.at} spec={specFor(menu.id)} onClose={() => setMenu(null)} />}
      {bud && <BudgetPopup row={bud.row} at={bud.at} onClose={() => setBud(null)} onSave={(v) => onEditCell(bud.row, 'budget', String(v))} />}
      {sortDlg && createPortal(
        <Modal title="Customise sorting" onClose={() => setSortDlg(null)}
          footer={<><button className="btn" onClick={() => setSortDlg(null)}>Cancel</button><button className="btn primary" onClick={() => { setSort(sortDlg); setSortDlg(null); }}>Apply</button></>}>
          <Field label="Sort by"><select className="inp" value={sortDlg.col} onChange={(e) => setSortDlg({ ...sortDlg, col: e.target.value })}>{sortOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Order"><select className="inp" value={sortDlg.dir} onChange={(e) => setSortDlg({ ...sortDlg, dir: e.target.value })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></Field>
        </Modal>, document.getElementById('root') || document.body)}
      <table className={`grid lvl-${level}`}>
        <thead>
          <tr>
            <th className="sticky c1"><Checkbox state={allState} onClick={toggleAll} label="Select all" /></th>
            <th className="sticky c2">{th('status', 'Off/On', null, { caret: false })}</th>
            <th className="sticky c3">{th('name', HEAD[level])}</th>
            {hasPeriod && <th style={{ minWidth: 190 }}><div className="hd plain"><span className="lbl">Time</span></div></th>}
            {columns.map((c) => (
              <th key={c.id} style={{ width: c.w, minWidth: c.w, maxWidth: c.w }}>
                {th(c.id, c.label, c.budget && level === 'ad' ? 'Ad set' : null, { sortable: !c.budget })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`${selected.has(key(r)) ? 'selected' : ''} ${r.status === 'off' ? 'off' : ''}${r.delivery === 'In draft' ? ' draft' : ''}`}>
              <td className="sticky c1"><Checkbox state={selected.has(key(r))} onClick={() => toggleSel(key(r))} label="Select row" /></td>
              <td className="sticky c2"><Toggle on={r.status === 'on'} onChange={(v) => onToggle(r, v)} label={`Turn ${r.name} ${r.status === 'on' ? 'off' : 'on'}`} /></td>
              <td className="sticky c3">
                <div className="namecell">
                  {level === 'ad' && (
                    <span className={'thumbwrap' + (admin ? ' ed-able' : '')} title={admin ? 'Double-click to change the image or video' : undefined}
                      onDoubleClick={admin ? () => { mediaRow.current = r; if (fileRef.current) fileRef.current.click(); } : undefined}>
                      <Thumb media={r.media} level={level} name={r.name} />
                      {r.media?.url && (
                        <button type="button" className="rw-zoom" aria-label="View image" onClick={(e) => { e.stopPropagation(); window.open(r.media.url, '_blank', 'noopener'); }} onDoubleClick={(e) => e.stopPropagation()}><IcZoom /></button>
                      )}
                    </span>
                  )}
                  <div className="nm">
                    {ed && ed.col === 'name' && ed.row.id === r.id
                      ? <span className="nm-edit">{cellInput('name', true)}</span>
                      : (
                        <div className="rw-nl">
                          <span className={`nm-t ${level !== 'ad' ? 'link' : ''}${admin ? ' ed-able' : ''}`} title={admin ? r.name + ' (double-click to rename)' : r.name} onClick={() => nameClick(r)} onDoubleClick={() => nameDouble(r)}>{r.name}</span>
                          {admin && <button type="button" className="rw-pen" aria-label={'Rename ' + r.name} title="Rename" onClick={(e) => { e.stopPropagation(); startEdit(r, 'name', r.name); }}><IcPen /></button>}
                        </div>
                      )}
                    {!(ed && ed.col === 'name' && ed.row.id === r.id) && <RowChips r={r} actions={actions} />}
                  </div>
                </div>
              </td>
              {hasPeriod && <td className="tl">{r.period}</td>}
              {columns.map((c) => {
                const v = c.v(r);
                const none = cellEmpty(c, r); // emptied by the admin: a dash instead of the figure
                if (ed && ed.col === c.id && ed.row.id === r.id) return <td key={c.id} className={'editing' + (c.text ? ' tl' : '')}>{c.id === 'delivery' ? deliverySelect() : cellInput(c.label, !!c.text, c.id === 'bid' ? 60 : undefined, WHOLE_NUMBER_COLS.has(c.id))}</td>;
                const can = admin && canEditCell(c, r);
                const ex = can ? { onDoubleClick: () => startEdit(r, c.id, editInit(c, r)), title: 'Double-click to edit' } : {};
                const ab = can ? ' ed-able' : '';
                if (c.id === 'delivery') return <td key={c.id} className={'tl' + ab} {...ex}><span className={'dot' + (['Active', 'Learning'].includes(r.delivery) ? '' : r.delivery === 'In draft' ? ' ring' : ' off')} />{r.delivery}</td>;
                if (c.text) return <td key={c.id} data-col={c.id} className={'tl' + ab} style={{ maxWidth: c.w }} {...ex}>{v == null || v === '' || v === '—' ? <Dash /> : v}</td>;
                if (c.budget) {
                  if (typeof r.budget === 'string') return <td key={c.id}><span className="muted-s">{r.budget}</span></td>;
                  return (
                    <td key={c.id} className={(ab + ' rw-bud').trim()} {...(can ? { onDoubleClick: (e) => { closeFloat(); setBud({ row: r, at: rectCss(e.currentTarget) }); }, title: 'Double-click to edit' } : {})}>
                      {can && v != null && <button type="button" className="rw-bpen" aria-label="Edit budget" onClick={(e) => { e.stopPropagation(); closeFloat(); setBud({ row: r, at: rectCss(e.currentTarget.closest('td')) }); }}><IcPen /></button>}
                      {none || v == null ? <Dash /> : <>{c.f(v)}<span className="cmp bl">{r.budgetLabel}</span></>}
                    </td>
                  );
                }
                return <td key={c.id} className={ab.trim()} {...ex}>{none ? <Dash /> : shown(c, v)}{compare && !none && <Cmp col={c} cur={v} prevRow={r.prev} />}</td>;
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky c1" /><td className="sticky c2" />
            <td className="sticky c3">
              <span className="results">Results from {count} {level === 'adset' ? (count === 1 ? 'ad set' : 'ad sets') : level === 'ad' ? (count === 1 ? 'ad' : 'ads') : (count === 1 ? 'campaign' : 'campaigns')}<span className="rw-info" {...(hideResults ? { 'data-tip': 'Totals are hidden in order to improve load time.' } : {})}><IcInfo /></span></span>
              {/* appears while the pointer is on the totals row; the totals come back on "View results" and after every reload */}
              <button type="button" className={`hide-res${hideResults ? ' vr' : ''}`} onClick={onHideResults}>{hideResults ? <IcEye /> : <EyeOff size={15} />}{hideResults ? 'View results' : 'Hide results'}</button>
            </td>
            {hasPeriod && <td />}
            {/* the totals row: every figure is a formula over the rows (see sumRows / derive in lib.js), so it follows filters, sorting, dates and edits */}
            {columns.map((c) => {
              if (c.text || c.budget || hideResults) return <td key={c.id} />;
              const t = columnTotal(c, rows, totals); // rows whose cell in this column was emptied do not count; all empty = no total
              const v = t ? c.v(t) : null;
              return (
                <td key={c.id}>
                  {c.id === 'reach' && v != null ? <span className="foot-dotted">{c.f(v)}</span> : shown(c, v)}{compare && prevTotals && t === totals && <Cmp col={c} cur={v} prevRow={prevTotals} />}<span className={`cap ${c.dotted ? 'dotted' : ''}`} title={c.foot}>{c.foot}</span>
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
      {!rows.length && !loading && (emptyKind === 'actions' ? (
        <div className="empty telescope">
          <svg width="190" height="230" viewBox="0 0 190 230" fill="none" aria-hidden="true">
            <defs><linearGradient id="tg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#cfe6ff" /><stop offset="1" stopColor="#7fb8f2" /></linearGradient></defs>
            <path d="M20 70l110-48 12 28-110 48z" fill="url(#tg1)" /><path d="M128 20l36-16 12 30-36 16z" fill="#e8eef5" stroke="#b8c4d0" />
            <path d="M85 118c8 16 30 16 36 0" stroke="#0a68d9" strokeWidth="5" strokeLinecap="round" /><path d="M96 124l-30 100M96 124v100M96 124l30 100" stroke="#0a68d9" strokeWidth="6" strokeLinecap="round" />
          </svg>
          <h3>No ads found</h3>No recommendations right now. Check back after your ads have delivered.
        </div>
      ) : (
        <div className="empty"><Megaphone size={36} color="#8a8d91" /><h3>No {HEAD[level].toLowerCase()}s to show</h3>Try a different date range, clear filters, or click Create.</div>
      ))}
    </div>
  );
}
