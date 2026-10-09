export function jsonSyntaxErrorHandler(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      ok: false,
      error: 'Malformed JSON payload in request body',
      details: err.message,
    })
  }
  next(err)
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  })
}

export function globalErrorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500
  const isDev = process.env.NODE_ENV !== 'production'

  console.error(`[Genra API Error] ${req.method} ${req.originalUrl}:`, err)

  // Never leak internal error details through 5xx responses in production
  if (status >= 500 && !isDev) {
    return res.status(status).json({
      ok: false,
      error: 'Internal Server Error',
    })
  }

  res.status(status).json({
    ok: false,
    error: err.message || 'Internal Server Error',
    ...(err.details ? { details: err.details } : {}),
    ...(isDev && err.stack ? { stack: err.stack } : {}),
  })
}
