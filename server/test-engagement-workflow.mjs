/**
 * test-engagement-workflow.mjs
 * End-to-end creator invitation & engagement lifecycle:
 *   invited → proposal → shortlisted → hired → in_progress → delivered
 *           → revision → in_progress → delivered → completed
 * Plus transition validation (422) and access control (403).
 *
 * Requires the API server running on http://localhost:4000 (npm run server).
 */

const BASE = 'http://localhost:4000/api'
let passed = 0
let failed = 0

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

async function req(path, { method = 'GET', body, actor } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (actor) {
    headers['x-user-email'] = actor.email
    headers['x-account-type'] = actor.role
    headers['x-user-name'] = actor.name || ''
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {}
  return { status: res.status, data }
}

const brand = { email: 'demo@genra.ai', role: 'Brand', name: 'Demo Brand' }
const creator = { email: 'rhea@example.com', role: 'Creator', name: 'Rhea Okafor' }
const outsider = { email: 'outsider@example.com', role: 'Brand', name: 'Outsider' }

console.log('\n── ENGAGEMENT WORKFLOW ─────────────────────────────────────────')

let id = ''

await test('1. Brand invites creator → invited', async () => {
  const { status, data } = await req('/engagements', {
    method: 'POST',
    actor: brand,
    body: {
      briefId: 'brief-03',
      creatorId: 'rhea-okafor',
      creatorEmail: creator.email,
      deliverablesTotal: 3,
      message: 'We would love to work with you on this.',
    },
  })
  assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`)
  assert(data.status === 'invited', `Expected invited, got ${data.status}`)
  assert(Array.isArray(data.statusHistory) && data.statusHistory.length >= 1, 'Expected status history')
  id = data.id || data._id
})

await test('2. Creator submits a proposal → proposal', async () => {
  const { status, data } = await req(`/engagements/${id}/proposal`, {
    method: 'POST',
    actor: creator,
    body: { coverLetter: 'I would use a warm, tactile palette.', proposedBudget: 4200, proposedTimeline: '5 days' },
  })
  assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`)
  assert(data.status === 'proposal', `Expected proposal, got ${data.status}`)
  assert(data.proposal && data.proposal.proposedBudget === 4200, 'Expected proposal budget stored')
})

await test('3. Proposal requires a cover letter → 400', async () => {
  const { status } = await req(`/engagements/${id}/proposal`, {
    method: 'POST',
    actor: creator,
    body: { proposedBudget: 5000 },
  })
  assert(status === 400, `Expected 400, got ${status}`)
})

await test('4. Invalid transition (proposal → completed) → 422', async () => {
  const { status } = await req(`/engagements/${id}/status`, {
    method: 'PATCH',
    actor: brand,
    body: { status: 'completed' },
  })
  assert(status === 422, `Expected 422, got ${status}`)
})

await test('5. Creator cannot shortlist (brand-only action) → 403', async () => {
  const { status } = await req(`/engagements/${id}/status`, {
    method: 'PATCH',
    actor: creator,
    body: { status: 'shortlisted' },
  })
  assert(status === 403, `Expected 403, got ${status}`)
})

await test('6. Outsider cannot shortlist → 403', async () => {
  const { status } = await req(`/engagements/${id}/status`, {
    method: 'PATCH',
    actor: outsider,
    body: { status: 'shortlisted' },
  })
  assert(status === 403, `Expected 403, got ${status}`)
})

