import React, { useEffect, useState } from 'react';
import { IconCheck } from './icons.jsx';
import { COLUMNS } from './lib.js';
import { IcBack, IcChevR, IcCompare, IcConditional, IcCustomise, IcImage, IcInfo, IcLink, IcPanel, IcPlus, IcSchedule, IcSearch, IcTemplates } from './fid-menus-icons.jsx';
import './fid-menus.css';

// Contents of the toolbar dropdowns. Each one is rendered inside the toolbar's popover; `close()` shuts it.
// The look (panel size, rows, fonts, colours, icons) follows the reference screenshots of the real Ads Manager; see fid-menus.css.

// ---- small building blocks -------------------------------------------------------------------------------------------------
const Ico = ({ children }) => <span className="fm-ico">{children}</span>;
const Hr = ({ lg }) => <div className={`fm-line ${lg ? 'lg' : ''}`} role="separator" />;

const Radio = ({ on, onClick, children }) => (
  <button type="button" className={`fm-radio ${on ? 'on' : ''}`} role="menuitemradio" aria-checked={!!on} onClick={onClick}><i />{children}</button>
);

const Check = ({ on, onClick, children, tall }) => (
  <button type="button" className={`fm-check ${tall ? 'tall' : ''}`} role="menuitemcheckbox" aria-checked={!!on} onClick={onClick}>
    <span className={`fm-box ${on ? 'on' : ''}`}>{on && <IconCheck size={13} />}</span>{children}
  </button>
);

// back arrow + title, as on the pages of the quick-views dropdown
const Head = ({ title, onBack }) => (
  <div className="fm-head">
    <button type="button" className="fm-back" aria-label="Back" onClick={onBack}><IcBack /></button>
    <span className="fm-htitle">{title}</span>
  </div>
);

