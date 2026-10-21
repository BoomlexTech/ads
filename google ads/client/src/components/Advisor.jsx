import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAccount } from '../account.js';
import { Icon, Dropdown, MenuItem } from './Common.jsx';
import { overview, insights, answer, adToAnalyze, SUGGESTIONS } from './advisorEngine.js';
import { ARTICLE } from './helpArticles.js';
import { todayISO, addDays } from '../../../shared/dates.js';
import './advisor.css';

export function AdvisorIcon({ size = 24 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14.6 9.8A5.6 5.6 0 1 1 10 4.3" />
      <path d="M14 14l6 6" />
      <path fill="currentColor" stroke="none" d="M17.5 1.5l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3L13 6l3.3-1.2z" />
    </svg>
  );
}

function last30() {
  const y = addDays(todayISO(), -1);
  return { from: addDays(y, -29), to: y };
}

// The ad open on the page (asset details or the edit page): it settles an ad name that
// several ads share in "Analyze my ad <name>".
function viewingAdId() {
  // .../aw/ads/assets/<id>/<slug> or .../aw/ads/edit/display/<id>/<slug> (older: ...?adId=<id>).
  const m = /\/aw\/ads\/(?:assets|edit\/display)(?:\/([^/]+))?(?:\/[^/]+)?$/.exec(location.pathname);
  if (!m) return null;
  if (m[1] && /^[0-9a-f]{24}$/i.test(m[1])) return m[1];
  return new URLSearchParams(location.search).get('adId') || null;
}
const STALE_NOTE = "I couldn't refresh the data just now, so this answer uses the figures loaded earlier.";

// Earlier questions and the thumbs up / down given to insight cards, remembered in this browser only.
const HISTORY_KEY = 'ap.advisor.history';
const VOTES_KEY = 'ap.advisor.votes';
const HISTORY_MAX = 20;
function load(key, ok, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return ok(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function store(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage off */ }
}
const loadHistory = () => load(HISTORY_KEY, Array.isArray, []).filter((q) => typeof q === 'string' && q.trim()).slice(0, HISTORY_MAX);
const loadVotes = () => load(VOTES_KEY, (v) => v && typeof v === 'object' && !Array.isArray(v), {});

// Quick help panel and feedback form are opened by the shell, which listens for these events.
const openHelp = (topic) => window.dispatchEvent(new CustomEvent('app:help', { detail: { topic } }));
const sendFeedback = () => window.dispatchEvent(new CustomEvent('app:feedback', { detail: { about: 'Ask Advisor' } }));

function HelpLink({ topic, children = 'Learn more' }) {
  return <button type="button" className="adv-link" data-help={topic} onClick={() => openHelp(topic)}>{children}</button>;
}

// Thumb up, outlined or (once chosen) filled; the thumb down is the same shape turned over.
const THUMB = 'M21 8h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2c0-1.1-.9-2-2-2zm0 4l-3 7H9V9l4.34-4.34L12.23 10H21v2zM1 9h4v12H1z';
const THUMB_ON = 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z';
function Thumb({ down, on }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d={on ? THUMB_ON : THUMB} transform={down ? 'rotate(180 12 12)' : undefined} />
    </svg>
  );
}

function Votes({ id, vote, onVote }) {
  return (
    <div className="adv-votes">
      <button type="button" className={`iconbtn sm ${vote === 'up' ? 'on' : ''}`} aria-label="Helpful" aria-pressed={vote === 'up'} data-tip="Helpful"
        onClick={() => onVote(id, 'up')}>
        <Thumb on={vote === 'up'} />
      </button>
      <button type="button" className={`iconbtn sm ${vote === 'down' ? 'on' : ''}`} aria-label="Not helpful" aria-pressed={vote === 'down'} data-tip="Not helpful"
        onClick={() => onVote(id, 'down')}>
        <Thumb down on={vote === 'down'} />
      </button>
    </div>
  );
}

