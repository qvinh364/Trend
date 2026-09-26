/**
 * CANDIDATE DISCOVERY CONTRACT VALIDATOR (PHASE 2A.3)
 * 
 * Rules:
 * - Top-level: scan_id, observed_at, discovery_coverage, source_runs, current_candidates, historical_context.
 * - Current candidates are prioritized 7d or fresher observations.
 * - 30d-only observations belong to historical_context with freshness_warning: true.
 * - Every candidate must carry type_confidence ('LOW' | 'MEDIUM' | 'HIGH'). At discovery, it is LOW by default.
 * - No trend_score, no lifecycle (HOT/RISING).
 */

const VALID_COVERAGES = ['FULL', 'PARTIAL', 'LIMITED'];
const VALID_TYPE_HINTS = ['hashtag', 'topic', 'sound', 'format', 'search_query', 'unknown'];
const VALID_NATURE_HINTS = ['organic_unknown', 'possible_campaign', 'commerce', 'unknown'];
const VALID_CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'];

const VALID_SIGNAL_STRENGTHS = ['WEAK', 'MEDIUM', 'STRONG'];
const VALID_SURFACE_SCOPES = ['market_structured', 'authenticated_personalized', 'query_contextual'];
const VALID_SELECTION_STATUSES = ['SELECTED', 'NOT_SELECTED'];

function validateCandidateItem(candidate, isHistorical = false) {
  if (!candidate.candidate_key || typeof candidate.candidate_key !== 'string') {
    throw new Error('candidate_key must be a non-empty string');
  }
  if (!candidate.canonical_label || typeof candidate.canonical_label !== 'string') {
    throw new Error(`canonical_label required for ${candidate.candidate_key}`);
  }
  if (!VALID_TYPE_HINTS.includes(candidate.candidate_type_hint)) {
    throw new Error(`Invalid candidate_type_hint: ${candidate.candidate_type_hint}`);
  }
  if (!VALID_NATURE_HINTS.includes(candidate.nature_hint)) {
    throw new Error(`Invalid nature_hint: ${candidate.nature_hint}`);
  }
  if (!VALID_CONFIDENCES.includes(candidate.type_confidence)) {
    throw new Error(`Invalid type_confidence: ${candidate.type_confidence} for ${candidate.candidate_key}`);
  }
  if (typeof candidate.freshness_warning !== 'boolean') {
    throw new Error(`freshness_warning must be boolean for ${candidate.candidate_key}`);
  }
  if (!Array.isArray(candidate.discovery_sources) || candidate.discovery_sources.length === 0) {
    throw new Error(`discovery_sources required for ${candidate.candidate_key}`);
  }
  if (candidate.discovery_signal_strength && !VALID_SIGNAL_STRENGTHS.includes(candidate.discovery_signal_strength)) {
    throw new Error(`Invalid discovery_signal_strength: ${candidate.discovery_signal_strength}`);
  }
  if (candidate.surface_scope) {
    if (!Array.isArray(candidate.surface_scope)) {
      throw new Error(`surface_scope must be an array for ${candidate.candidate_key}`);
    }
    for (const scope of candidate.surface_scope) {
      if (!VALID_SURFACE_SCOPES.includes(scope)) {
        throw new Error(`Invalid surface_scope: ${scope} in ${candidate.candidate_key}`);
      }
    }
  }

  // Strict constraint: NO trend scores or lifecycle
  if (candidate.lifecycle !== undefined) throw new Error('lifecycle is forbidden in discovery stage');
  if (candidate.trend_score !== undefined) throw new Error('trend_score is forbidden in discovery stage');
  if (candidate.momentum !== undefined) throw new Error('momentum is forbidden in discovery stage');

  return true;
}

function validateDiscoveryPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Payload must be an object');
  if (!payload.scan_id) throw new Error('scan_id required');
  if (!payload.observed_at) throw new Error('observed_at required');
  if (!VALID_COVERAGES.includes(payload.discovery_coverage)) {
    throw new Error(`Invalid discovery_coverage: ${payload.discovery_coverage}`);
  }
  if (!Array.isArray(payload.source_runs)) throw new Error('source_runs must be an array');
  if (!Array.isArray(payload.current_candidates)) throw new Error('current_candidates must be an array');
  if (!Array.isArray(payload.historical_context)) throw new Error('historical_context must be an array');

  for (const c of payload.current_candidates) {
    validateCandidateItem(c, false);
  }
  for (const c of payload.historical_context) {
    validateCandidateItem(c, true);
  }

  return true;
}

function validateAgentObservation(obs) {
  if (!obs || typeof obs !== 'object') throw new Error('Observation must be an object');
  if (!obs.source) throw new Error('source required');
  if (!obs.surface) throw new Error('surface required');
  if (!obs.label) throw new Error('label required');
  if (!VALID_TYPE_HINTS.includes(obs.candidate_type_hint)) {
    throw new Error(`Invalid candidate_type_hint: ${obs.candidate_type_hint}`);
  }
  if (obs.type_confidence && !VALID_CONFIDENCES.includes(obs.type_confidence)) {
    throw new Error(`Invalid type_confidence: ${obs.type_confidence}`);
  }
  if (obs.is_mock === true) {
    throw new Error('is_mock must be false for genuine live observations');
  }
  if (obs.capture_method !== 'playwright_persistent_authenticated_profile') {
    throw new Error(`capture_method must be "playwright_persistent_authenticated_profile", got: ${obs.capture_method}`);
  }
  if (obs.selection_status && !VALID_SELECTION_STATUSES.includes(obs.selection_status)) {
    throw new Error(`Invalid selection_status: ${obs.selection_status}`);
  }
  if (obs.selection_status === 'NOT_SELECTED' && !obs.selection_reason) {
    throw new Error('selection_reason required when selection_status is NOT_SELECTED');
  }
  return true;
}

module.exports = {
  validateCandidateItem,
  validateDiscoveryPayload,
  validateAgentObservation,
  VALID_COVERAGES,
  VALID_TYPE_HINTS,
  VALID_NATURE_HINTS,
  VALID_CONFIDENCES,
  VALID_SIGNAL_STRENGTHS,
  VALID_SURFACE_SCOPES,
  VALID_SELECTION_STATUSES
};
