import React, { useState } from 'react';
import { Popover } from './ui.jsx';
import bulb from './assets/opp/bulb.png';
import './fid-opp.css';

// "Opportunity score" button in the top bar and the popover it opens (matched to Ads Manager).
//   score: number 0-100 (or null for "--")
//   onOpenAnalyse(): optional and unused - the real popover has no "Open Analyse" button (kept so existing callers keep working)

// The gauge: a 270 degree arc open at the bottom, round caps. The arc is the grey track, the blue part is the score.
const R = 45.4, SW = 9.2, HALF_GAP = 47; // viewBox 0 0 100 100 (outer diameter 100), gap of 2 x HALF_GAP degrees at the bottom
const pt = (deg) => { const a = (deg * Math.PI) / 180; return [50 + R * Math.sin(a), 50 - R * Math.cos(a)].map((n) => +n.toFixed(2)); };
const ARC = (() => { const [x1, y1] = pt(180 + HALF_GAP), [x2, y2] = pt(180 - HALF_GAP); return `M${x1} ${y1}A${R} ${R} 0 1 1 ${x2} ${y2}`; })();

function Gauge({ score, size, cls }) {
  const has = score != null && !Number.isNaN(+score);
  const p = has ? Math.max(0, Math.min(100, +score)) : 0;
  return (
    <span className={`fid-opp-gauge ${cls} ${has ? '' : 'none'}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        {p < 100 && <path d={ARC} fill="none" strokeWidth={SW} strokeLinecap="round" className="fid-opp-track" />}
        {p > 0 && <path d={ARC} fill="none" strokeWidth={SW} strokeLinecap="round" pathLength="100" strokeDasharray={`${p} 100`} className="fid-opp-fill" />}
      </svg>
      <b>{has ? Math.round(p) : '--'}</b>
    </span>
  );
}

const Info = () => (
  <svg className="fid-opp-info" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="8" fill="currentColor" />
    <rect x="6.2" y="3.1" width="3.6" height="2.3" rx=".5" fill="#fff" />
    <rect x="6.2" y="6.6" width="3.6" height="6.2" rx=".5" fill="#fff" />
  </svg>
);

const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" strokeLinecap="round">
    <path d="M1.9 1.9L12.1 12.1" stroke="currentColor" strokeWidth="1.4" opacity=".62" />
    <path d="M12.1 1.9L1.9 12.1" stroke="currentColor" strokeWidth="1.4" opacity=".62" />
  </svg>
);

export default function OppScore({ score }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} setOpen={setOpen}
      button={(
        <button className="opp fid-opp-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Gauge score={score} size={32} cls="sm" />
          <span className="fid-opp-lbl">Opportunity score</span>
          <svg className="fid-opp-caret" width="12.4" height="7.2" viewBox="0 0 12 7" aria-hidden="true"><path d="M.7.2h10.6c.6 0 .9.7.5 1.1L6.5 6.6c-.3.3-.7.3-1 0L.2 1.3C-.2.9.1.2.7.2z" fill="currentColor" /></svg>
        </button>
      )}
    >
      {(close) => (
        <div className="fid-opp-pop" role="dialog" aria-label="Opportunity score">
          <div className="fid-opp-head">
            <Gauge score={score} size={62} cls="lg" />
            <div className="fid-opp-hd">
              <div className="fid-opp-ttl">Opportunity score<Info /></div>
              <div className="fid-opp-sub">You applied all recommendations, which<br />are proven to help improve<br />performance.</div>
            </div>
            <button className="fid-opp-x" aria-label="Close" onClick={close}><Cross /></button>
          </div>
          <hr className="fid-opp-hr" />
          <div className="fid-opp-empty">
            <img className="fid-opp-bulb" src={bulb} alt="" draggable="false" />
            <div className="fid-opp-h">No recommendations available yet</div>
            <div className="fid-opp-p">Your score changes as new recommendations<br />become available, so check back again for<br />more ways to keep it high.</div>
          </div>
        </div>
      )}
    </Popover>
  );
}
