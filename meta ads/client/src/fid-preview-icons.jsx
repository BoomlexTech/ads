import React from 'react';
import gExpand from './assets/preview/g-expand.png';
import gShare from './assets/preview/g-share.png';
import gInfo from './assets/preview/g-info.png';
import gInfoF from './assets/preview/g-infof.png';
import gClose from './assets/preview/g-close.png';

// Glyphs of the "Ad preview" dialog. Everything is authored in REFERENCE pixels (1 unit = 1 px of the screenshot) and sized in
// design px (ref / 1.125), so it renders 1:1 against the screenshot at the clone's native zoom.
const K = 1.125;
const Ico = ({ w, h = w, children, ...rest }) => (
  <svg className="fid-pv-ic" width={w / K} height={h / K} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true" {...rest}>{children}</svg>
);

// glyphs cropped from the reference screenshots, painted in currentColor through a CSS mask (1 px = 1 screenshot px)
// `m` is the 1 px margin kept around the glyph in the crop
const Glyph = ({ src, w, h, m = 1 }) => (
  <i className="fid-pv-gi" aria-hidden="true"
    style={{ width: w / K, height: h / K, margin: `${-m / K}px`, WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` }} />
);
export const IcExpand = () => <Glyph src={gExpand} w={20} h={20} />;
export const IcShare = () => <Glyph src={gShare} w={21} h={19} />;
export const IcInfo = () => <Glyph src={gInfo} w={22} h={22} />;
export const IcInfoFill = () => <Glyph src={gInfoF} w={17} h={17} />;

export const IcCaret = () => (
  <Ico w={14} h={8}><path d="M.5 .5H13.5L7 7.5Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" /></Ico>
);

// the 16 x 16 close glyph (header and banner use the same one), cropped from the reference: its soft edges cannot be drawn as a stroke
export const IcClose = () => <Glyph src={gClose} w={18} h={18} />;

// device row: desktop + phone (selected: blue), square, portrait phone, landscape
export const IcDevAll = () => (
  <Ico w={20} h={18}>
    <path d="M.7 8.9V.95H17V5.4" stroke="currentColor" strokeWidth="1.3" />
    <rect x="0" y="8.8" width="10.7" height="3.9" rx=".5" fill="currentColor" />
    <rect x="7.1" y="12.5" width="2.5" height="1.8" fill="currentColor" />
    <rect x="3" y="14" width="7" height="1.3" rx=".5" fill="currentColor" />
    <rect x="11.9" y="5.9" width="7.2" height="11.2" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
    <rect x="11.5" y="5.3" width="7.9" height="2.4" rx="1" fill="currentColor" />
    <rect x="11.5" y="15.3" width="7.9" height="2.4" rx="1" fill="currentColor" />
  </Ico>
);
export const IcDevSquare = () => <Ico w={20}><rect x=".7" y=".7" width="18.6" height="18.6" rx="3.2" stroke="currentColor" strokeWidth="1.25" /></Ico>;
export const IcDevPortrait = () => <Ico w={14} h={20}><rect x=".7" y=".7" width="12.6" height="18.6" rx="2" stroke="currentColor" strokeWidth="1.25" /></Ico>;
export const IcDevWide = () => <Ico w={20} h={14}><rect x=".7" y=".7" width="18.6" height="12.6" rx="2" stroke="currentColor" strokeWidth="1.25" /></Ico>;

// green check circle at the right end of the device row
export const IcOk = () => (
  <Ico w={20}>
    <circle cx="10" cy="10" r="10" fill="#006b4e" />
    <path d="M5.5 10.4L8.3 13.2L14.6 6.9" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </Ico>
);

// small video badge in the top-right corner of a video tile: white ring, dark rounded rectangle, play triangle
export const IcVideoBadge = () => (
  <svg className="fid-pv-badge" width={20 / K} height={18 / K} viewBox="0 0 20 18" aria-hidden="true">
    <rect width="20" height="18" rx="4.6" fill="#fff" />
    <rect x="2" y="2.3" width="15" height="12.4" rx="3.2" fill="#283943" />
    <path d="M7.2 6.2V10.8L11.8 8.5Z" fill="#fff" stroke="#fff" strokeWidth=".5" strokeLinejoin="round" />
  </svg>
);

// "no picture" glyph for ads without media (same family as the table thumbnail)
export const IcNoMedia = () => (
  <svg className="fid-pv-nomedia" width={22 / K} height={22.4 / K} viewBox="0 0 22 22.4" fill="none" stroke="#c1c3c4" strokeLinejoin="round" aria-hidden="true">
    <rect x="1.7" y="1.7" width="18.6" height="19" rx="2.6" strokeWidth="3.4" />
    <path d="M1.7 14.9H20.3" strokeWidth="3" />
    <path d="M13.9 15.5V19.2" strokeWidth="1.5" />
  </svg>
);
