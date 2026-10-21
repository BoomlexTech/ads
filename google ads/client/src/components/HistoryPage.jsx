import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAccount } from '../account.js';
import { BRAND, tabTitle } from '../../../shared/brand.js';

const fmt = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

export default function HistoryPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const account = useAccount();
  useEffect(() => { document.title = tabTitle(`Change history - ${BRAND.name}`); }, [account.name]);
  useEffect(() => {
    const load = () => api.history().then((h) => { setItems(h); setError(''); }).catch((e) => setError(e.message));
    load();
    window.addEventListener('app:refresh', load);
    return () => window.removeEventListener('app:refresh', load);
  }, []);
  return (
    <div className="page">
      <div className="titlebar"><h1>Change history</h1></div>
      <section className="card tablecard">
        {error && <div className="empty">{error}</div>}
        <div className="table-scroll">
          <table className="grid history" data-testid="history-table">
            <thead>
              <tr><th>Date &amp; time</th><th>User</th><th>Level</th><th>Item</th><th>Column</th><th>Date range</th><th className="num">Before</th><th className="num">After</th></tr>
            </thead>
            <tbody>
              {items && items.length === 0 && <tr><td colSpan={8} className="empty">No changes yet</td></tr>}
              {items?.map((h) => (
                <tr key={h.id} data-testid="history-row">
                  <td>{fmt(h.at)}</td><td>{h.user}</td><td>{h.level}</td><td>{h.entityName}</td><td>{h.column}</td>
                  <td>{h.range}</td><td className="num">{h.before}</td><td className="num">{h.after}{h.detail && <small className="hist-detail">{h.detail}</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