// Next questions to ask, shown as links; each one asks the advisor straight away.
function FollowUps({ items, onAsk }) {
  return (
    <div className="adv-follow">
      {items.map((q) => <button key={q} type="button" className="adv-follow-link" onClick={() => onAsk(q)}>{q}</button>)}
    </div>
  );
}

function Suggestions({ onAsk }) {
  return (
    <div className="adv-suggest">
      {SUGGESTIONS.map((s) => <button key={s} type="button" className="adv-chip" onClick={() => onAsk(s)}>{s}</button>)}
    </div>
  );
}

function Snapshot({ items, onAsk }) {
  return (
    <section className="adv-card adv-snap" data-testid="adv-snapshot" aria-label="Last 30 days">
      <h4 className="adv-snap-title">Last 30 days</h4>
      <div className="adv-snap-grid">
        {items.map((s) => (
          <div className="adv-snap-stat" key={s.key} data-metric={s.key} title={s.note}>
            <div className="adv-label">{s.label}</div>
            <div className="adv-value">{s.value}</div>
            {s.change && (
              <div className="adv-delta">
                {s.change.dir !== 0 && <Icon name={s.change.dir > 0 ? 'arrow_upward' : 'arrow_downward'} />}
                {s.change.text}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="adv-snap-foot">Changes compare with the 30 days before.</p>
      <FollowUps items={['Compare with the 30 days before']} onAsk={onAsk} />
    </section>
  );
}

function Insight({ it, vote, onVote, onAsk }) {
  return (
    <section className={`adv-insight tone-${it.tone}`} data-testid="adv-insight" data-insight={it.id}>
      <div className="adv-ins-head">
        <span className="adv-ins-icon"><Icon name={it.icon} /></span>
        <h4>{it.title}</h4>
      </div>
      <p className="adv-ins-text">{it.text}{it.help && <>{' '}<HelpLink topic={it.help} /></>}</p>
      {it.follow.length > 0 && <FollowUps items={it.follow} onAsk={onAsk} />}
      <div className="adv-ins-foot">
        <span className="adv-ins-ask">Was this useful?</span>
        <Votes id={it.id} vote={vote} onVote={onVote} />
      </div>
    </section>
  );
}

// An answer: its text, a small table of figures, the suggestions that follow from them
// (with the Quick help topic they point to), then the next questions to ask.
function Answer({ a, onAsk }) {
  const tips = a.tips?.length > 0;
  const topic = a.help && ARTICLE[a.help]?.title;
  return (
    <div className="adv-msg bot">
      <p>{a.text}{a.help && !tips && <>{' '}<HelpLink topic={a.help} /></>}</p>
      {a.rows?.length > 0 && (
        <ul className="adv-rows">
          {a.rows.map((r, i) => <li key={i}><span>{r.label}</span><b>{r.value}</b></li>)}
        </ul>
      )}
      {tips && (
        <section className="adv-tips" data-testid="adv-tips" aria-label="Suggestions">
          <h4>Suggestions</h4>
          <ul>{a.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
          {a.help && <HelpLink topic={a.help}>{topic ? `Learn more about ${topic.toLowerCase()}` : 'Learn more'}</HelpLink>}
        </section>
      )}
      {a.note && <p className="adv-note-stale">{a.note}</p>}
      {a.follow?.length > 0 && <FollowUps items={a.follow} onAsk={onAsk} />}
      {a.suggest && <Suggestions onAsk={onAsk} />}
    </div>
  );
}

// Shown while an answer is worked out from freshly read data.
function Pending() {
  return (
    <div className="adv-msg bot" aria-busy="true">
      <div className="adv-loading" aria-label="Working out the answer"><span /><span /><span /></div>
    </div>
  );
}

// Ask Advisor chat panel: a welcome message worked out from the last 30 days (summary,
// snapshot and insight cards), then each question with its answer. Everything is computed
// in the browser from the account's report (advisorEngine.js); nothing is sent anywhere.
// question: one to ask once the data is loaded (from the top search box or another page);
// questionAdId: the ad it is about, when the sender knows it (else the ad open on the page).
export default function Advisor({ onClose, question, questionAdId, onQuestionUsed }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [votes, setVotes] = useState(loadVotes);
  const bodyRef = useRef(null);
  const account = useAccount();
  const inputRef = useRef(null);
  // The newest report; seq numbers the reads, so one that finishes late never replaces a newer one.
  const latest = useRef(null);
  const seq = useRef(0);
  const msgId = useRef(0);

  const apply = (r) => {
    latest.current = r;
    setReport(r);
    setError('');
  };
  const refresh = () => {
    const n = ++seq.current;
    setError('');
    api.report(last30())
      .then((r) => { if (n === seq.current) apply(r); })
      .catch((e) => { if (n === seq.current) setError(e.message); });
  };
  // A copy of the report read now.
  const fresh = async () => {
    const n = ++seq.current;
    const r = await api.report(last30());
    if (n === seq.current) apply(r);
    return r;
  };
  useEffect(() => { refresh(); }, []);
  // The top bar's Refresh, and edits made elsewhere in the app (app:data-changed) while the
  // panel is open, read the data again so the welcome, cards and answers follow them.
  useEffect(() => {
    const on = () => refresh();
    window.addEventListener('app:refresh', on);
    window.addEventListener('app:data-changed', on);
    return () => {
      window.removeEventListener('app:refresh', on);
      window.removeEventListener('app:data-changed', on);
    };
  }, []);

  // Each answer is worked out from the data as it is when the question is asked, so edits
  // made since the panel opened are in it; for a display ad asked about, its content is read
  // too (headline and image counts, the edit page's checks).
  const reply = async (id, question, viewingAd) => {
    let r = latest.current;
    let stale = false;
    try {
      r = await fresh();
    } catch {
      stale = true;
    }
    const opts = { viewingAdId: viewingAd };
    const ad = adToAnalyze(question, r, opts);
    if (ad?.format === 'display') {
      try {
        const got = await api.creative(ad.id);
        if (got?.creative && typeof got.creative === 'object') opts.creatives = { [ad.id]: got.creative };
      } catch { /* its counts stay unknown and are left out */ }
    }
    let a;
    try {
      a = answer(question, r, opts);
    } catch {
      a = { text: "Sorry, I couldn't work that out from your data.", suggest: true };
    }
    if (stale) a = { ...a, note: STALE_NOTE };
    setMsgs((m) => m.map((x) => (x.id === id ? { ...x, a } : x)));
  };

  // True when the question was asked (there is data to answer it from).
  const ask = (q, adId) => {
    const question = q.trim();
    if (!question || !report) return false;
    setShowHistory(false);
    setHistory((h) => {
      const next = [question, ...h.filter((x) => x !== question)].slice(0, HISTORY_MAX);
      store(HISTORY_KEY, next);
      return next;
    });
    const id = ++msgId.current;
    setMsgs((m) => [...m, { id: `q${id}`, who: 'me', text: question }, { id, who: 'bot', a: null }]);
    reply(id, question, adId || viewingAdId());
    return true;
  };
  const send = () => { if (ask(text)) setText(''); };
  const clearHistory = () => { setHistory([]); store(HISTORY_KEY, []); };
  // A second click on the same thumb takes the vote back.
  const vote = (id, v) => setVotes((cur) => {
    const next = { ...cur };
    if (next[id] === v) delete next[id];
    else next[id] = v;
    store(VOTES_KEY, next);
    return next;
  });

  // A question typed in the top search box arrives here once the data is loaded. Asked once:
  // the report is read again for each answer, which must not ask it again.
  const asked = useRef(null);
  useEffect(() => {
    if (!question) asked.current = null;
    else if (report && asked.current !== question) {
      asked.current = question;
      ask(question, questionAdId);
      onQuestionUsed?.();
    }
  }, [question, report]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && msgs.length) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // The message box grows with its text (Shift+Enter adds a line), up to its max-height.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [text]);

  const ov = useMemo(() => report && overview(report), [report]);
  const cards = useMemo(() => (report ? insights(report) : []), [report]);
  return (
    <aside className="advisor" aria-label="Ask Advisor" data-testid="advisor">
      <header className="adv-head">
        <span className="adv-icon"><AdvisorIcon /></span>
        <h2>Ask Advisor</h2>
        <span className="adv-beta">BETA</span>
        <span className="spacer" />
        <button type="button" className={`iconbtn ${showHistory ? 'on' : ''}`} aria-label="Chat history" aria-pressed={showHistory} data-tip="Earlier questions"
          onClick={() => setShowHistory((s) => !s)}>
          <Icon name="history" />
        </button>
        <Dropdown align="right" trigger={(open, toggle) => (
          <button type="button" className={`iconbtn ${open ? 'on' : ''}`} aria-label="More options" aria-expanded={open} data-tip="More options" onClick={toggle}>
            <Icon name="more_vert" />
          </button>
        )}>
          {(close) => (
            <div className="menu" data-testid="adv-menu">
              <MenuItem icon="delete" disabled={!msgs.length} onClick={() => { setMsgs([]); setShowHistory(false); close(); }}>Clear conversation</MenuItem>
              <MenuItem icon="chat_bubble" onClick={() => { close(); sendFeedback(); }}>Send feedback</MenuItem>
            </div>
          )}
        </Dropdown>
        <button type="button" className="iconbtn" aria-label="Close Ask Advisor" data-tip="Close" onClick={onClose}><Icon name="close" /></button>
      </header>

      <div className="adv-body" ref={bodyRef}>
        {showHistory ? (
          <div className="adv-history" data-testid="adv-history">
            <div className="adv-hist-head">
              <h3>Earlier questions</h3>
              {history.length > 0 && <button type="button" className="adv-link" onClick={clearHistory}>Clear history</button>}
            </div>
            {history.length === 0 && <p className="muted">No questions yet.</p>}
            {history.map((h) => (
              <button key={h} type="button" className="adv-hist-item" onClick={() => ask(h)}><Icon name="history" /><span>{h}</span></button>
            ))}
            <p className="adv-hist-note">Kept in this browser only. Pick a question to ask it again.</p>
          </div>
        ) : (
          <>
            <div className="adv-start" data-testid="adv-welcome">
              <h3 className="adv-welcome">Welcome, <b>{account.name}</b></h3>
              {error && <p className="adv-error">{error} <button type="button" className="adv-link" onClick={refresh}>Try again</button></p>}
              {!report && !error && <div className="adv-loading" aria-label="Loading"><span /><span /><span /></div>}
              {ov && (
                <>
                  <p className="adv-intro" data-testid="adv-summary">{ov.intro}</p>
                  <Snapshot items={ov.snapshot} onAsk={ask} />
                  {cards.map((it) => <Insight key={it.id} it={it} vote={votes[it.id]} onVote={vote} onAsk={ask} />)}
                  {cards.length === 0 && <Suggestions onAsk={ask} />}
                </>
              )}
            </div>
            {msgs.map((m) => {
              if (m.who === 'me') return <div key={m.id} className="adv-msg me">{m.text}</div>;
              return m.a ? <Answer key={m.id} a={m.a} onAsk={ask} /> : <Pending key={m.id} />;
            })}
          </>
        )}
      </div>

      <div className="adv-bottom">
        <form className="adv-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea ref={inputRef} rows={1} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            placeholder="Type message" aria-label="Type message" data-testid="adv-input" autoFocus />
          <button type="submit" className="iconbtn" aria-label="Send" data-tip="Send" disabled={!text.trim() || !report}><Icon name="send" /></button>
        </form>
        <p className="adv-foot">
          Answers are worked out from your account data and can be incomplete.{' '}
          <HelpLink topic="advisor" />
        </p>
      </div>
    </aside>
  );
}
