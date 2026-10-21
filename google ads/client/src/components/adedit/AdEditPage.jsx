import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api.js';
import { useAccount, useNotify } from '../../account.js';
import { BRAND, tabTitle } from '../../../../shared/brand.js';
import {
  LIMITS, STRENGTH_LEVELS, CHECK_KEYS, CTA_OPTIONS, PRICE_PREFIXES, AFTER_SAVE, ASSET_GUIDES, FILE_TYPES, MAX_BYTES,
  normalizeCreative, normText, validateCreative, adStrength, isYouTube, videoRefOk, aspectLabel, fmtBytes, capLabel, testUrls,
} from '../../../../shared/creative.js';
import { Icon, Dropdown, MenuItem, openHelp } from '../Common.jsx';
import { EditText, EditSelect } from '../Editable.jsx';
import { PreviewPanel, PreviewModal } from './Preview.jsx';
import AssetDialog, { VideoDialog, TextDialog, refOf, useModal, withoutAsset } from './AssetDialog.jsx';
import './edit.css';

const DISCARD = 'Discard unsaved changes?';
const NOT_FOUND = 'This ad couldn’t be found. It may have been deleted.';
const NAME_MAX = 80;
const AFTER_LABEL = { pending: 'Send for review (status: Pending · Under review)', keep: 'Keep the current status' };
// Lists on the page -> the text ideas dialog's kind.
const TEXT_KIND = { headlines: 'headline', longHeadline: 'longHeadline', descriptions: 'description' };

// Share of the ring that is filled, and its colour, for each strength level.
const RING = {
  Incomplete: [0, ''], Poor: [0.25, '#d93025'], Average: [0.5, '#f9ab00'], Good: [0.85, '#1a73e8'], Excellent: [1, '#1e8e3e'],
};
const CHECK_LABEL = { images: 'Images', videos: 'Videos', headlines: 'Headlines', descriptions: 'Descriptions' };
const CHECK_TEXT = { done: 'Done', partial: 'Half', empty: 'Empty' };
const EMPTY_CHECKS = { images: 'empty', videos: 'empty', headlines: 'empty', descriptions: 'empty' };

// Guidelines in the (?) cards of Images, Logos and Videos: the shapes that work best and the
// limits the upload really checks (shared/creative.js).
const pixels = ([w, h]) => `${w} × ${h} pixels`;
function ImageGuide({ kind }) {
  const logo = kind === 'logo';
  return (
    <div className="ae-guide" data-testid={`${kind}-guide`}>
      <div className="ae-guide-title">{logo ? 'Logo' : 'Image'} guidelines</div>
      {ASSET_GUIDES[kind].map((g) => (
        <div className="ae-guide-shape" key={g.shape}>
          <div>{g.shape}{g.recommended ? ' (recommended)' : ''}</div>
          <ul>
            <li>Recommended size: {pixels(g.best)}</li>
            <li>Smallest that looks sharp: {pixels(g.least)}</li>
            <li>Largest file: {capLabel(MAX_BYTES[kind])}</li>
          </ul>
        </div>
      ))}
      <p>
        {FILE_TYPES[kind]} files, up to {logo ? LIMITS.logos : LIMITS.images} per ad. Some layouts crop {logo ? 'logos' : 'images'} to
        fit, so keep the important part near the centre.
      </p>
    </div>
  );
}
function VideoGuide() {
  return (
    <div className="ae-guide" data-testid="video-guide">
      <div className="ae-guide-title">Video guidelines</div>
      <ul>
        <li>Up to {LIMITS.videos} videos per ad</li>
        <li>A YouTube link, or an upload: {FILE_TYPES.video}, up to {capLabel(MAX_BYTES.video)}</li>
        <li>Landscape, square and portrait videos of around 30 seconds work best</li>
      </ul>
    </div>
  );
}

// What each (?) says, and the Quick help topic its "Learn more" opens.
const HELP = {
  finalUrl: { text: 'The page people land on after they click your ad.', topic: 'final-url' },
  businessName: { text: 'Your business or brand name. It can appear in some ad layouts.', topic: 'business-name' },
  images: { text: 'Pictures your ad can show. A mix of shapes helps it fit more spaces.', topic: 'images', guide: <ImageGuide kind="image" /> },
  logos: { text: 'Logos help people recognise your business, so they should be clear even when shown small.', topic: 'logos', guide: <ImageGuide kind="logo" /> },
  videos: { text: 'Videos let your ad show in video spaces as well as image ones.', topic: 'videos', guide: <VideoGuide /> },
  headlines: { text: `Short opening lines for your ad, up to ${LIMITS.headline} characters each.`, topic: 'headlines' },
  longHeadline: { text: `A longer opening line used in bigger layouts, up to ${LIMITS.longHeadline} characters.`, topic: 'long-headline' },
  descriptions: { text: `Extra detail that follows your headline, up to ${LIMITS.description} characters each.`, topic: 'descriptions' },
  strength: { text: 'A quick rating of how well your assets cover the places where this ad can show.', topic: 'ad-strength' },
  trackingTemplate: { text: 'The address your tracking service uses to record clicks. Put {lpurl} where the landing page address goes.', topic: 'url-options' },
  finalUrlSuffix: { text: 'Parameters added to the end of your landing page address, for example to tell your analytics where a visit came from.', topic: 'url-options' },
  customParams: { text: 'Your own {_name} placeholders. Each one is replaced with its value wherever it appears in the tracking template, final URL suffix or final URL.', topic: 'url-options' },
};

// Additional format options: settings saved with the ad. [key, label, what it allows, help topic]
const FORMAT_OPTIONS = [
  ['assetEnhancements', 'Allow asset enhancements',
    'Lets layouts make small changes so your assets fit more ad spaces, like cropping an image or shortening a line of text.', 'asset-enhancements'],
  ['autoVideo', 'Allow auto-generated video',
    'Saved with the ad as a preference. AI Pilots doesn’t make videos from your assets; add your own video to fill video spaces.', 'auto-video'],
  ['nativeFormats', 'Allow native formats',
    'Lets your ad take on the look of the site or app it shows on, using your text and images. This can help it show in more places.', 'native-formats'],
];

// Lengths and comparisons use the text as the server stores it (spaces collapsed).
const chars = (s) => [...normText(s)].length;
const lines = (t) => String(t || '').split('\n').map(normText).filter(Boolean);
// Fields inside the two collapsible sections, so a save error there can open them.
const isFormatKey = (k) => /^options\.(cta|promoText|pricePrefix|price|mainColor|accentColor|assetEnhancements|autoVideo|nativeFormats)\b/.test(k);
const isUrlKey = (k) => /^options\.(trackingTemplate|finalUrlSuffix|customParams|useMobileUrl|mobileUrl)\b/.test(k);
const isAdminKey = (k) => k.startsWith('admin.');
const HEX = /^#[0-9a-f]{6}$/i;

// Box i of list k was removed: drop its key (and the list's own), and move later boxes' keys up one.
function dropIndex(map, k, i) {
  let changed = false;
  const out = {};
  Object.entries(map).forEach(([key, v]) => {
    const rest = key.startsWith(`${k}.`) ? key.slice(k.length + 1) : null;
    const n = rest != null && /^\d+$/.test(rest) ? Number(rest) : -1;
    if (key === k || n === i) changed = true;
    else if (n > i) { out[`${k}.${n - 1}`] = v; changed = true; }
    else out[key] = v;
  });
  return changed ? out : map;
}

// List k was replaced as a whole: drop its own key and every box's.
function dropList(map, k) {
  const out = Object.fromEntries(Object.entries(map).filter(([key]) => key !== k && !key.startsWith(`${k}.`)));
  return Object.keys(out).length === Object.keys(map).length ? map : out;
}

// Per-browser memory (the page works the same when storage is blocked or empty).
function readStore(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function writeStore(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: remembered until the page reloads.
  }
}

const feedbackAbout = (about) => window.dispatchEvent(new CustomEvent('app:feedback', { detail: { about } }));

// ---------- small pieces ----------

