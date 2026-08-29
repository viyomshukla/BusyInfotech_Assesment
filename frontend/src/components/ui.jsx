import { STATUS_LABEL, STATUS_COLOR } from '../lib/format';

export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors ' +
    'disabled:cursor-not-allowed disabled:opacity-45';

  const variants = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    secondary: 'border border-rule bg-surface text-ink hover:border-accent hover:text-accent',
    ghost: 'text-muted hover:bg-accent-soft hover:text-accent',
    danger: 'border border-status-noshow/30 text-status-noshow hover:bg-status-noshow/5',
  };

  const sizes = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3.5 py-2 text-sm',
  };

  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-status-noshow">{error}</span>}
    </label>
  );
}

export function Input({ className = '', ...props }) {
  return (
    <input
      className={`mt-1.5 w-full rounded border border-rule bg-surface px-3 py-2 text-sm
                  placeholder:text-muted/60 focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={`mt-1.5 w-full rounded border border-rule bg-surface px-3 py-2 text-sm leading-relaxed
                  placeholder:text-muted/60 focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`mt-1.5 w-full rounded border border-rule bg-surface px-3 py-2 text-sm
                  focus:border-accent focus:outline-none ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-rule bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({ status }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
      />
      <span style={{ color: STATUS_COLOR[status] }}>{STATUS_LABEL[status] ?? status}</span>
    </span>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="px-6 py-14 text-center text-sm text-muted">{label}</div>;
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded border border-status-noshow/25 bg-status-noshow/5 px-3 py-2
                 text-sm text-status-noshow"
    >
      {children}
    </p>
  );
}

export function Modal({ open, title, onClose, children, width = 'max-w-md' }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 p-4 pt-16"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${width} rounded-lg border border-rule bg-surface shadow-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-rule px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted transition-colors hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}