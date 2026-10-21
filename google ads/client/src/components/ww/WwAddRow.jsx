import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Common.jsx';
import { api } from '../../api.js';
import { CAMPAIGN_TYPES, DAYS, DEVICES, LEVELS, PLACEMENT_TYPES, hourLabel, parseBidAdj } from '../../../../shared/whenwhere.js';
import './ww-add.css';

// Admin: the dialogs behind the table toolbar's + button, a new row for the tab on screen and a
// new campaign. They share the frame of the toolbar's Download dialog. A new row starts without
// figures: the admin types them into the table afterwards.

// The + menu's item, and the dialog's title, per tab.
export const NEW_ROW_LABEL = { devices: 'New device row', when: 'New hour row', where: 'New placement', locations: 'New location' };

// The fields each tab's dialog sends (a server error naming one shows under it).
const FIELDS = {
  devices: ['campaignId', 'device', 'level', 'bidAdj'],
  when: ['campaignId', 'dow', 'hour'],
  where: ['campaignId', 'placement', 'placementType', 'adGroup'],
  locations: ['campaignId', 'location'],
};
const pairs = (list) => list.map((v) => [v, v]);
const DAY_OPTIONS = DAYS.map((d, i) => [String(i), d]);
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => [String(h), hourLabel(h)]);
const STATUS_OPTIONS = [['enabled', 'Enabled'], ['paused', 'Paused'], ['removed', 'Removed']];
const BID_ERROR = 'Enter a percentage from -100 to 900';

// The name the server gives a campaign added without one: the first free "Campaign #n".
function nextName(campaigns) {
  const used = new Set(campaigns.map((c) => c.name));
  let n = 1;
  while (used.has(`Campaign #${n}`)) n++;
  return `Campaign #${n}`;
}

// Scrim, white card, title, the fields, a line for an error that belongs to no field, then
// Cancel / Add. Enter adds (from a select too); Esc or a click on the scrim cancels.
function Dialog({ title, busy, canAdd = true, error, onSubmit, onClose, children }) {
  const card = useRef(null);
  // Focus starts in the box to type in (`first`), else the first field, and goes back where it was.
  useEffect(() => {
    const before = document.activeElement;
    const c = card.current;
    (c?.querySelector('[data-first]') || c?.querySelector('input:not(:disabled), select:not(:disabled)') || c)?.focus();
    return () => { if (before?.isConnected) before.focus?.({ preventScroll: true }); };
  }, []);
  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter' && !e.target.closest('button')) {
      e.preventDefault();
      onSubmit();
    }
  };
  return createPortal(
    <div className="ww-add-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={card} className="ww-add" role="dialog" aria-modal="true" aria-labelledby="ww-add-title" tabIndex={-1} onKeyDown={onKeyDown}
        data-testid="ww-add-dialog">
        <h2 id="ww-add-title" className="ww-add-title">{title}</h2>
        {children}
        {error && <div className="ww-add-error" role="alert">{error}</div>}
        <div className="ww-add-actions">
          <button type="button" className="ww-add-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="ww-add-go" disabled={busy || !canAdd} onClick={onSubmit}>Add</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// A label over its box, and under it the field's error (or a hint).
function Field({ label, error, hint, children }) {
  return (
    <label className="ww-add-field">
      <span className="ww-add-label">{label}</span>
      {children}
      {(error || hint) && <span className={`ww-add-note ${error ? 'error' : ''}`} role={error ? 'alert' : undefined}>{error || hint}</span>}
    </label>
  );
}

function Select({ value, options, onChange, invalid, disabled }) {
  return (
    <span className={`ww-add-box ${invalid ? 'error' : ''}`}>
      <select value={value} disabled={disabled} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <Icon name="arrow_drop_down" />
    </span>
  );
}

function Text({ value, onChange, invalid, maxLength, placeholder, first }) {
  return (
    <span className={`ww-add-box ${invalid ? 'error' : ''}`}>
      <input value={value} maxLength={maxLength} placeholder={placeholder} aria-invalid={invalid || undefined} data-first={first || undefined}
        onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

// Form state with an error per field; editing a field clears its error and the general one.
function useForm(start) {
  const [form, setForm] = useState(start);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false); // a second Enter before the first reply sends nothing
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: '' } : e));
    setError('');
  };
  // Checks, then sends; a refusal shows under its field (when it names one of `fields`) or below them.
  const run = async (problems, fields, send) => {
    if (sending.current) return;
    setErrors(problems);
    setError('');
    if (Object.values(problems).some(Boolean)) return;
    sending.current = true;
    setBusy(true);
    try {
      await send();
    } catch (e) {
      const k = e.data?.field;
      if (k && fields.includes(k)) setErrors({ [k]: e.message });
      else setError(e.message);
      sending.current = false;
      setBusy(false);
    }
  };
  return { form, set, errors, error, busy, run };
}

