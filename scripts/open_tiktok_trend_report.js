/**
 * TIKTOK TREND RADAR - REPORT OPENER (PHASE 5D)
 * 
 * Verifies that the report belongs to the latest COMPLETED scan,
 * safely builds/refreshes the HTML if needed, and opens it in the default browser.
 * 
 * Rules:
 * 1. Read-only verification of latest COMPLETED scan in SQLite.
 *    Ignores FAILED, ABORTED, and IN_PROGRESS scans.
 * 2. Reuses buildTikTokTrendReport with expectedScanId = latest completed scan_id.
 * 3. Never opens a stale or mismatched report.
 * 4. Supports --check mode (verifies provenance without launching browser).
 * 5. Uses OS default handler (cmd /c start "" "<path>") without hardcoding browser.
 * 6. Non-blocking browser spawn.
 * 7. Safe fallback: if results mismatch or missing, never opens old HTML.
 * 8. Accepts existing verified last-known-good HTML matching latest COMPLETED scan
 *    without forcing rebuild if results JSON is desynchronized.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { TikTokDatabase, DEFAULT_DB_PATH } = require('../src/modules/tiktok/db/tiktokDb');
const {
  buildTikTokTrendReport,
  DEFAULT_INPUT_PATH,
  DEFAULT_OUTPUT_HTML_PATH
} = require('./build_tiktok_trend_report');

/**
 * Resolves the latest COMPLETED scan row from database (Read-only)
 * @param {string} dbPath 
 * @returns {Object|null}
 */
function resolveLatestCompletedScan(dbPath = DEFAULT_DB_PATH) {
  if (!fs.existsSync(dbPath)) return null;

  const db = new TikTokDatabase(dbPath);
  try {
    const row = db.db.prepare(`
      SELECT scan_id, scan_number, scan_kind, scan_time, status, notes
      FROM scans
      WHERE status = 'COMPLETED'
      ORDER BY scan_number DESC, scan_time DESC
      LIMIT 1
    `).get();
    return row || null;
  } finally {
    try { db.close(); } catch (_) {}
  }
}

/**
 * Verifies that an HTML report file belongs to the expected scan
 * Checks exact scan_id and exact scan number representations according to HTML contract.
 * @param {string} htmlContent
 * @param {string} expectedScanId
 * @param {number|string} expectedScanNumber
 * @returns {boolean}
 */
function verifyHtmlReportProvenance(htmlContent, expectedScanId, expectedScanNumber) {
  if (!htmlContent || typeof htmlContent !== 'string') return false;
  if (!expectedScanId || expectedScanNumber == null) return false;

  const hasScanId = htmlContent.includes(expectedScanId);
  const scanNumStr = String(expectedScanNumber);
  const hasScanNumTitle = htmlContent.includes(`Scan #${scanNumStr}`);
  const hasScanTag = htmlContent.includes(`Scan ID: ${expectedScanId}`);

  return hasScanId && hasScanNumTitle && hasScanTag;
}

/**
 * Spawns OS default browser to open file path without blocking
 * @param {string} filePath 
 */
