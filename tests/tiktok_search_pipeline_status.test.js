/**
 * TARGETED PIPELINE SEARCH STATUS PROPAGATION TEST SUITE
 * 
 * Verifies end-to-end transmission of Search statuses through:
 * candidateMerger and screeningEvaluator
 * 
 * 1. Search status = SEARCH_RESULTS_AVAILABLE + observations > 0 -> not restricted
 * 2. Search status = NO_RESULTS + observations = 0 -> not ACCESS_RESTRICTED
 * 3. Search status = ACCESS_RESTRICTED + observations = 0 -> maintains ACCESS_RESTRICTED
 * 4. LOGIN_REQUIRED / CAPTCHA_REQUIRED -> not converted to NO_RESULTS
 * 5. Candidate lacks evidence due to NO_RESULTS -> INCONCLUSIVE, not DROP due to false restriction
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeDiscoverySources } = require('../src/modules/tiktok/discovery/candidateMerger');
const { evaluateCandidateScreening } = require('../src/modules/tiktok/screening/screeningEvaluator');

const dummyCandidate = {
  candidate_key: 'hashtag:samdealruocden',
  canonical_label: 'samdealruocden',
  candidate_type_hint: 'hashtag',
  discovery_signal_strength: 'MEDIUM',
  surface_scope: ['query_contextual']
};

test('TEST 1: Search status = SEARCH_RESULTS_AVAILABLE + observations > 0 -> not restricted', () => {
  // Discovery merger
  const payload = mergeDiscoverySources({
    ccData: { source_runs: [], cc7dList: [], cc30dList: [] },
    agentObservations: [
      {
        source: 'tiktok_search_ui',
        surface: 'query_contextual',
        label: 'samdealruocden',
        candidate_type_hint: 'hashtag',
        observed_at: '2026-09-25T08:00:00.000Z'
      }
    ],
    searchStatus: 'SEARCH_RESULTS_AVAILABLE'
  });

  const searchRun = payload.source_runs.find(r => r.source === 'tiktok_search_ui');
  assert.ok(searchRun, 'Must have tiktok_search_ui source_run');
  assert.equal(searchRun.status, 'SEARCH_RESULTS_AVAILABLE');
  assert.notEqual(searchRun.status, 'ACCESS_RESTRICTED');
  assert.equal(searchRun.raw_items_found, 1);
  assert.equal(searchRun.error, null);

  // Screening evaluation with available observations
  const screeningRes = evaluateCandidateScreening(dummyCandidate, [
    {
      video_url: 'https://www.tiktok.com/@shop1/video/7100000000000000001',
      creator_handle: '@shop1',
      caption: 'Deal rước đèn trung thu cực hot',
      views: 50000,
      relevance: 'RELEVANT'
    },
    {
      video_url: 'https://www.tiktok.com/@shop2/video/7100000000000000002',
      creator_handle: '@shop2',
      caption: 'Review deal rước đèn trung thu',
      views: 30000,
      relevance: 'RELEVANT'
    },
    {
      video_url: 'https://www.tiktok.com/@shop3/video/7100000000000000003',
      creator_handle: '@shop3',
      caption: 'Săn deal rước đèn cực hời',
      views: 20000,
      relevance: 'RELEVANT'
    }
  ], { searchStatus: 'SEARCH_RESULTS_AVAILABLE' });

  assert.equal(screeningRes.screening_status, 'PASS_TO_DEEP_VALIDATION');
  assert.notEqual(screeningRes.screening_status, 'INCONCLUSIVE');
  assert.ok(!screeningRes.screening_reason.includes('restricted'), 'Must not claim restricted');
});

test('TEST 2: Search status = NO_RESULTS + observations = 0 -> NOT ACCESS_RESTRICTED', () => {
  // Discovery merger with explicit NO_RESULTS
  const payloadExplicit = mergeDiscoverySources({
    ccData: { source_runs: [], cc7dList: [], cc30dList: [] },
    agentObservations: [],
    searchStatus: 'NO_RESULTS'
  });

  const searchRunExplicit = payloadExplicit.source_runs.find(r => r.source === 'tiktok_search_ui');
  assert.ok(searchRunExplicit, 'Must have tiktok_search_ui source_run');
  assert.equal(searchRunExplicit.status, 'NO_RESULTS');
  assert.notEqual(searchRunExplicit.status, 'ACCESS_RESTRICTED');
  assert.equal(searchRunExplicit.raw_items_found, 0);
  assert.equal(searchRunExplicit.error, null);

  // Discovery merger with default (no searchStatus specified and 0 items)
  const payloadDefault = mergeDiscoverySources({
    ccData: { source_runs: [], cc7dList: [], cc30dList: [] },
    agentObservations: []
  });

  const searchRunDefault = payloadDefault.source_runs.find(r => r.source === 'tiktok_search_ui');
  assert.ok(searchRunDefault, 'Must have tiktok_search_ui source_run');
  assert.equal(searchRunDefault.status, 'NO_RESULTS');
  assert.notEqual(searchRunDefault.status, 'ACCESS_RESTRICTED', 'Zero items must never default to ACCESS_RESTRICTED');
  assert.equal(searchRunDefault.error, null);
});

test('TEST 3: Search status = ACCESS_RESTRICTED + observations = 0 -> maintains ACCESS_RESTRICTED', () => {
  // Discovery merger
  const payload = mergeDiscoverySources({
    ccData: { source_runs: [], cc7dList: [], cc30dList: [] },
    agentObservations: [],
    searchStatus: 'ACCESS_RESTRICTED',
    liveDiagnostics: {
      search: {
        status: 'ACCESS_RESTRICTED',
        error: 'TikTok Search blocked with "Too many requests"'
      }
    }
  });

  const searchRun = payload.source_runs.find(r => r.source === 'tiktok_search_ui');
  assert.ok(searchRun, 'Must have tiktok_search_ui source_run');
  assert.equal(searchRun.status, 'ACCESS_RESTRICTED');
  assert.ok(searchRun.error.includes('restricted') || searchRun.error.includes('Too many requests'));

  // Screening evaluation with confirmed restriction
  const screeningRes = evaluateCandidateScreening(dummyCandidate, [], {
    searchStatus: 'ACCESS_RESTRICTED'
  });

  assert.equal(screeningRes.screening_status, 'INCONCLUSIVE');
  assert.equal(screeningRes.status, 'INCONCLUSIVE');
  assert.ok(screeningRes.screening_reason.includes('restricted'), 'Reason must explicitly reflect access restriction');
});

test('TEST 4: LOGIN_REQUIRED / CAPTCHA_REQUIRED -> not converted to NO_RESULTS', () => {
  // LOGIN_REQUIRED in discovery merger
  const payloadLogin = mergeDiscoverySources({
    ccData: { source_runs: [], cc7dList: [], cc30dList: [] },
    agentObservations: [],
    searchStatus: 'LOGIN_REQUIRED'
  });
  const searchRunLogin = payloadLogin.source_runs.find(r => r.source === 'tiktok_search_ui');
  assert.equal(searchRunLogin.status, 'LOGIN_REQUIRED');
  assert.notEqual(searchRunLogin.status, 'NO_RESULTS');

  // CAPTCHA_REQUIRED in discovery merger
  const payloadCaptcha = mergeDiscoverySources({
    ccData: { source_runs: [], cc7dList: [], cc30dList: [] },
    agentObservations: [],
    searchStatus: 'CAPTCHA_REQUIRED'
  });
  const searchRunCaptcha = payloadCaptcha.source_runs.find(r => r.source === 'tiktok_search_ui');
  assert.equal(searchRunCaptcha.status, 'CAPTCHA_REQUIRED');
  assert.notEqual(searchRunCaptcha.status, 'NO_RESULTS');

  // Screening evaluation for LOGIN_REQUIRED
  const screeningLogin = evaluateCandidateScreening(dummyCandidate, [], {
    searchStatus: 'LOGIN_REQUIRED'
  });
  assert.equal(screeningLogin.screening_status, 'INCONCLUSIVE');
  assert.ok(screeningLogin.screening_reason.toLowerCase().includes('login'), 'Must reflect login challenge');
  assert.ok(!screeningLogin.screening_reason.includes('NO_RESULTS'), 'Must not be collapsed to NO_RESULTS');

  // Screening evaluation for CAPTCHA_REQUIRED
  const screeningCaptcha = evaluateCandidateScreening(dummyCandidate, [], {
    searchStatus: 'CAPTCHA_REQUIRED'
  });
  assert.equal(screeningCaptcha.screening_status, 'INCONCLUSIVE');
  assert.ok(screeningCaptcha.screening_reason.toLowerCase().includes('captcha'), 'Must reflect captcha challenge');
  assert.ok(!screeningCaptcha.screening_reason.includes('NO_RESULTS'), 'Must not be collapsed to NO_RESULTS');
});

test('TEST 5: Candidate lacks evidence due to NO_RESULTS -> INCONCLUSIVE, not DROP due to false restriction', () => {
  const screeningRes = evaluateCandidateScreening(dummyCandidate, [], {
    searchStatus: 'NO_RESULTS'
  });

  // Must be INCONCLUSIVE, NOT DROP
  assert.equal(screeningRes.screening_status, 'INCONCLUSIVE');
  assert.equal(screeningRes.status, 'INCONCLUSIVE');
  assert.notEqual(screeningRes.screening_status, 'DROP', 'Must NOT prematurely DROP candidate');
  assert.equal(screeningRes.early_stop, false);

  // Reason must reflect NO_RESULTS and NOT false restriction
  assert.ok(screeningRes.screening_reason.includes('NO_RESULTS'), 'Reason must reflect NO_RESULTS');
  assert.ok(!screeningRes.screening_reason.toLowerCase().includes('restricted'), 'Reason must NOT claim access restriction');
});

test('TEST 6: Per-query status isolation (Query A restriction does not contaminate Query B or C)', () => {
  const candA = { candidate_key: 'hashtag:query_a', canonical_label: 'query_a' };
  const candB = { candidate_key: 'hashtag:query_b', canonical_label: 'query_b' };
  const candC = { candidate_key: 'hashtag:query_c', canonical_label: 'query_c' };

  // Query A: genuinely restricted
  const resA = evaluateCandidateScreening(candA, [], {
    accessRestricted: true,
    searchStatus: 'ACCESS_RESTRICTED'
  });
  assert.equal(resA.screening_status, 'INCONCLUSIVE');
  assert.ok(resA.screening_reason.toLowerCase().includes('restricted'), 'Query A must record restriction');

  // Query B: SEARCH_RESULTS_AVAILABLE with >= 2 independent video samples matching canonical_label
  const resB = evaluateCandidateScreening(candB, [
    { video_url: 'https://www.tiktok.com/@u1/video/1', creator_handle: '@u1', caption: 'query_b sample video one', views: 50000, relevance: 'RELEVANT' },
    { video_url: 'https://www.tiktok.com/@u2/video/2', creator_handle: '@u2', caption: 'query_b sample video two', views: 60000, relevance: 'RELEVANT' }
  ], {
    accessRestricted: false,
    searchStatus: 'SEARCH_RESULTS_AVAILABLE'
  });
  assert.notEqual(resB.screening_status, 'ACCESS_RESTRICTED', 'Query B must NOT be ACCESS_RESTRICTED');
  assert.equal(resB.screening_status, 'DROP', 'Query B completes screening locally based on evidence');
  assert.ok(!resB.screening_reason.toLowerCase().includes('restricted'), 'Query B must NOT be contaminated by Query A restriction');

  // Query C: UNKNOWN_UI_STATE (0 cards, no restriction text, no login, no captcha)
  const resC = evaluateCandidateScreening(candC, [], {
    accessRestricted: false,
    searchStatus: 'UNKNOWN_UI_STATE'
  });
  assert.equal(resC.screening_status, 'INCONCLUSIVE');
  assert.ok(!resC.screening_reason.toLowerCase().includes('restricted'), 'Query C must NOT be marked restricted');
});

test('TEST 7: Orchestrator invariants: no global restriction leakage, per-query state isolated in topic signals', () => {
  const fs = require('fs');
  const path = require('path');
  const orchCode = fs.readFileSync(path.resolve(__dirname, '../src/modules/tiktok/scan/generalScanOrchestrator.js'), 'utf8');

  // 1. Invariant: isRestrictedOverall must NEVER decide individual candidate status
  assert.ok(!orchCode.includes("isRestrictedOverall ? 'ACCESS_RESTRICTED'"), 'Forbidden pattern: isRestrictedOverall overriding individual status');
  assert.ok(!orchCode.includes('isRestrictedOverall ? "ACCESS_RESTRICTED"'), 'Forbidden pattern: isRestrictedOverall overriding individual status');

  // 2. Invariant: candidate checkStatus must use query-local isRestricted
  assert.ok(orchCode.includes('const checkStatus = (isRestricted ||'), 'Candidate checkStatus must use query-local isRestricted');

  // 3. Invariant: per-query state map exists
  assert.ok(orchCode.includes('searchUiStateByTopic'), 'searchUiStateByTopic Map must be present');

  // 4. Invariant: Track A signals preserve query-local search observations
  const requiredSignalFields = [
    'search_status:',
    'search_restriction_match:',
    'search_video_link_count:',
    'search_inbox_count:',
    'search_login_required:',
    'search_captcha_required:'
  ];
  for (const f of requiredSignalFields) {
    assert.ok(orchCode.includes(f), `Track A signals must preserve ${f}`);
  }

  // 5. Invariant: currentSearchUiState scoped at Track A loop level (not inside else-if block)
  assert.ok(
    orchCode.indexOf('let currentSearchUiState = null;') < orchCode.indexOf('if (typeof existingTopicCollector'),
    'currentSearchUiState must be declared at Track A loop scope before conditional blocks'
  );
});

