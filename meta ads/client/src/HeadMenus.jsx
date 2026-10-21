import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ArrowUp, ArrowDown, Bookmark, Filter, ArrowLeftToLine, ArrowRightToLine, Plus, Trash2, ArrowDownWideNarrow, Info } from 'lucide-react';

const HELP = 'https://www.facebook.com/business/help';
const root = () => document.getElementById('root') || document.body;

// Geometry of an element in the layout's own CSS pixels. The whole app is scaled with CSS `zoom`, and
// browsers disagree on whether getBoundingClientRect() reports zoomed or unzoomed values, so derive the factor.
export function rectCss(el) {
  const r = el.getBoundingClientRect();
  const z = parseFloat(getComputedStyle(root()).zoom) || 1;
  const k = el.offsetWidth ? r.width / el.offsetWidth : z;
  return { left: r.left / k, right: r.right / k, top: r.top / k, bottom: r.bottom / k, vw: window.innerWidth / z, vh: window.innerHeight / z };
}

const Link = ({ children, href = HELP, cls }) => <a className={cls} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;

// The white card Ads Manager shows when you hover a column header
export function HeadTip({ tip, at, onEnter, onLeave }) {
  const ref = useRef(null);
  const [top, setTop] = useState(at.top);
  useLayoutEffect(() => {
    const h = ref.current ? ref.current.offsetHeight : 0;
    setTop(Math.max(8, Math.min(at.top, at.vh - h - 8)));
  }, [at, tip]);
  return createPortal(
    <div className="htip" ref={ref} style={{ left: at.left, top }} role="tooltip" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="htip-t">{tip.title}</div>
      {tip.sub && <div className="htip-s">{tip.sub}</div>}
      <p>{tip.body}</p>
      {tip.bold && <p className="b">{tip.bold}</p>}
      {tip.est && <p className="est"><i>i</i><span>In some cases, this metric may be <Link cls="dk">estimated</Link> and <Link cls="dk">reported by a third-party API</Link>.</span></p>}
      {tip.learn && <Link cls="lm">Learn more</Link>}
      {tip.note && (
        <div className="htip-note"><Info size={18} /><div>{tip.note[0]}<Link cls="lm">{tip.note[1]}</Link></div></div>
      )}
    </div>,
    root(),
  );
}

const IconColSettings = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <path d="M2 4h9M2 9h6M2 14h6" /><circle cx="14" cy="13" r="2.2" />
    <path d="M14 8.8v1.1M14 16.1v1.1M10.3 10.9l.95.55M16.75 14.55l.95.55M10.3 15.1l.95-.55M16.75 11.45l.95-.55" />
  </svg>
);

// A fly-out of the header menu. It opens level with its row; when that would run past the bottom of the window it is pushed up just enough to fit.
function Fly({ className, children }) {
  const ref = useRef(null);
  const [dy, setDy] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = rectCss(ref.current);
    const over = r.bottom - (r.vh - 8);
    if (over > 0) setDy(over);
  }, []);
  return <div className={className} ref={ref} style={dy ? { top: -2 - dy } : undefined} role="menu">{children}</div>;
}

const MW = 264; // menu width
// The dropdown behind a header's caret: Quick filters / Sort / Columns ›
export function HeadMenu({ at, spec, onClose }) {
  const ref = useRef(null);
  const [sub, setSub] = useState(null); // 'cols' | 'add'
  const left = Math.max(8, Math.min(at.left, at.vw - MW - 8));
  const [top, setTop] = useState(at.bottom + 11);
  const flip = left + MW + 2 * 196 > at.vw - 8; // fly-outs open to the left when there is no room on the right
  useLayoutEffect(() => {
    const h = ref.current ? ref.current.offsetHeight : 0;
    setTop(Math.max(8, Math.min(at.bottom + 11, at.vh - h - 8)));
  }, [at]);
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.hcaret')) onClose(); };
    const key = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);

  const go = (fn) => () => { onClose(); fn(); };
  const c = spec.cols;
  const hover = (v) => () => setSub(v);
  return createPortal(
    <div className="hmenu" ref={ref} style={{ left, top, width: MW }} role="menu">
      {spec.quick && (
        <>
          <div className="hm-t">Quick filters</div>
          {spec.quick.map(([id, label]) => <button key={id} className="hm-i q" role="menuitem" onClick={go(() => spec.onQuick(id))} onMouseEnter={hover(null)}><Bookmark size={18} />{label}</button>)}
          <button className="hm-i q" role="menuitem" onClick={go(spec.onFilter)} onMouseEnter={hover(null)}><Filter size={18} />{spec.fieldLabel}</button>
          <button className="hm-link" role="menuitem" onClick={go(() => spec.onMore())} onMouseEnter={hover(null)}>More Filters</button>
          {(spec.sort || c) && <div className="hm-hr" />}
        </>
      )}
      {spec.sort && (
        <>
          {spec.quick && <div className="hm-t s">Sort</div>}
          <button className="hm-i" role="menuitem" onClick={go(() => spec.onSort('asc'))} onMouseEnter={hover(null)}><ArrowUp size={18} />{spec.text ? 'Sort A to Z' : 'Sort low to high'}</button>
          <button className="hm-i" role="menuitem" onClick={go(() => spec.onSort('desc'))} onMouseEnter={hover(null)}><ArrowDown size={18} />{spec.text ? 'Sort Z to A' : 'Sort high to low'}</button>
          <button className="hm-i" role="menuitem" onClick={go(spec.onCustomSort)} onMouseEnter={hover(null)}><ArrowDownWideNarrow size={18} />Customise sorting</button>
          {c && <div className="hm-hr" />}
        </>
      )}
      {c && (
        <div className="hm-row">
          <button className={`hm-i ${sub ? 'on' : ''}`} role="menuitem" aria-haspopup="menu" aria-expanded={!!sub} onClick={() => setSub(sub ? null : 'cols')} onMouseEnter={hover('cols')}>
            <IconColSettings />Columns<ChevronRight size={20} className="chev" />
          </button>
          {sub && (
            <Fly className={`hm-fly ${flip ? 'l' : ''}`}>
              <button className="hm-i" role="menuitem" disabled={!c.canLeft} onClick={go(() => c.move(-1))} onMouseEnter={hover('cols')}><ArrowLeftToLine size={18} />Move left</button>
              <button className="hm-i" role="menuitem" disabled={!c.canRight} onClick={go(() => c.move(1))} onMouseEnter={hover('cols')}><ArrowRightToLine size={18} />Move right</button>
              <div className="hm-row">
                <button className={`hm-i ${sub === 'add' ? 'on' : ''}`} role="menuitem" disabled={!c.addable.length} onClick={() => setSub('add')} onMouseEnter={() => c.addable.length && setSub('add')}><Plus size={18} />Add column after</button>
                {sub === 'add' && (
                  <Fly className={`hm-fly add ${flip ? 'l' : ''}`}>
                    {c.addable.map(([id, label]) => <button key={id} className="hm-i" role="menuitem" onClick={go(() => c.add(id))}>{label}</button>)}
                  </Fly>
                )}
              </div>
              <button className="hm-i" role="menuitem" disabled={!c.canRemove} onClick={go(c.remove)} onMouseEnter={hover('cols')}><Trash2 size={18} />Remove column</button>
              <button className="hm-i" role="menuitem" onClick={go(c.customise)} onMouseEnter={hover('cols')}><IconColSettings />Customise columns</button>
            </Fly>
          )}
        </div>
      )}
    </div>,
    root(),
  );
}
