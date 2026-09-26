const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/tiktok_trends.db');
const db = new DatabaseSync(dbPath);

db.exec('BEGIN TRANSACTION;');

// 1. Update baseline freshness_observation_status to PARTIAL
db.prepare(`
  UPDATE topic_snapshots
  SET
    known_timestamp_count = (COALESCE(fresh_0_24h, 0) + COALESCE(fresh_24_72h, 0) + COALESCE(fresh_3_7d, 0) + COALESCE(older_7d, 0)),
    freshness_observation_status = 'PARTIAL'
  WHERE scan_id = 'valid_1790284478478'
`).run();

// 2. Track schema_version = 2
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

db.exec('COMMIT;');

console.log('✅ Baseline snapshots in DB:');
console.log(db.prepare('SELECT topic_id, scan_id, sample_size, unique_creators, fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d, known_timestamp_count, freshness_observation_status FROM topic_snapshots WHERE scan_id = ?').all('valid_1790284478478'));

console.log('✅ Schema version in metadata table:');
console.log(db.prepare('SELECT * FROM schema_metadata').all());

console.log('✅ User version pragma:');
console.log(db.prepare('PRAGMA user_version').get());

db.close();
