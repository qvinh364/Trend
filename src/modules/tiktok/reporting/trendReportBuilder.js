/**
 * TIKTOK TREND REPORT BUILDER (PHASE 5A)
 * 
 * Creates a deterministic, auditable report model on top of tiktok_results.json.
 * 
 * Hard Rules:
 * 1. Never conflate missing data / null with weak or declining trends (null !== 0).
 * 2. trend_score = null is strictly routed to needs_more_data with machine-readable reasons.
 * 3. Never invent data (timestamps, creators, engagement, or metrics).
 * 4. Engagement is NOT_SCORED_IN_V1 by methodology design, never reported as collector failure.
 * 5. Source limitations are observation constraints, not trend weakness.
 * 6. Deterministic sorting for rankings and representative evidence selection.
 * 7. Pure deterministic transformation: uses scan metadata from payload, no current Date() runtime dependence.
 */

const fs = require('fs');
const path = require('path');
const { MIN_SCORE_COVERAGE, COMPONENT_MAX_WEIGHTS } = require('../scoring/trendScorer');
const { DEFAULT_OUTPUT_PATH } = require('../schema/outputContract');

/**
 * Truncate caption cleanly without altering core semantics
 * @param {string} caption 
 * @param {number} maxLength 
 * @returns {string}
 */
function truncateCaption(caption, maxLength = 120) {
  if (!caption || typeof caption !== 'string') return '';
  const trimmed = caption.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength - 3).trim() + '...';
}

/**
 * Check if a topic has a valid, qualified score to enter ranked_trends
 * @param {Object} topic 
 * @returns {boolean}
 */
function isTopicRankable(topic) {
  if (!topic || typeof topic !== 'object') return false;

  const scoreVal = typeof topic.score === 'number'
    ? topic.score
    : (topic.signals && typeof topic.signals.trend_score === 'number' ? topic.signals.trend_score : null);

  if (scoreVal === null || isNaN(scoreVal)) return false;

  const signals = topic.signals || {};
  const status = signals.score_status || (topic.score !== null ? 'READY' : 'INSUFFICIENT_DATA');
  if (status !== 'READY') return false;

  const coverage = typeof signals.score_coverage === 'number'
    ? signals.score_coverage
    : (typeof signals.available_weight === 'number' ? signals.available_weight / 100 : 0);

  return coverage >= MIN_SCORE_COVERAGE;
}

/**
 * Evaluates component availability, missing data, un-scored components, and coverage reconciliation
 * strictly matching production scoring mechanics.
 * @param {Object} topic 
 * @returns {Object} { available_components, missing_components, not_scored_components, coverage_reconciliation }
 */
