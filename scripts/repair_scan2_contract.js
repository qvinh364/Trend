/**
 * PHASE 4.1A: DETERMINISTIC RECALCULATION & CONTRACT REPAIR RUNNER
 * 
 * Recalculates Scan #2 (scan_2_1790292122961) using corrected production scorers.
 * Updates SQLite topic_snapshots transactionally without creating new scans or duplicate rows.
 * Updates data/tiktok_watchlist.json for restricted Track B candidates.
 * Regenerates data/tiktok_results.json with strict contract compliance.
 */

const fs = require('fs');
const path = require('path');
const { TikTokDatabase } = require('../src/modules/tiktok/db/tiktokDb');
const { evaluateTopicSignals } = require('../src/modules/tiktok/scoring/trendScorer');
const { validateScanPayload } = require('../src/modules/tiktok/schema/outputContract');

const SCAN_ID = 'scan_2_1790292122961';
const DB_PATH = path.resolve(__dirname, '../data/tiktok_trends.db');
const RESULTS_PATH = path.resolve(__dirname, '../data/tiktok_results.json');
const WATCHLIST_PATH = path.resolve(__dirname, '../data/tiktok_watchlist.json');
const CANDIDATES_PATH = path.resolve(__dirname, '../data/tiktok_candidates.json');
const AUDIT_PATH = path.resolve(__dirname, '../data/audit/tiktok_results_scan2_pre_contract_repair.json');

