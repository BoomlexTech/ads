import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';

// Admin replacements for any text or number shown on a page. Saved per page (the address
// without "/admin", plus its campaign / ad group scope) as "<shown text>#<nth time on the page>",
// so changing one "$0.60" leaves the other "$0.60" cells alone. An empty table cell shows "–"
// and can be changed the same way ("#<nth empty cell>"). Admins double-click, or double-tap on
// a touch screen, any text or number (chart labels and billing amounts included) that has no
// editor of its own; performance figures are changed for real instead (see REAL).
// Billing figures and lines marked data-slot (the page footer) are saved against where they sit,
// "@<place>#<nth>", so the typed text stays even when what the page shows there changes.
const EMPTY = '∅';
const SKIP = 'script,style,noscript,textarea,input,select,option,[contenteditable],[data-text-editor]';
const norm = (s) => s.replace(/\s+/g, ' ').trim();

function pageKey() {
  const path = location.pathname.replace(/^\/admin(?=\/|$)/, '') || '/';
  const q = new URLSearchParams(location.search);
  const scope = ['campaignId', 'adGroupId'].filter((k) => q.get(k)).map((k) => `${k}=${q.get(k)}`).join('&');
  return scope ? `${path}?${scope}` : path;
}

const originals = new WeakMap(); // text node -> { orig, shown }
const NUMBER = '[data-metric], [data-fig], [data-slot]';
// Performance figures (table cells, totals, scorecard stats) always show the real data for the
// selected dates, for admins and viewers alike: admins change them for real (so totals follow),
// never as a screen-only change that would stay put whatever dates are picked.
const REAL = '[data-metric]';

// Where a number sits on the page: its metric (or billing figure) and the table row it is in.
function slotOf(node) {
  const a = (node.nodeType === 1 ? node : node.parentElement)?.closest(NUMBER);
  if (!a) return null;
  const { metric, fig, slot } = a.dataset;
  const parts = [metric ? `m:${metric}` : fig ? `f:${fig}` : `s:${slot}`];
  for (let p = a.parentElement; p && p !== document.body; p = p.parentElement) {
    if (p.dataset.id) { parts.push(`id:${p.dataset.id}`); break; }
    if (p.tagName === 'TR') { parts.push(`row:${p.dataset.testid || ''}:${[...p.parentElement.children].indexOf(p)}`); break; }
  }
  return `@${parts.reverse().join('/')}`;
}

