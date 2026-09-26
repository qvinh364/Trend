/**
 * CANDIDATE MERGER & AGGREGATOR (HYBRID ORCHESTRATION - PHASE 2A.3)
 * 
 * Merges:
 * 1. Creative Center 7d & 30d (Node deterministic collector)
 * 2. Agent Browser observations (data/tiktok_agent_observations.json)
 * 
 * Separates into:
 * - current_candidates (7d Creative Center + fresh Agent observations) with type_confidence: 'LOW'
 * - historical_context (30d Creative Center fallback) with freshness_warning: true and type_confidence: 'LOW'
 */

const fs = require('fs');
const path = require('path');
const { 
  cleanLabel, 
  isGenericNoise, 
  createDeterministicKey, 
  detectNatureHint 
} = require('./candidateNormalizer');
const { validateDiscoveryPayload, validateAgentObservation } = require('./candidateContract');

const DEFAULT_AGENT_OBS_PATH = path.resolve(__dirname, '../../../../data/tiktok_agent_observations.json');
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '../../../../data/tiktok_candidates.json');

/**
 * Reads agent observations from file
 * @param {string} filePath 
 * @returns {Array} List of valid observations
 */
function readAgentObservations(filePath = DEFAULT_AGENT_OBS_PATH) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const valid = [];
    for (const item of parsed) {
      try {
        validateAgentObservation(item);
        valid.push(item);
      } catch (err) {
        console.warn(`[CandidateMerger] Skipping invalid observation:`, err.message);
      }
    }
    return valid;
  } catch (err) {
    console.warn(`[CandidateMerger] Error reading agent observations:`, err.message);
    return [];
  }
}

function getScopeWeight(c) {
  if (c.surface_scope && c.surface_scope.includes('market_structured')) return 3;
  if (c.surface_scope && c.surface_scope.includes('query_contextual')) return 2;
  if (c.surface_scope && c.surface_scope.includes('authenticated_personalized')) return 1;
  return 0;
}

function compareCandidatesDeterministic(a, b) {
  // 1. Signal strength: STRONG (3) > MEDIUM (2) > WEAK (1)
  const strengthWeight = { STRONG: 3, MEDIUM: 2, WEAK: 1 };
  const diffStrength = (strengthWeight[b.discovery_signal_strength] || 0) - (strengthWeight[a.discovery_signal_strength] || 0);
  if (diffStrength !== 0) return diffStrength;

  // 2. A. More independent surfaces (distinct source count)
  const aSources = new Set(a.discovery_sources.map(s => s.source)).size;
  const bSources = new Set(b.discovery_sources.map(s => s.source)).size;
  if (bSources !== aSources) return bSources - aSources;

  // 2. B. Repeated observation over single observation
  const aObsCount = a.discovery_sources.length;
  const bObsCount = b.discovery_sources.length;
  if (bObsCount !== aObsCount) return bObsCount - aObsCount;

  // 2. C/D/E. Scope priority: market_structured (3) > query_contextual (2) > authenticated_personalized (1)
  const diffScope = getScopeWeight(b) - getScopeWeight(a);
  if (diffScope !== 0) return diffScope;

  // 2. Stable source order (feed/rank index)
  const aFeed = a.feed_index !== undefined ? a.feed_index : 9999;
  const bFeed = b.feed_index !== undefined ? b.feed_index : 9999;
  if (aFeed !== bFeed) return aFeed - bFeed;

  // 3. Deterministic lexical tie-breaker: candidate_key
  return a.candidate_key.localeCompare(b.candidate_key);
}

/**
 * Merges Creative Center + Agent observations into final structure
 */
