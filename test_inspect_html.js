const { chromium } = require('playwright');
const fs = require('fs');

async function inspectPostHtml() {
  const session = JSON.parse(fs.readFileSync('./data/fb_session.json', 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(session.cookies);
  const page = await context.newPage();

  await page.goto('https://www.facebook.com/groups/408571091380061/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  for (let s = 0; s < 25; s++) {
    const found = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return null;
      for (const child of Array.from(feed.children)) {
        if ((child.innerHTML || '').includes('1448308294072997')) {
          // Check how many post links and articles are inside this ONE child!
          const links = Array.from(child.querySelectorAll('a[href*="/posts/"]')).map(a => a.href);
          const articles = Array.from(child.querySelectorAll('[role="article"]')).map(a => a.innerText.slice(0, 100));
          return {
            childClass: child.className,
            linksCount: links.length,
            links,
            articlesCount: articles.length,
            articles,
            htmlSnippet: child.innerHTML.slice(0, 2000)
          };
        }
      }
      return null;
    });

    if (found) {
      console.log('Post container analysis:');
      console.log('Links in this child:', found.links);
      console.log('Articles in this child:', found.articles);
      break;
    }
    await page.evaluate(() => window.scrollBy(0, 1800));
    await page.waitForTimeout(1200);
  }

  await browser.close();
}

inspectPostHtml().catch(console.error);