function LearnMore({ topic, onClick }) {
  return (
    <button type="button" className="ae-learn" data-help={topic} onClick={() => { onClick?.(); openHelp(topic); }}>Learn more</button>
  );
}

// (?) next to a heading or inside a box: a card with what the field is for, any guidelines,
// and "Learn more" for its Quick help topic.
function Help({ help, label, align = 'left' }) {
  return (
    <Dropdown className="ae-hp" align={align} trigger={(open, toggle) => (
      <button type="button" className={`ae-help ${open ? 'open' : ''}`} aria-label={`About ${label.toLowerCase()}`} aria-expanded={open} onClick={toggle}>
        <Icon name="help" />
      </button>
    )}>
      {(close) => (
        <div className="ae-hp-card" role="note" aria-label={label}>
          {help.text && <p className="ae-hp-text">{help.text}</p>}
          {help.guide}
          {help.topic && <LearnMore topic={help.topic} onClick={close} />}
        </div>
      )}
    </Dropdown>
  );
}

function Head({ label, help, sub, right }) {
  return (
    <>
      <div className="ae-label">
        {label}{help && <Help help={help} label={label} />}
        {right && <span className="ae-label-right">{right}</span>}
      </div>
      {sub && <div className="ae-sub">{sub}</div>}
    </>
  );
}

