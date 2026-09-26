/**
 * TIKTOK SCAN #2 SAFE ONE-SHOT RUNNER (PHASE 4.0A)
 * 
 * Rules:
 * 1. TIME GATE runs BEFORE ANY Playwright/browser/collector invocation or side-effect import.
 * 2. Idempotency Guard prevents duplicate execution if Scan #2 already completed.
 * 3. Never sleep, never schedule, never retry the entire scan.
 * 4. Exits cleanly with code 0.
 */

const path = require('path');
const { checkTimeGate } = require('../src/modules/tiktok/scan/secondScanOrchestrator');
const { TikTokDatabase, DEFAULT_DB_PATH } = require('../src/modules/tiktok/db/tiktokDb');

async function main() {
  console.log('==================================================');
  console.log('🚀 TIKTOK SCAN #2 ONE-SHOT RUNNER');
  console.log('==================================================');

  // STEP 1: TIME GATE CHECK (Zero browser, zero network)
  console.log('\n⏳ [1/3] Kiểm tra Time Gate (quy định tối thiểu 2 giờ)...');
  const timeGate = checkTimeGate(DEFAULT_DB_PATH);

  if (!timeGate.eligible) {
    console.log('\n❌ [TIME GATE] KẾT QUẢ: SCAN_2_NOT_YET_ELIGIBLE');
    console.log(`   * Baseline Scan Time (UTC)   : ${timeGate.baseline_scan_time_utc}`);
    console.log(`   * Baseline Scan Time (GMT+7) : ${timeGate.baseline_scan_time_gmt7}`);
    console.log(`   * Next Eligible Scan (UTC)   : ${timeGate.next_eligible_scan_at_utc}`);
    console.log(`   * Next Eligible Scan (GMT+7) : ${timeGate.next_eligible_scan_at_gmt7}`);
    console.log(`   * Remaining Time             : ${timeGate.remaining_time}`);
    console.log('\n⚠️ Dừng lại an toàn. Chưa đủ điều kiện thực hiện Scan #2.');
    process.exit(0);
  }

  console.log('✅ Time Gate passed! Đã đủ điều kiện thời gian.');

  // STEP 2: IDEMPOTENCY GUARD (Check if Scan #2 already completed in SQLite)
  console.log('\n🔒 [2/3] Kiểm tra Idempotency Guard...');
  const db = new TikTokDatabase(DEFAULT_DB_PATH);
  const alreadyDone = db.hasCompletedSecondScan();
  db.close();

  if (alreadyDone) {
    console.log('\n⚠️ [IDEMPOTENCY GUARD] KẾT QUẢ: SCAN_2_ALREADY_COMPLETED');
    console.log('   * Scan #2 đã hoàn thành trước đó trong cơ sở dữ liệu.');
    console.log('   * Ngăn chặn chạy lại để tránh tạo duplicate snapshot.');
    process.exit(0);
  }

  console.log('✅ Idempotency Guard passed! Scan #2 chưa từng hoàn tất.');

  // STEP 3: EXECUTE SCAN #2
  console.log('\n🌐 [3/3] Khởi chạy Second Full Scan Pipeline...');
  // Lazy require to ensure zero browser side-effects before step 1 & 2
  const { executeSecondFullScan } = require('../src/modules/tiktok/scan/secondScanOrchestrator');
  
  // Real collectors would be wired here for live runs
  const result = await executeSecondFullScan({
    dbPath: DEFAULT_DB_PATH
  });

  if (result.success) {
    console.log('\n🎉 SECOND FULL SCAN HOÀN TẤT THÀNH CÔNG!');
    console.log(`   * Scan ID: ${result.scan_id}`);
    console.log(`   * Track A Topics Evaluated: ${result.trackA_count}`);
    console.log(`   * Newly Validated Topics: ${result.newly_validated_count}`);
  } else {
    console.log(`\n⚠️ Scan kết thúc với trạng thái: ${result.status}`);
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error in run_second_scan:', err);
    process.exit(1);
  });
}

module.exports = { main };
