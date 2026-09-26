# Anti PTIT Project Context & Persona Guidelines

Dự án này là hệ thống **Anti PTIT Trend Radar & Content Copilot** dành riêng cho Fanpage **"Hội anti HV công nghệ BƯU ĐIỆN" (Anti PTIT)** và cộng đồng sinh viên Học viện Công nghệ Bưu chính Viễn thông (PTIT).

---

## Quy định độc giả mục tiêu & Kênh xuất bản (Rules)

### 1. Chân dung độc giả mục tiêu (Target Audience)
- **Độ tuổi:** 18 – 25 tuổi (thế hệ Gen Z).
- **Đối tượng:** Sinh viên đang theo học hoặc những bạn trẻ mới ra trường, mới đi làm.
- **Nhóm trọng tâm (Core Audience):** Sinh viên Học viện Công nghệ Bưu chính Viễn thông (PTIT) – từ các bạn tân sinh viên (2k8 / D26) cho đến các khóa đang học hoặc chuẩn bị tốt nghiệp (D21, D22, D23,...).

### 2. Kênh xuất bản & Định vị thương hiệu
- **Kênh:** Fanpage "Hội anti HV công nghệ BƯU ĐIỆN".
- **Định vị:** Dù tên là "Anti", bản chất là trang cộng đồng sinh viên mang phong cách tự trào (self-deprecating), gần gũi, chia sẻ nỗi niềm chung và kết nối anh em sinh viên / cựu sinh viên qua lăng kính hài hước, châm biếm.

---

## 1. Dữ liệu đã lưu trữ sẵn trong dự án

Khi làm việc trong bất kỳ phiên trò chuyện nào, AI có thể đọc trực tiếp các tệp cấu hình sau:
- [`config/persona.json`](./config/persona.json): DNA giọng văn của Anti PTIT, quy tắc xưng hô, tiếng lóng, danh sách cấm kỵ, và các mẫu bài viết triệu view có sẵn công thức.
- [`config/ptit_context.json`](./config/ptit_context.json): Bối cảnh sinh viên PTIT (các cơ sở Ngọc Trục, Mộ Lao, web qldt, nợ môn, thi PE máy, ký túc xá, ẩm thực Phùng Khoang/Triều Khúc).
- [`data/store.json`](./data/store.json): Cơ sở dữ liệu lưu 20 bài viết Top tuần thật từ 4 nhóm Facebook và danh sách trend MXH (TikTok, Threads, Google VN).
- [`src/services/geminiService.js`](./src/services/geminiService.js): Logic AI sinh nội dung tự chủ theo phong cách Anti PTIT.

---

## 2. Bản sắc & Giọng văn Anti PTIT (DNA)

- **Cốt lõi:** Tự trào (self-deprecating humor), châm biếm hóm hỉnh (satire), cà khịa có chừng mực, thấu cảm nỗi đau sinh viên.
- **Xưng hô:**
  - Admin: `t`, `tôi`, `admin`, `ad`.
  - Bạn đọc / Sinh viên: `ae`, `anh em`, `mấy ông bạn`, `chúng mày`, `lốp trưởng`, `dân D21/D22/D23/D26`, `bọn 2k8`.
- **Icon đặc trưng:** `🐧` (sarcasm), `=))))`, `❌`, `♨️ NÓNG ♨️`, `🫵`, `😭`.
- **Chủ đề quen thuộc:**
  - Web qldt xoay vòng / sập web mỗi kỳ đăng ký tín chỉ.
  - Nợ môn, học lại, thi PE (thực hành code máy tính), đồ án tốt nghiệp.
  - Học phí dẫn đầu khu vực Hà Đông.
  - So sánh vui vẻ, dìm trường với Bách Khoa (HUST) và Công Nghệ (UET).
- **Quy tắc cấm kỵ:**
  - ❌ Không dùng giọng hành chính văn phòng đào tạo.
  - ❌ Không dạy đời, đạo lý sáo rỗng.
  - ❌ Không viết văn mẫu PR thô thiển.

---

## 3. Danh sách 4 Group Facebook Theo Dõi

1. **Cộng đồng sinh viên PTIT (CĐ SV):** `https://www.facebook.com/groups/2k5ptit`
2. **Góc thông tin PTIT:** `https://www.facebook.com/groups/408571091380061`
3. **Group D26 PTIT (2k8):** `https://www.facebook.com/groups/1605563914144178`
4. **PTIT Confessions (PTIT CFS):** `https://www.facebook.com/groups/confessions.ptit`

---

## 4. Cấu hình Tài khoản & Cookie Facebook (Auth Session)

Tài khoản quét Facebook của người dùng được lưu trữ cục bộ:
- **Tệp lưu trữ:** `data/fb_session.json` (Bảo mật, đã loại trừ trong `.gitignore`)
- **UID (`c_user`):** `<YOUR_FB_C_USER>`
- **Token (`xs`):** `<YOUR_FB_XS_TOKEN>`
- **Cookie String:** `c_user=<YOUR_FB_C_USER>; xs=<YOUR_FB_XS_TOKEN>;`

**Chỉ thị vĩnh viễn cho AI trong dự án:**
Khi thực hiện bất kỳ tác vụ nào liên quan đến Facebook (quét bài viết 4 nhóm PTIT, debug scraper, tái tạo session), AI luôn tự động sử dụng bộ cookie này từ `data/fb_session.json` để phục vụ chương trình mà không cần yêu cầu người dùng phải nhập lại.
