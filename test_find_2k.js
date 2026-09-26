const { chromium } = require('playwright');
const fs = require('fs');

async function findSourceOf2KReactions() {
  const session = JSON.parse(fs.readFileSync('./data/fb_session.json', 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(session.cookies);
  const page = await context.newPage();

  await page.goto('https://www.facebook.com/groups/408571091380061/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  for (let s = 1; s <= 20; s++) {
    const res = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return null;
      for (const child of Array.from(feed.children)) {
        if ((child.innerText || '').includes('0339299971')) {
          // Find every element with aria-label containing "2K" or "1,2K" or "Haha" or "Thích"
          const allWithAria = Array.from(child.querySelectorAll('[aria-label]')).map(el => {
            // Find parent chain
            let chain = [];
            let p = el.parentElement;
            for (let i = 0; i < 4; i++) {
              if (p) {
                chain.push({ tag: p.tagName, class: p.className, role: p.getAttribute('role') });
                p = p.parentElement;
              }
            }
            return {
              tag: el.tagName,
              aria: el.getAttribute('aria-label'),
              text: el.innerText.slice(0, 50),
              outerHTML: el.outerHTML.slice(0, 150),
              chain
            };
          });
          return {
            childText: child.innerText.slice(0, 500),
            matchingArias: allWithAria.filter(a => a.aria.includes('người') || a.aria.includes('Thích') || a.aria.includes('Haha') || a.aria.includes('cảm xúc'))
          };
        }
      }
      return null;
    });

    if (res) {
      console.log('Child text:\n', res.childText);
      console.log('Matching Arias:\n', JSON.stringify(res.matchingArias, null, 2));
      break;
    }

    await page.evaluate(() => window.scrollBy(0, 1800));
    await page.waitForTimeout(1200);
  }

  await browser.close();
}

findSourceOf2KReactions().catch(console.error);
