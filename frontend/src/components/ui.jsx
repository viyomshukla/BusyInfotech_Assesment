import { useEffect } from 'react';
import { STATUS_LABEL, STATUS_COLOR } from '../lib/format';

export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium ' +
    'transition-[background-color,border-color,color,box-shadow] duration-150 ' +
    'disabled:cursor-not-allowed disabled:opacity-45';

  const variants = {
    primary:
      'bg-accent text-white shadow-card hover:bg-accent-deep active:translate-y-px',
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
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
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
  'placeholder:text-faint hover:border-faint/70 ' +
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
      className={`overflow-hidden rounded-xl border border-rule bg-surface shadow-card ${className}`}
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
    <div className="px-6 py-16 text-center">
      {Icon && (
        <span className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-paper text-faint">
          <Icon size={18} strokeWidth={1.75} />
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse-soft rounded bg-rule-soft ${className}`} />;
}

export function Loading({ label = 'Loading…', rows = 3 }) {
  return (
    <div className="space-y-3 p-5" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-3 w-20 shrink-0" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16 shrink-0" />
        </div>
      ))}
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
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
