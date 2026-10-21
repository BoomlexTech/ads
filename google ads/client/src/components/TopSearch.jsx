import { useEffect, useRef, useState } from 'react';
import { Icon } from './Common.jsx';
import { AdvisorIcon } from './Advisor.jsx';
import { TYPE_ICON } from './Entity.jsx';
import { searchArticles } from './helpArticles.js';
import { openFeedback } from './Feedback.jsx';
import './shell-more.css';

const PROMPTS = [
  'What are my top performing campaigns?',
  'Help me diagnose an underperforming campaign.',
  'Create text assets from my best keywords.',
];
const PAGES = [
  { label: 'Campaigns', path: 'Campaigns › Campaigns', page: 'campaigns' },
  { label: 'Ad groups', path: 'Campaigns › Ad groups', page: 'adgroups' },
  { label: 'Ads', path: 'Campaigns › Ads', page: 'ads' },
  { label: 'When and where ads showed', path: 'Insights and reports › When and where ads showed', page: 'wwDevices' },
  { label: 'Change history', path: 'Campaigns › Change history', page: 'history', adminOnly: true },
  { label: 'Feedback', path: 'Campaigns › Feedback', page: 'feedback', adminOnly: true },
  { label: 'Billing summary', path: 'Billing › Summary', page: 'billing-summary' },
  { label: 'Billing activity', path: 'Billing › Billing activity', page: 'billing-activity' },
  { label: 'Billing documents', path: 'Billing › Documents', page: 'billing-documents' },
  { label: 'Payment methods', path: 'Billing › Payment methods', page: 'billing-methods' },
  { label: 'Promotions', path: 'Billing › Promotions', page: 'billing-promotions' },
  { label: 'Billing transfers', path: 'Billing › Billing transfers', page: 'billing-transfers' },
  { label: 'Billing settings', path: 'Billing › Settings', page: 'billing-settings' },
];
const RECENT_KEY = 'ap.recentCampaigns';
const RECENT_MAX = 5;

// Campaigns opened lately, most recent first (remembered in this browser).
function recentIds() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function rememberCampaign(id) {
  if (!id) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentIds().filter((x) => x !== id)].slice(0, 20)));
  } catch { /* storage off */ }
}
// The empty dropdown's list: all but removed campaigns, the recently opened ones first, then the newest.
function recentCampaigns(campaigns) {
  const list = (campaigns || []).filter((c) => c.status !== 'removed');
  const rank = new Map(recentIds().map((id, i) => [id, i]));
  const at = new Map(list.map((c, i) => [c.id, i]));
  return [...list].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || at.get(b.id) - at.get(a.id))
    .slice(0, RECENT_MAX);
}

