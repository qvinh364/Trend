const fs = require('fs');
const path = require('path');
const cp = require('child_process');

console.log('=== STEP 3: PHYSICAL FILE VERIFICATION ===');
const cmdPath = path.resolve(__dirname, '../TikTok_Report.cmd');
let content = fs.readFileSync(cmdPath, 'binary');

// Ensure strict CRLF
if (!content.includes('\r\n')) {
  content = content.replace(/\n/g, '\r\n');
  fs.writeFileSync(cmdPath, Buffer.from(content, 'binary'));
  content = fs.readFileSync(cmdPath, 'binary');
}

const buf = Buffer.from(content, 'binary');

console.log('1. Bytes length:', buf.length);
console.log('2. First 9 bytes hex:', buf.subarray(0, 9).toString('hex'));
console.log('3. First 9 bytes text:', JSON.stringify(buf.subarray(0, 9).toString('ascii')));
const hasBom = (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf);
console.log('4. UTF-8 BOM present:', hasBom);
const asciiOnly = Array.from(buf).every(b => b < 128);
console.log('5. ASCII only (all bytes < 128):', asciiOnly);
const hasCrLf = content.includes('\r\n') && !content.replace(/\r\n/g, '').includes('\n');
console.log('6. CRLF on all lines:', hasCrLf);
const hasSingleQuote = buf.includes(39);
console.log('7. Contains single quote (\'):', hasSingleQuote);
const hasCdDp0 = content.includes('cd /d "%~dp0"');
console.log('8. Contains exact cd /d "%~dp0":', hasCdDp0);
const hasHardcodedPath = /D:[\\\/]Antigravity/i.test(content);
console.log('9. Has hardcoded path:', hasHardcodedPath);

console.log('\n=== STEP 4: SHORTCUT METADATA VERIFICATION ===');
const { inspectReportShortcut } = require('./manage_desktop_shortcut');
const scMeta = inspectReportShortcut();
console.log('Shortcut Path:', scMeta.shortcutPath);
console.log('Target Path:', scMeta.targetPath);
console.log('Working Directory:', scMeta.workingDirectory);
console.log('Target Correct:', scMeta.isTargetCorrect);
console.log('WorkDir Correct:', scMeta.isWorkDirCorrect);
const hasQuestionMark = (scMeta.targetPath && scMeta.targetPath.includes('?')) || (scMeta.workingDirectory && scMeta.workingDirectory.includes('?'));
console.log('Has corrupted question mark path:', hasQuestionMark);

console.log('\n=== STEP 5: CMD LAUNCHER TEST WITH --check ===');
const fullCmdPath = path.resolve(__dirname, '../TikTok_Report.cmd');
try {
  const result = cp.spawnSync('cmd.exe', ['/d', '/c', 'call', fullCmdPath, '--check'], {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..')
  });

  console.log('Exit code:', result.status);
  console.log('--- STDOUT ---');
  console.log(result.stdout || '(none)');
  console.log('--- STDERR ---');
  console.log(result.stderr || '(none)');

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const combined = stdout + '\n' + stderr;

  const hasReportReady = stdout.includes('REPORT_READY');
  const hasScan7 = stdout.includes('scan_7_1790357191593') && stdout.includes('\n7\n');
  const hasHtml = stdout.includes('tiktok_trend_report.html');

  const brokenPatterns = [
    'is not recognized as an internal or external command',
    'The system cannot find the path specified',
    'MODULE_NOT_FOUND',
    'REPORT_SCAN_ID_MISMATCH'
  ];

  const foundBroken = brokenPatterns.filter(p => combined.includes(p));

  console.log('\n=== ANALYSIS ===');
  console.log('REPORT_READY present:', hasReportReady);
  console.log('Scan #7 present:', hasScan7);
  console.log('HTML path present:', hasHtml);
  console.log('Broken command errors found:', foundBroken);
  console.log('Broken command errors absent:', foundBroken.length === 0);

  if (result.status === 0 && hasReportReady && hasScan7 && hasHtml && foundBroken.length === 0 && asciiOnly && !hasBom && hasCrLf) {
    console.log('\nRESULT: LAUNCHER_PARSER_FIXED');
  } else {
    console.log('\nRESULT: STILL_BROKEN');
  }
} catch (err) {
  console.error('CMD launch exception:', err);
}
