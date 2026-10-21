import { useEffect, useRef, useState } from 'react';
import { Icon } from './Common.jsx';
import { ARTICLES, ARTICLE, GROUPS, PAGE_TOPIC, searchArticles } from './helpArticles.js';
import { openFeedback } from './Feedback.jsx';
import './shell-more.css';

function Body({ blocks }) {
  return blocks.map((b, i) => (typeof b === 'string'
    ? <p key={i}>{b}</p>
    : <ul key={i}>{b.list.map((li) => <li key={li}>{li}</li>)}</ul>));
}

function ArticleLink({ a, onOpen }) {
  return (
    <button type="button" className="qh-link" data-testid="qh-article-link" onClick={() => onOpen(a.id)}>
      <Icon name="description" />
      <span>{a.title}</span>
    </button>
  );
}

// Quick help: the right-side panel opened by the Help button and by window 'app:help' events
// (request = { topic, at }). Home shows the most relevant article (the requested topic, else the
// one that fits the page) and the other articles by group; an article opens in the panel with a
// back arrow. The search box looks through every article.
export default function QuickHelp({ request, context, onClose }) {
  const asked = ARTICLE[request?.topic] ? request.topic : null;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(asked);
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef(null);
  const relevant = ARTICLE[asked || PAGE_TOPIC[context]] || ARTICLE.search;
  // Another help link used while the panel is open: show that article.
  useEffect(() => {
    if (!asked) return;
    setOpen(asked);
    setQ('');
    setExpanded(false);
  }, [request?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [open, q]);

  const article = open && ARTICLE[open];
  const term = q.trim();
  const hits = term ? searchArticles(term) : [];
  return (
    <aside className="advisor qh" aria-label="Quick help" data-testid="quick-help">
      <header className="adv-head">
        {article && (
          <button type="button" className="iconbtn" aria-label="Back" data-testid="qh-back" onClick={() => setOpen(null)}>
            <Icon name="arrow_back" />
          </button>
        )}
        <h2>Quick help</h2>
        <span className="spacer" />
        <button type="button" className="iconbtn" aria-label="Close Quick help" onClick={onClose}><Icon name="close" /></button>
      </header>

      <label className="qh-search">
        <Icon name="search" />
        <input value={q} placeholder="Search Quick help" aria-label="Search Quick help" data-testid="qh-search" autoFocus={!asked}
          onChange={(e) => { setQ(e.target.value); setOpen(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); } }} />
        {q && <button type="button" className="iconbtn sm" aria-label="Clear search" onClick={() => setQ('')}><Icon name="close" /></button>}
      </label>

      <div className="adv-body qh-body" ref={bodyRef}>
        {article ? (
          <article className="qh-article" data-testid="qh-article" data-topic={article.id}>
            <h3>{article.title}</h3>
            <p className="qh-lead">{article.summary}</p>
            <Body blocks={article.body} />
            {article.related?.length > 0 && (
              <>
                <h4 className="qh-title">Related</h4>
                {article.related.map((id) => ARTICLE[id] && <ArticleLink key={id} a={ARTICLE[id]} onOpen={setOpen} />)}
              </>
            )}
            <button type="button" className="btn-text qh-fb" onClick={() => openFeedback(`Help: ${article.title}`)}>
              Send feedback about this article
            </button>
          </article>
        ) : term ? (
          <div data-testid="qh-results">
            <h4 className="qh-title">{hits.length === 1 ? '1 article' : `${hits.length} articles`}</h4>
            {hits.length === 0 && (
              <p className="qh-empty">
                {term.split(/\s+/).some((w) => w.length > 1) ? `No help articles match “${term}”. Try another word.` : 'Keep typing to search the help articles.'}
              </p>
            )}
            {hits.map((a) => <ArticleLink key={a.id} a={a} onOpen={setOpen} />)}
          </div>
        ) : (
          <>
            <h4 className="qh-title">Most relevant</h4>
            <div className="qh-card" data-testid="qh-relevant" data-topic={relevant.id}>
              <h3>{relevant.title}</h3>
              <p className="qh-lead">{relevant.summary}</p>
              {expanded && <Body blocks={relevant.body} />}
              <button type="button" className="btn-text qh-more" aria-expanded={expanded} onClick={() => setExpanded((x) => !x)}>
                {expanded ? 'Show less' : 'Read more'}
              </button>
            </div>
            {GROUPS.map((g) => (
              <section key={g} className="qh-group">
                <h4 className="qh-title">{g}</h4>
                {ARTICLES.filter((a) => a.group === g && a.id !== relevant.id).map((a) => <ArticleLink key={a.id} a={a} onOpen={setOpen} />)}
              </section>
            ))}
            <button type="button" className="btn-text qh-fb" onClick={() => openFeedback('Quick help')}>Send feedback about Quick help</button>
          </>
        )}
      </div>
    </aside>
  );
}
