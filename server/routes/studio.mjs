/**
 * studio.mjs – AI Studio API routes
 *
 * Projects:
 *   GET    /api/studio/projects          – list user projects
 *   POST   /api/studio/projects          – create project
 *   GET    /api/studio/projects/:id      – get single project
 *   PATCH  /api/studio/projects/:id      – update project
 *   DELETE /api/studio/projects/:id      – delete project
 *
 * Generations:
 *   GET    /api/studio/history           – list user generation history
 *   POST   /api/studio/generate          – record a new generation
 *   GET    /api/studio/history/:id       – get single generation
 *   PATCH  /api/studio/history/:id/favourite – toggle favourite
 *   DELETE /api/studio/history/:id       – delete generation
 *
 * Stats:
 *   GET    /api/studio/stats             – credit balance and usage summary
 */

import { Router } from 'express'
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  listGenerations,
  getGenerationById,
  createGeneration,
  toggleFavourite,
  deleteGeneration,
} from '../services/studioService.mjs'

const router = Router()

const badRequest = (res, message, details = {}) =>
  res.status(400).json({ ok: false, error: message, details })

const notFound = (res, thing = 'Resource') =>
  res.status(404).json({ ok: false, error: `${thing} not found` })

// Resolve owner from headers (JWT middleware sets req.userEmail, fallback to x-user-email)
function getOwner(req) {
  return req.userEmail || req.headers['x-user-email'] || 'anonymous'
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/studio/projects
router.get('/projects', async (req, res, next) => {
  try {
    const owner = getOwner(req)
    const { status, page, limit } = req.query
    const result = await listProjects({ owner, status, page, limit })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// POST /api/studio/projects
router.post('/projects', async (req, res, next) => {
  try {
    const owner = getOwner(req)
    const { title, description, tags } = req.body || {}
    if (!title || !title.trim()) return badRequest(res, 'title is required')

    const project = await createProject({ owner, title, description, tags })
    res.status(201).json(project)
  } catch (err) {
    next(err)
  }
})

// GET /api/studio/projects/:id
router.get('/projects/:id', async (req, res, next) => {
  try {
    const project = await getProjectById(req.params.id, getOwner(req))
    if (!project) return notFound(res, 'Project')
    res.json(project)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/studio/projects/:id
router.patch('/projects/:id', async (req, res, next) => {
  try {
    const { title, description, status, tags } = req.body || {}
    const updated = await updateProject(req.params.id, getOwner(req), { title, description, status, tags })
    if (!updated) return notFound(res, 'Project')
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/studio/projects/:id
router.delete('/projects/:id', async (req, res, next) => {
  try {
    const success = await deleteProject(req.params.id, getOwner(req))
    if (!success) return notFound(res, 'Project')
    res.json({ ok: true, message: 'Project deleted', id: req.params.id })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GENERATIONS (HISTORY)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/studio/history
router.get('/history', async (req, res, next) => {
  try {
    const owner = getOwner(req)
    const { projectId, tool, type, favourite, page, limit } = req.query
    const result = await listGenerations({ owner, projectId, tool, type, favourite, page, limit })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// POST /api/studio/generate
router.post('/generate', async (req, res, next) => {
  try {
    const owner = getOwner(req)
    const { prompt, negativePrompt, tool, type, projectId, settings, tags } = req.body || {}

    if (!prompt || !prompt.trim()) return badRequest(res, 'prompt is required')

    const generation = await createGeneration({
      owner,
      prompt,
      negativePrompt,
      tool: tool || 'Veo',
      type: type || 'video',
      projectId: projectId || null,
      settings: settings || {},
      tags: tags || [],
    })
    res.status(201).json(generation)
  } catch (err) {
    if (err.message && err.message.startsWith('Unknown tool')) {
      return badRequest(res, err.message)
    }
    next(err)
  }
})

// GET /api/studio/history/:id
router.get('/history/:id', async (req, res, next) => {
  try {
    const gen = await getGenerationById(req.params.id, getOwner(req))
    if (!gen) return notFound(res, 'Generation')
    res.json(gen)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/studio/history/:id/favourite
router.patch('/history/:id/favourite', async (req, res, next) => {
  try {
    const gen = await toggleFavourite(req.params.id, getOwner(req))
    if (!gen) return notFound(res, 'Generation')
    res.json(gen)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/studio/history/:id
router.delete('/history/:id', async (req, res, next) => {
  try {
    const success = await deleteGeneration(req.params.id, getOwner(req))
    if (!success) return notFound(res, 'Generation')
    res.json({ ok: true, message: 'Generation deleted', id: req.params.id })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/studio/stats
router.get('/stats', async (req, res, next) => {
  try {
    const owner = getOwner(req)
    const [projectsResult, historyResult] = await Promise.all([
      listProjects({ owner, limit: 1 }),
      listGenerations({ owner, limit: 1 }),
    ])

    // Compute all generations to sum credit usage
    const allGens = await listGenerations({ owner, limit: 1000 })
    const creditsUsed = allGens.items.reduce((sum, g) => sum + (g.creditsCost || 0), 0)

    const toolUsage = {}
    for (const g of allGens.items) {
      toolUsage[g.tool] = (toolUsage[g.tool] || 0) + 1
    }

    res.json({
      ok: true,
      stats: {
        totalProjects: projectsResult.total,
        totalGenerations: historyResult.total,
        creditsUsed,
        creditsRemaining: Math.max(0, 100 - creditsUsed), // demo balance
        topTool: Object.entries(toolUsage).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
        toolUsage,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
