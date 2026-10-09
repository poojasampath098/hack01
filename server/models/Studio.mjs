import mongoose from 'mongoose'

// ---- Studio Project ----
const studioProjectSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true }, // email or user id
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['active', 'archived', 'draft'],
      default: 'active',
    },
    // Array of generation IDs belonging to this project
    generationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StudioGeneration' }],
    thumbnail: { type: String, default: '' },
    tags: [{ type: String }],
  },
  { timestamps: true }
)

studioProjectSchema.index({ owner: 1, status: 1 })

// ---- Studio Generation (a single AI generation event) ----
const studioGenerationSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudioProject', default: null },

    prompt: { type: String, required: true },
    negativePrompt: { type: String, default: '' },

    tool: {
      type: String,
      enum: [
        'Veo', 'Runway', 'Kling', 'Sora', 'Midjourney', 'Flux',
        'ComfyUI', 'ElevenLabs', 'Suno', 'Blender', 'Topaz', 'After Effects',
        'DALL-E', 'Stable Diffusion', 'other',
      ],
      default: 'Veo',
    },

    type: {
      type: String,
      enum: ['video', 'image', 'audio', 'text', '3d'],
      default: 'video',
    },

    // Settings snapshot at generation time
    settings: {
      resolution: { type: String, default: '1080p' },
      aspectRatio: { type: String, default: '16:9' },
      durationSec: { type: Number, default: 5 },
      fps: { type: Number, default: 24 },
      seed: { type: Number, default: null },
      steps: { type: Number, default: 30 },
    },

    // Result
    status: {
      type: String,
      enum: ['queued', 'generating', 'done', 'failed'],
      default: 'done',
    },
    outputUrl: { type: String, default: '' },
    thumbUrl: { type: String, default: '' },
    creditsCost: { type: Number, default: 1 },

    // Metadata for provenance
    metadata: {
      modelVersion: { type: String, default: '' },
      processingMs: { type: Number, default: 0 },
      provider: { type: String, default: '' },
    },

    favourite: { type: Boolean, default: false },
    tags: [{ type: String }],
  },
  { timestamps: true }
)

studioGenerationSchema.index({ owner: 1, createdAt: -1 })
studioGenerationSchema.index({ projectId: 1 })

export const StudioProject =
  mongoose.models.StudioProject || mongoose.model('StudioProject', studioProjectSchema)

export const StudioGeneration =
  mongoose.models.StudioGeneration ||
  mongoose.model('StudioGeneration', studioGenerationSchema)
