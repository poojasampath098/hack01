import mongoose from 'mongoose'

const BriefSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    id: { type: String },
    title: { type: String, required: true, trim: true },
    brand: {
      name: { type: String, required: true, trim: true },
      company: { type: String, trim: true },
      contactEmail: { type: String, trim: true },
      ownerId: { type: String, trim: true },
    },
    status: {
      type: String,
      enum: [
        'draft',
        'published',
        'in-review',
        'awarded',
        'closed',
        'Draft',
        'Published',
        'In review',
        'Awarded',
        'Closed',
      ],
      default: 'published',
    },
    contentType: { type: String, default: 'brand-film' },
    type: { type: String },
    campaignDescription: { type: String, default: '' },
    description: { type: String, default: '' },
    objective: { type: String, default: '' },
    rawIdea: { type: String, default: '' },
    style: [{ type: String }],
    formats: [{ type: String }],
    requiredTools: [{ type: String }],
    tools: [{ type: String }],
    requiredSkills: [{ type: String }],
    skills: [{ type: String }],
    deliverables: { type: Number, default: 3 },
    budget: {
      min: { type: Number, default: 3000 },
      max: { type: Number, default: 8000 },
      currency: { type: String, default: 'USD' },
      formatted: { type: String },
    },
    deadline: { type: String, default: '' },
    usage: {
      commercialUse: { type: Boolean, default: true },
      channels: [{ type: String }],
      territories: [{ type: String }],
      durationMonths: { type: Number, default: 12 },
      exclusivity: { type: Boolean, default: false },
      requireProvenance: { type: Boolean, default: true },
    },
    invitedCreators: [{ type: String }],
  },
  {
    timestamps: true,
  }
)

export const Brief = mongoose.models.Brief || mongoose.model('Brief', BriefSchema)
export default Brief
