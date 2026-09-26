/**
 * MODULE TIKTOK RADAR (HOÀN TOÀN ĐỘC LẬP)
 * Luồng hoạt động, cấu hình, xử lý Playwright và dữ liệu của TikTok hoàn toàn riêng biệt.
 */

const radar = require('./tiktokRadar');
const db = require('../../db/database');

module.exports = {
  scrapeLive: radar.scrapeTikTokLive,
  getCurated: radar.getCuratedTikTokTrends,
  getTrends() {
    const list = db.getTrends('tiktok');
    return (list && list.length > 0) ? list : radar.getCuratedTikTokTrends();
  }
};
