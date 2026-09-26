/**
 * TIKTOK TREND RADAR HTML REPORT RENDERER (PHASE 5B)
 * 
 * Renders a self-contained, responsive, clean, and deterministic HTML report
 * directly from the production Trend Report model.
 * 
 * Rules:
 * 1. Self-contained: No CDN, no external CSS, no external fonts, no external scripts.
 * 2. Never re-calculate scores, re-rank, or alter the report model.
 * 3. Never convert null into 0.
 * 4. Missing data / un-scored topics are explicitly presented as "Chưa đủ dữ liệu để chấm Trend Score",
 *    never as weak or declining trends.
 * 5. Strict HTML escaping on all dynamic data.
 * 6. Valid HTTP/HTTPS links only with target="_blank" rel="noopener noreferrer".
 * 7. Pure deterministic rendering: identical input model produces identical HTML string.
 */

/**
 * Escapes characters for safe HTML insertion
 * @param {*} str 
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates whether a URL is a safe HTTP or HTTPS link
 * @param {string} url 
 * @returns {boolean}
 */
function isValidHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  return (trimmed.startsWith('https://') || trimmed.startsWith('http://')) &&
         !trimmed.startsWith('javascript:') &&
         !trimmed.startsWith('data:');
}

/**
 * Safe formatting for nullable values
 * @param {*} val 
 * @param {string} fallback 
 * @returns {string}
 */
function formatNullable(val, fallback = '—') {
  if (val === null || val === undefined || val === '') return fallback;
  return escapeHtml(val);
}

/**
 * Formats score delta with explicit +/- signs
 * @param {number|null} delta 
 * @returns {string}
 */
function formatScoreDelta(delta) {
  if (typeof delta !== 'number' || isNaN(delta)) return '—';
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '0';
}

/**
 * Formats ratio or coverage into integer percentage
 * @param {number|null} cov 
 * @returns {string}
 */
function formatCoverage(cov) {
  if (typeof cov !== 'number' || isNaN(cov)) return '—';
  return `${Math.round(cov * 100)}%`;
}

/**
 * Formats integers with comma grouping
 * @param {number|null} num 
 * @returns {string}
 */
function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) return '—';
  return num.toLocaleString('en-US');
}

/**
 * Friendly Vietnamese label for standard component names
 * @param {string} name 
 * @returns {string}
 */
function formatComponentName(name) {
  const map = {
    creator_spread: 'Độ lan tỏa creator',
    freshness: 'Độ mới nội dung',
    replication: 'Mức độ nhân bản',
    cross_surface: 'Tín hiệu liên nền tảng',
    momentum: 'Đà tăng trưởng (Momentum)',
    engagement: 'Tương tác người dùng'
  };
  return map[name] || name;
}

/**
 * Render Representative Evidence Items
 * @param {Array<Object>} evidenceList 
 * @returns {string}
 */
function renderEvidenceSection(evidenceList = []) {
  if (!Array.isArray(evidenceList) || evidenceList.length === 0) {
    return '<div class="no-evidence">Không có mẫu video quan sát.</div>';
  }

  const itemsHtml = evidenceList.map((item, idx) => {
    const creatorText = item.creator ? `@${escapeHtml(item.creator.replace(/^@/, ''))}` : 'Creator ẩn danh';
    const dateText = item.published_at ? escapeHtml(item.published_at) : 'Thời gian: —';
    const captionText = item.caption ? escapeHtml(item.caption) : '(Không có chú thích)';
    
    let linkHtml = '';
    if (isValidHttpUrl(item.video_url)) {
      linkHtml = `<a href="${escapeHtml(item.video_url)}" target="_blank" rel="noopener noreferrer" class="evidence-link">Xem video ↗</a>`;
    } else {
      linkHtml = `<span class="evidence-link-disabled">URL không khả dụng</span>`;
    }

    return `
      <div class="evidence-card">
        <div class="evidence-header">
          <span class="evidence-creator">${creatorText}</span>
          <span class="evidence-date">${dateText}</span>
        </div>
        <div class="evidence-caption">${captionText}</div>
        <div class="evidence-footer">${linkHtml}</div>
      </div>
    `;
  }).join('');

  return `<div class="evidence-grid">${itemsHtml}</div>`;
}

