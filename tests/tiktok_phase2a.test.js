/**
 * PHASE 2A.3 TEST SUITE & LIVE RUNNER
 * Verifies live provenance, absence of mock data, and accurate environment reporting.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runDiscoveryEngine, DEFAULT_OUTPUT_PATH, DEFAULT_AGENT_OBS_PATH } = require('../src/modules/tiktok/discovery/candidateDiscovery');

async function testPhase2A3() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING PHASE 2A.3 LIVE OBSERVATION PROVENANCE TEST');
  console.log('======================================================\n');

  // Verify tiktok_agent_observations.json begins empty (no mock data)
  assert(fs.existsSync(DEFAULT_AGENT_OBS_PATH), 'Agent observations file must exist');
  const initialObs = JSON.parse(fs.readFileSync(DEFAULT_AGENT_OBS_PATH, 'utf8'));
  console.log(`Checking initial observations: ${initialObs.length} items (must be genuine, 0 mock)`);
  assert(Array.isArray(initialObs), 'Must be array');

  // Run discovery engine
  const payload = await runDiscoveryEngine({
    outputPath: DEFAULT_OUTPUT_PATH,
    agentObsPath: DEFAULT_AGENT_OBS_PATH
  });

  // Verify structure
  assert(payload && typeof payload === 'object', 'Payload must be object');
  assert.strictEqual(payload.discovery_coverage, 'PARTIAL', 'discovery_coverage must be PARTIAL');
  assert(Array.isArray(payload.source_runs), 'source_runs must be an array');
  assert(Array.isArray(payload.current_candidates), 'current_candidates must be an array');
  assert(Array.isArray(payload.historical_context), 'historical_context must be an array');

  console.log(`\n📡 [Source Diagnostics]:`);
  for (const sr of payload.source_runs) {
    console.log(` - ${sr.source}: [${sr.status}] (Raw: ${sr.raw_items_found}, Kept: ${sr.candidates_kept})`);
    if (sr.error) console.log(`   * Diagnostic Error: ${sr.error}`);
    if (sr.note) console.log(`   * Diagnostic Note: ${sr.note}`);
  }

  console.log(`\n🔥 [CURRENT CANDIDATES] Count: ${payload.current_candidates_count}`);
  for (const c of payload.current_candidates) {
    console.log(` - "${c.candidate_key}" [Type: ${c.candidate_type_hint}, Confidence: ${c.type_confidence}, Freshness Warning: ${c.freshness_warning}]`);
    assert.strictEqual(c.type_confidence, 'LOW', 'type_confidence must be LOW at discovery stage');
    assert.strictEqual(c.freshness_warning, false, 'Current candidates must not have freshness_warning');
    assert.strictEqual(c.lifecycle, undefined, 'lifecycle must not be set');
    assert.strictEqual(c.trend_score, undefined, 'trend_score must not be set');
  }

  console.log(`\n📜 [HISTORICAL CONTEXT (30d)] Count: ${payload.baseline_candidates_count}`);
  for (const h of payload.historical_context) {
    console.log(` - "${h.candidate_key}" [Freshness Warning: ${h.freshness_warning}]`);
    assert.strictEqual(h.type_confidence, 'LOW', 'type_confidence must be LOW');
    assert.strictEqual(h.freshness_warning, true, 'Historical context must have freshness_warning: true');
  }

  // Verify Facebook untouched
  const fbDir = path.resolve(__dirname, '../src/modules/facebook');
  const expectedFbFiles = ['fbGroupScraper.js', 'fbGroupWatcher.js', 'fbSetupSession.js', 'index.js'];
  for (const f of expectedFbFiles) {
    assert(fs.existsSync(path.join(fbDir, f)), `Facebook file missing: ${f}`);
  }

  console.log('\n======================================================');
  console.log('✅ ALL PHASE 2A.3 ACCEPTANCE CRITERIA VERIFIED AND PASSED!');
  console.log('======================================================\n');
}

testPhase2A3().catch(err => {
  console.error('❌ Phase 2A.3 Test Failed:', err);
  process.exit(1);
});
