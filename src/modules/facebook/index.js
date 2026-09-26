/**
 * MODULE FACEBOOK (FROZEN - ĐÃ ĐÓNG GÓI HOÀN THIỆN, KHÔNG CHỈNH SỬA)
 * 
 * Phạm vi trách nhiệm:
 * 1. Quản lý Session Cookie Facebook (fbSetupSession)
 * 2. Quét 4 nhóm PTIT trong 7 ngày gần nhất, bóc tách likes/comments/shares (fbGroupScraper)
 * 3. Cung cấp Top 5 bài viết mỗi nhóm (20 bài) và heat score (fbGroupWatcher)
 */

const scraper = require('./fbGroupScraper');
const watcher = require('./fbGroupWatcher');
const session = require('./fbSetupSession');

module.exports = {
  // Scraper API
  scrapeAllGroupsLive: scraper.scrapeAllGroupsLive,

  // Watcher API
  getMonitoredPosts: watcher.getMonitoredPosts,
  getTopWeeklyByGroup: watcher.getTopWeeklyByGroup,
  ingestPost: watcher.ingestPost,
  deletePost: watcher.deletePost,

  // Session & Cookie API
  hasSession: session.hasSession,
  getSessionInfo: session.getSessionInfo,
  setupFacebookSession: session.setupFacebookSession,
  importCookieString: session.importCookieString
};
