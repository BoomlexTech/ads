// The ad format mocks used by the previews: phone (mobile) and browser-window (desktop)
// frames, and the display / Gmail / YouTube / video layouts drawn inside them.
// Every layout reads its text and images from a "slot" (see buildSlots) and falls back to
// grey bars / boxes, so a half-filled ad still previews cleanly.
import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Common.jsx';
import { displayHost, isYouTube } from '../../../../shared/creative.js';

/* ---------- Content mix ---------- */

const clean = (list) => (list || []).map((v) => String(v ?? '').trim()).filter(Boolean);
const HEX = /^#[0-9a-f]{6}$/i;
const at = (list, n) => (list.length ? list[((n % list.length) + list.length) % list.length] : '');
// Images without a size count as landscape (the usual upload).
const shapeOf = (im) => {
  const r = im.w > 0 && im.h > 0 ? im.w / im.h : 1.91;
  return r > 1.15 ? 'wide' : r < 0.87 ? 'tall' : 'square';
};
const FIT = { wide: ['wide', 'square', 'tall'], square: ['square', 'tall', 'wide'], tall: ['tall', 'square', 'wide'] };

// slot(i) = what format i shows: headline i mod H, description i mod D, the image whose
// shape best fits the slot (rotating by i), logo 0. `seed` re-rolls the mix.
export function buildSlots(creative, seed = 0) {
  const c = creative || {};
  const o = c.options || {};
  const heads = clean(c.headlines);
  const descs = clean(c.descriptions);
  const pools = { wide: [], square: [], tall: [] };
  (c.images || []).forEach((im) => {
    if (im?.url) pools[shapeOf(im)].push(im.url);
  });
  const videos = (c.videos || []).filter((v) => v?.url);
  const cta = String(o.cta || '').trim();
  const base = {
    lh: String(c.longHeadline || '').trim(),
    biz: String(c.businessName || '').trim(),
    logo: (c.logos || []).find((l) => l?.url)?.url || '',
    cta: !cta || cta === 'Automated' ? 'Learn more' : cta,
    host: displayHost(String(c.finalUrl || '').trim()),
    main: HEX.test(o.mainColor || '') ? o.mainColor : '',
    accent: HEX.test(o.accentColor || '') ? o.accentColor : '',
    hasVideo: videos.length > 0,
  };
  return (i) => {
    const n = i + seed;
    return {
      ...base,
      h: at(heads, n),
      h2: at(heads, n + 1),
      d: at(descs, n),
      vtitle: String(at(videos, n)?.title || '').trim(),
      video: () => at(videos, n) || null,
      img: (shape = 'wide', k = 0) => at(FIT[shape].map((sh) => pools[sh]).find((p) => p.length) || [], n + k),
    };
  };
}

// Locked formats ("add more assets") show the layout only.
export const blankSlot = (s) => ({ ...s, h: '', h2: '', d: '', lh: '', biz: '', logo: '', host: '', vtitle: '', cta: '', main: '', accent: '', video: () => null, img: () => '' });

// Dark or light text for a colored fill.
function ink(hex) {
  const v = parseInt(hex.slice(1), 16);
  return ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114 > 165 ? '#202124' : '#fff';
}
const fillOf = (c) => (c ? { background: c, borderColor: c, color: ink(c) } : undefined);
const tintOf = (c) => (c ? { background: `color-mix(in srgb, ${c} 12%, #fff)` } : undefined);

/* ---------- Building blocks ---------- */

// Text, or grey bars while the field is empty.
export function Tx({ v, bars = 1, className = '', as: Tag = 'div', style }) {
  if (v) return <Tag className={className} style={style}>{v}</Tag>;
  return (
    <Tag className={`${className} pv-empty`} style={style} aria-hidden="true">
      {Array.from({ length: bars }, (_, k) => (
        <span key={k} className="pv-bar" style={{ width: `${bars === 1 ? 72 : k === bars - 1 ? 58 : 100}%` }} />
      ))}
    </Tag>
  );
}

// Image, or a grey box with an image icon (also when the file fails to load).
export function Im({ src, className = '' }) {
  const [bad, setBad] = useState('');
  if (!src || bad === src) {
    return <div className={`pv-ph ${className}`} aria-hidden="true"><Icon name="image" /></div>;
  }
  return <img className={`pv-img ${className}`} src={src} alt="" draggable="false" onError={() => setBad(src)} />;
}

