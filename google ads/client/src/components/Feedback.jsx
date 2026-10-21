import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useNotify } from '../account.js';
import { BRAND, tabTitle } from '../../../shared/brand.js';
import { Icon } from './Common.jsx';
import './shell-more.css';

export const FEEDBACK_MAX = 2000;
const ABOUT_MAX = 100;
const TOPICS = ['General', 'Campaigns, ad groups and ads', 'Reports and figures', 'Editing an ad', 'Search', 'Ask Advisor', 'Quick help', 'Something else'];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const fmt = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

// The same request shape as api.js; feedback is this file's only use of the server.
async function req(method, url, body) {
  const r = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status, data });
  return data;
}
export const feedbackApi = {
  // body: { about, text, page }
  send: (body) => req('POST', '/api/feedback', body),
  list: () => req('GET', '/api/feedback'),
};

// Opens the dialog from anywhere; about = what the feedback is about (a feature or page name).
export const openFeedback = (about = '') => window.dispatchEvent(new CustomEvent('app:feedback', { detail: { about } }));

function FeedbackDialog({ about, onClose, onSent }) {
  const topics = about && !TOPICS.includes(about) ? [about, ...TOPICS] : TOPICS;
  const [topic, setTopic] = useState(about || TOPICS[0]);
  const [text, setText] = useState('');
  const [withPage, setWithPage] = useState(false);
  const [busy, setBusyState] = useState(false);
  const [error, setError] = useState('');
  const box = useRef(null);
  const textRef = useRef(null);
  // While a send is in flight the dialog can't be closed (Esc, X, Cancel, the scrim): the
  // message would still be saved, and its reply would land on a dialog that's gone.
  const busyRef = useRef(false);
  const setBusy = (b) => { busyRef.current = b; setBusyState(b); };
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = () => { if (!busyRef.current) closeRef.current(); };
  // Focus goes back where it was (a button, the search box) when the dialog closes.
  const [opener] = useState(() => document.activeElement);
  useEffect(() => () => {
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus();
  }, [opener]);
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); close(); }
      else if (ev.key === 'Tab' && box.current) {
        // Tab and Shift+Tab go round the dialog's own fields and buttons.
        const els = [...box.current.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);
        if (!els.length) return;
        const at = document.activeElement;
        const first = els[0];
        const last = els[els.length - 1];
        let to = null;
        if (!box.current.contains(at)) to = ev.shiftKey ? last : first;
        else if (ev.shiftKey && at === first) to = last;
        else if (!ev.shiftKey && at === last) to = first;
        if (to) { ev.preventDefault(); to.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const t = text.trim();
    if (!t) {
      setError('Write your feedback first');
      textRef.current?.focus();
      return;
    }
    if (busyRef.current) return;
    setBusy(true);
    setError('');
    try {
      await feedbackApi.send({ about: topic, text: t, page: withPage ? location.pathname + location.search : '' });
      busyRef.current = false;
      onSent();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  const left = FEEDBACK_MAX - text.length;
  return createPortal(
    <>
      <div className="es-scrim" onClick={close} />
      <div className="es-dialog fb-dialog" role="dialog" aria-modal="true" aria-label="Send feedback" data-testid="feedback-dialog" ref={box}>
        <div className="es-head">
          <div>
            <h2>Send feedback</h2>
            <div className="es-sub">Your message goes to the admins of this {BRAND.name} account.</div>
          </div>
          <button type="button" className="iconbtn" aria-label="Close" disabled={busy} onClick={close}><Icon name="close" /></button>
        </div>
        <form className="es-body" onSubmit={(ev) => { ev.preventDefault(); send(); }}>
          <label className="es-field">
            <span className="es-label">What is it about?</span>
            <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="What is it about?" data-testid="feedback-about">
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="es-field">
            <span className="es-label">Your feedback</span>
            <textarea ref={textRef} className="fb-text" value={text} maxLength={FEEDBACK_MAX} rows={6} required autoFocus
              aria-label="Your feedback" data-testid="feedback-text" aria-invalid={!!error && !text.trim() ? true : undefined}
              placeholder="Tell us what works, what doesn’t, or what you’d like to see"
              onChange={(e) => { setText(e.target.value); if (error) setError(''); }} />
            <small className={`es-hint fb-count ${left < 100 ? 'low' : ''}`} aria-live="polite">{text.length} / {FEEDBACK_MAX.toLocaleString('en-US')}</small>
          </label>
          <label className="fb-check">
            <input type="checkbox" checked={withPage} onChange={(e) => setWithPage(e.target.checked)} data-testid="feedback-page" />
            <span>Include the address of this page</span>
          </label>
          {error && <div className="fb-error" role="alert">{error}</div>}
        </form>
        <div className="es-foot">
          <button type="button" className="btn-text" disabled={busy} onClick={close}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy || !text.trim()} onClick={send} data-testid="feedback-send">{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// Listens for window 'app:feedback' events ({ detail: { about } }) and shows the dialog.
export default function FeedbackHost() {
  const [open, setOpen] = useState(null);
  // Each opening gets its own number (two in the same millisecond would share a Date.now()).
  const seq = useRef(0);
  const notify = useNotify();
  useEffect(() => {
    const on = (e) => {
      const about = typeof e.detail?.about === 'string' ? e.detail.about.trim().slice(0, ABOUT_MAX) : '';
      seq.current += 1;
      const n = seq.current;
      // A dialog already open (maybe with a draft or a send in flight) stays.
      setOpen((cur) => cur || { about, n });
    };
    window.addEventListener('app:feedback', on);
    return () => window.removeEventListener('app:feedback', on);
  }, []);
  if (!open) return null;
  const n = open.n;
  return (
    <FeedbackDialog key={n} about={open.about} onClose={() => setOpen((cur) => (cur?.n === n ? null : cur))}
      onSent={() => {
        // Only the dialog that sent the message closes (never one opened since).
        setOpen((cur) => (cur?.n === n ? null : cur));
        notify('Thanks, your feedback was sent');
        window.dispatchEvent(new Event('app:feedback-sent'));
      }} />
  );
}

// Admin page: the latest feedback, newest first.
export function FeedbackPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const account = useAccount();
  useEffect(() => { document.title = tabTitle(`Feedback - ${BRAND.name}`); }, [account.name]);
  useEffect(() => {
    const load = () => feedbackApi.list().then((f) => { setItems(f); setError(''); }).catch((e) => setError(e.message));
    load();
    window.addEventListener('app:refresh', load);
    window.addEventListener('app:feedback-sent', load);
    return () => {
      window.removeEventListener('app:refresh', load);
      window.removeEventListener('app:feedback-sent', load);
    };
  }, []);
  return (
    <div className="page" data-level="feedback">
      <div className="titlebar"><h1>Feedback</h1></div>
      <section className="card tablecard">
        <p className="fb-note">Messages sent with Send feedback by anyone who can sign in, newest first (the latest 200).</p>
        {error && <div className="empty">{error}</div>}
        <div className="table-scroll">
          <table className="grid history fb-table" data-testid="feedback-table">
            <thead>
              <tr><th>Date &amp; time</th><th>User</th><th>Access</th><th>About</th><th>Feedback</th><th>Page</th></tr>
            </thead>
            <tbody>
              {items && items.length === 0 && <tr><td colSpan={6} className="empty">No feedback yet</td></tr>}
              {items?.map((f) => (
                <tr key={f.id} data-testid="feedback-row">
                  <td className="fb-when">{fmt(f.at)}</td>
                  <td>{f.user}</td>
                  <td>{f.role === 'admin' ? 'Admin' : 'Read-only'}</td>
                  <td>{f.about}</td>
                  <td className="fb-msg">{f.text}</td>
                  <td className="fb-page">{f.page || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
