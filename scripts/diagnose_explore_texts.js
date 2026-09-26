const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const profileDir = path.resolve(__dirname, '../data/tiktok_browser_profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 }
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.goto('https://www.tiktok.com/explore', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const texts = await page.evaluate(() => {
    // Find all card text or descriptions
    const list = [];
    const elements = document.querySelectorAll('div[data-e2e="explore-item"], div[class*="Card"], div[class*="Item"]');
    elements.forEach(el => {
      const t = el.innerText ? el.innerText.trim() : '';
      if (t.length > 10 && t.length < 300) {
        list.push(t.replace(/\s+/g, ' '));
      }
    });
    return Array.from(new Set(list)).slice(0, 15);
  });

  console.log('Sample texts in explore containers:');
  texts.forEach((t, i) => console.log(`[${i+1}] ${t}`));

  await context.close();
})();
