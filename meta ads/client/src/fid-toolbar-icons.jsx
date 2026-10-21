import React from 'react';
import gPlus from './assets/toolbar/g-plus.png';
import gDuplicate from './assets/toolbar/g-duplicate.png';
import gEdit from './assets/toolbar/g-edit.png';
import gTrash from './assets/toolbar/g-trash.png';
import gFlask from './assets/toolbar/g-flask.png';
import gPreview from './assets/toolbar/g-preview.png';
import gColumns from './assets/toolbar/g-columns.png';
import gBreakdown from './assets/toolbar/g-breakdown.png';
import gReports from './assets/toolbar/g-reports.png';
import gExport from './assets/toolbar/g-export.png';
import gCharts from './assets/toolbar/g-charts.png';
import gChartsOn from './assets/toolbar/g-charts-on.png';
import gAnalyse from './assets/toolbar/g-analyse.png';

// Toolbar glyphs (cropped from the reference screenshots) and level-tab glyphs (redrawn as SVG).
//
// A toolbar glyph is a PNG cropped from a reference screenshot (src/assets/toolbar/*.png; 1 px = 1 screenshot px = 1/1.125 design px).
// It is used as a CSS mask painted in currentColor, so the ink follows the button state (#1c2b33 normal, #778085 disabled,
// white on the green Create button); only the Analyse ring keeps its own colours.
// `l` / `t` place the cropped box inside the 20 x 20 design px slot that the button layout reserves for the icon
// (screenshot px, measured so that the ink lands on the same pixels as in the reference).
const K = 1.125;
const Glyph = ({ src, w, h, l, t, color = false }) => {
  const box = { left: l / K, top: t / K, width: w / K, height: h / K };
  return (
    <span className="fid-ic fid-gi" aria-hidden="true">
      {color
        ? <img src={src} alt="" draggable="false" style={box} />
        : <i style={{ ...box, WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }} />}
    </span>
  );
};

export const I = {
  Plus: () => <Glyph src={gPlus} w={19} h={20} l={1.6} t={1.2} />,
  Duplicate: () => <Glyph src={gDuplicate} w={24} h={24} l={-1} t={-0.8} />,
  Edit: () => <Glyph src={gEdit} w={23} h={23} l={0} t={-0.8} />,
  Trash: () => <Glyph src={gTrash} w={22} h={24} l={0.3} t={-0.8} />,
  Flask: () => <Glyph src={gFlask} w={22} h={24} l={0.6} t={-0.8} />,
  Preview: () => <Glyph src={gPreview} w={24} h={24} l={-0.4} t={-0.8} />,
  Columns: () => <Glyph src={gColumns} w={24} h={20} l={-0.4} t={1.2} />,
  Breakdown: () => <Glyph src={gBreakdown} w={22} h={22} l={0.6} t={0.2} />,
  Reports: () => <Glyph src={gReports} w={24} h={24} l={-0.4} t={-0.8} />,
  Export: () => <Glyph src={gExport} w={22} h={22} l={0.3} t={0.2} />,
  Charts: ({ on }) => <Glyph src={on ? gChartsOn : gCharts} w={22} h={22} l={0.3} t={0.2} />,
  // Meta AI ring of blobs (the "Analyse" button), full colour
  Analyse: () => <Glyph src={gAnalyse} w={24} h={24} l={-0.4} t={-0.8} color />,
};

// --- glyphs of the "More" dropdown, drawn in screenshot px (1 unit = 1 ref px) and sized in design px (ref / 1.125) ---
export const MenuIcons = {
  // "Manage rules": rounded square with an arrow leaving through its top right corner
  External: () => (
    <svg className="tbm-ic tbm-ic-ext" width={14 / K} height={15 / K} viewBox="0 0 14 15" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="miter" aria-hidden="true">
      <path d="M4.7 1.5H3Q1 1.5 1 3.5V11.5Q1 13.5 3 13.5H11Q13 13.5 13 11.5V10.4" />
      <path d="M6.4 1.5H13V7.7M13 1.5L5.3 9.2" />
    </svg>
  ),
  // "Export": chevron to the right (opens the export choices)
  ChevronRight: () => (
    <svg className="tbm-ic tbm-ic-chev" width={9.6 / K} height={16.5 / K} viewBox="0 0 9.6 16.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="miter" aria-hidden="true">
      <path d="M0.8 0.7L8.4 8.3L0.8 15.9" />
    </svg>
  ),
};

// --- level tab glyphs (26 px boxes, drawn in screenshot px) ---
const Tab = ({ children, w = 23, h = 23, stroke = 'currentColor', ...rest }) => (
  <svg className="fid-tic" width={w / 1.125} height={h / 1.125} style={{ width: w / 1.125, height: h / 1.125 }} viewBox={`0 0 ${w} ${h}`} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true" {...rest}>{children}</svg>
);
export const TabIcons = {
  campaign: () => (
    <Tab>
      <path d="M1.1 1.6H7.6L8.8 4.3H21.2Q22 4.3 22 5.1V19.9Q22 20.7 21.2 20.7H1.9Q1.1 20.7 1.1 19.9Z" />
      <path d="M11.5 8.9L15.1 15.8H7.9Z" fill="currentColor" stroke="none" />
    </Tab>
  ),
  adset: () => (
    <Tab>
      <rect x=".95" y=".95" width="8.6" height="8.6" rx="1.8" /><rect x="13.45" y=".95" width="8.6" height="8.6" rx="1.8" />
      <rect x=".95" y="13.45" width="8.6" height="8.6" rx="1.8" /><rect x="13.45" y="13.45" width="8.6" height="8.6" rx="1.8" />
      <circle cx="5.25" cy="5.25" r="1.5" fill="currentColor" stroke="none" /><circle cx="17.75" cy="17.75" r="1.5" fill="currentColor" stroke="none" />
    </Tab>
  ),
  adActive: () => (
    <Tab w={26} h={27} stroke="none">
      <rect x="0" y="0" width="26" height="26.6" rx="3.6" fill="currentColor" />
      <ellipse cx="6.5" cy="6" rx="1.7" ry="1.7" fill="#fff" /><rect x="11" y="4.6" width="10.8" height="2.7" rx=".6" fill="#fff" />
    </Tab>
  ),
  adIdle: () => (
    <Tab w={26} h={27}>
      <rect x="1" y="1" width="24" height="24.6" rx="3" /><path d="M1.5 7.8H24.5" />
      <circle cx="6" cy="4.4" r="1.2" fill="currentColor" stroke="none" />
    </Tab>
  ),
};
