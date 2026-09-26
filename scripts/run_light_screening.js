/**
 * LIVE RUN SCRIPT: PHASE 2B — LIGHT SCREENING
 * 
 * Performs ONE live screening pass on current_candidates using the authenticated profile.
 * - Minimum necessary interaction
 * - 2-tier sampling (3 items tier 1, max 5 items tier 2)
 * - Zero generic keyword injections
 * - Zero credential inspection
 * - Outputs data/tiktok_screening_results.json
 */

const { runLightScreening } = require('../src/modules/tiktok/screening/screeningCollector');

(async () => {
  try {
    console.log('\n======================================================');
    console.log('🚀 STARTING PHASE 2B — LIVE LIGHT SCREENING');
    console.log('======================================================\n');

    const payload = await runLightScreening();

    console.log('\n======================================================');
    console.log('🏁 PHASE 2B LIGHT SCREENING FINISHED');
    console.log('======================================================');
    console.log(`Scan ID: ${payload.scan_id}`);
    console.log(`Screened at: ${payload.screened_at}`);
    console.log(`Total Candidates Screened: ${payload.results.length}`);

    const passed = payload.results.filter(r => r.screening_status === 'PASS_TO_DEEP_VALIDATION');
    const dropped = payload.results.filter(r => r.screening_status === 'DROP');
    const inconclusive = payload.results.filter(r => r.screening_status === 'INCONCLUSIVE');

    console.log(`   - PASS_TO_DEEP_VALIDATION: ${passed.length}`);
    console.log(`   - DROP: ${dropped.length}`);
    console.log(`   - INCONCLUSIVE: ${inconclusive.length}`);

    let totalEvidence = 0;
    payload.results.forEach(r => { totalEvidence += r.evidence.length; });
    console.log(`Total Evidence Gathered: ${totalEvidence}`);
  } catch (err) {
    console.error('Fatal error during Light Screening:', err);
    process.exit(1);
  }
})();
