const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SESSION_DIR = path.join(__dirname, '../../../data');
const SESSION_FILE = path.join(SESSION_DIR, 'fb_session.json');

function hasSession() {
  if (!fs.existsSync(SESSION_FILE)) return false;
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return Boolean(data.cookies && data.cookies.some(c => c.name === 'c_user'));
  } catch (e) {
    return false;
  }
}

function getSessionInfo() {
  if (!hasSession()) return { loggedIn: false };
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    const cUser = data.cookies.find(c => c.name === 'c_user');
    return {
      loggedIn: true,
      uid: cUser ? cUser.value : 'Đã kết nối'
    };
  } catch (e) {
    return { loggedIn: false };
  }
}

async function setupFacebookSession() {
  console.log('====================================================');
  console.log('🔑 KHỞI TẠO CỬA SỔ ĐĂNG NHẬP FACEBOOK CHO BOT TỰ ĐỘNG');
  console.log('====================================================');
  console.log('Trình duyệt Chromium sẽ mở trên màn hình.');
  console.log('Vui lòng đăng nhập Facebook để bot có quyền đọc bài viết thật trong 3 group.');
  console.log('Sau khi bạn đăng nhập xong, bot sẽ tự động nhận diện cookie c_user, lưu lại và đóng cửa sổ.');

  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
    });
  } catch (e) {
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
    });
  }

  const context = await browser.newContext({
    viewport: null, // Allow full window
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  await page.goto('https://www.facebook.com/');

  console.log('⏳ Đang đợi bạn đăng nhập trên cửa sổ Facebook...');

  const maxWaitMs = 5 * 60 * 1000; // Đợi tối đa 5 phút
  const startTime = Date.now();
  let loggedIn = false;

  try {
    while (Date.now() - startTime < maxWaitMs) {
      if (!browser.isConnected()) {
        console.log('⚠️ Cửa sổ trình duyệt đã bị đóng trước khi đăng nhập.');
        return { success: false, message: 'Trình duyệt đã bị đóng.' };
      }

      const cookies = await context.cookies();
      const cUser = cookies.find(c => c.name === 'c_user');

      if (cUser && cUser.value) {
        console.log(`🎉 ĐĂNG NHẬP THÀNH CÔNG! UID: ${cUser.value}`);
        loggedIn = true;
        // Chờ 3 giây để Facebook hoàn tất đồng bộ cookies
        await page.waitForTimeout(3000);
        await context.storageState({ path: SESSION_FILE });
        console.log('✅ ĐÃ LƯU PHIÊN ĐĂNG NHẬP THÀNH CÔNG VÀO:', SESSION_FILE);
        break;
      }

      await page.waitForTimeout(1500);
    }

    if (!loggedIn) {
      console.log('❌ Hết thời gian chờ đăng nhập (5 phút).');
      return { success: false, message: 'Hết thời gian chờ đăng nhập.' };
    }

    return { success: true, message: 'Đăng nhập thành công! Phiên đã được lưu.' };
  } catch (err) {
    console.error('Lỗi phiên đăng nhập:', err.message);
    return { success: false, message: err.message };
  } finally {
    try {
      await browser.close();
    } catch (e) {}
  }
}

function importCookieString(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return { success: false, message: 'Chuỗi cookie rỗng hoặc không hợp lệ.' };
  }

  const trimmed = rawInput.trim();
  let cookies = [];

  // Hỗ trợ định dạng JSON copy từ Extension (Cookie-Editor, EditThisCookie)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        cookies = parsed.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain || '.facebook.com',
          path: c.path || '/',
          expires: c.expirationDate || -1,
          httpOnly: Boolean(c.httpOnly),
          secure: Boolean(c.secure),
          sameSite: c.sameSite || 'Lax'
        }));
      }
    } catch (e) {}
  }

  // Hỗ trợ định dạng chuỗi Header (key=val; key=val;)
  if (cookies.length === 0) {
    const parts = trimmed.split(';');
    for (const p of parts) {
      const item = p.trim();
      if (!item) continue;
      const eqIdx = item.indexOf('=');
      if (eqIdx === -1) continue;

      const name = item.slice(0, eqIdx).trim();
      const value = item.slice(eqIdx + 1).trim();

      cookies.push({
        name,
        value,
        domain: '.facebook.com',
        path: '/',
        expires: -1,
        httpOnly: name === 'xs',
        secure: true,
        sameSite: 'Lax'
      });
    }
  }

  const hasCUser = cookies.some(c => c.name === 'c_user');
  if (!hasCUser) {
    return { success: false, message: 'Cookie dán vào thiếu c_user (ID tài khoản Facebook). Hãy đảm bảo bạn đã copy đúng từ trang facebook.com.' };
  }

  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const storageState = {
    cookies,
    origins: []
  };

  fs.writeFileSync(SESSION_FILE, JSON.stringify(storageState, null, 2), 'utf-8');
  console.log('✅ Đã lưu cookie thành công vào:', SESSION_FILE);
  return { success: true, message: 'Đã lưu cookie thành công! Bot đang tự động cào bài viết thật từ 3 group.' };
}

if (require.main === module) {
  setupFacebookSession().catch(console.error);
}

module.exports = {
  setupFacebookSession,
  hasSession,
  getSessionInfo,
  importCookieString
};
