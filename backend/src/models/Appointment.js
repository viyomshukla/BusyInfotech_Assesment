import mongoose from 'mongoose';

export const STATUSES = [
  'OPEN',
  'REQUESTED',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
];

const careTeamSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false }
);

const appointmentSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    providerName: { type: String, required: true },

    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    patientName: { type: String, default: null },

    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    durationMin: { type: Number, required: true, min: 5 },

    status: { type: String, enum: STATUSES, default: 'OPEN', required: true },

    cancelReason: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },

    careTeam: { type: [careTeamSchema], default: [] },
  },
  { timestamps: true }
);

appointmentSchema.index({ providerId: 1, startsAt: 1 });
appointmentSchema.index({ status: 1, startsAt: 1 });
appointmentSchema.index({ startsAt: 1 });
appointmentSchema.index({ 'careTeam.providerId': 1 });
appointmentSchema.index({ patientName: 1 });

appointmentSchema.index(
  { providerId: 1, startsAt: 1 },
  {
    unique: true,
    partialFilterExpression: { archivedAt: null },
    name: 'uniq_provider_slot_active',
  }
);

export default mongoose.model('Appointment', appointmentSchema);