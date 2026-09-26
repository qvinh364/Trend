const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/tiktok_trends.db');
const db = new DatabaseSync(dbPath);

const earliestDiscoveryTime = '2026-09-24T14:11:38.986Z';

db.prepare("UPDATE topics SET first_seen = ? WHERE topic_id IN ('hashtag:ob55', 'hashtag:samdealruocden')")
  .run(earliestDiscoveryTime);

const updated = db.prepare('SELECT topic_id, canonical_title, first_seen, last_seen FROM topics').all();
console.log('Audited topics in SQLite:');
console.log(JSON.stringify(updated, null, 2));
