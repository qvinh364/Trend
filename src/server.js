require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// ─── 3 MODULE RIÊNG BIỆT HOÀN TOÀN ĐỘC LẬP ───────────────────
const facebookModule = require('./modules/facebook');
const tiktokModule = require('./modules/tiktok');
const threadsModule = require('./modules/threads');
const reportAggregator = require('./reporting/reportAggregator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Trạng thái quét dữ liệu thời gian thực độc lập cho từng luồng
const scanProgress = {
  groups: { isRunning: false, message: '', percent: 0, lastRun: null, error: null },
  tiktok: { isRunning: false, message: '', percent: 0, lastRun: null, error: null },
  threads: { isRunning: false, message: '', percent: 0, lastRun: null, error: null }
};

// ─── 1. BÁO CÁO ĐẦU RA TỔNG HỢP (REPORTING AGGREGATOR) ─────────
app.get('/api/report', (req, res) => {
  const report = reportAggregator.getDashboardReport();
  res.json(report);
});

app.get('/api/stats', (req, res) => {
  const stats = reportAggregator.getOverviewStats();
  res.json({ success: true, data: stats });
});

app.get('/api/scan-status', (req, res) => {
  res.json({
    success: true,
    data: scanProgress
  });
});

// ─── 2. PHÂN HỆ FACEBOOK (SINH VIÊN PTIT) ──────────────────────
app.get('/api/group-posts', (req, res) => {
  const posts = facebookModule.getMonitoredPosts();
  res.json({ success: true, data: posts });
});

// Nút Quét 4 Group Facebook riêng
app.post('/api/groups/scrape-live', async (req, res) => {
  if (scanProgress.groups.isRunning) {
    return res.json({ success: false, message: 'Bot đang trong quá trình quét nhóm Facebook, vui lòng đợi!' });
  }

  scanProgress.groups = { isRunning: true, message: 'Đang chuẩn bị quét 4 Group Facebook...', percent: 5, lastRun: new Date().toISOString(), error: null };

  facebookModule.scrapeAllGroupsLive(25, (prog) => {
    scanProgress.groups.message = prog.message;
    scanProgress.groups.percent = prog.percent;
  }).then(result => {
    scanProgress.groups.isRunning = false;
    scanProgress.groups.percent = 100;
    scanProgress.groups.message = `✅ Hoàn tất! Đã thu thập ${result.count || 20} bài viết nổi bật.`;
    scanProgress.groups.lastRun = new Date().toISOString();
  }).catch(err => {
    scanProgress.groups.isRunning = false;
    scanProgress.groups.error = err.message;
    scanProgress.groups.message = `❌ Lỗi quét nhóm: ${err.message}`;
  });

  res.json({ success: true, message: 'Đã bắt đầu tiến trình quét 4 Group Facebook!' });
});

// Quản lý phiên đăng nhập Facebook
app.get('/api/groups/session-status', (req, res) => {
  const hasSession = facebookModule.hasSession();
  const sessionInfo = facebookModule.getSessionInfo();
  res.json({ success: true, hasSession, sessionInfo });
});

app.post('/api/groups/import-cookie', async (req, res) => {
  const { cookie } = req.body;
  const result = facebookModule.importCookieString(cookie);
  if (result.success) {
    return res.json({ success: true, message: 'Đã lưu cookie Facebook thành công!' });
  }
  res.status(400).json(result);
});

// ─── 3. PHÂN HỆ TIKTOK RADAR (LUỒNG RIÊNG BIỆT) ────────────────
app.get('/api/tiktok/trends', (req, res) => {
  res.json({ success: true, data: tiktokModule.getTrends() });
});

app.post('/api/tiktok/scrape-live', async (req, res) => {
  if (scanProgress.tiktok.isRunning) {
    return res.json({ success: false, message: 'Bot đang trong quá trình quét TikTok, vui lòng đợi!' });
  }

  scanProgress.tiktok = { isRunning: true, message: 'Đang phân tích xu hướng thịnh hành TikTok...', percent: 10, lastRun: new Date().toISOString(), error: null };

  tiktokModule.scrapeLive((prog) => {
    scanProgress.tiktok.message = prog.message;
    scanProgress.tiktok.percent = prog.percent;
  }).then(result => {
    scanProgress.tiktok.isRunning = false;
    scanProgress.tiktok.percent = 100;
    scanProgress.tiktok.message = `✅ Hoàn tất! Đã cập nhật ${(result || []).length} trend TikTok.`;
    scanProgress.tiktok.lastRun = new Date().toISOString();
  }).catch(err => {
    scanProgress.tiktok.isRunning = false;
    scanProgress.tiktok.error = err.message;
    scanProgress.tiktok.message = `❌ Lỗi quét TikTok: ${err.message}`;
  });

  res.json({ success: true, message: 'Đã bắt đầu tiến trình quét TikTok Trend!' });
});

// ─── 4. PHÂN HỆ THREADS RADAR (LUỒNG RIÊNG BIỆT) ───────────────
app.get('/api/threads/trends', (req, res) => {
  res.json({ success: true, data: threadsModule.getTrends() });
});

app.post('/api/threads/scrape-live', async (req, res) => {
  if (scanProgress.threads.isRunning) {
    return res.json({ success: false, message: 'Bot đang trong quá trình quét Threads, vui lòng đợi!' });
  }

  scanProgress.threads = { isRunning: true, message: 'Đang quét các nội dung viral trên Threads...', percent: 10, lastRun: new Date().toISOString(), error: null };

  threadsModule.scrapeLive((prog) => {
    scanProgress.threads.message = prog.message;
    scanProgress.threads.percent = prog.percent;
  }).then(result => {
    scanProgress.threads.isRunning = false;
    scanProgress.threads.percent = 100;
    scanProgress.threads.message = `✅ Hoàn tất! Đã cập nhật ${(result || []).length} chủ đề Threads.`;
    scanProgress.threads.lastRun = new Date().toISOString();
  }).catch(err => {
    scanProgress.threads.isRunning = false;
    scanProgress.threads.error = err.message;
    scanProgress.threads.message = `❌ Lỗi quét Threads: ${err.message}`;
  });

  res.json({ success: true, message: 'Đã bắt đầu tiến trình quét Threads Trend!' });
});

// ─── TƯƠNG THÍCH VỚI ENDPOINTS TỔNG HỢP CŨ ────────────────────
app.get('/api/trends', (req, res) => {
  const platform = req.query.platform;
  if (platform === 'tiktok') {
    return res.json({ success: true, data: tiktokModule.getTrends() });
  } else if (platform === 'threads') {
    return res.json({ success: true, data: threadsModule.getTrends() });
  }
  res.json({
    success: true,
    data: {
      tiktok: tiktokModule.getTrends(),
      threads: threadsModule.getTrends()
    }
  });
});

app.post('/api/social/scrape-live', async (req, res) => {
  // Kích hoạt quét tuần tự hoặc song song cả 2 nếu được gọi từ client cũ
  Promise.allSettled([
    tiktokModule.scrapeLive(),
    threadsModule.scrapeLive()
  ]);
  res.json({ success: true, message: 'Đang chạy quét độc lập TikTok và Threads!' });
});

// Start server
app.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`🚀 ANTI PTIT RADAR (HOÀN TOÀN PHÂN TÁCH 3 MODULE)`);
  console.log(`📡 URL: http://localhost:3000`);
  console.log(`📘 Facebook Module: FROZEN      at src/modules/facebook`);
  console.log(`🎵 TikTok Module:   INDEPENDENT at src/modules/tiktok`);
  console.log(`🧵 Threads Module:  INDEPENDENT at src/modules/threads`);
  console.log(`📊 Reporting Layer: AGGREGATED  at src/reporting`);
  console.log(`====================================================`);
});
