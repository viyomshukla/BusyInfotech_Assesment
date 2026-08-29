export const TRANSITIONS = {
  OPEN: ['REQUESTED', 'CANCELLED'],
  REQUESTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'NO_SHOW', 'CANCELLED'],
  CHECKED_IN: ['COMPLETED'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

export class RuleError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

export function assertTransition(appointment, to, { now = new Date(), reason } = {}) {
  const from = appointment.status;

  if (from === to) {
    throw new RuleError(`Appointment is already ${to}.`);
  }

  if (to === 'CANCELLED' && ['CHECKED_IN', 'COMPLETED'].includes(from)) {
    const why =
      from === 'CHECKED_IN'
        ? 'the patient has already checked in'
        : 'the visit is already completed';
    throw new RuleError(`This appointment can no longer be cancelled — ${why}.`);
  }

  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    const options = allowed.length ? allowed.join(', ') : 'nothing — this is a final state';
    throw new RuleError(
      `Cannot move an appointment from ${from} to ${to}. Allowed from ${from}: ${options}.`
    );
  }

  if (to === 'NO_SHOW' && appointment.startsAt > now) {
    throw new RuleError(
      'An appointment can only be marked No Show after its scheduled time has passed.'
    );
  }

  if (to === 'CANCELLED' && (!reason || !reason.trim())) {
    throw new RuleError('Cancelling an appointment requires a reason.');
  }
}