function defaultOpenBrowser(filePath) {
  const resolved = path.resolve(filePath);
  if (process.platform === 'win32') {
    // Windows: cmd.exe /c start "" "<path>"
    const proc = spawn('cmd.exe', ['/c', 'start', '""', resolved], {
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();
  } else if (process.platform === 'darwin') {
    const proc = spawn('open', [resolved], { detached: true, stdio: 'ignore' });
    proc.unref();
  } else {
    const proc = spawn('xdg-open', [resolved], { detached: true, stdio: 'ignore' });
    proc.unref();
  }
}

/**
 * Reusable function to verify, prepare, and optionally open the trend report
 * @param {Object} options
 * @param {boolean} [options.checkOnly]
 * @param {string} [options.dbPath]
 * @param {string} [options.resultsPath]
 * @param {string} [options.reportPath]
 * @param {Function} [options.openBrowserFn]
 * @returns {Object} { success, scan_id, scan_number, report_path, opened }
 */
function openTikTokTrendReport(options = {}) {
  const checkOnly = !!options.checkOnly;
  const dbPath = options.dbPath ? path.resolve(options.dbPath) : DEFAULT_DB_PATH;
  const resultsPath = options.resultsPath ? path.resolve(options.resultsPath) : DEFAULT_INPUT_PATH;
  const reportPath = options.reportPath ? path.resolve(options.reportPath) : DEFAULT_OUTPUT_HTML_PATH;
  const openBrowserFn = typeof options.openBrowserFn === 'function' ? options.openBrowserFn : defaultOpenBrowser;

  // 1. Resolve Latest COMPLETED Scan
  const latestScan = resolveLatestCompletedScan(dbPath);
  if (!latestScan) {
    const msg = 'Chưa có TikTok scan hoàn thành. Hãy chạy TikTok Trend Radar - Scan trước.';
    const err = new Error(msg);
    err.code = 'NO_COMPLETED_SCAN';
    throw err;
  }

  // 2. Check if current HTML report is already valid for latest COMPLETED scan
  let isHtmlCurrent = false;
  if (fs.existsSync(reportPath)) {
    try {
      const existingHtml = fs.readFileSync(reportPath, 'utf8');
      if (verifyHtmlReportProvenance(existingHtml, latestScan.scan_id, latestScan.scan_number)) {
        isHtmlCurrent = true;
      }
    } catch (_) {
      isHtmlCurrent = false;
    }
  }

  // 3. If HTML is already current, accept it as verified last-known-good report
  if (isHtmlCurrent) {
    // Check if results JSON is desynchronized; if so, issue warning but do not block
    if (fs.existsSync(resultsPath)) {
      try {
        const rawJson = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        if (rawJson.scan_id !== latestScan.scan_id || rawJson.scan_number !== latestScan.scan_number) {
          console.warn('[WARN] Current HTML report is valid for latest completed scan, but results JSON is not synchronized. Opening verified last-known-good report.');
        }
      } catch (_) {}
    }
  } else {
    // 4. HTML is missing or stale -> provenance-safe rebuild from results JSON
    try {
      buildTikTokTrendReport({
        inputPath: resultsPath,
        outputPath: reportPath,
        expectedScanId: latestScan.scan_id,
        expectedScanNumber: latestScan.scan_number
      });
    } catch (err) {
      if (err.code === 'REPORT_SCAN_ID_MISMATCH' || err.code === 'REPORT_SCAN_NUMBER_MISMATCH') {
        const msg = 'Báo cáo chưa đồng bộ với scan hoàn thành mới nhất. Không mở báo cáo cũ để tránh hiển thị kết quả sai.';
        const customErr = new Error(`${msg} (Latest COMPLETED: Scan #${latestScan.scan_number} [${latestScan.scan_id}], but results have: [${err.actualScanId || 'N/A'}])`);
        customErr.code = err.code;
        customErr.latestScan = latestScan;
        throw customErr;
      }
      if (err.code === 'REPORT_INPUT_NOT_FOUND') {
        const customErr = new Error(`Không tìm thấy kết quả quét: ${resultsPath}. Báo cáo không thể hiển thị.`);
        customErr.code = 'REPORT_INPUT_NOT_FOUND';
        throw customErr;
      }
      const msg = 'Không thể tạo báo cáo cho scan mới nhất. Báo cáo cũ vẫn được bảo toàn nhưng không được mở để tránh nhầm với kết quả hiện tại.';
      const customErr = new Error(`${msg} (Chi tiết: ${err.message})`);
      customErr.code = err.code || 'REPORT_BUILD_ERROR';
      throw customErr;
    }

    // Verify HTML file actually exists on disk after rebuild
    if (!fs.existsSync(reportPath)) {
      const err = new Error(`File báo cáo không tồn tại sau khi tạo: ${reportPath}`);
      err.code = 'REPORT_FILE_MISSING';
      throw err;
    }
  }

  // 5. Execution / Check Output
  if (checkOnly) {
    return {
      success: true,
      ready: true,
      scan_id: latestScan.scan_id,
      scan_number: latestScan.scan_number,
      report_path: reportPath,
      opened: false
    };
  }

  // 6. Open in Default Browser
  openBrowserFn(reportPath);

  return {
    success: true,
    ready: true,
    scan_id: latestScan.scan_id,
    scan_number: latestScan.scan_number,
    report_path: reportPath,
    opened: true
  };
}

// Standalone CLI execution
if (require.main === module) {
  const isCheckMode = process.argv.includes('--check');

  try {
    const result = openTikTokTrendReport({ checkOnly: isCheckMode });

    if (isCheckMode) {
      console.log('REPORT_READY');
      console.log(result.scan_number);
      console.log(result.scan_id);
      console.log(result.report_path);
    } else {
      console.log('====================================================');
      console.log('🌐 TIKTOK TREND RADAR - REPORT');
      console.log('====================================================');
      console.log(`Scan #${result.scan_number}`);
      console.log(`${result.scan_id}\n`);
      console.log(`Báo cáo:`);
      console.log(`${result.report_path}\n`);
      console.log('Đang mở báo cáo mới nhất...');
    }
    process.exit(0);
  } catch (err) {
    console.error('\n❌ [LỖI MỞ BÁO CÁO]');
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = {
  openTikTokTrendReport,
  resolveLatestCompletedScan,
  verifyHtmlReportProvenance
};
