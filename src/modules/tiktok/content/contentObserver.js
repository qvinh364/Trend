/**
 * TIKTOK CONTENT OBSERVER V1 (PHASE 6B)
 * 
 * Observes actual video content across available modalities:
 * - DOM Metadata (captions, hashtags, sound, creator, shop anchors)
 * - Video Element & Keyframes (deterministic 10%, 50%, 90% sampling)
 * - On-Screen Text Overlays (DOM text overlays, stickers)
 * - Audio Metadata (sound track title, author)
 * 
 * Strict Anti-Hallucination & Anti-Metadata-Bias Rules:
 * - If visual frames are captured but not interpreted by a vision model: visual_summary = null.
 * - If no ASR model is available: speech_transcript = null.
 * - Preserves explicit provenance per modality.
 */

const fs = require('fs');
const path = require('path');

/**
 * Keyframe sampler: samples up to 3 deterministic positions (e.g. 10%, 50%, 90%)
 * @param {import('playwright').Page} page 
 * @param {number} [maxFrames=3]
 * @returns {Promise<Array<{ position_pct: number, timestamp_sec: number, width: number, height: number, data_length: number }>>}
 */
async function sampleVideoKeyframes(page, maxFrames = 3) {
  if (!page) return [];

  try {
    const keyframes = await page.evaluate(async (maxCount) => {
      const video = document.querySelector('video');
      if (!video) return [];

      const duration = video.duration || 0;
      if (duration <= 0) return [];

      const targetPercentages = maxCount === 1 ? [0.5] : (maxCount === 2 ? [0.2, 0.8] : [0.1, 0.5, 0.9]);
      const results = [];

      for (const pct of targetPercentages) {
        const targetTime = duration * pct;
        try {
          video.currentTime = targetTime;
          // Wait briefly for frame to render
          await new Promise(r => setTimeout(r, 200));

          const width = video.videoWidth || 0;
          const height = video.videoHeight || 0;

          // Attempt canvas extraction
          let dataLength = 0;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(width, 320); // thumbnail scale
            canvas.height = Math.min(height, 568);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            dataLength = dataUrl.length;
          } catch (_) {
            dataLength = 0;
          }

          results.push({
            position_pct: Math.round(pct * 100),
            timestamp_sec: parseFloat(targetTime.toFixed(2)),
            width,
            height,
            data_length: dataLength
          });
        } catch (_) {}
      }

      return results;
    }, maxFrames);

    return keyframes || [];
  } catch (_) {
    return [];
  }
}

/**
 * Extracts raw observations from an active Playwright page
 * @param {import('playwright').Page} page 
 * @param {string} videoUrl 
 * @param {Object} [options]
 * @returns {Promise<Object>} Observation contract object
 */
async function extractObservationsFromPage(page, videoUrl, options = {}) {
  const maxFrames = options.maxFrames || 3;

  const rawDom = await page.evaluate(() => {
    // Caption / Description
    const descEl = document.querySelector('[data-e2e="video-desc"], [data-e2e="browse-video-desc"], .tiktok-j2a19r-SpanText');
    const caption = descEl ? descEl.innerText.trim() : '';

    // Hashtags
    const hashtagEls = Array.from(document.querySelectorAll('a[href*="/tag/"]'));
    const hashtags = hashtagEls.map(a => a.innerText.trim()).filter(Boolean);

    // Creator
    const authorEl = document.querySelector('[data-e2e="browser-nickname"], [data-e2e="user-title"], h3[data-e2e="user-title"]');
    const authorHandleEl = document.querySelector('[data-e2e="browse-username"], [data-e2e="user-subtitle"]');
    const creator = (authorHandleEl ? authorHandleEl.innerText.trim() : '') || (authorEl ? authorEl.innerText.trim() : '');

    // Sound metadata
    const soundEl = document.querySelector('[data-e2e="browse-music"], [data-e2e="video-music"], a[href*="/music/"]');
    const sound = soundEl ? soundEl.innerText.trim() : '';

    // Commercial Shop Anchor
    const anchorEl = document.querySelector('[data-e2e="anchor-shop"], [class*="anchor-tag"], [class*="shop-anchor"]');
    const shop_anchor = anchorEl ? anchorEl.innerText.trim() : null;

    // Text Overlays / Subtitles in player
    const overlayTexts = [];
    const overlayNodes = document.querySelectorAll('[class*="text-container"], [class*="caption-container"], [class*="subtitle"], [class*="caption-text"], [data-e2e="video-caption"]');
    overlayNodes.forEach(n => {
      const t = n.innerText?.trim();
      if (t && t.length > 2 && !overlayTexts.includes(t)) overlayTexts.push(t);
    });

    const videoEl = document.querySelector('video');
    const hasVideo = !!videoEl;
    const duration = videoEl ? videoEl.duration : null;

    return {
      caption,
      hashtags,
      creator,
      sound,
      shop_anchor,
      overlayTexts,
      hasVideo,
      duration
    };
  });

  // Extract keyframes if video element exists
  let sampledFrames = [];
  if (rawDom.hasVideo) {
    sampledFrames = await sampleVideoKeyframes(page, maxFrames);
  }

  return buildObservationContract({
    video_url: videoUrl,
    creator: rawDom.creator,
    dom: {
      caption: rawDom.caption,
      hashtags: rawDom.hashtags,
      sound: rawDom.sound,
      shop_anchor: rawDom.shop_anchor,
      visible_text: rawDom.overlayTexts.join(' | ')
    },
    visual: {
      has_video_element: rawDom.hasVideo,
      duration_sec: rawDom.duration,
      sampled_frames: sampledFrames,
      text_overlays: rawDom.overlayTexts
    },
    audio: {
      sound_metadata: rawDom.sound
    }
  });
}

