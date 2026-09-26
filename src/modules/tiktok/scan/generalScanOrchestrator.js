/**
 * GENERAL TIKTOK SCAN ORCHESTRATOR (PHASE 4.2 ARCHITECTURE)
 * 
 * Generalizes scan orchestration for Scan #3 and beyond.
 * 
 * Features:
 * 1. Configurable MIN_SCAN_INTERVAL_HOURS (default: 2).
 * 2. Generic time gate based on actual live scan_time (never calculation_repaired_at).
 * 3. Dynamic scan numbering (Scan #1, Scan #2, Scan #3, ...).
 * 4. Dual execution modes: HEADLESS_AUTOMATED vs INTERACTIVE_DESKTOP.
 * 5. Strict previous_score rule: looks up most recent previous snapshot with NON-NULL trend_score.
 *    - If no previous non-null trend_score exists (e.g. Scan 1 null, Scan 2 null), previous_score = null, score_delta = null!
 * 6. Explicit execution_status ('COMPLETED') and data_quality_status ('FULL' | 'PARTIAL').
 */

const fs = require('fs');
const path = require('path');
const { TikTokDatabase, DEFAULT_DB_PATH } = require('../db/tiktokDb');
const { evaluateTopicSignals } = require('../scoring/trendScorer');
const { evaluateCandidateScreening } = require('../screening/screeningEvaluator');
const { evaluateDeepValidation } = require('../validation/validationEvaluator');
const { applyWatchlistHygiene, cleanWatchlist } = require('../watchlist/watchlistManager');
const { writeTikTokResultsJson, validateScanPayload } = require('../schema/outputContract');
const {
  formatRemainingTime,
  formatGmt7,
  extractTopicSearchCards,
  inspectSearchPageUi,
  getBaselineCcMetrics,
  getCurrentCcMetrics,
  findMatchingTopic
} = require('./secondScanOrchestrator');
const {
  TIKTOK_PROFILE_DIR,
  checkPreScanProfileReadiness,
  checkPageAuthUiState,
  checkPageCaptchaUiState
} = require('../session/profileConfig');

const MIN_SCAN_INTERVAL_HOURS = 2;
const DEFAULT_MIN_INTERVAL_MS = MIN_SCAN_INTERVAL_HOURS * 60 * 60 * 1000;

const DEFAULT_PROFILE_DIR = TIKTOK_PROFILE_DIR;
const DEFAULT_WATCHLIST_PATH = path.resolve(__dirname, '../../../../data/tiktok_watchlist.json');
const DEFAULT_RESULTS_PATH = path.resolve(__dirname, '../../../../data/tiktok_results.json');
const CANDIDATES_FILE_PATH = path.resolve(__dirname, '../../../../data/tiktok_candidates.json');

/**
 * Checks generic time gate between latest completed production scan and next scan.
 * Uses live scan_time, never audit/repair timestamps.
 */
