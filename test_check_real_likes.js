const { chromium } = require('playwright');
const fs = require('fs');

async function checkPostRealLikes() {
  const session = JSON.parse(fs.readFileSync('./data/fb_session.json', 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(session.cookies);
  const page = await context.newPage();

  console.log('Opening post URL: https://www.facebook.com/groups/408571091380061/posts/1448308294072997/');
  await page.goto('https://www.facebook.com/groups/408571091380061/posts/1448308294072997/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Take screenshot of single post view
  await page.screenshot({ path: './post1_view.png', fullPage: true });

  const data = await page.evaluate(() => {
    // Find text containing "0339299971"
    const allDivs = Array.from(document.querySelectorAll('div'));
    const matchingDiv = allDivs.find(d => d.innerText && d.innerText.includes('0339299971') && d.innerText.length < 500);
    return {
      matchingText: matchingDiv ? matchingDiv.innerText : null,
      bodyTextSnippet: document.body.innerText.slice(0, 3000)
    };
  });

  console.log('Matching text:', data.matchingText);
  // Find where "0339299971" is in bodyTextSnippet and print 500 chars around it
  const idx = (data.bodyTextSnippet || '').indexOf('0339299971');
  if (idx !== -1) {
    console.log('Around phone number:\n', data.bodyTextSnippet.slice(Math.max(0, idx - 200), idx + 400));
  } else {
    console.log('Phone number NOT in bodyTextSnippet!');
  }

  await browser.close();
}

checkPostRealLikes().catch(console.error);
