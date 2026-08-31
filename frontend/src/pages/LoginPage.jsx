import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Field, Input, ErrorNote } from '../components/ui';

const DEMO = [
  { label: 'Front desk', email: 'desk@clinic.test', icon: ShieldCheck },
  { label: 'Dr Patel', email: 'drpatel@clinic.test', icon: Stethoscope },
  { label: 'Dr Singh', email: 'drsingh@clinic.test', icon: Stethoscope },
  { label: 'Dr Iyer', email: 'driyer@clinic.test', icon: Stethoscope },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { login } = useAuth();
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
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-accent-deep px-14 py-16 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-[26rem] rounded-full
                     bg-white/5 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 size-[22rem] rounded-full
                     bg-white/5 blur-2xl"
        />

        <div className="relative flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/15 text-sm font-semibold">
            R
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Riverside Clinic</p>
            <p className="tabular text-[10px] uppercase tracking-[0.16em] text-white/55">
              Scheduling
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[40px] font-bold leading-[1.08] tracking-tight">
            The day sheet, without the paper.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/70">
            Availability, bookings, visit notes and an audit trail in one place, so nobody
            has to count boxes on a printout to know how full tomorrow is.
          </p>

          <ul className="mt-10 space-y-3 text-sm text-white/70">
            {[
              'Recurring availability generated in one action',
              'Every status change kept on a record nobody can rewrite',
              'Unconfirmed appointments surfaced before they go quiet',
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-white/40" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">Staff access only.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 lg:min-h-0">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
              R
            </span>
            <span className="text-sm font-semibold">Riverside Clinic</span>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-sm text-muted">Use your clinic email address.</p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="you@clinic.test"
              />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>

            <ErrorNote>{error}</ErrorNote>

            <Button type="submit" loading={busy} className="w-full">
              {busy ? 'Please wait…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-9 border-t border-rule pt-5">
            <p className="text-xs font-medium text-muted">Demo accounts</p>
            <p className="mt-1 text-xs text-faint">
              Every demo account uses the password <span className="tabular">password123</span>.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => fillDemo(d.email)}
                  className="flex items-center gap-2 rounded-md border border-rule bg-surface px-3 py-2
                             text-left text-xs font-medium text-ink shadow-card transition-colors
                             hover:border-accent hover:text-accent"
                >
                  <d.icon size={14} strokeWidth={1.75} className="shrink-0 text-faint" />
                  <span className="truncate">{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
