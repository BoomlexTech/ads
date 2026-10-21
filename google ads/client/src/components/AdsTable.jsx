import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Common.jsx';
import { useHeaderTip } from './HeaderTip.jsx';
import { colLabel, isMetric } from './columns.js';
import { DASH, EDITABLE, formatValue, withDerived, sumRows } from '../../../shared/metrics.js';
import { CAMPAIGN_TYPES } from '../../../shared/entities.js';
import { EDIT_FORMATS } from '../../../shared/creative.js';
import { EditText, EditSelect, MetricInput } from './Editable.jsx';
import {
  GridFrame, TotalRows, NameLink, LayerRow, SegmentRows, fitW, headerCell, useSelection, groupRows, useClosedGroups, extraValues,
} from './Grid.jsx';

// Fixed column widths (CSS px). Header and body are separate tables that share
// these widths, so the header can stay pinned while the page scrolls. On the ads page of one
// campaign / ad group its own Campaign / Ad group column is left out.
const FIXED = [
  { key: '_check', w: 56 },
  { key: '_dot', w: 40 },
  { key: 'name', w: 282 },
  { key: 'campaign', w: 234 },
  { key: 'adGroup', w: 216 },
  { key: 'status', w: 136 },
];
const COL_W = { strength: 96, adType: 96, video: 130, campaignType: 136 };
const colWidth = (k) => COL_W[k] ?? 80;
// Width of the columns that stay put on horizontal scroll (checkbox, status dot, Ad).
const FROZEN = FIXED[0].w + FIXED[1].w + FIXED[2].w;

const STRENGTH_OPTIONS = [['', '\u2013'], 'Excellent', 'Good', 'Average', 'Poor'];
const TYPE_OPTIONS = CAMPAIGN_TYPES;
const STATUS_ICON = {
  enabled: <span className="dot green" />,
  paused: <Icon name="pause_circle" className="paused-ic" fill />,
  remove: <Icon name="cancel" className="removed-ic" fill />,
};

