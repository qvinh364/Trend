/**
 * TIKTOK DEEP VALIDATION ORCHESTRATOR (PHASE 3)
 * 
 * - Reuses Phase 2B evidence to avoid duplicated requests.
 * - Extracts additional unique video items to reach total sample 8-15.
 * - Enforces minimum necessary interaction (Search result cards).
 * - Derives validated_topic_label, spread_mode, narratives, freshness breakdown.
 * - Validates schema with validationContract.
 * - Writes baseline SQLite snapshot to data/tiktok_trends.db (with trend_score=null, momentum=UNKNOWN).
 * - Writes inconclusive candidate to data/tiktok_watchlist.json.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { evaluateDeepValidation } = require('./validationEvaluator');
const { validateValidationPayload } = require('./validationContract');
const { TikTokDatabase } = require('../db/tiktokDb');
const { TIKTOK_PROFILE_DIR } = require('../session/profileConfig');

const DEFAULT_PROFILE_DIR = TIKTOK_PROFILE_DIR;
const DEFAULT_SCREENING_PATH = path.resolve(__dirname, '../../../../data/tiktok_screening_results.json');
const DEFAULT_RECONCILIATION_PATH = path.resolve(__dirname, '../../../../data/tiktok_mylivejourney_reconciliation.json');
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '../../../../data/tiktok_validation_results.json');
const DEFAULT_WATCHLIST_PATH = path.resolve(__dirname, '../../../../data/tiktok_watchlist.json');
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../../../data/tiktok_trends.db');

async function extractAdditionalSearchCards(page, existingUrls = new Set(), targetAdditional = 6) {
  return await page.evaluate(({ existingUrlsArr, targetAdditional }) => {
    const existingSet = new Set(existingUrlsArr);
    const newItems = [];
    const containers = Array.from(document.querySelectorAll('div[class*="DivItemContainer"]'));

    for (const c of containers) {
      const videoLink = c.querySelector('a[href*="/video/"]');
      if (!videoLink || !videoLink.href || existingSet.has(videoLink.href) || newItems.some(i => i.video_url === videoLink.href)) {
        continue;
      }

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

      newItems.push({
        video_url: videoLink.href,
        creator_handle: creatorHandle,
        caption: caption || (text ? text.slice(0, 120) : null),
        time_text: timeText,
        likes: metricText,
        views: null,
        comments: null
      });

      if (newItems.length >= targetAdditional) break;
    }

    return newItems;
  }, { existingUrlsArr: Array.from(existingUrls), targetAdditional });
}

async function runDeepValidation(options = {}) {
  const screeningPath = options.screeningPath || DEFAULT_SCREENING_PATH;
  const outputPath = options.outputPath || DEFAULT_OUTPUT_PATH;
  const watchlistPath = options.watchlistPath || DEFAULT_WATCHLIST_PATH;
  const profileDir = options.profileDir || DEFAULT_PROFILE_DIR;
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const timeoutMs = options.timeoutMs || 25000;

  if (!fs.existsSync(screeningPath)) {
    throw new Error(`Screening results file not found at: ${screeningPath}`);
  }

  const screeningData = JSON.parse(fs.readFileSync(screeningPath, 'utf8'));
  const allResults = screeningData.results || [];

  // 1. Identify finalists
  const finalists = allResults.filter(r => r.screening_status === 'PASS_TO_DEEP_VALIDATION');

  // Check reconciliation status for mylivejourney
  if (fs.existsSync(DEFAULT_RECONCILIATION_PATH)) {
    try {
      const rec = JSON.parse(fs.readFileSync(DEFAULT_RECONCILIATION_PATH, 'utf8'));
      if (rec.reconciliation_status === 'PROMOTE_TO_DEEP_VALIDATION') {
        const mlj = allResults.find(r => r.candidate_key === 'hashtag:mylivejourney');
        if (mlj && !finalists.some(f => f.candidate_key === mlj.candidate_key)) {
          finalists.push(mlj);
        }
      }
    } catch (_) {}
  }

  console.log(`[DeepValidator] Identified ${finalists.length} finalist candidate(s) for Deep Validation:`);
  finalists.forEach(f => console.log(`   * ${f.candidate_key} (Previous evidence: ${f.evidence.length})`));

  // 2. Identify watchlist candidate(s)
  const inconclusiveList = allResults.filter(r => r.screening_status === 'INCONCLUSIVE');
  const watchlistItems = inconclusiveList.map(item => ({
    candidate_key: item.candidate_key,
    canonical_label: item.canonical_label,
    status: 'INCONCLUSIVE',
    reason: item.screening_reason,
    sample_size_at_screening: item.sample_size,
    last_checked_at: screeningData.screened_at,
    recheck_on_next_discovery: true
  }));

  fs.writeFileSync(watchlistPath, JSON.stringify(watchlistItems, null, 2), 'utf8');
  console.log(`[DeepValidator] Wrote ${watchlistItems.length} candidate(s) to watchlist: ${watchlistPath}`);

  // 3. Expand evidence using persistent profile
  let browserContext = null;
  const validationResults = [];

  try {
    browserContext = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });

    const page = browserContext.pages().length > 0 ? browserContext.pages()[0] : await browserContext.newPage();

    for (let i = 0; i < finalists.length; i++) {
      const candidate = finalists[i];
      const previousEvidence = candidate.evidence || [];
      const seenUrls = new Set(previousEvidence.map(e => e.video_url));

      console.log(`\n🔬 [${i + 1}/${finalists.length}] Deep Validating: "${candidate.candidate_key}"`);
      console.log(`   * Reusing ${previousEvidence.length} existing evidence items from Phase 2B`);

      const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(candidate.canonical_label)}`;
      let newEvidence = [];

      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForTimeout(3000);

        // Check if "Try again" button appears due to rapid search queries
        const tryAgainBtn = await page.$('button:has-text("Try again")');
        if (tryAgainBtn) {
          console.log('   ⏳ Detected server "Try again" button. Waiting 4s and clicking...');
          await page.waitForTimeout(4000);
          await tryAgainBtn.click().catch(() => {});
          await page.waitForTimeout(4000);
        }

        // Security / Verification check
        const isRestricted = await page.evaluate(() => {
          const body = document.body ? document.body.innerText : '';
          return body.includes('Verify to continue') || body.includes('Security Check') || !!document.querySelector('div[class*="captcha"]');
        });

        if (isRestricted) {
          console.warn(`   ⚠️ TikTok security verification detected. Stopping gracefully.`);
          break;
        }

        // Slight scroll to load next tier of cards beyond first 3
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(2500);

        // Extract additional items
        const needed = 10; // Request up to 10 additional to comfortably exceed sample target of 8
        newEvidence = await extractAdditionalSearchCards(page, seenUrls, needed);
        console.log(`   * Trích xuất thêm ${newEvidence.length} video mới`);

      } catch (err) {
        console.warn(`   ⚠️ Navigation/extraction error for ${candidate.canonical_label}:`, err.message);
      }

      // 4. Evaluate Deep Validation
      const result = evaluateDeepValidation(candidate, previousEvidence, newEvidence);
      console.log(`   * Kết quả Deep Validation: ${result.validation_status} (Sample: ${result.sample_size}, Creators: ${result.unique_creators}, Relevant: ${result.relevant_evidence_count})`);
      console.log(`   * Validated Topic: "${result.validated_topic_label}" [Spread Mode: ${result.spread_mode}]`);

      validationResults.push(result);
      await page.waitForTimeout(2000);
    }
  } finally {
    if (browserContext) {
      await browserContext.close().catch(() => {});
    }
  }

  // 5. Construct payload & Validate contract
  const payload = {
    scan_id: `valid_${Date.now()}`,
    validated_at: new Date().toISOString(),
    source_discovery_scan_id: screeningData.source_candidate_scan_id || 'unknown',
    source_screening_scan_id: screeningData.scan_id || 'unknown',
    results: validationResults
  };

  validateValidationPayload(payload);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\n✅ [DeepValidator] Đã lưu kết quả Deep Validation tại: ${outputPath}`);

  // 6. Record Baseline Snapshot in SQLite DB
  const db = new TikTokDatabase(dbPath);
  const scanTime = payload.validated_at;
  db.createScan(payload.scan_id, scanTime, 'Phase 3 Baseline Validation Scan');

  for (const item of validationResults) {
    if (item.validation_status === 'DEEP_VALIDATED') {
      const topicId = item.candidate_key;

      // Upsert topic
      db.upsertTopic({
        topic_id: topicId,
        canonical_title: item.validated_topic_label,
        aliases: item.aliases,
        scan_time: scanTime,
        type: item.validated_type
      });

      // Prepare evaluation payload for SQLite snapshot
      const evaluationPayload = {
        sample_size: item.sample_size,
        unique_creators: item.unique_creators,
        fresh_0_24h: item.freshness.fresh_0_24h,
        fresh_24_72h: item.freshness.fresh_24_72h,
        fresh_3_7d: item.freshness.fresh_3_7d,
        older_7d: item.freshness.older_7d,
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
        lifecycle: null,
        confidence: item.type_confidence,
        score_status: 'NOT_READY',
        evidence: item.evidence.map(e => ({
          video_url: e.video_url,
          creator: e.creator_handle,
          caption: e.caption,
          published_at: e.published_at,
          views: e.views,
          likes: e.likes,
          comments: e.comments,
          sound: e.sound_title,
          time_bucket: e.freshness_bucket,
          narrative: e.observed_pattern,
          format: null
        }))
      };

      db.saveTopicSnapshot({
        topic_id: topicId,
        scan_id: payload.scan_id,
        scan_time: scanTime,
        evaluation: evaluationPayload,
        repeated_narratives: item.repeated_narratives
      });

      console.log(`   💾 [SQLite] Saved baseline snapshot for: ${topicId} (trend_score: null, momentum: UNKNOWN)`);
    }
  }

  return payload;
}

module.exports = {
  runDeepValidation,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_WATCHLIST_PATH
};
