/**
 * TIKTOK WATCHLIST MANAGER & HYGIENE MODULE (PHASE 4.2)
 * 
 * Rules:
 * A1. Metric-only candidates (e.g. "59.8K") -> status "REMOVED_NOISE", removed from active watchlist.
 * A2. Metric prefix candidates (e.g. "59.8k vũ trụ ai") -> normalized and merged into canonical "topic:vũ trụ ai".
 * A3. DOM context metric prefixes (e.g. "123.5k hari won(원하리)") -> normalized to "topic:hari won(원하리)".
 * A4. Preserve history for "hashtag:mylivejourney" (status: "RETRIEVAL_INCONCLUSIVE", latest_check_status: "ACCESS_RESTRICTED").
 * A5. Standardized watchlist schema with aliases, provenance, and status_history.
 */

const fs = require('fs');
const path = require('path');
const { cleanLabel, isMetricToken } = require('../discovery/candidateNormalizer');

const DEFAULT_WATCHLIST_PATH = path.resolve(__dirname, '../../../../data/tiktok_watchlist.json');
const DEFAULT_NOISE_ARCHIVE_PATH = path.resolve(__dirname, '../../../../data/audit/tiktok_watchlist_noise_archive.json');

/**
 * Normalizes a candidate entry and classifies hygiene action
 * @param {Object} entry 
 * @returns {Object} { action: 'KEEP'|'MERGE'|'REMOVE_NOISE', entry }
 */
function evaluateWatchlistHygiene(entry) {
  const rawKey = entry.candidate_key || '';
  const rawLabel = entry.canonical_label || '';

  // Rule A1: Metric-only candidate
  if (isMetricToken(rawLabel) || isMetricToken(rawKey.replace(/^[a-z_]+:/, ''))) {
    return {
      action: 'REMOVE_NOISE',
      reason: `Label "${rawLabel}" is solely a DOM engagement metric token`,
      entry: {
        ...entry,
        status: 'REMOVED_NOISE'
      }
    };
  }

  // Check if label has leading metric prefix
  const cleaned = cleanLabel(rawLabel);

  return {
    action: 'KEEP',
    normalized_label: cleaned,
    entry
  };
}

/**
 * Perform complete hygiene cleanup on watchlist
 * @param {Array} rawList 
 * @returns {{ activeWatchlist: Array, removedNoise: Array, mergedCount: number }}
 */
