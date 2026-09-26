// ─── STATE MANAGEMENT ───────────────────────────────────────────
const state = {
  groupPosts: [],
  trends: { tiktok: [], threads: [] },
  stats: {},
  currentGroupFilter: 'cdsv',
  currentPlatform: 'tiktok',
  isServerOnline: false,
  scanPollingTimer: null
};

// ─── HELPERS ────────────────────────────────────────────────────
function formatMetric(num) {
  if (!num) return '0';
  if (num >= 1000) return (num / 1000).toFixed(1).replace('.0', '') + 'K';
  return Number(num).toLocaleString('vi-VN');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, isSuccess = true) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  if (!toast) return;

  toastMsg.textContent = msg;
  toast.style.display = 'flex';
  toast.style.backgroundColor = isSuccess ? '#064e3b' : '#7f1d1d';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// ─── CLOCK ──────────────────────────────────────────────────────
function startClock() {
  const clockEl = document.getElementById('clock');
  function update() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('vi-VN');
    }
  }
  update();
  setInterval(update, 1000);
}

// ─── SERVER STATUS & API CALLS ──────────────────────────────────
async function checkServerStatus() {
  const badge = document.getElementById('serverBadge');
  const badgeText = document.getElementById('serverBadgeText');

  try {
    const res = await fetch('/api/stats', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      state.isServerOnline = true;
      if (badge) {
        badge.style.background = 'rgba(74, 222, 128, 0.25)';
        badge.style.borderColor = 'rgba(74, 222, 128, 0.4)';
      }
      if (badgeText) badgeText.textContent = 'Server Online';
      return true;
    }
  } catch (e) {
    state.isServerOnline = false;
    if (badge) {
      badge.style.background = 'rgba(239, 68, 68, 0.25)';
      badge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    }
    if (badgeText) badgeText.textContent = 'Server Offline';
    return false;
  }
}

async function loadAllData() {
  try {
    const [postsRes, trendsRes, statsRes] = await Promise.all([
      fetch('/api/group-posts'),
      fetch('/api/trends'),
      fetch('/api/stats')
    ]);

    const postsData = await postsRes.json();
    const trendsData = await trendsRes.json();
    const statsData = await statsRes.json();

    if (postsData.success && Array.isArray(postsData.data)) {
      state.groupPosts = postsData.data;
      renderGroupPosts();
    }

    if (trendsData.success && trendsData.data) {
      state.trends = trendsData.data;
      renderTrends();
    }

    if (statsData.success && statsData.data) {
      state.stats = statsData.data;
      renderStats();
    }
  } catch (err) {
    console.warn('Lỗi load dữ liệu:', err);
  }
}

// ─── RENDER STATS OVERVIEW ──────────────────────────────────────
function renderStats() {
  const s = state.stats;
  if (!s) return;

  const statPosts = document.getElementById('statPostsCount');
  const statEngagement = document.getElementById('statEngagement');
  const statTrends = document.getElementById('statTrendsCount');
  const statLastUpdate = document.getElementById('statLastUpdate');

  if (statPosts) statPosts.textContent = s.totalPosts || state.groupPosts.length || '20';
  if (statEngagement) statEngagement.textContent = formatMetric(s.totalEngagement || 2400);
  if (statTrends) statTrends.textContent = s.totalTrends || (state.trends.tiktok?.length + state.trends.threads?.length) || '10';
  if (statLastUpdate) {
    const d = s.lastUpdated ? new Date(s.lastUpdated) : new Date();
    statLastUpdate.textContent = `Cập nhật lúc: ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${d.toLocaleDateString('vi-VN')}`;
  }
}