// An ad's status dot with its menu (Enable / Pause / Remove). Everyone sees it; for read-only
// users (no onSet / onRemove) picking an item does nothing. The menu floats over the page
// (portal, fixed position) so the table's cells can't cut it off.
function StatusMenu({ status, onSet, onRemove }) {
  const paused = status === 'paused';
  const items = [['enabled', 'Enable'], ['paused', 'Pause'], ['remove', 'Remove']];
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);
  const close = () => setPos(null);
  useEffect(() => {
    if (!pos) return undefined;
    const out = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') { close(); btn.current?.focus(); } };
    const main = document.getElementById('main');
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', key);
    main?.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', out);
      document.removeEventListener('keydown', key);
      main?.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [pos]);
  const toggle = (e) => {
    e.stopPropagation();
    if (pos) { close(); return; }
    const r = btn.current.getBoundingClientRect();
    setPos({ left: Math.max(8, r.left - 4), top: Math.min(r.bottom + 4, window.innerHeight - 190) });
  };
  return (
    <>
      <button type="button" ref={btn} className={`st-menu-btn ${pos ? 'open' : ''}`} aria-label="Change ad status" aria-expanded={!!pos}
        aria-haspopup="menu" data-testid="ad-status-menu" onClick={toggle}>
        {STATUS_ICON[paused ? 'paused' : 'enabled']}<Icon name="arrow_drop_down" className="st-caret" />
      </button>
      {pos && createPortal(
        <div ref={menu} className="menu st-menu-list" role="menu" style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 90 }}>
          {items.map(([k, label]) => (
            <button key={k} type="button" role="menuitem" className={`menu-item st-item ${(k === 'paused') === paused && k !== 'remove' ? 'selected' : ''}`}
              data-testid={`ad-status-${k}`}
              onClick={() => { close(); if (k === 'remove') onRemove?.(); else if (k !== status) onSet?.(k); }}>
              <span className="st-item-ic">{STATUS_ICON[k]}</span>
              <span className="mi-label">{label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
const ELIGIBILITY = ['Eligible', 'Pending', 'Not eligible'];
// Most text lines an ad can have (the server refuses more).
const MAX_LINES = 10;

// A Cloudinary video has a still frame at the same address with a .jpg extension.
const posterOf = (url) => (/res\.cloudinary\.com\/.+\/video\/upload\//.test(url) ? url.replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg') : null);

// An ad's picture: the image, or a video's first frame (never a blank player).
function MediaView({ media, className, controls }) {
  const [broken, setBroken] = useState(false);
  if (!media?.url) return null;
  if (media.type === 'image') return <img src={media.url} alt="" className={className} />;
  const poster = posterOf(media.url);
  if (poster && !controls && !broken) return <img src={poster} alt="" className={className} onError={() => setBroken(true)} />;
  return (
    <video src={controls ? media.url : `${media.url}#t=0.1`} poster={poster || undefined} className={className}
      muted={!controls} controls={controls} playsInline preload="metadata" />
  );
}

// Details for an ad the edit page doesn't cover (search ads); the admin can edit its text here.
function AdDetails({ row, canEdit, onField, onClose }) {
  const ed = (field, extra) => (value) => onField('ad', row.id, { field, value, ...extra });
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="ad-details" role="dialog" aria-label="Asset details" data-testid="ad-details">
        <div className="add-head">
          <div>
            <div className="add-title"><EditText value={row.name || ''} canEdit={canEdit} maxLength={80} label="ad name" onSave={ed('name')}>{row.name || 'Ad'}</EditText></div>
            <div className="add-sub">{row.adType}</div>
          </div>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="add-body">
          {row.media?.url
            ? <MediaView media={row.media} className="add-media" controls={row.media.type === 'video'} />
            : row.format !== 'search' && <div className="add-media add-empty"><Icon name={row.format === 'video' ? 'smart_display' : 'hide_image'} />No {row.format === 'video' ? 'video' : 'image'} added</div>}
          <dl className="add-list">
            {row.campaign && <><dt>Campaign</dt><dd>{row.campaign}</dd></>}
            {row.adGroup && <><dt>Ad group</dt><dd>{row.adGroup}</dd></>}
            {(row.displayUrl || canEdit) && <><dt>Display URL</dt><dd><EditText value={row.displayUrl || ''} canEdit={canEdit} maxLength={100} label="details display URL" onSave={ed('displayUrl')} /></dd></>}
            {(row.headlines?.length > 0 || canEdit) && (
              <><dt>{row.format === 'search' ? 'Headlines' : 'Text'}</dt><dd><ul>
                {row.headlines.map((h, i) => <li key={i}><EditText value={h} canEdit={canEdit} maxLength={90} label={`details line ${i + 1}`} onSave={ed('headline', { index: i })} /></li>)}
                {canEdit && row.headlines.length < MAX_LINES && (
                  <li><EditText value="" canEdit maxLength={90} label="details new line" onSave={ed('addHeadline')}><span className="muted">+ Add {row.format === 'search' ? 'headline' : 'line'}</span></EditText></li>
                )}
              </ul></dd></>
            )}
            {(row.description || canEdit) && <><dt>Description</dt><dd><EditText value={row.description || ''} canEdit={canEdit} maxLength={200} label="details description" onSave={ed('description')}>{row.description || <span className="muted">Add description</span>}</EditText></dd></>}
            {row.media?.url && <><dt>{row.format === 'video' ? 'Videos' : 'Images'}</dt><dd>{row.mediaCount + (row.media?.url ? 1 : 0)}</dd></>}
            <dt>Status</dt><dd>{row.eligibility}{row.reasons?.length ? ` (${row.reasons.join(', ')})` : ''}</dd>
          </dl>
        </div>
      </div>
    </>
  );
}

function Thumb({ row, onUpload, canEdit, onField, onOpen }) {
  const pick = (e) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm';
    input.onchange = () => input.files[0] && onUpload(row, input.files[0]);
    input.click();
  };
  const h = row.hue;
  const bg = `linear-gradient(135deg, hsl(${h} 55% 28%), hsl(${(h + 40) % 360} 60% 45%) 55%, hsl(${(h + 90) % 360} 45% 22%))`;
  const unit = row.format === 'video' ? 'video' : 'image';
  const n = row.mediaCount || 0;
  return (
    <div className="thumb clickable" style={{ background: bg }} onClick={onOpen} title="View ad">
      <MediaView media={row.media} className="thumb-media" />
      {!row.media?.url && <Icon name={row.format === 'video' ? 'play_circle' : 'image'} className="thumb-ic" />}
      {onUpload && <button type="button" className="thumb-upload" onClick={pick} title="Upload an image or video"><Icon name="upload" />Upload</button>}
      {(n > 0 || canEdit) && (
        <div className="thumb-bar" onClick={canEdit ? (e) => e.stopPropagation() : undefined}>
          + <EditText digits value={String(n)} canEdit={canEdit} label="media count" onSave={(v) => onField('ad', row.id, { field: 'mediaCount', value: v })}>{n}</EditText> {unit}{n === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}

function AdCell({ row, onUpload, canEdit, onField, onOpen, onAssets }) {
  const open = (e) => { e.preventDefault(); e.stopPropagation(); onOpen(row); };
  // "View asset details": the ad's asset details page (when the page offers one).
  const assets = (e) => { e.preventDefault(); e.stopPropagation(); (onAssets || onOpen)(row); };
  // Viewers get the same page read-only, so their button says "View ad".
  const editable = canEdit && EDIT_FORMATS.includes(row.format);
  const editBtn = (
    <button type="button" className="row-edit-btn" aria-label={editable ? 'Edit ad' : 'View ad'} title={editable ? 'Edit ad' : 'View ad'} data-testid="edit-ad" onClick={open}>
      <Icon name={editable ? 'edit' : 'open_in_new'} />
    </button>
  );
  const ed = (field, extra) => (value) => onField('ad', row.id, { field, value, ...extra });
  const more = (i, fallback) => {
    const n = row.extraCounts?.[i] ?? fallback;
    if (!n && !canEdit) return null;
    return (
      <span className="more">+ <EditText digits value={String(n || 0)} canEdit={canEdit} label={`more on line ${i + 1}`} onSave={ed('extraCount', { index: i })}>{n || 0}</EditText> more</span>
    );
  };
  const line = (h, i) => <EditText value={h} canEdit={canEdit} maxLength={90} label={`line ${i + 1}`} onSave={ed('headline', { index: i })} />;
  if (row.format === 'search') {
    return (
      <div className="adcell search">
        <div className="ad-lines">
          <div className="sa-head">
            <span className="link">{row.headlines.map((h, i) => <span key={i}>{i > 0 && ' | '}{line(h, i)}</span>)}</span>{' '}
            {more(0, 0)}
            {canEdit && row.headlines.length < MAX_LINES && (
              <>{' '}<EditText value="" canEdit maxLength={90} label="new headline" onSave={ed('addHeadline')}><span className="muted">+ Headline</span></EditText></>
            )}
          </div>
          <div className="sa-url clamp"><EditText value={row.displayUrl} canEdit={canEdit} maxLength={100} label="display URL" onSave={ed('displayUrl')} /></div>
          <div className="sa-desc">
            <EditText value={row.description || ''} canEdit={canEdit} maxLength={200} label="description" onSave={ed('description')}>
              {row.description || (canEdit && <span className="muted">Add description</span>)}
            </EditText>
          </div>
          <div><a className="link" href="#" onClick={assets}>View asset details</a> · <a className="link" href="#" onClick={open}>Preview ads</a></div>
        </div>
        {editBtn}
      </div>
    );
  }
  return (
    <div className="adcell">
      <div className="ad-name">{canEdit
        ? <EditText value={row.name} canEdit maxLength={80} label="ad name" onSave={ed('name')} />
        : <a className="ad-open" href="#" onClick={open}>{row.name}</a>}</div>
      <div className="ad-body">
        <Thumb row={row} onUpload={onUpload} canEdit={canEdit} onField={onField} onOpen={open} />
        <div className="ad-lines">
          {row.headlines.map((h, i) => (
            <div key={i} className="ad-line">
              <span className="clip">{line(h, i)}</span>
              {(row.extraCounts?.[i] || canEdit) ? more(i, 0) : null}
            </div>
          ))}
          <a className="link" href="#" onClick={assets}>View asset details</a>
        </div>
        {editBtn}
      </div>
    </div>
  );
}

function StatusCell({ row, canEdit, onField }) {
  const ed = (field) => (value) => onField('ad', row.id, { field, value });
  // "Not eligible" (red) and "Pending" (e.g. Under review) list their reasons underneath.
  if (row.eligibility === 'Not eligible' || row.eligibility === 'Pending') {
    const red = row.eligibility === 'Not eligible';
    return (
      <div className="status">
        <span className={`st-line st-head ${red ? '' : 'pending'}`}>
          <EditSelect value={row.eligibility} options={ELIGIBILITY} canEdit={canEdit} label="status" onSave={ed('eligibility')}>
            <span className={`dashed ${red ? 'red' : ''}`}>{row.eligibility}</span>
          </EditSelect>
        </span>
        <EditText value={row.reasons.join(', ')} canEdit={canEdit} maxLength={300} label="status reasons" onSave={ed('reasons')}>
          {row.reasons.length
            ? row.reasons.map((r, i) => <span key={i} className="st-line"><span className="dashed">{r}{i < row.reasons.length - 1 ? ',' : ''}</span></span>)
            : canEdit && <span className="st-line muted">Add reasons</span>}
        </EditText>
      </div>
    );
  }
  return (
    <div className="status">
      <span className="st-line">
        <EditSelect value={row.eligibility} options={ELIGIBILITY} canEdit={canEdit} label="status" onSave={ed('eligibility')}>
          <span className="dashed">Eligible</span>
        </EditSelect>
      </span>
    </div>
  );
}

function AttrCell({ k, row, canEdit, onField }) {
  const ed = (field) => (value) => onField('ad', row.id, { field, value });
  if (k === 'strength') {
    return (
      <EditSelect value={row.strength || ''} options={STRENGTH_OPTIONS} canEdit={canEdit} label="ad strength" onSave={ed('strength')}>
        {row.strength ? <span className="dashed">{row.strength}</span> : DASH}
      </EditSelect>
    );
  }
  if (k === 'adType') return <EditText value={row.adType} canEdit={canEdit} maxLength={60} label="ad type" onSave={ed('adType')} />;
  if (k === 'campaignType') {
    return <EditSelect value={row.campaignType} options={TYPE_OPTIONS} canEdit={canEdit} label="campaign type" onSave={(v) => onField('campaign', row.campaignId, { field: 'type', value: v })} />;
  }
  if (k === 'video') {
    const title = (
      <EditText value={row.videoTitle || ''} canEdit={canEdit} maxLength={80} label="video title" onSave={ed('videoTitle')}>
        {row.videoTitle
          ? <a href="#" className="link" onClick={(e) => e.preventDefault()}><Icon name="smart_display" />{row.videoTitle}</a>
          : (canEdit ? <span className="muted">{DASH}</span> : '')}
      </EditText>
    );
    if (!row.videoTitle) return title;
    const n = row.mediaCount || 0;
    return (
      <div className="video-cell">
        {title}
        {(n > 0 || canEdit) && <span className="link">+ <EditText digits value={String(n)} canEdit={canEdit} label="more videos" onSave={ed('mediaCount')}>{n}</EditText> more</span>}
      </div>
    );
  }
  return '';
}

// scope: the ads page of one campaign or ad group ({ key, label, totals, edit }); its total row
// replaces "Total: Account", which then opens under it. links: where the campaign / ad group
// names go ({ href, open } for a row). layered: rows grouped under their ad group (Layers);
// segments: Map of ad id -> sub-rows ({ key, label, values }) shown under that ad (Segment).
// Row checkboxes show for everyone; deleting needs onDelete, which only admins get.
export default function AdsTable({ rows, allRows, account, byType = [], cols, canEdit, onEdit, onEditTotal, onField, onUpload, onDelete, sort, onSort, onHideColumn, busyCell, onOpenEdit, onOpenAssets, scope = null, links,
  layered = false, segments = null }) {
  const [editing, setEditing] = useState(null);
  // The open details dialog follows the row by id, so saved edits show in it at once.
  const [detailsId, setDetailsId] = useState(null);
  // Looked up in the unfiltered list, so an edit that drops the ad out of the search keeps it open.
  const details = detailsId ? (allRows || rows).find((r) => r.id === detailsId) : null;
  useEffect(() => { if (detailsId && !details) setDetailsId(null); }, [detailsId, details]);
  // Display and video ads open the edit page; search ads open the details dialog.
  const openAd = (row) => (EDIT_FORMATS.includes(row.format) && onOpenEdit ? onOpenEdit(row) : setDetailsId(row.id));
  const tips = useHeaderTip();
  const sel = useSelection(rows, onDelete);
  const layers = useClosedGroups();
  const groups = layered ? groupRows(rows, (r) => r.adGroupId, (r) => r.adGroup || 'Ad group') : null;
  const view = withDerived(sumRows(rows));
  const acct = withDerived(account);
  const scoped = scope ? withDerived(scope.totals) : null;
  const showCamp = !scope;
  const showGroup = !scope || scope.key !== 'adgroup';
  const fixed = FIXED.filter((c) => (c.key !== 'campaign' || showCamp) && (c.key !== 'adGroup' || showGroup));
  const blanks = fixed.length - 3;

  const derived = rows.map(withDerived);
  const widths = [...fixed.map((c) => c.w), ...cols.map((k) => (isMetric(k)
    ? fitW(k, [...derived.map((d) => d[k]), view[k], acct[k], scoped?.[k], ...extraValues(k, groups, segments)], colWidth(k))
    : colWidth(k)))];
  const header = (k, label, cls) => headerCell(k, label, cls, { sort, onSort, tips });
  const empties = Array.from({ length: blanks }, (_, i) => <td key={`e${i}`} />);
  const srCols = [['name', 'Ad'], showCamp && ['campaign', 'Campaign'], showGroup && ['adGroup', 'Ad group'], ['status', 'Status'], ...cols.map((k) => [k, colLabel(k)])].filter(Boolean);

  // One ad's row, and its segment rows under it.
  const renderRow = (r) => {
    const v = withDerived(r);
    const camp = links?.campaign(r);
    const group = links?.adGroup(r);
    const segs = segments?.get(r.id);
    return (
      <Fragment key={r.id}>
        <tr data-testid="ad-row" data-id={r.id}>
          <td className="sticky c-check">
            <input type="checkbox" checked={sel.checked.has(r.id)} aria-label="Select row" onChange={() => sel.toggle(r.id)} />
            {onDelete && <button type="button" className="row-del" data-testid="delete-row" aria-label="Delete ad" title="Delete ad" onClick={() => sel.remove([r.id])}><Icon name="delete" /></button>}
          </td>
          <td className="sticky c-dot">
            <StatusMenu status={r.status}
              onSet={canEdit ? (val) => onField('ad', r.id, { field: 'status', value: val }) : undefined}
              onRemove={onDelete ? () => sel.remove([r.id]) : undefined} />
          </td>
          <td className="sticky c-ad"><AdCell row={r} onUpload={canEdit ? onUpload : undefined} canEdit={canEdit} onField={onField}
            onOpen={openAd} onAssets={onOpenAssets} /></td>
          {showCamp && (
            <td className="c-camp">
              <NameLink value={r.campaign} href={camp?.href} canEdit={canEdit} label="campaign name" onOpen={() => camp?.open()}
                onSave={(val) => onField('ad', r.id, { field: 'campaignLabel', value: val })} />
            </td>
          )}
          {showGroup && (
            <td className="c-group">
              <NameLink value={r.adGroup} href={group?.href} canEdit={canEdit} label="ad group name" onOpen={() => group?.open()}
                onSave={(val) => onField('ad', r.id, { field: 'adGroupLabel', value: val })} />
            </td>
          )}
          <td className="c-status"><StatusCell row={r} canEdit={canEdit} onField={onField} /></td>
          {cols.map((k) => {
            if (!isMetric(k)) return <td key={k} className={`attr c-${k}`}><AttrCell k={k} row={r} canEdit={canEdit} onField={onField} /></td>;
            // Any column with stored data behind it can be typed into; the server works out the stored values.
            const editable = canEdit && EDITABLE.has(k);
            const isEditing = editing && editing.id === r.id && editing.metric === k;
            return (
              <td key={k} className={`num ${editable ? 'editable' : ''} ${busyCell === `${r.id}:${k}` ? 'busy' : ''}`} data-metric={k}
                onDoubleClick={editable ? () => setEditing({ id: r.id, metric: k }) : undefined}
                title={editable && !isEditing ? 'Double-click to edit' : undefined}>
                {isEditing
                  ? <MetricInput metric={k} value={v[k]} onCancel={() => setEditing(null)}
                    onCommit={(text) => { setEditing(null); onEdit(r, k, text); }} />
                  : formatValue(k, v[k])}
              </td>
            );
          })}
        </tr>
        {segs && <SegmentRows list={segs} parent={r.id} cols={cols} nameClass="c-ad" fill={empties} />}
      </Fragment>
    );
  };

  return (
    <>
    {details && <AdDetails row={details} canEdit={canEdit} onField={onField} onClose={() => setDetailsId(null)} />}
    <GridFrame widths={widths} frozen={FROZEN} tips={tips} sort={sort} srCols={srCols} selection={sel.selection}
      empty={rows.length === 0} emptyText="No ads match your filters" onHideColumn={onHideColumn}
      head={(
        <>
          <th className="sticky c-check"><input type="checkbox" checked={sel.all} onChange={sel.toggleAll} aria-label="Select all" /></th>
          <th className="sticky c-dot" aria-hidden="true"><span className="dot grey" /></th>
          {header('name', 'Ad', 'sticky c-ad')}
          {showCamp && header('campaign', 'Campaign', 'c-camp')}
          {showGroup && header('adGroup', 'Ad group', 'c-group')}
          {header('status', 'Status', 'c-status')}
          {cols.map((k) => header(k, colLabel(k), `c-${k}`))}
        </>
      )}>
      {groups ? groups.map((g) => (
        <Fragment key={`layer:${g.id}`}>
          <LayerRow group={g} kind="Ad group" open={layers.isOpen(g.id)} onToggle={() => layers.toggle(g.id)} cols={cols} nameClass="c-ad" fill={empties} />
          {layers.isOpen(g.id) && g.rows.map((r) => renderRow(r))}
        </Fragment>
      )) : rows.map((r) => renderRow(r))}
      <TotalRows tips={tips} cols={cols} canEdit={canEdit} nameClass="c-ad" fill={() => empties} onEditTotal={onEditTotal}
        view={{ label: 'Total: Ads in your current view', help: 'view', totals: sumRows(rows), editable: rows.length > 0 }} scope={scope} account={account} byType={byType} />
    </GridFrame>
    </>
  );

}
