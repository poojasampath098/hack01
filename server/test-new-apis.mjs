/**
 * test-new-apis.mjs
 * Tests: Auth, Engagements, Studio
 */

const BASE = 'http://localhost:4000/api'
let passed = 0, failed = 0
let authToken = ''
let registeredEmail = `test-${Date.now()}@genra.ai`

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`)
    failed++
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed')
}

async function json(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const res = await fetch(url, { ...opts, headers })
  const data = await res.json()
  return { status: res.status, data }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
console.log('\n── AUTH TESTS ──────────────────────────────────────────────────')

await test('Register new user', async () => {
  const { status, data } = await json(`${BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Test User', email: registeredEmail, password: 'secure123', accountType: 'Brand' }),
  })
  assert(status === 201, `Expected 201, got ${status}`)
  assert(data.ok, 'Expected ok:true')
  assert(data.token, 'Missing token')
  assert(data.user.email === registeredEmail.toLowerCase(), 'Email mismatch')
  assert(!data.user.passwordHash, 'passwordHash should be hidden')
  authToken = data.token
})

await test('Register: duplicate email → 409', async () => {
  const { status } = await json(`${BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Dup', email: registeredEmail, password: 'pw123456' }),
  })
  assert(status === 409, `Expected 409, got ${status}`)
})

await test('Register: short password → 400', async () => {
  const { status } = await json(`${BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ name: 'A', email: 'newuser@x.com', password: 'abc' }),
  })
  assert(status === 400, `Expected 400, got ${status}`)
})

await test('Register: role escalation (Admin) → 400', async () => {
  const { status } = await json(`${BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Sneaky',
      email: 'sneaky@x.com',
      password: 'password123',
      accountType: 'Admin',
    }),
  })
  assert(status === 400, `Expected 400, got ${status}`)
})

await test('Login with valid credentials', async () => {
  const { status, data } = await json(`${BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: registeredEmail, password: 'secure123' }),
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.token, 'Missing token')
  authToken = data.token
})

await test('Login: wrong password → 401', async () => {
  const { status } = await json(`${BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: registeredEmail, password: 'wrongpw' }),
  })
  assert(status === 401, `Expected 401, got ${status}`)
})

await test('GET /me with token', async () => {
  const { status, data } = await json(`${BASE}/auth/me`)
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.user.email === registeredEmail.toLowerCase(), 'Email mismatch')
})

await test('GET /me without token → 401', async () => {
  const res = await fetch(`${BASE}/auth/me`)
  assert(res.status === 401, `Expected 401, got ${res.status}`)
})

await test('Login as demo user', async () => {
  const { status, data } = await json(`${BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@genra.ai', password: 'demo1234' }),
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.token, 'Missing demo token')
})

await test('POST /verify with valid token', async () => {
  const { status, data } = await json(`${BASE}/auth/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.valid === true, 'Expected valid:true')
})

// ─── ENGAGEMENTS ──────────────────────────────────────────────────────────────
console.log('\n── ENGAGEMENT TESTS ────────────────────────────────────────────')

let engagementId = ''

await test('Create engagement (invite)', async () => {
  const { status, data } = await json(`${BASE}/engagements`, {
    method: 'POST',
    headers: { 'x-user-email': 'demo@genra.ai' },
    body: JSON.stringify({ briefId: 'brief-01', creatorId: 'mara-lennox', message: 'Hi, interested in collaborating!' }),
  })
  assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`)
  assert(data.status === 'invited', 'Expected invited status')
  engagementId = data.id || data._id
})

await test('List engagements', async () => {
  const { status, data } = await json(`${BASE}/engagements?ownerEmail=demo@genra.ai`)
  assert(status === 200, `Expected 200, got ${status}`)
  assert(Array.isArray(data.items), 'Expected items array')
  assert(data.total >= 1, 'Expected at least 1 engagement')
})

await test('Get single engagement', async () => {
  const { status, data } = await json(`${BASE}/engagements/${engagementId}`)
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.id === engagementId, 'ID mismatch')
})

