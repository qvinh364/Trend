const { chromium } = require('playwright');
const fs = require('fs');

async function debugPost1() {
  const session = JSON.parse(fs.readFileSync('./data/fb_session.json', 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  await context.addCookies(session.cookies);
  const page = await context.newPage();

  const url = 'https://www.facebook.com/groups/408571091380061/posts/1448308294072997/';
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(5000);

  // Take screenshot to see what it actually looks like on screen
  await page.screenshot({ path: './scratch_post1.png', fullPage: false });

  // Get full structured info
  const details = await page.evaluate(() => {
    // Look for post container
    // On single post view, there is usually div[role="main"] or div[role="article"]
    const allArticles = Array.from(document.querySelectorAll('div[role="article"]'));
    
    // Find toolbar with Like button of the post itself
    const likeButtons = Array.from(document.querySelectorAll('[aria-label="Thích"], [aria-label="Like"]'));

    // Check all text nodes in main
    const main = document.querySelector('div[role="main"]') || document.body;

    return {
      title: document.title,
      articleCount: allArticles.length,
      articlesText: allArticles.map(a => a.innerText.slice(0, 300)),
      likeButtonsCount: likeButtons.length,
      mainText: main.innerText.slice(0, 2000)
    };
  });

  console.log('Details:', JSON.stringify(details, null, 2));
  await browser.close();
}

debugPost1().catch(console.error);
