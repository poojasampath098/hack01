/**
 * auth.mjs – Authentication routes
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 * PATCH /api/auth/me
 * POST /api/auth/logout
 */

import { Router } from 'express'
import {
  registerUser,
  loginUser,
  getCurrentUser,
  updateUser,
  verifyToken,
} from '../services/authService.mjs'
import { requireAuth } from '../middleware/requireAuth.mjs'

const router = Router()

const badRequest = (res, message, details = {}) =>
  res.status(400).json({ ok: false, error: message, details })

const unauthorized = (res, message = 'Unauthorized') =>
  res.status(401).json({ ok: false, error: message })

const ALLOWED_ACCOUNT_TYPES = new Set(['Brand', 'Creator'])

// ─── Register ─────────────────────────────────────────────────────────────────
// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, accountType, company } = req.body || {}
    if (!name || !email || !password) {
      return badRequest(res, 'name, email, and password are required')
    }
    if (password.length < 6) {
      return badRequest(res, 'password must be at least 6 characters')
    }
    if (
      accountType !== undefined &&
      accountType !== null &&
      accountType !== '' &&
      !ALLOWED_ACCOUNT_TYPES.has(accountType)
    ) {
      return badRequest(res, 'accountType must be one of: Brand, Creator')
    }

    const result = await registerUser({ name, email, password, accountType, company })
    res.status(201).json({
      ok: true,
      user: result.user,
      token: result.token,
      message: 'Registration successful',
    })
  } catch (err) {
    if (err.message === 'EMAIL_IN_USE') {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists' })
    }
    next(err)
  }
})

// ─── Login ────────────────────────────────────────────────────────────────────
// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return badRequest(res, 'email and password are required')
    }

    const result = await loginUser({ email, password })
    res.json({
      ok: true,
      user: result.user,
      token: result.token,
      message: 'Login successful',
    })
  } catch (err) {
    if (err.message === 'INVALID_CREDENTIALS') {
      return unauthorized(res, 'Invalid email or password')
    }
    next(err)
  }
})

// ─── Get Current User ─────────────────────────────────────────────────────────
// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await getCurrentUser(req.userId)
    if (!user) return unauthorized(res, 'User not found')
    res.json({ ok: true, user })
  } catch (err) {
    next(err)
  }
})

// ─── Update Current User ──────────────────────────────────────────────────────
// PATCH /api/auth/me
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const updated = await updateUser(req.userId, req.body)
    if (!updated) return unauthorized(res, 'User not found')
    res.json({ ok: true, user: updated })
  } catch (err) {
    next(err)
  }
})

// ─── Logout (client-side token removal; server-side noop) ────────────────────
// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ ok: true, message: 'Logged out' })
})

// ─── Token verification (useful for client-side hydration) ───────────────────
// POST /api/auth/verify
router.post('/verify', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ ok: false, valid: false })
  const payload = verifyToken(token)
  if (!payload) return res.status(401).json({ ok: false, valid: false })
  res.json({ ok: true, valid: true, payload })
})

export default router
