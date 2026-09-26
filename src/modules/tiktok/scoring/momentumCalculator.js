/**
 * TIKTOK MOMENTUM CALCULATOR (PHASE 4.0A CONTRACT)
 * 
 * Rules:
 * 1. Subweights:
 *    - CC Rank movement: 20
 *    - CC Post growth: 20
 *    - CC View growth: 20
 *    - Freshness shift / current: 20
 *    - Evidence turnover: 15
 *    - Cross-surface change: 5
 *    Total available weights = 100
 * 2. Denominator ignores missing submetrics.
 * 3. Minimum coverage: >= 0.50 (50%).
 *    - If coverage < 0.50: momentum_score = null, momentum_status = "INSUFFICIENT_DATA"
 * 4. Baseline Scan #1 (no previous snapshot):
 *    - momentum_score = null, momentum_status = "UNKNOWN"
 * 5. Momentum Status Mapping (Exact Boundaries):
 *    - 0  <= score <= 34  -> "DECLINING"
 *    - 35 <= score <= 49  -> "WEAK"
 *    - 50 <= score <= 64  -> "STABLE_OR_GROWING"
 *    - 65 <= score <= 79  -> "RISING"
 *    - 80 <= score <= 100 -> "SURGING"
 * 6. Creative Center 7d Semantics:
 *    - structured_metric_window = "creative_center_7d"
 *    - structured_delta_semantics = "rolling_window_snapshot_delta"
 * 7. Raw Signal Auditability: Stores raw signals, delta, normalized (0-100), and component points.
 */

const MOMENTUM_METHOD_VERSION = 'v1';

const SUBWEIGHTS = {
  CC_RANK_MOVEMENT: 20,
  CC_POST_GROWTH: 20,
  CC_VIEW_GROWTH: 20,
  FRESHNESS_SHIFT: 20,
  EVIDENCE_TURNOVER: 15,
  CROSS_SURFACE_CHANGE: 5,
  // Lowercase aliases for convenience
  rank: 20,
  posts: 20,
  views: 20,
  freshness: 20,
  turnover: 15,
  cross_surface: 5
};

const MIN_COVERAGE = 0.50;

/**
 * Classifies momentum status from normalized 0-100 score
 * Strict boundaries:
 * 0-34   -> DECLINING
 * 35-49  -> WEAK
 * 50-64  -> STABLE_OR_GROWING
 * 65-79  -> RISING
 * 80-100 -> SURGING
 * @param {number|null} score 
 * @returns {string}
 */
function classifyMomentumStatus(score) {
  if (score === null || score === undefined || typeof score !== 'number' || isNaN(score)) {
    return 'INSUFFICIENT_DATA';
  }
  const s = Math.round(score);
  if (s >= 80) return 'SURGING';
  if (s >= 65) return 'RISING';
  if (s >= 50) return 'STABLE_OR_GROWING';
  if (s >= 35) return 'WEAK';
  return 'DECLINING';
}

/**
 * Calculate rank movement submetric
 * P_prev - P_curr (lower rank number is better, e.g. rank 1 is better than rank 3)
 */
function calculateRankMovement(currRank, prevRank) {
  if (currRank === null || currRank === undefined || prevRank === null || prevRank === undefined) {
    const raw = (prevRank !== null && prevRank !== undefined)
      ? { previous: prevRank, current: currRank !== undefined ? currRank : null, delta: null }
      : null;
    return { raw, normalized: null, component_points: null };
  }
  const delta = prevRank - currRank;
  let normalized = 50;
  if (delta >= 2) normalized = 100;
  else if (delta === 1) normalized = 75;
  else if (delta === 0) normalized = 50;
  else if (delta === -1) normalized = 25;
  else normalized = 0;

  const component_points = (normalized / 100) * SUBWEIGHTS.CC_RANK_MOVEMENT;
  return {
    raw: { previous: prevRank, current: currRank, delta },
    normalized,
    component_points
  };
}

/**
 * Normalizes growth percentage according to V1 contract
 * growth_pct >= 0.05               -> 100
 * 0.01 <= growth_pct < 0.05        -> 75
 * 0 <= growth_pct < 0.01           -> 60 (specifically 0 -> 60)
 * -0.01 <= growth_pct < 0          -> 40
 * -0.05 <= growth_pct < -0.01      -> 25
 * growth_pct < -0.05               -> 0
 */
