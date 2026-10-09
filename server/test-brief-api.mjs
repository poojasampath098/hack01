import { startServer } from './index.mjs'

const TEST_PORT = 4007
const baseUrl = `http://localhost:${TEST_PORT}`

async function runBriefApiTests() {
  console.log(`Starting test server on port ${TEST_PORT}...`)
  const server = await startServer(TEST_PORT)

  try {
    // -------------------------------------------------------------
    // 1. LIST BRIEFS: Default
    // -------------------------------------------------------------
    console.log('\n[1/11] Testing GET /api/briefs (default listing)...')
    const res1 = await fetch(`${baseUrl}/api/briefs`)
    const data1 = await res1.json()
    console.log(`Status: ${res1.status}, Total: ${data1.total}, Items count: ${data1.items?.length}`)
    if (res1.status !== 200 || data1.total < 3) {
      throw new Error('Default briefs listing failed')
    }

    // -------------------------------------------------------------
    // 2. SEARCH & FILTER BRIEFS
    // -------------------------------------------------------------
    console.log('\n[2/11] Testing GET /api/briefs?q=morning&status=published...')
    const res2 = await fetch(`${baseUrl}/api/briefs?q=morning&status=published`)
    const data2 = await res2.json()
    console.log(`Status: ${res2.status}, Matches found: ${data2.total}`)
    if (res2.status !== 200 || data2.total === 0) {
      throw new Error('Search & status filter on briefs failed')
    }

    // -------------------------------------------------------------
    // 3. BRIEF DETAILS
    // -------------------------------------------------------------
    console.log('\n[3/11] Testing GET /api/briefs/brief-01...')
    const detRes = await fetch(`${baseUrl}/api/briefs/brief-01`)
    const detData = await detRes.json()
    console.log(`Status: ${detRes.status}, Title: "${detData.title}", Brand: "${detData.brand}"`)
    if (detRes.status !== 200 || detData.title !== 'A new kind of morning') {
      throw new Error('Brief details lookup failed')
    }

    // -------------------------------------------------------------
    // 4. INPUT VALIDATION: POST /api/briefs
    // -------------------------------------------------------------
    console.log('\n[4/11] Testing validation on POST /api/briefs...')
    const missingTitleRes = await fetch(`${baseUrl}/api/briefs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: { name: 'Acme' } }),
    })
    console.log(`Missing title status: ${missingTitleRes.status}`)
    if (missingTitleRes.status !== 400) throw new Error('Missing title validation failed')

    const invalidBudgetRes = await fetch(`${baseUrl}/api/briefs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Invalid budget test',
        brand: { name: 'Acme' },
        budget: { min: 9000, max: 2000 },
      }),
    })
    console.log(`Invalid budget bounds status: ${invalidBudgetRes.status}`)
    if (invalidBudgetRes.status !== 400) throw new Error('Invalid budget validation failed')

    // -------------------------------------------------------------
    // 5. CREATE NEW BRIEF
    // -------------------------------------------------------------
    console.log('\n[5/11] Testing POST /api/briefs (create brief)...')
    const ownerEmail = 'founder@solaris.example'
    const newBriefPayload = {
      title: 'Solaris Vision 2027',
      campaignDescription: 'An atmospheric brand film envisioning solar-driven architecture.',
      contentType: 'brand-film',
      style: ['Cinematic', 'Minimal'],
      formats: ['16:9', '9:16'],
      requiredTools: ['Veo', 'ComfyUI'],
      deliverables: 4,
      status: 'draft',
      budget: { min: 7000, max: 12000, currency: 'USD' },
      deadline: '2027-01-15',
      brand: {
        name: 'Solaris Studio',
        company: 'Solaris Architecture Corp',
        contactEmail: ownerEmail,
        ownerId: 'brand-solaris',
      },
      usage: {
        commercialUse: true,
        channels: ['web', 'paid-social'],
        territories: ['Global'],
        durationMonths: 24,
      },
    }

    const createRes = await fetch(`${baseUrl}/api/briefs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': ownerEmail,
      },
      body: JSON.stringify(newBriefPayload),
    })
    const createdData = await createRes.json()
    console.log(`Status: ${createRes.status}, Created ID: ${createdData._id}, Status: ${createdData.status}`)
    if (createRes.status !== 201 || createdData.title !== 'Solaris Vision 2027') {
      throw new Error('Create brief failed')
    }
    const testBriefId = createdData._id

    // -------------------------------------------------------------
    // 6. OWNERSHIP ENFORCEMENT: Unauthorized vs Authorized Update
    // -------------------------------------------------------------
    console.log('\n[6/11] Testing ownership enforcement on PUT /api/briefs/:id...')
    // Attempt update as unauthorized stranger
    const unauthorizedRes = await fetch(`${baseUrl}/api/briefs/${testBriefId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': 'stranger@otherbrand.example',
      },
      body: JSON.stringify({ title: 'Hacked Title' }),
    })
    console.log(`Unauthorized update status: ${unauthorizedRes.status}`)
    if (unauthorizedRes.status !== 403) {
      throw new Error('Ownership enforcement failed: expected 403 for unauthorized user')
    }

    // Authorized update with owner email
    const authorizedRes = await fetch(`${baseUrl}/api/briefs/${testBriefId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': ownerEmail,
      },
      body: JSON.stringify({
        campaignDescription: 'Updated: Next-generation solar architecture visual launch.',
        budget: { min: 8000, max: 15000, currency: 'USD' },
      }),
    })
    const authorizedData = await authorizedRes.json()
    console.log(`Authorized update status: ${authorizedRes.status}, Budget: ${authorizedData.budget}`)
    if (authorizedRes.status !== 200 || !authorizedData.budget.includes('15k')) {
      throw new Error('Authorized brief update failed')
    }

    // -------------------------------------------------------------
    // 7. LIFECYCLE: PUBLISH AND CLOSE BRIEF
    // -------------------------------------------------------------
    console.log('\n[7/11] Testing lifecycle transitions: Publish and Close...')
    const pubRes = await fetch(`${baseUrl}/api/briefs/${testBriefId}/publish`, {
      method: 'POST',
      headers: { 'x-user-email': ownerEmail },
    })
    const pubData = await pubRes.json()
    console.log(`Publish status: ${pubRes.status}, Brief Status: ${pubData.status}`)
    if (pubRes.status !== 200 || pubData.status !== 'Published') {
      throw new Error('Publish brief failed')
    }

    const closeRes = await fetch(`${baseUrl}/api/briefs/${testBriefId}/close`, {
      method: 'POST',
      headers: { 'x-user-email': ownerEmail },
    })
    const closeData = await closeRes.json()
    console.log(`Close status: ${closeRes.status}, Brief Status: ${closeData.status}`)
    if (closeRes.status !== 200 || closeData.status !== 'Closed') {
      throw new Error('Close brief failed')
    }

    // -------------------------------------------------------------
    // 8. BRIEF MATCH ENGINE
    // -------------------------------------------------------------
    console.log(`\n[8/11] Testing GET /api/briefs/${testBriefId}/matches...`)
    const matchesRes = await fetch(`${baseUrl}/api/briefs/${testBriefId}/matches`)
    const matchesData = await matchesRes.json()
    console.log(`Matches status: ${matchesRes.status}, Total matches: ${matchesData.total}`)
    console.log(`Top match: ${matchesData.items[0]?.creator?.name} (Score: ${matchesData.items[0]?.score}%)`)
    console.log('Breakdown:', matchesData.items[0]?.breakdown)
    if (matchesRes.status !== 200 || matchesData.total === 0 || !matchesData.items[0]?.breakdown?.tools) {
      throw new Error('Brief matching engine failed')
    }

    // -------------------------------------------------------------
    // 9. INVITE CREATOR TO BRIEF
    // -------------------------------------------------------------
    console.log(`\n[9/11] Testing POST /api/briefs/${testBriefId}/invite...`)
    const inviteRes = await fetch(`${baseUrl}/api/briefs/${testBriefId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': ownerEmail,
      },
      body: JSON.stringify({ creatorId: 'kenji-park' }),
    })
    const inviteData = await inviteRes.json()
    console.log(`Invite status: ${inviteRes.status}, Engagement status: ${inviteData.status}, Creator: ${inviteData.creator}`)
    if (inviteRes.status !== 201 || inviteData.creator !== 'kenji-park') {
      throw new Error('Invite creator failed')
    }

    // -------------------------------------------------------------
    // 10. BRIEF BUILDER HEURISTIC
    // -------------------------------------------------------------
    console.log('\n[10/11] Testing POST /api/brief-builder heuristic...')
    const builderRes = await fetch(`${baseUrl}/api/brief-builder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roughIdea: 'Surreal 3D launch video for coffee brand' }),
    })
    const builderData = await builderRes.json()
    console.log(`Builder status: ${builderRes.status}, ContentType: ${builderData.contentType}, Tools:`, builderData.requiredTools)
    if (builderRes.status !== 200 || !builderData.requiredTools.includes('Blender')) {
      throw new Error('Brief builder heuristic failed')
    }

    // -------------------------------------------------------------
    // 11. DELETE BRIEF & 404 CONFIRMATION
    // -------------------------------------------------------------
    console.log(`\n[11/11] Testing DELETE /api/briefs/${testBriefId}...`)
    // Unauthorized delete
    const unauthDelRes = await fetch(`${baseUrl}/api/briefs/${testBriefId}`, {
      method: 'DELETE',
      headers: { 'x-user-email': 'intruder@evil.example' },
    })
    if (unauthDelRes.status !== 403) throw new Error('Expected 403 for unauthorized delete')

    // Authorized delete
    const delRes = await fetch(`${baseUrl}/api/briefs/${testBriefId}`, {
      method: 'DELETE',
      headers: { 'x-user-email': ownerEmail },
    })
    const delData = await delRes.json()
    console.log(`Delete status: ${delRes.status}, Response:`, delData)
    if (delRes.status !== 200 || !delData.ok) {
      throw new Error('Authorized brief delete failed')
    }

    const checkGoneRes = await fetch(`${baseUrl}/api/briefs/${testBriefId}`)
    console.log(`Subsequent GET status: ${checkGoneRes.status}`)
    if (checkGoneRes.status !== 404) {
      throw new Error('Deleted brief still returned 200')
    }

    console.log('\n======================================================')
    console.log('>>> ALL 11 BRAND BRIEF API TESTS PASSED! <<<')
    console.log('======================================================')
  } finally {
    server.close(() => {
      console.log('Test server closed.')
    })
  }
}

runBriefApiTests().catch((err) => {
  console.error('\nTest suite failed:', err)
  process.exit(1)
})
