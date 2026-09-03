import WaitlistEntry from '../models/WaitlistEntry.js';
import Appointment from '../models/Appointment.js';
import User from '../models/User.js';
import { RuleError } from './statusMachine.js';
import { startOfLocalDay, endOfLocalDay } from '../utils/day.js';
import { bookSlot } from './appointment.service.js';

// The waitlist is a reception job from end to end: the desk takes the call,
// the desk watches for a cancellation, and the desk rings the patient back.
// A provider has no action to take on it, so the whole surface is front desk.
function assertFrontDesk(actor, action) {
  if (actor.role !== 'FRONT_DESK') {
    throw new RuleError(`Only front-desk staff can ${action}.`, 403);
  }
}

export async function addToWaitlist(input, actor) {
  assertFrontDesk(actor, 'add someone to the waitlist');

  const { patientName, phone, providerId, preferredFrom, preferredTo, note } = input;

  const from = startOfLocalDay(preferredFrom);
  const to = endOfLocalDay(preferredTo ?? preferredFrom);
  if (to < from) {
    throw new RuleError('The last day the patient can come in is before the first.');
  }

  let provider = null;
  if (providerId) {
    provider = await User.findById(providerId);
    if (!provider || provider.role !== 'PROVIDER') {
      throw new RuleError('That provider does not exist.', 400);
    }
  }

  return WaitlistEntry.create({
    patientName,
    phone: phone ?? null,
    providerId: provider?._id ?? null,
    providerName: provider?.name ?? null,
    preferredFrom: from,
    preferredTo: to,
    note: note ?? null,
    addedById: actor._id,
    addedByName: actor.name,
  });
}

// Waiting entries, oldest first — the list is a queue, and the person who rang
// on Monday is ahead of the person who rang on Tuesday.
//
// `date` narrows to the entries whose window covers that day, and `providerId`
// to the ones asking for that provider plus the ones happy with anybody: both
// are questions the day sheet asks of a single open slot.
export async function listWaitlist({ status = 'WAITING', date, providerId } = {}, actor) {
  assertFrontDesk(actor, 'view the waitlist');

  const filter = {};
  if (status !== 'ALL') filter.status = status;

  if (date) {
    filter.preferredFrom = { $lte: endOfLocalDay(date) };
    filter.preferredTo = { $gte: startOfLocalDay(date) };
  }

  if (providerId) {
    filter.$or = [{ providerId }, { providerId: null }];
  }

  const items = await WaitlistEntry.find(filter).sort({ createdAt: 1 }).lean();
  return { items, count: items.length };
}

export async function removeFromWaitlist(id, actor) {
  assertFrontDesk(actor, 'take someone off the waitlist');

  const entry = await WaitlistEntry.findById(id);
  if (!entry) throw new RuleError('That waitlist entry no longer exists.', 404);
  if (entry.status !== 'WAITING') {
    throw new RuleError('That entry is no longer waiting.');
  }

  entry.status = 'REMOVED';
  entry.removedAt = new Date();
  await entry.save();
  return entry;
}

// The point of the whole feature: a slot came free, and somebody on the list
// wanted exactly that. The booking itself goes through the ordinary path, so
// the status machine, the patient record and the audit trail all behave the
// way they do for a booking taken over the counter.
export async function placeFromWaitlist(id, { appointmentId }, actor) {
  assertFrontDesk(actor, 'place someone from the waitlist');

  const entry = await WaitlistEntry.findById(id);
  if (!entry) throw new RuleError('That waitlist entry no longer exists.', 404);
  if (entry.status !== 'WAITING') {
    throw new RuleError(
      entry.status === 'PLACED'
        ? `${entry.patientName} has already been given a slot.`
        : `${entry.patientName} has been taken off the waitlist.`
    );
  }

  const slot = await Appointment.findById(appointmentId);
  if (!slot) throw new RuleError('That slot no longer exists.', 404);
  if (slot.archivedAt) throw new RuleError('That slot has been archived.');
  if (slot.status !== 'OPEN') {
    throw new RuleError('That slot is no longer open — someone has taken it.', 409);
  }

  // Someone is being rung up and asked to come in. A slot earlier today has
  // already gone, and the list of open slots can be a few minutes old by the
  // time it is clicked — so the check is made here, at the moment it counts,
  // rather than trusting what was on screen.
  if (slot.startsAt <= new Date()) {
    throw new RuleError('That slot has already started. Choose a later one.');
  }

  // The entry is a promise to the patient about when and with whom. Placing
  // them outside it would be booking an appointment they did not agree to.
  if (slot.startsAt < entry.preferredFrom || slot.startsAt > entry.preferredTo) {
    throw new RuleError(`That day is outside the window ${entry.patientName} gave.`);
  }
  if (entry.providerId && entry.providerId.toString() !== slot.providerId.toString()) {
    throw new RuleError(`${entry.patientName} is waiting for ${entry.providerName}.`);
  }

  const appointment = await bookSlot(
    appointmentId,
    { patientName: entry.patientName, phone: entry.phone ?? undefined },
    actor
  );

  // Booking runs in its own transaction, so this second write can in principle
  // fail after the slot is taken. It fails in the safe direction: the entry
  // stays WAITING next to a booking that plainly exists, which reads as work
  // still to do. The reverse — an entry marked placed with nothing booked —
  // would quietly drop a patient off the list.
  entry.status = 'PLACED';
  entry.placedAppointmentId = appointment._id;
  entry.placedAt = new Date();
  await entry.save();

  return { entry, appointment };
}
