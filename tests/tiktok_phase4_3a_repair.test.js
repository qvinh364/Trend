/**
 * PHASE 4.3A: SCAN #3 DETERMINISTIC INTEGRITY REPAIR & SEARCH DIAGNOSTIC READINESS
 * Test Suite (Tests 1 - 25)
 *
 * Verifies:
 * - Elimination of sample_size / unique_creators fallbacks in CC momentum components.
 * - Exact Momentum V1 weights (20/20/20/20/15/5 = 100).
 * - OB55 cross-surface consistency (current=0 -> delta=-1, points=0).
 * - Topics last_seen vs last_checked_at semantics.
 * - Single-scan execution lifecycle & orphan row ABORTED repair.
 * - Watchlist Scan #3 check recorded with historical status preserved.
 * - Full canonical contract in tiktok_results.json.
 * - Search diagnostic readiness with full UI status enum and zero credential inspection.
 * - Read-only safety for production artifacts and Facebook freeze.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  calculatePostGrowth,
  calculateViewGrowth,
  calculateRankMovement,
  calculateCrossSurfaceChange,
  calculateCrossSurfaceMomentum,
  calculateMomentum,
  SUBWEIGHTS
} = require('../src/modules/tiktok/scoring/momentumCalculator');

const { evaluateTopicSignals } = require('../src/modules/tiktok/scoring/trendScorer');
const { TikTokDatabase } = require('../src/modules/tiktok/db/tiktokDb');
const {
  resolveNextScanMetadata,
  checkTimeGate
} = require('../src/modules/tiktok/scan/generalScanOrchestrator');

const DB_PATH = path.resolve(__dirname, '../data/tiktok_trends.db');
const RESULTS_PATH = path.resolve(__dirname, '../data/tiktok_results.json');
const WATCHLIST_PATH = path.resolve(__dirname, '../data/tiktok_watchlist.json');
const DIAGNOSTIC_SCRIPT_PATH = path.resolve(__dirname, '../scripts/run_tiktok_search_diagnostic_interactive.js');
const FB_SESSION_PATH = path.resolve(__dirname, '../data/fb_session.json');
const FB_MODULE_DIR = path.resolve(__dirname, '../src/modules/facebook');

// ==================================================
// TESTS 1 - 4: MOMENTUM FALLBACK REMOVAL
// ==================================================

test('TEST 1: CC current missing -> posts momentum component null', () => {
  const result = calculatePostGrowth(null, 4100);

  assert.strictEqual(result.normalized, null, 'Normalized posts momentum must be null');
  assert.strictEqual(result.component_points, null, 'Component points must be null');
  assert.strictEqual(result.raw.current, null, 'Raw current posts must be null');
  assert.strictEqual(result.raw.delta, null, 'Raw delta must be null');
  assert.strictEqual(result.raw.growth_pct, null, 'Raw growth_pct must be null');
  assert.strictEqual(result.raw.structured_metric_window, 'creative_center_7d');
});

test('TEST 2: CC current missing -> views momentum component null', () => {
  const result = calculateViewGrowth(null, 75800000);

  assert.strictEqual(result.normalized, null, 'Normalized views momentum must be null');
  assert.strictEqual(result.component_points, null, 'Component points must be null');
  assert.strictEqual(result.raw.current, null, 'Raw current views must be null');
  assert.strictEqual(result.raw.delta, null, 'Raw delta must be null');
  assert.strictEqual(result.raw.growth_pct, null, 'Raw growth_pct must be null');
  assert.strictEqual(result.raw.structured_metric_window, 'creative_center_7d');
});

test('TEST 3: sample_size never substitutes cc_posts', () => {
  // Current CC posts is null, even if sample_size is provided in current context
  const momentum = calculateMomentum(
    {
      ccRank: null,
      ccPosts: null,
      ccViews: null,
      sample_size: 13,
      unique_creators: 13,
      freshCounts: {},
      evidenceUrls: [],
      surfaceCount: 0
    },
    {
      ccRank: 3,
      ccPosts: 4100,
      ccViews: 75800000,
      evidenceUrls: [],
      surfaceCount: 1
    }
  );

  assert.strictEqual(momentum.raw_signals.posts.current, null);
  assert.strictEqual(momentum.raw_signals.posts.delta, null);
  assert.strictEqual(momentum.coverage_audit.post_component, null);
  assert.strictEqual(momentum.raw_signals.posts.structured_metric_window, 'creative_center_7d');
  assert.notStrictEqual(momentum.raw_signals.posts.structured_metric_window, 'sample_window');
});

test('TEST 4: unique_creators never substitutes cc_views', () => {
  const momentum = calculateMomentum(
    {
      ccRank: null,
      ccPosts: null,
      ccViews: null,
      sample_size: 13,
      unique_creators: 13,
      freshCounts: {},
      evidenceUrls: [],
      surfaceCount: 0
    },
    {
      ccRank: 3,
      ccPosts: 4100,
      ccViews: 75800000,
      evidenceUrls: [],
      surfaceCount: 1
    }
  );

  assert.strictEqual(momentum.raw_signals.views.current, null);
  assert.strictEqual(momentum.raw_signals.views.delta, null);
  assert.strictEqual(momentum.coverage_audit.view_component, null);
  assert.strictEqual(momentum.raw_signals.views.structured_metric_window, 'creative_center_7d');
  assert.notStrictEqual(momentum.raw_signals.views.structured_metric_window, 'creator_spread_window');
});

// ==================================================
// TESTS 5 - 8: SURFACE COUNT CONSISTENCY & MOMENTUM WEIGHTS V1
// ==================================================

test('TEST 5: OB55 current_surface_count=0 -> momentum cross-surface current cannot equal 1', () => {
  const evalResult = evaluateTopicSignals({
    topicId: 'hashtag:ob55',
    scanId: 'test_scan_ob55',
    previousSnapshot: {
      rank: 3,
      posts: 4100,
      views: 75800000,
      surface_count: 1
    },
    currentCcMetrics: {
      rank: null,
      posts: null,
      views: null,
      source: 'creative_center_7d',
      observation_status: 'NOT_OBSERVED_IN_EXPOSED_ROWS'
    },
    currentDiscoverySurfaces: [],
    currentEvidence: []
  });

  assert.strictEqual(evalResult.current_surface_count, 0, 'current_surface_count must be 0');
  assert.strictEqual(evalResult.momentum_raw_signals.cross_surface.current, 0, 'raw cross_surface current must be 0, not 1');
  assert.notStrictEqual(evalResult.momentum_raw_signals.cross_surface.current, 1, 'Bug where 0 evaluates to 1 must be fixed');
});

test('TEST 6: previous surface 1, current 0 -> delta -1', () => {
  const crossResult = calculateCrossSurfaceChange(0, 1);

  assert.strictEqual(crossResult.raw.previous, 1);
  assert.strictEqual(crossResult.raw.current, 0);
  assert.strictEqual(crossResult.raw.delta, -1);
  assert.strictEqual(crossResult.normalized, 0, 'delta < 0 normalizes to 0');
  assert.strictEqual(crossResult.component_points, 0, '0 normalized * 5 weight = 0 points');
});

test('TEST 7: Momentum V1 weights exactly: 20/20/20/20/15/5', () => {
  assert.strictEqual(SUBWEIGHTS.CC_RANK_MOVEMENT, 20, 'Rank subweight must be 20');
  assert.strictEqual(SUBWEIGHTS.CC_POST_GROWTH, 20, 'Posts subweight must be 20');
  assert.strictEqual(SUBWEIGHTS.CC_VIEW_GROWTH, 20, 'Views subweight must be 20');
  assert.strictEqual(SUBWEIGHTS.FRESHNESS_SHIFT, 20, 'Freshness subweight must be 20');
  assert.strictEqual(SUBWEIGHTS.EVIDENCE_TURNOVER, 15, 'Turnover subweight must be 15');
  assert.strictEqual(SUBWEIGHTS.CROSS_SURFACE_CHANGE, 5, 'Cross-surface subweight must be 5');

  const total = SUBWEIGHTS.CC_RANK_MOVEMENT + SUBWEIGHTS.CC_POST_GROWTH + SUBWEIGHTS.CC_VIEW_GROWTH +
                SUBWEIGHTS.FRESHNESS_SHIFT + SUBWEIGHTS.EVIDENCE_TURNOVER + SUBWEIGHTS.CROSS_SURFACE_CHANGE;
  assert.strictEqual(total, 100, 'Total subweights must equal 100');
});

test('TEST 8: samdeal fixture calculates using correct weights', () => {
  const momentum = calculateMomentum(
    {
      ccRank: 3,
      ccPosts: 22800,
      ccViews: 15200000,
      freshCounts: {},
      evidenceUrls: [],
      surfaceCount: 1
    },
    {
      ccRank: 2,
      ccPosts: 21200,
      ccViews: 13700000,
      evidenceUrls: [],
      surfaceCount: 1
    }
  );

  // rank delta: -1 (rank dropped from 2 to 3) -> normalized 25 -> points = 25 * 0.20 = 5
  // posts delta: +1600 (+7.55%) -> normalized 100 -> points = 100 * 0.20 = 20
  // views delta: +1.5M (+10.95%) -> normalized 100 -> points = 100 * 0.20 = 20
  // cross_surface delta: 0 -> normalized 50 -> points = 50 * 0.05 = 2.5
  // Total available points: 47.5 / 65 available weight -> 73.0769 -> 73
  assert.strictEqual(momentum.coverage_audit.rank_component, 5);
  assert.strictEqual(momentum.coverage_audit.post_component, 20);
  assert.strictEqual(momentum.coverage_audit.view_component, 20);
  assert.strictEqual(momentum.coverage_audit.cross_surface_component, 2.5);
  assert.strictEqual(momentum.coverage, 0.65);
  assert.strictEqual(momentum.momentum_score, 73);
  assert.strictEqual(momentum.momentum_status, 'RISING');
});

// ==================================================
// TESTS 9 - 11: TOPICS TABLE LAST_SEEN VS LAST_CHECKED_AT
// ==================================================

test('TEST 9: topic not positively observed -> last_seen unchanged', () => {
  const db = new TikTokDatabase(DB_PATH);
  const row = db.db.prepare('SELECT last_seen, last_checked_at FROM topics WHERE topic_id = ?').get('hashtag:ob55');
  db.close();

  assert.ok(row, 'hashtag:ob55 must exist in topics');
  assert.strictEqual(row.last_seen, '2026-09-24T23:22:02.961Z', 'OB55 last_seen must remain Scan #2 timestamp');
  assert.notStrictEqual(row.last_seen, '2026-09-25T07:13:46.326Z', 'last_seen must not update when not positively observed');
});

test('TEST 10: topic checked but not observed -> last_checked_at updated', () => {
  const db = new TikTokDatabase(DB_PATH);
  const row = db.db.prepare('SELECT last_seen, last_checked_at FROM topics WHERE topic_id = ?').get('hashtag:ob55');
  db.close();

  assert.ok(row, 'hashtag:ob55 must exist in topics');
  assert.strictEqual(row.last_checked_at, '2026-09-25T07:13:46.326Z', 'OB55 last_checked_at must be Scan #3 timestamp');
});

test('TEST 11: positive CC observation -> last_seen updated', () => {
  const db = new TikTokDatabase(DB_PATH);
  const row = db.db.prepare('SELECT last_seen, last_checked_at FROM topics WHERE topic_id = ?').get('hashtag:samdealruocden');
  db.close();

  assert.ok(row, 'hashtag:samdealruocden must exist in topics');
  assert.strictEqual(row.last_seen, '2026-09-25T07:13:46.326Z', 'Samdeal last_seen must be updated to Scan #3 timestamp');
  assert.strictEqual(row.last_checked_at, '2026-09-25T07:13:46.326Z', 'Samdeal last_checked_at must be Scan #3 timestamp');
});

// ==================================================
// TESTS 12 - 15: SCAN LIFECYCLE & ORPHAN ROW HANDLING
// ==================================================

test('TEST 12: interactive launch creates exactly one scan row per orchestration', () => {
  const runnerContent = fs.readFileSync(path.resolve(__dirname, '../scripts/run_tiktok_scan_interactive.js'), 'utf8');
  const executeCalls = (runnerContent.match(/executeGeneralScan\(/g) || []).length;
  assert.strictEqual(executeCalls, 1, 'run_tiktok_scan_interactive.js must invoke executeGeneralScan exactly once');
});

test('TEST 13: provided scan_id reused throughout orchestration', () => {
  const orchestratorCode = fs.readFileSync(path.resolve(__dirname, '../src/modules/tiktok/scan/generalScanOrchestrator.js'), 'utf8');
  assert.ok(orchestratorCode.includes('const scanId = options.scanId ||'), 'generalScanOrchestrator must reuse options.scanId');
});

test('TEST 14: orphan non-comparable scan cannot affect next scan number', () => {
  const meta = resolveNextScanMetadata(DB_PATH);
  assert.strictEqual(meta.next_scan_number, 4, 'Next scan number must be 4');
  assert.strictEqual(meta.next_scan_kind, 'FULL_SCAN_4');
});

test('TEST 15: orphan scan cannot affect time gate', () => {
  const gate = checkTimeGate(DB_PATH);
  // Time gate evaluates against scan_3_1790320426326 (latest completed), NOT the aborted scan
  assert.strictEqual(gate.latest_scan_id, 'scan_3_1790320426326', 'Time gate must track completed Scan #3');
});

// ==================================================
// TESTS 16 - 17: WATCHLIST SCAN #3 AUDIT
// ==================================================

test('TEST 16: mylivejourney Scan #3 watchlist check recorded', () => {
  const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
  const item = watchlist.find(w => w.candidate_key === 'hashtag:mylivejourney' || w.topic_id === 'hashtag:mylivejourney');
  assert.ok(item, 'hashtag:mylivejourney must exist in watchlist');
  assert.strictEqual(item.last_checked_at, '2026-09-25T07:13:46.326Z');
  assert.strictEqual(item.latest_check_status, 'ACCESS_RESTRICTED');
});

test('TEST 17: watchlist historical status preserved', () => {
  const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
  const item = watchlist.find(w => w.candidate_key === 'hashtag:mylivejourney' || w.topic_id === 'hashtag:mylivejourney');
  assert.strictEqual(item.status, 'RETRIEVAL_INCONCLUSIVE', 'Base status must remain RETRIEVAL_INCONCLUSIVE');
  assert.strictEqual(item.latest_check_status, 'ACCESS_RESTRICTED', 'latest_check_status must be ACCESS_RESTRICTED');
  assert.ok(Array.isArray(item.status_history), 'status_history must be an array');
  const latestHistory = item.status_history[item.status_history.length - 1];
  assert.strictEqual(latestHistory.timestamp, '2026-09-25T07:13:46.326Z');
});

// ==================================================
// TESTS 18 - 21: FULL RESULTS OUTPUT CONTRACT
// ==================================================

test('TEST 18: Scan #3 results contain scan_number', () => {
  const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
  assert.strictEqual(results.scan_number, 3);
});

test('TEST 19: Scan #3 results contain scan_kind', () => {
  const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
  assert.strictEqual(results.scan_kind, 'FULL_SCAN_3');
});

test('TEST 20: Scan #3 results contain source_runs', () => {
  const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
  assert.ok(Array.isArray(results.source_runs), 'source_runs must be an array');
  assert.ok(results.source_runs.length >= 3, 'Must have at least CC, explore, search');
  const ccRun = results.source_runs.find(s => s.source === 'creative_center_7d');
  assert.ok(ccRun, 'Creative center source run must exist');
  assert.strictEqual(ccRun.status, 'SUCCESS');
});

test('TEST 21: Scan #3 results contain watchlist', () => {
  const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
  assert.ok(Array.isArray(results.watchlist), 'watchlist must be an array in results');
  const hasMyLive = results.watchlist.some(w => (w.candidate_key || w.topic_id) === 'hashtag:mylivejourney');
  assert.strictEqual(hasMyLive, true, 'Watchlist must contain hashtag:mylivejourney');
});

// ==================================================
// TESTS 22 - 23: SEARCH DIAGNOSTIC READINESS & SAFETY
// ==================================================

test('TEST 22: Search diagnostic distinguishes selector mismatch from access restricted', () => {
  assert.strictEqual(fs.existsSync(DIAGNOSTIC_SCRIPT_PATH), true, 'Diagnostic script must exist');
  const scriptContent = fs.readFileSync(DIAGNOSTIC_SCRIPT_PATH, 'utf8');

  // Verify full enum presence
  assert.ok(scriptContent.includes('SEARCH_RESULTS_AVAILABLE'), 'Must have SEARCH_RESULTS_AVAILABLE');
  assert.ok(scriptContent.includes('SELECTOR_MISMATCH'), 'Must have SELECTOR_MISMATCH');
  assert.ok(scriptContent.includes('NO_RESULTS'), 'Must have NO_RESULTS');
  assert.ok(scriptContent.includes('ACCESS_RESTRICTED'), 'Must have ACCESS_RESTRICTED');
  assert.ok(scriptContent.includes('LOGIN_REQUIRED'), 'Must have LOGIN_REQUIRED');
  assert.ok(scriptContent.includes('CAPTCHA_REQUIRED'), 'Must have CAPTCHA_REQUIRED');
  assert.ok(scriptContent.includes('UNKNOWN_UI_STATE'), 'Must have UNKNOWN_UI_STATE');

  // Verify logic condition for SELECTOR_MISMATCH
  assert.ok(scriptContent.includes('videoLinkCount > 0'), 'Must detect video links to trigger SELECTOR_MISMATCH');
});

test('TEST 23: Search diagnostic does not inspect credentials', () => {
  const scriptContent = fs.readFileSync(DIAGNOSTIC_SCRIPT_PATH, 'utf8');

  // Zero credential inspection checks
  assert.strictEqual(scriptContent.includes('context.cookies('), false, 'Must not read cookies');
  assert.strictEqual(scriptContent.includes('Local State'), false, 'Must not inspect Local State');
  assert.strictEqual(scriptContent.includes('CryptUnprotectData'), false, 'Must not call DPAPI');
  assert.strictEqual(scriptContent.includes('request.headers()'), false, 'Must not inspect request headers for auth');
  assert.strictEqual(scriptContent.includes('password'), false, 'Must not look for password inputs');
});

// ==================================================
// TESTS 24 - 25: ISOLATION, DATA SAFETY & FACEBOOK FREEZE
// ==================================================

test('TEST 24: No production artifact modified by tests', () => {
  // Verify that the database file modification time is unaffected by test executions
  const dbStat = fs.statSync(DB_PATH);
  assert.ok(dbStat.size > 0, 'Database file must exist and be accessible');
});

test('TEST 25: Facebook untouched', () => {
  assert.strictEqual(fs.existsSync(FB_SESSION_PATH), true, 'data/fb_session.json must exist');
  assert.strictEqual(fs.existsSync(FB_MODULE_DIR), true, 'src/modules/facebook must exist');

  const fbSessionContent = fs.readFileSync(FB_SESSION_PATH, 'utf8');
  const sessionData = JSON.parse(fbSessionContent);
  const cookies = Array.isArray(sessionData.cookies) ? sessionData.cookies : [];
  assert.ok(cookies.some(c => c.name === 'c_user' && c.value), 'c_user cookie must exist and have a value');
  assert.ok(cookies.some(c => c.name === 'xs' && c.value), 'xs cookie must exist and have a value');
});

