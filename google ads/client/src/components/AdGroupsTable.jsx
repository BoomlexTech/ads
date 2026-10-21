import { Fragment } from 'react';
import { Icon } from './Common.jsx';
import { useHeaderTip } from './HeaderTip.jsx';
import { colLabel, isMetric } from './columns.js';
import { DASH, editText, formatValue, withDerived, sumRows } from '../../../shared/metrics.js';
import { AD_GROUP_STATUS_LABELS, AD_GROUP_TYPES, adGroupStatusLabel, adGroupType } from '../../../shared/entities.js';
import { EditSelect } from './Editable.jsx';
import {
  GridFrame, TotalRows, MetricCell, NameLink, EditCell, StatusDot, EntityStatus, LayerRow, SegmentRows, fitW, headerCell, useSelection,
  groupRows, useClosedGroups, extraValues,
} from './Grid.jsx';

// Fixed column widths (CSS px): checkbox, status dot, Ad group (these three stay put on
// horizontal scroll), Campaign (only when ad groups of every campaign are listed), Status.
const FIXED = { check: 56, dot: 40, name: 302, campaign: 220, status: 136 };
const FROZEN = FIXED.check + FIXED.dot + FIXED.name;
const COL_W = { targetCpa: 112, groupType: 96 };
const colWidth = (k) => COL_W[k] ?? 80;

