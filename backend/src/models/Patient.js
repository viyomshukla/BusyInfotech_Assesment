import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Optional, but stored only in the one shape the app accepts. The route
    // strips the formatting first; this is the backstop for anything else that
    // writes a patient.
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: (value) => !value || /^\d{10}$/.test(value),
        message: 'A phone number must be exactly 10 digits.',
      },
    },
    email: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

patientSchema.index({ name: 1 });

export default mongoose.model('Patient', patientSchema);