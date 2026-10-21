// Built-in sample artwork for the demo (farm scenes and a leaf badge logo), drawn as SVG
// on request so the image library has good-looking pictures without storing any files.
// The same file name always gives the same picture.
//   scene-<hue 0-359>-<variant 0-5>-<w>x<h>.svg    logo-<hue 0-359>.svg
const SCENE = /^scene-(0|[1-9]\d{0,2})-([0-5])-([1-9]\d{0,4})x([1-9]\d{0,4})\.svg$/;
const LOGO = /^logo-(0|[1-9]\d{0,2})\.svg$/;
export const SAMPLE_PREFIX = '/api/sample/';
export const LOGO_SIZE = 1200;
// File-name stems for each composition (used for asset names like 'field-rows-1.svg').
export const VARIANTS = ['field-rows', 'golden-wheat', 'orchard', 'sunset-field', 'terraces', 'farmstead'];

const clampDim = (n) => Math.min(2400, Math.max(16, n));
const f = (n) => Math.round(n * 10) / 10;
const mod = (h) => ((Math.round(h) % 360) + 360) % 360;
const hsl = (h, s, l) => `hsl(${mod(h)},${Math.round(s)}%,${Math.round(l)}%)`;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const sceneFile = (hue, variant, w, h) => `scene-${mod(hue)}-${variant}-${w}x${h}.svg`;
export const logoFile = (hue) => `logo-${mod(hue)}.svg`;
export const sampleUrl = (file) => SAMPLE_PREFIX + file;

// { kind: 'scene', hue, variant, w, h } | { kind: 'logo', hue, w, h } | null
export function parseSample(file) {
  let m = SCENE.exec(String(file || ''));
  if (m && Number(m[1]) < 360) {
    return { kind: 'scene', hue: Number(m[1]), variant: Number(m[2]), w: clampDim(Number(m[3])), h: clampDim(Number(m[4])) };
  }
  m = LOGO.exec(String(file || ''));
  if (m && Number(m[1]) < 360) return { kind: 'logo', hue: Number(m[1]), w: LOGO_SIZE, h: LOGO_SIZE };
  return null;
}

export function sampleSvg(file) {
  const p = parseSample(file);
  if (!p) return null;
  return p.kind === 'logo' ? logoSvg(p.hue) : sceneSvg(p.hue, p.variant, p.w, p.h);
}

// An ImageRef for a sample url ('/api/sample/...'), or null when it isn't one.
export function sampleRef(url, name) {
  const s = String(url || '');
  if (!s.startsWith(SAMPLE_PREFIX)) return null;
  const file = s.slice(SAMPLE_PREFIX.length);
  const p = parseSample(file);
  if (!p) return null;
  return { url: s, w: p.w, h: p.h, bytes: Buffer.byteLength(sampleSvg(file)), name: name || file };
}

// ---------------- drawing helpers ----------------
// Smooth curve through points (quadratic segments between midpoints).
function smooth(pts) {
  let d = `L${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += `Q${f(x)},${f(y)} ${f((x + nx) / 2)},${f((y + ny) / 2)}`;
  }
  const last = pts[pts.length - 1];
  return d + `L${f(last[0])},${f(last[1])}`;
}

// Rolling hill line whose tops sit between base-amp and base, filled down to the bottom.
function ridge(w, h, base, amp, r, fill, n = 7) {
  const ph = r() * 6.28;
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const x = -0.05 * w + (1.1 * w * k) / n;
    pts.push([x, base - amp * (0.5 + 0.5 * Math.sin(k * 1.3 + ph)) * (0.75 + r() * 0.5)]);
  }
  return `<path d="M${f(pts[0][0])},${f(h)}${smooth(pts)}L${f(pts[n][0])},${f(h)}Z" fill="${fill}"/>`;
}

function cloud(x, y, s, op = 0.85) {
  return `<g fill="#fff" opacity="${op}"><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(s * 1.7)}" ry="${f(s * 0.5)}"/>`
    + `<circle cx="${f(x - s * 0.55)}" cy="${f(y - s * 0.2)}" r="${f(s * 0.5)}"/><circle cx="${f(x + s * 0.2)}" cy="${f(y - s * 0.38)}" r="${f(s * 0.68)}"/>`
    + `<circle cx="${f(x + s * 0.9)}" cy="${f(y - s * 0.08)}" r="${f(s * 0.42)}"/></g>`;
}

