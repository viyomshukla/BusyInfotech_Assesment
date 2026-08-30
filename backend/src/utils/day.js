import { startOfDay, endOfDay } from 'date-fns';

const DATE_ONLY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

// A 'YYYY-MM-DD' from the browser means a calendar day at the clinic, not the
// instant of UTC midnight. Parsing it from its parts keeps the day from sliding
// either side of the date line for anyone not sitting on UTC.
export function toLocalDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

export function startOfLocalDay(value) {
  return startOfDay(toLocalDate(value));
}

export function endOfLocalDay(value) {
  return endOfDay(toLocalDate(value));
}
