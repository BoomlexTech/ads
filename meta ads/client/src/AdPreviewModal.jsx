import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdPreview } from './Editors.jsx';
import './fid-preview.css';
import {
  IcExpand, IcShare, IcInfo, IcInfoFill, IcCaret, IcClose, IcDevAll, IcDevSquare, IcDevPortrait, IcDevWide, IcOk, IcVideoBadge, IcNoMedia,
} from './fid-preview-icons.jsx';
import emptyIll from './assets/preview/empty-ill.png';

// The "Ad preview" dialog opened by the toolbar's Preview button.
//   ads: the selected ad rows (each has name, media {url,type}, pageName, primaryText, headline, description, cta, websiteUrl, displayLink)
//   onClose()
//   toast(msg, isError)  optional: the app's toast; without it the dialog shows its own small message
const DEVICES = [
  { id: 'feed', label: 'Desktop and mobile', Icon: IcDevAll },
  { id: 'square', label: 'Square', Icon: IcDevSquare },
  { id: 'story', label: 'Portrait', Icon: IcDevPortrait },
  { id: 'wide', label: 'Landscape', Icon: IcDevWide },
];
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const keyOf = (a, i) => String(a.id ?? a.entityId ?? a._id ?? i);
const hasMedia = (a) => !!a?.media?.url;
// an ad has something to show when it carries media or any of its creative texts
const hasCreative = (a) => !!(a && (hasMedia(a) || a.primaryText || a.headline || a.description || a.websiteUrl || a.displayLink));
const creativeOf = (a) => ({
  pageName: a.pageName || '', primaryText: a.primaryText || '', headline: a.headline || '', description: a.description || '',
  cta: a.cta || '', websiteUrl: a.websiteUrl || '', displayLink: a.displayLink || '',
});

// one tile of the strip: the ad's picture (or video poster) or a neutral tile
function Tile({ ad, on, onClick }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [ad.media?.url]);
  const m = hasMedia(ad) && !broken ? ad.media : null;
  return (
    <button type="button" className={'fid-pv-tile thumb' + (on ? ' on' : '') + (m ? '' : ' none')} aria-pressed={on} aria-label={ad.name || 'Ad'} title={ad.name || undefined} onClick={onClick}>
      {m && (m.type === 'video'
        ? <video src={m.url + '#t=0.1'} muted playsInline preload="metadata" tabIndex={-1} onError={() => setBroken(true)} />
        : <img src={m.url} alt="" draggable="false" onError={() => setBroken(true)} />)}
      {!m && <IcNoMedia />}
      {m && m.type === 'video' && <IcVideoBadge />}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="fid-pv-empty">
      <img src={emptyIll} alt="" draggable="false" />
      <div className="fid-pv-empty-t">There is no preview to show for this ad.</div>
    </div>
  );
}

