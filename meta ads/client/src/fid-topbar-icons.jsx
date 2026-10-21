import React from 'react';

// Glyphs of the top bar and the right rail, drawn after the reference screenshots (ref px -> design px: / 1.125).
// Every glyph is sized in CSS (see fid-topbar.css); the viewBox is the reference pixel box of the glyph.

// solid dropdown caret next to the account name (14 x 8 reference px)
export const TbCaret = () => (
  <svg className="fid-tb-caret" width="12.4" height="7.2" viewBox="0 0 12 7" aria-hidden="true"><path d="M.7.2h10.6c.6 0 .9.7.5 1.1L6.5 6.6c-.3.3-.7.3-1 0L.2 1.3C-.2.9.1.2.7.2z" fill="currentColor" /></svg>
);

// "ad account" glyph: a small monitor (thick frame, a base line inside) with three short dashes next to it (24 x 20 reference pixel grid)
export const AcctGlyph = () => (
  <svg className="fid-tb-acctg" width="21.33" height="17.78" viewBox="0 -1 24 20" aria-hidden="true">
    <rect x="3.28" y="3.98" width="11.12" height="11.3" rx=".8" fill="none" stroke="currentColor" strokeWidth="2.55" />
    <path d="M5 12.3h8" stroke="currentColor" strokeWidth="1.6" opacity=".78" />
    <path d="M9 12.5v1.7h2v-1.7z" fill="currentColor" opacity=".8" />
    <path d="M17.4 5h4.5M17.4 10h4.5M17.4 15h4.5" stroke="currentColor" strokeWidth="1.8" opacity=".92" />
  </svg>
);

// refresh: two thick arcs, each running into a solid square block (24 x 24 reference pixel grid)
export const RefreshGlyph = () => (
  <svg className="fid-tb-refg" width="21.33" height="21.33" viewBox="0 .5 24 24" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M3.8 12.5A8.2 8.2 0 0 1 18 6.91" />
      <path d="M20.2 12.5A8.2 8.2 0 0 1 6 18.09" />
    </g>
    <path d="M15.7 4.1h5.2v5.8h-5.2zM3.1 15.1h5.2v5.8H3.1z" fill="currentColor" />
  </svg>
);

// "..." button
export const DotsGlyph = () => (
  <svg className="fid-tb-dotsg" width="16" height="5.3" viewBox="0 0 18 6" aria-hidden="true">
    <circle cx="3" cy="3" r="1.85" fill="currentColor" /><circle cx="9" cy="3" r="1.85" fill="currentColor" /><circle cx="15" cy="3" r="1.85" fill="currentColor" />
  </svg>
);

// the small blue Facebook badge at the bottom right of the profile avatar
export const FbBadge = () => (
  <svg viewBox="0 0 20 20" width="100%" height="100%" aria-hidden="true">
    <circle cx="10" cy="10" r="10" fill="#0866ff" />
    <path d="M11.2 20v-6.9h2.3l.4-2.7h-2.7V8.7c0-.8.4-1.4 1.5-1.4h1.4V4.9c-.2 0-1.1-.1-2-.1-2.1 0-3.4 1.2-3.4 3.5v2.1H6.4v2.7h2.3V20z" fill="#fff" />
  </svg>
);

// "Discard Drafts": a solid bin - handle, lid, body with two slots (18 x 20 screenshot px)
export const BinGlyph = () => (
  <svg className="fid-tb-bing" width="16" height="17.8" viewBox="0 0 18 20" aria-hidden="true">
    <path d="M6.3 3.4V2.7a1.5 1.5 0 0 1 1.5-1.5h2.4a1.5 1.5 0 0 1 1.5 1.5v.7" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <rect x=".4" y="3.1" width="17.2" height="2.5" rx="1.2" fill="currentColor" />
    <path fillRule="evenodd" fill="currentColor" d="M2.5 6.7h13l-.7 11a2.3 2.3 0 0 1-2.3 2.2h-7a2.3 2.3 0 0 1-2.3-2.2zM6.2 9.2v7.3h1.9V9.2zM9.9 9.2v7.3h1.9V9.2z" />
  </svg>
);

