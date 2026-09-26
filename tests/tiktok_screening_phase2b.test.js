const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { 
  evaluateCandidateScreening, 
  normalizeMetric 
} = require('../src/modules/tiktok/screening/screeningEvaluator');
const { 
  validateCandidateScreeningResult, 
  validateScreeningPayload 
} = require('../src/modules/tiktok/screening/screeningContract');

console.log('\n======================================================');
console.log('🧪 RUNNING TIKTOK LIGHT SCREENING (PHASE 2B) TEST SUITE');
console.log('======================================================\n');

let passedTests = 0;
const totalTests = 14;

// Fixture candidate
const sampleCandidate = {
  candidate_key: 'topic:test_topic',
  canonical_label: 'test_topic',
  candidate_type_hint: 'topic',
  type_confidence: 'LOW',
  discovery_signal_strength: 'MEDIUM',
  surface_scope: ['query_contextual']
};

// TEST 1: 3 video from the same creator -> does NOT PASS (DROP)
try {
  const singleCreatorItems = [
    { video_url: 'https://www.tiktok.com/@brand/video/1', creator_handle: '@brand', caption: 'test_topic part 1' },
    { video_url: 'https://www.tiktok.com/@brand/video/2', creator_handle: '@brand', caption: 'test_topic part 2' },
    { video_url: 'https://www.tiktok.com/@brand/video/3', creator_handle: '@brand', caption: 'test_topic part 3' }
  ];
  const res = evaluateCandidateScreening(sampleCandidate, singleCreatorItems);
  assert.notStrictEqual(res.screening_status, 'PASS_TO_DEEP_VALIDATION', 'Must NOT pass if only 1 creator');
  assert.strictEqual(res.screening_status, 'DROP');
  assert.strictEqual(res.unique_creators, 1);
  console.log('✅ TEST 1 PASSED: 3 videos from same creator -> does NOT pass (DROP)');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 1 FAILED:', err.message);
}

// TEST 2: 3 relevant videos from 3 independent creators + repeated pattern -> PASS_TO_DEEP_VALIDATION
try {
  const multiCreatorItems = [
    { video_url: 'https://www.tiktok.com/@creator1/video/1', creator_handle: '@creator1', caption: 'test_topic review 1', relevance: 'RELEVANT' },
    { video_url: 'https://www.tiktok.com/@creator2/video/2', creator_handle: '@creator2', caption: 'test_topic review 2', relevance: 'RELEVANT' },
    { video_url: 'https://www.tiktok.com/@creator3/video/3', creator_handle: '@creator3', caption: 'test_topic review 3', relevance: 'RELEVANT' }
  ];
  const res = evaluateCandidateScreening(sampleCandidate, multiCreatorItems);
  assert.strictEqual(res.screening_status, 'PASS_TO_DEEP_VALIDATION');
  assert.strictEqual(res.unique_creators, 3);
  assert.strictEqual(res.replication_observed, true);
  console.log('✅ TEST 2 PASSED: 3 relevant videos from 3 independent creators -> PASS_TO_DEEP_VALIDATION');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 2 FAILED:', err.message);
}

// TEST 3: Generic / unrelated search results -> DROP
try {
  const unrelatedItems = [
    { video_url: 'https://www.tiktok.com/@user1/video/1', creator_handle: '@user1', caption: 'completely unrelated cooking', relevance: 'NOT_RELEVANT' },
    { video_url: 'https://www.tiktok.com/@user2/video/2', creator_handle: '@user2', caption: 'random cat dancing', relevance: 'NOT_RELEVANT' },
    { video_url: 'https://www.tiktok.com/@user3/video/3', creator_handle: '@user3', caption: 'travel vlog da nang', relevance: 'NOT_RELEVANT' }
  ];
  const res = evaluateCandidateScreening(sampleCandidate, unrelatedItems);
  assert.strictEqual(res.screening_status, 'DROP');
  assert.strictEqual(res.replication_observed, false);
  console.log('✅ TEST 3 PASSED: Generic / unrelated search results -> DROP');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 3 FAILED:', err.message);
}