function normalizeGrowthPct(growth_pct) {
  if (growth_pct >= 0.05) return 100;
  if (growth_pct >= 0.01) return 75;
  if (growth_pct >= 0) return 60;
  if (growth_pct >= -0.01) return 40;
  if (growth_pct >= -0.05) return 25;
  return 0;
}

/**
 * Calculate post growth submetric from Creative Center observations
 * Strictly CC posts only. No sample_size fallback.
 */
function calculatePostGrowth(currPosts, prevPosts) {
  if (currPosts === null || currPosts === undefined || prevPosts === null || prevPosts === undefined) {
    const raw = (prevPosts !== null && prevPosts !== undefined)
      ? {
          previous: prevPosts,
          current: currPosts !== undefined ? currPosts : null,
          delta: null,
          growth_pct: null,
          structured_metric_window: 'creative_center_7d',
          structured_delta_semantics: 'rolling_window_snapshot_delta'
        }
      : null;
    return { raw, normalized: null, component_points: null };
  }

  const prevVal = Math.max(1, prevPosts);
  const delta = currPosts - prevPosts;
  const growth_pct = delta / prevVal;

  const normalized = normalizeGrowthPct(growth_pct);
  const component_points = (normalized / 100) * SUBWEIGHTS.CC_POST_GROWTH;

  return {
    raw: {
      previous: prevPosts,
      current: currPosts,
      delta,
      growth_pct,
      structured_metric_window: 'creative_center_7d',
      structured_delta_semantics: 'rolling_window_snapshot_delta'
    },
    normalized,
    component_points
  };
}

/**
 * Calculate view growth submetric from Creative Center observations
 * Strictly CC views only. No unique_creators fallback.
 */
function calculateViewGrowth(currViews, prevViews) {
  if (currViews === null || currViews === undefined || prevViews === null || prevViews === undefined) {
    const raw = (prevViews !== null && prevViews !== undefined)
      ? {
          previous: prevViews,
          current: currViews !== undefined ? currViews : null,
          delta: null,
          growth_pct: null,
          structured_metric_window: 'creative_center_7d',
          structured_delta_semantics: 'rolling_window_snapshot_delta'
        }
      : null;
    return { raw, normalized: null, component_points: null };
  }

  const prevVal = Math.max(1, prevViews);
  const delta = currViews - prevViews;
  const growth_pct = delta / prevVal;

  const normalized = normalizeGrowthPct(growth_pct);
  const component_points = (normalized / 100) * SUBWEIGHTS.CC_VIEW_GROWTH;
  return {
    raw: {
      previous: prevViews,
      current: currViews,
      delta,
      growth_pct,
      structured_metric_window: 'creative_center_7d',
      structured_delta_semantics: 'rolling_window_snapshot_delta'
    },
    normalized,
    component_points
  };
}

/**
 * Calculate freshness shift submetric
 */
function calculateFreshnessShift(currentFreshCounts) {
  if (!currentFreshCounts) return { raw: null, normalized: null, component_points: null };
  if (currentFreshCounts.freshness_observation_status === 'UNAVAILABLE') {
    return { raw: null, normalized: null, component_points: null };
  }
  const { fresh_0_24h = null, fresh_24_72h = null, fresh_3_7d = null, older_7d = null } = currentFreshCounts;
  if (fresh_0_24h === null && fresh_24_72h === null && fresh_3_7d === null && older_7d === null) {
    return { raw: null, normalized: null, component_points: null };
  }

  const f0 = fresh_0_24h || 0;
  const f24 = fresh_24_72h || 0;
  const f3 = fresh_3_7d || 0;
  const fold = older_7d || 0;
  const knownCount = f0 + f24 + f3 + fold;

  if (knownCount === 0) return { raw: null, normalized: null, component_points: null };

  const freshRatio = (f0 * 1.0 + f24 * 0.7) / knownCount;
  const clampedRatio = Math.min(1.0, Math.max(0, freshRatio));
  const normalized = Math.round(clampedRatio * 100);
  const component_points = clampedRatio * SUBWEIGHTS.FRESHNESS_SHIFT;

  return {
    raw: { fresh_0_24h: f0, fresh_24_72h: f24, fresh_3_7d: f3, older_7d: fold, known_count: knownCount, fresh_ratio: freshRatio },
    normalized,
    component_points
  };
}

