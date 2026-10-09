import mongoose from 'mongoose'
import { Creator } from '../models/Creator.mjs'
import { creators as seedCreators } from '../seed-data.mjs'

// In-memory working copy initialized from seed data
let memoryCreators = seedCreators.map((c) => normalizeCreator(c))

export function normalizeCreator(c) {
  if (!c) return null
  const data = typeof c.toObject === 'function' ? c.toObject() : { ...c }
  const id = String(data._id || data.id)
  const price = Number(data.price ?? data.pricing?.from ?? 1000)
  const verificationScore = Number(data.verificationScore ?? data.verification?.score ?? 80)
  const specialties = data.specialties || data.specializations || []
  const specializations = data.specializations || data.specialties || []
  const verified = data.verified ?? verificationScore >= 80
  const mark =
    data.mark ||
    (data.name
      ? data.name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()
      : 'CR')

  // Normalize tools: both structured objects and names
  const rawTools = Array.isArray(data.tools) ? data.tools : []
  const tools = rawTools.map((t) =>
    typeof t === 'string' ? { name: t, kind: 'video', verified: true } : t
  )
  const toolNames = tools.map((t) => t.name)

  const portfolio = (Array.isArray(data.portfolio) ? data.portfolio : []).map((p, idx) => {
    const pId = String(p._id || p.id || `port-${idx + 1}`)
    const pTools = p.tools || p.toolsUsed || []
    return {
      _id: pId,
      id: pId,
      title: p.title || 'Untitled Work',
      type: p.type || 'Brand film',
      gradient: p.gradient || 'linear-gradient(140deg,#131d31 0%,#7c23a9 46%,#fb5a31 100%)',
      mediaUrl: p.mediaUrl || '',
      thumbUrl: p.thumbUrl || '',
      tools: pTools,
      toolsUsed: pTools,
      aspectRatio: p.aspectRatio || '16:9',
      durationSec: p.durationSec || 30,
      year: String(p.year || '2025'),
      pastWorkVerified: p.pastWorkVerified ?? true,
      createdAt: p.createdAt || new Date().toISOString(),
    }
  })

  return {
    ...data,
    _id: id,
    id,
    mark,
    specialties,
    specializations,
    tools,
    toolNames,
    pricing: data.pricing || { from: price, currency: 'USD', unit: 'per-project' },
    price,
    rating: Number(data.rating ?? 4.9),
    verified,
    verification: data.verification || {
      toolsVerified: true,
      workflowVerified: true,
      pastWorkVerified: false,
      score: verificationScore,
    },
    verificationScore,
    stats: data.stats || { projects: 25, repeat: 75, turnaround: '4–6 days' },
    portfolio,
  }
}

function isDbConnected() {
  return mongoose.connection.readyState === 1
}