export default function AdPreviewModal({ ads = [], onClose, toast }) {
  const list = Array.isArray(ads) ? ads : [];
  const [sel, setSel] = useState('all');          // 'all' or the key of one ad
  const [device, setDevice] = useState('feed');
  const [banner, setBanner] = useState(true);
  const [menu, setMenu] = useState(false);
  const [adv, setAdv] = useState(false);
  const [scrolled, setScrolled] = useState(false);   // body scrolled down: shadow under the header
  const [more, setMore] = useState(false);            // more content below: shadow above the footer
  const bodyRef = useRef(null);
  const [note, setNote] = useState('');
  const dlg = useRef(null);
  const shareRef = useRef(null);
  const shBtn = useRef(null);
  const down = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const menuOpen = useRef(false);
  menuOpen.current = menu;

  const tell = useCallback((msg, err) => {
    if (typeof toast === 'function') { toast(msg, err); return; }
    setNote(msg);
  }, [toast]);
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(''), 2600); return () => clearTimeout(t); }, [note]);

  // focus moves into the dialog and goes back to where it was; Tab stays inside; Escape closes (the open menu first).
  // While the dialog is open it owns the keyboard: every key is handled here and none reaches the page behind it
  // (the app's "/" search shortcut, Ctrl+Shift+/ shortcuts, ...). Default actions (typing into nothing, Enter/Space on a button) still run.
  useEffect(() => {
    const prev = document.activeElement;
    dlg.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      const d = dlg.current;
      const t = e.target instanceof Element ? e.target : null;
      if (e.key === 'Escape') {
        if (menuOpen.current) { setMenu(false); shBtn.current?.focus({ preventScroll: true }); } else closeRef.current && closeRef.current();
      } else if (e.key === 'Tab' && d) {
        const f = [...d.querySelectorAll(FOCUSABLE)].filter((x) => x.tabIndex >= 0 && (x.offsetParent !== null || x === document.activeElement));
        if (!f.length) e.preventDefault();
        else {
          const first = f[0], last = f[f.length - 1], cur = document.activeElement;
          if (!d.contains(cur)) { e.preventDefault(); first.focus(); }
          else if (e.shiftKey && (cur === first || cur === d)) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
        }
      } else if (d && t && !e.ctrlKey && !e.altKey && !e.metaKey && t.closest('.fid-pv-devs') && /^(Arrow(Right|Down|Left|Up)|Home|End)$/.test(e.key)) {
        // device radios: arrows move the selection and the focus (wrapping), only the selected one is a tab stop
        e.preventDefault();
        const btns = [...d.querySelectorAll('.fid-pv-d')];
        const at = btns.indexOf(t.closest('.fid-pv-d'));
        const n = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1
          : (at + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
        if (btns[n]) { setDevice(DEVICES[n].id); btns[n].focus({ preventScroll: true }); }
      } else if (d && t && !e.ctrlKey && !e.altKey && !e.metaKey && t.closest('.fid-pv-menu') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const items = [...d.querySelectorAll('.fid-pv-mi')];
        const at = items.indexOf(t.closest('.fid-pv-mi'));
        items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus({ preventScroll: true });
      }
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (prev && prev.focus && document.contains(prev)) { try { prev.focus({ preventScroll: true }); } catch { /* ignore */ } }
    };
  }, []);

  // the share menu closes when something else is clicked
  useEffect(() => {
    if (!menu) return undefined;
    const h = (e) => { if (shareRef.current && !shareRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);

  const keys = list.map(keyOf);
  const cur = sel === 'all' ? null : list[keys.indexOf(sel)] || null;
  const shown = sel === 'all' || !cur ? list : [cur];
  const link = (cur ? [cur] : list).map((a) => a.websiteUrl).find(Boolean) || '';
  const mediaAd = (cur ? [cur] : list).find(hasMedia);

  // old-fashioned copy through a hidden textarea inside the dialog (works without the async clipboard API, in iframes, on http)
  const legacyCopy = (text) => {
    const host = dlg.current || document.body;
    const prev = document.activeElement;
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.setAttribute('aria-hidden', 'true');
    t.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    host.appendChild(t);
    let ok = false;
    try { t.focus({ preventScroll: true }); t.select(); ok = !!document.execCommand('copy'); } catch { ok = false; }
    t.remove();
    if (prev && prev.focus) { try { prev.focus({ preventScroll: true }); } catch { /* ignore */ } }
    return ok;
  };
  const copyLink = async () => {
    setMenu(false);
    shBtn.current?.focus({ preventScroll: true });
    if (!link) { tell('This ad has no website link to copy', true); return; }
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(link); ok = true; }
    } catch { ok = false; }   // permission denied, no focus, blocked in an iframe ...
    if (!ok) ok = legacyCopy(link);
    tell(ok ? 'Link copied to clipboard' : 'Could not copy the link', !ok);
  };
  const openMedia = () => {
    setMenu(false);
    shBtn.current?.focus({ preventScroll: true });
    if (mediaAd) window.open(mediaAd.media.url, '_blank', 'noopener');
  };

  const syncShadows = useCallback(() => {
    const b = bodyRef.current;
    if (!b) return;
    setScrolled(b.scrollTop > 0);
    setMore(b.scrollTop + b.clientHeight < b.scrollHeight - 1);
  }, []);
  useEffect(() => {
    syncShadows();
    const t = setTimeout(syncShadows, 300); // images and videos settle later
    window.addEventListener('resize', syncShadows);
    return () => { clearTimeout(t); window.removeEventListener('resize', syncShadows); };
  }, [syncShadows, sel, device, banner, adv, list.length]);

  const onOverlayDown = (e) => { down.current = e.target === e.currentTarget; };
  const onOverlayUp = (e) => { if (down.current && e.target === e.currentTarget) onClose && onClose(); down.current = false; };

  const single = shown.length === 1;
  return (
    <div className="fid-pv-overlay" onMouseDown={onOverlayDown} onMouseUp={onOverlayUp}>
      <div className="fid-pv" role="dialog" aria-modal="true" aria-labelledby="fid-pv-title" tabIndex={-1} ref={dlg}>
        <div className={'fid-pv-head' + (scrolled ? ' sh' : '')}>
          <h2 id="fid-pv-title">Ad preview</h2>
          <button type="button" className="fid-pv-x" aria-label="Close" onClick={onClose}><IcClose /></button>
        </div>

        <div className="fid-pv-body" ref={bodyRef} onScroll={syncShadows}>
          <div className="fid-pv-main">
            <div className="fid-pv-top">
              <h3 className="fid-pv-sec">Ad preview</h3>
              <div className="fid-pv-btns">
                <button type="button" className={'fid-pv-btn fid-pv-adv' + (adv ? ' on' : '')} aria-pressed={adv} onClick={() => setAdv((v) => !v)}>
                  <IcExpand /><span>Advanced preview</span>
                </button>
                <div className="fid-pv-share" ref={shareRef}>
                  <button type="button" ref={shBtn} className={'fid-pv-btn fid-pv-sh' + (menu ? ' open' : '')} aria-label="Share" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                    <IcShare /><IcCaret />
                  </button>
                  {menu && (
                    <div className="fid-pv-menu" role="menu">
                      <button type="button" role="menuitem" className="fid-pv-mi" onClick={copyLink}>Copy link to preview</button>
                      {mediaAd && <button type="button" role="menuitem" className="fid-pv-mi" onClick={openMedia}>{mediaAd.media.type === 'video' ? 'Open video in new tab' : 'Open image in new tab'}</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="fid-pv-dev" role="radiogroup" aria-label="Preview device">
              <div className="fid-pv-devs">
                {DEVICES.map(({ id, label, Icon }) => (
                  <button key={id} type="button" role="radio" aria-checked={device === id} aria-label={label} tabIndex={device === id ? 0 : -1} className={'fid-pv-d' + (device === id ? ' on' : '')} onClick={() => setDevice(id)}><Icon /></button>
                ))}
              </div>
              <span className="fid-pv-okc" role="img" aria-label="No issues found"><IcOk /></span>
            </div>

            <div className="fid-pv-tiles">
              <button type="button" className={'fid-pv-tile fid-pv-all' + (sel === 'all' ? ' on' : '')} aria-pressed={sel === 'all'} onClick={() => setSel('all')}>All</button>
              {list.map((a, i) => <Tile key={keys[i]} ad={a} on={sel === keys[i]} onClick={() => setSel(keys[i])} />)}
            </div>

            {banner && (
              <div className="fid-pv-banner" role="note">
                <span className="fid-pv-bi"><IcInfo /></span>
                <p>We may also deliver your media on other supported placements when it's likely to improve performance.</p>
                <button type="button" className="fid-pv-bx" aria-label="Dismiss" onClick={() => setBanner(false)}><IcClose /></button>
              </div>
            )}

            <div className={'fid-pv-canvas' + ((single && !hasCreative(shown[0])) || shown.length === 0 ? ' lone' : '') + (single ? '' : ' stack')} data-device={device} data-adv={adv ? '1' : undefined}>
              {shown.length === 0 && <EmptyState />}
              {shown.map((a, i) => (
                <div className="fid-pv-item" key={keys[list.indexOf(a)] + ':' + i}>
                  {!single && <div className="fid-pv-name">{a.name}</div>}
                  {hasCreative(a)
                    ? <div className={'fid-pv-frame' + (hasMedia(a) ? '' : ' nomedia')}><AdPreview cr={creativeOf(a)} media={hasMedia(a) ? a.media : null} name={a.name} /></div>
                    : <EmptyState />}
                </div>
              ))}
            </div>

            <div className="fid-pv-cap"><span>Ad rendering and interaction may vary based on device, format and other factors.</span><IcInfoFill /></div>
          </div>
        </div>

        <div className={'fid-pv-foot' + (more ? ' sh' : '')}><button type="button" className="fid-pv-ok" onClick={onClose}>OK</button></div>
      </div>
      {note && <div className="toast" role="status">{note}</div>}
    </div>
  );
}
