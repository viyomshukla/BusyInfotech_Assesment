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