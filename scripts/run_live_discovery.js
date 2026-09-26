const { runDiscoveryEngine } = require('../src/modules/tiktok/discovery/candidateDiscovery');

(async () => {
  try {
    const result = await runDiscoveryEngine();
    console.log('\n======================================================');
    console.log('🏁 AUTHENTICATED LIVE DISCOVERY COMPLETED');
    console.log('======================================================');
    console.log('Coverage:', result.payload.discovery_coverage);
    console.log('Current candidates count:', result.payload.current_candidates_count);
    console.log('Historical context count:', result.payload.baseline_candidates_count);
    console.log('Live observations count:', result.observations.length);
  } catch (err) {
    console.error('Lỗi khi chạy Live Discovery:', err);
    process.exit(1);
  }
})();