function evaluateComponentAvailability(topic) {
  const signals = (topic && topic.signals) || {};
  const available = [];
  const missing = [];
  const notScored = [];

  // 1. Momentum (weight: 30)
  const momentumScore = signals.momentum_score !== undefined ? signals.momentum_score : null;
  const isMomentumAvailable = typeof momentumScore === 'number' && !isNaN(momentumScore);
  if (isMomentumAvailable) {
    available.push({
      component: 'momentum',
      weight: COMPONENT_MAX_WEIGHTS.MOMENTUM,
      value: momentumScore,
      status: signals.momentum_status || 'STABLE_OR_GROWING'
    });
  } else {
    const momStatus = signals.momentum_status || 'INSUFFICIENT_DATA';
    missing.push({
      component: 'momentum',
      weight: COMPONENT_MAX_WEIGHTS.MOMENTUM,
      reason: momStatus === 'UNKNOWN' ? 'BASELINE_SCAN_NO_HISTORY' : momStatus,
      description: momStatus === 'UNKNOWN'
        ? 'First scan baseline: momentum cannot be calculated without a prior comparable scan.'
        : 'Insufficient longitudinal or surface signals to calculate momentum.'
    });
  }

  // 2. Creator Spread (weight: 20)
  const creatorPoints = signals.creator_spread_points !== undefined
    ? signals.creator_spread_points
    : (signals.creator_spread_score !== undefined ? signals.creator_spread_score : null);
  const isCreatorSpreadAvailable = typeof creatorPoints === 'number' && !isNaN(creatorPoints);
  if (isCreatorSpreadAvailable) {
    available.push({
      component: 'creator_spread',
      weight: COMPONENT_MAX_WEIGHTS.CREATOR_SPREAD,
      value: creatorPoints
    });
  } else {
    missing.push({
      component: 'creator_spread',
      weight: COMPONENT_MAX_WEIGHTS.CREATOR_SPREAD,
      reason: 'INSUFFICIENT_EVIDENCE',
      description: 'Requires at least 2 distinct creators in evidence to evaluate creator distribution.'
    });
  }

  // 3. Freshness (weight: 20)
  const freshnessPoints = signals.freshness_points !== undefined
    ? signals.freshness_points
    : (signals.freshness_score !== undefined ? signals.freshness_score : null);
  const isFreshnessAvailable = typeof freshnessPoints === 'number' && !isNaN(freshnessPoints);
  if (isFreshnessAvailable) {
    available.push({
      component: 'freshness',
      weight: COMPONENT_MAX_WEIGHTS.FRESHNESS,
      value: freshnessPoints,
      observation_status: signals.freshness_observation_status || 'AVAILABLE'
    });
  } else {
    const obsStatus = signals.freshness_observation_status || 'UNAVAILABLE';
    missing.push({
      component: 'freshness',
      weight: COMPONENT_MAX_WEIGHTS.FRESHNESS,
      reason: obsStatus,
      description: obsStatus === 'PARTIAL'
        ? 'Insufficient timestamped samples to establish freshness confidence.'
        : 'No parseable relative or absolute timestamps found in evidence videos.'
    });
  }

  // 4. Replication (weight: 15)
  // Check both numeric points/strength and confirmed/partial status from production signals
  const replicationPoints = signals.replication_points !== undefined
    ? signals.replication_points
    : (signals.replication_strength !== undefined
        ? signals.replication_strength
        : (signals.replication_score !== undefined ? signals.replication_score : null));
  
  const isReplicationConfirmed = signals.replication_status === 'CONFIRMED' || signals.current_replication === true;
  const isReplicationAvailable = (typeof replicationPoints === 'number' && !isNaN(replicationPoints)) || isReplicationConfirmed;

  if (isReplicationAvailable) {
    available.push({
      component: 'replication',
      weight: COMPONENT_MAX_WEIGHTS.REPLICATION,
      value: typeof replicationPoints === 'number' ? replicationPoints : COMPONENT_MAX_WEIGHTS.REPLICATION,
      status: signals.replication_status || 'CONFIRMED'
    });
  } else {
    missing.push({
      component: 'replication',
      weight: COMPONENT_MAX_WEIGHTS.REPLICATION,
      reason: 'INSUFFICIENT_EVIDENCE',
      description: 'Requires at least 2 relevant evidence videos to observe content replication.'
    });
  }

  // 5. Cross-Surface (weight: 10)
  const crossSurfacePoints = signals.cross_surface_points !== undefined
    ? signals.cross_surface_points
    : (signals.cross_surface_score !== undefined ? signals.cross_surface_score : null);
  const isCrossSurfaceAvailable = typeof crossSurfacePoints === 'number' && !isNaN(crossSurfacePoints);
  if (isCrossSurfaceAvailable) {
    available.push({
      component: 'cross_surface',
      weight: COMPONENT_MAX_WEIGHTS.CROSS_SURFACE,
      value: crossSurfacePoints
    });
  } else {
    missing.push({
      component: 'cross_surface',
      weight: COMPONENT_MAX_WEIGHTS.CROSS_SURFACE,
      reason: 'SOURCE_NOT_OBSERVED',
      description: 'Topic not observed in secondary structured surfaces (e.g. Creative Center 7d).'
    });
  }

  // 6. Engagement (weight: 5)
  // HARD RULE: Always NOT_SCORED_IN_V1 by methodology design. Separated from missing data.
  notScored.push({
    component: 'engagement',
    weight: COMPONENT_MAX_WEIGHTS.ENGAGEMENT,
    reason: 'NOT_SCORED_IN_V1',
    description: 'Engagement scoring is intentionally omitted in Score V1 methodology.'
  });

  // Coverage reconciliation: derived_available_weight = sum of available component max weights
  const derivedAvailableWeight = available.reduce((acc, c) => acc + c.weight, 0);
  const reportedAvailableWeight = typeof signals.available_weight === 'number'
    ? signals.available_weight
    : (typeof signals.score_coverage === 'number' ? Math.round(signals.score_coverage * 100) : derivedAvailableWeight);

  const coverage_reconciliation = {
    reported_available_weight: reportedAvailableWeight,
    derived_available_weight: derivedAvailableWeight,
    matches: reportedAvailableWeight === derivedAvailableWeight
  };

  return {
    available_components: available,
    missing_components: missing,
    not_scored_components: notScored,
    coverage_reconciliation
  };
}

