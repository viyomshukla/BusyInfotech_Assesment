import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';


// A clock face you point at, rather than the browser's list of hours and
// minutes. The clinic runs on a 24-hour sheet, so the hour dial carries two
// rings — 1–12 outside, 13–23 and midnight inside — the way a 24-hour dial has
// always been drawn. Minutes and seconds share one 60-step ring.
const SIZE = 248;
const CENTRE = SIZE / 2;
const R_OUTER = 96;
const R_INNER = 57;
const KNOB = 15;

const MODES = ['h', 'm', 's'];

export function TimePicker({
  value,
  onChange,
  withSeconds = false,
  ariaLabel = 'Time',
  className = '',
  disabled = false,
  dense = false,
}) {
  const parts = parse(value);
  const modes = withSeconds ? MODES : MODES.slice(0, 2);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('h');
  const [box, setBox] = useState(null);

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  // Rendered into the body: the pickers sit inside modals and inside panels
  // that clip their overflow, and a dial cut in half is worse than no dial.
  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const height = popoverRef.current?.offsetHeight ?? 360;
      const width = popoverRef.current?.offsetWidth ?? 280;
      const below = window.innerHeight - rect.bottom;

      setBox({
        top: below > height + 12 || rect.top < height + 12
          ? Math.min(rect.bottom + 6, window.innerHeight - height - 8)
          : rect.top - height - 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    }

    function onPointerDown(e) {
      if (popoverRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    }

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  function commit(next) {
    onChange(format(next, withSeconds));
  }

  function setPart(part, n) {
    commit({ ...parts, [part]: n });
  }

  // Arrow keys move the selected segment, so the dial is never the only way in.
  function onKeyDown(e) {
    const step = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;

    if (step) {
      e.preventDefault();
      const max = mode === 'h' ? 24 : 60;
      setPart(mode, (parts[mode] + step + max) % max);
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const i = modes.indexOf(mode);
      setMode(modes[(i + (e.key === 'ArrowRight' ? 1 : modes.length - 1)) % modes.length]);
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setMode('h');
          setOpen((o) => !o);
        }}
        className={`${dense ? '' : 'mt-1.5'} flex w-full items-center justify-between gap-2 rounded-md border
                    border-rule bg-surface px-3 py-2 text-sm text-ink transition-colors
                    hover:border-faint/70 disabled:cursor-not-allowed disabled:bg-paper
                    focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15
                    ${open ? 'border-accent ring-2 ring-accent/15' : ''} ${className}`}
      >
        <span className="tabular">{format(parts, withSeconds)}</span>
        <Clock size={15} strokeWidth={1.75} className={open ? 'text-accent' : 'text-faint'} />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={`${ariaLabel} — pick on the clock`}
            onKeyDown={onKeyDown}
            tabIndex={-1}
            style={{ top: box?.top ?? -9999, left: box?.left ?? -9999 }}
            className="animate-rise fixed z-50 w-70 rounded-xl border border-rule bg-surface p-4 shadow-pop"
          >
            <div className="flex items-center justify-center gap-1">
              {modes.map((part, i) => (
                <span key={part} className="flex items-center">
                  {i > 0 && <span className="px-1 text-lg text-faint">:</span>}
                  <button
                    type="button"
                    onClick={() => setMode(part)}
                    aria-pressed={mode === part}
                    aria-label={{ h: 'Hours', m: 'Minutes', s: 'Seconds' }[part]}
                    className={`tabular rounded-lg px-2.5 py-1 text-2xl font-semibold leading-none
                                transition-colors ${
                                  mode === part
                                    ? 'bg-accent-soft text-accent'
                                    : 'text-muted hover:text-ink'
                                }`}
                  >
                    {pad(parts[part])}
                  </button>
                </span>
              ))}
            </div>

            <p className="mt-1 text-center text-[11px] text-faint">
              {{ h: 'Pick the hour', m: 'Pick the minutes', s: 'Pick the seconds' }[mode]}
            </p>

            <Dial
              mode={mode}
              parts={parts}
              onPick={(n) => setPart(mode, n)}
              onSettle={() => {
                const i = modes.indexOf(mode);
                if (i < modes.length - 1) setMode(modes[i + 1]);
                else setOpen(false);
              }}
            />

            <div className="mt-3 flex items-center justify-between border-t border-rule-soft pt-3">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  commit({ h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() });
                }}
                className="text-xs text-muted transition-colors hover:text-accent"
              >
                Now
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white
                           transition-colors hover:bg-accent-deep"
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function Dial({ mode, parts, onPick, onSettle }) {
  const svgRef = useRef(null);
  const dragging = useRef(false);

  const selected = parts[mode];
  const hand = handPosition(mode, selected);

  function valueAt(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE - CENTRE;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE - CENTRE;

    // Screen coordinates run clockwise from twelve o'clock, which is a quarter
    // turn from where atan2 starts.
    const degrees = (Math.atan2(y, x) * 180) / Math.PI + 90;
    const clockwise = (degrees + 360) % 360;

    if (mode !== 'h') return Math.round(clockwise / 6) % 60;

    const index = Math.round(clockwise / 30) % 12;
    const inner = Math.hypot(x, y) < (R_OUTER + R_INNER) / 2;
    if (inner) return index === 0 ? 0 : index + 12;
    return index === 0 ? 12 : index;
  }

  function onPointerDown(e) {
    dragging.current = true;
    svgRef.current.setPointerCapture(e.pointerId);
    onPick(valueAt(e));
  }

  function onPointerMove(e) {
    if (!dragging.current) return;
    onPick(valueAt(e));
  }

  function onPointerUp(e) {
    if (!dragging.current) return;
    dragging.current = false;
    svgRef.current.releasePointerCapture(e.pointerId);
    onSettle();
  }

  const ticks = mode === 'h' ? null : Array.from({ length: 60 }, (_, i) => i);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="mt-2 w-full touch-none select-none rounded-full outline-offset-4"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="slider"
      tabIndex={0}
      aria-label={{ h: 'Hours', m: 'Minutes', s: 'Seconds' }[mode]}
      aria-valuemin={0}
      aria-valuemax={mode === 'h' ? 23 : 59}
      aria-valuenow={selected}
      aria-valuetext={pad(selected)}
    >
      <circle cx={CENTRE} cy={CENTRE} r={CENTRE - 4} fill="var(--color-surface-sunk)" />

      {/* Minute and second ticks: the fine detail that makes a face read as a
          clock rather than a ring of numbers. */}
      {ticks?.map((i) => {
        const on5 = i % 5 === 0;
        const outer = pointOn(R_OUTER + 14, i / 60);
        const inner = pointOn(R_OUTER + (on5 ? 9 : 11), i / 60);
        return (
          <line
            key={i}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke={on5 ? 'var(--color-faint)' : 'var(--color-rule)'}
            strokeWidth={on5 ? 1.5 : 1}
            strokeLinecap="round"
          />
        );
      })}

      <line
        x1={CENTRE}
        y1={CENTRE}
        x2={hand.x}
        y2={hand.y}
        stroke="var(--color-accent)"
        strokeWidth={2}
      />
      <circle cx={hand.x} cy={hand.y} r={KNOB} fill="var(--color-accent)" />
      <circle cx={CENTRE} cy={CENTRE} r={3.5} fill="var(--color-accent)" />

      {mode === 'h'
        ? [
            ...range(1, 12).map((h) => ({ label: pad(h), value: h, radius: R_OUTER })),
            ...[0, ...range(13, 23)].map((h) => ({
              label: pad(h),
              value: h,
              radius: R_INNER,
            })),
          ].map(({ label, value, radius }) => (
            <Label
              key={value}
              label={label}
              point={pointOn(radius, (value % 12) / 12)}
              active={selected === value}
              small={radius === R_INNER}
            />
          ))
        : range(0, 11).map((i) => (
            <Label
              key={i}
              label={pad(i * 5)}
              point={pointOn(R_OUTER, i / 12)}
              active={Math.round(selected / 5) === i && selected % 5 === 0}
            />
          ))}
    </svg>
  );
}

function Label({ label, point, active, small = false }) {
  return (
    <text
      x={point.x}
      y={point.y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={small ? 11 : 13}
      fontFamily="'IBM Plex Mono', ui-monospace, monospace"
      fontWeight={active ? 600 : 400}
      fill={active ? '#ffffff' : small ? 'var(--color-muted)' : 'var(--color-ink)'}
      pointerEvents="none"
    >
      {label}
    </text>
  );
}

// --- geometry ---------------------------------------------------------------

function pointOn(radius, fraction) {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;
  return { x: CENTRE + radius * Math.cos(angle), y: CENTRE + radius * Math.sin(angle) };
}

function handPosition(mode, value) {
  if (mode !== 'h') return pointOn(R_OUTER, value / 60);
  const radius = value === 0 || value > 12 ? R_INNER : R_OUTER;
  return pointOn(radius, (value % 12) / 12);
}

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// --- value ------------------------------------------------------------------

function clamp(n, max) {
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), max) : 0;
}

function parse(value) {
  const [h, m, s] = String(value ?? '').split(':').map(Number);
  return { h: clamp(h, 23), m: clamp(m, 59), s: clamp(s, 59) };
}

function format({ h, m, s }, withSeconds) {
  return withSeconds ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}