/**
 * Render Quality Diagnostics (Available, Missing, Not Scored, Reconciliation)
 * @param {Object} quality 
 * @returns {string}
 */
function renderQualityDiagnostics(quality = {}) {
  const available = Array.isArray(quality.available_components) ? quality.available_components : [];
  const missing = Array.isArray(quality.missing_components) ? quality.missing_components : [];
  const notScored = Array.isArray(quality.not_scored_components) ? quality.not_scored_components : [];
  const reconciliation = quality.coverage_reconciliation || {};

  // 1. Available Components
  let availableHtml = '';
  if (available.length > 0) {
    const items = available.map(c => `
      <li class="diag-item diag-ok">
        <span class="diag-bullet">✓</span>
        <strong>${escapeHtml(formatComponentName(c.component))}</strong>
        <span class="diag-weight">(${c.weight || 0} pts)</span>
      </li>
    `).join('');
    availableHtml = `
      <div class="diag-group">
        <div class="diag-group-title text-success">Đã có dữ liệu (${available.length})</div>
        <ul class="diag-list">${items}</ul>
      </div>
    `;
  }

  // 2. Missing Components
  let missingHtml = '';
  if (missing.length > 0) {
    const items = missing.map(c => `
      <li class="diag-item diag-missing">
        <span class="diag-bullet">✕</span>
        <strong>${escapeHtml(formatComponentName(c.component))}</strong>
        <span class="diag-weight">(${c.weight || 0} pts)</span>:
        <span class="diag-desc">${escapeHtml(c.description || c.reason)}</span>
      </li>
    `).join('');
    missingHtml = `
      <div class="diag-group">
        <div class="diag-group-title text-warning">Còn thiếu dữ liệu (${missing.length})</div>
        <ul class="diag-list">${items}</ul>
      </div>
    `;
  }

  // 3. Not Scored Components
  let notScoredHtml = '';
  if (notScored.length > 0) {
    const items = notScored.map(c => `
      <li class="diag-item diag-unscored">
        <span class="diag-bullet">○</span>
        <strong>${escapeHtml(formatComponentName(c.component))}</strong>
        <span class="diag-weight">(${c.weight || 0} pts)</span>:
        <span class="diag-desc">${escapeHtml(c.description || 'Chưa tính trong phiên bản V1')}</span>
      </li>
    `).join('');
    notScoredHtml = `
      <div class="diag-group">
        <div class="diag-group-title text-muted">Chưa được chấm trong Score V1 (${notScored.length})</div>
        <ul class="diag-list">${items}</ul>
      </div>
    `;
  }

  // 4. Reconciliation Badge
  let reconHtml = '';
  if (reconciliation.matches === true) {
    reconHtml = `
      <div class="reconcile-badge reconcile-success">
        ✓ Coverage verified: ${reconciliation.reported_available_weight}/${reconciliation.derived_available_weight} weight
      </div>
    `;
  } else if (reconciliation.matches === false) {
    reconHtml = `
      <div class="reconcile-badge reconcile-warning">
        ⚠️ Coverage reconciliation mismatch: reported ${reconciliation.reported_available_weight} vs derived ${reconciliation.derived_available_weight}
      </div>
    `;
  }

  return `
    <div class="quality-diagnostics">
      <div class="diag-grid">
        ${availableHtml}
        ${missingHtml}
        ${notScoredHtml}
      </div>
      ${reconHtml}
    </div>
  `;
}

/**
 * Render a Single Ranked Trend Card
 * @param {Object} trend 
 * @param {number} rankNumber 
 * @returns {string}
 */
