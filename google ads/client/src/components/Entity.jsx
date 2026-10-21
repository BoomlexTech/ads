import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Dropdown, MenuItem } from './Common.jsx';
import { EditSelect } from './Editable.jsx';
import { EditCell, StatusDot } from './Grid.jsx';
import { AdvisorIcon } from './Advisor.jsx';
import { useNotify } from '../account.js';
import { DASH, editText, formatValue } from '../../../shared/metrics.js';
import {
  CAMPAIGN_TYPES, CAMPAIGN_STATUS_LABELS, AD_GROUP_STATUS_LABELS, AD_GROUP_TYPES,
  campaignStatusLabel, adGroupStatusLabel, adGroupType, parseScore, formatScore,
} from '../../../shared/entities.js';

// Campaign / ad group pieces of the pages: the status bar over a campaign's or ad group's
// pages, the title chips that switch between them, the pickers, the settings dialog and
// the no-conversions card on the Campaigns page.

export const TYPE_ICON = { Search: 'pageview', Video: 'videocam', Display: 'web', 'Demand Gen': 'featured_video' };
export const perDay = (cents) => (cents == null ? DASH : `${formatValue('cost', cents)}/day`);
const autoLabel = (e) => (e.status === 'paused' ? 'Paused' : 'Eligible');
const moneyText = (cents) => (cents == null ? '' : editText('cost', cents));
const scoreText = (n) => (n == null ? '' : String(n));
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Optimization score typed by an admin: checked here first so a typo gets a clear message.
function useScoreSave(save) {
  const notify = useNotify();
  return (v) => (parseScore(v) === undefined ? notify('Enter a score from 0 to 100') : save(v));
}

function BarItem({ k, children }) {
  return <span className="eb-item">{k && <span className="eb-k">{k}:</span>}{children}</span>;
}

export function CampaignBar({ c, canEdit, onField, onSettings }) {
  const set = (field) => (value) => onField('campaign', c.id, { field, value });
  const saveScore = useScoreSave(set('optimizationScore'));
  return (
    <div className="ent-bar" data-testid="campaign-bar">
      <BarItem><StatusDot status={c.status} canEdit={canEdit} label="campaign status" word onSave={set('status')} /></BarItem>
      <BarItem k="Status">
        <EditSelect value={c.statusLabel || ''} options={[['', `Automatic (${autoLabel(c)})`], ...CAMPAIGN_STATUS_LABELS]} canEdit={canEdit}
          label="campaign status label" onSave={set('statusLabel')}>
          <span className="dashed">{campaignStatusLabel(c)}</span>
        </EditSelect>
      </BarItem>
      <BarItem k="Type"><EditSelect value={c.type} options={CAMPAIGN_TYPES} canEdit={canEdit} label="campaign type" onSave={set('type')} /></BarItem>
      <BarItem k="Budget">
        <EditCell value={moneyText(c.budget)} canEdit={canEdit} label="budget" onSave={set('budget')}>
          <span className={c.budget == null ? '' : 'dashed'}>{perDay(c.budget)}</span>
        </EditCell>
      </BarItem>
      <span className="eb-gap" />
      <BarItem k="Optimization score">
        <EditCell value={scoreText(c.optimizationScore)} canEdit={canEdit} label="optimization score" onSave={saveScore}>{formatScore(c.optimizationScore)}</EditCell>
      </BarItem>
      <span className="eb-sim" aria-disabled="true"><Icon name="hide_image" /><span>Simulate campaign changes</span></span>
      <button type="button" className="eb-settings" onClick={onSettings} data-testid="bar-settings"><Icon name="settings" />Campaign settings</button>
    </div>
  );
}

export function AdGroupBar({ g, campaign, canEdit, onField, onSettings }) {
  const set = (field) => (value) => onField('adgroup', g.id, { field, value });
  const auto = adGroupType({ groupType: '' }, campaign?.type);
  return (
    <div className="ent-bar" data-testid="adgroup-bar">
      <BarItem><StatusDot status={g.status} canEdit={canEdit} label="ad group status" word onSave={set('status')} /></BarItem>
      <BarItem k="Status">
        <EditSelect value={g.statusLabel || ''} options={[['', `Automatic (${autoLabel(g)})`], ...AD_GROUP_STATUS_LABELS]} canEdit={canEdit}
          label="ad group status label" onSave={set('statusLabel')}>
          <span className="dashed">{adGroupStatusLabel(g)}</span>
        </EditSelect>
      </BarItem>
      <BarItem k="Type">
        <EditSelect value={g.groupType || ''} options={[['', `Automatic (${auto})`], ...AD_GROUP_TYPES]} canEdit={canEdit} label="ad group type" onSave={set('groupType')}>
          {adGroupType(g, campaign?.type)}
        </EditSelect>
      </BarItem>
      <button type="button" className="eb-settings" onClick={onSettings} data-testid="bar-settings"><Icon name="settings" />Ad group settings</button>
    </div>
  );
}

