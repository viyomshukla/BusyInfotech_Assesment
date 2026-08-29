import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const DEMO = [
  { label: 'Front desk', email: 'desk@clinic.test' },
  { label: 'Dr Patel', email: 'drpatel@clinic.test' },
  { label: 'Dr Singh', email: 'drsingh@clinic.test' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname ?? '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(demoEmail) {
    setEmail(demoEmail);
    setPassword('password123');
    setError(null);
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6">
        <div className="grid w-full gap-16 md:grid-cols-[1fr_360px]">
          <div className="hidden self-center md:block">
            <p className="tabular text-xs uppercase tracking-[0.18em] text-muted">
              Riverside Clinic
            </p>
            <h1 className="mt-3 max-w-sm text-4xl font-bold leading-[1.1] tracking-tight">
              The day sheet, without the paper.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              Availability, bookings and visit notes in one place, so nobody has to
              count boxes on a printout to know how full tomorrow is.
            </p>

            <div className="mt-10 border-t border-rule pt-5">
              <p className="text-xs font-medium text-muted">Demo accounts</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => fillDemo(d.email)}
                    className="rounded border border-rule bg-surface px-3 py-1.5 text-xs font-medium
                               text-ink transition-colors hover:border-accent hover:text-accent"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="self-center rounded-lg border border-rule bg-surface p-7 shadow-sm"
          >
            <h2 className="text-lg font-semibold">Sign in</h2>

            <label className="mt-6 block text-xs font-medium text-muted" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="mt-1.5 w-full rounded border border-rule px-3 py-2 text-sm
                         focus:border-accent focus:outline-none"
            />

            <label className="mt-4 block text-xs font-medium text-muted" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="mt-1.5 w-full rounded border border-rule px-3 py-2 text-sm
                         focus:border-accent focus:outline-none"
            />

            {error && (
              <p
                role="alert"
                className="mt-4 rounded border border-status-noshow/25 bg-status-noshow/5
                           px-3 py-2 text-sm text-status-noshow"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-6 w-full rounded bg-accent py-2.5 text-sm font-medium text-white
                         transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="mt-4 text-center text-xs text-muted md:hidden">
              Demo: desk@clinic.test / password123
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}