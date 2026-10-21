import React from 'react';

// Small hand-drawn icon set matching Ads Manager's toolbar / tab glyphs (solid triangles, bar icons, ...)
const S = ({ size = 20, children, big, fill = 'none', stroke = 'currentColor', sw = 1.8, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {big ? <g transform="translate(10 10) scale(1.28) translate(-10 -10)">{children}</g> : children}
  </svg>
);

// the solid dropdown triangle used on every Ads Manager menu / column header
export const Caret = ({ size = 11 }) => (
  <svg className="caret" width={size} height={size * 0.6} viewBox="0 0 10 6" aria-hidden="true"><path d="M0 0h10L5 6z" fill="currentColor" /></svg>
);

// level-tab icons: outline when inactive, solid when the tab is active (as in Ads Manager)
export const TabCampaign = ({ active }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.8 6.2a2.2 2.2 0 0 1 2.2-2.2h4l2 2.2h8a2.2 2.2 0 0 1 2.2 2.2v9.4a2.2 2.2 0 0 1-2.2 2.2H5a2.2 2.2 0 0 1-2.2-2.2z" fill={active ? 'currentColor' : 'none'} />
    <path d="M12 10.6l2.8 5.2H9.2z" fill={active ? '#fff' : 'currentColor'} stroke="none" />
  </svg>
);
export const TabAdset = ({ active }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    {[[2.6, 2.6], [13.4, 2.6], [2.6, 13.4], [13.4, 13.4]].map(([x, y], i) => <rect key={i} x={x} y={y} width="8" height="8" rx="2.2" fill={active ? 'currentColor' : 'none'} />)}
    <circle cx="6.6" cy="6.6" r="1.5" fill={active ? '#fff' : 'currentColor'} stroke="none" /><circle cx="17.4" cy="17.4" r="1.5" fill={active ? '#fff' : 'currentColor'} stroke="none" />
  </svg>
);
export const TabAds = ({ active }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="1.6" y="2.6" width="20.8" height="18.8" rx="3.6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" />
    {active
      ? <><circle cx="5.8" cy="6.4" r="1.2" fill="#fff" /><rect x="9" y="5.6" width="10" height="1.7" rx=".85" fill="#fff" /><rect x="4.4" y="10.2" width="15.2" height="8.2" rx="1.4" fill="#fff" opacity=".3" /></>
      : <><path d="M2 8.6h20" stroke="currentColor" strokeWidth="1.7" /><circle cx="5.4" cy="5.7" r=".9" fill="currentColor" /></>}
  </svg>
);
export const AnalyseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    {[[12, 5.2, '#7b4ae6'], [18.6, 8.6, '#3d8bfd'], [18.6, 15.6, '#a24be0'], [12, 19, '#3d8bfd'], [5.4, 15.6, '#7b4ae6'], [5.4, 8.6, '#a24be0']]
      .map(([x, y, c], i) => <ellipse key={i} cx={x} cy={y} rx="2.6" ry="3.6" fill={c} transform={`rotate(${i * 60} ${x} ${y})`} />)}
  </svg>
);
export const IconPlus = () => <S size={18} sw={2.4}><path d="M10 3.5v13M3.5 10h13" /></S>;
export const IconColumns = () => <S big fill="currentColor" stroke="none"><rect x="2" y="3" width="3.6" height="14" rx=".9" /><rect x="8.2" y="3" width="3.6" height="14" rx=".9" /><rect x="14.4" y="3" width="3.6" height="14" rx=".9" /></S>;
export const IconBreakdown = () => <S big fill="currentColor" stroke="none"><rect x="2" y="3" width="16" height="3.4" rx=".9" /><rect x="2" y="8.3" width="11" height="3.4" rx=".9" /><rect x="6" y="13.6" width="12" height="3.4" rx=".9" /></S>;
export const IconReports = () => <S big fill="currentColor" stroke="none"><path d="M6 2.5h8.2c.8 0 1.5.7 1.5 1.5v10.6c0 .8-.7 1.5-1.5 1.5H6c-.8 0-1.5-.7-1.5-1.5V4c0-.8.7-1.5 1.5-1.5zm1.4 3.2v1.5h5.4V5.7zm0 3.2v1.5h5.4V8.9z" /><path d="M2.6 5.3v11.2c0 .5.4.9.9.9h9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></S>;
export const IconExport = () => <S><path d="M8.2 4H4.5A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17h10a1.5 1.5 0 0 0 1.5-1.5v-3.7" /><path d="M11.6 3h5.4v5.4M17 3l-7 7" /></S>;
export const IconCharts = () => <S sw={1.7}><rect x="2.5" y="2.5" width="15" height="15" rx="2.2" /><path d="M5.6 13.2l3-3.6 2.6 2.1 3.4-4.6" /><path d="M12.4 7.1h2.6v2.6" /></S>;
export const IconDuplicate = () => <S size={19} big fill="currentColor" stroke="none"><path d="M7.5 2.5h5.2l3.8 3.8v8.2c0 .8-.7 1.5-1.5 1.5h-7.5c-.8 0-1.5-.7-1.5-1.5v-10c0-.8.7-1.5 1.5-1.5z" /><path d="M4.6 5.2v11h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></S>;
export const IconEdit = () => <S size={19} big fill="currentColor" stroke="none"><path d="M13.3 3.3l3.4 3.4-9.6 9.6-4 .6.6-4zM14.5 2.1a1.6 1.6 0 0 1 2.3 0l1.1 1.1a1.6 1.6 0 0 1 0 2.3l-.6.6-3.4-3.4z" /></S>;
export const IconFlask = () => <S size={19} big fill="currentColor" stroke="none"><path d="M7.6 2.5h4.8v1.6h-.7v3.7l4.2 7.1c.5.9-.1 2-1.1 2H5.2c-1 0-1.6-1.1-1.1-2l4.2-7.1V4.1h-.7z" /><path d="M7 11.3h6" stroke="#fff" strokeWidth="1.2" /></S>;
export const IconCheck = ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 7.4l3 3 6-6.4" /></svg>;
export const IconChevron = ({ dir = 'left' }) => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={dir === 'left' ? 'M11 3.5L5.5 9l5.5 5.5' : 'M7 3.5L12.5 9 7 14.5'} /></svg>;
export const MetaAI = ({ small }) => (
  <svg width={small ? 28 : 38} height={small ? 28 : 38} viewBox="0 0 38 38" aria-hidden="true">
    {[[19, 7, '#6b4ae0'], [28, 10, '#3d8bfd'], [32, 19, '#8f4be8'], [28, 28, '#c04fe0'], [19, 32, '#3d8bfd'], [10, 28, '#6b4ae0'], [6, 19, '#c04fe0'], [10, 10, '#8f4be8']]
      .map(([x, y, c], i) => <ellipse key={i} cx={x} cy={y} rx="3.6" ry="5.2" fill={c} transform={`rotate(${i * 45} ${x} ${y})`} />)}
  </svg>
);
