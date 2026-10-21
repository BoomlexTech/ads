import React from 'react';

// Glyphs of the quick-views row and its dropdown, fitted to the real page's icons.
// The drawing coordinates are in screenshot pixels (the reference was captured at 1.125x), so every svg is sized
// as units / 1.125 design px; the viewBox origin positions the glyph inside its 20 x 20 unit frame.
const R = 1.125;
const S = (sw) => ({ fill: 'none', stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' });

function Frame({ vb, w = 20, h = 20, className = '', children }) {
  const [x, y] = vb;
  return (
    <svg className={`fid-qv-svg ${className}`} width={w / R} height={h / R} viewBox={`${x} ${y} ${w} ${h}`} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

// solid folder (selected "All ads"): translucent back tab + solid body
export const FolderFill = () => (
  <Frame vb={[2.2, 3.2]}>
    <path fill="currentColor" fillOpacity=".56" d="M4.73 4 H11.2 Q12.2 4 12.2 5 V8.7 H2.1 V6.63 Q2.1 4 4.73 4Z" />
    <rect fill="currentColor" x="2.1" y="6.7" width="19.8" height="15" rx="2.64" />
  </Frame>
);
// the same folder as an outline (not selected / saved views)
export const FolderLine = () => (
  <Frame vb={[2.2, 3.2]}>
    <path {...S(1.8)} d="M3 6.9 Q3 4.9 5 4.9 H10.6 Q11.5 4.9 12.1 5.7 L13.1 7.1 Q13.4 7.6 14.2 7.6 H19.1 Q21 7.6 21 9.5 V19 Q21 20.8 19.1 20.8 H4.9 Q3 20.8 3 19 Z" />
  </Frame>
);
export const ActionsIcon = ({ panel = false }) => (panel
  ? <Frame vb={[3.4, 4.14]}>
      <path {...S(1.76)} d="M6.88 20.06 A8.35 8.35 0 1 1 19.58 20.06" />
      <path {...S(1.69)} d="M13.23 18.74 V11.25 M10.1 14.22 L13.23 11.25 L16.36 14.22" />
    </Frame>
  : <Frame vb={[3.2, 3.2]}>
      <path {...S(1.96)} d="M7.22 19.95 A8.54 8.54 0 1 1 18.86 19.95" />
      <path {...S(1.92)} d="M13.04 17.8 V10.2 M9.69 13.51 L13.04 10.2 L16.39 13.51" />
    </Frame>
);
// right-pointing paper plane
// (`row`: the slightly smaller, lower variant of the row buttons, fitted against the row of the real page)
export const PlaneIcon = ({ vb = [4.2, 5.2], row = false }) => (row
  ? <Frame vb={[4.2, 4.6]}>
      <g opacity=".63"><path {...S(2.1)} d="M5.5 6.45 L23.5 15.25 L5.9 24.1 L7.3 15.25 Z" /></g>
      <g opacity=".9"><path {...S(1.15)} d="M7.9 15.25 L23.5 15.25" /></g>
    </Frame>
  : <Frame vb={vb}>
      <g opacity=".63"><path {...S(2.06)} d="M5.4 6.44 L24.5 15.6 L5.81 24.2 L7.1 15.6 Z" /></g>
      <g opacity=".9"><path {...S(1.46)} d="M7.1 15.6 L24.5 15.6" /></g>
    </Frame>
);
// open envelope with the X of its folds
export const MailIcon = ({ vb = [3.5, 2.9] }) => (
  <Frame vb={vb}>
    <g opacity=".76">
      <path {...S(1.3)} d="M3.96 21.68 L3.96 11.2 Q3.96 9.9 5.02 9.15 L11.92 4.23 Q13.22 3.3 14.52 4.23 L21.39 9.14 Q22.45 9.9 22.45 11.2 L22.45 21.68" />
      <path {...S(1.3)} d="M3.96 10.4 L13.22 16.85 L22.45 10.4 M3.96 20.3 L13.22 16.85 L22.45 20.3" />
      <path {...S(1.43)} d="M3.46 22.28 H22.95" />
    </g>
  </Frame>
);
// pencil with a ring at its end (edit a view)
export const PencilIcon = () => (
  <Frame vb={[2.8, 2.5]}>
    <g opacity=".68">
      <path {...S(1.78)} d="M14.85 6.5 L4.3 16.8 L4.15 21.05 L8.4 20.8 L17.4 11.8" />
      <circle {...S(1.78)} cx="18.31" cy="7" r="2.93" />
    </g>
  </Frame>
);
export const BackArrow = () => (
  <Frame vb={[1.4, 1]}>
    <path {...S(1.85)} d="M4.76 11.2 H18.13 M10.46 5.5 L4.76 11.2 L10.46 16.9" />
  </Frame>
);
export const ChevronRight = () => (
  <Frame vb={[-2, 0.5]}>
    <path {...S(1.8)} d="M4.55 4.5 L12.2 11.2 L4.55 17.85" />
  </Frame>
);
// plus of the "See more" button
export const PlusBold = () => (
  <Frame vb={[1, 1]} w={20} h={22}>
    <path {...S(1.5)} d="M11 5.4 V18.6 M4.4 12 H17.6" />
  </Frame>
);
// thin plus of the "Create view" button
export const PlusThin = () => (
  <Frame vb={[0, 0.5]}>
    <path {...S(1.19)} d="M9.92 4.05 V17.25 M3.62 10.65 H16.22" />
  </Frame>
);
// the small blue "recommendations" glyph in the Actions view's hover card: four dots joined by a rising zig-zag
export const RecoIcon = () => (
  <Frame vb={[0, 0]} w={16} h={16}>
    <path fill="none" stroke="#0a78be" strokeOpacity=".5" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" d="M4.3 12.2 L7.1 7.2 L12.1 10.6 L13.6 3.1" />
    <g fill="#0a78be"><circle cx="4.3" cy="12.2" r="1.85" /><circle cx="7.1" cy="7.2" r="1.85" /><circle cx="12.1" cy="10.6" r="1.85" /><circle cx="13.6" cy="3.1" r="1.85" /></g>
  </Frame>
);
// the square "settings" (sliders) button: two lines with a ring knob each
export const SlidersIcon = () => (
  <Frame vb={[0, 0]} w={28} h={24}>
    <g opacity=".88">
      <path {...S(1.46)} d="M4.64 7.63 H8.43 M13.39 7.63 H23.4 M4.64 16.4 H14.59 M19.55 16.4 H23.4" />
      <circle {...S(1.46)} cx="10.91" cy="7.63" r="2.48" />
      <circle {...S(1.46)} cx="17.07" cy="16.4" r="2.48" />
    </g>
  </Frame>
);