// Crop rows: stripes fanning out from a vanishing point on the horizon.
function stripes(w, h, hy, vx, count, color, opacity, width = 0.5) {
  const span = Math.max(w, h) * 3.2;
  const left = vx - span / 2;
  const step = span / count;
  let d = '';
  for (let i = 0; i < count; i++) {
    const b0 = left + i * step;
    const b1 = b0 + step * width;
    const t0 = vx + (b0 - vx) * 0.015;
    const t1 = vx + (b1 - vx) * 0.015;
    d += `M${f(t0)},${f(hy)}L${f(t1)},${f(hy)}L${f(b1)},${f(h)}L${f(b0)},${f(h)}Z`;
  }
  return `<path d="${d}" fill="${color}" fill-opacity="${opacity}"/>`;
}

function sun(x, y, rad, color, id = 'sunglow') {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad * 4)}" fill="url(#${id})"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" fill="${color}"/>`;
}

function hayBale(x, y, r) {
  return `<ellipse cx="${f(x + r * 0.2)}" cy="${f(y)}" rx="${f(r * 1.25)}" ry="${f(r * 0.22)}" fill="#000" fill-opacity=".18"/>`
    + `<circle cx="${f(x)}" cy="${f(y - r)}" r="${f(r)}" fill="${hsl(40, 52, 64)}" stroke="${hsl(32, 50, 38)}" stroke-width="${f(r * 0.08)}"/>`
    + `<circle cx="${f(x)}" cy="${f(y - r)}" r="${f(r * 0.68)}" fill="none" stroke="${hsl(34, 52, 42)}" stroke-width="${f(r * 0.07)}"/>`
    + `<circle cx="${f(x)}" cy="${f(y - r)}" r="${f(r * 0.34)}" fill="none" stroke="${hsl(34, 52, 42)}" stroke-width="${f(r * 0.07)}"/>`;
}

function wheatStalks(w, h, m, r) {
  const n = Math.min(140, Math.round(w / 12));
  let stems = '';
  let ears = '';
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const top = h - h * (0.05 + r() * 0.13);
    const lean = (r() - 0.5) * h * 0.04;
    stems += `M${f(x)},${f(h + 2)}Q${f(x + lean * 0.3)},${f((h + top) / 2)} ${f(x + lean)},${f(top)}`;
    const ang = f((lean / (h * 0.04)) * 30);
    ears += `<ellipse cx="${f(x + lean)}" cy="${f(top)}" rx="${f(m * 0.007)}" ry="${f(m * 0.024)}" transform="rotate(${ang} ${f(x + lean)} ${f(top)})"/>`;
  }
  return `<path d="${stems}" fill="none" stroke="${hsl(36, 62, 40)}" stroke-width="${f(Math.max(1, m * 0.003))}"/>`
    + `<g fill="${hsl(42, 82, 56)}">${ears}</g>`;
}

function orchard(w, h, hy, vx, g, hue, r) {
  const spacing = Math.max(w, h) * 0.24;
  const fruit = [8, 28, 48, 350][Math.floor(hue / 90) % 4];
  let out = '';
  for (let t = 0.07; t < 1.3; t *= 1.45) {
    const y = hy + (h - hy) * t;
    const rc = spacing * 0.36 * t;
    const trunk = rc * 0.8;
    const cy = y - trunk - rc * 0.75;
    const far = Math.max(0, 1 - t);
    const l = 30 + far * 24;
    for (let k = -8; k <= 8; k++) {
      const x = vx + (k + 0.5) * spacing * t;
      if (x < -rc * 1.5 || x > w + rc * 1.5) continue;
      out += `<ellipse cx="${f(x + rc * 0.25)}" cy="${f(y)}" rx="${f(rc * 0.95)}" ry="${f(rc * 0.22)}" fill="#000" fill-opacity=".14"/>`
        + `<rect x="${f(x - rc * 0.09)}" y="${f(y - trunk)}" width="${f(rc * 0.18)}" height="${f(trunk)}" fill="${hsl(25, 34, 26 + far * 20)}"/>`
        + `<circle cx="${f(x)}" cy="${f(cy)}" r="${f(rc)}" fill="${hsl(g, 44, l)}"/>`
        + `<circle cx="${f(x - rc * 0.28)}" cy="${f(cy - rc * 0.3)}" r="${f(rc * 0.55)}" fill="${hsl(g + 6, 50, l + 11)}" fill-opacity=".65"/>`;
      if (t > 0.15) {
        for (let j = 0; j < 5; j++) {
          out += `<circle cx="${f(x + (r() - 0.5) * rc * 1.3)}" cy="${f(cy + (r() - 0.35) * rc * 1.1)}" r="${f(rc * 0.08)}" fill="${hsl(fruit, 78, 50 + far * 10)}"/>`;
        }
      }
    }
  }
  return out;
}

