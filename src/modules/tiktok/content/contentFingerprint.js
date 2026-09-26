/**
 * TIKTOK CONTENT FINGERPRINT BUILDER V1 (PHASE 6B)
 * 
 * Generates a deterministic content fingerprint per video.
 * 
 * Strict Anti-Metadata-Bias Rules:
 * 1. Hashtag alone CANNOT set: main_action, hook_pattern, visual_pattern, format_pattern.
 * 2. Caption alone may suggest primary_topic, but provenance MUST be 'CAPTION_ONLY'.
 * 3. If fingerprint depends almost entirely on caption/hashtag: confidence CANNOT be 'HIGH'.
 * 4. Same hashtag does NOT imply same fingerprint.
 * 5. Same sound does NOT imply same fingerprint.
 * 6. UNKNOWN fields stay null.
 */

/**
 * Extracts entities mentioned in text without external hallucinations
 * @param {string} text 
 * @returns {string[]}
 */
function extractEntities(text) {
  if (!text || typeof text !== 'string') return [];
  const normalized = text.trim();
  const entities = new Set();

  // Known entity patterns in community observations
  const patterns = [
    { regex: /\b(free\s*fire|ff)\b/i, name: 'Free Fire' },
    { regex: /\bob55\b/i, name: 'OB55' },
    { regex: /\b(laneige)\b/i, name: 'Laneige' },
    { regex: /\b(ken\s*perfume|nước\s*hoa|perfume)\b/i, name: 'Perfume / Nước hoa' },
    { regex: /\b(tiktok\s*shop)\b/i, name: 'TikTok Shop' },
    { regex: /\b(d21|d22|d23|d26|ptit)\b/i, name: 'PTIT Community' }
  ];

  for (const { regex, name } of patterns) {
    if (regex.test(normalized)) {
      entities.add(name);
    }
  }

  // Also match capitalized entity-like tokens (2+ words)
  const capitalizedMatches = normalized.match(/([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)+)/g) || [];
  capitalizedMatches.forEach(m => entities.add(m));

  return Array.from(entities);
}

/**
 * Builds Content Fingerprint V1 from observation contract
 * @param {Object} observations Canonical observation contract from contentObserver
 * @returns {Object} Content Fingerprint V1
 */
