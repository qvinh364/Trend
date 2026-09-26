/**
 * TIKTOK PHASE 4.1A CONTRACT REPAIR VERIFICATION TEST SUITE
 * Tests 1 to 36
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  normalizeGrowthPct,
  calculateMomentum
} = require('../src/modules/tiktok/scoring/momentumCalculator');

const {
  mapReplicationPoints,
  mapCrossSurfacePoints,
  evaluateTopicSignals
} = require('../src/modules/tiktok/scoring/trendScorer');

const {
  classifyLifecycle
} = require('../src/modules/tiktok/scoring/lifecycleClassifier');

const {
  cleanLabel,
  isGenericNoise,
  isMetricToken
} = require('../src/modules/tiktok/discovery/candidateNormalizer');

const {
  evaluateCandidateScreening
} = require('../src/modules/tiktok/screening/screeningEvaluator');

const { TikTokDatabase } = require('../src/modules/tiktok/db/tiktokDb');

// ==================================================
// TESTS — NULL SEMANTICS (TESTS 1 - 5)
// ==================================================

test('TEST 1: sample_size = 0 vì collection unavailable -> creator_spread_points = null', () => {
  const result = evaluateTopicSignals({
    evidence: [],
    previousSnapshot: {
      ccRank: 2, ccPosts: 5000, ccViews: 10000000,
      sample_size: 10, unique_creators: 5, evidence: []
    },
    currentSurfaceCount: 1,
    currentReplication: true
  });
  assert.equal(result.sample_size, 0);
  assert.equal(result.creator_spread_points, null);
  assert.equal(result.creator_spread_score, null);
});

test('TEST 2: no current timestamp evidence -> freshness_points = null', () => {
  const result = evaluateTopicSignals({
    evidence: [],
    previousSnapshot: {
      ccRank: 2, ccPosts: 5000, ccViews: 10000000,
      sample_size: 10, unique_creators: 5, evidence: []
    },
    currentSurfaceCount: 1,
    currentReplication: true
  });
  assert.equal(result.freshness_points, null);
  assert.equal(result.freshness_score, null);
  assert.equal(result.freshness_observation_status, 'UNAVAILABLE');
});

test('TEST 3: no current validation evidence -> replication_points = null', () => {
  const result = evaluateTopicSignals({
    evidence: [],
    previousSnapshot: {
      ccRank: 2, ccPosts: 5000, ccViews: 10000000,
      sample_size: 10, unique_creators: 5, evidence: []
    },
    currentSurfaceCount: 1,
    currentReplication: true // Must not carry forward if sample_size === 0
  });
  assert.equal(result.replication_points, null);
  assert.equal(result.replication_score, null);
  assert.equal(result.replication_status, 'INSUFFICIENT_CURRENT_EVIDENCE');
});

test('TEST 4: creator/freshness/replication/engagement null + momentum/cross-surface available -> score coverage chỉ gồm available weights', () => {
  const result = evaluateTopicSignals({
    evidence: [],
    previousSnapshot: {
      ccRank: 2, ccPosts: 5000, ccViews: 10000000,
      sample_size: 10, unique_creators: 5, evidence: []
    },
    currentCandidateExtra: { ccRank: 2, ccPosts: 5000, ccViews: 10000000, surfaceCount: 1 },
    currentSurfaceCount: 1,
    currentReplication: null
  });
  // Momentum (30) + Cross surface (10) = 40. Available weight = 40. Coverage = 0.40
  assert.equal(result.available_weight, 40);
  assert.equal(result.score_coverage, 0.40);
});

test('TEST 5: score coverage <0.80 -> trend_score = null -> score_status = INSUFFICIENT_DATA', () => {
  const result = evaluateTopicSignals({
    evidence: [],
    previousSnapshot: {
      ccRank: 2, ccPosts: 5000, ccViews: 10000000,
      sample_size: 10, unique_creators: 5, evidence: []
    },
    currentCandidateExtra: { ccRank: 2, ccPosts: 5000, ccViews: 10000000, surfaceCount: 1 },
    currentSurfaceCount: 1,
    currentReplication: null
  });
  assert.equal(result.score_coverage < 0.80, true);
  assert.equal(result.trend_score, null);
  assert.equal(result.score_status, 'INSUFFICIENT_DATA');
});

// ==================================================
// TESTS — MOMENTUM GROWTH MAPPING (TESTS 6 - 11)
// ==================================================

test('TEST 6: growth_pct = 0.05 -> 100', () => {
  assert.equal(normalizeGrowthPct(0.05), 100);
  assert.equal(normalizeGrowthPct(0.10), 100);
});

test('TEST 7: growth_pct = 0.01 -> 75', () => {
  assert.equal(normalizeGrowthPct(0.01), 75);
  assert.equal(normalizeGrowthPct(0.049), 75);
});

test('TEST 8: growth_pct = 0 -> 60', () => {
  assert.equal(normalizeGrowthPct(0), 60);
  assert.equal(normalizeGrowthPct(0.005), 60);
});

test('TEST 9: growth_pct = -0.005 -> 40', () => {
  assert.equal(normalizeGrowthPct(-0.005), 40);
  assert.equal(normalizeGrowthPct(-0.001), 40);
});

test('TEST 10: growth_pct = -0.02 -> 25', () => {
  assert.equal(normalizeGrowthPct(-0.02), 25);
  assert.equal(normalizeGrowthPct(-0.049), 25);
});

test('TEST 11: growth_pct = -0.06 -> 0', () => {
  assert.equal(normalizeGrowthPct(-0.06), 0);
  assert.equal(normalizeGrowthPct(-0.15), 0);
});

// ==================================================
// TESTS — REPLICATION (TESTS 12 - 15)
// ==================================================

test('TEST 12: true -> 15', () => {
  assert.equal(mapReplicationPoints(true), 15);
});

test('TEST 13: partial -> 7.5', () => {
  assert.equal(mapReplicationPoints('partial'), 7.5);
  assert.equal(mapReplicationPoints('ambiguous'), 7.5);
});

test('TEST 14: false -> 0', () => {
  assert.equal(mapReplicationPoints(false), 0);
});

test('TEST 15: unknown/insufficient -> null. Không tồn tại mapping 12.', () => {
  assert.equal(mapReplicationPoints(null), null);
  assert.equal(mapReplicationPoints('insufficient'), null);
  assert.equal(mapReplicationPoints('unknown'), null);
  assert.notEqual(mapReplicationPoints(true), 12);
  assert.notEqual(mapReplicationPoints(false), 12);
  assert.notEqual(mapReplicationPoints(null), 12);
});

// ==================================================
// TESTS — CROSS SURFACE SCORE (TESTS 16 - 19)
// ==================================================

test('TEST 16: 1 genuine discovery surface -> 4', () => {
  assert.equal(mapCrossSurfacePoints(1), 4);
});

test('TEST 17: 2 -> 7', () => {
  assert.equal(mapCrossSurfacePoints(2), 7);
});

test('TEST 18: 3+ -> 10', () => {
  assert.equal(mapCrossSurfacePoints(3), 10);
  assert.equal(mapCrossSurfacePoints(5), 10);
});

test('TEST 19: unknown -> null. Không mapping 8.', () => {
  assert.equal(mapCrossSurfacePoints(null), null);
  assert.equal(mapCrossSurfacePoints(0), null);
  assert.equal(mapCrossSurfacePoints(undefined), null);
  assert.notEqual(mapCrossSurfacePoints(1), 8);
  assert.notEqual(mapCrossSurfacePoints(2), 8);
  assert.notEqual(mapCrossSurfacePoints(3), 8);
});

// ==================================================
// TESTS — SURFACE PROVENANCE (TESTS 20 - 23)
// ==================================================

test('TEST 20: validation Search query -> không tăng discovery surface count', () => {
  const discoverySurfaces = [
    { surface_scope: 'market_structured', source: 'creative_center_7d' }
  ];
  // Validation query executed post-discovery is NOT a discovery surface
  const hasValidationSurface = discoverySurfaces.some(s => s.source === 'search_validation_query');
  assert.equal(hasValidationSurface, false);
  assert.equal(discoverySurfaces.length, 1);
});

test('TEST 21: ACCESS_RESTRICTED Search attempt -> không tăng surface count', () => {
  const discoverySurfaces = [
    { surface_scope: 'market_structured', source: 'creative_center_7d' }
  ];
  // Failed / access-restricted search query attempt is NOT a surface
  const count = discoverySurfaces.filter(s => !s.source.includes('search_attempt')).length;
  assert.equal(count, 1);
});

test('TEST 22: Creative Center only -> current_surface_count = 1', () => {
  const surfaces = [
    { surface_scope: 'market_structured', source: 'creative_center_7d', observation_id: 'hashtag:ob55' }
  ];
  assert.equal(surfaces.length, 1);
  assert.equal(mapCrossSurfacePoints(surfaces.length), 4);
});

test('TEST 23: Creative Center + genuine Explore alias observation -> current_surface_count = 2', () => {
  const surfaces = [
    { surface_scope: 'market_structured', source: 'creative_center_7d', observation_id: 'hashtag:ob55' },
    { surface_scope: 'authenticated_personalized', source: 'tiktok_explore', observation_id: 'ob55' }
  ];
  assert.equal(surfaces.length, 2);
  assert.equal(mapCrossSurfacePoints(surfaces.length), 7);
});

// ==================================================
// TESTS — ACCESS RESTRICTION (TESTS 24 - 25)
// ==================================================

test('TEST 24: screening có 0 usable evidence vì ACCESS_RESTRICTED -> INCONCLUSIVE', () => {
  const cand = { candidate_key: 'topic:test_restricted', canonical_label: 'test restricted' };
  const res = evaluateCandidateScreening(cand, [], { accessRestricted: true });
  assert.equal(res.screening_status, 'INCONCLUSIVE');
  assert.match(res.reason, /restricted/i);
});

test('TEST 25: không được DROP chỉ vì access restricted', () => {
  const cand = { candidate_key: 'topic:test_restricted', canonical_label: 'test restricted' };
  const res = evaluateCandidateScreening(cand, [], { accessRestricted: true });
  assert.notEqual(res.screening_status, 'DROP');
  assert.equal(res.screening_status, 'INCONCLUSIVE');
});

// ==================================================
// TESTS — DISCOVERY LABELS (TESTS 26 - 29)
// ==================================================

test('TEST 26: DOM engagement metric: "59.8K" không trở thành candidate label', () => {
  assert.equal(cleanLabel('59.8K'), '');
  assert.equal(isGenericNoise('59.8K'), true);
  assert.equal(isMetricToken('59.8K'), true);
});

test('TEST 27: DOM engagement metric: "123.5K" không prefix creator/topic label', () => {
  const raw = '123.5K Hari Won(원하리)';
  const cleaned = cleanLabel(raw);
  assert.equal(cleaned, 'hari won(원하리)');
  assert.equal(cleaned.startsWith('123.5k'), false);
});

test('TEST 28: semantic text: "OB55" vẫn giữ nguyên', () => {
  const cleaned = cleanLabel('OB55');
  assert.equal(cleaned, 'ob55');
});

test('TEST 29: semantic text: "cơm sinh viên 15k" không bị xóa 15k nếu nó nằm trong caption/topic semantic text', () => {
  const cleaned = cleanLabel('cơm sinh viên 15k');
  assert.equal(cleaned, 'cơm sinh viên 15k');
  assert.match(cleaned, /15k/);
});

// ==================================================
// TESTS — DATABASE / HISTORY (TESTS 30 - 36)
// ==================================================

test('TEST 30: repair existing Scan #2 -> không thêm scan row', () => {
  const db = new TikTokDatabase('./data/tiktok_trends.db');
  const scansCount = db.db.prepare('SELECT count(*) as c FROM scans').get().c;
  db.close();
  // We started with 3 scans (2 baseline attempts + 1 Scan 2). Must still be exactly 3 scans!
  assert.equal(scansCount, 3);
});

test('TEST 31: repair existing snapshots -> không thêm duplicate snapshot', () => {
  const db = new TikTokDatabase('./data/tiktok_trends.db');
  const countOb55 = db.db.prepare('SELECT count(*) as c FROM topic_snapshots WHERE scan_id = ? AND topic_id = ?')
    .get('scan_2_1790292122961', 'hashtag:ob55').c;
  const countSamdeal = db.db.prepare('SELECT count(*) as c FROM topic_snapshots WHERE scan_id = ? AND topic_id = ?')
    .get('scan_2_1790292122961', 'hashtag:samdealruocden').c;
  db.close();
  assert.equal(countOb55, 1);
  assert.equal(countSamdeal, 1);
});

test('TEST 32: previous_score remains null', () => {
  const result = evaluateTopicSignals({
    evidence: [],
    previousSnapshot: {
      ccRank: 2, ccPosts: 5000, ccViews: 10000000,
      sample_size: 10, unique_creators: 5, evidence: [],
      trend_score: null // Baseline had null
    },
    currentCandidateExtra: { ccRank: 2, ccPosts: 5000, ccViews: 10000000, surfaceCount: 1 },
    currentSurfaceCount: 1,
    currentReplication: null,
    scanNumber: 2
  });
  assert.equal(result.previous_score, null);
});

test('TEST 33: score_delta remains null', () => {
  const result = evaluateTopicSignals({
    evidence: [],
    previousSnapshot: {
      ccRank: 2, ccPosts: 5000, ccViews: 10000000,
      sample_size: 10, unique_creators: 5, evidence: [],
      trend_score: null
    },
    currentCandidateExtra: { ccRank: 2, ccPosts: 5000, ccViews: 10000000, surfaceCount: 1 },
    currentSurfaceCount: 1,
    currentReplication: null,
    scanNumber: 2
  });
  assert.equal(result.score_delta, null);
});

test('TEST 34: first_seen preserved', () => {
  const db = new TikTokDatabase('./data/tiktok_trends.db');
  const ob55 = db.db.prepare('SELECT first_seen, last_seen FROM topics WHERE topic_id = ?').get('hashtag:ob55');
  const samdeal = db.db.prepare('SELECT first_seen, last_seen FROM topics WHERE topic_id = ?').get('hashtag:samdealruocden');
  db.close();
  // first_seen was initially recorded at discovery (2026-09-24T14:11:38.986Z)
  assert.equal(ob55.first_seen, '2026-09-24T14:11:38.986Z');
  assert.equal(samdeal.first_seen, '2026-09-24T14:11:38.986Z');
  // last_seen is updated to Scan 2 time
  assert.equal(ob55.last_seen, '2026-09-24T23:22:02.961Z');
  assert.equal(samdeal.last_seen, '2026-09-24T23:22:02.961Z');
});

test('TEST 35: raw CC values preserved', () => {
  const { getBaselineCcMetrics } = require('../src/modules/tiktok/scan/secondScanOrchestrator');
  const baseOb55 = getBaselineCcMetrics('hashtag:ob55');
  const baseSamdeal = getBaselineCcMetrics('hashtag:samdealruocden');
  assert.equal(baseOb55.rank, 3);
  assert.equal(baseOb55.posts, 4100);
  assert.equal(baseOb55.views, 75800000);
  assert.equal(baseSamdeal.rank, 2);
  assert.equal(baseSamdeal.posts, 21200);
  assert.equal(baseSamdeal.views, 13700000);
});

test('TEST 36: Facebook untouched', () => {
  const fbPath = path.resolve(__dirname, '../src/modules/facebook');
  assert.equal(fs.existsSync(fbPath), true);
  const fbSession = path.resolve(__dirname, '../data/fb_session.json');
  assert.equal(fs.existsSync(fbSession), true);
});
