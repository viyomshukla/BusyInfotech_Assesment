import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, ShieldCheck, Stethoscope } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSlowRequest, COLD_START_HINT } from '../hooks/useSlowRequest';
import { Button, Field, Input, ErrorNote } from '../components/ui';
import logoMark from '../assets/logo-mark.png';
import logoWordmark from '../assets/logo-wordmark.png';
import dentistImg from '../assets/clinic/dentist.jpg';
import gynoImg from '../assets/clinic/gyno.jpg';
import physioImg from '../assets/clinic/physio.jpg';
import surgeonImg from '../assets/clinic/surgeon.jpg';

const DEMO_PASSWORD = 'password123';

// The front desk and a doctor see two different applications — one runs the
// whole clinic, the other only their own sheet — so the two are offered as two
// different things here rather than as four identical tiles in a grid.
const FRONT_DESK = { name: 'Front Desk', email: 'desk@clinic.test' };

const DOCTORS = [
  { name: 'Dr Patel', email: 'drpatel@clinic.test' },
  { name: 'Dr Singh', email: 'drsingh@clinic.test' },
  { name: 'Dr Iyer', email: 'driyer@clinic.test' },
  { name: 'Dr Viyom Shukla', email: 'drviyom@clinic.test' },
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
    name: 'Gynaecology',
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
    setPassword(DEMO_PASSWORD);
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

        <div className="relative flex items-center gap-3.5">
          <img
            src={logoMark}
            alt=""
            width={44}
            height={44}
            className="size-11 rounded-xl bg-white object-contain p-1 ring-1 ring-white/25"
          />
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
                'The sheet refreshes itself as the clinic moves',
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

      <section className="flex min-h-screen items-center justify-center px-5 py-10 lg:min-h-0 lg:py-12">
        <div className="w-full max-w-sm">
          {/* Narrow screens drop the whole left panel, so the identity has to be
              carried here instead — the full lockup, at a size worth showing. */}
          <div className="mb-6 lg:hidden">
            {/* The lockup has no transparency, so it is given a tile of its
                own rather than sitting as a white square on the paper. */}
            <img
              src={logoWordmark}
              alt="Riverside Clinic"
              width={132}
              height={132}
              className="mx-auto size-28 rounded-2xl border border-rule bg-white object-contain
                         p-1.5 shadow-card"
            />
            <div className="mt-4 flex items-center justify-center gap-3">
              <div className="flex -space-x-2.5">
                {CLINICS.map((clinic) => (
                  <img
                    key={clinic.name}
                    src={clinic.src}
                    alt={clinic.alt}
                    loading="lazy"
                    className="size-9 rounded-full object-cover shadow-card ring-2 ring-paper"
                  />
                ))}
              </div>
              <p className="text-xs leading-snug text-muted">Four practices, one day sheet.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-rule bg-surface p-6 shadow-raise sm:p-7">
            <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1.5 text-sm text-muted">Use your clinic email address.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
          </div>

          <DemoAccounts selected={email} onPick={fillDemo} />
        </div>
      </section>
    </div>
  );
}

// The two roles are laid out as two separate things on purpose: one reception
// account that runs the clinic, then the doctors who each only see their own
// work. A uniform grid of four buttons hides that difference completely.
function DemoAccounts({ selected, onPick }) {
  return (
    <div className="mt-5 rounded-2xl border border-rule bg-surface/60 p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-ink">Demo accounts</p>
        <p className="text-[11px] text-faint">
          password <span className="tabular text-muted">{DEMO_PASSWORD}</span>
        </p>
      </div>

      <GroupLabel icon={ShieldCheck}>Reception</GroupLabel>

      <button
        type="button"
        onClick={() => onPick(FRONT_DESK.email)}
        aria-pressed={selected === FRONT_DESK.email}
        className={`mt-2 flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left
                    transition-colors ${
                      selected === FRONT_DESK.email
                        ? 'border-accent bg-accent-soft ring-2 ring-accent/20'
                        : 'border-accent/25 bg-accent-soft/60 hover:border-accent hover:bg-accent-soft'
                    }`}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-card">
          <ShieldCheck size={17} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-tight text-accent-deep">
            {FRONT_DESK.name}
          </span>
          <span className="tabular mt-0.5 block truncate text-[11px] text-accent">
            {FRONT_DESK.email}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Whole clinic
        </span>
      </button>

      <GroupLabel icon={Stethoscope}>Doctors</GroupLabel>

      <ul className="mt-2 space-y-1.5">
        {DOCTORS.map((doctor) => {
          const active = selected === doctor.email;
          return (
            <li key={doctor.email}>
              <button
                type="button"
                onClick={() => onPick(doctor.email)}
                aria-pressed={active}
                className={`flex w-full items-center gap-2.5 rounded-lg border bg-surface px-3 py-2
                            text-left shadow-card transition-colors ${
                              active
                                ? 'border-accent ring-2 ring-accent/15'
                                : 'border-rule hover:border-accent'
                            }`}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">
                  {initials(doctor.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium leading-tight text-ink">
                    {doctor.name}
                  </span>
                  <span className="tabular block truncate text-[10px] text-faint">
                    {doctor.email}
                  </span>
                </span>
                {active ? (
                  <Check size={14} strokeWidth={2.5} className="shrink-0 text-accent" />
                ) : (
                  <span className="shrink-0 text-[10px] text-faint">Own sheet</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GroupLabel({ icon: Icon, children }) {
  return (
    <p className="mt-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-faint">
      <Icon size={12} strokeWidth={2} aria-hidden />
      {children}
      <span aria-hidden className="h-px flex-1 bg-rule" />
    </p>
  );
}

function initials(name) {
  return name
    .replace(/^Dr\s+/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