function terraces(w, h, hy, g, r) {
  const n = 8;
  const top = hy - h * 0.03;
  const bases = Array.from({ length: n + 1 }, (_, i) => top + (h * 1.05 - top) * Math.pow(i / n, 1.35));
  let out = '';
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const amp = h * (0.012 + 0.05 * p);
    const ph = r() * 6.28;
    const freq = 1.1 + r() * 0.9;
    const pts = [];
    const lane = [];
    const bandH = bases[i + 1] - bases[i];
    for (let k = 0; k <= 10; k++) {
      const x = -0.05 * w + (1.1 * w * k) / 10;
      const y = bases[i] + amp * Math.sin((x / w) * freq * Math.PI + ph);
      pts.push([x, y]);
      lane.push([x, y + bandH * 0.5]);
    }
    const sw = h * (0.002 + 0.006 * p);
    const dash = h * 0.004 * (1 + p * 4);
    out += `<path d="M${f(pts[0][0])},${f(h)}${smooth(pts)}L${f(pts[10][0])},${f(h)}Z" fill="${hsl(g + (i % 2) * 8, 42 + p * 15, 60 - p * 24)}"/>`
      + `<path d="M${smooth(pts).slice(1)}" fill="none" stroke="${hsl(g - 10, 40, 24 + (1 - p) * 20)}" stroke-width="${f(sw)}" stroke-opacity=".75"/>`
      + `<path d="M${smooth(lane).slice(1)}" fill="none" stroke="${hsl(g + 10, 55, 70 - p * 24)}" stroke-width="${f(sw * 2.2)}" stroke-linecap="round" stroke-dasharray="${f(dash)} ${f(dash * 2.4)}"/>`;
  }
  return out;
}

