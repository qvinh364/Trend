const db = require('../db/database');

function detectTag(content) {
  const lower = content.toLowerCase();
  if (lower.includes('qldt') || lower.includes('tín chỉ') || lower.includes('đăng ký')) return 'Đăng ký tín chỉ / qldt';
  if (lower.includes('học phí') || lower.includes('tiền học') || lower.includes('đóng tiền')) return 'Học phí / CSVC';
  if (lower.includes('nợ môn') || lower.includes('học lại') || lower.includes('thi lại') || lower.includes('pe') || lower.includes('giải tích')) return 'Nợ môn / Thi cử';
  if (lower.includes('trọ') || lower.includes('phùng khoang') || lower.includes('mộ lao') || lower.includes('bus')) return 'Đời sống / Trọ';
  if (lower.includes('d26') || lower.includes('2k8') || lower.includes('tân sinh viên') || lower.includes('shcd')) return 'Tân sinh viên D26';
  if (lower.includes('intern') || lower.includes('thực tập') || lower.includes('cv') || lower.includes('việc làm') || lower.includes('đồ án')) return 'Đồ án / Việc làm IT';
  return 'Tâm sự / Thảo luận';
}

function calculateHeat(likes = 0, comments = 0) {
  const score = likes + comments * 2;
  if (score > 300) return { label: 'Top Tuần 🔥🔥🔥', level: 'high' };
  if (score > 100) return { label: 'Tương tác cao 🔥', level: 'medium' };
  return { label: 'Thảo luận', level: 'low' };
}

module.exports = {
  getMonitoredPosts() {
    const posts = db.getGroupPosts();
    return posts.map(p => ({
      ...p,
      tag: p.tag || detectTag(p.content),
      heat: calculateHeat(p.likes, p.comments)
    }));
  },

  getTopWeeklyByGroup() {
    return db.getTopWeeklyByGroup();
  },

  ingestPost({ source_group, source_url, content, author, likes, comments }) {
    const tag = detectTag(content);
    return db.addGroupPost({
      source_group: source_group || 'Cộng đồng sinh viên PTIT',
      source_url: source_url || 'https://www.facebook.com/groups/2k5ptit',
      content,
      author: author || 'Thành viên Group',
      likes: parseInt(likes, 10) || 15,
      comments: parseInt(comments, 10) || 8,
      tag
    });
  },

  deletePost(id) {
    db.deleteGroupPost(id);
  }
};
