# Anti PTIT Trend Radar & Content Copilot 🐧

Hệ thống theo dõi xu hướng đa nền tảng (TikTok, Threads, Google Trends, Facebook Groups) và trợ lý sáng tạo nội dung tự động chuẩn phong cách **Anti PTIT** dành cho Fanpage *"Hội anti HV công nghệ BƯU ĐIỆN"*.

---

## 🌟 Tính năng nổi bật

- 📡 **Trend Radar đa nguồn:**
  - Quét & phân tích video thịnh hành trên TikTok (hỗ trợ phân tích video sâu, phát hiện trend, Creative Center).
  - Quét bài viết nổi bật trên Threads & Google Trends Việt Nam.
  - Tự động theo dõi các bài viết tương tác cao từ 4 nhóm cộng đồng PTIT trọng điểm.
- ✍️ **AI Content Copilot (Gemini API):**
  - Sinh nội dung tự động chuẩn DNA Anti PTIT: tự trào (*self-deprecating*), hài hước châm biếm, thấu hiểu insight sinh viên (đăng ký tín chỉ, qldt xoay vòng, PE máy, nợ môn, học phí Hà Đông).
  - Đa dạng góc tiếp cận (*angles*), cấu trúc bài viết chuẩn viral.
- 🖥️ **Giao diện trực quan:**
  - Dashboard quản lý trend, xem bài viết, duyệt & chỉnh sửa nội dung dễ dàng.
  - Báo cáo phân tích xu hướng trực quan dưới dạng HTML.

---

## 🚀 Cài đặt & Cấu hình

### 1. Yêu cầu hệ thống
- [Node.js](https://nodejs.org/) (phiên bản 18+ khuyến nghị)
- [Git](https://git-scm.com/)

### 2. Cài đặt dự án
```bash
git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
cd "Update tin tức"
npm install
```

### 3. Cấu hình môi trường (.env)
Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```
Điền các giá trị cần thiết vào `.env`:
```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Cấu hình Facebook Session (Tùy chọn)
Để cho phép bot quét bài viết từ các nhóm Facebook:
1. Chạy lệnh thiết lập tự động:
   ```bash
   npm run setup-fb
   ```
2. Hoặc copy file mẫu `data/fb_session.example.json` thành `data/fb_session.json` và điền cookie tài khoản của bạn:
   ```bash
   cp data/fb_session.example.json data/fb_session.json
   ```

> ⚠️ **LƯU Ý BẢO MẬT:** File `.env` và `data/fb_session.json` chứa thông tin nhạy cảm đã được loại trừ tự động trong `.gitignore`. Tuyệt đối không xóa khỏi `.gitignore` để tránh rò rỉ token.

---

## 🖥️ Hướng dẫn sử dụng

- **Khởi động nhanh trên Windows:** Click đúp vào file `start.bat`.
- **Khởi động bằng dòng lệnh:**
  ```bash
  npm start
  ```
  Truy cập giao diện tại: `http://localhost:3000` hoặc mở trực tiếp `start.html`.

---

## 📂 Cấu trúc thư mục

```text
├── config/             # Cấu hình persona, bối cảnh PTIT & watchlist
│   ├── persona.json    # DNA giọng văn, icon, từ lóng Anti PTIT
│   └── ptit_context.json # Ngữ cảnh trường viện, cơ sở, văn hóa PTIT
├── data/               # Dữ liệu cache, kết quả quét (đã gitignore session)
├── public/             # Giao diện web frontend
├── scripts/            # Các công cụ script quét & tạo báo cáo
├── src/
│   ├── modules/        # Module quét TikTok, Threads, Facebook
│   ├── services/       # Service tích hợp Gemini AI & logic xử lý
│   └── server.js       # Máy chủ Express API
├── tests/              # Bộ kiểm thử tự động
├── start.bat           # File khởi chạy 1-click cho Windows
└── README.md
```

---

## 🛡️ Bản quyền & Miễn trừ trách nhiệm

Dự án phục vụ mục đích học tập, nghiên cứu và hỗ trợ quản trị nội dung giải trí cộng đồng sinh viên. Tác giả không chịu trách nhiệm về mục đích sử dụng ngoài phạm vi này.