function farmstead(w, h, hy, m, g, r) {
  const yb = hy + (h - hy) * 0.14;
  const s = m * 0.2;
  const x = w * 0.2;
  const red = hsl(4, 62, 42);
  const wall = `M${f(x)},${f(yb)}V${f(yb - s * 0.6)}L${f(x + s * 0.18)},${f(yb - s * 0.86)}L${f(x + s * 0.5)},${f(yb - s * 1.02)}`
    + `L${f(x + s * 0.82)},${f(yb - s * 0.86)}L${f(x + s)},${f(yb - s * 0.6)}V${f(yb)}Z`;
  const roof = `M${f(x - s * 0.06)},${f(yb - s * 0.57)}L${f(x + s * 0.16)},${f(yb - s * 0.88)}L${f(x + s * 0.5)},${f(yb - s * 1.07)}`
    + `L${f(x + s * 0.84)},${f(yb - s * 0.88)}L${f(x + s * 1.06)},${f(yb - s * 0.57)}`;
  const dx = x + s * 0.32;
  const dw = s * 0.36;
  const dy = yb - s * 0.42;
  const door = `<rect x="${f(dx)}" y="${f(dy)}" width="${f(dw)}" height="${f(s * 0.42)}" fill="${hsl(4, 55, 32)}" stroke="#fff" stroke-width="${f(s * 0.02)}"/>`
    + `<path d="M${f(dx)},${f(dy)}L${f(dx + dw)},${f(yb)}M${f(dx + dw)},${f(dy)}L${f(dx)},${f(yb)}" stroke="#fff" stroke-width="${f(s * 0.02)}"/>`;
  const loft = `<rect x="${f(x + s * 0.42)}" y="${f(yb - s * 0.8)}" width="${f(s * 0.16)}" height="${f(s * 0.14)}" fill="#fff" fill-opacity=".85"/>`;
  // silo
  const sx = x + s * 1.12;
  const sw = s * 0.28;
  const silo = `<rect x="${f(sx)}" y="${f(yb - s * 1.05)}" width="${f(sw)}" height="${f(s * 1.05)}" fill="${hsl(210, 10, 72)}"/>`
    + `<path d="M${f(sx)},${f(yb - s * 1.05)}A${f(sw / 2)},${f(sw * 0.55)} 0 0 1 ${f(sx + sw)},${f(yb - s * 1.05)}Z" fill="${hsl(210, 12, 58)}"/>`
    + `<path d="M${f(sx)},${f(yb - s * 0.75)}h${f(sw)}M${f(sx)},${f(yb - s * 0.45)}h${f(sw)}M${f(sx)},${f(yb - s * 0.15)}h${f(sw)}" stroke="${hsl(210, 10, 58)}" stroke-width="${f(s * 0.015)}"/>`;
  // greenhouse: a half-cylinder with ribs
  const gx = w * 0.56;
  const gw = s * 1.7;
  const gh = s * 0.32;
  const ga = s * 0.32;
  let ribs = '';
  for (let i = 1; i < 8; i++) {
    const rx = gx + (gw * i) / 8;
    const u = (rx - gx - gw / 2) / (gw / 2);
    const top = yb - gh - ga * Math.sqrt(Math.max(0, 1 - u * u));
    ribs += `M${f(rx)},${f(yb)}V${f(top)}`;
  }
  const green = `<path d="M${f(gx)},${f(yb)}V${f(yb - gh)}A${f(gw / 2)},${f(ga)} 0 0 1 ${f(gx + gw)},${f(yb - gh)}V${f(yb)}Z" fill="#fff" fill-opacity=".62" stroke="${hsl(200, 18, 82)}" stroke-width="${f(s * 0.015)}"/>`
    + `<path d="${ribs}" stroke="${hsl(200, 15, 78)}" stroke-width="${f(s * 0.012)}"/>`;
  // a couple of trees beside the barn
  const tree = (tx, tr) => `<rect x="${f(tx - tr * 0.1)}" y="${f(yb - tr * 1.1)}" width="${f(tr * 0.2)}" height="${f(tr * 1.1)}" fill="${hsl(25, 30, 28)}"/>`
    + `<circle cx="${f(tx)}" cy="${f(yb - tr * 1.6)}" r="${f(tr)}" fill="${hsl(g, 40, 32)}"/><circle cx="${f(tx - tr * 0.3)}" cy="${f(yb - tr * 1.85)}" r="${f(tr * 0.5)}" fill="${hsl(g, 45, 42)}"/>`;
  return `<ellipse cx="${f(x + s * 0.7)}" cy="${f(yb)}" rx="${f(s * 1.1)}" ry="${f(s * 0.06)}" fill="#000" fill-opacity=".15"/>`
    + tree(x - s * 0.35, s * 0.32 * (0.9 + r() * 0.2)) + silo + `<path d="${wall}" fill="${red}"/>`
    + `<path d="${roof}" fill="none" stroke="${hsl(0, 0, 28)}" stroke-width="${f(s * 0.07)}" stroke-linejoin="round"/>`
    + door + loft + green + tree(gx + gw + s * 0.35, s * 0.26);
}

