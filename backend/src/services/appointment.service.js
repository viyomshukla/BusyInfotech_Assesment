import mongoose from 'mongoose';
import Appointment from '../models/Appointment.js';
import Patient from '../models/Patient.js';
import User from '../models/User.js';
import { RuleError, assertTransition } from './statusMachine.js';
import { recordEvent } from './audit.js';
import VisitNote from '../models/VisitNote.js';
import { addDays, startOfDay } from 'date-fns';
import { startOfLocalDay } from '../utils/day.js';
import AppointmentEvent from '../models/AppointmentEvent.js';
function assertCanManage(user, providerId, action) {
  if (user.role === 'FRONT_DESK') return;
  if (user._id.toString() === providerId.toString()) return;
  throw new RuleError(`Providers can only ${action} on their own schedule.`, 403);
}

// The care team is stored as ids alone, which is right for the record but
// useless to a day sheet that has to print "supported by Dr Shukla" next to a
// patient. Names are resolved in one lookup per response rather than a populate
// per row — a full day is a few dozen appointments across a handful of staff.
export async function attachCareTeamNames(docs) {
  const list = Array.isArray(docs) ? docs : [docs];

  const ids = new Set();
  for (const appt of list) {
    for (const member of appt?.careTeam ?? []) ids.add(member.providerId.toString());
  }
  if (!ids.size) return docs;

  const users = await User.find({ _id: { $in: [...ids] } }).select('name').lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u.name]));

  for (const appt of list) {
    if (!appt?.careTeam?.length) continue;
    appt.careTeam = appt.careTeam.map((member) => ({
      ...member,
      providerName: byId.get(member.providerId.toString()) ?? 'Former staff member',
    }));
  }

  return docs;
}

const SORT_FIELDS = {
  date: 'startsAt',
  status: 'status',
  provider: 'providerName',
};

export async function listAppointments(query, actor) {
  const {
    q,
    providerId,
    status,
    from,
    to,
    sort = 'date',
    dir = 'asc',
    page = 1,
    limit = 20,
    includeArchived = false,
  } = query;

  const filter = {};

  if (actor.role === 'PROVIDER') {
    filter.$or = [{ providerId: actor._id }, { 'careTeam.providerId': actor._id }];
  } else if (providerId) {
    filter.providerId = providerId;
  }

  if (actor.role === 'PROVIDER' && providerId && providerId !== actor._id.toString()) {
    throw new RuleError('Providers can only view their own appointments.', 403);
  }

  if (status) {
    filter.status = Array.isArray(status) ? { $in: status } : status;
  }

  if (from || to) {
    filter.startsAt = {};
    if (from) filter.startsAt.$gte = new Date(from);
    if (to) filter.startsAt.$lte = new Date(to);
  }

  if (!includeArchived) filter.archivedAt = null;

  if (q && q.trim()) {
    filter.patientName = { $regex: escapeRegex(q.trim()), $options: 'i' };
  }

  const sortField = SORT_FIELDS[sort] ?? 'startsAt';
  const sortSpec = { [sortField]: dir === 'desc' ? -1 : 1 };
  if (sortField !== 'startsAt') sortSpec.startsAt = 1;

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Appointment.find(filter).sort(sortSpec).skip(skip).limit(limit).lean(),
    Appointment.countDocuments(filter),
  ]);

  await attachCareTeamNames(items);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export async function generateSlots(input, actor) {
  const { providerId, from, to, weekdays, blocks } = input;

  if (actor.role !== 'FRONT_DESK') {
    throw new RuleError('Only front-desk staff can bulk-generate availability.', 403);
  }

  const provider = await User.findById(providerId);
  if (!provider || provider.role !== 'PROVIDER') {
    throw new RuleError('That provider does not exist.', 400);
  }

  const start = startOfDay(new Date(from));
  const end = startOfDay(new Date(to));
  if (end < start) throw new RuleError('The end date is before the start date.');

  const candidates = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (!weekdays.includes(day.getDay())) continue;

    for (const block of blocks) {
      // A block start may carry seconds now that the time is picked off a clock.
      const [hour, minute, second = 0] = block.startTime.split(':').map(Number);
      const startsAt = new Date(day);
      startsAt.setHours(hour, minute, second, 0);

      candidates.push({
        startsAt,
        endsAt: new Date(startsAt.getTime() + block.durationMin * 60000),
        durationMin: block.durationMin,
      });
    }
  }

  if (!candidates.length) {
    throw new RuleError('That pattern produces no slots in the given date range.');
  }
  if (candidates.length > 500) {
    throw new RuleError(
      `That pattern would create ${candidates.length} slots. Narrow the range — the limit is 500.`
    );
  }

  const rangeStart = candidates[0].startsAt;
  const rangeEnd = candidates[candidates.length - 1].endsAt;

  const existing = await Appointment.find({
    providerId,
    archivedAt: null,
    status: { $ne: 'CANCELLED' },
    startsAt: { $lt: rangeEnd },
    endsAt: { $gt: rangeStart },
  })
    .select('startsAt endsAt status patientName')
    .lean();

  const created = [];
  const skipped = [];

  for (const candidate of candidates) {
    const clash = existing.find(
      (e) => e.startsAt < candidate.endsAt && e.endsAt > candidate.startsAt
    );

    if (clash) {
      skipped.push({
        startsAt: candidate.startsAt,
        reason: clash.status === 'OPEN' ? 'A slot already exists at this time' : 'Collides with an existing booking',
        conflictWith: {
          startsAt: clash.startsAt,
          status: clash.status,
          patientName: clash.patientName ?? null,
        },
      });
      continue;
    }

    created.push({
      providerId,
      providerName: provider.name,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      durationMin: candidate.durationMin,
      status: 'OPEN',
    });

    existing.push({ startsAt: candidate.startsAt, endsAt: candidate.endsAt, status: 'OPEN' });
  }

  let inserted = [];
  if (created.length) {
    inserted = await Appointment.insertMany(created, { ordered: false });
    await AppointmentEvent.insertMany(
      inserted.map((a) => ({
        appointmentId: a._id,
        actorId: actor._id,
        actorName: actor.name,
        type: 'CREATED',
        toStatus: 'OPEN',
        detail: { source: 'bulk' },
      }))
    );
  }

  return {
    requested: candidates.length,
    createdCount: inserted.length,
    skippedCount: skipped.length,
    created: inserted.map((a) => ({ id: a._id, startsAt: a.startsAt, durationMin: a.durationMin })),
    skipped,
  };
}

