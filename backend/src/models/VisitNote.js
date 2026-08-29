import mongoose from 'mongoose';

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
  },
  { timestamps: true }
);

visitNoteSchema.index({ appointmentId: 1, createdAt: 1 });

export default mongoose.model('VisitNote', visitNoteSchema);