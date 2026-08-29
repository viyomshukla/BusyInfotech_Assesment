import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['FRONT_DESK', 'PROVIDER'];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true }
);

userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

export default mongoose.model('User', userSchema);