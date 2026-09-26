/**
 * PHASE 4.2B: NULL-SAFE SNAPSHOT SCHEMA MIGRATION
 * 
 * Rebuilds topic_snapshots table in data/tiktok_trends.db to:
 * 1. Allow NULL in freshness count columns (fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d).
 * 2. Add known_timestamp_count (INTEGER) and freshness_observation_status (TEXT).
 * 3. Update Scan #2 to store true NULL freshness semantics with freshness_observation_status = 'UNAVAILABLE'.
 * 4. Verify foreign key integrity and row counts within a single atomic transaction.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.resolve(__dirname, '../data/tiktok_trends.db');
const BACKUP_PATH = path.resolve(__dirname, '../data/audit/tiktok_trends_pre_nullable_freshness_migration.db');

function runMigration() {
  console.log('==================================================');
  console.log('🚀 RUNNING PHASE 4.2B NULL-SAFE SCHEMA MIGRATION');
  console.log(`Database: ${DB_PATH}`);
  console.log('==================================================\n');

  // 1. Verify backup exists
  if (!fs.existsSync(BACKUP_PATH)) {
    throw new Error(`Migration halted: pre-migration backup missing at ${BACKUP_PATH}`);
  }
  console.log(`✅ Pre-migration backup verified at: ${BACKUP_PATH}`);

  const db = new DatabaseSync(DB_PATH);

  // 2. Check if migration is already applied (idempotency guard)
  let alreadyMigrated = false;
  try {
    const pragmaVer = db.prepare('PRAGMA user_version').get().user_version;
    if (pragmaVer >= 2) {
      alreadyMigrated = true;
    }
  } catch (_) {}

  if (!alreadyMigrated) {
    try {
      const tableInfo = db.prepare('PRAGMA table_info(topic_snapshots)').all();
      const hasStatus = tableInfo.some(c => c.name === 'freshness_observation_status');
      const fresh0 = tableInfo.find(c => c.name === 'fresh_0_24h');
      if (hasStatus && fresh0 && fresh0.notnull === 0) {
        alreadyMigrated = true;
      }
    } catch (_) {}
  }

  if (alreadyMigrated) {
    console.log('⚡ Schema already migrated to version 2 (Null-safe freshness). Migration not needed.');
    db.close();
    return { status: 'MIGRATION_NOT_NEEDED', schema_version: 2 };
  }

  // 3. Count rows before migration
  const countBefore = db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;
  console.log(`📊 topic_snapshots row count before migration: ${countBefore}`);

  // 4. Execute atomic table rebuild migration
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');

  try {
    // 3a. Create topic_snapshots_new with nullable freshness columns + availability semantics
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

    // 3b. Copy existing rows
    db.exec(`
      INSERT INTO topic_snapshots_new (
        id, topic_id, scan_id, scan_time, sample_size, unique_creators,
        fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d,
        known_timestamp_count, freshness_observation_status,
        creator_spread_score, freshness_score, replication_score,
        cross_surface_score, engagement_score, momentum_score,
        momentum_status, trend_score, previous_score, score_delta,
        score_version, lifecycle, confidence, score_status,
        why_now_json, repeated_narratives_json, related_searches_json
      ) SELECT
        id, topic_id, scan_id, scan_time, sample_size, unique_creators,
        fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d,
        0, 'AVAILABLE',
        creator_spread_score, freshness_score, replication_score,
        cross_surface_score, engagement_score, momentum_score,
        momentum_status, trend_score, previous_score, score_delta,
        score_version, lifecycle, confidence, score_status,
        why_now_json, repeated_narratives_json, related_searches_json
      FROM topic_snapshots;
    `);

    // 3c. Drop old table and rename new table
    db.exec('DROP TABLE topic_snapshots;');
    db.exec('ALTER TABLE topic_snapshots_new RENAME TO topic_snapshots;');

    // 3d. Recreate indexes
    db.exec('CREATE INDEX IF NOT EXISTS idx_snapshots_topic ON topic_snapshots(topic_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_snapshots_scan ON topic_snapshots(scan_id);');

    // 3e. Update Scan #2 rows to preserve true NULL semantics (measurement unavailable)
    db.prepare(`
      UPDATE topic_snapshots
      SET
        fresh_0_24h = NULL,
        fresh_24_72h = NULL,
        fresh_3_7d = NULL,
        older_7d = NULL,
        known_timestamp_count = 0,
        freshness_observation_status = 'UNAVAILABLE'
      WHERE scan_id = 'scan_2_1790292122961'
    `).run();

    // 3f. Update Scan #1 (baseline) rows to record observed timestamp count and accurate PARTIAL status
    db.prepare(`
      UPDATE topic_snapshots
      SET
        known_timestamp_count = (COALESCE(fresh_0_24h, 0) + COALESCE(fresh_24_72h, 0) + COALESCE(fresh_3_7d, 0) + COALESCE(older_7d, 0)),
        freshness_observation_status = CASE
          WHEN (COALESCE(fresh_0_24h, 0) + COALESCE(fresh_24_72h, 0) + COALESCE(fresh_3_7d, 0) + COALESCE(older_7d, 0)) = sample_size THEN 'AVAILABLE'
          WHEN (COALESCE(fresh_0_24h, 0) + COALESCE(fresh_24_72h, 0) + COALESCE(fresh_3_7d, 0) + COALESCE(older_7d, 0)) > 0 THEN 'PARTIAL'
          ELSE 'UNAVAILABLE'
        END
      WHERE scan_id = 'valid_1790284478478'
    `).run();

    // 3g. Track schema version 2
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO schema_metadata (key, value, updated_at)
      VALUES ('schema_version', '2', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
      PRAGMA user_version = 2;
    `);

    // 3h. Verify row count
    const countAfter = db.prepare('SELECT count(*) as c FROM topic_snapshots').get().c;
    console.log(`📊 topic_snapshots row count after migration:  ${countAfter}`);
    if (countAfter !== countBefore) {
      throw new Error(`Row count mismatch: before=${countBefore}, after=${countAfter}`);
    }

    // 3i. Foreign key check
    db.exec('PRAGMA foreign_keys = ON;');
    const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
    if (fkViolations.length > 0) {
      throw new Error(`Foreign key check failed: ${JSON.stringify(fkViolations)}`);
    }
    console.log('✅ Foreign key check passed: 0 violations.');

    db.exec('COMMIT;');
    console.log('✅ Migration committed successfully.\n');
  } catch (err) {
    db.exec('ROLLBACK;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.close();
    console.error('❌ Migration failed, transaction rolled back:', err.message);
    throw err;
  }

  // 4. Verify Scan #2 semantics
  const scan2Snapshots = db.prepare(`
    SELECT topic_id, scan_id, sample_size, unique_creators,
           fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d,
           known_timestamp_count, freshness_observation_status,
           momentum_score, momentum_status, trend_score, score_status
    FROM topic_snapshots
    WHERE scan_id = 'scan_2_1790292122961'
  `).all();

  console.log('🔍 Verified Scan #2 Snapshots:');
  console.log(JSON.stringify(scan2Snapshots, null, 2));

  db.close();
  return { success: true, countBefore, countAfter: countBefore };
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
