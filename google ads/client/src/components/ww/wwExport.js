// Downloads of a When and where table: .csv (also "Excel .csv"), .tsv, .xml, .xlsx and .pdf, and,
// on request, the file wrapped in a .zip. No libraries: the workbook and the zip are written by
// hand. The zip stores its files uncompressed (method 0), which every unzip tool and spreadsheet
// app reads.
import { download } from '../Common.jsx';
import { WW_ALL_METRICS, WW_ATTRS } from '../../../../shared/whenwhere.js';

// Download menu formats, in menu order. Both csv flavours are the same UTF-8 file with a byte
// order mark, which is what makes Excel read the currency sign and accents correctly.
export const WW_DOWNLOAD_FORMATS = [
  { key: 'excelcsv', label: 'Excel .csv', ext: 'csv' },
  { key: 'csv', label: '.csv', ext: 'csv' },
  { key: 'tsv', label: '.tsv', ext: 'tsv' },
  { key: 'pdf', label: '.pdf', ext: 'pdf' },
  { key: 'xlsx', label: '.xlsx', ext: 'xlsx' },
  { key: 'xml', label: '.xml', ext: 'xml' },
];
const formatOf = (key) => WW_DOWNLOAD_FORMATS.find((f) => f.key === key) || WW_DOWNLOAD_FORMATS[0];

const BOM = '﻿';
const enc = new TextEncoder();

// Columns whose cells are figures (right-aligned in the pdf, numbers in the workbook), by header label.
const FIGURE_LABELS = new Set([
  ...Object.values(WW_ALL_METRICS).map((m) => m.label),
  ...Object.values(WW_ATTRS).filter((a) => a.num).map((a) => a.label),
]);

// The table as lines of cells: optional title and date range, the header, the rows, optional totals.
function tableLines({ title, rangeText, header, rows, totals = [] }, { title: incTitle = true, totals: incTotals = true } = {}) {
  return [
    ...(incTitle ? [[title ?? ''], [rangeText ?? '']] : []),
    header,
    ...rows,
    ...(incTotals ? totals : []),
  ];
}

// ---------------------------------------------------------------- text formats
// A cell a spreadsheet would run as a formula (it starts with = + - @, a tab or a return) is kept
// as text with a leading apostrophe. A plain signed figure ("+20%" bid adjustments, "-100%") can't
// call anything, so it stays a figure.
function safeCell(v) {
  const s = String(v ?? '');
  return /^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d.,]+%?$/.test(s) ? `'${s}` : s;
}

function delimited(lines, sep) {
  const quote = sep === ',' ? /[",\n\r]/ : /[\t"\n\r]/;
  const cell = (v) => {
    const s = safeCell(v);
    return quote.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${lines.map((l) => l.map(cell).join(sep)).join('\r\n')}\r\n`;
}

const xmlText = (v) => String(v ?? '')
  // Control characters are not allowed in XML 1.0.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// "Avg. CPM" -> "avgCPM", "Cost / conv." -> "costConv": attribute names for the xml rows.
function xmlNames(header) {
  const used = new Set();
  return header.map((label) => {
    const words = String(label).match(/[A-Za-z0-9]+/g) || [];
    let base = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1))).join('') || 'column';
    if (!/^[A-Za-z_]/.test(base)) base = `c${base}`;
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}${n}`;
    used.add(name);
    return name;
  });
}