// ---------------- scenes ----------------
export function sceneSvg(hue, variant, w, h) {
  hue = mod(hue);
  variant = Math.min(5, Math.max(0, Math.round(variant) || 0));
  w = clampDim(Math.round(w) || 16);
  h = clampDim(Math.round(h) || 16);
  const r = rng(hue * 31 + variant * 977 + 7);
  const m = Math.min(w, h);
  const hy = h * (w >= h ? 0.47 : 0.42);
  const g = 95 + ((hue * 7) % 40) - 20; // a green that varies a little with the hue
  const vx = w * (0.42 + r() * 0.16);
  const sunset = variant === 3;

  const sky = sunset
    ? [[0, hsl(hue + 250, 40, 30)], [0.5, hsl(hue + 320, 52, 56)], [0.82, hsl(25, 88, 62)], [1, hsl(45, 95, 78)]]
    : [[0, hsl(hue, 52, 60)], [0.6, hsl(hue + 15, 60, 78)], [1, hsl(hue + 35, 75, 91)]];
  const sunCol = sunset ? hsl(42, 100, 80) : hsl(50, 100, 92);
  const ground = {
    0: [hsl(g, 42, 56), hsl(g + 5, 58, 33)],
    1: [hsl(44, 68, 70), hsl(36, 78, 46)],
    2: [hsl(g, 38, 60), hsl(g, 48, 37)],
    3: [hsl(20, 30, 28), hsl(260, 25, 12)],
    4: [hsl(g, 40, 58), hsl(g, 50, 36)],
    5: [hsl(g, 40, 58), hsl(g + 5, 55, 35)],
  }[variant];

  const defs = `<defs><linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${f(hy)}">`
    + sky.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + '</linearGradient>'
    + `<linearGradient id="ground" gradientUnits="userSpaceOnUse" x1="0" y1="${f(hy)}" x2="0" y2="${f(h)}"><stop offset="0" stop-color="${ground[0]}"/><stop offset="1" stop-color="${ground[1]}"/></linearGradient>`
    + `<radialGradient id="sunglow"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="${sunCol}" stop-opacity=".5"/><stop offset="1" stop-color="${sunCol}" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="${sunset ? hsl(35, 90, 75) : '#fff'}" stop-opacity="${sunset ? 0.35 : 0.5}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + '<radialGradient id="vignette" cx=".5" cy=".45" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient></defs>';

  const parts = [`<rect width="${w}" height="${h}" fill="url(#sky)"/>`];
  // sun
  const sx = sunset ? w * (0.3 + r() * 0.1) : w * ([0.74, 0.7, 0.24, 0, 0.78, 0.26][variant] + r() * 0.06);
  const sy = sunset ? hy - m * 0.03 : hy - h * (0.22 + r() * 0.08);
  parts.push(sun(sx, sy, m * (sunset ? 0.11 : 0.065), sunCol));
  // clouds
  const nClouds = sunset ? 2 : 3;
  for (let i = 0; i < nClouds; i++) {
    const cx = w * ((i + 0.3 + r() * 0.5) / nClouds);
    parts.push(cloud(cx, hy * (0.18 + r() * 0.38), m * (0.045 + r() * 0.04), sunset ? 0.35 : 0.85));
  }
  if (sunset) {
    let birds = '';
    for (let i = 0; i < 3; i++) {
      const bx = sx + m * (0.12 + i * 0.07 + r() * 0.03);
      const by = sy - m * (0.18 + r() * 0.08);
      const bs = m * 0.014;
      birds += `M${f(bx)},${f(by)}q${f(bs)},${f(-bs)} ${f(bs * 2)},0q${f(bs)},${f(-bs)} ${f(bs * 2)},0`;
    }
    parts.push(`<path d="${birds}" fill="none" stroke="${hsl(hue + 260, 30, 18)}" stroke-width="${f(Math.max(1, m * 0.004))}" stroke-linecap="round"/>`);
  }
  // hills
  const far = sunset ? hsl(hue + 260, 25, 38) : hsl(hue + 10, 22, 74);
  const mid = sunset ? hsl(hue + 260, 30, 22) : hsl(g, 36, 47);
  parts.push(ridge(w, h, hy - h * 0.02, h * (variant === 4 ? 0.2 : 0.1), r, far, 6));
  parts.push(ridge(w, h, hy + h * 0.005, h * 0.045, r, mid, 8));
  // ground
  parts.push(`<rect y="${f(hy)}" width="${w}" height="${f(h - hy)}" fill="url(#ground)"/>`);

  if (variant === 0) {
    parts.push(stripes(w, h, hy, vx, 34, hsl(g, 65, 22), 0.45, 0.45));
    parts.push(stripes(w, h, hy, vx + w * 0.004, 34, hsl(g + 10, 60, 62), 0.18, 0.12));
    let trees = '';
    for (let x = r() * w * 0.05; x < w; x += w * (0.02 + r() * 0.03)) {
      trees += `<circle cx="${f(x)}" cy="${f(hy - h * 0.004)}" r="${f(h * (0.008 + r() * 0.01))}"/>`;
    }
    parts.push(`<g fill="${hsl(g, 30, 36)}">${trees}</g>`);
  } else if (variant === 1) {
    parts.push(stripes(w, h, hy, vx, 40, hsl(30, 70, 35), 0.25, 0.4));
    parts.push(`<rect y="${f(hy - h * 0.08)}" width="${w}" height="${f(h * 0.18)}" fill="url(#haze)"/>`);
    const bales = [[0.22, 0.3], [0.6, 0.45], [0.85, 0.72]];
    for (const [bxf, t] of bales) {
      const by = hy + (h - hy) * t;
      parts.push(hayBale(w * bxf, by, Math.min(w * 0.09, (by - hy) * 0.3)));
    }
    parts.push(wheatStalks(w, h, m, r));
  } else if (variant === 2) {
    parts.push(stripes(w, h, hy, vx, 22, hsl(g, 45, 64), 0.35, 0.35));
    parts.push(`<rect y="${f(hy - h * 0.08)}" width="${w}" height="${f(h * 0.16)}" fill="url(#haze)"/>`);
    parts.push(orchard(w, h, hy, vx, g, hue, r));
  } else if (variant === 3) {
    parts.push(stripes(w, h, hy, vx, 30, hsl(30, 90, 65), 0.16, 0.3));
    const tx = w * 0.16;
    const ty = hy + (h - hy) * 0.06;
    const tr = m * 0.09;
    parts.push(`<g fill="${hsl(hue + 260, 30, 10)}"><path d="M${f(tx - tr * 0.08)},${f(ty)}L${f(tx - tr * 0.05)},${f(ty - tr * 1.3)}L${f(tx + tr * 0.05)},${f(ty - tr * 1.3)}L${f(tx + tr * 0.08)},${f(ty)}Z"/>`
      + `<circle cx="${f(tx)}" cy="${f(ty - tr * 1.6)}" r="${f(tr * 0.7)}"/><circle cx="${f(tx - tr * 0.6)}" cy="${f(ty - tr * 1.35)}" r="${f(tr * 0.5)}"/>`
      + `<circle cx="${f(tx + tr * 0.6)}" cy="${f(ty - tr * 1.4)}" r="${f(tr * 0.55)}"/><circle cx="${f(tx + tr * 0.1)}" cy="${f(ty - tr * 2.1)}" r="${f(tr * 0.5)}"/></g>`);
  } else if (variant === 4) {
    parts.push(terraces(w, h, hy, g, r));
  } else {
    parts.push(stripes(w, h, hy, vx, 30, hsl(g, 60, 24), 0.4, 0.42));
    parts.push(`<rect y="${f(hy - h * 0.06)}" width="${w}" height="${f(h * 0.12)}" fill="url(#haze)"/>`);
    parts.push(farmstead(w, h, hy, m, g, r));
  }
  if (variant === 0 || variant === 3 || variant === 4) {
    parts.push(`<rect y="${f(hy - h * 0.08)}" width="${w}" height="${f(h * 0.14)}" fill="url(#haze)"/>`);
  }
  parts.push(`<rect width="${w}" height="${h}" fill="url(#vignette)"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${defs}${parts.join('')}</svg>`;
}

// Round badge in the hue with a white leaf.
export function logoSvg(hue) {
  hue = mod(hue);
  const vein = hsl(hue + 10, 55, 38);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_SIZE}" height="${LOGO_SIZE}" viewBox="0 0 512 512">`
    + `<defs><linearGradient id="badge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(hue, 58, 50)}"/><stop offset="1" stop-color="${hsl(hue + 25, 62, 32)}"/></linearGradient></defs>`
    + '<rect width="512" height="512" fill="#fff"/>'
    + '<circle cx="256" cy="256" r="236" fill="url(#badge)"/>'
    + '<circle cx="256" cy="256" r="208" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="6"/>'
    + '<g transform="rotate(-28 256 256)">'
    + '<path d="M256 104C350 156 374 266 304 348C282 374 262 388 256 402C250 388 230 374 208 348C138 266 162 156 256 104Z" fill="#fff"/>'
    + `<path d="M256 150V430M256 222L300 186M256 222L212 186M256 280L310 238M256 280L202 238M256 336L296 302M256 336L216 302" fill="none" stroke="${vein}" stroke-width="10" stroke-linecap="round"/>`
    + '</g></svg>';
}

// Public: GET /api/sample/<file>.svg (no sign-in; register before the /api 404 handler).
export function registerSamples(app) {
  app.get('/api/sample/:file', (req, res) => {
    const svg = sampleSvg(req.params.file);
    if (!svg) return res.status(404).json({ error: 'Not found' });
    res.set({
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(svg);
  });
}
