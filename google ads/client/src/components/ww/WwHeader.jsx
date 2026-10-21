import { useEffect, useRef, useState } from 'react';
import { Icon, Dropdown, ToolBtn, MenuItem } from '../Common.jsx';
import { EditSelect, EditText } from '../Editable.jsx';
import DatePicker, { rangeLabel } from '../DatePicker.jsx';
import { addDays, daysBetween, parseISO } from '../../../../shared/dates.js';
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, WW_TABS, WW_TITLE } from '../../../../shared/whenwhere.js';
import './ww-header.css';

// Header of "When and where ads showed": the view and campaign pickers, the status filters, the
// sticky title bar with the dates, and the tabs. Sizes follow the reference screenshots.

// ---------------------------------------------------------------- icons
// Campaign-type tiles: a grey rounded square with a white glyph, drawn on the 26 × 20 grid of the
// reference's device pixels and shown at 20.8 × 16.
const TILE = '#8a8a8a';
const GLYPHS = {
  Search: (
    <>
      <circle cx="12.3" cy="9.2" r="4.3" fill="none" stroke="#fff" strokeWidth="2.8" />
      <path d="M15.4 12.3 19.5 16.4" stroke="#fff" strokeWidth="2.6" />
    </>
  ),
  Display: (
    <>
      <rect x="3" y="6" width="20" height="11.6" fill="#fff" />
      <path d="M15.95 6v11.6M3 11.6h12.95" stroke={TILE} strokeWidth=".9" />
    </>
  ),
  Video: <path d="M5.5 5h10v10h-10zM15 10l5.6-5.4v10.8z" fill="#fff" />,
  'Demand Gen': (
    <>
      <rect x="11.45" y="5.75" width="9.1" height="9.8" fill="none" stroke="#fff" strokeWidth="1.5" />
      <path d="M12.6 13.6 14.4 11l1.4 1.6 1.4-1.8 2.2 2.8z" fill="#fff" />
      <circle cx="8" cy="7.5" r="5.2" fill={TILE} />
      <circle cx="8" cy="7.5" r="3.7" fill="#fff" />
      <path d="M6.9 5.9v3.2l2.5-1.6z" fill={TILE} />
    </>
  ),
};
// In the campaign list the Search tile has a text bar beside the magnifier, whose handle cuts
// the tile's corner.
const LIST_SEARCH = (
  <>
    <rect x="3" y="5" width="6.3" height="12.3" fill="#fff" />
    <circle cx="17.3" cy="10.45" r="4.35" fill="none" stroke="#fff" strokeWidth="2.8" />
    <path d="M20.4 13.55 27.5 20.65" stroke="#fff" strokeWidth="2.8" />
  </>
);

function TypeTile({ type, list = false }) {
  const glyph = list && type === 'Search' ? LIST_SEARCH : GLYPHS[type];
  return (
    <svg className="ww-tile" viewBox="0 0 26 20" width="20.8" height="16" aria-hidden="true">
      <rect width="26" height="20" rx="2.6" fill={TILE} />
      {glyph}
    </svg>
  );
}

// Outlined house with a solid door (the font's "home" glyphs have an outlined door).
function HomeIcon({ size = 19 }) {
  return (
    <svg className="ww-home" viewBox="0 0 20 20" width={size} height={size} fill="#5f6368" aria-hidden="true">
      <path fillRule="evenodd" d="M10 2 2.5 7.6V18h15V7.6L10 2Zm5.8 14.3H4.2V8.45L10 4.1l5.8 4.35v7.85Z" />
      <rect x="7.1" y="11" width="5.8" height="5.5" />
    </svg>
  );
}

// Speech bubble with "!" (not in the app's icon font).
function FeedbackIcon() {
  return (
    <svg className="ww-feedback-ic" viewBox="0 0 26 26" width="20.8" height="20.8" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd"
        d="M2.35.75h21.4a2 2 0 0 1 2 2V18.3a2 2 0 0 1-2 2H6L.35 25.9V2.75a2 2 0 0 1 2-2ZM2.85 3v15H22.9V3ZM11.85 5.75h2.5v4.6h-2.5Zm0 7.25h2.5v2.6h-2.5Z" />
    </svg>
  );
}

