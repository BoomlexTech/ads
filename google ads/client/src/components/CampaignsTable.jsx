import { Fragment, useState } from 'react';
import { Icon } from './Common.jsx';
import { useHeaderTip } from './HeaderTip.jsx';
import { colLabel, isMetric } from './columns.js';
import { DASH, editText, withDerived, sumRows } from '../../../shared/metrics.js';
import { CAMPAIGN_TYPES, CAMPAIGN_STATUS_LABELS, campaignStatusLabel, formatScore, parseScore } from '../../../shared/entities.js';
import { EditSelect } from './Editable.jsx';
import { useNotify } from '../account.js';
import {
  GridFrame, TotalRows, MetricCell, NameLink, EditCell, StatusDot, EntityStatus, SegmentRows, fitW, headerCell, useSelection, extraValues,
} from './Grid.jsx';
import { TYPE_ICON, perDay } from './Entity.jsx';

// Fixed column widths (CSS px), shared by the pinned header and the body; checkbox, status dot
// and Campaign stay put on horizontal scroll.
const FIXED = [56, 40, 317, 192, 231];
const FROZEN = FIXED[0] + FIXED[1] + FIXED[2];
const COL_W = { optScore: 96, campaignType: 96 };
const colWidth = (k) => COL_W[k] ?? 80;

function Budget({ c, canEdit, onField }) {
  return (
    <span className="budget">
      <EditCell value={c.budget == null ? '' : editText('cost', c.budget)} canEdit={canEdit} label="budget" pencil
        onSave={(v) => onField('campaign', c.id, { field: 'budget', value: v })}>
        <span className={c.budget == null ? '' : 'dashed'}>{perDay(c.budget)}</span>
      </EditCell>
      {c.budget != null && <Icon name="hide_image" className="budget-ic" />}
    </span>
  );
}

