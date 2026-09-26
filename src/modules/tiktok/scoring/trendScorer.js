/**
 * TIKTOK TREND SCORER & CLASSIFIER (PHASE 4.0A V1)
 * 
 * Rules:
 * 1. Score Version: 'v1'
 * 2. 6 Components:
 *    - Momentum: max 30 points
 *    - Creator Spread: max 20 points
 *    - Freshness: max 20 points
 *    - Replication: max 15 points
 *    - Cross-Surface: max 10 points
 *    - Engagement: max 5 points
 * 3. Engagement V1:
 *    - Always null, engagement_status = 'NOT_SCORED_IN_V1'
 *    - Available weight = 95 when all other 5 components available
 * 4. Score Coverage: available_weight / 100 must be >= 0.80.
 *    - If score_coverage < 0.80: trend_score = null, score_status = 'INSUFFICIENT_DATA'
 * 5. Normalization to 100: (raw_points / available_weight) * 100
 * 6. Scan #2 Rules:
 *    - If previous snapshot had trend_score = null, then previous_score = null, score_delta = null.
 *    - If previous snapshot had numeric trend_score (Scan 3+), previous_score = prev, score_delta = curr - prev.
 */

const { calculateMomentum } = require('./momentumCalculator');
const { classifyLifecycle } = require('./lifecycleClassifier');

const SCORE_VERSION = 'v1';

const COMPONENT_MAX_WEIGHTS = {
  MOMENTUM: 30,
  CREATOR_SPREAD: 20,
  FRESHNESS: 20,
  REPLICATION: 15,
  CROSS_SURFACE: 10,
  ENGAGEMENT: 5
};

const MIN_SCORE_COVERAGE = 0.80;

/**
 * Clamps any raw score strictly between 0 and 100
 * @param {number} rawScore
 * @returns {number}
 */
function clampScore(rawScore) {
  if (typeof rawScore !== 'number' || isNaN(rawScore)) return 0;
  return Math.min(100, Math.max(0, Math.round(rawScore)));
}

/**
 * Classifies publication time into standard freshness buckets
 * @param {string|number|Date} publishedInput ISO string, Date object, or relative hours/days
 * @param {Date} referenceDate 
 * @returns {'0-24h' | '24-72h' | '3-7d' | '>7d' | 'UNKNOWN'}
 */
function classifyTimeBucket(publishedInput, referenceDate = new Date()) {
  if (!publishedInput) return 'UNKNOWN';

  let diffHours = null;

  if (typeof publishedInput === 'string') {
    const s = publishedInput.trim().toLowerCase();
    const hourMatch = s.match(/^(\d+)\s*(?:h|hr|hour|hours|giờ)/);
    const dayMatch = s.match(/^(\d+)\s*(?:d|day|days|ngày)/);

    if (hourMatch) {
      diffHours = parseFloat(hourMatch[1]);
    } else if (dayMatch) {
      diffHours = parseFloat(dayMatch[1]) * 24;
    } else {
      const parsed = new Date(publishedInput);
      if (!isNaN(parsed.getTime())) {
        const diffMs = referenceDate.getTime() - parsed.getTime();
        diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
      }
    }
  } else if (typeof publishedInput === 'number') {
    if (publishedInput < 10000) {
      diffHours = publishedInput;
    } else {
      const diffMs = referenceDate.getTime() - publishedInput;
      diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
    }
  } else if (publishedInput instanceof Date && !isNaN(publishedInput.getTime())) {
    const diffMs = referenceDate.getTime() - publishedInput.getTime();
    diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
  }

  if (diffHours === null) return 'UNKNOWN';

  if (diffHours <= 24) return '0-24h';
  if (diffHours <= 72) return '24-72h';
  if (diffHours <= 168) return '3-7d';
  return '>7d';
}

/**
 * Deduplicate evidence videos by canonical URL
 * @param {Array} videos 
 * @returns {Array} Deduplicated list
 */
function deduplicateEvidence(videos = []) {
  const seen = new Set();
  const deduped = [];

  for (const v of videos) {
    if (!v || !v.video_url) continue;
    const cleanUrl = v.video_url.split('?')[0].replace(/\/+$/, '');
    if (!seen.has(cleanUrl)) {
      seen.add(cleanUrl);
      deduped.push({
        ...v,
        video_url: cleanUrl,
        views: v.views !== undefined && v.views !== null ? Number(v.views) : null,
        likes: v.likes !== undefined && v.likes !== null ? Number(v.likes) : null,
        comments: v.comments !== undefined && v.comments !== null ? Number(v.comments) : null,
        sound: v.sound || null
      });
    }
  }

  return deduped;
}

