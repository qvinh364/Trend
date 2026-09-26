/**
 * TIKTOK CONTENT FINGERPRINT V2 (PHASE 6B.2)
 * 
 * Builds multi-modal temporal content fingerprints based on:
 * 1. FULL_VIDEO_VISUAL
 * 2. FULL_VIDEO_MOTION
 * 3. FULL_VIDEO_SPEECH
 * 4. FULL_VIDEO_AUDIO
 * 5. FULL_VIDEO_TEXT
 * 6. TEMPORAL_STRUCTURE
 * 7. CROSS_MODAL_EVENTS
 * 8. NARRATIVE_CONTEXT
 * 
 * Followed by discovery signals:
 * 9. DOM_CAPTION
 * 10. HASHTAG
 * 11. SOUND_METADATA
 * 
 * Provenance Hard Rules:
 * - Hashtag alone cannot create topic/action/format/trend equivalence.
 * - Caption cannot override actual video observations (caption/video conflict is preserved).
 * - Static screenshots/keyframes cannot qualify as FULL_VIDEO.
 * - Unobserved modalities remain null.
 */

/**
 * Builds Content Fingerprint V2 from full-video understanding output & discovery metadata
 * @param {Object} videoAnalysis Output of analyzeFullVideo
 * @param {Object} [discoveryMetadata] Optional DOM caption, hashtags, sound metadata
 * @returns {Object} Content Fingerprint V2
 */