// ----- account panel (opened by the account selector; sizes are screenshot px / 1.1224) -----
// magnifier of the search field (20 x 20 screenshot px)
export const ApSearch = () => (
  <svg className="ap-g-search" width="17.8" height="17.8" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="8.4" cy="8.4" r="7" /><path d="M13.5 13.5l5.6 5.6" strokeLinecap="round" />
  </svg>
);

// the small solid "i" disc next to a heading (16 x 15 screenshot px)
export const ApInfo = () => (
  <svg className="ap-g-info" width="14.2" height="14.2" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="8" fill="currentColor" />
    <rect x="6.5" y="3" width="3" height="2.4" rx=".6" fill="#edf5ff" />
    <rect x="6.5" y="6.7" width="3" height="6.3" rx=".5" fill="#edf5ff" />
  </svg>
);

// thin chevron at the right of the selected row
export const ApChevron = () => (
  <svg className="ap-g-chev" width="8.4" height="14.3" viewBox="0 0 9.4 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 1.3L8.4 8L1 14.7" />
  </svg>
);

// outlined cog with eight teeth (21 x 20 screenshot px)
const GEAR = (() => {
  const n = 8, pts = [];
  for (let i = 0; i < n * 4; i++) {
    const a = (Math.PI * 2 * (i - 0.5)) / (n * 4) - Math.PI / 2, r = i % 4 < 2 ? 9.1 : 7.05;
    pts.push(`${(10 + r * Math.cos(a)).toFixed(2)} ${(10 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
})();
export const ApGear = () => (
  <svg className="ap-g-gear" width="18.7" height="18.7" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round">
    <path d={GEAR} /><circle cx="10" cy="10" r="2.9" />
  </svg>
);

// thin plus of the "Add" button (14 x 14 screenshot px)
export const ApPlus = () => (
  <svg className="ap-g-plus" width="12.5" height="12.5" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M7 .4v13.2M.4 7h13.2" />
  </svg>
);

// the empty score ring at the right of an ad account row: a white 270 degree arc, open at the bottom, with "--" inside (37 screenshot px)
const RING = (() => {
  const R = 16.7, p = (deg) => { const a = (deg * Math.PI) / 180; return `${(18.5 + R * Math.sin(a)).toFixed(2)} ${(18.5 - R * Math.cos(a)).toFixed(2)}`; };
  return `M${p(225)}A${R} ${R} 0 1 1 ${p(135)}`;
})();
export const ApRing = () => (
  <svg className="ap-g-ring" width="33" height="33" viewBox="0 0 37 37" aria-hidden="true">
    <path d={RING} fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
    <path d="M13.6 18.6h3.6M19.8 18.6h3.6" stroke="#9da5ac" strokeWidth="1.3" />
  </svg>
);

// ----- right rail -----
// performance charts: three outlined bars, 1 px apart (20 x 16 ref px)
export const RailBars = () => (
  <svg className="fid-rr-g" width="17.8" height="14.2" viewBox="0 0 20 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9">
    <rect x="1.57" y="9.2" width="3.87" height="5.6" /><rect x="8.23" y="1.35" width="3.87" height="13.45" /><rect x="14.9" y="5.3" width="3.87" height="9.5" />
  </svg>
);

// edit: a pencil drawn as a thin outline - a capsule with a ring at the upper end (19 x 19 ref px, the ring sticks out of the box by a fraction)
export const RailPencil = () => (
  <svg className="fid-rr-g" width="16.9" height="16.9" viewBox="0 1 19 19" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeOpacity=".74">
    <path d="M11.91 3.03L1.77 13.17A2.87 2.87 0 0 0 5.83 17.23L15.97 7.09" />
    <circle cx="15" cy="4" r="3.25" />
  </svg>
);

// activity history: a clock (20 x 20 ref px)
export const RailClock = () => (
  <svg className="fid-rr-g" width="17.8" height="17.8" viewBox="0 -.3 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.95">
    <circle cx="10.1" cy="10.2" r="8.45" />
    <path d="M10.17 4.7v5.7l3.2 3.2" strokeLinecap="butt" strokeLinejoin="miter" />
  </svg>
);
