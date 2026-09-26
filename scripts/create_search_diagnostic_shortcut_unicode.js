const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const LAUNCHER_PATH = path.resolve(PROJECT_ROOT, 'TikTok_Search_Diagnostic.cmd');
const DESKTOP_DIR = path.join(os.homedir(), 'Desktop');
const SHORTCUT_PATH = path.join(DESKTOP_DIR, 'TikTok Trend Radar - Search Diagnostic.lnk');

console.log('Project Root:', PROJECT_ROOT);
console.log('Launcher Path:', LAUNCHER_PATH);
console.log('Launcher exists:', fs.existsSync(LAUNCHER_PATH));

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

const psScriptPath = path.resolve(PROJECT_ROOT, 'scripts/_temp_create_search_diag_shortcut.ps1');
const ps1Content = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
${CSHARP_SHORTCUT_HELPER}
'@

[NativeShortcutHelper]::CreateShortcut('${SHORTCUT_PATH.replace(/'/g, "''")}', '${LAUNCHER_PATH.replace(/'/g, "''")}', '${PROJECT_ROOT.replace(/'/g, "''")}', 'TikTok Trend Radar - Search Diagnostic')

$res = [NativeShortcutHelper]::ReadShortcut('${SHORTCUT_PATH.replace(/'/g, "''")}')
Write-Output ("READ_TARGET:" + $res[0])
Write-Output ("READ_WORKDIR:" + $res[1])
`;

fs.writeFileSync(psScriptPath, '\ufeff' + ps1Content, { encoding: 'utf16le' });

try {
  const res = cp.spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', psScriptPath
  ], { encoding: 'utf8' });

  console.log(res.stdout);
  if (res.stderr) console.error('STDERR:', res.stderr);
} finally {
  if (fs.existsSync(psScriptPath)) fs.unlinkSync(psScriptPath);
}