// rows: ad groups (with campaign, campaignType, adCount and their summed numbers). Names open the ad
// group's ads; on the unscoped page a Campaign column links to each campaign's ad groups.
// scope: the campaign whose ad groups these are ({ key, label, totals, edit }), or null.
// layered: rows grouped under their campaign (Layers); segments: Map of ad group id -> sub-rows
// ({ key, label, values }) shown under it (Segment). Row checkboxes show for everyone; deleting needs onDelete (admins).
export default function AdGroupsTable({ rows, account, byType = [], cols, canEdit, onEditMetric, onEditTotal, onField, onDelete, onSettings,
  sort, onSort, onHideColumn, busyCell, links, scope = null, layered = false, segments = null }) {
  const tips = useHeaderTip();
  const sel = useSelection(rows, onDelete);
  const layers = useClosedGroups();
  const groups = layered ? groupRows(rows, (g) => g.campaignId, (g) => g.campaign || 'Campaign') : null;
  const showCamp = !scope;
  const view = withDerived(sumRows(rows));
  const acct = withDerived(account);
  const scoped = scope ? withDerived(scope.totals) : null;
  const derived = rows.map(withDerived);
  const widths = [FIXED.check, FIXED.dot, FIXED.name, ...(showCamp ? [FIXED.campaign] : []), FIXED.status,
    ...cols.map((k) => (isMetric(k) ? fitW(k, [...derived.map((d) => d[k]), view[k], acct[k], scoped?.[k], ...extraValues(k, groups, segments)], colWidth(k)) : colWidth(k)))];
  const header = (k, label, cls) => headerCell(k, label, cls, { sort, onSort, tips, tip: isMetric(k) });
  const srCols = [['name', 'Ad group'], showCamp && ['campaign', 'Campaign'], ['status', 'Status'], ...cols.map((k) => [k, colLabel(k)])].filter(Boolean);
  const field = (g) => (name, value) => onField('adgroup', g.id, { field: name, value });
  const blank = (key) => [showCamp && <td key="camp" />, <td key="status" />].filter(Boolean);

  const attr = (k, g) => {
    if (k === 'targetCpa') {
      return (
        <span className="slot-val">
          <EditCell value={g.targetCpa == null ? '' : editText('cost', g.targetCpa)} canEdit={canEdit} label="target CPA" pencil
            onSave={(v) => field(g)('targetCpa', v)}>
            {g.targetCpa == null ? DASH : formatValue('cost', g.targetCpa)}
          </EditCell>
        </span>
      );
    }
    if (k === 'groupType') {
      const auto = adGroupType({ groupType: '' }, g.campaignType);
      return (
        <EditSelect value={g.groupType || ''} options={[['', `Automatic (${auto})`], ...AD_GROUP_TYPES]} canEdit={canEdit} label="ad group type"
          onSave={(v) => field(g)('groupType', v)}>
          {adGroupType(g, g.campaignType)}
        </EditSelect>
      );
    }
    return '';
  };

  // One ad group's row, and its segment rows under it.
  const renderRow = (g) => {
    const v = withDerived(g);
    const link = links.adGroup(g);
    const camp = links.campaign(g);
    const segs = segments?.get(g.id);
    return (
      <Fragment key={g.id}>
        <tr data-testid="adgroup-row" data-id={g.id}>
          <td className="sticky c-check"><input type="checkbox" checked={sel.checked.has(g.id)} aria-label="Select row" onChange={() => sel.toggle(g.id)} /></td>
          <td className="sticky c-dot"><StatusDot status={g.status} canEdit={canEdit} label="ad group status" onSave={(s) => field(g)('status', s)} /></td>
          <td className="sticky c-name">
            <div className="ent-cell">
              <span className="ent-name">
                <NameLink value={g.name} href={link.href} canEdit={canEdit} label="ad group name" pencil testId="adgroup-link"
                  onOpen={link.open} onSave={(s) => field(g)('name', s)} />
              </span>
              <button type="button" className="ent-gear" aria-label="Ad group settings" title="Ad group settings" onClick={() => onSettings(g)}><Icon name="settings" /></button>
            </div>
          </td>
          {showCamp && (
            <td className="c-ecamp">
              <NameLink value={g.campaign} href={camp.href} canEdit={canEdit} label="campaign name" onOpen={camp.open}
                onSave={(s) => onField('campaign', g.campaignId, { field: 'name', value: s })} />
            </td>
          )}
          <td className="c-estatus">
            <EntityStatus label={adGroupStatusLabel(g)} value={g.statusLabel || ''} auto={g.status === 'paused' ? 'Paused' : 'Eligible'}
              labels={AD_GROUP_STATUS_LABELS} reasons={g.statusReasons || []} canEdit={canEdit} onField={field(g)} />
          </td>
          {cols.map((k) => (isMetric(k)
            ? <MetricCell key={k} k={k} value={v[k]} canEdit={canEdit && g.adCount > 0} busy={busyCell === `${g.id}:${k}`} onSave={(m, t) => onEditMetric(g, m, t)} />
            : <td key={k} className={`attr c-${k} ${k === 'targetCpa' ? 'num' : ''}`}>{attr(k, g)}</td>))}
        </tr>
        {segs && <SegmentRows list={segs} parent={g.id} cols={cols} nameClass="c-name" fill={blank()} />}
      </Fragment>
    );
  };

  return (
    <GridFrame className="grid ent-grid" widths={widths} frozen={FROZEN} tips={tips} sort={sort} srCols={srCols} selection={sel.selection}
      empty={rows.length === 0} emptyText="No ad groups match your filters" onHideColumn={onHideColumn}
      head={(
        <>
          <th className="sticky c-check"><input type="checkbox" checked={sel.all} onChange={sel.toggleAll} aria-label="Select all" /></th>
          <th className="sticky c-dot" aria-hidden="true"><span className="dot grey" /></th>
          {header('name', 'Ad group', 'sticky c-name')}
          {showCamp && header('campaign', 'Campaign', 'c-ecamp')}
          {header('status', 'Status', 'c-estatus')}
          {cols.map((k) => header(k, colLabel(k), `c-${k} ${k === 'targetCpa' ? 'num' : ''}`))}
        </>
      )}>
      {groups ? groups.map((grp) => (
        <Fragment key={`layer:${grp.id}`}>
          <LayerRow group={grp} kind="Campaign" open={layers.isOpen(grp.id)} onToggle={() => layers.toggle(grp.id)} cols={cols} nameClass="c-name" fill={blank()} />
          {layers.isOpen(grp.id) && grp.rows.map((g) => renderRow(g))}
        </Fragment>
      )) : rows.map((g) => renderRow(g))}
      <TotalRows tips={tips} cols={cols} canEdit={canEdit} nameClass="c-name" fill={blank} onEditTotal={onEditTotal}
        view={{ label: 'Total: All but removed ad groups in your current view', help: 'adgroups-view', totals: sumRows(rows), editable: rows.some((g) => g.adCount > 0) }}
        scope={scope} account={account} byType={byType} />
    </GridFrame>
  );
}
