import mongoose from 'mongoose';

// Two different notes live on a visit, written by two different people for two
// different readers. A clinical note is the provider's record of what happened;
// a billing note is the front desk's record of what it costs. They are kept in
// one collection because they share an author, a timestamp and an appointment —
// and split by `kind` everywhere they are read, so neither shows up where the
// other belongs.
export const NOTE_KINDS = ['CLINICAL', 'BILLING'];

const visitNoteSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      index: true,
    },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    body: { type: String, required: true, trim: true },

    kind: { type: String, enum: NOTE_KINDS, default: 'CLINICAL', required: true },

    // Billing only. A note written before the split existed has neither, and a
    // clinical note never gets them — the route drops both unless the note is
    // a billing one.
    code: { type: String, trim: true, default: null },
    amount: { type: Number, min: 0, default: null },
  },
  { timestamps: true }
);

visitNoteSchema.index({ appointmentId: 1, createdAt: 1 });

export default mongoose.model('VisitNote', visitNoteSchema);