/**
 * Identify missing components and their deterministic reasons (excluding un-scored components)
 * @param {Object} topic 
 * @returns {Array<Object>}
 */
function detectMissingComponents(topic) {
  return evaluateComponentAvailability(topic).missing_components;
}

/**
 * Detect observation constraints / platform limitations affecting this topic
 * @param {Object} topic 
 * @param {Array<Object>} sourceRuns 
 * @returns {Array<Object>}
 */
function detectSourceLimitations(topic, sourceRuns = []) {
  const signals = topic.signals || {};
  const limitations = [];

  // Search UI limitations
  const searchStatus = signals.search_status || 'UNKNOWN';
  if (['UNKNOWN_UI_STATE', 'ACCESS_RESTRICTED', 'LOGIN_REQUIRED', 'CAPTCHA_REQUIRED'].includes(searchStatus)) {
    limitations.push({
      source: 'tiktok_search_ui',
      limitation: searchStatus,
      restriction_match: signals.search_restriction_match || null,
      impact: 'Search results observation was restricted or non-standard. Platform collection limitation, not a measure of trend strength.'
    });
  }

  // Creative Center limitations
  const ccObsStatus = signals.cc_observation_status || null;
  if (ccObsStatus === 'NOT_OBSERVED_IN_EXPOSED_ROWS') {
    limitations.push({
      source: 'creative_center_7d',
      limitation: 'NOT_IN_EXPOSED_TOP_ROWS',
      impact: 'Topic is outside top rows exposed in current Creative Center view; structured market metrics unavailable.'
    });
  }

  // General source run status checks
  for (const run of sourceRuns) {
    if (run.status === 'UNAVAILABLE_IN_CURRENT_ENVIRONMENT') {
      limitations.push({
        source: run.source,
        limitation: run.status,
        impact: run.error || 'Source unavailable in current environment.'
      });
    }
  }

  return limitations;
}

/**
 * Select up to maxItems representative evidence videos deterministically
 * Priority:
 * 1. Has non-empty published_at timestamp
 * 2. Original sequence in payload
 * @param {Array<Object>} evidenceList 
 * @param {number} maxItems 
 * @returns {Array<Object>}
 */
function extractRepresentativeEvidence(evidenceList, maxItems = 3) {
  if (!Array.isArray(evidenceList) || evidenceList.length === 0) return [];

  // Tag items with index to maintain stable secondary ordering
  const indexed = evidenceList.map((ev, index) => ({
    ev,
    index,
    hasTimestamp: Boolean(ev.published_at && typeof ev.published_at === 'string' && ev.published_at.trim() !== '' && ev.published_at !== 'UNKNOWN')
  }));

  // Sort deterministically: items with timestamps first, then original index
  indexed.sort((a, b) => {
    if (a.hasTimestamp !== b.hasTimestamp) {
      return a.hasTimestamp ? -1 : 1;
    }
    return a.index - b.index;
  });

  return indexed.slice(0, maxItems).map(({ ev }) => ({
    video_url: ev.video_url,
    creator: ev.creator || ev.creator_handle || null,
    caption: truncateCaption(ev.caption, 120),
    published_at: ev.published_at || null
  }));
}

/**
 * Transform a single topic into the standardized per-trend report model
 * @param {Object} topic 
 * @param {Array<Object>} sourceRuns 
 * @returns {Object}
 */
