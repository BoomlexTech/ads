import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { rectCss } from './HeadMenus.jsx';
import { TbCaret, AcctGlyph, ApSearch, ApInfo, ApChevron, ApGear, ApPlus, ApRing } from './fid-topbar-icons.jsx';
import './fid-acct.css';

export const ACCOUNT_ID = '2847391046251'; // the demo ad account number: a constant, never editable
// the names of the panel until the server has answered (the same defaults as SETTING_DEFAULTS in server/models.js)
export const DEFAULT_NAMES = { portfolioName: 'Wolf777', accountName: 'Wolf777 Ads', secondPortfolioName: 'Second portfolio', profileName: 'Admin' };
const NAME_MAX = 60;
// the letter of a tile / avatar: the first character of the name
export const firstLetter = (s) => { const c = Array.from(String(s || '').trim())[0]; return c ? c.toUpperCase() : '?'; };
const count = (n) => `${n} ad account${n === 1 ? '' : 's'}`;

// One of the four names. On the main site it is plain text. In the admin panel a pencil shows while the pointer is over it
// (double-clicking the name does the same): the name becomes a text box - Enter or leaving the box saves, Escape cancels.
// The name is only ever rendered as React text.
function Name({ field, value, what, admin, onSave, toast, cls, onEditStart }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const busy = useRef(false), tried = useRef(null), gone = useRef(false);
  const live = useRef(null);
  live.current = { editing, text, value, onSave, toast };

  const start = (e) => { if (e) { e.stopPropagation(); e.preventDefault(); } if (onEditStart) onEditStart(); setText(value); tried.current = null; setEditing(true); };
  const commit = async (leaving) => {
    if (busy.current) return;
    const v = text.trim();
    if (!v) { toast(`The ${what} name can't be empty`, true); if (leaving) setEditing(false); return; } // refused: Enter keeps the box, leaving it brings the old name back
    if (v === value) { setEditing(false); return; }
    if (leaving && v === tried.current) return; // already refused by the server: the box just stays, Enter tries again
    busy.current = true; tried.current = v;
    try { await onSave({ [field]: v }); toast(`Renamed the ${what} to “${v}”`); if (!gone.current) setEditing(false); }
    catch (err) { toast(err.message, true); } // the box stays open with what was typed
    finally { busy.current = false; }
  };
  // the panel was closed (a click outside it) while a box was open: that is leaving the box, so what was typed is saved
  useEffect(() => () => {
    gone.current = true;
    const s = live.current;
    if (!s.editing || busy.current) return;
    const v = s.text.trim();
    if (v && v !== s.value && v !== tried.current) s.onSave({ [field]: v }).then(() => s.toast(`Renamed the ${what} to “${v}”`), (err) => s.toast(err.message, true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!admin) return <span className={`ap-nm ${cls}`}><span className="ap-nm-t">{value}</span></span>;
  if (editing) {
    return (
      <input className={`ap-inp ${cls}`} type="text" value={text} maxLength={NAME_MAX} autoFocus aria-label={`Name of the ${what}`} spellCheck={false} autoComplete="off"
        onFocus={(e) => e.target.select()} onChange={(e) => setText(e.target.value)} onBlur={() => commit(true)}
        onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation(); // the row around the box is a button, and Escape must not close the whole panel
          if (e.key === 'Enter') { e.preventDefault(); commit(false); }
          else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
        }} />
    );
  }
  return (
    <span className={`ap-nm ${cls}`}>
      <span className="ap-nm-t" onDoubleClick={start}>{value}</span>
      <button type="button" className="ap-pen" aria-label={`Rename the ${what}`} data-tip="Rename" onClick={start} onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}><Pencil size={13} strokeWidth={2.2} /></button>
    </span>
  );
}

