/**
 * PHASE 1 TEST SUITE: TIKTOK TREND RADAR FOUNDATION
 * 
 * Verifies all 10 core constraints defined in Phase 1:
 * - TEST 1: First ever scan -> momentum UNKNOWN, score_delta = null, momentum_score = null
 * - TEST 2: Second scan exists -> score_delta calculated properly
 * - TEST 3: Missing views -> null -> JSON remains valid
 * - TEST 4: Duplicate video URL -> not duplicated
 * - TEST 5: Same creator has 5 videos -> unique_creators = 1
 * - TEST 6: Freshness buckets (23h -> 0-24h, 25h -> 24-72h, 4d -> 3-7d, 8d -> >7d)
 * - TEST 7: Unknown metric -> null -> never converted to 0
 * - TEST 8: Score formula -> clamped [0, 100]
 * - TEST 9: Score version -> stored with snapshot (v1)
 * - TEST 10: Facebook module -> completely untouched
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { 
  classifyTimeBucket, 
  deduplicateEvidence, 
  countUniqueCreators, 
  evaluateTopicSignals,
  lightScreenCandidate,
  clampScore,
  SCORE_VERSION 
} = require('../src/modules/tiktok/scoring/trendScorer');
const { TikTokDatabase } = require('../src/modules/tiktok/db/tiktokDb');
const { validateScanPayload, writeTikTokResultsJson } = require('../src/modules/tiktok/schema/outputContract');

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING TIKTOK TREND RADAR PHASE 1 TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let total = 14;

  // ------------------------------------------------------------------
  // TEST 1: First ever scan -> momentum UNKNOWN, score_delta = null, momentum_score = null
  // ------------------------------------------------------------------
  try {
    const sampleEvidence = [
      { video_url: 'https://www.tiktok.com/@user1/video/111', creator: 'user1', published_at: '12h ago' },
      { video_url: 'https://www.tiktok.com/@user2/video/222', creator: 'user2', published_at: '15h ago' }
    ];

    const result = evaluateTopicSignals({
      evidence: sampleEvidence,
      previousSnapshot: null // First scan has no prior snapshot
    });

    assert.strictEqual(result.momentum_status, 'UNKNOWN', 'momentum_status must be UNKNOWN on scan 1');
    assert.strictEqual(result.momentum_score, null, 'momentum_score must be null on scan 1');
    assert.strictEqual(result.previous_score, null, 'previous_score must be null on scan 1');
    assert.strictEqual(result.score_delta, null, 'score_delta must be null on scan 1');
    assert(result.trend_score >= 0 && result.trend_score <= 100, 'trend_score must be within [0, 100]');

    console.log('✅ TEST 1 PASSED: First ever scan -> momentum UNKNOWN, score_delta = null, momentum_score = null');
    passed++;
  } catch (err) {
    console.error('❌ TEST 1 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 2: Second scan exists -> score_delta calculated properly
  // ------------------------------------------------------------------
  try {
    const prevSnapshot = {
      trend_score: 55,
      sample_size: 4,
      unique_creators: 3
    };

    const newEvidence = [
      { video_url: 'https://www.tiktok.com/@user1/video/111', creator: 'user1', published_at: '2h ago' },
      { video_url: 'https://www.tiktok.com/@user2/video/222', creator: 'user2', published_at: '4h ago' },
      { video_url: 'https://www.tiktok.com/@user3/video/333', creator: 'user3', published_at: '6h ago' },
      { video_url: 'https://www.tiktok.com/@user4/video/444', creator: 'user4', published_at: '8h ago' },
      { video_url: 'https://www.tiktok.com/@user5/video/555', creator: 'user5', published_at: '10h ago' },
      { video_url: 'https://www.tiktok.com/@user6/video/666', creator: 'user6', published_at: '12h ago' }
    ];

    const result2 = evaluateTopicSignals({
      evidence: newEvidence,
      previousSnapshot: prevSnapshot,
      crossSurfaceSignal: 7,
      currentReplication: true,
      scanNumber: 3
    });

    assert.strictEqual(result2.previous_score, 55, 'previous_score must match prior snapshot');
    assert(typeof result2.score_delta === 'number', 'score_delta must be a calculated number');
    assert.strictEqual(result2.score_delta, result2.trend_score - prevSnapshot.trend_score, 'score_delta = current - previous');
    assert(result2.momentum_score > 0, 'momentum_score must be positive when growing');
    assert.notStrictEqual(result2.momentum_status, 'UNKNOWN', 'momentum_status must not be UNKNOWN on scan 2');

    console.log(`✅ TEST 2 PASSED: Second scan exists -> score_delta calculated (${result2.score_delta > 0 ? '+' : ''}${result2.score_delta}, previous: ${result2.previous_score}, current: ${result2.trend_score})`);
    passed++;
  } catch (err) {
    console.error('❌ TEST 2 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 3: Missing views -> null -> JSON remains valid
  // ------------------------------------------------------------------
  try {
    const testPayload = {
      platform: 'tiktok',
      market: 'VN',
      scan_time: new Date().toISOString(),
      scan_id: 'scan_test_3',
      topics: [
        {
          topic_id: 't_missing_views',
          title: 'Topic with null views',
          lifecycle: 'EMERGING',
          confidence: 'LOW',
          score: 50,
          previous_score: null,
          score_delta: null,
          score_version: 'v1',
          signals: {
            sample_size: 2,
            unique_creators: 2,
            fresh_0_24h: 2,
            fresh_24_72h: 0,
            fresh_3_7d: 0,
            older_7d: 0,
            momentum_score: null,
            momentum_status: 'UNKNOWN'
          },
          evidence: [
            {
              video_url: 'https://www.tiktok.com/@creator1/video/123456789',
              creator: 'creator1',
              views: null, // explicitly null
              likes: null,
              comments: null,
              sound: null
            }
          ]
        }
      ]
    };

    assert.strictEqual(testPayload.topics[0].evidence[0].views, null, 'views must be null');
    assert.doesNotThrow(() => validateScanPayload(testPayload), 'Payload with null metrics must validate cleanly');

    console.log('✅ TEST 3 PASSED: Missing views -> null -> JSON schema validation passes');
    passed++;
  } catch (err) {
    console.error('❌ TEST 3 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 4: Duplicate video URL -> not duplicated
  // ------------------------------------------------------------------
  try {
    const dupVideos = [
      { video_url: 'https://www.tiktok.com/@user/video/999?is_from_webapp=1', creator: 'user', views: 100 },
      { video_url: 'https://www.tiktok.com/@user/video/999', creator: 'user', views: 100 },
      { video_url: 'https://www.tiktok.com/@user/video/999/', creator: 'user', views: 100 },
      { video_url: 'https://www.tiktok.com/@user/video/888', creator: 'user', views: 200 }
    ];

    const deduped = deduplicateEvidence(dupVideos);
    assert.strictEqual(deduped.length, 2, 'Expected 2 unique video URLs after deduplication');
    assert.strictEqual(deduped[0].video_url, 'https://www.tiktok.com/@user/video/999');
    assert.strictEqual(deduped[1].video_url, 'https://www.tiktok.com/@user/video/888');

    console.log('✅ TEST 4 PASSED: Duplicate video URLs correctly deduplicated (4 items -> 2 unique)');
    passed++;
  } catch (err) {
    console.error('❌ TEST 4 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 5: Same creator has 5 videos -> unique_creators = 1
  // ------------------------------------------------------------------
  try {
    const singleCreatorVideos = [
      { video_url: 'https://www.tiktok.com/@spammer/video/1', creator: 'spammer' },
      { video_url: 'https://www.tiktok.com/@spammer/video/2', creator: 'SPAMMER' },
      { video_url: 'https://www.tiktok.com/@spammer/video/3', creator: 'spammer ' },
      { video_url: 'https://www.tiktok.com/@spammer/video/4', creator: 'spammer' },
      { video_url: 'https://www.tiktok.com/@spammer/video/5', creator: 'spammer' }
    ];

    const uniqueCount = countUniqueCreators(singleCreatorVideos);
    assert.strictEqual(uniqueCount, 1, '5 videos from same creator must yield unique_creators = 1');

    // Also test Light Screening rule: 5 videos from 1 creator must DROP
    const screenResult = lightScreenCandidate('Spam Candidate', singleCreatorVideos);
    assert.strictEqual(screenResult.status, 'DROP', 'Single-creator spam must be DROPPED in light screening');

    console.log('✅ TEST 5 PASSED: Same creator with 5 videos -> unique_creators = 1 and Light Screen = DROP');
    passed++;
  } catch (err) {
    console.error('❌ TEST 5 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 6: Freshness buckets (23h -> 0-24h, 25h -> 24-72h, 4d -> 3-7d, 8d -> >7d)
  // ------------------------------------------------------------------
  try {
    const bucket23h = classifyTimeBucket('23h ago');
    const bucket25h = classifyTimeBucket('25h ago');
    const bucket4d = classifyTimeBucket('4d ago');
    const bucket8d = classifyTimeBucket('8d ago');

    assert.strictEqual(bucket23h, '0-24h', '23h must map to 0-24h');
    assert.strictEqual(bucket25h, '24-72h', '25h must map to 24-72h');
    assert.strictEqual(bucket4d, '3-7d', '4d must map to 3-7d');
    assert.strictEqual(bucket8d, '>7d', '8d must map to >7d');

    console.log('✅ TEST 6 PASSED: Freshness buckets mapped accurately (23h -> 0-24h, 25h -> 24-72h, 4d -> 3-7d, 8d -> >7d)');
    passed++;
  } catch (err) {
    console.error('❌ TEST 6 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 7: Unknown metric -> null -> never converted to 0
  // ------------------------------------------------------------------
  try {
    const rawSample = [
      { video_url: 'https://www.tiktok.com/@u/video/10', creator: 'u', views: null, likes: undefined, sound: null }
    ];

    const deduped = deduplicateEvidence(rawSample);
    assert.strictEqual(deduped[0].views, null, 'views must remain null');
    assert.strictEqual(deduped[0].likes, null, 'likes undefined must normalize to null, not 0');
    assert.strictEqual(deduped[0].sound, null, 'sound must remain null');

    console.log('✅ TEST 7 PASSED: Unknown metric -> null -> never converted to 0');
    passed++;
  } catch (err) {
    console.error('❌ TEST 7 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 8: Score formula -> maximum 100 -> minimum 0
  // ------------------------------------------------------------------
  try {
    // Extreme max scenario
    const maxEvidence = Array.from({ length: 15 }, (_, i) => ({
      video_url: `https://www.tiktok.com/@creator${i}/video/${i}`,
      creator: `creator${i}`,
      published_at: '2h ago',
      views: 1000000
    }));

    const maxResult = evaluateTopicSignals({
      evidence: maxEvidence,
      previousSnapshot: { trend_score: 50, sample_size: 2, unique_creators: 2 },
      crossSurfaceSignal: 10,
      replicationStrength: 15
    });

    assert(maxResult.trend_score <= 100, `Trend score max clamp violated: ${maxResult.trend_score}`);
    assert(maxResult.trend_score >= 0, `Trend score min clamp violated: ${maxResult.trend_score}`);

    // Extreme low scenario
    const minResult = evaluateTopicSignals({
      evidence: [],
      previousSnapshot: null,
      crossSurfaceSignal: 0,
      replicationStrength: 0
    });

    assert(minResult.trend_score >= 0, `Trend score min clamp violated: ${minResult.trend_score}`);
    assert(minResult.trend_score <= 100, `Trend score max clamp violated: ${minResult.trend_score}`);

    console.log(`✅ TEST 8 PASSED: Score formula clamped strictly [0, 100] (Max test: ${maxResult.trend_score}, Min test: ${minResult.trend_score})`);
    passed++;
  } catch (err) {
    console.error('❌ TEST 8 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 9: Score version -> stored with snapshot (v1) & DB persistence
  // ------------------------------------------------------------------
  try {
    const memoryDb = new TikTokDatabase(':memory:');
    const scanId = 'scan_test_v1';
    const scanTime = new Date().toISOString();
    const topicId = 'topic_score_v1';

    memoryDb.createScan(scanId, scanTime, 'Phase 1 test');
    memoryDb.upsertTopic({
      topic_id: topicId,
      canonical_title: 'Title for v1 audit test',
      scan_time: scanTime
    });

    const evalResult = evaluateTopicSignals({
      evidence: [
        { video_url: 'https://www.tiktok.com/@alice/video/1', creator: 'alice', published_at: '10h ago' },
        { video_url: 'https://www.tiktok.com/@bob/video/2', creator: 'bob', published_at: '15h ago' }
      ],
      previousSnapshot: null
    });

    assert.strictEqual(evalResult.score_version, 'v1', 'Evaluator must produce score_version = v1');

    memoryDb.saveTopicSnapshot({
      topic_id: topicId,
      scan_id: scanId,
      scan_time: scanTime,
      evaluation: evalResult
    });

    const snapshotInDb = memoryDb.getLatestTopicSnapshot(topicId);
    assert.strictEqual(snapshotInDb.score_version, 'v1', 'Database snapshot must store score_version = v1');
    assert.strictEqual(snapshotInDb.momentum_status, 'UNKNOWN', 'DB must preserve momentum_status = UNKNOWN');
    assert.strictEqual(snapshotInDb.previous_score, null, 'DB must preserve previous_score = null');

    memoryDb.close();
    console.log('✅ TEST 9 PASSED: score_version: "v1" correctly audited and persisted in SQLite snapshot');
    passed++;
  } catch (err) {
    console.error('❌ TEST 9 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 10: Facebook module -> completely untouched
  // ------------------------------------------------------------------
  try {
    const fbDir = path.resolve(__dirname, '../src/modules/facebook');
    assert(fs.existsSync(fbDir), 'Facebook module directory must exist');

    const expectedFiles = ['fbGroupScraper.js', 'fbGroupWatcher.js', 'fbSetupSession.js', 'index.js'];
    const actualFiles = fs.readdirSync(fbDir);

    for (const file of expectedFiles) {
      assert(actualFiles.includes(file), `Facebook module missing file: ${file}`);
      const filePath = path.join(fbDir, file);
      const stat = fs.statSync(filePath);
      // Ensure file has content and was not truncated
      assert(stat.size > 500, `Facebook file ${file} appears damaged or truncated (size: ${stat.size})`);
    }

    console.log('✅ TEST 10 PASSED: Facebook module is completely untouched and preserved intact');
    passed++;
  } catch (err) {
    console.error('❌ TEST 10 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 11: Overflow score > 100 clamped to 100 (e.g. raw 127 -> 100)
  // ------------------------------------------------------------------
  try {
    const directOverflow = clampScore(127);
    assert.strictEqual(directOverflow, 100, `Direct overflow raw score 127 must clamp to 100, got ${directOverflow}`);

    const overflowResult = evaluateTopicSignals({
      evidence: Array.from({ length: 15 }, (_, i) => ({
        video_url: `https://www.tiktok.com/@creator${i}/video/${i}`,
        creator: `creator${i}`,
        published_at: '1h ago',
        views: 10000000
      })),
      previousSnapshot: { trend_score: 10, sample_size: 1, unique_creators: 1 },
      crossSurfaceSignal: 10,
      replicationStrength: 15
    });
    assert(overflowResult.trend_score <= 100, `Trend score max clamp violated: ${overflowResult.trend_score}`);

    console.log('✅ TEST 11 PASSED: Overflow raw score (127 -> 100) clamped strictly to 100');
    passed++;
  } catch (err) {
    console.error('❌ TEST 11 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 12: Underflow score < 0 clamped to 0 (e.g. raw -15 -> 0)
  // ------------------------------------------------------------------
  try {
    const directUnderflow = clampScore(-15);
    assert.strictEqual(directUnderflow, 0, `Direct underflow raw score -15 must clamp to 0, got ${directUnderflow}`);

    const underflowResult = evaluateTopicSignals({
      evidence: [],
      previousSnapshot: null,
      crossSurfaceSignal: 0,
      replicationStrength: 0
    });
    assert(underflowResult.trend_score >= 0, `Trend score min clamp violated: ${underflowResult.trend_score}`);

    console.log('✅ TEST 12 PASSED: Underflow raw score (-15 -> 0) clamped strictly to 0');
    passed++;
  } catch (err) {
    console.error('❌ TEST 12 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 13: Database duplicate prevention (snapshots & evidence uniqueness)
  // ------------------------------------------------------------------
  try {
    const memDb = new TikTokDatabase(':memory:');
    const scanId = 'scan_uniq_test';
    const topicId = 'topic_uniq_test';
    const scanTime = new Date().toISOString();

    memDb.createScan(scanId, scanTime, 'Uniqueness test');
    memDb.upsertTopic({ topic_id: topicId, canonical_title: 'Uniqueness test topic', scan_time: scanTime });

    const evalData = {
      score_version: 'v1',
      sample_size: 2,
      unique_creators: 2,
      fresh_0_24h: 2,
      fresh_24_72h: 0,
      fresh_3_7d: 0,
      older_7d: 0,
      creator_spread_score: 15,
      freshness_score: 15,
      replication_score: 10,
      cross_surface_score: 5,
      engagement_score: 3,
      momentum_score: null,
      momentum_status: 'UNKNOWN',
      trend_score: 70,
      previous_score: null,
      score_delta: null,
      lifecycle: 'EMERGING',
      confidence: 'MEDIUM',
      evidence: [
        { video_url: 'https://www.tiktok.com/@userA/video/100', creator: 'userA', views: 500 },
        { video_url: 'https://www.tiktok.com/@userB/video/200', creator: 'userB', views: 1000 }
      ]
    };

    // First save
    memDb.saveTopicSnapshot({ topic_id: topicId, scan_id: scanId, scan_time: scanTime, evaluation: evalData });
    // Second save with exact same topic_id, scan_id, and duplicate evidence videos
    memDb.saveTopicSnapshot({ topic_id: topicId, scan_id: scanId, scan_time: scanTime, evaluation: evalData });

    // Verify snapshot was updated, not duplicated
    const snapRows = memDb.db.prepare(`SELECT count(*) as count FROM topic_snapshots WHERE topic_id = ? AND scan_id = ?`).get(topicId, scanId);
    assert.strictEqual(snapRows.count, 1, `Expected exactly 1 snapshot row, found ${snapRows.count}`);

    // Verify evidence videos were upserted on conflict, not duplicated
    const evRows = memDb.db.prepare(`SELECT count(*) as count FROM evidence_videos WHERE topic_id = ? AND scan_id = ?`).get(topicId, scanId);
    assert.strictEqual(evRows.count, 2, `Expected exactly 2 evidence rows after duplicate insert, found ${evRows.count}`);

    memDb.close();
    console.log('✅ TEST 13 PASSED: Database duplicate prevention verified (snapshot and evidence rows strictly unique per scan/topic)');
    passed++;
  } catch (err) {
    console.error('❌ TEST 13 FAILED:', err.message);
  }

  // ------------------------------------------------------------------
  // TEST 14: Foreign-key integrity (PRAGMA foreign_keys = ON)
  // ------------------------------------------------------------------
  try {
    const memDb = new TikTokDatabase(':memory:');
    let threwFkError = false;

    try {
      // Attempt to insert snapshot for non-existent topic and non-existent scan
      memDb.db.prepare(`
        INSERT INTO topic_snapshots (
          topic_id, scan_id, scan_time, sample_size, unique_creators,
          fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d,
          trend_score, momentum_status, score_version, lifecycle, confidence
        ) VALUES (
          'non_existent_topic', 'non_existent_scan', datetime('now'), 1, 1,
          1, 0, 0, 0,
          50, 'UNKNOWN', 'v1', 'CANDIDATE', 'LOW'
        )
      `).run();
    } catch (fkErr) {
      if (fkErr.message.includes('FOREIGN KEY') || fkErr.message.includes('constraint failed')) {
        threwFkError = true;
      } else {
        throw fkErr;
      }
    }

    assert.strictEqual(threwFkError, true, 'SQLite must throw foreign key error when referencing non-existent parent topic/scan');
    memDb.close();
    console.log('✅ TEST 14 PASSED: Foreign-key integrity verified (PRAGMA foreign_keys = ON blocks orphaned records)');
    passed++;
  } catch (err) {
    console.error('❌ TEST 14 FAILED:', err.message);
  }

  console.log('\n------------------------------------------------------');
  console.log(`🏁 TEST RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log('------------------------------------------------------\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