function buildPerTrendModel(topic, sourceRuns = []) {
  const signals = topic.signals || {};
  const rankable = isTopicRankable(topic);

  const numericScore = typeof topic.score === 'number'
    ? topic.score
    : (typeof signals.trend_score === 'number' ? signals.trend_score : null);

  const sampleSize = typeof signals.sample_size === 'number'
    ? signals.sample_size
    : (Array.isArray(topic.evidence) ? topic.evidence.length : 0);

  const knownTimestamps = typeof signals.known_timestamp_count === 'number'
    ? signals.known_timestamp_count
    : (Array.isArray(topic.evidence) ? topic.evidence.filter(e => e.published_at && e.published_at !== 'UNKNOWN').length : 0);

  const timestampCoverage = sampleSize > 0
    ? Number((knownTimestamps / sampleSize).toFixed(2))
    : 0;

  const compEval = evaluateComponentAvailability(topic);

  return {
    identity: {
      topic_id: topic.topic_id,
      title: topic.title || topic.canonical_title || topic.topic_id,
      aliases: Array.isArray(topic.aliases) ? topic.aliases : [],
      type: topic.type || 'topic'
    },
    state: {
      lifecycle: topic.lifecycle || 'CANDIDATE',
      confidence: topic.confidence || 'LOW'
    },
    trend_score: {
      value: numericScore,
      status: signals.score_status || (numericScore !== null ? 'READY' : 'INSUFFICIENT_DATA'),
      coverage: signals.score_coverage !== undefined ? signals.score_coverage : null,
      available_weight: signals.available_weight !== undefined ? signals.available_weight : null,
      previous_score: topic.previous_score !== undefined ? topic.previous_score : null,
      score_delta: topic.score_delta !== undefined ? topic.score_delta : null
    },
    momentum: {
      value: signals.momentum_score !== undefined ? signals.momentum_score : null,
      status: signals.momentum_status || 'UNKNOWN',
      coverage: signals.momentum_coverage !== undefined ? signals.momentum_coverage : null
    },
    evidence_quality: {
      sample_size: sampleSize,
      unique_creators: signals.unique_creators !== undefined ? signals.unique_creators : 0,
      known_timestamp_count: knownTimestamps,
      timestamp_coverage: timestampCoverage,
      freshness_observation_status: signals.freshness_observation_status || 'UNAVAILABLE',
      replication_status: signals.replication_status || 'UNKNOWN',
      search_status: signals.search_status || 'UNKNOWN'
    },
    current_signals: {
      cc_rank: signals.cc_rank !== undefined ? signals.cc_rank : (topic.cc_rank !== undefined ? topic.cc_rank : null),
      cc_posts: signals.cc_posts !== undefined ? signals.cc_posts : (topic.cc_posts !== undefined ? topic.cc_posts : null),
      cc_views: signals.cc_views !== undefined ? signals.cc_views : (topic.cc_views !== undefined ? topic.cc_views : null),
      creator_spread_score: signals.creator_spread_score ?? signals.creator_spread_points ?? null,
      freshness_score: signals.freshness_score ?? signals.freshness_points ?? null,
      replication_score: signals.replication_score ?? signals.replication_strength ?? signals.replication_points ?? null,
      cross_surface_score: signals.cross_surface_score ?? signals.cross_surface_points ?? null
    },
    quality: {
      classification: rankable ? 'RANKABLE' : 'NEEDS_MORE_DATA',
      rankable,
      available_components: compEval.available_components,
      missing_components: compEval.missing_components,
      not_scored_components: compEval.not_scored_components,
      coverage_reconciliation: compEval.coverage_reconciliation,
      source_limitations: detectSourceLimitations(topic, sourceRuns)
    },
    evidence: extractRepresentativeEvidence(topic.evidence, 3)
  };
}

/**
 * Build the full top-level Trend Report model from a results payload or file path
 * @param {Object|string} payloadOrPath 
 * @returns {Object}
 */
