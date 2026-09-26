const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  checkVideoAcquisitionFeasibility,
  checkNativeVideoModelAvailability,
  analyzeFullVideo
} = require('../src/modules/tiktok/content/fullVideoAnalyzer.js');
const {
  buildContentFingerprintV2,
  compareFingerprintsV2
} = require('../src/modules/tiktok/content/contentFingerprintV2.js');

describe('Phase 6B.2: Full-Video Multimodal Understanding & Cross-Modal Alignment', () => {
  // Base video analysis fixture representing a fully understood video
  const mockFullVideoA = {
    input_type: 'FULL_VIDEO',
    duration_seconds: 15.0,
    modality_status: {
      visual: 'AVAILABLE',
      motion: 'AVAILABLE',
      audio_music: 'AVAILABLE',
      audio_sfx: 'AVAILABLE',
      spoken_dialogue: 'AVAILABLE',
      on_screen_text: 'AVAILABLE'
    },
    segments: [
      {
        start_seconds: 0.0,
        end_seconds: 5.0,
        visual_action: 'Player approaches enemy tower in Free Fire',
        motion_pattern: 'rapid forward sprint, camera tilt down',
        on_screen_text: 'Mẹo leo rank 100% thắng',
        spoken_dialogue: 'Anh em đi đường này là không bao giờ bị phát hiện',
        music: 'upbeat lofi gaming beat',
        sfx: 'footstep sounds',
        editing_pattern: 'continuous tracking shot'
      },
      {
        start_seconds: 5.0,
        end_seconds: 10.0,
        visual_action: 'Player crouches behind rock and scopes with sniper rifle',
        motion_pattern: 'abrupt stop, slow ADS zoom in',
        on_screen_text: 'Canh đúng góc 45 độ',
        spoken_dialogue: 'Nhắm ngay đầu đối thủ khi hắn vừa ló ra',
        music: 'suspenseful bass build-up',
        sfx: 'gun reload click',
        editing_pattern: 'match cut to scope view'
      },
      {
        start_seconds: 10.0,
        end_seconds: 15.0,
        visual_action: 'Headshot elimination banner followed by victory celebration',
        motion_pattern: 'fast flick shot, character victory emote spin',
        on_screen_text: 'BOOYAH!',
        spoken_dialogue: 'Đấy thấy chưa, một viên là xong trận',
        music: 'heavy bass drop and victory fanfare',
        sfx: 'sniper gunshot followed by headshot chime',
        editing_pattern: 'slow-motion impact replay'
      }
    ],
    narrative_context: {
      premise: 'Gaming tip promise: guaranteed rank victory path',
      setup: 'Demonstrating stealth route to enemy base',
      progression: 'Setting up precise sniper ambush at critical angle',
      turning_point: 'Sniper trigger pull timed with enemy appearance',
      payoff: 'Instant one-shot elimination and rank win'
    },
    cross_modal_events: [
      {
        timestamp_seconds: 10.2,
        event_name: 'Sniper shot impact synchronization',
        visual: 'muzzle flash and elimination banner',
        motion: 'sharp recoil snap',
        dialogue: null,
        audio: 'sniper crack + bass drop'
      },
      {
        timestamp_seconds: 12.0,
        event_name: 'Victory boast and confirmation',
        visual: 'character victory emote',
        motion: 'celebratory spin',
        dialogue: 'Đấy thấy chưa, một viên là xong trận',
        audio: 'fanfare outro'
      }
    ],
    overall: {
      format: 'gaming_tutorial_gameplay',
      topic: 'garena_free_fire_sniper_tactics',
      summary: 'Tactical sniper positioning and elimination tutorial in Free Fire.'
    },
    confidence: 'HIGH'
  };

  // Case 1: Same hashtag + different full-video content => different fingerprints
  it('Case 1: Same hashtag + different full-video content produces distinct fingerprints', () => {
    const rawMetadataShared = {
      video_id: 'vid_101',
      hashtags: ['#freefire', '#gaming', '#highlight'],
      caption: 'Highlight Free Fire hôm nay #freefire #gaming'
    };

    // Video 1: Sniper tutorial
    const analysis1 = analyzeFullVideo(mockFullVideoA);
    const fp1 = buildContentFingerprintV2({
      rawMetadata: { ...rawMetadataShared, video_id: 'vid_101' },
      fullVideoAnalysis: analysis1
    });

    // Video 2: Dance emote meme video (same hashtag #freefire)
    const analysis2 = analyzeFullVideo({
      ...mockFullVideoA,
      segments: [
        {
          start_seconds: 0.0,
          end_seconds: 10.0,
          visual_action: '4 characters dancing in lobby sync emote',
          motion_pattern: 'synchronized repetitive rhythmic dancing',
          on_screen_text: 'Khi team bạn quá rảnh',
          spoken_dialogue: null,
          music: 'viral remix disco beat',
          sfx: null,
          editing_pattern: 'static wide frame'
        }
      ],
      narrative_context: {
        premise: 'Lobby humor',
        setup: 'Waiting in lobby',
        progression: 'Everyone emotes together',
        turning_point: 'Random player joins',
        payoff: 'Full synchronized dance'
      },
      cross_modal_events: [],
      overall: {
        format: 'gaming_meme_dance',
        topic: 'lobby_humor_dance',
        summary: 'Synchronized emote dance in game lobby.'
      }
    });
    const fp2 = buildContentFingerprintV2({
      rawMetadata: { ...rawMetadataShared, video_id: 'vid_102' },
      fullVideoAnalysis: analysis2
    });

    const comparison = compareFingerprintsV2(fp1, fp2);
    assert.strictEqual(comparison.match, false, 'Fingerprints should not match despite identical hashtags');
    assert.notStrictEqual(fp1.temporal_signature, fp2.temporal_signature);
  });

  // Case 2: Different hashtag + same temporal content pattern => fingerprints align
  it('Case 2: Different hashtag + same temporal content pattern align fingerprints', () => {
    const analysisA = analyzeFullVideo(mockFullVideoA);

    const fpA = buildContentFingerprintV2({
      rawMetadata: {
        video_id: 'vid_201',
        hashtags: ['#ptit', '#sinhvien'],
        caption: 'Clip sinh viên #ptit'
      },
      fullVideoAnalysis: analysisA
    });

    const fpB = buildContentFingerprintV2({
      rawMetadata: {
        video_id: 'vid_202',
        hashtags: ['#hocvien', '#congnghe', '#cntt'],
        caption: 'Cách qua môn siêu dễ #hocvien'
      },
      fullVideoAnalysis: analysisA
    });

    const comparison = compareFingerprintsV2(fpA, fpB);
    assert.strictEqual(comparison.match, true, 'Fingerprints should match based on full video temporal signature regardless of hashtags');
    assert.strictEqual(fpA.temporal_signature, fpB.temporal_signature);
  });

  // Case 3: Motion difference affects fingerprint
  it('Case 3: Motion difference affects temporal signature and fingerprint', () => {
    const analysisBase = analyzeFullVideo(mockFullVideoA);
    const fpBase = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_301', hashtags: [] },
      fullVideoAnalysis: analysisBase
    });

    // Modified motion pattern (e.g. static camera without sprint/zoom)
    const modifiedSegments = mockFullVideoA.segments.map((seg, idx) => ({
      ...seg,
      motion_pattern: idx === 0 ? 'stationary camera, zero movement' : seg.motion_pattern
    }));
    const analysisModified = analyzeFullVideo({
      ...mockFullVideoA,
      segments: modifiedSegments
    });
    const fpModified = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_302', hashtags: [] },
      fullVideoAnalysis: analysisModified
    });

    assert.notStrictEqual(fpBase.temporal_signature, fpModified.temporal_signature, 'Motion change must alter temporal signature');
  });

  // Case 4: Speech difference affects fingerprint
  it('Case 4: Spoken dialogue difference affects temporal signature', () => {
    const analysisBase = analyzeFullVideo(mockFullVideoA);
    const fpBase = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_401', hashtags: [] },
      fullVideoAnalysis: analysisBase
    });

    const modifiedSegments = mockFullVideoA.segments.map((seg, idx) => ({
      ...seg,
      spoken_dialogue: idx === 0 ? 'Hôm nay chúng ta sẽ review skin súng mới cực đẹp' : seg.spoken_dialogue
    }));
    const analysisModified = analyzeFullVideo({
      ...mockFullVideoA,
      segments: modifiedSegments
    });
    const fpModified = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_402', hashtags: [] },
      fullVideoAnalysis: analysisModified
    });

    assert.notStrictEqual(fpBase.temporal_signature, fpModified.temporal_signature, 'Dialogue change must alter temporal signature');
  });

  // Case 5: On-screen text difference affects fingerprint
  it('Case 5: On-screen text difference alters temporal signature', () => {
    const analysisBase = analyzeFullVideo(mockFullVideoA);
    const fpBase = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_501', hashtags: [] },
      fullVideoAnalysis: analysisBase
    });

    const modifiedSegments = mockFullVideoA.segments.map((seg, idx) => ({
      ...seg,
      on_screen_text: idx === 0 ? 'Cảnh báo lừa đảo nạp thẻ game' : seg.on_screen_text
    }));
    const analysisModified = analyzeFullVideo({
      ...mockFullVideoA,
      segments: modifiedSegments
    });
    const fpModified = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_502', hashtags: [] },
      fullVideoAnalysis: analysisModified
    });

    assert.notStrictEqual(fpBase.temporal_signature, fpModified.temporal_signature, 'On-screen text change must alter temporal signature');
  });

  // Case 6: Caption/video conflict => conflict preserved
  it('Case 6: Caption vs video conflict is detected and preserved explicitly', () => {
    const analysis = analyzeFullVideo(mockFullVideoA);
    // Video is gaming tutorial, but caption claims it is cooking tutorial
    const fpWithConflict = buildContentFingerprintV2({
      rawMetadata: {
        video_id: 'vid_601',
        caption: 'Hướng dẫn nấu món phở bò gia truyền thơm ngon nức mũi tại nhà',
        hashtags: ['#nauan', '#monngon']
      },
      fullVideoAnalysis: analysis
    });

    assert.strictEqual(fpWithConflict.caption_conflict_detected, true, 'Conflict between cooking caption and gaming video must be flagged');
    assert.strictEqual(fpWithConflict.field_provenance.topic, 'OBSERVED_FROM_VIDEO');
    assert.strictEqual(fpWithConflict.overall_confidence, 'HIGH');
  });

  // Case 7: Cross-modal timing preserved
  it('Case 7: Cross-modal event timing and synchronization are strictly preserved', () => {
    const analysis = analyzeFullVideo(mockFullVideoA);
    const fp = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_701' },
      fullVideoAnalysis: analysis
    });

    assert.ok(Array.isArray(fp.cross_modal_pattern), 'Cross-modal pattern must be an array');
    assert.strictEqual(fp.cross_modal_pattern.length, 2);
    assert.strictEqual(fp.cross_modal_pattern[0].timestamp_seconds, 10.2);
    assert.strictEqual(fp.cross_modal_pattern[0].event_name, 'Sniper shot impact synchronization');
    assert.ok(fp.cross_modal_pattern[0].audio.includes('sniper crack'));
  });

  // Case 8: Narrative structure preserved
  it('Case 8: Narrative structure sequence is fully preserved', () => {
    const analysis = analyzeFullVideo(mockFullVideoA);
    const fp = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_801' },
      fullVideoAnalysis: analysis
    });

    assert.ok(fp.narrative_structure);
    assert.strictEqual(fp.narrative_structure.premise, 'Gaming tip promise: guaranteed rank victory path');
    assert.strictEqual(fp.narrative_structure.turning_point, 'Sniper trigger pull timed with enemy appearance');
    assert.strictEqual(fp.narrative_structure.payoff, 'Instant one-shot elimination and rank win');
  });

  // Case 9: Static-frame-only input cannot receive FULL_VIDEO confidence
  it('Case 9: Static-frame-only input is rejected and cannot receive FULL_VIDEO confidence', () => {
    const staticInput = {
      input_type: 'STATIC_FRAMES_ONLY',
      frames: ['frame1.png', 'frame2.png']
    };
    const analysis = analyzeFullVideo(staticInput);
    assert.strictEqual(analysis.status, 'STATIC_FRAME_ONLY_REJECTED');
    assert.strictEqual(analysis.confidence, 'INSUFFICIENT');

    const fp = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_901' },
      fullVideoAnalysis: analysis
    });
    assert.strictEqual(fp.modality_confidence.overall_video_confidence, 'INSUFFICIENT');
    assert.strictEqual(fp.overall_confidence, 'LOW');
  });

  // Case 10: Unknown audio/speech remains null
  it('Case 10: Unobserved audio/speech remains null without fake defaults', () => {
    const analysisWithUnknownAudio = analyzeFullVideo({
      input_type: 'FULL_VIDEO',
      duration_seconds: 8.0,
      modality_status: {
        visual: 'AVAILABLE',
        motion: 'AVAILABLE',
        audio_music: 'UNAVAILABLE',
        audio_sfx: 'UNAVAILABLE',
        spoken_dialogue: 'UNAVAILABLE',
        on_screen_text: 'AVAILABLE'
      },
      segments: [
        {
          start_seconds: 0.0,
          end_seconds: 8.0,
          visual_action: 'Walking on street',
          motion_pattern: 'panning shot',
          on_screen_text: 'Hà Nội mùa thu',
          spoken_dialogue: null,
          music: null,
          sfx: null,
          editing_pattern: 'single take'
        }
      ],
      narrative_context: {
        premise: 'Autumn walk',
        setup: 'Walking',
        progression: 'Continuing walk',
        turning_point: null,
        payoff: 'Scenic street view'
      },
      cross_modal_events: [],
      overall: {
        format: 'vlog_walk',
        topic: 'street_autumn',
        summary: 'Scenic autumn walk in Hanoi.'
      },
      confidence: 'MEDIUM'
    });

    assert.strictEqual(analysisWithUnknownAudio.segments[0].spoken_dialogue, null);
    assert.strictEqual(analysisWithUnknownAudio.segments[0].music, null);
    assert.strictEqual(analysisWithUnknownAudio.segments[0].sfx, null);

    const fp = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_1001' },
      fullVideoAnalysis: analysisWithUnknownAudio
    });
    assert.strictEqual(fp.modality_confidence.spoken_dialogue, 'UNAVAILABLE');
    assert.strictEqual(fp.modality_confidence.audio_music, 'UNAVAILABLE');
    assert.strictEqual(fp.field_provenance.spoken_dialogue, 'UNKNOWN');
  });

  // Case 11: HIGH confidence requires actual full-video analysis
  it('Case 11: HIGH confidence is granted only when full video analysis is valid and comprehensive', () => {
    const fullAnalysis = analyzeFullVideo(mockFullVideoA);
    const fpFull = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_1101' },
      fullVideoAnalysis: fullAnalysis
    });
    assert.strictEqual(fpFull.overall_confidence, 'HIGH');
    assert.strictEqual(fpFull.field_provenance.topic, 'OBSERVED_FROM_VIDEO');

    // Without full video analysis, only metadata or partial frame
    const fpMetadataOnly = buildContentFingerprintV2({
      rawMetadata: { video_id: 'vid_1102', caption: 'Chỉ có caption' },
      fullVideoAnalysis: null
    });
    assert.strictEqual(fpMetadataOnly.overall_confidence, 'LOW');
    assert.strictEqual(fpMetadataOnly.field_provenance.topic, 'INFERRED');
  });

  // Feasibility & Model Availability Audits
  it('Video acquisition feasibility check reports BLOCKED with exact reason', () => {
    const feasibility = checkVideoAcquisitionFeasibility();
    assert.strictEqual(feasibility.status, 'BLOCKED');
    assert.ok(feasibility.reason.includes('MediaSource'));
  });

  it('Native video model availability check accurately checks environment', () => {
    const modelCheck = checkNativeVideoModelAvailability();
    assert.strictEqual(modelCheck.available, false);
    assert.strictEqual(modelCheck.provider, 'none');
  });
});