function mergeDiscoverySources({
  ccData = { source_runs: [], cc7dList: [], cc30dList: [] },
  agentObservations = [],
  scanId = `disc_${Date.now()}`,
  searchStatus = null,
  exploreStatus = null,
  liveDiagnostics = null
} = {}) {
  const currentMap = new Map();
  const historicalMap = new Map();
  let obsIndex = 1;

  // 1. Process Creative Center 7d (Primary Current Candidates)
  for (const item of ccData.cc7dList) {
    const key = createDeterministicKey('hashtag', item.label);
    currentMap.set(key, {
      candidate_key: key,
      feed_index: obsIndex,
      observation_id: `obs_${Date.now()}_${obsIndex++}`,
      canonical_label: item.label,
      aliases: [item.tag],
      candidate_type_hint: 'hashtag',
      type_confidence: 'LOW', // Hypothesis only at discovery stage
      nature_hint: detectNatureHint(item.label, item.raw_signal),
      freshness_warning: false,
      discovery_window: '7d',
      warning_note: null,
      discovery_sources: [
        {
          source: 'creative_center',
          period_days: 7,
          rank: item.rank,
          industry: item.industry,
          posts: item.posts,
          views: item.views,
          observed_at: new Date().toISOString(),
          evidence_url: item.evidence_url,
          raw_signal: item.raw_signal
        }
      ],
      reason_for_validation: `TikTok Creative Center VN (Rank ${item.rank || 'N/A'}, ${item.posts ? item.posts.toLocaleString() + ' posts' : 'thịnh hành 7 ngày qua'})`,
      screening_status: 'PENDING'
    });
  }

  // 2. Process Agent Browser Observations (Search suggestions, Explore clusters, Hot topics)
  // These are prioritized as CURRENT candidates
  for (const obs of agentObservations) {
    const label = cleanLabel(obs.label);
    if (isGenericNoise(label)) continue;

    const typeHint = obs.candidate_type_hint || 'topic';
    const key = createDeterministicKey(typeHint, label);

    if (currentMap.has(key)) {
      // Merge observation into existing candidate
      const existing = currentMap.get(key);
      existing.discovery_sources.push({
        source: obs.source,
        surface: obs.surface,
        observed_at: obs.observed_at || new Date().toISOString(),
        evidence_url: (obs.evidence_urls && obs.evidence_urls[0]) || obs.evidence_url || obs.page_url || 'https://www.tiktok.com',
        raw_signal: obs.raw_text || obs.label
      });
      existing.aliases = [...new Set([...existing.aliases, obs.label])];
    } else {
      currentMap.set(key, {
        candidate_key: key,
        feed_index: obsIndex,
        observation_id: `obs_${Date.now()}_${obsIndex++}`,
        canonical_label: label,
        aliases: [obs.label],
        candidate_type_hint: typeHint,
        type_confidence: obs.type_confidence || 'LOW', // Hypothesis only at discovery stage
        nature_hint: detectNatureHint(label, obs.raw_text || ''),
        freshness_warning: false,
        discovery_window: 'realtime_agent',
        warning_note: null,
        discovery_sources: [
          {
            source: obs.source,
            surface: obs.surface,
            observed_at: obs.observed_at || new Date().toISOString(),
            evidence_url: (obs.evidence_urls && obs.evidence_urls[0]) || obs.evidence_url || obs.page_url || 'https://www.tiktok.com',
            raw_signal: obs.raw_text || obs.label
          }
        ],
        reason_for_validation: `Phát hiện trực tiếp qua Agent Browser (${obs.source}: "${obs.label}")`,
        screening_status: 'PENDING'
      });
    }
  }

  // 3. Process Creative Center 30d (Historical Context / Baseline)
  for (const item of ccData.cc30dList) {
    const key = createDeterministicKey('hashtag', item.label);
    if (currentMap.has(key)) {
      const existing = currentMap.get(key);
      existing.discovery_sources.push({
        source: 'creative_center',
        period_days: 30,
        rank: item.rank,
        industry: item.industry,
        posts: item.posts,
        views: item.views,
        observed_at: new Date().toISOString(),
        evidence_url: item.evidence_url,
        raw_signal: item.raw_signal
      });
    } else {
      historicalMap.set(key, {
        candidate_key: key,
        observation_id: `obs_${Date.now()}_${obsIndex++}`,
        canonical_label: item.label,
        aliases: [item.tag],
        candidate_type_hint: 'hashtag',
        type_confidence: 'LOW',
        nature_hint: detectNatureHint(item.label, item.raw_signal),
        freshness_warning: true,
        discovery_window: '30d',
        warning_note: 'Chủ đề từ bảng 30 ngày qua (thuộc dữ liệu nền tảng/chiến dịch đã qua đỉnh)',
        discovery_sources: [
          {
            source: 'creative_center',
            period_days: 30,
            rank: item.rank,
            industry: item.industry,
            posts: item.posts,
            views: item.views,
            observed_at: new Date().toISOString(),
            evidence_url: item.evidence_url,
            raw_signal: item.raw_signal
          }
        ],
        reason_for_validation: `TikTok Creative Center VN (Bảng 30 ngày: Rank ${item.rank || 'N/A'}, ${item.posts ? item.posts.toLocaleString() + ' posts' : ''})`,
        screening_status: 'PENDING'
      });
    }
  }

  function mapSurfaceScope(sourceItem) {
    if (sourceItem.source === 'creative_center') return 'market_structured';
    if (sourceItem.source === 'tiktok_explore') return 'authenticated_personalized';
    if (sourceItem.source === 'tiktok_search_ui') return 'query_contextual';
    return 'query_contextual';
  }

  function calculateSignalStrength(candidate) {
    const sources = new Set(candidate.discovery_sources.map(s => s.source));
    if (sources.size >= 2) return 'STRONG';

    // Structured current source like Creative Center 7d:
    const hasCC7d = candidate.discovery_sources.some(s => s.source === 'creative_center' && s.period_days === 7);
    // Repeated observation on same surface:
    const hasRepeated = candidate.discovery_sources.some(s => s.surface === 'explore_repeated_signal') || candidate.discovery_sources.length >= 2;

    if (hasCC7d || hasRepeated) return 'MEDIUM';
    return 'WEAK';
  }

  // Assign discovery_signal_strength and surface_scope to all candidates
  for (const candidate of currentMap.values()) {
    candidate.discovery_signal_strength = calculateSignalStrength(candidate);
    candidate.surface_scope = Array.from(new Set(candidate.discovery_sources.map(mapSurfaceScope)));
  }
  for (const candidate of historicalMap.values()) {
    candidate.discovery_signal_strength = calculateSignalStrength(candidate);
    candidate.surface_scope = Array.from(new Set(candidate.discovery_sources.map(mapSurfaceScope)));
  }

  // Construct source runs diagnostic
  const source_runs = [...ccData.source_runs];

  const searchObs = agentObservations.filter(o => o.source === 'tiktok_search_ui');
  const exploreObs = agentObservations.filter(o => o.source === 'tiktok_explore');

  // Resolve search status strictly adhering to semantic rules
  let resolvedSearchStatus = searchStatus || (liveDiagnostics && liveDiagnostics.search && liveDiagnostics.search.status) || null;
  if (!resolvedSearchStatus) {
    resolvedSearchStatus = searchObs.length > 0 ? 'SEARCH_RESULTS_AVAILABLE' : 'NO_RESULTS';
  }

  let searchError = null;
  if (resolvedSearchStatus === 'ACCESS_RESTRICTED') {
    searchError = (liveDiagnostics && liveDiagnostics.search && liveDiagnostics.search.error) || 'TikTok Search access was restricted by platform.';
  } else if (resolvedSearchStatus === 'LOGIN_REQUIRED') {
    searchError = 'TikTok Search requires user authentication login.';
  } else if (resolvedSearchStatus === 'CAPTCHA_REQUIRED') {
    searchError = 'TikTok Search requires solving a verification challenge.';
  } else if (resolvedSearchStatus === 'UNKNOWN_UI_STATE') {
    searchError = 'TikTok Search UI state could not be determined.';
  }

  source_runs.push({
    source: 'tiktok_search_ui',
    status: resolvedSearchStatus,
    raw_items_found: searchObs.length,
    candidates_kept: searchObs.length,
    error: searchError,
    note: 'Extracted via playwright_persistent_authenticated_profile'
  });

  // Resolve explore status strictly adhering to semantic rules
  let resolvedExploreStatus = exploreStatus || (liveDiagnostics && liveDiagnostics.explore && liveDiagnostics.explore.status) || null;
  if (!resolvedExploreStatus) {
    resolvedExploreStatus = exploreObs.length > 0 ? 'SUCCESS' : 'NO_RESULTS';
  }

  source_runs.push({
    source: 'explore_authenticated',
    status: resolvedExploreStatus,
    raw_items_found: exploreObs.length,
    candidates_kept: exploreObs.length,
    error: null,
    note: 'Extracted via playwright_persistent_authenticated_profile'
  });

  source_runs.push({
    source: 'creator_search_insights',
    status: 'UNAVAILABLE_IN_CURRENT_ENVIRONMENT',
    raw_items_found: 0,
    candidates_kept: 0,
    error: 'Could not access Creator Search Insights through the current desktop execution path.'
  });

  // Calculate coverage
  const hasCC = ccData.cc7dList.length > 0;
  const hasExplore = exploreObs.length > 0;
  const hasSearch = searchObs.length > 0;
  let discovery_coverage = 'LIMITED';
  if (hasCC && (hasExplore || hasSearch)) {
    discovery_coverage = 'PARTIAL';
  }

  // Order candidates using deterministic multi-tier comparator
  const sortedCurrent = Array.from(currentMap.values()).sort(compareCandidatesDeterministic);

  // Take top 8 current candidates (enforcing candidate budget ceiling)
  const currentCandidates = sortedCurrent.slice(0, 8);
  const unselectedCandidates = sortedCurrent.slice(8);
  const historicalCandidates = Array.from(historicalMap.values()).slice(0, 8);

  for (const unc of unselectedCandidates) {
    unc.selection_status = 'NOT_SELECTED';
    unc.selection_reason = 'candidate_budget';
    unc.selection_priority_reason = `Exceeded candidate budget ceiling of 8 items (ranked #${sortedCurrent.indexOf(unc) + 1} in deterministic priority)`;
  }

  // Raw Observation Selection Audit: mark selection status and reason
  const selectedKeys = new Set(currentCandidates.map(c => c.candidate_key));
  for (const obs of agentObservations) {
    const typeHint = obs.candidate_type_hint || 'topic';
    const clean = cleanLabel(obs.label);
    const key = createDeterministicKey(typeHint, clean);
    if (selectedKeys.has(key)) {
      obs.selection_status = 'SELECTED';
      obs.selection_reason = null;
      obs.selection_priority_reason = null;
    } else {
      obs.selection_status = 'NOT_SELECTED';
      obs.selection_reason = 'candidate_budget';
      const rank = sortedCurrent.findIndex(c => c.candidate_key === key) + 1;
      obs.selection_priority_reason = `Exceeded candidate budget ceiling of 8 items (ranked #${rank || 9} in deterministic priority)`;
    }
  }

  const payload = {
    scan_id: scanId,
    observed_at: new Date().toISOString(),
    discovery_coverage,
    source_runs,
    current_candidates_count: currentCandidates.length,
    baseline_candidates_count: historicalCandidates.length,
    current_candidates: currentCandidates,
    historical_context: historicalCandidates
  };

  validateDiscoveryPayload(payload);
  return payload;
}

/**
 * Saves payload to file
 */
function writeCandidatesJson(payload, targetPath = DEFAULT_OUTPUT_PATH) {
  validateDiscoveryPayload(payload);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
  return targetPath;
}

module.exports = {
  readAgentObservations,
  mergeDiscoverySources,
  writeCandidatesJson,
  compareCandidatesDeterministic,
  DEFAULT_AGENT_OBS_PATH,
  DEFAULT_OUTPUT_PATH
};
