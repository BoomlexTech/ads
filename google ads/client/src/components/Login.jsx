import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Logo } from './Common.jsx';
import { BRAND, tabTitle } from '../../../shared/brand.js';

export default function Login({ admin, wrongRole, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(wrongRole ? 'This account cannot open the admin site.' : '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = tabTitle(`Sign in - ${BRAND.name}`); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const me = await api.login(username, password);
      if (admin && me.role !== 'admin') {
        await api.logout();
        setError('This account cannot open the admin site.');
      } else {
        onLogin(me);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand"><Logo /><span>{BRAND.name}</span></div>
        <h1>Sign in</h1>
        <p className="login-sub">{admin ? 'Admin site' : 'Viewer site'}</p>
        <label className="field">
          <span>Username</span>
          <input name="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="btn-primary" disabled={busy || !username || !password}>Sign in</button>
      </form>
    </div>
  );
}
