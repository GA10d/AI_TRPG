import {
  mkdir,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type {
  SavedGameRecord,
  SaveBundle
} from "../../../packages/shared-types/src/index.ts";

const MANIFEST_FILE_NAME = "manifest.json";

type SaveManifest = {
  version: 1;
  saves: SavedGameRecord[];
};

function sanitizeFragment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "save";
}

function buildSaveId(saveBundle: SaveBundle): string {
  const savedAtPart = saveBundle.savedAt.replace(/[-:.TZ]/g, "");
  const sessionPart = sanitizeFragment(saveBundle.session.id);
  return `save_${savedAtPart}_${sessionPart}_${randomUUID().slice(0, 8)}`;
}

function isSafeSaveId(saveId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(saveId);
}

function buildRecord(
  saveId: string,
  saveBundle: SaveBundle,
  filePath: string
): SavedGameRecord {
  const contentSummary = saveBundle.contentSummary;
  return {
    saveId,
    savedAt: saveBundle.savedAt,
    sessionId: saveBundle.session.id,
    ruleTitle: contentSummary?.ruleTitle ?? saveBundle.session.ruleId,
    storyTitle: contentSummary?.storyTitle ?? saveBundle.session.storyId,
    locale: contentSummary?.resolvedLocale ?? saveBundle.session.locale,
    status: saveBundle.session.status,
    round: saveBundle.session.currentRound,
    updatedAt: saveBundle.session.updatedAt,
    modelAccessMode: saveBundle.session.modelAccessMode,
    modelProfileId:
      saveBundle.runtimeConfig?.roleModelConfigs?.narrator?.modelProfileId ??
      saveBundle.runtimeConfig?.modelProfileId ??
      saveBundle.session.settings.modelProfileId ??
      "unknown",
    storagePath: filePath
  };
}

async function ensureSaveRoot(saveRoot: string): Promise<void> {
  await mkdir(saveRoot, {
    recursive: true
  });
}

function getManifestPath(saveRoot: string): string {
  return join(saveRoot, MANIFEST_FILE_NAME);
}

function getSavePath(saveRoot: string, saveId: string): string {
  if (!isSafeSaveId(saveId)) {
    throw new Error(`Invalid save id: ${saveId}`);
  }

  return join(saveRoot, `${saveId}.json`);
}

async function readManifest(saveRoot: string): Promise<SaveManifest> {
  await ensureSaveRoot(saveRoot);

  try {
    const raw = await readFile(getManifestPath(saveRoot), "utf8");
    const parsed = JSON.parse(raw) as Partial<SaveManifest>;
    if (!Array.isArray(parsed.saves)) {
      throw new Error("Invalid save manifest.");
    }

    const normalizedSaves = parsed.saves
      .filter((item): item is SavedGameRecord => Boolean(item?.saveId))
      .map((item) => ({
        ...item,
        storagePath: getSavePath(saveRoot, item.saveId)
      }));

    return {
      version: 1,
      saves: normalizedSaves
    };
  } catch {
    return {
      version: 1,
      saves: []
    };
  }
}

async function writeManifest(saveRoot: string, saves: SavedGameRecord[]): Promise<void> {
  await ensureSaveRoot(saveRoot);
  const manifest: SaveManifest = {
    version: 1,
    saves: [...saves].sort((left, right) => right.savedAt.localeCompare(left.savedAt))
  };
  await writeFile(getManifestPath(saveRoot), JSON.stringify(manifest, null, 2), "utf8");
}

async function rebuildManifestFromFiles(saveRoot: string): Promise<SavedGameRecord[]> {
  await ensureSaveRoot(saveRoot);
  const entries = await readdir(saveRoot, {
    withFileTypes: true
  });

  const saves: SavedGameRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === MANIFEST_FILE_NAME) {
      continue;
    }

    const saveId = entry.name.replace(/\.json$/i, "");
    try {
      const filePath = getSavePath(saveRoot, saveId);
      const raw = await readFile(filePath, "utf8");
      const saveBundle = JSON.parse(raw) as SaveBundle;
      saves.push(buildRecord(saveId, saveBundle, filePath));
    } catch {
      // Skip malformed save files and keep the rest usable.
    }
  }

  await writeManifest(saveRoot, saves);
  return saves;
}

export async function listSavedGamesFromDisk(saveRoot: string): Promise<SavedGameRecord[]> {
  const manifest = await readManifest(saveRoot);
  if (manifest.saves.length > 0) {
    return manifest.saves;
  }

  return rebuildManifestFromFiles(saveRoot);
}

export async function saveBundleToDisk(
  saveRoot: string,
  saveBundle: SaveBundle
): Promise<SavedGameRecord> {
  await ensureSaveRoot(saveRoot);

  const saveId = buildSaveId(saveBundle);
  const filePath = getSavePath(saveRoot, saveId);
  await writeFile(filePath, JSON.stringify(saveBundle, null, 2), "utf8");

  const nextRecord = buildRecord(saveId, saveBundle, filePath);
  const manifest = await readManifest(saveRoot);
  const nextRecords = [
    nextRecord,
    ...manifest.saves.filter((item) => item.saveId !== nextRecord.saveId)
  ];
  await writeManifest(saveRoot, nextRecords);
  return nextRecord;
}

export async function loadSaveBundleFromDisk(
  saveRoot: string,
  saveId: string
): Promise<SaveBundle> {
  const filePath = getSavePath(saveRoot, saveId);

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as SaveBundle;
  } catch {
    throw new Error(`Local save not found: ${saveId}`);
  }
}

export async function deleteSavedGameFromDisk(
  saveRoot: string,
  saveId: string
): Promise<boolean> {
  const filePath = getSavePath(saveRoot, saveId);
  let removed = false;

  try {
    await unlink(filePath);
    removed = true;
  } catch {
    removed = false;
  }

  const manifest = await readManifest(saveRoot);
  const nextRecords = manifest.saves.filter((item) => item.saveId !== saveId);
  await writeManifest(saveRoot, nextRecords);
  return removed;
}

export async function clearSavedGamesFromDisk(saveRoot: string): Promise<void> {
  await ensureSaveRoot(saveRoot);
  const entries = await readdir(saveRoot, {
    withFileTypes: true
  });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    await rm(join(saveRoot, entry.name), {
      force: true
    });
  }

  await writeManifest(saveRoot, []);
}
