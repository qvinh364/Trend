const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'store.json');

// Real Facebook post permalinks: https://www.facebook.com/groups/{group_id}/posts/{post_id}/
const INITIAL_GROUP_POSTS = [
  {
    "id": "live_2k5ptit_8_1790065009499",
    "source_group": "Cộng đồng sinh viên PTIT (CĐ SV)",
    "group_id": "2k5ptit",
    "source_url": "https://www.facebook.com/groups/2k5ptit/posts/1282556550620186",
    "content": "Sáng nay bạn nào để quên điện thoại liên hệ nhé Nam thì 1 nụ hôn lốc xoáy, nữ thì thôi",
    "author": "Bảo Khang",
    "likes": 422,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 16:13",
    "engagement_score": 422,
    "created_at": "2026-09-22T08:16:49.499Z",
    "rank": 1,
    "is_top_week": true
  },
  {
    "id": "live_2k5ptit_19_1790065009500",
    "source_group": "Cộng đồng sinh viên PTIT (CĐ SV)",
    "group_id": "2k5ptit",
    "source_url": "https://www.facebook.com/groups/2k5ptit/posts/1281362730739568",
    "content": "T đã bị sốc văn hóa khi học ở PTIT cơ sở Ngọc Trục. Chuyện sẽ không có gì, như thường ngày t sẽ về nhà sau tiết học 19-19r ở trường. NHƯNG KHÔNGGGGGGG. Khi t xuống bãi gửi xe, XE T BỊ KHÓA. Tôi đi hỏi các bác gần đó thì được tin \" CÁC BÁC ĐI ĂN RỒI CHÁU\", tôi cũng ok. Và sau 15p 20p, các bác trở lại....\"TỰ BẮT XE VỀ ĐI, SÁNG MAI QUAY LẠI LẤY XE\". Tôi xin nhắc lại NHÀ TÔI CÁCH TRƯỜNG GẦN 10 CÂY. T đã ngồi đó xin xỏ, năn nỉ 1 tiếng hơn, dù bị bảo l",
    "author": "Người tham gia ẩn danh",
    "likes": 335,
    "comments": 0,
    "timestamp": "Thứ bảy, 19 Tháng 9, 2026 lúc 21:51",
    "engagement_score": 335,
    "created_at": "2026-09-22T08:16:49.500Z",
    "rank": 2,
    "is_top_week": true
  },
  {
    "id": "live_2k5ptit_5_1790065009499",
    "source_group": "Cộng đồng sinh viên PTIT (CĐ SV)",
    "group_id": "2k5ptit",
    "source_url": "https://www.facebook.com/groups/2k5ptit/posts/1282557173953457",
    "content": "Các con ơi ơi học kỹ thuật trường mình nặng và vất vả lắm hay sao mà con trai cô, cô giao việc nhà cho con vì con năm 3 rồi, mà lúc nào cháu cũng bảo với mẹ là con học nặng rồi, đầu óc đâu làm việc nhà. Cô phải dọn phòng cho con trai, đi làm về còn nhặt từng cọng rau mà cô k biết có đúng là cháu học nhiều không. Đóng cửa phong học suốt vì con nói cần yên tĩnh. Cô k hiểu biết nên lên hỏi các con. Các con giúp cô nha.",
    "author": "BronzeHummingbird8722",
    "likes": 204,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 10:35",
    "engagement_score": 204,
    "created_at": "2026-09-22T08:16:49.499Z",
    "rank": 3,
    "is_top_week": true
  },
  {
    "id": "live_2k5ptit_23_1790065009500",
    "source_group": "Cộng đồng sinh viên PTIT (CĐ SV)",
    "group_id": "2k5ptit",
    "source_url": "https://www.facebook.com/groups/2k5ptit/posts/1282332907309217",
    "content": "Mọi người ơi, cho tớ xin chút lời khuyên với... Nhưng dạo gần đây, mọi thứ lạnh nhạt đi hẳn. Tần suất nhắn tin thưa dần, những câu chuyện cứ ngắn ngủn và kết thúc trong sự hụt hẫng. Tớ buồn lắm mà con gái thì ngại ngùng, không dám mở lời trước vì sợ bản thân trở nên phiền phức. Theo mọi người, … Xem thêm",
    "author": "Người tham gia ẩn danh",
    "likes": 115,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 08:12",
    "engagement_score": 115,
    "created_at": "2026-09-22T08:16:49.500Z",
    "rank": 4,
    "is_top_week": true
  },
  {
    "id": "live_2k5ptit_9_1790065009499",
    "source_group": "Cộng đồng sinh viên PTIT (CĐ SV)",
    "group_id": "2k5ptit",
    "source_url": "https://www.facebook.com/groups/2k5ptit/posts/1282728217269686",
    "content": "xe mới đấy nhể chắc chưa bị bẻ cổ phát nào",
    "author": "messilovebaycho",
    "likes": 107,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 17:58",
    "engagement_score": 107,
    "created_at": "2026-09-22T08:16:49.499Z",
    "rank": 5,
    "is_top_week": true
  },
  {
    "id": "live_408571091380061_0_1790065040961",
    "source_group": "Góc thông tin PTIT",
    "group_id": "408571091380061",
    "source_url": "https://www.facebook.com/groups/408571091380061/posts/1451908050379688",
    "content": "Chính thức ra mắt CLB LGBT - Luôn Giữ Bình Tĩnh Thông Tin: CLB do cá nhân thành lập không liên kết với bất kỳ đơn vị hay nhà trường nào Mục đích: Tạo sân chơi kết nốt các bạn Luôn Giữ Bình Tĩnh 7 Trường ĐH và Học Viện trong khu vực Từ Hầm Chui Thanh Xuân - Nguyễn Trãi đến Hết Đường Trần Phú",
    "author": "Dr.Chạm",
    "likes": 424,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 01:39",
    "engagement_score": 424,
    "created_at": "2026-09-22T08:17:20.961Z",
    "rank": 1,
    "is_top_week": true
  },
  {
    "id": "live_408571091380061_24_1790065040961",
    "source_group": "Góc thông tin PTIT",
    "group_id": "408571091380061",
    "source_url": "https://www.facebook.com/groups/408571091380061/posts/1450797463824080",
    "content": "Bên hust căng quá",
    "author": "Người tham gia ẩn danh",
    "likes": 84,
    "comments": 1,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 20:46",
    "engagement_score": 86,
    "created_at": "2026-09-22T08:17:20.961Z",
    "rank": 2,
    "is_top_week": true
  },
  {
    "id": "live_408571091380061_15_1790065040961",
    "source_group": "Góc thông tin PTIT",
    "group_id": "408571091380061",
    "source_url": "https://www.facebook.com/groups/408571091380061/posts/1452610500309443",
    "content": "FC PTIT CHÍNH THỨC RA QUÂN TẠI SV7 THIÊN KHÔI CUP 2026! Hành trình của những chàng trai CLB Bóng đá Bưu chính – FC PTIT tại SV7 Thiên Khôi Cup 2026 sẽ chính thức bắt đầu vào sáng mai, với đối thủ đầu tiên là Đại học FPT. 09:45 | 22/09/2026 FC PTIT Đại học FPT SVĐ C500 – Hà Đông – Hà Nội Một trận … Xem thêm",
    "author": "Viết Chiến",
    "likes": 45,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 21:45",
    "engagement_score": 45,
    "created_at": "2026-09-22T08:17:20.961Z",
    "rank": 3,
    "is_top_week": true
  },
  {
    "id": "live_408571091380061_25_1790065040961",
    "source_group": "Góc thông tin PTIT",
    "group_id": "408571091380061",
    "source_url": "https://www.facebook.com/groups/408571091380061/posts/1452586276978532",
    "content": "Aura quá yếu? - Bạn muốn có một aura(bá khí) thật mạnh nhưng bản thân không thể toát ra được - Hãy thử những cách sau để gia tăng bá khí lên mức cao",
    "author": "Lan Trịnh",
    "likes": 39,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 21:17",
    "engagement_score": 39,
    "created_at": "2026-09-22T08:17:20.961Z",
    "rank": 4,
    "is_top_week": true
  },
  {
    "id": "live_408571091380061_23_1790065040961",
    "source_group": "Góc thông tin PTIT",
    "group_id": "408571091380061",
    "source_url": "https://www.facebook.com/groups/408571091380061/posts/1452539773649849",
    "content": "Mn cho mình hỏi bằng khá có lên skhau nhận bằng ko\n hay chỉ giỏi với xs ạ",
    "author": "Người tham gia ẩn danh",
    "likes": 15,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 22:48",
    "engagement_score": 15,
    "created_at": "2026-09-22T08:17:20.961Z",
    "rank": 5,
    "is_top_week": true
  },
  {
    "id": "live_1605563914144178_17_1790065072825",
    "source_group": "Group D26 PTIT (2k8)",
    "group_id": "1605563914144178",
    "source_url": "https://www.facebook.com/groups/1605563914144178/posts/1819248096109091",
    "content": "Cập nhật tình hình PTIT hiện tạiii\n cháy thí nhỏ",
    "author": "Thu Phương",
    "likes": 133,
    "comments": 0,
    "timestamp": "Thứ Sáu, 18 Tháng 9, 2026 lúc 23:21",
    "engagement_score": 133,
    "created_at": "2026-09-22T08:17:52.825Z",
    "rank": 1,
    "is_top_week": true
  },
  {
    "id": "live_1605563914144178_8_1790065072825",
    "source_group": "Group D26 PTIT (2k8)",
    "group_id": "1605563914144178",
    "source_url": "https://www.facebook.com/groups/1605563914144178/posts/1821466195887281",
    "content": "Tân sinh viên của hiện tại: 1 tuần về quê với mẹ 1 lần",
    "author": "Đặng HồngAnh",
    "likes": 34,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 13:14",
    "engagement_score": 34,
    "created_at": "2026-09-22T08:17:52.825Z",
    "rank": 2,
    "is_top_week": true
  },
  {
    "id": "live_1605563914144178_20_1790065072825",
    "source_group": "Group D26 PTIT (2k8)",
    "group_id": "1605563914144178",
    "source_url": "https://www.facebook.com/groups/1605563914144178/posts/1819084869458747",
    "content": "Vâng rấtt ngay đâyy thôi",
    "author": "Mai Phạm Diễm Quỳnh",
    "likes": 22,
    "comments": 0,
    "timestamp": "Thứ Sáu, 18 Tháng 9, 2026 lúc 18:44",
    "engagement_score": 22,
    "created_at": "2026-09-22T08:17:52.825Z",
    "rank": 3,
    "is_top_week": true
  },
  {
    "id": "live_1605563914144178_16_1790065072825",
    "source_group": "Group D26 PTIT (2k8)",
    "group_id": "1605563914144178",
    "source_url": "https://www.facebook.com/groups/1605563914144178/posts/1817314092969158",
    "content": "em được 685 TADV thì em được miễn những course nào ạ",
    "author": "Quốc Thanh",
    "likes": 18,
    "comments": 1,
    "timestamp": "Thứ Năm, 17 Tháng 9, 2026 lúc 07:32",
    "engagement_score": 20,
    "created_at": "2026-09-22T08:17:52.825Z",
    "rank": 4,
    "is_top_week": true
  },
  {
    "id": "live_1605563914144178_0_1790065072825",
    "source_group": "Group D26 PTIT (2k8)",
    "group_id": "1605563914144178",
    "source_url": "https://www.facebook.com/groups/1605563914144178/posts/1822288609138373",
    "content": "Sinh viên chắc chắn sẽ cần Nhắn c add nhóm hỗ trợ sv săn hbong nha",
    "author": "Mai Phạm Diễm Quỳnh",
    "likes": 16,
    "comments": 0,
    "timestamp": "Thứ Ba, 22 Tháng 9, 2026 lúc 10:13",
    "engagement_score": 16,
    "created_at": "2026-09-22T08:17:52.825Z",
    "rank": 5,
    "is_top_week": true
  },
  {
    "id": "live_confessions.ptit_11_1790065106482",
    "source_group": "PTIT Confessions (PTIT CFS)",
    "group_id": "confessions.ptit",
    "source_url": "https://www.facebook.com/groups/confessions.ptit/posts/1460408159277014",
    "content": "TÔI ở phòng 504 ktx B5 hôm nay lên đây tuyển bạn gái anime : yêu cầu : -biết nói tiếng nhật -biết cosplay",
    "author": "vuatoan2k8",
    "likes": 29,
    "comments": 0,
    "timestamp": "Thứ Năm, 17 Tháng 9, 2026 lúc 23:53",
    "engagement_score": 29,
    "created_at": "2026-09-22T08:18:26.482Z",
    "rank": 1,
    "is_top_week": true
  },
  {
    "id": "live_confessions.ptit_6_1790065106482",
    "source_group": "PTIT Confessions (PTIT CFS)",
    "group_id": "confessions.ptit",
    "source_url": "https://www.facebook.com/groups/confessions.ptit/posts/1463338858983944",
    "content": "Cần tìm một bạn nam làm người yêu đi chơi trung thu qua trung thu chia tay",
    "author": "Người tham gia ẩn danh",
    "likes": 23,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 19:54",
    "engagement_score": 23,
    "created_at": "2026-09-22T08:18:26.482Z",
    "rank": 2,
    "is_top_week": true
  },
  {
    "id": "live_confessions.ptit_3_1790065106482",
    "source_group": "PTIT Confessions (PTIT CFS)",
    "group_id": "confessions.ptit",
    "source_url": "https://www.facebook.com/groups/confessions.ptit/posts/1463352572315906",
    "content": "Hi tâm sự xíu đc khum. Mình và người yêu quen nhau được 2 năm. Tình cảm thì vẫn còn, tụi mình cũng từng rất nghiêm túc với nhau. Nhưng dạo gần đây, hai đứa bắt đầu bất đồng khá nhiều về chuyện thân mật. Mình thì chưa thật sự sẵn sàng. Mình muốn giữ những giới hạn mà bản thân cảm thấy an toàn và thoải mái. Còn anh ấy lại nghĩ chuyện đó rất quan trọng trong một mối quan hệ, kiểu yêu nhau lâu rồi thì nên có sự gần gũi hơn. Điều làm mình dằn vặt nhất",
    "author": "Người tham gia ẩn danh",
    "likes": 17,
    "comments": 0,
    "timestamp": "Thứ Hai, 21 Tháng 9, 2026 lúc 17:23",
    "engagement_score": 17,
    "created_at": "2026-09-22T08:18:26.482Z",
    "rank": 3,
    "is_top_week": true
  },
  {
    "id": "live_confessions.ptit_7_1790065106482",
    "source_group": "PTIT Confessions (PTIT CFS)",
    "group_id": "confessions.ptit",
    "source_url": "https://www.facebook.com/groups/confessions.ptit/posts/1463453115639185",
    "content": "Cho em xin intu anh đẹp zai aura này với ạ, thấy ảnh đứng 1 mình ngầu quá",
    "author": "Người tham gia ẩn danh",
    "likes": 16,
    "comments": 0,
    "timestamp": "Thứ Ba, 22 Tháng 9, 2026 lúc 10:52",
    "engagement_score": 16,
    "created_at": "2026-09-22T08:18:26.482Z",
    "rank": 4,
    "is_top_week": true
  },
  {
    "id": "live_confessions.ptit_17_1790065106482",
    "source_group": "PTIT Confessions (PTIT CFS)",
    "group_id": "confessions.ptit",
    "source_url": "https://www.facebook.com/groups/confessions.ptit/posts/1461916485792848",
    "content": "[OFFLINE]\nGIẢI ĐẤU FREE FIRE SINH VIÊN HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG\nHOÀN TOÀN KHÔNG CÓ LỆ PHÍ KHI THAM GIA\nĐây không chỉ là giải đấu… đây còn là sân chơi để sinh viên HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG giao lưu, thể hiện kỹ năng và săn thưởng kim cương cực đỉnh!\n TH… Xem thêm",
    "author": "Phuc Xuan",
    "likes": 15,
    "comments": 0,
    "timestamp": "Chủ Nhật, 20 Tháng 9, 2026 lúc 00:10",
    "engagement_score": 15,
    "created_at": "2026-09-22T08:18:26.482Z",
    "rank": 5,
    "is_top_week": true
  }
];

function initDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      trends: { google: [], tiktok: [], threads: [] },
      group_posts: INITIAL_GROUP_POSTS,
      saved_ideas: [],
      settings: {
        geminiApiKey: process.env.GEMINI_API_KEY || '',
        autoRefreshMinutes: 120,
        model: 'gemini-2.5-flash'
      },
      last_updated: new Date().toISOString()
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

function readData() {
  initDB();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.group_posts || data.group_posts.length < 6) {
      data.group_posts = INITIAL_GROUP_POSTS;
      writeData(data);
    }
    return data;
  } catch (err) {
    console.error('Error reading store.json:', err);
    return {
      trends: { google: [], tiktok: [], threads: [] },
      group_posts: INITIAL_GROUP_POSTS,
      saved_ideas: [],
      settings: { geminiApiKey: '', autoRefreshMinutes: 120, model: 'gemini-2.5-flash' },
      last_updated: null
    };
  }
}

function writeData(data) {
  try {
    initDB();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to store.json:', err);
  }
}

module.exports = {
  getTrends(platform) {
    const data = readData();
    if (platform) return data.trends[platform] || [];
    return data.trends;
  },

  setTrends(platform, items) {
    const data = readData();
    data.trends[platform] = items;
    data.last_updated = new Date().toISOString();
    writeData(data);
    return items;
  },

  getGroupPosts() {
    const data = readData();
    return data.group_posts || [];
  },

  addGroupPost(post) {
    const data = readData();
    if (!data.group_posts) data.group_posts = [];
    const newPost = {
      id: 'grp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      source_group: post.source_group || 'Cộng đồng sinh viên PTIT',
      group_id: post.group_id || '2k5ptit',
      source_url: post.source_url || 'https://www.facebook.com/groups/2k5ptit',
      content: post.content || '',
      author: post.author || 'Sinh viên PTIT',
      created_at: new Date().toISOString(),
      likes: post.likes || 15,
      comments: post.comments || 8,
      tag: post.tag || 'Thảo luận',
      is_top_week: false
    };
    data.group_posts.unshift(newPost);
    writeData(data);
    return newPost;
  },

  deleteGroupPost(id) {
    const data = readData();
    data.group_posts = (data.group_posts || []).filter(p => p.id !== id);
    writeData(data);
  },

  updateGroupPost(id, updatedFields) {
    const data = readData();
    data.group_posts = (data.group_posts || []).map(p => {
      if (p.id === id) {
        return { ...p, ...updatedFields };
      }
      return p;
    });
    writeData(data);
  },

  getSavedIdeas() {
    const data = readData();
    return data.saved_ideas || [];
  },

  saveIdea(idea) {
    const data = readData();
    if (!data.saved_ideas) data.saved_ideas = [];
    const newIdea = {
      id: 'idea_' + Date.now(),
      title: idea.title || 'Ý tưởng Anti PTIT',
      angle: idea.angle || 'Tự trào',
      strategy: idea.strategy || '',
      caption: idea.caption || '',
      visual: idea.visual || '',
      target_channel: idea.target_channel || 'Fanpage Anti PTIT',
      source_topic: idea.source_topic || '',
      created_at: new Date().toISOString()
    };
    data.saved_ideas.unshift(newIdea);
    writeData(data);
    return newIdea;
  },

  deleteIdea(id) {
    const data = readData();
    data.saved_ideas = (data.saved_ideas || []).filter(i => i.id !== id);
    writeData(data);
  },

  getSettings() {
    const data = readData();
    return data.settings || {};
  },

  updateSettings(newSettings) {
    const data = readData();
    data.settings = { ...data.settings, ...newSettings };
    writeData(data);
    return data.settings;
  }
};
