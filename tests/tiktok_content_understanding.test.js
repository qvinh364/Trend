/**
 * TIKTOK CONTENT UNDERSTANDING FOUNDATION TESTS (PHASE 6B)
 * 
 * Verifies:
 * 1. Hashtag-only metadata cannot create main_action/visual_pattern/format_pattern/hook_pattern
 * 2. Caption-only fingerprint confidence is not HIGH
 * 3. Missing visual/audio remains null/UNKNOWN
 * 4. Provenance preserved per field
 * 5. Two videos with same hashtag but different actual content produce different fingerprints
 * 6. Two videos with different hashtags but same supplied content produce matching fingerprints
 * 7. No invented modalities
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildObservationContract } = require('../src/modules/tiktok/content/contentObserver');
const { buildContentFingerprint, extractEntities } = require('../src/modules/tiktok/content/contentFingerprint');

test('TEST 1: Hashtag-only metadata cannot create main_action, visual_pattern, format_pattern, or hook_pattern', () => {
  const obs = buildObservationContract({
    video_url: 'https://tiktok.com/@user/video/123',
    creator: 'user1',
    dom: {
      caption: '',
      hashtags: ['#samdealruocden', '#fyp'],
      sound: '',
      shop_anchor: null
    },
    visual: {
      has_video_element: false,
      sampled_frames: []
    }
  });

  const fp = buildContentFingerprint(obs);

  assert.equal(fp.main_action, null, 'Hashtag alone must NOT create main_action');
  assert.equal(fp.visual_pattern, null, 'Hashtag alone must NOT create visual_pattern');
  assert.equal(fp.format_pattern, null, 'Hashtag alone must NOT create format_pattern');
  assert.equal(fp.hook_pattern, null, 'Hashtag alone must NOT create hook_pattern');
  assert.equal(fp.confidence, 'INSUFFICIENT', 'Hashtag-only confidence must be INSUFFICIENT');
  assert.equal(fp.field_provenance.primary_topic, 'HASHTAG_ONLY');
});

test('TEST 2: Caption-only fingerprint confidence is NOT HIGH', () => {
  const obs = buildObservationContract({
    video_url: 'https://tiktok.com/@user/video/456',
    creator: 'creator2',
    dom: {
      caption: 'Review nước hoa mini thơm lâu giá học sinh #perfume #nuochoa',
      hashtags: ['#perfume', '#nuochoa'],
      sound: 'Original Sound - creator2'
    },
    visual: {
      has_video_element: false,
      sampled_frames: []
    }
  });

  const fp = buildContentFingerprint(obs);

  assert.notEqual(fp.confidence, 'HIGH', 'Caption-only fingerprint must NEVER be HIGH confidence');
  assert.equal(fp.field_provenance.primary_topic, 'CAPTION_ONLY');
  assert.ok(fp.confidence === 'LOW' || fp.confidence === 'MEDIUM');
});

test('TEST 3: Missing visual and speech modalities remain null/UNKNOWN', () => {
  const obs = buildObservationContract({
    video_url: 'https://tiktok.com/@user/video/789',
    creator: 'creator3',
    dom: {
      caption: 'Cập nhật Free Fire OB55',
      hashtags: ['#ob55']
    }
  });

  const fp = buildContentFingerprint(obs);

  assert.equal(fp.dialogue_pattern, null, 'Unobserved speech must remain null');
  assert.equal(fp.visual_pattern, null, 'Unobserved visual must remain null');
  assert.equal(fp.meme_template, null, 'Unobserved meme template must remain null');
  assert.equal(fp.field_provenance.dialogue_pattern, 'UNAVAILABLE');
  assert.equal(fp.field_provenance.visual_pattern, 'UNKNOWN');
});

test('TEST 4: Provenance is preserved per field', () => {
  const obs = buildObservationContract({
    video_url: 'https://tiktok.com/@user/video/101',
    creator: 'shop_creator',
    dom: {
      caption: 'Săn deal sốc mùa lễ',
      hashtags: ['#sale'],
      sound: 'Trending Music 2026',
      shop_anchor: 'Mua ngay tại TikTok Shop'
    },
    visual: {
      has_video_element: true,
      sampled_frames: [{ position_pct: 50, timestamp_sec: 15, width: 720, height: 1280 }]
    }
  });

  const fp = buildContentFingerprint(obs);

  assert.equal(fp.field_provenance.primary_topic, 'CAPTION_ONLY');
  assert.equal(fp.field_provenance.format_pattern, 'OBSERVED_FROM_DOM');
  assert.equal(fp.field_provenance.visual_pattern, 'OBSERVED_FROM_VIDEO');
  assert.equal(fp.field_provenance.audio_pattern, 'OBSERVED_FROM_DOM');
  assert.equal(fp.commercial_intent, true);
});

test('TEST 5: Two videos with SAME hashtag but DIFFERENT actual content produce DIFFERENT fingerprints', () => {
  // Video A: Perfume review using #samdealruocden
  const obsA = buildObservationContract({
    video_url: 'https://tiktok.com/@perfume/1',
    creator: 'perfume_shop',
    dom: {
      caption: 'Review nước hoa chiết nam chính hãng cực thơm #samdealruocden',
      hashtags: ['#samdealruocden', '#perfume'],
      shop_anchor: 'Nước hoa chiết 10ml'
    },
    visual: {
      has_video_element: true,
      sampled_frames: [{ position_pct: 10 }, { position_pct: 50 }],
      text_overlays: ['Top 3 mùi hương mùa thu']
    }
  });

  // Video B: Gaming Free Fire video using #samdealruocden to leech traffic
  const obsB = buildObservationContract({
    video_url: 'https://tiktok.com/@gamer/2',
    creator: 'gamer_pro',
    dom: {
      caption: 'Highlights kéo tâm Free Fire OB55 máy chủ thử nghiệm #samdealruocden #freefire',
      hashtags: ['#samdealruocden', '#freefire', '#ob55'],
      shop_anchor: null
    },
    visual: {
      has_video_element: true,
      sampled_frames: [{ position_pct: 10 }, { position_pct: 50 }],
      text_overlays: ['OB55 One Tap Highlight']
    }
  });

  const fpA = buildContentFingerprint(obsA);
  const fpB = buildContentFingerprint(obsB);

  assert.notEqual(fpA.primary_topic, fpB.primary_topic, 'Different topics must have different primary_topic');
  assert.notEqual(fpA.format_pattern, fpB.format_pattern, 'Commerce vs Gaming must have different format_pattern');
  assert.notEqual(fpA.commercial_intent, fpB.commercial_intent, 'Commerce vs Gaming commercial intent must differ');
  assert.notDeepStrictEqual(fpA.entities, fpB.entities, 'Entities must differ');
});

test('TEST 6: Two videos with DIFFERENT hashtags but SAME content produce matching fingerprints', () => {
  // Video 1 uses #ob55
  const obs1 = buildObservationContract({
    video_url: 'https://tiktok.com/@ff1/1',
    creator: 'creator_a',
    dom: {
      caption: 'Chi tiết cập nhật Free Fire OB55 chỉnh sửa súng',
      hashtags: ['#ob55', '#freefire']
    },
    visual: {
      has_video_element: true,
      sampled_frames: [{ position_pct: 50 }],
      text_overlays: ['Bản update OB55']
    }
  });

  // Video 2 uses #ffadvance #garena (no #ob55 tag) but exact same topic and entities
  const obs2 = buildObservationContract({
    video_url: 'https://tiktok.com/@ff2/2',
    creator: 'creator_b',
    dom: {
      caption: 'Chi tiết cập nhật Free Fire OB55 chỉnh sửa súng',
      hashtags: ['#ffadvance', '#garena']
    },
    visual: {
      has_video_element: true,
      sampled_frames: [{ position_pct: 50 }],
      text_overlays: ['Bản update OB55']
    }
  });

  const fp1 = buildContentFingerprint(obs1);
  const fp2 = buildContentFingerprint(obs2);

  assert.equal(fp1.primary_topic, fp2.primary_topic, 'Matching content must produce same primary_topic');
  assert.equal(fp1.format_pattern, fp2.format_pattern, 'Matching format must produce same format_pattern');
  assert.deepEqual(fp1.entities, fp2.entities, 'Matching entities must be identical');
});

test('TEST 7: No invented modalities', () => {
  const obs = buildObservationContract({
    video_url: 'https://tiktok.com/@test/999',
    creator: 'tester',
    dom: {
      caption: 'Just a text caption',
      hashtags: ['#test']
    }
  });

  assert.equal(obs.audio_observations.speech_transcript, null, 'Must NOT invent speech transcript');
  assert.equal(obs.visual_observations.visual_summary, null, 'Must NOT invent visual summary without model');
  assert.equal(obs.modality_status.speech, 'UNAVAILABLE');
  assert.equal(obs.modality_status.visual, 'UNAVAILABLE');
});
