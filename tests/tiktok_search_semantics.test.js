/**
 * TARGETED SEARCH SEMANTICS & INBOX FILTERING TEST SUITE
 * 
 * Verifies exact production search status & card extraction semantics:
 * 1. Valid Search cards + no true captcha => SEARCH_RESULTS_AVAILABLE
 * 2. Mixed page (19 inbox + 12 valid search cards) + no true captcha => SEARCH_RESULTS_AVAILABLE, video_link_count === 12
 * 3. Inbox-only + no genuine No Results state => UNKNOWN_UI_STATE
 * 4. Genuine No Results state => NO_RESULTS
 * 5. Actual visible CAPTCHA challenge => CAPTCHA_REQUIRED
 * 6. Generic "verify" in bodyText without challenge DOM + valid cards => SEARCH_RESULTS_AVAILABLE (no false captcha)
 * 7. extractTopicSearchCards: inbox items do not create usable search evidence
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectSearchPageUi, extractTopicSearchCards } = require('../src/modules/tiktok/scan/secondScanOrchestrator');

function createMockPage({
  bodyText = '',
  containers = [],
  allVideoLinks = [],
  captchaElements = {},
  dialogElement = null
}) {
  const mockDoc = {
    body: { innerText: bodyText },
    querySelector: (sel) => {
      if (sel.includes('login-modal') || sel.includes('login-container') || sel.includes('form[action*="login"]')) {
        return null;
      }
      if (captchaElements[sel]) return captchaElements[sel];
      if ((sel.includes('dialog') || sel.includes('modal')) && dialogElement) return dialogElement;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('/video/')) return allVideoLinks;
      if (sel.includes('DivItemContainer') || sel.includes('search_video-item') || sel.includes('DivVideoCard')) {
        return containers;
      }
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

function createSearchCard(id, captionText = 'Video caption') {
  const videoHref = `https://www.tiktok.com/@creator_${id}/video/70000000000000000${id}`;
  const userHref = `https://www.tiktok.com/@creator_${id}`;
  const videoLinkObj = {
    href: videoHref,
    closest: (sel) => null,
    getAttribute: () => null
  };
  return {
    tagName: 'DIV',
    className: 'css-17ru8d3-5e6d46e3--DivItemContainerV2 e17fgske7',
    innerText: `@creator_${id}\n${captionText}\n2d ago\n10K`,
    getAttribute: (name) => null,
    closest: (sel) => null,
    querySelector: (sel) => {
      if (sel.includes('/video/')) return videoLinkObj;
      if (sel.includes('/@')) return { href: userHref };
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('/video/')) return [videoLinkObj];
      return [];
    },
    videoLinkObj
  };
}

function createInboxItem(id, text = 'user liked your comment · 8-16reviewchanthat: text') {
  const videoHref = `https://www.tiktok.com/@inbox_${id}/video/80000000000000000${id}`;
  const inboxContainer = {
    tagName: 'DIV',
    className: 'css-k33lba-5e6d46e3--DivItemContainer e4738hn0',
    innerText: text,
    getAttribute: (name) => (name === 'data-e2e' ? 'inbox-list-item' : null),
    closest: (sel) => (sel.includes('inbox-list-item') ? inboxContainer : null),
    querySelector: (sel) => {
      if (sel.includes('/video/')) return videoLinkObj;
      if (sel.includes('/@')) return { href: `https://www.tiktok.com/@inbox_${id}` };
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('/video/')) return [videoLinkObj];
      return [];
    }
  };
  const videoLinkObj = {
    href: videoHref,
    closest: (sel) => (sel.includes('inbox-list-item') ? inboxContainer : null),
    getAttribute: () => null
  };
  inboxContainer.videoLinkObj = videoLinkObj;
  return inboxContainer;
}

test('1. Valid Search cards + no true captcha => SEARCH_RESULTS_AVAILABLE', async () => {
  const card1 = createSearchCard(1);
  const card2 = createSearchCard(2);
  const page = createMockPage({
    bodyText: 'TikTok Search Results samdealruocden',
    containers: [card1, card2],
    allVideoLinks: [card1.videoLinkObj, card2.videoLinkObj]
  });

  const uiState = await inspectSearchPageUi(page);
  assert.strictEqual(uiState.status, 'SEARCH_RESULTS_AVAILABLE');
  assert.strictEqual(uiState.video_link_count, 2);
  assert.strictEqual(uiState.captcha_visible, false);
});

test('2. Mixed page: 19 inbox + 12 valid Search cards => SEARCH_RESULTS_AVAILABLE, video_link_count === 12', async () => {
  const inboxItems = Array.from({ length: 19 }, (_, i) => createInboxItem(i + 1));
  const validCards = Array.from({ length: 12 }, (_, i) => createSearchCard(i + 1));
  const allContainers = [...inboxItems, ...validCards];
  const allLinks = allContainers.map(c => c.videoLinkObj);

  const page = createMockPage({
    bodyText: 'Search page with mixed notifications and results',
    containers: allContainers,
    allVideoLinks: allLinks
  });

  const uiState = await inspectSearchPageUi(page);
  assert.strictEqual(uiState.status, 'SEARCH_RESULTS_AVAILABLE');
  assert.strictEqual(uiState.video_link_count, 12, 'Only the 12 valid search cards must be counted');
  assert.strictEqual(uiState.inbox_count, 19);
  assert.strictEqual(uiState.container_count, 12);
});

test('3. Inbox-only + no No Results state => UNKNOWN_UI_STATE (never default to NO_RESULTS)', async () => {
  const inboxItems = Array.from({ length: 5 }, (_, i) => createInboxItem(i + 1));
  const page = createMockPage({
    bodyText: 'Inbox notifications feed',
    containers: inboxItems,
    allVideoLinks: inboxItems.map(c => c.videoLinkObj)
  });

  const uiState = await inspectSearchPageUi(page);
  assert.strictEqual(uiState.status, 'UNKNOWN_UI_STATE');
  assert.notStrictEqual(uiState.status, 'NO_RESULTS', 'Must not falsely default to NO_RESULTS on inbox-only page');
  assert.strictEqual(uiState.video_link_count, 0);
  assert.strictEqual(uiState.inbox_count, 5);
});

test('4. Genuine No Results state => NO_RESULTS', async () => {
  const page = createMockPage({
    bodyText: 'No results found for xyz. Try searching for something else.',
    containers: [],
    allVideoLinks: []
  });

  const uiState = await inspectSearchPageUi(page);
  assert.strictEqual(uiState.status, 'NO_RESULTS');
  assert.strictEqual(uiState.no_results_text, true);
  assert.strictEqual(uiState.video_link_count, 0);
});

test('5. Actual visible CAPTCHA challenge => CAPTCHA_REQUIRED', async () => {
  const card1 = createSearchCard(1);
  const page = createMockPage({
    bodyText: 'TikTok challenge',
    containers: [card1],
    allVideoLinks: [card1.videoLinkObj],
    captchaElements: {
      '#sec-sdk-captcha-drag-wrapper': {
        offsetParent: {}, // visible
        getBoundingClientRect: () => ({ width: 300, height: 200 })
      }
    }
  });

  const uiState = await inspectSearchPageUi(page);
  assert.strictEqual(uiState.status, 'CAPTCHA_REQUIRED');
  assert.strictEqual(uiState.captcha_visible, true);
});

test('6. Generic "verify" in bodyText without challenge DOM + valid cards => SEARCH_RESULTS_AVAILABLE', async () => {
  const card1 = createSearchCard(1, 'Please verify your phone number to claim coupon');
  const page = createMockPage({
    bodyText: 'Top video: Please verify your phone number or do Security Check for coupon',
    containers: [card1],
    allVideoLinks: [card1.videoLinkObj],
    captchaElements: {
      'div[class*="captcha"]': {
        offsetParent: null, // hidden / inactive
        getBoundingClientRect: () => ({ width: 0, height: 0 })
      }
    }
  });

  const uiState = await inspectSearchPageUi(page);
  assert.strictEqual(uiState.status, 'SEARCH_RESULTS_AVAILABLE');
  assert.strictEqual(uiState.captcha_visible, false, 'Generic verify text must not cause false CAPTCHA_REQUIRED');
});

test('7. extractTopicSearchCards: inbox items do not create usable search evidence', async () => {
  const inbox1 = createInboxItem(1, 'User liked your comment · 8-16reviewchanthat: text');
  const inbox2 = createInboxItem(2, 'User liked your comment · 9-17reviewchanthat: text');
  const valid1 = createSearchCard(10, 'Real OB55 weapon adjustment video');

  const page = createMockPage({
    bodyText: 'Search results',
    containers: [inbox1, inbox2, valid1],
    allVideoLinks: [inbox1.videoLinkObj, inbox2.videoLinkObj, valid1.videoLinkObj]
  });

  const cards = await extractTopicSearchCards(page, 10);
  assert.strictEqual(cards.length, 1);
  assert.strictEqual(cards[0].video_url, valid1.videoLinkObj.href);
  assert.ok(!cards[0].caption.includes('reviewchanthat'), 'Inbox item must be completely ignored');
});