function renderRankedTrendCard(trend, rankNumber) {
  const identity = trend.identity || {};
  const state = trend.state || {};
  const score = trend.trend_score || {};
  const momentum = trend.momentum || {};
  const eq = trend.evidence_quality || {};
  const cs = trend.current_signals || {};
  const evidence = trend.evidence || [];

  const deltaFormatted = formatScoreDelta(score.score_delta);
  const deltaClass = (score.score_delta > 0) ? 'delta-pos' : ((score.score_delta < 0) ? 'delta-neg' : 'delta-zero');

  // CC Signals snippet if available
  let ccHtml = '';
  if (cs.cc_rank !== null || cs.cc_posts !== null || cs.cc_views !== null) {
    ccHtml = `
      <div class="signal-pill">
        Creative Center 7d: #${formatNullable(cs.cc_rank)} • ${formatNumber(cs.cc_posts)} posts • ${formatNumber(cs.cc_views)} views
      </div>
    `;
  }

  return `
    <div class="trend-card ranked-card">
      <div class="trend-card-top">
        <div class="rank-badge">#${rankNumber}</div>
        <div class="trend-title-block">
          <h3 class="trend-title">${escapeHtml(identity.title)}</h3>
          <span class="trend-id-badge">${escapeHtml(identity.topic_id)}</span>
        </div>
        <div class="trend-state-badges">
          <span class="badge badge-lifecycle">${escapeHtml(state.lifecycle)}</span>
          <span class="badge badge-confidence-${escapeHtml((state.confidence || 'low').toLowerCase())}">
            ${escapeHtml(state.confidence)} CONFIDENCE
          </span>
        </div>
      </div>

      <div class="metrics-dashboard">
        <div class="metric-box primary-score-box">
          <span class="metric-label">TREND SCORE</span>
          <div class="metric-score-value">${score.value !== null ? score.value : '—'}<span class="score-max">/100</span></div>
          <div class="metric-sub-delta ${deltaClass}">
            Thay đổi: <strong>${deltaFormatted}</strong> (kỳ trước: ${score.previous_score !== null ? score.previous_score : '—'})
          </div>
        </div>

        <div class="metric-box">
          <span class="metric-label">MOMENTUM</span>
          <div class="metric-value">${momentum.value !== null ? momentum.value : '—'}</div>
          <div class="metric-sub">${escapeHtml(momentum.status)} (Coverage: ${formatCoverage(momentum.coverage)})</div>
        </div>

        <div class="metric-box">
          <span class="metric-label">SCORE COVERAGE</span>
          <div class="metric-value">${formatCoverage(score.coverage)}</div>
          <div class="metric-sub">Available: ${score.available_weight !== null ? score.available_weight : '—'}/100</div>
        </div>

        <div class="metric-box">
          <span class="metric-label">DỮ LIỆU TÌM KIẾM</span>
          <div class="metric-value">${eq.sample_size} videos</div>
          <div class="metric-sub">${eq.unique_creators} creators • ${eq.known_timestamp_count} timestamps</div>
        </div>
      </div>

      ${ccHtml}

      <div class="card-section-title">Chẩn đoán dữ liệu thành phần (V1 Methodology)</div>
      ${renderQualityDiagnostics(trend.quality)}

      <div class="card-section-title">Video minh chứng tiêu biểu (${evidence.length})</div>
      ${renderEvidenceSection(evidence)}
    </div>
  `;
}

/**
 * Render a Single Needs More Data Card
 * @param {Object} trend 
 * @returns {string}
 */