// ─── RENDER GROUP POSTS ─────────────────────────────────────────
function renderGroupPosts() {
  const container = document.getElementById('groupPostsList');
  if (!container) return;

  let filtered = state.groupPosts;
  const filter = state.currentGroupFilter;

  if (filter === 'cdsv') {
    filtered = filtered.filter(p => p.group_id === '2k5ptit' || (p.source_group && (p.source_group.includes('sinh viên') || p.source_group.includes('2k5') || p.source_group.includes('CĐ SV'))));
  } else if (filter === 'thongtin') {
    filtered = filtered.filter(p => p.group_id === '408571091380061' || (p.source_group && p.source_group.includes('thông tin')));
  } else if (filter === 'd26') {
    filtered = filtered.filter(p => p.group_id === '1605563914144178' || (p.source_group && p.source_group.includes('D26')));
  } else if (filter === 'cfs') {
    filtered = filtered.filter(p => p.group_id === 'confessions.ptit' || (p.source_group && (p.source_group.includes('Confessions') || p.source_group.includes('CFS'))));
  }

  if (!filtered || filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 16px; color: #94a3b8; font-size: 0.85rem;">
        <i class="ph ph-folder-open" style="font-size: 2rem; display: block; margin-bottom: 8px;"></i>
        Chưa có bài viết nào trong nhóm này. Hãy bấm <strong>Quét Group Facebook</strong> để cập nhật.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((post, idx) => {
    const rank = post.rank || (idx + 1);
    const rankClass = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : 'rank-other'));
    const rankIcon = rank === 1 ? '🏆' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : `#${rank}`));
    const likes = post.likes || 0;
    const comments = post.comments || 0;
    const shares = post.shares || 0;
    const totalScore = post.engagement_score || (likes + comments + shares);
    const fbUrl = post.source_url || '#';

    return `
      <div class="fb-card">
        <div class="card-meta-row">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="rank-badge ${rankClass}">${rankIcon} Top ${rank} Tuần</span>
            <span class="tag-badge">${escapeHtml(post.tag || 'Thảo luận')}</span>
          </div>
          <span class="time-badge">${escapeHtml(post.timestamp || 'Trong tuần qua')}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.82rem; font-weight: 700; color: #1e293b;">
          <div style="width: 24px; height: 24px; border-radius: 50%; background: #e0e7ff; color: #4338ca; display: flex; align-items: center; justify-content: center; font-size: 11px;">
            ${(post.author || 'U').charAt(0).toUpperCase()}
          </div>
          <span>${escapeHtml(post.author || 'Thành viên Group')}</span>
        </div>

        <p class="card-content">${escapeHtml(post.content)}</p>

        <div class="card-metrics-row">
          <div class="metrics-stats">
            <span title="Lượt thích">👍 ${formatMetric(likes)}</span>
            <span title="Lượt bình luận">💬 ${formatMetric(comments)}</span>
            <span title="Lượt chia sẻ">↪️ ${formatMetric(shares)}</span>
            <span class="score-badge" title="Tổng React + Comment + Share">⭐ ${formatMetric(totalScore)}</span>
          </div>

          <a href="${escapeHtml(fbUrl)}" target="_blank" rel="noopener noreferrer" class="btn-link btn-link-fb" title="Mở bài viết thật trên Facebook">
            <span>Xem bài trên FB</span>
            <i class="ph ph-arrow-square-out"></i>
          </a>
        </div>
      </div>
    `;
  }).join('');
}

