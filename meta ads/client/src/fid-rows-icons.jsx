// Glyphs of the table rows, redrawn from the real page.
// Every viewBox is in screenshot pixels (the reference was taken at 1.125x); the CSS size is viewBox / K so they line up 1:1 at the clone's zoom.
import React from 'react';
import { RealCharts, RealInsights, RealInfo } from './real-icons.jsx';

const K = 1.1247;
const sz = (w, h) => ({ width: +(w / K).toFixed(3), height: +(h / K).toFixed(3) });

const base = (w, h, extra) => ({ viewBox: `0 0 ${w} ${h}`, ...sz(w, h), 'aria-hidden': true, focusable: 'false', ...extra });

// bar chart (Charts chip): the real page's own glyph
export const IcCharts = () => <RealCharts className="rw-ic" />;

// solid pencil (Edit chip)
export const IcEdit = () => (
  <svg {...base(16, 15.2)} className="rw-ic" fill="currentColor">
    <polygon points="9.15,2.35 12.65,5.85 8,10.5 0.5,14.7 0.5,11" />
    <rect x="-1.6" y="-2.4" width="3.2" height="4.8" rx="1" transform="translate(12.5 2.2) rotate(-45)" />
  </svg>
);

// document with a back page (Duplicate chip)
export const IcDup = () => (
  <svg {...base(15, 14.4)} className="rw-ic" fill="currentColor">
    <path d="M5.8 0H9.7V5H14.5V12.6Q14.5 13.5 13.6 13.5H5.9Q5 13.5 5 12.6V0.8Q5 0 5.8 0Z" />
    <path d="M11 0.1V4.3H15Z" opacity=".6" />
    <path d="M4.2 1.6H2Q0.8 1.6 0.8 2.8V12.7Q0.8 14 2 14H4.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

// "compare": the real page's trend square
export const IcCompare = () => <RealInsights className="rw-ic" />;

// three dots ("More")
export const IcDots = () => (
  <svg {...base(15.9, 4)} className="rw-ic" fill="currentColor">
    <circle cx="2" cy="2" r="1.95" /><circle cx="7.95" cy="2" r="1.95" /><circle cx="13.9" cy="2" r="1.95" />
  </svg>
);

// pencil outline after the name / in the budget cell
export const IcPen = () => (
  <svg {...base(21, 19)} className="rw-ic rw-pen-ic" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round">
    <circle cx="16" cy="3.4" r="2.5" />
    <path d="M1.4 12.6V16.6Q1.4 17.7 2.5 17.7H6.6L18 5.2" />
    <path d="M1.4 12.6L13.9 1.8" />
  </svg>
);

// magnifier with a plus (bottom-right of the thumbnail on hover)
export const IcZoom = () => (
  <svg {...base(21, 21)} className="rw-ic rw-zoom-ic" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="8.6" cy="8.6" r="6.9" />
    <path d="M13.7 13.7 L19 19" strokeWidth="2.2" />
    <path d="M8.6 6.4 V10.8 M6.4 8.6 H10.8" strokeWidth="1.3" strokeLinecap="butt" />
  </svg>
);

// footer: eye (View results)
export const IcEye = () => (
  <svg {...base(14.4, 11.8)} className="rw-ic" fill="currentColor">
    <path d="M7.2 0 C3.9 0 1.2 2 0 5.9 C1.2 9.8 3.9 11.8 7.2 11.8 C10.5 11.8 13.2 9.8 14.4 5.9 C13.2 2 10.5 0 7.2 0Z" />
    <circle cx="7.2" cy="5.9" r="2.7" fill="none" stroke="#fff" strokeWidth="1.4" />
    <circle cx="7.2" cy="5.9" r="1.85" />
  </svg>
);

// footer: filled circle with an "i" (the real page's own glyph)
export const IcInfo = () => <RealInfo className="rw-ic" />;

