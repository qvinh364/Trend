const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { validateAgentObservation, validateDiscoveryPayload } = require('../src/modules/tiktok/discovery/candidateContract');
const { isGenericNoise, cleanLabel, createDeterministicKey } = require('../src/modules/tiktok/discovery/candidateNormalizer');
const { mergeDiscoverySources } = require('../src/modules/tiktok/discovery/candidateMerger');

console.log('\n======================================================');
console.log('🧪 RUNNING TIKTOK DISCOVERY (PHASE 2A.4) TEST SUITE');
console.log('======================================================\n');

let passedTests = 0;
const totalTests = 10;

// TEST 1: Agent observation schema validation
try {
  const sampleObs = {
    source: 'tiktok_explore',
    surface: 'explore_repeated_signal',
    observed_at: new Date().toISOString(),
    label: 'vutruai',
    candidate_type_hint: 'topic',
    type_confidence: 'LOW',
    page_url: 'https://www.tiktok.com/explore',
    evidence_urls: ['https://www.tiktok.com/@ai/video/123'],
    raw_text: 'Vũ trụ AI khám phá công nghệ',
    capture_method: 'playwright_persistent_authenticated_profile',
    is_mock: false,
    seed_origin: null,
    seed_label: null
  };
  assert.strictEqual(validateAgentObservation(sampleObs), true);
  console.log('✅ TEST 1 PASSED: Agent observation schema validates successfully');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 1 FAILED:', err.message);
}

// TEST 2: capture_method must be playwright_persistent_authenticated_profile
try {
  const invalidCapture = {
    source: 'tiktok_explore',
    surface: 'explore_single_signal',
    label: 'testtag',
    candidate_type_hint: 'hashtag',
    type_confidence: 'LOW',
    page_url: 'https://www.tiktok.com/explore',
    capture_method: 'antigravity_authenticated_browser', // Old/invalid method
    is_mock: false
  };
  assert.throws(() => validateAgentObservation(invalidCapture), /capture_method must be/);
  console.log('✅ TEST 2 PASSED: Enforces capture_method = playwright_persistent_authenticated_profile');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 2 FAILED:', err.message);
}

// TEST 3: is_mock must be false
try {
  const mockObs = {
    source: 'tiktok_explore',
    surface: 'explore_single_signal',
    label: 'testmock',
    candidate_type_hint: 'topic',
    type_confidence: 'LOW',
    page_url: 'https://www.tiktok.com/explore',
    capture_method: 'playwright_persistent_authenticated_profile',
    is_mock: true // Forbidden!
  };
  assert.throws(() => validateAgentObservation(mockObs), /is_mock must be false/);
  console.log('✅ TEST 3 PASSED: Enforces is_mock === false');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 3 FAILED:', err.message);
}

// TEST 4: Search-derived observation stores seed_origin and seed_label
try {
  const searchObs = {
    source: 'tiktok_search_ui',
    surface: 'related_search',
    observed_at: new Date().toISOString(),
    label: 'ob55 free fire',
    candidate_type_hint: 'search_query',
    type_confidence: 'LOW',
    page_url: 'https://www.tiktok.com/search?q=ob55',
    evidence_urls: [],
    raw_text: 'Others searched for ob55 free fire',
    capture_method: 'playwright_persistent_authenticated_profile',
    is_mock: false,
    seed_origin: 'creative_center',
    seed_label: 'ob55'
  };
  assert(searchObs.seed_origin === 'creative_center');
  assert(searchObs.seed_label === 'ob55');
  assert.strictEqual(validateAgentObservation(searchObs), true);
  console.log('✅ TEST 4 PASSED: Search-derived observation accurately stores seed_origin and seed_label');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 4 FAILED:', err.message);
}

// TEST 5: 30d-only candidate does not leak into current_candidates
try {
  const payload = mergeDiscoverySources({
    ccData: {
      source_runs: [],
      cc7dList: [{ label: 'current_7d_tag', tag: '#current_7d_tag', rank: 1, posts: 1000, views: 50000 }],
      cc30dList: [
        { label: 'current_7d_tag', tag: '#current_7d_tag', rank: 1, posts: 5000, views: 200000 },
        { label: 'old_30d_only_tag', tag: '#old_30d_only_tag', rank: 2, posts: 20000, views: 1000000 }
      ]
    },
    agentObservations: []
  });
  const currentKeys = payload.current_candidates.map(c => c.canonical_label);
  const histKeys = payload.historical_context.map(c => c.canonical_label);
  assert(currentKeys.includes('current_7d_tag'), 'current_candidates must contain 7d tag');
  assert(!currentKeys.includes('old_30d_only_tag'), 'current_candidates must NOT contain 30d-only tag');
  assert(histKeys.includes('old_30d_only_tag'), 'historical_context must contain 30d-only tag');
  console.log('✅ TEST 5 PASSED: 30d-only candidates strictly isolated into historical_context');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 5 FAILED:', err.message);
}

