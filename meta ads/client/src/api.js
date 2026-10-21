async function req(url, opts = {}) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/login')) window.dispatchEvent(new Event('auth:expired')); // session ended
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();

export const api = {
  me: () => req('/api/auth/me'),
  login: (email, password, adminOnly) => req('/api/auth/login', json('POST', { email, password, adminOnly: adminOnly || undefined })),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  tree: () => req('/api/tree'),
  report: (p) => req('/api/report?' + qs(p)),
  create: (level, form) => req(`/api/entities/${level}`, { method: 'POST', body: form }),
  update: (level, id, form) => req(`/api/entities/${level}/${id}`, { method: 'PATCH', body: form }),
  setStatus: (level, id, status) => req(`/api/entities/${level}/${id}`, json('PATCH', { status })),
  patch: (level, id, body) => req(`/api/entities/${level}/${id}`, json('PATCH', body)),
  metric: (body) => req('/api/admin/metric', json('PUT', body)), // admin panel: type a new total into a cell
  text: (body) => req('/api/admin/text', json('PUT', body)), // admin panel: value '—' empties a value cell (it shows a dash), '' brings the figure back
  settings: () => req('/api/settings'), // the names in the account panel: { portfolioName, accountName, secondPortfolioName, profileName }
  saveSettings: (body) => req('/api/admin/settings', json('PUT', body)), // admin panel: rename any of them; answers with all four
  version: () => req('/api/version'), // changes whenever anything is edited; the main site polls it
  duplicate: (level, id) => req(`/api/entities/${level}/${id}/duplicate`, { method: 'POST' }),
  remove: (level, id) => req(`/api/entities/${level}/${id}`, { method: 'DELETE' }),
  stats: (adId) => req('/api/stats?adId=' + adId),
  saveStat: (b) => req('/api/stats', json('PUT', b)),
  deleteStat: (id) => req('/api/stats/' + id, { method: 'DELETE' }),
  bulk: (b) => req('/api/stats/bulk', json('POST', b)),
  history: (entityId) => req('/api/history?' + qs({ entityId })),
};
