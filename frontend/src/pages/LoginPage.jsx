import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSlowRequest, COLD_START_HINT } from '../hooks/useSlowRequest';
import { Button, Field, Input, ErrorNote } from '../components/ui';
import dentistImg from '../assets/clinic/dentist.jpg';
import gynoImg from '../assets/clinic/gyno.jpg';
import physioImg from '../assets/clinic/physio.jpg';
import surgeonImg from '../assets/clinic/surgeon.jpg';

const DEMO = [
  { label: 'Front desk', email: 'desk@clinic.test', icon: ShieldCheck },
  { label: 'Dr Patel', email: 'drpatel@clinic.test', icon: Stethoscope },
  { label: 'Dr Singh', email: 'drsingh@clinic.test', icon: Stethoscope },
  { label: 'Dr Iyer', email: 'driyer@clinic.test', icon: Stethoscope },
];

// The four practices whose day sheets share this schedule. The staggered
// offsets keep the mosaic from reading as a plain grid of stock photos.
const CLINICS = [
  {
    src: surgeonImg,
    name: 'General medicine',
    alt: 'Consultant reviewing a patient list on a tablet',
    offset: '',
  },
  {
    src: dentistImg,
    name: 'Dentist',
    alt: 'Dentist examining a patient in the chair',
    offset: 'lg:translate-y-6',
  },
  {
    src: physioImg,
    name: 'Physiotherapy',
    alt: 'Physiotherapist taping a knee before a session',
    offset: 'lg:-translate-y-2',
  },
  {
    src: gynoImg,
    name: 'gynecologist ',
    alt: 'Doctor going through notes with an expectant patient',
    offset: 'lg:translate-y-4',
  },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const slow = useSlowRequest(busy);

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
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[1.25fr_1fr]">
      <section className="relative hidden overflow-hidden bg-accent-deep px-14 py-14 text-white lg:flex lg:flex-col lg:justify-between">
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

        <div className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-8 py-10 xl:gap-12">
          <div>
            <h1 className="text-[34px] font-bold leading-[1.08] tracking-tight xl:text-[40px]">
              The day sheet, without the paper.
            </h1>
            <p className="mt-5 text-[15px] leading-relaxed text-white/70">
              Availability, bookings, visit notes and an audit trail in one place, so nobody
              has to count boxes on a printout to know how full tomorrow is.
            </p>

            <ul className="mt-8 space-y-2.5 text-[13px] leading-relaxed text-white/70">
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

          {/* Each photo keeps a slight blue wash over it, so four unrelated
              rooms still read as one panel rather than four cut-outs. */}
          <div className="grid grid-cols-2 gap-3.5">
            {CLINICS.map((clinic, i) => (
              <figure
                key={clinic.name}
                style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' }}
                className={`animate-rise group relative overflow-hidden rounded-2xl shadow-pop
                            ring-1 ring-white/15 ${clinic.offset}`}
              >
                <img
                  src={clinic.src}
                  alt={clinic.alt}
                  loading="lazy"
                  className="aspect-4/5 w-full object-cover saturate-[0.92] transition-transform
                             duration-500 group-hover:scale-[1.04]"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-accent-deep/30 transition-colors
                             group-hover:bg-accent-deep/10"
                />
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-accent-deep
                             via-accent-deep/55 to-transparent"
                />
                <figcaption className="absolute inset-x-0 bottom-0 px-3.5 pb-3.5">
                  <p className="text-[13px] font-semibold leading-tight">{clinic.name}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/40">Staff access only.</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 lg:min-h-0">
        <div className="w-full max-w-sm">
          <div className="mb-7 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
                R
              </span>
              <span className="text-sm font-semibold">Riverside Clinic</span>
            </div>

            {/* Narrow screens drop the mosaic, so the practices come through as
                a row of overlapping thumbnails instead. */}
            <div className="mt-5 flex items-center gap-3">
              <div className="flex -space-x-2.5">
                {CLINICS.map((clinic) => (
                  <img
                    key={clinic.name}
                    src={clinic.src}
                    alt={clinic.alt}
                    loading="lazy"
                    className="size-10 rounded-full object-cover shadow-card ring-2 ring-paper"
                  />
                ))}
              </div>
              <p className="text-xs leading-snug text-muted">Four practices, one day sheet.</p>
            </div>
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

            {slow && (
              <p
                role="status"
                aria-live="polite"
                className="animate-fade rounded-md border border-rule bg-accent-soft/60 px-3 py-2.5
                           text-xs leading-relaxed text-muted"
              >
                {COLD_START_HINT}
              </p>
            )}
          </form>

          <div className="mt-9 border-t border-rule pt-5">
            <p className="text-xs font-medium text-muted">Demo accounts</p>
            <p className="mt-1 text-xs text-faint">
              Every demo account uses the password = <span className="tabular">password123</span>.
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
