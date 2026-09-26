/**
 * TIKTOK SECOND FULL SCAN ORCHESTRATOR (PHASE 4.1 LIVE & OFFLINE)
 * 
 * Pipeline:
 * TIME GATE
 *   ↓
 * IDEMPOTENCY GUARD
 *   ↓
 * DISCOVERY (Creative Center 7d/30d + Explore + Search UI)
 *   ↓
 * DETERMINISTIC CANDIDATE SELECTION
 *   ↓
 * TOPIC MATCHING (ALIAS & ID MATCHING)
 *   ↓
 * TRACK A EXISTING TOPICS (CURRENT VALIDATION + MOMENTUM + TREND SCORE + LIFECYCLE)
 *   ↓
 * TRACK B NEW CANDIDATES (LIGHT SCREENING -> DEEP VALIDATION -> NEW BASELINE)
 *   ↓
 * WATCHLIST RECONCILIATION
 *   ↓
 * SQLITE SNAPSHOTS
 *   ↓
 * OUTPUT CONTRACT (data/tiktok_results.json)
 */

const fs = require('fs');
const path = require('path');
const { TikTokDatabase, DEFAULT_DB_PATH } = require('../db/tiktokDb');
const { evaluateTopicSignals } = require('../scoring/trendScorer');
const { evaluateCandidateScreening } = require('../screening/screeningEvaluator');
const { evaluateDeepValidation } = require('../validation/validationEvaluator');
const { writeTikTokResultsJson, validateScanPayload } = require('../schema/outputContract');

const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

const { TIKTOK_PROFILE_DIR } = require('../session/profileConfig');
const DEFAULT_PROFILE_DIR = TIKTOK_PROFILE_DIR;
const WATCHLIST_PATH = path.resolve(__dirname, '../../../../data/tiktok_watchlist.json');
const RESULTS_PATH = path.resolve(__dirname, '../../../../data/tiktok_results.json');
const CANDIDATES_FILE_PATH = path.resolve(__dirname, '../../../../data/tiktok_candidates.json');

/**
 * Format milliseconds into human readable string
 */
function formatRemainingTime(ms) {
  if (ms <= 0) return '0 minutes';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} hours`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} minutes`);
  if (hours === 0 && seconds > 0) parts.push(`${seconds} seconds`);
  return parts.join(' ');
}

/**
 * Format ISO UTC string to GMT+7 formatted string
 */