// rows: campaigns with their summed numbers (and adCount); allRows: every campaign of the
// account, whatever the view, filters or search (the "Total: Account" budget). Campaign names open the campaign's ad groups
// (links.campaign(c) -> { href, open }); the gear opens its settings. segments: Map of campaign
// id -> sub-rows ({ key, label, values }) shown under it (Segment). Row checkboxes show for everyone; deleting needs onDelete (admins).
export default function CampaignsTable({ rows, allRows = rows, account, byType = [], cols, canEdit, onEditMetric, onEditTotal, onField, onDelete, onSettings,
  sort, onSort, onHideColumn, busyCell, links, segments = null }) {
  const notify = useNotify();
  const [draftsOpen, setDraftsOpen] = useState(false);
  const tips = useHeaderTip();
  const sel = useSelection(rows, onDelete);
  const view = withDerived(sumRows(rows));
  const acct = withDerived(account);
  const derived = rows.map(withDerived);
  const widths = [...FIXED, ...cols.map((k) => (isMetric(k) ? fitW(k, [...derived.map((d) => d[k]), view[k], acct[k], ...extraValues(k, null, segments)], colWidth(k)) : colWidth(k)))];
  const header = (k, label, cls) => headerCell(k, label, cls, { sort, onSort, tips, tip: isMetric(k) });
  const srCols = [['name', 'Campaign'], ['budget', 'Budget'], ['status', 'Status'], ...cols.map((k) => [k, colLabel(k)])];
  const budgets = allRows.filter((c) => c.status !== 'paused' && c.budget != null);
  const field = (c) => (name, value) => onField('campaign', c.id, { field: name, value });

  const attr = (k, c) => {
    if (k === 'optScore') {
      return (
        <EditCell value={c.optimizationScore == null ? '' : String(c.optimizationScore)} canEdit={canEdit} label="optimization score"
          onSave={(v) => (parseScore(v) === undefined ? notify('Enter a score from 0 to 100') : field(c)('optimizationScore', v))}>
          {formatScore(c.optimizationScore)}
        </EditCell>
      );
    }
    if (k === 'campaignType') return <EditSelect value={c.type} options={CAMPAIGN_TYPES} canEdit={canEdit} label="campaign type" onSave={(v) => field(c)('type', v)} />;
    return '';
  };

  return (
    <GridFrame className="grid ent-grid" widths={widths} frozen={FROZEN} tips={tips} sort={sort} srCols={srCols} selection={sel.selection}
      empty={false} onHideColumn={onHideColumn}
      head={(
        <>
          <th className="sticky c-check"><input type="checkbox" checked={sel.all} onChange={sel.toggleAll} aria-label="Select all" /></th>
          <th className="sticky c-dot" aria-hidden="true"><span className="dot grey" /></th>
          {header('name', 'Campaign', 'sticky c-name')}
          {header('budget', 'Budget', 'num c-budget')}
          {header('status', 'Status', 'c-estatus')}
          {cols.map((k) => header(k, colLabel(k), `c-${k} ${k === 'optScore' ? 'num' : ''}`))}
        </>
      )}>
      <tr className="drafts-row" data-testid="drafts-row">
        <td className="sticky c-check" />
        <td className="sticky c-dot">
          <button type="button" className="acct-toggle" aria-expanded={draftsOpen} aria-label={draftsOpen ? 'Hide drafts' : 'Show drafts'}
            onClick={() => setDraftsOpen((o) => !o)}><Icon name={draftsOpen ? 'expand_less' : 'expand_more'} /></button>
        </td>
        <td className="sticky c-name"><span className="drafts-label"><Icon name="folder" fill className="drafts-ic" />Drafts in progress: 0</span></td>
        <td /><td />
        {cols.map((k) => <td key={k} />)}
      </tr>
      {draftsOpen && (
        <tr className="drafts-row sub">
          <td className="sticky c-check" /><td className="sticky c-dot" />
          <td className="sticky c-name"><span className="drafts-label muted">No campaign drafts in progress</span></td>
          <td /><td />
          {cols.map((k) => <td key={k} />)}
        </tr>
      )}
      {rows.length === 0 && (
        <tr className="empty-row">
          <td className="sticky c-check" /><td className="sticky c-dot" />
          <td className="sticky c-name muted">No campaigns match your filters</td>
          <td /><td />
          {cols.map((k) => <td key={k} />)}
        </tr>
      )}
      {rows.map((c) => {
        const v = withDerived(c);
        const link = links.campaign(c);
        const segs = segments?.get(c.id);
        return (
          <Fragment key={c.id}>
            <tr data-testid="campaign-row" data-id={c.id}>
              <td className="sticky c-check"><input type="checkbox" checked={sel.checked.has(c.id)} aria-label="Select row" onChange={() => sel.toggle(c.id)} /></td>
              <td className="sticky c-dot"><StatusDot status={c.status} canEdit={canEdit} label="campaign status" onSave={(s) => field(c)('status', s)} /></td>
              <td className="sticky c-name">
                <div className="ent-cell">
                  <Icon name={TYPE_ICON[c.type] || 'campaign'} className="ent-type" />
                  <span className="ent-name">
                    <NameLink value={c.name} href={link.href} canEdit={canEdit} label="campaign name" pencil testId="campaign-link"
                      onOpen={link.open} onSave={(s) => field(c)('name', s)} />
                  </span>
                  <button type="button" className="ent-gear" aria-label="Campaign settings" title="Campaign settings" onClick={() => onSettings(c)}><Icon name="settings" /></button>
                </div>
              </td>
              <td className="num c-budget"><Budget c={c} canEdit={canEdit} onField={onField} /></td>
              <td className="c-estatus">
                <EntityStatus label={campaignStatusLabel(c)} value={c.statusLabel || ''} auto={c.status === 'paused' ? 'Paused' : 'Eligible'}
                  labels={CAMPAIGN_STATUS_LABELS} reasons={c.statusReasons || []} canEdit={canEdit} onField={field(c)} />
              </td>
              {cols.map((k) => (isMetric(k)
                ? <MetricCell key={k} k={k} value={v[k]} canEdit={canEdit && c.adCount > 0} busy={busyCell === `${c.id}:${k}`} onSave={(m, t) => onEditMetric(c, m, t)} />
                : <td key={k} className={`attr c-${k} ${k === 'optScore' ? 'num' : ''}`}>{attr(k, c)}</td>))}
            </tr>
            {segs && <SegmentRows list={segs} parent={c.id} cols={cols} nameClass="c-name" fill={[<td key="budget" />, <td key="status" />]} />}
          </Fragment>
        );
      })}
      <TotalRows tips={tips} cols={cols} canEdit={canEdit} nameClass="c-name" onEditTotal={onEditTotal}
        view={{ label: 'Total: All but removed campaigns in your current view', help: 'campaigns-view', totals: sumRows(rows), editable: rows.some((c) => c.adCount > 0) }}
        account={account} byType={byType}
        attrCell={(k) => (k === 'optScore' ? <td key={k} className={`attr c-${k} num`}>{DASH}</td> : <td key={k} />)}
        fill={(key) => [
          <td key="budget" className="num c-budget">{key === 'account' && budgets.length ? perDay(budgets.reduce((a, c) => a + c.budget, 0)) : ''}</td>,
          <td key="status" />,
        ]} />
    </GridFrame>
  );
}
