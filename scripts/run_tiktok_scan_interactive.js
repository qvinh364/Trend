/**
 * TIKTOK INTERACTIVE DESKTOP SCAN RUNNER (PHASE 4.2A)
 * 
 * Interactive runner to be launched by USER from Windows Desktop.
 * 
 * Rules:
 * 1. Uses canonical persistent profile: data/tiktok_browser_profile/ via profileConfig.js
 * 2. Checks profile existence & lock state BEFORE launching browser.
 * 3. Uses the SINGLE production orchestrator: generalScanOrchestrator.js
 * 4. browser_execution_mode = "INTERACTIVE_DESKTOP" (headless: false)
 * 5. Never auto-fills credentials, never inspects internal cookies/tokens.
 * 6. If login expired, prompts ACTION_REQUIRED_LOGIN for user manual login in visible browser.
 * 7. If CAPTCHA occurs, allows user to solve it in visible browser.
 * 8. Strictly obeys time gate, scan numbering, and duplicate guards.
 */

const { executeGeneralScan, checkGenericTimeGate } = require('../src/modules/tiktok/scan/generalScanOrchestrator');
const { DEFAULT_DB_PATH } = require('../src/modules/tiktok/db/tiktokDb');
const {
  TIKTOK_PROFILE_DIR,
  checkPreScanProfileReadiness
} = require('../src/modules/tiktok/session/profileConfig');

const PROFILE_DIR = TIKTOK_PROFILE_DIR;

async function runInteractiveScan(options = {}) {
  console.log('====================================================');
  console.log('🌐 TIKTOK RADAR - INTERACTIVE DESKTOP SCAN RUNNER');
  console.log('====================================================');
  console.log(`Execution Mode: INTERACTIVE_DESKTOP (Visible Browser)`);
  console.log(`Profile Dir:    ${PROFILE_DIR}`);
  console.log(`Database:       ${DEFAULT_DB_PATH}\n`);

  // 1. Check Profile Readiness BEFORE any browser launch
  console.log('🔍 Checking Authenticated Profile Readiness...');
  const profileStatus = checkPreScanProfileReadiness(PROFILE_DIR);
  if (!profileStatus.ready) {
    console.error(`\n❌ [${profileStatus.status}] ${profileStatus.reason}`);
    if (profileStatus.status === 'AUTHENTICATED_PROFILE_NOT_FOUND') {
      console.error('👉 Vui lòng chạy lệnh đăng nhập thủ công trước: node scripts/tiktok_manual_login.js');
    } else if (profileStatus.status === 'PROFILE_IN_USE') {
      console.error('👉 Vui lòng đóng tất cả cửa sổ TikTok/Chromium đang mở rồi thử lại.');
    }
    if (options.throwOnError) {
      const err = new Error(profileStatus.reason);
      err.code = profileStatus.status;
      throw err;
    }
    process.exit(1);
  }
  console.log('✅ Authenticated profile verified and ready.');

  // 2. Check Time Gate before launching browser
  console.log('\n⏳ Checking Scan Time Gate...');
  const timeGate = checkGenericTimeGate(DEFAULT_DB_PATH);
  if (!timeGate.eligible && !options.skipTimeGateCheck) {
    console.error('\n❌ SCAN NOT YET ELIGIBLE');
    console.error(`- Latest Scan ID:      ${timeGate.latest_scan_id} (Scan #${timeGate.latest_scan_number})`);
    console.error(`- Latest Scan Time:    ${timeGate.latest_scan_time_gmt7}`);
    console.error(`- Next Eligible At:    ${timeGate.next_eligible_scan_at_gmt7}`);
    console.error(`- Remaining Wait Time: ${timeGate.remaining_time}`);
    if (options.throwOnError) {
      const err = new Error('SCAN_NOT_YET_ELIGIBLE');
      err.code = 'SCAN_NOT_YET_ELIGIBLE';
      err.timeGate = timeGate;
      throw err;
    }
    process.exit(1);
  }

  if (timeGate.latest_scan_time_gmt7) {
    console.log(`✅ Time Gate passed. Latest scan was at: ${timeGate.latest_scan_time_gmt7}`);
  } else {
    console.log(`✅ Time Gate passed. Ready for initial scan.`);
  }

  console.log('\n🚀 Starting Interactive Scan Orchestration...');
  console.log('ℹ️  Note: If TikTok requires login or verification, please complete it in the open browser.');

  try {
    const result = await executeGeneralScan({
      executionMode: 'INTERACTIVE_DESKTOP',
      profileDir: PROFILE_DIR,
      dbPath: DEFAULT_DB_PATH,
      skipTimeGateCheck: !!options.skipTimeGateCheck,
      ...options
    });

    if (result.success) {
      console.log('\n====================================================');
      console.log(`🎉 SCAN #${result.scan_number} COMPLETED SUCCESSFULLY!`);
      console.log(`Scan ID:             ${result.scan_id}`);
      console.log(`Execution Status:    ${result.execution_status}`);
      console.log(`Data Quality Status: ${result.data_quality_status}`);
      console.log(`Track A Evaluated:   ${result.trackA_count} topics`);
      console.log(`Newly Validated:     ${result.newly_validated_count} topics`);
      console.log('====================================================\n');

      // Auto-generate TikTok Trend HTML Report (Phase 5C)
      try {
        const { buildTikTokTrendReport } = require('./build_tiktok_trend_report');
        const reportResult = buildTikTokTrendReport({
          expectedScanId: result.scan_id,
          expectedScanNumber: result.scan_number
        });
        console.log(`[REPORT] TikTok Trend Radar updated: data/tiktok_trend_report.html (Scan #${reportResult.scan_number}, ${reportResult.scan_id})`);
      } catch (reportErr) {
        console.warn(`\n[WARN] TikTok scan completed successfully, but HTML report generation failed.`);
        console.warn(`Previous report was preserved. Reason: ${reportErr.message}`);
      }
    } else {
      console.error(`\n❌ Scan halted with status: ${result.status}`);
      if (options.throwOnError) {
        const err = new Error(result.reason || result.status);
        err.code = result.status;
        throw err;
      }
      process.exit(1);
    }
    return result;
  } catch (err) {
    console.error('\n❌ Unexpected error during interactive scan execution:', err.message);
    // Persist error for audit (no cookies/tokens/auth)
    try {
      const fs = require('fs');
      const path = require('path');
      const errLog = {
        timestamp: new Date().toISOString(),
        error_name: err.name || 'UnknownError',
        error_message: err.message || String(err),
        stack_short: err.stack ? err.stack.split('\n').slice(0, 5).join('\n') : null
      };
      fs.writeFileSync(
        path.resolve(__dirname, '../data/audit/tiktok_scan_last_error.json'),
        JSON.stringify(errLog, null, 2), 'utf8'
      );
    } catch (_) {}
    if (options.throwOnError) throw err;
    process.exit(1);
  }
}

if (require.main === module) {
  runInteractiveScan();
}

module.exports = { runInteractiveScan };
