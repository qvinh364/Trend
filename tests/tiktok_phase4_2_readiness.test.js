/**
 * TIKTOK PHASE 4.2 - DATA HYGIENE + SCAN #3 READINESS TEST SUITE
 * Tests 1 to 20
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  cleanWatchlist,
  evaluateWatchlistHygiene
} = require('../src/modules/tiktok/watchlist/watchlistManager');

const {
  cleanLabel,
  isMetricToken
} = require('../src/modules/tiktok/discovery/candidateNormalizer');

const { TikTokDatabase } = require('../src/modules/tiktok/db/tiktokDb');

const {
  checkGenericTimeGate,
  resolveNextScanMetadata,
  resolvePreviousScoreAndDelta,
  executeGeneralScan
} = require('../src/modules/tiktok/scan/generalScanOrchestrator');

const {
  validateScanPayload
} = require('../src/modules/tiktok/schema/outputContract');

// ==================================================
// PART A — WATCHLIST HYGIENE (TESTS 1 - 6)
// ==================================================

test('TEST 1: metric-only Explore candidate removed from active watchlist', () => {
  const rawList = [
    { candidate_key: 'topic:59.8k', canonical_label: '59.8k' }
  ];
  const { activeWatchlist, removedNoise } = cleanWatchlist(rawList);
  assert.equal(activeWatchlist.length, 0);
  assert.equal(removedNoise.length, 1);
  assert.equal(removedNoise[0].candidate_key, 'topic:59.8k');
  assert.equal(removedNoise[0].status, 'REMOVED_NOISE');
});

test('TEST 2: "59.8k vũ trụ ai" + "vũ trụ ai" merge deterministically if metric provenance confirms prefix', () => {
  const rawList = [
    { candidate_key: 'topic:59.8k vũ trụ ai', canonical_label: '59.8k vũ trụ ai', reason: 'Explore signal' },
    { candidate_key: 'topic:vũ trụ ai', canonical_label: 'vũ trụ ai', reason: 'Search signal' }
  ];
  const { activeWatchlist, mergedCount } = cleanWatchlist(rawList);
  assert.equal(activeWatchlist.length, 1);
  assert.equal(mergedCount, 1);
  assert.equal(activeWatchlist[0].candidate_key, 'topic:vũ trụ ai');
  assert.equal(activeWatchlist[0].canonical_label, 'vũ trụ ai');
  assert.equal(activeWatchlist[0].aliases.includes('59.8k vũ trụ ai'), true);
  assert.equal(activeWatchlist[0].aliases.includes('vũ trụ ai'), true);
});

test('TEST 3: "OB55" remains OB55', () => {
  const cleaned = cleanLabel('OB55');
  assert.equal(cleaned, 'ob55');
  assert.equal(isMetricToken('OB55'), false);
});

test('TEST 4: "cơm sinh viên 15k" preserves 15k semantic text', () => {
  const cleaned = cleanLabel('cơm sinh viên 15k');
  assert.equal(cleaned, 'cơm sinh viên 15k');
  assert.equal(isMetricToken('cơm sinh viên 15k'), false);
});

test('TEST 5: mylivejourney preserves RETRIEVAL_INCONCLUSIVE history', () => {
  const rawList = [
    {
      candidate_key: 'hashtag:mylivejourney',
      canonical_label: 'mylivejourney',
      status: 'INCONCLUSIVE', // Even if overwritten by Scan 2
      reason: 'Screening could not collect sufficient evidence'
    }
  ];
  const { activeWatchlist } = cleanWatchlist(rawList);
  assert.equal(activeWatchlist.length, 1);
  assert.equal(activeWatchlist[0].candidate_key, 'hashtag:mylivejourney');
  assert.equal(activeWatchlist[0].status, 'RETRIEVAL_INCONCLUSIVE');
});

test('TEST 6: latest ACCESS_RESTRICTED attempt stored without erasing prior status history', () => {
  const rawList = [
    {
      candidate_key: 'hashtag:mylivejourney',
      canonical_label: 'mylivejourney',
      status: 'RETRIEVAL_INCONCLUSIVE',
      reason: 'Screening could not collect sufficient evidence because TikTok Search access was restricted.'
    }
  ];
  const { activeWatchlist } = cleanWatchlist(rawList);
  assert.equal(activeWatchlist[0].latest_check_status, 'ACCESS_RESTRICTED');
  assert.equal(Array.isArray(activeWatchlist[0].status_history), true);
  assert.equal(activeWatchlist[0].status_history.length >= 2, true);
  const hasRetrievalInconclusive = activeWatchlist[0].status_history.some(h => h.status === 'RETRIEVAL_INCONCLUSIVE');
  const hasAccessRestricted = activeWatchlist[0].status_history.some(h => h.status === 'ACCESS_RESTRICTED');
  assert.equal(hasRetrievalInconclusive, true);
  assert.equal(hasAccessRestricted, true);
});

// ==================================================
// PART B & C — DATABASE HISTORY & SNAPSHOT CHAIN (TESTS 7 - 9)
// ==================================================

test('TEST 7: all scan rows classified for audit', () => {
  const db = new TikTokDatabase('./data/tiktok_trends.db');
  const classified = db.classifyScans();
  db.close();

  assert.equal(classified.length, 3);
  const baseline = classified.find(s => s.scan_id === 'valid_1790284478478');
  const scan2 = classified.find(s => s.scan_id === 'scan_2_1790292122961');
  const testArtifact = classified.find(s => s.scan_id === 'valid_1790284351929');

  assert.equal(baseline.classification, 'PRODUCTION_BASELINE');
  assert.equal(baseline.used_for_comparable_history, true);

  assert.equal(scan2.classification, 'PRODUCTION_SECOND_SCAN');
  assert.equal(scan2.used_for_comparable_history, true);

  assert.equal(testArtifact.classification, 'TEST_ARTIFACT');
  assert.equal(testArtifact.used_for_comparable_history, false);
});

test('TEST 8: test/unrelated scan row cannot become comparable previous snapshot', () => {
  const db = new TikTokDatabase('./data/tiktok_trends.db');
  const resolved = db.resolveBaselineScan();
  db.close();

  assert.notEqual(resolved.scan_id, 'valid_1790284351929');
  assert.equal(resolved.scan_id, 'valid_1790284478478');
});

test('TEST 9: snapshot chain ordered correctly', () => {
  const db = new TikTokDatabase('./data/tiktok_trends.db');
  const chainOb55 = db.getOrderedTopicSnapshots('hashtag:ob55');
  const chainSamdeal = db.getOrderedTopicSnapshots('hashtag:samdealruocden');
  db.close();

  assert.equal(chainOb55.length, 2);
  assert.equal(chainOb55[0].scan_id, 'valid_1790284478478');
  assert.equal(chainOb55[1].scan_id, 'scan_2_1790292122961');

  assert.equal(chainSamdeal.length, 2);
  assert.equal(chainSamdeal[0].scan_id, 'valid_1790284478478');
  assert.equal(chainSamdeal[1].scan_id, 'scan_2_1790292122961');
});

// ==================================================
// PART D — EXECUTION MODES & ORCHESTRATOR (TESTS 10 - 12)
// ==================================================

test('TEST 10: interactive runner imports same production orchestrator, not copied business logic', () => {
  const scriptContent = fs.readFileSync(path.resolve(__dirname, '../scripts/run_tiktok_scan_interactive.js'), 'utf8');
  assert.equal(scriptContent.includes("require('../src/modules/tiktok/scan/generalScanOrchestrator')"), true);
  assert.equal(scriptContent.includes('executeGeneralScan'), true);
});

test('TEST 11: interactive mode sets: browser_execution_mode = INTERACTIVE_DESKTOP', async () => {
  const memDb = new TikTokDatabase(':memory:');
  const res = await executeGeneralScan({
    executionMode: 'INTERACTIVE_DESKTOP',
    dbPath: memDb.dbPath,
    skipTimeGateCheck: true,
    discoveryCollector: async () => [],
    existingTopicCollector: async () => ({ evidence: [], extra: {} })
  });
  assert.equal(res.browser_execution_mode, 'INTERACTIVE_DESKTOP');
  assert.equal(res.payload.browser_execution_mode, 'INTERACTIVE_DESKTOP');
  memDb.close();
});

test('TEST 12: headless mode sets: HEADLESS_AUTOMATED', async () => {
  const memDb = new TikTokDatabase(':memory:');
  const res = await executeGeneralScan({
    executionMode: 'HEADLESS_AUTOMATED',
    dbPath: memDb.dbPath,
    skipTimeGateCheck: true,
    discoveryCollector: async () => [],
    existingTopicCollector: async () => ({ evidence: [], extra: {} })
  });
  assert.equal(res.browser_execution_mode, 'HEADLESS_AUTOMATED');
  assert.equal(res.payload.browser_execution_mode, 'HEADLESS_AUTOMATED');
  memDb.close();
});

// ==================================================
// PART E & F — TIME GATE & NUMBERING (TESTS 13 - 14)
// ==================================================

test('TEST 13: time gate works for generic next scan, not only Scan #2', () => {
  // Use real DB where latest scan is Scan #2 at 2026-09-24T23:22:02.961Z
  // 1 hour after Scan 2 -> not eligible
  const ref1h = new Date(new Date('2026-09-24T23:22:02.961Z').getTime() + 1 * 3600 * 1000);
  const gate1 = checkGenericTimeGate('./data/tiktok_trends.db', 2 * 3600 * 1000, ref1h);
  assert.equal(gate1.eligible, false);
  assert.equal(gate1.status, 'SCAN_NOT_YET_ELIGIBLE');

  // 3 hours after Scan 2 -> eligible
  const ref3h = new Date(new Date('2026-09-24T23:22:02.961Z').getTime() + 3 * 3600 * 1000);
  const gate2 = checkGenericTimeGate('./data/tiktok_trends.db', 2 * 3600 * 1000, ref3h);
  assert.equal(gate2.eligible, true);
  assert.equal(gate2.status, 'ELIGIBLE_FOR_SCAN');
});

test('TEST 14: time gate uses live scan timestamp, not calculation_repaired_at', () => {
  const gate = checkGenericTimeGate('./data/tiktok_trends.db', 2 * 3600 * 1000, new Date());
  // Latest scan timestamp should be the exact live scan_time
  assert.equal(gate.latest_scan_time, '2026-09-24T23:22:02.961Z');
});

// ==================================================
// PART E — PREVIOUS SCORE RULE & HISTORY (TESTS 15 - 17)
// ==================================================

test('TEST 15: Scan1 null + Scan2 null + Scan3 70 -> previous_score null -> score_delta null', () => {
  const memDb = new TikTokDatabase(':memory:');
  memDb.createScan('scan_1', '2026-09-24T20:00:00.000Z', '', 'BASELINE_SCAN', 1);
  memDb.upsertTopic({ topic_id: 'topic:test', canonical_title: 'Test', scan_time: '2026-09-24T20:00:00.000Z' });
  memDb.saveTopicSnapshot({
    topic_id: 'topic:test', scan_id: 'scan_1', scan_time: '2026-09-24T20:00:00.000Z',
    evaluation: { sample_size: 10, unique_creators: 5, fresh_0_24h: 0, fresh_24_72h: 0, fresh_3_7d: 0, older_7d: 0, momentum_status: 'UNKNOWN', trend_score: null }
  });

  memDb.createScan('scan_2', '2026-09-24T22:00:00.000Z', '', 'SECOND_FULL_SCAN', 2);
  memDb.saveTopicSnapshot({
    topic_id: 'topic:test', scan_id: 'scan_2', scan_time: '2026-09-24T22:00:00.000Z',
    evaluation: { sample_size: 0, unique_creators: 0, fresh_0_24h: 0, fresh_24_72h: 0, fresh_3_7d: 0, older_7d: 0, momentum_status: 'STABLE_OR_GROWING', trend_score: null }
  });

  // Scan 3 evaluates topic:test with currentTrendScore = 70
  const scan3Time = '2026-09-25T00:30:00.000Z';
  const scoreResult = resolvePreviousScoreAndDelta('topic:test', scan3Time, 70, memDb);

  assert.equal(scoreResult.previous_score, null);
  assert.equal(scoreResult.score_delta, null);
  memDb.close();
});

test('TEST 16: Scan2 60 + Scan3 70 -> previous_score 60 -> score_delta 10', () => {
  const memDb = new TikTokDatabase(':memory:');
  memDb.createScan('scan_2', '2026-09-24T22:00:00.000Z', '', 'SECOND_FULL_SCAN', 2);
  memDb.upsertTopic({ topic_id: 'topic:test', canonical_title: 'Test', scan_time: '2026-09-24T22:00:00.000Z' });
  memDb.saveTopicSnapshot({
    topic_id: 'topic:test', scan_id: 'scan_2', scan_time: '2026-09-24T22:00:00.000Z',
    evaluation: { sample_size: 10, unique_creators: 5, fresh_0_24h: 0, fresh_24_72h: 0, fresh_3_7d: 0, older_7d: 0, momentum_status: 'STABLE_OR_GROWING', trend_score: 60 }
  });

  const scan3Time = '2026-09-25T00:30:00.000Z';
  const scoreResult = resolvePreviousScoreAndDelta('topic:test', scan3Time, 70, memDb);

  assert.equal(scoreResult.previous_score, 60);
  assert.equal(scoreResult.score_delta, 10);
  memDb.close();
});

test('TEST 17: latest previous NON-NULL score lookup skips null scored snapshots', () => {
  const memDb = new TikTokDatabase(':memory:');
  memDb.createScan('scan_1', '2026-09-24T18:00:00.000Z', '', 'BASELINE_SCAN', 1);
  memDb.upsertTopic({ topic_id: 'topic:test', canonical_title: 'Test', scan_time: '2026-09-24T18:00:00.000Z' });
  memDb.saveTopicSnapshot({
    topic_id: 'topic:test', scan_id: 'scan_1', scan_time: '2026-09-24T18:00:00.000Z',
    evaluation: { sample_size: 10, unique_creators: 5, fresh_0_24h: 0, fresh_24_72h: 0, fresh_3_7d: 0, older_7d: 0, momentum_status: 'UNKNOWN', trend_score: null }
  });

  // Scan 2 had trend_score 55
  memDb.createScan('scan_2', '2026-09-24T20:00:00.000Z', '', 'SECOND_FULL_SCAN', 2);
  memDb.saveTopicSnapshot({
    topic_id: 'topic:test', scan_id: 'scan_2', scan_time: '2026-09-24T20:00:00.000Z',
    evaluation: { sample_size: 10, unique_creators: 5, fresh_0_24h: 0, fresh_24_72h: 0, fresh_3_7d: 0, older_7d: 0, momentum_status: 'STABLE_OR_GROWING', trend_score: 55 }
  });

  // Scan 3 had trend_score null (e.g. search restricted)
  memDb.createScan('scan_3', '2026-09-24T22:00:00.000Z', '', 'FULL_SCAN_3', 3);
  memDb.saveTopicSnapshot({
    topic_id: 'topic:test', scan_id: 'scan_3', scan_time: '2026-09-24T22:00:00.000Z',
    evaluation: { sample_size: 0, unique_creators: 0, fresh_0_24h: 0, fresh_24_72h: 0, fresh_3_7d: 0, older_7d: 0, momentum_status: 'STABLE_OR_GROWING', trend_score: null }
  });

  // Scan 4 evaluates with current score 65
  const scan4Time = '2026-09-25T00:30:00.000Z';
  const scoreResult = resolvePreviousScoreAndDelta('topic:test', scan4Time, 65, memDb);

  // Must skip Scan 3 (null) and resolve Scan 2 (55)
  assert.equal(scoreResult.previous_score, 55);
  assert.equal(scoreResult.score_delta, 10);
  memDb.close();
});

// ==================================================
// PART G, H, I — QUALITY STATUS & INTEGRITY (TESTS 18 - 20)
// ==================================================

test('TEST 18: execution COMPLETED + Search restricted can produce data_quality PARTIAL', () => {
  const payload = {
    platform: 'tiktok',
    market: 'VN',
    scan_id: 'scan_test',
    scan_time: '2026-09-25T00:00:00.000Z',
    execution_status: 'COMPLETED',
    data_quality_status: 'PARTIAL',
    browser_execution_mode: 'HEADLESS_AUTOMATED',
    limitations: ['TikTok Search UI access restricted during current validation'],
    topics: []
  };
  assert.equal(validateScanPayload(payload), true);
});

test('TEST 19: no scan is run during Phase 4.2', () => {
  const db = new TikTokDatabase('./data/tiktok_trends.db');
  const scansCount = db.db.prepare('SELECT count(*) as c FROM scans').get().c;
  db.close();
  // Production DB still has exactly 3 scan rows
  assert.equal(scansCount, 3);
});

test('TEST 20: Facebook untouched', () => {
  const fbPath = path.resolve(__dirname, '../src/modules/facebook');
  assert.equal(fs.existsSync(fbPath), true);
  const fbFiles = fs.readdirSync(fbPath);
  assert.equal(fbFiles.length >= 4, true);
});