/**
 * Calculate evidence turnover submetric
 */
function calculateTurnover(currentEvidenceUrls = [], previousEvidenceUrls = []) {
  if (!Array.isArray(currentEvidenceUrls) || currentEvidenceUrls.length === 0) {
    return { raw: null, normalized: null, component_points: null };
  }
  const prevSet = new Set((previousEvidenceUrls || []).map(u => (u || '').split('?')[0].replace(/\/+$/, '')));
  let newCount = 0;
  for (const url of currentEvidenceUrls) {
    const clean = (url || '').split('?')[0].replace(/\/+$/, '');
    if (!prevSet.has(clean)) {
      newCount++;
    }
  }

  const turnoverRatio = newCount / currentEvidenceUrls.length;
  const normalized = Math.round(turnoverRatio * 100);
  const component_points = turnoverRatio * SUBWEIGHTS.EVIDENCE_TURNOVER;

  return {
    raw: { new_evidence_count: newCount, current_count: currentEvidenceUrls.length, turnover_ratio: turnoverRatio },
    normalized,
    component_points
  };
}

/**
 * Calculate cross surface change submetric
 */
function calculateCrossSurfaceChange(currSurfaceCount, prevSurfaceCount) {
  if (currSurfaceCount === null || currSurfaceCount === undefined) {
    return { raw: null, normalized: null, component_points: null };
  }
  const prev = prevSurfaceCount !== null && prevSurfaceCount !== undefined ? prevSurfaceCount : 1;
  const delta = currSurfaceCount - prev;

  let normalized = 50;
  if (delta > 0) normalized = 100;
  else if (delta === 0) normalized = 50;
  else normalized = 0;

  const component_points = (normalized / 100) * SUBWEIGHTS.CROSS_SURFACE_CHANGE;
  return {
    raw: { previous: prev, current: currSurfaceCount, delta },
    normalized,
    component_points
  };
}

/**
 * Calculates complete momentum metrics
 * @param {Object} current Current scan data
 * @param {Object|null} previous Previous baseline snapshot
 * @returns {Object}
 */
