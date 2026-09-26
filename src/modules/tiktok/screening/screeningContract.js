/**
 * TIKTOK LIGHT SCREENING CONTRACT VALIDATOR (PHASE 2B)
 * 
 * Rules:
 * - Top-level: scan_id, screened_at, source_candidate_scan_id, results.
 * - Per candidate: candidate_key, canonical_label, candidate_type_hint_before,
 *   type_confidence_before ("LOW"), discovery_signal_strength, surface_scope,
 *   screening_status ("PASS_TO_DEEP_VALIDATION" | "DROP" | "INCONCLUSIVE"),
 *   sample_size, unique_creators, replication_observed, replication_pattern,
 *   screening_reason, candidate_type_hint_after, type_confidence_after ("LOW" | "MEDIUM"),
 *   evidence array.
 * - Per evidence: video_url, creator_handle, caption, published_at (null or string),
 *   views (null or number), likes (null or number), comments (null or number),
 *   sound_title (null or string), observed_pattern, relevance ("RELEVANT" | "PARTIAL" | "NOT_RELEVANT"),
 *   capture_method ("playwright_persistent_authenticated_profile"), observed_at.
 * 
 * HARD CONSTRAINTS:
 * - NO trend_score anywhere.
 * - NO momentum_score anywhere.
 * - NO lifecycle classification (HOT, RISING, EMERGING, COOLING).
 * - Missing metrics MUST remain null (never 0).
 */

const VALID_SCREENING_STATUSES = ['PASS_TO_DEEP_VALIDATION', 'DROP', 'INCONCLUSIVE'];
const VALID_RELEVANCES = ['RELEVANT', 'PARTIAL', 'NOT_RELEVANT'];
const VALID_TYPES = ['topic', 'hashtag', 'sound', 'format', 'search_query', 'unknown'];
const VALID_CONFIDENCES = ['LOW', 'MEDIUM'];
const VALID_SIGNAL_STRENGTHS = ['WEAK', 'MEDIUM', 'STRONG'];
const VALID_SURFACE_SCOPES = ['market_structured', 'authenticated_personalized', 'query_contextual'];

function validateEvidenceItem(item, candidateKey = 'unknown') {
  if (!item || typeof item !== 'object') throw new Error(`Evidence item must be an object in ${candidateKey}`);
  if (!item.video_url || typeof item.video_url !== 'string' || !item.video_url.startsWith('http')) {
    throw new Error(`Valid video_url required in evidence for ${candidateKey}`);
  }
  if (item.capture_method !== 'playwright_persistent_authenticated_profile') {
    throw new Error(`capture_method must be "playwright_persistent_authenticated_profile", got: ${item.capture_method}`);
  }
  if (!VALID_RELEVANCES.includes(item.relevance)) {
    throw new Error(`Invalid relevance: ${item.relevance} in evidence for ${candidateKey}`);
  }
  if (!item.observed_at) {
    throw new Error(`observed_at required in evidence for ${candidateKey}`);
  }
  if (item.views !== null && (typeof item.views !== 'number' || isNaN(item.views))) {
    throw new Error(`views must be number or null in ${candidateKey}`);
  }
  if (item.likes !== null && (typeof item.likes !== 'number' || isNaN(item.likes))) {
    throw new Error(`likes must be number or null in ${candidateKey}`);
  }
  if (item.comments !== null && (typeof item.comments !== 'number' || isNaN(item.comments))) {
    throw new Error(`comments must be number or null in ${candidateKey}`);
  }

  // Strict constraint: NO scores or lifecycle in evidence
  if (item.trend_score !== undefined) throw new Error('trend_score forbidden in evidence');
  if (item.momentum_score !== undefined) throw new Error('momentum_score forbidden in evidence');
  if (item.lifecycle !== undefined) throw new Error('lifecycle forbidden in evidence');

  return true;
}

