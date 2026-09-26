/**
 * MODULE THREADS RADAR (HOÀN TOÀN ĐỘC LẬP)
 * Luồng hoạt động, cấu hình, xử lý Playwright và dữ liệu của Threads hoàn toàn riêng biệt.
 */

const radar = require('./threadsRadar');
const db = require('../../db/database');

module.exports = {
  scrapeLive: radar.scrapeThreadsLive,
  getCurated: radar.getCuratedThreadsTrends,
  getTrends() {
    const list = db.getTrends('threads');
    return (list && list.length > 0) ? list : radar.getCuratedThreadsTrends();
  }
};
