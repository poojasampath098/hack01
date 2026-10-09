import { startServer } from './index.mjs'

const TEST_PORT = 4006
const baseUrl = `http://localhost:${TEST_PORT}`

async function runCreatorApiTests() {
  console.log(`Starting test server on port ${TEST_PORT}...`)
  const server = await startServer(TEST_PORT)

  try {
    // 1. LIST CREATORS: Default
    console.log('\n[1/12] Testing GET /api/creators (default listing)...')
    const res1 = await fetch(`${baseUrl}/api/creators`)
    const data1 = await res1.json()
    console.log(`Status: ${res1.status}, Total: ${data1.total}, Facets tools count: ${Object.keys(data1.facets?.tools || {}).length}`)
    if (res1.status !== 200 || data1.total < 6 || !data1.items[0].portfolio) {
      throw new Error('Default listing failed or missing enriched portfolio')
    }

    // 2. SEARCH QUERY
    console.log('\n[2/12] Testing GET /api/creators?q=cinematic...')
    const res2 = await fetch(`${baseUrl}/api/creators?q=cinematic`)
    const data2 = await res2.json()
    console.log(`Status: ${res2.status}, Matches found: ${data2.total}`)
    if (res2.status !== 200 || data2.total === 0) {
      throw new Error('Search query q=cinematic failed')
    }

    // 3. FILTER BY TOOLS & VERIFIED
    console.log('\n[3/12] Testing GET /api/creators?tools=Runway&verifiedOnly=true...')
    const res3 = await fetch(`${baseUrl}/api/creators?tools=Runway&verifiedOnly=true`)
    const data3 = await res3.json()
    console.log(`Status: ${res3.status}, Matches found: ${data3.total}`)
    const allVerified = data3.items.every((c) => c.verificationScore >= 80)
    const allHaveRunway = data3.items.every((c) =>
      c.tools.some((t) => (t.name || t).toLowerCase() === 'runway')
    )
    if (!allVerified || !allHaveRunway) {
      throw new Error('Tools & verifiedOnly filter failed')
    }

    // 4. FILTER BY PRICE & SORT
    console.log('\n[4/12] Testing GET /api/creators?minPrice=1000&maxPrice=2000&sort=price...')
    const res4 = await fetch(`${baseUrl}/api/creators?minPrice=1000&maxPrice=2000&sort=price`)
    const data4 = await res4.json()
    console.log(`Status: ${res4.status}, Matches: ${data4.total}, Prices: ${data4.items.map((c) => c.price).join(', ')}`)
    const pricesValid = data4.items.every((c) => c.price >= 1000 && c.price <= 2000)
    if (!pricesValid) {
      throw new Error('Price range filter failed')
    }

    // 5. PAGINATION
    console.log('\n[5/12] Testing pagination: page=1&limit=2 and page=2&limit=2...')
    const page1Res = await fetch(`${baseUrl}/api/creators?page=1&limit=2`)
    const page1Data = await page1Res.json()
    const page2Res = await fetch(`${baseUrl}/api/creators?page=2&limit=2`)
    const page2Data = await page2Res.json()
    console.log(`Page 1: ${page1Data.items.length} items, Page 2: ${page2Data.items.length} items, TotalPages: ${page1Data.totalPages}`)
    if (
      page1Data.items.length !== 2 ||
      page2Data.items.length !== 2 ||
      page1Data.items[0]._id === page2Data.items[0]._id
    ) {
      throw new Error('Pagination verification failed')
    }

    // 6. CREATOR DETAILS
    console.log('\n[6/12] Testing GET /api/creators/mara-lennox...')
    const detRes = await fetch(`${baseUrl}/api/creators/mara-lennox`)
    const detData = await detRes.json()
    console.log(`Status: ${detRes.status}, Name: ${detData.name}, Portfolio count: ${detData.portfolio?.length}`)
    if (detRes.status !== 200 || detData.name !== 'Mara Lennox' || detData.portfolio?.length < 1) {
      throw new Error('Creator details failed')
    }

    // 7. INPUT VALIDATION: POST /api/creators
    console.log('\n[7/12] Testing validation on POST /api/creators...')
    const invalidRes1 = await fetch(`${baseUrl}/api/creators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    const invalidData1 = await invalidRes1.json()
    console.log(`Status: ${invalidRes1.status}, Error: ${invalidData1.error}`)
    if (invalidRes1.status !== 400) throw new Error('Missing name validation failed')

    const invalidRes2 = await fetch(`${baseUrl}/api/creators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', handle: '@test', price: -500 }),
    })
    console.log(`Negative price validation status: ${invalidRes2.status}`)
    if (invalidRes2.status !== 400) throw new Error('Negative price validation failed')

    // 8. CREATE NEW CREATOR
    console.log('\n[8/12] Testing POST /api/creators (create new creator)...')
    const newCreatorPayload = {
      name: 'Kai Vance',
      handle: '@kaivance',
      headline: 'Next-gen real-time interactive worlds.',
      location: 'Berlin · CET',
      specialties: ['Motion graphics', '3D render'],
      tools: ['Unreal Engine', 'ComfyUI', 'Kling'],
      pricing: { from: 2100, currency: 'USD', unit: 'per-project' },
      price: 2100,
      portfolio: [
        {
          title: 'Quantum Bloom',
          type: 'Brand film',
          tools: ['ComfyUI'],
          year: '2026',
        },
      ],
    }
    const createRes = await fetch(`${baseUrl}/api/creators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCreatorPayload),
    })
    const createdData = await createRes.json()
    console.log(`Status: ${createRes.status}, Created ID: ${createdData._id}, Name: ${createdData.name}`)
    if (createRes.status !== 201 || createdData.handle !== '@kaivance') {
      throw new Error('Create creator failed')
    }
    const testCreatorId = createdData._id

    // 9. UPDATE CREATOR
    console.log(`\n[9/12] Testing PUT /api/creators/${testCreatorId}...`)
    const updateRes = await fetch(`${baseUrl}/api/creators/${testCreatorId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        headline: 'Updated headline: Architect of impossible digital landscapes.',
        price: 2800,
      }),
    })
    const updatedData = await updateRes.json()
    console.log(`Status: ${updateRes.status}, New Price: ${updatedData.price}, New Headline: ${updatedData.headline}`)
    if (updateRes.status !== 200 || updatedData.price !== 2800) {
      throw new Error('Update creator failed')
    }

    // 10. PORTFOLIO APIS: LIST, ADD, UPDATE, DELETE
    console.log(`\n[10/12] Testing Portfolio APIs for creator ${testCreatorId}...`)
    const portListRes = await fetch(`${baseUrl}/api/creators/${testCreatorId}/portfolio`)
    const portListData = await portListRes.json()
    console.log(`Portfolio list count: ${portListData.total}`)
    if (portListRes.status !== 200 || portListData.total !== 1) {
      throw new Error('Portfolio list failed')
    }

    const portAddRes = await fetch(`${baseUrl}/api/creators/${testCreatorId}/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Neon Odyssey',
        type: 'Music visual',
        tools: ['Unreal Engine', 'Kling'],
        durationSec: 45,
        year: '2026',
      }),
    })
    const portAddData = await portAddRes.json()
    console.log(`Added portfolio item ID: ${portAddData._id}, Title: ${portAddData.title}`)
    if (portAddRes.status !== 201 || portAddData.title !== 'Neon Odyssey') {
      throw new Error('Add portfolio item failed')
    }
    const newPortId = portAddData._id

    const portUpdateRes = await fetch(`${baseUrl}/api/creators/${testCreatorId}/portfolio/${newPortId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Neon Odyssey: Director Cut',
        durationSec: 60,
      }),
    })
    const portUpdateData = await portUpdateRes.json()
    console.log(`Updated portfolio title: ${portUpdateData.title}, Duration: ${portUpdateData.durationSec}s`)
    if (portUpdateRes.status !== 200 || portUpdateData.title !== 'Neon Odyssey: Director Cut') {
      throw new Error('Update portfolio item failed')
    }

    const portDeleteRes = await fetch(`${baseUrl}/api/creators/${testCreatorId}/portfolio/${newPortId}`, {
      method: 'DELETE',
    })
    const portDeleteData = await portDeleteRes.json()
    console.log(`Deleted portfolio item response: ${JSON.stringify(portDeleteData)}`)
    if (portDeleteRes.status !== 200 || !portDeleteData.ok) {
      throw new Error('Delete portfolio item failed')
    }

    // 11. DELETE CREATOR
    console.log(`\n[11/12] Testing DELETE /api/creators/${testCreatorId}...`)
    const deleteRes = await fetch(`${baseUrl}/api/creators/${testCreatorId}`, {
      method: 'DELETE',
    })
    const deleteData = await deleteRes.json()
    console.log(`Delete status: ${deleteRes.status}, Response:`, deleteData)
    if (deleteRes.status !== 200 || !deleteData.ok) {
      throw new Error('Delete creator failed')
    }

    const checkGoneRes = await fetch(`${baseUrl}/api/creators/${testCreatorId}`)
    console.log(`Subsequent GET status: ${checkGoneRes.status}`)
    if (checkGoneRes.status !== 404) {
      throw new Error('Deleted creator still found')
    }

    // 12. 404 ERROR HANDLING
    console.log('\n[12/12] Testing 404 for nonexistent creator and portfolio...')
    const nonExistPortRes = await fetch(`${baseUrl}/api/creators/nonexistent-id/portfolio`)
    if (nonExistPortRes.status !== 404) throw new Error('Expected 404 for nonexistent portfolio')
    console.log('404 for nonexistent portfolio confirmed.')

    console.log('\n======================================================')
    console.log('>>> ALL 12 CREATOR & PORTFOLIO API TESTS PASSED! <<<')
    console.log('======================================================')
  } finally {
    server.close(() => {
      console.log('Test server closed.')
    })
  }
}

runCreatorApiTests().catch((err) => {
  console.error('\nTest suite failed:', err)
  process.exit(1)
})
