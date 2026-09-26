/**
 * TIKTOK TREND RADAR HTML REPORT TEST SUITE (PHASE 5B)
 * 
 * Verifies:
 * 1. HTML generated successfully with <!DOCTYPE html>
 * 2. Ranked trends in ranked section
 * 3. Needs-more-data trends in needs-more-data section
 * 4. trend_score = null does NOT render 0 or 0/100, renders "Chưa đủ dữ liệu để chấm Trend Score"
 * 5. OB55: replication in available, momentum/cross_surface in missing, engagement in not scored
 * 6. Samdeal: score 69, previous 72, delta -3
 * 7. Evidence max 3
 * 8. HTML escaping prevents XSS injection
 * 9. Invalid URL does not become clickable link
 * 10. Self-contained: No external CDN, script, stylesheet, or font
 * 11. Deterministic rendering: identical input produces identical HTML
 * 12. Coverage mismatch fixture displays visible warning
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { renderTrendReportHtml } = require('../src/modules/tiktok/reporting/trendHtmlRenderer');
const { buildTrendReport } = require('../src/modules/tiktok/reporting/trendReportBuilder');

test('TEST 1 & 10: HTML generated successfully, self-contained, no external CDN/scripts/fonts', () => {
  const prodPath = path.resolve(__dirname, '../data/tiktok_results.json');
  const model = buildTrendReport(prodPath);
  const html = renderTrendReportHtml(model);

  assert.ok(html.startsWith('<!DOCTYPE html>'), 'Must start with <!DOCTYPE html>');
  assert.ok(html.includes('<html lang="vi">'), 'Must have html tag');
  assert.ok(html.includes('</html>'), 'Must have closing html tag');

  // Verify self-contained / no CDN / no external scripts / no external CSS
  assert.equal(html.includes('<script src='), false, 'Must not have external script tags');
  assert.equal(html.includes('<link rel="stylesheet"'), false, 'Must not have external stylesheet tags');
  assert.equal(html.includes('cdn.jsdelivr.net'), false, 'Must not use CDN');
  assert.equal(html.includes('fonts.googleapis.com'), false, 'Must not use Google Fonts');
  assert.equal(html.includes('<iframe'), false, 'Must not contain iframes');
  assert.equal(html.includes('fetch('), false, 'Must not contain fetch calls');
});

test('TEST 2 & 6: Ranked trend is in ranked section with accurate scores and delta (Samdeal)', () => {
  const prodPath = path.resolve(__dirname, '../data/tiktok_results.json');
  const model = buildTrendReport(prodPath);
  const html = renderTrendReportHtml(model);

  // Ranked section header
  assert.ok(html.includes('Xu Hướng Đủ Dữ Liệu Để Xếp Hạng'), 'Ranked section title must exist');

  // Samdeal presence in ranked section
  assert.ok(html.includes('hashtag:samdealruocden'), 'Samdeal must be rendered');
  assert.ok(html.includes('Săn deal rước đèn TikTok Shop'), 'Samdeal title must exist');

  // Score 69/100, previous 72, delta -3
  assert.ok(html.includes('69<span class="score-max">/100</span>'), 'Must display 69/100');
  assert.ok(html.includes('kỳ trước: 72'), 'Must show previous score 72');
  assert.ok(html.includes('-3'), 'Must show score delta -3');
  assert.ok(html.includes('HIGH CONFIDENCE'), 'Must show high confidence badge');
});

test('TEST 3 & 4: Needs-more-data trend is in needs-more-data section, NEVER 0/100, shows "Chưa đủ dữ liệu"', () => {
  const prodPath = path.resolve(__dirname, '../data/tiktok_results.json');
  const model = buildTrendReport(prodPath);
  const html = renderTrendReportHtml(model);

  // Needs more data section
  assert.ok(html.includes('Cần Thêm Dữ Liệu Trước Khi Xếp Hạng'), 'Needs more data section title must exist');
  assert.ok(html.includes('hashtag:ob55'), 'OB55 must be rendered');

  // Invariant: null is not 0
  assert.equal(html.includes('0/100'), false, 'Null trend score must NEVER be displayed as 0/100');
  assert.ok(html.includes('Chưa đủ dữ liệu để chấm Trend Score'), 'Must display un-scored banner');
  assert.ok(html.includes('55%'), 'Must show coverage 55%');
  assert.ok(html.includes('55/100 weight'), 'Must show available weight 55');
});

test('TEST 5: OB55 component breakdown: replication available, momentum/cross_surface missing, engagement not scored', () => {
  const prodPath = path.resolve(__dirname, '../data/tiktok_results.json');
  const model = buildTrendReport(prodPath);
  const html = renderTrendReportHtml(model);

  // Isolate OB55 card HTML
  const ob55CardStart = html.indexOf('hashtag:ob55');
  assert.ok(ob55CardStart !== -1);
  const ob55Html = html.slice(ob55CardStart, html.indexOf('<!-- FOOTER -->'));

  // Đã có dữ liệu must contain replication, creator_spread, freshness
  assert.ok(ob55Html.includes('Đã có dữ liệu'), 'Must have available section');
  assert.ok(ob55Html.includes('Mức độ nhân bản'), 'Replication must be in available section');
  assert.ok(ob55Html.includes('Độ lan tỏa creator'), 'Creator spread must be in available section');
  assert.ok(ob55Html.includes('Độ mới nội dung'), 'Freshness must be in available section');

  // Còn thiếu dữ liệu must contain momentum and cross_surface
  assert.ok(ob55Html.includes('Còn thiếu dữ liệu'), 'Must have missing section');
  assert.ok(ob55Html.includes('Đà tăng trưởng (Momentum)'), 'Momentum must be in missing section');
  assert.ok(ob55Html.includes('Tín hiệu liên nền tảng'), 'Cross surface must be in missing section');

  // Chưa được chấm trong Score V1 must contain engagement
  assert.ok(ob55Html.includes('Chưa được chấm trong Score V1'), 'Must have not-scored section');
  assert.ok(ob55Html.includes('Tương tác người dùng'), 'Engagement must be in not-scored section');

  // Coverage verified badge
  assert.ok(ob55Html.includes('Coverage verified: 55/55 weight'), 'Reconciliation badge must be verified');
});

test('TEST 7: Evidence selector displays max 3 items with safe links and creator info', () => {
  const prodPath = path.resolve(__dirname, '../data/tiktok_results.json');
  const model = buildTrendReport(prodPath);
  const html = renderTrendReportHtml(model);

  // Each card has max 3 evidence items
  const evidenceCardMatches = html.match(/class="evidence-card"/g) || [];
  assert.ok(evidenceCardMatches.length <= 6, 'Total evidence cards must be at most 6 (3 per topic * 2 topics)');
  assert.ok(html.includes('Xem video ↗'), 'Clickable evidence links must be generated');
  assert.ok(html.includes('target="_blank"'), 'Links must open in new tab');
  assert.ok(html.includes('rel="noopener noreferrer"'), 'Links must have noopener noreferrer');
});

test('TEST 8: HTML escaping prevents script injection and unescaped entities', () => {
  const maliciousTopic = {
    identity: {
      topic_id: 'hashtag:<script>alert("xss")</script>',
      title: 'Malicious & Bold <img src="x" onerror="alert(1)">',
      aliases: [],
      type: 'topic'
    },
    state: { lifecycle: 'CANDIDATE', confidence: 'LOW' },
    trend_score: { value: null, status: 'INSUFFICIENT_DATA', coverage: 0.5, available_weight: 50 },
    momentum: { value: null, status: 'UNKNOWN' },
    evidence_quality: { sample_size: 1, unique_creators: 1, known_timestamp_count: 0 },
    current_signals: {},
    quality: {
      classification: 'NEEDS_MORE_DATA',
      rankable: false,
      available_components: [],
      missing_components: [],
      not_scored_components: [],
      coverage_reconciliation: { matches: true, reported_available_weight: 50, derived_available_weight: 50 },
      source_limitations: []
    },
    evidence: [
      {
        video_url: 'https://example.com/safe',
        creator: '<script>evil()</script>',
        caption: 'Caption with <tag> and "quotes" & ampersands',
        published_at: '<script>hack()</script>'
      }
    ]
  };

  const model = {
    scan: { scan_number: 99, scan_id: 'scan_xss', execution_status: 'COMPLETED' },
    summary: { ranked_trend_count: 0, needs_more_data_count: 1 },
    source_health: {},
    ranked_trends: [],
    needs_more_data: [maliciousTopic]
  };

  const html = renderTrendReportHtml(model);
  assert.equal(html.includes('<script>alert'), false, 'Script tags must be escaped');
  assert.equal(html.includes('<img src="x"'), false, 'Img onerror tags must be escaped');
  assert.ok(html.includes('&lt;script&gt;alert'), 'Escaped entities must exist');
});

test('TEST 9: Invalid URLs do not become clickable links', () => {
  const topicWithBadUrl = {
    identity: { topic_id: 'hashtag:badurl', title: 'Bad URL Topic' },
    state: { lifecycle: 'CANDIDATE', confidence: 'LOW' },
    trend_score: { value: null },
    momentum: {},
    evidence_quality: {},
    current_signals: {},
    quality: { rankable: false, available_components: [], missing_components: [], not_scored_components: [] },
    evidence: [
      { video_url: 'javascript:alert(1)', creator: '@hacker', caption: 'Exploit' },
      { video_url: 'data:text/html,hack', creator: '@hacker2', caption: 'Data URI' },
      { video_url: null, creator: '@anon', caption: 'No link' }
    ]
  };

  const model = {
    scan: { scan_number: 1 },
    summary: {},
    source_health: {},
    ranked_trends: [],
    needs_more_data: [topicWithBadUrl]
  };

  const html = renderTrendReportHtml(model);
  assert.equal(html.includes('href="javascript:'), false, 'Must not render javascript: href');
  assert.equal(html.includes('href="data:'), false, 'Must not render data: href');
  assert.ok(html.includes('URL không khả dụng'), 'Must show fallback disabled text');
});

test('TEST 11: Deterministic rendering (identical model yields identical HTML string)', () => {
  const prodPath = path.resolve(__dirname, '../data/tiktok_results.json');
  const model1 = buildTrendReport(prodPath);
  const model2 = buildTrendReport(prodPath);

  const html1 = renderTrendReportHtml(model1);
  const html2 = renderTrendReportHtml(model2);

  assert.equal(html1, html2, 'Renderer must be 100% deterministic');
});

test('TEST 12: Coverage reconciliation mismatch renders visible warning', () => {
  const modelWithMismatch = {
    scan: { scan_number: 2 },
    summary: { ranked_trend_count: 1, needs_more_data_count: 0 },
    source_health: {},
    ranked_trends: [
      {
        identity: { topic_id: 'hashtag:mismatch', title: 'Mismatch Topic' },
        state: { lifecycle: 'RISING', confidence: 'HIGH' },
        trend_score: { value: 80, score_delta: 0 },
        momentum: { value: 60, status: 'STABLE' },
        evidence_quality: {},
        current_signals: {},
        quality: {
          rankable: true,
          available_components: [],
          missing_components: [],
          not_scored_components: [],
          coverage_reconciliation: {
            reported_available_weight: 95,
            derived_available_weight: 75,
            matches: false
          }
        },
        evidence: []
      }
    ],
    needs_more_data: []
  };

  const html = renderTrendReportHtml(modelWithMismatch);
  assert.ok(html.includes('Coverage reconciliation mismatch'), 'Must show visible warning');
  assert.ok(html.includes('reported 95 vs derived 75'), 'Must show mismatch numbers');
});
