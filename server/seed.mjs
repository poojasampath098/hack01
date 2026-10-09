/**
 * seed.mjs – MongoDB seed runner
 * Usage: npm run seed
 *
 * Upserts all seed data into MongoDB. Safe to run multiple times.
 */

import mongoose from 'mongoose'
import { creators as seedCreators } from './seed-data.mjs'

// Import models
import { Creator } from './models/Creator.mjs'
import { Brief } from './models/Brief.mjs'
import { User } from './models/User.mjs'
import bcrypt from 'bcryptjs'

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/genra'

async function seed() {
  console.log('🌱 Genra seed runner starting...')
  console.log(`   Connecting to: ${MONGO_URI}`)

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
    console.log('✅ MongoDB connected')
  } catch (err) {
    console.warn('⚠️  MongoDB connection failed:', err.message)
    console.warn('   MongoDB is optional in this project.')
    console.warn('   The API is already running with the in-memory seed (6 creators, 3 briefs, 2 demo users: demo@genra.ai / mara@example.com).')
    console.warn('   No DB seeding performed. Start MongoDB (or set MONGODB_URI) and re-run to persist seed data.')
    process.exitCode = 0
    return
  }

  // ─── Creators ───────────────────────────────────────────────────────────────
  console.log('\n📝 Seeding creators...')
  let createdCount = 0
  let updatedCount = 0

  for (const creator of seedCreators) {
    const id = creator.id || creator._id
    try {
      const result = await Creator.findOneAndUpdate(
        { $or: [{ _id: id }, { handle: creator.handle }] },
        {
          $setOnInsert: { _id: id },
          $set: {
            name: creator.name,
            handle: creator.handle,
            headline: creator.headline,
            bio: creator.bio || '',
            location: creator.location || '',
            specializations: creator.specialties || creator.specializations || [],
            tools: (creator.tools || []).map((t) =>
              typeof t === 'string' ? { name: t, kind: 'video', verified: true } : t
            ),
            formats: creator.formats || [],
            pricing: {
              from: creator.price || 1000,
              currency: 'USD',
              model: 'project',
            },
            verification: {
              score: creator.verificationScore || 80,
              verified: creator.verified ?? true,
              badges: [],
            },
            availability: (creator.availability || 'Open').toLowerCase(),
            portfolio: (creator.portfolio || []).map((p, idx) => ({
              _id: `${id}-port-${idx + 1}`,
              title: p.title,
              type: p.type,
              gradient: p.gradient,
              tools: p.tools || [],
              year: p.year || '2025',
              pastWorkVerified: true,
            })),
            stats: {
              projectsCompleted: creator.stats?.projects || 0,
              repeatClientRate: creator.stats?.repeat || 0,
              avgTurnaroundDays: 5,
            },
            color: creator.color || '#7c23a9',
            mark: creator.mark || creator.name?.slice(0, 2).toUpperCase() || 'CR',
          },
        },
        { upsert: true, new: true, runValidators: false }
      )
      if (result) updatedCount++
      else createdCount++
    } catch (err) {
      console.warn(`   ⚠️  Failed to upsert creator ${creator.name}:`, err.message)
    }
  }
  console.log(`   ✓ Creators: ${createdCount} created, ${updatedCount} updated`)

  // ─── Demo Briefs ─────────────────────────────────────────────────────────────
  console.log('\n📋 Seeding briefs...')
  const briefSeeds = [
    {
      _id: 'brief-01',
      title: 'A new kind of morning',
      brand: { name: 'Aster & Co.', company: 'Aster & Co.', contactEmail: 'hello@aster.example' },
      campaignDescription: 'A 45-second launch film for a ritual-forward coffee system. The visual language should feel tactile, warm, and a little otherworldly.',
      contentType: 'brand-film',
      style: ['Cinematic', 'Minimal', 'Photoreal'],
      formats: ['16:9', '9:16'],
      requiredTools: ['Veo', 'ComfyUI'],
      budget: { min: 8000, max: 12000, currency: 'USD' },
      deadline: new Date('2026-11-18'),
      deliverables: 4,
      status: 'published',
      ownerEmail: 'demo@genra.ai',
      usage: { commercialUse: true, territories: ['Global'], durationMonths: 12, exclusivity: false },
    },
    {
      _id: 'brief-02',
      title: 'Motion with a pulse',
      brand: { name: 'Vanta Records', company: 'Vanta Records', contactEmail: 'team@vanta.example' },
      campaignDescription: 'A modular world for a new electronic record: reactive forms, black chrome, and a visual system that can scale across social and stage.',
      contentType: 'music-video',
      style: ['Surreal', '3D glossy'],
      formats: ['16:9', '1:1', '9:16'],
      requiredTools: ['Kling', 'Suno'],
      budget: { min: 5000, max: 8000, currency: 'USD' },
      deadline: new Date('2026-12-03'),
      deliverables: 8,
      status: 'published',
      ownerEmail: 'demo@genra.ai',
      usage: { commercialUse: true, territories: ['Global'], durationMonths: 24, exclusivity: false },
    },
    {
      _id: 'brief-03',
      title: 'Objects of attention',
      brand: { name: 'Northline Studio', company: 'Northline Studio', contactEmail: 'briefs@northline.example' },
      campaignDescription: 'A set of three short product films that give ordinary desk objects an elevated, collectible presence.',
      contentType: 'video-ad',
      style: ['Editorial', '3D glossy'],
      formats: ['1:1', '4:5'],
      requiredTools: ['Blender', 'Flux'],
      budget: { min: 3000, max: 5000, currency: 'USD' },
      deadline: new Date('2026-10-29'),
      deliverables: 6,
      status: 'published',
      ownerEmail: 'demo@genra.ai',
      usage: { commercialUse: true, territories: ['Global'], durationMonths: 12, exclusivity: false },
    },
  ]

  let briefsCreated = 0
  let briefsUpdated = 0
  for (const brief of briefSeeds) {
    try {
      await Brief.findOneAndUpdate(
        { _id: brief._id },
        { $setOnInsert: { _id: brief._id }, $set: brief },
        { upsert: true, new: true, runValidators: false }
      )
      briefsUpdated++
    } catch (err) {
      console.warn(`   ⚠️  Failed to upsert brief "${brief.title}":`, err.message)
    }
  }
  console.log(`   ✓ Briefs: ${briefsCreated} created, ${briefsUpdated} upserted`)

  // ─── Demo Users ───────────────────────────────────────────────────────────────
  console.log('\n👤 Seeding users...')
  const userSeeds = [
    {
      _id: 'user-demo-01',
      name: 'Demo Brand',
      email: 'demo@genra.ai',
      password: 'demo1234',
      accountType: 'Brand',
      company: 'Genra Demo',
      verified: true,
      credits: 100,
    },
    {
      _id: 'user-demo-02',
      name: 'Mara Lennox',
      email: 'mara@example.com',
      password: 'creator123',
      accountType: 'Creator',
      company: '',
      verified: true,
      credits: 50,
    },
  ]

  let usersCreated = 0
  for (const u of userSeeds) {
    try {
      const exists = await User.findById(u._id)
      if (!exists) {
        const passwordHash = await bcrypt.hash(u.password, 10)
        await User.create({
          _id: u._id,
          name: u.name,
          email: u.email,
          passwordHash,
          accountType: u.accountType,
          company: u.company,
          verified: u.verified,
          credits: u.credits,
        })
        usersCreated++
      }
    } catch (err) {
      console.warn(`   ⚠️  Failed to seed user ${u.email}:`, err.message)
    }
  }
  console.log(`   ✓ Users: ${usersCreated} created (existing users unchanged)`)

  console.log('\n✅ Seed complete!\n')
  await mongoose.connection.close()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
