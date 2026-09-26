/**
 * CREATIVE CENTER STRUCTURED DATA COLLECTOR (NODE DETERMINISTIC)
 * 
 * Collects structured trending hashtags from TikTok Creative Center VN (7d & 30d).
 * Note: Unauthenticated sessions see Top 3 rows before the "Log in or sign up" gate.
 */

const { chromium } = require('playwright');
const { cleanLabel, isGenericNoise, parseMetricNumber } = require('./candidateNormalizer');

async function scrapeCreativeCenterPeriod(page, period = 7) {
  const url = `https://ads.tiktok.com/creative/creativeCenter/trends/hashtag?countryCode=VN&period=${period}&region=VN`;
  const runInfo = {
    source: `creative_center_${period}d`,
    status: 'NOT_RUN',
    raw_items_found: 0,
    candidates_kept: 0,
    error: null,
    note: null
  };

  const rawList = [];

  // Bounded retry: up to 1 retry for transient navigation timeouts (max 2 attempts total)
  let lastErr = null;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      // Do not retry on unresolvable DNS errors
      if (err.message && err.message.includes('ERR_NAME_NOT_RESOLVED')) {
        break;
      }
      if (attempt < maxAttempts) {
        console.warn(`[CreativeCenterCollector] Transient navigation issue for ${period}d (attempt ${attempt}): ${err.message}. Retrying once...`);
        await page.waitForTimeout(1500);
      }
    }
  }

  if (lastErr) {
    runInfo.status = 'FAILED';
    runInfo.error = lastErr.message;
    console.warn(`[CreativeCenterCollector] Error scraping ${period}d:`, lastErr.message);
    return { runInfo, rawList };
  }

  try {
    const scraped = await page.evaluate(() => {
      const items = [];
      const hashEls = Array.from(document.querySelectorAll('*')).filter(el => {
        const t = (el.innerText || '').trim();
        return el.children.length === 0 && t.startsWith('#') && t.length > 2 && t.length < 60;
      });

      for (const el of hashEls) {
        const tag = el.innerText.trim();
        const tr = el.closest('tr') || el.closest('[class*="Card"]') || el.parentElement?.parentElement;
        const text = tr ? tr.innerText.replace(/\n+/g, ' | ') : '';
        items.push({ tag, fullRowText: text });
      }

      // Check if "Log in or sign up" view more banner is present
      const hasLoginGate = document.body.innerText.includes('Log in or sign up');
      return { items, hasLoginGate };
    });

    runInfo.raw_items_found = scraped.items.length;
    if (scraped.hasLoginGate) {
      runInfo.note = `Unauthenticated view currently exposes only 3 rows before the login gate. Authenticated access may expose additional rows; exact count has not yet been verified in this environment.`;
    }

    for (const item of scraped.items) {
      const label = cleanLabel(item.tag);
      if (isGenericNoise(label)) continue;

      const parts = item.fullRowText.split('|').map(p => p.trim());
      let rank = null;
      let industry = null;
      let posts = null;
      let views = null;

      if (parts.length >= 3) {
        const parsedRank = parseInt(parts[0], 10);
        if (!isNaN(parsedRank)) rank = parsedRank;

        for (let i = 0; i < parts.length; i++) {
          if (parts[i].toLowerCase() === 'posts' && i > 0) {
            posts = parseMetricNumber(parts[i - 1]);
          }
          if (parts[i].toLowerCase() === 'views' && i > 0) {
            views = parseMetricNumber(parts[i - 1]);
          }
          if (['News & Entertainment', 'Games', 'Food & Beverage', 'Apparel & Accessories', 'Vehicle & Transportation'].includes(parts[i])) {
            industry = parts[i];
          }
        }
      }

      rawList.push({
        label,
        tag: `#${label}`,
        period_days: period,
        rank,
        industry,
        posts,
        views,
        raw_signal: item.fullRowText,
        evidence_url: url
      });
    }

    runInfo.candidates_kept = rawList.length;
    runInfo.status = 'SUCCESS';
  } catch (err) {
    runInfo.status = 'FAILED';
    runInfo.error = err.message;
    console.warn(`[CreativeCenterCollector] Error evaluating/parsing ${period}d:`, err.message);
  }

  return { runInfo, rawList };
}

/**
 * Runs collection for both 7d and 30d
 */
async function collectCreativeCenterData() {
  let browser = null;
  const source_runs = [];
  let cc7dResult = { runInfo: null, rawList: [] };
  let cc30dResult = { runInfo: null, rawList: [] };

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    // 1. Collect 7d on dedicated clean page
    let page7d = null;
    try {
      page7d = await browser.newPage({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        locale: 'vi-VN'
      });
      cc7dResult = await scrapeCreativeCenterPeriod(page7d, 7);
    } finally {
      if (page7d) await page7d.close().catch(() => {});
    }
    source_runs.push(cc7dResult.runInfo);

    // 2. Collect 30d on dedicated clean page (isolated from 7d failure)
    let page30d = null;
    try {
      page30d = await browser.newPage({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        locale: 'vi-VN'
      });
      cc30dResult = await scrapeCreativeCenterPeriod(page30d, 30);
    } finally {
      if (page30d) await page30d.close().catch(() => {});
    }
    source_runs.push(cc30dResult.runInfo);

  } catch (err) {
    console.error('❌ [CreativeCenterCollector] Browser launch failed:', err.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return {
    source_runs,
    cc7dList: cc7dResult.rawList,
    cc30dList: cc30dResult.rawList
  };
}

module.exports = {
  collectCreativeCenterData,
  scrapeCreativeCenterPeriod
};
