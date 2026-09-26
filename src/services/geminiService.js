const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const PERSONA_FILE = path.join(__dirname, '../../config/persona.json');
const CONTEXT_FILE = path.join(__dirname, '../../config/ptit_context.json');

function loadConfig() {
  let persona = {};
  let context = {};
  try {
    if (fs.existsSync(PERSONA_FILE)) {
      persona = JSON.parse(fs.readFileSync(PERSONA_FILE, 'utf-8'));
    }
    if (fs.existsSync(CONTEXT_FILE)) {
      context = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading persona/context:', err);
  }
  return { persona, context };
}

function buildSystemPrompt(persona, context) {
  return `Bạn là Trợ lý Chiến lược Nội dung kiêm Cây bút chủ lực của Fanpage "Hội anti HV công nghệ BƯU ĐIỆN" (Anti PTIT) và Group cộng đồng sinh viên PTIT.

TỆP KHÁN GIẢ:
Sinh viên đại học PTIT (18-23 tuổi), chủ yếu là khối CNTT, An toàn thông tin, Điện tử viễn thông, Đa phương tiện, Marketing/TMĐT.

NGUYÊN TẮC VĂN PHONG ANTI PTIT (DNA):
- Cốt lõi: Tự trào (self-deprecating humor), châm biếm hóm hỉnh (satire), cà khịa có chừng mực, thấu cảm nỗi đau chung.
- Xưng hô: Admin xưng "t", "tôi", "admin", "ae", "mấy ông bạn". Gọi sinh viên: "chúng mày", "bọn 2k8", "dân D21/D22/D23/D26", "lốp trưởng".
- Icon quen thuộc: 🐧 (sarcasm), =)))) (cười lộn ruột), ❌, ♨️ NÓNG ♨️, 🫵, 😭.
- ĐẶC SẢN PTIT: Web qldt (sập web, quay đều), nợ môn, học lại, thi PE (code máy), đồ án, học phí dẫn đầu khu vực, khu Phùng Khoang, Mộ Lao, bus 01, 02 Nguyễn Trãi, so sánh vui vẻ với Bách Khoa / UET.
- CẤM: Không viết giọng hành chính văn phòng đào tạo; không dạy đời sáo rỗng; không dùng văn mẫu PR thô thiển.

NGUYÊN TẮC SÁNG TẠO TỰ CHỦ (KHÔNG BỊ GÒ BÓ KHUÔN MẪU):
1. TỰ ĐÁNH GIÁ NỘI DUNG:
   - Hãy phân tích bản chất của tin tức/trend này: Nó chạm vào cảm xúc gì của sinh viên PTIT? (Cay cú, cười ỉa, lo sợ nợ môn, tự hào ngầm, hóng hớt drama, hay bức xúc học phí?).
   - Tự quyết định xem với nội dung này, HƯỚNG TRIỂN KHAI NÀO LÀ HIỆU QUẢ VÀ ĐẮT GIÁ NHẤT?
2. KHÔNG GÒ BÓ TRONG 3 HƯỚNG CỐ ĐỊNH:
   - Tùy thuộc vào nội dung, bạn có thể đưa ra 1 phương án duy nhất (nếu tin đó chỉ cần 1 cú đấm meme chí mạng) hoặc 2 phương án có góc nhìn đối lập đắt giá.
   - Hướng tiếp cận hoàn toàn do bạn tự định nghĩa (ví dụ: 'Meme châm biếm sâu cay', 'Tâm sự trải lòng sinh viên', 'Cà khịa trường bạn', 'Bóc phốt hài hước', 'Minigame / Thách thức Group', 'Cảnh báo kiếp nạn tân sinh viên'...).`;
}

async function generateContent({ topic, description, source, platform }) {
  const { persona, context } = loadConfig();
  const settings = db.getSettings();
  const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;

  const prompt = `Dưới đây là nội dung cần phân tích và chuyển hóa:
- Chủ đề: ${topic}
- Nội dung chi tiết: ${description || ''}
- Nguồn / Nền tảng: ${platform || 'MXH'} (${source || ''})

Hãy thực hiện:
1. Đánh giá chiến lược: Phân tích nhanh tại sao tin này quan trọng với sinh viên PTIT và nên tiếp cận thế nào.
2. Quyết định hướng triển khai tối ưu: Tự chọn 1 đến 2 hướng viết phù hợp nhất (không bị gò bó vào bất kỳ khuôn mẫu cố định nào).

Trả về DUY NHẤT định dạng JSON (không có markdown code block) theo cấu trúc:
{
  "assessment": {
    "student_insight": "Phân tích tâm lý sinh viên PTIT trước tin này...",
    "recommended_approach": "Lý do quyết định chọn hướng tiếp cận bên dưới..."
  },
  "plans": [
    {
      "direction_name": "Tên hướng tiếp cận do AI tự đặt (ví dụ: Meme tự trào / Bóc phốt hài hước / Tâm sự thấu cảm...)",
      "strategy": "Tại sao hướng này sẽ bão tương tác?",
      "hook": "Tiêu đề giật tít ngắn gọn",
      "caption": "Nội dung bài viết hoàn chỉnh chuẩn văn phong Anti PTIT sẵn sàng copy...",
      "visual_idea": {
        "type": "Meme Template / Screenshot / Ảnh đời thực / Video ngắn",
        "description": "Mô tả cụ thể hình ảnh hoặc video...",
        "text_on_image": "Chữ in đè lên ảnh (nếu có)"
      },
      "target_channel": "Fanpage Anti PTIT hoặc Group Hội Anti PTIT"
    }
  ]
}`;

  if (!apiKey) {
    return generateDynamicFallback(topic, description, platform);
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(persona, context) }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error response:', errText);
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (replyText) {
      const parsed = JSON.parse(replyText);
      return parsed;
    }
    throw new Error('No content returned from Gemini');
  } catch (error) {
    console.error('Failed to call Gemini API, using dynamic fallback:', error.message);
    return generateDynamicFallback(topic, description, platform, error.message);
  }
}