// ─── RENDER TRENDS ──────────────────────────────────────────────
function renderTrends() {
  const container = document.getElementById('trendsList');
  if (!container) return;

  const platform = state.currentPlatform;
  const list = state.trends[platform] || [];

  if (!list || list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 16px; color: #94a3b8; font-size: 0.85rem;">
        <i class="ph ph-fire" style="font-size: 2rem; display: block; margin-bottom: 8px;"></i>
        Chưa có dữ liệu xu hướng. Hãy bấm <strong>Quét Trend MXH</strong> để bot bóc tách.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((item, idx) => {
    const isTikTok = platform === 'tiktok';

    if (isTikTok) {
      const videoUrl = item.video_url || item.link || 'https://www.tiktok.com';
      const keyword = item.search_keyword || item.title;
      const signals = item.signals || item.sound || 'Format POV / Sound lặp lại giữa nhiều Creator';
      const videoCount = item.video_count || '100.000+ video tham gia';
      const viralTime = item.latest_viral_time || 'Trong 24 giờ qua';

      return `
        <div class="trend-card">
          <div class="trend-header-row">
            <div class="trend-idx">${idx + 1}</div>
            <div class="trend-title-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <span class="badge-viral">🔥 Bùng nổ</span>
          </div>

          <div class="search-keyword-box">
            <i class="ph ph-magnifying-glass"></i>
            <span>Từ khóa tìm kiếm nhiều nhất: <strong>"${escapeHtml(keyword)}"</strong></span>
          </div>

          <p class="trend-desc">${escapeHtml(item.description || item.content || '')}</p>

          <div class="trend-signals">
            <div><strong>Tín hiệu nhận diện:</strong> ${escapeHtml(signals)}</div>
            <div style="display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 4px; padding-top: 4px; border-top: 1px dashed #e9d5ff;">
              <span><strong>Số lượng video:</strong> ${escapeHtml(videoCount)}</span>
              <span><strong>Viral gần nhất:</strong> ⏰ ${escapeHtml(viralTime)}</span>
            </div>
          </div>

          <div class="card-metrics-row">
            <span style="font-size: 0.75rem; color: #0f172a; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
              <i class="ph ph-tiktok-logo"></i>
              TikTok VN
            </span>

            <a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer" class="btn-link btn-link-mxh" title="Mở xem trực tiếp video tiêu biểu trên TikTok">
              <i class="ph ph-play-circle"></i>
              <span>Xem video TikTok gốc</span>
              <i class="ph ph-arrow-square-out"></i>
            </a>
          </div>
        </div>
      `;
    } else {
      // Threads
      const postUrl = item.post_url || item.link || 'https://www.threads.net';
      const keyword = item.search_keyword || item.title;
      const searchVolume = item.search_volume || '40.000+ lượt tìm kiếm trong 3 ngày qua';
      const topicSummary = item.topic_summary || item.content || item.description || '';
      const engagement = item.engagement_metrics || item.viral_metrics || 'Hàng ngàn thảo luận';
      const author = item.author || '@threads_community';

      return `
        <div class="trend-card">
          <div class="trend-header-row">
            <div class="trend-idx">${idx + 1}</div>
            <div class="trend-title-text" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <span class="badge-viral" style="background: #fdf2f8; color: #be185d; border-color: #fbcfe8;">⚡ Đang bàn tán</span>
          </div>

          <div class="search-keyword-box">
            <i class="ph ph-trend-up"></i>
            <span>Từ khóa hot 3 ngày: <strong>"${escapeHtml(keyword)}"</strong></span>
          </div>

          <div style="font-size: 0.78rem; color: #4338ca; background: #eef2ff; border-radius: 6px; padding: 4px 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
            <i class="ph ph-chart-line-up"></i>
            <span>Quy mô tìm kiếm: <strong>${escapeHtml(searchVolume)}</strong></span>
          </div>

          <p class="trend-desc" style="margin-top: 2px;"><strong>Chủ đề bàn luận:</strong> ${escapeHtml(topicSummary)}</p>

          <div class="trend-signals" style="background: #f8fafc; border-color: #e2e8f0; color: #334155;">
            <div><strong>Tác giả / Thread chính:</strong> <span style="color: #4f46e5; font-weight: 700;">${escapeHtml(author)}</span></div>
            <div><strong>Quy mô tương tác:</strong> ${escapeHtml(engagement)}</div>
          </div>

          <div class="card-metrics-row">
            <span style="font-size: 0.75rem; color: #000; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
              <i class="ph ph-at"></i>
              Threads VN
            </span>

            <a href="${escapeHtml(postUrl)}" target="_blank" rel="noopener noreferrer" class="btn-link" title="Mở xem bài viết chính trên Threads" style="background: #0f172a; color: #ffffff; border: 1px solid #0f172a;">
              <i class="ph ph-chat-circle-dots"></i>
              <span>Xem bài viết Threads gốc</span>
              <i class="ph ph-arrow-square-out"></i>
            </a>
          </div>
        </div>
      `;
    }
  }).join('');
}

// ─── TAB SWITCHING ──────────────────────────────────────────────
window.switchGroupTab = function(groupId, btn) {
  state.currentGroupFilter = groupId;
  document.querySelectorAll('.section-col:first-child .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGroupPosts();
};

window.switchPlatformTab = function(platform, btn) {
  state.currentPlatform = platform;
  document.querySelectorAll('.section-col:last-child .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTrends();
};

// ─── SCANNING & PROGRESS POLLING ────────────────────────────────
window.triggerScanFB = async function() {
  const btn = document.getElementById('btnScanFB');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/groups/scrape-live', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('⚡ Bắt đầu quét 4 Group Facebook...', true);
      startPollingProgress('groups');
    } else {
      showToast('⚠️ ' + data.message, false);
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    showToast('❌ Lỗi kết nối server: ' + err.message, false);
    if (btn) btn.disabled = false;
  }
};

window.triggerScanTikTok = async function() {
  const btn = document.getElementById('btnScanTikTok');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/tiktok/scrape-live', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('🎵 Bắt đầu quét xu hướng TikTok VN độc lập...', true);
      startPollingProgress('tiktok');
    } else {
      showToast('⚠️ ' + data.message, false);
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    showToast('❌ Lỗi kết nối server: ' + err.message, false);
    if (btn) btn.disabled = false;
  }
};

window.triggerScanThreads = async function() {
  const btn = document.getElementById('btnScanThreads');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/threads/scrape-live', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('🧵 Bắt đầu quét xu hướng Threads VN độc lập...', true);
      startPollingProgress('threads');
    } else {
      showToast('⚠️ ' + data.message, false);
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    showToast('❌ Lỗi kết nối server: ' + err.message, false);
    if (btn) btn.disabled = false;
  }
};