// Top-bar search: empty, it lists recent campaigns and Ask Advisor prompts; typing matches
// pages, campaigns (a campaign opens its ad groups) and help articles, and can ask the advisor.
// Press "g" then "t" anywhere to open it.
export default function TopSearch({ campaigns, canEdit, onAsk, onAdvisor, onPage, onCampaign }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    let last = '';
    const onKey = (e) => {
      const t = e.target;
      if (t.closest?.('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (last === 'g' && k === 't') { e.preventDefault(); inputRef.current?.focus(); }
      last = k;
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // The list (and its scrim) closes on a click outside it, and when focus moves outside it, for
  // example with Tab past its last item.
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', out);
    document.addEventListener('focusin', out);
    return () => {
      document.removeEventListener('mousedown', out);
      document.removeEventListener('focusin', out);
    };
  }, [open]);
  // Arrow keys keep the highlighted item in view in a long list.
  useEffect(() => {
    if (open) boxRef.current?.querySelector('.sd-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const term = q.trim().toLowerCase();
  const items = [];
  if (!term) {
    recentCampaigns(campaigns).forEach((c) => items.push({ kind: 'recent', id: c.id, label: c.name, sub: `${c.type} campaign`, icon: TYPE_ICON[c.type], run: () => onCampaign(c.id) }));
    PROMPTS.forEach((p) => items.push({ kind: 'ask', label: p, run: () => onAsk(p) }));
    items.push({ kind: 'ask', label: 'Ask something else', run: () => onAdvisor() });
  } else {
    PAGES.filter((p) => (!p.adminOnly || canEdit) && p.label.toLowerCase().includes(term))
      .forEach((p) => items.push({ kind: 'page', label: p.label, sub: p.path, run: () => onPage(p.page) }));
    (campaigns || []).filter((c) => c.name.toLowerCase().includes(term)).slice(0, 5)
      .forEach((c) => items.push({ kind: 'campaign', id: c.id, label: c.name, sub: `${c.type} campaign`, icon: TYPE_ICON[c.type], run: () => onCampaign(c.id) }));
    searchArticles(term).slice(0, 2).forEach((a) => items.push({
      kind: 'help', id: a.id, label: a.title, sub: 'Quick help',
      run: () => window.dispatchEvent(new CustomEvent('app:help', { detail: { topic: a.id } })),
    }));
    items.push({ kind: 'ask', label: q.trim(), run: () => onAsk(q.trim()) });
  }
  const close = () => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
  };
  const choose = (it) => {
    close();
    it.run();
  };
  const groups = [
    ['Recent campaigns (all but removed)', items.filter((i) => i.kind === 'recent')],
    ['Pages', items.filter((i) => i.kind === 'page')],
    ['Campaigns', items.filter((i) => i.kind === 'campaign')],
    ['Help', items.filter((i) => i.kind === 'help')],
    ['Ask Advisor', items.filter((i) => i.kind === 'ask')],
  ];
  const iconOf = (it) => {
    if (it.kind === 'ask') return <span className="sd-ic"><AdvisorIcon /></span>;
    if (it.kind === 'page' || it.kind === 'help') return <Icon name={it.kind === 'help' ? 'help' : 'description'} className="sd-ic" />;
    return <Icon name={it.icon || 'campaign'} fill className="sd-ic sd-type" />;
  };
  let n = -1;

  return (
    <>
      {open && <div className="search-scrim" aria-hidden="true" />}
      {/* Esc closes the list from the box or any item in it (focus leaves the box). */}
      <div className={`topsearch ${open ? 'open' : ''}`} ref={boxRef}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || !open || e.nativeEvent.isComposing) return;
          e.preventDefault();
          setOpen(false);
          if (boxRef.current?.contains(document.activeElement)) document.activeElement.blur();
        }}>
        <form className="searchbox" role="search" onSubmit={(e) => { e.preventDefault(); if (items[active]) choose(items[active]); }}>
          <Icon name="search" />
          <input ref={inputRef} value={q} data-testid="top-search" aria-label="Search or ask a question"
            placeholder={'"What are my biggest opportunities for growth right now?"'}
            onFocus={() => { setOpen(true); setActive(0); }}
            onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!open) { setOpen(true); setActive(0); } else setActive((a) => Math.min(items.length - 1, a + 1));
              }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            }} />
        </form>
        {open && (
          <div className="search-drop" role="listbox" data-testid="search-drop">
            {groups.map(([title, list]) => list.length > 0 && (
              <div key={title} data-group={title}>
                <div className="sd-title">{title}</div>
                {list.map((it) => {
                  n += 1;
                  const i = n;
                  return (
                    <button key={it.kind + (it.id || it.label)} type="button" role="option" aria-selected={i === active}
                      className={`sd-item ${i === active ? 'active' : ''}`} data-kind={it.kind} onMouseEnter={() => setActive(i)} onClick={() => choose(it)}>
                      {iconOf(it)}
                      <span className="sd-text"><span>{it.label}</span>{it.sub && <small>{it.sub}</small>}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="sd-foot">
              <button type="button" className="sd-feedback" data-testid="search-feedback" onClick={() => { close(); openFeedback('Search'); }}>Send feedback</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
