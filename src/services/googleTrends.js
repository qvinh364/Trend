const Parser = require('rss-parser');
const parser = new Parser({
  customFields: {
    item: [
      ['ht:approx_traffic', 'approx_traffic'],
      ['ht:news_item', 'news_items', { keepArray: true }],
      ['ht:picture', 'picture']
    ]
  }
});

const GOOGLE_TRENDS_VN_URL = 'https://trends.google.com/trending/rss?geo=VN';

async function fetchGoogleTrendsVN() {
  try {
    const feed = await parser.parseURL(GOOGLE_TRENDS_VN_URL);
    if (!feed || !feed.items || feed.items.length === 0) {
      return getFallbackTrends();
    }

    return feed.items.map((item, idx) => {
      let newsTitle = '';
      let newsUrl = '';
      if (item.news_items && item.news_items.length > 0) {
        const firstNews = item.news_items[0];
        newsTitle = firstNews['ht:news_item_title'] || '';
        newsUrl = firstNews['ht:news_item_url'] || '';
      }

      const queryTerm = encodeURIComponent(item.title.trim());
      const searchUrl = newsUrl || `https://www.google.com/search?q=${queryTerm}`;
      const analysis = analyzeGoogleTrendForStudents(item.title, newsTitle);

      return {
        id: 'gt_' + idx + '_' + Date.now(),
        platform: 'google',
        title: item.title,
        viral_metrics: `${item.approx_traffic || '20K+'} lượt tìm kiếm`,
        viral_score: calculateViralScore(item.approx_traffic),
        description: newsTitle || item.contentSnippet || `Xu hướng tìm kiếm đột biến trên Google tại Việt Nam`,
        link: searchUrl,
        pubDate: item.pubDate || new Date().toISOString(),
        category: analysis.category,
        relevance_score: analysis.relevance_score,
        relevance_tier: analysis.relevance_score >= 80 ? 'high' : (analysis.relevance_score >= 50 ? 'medium' : 'low'),
        pivot_angle: analysis.pivot_angle,
        author: 'Google Trends Vietnam'
      };
    });
  } catch (error) {
    console.error('Error fetching Google Trends VN RSS:', error.message);
    return getFallbackTrends();
  }
}

function calculateViralScore(traffic = '') {
  const num = parseInt(traffic.replace(/\D/g, ''), 10) || 20;
  if (num >= 200) return 99;
  if (num >= 100) return 95;
  if (num >= 50) return 90;
  return 85;
}

function analyzeGoogleTrendForStudents(title, snippet) {
  const t = (title + ' ' + (snippet || '')).toLowerCase();

  if (t.includes('học') || t.includes('trường') || t.includes('thi') || t.includes('điểm') || t.includes('sinh viên') || t.includes('giáo dục')) {
    return {
      category: 'Giáo dục & Thi cử',
      relevance_score: 95,
      pivot_angle: 'Trúng tâm điểm sinh viên: Áp dụng so sánh trực tiếp với tình hình thi cử, học bổng hoặc điểm số tại PTIT.'
    };
  }

  if (t.includes('game') || t.includes('ai') || t.includes('công nghệ') || t.includes('iphone') || t.includes('apple') || t.includes('facebook') || t.includes('code')) {
    return {
      category: 'Công nghệ & Game',
      relevance_score: 92,
      pivot_angle: 'Khối ngành thế mạnh PTIT (CNTT, Game): Khen hoặc cà khịa sản phẩm dưới góc nhìn của một lập trình viên / dev Bưu Chính.'
    };
  }

  if (t.includes('phim') || t.includes('show') || t.includes('rap') || t.includes('anh trai') || t.includes('ca sĩ') || t.includes('nhạc')) {
    return {
      category: 'Giải trí & Showbiz',
      relevance_score: 82,
      pivot_angle: 'Trào lưu giải trí Gen Z đang cày: Mượn các câu nói viral (catchphrase) trong show để chế meme sinh viên nợ môn.'
    };
  }

  if (t.includes('giá') || t.includes('xăng') || t.includes('vàng') || t.includes('tiền') || t.includes('lương')) {
    return {
      category: 'Kinh tế & Đời sống',
      relevance_score: 88,
      pivot_angle: 'Chuyện tiền nong sinh viên: Nối sang chi phí sinh hoạt, cơm trọ Phùng Khoang và áp lực tăng học phí của trường.'
    };
  }

  return {
    category: 'Xã hội & Xu hướng',
    relevance_score: 65,
    pivot_angle: 'Sự kiện nóng trên mạng: Xem xét làm meme phản ứng của sinh viên PTIT trước sự kiện này.'
  };
}

function getFallbackTrends() {
  return [
    {
      id: 'gt_fb_1',
      platform: 'google',
      title: 'Điểm chuẩn đại học 2026',
      viral_metrics: '200K+ tìm kiếm',
      viral_score: 98,
      description: 'Các trường đại học top đầu công bố điểm chuẩn và danh sách trúng tuyển đợt 2',
      link: 'https://www.google.com/search?q=%C4%91i%E1%BB%83m+chu%E1%BA%A9n+%C4%91%E1%BA%A1i+h%E1%BB%8Dc+2026',
      pubDate: new Date().toISOString(),
      category: 'Giáo dục & Tuyển sinh',
      relevance_score: 98,
      relevance_tier: 'high',
      pivot_angle: 'Dễ chế bài so sánh dìm điểm chuẩn PTIT với Bách Khoa và UET để kéo hàng trăm cmt tự hào/tự dìm.',
      author: 'Google Trends Vietnam'
    },
    {
      id: 'gt_fb_2',
      platform: 'google',
      title: 'Ra mắt tính năng AI mới chấn động giới công nghệ',
      viral_metrics: '100K+ tìm kiếm',
      viral_score: 94,
      description: 'Mô hình AI mới có khả năng tự sửa lỗi code và lập trình ứng dụng trong vài giây',
      link: 'https://www.google.com/search?q=cong+nghe+ai+moi',
      pubDate: new Date().toISOString(),
      category: 'Công nghệ & IT',
      relevance_score: 95,
      relevance_tier: 'high',
      pivot_angle: 'Dân IT PTIT: "AI viết code hộ thì sinh viên Bưu Điện đi thi PE máy có được dùng ChatGPT không thầy ơi?"',
      author: 'Google Trends Vietnam'
    },
    {
      id: 'gt_fb_3',
      platform: 'google',
      title: 'Chung kết Show âm nhạc truyền hình hot nhất tuần',
      viral_metrics: '150K+ tìm kiếm',
      viral_score: 96,
      description: 'Màn trình diễn đêm chung kết đang phủ sóng toàn bộ mạng xã hội và top thịnh hành',
      link: 'https://www.google.com/search?q=show+am+nhac+hot+viet+nam',
      pubDate: new Date().toISOString(),
      category: 'Giải trí & Âm nhạc',
      relevance_score: 80,
      relevance_tier: 'high',
      pivot_angle: 'Lấy ngay câu hát viral nhất để làm title bài đăng về kỳ thi sắp tới của trường.',
      author: 'Google Trends Vietnam'
    }
  ];
}

module.exports = {
  fetchGoogleTrendsVN
};
