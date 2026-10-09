import { Router } from 'express'
import {
  listCreators,
  getCreatorById,
  createCreator,
  updateCreator,
  deleteCreator,
  getPortfolio,
  addPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem,
} from '../services/creatorService.mjs'

const router = Router()

// Helper to format error responses consistently
const badRequest = (res, message, details = {}) =>
  res.status(400).json({ ok: false, error: message, details })
const notFound = (res, message = 'Creator not found') =>
  res.status(404).json({ ok: false, error: message, details: {} })

// ==========================================
// 1. LIST CREATORS (Search, Filter, Pagination)
// ==========================================
// GET /api/creators
router.get('/', async (req, res, next) => {
  try {
    const result = await listCreators(req.query)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ==========================================
// 2. GET CREATOR DETAILS
// ==========================================
// GET /api/creators/:id
router.get('/:id', async (req, res, next) => {
  try {
    const creator = await getCreatorById(req.params.id)
    if (!creator) return notFound(res)
    res.json(creator)
  } catch (err) {
    next(err)
  }
})

// ==========================================
// 3. CREATE CREATOR
// ==========================================
// POST /api/creators
router.post('/', async (req, res, next) => {
  try {
    const { name, handle, pricing, price, rating } = req.body || {}

    if (!name || typeof name !== 'string' || !name.trim()) {
      return badRequest(res, 'Name is required and must be a non-empty string')
    }
    if (!handle || typeof handle !== 'string' || !handle.trim()) {
      return badRequest(res, 'Handle is required and must be a non-empty string')
    }

    const numericPrice = price ?? pricing?.from
    if (numericPrice !== undefined && (isNaN(numericPrice) || numericPrice < 0)) {
      return badRequest(res, 'Price must be a valid positive number')
    }
    if (rating !== undefined && (isNaN(rating) || rating < 0 || rating > 5)) {
      return badRequest(res, 'Rating must be between 0 and 5')
    }

    const created = await createCreator(req.body)
    res.status(201).json(created)
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      return badRequest(res, err.message)
    }
    next(err)
  }
})

// ==========================================
// 4. UPDATE CREATOR
// ==========================================
// PUT /api/creators/:id or PATCH /api/creators/:id
const handleUpdate = async (req, res, next) => {
  try {
    const { price, pricing, rating } = req.body || {}
    const numericPrice = price ?? pricing?.from

    if (numericPrice !== undefined && (isNaN(numericPrice) || numericPrice < 0)) {
      return badRequest(res, 'Price must be a valid positive number')
    }
    if (rating !== undefined && (isNaN(rating) || rating < 0 || rating > 5)) {
      return badRequest(res, 'Rating must be between 0 and 5')
    }

    const updated = await updateCreator(req.params.id, req.body)
    if (!updated) return notFound(res)
    res.json(updated)
  } catch (err) {
    next(err)
  }
}

router.put('/:id', handleUpdate)
router.patch('/:id', handleUpdate)

// ==========================================
// 5. DELETE CREATOR
// ==========================================
// DELETE /api/creators/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const success = await deleteCreator(req.params.id)
    if (!success) return notFound(res)
    res.json({
      ok: true,
      message: 'Creator deleted successfully',
      id: req.params.id,
    })
  } catch (err) {
    next(err)
  }
})

// ==========================================
// 6. PORTFOLIO APIS
// ==========================================

// GET /api/creators/:id/portfolio
router.get('/:id/portfolio', async (req, res, next) => {
  try {
    const portfolio = await getPortfolio(req.params.id)
    if (portfolio === null) return notFound(res)
    res.json({ items: portfolio, total: portfolio.length })
  } catch (err) {
    next(err)
  }
})

// POST /api/creators/:id/portfolio
router.post('/:id/portfolio', async (req, res, next) => {
  try {
    const { title, durationSec } = req.body || {}
    if (!title || typeof title !== 'string' || !title.trim()) {
      return badRequest(res, 'Portfolio title is required and must be a non-empty string')
    }
    if (durationSec !== undefined && (isNaN(durationSec) || durationSec < 0)) {
      return badRequest(res, 'durationSec must be a valid positive number')
    }

    const item = await addPortfolioItem(req.params.id, req.body)
    if (!item) return notFound(res)
    res.status(201).json(item)
  } catch (err) {
    next(err)
  }
})

// PUT /api/creators/:id/portfolio/:itemId or PATCH /api/creators/:id/portfolio/:itemId
const handlePortfolioUpdate = async (req, res, next) => {
  try {
    const { durationSec } = req.body || {}
    if (durationSec !== undefined && (isNaN(durationSec) || durationSec < 0)) {
      return badRequest(res, 'durationSec must be a valid positive number')
    }

    const item = await updatePortfolioItem(req.params.id, req.params.itemId, req.body)
    if (!item) {
      return res.status(404).json({
        ok: false,
        error: 'Creator or portfolio item not found',
        details: {},
      })
    }
    res.json(item)
  } catch (err) {
    next(err)
  }
}

router.put('/:id/portfolio/:itemId', handlePortfolioUpdate)
router.patch('/:id/portfolio/:itemId', handlePortfolioUpdate)

// DELETE /api/creators/:id/portfolio/:itemId
router.delete('/:id/portfolio/:itemId', async (req, res, next) => {
  try {
    const success = await deletePortfolioItem(req.params.id, req.params.itemId)
    if (!success) {
      return res.status(404).json({
        ok: false,
        error: 'Creator or portfolio item not found',
        details: {},
      })
    }
    res.json({
      ok: true,
      message: 'Portfolio item deleted successfully',
      itemId: req.params.itemId,
    })
  } catch (err) {
    next(err)
  }
})

export default router
