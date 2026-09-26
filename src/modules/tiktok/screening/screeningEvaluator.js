/**
 * TIKTOK LIGHT SCREENING EVALUATOR (PHASE 2B)
 * 
 * Deterministic evaluation logic:
 * - 2-Tier sampling (tier 1: 3 items, tier 2: max 5 items).
 * - Deduplicates video URLs.
 * - Enforces unique creator rule: replication requires >= 3 independent creators.
 * - Enforces early_stop = true for unambiguous DROP after 3 items.
 * - Detects creator/business accounts vs genuine replication.
 * - Missing metrics remain strictly null (never 0).
 * - Zero trend_score, zero momentum, zero lifecycle.
 */

const { cleanLabel } = require('../discovery/candidateNormalizer');

/**
 * Evaluates relevance of an evidence item against canonical label
 */
function assessRelevance(item, canonicalLabel) {
  const normLabel = cleanLabel(canonicalLabel).toLowerCase();
  const caption = (item.caption || '').toLowerCase();
  const handle = (item.creator_handle || '').toLowerCase();
  const rawText = (item.raw_text || '').toLowerCase();
  const combined = `${caption} ${handle} ${rawText}`;

  if (!normLabel) return 'NOT_RELEVANT';

  // Exact or partial token match
  const words = normLabel.split(/\s+/).filter(w => w.length > 1);
  const matchCount = words.filter(w => combined.includes(w)).length;

  if (combined.includes(normLabel) || (words.length > 0 && matchCount === words.length)) {
    return 'RELEVANT';
  } else if (matchCount > 0) {
    return 'PARTIAL';
  }
  return 'NOT_RELEVANT';
}

/**
 * Normalizes metrics to null if missing or invalid
 */
function normalizeMetric(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const clean = val.replace(/,/g, '').trim().toUpperCase();
    if (clean.endsWith('K')) {
      const num = parseFloat(clean.slice(0, -1));
      return isNaN(num) ? null : Math.round(num * 1000);
    }
    if (clean.endsWith('M')) {
      const num = parseFloat(clean.slice(0, -1));
      return isNaN(num) ? null : Math.round(num * 1000000);
    }
    if (clean.endsWith('B')) {
      const num = parseFloat(clean.slice(0, -1));
      return isNaN(num) ? null : Math.round(num * 1000000000);
    }
    const num = parseFloat(clean);
    return isNaN(num) ? null : Math.round(num);
  }
  return null;
}

/**
 * Evaluates candidate screening results
 * @param {Object} candidate Current candidate from tiktok_candidates.json
 * @param {Array} rawItems Extracted search items from Playwright
 * @param {Object} options Options such as accessRestricted flag
 * @returns {Object} Candidate screening result object adhering to contract
 */