// The panel behind the account selector of the top bar: a search field, the business portfolios and the personal account on the
// left, the ad accounts of whichever is selected on the right.
//   names { portfolioName, accountName, secondPortfolioName, profileName }   admin (bool: the names can be renamed in place)
//   onSaveNames(patch) -> Promise (rejects with the server's message)   toast(msg, isError)   comingSoon(what) -> handler   close()
export default function AccountPanel({ names, admin, onSaveNames, toast, comingSoon, close }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState('p1');
  const ref = useRef(null);
  const [fit, setFit] = useState(null); // room between the panel's top left corner and the window edges, in design px
  useLayoutEffect(() => {
    const calc = () => {
      if (!ref.current) return;
      const r = rectCss(ref.current);
      const n = { w: Math.floor(r.vw - r.left - 8), h: Math.floor(r.vh - r.top - 8) };
      setFit((f) => (f && f.w === n.w && f.h === n.h ? f : n));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  // In the admin panel a click on the ad account closes the panel a moment later, so that a double-click on its name can open the text box instead.
  const closeT = useRef(null);
  useEffect(() => () => clearTimeout(closeT.current), []);
  const pick = () => { if (!admin) { close(); return; } clearTimeout(closeT.current); closeT.current = setTimeout(close, 260); };

  const account = { id: ACCOUNT_ID, name: names.accountName };
  const sides = [
    { id: 'p1', field: 'portfolioName', what: 'business portfolio', name: names.portfolioName, accounts: [account], tone: 'a' },
    { id: 'p2', field: 'secondPortfolioName', what: 'business portfolio', name: names.secondPortfolioName, accounts: [], tone: 'b' },
    { id: 'me', field: 'profileName', what: 'profile', name: names.profileName, accounts: [account], personal: true },
  ];
  const needle = q.trim().toLowerCase();
  const has = (s) => String(s).toLowerCase().includes(needle);
  const acctHit = (a) => has(a.name) || a.id.includes(needle);
  const shown = sides.filter((s) => !needle || has(s.name) || s.accounts.some(acctHit));
  const portfolios = shown.filter((s) => !s.personal), mine = shown.filter((s) => s.personal);
  const cur = sides.find((s) => s.id === sel) || sides[0];
  const accounts = cur.accounts.filter((a) => !needle || acctHit(a) || has(cur.name));
  const nameProps = { admin, onSave: onSaveNames, toast };
  const onKey = (fn) => (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(); } };

  const row = (s) => (
    <div key={s.id} className={`ap-row ${s.id === cur.id ? 'on' : ''}`} role="button" tabIndex={0} aria-pressed={s.id === cur.id} onClick={() => setSel(s.id)} onKeyDown={onKey(() => setSel(s.id))}>
      <span className={`ap-tile ${s.personal ? 'me' : s.tone}`} aria-hidden="true">{firstLetter(s.name)}</span>
      <span className="ap-txt">
        <Name {...nameProps} field={s.field} value={s.name} what={s.what} cls="ap-name" />
        <span className="ap-cap">{count(s.accounts.length)}</span>
      </span>
      {s.id === cur.id && <span className="ap-chev" aria-hidden="true"><ApChevron /></span>}
    </div>
  );

  return (
    <div className={`fid-ap ${admin ? 'is-admin' : ''} ${fit && fit.w < 620 ? 'is-stack' : ''}`} ref={ref} role="dialog" aria-label="Ad accounts"
      style={fit ? { maxWidth: Math.max(260, fit.w), maxHeight: Math.max(220, fit.h) } : undefined}>
      <div className="ap-head">
        <label className="ap-search">
          <ApSearch />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for an ad account" aria-label="Search for an ad account" spellCheck={false} autoComplete="off" />
        </label>
      </div>
      <div className="ap-body">
        <div className="ap-left">
          <div className="ap-list">
            {portfolios.length > 0 && <div className="ap-h">Business portfolios<i className="ap-info" data-tip="Business portfolios you can manage"><ApInfo /></i></div>}
            {portfolios.map(row)}
            {mine.length > 0 && <div className="ap-h">Your account<i className="ap-info" data-tip="Ad accounts you own yourself"><ApInfo /></i></div>}
            {mine.map(row)}
            {!shown.length && <div className="ap-none">No results found</div>}
          </div>
          <div className="ap-foot">
            <button type="button" className="ap-btn ap-create" onClick={comingSoon('Creating a business portfolio')}>Create a business portfolio</button>
          </div>
        </div>
        <div className="ap-right">
          <div className="ap-rh">
            <div className="ap-rt">
              <Name key={cur.id} {...nameProps} field={cur.field} value={cur.name} what={cur.what} cls="ap-title" />
              <div className="ap-sub">{cur.personal ? 'Your account' : 'Business portfolio'}</div>
            </div>
            {!cur.personal && <button type="button" className="ap-gear" aria-label="Business portfolio settings" onClick={comingSoon('Business portfolio settings')}><ApGear /></button>}
          </div>
          <div className="ap-rc">
            <b>{count(cur.accounts.length)}</b>
            <button type="button" className="ap-btn ap-add" onClick={comingSoon('Adding an ad account')}><ApPlus /><span>Add</span><TbCaret /></button>
          </div>
          {accounts.map((a) => (
            <div key={a.id} className="ap-acct" role="button" tabIndex={0} aria-pressed="true" onClick={pick} onKeyDown={onKey(close)}>
              <span className="ap-radio" aria-hidden="true" />
              <span className="ap-acct-ic" aria-hidden="true"><AcctGlyph /></span>
              <span className="ap-txt">
                <Name {...nameProps} field="accountName" value={a.name} what="ad account" cls="ap-aname" onEditStart={() => clearTimeout(closeT.current)} />
                <span className="ap-cap">Ad account ID:</span>
                <span className="ap-cap">{a.id}</span>
              </span>
              <span className="ap-ring" aria-hidden="true"><ApRing /></span>
            </div>
          ))}
          {cur.accounts.length > 0 && !accounts.length && <div className="ap-none">No ad accounts match your search</div>}
        </div>
      </div>
    </div>
  );
}
