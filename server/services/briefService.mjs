import mongoose from 'mongoose'
import { Brief } from '../models/Brief.mjs'
import { briefs as seedBriefs } from '../seed-data.mjs'
import { listCreators } from './creatorService.mjs'
import { rankCreatorsForBrief } from './matchingEngine.mjs'

// In-memory working copy initialized from seed data
let memoryBriefs = seedBriefs.map((b) => normalizeBrief(b))

export class OwnershipError extends Error {
  constructor(message = 'Unauthorized: You do not own this brief') {
    super(message)
    this.name = 'OwnershipError'
    this.statusCode = 403
  }
}

export function normalizeBrief(b) {
  if (!b) return null
  const data = typeof b.toObject === 'function' ? b.toObject() : { ...b }
  const id = String(data._id || data.id)
  const title = data.title || 'Untitled Brief'

  const brandRaw = data.brand
  const brandName = typeof brandRaw === 'string' ? brandRaw : brandRaw?.name || 'Aster & Co.'
  const brandCompany =
    typeof brandRaw === 'object' && brandRaw !== null
      ? brandRaw.company || brandName
      : brandName
  const brandContactEmail =
    typeof brandRaw === 'object' && brandRaw !== null
      ? brandRaw.contactEmail || 'hello@aster.example'
      : 'hello@aster.example'
  const brandOwnerId =
    typeof brandRaw === 'object' && brandRaw !== null ? brandRaw.ownerId || '' : ''

  const brandDetails = {
    name: brandName,
    company:
      (typeof brandRaw === 'object' && brandRaw?.company) ||
      data.brandDetails?.company ||
      brandName,
    contactEmail:
      (typeof brandRaw === 'object' && brandRaw?.contactEmail) ||
      data.brandDetails?.contactEmail ||
      'brand@example.com',
    ownerId:
      (typeof brandRaw === 'object' && brandRaw?.ownerId) ||
      data.brandDetails?.ownerId ||
      '',
  }

  const rawStatus = String(data.status || 'published').toLowerCase()
  const statusFormatted =
    rawStatus === 'in-review'
      ? 'In review'
      : rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)

  const contentType = data.contentType || data.type || 'Brand film'
  const campaignDescription = data.campaignDescription || data.description || ''
  const description = data.description || data.campaignDescription || ''
  const style = Array.isArray(data.style) ? data.style : ['Cinematic']
  const formats = Array.isArray(data.formats) ? data.formats : ['16:9']
  const requiredTools = Array.isArray(data.requiredTools)
    ? data.requiredTools
    : Array.isArray(data.tools)
      ? data.tools
      : []
  const requiredSkills = Array.isArray(data.requiredSkills)
    ? data.requiredSkills
    : Array.isArray(data.skills)
      ? data.skills
      : []

  const budgetRaw = data.budget
  let budgetObj = { min: 4000, max: 8000, currency: 'USD' }
  let formattedBudget = '$4k – $8k'

  if (typeof budgetRaw === 'string') {
    formattedBudget = budgetRaw
    const nums = budgetRaw.match(/\d+/g)
    if (nums && nums.length >= 2) {
      budgetObj = {
        min: Number(nums[0]) * (budgetRaw.includes('k') ? 1000 : 1),
        max: Number(nums[1]) * (budgetRaw.includes('k') ? 1000 : 1),
        currency: 'USD',
      }
    }
  } else if (typeof budgetRaw === 'object' && budgetRaw !== null) {
    budgetObj = {
      min: Number(budgetRaw.min || 4000),
      max: Number(budgetRaw.max || 8000),
      currency: budgetRaw.currency || 'USD',
    }
    formattedBudget = `$${Math.round(budgetObj.min / 1000)}k – $${Math.round(budgetObj.max / 1000)}k`
  }

  return {
    ...data,
    _id: id,
    id,
    title,
    brand: brandName,
    brandDetails,
    status: statusFormatted,
    rawStatus,
    contentType,
    type: contentType,
    campaignDescription,
    description,
    style,
    formats,
    requiredTools,
    tools: requiredTools,
    requiredSkills,
    skills: requiredSkills,
    deliverables: Number(data.deliverables || 3),
    budget: formattedBudget,
    budgetValue: budgetObj,
    deadline: data.deadline || 'Nov 18, 2026',
    usage: data.usage || {
      commercialUse: true,
      channels: ['paid-social', 'web'],
      territories: ['Global'],
      durationMonths: 12,
      exclusivity: false,
      requireProvenance: true,
    },
    invitedCreators: data.invitedCreators || [],
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
  }
}

