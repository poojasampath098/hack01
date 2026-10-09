import mongoose from 'mongoose'

const PortfolioItemSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => `port-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
    id: { type: String },
    title: { type: String, required: true, trim: true },
    type: { type: String, default: 'Brand film' },
    mediaUrl: { type: String, default: '' },
    thumbUrl: { type: String, default: '' },
    gradient: {
      type: String,
      default: 'linear-gradient(140deg,#131d31 0%,#7c23a9 46%,#fb5a31 100%)',
    },
    tools: [{ type: String }],
    toolsUsed: [{ type: String }],
    aspectRatio: { type: String, default: '16:9' },
    durationSec: { type: Number, default: 30 },
    year: { type: String, default: '2025' },
    pastWorkVerified: { type: Boolean, default: true },
    tags: [{ type: String }],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const CreatorSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    id: { type: String },
    name: { type: String, required: true, trim: true },
    handle: { type: String, required: true, trim: true, unique: true },
    mark: { type: String, default: '' },
    headline: { type: String, default: '' },
    bio: { type: String, default: '' },
    location: { type: String, default: '' },
    specializations: [{ type: String }],
    specialties: [{ type: String }],
    skills: [{ type: String }],
    tools: [
      {
        name: { type: String, required: true },
        kind: { type: String, default: 'video' },
        verified: { type: Boolean, default: false },
      },
    ],
    contentTypes: [{ type: String }],
    formats: [{ type: String }],
    availability: {
      type: String,
      enum: ['open', 'limited', 'booked', 'Open', 'Limited', 'Booked'],
      default: 'open',
    },
    pricing: {
      from: { type: Number, default: 1000 },
      to: { type: Number },
      currency: { type: String, default: 'USD' },
      unit: { type: String, default: 'per-project' },
    },
    price: { type: Number },
    rating: { type: Number, default: 4.9 },
    color: { type: String, default: '#5eead4' },
    commercialUse: { type: Boolean, default: true },
    verified: { type: Boolean, default: true },
    verification: {
      toolsVerified: { type: Boolean, default: true },
      workflowVerified: { type: Boolean, default: true },
      pastWorkVerified: { type: Boolean, default: false },
      score: { type: Number, default: 85 },
    },
    verificationScore: { type: Number, default: 85 },
    stats: {
      projects: { type: Number, default: 20 },
      repeat: { type: Number, default: 70 },
      turnaround: { type: String, default: '3–5 days' },
    },
    portfolio: [PortfolioItemSchema],
  },
  {
    timestamps: true,
  }
)

// Ensure model isn't recompiled if already declared
export const Creator =
  mongoose.models.Creator || mongoose.model('Creator', CreatorSchema)

export default Creator
