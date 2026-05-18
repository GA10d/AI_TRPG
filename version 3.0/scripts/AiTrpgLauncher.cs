using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal static class AiTrpgLauncher
{
    private const string GameUrl = "http://127.0.0.1:4316/";
    private const string HealthUrl = "http://127.0.0.1:4316/api/health";

    [STAThread]
    private static int Main()
    {
        Application.EnableVisualStyles();

        string projectRoot = FindProjectRoot(AppDomain.CurrentDomain.BaseDirectory);
        if (projectRoot == null)
        {
            ShowError("Could not find the AI TRPG project root. Keep this launcher inside the project folder.");
            return 1;
        }

        string serverScript = Path.Combine(projectRoot, "scripts", "launch_game_server.cmd");
        string webIndex = Path.Combine(projectRoot, "apps", "web", "dist", "index.html");
        string serverLog = Path.Combine(projectRoot, "logs", "gameplay_server.log");
        string serverErrLog = Path.Combine(projectRoot, "logs", "gameplay_server.err.log");

        if (!File.Exists(serverScript))
        {
            ShowError("Missing server launcher:\n" + serverScript);
            return 1;
        }

        if (!File.Exists(webIndex))
        {
            ShowError(
                "The web build was not found.\n\n" +
                "Run this first from the project root:\n" +
                "npm.cmd run build:web\n\n" +
                "Expected file:\n" + webIndex);
            return 1;
        }

        try
        {
            if (!IsServerReady())
            {
                StartServerWindow(projectRoot, serverScript);
            }

            if (!WaitForServer(TimeSpan.FromSeconds(30)))
            {
                ShowError(
                    "The local gameplay server did not become ready within 30 seconds.\n\n" +
                    "Check these logs:\n" +
                    serverLog + "\n" +
                    serverErrLog);
                return 1;
            }

            OpenGameWindow(projectRoot);
            return 0;
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
            return 1;
        }
    }

    private static string FindProjectRoot(string startDirectory)
    {
        DirectoryInfo current = new DirectoryInfo(startDirectory);
        while (current != null)
        {
            string packageJson = Path.Combine(current.FullName, "package.json");
            string serverEntry = Path.Combine(current.FullName, "apps", "server", "src", "server.ts");
            if (File.Exists(packageJson) && File.Exists(serverEntry))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return null;
    }

    private static void OpenGameWindow(string projectRoot)
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = GameUrl,
            WorkingDirectory = projectRoot,
            UseShellExecute = true
        });
    }

    private static void StartServerWindow(string projectRoot, string serverScript)
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = "/k call \"" + serverScript + "\"",
            WorkingDirectory = projectRoot,
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Normal
        });
    }

    private static bool WaitForServer(TimeSpan timeout)
    {
        DateTime deadline = DateTime.UtcNow.Add(timeout);
        while (DateTime.UtcNow < deadline)
        {
            if (IsServerReady())
            {
                return true;
            }

            Thread.Sleep(500);
        }

        return false;
    }

    private static bool IsServerReady()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(HealthUrl);
            request.Method = "GET";
            request.Timeout = 2000;
            request.ReadWriteTimeout = 2000;

            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                int statusCode = (int)response.StatusCode;
                return statusCode >= 200 && statusCode < 500;
            }
        }
        catch
        {
            return false;
        }
    }

    private static void ShowError(string message)
    {
        MessageBox.Show(message, "AI TRPG 3.0 Launcher", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
