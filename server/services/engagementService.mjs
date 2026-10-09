/**
 * engagementService.mjs
 * Creator invitation & engagement lifecycle.
 *
 * Lifecycle:
 *   invited → (viewed) → proposal → shortlisted → hired
 *           → in_progress → delivered → completed
 *   Branches: declined, cancelled. Revisions move delivered → in_progress.
 *
 * Guardrails: strict transition validation + role/membership access control.
 * Hybrid MongoDB + in-memory persistence.
 */

import mongoose from 'mongoose'
import { Engagement, ENGAGEMENT_STATUSES } from '../models/Engagement.mjs'

function isDbConnected() {
  return mongoose.connection.readyState === 1
}

// ─── Lifecycle definition ─────────────────────────────────────────────────────
export const VALID_TRANSITIONS = {
  invited: ['viewed', 'proposal', 'shortlisted', 'declined', 'cancelled'],
  viewed: ['proposal', 'shortlisted', 'declined', 'cancelled'],
  proposal: ['shortlisted', 'hired', 'declined', 'cancelled'],
  shortlisted: ['hired', 'declined', 'cancelled'],
  hired: ['in_progress', 'cancelled'],
  in_progress: ['delivered', 'cancelled'],
  delivered: ['completed', 'in_progress', 'cancelled'],
  completed: [],
  declined: [],
  cancelled: [],
}

// Which party is permitted to move an engagement INTO a given status.
// 'brand' = the brand that initiated, 'creator' = the invited creator.
export const TRANSITION_ROLES = {
  viewed: ['brand', 'creator'],
  proposal: ['creator'],
  shortlisted: ['brand'],
  hired: ['brand'],
  in_progress: ['brand', 'creator'],
  delivered: ['creator'],
  completed: ['brand'],
  declined: ['brand', 'creator'],
  cancelled: ['brand', 'creator'],
}

const STATUS_ALIASES = {
  accepted: 'hired',
  'in-progress': 'in_progress',
  closed: 'completed',
}

const TERMINAL_STATUSES = ['completed', 'declined', 'cancelled']

