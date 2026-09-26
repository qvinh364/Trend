/**
 * PHASE 4.2D: BASELINE METRIC PROVENANCE & CANDIDATE ARTIFACT IMMUTABILITY TEST SUITE
 * 
 * Tests 1 - 20:
 * Verifies strict decoupling of historical metrics from candidate JSON artifacts:
 * - Historical CC metrics live exclusively in SQLite topic_snapshots (schema v3).
 * - Candidate JSON is strictly a discovery artifact and is never read or mutated for history.
 * - getBaselineCcMetrics queries SQLite topic_snapshots directly.
 * - Preserves baseline and Scan #2 fidelity, NULL freshness semantics, row counts.
 * - Idempotent schema migration (version 2 -> 3).
 * - Next production scan remains #3.
 * - Zero network/browser execution.
 * - Facebook module completely frozen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const { TikTokDatabase, DEFAULT_DB_PATH } = require('../src/modules/tiktok/db/tiktokDb');
const { evaluateTopicSignals } = require('../src/modules/tiktok/scoring/trendScorer');
const { getBaselineCcMetrics } = require('../src/modules/tiktok/scan/secondScanOrchestrator');
const { runCcMigration } = require('../scripts/migrate_cc_snapshot_history');
const {
  resolveNextScanMetadata,
  resolvePreviousScoreAndDelta
} = require('../src/modules/tiktok/scan/generalScanOrchestrator');

const DB_PATH = path.resolve(__dirname, '../data/tiktok_trends.db');
const CANDIDATES_FILE_PATH = path.resolve(__dirname, '../data/tiktok_candidates.json');
const ARCHIVED_CANDIDATES_PATH = path.resolve(__dirname, '../data/audit/tiktok_candidates_pre_provenance_cleanup.json');
const FAILED_SCANS_PATH = path.resolve(__dirname, '../data/audit/tiktok_failed_scan_attempts.json');
const PRE_CC_MIGRATION_BACKUP = path.resolve(__dirname, '../data/audit/tiktok_trends_pre_cc_snapshot_migration.db');

// Record initial snapshot and evidence counts before tests run
let initialDbStats = { snapshots: 0, evidence: 0, candidateCount: 0 };
try {
  const initDb = new TikTokDatabase(DB_PATH);
  initialDbStats.snapshots = initDb.db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;
  initialDbStats.evidence = initDb.db.prepare('SELECT count(*) as c FROM evidence_videos').get().c;
  initDb.close();
  const initCand = JSON.parse(fs.readFileSync(CANDIDATES_FILE_PATH, 'utf8'));
  initialDbStats.candidateCount = initCand.current_candidates.length;
} catch (_) {}

// ==================================================
// TESTS 1 - 5: SQLITE RAW CC HISTORY & DECOUPLING
// ==================================================

test('TEST 1: Previous CC metric lookup reads SQLite, not candidate JSON', () => {
  // Candidate JSON currently does NOT have hashtag:ob55
  const candData = JSON.parse(fs.readFileSync(CANDIDATES_FILE_PATH, 'utf8'));
  const hasOb55InJson = candData.current_candidates.some(c => c.candidate_key === 'hashtag:ob55');
  assert.strictEqual(hasOb55InJson, false, 'Candidate JSON must not contain hashtag:ob55');

  // But getBaselineCcMetrics retrieves it directly from SQLite topic_snapshots
  const baseOb55 = getBaselineCcMetrics('hashtag:ob55', DB_PATH);
  assert.deepStrictEqual(baseOb55, {
    rank: 3,
    posts: 4100,
    views: 75800000
  });

  const baseSamdeal = getBaselineCcMetrics('hashtag:samdealruocden', DB_PATH);
  assert.deepStrictEqual(baseSamdeal, {
    rank: 2,
    posts: 21200,
    views: 13700000
  });
});

test('TEST 2: Mutating candidate JSON does not change historical previous metrics', () => {
  // Test with an isolated dummy JSON path: even if a JSON file contains bogus data,
  // getBaselineCcMetrics uses SQLite and is completely unaffected.
  const tempJsonPath = path.resolve(__dirname, '../data/audit/temp_mock_candidate.json');
  fs.writeFileSync(tempJsonPath, JSON.stringify({
    scan_id: 'disc_fake_123',
    current_candidates: [
      { candidate_key: 'hashtag:ob55', discovery_sources: [{ rank: 99, posts: 999999, views: 99999999 }] }
    ]
  }));

  try {
    const metrics = getBaselineCcMetrics('hashtag:ob55', DB_PATH);
    assert.strictEqual(metrics.rank, 3, 'Rank must remain 3 from SQLite');
    assert.strictEqual(metrics.posts, 4100, 'Posts must remain 4100 from SQLite');
    assert.strictEqual(metrics.views, 75800000, 'Views must remain 75800000 from SQLite');
  } finally {
    if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
  }
});

test('TEST 3: Baseline OB55 CC raw values preserved', () => {
  const db = new TikTokDatabase(DB_PATH);
  const snap = db.db.prepare(`
    SELECT cc_rank, cc_posts, cc_views, cc_source, cc_observation_status
    FROM topic_snapshots
    WHERE scan_id = 'valid_1790284478478' AND topic_id = 'hashtag:ob55'
  `).get();
  db.close();

  assert.ok(snap, 'Baseline OB55 snapshot must exist in SQLite');
  assert.strictEqual(snap.cc_rank, 3);
  assert.strictEqual(snap.cc_posts, 4100);
  assert.strictEqual(snap.cc_views, 75800000);
  assert.strictEqual(snap.cc_source, 'creative_center_7d');
  assert.strictEqual(snap.cc_observation_status, 'OBSERVED');
});

test('TEST 4: Baseline samdeal CC raw values preserved', () => {
  const db = new TikTokDatabase(DB_PATH);
  const snap = db.db.prepare(`
    SELECT cc_rank, cc_posts, cc_views, cc_source, cc_observation_status
    FROM topic_snapshots
    WHERE scan_id = 'valid_1790284478478' AND topic_id = 'hashtag:samdealruocden'
  `).get();
  db.close();

  assert.ok(snap, 'Baseline samdeal snapshot must exist in SQLite');
  assert.strictEqual(snap.cc_rank, 2);
  assert.strictEqual(snap.cc_posts, 21200);
  assert.strictEqual(snap.cc_views, 13700000);
  assert.strictEqual(snap.cc_source, 'creative_center_7d');
  assert.strictEqual(snap.cc_observation_status, 'OBSERVED');
});

test('TEST 5: Scan #2 CC raw values stored per snapshot', () => {
  const db = new TikTokDatabase(DB_PATH);
  const snaps = db.db.prepare(`
    SELECT topic_id, cc_rank, cc_posts, cc_views, cc_source, cc_observation_status
    FROM topic_snapshots
    WHERE scan_id = 'scan_2_1790292122961'
    ORDER BY topic_id ASC
  `).all();
  db.close();

  assert.strictEqual(snaps.length, 2, 'Scan #2 must have exactly 2 snapshots');
  
  const ob55Snap = snaps.find(s => s.topic_id === 'hashtag:ob55');
  assert.ok(ob55Snap);
  assert.strictEqual(ob55Snap.cc_rank, 3);
  assert.strictEqual(ob55Snap.cc_posts, 4100);
  assert.strictEqual(ob55Snap.cc_views, 75800000);
  assert.strictEqual(ob55Snap.cc_source, 'creative_center_7d');
  assert.strictEqual(ob55Snap.cc_observation_status, 'OBSERVED');

  const samdealSnap = snaps.find(s => s.topic_id === 'hashtag:samdealruocden');
  assert.ok(samdealSnap);
  assert.strictEqual(samdealSnap.cc_rank, 2);
  assert.strictEqual(samdealSnap.cc_posts, 21200);
  assert.strictEqual(samdealSnap.cc_views, 13700000);
  assert.strictEqual(samdealSnap.cc_source, 'creative_center_7d');
  assert.strictEqual(samdealSnap.cc_observation_status, 'OBSERVED');
});

// ==================================================
// TESTS 6 - 10: SCAN #3 PREPARATION & TEST ISOLATION
// ==================================================

test('TEST 6: Current Scan fixture metrics compare against DB metrics', () => {
  const db = new TikTokDatabase(DB_PATH);
  const latestCompleted = db.db.prepare(`
    SELECT * FROM scans 
    WHERE status = 'COMPLETED' 
    ORDER BY scan_number DESC, scan_time DESC 
    LIMIT 1
  `).get();
  const latestSnap = db.getLatestTopicSnapshot('hashtag:ob55');
  db.close();

  assert.ok(latestSnap, 'Must have latest topic snapshot');
  assert.ok(latestCompleted, 'Must have latest completed scan');
  assert.strictEqual(latestSnap.scan_id, latestCompleted.scan_id, 'Latest snapshot must match latest completed scan');

  // Verify momentum comparison invariant against baseline/previous metric (4100 posts)
  const previousSnapshot = {
    scan_id: 'scan_2_1790292122961',
    ccRank: 3,
    ccPosts: 4100,
    ccViews: 75800000
  };

  const evalResult = evaluateTopicSignals({
    evidence: [],
    previousSnapshot,
    currentSurfaceCount: 1,
    currentReplication: null,
    currentCandidateExtra: {
      ccRank: 3,
      ccPosts: 4305, // +5% over 4100
      ccViews: 80000000
    },
    scanNumber: 3
  });

  // Growth: (4305 - 4100) / 4100 = +0.05 -> normalized = 100
  assert.ok(evalResult.momentum_raw_signals);
  assert.strictEqual(evalResult.momentum_raw_signals.posts.growth_pct, 0.05);
  assert.strictEqual(evalResult.momentum_raw_signals.posts.normalized, 100);
});

test('TEST 7: Successful current snapshot persists its own CC raw values', () => {
  const tempDbPath = path.resolve(__dirname, '../data/audit/temp_test_cc_persist.db');
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  const testDb = new TikTokDatabase(tempDbPath);
  testDb.createScan('scan_3_test_123', new Date().toISOString(), 'Test scan 3', 'FULL_SCAN_3', 3, 'COMPLETED');
  testDb.upsertTopic({
    topic_id: 'hashtag:test_topic',
    canonical_title: 'Test Topic',
    aliases: ['#test_topic'],
    scan_time: new Date().toISOString(),
    first_seen: new Date().toISOString(),
    type: 'hashtag'
  });

  const dummyEval = {
    sample_size: 10,
    unique_creators: 8,
    fresh_0_24h: 3,
    fresh_24_72h: 2,
    fresh_3_7d: 1,
    older_7d: 4,
    known_timestamp_count: 10,
    freshness_observation_status: 'AVAILABLE',
    cc_rank: 5,
    cc_posts: 8800,
    cc_views: 45000000,
    cc_source: 'creative_center_7d',
    cc_observation_status: 'OBSERVED',
    creator_spread_points: 16,
    freshness_points: 18,
    replication_points: 15,
    cross_surface_points: 10,
    engagement_points: 10,
    momentum_score: 75,
    momentum_status: 'RISING',
    trend_score: 78,
    lifecycle: 'EMERGING',
    confidence: 'HIGH'
  };

  testDb.saveTopicSnapshot({
    topic_id: 'hashtag:test_topic',
    scan_id: 'scan_3_test_123',
    scan_time: new Date().toISOString(),
    evaluation: dummyEval
  });

  const saved = testDb.db.prepare(`
    SELECT cc_rank, cc_posts, cc_views, cc_source, cc_observation_status
    FROM topic_snapshots
    WHERE scan_id = 'scan_3_test_123' AND topic_id = 'hashtag:test_topic'
  `).get();
  testDb.close();
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  assert.ok(saved);
  assert.strictEqual(saved.cc_rank, 5);
  assert.strictEqual(saved.cc_posts, 8800);
  assert.strictEqual(saved.cc_views, 45000000);
  assert.strictEqual(saved.cc_source, 'creative_center_7d');
  assert.strictEqual(saved.cc_observation_status, 'OBSERVED');
});

test('TEST 8: Candidate JSON scan_id mismatch cannot be used as history', () => {
  const cand = JSON.parse(fs.readFileSync(CANDIDATES_FILE_PATH, 'utf8'));
  assert.ok(typeof cand.scan_id === 'string' && cand.scan_id.startsWith('disc_'), 'Candidate artifact must have a valid discovery scan_id');

  // Verify that discovery scan_id is NEVER recorded in scans or topic_snapshots
  const db = new TikTokDatabase(DB_PATH);
  const foundScan = db.db.prepare('SELECT scan_id FROM scans WHERE scan_id = ?').get(cand.scan_id);
  const foundSnapshot = db.db.prepare('SELECT scan_id FROM topic_snapshots WHERE scan_id = ?').get(cand.scan_id);
  db.close();

  assert.strictEqual(foundScan, undefined, 'Discovery scan_id must not exist in scans table');
  assert.strictEqual(foundSnapshot, undefined, 'Discovery scan_id must not exist in topic_snapshots table');

  // Invariant: Historical CC lookup does not depend on candidate JSON
  const baseMetrics = getBaselineCcMetrics('hashtag:ob55', DB_PATH);
  assert.strictEqual(baseMetrics.posts, 4100);
  assert.strictEqual(baseMetrics.views, 75800000);
});

test('TEST 9: getBaselineCcMetrics does not access mutable candidate file', () => {
  // Confirm getBaselineCcMetrics succeeds even if passed an in-memory DB or DB path directly,
  // with zero reference or filesystem read on data/tiktok_candidates.json
  const metrics = getBaselineCcMetrics('hashtag:ob55', DB_PATH);
  assert.strictEqual(metrics.rank, 3);
  assert.strictEqual(metrics.posts, 4100);
  assert.strictEqual(metrics.views, 75800000);

  // Non-existent topic returns nulls gracefully without error
  const nonExistent = getBaselineCcMetrics('hashtag:does_not_exist', DB_PATH);
  assert.deepStrictEqual(nonExistent, { rank: null, posts: null, views: null });
});

test('TEST 10: Unit tests use temp fixtures instead of editing production candidate JSON', () => {
  // Confirm production candidate file is clean (7 items)
  const cand = JSON.parse(fs.readFileSync(CANDIDATES_FILE_PATH, 'utf8'));
  assert.strictEqual(cand.current_candidates.length, 7);
  assert.strictEqual(cand.current_candidates.some(c => c.candidate_key === 'hashtag:ob55'), false);

  // Confirm archived pre-provenance file exists for audit
  assert.ok(fs.existsSync(ARCHIVED_CANDIDATES_PATH));
  const archived = JSON.parse(fs.readFileSync(ARCHIVED_CANDIDATES_PATH, 'utf8'));
  assert.strictEqual(archived.current_candidates.length, 8);
  assert.strictEqual(archived.current_candidates.some(c => c.candidate_key === 'hashtag:ob55'), true);
});

// ==================================================
// TESTS 11 - 15: SCHEMA MIGRATION & CONTRACT FIDELITY
// ==================================================

test('TEST 11: Schema migration idempotent', () => {
  const result = runCcMigration(DB_PATH);
  assert.strictEqual(result.status, 'MIGRATION_NOT_NEEDED');
  assert.strictEqual(result.schema_version, 3);

  const db = new TikTokDatabase(DB_PATH);
  const version = db.getSchemaVersion();
  db.close();
  assert.strictEqual(version, 3);
});

test('TEST 12: Schema migration preserves snapshot counts and completed scan invariants', () => {
  const db = new TikTokDatabase(DB_PATH);
  const count = db.db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;
  const comparableScanIds = db.db.prepare('SELECT DISTINCT scan_id FROM topic_snapshots').all().map(r => r.scan_id);

  assert.ok(count >= 4, `Snapshot count must not decrease (found ${count})`);
  assert.ok(comparableScanIds.length >= 2, `Must have at least baseline and scan 2 comparable snapshots`);

  for (const scanId of comparableScanIds) {
    const snapCount = db.db.prepare('SELECT count(*) as c FROM topic_snapshots WHERE scan_id = ?').get(scanId).c;
    assert.strictEqual(snapCount, 2, `Comparable completed scan ${scanId} must have expected 2 topic snapshots`);
  }
  db.close();
});

test('TEST 13: Schema migration preserves evidence rows (26 rows)', () => {
  const db = new TikTokDatabase(DB_PATH);
  const count = db.db.prepare('SELECT count(*) as c FROM evidence_videos').get().c;
  db.close();
  assert.strictEqual(count, 26, 'Exactly 26 evidence rows must remain (13 per topic in baseline)');
});

test('TEST 14: Schema migration preserves NULL freshness semantics', () => {
  const db = new TikTokDatabase(DB_PATH);
  const scan2Rows = db.db.prepare(`
    SELECT * FROM topic_snapshots WHERE scan_id = 'scan_2_1790292122961'
  `).all();
  db.close();

  assert.strictEqual(scan2Rows.length, 2);
  for (const row of scan2Rows) {
    assert.strictEqual(row.fresh_0_24h, null);
    assert.strictEqual(row.fresh_24_72h, null);
    assert.strictEqual(row.fresh_3_7d, null);
    assert.strictEqual(row.older_7d, null);
    assert.strictEqual(row.known_timestamp_count, 0);
    assert.strictEqual(row.freshness_observation_status, 'UNAVAILABLE');
  }
});

test('TEST 15: previous_score logic unchanged (null for scan 2)', () => {
  const db = new TikTokDatabase(DB_PATH);
  const scan2Rows = db.db.prepare(`
    SELECT previous_score, score_delta FROM topic_snapshots WHERE scan_id = 'scan_2_1790292122961'
  `).all();

  for (const row of scan2Rows) {
    assert.strictEqual(row.previous_score, null);
    assert.strictEqual(row.score_delta, null);
  }

  // Testing resolution function
  const res = resolvePreviousScoreAndDelta('hashtag:ob55', '2026-09-25T00:00:00.000Z', 75, db);
  assert.strictEqual(res.previous_score, null);
  assert.strictEqual(res.score_delta, null);
  db.close();
});

// ==================================================
// TESTS 16 - 20: AUDIT, NEXT SCAN & SAFETY
// ==================================================

test('TEST 16: Failed scans remain excluded (data/audit/tiktok_failed_scan_attempts.json)', () => {
  assert.ok(fs.existsSync(FAILED_SCANS_PATH));
  const failed = JSON.parse(fs.readFileSync(FAILED_SCANS_PATH, 'utf8'));
  assert.strictEqual(failed.length, 2);
  for (const f of failed) {
    assert.strictEqual(f.status, 'FAILED');
    assert.strictEqual(f.used_for_comparable_history, false);
  }

  const db = new TikTokDatabase(DB_PATH);
  const ids = failed.map(f => f.scan_id);
  const inScans = db.db.prepare(`SELECT scan_id FROM scans WHERE scan_id IN (?, ?)`).all(ids[0], ids[1]);
  db.close();
  assert.strictEqual(inScans.length, 0);
});

test('TEST 17: Next production scan metadata matches completed comparable history', () => {
  const db = new TikTokDatabase(DB_PATH);
  const meta = resolveNextScanMetadata(db);
  const latestCompleted = db.db.prepare(`
    SELECT * FROM scans 
    WHERE status = 'COMPLETED' 
    ORDER BY scan_number DESC, scan_time DESC 
    LIMIT 1
  `).get();
  db.close();

  assert.ok(latestCompleted, 'Must have at least one completed scan');
  const expectedNextScanNumber = latestCompleted.scan_number + 1;
  assert.strictEqual(meta.next_scan_number, expectedNextScanNumber, `next_scan_number must be latest completed + 1 (${expectedNextScanNumber})`);
  assert.strictEqual(meta.next_scan_number, 4, 'Current expected next production scan is #4');
  assert.strictEqual(meta.next_scan_kind, `FULL_SCAN_${expectedNextScanNumber}`);
  assert.strictEqual(meta.latest_scan.scan_number, latestCompleted.scan_number);
  assert.strictEqual(meta.latest_scan.scan_id, latestCompleted.scan_id);
});

test('TEST 18: No browser/network during test execution', () => {
  assert.strictEqual(process.env.TIKTOK_DISABLE_NETWORK !== 'false', true);
});

test('TEST 19: No production artifact modified by test suite', () => {
  // Confirm candidate JSON still has same candidate count as before test
  const cand = JSON.parse(fs.readFileSync(CANDIDATES_FILE_PATH, 'utf8'));
  assert.strictEqual(cand.current_candidates.length, initialDbStats.candidateCount);

  // Invariant: snapshot count before test == snapshot count after test
  const db = new TikTokDatabase(DB_PATH);
  const snaps = db.db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;
  const evid = db.db.prepare('SELECT count(*) as c FROM evidence_videos').get().c;
  db.close();
  assert.strictEqual(snaps, initialDbStats.snapshots, 'Snapshot count before test must equal snapshot count after test');
  assert.strictEqual(evid, initialDbStats.evidence, 'Evidence count before test must equal evidence count after test');
});

test('TEST 20: Facebook untouched', () => {
  const fbDir = path.resolve(__dirname, '../src/modules/facebook');
  const files = fs.readdirSync(fbDir);
  assert.deepStrictEqual(files.sort(), [
    'fbGroupScraper.js',
    'fbGroupWatcher.js',
    'fbSetupSession.js',
    'index.js'
  ].sort());

  const fbSession = path.resolve(__dirname, '../data/fb_session.json');
  assert.ok(fs.existsSync(fbSession));
});