function isDbConnected() {
  return mongoose.connection.readyState === 1
}

function verifyOwnership(brief, userContext = {}) {
  const userEmail = (userContext.email || '').trim().toLowerCase()
  const userId = (userContext.id || '').trim().toLowerCase()

  // If no user context provided, allow internal operations
  if (!userEmail && !userId) return true

  // Demo user bypass for frictionless prototype testing
  if (userEmail === 'demo@genra.ai') return true

  const briefEmail = (brief.brandDetails?.contactEmail || '').trim().toLowerCase()
  const briefOwnerId = (brief.brandDetails?.ownerId || '').trim().toLowerCase()

  // Match on email or owner id
  if (userEmail && briefEmail && userEmail === briefEmail) return true
  if (userId && briefOwnerId && userId === briefOwnerId) return true

  // Allow modifying the initial seed briefs in guest demo mode
  if (
    (brief._id === 'brief-01' || brief._id === 'brief-02' || brief._id === 'brief-03') &&
    !briefOwnerId
  ) {
    return true
  }

  throw new OwnershipError(
    `Access denied: Brief is owned by ${brief.brandDetails?.contactEmail || 'another brand'}`
  )
}

// 1. List Briefs
export async function listBriefs(params = {}) {
  const q = String(params.q || '').trim().toLowerCase()
  const status = String(params.status || '').trim().toLowerCase()
  const contentType = String(params.contentType || params.type || '').trim().toLowerCase()
  const brand = String(params.brand || '').trim().toLowerCase()
  const page = Math.max(1, Number(params.page || 1))
  const limit = Math.max(1, Math.min(100, Number(params.limit || 20)))

  let allBriefs = []

  if (isDbConnected()) {
    try {
      const docs = await Brief.find({}).lean()
      allBriefs = docs.map((doc) => normalizeBrief(doc))
    } catch (err) {
      console.warn('[BriefService] MongoDB query failed, falling back to memory:', err.message)
      allBriefs = memoryBriefs.map((b) => normalizeBrief(b))
    }
  } else {
    allBriefs = memoryBriefs.map((b) => normalizeBrief(b))
  }

  const filtered = allBriefs.filter((brief) => {
    if (q) {
      const searchSpace = [
        brief.title,
        brief.brand,
        brief.description,
        brief.campaignDescription,
        ...(brief.style || []),
        ...(brief.tools || []),
      ]
        .join(' ')
        .toLowerCase()
      if (!searchSpace.includes(q)) return false
    }

    if (status && brief.rawStatus !== status && brief.status.toLowerCase() !== status) {
      return false
    }

    if (contentType && brief.contentType.toLowerCase() !== contentType && brief.type.toLowerCase() !== contentType) {
      return false
    }

    if (brand && !brief.brand.toLowerCase().includes(brand) && !brief.brandDetails.contactEmail.toLowerCase().includes(brand)) {
      return false
    }

    return true
  })

  // Sort newest first
  filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

  const total = filtered.length
  const totalPages = Math.ceil(total / limit) || 1
  const startIndex = (page - 1) * limit
  const paginatedItems = filtered.slice(startIndex, startIndex + limit)

  return {
    items: paginatedItems,
    total,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
  }
}

// 2. Details
export async function getBriefById(id) {
  if (!id) return null
  const queryId = String(id).trim().toLowerCase()

  if (isDbConnected()) {
    try {
      const doc = await Brief.findOne({
        $or: [{ _id: queryId }, { id: queryId }],
      }).lean()
      if (doc) return normalizeBrief(doc)
    } catch (err) {
      console.warn('[BriefService] MongoDB findOne failed:', err.message)
    }
  }

  const found = memoryBriefs.find(
    (b) => b._id.toLowerCase() === queryId || b.id.toLowerCase() === queryId
  )
  return found ? normalizeBrief(found) : null
}