export async function getDaySchedule(dateStr, providerId, actor) {
  const dayStart = startOfLocalDay(dateStr);
  const dayEnd = addDays(dayStart, 1);

  const filter = { startsAt: { $gte: dayStart, $lt: dayEnd }, archivedAt: null };

  if (actor.role === 'PROVIDER') {
    filter.$or = [{ providerId: actor._id }, { 'careTeam.providerId': actor._id }];
  } else if (providerId) {
    filter.providerId = providerId;
  }

  const rows = await Appointment.find(filter).sort({ startsAt: 1, providerName: 1 }).lean();
  return attachCareTeamNames(rows);
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
export async function addNote(appointmentId, { body }, actor) {
  return withTransaction(async (session) => {
    const appt = await loadOr404(appointmentId, session);

    if (actor.role !== 'PROVIDER') {
      throw new RuleError('Only providers can write visit notes.', 403);
    }

    const onCareTeam = appt.careTeam.some(
      (m) => m.providerId.toString() === actor._id.toString()
    );
    const isScheduling = appt.providerId.toString() === actor._id.toString();
    if (!isScheduling && !onCareTeam) {
      throw new RuleError('You are not on this appointment.', 403);
    }

    const [note] = await VisitNote.create(
      [{ appointmentId: appt._id, authorId: actor._id, authorName: actor.name, body }],
      { session }
    );

    await recordEvent(
      {
        appointmentId: appt._id,
        actor,
        type: 'NOTE_ADDED',
        detail: { noteId: note._id.toString() },
      },
      session
    );

    return note;
  });
}

export async function editNote(noteId, { body }, actor) {
  const note = await VisitNote.findById(noteId);
  if (!note) throw new RuleError('Visit note not found.', 404);

  if (note.authorId.toString() !== actor._id.toString()) {
    throw new RuleError('You can only edit visit notes you wrote.', 403);
  }

  note.body = body;
  await note.save();
  return note;
}

export async function addSupportingProvider(appointmentId, { providerId }, actor) {
  return withTransaction(async (session) => {
    const appt = await loadOr404(appointmentId, session);
    assertCanManage(actor, appt.providerId, 'change the care team');

    if (appt.providerId.toString() === providerId) {
      throw new RuleError('That provider is already the scheduling provider.');
    }
    if (appt.careTeam.some((m) => m.providerId.toString() === providerId)) {
      throw new RuleError('That provider is already on the care team.');
    }

    const provider = await User.findById(providerId).session(session);
    if (!provider || provider.role !== 'PROVIDER') {
      throw new RuleError('That provider does not exist.', 400);
    }

    appt.careTeam.push({ providerId: provider._id, assignedBy: actor._id });
    await appt.save({ session });

    await recordEvent(
      {
        appointmentId: appt._id,
        actor,
        type: 'SUPPORT_ADDED',
        detail: { providerId: provider._id.toString(), providerName: provider.name },
      },
      session
    );

    return appt;
  });
}

export async function removeSupportingProvider(appointmentId, providerId, actor) {
  return withTransaction(async (session) => {
    const appt = await loadOr404(appointmentId, session);
    assertCanManage(actor, appt.providerId, 'change the care team');

    const member = appt.careTeam.find((m) => m.providerId.toString() === providerId);
    if (!member) throw new RuleError('That provider is not on the care team.', 404);

    const removed = await User.findById(providerId).session(session);

    appt.careTeam = appt.careTeam.filter((m) => m.providerId.toString() !== providerId);
    await appt.save({ session });

    await recordEvent(
      {
        appointmentId: appt._id,
        actor,
        type: 'SUPPORT_REMOVED',
        detail: { providerId, providerName: removed?.name ?? 'Unknown' },
      },
      session
    );

    return appt;
  });
}

export async function listMySchedule(actor, { includeArchived = false } = {}) {
  if (actor.role !== 'PROVIDER') {
    throw new RuleError('This view is for providers.', 403);
  }

  const query = {
    $or: [{ providerId: actor._id }, { 'careTeam.providerId': actor._id }],
  };
  if (!includeArchived) query.archivedAt = null;

  return Appointment.find(query).sort({ startsAt: 1 });
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