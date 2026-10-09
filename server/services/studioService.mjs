/**
 * studioService.mjs
 * AI Studio persistence: projects and generation history.
 * Hybrid MongoDB + in-memory fallback.
 */

import mongoose from 'mongoose'
import { StudioProject, StudioGeneration } from '../models/Studio.mjs'

function isDbConnected() {
  return mongoose.connection.readyState === 1
}

// ─── In-memory stores ─────────────────────────────────────────────────────────
let memProjects = []
let memGenerations = []
let projectCounter = 1
let generationCounter = 1

function normalizeProject(p) {
  if (!p) return null
  const obj = typeof p.toObject === 'function' ? p.toObject() : { ...p }
  return { ...obj, _id: String(obj._id || obj.id), id: String(obj._id || obj.id) }
}

function normalizeGeneration(g) {
  if (!g) return null
  const obj = typeof g.toObject === 'function' ? g.toObject() : { ...g }
  return { ...obj, _id: String(obj._id || obj.id), id: String(obj._id || obj.id) }
}

// ─── PROJECTS ─────────────────────────────────────────────────────────────────

export async function listProjects({ owner, status, page = 1, limit = 20 } = {}) {
  const skip = (Number(page) - 1) * Number(limit)

  if (isDbConnected()) {
    const filter = { owner }
    if (status) filter.status = status
    const [items, total] = await Promise.all([
      StudioProject.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(Number(limit)),
      StudioProject.countDocuments(filter),
    ])
    return { items: items.map(normalizeProject), total, page: Number(page), pages: Math.ceil(total / Number(limit)) }
  }

  let list = memProjects.filter((p) => p.owner === owner)
  if (status) list = list.filter((p) => p.status === status)
  list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  const items = list.slice(skip, skip + Number(limit))
  return { items: items.map(normalizeProject), total: list.length, page: Number(page), pages: Math.ceil(list.length / Number(limit)) }
}

export async function getProjectById(id, owner) {
  if (isDbConnected()) {
    return normalizeProject(await StudioProject.findOne({ _id: id, owner }))
  }
  return normalizeProject(memProjects.find((p) => (p.id === id || p._id === id) && p.owner === owner))
}

export async function createProject({ owner, title, description = '', tags = [] }) {
  if (!owner) throw new Error('owner is required')
  if (!title || !title.trim()) throw new Error('title is required')

  if (isDbConnected()) {
    const project = await StudioProject.create({ owner, title: title.trim(), description, tags })
    return normalizeProject(project)
  }

  const now = new Date().toISOString()
  const id = `proj-${String(projectCounter++).padStart(3, '0')}`
  const project = { _id: id, id, owner, title: title.trim(), description, tags, status: 'active', generationIds: [], thumbnail: '', createdAt: now, updatedAt: now }
  memProjects.push(project)
  return normalizeProject(project)
}

export async function updateProject(id, owner, { title, description, status, tags } = {}) {
  const updates = {}
  if (title !== undefined) updates.title = title.trim()
  if (description !== undefined) updates.description = description
  if (status !== undefined) updates.status = status
  if (tags !== undefined) updates.tags = tags

  if (isDbConnected()) {
    const project = await StudioProject.findOneAndUpdate(
      { _id: id, owner },
      { $set: updates },
      { new: true }
    )
    return normalizeProject(project)
  }

  const idx = memProjects.findIndex((p) => (p.id === id || p._id === id) && p.owner === owner)
  if (idx === -1) return null
  memProjects[idx] = { ...memProjects[idx], ...updates, updatedAt: new Date().toISOString() }
  return normalizeProject(memProjects[idx])
}

export async function deleteProject(id, owner) {
  if (isDbConnected()) {
    const result = await StudioProject.findOneAndDelete({ _id: id, owner })
    return !!result
  }
  const idx = memProjects.findIndex((p) => (p.id === id || p._id === id) && p.owner === owner)
  if (idx === -1) return false
  memProjects.splice(idx, 1)
  return true
}

// ─── GENERATIONS ──────────────────────────────────────────────────────────────

