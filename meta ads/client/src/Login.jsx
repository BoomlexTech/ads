import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api } from './api.js';
import { TabAds } from './icons.jsx';

export default function Login({ onLogin, admin, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const u = await api.login(email, password, admin); // at /admin the server refuses non-admin accounts without logging them in
      await onLogin(u);
      setBusy(false);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand"><span className="login-logo"><TabAds /></span><span>Ads Manager</span></div>
        <h1>Log in to your account</h1>
        <p className="login-sub">{admin ? 'Admin access only' : 'Log in to continue'}</p>

        {(error || notice) && <div className="login-err" role="alert">{error || notice}</div>}

        <label className="lf">
          <span>Email address</span>
          <input type="email" autoFocus autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="lf">
          <span>Password</span>
          <div className="lf-pw">
            <input type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </label>

        <button className="login-btn" disabled={busy || !email || !password}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </div>
  );
}
