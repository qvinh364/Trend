/**
 * REPORTING AGGREGATOR
 * Lớp tổng hợp báo cáo đầu ra duy nhất của hệ thống:
 * - Tiếp nhận dữ liệu bài viết từ Module Facebook (Sinh viên PTIT)
 * - Tiếp nhận dữ liệu xu hướng từ Module TikTok Radar
 * - Tiếp nhận dữ liệu xu hướng từ Module Threads Radar
 * - Tính toán các chỉ số thống kê tổng hợp (Stats) để phục vụ Dashboard UI và API
 */

const facebookModule = require('../modules/facebook');
const tiktokModule = require('../modules/tiktok');
const threadsModule = require('../modules/threads');
const db = require('../db/database');

/**
 * Tính toán thống kê tổng quan (Stats Cards)
 */
function getOverviewStats() {
  const posts = facebookModule.getMonitoredPosts();
  const tiktokTrends = tiktokModule.getTrends();
  const threadsTrends = threadsModule.getTrends();

  const totalPosts = posts.length;
  const totalEngagement = posts.reduce((sum, p) => {
    return sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
  }, 0);
  const totalTrends = (tiktokTrends?.length || 0) + (threadsTrends?.length || 0);

  return {
    totalPosts,
    totalEngagement,
    totalTrends,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Tổng hợp toàn bộ dữ liệu Dashboard để trả về cho Frontend
 */
function getDashboardReport() {
  const posts = facebookModule.getMonitoredPosts();
  const tiktokTrends = tiktokModule.getTrends();
  const threadsTrends = threadsModule.getTrends();
  const stats = getOverviewStats();

  return {
    success: true,
    stats,
    group_posts: posts,
    trends: {
      tiktok: tiktokTrends,
      threads: threadsTrends
    }
  };
}

module.exports = {
  getOverviewStats,
  getDashboardReport
};
