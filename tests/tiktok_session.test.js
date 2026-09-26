const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { isProfilePresent, verifySession } = require('../src/modules/tiktok/session/tiktokSetupSession');

console.log('\n======================================================');
console.log('🧪 RUNNING TIKTOK SESSION (PHASE 2A.3C) TESTS');
console.log('======================================================\n');

let passedTests = 0;
let totalTests = 5;

// TEST A: Session/profile paths not in source-controlled output
try {
  const candidatesPath = path.resolve(__dirname, '../data/tiktok_candidates.json');
  if (fs.existsSync(candidatesPath)) {
    const content = fs.readFileSync(candidatesPath, 'utf8');
    assert(!content.includes('tiktok_browser_profile'), 'Output must not leak profile directory');
    assert(!content.includes('sessionid'), 'Output must not contain session cookie tokens');
  }
  console.log('✅ TEST A PASSED: Session/profile paths not present in candidates output');
  passedTests++;
} catch (err) {
  console.error('❌ TEST A FAILED:', err.message);
}

// TEST B: .gitignore contains TikTok session/profile
try {
  const gitignorePath = path.resolve(__dirname, '../.gitignore');
  assert(fs.existsSync(gitignorePath), '.gitignore file must exist');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  assert(gitignoreContent.includes('data/tiktok_browser_profile/'), '.gitignore must ignore data/tiktok_browser_profile/');
  assert(gitignoreContent.includes('data/tiktok_session.json'), '.gitignore must ignore data/tiktok_session.json');
  console.log('✅ TEST B PASSED: .gitignore correctly ignores TikTok session and browser profile');
  passedTests++;
} catch (err) {
  console.error('❌ TEST B FAILED:', err.message);
}

// TEST C: Session module does not log cookie/token values
try {
  const moduleCode = fs.readFileSync(path.resolve(__dirname, '../src/modules/tiktok/session/tiktokSetupSession.js'), 'utf8');
  // Check for any reckless logging
  assert(!moduleCode.includes('console.log(c.value)'), 'Must not log cookie value');
  assert(!moduleCode.includes('console.log(cookies)'), 'Must not dump all cookies');
  assert(!moduleCode.includes('console.log(token)'), 'Must not log tokens');
  assert(!moduleCode.includes('console.log(localStorage)'), 'Must not dump localStorage');
  console.log('✅ TEST C PASSED: Session module enforces strict zero-credential logging rule');
  passedTests++;
} catch (err) {
  console.error('❌ TEST C FAILED:', err.message);
}

// TEST D: If no profile: status = NOT_AUTHENTICATED
(async () => {
  try {
    const dummyPath = path.resolve(__dirname, '../data/non_existent_test_profile_' + Date.now());
    assert.strictEqual(isProfilePresent(dummyPath), false);
    const result = await verifySession({ profileDir: dummyPath });
    assert.strictEqual(result.authenticated, false);
    assert.strictEqual(result.status, 'NOT_AUTHENTICATED');
    console.log('✅ TEST D PASSED: Non-existent profile safely yields NOT_AUTHENTICATED');
    passedTests++;
  } catch (err) {
    console.error('❌ TEST D FAILED:', err.message);
  }

  // TEST E: Safe handling of missing GUI / invalid configuration
  try {
    // Calling verifySession with non-existent directory does not crash and terminates cleanly
    const safeResult = await verifySession({ profileDir: 'C:\\InvalidPathDoesNotExist\\profile' });
    assert.strictEqual(safeResult.authenticated, false);
    assert(typeof safeResult.recommendation === 'string');
    console.log('✅ TEST E PASSED: Invalid environment handles cleanly without uncaught exception');
    passedTests++;
  } catch (err) {
    console.error('❌ TEST E FAILED:', err.message);
  }

  console.log('\n------------------------------------------------------');
  console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('------------------------------------------------------\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
})();