function buildContentFingerprintV2(videoAnalysis = {}, discoveryMetadata = {}) {
  const isStaticFrameOnly = videoAnalysis.status === 'STATIC_FRAME_ONLY_REJECTED' || videoAnalysis.is_static_frame_only;
  const segments = Array.isArray(videoAnalysis.segments) ? videoAnalysis.segments : [];
  const narrative = videoAnalysis.narrative_context || {};
  const crossModal = Array.isArray(videoAnalysis.cross_modal_events) ? videoAnalysis.cross_modal_events : [];
  const overall = videoAnalysis.overall || {};
  const modalityStatus = videoAnalysis.modality_status || {};

  const caption = (discoveryMetadata.caption || '').trim();
  const hashtags = Array.isArray(discoveryMetadata.hashtags) ? discoveryMetadata.hashtags : [];
  const soundMetadata = (discoveryMetadata.sound || '').trim();

  const field_provenance = {
    primary_topic: 'UNKNOWN',
    main_action: 'UNKNOWN',
    narrative_structure: 'UNKNOWN',
    hook_pattern: 'UNKNOWN',
    payoff_pattern: 'UNKNOWN',
    format_pattern: 'UNKNOWN',
    visual_pattern: 'UNKNOWN',
    motion_pattern: 'UNKNOWN',
    dialogue_pattern: 'UNKNOWN',
    audio_pattern: 'UNKNOWN',
    text_pattern: 'UNKNOWN',
    editing_pattern: 'UNKNOWN',
    cross_modal_pattern: 'UNKNOWN',
    meme_template: 'UNKNOWN',
    entities: 'UNKNOWN',
    commercial_intent: 'UNKNOWN',
    semantic_summary: 'UNKNOWN'
  };

  const modality_confidence = {
    visual: modalityStatus.visual === 'AVAILABLE' ? 'HIGH' : (modalityStatus.visual === 'PARTIAL' ? 'LOW' : 'UNAVAILABLE'),
    motion: modalityStatus.motion === 'AVAILABLE' ? 'HIGH' : 'UNAVAILABLE',
    speech: modalityStatus.speech === 'AVAILABLE' ? 'HIGH' : 'UNAVAILABLE',
    audio: modalityStatus.audio === 'AVAILABLE' ? 'HIGH' : 'UNAVAILABLE',
    text: modalityStatus.on_screen_text === 'AVAILABLE' ? 'HIGH' : 'UNAVAILABLE'
  };

  // 1. Primary Topic & Video vs Caption conflict check
  let primary_topic = null;
  let caption_conflict_detected = false;

  if (overall.primary_topic) {
    primary_topic = overall.primary_topic;
    field_provenance.primary_topic = 'FULL_VIDEO_VISUAL';

    // If caption exists and completely contradicts video content, preserve conflict
    if (caption && !caption.toLowerCase().includes(primary_topic.toLowerCase().split(' ')[0])) {
      caption_conflict_detected = true;
    }
  } else if (caption) {
    primary_topic = caption.split(/[\n.!?#]/)[0].trim();
    field_provenance.primary_topic = 'DOM_CAPTION';
  } else if (hashtags.length > 0) {
    primary_topic = `Tag: ${hashtags[0]}`;
    field_provenance.primary_topic = 'HASHTAG';
  }

  // 2. Main Action & Motion Pattern
  let main_action = null;
  let motion_pattern = null;

  if (overall.main_action) {
    main_action = overall.main_action;
    field_provenance.main_action = 'FULL_VIDEO_VISUAL';
  } else if (segments.some(s => s.visual_action)) {
    main_action = segments.map(s => s.visual_action).filter(Boolean).join(' -> ');
    field_provenance.main_action = 'FULL_VIDEO_VISUAL';
  }

  if (overall.motion_pattern) {
    motion_pattern = overall.motion_pattern;
    field_provenance.motion_pattern = 'FULL_VIDEO_MOTION';
  } else if (segments.some(s => s.motion_pattern)) {
    motion_pattern = segments.map(s => s.motion_pattern).filter(Boolean).join(' -> ');
    field_provenance.motion_pattern = 'FULL_VIDEO_MOTION';
  }

  // 3. Dialogue & Audio Pattern
  let dialogue_pattern = null;
  let audio_pattern = null;

  if (overall.dialogue_pattern) {
    dialogue_pattern = overall.dialogue_pattern;
    field_provenance.dialogue_pattern = 'FULL_VIDEO_SPEECH';
  } else if (segments.some(s => s.spoken_dialogue)) {
    dialogue_pattern = segments.map(s => s.spoken_dialogue).filter(Boolean).join(' | ');
    field_provenance.dialogue_pattern = 'FULL_VIDEO_SPEECH';
  }

  if (overall.audio_pattern) {
    audio_pattern = overall.audio_pattern;
    field_provenance.audio_pattern = 'FULL_VIDEO_AUDIO';
  } else if (segments.some(s => s.music || s.sound_effects)) {
    const audioItems = segments.map(s => s.music || s.sound_effects).filter(Boolean);
    audio_pattern = audioItems.join(' + ');
    field_provenance.audio_pattern = 'FULL_VIDEO_AUDIO';
  } else if (soundMetadata) {
    audio_pattern = `Metadata Sound: ${soundMetadata}`;
    field_provenance.audio_pattern = 'SOUND_METADATA';
  }

  // 4. Text Pattern
  let text_pattern = null;
  if (segments.some(s => s.on_screen_text)) {
    text_pattern = segments.map(s => s.on_screen_text).filter(Boolean).join(' | ');
    field_provenance.text_pattern = 'FULL_VIDEO_TEXT';
  }

  // 5. Cross-Modal Pattern
  let cross_modal_pattern = null;
  if (crossModal.length > 0) {
    cross_modal_pattern = crossModal.map(cm => 
      `[${cm.start_time}-${cm.end_time}s]: ${cm.cross_modal_relationship || (cm.visual_action + ' + ' + cm.spoken_dialogue)}`
    ).join(' ; ');
    field_provenance.cross_modal_pattern = 'CROSS_MODAL_REASONING';
  }

  // 6. Narrative Structure & Temporal Signature
  let narrative_structure = null;
  if (overall.narrative_structure) {
    narrative_structure = overall.narrative_structure;
    field_provenance.narrative_structure = 'TEMPORAL_REASONING';
  } else if (narrative.setup && narrative.payoff) {
    narrative_structure = `${narrative.setup} -> ${narrative.progression || 'build'} -> ${narrative.payoff}`;
    field_provenance.narrative_structure = 'TEMPORAL_REASONING';
  }

  const temporal_signature = {
    opening: segments[0]?.visual_action || narrative.setup || null,
    middle: segments[Math.floor(segments.length / 2)]?.visual_action || narrative.progression || null,
    turning_point: narrative.turning_point || null,
    ending: segments[segments.length - 1]?.visual_action || narrative.ending || null,
    repeated_sequence: narrative.recurring_action || null,
    key_transition: segments.find(s => s.transition_pattern)?.transition_pattern || null
  };

  // 7. Overall Confidence Calculation
  let overall_confidence = 'LOW';
  if (isStaticFrameOnly) {
    overall_confidence = 'INSUFFICIENT';
  } else if (modality_confidence.visual === 'HIGH' && modality_confidence.motion === 'HIGH' && modality_confidence.speech === 'HIGH' && crossModal.length > 0) {
    overall_confidence = 'HIGH';
  } else if (segments.length > 0) {
    overall_confidence = 'MEDIUM';
  } else if (field_provenance.primary_topic === 'HASHTAG') {
    overall_confidence = 'INSUFFICIENT';
  }

  return {
    version: 'content_fingerprint_v2',

    primary_topic,
    main_action,
    narrative_structure,

    hook_pattern: overall.hook_pattern || segments[0]?.on_screen_text || null,
    payoff_pattern: overall.payoff_pattern || narrative.payoff || null,

    format_pattern: overall.format_pattern || null,
    visual_pattern: overall.visual_pattern || null,
    motion_pattern,

    dialogue_pattern,
    audio_pattern,
    text_pattern,

    editing_pattern: overall.editing_pattern || segments.find(s => s.editing_pattern)?.editing_pattern || null,
    cross_modal_pattern,

    meme_template: overall.meme_or_template || null,
    entities: overall.entities || [],
    commercial_intent: !!overall.commercial_intent,
    semantic_summary: overall.semantic_summary || null,

    caption_conflict_detected,

    temporal_signature,

    field_provenance,
    modality_confidence,
    overall_confidence
  };
}

module.exports = {
  buildContentFingerprintV2
};