export async function listGenerations({ owner, projectId, tool, type, favourite, page = 1, limit = 20 } = {}) {
  const skip = (Number(page) - 1) * Number(limit)

  if (isDbConnected()) {
    const filter = { owner }
    if (projectId) filter.projectId = projectId
    if (tool) filter.tool = tool
    if (type) filter.type = type
    if (favourite !== undefined) filter.favourite = favourite === 'true' || favourite === true

    const [items, total] = await Promise.all([
      StudioGeneration.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      StudioGeneration.countDocuments(filter),
    ])
    return { items: items.map(normalizeGeneration), total, page: Number(page), pages: Math.ceil(total / Number(limit)) }
  }

  let list = memGenerations.filter((g) => g.owner === owner)
  if (projectId) list = list.filter((g) => g.projectId === projectId)
  if (tool) list = list.filter((g) => g.tool === tool)
  if (type) list = list.filter((g) => g.type === type)
  if (favourite !== undefined) list = list.filter((g) => g.favourite === (favourite === 'true' || favourite === true))
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const items = list.slice(skip, skip + Number(limit))
  return { items: items.map(normalizeGeneration), total: list.length, page: Number(page), pages: Math.ceil(list.length / Number(limit)) }
}

export async function getGenerationById(id, owner) {
  if (isDbConnected()) {
    return normalizeGeneration(await StudioGeneration.findOne({ _id: id, owner }))
  }
  return normalizeGeneration(memGenerations.find((g) => (g.id === id || g._id === id) && g.owner === owner))
}

/**
 * createGeneration – records an AI generation event.
 * In a real system this would enqueue a job; here we simulate instant completion.
 */
export async function createGeneration({
  owner,
  prompt,
  negativePrompt = '',
  tool = 'Veo',
  type = 'video',
  projectId = null,
  settings = {},
  tags = [],
}) {
  if (!owner) throw new Error('owner is required')
  if (!prompt || !prompt.trim()) throw new Error('prompt is required')

  const VALID_TOOLS = ['Veo', 'Runway', 'Kling', 'Sora', 'Midjourney', 'Flux', 'ComfyUI', 'ElevenLabs', 'Suno', 'Blender', 'Topaz', 'After Effects', 'DALL-E', 'Stable Diffusion', 'other']
  if (!VALID_TOOLS.includes(tool)) throw new Error(`Unknown tool: ${tool}`)

  const creditsCost = tool === 'Veo' || tool === 'Sora' ? 5 : tool === 'Runway' || tool === 'Kling' ? 3 : 1

  const genData = {
    owner,
    projectId,
    prompt: prompt.trim(),
    negativePrompt,
    tool,
    type,
    settings: {
      resolution: settings.resolution || '1080p',
      aspectRatio: settings.aspectRatio || '16:9',
      durationSec: Number(settings.durationSec) || 5,
      fps: Number(settings.fps) || 24,
      seed: settings.seed || null,
      steps: Number(settings.steps) || 30,
    },
    status: 'done', // simulated instant
    outputUrl: '',   // no actual AI call; placeholder
    thumbUrl: '',
    creditsCost,
    metadata: {
      modelVersion: `${tool}-sim-1.0`,
      processingMs: Math.floor(Math.random() * 3000) + 500,
      provider: tool,
    },
    favourite: false,
    tags,
  }

  if (isDbConnected()) {
    const gen = await StudioGeneration.create(genData)
    // Link to project
    if (projectId) {
      await StudioProject.findByIdAndUpdate(projectId, { $push: { generationIds: gen._id } })
    }
    return normalizeGeneration(gen)
  }

  const now = new Date().toISOString()
  const id = `gen-${String(generationCounter++).padStart(4, '0')}`
  const gen = { ...genData, _id: id, id, createdAt: now, updatedAt: now }
  memGenerations.push(gen)
  // Link to project in memory
  if (projectId) {
    const pIdx = memProjects.findIndex((p) => p.id === projectId || p._id === projectId)
    if (pIdx !== -1) {
      memProjects[pIdx].generationIds = [...(memProjects[pIdx].generationIds || []), id]
    }
  }
  return normalizeGeneration(gen)
}

export async function toggleFavourite(id, owner) {
  if (isDbConnected()) {
    const gen = await StudioGeneration.findOne({ _id: id, owner })
    if (!gen) return null
    gen.favourite = !gen.favourite
    await gen.save()
    return normalizeGeneration(gen)
  }

  const idx = memGenerations.findIndex((g) => (g.id === id || g._id === id) && g.owner === owner)
  if (idx === -1) return null
  memGenerations[idx].favourite = !memGenerations[idx].favourite
  return normalizeGeneration(memGenerations[idx])
}

export async function deleteGeneration(id, owner) {
  if (isDbConnected()) {
    const result = await StudioGeneration.findOneAndDelete({ _id: id, owner })
    return !!result
  }
  const idx = memGenerations.findIndex((g) => (g.id === id || g._id === id) && g.owner === owner)
  if (idx === -1) return false
  memGenerations.splice(idx, 1)
  return true
}