function evaluateCandidateScreening(candidate, rawItems = [], options = {}) {
  // Resolve effective search status strictly following enum:
  // 'SEARCH_RESULTS_AVAILABLE' | 'NO_RESULTS' | 'ACCESS_RESTRICTED' | 'LOGIN_REQUIRED' | 'CAPTCHA_REQUIRED' | 'UNKNOWN_UI_STATE'
  let effectiveSearchStatus = options.searchStatus || null;
  if (!effectiveSearchStatus) {
    if (
      options.accessRestricted || 
      options.isRestricted || 
      candidate.access_restricted || 
      rawItems.access_restricted ||
      (options.reason && options.reason.includes('ACCESS_RESTRICTED'))
    ) {
      effectiveSearchStatus = 'ACCESS_RESTRICTED';
    } else if (options.loginRequired || (options.reason && options.reason.includes('LOGIN_REQUIRED'))) {
      effectiveSearchStatus = 'LOGIN_REQUIRED';
    } else if (options.captchaRequired || (options.reason && options.reason.includes('CAPTCHA_REQUIRED'))) {
      effectiveSearchStatus = 'CAPTCHA_REQUIRED';
    } else if (rawItems && rawItems.length > 0) {
      effectiveSearchStatus = 'SEARCH_RESULTS_AVAILABLE';
    } else {
      effectiveSearchStatus = 'NO_RESULTS';
    }
  }

  const isAccessRestricted = (effectiveSearchStatus === 'ACCESS_RESTRICTED');
  const isLoginRequired = (effectiveSearchStatus === 'LOGIN_REQUIRED');
  const isCaptchaRequired = (effectiveSearchStatus === 'CAPTCHA_REQUIRED');
  const isNoResults = (effectiveSearchStatus === 'NO_RESULTS');
  const isUnknownUi = (effectiveSearchStatus === 'UNKNOWN_UI_STATE');

  // If no usable evidence could be collected (empty raw items)
  if (!rawItems || rawItems.length === 0) {
    let reason = '';
    if (isAccessRestricted) {
      reason = 'Screening could not collect sufficient evidence because TikTok Search access was restricted.';
    } else if (isLoginRequired) {
      reason = 'Screening could not collect sufficient evidence because TikTok Search requires user login.';
    } else if (isCaptchaRequired) {
      reason = 'Screening could not collect sufficient evidence because TikTok Search encountered a CAPTCHA verification challenge.';
    } else if (isUnknownUi) {
      reason = `Screening could not determine TikTok Search UI state for "${candidate.canonical_label}" (UNKNOWN_UI_STATE).`;
    } else {
      // isNoResults or normal 0 items found
      reason = `Screening không có đủ evidence do kết quả tìm kiếm không trả về video phù hợp cho "${candidate.canonical_label}" (NO_RESULTS).`;
    }

    return {
      candidate_key: candidate.candidate_key,
      canonical_label: candidate.canonical_label,
      candidate_type_hint_before: candidate.candidate_type_hint,
      type_confidence_before: 'LOW',
      discovery_signal_strength: candidate.discovery_signal_strength,
      surface_scope: candidate.surface_scope || ['query_contextual'],
      screening_status: 'INCONCLUSIVE',
      status: 'INCONCLUSIVE',
      sample_size: 0,
      unique_creators: 0,
      replication_observed: null,
      replication_pattern: null,
      screening_reason: reason,
      reason,
      early_stop: false,
      candidate_type_hint_after: candidate.candidate_type_hint || 'topic',
      type_confidence_after: 'LOW',
      evidence: []
    };
  }

  // 1. Deduplicate by video_url
  const seenUrls = new Set();
  const uniqueItems = [];
  for (const item of rawItems) {
    if (!item.video_url || seenUrls.has(item.video_url)) continue;
    seenUrls.add(item.video_url);
    uniqueItems.push(item);
  }

  // 2. Format raw items into evidence items with null fallback
  const allFormatted = uniqueItems.map(raw => {
    const rel = raw.relevance || assessRelevance(raw, candidate.canonical_label);
    return {
      video_url: raw.video_url,
      creator_handle: raw.creator_handle || null,
      caption: raw.caption || null,
      published_at: raw.published_at || raw.time_text || null,
      views: normalizeMetric(raw.views),
      likes: normalizeMetric(raw.likes),
      comments: normalizeMetric(raw.comments),
      sound_title: raw.sound_title || null,
      observed_pattern: raw.observed_pattern || (raw.caption ? raw.caption.slice(0, 120) : 'Video search result'),
      relevance: rel,
      capture_method: 'playwright_persistent_authenticated_profile',
      observed_at: raw.observed_at || new Date().toISOString()
    };
  });

  // 3. 2-Tier Sampling Strategy:
  // Inspect tier 1 (first 3 items)
  const tier1Items = allFormatted.slice(0, 3);
  const tier1Creators = new Set(tier1Items.map(i => i.creator_handle).filter(Boolean));
  const tier1Relevant = tier1Items.filter(i => i.relevance === 'RELEVANT');

  let chosenEvidence = [];
  let screeningStatus = 'INCONCLUSIVE';
  let replicationObserved = null;
  let replicationPattern = null;
  let screeningReason = '';
  let earlyStop = false;
  let candidateTypeHintAfter = candidate.candidate_type_hint || 'topic';
  let typeConfidenceAfter = 'LOW';

  // Check Early Drop Conditions after 3 items
  if (tier1Items.length === 0) {
    if (isAccessRestricted) {
      screeningStatus = 'INCONCLUSIVE';
      replicationObserved = null;
      earlyStop = false;
      screeningReason = 'Screening could not collect sufficient evidence because TikTok Search access was restricted.';
    } else if (isLoginRequired) {
      screeningStatus = 'INCONCLUSIVE';
      replicationObserved = null;
      earlyStop = false;
      screeningReason = 'Screening could not collect sufficient evidence because TikTok Search requires user login.';
    } else if (isCaptchaRequired) {
      screeningStatus = 'INCONCLUSIVE';
      replicationObserved = null;
      earlyStop = false;
      screeningReason = 'Screening could not collect sufficient evidence because TikTok Search encountered a CAPTCHA verification challenge.';
    } else if (isNoResults) {
      screeningStatus = 'INCONCLUSIVE';
      replicationObserved = null;
      earlyStop = false;
      screeningReason = `Screening không có đủ evidence do kết quả tìm kiếm không trả về video phù hợp cho "${candidate.canonical_label}" (NO_RESULTS).`;
    } else {
      screeningStatus = 'INCONCLUSIVE';
      replicationObserved = null;
      earlyStop = false;
      screeningReason = `Không tìm thấy video hợp lệ nào liên quan tới từ khóa "${candidate.canonical_label}" trên kết quả tìm kiếm.`;
    }
    chosenEvidence = [];
  } else if (tier1Items.length >= 2 && tier1Relevant.length === 0) {
    // None relevant
    screeningStatus = 'DROP';
    replicationObserved = false;
    earlyStop = true;
    screeningReason = `Các kết quả tìm kiếm không liên quan đến chủ đề discovery ("${candidate.canonical_label}").`;
    chosenEvidence = tier1Items;
  } else if (tier1Items.length >= 2 && tier1Creators.size <= 1) {
    // Single creator only
    screeningStatus = 'DROP';
    replicationObserved = false;
    earlyStop = true;
    const soleCreator = Array.from(tier1Creators)[0] || '1 tài khoản';
    screeningReason = `Kết quả chủ yếu từ một creator/kênh duy nhất (${soleCreator}); không có dấu hiệu replication giữa các creator độc lập.`;
    chosenEvidence = tier1Items;
  } else if (tier1Relevant.length >= 3 && tier1Creators.size >= 3) {
    // Clear PASS after 3 items
    screeningStatus = 'PASS_TO_DEEP_VALIDATION';
    replicationObserved = true;
    earlyStop = false;
    replicationPattern = `Ghi nhận nội dung thảo luận lặp lại giữa ${tier1Creators.size} creator độc lập trên chủ đề "${candidate.canonical_label}".`;
    typeConfidenceAfter = 'MEDIUM';
    candidateTypeHintAfter = candidate.candidate_type_hint === 'search_query' ? 'topic' : candidate.candidate_type_hint;
    screeningReason = `Quan sát được replication rõ ràng từ ${tier1Creators.size} creator độc lập trong 3 mẫu đầu tiên. Đủ điều kiện chuyển sang Deep Validation.`;
    chosenEvidence = tier1Items;
  } else {
    // Ambiguous after 3 items -> expand to max 5 items (Tier 2)
    const tier2Items = allFormatted.slice(0, 5);
    const tier2Creators = new Set(tier2Items.map(i => i.creator_handle).filter(Boolean));
    const tier2Relevant = tier2Items.filter(i => i.relevance === 'RELEVANT');
    chosenEvidence = tier2Items;

    if (tier2Relevant.length >= 3 && tier2Creators.size >= 3) {
      screeningStatus = 'PASS_TO_DEEP_VALIDATION';
      replicationObserved = true;
      replicationPattern = `Ghi nhận replication trên ${tier2Creators.size} creator độc lập sau khi mở rộng mẫu đến ${tier2Items.length} video.`;
      typeConfidenceAfter = 'MEDIUM';
      candidateTypeHintAfter = candidate.candidate_type_hint === 'search_query' ? 'topic' : candidate.candidate_type_hint;
      screeningReason = `Đạt tiêu chí replication với ${tier2Relevant.length} video liên quan từ ${tier2Creators.size} creator độc lập (mở rộng tối đa 5 video).`;
    } else if (tier2Creators.size < 3) {
      screeningStatus = 'DROP';
      replicationObserved = false;
      screeningReason = `Sau khi mở rộng đến ${tier2Items.length} video, chỉ ghi nhận ${tier2Creators.size} creator độc lập; không đủ ngưỡng replication độc lập (cần >= 3 creators).`;
    } else if (tier2Relevant.length < 2) {
      screeningStatus = 'DROP';
      replicationObserved = false;
      screeningReason = `Kết quả tìm kiếm bị phân tán, nội dung không cùng chia sẻ một chủ đề/format thống nhất.`;
    } else {
      screeningStatus = 'INCONCLUSIVE';
      replicationObserved = null;
      screeningReason = `Có tín hiệu phân tán (${tier2Relevant.length} video liên quan từ ${tier2Creators.size} creators) nhưng chưa đủ bằng chứng replication rõ nét; giữ trạng thái chờ.`;
    }
  }

  // Annotate commercial / campaign nature in screening_reason
  if (candidate.nature_hint === 'commerce' || candidate.nature_hint === 'possible_campaign') {
    const commercialNote = candidate.nature_hint === 'commerce' ? 'primarily brand-driven/commerce' : 'possible campaign-driven';
    screeningReason += ` [Bản chất tín hiệu: ${commercialNote}]`;
  }

  const uniqueCreatorsCount = new Set(chosenEvidence.map(i => i.creator_handle).filter(Boolean)).size;

  return {
    candidate_key: candidate.candidate_key,
    canonical_label: candidate.canonical_label,
    candidate_type_hint_before: candidate.candidate_type_hint,
    type_confidence_before: 'LOW',
    discovery_signal_strength: candidate.discovery_signal_strength,
    surface_scope: candidate.surface_scope || ['query_contextual'],
    screening_status: screeningStatus,
    status: screeningStatus,
    sample_size: chosenEvidence.length,
    unique_creators: uniqueCreatorsCount,
    replication_observed: replicationObserved,
    replication_pattern: replicationPattern,
    screening_reason: screeningReason,
    reason: screeningReason,
    early_stop: earlyStop,
    candidate_type_hint_after: candidateTypeHintAfter,
    type_confidence_after: typeConfidenceAfter,
    evidence: chosenEvidence
  };
}

module.exports = {
  assessRelevance,
  normalizeMetric,
  evaluateCandidateScreening
};
