import mongoose from 'mongoose';
import Appointment from '../models/Appointment.js';
import Patient from '../models/Patient.js';
import User from '../models/User.js';
import { RuleError, assertTransition } from './statusMachine.js';
import { recordEvent } from './audit.js';

function assertCanManage(user, providerId, action) {
  if (user.role === 'FRONT_DESK') return;
  if (user._id.toString() === providerId.toString()) return;
  throw new RuleError(`Providers can only ${action} on their own schedule.`, 403);
}

async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    if (err.code === 11000) {
      throw new RuleError('That provider already has a slot at exactly this time.', 409);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

async function loadOr404(id, session) {
  const appt = await Appointment.findById(id).session(session ?? null);
  if (!appt) throw new RuleError('Appointment not found.', 404);
  return appt;
}

export async function findOverlap({ providerId, startsAt, endsAt, excludeId = null }, session) {
  const query = {
    providerId,
    archivedAt: null,
    status: { $ne: 'CANCELLED' },
    startsAt: { $lt: endsAt },
    endsAt: { $gt: startsAt },
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Appointment.findOne(query).session(session ?? null);
}

export async function createSlot({ providerId, startsAt, durationMin }, actor) {
  assertCanManage(actor, providerId, 'create slots');

  const provider = await User.findById(providerId);
  if (!provider || provider.role !== 'PROVIDER') {
    throw new RuleError('That provider does not exist.', 400);
  }

  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMin * 60000);

  const clash = await findOverlap({ providerId, startsAt: start, endsAt: end });
  if (clash) {
    throw new RuleError(
      `That time overlaps an existing slot starting at ${clash.startsAt.toISOString()}.`,
      409
    );
  }

  return withTransaction(async (session) => {
    const [appt] = await Appointment.create(
      [
        {
          providerId,
          providerName: provider.name,
          startsAt: start,
          endsAt: end,
          durationMin,
          status: 'OPEN',
        },
      ],
      { session }
    );
    await recordEvent(
      { appointmentId: appt._id, actor, type: 'CREATED', toStatus: 'OPEN' },
      session
    );
    return appt;
  });
}

export async function updateSlot(id, { startsAt, durationMin }, actor) {
  return withTransaction(async (session) => {
    const appt = await loadOr404(id, session);
    assertCanManage(actor, appt.providerId, 'edit slots');

    if (appt.status !== 'OPEN') {
      throw new RuleError(
        `This slot has already been booked (${appt.status}) and can no longer be edited.`
      );
    }

    const start = startsAt ? new Date(startsAt) : appt.startsAt;
    const mins = durationMin ?? appt.durationMin;
    const end = new Date(start.getTime() + mins * 60000);

    const clash = await findOverlap(
      { providerId: appt.providerId, startsAt: start, endsAt: end, excludeId: appt._id },
      session
    );
    if (clash) throw new RuleError('That time overlaps another slot for this provider.', 409);

    appt.startsAt = start;
    appt.endsAt = end;
    appt.durationMin = mins;
    await appt.save({ session });
    return appt;
  });
}

export async function bookSlot(id, { patientId, patientName, phone }, actor) {
  return withTransaction(async (session) => {
    const appt = await loadOr404(id, session);
    assertCanManage(actor, appt.providerId, 'book appointments');

    let patient;
    if (patientId) {
      patient = await Patient.findById(patientId).session(session);
      if (!patient) throw new RuleError('That patient does not exist.', 400);
    } else {
      [patient] = await Patient.create([{ name: patientName, phone }], { session });
    }

    assertTransition(appt, 'REQUESTED');

    appt.status = 'REQUESTED';
    appt.patientId = patient._id;
    appt.patientName = patient.name;
    await appt.save({ session });

    await recordEvent(
      {
        appointmentId: appt._id,
        actor,
        type: 'STATUS_CHANGED',
        fromStatus: 'OPEN',
        toStatus: 'REQUESTED',
        detail: { patientName: patient.name },
      },
      session
    );
    return appt;
  });
}

export async function changeStatus(id, { to, reason }, actor) {
  return withTransaction(async (session) => {
    const appt = await loadOr404(id, session);
    assertCanManage(actor, appt.providerId, 'change appointments');

    assertTransition(appt, to, { reason });

    const from = appt.status;
    appt.status = to;
    if (to === 'CANCELLED') {
      appt.cancelReason = reason.trim();
      appt.cancelledAt = new Date();
    }
    await appt.save({ session });

    await recordEvent(
      {
        appointmentId: appt._id,
        actor,
        type: to === 'CANCELLED' ? 'CANCELLED' : 'STATUS_CHANGED',
        fromStatus: from,
        toStatus: to,
        detail: to === 'CANCELLED' ? { reason: appt.cancelReason } : null,
      },
      session
    );
    return appt;
  });
}

export async function reassignProvider(id, { providerId }, actor) {
  if (actor.role !== 'FRONT_DESK') {
    throw new RuleError('Only front-desk staff can reassign an appointment.', 403);
  }

  return withTransaction(async (session) => {
    const appt = await loadOr404(id, session);

    if (appt.providerId.toString() === providerId) {
      throw new RuleError('That is already the scheduling provider.');
    }

    const provider = await User.findById(providerId).session(session);
    if (!provider || provider.role !== 'PROVIDER') {
      throw new RuleError('That provider does not exist.', 400);
    }

    const clash = await findOverlap(
      {
        providerId,
        startsAt: appt.startsAt,
        endsAt: appt.endsAt,
        excludeId: appt._id,
      },
      session
    );
    if (clash) throw new RuleError('That provider is already booked at this time.', 409);

    const previous = { id: appt.providerId.toString(), name: appt.providerName };
    appt.providerId = provider._id;
    appt.providerName = provider.name;
    await appt.save({ session });

    await recordEvent(
      {
        appointmentId: appt._id,
        actor,
        type: 'PROVIDER_REASSIGNED',
        detail: { from: previous, to: { id: provider._id.toString(), name: provider.name } },
      },
      session
    );
    return appt;
  });
}

export async function setArchived(id, archived, actor) {
  return withTransaction(async (session) => {
    const appt = await loadOr404(id, session);
    assertCanManage(actor, appt.providerId, 'archive slots');

    appt.archivedAt = archived ? new Date() : null;
    await appt.save({ session });

    await recordEvent(
      { appointmentId: appt._id, actor, type: archived ? 'ARCHIVED' : 'RESTORED' },
      session
    );
    return appt;
  });
}