/**
 * TIKTOK TREND REPORT AUTO-GENERATION TEST SUITE (PHASE 5C)
 * 
 * Verifies:
 * 1. Valid results + matching expectedScanId => HTML generated successfully
 * 2. expectedScanId mismatch => throws REPORT_SCAN_ID_MISMATCH => previous HTML unchanged
 * 3. Invalid/malformed input => build fails => previous HTML unchanged
 * 4. Successful rebuild => final HTML belongs to expected scan_id
 * 5. Importing build_tiktok_trend_report.js does NOT auto-run CLI side effects
 * 6. Standalone CLI entrypoint remains valid
 * 7. Runner integration invariant: report generator is inside successful scan path, not failed/finally
 * 8. Runner passes actual completed scan_id as expectedScanId
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  buildTikTokTrendReport,
  DEFAULT_INPUT_PATH
} = require('../scripts/build_tiktok_trend_report');

test('TEST 1: Valid results + matching expectedScanId builds HTML report successfully', () => {
  const tmpOutputDir = path.resolve(__dirname, '../data/_test_autogeneration_1');
  if (!fs.existsSync(tmpOutputDir)) fs.mkdirSync(tmpOutputDir, { recursive: true });
  const tmpHtmlPath = path.resolve(tmpOutputDir, 'test_report.html');

  try {
    const meta = buildTikTokTrendReport({
      inputPath: DEFAULT_INPUT_PATH,
      outputPath: tmpHtmlPath,
      expectedScanId: 'scan_7_1790357191593',
      expectedScanNumber: 7
    });

    assert.equal(meta.success, true);
    assert.equal(meta.scan_id, 'scan_7_1790357191593');
    assert.equal(meta.scan_number, 7);
    assert.ok(fs.existsSync(tmpHtmlPath));

    const htmlContent = fs.readFileSync(tmpHtmlPath, 'utf8');
    assert.ok(htmlContent.startsWith('<!DOCTYPE html>'));
    assert.ok(htmlContent.includes('scan_7_1790357191593'));
  } finally {
    if (fs.existsSync(tmpHtmlPath)) fs.unlinkSync(tmpHtmlPath);
    if (fs.existsSync(tmpOutputDir)) fs.rmdirSync(tmpOutputDir);
  }
});

test('TEST 2: expectedScanId mismatch throws REPORT_SCAN_ID_MISMATCH and preserves previous HTML', () => {
  const tmpOutputDir = path.resolve(__dirname, '../data/_test_autogeneration_2');
  if (!fs.existsSync(tmpOutputDir)) fs.mkdirSync(tmpOutputDir, { recursive: true });
  const tmpHtmlPath = path.resolve(tmpOutputDir, 'test_report.html');

  const baselineContent = '<html><body>PREVIOUS_CANONICAL_REPORT_CONTENT</body></html>';
  fs.writeFileSync(tmpHtmlPath, baselineContent, 'utf8');

  try {
    assert.throws(() => {
      buildTikTokTrendReport({
        inputPath: DEFAULT_INPUT_PATH,
        outputPath: tmpHtmlPath,
        expectedScanId: 'scan_999_wrong_id'
      });
    }, (err) => {
      assert.equal(err.code, 'REPORT_SCAN_ID_MISMATCH');
      return true;
    });

    // Verify previous HTML remains byte-for-byte unchanged
    const afterContent = fs.readFileSync(tmpHtmlPath, 'utf8');
    assert.equal(afterContent, baselineContent, 'Previous HTML must be preserved on scan_id mismatch');
  } finally {
    if (fs.existsSync(tmpHtmlPath)) fs.unlinkSync(tmpHtmlPath);
    if (fs.existsSync(tmpOutputDir)) fs.rmdirSync(tmpOutputDir);
  }
});

test('TEST 3: Invalid input fails and preserves existing HTML', () => {
  const tmpOutputDir = path.resolve(__dirname, '../data/_test_autogeneration_3');
  if (!fs.existsSync(tmpOutputDir)) fs.mkdirSync(tmpOutputDir, { recursive: true });
  const tmpHtmlPath = path.resolve(tmpOutputDir, 'test_report.html');

  const baselineContent = '<html><body>PREVIOUS_GOOD_HTML</body></html>';
  fs.writeFileSync(tmpHtmlPath, baselineContent, 'utf8');

  try {
    assert.throws(() => {
      buildTikTokTrendReport({
        inputPath: path.resolve(__dirname, '../data/non_existent_file.json'),
        outputPath: tmpHtmlPath
      });
    }, (err) => {
      assert.equal(err.code, 'REPORT_INPUT_NOT_FOUND');
      return true;
    });

    const afterContent = fs.readFileSync(tmpHtmlPath, 'utf8');
    assert.equal(afterContent, baselineContent, 'Previous HTML must be preserved on input error');
  } finally {
    if (fs.existsSync(tmpHtmlPath)) fs.unlinkSync(tmpHtmlPath);
    if (fs.existsSync(tmpOutputDir)) fs.rmdirSync(tmpOutputDir);
  }
});

test('TEST 4: Successful build writes final HTML belonging to expected scan', () => {
  const tmpOutputDir = path.resolve(__dirname, '../data/_test_autogeneration_4');
  if (!fs.existsSync(tmpOutputDir)) fs.mkdirSync(tmpOutputDir, { recursive: true });
  const tmpHtmlPath = path.resolve(tmpOutputDir, 'test_report.html');

  try {
    const meta = buildTikTokTrendReport({
      inputPath: DEFAULT_INPUT_PATH,
      outputPath: tmpHtmlPath,
      expectedScanId: 'scan_7_1790357191593'
    });

    assert.equal(meta.success, true);
    const html = fs.readFileSync(tmpHtmlPath, 'utf8');
    assert.ok(html.includes('Scan #7'));
    assert.ok(html.includes('scan_7_1790357191593'));
  } finally {
    if (fs.existsSync(tmpHtmlPath)) fs.unlinkSync(tmpHtmlPath);
    if (fs.existsSync(tmpOutputDir)) fs.rmdirSync(tmpOutputDir);
  }
});

test('TEST 5 & 6: Importing module does not run side effects; CLI guard exists', () => {
  const scriptContent = fs.readFileSync(path.resolve(__dirname, '../scripts/build_tiktok_trend_report.js'), 'utf8');
  assert.ok(scriptContent.includes('if (require.main === module)'), 'Must have require.main === module guard');
  assert.ok(typeof buildTikTokTrendReport === 'function', 'Must export reusable buildTikTokTrendReport function');
});

test('TEST 7 & 8: Runner integration invariants (safe call order, passes completed scan_id)', () => {
  const runnerContent = fs.readFileSync(path.resolve(__dirname, '../scripts/run_tiktok_scan_interactive.js'), 'utf8');

  // Must call buildTikTokTrendReport
  assert.ok(runnerContent.includes('buildTikTokTrendReport('), 'Runner must call buildTikTokTrendReport');

  // Must be inside if (result.success) block
  const successBlockIdx = runnerContent.indexOf('if (result.success) {');
  const reportCallIdx = runnerContent.indexOf('buildTikTokTrendReport(');
  const elseBlockIdx = runnerContent.indexOf('} else {', successBlockIdx);

  assert.ok(successBlockIdx !== -1, 'Must have if (result.success)');
  assert.ok(reportCallIdx > successBlockIdx, 'Report call must be after if (result.success)');
  assert.ok(reportCallIdx < elseBlockIdx, 'Report call must be INSIDE if (result.success), before else');

  // Must pass expectedScanId: result.scan_id
  assert.ok(runnerContent.includes('expectedScanId: result.scan_id'), 'Runner must pass result.scan_id as expectedScanId');

  // Must NOT be in finally block
  assert.equal(runnerContent.includes('finally {') && runnerContent.includes('buildTikTokTrendReport'), false, 'Must not be in finally block');

  // Must have warning catch block
  assert.ok(runnerContent.includes('[WARN] TikTok scan completed successfully, but HTML report generation failed'), 'Must have non-fatal warning handler');
});