// 1. List Creators with Search, Filters, Sorting, and Pagination
export async function listCreators(params = {}) {
  const q = String(params.q || '').trim().toLowerCase()
  const skills = String(params.skills || '')
    .split(',')
    .filter(Boolean)
    .map((s) => s.trim().toLowerCase())
  const tools = String(params.tools || '')
    .split(',')
    .filter(Boolean)
    .map((t) => t.trim().toLowerCase())
  const specializations = String(params.specializations || params.specialties || '')
    .split(',')
    .filter(Boolean)
    .map((s) => s.trim().toLowerCase())
  const formats = String(params.formats || params.format || '')
    .split(',')
    .filter(Boolean)
    .map((f) => f.trim())
  const verifiedOnly = params.verifiedOnly === 'true' || params.verifiedOnly === true
  const availability = params.availability ? String(params.availability).toLowerCase() : ''
  const commercialUse =
    params.commercialUse !== undefined ? String(params.commercialUse) === 'true' : null
  const minPrice = params.minPrice ? Number(params.minPrice) : null
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : null
  const sort = String(params.sort || 'relevance').toLowerCase()
  const page = Math.max(1, Number(params.page || 1))
  const limit = Math.max(1, Math.min(100, Number(params.limit || 12)))

  let allCreators = []

  if (isDbConnected()) {
    try {
      const docs = await Creator.find({}).lean()
      allCreators = docs.map((doc) => normalizeCreator(doc))
    } catch (err) {
      console.warn('[CreatorService] MongoDB query failed, falling back to memory:', err.message)
      allCreators = memoryCreators.map((c) => normalizeCreator(c))
    }
  } else {
    allCreators = memoryCreators.map((c) => normalizeCreator(c))
  }

  // Filter items
  const filtered = allCreators.filter((creator) => {
    // Search text match
    if (q) {
      const searchSpace = [
        creator.name,
        creator.handle,
        creator.headline,
        creator.bio,
        ...(creator.specializations || []),
        ...(creator.specialties || []),
        ...(creator.skills || []),
        ...(creator.toolNames || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!searchSpace.includes(q)) return false
    }

    // Skills filter
    if (skills.length > 0) {
      const creatorSkills = (creator.skills || []).map((s) => s.toLowerCase())
      const hasSkill = skills.some((s) => creatorSkills.some((cs) => cs.includes(s)))
      if (!hasSkill) return false
    }

    // Tools filter
    if (tools.length > 0) {
      const creatorTools = (creator.tools || []).map((t) => (t.name || t).toLowerCase())
      const hasTool = tools.some((t) => creatorTools.includes(t))
      if (!hasTool) return false
    }

    // Specializations filter
    if (specializations.length > 0) {
      const creatorSpecs = [
        ...(creator.specializations || []),
        ...(creator.specialties || []),
      ].map((s) => s.toLowerCase().replace(/-/g, ' '))
      const hasSpec = specializations.some((s) => {
        const target = s.toLowerCase().replace(/-/g, ' ')
        return creatorSpecs.some((cs) => cs.includes(target))
      })
      if (!hasSpec) return false
    }

    // Formats filter
    if (formats.length > 0) {
      const creatorFormats = creator.formats || []
      const hasFormat = formats.some((f) => creatorFormats.includes(f))
      if (!hasFormat) return false
    }

    // Verification
    if (verifiedOnly && creator.verificationScore < 80) return false

    // Availability
    if (availability && String(creator.availability).toLowerCase() !== availability) {
      return false
    }

    // Commercial Use
    if (commercialUse !== null && creator.commercialUse !== commercialUse) {
      return false
    }

    // Pricing filters
    if (minPrice !== null && creator.price < minPrice) return false
    if (maxPrice !== null && creator.price > maxPrice) return false

    return true
  })

  // Sorting
  filtered.sort((a, b) => {
    if (sort === 'rating') return (b.rating || 0) - (a.rating || 0)
    if (sort === 'price' || sort === 'priceasc') return (a.price || 0) - (b.price || 0)
    if (sort === 'pricedesc') return (b.price || 0) - (a.price || 0)
    if (sort === 'newest' || sort === 'score') {
      return (b.verificationScore || 0) - (a.verificationScore || 0)
    }
    return 0
  })

  // Compute facets over filtered results
  const facets = { tools: {}, skills: {}, specializations: {} }
  filtered.forEach((creator) => {
    ;(creator.tools || []).forEach((tool) => {
      const name = tool.name || tool
      facets.tools[name] = (facets.tools[name] || 0) + 1
    })
    ;(creator.skills || []).forEach((skill) => {
      facets.skills[skill] = (facets.skills[skill] || 0) + 1
    })
    ;(creator.specializations || []).forEach((spec) => {
      facets.specializations[spec] = (facets.specializations[spec] || 0) + 1
    })
  })

  // Pagination
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
    facets,
  }
}

// 2. Details
export async function getCreatorById(idOrHandle) {
  if (!idOrHandle) return null
  const queryStr = String(idOrHandle).toLowerCase()

  if (isDbConnected()) {
    try {
      const doc = await Creator.findOne({
        $or: [
          { _id: queryStr },
          { id: queryStr },
          { handle: queryStr },
          { handle: `@${queryStr}` },
        ],
      }).lean()
      if (doc) return normalizeCreator(doc)
    } catch (err) {
      console.warn('[CreatorService] MongoDB findOne failed:', err.message)
    }
  }

  const found = memoryCreators.find(
    (c) =>
      c._id.toLowerCase() === queryStr ||
      c.id.toLowerCase() === queryStr ||
      c.handle.toLowerCase() === queryStr ||
      c.handle.toLowerCase() === `@${queryStr}`
  )

  return found ? normalizeCreator(found) : null
}