function runContractRepair() {
  console.log('==================================================');
  console.log('🚀 RUNNING PHASE 4.1A CONTRACT REPAIR FOR SCAN #2');
  console.log(`Scan ID: ${SCAN_ID}`);
  console.log('==================================================');

  // 1. Verify pre-repair audit file exists
  if (!fs.existsSync(AUDIT_PATH)) {
    throw new Error(`Pre-repair audit copy missing at: ${AUDIT_PATH}`);
  }
  console.log('✅ Pre-repair audit copy verified:', AUDIT_PATH);

  const db = new TikTokDatabase(DB_PATH);

  // 2. Verify Scan Record in SQLite
  const scanRecord = db.db.prepare('SELECT * FROM scans WHERE scan_id = ?').get(SCAN_ID);
  if (!scanRecord) {
    throw new Error(`Scan ${SCAN_ID} not found in database!`);
  }
  console.log('✅ Scan record found:', scanRecord.scan_id, scanRecord.scan_time);

  // 3. Load baseline scan and previous snapshots
  const baselineScan = db.resolveBaselineScan();
  console.log('✅ Baseline scan resolved:', baselineScan.scan_id, baselineScan.scan_time);

  const prevOb55Snapshot = db.db.prepare('SELECT * FROM topic_snapshots WHERE scan_id = ? AND topic_id = ?')
    .get(baselineScan.scan_id, 'hashtag:ob55');
  const prevSamdealSnapshot = db.db.prepare('SELECT * FROM topic_snapshots WHERE scan_id = ? AND topic_id = ?')
    .get(baselineScan.scan_id, 'hashtag:samdealruocden');

  const prevOb55Evidence = db.db.prepare('SELECT video_url, creator, published_at FROM evidence_videos WHERE scan_id = ? AND topic_id = ?')
    .all(baselineScan.scan_id, 'hashtag:ob55');
  const prevSamdealEvidence = db.db.prepare('SELECT video_url, creator, published_at FROM evidence_videos WHERE scan_id = ? AND topic_id = ?')
    .all(baselineScan.scan_id, 'hashtag:samdealruocden');

  prevOb55Snapshot.evidence = prevOb55Evidence;
  prevOb55Snapshot.ccRank = 3;
  prevOb55Snapshot.ccPosts = 4100;
  prevOb55Snapshot.ccViews = 75800000;
  prevOb55Snapshot.surfaceCount = 1;

  prevSamdealSnapshot.evidence = prevSamdealEvidence;
  prevSamdealSnapshot.ccRank = 2;
  prevSamdealSnapshot.ccPosts = 21200;
  prevSamdealSnapshot.ccViews = 13700000;
  prevSamdealSnapshot.surfaceCount = 1;

  // 4. Genuine Discovery Provenance & Raw Values for Scan #2
  // hashtag:ob55
  const ob55DiscoverySurfaces = [
    {
      surface_scope: 'market_structured',
      source: 'creative_center_7d',
      observation_id: 'hashtag:ob55',
      evidence: 'Creative Center 7d rank #3 (4.1K posts, 75.8M views)'
    }
  ];

  const evalOb55 = evaluateTopicSignals({
    evidence: [], // sample_size = 0 due to Search ACCESS_RESTRICTED
    previousSnapshot: prevOb55Snapshot,
    currentSurfaceCount: ob55DiscoverySurfaces.length, // 1 genuine surface
    currentReplication: null, // sample_size = 0 -> null
    currentCandidateExtra: {
      ccRank: 3,
      ccPosts: 4100,
      ccViews: 75800000,
      current_discovery_surfaces: ob55DiscoverySurfaces,
      current_surface_count: ob55DiscoverySurfaces.length,
      surfaceCount: ob55DiscoverySurfaces.length
    },
    scanNumber: 2
  });

  // hashtag:samdealruocden
  const samdealDiscoverySurfaces = [
    {
      surface_scope: 'market_structured',
      source: 'creative_center_7d',
      observation_id: 'hashtag:samdealruocden',
      evidence: 'Creative Center 7d rank #2 (21.2K posts, 13.7M views)'
    }
  ];

  const evalSamdeal = evaluateTopicSignals({
    evidence: [], // sample_size = 0 due to Search ACCESS_RESTRICTED
    previousSnapshot: prevSamdealSnapshot,
    currentSurfaceCount: samdealDiscoverySurfaces.length, // 1 genuine surface
    currentReplication: null, // sample_size = 0 -> null
    currentCandidateExtra: {
      ccRank: 2,
      ccPosts: 21200,
      ccViews: 13700000,
      current_discovery_surfaces: samdealDiscoverySurfaces,
      current_surface_count: samdealDiscoverySurfaces.length,
      surfaceCount: samdealDiscoverySurfaces.length
    },
    scanNumber: 2
  });

  // Enforce invariants: previous_score and score_delta MUST be null
  evalOb55.previous_score = null;
  evalOb55.score_delta = null;
  evalSamdeal.previous_score = null;
  evalSamdeal.score_delta = null;

  console.log('\n📊 Recalculated Signals:');
  console.log('   * hashtag:ob55:');
  console.log(`     - sample_size: ${evalOb55.sample_size}, unique_creators: ${evalOb55.unique_creators}`);
  console.log(`     - creator_spread_points: ${evalOb55.creator_spread_points}, freshness_points: ${evalOb55.freshness_points}`);
  console.log(`     - replication_points: ${evalOb55.replication_points}, replication_status: ${evalOb55.replication_status}`);
  console.log(`     - cross_surface_points: ${evalOb55.cross_surface_points} (surfaces: ${evalOb55.current_surface_count})`);
  console.log(`     - momentum_score: ${evalOb55.momentum_score}, momentum_status: ${evalOb55.momentum_status}`);
  console.log(`     - available_weight: ${evalOb55.available_weight}, score_coverage: ${evalOb55.score_coverage}`);
  console.log(`     - trend_score: ${evalOb55.trend_score}, score_status: ${evalOb55.score_status}`);
  console.log(`     - lifecycle: ${evalOb55.lifecycle}, confidence: ${evalOb55.confidence}`);

  console.log('   * hashtag:samdealruocden:');
  console.log(`     - sample_size: ${evalSamdeal.sample_size}, unique_creators: ${evalSamdeal.unique_creators}`);
  console.log(`     - creator_spread_points: ${evalSamdeal.creator_spread_points}, freshness_points: ${evalSamdeal.freshness_points}`);
  console.log(`     - replication_points: ${evalSamdeal.replication_points}, replication_status: ${evalSamdeal.replication_status}`);
  console.log(`     - cross_surface_points: ${evalSamdeal.cross_surface_points} (surfaces: ${evalSamdeal.current_surface_count})`);
  console.log(`     - momentum_score: ${evalSamdeal.momentum_score}, momentum_status: ${evalSamdeal.momentum_status}`);
  console.log(`     - available_weight: ${evalSamdeal.available_weight}, score_coverage: ${evalSamdeal.score_coverage}`);
  console.log(`     - trend_score: ${evalSamdeal.trend_score}, score_status: ${evalSamdeal.score_status}`);
  console.log(`     - lifecycle: ${evalSamdeal.lifecycle}, confidence: ${evalSamdeal.confidence}`);

  // 5. Transactional Database Update
  console.log('\n💾 Executing SQLite Transactional Snapshot Update...');
  const countScansBefore = db.db.prepare('SELECT count(*) as c FROM scans').get().c;
  const countSnapshotsBefore = db.db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;

  db.db.exec('BEGIN TRANSACTION;');

  try {
    const updateStmt = db.db.prepare(`
      UPDATE topic_snapshots
      SET
        sample_size = ?,
        unique_creators = ?,
        fresh_0_24h = ?,
        fresh_24_72h = ?,
        fresh_3_7d = ?,
        older_7d = ?,
        known_timestamp_count = ?,
        freshness_observation_status = ?,
        cc_rank = ?,
        cc_posts = ?,
        cc_views = ?,
        cc_source = ?,
        cc_observation_status = ?,
        creator_spread_score = ?,
        freshness_score = ?,
        replication_score = ?,
        cross_surface_score = ?,
        engagement_score = ?,
        momentum_score = ?,
        momentum_status = ?,
        trend_score = ?,
        previous_score = ?,
        score_delta = ?,
        score_version = ?,
        lifecycle = ?,
        confidence = ?,
        score_status = ?
      WHERE scan_id = ? AND topic_id = ?
    `);

    // Update hashtag:ob55
    updateStmt.run(
      evalOb55.sample_size,
      evalOb55.unique_creators,
      evalOb55.fresh_0_24h,
      evalOb55.fresh_24_72h,
      evalOb55.fresh_3_7d,
      evalOb55.older_7d,
      evalOb55.known_timestamp_count,
      evalOb55.freshness_observation_status,
      3,                             // cc_rank
      4100,                          // cc_posts
      75800000,                      // cc_views
      'creative_center_7d',          // cc_source
      'OBSERVED',                    // cc_observation_status
      evalOb55.creator_spread_score, // null
      evalOb55.freshness_score,      // null
      evalOb55.replication_score,    // null
      evalOb55.cross_surface_score,  // 4
      null,                          // engagement null
      evalOb55.momentum_score,       // 56
      evalOb55.momentum_status,      // STABLE_OR_GROWING
      evalOb55.trend_score,          // null
      evalOb55.previous_score,       // null
      evalOb55.score_delta,          // null
      evalOb55.score_version,        // 'v1'
      evalOb55.lifecycle,            // 'CANDIDATE'
      evalOb55.confidence,           // 'LOW'
      evalOb55.score_status,         // 'INSUFFICIENT_DATA'
      SCAN_ID,
      'hashtag:ob55'
    );

    // Update hashtag:samdealruocden
    updateStmt.run(
      evalSamdeal.sample_size,
      evalSamdeal.unique_creators,
      evalSamdeal.fresh_0_24h,
      evalSamdeal.fresh_24_72h,
      evalSamdeal.fresh_3_7d,
      evalSamdeal.older_7d,
      evalSamdeal.known_timestamp_count,
      evalSamdeal.freshness_observation_status,
      2,                             // cc_rank
      21200,                         // cc_posts
      13700000,                      // cc_views
      'creative_center_7d',          // cc_source
      'OBSERVED',                    // cc_observation_status
      evalSamdeal.creator_spread_score, // null
      evalSamdeal.freshness_score,      // null
      evalSamdeal.replication_score,    // null
      evalSamdeal.cross_surface_score,  // 4
      null,                             // engagement null
      evalSamdeal.momentum_score,       // 56
      evalSamdeal.momentum_status,      // STABLE_OR_GROWING
      evalSamdeal.trend_score,          // null
      evalSamdeal.previous_score,       // null
      evalSamdeal.score_delta,          // null
      evalSamdeal.score_version,        // 'v1'
      evalSamdeal.lifecycle,            // 'CANDIDATE'
      evalSamdeal.confidence,           // 'LOW'
      evalSamdeal.score_status,         // 'INSUFFICIENT_DATA'
      SCAN_ID,
      'hashtag:samdealruocden'
    );

    db.db.exec('COMMIT;');
    console.log('✅ SQLite transaction committed successfully.');
  } catch (txErr) {
    db.db.exec('ROLLBACK;');
    throw new Error(`Database transaction failed and was rolled back: ${txErr.message}`);
  }

  // Verify DB snapshot row counts
  const countScansAfter = db.db.prepare('SELECT count(*) as c FROM scans').get().c;
  const countSnapshotsAfter = db.db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;

  if (countScansBefore !== countScansAfter) {
    throw new Error(`Scan row count changed! Before: ${countScansBefore}, After: ${countScansAfter}`);
  }
  if (countSnapshotsBefore !== countSnapshotsAfter) {
    throw new Error(`Snapshot row count changed! Before: ${countSnapshotsBefore}, After: ${countSnapshotsAfter}`);
  }
  console.log(`✅ Database row counts invariant verified (Scans: ${countScansAfter}, Snapshots: ${countSnapshotsAfter}).`);

  // Verify first_seen preservation
  const ob55Topic = db.db.prepare('SELECT * FROM topics WHERE topic_id = ?').get('hashtag:ob55');
  const samdealTopic = db.db.prepare('SELECT * FROM topics WHERE topic_id = ?').get('hashtag:samdealruocden');
  if (ob55Topic.first_seen !== '2026-09-24T14:11:38.986Z' || samdealTopic.first_seen !== '2026-09-24T14:11:38.986Z') {
    throw new Error('first_seen was modified in topics table!');
  }
  console.log('✅ Topic first_seen values preserved intact:', ob55Topic.first_seen);

  // 6. Track B Restricted Candidates -> INCONCLUSIVE in Watchlist
  console.log('\n🧭 Processing Track B Access-Restricted Candidates...');
  let watchlist = [];
  if (fs.existsSync(WATCHLIST_PATH)) {
    try {
      watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
    } catch (_) {}
  }

  const restrictedTrackBCandidates = [
    { candidate_key: 'hashtag:mylivejourney', canonical_label: 'mylivejourney' },
    { candidate_key: 'topic:59.8k vũ trụ ai', canonical_label: '59.8k vũ trụ ai' },
    { candidate_key: 'topic:59.8k', canonical_label: '59.8k' },
    { candidate_key: 'topic:vũ trụ ai', canonical_label: 'vũ trụ ai' },
    { candidate_key: 'topic:123.5k hari won(원하리)', canonical_label: '123.5k hari won(원하리)' }
  ];

  const restrictedReason = 'Screening could not collect sufficient evidence because TikTok Search access was restricted.';

  for (const cand of restrictedTrackBCandidates) {
    const idx = watchlist.findIndex(w => w.candidate_key === cand.candidate_key);
    if (idx >= 0) {
      watchlist[idx].status = 'INCONCLUSIVE';
      watchlist[idx].reason = restrictedReason;
      watchlist[idx].sample_size_at_screening = 0;
      watchlist[idx].last_checked_at = scanRecord.scan_time;
      watchlist[idx].recheck_on_next_discovery = true;
    } else {
      watchlist.push({
        candidate_key: cand.candidate_key,
        canonical_label: cand.canonical_label,
        status: 'INCONCLUSIVE',
        reason: restrictedReason,
        sample_size_at_screening: 0,
        last_checked_at: scanRecord.scan_time,
        recheck_on_next_discovery: true
      });
    }
  }

  fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(watchlist, null, 2), 'utf8');
  console.log(`✅ Updated watchlist with ${restrictedTrackBCandidates.length} INCONCLUSIVE candidates.`);

  // 7. Regenerate data/tiktok_results.json
  console.log('\n📄 Regenerating data/tiktok_results.json...');
  const repairedPayload = {
    platform: 'tiktok',
    market: 'VN',
    scan_id: SCAN_ID,
    scan_time: scanRecord.scan_time,
    calculation_repaired_at: new Date().toISOString(),
    calculation_repair_reason: 'Phase 4.1 null semantics and V1 scoring contract alignment',
    score_version: 'v1',
    scan_quality: 'PARTIAL',
    data_coverage_status: 'PARTIAL',
    limitations: [
      'TikTok Search UI access restricted during current validation',
      'Current evidence sample unavailable for existing topics'
    ],
    topics: [
      {
        topic_id: 'hashtag:ob55',
        title: ob55Topic.canonical_title,
        aliases: JSON.parse(ob55Topic.aliases_json || '[]'),
        type: ob55Topic.type,
        first_seen: ob55Topic.first_seen,
        last_seen: scanRecord.scan_time,
        lifecycle: evalOb55.lifecycle,
        confidence: evalOb55.confidence,
        score: evalOb55.trend_score,
        previous_score: evalOb55.previous_score,
        score_delta: evalOb55.score_delta,
        score_version: evalOb55.score_version,
        signals: {
          sample_size: evalOb55.sample_size,
          unique_creators: evalOb55.unique_creators,
          fresh_0_24h: evalOb55.fresh_0_24h,
          fresh_24_72h: evalOb55.fresh_24_72h,
          fresh_3_7d: evalOb55.fresh_3_7d,
          older_7d: evalOb55.older_7d,
          known_timestamp_count: evalOb55.known_timestamp_count,
          unknown_timestamp_count: evalOb55.unknown_timestamp_count,
          freshness_timestamp_coverage: evalOb55.freshness_timestamp_coverage,
          freshness_observation_status: evalOb55.freshness_observation_status,
          creator_spread_points: evalOb55.creator_spread_points,
          freshness_points: evalOb55.freshness_points,
          replication_points: evalOb55.replication_points,
          replication_status: evalOb55.replication_status,
          current_replication: evalOb55.current_replication,
          cross_surface_points: evalOb55.cross_surface_points,
          current_surface_count: evalOb55.current_surface_count,
          current_discovery_surfaces: ob55DiscoverySurfaces,
          creator_spread_score: evalOb55.creator_spread_score,
          freshness_score: evalOb55.freshness_score,
          replication_strength: evalOb55.replication_score,
          momentum_score: evalOb55.momentum_score,
          momentum_status: evalOb55.momentum_status,
          momentum_coverage: evalOb55.momentum_coverage_audit ? evalOb55.momentum_coverage_audit.momentum_coverage : null,
          momentum_raw_signals: evalOb55.momentum_raw_signals,
          available_weight: evalOb55.available_weight,
          score_coverage: evalOb55.score_coverage,
          score_status: evalOb55.score_status
        },
        evidence: evalOb55.evidence
      },
      {
        topic_id: 'hashtag:samdealruocden',
        title: samdealTopic.canonical_title,
        aliases: JSON.parse(samdealTopic.aliases_json || '[]'),
        type: samdealTopic.type,
        first_seen: samdealTopic.first_seen,
        last_seen: scanRecord.scan_time,
        lifecycle: evalSamdeal.lifecycle,
        confidence: evalSamdeal.confidence,
        score: evalSamdeal.trend_score,
        previous_score: evalSamdeal.previous_score,
        score_delta: evalSamdeal.score_delta,
        score_version: evalSamdeal.score_version,
        signals: {
          sample_size: evalSamdeal.sample_size,
          unique_creators: evalSamdeal.unique_creators,
          fresh_0_24h: evalSamdeal.fresh_0_24h,
          fresh_24_72h: evalSamdeal.fresh_24_72h,
          fresh_3_7d: evalSamdeal.fresh_3_7d,
          older_7d: evalSamdeal.older_7d,
          known_timestamp_count: evalSamdeal.known_timestamp_count,
          unknown_timestamp_count: evalSamdeal.unknown_timestamp_count,
          freshness_timestamp_coverage: evalSamdeal.freshness_timestamp_coverage,
          freshness_observation_status: evalSamdeal.freshness_observation_status,
          creator_spread_points: evalSamdeal.creator_spread_points,
          freshness_points: evalSamdeal.freshness_points,
          replication_points: evalSamdeal.replication_points,
          replication_status: evalSamdeal.replication_status,
          current_replication: evalSamdeal.current_replication,
          cross_surface_points: evalSamdeal.cross_surface_points,
          current_surface_count: evalSamdeal.current_surface_count,
          current_discovery_surfaces: samdealDiscoverySurfaces,
          creator_spread_score: evalSamdeal.creator_spread_score,
          freshness_score: evalSamdeal.freshness_score,
          replication_strength: evalSamdeal.replication_score,
          momentum_score: evalSamdeal.momentum_score,
          momentum_status: evalSamdeal.momentum_status,
          momentum_coverage: evalSamdeal.momentum_coverage_audit ? evalSamdeal.momentum_coverage_audit.momentum_coverage : null,
          momentum_raw_signals: evalSamdeal.momentum_raw_signals,
          available_weight: evalSamdeal.available_weight,
          score_coverage: evalSamdeal.score_coverage,
          score_status: evalSamdeal.score_status
        },
        evidence: evalSamdeal.evidence
      }
    ]
  };

  validateScanPayload(repairedPayload);
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(repairedPayload, null, 2), 'utf8');
  console.log('✅ data/tiktok_results.json successfully updated and validated.');

  // 8. Read back DB & JSON and verify strict consistency
  const readBackJson = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
  const dbSnapOb55 = db.db.prepare('SELECT * FROM topic_snapshots WHERE scan_id = ? AND topic_id = ?').get(SCAN_ID, 'hashtag:ob55');
  const dbSnapSamdeal = db.db.prepare('SELECT * FROM topic_snapshots WHERE scan_id = ? AND topic_id = ?').get(SCAN_ID, 'hashtag:samdealruocden');

  const jsonOb55 = readBackJson.topics.find(t => t.topic_id === 'hashtag:ob55');
  const jsonSamdeal = readBackJson.topics.find(t => t.topic_id === 'hashtag:samdealruocden');

  if (dbSnapOb55.trend_score !== jsonOb55.score) throw new Error('DB vs JSON mismatch for ob55 trend_score');
  if (dbSnapOb55.momentum_score !== jsonOb55.signals.momentum_score) throw new Error('DB vs JSON mismatch for ob55 momentum_score');
  if (dbSnapOb55.momentum_status !== jsonOb55.signals.momentum_status) throw new Error('DB vs JSON mismatch for ob55 momentum_status');
  if (dbSnapOb55.lifecycle !== jsonOb55.lifecycle) throw new Error('DB vs JSON mismatch for ob55 lifecycle');

  if (dbSnapSamdeal.trend_score !== jsonSamdeal.score) throw new Error('DB vs JSON mismatch for samdeal trend_score');
  if (dbSnapSamdeal.momentum_score !== jsonSamdeal.signals.momentum_score) throw new Error('DB vs JSON mismatch for samdeal momentum_score');
  if (dbSnapSamdeal.momentum_status !== jsonSamdeal.signals.momentum_status) throw new Error('DB vs JSON mismatch for samdeal momentum_status');
  if (dbSnapSamdeal.lifecycle !== jsonSamdeal.lifecycle) throw new Error('DB vs JSON mismatch for samdeal lifecycle');

  console.log('✅ Database <-> JSON consistency 100% verified.');
  db.close();

  console.log('\n==================================================');
  console.log('🎉 PHASE 4.1A CONTRACT REPAIR COMPLETED SUCCESSFULLY');
  console.log('==================================================');

  return {
    success: true,
    scan_id: SCAN_ID,
    ob55: jsonOb55,
    samdeal: jsonSamdeal,
    trackB_repaired: restrictedTrackBCandidates.length
  };
}

if (require.main === module) {
  runContractRepair();
}

module.exports = { runContractRepair };
