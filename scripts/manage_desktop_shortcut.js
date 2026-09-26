/**
 * DESKTOP SHORTCUT MANAGER & VERIFIER
 * 
 * Accurately creates and verifies the Windows Desktop shortcuts:
 * 1. "TikTok Trend Radar - Scan.lnk"   -> "TikTok_Scan_Interactive.cmd"
 * 2. "TikTok Trend Radar - Report.lnk" -> "TikTok_Report.cmd"
 * 
 * Uses native Windows IShellLinkW via PowerShell Add-Type to ensure
 * Vietnamese characters (e.g. 'Update tin tức') are preserved 100%
 * accurately without ANSI / OEM code page corruption.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LAUNCHER_PATH = path.resolve(PROJECT_ROOT, 'TikTok_Scan_Interactive.cmd');
const REPORT_LAUNCHER_PATH = path.resolve(PROJECT_ROOT, 'TikTok_Report.cmd');

const DESKTOP_DIR = path.join(os.homedir(), 'Desktop');
const SHORTCUT_PATH = path.join(DESKTOP_DIR, 'TikTok Trend Radar - Scan.lnk');
const REPORT_SHORTCUT_PATH = path.join(DESKTOP_DIR, 'TikTok Trend Radar - Report.lnk');

const CSHARP_SHORTCUT_HELPER = `
using System;
using System.Text;
using System.Runtime.InteropServices;

[ComImport]
[Guid("00021401-0000-0000-C000-000000000046")]
public class ShellLink {}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("000214F9-0000-0000-C000-000000000046")]
public interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cch);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cch);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cch);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cch, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("0000010b-0000-0000-C000-000000000046")]
public interface IPersistFile {
    void GetClassID(out Guid pClassID);
    void IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, [MarshalAs(UnmanagedType.Bool)] bool fRemember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
    void GetCurFile([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder ppszFileName);
}

public class NativeShortcutHelper {
    public static void CreateShortcut(string shortcutPath, string targetPath, string workDir, string description) {
        var link = (IShellLinkW)new ShellLink();
        link.SetPath(targetPath);
        link.SetWorkingDirectory(workDir);
        link.SetDescription(description);
        var file = (IPersistFile)link;
        file.Save(shortcutPath, true);
    }

    public static string[] ReadShortcut(string shortcutPath) {
        var link = (IShellLinkW)new ShellLink();
        var file = (IPersistFile)link;
        file.Load(shortcutPath, 0);
        var sbPath = new StringBuilder(260);
        link.GetPath(sbPath, 260, IntPtr.Zero, 0);
        var sbDir = new StringBuilder(260);
        link.GetWorkingDirectory(sbDir, 260);
        return new string[] { sbPath.ToString(), sbDir.ToString() };
    }
}
`;

function createGenericShortcut(scPath, targetPath, workDir, description) {
  if (fs.existsSync(scPath)) {
    fs.unlinkSync(scPath);
  }

  const psScriptPath = path.resolve(PROJECT_ROOT, `scripts/_temp_create_shortcut_${Date.now()}.ps1`);
  const ps1Content = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
${CSHARP_SHORTCUT_HELPER}
'@

[NativeShortcutHelper]::CreateShortcut('${scPath.replace(/'/g, "''")}', '${targetPath.replace(/'/g, "''")}', '${workDir.replace(/'/g, "''")}', '${description.replace(/'/g, "''")}')
`;

  fs.writeFileSync(psScriptPath, '\ufeff' + ps1Content, { encoding: 'utf16le' });

  try {
    const res = cp.spawnSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', psScriptPath
    ], { encoding: 'utf8' });

    if (res.status !== 0) {
      throw new Error(`Failed to create shortcut: ${res.stderr || res.stdout}`);
    }
  } finally {
    if (fs.existsSync(psScriptPath)) {
      fs.unlinkSync(psScriptPath);
    }
  }
}

function inspectGenericShortcut(scPath, expectedTarget, expectedWorkDir) {
  if (!fs.existsSync(scPath)) {
    return {
      exists: false,
      shortcutPath: scPath,
      targetPath: null,
      workingDirectory: null,
      isTargetCorrect: false,
      isWorkDirCorrect: false
    };
  }

  const psScriptPath = path.resolve(PROJECT_ROOT, `scripts/_temp_inspect_shortcut_${Date.now()}.ps1`);
  const ps1Content = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
${CSHARP_SHORTCUT_HELPER}
'@

$res = [NativeShortcutHelper]::ReadShortcut('${scPath.replace(/'/g, "''")}')
Write-Output ("TARGET:" + $res[0])
Write-Output ("WORKDIR:" + $res[1])
`;

  fs.writeFileSync(psScriptPath, '\ufeff' + ps1Content, { encoding: 'utf16le' });

  let targetPath = null;
  let workingDirectory = null;

  try {
    const res = cp.spawnSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', psScriptPath
    ], { encoding: 'utf8' });

    const lines = (res.stdout || '').split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith('TARGET:')) {
        targetPath = line.substring('TARGET:'.length).trim();
      } else if (line.startsWith('WORKDIR:')) {
        workingDirectory = line.substring('WORKDIR:'.length).trim();
      }
    }
  } finally {
    if (fs.existsSync(psScriptPath)) {
      fs.unlinkSync(psScriptPath);
    }
  }

  return {
    exists: true,
    shortcutPath: scPath,
    targetPath,
    workingDirectory,
    isTargetCorrect: (targetPath === expectedTarget),
    isWorkDirCorrect: (workingDirectory === expectedWorkDir)
  };
}

/**
 * Creates or updates the Scan desktop shortcut with exact Unicode paths
 */
