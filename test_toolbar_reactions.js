const { chromium } = require('playwright');
const fs = require('fs');

async function testToolbarReactionExtraction() {
  const session = JSON.parse(fs.readFileSync('./data/fb_session.json', 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(session.cookies);
  const page = await context.newPage();

  await page.goto('https://www.facebook.com/groups/408571091380061/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Scroll a bit
  for (let s = 0; s < 15; s++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(1000);
  }

  const posts = await page.evaluate(() => {
    // Target all post action toolbars: div containing [aria-label="Thích"]
    const likeButtons = Array.from(document.querySelectorAll('div[role="feed"] [aria-label="Thích"], div[role="feed"] [aria-label="Like"]'));
    const results = [];

    for (const likeBtn of likeButtons) {
      // Find post container
      // Go up until we find the post card container
      let card = likeBtn.closest('div[role="article"]') || likeBtn.closest('div[data-virtualized="false"]') || likeBtn.closest('div[aria-posinset]');
      if (!card) {
        let p = likeBtn.parentElement;
        for (let i = 0; i < 8; i++) {
          if (p && p.getAttribute('role') === 'article') { card = p; break; }
          if (p && p.parentElement) p = p.parentElement;
        }
      }
      if (!card) card = likeBtn.parentElement?.parentElement?.parentElement?.parentElement;
      if (!card) continue;

      // Find action toolbar container
      // It's the parent container holding Like, Comment, Share
      let actionRow = likeBtn;
      while (actionRow && actionRow.parentElement && !actionRow.querySelector('[aria-label*="bình luận"]')) {
        actionRow = actionRow.parentElement;
      }

      // The metrics row (reactions & comment count) is the previous sibling of actionRow!
      const metricsRow = actionRow ? actionRow.previousElementSibling : null;

      let likes = 0;
      let comments = 0;

      if (metricsRow) {
        // Badges in metricsRow
        const badges = Array.from(metricsRow.querySelectorAll('[aria-label*="người"]')).map(el => el.getAttribute('aria-label'));
        // Spans in metricsRow
        const spans = Array.from(metricsRow.querySelectorAll('span')).map(s => s.innerText.trim()).filter(Boolean);
        results.push({
          postSnippet: card.innerText.slice(0, 100).replace(/\n/g, ' '),
          metricsRowText: metricsRow.innerText.replace(/\n/g, ' '),
          badges,
          spans
        });
      }
    }
    return results;
  });

  console.log(`Found ${posts.length} toolbars:`);
  posts.forEach((p, i) => {
    console.log(`[#${i+1}] Snippet: ${p.postSnippet}`);
    console.log(`    MetricsRow: "${p.metricsRowText}"`);
    console.log(`    Badges:`, p.badges);
    console.log(`    Spans:`, p.spans);
  });

  await browser.close();
}

testToolbarReactionExtraction().catch(console.error);