function renderNeedsMoreDataCard(trend) {
  const identity = trend.identity || {};
  const state = trend.state || {};
  const score = trend.trend_score || {};
  const eq = trend.evidence_quality || {};
  const evidence = trend.evidence || [];
  const limitations = (trend.quality && Array.isArray(trend.quality.source_limitations))
    ? trend.quality.source_limitations
    : [];

  let limitationsHtml = '';
  if (limitations.length > 0) {
    const list = limitations.map(l => `
      <li><strong>${escapeHtml(l.source)}</strong>: ${escapeHtml(l.limitation)} — ${escapeHtml(l.impact)}</li>
    `).join('');
    limitationsHtml = `
      <div class="limitations-box">
        <div class="limitations-title">Giới hạn thu thập từ nguồn:</div>
        <ul class="limitations-list">${list}</ul>
      </div>
    `;
  }

  return `
    <div class="trend-card unscored-card">
      <div class="trend-card-top">
        <div class="unscored-icon">⏳</div>
        <div class="trend-title-block">
          <h3 class="trend-title">${escapeHtml(identity.title)}</h3>
          <span class="trend-id-badge">${escapeHtml(identity.topic_id)}</span>
        </div>
        <div class="trend-state-badges">
          <span class="badge badge-lifecycle">${escapeHtml(state.lifecycle)}</span>
          <span class="badge badge-confidence-${escapeHtml((state.confidence || 'low').toLowerCase())}">
            ${escapeHtml(state.confidence)} CONFIDENCE
          </span>
        </div>
      </div>

      <div class="unscored-alert-banner">
        <div class="unscored-alert-header">Chưa đủ dữ liệu để chấm Trend Score</div>
        <div class="unscored-alert-desc">
          Coverage hiện tại đạt <strong>${formatCoverage(score.coverage)}</strong> (${score.available_weight !== null ? score.available_weight : '—'}/100 weight), 
          dưới ngưỡng tối thiểu <strong>80%</strong> theo hợp đồng Trend Score V1.
          Chủ đề đang được bảo lưu quan sát, không bị đánh đồng với xu hướng suy giảm hay điểm 0.
        </div>
      </div>

      <div class="metrics-dashboard metrics-unscored-grid">
        <div class="metric-box">
          <span class="metric-label">MẪU DỮ LIỆU THU THẬP</span>
          <div class="metric-value">${eq.sample_size} videos</div>
          <div class="metric-sub">${eq.unique_creators} creators độc lập</div>
        </div>

        <div class="metric-box">
          <span class="metric-label">ĐỘ PHỦ THỜI GIAN</span>
          <div class="metric-value">${eq.known_timestamp_count}/${eq.sample_size}</div>
          <div class="metric-sub">Trạng thái: ${escapeHtml(eq.freshness_observation_status)}</div>
        </div>

        <div class="metric-box">
          <span class="metric-label">MỨC NHÂN BẢN</span>
          <div class="metric-value">${escapeHtml(eq.replication_status)}</div>
          <div class="metric-sub">Tìm kiếm: ${escapeHtml(eq.search_status)}</div>
        </div>
      </div>

      ${limitationsHtml}

      <div class="card-section-title">Chẩn đoán dữ liệu thành phần (V1 Methodology)</div>
      ${renderQualityDiagnostics(trend.quality)}

      <div class="card-section-title">Video minh chứng tiêu biểu (${evidence.length})</div>
      ${renderEvidenceSection(evidence)}
    </div>
  `;
}

/**
 * Render Source Health Overview Section
 * @param {Object} sourceHealth 
 * @returns {string}
 */
function renderSourceHealthSection(sourceHealth = {}) {
  const sources = sourceHealth.sources || {};
  const entries = Object.entries(sources);

  if (entries.length === 0) {
    return '<div class="empty-state">Không có thông tin trạng thái nguồn dữ liệu.</div>';
  }

  const itemsHtml = entries.map(([sourceName, data]) => {
    const isSuccess = data.status === 'SUCCESS' || data.status === 'SEARCH_RESULTS_AVAILABLE';
    const statusClass = isSuccess ? 'src-status-ok' : 'src-status-warn';
    const statusText = isSuccess ? escapeHtml(data.status) : 'Nguồn dữ liệu chưa khả dụng / bị hạn chế';
    
    let noteHtml = '';
    if (data.note) {
      noteHtml = `<div class="src-note">${escapeHtml(data.note)}</div>`;
    }
    if (data.error) {
      noteHtml += `<div class="src-error">${escapeHtml(data.error)}</div>`;
    }

    return `
      <div class="source-item">
        <div class="source-item-head">
          <span class="source-name">${escapeHtml(sourceName)}</span>
          <span class="source-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="source-meta">
          Tìm thấy: <strong>${data.raw_items_found || 0}</strong> • Giữ lại: <strong>${data.candidates_kept || 0}</strong>
        </div>
        ${noteHtml}
      </div>
    `;
  }).join('');

  return `<div class="source-grid">${itemsHtml}</div>`;
}