function generateDynamicFallback(topic, description, platform, errorNote = null) {
  const lower = (topic + ' ' + (description || '')).toLowerCase();
  
  // Dynamic decision based on topic
  let direction1 = 'Tự trào & Sarcasm thương hiệu';
  let hook1 = '❌ CÂU CHUYỆN KHÔNG CỦA RIÊNG AI ❌';
  let caption1 = `Nghe bảo ae đang xôn xao vụ: "${topic}".\n\nNhưng ở Học viện hoàng gia - nơi có công nghệ tiết kiệm điện và hệ thống qldt quay đều theo nhịp thở của đất trời, chúng tôi đã trải nghiệm cảm giác này từ lâu rồi 🐧\n\nĐứa nào kỳ này đang nợ môn hoặc đang mắc kẹt ở Phùng Khoang thì điểm danh cái cho có bạn bè nào =))))`;
  let visual1 = {
    type: 'Meme Template',
    description: 'Ảnh meme Cheems hoặc người đàn ông ôm đầu bất lực trước màn hình máy tính đang xoay vòng loading.',
    text_on_image: 'Khi bạn tưởng đời đã đủ áp lực, thì trường lại tạo thêm bất ngờ...'
  };

  let direction2 = 'Góc thảo luận kéo cmt Group';
  let hook2 = '[GÓC ĐIỀU TRA DÀNH CHO DÂN BƯU CHÍNH]';
  let caption2 = `Vừa hóng được quả tin chấn động:\n"${topic}"\n\nThực hư thế nào ae? Có đồng chí nào trong trường từng trải qua kiếp nạn này chưa, vào group giải trình cho admin nghe phát 🫵`;
  let visual2 = {
    type: 'Ảnh chụp màn hình thực tế',
    description: 'Chụp lại bình luận hoặc bài post hóng hớt trong group sinh viên, che tên nhân vật.',
    text_on_image: 'Kiếp nạn không của riêng ai...'
  };

  if (lower.includes('qldt') || lower.includes('tín chỉ')) {
    direction1 = 'Cà khịa huyền thoại sập server qldt';
    hook1 = '♨️ LỊCH SỬ KHÔNG TỰ NHIÊN SINH RA ♨️';
    caption1 = `12h trưa mai mở cổng tín chỉ, và kịch bản quen thuộc lại chuẩn bị diễn ra:\n11h59: Mạng FPT cáp quang 1Gbps, tinh thần chiến binh.\n12h00: "502 Bad Gateway" - Trang web hiện không phản hồi.\n12h05: Hết sạch slot thể chất và tiếng anh, chỉ còn slot Triết học lúc 7h sáng thứ 2 =))))\n\nChúc các dũng sĩ D21, D22, D23 sống sót qua kiếp nạn này 🐧`;
    visual1 = {
      type: 'Ảnh chụp màn hình (Screenshot)',
      description: 'Ảnh chụp màn hình web qldt xoay tròn vô tận kèm đồng hồ đếm ngược 12:00.',
      text_on_image: 'Vòng quay may mắn của sinh viên Bưu Điện'
    };
  } else if (lower.includes('học phí') || lower.includes('tiền')) {
    direction1 = 'Tự trào dẫn đầu học phí khu vực';
    hook1 = 'TRƯỜNG BƯU ĐIỆN TIẾP TỤC DẪN ĐẦU...';
    caption1 = `Tiếp tục giữ vững vị trí dẫn đầu... học phí trong khu vực! Năm nay tiếp tục tăng đều đặn, chỉ có cơ sở vật chất là trường tồn cùng thời gian 🤬\n\nĐứa nào kỳ này GPA 3.0 muốn đòi học bổng thì lên trường nhé, mỗi đứa nhận 1 bao tải =))))\n\n#AntiPTIT #HocVienHoangGia`;
    visual1 = {
      type: 'Meme bao tải',
      description: 'Ảnh đống bao tải xếp chồng lên nhau ở hành lang nhà trường.',
      text_on_image: 'Học bổng kỳ này: Mỗi đứa 1 bao'
    };
  }

  return {
    assessment: {
      student_insight: `Nội dung về "${topic}" đánh trúng vào tâm lý quan tâm sát sườn của sinh viên PTIT. Tùy thuộc vào mức độ bức xúc hay hài hước, AI quyết định hướng triển khai bên dưới.`,
      recommended_approach: errorNote ? `Đang chạy bộ phân tích nội dung Anti PTIT. Cấu hình Gemini API Key để tùy biến AI mở rộng: ${errorNote}` : `Tự động chọn 2 phương án sắc bén nhất: 1 bài đánh vào Fanpage để kéo share, 1 bài hướng về Group để kích hoạt tranh luận.`
    },
    plans: [
      {
        direction_name: direction1,
        strategy: 'Đánh vào nỗi đau chung của sinh viên để tạo tiếng cười tự trào, thúc đẩy lượt Haha và Share.',
        hook: hook1,
        caption: caption1,
        visual_idea: visual1,
        target_channel: 'Fanpage Anti PTIT'
      },
      {
        direction_name: direction2,
        strategy: 'Đặt câu hỏi mở kích thích sinh viên vào cmt trần tình và tag bạn bè cùng lớp.',
        hook: hook2,
        caption: caption2,
        visual_idea: visual2,
        target_channel: 'Group Hội Anti PTIT'
      }
    ]
  };
}

module.exports = {
  generateContent
};
