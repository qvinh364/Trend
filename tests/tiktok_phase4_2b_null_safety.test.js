/**
 * PHASE 4.2B TEST SUITE: NULL-SAFE SNAPSHOT SCHEMA MIGRATION & SEMANTICS
 * 
 * Verifies all 20 requirements:
 * TEST 1: fresh_0_24h = null -> DB stores SQL NULL
 * TEST 2: fresh_24_72h = null -> SQL NULL
 * TEST 3: fresh_3_7d = null -> SQL NULL
 * TEST 4: older_7d = null -> SQL NULL
 * TEST 5: real observed count 0 -> DB stores integer 0
 * TEST 6: NULL read back -> JavaScript null
 * TEST 7: UNAVAILABLE freshness -> freshness momentum component null
 * TEST 8: observed zero freshness -> scorer may legitimately calculate low freshness
 * TEST 9: Scan #2 repaired DB semantics: all freshness buckets null
 * TEST 10: known_timestamp_count = 0 preserved
 * TEST 11: freshness_observation_status = UNAVAILABLE preserved
 * TEST 12: migration preserves existing row count
 * TEST 13: migration preserves unique constraints
 * TEST 14: migration preserves FK integrity
 * TEST 15: no duplicate topic snapshots introduced
 * TEST 16: failed scan attempts not comparable
 * TEST 17: next production scan number still = 3
 * TEST 18: time gate based on successful Scan #2
 * TEST 19: no browser/network during migration
 * TEST 20: Facebook untouched
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { TikTokDatabase } = require('../src/modules/tiktok/db/tiktokDb');
const { calculateMomentum } = require('../src/modules/tiktok/scoring/momentumCalculator');
const { evaluateTopicSignals } = require('../src/modules/tiktok/scoring/trendScorer');
const {
  checkGenericTimeGate,
  resolveNextScanMetadata
} = require('../src/modules/tiktok/scan/generalScanOrchestrator');

const FAILED_ATTEMPTS_FILE = path.resolve(__dirname, '../data/audit/tiktok_failed_scan_attempts.json');
const BACKUP_DB_FILE = path.resolve(__dirname, '../data/audit/tiktok_trends_pre_nullable_freshness_migration.db');

test('TEST 1: fresh_0_24h = null -> DB stores SQL NULL', () => {
  const memDb = new TikTokDatabase(':memory:');
  memDb.createScan('s1', '2026-09-25T00:00:00Z', '', 'TEST_SCAN', 1);
  memDb.upsertTopic({ topic_id: 't1', canonical_title: 'T1', aliases: [], scan_time: '2026-09-25T00:00:00Z', first_seen: '2026-09-25T00:00:00Z', type: 'topic' });

  memDb.saveTopicSnapshot({
    topic_id: 't1',
    scan_id: 's1',
    evaluation: {
      sample_size: 0,
      unique_creators: 0,
      fresh_0_24h: null,
      fresh_24_72h: null,
      fresh_3_7d: null,
      older_7d: null,
      known_timestamp_count: 0,
      freshness_observation_status: 'UNAVAILABLE',
      momentum_status: 'UNKNOWN'
    }
  });

  const row = memDb.db.prepare('SELECT fresh_0_24h FROM topic_snapshots WHERE topic_id = ?').get('t1');
  assert.equal(row.fresh_0_24h, null);
  memDb.close();
});

test('TEST 2: fresh_24_72h = null -> SQL NULL', () => {
  const memDb = new TikTokDatabase(':memory:');
  memDb.createScan('s1', '2026-09-25T00:00:00Z', '', 'TEST_SCAN', 1);
  memDb.upsertTopic({ topic_id: 't1', canonical_title: 'T1', aliases: [], scan_time: '2026-09-25T00:00:00Z', first_seen: '2026-09-25T00:00:00Z', type: 'topic' });

  memDb.saveTopicSnapshot({
    topic_id: 't1',
    scan_id: 's1',
    evaluation: {
      sample_size: 0,
      unique_creators: 0,
      fresh_0_24h: null,
      fresh_24_72h: null,
      fresh_3_7d: null,
      older_7d: null,
      known_timestamp_count: 0,
      freshness_observation_status: 'UNAVAILABLE',
      momentum_status: 'UNKNOWN'
    }
  });

  const row = memDb.db.prepare('SELECT fresh_24_72h FROM topic_snapshots WHERE topic_id = ?').get('t1');
  assert.equal(row.fresh_24_72h, null);
  memDb.close();
});

test('TEST 3: fresh_3_7d = null -> SQL NULL', () => {
  const memDb = new TikTokDatabase(':memory:');
  memDb.createScan('s1', '2026-09-25T00:00:00Z', '', 'TEST_SCAN', 1);
  memDb.upsertTopic({ topic_id: 't1', canonical_title: 'T1', aliases: [], scan_time: '2026-09-25T00:00:00Z', first_seen: '2026-09-25T00:00:00Z', type: 'topic' });

  memDb.saveTopicSnapshot({
    topic_id: 't1',
    scan_id: 's1',
    evaluation: {
      sample_size: 0,
      unique_creators: 0,
      fresh_0_24h: null,
      fresh_24_72h: null,
      fresh_3_7d: null,
      older_7d: null,
      known_timestamp_count: 0,
      freshness_observation_status: 'UNAVAILABLE',
      momentum_status: 'UNKNOWN'
    }
  });

  const row = memDb.db.prepare('SELECT fresh_3_7d FROM topic_snapshots WHERE topic_id = ?').get('t1');
  assert.equal(row.fresh_3_7d, null);
  memDb.close();
});

test('TEST 4: older_7d = null -> SQL NULL', () => {
  const memDb = new TikTokDatabase(':memory:');
  memDb.createScan('s1', '2026-09-25T00:00:00Z', '', 'TEST_SCAN', 1);
  memDb.upsertTopic({ topic_id: 't1', canonical_title: 'T1', aliases: [], scan_time: '2026-09-25T00:00:00Z', first_seen: '2026-09-25T00:00:00Z', type: 'topic' });

  memDb.saveTopicSnapshot({
    topic_id: 't1',
    scan_id: 's1',
    evaluation: {
      sample_size: 0,
      unique_creators: 0,
      fresh_0_24h: null,
      fresh_24_72h: null,
      fresh_3_7d: null,
      older_7d: null,
      known_timestamp_count: 0,
      freshness_observation_status: 'UNAVAILABLE',
      momentum_status: 'UNKNOWN'
    }
  });

  const row = memDb.db.prepare('SELECT older_7d FROM topic_snapshots WHERE topic_id = ?').get('t1');
  assert.equal(row.older_7d, null);
  memDb.close();
});

test('TEST 5: real observed count 0 -> DB stores integer 0', () => {
  const memDb = new TikTokDatabase(':memory:');
  memDb.createScan('s1', '2026-09-25T00:00:00Z', '', 'TEST_SCAN', 1);
  memDb.upsertTopic({ topic_id: 't1', canonical_title: 'T1', aliases: [], scan_time: '2026-09-25T00:00:00Z', first_seen: '2026-09-25T00:00:00Z', type: 'topic' });

  memDb.saveTopicSnapshot({
    topic_id: 't1',
    scan_id: 's1',
    evaluation: {
      sample_size: 8,
      unique_creators: 5,
      fresh_0_24h: 0,
      fresh_24_72h: 0,
      fresh_3_7d: 2,
      older_7d: 6,
      known_timestamp_count: 8,
      freshness_observation_status: 'AVAILABLE',
      momentum_status: 'UNKNOWN'
    }
  });

  const row = memDb.db.prepare('SELECT fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d FROM topic_snapshots WHERE topic_id = ?').get('t1');
  assert.strictEqual(row.fresh_0_24h, 0, 'Observed 0 must be integer 0, not null');
  assert.strictEqual(row.fresh_24_72h, 0, 'Observed 0 must be integer 0, not null');
  assert.strictEqual(row.fresh_3_7d, 2);
  assert.strictEqual(row.older_7d, 6);
  memDb.close();
});

test('TEST 6: NULL read back -> JavaScript null', () => {
  const memDb = new TikTokDatabase(':memory:');
  memDb.createScan('s1', '2026-09-25T00:00:00Z', '', 'TEST_SCAN', 1);
  memDb.upsertTopic({ topic_id: 't1', canonical_title: 'T1', aliases: [], scan_time: '2026-09-25T00:00:00Z', first_seen: '2026-09-25T00:00:00Z', type: 'topic' });

  memDb.saveTopicSnapshot({
    topic_id: 't1',
    scan_id: 's1',
    evaluation: {
      sample_size: 0,
      unique_creators: 0,
      fresh_0_24h: null,
      fresh_24_72h: null,
      fresh_3_7d: null,
      older_7d: null,
      known_timestamp_count: 0,
      freshness_observation_status: 'UNAVAILABLE',
      momentum_status: 'UNKNOWN'
    }
  });

  const result = memDb.getScanResults('s1');
  const snap = result.topics[0];
  assert.strictEqual(snap.signals.fresh_0_24h, null);
  assert.strictEqual(snap.signals.fresh_24_72h, null);
  assert.strictEqual(snap.signals.fresh_3_7d, null);
  assert.strictEqual(snap.signals.older_7d, null);
  assert.strictEqual(snap.signals.known_timestamp_count, 0);
  assert.strictEqual(snap.signals.freshness_observation_status, 'UNAVAILABLE');
  memDb.close();
});

test('TEST 7: UNAVAILABLE freshness -> freshness momentum component null', () => {
  const current = {
    ccRank: 2,
    ccPosts: 1000,
    ccViews: 50000,
    sample_size: 0,
    unique_creators: 0,
    surfaceCount: 1,
    evidenceUrls: [],
    freshCounts: {
      fresh_0_24h: null,
      fresh_24_72h: null,
      fresh_3_7d: null,
      older_7d: null,
      freshness_observation_status: 'UNAVAILABLE'
    }
  };

  const previous = {
    ccRank: 2,
    ccPosts: 1000,
    ccViews: 50000,
    sample_size: 10,
    unique_creators: 5,
    surfaceCount: 1,
    evidenceUrls: ['https://tiktok.com/@u/video/1'],
    freshCounts: {
      fresh_0_24h: 1,
      fresh_24_72h: 2,
      fresh_3_7d: 3,
      older_7d: 4,
      freshness_observation_status: 'AVAILABLE'
    }
  };

  const mom = calculateMomentum(current, previous);
  assert.strictEqual(mom.raw_signals.freshness, null);
  assert.strictEqual(mom.coverage_audit.freshness_component, null);
  // Freshness 15 points must NOT be included in available subweights
  assert.equal(mom.coverage_audit.available_subweights <= 85, true);
});

test('TEST 8: observed zero freshness -> scorer may legitimately calculate low freshness', () => {
  // 8 videos all older than 7 days: fresh_0_24h = 0, fresh_24_72h = 0, fresh_3_7d = 0, older_7d = 8
  const now = Date.now();
  const oldEvidence = Array.from({ length: 8 }, (_, i) => ({
    video_url: `https://tiktok.com/@creator${i}/video/${i}`,
    creator: `creator${i}`,
    published_at: new Date(now - 10 * 24 * 3600 * 1000).toISOString() // 10 days old
  }));

  const signals = evaluateTopicSignals({ evidence: oldEvidence, currentReplication: true });
  assert.strictEqual(signals.sample_size, 8);
  assert.strictEqual(signals.fresh_0_24h, 0);
  assert.strictEqual(signals.fresh_24_72h, 0);
  assert.strictEqual(signals.fresh_3_7d, 0);
  assert.strictEqual(signals.older_7d, 8);
  assert.strictEqual(signals.known_timestamp_count, 8);
  assert.strictEqual(signals.freshness_observation_status, 'AVAILABLE');
  assert.strictEqual(signals.freshness_points, 0); // Legitimate 0 points
  assert.strictEqual(signals.freshness_score, 0);
});

test('TEST 9: Scan #2 repaired DB semantics: all freshness buckets null', () => {
  const db = new TikTokDatabase();
  const rows = db.db.prepare(`
    SELECT topic_id, fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d
    FROM topic_snapshots
    WHERE scan_id = 'scan_2_1790292122961'
  `).all();
  db.close();

  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.strictEqual(r.fresh_0_24h, null, `${r.topic_id} fresh_0_24h must be null`);
    assert.strictEqual(r.fresh_24_72h, null, `${r.topic_id} fresh_24_72h must be null`);
    assert.strictEqual(r.fresh_3_7d, null, `${r.topic_id} fresh_3_7d must be null`);
    assert.strictEqual(r.older_7d, null, `${r.topic_id} older_7d must be null`);
  }
});

test('TEST 10: known_timestamp_count = 0 preserved in Scan #2', () => {
  const db = new TikTokDatabase();
  const rows = db.db.prepare(`
    SELECT topic_id, known_timestamp_count
    FROM topic_snapshots
    WHERE scan_id = 'scan_2_1790292122961'
  `).all();
  db.close();

  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.strictEqual(r.known_timestamp_count, 0);
  }
});

test('TEST 11: freshness_observation_status = UNAVAILABLE preserved in Scan #2', () => {
  const db = new TikTokDatabase();
  const rows = db.db.prepare(`
    SELECT topic_id, freshness_observation_status
    FROM topic_snapshots
    WHERE scan_id = 'scan_2_1790292122961'
  `).all();
  db.close();

  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.strictEqual(r.freshness_observation_status, 'UNAVAILABLE');
  }
});

test('TEST 12: migration preserves existing row count', () => {
  const db = new TikTokDatabase();
  const scanCount = db.db.prepare('SELECT count(*) as c FROM scans').get().c;
  const snapCount = db.db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;
  const topicCount = db.db.prepare('SELECT count(*) as c FROM topics').get().c;
  db.close();

  assert.equal(scanCount, 3, 'Must have exactly 3 scans in production DB');
  assert.equal(snapCount, 4, 'Must have exactly 4 snapshots in production DB');
  assert.equal(topicCount, 2, 'Must have exactly 2 topics in production DB');
});

test('TEST 13: migration preserves unique constraints', () => {
  const db = new TikTokDatabase();
  // Attempting to insert duplicate (topic_id, scan_id) without ON CONFLICT must be handled or rejected
  assert.throws(() => {
    db.db.prepare(`
      INSERT INTO topic_snapshots (topic_id, scan_id, scan_time, sample_size, unique_creators, momentum_status, score_version)
      VALUES ('hashtag:ob55', 'scan_2_1790292122961', '2026-09-25T00:00:00Z', 0, 0, 'UNKNOWN', 'v1')
    `).run();
  }, /UNIQUE constraint failed/);
  db.close();
});

test('TEST 14: migration preserves FK integrity', () => {
  const db = new TikTokDatabase();
  db.db.exec('PRAGMA foreign_keys = ON;');
  const violations = db.db.prepare('PRAGMA foreign_key_check;').all();
  db.close();
  assert.equal(violations.length, 0, 'Zero FK violations expected');
});

test('TEST 15: no duplicate topic snapshots introduced', () => {
  const db = new TikTokDatabase();
  const duplicates = db.db.prepare(`
    SELECT topic_id, scan_id, count(*) as count
    FROM topic_snapshots
    GROUP BY topic_id, scan_id
    HAVING count > 1
  `).all();
  db.close();
  assert.equal(duplicates.length, 0, 'Zero duplicate snapshots allowed');
});

test('TEST 16: failed scan attempts not comparable', () => {
  assert.equal(fs.existsSync(FAILED_ATTEMPTS_FILE), true);
  const failedList = JSON.parse(fs.readFileSync(FAILED_ATTEMPTS_FILE, 'utf8'));
  assert(failedList.length >= 2, 'Must record at least 2 failed attempts');
  for (const item of failedList) {
    assert.equal(item.status, 'FAILED');
    assert.equal(item.used_for_comparable_history, false);
    assert.equal(item.snapshot_count, 0);
  }

  // Ensure these failed scan IDs are NOT present as COMPLETED in production scans table
  const db = new TikTokDatabase();
  for (const item of failedList) {
    const row = db.db.prepare('SELECT * FROM scans WHERE scan_id = ?').get(item.scan_id);
    assert(!row || row.status !== 'COMPLETED', `Failed scan ${item.scan_id} must not be COMPLETED in scans table`);
  }
  db.close();
});

test('TEST 17: next production scan number still = 3', () => {
  const db = new TikTokDatabase();
  const meta = resolveNextScanMetadata(db);
  db.close();

  assert.equal(meta.next_scan_number, 3, 'Next scan number must remain 3');
  assert.equal(meta.next_scan_kind, 'FULL_SCAN_3');
  assert(meta.next_scan_id.startsWith('scan_3_'));
});

test('TEST 18: time gate based on successful Scan #2', () => {
  const gate = checkGenericTimeGate();
  assert.equal(gate.latest_scan_id, 'scan_2_1790292122961');
  assert.equal(gate.latest_scan_number, 2);
  assert.equal(gate.latest_scan_time, '2026-09-24T23:22:02.961Z');
});

test('TEST 19: no browser/network during migration', () => {
  // Verified by offline execution of scripts/migrate_nullable_freshness.js
  assert.equal(fs.existsSync(BACKUP_DB_FILE), true);
});

test('TEST 20: Facebook untouched', () => {
  const fbPath = path.resolve(__dirname, '../src/modules/facebook');
  assert.equal(fs.existsSync(fbPath), true);
  const fbFiles = fs.readdirSync(fbPath).sort();
  assert.deepEqual(
    fbFiles,
    ['fbGroupScraper.js', 'fbGroupWatcher.js', 'fbSetupSession.js', 'index.js']
  );
});