// A new row of `tab` -> onAdded(id, body). campaignId: the campaign it starts in (any campaign
// can be picked, "Move to campaign" style).
export function WwAddRow({ tab, campaigns, campaignId, onClose, onAdded }) {
  const { form: f, set, errors, error, busy, run } = useForm({
    campaignId: campaignId || campaigns[0]?.id || '',
    device: DEVICES[0], level: LEVELS[0], bidAdj: '',
    dow: '1', hour: '9',
    placement: '', placementType: PLACEMENT_TYPES[0], adGroup: '',
    location: '',
  });
  const none = !campaigns.length;
  const submit = () => {
    const problems = {};
    if (!f.campaignId) problems.campaignId = 'Pick a campaign';
    if (tab === 'devices' && parseBidAdj(f.bidAdj) === undefined) problems.bidAdj = BID_ERROR;
    if (tab === 'where' && !f.placement.trim()) problems.placement = 'Enter a placement';
    if (tab === 'locations' && !f.location.trim()) problems.location = 'Enter a location';
    const body = { tab, campaignId: f.campaignId };
    if (tab === 'devices') Object.assign(body, { device: f.device, level: f.level, bidAdj: parseBidAdj(f.bidAdj) ?? null });
    if (tab === 'when') Object.assign(body, { dow: Number(f.dow), hour: Number(f.hour) });
    if (tab === 'where') Object.assign(body, { placement: f.placement.trim(), placementType: f.placementType, adGroup: f.adGroup.trim() });
    if (tab === 'locations') Object.assign(body, { location: f.location.trim() });
    run(problems, FIELDS[tab], async () => {
      const { id } = await api.wwAddRow(body);
      onAdded(String(id), body);
    });
  };
  return (
    <Dialog title={NEW_ROW_LABEL[tab]} busy={busy} canAdd={!none} error={error} onSubmit={submit} onClose={onClose}>
      <Field label="Campaign" error={errors.campaignId || (none ? 'Add a campaign first' : '')}>
        <Select value={f.campaignId} onChange={set('campaignId')} invalid={!!errors.campaignId || none} disabled={none}
          options={none ? [['', 'No campaigns']] : campaigns.map((c) => [c.id, c.name])} />
      </Field>
      {tab === 'devices' && (
        <>
          <div className="ww-add-pair">
            <Field label="Device" error={errors.device}>
              <Select value={f.device} options={pairs(DEVICES)} onChange={set('device')} invalid={!!errors.device} />
            </Field>
            <Field label="Level" error={errors.level}>
              <Select value={f.level} options={pairs(LEVELS)} onChange={set('level')} invalid={!!errors.level} />
            </Field>
          </div>
          <Field label="Bid adj." error={errors.bidAdj} hint="Optional. From -100% to +900%.">
            <span className={`ww-add-box ww-add-pctbox ${errors.bidAdj ? 'error' : ''}`}>
              <input value={f.bidAdj} inputMode="numeric" aria-invalid={!!errors.bidAdj || undefined}
                onChange={(e) => { if (/^[-+]?\d{0,4}%?$/.test(e.target.value)) set('bidAdj')(e.target.value); }} />
              <span className="ww-add-pct">%</span>
            </span>
          </Field>
        </>
      )}
      {tab === 'when' && (
        <div className="ww-add-pair">
          <Field label="Day" error={errors.dow}>
            <Select value={f.dow} options={DAY_OPTIONS} onChange={set('dow')} invalid={!!errors.dow} />
          </Field>
          <Field label="Hour" error={errors.hour}>
            <Select value={f.hour} options={HOUR_OPTIONS} onChange={set('hour')} invalid={!!errors.hour} />
          </Field>
        </div>
      )}
      {tab === 'where' && (
        <>
          <Field label="Placement" error={errors.placement}>
            <Text value={f.placement} onChange={set('placement')} invalid={!!errors.placement} maxLength={120} first />
          </Field>
          <Field label="Type" error={errors.placementType}>
            <Select value={f.placementType} options={pairs(PLACEMENT_TYPES)} onChange={set('placementType')} invalid={!!errors.placementType} />
          </Field>
          <Field label="Ad group" error={errors.adGroup} hint="Optional">
            <Text value={f.adGroup} onChange={set('adGroup')} invalid={!!errors.adGroup} maxLength={100} />
          </Field>
        </>
      )}
      {tab === 'locations' && (
        <Field label="Location" error={errors.location}>
          <Text value={f.location} onChange={set('location')} invalid={!!errors.location} maxLength={100} first />
        </Field>
      )}
    </Dialog>
  );
}

// A new campaign (no rows yet) -> onAdded(id). type: the one it starts as (the view's).
export function WwAddCampaign({ campaigns, type, onClose, onAdded }) {
  const { form: f, set, errors, error, busy, run } = useForm({
    name: '', type: CAMPAIGN_TYPES.includes(type) ? type : CAMPAIGN_TYPES[0], status: 'enabled',
  });
  // Left empty, the server names it.
  const submit = () => run({}, ['name', 'type', 'status'], async () => {
    const { id } = await api.wwAddCampaign({ name: f.name.trim(), type: f.type, status: f.status });
    onAdded(String(id));
  });
  return (
    <Dialog title="New campaign" busy={busy} error={error} onSubmit={submit} onClose={onClose}>
      <Field label="Name" error={errors.name}>
        <Text value={f.name} onChange={set('name')} invalid={!!errors.name} maxLength={100} placeholder={nextName(campaigns)} first />
      </Field>
      <div className="ww-add-pair">
        <Field label="Type" error={errors.type}>
          <Select value={f.type} options={pairs(CAMPAIGN_TYPES)} onChange={set('type')} invalid={!!errors.type} />
        </Field>
        <Field label="Status" error={errors.status}>
          <Select value={f.status} options={STATUS_OPTIONS} onChange={set('status')} invalid={!!errors.status} />
        </Field>
      </div>
    </Dialog>
  );
}
