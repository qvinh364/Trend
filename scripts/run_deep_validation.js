/**
 * LIVE RUN SCRIPT: PHASE 3 — DEEP VALIDATION + BASELINE SNAPSHOT
 * 
 * Performs ONE live deep validation pass on finalists using persistent authenticated profile.
 * - Reuses Phase 2B evidence.
 * - Minimum necessary interaction.
 * - Writes data/tiktok_validation_results.json.
 * - Persists baseline snapshot in data/tiktok_trends.db (trend_score=null, momentum=UNKNOWN).
 * - Writes inconclusive items to data/tiktok_watchlist.json.
 */

const { runDeepValidation } = require('../src/modules/tiktok/validation/deepValidator');

(async () => {
  try {
    console.log('\n======================================================');
    console.log('🚀 STARTING PHASE 3 — LIVE DEEP VALIDATION');
    console.log('======================================================\n');

    const payload = await runDeepValidation();

    console.log('\n======================================================');
    console.log('🏁 PHASE 3 DEEP VALIDATION FINISHED');
    console.log('======================================================');
    console.log(`Scan ID: ${payload.scan_id}`);
    console.log(`Validated at: ${payload.validated_at}`);
    console.log(`Total Finalists Validated: ${payload.results.length}`);

    for (const res of payload.results) {
      console.log(`\n📌 [${res.candidate_key}]`);
      console.log(`   - Status: ${res.validation_status}`);
      console.log(`   - Validated Topic: "${res.validated_topic_label}" (${res.validated_type})`);
      console.log(`   - Spread Mode: ${res.spread_mode}`);
      console.log(`   - Sample Size: ${res.sample_size}`);
      console.log(`   - Unique Creators: ${res.unique_creators}`);
      console.log(`   - Relevant Evidence: ${res.relevant_evidence_count}`);
      console.log(`   - Freshness:`, JSON.stringify(res.freshness));
      console.log(`   - Reason: ${res.validation_reason}`);
    }

  } catch (err) {
    console.error('Fatal error during Deep Validation:', err);
    process.exit(1);
  }
})();