function cleanWatchlist(rawList = []) {
  const activeMap = new Map();
  const removedNoise = [];
  let mergedCount = 0;

  for (const item of rawList) {
    const rawKey = item.candidate_key || '';
    const rawLabel = item.canonical_label || '';

    // Rule A1: Check metric-only noise
    if (isMetricToken(rawLabel) || isMetricToken(rawKey.replace(/^[a-z_]+:/, ''))) {
      removedNoise.push({
        candidate_key: rawKey,
        canonical_label: rawLabel,
        status: 'REMOVED_NOISE',
        reason: `Removed as standalone engagement metric token ("${rawLabel}")`,
        removed_at: new Date().toISOString(),
        original_entry: item
      });
      continue;
    }

    // Rule A4: Preserve mylivejourney status and history
    if (rawKey === 'hashtag:mylivejourney') {
      const history = item.status_history || [
        {
          timestamp: '2026-09-24T14:11:38.986Z',
          status: 'DISCOVERED',
          source: 'creative_center_7d',
          details: 'Creative Center 7d rank #1 (13.4K posts, 23.2M views)'
        },
        {
          timestamp: '2026-09-24T21:09:59.000Z',
          status: 'RETRIEVAL_INCONCLUSIVE',
          source: 'search_reconciliation',
          details: 'TikTok Web không trả về kết quả hoặc bị hạn chế truy xuất cho hashtag #mylivejourney trên môi trường desktop hiện tại.'
        },
        {
          timestamp: item.last_checked_at || '2026-09-24T23:22:02.961Z',
          status: 'ACCESS_RESTRICTED',
          source: 'scan_2_validation',
          details: 'Screening could not collect sufficient evidence because TikTok Search access was restricted.'
        }
      ];

      activeMap.set(rawKey, {
        candidate_key: 'hashtag:mylivejourney',
        canonical_label: 'mylivejourney',
        status: 'RETRIEVAL_INCONCLUSIVE',
        latest_check_status: 'ACCESS_RESTRICTED',
        reason: item.reason || 'Screening could not collect sufficient evidence because TikTok Search access was restricted.',
        first_seen: item.first_seen || '2026-09-24T14:11:38.986Z',
        last_checked_at: item.last_checked_at || '2026-09-24T23:22:02.961Z',
        recheck_on_next_discovery: true,
        aliases: ['mylivejourney', '#mylivejourney'],
        provenance: [
          { surface_scope: 'market_structured', source: 'creative_center_7d', observation_id: 'hashtag:mylivejourney' }
        ],
        status_history: history
      });
      continue;
    }

    // Rule A2 & A3: Clean metric prefixes
    const typeHint = rawKey.includes(':') ? rawKey.split(':')[0] : 'topic';
    const normLabel = cleanLabel(rawLabel);
    const canonicalKey = `${typeHint}:${normLabel}`;

    const initialHistory = item.status_history || [
      {
        timestamp: item.last_checked_at || new Date().toISOString(),
        status: item.status || 'INCONCLUSIVE',
        details: item.reason || 'Screening inconclusive'
      }
    ];

    if (activeMap.has(canonicalKey)) {
      // Merge with existing canonical item
      mergedCount++;
      const existing = activeMap.get(canonicalKey);
      const combinedAliases = Array.from(new Set([...(existing.aliases || []), rawLabel, normLabel])).filter(Boolean);
      const combinedProvenance = [...(existing.provenance || []), {
        source_label: rawLabel,
        source_key: rawKey,
        merged_at: new Date().toISOString()
      }];

      existing.aliases = combinedAliases;
      existing.provenance = combinedProvenance;
      existing.status_history = [...(existing.status_history || []), ...initialHistory];
      activeMap.set(canonicalKey, existing);
    } else {
      activeMap.set(canonicalKey, {
        candidate_key: canonicalKey,
        canonical_label: normLabel,
        status: item.status || 'INCONCLUSIVE',
        latest_check_status: item.latest_check_status || (item.reason && item.reason.includes('restricted') ? 'ACCESS_RESTRICTED' : item.status),
        reason: item.reason || 'Screening inconclusive',
        first_seen: item.first_seen || item.last_checked_at || new Date().toISOString(),
        last_checked_at: item.last_checked_at || new Date().toISOString(),
        recheck_on_next_discovery: true,
        aliases: Array.from(new Set([rawLabel, normLabel])).filter(Boolean),
        provenance: [
          { surface_scope: 'authenticated_personalized', source: 'tiktok_explore', original_key: rawKey, original_label: rawLabel }
        ],
        status_history: initialHistory
      });
    }
  }

  return {
    activeWatchlist: Array.from(activeMap.values()),
    removedNoise,
    mergedCount
  };
}

/**
 * Execute hygiene on production watchlist files
 */
function applyWatchlistHygiene(watchlistPath = DEFAULT_WATCHLIST_PATH, noiseArchivePath = DEFAULT_NOISE_ARCHIVE_PATH) {
  if (!fs.existsSync(watchlistPath)) {
    return { activeWatchlist: [], removedNoise: [], mergedCount: 0 };
  }

  const raw = JSON.parse(fs.readFileSync(watchlistPath, 'utf8'));
  const { activeWatchlist, removedNoise, mergedCount } = cleanWatchlist(raw);

  // Archive noise
  const archiveDir = path.dirname(noiseArchivePath);
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(noiseArchivePath, JSON.stringify(removedNoise, null, 2), 'utf8');

  // Overwrite active watchlist
  fs.writeFileSync(watchlistPath, JSON.stringify(activeWatchlist, null, 2), 'utf8');

  return {
    activeWatchlist,
    removedNoise,
    mergedCount
  };
}

module.exports = {
  DEFAULT_WATCHLIST_PATH,
  DEFAULT_NOISE_ARCHIVE_PATH,
  evaluateWatchlistHygiene,
  cleanWatchlist,
  applyWatchlistHygiene
};