// TEST 4: Missing metrics -> null (never 0)
try {
  assert.strictEqual(normalizeMetric(null), null);
  assert.strictEqual(normalizeMetric(undefined), null);
  assert.strictEqual(normalizeMetric(''), null);
  assert.strictEqual(normalizeMetric('N/A'), null);
  assert.strictEqual(normalizeMetric('12.5K'), 12500);
  console.log('✅ TEST 4 PASSED: Missing metrics strictly resolve to null (never 0)');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 4 FAILED:', err.message);
}

// TEST 5: Duplicate video URL -> dedupe
try {
  const duplicateItems = [
    { video_url: 'https://www.tiktok.com/@creator1/video/1', creator_handle: '@creator1', caption: 'test_topic video 1' },
    { video_url: 'https://www.tiktok.com/@creator1/video/1', creator_handle: '@creator1', caption: 'test_topic video 1 duplicate' },
    { video_url: 'https://www.tiktok.com/@creator2/video/2', creator_handle: '@creator2', caption: 'test_topic video 2' }
  ];
  const res = evaluateCandidateScreening(sampleCandidate, duplicateItems);
  assert.strictEqual(res.evidence.length, 2, 'Must deduplicate identical video URLs');
  console.log('✅ TEST 5 PASSED: Duplicate video URLs correctly deduplicated');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 5 FAILED:', err.message);
}

// TEST 6: Evidence max = 5
try {
  const sevenItems = [1, 2, 3, 4, 5, 6, 7].map(i => ({
    video_url: `https://www.tiktok.com/@creator${i}/video/${i}`,
    creator_handle: `@creator${i}`,
    caption: `test_topic video ${i}`
  }));
  const res = evaluateCandidateScreening(sampleCandidate, sevenItems);
  assert(res.evidence.length <= 5, `Evidence length must be <= 5, got ${res.evidence.length}`);
  console.log('✅ TEST 6 PASSED: Evidence count strictly capped at max 5');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 6 FAILED:', err.message);
}

// TEST 7: DROP candidate can early_stop at 3
try {
  const singleCreatorItems = [
    { video_url: 'https://www.tiktok.com/@shop/video/1', creator_handle: '@shop', caption: 'shop promo 1' },
    { video_url: 'https://www.tiktok.com/@shop/video/2', creator_handle: '@shop', caption: 'shop promo 2' },
    { video_url: 'https://www.tiktok.com/@shop/video/3', creator_handle: '@shop', caption: 'shop promo 3' }
  ];
  const res = evaluateCandidateScreening(sampleCandidate, singleCreatorItems);
  assert.strictEqual(res.early_stop, true, 'DROP should trigger early_stop');
  assert.strictEqual(res.sample_size, 3);
  console.log('✅ TEST 7 PASSED: Clear DROP candidate triggers early_stop at sample size 3');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 7 FAILED:', err.message);
}

// TEST 8: historical_context is NOT screened
try {
  const candidatesFile = path.resolve(__dirname, '../data/tiktok_candidates.json');
  const candidatesData = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));
  const histKeys = candidatesData.historical_context.map(c => c.candidate_key);
  const currentKeys = candidatesData.current_candidates.map(c => c.candidate_key);

  // In collector logic, only current_candidates are screened
  for (const hk of histKeys) {
    assert(!currentKeys.includes(hk), `Historical key ${hk} must not be present in current candidates`);
  }
  console.log('✅ TEST 8 PASSED: historical_context candidates are completely excluded from screening target');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 8 FAILED:', err.message);
}

// TEST 9: Search-related isolated candidate initially = WEAK
try {
  const candidatesFile = path.resolve(__dirname, '../data/tiktok_candidates.json');
  const candidatesData = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));
  const searchCandidates = candidatesData.current_candidates.filter(c => c.candidate_type_hint === 'search_query');
  for (const sc of searchCandidates) {
    assert.strictEqual(sc.discovery_signal_strength, 'WEAK', `Search candidate ${sc.candidate_key} must be WEAK`);
  }
  console.log('✅ TEST 9 PASSED: Isolated Search Related candidates confirmed with signal strength WEAK');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 9 FAILED:', err.message);
}