function formatGmt7(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const utcMs = d.getTime();
  const gmt7Date = new Date(utcMs + 7 * 3600 * 1000);
  const y = gmt7Date.getUTCFullYear();
  const m = String(gmt7Date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(gmt7Date.getUTCDate()).padStart(2, '0');
  const h = String(gmt7Date.getUTCHours()).padStart(2, '0');
  const min = String(gmt7Date.getUTCMinutes()).padStart(2, '0');
  const s = String(gmt7Date.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s} GMT+7`;
}

/**
 * Checks if the 2-hour Time Gate between Scan #1 baseline and Scan #2 has passed.
 * Resolves the genuine baseline scan, not simply the latest row in scans table.
 */
function checkTimeGate(dbPath = DEFAULT_DB_PATH, minInterval = MIN_INTERVAL_MS, referenceNow = new Date()) {
  if (!fs.existsSync(dbPath)) {
    return {
      eligible: true,
      reason: 'No SQLite database found; time gate bypassed for cold start'
    };
  }

  const db = new TikTokDatabase(dbPath);
  const baselineScan = db.resolveBaselineScan();
  db.close();

  if (!baselineScan || !baselineScan.scan_time) {
    return {
      eligible: true,
      reason: 'No completed baseline scan recorded in SQLite'
    };
  }

  const baselineTimeMs = new Date(baselineScan.scan_time).getTime();
  const nowMs = referenceNow.getTime();
  const elapsedMs = nowMs - baselineTimeMs;

  const baselineUtc = baselineScan.scan_time;
  const baselineGmt7 = formatGmt7(baselineUtc);

  if (elapsedMs < minInterval) {
    const remainingMs = minInterval - elapsedMs;
    const nextEligibleAt = new Date(baselineTimeMs + minInterval).toISOString();

    return {
      eligible: false,
      status: 'SCAN_2_NOT_YET_ELIGIBLE',
      baseline_scan_id: baselineScan.scan_id,
      baseline_scan_time: baselineUtc,
      baseline_scan_time_utc: baselineUtc,
      baseline_scan_time_gmt7: baselineGmt7,
      next_eligible_scan_at: nextEligibleAt,
      next_eligible_scan_at_utc: nextEligibleAt,
      next_eligible_scan_at_gmt7: formatGmt7(nextEligibleAt),
      elapsed_ms: elapsedMs,
      remaining_ms: remainingMs,
      remaining_time: formatRemainingTime(remainingMs)
    };
  }

  return {
    eligible: true,
    status: 'ELIGIBLE_FOR_SCAN_2',
    baseline_scan_id: baselineScan.scan_id,
    baseline_scan_time: baselineUtc,
    baseline_scan_time_utc: baselineUtc,
    baseline_scan_time_gmt7: baselineGmt7,
    next_eligible_scan_at: new Date(baselineTimeMs + minInterval).toISOString(),
    next_eligible_scan_at_utc: new Date(baselineTimeMs + minInterval).toISOString(),
    next_eligible_scan_at_gmt7: formatGmt7(new Date(baselineTimeMs + minInterval).toISOString()),
    elapsed_ms: elapsedMs
  };
}

/**
 * Check if candidate matches an existing topic by canonical ID or alias
 */
function findMatchingTopic(candidate, existingTopics = []) {
  if (!candidate) return null;
  const cKey = (candidate.candidate_key || '').trim().toLowerCase();
  const cLabel = (candidate.canonical_label || '').trim().toLowerCase();

  for (const topic of existingTopics) {
    if (topic.topic_id.toLowerCase() === cKey) return topic;
    const aliases = (topic.aliases || []).map(a => a.toLowerCase());
    if (aliases.includes(cKey) || aliases.includes(cLabel)) return topic;
  }
  return null;
}

/**
 * Inspects search page UI state accurately distinguishing:
 * - SEARCH_RESULTS_AVAILABLE
 * - ACCESS_RESTRICTED
 * - LOGIN_REQUIRED
 * - CAPTCHA_REQUIRED
 * - NO_RESULTS
 */
async function inspectSearchPageUi(page) {
  return await page.evaluate(() => {
    const bodyText = document.body ? document.body.innerText : '';
    const loginWallVisible = !!(
      document.querySelector('div[id*="login-modal"]') ||
      document.querySelector('div[class*="login-modal"]') ||
      document.querySelector('form[action*="login"]') ||
      bodyText.includes('Log in to TikTok') ||
      bodyText.includes('Đăng nhập vào TikTok')
    );

    // Actual visible CAPTCHA / verification challenge
    // Do NOT trigger on generic body text like 'verify' without challenge DOM
    const captchaSelectors = [
      '#sec-sdk-captcha-drag-wrapper',
      '.captcha_verify_container',
      '#tiktok-verify-ele',
      'div[class*="captcha"]',
      'div[id*="captcha"]',
      'iframe[src*="captcha"]',
      '.verify-wrap'
    ];
    let captchaVisible = false;
    for (const sel of captchaSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const isVisible = el.offsetParent !== null ||
          (el.getBoundingClientRect && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
        if (isVisible) {
          captchaVisible = true;
          break;
        }
      }
    }

    if (!captchaVisible) {
      const verifyModal = document.querySelector('div[role="dialog"], div[class*="modal"], div[class*="dialog"]');
      if (verifyModal) {
        const modalText = verifyModal.innerText || '';
        const modalVisible = verifyModal.offsetParent !== null ||
          (verifyModal.getBoundingClientRect && verifyModal.getBoundingClientRect().width > 0);
        if (modalVisible && (modalText.includes('Verify to continue') || modalText.includes('Xác minh để tiếp tục') || modalText.includes('Security Check'))) {
          captchaVisible = true;
        }
      }
    }

    const restrictionPatterns = ['Something went wrong', 'Access Denied', 'Too many requests'];
    let restrictionMatch = null;
    for (const pat of restrictionPatterns) {
      if (bodyText.includes(pat)) {
        restrictionMatch = pat;
        break;
      }
    }

    const noResultsText = !!(
      bodyText.includes('No results found') ||
      bodyText.includes('Không tìm thấy kết quả') ||
      bodyText.includes('Try searching for something else')
    );

    // Count only valid Search-result containers — exclude Inbox notification items.
    // Inbox items have data-e2e="inbox-list-item" and their video links are NOT search evidence.
    const isInboxItem = (el) => {
      if (!el) return false;
      return (el.getAttribute && el.getAttribute('data-e2e') === 'inbox-list-item') ||
             (el.closest && el.closest('[data-e2e="inbox-list-item"]') !== null);
    };

    const allContainers = Array.from(document.querySelectorAll('div[class*="DivItemContainer"], div[data-e2e="search_video-item"], div[class*="DivVideoCard"]'));
    const validContainers = allContainers.filter(c => !isInboxItem(c));
    const inboxContainers = allContainers.filter(c => isInboxItem(c));

    // Count video links only within valid (non-inbox) containers
    const allVideoLinks = Array.from(document.querySelectorAll('a[href*="/video/"]'));
    const validVideoLinks = allVideoLinks.filter(a => !isInboxItem(a));

    let status = 'UNKNOWN_UI_STATE';
    if (captchaVisible) {
      status = 'CAPTCHA_REQUIRED';
    } else if (loginWallVisible) {
      status = 'LOGIN_REQUIRED';
    } else if (restrictionMatch) {
      status = 'ACCESS_RESTRICTED';
    } else if (validVideoLinks.length > 0) {
      status = 'SEARCH_RESULTS_AVAILABLE';
    } else if (noResultsText) {
      status = 'NO_RESULTS';
    } else {
      status = 'UNKNOWN_UI_STATE';
    }

    return {
      status,
      login_wall_visible: loginWallVisible,
      captcha_visible: captchaVisible,
      access_restricted: restrictionMatch !== null,
      restriction_match: restrictionMatch,
      no_results_text: noResultsText,
      video_link_count: validVideoLinks.length,
      container_count: validContainers.length,
      inbox_count: inboxContainers.length
    };
  });
}

/**
 * Extracts video items directly from search results page DOM
 * Uses both DivItemContainer and video link fallback for maximum resilience.
 */
async function extractTopicSearchCards(page, maxItems = 12) {
  try {
    await page.waitForSelector('div[class*="DivItemContainer"], a[href*="/video/"]', { timeout: 6000 });
  } catch (_) {}

  return await page.evaluate((limit) => {
    const items = [];
    let containers = Array.from(document.querySelectorAll('div[class*="DivItemContainer"], div[data-e2e="search_video-item"], div[class*="DivVideoCard"]'));

    // Resilient fallback: derive card boundaries from video links if container class shifted
    if (containers.length === 0) {
      const videoLinks = Array.from(document.querySelectorAll('a[href*="/video/"]'));
      containers = videoLinks.map(a => a.closest('div[class*="Item"], div[class*="Card"], div[class*="Container"]') || a.parentElement || a);
    }

    const seenHrefs = new Set();

    for (const c of containers) {
      // Guard: skip TikTok Inbox notification items — these are not video search result cards
      // and their date tokens (e.g. "9-17reviewchanthat:") are notification dates, not publish dates.
      if ((c.getAttribute && c.getAttribute('data-e2e') === 'inbox-list-item') ||
          (c.closest && c.closest('[data-e2e="inbox-list-item"]'))) continue;

      const videoLink = (c.tagName === 'A' && (c.href || '').includes('/video/'))
        ? c
        : c.querySelector('a[href*="/video/"]');
      if (!videoLink || !videoLink.href || seenHrefs.has(videoLink.href)) continue;
      seenHrefs.add(videoLink.href);

      const userLink = c.querySelector('a[href*="/@"]');
      const text = c.innerText || '';
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      let creatorHandle = null;
      const vm = videoLink.href.match(/@([^/?#]+)/);
      if (vm) creatorHandle = '@' + vm[1];
      if (!creatorHandle && userLink) {
        const um = userLink.href.match(/@([^/?#]+)/);
        if (um) creatorHandle = '@' + um[1];
      }

      let caption = null;
      let timeText = null;
      let metricText = null;

      for (const line of lines) {
        if (line.match(/\b(\d+[hdmw]|yesterday|\d+d ago|\d+h ago|\d+w ago|\d+-\d+)\b/i)) {
          timeText = line;
        } else if (line.match(/^(\d+(\.\d+)?[KMB]?)$/i)) {
          if (!metricText) metricText = line;
        } else if (line !== 'Top liked' && line !== 'LIVE' && (!creatorHandle || !line.includes(creatorHandle.replace('@', '')))) {
          if (!caption || line.length > caption.length) {
            caption = line;
          }
        }
      }

      items.push({
        video_url: videoLink.href,
        creator: creatorHandle,
        caption: caption || (text ? text.slice(0, 120) : null),
        published_at: timeText,
        likes: metricText,
        views: null,
        comments: null
      });

      if (items.length >= limit) break;
    }
    return items;
  }, maxItems);
}

/**
 * Read baseline Creative Center metrics from SQLite snapshot history (Phase 4.2D)
 * No longer reads mutable candidate JSON.
 */
function getBaselineCcMetrics(topicId, dbOrPath = DEFAULT_DB_PATH) {
  let db;
  let shouldClose = false;
  if (dbOrPath && typeof dbOrPath.getLatestTopicSnapshot === 'function') {
    db = dbOrPath;
  } else {
    const p = typeof dbOrPath === 'string' ? dbOrPath : DEFAULT_DB_PATH;
    if (!fs.existsSync(p)) return { rank: null, posts: null, views: null };
    db = new TikTokDatabase(p);
    shouldClose = true;
  }

  try {
    const snap = db.db.prepare(`
      SELECT cc_rank, cc_posts, cc_views
      FROM topic_snapshots
      WHERE topic_id = ? AND (scan_id = 'valid_1790284478478' OR scan_id LIKE 'valid_%')
      ORDER BY scan_time ASC
      LIMIT 1
    `).get(topicId);

    if (snap && snap.cc_rank !== null && snap.cc_rank !== undefined) {
      return {
        rank: snap.cc_rank,
        posts: snap.cc_posts,
        views: snap.cc_views
      };
    }
    return { rank: null, posts: null, views: null };
  } catch (_) {
    return { rank: null, posts: null, views: null };
  } finally {
    if (shouldClose) db.close();
  }
}

/**
 * Get current Creative Center metrics from freshly collected CC 7d list
 */
function getCurrentCcMetrics(topicId, cc7dList = []) {
  if (!Array.isArray(cc7dList)) return { rank: null, posts: null, views: null };
  const cleanId = topicId.replace(/^hashtag:/, '').toLowerCase();
  const item = cc7dList.find(c => {
    const l = (c.label || '').toLowerCase();
    const raw = (c.raw_signal || '').toLowerCase();
    return l === cleanId || raw.includes('#' + cleanId);
  });
  if (item) {
    return {
      rank: item.rank !== undefined ? item.rank : null,
      posts: item.posts !== undefined ? item.posts : null,
      views: item.views !== undefined ? item.views : null
    };
  }
  return { rank: null, posts: null, views: null };
}

/**
 * Execute Full Scan #2 Orchestration Pipeline
 * Supports full dependency injection for offline integration testing.
 */
async function executeSecondFullScan(options = {}) {
  const {
    dbPath = DEFAULT_DB_PATH,
    minInterval = MIN_INTERVAL_MS,
    referenceNow = new Date(),
    scanId = `scan_2_${Date.now()}`,
    scanTime = new Date().toISOString(),
    // Dependency injection hooks:
    discoveryCollector = null,
    screeningCollector = null,
    deepValidationCollector = null,
    existingTopicCollector = null,
    watchlistPath = WATCHLIST_PATH,
    outputPath = RESULTS_PATH,
    profileDir = DEFAULT_PROFILE_DIR,
    skipTimeGateCheck = false
  } = options;

  // 1. TIME GATE CHECK
  if (!skipTimeGateCheck) {
    const timeGate = checkTimeGate(dbPath, minInterval, referenceNow);
    if (!timeGate.eligible) {
      return {
        success: false,
        status: 'SCAN_2_NOT_YET_ELIGIBLE',
        timeGate
      };
    }
  }

  const db = new TikTokDatabase(dbPath);

  // 2. IDEMPOTENCY GUARD
  if (db.hasCompletedSecondScan()) {
    db.close();
    return {
      success: false,
      status: 'SCAN_2_ALREADY_COMPLETED'
    };
  }

  // Register scan start in SQLite
  db.createScan(scanId, scanTime, 'Second Full Scan in progress', 'SECOND_FULL_SCAN', 2);

  // 3. LOAD EXISTING TOPICS FROM SQLITE
  const rawExistingTopics = db.db.prepare(`SELECT * FROM topics`).all();
  const existingTopics = rawExistingTopics.map(t => ({
    topic_id: t.topic_id,
    canonical_title: t.canonical_title,
    aliases: t.aliases_json ? JSON.parse(t.aliases_json) : [],
    first_seen: t.first_seen,
    last_seen: t.last_seen,
    type: t.type
  }));

  // 4. DISCOVERY
  let discoveredCandidates = [];
  let liveCc7dList = [];
  let liveDiscoveryDiagnostics = null;

  if (typeof discoveryCollector === 'function') {
    discoveredCandidates = await discoveryCollector();
  } else {
    console.log('\n🔍 [Scan 2] Khởi chạy Authenticated Live Discovery...');
    const { runDiscoveryEngine } = require('../discovery/candidateDiscovery');
    const discResult = await runDiscoveryEngine();
    discoveredCandidates = (discResult.payload && discResult.payload.current_candidates) || [];
    liveCc7dList = (discResult.ccData && discResult.ccData.cc7dList) || [];
    liveDiscoveryDiagnostics = discResult.liveDiagnostics;
  }

  // Deterministic candidate selection / sorting
  discoveredCandidates.sort((a, b) => (a.candidate_key || '').localeCompare(b.candidate_key || ''));

  // 5. TOPIC MATCHING & ROUTING
  const trackACandidates = [];
  const trackBCandidates = [];

  for (const cand of discoveredCandidates) {
    const matched = findMatchingTopic(cand, existingTopics);
    if (matched) {
      trackACandidates.push({ candidate: cand, matchedTopic: matched });
    } else {
      trackBCandidates.push(cand);
    }
  }

  // Make sure all existing topics are evaluated in Track A even if not re-discovered in candidate list
  for (const exTopic of existingTopics) {
    const alreadyIncluded = trackACandidates.some(t => t.matchedTopic.topic_id === exTopic.topic_id);
    if (!alreadyIncluded) {
      trackACandidates.push({
        candidate: { candidate_key: exTopic.topic_id, canonical_label: exTopic.canonical_title },
        matchedTopic: exTopic
      });
    }
  }

  // Setup Browser context for live sampling if needed
  let liveBrowserContext = null;
  let livePage = null;
  const isLiveScan = (!existingTopicCollector || !screeningCollector || !deepValidationCollector);

  if (isLiveScan) {
    try {
      const { chromium } = require('playwright');
      liveBrowserContext = await chromium.launchPersistentContext(profileDir, {
        headless: true,
        viewport: { width: 1280, height: 800 },
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
      });
      livePage = liveBrowserContext.pages().length > 0 ? liveBrowserContext.pages()[0] : await liveBrowserContext.newPage();
    } catch (browserErr) {
      console.warn('⚠️ Could not launch persistent browser context for live scanning:', browserErr.message);
    }
  }

  const evaluatedTrackATopics = [];
  const newlyValidatedTopics = [];

  try {
    // 6. PROCESS TRACK A (Existing Topics: Validation, Momentum, Trend Score V1, Invariants)
    console.log(`\n📊 [Track A] Đánh giá ${trackACandidates.length} existing topics...`);

    for (const item of trackACandidates) {
      const topicId = item.matchedTopic.topic_id;
      const title = item.matchedTopic.canonical_title;
      console.log(`   * Đang xử lý: ${topicId} ("${title}")`);

      let currentEvidence = [];
      let currentCandidateExtra = {};

      if (typeof existingTopicCollector === 'function') {
        const topicData = await existingTopicCollector(topicId, item.candidate);
        currentEvidence = topicData.evidence || [];
        currentCandidateExtra = topicData.extra || {};
      } else if (livePage) {
        // Live sampling for existing topic
        const query = item.candidate.canonical_label || title;
        const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
        try {
          await livePage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await livePage.waitForTimeout(3500);

          const isRestricted = await livePage.evaluate(() => {
            const body = document.body ? document.body.innerText : '';
            return body.includes('Verify to continue') || body.includes('Security Check') || !!document.querySelector('div[class*="captcha"]');
          });

          if (!isRestricted) {
            currentEvidence = await extractTopicSearchCards(livePage, 12);
          } else {
            console.warn(`     ⚠️ TikTok security check detected for "${query}". Stopping source safely.`);
          }
        } catch (searchErr) {
          console.warn(`     ⚠️ Error searching for "${query}":`, searchErr.message);
        }

        const currentCc = getCurrentCcMetrics(topicId, liveCc7dList);
        
        // Audit genuine discovery surfaces (CRITICAL ISSUE 7)
        const currentDiscoverySurfaces = [];
        if (currentCc.rank !== null || currentCc.posts !== null || currentCc.views !== null) {
          currentDiscoverySurfaces.push({
            surface_scope: 'market_structured',
            source: 'creative_center_7d',
            observation_id: topicId,
            evidence: `Creative Center 7d rank #${currentCc.rank}`
          });
        }
        const currentSurfaceCount = currentDiscoverySurfaces.length;

        // Current replication cannot be true if sample_size is 0 (CRITICAL ISSUE 1)
        const currentReplication = currentEvidence.length >= 3 ? true : (currentEvidence.length >= 2 ? 'partial' : null);

        currentCandidateExtra = {
          ccRank: currentCc.rank,
          ccPosts: currentCc.posts,
          ccViews: currentCc.views,
          current_discovery_surfaces: currentDiscoverySurfaces,
          current_surface_count: currentSurfaceCount,
          surfaceCount: currentSurfaceCount,
          currentReplication
        };
      }

      // Retrieve previous baseline snapshot and evidence
      const prevSnapshot = db.getLatestTopicSnapshot(topicId);
      if (prevSnapshot) {
        const prevEvidence = db.db.prepare(`
          SELECT video_url, creator, published_at FROM evidence_videos
          WHERE topic_id = ? AND scan_id = ?
        `).all(topicId, prevSnapshot.scan_id);
        prevSnapshot.evidence = prevEvidence;

        const baseCc = getBaselineCcMetrics(topicId, db);
        prevSnapshot.ccRank = prevSnapshot.cc_rank !== undefined && prevSnapshot.cc_rank !== null ? prevSnapshot.cc_rank : baseCc.rank;
        prevSnapshot.ccPosts = prevSnapshot.cc_posts !== undefined && prevSnapshot.cc_posts !== null ? prevSnapshot.cc_posts : baseCc.posts;
        prevSnapshot.ccViews = prevSnapshot.cc_views !== undefined && prevSnapshot.cc_views !== null ? prevSnapshot.cc_views : baseCc.views;
      }

      // Evaluate Topic Signals (Momentum & Trend Score V1)
      const evaluation = evaluateTopicSignals({
        evidence: currentEvidence,
        previousSnapshot: prevSnapshot,
        currentSurfaceCount: currentCandidateExtra.current_surface_count !== undefined ? currentCandidateExtra.current_surface_count : 1,
        currentReplication: currentCandidateExtra.currentReplication !== undefined ? currentCandidateExtra.currentReplication : null,
        currentCandidateExtra,
        scanNumber: 2
      });

      // Enforce Invariant: In Scan #2, baseline had trend_score = null, so previous_score = null and score_delta = null
      evaluation.previous_score = null;
      evaluation.score_delta = null;

      evaluation.cc_rank = currentCandidateExtra.ccRank !== undefined ? currentCandidateExtra.ccRank : null;
      evaluation.cc_posts = currentCandidateExtra.ccPosts !== undefined ? currentCandidateExtra.ccPosts : null;
      evaluation.cc_views = currentCandidateExtra.ccViews !== undefined ? currentCandidateExtra.ccViews : null;
      evaluation.cc_source = 'creative_center_7d';
      evaluation.cc_observation_status = evaluation.cc_rank !== null ? 'OBSERVED' : 'UNAVAILABLE';

      // Update topic in SQLite: preserve first_seen, update last_seen
      db.upsertTopic({
        topic_id: topicId,
        canonical_title: title,
        aliases: item.matchedTopic.aliases,
        scan_time: scanTime,
        first_seen: item.matchedTopic.first_seen, // PRESERVE
        type: item.matchedTopic.type
      });

      // Save snapshot in SQLite
      db.saveTopicSnapshot({
        topic_id: topicId,
        scan_id: scanId,
        scan_time: scanTime,
        evaluation,
        why_now: currentCandidateExtra.why_now || [],
        repeated_narratives: currentCandidateExtra.repeated_narratives || [],
        related_searches: currentCandidateExtra.related_searches || []
      });

      evaluatedTrackATopics.push({
        topic_id: topicId,
        title,
        aliases: item.matchedTopic.aliases,
        type: item.matchedTopic.type,
        first_seen: item.matchedTopic.first_seen,
        last_seen: scanTime,
        lifecycle: evaluation.lifecycle,
        confidence: evaluation.confidence,
        score: evaluation.trend_score,
        previous_score: evaluation.previous_score,
        score_delta: evaluation.score_delta,
        score_version: evaluation.score_version,
        signals: {
          sample_size: evaluation.sample_size,
          unique_creators: evaluation.unique_creators,
          fresh_0_24h: evaluation.fresh_0_24h,
          fresh_24_72h: evaluation.fresh_24_72h,
          fresh_3_7d: evaluation.fresh_3_7d,
          older_7d: evaluation.older_7d,
          known_timestamp_count: evaluation.known_timestamp_count,
          freshness_observation_status: evaluation.freshness_observation_status,
          creator_spread_points: evaluation.creator_spread_points,
          freshness_points: evaluation.freshness_points,
          replication_points: evaluation.replication_points,
          replication_status: evaluation.replication_status,
          current_replication: evaluation.current_replication,
          cross_surface_points: evaluation.cross_surface_points,
          current_surface_count: evaluation.current_surface_count,
          current_discovery_surfaces: currentCandidateExtra.current_discovery_surfaces || [],
          creator_spread_score: evaluation.creator_spread_score,
          freshness_score: evaluation.freshness_score,
          replication_strength: evaluation.replication_score,
          momentum_score: evaluation.momentum_score,
          momentum_status: evaluation.momentum_status,
          momentum_coverage: evaluation.momentum_coverage_audit ? evaluation.momentum_coverage_audit.momentum_coverage : null,
          momentum_raw_signals: evaluation.momentum_raw_signals,
          available_weight: evaluation.available_weight,
          score_coverage: evaluation.score_coverage,
          score_status: evaluation.score_status
        },
        evidence: evaluation.evidence
      });
    }

    // 7. PROCESS TRACK B (New Candidates: Light Screening -> Deep Validation -> Baseline)
    console.log(`\n🧭 [Track B] Sàng lọc ${trackBCandidates.length} new candidates...`);
    let currentWatchlist = [];
    if (fs.existsSync(watchlistPath)) {
      try {
        currentWatchlist = JSON.parse(fs.readFileSync(watchlistPath, 'utf8'));
      } catch (_) {}
    }

    for (const cand of trackBCandidates) {
      let screeningResult = null;

      if (typeof screeningCollector === 'function') {
        screeningResult = await screeningCollector(cand);
      } else if (livePage) {
        const query = cand.canonical_label;
        const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
        let extractedItems = [];
        let isRestricted = false;
        try {
          await livePage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await livePage.waitForTimeout(3500);

          isRestricted = await livePage.evaluate(() => {
            const body = document.body ? document.body.innerText : '';
            return body.includes('Verify to continue') || body.includes('Security Check') || !!document.querySelector('div[class*="captcha"]');
          });

          if (!isRestricted) {
            extractedItems = await extractTopicSearchCards(livePage, 5);
          }
        } catch (_) {}

        screeningResult = evaluateCandidateScreening(cand, extractedItems, { accessRestricted: isRestricted });
      }

      if (!screeningResult) continue;

      if (screeningResult.status === 'DROP') {
        continue;
      } else if (screeningResult.status === 'INCONCLUSIVE') {
        const idx = currentWatchlist.findIndex(w => w.candidate_key === cand.candidate_key);
        if (idx >= 0) {
          currentWatchlist[idx].last_checked_at = scanTime;
        } else {
          currentWatchlist.push({
            candidate_key: cand.candidate_key,
            canonical_label: cand.canonical_label,
            status: 'INCONCLUSIVE',
            reason: screeningResult.reason || 'Screening inconclusive',
            sample_size_at_screening: screeningResult.sample_size || 0,
            last_checked_at: scanTime,
            recheck_on_next_discovery: true
          });
        }
      } else if (screeningResult.status === 'PASS_TO_DEEP_VALIDATION') {
        let deepRes = null;

        if (typeof deepValidationCollector === 'function') {
          deepRes = await deepValidationCollector(cand, screeningResult.evidence || []);
        } else if (livePage) {
          const query = cand.canonical_label;
          let deepItems = [];
          try {
            deepItems = await extractTopicSearchCards(livePage, 12);
          } catch (_) {}
          deepRes = evaluateDeepValidation(cand, deepItems);
        }

        if (deepRes && deepRes.decision === 'DEEP_VALIDATED') {
          const newTopicId = cand.candidate_key;
          const newTitle = deepRes.canonical_title || cand.canonical_label;
          const discoveryTime = cand.discovery_time || cand.observed_at || scanTime;

          const baselineEvaluation = {
            sample_size: deepRes.sample_size,
            unique_creators: deepRes.unique_creators,
            fresh_0_24h: deepRes.fresh_0_24h || 0,
            fresh_24_72h: deepRes.fresh_24_72h || 0,
            fresh_3_7d: deepRes.fresh_3_7d || 0,
            older_7d: deepRes.older_7d || 0,
            creator_spread_score: null,
            freshness_score: null,
            replication_score: null,
            cross_surface_score: null,
            engagement_score: null,
            momentum_score: null,
            momentum_status: 'UNKNOWN',
            trend_score: null,
            previous_score: null,
            score_delta: null,
            score_version: 'v1',
            lifecycle: 'CANDIDATE',
            confidence: 'LOW',
            score_status: 'NOT_READY',
            evidence: deepRes.evidence || []
          };

          db.upsertTopic({
            topic_id: newTopicId,
            canonical_title: newTitle,
            aliases: cand.aliases || [cand.canonical_label],
            scan_time: scanTime,
            first_seen: discoveryTime,
            type: 'hot_topic'
          });

          db.saveTopicSnapshot({
            topic_id: newTopicId,
            scan_id: scanId,
            scan_time: scanTime,
            evaluation: baselineEvaluation,
            why_now: deepRes.why_now || [],
            repeated_narratives: deepRes.repeated_narratives || [],
            related_searches: deepRes.related_searches || []
          });

          newlyValidatedTopics.push({
            topic_id: newTopicId,
            title: newTitle,
            aliases: cand.aliases || [cand.canonical_label],
            type: 'hot_topic',
            first_seen: discoveryTime,
            last_seen: scanTime,
            lifecycle: 'CANDIDATE',
            confidence: 'LOW',
            score: null,
            previous_score: null,
            score_delta: null,
            score_version: 'v1',
            signals: {
              sample_size: deepRes.sample_size,
              unique_creators: deepRes.unique_creators,
              fresh_0_24h: deepRes.fresh_0_24h || 0,
              fresh_24_72h: deepRes.fresh_24_72h || 0,
              fresh_3_7d: deepRes.fresh_3_7d || 0,
              older_7d: deepRes.older_7d || 0,
              momentum_score: null,
              momentum_status: 'UNKNOWN'
            },
            evidence: deepRes.evidence || []
          });
        }
      }
    }

    // 8. PERSIST WATCHLIST
    fs.writeFileSync(watchlistPath, JSON.stringify(currentWatchlist, null, 2), 'utf8');

  } finally {
    if (liveBrowserContext) {
      await liveBrowserContext.close().catch(() => {});
    }
  }

  // 9. BUILD RESULTS PAYLOAD & OUTPUT CONTRACT
  const combinedTopics = [...evaluatedTrackATopics, ...newlyValidatedTopics];
  const payload = {
    platform: 'tiktok',
    market: 'VN',
    scan_id: scanId,
    scan_time: scanTime,
    topics: combinedTopics
  };

  validateScanPayload(payload);
  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  // 10. MARK SCAN COMPLETED IN SQLITE
  db.db.prepare(`
    UPDATE scans
    SET status = 'COMPLETED', scan_kind = 'SECOND_FULL_SCAN', scan_number = 2
    WHERE scan_id = ?
  `).run(scanId);

  db.close();

  return {
    success: true,
    status: 'COMPLETED',
    scan_id: scanId,
    scan_time: scanTime,
    trackA_count: evaluatedTrackATopics.length,
    newly_validated_count: newlyValidatedTopics.length,
    discovered_candidates_count: discoveredCandidates.length,
    trackB_candidates_count: trackBCandidates.length,
    liveDiagnostics: liveDiscoveryDiagnostics,
    payload
  };
}

module.exports = {
  MIN_INTERVAL_MS,
  formatRemainingTime,
  formatGmt7,
  checkTimeGate,
  findMatchingTopic,
  extractTopicSearchCards,
  inspectSearchPageUi,
  getBaselineCcMetrics,
  getCurrentCcMetrics,
  executeSecondFullScan
};
