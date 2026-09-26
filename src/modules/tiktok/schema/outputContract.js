/**
 * TIKTOK SCAN OUTPUT SCHEMA CONTRACT & VALIDATOR
 * 
 * Enforces canonical JSON contract between TikTok Scanner, Database and HTML Renderer.
 * 
 * Rules:
 * - null means unavailable / unknown.
 * - Never convert null into 0.
 * - sample_size means sampled videos inspected, not platform totals.
 * - score_delta and momentum_score can only be calculated when previous scan exists.
 * - In Scan 1 baseline: score is null, score_status is 'NOT_READY'.
 * - In Scan 2: score is a number (0-100), previous_score is null, score_delta is null.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '../../../../data/tiktok_results.json');

const VALID_LIFECYCLES = ['CANDIDATE', 'EMERGING', 'RISING', 'HOT', 'COOLING', 'MATURE'];
const VALID_MOMENTUM_STATUS = [
  'UNKNOWN',
  'INSUFFICIENT_DATA',
  'DECLINING',
  'WEAK',
  'STABLE_OR_GROWING',
  'RISING',
  'SURGING',
  // Backwards compatibility for older mock fixtures
  'ACCELERATING',
  'GROWING',
  'STABLE',
  'DECELERATING'
];

const VALID_EXECUTION_STATUS = ['STARTED', 'COMPLETED', 'FAILED'];
const VALID_DATA_QUALITY_STATUS = ['FULL', 'PARTIAL', 'INSUFFICIENT'];
const VALID_BROWSER_EXECUTION_MODE = ['HEADLESS_AUTOMATED', 'INTERACTIVE_DESKTOP'];

/**
 * Validates a topic object against the output contract
 * @param {Object} topic 
 * @throws {Error} if invalid
 */
function validateTopicContract(topic) {
  if (!topic.topic_id || typeof topic.topic_id !== 'string') {
    throw new Error('Topic must have a valid string topic_id');
  }
  if (!topic.title || typeof topic.title !== 'string') {
    throw new Error(`Topic ${topic.topic_id} must have a valid title`);
  }
  if (!VALID_LIFECYCLES.includes(topic.lifecycle)) {
    throw new Error(`Invalid lifecycle: ${topic.lifecycle} for topic ${topic.topic_id}`);
  }
  if (topic.score !== null && (typeof topic.score !== 'number' || topic.score < 0 || topic.score > 100)) {
    throw new Error(`Score must be null or a number between 0 and 100 for topic ${topic.topic_id}, got ${topic.score}`);
  }

  // Ensure signals object is present
  if (!topic.signals || typeof topic.signals !== 'object') {
    throw new Error(`Topic ${topic.topic_id} missing signals object`);
  }

  if (topic.signals.momentum_status && !VALID_MOMENTUM_STATUS.includes(topic.signals.momentum_status)) {
    throw new Error(`Invalid momentum_status: ${topic.signals.momentum_status} for topic ${topic.topic_id}`);
  }

  // Ensure evidence is an array
  if (!Array.isArray(topic.evidence)) {
    throw new Error(`Topic ${topic.topic_id} missing evidence array`);
  }

  // Check evidence structure
  for (const ev of topic.evidence) {
    if (!ev.video_url || typeof ev.video_url !== 'string') {
      throw new Error(`Evidence in ${topic.topic_id} missing valid video_url`);
    }
  }

  return true;
}

/**
 * Validates entire scan payload
 * @param {Object} payload 
 */
function validateScanPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Payload must be an object');
  if (payload.platform !== 'tiktok') throw new Error('Platform must be "tiktok"');
  if (payload.market !== 'VN') throw new Error('Market must be "VN"');
  if (!payload.scan_id) throw new Error('scan_id is required');
  if (!payload.scan_time) throw new Error('scan_time is required');
  if (!Array.isArray(payload.topics)) throw new Error('topics must be an array');

  for (const t of payload.topics) {
    validateTopicContract(t);
  }

  if (payload.execution_status && !VALID_EXECUTION_STATUS.includes(payload.execution_status)) {
    throw new Error(`Invalid execution_status: ${payload.execution_status}`);
  }
  if (payload.data_quality_status && !VALID_DATA_QUALITY_STATUS.includes(payload.data_quality_status)) {
    throw new Error(`Invalid data_quality_status: ${payload.data_quality_status}`);
  }
  if (payload.browser_execution_mode && !VALID_BROWSER_EXECUTION_MODE.includes(payload.browser_execution_mode)) {
    throw new Error(`Invalid browser_execution_mode: ${payload.browser_execution_mode}`);
  }
  if (payload.source_runs && !Array.isArray(payload.source_runs)) {
    throw new Error('source_runs must be an array');
  }
  if (payload.limitations && !Array.isArray(payload.limitations)) {
    throw new Error('limitations must be an array');
  }

  return true;
}

/**
 * Write validated payload to JSON file
 * @param {Object} payload 
 * @param {string} targetPath 
 */
function writeTikTokResultsJson(payload, targetPath = DEFAULT_OUTPUT_PATH) {
  validateScanPayload(payload);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
  return targetPath;
}

/**
 * Read and validate existing results JSON
 * @param {string} targetPath 
 * @returns {Object|null}
 */
function readTikTokResultsJson(targetPath = DEFAULT_OUTPUT_PATH) {
  if (!fs.existsSync(targetPath)) return null;
  const content = fs.readFileSync(targetPath, 'utf8');
  const parsed = JSON.parse(content);
  validateScanPayload(parsed);
  return parsed;
}

module.exports = {
  VALID_LIFECYCLES,
  VALID_MOMENTUM_STATUS,
  VALID_EXECUTION_STATUS,
  VALID_DATA_QUALITY_STATUS,
  VALID_BROWSER_EXECUTION_MODE,
  validateTopicContract,
  validateScanPayload,
  writeTikTokResultsJson,
  readTikTokResultsJson,
  DEFAULT_OUTPUT_PATH
};
