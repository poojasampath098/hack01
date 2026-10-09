import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },
    passwordHash: { type: String, required: true },
    accountType: {
      type: String,
      enum: ['Creator', 'Brand', 'Admin'],
      default: 'Creator',
    },
    // For creator accounts – links to Creator doc
    creatorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Creator', default: null },
    // For brand accounts
    company: { type: String, trim: true, default: '' },
    avatar: { type: String, default: '' },
    verified: { type: Boolean, default: false },
    credits: { type: Number, default: 0 },
    preferences: {
      notifications: { type: Boolean, default: true },
      newsletter: { type: Boolean, default: false },
    },
    lastLoginAt: { type: Date, default: null },
    refreshToken: { type: String, default: null },
  },
  { timestamps: true }
)

// Never leak the password hash
userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject()
  delete obj.passwordHash
  delete obj.refreshToken
  return obj
}

export const User = mongoose.models.User || mongoose.model('User', userSchema)
