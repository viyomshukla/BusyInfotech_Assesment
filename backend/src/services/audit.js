import AppointmentEvent from '../models/AppointmentEvent.js';

export async function recordEvent(
  { appointmentId, actor, type, fromStatus = null, toStatus = null, detail = null },
  session
) {
  const [event] = await AppointmentEvent.create(
    [
      {
        appointmentId,
        actorId: actor._id,
        actorName: actor.name,
        type,
        fromStatus,
        toStatus,
        detail,
      },
    ],
    { session }
  );
  return event;
}