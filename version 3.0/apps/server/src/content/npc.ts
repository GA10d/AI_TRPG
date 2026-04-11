import { access, readdir, readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import type { NpcRosterEntry } from "../../../../packages/shared-types/src/index.ts";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeSummary(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const firstParagraph = normalized.split(/\n\s*\n/u)[0] ?? normalized;
  const compact = firstParagraph.replace(/\s+/gu, " ").trim();
  return compact.length <= 180 ? compact : `${compact.slice(0, 180).trimEnd()}...`;
}

async function resolvePortraitAssetUrl(
  storyBaseDir: string,
  ruleDirectoryName: string,
  storyDirectoryName: string,
  baseName: string
): Promise<string | null> {
  const candidateRelativePaths = [
    join("art_assets", "npc", `${baseName}.png`),
    join("art_assets", "npc", `${baseName}.jpg`),
    join("art_assets", "npc", `${baseName}.jpeg`),
    join("art_assets", "npc", `${baseName}.webp`),
    join("art_assets", `${baseName}.png`),
    join("art_assets", `${baseName}.jpg`),
    join("art_assets", `${baseName}.jpeg`),
    join("art_assets", `${baseName}.webp`)
  ];

  for (const relativePath of candidateRelativePaths) {
    if (await pathExists(join(storyBaseDir, relativePath))) {
      return `/api/content-assets/${encodeURIComponent(ruleDirectoryName)}/story/${encodeURIComponent(storyDirectoryName)}/${relativePath
        .split(/[\\/]/u)
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`;
    }
  }

  return null;
}

export async function loadStoryNpcRoster(
  contentRoot: string,
  ruleDirectoryName: string,
  storyDirectoryName: string
): Promise<NpcRosterEntry[]> {
  const storyBaseDir = resolve(contentRoot, ruleDirectoryName, "story", storyDirectoryName);
  const npcPromptDir = join(storyBaseDir, "npc_prompt");

  if (!(await pathExists(npcPromptDir))) {
    return [];
  }

  const dirEntries = await readdir(npcPromptDir, {
    withFileTypes: true
  });
  const files = dirEntries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".txt")
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));

  const roster = await Promise.all(
    files.map(async (file) => {
      const absolutePath = join(npcPromptDir, file.name);
      const promptText = (await readFile(absolutePath, "utf8")).trim();
      const name = basename(file.name, extname(file.name));
      const portraitAssetUrl = await resolvePortraitAssetUrl(
        storyBaseDir,
        ruleDirectoryName,
        storyDirectoryName,
        name
      );

      return {
        id: name,
        name,
        summary: normalizeSummary(promptText),
        promptText,
        portraitAssetUrl
      } satisfies NpcRosterEntry;
    })
  );

  return roster;
}
