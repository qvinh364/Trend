/**
 * TIKTOK BROWSER PROFILE CONFIGURATION & SAFETY (SINGLE SOURCE OF TRUTH)
 * 
 * Rules:
 * 1. Canonical persistent authenticated profile directory: data/tiktok_browser_profile/
 * 2. Absolutely NO hardcoding of alternative profile directories (e.g. tiktok_user_data).
 * 3. Pre-scan checks: profile existence & profile lock safety.
 * 4. UI-only authentication and CAPTCHA checks (no cookie DB, no credential interception).
 * 5. Dual execution modes: HEADLESS_AUTOMATED (headless: true) vs INTERACTIVE_DESKTOP (headless: false).
 */

const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const TIKTOK_PROFILE_DIR = path.resolve(PROJECT_ROOT, 'data/tiktok_browser_profile');

/**
 * Returns canonical profile directory path
 */
function getCanonicalProfileDir() {
  return TIKTOK_PROFILE_DIR;
}

/**
 * Checks if the persistent profile directory exists on filesystem
 */
function isProfilePresent(profileDir = TIKTOK_PROFILE_DIR) {
  return fs.existsSync(profileDir);
}

/**
 * Checks if the profile directory is currently locked / in use by another Chromium process.
 * Does NOT force kill or delete lock files.
 */
function isProfileLocked(profileDir = TIKTOK_PROFILE_DIR) {
  if (!fs.existsSync(profileDir)) {
    return false;
  }

  // 1. Check SingletonLock (Chromium lock mechanism on Unix/Windows)
  const singletonLock = path.join(profileDir, 'SingletonLock');
  if (fs.existsSync(singletonLock)) {
    try {
      const fd = fs.openSync(singletonLock, 'r+');
      fs.closeSync(fd);
    } catch (e) {
      if (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES') {
        return true;
      }
    }
  }

  // 2. Check lockfile if present
  const lockfile = path.join(profileDir, 'lockfile');
  if (fs.existsSync(lockfile)) {
    try {
      const fd = fs.openSync(lockfile, 'r+');
      fs.closeSync(fd);
    } catch (e) {
      if (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Pre-scan readiness check before attempting any browser launch.
 * Returns { ready: boolean, status: string, reason: string }
 */
function checkPreScanProfileReadiness(profileDir = TIKTOK_PROFILE_DIR) {
  if (!isProfilePresent(profileDir)) {
    return {
      ready: false,
      status: 'AUTHENTICATED_PROFILE_NOT_FOUND',
      profileDir,
      reason: 'Authenticated TikTok profile directory not found at: ' + profileDir +
        '. Please run the manual desktop login launcher first (scripts/tiktok_manual_login.js).'
    };
  }

  if (isProfileLocked(profileDir)) {
    return {
      ready: false,
      status: 'PROFILE_IN_USE',
      profileDir,
      reason: 'TikTok browser profile is currently locked by another active browser process. ' +
        'Please close all open TikTok/Chromium windows and retry.'
    };
  }

  return {
    ready: true,
    status: 'READY',
    profileDir,
    reason: 'Profile exists and is ready for browser launch.'
  };
}

/**
 * UI-only authentication check on an active page.
 * Uses strictly page behavior / DOM indicators.
 * NEVER inspects cookies, Local State, tokens, or DPAPI.
 */
async function checkPageAuthUiState(page) {
  if (!page) {
    return { authenticated: false, status: 'NO_PAGE', reason: 'Page instance not available' };
  }

  try {
    const isLoginWallPresent = await page.evaluate(() => {
      // Check for prominent login modals or login-required banners
      const loginModal = document.querySelector('[data-e2e="login-modal"]') ||
                         document.querySelector('#login-modal') ||
                         document.querySelector('.login-modal-container') ||
                         document.querySelector('div[id*="login-container"]');
      if (loginModal && loginModal.offsetParent !== null) return true;

      // Check for full-page login wall redirect
      if (window.location.pathname.startsWith('/login')) return true;

      return false;
    });

    if (isLoginWallPresent) {
      return {
        authenticated: false,
        status: 'ACTION_REQUIRED_LOGIN',
        reason: 'TikTok displayed a login wall or modal. Manual user login required.'
      };
    }

    return {
      authenticated: true,
      status: 'AUTHENTICATED',
      reason: 'No login wall detected; page accessible.'
    };
  } catch (err) {
    return {
      authenticated: false,
      status: 'AUTH_CHECK_ERROR',
      reason: err.message
    };
  }
}

/**
 * UI-only CAPTCHA / verification check on an active page.
 * Does NOT attempt programmatic solving or stealth bypass.
 */
async function checkPageCaptchaUiState(page) {
  if (!page) {
    return { captchaPresent: false, status: 'NO_PAGE' };
  }

  try {
    const isCaptchaPresent = await page.evaluate(() => {
      const captchaSelectors = [
        '#sec-sdk-captcha-drag-wrapper',
        '.captcha_verify_container',
        '#tiktok-verify-ele',
        'div[class*="captcha"]',
        'div[id*="captcha"]',
        '.verify-wrap'
      ];
      for (const sel of captchaSelectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          return true;
        }
      }
      return false;
    });

    if (isCaptchaPresent) {
      return {
        captchaPresent: true,
        status: 'ACTION_REQUIRED_CAPTCHA',
        reason: 'TikTok verification challenge detected on page. Manual user intervention required.'
      };
    }

    return {
      captchaPresent: false,
      status: 'CLEAR',
      reason: 'No CAPTCHA verification detected.'
    };
  } catch (err) {
    return {
      captchaPresent: false,
      status: 'CAPTCHA_CHECK_ERROR',
      reason: err.message
    };
  }
}

module.exports = {
  PROJECT_ROOT,
  TIKTOK_PROFILE_DIR,
  getCanonicalProfileDir,
  isProfilePresent,
  isProfileLocked,
  checkPreScanProfileReadiness,
  checkPageAuthUiState,
  checkPageCaptchaUiState
};
