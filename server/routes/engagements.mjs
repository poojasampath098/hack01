/**
 * engagements.mjs – Engagement & messaging routes
 *
 * GET    /api/engagements                     – list (filter by brief, creator, email, name, status)
 * POST   /api/engagements                     – create (invite)
 * GET    /api/engagements/:id                 – get single (includes proposal, revisions, statusHistory)
 * PATCH  /api/engagements/:id/status          – update status (validated transition + permissions)
 * POST   /api/engagements/:id/proposal        – creator submits a proposal
 * POST   /api/engagements/:id/revision        – brand requests a revision with feedback
 * POST   /api/engagements/:id/messages        – post a message
 * PATCH  /api/engagements/:id/messages/read   – mark messages as read
 */

import { Router } from 'express'
import {
  createEngagement,
  listEngagements,
  getEngagementById,
  updateEngagementStatus,
  submitProposal,
  requestRevision,
  postMessage,
  markMessagesRead,
  EngagementError,
} from '../services/engagementService.mjs'

const router = Router()

const badRequest = (res, message, details = {}) =>
  res.status(400).json({ ok: false, error: message, details })

const notFound = (res) =>
  res.status(404).json({ ok: false, error: 'Engagement not found' })

function extractActor(req) {
  return {
    email:
      req.headers['x-user-email'] ||
      req.body?.actorEmail ||
      req.query?.actorEmail ||
      req.userEmail ||
      '',
    id:
      req.headers['x-user-id'] ||
      req.body?.actorId ||
      req.query?.actorId ||
      req.userId ||
      '',
    role:
      req.headers['x-account-type'] ||
      req.body?.actorRole ||
      req.query?.actorRole ||
      req.accountType ||
      'Brand',
    name: req.headers['x-user-name'] || req.body?.actorName || '',
  }
}

function handleError(err, res, next) {
  if (err instanceof EngagementError) {
    return res.status(err.statusCode).json({ ok: false, error: err.message })
  }
  if (err?.message?.startsWith('Cannot transition')) {
    return res.status(422).json({ ok: false, error: err.message })
  }
  if (err?.message?.startsWith('Invalid status')) {
    return badRequest(res, err.message)
  }
  next(err)
}

// ─── List engagements ─────────────────────────────────────────────────────────
// GET /api/engagements
router.get('/', async (req, res, next) => {
  try {
    const {
      briefId,
      creatorId,
      ownerEmail,
      creatorEmail,
      creatorName,
      participantEmail,
      status,
      page,
      limit,
    } = req.query
    const result = await listEngagements({
      briefId,
      creatorId,
      ownerEmail,
      creatorEmail,
      creatorName,
      participantEmail,
      status,
      page,
      limit,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ─── Create engagement (invite) ───────────────────────────────────────────────
// POST /api/engagements
router.post('/', async (req, res, next) => {
  try {
    const {
      briefId,
      creatorId,
      message,
      creatorEmail,
      agreedBudget,
      dueDate,
      deliverablesTotal,
    } = req.body || {}
    if (!briefId) return badRequest(res, 'briefId is required')
    if (!creatorId) return badRequest(res, 'creatorId is required')

    const actor = extractActor(req)
    const engagement = await createEngagement({
      briefId,
      creatorId,
      initiatedBy: actor.email,
      initiatedByName: actor.name,
      creatorEmail,
      message,
      agreedBudget,
      dueDate,
      deliverablesTotal,
    })
    res.status(201).json(engagement)
  } catch (err) {
    handleError(err, res, next)
  }
})

// ─── Get single engagement ────────────────────────────────────────────────────
// GET /api/engagements/:id
router.get('/:id', async (req, res, next) => {
  try {
    const engagement = await getEngagementById(req.params.id)
    if (!engagement) return notFound(res)
    res.json(engagement)
  } catch (err) {
    next(err)
  }
})

// ─── Submit a proposal ────────────────────────────────────────────────────────
// POST /api/engagements/:id/proposal
router.post('/:id/proposal', async (req, res, next) => {
  try {
    const actor = extractActor(req)
    const updated = await submitProposal(req.params.id, req.body || {}, actor)
    if (!updated) return notFound(res)
    res.status(201).json(updated)
  } catch (err) {
    handleError(err, res, next)
  }
})

// ─── Request a revision ───────────────────────────────────────────────────────
// POST /api/engagements/:id/revision
router.post('/:id/revision', async (req, res, next) => {
  try {
    const actor = extractActor(req)
    const { feedback } = req.body || {}
    const updated = await requestRevision(req.params.id, feedback, actor)
    if (!updated) return notFound(res)
    res.status(201).json(updated)
  } catch (err) {
    handleError(err, res, next)
  }
})

// ─── Update engagement status ─────────────────────────────────────────────────
// PATCH /api/engagements/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status, note, feedback, agreedBudget } = req.body || {}
    if (!status) return badRequest(res, 'status is required')

    const actor = extractActor(req)
    const updated = await updateEngagementStatus(req.params.id, status, actor, {
      note,
      feedback,
      agreedBudget,
    })
    if (!updated) return notFound(res)
    res.json(updated)
  } catch (err) {
    handleError(err, res, next)
  }
})

// ─── Post a message ───────────────────────────────────────────────────────────
// POST /api/engagements/:id/messages
router.post('/:id/messages', async (req, res, next) => {
  try {
    const { body, fromName } = req.body || {}
    if (!body || !body.trim()) return badRequest(res, 'message body is required')

    const actor = extractActor(req)
    const updated = await postMessage(req.params.id, {
      from: actor.email,
      fromName: fromName || actor.name,
      body,
    })
    if (!updated) return notFound(res)
    res.status(201).json(updated)
  } catch (err) {
    handleError(err, res, next)
  }
})

// ─── Mark messages as read ────────────────────────────────────────────────────
// PATCH /api/engagements/:id/messages/read
router.patch('/:id/messages/read', async (req, res, next) => {
  try {
    const actor = extractActor(req)
    const updated = await markMessagesRead(req.params.id, actor.email)
    if (!updated) return notFound(res)
    res.json(updated)
  } catch (err) {
    handleError(err, res, next)
  }
})

export default router