// ─── Errors ───────────────────────────────────────────────────────────────────
export class EngagementError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = 'EngagementError'
    this.statusCode = statusCode
  }
}
export class ValidationError extends EngagementError {
  constructor(message) {
    super(message, 400)
    this.name = 'ValidationError'
  }
}
export class PermissionError extends EngagementError {
  constructor(message) {
    super(message, 403)
    this.name = 'PermissionError'
  }
}
export class TransitionError extends EngagementError {
  constructor(message) {
    super(message, 422)
    this.name = 'TransitionError'
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function canonicalStatus(status) {
  const key = String(status || '').trim().toLowerCase().replace(/\s+/g, '_')
  const mapped = STATUS_ALIASES[key] || key
  return VALID_TRANSITIONS[mapped] !== undefined || TERMINAL_STATUSES.includes(mapped)
    ? mapped
    : null
}

export function isTerminal(status) {
  return TERMINAL_STATUSES.includes(canonicalStatus(status))
}

function normalizeActor(actor) {
  if (!actor) return { email: '', id: '', role: '', name: '' }
  if (typeof actor === 'string') {
    return { email: actor.toLowerCase().trim(), id: '', role: '', name: '' }
  }
  return {
    email: String(actor.email || '').toLowerCase().trim(),
    id: String(actor.id || '').trim(),
    role: String(actor.role || actor.accountType || '').trim(),
    name: String(actor.name || '').trim(),
  }
}

function ensureCollections(raw) {
  if (!Array.isArray(raw.messages)) raw.messages = []
  if (!Array.isArray(raw.revisions)) raw.revisions = []
  if (!Array.isArray(raw.statusHistory)) raw.statusHistory = []
  if (!raw.proposal) raw.proposal = {}
}

export function normalizeEngagement(e) {
  if (!e) return null
  const obj = typeof e.toObject === 'function' ? e.toObject() : { ...e }
  const id = String(obj._id || obj.id)
  const status = canonicalStatus(obj.status) || obj.status
  return {
    ...obj,
    _id: id,
    id,
    status,
    messages: Array.isArray(obj.messages) ? obj.messages : [],
    revisions: Array.isArray(obj.revisions) ? obj.revisions : [],
    revisionCount: Number(obj.revisionCount || 0),
    statusHistory: Array.isArray(obj.statusHistory) ? obj.statusHistory : [],
    proposal: obj.proposal || {},
    deliverablesTotal: Number(obj.deliverablesTotal || 0),
    deliverablesSubmitted: Number(obj.deliverablesSubmitted || 0),
  }
}

async function loadRaw(id) {
  if (!id) return null
  if (isDbConnected()) {
    const doc = await Engagement.findById(id)
    if (doc) ensureCollections(doc)
    return doc
  }
  const entry = memEngagements.find((e) => e.id === id || e._id === id)
  if (entry) ensureCollections(entry)
  return entry || null
}

async function saveRaw(raw) {
  if (isDbConnected()) {
    await raw.save()
    return raw
  }
  raw.updatedAt = new Date().toISOString()
  return raw
}

function pushHistory(raw, status, actor, note = '') {
  ensureCollections(raw)
  raw.statusHistory.push({
    status,
    actor: actor.email || actor.id || 'system',
    actorRole: actor.role || '',
    note: note || '',
    at: new Date(),
  })
}

/** Resolve whether the actor is the brand or creator side of the engagement. */
function resolveParty(e, actor) {
  const email = actor.email
  if (email && e.initiatedBy && email === String(e.initiatedBy).toLowerCase()) return 'brand'
  if (email && e.creatorEmail && email === String(e.creatorEmail).toLowerCase()) return 'creator'

  const id = actor.id.toLowerCase()
  if (id) {
    const creatorId = String(e.creator || '').toLowerCase()
    if (id === creatorId) return 'creator'
    const handle = String(e.creatorHandle || '').replace('@', '').toLowerCase()
    if (handle && id === handle) return 'creator'
  }
  return null
}

/** True when the actor is allowed to perform an action reserved for `required` parties. */
function hasPartyAccess(e, actor, required = []) {
  if (!required.length) return true
  if (actor.role === 'Admin') return true

  const party = resolveParty(e, actor)
  if (party && required.includes(party)) return true

  // Demo brand bypass for frictionless prototype testing.
  if (actor.email === 'demo@genra.ai' && required.includes('brand')) return true

  // Seed creators have no linked account email – allow a signed-in Creator
  // account to act as the creator when the link cannot be verified.
  if (!e.creatorEmail && actor.role === 'Creator' && required.includes('creator')) return true

  return false
}

function canPerform(e, actor, target) {
  return hasPartyAccess(e, actor, TRANSITION_ROLES[target] || [])
}

const DEFAULT_NOTES = {
  viewed: 'Invitation viewed',
  proposal: 'Proposal submitted',
  shortlisted: 'Creator shortlisted',
  hired: 'Creator hired',
  in_progress: 'Work started',
  delivered: 'Deliverables submitted',
  completed: 'Engagement completed',
  declined: 'Invitation declined',
  cancelled: 'Engagement cancelled',
}

// ─── In-memory store ─────────────────────────────────────────────────────────
let memEngagements = []
let engagementCounter = 1

// ─── Create engagement (invite) ───────────────────────────────────────────────
export async function createEngagement({
  briefId,
  creatorId,
  initiatedBy = '',
  initiatedByName = '',
  creatorEmail = '',
  message = '',
  agreedBudget = null,
  dueDate = null,
  deliverablesTotal = 0,
}) {
  // Resolve brief + creator names for denormalization
  let briefTitle = ''
  let briefBrand = ''
  let creatorName = ''
  let creatorHandle = ''
  try {
    const brief = await import('./briefService.mjs').then((m) => m.getBriefById(briefId))
    if (brief) {
      briefTitle = brief.title || ''
      briefBrand = typeof brief.brand === 'string' ? brief.brand : brief.brand?.name || ''
      if (dueDate == null && brief.deadline) dueDate = brief.deadline
    }
  } catch {}
  try {
    const creator = await import('./creatorService.mjs').then((m) => m.getCreatorById(creatorId))
    if (creator) {
      creatorName = creator.name || ''
      creatorHandle = creator.handle || ''
      if (!creatorEmail && creator.email) creatorEmail = creator.email
    }
  } catch {}

  const messages = message
    ? [{ from: initiatedBy, fromName: initiatedByName || 'Brand', body: message, sentAt: new Date(), read: false }]
    : []

  if (isDbConnected()) {
    const existing = await Engagement.findOne({ brief: briefId, creator: creatorId })
    if (existing) {
      ensureCollections(existing)
      existing.status = 'invited'
      existing.initiatedBy = initiatedBy || existing.initiatedBy
      existing.initiatedByName = initiatedByName || existing.initiatedByName
      if (creatorEmail) existing.creatorEmail = creatorEmail
      if (message) existing.messages.push({ from: initiatedBy, fromName: initiatedByName || 'Brand', body: message, sentAt: new Date(), read: false })
      pushHistory(existing, 'invited', { email: initiatedBy, role: 'Brand' }, 'Invitation (re)sent')
      await existing.save()
      return normalizeEngagement(existing)
    }
    const created = await Engagement.create({
      brief: briefId,
      creator: creatorId,
      briefTitle,
      briefBrand,
      creatorName,
      creatorHandle,
      creatorEmail,
      initiatedBy,
      initiatedByName,
      status: 'invited',
      messages,
      agreedBudget,
      dueDate,
      deliverablesTotal: Number(deliverablesTotal) || 0,
      statusHistory: [
        { status: 'invited', actor: initiatedBy || 'system', actorRole: 'Brand', note: 'Invitation sent', at: new Date() },
      ],
    })
    return normalizeEngagement(created)
  }

  // Memory fallback
  const existingIdx = memEngagements.findIndex(
    (e) => String(e.brief) === String(briefId) && String(e.creator) === String(creatorId)
  )
  if (existingIdx !== -1) {
    const e = memEngagements[existingIdx]
    ensureCollections(e)
    e.status = 'invited'
    e.initiatedBy = initiatedBy || e.initiatedBy
    e.initiatedByName = initiatedByName || e.initiatedByName
    if (creatorEmail) e.creatorEmail = creatorEmail
    if (message) e.messages.push({ from: initiatedBy, fromName: initiatedByName || 'Brand', body: message, sentAt: new Date(), read: false })
    pushHistory(e, 'invited', { email: initiatedBy, role: 'Brand' }, 'Invitation (re)sent')
    return normalizeEngagement(e)
  }

  const newEngagement = {
    _id: `eng-${String(engagementCounter++).padStart(3, '0')}`,
    id: `eng-${String(engagementCounter - 1).padStart(3, '0')}`,
    brief: briefId,
    creator: creatorId,
    briefTitle,
    briefBrand,
    creatorName,
    creatorHandle,
    creatorEmail,
    initiatedBy,
    initiatedByName,
    status: 'invited',
    messages,
    proposal: {},
    revisions: [],
    revisionCount: 0,
    statusHistory: [
      { status: 'invited', actor: initiatedBy || 'system', actorRole: 'Brand', note: 'Invitation sent', at: new Date() },
    ],
    agreedBudget,
    dueDate,
    deliverablesTotal: Number(deliverablesTotal) || 0,
    deliverablesSubmitted: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  memEngagements.push(newEngagement)
  return normalizeEngagement(newEngagement)
}

// ─── List engagements ─────────────────────────────────────────────────────────
export async function listEngagements({
  briefId,
  creatorId,
  ownerEmail,
  creatorEmail,
  creatorName,
  participantEmail,
  status,
  page = 1,
  limit = 20,
} = {}) {
  const skip = (Number(page) - 1) * Number(limit)
  const statusFilter = status ? canonicalStatus(status) : null

  if (isDbConnected()) {
    const filter = {}
    if (briefId) filter.brief = briefId
    if (creatorId) filter.creator = creatorId
    if (ownerEmail) filter.initiatedBy = String(ownerEmail).toLowerCase()
    if (creatorEmail) filter.creatorEmail = String(creatorEmail).toLowerCase()
    if (creatorName) filter.creatorName = new RegExp(`^${escapeRegex(String(creatorName))}$`, 'i')
    if (participantEmail) {
      filter.$or = [
        { initiatedBy: String(participantEmail).toLowerCase() },
        { creatorEmail: String(participantEmail).toLowerCase() },
      ]
    }
    if (statusFilter) filter.status = statusFilter

    const [items, total] = await Promise.all([
      Engagement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Engagement.countDocuments(filter),
    ])
    return {
      items: items.map(normalizeEngagement),
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)) || 1,
    }
  }

  // Memory
  let list = [...memEngagements]
  if (briefId) list = list.filter((e) => String(e.brief) === String(briefId))
  if (creatorId) list = list.filter((e) => String(e.creator) === String(creatorId))
  if (ownerEmail) list = list.filter((e) => String(e.initiatedBy).toLowerCase() === String(ownerEmail).toLowerCase())
  if (creatorEmail) list = list.filter((e) => String(e.creatorEmail).toLowerCase() === String(creatorEmail).toLowerCase())
  if (creatorName) list = list.filter((e) => String(e.creatorName).toLowerCase() === String(creatorName).toLowerCase())
  if (participantEmail) {
    const p = String(participantEmail).toLowerCase()
    list = list.filter((e) => String(e.initiatedBy).toLowerCase() === p || String(e.creatorEmail).toLowerCase() === p)
  }
  if (statusFilter) list = list.filter((e) => canonicalStatus(e.status) === statusFilter)
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const items = list.slice(skip, skip + Number(limit))
  return {
    items: items.map(normalizeEngagement),
    total: list.length,
    page: Number(page),
    pages: Math.ceil(list.length / Number(limit)) || 1,
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Get single engagement ────────────────────────────────────────────────────
export async function getEngagementById(id) {
  const raw = await loadRaw(id)
  return normalizeEngagement(raw)
}

// ─── Submit a proposal (creator) ──────────────────────────────────────────────
export async function submitProposal(id, data = {}, actorInput = '') {
  const actor = normalizeActor(actorInput)
  const raw = await loadRaw(id)
  if (!raw) return null
  const e = normalizeEngagement(raw)

  if (!['invited', 'viewed', 'proposal'].includes(e.status)) {
    throw new TransitionError(`Cannot submit a proposal from "${e.status}"`)
  }
  if (!hasPartyAccess(e, actor, ['creator'])) {
    throw new PermissionError('Only the invited creator can submit a proposal for this engagement')
  }

  const coverLetter = String(data.coverLetter || data.message || '').trim()
  if (!coverLetter) throw new ValidationError('coverLetter is required')

  let proposedBudget = null
  if (data.proposedBudget != null && data.proposedBudget !== '') {
    proposedBudget = Number(data.proposedBudget)
    if (Number.isNaN(proposedBudget) || proposedBudget < 0) {
      throw new ValidationError('proposedBudget must be a non-negative number')
    }
  }

  raw.status = 'proposal'
  raw.proposal = {
    coverLetter,
    proposedBudget,
    proposedTimeline: String(data.proposedTimeline || '').trim(),
    deliverableCount: data.deliverableCount != null ? Number(data.deliverableCount) : null,
    submittedBy: actor.email || actor.id,
    submittedAt: new Date(),
  }
  if (proposedBudget != null) raw.agreedBudget = proposedBudget

  pushHistory(raw, 'proposal', actor, 'Proposal submitted')
  await saveRaw(raw)
  return normalizeEngagement(raw)
}

// ─── Request a revision with feedback (brand) ─────────────────────────────────
export async function requestRevision(id, feedback, actorInput = '') {
  const actor = normalizeActor(actorInput)
  const text = String(feedback || '').trim()
  if (!text) throw new ValidationError('Revision feedback is required')

  const raw = await loadRaw(id)
  if (!raw) return null
  const e = normalizeEngagement(raw)

  if (e.status !== 'delivered') {
    throw new TransitionError(`Revisions can only be requested on a delivered engagement (current: "${e.status}")`)
  }
  if (!hasPartyAccess(e, actor, ['brand'])) {
    throw new PermissionError('Only the brand can request revisions for this engagement')
  }

  ensureCollections(raw)
  raw.revisions.push({
    feedback: text,
    requestedBy: actor.email || actor.id || 'brand',
    requestedByName: actor.name || '',
    createdAt: new Date(),
    resolvedAt: null,
  })
  raw.revisionCount = (Number(raw.revisionCount) || 0) + 1
  raw.status = 'in_progress'
  pushHistory(raw, 'in_progress', actor, `Revision requested: ${text}`)
  await saveRaw(raw)
  return normalizeEngagement(raw)
}

// ─── Update engagement status ─────────────────────────────────────────────────
export async function updateEngagementStatus(id, newStatusRaw, actorInput = '', options = {}) {
  const actor = normalizeActor(actorInput)
  const target = canonicalStatus(newStatusRaw)
  if (!target) throw new ValidationError(`Invalid status: ${newStatusRaw}`)

  const raw = await loadRaw(id)
  if (!raw) return null
  const e = normalizeEngagement(raw)

  const allowed = VALID_TRANSITIONS[e.status] || []
  if (!allowed.includes(target)) {
    throw new TransitionError(`Cannot transition from "${e.status}" to "${target}"`)
  }
  if (!canPerform(e, actor, target)) {
    throw new PermissionError(`Your account cannot move this engagement to "${target}"`)
  }

  const note = String(options.note || '').trim()
  const feedback = String(options.feedback || '').trim()
  ensureCollections(raw)

  if (target === 'in_progress' && e.status === 'delivered' && feedback) {
    raw.revisions.push({
      feedback,
      requestedBy: actor.email || actor.id || 'brand',
      requestedByName: actor.name || '',
      createdAt: new Date(),
      resolvedAt: null,
    })
    raw.revisionCount = (Number(raw.revisionCount) || 0) + 1
  }

  if (target === 'delivered') {
    const total = Number(raw.deliverablesTotal) || 0
    const submitted = Number(raw.deliverablesSubmitted) || 0
    raw.deliverablesSubmitted = total > 0 ? Math.min(total, submitted + 1) : submitted + 1
  }

  if (target === 'completed') {
    raw.revisions.forEach((r) => {
      if (!r.resolvedAt) r.resolvedAt = new Date()
    })
  }

  if (options.agreedBudget != null && options.agreedBudget !== '') {
    raw.agreedBudget = Number(options.agreedBudget)
  } else if (target === 'hired' && (raw.agreedBudget == null) && raw.proposal?.proposedBudget != null) {
    raw.agreedBudget = raw.proposal.proposedBudget
  }

  raw.status = target
  pushHistory(raw, target, actor, note || DEFAULT_NOTES[target] || `Status moved to ${target}`)
  await saveRaw(raw)
  return normalizeEngagement(raw)
}

// ─── Post a message ───────────────────────────────────────────────────────────
export async function postMessage(engagementId, { from = '', fromName = '', body } = {}) {
  if (!body || !body.trim()) throw new ValidationError('message body is required')
  const raw = await loadRaw(engagementId)
  if (!raw) return null

  const msg = { from, fromName, body: body.trim(), sentAt: new Date(), read: false }
  ensureCollections(raw)
  raw.messages.push(msg)
  await saveRaw(raw)
  return normalizeEngagement(raw)
}

// ─── Mark messages as read ────────────────────────────────────────────────────
export async function markMessagesRead(engagementId, readerEmail = '') {
  const raw = await loadRaw(engagementId)
  if (!raw) return null
  ensureCollections(raw)

  const reader = String(readerEmail || '').toLowerCase()
  raw.messages = raw.messages.map((m) => {
    const from = String(m.from || '').toLowerCase()
    return from !== reader ? { ...(typeof m.toObject === 'function' ? m.toObject() : m), read: true } : m
  })
  await saveRaw(raw)
  return normalizeEngagement(raw)
}

export { ENGAGEMENT_STATUSES }