window.triggerScanSocial = async function() {
  // Backward compatibility
  await triggerScanTikTok();
};

function startPollingProgress(scanType) {
  const banner = document.getElementById('scanProgressBanner');
  const title = document.getElementById('scanProgressTitle');
  const percentEl = document.getElementById('scanProgressPercent');
  const bar = document.getElementById('scanProgressBar');

  if (banner) banner.style.display = 'flex';

  clearInterval(state.scanPollingTimer);
  state.scanPollingTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/scan-status');
      const data = await res.json();
      if (!data.success || !data.data) return;

      const info = data.data[scanType];
      if (info) {
        if (title) title.textContent = info.message || 'Đang xử lý dữ liệu...';
        if (percentEl) percentEl.textContent = `${info.percent || 0}%`;
        if (bar) bar.style.width = `${info.percent || 0}%`;

        // Nếu quét xong
        if (!info.isRunning && info.percent >= 100) {
          clearInterval(state.scanPollingTimer);
          setTimeout(async () => {
            if (banner) banner.style.display = 'none';
            const btnFB = document.getElementById('btnScanFB');
            const btnTT = document.getElementById('btnScanTikTok');
            const btnTH = document.getElementById('btnScanThreads');
            if (btnFB) btnFB.disabled = false;
            if (btnTT) btnTT.disabled = false;
            if (btnTH) btnTH.disabled = false;
            await loadAllData();
            showToast('✅ Đã cập nhật xong dữ liệu mới nhất!', true);
          }, 1500);
        }
      }
    } catch (e) {
      console.warn('Lỗi polling status:', e);
    }
  }, 1200);
}

// ─── COOKIE MODAL ───────────────────────────────────────────────
window.openCookieModal = function() {
  document.getElementById('modalCookie').style.display = 'flex';
};

window.closeCookieModal = function() {
  document.getElementById('modalCookie').style.display = 'none';
};

window.saveCookie = async function() {
  const cookie = document.getElementById('txtCookie').value.trim();
  if (!cookie) return alert('Vui lòng dán chuỗi cookie!');

  try {
    const res = await fetch('/api/groups/import-cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ ' + data.message, true);
      closeCookieModal();
    } else {
      alert('Lỗi: ' + data.message);
    }
  } catch (e) {
    alert('Lỗi: ' + e.message);
  }
};

// ─── INITIALIZATION ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  startClock();
  await checkServerStatus();
  await loadAllData();

  // Heartbeat check mỗi 15 giây
  setInterval(checkServerStatus, 15000);
});
