import { Router } from 'express'
import {
  listBriefs,
  getBriefById,
  createBrief,
  updateBrief,
  publishBrief,
  closeBrief,
  deleteBrief,
  getBriefMatches,
  inviteCreatorToBrief,
  OwnershipError,
} from '../services/briefService.mjs'

const router = Router()

// Helpers
const badRequest = (res, message, details = {}) =>
  res.status(400).json({ ok: false, error: message, details })
const notFound = (res, message = 'Brief not found') =>
  res.status(404).json({ ok: false, error: message, details: {} })
const forbidden = (res, message = 'Unauthorized') =>
  res.status(403).json({ ok: false, error: message, details: {} })

function extractUserContext(req) {
  const email = (
    req.headers['x-user-email'] ||
    req.body?.ownerEmail ||
    req.query?.ownerEmail ||
    ''
  ).toString().trim()
  const id = (
    req.headers['x-user-id'] ||
    req.body?.ownerId ||
    req.query?.ownerId ||
    ''
  ).toString().trim()
  const name = (
    req.headers['x-user-name'] ||
    req.body?.brand?.name ||
    ''
  ).toString().trim()
  return { email, id, name }
}

// ==========================================
// 1. LIST BRIEFS
// ==========================================
// GET /api/briefs
router.get('/', async (req, res, next) => {
  try {
    const result = await listBriefs(req.query)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ==========================================
// 2. GET BRIEF DETAILS
// ==========================================
// GET /api/briefs/:id
router.get('/:id', async (req, res, next) => {
  try {
    const brief = await getBriefById(req.params.id)
    if (!brief) return notFound(res)
    res.json(brief)
  } catch (err) {
    next(err)
  }
})

// ==========================================
// 3. CREATE BRIEF
// ==========================================
// POST /api/briefs
router.post('/', async (req, res, next) => {
  try {
    const { title, brand } = req.body || {}
    if (!title || typeof title !== 'string' || !title.trim()) {
      return badRequest(res, 'title is required and must be a non-empty string')
    }

    const brandName = typeof brand === 'string' ? brand : brand?.name
    if (!brandName || typeof brandName !== 'string' || !brandName.trim()) {
      return badRequest(res, 'brand.name is required')
    }

    const userContext = extractUserContext(req)
    const created = await createBrief(req.body, userContext)
    res.status(201).json(created)
  } catch (err) {
    if (err.message && err.message.includes('Budget')) {
      return badRequest(res, err.message)
    }
    next(err)
  }
})

// ==========================================
// 4. UPDATE BRIEF
// ==========================================
// PUT /api/briefs/:id or PATCH /api/briefs/:id
const handleUpdate = async (req, res, next) => {
  try {
    const userContext = extractUserContext(req)
    const updated = await updateBrief(req.params.id, req.body, userContext)
    if (!updated) return notFound(res)
    res.json(updated)
  } catch (err) {
    if (err instanceof OwnershipError) {
      return forbidden(res, err.message)
    }
    if (err.message && err.message.includes('Budget')) {
      return badRequest(res, err.message)
    }
    next(err)
  }
}

router.put('/:id', handleUpdate)
router.patch('/:id', handleUpdate)

// ==========================================
// 5. PUBLISH BRIEF
// ==========================================
// POST /api/briefs/:id/publish
router.post('/:id/publish', async (req, res, next) => {
  try {
    const userContext = extractUserContext(req)
    const published = await publishBrief(req.params.id, userContext)
    if (!published) return notFound(res)
    res.json(published)
  } catch (err) {
    if (err instanceof OwnershipError) {
      return forbidden(res, err.message)
    }
    next(err)
  }
})

// ==========================================
// 6. CLOSE BRIEF
// ==========================================
// POST /api/briefs/:id/close
router.post('/:id/close', async (req, res, next) => {
  try {
    const userContext = extractUserContext(req)
    const closed = await closeBrief(req.params.id, userContext)
    if (!closed) return notFound(res)
    res.json(closed)
  } catch (err) {
    if (err instanceof OwnershipError) {
      return forbidden(res, err.message)
    }
    next(err)
  }
})

// ==========================================
// 7. DELETE BRIEF
// ==========================================
// DELETE /api/briefs/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const userContext = extractUserContext(req)
    const success = await deleteBrief(req.params.id, userContext)
    if (!success) return notFound(res)
    res.json({
      ok: true,
      message: 'Brief deleted successfully',
      id: req.params.id,
    })
  } catch (err) {
    if (err instanceof OwnershipError) {
      return forbidden(res, err.message)
    }
    next(err)
  }
})

// ==========================================
// 8. BRIEF MATCHES
// ==========================================
// GET /api/briefs/:id/matches
router.get('/:id/matches', async (req, res, next) => {
  try {
    const matches = await getBriefMatches(req.params.id)
    if (!matches) return notFound(res)
    res.json({ items: matches, total: matches.length })
  } catch (err) {
    next(err)
  }
})

// ==========================================
// 9. INVITE CREATOR
// ==========================================
// POST /api/briefs/:id/invite
router.post('/:id/invite', async (req, res, next) => {
  try {
    const { creatorId } = req.body || {}
    if (!creatorId) {
      return badRequest(res, 'creatorId is required')
    }
    const userContext = extractUserContext(req)
    const engagement = await inviteCreatorToBrief(req.params.id, creatorId, userContext)
    if (!engagement) return notFound(res)
    res.status(201).json(engagement)
  } catch (err) {
    if (err instanceof OwnershipError) {
      return forbidden(res, err.message)
    }
    next(err)
  }
})

// ==========================================
// 10. BRIEF BUILDER HEURISTIC
// ==========================================
// POST /api/brief-builder
export function handleBriefBuilder(req, res) {
  const roughIdea = String(req.body?.roughIdea || '').trim()
  if (!roughIdea) {
    return badRequest(res, 'roughIdea is required')
  }

  const lower = roughIdea.toLowerCase()
  const contentType = lower.includes('social')
    ? 'social-loop'
    : lower.includes('music')
      ? 'music-video'
      : lower.includes('product')
        ? 'video-ad'
        : 'brand-film'

  const style = ['cinematic']
  if (lower.includes('surreal')) style.push('surreal')
  if (lower.includes('minimal')) style.push('minimal')

  const tools = ['Runway']
  if (lower.includes('veo')) tools.push('Veo')
  if (lower.includes('3d') || lower.includes('render')) tools.push('Blender')
  if (lower.includes('kling')) tools.push('Kling')

  res.json({
    title: null,
    rawIdea: roughIdea,
    objective: null,
    campaignDescription: roughIdea,
    contentType,
    style,
    formats: lower.includes('social') ? ['9:16', '1:1'] : ['16:9', '9:16'],
    requiredTools: tools,
    requiredSkills: ['art direction', 'motion design'],
    budget: { min: 4000, max: 8000, currency: 'USD' },
    deadline: null,
    usage: {
      commercialUse: true,
      channels: ['web', 'paid-social'],
      territories: ['Global'],
      durationMonths: 12,
      exclusivity: false,
      requireProvenance: true,
    },
  })
}

export default router
