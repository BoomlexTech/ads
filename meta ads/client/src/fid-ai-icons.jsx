import React from 'react';

// Glyphs of the Meta AI business assistant panel, drawn in design pixels so they match the reference screenshot.

// The Meta AI logo: seven petals on a ring; each petal is an ellipse whose long axis is turned 35deg against the ring.
// The 35 x 35 view box is in reference pixels (the logo is 35 px wide in the reference, i.e. 31 design px).
const PETALS = ['#cf53ff', '#af4efc', '#7c45fb', '#5f43fe', '#5f48e4', '#9a4df2', '#c654fc'];
// At the small size (the "Waiting..." and answer rows) the real logo is a tight ring of fat, softer petals.
const PETALS_SMALL = ['#b65fe2', '#9a58e6', '#704be2', '#5d45e0', '#684dd2', '#7b55d6', '#bb62ea'];
export const MetaAILogo = ({ size = 31, small, className, style }) => {
  const R = small ? 12.6 : 12, rx = small ? 4.85 : 3.7, ry = small ? 3.45 : 5.3, turn = small ? -20 : -35;
  const colours = small ? PETALS_SMALL : PETALS;
  return (
    <svg className={className} style={small ? { filter: 'blur(.5px)', ...style } : style} width={size} height={size} viewBox="0 0 35 35" aria-hidden="true">
      {colours.map((c, k) => {
        const a = (k * 360) / 7, r = (a * Math.PI) / 180, x = 17.5 + R * Math.sin(r), y = 17.5 - R * Math.cos(r);
        return <ellipse key={k} cx={x} cy={y} rx={rx} ry={ry} fill={c} transform={`rotate(${a + turn} ${x} ${y})`} />;
      })}
    </svg>
  );
};

// Glyphs fitted in reference-screenshot pixels (1.125 per design px): a 30 x 30 frame shown at 26.67 design px.
const RefIco = ({ w = 30, h = 30, children, ...rest }) => <svg width={w / 1.125} height={h / 1.125} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true" {...rest}>{children}</svg>;

const Ico = ({ w, h = w, children, ...rest }) => <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true" {...rest}>{children}</svg>;

export const IcHamburger = () => <Ico w={16} h={14} stroke="currentColor" strokeWidth="1.7"><path d="M0 1.2h16M0 7h16M0 12.8h16" /></Ico>;

export const IcCompose = () => (
  <RefIco stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'translate(-.8px,-.9px)' }}>
    <path d="M14.92 7.8H9.56Q6.87 7.8 6.87 10.5V21.52Q6.87 24.21 9.56 24.21H20.46Q23.15 24.21 23.15 21.52V16.21" strokeWidth="1.75" />
    <path d="M10.5 20.5L13.15 20.58L23.83 9.9L21.1 7.17L10.42 17.85Z" strokeWidth="1.58" />
    <path d="M10.5 20.5L13.15 20.58L10.42 17.85Z" fill="currentColor" stroke="none" />
    <circle cx="22.46" cy="8.54" r="1.78" strokeWidth="1.47" />
  </RefIco>
);

const CAL_DOTS = [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2]];
export const IcCalendar = () => (
  <RefIco w={30} h={26} style={{ transform: 'translate(0,-.9px)' }}>
    <path d="M5.86 9.55Q5.86 5.68 9.74 5.68H20.27Q24.15 5.68 24.15 9.55V18.51Q24.15 22.38 20.27 22.38H9.74Q5.86 22.38 5.86 18.51Z" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5.06 9.55Q5.06 4.88 9.74 4.88H20.27Q24.95 4.88 24.95 9.55V8.18H5.06Z" fill="currentColor" />
    {CAL_DOTS.map(([c, r]) => <rect key={`${r}${c}`} x={9.334 + c * 3.318} y={10.788 + r * 3.318} width="1.353" height="1.353" fill="#464e54" />)}
  </RefIco>
);

export const IcExpand = () => (
  <RefIco stroke="currentColor" strokeWidth="1.74" style={{ transform: 'translate(.9px,-.9px)' }}>
    <path d="M15.72 7.63H22.72V14.65Z" fill="currentColor" stroke="none" />
    <path d="M5.69 24.7H12.71L5.69 17.72Z" fill="currentColor" stroke="none" />
    <path d="M19.27 11.08l-3.78 3.78M9.14 21.25l3.72-3.72" />
  </RefIco>
);

export const IcClose = () => <Ico w={14} stroke="currentColor" strokeWidth="1.85" strokeLinecap="round"><path d="M1.2 1.2l11.6 11.6M12.8 1.2L1.2 12.8" /></Ico>;

export const IcInfo = () => (
  <Ico w={18} stroke="currentColor" strokeWidth="1.6">
    <circle cx="9" cy="9" r="8" />
    <path d="M9 8v5" strokeWidth="1.9" />
    <circle cx="9" cy="5.1" r="1" fill="currentColor" stroke="none" />
  </Ico>
);

export const IcClip = () => (
  <RefIco stroke="#979b9e" strokeWidth="2.1" style={{ margin: '0 -3.83px 0 -5.83px', position: 'relative', top: '-.7px' }}>
    <g transform="translate(15.04 16.02) rotate(-36.2)">
      <rect x="-10.2" y="-3.46" width="12.69" height="6.92" rx="3.46" />
      <rect x="-2.49" y="-3.46" width="12.69" height="6.92" rx="3.46" />
    </g>
  </RefIco>
);

export const IcPlus = () => <Ico w={14} stroke="currentColor" strokeWidth="1.7" strokeLinecap="butt"><path d="M7 .5v13M.5 7h13" /></Ico>;

export const IcStop = () => <Ico w={13.4} fill="currentColor"><rect width="13.4" height="13.4" rx="2.7" /></Ico>;
export const IcSend = () => <Ico w={14} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 12.5v-11M2.2 6.3L7 1.5l4.8 4.8" /></Ico>;
