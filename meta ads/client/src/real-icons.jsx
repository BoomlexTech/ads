import React from 'react';

// Exact glyphs of the real Ads Manager (inline SVG paths copied from the page's own markup).
// The real page draws them at their CSS size on a 1.25x screen; the clone is laid out at 1/1.1114 of that,
// so a glyph of c real CSS px is drawn c * 1.1114 design px wide (see px()).
const F = 1.1114;
const px = (c) => +(c * F).toFixed(3);
const svg = (vb, c, extra) => ({ viewBox: `0 0 ${vb} ${vb}`, width: px(c), height: px(c), fill: 'currentColor', 'aria-hidden': true, focusable: 'false', ...extra });

// "search with a sparkle" of the search / filter bar (16 px)
export const RealSearch = ({ className }) => (
  <svg {...svg(16, 16, { className })}>
    <path d="M12.714 7.38V7.34c.525.118 1.1-.016 1.51-.4a6.828 6.828 0 0 1-1.486 4.722l2.039 2.038a.762.762 0 0 1-1.077 1.078l-2.039-2.039A6.857 6.857 0 1 1 10.64 1.345l-.727.312a1.634 1.634 0 0 0-.783.683 5.333 5.333 0 1 0 3.585 5.04z" />
    <path d="M13.48.772a.412.412 0 0 0-.757 0l-.545 1.268a.411.411 0 0 1-.217.216l-1.283.549a.41.41 0 0 0-.003.753l1.234.542c.093.04.167.114.209.206l.597 1.31c.148.325.613.32.754-.008l.556-1.294a.411.411 0 0 1 .216-.216l1.271-.543a.41.41 0 0 0 0-.755l-1.271-.544a.411.411 0 0 1-.216-.216L13.48.772z" />
  </svg>
);

// column header sort glyphs (16 px): both directions, descending (single arrow down) and ascending (the same arrow turned over)
export const RealSortBoth = ({ className }) => (
  <svg {...svg(16, 16, { className })}><path d="m1.826 6.4 1.745-1.745v7.306c0 .42.343.762.762.762a.764.764 0 0 0 .762-.762V4.655L6.84 6.399a.748.748 0 0 0 .54.221.759.759 0 0 0 .54-1.295L4.876 2.278a.759.759 0 0 0-1.074 0L.752 5.325A.759.759 0 1 0 1.826 6.4zM14.459 9.889l-1.745 1.745V4.327a.764.764 0 0 0-.762-.762.764.764 0 0 0-.762.762v7.307L9.445 9.889a.759.759 0 1 0-1.074 1.074l3.048 3.048c.152.152.343.22.54.22a.78.78 0 0 0 .542-.22l3.047-3.048a.759.759 0 1 0-1.074-1.074h-.015z" /></svg>
);
export const RealSortDown = ({ className, up = false }) => (
  <svg {...svg(16, 16, { className, style: up ? { transform: 'rotate(180deg)' } : undefined })}><path d="M7.604 14.014a.762.762 0 0 0 1.078 0l3.81-3.81a.762.762 0 1 0-1.078-1.077l-2.51 2.51V2.808a.762.762 0 0 0-1.523 0v8.827L4.872 9.127a.762.762 0 1 0-1.077 1.078l3.81 3.81z" /></svg>
);

// footer "information symbol" (12 px)
export const RealInfo = ({ className }) => (
  <svg {...svg(12, 12, { className })}><path fillRule="evenodd" clipRule="evenodd" d="M6 0a6 6 0 1 1 0 12A6 6 0 0 1 6 0zm0 4.5a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0v-4a1 1 0 0 0-1-1zm0-3c-.667 0-1 .35-1 .875s.333.875 1 .875 1-.35 1-.875S6.667 1.5 6 1.5z" /></svg>
);

// row chips (12 px): bar chart (Charts) and the trend square (compare)
export const RealCharts = ({ className }) => (
  <svg {...svg(12, 12, { className })}><path d="M3 6H.6a.6.6 0 0 0-.6.6v3.6a.6.6 0 0 0 .6.6H3a.6.6 0 0 0 .6-.6V6.6A.6.6 0 0 0 3 6zM7.2 1.2H4.8a.6.6 0 0 0-.6.6v8.4a.6.6 0 0 0 .6.6h2.4a.6.6 0 0 0 .6-.6V1.8a.6.6 0 0 0-.6-.6zM11.4 3.6H9a.6.6 0 0 0-.6.6v6a.6.6 0 0 0 .6.6h2.4a.6.6 0 0 0 .6-.6v-6a.6.6 0 0 0-.6-.6z" /></svg>
);
export const RealInsights = ({ className }) => (
  <svg {...svg(12, 12, { className })}><path d="M4.026 5.576 5.1 6.65l1.854-1.854H6c-.33 0-.6-.27-.6-.6 0-.33.27-.6.6-.6h2.4a.611.611 0 0 1 .6.6v2.4c0 .33-.27.6-.6.6-.33 0-.6-.27-.6-.6v-.954L5.526 7.916a.598.598 0 0 1-.846 0L3.606 6.842.924 9.524c.042.234.078.468.132.696a1.503 1.503 0 0 0 1.464 1.176h6.966c.702 0 1.32-.492 1.464-1.176.6-2.802.6-5.646 0-8.454A1.503 1.503 0 0 0 9.486.59H2.52c-.702 0-1.32.492-1.464 1.176a20.047 20.047 0 0 0-.342 6.27L3.18 5.57a.598.598 0 0 1 .846 0v.006z" /></svg>
);