function checkGenericTimeGate(dbPath = DEFAULT_DB_PATH, minIntervalMs = DEFAULT_MIN_INTERVAL_MS, referenceNow = new Date()) {
  if (!fs.existsSync(dbPath)) {
    return { eligible: true, status: 'COLD_START', reason: 'No SQLite database found' };
  }

  const db = new TikTokDatabase(dbPath);
  // Find latest completed production scan with topic snapshots
  const latestScan = db.db.prepare(`
    SELECT s.* FROM scans s
    INNER JOIN topic_snapshots ts ON s.scan_id = ts.scan_id
    WHERE s.status = 'COMPLETED'
    GROUP BY s.scan_id
    HAVING count(ts.id) > 0
    ORDER BY s.scan_time DESC LIMIT 1
  `).get();
  db.close();

  if (!latestScan || !latestScan.scan_time) {
    return { eligible: true, status: 'NO_PRIOR_SCAN', reason: 'No prior completed scan found in SQLite' };
  }

  const lastScanMs = new Date(latestScan.scan_time).getTime();
  const nowMs = referenceNow.getTime();
  const elapsedMs = nowMs - lastScanMs;

  const lastScanUtc = latestScan.scan_time;
  const lastScanGmt7 = formatGmt7(lastScanUtc);

  if (elapsedMs < minIntervalMs) {
    const remainingMs = minIntervalMs - elapsedMs;
    const nextEligibleAt = new Date(lastScanMs + minIntervalMs).toISOString();

    return {
      eligible: false,
      status: 'SCAN_NOT_YET_ELIGIBLE',
      latest_scan_id: latestScan.scan_id,
      baseline_scan_id: latestScan.scan_id,
      latest_scan_number: latestScan.scan_number,
      latest_scan_time: lastScanUtc,
      latest_scan_time_utc: lastScanUtc,
      latest_scan_time_gmt7: lastScanGmt7,
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
    status: 'ELIGIBLE_FOR_SCAN',
    latest_scan_id: latestScan.scan_id,
    baseline_scan_id: latestScan.scan_id,
    latest_scan_number: latestScan.scan_number,
    latest_scan_time: lastScanUtc,
    latest_scan_time_utc: lastScanUtc,
    latest_scan_time_gmt7: lastScanGmt7,
    next_eligible_scan_at: new Date(lastScanMs + minIntervalMs).toISOString(),
    elapsed_ms: elapsedMs
  };
}

/**
 * Resolves metadata for the next scan number and kind
 */
function resolveNextScanMetadata(dbOrPath) {
  let db = dbOrPath;
  let shouldClose = false;
  if (typeof dbOrPath === 'string') {
    db = new TikTokDatabase(dbOrPath);
    shouldClose = true;
  }

  const latestScan = db.db.prepare(`
    SELECT s.* FROM scans s
    INNER JOIN topic_snapshots ts ON s.scan_id = ts.scan_id
    WHERE s.status = 'COMPLETED'
    GROUP BY s.scan_id
    HAVING count(ts.id) > 0
    ORDER BY s.scan_number DESC, s.scan_time DESC LIMIT 1
  `).get();

  if (shouldClose) {
    db.close();
  }

  const nextScanNumber = latestScan ? (latestScan.scan_number + 1) : 1;
  const nextScanKind = nextScanNumber === 1
    ? 'BASELINE_SCAN'
    : (nextScanNumber === 2 ? 'SECOND_FULL_SCAN' : `FULL_SCAN_${nextScanNumber}`);
  const nextScanId = `scan_${nextScanNumber}_${Date.now()}`;

  return {
    latest_scan: latestScan || null,
    latestScan: latestScan || null,
    next_scan_number: nextScanNumber,
    nextScanNumber,
    next_scan_kind: nextScanKind,
    nextScanKind,
    next_scan_id: nextScanId,
    nextScanId
  };
}

/**
 * Resolves previous score and score delta strictly from the most recent PREVIOUS
 * comparable snapshot that has a NON-NULL trend_score (Phase 4.2 Rule)
 */
function resolvePreviousScoreAndDelta(topicId, priorToScanTime, currentTrendScore, db) {
  const prevScored = db.getLatestScoredTopicSnapshot(topicId, priorToScanTime);
  if (!prevScored || prevScored.trend_score === null || prevScored.trend_score === undefined) {
    return {
      previous_score: null,
      score_delta: null
    };
  }

  const prevScore = prevScored.trend_score;
  const scoreDelta = (currentTrendScore !== null && currentTrendScore !== undefined)
    ? currentTrendScore - prevScore
    : null;

  return {
    previous_score: prevScore,
    score_delta: scoreDelta
  };
}

/**
 * Executes generic scan orchestration
 */
async function executeGeneralScan(options = {}) {
  const {
    executionMode = 'HEADLESS_AUTOMATED', // 'HEADLESS_AUTOMATED' | 'INTERACTIVE_DESKTOP'
    dbPath = DEFAULT_DB_PATH,
    minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
    referenceNow = new Date(),
    profileDir = DEFAULT_PROFILE_DIR,
    watchlistPath = DEFAULT_WATCHLIST_PATH,
    outputPath = DEFAULT_RESULTS_PATH,
    skipTimeGateCheck = false,
    // Dependency injection hooks:
    discoveryCollector = null,
    screeningCollector = null,
    deepValidationCollector = null,
    existingTopicCollector = null
  } = options;

  // 1. Time Gate Check
  if (!skipTimeGateCheck) {
    const timeGate = checkGenericTimeGate(dbPath, minIntervalMs, referenceNow);
    if (!timeGate.eligible) {
      return {
        success: false,
        status: 'SCAN_NOT_YET_ELIGIBLE',
        timeGate
      };
    }
  }

  const db = new TikTokDatabase(dbPath);
  const scanMeta = resolveNextScanMetadata(db);
  const scanId = options.scanId || scanMeta.next_scan_id;
  const scanTime = options.scanTime || new Date().toISOString();
  const scanNumber = scanMeta.next_scan_number;

  // 2. Register Scan in SQLite as IN_PROGRESS
  db.createScan(scanId, scanTime, `Scan #${scanNumber} in progress (${executionMode})`, scanMeta.next_scan_kind, scanNumber, 'IN_PROGRESS');

  // Cleanup any prior orphaned IN_PROGRESS scans that never recorded snapshots
  try {
    const abandonedScans = db.db.prepare(`
      SELECT scan_id FROM scans
      WHERE status = 'IN_PROGRESS' AND scan_id != ?
    `).all(scanId);
    for (const ab of abandonedScans) {
      const snapCount = db.db.prepare(`SELECT count(*) as c FROM topic_snapshots WHERE scan_id = ?`).get(ab.scan_id).c;
      if (snapCount === 0) {
        db.db.prepare(`
          UPDATE scans
          SET status = 'ABORTED', notes = 'Superseded before orchestration due duplicate scan initialization'
          WHERE scan_id = ?
        `).run(ab.scan_id);
      }
    }
  } catch (_) {}

  // 3. Load Existing Topics from SQLite
  const rawExistingTopics = db.db.prepare(`SELECT * FROM topics`).all();
  const existingTopics = rawExistingTopics.map(t => ({
    topic_id: t.topic_id,
    canonical_title: t.canonical_title,
    aliases: t.aliases_json ? JSON.parse(t.aliases_json) : [],
    first_seen: t.first_seen,
    last_seen: t.last_seen,
    last_checked_at: t.last_checked_at || null,
    type: t.type
  }));

  // 4. Discovery (Run FIRST so discovery browser context closes cleanly before validation browser)
  let discoveredCandidates = [];
  let liveCc7dList = [];
  let liveDiscoveryDiagnostics = null;

  if (typeof discoveryCollector === 'function') {
    discoveredCandidates = await discoveryCollector();
  } else {
    const { runDiscoveryEngine } = require('../discovery/candidateDiscovery');
    const discResult = await runDiscoveryEngine();
    discoveredCandidates = (discResult.payload && discResult.payload.current_candidates) || [];
    liveCc7dList = (discResult.ccData && discResult.ccData.cc7dList) || [];
    liveDiscoveryDiagnostics = discResult.liveDiagnostics;
  }

  // Setup Browser context for Validation if live scanning
  let liveBrowserContext = null;
  let livePage = null;
  let browserLaunchCount = 0;
  const isLiveScan = (!existingTopicCollector || !screeningCollector || !deepValidationCollector);
  let isRestrictedOverall = false;
  const searchUiStateByTopic = new Map();

  if (isLiveScan) {
    const profileStatus = checkPreScanProfileReadiness(profileDir);
    if (!profileStatus.ready) {
      db.close();
      return {
        success: false,
        status: profileStatus.status,
        reason: profileStatus.reason,
        profileDir,
        browserLaunchCount: 0
      };
    }

    try {
      const isHeadless = (executionMode === 'HEADLESS_AUTOMATED');

      if (typeof options.browserLauncher === 'function') {
        browserLaunchCount++;
        const custom = await options.browserLauncher(profileDir, {
          headless: isHeadless,
          executionMode
        });
        liveBrowserContext = custom.context || null;
        livePage = custom.page || null;
      } else {
        browserLaunchCount++;
        const { chromium } = require('playwright');
        liveBrowserContext = await chromium.launchPersistentContext(profileDir, {
          headless: isHeadless,
          viewport: { width: 1280, height: 800 },
          args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
        });
        livePage = liveBrowserContext.pages().length > 0 ? liveBrowserContext.pages()[0] : await liveBrowserContext.newPage();
      }

      if (livePage && executionMode === 'INTERACTIVE_DESKTOP') {
        const authCheck = await checkPageAuthUiState(livePage);
        if (!authCheck.authenticated && authCheck.status === 'ACTION_REQUIRED_LOGIN') {
          console.warn('⚠️ TikTok requires user login. Browser remaining visible for manual login.');
        }

        const captchaCheck = await checkPageCaptchaUiState(livePage);
        if (captchaCheck.captchaPresent) {
          console.warn('⚠️ TikTok verification challenge detected. Please solve manually in the open browser.');
        }
      }
    } catch (browserErr) {
      console.warn(`⚠️ Could not launch persistent browser context (${executionMode}):`, browserErr.message);
    }
  }

  discoveredCandidates.sort((a, b) => (a.candidate_key || '').localeCompare(b.candidate_key || ''));

  // 5. Topic Matching & Routing
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

  for (const exTopic of existingTopics) {
    const alreadyIncluded = trackACandidates.some(t => t.matchedTopic.topic_id === exTopic.topic_id);
    if (!alreadyIncluded) {
      trackACandidates.push({
        candidate: { candidate_key: exTopic.topic_id, canonical_label: exTopic.canonical_title },
        matchedTopic: exTopic
      });
    }
  }

  const evaluatedTrackATopics = [];
  const newlyValidatedTopics = [];
  // Declared before outer try so payload build (after finally) can access them
  let watchlist = [];
  let activeWatchlist = watchlist;

  try {
    // 6. Track A: Existing Topics
    for (const item of trackACandidates) {
      const topicId = item.matchedTopic.topic_id;
      const title = item.matchedTopic.canonical_title;

      let currentEvidence = [];
      let currentCandidateExtra = {};
      let currentSearchUiState = null;

      if (typeof existingTopicCollector === 'function') {
        const topicData = await existingTopicCollector(topicId, item.candidate);
        currentEvidence = topicData.evidence || [];
        currentCandidateExtra = topicData.extra || {};
      } else if (livePage) {
        const currentCc = getCurrentCcMetrics(topicId, liveCc7dList);
        const currentDiscoverySurfaces = [];
        if (currentCc.rank !== null || currentCc.posts !== null || currentCc.views !== null) {
          currentDiscoverySurfaces.push({
            surface_scope: 'market_structured',
            source: 'creative_center_7d',
            observation_id: topicId,
            evidence: `Creative Center 7d rank #${currentCc.rank}`
          });
        }

        const query = item.candidate.canonical_label || title;
        const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
        let isRestricted = false;
        currentSearchUiState = null;
        try {
          await livePage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          try {
            await livePage.waitForSelector('div[class*="DivItemContainer"], a[href*="/video/"]', { timeout: 6000 });
          } catch (_) {}
          await livePage.waitForTimeout(2000);

          const uiState = await inspectSearchPageUi(livePage);
          currentSearchUiState = {
            status: uiState.status,
            restriction_match: uiState.restriction_match || null,
            video_link_count: typeof uiState.video_link_count === 'number' ? uiState.video_link_count : 0,
            inbox_count: typeof uiState.inbox_count === 'number' ? uiState.inbox_count : 0,
            login_required: !!uiState.login_wall_visible,
            captcha_required: !!uiState.captcha_visible
          };
          searchUiStateByTopic.set(topicId, currentSearchUiState);

          if (uiState.status === 'ACCESS_RESTRICTED') {
            isRestricted = true;
            isRestrictedOverall = true;
          } else if (uiState.status === 'SEARCH_RESULTS_AVAILABLE' || uiState.video_link_count > 0) {
            currentEvidence = await extractTopicSearchCards(livePage, 12);
          }
        } catch (err) {
          console.warn(`Search navigation error for "${query}":`, err.message);
        }

        const currentSurfaceCount = currentDiscoverySurfaces.length;
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

      // Previous baseline/comparable snapshot
      const prevSnapshot = db.getLatestTopicSnapshot(topicId, scanTime);
      if (prevSnapshot) {
        const prevEvidence = db.db.prepare(`
          SELECT video_url, creator, published_at FROM evidence_videos
          WHERE topic_id = ? AND scan_id = ?
        `).all(topicId, prevSnapshot.scan_id);
        prevSnapshot.evidence = prevEvidence;
        prevSnapshot.ccRank = prevSnapshot.cc_rank !== undefined ? prevSnapshot.cc_rank : null;
        prevSnapshot.ccPosts = prevSnapshot.cc_posts !== undefined ? prevSnapshot.cc_posts : null;
        prevSnapshot.ccViews = prevSnapshot.cc_views !== undefined ? prevSnapshot.cc_views : null;
      }

      // Evaluate signals
      const evaluation = evaluateTopicSignals({
        evidence: currentEvidence,
        previousSnapshot: prevSnapshot,
        currentSurfaceCount: currentCandidateExtra.current_surface_count !== undefined ? currentCandidateExtra.current_surface_count : 1,
        currentReplication: currentCandidateExtra.currentReplication !== undefined ? currentCandidateExtra.currentReplication : null,
        currentCandidateExtra,
        scanNumber
      });

      // Strict previous score resolution: lookup latest PREVIOUS snapshot that had NON-NULL trend_score
      const scoreHistory = resolvePreviousScoreAndDelta(topicId, scanTime, evaluation.trend_score, db);
      evaluation.previous_score = scoreHistory.previous_score;
      evaluation.score_delta = scoreHistory.score_delta;

      evaluation.cc_rank = currentCandidateExtra.ccRank !== undefined ? currentCandidateExtra.ccRank : null;
      evaluation.cc_posts = currentCandidateExtra.ccPosts !== undefined ? currentCandidateExtra.ccPosts : null;
      evaluation.cc_views = currentCandidateExtra.ccViews !== undefined ? currentCandidateExtra.ccViews : null;
      evaluation.cc_source = 'creative_center_7d';
      evaluation.cc_observation_status = evaluation.cc_rank !== null
        ? 'OBSERVED'
        : 'NOT_OBSERVED_IN_EXPOSED_ROWS';

      const isPositivelyObserved = (evaluation.cc_rank !== null || currentEvidence.length > 0 || (evaluation.current_surface_count || 0) > 0);

      // Upsert topic in SQLite with strict last_seen vs last_checked_at semantics
      db.upsertTopic({
        topic_id: topicId,
        canonical_title: title,
        aliases: item.matchedTopic.aliases,
        scan_time: scanTime,
        first_seen: item.matchedTopic.first_seen,
        type: item.matchedTopic.type,
        is_positively_observed: isPositivelyObserved,
        last_checked_at: scanTime
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
        last_seen: isPositivelyObserved ? scanTime : item.matchedTopic.last_seen,
        last_checked_at: scanTime,
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
          score_status: evaluation.score_status,
          search_status: currentSearchUiState ? currentSearchUiState.status : null,
          search_restriction_match: currentSearchUiState ? currentSearchUiState.restriction_match : null,
          search_video_link_count: currentSearchUiState ? currentSearchUiState.video_link_count : null,
          search_inbox_count: currentSearchUiState ? currentSearchUiState.inbox_count : null,
          search_login_required: currentSearchUiState ? currentSearchUiState.login_required : null,
          search_captcha_required: currentSearchUiState ? currentSearchUiState.captcha_required : null
        },
        evidence: evaluation.evidence
      });
    }

    // 7. Track B: New Candidates
    if (fs.existsSync(watchlistPath)) {
      try {
        watchlist = JSON.parse(fs.readFileSync(watchlistPath, 'utf8'));
        activeWatchlist = watchlist; // sync fallback before cleanWatchlist runs
      } catch (_) {}
    }

    for (const cand of trackBCandidates) {
      let screeningResult = null;
      let candidateSearchUiState = null;
      if (typeof screeningCollector === 'function') {
        screeningResult = await screeningCollector(cand);
      } else if (livePage) {
        const query = cand.canonical_label;
        const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
        let extractedItems = [];
        let isRestricted = false;
        try {
          await livePage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          try {
            await livePage.waitForSelector('div[class*="DivItemContainer"], a[href*="/video/"]', { timeout: 6000 });
          } catch (_) {}
          await livePage.waitForTimeout(2000);

          const uiState = await inspectSearchPageUi(livePage);
          candidateSearchUiState = {
            status: uiState.status,
            restriction_match: uiState.restriction_match || null,
            video_link_count: typeof uiState.video_link_count === 'number' ? uiState.video_link_count : 0,
            inbox_count: typeof uiState.inbox_count === 'number' ? uiState.inbox_count : 0,
            login_required: !!uiState.login_wall_visible,
            captcha_required: !!uiState.captcha_visible
          };
          searchUiStateByTopic.set(cand.candidate_key, candidateSearchUiState);

          if (uiState.status === 'ACCESS_RESTRICTED') {
            isRestricted = true;
            isRestrictedOverall = true;
          } else if (uiState.status === 'SEARCH_RESULTS_AVAILABLE' || uiState.video_link_count > 0) {
            extractedItems = await extractTopicSearchCards(livePage, 5);
          }
        } catch (err) {
          console.warn(`Search navigation error for "${query}":`, err.message);
        }

        screeningResult = evaluateCandidateScreening(cand, extractedItems, {
          accessRestricted: isRestricted,
          searchStatus: candidateSearchUiState ? candidateSearchUiState.status : null
        });
      }

      if (!screeningResult) continue;

      if (screeningResult.status === 'INCONCLUSIVE') {
        const idx = watchlist.findIndex(w => w.candidate_key === cand.candidate_key);
        // STRICT: Per-query status only! Do NOT let isRestrictedOverall leak to individual candidate!
        const checkStatus = (isRestricted || (screeningResult.screening_reason && screeningResult.screening_reason.includes('restricted')))
          ? 'ACCESS_RESTRICTED'
          : (candidateSearchUiState && candidateSearchUiState.status === 'UNKNOWN_UI_STATE' ? 'UNKNOWN_UI_STATE' : screeningResult.status);
        if (idx >= 0) {
          watchlist[idx].last_checked_at = scanTime;
          watchlist[idx].latest_check_status = checkStatus;
          if (!watchlist[idx].status_history) watchlist[idx].status_history = [];
          watchlist[idx].status_history.push({
            timestamp: scanTime,
            status: watchlist[idx].status,
            details: screeningResult.screening_reason || 'Screening could not collect sufficient evidence because TikTok Search access was restricted.'
          });
        } else {
          watchlist.push({
            candidate_key: cand.candidate_key,
            canonical_label: cand.canonical_label,
            status: 'INCONCLUSIVE',
            latest_check_status: checkStatus,
            reason: screeningResult.reason || 'Screening inconclusive',
            first_seen: cand.discovery_time || scanTime,
            last_checked_at: scanTime,
            recheck_on_next_discovery: true,
            aliases: [cand.canonical_label],
            provenance: [{ source_key: cand.candidate_key, source_label: cand.canonical_label }],
            status_history: [{
              timestamp: scanTime,
              status: 'INCONCLUSIVE',
              details: screeningResult.screening_reason || 'Screening inconclusive'
            }]
          });
        }
      } else if (screeningResult.status === 'PASS_TO_DEEP_VALIDATION') {
        let deepRes = null;
        if (typeof deepValidationCollector === 'function') {
          deepRes = await deepValidationCollector(cand, screeningResult.evidence || []);
        }

        if (deepRes && deepRes.decision === 'DEEP_VALIDATED') {
          const newTopicId = cand.candidate_key;
          const newTitle = deepRes.canonical_title || cand.canonical_label;
          const discoveryTime = cand.discovery_time || scanTime;

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
              momentum_score: null,
              momentum_status: 'UNKNOWN'
            },
            evidence: deepRes.evidence || []
          });
        }
      }
    }

    // 8. Run Watchlist Hygiene Cleanup & Persist
    ({ activeWatchlist } = cleanWatchlist(watchlist));
    fs.writeFileSync(watchlistPath, JSON.stringify(activeWatchlist, null, 2), 'utf8');

  } catch (err) {
    try {
      db.db.prepare(`
        UPDATE scans
        SET status = 'FAILED', notes = ?
        WHERE scan_id = ?
      `).run(`FAILED: ${err.message}`, scanId);
    } catch (_) {}
    db.close();
    throw err;
  } finally {
    if (liveBrowserContext) {
      await liveBrowserContext.close().catch(() => {});
    }
  }

  // 9. Operational Status: execution_status vs data_quality_status
  const execution_status = 'COMPLETED';
  const hasZeroSample = evaluatedTrackATopics.some(t => t.signals && t.signals.sample_size === 0);
  const data_quality_status = (isRestrictedOverall || hasZeroSample) ? 'PARTIAL' : 'FULL';

  const limitations = [];
  if (isRestrictedOverall) {
    limitations.push('TikTok Search UI access restricted during current validation');
  }
  if (hasZeroSample) {
    limitations.push('Current evidence sample unavailable for existing topics');
  }

  // 10. Build Payload & Contract
  let sourceRuns = [];
  if (Array.isArray(liveDiscoveryDiagnostics)) {
    sourceRuns = liveDiscoveryDiagnostics;
  } else if (fs.existsSync(CANDIDATES_FILE_PATH)) {
    try {
      const cData = JSON.parse(fs.readFileSync(CANDIDATES_FILE_PATH, 'utf8'));
      if (Array.isArray(cData.source_runs)) {
        sourceRuns = cData.source_runs;
      }
    } catch (_) {}
  }

  const payload = {
    platform: 'tiktok',
    market: 'VN',
    scan_id: scanId,
    scan_number: scanNumber,
    scan_kind: scanMeta.next_scan_kind,
    scan_time: scanTime,
    execution_status,
    data_quality_status,
    browser_execution_mode: executionMode,
    topics: evaluatedTrackATopics,
    new_topics: newlyValidatedTopics,
    watchlist: activeWatchlist,
    source_runs: sourceRuns,
    methodology: {
      score_version: 'v1',
      momentum_method_version: 'v1',
      lifecycle_rule_version: 'v1'
    },
    limitations
  };

  validateScanPayload(payload);
  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  // 11. Mark scan COMPLETED in SQLite
  db.db.prepare(`
    UPDATE scans
    SET status = 'COMPLETED', scan_kind = ?, scan_number = ?
    WHERE scan_id = ?
  `).run(scanMeta.next_scan_kind, scanNumber, scanId);

  db.close();

  return {
    success: true,
    status: 'COMPLETED',
    scan_id: scanId,
    scan_number: scanNumber,
    scan_time: scanTime,
    execution_status,
    data_quality_status,
    browser_execution_mode: executionMode,
    browserLaunchCount,
    trackA_count: evaluatedTrackATopics.length,
    newly_validated_count: newlyValidatedTopics.length,
    payload
  };
}

module.exports = {
  MIN_SCAN_INTERVAL_HOURS,
  DEFAULT_MIN_INTERVAL_MS,
  checkGenericTimeGate,
  checkTimeGate: checkGenericTimeGate,
  resolveNextScanMetadata,
  resolvePreviousScoreAndDelta,
  executeGeneralScan
};