// The page's text nodes and empty table cells in order, each with its saved-change key.
function scan() {
  const out = [];
  const seen = new Map();
  const keyFor = (orig) => {
    const n = (seen.get(orig) || 0) + 1;
    seen.set(orig, n);
    return `${orig}#${n}`;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (n.nodeType === 1) {
        if (n.matches(SKIP) || n.matches(REAL)) return NodeFilter.FILTER_REJECT;
        return n.tagName === 'TD' && n.childNodes.length === 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const slot = slotOf(n);
    const at = slot && keyFor(slot);
    if (n.nodeType === 1) { out.push({ node: n, empty: true, orig: '–', key: keyFor(EMPTY), slot: at }); continue; }
    let rec = originals.get(n);
    if (!rec || n.nodeValue !== rec.shown) { rec = { orig: norm(n.nodeValue), shown: n.nodeValue }; originals.set(n, rec); }
    out.push({ node: n, orig: rec.orig, key: keyFor(rec.orig), slot: at });
  }
  return out;
}

function apply(map) {
  const onPage = map[pageKey()] || {};
  for (const item of scan()) {
    const want = (item.slot && onPage[item.slot]) || onPage[item.key];
    if (item.empty) {
      if (want) item.node.setAttribute('data-ov', want); else item.node.removeAttribute('data-ov');
      continue;
    }
    const { node } = item;
    // A replacement typed on several lines (Shift+Enter) shows them as lines.
    const box = node.parentElement;
    if (want?.includes('\n')) box.setAttribute('data-ov-lines', ''); else if (box.hasAttribute('data-ov-lines')) box.removeAttribute('data-ov-lines');
    const rec = originals.get(node);
    const [, lead, , trail] = node.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const text = want ? `${lead}${want}${trail}` : (rec.shown === node.nodeValue && rec.orig !== norm(node.nodeValue) ? rec.orig : node.nodeValue);
    if (node.nodeValue !== text) { node.nodeValue = text; rec.shown = text; }
  }
}

// The text node (or empty cell) under the pointer.
function hit(e) {
  const target = e.target instanceof Element ? e.target : e.target?.parentElement;
  if (!target || target.closest(SKIP) || target.closest(REAL)) return null;
  const items = scan();
  let node = null;
  const caret = document.caretPositionFromPoint?.(e.clientX, e.clientY) || document.caretRangeFromPoint?.(e.clientX, e.clientY);
  const c = caret && (caret.offsetNode || caret.startContainer);
  if (c?.nodeType === 3 && target.contains(c)) node = c;
  if (!node) node = items.find((i) => target.contains(i.node) || i.node === target)?.node;
  return items.find((i) => i.node === node) || null;
}

export default function TextOverrides({ canEdit }) {
  const [map, setMap] = useState({});
  const [edit, setEdit] = useState(null); // { key, page, value, x, y }
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => { api.textOverrides().then(setMap).catch(() => {}); }, []);

  // Keep replacements on screen as React re-renders and pages change.
  useEffect(() => {
    let frame = 0;
    const run = () => { frame = 0; apply(mapRef.current); };
    const later = () => { if (!frame) frame = requestAnimationFrame(run); };
    run();
    const obs = new MutationObserver(later);
    obs.observe(document.body, { childList: true, characterData: true, subtree: true });
    window.addEventListener('popstate', later);
    return () => { obs.disconnect(); window.removeEventListener('popstate', later); cancelAnimationFrame(frame); };
  }, [map]);

  useEffect(() => {
    if (!canEdit) return undefined;
    let lastTap = null;
    let synthetic = 0;
    const open = (e) => {
      const item = hit(e);
      if (!item) return;
      // Leave it to the field's own editor when it opened one.
      setTimeout(() => {
        const a = document.activeElement;
        if (a && a.matches('input,textarea,select') && !a.closest('[data-text-editor]')) return;
        window.getSelection()?.removeAllRanges();
        const page = pageKey();
        const onPage = mapRef.current[page] || {};
        const value = (item.slot && onPage[item.slot]) || onPage[item.key] || item.orig;
        // A number saved by its shown value before it had a place of its own moves to its place.
        const old = item.slot && onPage[item.key] ? item.key : null;
        setEdit({ key: item.slot || item.key, old, page, value, original: item.orig, x: e.clientX, y: e.clientY });
      }, 0);
    };
    const onDbl = (e) => {
      if (e.isTrusted && Date.now() - synthetic < 700) e.stopPropagation(); // already handled as a double-tap
    };
    // Touch screens: two taps close together count as a double-click for every editor on the page.
    const onTouchEnd = (e) => {
      const t = e.changedTouches[0];
      if (!t || e.touches.length) return;
      const now = Date.now();
      if (lastTap && now - lastTap.at < 350 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 30 && !e.target.closest?.(SKIP)) {
        lastTap = null;
        e.preventDefault();
        synthetic = now;
        e.target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: t.clientX, clientY: t.clientY, view: window }));
        return;
      }
      lastTap = { at: now, x: t.clientX, y: t.clientY };
    };
    document.addEventListener('dblclick', onDbl, true);
    document.addEventListener('dblclick', open);
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    return () => {
      document.removeEventListener('dblclick', onDbl, true);
      document.removeEventListener('dblclick', open);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [canEdit]);

  if (!edit) return null;
  return createPortal(<Editor edit={edit} onClose={() => setEdit(null)} onSaved={setMap} />, document.body);
}

function Editor({ edit, onClose, onSaved }) {
  const [value, setValue] = useState(edit.value);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (v) => {
    setBusy(true);
    setError('');
    try {
      if (edit.old) await api.editTextOverride(edit.page, edit.old, '', edit.original);
      onSaved(await api.editTextOverride(edit.page, edit.key, v, edit.original));
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  const left = Math.max(8, Math.min(edit.x - 20, window.innerWidth - 328));
  const top = Math.min(edit.y + 12, window.innerHeight - 150);
  return (
    <div data-text-editor="" className="tov-pop" style={{ left, top }} role="dialog" aria-label="Edit text"
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <form onSubmit={(e) => { e.preventDefault(); save(value); }}>
        <textarea autoFocus value={value} disabled={busy} onChange={(e) => setValue(e.target.value)}
          rows={Math.min(8, Math.max(2, value.split('\n').length))} title="Enter saves, Shift+Enter starts a new line"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(value); }
          }} aria-label="New text" />
        {error && <div className="tov-err">{error}</div>}
        <div className="tov-row">
          <button type="button" className="tov-link" disabled={busy} onClick={() => save('')} title={`Show "${edit.original}" again`}>Reset</button>
          <span />
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="tov-save" disabled={busy}>Save</button>
        </div>
      </form>
    </div>
  );
}
