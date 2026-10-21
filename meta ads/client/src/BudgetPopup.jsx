import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './fid-opp.css';
import { digitsOnly } from './lib.js';

// The "Daily budget" popup that opens over a budget cell (admin panel), matched to Ads Manager. Fixed-position, anchored to the cell.
//   row: the table row being edited    at: { left, right, top, bottom, vw, vh } of the cell in layout px (see rectCss in HeadMenus.jsx)
//   onSave(string) -> Promise<boolean> (true = saved)    onClose()
// "Publish" and "Save to draft" both save in this demo (there is no separate draft state).
const HELP = 'https://www.facebook.com/business/help';
const W = 471; // popup width
const TOP_OFF = 22.2; // popup top = cell top - TOP_OFF (design px); the left edge is the cell's left - 26
const root = () => document.getElementById('root') || document.body;
// "$1,008" for whole amounts, "$2,104.20" (two decimals, like the table) as soon as there is a fractional part
const money = (n) => {
  const x = Number.isFinite(n) ? n : 0;
  return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: Math.round(x * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(x);
};

export default function BudgetPopup({ row, at, onSave, onClose }) {
  const ref = useRef(null);
  const inp = useRef(null);
  const [v, setV] = useState(row.period === undefined && row.overrides && row.overrides.budget ? '' : row.budget != null && typeof row.budget === 'number' ? row.budget.toFixed(2) : '');
  const [busy, setBusy] = useState(false);
  // The value is shown as typed text after the "$" with the caret at its end (no selection), like Ads Manager. Until the first edit the whole
  // value still behaves as selected: the first typed character or Backspace replaces it, so retyping an amount works as before.
  const pristine = useRef(true);
  const [top, setTop] = useState(at.top - TOP_OFF);
  useLayoutEffect(() => {
    const h = ref.current ? ref.current.offsetHeight : 0;
    setTop(Math.max(8, Math.min(at.top - TOP_OFF, at.vh - h - 8)));
  }, [at]);
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);
  useEffect(() => { const i = inp.current; if (i) { i.focus(); const n = i.value.length; i.setSelectionRange(n, n); } }, []);
  const save = async () => { if (busy) return; setBusy(true); const plain = v.replace(/[$₹,\s]/g, ''); const ok = await onSave(plain); /* an amount; left empty the cell shows a dash */ setBusy(false); if (ok) onClose(); };
  const onKey = (e) => {
    if (e.key === 'Enter') { save(); return; }
    if (!pristine.current) return;
    if (e.ctrlKey || e.metaKey || e.altKey) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') e.target.select(); return; }
    if (e.key.length === 1) { e.preventDefault(); if (!/[\d.]/.test(e.key)) return; pristine.current = false; setV(e.key); } // digits only
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); pristine.current = false; setV(''); }
    else if (e.key !== 'Shift' && e.key !== 'Tab') pristine.current = false;
  };
  // The whole box is the field: a click on the "$", the "USD" or the padding focuses the real input (keeps the focus ring and typing alive)
  const boxDown = (e) => {
    const i = inp.current;
    if (!i || e.target === i) return;
    e.preventDefault(); pristine.current = false; i.focus(); const len = i.value.length; i.setSelectionRange(len, len);
  };
  const n = parseFloat(String(v).replace(/[$₹,\s]/g, ''));
  const left = Math.max(8, Math.min(at.left - 26, at.vw - W - 8));
  return createPortal(
    <div className="bpop fid-opp-bp" ref={ref} style={{ left, top }} role="dialog" aria-label="Daily budget">
      <div className="fid-opp-bp-row">
        <label className="fid-opp-bp-lbl" htmlFor="fid-opp-bp-in">Daily budget</label>
        <div className="fid-opp-bp-col">
          <div className="fid-opp-bp-in" onMouseDown={boxDown}>
            <span className="fid-opp-bp-cur" aria-hidden="true">$</span>
            <input id="fid-opp-bp-in" ref={inp} value={v} inputMode="decimal" autoComplete="off" spellCheck={false}
              onChange={(e) => { pristine.current = false; setV(digitsOnly(e.target.value)); }}
              onMouseDown={() => { pristine.current = false; }} onKeyDown={onKey} aria-label="Daily budget" />
            <span className="fid-opp-bp-code">USD</span>
          </div>
          <div className="fid-opp-bp-note">
            You are sharing your ad set budget.<br />The maximum that you will spend<br />on any day is <b>{money(n * 2.1)}</b> and the<br />maximum that you will spend in a<br />week is <b>{money(n * 8.4)}</b>.
          </div>
          <a className="fid-opp-bp-link" href={HELP} target="_blank" rel="noopener noreferrer">About ad set budget sharing</a>
        </div>
      </div>
      <div className="fid-opp-bp-foot">
        <button type="button" className="fid-opp-bp-cancel" onClick={onClose}>Cancel</button>
        <button type="button" className="fid-opp-bp-btn" disabled={busy} onClick={save}>Save to draft</button>
        <button type="button" className="fid-opp-bp-btn pub" disabled={busy} onClick={save}>Publish</button>
      </div>
    </div>,
    root(),
  );
}