function calculateMomentum(current = {}, previous = null) {
  // Baseline scan rule: no prior snapshot -> UNKNOWN, null score
  if (!previous) {
    return {
      momentum_method_version: MOMENTUM_METHOD_VERSION,
      momentum_score: null,
      momentum_status: 'UNKNOWN',
      coverage: 0,
      coverage_audit: {
        available_subweights: 0,
        total_subweights: 100,
        momentum_coverage: 0,
        rank_component: null,
        post_component: null,
        view_component: null,
        freshness_component: null,
        evidence_turnover_component: null,
        cross_surface_component: null
      },
      raw_signals: {
        rank: null,
        posts: null,
        views: null,
        freshness: null,
        turnover: null,
        cross_surface: null
      }
    };
  }

  const rankRes = calculateRankMovement(current.ccRank, previous.ccRank);
  const postRes = calculatePostGrowth(current.ccPosts, previous.ccPosts);
  const viewRes = calculateViewGrowth(current.ccViews, previous.ccViews);
  const freshRes = calculateFreshnessShift(current.freshCounts);
  const turnoverRes = calculateTurnover(current.evidenceUrls, previous.evidenceUrls);
  const crossRes = calculateCrossSurfaceChange(current.surfaceCount, previous.surfaceCount);

  let availableWeight = 0;
  let earnedWeight = 0;

  if (rankRes.component_points !== null) {
    availableWeight += SUBWEIGHTS.CC_RANK_MOVEMENT;
    earnedWeight += rankRes.component_points;
  }
  if (postRes.component_points !== null) {
    availableWeight += SUBWEIGHTS.CC_POST_GROWTH;
    earnedWeight += postRes.component_points;
  }
  if (viewRes.component_points !== null) {
    availableWeight += SUBWEIGHTS.CC_VIEW_GROWTH;
    earnedWeight += viewRes.component_points;
  }
  if (freshRes.component_points !== null) {
    availableWeight += SUBWEIGHTS.FRESHNESS_SHIFT;
    earnedWeight += freshRes.component_points;
  }
  if (turnoverRes.component_points !== null) {
    availableWeight += SUBWEIGHTS.EVIDENCE_TURNOVER;
    earnedWeight += turnoverRes.component_points;
  }
  if (crossRes.component_points !== null) {
    availableWeight += SUBWEIGHTS.CROSS_SURFACE_CHANGE;
    earnedWeight += crossRes.component_points;
  }

  const coverage = availableWeight / 100;

  const coverage_audit = {
    available_subweights: availableWeight,
    total_subweights: 100,
    momentum_coverage: coverage,
    rank_component: rankRes.component_points,
    post_component: postRes.component_points,
    view_component: viewRes.component_points,
    freshness_component: freshRes.component_points,
    evidence_turnover_component: turnoverRes.component_points,
    cross_surface_component: crossRes.component_points
  };

  const raw_signals = {
    rank: rankRes.raw ? { ...rankRes.raw, normalized: rankRes.normalized } : null,
    posts: postRes.raw ? { ...postRes.raw, normalized: postRes.normalized } : null,
    views: viewRes.raw ? { ...viewRes.raw, normalized: viewRes.normalized } : null,
    freshness: freshRes.raw ? { ...freshRes.raw, normalized: freshRes.normalized } : null,
    turnover: turnoverRes.raw ? { ...turnoverRes.raw, normalized: turnoverRes.normalized } : null,
    cross_surface: crossRes.raw ? { ...crossRes.raw, normalized: crossRes.normalized } : null
  };

  // Rule: coverage < 0.50 -> momentum_score = null, momentum_status = 'INSUFFICIENT_DATA'
  if (coverage < MIN_COVERAGE) {
    return {
      momentum_method_version: MOMENTUM_METHOD_VERSION,
      momentum_score: null,
      momentum_status: 'INSUFFICIENT_DATA',
      coverage,
      coverage_audit,
      raw_signals
    };
  }

  const normalized100 = Math.min(100, Math.max(0, Math.round((earnedWeight / availableWeight) * 100)));
  const status = classifyMomentumStatus(normalized100);

  return {
    momentum_method_version: MOMENTUM_METHOD_VERSION,
    momentum_score: normalized100,
    momentum_status: status,
    coverage,
    coverage_audit,
    raw_signals
  };
}

// Helper aliases for tests
function calculateRankMovementScore(curr, prev) {
  return calculateRankMovement(curr, prev).component_points;
}
function calculatePostGrowthScore(curr, prev, currS, prevS) {
  return calculatePostGrowth(curr, prev, currS, prevS).component_points;
}
function calculateViewGrowthScore(curr, prev, currC, prevC) {
  return calculateViewGrowth(curr, prev, currC, prevC).component_points;
}
function calculateFreshnessShiftScore(counts) {
  return calculateFreshnessShift(counts).component_points;
}
function calculateTurnoverScore(currUrls, prevUrls) {
  return calculateTurnover(currUrls, prevUrls).component_points;
}
function calculateCrossSurfaceChangeScore(currS, prevS) {
  return calculateCrossSurfaceChange(currS, prevS).component_points;
}

module.exports = {
  MOMENTUM_METHOD_VERSION,
  SUBWEIGHTS,
  MIN_COVERAGE,
  classifyMomentumStatus,
  normalizeGrowthPct,
  calculateRankMovement,
  calculatePostGrowth,
  calculateViewGrowth,
  calculateFreshnessShift,
  calculateTurnover,
  calculateCrossSurfaceChange,
  calculateCrossSurfaceMomentum: calculateCrossSurfaceChange,
  calculateMomentum,
  // Helper aliases
  calculateRankMovementScore,
  calculatePostGrowthScore,
  calculateViewGrowthScore,
  calculateFreshnessShiftScore,
  calculateTurnoverScore,
  calculateCrossSurfaceChangeScore
};
