const fs = require('fs');

const storeData = JSON.parse(fs.readFileSync('data/store.json', 'utf-8'));
let indexHtml = fs.readFileSync('public/index.html', 'utf-8');
let appJs = fs.readFileSync('public/app.js', 'utf-8');

// Replace relative API fetch calls in appJs with full URL http://localhost:3000 if opened via file://
const apiReplacements = [
  "fetch('/api/stats'",
  "fetch('/api/group-posts'",
  "fetch('/api/trends'",
  "fetch('/api/scan-status'",
  "fetch('/api/groups/scrape-live'",
  "fetch('/api/social/scrape-live'",
  "fetch('/api/groups/import-cookie'"
];

apiReplacements.forEach(endpoint => {
  const rel = endpoint;
  const abs = endpoint.replace("'/api/", "'http://localhost:3000/api/");
  appJs = appJs.split(rel).join(abs);
});

// Calculate embedded stats
const totalPosts = storeData.group_posts.length;
const totalEngagement = storeData.group_posts.reduce((sum, p) => sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0), 0);
const totalTrends = (storeData.trends?.tiktok?.length || 0) + (storeData.trends?.threads?.length || 0);

const embeddedInit = `
  // Khởi tạo ngay từ dữ liệu nhúng sẵn (hiển thị lập tức cả khi offline)
  state.groupPosts = EMBEDDED_DATA.group_posts || [];
  state.trends = EMBEDDED_DATA.trends || { tiktok: [], threads: [] };
  state.stats = {
    totalPosts: ${totalPosts},
    totalEngagement: ${totalEngagement},
    totalTrends: ${totalTrends},
    lastUpdated: "${new Date().toISOString()}"
  };
  renderGroupPosts();
  renderTrends();
  renderStats();
`;

// Insert embeddedInit right at the start of DOMContentLoaded in appJs
appJs = appJs.replace('document.addEventListener(\'DOMContentLoaded\', async () => {', 'document.addEventListener(\'DOMContentLoaded\', async () => {\n' + embeddedInit);

const inlineScript = `
  <script id="embeddedData" type="application/json">
${JSON.stringify({ group_posts: storeData.group_posts, trends: storeData.trends }, null, 2)}
  </script>
  <script>
    const EMBEDDED_DATA = JSON.parse(document.getElementById('embeddedData').textContent);
    ${appJs}
  </script>
`;

const startHtml = indexHtml.replace('<script src="app.js"></script>', inlineScript);

fs.writeFileSync('start.html', startHtml, 'utf-8');
console.log('Successfully generated start.html (Size:', fs.statSync('start.html').size, 'bytes)');
