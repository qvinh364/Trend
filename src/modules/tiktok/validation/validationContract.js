/**
 * TIKTOK DEEP VALIDATION CONTRACT (PHASE 3)
 * 
 * Rules:
 * - Top-level: scan_id, validated_at, source_discovery_scan_id, source_screening_scan_id, results.
 * - Per candidate:
 *   - candidate_key, canonical_label_before, validation_status ("DEEP_VALIDATED" | "REJECTED_AFTER_DEEP_VALIDATION" | "INCONCLUSIVE")
 *   - sample_size (8-15), unique_creators (>= 5 for DEEP_VALIDATED), relevant_evidence_count (>= 8 for DEEP_VALIDATED)
 *   - replication_confirmed (boolean or null)
 *   - replication_pattern (string)
 *   - validated_type ("topic" | "hashtag" | "sound" | "format" | "campaign" | "unknown")
 *   - type_confidence ("LOW" | "MEDIUM" | "HIGH")
 *   - validated_topic_label (string derived from evidence)
 *   - aliases (array of strings)
 *   - spread_mode ("organic_like" | "campaign_driven" | "mixed" | "unknown")
 *   - freshness (fresh_0_24h, fresh_24_72h, fresh_3_7d, older_7d, unknown)
 *   - surface_evidence (array)
 *   - repeated_narratives (array of strings)
 *   - validation_reason (string)
 *   - evidence (array of evidence objects)
 * 
 * HARD CONSTRAINTS:
 * - NO trend_score anywhere!
 * - NO momentum_score anywhere!
 * - NO lifecycle classification (HOT, RISING, EMERGING, COOLING)!
 * - Missing metrics remain null (never 0).
 */

const VALID_VALIDATION_STATUSES = ['DEEP_VALIDATED', 'REJECTED_AFTER_DEEP_VALIDATION', 'INCONCLUSIVE'];
const VALID_SPREAD_MODES = ['organic_like', 'campaign_driven', 'mixed', 'unknown'];
const VALID_TYPES = ['topic', 'hashtag', 'sound', 'format', 'campaign', 'unknown'];
const VALID_CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'];
const VALID_RELEVANCES = ['RELEVANT', 'PARTIAL', 'NOT_RELEVANT'];

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

function validateCandidateValidationResult(result) {
  if (!result || typeof result !== 'object') throw new Error('Validation result must be an object');
  if (!result.candidate_key || typeof result.candidate_key !== 'string') {
    throw new Error('candidate_key required');
  }
  if (!result.canonical_label_before || typeof result.canonical_label_before !== 'string') {
    throw new Error(`canonical_label_before required for ${result.candidate_key}`);
  }
  if (!VALID_VALIDATION_STATUSES.includes(result.validation_status)) {
    throw new Error(`Invalid validation_status: ${result.validation_status} for ${result.candidate_key}`);
  }
  if (typeof result.sample_size !== 'number' || result.sample_size < 0) {
    throw new Error(`sample_size must be a non-negative number for ${result.candidate_key}`);
  }
  if (typeof result.unique_creators !== 'number' || result.unique_creators < 0) {
    throw new Error(`unique_creators must be a non-negative number for ${result.candidate_key}`);
  }
  if (typeof result.relevant_evidence_count !== 'number' || result.relevant_evidence_count < 0) {
    throw new Error(`relevant_evidence_count must be a non-negative number for ${result.candidate_key}`);
  }
  if (!VALID_TYPES.includes(result.validated_type)) {
    throw new Error(`Invalid validated_type: ${result.validated_type} for ${result.candidate_key}`);
  }
  if (!VALID_CONFIDENCES.includes(result.type_confidence)) {
    throw new Error(`Invalid type_confidence: ${result.type_confidence} for ${result.candidate_key}`);
  }
  if (!result.validated_topic_label || typeof result.validated_topic_label !== 'string') {
    throw new Error(`validated_topic_label required for ${result.candidate_key}`);
  }
  if (!Array.isArray(result.aliases)) {
    throw new Error(`aliases must be an array for ${result.candidate_key}`);
  }
  if (!VALID_SPREAD_MODES.includes(result.spread_mode)) {
    throw new Error(`Invalid spread_mode: ${result.spread_mode} for ${result.candidate_key}`);
  }
  if (!result.freshness || typeof result.freshness !== 'object') {
    throw new Error(`freshness breakdown required for ${result.candidate_key}`);
  }
  const f = result.freshness;
  if (typeof f.fresh_0_24h !== 'number' || typeof f.fresh_24_72h !== 'number' ||
      typeof f.fresh_3_7d !== 'number' || typeof f.older_7d !== 'number' || typeof f.unknown !== 'number') {
    throw new Error(`freshness counts must be numbers in ${result.candidate_key}`);
  }
  if (!Array.isArray(result.repeated_narratives)) {
    throw new Error(`repeated_narratives must be an array for ${result.candidate_key}`);
  }
  if (!result.validation_reason || typeof result.validation_reason !== 'string') {
    throw new Error(`validation_reason required for ${result.candidate_key}`);
  }
  if (!Array.isArray(result.evidence)) {
    throw new Error(`evidence must be an array for ${result.candidate_key}`);
  }
  if (result.evidence.length > 15) {
    throw new Error(`Evidence count exceeds max of 15 (got ${result.evidence.length}) in ${result.candidate_key}`);
  }

  for (const ev of result.evidence) {
    validateEvidenceItem(ev, result.candidate_key);
  }

  // Pass rule check
  if (result.validation_status === 'DEEP_VALIDATED') {
    if (result.sample_size < 8) {
      throw new Error(`DEEP_VALIDATED requires sample_size >= 8 (got ${result.sample_size}) for ${result.candidate_key}`);
    }
    if (result.relevant_evidence_count < 8) {
      throw new Error(`DEEP_VALIDATED requires relevant_evidence_count >= 8 (got ${result.relevant_evidence_count}) for ${result.candidate_key}`);
    }
    if (result.unique_creators < 5) {
      throw new Error(`DEEP_VALIDATED requires unique_creators >= 5 (got ${result.unique_creators}) for ${result.candidate_key}`);
    }
  }

  // Strict constraints
  if (result.trend_score !== undefined) throw new Error('trend_score forbidden in validation result');
  if (result.momentum_score !== undefined) throw new Error('momentum_score forbidden in validation result');
  if (result.lifecycle !== undefined) throw new Error('lifecycle forbidden in validation result');

  return true;
}

function validateValidationPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Validation payload must be an object');
  if (!payload.scan_id || typeof payload.scan_id !== 'string') throw new Error('scan_id required');
  if (!payload.validated_at || typeof payload.validated_at !== 'string') throw new Error('validated_at required');
  if (!payload.source_discovery_scan_id || typeof payload.source_discovery_scan_id !== 'string') {
    throw new Error('source_discovery_scan_id required');
  }
  if (!payload.source_screening_scan_id || typeof payload.source_screening_scan_id !== 'string') {
    throw new Error('source_screening_scan_id required');
  }
  if (!Array.isArray(payload.results)) throw new Error('results must be an array');

  for (const r of payload.results) {
    validateCandidateValidationResult(r);
  }

  if (payload.trend_score !== undefined) throw new Error('trend_score forbidden at top level');
  if (payload.lifecycle !== undefined) throw new Error('lifecycle forbidden at top level');

  return true;
}

module.exports = {
  validateEvidenceItem,
  validateCandidateValidationResult,
  validateValidationPayload,
  VALID_VALIDATION_STATUSES,
  VALID_SPREAD_MODES,
  VALID_TYPES,
  VALID_CONFIDENCES
};
