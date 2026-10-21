import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Common.jsx';
import HeaderTip from './HeaderTip.jsx';
import { RECOMMENDED } from './columnHelp.js';
import { ATTR_COLS, isMetric } from './columns.js';
import { EDITABLE, formatValue, withDerived, sumRows } from '../../../shared/metrics.js';
import { EditSelect, EditText, MetricInput } from './Editable.jsx';

// Shared pieces of the ads, campaigns and ad groups tables: the pinned header / body /
// bottom scrollbar frame, sortable headers, total rows and the inline editors they use.

const TOTAL_HELP = {
  view: 'Total traffic to your ads that match your current workspace filters',
  'campaigns-view': 'Total traffic to the campaigns that match your current workspace filters, apart from removed campaigns',
  'adgroups-view': 'Total traffic to the ad groups that match your current workspace filters, apart from removed ad groups',
  account: 'Total traffic to your account',
  campaign: 'Total traffic to this campaign',
  adgroup: 'Total traffic to this ad group',
  Search: 'Total traffic to your Search campaigns, and Search campaigns with Display select.',
};
const totalHelp = (k) => TOTAL_HELP[k] || `Total traffic to your ${k} campaigns`;

// Widen a metric column so its largest value (rows + totals) is never cut off.
const textW = (s) => [...s].reduce((w, ch) => w + (ch === ',' ? 2.6 : ch === '.' ? 3.5 : ch === '%' ? 9.6 : 7.4), 0);
export const fitW = (k, vals, min) => Math.max(min, Math.ceil(Math.max(0, ...vals.map((v) => textW(formatValue(k, v))))) + 17);

// Help icon on a total row: hover shows what that total covers.
export function TotalHelp({ tips, k }) {
  return (
    <span className="help-hit" data-testid="total-help" onMouseEnter={(e) => tips.show(e, `total:${k}`, totalHelp(k))} onMouseLeave={tips.leave}>
      <Icon name="help" className="help-ic" />
    </span>
  );
}

