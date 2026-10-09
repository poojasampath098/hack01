/**
 * authService.mjs
 * JWT-based authentication service with bcrypt password hashing.
 * Falls back to in-memory user store when MongoDB is unavailable.
 */

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { User } from '../models/User.mjs'

// ─── Configuration ───────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'genra-dev-secret-do-not-use-in-prod-2026'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'
const SALT_ROUNDS = 12

const ALLOWED_ACCOUNT_TYPES = new Set(['Brand', 'Creator'])

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn(
    '[authService] WARNING: JWT_SECRET is not set in production. Tokens are signed with an insecure fallback secret. Set JWT_SECRET in your environment.'
  )
}

function isDbConnected() {
  return mongoose.connection.readyState === 1
}

// ─── In-memory store (dev fallback) ─────────────────────────────────────────
let memoryUsers = [
  // Pre-seeded demo user – avoids bootstrap friction in dev
  {
    _id: 'user-demo-01',
    id: 'user-demo-01',
    name: 'Demo Brand',
    email: 'demo@genra.ai',
    passwordHash: bcrypt.hashSync('demo1234', 10),
    accountType: 'Brand',
    company: 'Genra Demo',
    verified: true,
    credits: 100,
    createdAt: new Date('2025-01-01').toISOString(),
  },
  {
    _id: 'user-demo-02',
    id: 'user-demo-02',
    name: 'Mara Lennox',
    email: 'mara@example.com',
    passwordHash: bcrypt.hashSync('creator123', 10),
    accountType: 'Creator',
    company: '',
    verified: true,
    credits: 50,
    createdAt: new Date('2025-02-01').toISOString(),
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function safeUser(user) {
  if (!user) return null
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user }
  const id = String(obj._id || obj.id)
  delete obj.passwordHash
  delete obj.refreshToken
  return { ...obj, _id: id, id }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

// ─── Register ────────────────────────────────────────────────────────────────
export async function registerUser({ name, email, password, accountType = 'Creator', company = '' }) {
  if (!name || !name.trim()) throw new Error('name is required')
  if (!email || !email.trim()) throw new Error('email is required')
  if (!password || password.length < 6) throw new Error('password must be at least 6 characters')
  if (!ALLOWED_ACCOUNT_TYPES.has(accountType)) {
    throw new Error('accountType must be one of: Brand, Creator')
  }

  const normalizedEmail = email.toLowerCase().trim()

  if (isDbConnected()) {
    const existing = await User.findOne({ email: normalizedEmail })
    if (existing) throw new Error('EMAIL_IN_USE')

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      accountType,
      company,
    })
    const token = signToken({ sub: user._id.toString(), email: user.email, accountType: user.accountType })
    return { user: safeUser(user), token }
  }

  // Memory fallback
  if (memoryUsers.find((u) => u.email === normalizedEmail)) throw new Error('EMAIL_IN_USE')
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const newUser = {
    _id: `user-${Date.now()}`,
    id: `user-${Date.now()}`,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    accountType,
    company,
    verified: false,
    credits: 10,
    createdAt: new Date().toISOString(),
  }
  memoryUsers.push(newUser)
  const token = signToken({ sub: newUser.id, email: newUser.email, accountType: newUser.accountType })
  return { user: safeUser(newUser), token }
}

// ─── Login ───────────────────────────────────────────────────────────────────
export async function loginUser({ email, password }) {
  if (!email || !password) throw new Error('email and password are required')
  const normalizedEmail = email.toLowerCase().trim()

  let user
  if (isDbConnected()) {
    user = await User.findOne({ email: normalizedEmail })
  } else {
    user = memoryUsers.find((u) => u.email === normalizedEmail)
  }

  if (!user) throw new Error('INVALID_CREDENTIALS')

  const hash = typeof user.passwordHash === 'string' ? user.passwordHash : ''
  const match = await bcrypt.compare(password, hash)
  if (!match) throw new Error('INVALID_CREDENTIALS')

  if (isDbConnected()) {
    await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() })
  }

  const token = signToken({
    sub: String(user._id || user.id),
    email: user.email,
    accountType: user.accountType,
  })
  return { user: safeUser(user), token }
}

// ─── Get Current User ────────────────────────────────────────────────────────
export async function getCurrentUser(userId) {
  if (isDbConnected()) {
    const user = await User.findById(userId)
    return safeUser(user)
  }
  const user = memoryUsers.find((u) => u.id === userId || u._id === userId)
  return safeUser(user)
}

// ─── Update User ─────────────────────────────────────────────────────────────
export async function updateUser(userId, updates) {
  const allowed = ['name', 'company', 'avatar', 'preferences']
  const clean = {}
  for (const key of allowed) {
    if (key in updates) clean[key] = updates[key]
  }

  if (isDbConnected()) {
    const user = await User.findByIdAndUpdate(userId, { $set: clean }, { new: true })
    return safeUser(user)
  }
  const idx = memoryUsers.findIndex((u) => u.id === userId || u._id === userId)
  if (idx === -1) return null
  memoryUsers[idx] = { ...memoryUsers[idx], ...clean }
  return safeUser(memoryUsers[idx])
}

// ─── Find by email (internal utility) ────────────────────────────────────────
export async function findUserByEmail(email) {
  const normalized = email.toLowerCase().trim()
  if (isDbConnected()) {
    const user = await User.findOne({ email: normalized })
    return safeUser(user)
  }
  const user = memoryUsers.find((u) => u.email === normalized)
  return safeUser(user)
}