function buildContentFingerprint(observations = {}) {
  const dom = observations.dom_observations || {};
  const visual = observations.visual_observations || {};
  const audio = observations.audio_observations || {};
  const modalityStatus = observations.modality_status || {};

  const caption = (dom.caption || '').trim();
  const hashtags = Array.isArray(dom.hashtags) ? dom.hashtags : [];
  const sound = (dom.sound || audio.sound_metadata || '').trim();
  const shopAnchor = dom.shop_anchor || null;
  const textOverlays = Array.isArray(visual.text_overlay) ? visual.text_overlay : [];
  const frames = Array.isArray(visual.frames_observed) ? visual.frames_observed : [];

  const observed_modalities = [];
  if (caption || hashtags.length > 0) observed_modalities.push('dom_metadata');
  if (textOverlays.length > 0) observed_modalities.push('on_screen_text');
  if (frames.length > 0) observed_modalities.push('video_keyframes');
  if (sound) observed_modalities.push('audio_metadata');

  const field_provenance = {
    primary_topic: 'UNKNOWN',
    main_action: 'UNKNOWN',
    hook_pattern: 'UNKNOWN',
    format_pattern: 'UNKNOWN',
    dialogue_pattern: 'UNAVAILABLE',
    visual_pattern: 'UNKNOWN',
    audio_pattern: 'UNKNOWN',
    meme_template: 'UNKNOWN',
    entities: 'UNKNOWN',
    commercial_intent: 'UNKNOWN',
    semantic_summary: 'UNKNOWN'
  };

  // 1. Primary Topic & Entities
  let primary_topic = null;
  const entities = extractEntities(`${caption} ${textOverlays.join(' ')}`);

  if (visual.visual_summary) {
    primary_topic = visual.visual_summary;
    field_provenance.primary_topic = 'OBSERVED_FROM_VIDEO';
  } else if (caption) {
    // If caption exists, extract primary topic from caption
    primary_topic = caption.split(/[\n.!?#]/)[0].trim() || caption;
    field_provenance.primary_topic = 'CAPTION_ONLY';
  } else if (hashtags.length > 0) {
    // HARD RULE: Hashtag alone can only provide a hashtag discovery tag, not true content topic
    primary_topic = `Tag: ${hashtags[0]}`;
    field_provenance.primary_topic = 'HASHTAG_ONLY';
  }

  if (entities.length > 0) {
    field_provenance.entities = observed_modalities.includes('on_screen_text') ? 'OBSERVED_FROM_DOM' : 'INFERRED_FROM_CAPTION';
  }

  // 2. Main Action
  // HARD RULE: Hashtag alone CANNOT set main_action
  let main_action = null;
  if (visual.main_action) {
    main_action = visual.main_action;
    field_provenance.main_action = 'OBSERVED_FROM_VIDEO';
  } else if (textOverlays.length > 0) {
    main_action = `On-screen text indicates: "${textOverlays[0]}"`;
    field_provenance.main_action = 'OBSERVED_FROM_DOM';
  } else if (caption && !field_provenance.primary_topic === 'HASHTAG_ONLY') {
    // Inferred only if descriptive caption exists
    if (/hướng dẫn|cập nhật|thử|review|săn|chia sẻ|unboxing/i.test(caption)) {
      const match = caption.match(/(hướng dẫn|cập nhật|thử|review|săn|chia sẻ|unboxing)[^.!?#\n]*/i);
      if (match) {
        main_action = match[0].trim();
        field_provenance.main_action = 'INFERRED_FROM_CAPTION';
      }
    }
  }

  // 3. Hook Pattern
  // HARD RULE: Hashtag alone CANNOT set hook_pattern
  let hook_pattern = null;
  if (textOverlays.length > 0) {
    hook_pattern = textOverlays[0];
    field_provenance.hook_pattern = 'OBSERVED_FROM_DOM';
  } else if (caption) {
    const firstSentence = caption.split(/[\n.!?]/)[0].trim();
    if (firstSentence && firstSentence.length > 5 && !firstSentence.startsWith('#')) {
      hook_pattern = firstSentence;
      field_provenance.hook_pattern = 'INFERRED_FROM_CAPTION';
    }
  }

  // 4. Format Pattern
  // HARD RULE: Hashtag alone CANNOT set format_pattern or commercial_intent
  let format_pattern = null;
  let commercial_intent = false;

  const captionWithoutTags = caption.replace(/#\S+/g, '').trim();

  if (shopAnchor) {
    format_pattern = 'COMMERCIAL_SHOWCASE';
    commercial_intent = true;
    field_provenance.format_pattern = 'OBSERVED_FROM_DOM';
    field_provenance.commercial_intent = 'OBSERVED_FROM_DOM';
  } else if (/giỏ hàng|\bdeal\b|mua ngay|voucher|\bsale\b|\bgiá\b/i.test(captionWithoutTags)) {
    commercial_intent = true;
    format_pattern = 'AFFILIATE_PROMOTION';
    field_provenance.format_pattern = 'INFERRED_FROM_CAPTION';
    field_provenance.commercial_intent = 'INFERRED_FROM_CAPTION';
  } else if (/ob55|gameplay|update|bản cập nhật|máy chủ|highlights/i.test(captionWithoutTags)) {
    format_pattern = 'GAMING_CONTENT';
    commercial_intent = false;
    field_provenance.format_pattern = 'INFERRED_FROM_CAPTION';
    field_provenance.commercial_intent = 'INFERRED_FROM_CAPTION';
  } else if (captionWithoutTags) {
    format_pattern = 'GENERAL_CREATOR_POST';
    field_provenance.format_pattern = 'INFERRED_FROM_CAPTION';
    field_provenance.commercial_intent = 'INFERRED_FROM_CAPTION';
  }

  // 5. Visual Pattern
  // HARD RULE: Hashtag alone CANNOT set visual_pattern
  let visual_pattern = null;
  if (visual.visual_summary) {
    visual_pattern = visual.visual_summary;
    field_provenance.visual_pattern = 'OBSERVED_FROM_VIDEO';
  } else if (frames.length > 0) {
    visual_pattern = `VIDEO_KEYFRAMES_CAPTURED (${frames.length} frames sampled at positions: ${frames.map(f => f.position_pct + '%').join(', ')})`;
    field_provenance.visual_pattern = 'OBSERVED_FROM_VIDEO';
  }

  // 6. Audio Pattern
  let audio_pattern = null;
  if (sound) {
    audio_pattern = `Sound: ${sound}`;
    field_provenance.audio_pattern = 'OBSERVED_FROM_DOM';
  }

  // 7. Dialogue Pattern & Meme Template (Remain null when not observed)
  const dialogue_pattern = null;
  const meme_template = null;

  // 8. Semantic Summary
  let semantic_summary = null;
  if (primary_topic) {
    const actionPart = main_action ? ` • Action: ${main_action}` : '';
    const formatPart = format_pattern ? ` • Format: ${format_pattern}` : '';
    semantic_summary = `${primary_topic}${actionPart}${formatPart}`;
    field_provenance.semantic_summary = 'DERIVED';
  }

  // 9. Confidence Determination
  // HARD RULE: If fingerprint depends almost entirely on caption/hashtag: confidence cannot be HIGH.
  let confidence = 'LOW';
  const hasFrames = frames.length > 0;
  const hasOverlays = textOverlays.length > 0;
  const isHashtagOnly = field_provenance.primary_topic === 'HASHTAG_ONLY' && !caption;

  if (isHashtagOnly) {
    confidence = 'INSUFFICIENT';
  } else if (hasFrames && hasOverlays && caption) {
    confidence = 'HIGH';
  } else if (hasFrames && caption) {
    confidence = 'MEDIUM';
  } else if (caption) {
    // Caption only without video frames/overlays cannot be HIGH
    confidence = 'LOW';
  } else {
    confidence = 'INSUFFICIENT';
  }

  return {
    version: 'content_fingerprint_v1',

    primary_topic,
    main_action,
    hook_pattern,
    format_pattern,
    dialogue_pattern,
    visual_pattern,
    audio_pattern,
    meme_template,
    entities,
    commercial_intent,
    semantic_summary,

    observed_modalities,

    field_provenance,

    confidence
  };
}

module.exports = {
  buildContentFingerprint,
  extractEntities
};