function StrengthRing({ level }) {
  const [pct, color] = RING[level] || RING.Incomplete;
  const r = 15;
  const len = 2 * Math.PI * r;
  return (
    <svg className="ae-ring" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#fff" strokeWidth="5" />
      <circle cx="18" cy="18" r="17.6" fill="none" stroke="#9aa0a6" strokeWidth=".8" />
      <circle cx="18" cy="18" r="12.4" fill="none" stroke="#9aa0a6" strokeWidth=".8" />
      {pct > 0 && (
        <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${len * pct} ${len}`} transform="rotate(-90 18 18)" />
      )}
    </svg>
  );
}

function CheckMark({ state }) {
  if (state === 'done') {
    return (
      <svg className="ae-ck" width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r="8.5" fill="#1a73e8" />
        <path d="M5 9.2l2.7 2.7L13.1 6.5" fill="none" stroke="#fff" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg className="ae-ck" width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="8" fill="#fff" stroke={state === 'partial' ? '#1a73e8' : '#9aa0a6'} strokeWidth="1" />
      {state === 'partial' && <path d="M1 9a8 8 0 0 0 16 0Z" fill="#1a73e8" />}
    </svg>
  );
}

// Ad strength strip at the top of the card: tips (stepped with the arrows), ring, checklist.
function Banner({ c, canEdit, loading, failed, onAdmin, onSettings }) {
  const s = loading || !c ? null : adStrength(c);
  const tips = s ? s.tips : ['Add a final URL'];
  const [idx, setIdx] = useState(0);
  const at = Math.min(idx, tips.length - 1);
  const level = s ? s.level : 'Incomplete';
  const checklist = s ? s.checklist : EMPTY_CHECKS;
  const admin = canEdit && !!s;
  // Nothing to rate when the ad couldn't be loaded: keep the empty strip.
  if (failed) return <div className="ae-banner" data-testid="strength-bar" />;
  // Editing a tip copies the current tips into the admin list with that one changed; empty removes it.
  const saveTip = (v) => {
    const next = [...tips];
    const t = normText(v);
    if (t) next[at] = t;
    else next.splice(at, 1);
    onAdmin({ tips: next });
  };
  // The arrows wrap around, so both stay active.
  const step = (d) => setIdx((at + d + tips.length) % tips.length);
  return (
    <div className="ae-banner" data-testid="strength-bar">
      <div className={`ae-tipbox ${tips.length > 1 ? '' : 'solo'}`}>
        {tips.length > 1 && (
          <>
            <button type="button" className="iconbtn ae-step" aria-label="Previous tip" onClick={() => step(-1)}>
              <Icon name="chevron_left" />
            </button>
            <button type="button" className="iconbtn ae-step" aria-label="Next tip" onClick={() => step(1)}>
              <Icon name="chevron_right" />
            </button>
          </>
        )}
        <Icon name="info" className="ae-info" />
        <span className="ae-tip" data-testid="strength-tip">
          <EditText value={tips[at]} canEdit={admin} maxLength={LIMITS.tip} label="tip" onSave={saveTip} />
        </span>
      </div>
      <div className="ae-strength">
        <StrengthRing level={level} />
        <div>
          <div className="ae-st-label">Ad strength<Help help={HELP.strength} label="Ad strength" /></div>
          <div className="ae-st-level" data-testid="strength-level">
            <EditSelect value={c?.admin?.strength || ''} canEdit={admin} label="ad strength"
              options={[['', `Automatic (${s?.autoLevel || 'Incomplete'})`], ...STRENGTH_LEVELS]}
              onSave={(v) => onAdmin({ strength: v })}>
              {level}
            </EditSelect>
          </div>
        </div>
      </div>
      <div className="ae-checks">
        {CHECK_KEYS.map((k) => (
          <span key={k} className="ae-check" title={`${CHECK_LABEL[k]}: ${CHECK_TEXT[checklist[k]] || ''}`} data-state={checklist[k]}>
            <CheckMark state={checklist[k]} />{CHECK_LABEL[k]}
          </span>
        ))}
      </div>
      {admin && (
        <button type="button" className="iconbtn ae-settings-btn" aria-label="Page settings" title="Page settings" data-testid="page-settings-btn" onClick={onSettings}>
          <Icon name="tune" />
        </button>
      )}
    </div>
  );
}

// One text box with its error line (or a hint such as an example) and "n / max" counter
// underneath. `adorn` sits inside the box on the right (a help button).
function TextBox({ k, value, onChange, onBlur, max, err, label, placeholder, onRemove, removeLabel, type = 'text', hardMax, adorn, hint }) {
  const n = chars(value);
  const over = !!max && n > max;
  return (
    <div className={`ae-item ${onRemove ? 'removable' : ''} ${adorn ? 'adorned' : ''}`} data-field={k}>
      <div className="ae-box">
        <input className={`ae-input ${err ? 'err' : ''}`} type={type} value={value} placeholder={placeholder}
          aria-label={label} aria-invalid={err ? true : undefined} maxLength={hardMax}
          onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
        {adorn && <span className="ae-adorn">{adorn}</span>}
        {onRemove && (
          <button type="button" className="ae-remove" aria-label={removeLabel} title={removeLabel} onClick={onRemove}>
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="ae-under">
        <span className="ae-err">{err}</span>
        {!err && hint && <span className="ae-hint">{hint}</span>}
        {max ? <span className={`ae-count ${over ? 'over' : ''}`}>{n} / {max}</span> : null}
      </div>
    </div>
  );
}

function Select({ k, value, options, onChange, label }) {
  const opts = options.map((o) => (Array.isArray(o) ? o : [o, o]));
  if (!opts.some(([v]) => v === value)) opts.push([value, value]);
  return (
    <div className="ae-select" data-field={k}>
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <Icon name="arrow_drop_down" />
    </div>
  );
}

function ColorField({ k, label, value, onChange, onBlur, err }) {
  return (
    <div className="ae-item" data-field={k}>
      <div className="ae-color">
        <input className={`ae-input ${err ? 'err' : ''}`} value={value} placeholder="#1A73E8" aria-label={label}
          aria-invalid={err ? true : undefined} maxLength={7}
          onChange={(e) => onChange(e.target.value.trim())} onBlur={onBlur} />
        <input type="color" className={`ae-swatch ${HEX.test(value) ? '' : 'none'}`} value={HEX.test(value) ? value.toLowerCase() : '#ffffff'}
          aria-label={`Pick ${label.toLowerCase()}`} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </div>
      <div className="ae-under"><span className="ae-err">{err}</span></div>
    </div>
  );
}

function Expander({ id, label, open, onToggle, small, children }) {
  return (
    <div className={`ae-exp ${open ? 'open' : ''}`}>
      <button type="button" className={`ae-exp-head ${small ? 'small' : ''}`} aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <Icon name={open ? 'expand_less' : 'expand_more'} />{label}
      </button>
      {open && <div className="ae-exp-body" id={id}>{children}</div>}
    </div>
  );
}

const thumbW = (im) => (im.w && im.h ? Math.max(16, Math.min(80, Math.round((30 * im.w) / im.h))) : 40);

// Selected images (natural shape, 30px tall; first 6 then a "+N" tile) or square logos.
function Thumbs({ list, square, onMore }) {
  const extra = square ? 0 : Math.max(0, list.length - 6);
  const shown = square ? list : list.slice(0, 6);
  return (
    <div className={`ae-thumbs ${square ? 'square' : ''}`} data-testid={square ? 'logo-thumbs' : 'image-thumbs'}>
      {shown.map((im, i) => (
        <img key={`${im.url}-${i}`} src={im.url} alt={im.name || ''} style={square ? undefined : { width: thumbW(im) }} />
      ))}
      {extra > 0 && (
        <button type="button" className="ae-more-tile" onClick={onMore} aria-label={`${extra} more images`} title={`${extra} more`}>
          <img src={list[6].url} alt="" />
          <span>+{extra}</span>
        </button>
      )}
    </div>
  );
}

const sgW = (a) => (a.w && a.h ? Math.max(80, Math.min(260, Math.round((134 * a.w) / a.h))) : 180);

// Library sources the suggestions card shows (in this order), with the caption for each.
const SUGGEST_FROM = {
  suggested: ['lightbulb', 'Suggested'],
  website: ['web', 'From a website'],
  generated: ['add_photo_alternate', 'Generated'],
};
const SUGGEST_ORDER = Object.keys(SUGGEST_FROM);
const HIDE_CARD_KEY = `${BRAND.slug}.hideSuggestedImages`;
const HIDDEN_IMAGES_KEY = `${BRAND.slug}.hiddenSuggestedImages`;

// An enlarged suggested image, with Select.
function ImageZoom({ a, caption, onSelect, onClose }) {
  const box = useRef(null);
  useModal(box, onClose);
  const meta = [caption, aspectLabel(a.w, a.h), a.w && a.h ? `${a.w} × ${a.h}` : '', fmtBytes(a.bytes)].filter(Boolean).join(' · ');
  return createPortal(
    <div className="ae-dlg-root">
      <div className="adlg-scrim" onClick={onClose} />
      <figure className="ae-zoom" ref={box} role="dialog" aria-modal="true" aria-label={a.name || 'Suggested image'} tabIndex={-1} data-testid="image-zoom">
        <button type="button" className="iconbtn ae-zoom-x" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        <img src={a.url} alt={a.name || ''} />
        <figcaption>
          <span className="ae-zoom-meta"><b>{a.name || 'Image'}</b><span>{meta}</span></span>
          <button type="button" className="btn-primary" onClick={onSelect}>Select</button>
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}

// "Suggested images": library images marked as suggestions, saved from websites or made with an
// image tool, that aren't in the ad yet, each captioned with where it came from. Hover shows
// Enlarge, a menu and Select; the row scrolls with arrows. The whole card and single images can
// be hidden (remembered in this browser) and shown again.
function Suggestions({ images, onAdd, onMore }) {
  const [phase, setPhase] = useState('loading');
  const [items, setItems] = useState([]);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [cardHidden, setCardHidden] = useState(() => readStore(HIDE_CARD_KEY, false) === true);
  const [hiddenIds, setHiddenIds] = useState(() => {
    const v = readStore(HIDDEN_IMAGES_KEY, []);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  });
  const [menu, setMenu] = useState(null); // one image's menu: { a, top, right } inside the card
  const [zoom, setZoom] = useState(null);
  const track = useRef(null);
  const cardRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    let live = true;
    api.assets('image').then((r) => r.assets || []).catch(() => []).then((list) => {
      if (!live) return;
      const rank = (a) => SUGGEST_ORDER.indexOf(a.source);
      setItems(list.filter((a) => rank(a) >= 0).sort((a, b) => rank(a) - rank(b)));
      setPhase('ready');
    });
    return () => { live = false; };
  }, []);
  // The image menu closes on a click elsewhere (its own ⋮ toggles it) and on Esc.
  useEffect(() => {
    if (!menu) return undefined;
    const down = (e) => {
      if (!menuRef.current?.contains(e.target) && !e.target.closest?.('[data-sg-more]')) setMenu(null);
    };
    const key = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setMenu(null);
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key, true);
    };
  }, [menu]);
  const picked = (a) => images.some((im) => (im.assetId && im.assetId === a.id) || im.url === a.url);
  const fresh = items.filter((a) => !picked(a));
  const avail = fresh.filter((a) => !hiddenIds.includes(a.id));
  const hiddenCount = fresh.length - avail.length;
  const measure = useCallback(() => {
    const t = track.current;
    if (!t) return;
    setEdges({ left: t.scrollLeft > 2, right: t.scrollLeft + t.clientWidth < t.scrollWidth - 2 });
  }, []);
  useLayoutEffect(measure, [measure, avail.length, phase, cardHidden]);
  const hideCard = () => { setCardHidden(true); writeStore(HIDE_CARD_KEY, true); };
  const showCard = () => { setCardHidden(false); writeStore(HIDE_CARD_KEY, null); };
  const hideOne = (a) => {
    const next = [...hiddenIds, a.id];
    setHiddenIds(next);
    writeStore(HIDDEN_IMAGES_KEY, next);
  };
  const showHidden = () => { setHiddenIds([]); writeStore(HIDDEN_IMAGES_KEY, null); };
  const openMenu = (a, btn) => {
    if (menu?.a.id === a.id) { setMenu(null); return; }
    const card = cardRef.current.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    setMenu({ a, top: b.bottom - card.top + 4, right: Math.max(8, card.right - b.right) });
  };

  if (cardHidden) {
    return (
      <div className="ae-sg-off" data-testid="suggested-images-hidden">
        <span>Suggested images are hidden.</span>
        <button type="button" className="ae-link" onClick={showCard}>Show suggested images</button>
      </div>
    );
  }
  if (phase === 'ready' && !fresh.length) return null;
  const step = (dir) => track.current?.scrollBy({ left: dir * Math.max(120, track.current.clientWidth - 80), behavior: 'smooth' });
  return (
    <div className="ae-sg" ref={cardRef} data-testid="suggested-images">
      {phase === 'loading' ? (
        <>
          <div className="ae-sg-head"><span className="ae-sg-title">Loading suggested images&hellip;</span></div>
          <div className="ae-sg-track"><div className="ae-sg-wait" aria-hidden="true" /></div>
        </>
      ) : (
        <>
          <div className="ae-sg-head">
            <span className="ae-sg-title">Suggested images</span>
            {avail.length > 0 && <button type="button" className="ae-link" onClick={() => onAdd(avail)}>Select all</button>}
            <Dropdown align="right" trigger={(open, toggle) => (
              <button type="button" className="iconbtn ae-sg-menu" aria-label="Suggested images options" aria-expanded={open} onClick={toggle}>
                <Icon name="more_vert" />
              </button>
            )}>
              {(close) => (
                <div className="menu ae-sg-list">
                  <MenuItem icon="hide_image" onClick={() => { close(); hideCard(); }}>Hide suggested images</MenuItem>
                  <MenuItem icon="chat_bubble" onClick={() => { close(); feedbackAbout('Suggested images'); }}>Provide feedback</MenuItem>
                  <MenuItem icon="photo_library" onClick={() => { close(); onMore(); }}>View more images</MenuItem>
                  {hiddenCount > 0 && (
                    <MenuItem icon="image" onClick={() => { close(); showHidden(); }}>
                      Show {hiddenCount} hidden image{hiddenCount === 1 ? '' : 's'}
                    </MenuItem>
                  )}
                </div>
              )}
            </Dropdown>
          </div>
          {avail.length ? (
            <div className="ae-sg-track" ref={track} onScroll={() => { measure(); if (menu) setMenu(null); }}>
              {avail.map((a) => {
                const [icon, caption] = SUGGEST_FROM[a.source];
                const name = a.name || 'suggested image';
                return (
                  <div key={a.id} className="ae-sg-item" style={{ width: sgW(a) }} data-source={a.source}>
                    <div className="ae-sg-pic">
                      <img src={a.url} alt="" onLoad={measure} />
                      <div className={`ae-sg-over ${menu?.a.id === a.id ? 'on' : ''}`}>
                        <button type="button" className="ae-sg-ic" aria-label={`Enlarge ${name}`} title="Enlarge" onClick={() => setZoom(a)}>
                          <Icon name="fullscreen" />
                        </button>
                        <button type="button" className="ae-sg-ic" data-sg-more aria-label={`More options for ${name}`} title="More options"
                          aria-expanded={menu?.a.id === a.id} onClick={(e) => openMenu(a, e.currentTarget)}>
                          <Icon name="more_vert" />
                        </button>
                        <button type="button" className="ae-sg-select" aria-label={`Select ${name}`} onClick={() => onAdd([a])}>Select</button>
                      </div>
                    </div>
                    <div className="ae-sg-cap"><Icon name={icon} />{caption}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ae-sg-none">You’ve hidden every suggestion. Use the menu to show them again.</div>
          )}
          {avail.length > 0 && edges.left && (
            <button type="button" className="ae-sg-arrow left" aria-label="Previous suggestions" onClick={() => step(-1)}><Icon name="chevron_left" /></button>
          )}
          {avail.length > 0 && edges.right && (
            <button type="button" className="ae-sg-arrow right" aria-label="More suggestions" onClick={() => step(1)}><Icon name="chevron_right" /></button>
          )}
          {menu && (
            <div className="menu ae-sg-imenu" ref={menuRef} style={{ top: menu.top, right: menu.right }}>
              <MenuItem icon="add" onClick={() => { const { a } = menu; setMenu(null); onAdd([a]); }}>Add to your ad</MenuItem>
              <MenuItem icon="fullscreen" onClick={() => { setZoom(menu.a); setMenu(null); }}>Enlarge</MenuItem>
              <MenuItem icon="hide_image" onClick={() => { hideOne(menu.a); setMenu(null); }}>Hide this image</MenuItem>
              <MenuItem icon="chat_bubble" onClick={() => { setMenu(null); feedbackAbout('Suggested images'); }}>Provide feedback</MenuItem>
            </div>
          )}
        </>
      )}
      {zoom && (
        <ImageZoom a={zoom} caption={SUGGEST_FROM[zoom.source]?.[1]} onClose={() => setZoom(null)}
          onSelect={() => { onAdd([zoom]); setZoom(null); }} />
      )}
    </div>
  );
}

// Headlines / descriptions: suggestion chips, "More ideas" (the text ideas dialog), one box per
// line, "+ Headline".
function TextListField({ k, label, help, noun, items, maxItems, maxLen, suggestions, onChange, errOf, isTouched, touch, clearServer, onRemoved, onIdeas }) {
  const [focusIdx, setFocusIdx] = useState(null);
  const root = useRef(null);
  useEffect(() => {
    if (focusIdx == null) return;
    root.current?.querySelector(`[data-field="${k}.${focusIdx}"] input`)?.focus();
    setFocusIdx(null);
  }, [focusIdx, k]);
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  const full = items.filter((s) => normText(s)).length >= maxItems;
  const used = new Set(items.map((s) => normText(s).toLowerCase()).filter(Boolean));
  const avail = suggestions.filter((s) => normText(s) && !used.has(normText(s).toLowerCase()));
  // The first three unused suggestions; the rest (and more ideas) are in the dialog.
  const chips = avail.slice(0, 3);
  const setAt = (i, v) => {
    onChange(items.map((x, j) => (j === i ? v : x)));
    clearServer(`${k}.${i}`, k);
  };
  // A suggestion fills the first empty box, otherwise it gets a new box.
  const add = (text = '') => {
    const empty = text ? items.findIndex((s) => !normText(s)) : -1;
    if (empty >= 0) {
      setAt(empty, text);
    } else if (items.length < maxItems) {
      onChange([...items, text]);
      clearServer(k);
      if (!text) setFocusIdx(items.length);
    }
  };
  const listErr = errOf(k, items.some((_, i) => isTouched(`${k}.${i}`)));
  return (
    <section className="ae-sec" data-field={k} ref={root}>
      <Head label={label} help={help} sub={`Add up to ${maxItems} ${noun}s`} />
      <div className="ae-sugg-row">
        <span>Suggested {noun}s</span>
        <button type="button" className="ae-link ae-ideas" data-testid={`${k}-ideas`} onClick={onIdeas}>More ideas</button>
      </div>
      {full ? (
        <div className="ae-maxnote"><Icon name="info" />You have entered the maximum number of {noun}s.</div>
      ) : chips.length > 0 && (
        <div className="ae-chips">
          {chips.map((s, i) => (
            <button key={`${i}-${s}`} type="button" className="ae-chip" onClick={() => add(s)} title={`Add this ${noun}`}>
              <Icon name="add" /><span>{s}</span>
            </button>
          ))}
        </div>
      )}
      <div className="ae-list">
        {items.map((v, i) => (
          <TextBox key={i} k={`${k}.${i}`} value={v} max={maxLen} label={`${Noun} ${i + 1}`}
            err={errOf(`${k}.${i}`)} onChange={(t) => setAt(i, t)} onBlur={() => touch(`${k}.${i}`)}
            onRemove={items.length > 1 ? () => { onChange(items.filter((_, j) => j !== i)); onRemoved(k, i); } : undefined}
            removeLabel={`Remove ${noun} ${i + 1}`} />
        ))}
      </div>
      {listErr && <div className="ae-err block" role="alert">{listErr}</div>}
      {items.length < maxItems && (
        <button type="button" className="ae-add" onClick={() => add()}><Icon name="add" />{Noun}</button>
      )}
    </section>
  );
}

// A one-per-line list in the settings sheet, with its limits underneath and any error.
function SheetLines({ k, label, hint, value, err, rows, placeholder, onChange }) {
  const id = `ae-s-${k.replace('.', '-')}`;
  return (
    <div className="ae-sfield" data-field={k}>
      <label className="ae-slabel" htmlFor={id}>{label}</label>
      <textarea id={id} rows={rows} value={value} placeholder={placeholder} className={err ? 'err' : ''}
        aria-invalid={err ? true : undefined} aria-describedby={`${id}-hint`} onChange={(e) => onChange(e.target.value)} />
      <div className="ae-shint" id={`${id}-hint`}>{hint}</div>
      {err && <div className="ae-err block" role="alert">{err}</div>}
    </div>
  );
}

// Admin-only side sheet: everything on the page that isn't the ad's own content.
function SettingsSheet({ c, strength, errOf, onAdmin, onClose }) {
  const a = c.admin;
  const [tipsText, setTipsText] = useState(a.tips.join('\n'));
  const [heads, setHeads] = useState(a.suggestedHeadlines.join('\n'));
  const [descs, setDescs] = useState(a.suggestedDescriptions.join('\n'));
  const first = useRef(null);
  const max = LIMITS.suggestions;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    first.current?.focus();
    const key = (e) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <>
      <div className="ae-scrim" onClick={onClose} />
      <aside className="ae-sheet" role="dialog" aria-modal="true" aria-label="Page settings" data-testid="page-settings">
        <div className="ae-sheet-head">
          <h2>Page settings</h2>
          <button type="button" className="iconbtn" aria-label="Close page settings" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="ae-sheet-body">
          <p className="ae-sheet-note">Only admins see this. It controls the ad strength bar and the suggestions on this page.</p>
          <label className="ae-sfield">
            <span>Ad strength</span>
            <div className="ae-select">
              <select ref={first} value={a.strength || ''} onChange={(e) => onAdmin({ strength: e.target.value })}>
                <option value="">Automatic ({strength.autoLevel})</option>
                {STRENGTH_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <Icon name="arrow_drop_down" />
            </div>
          </label>
          <SheetLines k="admin.tips" label="Tips" rows={4} value={tipsText} placeholder={strength.autoTips.join('\n')} err={errOf('admin.tips')}
            hint={`One per line, up to ${max}, max ${LIMITS.tip} characters each. Leave empty for automatic tips.`}
            onChange={(v) => { setTipsText(v); onAdmin({ tips: lines(v) }, 'admin.tips'); }} />
          <fieldset className="ae-sfield">
            <legend>Checklist</legend>
            {CHECK_KEYS.map((k) => (
              <label key={k} className="ae-srow">
                <span>{CHECK_LABEL[k]}</span>
                <div className="ae-select">
                  <select value={a.checklist[k] || 'auto'} onChange={(e) => onAdmin({ checklist: { ...a.checklist, [k]: e.target.value } })}>
                    <option value="auto">Automatic ({CHECK_TEXT[strength.autoChecklist[k]]})</option>
                    <option value="done">Done</option>
                    <option value="partial">Half</option>
                    <option value="empty">Empty</option>
                  </select>
                  <Icon name="arrow_drop_down" />
                </div>
              </label>
            ))}
          </fieldset>
          <SheetLines k="admin.suggestedHeadlines" label="Suggested headlines" rows={5} value={heads} err={errOf('admin.suggestedHeadlines')}
            hint={`One per line, up to ${max}, max ${LIMITS.headline} characters each`}
            onChange={(v) => { setHeads(v); onAdmin({ suggestedHeadlines: lines(v) }, 'admin.suggestedHeadlines'); }} />
          <SheetLines k="admin.suggestedDescriptions" label="Suggested descriptions" rows={5} value={descs} err={errOf('admin.suggestedDescriptions')}
            hint={`One per line, up to ${max}, max ${LIMITS.description} characters each`}
            onChange={(v) => { setDescs(v); onAdmin({ suggestedDescriptions: lines(v) }, 'admin.suggestedDescriptions'); }} />
          <label className="ae-sfield" data-field="admin.afterSave">
            <span>After saving</span>
            <div className="ae-select">
              <select value={a.afterSave} onChange={(e) => onAdmin({ afterSave: e.target.value })}>
                {AFTER_SAVE.map((v) => <option key={v} value={v}>{AFTER_LABEL[v]}</option>)}
              </select>
              <Icon name="arrow_drop_down" />
            </div>
          </label>
          <p className="ae-sheet-note">These settings are saved with the ad when you click Save.</p>
        </div>
        <div className="ae-sheet-foot">
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </aside>
    </>
  );
}

// Copy text, falling back to a hidden textarea where the clipboard API isn't available.
function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => copyOld(text));
  return Promise.resolve(copyOld(text));
}
function copyOld(text) {
  const t = document.createElement('textarea');
  t.value = text;
  t.setAttribute('readonly', '');
  t.style.cssText = 'position:fixed;left:-9999px;opacity:0';
  document.body.appendChild(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  t.remove();
  return ok;
}

// "Test" in Ad URL options: the addresses a click would use, worked out on the page from the
// URL options (testUrls). Nothing is opened or requested.
function UrlTestDialog({ c, onClose }) {
  const notify = useNotify();
  const box = useRef(null);
  useModal(box, onClose, '.ae-test-close');
  const desk = testUrls(c);
  const mob = c.options?.useMobileUrl ? testUrls(c, { mobile: true }) : null;
  const pending = [...new Set([...(desk.pending || []), ...(mob?.pending || [])])];
  const unset = pending.filter((p) => p.startsWith('{_'));
  const atClick = pending.filter((p) => !p.startsWith('{_'));
  const copy = (url) => copyText(url).then((ok) => notify(ok ? 'Copied' : 'Couldn’t copy the address'));
  const row = (label, url, note, id) => (
    <div className="ae-test-item" data-testid={id}>
      <div className="ae-test-label">{label}<button type="button" className="ae-link" onClick={() => copy(url)}>Copy</button></div>
      <div className="ae-test-url">{url}</div>
      {note && <div className="ae-test-note">{note}</div>}
    </div>
  );
  return createPortal(
    <div className="ae-dlg-root">
      <div className="adlg-scrim" onClick={onClose} />
      <section className="ae-dlg" ref={box} role="dialog" aria-modal="true" aria-labelledby="ae-test-title" tabIndex={-1} data-testid="url-test">
        <h2 id="ae-test-title">Where a click on your ad goes</h2>
        {desk.error ? <p className="ae-err block" role="alert">{desk.error}</p> : (
          <>
            {row('Landing page', desk.landing, 'Your final URL with the final URL suffix added.', 'test-landing')}
            {mob && (mob.error ? <p className="ae-err block" role="alert">{mob.error}</p>
              : row('Landing page on mobile', mob.landing, 'Your mobile final URL with the final URL suffix added.', 'test-mobile'))}
            {desk.tracking && row('Tracking URL', desk.tracking, 'Your tracking service gets this address first, then sends people on to the landing page.', 'test-tracking')}
          </>
        )}
        {unset.length > 0 && <p className="ae-test-note warn">{unset.join(', ')} {unset.length === 1 ? 'has' : 'have'} no value yet. Add {unset.length === 1 ? 'it' : 'them'} under Custom parameter.</p>}
        {atClick.length > 0 && <p className="ae-test-note">{atClick.join(', ')} {atClick.length === 1 ? 'is' : 'are'} only known when someone clicks, so {atClick.length === 1 ? 'it’s' : 'they’re'} shown as typed.</p>}
        <p className="ae-test-note">Worked out here from your URL options. No page was opened and nothing was sent.</p>
        <div className="ae-dlg-foot"><button type="button" className="btn-primary ae-test-close" onClick={onClose}>Close</button></div>
      </section>
    </div>,
    document.body,
  );
}

// ---------- the page ----------

export default function AdEditPage({ adId, canEdit, onClose, onDirty, onBusy }) {
  const notify = useNotify();
  const account = useAccount();
  const [phase, setPhase] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState('');
  const [ad, setAd] = useState(null);
  const [c, setC] = useState(null);
  const [name, setName] = useState('');
  const [base, setBase] = useState('');
  const [touched, setTouched] = useState({});
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null); // { kind: 'image' | 'logo' | 'video', tab }
  const [textDlg, setTextDlg] = useState(null); // 'headlines' | 'longHeadline' | 'descriptions'
  const [urlTest, setUrlTest] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState({ format: false, url: false });
  const [showName, setShowName] = useState(false);
  const [focusReq, setFocusReq] = useState(null);
  const rootRef = useRef(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let live = true;
    setPhase('loading');
    api.creative(adId).then((r) => {
      if (!live) return;
      // Anything without the ad and its content (e.g. a page answered instead of the API) counts as missing.
      if (!r?.ad?.id || !r.creative || typeof r.creative !== 'object') {
        setLoadError(NOT_FOUND);
        setPhase('error');
        return;
      }
      const cr = normalizeCreative(r.creative);
      const nm = r.ad.name || '';
      setAd(r.ad);
      setC(cr);
      setName(nm);
      setBase(JSON.stringify({ name: nm, creative: cr }));
      setPhase('ready');
    }).catch((e) => {
      if (!live) return;
      if (e.status === 401) { location.reload(); return; }
      // A 404 with its own reason (e.g. not a display ad) shows that reason.
      const why = e.data?.error;
      if (e.status === 404) setLoadError(why && !/^(ad )?not found$/i.test(why) ? why : NOT_FOUND);
      else setLoadError(e.message || 'This ad couldn’t be loaded.');
      setPhase('error');
    });
    return () => { live = false; };
  }, [adId]);

  useEffect(() => {
    const prev = document.title;
    document.title = tabTitle(`Edit ad-${account.name}-${BRAND.name}`);
    return () => { document.title = prev; };
  }, [account.name]);

  // Unsaved changes: the shell asks before X / Back, and the browser asks before a reload.
  const snapshot = useMemo(() => (c ? JSON.stringify({ name, creative: c }) : ''), [name, c]);
  const dirty = phase === 'ready' && snapshot !== base;
  const savedCreative = useMemo(() => (base ? JSON.parse(base).creative : null), [base]);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const errors = useMemo(() => {
    if (!c) return {};
    const e = validateCreative(c);
    const n = normText(name);
    if (!n) e.name = 'Enter an ad name';
    else if (chars(n) > NAME_MAX) e.name = 'Ad name is too long';
    return e;
  }, [c, name]);
  // Errors show after a save attempt or once the field has been left; server messages always show.
  const isTouched = (key) => !!touched[key];
  const errOf = (key, alsoSeen = false) => serverErrors[key] || ((tried || touched[key] || alsoSeen) ? errors[key] : '') || '';
  const touch = (key) => setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  const clearServer = useCallback((...keys) => setServerErrors((s) => {
    if (!keys.some((k) => k in s)) return s;
    const n = { ...s };
    keys.forEach((k) => delete n[k]);
    return n;
  }), []);
  // A box was removed from a list: its errors go, and later boxes keep theirs.
  const removedAt = useCallback((k, i) => {
    setServerErrors((s) => dropIndex(s, k, i));
    setTouched((t) => dropIndex(t, k, i));
  }, []);

  const set = (patch) => setC((x) => ({ ...x, ...patch }));
  const setOpt = (patch) => setC((x) => ({ ...x, options: { ...x.options, ...patch } }));
  const setAdmin = useCallback((patch) => setC((x) => ({ ...x, admin: { ...x.admin, ...patch } })), []);

  // Open whatever hides the first problem, then scroll to it and focus it (after the next render).
  // Problems in the ad itself come first; page settings (admin.*) open the settings sheet.
  const reveal = (errs) => {
    let keys = Object.keys(errs);
    if (!keys.length) return;
    const onPage = keys.filter((k) => !isAdminKey(k));
    if (onPage.length) keys = onPage;
    else if (canEdit) setSheet(true);
    if (keys.some(isFormatKey)) setOpen((o) => ({ ...o, format: true }));
    if (keys.some(isUrlKey)) setOpen((o) => ({ ...o, url: true }));
    if (keys.includes('name')) setShowName(true);
    setFocusReq({ keys, at: Date.now() });
  };
  useEffect(() => {
    const root = rootRef.current;
    if (!focusReq || !root) return;
    const { keys } = focusReq;
    const exact = (x) => keys.includes(x.dataset.field);
    // A container (e.g. "headlines") stands in for a key with no box of its own ("headlines.7").
    const near = (x) => keys.some((k) => k.startsWith(`${x.dataset.field}.`) || x.dataset.field.startsWith(`${k}.`))
      && ![...x.querySelectorAll('[data-field]')].some(exact);
    const el = [...root.querySelectorAll('[data-field]')].find((x) => exact(x) || near(x));
    if (!el) return;
    const target = el.matches('input, textarea, select') ? el
      : el.querySelector('[aria-invalid="true"]') || el.querySelector('input, textarea, select') || el.querySelector('button');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  }, [focusReq]);

  const save = async () => {
    if (saving || !c) return;
    setTried(true);
    // Viewers can't change page settings, so those never block them.
    const blocking = Object.fromEntries(Object.entries(errors).filter(([k]) => canEdit || !isAdminKey(k)));
    if (Object.keys(blocking).length) {
      reveal(blocking);
      return;
    }
    if (!canEdit) return;
    setSaving(true);
    onBusy?.(true);
    try {
      await api.saveCreative(adId, { name: normText(name), creative: c });
      if (!alive.current) {
        // The page was left while saving: the save still landed, so refresh the hidden ads page.
        window.dispatchEvent(new Event('app:refresh'));
        notify('Your ad was saved');
        return;
      }
      onDirty?.(false);
      onBusy?.(false);
      onClose(true);
    } catch (e) {
      if (!alive.current) {
        notify(e.message && !e.data?.fields ? `Your ad couldn’t be saved: ${e.message}` : 'Your ad couldn’t be saved');
        return;
      }
      onBusy?.(false);
      if (e.status === 401) { location.reload(); return; }
      const fields = e.data?.fields;
      if (e.status === 400 && fields && Object.keys(fields).length) {
        setServerErrors(fields);
        reveal(fields);
      }
      notify(e.message || 'Your ad couldn’t be saved');
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  const cancel = () => {
    if (saving) return;
    if (dirty && !window.confirm(DISCARD)) return;
    onDirty?.(false);
    onClose(false);
  };

  const share = useCallback(() => {
    copyText(location.href).then((ok) => notify(ok ? 'Link copied' : 'Couldn’t copy the link'));
  }, [notify]);

  // Campaign / ad group names in the breadcrumb save straight away (admin).
  const rename = async (kind, value) => {
    try {
      if (kind === 'campaign') await api.editCampaign(ad.campaignId, 'name', value);
      else await api.editAdGroup(ad.adGroupId, 'name', value);
      if (!alive.current) return;
      setAd((x) => ({ ...x, [kind]: value.trim() }));
      window.dispatchEvent(new Event('app:refresh'));
    } catch (e) {
      notify(e.message);
    }
  };

  const addImages = (assets) => {
    const room = LIMITS.images - c.images.length;
    if (room <= 0) {
      notify(`You can add up to ${LIMITS.images} images`);
      return;
    }
    const take = assets.slice(0, room);
    set({ images: [...c.images, ...take.map(refOf)] });
    clearServer('images');
    if (assets.length > room) notify(`Only ${room} more image${room === 1 ? '' : 's'} could be added. Ads can have up to ${LIMITS.images} images.`);
  };

  // The text ideas dialog's Save: its picks replace the list (or the long headline) in the form.
  const saveTexts = (k, list) => {
    if (k === 'longHeadline') {
      set({ longHeadline: list[0] || '' });
      clearServer('longHeadline');
    } else {
      set({ [k]: list.length ? list : [''] });
      setServerErrors((s) => dropList(s, k));
      setTouched((t) => dropList(t, k));
    }
    setTextDlg(null);
  };

  const ready = phase === 'ready' && c;
  const strength = ready ? adStrength(c) : null;
  const o = c?.options;
  const params = o?.customParams || [];
  // With no parameters the page still shows one empty row to type into; it only becomes a
  // parameter once something is typed (and an emptied lone row goes again).
  const paramRows = params.length ? params : [{ key: '', value: '' }];
  const setParam = (i, patch) => {
    let next = paramRows.map((p, j) => (j === i ? { ...p, ...patch } : p));
    if (next.length === 1 && !next[0].key && !next[0].value) next = [];
    setOpt({ customParams: next });
    clearServer('options.customParams', `options.customParams.${i}`);
  };
  const addParam = () => {
    setOpt({ customParams: [...paramRows, { key: '', value: '' }] });
    setFocusReq({ keys: [`options.customParams.${paramRows.length}`], at: Date.now() });
  };
  // Simple single-box section ("Final URL", "Long headline", option fields).
  const field = (k, label, value, onValue, extra = {}) => (
    <section className="ae-sec">
      <Head label={label} help={extra.help} sub={extra.sub} right={extra.right} />
      <TextBox k={k} label={label} value={value} max={extra.max} placeholder={extra.placeholder} type={extra.type} hardMax={extra.hardMax}
        err={errOf(k)} onBlur={() => touch(k)} onChange={(v) => { onValue(v); clearServer(k); }} />
    </section>
  );
  // A URL option box: its name inside the box, (?) on the right, an example underneath.
  const urlField = (key, label, hint) => {
    const k = `options.${key}`;
    return (
      <section className="ae-sec">
        <TextBox k={k} label={label} placeholder={label} value={o[key]} hardMax={LIMITS[key]} hint={hint}
          err={errOf(k)} onBlur={() => touch(k)} onChange={(v) => { setOpt({ [key]: v }); clearServer(k); }}
          adorn={<Help help={HELP[key]} label={label} align="right" />} />
      </section>
    );
  };

  return (
    <div className="ae" ref={rootRef} data-testid="ad-edit">
      <div className="ae-progress">{(phase === 'loading' || saving) && <div className="progress"><span /></div>}</div>
      <div className="ae-card">
        <Banner c={c} canEdit={canEdit} loading={!ready} failed={phase === 'error'} onAdmin={setAdmin} onSettings={() => setSheet(true)} />
        {phase === 'loading' && <div className="ae-cols loading" aria-busy="true"><div className="ae-left" /><div className="ae-right" /></div>}
        {phase === 'error' && (
          <div className="ae-error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="btn-primary" onClick={() => onClose(false)}>Back to ads</button>
          </div>
        )}
        {ready && (
          <div className="ae-cols">
            <div className="ae-left">
              <div className="ae-crumb" data-testid="edit-breadcrumb">
                <EditText value={ad.campaign} canEdit={canEdit} maxLength={100} label="campaign name" onSave={(v) => rename('campaign', v)} />
                <span className="ae-crumb-sep">&gt;</span>
                <EditText value={ad.adGroup} canEdit={canEdit} maxLength={100} label="ad group name" onSave={(v) => rename('adGroup', v)} />
              </div>

              {field('finalUrl', 'Final URL', c.finalUrl, (v) => set({ finalUrl: v }), { help: HELP.finalUrl, hardMax: LIMITS.finalUrl, type: 'url' })}
              {field('businessName', 'Business name', c.businessName, (v) => set({ businessName: v }), { help: HELP.businessName, max: LIMITS.businessName, hardMax: 200 })}

              <section className="ae-sec" data-field="images">
                <Head label="Images" help={HELP.images} sub={<>Add up to {LIMITS.images} images <LearnMore topic="images" /></>} />
                {c.images.length > 0 && <Thumbs list={c.images} onMore={() => setDialog({ kind: 'image', tab: 'suggested' })} />}
                {errOf('images') && <div className="ae-err block" role="alert">{errOf('images')}</div>}
                <div className="ae-btns">
                  <button type="button" className="ae-tbtn" data-testid="edit-images" onClick={() => setDialog({ kind: 'image', tab: 'suggested' })}>
                    <Icon name={c.images.length ? 'edit' : 'add'} />{c.images.length ? 'Edit' : 'Images'}
                  </button>
                  {/* Generated images in the library (made with an image tool); this app doesn't create images. */}
                  <button type="button" className="ae-tbtn" data-testid="generated-images" onClick={() => setDialog({ kind: 'image', tab: 'generated' })}>
                    <Icon name="add_photo_alternate" />Generated images
                  </button>
                </div>
                <Suggestions images={c.images} onAdd={addImages} onMore={() => setDialog({ kind: 'image', tab: 'suggested' })} />
              </section>

              <section className="ae-sec" data-field="logos">
                <Head label="Logos" help={HELP.logos} sub={`Add up to ${LIMITS.logos} logos`} />
                {c.logos.length > 0 && <Thumbs list={c.logos} square />}
                {errOf('logos') && <div className="ae-err block" role="alert">{errOf('logos')}</div>}
                <div className="ae-btns">
                  <button type="button" className="ae-tbtn" data-testid="edit-logos" onClick={() => setDialog({ kind: 'logo', tab: 'suggested' })}>
                    <Icon name={c.logos.length ? 'edit' : 'add'} />{c.logos.length ? 'Edit' : 'Logos'}
                  </button>
                </div>
              </section>

              <section className="ae-sec" data-field="videos">
                <Head label="Videos" help={HELP.videos} sub="Optional (portrait and landscape around 30 seconds work best)" />
                {c.videos.length > 0 && (
                  <ul className="ae-videos" data-testid="video-list">
                    {c.videos.map((v, i) => {
                      // Videos are library items or YouTube links; anything else can't be saved.
                      const bad = !videoRefOk(v);
                      return (
                        <li key={`${v.url}-${i}`} className={bad ? 'bad' : ''}>
                          <Icon name={bad ? 'error' : 'play_circle'} className="ae-vid-ic" />
                          <span className="ae-vid-title" title={v.title || v.url}>{v.title || v.url}</span>
                          <button type="button" className="iconbtn sm" aria-label={`Remove video ${v.title || i + 1}`}
                            onClick={() => { set({ videos: c.videos.filter((_, j) => j !== i) }); clearServer('videos'); }}>
                            <Icon name="close" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {errOf('videos', c.videos.length > 0) && <div className="ae-err block" role="alert">{errOf('videos', c.videos.length > 0)}</div>}
                <div className="ae-btns">
                  <button type="button" className="ae-add" data-testid="add-videos" onClick={() => setDialog({ kind: 'video' })}><Icon name="add" />Videos</button>
                </div>
              </section>

              <TextListField k="headlines" label="Headlines" help={HELP.headlines} noun="headline" items={c.headlines}
                maxItems={LIMITS.headlines} maxLen={LIMITS.headline} suggestions={c.admin.suggestedHeadlines} onIdeas={() => setTextDlg('headlines')}
                onChange={(list) => set({ headlines: list })} errOf={errOf} isTouched={isTouched} touch={touch} clearServer={clearServer} onRemoved={removedAt} />

              {field('longHeadline', 'Long headline', c.longHeadline, (v) => set({ longHeadline: v }), {
                help: HELP.longHeadline, max: LIMITS.longHeadline, hardMax: 400,
                right: <button type="button" className="ae-link ae-ideas" data-testid="longHeadline-ideas" onClick={() => setTextDlg('longHeadline')}>More ideas</button>,
              })}

              <TextListField k="descriptions" label="Descriptions" help={HELP.descriptions} noun="description" items={c.descriptions}
                maxItems={LIMITS.descriptions} maxLen={LIMITS.description} suggestions={c.admin.suggestedDescriptions} onIdeas={() => setTextDlg('descriptions')}
                onChange={(list) => set({ descriptions: list })} errOf={errOf} isTouched={isTouched} touch={touch} clearServer={clearServer} onRemoved={removedAt} />

              <div className="ae-exps">
                <Expander id="ae-format" label="Additional format options" open={open.format} onToggle={() => setOpen((x) => ({ ...x, format: !x.format }))}>
                  <div className="ae-infobox"><Icon name="info" /><span>Turn on all three options below to let your ad show in the most places.</span></div>
                  {FORMAT_OPTIONS.map(([key, title, text, topic]) => (
                    <div className="ae-fopt" key={key} data-field={`options.${key}`}>
                      <input type="checkbox" id={`ae-opt-${key}`} checked={!!o[key]} onChange={(e) => setOpt({ [key]: e.target.checked })} />
                      <div>
                        <label htmlFor={`ae-opt-${key}`}>{title}</label>
                        <p>{text} <LearnMore topic={topic} /></p>
                      </div>
                    </div>
                  ))}
                  <section className="ae-sec">
                    <Head label="Call to action text" />
                    <Select k="options.cta" value={o.cta} options={CTA_OPTIONS} label="Call to action text" onChange={(v) => setOpt({ cta: v })} />
                  </section>
                  {field('options.promoText', 'Promotion text', o.promoText, (v) => setOpt({ promoText: v }), { max: LIMITS.promoText, hardMax: 200, placeholder: 'Example: Free delivery this week' })}
                  <section className="ae-sec">
                    <Head label="Price" />
                    <div className="ae-row">
                      <Select k="options.pricePrefix" value={o.pricePrefix} label="Price prefix"
                        options={PRICE_PREFIXES.map((p) => [p, p || 'None'])} onChange={(v) => setOpt({ pricePrefix: v })} />
                      <TextBox k="options.price" label="Price" placeholder="Price" value={o.price} max={LIMITS.price} hardMax={100}
                        err={errOf('options.price')} onBlur={() => touch('options.price')}
                        onChange={(v) => { setOpt({ price: v }); clearServer('options.price'); }} />
                    </div>
                  </section>
                  <section className="ae-sec">
                    <div className="ae-row even">
                      <div>
                        <Head label="Main color" />
                        <ColorField k="options.mainColor" label="Main color" value={o.mainColor} err={errOf('options.mainColor')}
                          onBlur={() => touch('options.mainColor')} onChange={(v) => { setOpt({ mainColor: v }); clearServer('options.mainColor'); }} />
                      </div>
                      <div>
                        <Head label="Accent color" />
                        <ColorField k="options.accentColor" label="Accent color" value={o.accentColor} err={errOf('options.accentColor')}
                          onBlur={() => touch('options.accentColor')} onChange={(v) => { setOpt({ accentColor: v }); clearServer('options.accentColor'); }} />
                      </div>
                    </div>
                  </section>
                </Expander>

                <Expander id="ae-url" label="Ad URL options" small open={open.url} onToggle={() => setOpen((x) => ({ ...x, url: !x.url }))}>
                  {urlField('trackingTemplate', 'Tracking template', 'Example: https://track.example.com/?url={lpurl}&id=5')}
                  {urlField('finalUrlSuffix', 'Final URL suffix', 'Example: param1=value1&param2=value2')}
                  <section className="ae-sec" data-field="options.customParams">
                    <Head label="Custom parameter" help={HELP.customParams} />
                    {paramRows.map((p, i) => {
                      const pk = `options.customParams.${i}`;
                      const perr = errOf(pk);
                      const valueErr = !!perr && /value/i.test(perr);
                      const nameErr = !!perr && !valueErr;
                      const last = i === paramRows.length - 1;
                      return (
                        // Checked once focus leaves the whole row, not between its name and value boxes.
                        <div className="ae-param" key={i} data-field={pk}
                          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) touch(pk); }}>
                          <span className={`ae-param-key ${nameErr ? 'err' : ''}`}>
                            <span aria-hidden="true">{'{_'}</span>
                            <input value={p.key || ''} placeholder="Name" aria-label={`Parameter ${i + 1} name`} maxLength={LIMITS.paramKey}
                              aria-invalid={nameErr || undefined}
                              onChange={(e) => setParam(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '') })} />
                            <span aria-hidden="true">{'}'}</span>
                          </span>
                          <span className="ae-eq" aria-hidden="true">=</span>
                          <input className={`ae-input ${valueErr ? 'err' : ''}`} value={p.value || ''} placeholder="Value" aria-label={`Parameter ${i + 1} value`}
                            maxLength={LIMITS.paramValue} aria-invalid={valueErr || undefined}
                            onChange={(e) => setParam(i, { value: e.target.value })} />
                          {params.length > 0 ? (
                            <button type="button" className="iconbtn sm" aria-label={`Remove parameter ${i + 1}`}
                              onClick={() => { setOpt({ customParams: params.filter((_, j) => j !== i) }); removedAt('options.customParams', i); }}>
                              <Icon name="close" />
                            </button>
                          ) : <span />}
                          {last && paramRows.length < LIMITS.customParams ? (
                            <button type="button" className="ae-param-add" aria-label="Add a custom parameter" title="Add a custom parameter" onClick={addParam}>
                              <Icon name="add_circle" fill />
                            </button>
                          ) : <span />}
                          {perr && <span className="ae-err block" role="alert">{perr}</span>}
                        </div>
                      );
                    })}
                    {errOf('options.customParams') && <div className="ae-err block" role="alert">{errOf('options.customParams')}</div>}
                  </section>
                  <div className="ae-test-row">
                    <button type="button" className="ae-tbtn ae-test" data-testid="test-url" onClick={() => setUrlTest(true)}>Test</button>
                    <span className="ae-sub">See the address a click would land on</span>
                  </div>
                  <label className="ae-checkbox" data-field="options.useMobileUrl">
                    <input type="checkbox" checked={!!o.useMobileUrl} onChange={(e) => { setOpt({ useMobileUrl: e.target.checked }); clearServer('options.mobileUrl'); }} />
                    <span>Use a different final URL for mobile</span>
                  </label>
                  {o.useMobileUrl && field('options.mobileUrl', 'Mobile final URL', o.mobileUrl, (v) => setOpt({ mobileUrl: v }), { hardMax: LIMITS.finalUrl, type: 'url', placeholder: 'https://m.example.com' })}
                </Expander>
              </div>

              <div className="ae-moreopts">
                <Dropdown trigger={(isOpen, toggle) => (
                  <button type="button" className={`ae-more-btn ${isOpen ? 'open' : ''}`} aria-expanded={isOpen} onClick={toggle}>
                    More options<Icon name="arrow_drop_down" />
                  </button>
                )}>
                  {(close) => (
                    <div className="menu">
                      <MenuItem selected={showName} onClick={() => { close(); setShowName(true); setFocusReq({ keys: ['name'], at: Date.now() }); }}>Ad name</MenuItem>
                    </div>
                  )}
                </Dropdown>
              </div>
              {showName && field('name', 'Ad name', name, setName, { max: NAME_MAX, hardMax: 200 })}

              <div className="ae-notes">
                <p>
                  Saving creates a new version of this ad{c.admin.afterSave === 'keep' ? '' : ' and sends it for review'}.
                  You&rsquo;ll still see the metrics for earlier versions. <LearnMore topic="ad-versions" />
                </p>
                <p>Ads won&rsquo;t always show all of your text and images. Some formats may crop or shorten them, and either of your custom colors may be used.</p>
              </div>
            </div>
            <div className="ae-right">
              <PreviewPanel creative={c} onOpenAll={() => setShowAll(true)} onShare={share} />
            </div>
          </div>
        )}
      </div>

      {/* Viewers can try changes on the page (the previews follow); Save does nothing for them. */}
      {ready && (
        <div className="ae-actions">
          <button type="button" className="ae-save" data-testid="save-ad" disabled={saving} onClick={save}>Save</button>
          <button type="button" className="ae-cancel" data-testid="cancel-edit" disabled={saving} onClick={cancel}>Cancel</button>
        </div>
      )}
      <footer className="ae-foot">&copy; {BRAND.name}, 2026.</footer>

      {/* saved: the ad as last saved, which keeps its copy of an image deleted from the library;
          a pick only in the form goes with it (onDrop). */}
      {ready && dialog?.kind === 'image' && (
        <AssetDialog kind="image" selected={c.images} saved={savedCreative?.images} max={LIMITS.images} canEdit={canEdit} initialTab={dialog.tab}
          onSave={(list) => { set({ images: list }); clearServer('images'); setDialog(null); }}
          onDrop={(a) => setC((x) => ({ ...x, images: withoutAsset(x.images, a) }))} onClose={() => setDialog(null)} />
      )}
      {ready && dialog?.kind === 'logo' && (
        <AssetDialog kind="logo" selected={c.logos} saved={savedCreative?.logos} max={LIMITS.logos} canEdit={canEdit} initialTab={dialog.tab}
          onSave={(list) => { set({ logos: list }); clearServer('logos'); setDialog(null); }}
          onDrop={(a) => setC((x) => ({ ...x, logos: withoutAsset(x.logos, a) }))} onClose={() => setDialog(null)} />
      )}
      {ready && textDlg && (
        <TextDialog kind={TEXT_KIND[textDlg]} adId={adId} items={textDlg === 'longHeadline' ? [c.longHeadline] : c[textDlg]}
          max={textDlg === 'longHeadline' ? 1 : LIMITS[textDlg]}
          suggestions={textDlg === 'headlines' ? c.admin.suggestedHeadlines : textDlg === 'descriptions' ? c.admin.suggestedDescriptions : []}
          context={{ businessName: c.businessName, finalUrl: c.finalUrl, headlines: c.headlines, longHeadline: c.longHeadline, descriptions: c.descriptions }}
          onSave={(list) => saveTexts(textDlg, list)} onClose={() => setTextDlg(null)} />
      )}
      {ready && urlTest && <UrlTestDialog c={c} onClose={() => setUrlTest(false)} />}
      {ready && dialog?.kind === 'video' && (
        <VideoDialog selected={c.videos} max={LIMITS.videos} canEdit={canEdit}
          onSave={(list) => { set({ videos: list }); clearServer('videos'); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
      {ready && showAll && <PreviewModal creative={c} onClose={() => setShowAll(false)} onShare={share} />}
      {ready && sheet && canEdit && (
        <SettingsSheet c={c} strength={strength} errOf={(k) => serverErrors[k] || errors[k] || ''}
          onAdmin={(patch, key) => { setAdmin(patch); if (key) clearServer(key); }} onClose={() => setSheet(false)} />
      )}
    </div>
  );
}
