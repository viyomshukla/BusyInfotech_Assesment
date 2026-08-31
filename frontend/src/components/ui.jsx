import { useEffect } from 'react';
import { STATUS_LABEL, STATUS_COLOR } from '../lib/format';

// A circular indeterminate spinner. It inherits `currentColor`, so it sits
// correctly inside a button, a panel, or on the accent background.
export function Spinner({ size = 20, className = '', strokeWidth = 2.5 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={`shrink-0 animate-spin ${className}`}
    >
      <circle
        cx="12"
        cy="12"
        r="9.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="opacity-20"
      />
      <path
        d="M21.5 12A9.5 9.5 0 0 0 12 2.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

// The in-panel waiting state: a turning circle over "Please wait…".
export function Loading({ label = 'Please wait…', hint, size = 30, className = '' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`animate-fade flex flex-col items-center justify-center gap-3.5 px-6 py-16
                  text-center ${className}`}
    >
      <Spinner size={size} className="text-accent" />
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted">
          {hint ?? 'Fetching the latest from the clinic record.'}
        </p>
      </div>
    </div>
  );
}

// The same thing, centred on an otherwise empty screen — used before the
// session has resolved, when there is no layout to sit inside yet.
export function PageLoader({ label = 'Please wait…', hint }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <Loading label={label} hint={hint} size={36} />
    </div>
  );
}

// A small spinner with text, for spots too tight for the full block.
export function InlineLoading({ label = 'Please wait…', className = '' }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 text-xs text-muted ${className}`}
    >
      <Spinner size={13} className="text-accent" />
      {label}
    </span>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium ' +
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
    'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none';

  const variants = {
    primary:
      'bg-accent text-white shadow-card hover:bg-accent-deep hover:shadow-raise ' +
      'active:translate-y-px disabled:hover:bg-accent',
    secondary:
      'border border-rule bg-surface text-ink shadow-card ' +
      'hover:border-accent hover:text-accent active:translate-y-px',
    ghost: 'text-muted hover:bg-accent-soft hover:text-accent',
    danger:
      'border border-status-noshow/30 bg-surface text-status-noshow ' +
      'hover:bg-status-noshow hover:border-status-noshow hover:text-white',
  };

  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-sm',
  };

  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <Spinner size={size === 'sm' ? 13 : 15} strokeWidth={3} />}
      {children}
    </button>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-status-noshow">{error}</span>}
    </label>
  );
}

const CONTROL =
  'w-full rounded-md border border-rule bg-surface px-3 text-sm text-ink transition-colors ' +
  'placeholder:text-faint hover:border-faint/70 disabled:cursor-not-allowed disabled:bg-paper ' +
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15';

export function Input({ className = '', ...props }) {
  return <input className={`mt-1.5 py-2 ${CONTROL} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`mt-1.5 py-2 leading-relaxed ${CONTROL} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`mt-1.5 py-2 ${CONTROL} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-rule bg-surface shadow-card
                  transition-shadow hover:shadow-raise ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-rule-soft px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({ status }) {
  return (
    <span
      className="tint inline-flex items-center gap-1.5 whitespace-nowrap rounded-full
                 px-2 py-0.5 text-xs font-medium"
      style={{ '--tint-color': STATUS_COLOR[status] }}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function EmptyState({ title, hint, action, icon: Icon }) {
  return (
    <div className="animate-fade px-6 py-16 text-center">
      {Icon && (
        <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-paper text-faint">
          <Icon size={19} strokeWidth={1.75} />
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="tint animate-fade rounded-md border border-status-noshow/25 px-3 py-2 text-sm"
      style={{ '--tint-color': 'var(--color-status-noshow)' }}
    >
      {children}
    </p>
  );
}

export function Modal({ open, title, onClose, children, width = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return;

    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }

    // Stop the page behind the dialog from scrolling with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto
                 bg-ink/35 p-4 pt-16 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-rise w-full ${width} rounded-xl border border-rule bg-surface shadow-pop`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-rule-soft px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 rounded p-1 text-faint transition-colors hover:bg-paper hover:text-ink"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M1 1l12 12M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