function buildTrendReport(payloadOrPath = DEFAULT_OUTPUT_PATH) {
  let payload = payloadOrPath;
  if (typeof payloadOrPath === 'string') {
    if (!fs.existsSync(payloadOrPath)) {
      throw new Error(`Results payload not found at path: ${payloadOrPath}`);
    }
    payload = JSON.parse(fs.readFileSync(payloadOrPath, 'utf8'));
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload provided to buildTrendReport');
  }

  const rawTopics = Array.isArray(payload.topics) ? payload.topics : [];
  const sourceRuns = Array.isArray(payload.source_runs) ? payload.source_runs : [];

  // Top-level Scan Metadata
  const scan = {
    scan_id: payload.scan_id || null,
    scan_number: payload.scan_number !== undefined ? payload.scan_number : null,
    scan_kind: payload.scan_kind || null,
    scan_time: payload.scan_time || null,
    execution_status: payload.execution_status || 'UNKNOWN',
    data_quality_status: payload.data_quality_status || 'UNKNOWN',
    browser_execution_mode: payload.browser_execution_mode || 'UNKNOWN',
    market: payload.market || 'VN',
    platform: payload.platform || 'tiktok'
  };

  // Structured Source Health
  const sourceMap = {};
  let totalSources = 0;
  let successfulSources = 0;
  let limitedOrUnavailableSources = 0;

  for (const run of sourceRuns) {
    totalSources++;
    const isSuccess = run.status === 'SUCCESS' || run.status === 'SEARCH_RESULTS_AVAILABLE';
    if (isSuccess) successfulSources++;
    else limitedOrUnavailableSources++;

    sourceMap[run.source] = {
      status: run.status,
      raw_items_found: run.raw_items_found !== undefined ? run.raw_items_found : 0,
      candidates_kept: run.candidates_kept !== undefined ? run.candidates_kept : 0,
      error: run.error || null,
      note: run.note || null
    };
  }

  const source_health = {
    total_sources: totalSources,
    successful_sources: successfulSources,
    limited_sources: limitedOrUnavailableSources,
    sources: sourceMap
  };

  // Transform each topic
  const transformedTopics = rawTopics.map(t => buildPerTrendModel(t, sourceRuns));

  // Split into ranked_trends vs needs_more_data
  const ranked_trends = transformedTopics.filter(t => t.quality.rankable);
  const needs_more_data = transformedTopics.filter(t => !t.quality.rankable);

  // Deterministic Sorting:
  // 1. ranked_trends: trend_score DESC, then momentum DESC, then topic_id ASC
  ranked_trends.sort((a, b) => {
    if (b.trend_score.value !== a.trend_score.value) {
      return b.trend_score.value - a.trend_score.value;
    }
    const momA = typeof a.momentum.value === 'number' ? a.momentum.value : -Infinity;
    const momB = typeof b.momentum.value === 'number' ? b.momentum.value : -Infinity;
    if (momB !== momA) {
      return momB - momA;
    }
    return a.identity.topic_id.localeCompare(b.identity.topic_id);
  });

  // 2. needs_more_data: coverage DESC, then sample_size DESC, then topic_id ASC
  needs_more_data.sort((a, b) => {
    const covA = typeof a.trend_score.coverage === 'number' ? a.trend_score.coverage : -1;
    const covB = typeof b.trend_score.coverage === 'number' ? b.trend_score.coverage : -1;
    if (covB !== covA) {
      return covB - covA;
    }
    const samplesA = a.evidence_quality.sample_size || 0;
    const samplesB = b.evidence_quality.sample_size || 0;
    if (samplesB !== samplesA) {
      return samplesB - samplesA;
    }
    return a.identity.topic_id.localeCompare(b.identity.topic_id);
  });

  // Summary Metrics
  const highConfidenceCount = transformedTopics.filter(t => t.state.confidence === 'HIGH').length;
  const topRankedTopicId = ranked_trends.length > 0 ? ranked_trends[0].identity.topic_id : null;

  const summary = {
    total_topics_analyzed: transformedTopics.length,
    ranked_trend_count: ranked_trends.length,
    needs_more_data_count: needs_more_data.length,
    high_confidence_count: highConfidenceCount,
    source_limitations_count: limitedOrUnavailableSources,
    top_ranked_topic_id: topRankedTopicId
  };

  return {
    scan,
    source_health,
    summary,
    ranked_trends,
    needs_more_data
  };
}

module.exports = {
  buildTrendReport,
  buildPerTrendModel,
  isTopicRankable,
  evaluateComponentAvailability,
  detectMissingComponents,
  detectSourceLimitations,
  extractRepresentativeEvidence,
  truncateCaption,
  MIN_SCORE_COVERAGE,
  COMPONENT_MAX_WEIGHTS
};
