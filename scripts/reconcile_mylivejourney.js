const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PROFILE_DIR = path.resolve(__dirname, '../data/tiktok_browser_profile');

async function reconcileMylivejourney() {
  console.log('Starting bounded reconciliation for #mylivejourney...');
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const result = {
    candidate_key: 'hashtag:mylivejourney',
    retrieval_conflict: true,
    reconciliation_status: 'RETRIEVAL_INCONCLUSIVE',
    reconciliation_reason: '',
    evidence_inspected: []
  };

  try {
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    // 1. Try direct tag landing page: https://www.tiktok.com/tag/mylivejourney
    console.log('Testing direct hashtag landing page: https://www.tiktok.com/tag/mylivejourney');
    let extracted = [];
    try {
      await page.goto('https://www.tiktok.com/tag/mylivejourney', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      extracted = await page.evaluate(() => {
        const items = [];
        const links = Array.from(document.querySelectorAll('a[href*="/video/"]'));
        for (const link of links) {
          if (items.some(i => i.url === link.href)) continue;
          const container = link.closest('div[class*="DivItemContainer"]') || link.parentElement?.parentElement;
          const text = container ? container.innerText : link.innerText;
          let creator = null;
          const m = link.href.match(/@([^/?#]+)/);
          if (m) creator = '@' + m[1];
          items.push({ url: link.href, creator, caption: text ? text.slice(0, 150) : null });
          if (items.length >= 3) break;
        }
        return items;
      });
      console.log('Tag page extracted count:', extracted.length);
    } catch (e) {
      console.log('Direct tag page error:', e.message);
    }

    // Also check exact search: https://www.tiktok.com/search?q=%23mylivejourney
    if (extracted.length === 0) {
      const searchUrl = 'https://www.tiktok.com/search?q=' + encodeURIComponent('#mylivejourney');
      console.log('Navigating to exact search with hash:', searchUrl);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3500);
      extracted = await page.evaluate(() => {
        const items = [];
        const links = Array.from(document.querySelectorAll('a[href*="/video/"]'));
        for (const link of links) {
          if (items.some(i => i.url === link.href)) continue;
          const container = link.closest('div[class*="DivItemContainer"]') || link.parentElement?.parentElement;
          const text = container ? container.innerText : link.innerText;
          let creator = null;
          const m = link.href.match(/@([^/?#]+)/);
          if (m) creator = '@' + m[1];
          items.push({ url: link.href, creator, caption: text ? text.slice(0, 150) : null });
          if (items.length >= 3) break;
        }
        return items;
      });
      console.log('Exact search with hash extracted count:', extracted.length);
    }

    console.log(`Extracted ${extracted.length} evidence items:`, JSON.stringify(extracted, null, 2));

    result.evidence_inspected = extracted;

    // Check relevance
    const relevantItems = extracted.filter(i => {
      const txt = ((i.caption || '') + ' ' + (i.creator || '')).toLowerCase();
      return txt.includes('mylivejourney') || txt.includes('livejourney');
    });

    const uniqueCreators = new Set(relevantItems.map(i => i.creator).filter(Boolean));

    if (relevantItems.length >= 3 && uniqueCreators.size >= 3) {
      result.reconciliation_status = 'PROMOTE_TO_DEEP_VALIDATION';
      result.reconciliation_reason = `Tìm thấy ${relevantItems.length} video liên quan trực tiếp từ ${uniqueCreators.size} creator độc lập qua exact hashtag retrieval.`;
    } else if (extracted.length === 0) {
      result.reconciliation_status = 'RETRIEVAL_INCONCLUSIVE';
      result.reconciliation_reason = 'TikTok Web không trả về kết quả hoặc bị hạn chế truy xuất cho hashtag #mylivejourney trên môi trường desktop hiện tại.';
    } else if (relevantItems.length === 0) {
      result.reconciliation_status = 'CONFIRMED_DROP';
      result.reconciliation_reason = `Exact search (#mylivejourney) tiếp tục chỉ trả về các video/bình luận không liên quan (0/${extracted.length} video liên quan); không có bằng chứng replication mạch lạc trên giao diện người dùng.`;
    } else {
      result.reconciliation_status = 'RETRIEVAL_INCONCLUSIVE';
      result.reconciliation_reason = `Chỉ tìm thấy ${relevantItems.length} video có chứa từ khóa từ ${uniqueCreators.size} creator; không đủ ngưỡng replication (>=3 creators) nhưng có tín hiệu rải rác; giữ trạng thái không kết luận.`;
    }

    console.log('\nReconciliation Result:', JSON.stringify(result, null, 2));
    fs.writeFileSync(path.resolve(__dirname, '../data/tiktok_mylivejourney_reconciliation.json'), JSON.stringify(result, null, 2), 'utf8');

  } finally {
    await context.close();
  }
}

reconcileMylivejourney();
