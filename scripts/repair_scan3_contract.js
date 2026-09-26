/**
 * PHASE 4.3A: SCAN #3 DETERMINISTIC INTEGRITY REPAIR SCRIPT
 * 
 * Performs deterministic repairs on existing Scan #3:
 * 1. Marks orphan scan_3_1790320409694 as ABORTED (superseded).
 * 2. Updates topic_snapshots for OB55 and samdealruocden.
 *    - OB55: cc_observation_status = 'NOT_OBSERVED_IN_EXPOSED_ROWS'
 *    - OB55: cross_surface_points = null, momentum = null, coverage = 0.05
 * 3. Updates topics table:
 *    - OB55: last_seen preserved from Scan #2 (2026-09-24T23:22:02.961Z), last_checked_at = Scan #3 time.
 *    - samdealruocden: last_seen = Scan #3 time, last_checked_at = Scan #3 time.
 * 4. Updates data/tiktok_watchlist.json:
 *    - mylivejourney: last_checked_at = Scan #3 time, latest_check_status = 'ACCESS_RESTRICTED', status_history appended.
 * 5. Regenerates data/tiktok_results.json with full canonical contract.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { validateScanPayload } = require('../src/modules/tiktok/schema/outputContract');

const DB_PATH = path.resolve(__dirname, '../data/tiktok_trends.db');
const RESULTS_PATH = path.resolve(__dirname, '../data/tiktok_results.json');
const WATCHLIST_PATH = path.resolve(__dirname, '../data/tiktok_watchlist.json');
const CANDIDATES_PATH = path.resolve(__dirname, '../data/tiktok_candidates.json');

function repairScan3() {
  console.log('==================================================');
  console.log('🔧 RUNNING PHASE 4.3A DETERMINISTIC INTEGRITY REPAIR');
  console.log('==================================================\n');

  const db = new DatabaseSync(DB_PATH);

  // 1. Repair Orphan Scan Row
  console.log('1. Repairing orphan scan row...');
  const orphanScan = db.prepare(`SELECT * FROM scans WHERE scan_id = 'scan_3_1790320409694'`).get();
  if (orphanScan) {
    db.prepare(`
      UPDATE scans
      SET status = 'ABORTED', notes = 'Superseded before orchestration due duplicate scan initialization'
      WHERE scan_id = 'scan_3_1790320409694'
    `).run();
    console.log('   ✅ scan_3_1790320409694 marked as ABORTED.');
  }

  // 2. Repair topic_snapshots for Scan #3
  console.log('\n2. Updating topic_snapshots for Scan #3...');
  db.prepare(`
    UPDATE topic_snapshots
    SET cc_observation_status = 'NOT_OBSERVED_IN_EXPOSED_ROWS',
        cross_surface_score = NULL,
        momentum_score = NULL,
        momentum_status = 'INSUFFICIENT_DATA',
        trend_score = NULL,
        score_status = 'INSUFFICIENT_DATA'
    WHERE scan_id = 'scan_3_1790320426326' AND topic_id = 'hashtag:ob55'
  `).run();
  console.log('   ✅ hashtag:ob55 snapshot updated to NOT_OBSERVED_IN_EXPOSED_ROWS and momentum null.');

  db.prepare(`
    UPDATE topic_snapshots
    SET cc_observation_status = 'OBSERVED',
        momentum_score = 73,
        momentum_status = 'RISING',
        trend_score = NULL,
        score_status = 'INSUFFICIENT_DATA'
    WHERE scan_id = 'scan_3_1790320426326' AND topic_id = 'hashtag:samdealruocden'
  `).run();
  console.log('   ✅ hashtag:samdealruocden snapshot confirmed OBSERVED with momentum 73.');

  // 3. Repair topics table (last_seen vs last_checked_at)
  console.log('\n3. Updating topics table last_seen and last_checked_at...');
  // OB55: not positively observed in Scan 3, last_seen remains Scan 2 time (2026-09-24T23:22:02.961Z)
  db.prepare(`
    UPDATE topics
    SET last_seen = '2026-09-24T23:22:02.961Z',
        last_checked_at = '2026-09-25T07:13:46.326Z'
    WHERE topic_id = 'hashtag:ob55'
  `).run();
  console.log('   ✅ hashtag:ob55 last_seen set to Scan #2 time, last_checked_at updated to Scan #3 time.');

  // samdealruocden: positively observed in Scan 3 CC 7d (Rank 3)
  db.prepare(`
    UPDATE topics
    SET last_seen = '2026-09-25T07:13:46.326Z',
        last_checked_at = '2026-09-25T07:13:46.326Z'
    WHERE topic_id = 'hashtag:samdealruocden'
  `).run();
  console.log('   ✅ hashtag:samdealruocden last_seen and last_checked_at updated to Scan #3 time.');

  db.close();

  // 4. Update data/tiktok_watchlist.json
  console.log('\n4. Updating data/tiktok_watchlist.json for Scan #3 evaluation...');
  if (fs.existsSync(WATCHLIST_PATH)) {
    const wl = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
    const idx = wl.findIndex(w => w.candidate_key === 'hashtag:mylivejourney');
    if (idx >= 0) {
      wl[idx].last_checked_at = '2026-09-25T07:13:46.326Z';
      wl[idx].latest_check_status = 'ACCESS_RESTRICTED';
      wl[idx].status = 'RETRIEVAL_INCONCLUSIVE';
      if (!wl[idx].status_history) wl[idx].status_history = [];
      wl[idx].status_history.push({
        timestamp: '2026-09-25T07:13:46.326Z',
        status: 'RETRIEVAL_INCONCLUSIVE',
        details: 'Screening could not collect sufficient evidence because TikTok Search access was restricted.'
      });
      fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(wl, null, 2), 'utf8');
      console.log('   ✅ hashtag:mylivejourney watchlist entry updated with Scan #3 check.');
    }
  }

  // 5. Regenerate data/tiktok_results.json
  console.log('\n5. Regenerating data/tiktok_results.json with full canonical contract...');
  let sourceRuns = [];
  if (fs.existsSync(CANDIDATES_PATH)) {
    try {
      const cands = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8'));
      if (Array.isArray(cands.source_runs)) {
        sourceRuns = cands.source_runs;
      }
    } catch (_) {}
  }

  const activeWatchlist = fs.existsSync(WATCHLIST_PATH) ? JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8')) : [];

  const repairedResults = {
    platform: 'tiktok',
    market: 'VN',
    scan_id: 'scan_3_1790320426326',
    scan_number: 3,
    scan_kind: 'FULL_SCAN_3',
    scan_time: '2026-09-25T07:13:46.326Z',
    execution_status: 'COMPLETED',
    data_quality_status: 'PARTIAL',
    browser_execution_mode: 'INTERACTIVE_DESKTOP',
    topics: [
      {
        topic_id: 'hashtag:samdealruocden',
        title: 'Săn deal rước đèn TikTok Shop',
        aliases: [
          'samdealruocden',
          '#samdealruocden',
          'tiktok shop samdealruocden'
        ],
        type: 'campaign',
        first_seen: '2026-09-24T14:11:38.986Z',
        last_seen: '2026-09-25T07:13:46.326Z',
        last_checked_at: '2026-09-25T07:13:46.326Z',
        lifecycle: 'CANDIDATE',
        confidence: 'LOW',
        score: null,
        previous_score: null,
        score_delta: null,
        score_version: 'v1',
        signals: {
          sample_size: 0,
          unique_creators: 0,
          fresh_0_24h: null,
          fresh_24_72h: null,
          fresh_3_7d: null,
          older_7d: null,
          known_timestamp_count: 0,
          freshness_observation_status: 'UNAVAILABLE',
          cc_rank: 3,
          cc_posts: 22800,
          cc_views: 15200000,
          cc_source: 'creative_center_7d',
          cc_observation_status: 'OBSERVED',
          creator_spread_points: null,
          freshness_points: null,
          replication_points: null,
          replication_status: 'INSUFFICIENT_CURRENT_EVIDENCE',
          current_replication: null,
          cross_surface_points: 4,
          current_surface_count: 1,
          current_discovery_surfaces: [
            {
              surface_scope: 'market_structured',
              source: 'creative_center_7d',
              observation_id: 'hashtag:samdealruocden',
              evidence: 'Creative Center 7d rank #3'
            }
          ],
          creator_spread_score: null,
          freshness_score: null,
          replication_strength: null,
          momentum_score: 73,
          momentum_status: 'RISING',
          momentum_coverage: 0.65,
          momentum_raw_signals: {
            rank: {
              previous: 2,
              current: 3,
              delta: -1,
              normalized: 25
            },
            posts: {
              previous: 21200,
              current: 22800,
              delta: 1600,
              growth_pct: 0.07547169811320754,
              structured_metric_window: 'creative_center_7d',
              structured_delta_semantics: 'rolling_window_snapshot_delta',
              normalized: 100
            },
            views: {
              previous: 13700000,
              current: 15200000,
              delta: 1500000,
              growth_pct: 0.10948905109489052,
              structured_metric_window: 'creative_center_7d',
              structured_delta_semantics: 'rolling_window_snapshot_delta',
              normalized: 100
            },
            freshness: null,
            turnover: null,
            cross_surface: {
              previous: 1,
              current: 1,
              delta: 0,
              normalized: 50
            }
          },
          available_weight: 40,
          score_coverage: 0.40,
          score_status: 'INSUFFICIENT_DATA'
        },
        evidence: []
      },
      {
        topic_id: 'hashtag:ob55',
        title: 'Free Fire OB55 update',
        aliases: [
          'ob55',
          '#ob55',
          'free fire ob55',
          'garena free fire ob55'
        ],
        type: 'topic',
        first_seen: '2026-09-24T14:11:38.986Z',
        last_seen: '2026-09-24T23:22:02.961Z',
        last_checked_at: '2026-09-25T07:13:46.326Z',
        lifecycle: 'CANDIDATE',
        confidence: 'LOW',
        score: null,
        previous_score: null,
        score_delta: null,
        score_version: 'v1',
        signals: {
          sample_size: 0,
          unique_creators: 0,
          fresh_0_24h: null,
          fresh_24_72h: null,
          fresh_3_7d: null,
          older_7d: null,
          known_timestamp_count: 0,
          freshness_observation_status: 'UNAVAILABLE',
          cc_rank: null,
          cc_posts: null,
          cc_views: null,
          cc_source: 'creative_center_7d',
          cc_observation_status: 'NOT_OBSERVED_IN_EXPOSED_ROWS',
          creator_spread_points: null,
          freshness_points: null,
          replication_points: null,
          replication_status: 'INSUFFICIENT_CURRENT_EVIDENCE',
          current_replication: null,
          cross_surface_points: null,
          current_surface_count: 0,
          current_discovery_surfaces: [],
          creator_spread_score: null,
          freshness_score: null,
          replication_strength: null,
          momentum_score: null,
          momentum_status: 'INSUFFICIENT_DATA',
          momentum_coverage: 0.05,
          momentum_raw_signals: {
            rank: {
              previous: 3,
              current: null,
              delta: null,
              normalized: null
            },
            posts: {
              previous: 4100,
              current: null,
              delta: null,
              growth_pct: null,
              structured_metric_window: 'creative_center_7d',
              structured_delta_semantics: 'rolling_window_snapshot_delta',
              normalized: null
            },
            views: {
              previous: 75800000,
              current: null,
              delta: null,
              growth_pct: null,
              structured_metric_window: 'creative_center_7d',
              structured_delta_semantics: 'rolling_window_snapshot_delta',
              normalized: null
            },
            freshness: null,
            turnover: null,
            cross_surface: {
              previous: 1,
              current: 0,
              delta: -1,
              normalized: 0
            }
          },
          available_weight: 0,
          score_coverage: 0,
          score_status: 'INSUFFICIENT_DATA'
        },
        evidence: []
      }
    ],
    new_topics: [],
    watchlist: activeWatchlist,
    source_runs: sourceRuns,
    methodology: {
      score_version: 'v1',
      momentum_method_version: 'v1',
      lifecycle_rule_version: 'v1'
    },
    limitations: [
      'TikTok Search UI access restricted during current validation',
      'Current evidence sample unavailable for existing topics'
    ]
  };

  validateScanPayload(repairedResults);
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(repairedResults, null, 2), 'utf8');
  console.log('   ✅ data/tiktok_results.json regenerated and validated against output contract.\n');

  console.log('🎉 REPAIR COMPLETE!');
}

if (require.main === module) {
  repairScan3();
}

module.exports = { repairScan3 };
