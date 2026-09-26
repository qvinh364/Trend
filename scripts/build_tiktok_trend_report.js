/**
 * TIKTOK TREND RADAR - HTML REPORT BUILD SCRIPT (PHASE 5C)
 * 
 * Compiles data/tiktok_results.json into the self-contained HTML report
 * at data/tiktok_trend_report.html using trendReportBuilder and trendHtmlRenderer.
 * 
 * Rules:
 * 1. Exports reusable production function: buildTikTokTrendReport(options)
 * 2. Provenance guard: verifies expectedScanId matches results.scan_id (throws REPORT_SCAN_ID_MISMATCH on mismatch).
 * 3. Safe atomic write: writes to temporary file first, replaces output only upon success.
 * 4. Preserves last-known-good HTML byte-for-byte on failure.
 * 5. Standalone CLI support: node scripts/build_tiktok_trend_report.js [input] [output]
 */

const fs = require('fs');
const path = require('path');
const { buildTrendReport } = require('../src/modules/tiktok/reporting/trendReportBuilder');
const { renderTrendReportHtml } = require('../src/modules/tiktok/reporting/trendHtmlRenderer');

const DEFAULT_INPUT_PATH = path.resolve(__dirname, '../data/tiktok_results.json');
const DEFAULT_OUTPUT_HTML_PATH = path.resolve(__dirname, '../data/tiktok_trend_report.html');

/**
 * Builds and renders the Trend Report HTML document with provenance verification and atomic file write.
 * @param {Object} options
 * @param {string} [options.inputPath]
 * @param {string} [options.outputPath]
 * @param {string} [options.expectedScanId]
 * @param {number} [options.expectedScanNumber]
 * @returns {Object} Report build metadata
 */
function buildTikTokTrendReport(options = {}) {
  const inputPath = options.inputPath ? path.resolve(options.inputPath) : DEFAULT_INPUT_PATH;
  const outputPath = options.outputPath ? path.resolve(options.outputPath) : DEFAULT_OUTPUT_HTML_PATH;
  const expectedScanId = options.expectedScanId || null;
  const expectedScanNumber = options.expectedScanNumber !== undefined ? options.expectedScanNumber : null;

  if (!fs.existsSync(inputPath)) {
    const err = new Error(`Input JSON not found: ${inputPath}`);
    err.code = 'REPORT_INPUT_NOT_FOUND';
    throw err;
  }

  // 1. Build Trend Report Model (pure transformation)
  const reportModel = buildTrendReport(inputPath);
  const actualScanId = reportModel.scan && reportModel.scan.scan_id;
  const actualScanNumber = reportModel.scan && reportModel.scan.scan_number;

  // 2. Provenance Guards
  if (expectedScanId && actualScanId !== expectedScanId) {
    const err = new Error(
      `REPORT_SCAN_ID_MISMATCH: Expected scan_id "${expectedScanId}", but results contain "${actualScanId}".`
    );
    err.code = 'REPORT_SCAN_ID_MISMATCH';
    err.expectedScanId = expectedScanId;
    err.actualScanId = actualScanId;
    throw err;
  }

  if (expectedScanNumber !== null && actualScanNumber !== null && actualScanNumber !== expectedScanNumber) {
    const err = new Error(
      `REPORT_SCAN_NUMBER_MISMATCH: Expected scan_number ${expectedScanNumber}, but results contain ${actualScanNumber}.`
    );
    err.code = 'REPORT_SCAN_NUMBER_MISMATCH';
    err.expectedScanNumber = expectedScanNumber;
    err.actualScanNumber = actualScanNumber;
    throw err;
  }

  // 3. Render complete HTML in-memory
  const htmlContent = renderTrendReportHtml(reportModel);

  // 4. Safe Atomic Write: write to temporary file first, replace only when complete
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const tempPath = path.resolve(outputDir, `.${path.basename(outputPath)}.tmp_${Date.now()}_${process.pid}`);

  try {
    fs.writeFileSync(tempPath, htmlContent, 'utf8');

    // Replace final destination
    try {
      fs.renameSync(tempPath, outputPath);
    } catch (_) {
      // Fallback copy + unlink for Windows cross-partition or file lock resilience
      fs.copyFileSync(tempPath, outputPath);
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  } catch (writeErr) {
    // Clean up temporary file
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
    throw writeErr;
  } finally {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
    }
  }

  const stats = fs.statSync(outputPath);
  return {
    success: true,
    outputPath,
    scan_id: actualScanId,
    scan_number: actualScanNumber,
    ranked_trend_count: reportModel.summary.ranked_trend_count,
    needs_more_data_count: reportModel.summary.needs_more_data_count,
    file_size: stats.size
  };
}

/**
 * Standalone / CLI wrapper
 */
function buildReport(inputPath = DEFAULT_INPUT_PATH, outputPath = DEFAULT_OUTPUT_HTML_PATH, options = {}) {
  console.log('====================================================');
  console.log('📊 TIKTOK TREND RADAR - HTML REPORT BUILDER');
  console.log('====================================================');
  console.log(`Input JSON:   ${inputPath}`);
  console.log(`Output HTML:  ${outputPath}\n`);

  try {
    const meta = buildTikTokTrendReport({ inputPath, outputPath, ...options });
    console.log(`✅ Report generated successfully: ${meta.outputPath} (${(meta.file_size / 1024).toFixed(1)} KB)`);
    console.log(`   - Scan #${meta.scan_number} (${meta.scan_id})`);
    console.log(`   - Ranked Trends:   ${meta.ranked_trend_count}`);
    console.log(`   - Needs More Data: ${meta.needs_more_data_count}`);
    return meta.outputPath;
  } catch (err) {
    console.error(`\n❌ Failed to build HTML report: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  const customInput = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT_PATH;
  const customOutput = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUTPUT_HTML_PATH;
  buildReport(customInput, customOutput);
}

module.exports = {
  buildTikTokTrendReport,
  buildReport,
  DEFAULT_INPUT_PATH,
  DEFAULT_OUTPUT_HTML_PATH
};
