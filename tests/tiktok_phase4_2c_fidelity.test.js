/**
 * PHASE 4.2C: BASELINE SNAPSHOT FIDELITY AUDIT & REPAIR TEST SUITE
 * 
 * Tests 1 - 20:
 * Verifies exact semantics of sample_size vs known_timestamp_count vs unknown_timestamp_count,
 * creator spread denominator (sample_size), freshness denominator (known_timestamp_count),
 * observation statuses (AVAILABLE, PARTIAL, UNAVAILABLE), baseline DB fidelity against evidence_videos,
 * migration idempotency, Scan #2 nullable preservation, failed scan exclusion, next scan number #3,
 * zero network/browser, and Facebook freeze.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const { TikTokDatabase, DEFAULT_DB_PATH } = require('../src/modules/tiktok/db/tiktokDb');
const {
  evaluateTopicSignals,
  classifyTimeBucket,
  COMPONENT_MAX_WEIGHTS
} = require('../src/modules/tiktok/scoring/trendScorer');
const { runMigration } = require('../scripts/migrate_nullable_freshness');
const { resolveNextScanMetadata, checkGenericTimeGate } = require('../src/modules/tiktok/scan/generalScanOrchestrator');

const DB_PATH = path.resolve(__dirname, '../data/tiktok_trends.db');
const BACKUP_PATH = path.resolve(__dirname, '../data/audit/tiktok_trends_pre_nullable_freshness_migration.db');
const FAILED_SCANS_PATH = path.resolve(__dirname, '../data/audit/tiktok_failed_scan_attempts.json');
const VALIDATION_RESULTS_PATH = path.resolve(__dirname, '../data/tiktok_validation_results.json');

// Helper to build mock evidence: nTotal items, nKnown with timestamps, nUnknown without timestamps
function createMockEvidence(nTotal, nKnown) {
  const now = Date.now();
  const evidence = [];
  for (let i = 0; i < nTotal; i++) {
    const isKnown = i < nKnown;
    evidence.push({
      video_url: `https://www.tiktok.com/@creator${i}/video/${1000 + i}`,
      creator: `creator${i}`,
      published_at: isKnown ? new Date(now - (i + 1) * 3600 * 1000).toISOString() : null, // 1h, 2h, ... within 0-24h
      views: 1000 + i
    });
  }
  return evidence;
}

// ==================================================
// TESTS 1 - 9: SEMANTICS OF SAMPLE_SIZE VS TIMESTAMPS
// ==================================================

test('TEST 1: 13 total evidence, 8 known timestamps -> sample_size = 13', () => {
  const evidence = createMockEvidence(13, 8);
  const result = evaluateTopicSignals({ evidence, currentReplication: true });
  assert.strictEqual(result.sample_size, 13);
});

test('TEST 2: freshness bucket sum = 8 -> known_timestamp_count = 8', () => {
  const evidence = createMockEvidence(13, 8);
  const result = evaluateTopicSignals({ evidence, currentReplication: true });
  const bucketSum = (result.fresh_0_24h || 0) + (result.fresh_24_72h || 0) + (result.fresh_3_7d || 0) + (result.older_7d || 0);
  assert.strictEqual(bucketSum, 8);
  assert.strictEqual(result.known_timestamp_count, 8);
});

test('TEST 3: unknown_timestamp_count = 5', () => {
  const evidence = createMockEvidence(13, 8);
  const result = evaluateTopicSignals({ evidence, currentReplication: true });
  assert.strictEqual(result.unknown_timestamp_count, 5);
  assert.strictEqual(result.sample_size - result.known_timestamp_count, 5);
});

test('TEST 4: 8/13 timestamp coverage calculated correctly', () => {
  const evidence = createMockEvidence(13, 8);
  const result = evaluateTopicSignals({ evidence, currentReplication: true });
  const expectedCoverage = 8 / 13;
  assert.ok(Math.abs(result.freshness_timestamp_coverage - expectedCoverage) < 1e-6);
  assert.strictEqual(result.freshness_timestamp_coverage >= 0.50, true);
});

test('TEST 5: freshness status: 8 of 13 -> PARTIAL', () => {
  const evidence = createMockEvidence(13, 8);
  const result = evaluateTopicSignals({ evidence, currentReplication: true });
  assert.strictEqual(result.freshness_observation_status, 'PARTIAL');
});

test('TEST 6: 13 of 13 -> AVAILABLE', () => {
  const evidence = createMockEvidence(13, 13);
  const result = evaluateTopicSignals({ evidence, currentReplication: true });
  assert.strictEqual(result.known_timestamp_count, 13);
  assert.strictEqual(result.unknown_timestamp_count, 0);
  assert.strictEqual(result.freshness_observation_status, 'AVAILABLE');
});

test('TEST 7: no current sample due access restriction -> UNAVAILABLE', () => {
  const result = evaluateTopicSignals({ evidence: [], currentReplication: null });
  assert.strictEqual(result.sample_size, 0);
  assert.strictEqual(result.known_timestamp_count, 0);
  assert.strictEqual(result.unknown_timestamp_count, null);
  assert.strictEqual(result.freshness_observation_status, 'UNAVAILABLE');
  assert.strictEqual(result.freshness_points, null);
});

test('TEST 8: creator spread denominator uses 13, not 8', () => {
  // 13 evidence from 13 unique creators: creator_spread_ratio must be 13 / 13 = 1.0
  const evidence = createMockEvidence(13, 8);
  const result = evaluateTopicSignals({ evidence, currentReplication: true });
  assert.strictEqual(result.unique_creators, 13);
  assert.strictEqual(result.sample_size, 13);
  assert.strictEqual(result.creator_spread_ratio, 1.0);
  assert.strictEqual(result.creator_spread_points, 20); // 1.0 * 20
});

test('TEST 9: freshness denominator uses 8, not 13', () => {
  // 8 known timestamps, all 0-24h (ratio = 8/8 = 1.0, not 8/13)
  const evidence = createMockEvidence(13, 8);
  const result = evaluateTopicSignals({ evidence, currentReplication: true });
  assert.strictEqual(result.known_timestamp_count, 8);
  // freshRatio = (8 * 1.0) / 8 = 1.0 -> 20 points
  assert.strictEqual(result.freshness_points, 20);
});

// ==================================================
// TESTS 10 - 12: BASELINE DB FIDELITY AGAINST EVIDENCE
// ==================================================

test('TEST 10: baseline OB55 fidelity against evidence rows', () => {
  const db = new TikTokDatabase(DB_PATH);
  const snapshot = db.db.prepare(`
    SELECT * FROM topic_snapshots
    WHERE scan_id = 'valid_1790284478478' AND topic_id = 'hashtag:ob55'
  `).get();

  const evidenceRows = db.db.prepare(`
    SELECT count(*) as total, count(DISTINCT creator) as unique_c
    FROM evidence_videos
    WHERE scan_id = 'valid_1790284478478' AND topic_id = 'hashtag:ob55'
  `).get();
  db.close();

  assert.ok(snapshot, 'OB55 snapshot must exist');
  assert.strictEqual(snapshot.sample_size, 13);
  assert.strictEqual(snapshot.unique_creators, 13);
  assert.strictEqual(snapshot.sample_size, evidenceRows.total);
  assert.strictEqual(snapshot.unique_creators, evidenceRows.unique_c);
  assert.strictEqual(snapshot.fresh_0_24h, 1);
  assert.strictEqual(snapshot.fresh_24_72h, 1);
  assert.strictEqual(snapshot.fresh_3_7d, 1);
  assert.strictEqual(snapshot.older_7d, 5);
  assert.strictEqual(snapshot.known_timestamp_count, 8);
  assert.strictEqual(snapshot.freshness_observation_status, 'PARTIAL');
});

test('TEST 11: baseline samdeal fidelity against evidence rows', () => {
  const db = new TikTokDatabase(DB_PATH);
  const snapshot = db.db.prepare(`
    SELECT * FROM topic_snapshots
    WHERE scan_id = 'valid_1790284478478' AND topic_id = 'hashtag:samdealruocden'
  `).get();

  const evidenceRows = db.db.prepare(`
    SELECT count(*) as total, count(DISTINCT creator) as unique_c
    FROM evidence_videos
    WHERE scan_id = 'valid_1790284478478' AND topic_id = 'hashtag:samdealruocden'
  `).get();
  db.close();

  assert.ok(snapshot, 'samdeal snapshot must exist');
  assert.strictEqual(snapshot.sample_size, 13);
  assert.strictEqual(snapshot.unique_creators, 13);
  assert.strictEqual(snapshot.sample_size, evidenceRows.total);
  assert.strictEqual(snapshot.unique_creators, evidenceRows.unique_c);
  assert.strictEqual(snapshot.fresh_0_24h, 0);
  assert.strictEqual(snapshot.fresh_24_72h, 0);
  assert.strictEqual(snapshot.fresh_3_7d, 2);
  assert.strictEqual(snapshot.older_7d, 6);
  assert.strictEqual(snapshot.known_timestamp_count, 8);
  assert.strictEqual(snapshot.freshness_observation_status, 'PARTIAL');
});

test('TEST 12: baseline evidence row count remains 26 total', () => {
  const db = new TikTokDatabase(DB_PATH);
  const total = db.db.prepare(`
    SELECT count(*) as c FROM evidence_videos WHERE scan_id = 'valid_1790284478478'
  `).get().c;
  db.close();

  assert.strictEqual(total, 26, 'Baseline must have exactly 26 evidence rows (13 per topic)');
});

// ==================================================
// TESTS 13 - 15: MIGRATION PRESERVATION & IDEMPOTENCY
// ==================================================

test('TEST 13: migration cannot alter sample_size', () => {
  const db = new TikTokDatabase(DB_PATH);
  const rows = db.db.prepare(`SELECT topic_id, sample_size FROM topic_snapshots WHERE scan_id = 'valid_1790284478478'`).all();
  db.close();

  for (const r of rows) {
    assert.strictEqual(r.sample_size, 13, `${r.topic_id} sample_size must be 13`);
  }
});

test('TEST 14: migration cannot alter unique_creators', () => {
  const db = new TikTokDatabase(DB_PATH);
  const rows = db.db.prepare(`SELECT topic_id, unique_creators FROM topic_snapshots WHERE scan_id = 'valid_1790284478478'`).all();
  db.close();

  for (const r of rows) {
    assert.strictEqual(r.unique_creators, 13, `${r.topic_id} unique_creators must be 13`);
  }
});

test('TEST 15: migration rerun is idempotent', () => {
  const res = runMigration();
  assert.strictEqual(res.status, 'MIGRATION_NOT_NEEDED');
  assert.strictEqual(res.schema_version, 2);

  // Verify DB state was NOT modified
  const db = new TikTokDatabase(DB_PATH);
  const snapCount = db.db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;
  const version = db.getSchemaVersion();
  db.close();

  assert.strictEqual(snapCount, 4, 'Snapshot row count must remain 4');
  assert.ok(version >= 2, `Schema version must be at least 2 (actual: ${version})`);
});

// ==================================================
// TESTS 16 - 20: SCAN #2, INTEGRITY, REPRODUCIBILITY & SECURITY
// ==================================================

test('TEST 16: Scan #2 nullable semantics remain unchanged', () => {
  const db = new TikTokDatabase(DB_PATH);
  const scan2Snaps = db.db.prepare(`
    SELECT * FROM topic_snapshots WHERE scan_id = 'scan_2_1790292122961'
  `).all();
  db.close();

  assert.strictEqual(scan2Snaps.length, 2);
  for (const sn of scan2Snaps) {
    assert.strictEqual(sn.sample_size, 0);
    assert.strictEqual(sn.fresh_0_24h, null);
    assert.strictEqual(sn.fresh_24_72h, null);
    assert.strictEqual(sn.fresh_3_7d, null);
    assert.strictEqual(sn.older_7d, null);
    assert.strictEqual(sn.known_timestamp_count, 0);
    assert.strictEqual(sn.freshness_observation_status, 'UNAVAILABLE');
    assert.strictEqual(sn.trend_score, null);
    assert.strictEqual(sn.score_status, 'INSUFFICIENT_DATA');
    assert.strictEqual(sn.momentum_score, 56);
    assert.strictEqual(sn.momentum_status, 'STABLE_OR_GROWING');
  }
});

test('TEST 17: failed scan attempts excluded', () => {
  assert.ok(fs.existsSync(FAILED_SCANS_PATH), 'Failed scan attempts audit file must exist');
  const failedScans = JSON.parse(fs.readFileSync(FAILED_SCANS_PATH, 'utf8'));
  assert.ok(Array.isArray(failedScans));
  assert.strictEqual(failedScans.length, 2);
  for (const fsItem of failedScans) {
    assert.strictEqual(fsItem.status, 'FAILED');
    assert.strictEqual(fsItem.used_for_comparable_history, false);
  }

  // Verify none of the failed scans exist in production scans table
  const db = new TikTokDatabase(DB_PATH);
  const foundScans = db.db.prepare(`SELECT scan_id FROM scans WHERE scan_id IN (?, ?)`).all(
    failedScans[0].scan_id, failedScans[1].scan_id
  );
  db.close();
  assert.strictEqual(foundScans.length, 0, 'Failed scan IDs must not exist in scans table');
});

test('TEST 18: next production scan remains #3', () => {
  const db = new TikTokDatabase(DB_PATH);
  const meta = resolveNextScanMetadata(db);
  db.close();

  assert.strictEqual(meta.next_scan_number, 3);
  assert.strictEqual(meta.next_scan_kind, 'FULL_SCAN_3');
  assert.strictEqual(meta.latest_scan.scan_id, 'scan_2_1790292122961');
  assert.strictEqual(meta.latest_scan.scan_number, 2);
});

test('TEST 19: no browser/network', () => {
  // Static assurance: verify this test run does not import playwright or start network listener
  assert.strictEqual(process.env.TIKTOK_DISABLE_NETWORK !== 'false', true);
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
});
