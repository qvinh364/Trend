const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('\n======================================================');
console.log('🧪 RUNNING TIKTOK MANUAL LOGIN STATIC TESTS (PHASE 2A.3D.1)');
console.log('======================================================\n');

let passedTests = 0;
const totalTests = 7;

// TEST 1: manual login script exists
const scriptPath = path.resolve(__dirname, '../scripts/tiktok_manual_login.js');
try {
  assert(fs.existsSync(scriptPath), 'scripts/tiktok_manual_login.js must exist');
  console.log('✅ TEST 1 PASSED: manual login script exists');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 1 FAILED:', err.message);
}

// TEST 2: Project launcher TikTok_Login.cmd exists and contains pure ASCII commands
const cmdPath = path.resolve(__dirname, '../TikTok_Login.cmd');
try {
  assert(fs.existsSync(cmdPath), 'TikTok_Login.cmd must exist');
  const cmdContent = fs.readFileSync(cmdPath, 'utf8');
  assert(cmdContent.includes('cd /d "%~dp0"'), 'Must contain cd /d "%~dp0"');
  assert(cmdContent.includes('node "scripts\\tiktok_manual_login.js"'), 'Must run scripts\\tiktok_manual_login.js');
  const hasCorruptedHo = cmdContent.split('\n').some(l => l.trim().startsWith('ho ') || l.trim() === 'ho');
  assert(!hasCorruptedHo, 'Must not contain corrupted command ho');
  assert(!cmdContent.trim().startsWith('/d'), 'Must not contain corrupted /d');
  console.log('✅ TEST 2 PASSED: TikTok_Login.cmd contains clean ASCII batch logic');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 2 FAILED:', err.message);
}

// TEST 3: Desktop shortcut .lnk exists
const shortcutPath = 'C:\\Users\\Admin\\Desktop\\TikTok Trend Radar - Login.lnk';
try {
  assert(fs.existsSync(shortcutPath), 'Desktop .lnk shortcut must exist');
  const buf = fs.readFileSync(shortcutPath);
  assert(buf.indexOf(Buffer.from('TikTok_Login.cmd', 'utf16le')) !== -1, 'Shortcut must target TikTok_Login.cmd in UTF-16');
  console.log('✅ TEST 3 PASSED: Desktop shortcut .lnk exists and embeds valid UTF-16 target');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 3 FAILED:', err.message);
}

// TEST 4: script does NOT contain automated login/input of username/password
const scriptContent = fs.readFileSync(scriptPath, 'utf8');
try {
  assert(!scriptContent.includes('.fill(') && !scriptContent.includes('.type('), 'Script must not automatically fill credentials');
  assert(!scriptContent.includes('password') && !scriptContent.includes('username'), 'Script must not contain credential fields');
  console.log('✅ TEST 4 PASSED: script contains zero automated credential input logic');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 4 FAILED:', err.message);
}

// TEST 5: script does NOT log credentials/cookies/tokens
try {
  assert(!scriptContent.includes('console.log(cookie'), 'Script must not log cookies');
  assert(!scriptContent.includes('console.log(token'), 'Script must not log tokens');
  assert(!scriptContent.includes('authorization'), 'Script must not handle authorization headers');
  assert(!scriptContent.includes('localStorage'), 'Script must not dump localStorage');
  assert(!scriptContent.includes('sessionStorage'), 'Script must not dump sessionStorage');
  console.log('✅ TEST 5 PASSED: script strictly enforces zero credential logging');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 5 FAILED:', err.message);
}

// TEST 6: .gitignore contains data/tiktok_browser_profile/
try {
  const gitignorePath = path.resolve(__dirname, '../.gitignore');
  assert(fs.existsSync(gitignorePath), '.gitignore must exist');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  assert(gitignoreContent.includes('data/tiktok_browser_profile/'), '.gitignore must include data/tiktok_browser_profile/');
  console.log('✅ TEST 6 PASSED: .gitignore contains data/tiktok_browser_profile/');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 6 FAILED:', err.message);
}

// TEST 7: Actual filesystem path does not contain %20
try {
  assert(!cmdPath.includes('%20'), 'Filesystem path must not contain %20');
  console.log('✅ TEST 7 PASSED: Actual filesystem path uses real spaces, not %20');
  passedTests++;
} catch (err) {
  console.error('❌ TEST 7 FAILED:', err.message);
}

console.log('\n------------------------------------------------------');
console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('------------------------------------------------------\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