/**
 * Counts unique creators among evidence videos
 * @param {Array} videos 
 * @returns {number}
 */
function countUniqueCreators(videos = []) {
  const creators = new Set();
  for (const v of videos) {
    if (v && v.creator && typeof v.creator === 'string' && v.creator.trim().length > 0) {
      creators.add(v.creator.trim().toLowerCase());
    }
  }
  return creators.size;
}

/**
 * Light screening for candidate
 */
function lightScreenCandidate(candidate, evidenceSample = []) {
  const deduped = deduplicateEvidence(evidenceSample);
  const sampleSize = deduped.length;
  const uniqueCreators = countUniqueCreators(deduped);

  if (sampleSize < 2) {
    return {
      status: 'DROP',
      reason: 'Mẫu quá ít (< 2 video), không đủ dấu hiệu ban đầu'
    };
  }

  if (sampleSize >= 3 && uniqueCreators === 1) {
    return {
      status: 'DROP',
      reason: 'Toàn bộ video từ 1 creator duy nhất (không có tính lan truyền/lặp lại)'
    };
  }

  const freshCount = deduped.filter(v => {
    const bucket = classifyTimeBucket(v.published_at);
    return bucket === '0-24h' || bucket === '24-72h' || bucket === '3-7d';
  }).length;

  if (freshCount === 0 && sampleSize >= 3) {
    return {
      status: 'DROP',
      reason: 'Tất cả video mẫu đều đã quá 7 ngày (>7d), không còn tính thời sự'
    };
  }

  return {
    status: 'PROMOTE_TO_VALIDATION',
    sample_size: sampleSize,
    unique_creators: uniqueCreators,
    reason: `Đạt sàng lọc bước 1 (${sampleSize} video từ ${uniqueCreators} creator, có video mới)`
  };
}

/**
 * Maps replication to points according to contract (CRITICAL ISSUE 9)
 * true -> 15
 * partial / ambiguous -> 7.5
 * false -> 0
 * insufficient / unknown / null -> null
 * (No mapping 12!)
 */
function mapReplicationPoints(currentReplication) {
  if (currentReplication === true) return 15;
  if (currentReplication === 'partial' || currentReplication === 'ambiguous') return 7.5;
  if (currentReplication === false) return 0;
  return null;
}

/**
 * Maps independent discovery surface count to trend component points (CRITICAL ISSUE 8)
 * 1 -> 4
 * 2 -> 7
 * >= 3 -> 10
 * unknown / 0 / null -> null
 * (No mapping 8!)
 */
function mapCrossSurfacePoints(surfaceCount) {
  if (surfaceCount === null || surfaceCount === undefined || typeof surfaceCount !== 'number' || surfaceCount < 1) {
    return null;
  }
  if (surfaceCount === 1) return 4;
  if (surfaceCount === 2) return 7;
  if (surfaceCount >= 3) return 10;
  return null;
}

/**
 * Calculates raw signals and sub-scores for a validated topic
 * @param {Object} params
 * @param {Array} params.evidence 
 * @param {Object|null} params.previousSnapshot 
 * @param {number|null} params.crossSurfaceSignal
 * @param {number|null} params.currentSurfaceCount
 * @param {number|null} params.replicationStrength
 * @param {boolean|string|null} params.currentReplication
 * @param {Object|null} params.currentCandidateExtra
 * @param {number} params.scanNumber Current scan number (default 2)
 * @returns {Object} Raw signals and score components
 */
