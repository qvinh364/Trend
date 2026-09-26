/**
 * TIKTOK LIFECYCLE CLASSIFIER (PHASE 4.0A CONTRACT)
 * 
 * Rules:
 * 1. Evidence-based classification (not rigid linear sequence).
 * 2. Lifecycles: 'HOT', 'RISING', 'EMERGING', 'COOLING', 'CANDIDATE'.
 * 3. Confidence: 'LOW', 'MEDIUM', 'HIGH'.
 *    - In Scan #2, confidence is capped at 'MEDIUM' (cannot claim HIGH with only 2 scans).
 * 4. Exact Conditions:
 *    - COOLING: momentum_score <= 35 AND fresh_72h_ratio < 0.25 (or historical score_delta < -15)
 *    - HOT: trend_score >= 75 AND momentum_score >= 50 AND fresh_7d_ratio >= 0.50 AND current_replication === true
 *    - RISING: momentum_score >= 65 AND trend_score >= 55 AND current_replication === true
 *    - EMERGING: momentum_score >= 50 AND momentum_score < 65 AND fresh_72h_ratio >= 0.40 AND trend_score >= 50 AND current_replication === true
 *    - Otherwise: CANDIDATE
 */

const VALID_LIFECYCLES = ['HOT', 'RISING', 'EMERGING', 'COOLING', 'CANDIDATE'];

/**
 * Classifies lifecycle and confidence level
 * @param {Object} params
 * @param {number|null} params.trend_score
 * @param {number|null} params.momentum_score
 * @param {number} params.sample_size
 * @param {number} params.unique_creators
 * @param {number} params.fresh_0_24h
 * @param {number} params.fresh_24_72h
 * @param {number} params.fresh_3_7d
 * @param {boolean} params.current_replication
 * @param {number|null} params.previous_score
 * @param {number|null} params.score_delta
 * @param {number} params.scan_number 1, 2, 3...
 * @returns {{ lifecycle: string, confidence: string, reason: string }}
 */
function classifyLifecycle({
  trend_score = null,
  momentum_score = null,
  sample_size = 0,
  unique_creators = 0,
  fresh_0_24h = 0,
  fresh_24_72h = 0,
  fresh_3_7d = 0,
  current_replication = true,
  previous_score = null,
  score_delta = null,
  scan_number = 2
}) {
  // Determine raw confidence
  let rawConfidence = 'LOW';
  if (sample_size >= 8 && unique_creators >= 5) {
    rawConfidence = 'HIGH';
  } else if (sample_size >= 4 && unique_creators >= 2) {
    rawConfidence = 'MEDIUM';
  }

  // Scan #2 constraint: Max confidence is MEDIUM
  let confidence = rawConfidence;
  if (scan_number <= 2 && confidence === 'HIGH') {
    confidence = 'MEDIUM';
  }

  // If trend_score is null OR current_replication is null -> CANDIDATE, LOW (Phase 4.1A Contract)
  if (trend_score === null || trend_score === undefined || current_replication === null || current_replication === undefined) {
    return {
      lifecycle: 'CANDIDATE',
      confidence: 'LOW',
      reason: trend_score === null 
        ? 'Trend Score chưa được tính toán hoặc không đủ dữ liệu (INSUFFICIENT_DATA)' 
        : 'Chưa có đủ bằng chứng current replication'
    };
  }

  const totalFreshSamples = Math.max(1, sample_size);
  const fresh_72h_ratio = (fresh_0_24h + fresh_24_72h) / totalFreshSamples;
  const fresh_7d_ratio = (fresh_0_24h + fresh_24_72h + fresh_3_7d) / totalFreshSamples;

  // 1. COOLING: momentum_score <= 35 AND fresh_72h_ratio < 0.25 (or historical drop < -15)
  if (
    (momentum_score !== null && momentum_score <= 35 && fresh_72h_ratio < 0.25) ||
    (previous_score !== null && score_delta !== null && score_delta < -15)
  ) {
    return {
      lifecycle: 'COOLING',
      confidence,
      reason: `Tín hiệu suy giảm (momentum: ${momentum_score}, tỷ lệ video 72h: ${(fresh_72h_ratio * 100).toFixed(1)}%)`
    };
  }

  // 2. HOT: trend_score >= 75 AND momentum_score >= 50 AND fresh_7d_ratio >= 0.50 AND current_replication = true
  if (
    trend_score >= 75 &&
    momentum_score !== null && momentum_score >= 50 &&
    fresh_7d_ratio >= 0.50 &&
    current_replication === true
  ) {
    return {
      lifecycle: 'HOT',
      confidence,
      reason: `Xu hướng bùng nổ: Trend Score ${trend_score}/100, momentum ${momentum_score}, fresh 7d ${(fresh_7d_ratio * 100).toFixed(0)}%, có replication`
    };
  }

  // 3. RISING: momentum_score >= 65 AND trend_score >= 55 AND current_replication = true
  if (
    momentum_score !== null && momentum_score >= 65 &&
    trend_score >= 55 &&
    current_replication === true
  ) {
    return {
      lifecycle: 'RISING',
      confidence,
      reason: `Đang tăng trưởng mạnh: momentum ${momentum_score}, Trend Score ${trend_score}/100, có replication`
    };
  }

  // 4. EMERGING: momentum_score >= 50 AND momentum_score < 65 AND fresh_72h_ratio >= 0.40 AND trend_score >= 50 AND current_replication = true
  if (
    momentum_score !== null && momentum_score >= 50 && momentum_score < 65 &&
    fresh_72h_ratio >= 0.40 &&
    trend_score >= 50 &&
    current_replication === true
  ) {
    return {
      lifecycle: 'EMERGING',
      confidence,
      reason: `Mới nổi: momentum ${momentum_score}, fresh 72h ${(fresh_72h_ratio * 100).toFixed(0)}%, Trend Score ${trend_score}/100`
    };
  }

  // Default fallback: CANDIDATE
  return {
    lifecycle: 'CANDIDATE',
    confidence,
    reason: `Chưa đạt tiêu chí cụ thể để kích hoạt EMERGING, RISING hoặc HOT (${trend_score}/100)`
  };
}

module.exports = {
  VALID_LIFECYCLES,
  classifyLifecycle
};
