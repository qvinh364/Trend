/**
 * TARGETED PRODUCTION SEARCH FLOW TEST SUITE
 * 
 * Verifies production Search UI inspection and extraction logic:
 * 1. Has video links/cards + no login + no captcha + no restriction text -> SEARCH_RESULTS_AVAILABLE
 * 2. 0 cards + no restriction text -> NO_RESULTS (NOT automatically ACCESS_RESTRICTED)
 * 3. Has confirmed restriction text -> ACCESS_RESTRICTED
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectSearchPageUi, extractTopicSearchCards } = require('../src/modules/tiktok/scan/secondScanOrchestrator');

function createMockPage({ bodyText = '', containers = [], videoLinks = [] }) {
  const mockDoc = {
    body: { innerText: bodyText },
    querySelector: (sel) => {
      if (sel.includes('login') && bodyText.includes('Log in')) return { exists: true };
      if (sel.includes('captcha') && bodyText.includes('Verify')) return { exists: true };
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('/video/')) return videoLinks;
      if (sel.includes('DivItemContainer') || sel.includes('search_video-item')) return containers;
      return [];
    }
  };

  return {
    evaluate: async (fn, arg) => {
      const prevDoc = global.document;
      try {
        global.document = mockDoc;
        return fn(arg);
      } finally {
        global.document = prevDoc;
      }
    },
    waitForSelector: async () => true,
    waitForTimeout: async () => true
  };
}

test('TEST 1: Video links/cards + no login/captcha/restriction -> SEARCH_RESULTS_AVAILABLE', async () => {
  const mockContainer1 = {
    tagName: 'DIV',
    innerText: '@creator1\nVideo caption 1\n2d ago\n12.5K',
    querySelector: (sel) => {
      if (sel.includes('/video/')) return { href: 'https://www.tiktok.com/@creator1/video/7123456789' };
      if (sel.includes('/@')) return { href: 'https://www.tiktok.com/@creator1' };
      return null;
    }
  };

  const mockContainer2 = {
    tagName: 'DIV',
    innerText: '@creator2\nVideo caption 2\n5h ago\n3.2K',
    querySelector: (sel) => {
      if (sel.includes('/video/')) return { href: 'https://www.tiktok.com/@creator2/video/7987654321' };
      if (sel.includes('/@')) return { href: 'https://www.tiktok.com/@creator2' };
      return null;
    }
  };

  const page = createMockPage({
    bodyText: 'TikTok Search Results samdealruocden',
    containers: [mockContainer1, mockContainer2],
    videoLinks: [{ href: 'https://www.tiktok.com/@creator1/video/7123456789' }, { href: 'https://www.tiktok.com/@creator2/video/7987654321' }]
  });

  const uiState = await inspectSearchPageUi(page);
  assert.strictEqual(uiState.status, 'SEARCH_RESULTS_AVAILABLE');
  assert.strictEqual(uiState.login_wall_visible, false);
  assert.strictEqual(uiState.captcha_visible, false);
  assert.strictEqual(uiState.access_restricted, false);
  assert.strictEqual(uiState.video_link_count, 2);

  const cards = await extractTopicSearchCards(page, 5);
  assert.strictEqual(cards.length, 2);
  assert.strictEqual(cards[0].creator, '@creator1');
  assert.strictEqual(cards[1].creator, '@creator2');
  assert.strictEqual(cards[0].video_url, 'https://www.tiktok.com/@creator1/video/7123456789');
});

test('TEST 2: 0 cards + no restriction text -> NO_RESULTS (never automatically ACCESS_RESTRICTED)', async () => {
  const page = createMockPage({
    bodyText: 'No results found for samdealruocden. Try searching for something else.',
    containers: [],
    videoLinks: []
  });

  const uiState = await inspectSearchPageUi(page);
  assert.strictEqual(uiState.status, 'NO_RESULTS');
  assert.notStrictEqual(uiState.status, 'ACCESS_RESTRICTED', '0 cards must never automatically be ACCESS_RESTRICTED');
  assert.strictEqual(uiState.access_restricted, false);
  assert.strictEqual(uiState.video_link_count, 0);

  const cards = await extractTopicSearchCards(page, 5);
  assert.strictEqual(cards.length, 0);
});

test('TEST 3: Confirmed restriction text -> ACCESS_RESTRICTED', async () => {
  const page = createMockPage({
    bodyText: 'Something went wrong. Please check your connection and try again.',
    containers: [],
    videoLinks: []
  });

  const uiState = await inspectSearchPageUi(page);
  assert.strictEqual(uiState.status, 'ACCESS_RESTRICTED');
  assert.strictEqual(uiState.access_restricted, true);
  assert.strictEqual(uiState.restriction_match, 'Something went wrong');
});
