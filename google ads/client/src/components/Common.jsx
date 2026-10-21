import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BRAND } from '../../../shared/brand.js';

export function Icon({ name, className = '', size, fill }) {
  const style = {};
  if (size) style.fontSize = size;
  if (fill) style.fontVariationSettings = "'FILL' 1";
  return <span className={`material-symbols-outlined ic ${className}`} style={style} aria-hidden="true">{name}</span>;
}

export function useOutside(ref, onOut, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOut();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [active, onOut, ref]);
}

// Open dropdowns, newest last, so Esc pressed outside any of them closes only the newest.
const openMenus = [];

// Anchor + popover; closes on outside click or Esc. children receives close().
export function Dropdown({ trigger, children, className = '', panelClass = '', align = 'left' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const popRef = useRef(null);
  useOutside(ref, () => setOpen(false), open);
  // Esc closes the menu before anything around it (a dialog, the page) reacts to the key.
  const escClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const inside = popRef.current?.contains(document.activeElement);
    setOpen(false);
    if (inside) ref.current?.querySelector('button, [href], [tabindex]:not([tabindex="-1"])')?.focus();
  };
  // Keys pressed inside the dropdown arrive through onKeyDown below, after an inline editor in the
  // menu has had its turn; this covers Esc while focus is somewhere else.
  useEffect(() => {
    if (!open) return undefined;
    const me = {};
    openMenus.push(me);
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.isComposing || openMenus[openMenus.length - 1] !== me) return;
      if (!ref.current?.contains(e.target)) escClose(e);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      openMenus.splice(openMenus.indexOf(me), 1);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cap menus to the space left below the trigger (the toolbar can be pinned low on short screens).
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!open || !pop) return undefined;
    const fit = () => pop.style.setProperty('--pop-max', `${Math.max(160, window.innerHeight - pop.getBoundingClientRect().top - 8)}px`);
    fit();
    const main = document.getElementById('main');
    main?.addEventListener('scroll', fit, { passive: true });
    window.addEventListener('resize', fit);
    return () => {
      main?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
    };
  }, [open]);
  // Menus that scroll with the page close on scroll so they never cover the pinned bars.
  useEffect(() => {
    if (!open) return undefined;
    const main = document.getElementById('main');
    const el = ref.current;
    if (!main || !el || !main.contains(el) || el.closest('.titlebar, .table-toolbar')) return undefined;
    const close = () => setOpen(false);
    main.addEventListener('scroll', close, { passive: true });
    return () => main.removeEventListener('scroll', close);
  }, [open]);
  return (
    <div className={`dd ${className}`} ref={ref}
      onKeyDown={(e) => { if (open && e.key === 'Escape' && !e.nativeEvent.isComposing) escClose(e); }}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && <div ref={popRef} className={`popover align-${align} ${panelClass}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function ToolBtn({ icon, label, onClick, active, className = '', tip, ...rest }) {
  return (
    <button type="button" className={`toolbtn ${active ? 'active' : ''} ${className}`} onClick={onClick} data-tip={tip} {...rest}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

// Other props (aria-*, data-*, title) go on the button.
export function MenuItem({ children, onClick, disabled, selected, sub, icon, ...rest }) {
  return (
    <button type="button" className={`menu-item ${selected ? 'selected' : ''}`} disabled={disabled} onClick={onClick} {...rest}>
      {icon && <Icon name={icon} className="mi-icon" />}
      <span className="mi-label">{children}</span>
      {sub && <Icon name="arrow_right" className="mi-sub" fill />}
    </button>
  );
}

// Nested submenu. Opens on hover, on click (touch) and with Enter, Space or Right arrow (focus
// moves to its first item); Esc or Left arrow closes it and puts focus back on its item.
export function SubMenu({ label, children, side = 'left' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const item = () => wrap.current?.firstElementChild;
  const onKeyDown = (e) => {
    if (e.target === item() && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => wrap.current?.querySelector('.submenu button:not(:disabled)')?.focus());
    } else if (open && (e.key === 'Escape' || e.key === 'ArrowLeft') && !e.nativeEvent.isComposing) {
      // Only this submenu closes, not the menu around it.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      item()?.focus();
    }
  };
  return (
    <div className="submenu-wrap" ref={wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onKeyDown={onKeyDown}
      onBlur={(e) => { if (open && e.relatedTarget && !wrap.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <MenuItem sub selected={open} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(true)}>{label}</MenuItem>
      {open && <div className={`menu popover submenu side-${side}`}>{children}</div>}
    </div>
  );
}

// Opens the Quick help panel at one topic (the shell listens for this event).
export function openHelp(topic) {
  window.dispatchEvent(new CustomEvent('app:help', { detail: { topic } }));
}
// A "Learn more" style link that opens Quick help instead of leaving the page.
export function HelpLink({ topic, children = 'Learn more', className = '' }) {
  return <a href="#" className={className} data-help={topic} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openHelp(topic); }}>{children}</a>;
}

export function Logo() {
  return <img className="logo" src={BRAND.logo} alt="" />;
}

export function download(name, content, type) {
  // CSV gets a UTF-8 byte order mark, so spreadsheet apps read names with accents correctly.
  const csv = /^text\/csv/.test(type || '');
  const blob = content instanceof Blob ? content : new Blob(csv ? ['\ufeff', content] : [content], { type: csv ? 'text/csv;charset=utf-8' : type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function csvCell(v) {
  let s = String(v ?? '');
  // Text a spreadsheet would run as a formula (=, +, -, @) is kept as text; plain numbers stay numbers.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?[\d.,]+%?$/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