function createDesktopShortcut() {
  createGenericShortcut(SHORTCUT_PATH, LAUNCHER_PATH, PROJECT_ROOT, 'TikTok Trend Radar - Interactive Scan');
  return inspectDesktopShortcut();
}

/**
 * Inspects existing Scan desktop shortcut metadata
 */
function inspectDesktopShortcut() {
  return inspectGenericShortcut(SHORTCUT_PATH, LAUNCHER_PATH, PROJECT_ROOT);
}

/**
 * Creates or updates the Report desktop shortcut with exact Unicode paths
 */
function createReportShortcut() {
  createGenericShortcut(REPORT_SHORTCUT_PATH, REPORT_LAUNCHER_PATH, PROJECT_ROOT, 'TikTok Trend Radar - Open Latest Report');
  return inspectReportShortcut();
}

/**
 * Inspects existing Report desktop shortcut metadata
 */
function inspectReportShortcut() {
  return inspectGenericShortcut(REPORT_SHORTCUT_PATH, REPORT_LAUNCHER_PATH, PROJECT_ROOT);
}

if (require.main === module) {
  console.log('Synchronizing Windows Desktop Shortcuts...');
  const scanResult = createDesktopShortcut();
  console.log('\nScan Shortcut:');
  console.log(`- Path:      ${scanResult.shortcutPath}`);
  console.log(`- Target:    ${scanResult.targetPath}`);
  console.log(`- Correct:   ${scanResult.isTargetCorrect && scanResult.isWorkDirCorrect}`);

  const reportResult = createReportShortcut();
  console.log('\nReport Shortcut:');
  console.log(`- Path:      ${reportResult.shortcutPath}`);
  console.log(`- Target:    ${reportResult.targetPath}`);
  console.log(`- Correct:   ${reportResult.isTargetCorrect && reportResult.isWorkDirCorrect}`);
}

module.exports = {
  SHORTCUT_PATH,
  LAUNCHER_PATH,
  REPORT_SHORTCUT_PATH,
  REPORT_LAUNCHER_PATH,
  PROJECT_ROOT,
  createDesktopShortcut,
  inspectDesktopShortcut,
  createReportShortcut,
  inspectReportShortcut
};