// The ad's video in the video formats. A library video shows its first frame; a YouTube link
// gets a dark poster (its thumbnail is never fetched); no video leaves a grey box.
function Vid({ v, className = '' }) {
  const [bad, setBad] = useState('');
  if (!v?.url) return <Im src="" className={className} />;
  if (isYouTube(v.url) || bad === v.url) return <div className={`pv-vposter ${className}`} aria-hidden="true" />;
  return (
    <video className={`pv-img ${className}`} src={`${v.url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1}
      aria-hidden="true" onError={() => setBad(v.url)} />
  );
}

const AC = ({ className = '' }) => <span className={`pv-ac ${className}`} aria-hidden="true"><Icon name="info" /></span>;
const Go = ({ s, className = '' }) => <span className={`pv-go ${className}`} style={fillOf(s.accent)}><Icon name="chevron_right" /></span>;
const X = ({ className = '' }) => <span className={`pvf-x ${className}`} aria-hidden="true"><Icon name="close" /></span>;
const AdBadge = ({ yt }) => <span className={`pv-adb${yt ? ' yt' : ''}`}>Ad</span>;
const Lines = ({ n, top }) => (
  <div className={`pv-lines${top ? ' top' : ''}`} aria-hidden="true">{Array.from({ length: n }, (_, k) => <i key={k} />)}</div>
);

export function Spinner({ size = 24 }) {
  return (
    <svg className="pv-spin" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Loading">
      <circle cx="24" cy="24" r="18" />
    </svg>
  );
}

// Phone frame. chrome: 'page' (site with a grey top bar and skeleton text around the ad),
// 'none' (full-screen ad under a blank status strip) or 'app' (Gmail / YouTube draw their own).
export function Phone({ chrome = 'page', loading, dim, label, children }) {
  let body;
  if (loading) {
    body = chrome === 'page'
      ? <><Lines n={8} top /><div className="pv-loadslot"><Spinner /></div><Lines n={30} /></>
      : <div className="pv-center"><Spinner /></div>;
  } else {
    body = chrome === 'page' ? <><Lines n={8} top /><div className="pv-slot">{children}</div><Lines n={30} /></> : children;
  }
  return (
    <div className={`pv-phone${dim ? ' dim' : ''}`} role="group" aria-label={label} aria-busy={loading || undefined}>
      <div className="pv-screen">
        {chrome === 'page' && <div className="pv-pagebar" aria-hidden="true"><Icon name="menu" /><i /><Icon name="search" /></div>}
        {chrome === 'none' && <div className="pv-status" />}
        <div className="pv-content">{body}</div>
      </div>
    </div>
  );
}

/* ---------- Display formats (mobile) ---------- */

const Native = (s) => (
  <div className="pv-card pvf-native">
    <AC />
    <Im src={s.img('wide')} className="pvf-wide" />
    <Tx className="pvf-native-h pv-l1" v={s.h} />
    <div className="pvf-row pvf-pad">
      <Im src={s.logo} className="pvf-logo pv-sm" />
      <Tx className="pvf-native-d pv-l2" v={s.d} bars={2} />
      <Go s={s} />
    </div>
  </div>
);

const Band = (s) => (
  <div className="pv-card pvf-band">
    <AC />
    <Im src={s.img('wide')} className="pvf-wide" />
    <Tx className="pvf-band-h pv-l1" v={s.h} />
    <div className="pvf-row pvf-band-row">
      <div className="pvf-grow">
        <Tx className="pvf-band-d pv-l2" v={s.d} bars={2} />
        <Tx className="pvf-band-b pv-l1" v={s.biz} />
      </div>
      <Go s={s} className="olive" />
    </div>
  </div>
);

const Inter = (s) => {
  const img = s.img('square');
  return (
    <div className="pvf-full pvf-inter pv-ct">
      <Im src={img} className="pvf-blur" />
      <div className="pvf-inter-card">
        <AC />
        <Im src={img} className="pvf-inter-img" />
        <div className="pvf-inter-body">
          <Im src={s.logo} className="pvf-inter-logo pv-sm" />
          <Tx className="pvf-inter-h pv-l2" v={s.h} bars={2} />
          <Tx className="pvf-inter-d pv-l2" v={s.d} bars={2} />
          <div className="pvf-btns">
            <span className="pvf-btn">Close</span>
            <span className="pvf-btn raised" style={fillOf(s.accent)}>{s.cta}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const Big = (s) => (
  <div className="pv-card pvf-big">
    <AC />
    <Im src={s.img('wide', 1)} className="pvf-wide" />
    <div className="pvf-row pvf-pad">
      <Im src={s.logo} className="pvf-logo pv-sm" />
      <Tx className="pvf-big-h pv-l3" v={s.h} bars={3} />
      <Go s={s} />
    </div>
  </div>
);

const Dark = (s) => (
  <div className="pvf-full pvf-dark pv-ct" style={fillOf(s.main)}>
    <AC />
    <Im src={s.img('wide')} className="pvf-dark-img" />
    <Tx className="pvf-dark-h pv-l2" v={s.h} bars={2} />
    <Tx className="pvf-dark-d pv-l3" v={s.d} bars={3} />
    <Tx className="pvf-dark-b pv-l1" v={s.biz} />
    <div className="pvf-btns pvf-dark-btns">
      <span className="pvf-btn grey">Close</span>
      <span className="pvf-btn" style={fillOf(s.accent)}>{s.cta}</span>
    </div>
  </div>
);

const Hero = (s) => (
  <div className="pvf-full pvf-hero" style={tintOf(s.main)}>
    <div className="pvf-hero-top">
      <AC className="tl" />
      <Im src={s.logo} className="pvf-hero-logo pv-sm" />
      <Tx as="span" className="pvf-hero-biz pv-l1" v={s.biz} />
      <X />
    </div>
    <Tx className={`pvf-hero-h pv-l3${s.h.length > 14 ? ' long' : ''}`} v={s.h} bars={2} />
    <Tx className="pvf-hero-d pv-l4" v={s.d} bars={3} />
    <Im src={s.img('wide')} className="pvf-hero-img" />
    <div className="pvf-hero-cta" style={fillOf(s.main)}>
      <span className="pv-l1">{s.cta}</span>
      <Icon name="chevron_right" />
    </div>
  </div>
);

const Box = (s) => (
  <div className="pvf-box pv-ct">
    <AC />
    <Im src={s.img('wide', 1)} className="pvf-box-bg" />
    <div className="pvf-box-card">
      <Im src={s.logo} className="pvf-box-logo pv-sm" />
      <Tx className="pvf-box-h pv-l1" v={s.h} />
      <Tx className="pvf-box-d pv-l2" v={s.d} bars={2} />
      <div className="pvf-box-cta pv-l1" style={fillOf(s.accent)}>{s.cta}</div>
    </div>
  </div>
);

const Foot = ({ s }) => (
  <div className="pvf-foot">
    <Tx as="span" className="pvf-foot-b pv-l1" v={s.biz} />
    <span className="pvf-link">{s.cta}<Icon name="chevron_right" /></span>
  </div>
);

const Open = (s) => (
  <div className="pv-card pvf-open">
    <AC />
    <Im src={s.img('wide')} className="pvf-wide" />
    <div className="pvf-open-body">
      <Tx className="pvf-open-h pv-l1" v={s.h} />
      <Tx className="pvf-open-d pv-l2" v={s.d} bars={2} />
      <Foot s={s} />
    </div>
  </div>
);

const Split = (s) => (
  <div className="pvf-full pvf-split">
    <div className="pvf-split-media">
      <Im src={s.img('wide')} className="pvf-split-img" />
      <X className="tl" />
      <AC />
    </div>
    <Im src={s.logo} className="pvf-split-logo pv-sm" />
    <Tx className="pvf-split-h pv-l2" v={s.h} />
    <Tx className="pvf-split-d pv-l3" v={s.d} bars={3} />
    <Tx className="pvf-split-b pv-l1" v={s.biz} />
    <div className="pvf-split-cta"><span className="pv-l1">{s.cta}</span><Icon name="chevron_right" /></div>
  </div>
);

const Overlay = (s) => (
  <div className="pvf-full pvf-ov pv-ct" style={fillOf(s.main)}>
    <Im src={s.img('tall')} className="pvf-blur soft" />
    <div className="pvf-shade" />
    <X className="tr" />
    <div className="pvf-ov-in">
      <Tx className="pvf-ov-b pv-l1" v={s.biz} />
      <Tx className="pvf-ov-h pv-l3" v={s.h} bars={2} />
      <Tx className="pvf-ov-d pv-l3" v={s.d} bars={2} />
      <div className="pvf-ov-media">
        <Im src={s.img('wide', 1)} className="pvf-wide" />
        <Im src={s.logo} className="pvf-ov-logo pv-sm" />
      </div>
      <span className="pvf-pill pv-l1" style={fillOf(s.accent)}>{s.cta}</span>
    </div>
    <AC className="bl" />
  </div>
);

const Full = (s) => (
  <div className="pvf-full pvf-fi pv-ct">
    <Im src={s.img('tall', 2)} className="pvf-cover" />
    <div className="pvf-shade" />
    <X className="tr" />
    <Tx className="pvf-fi-b pv-l2" v={s.biz} />
    <span className="pvf-pill pvf-fi-cta pv-l1" style={fillOf(s.accent)}>{s.cta}</span>
    <AC className="bl" />
  </div>
);

const LinkCard = (s, withDesc) => (
  <div className={`pv-card pvf-lk${withDesc ? ' d' : ''}`}>
    <AC />
    <Im src={s.img('wide', withDesc ? 1 : 0)} className="pvf-wide" />
    <div className="pvf-open-body">
      <div className="pvf-row top">
        <Im src={s.logo} className="pvf-logo pv-sm" />
        <div className="pvf-grow">
          <Tx className="pvf-lk-h pv-l2" v={withDesc ? s.h : s.lh} bars={withDesc ? 1 : 2} />
          {withDesc && <Tx className="pvf-lk-d pv-l2" v={s.d} bars={2} />}
        </div>
      </div>
      <Foot s={s} />
    </div>
  </div>
);

const Banner = (s) => (
  <div className="pvf-banner">
    <AC />
    <Im src={s.img('square')} className="pvf-banner-img" />
    <div className="pvf-grow">
      <Tx className="pvf-banner-h pv-l1" v={s.lh} />
      <div className="pvf-meta">
        <AdBadge />
        <Tx as="span" className="pvf-meta-b pv-l1" v={s.biz} />
        <span className="pvf-obtn pv-l1">{s.cta}</span>
      </div>
    </div>
  </div>
);

const Feed = (s, shape, top) => (
  <div className={`pvf-feed${top ? ' top' : ''}`}>
    <AC />
    {top && <Tx className="pvf-feed-h pv-l1" v={s.h} />}
    <div className="pvf-feed-main">
      <Im src={s.img(shape)} className={`pvf-feed-img ${shape}`} />
      <div className="pvf-grow">
        {!top && <Tx className="pvf-feed-h pv-l1" v={s.h} />}
        <Tx className="pvf-feed-d pv-l3" v={s.d} bars={2} />
        <div className="pvf-meta">
          <AdBadge />
          <Tx as="span" className="pvf-meta-b pv-l1" v={s.biz} />
          <span className="pvf-obtn sm pv-l1">{s.cta}</span>
        </div>
      </div>
    </div>
  </div>
);

const Blue = (s) => (
  <div className="pv-card pvf-blue">
    <AC />
    <div className="pvf-row top">
      <Im src={s.logo} className="pvf-blue-logo pv-sm" />
      <Tx className="pvf-blue-h pv-l2" v={s.h} bars={2} />
    </div>
    <Tx className="pvf-blue-d pv-l3" v={s.d} bars={3} />
    <Tx className="pvf-blue-b pv-l1" v={s.biz} />
    <div className="pvf-blue-cta" style={fillOf(s.accent)}><span className="pv-l1">{s.cta}</span><Icon name="chevron_right" /></div>
  </div>
);

const TextOnly = (s) => (
  <div className="pvf-full pvf-text" style={tintOf(s.main)}>
    <Im src={s.logo} className="pvf-text-logo pv-sm" />
    <Tx className="pvf-text-h pv-l3" v={s.h} bars={3} />
    <Tx className="pvf-text-b pv-l1" v={s.biz} />
    <Tx className="pvf-text-d pv-l3" v={s.d} bars={3} />
    <div className="pvf-text-btns">
      <span className="pvf-text-btn">Close</span>
      <span className="pvf-text-btn fill pv-l1" style={fillOf(s.accent)}>{s.cta}</span>
    </div>
    <AC className="bl" />
  </div>
);

const Outlined = (s) => (
  <div className="pvf-outl">
    <div className="pvf-outl-box">
      <Tx className="pvf-outl-h pv-l3" v={s.h} bars={2} />
      <div className="pvf-row">
        <Tx className="pvf-outl-d pv-l3" v={s.d} bars={3} />
        <span className="pvf-outl-go" style={fillOf(s.accent)}><Icon name="chevron_right" /></span>
      </div>
    </div>
    <div className="pvf-under"><AC className="static" /><Tx as="span" className="pv-l1" v={s.biz} /></div>
  </div>
);

const Grad = (s) => (
  <div className="pvf-outl">
    <div className="pvf-grad-box" style={fillOf(s.main)}>
      <Tx className="pvf-grad-h pv-l2" v={s.h} bars={2} style={s.accent ? { color: s.accent } : undefined} />
      <div className="pvf-row">
        <Tx className="pvf-grad-d pv-l2" v={s.d} bars={2} />
        <span className="pvf-grad-go" style={fillOf(s.accent)}><Icon name="chevron_right" /></span>
      </div>
    </div>
    <div className="pvf-under"><AC className="static" /><Tx as="span" className="pv-l1" v={s.biz} /></div>
  </div>
);

const VideoDark = (s) => (
  <div className="pvf-full pvf-vd pv-ct" style={fillOf(s.main)}>
    <div className="pvf-vd-media">
      <Im src={s.img('square', 1)} className="pvf-vd-img" />
      <span className="pvf-play" aria-hidden="true"><Icon name="play_arrow" fill /></span>
    </div>
    <div className="pvf-vd-body">
      <Im src={s.logo} className="pvf-vd-logo pv-sm" />
      <Tx className="pvf-vd-h pv-l2" v={s.h} />
      <Tx className="pvf-vd-d pv-l2" v={s.d} bars={2} />
      <div className="pvf-btns">
        <span className="pvf-btn vclose">Close<i /><Icon name="check_circle" fill /></span>
        <span className="pvf-btn" style={fillOf(s.accent)}>{s.cta}</span>
      </div>
    </div>
    <AC className="bl" />
  </div>
);

/* ---------- Gmail (mobile) ---------- */

const GRows = ({ n }) => Array.from({ length: n }, (_, k) => (
  <div className="pvg-row" key={k} aria-hidden="true"><span className="pvg-dot" /><span className="pvg-bars"><i /><i /><i /></span></div>
));
const GNav = () => (
  <div className="pvg-nav" aria-hidden="true">
    <span className="on"><Icon name="mail" /></span>
    <span><Icon name="chat_bubble" /></span>
    <span><Icon name="videocam" /></span>
  </div>
);
// The inbox rows show the sender's initial; the opened message shows the logo when there is one.
const Initial = ({ s }) => <span className="pvg-av" aria-hidden="true">{s.biz.charAt(0).toUpperCase()}</span>;
const Avatar = ({ s }) => (s.logo ? <Im src={s.logo} className="pvg-av pv-sm" /> : <Initial s={s} />);
const GMeta = ({ s }) => (
  <div className="pvg-meta">
    <b className="pvg-sp">Sponsored</b>
    <span className="pvg-sep">·</span>
    <Tx as="b" className="pvg-biz pv-l1" v={s.biz} />
    <span className="spacer" />
    <Icon name="more_vert" />
  </div>
);

function GmailInbox({ s, variant }) {
  return (
    <div className="pvg">
      <div className="pvg-search" aria-hidden="true"><Icon name="menu" /><span className="pvg-me" /></div>
      <div className="pvg-label" />
      <div className="pvg-list">
        {variant === 'pill' && (
          <div className="pvg-ad">
            <Initial s={s} />
            <div className="pvf-grow">
              <GMeta s={s} />
              <Tx className="pvg-subj pv-l1" v={s.d} />
              <div className="pvg-pillrow"><Tx as="span" className="pvg-pill pv-l1" v={s.h2} /><Icon name="star" /></div>
            </div>
          </div>
        )}
        {variant === 'image' && (
          <div className="pvg-ad">
            <Initial s={s} />
            <div className="pvf-grow">
              <GMeta s={s} />
              <div className="pvg-subjrow"><Tx className="pvg-subj pv-l1" v={s.h} /><Icon name="open_in_new" /></div>
              <Tx className="pvg-desc pv-l2" v={s.d} bars={2} />
              <Im src={s.img('wide')} className="pvg-img" />
            </div>
          </div>
        )}
        <GRows n={7} />
      </div>
      {variant === 'bottom' && (
        <div className="pvg-bad">
          <Im src={s.img('wide')} className="pvg-bad-img pv-sm" />
          <div className="pvf-grow">
            <div className="pvg-meta">
              <b className="pvg-sp">Ad</b>
              <span className="pvg-sep">·</span>
              <Tx as="b" className="pvg-biz pv-l1" v={s.biz} />
              <Icon name="open_in_new" />
            </div>
            <Tx className="pvg-subj pv-l1" v={s.h} />
          </div>
          <Icon name="more_vert" />
        </div>
      )}
      <GNav />
    </div>
  );
}

function GmailOpen({ s, variant = 0 }) {
  const square = variant === 2;
  const img = <Im src={s.img(square ? 'square' : 'wide')} className={`pvg-oimg${square ? ' sq' : ''}`} />;
  return (
    <div className="pvg pvg-open">
      <div className="pvg-otop" aria-hidden="true">
        <Icon name="arrow_back" /><span className="spacer" /><Icon name="archive" /><Icon name="delete" /><Icon name="mail" /><Icon name="more_vert" />
      </div>
      <div className="pvg-obody">
        <div className="pvg-osubj"><Tx as="span" className="pvg-osubj-t" v={s.h} /><span className="pvg-tag">Ad</span></div>
        <div className="pvg-osender">
          <Avatar s={s} />
          <div className="pvf-grow">
            <Tx as="b" className="pvg-ofrom pv-l1" v={s.biz} />
            <Tx className="pvg-ohost pv-l1" v={s.host} />
          </div>
          <Icon name="star" />
          <Icon name="reply" />
        </div>
        {variant !== 1 && img}
        <Tx className="pvg-oh" v={s.lh} bars={2} />
        <Tx className="pvg-od" v={s.d} bars={3} />
        {variant === 1 && img}
        <span className="pvg-octa pv-l1" style={fillOf(s.accent)}>{s.cta}</span>
      </div>
    </div>
  );
}

/* ---------- YouTube (mobile) ---------- */

const YtHead = () => (
  <div className="pvy-head" aria-hidden="true">
    <span className="pvy-brand"><Icon name="smart_display" fill />YouTube</span>
    <span className="spacer" />
    <Icon name="cast" /><Icon name="notifications" /><Icon name="search" />
  </div>
);
const Play = ({ big }) => <span className={`pvy-play${big ? ' big' : ''}`} aria-hidden="true"><Icon name="play_arrow" fill /></span>;
const YtVideo = () => <div className="pvy-video" aria-hidden="true"><Play /></div>;
const YtChannel = () => <div className="pvy-chan" aria-hidden="true"><span /><span className="pvg-bars"><i /><i /></span></div>;
const YtNav = () => <div className="pvy-nav" aria-hidden="true"><i /><i /><Icon name="add_circle" /><i /><i /></div>;
const YtMeta = ({ s }) => <div className="pvy-meta"><AdBadge yt /><Tx as="span" className="pvy-biz pv-l1" v={s.biz} /></div>;

function YtWatch({ s }) {
  return (
    <div className="pvy">
      <YtVideo />
      <div className="pvy-chips" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="pvy-bar" />
      <div className="pvy-adrow">
        <Im src={s.img('wide')} className="pvy-adrow-img" />
        <div className="pvf-grow">
          <Tx className="pvy-adrow-h pv-l2" v={s.h} bars={2} />
          <YtMeta s={s} />
          <span className="pvy-obtn pv-l1">{s.cta}</span>
        </div>
      </div>
      <YtVideo />
      <YtChannel />
    </div>
  );
}

function YtHome({ s }) {
  return (
    <div className="pvy">
      <YtHead />
      <div className="pvy-card">
        <Im src={s.img('wide', 1)} className="pvf-wide" />
        <Tx className="pvy-card-h pv-l1" v={s.h} />
        <Tx className="pvy-card-d pv-l1" v={s.d} />
        <div className="pvy-card-foot">
          <div className="pvf-grow"><Tx className="pvy-biz pv-l1" v={s.biz} /><AdBadge yt /></div>
          <span className="pvy-obtn pv-l1">{s.cta}</span>
        </div>
      </div>
      <YtVideo />
      <YtChannel />
      <YtNav />
    </div>
  );
}

/* ---------- Video formats (need a video; greyed out until one is added) ---------- */

function VInstream({ s }) {
  return (
    <div className="pvy">
      <div className="pvy-video media">
        <Vid v={s.video()} className="pvy-fill" />
        <Play big />
        <div className="pvy-adbar"><AdBadge yt /><Tx as="span" className="pv-l1" v={s.host} /></div>
        <i className="pvy-prog" />
      </div>
      <div className="pvy-comp">
        <Im src={s.logo} className="pvy-comp-logo pv-sm" />
        <div className="pvf-grow">
          <Tx className="pvy-comp-h pv-l1" v={s.vtitle || s.h} />
          <Tx className="pvy-comp-u pv-l1" v={s.host} />
        </div>
        <span className="pvy-fbtn pv-l1" style={fillOf(s.accent)}>{s.cta}</span>
      </div>
      <div className="pvy-chips" aria-hidden="true"><i /><i /><i /><i /></div>
      <YtVideo />
      <YtChannel />
      <YtVideo />
    </div>
  );
}

function VShorts({ s }) {
  return (
    <div className="pvy pvy-shorts">
      <Vid v={s.video()} className="pvy-fill" />
      <div className="pvf-shade" />
      <Play big />
      <div className="pvy-rail" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="pvy-sh">
        <div className="pvy-sh-who">
          <Im src={s.logo} className="pvy-sh-logo pv-sm" />
          <Tx as="span" className="pvy-sh-biz pv-l1" v={s.biz} />
          <AdBadge yt />
        </div>
        <Tx className="pvy-sh-h pv-l2" v={s.vtitle || s.h} bars={2} />
        <span className="pvy-sh-cta pv-l1" style={fillOf(s.accent)}>{s.cta}</span>
      </div>
    </div>
  );
}

function VFeed({ s }) {
  return (
    <div className="pvy">
      <YtHead />
      <div className="pvy-video media big">
        <Vid v={s.video()} className="pvy-fill" />
        <Play big />
        <span className="pvy-dur" />
      </div>
      <div className="pvy-fmeta">
        <Im src={s.logo} className="pvy-flogo pv-sm" />
        <div className="pvf-grow">
          <Tx className="pvy-fh pv-l2" v={s.vtitle || s.h} bars={2} />
          <YtMeta s={s} />
        </div>
        <Icon name="more_vert" />
      </div>
      <span className="pvy-wbtn pv-l1">{s.cta}</span>
      <YtVideo />
      <YtChannel />
      <YtNav />
    </div>
  );
}

/* ---------- Registry ---------- */

export const FORMATS = {
  native: { name: 'Native card', chrome: 'page', el: Native },
  inter: { name: 'Interstitial', chrome: 'none', el: Inter },
  big: { name: 'Landscape with large title', chrome: 'page', el: Big },
  band: { name: 'Native card with title band', chrome: 'page', el: Band },
  dark: { name: 'Dark interstitial', chrome: 'none', el: Dark },
  hero: { name: 'Text interstitial', chrome: 'none', el: Hero },
  box: { name: 'Image with card', chrome: 'page', el: Box },
  open: { name: 'Image card', chrome: 'page', el: Open },
  split: { name: 'Split interstitial', chrome: 'none', el: Split },
  overlay: { name: 'Image with text overlay', chrome: 'none', el: Overlay },
  link: { name: 'Image card with logo', chrome: 'page', el: (s) => LinkCard(s, false) },
  linkd: { name: 'Image card with description', chrome: 'page', el: (s) => LinkCard(s, true) },
  banner: { name: 'Small banner', chrome: 'page', el: Banner },
  feed: { name: 'In-feed', chrome: 'page', el: (s) => Feed(s, 'square', false) },
  feedw: { name: 'In-feed, landscape', chrome: 'page', el: (s) => Feed(s, 'wide', false) },
  feedt: { name: 'In-feed, title on top', chrome: 'page', el: (s) => Feed(s, 'square', true) },
  feedt2: { name: 'In-feed, title on top, landscape', chrome: 'page', el: (s) => Feed(s, 'wide', true) },
  blue: { name: 'Card with button', chrome: 'page', el: Blue },
  text: { name: 'Text interstitial with buttons', chrome: 'none', el: TextOnly },
  outlined: { name: 'Outlined text card', chrome: 'page', el: Outlined },
  grad: { name: 'Dark text card', chrome: 'page', el: Grad },
  vdark: { name: 'Image interstitial', chrome: 'none', el: VideoDark },
  full: { name: 'Full-screen image', chrome: 'none', el: Full },
  gbottom: { name: 'Gmail inbox', chrome: 'app', el: (s) => <GmailInbox s={s} variant="bottom" /> },
  gpill: { name: 'Gmail inbox', chrome: 'app', el: (s) => <GmailInbox s={s} variant="pill" /> },
  gimage: { name: 'Gmail inbox with image', chrome: 'app', el: (s) => <GmailInbox s={s} variant="image" /> },
  gopen: { name: 'Gmail message', chrome: 'app', el: (s) => <GmailOpen s={s} variant={0} /> },
  gopen1: { name: 'Gmail message', chrome: 'app', el: (s) => <GmailOpen s={s} variant={1} /> },
  gopen2: { name: 'Gmail message', chrome: 'app', el: (s) => <GmailOpen s={s} variant={2} /> },
  ywatch: { name: 'YouTube watch page', chrome: 'app', el: (s) => <YtWatch s={s} /> },
  yhome: { name: 'YouTube home feed', chrome: 'app', el: (s) => <YtHome s={s} /> },
  vinstream: { name: 'In-stream video', chrome: 'app', el: (s) => <VInstream s={s} /> },
  vshorts: { name: 'Vertical video', chrome: 'app', el: (s) => <VShorts s={s} /> },
  vfeed: { name: 'In-feed video', chrome: 'app', el: (s) => <VFeed s={s} /> },
};

// The order the full preview shows them in (rows of three, like the reference).
export const DISPLAY_ORDER = [
  'native', 'inter', 'big',
  'band', 'dark', 'native',
  'hero', 'box', 'open',
  'split', 'overlay', 'link',
  'linkd', 'banner', 'feed',
  'feedw', 'feedt', 'feedt2',
  'blue', 'text', 'outlined',
  'grad', 'vdark', 'full',
];
export const GMAIL_CLOSED = ['gbottom', 'gpill', 'gimage'];
export const GMAIL_OPEN = ['gopen', 'gopen1', 'gopen2'];
export const YOUTUBE = ['ywatch', 'yhome'];
export const VIDEO = ['vinstream', 'vshorts', 'vfeed'];

export function MobileFormat({ id, s, loading, dim }) {
  const f = FORMATS[id];
  if (!f) return null;
  return <Phone chrome={f.chrome} loading={loading} dim={dim} label={f.name}>{loading ? null : f.el(s)}</Phone>;
}

/* ---------- Desktop (browser window, scaled to fit) ---------- */

const WIN_W = 1000;
const WIN_H = 720;

function Scaled({ children }) {
  const ref = useRef(null);
  const [k, setK] = useState(0.5);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => setK(Math.min(1, el.clientWidth / WIN_W) || 0.5);
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="pvd-scaled" style={{ height: WIN_H * k }}>
      <div style={{ width: WIN_W, height: WIN_H, transform: `scale(${k})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  );
}

const DLines = ({ n }) => <div className="pvd-lines" aria-hidden="true">{Array.from({ length: n }, (_, k) => <i key={k} />)}</div>;

function DPage({ top, side, inMain }) {
  return (
    <div className="pvd-page">
      <div className="pvd-head" aria-hidden="true"><b /><i /><i /><i /><i /><Icon name="search" /></div>
      {top && <div className="pvd-top">{top}</div>}
      <div className="pvd-cols">
        <div className="pvd-main">
          <div className="pvd-title" aria-hidden="true" />
          <DLines n={inMain ? 5 : 7} />
          {inMain}
          <DLines n={24} />
        </div>
        <div className="pvd-side">{side || <DLines n={30} />}</div>
      </div>
    </div>
  );
}

const Leader = ({ s }) => (
  <div className="pvd-ad pvd-leader">
    <AC />
    <Im src={s.img('wide')} className="pvd-leader-img" />
    <div className="pvf-grow">
      <Tx className="pvd-leader-h pv-l1" v={s.h} />
      <Tx className="pvd-leader-d pv-l2" v={s.d} bars={2} />
    </div>
    <Im src={s.logo} className="pvd-leader-logo pv-sm" />
    <span className="pvd-cta pv-l1" style={fillOf(s.accent)}>{s.cta}</span>
  </div>
);

const Rect = ({ s }) => (
  <div className="pvd-ad pvd-rect">
    <AC />
    <Im src={s.img('wide', 1)} className="pvd-rect-img" />
    <div className="pvf-row pvd-rect-body">
      <div className="pvf-grow">
        <Tx className="pvd-rect-h pv-l2" v={s.h} />
        <Tx className="pvd-rect-b pv-l1" v={s.biz} />
      </div>
      <Go s={s} />
    </div>
  </div>
);

const Half = ({ s }) => (
  <div className="pvd-ad pvd-half" style={tintOf(s.main)}>
    <AC />
    <Im src={s.logo} className="pvd-half-logo pv-sm" />
    <Tx className="pvd-half-h pv-l3" v={s.lh} bars={3} />
    <Tx className="pvd-half-d pv-l3" v={s.d} bars={2} />
    <Im src={s.img('square')} className="pvd-half-img" />
    <span className="pvd-cta block pv-l1" style={fillOf(s.accent)}>{s.cta}</span>
  </div>
);

const NativeD = ({ s }) => (
  <div className="pvd-ad pvd-native">
    <AC />
    <Im src={s.img('wide')} className="pvd-native-img" />
    <div className="pvf-grow">
      <Tx className="pvd-native-h pv-l2" v={s.lh || s.h} />
      <Tx className="pvd-native-d pv-l2" v={s.d} bars={2} />
      <div className="pvf-foot">
        <Tx as="span" className="pvf-foot-b pv-l1" v={s.biz} />
        <span className="pvf-link">{s.cta}<Icon name="chevron_right" /></span>
      </div>
    </div>
  </div>
);

function GmailDesk({ s, open }) {
  return (
    <div className="pvd-gm">
      <div className="pvd-gm-top" aria-hidden="true">
        <Icon name="menu" /><span className="pvd-gm-logo"><Icon name="mail" /><i /></span>
        <span className="pvd-gm-search"><Icon name="search" /></span>
        <span className="spacer" /><span className="pvd-gm-me" />
      </div>
      <div className="pvd-gm-body">
        <div className="pvd-gm-side" aria-hidden="true">
          <span className="pvd-gm-compose"><Icon name="edit" /><i /></span>
          <i className="on" /><i /><i /><i /><i /><i />
        </div>
        <div className="pvd-gm-main">
          {open ? (
            <>
              <div className="pvd-gm-tools" aria-hidden="true"><Icon name="arrow_back" /><Icon name="archive" /><Icon name="delete" /><Icon name="mail" /><Icon name="more_vert" /></div>
              <div className="pvd-gm-open">
                <div className="pvg-osubj big"><Tx as="span" className="pvg-osubj-t" v={s.h} /><span className="pvg-tag">Ad</span></div>
                <div className="pvg-osender">
                  <Avatar s={s} />
                  <div className="pvf-grow"><Tx as="b" className="pvg-ofrom pv-l1" v={s.biz} /><Tx className="pvg-ohost pv-l1" v={s.host} /></div>
                  <Icon name="star" /><Icon name="reply" />
                </div>
                <Im src={s.img('wide')} className="pvd-gm-img" />
                <Tx className="pvd-gm-oh" v={s.lh} bars={2} />
                <Tx className="pvd-gm-od" v={s.d} bars={2} />
                <span className="pvd-cta pv-l1" style={fillOf(s.accent)}>{s.cta}</span>
              </div>
            </>
          ) : (
            <>
              <div className="pvd-gm-tabs" aria-hidden="true"><i className="on" /><i /><i /></div>
              <div className="pvd-gm-ad">
                <span className="pvd-gm-from"><span className="pvg-tag">Ad</span><Tx as="b" className="pv-l1" v={s.biz} /></span>
                <span className="pvd-gm-line pv-l1">
                  <Tx as="b" v={s.h} />
                  <span className="pvd-gm-dash">-</span>
                  <Tx as="span" className="pvd-gm-d" v={s.d} />
                </span>
                <Im src={s.img('wide')} className="pvd-gm-thumb pv-sm" />
                <Icon name="more_vert" />
              </div>
              {Array.from({ length: 13 }, (_, k) => (
                <div className="pvd-gm-row" key={k} aria-hidden="true"><i /><i /><i /></div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function YtDesk({ s, video }) {
  return (
    <div className="pvd-yt">
      <div className="pvd-yt-head" aria-hidden="true">
        <Icon name="menu" />
        <span className="pvy-brand"><Icon name="smart_display" fill />YouTube</span>
        <span className="pvd-yt-search"><Icon name="search" /></span>
        <Icon name="videocam" /><Icon name="notifications" /><span className="pvd-gm-me" />
      </div>
      <div className="pvd-yt-body">
        <div className="pvd-yt-main">
          <div className="pvd-yt-player media">
            {video && <Vid v={s.video()} className="pvy-fill" />}
            <Play big />
            {video && <div className="pvy-adbar"><AdBadge yt /><Tx as="span" className="pv-l1" v={s.host} /></div>}
            {video && <i className="pvy-prog" />}
          </div>
          <div className="pvd-yt-title" aria-hidden="true" />
          <YtChannel />
          <DLines n={4} />
        </div>
        <div className="pvd-yt-side">
          <div className="pvd-yt-comp">
            <Im src={s.logo} className="pvy-comp-logo pv-sm" />
            <div className="pvf-grow"><Tx className="pvy-comp-h pv-l1" v={s.h} /><Tx className="pvy-comp-u pv-l1" v={s.host} /></div>
            <span className="pvy-fbtn pv-l1" style={fillOf(s.accent)}>{s.cta}</span>
          </div>
          {!video && (
            <div className="pvy-adrow">
              <Im src={s.img('wide', 1)} className="pvy-adrow-img" />
              <div className="pvf-grow">
                <Tx className="pvy-adrow-h pv-l2" v={s.lh || s.h} bars={2} />
                <YtMeta s={s} />
                <span className="pvy-obtn pv-l1">{s.cta}</span>
              </div>
            </div>
          )}
          {Array.from({ length: 6 }, (_, k) => (
            <div className="pvd-yt-rel" key={k} aria-hidden="true"><span /><span className="pvg-bars"><i /><i /><i /></span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const DESK = {
  leader: { name: 'Leaderboard (728 × 90)', el: (s) => <DPage top={<Leader s={s} />} /> },
  rect: { name: 'Medium rectangle (300 × 250)', el: (s) => <DPage side={<><Rect s={s} /><DLines n={16} /></>} /> },
  half: { name: 'Half page (300 × 600)', el: (s) => <DPage side={<Half s={s} />} /> },
  nativeD: { name: 'In-article native', el: (s) => <DPage inMain={<NativeD s={s} />} /> },
  gmailD: { name: 'Gmail inbox', el: (s) => <GmailDesk s={s} /> },
  gmailDOpen: { name: 'Gmail message', el: (s) => <GmailDesk s={s} open /> },
  ytD: { name: 'YouTube watch page', el: (s) => <YtDesk s={s} /> },
  ytVideoD: { name: 'In-stream video', el: (s) => <YtDesk s={s} video /> },
};
export const DESK_DISPLAY = ['leader', 'rect', 'half', 'nativeD'];

export function DesktopFormat({ id, s, loading, dim }) {
  const f = DESK[id];
  if (!f) return null;
  return (
    <div className={`pvd-item${dim ? ' dim' : ''}`} role="group" aria-label={f.name} aria-busy={loading || undefined}>
      <Scaled>
        <div className="pvd-win">
          <div className="pvd-bar" aria-hidden="true"><i /><i /><i /><span className="pvd-url" /></div>
          <div className="pvd-view">{loading ? <div className="pv-center"><Spinner size={44} /></div> : f.el(s)}</div>
        </div>
      </Scaled>
      <div className="pvd-cap">{f.name}</div>
    </div>
  );
}