// 3. Create Creator
export async function createCreator(data) {
  if (!data?.name?.trim() || !data?.handle?.trim()) {
    throw new Error('Name and handle are required')
  }

  const handle = data.handle.startsWith('@') ? data.handle.trim() : `@${data.handle.trim()}`
  const existing = await getCreatorById(handle)
  if (existing) {
    throw new Error(`A creator with handle "${handle}" already exists`)
  }

  const id =
    data._id ||
    data.id ||
    handle.replace('@', '').toLowerCase().replace(/[^a-z0-9_-]/g, '') ||
    `creator-${Date.now()}`

  const newCreator = normalizeCreator({
    ...data,
    _id: id,
    id,
    handle,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  if (isDbConnected()) {
    try {
      const doc = await Creator.create(newCreator)
      return normalizeCreator(doc)
    } catch (err) {
      console.warn('[CreatorService] MongoDB create failed, saving in memory:', err.message)
    }
  }

  memoryCreators.unshift(newCreator)
  return newCreator
}

// 4. Update Creator
export async function updateCreator(id, data) {
  const existing = await getCreatorById(id)
  if (!existing) return null

  const updatedPayload = {
    ...existing,
    ...data,
    _id: existing._id,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  }

  const normalized = normalizeCreator(updatedPayload)

  if (isDbConnected()) {
    try {
      const doc = await Creator.findByIdAndUpdate(existing._id, normalized, {
        new: true,
      }).lean()
      if (doc) return normalizeCreator(doc)
    } catch (err) {
      console.warn('[CreatorService] MongoDB update failed:', err.message)
    }
  }

  const idx = memoryCreators.findIndex((c) => c._id === existing._id)
  if (idx >= 0) {
    memoryCreators[idx] = normalized
  }
  return normalized
}

// 5. Delete Creator
export async function deleteCreator(id) {
  const existing = await getCreatorById(id)
  if (!existing) return false

  if (isDbConnected()) {
    try {
      await Creator.findByIdAndDelete(existing._id)
    } catch (err) {
      console.warn('[CreatorService] MongoDB delete failed:', err.message)
    }
  }

  memoryCreators = memoryCreators.filter((c) => c._id !== existing._id)
  return true
}

// 6. Portfolio: List
export async function getPortfolio(creatorId) {
  const creator = await getCreatorById(creatorId)
  if (!creator) return null
  return creator.portfolio || []
}

// 7. Portfolio: Add Item
export async function addPortfolioItem(creatorId, itemData) {
  if (!itemData?.title?.trim()) {
    throw new Error('Portfolio item title is required')
  }

  const creator = await getCreatorById(creatorId)
  if (!creator) return null

  const newItem = {
    _id: itemData._id || itemData.id || `port-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    id: itemData.id || itemData._id || `port-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: itemData.title.trim(),
    type: itemData.type || 'Brand film',
    gradient:
      itemData.gradient || 'linear-gradient(140deg,#131d31 0%,#7c23a9 46%,#fb5a31 100%)',
    mediaUrl: itemData.mediaUrl || '',
    thumbUrl: itemData.thumbUrl || '',
    tools: itemData.tools || itemData.toolsUsed || [],
    toolsUsed: itemData.toolsUsed || itemData.tools || [],
    aspectRatio: itemData.aspectRatio || '16:9',
    durationSec: Number(itemData.durationSec || 30),
    year: String(itemData.year || '2025'),
    pastWorkVerified: itemData.pastWorkVerified ?? true,
    createdAt: new Date().toISOString(),
  }

  const updatedPortfolio = [newItem, ...(creator.portfolio || [])]
  await updateCreator(creator._id, { portfolio: updatedPortfolio })
  return newItem
}

// 8. Portfolio: Update Item
export async function updatePortfolioItem(creatorId, itemId, itemData) {
  const creator = await getCreatorById(creatorId)
  if (!creator) return null

  const itemIdx = (creator.portfolio || []).findIndex(
    (p) => String(p._id) === String(itemId) || String(p.id) === String(itemId)
  )
  if (itemIdx < 0) return null

  const existingItem = creator.portfolio[itemIdx]
  const updatedItem = {
    ...existingItem,
    ...itemData,
    _id: existingItem._id,
    id: existingItem.id,
    tools: itemData.tools || itemData.toolsUsed || existingItem.tools,
    toolsUsed: itemData.toolsUsed || itemData.tools || existingItem.toolsUsed,
    updatedAt: new Date().toISOString(),
  }

  const updatedPortfolio = [...creator.portfolio]
  updatedPortfolio[itemIdx] = updatedItem

  await updateCreator(creator._id, { portfolio: updatedPortfolio })
  return updatedItem
}

// 9. Portfolio: Delete Item
export async function deletePortfolioItem(creatorId, itemId) {
  const creator = await getCreatorById(creatorId)
  if (!creator) return false

  const itemIdx = (creator.portfolio || []).findIndex(
    (p) => String(p._id) === String(itemId) || String(p.id) === String(itemId)
  )
  if (itemIdx < 0) return false

  const updatedPortfolio = creator.portfolio.filter(
    (p) => String(p._id) !== String(itemId) && String(p.id) !== String(itemId)
  )

  await updateCreator(creator._id, { portfolio: updatedPortfolio })
  return true
}

// Seed helper for database sync
export async function seedCreatorsToDatabase() {
  if (!isDbConnected()) return false
  const count = await Creator.countDocuments()
  if (count === 0) {
    console.log('[CreatorService] Seeding initial creators to MongoDB...')
    const docs = memoryCreators.map((c) => ({ ...c }))
    await Creator.insertMany(docs)
    console.log(`[CreatorService] Successfully seeded ${docs.length} creators into MongoDB.`)
  }
  return true
}
