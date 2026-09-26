/**
 * TARGETED CREATIVE CENTER RESILIENCE TEST SUITE
 * 
 * Verifies resilience enhancements for Creative Center collector:
 * 1. Successful CC navigation => SUCCESS
 * 2. First transient timeout + retry success => SUCCESS
 * 3. Repeated timeout => FAILED cleanly (no infinite retry, no crash)
 * 4. DNS failure => FAILED cleanly immediately (no futile retry)
 * 5. Failure does not crash overall collection / scan
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { scrapeCreativeCenterPeriod } = require('../src/modules/tiktok/discovery/creativeCenterCollector');

function createMockPage({ gotoBehavior = () => Promise.resolve(), evaluateResult = { items: [], hasLoginGate: false } }) {
  let gotoCallCount = 0;
  return {
    getGotoCallCount: () => gotoCallCount,
    goto: async (url, opts) => {
      gotoCallCount++;
      return gotoBehavior(gotoCallCount, url, opts);
    },
    waitForTimeout: async () => {},
    evaluate: async () => evaluateResult
  };
}

test('1. Successful CC navigation => SUCCESS', async () => {
  const page = createMockPage({
    gotoBehavior: () => Promise.resolve(),
    evaluateResult: {
      items: [{ tag: '#ob55', fullRowText: '1 | #ob55 | Games | 100K posts | 10M views' }],
      hasLoginGate: false
    }
  });

  const { runInfo, rawList } = await scrapeCreativeCenterPeriod(page, 7);
  assert.strictEqual(runInfo.status, 'SUCCESS');
  assert.strictEqual(runInfo.error, null);
  assert.strictEqual(page.getGotoCallCount(), 1);
  assert.strictEqual(rawList.length, 1);
  assert.strictEqual(rawList[0].tag, '#ob55');
});

test('2. First transient timeout + retry success => SUCCESS', async () => {
  const page = createMockPage({
    gotoBehavior: (callCount) => {
      if (callCount === 1) {
        throw new Error('page.goto: Timeout 30000ms exceeded.');
      }
      return Promise.resolve();
    },
    evaluateResult: {
      items: [{ tag: '#freefire', fullRowText: '1 | #freefire | Games | 50K posts | 5M views' }],
      hasLoginGate: false
    }
  });

  const { runInfo, rawList } = await scrapeCreativeCenterPeriod(page, 7);
  assert.strictEqual(runInfo.status, 'SUCCESS');
  assert.strictEqual(runInfo.error, null);
  assert.strictEqual(page.getGotoCallCount(), 2, 'Should retry once after transient timeout');
  assert.strictEqual(rawList.length, 1);
});

test('3. Repeated timeout => FAILED cleanly', async () => {
  const page = createMockPage({
    gotoBehavior: () => {
      throw new Error('page.goto: Timeout 30000ms exceeded.');
    }
  });

  const { runInfo, rawList } = await scrapeCreativeCenterPeriod(page, 7);
  assert.strictEqual(runInfo.status, 'FAILED');
  assert.ok(runInfo.error.includes('Timeout'));
  assert.strictEqual(page.getGotoCallCount(), 2, 'Must stop after max 2 attempts (1 retry)');
  assert.strictEqual(rawList.length, 0);
});

test('4. DNS failure => FAILED cleanly immediately without retry', async () => {
  const page = createMockPage({
    gotoBehavior: () => {
      throw new Error('net::ERR_NAME_NOT_RESOLVED at https://ads.tiktok.com/...');
    }
  });

  const { runInfo, rawList } = await scrapeCreativeCenterPeriod(page, 30);
  assert.strictEqual(runInfo.status, 'FAILED');
  assert.ok(runInfo.error.includes('ERR_NAME_NOT_RESOLVED'));
  assert.strictEqual(page.getGotoCallCount(), 1, 'Must NOT retry on DNS resolution error');
  assert.strictEqual(rawList.length, 0);
});

test('5. Failure does not crash overall collection / caller', async () => {
  const page = createMockPage({
    gotoBehavior: () => {
      throw new Error('Fatal socket failure');
    }
  });

  let threw = false;
  let result = null;
  try {
    result = await scrapeCreativeCenterPeriod(page, 7);
  } catch (err) {
    threw = true;
  }

  assert.strictEqual(threw, false, 'scrapeCreativeCenterPeriod must catch all errors and return cleanly');
  assert.strictEqual(result.runInfo.status, 'FAILED');
  assert.ok(Array.isArray(result.rawList));
});