// A metric cell in a total row: double-click to type a new total for that row.
export function TotalCell({ k, value, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  if (!isMetric(k)) return <td />;
  const editable = canEdit && EDITABLE.has(k);
  return (
    <td className={`num ${editable ? 'editable' : ''}`} data-metric={k}
      onDoubleClick={editable ? () => setEditing(true) : undefined} title={editable && !editing ? 'Double-click to edit' : undefined}>
      {editing
        ? <MetricInput metric={k} value={value} onCancel={() => setEditing(false)} onCommit={(t) => { setEditing(false); onSave(k, t); }} />
        : formatValue(k, value)}
    </td>
  );
}

// A metric cell in a row (ad, campaign or ad group): double-click to type a new value.
export function MetricCell({ k, value, canEdit, busy, onSave }) {
  const [editing, setEditing] = useState(false);
  const editable = canEdit && EDITABLE.has(k);
  return (
    <td className={`num ${editable ? 'editable' : ''} ${busy ? 'busy' : ''}`} data-metric={k}
      onDoubleClick={editable ? () => setEditing(true) : undefined}
      title={editable && !editing ? 'Double-click to edit' : undefined}>
      {editing
        ? <MetricInput metric={k} value={value} onCancel={() => setEditing(false)} onCommit={(t) => { setEditing(false); onSave(k, t); }} />
        : formatValue(k, value)}
    </td>
  );
}

// Column header: click sorts. The sort arrow sits after the label on text columns and before
// it on number and other right-aligned (`num` in cls) columns. `tip: false` leaves out the hover card.
export function headerCell(k, label, cls, { sort, onSort, tips, tip = true }) {
  const num = isMetric(k);
  const right = num || /(^|\s)num(\s|$)/.test(cls);
  const sorted = sort.key === k;
  const arrow = sorted && <Icon name={sort.dir === 'desc' ? 'arrow_downward' : 'arrow_upward'} className="sort-ic" />;
  const rec = RECOMMENDED.has(k);
  return (
    <th key={k} aria-hidden="true" data-col={k}
      className={`${num ? 'num' : ''} ${cls} ${sorted ? 'sorted' : ''} ${rec ? 'rec' : ''}`}
      onClick={() => { tips.close(); onSort(k); }}
      onMouseEnter={tip ? (e) => tips.show(e, k) : undefined} onMouseLeave={tip ? tips.leave : undefined}>
      <div className="th-in">
        {right && arrow}
        <span className={`th-label ${rec || ATTR_COLS[k]?.dashed ? 'dashed' : ''}`}>{label}</span>
        {!right && arrow}
      </div>
    </th>
  );
}

// Header strip, body and pinned bottom scrollbar as separate scrollers that share the column
// widths (so the header can stay pinned while the page scrolls) and scroll together sideways.
// `frozen`: width of the columns that stay put on horizontal scroll.
export function GridFrame({ className = 'grid', widths, frozen, tips, sort, head, srCols, selection, empty, emptyText, onHideColumn, children }) {
  const headRef = useRef(null);
  const bodyRef = useRef(null);
  const barRef = useRef(null);
  const [overflow, setOverflow] = useState(false);
  const total = widths.reduce((a, b) => a + b, 0);
  const colgroup = <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>;
  const tableStyle = { width: total, minWidth: '100%' };

  const syncFrom = (src) => {
    const x = src.scrollLeft;
    for (const el of [headRef.current, bodyRef.current, barRef.current]) {
      if (el && el !== src && el.scrollLeft !== x) el.scrollLeft = x;
    }
  };
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    const measure = () => {
      setOverflow(body.scrollWidth > body.clientWidth + 1);
      syncFrom(body);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => ro.disconnect();
  }, [total]);
  // Sideways wheel/trackpad over the pinned header scrolls the columns only (non-passive so the
  // gesture doesn't also scroll the page sideways).
  useEffect(() => {
    const headEl = headRef.current;
    if (!headEl) return undefined;
    const onWheel = (e) => {
      const body = bodyRef.current;
      if (!body) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? body.clientWidth : 1;
      const dx = (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
      if (!dx) return;
      const max = body.scrollWidth - body.clientWidth;
      if (dx < 0 ? body.scrollLeft <= 0 : body.scrollLeft >= max - 1) return;
      e.preventDefault();
      body.scrollLeft += dx;
      if (!e.shiftKey && e.deltaY) {
        const main = headEl.closest('.main');
        if (main) main.scrollTop += e.deltaY * unit;
      }
    };
    headEl.addEventListener('wheel', onWheel, { passive: false });
    return () => headEl.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="grid-wrap">
      {selection && (
        // Pinned over the column headers while rows are ticked.
        <div className="sel-pin">
          <div className="sel-bar" data-testid="selection-bar" style={{ height: headRef.current?.offsetHeight || 48 }}>
            <span className="sel-count">{selection.count} selected</span>
            <button type="button" className="sel-btn" data-testid="delete-selected" onClick={selection.onDelete}><Icon name="delete" />Delete</button>
            <button type="button" className="iconbtn sm sel-close" aria-label="Clear selection" onClick={selection.onClear}><Icon name="close" /></button>
          </div>
        </div>
      )}
      <div className="grid-head" ref={headRef} onScroll={(e) => syncFrom(e.currentTarget)}>
        <table className={className} style={tableStyle} role="presentation">
          {colgroup}
          <thead>
            <tr>{head}</tr>
          </thead>
        </table>
      </div>
      {empty && <div className="grid-empty">{emptyText}</div>}
      <div className="grid-body" ref={bodyRef} onScroll={(e) => syncFrom(e.currentTarget)}>
        <table className={className} style={tableStyle}>
          {colgroup}
          {/* Visually hidden header row so screen readers can name each column. */}
          <thead className="sr-head">
            <tr>
              <th scope="col"><span className="sr-only">Select</span></th>
              <td />
              {srCols.map(([k, l]) => (
                <th key={k} scope="col" aria-sort={sort.key === k ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}><span className="sr-only">{l}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {/* Starts at the frozen columns' right edge; same scroll range as the body. */}
      <div className={`grid-hscroll ${overflow ? '' : 'none'}`} ref={barRef} onScroll={(e) => syncFrom(e.currentTarget)} data-testid="grid-hscroll" style={{ marginLeft: frozen }}>
        <div style={{ width: total - frozen, height: 1 }} />
      </div>
      <HeaderTip tip={tips.tip} onStay={tips.stay} onLeave={tips.leave}
        onHide={onHideColumn ? (k) => { tips.close(); onHideColumn(k); } : undefined} />
    </div>
  );
}

// Layers: the rows grouped under their ad group or campaign (keyOf / labelOf of a row), in the
// order the groups first appear, each with the sum of its rows' numbers.
export function groupRows(rows, keyOf, labelOf) {
  const by = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!by.has(k)) by.set(k, { id: k, label: labelOf(r), rows: [] });
    by.get(k).rows.push(r);
  }
  return [...by.values()].map((g) => ({ ...g, values: withDerived(sumRows(g.rows)) }));
}

// Which layer groups are closed (all open at first).
export function useClosedGroups() {
  const [closed, setClosed] = useState(() => new Set());
  const toggle = (id) => setClosed((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return { isOpen: (id) => !closed.has(id), toggle };
}

// Every number a column shows besides the rows' own (layer subtotals, segment rows), so the
// column can be made wide enough for them too.
export const extraValues = (k, groups, segments) => [
  ...(groups || []).map((g) => g.values[k]),
  ...(segments ? [...segments.values()].flat().map((s) => s.values[k]) : []),
];

// A layer's parent row: open / close toggle, "<kind>: <name> (rows)" and its subtotals.
// fill: the cells between the name column and the picked columns.
export function LayerRow({ group, kind, open, onToggle, cols, nameClass, fill }) {
  return (
    <tr className="layer-row" data-testid="layer-row" data-id={group.id}>
      <td className="sticky c-check" />
      <td className="sticky c-dot">
        <button type="button" className="acct-toggle" data-testid="layer-toggle" aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} the rows of ${group.label}`} onClick={onToggle}>
          <Icon name={open ? 'expand_less' : 'expand_more'} />
        </button>
      </td>
      <td className={`sticky ${nameClass}`}>
        <span className="layer-label"><span className="muted">{kind}:</span><b className="ll-name">{group.label}</b><span className="muted">({group.rows.length})</span></span>
      </td>
      {fill}
      {cols.map((k) => (isMetric(k)
        ? <td key={k} className="num" data-metric={k}>{formatValue(k, group.values[k])}</td>
        : <td key={k} />))}
    </tr>
  );
}

// Rows under a table row, one per segment (a time period or an ad format) with that segment's
// numbers: list [{ key, label, values }]; parent: the row's id.
export function SegmentRows({ list, parent, cols, nameClass, fill }) {
  return list.map((s) => (
    <tr key={s.key} className="seg-row" data-testid="segment-row" data-parent={parent}>
      <td className="sticky c-check" />
      <td className="sticky c-dot" />
      <td className={`sticky ${nameClass}`}><span className="seg-label">{s.label}</span></td>
      {fill}
      {cols.map((k) => (isMetric(k)
        ? <td key={k} className="num" data-metric={k}>{formatValue(k, s.values[k])}</td>
        : <td key={k} />))}
    </tr>
  ));
}

// Ticked rows (only rows still on screen count) and deleting them.
// Row checkboxes show for everyone; without onDelete (read-only users) Delete on the selection
// bar does nothing.
export function useSelection(rows, onDelete) {
  const [checked, setChecked] = useState(new Set());
  const all = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const picked = rows.filter((r) => checked.has(r.id)).map((r) => r.id);
  const toggle = (id) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setChecked(all ? new Set() : new Set(rows.map((r) => r.id)));
  const remove = async (ids) => {
    if (!onDelete) return;
    if (await onDelete(ids)) setChecked((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
  };
  const selection = picked.length > 0
    ? { count: picked.length, onDelete: () => remove(picked), onClear: () => setChecked(new Set()) }
    : null;
  return { checked, all, toggle, toggleAll, remove, selection };
}

// Text box shown in place of a value while it's edited: Enter or leaving the box saves, Esc cancels.
// onDone(text) with the typed text, or onDone(null) when cancelled.
export function InlineInput({ value, label, maxLength = 100, onDone }) {
  const [text, setText] = useState(value ?? '');
  const done = useRef(false);
  const finish = (t) => {
    if (done.current) return;
    done.current = true;
    onDone(t);
  };
  return (
    <input className="inline-input" autoFocus value={text} maxLength={maxLength} aria-label={`Edit ${label}`}
      size={Math.max(4, Math.min(48, text.length + 2))}
      onFocus={(e) => e.target.select()}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(text);
        if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(text)} />
  );
}

// Admin text value: double-click (or the hover pencil) to edit. Viewers see just the value.
export function EditCell({ value, canEdit, label, onSave, children, pencil = false, maxLength = 100, className = '' }) {
  const [editing, setEditing] = useState(false);
  if (!canEdit) return children ?? value ?? null;
  if (editing) {
    return <InlineInput value={value} label={label} maxLength={maxLength} onDone={(t) => { setEditing(false); if (t != null && t !== (value ?? '')) onSave(t); }} />;
  }
  return (
    <>
      <span className={`editable ${className}`} title="Double-click to edit" data-edit={label}
        onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); setEditing(true); }}>
        {children ?? value}
      </span>
      {pencil && (
        <button type="button" className="ent-pencil" aria-label={`Edit ${label}`} title={`Edit ${label}`}
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}><Icon name="edit" /></button>
      )}
    </>
  );
}

// How long a click on a name waits for a second click (a double-click renames instead of opening).
const OPEN_DELAY = 280;

// Campaign / ad group name that opens its page. Admins double-click it (or use the hover
// pencil) to rename it, so for them a single click opens after a short delay. Ctrl/middle
// click opens the page's address in a new tab.
export function NameLink({ value, href, canEdit, label, onOpen, onSave, pencil = false, maxLength = 100, testId }) {
  const [editing, setEditing] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (editing) {
    return <InlineInput value={value} label={label} maxLength={maxLength} onDone={(t) => { setEditing(false); if (t != null && t !== value) onSave(t); }} />;
  }
  const click = (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    clearTimeout(timer.current);
    if (!canEdit || e.detail === 0) { onOpen(); return; }
    if (e.detail > 1) return;
    timer.current = setTimeout(onOpen, OPEN_DELAY);
  };
  const rename = (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(timer.current);
    setEditing(true);
  };
  return (
    <>
      <a href={href} className={`link ent-link ${canEdit ? 'editable' : ''}`} data-edit={canEdit ? label : undefined} data-testid={testId}
        title={canEdit ? 'Click to open, double-click to rename' : undefined} onClick={click} onDoubleClick={canEdit ? rename : undefined}>
        {value}
      </a>
      {pencil && canEdit && (
        <button type="button" className="ent-pencil" aria-label={`Edit ${label}`} title={`Edit ${label}`} onClick={rename}><Icon name="edit" /></button>
      )}
    </>
  );
}

// On/off dot. Admins get a caret and pick Enabled / Paused from a native list (it opens
// outside the table, so it is never clipped by the scrolling grid).
export function StatusDot({ status, canEdit, label, onSave, word = false }) {
  const paused = status === 'paused';
  const icon = paused ? <Icon name="pause_circle" className="paused-ic" fill /> : <span className="dot green" />;
  const text = word && <span className="st-word">{paused ? 'Paused' : 'Enabled'}</span>;
  if (!canEdit) return <span className="st-pick">{icon}{text}</span>;
  return (
    <span className="st-pick can-edit" title="Change status">
      {icon}{text}<Icon name="arrow_drop_down" className="st-caret" />
      <select aria-label={`Change ${label}`} data-edit={label} value={paused ? 'paused' : 'enabled'}
        onClick={(e) => e.stopPropagation()} onChange={(e) => onSave(e.target.value)}>
        <option value="enabled">Enabled</option>
        <option value="paused">Paused</option>
      </select>
    </span>
  );
}

// Status column of a campaign / ad group: its status label (automatic or set by an admin)
// and the reasons under it (reasons are added in the settings dialog, then edited here too).
export function EntityStatus({ label, value, auto, labels, reasons, canEdit, onField }) {
  return (
    <div className="status">
      <span className={`st-line ${reasons.length ? 'st-head' : ''}`}>
        <EditSelect value={value} options={[['', `Automatic (${auto})`], ...labels]} canEdit={canEdit} label="status" onSave={(v) => onField('statusLabel', v)}>
          <span className={`dashed ${label === 'Not eligible' ? 'red' : ''}`}>{label}</span>
        </EditSelect>
      </span>
      {reasons.length > 0 && (
        <EditText value={reasons.join(', ')} canEdit={canEdit} maxLength={300} label="status reasons" onSave={(v) => onField('statusReasons', v)}>
          {reasons.map((r, i) => <span key={i} className="st-line"><span className="dashed">{r}{i < reasons.length - 1 ? ',' : ''}</span></span>)}
        </EditText>
      )}
    </div>
  );
}

// The total rows under a table: the rows in view, then the page's own campaign / ad group
// (scope: { key, label, totals, edit }) with the account total opening under it, or on
// unscoped pages the account total opening into one row per campaign type.
// fill(rowKey) gives the cells between the name column and the column picker's columns;
// attrCell(k), if given, the cell of a picked attribute column (default: an empty cell).
// `editable: false` on view, scope or a byType item: no ads behind that total, so it can't be typed into.
export function TotalRows({ tips, cols, canEdit, nameClass, fill, attrCell, view, scope, account, byType = [], onEditTotal }) {
  const [open, setOpen] = useState(false);
  const toggle = (what) => (
    <button type="button" className="acct-toggle" data-testid="account-toggle" aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} ${what}`} onClick={() => setOpen((o) => !o)}>
      <Icon name={open ? 'expand_less' : 'expand_more'} />
    </button>
  );
  const row = (testId, key, label, help, values, edit, opts = {}) => (
    <tr className={`total-row ${opts.sub ? 'sub' : ''}`} data-testid={testId} key={key}>
      <td className="sticky c-check" />
      <td className="sticky c-dot">{opts.toggle}</td>
      <td className={`sticky ${nameClass}`}><span className="total-label"><span className="tl-text">{label}</span> <TotalHelp tips={tips} k={help} /></span></td>
      {fill(key)}
      {cols.map((k) => (isMetric(k) || !attrCell
        ? <TotalCell key={k} k={k} value={values[k]} canEdit={canEdit && opts.editable !== false} onSave={(m, t) => onEditTotal(edit, m, t)} />
        : attrCell(k)))}
    </tr>
  );
  return (
    <>
      {row('total-view', 'view', view.label, view.help, withDerived(view.totals), { scope: 'view' }, { editable: view.editable })}
      {scope && row('total-scope', 'scope', `Total: ${scope.label}`, scope.key, withDerived(scope.totals), scope.edit,
        { toggle: toggle('account total'), editable: scope.editable })}
      {(!scope || open) && row('total-account', 'account', 'Total: Account', 'account', withDerived(account), { scope: 'account' },
        { toggle: scope ? null : toggle('campaign type totals'), sub: !!scope })}
      {!scope && open && byType.map((t) => row('total-type', t.type, `Total: ${t.type} campaigns`, t.type, withDerived(t), { scope: 'type', type: t.type },
        { sub: true, editable: t.editable }))}
    </>
  );
}
