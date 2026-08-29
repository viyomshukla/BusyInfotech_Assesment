import mongoose from 'mongoose';

export const EVENT_TYPES = [
  'CREATED',
  'STATUS_CHANGED',
  'CANCELLED',
  'PROVIDER_REASSIGNED',
  'SUPPORT_ADDED',
  'SUPPORT_REMOVED',
  'NOTE_ADDED',
  'ARCHIVED',
  'RESTORED',
];

const eventSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true,
    index: true,
  },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true },
  type: { type: String, enum: EVENT_TYPES, required: true },
  fromStatus: { type: String, default: null },
  toStatus: { type: String, default: null },
  detail: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now, immutable: true },
});

const BLOCKED = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];

BLOCKED.forEach((op) => {
  eventSchema.pre(op, function () {
    throw new Error('Appointment events are append-only');
  });
});

eventSchema.index({ appointmentId: 1, createdAt: 1 });

export default mongoose.model('AppointmentEvent', eventSchema);