// Ad previews: the edit page's right column (one format at a time) and the full-screen
// "Preview ads" view (every format, mobile or desktop). Formats live in formats.jsx.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Dropdown, MenuItem } from '../Common.jsx';
import { BRAND } from '../../../../shared/brand.js';
import {
  buildSlots, blankSlot, MobileFormat, DesktopFormat,
  DISPLAY_ORDER, GMAIL_CLOSED, GMAIL_OPEN, YOUTUBE, VIDEO, DESK_DISPLAY,
} from './formats.jsx';
import './preview.css';

export { buildSlots } from './formats.jsx';

const DISCLAIMER = `These previews are examples and don't include every format your ad can show in. You're responsible for your ads' content and for making sure your assets meet ${BRAND.name} policies and applicable laws, on their own and in combination.`;

const TAB_DISPLAY = { id: 'display', label: 'Display', icon: 'web', fill: true };
const TAB_GMAIL = { id: 'gmail', label: 'Gmail', icon: 'mail' };
const TAB_YOUTUBE = { id: 'youtube', label: 'YouTube', icon: 'smart_display', fill: true };
const PANEL_TABS = [TAB_DISPLAY, TAB_GMAIL, TAB_YOUTUBE];
const MODAL_TABS = [{ id: 'all', label: 'All', icon: 'filter_none' }, ...PANEL_TABS];
const PANEL_SETS = {
  display: ['native', 'big', 'inter', 'dark', 'hero', 'banner'],
  gmail: ['gpill', 'gimage', 'gopen'],
  youtube: ['ywatch', 'yhome'],
};

// True for `ms` after `key` changes (and after mount): the short "loading" spinner.
function useFlash(key, ms) {
  const [done, setDone] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => setDone(key), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return done !== key;
}

function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="pv-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={`pv-tab${value === t.id ? ' on' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <Icon name={t.icon} fill={t.fill} className={`pv-tab-ic t-${t.id}`} />
          <span className="pv-tab-l">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export function PreviewPanel({ creative, onOpenAll, onShare }) {
  const [tab, setTab] = useState('display');
  const [idx, setIdx] = useState(0);
  const loading = useFlash(tab, 400);
  const slot = useMemo(() => buildSlots(creative, 0), [creative]);
  const list = PANEL_SETS[tab];
  const cur = Math.min(idx, list.length - 1);
  const pick = (t) => {
    if (t === tab) return;
    setTab(t);
    setIdx(0);
  };

  return (
    <section className="pv-panel" aria-label="Preview">
      <div className="pv-head">
        <h2>Preview</h2>
        <span className="spacer" />
        <button type="button" className="pv-link" onClick={() => onShare?.()}>Share</button>
        <button type="button" className="pv-link" onClick={() => onOpenAll?.()}>Preview ads</button>
      </div>
      <Tabs tabs={PANEL_TABS} value={tab} onChange={pick} label="Placement" />
      <div className="pv-stage">
        <button type="button" className="pv-nav" aria-label="Previous format" disabled={cur === 0} onClick={() => setIdx(cur - 1)}>
          <Icon name="chevron_left" />
        </button>
        <MobileFormat id={list[cur]} s={slot(cur)} loading={loading} />
        <button type="button" className="pv-nav" aria-label="Next format" disabled={cur === list.length - 1} onClick={() => setIdx(cur + 1)}>
          <Icon name="chevron_right" />
        </button>
      </div>
      <div className="pv-dots">
        {list.map((id, k) => (
          <button
            key={id}
            type="button"
            className={k === cur ? 'on' : ''}
            aria-label={`Format ${k + 1} of ${list.length}`}
            aria-current={k === cur || undefined}
            onClick={() => setIdx(k)}
          />
        ))}
      </div>
      <p className="pv-note">{DISCLAIMER}</p>
    </section>
  );
}

// Content index offsets so each placement gets its own mix of headlines / images.
const OFF_GMAIL = DISPLAY_ORDER.length;
const OFF_YT = OFF_GMAIL + 3;
const OFF_VIDEO = OFF_YT + 2;

