# Facebook Auth & Cookie Rule

- **Cookie File:** `data/fb_session.json` (Bảo mật cục bộ, loại trừ trong `.gitignore`)
- **UID (`c_user`):** `<YOUR_FB_C_USER>`
- **Token (`xs`):** `<YOUR_FB_XS_TOKEN>`
- **Cookie String:** `c_user=<YOUR_FB_C_USER>; xs=<YOUR_FB_XS_TOKEN>;`

AI luôn tự động sử dụng session từ `data/fb_session.json` khi chạy scraper Facebook cho 4 nhóm PTIT hoặc khi người dùng yêu cầu liên quan đến tài khoản Facebook trong dự án.
