import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { helpFor } from './columnHelp.js';
import { helpTopic } from './columns.js';
import { HelpLink } from './Common.jsx';

const OPEN_DELAY = 450;
const CLOSE_DELAY = 180;
const WIDTH = 320;
const NOTE_MAX = 560;

// Hover card under a column header. It stays open while the pointer is on the
// header or on the card itself, so its links and button can be used.
export function useHeaderTip() {
  const [tip, setTip] = useState(null);
  const openT = useRef(null);
  const closeT = useRef(null);
  useEffect(() => () => {
    clearTimeout(openT.current);
    clearTimeout(closeT.current);
  }, []);
  useEffect(() => {
    if (!tip) return undefined;
    const hide = () => setTip(null);
    const main = document.getElementById('main');
    main?.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
    return () => {
      main?.removeEventListener('scroll', hide);
      window.removeEventListener('resize', hide);
    };
  }, [tip]);

  // `text` gives a one-line note (the total rows' help icons): it opens just right of the icon.
  const show = (e, key, text) => {
    const help = text ? { paras: [text] } : helpFor(key);
    if (!help) return;
    const r = e.currentTarget.getBoundingClientRect();
    clearTimeout(closeT.current);
    clearTimeout(openT.current);
    openT.current = setTimeout(() => {
      if (text) {
        setTip({ key, help, note: true, left: Math.min(r.right + 2, window.innerWidth - NOTE_MAX - 8), top: r.bottom + 2, anchorTop: r.top });
        return;
      }
      const center = r.left + r.width / 2;
      const left = Math.max(8, Math.min(center - WIDTH / 2, window.innerWidth - WIDTH - 8));
      setTip({ key, help, left, top: r.bottom - 10, anchorTop: r.top });
    }, OPEN_DELAY);
  };
  const leave = () => {
    clearTimeout(openT.current);
    clearTimeout(closeT.current);
    closeT.current = setTimeout(() => setTip(null), CLOSE_DELAY);
  };
  const stay = () => clearTimeout(closeT.current);
  const close = () => {
    clearTimeout(openT.current);
    setTip(null);
  };
  return { tip, show, leave, stay, close };
}

function Para({ p }) {
  if (typeof p === 'string') return <p>{p}</p>;
  return <p><b>{p.b}</b>{p.t}</p>;
}

export default function HeaderTip({ tip, onStay, onLeave, onHide }) {
  const ref = useRef(null);
  const [top, setTop] = useState(null);
  // Open below the header; flip above it when the card would run off the bottom of the window.
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const h = ref.current.offsetHeight;
    setTop(tip.top + h > window.innerHeight - 8 ? Math.max(8, tip.anchorTop - h + 10) : tip.top);
  }, [tip]);
  if (!tip) return null;
  const { help } = tip;
  return (
    <div ref={ref} className={`th-tip ${tip.note ? 'note' : ''}`} role="tooltip" data-testid="header-tip"
      style={{ left: tip.left, top: top ?? tip.top, width: tip.note ? 'auto' : WIDTH, maxWidth: tip.note ? NOTE_MAX : undefined }}
      onMouseEnter={onStay} onMouseLeave={onLeave}>
      {help.paras.map((p, i) => <Para key={i} p={p} />)}
      {help.link && <p><HelpLink topic={helpTopic(tip.key)}>{help.link}</HelpLink></p>}
      {help.recommended && (
        <>
          <div className="th-tip-sep" />
          <p>{help.note} <HelpLink topic="columns" /></p>
          {onHide && <button type="button" className="th-tip-hide" onClick={() => onHide(tip.key)}>Don&apos;t show this column</button>}
        </>
      )}
    </div>
  );
}