// "Campaign / <name>" or "Ad group / <name>" next to the page title; opens a picker.
export function ScopeChip({ small, icon, name, children }) {
  return (
    <Dropdown panelClass="camp-pop" trigger={(open, toggle) => (
      <button type="button" className={`scope-chip ${open ? 'open' : ''}`} onClick={toggle} aria-expanded={open} data-testid="scope-chip">
        <span className="vs-small">{small}</span>
        <span className="sc-main">{icon && <Icon name={icon} className="sc-ic" />}<span className="sc-name">{name}</span></span>
      </button>
    )}>
      {children}
    </Dropdown>
  );
}

const statusIcon = (s) => (s === 'paused'
  ? <Icon name="pause_circle" fill className="st-off" />
  : <Icon name="circle" fill className="st-on" />);

export function CampaignPanel({ campaigns, campaignId, onPick }) {
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState(false);
  const query = q.trim().toLowerCase();
  const list = campaigns
    .filter((c) => !query || c.name.toLowerCase().includes(query))
    .sort((a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name));
  return (
    <div className="camp-panel" role="dialog" aria-label="Select a campaign">
      <div className="cp-filter">
        <span className="filter-ic" aria-hidden="true"><Icon name="filter_alt" /><span className="badge">1</span></span>
        <span className="chip">Campaign status: Enabled, Paused</span>
        <span className="add-filter">Add filter</span>
      </div>
      <div className="cp-search">
        <label>
          <Icon name="search" />
          <input autoFocus placeholder={`Search ${campaigns.length} campaigns`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search campaigns" />
        </label>
        <button type="button" className="cp-sort" onClick={() => setDesc((d) => !d)} aria-label={`Sort ${desc ? 'Z to A' : 'A to Z'}`}>
          <Icon name="swap_vert" />Alphabetical<Icon name="arrow_drop_down" />
        </button>
      </div>
      <div className="cp-list">
        {!query && <MenuItem selected={!campaignId} onClick={() => onPick('')}>View all {campaigns.length} campaigns in this view</MenuItem>}
        {list.map((c) => (
          <MenuItem key={c.id} selected={c.id === campaignId} onClick={() => onPick(c.id)}>
            <span className="cp-st">{statusIcon(c.status)}</span>
            <Icon name={TYPE_ICON[c.type] || 'campaign'} fill className="cp-type" />
            {c.name}
          </MenuItem>
        ))}
        {query && !list.length && <div className="cp-empty">No campaigns match “{q.trim()}”</div>}
      </div>
    </div>
  );
}

// The ad groups of one campaign; '' picks all of them (the campaign's ads page).
export function AdGroupPanel({ campaign, groups, adGroupId, onPick }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = groups.filter((g) => !query || g.name.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="camp-panel" role="dialog" aria-label="Select an ad group">
      <div className="cp-search">
        <label>
          <Icon name="search" />
          <input autoFocus placeholder={`Search ${groups.length} ad groups`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search ad groups" />
        </label>
      </div>
      <div className="cp-list">
        {!query && <MenuItem selected={!adGroupId} onClick={() => onPick('')}>All ad groups in {campaign?.name || 'this campaign'}</MenuItem>}
        {list.map((g) => (
          <MenuItem key={g.id} selected={g.id === adGroupId} onClick={() => onPick(g.id)}>
            <span className="cp-st">{statusIcon(g.status)}</span>
            {g.name}
          </MenuItem>
        ))}
        {query && !list.length && <div className="cp-empty">No ad groups match “{q.trim()}”</div>}
      </div>
    </div>
  );
}

// Every setting of a campaign / ad group in one form, the same for everyone (Save does nothing for
// read-only users). onSave([[field, text], ...]) resolves true when done.
export function EntitySettings({ kind, entity: e, campaign, canEdit, onSave, onClose }) {
  const isCamp = kind === 'campaign';
  const notify = useNotify();
  const [initial] = useState(() => (isCamp
    ? { name: e.name, status: e.status === 'paused' ? 'paused' : 'enabled', statusLabel: e.statusLabel || '', statusReasons: (e.statusReasons || []).join(', '),
      type: e.type, budget: moneyText(e.budget), optimizationScore: scoreText(e.optimizationScore) }
    : { name: e.name, status: e.status === 'paused' ? 'paused' : 'enabled', statusLabel: e.statusLabel || '', statusReasons: (e.statusReasons || []).join(', '),
      groupType: e.groupType || '', targetCpa: moneyText(e.targetCpa) }));
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  // Where focus was before the dialog (the gear, the status bar button): read while rendering,
  // since the name field's autoFocus takes focus before effects run. It goes back there on close.
  const [opener] = useState(() => document.activeElement);
  useEffect(() => () => {
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus();
  }, [opener]);
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === 'Escape') onClose();
      else if (ev.key === 'Tab' && box.current) {
        // Tab and Shift+Tab go round the dialog's own fields and buttons.
        const els = [...box.current.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);
        if (!els.length) return;
        const at = document.activeElement;
        const first = els[0];
        const last = els[els.length - 1];
        let to = null;
        if (!box.current.contains(at)) to = ev.shiftKey ? last : first;
        else if (ev.shiftKey && at === first) to = last;
        else if (!ev.shiftKey && at === last) to = first;
        if (to) { ev.preventDefault(); to.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));
  const auto = autoLabel({ status: form.status });
  const fields = [
    ['name', isCamp ? 'Campaign name' : 'Ad group name', 'text'],
    ['status', 'Status', [['enabled', 'Enabled'], ['paused', 'Paused']]],
    ['statusLabel', 'Status shown', [['', `Automatic (${auto})`], ...(isCamp ? CAMPAIGN_STATUS_LABELS : AD_GROUP_STATUS_LABELS)]],
    ['statusReasons', 'Status reasons', 'text', 'Separate reasons with commas'],
    ...(isCamp
      ? [['type', 'Campaign type', CAMPAIGN_TYPES], ['budget', 'Average daily budget', 'money', 'For example 40.00'],
        ['optimizationScore', 'Optimization score (%)', 'text', 'From 0 to 100, or empty for a dash']]
      : [['groupType', 'Ad group type', [['', `Automatic (${adGroupType({ groupType: '' }, campaign?.type)})`], ...AD_GROUP_TYPES]],
        ['targetCpa', 'Target CPA', 'money', 'Empty for none']]),
  ];
  const save = async () => {
    if (!canEdit) return;
    if (isCamp && parseScore(form.optimizationScore) === undefined) { notify('Enter a score from 0 to 100'); return; }
    const changed = Object.keys(form).filter((k) => form[k] !== initial[k]);
    if (!changed.length) { onClose(); return; }
    setBusy(true);
    const ok = await onSave(changed.map((k) => [k, form[k]]));
    setBusy(false);
    if (ok) onClose();
  };
  const title = isCamp ? 'Campaign settings' : 'Ad group settings';
  return createPortal(
    <>
      <div className="es-scrim" onClick={onClose} />
      <div className="es-dialog" role="dialog" aria-modal="true" aria-label={title} data-testid="entity-settings" ref={box}>
        <div className="es-head">
          <div>
            <h2>{title}</h2>
            <div className="es-sub">{e.name}</div>
          </div>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        <form className="es-body" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
          {fields.map(([k, label, type, hint]) => (
            <label className="es-field" key={k}>
              <span className="es-label">{label}</span>
              {Array.isArray(type)
                ? (
                  <select value={form[k]} onChange={set(k)} aria-label={label}>
                    {type.map((o) => {
                      const [v, l] = Array.isArray(o) ? o : [o, o];
                      return <option key={v} value={v}>{l}</option>;
                    })}
                  </select>
                )
                : (
                  <span className={`es-input ${type === 'money' ? 'money' : ''}`}>
                    {type === 'money' && <span className="es-cur">$</span>}
                    <input value={form[k]} onChange={set(k)} aria-label={label} maxLength={k === 'statusReasons' ? 300 : 100}
                      inputMode={type === 'money' ? 'decimal' : undefined} autoFocus={k === 'name'} />
                  </span>
                )}
              {hint && <small className="es-hint">{hint}</small>}
            </label>
          ))}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
        <div className="es-foot">
          <button type="button" className="btn-text" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="settings-save">Save</button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// "Your campaign … had no conversions in the selected date range" over the campaigns table. It
// states only what the numbers show: there is no learning-phase data, so it makes no such claim.
export function LearningCard({ campaign, onDismiss, onOptimize }) {
  return (
    <div className="learn-card" data-testid="learning-card">
      <span className="lc-ic"><AdvisorIcon size={22} /></span>
      <span className="lc-text">Your campaign {campaign.name} had no conversions in the selected date range.</span>
      <button type="button" className="btn-text" onClick={onDismiss}>Dismiss</button>
      <button type="button" className="btn-primary" onClick={onOptimize}>Optimize campaign</button>
    </div>
  );
}
