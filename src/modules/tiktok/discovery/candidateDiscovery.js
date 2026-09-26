/**
 * TIKTOK CANDIDATE DISCOVERY ORCHESTRATOR (PHASE 2A.4)
 * 
 * Orchestrates:
 * 1. Node deterministic collection (Creative Center 7d & 30d).
 * 2. Authenticated live discovery (Explore & Search Related) via Playwright persistent profile.
 * 3. Ingestion of genuine observations from data/tiktok_agent_observations.json.
 * 4. Normalization, deduplication, signal strength calculation, and separation of current vs historical context.
 */

const path = require('path');
const { collectCreativeCenterData } = require('./creativeCenterCollector');
const { runAuthenticatedLiveDiscovery } = require('./authenticatedDiscoveryCollector');
const { 
  readAgentObservations, 
  mergeDiscoverySources, 
  writeCandidatesJson, 
  DEFAULT_OUTPUT_PATH,
  DEFAULT_AGENT_OBS_PATH
} = require('./candidateMerger');
const { validateDiscoveryPayload } = require('./candidateContract');

async function runDiscoveryEngine(options = {}) {
  const outputPath = options.outputPath || DEFAULT_OUTPUT_PATH;
  const agentObsPath = options.agentObsPath || DEFAULT_AGENT_OBS_PATH;

  console.log('\n======================================================');
  console.log('🔍 [Discovery Orchestrator Phase 2A.4] Khởi chạy Authenticated Live Discovery...');
  console.log('======================================================\n');

  // 1. Run Creative Center collector
  console.log('📊 [1/3] Thu thập dữ liệu Creative Center VN (7d & 30d)...');
  const ccData = await collectCreativeCenterData();
  console.log(`   * Creative Center 7d: ${ccData.cc7dList.length} items`);
  console.log(`   * Creative Center 30d: ${ccData.cc30dList.length} items`);

  // 2. Run Authenticated Live Discovery on TikTok (Explore & Search UI Related)
  console.log('🧭 [2/3] Quét Explore & Search UI qua persistent authenticated profile...');
  const seeds = ccData.cc7dList.map(item => item.label);
  const liveResult = await runAuthenticatedLiveDiscovery({
    candidateSeeds: seeds,
    observationsPath: agentObsPath
  });
  console.log(`   * Live observations thu thập được: ${liveResult.observations.length} items`);

  // 3. Read Agent observations from file and validate
  console.log('📋 [3/3] Nạp và kiểm định observations từ tệp lưu trữ...');
  const agentObservations = readAgentObservations(agentObsPath);

  // 4. Merge & Deduplicate
  const payload = mergeDiscoverySources({
    ccData,
    agentObservations,
    scanId: `disc_${Date.now()}`
  });

  // 5. Save validated payload
  writeCandidatesJson(payload, outputPath);

  console.log(`\n✅ [Discovery Orchestrator] Hoàn tất!`);
  console.log(` - Coverage: ${payload.discovery_coverage}`);
  console.log(` - Current Candidates (Ưu tiên): ${payload.current_candidates_count}`);
  console.log(` - Historical Context (30d): ${payload.baseline_candidates_count}`);
  console.log(` - Tệp đầu ra: ${outputPath}\n`);

  return {
    payload,
    liveDiagnostics: liveResult.diagnostics,
    observations: agentObservations,
    ccData
  };
}

module.exports = {
  runDiscoveryEngine,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_AGENT_OBS_PATH
};
