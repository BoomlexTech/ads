import { useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import TextOverrides from './components/TextOverrides.jsx';
import Shell, { editIdFromUrl, assetsIdFromUrl, editUrl, assetsUrl, routeFromUrl, pageUrl } from './components/Shell.jsx';

const ADMIN_SITE = location.pathname.startsWith('/admin');

// The site's entry points "/" and "/admin" open the ads page at its full address; any page
// address (Campaigns, Ad groups, Ads with their scope, an ad's edit or asset details page) is
// rewritten to its current form (no '?', ending in /<brand slug>) and kept, so reloading
// reopens the same page.
{
  const editId = editIdFromUrl(ADMIN_SITE);
  const assetsId = assetsIdFromUrl(ADMIN_SITE);
  const url = editId ? editUrl(ADMIN_SITE, editId)
    : assetsId ? assetsUrl(ADMIN_SITE, assetsId)
      : pageUrl(ADMIN_SITE, routeFromUrl(ADMIN_SITE) || { page: 'ads' });
  if (location.pathname + location.search !== url) history.replaceState(null, '', url);
}

export default function App() {
  const [me, setMe] = useState(undefined);
  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
  }, []);
  if (me === undefined) return null;
  const allowed = me && (!ADMIN_SITE || me.role === 'admin');
  if (!allowed) return <Login admin={ADMIN_SITE} wrongRole={!!me} onLogin={setMe} />;
  const logout = async () => {
    await api.logout();
    setMe(null);
  };
  const canEdit = ADMIN_SITE && me.role === 'admin';
  return (
    <>
      <Shell me={me} canEdit={canEdit} admin={ADMIN_SITE} onLogout={logout} />
      <TextOverrides canEdit={canEdit} />
    </>
  );
}
