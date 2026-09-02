import { format, isToday, isTomorrow, formatDistanceToNowStrict } from 'date-fns';

export function time(value) {
  return format(new Date(value), 'HH:mm');
}

export function dayLabel(value) {
  const d = new Date(value);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE d MMM');
}

export function fullDate(value) {
  return format(new Date(value), 'EEEE d MMMM yyyy');
}

export function dateTime(value) {
  return format(new Date(value), 'd MMM yyyy, HH:mm');
}

export function untilNow(value) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function toInputDate(value = new Date()) {
  return format(new Date(value), 'yyyy-MM-dd');
}

export const STATUS_LABEL = {
  OPEN: 'Open',
  REQUESTED: 'Requested',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  COMPLETED: 'Completed',
  NO_SHOW: 'No show',
  CANCELLED: 'Cancelled',
};

export const STATUS_COLOR = {
  OPEN: 'var(--color-status-open)',
  REQUESTED: 'var(--color-status-requested)',
  CONFIRMED: 'var(--color-status-confirmed)',
  CHECKED_IN: 'var(--color-status-checkedin)',
  COMPLETED: 'var(--color-status-completed)',
  NO_SHOW: 'var(--color-status-noshow)',
  CANCELLED: 'var(--color-status-cancelled)',
};
// The value a clock picker holds: seconds included, because the picker can set
// them and dropping them silently would move the appointment.
export function timeInput(value) {
  return format(new Date(value), 'HH:mm:ss');
}

// Build an instant from a yyyy-MM-dd and an HH:mm or HH:mm:ss, in the clinic's
// own timezone — the browser's, which is the one the day sheet is drawn in.
export function toIso(dateStr, timeStr) {
  const [h = 0, m = 0, s = 0] = String(timeStr).split(':').map(Number);
  const at = new Date(`${dateStr}T00:00:00`);
  at.setHours(h, m, s, 0);
  return at.toISOString();
}