/**
 * Builds the canonical Content Observation Contract
 * Deterministic, offline-testable.
 * @param {Object} input
 * @returns {Object} Observation Contract
 */
function buildObservationContract(input = {}) {
  const dom = input.dom || {};
  const visual = input.visual || {};
  const audio = input.audio || {};

  const hasCaption = !!(dom.caption && dom.caption.trim());
  const hasHashtags = Array.isArray(dom.hashtags) && dom.hashtags.length > 0;
  const hasDom = hasCaption || hasHashtags || !!dom.sound || !!dom.shop_anchor;

  const sampledFrames = visual.sampled_frames || [];
  const hasFrames = sampledFrames.length > 0;
  const hasVisualOverlays = Array.isArray(visual.text_overlays) && visual.text_overlays.length > 0;
  const hasVisual = visual.has_video_element || hasFrames || hasVisualOverlays;

  // Modality status
  const modality_status = {
    dom: hasDom ? (hasCaption && hasHashtags ? 'AVAILABLE' : 'PARTIAL') : 'UNAVAILABLE',
    visual: hasFrames ? 'AVAILABLE' : (visual.has_video_element ? 'PARTIAL' : 'UNAVAILABLE'),
    speech: 'UNAVAILABLE' // No native TikTok web ASR
  };

  // HARD RULE: If visual_summary does not come from actual visual interpretation, keep null
  const visual_summary = visual.visual_summary || null;
  const main_objects = visual.main_objects || null;
  const main_action = visual.main_action || null;
  const setting = visual.setting || null;

  // Provenance sources
  let primary_topic_source = 'UNKNOWN';
  if (dom.caption) {
    primary_topic_source = 'OBSERVED_FROM_DOM';
  }

  let main_action_source = 'UNKNOWN';
  if (main_action) {
    main_action_source = 'OBSERVED_FROM_VIDEO';
  }

  let hook_source = 'UNKNOWN';
  if (hasVisualOverlays) {
    hook_source = 'OBSERVED_FROM_DOM';
  } else if (dom.caption) {
    hook_source = 'INFERRED_FROM_CAPTION';
  }

  let visual_pattern_source = 'UNKNOWN';
  if (hasFrames) {
    visual_pattern_source = 'OBSERVED_FROM_VIDEO';
  }

  return {
    video_url: input.video_url || null,
    creator: input.creator || null,

    dom_observations: {
      caption: dom.caption || '',
      hashtags: dom.hashtags || [],
      sound: dom.sound || '',
      shop_anchor: dom.shop_anchor || null,
      visible_text: dom.visible_text || ''
    },

    visual_observations: {
      frame_count: sampledFrames.length,
      frames_observed: sampledFrames,
      visual_summary,
      main_objects,
      main_action,
      setting,
      text_overlay: visual.text_overlays || []
    },

    audio_observations: {
      speech_transcript: null, // HARD RULE: STT not available in V1 runtime
      sound_metadata: audio.sound_metadata || dom.sound || ''
    },

    modality_status,

    provenance: {
      primary_topic_source,
      main_action_source,
      hook_source,
      visual_pattern_source
    }
  };
}

module.exports = {
  sampleVideoKeyframes,
  extractObservationsFromPage,
  buildObservationContract
};
