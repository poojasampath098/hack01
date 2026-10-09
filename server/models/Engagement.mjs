import mongoose from 'mongoose'

/**
 * Canonical engagement lifecycle states.
 * invited → proposal → shortlisted → hired → in_progress → delivered → completed
 * with declined / cancelled as terminal branches, and viewed as a passive state.
 */
export const ENGAGEMENT_STATUSES = [
  'invited', // brand sent invite
  'viewed', // creator opened the invite
  'proposal', // creator submitted a proposal
  'shortlisted', // brand shortlisted this creator
  'hired', // brand hired (engaged) the creator
  'in_progress', // work underway
  'delivered', // creator submitted deliverables for review
  'completed', // brand accepted the delivery
  'declined', // creator declined / brand rejected the proposal
  'cancelled', // either party cancelled after engagement
  // ── legacy aliases (kept for backward-compatible reads) ──
  'accepted',
  'in-progress',
  'closed',
]

const proposalSchema = new mongoose.Schema(
  {
    coverLetter: { type: String, default: '' },
    proposedBudget: { type: Number, default: null },
    proposedTimeline: { type: String, default: '' },
    deliverableCount: { type: Number, default: null },
    submittedBy: { type: String, default: '' },
    submittedAt: { type: Date, default: null },
  },
  { _id: false }
)

const revisionSchema = new mongoose.Schema(
  {
    feedback: { type: String, required: true },
    requestedBy: { type: String, default: '' },
    requestedByName: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
  },
  { _id: true }
)

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    actor: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

const engagementSchema = new mongoose.Schema(
  {
    brief: {
      type: mongoose.Schema.Types.Mixed, // ObjectId or string slug for memory mode
      required: true,
      ref: 'Brief',
    },
    creator: {
      type: mongoose.Schema.Types.Mixed, // ObjectId or string slug
      required: true,
      ref: 'Creator',
    },
    // Denormalized for fast reads
    briefTitle: { type: String, default: '' },
    briefBrand: { type: String, default: '' },
    creatorName: { type: String, default: '' },
    creatorHandle: { type: String, default: '' },
    creatorEmail: { type: String, default: '', lowercase: true, trim: true },

    status: {
      type: String,
      enum: ENGAGEMENT_STATUSES,
      default: 'invited',
    },

    // Who initiated (brand side email)
    initiatedBy: { type: String, default: '', lowercase: true, trim: true },
    initiatedByName: { type: String, default: '' },

    // Messages thread (lightweight embedded)
    messages: [
      {
        from: { type: String }, // email
        fromName: { type: String, default: '' },
        body: { type: String, required: true },
        sentAt: { type: Date, default: Date.now },
        read: { type: Boolean, default: false },
      },
    ],

    // Creator proposal
    proposal: { type: proposalSchema, default: () => ({}) },

    // Revision feedback loop
    revisions: { type: [revisionSchema], default: [] },
    revisionCount: { type: Number, default: 0 },

    // Full status audit trail
    statusHistory: { type: [statusEventSchema], default: [] },

    // Quoted budget agreed upon
    agreedBudget: { type: Number, default: null },
    dueDate: { type: Date, default: null },

    // Deliverables tracking
    deliverablesTotal: { type: Number, default: 0 },
    deliverablesSubmitted: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// Compound index: one engagement per creator+brief
engagementSchema.index({ brief: 1, creator: 1 }, { unique: true, sparse: true })
engagementSchema.index({ initiatedBy: 1, status: 1 })
engagementSchema.index({ creator: 1, status: 1 })
engagementSchema.index({ creatorEmail: 1, status: 1 })

export const Engagement =
  mongoose.models.Engagement || mongoose.model('Engagement', engagementSchema)
