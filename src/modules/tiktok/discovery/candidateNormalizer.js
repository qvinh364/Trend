/**
 * TIKTOK CANDIDATE NORMALIZER & PRIMITIVES
 */

const GENERIC_BLACKLIST = new Set([
  'fyp', 'foryou', 'foryoupage', 'viral', 'xuhuong', 'xuhuongtiktok', 
  'trending', 'tiktok', 'trend', 'capcut', 'viralvideo', 'xh', 'dcgr', 
  'haihuoc', 'giaitri', 'review', 'vlog', 'dance', 'xuhuong2026', 'thinhhanh',
  'others searched for', 'mọi người cũng tìm kiếm', 'others searched'
]);

/**
 * Checks if a string is a standalone engagement metric token (e.g. "59.8K", "123.5K", "1.2M")
 */
function isMetricToken(str) {
  if (!str) return false;
  return /^\d+(?:\.\d+)?[KMBkmb]$/i.test(str.trim());
}

/**
 * Normalizes hashtag or topic string
 * - Strips leading hashtag '#'
 * - Strips leading standalone engagement metric tokens (e.g. "59.8K Vũ trụ AI" -> "vũ trụ ai", "123.5K Hari Won" -> "hari won")
 * - If string is solely an engagement metric (e.g. "59.8K"), returns empty string
 * - Preserves semantic numbers (e.g. "OB55" -> "ob55", "cơm sinh viên 15k" -> "cơm sinh viên 15k")
 */
function cleanLabel(raw) {
  if (!raw) return '';
  let cleaned = raw.trim().replace(/^#+/, '').trim();
  if (isMetricToken(cleaned)) {
    return '';
  }
  // Strip leading standalone engagement metric followed by whitespace
  cleaned = cleaned.replace(/^\d+(?:\.\d+)?[KMBkmb]\s+/i, '');
  return cleaned.trim().toLowerCase();
}

/**
 * Check if candidate is generic noise or metric token
 */
function isGenericNoise(label) {
  if (isMetricToken(label)) return true;
  const clean = cleanLabel(label);
  return GENERIC_BLACKLIST.has(clean) || clean.length < 2;
}

/**
 * Parses metric strings like "13.4K", "23.2M", "3.4B" into integers
 */
function parseMetricNumber(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([KMBkmb])?$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const mult = m[2] ? m[2].toUpperCase() : '';
  if (mult === 'K') return Math.round(num * 1000);
  if (mult === 'M') return Math.round(num * 1000000);
  if (mult === 'B') return Math.round(num * 1000000000);
  return Math.round(num);
}

/**
 * Creates deterministic candidate key across scans
 * Formula: `${type_hint}:${normalized_label}`
 */
function createDeterministicKey(typeHint = 'unknown', label = '') {
  const normType = (typeHint || 'unknown').toLowerCase().trim();
  const normLabel = cleanLabel(label);
  return `${normType}:${normLabel}`;
}

/**
 * Detects whether a candidate appears to be commercial or campaign-driven
 */
function detectNatureHint(label, rawSnippet = '') {
  const text = `${label} ${rawSnippet}`.toLowerCase();
  if (text.includes('shop') || text.includes('sale') || text.includes('deal') || text.includes('muasam') || text.includes('voucher')) {
    return 'commerce';
  }
  if (text.includes('campaign') || text.includes('sieuhoi') || text.includes('journey') || text.includes('thuonghieu') || text.includes('event')) {
    return 'possible_campaign';
  }
  return 'organic_unknown';
}

module.exports = {
  cleanLabel,
  isGenericNoise,
  isMetricToken,
  parseMetricNumber,
  createDeterministicKey,
  detectNatureHint,
  GENERIC_BLACKLIST
};
