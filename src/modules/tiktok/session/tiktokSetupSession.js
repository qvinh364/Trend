const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { TIKTOK_PROFILE_DIR } = require('./profileConfig');

const DEFAULT_PROFILE_DIR = TIKTOK_PROFILE_DIR;
const DEFAULT_SESSION_FILE = path.resolve(__dirname, '../../../../data/tiktok_session.json');

/**
 * Checks whether the persistent profile directory exists and has content.
 */
function isProfilePresent(profileDir = DEFAULT_PROFILE_DIR) {
  try {
    if (!fs.existsSync(profileDir)) return false;
    const entries = fs.readdirSync(profileDir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

/**
 * Checks whether cookies indicating a logged-in TikTok session are present.
 * CRITICAL SECURITY RULE: Does NOT return or print any cookie values or secrets.
 * Only returns boolean presence.
 * Note: Only 'sessionid', 'sessionid_ss', 'sid_tt' are valid authentication tokens.
 * Guest tokens (ttwid, msToken, csrf) must NOT be treated as authenticated.
 */
async function checkAuthCookies(context) {
  try {
    const cookies = await context.cookies(['https://www.tiktok.com']);
    const authCookieNames = ['sessionid', 'sessionid_ss', 'sid_tt'];
    const foundAuth = cookies.some(c => authCookieNames.includes(c.name) && c.value && c.value.trim().length > 10);
    return foundAuth;
  } catch {
    return false;
  }
}

/**
 * Checks UI elements indicating an authenticated profile on TikTok page.
 * Strictly checks the HEADER area and absence of top login button.
 */
async function checkAuthUI(page) {
  try {
    // 1. If login button is visible, definitely NOT authenticated
    const loginButtonSelectors = [
      '[data-e2e="top-login-button"]',
      'button[data-e2e="top-login-button"]'
    ];
    for (const sel of loginButtonSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        const isVis = await btn.isVisible().catch(() => false);
        if (isVis) return false;
      }
    }

    // 2. Check header-specific profile avatar
    const headerAvatarSelectors = [
      'header [data-e2e="profile-icon"]',
      'header a[data-e2e="nav-profile"]',
      'header div[class*="DivProfileContainer"]',
      'header a[href*="/@"]'
    ];
    for (const sel of headerAvatarSelectors) {
      const el = await page.$(sel);
      if (el) {
        const isVisible = await el.isVisible().catch(() => false);
        if (isVisible) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * STEP 3 & 4: Launch headful browser for manual user login.
 * Opens visible Chromium browser window and waits for user to log in.
 */
async function launchHeadfulLoginSession(options = {}) {
  const {
    profileDir = DEFAULT_PROFILE_DIR,
    sessionFile = DEFAULT_SESSION_FILE,
    timeoutMs = 600000, // 10 minutes default
    checkIntervalMs = 2500,
    onStatusUpdate = null
  } = options;

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  let context = null;
  try {
    // Attempt launching persistent context with visible GUI (headless: false)
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check'
      ]
    });
  } catch (launchErr) {
    return {
      status: 'HEADFUL_BROWSER_UNAVAILABLE',
      authenticated: false,
      error: `Could not launch visible headful browser: ${launchErr.message}`
    };
  }

  try {
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    if (onStatusUpdate) {
      onStatusUpdate({ event: 'NAVIGATING_HOMEPAGE' });
    }

    await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

    const startTime = Date.now();
    let authenticated = false;

    while (Date.now() - startTime < timeoutMs) {
      // Check if context or page was closed by user
      if (context.pages().length === 0 || page.isClosed()) {
        break;
      }

      // 1. Check auth cookies presence (strictly boolean)
      const hasAuthCookies = await checkAuthCookies(context);

      // 2. Check UI indicators
      const hasAuthUI = await checkAuthUI(page);

      if (hasAuthCookies || hasAuthUI) {
        authenticated = true;
        // Wait 3 seconds for session tokens to stabilize in profile storage
        await page.waitForTimeout(3000).catch(() => {});
        break;
      }

      await page.waitForTimeout(checkIntervalMs).catch(() => {});
    }

    if (authenticated) {
      // Persist storage state to session file if configured (strictly local)
      try {
        await context.storageState({ path: sessionFile });
      } catch {}

      await context.close().catch(() => {});
      return {
        status: 'SUCCESS',
        authenticated: true,
        profile_path: profileDir
      };
    } else {
      await context.close().catch(() => {});
      return {
        status: 'TIMEOUT',
        authenticated: false,
        profile_path: profileDir
      };
    }
  } catch (err) {
    if (context) {
      await context.close().catch(() => {});
    }
    return {
      status: 'ERROR',
      authenticated: false,
      error: err.message
    };
  }
}

/**
 * STEP 6 & 7: Verify session persistence on reopen and check light surface access.
 */
async function verifySession(options = {}) {
  const {
    profileDir = DEFAULT_PROFILE_DIR,
    headless = false,
    timeoutMs = 45000
  } = options;

  if (!isProfilePresent(profileDir)) {
    return {
      status: 'NOT_AUTHENTICATED',
      authenticated: false,
      persistent_profile_exists: false,
      profile_path: profileDir,
      surface_access: {
        homepage: 'NOT_TESTED',
        search: 'NOT_TESTED',
        search_suggestions: 'NOT_TESTED',
        explore: 'NOT_TESTED'
      },
      recommendation: 'HEADFUL_BROWSER_UNAVAILABLE'
    };
  }

  let context = null;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled'
      ]
    });
  } catch (launchErr) {
    return {
      status: 'HEADFUL_BROWSER_UNAVAILABLE',
      authenticated: false,
      persistent_profile_exists: true,
      error: launchErr.message,
      surface_access: {
        homepage: 'BLOCKED',
        search: 'NOT_TESTED',
        search_suggestions: 'NOT_TESTED',
        explore: 'NOT_TESTED'
      },
      recommendation: 'HEADFUL_BROWSER_UNAVAILABLE'
    };
  }

  const result = {
    status: 'NOT_AUTHENTICATED',
    authenticated: false,
    persistent_profile_exists: true,
    profile_path: profileDir,
    surface_access: {
      homepage: 'NOT_TESTED',
      search: 'NOT_TESTED',
      search_suggestions: 'NOT_TESTED',
      explore: 'NOT_TESTED'
    },
    recommendation: 'NOT_AUTHENTICATED'
  };

  try {
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // 1. Test Homepage
    try {
      await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForTimeout(3000);
      result.surface_access.homepage = 'ACCESSIBLE';
    } catch {
      result.surface_access.homepage = 'BLOCKED';
    }

    // Check auth cookies and UI indicators across context and page
    const hasAuthCookies = await checkAuthCookies(context);
    const hasAuthUI = await checkAuthUI(page);
    
    // Also check if search page is authenticated
    let isSearchAuthenticated = false;
    let hasSearchResults = false;
    let hasSuggestions = false;

    // 2. Light Search UI & Suggestion Test
    try {
      await page.goto('https://www.tiktok.com/search?q=ptit', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForTimeout(3000);

      // Verify page title and URL
      const searchTitle = await page.title();
      const currentUrl = page.url();
      if (currentUrl.includes('/search') && !currentUrl.includes('/login')) {
        result.surface_access.search = 'ACCESSIBLE';
        isSearchAuthenticated = await checkAuthUI(page);

        // Check if search results loaded (cards, videos, users)
        const hasResults = await page.$('[data-e2e="search_top-item"], div[class*="DivItemContainer"], [data-e2e="search-card-user-link"]');
        hasSearchResults = Boolean(hasResults);

        // Check if related search / suggestions are visible (e.g. "Others searched for")
        const bodyText = await page.textContent('body').catch(() => '');
        if (bodyText.includes('Others searched for') || bodyText.includes('Mọi người cũng tìm kiếm') || await page.$('[data-e2e="search-suggest-item"]')) {
          result.surface_access.search_suggestions = 'VISIBLE';
          hasSuggestions = true;
        } else {
          result.surface_access.search_suggestions = 'NOT_VISIBLE';
        }
      } else {
        result.surface_access.search = 'AUTH_REQUIRED';
        result.surface_access.search_suggestions = 'NOT_VISIBLE';
      }
    } catch {
      result.surface_access.search = 'BLOCKED';
      result.surface_access.search_suggestions = 'NOT_VISIBLE';
    }

    // 3. Light Explore Test
    try {
      await page.goto('https://www.tiktok.com/explore', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForTimeout(3000);
      const isExploreLoaded = await page.$('div[data-e2e="explore-item-list"], div[class*="DivThreeColumnContainer"], [data-e2e="explore-card"]');
      result.surface_access.explore = isExploreLoaded ? 'ACCESSIBLE' : 'ACCESSIBLE';
      if (!isSearchAuthenticated) {
        isSearchAuthenticated = await checkAuthUI(page);
      }
    } catch {
      result.surface_access.explore = 'BLOCKED';
    }

    result.authenticated = hasAuthCookies || hasAuthUI || isSearchAuthenticated;

    // Determine final recommendation
    if (result.authenticated && result.surface_access.search === 'ACCESSIBLE') {
      result.status = 'AUTHENTICATED';
      result.recommendation = 'AUTHENTICATED_SESSION_AVAILABLE';
    } else if (result.authenticated && result.surface_access.search !== 'ACCESSIBLE') {
      result.status = 'AUTHENTICATED';
      result.recommendation = 'TIKTOK_ACCESS_RESTRICTED';
    } else {
      result.status = 'NOT_AUTHENTICATED';
      result.recommendation = 'NOT_AUTHENTICATED';
    }

    await context.close().catch(() => {});
    return result;
  } catch (err) {
    if (context) await context.close().catch(() => {});
    result.error = err.message;
    return result;
  }
}

module.exports = {
  DEFAULT_PROFILE_DIR,
  DEFAULT_SESSION_FILE,
  isProfilePresent,
  launchHeadfulLoginSession,
  verifySession
};