function evaluateTopicSignals({
  evidence = [],
  previousSnapshot = null,
  crossSurfaceSignal = null,
  currentSurfaceCount = null,
  currentDiscoverySurfaces = null,
  replicationStrength = null,
  currentReplication = null,
  currentCandidateExtra = {},
  scanNumber = 2
}) {
  const deduped = deduplicateEvidence(evidence);
  const sampleSize = deduped.length;
  const uniqueCreators = countUniqueCreators(deduped);

  // 1. Creator Spread Score (Max 20) - (CRITICAL ISSUE 2)
  let creator_spread_ratio = null;
  let creator_spread_points = null;
  let creator_spread_score = null;
  if (sampleSize > 0) {
    creator_spread_ratio = uniqueCreators / sampleSize;
    creator_spread_points = Math.round(creator_spread_ratio * COMPONENT_MAX_WEIGHTS.CREATOR_SPREAD);
    if (uniqueCreators < 2) {
      creator_spread_points = Math.min(creator_spread_points, 4);
    }
    creator_spread_score = creator_spread_points;
  }

  // 2. Freshness Score (Max 20) - (CRITICAL ISSUE 3)
  let fresh_0_24h = null;
  let fresh_24_72h = null;
  let fresh_3_7d = null;
  let older_7d = null;
  let known_timestamp_count = 0;
  let unknown_timestamp_count = null;
  let freshness_timestamp_coverage = null;
  let fresh_72h_ratio = null;
  let fresh_7d_ratio = null;
  let freshness_normalized = null;
  let freshness_points = null;
  let freshness_score = null;
  let freshness_observation_status = 'UNAVAILABLE';

  if (sampleSize > 0) {
    fresh_0_24h = 0;
    fresh_24_72h = 0;
    fresh_3_7d = 0;
    older_7d = 0;

    for (const v of deduped) {
      const bucket = classifyTimeBucket(v.published_at);
      if (bucket === '0-24h') fresh_0_24h++;
      else if (bucket === '24-72h') fresh_24_72h++;
      else if (bucket === '3-7d') fresh_3_7d++;
      else if (bucket === '>7d') older_7d++;
    }

    known_timestamp_count = fresh_0_24h + fresh_24_72h + fresh_3_7d + older_7d;
    unknown_timestamp_count = Math.max(0, sampleSize - known_timestamp_count);
    freshness_timestamp_coverage = known_timestamp_count / sampleSize;

    if (known_timestamp_count === sampleSize) {
      freshness_observation_status = 'AVAILABLE';
    } else if (known_timestamp_count > 0) {
      freshness_observation_status = 'PARTIAL';
    } else {
      freshness_observation_status = 'UNAVAILABLE';
    }

    // Freshness points available only if: known_timestamp_count / sampleSize >= 0.50
    if (known_timestamp_count > 0 && freshness_timestamp_coverage >= 0.50) {
      // Freshness calculation denominator: known_timestamp_count, not sample_size (Section 11)
      fresh_72h_ratio = (fresh_0_24h + fresh_24_72h) / known_timestamp_count;
      fresh_7d_ratio = (fresh_0_24h + fresh_24_72h + fresh_3_7d) / known_timestamp_count;
      const freshRatio = (fresh_0_24h * 1.0 + fresh_24_72h * 0.7 + fresh_3_7d * 0.3) / known_timestamp_count;
      freshness_points = Math.min(COMPONENT_MAX_WEIGHTS.FRESHNESS, Math.round(freshRatio * COMPONENT_MAX_WEIGHTS.FRESHNESS));
      freshness_score = freshness_points;
      freshness_normalized = Math.round((freshness_points / COMPONENT_MAX_WEIGHTS.FRESHNESS) * 100);
    }
  } else {
    freshness_observation_status = 'UNAVAILABLE';
    known_timestamp_count = 0;
    unknown_timestamp_count = null;
    freshness_timestamp_coverage = null;
  }

  // 3. Replication Score (Max 15) - (CRITICAL ISSUES 1 & 9)
  let resolvedReplication = currentReplication;
  if (sampleSize === 0) {
    resolvedReplication = null;
  }
  let replication_points = mapReplicationPoints(resolvedReplication);
  let replication_status = 'INSUFFICIENT_CURRENT_EVIDENCE';
  if (resolvedReplication === true) {
    replication_status = 'CONFIRMED';
  } else if (resolvedReplication === 'partial' || resolvedReplication === 'ambiguous') {
    replication_status = 'PARTIAL';
  } else if (resolvedReplication === false) {
    replication_status = 'NOT_REPLICATED';
  } else {
    replication_status = 'INSUFFICIENT_CURRENT_EVIDENCE';
  }
  const replication_score = replication_points;

  // 4. Cross Surface Score (Max 10) - (CRITICAL ISSUES 7 & 8)
  let resolvedSurfaceCount = null;
  if (typeof currentSurfaceCount === 'number') {
    resolvedSurfaceCount = currentSurfaceCount;
  } else if (Array.isArray(currentDiscoverySurfaces)) {
    resolvedSurfaceCount = currentDiscoverySurfaces.length;
  } else if (currentCandidateExtra && typeof currentCandidateExtra.current_surface_count === 'number') {
    resolvedSurfaceCount = currentCandidateExtra.current_surface_count;
  } else if (currentCandidateExtra && typeof currentCandidateExtra.surfaceCount === 'number') {
    resolvedSurfaceCount = currentCandidateExtra.surfaceCount;
  } else if (typeof crossSurfaceSignal === 'number') {
    if (crossSurfaceSignal === 4) resolvedSurfaceCount = 1;
    else if (crossSurfaceSignal === 7) resolvedSurfaceCount = 2;
    else if (crossSurfaceSignal === 10) resolvedSurfaceCount = 3;
    else if (crossSurfaceSignal >= 1 && crossSurfaceSignal <= 3) resolvedSurfaceCount = crossSurfaceSignal;
  }
  const cross_surface_points = mapCrossSurfacePoints(resolvedSurfaceCount);
  const cross_surface_score = cross_surface_points;

  // 5. Engagement Score (Max 5) - Strictly NOT_SCORED_IN_V1
  const engagement_score = null;
  const engagement_points = null;
  const engagement_status = 'NOT_SCORED_IN_V1';

  // 6. Momentum Score (Max 30)
  let momentum_score = null;
  let momentum_status = 'UNKNOWN';
  let momentum_raw_signals = null;
  let momentum_coverage_audit = null;
  let momentum_component_points = null;

  if (previousSnapshot) {
    let prevUrls = [];
    if (Array.isArray(previousSnapshot.evidence)) {
      prevUrls = previousSnapshot.evidence.map(e => e.video_url || e);
    }

    const freshCounts = {
      fresh_0_24h: fresh_0_24h || 0,
      fresh_24_72h: fresh_24_72h || 0,
      fresh_3_7d: fresh_3_7d || 0,
      older_7d: older_7d || 0
    };

    const momentumRes = calculateMomentum(
      {
        ccRank: currentCandidateExtra.ccRank !== undefined ? currentCandidateExtra.ccRank : null,
        ccPosts: currentCandidateExtra.ccPosts !== undefined ? currentCandidateExtra.ccPosts : null,
        ccViews: currentCandidateExtra.ccViews !== undefined ? currentCandidateExtra.ccViews : null,
        sample_size: sampleSize,
        unique_creators: uniqueCreators,
        freshCounts,
        known_timestamp_count,
        evidenceUrls: deduped.map(v => v.video_url),
        surfaceCount: (resolvedSurfaceCount !== undefined && resolvedSurfaceCount !== null) ? resolvedSurfaceCount : 0
      },
      {
        ccRank: previousSnapshot.ccRank !== undefined && previousSnapshot.ccRank !== null
          ? previousSnapshot.ccRank
          : (previousSnapshot.cc_rank !== undefined ? previousSnapshot.cc_rank : null),
        ccPosts: previousSnapshot.ccPosts !== undefined && previousSnapshot.ccPosts !== null
          ? previousSnapshot.ccPosts
          : (previousSnapshot.cc_posts !== undefined ? previousSnapshot.cc_posts : null),
        ccViews: previousSnapshot.ccViews !== undefined && previousSnapshot.ccViews !== null
          ? previousSnapshot.ccViews
          : (previousSnapshot.cc_views !== undefined ? previousSnapshot.cc_views : null),
        sample_size: previousSnapshot.sample_size !== undefined ? previousSnapshot.sample_size : null,
        unique_creators: previousSnapshot.unique_creators !== undefined ? previousSnapshot.unique_creators : null,
        evidenceUrls: prevUrls,
        surfaceCount: previousSnapshot.surfaceCount !== undefined ? previousSnapshot.surfaceCount : 1
      }
    );

    momentum_score = momentumRes.momentum_score;
    momentum_status = momentumRes.momentum_status;
    momentum_coverage_audit = momentumRes.coverage_audit;
    momentum_raw_signals = momentumRes.raw_signals;

    if (momentum_score !== null) {
      momentum_component_points = (momentum_score / 100) * COMPONENT_MAX_WEIGHTS.MOMENTUM;
    }
  } else {
    momentum_status = 'UNKNOWN';
    momentum_score = null;
  }

  // 7. Calculate Trend Score V1 with Score Coverage (CRITICAL ISSUE 4)
  let availableWeight = 0;
  let rawEarnedPoints = 0;

  if (creator_spread_points !== null) {
    availableWeight += COMPONENT_MAX_WEIGHTS.CREATOR_SPREAD;
    rawEarnedPoints += creator_spread_points;
  }

  if (freshness_points !== null) {
    availableWeight += COMPONENT_MAX_WEIGHTS.FRESHNESS;
    rawEarnedPoints += freshness_points;
  }

  if (replication_points !== null) {
    availableWeight += COMPONENT_MAX_WEIGHTS.REPLICATION;
    rawEarnedPoints += replication_points;
  }

  if (cross_surface_points !== null) {
    availableWeight += COMPONENT_MAX_WEIGHTS.CROSS_SURFACE;
    rawEarnedPoints += cross_surface_points;
  }

  if (momentum_component_points !== null) {
    availableWeight += COMPONENT_MAX_WEIGHTS.MOMENTUM;
    rawEarnedPoints += momentum_component_points;
  }

  const scoreCoverage = availableWeight / 100;
  let trend_score = null;
  let score_status = 'INSUFFICIENT_DATA';

  if (!previousSnapshot && scanNumber === 1) {
    trend_score = null;
    score_status = 'NOT_READY';
  } else if (scoreCoverage >= MIN_SCORE_COVERAGE) {
    trend_score = clampScore((rawEarnedPoints / availableWeight) * 100);
    score_status = 'READY';
  } else {
    trend_score = null;
    score_status = 'INSUFFICIENT_DATA';
  }

  // 8. Delta Semantics
  let previous_score = null;
  let score_delta = null;

  if (previousSnapshot && previousSnapshot.trend_score !== null && previousSnapshot.trend_score !== undefined) {
    previous_score = previousSnapshot.trend_score;
    if (trend_score !== null) {
      score_delta = trend_score - previous_score;
    }
  }

  // 9. Lifecycle Classification
  const lifecycleResult = classifyLifecycle({
    trend_score,
    momentum_score,
    sample_size: sampleSize,
    unique_creators: uniqueCreators,
    fresh_0_24h: fresh_0_24h || 0,
    fresh_24_72h: fresh_24_72h || 0,
    fresh_3_7d: fresh_3_7d || 0,
    current_replication: resolvedReplication,
    previous_score,
    score_delta,
    scan_number: scanNumber
  });

  return {
    score_version: SCORE_VERSION,
    sample_size: sampleSize,
    unique_creators: uniqueCreators,
    fresh_0_24h,
    fresh_24_72h,
    fresh_3_7d,
    older_7d,
    known_timestamp_count,
    unknown_timestamp_count,
    freshness_timestamp_coverage,
    freshness_observation_status,
    creator_spread_ratio,
    creator_spread_points,
    creator_spread_score,
    freshness_points,
    freshness_score,
    replication_points,
    replication_score,
    replication_status,
    current_replication: resolvedReplication,
    cross_surface_points,
    cross_surface_score,
    current_surface_count: resolvedSurfaceCount,
    engagement_points,
    engagement_score,
    engagement_status,
    momentum_score,
    momentum_status,
    momentum_raw_signals,
    momentum_coverage_audit,
    available_weight: availableWeight,
    score_coverage: scoreCoverage,
    score_status,
    trend_score,
    previous_score,
    score_delta,
    lifecycle: lifecycleResult.lifecycle,
    confidence: lifecycleResult.confidence,
    lifecycle_reason: lifecycleResult.reason,
    evidence: deduped
  };
}

module.exports = {
  SCORE_VERSION,
  COMPONENT_MAX_WEIGHTS,
  MIN_SCORE_COVERAGE,
  clampScore,
  classifyTimeBucket,
  deduplicateEvidence,
  countUniqueCreators,
  mapReplicationPoints,
  mapCrossSurfacePoints,
  lightScreenCandidate,
  evaluateTopicSignals
};
