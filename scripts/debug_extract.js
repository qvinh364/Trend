const { chromium } = require('playwright');
const path = require('path');

const PROFILE_DIR = path.resolve(__dirname, '../data/tiktok_browser_profile');

async function debugExtract() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  try {
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    const query = 'ob55';
    const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3000);

    const info = await page.evaluate(() => {
      const allDivs = document.querySelectorAll('div[class*="DivItemContainer"]');
      const allVideoLinks = document.querySelectorAll('a[href*="/video/"]');
      return {
        containersCount: allDivs.length,
        videoLinksCount: allVideoLinks.length,
        links: Array.from(allVideoLinks).map(a => a.href)
      };
    });

    console.log('DOM info:', JSON.stringify(info, null, 2));

  } finally {
    await context.close();
  }
}

debugExtract();
