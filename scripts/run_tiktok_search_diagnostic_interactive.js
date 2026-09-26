/**
 * TIKTOK INTERACTIVE SEARCH DIAGNOSTIC RUNNER (PHASE 4.3A)
 * 
 * Purpose:
 * Diagnoses TikTok Search UI behavior on visible browser to accurately distinguish:
 * - SEARCH_RESULTS_AVAILABLE
 * - SELECTOR_MISMATCH
 * - NO_RESULTS
 * - ACCESS_RESTRICTED
 * - LOGIN_REQUIRED
 * - CAPTCHA_REQUIRED
 * - UNKNOWN_UI_STATE
 * 
 * Rules:
 * 1. Uses canonical persistent profile: data/tiktok_browser_profile/
 * 2. Runs visible browser (headless: false).
 * 3. Tests exactly ONE bounded query: "samdealruocden".
 * 4. Strictly READ-ONLY observation.
 * 5. NEVER inspects cookies, tokens, DPAPI, auth headers, or network interceptors.
 * 6. Audits production selectors against visible DOM.
 * 7. NOT executed automatically in Phase 4.3A preflight.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const {
  TIKTOK_PROFILE_DIR,
  checkPreScanProfileReadiness
} = require('../src/modules/tiktok/session/profileConfig');

const DIAGNOSTIC_QUERY = 'samdealruocden';
const TARGET_URL = `https://www.tiktok.com/search?q=${encodeURIComponent(DIAGNOSTIC_QUERY)}`;
const DIAGNOSTIC_REPORT_PATH = path.resolve(__dirname, '../data/audit/tiktok_search_diagnostic_result.json');

const DIAGNOSTIC_STATUSES = {
  SEARCH_RESULTS_AVAILABLE: 'SEARCH_RESULTS_AVAILABLE',
  SELECTOR_MISMATCH: 'SELECTOR_MISMATCH',
  NO_RESULTS: 'NO_RESULTS',
  ACCESS_RESTRICTED: 'ACCESS_RESTRICTED',
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  UNKNOWN_UI_STATE: 'UNKNOWN_UI_STATE'
};

const SELECTORS_TO_AUDIT = [
  { name: 'production_div_item_container', selector: 'div[class*="DivItemContainer"]' },
  { name: 'data_e2e_search_video_item', selector: 'div[data-e2e="search_video-item"]' },
  { name: 'data_e2e_search_item', selector: 'div[data-e2e="search-item"]' },
  { name: 'div_video_card', selector: 'div[class*="DivVideoCard"]' },
  { name: 'div_feed_item', selector: 'div[class*="DivFeedItem"]' },
  { name: 'anchor_video_link', selector: 'a[href*="/video/"]' },
  { name: 'anchor_creator_handle', selector: 'a[href*="/@"]' }
];

async function runSearchDiagnostic(options = {}) {
  const profileDir = options.profileDir || TIKTOK_PROFILE_DIR;
  console.log('====================================================');
  console.log('🔬 TIKTOK RADAR - SEARCH UI DIAGNOSTIC RUNNER');
  console.log('====================================================');
  console.log(`Target Query:   "${DIAGNOSTIC_QUERY}"`);
  console.log(`Target URL:     ${TARGET_URL}`);
  console.log(`Profile Dir:    ${profileDir}`);
  console.log(`Browser Mode:   Visible (headless: false)\n`);

  // 1. Profile readiness check
  const profileStatus = checkPreScanProfileReadiness(profileDir);
  if (!profileStatus.ready) {
    console.error(`❌ [${profileStatus.status}] ${profileStatus.reason}`);
    return {
      status: DIAGNOSTIC_STATUSES.UNKNOWN_UI_STATE,
      error: profileStatus.reason,
      profile_status: profileStatus.status
    };
  }

  let context = null;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 850 },
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    console.log(`Navigating to ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(5000);

    const pageUrl = page.url();
    const pageTitle = await page.title();

    // DOM observation without inspecting credentials
    const domEval = await page.evaluate((selectors) => {
      const bodyText = document.body ? document.body.innerText : '';
      const loginWallVisible = !!(
        document.querySelector('div[id*="login-modal"]') ||
        document.querySelector('div[class*="login-modal"]') ||
        document.querySelector('form[action*="login"]') ||
        bodyText.includes('Log in to TikTok') ||
        bodyText.includes('Đăng nhập vào TikTok')
      );

      const captchaVisible = !!(
        document.querySelector('div[class*="captcha"]') ||
        document.querySelector('div[id*="captcha"]') ||
        document.querySelector('iframe[src*="captcha"]') ||
        bodyText.includes('Verify to continue') ||
        bodyText.includes('Security Check') ||
        bodyText.includes('Xác minh để tiếp tục')
      );

      const restrictionPatterns = ['Something went wrong', 'Access Denied', 'Too many requests'];
      let accessRestrictedMatch = null;
      let accessRestrictedContext = null;

      for (const pattern of restrictionPatterns) {
        const idx = bodyText.indexOf(pattern);
        if (idx !== -1) {
          accessRestrictedMatch = pattern;
          const start = Math.max(0, idx - 60);
          const end = Math.min(bodyText.length, idx + pattern.length + 60);
          accessRestrictedContext = bodyText.substring(start, end).replace(/\s+/g, ' ').trim().slice(0, 200);
          break;
        }
      }

      const accessRestrictedText = accessRestrictedMatch !== null;

      const noResultsText = !!(
        bodyText.includes('No results found') ||
        bodyText.includes('Không tìm thấy kết quả') ||
        bodyText.includes('Try searching for something else')
      );

      // Selector match counts
      const selectorAudit = selectors.map(s => ({
        name: s.name,
        selector: s.selector,
        count: document.querySelectorAll(s.selector).length
      }));

      // Search Tabs / Categories
      const tabElements = Array.from(document.querySelectorAll('div[role="tab"], div[class*="TabItem"], a[class*="TabItem"]'));
      const availableTabs = tabElements.map(t => t.innerText ? t.innerText.trim() : '').filter(Boolean).slice(0, 10);
      const selectedTab = document.querySelector('div[role="tab"][aria-selected="true"], div[class*="TabItem"][class*="active"]')
        ? (document.querySelector('div[role="tab"][aria-selected="true"], div[class*="TabItem"][class*="active"]').innerText || '').trim()
        : null;

      // Small sample of visible non-sensitive text snippets
      const textSnippets = Array.from(document.querySelectorAll('a[href*="/video/"]'))
        .slice(0, 3)
        .map(a => (a.innerText || a.getAttribute('aria-label') || '').slice(0, 80));

      return {
        loginWallVisible,
        captchaVisible,
        accessRestrictedText,
        accessRestrictedMatch,
        accessRestrictedContext,
        noResultsText,
        selectorAudit,
        availableTabs,
        selectedTab,
        textSnippets
      };
    }, SELECTORS_TO_AUDIT);

    // Determine Diagnostic Verdict Status
    let verdict = DIAGNOSTIC_STATUSES.UNKNOWN_UI_STATE;
    const videoLinkCount = domEval.selectorAudit.find(s => s.selector === 'a[href*="/video/"]')?.count || 0;
    const prodContainerCount = domEval.selectorAudit.find(s => s.name === 'production_div_item_container')?.count || 0;

    if (domEval.captchaVisible) {
      verdict = DIAGNOSTIC_STATUSES.CAPTCHA_REQUIRED;
    } else if (domEval.loginWallVisible) {
      verdict = DIAGNOSTIC_STATUSES.LOGIN_REQUIRED;
    } else if (domEval.accessRestrictedText) {
      verdict = DIAGNOSTIC_STATUSES.ACCESS_RESTRICTED;
    } else if (videoLinkCount > 0 && prodContainerCount > 0) {
      verdict = DIAGNOSTIC_STATUSES.SEARCH_RESULTS_AVAILABLE;
    } else if (videoLinkCount > 0 && prodContainerCount === 0) {
      verdict = DIAGNOSTIC_STATUSES.SELECTOR_MISMATCH;
    } else if (domEval.noResultsText || videoLinkCount === 0) {
      verdict = DIAGNOSTIC_STATUSES.NO_RESULTS;
    }

    const report = {
      diagnostic_time: new Date().toISOString(),
      query: DIAGNOSTIC_QUERY,
      page_url: pageUrl,
      page_title: pageTitle,
      verdict,
      login_wall_visible: domEval.loginWallVisible,
      captcha_visible: domEval.captchaVisible,
      access_restricted_text: domEval.accessRestrictedText,
      access_restricted_match: domEval.accessRestrictedMatch,
      access_restricted_context: domEval.accessRestrictedContext,
      no_results_text: domEval.noResultsText,
      selector_audit: domEval.selectorAudit,
      available_tabs: domEval.availableTabs,
      selected_tab: domEval.selectedTab,
      sample_text_snippets: domEval.textSnippets
    };

    const dir = path.dirname(DIAGNOSTIC_REPORT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DIAGNOSTIC_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    console.log(`\nDiagnostic Verdict: ${verdict}`);
    console.log(`Report written to: ${DIAGNOSTIC_REPORT_PATH}`);
    return report;

  } catch (err) {
    console.error('❌ Error during Search Diagnostic:', err.message);
    return {
      status: DIAGNOSTIC_STATUSES.UNKNOWN_UI_STATE,
      error: err.message
    };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

module.exports = {
  runSearchDiagnostic,
  DIAGNOSTIC_STATUSES,
  SELECTORS_TO_AUDIT,
  DIAGNOSTIC_QUERY
};

if (require.main === module) {
  runSearchDiagnostic();
}
