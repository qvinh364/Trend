/**
 * TIKTOK LIGHT SCREENING COLLECTOR (PHASE 2B)
 * 
 * Orchestrates live screening of current_candidates via Playwright persistent profile:
 * - Screens ONLY current_candidates (historical_context is strictly ignored).
 * - Priority order: MEDIUM candidates first, WEAK candidates second.
 * - Uses exact candidate.canonical_label as search query (Zero generic keyword injections).
 * - Reads metadata directly from search result cards (minimum necessary interaction).
 * - Evaluates candidate with 2-tier sampling (3 items tier 1, up to max 5 items tier 2).
 * - Stops cleanly if security verification / CAPTCHA is detected.
 * - Zero SQLite Cookie DB queries, zero secret decryption, zero secret logging.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { evaluateCandidateScreening, normalizeMetric } = require('./screeningEvaluator');
const { validateScreeningPayload } = require('./screeningContract');
const { TIKTOK_PROFILE_DIR } = require('../session/profileConfig');

const DEFAULT_PROFILE_DIR = TIKTOK_PROFILE_DIR;
const DEFAULT_CANDIDATES_PATH = path.resolve(__dirname, '../../../../data/tiktok_candidates.json');
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '../../../../data/tiktok_screening_results.json');

/**
 * Extracts video items directly from search results page DOM
 */
async function extractSearchCardItems(page) {
  return await page.evaluate(() => {
    const items = [];
    const containers = Array.from(document.querySelectorAll('div[class*="DivItemContainer"]'));
    const seenHrefs = new Set();

    for (const c of containers) {
      const videoLink = c.querySelector('a[href*="/video/"]');
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
        creator_handle: creatorHandle,
        caption: caption || (text ? text.slice(0, 100) : null),
        time_text: timeText,
        likes: metricText, // TikTok search cards often display likes count
        views: null, // Distinct views rarely separated on search card
        comments: null
      });

      if (items.length >= 6) break; // Fetch up to 6 to support 2-tier evaluation up to 5 items
    }

    return items;
  });
}

/**
 * Runs Light Screening for all current_candidates
 */
async function runLightScreening(options = {}) {
  const candidatesPath = options.candidatesPath || DEFAULT_CANDIDATES_PATH;
  const outputPath = options.outputPath || DEFAULT_OUTPUT_PATH;
  const profileDir = options.profileDir || DEFAULT_PROFILE_DIR;
  const timeoutMs = options.timeoutMs || 25000;

  if (!fs.existsSync(candidatesPath)) {
    throw new Error(`Candidates file not found at: ${candidatesPath}`);
  }

  const rawCandidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
  const currentCandidates = rawCandidates.current_candidates || [];

  console.log(`[ScreeningCollector] Found ${currentCandidates.length} current candidates to screen.`);

  // Sort candidates by priority: MEDIUM first, WEAK second
  const priorityWeight = { STRONG: 3, MEDIUM: 2, WEAK: 1 };
  const sortedCandidates = [...currentCandidates].sort((a, b) => {
    return (priorityWeight[b.discovery_signal_strength] || 0) - (priorityWeight[a.discovery_signal_strength] || 0);
  });

  const results = [];
  let browserContext = null;

  try {
    browserContext = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });

    const page = browserContext.pages().length > 0 ? browserContext.pages()[0] : await browserContext.newPage();

    for (let idx = 0; idx < sortedCandidates.length; idx++) {
      const candidate = sortedCandidates[idx];
      const query = candidate.canonical_label;
      console.log(`\n🔍 [${idx + 1}/${sortedCandidates.length}] Screening: "${candidate.candidate_key}" (${candidate.discovery_signal_strength})`);

      const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
      let extractedItems = [];
      let pageError = null;

      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForTimeout(3500);

        // Security / Verification check
        const isRestricted = await page.evaluate(() => {
          const body = document.body ? document.body.innerText : '';
          return body.includes('Verify to continue') || body.includes('Security Check') || !!document.querySelector('div[class*="captcha"]');
        });

        if (isRestricted) {
          console.warn(`   ⚠️ TikTok security verification detected for "${query}". Stopping source gracefully.`);
          results.push({
            candidate_key: candidate.candidate_key,
            canonical_label: candidate.canonical_label,
            candidate_type_hint_before: candidate.candidate_type_hint,
            type_confidence_before: 'LOW',
            discovery_signal_strength: candidate.discovery_signal_strength,
            surface_scope: candidate.surface_scope || ['query_contextual'],
            screening_status: 'INCONCLUSIVE',
            sample_size: 0,
            unique_creators: 0,
            replication_observed: null,
            replication_pattern: null,
            screening_reason: 'Tạm dừng do TikTok yêu cầu xác minh bảo mật trên giao diện tìm kiếm.',
            early_stop: true,
            candidate_type_hint_after: candidate.candidate_type_hint,
            type_confidence_after: 'LOW',
            evidence: []
          });
          break; // Stop cleanly as instructed
        }

        extractedItems = await extractSearchCardItems(page);
        console.log(`   * Trích xuất được ${extractedItems.length} video search cards`);
      } catch (err) {
        console.warn(`   ⚠️ Navigation/extraction error for "${query}":`, err.message);
        pageError = err.message;
      }

      // Evaluate candidate using deterministic evaluator
      const evalResult = evaluateCandidateScreening(candidate, extractedItems);
      if (pageError && evalResult.evidence.length === 0) {
        evalResult.screening_status = 'INCONCLUSIVE';
        evalResult.screening_reason = `Lỗi truy cập mạng trong quá trình screening: ${pageError}`;
      }

      console.log(`   * Kết quả: ${evalResult.screening_status} (Unique Creators: ${evalResult.unique_creators}, Sample: ${evalResult.sample_size}, Early Stop: ${evalResult.early_stop || false})`);
      results.push(evalResult);

      // Polite delay between candidates
      await page.waitForTimeout(2000);
    }
  } finally {
    if (browserContext) {
      await browserContext.close().catch(() => {});
    }
  }

  const payload = {
    scan_id: `screen_${Date.now()}`,
    screened_at: new Date().toISOString(),
    source_candidate_scan_id: rawCandidates.scan_id || 'unknown',
    results
  };

  validateScreeningPayload(payload);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\n✅ [ScreeningCollector] Hoàn tất screening! Lưu tại: ${outputPath}`);

  return payload;
}

module.exports = {
  runLightScreening,
  extractSearchCardItems,
  DEFAULT_OUTPUT_PATH
};
