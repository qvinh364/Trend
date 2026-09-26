const path = require('path');
const { verifySession } = require('../src/modules/tiktok/session/tiktokSetupSession');

(async () => {
  console.log('=====================================================');
  console.log('🔍 PHASE 2A.3E — PERSISTENT PROFILE VERIFICATION');
  console.log('=====================================================');
  console.log('Đang kiểm tra phiên làm việc từ data/tiktok_browser_profile/...\n');

  try {
    const result = await verifySession({
      headless: true,
      timeoutMs: 45000
    });

    console.log('=== KẾT QUẢ KIỂM TRA PHIÊN ===');
    console.log('- Authenticated:', result.authenticated ? 'YES' : 'NO');
    console.log('- Persistent Profile Exists:', result.persistent_profile_exists ? 'YES' : 'NO');
    console.log('- Surface Access:');
    console.log('    Homepage:', result.surface_access.homepage);
    console.log('    Search:', result.surface_access.search);
    console.log('    Search Suggestions:', result.surface_access.search_suggestions);
    console.log('    Explore:', result.surface_access.explore);
    console.log('- Recommendation:', result.recommendation);
    if (result.error) {
      console.log('- Error note:', result.error);
    }
  } catch (err) {
    console.error('Lỗi thực thi verifySession:', err.message);
  }
})();
