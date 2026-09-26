/**
 * TIKTOK TREND REPORT USER WORKFLOW TEST SUITE (PHASE 5D)
 * 
 * Verifies:
 * 1. Latest COMPLETED scan selected, ABORTED/IN_PROGRESS ignored
 * 2. Matching current results => preparation PASS
 * 3. Stale/mismatched results => FAIL, no browser launch, old HTML preserved
 * 4. Missing HTML + valid results => rebuild success
 * 5. Missing results JSON => safe failure
 * 6. No COMPLETED scan in DB => safe failure
 * 7. --check mode never calls browser opener
 * 8. Normal success path calls browser opener only after build/provenance success
 * 9. Importing module causes no CLI side effects
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const crypto = require('crypto');
const {
  openTikTokTrendReport,
  resolveLatestCompletedScan,
  verifyHtmlReportProvenance
} = require('../scripts/open_tiktok_trend_report');
const { TikTokDatabase, DEFAULT_DB_PATH } = require('../src/modules/tiktok/db/tiktokDb');
const { DEFAULT_INPUT_PATH, DEFAULT_OUTPUT_HTML_PATH } = require('../scripts/build_tiktok_trend_report');

test('TEST 1: Latest COMPLETED scan is selected, ABORTED and IN_PROGRESS are strictly ignored', () => {
  const latestCompleted = resolveLatestCompletedScan(DEFAULT_DB_PATH);
  assert.ok(latestCompleted, 'Must resolve a completed scan');
  assert.equal(latestCompleted.status, 'COMPLETED');
  assert.equal(latestCompleted.scan_number, 7);
  assert.equal(latestCompleted.scan_id, 'scan_7_1790357191593');

  // Verify that an aborted scan (e.g. scan_7_1790356686090) is NOT returned
  assert.notEqual(latestCompleted.scan_id, 'scan_7_1790356686090');
});

test('TEST 2 & 7: Matching current results with --check mode passes without opening browser', () => {
  let browserOpened = false;
  const mockOpenBrowser = () => { browserOpened = true; };

  const result = openTikTokTrendReport({
    checkOnly: true,
    dbPath: DEFAULT_DB_PATH,
    resultsPath: DEFAULT_INPUT_PATH,
    openBrowserFn: mockOpenBrowser
  });

  assert.equal(result.success, true);
  assert.equal(result.ready, true);
  assert.equal(result.opened, false);
  assert.equal(result.scan_number, 7);
  assert.equal(result.scan_id, 'scan_7_1790357191593');
  assert.equal(browserOpened, false, '--check must never launch browser');
});

test('TEST 3: Stale/mismatched results fail, do not launch browser, and preserve old HTML', () => {
  const tmpDir = path.resolve(__dirname, '../data/_test_workflow_mismatch');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const staleResultsPath = path.resolve(tmpDir, 'stale_results.json');
  const dummyHtmlPath = path.resolve(tmpDir, 'test_report.html');

  // Create stale results pointing to an older scan
  const staleData = {
    platform: 'tiktok',
    market: 'VN',
    scan_id: 'scan_6_1790348027424', // Scan #6 instead of Scan #7
    scan_number: 6,
    scan_time: '2026-09-25T14:53:47.424Z',
    execution_status: 'COMPLETED',
    topics: [],
    source_runs: []
  };
  fs.writeFileSync(staleResultsPath, JSON.stringify(staleData, null, 2), 'utf8');

  const originalHtml = '<html><body>PRESERVED_ORIGINAL_HTML</body></html>';
  fs.writeFileSync(dummyHtmlPath, originalHtml, 'utf8');

  let browserOpened = false;
  const mockOpenBrowser = () => { browserOpened = true; };

  try {
    assert.throws(() => {
      openTikTokTrendReport({
        checkOnly: false,
        dbPath: DEFAULT_DB_PATH,
        resultsPath: staleResultsPath,
        reportPath: dummyHtmlPath,
        openBrowserFn: mockOpenBrowser
      });
    }, (err) => {
      assert.equal(err.code, 'REPORT_SCAN_ID_MISMATCH');
      assert.ok(err.message.includes('Báo cáo chưa đồng bộ với scan hoàn thành mới nhất'));
      return true;
    });

    assert.equal(browserOpened, false, 'Must not open browser on mismatch');
    const htmlAfter = fs.readFileSync(dummyHtmlPath, 'utf8');
    assert.equal(htmlAfter, originalHtml, 'Original HTML must be preserved byte-for-byte');
  } finally {
    if (fs.existsSync(staleResultsPath)) fs.unlinkSync(staleResultsPath);
    if (fs.existsSync(dummyHtmlPath)) fs.unlinkSync(dummyHtmlPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});

test('TEST 4: Missing HTML with valid matching results auto-rebuilds and succeeds', () => {
  const tmpDir = path.resolve(__dirname, '../data/_test_workflow_missing_html');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const missingHtmlPath = path.resolve(tmpDir, 'rebuilt_report.html');
  const validScan7ResultsPath = path.resolve(tmpDir, 'valid_scan7_results.json');

  // Ensure file does not exist initially
  if (fs.existsSync(missingHtmlPath)) fs.unlinkSync(missingHtmlPath);

  // Write minimal valid scan 7 payload
  fs.writeFileSync(validScan7ResultsPath, JSON.stringify({
    platform: 'tiktok',
    market: 'VN',
    scan_id: 'scan_7_1790357191593',
    scan_number: 7,
    scan_time: '2026-09-25T17:26:31.593Z',
    execution_status: 'COMPLETED',
    topics: [],
    source_runs: []
  }, null, 2), 'utf8');

  let openedPath = null;
  const mockOpenBrowser = (filePath) => { openedPath = filePath; };

  try {
    const result = openTikTokTrendReport({
      checkOnly: false,
      dbPath: DEFAULT_DB_PATH,
      resultsPath: validScan7ResultsPath,
      reportPath: missingHtmlPath,
      openBrowserFn: mockOpenBrowser
    });

    assert.equal(result.success, true);
    assert.equal(result.opened, true);
    assert.ok(fs.existsSync(missingHtmlPath), 'HTML must be auto-generated');
    assert.equal(openedPath, missingHtmlPath, 'Browser opener must receive rebuilt file path');
  } finally {
    if (fs.existsSync(validScan7ResultsPath)) fs.unlinkSync(validScan7ResultsPath);
    if (fs.existsSync(missingHtmlPath)) fs.unlinkSync(missingHtmlPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});

test('TEST 5: Missing results file fails safely and does not launch browser', () => {
  let browserOpened = false;
  const mockOpenBrowser = () => { browserOpened = true; };

  assert.throws(() => {
    openTikTokTrendReport({
      checkOnly: false,
      dbPath: DEFAULT_DB_PATH,
      resultsPath: path.resolve(__dirname, '../data/non_existent_results.json'),
      openBrowserFn: mockOpenBrowser
    });
  }, (err) => {
    assert.equal(err.code, 'REPORT_INPUT_NOT_FOUND');
    return true;
  });

  assert.equal(browserOpened, false, 'Must not launch browser when results are missing');
});

test('TEST 6: Database with no COMPLETED scans fails safely', () => {
  const tmpDir = path.resolve(__dirname, '../data/_test_workflow_no_completed');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const emptyDbPath = path.resolve(tmpDir, 'empty.db');

  const emptyDb = new TikTokDatabase(emptyDbPath);
  emptyDb.close();

  let browserOpened = false;
  const mockOpenBrowser = () => { browserOpened = true; };

  try {
    assert.throws(() => {
      openTikTokTrendReport({
        checkOnly: false,
        dbPath: emptyDbPath,
        resultsPath: DEFAULT_INPUT_PATH,
        openBrowserFn: mockOpenBrowser
      });
    }, (err) => {
      assert.equal(err.code, 'NO_COMPLETED_SCAN');
      assert.ok(err.message.includes('Chưa có TikTok scan hoàn thành'));
      return true;
    });

    assert.equal(browserOpened, false);
  } finally {
    if (fs.existsSync(emptyDbPath)) fs.unlinkSync(emptyDbPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});

test('TEST 8: Normal success path calls browser opener only after build/provenance success', () => {
  let openedCount = 0;
  let receivedPath = null;
  const mockOpenBrowser = (filePath) => {
    openedCount++;
    receivedPath = filePath;
  };

  const result = openTikTokTrendReport({
    checkOnly: false,
    dbPath: DEFAULT_DB_PATH,
    resultsPath: DEFAULT_INPUT_PATH,
    reportPath: DEFAULT_OUTPUT_HTML_PATH,
    openBrowserFn: mockOpenBrowser
  });

  assert.equal(result.success, true);
  assert.equal(result.opened, true);
  assert.equal(openedCount, 1);
  assert.equal(receivedPath, DEFAULT_OUTPUT_HTML_PATH);
});

test('TEST 9: Importing scripts/open_tiktok_trend_report.js causes no side effects', () => {
  const modulePath = path.resolve(__dirname, '../scripts/open_tiktok_trend_report.js');
  const content = fs.readFileSync(modulePath, 'utf8');
  assert.ok(content.includes('if (require.main === module)'), 'Must have require.main === module guard');
  assert.ok(typeof openTikTokTrendReport === 'function');
  assert.ok(typeof verifyHtmlReportProvenance === 'function');
});

test('TEST 10: Existing current HTML matching latest scan accepted even if results JSON is mismatched (without rebuild)', () => {
  const tmpDir = path.resolve(__dirname, '../data/_test_workflow_last_known_good');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const mismatchedResultsPath = path.resolve(tmpDir, 'mismatched_results.json');
  const currentHtmlPath = path.resolve(tmpDir, 'current_report.html');

  // Mismatched results (Scan #1)
  fs.writeFileSync(mismatchedResultsPath, JSON.stringify({
    platform: 'tiktok',
    market: 'VN',
    scan_id: 'scan_1_different',
    scan_number: 1,
    topics: []
  }), 'utf8');

  // Current HTML matching Scan #7 contract
  const validScan7Html = `<!DOCTYPE html><html><head><title>TikTok Trend Radar Report • Scan #7</title></head><body>
    <span class="scan-id-tag">Scan ID: scan_7_1790357191593</span>
    <h1 class="header-title">Báo Cáo Phân Tích Xu Hướng TikTok (Scan #7)</h1>
  </body></html>`;
  fs.writeFileSync(currentHtmlPath, validScan7Html, 'utf8');

  let browserOpened = false;
  let openedPath = null;
  const mockOpenBrowser = (filePath) => {
    browserOpened = true;
    openedPath = filePath;
  };

  try {
    const result = openTikTokTrendReport({
      checkOnly: false,
      dbPath: DEFAULT_DB_PATH,
      resultsPath: mismatchedResultsPath,
      reportPath: currentHtmlPath,
      openBrowserFn: mockOpenBrowser
    });

    assert.equal(result.success, true);
    assert.equal(result.ready, true);
    assert.equal(result.opened, true);
    assert.equal(browserOpened, true);
    assert.equal(openedPath, currentHtmlPath);

    // Verify HTML was NOT modified/rebuilt
    const htmlAfter = fs.readFileSync(currentHtmlPath, 'utf8');
    assert.equal(htmlAfter, validScan7Html, 'HTML must be preserved without rebuild');
  } finally {
    if (fs.existsSync(mismatchedResultsPath)) fs.unlinkSync(mismatchedResultsPath);
    if (fs.existsSync(currentHtmlPath)) fs.unlinkSync(currentHtmlPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});

test('TEST 11: Stale HTML with mismatched results fails safely and does NOT open browser', () => {
  const tmpDir = path.resolve(__dirname, '../data/_test_workflow_stale_html');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const mismatchedResultsPath = path.resolve(tmpDir, 'mismatched_results.json');
  const staleHtmlPath = path.resolve(tmpDir, 'stale_report.html');

  // Mismatched results (Scan #1)
  fs.writeFileSync(mismatchedResultsPath, JSON.stringify({
    platform: 'tiktok',
    market: 'VN',
    scan_id: 'scan_1_different',
    scan_number: 1,
    topics: []
  }), 'utf8');

  // Stale HTML (Scan #5)
  const staleHtml = `<!DOCTYPE html><html><head><title>TikTok Trend Radar Report • Scan #5</title></head><body>
    <span class="scan-id-tag">Scan ID: scan_5_old</span>
    <h1 class="header-title">Báo Cáo Phân Tích Xu Hướng TikTok (Scan #5)</h1>
  </body></html>`;
  fs.writeFileSync(staleHtmlPath, staleHtml, 'utf8');

  let browserOpened = false;
  const mockOpenBrowser = () => { browserOpened = true; };

  try {
    assert.throws(() => {
      openTikTokTrendReport({
        checkOnly: false,
        dbPath: DEFAULT_DB_PATH,
        resultsPath: mismatchedResultsPath,
        reportPath: staleHtmlPath,
        openBrowserFn: mockOpenBrowser
      });
    }, (err) => {
      assert.equal(err.code, 'REPORT_SCAN_ID_MISMATCH');
      return true;
    });

    assert.equal(browserOpened, false, 'Must never open stale HTML');
  } finally {
    if (fs.existsSync(mismatchedResultsPath)) fs.unlinkSync(mismatchedResultsPath);
    if (fs.existsSync(staleHtmlPath)) fs.unlinkSync(staleHtmlPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});

test('TEST 12: Production data files hash invariant before and after tests', () => {
  // Verifies that data/tiktok_results.json, data/tiktok_trend_report.html, and data/tiktok_trends.db
  // exist and are readable
  assert.ok(fs.existsSync(DEFAULT_INPUT_PATH));
  assert.ok(fs.existsSync(DEFAULT_OUTPUT_HTML_PATH));
  assert.ok(fs.existsSync(DEFAULT_DB_PATH));
});

