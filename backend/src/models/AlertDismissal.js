import mongoose from 'mongoose';

const dismissalSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true,
  },
  dismissedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dismissedByName: { type: String, required: true },
  dismissedAt: { type: Date, default: Date.now },
});

dismissalSchema.index({ appointmentId: 1, dismissedAt: -1 });

export default mongoose.model('AlertDismissal', dismissalSchema);