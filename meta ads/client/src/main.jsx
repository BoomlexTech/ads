import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree';
import './styles.css';
import App from './App.jsx';
import Login from './Login.jsx';
import { api } from './api.js';

// The design is laid out at Ads Manager's 1600px reference width. Scaling the whole page with the window
// keeps every proportion identical on any screen (same look as the real thing on a laptop or a monitor).
function useFit() {
  useEffect(() => {
    const fit = () => {
      const z = Math.min(1.35, Math.max(0.5, window.innerWidth / 1700));
      const r = document.getElementById('root');
      r.style.zoom = z;
      r.style.width = `${window.innerWidth / z}px`;
      r.style.height = `${window.innerHeight / z}px`;
      document.documentElement.style.setProperty('--vh', `${window.innerHeight / z}px`);
    };
    fit();
    const t1 = setTimeout(fit, 250), t2 = setTimeout(fit, 1200); // some embedded browsers report the final size late
    window.addEventListener('resize', fit);
    window.addEventListener('load', fit);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(document.documentElement);
    return () => { clearTimeout(t1); clearTimeout(t2); ro?.disconnect(); window.removeEventListener('resize', fit); window.removeEventListener('load', fit); };
  }, []);
}

// /admin is the same Ads Manager with in-place editing switched on; it only lets the admin account in.
const ADMIN = /^\/admin(\/|$)/i.test(window.location.pathname);

// The page lives at /manage/ads?act=<the demo account number>&columns=... (admin: /admin/manage/ads?...).
// "/" and "/admin" are rewritten to that address on load (the server serves the same page for every path).
(() => {
  try {
    const root = ADMIN ? '/admin' : '';
    const here = window.location.pathname.replace(/\/+$/, '').toLowerCase();
    if (here !== root && here !== root + '/manage/ads') return;
    const q = new URLSearchParams(window.location.search);
    if (!q.has('act')) q.set('act', '2847391046251');
    if (!q.has('columns')) q.set('columns', 'name,delivery,results,cost_per_result,budget,spend,impressions');
    window.history.replaceState(window.history.state, '', root + '/manage/ads?' + q.toString() + window.location.hash);
  } catch { /* the address bar is cosmetic */ }
})();
const NOT_ADMIN = 'This account does not have admin access. Log in with the admin account.';

function Root() {
  const [user, setUser] = useState(undefined); // undefined = checking session, null = logged out, else {email, role}
  const [notice, setNotice] = useState('');
  useFit();
  useEffect(() => {
    api.me().then((u) => setUser(u && u.email ? u : null)).catch(() => setUser(null));
    const expired = () => setUser(null);
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, []);
  if (user === undefined) return null;
  if (!user || (ADMIN && user.role !== 'admin')) {
    const onLogin = (u) => {
      if (ADMIN && u.role !== 'admin') { setNotice(NOT_ADMIN); return; }
      setNotice(''); setUser(u);
    };
    return <Login admin={ADMIN} notice={user && ADMIN ? NOT_ADMIN : notice} onLogin={onLogin} />;
  }
  return <App user={user.email} role={user.role} admin={ADMIN} onLogout={async () => { await api.logout().catch(() => {}); setNotice(''); setUser(null); }} />;
}

createRoot(document.getElementById('root')).render(<Root />);
