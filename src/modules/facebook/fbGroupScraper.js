const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SESSION_FILE = path.join(__dirname, '../../../data/fb_session.json');
const STORE_FILE = path.join(__dirname, '../../../data/store.json');

const GROUPS_TO_SCRAPE = [
  {
    id: '2k5ptit',
    name: 'Cộng đồng sinh viên PTIT (CĐ SV)',
    url: 'https://www.facebook.com/groups/2k5ptit'
  },
  {
    id: '408571091380061',
    name: 'Góc thông tin PTIT',
    url: 'https://www.facebook.com/groups/408571091380061'
  },
  {
    id: '1605563914144178',
    name: 'Group D26 PTIT (2k8)',
    url: 'https://www.facebook.com/groups/1605563914144178'
  },
  {
    id: 'confessions.ptit',
    name: 'PTIT Confessions (PTIT CFS)',
    url: 'https://www.facebook.com/groups/confessions.ptit'
  }
];

function parseMetricNumber(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const clean = String(str).trim().toLowerCase().replace(',', '.');
  if (clean.includes('k')) {
    return Math.round(parseFloat(clean.replace('k', '')) * 1000);
  }
  return parseInt(clean.replace(/\D/g, ''), 10) || 0;
}

// Kiểm tra bài viết có trong phạm vi 7 ngày gần nhất hay không
function isPostWithin7Days(dateStr, now = new Date()) {
  if (!dateStr) return true; // Giữ lại nếu không có date để không vô tình bỏ sót
  const s = dateStr.trim().toLowerCase();

  // 1. Phút, Giờ, Hôm qua, Vừa xong -> Chắc chắn trong 1-2 ngày
  if (s.includes('vừa xong') || s.includes('phút') || s.includes('giờ') || s.includes('hôm qua') || /^\d+\s*h$/i.test(s)) {
    return true;
  }

  // 2. "X ngày"
  const mDay = s.match(/(\d+)\s*ngày/);
  if (mDay) {
    const days = parseInt(mDay[1], 10);
    return days <= 7;
  }

  // 3. "X tuần" -> 1 tuần trở lên là quá 7 ngày
  const mWeek = s.match(/(\d+)\s*tuần/);
  if (mWeek) {
    const weeks = parseInt(mWeek[1], 10);
    return weeks < 1;
  }

  // 4. "D Tháng M" hoặc "D tháng M, YYYY" hoặc "Thứ X, D Tháng M, YYYY lúc HH:mm"
  const mFull = s.match(/(\d{1,2})\s*tháng\s*(\d{1,2})(?:,?\s*(\d{4}))?/);
  if (mFull) {
    const day = parseInt(mFull[1], 10);
    const month = parseInt(mFull[2], 10) - 1;
    const year = mFull[3] ? parseInt(mFull[3], 10) : now.getFullYear();

    const postDate = new Date(year, month, day);
    const diffMs = now.getTime() - postDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= -1 && diffDays <= 7.5;
  }

  if (s.includes('năm')) return false;

  return true;
}

