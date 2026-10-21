import React from 'react';

// Glyphs of the three toolbar dropdowns (Columns / Breakdown / Reports), drawn on a pixel grid measured from the reference
// screenshots. Every icon is authored in REFERENCE pixels (1 unit = 1 px of the screenshot) and sized in design px (ref / 1.125),
// so it renders 1:1 against the screenshot at the clone's native zoom and stays crisp at any other zoom.
//
// Icons marked `slot` sit in a row's 20x20 icon slot and use slot coordinates: (0,0) is the top-left of the slot, the slot is
// centred on the row, and the SVG may extend beyond it (the viewBox is shifted so the SVG stays centred on the row).
// The other icons use their own coordinates (0,0 = top-left of the SVG).
const K = 1.125;
const Ico = ({ w, h = w, sw = 1.6, slot, children, ...rest }) => (
  <svg className="fm-ic" width={w / K} height={h / K} viewBox={`0 ${slot ? 10 - h / 2 : 0} ${w} ${h}`} fill="none" stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>{children}</svg>
);

// "Customise columns": three lines with a cog at the lower right
export const IcCustomise = () => (
  <Ico slot w={21} h={22} sw={1.5}>
    <path d="M0.9 1.2H18.5" />
    <path d="M0.9 7.6H7.2" />
    <path d="M0.9 13.85H7.2" strokeWidth="1.3" opacity=".8" />
    <circle cx="14.1" cy="10.1" r="3.2" strokeWidth="2.1" />
    <path d="M14.1 4.7V6.2M14.1 14V15.5M8.7 10.1H10.2M18 10.1H19.5M10.3 6.3L11.3 7.3M16.9 12.9L17.9 13.9M10.3 13.9L11.3 12.9M16.9 7.3L17.9 6.3" strokeWidth="1.4" strokeLinecap="butt" opacity=".75" />
  </Ico>
);

// "Compare attribution settings": a small box and a bar on top, a tall slot, and an elbow arrow
export const IcCompare = () => (
  <Ico slot w={21} h={26} sw={1.2}>
    <rect x=".7" y="-1.3" width="2.4" height="2.4" rx=".5" />
    <rect x="5.6" y="-1.3" width="13.6" height="2.4" rx=".5" />
    <rect x=".7" y="3.5" width="2.6" height="13.8" rx="1.1" />
    <path d="M17 4.2V14.7H7.3" strokeWidth="1.3" />
    <path d="M14.8 6.4L17 4.2L19.2 6.4" strokeWidth="1.2" />
    <path d="M9.6 12.5L7.4 14.7L9.6 16.9" strokeWidth="1.2" />
  </Ico>
);

// "Conditional formatting": a table with a header band, a side column and four cells
export const IcConditional = () => (
  <Ico slot w={21} h={22} sw={1.4}>
    <rect x=".85" y="-.4" width="18.3" height="16.2" rx="2.2" />
    <path d="M.85 4.2H19.15M5.1 4.2V15.8" />
    <path d="M8.2 8.2H10.5M13.6 8.2H15.9M8.2 12.1H10.5M13.6 12.1H15.9" strokeWidth="2" strokeLinecap="butt" />
  </Ico>
);

// Export dropdown, "Schedule export": an envelope that is open at the left, with two speed lines
export const IcSchedule = () => (
  <Ico w={21} h={17} sw={1}>
    <path d="M4.4 2.9H18.7A1.05 1.05 0 0 1 19.75 3.95V13.05A1.05 1.05 0 0 1 18.7 14.1H4.9" strokeLinecap="butt" />
    <path d="M5.1 3.1L12.3 9.8L19.1 3.2" strokeWidth="1.1" />
    <path d="M.75 6.65H4.3M1.7 10.35H8" strokeWidth="1.2" strokeLinecap="butt" />
  </Ico>
);

// Export dropdown, "Share table link": two chain links (the second is the first turned by 180 degrees)
const LINK = 'M9.4 12.2C10.1 12.75 10.8 13.02 11.6 13C12.6 12.95 13.3 12.6 14 11.95L15.6 10.4C16.7 9.3 17.35 8.2 17.35 7C17.35 4.7 15.5 2.95 13.2 2.95C11.9 2.95 10.8 3.6 10.1 4.6C9.6 5.3 9.2 5.5 9.05 5.9';
export const IcLink = () => (
  <Ico w={21} h={21} sw={1.7}>
    <path d={LINK} />
    <path d={LINK} transform="rotate(180 10.65 10.65)" />
  </Ico>
);

export const IcChevR = () => (
  <Ico w={10.5} h={16} sw={2}><path d="M1.5 1.4L8.8 8L1.5 14.6" /></Ico>
);

export const IcBack = () => (
  <Ico w={17} h={16} sw={1.9}><path d="M16 8H1.8M8 1.8L1.8 8L8 14.2" /></Ico>
);

export const IcSearch = () => (
  <Ico w={15} h={15} sw={1.4}><circle cx="6.4" cy="6.4" r="5" /><path d="M10.2 10.2L13.4 13.4" /></Ico>
);

export const IcPlus = () => (
  <Ico w={15} h={15} sw={1.4}><path d="M7.5 .9V14.1M.9 7.5H14.1" /></Ico>
);

export const IcInfo = () => (
  <svg className="fm-ic" width={15 / K} height={15 / K} viewBox="0 0 15 15" aria-hidden="true">
    <circle cx="7.5" cy="7.5" r="7.5" fill="currentColor" />
    <circle cx="7.5" cy="4" r="1.1" fill="#fff" />
    <rect x="6.5" y="6.1" width="2" height="5.6" rx=".5" fill="#fff" />
  </svg>
);

// "View breakdown charts": a framed panel with a list column at its right
export const IcPanel = () => (
  <Ico slot w={21} h={22} sw={1.2}>
    <rect x=".65" y="1.2" width="18.7" height="18.7" rx="1.6" />
    <path d="M11.8 1.2V19.9" />
    <path d="M14.2 4.2H18M14.2 7.1H18M14.2 9.9H18" strokeWidth="1.05" />
  </Ico>
);

// "View ad creative performance": a picture frame in front of a second one
export const IcImage = () => (
  <Ico slot w={21} h={22} sw={1.25}>
    <path d="M5.1 1.4H1.9A1.5 1.5 0 0 0 .4 2.9V16.7A1.5 1.5 0 0 0 1.9 18.2H5.1" />
    <rect x="5.1" y=".35" width="14.2" height="18.8" rx="1.7" />
    <circle cx="9.1" cy="4.7" r="1.7" fill="currentColor" stroke="none" />
    <path d="M5.4 13.3L9.4 10.4L11.8 12.6L15.4 8.8L19 11.6" />
  </Ico>
);

// "Try report templates": a notebook with a spiral binding
export const IcTemplates = () => (
  <Ico slot w={21} h={22} sw={1.25}>
    <rect x="4.2" y=".15" width="14.2" height="19" rx="1.4" />
    <path d="M6.3 .15V19.15" />
    <path d="M.7 3.9H4.2M.7 7.5H4.2M.7 11.4H4.2M.7 15H4.2" strokeWidth="1.5" strokeLinecap="butt" />
    <path d="M8.6 5H15.6M8.6 8.6H15.6" strokeWidth="1.3" />
    <path d="M8.6 12.5H14.6" strokeWidth="1.3" opacity=".6" />
  </Ico>
);
