import React, { useEffect, useRef, useState } from 'react';
import { X, Play, Image as ImageIcon } from 'lucide-react';
import { IconCheck } from './icons.jsx';

export function useOutside(ref, onOut, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    const k = (e) => e.key === 'Escape' && onOut();
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, onOut, active]);
}

// A button that opens a popover. `children` is a render fn: (close) => content
export function Popover({ open, setOpen, button, children, right, className = '' }) {
  const ref = useRef(null);
  useOutside(ref, () => setOpen(false), open);
  return (
    <div className="pop-anchor" ref={ref}>
      {button}
      {open && <div className={`pop ${right ? 'right' : ''} ${className}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

// A button that opens a popover (the button gets the toggle click). `children` is a render fn: (close) => content
export function Menu({ open, setOpen, right, button, children, className }) {
  return <Popover open={open} setOpen={setOpen} right={right} className={className} button={React.cloneElement(button, { onClick: () => setOpen(!open) })}>{children}</Popover>;
}

export const Checkbox = ({ state, onClick, label, small }) => (
  <button type="button" className={`chk ${small ? 'sm' : ''} ${state === true ? 'on' : state === 'part' ? 'part' : ''}`} onClick={onClick} aria-label={label} aria-pressed={state === true}>
    {state === true && <IconCheck size={small ? 11 : 15} />}
    {state === 'part' && <span className="dash" />}
  </button>
);

export const Toggle = ({ on, onChange, large, label }) => (
  <button className={`tg ${on ? 'on' : ''} ${large ? 'lg' : ''}`} role="switch" aria-checked={on} aria-label={label}
    onClick={(e) => { e.stopPropagation(); onChange(!on); }} />
);

export function Thumb({ media, level, name, small }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [media?.url]);
  const cls = `thumb ${small ? 'sm' : ''}`;
  if (level !== 'ad') return null;
  if (!media?.url || broken) {
    const init = (name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return <div className={cls}>{init}</div>;
  }
  return (
    <div className={cls}>
      {media.type === 'video'
        ? <><video src={media.url + '#t=0.1'} muted preload="metadata" onError={() => setBroken(true)} /><span className="play"><Play size={9} fill="#fff" color="#fff" /></span></>
        : <img src={media.url} alt="" loading="lazy" onError={() => setBroken(true)} />}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide, side }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className={`overlay ${side ? 'side' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''} ${side ? 'side' : ''}`} style={typeof side === 'number' ? { width: side } : undefined} role="dialog" aria-label={title}>
        <div className="mh"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}

// `plain` renders a div instead of a label (a label forwards every click inside it to its first button/input)
export const Field = ({ label, hint, children, plain }) => {
  const Tag = plain ? 'div' : 'label';
  return <Tag className="field"><span>{label}{hint && <em className="hint">{hint}</em>}</span>{children}</Tag>;
};

export const MediaIcon = ImageIcon;
