const path = require('path');
const { launchHeadfulLoginSession, verifySession } = require('../src/modules/tiktok/session/tiktokSetupSession');

console.log('=====================================================');
console.log('🚀 PHASE 2A.3C — TIKTOK HEADFUL LOGIN BOOTSTRAP');
console.log('=====================================================');
console.log('\n[STEP 3] Đang khởi động Chromium Headful (headless: false)...');

(async () => {
  console.log('\n=====================================================');
  console.log('ACTION_REQUIRED:');
  console.log('Trình duyệt TikTok đã được mở.');
  console.log('Vui lòng tự đăng nhập TikTok trong cửa sổ vừa xuất hiện.');
  console.log('Nếu TikTok yêu cầu CAPTCHA, OTP hoặc xác minh khác, hãy tự hoàn thành trong trình duyệt.');
  console.log('Không gửi mật khẩu, cookie hoặc OTP vào chat.');
  console.log('=====================================================\n');

  const launchResult = await launchHeadfulLoginSession({
    timeoutMs: 300000, // 5 minutes
    onStatusUpdate: (ev) => {
      console.log(`[Status] ${ev.event}`);
    }
  });

  console.log('\n[Kết quả login session]:', launchResult.status);

  if (launchResult.status === 'HEADFUL_BROWSER_UNAVAILABLE') {
    console.error('❌ HEADFUL_BROWSER_UNAVAILABLE:', launchResult.error);
    process.exit(1);
  }

  if (launchResult.authenticated) {
    console.log('✅ Đã phát hiện đăng nhập thành công!');
    console.log('[STEP 6 & 7] Đang kiểm tra lại phiên làm việc (Reopen verification)...');

    const verifyResult = await verifySession({ headless: false, timeoutMs: 30000 });
    console.log('\n=====================================================');
    console.log('AUDIT REPORT PHASE 2A.3C');
    console.log('=====================================================');
    console.log('Authenticated:', verifyResult.authenticated ? 'YES' : 'NO');
    console.log('Persistent Profile Exists:', verifyResult.persistent_profile_exists ? 'YES' : 'NO');
    console.log('Profile Path:', verifyResult.profile_path);
    console.log('Surface Access:');
    console.log('  Homepage:', verifyResult.surface_access.homepage);
    console.log('  Search:', verifyResult.surface_access.search);
    console.log('  Search Suggestions:', verifyResult.surface_access.search_suggestions);
    console.log('  Explore:', verifyResult.surface_access.explore);
    console.log('Final Recommendation:', verifyResult.recommendation);
    console.log('=====================================================\n');
  } else {
    console.log('⚠️ Hết thời gian chờ hoặc cửa sổ trình duyệt đã bị đóng trước khi hoàn tất đăng nhập.');
    console.log('Status:', launchResult.status);
  }
})();
