// Keeps the data-tip tooltips (see fid-tip.css) inside the window: when the card would run past the right
// (or left) edge, --tip-dx shifts it back, like Ads Manager does for the buttons at the far right.
// Installed once per page; harmless if imported several times.
const SIDE = 8;      // design px kept free at the window edge
const PAD = 12;      // the card's side padding (fid-tip.css)

function install() {
  if (typeof window === 'undefined' || window.__fidTipInstalled) return;
  window.__fidTipInstalled = true;
  let ctx = null;
  const measure = (text) => {
    try {
      if (!ctx) ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `400 16px ${getComputedStyle(document.body).fontFamily}`;
      return ctx.measureText(text).width;
    } catch { return text.length * 8; }
  };
  const zoom = () => {
    const r = document.getElementById('root');
    const z = r && parseFloat(r.style.zoom);
    return z > 0 ? z : 1;
  };
  document.addEventListener('mouseover', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!el) return;
    const text = el.getAttribute('data-tip');
    if (!text) return;
    try {
      const z = zoom();
      const r = el.getBoundingClientRect();
      const x = parseFloat(getComputedStyle(el).getPropertyValue('--tip-x')) || 0;
      const w = (measure(text) + 2 * PAD) * z;
      const left = r.left + x * z;
      const vw = document.documentElement.clientWidth;
      let dx = 0;
      if (left + w > vw - SIDE * z) dx = (vw - SIDE * z) - (left + w);
      if (left + dx < SIDE * z) dx = SIDE * z - left;
      el.style.setProperty('--tip-dx', `${(dx / z).toFixed(1)}px`);
    } catch { /* ignore */ }
  }, true);
}
install();
