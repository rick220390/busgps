// Simple test script to verify the API endpoints
// Run with: node test-api.js

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

async function testAPI() {
  console.log('🧪 Testing Bus Hazard API...\n');
  console.log(`📍 API URL: ${BASE_URL}\n`);

  // Test 1: Health Check
  console.log('1️⃣ Testing Health Check...');
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    console.log('✅ Health Check:', data);
  } catch (error) {
    console.log('❌ Health Check Failed:', error.message);
    return;
  }

  // Test 2: Report Hazard
  console.log('\n2️⃣ Testing Report Hazard...');
  try {
    const response = await fetch(`${BASE_URL}/api/hazards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'Police',
        latitude: 51.5074,
        longitude: -0.1278,
        reported_by: 'test_script'
      })
    });
    const data = await response.json();
    console.log('✅ Report Hazard:', data);
  } catch (error) {
    console.log('❌ Report Hazard Failed:', error.message);
  }

  // Test 3: Get Hazards
  console.log('\n3️⃣ Testing Get Hazards...');
  try {
    const response = await fetch(`${BASE_URL}/api/hazards?lat=51.5074&lng=-0.1278&radius=50`);
    const data = await response.json();
    console.log(`✅ Get Hazards: Found ${data.count} hazards`);
    if (data.hazards && data.hazards.length > 0) {
      console.log('   Sample:', data.hazards[0]);
    }
  } catch (error) {
    console.log('❌ Get Hazards Failed:', error.message);
  }

  // Test 4: Statistics
  console.log('\n4️⃣ Testing Statistics...');
  try {
    const response = await fetch(`${BASE_URL}/api/stats`);
    const data = await response.json();
    console.log('✅ Statistics:', data);
  } catch (error) {
    console.log('❌ Statistics Failed:', error.message);
  }

  console.log('\n✅ All tests completed!\n');
}

// Run tests
testAPI().catch(error => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});
