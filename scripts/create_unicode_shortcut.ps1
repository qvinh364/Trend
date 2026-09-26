$csharp = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

[ComImport]
[Guid("00021401-0000-0000-C000-000000000046")]
public class ShellLink {}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("000214F9-0000-0000-C000-000000000046")]
public interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, out IntPtr pfd, int fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
    void Resolve(IntPtr hwnd, int fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
}

public class ShortcutCreator {
    public static void Create(string shortcutPath, string targetPath, string workingDir, string description) {
        IShellLinkW link = (IShellLinkW)new ShellLink();
        link.SetPath(targetPath);
        link.SetWorkingDirectory(workingDir);
        link.SetDescription(description);
        ((IPersistFile)link).Save(shortcutPath, false);
    }
}
"@

Add-Type -TypeDefinition $csharp
$scPath = "C:\Users\Admin\Desktop\TikTok Trend Radar - Login.lnk"
$target = "D:\Antigravity\Project\Update tin tức\TikTok_Login.cmd"
$dir = "D:\Antigravity\Project\Update tin tức"
[ShortcutCreator]::Create($scPath, $target, $dir, "TikTok Trend Radar Manual Login Launcher")
Write-Output "SHELL_LINK_W_SUCCESS"