export function PreviewModal({ creative, onClose, onShare }) {
  const [tab, setTab] = useState('all');
  const [device, setDevice] = useState('mobile');
  const [mail, setMail] = useState('closed');
  const [seed, setSeed] = useState(0);
  const loading = useFlash(`${tab}|${device}|${seed}`, 600);
  const slot = useMemo(() => buildSlots(creative, seed), [creative, seed]);
  const hasVideo = (creative?.videos || []).some((v) => v?.url);
  const rootRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Esc closes; the page behind doesn't scroll; focus goes back where it was.
  useEffect(() => {
    const back = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      // An open menu in here (Mobile / Desktop) takes this Esc; the next one closes the preview.
      if (e.defaultPrevented || rootRef.current?.querySelector('.popover')) return;
      e.stopPropagation();
      onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      if (back && typeof back.focus === 'function') back.focus();
    };
  }, []);

  const desk = device === 'desktop';
  const show = (key) => tab === 'all' || tab === key;

  const mobile = (ids, off, dim) => (
    <div className="pvm-grid">
      {ids.map((id, k) => (
        <MobileFormat key={`${id}-${k}`} id={id} s={dim ? blankSlot(slot(off + k)) : slot(off + k)} loading={loading} dim={dim} />
      ))}
    </div>
  );
  const desktop = (ids, off, dim) => (
    <div className="pvm-dgrid">
      {ids.map((id, k) => (
        <DesktopFormat key={`${id}-${k}`} id={id} s={dim ? blankSlot(slot(off + k)) : slot(off + k)} loading={loading} dim={dim} />
      ))}
    </div>
  );
  const grid = desk ? desktop : mobile;

  const mailIds = desk ? [mail === 'open' ? 'gmailDOpen' : 'gmailD'] : mail === 'open' ? GMAIL_OPEN : GMAIL_CLOSED;
  const ytIds = desk ? ['ytD'] : YOUTUBE;
  const videoIds = desk ? ['ytVideoD'] : VIDEO;

  return createPortal(
    <div ref={rootRef} className="pvm" role="dialog" aria-modal="true" aria-label="Preview ads">
      <header className="pvm-head">
        <button ref={closeRef} type="button" className="pvm-x" aria-label="Close preview" onClick={() => onClose?.()}>
          <Icon name="close" />
        </button>
        <h2>Preview</h2>
      </header>
      <div className="pvm-scroll">
        <div className="pvm-tools">
          <Dropdown
            align="right"
            trigger={(open, toggle) => (
              <button type="button" className={`pvm-dev${open ? ' open' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
                <Icon name={desk ? 'computer' : 'smartphone'} />
                <span>{desk ? 'Desktop' : 'Mobile'}</span>
                <Icon name="arrow_drop_down" className="pvm-caret" />
              </button>
            )}
          >
            {(close) => (
              <div className="menu" role="menu">
                <MenuItem icon="smartphone" selected={!desk} onClick={() => { setDevice('mobile'); close(); }}>Mobile</MenuItem>
                <MenuItem icon="computer" selected={desk} onClick={() => { setDevice('desktop'); close(); }}>Desktop</MenuItem>
              </div>
            )}
          </Dropdown>
          <span className="pvm-sep" />
          <button
            type="button"
            className="pvm-refresh"
            aria-label="Show a different mix of your assets"
            title="Refresh"
            onClick={() => setSeed((n) => n + 1 + Math.floor(Math.random() * 97))}
          >
            <Icon name="refresh" />
          </button>
          <button type="button" className="pv-link" onClick={() => onShare?.()}>Share</button>
        </div>
        <Tabs tabs={MODAL_TABS} value={tab} onChange={setTab} label="Placement" />
        <div className="pvm-body">
          {show('display') && grid(desk ? DESK_DISPLAY : DISPLAY_ORDER, 0)}
          {show('gmail') && (
            <section className="pvm-sec" aria-label="Gmail">
              <div className="pvm-sub" role="tablist" aria-label="Gmail view">
                {[['closed', 'Closed'], ['open', 'Open']].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={mail === id} className={mail === id ? 'on' : ''} onClick={() => setMail(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {grid(mailIds, OFF_GMAIL)}
            </section>
          )}
          {show('youtube') && (
            <section className="pvm-sec yt" aria-label="YouTube">
              {grid(hasVideo ? [...ytIds, ...videoIds] : ytIds, OFF_YT)}
              {!hasVideo && (
                <>
                  <h3 className="pvm-locked">Add more assets to unlock these formats</h3>
                  {grid(videoIds, OFF_VIDEO, true)}
                </>
              )}
            </section>
          )}
        </div>
      </div>
      <footer className="pvm-foot">{DISCLAIMER}</footer>
    </div>,
    document.body,
  );
}
