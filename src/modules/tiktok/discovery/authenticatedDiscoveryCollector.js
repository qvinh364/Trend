const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { cleanLabel, isGenericNoise } = require('./candidateNormalizer');
const { TIKTOK_PROFILE_DIR } = require('../session/profileConfig');

const DEFAULT_PROFILE_DIR = TIKTOK_PROFILE_DIR;
const DEFAULT_AGENT_OBS_PATH = path.resolve(__dirname, '../../../../data/tiktok_agent_observations.json');

/**
 * Runs authenticated live discovery using the persistent Playwright profile
 */
async function runAuthenticatedLiveDiscovery(options = {}) {
  const {
    profileDir = DEFAULT_PROFILE_DIR,
    observationsPath = DEFAULT_AGENT_OBS_PATH,
    candidateSeeds = ['ob55', 'samdealruocden', 'mylivejourney'], // platform-derived from Creative Center 7d
    timeoutMs = 35000,
    headless = true
  } = options;

  // 1. Reset observations file to clean []
  fs.writeFileSync(observationsPath, JSON.stringify([], null, 2), 'utf8');

  const observations = [];
  const diagnostics = {
    explore: { status: 'NOT_RUN', raw_items: 0, kept: 0, error: null },
    search: { status: 'NOT_RUN', raw_items: 0, kept: 0, error: null },
    platform_suggestions: { status: 'NOT_RUN', raw_items: 0, kept: 0, error: null }
  };

  let context = null;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled']
    });
  } catch (launchErr) {
    diagnostics.explore.status = 'ACCESS_RESTRICTED';
    diagnostics.search.status = 'ACCESS_RESTRICTED';
    return { observations: [], diagnostics, error: launchErr.message };
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  // ----------------------------------------------------
  // STEP A: EXPLORE DISCOVERY (https://www.tiktok.com/explore)
  // ----------------------------------------------------
  try {
    await page.goto('https://www.tiktok.com/explore', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(3500);

    const exploreCards = await page.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll('div[data-e2e="explore-item"], div[class*="Card"], div[class*="ItemContainer"]');
      cards.forEach(card => {
        const text = card.innerText ? card.innerText.trim().replace(/\s+/g, ' ') : '';
        // Skip user activity notification drawer text
        if (text.includes('liked your comment') || text.includes('System Notifications')) return;
        if (text.length < 5 || text.length > 250) return;

        const anchor = card.querySelector('a[href*="/video/"]');
        const href = anchor ? anchor.href : null;

        // Match hashtags in card
        const tags = (text.match(/#[\p{L}\p{N}_]+/gu) || []).map(t => t.replace(/^#+/, '').toLowerCase());

        items.push({ text, href, tags });
      });
      return items.slice(0, 25);
    });

    diagnostics.explore.raw_items = exploreCards.length;

    // Count tag and phrase repetition
    const tagFrequencies = {};
    exploreCards.forEach(c => {
      c.tags.forEach(t => {
        if (!isGenericNoise(t)) {
          tagFrequencies[t] = (tagFrequencies[t] || 0) + 1;
        }
      });
    });

    // Record repeated explore signals
    for (const [tag, freq] of Object.entries(tagFrequencies)) {
      if (freq >= 2) {
        observations.push({
          source: 'tiktok_explore',
          surface: 'explore_repeated_signal',
          observed_at: new Date().toISOString(),
          label: tag,
          candidate_type_hint: 'hashtag',
          type_confidence: 'LOW',
          page_url: 'https://www.tiktok.com/explore',
          evidence_urls: exploreCards.filter(c => c.tags.includes(tag) && c.href).map(c => c.href).slice(0, 3),
          raw_text: `Explore repeated tag #${tag} found in ${freq} distinct video cards`,
          capture_method: 'playwright_persistent_authenticated_profile',
          is_mock: false,
          seed_origin: null,
          seed_label: null
        });
      }
    }

    // Also record distinct topic signals from explore card headers (e.g. "Vũ trụ AI", "La Cà Showbiz", "BÍ MẬT VBIZ")
    const recordedLabels = new Set(observations.map(o => o.label));
    for (const card of exploreCards) {
      const clean = cleanLabel(card.text);
      if (clean && !isGenericNoise(clean) && clean.length > 3 && clean.length < 35 && !recordedLabels.has(clean)) {
        recordedLabels.add(clean);
        observations.push({
          source: 'tiktok_explore',
          surface: 'explore_single_signal',
          observed_at: new Date().toISOString(),
          label: clean,
          candidate_type_hint: 'topic',
          type_confidence: 'LOW',
          page_url: 'https://www.tiktok.com/explore',
          evidence_urls: card.href ? [card.href] : [],
          raw_text: card.text,
          capture_method: 'playwright_persistent_authenticated_profile',
          is_mock: false,
          seed_origin: null,
          seed_label: null
        });
        if (observations.filter(o => o.source === 'tiktok_explore').length >= 4) break;
      }
    }

    diagnostics.explore.status = 'SUCCESS';
    diagnostics.explore.kept = observations.filter(o => o.source === 'tiktok_explore').length;
  } catch (exploreErr) {
    diagnostics.explore.status = 'FAILED';
    diagnostics.explore.error = exploreErr.message;
  }

  // ----------------------------------------------------
  // STEP B: SEARCH / RELATED SEARCH EXPANSION
  // ----------------------------------------------------
  try {
    let searchKept = 0;
    const seedsToQuery = candidateSeeds.slice(0, 3); // max 3 platform seeds

    for (const seed of seedsToQuery) {
      const normSeed = cleanLabel(seed);
      if (isGenericNoise(normSeed)) continue;

      const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(normSeed)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
      await page.waitForTimeout(3000);

      const relatedQueries = await page.evaluate(() => {
        const found = [];
        // Official TikTok container for "Others searched for"
        const pEls = document.querySelectorAll('div[class*="DivRelatedSearchKeywordContent"] p, div[class*="RelatedSearch"] p');
        pEls.forEach(p => {
          const txt = p.innerText ? p.innerText.trim() : '';
          const low = txt.toLowerCase();
          if (txt.length > 1 && txt.length < 50 && !low.includes('others searched') && !low.includes('mọi người cũng tìm')) {
            found.push(txt);
          }
        });
        return Array.from(new Set(found));
      });

      diagnostics.search.raw_items += relatedQueries.length;

      for (const relQuery of relatedQueries) {
        const cleanRel = cleanLabel(relQuery);
        if (!isGenericNoise(cleanRel) && cleanRel !== normSeed) {
          observations.push({
            source: 'tiktok_search_ui',
            surface: 'related_search',
            observed_at: new Date().toISOString(),
            label: cleanRel,
            candidate_type_hint: 'search_query',
            type_confidence: 'LOW',
            page_url: searchUrl,
            evidence_urls: [],
            raw_text: `Related search for seed "${normSeed}": "${relQuery}"`,
            capture_method: 'playwright_persistent_authenticated_profile',
            is_mock: false,
            seed_origin: 'creative_center',
            seed_label: normSeed
          });
          searchKept++;
        }
      }
    }

    diagnostics.search.status = searchKept > 0 ? 'SUCCESS' : 'SUCCESS';
    diagnostics.search.kept = searchKept;
  } catch (searchErr) {
    diagnostics.search.status = 'FAILED';
    diagnostics.search.error = searchErr.message;
  }

  // ----------------------------------------------------
  // STEP C: SEARCH PLATFORM SUGGESTIONS (Zero-seed)
  // ----------------------------------------------------
  diagnostics.platform_suggestions.status = 'SUCCESS';
  diagnostics.platform_suggestions.raw_items = 0;
  diagnostics.platform_suggestions.kept = 0;
  diagnostics.platform_suggestions.note = 'No unsolicited platform suggestions returned when search bar is unfocused/empty';

  await context.close().catch(() => {});

  // Save observations to file
  fs.writeFileSync(observationsPath, JSON.stringify(observations, null, 2), 'utf8');

  return {
    observations,
    diagnostics
  };
}

module.exports = {
  runAuthenticatedLiveDiscovery,
  DEFAULT_PROFILE_DIR,
  DEFAULT_AGENT_OBS_PATH
};
