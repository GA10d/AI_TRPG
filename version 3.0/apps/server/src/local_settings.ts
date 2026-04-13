import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  LocalSaveSettings,
  UpdateLocalSaveSettingsRequest
} from "../../../packages/shared-types/src/index.ts";

const execFileAsync = promisify(execFile);

type LocalSettingsFile = {
  version: 1;
  saveDirectory: string | null;
  hasSelectedSaveDirectory: boolean;
};

function normalizeSaveDirectory(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const unwrapped =
    trimmed.startsWith("\"") && trimmed.endsWith("\"") && trimmed.length >= 2
      ? trimmed.slice(1, -1)
      : trimmed;

  return resolve(unwrapped);
}

async function ensureSettingsFileParent(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), {
    recursive: true
  });
}

async function readSettingsFile(filePath: string): Promise<LocalSettingsFile> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalSettingsFile>;
    return {
      version: 1,
      saveDirectory: normalizeSaveDirectory(parsed.saveDirectory),
      hasSelectedSaveDirectory: Boolean(parsed.hasSelectedSaveDirectory)
    };
  } catch {
    return {
      version: 1,
      saveDirectory: null,
      hasSelectedSaveDirectory: false
    };
  }
}

function toResponse(
  settings: LocalSettingsFile,
  defaultSaveDirectory: string
): LocalSaveSettings {
  const effectiveSaveDirectory = settings.saveDirectory ?? defaultSaveDirectory;
  return {
    saveDirectory: settings.saveDirectory,
    effectiveSaveDirectory,
    usesDefaultSaveDirectory: settings.saveDirectory === null,
    hasSelectedSaveDirectory: settings.hasSelectedSaveDirectory
  };
}

export async function getLocalSaveSettings(
  filePath: string,
  defaultSaveDirectory: string
): Promise<LocalSaveSettings> {
  await ensureSettingsFileParent(filePath);
  const settings = await readSettingsFile(filePath);
  return toResponse(settings, defaultSaveDirectory);
}

export async function updateLocalSaveSettings(
  filePath: string,
  defaultSaveDirectory: string,
  request: UpdateLocalSaveSettingsRequest
): Promise<LocalSaveSettings> {
  await ensureSettingsFileParent(filePath);
  const nextSettings: LocalSettingsFile = {
    version: 1,
    saveDirectory: normalizeSaveDirectory(request.saveDirectory),
    hasSelectedSaveDirectory: true
  };

  const effectiveSaveDirectory = nextSettings.saveDirectory ?? defaultSaveDirectory;
  await mkdir(effectiveSaveDirectory, {
    recursive: true
  });
  await writeFile(filePath, JSON.stringify(nextSettings, null, 2), "utf8");
  return toResponse(nextSettings, defaultSaveDirectory);
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

export async function pickLocalDirectoryWithNativeDialog(input?: {
  initialDirectory?: string | null;
  title?: string | null;
}): Promise<string | null> {
  if (process.platform !== "win32") {
    throw new Error("Native directory picking is currently only available on Windows.");
  }

  const normalizedInitialDirectory = normalizeSaveDirectory(input?.initialDirectory);
  const dialogTitle = (input?.title?.trim() ?? "") || "Select a local save directory";
  const script = [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "Add-Type -AssemblyName System.Windows.Forms",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$dialog.Description = '${escapePowerShellSingleQuoted(dialogTitle)}'`,
    "$dialog.ShowNewFolderButton = $true",
    normalizedInitialDirectory
      ? `$initialPath = '${escapePowerShellSingleQuoted(normalizedInitialDirectory)}'`
      : "$initialPath = ''",
    "if ($initialPath -and (Test-Path -LiteralPath $initialPath)) { $dialog.SelectedPath = $initialPath }",
    "$result = $dialog.ShowDialog()",
    "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }"
  ].join("; ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-STA", "-Command", script],
    {
      encoding: "utf8",
      windowsHide: false
    }
  );

  const selectedPath = stdout.trim();
  return selectedPath || null;
}
