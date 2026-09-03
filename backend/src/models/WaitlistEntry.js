import mongoose from 'mongoose';

export const WAITLIST_STATUSES = ['WAITING', 'PLACED', 'REMOVED'];

// Someone who wants a slot on a day that has none left. The entry is a
// standing request, not a booking: it holds no time and blocks nothing, and it
// stays WAITING until a slot frees up and the front desk places them into it.
//
// The patient is stored by name and number rather than as a Patient record.
// A waitlist entry may never turn into a visit, and a list of half-patients
// created by hopeful phone calls is worse than no list — the Patient is
// created at the moment of placement, by the same booking path as any other
// appointment.
const waitlistEntrySchema = new mongoose.Schema(
  {
    patientName: { type: String, required: true, trim: true },
    phone: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (value) => !value || /^\d{10}$/.test(value),
        message: 'A phone number must be exactly 10 digits.',
      },
    },

    // Null means "any provider will do", which is the answer that gets people
    // seen soonest and so is the default the form offers.
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    providerName: { type: String, default: null },

    // The window the patient can actually come in, held as local day bounds so
    // a slot anywhere on the last day still counts as inside it.
    preferredFrom: { type: Date, required: true },
    preferredTo: { type: Date, required: true },

    note: { type: String, trim: true, default: null },

    status: { type: String, enum: WAITLIST_STATUSES, default: 'WAITING', required: true },

    placedAppointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    placedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },

    addedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    addedByName: { type: String, required: true },
  },
  { timestamps: true }
);

// The day sheet asks the same question on every open slot — "is anyone waiting
// for this day?" — so the waiting entries are indexed by the window they cover.
waitlistEntrySchema.index({ status: 1, preferredFrom: 1, preferredTo: 1 });
waitlistEntrySchema.index({ status: 1, providerId: 1 });

export default mongoose.model('WaitlistEntry', waitlistEntrySchema);
