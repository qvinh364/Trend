/**
 * TIKTOK TREND REPORT BUILDER TEST SUITE (PHASE 5A.1)
 * 
 * Verifies:
 * 1. Numeric scored trend => rankable = true => in ranked_trends
 * 2. trend_score = null => rankable = false => in needs_more_data => never converted to 0
 * 3. Null source component => marked as missing/source limitation => not declining
 * 4. engagement null => strictly NOT_SCORED_IN_V1 in not_scored_components => not in missing_data
 * 5. previous_score + score_delta preserved faithfully across longitudinal scans
 * 6. Deterministic sorting: primary score DESC, secondary momentum DESC, tertiary topic_id ASC
 * 7. Evidence max 3, deterministic order (published_at prioritized), no invented data
 * 8. Scan #7 current production payload & coverage reconciliation:
 *    - OB55: available (creator_spread, freshness, replication), missing (momentum, cross_surface),
 *      not_scored (engagement), reconciliation (reported 55, derived 55, matches true).
 *    - Samdeal: available (momentum, creator_spread, freshness, replication, cross_surface),
 *      missing (0), not_scored (engagement), reconciliation (reported 95, derived 95, matches true).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  buildTrendReport,
  buildPerTrendModel,
  isTopicRankable,
  evaluateComponentAvailability,
  detectMissingComponents,
  extractRepresentativeEvidence,
  MIN_SCORE_COVERAGE
} = require('../src/modules/tiktok/reporting/trendReportBuilder');

test('TEST 1: Numeric scored trend with sufficient coverage is rankable and in ranked_trends', () => {
  const mockTopic = {
    topic_id: 'hashtag:trend_a',
    title: 'Trend A',
    score: 82,
    previous_score: 75,
    score_delta: 7,
    lifecycle: 'RISING',
    confidence: 'HIGH',
    signals: {
      score_status: 'READY',
      score_coverage: 0.95,
      available_weight: 95,
      momentum_score: 65,
      momentum_status: 'RISING',
      creator_spread_points: 20,
      freshness_points: 15,
      replication_points: 15,
      replication_status: 'CONFIRMED',
      cross_surface_points: 10,
      sample_size: 10,
      unique_creators: 8,
      known_timestamp_count: 8,
      freshness_observation_status: 'AVAILABLE',
      search_status: 'SEARCH_RESULTS_AVAILABLE'
    },
    evidence: []
  };

  assert.equal(isTopicRankable(mockTopic), true);

  const payload = {
    scan_id: 'test_scan_1',
    scan_number: 10,
    scan_kind: 'FULL_SCAN_10',
    scan_time: '2026-09-26T00:00:00.000Z',
    topics: [mockTopic],
    source_runs: []
  };

  const report = buildTrendReport(payload);
  assert.equal(report.ranked_trends.length, 1);
  assert.equal(report.needs_more_data.length, 0);
  assert.equal(report.summary.ranked_trend_count, 1);
  assert.equal(report.summary.top_ranked_topic_id, 'hashtag:trend_a');
  assert.equal(report.ranked_trends[0].trend_score.value, 82);
  assert.equal(report.ranked_trends[0].quality.rankable, true);
  assert.equal(report.ranked_trends[0].quality.coverage_reconciliation.matches, true);
});

test('TEST 2: trend_score = null is rankable=false, in needs_more_data, and NEVER converted to score 0', () => {
  const mockTopic = {
    topic_id: 'hashtag:trend_b',
    title: 'Trend B',
    score: null,
    previous_score: null,
    score_delta: null,
    lifecycle: 'CANDIDATE',
    confidence: 'LOW',
    signals: {
      score_status: 'INSUFFICIENT_DATA',
      score_coverage: 0.55,
      available_weight: 55,
      momentum_score: null,
      momentum_status: 'INSUFFICIENT_DATA',
      creator_spread_points: 20,
      freshness_points: 7,
      replication_points: 15,
      replication_status: 'CONFIRMED',
      sample_size: 12,
      unique_creators: 12,
      known_timestamp_count: 12,
      freshness_observation_status: 'AVAILABLE',
      search_status: 'SEARCH_RESULTS_AVAILABLE'
    },
    evidence: []
  };

  assert.equal(isTopicRankable(mockTopic), false);

  const payload = {
    scan_id: 'test_scan_2',
    scan_number: 11,
    scan_kind: 'FULL_SCAN_11',
    scan_time: '2026-09-26T00:00:00.000Z',
    topics: [mockTopic],
    source_runs: []
  };

  const report = buildTrendReport(payload);
  assert.equal(report.ranked_trends.length, 0);
  assert.equal(report.needs_more_data.length, 1);
  assert.equal(report.summary.ranked_trend_count, 0);
  assert.equal(report.summary.top_ranked_topic_id, null, 'No top ranked topic when 0 rankable trends');

  const item = report.needs_more_data[0];
  assert.equal(item.trend_score.value, null, 'Null score must remain null, never converted to 0');
  assert.notEqual(item.trend_score.value, 0, 'Must NOT be 0');
  assert.equal(item.quality.rankable, false);
  assert.equal(item.quality.classification, 'NEEDS_MORE_DATA');
});

test('TEST 3: Null source component is marked as missing/source limitation, NOT as declining trend', () => {
  const mockTopic = {
    topic_id: 'hashtag:trend_c',
    title: 'Trend C',
    score: null,
    signals: {
      score_status: 'INSUFFICIENT_DATA',
      score_coverage: 0.55,
      available_weight: 55,
      cross_surface_points: null,
      cc_observation_status: 'NOT_OBSERVED_IN_EXPOSED_ROWS',
      momentum_score: null,
      momentum_status: 'INSUFFICIENT_DATA',
      search_status: 'ACCESS_RESTRICTED',
      search_restriction_match: 'Access Denied'
    },
    evidence: []
  };

  const model = buildPerTrendModel(mockTopic, [
    { source: 'creator_search_insights', status: 'UNAVAILABLE_IN_CURRENT_ENVIRONMENT', error: 'Not available' }
  ]);

  // Check missing components
  const crossSurfaceMissing = model.quality.missing_components.find(c => c.component === 'cross_surface');
  assert.ok(crossSurfaceMissing, 'Cross surface must be in missing_components');
  assert.equal(crossSurfaceMissing.reason, 'SOURCE_NOT_OBSERVED');

  // Check source limitations
  const searchLim = model.quality.source_limitations.find(l => l.source === 'tiktok_search_ui');
  assert.ok(searchLim, 'Search UI restriction must be recorded under source_limitations');
  assert.equal(searchLim.limitation, 'ACCESS_RESTRICTED');
});

test('TEST 4: Engagement null is strictly NOT_SCORED_IN_V1 and separated from missing data', () => {
  const mockTopic = {
    topic_id: 'hashtag:trend_d',
    title: 'Trend D',
    score: 70,
    signals: {
      engagement_score: null,
      engagement_status: 'NOT_SCORED_IN_V1'
    }
  };

  const compEval = evaluateComponentAvailability(mockTopic);
  assert.equal(compEval.missing_components.some(c => c.component === 'engagement'), false, 'Engagement must NOT be in missing_components');
  
  const eng = compEval.not_scored_components.find(c => c.component === 'engagement');
  assert.ok(eng, 'Engagement component must be tracked in not_scored_components');
  assert.equal(eng.reason, 'NOT_SCORED_IN_V1');
  assert.equal(eng.weight, 5);
});

test('TEST 5: previous_score and score_delta are preserved faithfully across longitudinal scans', () => {
  const mockTopic = {
    topic_id: 'hashtag:trend_e',
    title: 'Trend E',
    score: 69,
    previous_score: 72,
    score_delta: -3,
    signals: {
      score_status: 'READY',
      score_coverage: 0.95,
      momentum_score: 58,
      momentum_status: 'STABLE_OR_GROWING'
    }
  };

  const model = buildPerTrendModel(mockTopic);
  assert.equal(model.trend_score.value, 69);
  assert.equal(model.trend_score.previous_score, 72);
  assert.equal(model.trend_score.score_delta, -3);
  assert.equal(model.momentum.value, 58);
});

test('TEST 6: Deterministic sorting: primary score DESC, secondary momentum DESC, tertiary topic_id ASC', () => {
  const payload = {
    scan_id: 'sort_scan',
    scan_number: 1,
    topics: [
      {
        topic_id: 'hashtag:topic_c',
        title: 'Topic C',
        score: 75,
        signals: { score_status: 'READY', score_coverage: 0.90, momentum_score: 50 }
      },
      {
        topic_id: 'hashtag:topic_a',
        title: 'Topic A',
        score: 85,
        signals: { score_status: 'READY', score_coverage: 0.90, momentum_score: 40 }
      },
      {
        topic_id: 'hashtag:topic_b2',
        title: 'Topic B2',
        score: 75,
        signals: { score_status: 'READY', score_coverage: 0.90, momentum_score: 60 }
      },
      {
        topic_id: 'hashtag:topic_b1',
        title: 'Topic B1',
        score: 75,
        signals: { score_status: 'READY', score_coverage: 0.90, momentum_score: 60 }
      }
    ]
  };

  const report = buildTrendReport(payload);
  const ids = report.ranked_trends.map(t => t.identity.topic_id);

  assert.deepEqual(ids, [
    'hashtag:topic_a',
    'hashtag:topic_b1',
    'hashtag:topic_b2',
    'hashtag:topic_c'
  ]);
});

test('TEST 7: Evidence selector takes max 3, prioritizes published_at, preserves order, no invented data', () => {
  const mockEvidence = [
    { video_url: 'https://tiktok.com/@u/video/1', creator: '@u1', caption: 'No timestamp video', published_at: null },
    { video_url: 'https://tiktok.com/@u/video/2', creator: '@u2', caption: 'Has timestamp A', published_at: '9-16' },
    { video_url: 'https://tiktok.com/@u/video/3', creator: '@u3', caption: 'Has timestamp B', published_at: '1d ago' },
    { video_url: 'https://tiktok.com/@u/video/4', creator: '@u4', caption: 'Has timestamp C', published_at: '6h ago' },
    { video_url: 'https://tiktok.com/@u/video/5', creator: '@u5', caption: 'Has timestamp D', published_at: '9-20' }
  ];

  const representative = extractRepresentativeEvidence(mockEvidence, 3);
  assert.equal(representative.length, 3, 'Must cap at exactly 3 items');
  assert.equal(representative[0].video_url, 'https://tiktok.com/@u/video/2');
  assert.equal(representative[1].video_url, 'https://tiktok.com/@u/video/3');
  assert.equal(representative[2].video_url, 'https://tiktok.com/@u/video/4');
});

test('TEST 8: Scan #7 current production payload & coverage reconciliation', () => {
  const prodPath = path.resolve(__dirname, '../data/tiktok_results.json');
  assert.ok(fs.existsSync(prodPath), 'data/tiktok_results.json must exist');

  const report = buildTrendReport(prodPath);

  // 1. OB55 Scan #7 assertions
  const ob55 = report.needs_more_data.find(t => t.identity.topic_id === 'hashtag:ob55');
  assert.ok(ob55, 'OB55 must be in needs_more_data');

  const ob55AvailNames = ob55.quality.available_components.map(c => c.component);
  assert.deepEqual(ob55AvailNames.sort(), ['creator_spread', 'freshness', 'replication'].sort());

  const ob55MissingNames = ob55.quality.missing_components.map(c => c.component);
  assert.deepEqual(ob55MissingNames.sort(), ['cross_surface', 'momentum'].sort());

  assert.equal(ob55MissingNames.includes('replication'), false, 'OB55 missing_components must NOT have replication');
  assert.equal(ob55MissingNames.includes('engagement'), false, 'OB55 missing_components must NOT have engagement');

  const ob55NotScoredNames = ob55.quality.not_scored_components.map(c => c.component);
  assert.deepEqual(ob55NotScoredNames, ['engagement']);

  assert.equal(ob55.quality.coverage_reconciliation.reported_available_weight, 55);
  assert.equal(ob55.quality.coverage_reconciliation.derived_available_weight, 55);
  assert.equal(ob55.quality.coverage_reconciliation.matches, true);

  // 2. Samdeal Scan #7 assertions
  const samdeal = report.ranked_trends.find(t => t.identity.topic_id === 'hashtag:samdealruocden');
  assert.ok(samdeal, 'Samdeal must be in ranked_trends');

  const samdealAvailNames = samdeal.quality.available_components.map(c => c.component);
  assert.deepEqual(samdealAvailNames.sort(), ['creator_spread', 'cross_surface', 'freshness', 'momentum', 'replication'].sort());

  assert.equal(samdeal.quality.missing_components.length, 0, 'Samdeal missing_components must be empty');

  const samdealNotScoredNames = samdeal.quality.not_scored_components.map(c => c.component);
  assert.deepEqual(samdealNotScoredNames, ['engagement']);

  assert.equal(samdeal.quality.coverage_reconciliation.reported_available_weight, 95);
  assert.equal(samdeal.quality.coverage_reconciliation.derived_available_weight, 95);
  assert.equal(samdeal.quality.coverage_reconciliation.matches, true);

  // Invariants
  assert.equal(ob55.trend_score.value, null);
  assert.notEqual(ob55.trend_score.value, 0);
  assert.equal(samdeal.trend_score.value, 69);
  assert.equal(samdeal.trend_score.previous_score, 72);
  assert.equal(samdeal.trend_score.score_delta, -3);
  assert.equal(report.summary.top_ranked_topic_id, 'hashtag:samdealruocden');
});