/**
 * Main HTML Report Renderer
 * @param {Object} reportModel Standard report model from buildTrendReport()
 * @returns {string} Fully self-contained HTML document
 */
function renderTrendReportHtml(reportModel) {
  if (!reportModel || typeof reportModel !== 'object') {
    throw new Error('renderTrendReportHtml requires a valid reportModel object');
  }

  const scan = reportModel.scan || {};
  const summary = reportModel.summary || {};
  const rankedTrends = Array.isArray(reportModel.ranked_trends) ? reportModel.ranked_trends : [];
  const needsMoreData = Array.isArray(reportModel.needs_more_data) ? reportModel.needs_more_data : [];
  const sourceHealth = reportModel.source_health || {};

  // Build Ranked Section
  let rankedSectionContent = '';
  if (rankedTrends.length > 0) {
    rankedSectionContent = rankedTrends.map((t, idx) => renderRankedTrendCard(t, idx + 1)).join('');
  } else {
    rankedSectionContent = '<div class="empty-state">Chưa có trend nào đủ dữ liệu để xếp hạng.</div>';
  }

  // Build Needs More Data Section
  let needsMoreDataContent = '';
  if (needsMoreData.length > 0) {
    needsMoreDataContent = needsMoreData.map(t => renderNeedsMoreDataCard(t)).join('');
  } else {
    needsMoreDataContent = '<div class="empty-state">Không có trend đang chờ bổ sung dữ liệu.</div>';
  }

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TikTok Trend Radar Report • Scan #${escapeHtml(scan.scan_number)}</title>
  <style>
    :root {
      --bg: #0f1117;
      --card-bg: #161922;
      --card-border: #232734;
      --text-main: #f0f2f5;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --accent-subtle: rgba(88, 166, 255, 0.12);
      --success: #3fb950;
      --success-subtle: rgba(63, 185, 80, 0.12);
      --warning: #d29922;
      --warning-subtle: rgba(210, 153, 34, 0.15);
      --danger: #f85149;
      --danger-subtle: rgba(248, 81, 73, 0.12);
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg);
      color: var(--text-main);
      font-family: var(--font);
      line-height: 1.5;
      padding: 24px 16px 64px;
    }

    .container {
      max-width: 1040px;
      margin: 0 auto;
    }

    /* HEADER */
    .header {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }
    .brand-badge {
      background: var(--accent-subtle);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.8px;
      padding: 4px 10px;
      border-radius: 6px;
      text-transform: uppercase;
    }
    .scan-id-tag {
      font-family: monospace;
      font-size: 13px;
      color: var(--text-muted);
    }
    .header-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      color: var(--text-main);
    }
    .header-meta {
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 20px;
    }

    /* SUMMARY STATS */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid var(--card-border);
    }
    .summary-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px 16px;
    }
    .summary-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .summary-val {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-main);
    }

    /* SECTION CONTAINERS */
    .section-block {
      margin-bottom: 32px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-count-badge {
      background: var(--card-border);
      color: var(--text-muted);
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 12px;
    }

    /* SOURCE HEALTH */
    .source-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 12px;
    }
    .source-item {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 14px;
    }
    .source-item-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      gap: 8px;
    }
    .source-name {
      font-weight: 600;
      font-size: 14px;
    }
    .source-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .src-status-ok {
      background: var(--success-subtle);
      color: var(--success);
    }
    .src-status-warn {
      background: var(--warning-subtle);
      color: var(--warning);
    }
    .source-meta {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .src-note, .src-error {
      font-size: 11px;
      line-height: 1.4;
      margin-top: 6px;
      padding: 6px 8px;
      border-radius: 4px;
    }
    .src-note {
      background: rgba(255, 255, 255, 0.03);
      color: var(--text-muted);
    }
    .src-error {
      background: var(--danger-subtle);
      color: var(--danger);
    }

    /* TREND CARDS */
    .trend-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .ranked-card {
      border-left: 4px solid var(--success);
    }
    .unscored-card {
      border-left: 4px solid var(--warning);
    }

    .trend-card-top {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 16px;
    }
    .rank-badge {
      background: var(--success);
      color: #000;
      font-weight: 800;
      font-size: 16px;
      padding: 4px 10px;
      border-radius: 6px;
    }
    .unscored-icon {
      background: var(--warning-subtle);
      color: var(--warning);
      font-size: 18px;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .trend-title-block {
      flex: 1;
      min-width: 240px;
    }
    .trend-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 4px;
    }
    .trend-id-badge {
      font-family: monospace;
      font-size: 12px;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.03);
      padding: 2px 6px;
      border-radius: 4px;
    }
    .trend-state-badges {
      display: flex;
      gap: 6px;
    }
    .badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-lifecycle {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-main);
    }
    .badge-confidence-high {
      background: var(--success-subtle);
      color: var(--success);
    }
    .badge-confidence-low {
      background: var(--warning-subtle);
      color: var(--warning);
    }

    /* UNSCORED ALERT BANNER */
    .unscored-alert-banner {
      background: var(--warning-subtle);
      border: 1px solid rgba(210, 153, 34, 0.3);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
    }
    .unscored-alert-header {
      font-size: 14px;
      font-weight: 700;
      color: var(--warning);
      margin-bottom: 4px;
    }
    .unscored-alert-desc {
      font-size: 13px;
      color: var(--text-main);
      line-height: 1.4;
    }

    /* METRICS DASHBOARD */
    .metrics-dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .metric-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px;
    }
    .primary-score-box {
      background: rgba(63, 185, 80, 0.05);
      border-color: rgba(63, 185, 80, 0.3);
    }
    .metric-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: block;
      margin-bottom: 4px;
    }
    .metric-score-value {
      font-size: 26px;
      font-weight: 800;
      color: var(--success);
    }
    .score-max {
      font-size: 14px;
      color: var(--text-muted);
      font-weight: 400;
    }
    .metric-value {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-main);
    }
    .metric-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .metric-sub-delta {
      font-size: 12px;
      margin-top: 4px;
    }
    .delta-pos { color: var(--success); }
    .delta-neg { color: var(--danger); }
    .delta-zero { color: var(--text-muted); }

    .signal-pill {
      font-size: 12px;
      color: var(--accent);
      background: var(--accent-subtle);
      padding: 6px 12px;
      border-radius: 6px;
      margin-bottom: 16px;
      display: inline-block;
    }

    .card-section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 16px 0 8px;
    }

    /* QUALITY DIAGNOSTICS */
    .quality-diagnostics {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .diag-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }
    .diag-group-title {
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .diag-list {
      list-style: none;
      font-size: 12px;
    }
    .diag-item {
      margin-bottom: 6px;
      line-height: 1.4;
    }
    .diag-bullet {
      display: inline-block;
      width: 14px;
      font-weight: 700;
    }
    .diag-ok .diag-bullet { color: var(--success); }
    .diag-missing .diag-bullet { color: var(--warning); }
    .diag-unscored .diag-bullet { color: var(--text-muted); }
    .diag-weight {
      color: var(--text-muted);
      font-size: 11px;
    }
    .diag-desc {
      color: var(--text-muted);
    }
    .text-success { color: var(--success); }
    .text-warning { color: var(--warning); }
    .text-muted { color: var(--text-muted); }

    .reconcile-badge {
      margin-top: 12px;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .reconcile-success {
      background: rgba(63, 185, 80, 0.08);
      color: var(--success);
      border: 1px solid rgba(63, 185, 80, 0.2);
    }
    .reconcile-warning {
      background: var(--danger-subtle);
      color: var(--danger);
      border: 1px solid rgba(248, 81, 73, 0.3);
    }

    /* LIMITATIONS BOX */
    .limitations-box {
      background: rgba(210, 153, 34, 0.08);
      border: 1px solid rgba(210, 153, 34, 0.2);
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 12px;
    }
    .limitations-title {
      font-weight: 700;
      color: var(--warning);
      margin-bottom: 4px;
    }
    .limitations-list {
      margin-left: 18px;
      color: var(--text-main);
    }

    /* EVIDENCE CARDS */
    .evidence-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 10px;
    }
    .evidence-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .evidence-header {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 6px;
    }
    .evidence-creator {
      font-weight: 600;
      color: var(--accent);
    }
    .evidence-date {
      color: var(--text-muted);
    }
    .evidence-caption {
      font-size: 12px;
      color: var(--text-main);
      line-height: 1.4;
      margin-bottom: 10px;
      word-break: break-word;
    }
    .evidence-footer {
      font-size: 11px;
    }
    .evidence-link {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
    }
    .evidence-link:hover {
      text-decoration: underline;
    }
    .evidence-link-disabled {
      color: var(--text-muted);
    }

    .empty-state {
      background: var(--card-bg);
      border: 1px dashed var(--card-border);
      border-radius: 8px;
      padding: 24px;
      text-align: center;
      color: var(--text-muted);
      font-size: 14px;
    }

    .footer {
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid var(--card-border);
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- HEADER -->
    <header class="header">
      <div class="header-top">
        <span class="brand-badge">TikTok Trend Radar</span>
        <span class="scan-id-tag">Scan ID: ${escapeHtml(scan.scan_id)}</span>
      </div>
      <h1 class="header-title">Báo Cáo Phân Tích Xu Hướng TikTok (Scan #${escapeHtml(scan.scan_number)})</h1>
      <div class="header-meta">
        <span>Thời gian quét: <strong>${escapeHtml(scan.scan_time)}</strong></span>
        <span>Thị trường: <strong>${escapeHtml(scan.market)}</strong></span>
        <span>Trạng thái: <strong>${escapeHtml(scan.execution_status)}</strong></span>
        <span>Chế độ: <strong>${escapeHtml(scan.browser_execution_mode)}</strong></span>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Đủ dữ liệu xếp hạng</div>
          <div class="summary-val text-success">${summary.ranked_trend_count !== undefined ? summary.ranked_trend_count : 0}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Cần thêm dữ liệu</div>
          <div class="summary-val text-warning">${summary.needs_more_data_count !== undefined ? summary.needs_more_data_count : 0}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Độ tin cậy cao (HIGH)</div>
          <div class="summary-val">${summary.high_confidence_count !== undefined ? summary.high_confidence_count : 0}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Nguồn bị giới hạn</div>
          <div class="summary-val text-muted">${summary.source_limitations_count !== undefined ? summary.source_limitations_count : 0}</div>
        </div>
      </div>
    </header>

    <!-- SECTION B: SOURCE HEALTH -->
    <section class="section-block">
      <h2 class="section-title">
        Tình Trạng Nguồn Thu Thập (Source Health)
        <span class="section-count-badge">${sourceHealth.total_sources || 0} nguồn</span>
      </h2>
      ${renderSourceHealthSection(sourceHealth)}
    </section>

    <!-- SECTION C: RANKED TRENDS -->
    <section class="section-block">
      <h2 class="section-title">
        Xu Hướng Đủ Dữ Liệu Để Xếp Hạng
        <span class="section-count-badge">${rankedTrends.length}</span>
      </h2>
      ${rankedSectionContent}
    </section>

    <!-- SECTION D: NEEDS MORE DATA -->
    <section class="section-block">
      <h2 class="section-title">
        Cần Thêm Dữ Liệu Trước Khi Xếp Hạng
        <span class="section-count-badge">${needsMoreData.length}</span>
      </h2>
      ${needsMoreDataContent}
    </section>

    <!-- FOOTER -->
    <footer class="footer">
      <div>TikTok Trend Radar & Content Copilot • Báo cáo tự động được xây dựng trực tiếp từ Trend Report Model (Score V1)</div>
      <div>Dữ liệu được xác thực đa nguồn, phân loại độc lập và đối soát bảo lưu độ tin cậy.</div>
    </footer>
  </div>
</body>
</html>`;
}

module.exports = {
  renderTrendReportHtml,
  renderRankedTrendCard,
  renderNeedsMoreDataCard,
  renderSourceHealthSection,
  renderEvidenceSection,
  renderQualityDiagnostics,
  escapeHtml,
  isValidHttpUrl,
  formatNullable,
  formatScoreDelta,
  formatCoverage,
  formatNumber,
  formatComponentName
};