await test('Update status: invited → shortlisted (brand)', async () => {
  const { status, data } = await json(`${BASE}/engagements/${engagementId}/status`, {
    method: 'PATCH',
    headers: { 'x-user-email': 'demo@genra.ai', 'x-account-type': 'Brand' },
    body: JSON.stringify({ status: 'shortlisted' }),
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.status === 'shortlisted', `Expected shortlisted, got ${data.status}`)
  assert(Array.isArray(data.statusHistory) && data.statusHistory.length >= 2, 'Expected status history trail')
})

await test('Invalid transition → 422', async () => {
  const { status } = await json(`${BASE}/engagements/${engagementId}/status`, {
    method: 'PATCH',
    headers: { 'x-user-email': 'demo@genra.ai', 'x-account-type': 'Brand' },
    body: JSON.stringify({ status: 'invited' }),
  })
  assert(status === 422, `Expected 422, got ${status}`)
})

await test('Permission denied for wrong party → 403', async () => {
  const { status } = await json(`${BASE}/engagements/${engagementId}/status`, {
    method: 'PATCH',
    headers: { 'x-user-email': 'outsider@example.com', 'x-account-type': 'Brand' },
    body: JSON.stringify({ status: 'hired' }),
  })
  assert(status === 403, `Expected 403, got ${status}`)
})

await test('Post a message', async () => {
  const { status, data } = await json(`${BASE}/engagements/${engagementId}/messages`, {
    method: 'POST',
    headers: { 'x-user-email': 'creator@example.com' },
    body: JSON.stringify({ body: 'Looking forward to this project!' }),
  })
  assert(status === 201, `Expected 201, got ${status}`)
  assert(data.messages.length >= 1, 'Expected at least 1 message')
})

await test('Mark messages read', async () => {
  const { status, data } = await json(`${BASE}/engagements/${engagementId}/messages/read`, {
    method: 'PATCH',
    headers: { 'x-user-email': 'demo@genra.ai' },
  })
  assert(status === 200, `Expected 200, got ${status}`)
})

// Duplicate invite idempotency
await test('Duplicate invite is idempotent', async () => {
  const { status, data } = await json(`${BASE}/engagements`, {
    method: 'POST',
    headers: { 'x-user-email': 'demo@genra.ai' },
    body: JSON.stringify({ briefId: 'brief-01', creatorId: 'mara-lennox' }),
  })
  assert(status === 201, `Expected 201, got ${status}`)
})

// ─── STUDIO ───────────────────────────────────────────────────────────────────
console.log('\n── STUDIO TESTS ────────────────────────────────────────────────')

const studioOwner = registeredEmail
let projectId = ''
let generationId = ''

await test('GET /studio/stats (empty)', async () => {
  const { status, data } = await json(`${BASE}/studio/stats`, {
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.ok, 'Expected ok:true')
  assert(typeof data.stats.totalProjects === 'number', 'Missing totalProjects')
})

await test('Create studio project', async () => {
  const { status, data } = await json(`${BASE}/studio/projects`, {
    method: 'POST',
    headers: { 'x-user-email': studioOwner },
    body: JSON.stringify({ title: 'Test Campaign', description: 'My first AI project', tags: ['launch'] }),
  })
  assert(status === 201, `Expected 201, got ${status}`)
  assert(data.title === 'Test Campaign', 'Title mismatch')
  projectId = data.id || data._id
})

await test('List studio projects', async () => {
  const { status, data } = await json(`${BASE}/studio/projects`, {
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.items.length >= 1, 'Expected at least 1 project')
})

await test('Get single project', async () => {
  const { status, data } = await json(`${BASE}/studio/projects/${projectId}`, {
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.id === projectId, 'ID mismatch')
})

await test('Get single project — other owner → 404 (IDOR protection)', async () => {
  const { status } = await json(`${BASE}/studio/projects/${projectId}`, {
    headers: { 'x-user-email': 'someone-else@example.com' },
  })
  assert(status === 404, `Expected 404, got ${status}`)
})

await test('Update project', async () => {
  const { status, data } = await json(`${BASE}/studio/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'x-user-email': studioOwner },
    body: JSON.stringify({ title: 'Updated Campaign', status: 'active' }),
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.title === 'Updated Campaign', 'Update did not persist')
})

await test('Create a generation (POST /generate)', async () => {
  const { status, data } = await json(`${BASE}/studio/generate`, {
    method: 'POST',
    headers: { 'x-user-email': studioOwner },
    body: JSON.stringify({
      prompt: 'A cinematic sunrise over a city, golden light, slow motion',
      tool: 'Veo',
      type: 'video',
      projectId,
      settings: { aspectRatio: '16:9', durationSec: 8, resolution: '4K' },
      tags: ['sunrise', 'cinematic'],
    }),
  })
  assert(status === 201, `Expected 201, got ${status}`)
  assert(data.status === 'done', `Expected done, got ${data.status}`)
  assert(data.creditsCost >= 1, 'Expected positive creditsCost')
  generationId = data.id || data._id
})

await test('Generate: missing prompt → 400', async () => {
  const { status } = await json(`${BASE}/studio/generate`, {
    method: 'POST',
    headers: { 'x-user-email': studioOwner },
    body: JSON.stringify({ tool: 'Veo' }),
  })
  assert(status === 400, `Expected 400, got ${status}`)
})

await test('Generate: unknown tool → 400', async () => {
  const { status } = await json(`${BASE}/studio/generate`, {
    method: 'POST',
    headers: { 'x-user-email': studioOwner },
    body: JSON.stringify({ prompt: 'test', tool: 'FakeAI' }),
  })
  assert(status === 400, `Expected 400, got ${status}`)
})

await test('List generation history', async () => {
  const { status, data } = await json(`${BASE}/studio/history`, {
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.items.length >= 1, 'Expected at least 1 generation')
})

await test('Get single generation', async () => {
  const { status, data } = await json(`${BASE}/studio/history/${generationId}`, {
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.id === generationId, 'ID mismatch')
})

await test('Get single generation — other owner → 404 (IDOR protection)', async () => {
  const { status } = await json(`${BASE}/studio/history/${generationId}`, {
    headers: { 'x-user-email': 'someone-else@example.com' },
  })
  assert(status === 404, `Expected 404, got ${status}`)
})

await test('Toggle favourite', async () => {
  const { status, data } = await json(`${BASE}/studio/history/${generationId}/favourite`, {
    method: 'PATCH',
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.favourite === true, 'Expected favourite:true after toggle')
})

await test('Toggle favourite again (toggle back)', async () => {
  const { status, data } = await json(`${BASE}/studio/history/${generationId}/favourite`, {
    method: 'PATCH',
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.favourite === false, 'Expected favourite:false after second toggle')
})

await test('Filter history by tool', async () => {
  const { status, data } = await json(`${BASE}/studio/history?tool=Veo`, {
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.items.every((g) => g.tool === 'Veo'), 'Filter by tool failed')
})

await test('GET /studio/stats (populated)', async () => {
  const { status, data } = await json(`${BASE}/studio/stats`, {
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.stats.totalGenerations >= 1, 'Expected at least 1 generation in stats')
  assert(data.stats.creditsUsed >= 1, 'Expected creditsUsed > 0')
})

await test('Delete generation', async () => {
  const { status, data } = await json(`${BASE}/studio/history/${generationId}`, {
    method: 'DELETE',
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.ok === true, 'Expected ok:true')
})

await test('Delete project', async () => {
  const { status, data } = await json(`${BASE}/studio/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'x-user-email': studioOwner },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.ok === true, 'Expected ok:true')
})

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed === 0) console.log('🎉 All new API tests passed!')
else console.log('⚠️  Some tests failed — check output above.')
console.log(`${'─'.repeat(55)}\n`)