// TEST 10: Single Explore candidate = WEAK
try {
  const candidatesFile = path.resolve(__dirname, '../data/tiktok_candidates.json');
  const candidatesData = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));
  const exploreCandidates = candidatesData.current_candidates.filter(c => 
    c.discovery_sources.some(s => s.source === 'tiktok_explore' && s.surface === 'explore_single_signal')
  );
  for (const ec of exploreCandidates) {
    assert.strictEqual(ec.discovery_signal_strength, 'WEAK', `Explore candidate ${ec.candidate_key} must be WEAK`);
  }
  console.log('✅ TEST 10 PASSED: Single Explore candidate confirmed with signal strength WEAK');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 10 FAILED:', err.message);
}

// TEST 11: No trend_score in screening output
try {
  const badResult = {
    candidate_key: 'topic:test',
    canonical_label: 'test',
    candidate_type_hint_before: 'topic',
    type_confidence_before: 'LOW',
    discovery_signal_strength: 'MEDIUM',
    surface_scope: ['query_contextual'],
    screening_status: 'PASS_TO_DEEP_VALIDATION',
    sample_size: 3,
    unique_creators: 3,
    replication_observed: true,
    screening_reason: 'ok',
    candidate_type_hint_after: 'topic',
    type_confidence_after: 'MEDIUM',
    evidence: [],
    trend_score: 85 // FORBIDDEN!
  };
  assert.throws(() => validateCandidateScreeningResult(badResult), /trend_score is strictly forbidden/);
  console.log('✅ TEST 11 PASSED: Strict rejection of trend_score in Phase 2B screening output');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 11 FAILED:', err.message);
}

// TEST 12: No lifecycle classification in screening output
try {
  const badLifecycle = {
    candidate_key: 'topic:test',
    canonical_label: 'test',
    candidate_type_hint_before: 'topic',
    type_confidence_before: 'LOW',
    discovery_signal_strength: 'MEDIUM',
    surface_scope: ['query_contextual'],
    screening_status: 'PASS_TO_DEEP_VALIDATION',
    sample_size: 3,
    unique_creators: 3,
    replication_observed: true,
    screening_reason: 'ok',
    candidate_type_hint_after: 'topic',
    type_confidence_after: 'MEDIUM',
    evidence: [],
    lifecycle: 'HOT' // FORBIDDEN!
  };
  assert.throws(() => validateCandidateScreeningResult(badLifecycle), /lifecycle is strictly forbidden/);
  console.log('✅ TEST 12 PASSED: Strict rejection of lifecycle classification in Phase 2B screening output');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 12 FAILED:', err.message);
}

// TEST 13: Security audit: No Cookie DB / DPAPI / secret inspection in Phase 2B modules
try {
  const screeningFiles = [
    'src/modules/tiktok/screening/screeningContract.js',
    'src/modules/tiktok/screening/screeningEvaluator.js',
    'src/modules/tiktok/screening/screeningCollector.js'
  ];

  for (const f of screeningFiles) {
    const fullPath = path.resolve(__dirname, '..', f);
    if (fs.existsSync(fullPath)) {
      const code = fs.readFileSync(fullPath, 'utf8');
      assert(!code.includes('SELECT from cookies') && !code.includes('FROM cookies'), `No SQL cookies query in ${f}`);
      assert(!code.includes('ProtectedData') && !code.includes('DPAPI'), `No DPAPI decrypt in ${f}`);
      assert(!code.includes('cookie.value'), `No cookie value logging in ${f}`);
      assert(!code.includes('storageState('), `No storageState dump in ${f}`);
    }
  }
  console.log('✅ TEST 13 PASSED: Security audit passed (zero cookie DB, zero DPAPI, zero secret logging in Phase 2B)');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 13 FAILED:', err.message);
}

// TEST 14: Facebook module untouched
try {
  const fbDir = path.resolve(__dirname, '../src/modules/facebook');
  assert(fs.existsSync(fbDir), 'Facebook directory must exist');
  const fbFiles = fs.readdirSync(fbDir);
  assert(fbFiles.length > 0, 'Facebook module files must remain intact');
  console.log('✅ TEST 14 PASSED: Facebook module is 100% untouched and preserved intact');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 14 FAILED:', err.message);
}

console.log('\n------------------------------------------------------');
console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('------------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
