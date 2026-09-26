const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { TIKTOK_PROFILE_DIR, isProfileLocked } = require('../src/modules/tiktok/session/profileConfig');

const PROFILE_PATH = TIKTOK_PROFILE_DIR;

if (isProfileLocked(PROFILE_PATH)) {
  console.error('\n❌ Profile đang được sử dụng bởi một tiến trình trình duyệt khác.');
  console.error('Vui lòng đóng các cửa sổ TikTok/Chromium đang mở và thử lại.');
  process.exit(1);
}

if (!fs.existsSync(PROFILE_PATH)) {
  fs.mkdirSync(PROFILE_PATH, { recursive: true });
}

console.log('================================================');
console.log('TIKTOK TREND RADAR — ĐĂNG NHẬP THỦ CÔNG');
console.log('================================================\n');
console.log(`Persistent Profile: ${PROFILE_PATH}\n`);
console.log('Một cửa sổ TikTok sẽ được mở.\n');
console.log('1. Hãy tự đăng nhập TikTok trong cửa sổ đó.');
console.log('2. Nếu TikTok yêu cầu OTP/CAPTCHA, hãy tự hoàn thành.');
console.log('3. Khi thấy tài khoản đã đăng nhập thành công, hãy đóng cửa sổ TikTok.\n');
console.log('KHÔNG gửi mật khẩu, OTP hoặc cookie vào Antigravity.\n');
console.log('Phiên đăng nhập sẽ được lưu cục bộ trên máy này.');
console.log('================================================\n');

(async () => {
  let context = null;
  try {
    context = await chromium.launchPersistentContext(PROFILE_PATH, {
      headless: false,
      viewport: null,
      args: ['--start-maximized']
    });

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});

    // Wait until browser or all pages are closed by the user
    await new Promise((resolve) => {
      context.on('close', () => resolve());
      page.on('close', () => {
        if (context.pages().length <= 1) {
          context.close().catch(() => {}).then(() => resolve());
        }
      });
    });

    console.log('\nĐã đóng trình duyệt. Persistent profile đã được lưu cục bộ.');
  } catch (err) {
    console.error('Lỗi khi mở trình duyệt:', err.message);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
})();
