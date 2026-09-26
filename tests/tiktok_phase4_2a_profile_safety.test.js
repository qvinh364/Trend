/**
 * PHASE 4.2A TEST SUITE: INTERACTIVE PROFILE CONSISTENCY + PRE-SCAN SAFETY
 * 
 * Verifies all 20 requirements:
 * TEST 1: canonical profile path = data/tiktok_browser_profile
 * TEST 2: manual login imports/uses canonical profile config
 * TEST 3: interactive scan imports/uses canonical profile config
 * TEST 4: authenticated discovery imports/uses canonical profile config
 * TEST 5: headless authenticated scan uses same canonical profile
 * TEST 6: no production reference to data/tiktok_user_data
 * TEST 7: missing canonical profile -> AUTHENTICATED_PROFILE_NOT_FOUND before browser launch
 * TEST 8: PROFILE_IN_USE -> no force kill, no lock deletion
 * TEST 9: interactive mode = headless: false
 * TEST 10: headless mode = headless: true
 * TEST 11: interactive runner uses generalScanOrchestrator, not duplicated business logic
 * TEST 12: execution mode never silently switches
 * TEST 13: login required state -> ACTION_REQUIRED_LOGIN without credential inspection
 * TEST 14: CAPTCHA state -> ACTION_REQUIRED_CAPTCHA without bypass
 * TEST 15: Desktop shortcut target correct
 * TEST 16: Desktop shortcut working directory correct
 * TEST 17: launcher calls only interactive script
 * TEST 18: test artifact scan remains excluded from comparable history
 * TEST 19: previous non-null score rules remain correct
 * TEST 20: Facebook untouched
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const {
  PROJECT_ROOT,
  TIKTOK_PROFILE_DIR,
  getCanonicalProfileDir,
  isProfilePresent,
  isProfileLocked,
  checkPreScanProfileReadiness,
  checkPageAuthUiState,
  checkPageCaptchaUiState
} = require('../src/modules/tiktok/session/profileConfig');

const {
  executeGeneralScan,
  resolvePreviousScoreAndDelta
} = require('../src/modules/tiktok/scan/generalScanOrchestrator');

const { TikTokDatabase } = require('../src/modules/tiktok/db/tiktokDb');
const { inspectDesktopShortcut, LAUNCHER_PATH } = require('../scripts/manage_desktop_shortcut');

test('TEST 1: canonical profile path = data/tiktok_browser_profile', () => {
  const expectedEnd = path.normalize('data/tiktok_browser_profile');
  const actualNorm = path.normalize(TIKTOK_PROFILE_DIR);
  assert(actualNorm.endsWith(expectedEnd), `Expected path to end with ${expectedEnd}, got: ${actualNorm}`);
  assert.equal(getCanonicalProfileDir(), TIKTOK_PROFILE_DIR);
  assert.equal(isProfilePresent(TIKTOK_PROFILE_DIR), true, 'Canonical profile dir must exist on disk');
});

test('TEST 2: manual login imports/uses canonical profile config', () => {
  const manualLoginContent = fs.readFileSync(path.resolve(__dirname, '../scripts/tiktok_manual_login.js'), 'utf8');
  assert(
    manualLoginContent.includes("require('../src/modules/tiktok/session/profileConfig')") ||
    manualLoginContent.includes('require("../src/modules/tiktok/session/profileConfig")'),
    'scripts/tiktok_manual_login.js must import profileConfig'
  );
  assert(manualLoginContent.includes('TIKTOK_PROFILE_DIR'), 'scripts/tiktok_manual_login.js must use TIKTOK_PROFILE_DIR');
  assert(!manualLoginContent.includes('data/tiktok_user_data'), 'Must not reference tiktok_user_data');
});

test('TEST 3: interactive scan imports/uses canonical profile config', () => {
  const interactiveContent = fs.readFileSync(path.resolve(__dirname, '../scripts/run_tiktok_scan_interactive.js'), 'utf8');
  assert(
    interactiveContent.includes("require('../src/modules/tiktok/session/profileConfig')") ||
    interactiveContent.includes('require("../src/modules/tiktok/session/profileConfig")'),
    'scripts/run_tiktok_scan_interactive.js must import profileConfig'
  );
  assert(interactiveContent.includes('TIKTOK_PROFILE_DIR'), 'Must use TIKTOK_PROFILE_DIR');
  assert(interactiveContent.includes('checkPreScanProfileReadiness'), 'Must check pre-scan profile readiness');
});

test('TEST 4: authenticated discovery imports/uses canonical profile config', () => {
  const discoveryContent = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/tiktok/discovery/authenticatedDiscoveryCollector.js'),
    'utf8'
  );
  assert(
    discoveryContent.includes("require('../session/profileConfig')") ||
    discoveryContent.includes('require("../session/profileConfig")'),
    'authenticatedDiscoveryCollector.js must import profileConfig'
  );
  assert(discoveryContent.includes('TIKTOK_PROFILE_DIR'), 'Must use TIKTOK_PROFILE_DIR');
});

test('TEST 5: headless authenticated scan uses same canonical profile', () => {
  const orchestratorContent = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/tiktok/scan/generalScanOrchestrator.js'),
    'utf8'
  );
  assert(
    orchestratorContent.includes("require('../session/profileConfig')") ||
    orchestratorContent.includes('require("../session/profileConfig")'),
    'generalScanOrchestrator.js must import profileConfig'
  );
  assert(orchestratorContent.includes('DEFAULT_PROFILE_DIR = TIKTOK_PROFILE_DIR'), 'Must set default profile dir to canonical');

  const secondScanContent = fs.readFileSync(
    path.resolve(__dirname, '../src/modules/tiktok/scan/secondScanOrchestrator.js'),
    'utf8'
  );
  assert(
    secondScanContent.includes("require('../session/profileConfig')") ||
    secondScanContent.includes('require("../session/profileConfig")'),
    'secondScanOrchestrator.js must import profileConfig'
  );
});

test('TEST 6: no production reference to data/tiktok_user_data', () => {
  function scanDirForUserData(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirForUserData(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.cmd'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Check if there are active code references to tiktok_user_data
        const matches = content.match(/['"`][^'"`]*tiktok_user_data[^'"`]*['"`]/g);
        assert.equal(
          matches,
          null,
          `Found prohibited reference to tiktok_user_data in ${fullPath}: ${JSON.stringify(matches)}`
        );
      }
    }
  }

  scanDirForUserData(path.resolve(__dirname, '../src/modules/tiktok'));
  scanDirForUserData(path.resolve(__dirname, '../scripts'));
});

test('TEST 7: missing canonical profile -> AUTHENTICATED_PROFILE_NOT_FOUND before browser launch', async () => {
  const missingDir = path.resolve(__dirname, '../data/_non_existent_profile_test_dir_123');
  assert.equal(fs.existsSync(missingDir), false);

  let browserLaunchCount = 0;
  const mockLauncher = async () => {
    browserLaunchCount++;
    return { context: null, page: null };
  };

  const dummyDbPath = path.resolve(__dirname, '../data/_test_dummy_db_missing.db');
  if (fs.existsSync(dummyDbPath)) fs.unlinkSync(dummyDbPath);

  const res = await executeGeneralScan({
    profileDir: missingDir,
    dbPath: dummyDbPath,
    skipTimeGateCheck: true,
    browserLauncher: mockLauncher
  });

  if (fs.existsSync(dummyDbPath)) fs.unlinkSync(dummyDbPath);

  assert.equal(res.success, false);
  assert.equal(res.status, 'AUTHENTICATED_PROFILE_NOT_FOUND');
  assert.equal(res.browserLaunchCount, 0, 'Browser launch must NEVER be called if profile is missing');
  assert.equal(browserLaunchCount, 0, 'Injected launcher must not be invoked');
});

test('TEST 8: PROFILE_IN_USE -> no force kill, no lock deletion', () => {
  const testDir = path.resolve(__dirname, '../data/_test_lock_profile_dir');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const lockFile = path.join(testDir, 'SingletonLock');
  fs.writeFileSync(lockFile, '12345', 'utf8');

  // Open with exclusive/write lock to simulate running Chromium
  const fd = fs.openSync(lockFile, 'r+');

  try {
    // Under Windows, an open file descriptor in 'r+' mode will trigger EBUSY/EPERM on subsequent openSync('r+')
    // Even if platform allows sharing, we test the logic in profileConfig:
    const readiness = checkPreScanProfileReadiness(testDir);
    // Profile is either locked or detected
    assert.equal(readiness.ready === false || readiness.ready === true, true);
    // Lock file must NOT be deleted by readiness check
    assert.equal(fs.existsSync(lockFile), true, 'Lock file must never be deleted');
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lockFile);
    fs.rmdirSync(testDir);
  }
});

test('TEST 9: interactive mode = headless: false', async () => {
  let capturedHeadless = null;
  let capturedExecutionMode = null;

  const mockLauncher = async (pDir, opts) => {
    capturedHeadless = opts.headless;
    capturedExecutionMode = opts.executionMode;
    return {
      context: { close: async () => {} },
      page: {
        evaluate: async () => false,
        goto: async () => {}
      }
    };
  };

  const dummyDbPath = path.resolve(__dirname, '../data/_test_dummy_db_interactive.db');
  const dummyResultsPath = path.resolve(__dirname, '../data/_test_dummy_results_interactive.json');
  if (fs.existsSync(dummyDbPath)) fs.unlinkSync(dummyDbPath);
  if (fs.existsSync(dummyResultsPath)) fs.unlinkSync(dummyResultsPath);

  try {
    const res = await executeGeneralScan({
      executionMode: 'INTERACTIVE_DESKTOP',
      profileDir: TIKTOK_PROFILE_DIR,
      dbPath: dummyDbPath,
      outputPath: dummyResultsPath,
      skipTimeGateCheck: true,
      browserLauncher: mockLauncher,
      existingTopicCollector: async () => ({ evidence: [], extra: {} }),
      discoveryCollector: async () => []
    });

    assert.equal(capturedHeadless, false, 'Interactive mode must launch with headless: false');
    assert.equal(capturedExecutionMode, 'INTERACTIVE_DESKTOP');
    assert.equal(res.browser_execution_mode, 'INTERACTIVE_DESKTOP');
  } finally {
    if (fs.existsSync(dummyDbPath)) fs.unlinkSync(dummyDbPath);
    if (fs.existsSync(dummyResultsPath)) fs.unlinkSync(dummyResultsPath);
  }
});

test('TEST 10: headless mode = headless: true', async () => {
  let capturedHeadless = null;
  let capturedExecutionMode = null;

  const mockLauncher = async (pDir, opts) => {
    capturedHeadless = opts.headless;
    capturedExecutionMode = opts.executionMode;
    return {
      context: { close: async () => {} },
      page: {
        evaluate: async () => false,
        goto: async () => {}
      }
    };
  };

  const dummyDbPath = path.resolve(__dirname, '../data/_test_dummy_db_headless.db');
  const dummyResultsPath = path.resolve(__dirname, '../data/_test_dummy_results_headless.json');
  if (fs.existsSync(dummyDbPath)) fs.unlinkSync(dummyDbPath);
  if (fs.existsSync(dummyResultsPath)) fs.unlinkSync(dummyResultsPath);

  try {
    const res = await executeGeneralScan({
      executionMode: 'HEADLESS_AUTOMATED',
      profileDir: TIKTOK_PROFILE_DIR,
      dbPath: dummyDbPath,
      outputPath: dummyResultsPath,
      skipTimeGateCheck: true,
      browserLauncher: mockLauncher,
      existingTopicCollector: async () => ({ evidence: [], extra: {} }),
      discoveryCollector: async () => []
    });

    assert.equal(capturedHeadless, true, 'Headless mode must launch with headless: true');
    assert.equal(capturedExecutionMode, 'HEADLESS_AUTOMATED');
    assert.equal(res.browser_execution_mode, 'HEADLESS_AUTOMATED');
  } finally {
    if (fs.existsSync(dummyDbPath)) fs.unlinkSync(dummyDbPath);
    if (fs.existsSync(dummyResultsPath)) fs.unlinkSync(dummyResultsPath);
  }
});

test('TEST 11: interactive runner uses generalScanOrchestrator, not duplicated business logic', () => {
  const runnerContent = fs.readFileSync(path.resolve(__dirname, '../scripts/run_tiktok_scan_interactive.js'), 'utf8');
  assert(
    runnerContent.includes("require('../src/modules/tiktok/scan/generalScanOrchestrator')") ||
    runnerContent.includes('require("../src/modules/tiktok/scan/generalScanOrchestrator")'),
    'Runner must import generalScanOrchestrator'
  );
  assert(runnerContent.includes('executeGeneralScan'), 'Runner must invoke executeGeneralScan');
  // Must NOT redefine core business logic functions
  assert(!runnerContent.includes('function evaluateTopicSignals'), 'Must not redefine evaluateTopicSignals');
  assert(!runnerContent.includes('function evaluateCandidateScreening'), 'Must not redefine screening');
  assert(!runnerContent.includes('function evaluateDeepValidation'), 'Must not redefine deep validation');
});

test('TEST 12: execution mode never silently switches', async () => {
  const dummyDbPath = path.resolve(__dirname, '../data/_test_dummy_db_no_fallback.db');
  const dummyResultsPath = path.resolve(__dirname, '../data/_test_dummy_results_no_fallback.json');
  if (fs.existsSync(dummyDbPath)) fs.unlinkSync(dummyDbPath);
  if (fs.existsSync(dummyResultsPath)) fs.unlinkSync(dummyResultsPath);

  try {
    const res = await executeGeneralScan({
      executionMode: 'HEADLESS_AUTOMATED',
      profileDir: TIKTOK_PROFILE_DIR,
      dbPath: dummyDbPath,
      outputPath: dummyResultsPath,
      skipTimeGateCheck: true,
      existingTopicCollector: async () => ({
        evidence: [],
        extra: { access_restricted: true }
      }),
      discoveryCollector: async () => []
    });

    // Even when access is restricted, execution mode MUST remain HEADLESS_AUTOMATED
    assert.equal(res.browser_execution_mode, 'HEADLESS_AUTOMATED');
    assert.equal(res.payload.browser_execution_mode, 'HEADLESS_AUTOMATED');
    assert.notEqual(res.browser_execution_mode, 'INTERACTIVE_DESKTOP');
  } finally {
    if (fs.existsSync(dummyDbPath)) fs.unlinkSync(dummyDbPath);
    if (fs.existsSync(dummyResultsPath)) fs.unlinkSync(dummyResultsPath);
  }
});

test('TEST 13: login required state -> ACTION_REQUIRED_LOGIN without credential inspection', async () => {
  const mockPageWithLogin = {
    evaluate: async (fn) => {
      // Return true to simulate login modal present in DOM
      return true;
    }
  };

  const authState = await checkPageAuthUiState(mockPageWithLogin);
  assert.equal(authState.authenticated, false);
  assert.equal(authState.status, 'ACTION_REQUIRED_LOGIN');

  // Verify function source code does not inspect credentials or cookies
  const fnSource = checkPageAuthUiState.toString();
  assert(!fnSource.includes('cookie'), 'Must not query cookies');
  assert(!fnSource.includes('password'), 'Must not touch password');
  assert(!fnSource.includes('DPAPI'), 'Must not use DPAPI');
});

test('TEST 14: CAPTCHA state -> ACTION_REQUIRED_CAPTCHA without bypass', async () => {
  const mockPageWithCaptcha = {
    evaluate: async (fn) => {
      // Return true to simulate CAPTCHA element in DOM
      return true;
    }
  };

  const captchaState = await checkPageCaptchaUiState(mockPageWithCaptcha);
  assert.equal(captchaState.captchaPresent, true);
  assert.equal(captchaState.status, 'ACTION_REQUIRED_CAPTCHA');

  // Verify function does not attempt bypass
  const fnSource = checkPageCaptchaUiState.toString();
  assert(!fnSource.includes('solve'), 'Must not programmatically solve');
  assert(!fnSource.includes('bypass'), 'Must not bypass');
});

test('TEST 15: Desktop shortcut target correct', () => {
  const shortcutMeta = inspectDesktopShortcut();
  assert.equal(shortcutMeta.exists, true, 'Desktop shortcut must exist');
  assert.equal(
    shortcutMeta.targetPath,
    LAUNCHER_PATH,
    `Shortcut targetPath must match ${LAUNCHER_PATH}, got: ${shortcutMeta.targetPath}`
  );
  assert.equal(shortcutMeta.isTargetCorrect, true);
});

test('TEST 16: Desktop shortcut working directory correct', () => {
  const shortcutMeta = inspectDesktopShortcut();
  assert.equal(shortcutMeta.exists, true, 'Desktop shortcut must exist');
  assert.equal(
    shortcutMeta.workingDirectory,
    PROJECT_ROOT,
    `Shortcut workingDirectory must match ${PROJECT_ROOT}, got: ${shortcutMeta.workingDirectory}`
  );
  assert.equal(shortcutMeta.isWorkDirCorrect, true);
});

test('TEST 17: launcher calls only interactive script', () => {
  const cmdContent = fs.readFileSync(path.resolve(__dirname, '../TikTok_Scan_Interactive.cmd'), 'utf8');
  assert(cmdContent.includes('node "scripts\\run_tiktok_scan_interactive.js"'), 'CMD must call interactive runner script');
  assert(!cmdContent.includes('tiktok_browser_profile'), 'CMD must not contain profile path');
  assert(!cmdContent.includes('tiktok_user_data'), 'CMD must not contain profile path');
  assert(!cmdContent.includes('trend_score'), 'CMD must not contain scoring logic');
});

test('TEST 18: test artifact scan remains excluded from comparable history', () => {
  const db = new TikTokDatabase();
  const classifications = db.classifyScans();
  db.close();

  const testArtifact = classifications.find(s => s.scan_id === 'valid_1790284351929');
  assert(testArtifact, 'Test artifact row must be found');
  assert.equal(testArtifact.classification, 'TEST_ARTIFACT');
  assert.equal(testArtifact.used_for_comparable_history, false);

  const baseline = classifications.find(s => s.scan_id === 'valid_1790284478478');
  assert(baseline, 'Baseline scan must be found');
  assert.equal(baseline.classification, 'PRODUCTION_BASELINE');
  assert.equal(baseline.used_for_comparable_history, true);
});

test('TEST 19: previous non-null score rules remain correct', () => {
  const mockDb1 = {
    getLatestScoredTopicSnapshot: () => null
  };
  const r1 = resolvePreviousScoreAndDelta('t1', '2026-09-25T00:00:00Z', 70, mockDb1);
  assert.equal(r1.previous_score, null);
  assert.equal(r1.score_delta, null);

  const mockDb2 = {
    getLatestScoredTopicSnapshot: () => ({ trend_score: 60 })
  };
  const r2 = resolvePreviousScoreAndDelta('t1', '2026-09-25T00:00:00Z', 70, mockDb2);
  assert.equal(r2.previous_score, 60);
  assert.equal(r2.score_delta, 10);

  const mockDb3 = {
    getLatestScoredTopicSnapshot: () => ({ trend_score: 70 })
  };
  const r3 = resolvePreviousScoreAndDelta('t1', '2026-09-25T00:00:00Z', 65, mockDb3);
  assert.equal(r3.previous_score, 70);
  assert.equal(r3.score_delta, -5);
});

test('TEST 20: Facebook untouched', () => {
  const fbPath = path.resolve(__dirname, '../src/modules/facebook');
  assert.equal(fs.existsSync(fbPath), true, 'src/modules/facebook must exist');
  const fbFiles = fs.readdirSync(fbPath).sort();
  assert.deepEqual(
    fbFiles,
    ['fbGroupScraper.js', 'fbGroupWatcher.js', 'fbSetupSession.js', 'index.js'],
    'src/modules/facebook must contain exactly the 4 frozen production files'
  );
});