// "Columns" dropdown.  preset: name of the active column preset   presets: [names]   cols: active column ids
//   setPresetCols(name)  toggleCol(id)  customOpen/setCustomOpen: the "customise columns" page is showing  comingSoon(what)()
export function ColumnsMenu({ preset, presets, cols, setPresetCols, toggleCol, setCustomOpen, close, comingSoon }) {
  const [page, setPage] = useState('main'); // 'main' | 'presets' | 'custom'
  const go = (pg) => { setPage(pg); if (setCustomOpen) setCustomOpen(pg === 'custom'); };
  useEffect(() => () => { if (setCustomOpen) setCustomOpen(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (page === 'presets') {
    return (
      <div className="fid-menus fid-menus-cols" role="menu" aria-label="Column presets">
        <Head title="Column presets" onBack={() => go('main')} />
        <div className="fm-list">
          {presets.filter((p) => p !== preset).map((p) => <Radio key={p} onClick={() => { setPresetCols(p); close(); }}>{p}</Radio>)}
        </div>
      </div>
    );
  }
  if (page === 'custom') {
    return (
      <div className="fid-menus fid-menus-cols" role="menu" aria-label="Customise columns">
        <Head title="Customise columns" onBack={() => go('main')} />
        <div className="fm-list fm-scroll">
          {COLUMNS.map((c) => <Check key={c.id} on={cols.includes(c.id)} onClick={() => toggleCol(c.id)}>{c.label.replace(/ \(.*/, '')}</Check>)}
        </div>
      </div>
    );
  }
  return (
    <div className="fid-menus fid-menus-cols" role="menu" aria-label="Columns">
      <div className="fm-title">Columns</div>
      <button type="button" className="fm-item" role="menuitem" onClick={() => go('custom')}><Ico><IcCustomise /></Ico>Customise columns</button>
      <Hr lg />
      <div className="fm-cap">Recently used</div>
      <Radio on onClick={close}>{preset}</Radio>
      <button type="button" className="fm-item" role="menuitem" onClick={() => go('presets')}>See more<span className="fm-end"><IcChevR /></span></button>
      <Hr />
      <button type="button" className="fm-item" role="menuitem" onClick={() => { close(); comingSoon('Attribution comparison')(); }}><Ico><IcCompare /></Ico>Compare attribution settings</button>
      <button type="button" className="fm-item" role="menuitem" onClick={() => { close(); comingSoon('Conditional formatting')(); }}><Ico><IcConditional /></Ico>Conditional formatting</button>
    </div>
  );
}

const BD_ROWS = [['day', 'Day'], ['x:Age', 'Age'], ['x:Placement', 'Placement'], ['x:Country', 'Country'], ['x:Platform', 'Platform'], ['week', 'Week'], ['2weeks', '2 weeks'], ['month', 'Month']];

// "Breakdown" dropdown.  breakdown: 'none' | 'day' | 'week' | '2weeks' | 'month'   setBreakdown(v)   viewer: charts disabled
//   openCharts(): opens the charts pane   toast(msg)
//   noSelection (optional): also greys out "View breakdown charts" (the real tool does this while no row is selected)
export function BreakdownMenu({ breakdown, setBreakdown, viewer, openCharts, close, toast, noSelection }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const rows = BD_ROWS.filter(([, l]) => !term || l.toLowerCase().includes(term));
  const off = !!(viewer || noSelection);
  return (
    <div className="fid-menus fid-menus-bd" role="menu" aria-label="Breakdown">
      <label className="fm-search">
        <IcSearch />
        <input autoFocus placeholder="Search" aria-label="Search breakdowns" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <button type="button" className="fm-item" role="menuitem" disabled={off} onClick={() => { close(); openCharts(); }}><Ico><IcPanel /></Ico>View breakdown charts</button>
      <Hr />
      {rows.length > 0 ? (
        <>
          <div className="fm-cap">Popular<span className="fm-info"><IcInfo /></span></div>
          {rows.map(([v, l]) => (
            <Check key={v} tall on={breakdown === v} onClick={() => { if (v.startsWith('x:')) { close(); return; } setBreakdown(breakdown === v ? 'none' : v); close(); }}>{l}</Check>
          ))}
        </>
      ) : <div className="fm-empty">No results</div>}
    </div>
  );
}

// "Reports" dropdown (database icon).  createReport()  viewCreativePerformance()  comingSoon(what)()
export function ReportsMenu({ close, createReport, viewCreativePerformance, comingSoon }) {
  return (
    <div className="fid-menus fid-menus-rep" role="menu" aria-label="Reports">
      <div className="fm-title">Ads Reporting</div>
      <button type="button" className="fm-item" role="menuitem" onClick={() => { close(); createReport(); }}><Ico><IcPlus /></Ico>Create new report</button>
      <button type="button" className="fm-item" role="menuitem" onClick={() => { close(); viewCreativePerformance(); }}><Ico><IcImage /></Ico>View ad creative performance</button>
      <button type="button" className="fm-item" role="menuitem" onClick={() => { close(); comingSoon('Report templates')(); }}><Ico><IcTemplates /></Ico>Try report templates<span className="fm-end"><IcChevR /></span></button>
    </div>
  );
}

// puts `text` on the clipboard; resolves to true when it worked (falls back to a hidden textarea where the Clipboard API is unavailable)
function copyText(text) {
  const legacy = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, legacy);
  } catch { /* fall through */ }
  return Promise.resolve(legacy());
}

// Caret next to the Export button, also the "Export >" fly-out of the More dropdown.
//   exportCSV()   exportXLSX() (optional: without it the row does nothing)   comingSoon(what)()   toast(msg, isError)
export function ExportMenu({ close, exportCSV, exportXLSX, comingSoon, toast }) {
  const say = (msg, bad) => { if (toast) toast(msg, bad); };
  const soon = (what) => () => { if (comingSoon) comingSoon(what)(); };
  const run = (fn) => () => { close(); fn(); };
  const share = () => copyText(window.location.href).then((ok) => (ok ? say('Link copied to clipboard') : say('Could not copy the link', true)));
  return (
    <div className="fid-menus fid-menus-exp" role="menu" aria-label="Export">
      <button type="button" className="fm-item" role="menuitem" onClick={run(exportCSV)}>Export as .csv</button>
      <button type="button" className="fm-item" role="menuitem" onClick={run(typeof exportXLSX === 'function' ? exportXLSX : soon('Export as .xlsx'))}>Export as .xlsx</button>
      <button type="button" className="fm-item" role="menuitem" onClick={run(soon('Customise export'))}>Customise export</button>
      <Hr />
      <button type="button" className="fm-item" role="menuitem" onClick={run(soon('Schedule export'))}><Ico><IcSchedule /></Ico>Schedule export</button>
      <Hr />
      <button type="button" className="fm-item" role="menuitem" onClick={run(share)}><Ico><IcLink /></Ico>Share table link</button>
    </div>
  );
}

// ---- a real .xlsx from the text toCSV() produces (lib.js), for actions.exportXLSX -------------------------------------------
// An .xlsx is a ZIP of a few small XML files; they are written uncompressed ("stored"), which needs no library.
// Numbers become numeric cells; the first column (names), a "Period" column and the header row always stay text.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStored(files) { // files: [[name, text]]
  const enc = new TextEncoder(), parts = [], dir = [];
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const rec = (sig, fields) => { // one ZIP record: 4-byte signature + [value, byte width] fields, little endian
    const b = new DataView(new ArrayBuffer(4 + fields.reduce((s, f) => s + f[1], 0)));
    b.setUint32(0, sig, true);
    let o = 4;
    for (const [v, w] of fields) { if (w === 2) b.setUint16(o, v, true); else b.setUint32(o, v, true); o += w; }
    return new Uint8Array(b.buffer);
  };
  let off = 0;
  for (const [name, text] of files) {
    const nm = enc.encode(name), body = enc.encode(text), crc = crc32(body);
    const common = [[20, 2], [0, 2], [0, 2], [time, 2], [date, 2], [crc, 4], [body.length, 4], [body.length, 4], [nm.length, 2], [0, 2]];
    const head = rec(0x04034b50, common);
    dir.push(rec(0x02014b50, [[20, 2], ...common, [0, 2], [0, 2], [0, 2], [0, 4], [off, 4]]), nm);
    parts.push(head, nm, body);
    off += head.length + nm.length + body.length;
  }
  const dirSize = dir.reduce((s, p) => s + p.length, 0);
  return [...parts, ...dir, rec(0x06054b50, [[0, 2], [0, 2], [files.length, 2], [files.length, 2], [dirSize, 4], [off, 4], [0, 2]])];
}
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
export function xlsxFromCSV(csvText, sheetName = 'Ads') {
  const rows = parseCSV(csvText);
  const esc = (v) => String(v).replace(/[^\t\n\r\x20-�]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colName = (n) => { let t = ''; for (let k = n + 1; k > 0; k = Math.floor((k - 1) / 26)) t = String.fromCharCode(65 + ((k - 1) % 26)) + t; return t; };
  const head = rows[0] || [];
  const isNum = (v) => /^-?\d{1,15}(\.\d+)?(e[+-]?\d+)?$/i.test(v);
  const sheet = rows.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => {
    if (v === '') return '';
    const ref = `${colName(x)}${y + 1}`;
    if (y > 0 && x > 0 && head[x] !== 'Period' && isNum(v)) return `<c r="${ref}"><v>${+v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v.replace(/^'(?=[=+\-@\t\r])/, ''))}</t></is></c>`; // toCSV's formula guard is not needed in a text cell
  }).join('')}</row>`).join('');
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', P = 'http://schemas.openxmlformats.org/package/2006/relationships';
  return new Blob(zipStored([
    ['[Content_Types].xml', `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels', `${X}<Relationships xmlns="${P}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${X}<workbook xmlns="${M}" xmlns:r="${R}"><sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${X}<Relationships xmlns="${P}"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `${X}<worksheet xmlns="${M}"><sheetData>${sheet}</sheetData></worksheet>`],
  ]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
// downloadXLSX(toCSV(rows, visible, totals, level), 'ads-ad-2026-01-01_2026-01-31.xlsx')
export function downloadXLSX(csvText, filename = 'export.xlsx') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(xlsxFromCSV(csvText)); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}
