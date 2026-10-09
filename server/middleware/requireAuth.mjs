/**
 * requireAuth.mjs – Authentication & authorization middleware
 *
 * Exports:
 *   requireAuth   – verifies JWT; 401 if missing/invalid
 *   optionalAuth  – attaches user context if token present; never blocks
 *   requireRole   – factory: requireRole('Brand') | requireRole('Creator') | requireRole(['Brand','Admin'])
 *   requireSelf   – 403 if req.userId !== req.params[param] (own-resource guard)
 */

import { verifyToken } from '../services/authService.mjs'

// ─── Core token extractor ─────────────────────────────────────────────────────
function attachFromToken(req, token) {
  const payload = verifyToken(token)
  if (!payload) return false
  req.userId      = payload.sub
  req.userEmail   = payload.email
  req.accountType = payload.accountType
  return true
}

function attachFromDevHeaders(req) {
  const devEmail = req.headers['x-user-email']
  if (!devEmail || process.env.NODE_ENV === 'production') return false
  req.userId      = devEmail          // pseudo-ID in dev (email used as ID)
  req.userEmail   = devEmail
  req.accountType = (req.headers['x-account-type'] || 'Brand').trim()
  return true
}

function extractBearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}

// ─── requireAuth ──────────────────────────────────────────────────────────────
export function requireAuth(req, res, next) {
  const token = extractBearer(req)

  if (token) {
    const ok = attachFromToken(req, token)
    if (!ok) return res.status(401).json({ ok: false, error: 'Token is invalid or expired' })
    return next()
  }

  if (attachFromDevHeaders(req)) return next()

  return res.status(401).json({ ok: false, error: 'Authentication required. Please sign in.' })
}

// ─── optionalAuth ─────────────────────────────────────────────────────────────
export function optionalAuth(req, _res, next) {
  const token = extractBearer(req)
  if (token) {
    attachFromToken(req, token)
  } else {
    attachFromDevHeaders(req)
  }
  next()
}

// ─── requireRole ─────────────────────────────────────────────────────────────
/**
 * requireRole('Brand')               – only Brands allowed
 * requireRole('Creator')             – only Creators allowed
 * requireRole(['Brand', 'Admin'])    – either role allowed
 *
 * Must be chained AFTER requireAuth so req.accountType is populated.
 */
export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles]
  return function roleGuard(req, res, next) {
    if (!req.accountType) {
      return res.status(401).json({ ok: false, error: 'Authentication required' })
    }
    if (!allowed.includes(req.accountType)) {
      return res.status(403).json({
        ok: false,
        error: `Access denied. This action requires a ${allowed.join(' or ')} account. You are signed in as ${req.accountType}.`,
      })
    }
    next()
  }
}

// ─── requireSelf ─────────────────────────────────────────────────────────────
/**
 * Ensures the authenticated user is operating on their own resource.
 * Reads req.params[paramName] (default: 'userId') and compares against req.userId / req.userEmail.
 * Admins bypass this check automatically.
 */
export function requireSelf(paramName = 'userId') {
  return function selfGuard(req, res, next) {
    if (req.accountType === 'Admin') return next()
    const targetId = req.params[paramName]
    if (!targetId || !req.userId) {
      return res.status(403).json({ ok: false, error: 'Cannot verify resource ownership' })
    }
    // Allow match on userId or email (dev-mode pseudo-IDs are emails)
    if (req.userId !== targetId && req.userEmail !== targetId) {
      return res.status(403).json({
        ok: false,
        error: 'Access denied. You can only modify your own resources.',
      })
    }
    next()
  }
}
