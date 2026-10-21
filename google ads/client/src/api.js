async function req(method, url, body) {
  const r = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status, data });
  // A change to the account's data (not signing in or out, not feedback): open panels reload.
  if (method !== 'GET' && !/^\/api\/(login|logout|feedback)\b/.test(url)) window.dispatchEvent(new Event('app:data-changed'));
  return data;
}

export const api = {
  me: () => req('GET', '/api/me'),
  login: (username, password) => req('POST', '/api/login', { username, password }),
  logout: () => req('POST', '/api/logout'),
  // q: { from, to, campaignId?, adGroupId? } (the scope narrows rows, totals and the chart).
  report: (q) => req('GET', '/api/report?' + new URLSearchParams(q)),
  edit: (id, body) => req('PATCH', `/api/ads/${id}/metric`, body),
  history: () => req('GET', '/api/history'),
  account: () => req('GET', '/api/account'),
  editAccount: (field, value) => req('PATCH', '/api/account', { field, value }),
  // Admin replacements for any text or number shown on a page: { [page]: { [original]: replacement } }.
  textOverrides: () => req('GET', '/api/text-overrides'),
  editTextOverride: (page, original, value, shown) => req('PATCH', '/api/text-overrides', { page, original, value, shown }),
  uploadAvatar: async (file) => {
    const fd = new FormData();
    fd.append('media', file);
    const r = await fetch('/api/account/avatar', { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
  editAd: (id, body) => req('PATCH', `/api/ads/${id}`, body),
  addAd: (kind, campaignId, adGroupId) => req('POST', '/api/ads', { kind, campaignId: campaignId || undefined, adGroupId: adGroupId || undefined }),
  deleteAds: (ids) => req('DELETE', '/api/ads', { ids }),
  editCampaign: (id, field, value) => req('PATCH', `/api/campaigns/${id}`, { field, value }),
  editAdGroup: (id, field, value) => req('PATCH', `/api/adgroups/${id}`, { field, value }),
  addCampaign: ({ type, name }) => req('POST', '/api/campaigns', { type, name: name || undefined }),
  addAdGroup: ({ campaignId, name }) => req('POST', '/api/adgroups', { campaignId, name: name || undefined }),
  deleteCampaigns: (ids) => req('DELETE', '/api/campaigns', { ids }),
  deleteAdGroups: (ids) => req('DELETE', '/api/adgroups', { ids }),
  // body: { from, to, metric, value, scope: 'view' (adIds) | 'account' | 'type' (type) | 'campaign' (campaignId) | 'adgroup' (adGroupId) }
  editTotal: (body) => req('PATCH', '/api/totals/metric', body),
  // Display ad edit page: its content, and the image / logo / video library.
  creative: (id) => req('GET', `/api/ads/${encodeURIComponent(id)}/creative`),
  saveCreative: (id, body) => req('PUT', `/api/ads/${encodeURIComponent(id)}/creative`, body),
  assets: (kind) => req('GET', '/api/assets?' + new URLSearchParams({ kind })),
  uploadAsset: async (file, { kind, source, w, h }) => {
    const fd = new FormData();
    fd.append('media', file);
    fd.append('kind', kind);
    fd.append('source', source);
    if (w) fd.append('w', String(w));
    if (h) fd.append('h', String(h));
    const r = await fetch('/api/assets', { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
  deleteAsset: (id) => req('DELETE', `/api/assets/${id}`),
  // Headlines / descriptions used by any ad (the edit page's Asset library tab).
  textAssets: (kind) => req('GET', '/api/text-assets?' + new URLSearchParams({ kind })),
  feedback: () => req('GET', '/api/feedback'),
  sendFeedback: (body) => req('POST', '/api/feedback', body),
  // When and where ads showed (its own data, server/whenwhere.js).
  // q: { tab, from, to, campaigns?: 'id,id' | 'none' | id[], segment?: 'week'|'month'|'quarter'|'year'|'dow' };
  // empty values are left out (no campaigns filter = every campaign).
  wwReport: (q) => req('GET', '/api/ww/report?' + new URLSearchParams(Object.entries(q)
    .filter(([, v]) => v != null)
    .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') || 'none' : String(v)]))),
  // body: { rowIds, metric, value (typed text, '' empties), from, to, label? (change log name) }
  wwEditMetric: (body) => req('PATCH', '/api/ww/metric', body),
  wwEditRows: (ids, field, value) => req('PATCH', '/api/ww/rows', { ids, field, value }),
  wwDuplicateRows: (ids) => req('POST', '/api/ww/rows/duplicate', { ids }),
  wwDeleteRows: (ids) => req('DELETE', '/api/ww/rows', { ids }),
  wwEditCampaign: (id, field, value) => req('PATCH', `/api/ww/campaigns/${id}`, { field, value }),
  // body: { tab, campaignId, ...that tab's fields } -> { id }. A refused field's error has data.field
  // ('campaignId', 'placement', …) to show the message under.
  wwAddRow: (body) => req('POST', '/api/ww/rows', body),
  // body: { name?, type?, status? } -> { id }
  wwAddCampaign: (body) => req('POST', '/api/ww/campaigns', body),
  // -> { deleted, rows }: the campaigns go with all their rows and figures.
  wwDeleteCampaigns: (ids) => req('DELETE', '/api/ww/campaigns', { ids }),
};