// TEST 6: Generic noise blacklist works
try {
  assert.strictEqual(isGenericNoise('fyp'), true);
  assert.strictEqual(isGenericNoise('xuhuong'), true);
  assert.strictEqual(isGenericNoise('trend'), true);
  assert.strictEqual(isGenericNoise('a'), true); // length < 2
  assert.strictEqual(isGenericNoise('mylivejourney'), false);
  console.log('✅ TEST 6 PASSED: Generic blacklist effectively drops noise hashtags');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 6 FAILED:', err.message);
}

// TEST 7: Candidate deduplication is deterministic
try {
  const k1 = createDeterministicKey('hashtag', '#mylivejourney');
  const k2 = createDeterministicKey('hashtag', 'mylivejourney');
  const k3 = createDeterministicKey('hashtag', '  #MYLIVEJOURNEY  ');
  assert.strictEqual(k1, 'hashtag:mylivejourney');
  assert.strictEqual(k2, 'hashtag:mylivejourney');
  assert.strictEqual(k3, 'hashtag:mylivejourney');
  console.log('✅ TEST 7 PASSED: Deterministic candidate keys ensure stable deduplication');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 7 FAILED:', err.message);
}

// TEST 8: No trend_score in Phase 2A output
try {
  const sampleCandidate = {
    candidate_key: 'hashtag:test',
    canonical_label: 'test',
    candidate_type_hint: 'hashtag',
    type_confidence: 'LOW',
    nature_hint: 'organic_unknown',
    freshness_warning: false,
    discovery_sources: [{ source: 'creative_center' }]
  };
  sampleCandidate.trend_score = 75; // Forbidden in Phase 2A!
  assert.throws(() => validateDiscoveryPayload({
    scan_id: 'test',
    observed_at: new Date().toISOString(),
    discovery_coverage: 'PARTIAL',
    source_runs: [],
    current_candidates: [sampleCandidate],
    historical_context: []
  }), /trend_score is forbidden/);
  console.log('✅ TEST 8 PASSED: Enforces strictly zero trend_score in Phase 2A discovery');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 8 FAILED:', err.message);
}

// TEST 9: No lifecycle HOT/RISING in Phase 2A output
try {
  const sampleCandidate = {
    candidate_key: 'hashtag:test',
    canonical_label: 'test',
    candidate_type_hint: 'hashtag',
    type_confidence: 'LOW',
    nature_hint: 'organic_unknown',
    freshness_warning: false,
    discovery_sources: [{ source: 'creative_center' }]
  };
  sampleCandidate.lifecycle = 'HOT'; // Forbidden in Phase 2A!
  assert.throws(() => validateDiscoveryPayload({
    scan_id: 'test',
    observed_at: new Date().toISOString(),
    discovery_coverage: 'PARTIAL',
    source_runs: [],
    current_candidates: [sampleCandidate],
    historical_context: []
  }), /lifecycle is forbidden/);
  console.log('✅ TEST 9 PASSED: Enforces strictly zero lifecycle classification in Phase 2A discovery');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 9 FAILED:', err.message);
}

// TEST 10: Security audit scan of discovery source code
try {
  const discoveryFiles = [
    'src/modules/tiktok/discovery/candidateNormalizer.js',
    'src/modules/tiktok/discovery/candidateContract.js',
    'src/modules/tiktok/discovery/candidateMerger.js',
    'src/modules/tiktok/discovery/creativeCenterCollector.js',
    'src/modules/tiktok/discovery/authenticatedDiscoveryCollector.js',
    'src/modules/tiktok/discovery/candidateDiscovery.js'
  ];

  for (const f of discoveryFiles) {
    const fullPath = path.resolve(__dirname, '..', f);
    if (fs.existsSync(fullPath)) {
      const code = fs.readFileSync(fullPath, 'utf8');
      assert(!code.includes('SELECT from cookies') && !code.includes('FROM cookies'), `No SQL cookies query in ${f}`);
      assert(!code.includes('ProtectedData') && !code.includes('DPAPI'), `No DPAPI decrypt in ${f}`);
      assert(!code.includes('cookie.value'), `No cookie value logging in ${f}`);
      assert(!code.includes('storageState('), `No storageState dump in ${f}`);
    }
  }
  console.log('✅ TEST 10 PASSED: Source code security audit passed (no cookie DB queries, no DPAPI decrypt, no secret dumping)');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 10 FAILED:', err.message);
}

console.log('\n------------------------------------------------------');
console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('------------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
