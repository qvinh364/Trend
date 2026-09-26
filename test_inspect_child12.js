const { chromium } = require('playwright');
const fs = require('fs');

async function inspectChild1and2() {
  const session = JSON.parse(fs.readFileSync('./data/fb_session.json', 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(session.cookies);
  const page = await context.newPage();

  await page.goto('https://www.facebook.com/groups/408571091380061/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const res = await page.evaluate(() => {
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) return null;
    const children = Array.from(feed.children);
    return children.slice(1, 3).map((c, i) => ({
      index: i + 1,
      tagName: c.tagName,
      className: c.className,
      allLinks: Array.from(c.querySelectorAll('a')).map(a => ({ href: a.href, text: a.innerText.trim(), aria: a.getAttribute('aria-label') })),
      innerHTML: c.innerHTML.slice(0, 1500)
    }));
  });

  console.log(JSON.stringify(res, null, 2));
  await browser.close();
}

inspectChild1and2().catch(console.error);
