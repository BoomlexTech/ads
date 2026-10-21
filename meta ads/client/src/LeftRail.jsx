import React, { useEffect, useRef, useState } from 'react';
import { RailGlyph, RAIL_GLYPHS } from './fid-rail-icons.jsx';
import './fid-rail.css';

// The left icon rail and the full-height menu that opens over the page while the pointer is on it.
//   toast(msg)   comingSoon(what) -> handler for a control with nothing behind it (does nothing)
// (this account's rail has no Meta AI button: that lives in the floating button at the bottom right)
//
// Collapsed rail: every position is measured from the reference screenshots (1 reference px = 1/1.125 design px, see fid-rail-icons.jsx).
// The top group is anchored to the top edge, the help / settings / search / bug group to the bottom edge.
const RAIL = [['gauge', 'Account overview', false], ['table', 'Campaigns', true], ['reports', 'Ads Reporting', false], ['aud', 'Audiences', false], ['mega', 'Advertising settings', false], ['card', 'Billing and payments', false], ['nodes', 'Events Manager', false], ['ham', 'All tools', false]];
const RAIL2 = [['help', 'Help'], ['gear', 'Settings'], ['search', 'Search'], ['bug', 'Report a problem']];
const EDGE = 829 / 1.125; // bottom edge of the rail (design px from its top) in the reference; the bottom group is positioned from there

// one button of the collapsed rail: a slot (tile) of g.s design px with the glyph inside it
const RailItem = ({ name, label, on, onClick, bottom }) => {
  const g = RAIL_GLYPHS[name];
  const pos = bottom ? { bottom: +(EDGE - g.yc - g.s / 2).toFixed(2) } : { top: +(g.yc - g.s / 2).toFixed(2) };
  return (
    <button type="button" className={`fr-i${on ? ' on' : ''}${bottom ? ' sm' : ''}${name === 'logo' ? ' logo' : ''}`} title={label} aria-label={label} aria-current={on ? 'page' : undefined}
      style={{ ...pos, width: g.s, height: g.s }} onClick={onClick}>
      <RailGlyph name={name} />
    </button>
  );
};

export default function LeftRail({ toast, comingSoon }) {
  const [rail, setRail] = useState(false); // the menu is open
  const railT = useRef(null);
  const railLock = useRef(false); // after picking an item, stay closed until the pointer has left the rail
  const railIn = () => { if (railLock.current) return; clearTimeout(railT.current); railT.current = setTimeout(() => setRail(true), 90); };
  const railOut = () => { clearTimeout(railT.current); setRail(false); };
  const railPick = (fn) => () => {
    railLock.current = true; railOut();
    const release = (e) => { if (!(e.target.closest && e.target.closest('.rail-l, .rail-x'))) { railLock.current = false; document.removeEventListener('mousemove', release); } };
    document.addEventListener('mousemove', release);
    if (fn) fn();
  };
  useEffect(() => {
    if (!rail) return undefined;
    // close when the pointer is anywhere but the menu / rail (also covers jumps the leave event misses), or on Escape
    const mv = (e) => { if (!(e.target.closest && e.target.closest('.rail-x, .rail-l'))) setRail(false); };
    const esc = (e) => { if (e.key === 'Escape') setRail(false); };
    document.addEventListener('mousemove', mv); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousemove', mv); document.removeEventListener('keydown', esc); };
  }, [rail]);
  useEffect(() => () => clearTimeout(railT.current), []);
  const notif = () => toast('You have no new notifications');
  return (
    <>
      <nav className="rail-l fr-nav" aria-label="Main menu" onMouseEnter={railIn} onFocus={railIn} onMouseLeave={() => { clearTimeout(railT.current); railLock.current = false; }}>
        <div className="fr-in">
          <RailItem name="logo" label="Home" onClick={comingSoon('Home')} />
          <RailItem name="bell" label="Notifications" onClick={notif} />
          <span className="fr-sep" />
          {RAIL.map(([name, label, on]) => <RailItem key={label} name={name} label={label} on={on} onClick={on ? undefined : comingSoon(label)} />)}
          <span className="fr-sep b" />
          {RAIL2.map(([name, label]) => <RailItem key={label} name={name} label={label} bottom onClick={comingSoon(label)} />)}
        </div>
      </nav>

      {rail && (
        <div className="rail-x fr-x" role="navigation" aria-label="Ads Manager menu" onMouseLeave={railOut}>
          <div className="fr-xtop"><span className="fr-slot"><RailGlyph name="logo" /></span><span className="fr-xmeta">Meta</span></div>
          <div className="fr-xtitle">Ads Manager</div>
          <button type="button" className="fr-xi" onClick={railPick(notif)}><span className="fr-slot"><RailGlyph name="bell" /></span><span className="fr-xl">Notifications</span></button>
          <hr className="fr-xhr" />
          {RAIL.map(([name, label, on]) => (
            <button key={label} type="button" className={`fr-xi${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} onClick={railPick(on ? null : comingSoon(label))}>
              <span className="fr-slot"><RailGlyph name={name} /></span><span className="fr-xl">{label}</span>
            </button>
          ))}
          <span className="fr-xfill" />
          <hr className="fr-xhr b" />
          <div className="fr-xrow">{RAIL2.map(([name, label]) => <button key={label} type="button" className="fr-i sm" title={label} aria-label={label} onClick={railPick(comingSoon(label))}><RailGlyph name={name} /></button>)}</div>
        </div>
      )}
    </>
  );
}