await test('7. Brand shortlists → shortlisted', async () => {
  const { status, data } = await req(`/engagements/${id}/status`, {
    method: 'PATCH',
    actor: brand,
    body: { status: 'shortlisted' },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.status === 'shortlisted', `Expected shortlisted, got ${data.status}`)
})

await test('8. Brand hires → hired (agreed budget from proposal)', async () => {
  const { status, data } = await req(`/engagements/${id}/status`, {
    method: 'PATCH',
    actor: brand,
    body: { status: 'hired' },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.status === 'hired', `Expected hired, got ${data.status}`)
  assert(data.agreedBudget === 4200, `Expected agreedBudget 4200, got ${data.agreedBudget}`)
})

await test('9. Creator starts work → in_progress', async () => {
  const { status, data } = await req(`/engagements/${id}/status`, {
    method: 'PATCH',
    actor: creator,
    body: { status: 'in_progress' },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.status === 'in_progress', `Expected in_progress, got ${data.status}`)
})

await test('10. Creator delivers → delivered', async () => {
  const { status, data } = await req(`/engagements/${id}/status`, {
    method: 'PATCH',
    actor: creator,
    body: { status: 'delivered' },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.status === 'delivered', `Expected delivered, got ${data.status}`)
  assert(data.deliverablesSubmitted >= 1, 'Expected deliverables tracked')
})

await test('11. Brand requests a revision → in_progress with feedback', async () => {
  const { status, data } = await req(`/engagements/${id}/revision`, {
    method: 'POST',
    actor: brand,
    body: { feedback: 'Warmer lighting and a slower open please.' },
  })
  assert(status === 201, `Expected 201, got ${status}`)
  assert(data.status === 'in_progress', `Expected in_progress, got ${data.status}`)
  assert(data.revisionCount >= 1, 'Expected revision count')
  const last = data.revisions[data.revisions.length - 1]
  assert(last && !last.resolvedAt, 'Expected open revision')
})

await test('12. Revision on a non-delivered engagement → 422', async () => {
  const { status } = await req(`/engagements/${id}/revision`, {
    method: 'POST',
    actor: brand,
    body: { feedback: 'Too soon.' },
  })
  assert(status === 422, `Expected 422, got ${status}`)
})

await test('13. Creator re-delivers → delivered', async () => {
  const { status, data } = await req(`/engagements/${id}/status`, {
    method: 'PATCH',
    actor: creator,
    body: { status: 'delivered' },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.status === 'delivered', `Expected delivered, got ${data.status}`)
})

await test('14. Brand completes → completed (revisions resolved)', async () => {
  const { status, data } = await req(`/engagements/${id}/status`, {
    method: 'PATCH',
    actor: brand,
    body: { status: 'completed' },
  })
  assert(status === 200, `Expected 200, got ${status}`)
  assert(data.status === 'completed', `Expected completed, got ${data.status}`)
  assert(data.revisions.every((r) => r.resolvedAt), 'Expected all revisions resolved')
})

await test('15. Terminal state rejects further transitions → 422', async () => {
  const { status } = await req(`/engagements/${id}/status`, {
    method: 'PATCH',
    actor: brand,
    body: { status: 'in_progress' },
  })
  assert(status === 422, `Expected 422, got ${status}`)
})

await test('16. Proposal after completion → 422', async () => {
  const { status } = await req(`/engagements/${id}/proposal`, {
    method: 'POST',
    actor: creator,
    body: { coverLetter: 'Too late.' },
  })
  assert(status === 422, `Expected 422, got ${status}`)
})

await test('17. Messages: post + mark read', async () => {
  const posted = await req(`/engagements/${id}/messages`, {
    method: 'POST',
    actor: creator,
    body: { body: 'Files are in the shared folder.' },
  })
  assert(posted.status === 201, `Expected 201, got ${posted.status}`)
  const read = await req(`/engagements/${id}/messages/read`, { method: 'PATCH', actor: brand })
  assert(read.status === 200, `Expected 200, got ${read.status}`)
})

await test('18. List by creatorEmail / creatorName', async () => {
  const byEmail = await req(`/engagements?creatorEmail=${encodeURIComponent(creator.email)}`)
  assert(byEmail.status === 200, `Expected 200, got ${byEmail.status}`)
  assert(byEmail.data.items.some((e) => e.id === id), 'Expected engagement in creatorEmail list')
  const byName = await req(`/engagements?creatorName=${encodeURIComponent(creator.name)}`)
  assert(byName.data.items.some((e) => e.id === id), 'Expected engagement in creatorName list')
})

await test('19. Creator declines an invite → declined + terminal', async () => {
  const invite = await req('/engagements', {
    method: 'POST',
    actor: brand,
    body: { briefId: 'brief-02', creatorId: 'kenji-park', creatorEmail: 'kenji@example.com' },
  })
  const declined = await req(`/engagements/${invite.data.id}/status`, {
    method: 'PATCH',
    actor: { email: 'kenji@example.com', role: 'Creator', name: 'Kenji Park' },
    body: { status: 'declined' },
  })
  assert(declined.status === 200, `Expected 200, got ${declined.status}`)
  assert(declined.data.status === 'declined', `Expected declined, got ${declined.data.status}`)
  const after = await req(`/engagements/${invite.data.id}/status`, {
    method: 'PATCH',
    actor: brand,
    body: { status: 'hired' },
  })
  assert(after.status === 422, `Expected 422, got ${after.status}`)
})

console.log(`\n${'─'.repeat(55)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed === 0) console.log('🎉 Full engagement workflow passed!')
else console.log('⚠️  Some workflow tests failed — check output above.')
console.log(`${'─'.repeat(55)}\n`)

process.exitCode = failed === 0 ? 0 : 1