// Campaign status: paused is a grey disc with two bars, removed a grey disc with a cross, enabled
// a green disc with a tick.
const STATUS_NAME = { enabled: 'Enabled', paused: 'Paused', removed: 'Removed' };
function StatusIcon({ status }) {
  const st = STATUS_NAME[status] ? status : 'enabled';
  return (
    <svg className="ww-status" viewBox="0 0 15 15" width="12" height="12" role="img" aria-label={STATUS_NAME[st]}>
      <circle cx="7.5" cy="7.5" r="7.5" fill={st === 'enabled' ? '#188038' : '#757575'} />
      {st === 'paused' && <path d="M5.2 4.5h1.6v6H5.2zM8.2 4.5h1.6v6H8.2z" fill="#fff" />}
      {st === 'removed' && <path d="M5 5l5 5M10 5l-5 5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />}
      {st === 'enabled' && <path d="M4.3 7.7 6.5 9.9l4.2-4.4" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

// ---------------------------------------------------------------- views
// Views: every campaign, or the campaigns of one type.
const VIEWS = [
  { type: '', label: 'All campaigns' },
  { type: 'Search', label: 'Search campaigns' },
  { type: 'Display', label: 'Display campaigns' },
  { type: 'Video', label: 'Video campaigns' },
  { type: 'Demand Gen', label: 'Demand Gen campaigns' },
];
const viewOf = (type) => VIEWS.find((v) => v.type === type) || VIEWS[0];
// The picker's label of a view ('' = all campaigns).
export const wwViewLabel = (type) => viewOf(type).label;
// The view's filters are the two status chips of the filter bar.
const VIEW_FILTERS = 'View (2 filters)';

function ViewLabel({ v }) {
  return <>{v.type ? <TypeTile type={v.type} /> : <HomeIcon />}<span>{v.label}</span></>;
}

function ViewPanel({ view, onPick }) {
  return (
    <div className="ww-vpanel" role="dialog" aria-label="Select view">
      <div className="ww-vp-head">
        <span className="ww-vp-title">Select view</span>
        <button type="button" className="toolbtn ww-vp-feedback"><FeedbackIcon /><span>Feedback</span></button>
      </div>
      <div className="ww-vp-list">
        <div className="ww-vp-label">Campaign types</div>
        {VIEWS.map((v) => (
          <button key={v.type || 'all'} type="button" className={`ww-vp-item ${view === v.type ? 'selected' : ''}`} onClick={() => onPick(v.type)}
            data-testid={`ww-view-${v.type || 'all'}`}>
            <span className="ww-ic-slot">{v.type ? <TypeTile type={v.type} /> : <HomeIcon size={21} />}</span>
            {v.label}
          </button>
        ))}
      </div>
      {/* Saved views aren't available: the button looks like the reference's and does nothing. */}
      <button type="button" className="ww-vp-foot"><Icon name="add_circle" fill />Create view</button>
    </div>
  );
}

const STATUS_CHOICES = CAMPAIGN_STATUSES.map((s) => [s, STATUS_NAME[s]]);

// One campaign of the picker. For an admin a double-click renames it (or, on its icons, changes
// its status or type), so a single click waits a moment to see whether a second one follows
// before picking the campaign. onEdit(field, value): field 'name' | 'status' | 'type'.
// onDelete (admin): the trash can shown on hover.
function CampaignRow({ c, selected, canEdit, onPick, onEdit, onDelete }) {
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = () => {
    if (!canEdit) { onPick(); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(onPick, 280);
  };
  return (
    <div role="option" aria-selected={selected} tabIndex={0} className={`ww-cp-row ${selected ? 'selected' : ''}`} data-id={c.id}
      onClick={click} onDoubleClickCapture={() => clearTimeout(timer.current)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(); }
      }}>
      <span className="ww-cp-st">
        <EditSelect value={c.status} options={STATUS_CHOICES} canEdit={canEdit} label="campaign status" onSave={(v) => onEdit('status', v)}>
          <StatusIcon status={c.status} />
        </EditSelect>
      </span>
      <span className="ww-cp-type">
        <EditSelect value={c.type} options={CAMPAIGN_TYPES} canEdit={canEdit} label="campaign type" onSave={(v) => onEdit('type', v)}>
          <TypeTile type={c.type} list />
        </EditSelect>
      </span>
      <span className="ww-cp-name">
        <EditText value={c.name} canEdit={canEdit} label="campaign name" maxLength={100}
          onSave={(v) => { if (v.trim()) onEdit('name', v.trim()); }}>{c.name}</EditText>
      </span>
      {onDelete && (
        <button type="button" className="ww-cp-del" aria-label={`Delete ${c.name}`} title="Delete campaign" data-testid="ww-campaign-del"
          // Its own click only (not a pick of the row); a double-click doesn't open the page text editor.
          onClick={(e) => { e.stopPropagation(); onDelete(); }} onDoubleClick={(e) => e.stopPropagation()}>
          <Icon name="delete" />
        </button>
      )}
    </div>
  );
}

// A Campaign status filter value as its chips read (the filter bar's and the campaign panel's).
const STATUS_TEXT = { all: 'All', enabled: 'Enabled', enabledPaused: 'Enabled, Paused' };

// campaignStatus: the filter bar's Campaign status, which decides the campaigns listed.
// Admin: onNew() opens the New campaign dialog, onDelete(campaign) deletes one (the page asks first).
function CampaignPanel({ campaigns, campaignId, campaignStatus, canEdit, onPick, onEdit, onNew, onDelete }) {
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState(false);
  const query = q.trim().toLowerCase();
  const list = campaigns
    .filter((c) => !query || c.name.toLowerCase().includes(query))
    .sort((a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name));
  return (
    <div className="ww-cpanel" role="dialog" aria-label="Select a campaign">
      {/* The view's own filter, as the filter bar sets it; it can't be changed here. */}
      <div className="ww-cp-filter">
        <span className="ww-cp-funnel" aria-hidden="true"><Icon name="filter_alt" /><span className="badge">1</span></span>
        <span className="ww-cp-chip">Campaign status: {STATUS_TEXT[campaignStatus] || STATUS_TEXT.enabledPaused}</span>
        <span className="ww-cp-add">Add filter</span>
      </div>
      <div className="ww-cp-search">
        <label>
          <Icon name="search" />
          <input autoFocus placeholder={`Search ${campaigns.length} campaigns`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search campaigns" />
        </label>
        <Dropdown className="ww-cp-sortdd" align="right" panelClass="ww-sort-pop" trigger={(open, toggle) => (
          <button type="button" className="ww-cp-sort" onClick={toggle} aria-expanded={open} aria-label={`Sort: alphabetical, ${desc ? 'Z to A' : 'A to Z'}`}>
            <Icon name="swap_vert" />Alphabetical<Icon name="arrow_drop_down" className="ww-caret" />
          </button>
        )}>
          {(close) => (
            <div className="menu ww-hd-menu">
              <MenuItem selected={!desc} onClick={() => { close(); setDesc(false); }}>A–Z</MenuItem>
              <MenuItem selected={desc} onClick={() => { close(); setDesc(true); }}>Z–A</MenuItem>
            </div>
          )}
        </Dropdown>
      </div>
      <div className="ww-cp-list" role="listbox" aria-label="Campaigns">
        {!query && (
          <div role="option" aria-selected={!campaignId} tabIndex={0} className={`ww-cp-row ww-cp-all ${campaignId ? '' : 'selected'}`}
            onClick={() => onPick('')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(''); } }}>
            <span>View all <span data-metric="live">{campaigns.length}</span> campaigns in this view</span>
          </div>
        )}
        {list.map((c) => (
          <CampaignRow key={c.id} c={c} selected={c.id === campaignId} canEdit={canEdit} onPick={() => onPick(c.id)} onEdit={(f, v) => onEdit(c.id, f, v)}
            onDelete={canEdit && onDelete ? () => onDelete(c) : undefined} />
        ))}
        {query && !list.length && <div className="ww-cp-empty">No campaigns match “{q.trim()}”</div>}
      </div>
      {canEdit && onNew && (
        <button type="button" className="ww-cp-foot" onClick={onNew} data-testid="ww-new-campaign"><Icon name="add" />New campaign</button>
      )}
    </div>
  );
}

// Row 1: the view picker and the campaign picker. Admin: onNewCampaign(), onDeleteCampaign(campaign).
export function WwViewBar({ view, onView, campaigns, campaignId, onCampaign, canEdit, onEditCampaign, campaignStatus, onNewCampaign, onDeleteCampaign }) {
  const v = viewOf(view);
  const picked = campaignId ? campaigns.find((c) => c.id === campaignId) : null;
  return (
    <div className="viewbar ww-viewbar">
      <Dropdown panelClass="ww-vp-pop" trigger={(open, toggle) => (
        <button type="button" className="viewsel active-under ww-viewsel" onClick={toggle} aria-expanded={open} data-testid="ww-view-picker">
          <span className="vs-small">{VIEW_FILTERS}</span>
          <span className="vs-main"><ViewLabel v={v} /></span>
          <Icon name="arrow_drop_down" className="vs-caret" />
        </button>
      )}>
        {(close) => <ViewPanel view={v.type} onPick={(t) => { close(); onView(t); }} />}
      </Dropdown>
      <Dropdown panelClass="camp-pop" trigger={(open, toggle) => (
        <button type="button" className="viewsel ww-campsel" onClick={toggle} aria-expanded={open} data-testid="ww-campaign-picker">
          <span className="vs-small">Campaigns (<span data-metric="live">{campaigns.length}</span>)</span>
          {/* The picked campaign's name is data: it is renamed in the panel, so the page text editor
              leaves it alone. "Select a campaign" is plain text the admin text editor can change. */}
          <span className="vs-main">{picked ? <span className="ww-campsel-name" data-text-editor="">{picked.name}</span> : 'Select a campaign'}</span>
          <Icon name="arrow_drop_down" className="vs-caret" />
        </button>
      )}>
        {(close) => (
          <CampaignPanel campaigns={campaigns} campaignId={campaignId} campaignStatus={campaignStatus} canEdit={canEdit}
            onPick={(id) => { close(); onCampaign(id); }} onEdit={onEditCampaign}
            onNew={onNewCampaign && (() => { close(); onNewCampaign(); })} onDelete={onDeleteCampaign} />
        )}
      </Dropdown>
    </div>
  );
}

// ---------------------------------------------------------------- filters
const STATUS_OPTIONS = ['all', 'enabled', 'enabledPaused'];
const FILTER_LABEL = { campaign: 'Campaign status', adGroup: 'Ad group status' };
// Fields "Add filter" lists; none of them can be filtered on yet.
const MORE_FILTERS = ['Bid strategy name', 'Bid strategy type', 'Campaign', 'Campaign label', 'Campaign name', 'Campaign type',
  'Campaign status', 'Ad group', 'Ad group name', 'Ad group status', 'Labels'];

// Round close button with a dark "Close" label under it on hover.
function CloseButton({ onClick }) {
  return (
    <button type="button" className="ww-close" onClick={onClick} aria-label="Close">
      <Icon name="close" />
      <span className="ww-hd-tip" aria-hidden="true">Close</span>
    </button>
  );
}

function StatusChip({ k, value, onPick }) {
  return (
    <Dropdown panelClass="ww-sf-pop" trigger={(open, toggle) => (
      <button type="button" className="chip ww-chip" onClick={toggle} aria-expanded={open} data-testid={`ww-chip-${k}`}>
        {FILTER_LABEL[k]}: {STATUS_TEXT[value] || STATUS_TEXT.enabledPaused}
      </button>
    )}>
      {(close) => (
        <div className="ww-sf" role="dialog" aria-label={FILTER_LABEL[k]}>
          <div className="ww-sf-head">
            <span className="ww-sf-title">{FILTER_LABEL[k]}</span>
            <CloseButton onClick={close} />
          </div>
          <div role="listbox" aria-label={FILTER_LABEL[k]}>
            {STATUS_OPTIONS.map((o) => (
              <button key={o} type="button" role="option" aria-selected={o === value} className={`ww-sf-opt ${o === value ? 'selected' : ''}`}
                onClick={() => { close(); if (o !== value) onPick(o); }}>
                {STATUS_TEXT[o]}
              </button>
            ))}
          </div>
        </div>
      )}
    </Dropdown>
  );
}

// Row 2: the status filters of the view. onFilter(key, value): key 'campaign' | 'adGroup',
// value 'all' | 'enabled' | 'enabledPaused'.
export function WwFilterBar({ filters, onFilter }) {
  return (
    <div className="filterbar ww-filterbar">
      <span className="fb-label">Filters</span>
      {Object.keys(FILTER_LABEL).map((k) => <StatusChip key={k} k={k} value={filters[k]} onPick={(v) => onFilter(k, v)} />)}
      <Dropdown panelClass="ww-af-pop" trigger={(open, toggle) => (
        <button type="button" className="add-filter" onClick={toggle} aria-expanded={open} data-testid="ww-add-filter">Add filter</button>
      )}>
        {(close) => (
          <div className="ww-af-menu" role="menu">
            {MORE_FILTERS.map((f) => <button key={f} type="button" role="menuitem" className="ww-mi" onClick={close}>{f}</button>)}
          </div>
        )}
      </Dropdown>
      <span className="spacer" />
      {/* Saving the view isn't available: the button is shown as in the reference and does nothing. */}
      <span className="ww-save">
        <ToolBtn icon="save" label="Save" className="save-btn" aria-label="Save workspace" />
        <span className="ww-save-tip" aria-hidden="true">Save workspace</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- title bar
// Row 3 (sticky). condensed: after the title, a small View card that scrolls back to the top.
// split (Matched locations): title over the tabs on the left, the dates centred beside both.
// "Oct 9 – 15, 2026" within one month, "Sep 16 – Oct 15, 2026" across months, years when they differ.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function wwRangeText(from, to) {
  const a = parseISO(from);
  const b = parseISO(to);
  const day = (d) => `${MON[d.getMonth()]} ${d.getDate()}`;
  if (from === to) return `${day(a)}, ${a.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) return `${day(a)}, ${a.getFullYear()} – ${day(b)}, ${b.getFullYear()}`;
  if (a.getMonth() === b.getMonth()) return `${day(a)} – ${b.getDate()}, ${b.getFullYear()}`;
  return `${day(a)} – ${day(b)}, ${b.getFullYear()}`;
}

export function WwTitleBar({ condensed, viewLabel, onTop, range, today, dataStart, presetList, onRange, split, tabs }) {
  const label = rangeLabel(range, presetList);
  const len = daysBetween(range.from, range.to) + 1;
  const all = presetList.find((p) => p.key === 'all');
  const allTime = !!all && all.from === range.from && all.to === range.to;
  const shift = (dir) => {
    const from = addDays(range.from, dir * len);
    const to = addDays(range.to, dir * len);
    if (to > today) return;
    onRange({ from, to });
  };
  const v = VIEWS.find((x) => x.label === viewLabel) || { type: '', label: viewLabel };
  const title = (
    <div className="ww-tb-title">
      <h1>{WW_TITLE}</h1>
      {condensed && (
        <button type="button" className="viewsel mini ww-mini" onClick={onTop} data-testid="ww-mini-view">
          <span className="vs-small">{VIEW_FILTERS}</span>
          <span className="vs-main"><ViewLabel v={v} /></span>
        </button>
      )}
    </div>
  );
  return (
    <div className={`titlebar ww-titlebar ${condensed ? 'condensed' : ''} ${split ? 'split' : ''}`}>
      {split ? <div className="ww-tb-stack">{title}{tabs}</div> : title}
      <span className="spacer" />
      <div className="ww-tb-dates">
        <span className="preset-label" data-testid="ww-preset-label">{label}</span>
        <DatePicker range={range} today={today} dataStart={dataStart} onChange={onRange} format={wwRangeText} />
        <button type="button" className="iconbtn arrow ww-prev" onClick={() => shift(-1)} disabled={allTime} aria-label="Previous period">
          <Icon name="chevron_left" />
        </button>
        <button type="button" className="iconbtn arrow" onClick={() => shift(1)} disabled={allTime || addDays(range.to, len) > today} aria-label="Next period">
          <Icon name="chevron_right" />
        </button>
        {/* The reference keeps offering the last 30 days, even when they're shown. */}
        <button type="button" className="link-btn" onClick={() => onRange(presetList.find((p) => p.key === 'last30'))}>
          Show last 30 days
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tabs
// The four reports. Arrow keys move between the tabs, Enter or Space opens one.
export function WwTabs({ tab, onTab }) {
  const refs = useRef([]);
  const onKeyDown = (e, i) => {
    const n = WW_TABS.length;
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    refs.current[to]?.focus();
  };
  return (
    <div className="ww-tabs" role="tablist" aria-label="When and where reports">
      {WW_TABS.map((t, i) => {
        const on = t.key === tab;
        return (
          <button key={t.key} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
            className={`ww-tab ${on ? 'active' : ''}`} onClick={() => onTab(t.key)} onKeyDown={(e) => onKeyDown(e, i)} data-testid={`ww-tab-${t.key}`}>
            <span className="ww-tab-label">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