// 3. Create Brief
export async function createBrief(data = {}, userContext = {}) {
  const title = String(data.title || '').trim()
  if (!title) {
    throw new Error('Brief title is required')
  }

  const brandRaw = data.brand
  const brandName =
    typeof brandRaw === 'string'
      ? brandRaw.trim()
      : brandRaw?.name?.trim() || userContext.name || 'Demo Brand'
  if (!brandName) {
    throw new Error('Brand name is required')
  }

  const contactEmail =
    (typeof brandRaw === 'object' && brandRaw?.contactEmail) ||
    userContext.email ||
    'brand@example.com'
  const ownerId =
    (typeof brandRaw === 'object' && brandRaw?.ownerId) || userContext.id || ''

  // Validate budget
  const budget = data.budget || { min: 4000, max: 8000, currency: 'USD' }
  if (typeof budget === 'object' && budget !== null) {
    const min = Number(budget.min || 0)
    const max = Number(budget.max || 0)
    if (min < 0 || max < 0) {
      throw new Error('Budget bounds must be non-negative')
    }
    if (min > 0 && max > 0 && min > max) {
      throw new Error('Budget minimum cannot exceed budget maximum')
    }
  }

  const id = data._id || data.id || `brief-${Date.now()}`
  const newBrief = normalizeBrief({
    ...data,
    _id: id,
    id,
    title,
    brand: {
      name: brandName,
      company: (typeof brandRaw === 'object' && brandRaw?.company) || brandName,
      contactEmail,
      ownerId,
    },
    status: data.status || 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  if (isDbConnected()) {
    try {
      const doc = await Brief.create(newBrief)
      return normalizeBrief(doc)
    } catch (err) {
      console.warn('[BriefService] MongoDB create failed, saving in memory:', err.message)
    }
  }

  memoryBriefs.unshift(newBrief)
  return newBrief
}

// 4. Update Brief
export async function updateBrief(id, data = {}, userContext = {}) {
  const existing = await getBriefById(id)
  if (!existing) return null

  verifyOwnership(existing, userContext)

  // Validate budget if provided
  if (data.budget && typeof data.budget === 'object') {
    const min = Number(data.budget.min || 0)
    const max = Number(data.budget.max || 0)
    if (min < 0 || max < 0) {
      throw new Error('Budget bounds must be non-negative')
    }
    if (min > 0 && max > 0 && min > max) {
      throw new Error('Budget minimum cannot exceed budget maximum')
    }
  }

  const updatedPayload = {
    ...existing,
    ...data,
    _id: existing._id,
    id: existing.id,
    brand: {
      ...existing.brandDetails,
      ...(typeof data.brand === 'object' ? data.brand : {}),
    },
    updatedAt: new Date().toISOString(),
  }

  const normalized = normalizeBrief(updatedPayload)

  if (isDbConnected()) {
    try {
      const doc = await Brief.findByIdAndUpdate(existing._id, normalized, {
        new: true,
      }).lean()
      if (doc) return normalizeBrief(doc)
    } catch (err) {
      console.warn('[BriefService] MongoDB update failed:', err.message)
    }
  }

  const idx = memoryBriefs.findIndex((b) => b._id === existing._id)
  if (idx >= 0) {
    memoryBriefs[idx] = normalized
  }
  return normalized
}

// 5. Publish Brief
export async function publishBrief(id, userContext = {}) {
  return updateBrief(id, { status: 'published' }, userContext)
}

// 6. Close Brief
export async function closeBrief(id, userContext = {}) {
  return updateBrief(id, { status: 'closed' }, userContext)
}

// 7. Delete Brief
export async function deleteBrief(id, userContext = {}) {
  const existing = await getBriefById(id)
  if (!existing) return false

  verifyOwnership(existing, userContext)

  if (isDbConnected()) {
    try {
      await Brief.findByIdAndDelete(existing._id)
    } catch (err) {
      console.warn('[BriefService] MongoDB delete failed:', err.message)
    }
  }

  memoryBriefs = memoryBriefs.filter((b) => b._id !== existing._id)
  return true
}

// 8. Calculate Matches
export async function getBriefMatches(briefId) {
  const brief = await getBriefById(briefId)
  if (!brief) return null

  const { items: allCreators } = await listCreators({ limit: 50 })
  return rankCreatorsForBrief(allCreators, brief)
}

// 9. Invite Creator
export async function inviteCreatorToBrief(briefId, creatorId, userContext = {}) {
  const brief = await getBriefById(briefId)
  if (!brief) return null

  verifyOwnership(brief, userContext)

  const currentInvited = new Set(brief.invitedCreators || [])
  currentInvited.add(String(creatorId))

  await updateBrief(brief._id, { invitedCreators: Array.from(currentInvited) }, userContext)

  // Persist a real engagement so the invitation enters the lifecycle workflow.
  const { createEngagement } = await import('./engagementService.mjs')
  return createEngagement({
    briefId: brief._id,
    creatorId,
    initiatedBy: (userContext.email || '').toLowerCase(),
    initiatedByName: userContext.name || '',
    creatorEmail: userContext.creatorEmail || '',
    deliverablesTotal: Number(brief.deliverables || 0),
  })
}
