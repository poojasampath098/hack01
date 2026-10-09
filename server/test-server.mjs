import { startServer } from './index.mjs'

const TEST_PORT = 4005
const baseUrl = `http://localhost:${TEST_PORT}`

async function runTests() {
  console.log(`Starting test server on port ${TEST_PORT}...`)
  const server = await startServer(TEST_PORT)

  try {
    // 1. Health check
    console.log('\n[1/6] Testing GET /api/health...')
    const healthRes = await fetch(`${baseUrl}/api/health`)
    const healthData = await healthRes.json()
    console.log('Status:', healthRes.status, 'Response:', JSON.stringify(healthData, null, 2))
    if (healthRes.status !== 200 || !healthData.ok || healthData.service !== 'genra-api') {
      throw new Error('Health check verification failed')
    }

    // 2. Creators listing
    console.log('\n[2/6] Testing GET /api/creators...')
    const creatorsRes = await fetch(`${baseUrl}/api/creators?tools=Runway`)
    const creatorsData = await creatorsRes.json()
    console.log('Status:', creatorsRes.status, 'Total found:', creatorsData.total)
    if (creatorsRes.status !== 200 || !Array.isArray(creatorsData.items) || creatorsData.total < 1) {
      throw new Error('Creators endpoint verification failed')
    }

    // 3. Briefs listing
    console.log('\n[3/6] Testing GET /api/briefs...')
    const briefsRes = await fetch(`${baseUrl}/api/briefs`)
    const briefsData = await briefsRes.json()
    console.log('Status:', briefsRes.status, 'Total briefs:', briefsData.total)
    if (briefsRes.status !== 200 || !Array.isArray(briefsData.items) || briefsData.total < 1) {
      throw new Error('Briefs endpoint verification failed')
    }

    // 4. Brief builder heuristic endpoint
    console.log('\n[4/6] Testing POST /api/brief-builder...')
    const builderRes = await fetch(`${baseUrl}/api/brief-builder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roughIdea: 'Surreal social-first video for coffee brand' }),
    })
    const builderData = await builderRes.json()
    console.log('Status:', builderRes.status, 'ContentType:', builderData.contentType, 'Style:', builderData.style)
    if (builderRes.status !== 200 || builderData.contentType !== 'social-loop') {
      throw new Error('Brief builder endpoint verification failed')
    }

    // 5. 404 Catch-All handler
    console.log('\n[5/6] Testing 404 handler with /api/nonexistent...')
    const notFoundRes = await fetch(`${baseUrl}/api/nonexistent`)
    const notFoundData = await notFoundRes.json()
    console.log('Status:', notFoundRes.status, 'Response:', notFoundData)
    if (notFoundRes.status !== 404 || notFoundData.ok !== false) {
      throw new Error('404 catch-all verification failed')
    }

    // 6. Malformed JSON handling
    console.log('\n[6/6] Testing malformed JSON body handling...')
    const malformedRes = await fetch(`${baseUrl}/api/creators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"invalid": json',
    })
    const malformedData = await malformedRes.json()
    console.log('Status:', malformedRes.status, 'Response:', malformedData)
    if (malformedRes.status !== 400 || malformedData.ok !== false) {
      throw new Error('Malformed JSON handling verification failed')
    }

    console.log('\n>>> ALL 6 BACKEND TESTS PASSED SUCCESSFULLY! <<<')
  } finally {
    // Drain keep-alive sockets then let the event loop exit naturally.
    // Avoids a libuv assertion on Windows when process.exit() fires mid-close.
    server.close()
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
    process.exitCode = 0
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err)
  process.exit(1)
})