async function scrapeAllGroupsLive(scrollDepth = 25, onProgress = null) {
  console.log(`🤖 Bắt đầu quét TOÀN BỘ bài viết trong 1 tuần (cuộn ${scrollDepth} lượt) từ ${GROUPS_TO_SCRAPE.length} Group PTIT...`);
  if (onProgress) onProgress({ message: `Khởi động trình duyệt quét ${GROUPS_TO_SCRAPE.length} nhóm...`, percent: 5 });
  const browser = await chromium.launch({ headless: true });
  
  const ctxOptions = {
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  };

  if (fs.existsSync(SESSION_FILE)) {
    try {
      ctxOptions.storageState = SESSION_FILE;
      console.log('ℹ️ Sử dụng phiên đăng nhập lưu tại fb_session.json');
    } catch (e) {
      console.warn('⚠️ Lỗi đọc fb_session.json:', e.message);
    }
  }

  const context = await browser.newContext(ctxOptions);
  const allScrapedPosts = [];

  for (let gIdx = 0; gIdx < GROUPS_TO_SCRAPE.length; gIdx++) {
    const grp = GROUPS_TO_SCRAPE[gIdx];
    console.log(`\n======================================================`);
    console.log(`🔍 [${gIdx + 1}/${GROUPS_TO_SCRAPE.length}] Đang quét sâu nhóm: ${grp.name}...`);
    if (onProgress) onProgress({
      message: `Đang quét nhóm [${gIdx + 1}/${GROUPS_TO_SCRAPE.length}]: ${grp.name}`,
      group: grp.name,
      percent: Math.round(10 + (gIdx / GROUPS_TO_SCRAPE.length) * 80)
    });

    const page = await context.newPage();

    try {
      await page.goto(grp.url, { timeout: 35000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);

      // Tự động đóng banner/dialog nếu có
      try {
        const closeBtn = await page.$('[aria-label="Đóng"], [aria-label="Close"], [aria-label="Tắt"]');
        if (closeBtn) await closeBtn.click();
      } catch (e) {}

      // Tích lũy bài viết liên tục qua từng lượt cuộn (vì Facebook DOM ảo hóa)
      const accumulatedMap = new Map();

      for (let s = 1; s <= scrollDepth; s++) {
        const batch = await page.evaluate((grpInfo) => {
          const feed = document.querySelector('div[role="feed"]');
          if (!feed) return [];
          const children = Array.from(feed.children);
          const results = [];

          for (const node of children) {
            // Phải chứa thanh tác vụ bài viết (Thích / Bình luận)
            const hasActionToolbar = node.querySelector('[aria-label="Thích"], [aria-label="Like"], [aria-label="Viết bình luận"], [aria-label*="bình luận"]');
            if (!hasActionToolbar) continue;

            // 1. Permalink bài viết chính xác
            const allLinks = Array.from(node.querySelectorAll('a[href*="/posts/"], a[href*="gm."]'));
            let postId = null;
            for (const a of allLinks) {
              const m = (a.href || '').match(/\/posts\/(\d+)/) || (a.href || '').match(/gm\.(\d+)/);
              if (m) {
                postId = m[1];
                break;
              }
            }
            if (!postId) continue;

            const fullText = node.innerText || '';
            const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

            // 2. Timestamp (Lấy nhãn thời gian thực sự, không lẫn vào bài viết)
            let timestamp = '';
            const allAnchors = Array.from(node.querySelectorAll('a'));
            for (const a of allAnchors) {
              const aria = (a.getAttribute('aria-label') || '').trim();
              if (aria && aria.length < 45 && (aria.includes('giờ') || aria.includes('ngày') || aria.includes('phút') || aria.includes('hôm qua') || aria.includes('Tháng') || aria.includes('tuần'))) {
                timestamp = aria;
                break;
              }
              const inner = a.innerText.trim();
              if (inner && inner.length < 25 && (inner.includes('giờ') || inner.includes('ngày') || inner.includes('phút') || inner.includes('hôm qua') || inner.includes('tuần') || /^\d+\s*h$/i.test(inner) || /^\d+\s*d$/i.test(inner))) {
                timestamp = inner;
                break;
              }
            }

            // Helper parse metric ngay trong evaluate
            const parseVal = (v) => {
              if (!v) return 0;
              const s = String(v).trim().toLowerCase().replace(',', '.');
              if (s.includes('k')) {
                const n = parseFloat(s.replace('k', ''));
                return isNaN(n) ? 0 : Math.round(n * 1000);
              }
              return parseInt(s.replace(/\D/g, ''), 10) || 0;
            };

            // 3. Tương tác: Likes, Comments, Shares - Multi-Strategy hiện đại
            let likes = 0;
            let comments = 0;
            let shares = 0;

            // Strategy A: Bóc tách khối "Tất cả cảm xúc:" hoặc "All reactions:"
            // Facebook web nhóm hiện đại luôn gom cụm chỉ số này vào 1 khối ngay trước các nút hành động (Thích/Bình luận/Chia sẻ)
            const rxBlock = fullText.match(/(?:Tất cả cảm xúc|All reactions):?[\s\S]*?(?=\n\s*(?:Thích|Like|Viết bình luận|Bình luận|Comment|Chia sẻ|Share)\b|$)/i);
            
            if (rxBlock) {
              const bLines = rxBlock[0].split('\n').map(l => l.trim()).filter(l => l && !l.toLowerCase().includes('cảm xúc') && !l.toLowerCase().includes('reactions'));
              const remainingNumbers = [];

              for (const line of bLines) {
                if (/bình\s*luận|comments?/i.test(line)) {
                  const m = line.match(/(\d+[\.,]?\d*[Kk]?)/);
                  if (m) comments = parseVal(m[1]);
                } else if (/chia\s*sẻ|shares?/i.test(line)) {
                  const m = line.match(/(\d+[\.,]?\d*[Kk]?)/);
                  if (m) shares = parseVal(m[1]);
                } else if (/^(\d+[\.,]?\d*[Kk]?)$/.test(line)) {
                  remainingNumbers.push(parseVal(line));
                }
              }

              // Gán theo vị trí mặc định của Facebook: [likes, comments, shares]
              if (remainingNumbers.length > 0 && likes === 0) likes = remainingNumbers[0];
              if (remainingNumbers.length > 1 && comments === 0) comments = remainingNumbers[1];
              if (remainingNumbers.length > 2 && shares === 0) shares = remainingNumbers[2];
            }

            // Strategy B (Fallback cho Likes): Aria-labels hoặc reaction badge
            if (likes === 0) {
              const reactionBadges = Array.from(node.querySelectorAll('[aria-label*="người"]')).filter(el => {
                const aria = el.getAttribute('aria-label') || '';
                if (el.closest('blockquote, a[role="link"] > div, div[tabindex="-1"]')) return false;
                return aria.includes('Thích:') || aria.includes('Haha:') || aria.includes('Yêu thích:') || aria.includes('Thương thương:') || aria.includes('Buồn:') || aria.includes('Phẫn nộ:');
              });
              if (reactionBadges.length > 0) {
                let sum = 0;
                reactionBadges.forEach(b => {
                  const m = (b.getAttribute('aria-label') || '').match(/(\d+[\.,]?\d*[Kk]?)/);
                  if (m) sum += parseVal(m[1]);
                });
                if (sum > 0) likes = sum;
              }

              const reactionCounter = node.querySelector('[aria-label*="Xem ai đã bày tỏ cảm xúc"], [aria-label*="cảm xúc về tin này"]');
              if (reactionCounter && !reactionCounter.closest('blockquote, div[tabindex="-1"]')) {
                const t = reactionCounter.innerText.trim();
                if (/^\d+[\.,]?\d*[Kk]?$/i.test(t)) {
                  const num = parseVal(t);
                  if (num > likes) likes = num;
                }
              }
            }

            // Strategy C (Fallback cho Comments): Aria-label hoặc regex text
            if (comments === 0) {
              const cmtLabelEl = Array.from(node.querySelectorAll('[aria-label]')).find(el => {
                if (el.closest('blockquote, div[tabindex="-1"]')) return false;
                const a = (el.getAttribute('aria-label') || '').trim();
                return /^\d+[\.,]?\d*[Kk]?\s*(bình\s*luận|comments)$/i.test(a);
              });
              if (cmtLabelEl) {
                const m = (cmtLabelEl.getAttribute('aria-label') || '').match(/(\d+[\.,]?\d*[Kk]?)/);
                if (m) comments = parseVal(m[1]);
              }
              if (comments === 0) {
                const mCmt = fullText.match(/(\d+[\.,]?\d*[Kk]?)\s*(?:bình\s*luận|comments)/i)
                          || fullText.match(/Xem\s+(?:tất\s+cả|thêm)\s+(\d+[\.,]?\d*[Kk]?)\s*(?:bình\s*luận|comments)/i);
                if (mCmt) comments = parseVal(mCmt[mCmt[1] !== undefined ? 1 : 2] || mCmt[1]);
              }
            }

            // Strategy D (Fallback cho Shares): Aria-label hoặc regex text
            if (shares === 0) {
              const shareLabelEl = Array.from(node.querySelectorAll('[aria-label]')).find(el => {
                if (el.closest('blockquote, div[tabindex="-1"]')) return false;
                const a = (el.getAttribute('aria-label') || '').trim();
                return /^\d+[\.,]?\d*[Kk]?\s*(lượt\s*chia\s*sẻ|chia\s*sẻ|shares)$/i.test(a);
              });
              if (shareLabelEl) {
                const m = (shareLabelEl.getAttribute('aria-label') || '').match(/(\d+[\.,]?\d*[Kk]?)/);
                if (m) shares = parseVal(m[1]);
              }
              if (shares === 0) {
                const mShare = fullText.match(/(\d+[\.,]?\d*[Kk]?)\s*(?:lượt\s*chia\s*sẻ|chia\s*sẻ|shares)/i);
                if (mShare) shares = parseVal(mShare[1]);
              }
            }

            // 6. Tác giả
            let author = 'Thành viên Group';
            for (const l of lines) {
              if (l.length > 2 && l.length < 45 &&
                  !l.includes('Facebook') &&
                  !l.includes('Nhóm') &&
                  !l.includes('Bài viết') &&
                  !l.includes('Thích') &&
                  !l.includes('Bình luận') &&
                  !l.includes('Theo dõi') &&
                  !l.includes('Người kiểm duyệt') &&
                  !l.includes('Người đóng góp nổi bật')) {
                author = l;
                break;
              }
            }

            // 6. Nội dung bài viết (Ưu tiên vùng div message chính thống của FB)
            let content = '';
            const msgEl = node.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"]');
            if (msgEl && msgEl.innerText.trim().length > 10) {
              content = msgEl.innerText.trim();
            } else {
              // Fallback
              const contentLines = [];
              let isCollecting = false;
              const BADGES = ['Theo dõi', 'Người kiểm duyệt', 'Người đóng góp nổi bật', 'Quản trị viên', 'Tác giả', 'Tác giả bài viết', 'Top đóng góp', 'Thành viên mới', 'Tin nhắn chưa đọc'];

              for (const l of lines) {
                if (l === author || l === '·' || l.includes('giờ') || l.includes('phút') || l.includes('hôm qua') || l.includes('ngày')) {
                  isCollecting = true;
                  continue;
                }
                if (isCollecting) {
                  if (l === 'Thích' || l === 'Bình luận' || l === 'Chia sẻ' || l === 'Xem thêm bình luận' ||
                      l.includes('Xem thêm bình luận') || /^\d+[\.,]?\d*K?$/i.test(l)) {
                    if (contentLines.length > 0) break;
                    else continue;
                  }
                  if (BADGES.some(b => l === b || l.startsWith(b + ' '))) continue;
                  if (l !== 'Xem thêm' && l.length > 3) {
                    contentLines.push(l);
                  }
                }
              }
              content = contentLines.join(' ');
              content = content.replace(/^(Theo dõi|Người kiểm duyệt|Người đóng góp nổi bật|Quản trị viên|Tác giả)\s*/gi, '').trim();
            }

            if (!content || content.length < 10) continue;

            results.push({
              postId,
              cleanUrl: `https://www.facebook.com/groups/${grpInfo.id}/posts/${postId}`,
              author,
              content: content.slice(0, 450),
              rawLikes: likes,
              rawComments: comments,
              rawShares: shares,
              timestamp,
              source_group: grpInfo.name,
              group_id: grpInfo.id
            });
          }

          return results;
        }, grp);

        // Hợp nhất vào Map để không bị mất các bài viết bị DOM unmount khi cuộn xuống
        for (const item of batch) {
          if (!accumulatedMap.has(item.postId)) {
            accumulatedMap.set(item.postId, item);
          } else {
            const exist = accumulatedMap.get(item.postId);
            const curL = parseMetricNumber(item.rawLikes);
            const exL = parseMetricNumber(exist.rawLikes);
            if (curL > exL) exist.rawLikes = item.rawLikes;

            const curC = parseMetricNumber(item.rawComments);
            const exC = parseMetricNumber(exist.rawComments);
            if (curC > exC) exist.rawComments = item.rawComments;

            const curS = parseMetricNumber(item.rawShares || 0);
            const exS = parseMetricNumber(exist.rawShares || 0);
            if (curS > exS) exist.rawShares = item.rawShares;

            if (!exist.timestamp && item.timestamp) exist.timestamp = item.timestamp;
            if (item.content.length > exist.content.length) exist.content = item.content;
          }
        }

        if (s % 5 === 0 && onProgress) {
          onProgress({
            message: `Đang cuộn nhóm ${grp.name} (${s}/${scrollDepth} lượt)... Tìm thấy ${accumulatedMap.size} bài`,
            group: grp.name,
            percent: Math.round(10 + (gIdx / GROUPS_TO_SCRAPE.length) * 80 + (s / scrollDepth) * (80 / GROUPS_TO_SCRAPE.length))
          });
        }

        // Cuộn tiếp
        await page.evaluate(() => window.scrollBy(0, 1800));
        await page.waitForTimeout(1200);
      }

      const allList = Array.from(accumulatedMap.values());
      console.log(`-> Đã thu thập được tổng cộng ${allList.length} bài viết trong feed.`);

      // Lọc bài viết trong 7 ngày gần nhất
      const weeklyPosts = allList.filter(p => isPostWithin7Days(p.timestamp));
      console.log(`-> Số bài viết thực sự trong 1 tuần (<= 7 ngày): ${weeklyPosts.length}`);

      // Tính điểm tương tác & sắp xếp thực tế (React + Comment + Share)
      const processed = weeklyPosts.map((p, idx) => {
        const likes = parseMetricNumber(p.rawLikes);
        const comments = parseMetricNumber(p.rawComments);
        const shares = parseMetricNumber(p.rawShares || 0);
        return {
          id: `live_${p.group_id}_${idx}_${Date.now()}`,
          source_group: p.source_group,
          group_id: p.group_id,
          source_url: p.cleanUrl,
          content: p.content,
          author: p.author || 'Thành viên Group',
          likes,
          comments,
          shares,
          timestamp: p.timestamp,
          engagement_score: likes + comments + shares,
          created_at: new Date().toISOString()
        };
      });

      // Sắp xếp giảm dần theo tổng tương tác (likes + comments + shares)
      processed.sort((a, b) => b.engagement_score - a.engagement_score);

      // Lấy chính xác TOP 5 bài viết nổi bật nhất trong tuần cho mỗi group
      const top5 = processed.slice(0, 5).map((p, rIdx) => ({
        ...p,
        rank: rIdx + 1,
        is_top_week: true
      }));

      console.log(`🏆 TOP 5 BÀI VIẾT NỔI BẬT NHẤT TUẦN CỦA ${grp.name}:`);
      top5.forEach(p => {
        console.log(`   [#${p.rank}] Điểm: ${p.engagement_score} (👍 ${p.likes} likes | 💬 ${p.comments} cmts) | TS: "${p.timestamp}"`);
        console.log(`        URL: ${p.source_url}`);
        console.log(`        Nội dung: ${p.content.slice(0, 80)}...`);
      });

      allScrapedPosts.push(...top5);

    } catch (err) {
      console.error(`❌ Lỗi khi quét nhóm ${grp.name}:`, err.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  if (allScrapedPosts.length > 0) {
    try {
      const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
      const manualPosts = (data.group_posts || []).filter(p => !p.id.startsWith('live_') && !p.id.startsWith('grp_'));
      data.group_posts = [...allScrapedPosts, ...manualPosts];
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`\n✅ Đã lưu ${allScrapedPosts.length} bài viết Top tuần thật vào database!`);
      return { success: true, count: allScrapedPosts.length, data: allScrapedPosts };
    } catch (err) {
      console.error('Lỗi khi ghi database:', err);
      return { success: false, message: err.message };
    }
  }

  return { success: false, message: 'Không thể bóc tách được bài viết từ các nhóm.' };
}

module.exports = {
  scrapeAllGroupsLive
};
