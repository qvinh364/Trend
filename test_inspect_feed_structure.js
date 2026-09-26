const { chromium } = require('playwright');
const fs = require('fs');

async function inspectFeedStructure() {
  const session = JSON.parse(fs.readFileSync('./data/fb_session.json', 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(session.cookies);
  const page = await context.newPage();

  await page.goto('https://www.facebook.com/groups/408571091380061/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const feedAnalysis = await page.evaluate(() => {
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) return { error: 'No feed' };

    const children = Array.from(feed.children);
    return children.map((child, idx) => {
      const links = Array.from(child.querySelectorAll('a[href*="/posts/"], a[href*="gm."]')).map(a => a.href);
      const postLinks = links.filter(h => !h.includes('comment_id'));
      const commentLinks = links.filter(h => h.includes('comment_id'));

      // Check text preview
      const msg = child.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"]');
      const textHead = (child.innerText || '').slice(0, 150).replace(/\n/g, ' ');

      // Reaction badges
      const badges = Array.from(child.querySelectorAll('[aria-label*="người"]')).map(el => el.getAttribute('aria-label'));

      // Spans
      const spans = Array.from(child.querySelectorAll('span')).map(s => s.innerText.trim()).filter(s => /^\d+[\.,]?\d*[Kk]?$/.test(s));

      return {
        idx,
        postLinks,
        commentLinksCount: commentLinks.length,
        hasMessage: !!msg,
        msgText: msg ? msg.innerText.slice(0, 100) : null,
        textHead,
        badges,
        spans
      };
    });
  });

  console.log(`Feed has ${feedAnalysis.length} children.`);
  feedAnalysis.forEach(c => {
    console.log(`\n--- Child #${c.idx} ---`);
    console.log(`  PostLinks:`, c.postLinks);
    console.log(`  Msg:`, c.msgText);
    console.log(`  TextHead:`, c.textHead);
    console.log(`  Badges:`, c.badges);
    console.log(`  Spans:`, c.spans);
  });

  await browser.close();
}

inspectFeedStructure().catch(console.error);