function validateCandidateScreeningResult(result) {
  if (!result || typeof result !== 'object') throw new Error('Candidate screening result must be an object');
  if (!result.candidate_key || typeof result.candidate_key !== 'string') {
    throw new Error('candidate_key required');
  }
  if (!result.canonical_label || typeof result.canonical_label !== 'string') {
    throw new Error(`canonical_label required for ${result.candidate_key}`);
  }
  if (!VALID_TYPES.includes(result.candidate_type_hint_before)) {
    throw new Error(`Invalid candidate_type_hint_before: ${result.candidate_type_hint_before}`);
  }
  if (result.type_confidence_before !== 'LOW') {
    throw new Error(`type_confidence_before must be "LOW" for ${result.candidate_key}`);
  }
  if (!VALID_SIGNAL_STRENGTHS.includes(result.discovery_signal_strength)) {
    throw new Error(`Invalid discovery_signal_strength: ${result.discovery_signal_strength}`);
  }
  if (!Array.isArray(result.surface_scope) || result.surface_scope.length === 0) {
    throw new Error(`surface_scope required as non-empty array for ${result.candidate_key}`);
  }
  for (const s of result.surface_scope) {
    if (!VALID_SURFACE_SCOPES.includes(s)) {
      throw new Error(`Invalid surface_scope item: ${s} in ${result.candidate_key}`);
    }
  }
  if (!VALID_SCREENING_STATUSES.includes(result.screening_status)) {
    throw new Error(`Invalid screening_status: ${result.screening_status} for ${result.candidate_key}`);
  }
  if (typeof result.sample_size !== 'number' || result.sample_size < 0) {
    throw new Error(`sample_size must be a non-negative number for ${result.candidate_key}`);
  }
  if (typeof result.unique_creators !== 'number' || result.unique_creators < 0) {
    throw new Error(`unique_creators must be a non-negative number for ${result.candidate_key}`);
  }
  if (result.replication_observed !== true && result.replication_observed !== false && result.replication_observed !== null) {
    throw new Error(`replication_observed must be boolean or null for ${result.candidate_key}`);
  }
  if (!result.screening_reason || typeof result.screening_reason !== 'string') {
    throw new Error(`screening_reason must be a non-empty string for ${result.candidate_key}`);
  }
  if (!VALID_TYPES.includes(result.candidate_type_hint_after)) {
    throw new Error(`Invalid candidate_type_hint_after: ${result.candidate_type_hint_after} for ${result.candidate_key}`);
  }
  if (!VALID_CONFIDENCES.includes(result.type_confidence_after)) {
    throw new Error(`Invalid type_confidence_after: ${result.type_confidence_after} for ${result.candidate_key}`);
  }
  if (!Array.isArray(result.evidence)) {
    throw new Error(`evidence must be an array for ${result.candidate_key}`);
  }
  if (result.evidence.length > 5) {
    throw new Error(`Evidence count exceeds max of 5 (got ${result.evidence.length}) in ${result.candidate_key}`);
  }

  for (const ev of result.evidence) {
    validateEvidenceItem(ev, result.candidate_key);
  }

  // Strict constraint: NO trend_score, momentum, or lifecycle
  if (result.trend_score !== undefined) throw new Error(`trend_score is strictly forbidden in screening result`);
  if (result.momentum_score !== undefined) throw new Error(`momentum_score is strictly forbidden in screening result`);
  if (result.lifecycle !== undefined) throw new Error(`lifecycle is strictly forbidden in screening result`);

  return true;
}

function validateScreeningPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Screening payload must be an object');
  if (!payload.scan_id || typeof payload.scan_id !== 'string') throw new Error('scan_id required');
  if (!payload.screened_at || typeof payload.screened_at !== 'string') throw new Error('screened_at required');
  if (!payload.source_candidate_scan_id || typeof payload.source_candidate_scan_id !== 'string') {
    throw new Error('source_candidate_scan_id required');
  }
  if (!Array.isArray(payload.results)) throw new Error('results must be an array');

  for (const r of payload.results) {
    validateCandidateScreeningResult(r);
  }

  // Top level constraints
  if (payload.trend_score !== undefined) throw new Error('trend_score forbidden at top level');
  if (payload.lifecycle !== undefined) throw new Error('lifecycle forbidden at top level');

  return true;
}

module.exports = {
  validateEvidenceItem,
  validateCandidateScreeningResult,
  validateScreeningPayload,
  VALID_SCREENING_STATUSES,
  VALID_RELEVANCES,
  VALID_TYPES,
  VALID_CONFIDENCES,
  VALID_SIGNAL_STRENGTHS,
  VALID_SURFACE_SCOPES
};