export function buildXml(data, opts = {}) {
  const { title, rangeText, header, rows, totals = [] } = data;
  const names = xmlNames(header);
  const line = (tag, cells) => `    <${tag} ${names.map((n, i) => `${n}="${xmlText(cells[i])}"`).join(' ')}/>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<report>',
    ...(opts.title !== false ? [`  <report-name name="${xmlText(title)}"/>`, `  <date-range date="${xmlText(rangeText)}"/>`] : []),
    '  <table>',
    '    <columns>',
    ...header.map((h, i) => `      <column name="${names[i]}" display="${xmlText(h)}"/>`),
    '    </columns>',
    ...rows.map((r) => line('row', r)),
    ...(opts.totals !== false ? totals.map((r) => line('total', r)) : []),
    '  </table>',
    '</report>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- zip (store only)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name, data: string | Uint8Array }] -> the bytes of a .zip that stores them as they are.
export function zipStore(files, when = new Date()) {
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = ((Math.max(1980, when.getFullYear()) - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    // Bit 11: the name is UTF-8.
    const flags = /^[\x20-\x7e]*$/.test(f.name) ? 0 : 0x0800;
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, flags, true);
    head.setUint16(8, 0, true);
    head.setUint16(10, time, true);
    head.setUint16(12, date, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true);
    head.setUint32(22, data.length, true);
    head.setUint16(26, name.length, true);
    head.setUint16(28, 0, true);
    locals.push(new Uint8Array(head.buffer), name, data);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, flags, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, time, true);
    cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    centrals.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const dirSize = centrals.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// ---------------------------------------------------------------- xlsx
// A figure cell as a number and its kind: "$1,996.38" -> money, "25.32%" -> 0.2532 pct,
// "46,619" -> int. Anything else ("–", "777 engagements") stays text.
function parseFigure(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? { n: v, kind: Number.isInteger(v) ? 'int' : 'dec' } : null;
  const s = String(v ?? '').trim();
  const num = '(\\d{1,3}(?:,\\d{3})+|\\d+)(\\.\\d+)?';
  let m = new RegExp(`^([+-]?)${num}%$`).exec(s);
  // toPrecision drops the float noise of the division (41.07 / 100).
  if (m) return { n: Number((Number(`${m[1]}${m[2].replace(/,/g, '')}${m[3] || ''}`) / 100).toPrecision(12)), kind: 'pct' };
  m = new RegExp(`^(-?)([^\\d\\s.,+%-]{1,3})${num}$`).exec(s);
  if (m) return { n: Number(`${m[1]}${m[3].replace(/,/g, '')}${m[4] || ''}`), kind: 'money', sym: m[2] };
  m = new RegExp(`^([+-]?)${num}$`).exec(s);
  if (m) return { n: Number(`${m[1]}${m[2].replace(/,/g, '')}${m[3] || ''}`), kind: m[3] ? 'dec' : 'int' };
  return null;
}

const colName = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
// Sheet names: at most 31 characters, none of []:*?/\
const sheetName = (title) => (String(title || '').split(': ').pop().replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Report');

export function buildXlsx(data, opts = {}) {
  const incTitle = opts.title !== false;
  const lines = tableLines(data, opts);
  const first = incTitle ? 2 : 0; // index of the header line
  const figureCol = data.header.map((h) => FIGURE_LABELS.has(h));
  const totalFrom = first + 1 + data.rows.length;

  // Styles: 0 text, 1 bold; then per number kind a plain and a bold (total row) style.
  const syms = [];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'];
  const styleIds = new Map();
  const styleFor = (fmtId, bold) => {
    const key = `${fmtId}|${bold}`;
    if (!styleIds.has(key)) {
      styleIds.set(key, xfs.length);
      xfs.push(`<xf numFmtId="${fmtId}" fontId="${bold ? 1 : 0}" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"${bold ? ' applyFont="1"' : ''}/>`);
    }
    return styleIds.get(key);
  };
  const fmtFor = (f) => {
    if (f.kind === 'int') return 3; // #,##0
    if (f.kind === 'dec') return 4; // #,##0.00
    if (f.kind === 'pct') return 10; // 0.00%
    if (!syms.includes(f.sym)) syms.push(f.sym);
    return 164 + syms.indexOf(f.sym);
  };

  const widths = data.header.map(() => 8);
  const sheetRows = lines.map((cells, r) => {
    const bold = r === first || (incTitle && r === 0) || r >= totalFrom;
    const xml = cells.map((v, c) => {
      const ref = `${colName(c)}${r + 1}`;
      const text = String(v ?? '');
      if (r > first) widths[c] = Math.max(widths[c] ?? 8, Math.min(50, text.length + 2));
      else if (r === first) widths[c] = Math.max(widths[c] ?? 8, Math.min(30, text.length + 2));
      const fig = r > first && figureCol[c] ? parseFigure(v) : null;
      if (fig) return `<c r="${ref}" s="${styleFor(fmtFor(fig), r >= totalFrom)}"><v>${fig.n}</v></c>`;
      if (text === '') return '';
      const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
      return `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t${space}>${xmlText(text)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${xml}</row>`;
  });

  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS = 'http://schemas.openxmlformats.org';
  const sheet = `${head}<worksheet xmlns="${NS}/spreadsheetml/2006/main">`
    + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${sheetRows.join('')}</sheetData></worksheet>`;
  const numFmts = syms.length
    ? `<numFmts count="${syms.length}">${syms.map((s, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xmlText(`"${s}"#,##0.00`)}"/>`).join('')}</numFmts>`
    : '';
  const styles = `${head}<styleSheet xmlns="${NS}/spreadsheetml/2006/main">${numFmts}`
    + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const REL = `${NS}/officeDocument/2006/relationships`;
  return zipStore([
    {
      name: '[Content_Types].xml',
      data: `${head}<Types xmlns="${NS}/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      data: `${head}<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `${head}<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets><sheet name="${xmlText(sheetName(data.title))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `${head}<Relationships xmlns="${NS}/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>`
        + `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    { name: 'xl/styles.xml', data: styles },
  ]);
}

// ---------------------------------------------------------------- pdf (print)
function printHtml(data, opts) {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const num = data.header.map((h) => (FIGURE_LABELS.has(h) ? ' class="num"' : ''));
  const tr = (cells, cls = '') => `<tr${cls}>${cells.map((c, i) => `<td${num[i]}>${esc(c)}</td>`).join('')}</tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.fileBase || data.title)}</title><style>
@page { size: landscape; margin: 12mm; }
body { margin: 0; font: 10px/1.35 Roboto, Arial, sans-serif; color: #202124; }
h1 { margin: 0 0 2px; font-size: 16px; font-weight: 400; }
.range { margin: 0 0 10px; color: #5f6368; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 4px 6px; border: 1px solid #dadce0; text-align: left; vertical-align: top; }
th { background: #f8f9fa; font-weight: 500; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
tr.total td { background: #f8f9fa; font-weight: 500; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
</style></head><body>
${opts.title !== false ? `<h1>${esc(data.title)}</h1><p class="range">${esc(data.rangeText)}</p>` : ''}
<table><thead><tr>${data.header.map((h, i) => `<th${num[i]}>${esc(h)}</th>`).join('')}</tr></thead><tbody>
${data.rows.map((r) => tr(r)).join('\n')}
${opts.totals !== false ? (data.totals || []).map((r) => tr(r, ' class="total"')).join('\n') : ''}
</tbody></table></body></html>`;
}

// Opens the table in a print window ("Save as PDF" in the print dialog). When pop-ups are
// blocked, prints from a hidden frame instead.
function printTable(html) {
  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.addEventListener('afterprint', () => win.close());
    setTimeout(() => win.print(), 250);
    return;
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow.addEventListener('afterprint', () => frame.remove());
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 250);
}

// ---------------------------------------------------------------- download
// data: { fileBase, title, rangeText, header: [label], rows: [[cell]], totals: [[cell]] }
// opts: { compress, title, totals } (title/totals: include the title and date range lines / the
// total rows). A pdf opens the print dialog, so it can't be compressed.
export function exportTable(format, data, { compress = false, title = true, totals = true } = {}) {
  const f = formatOf(format);
  const opts = { title, totals };
  const name = `${data.fileBase || 'report'}.${f.ext}`;
  if (f.key === 'pdf') {
    printTable(printHtml(data, opts));
    return;
  }
  let bytes;
  let type;
  if (f.key === 'xlsx') {
    bytes = buildXlsx(data, opts);
    type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (f.key === 'xml') {
    bytes = enc.encode(buildXml(data, opts));
    type = 'application/xml';
  } else {
    const text = delimited(tableLines(data, opts), f.key === 'tsv' ? '\t' : ',');
    bytes = enc.encode(BOM + text);
    type = f.key === 'tsv' ? 'text/tab-separated-values;charset=utf-8' : 'text/csv;charset=utf-8';
  }
  if (compress) {
    download(`${data.fileBase || 'report'}.zip`, new Blob([zipStore([{ name, data: bytes }])], { type: 'application/zip' }));
    return;
  }
  // The bytes already carry the byte order mark, so they go in as a Blob (download() would add another).
  download(name, new Blob([bytes], { type }));
}
