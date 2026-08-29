import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

patientSchema.index({ name: 1 });

export default mongoose.model('Patient', patientSchema);