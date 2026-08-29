import Appointment from '../models/Appointment.js';
import AlertDismissal from '../models/AlertDismissal.js';
import { RuleError } from './statusMachine.js';

const HOUR_MS = 60 * 60 * 1000;

export async function listAlerts(actor, { now = new Date() } = {}) {
  const horizon = new Date(now.getTime() + 24 * HOUR_MS);
  const finalHour = new Date(now.getTime() + HOUR_MS);

  const filter = {
    status: 'REQUESTED',
    archivedAt: null,
    startsAt: { $gt: now, $lte: horizon },
  };

  if (actor.role === 'PROVIDER') {
    filter.$or = [{ providerId: actor._id }, { 'careTeam.providerId': actor._id }];
  }

  const candidates = await Appointment.find(filter).sort({ startsAt: 1 }).lean();
  if (!candidates.length) return { items: [], count: 0 };

  const dismissals = await AlertDismissal.find({
    appointmentId: { $in: candidates.map((a) => a._id) },
  })
    .sort({ dismissedAt: -1 })
    .lean();

  const latest = new Map();
  for (const d of dismissals) {
    const key = d.appointmentId.toString();
    if (!latest.has(key)) latest.set(key, d);
  }

  const items = [];
  for (const appt of candidates) {
    const dismissal = latest.get(appt._id.toString());
    const inFinalHour = appt.startsAt <= finalHour;

    if (!dismissal) {
      items.push({ ...appt, urgent: inFinalHour, reappeared: false });
      continue;
    }

    const dismissedBeforeFinalHour =
      dismissal.dismissedAt < new Date(appt.startsAt.getTime() - HOUR_MS);

    if (inFinalHour && dismissedBeforeFinalHour) {
      items.push({ ...appt, urgent: true, reappeared: true });
    }
  }

  return { items, count: items.length };
}

export async function dismissAlert(appointmentId, actor) {
  if (actor.role !== 'FRONT_DESK') {
    throw new RuleError('Only front-desk staff can dismiss alerts.', 403);
  }

  const appt = await Appointment.findById(appointmentId);
  if (!appt) throw new RuleError('Appointment not found.', 404);
  if (appt.status !== 'REQUESTED') {
    throw new RuleError('That appointment is no longer unconfirmed.');
  }

  await AlertDismissal.create({
    appointmentId: appt._id,
    dismissedBy: actor._id,
    dismissedByName: actor.name,
  });

  return { ok: true };
}