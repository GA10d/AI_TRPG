import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AiAppearanceTag } from "../../../../packages/shared-types/src/index.ts";

type RawAppearanceEntry = {
  keyword?: unknown;
  description?: unknown;
};

type RawAppearanceCatalog = Record<string, RawAppearanceEntry[] | unknown>;

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const appearanceListPath = join(
  projectRoot,
  "apps",
  "prompt",
  "appearance_list",
  "appearance_list.json"
);

let cachedAppearanceTags: AiAppearanceTag[] | null = null;

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid appearance field: ${fieldName}`);
  }

  return value.trim();
}

function normalizeAppearanceEntry(
  category: string,
  rawEntry: unknown,
  index: number
): AiAppearanceTag {
  if (typeof rawEntry !== "object" || rawEntry === null || Array.isArray(rawEntry)) {
    throw new Error(`Invalid appearance entry at ${category}[${index}]`);
  }

  const entry = rawEntry as RawAppearanceEntry;
  const keyword = assertString(entry.keyword, `${category}[${index}].keyword`);
  const description = assertString(entry.description, `${category}[${index}].description`);

  return {
    id: `${category}:${keyword}`,
    category,
    keyword,
    description
  };
}

async function readAppearanceTags(): Promise<AiAppearanceTag[]> {
  const rawText = await readFile(appearanceListPath, "utf8");
  const parsed = JSON.parse(rawText) as RawAppearanceCatalog;
  const tags: AiAppearanceTag[] = [];

  for (const [category, entries] of Object.entries(parsed)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    entries.forEach((entry, index) => {
      tags.push(normalizeAppearanceEntry(category, entry, index));
    });
  }

  if (tags.length === 0) {
    throw new Error("No appearance tags were loaded from appearance_list.json.");
  }

  return tags;
}

export async function loadAiAppearanceTags(): Promise<AiAppearanceTag[]> {
  if (cachedAppearanceTags) {
    return cachedAppearanceTags;
  }

  cachedAppearanceTags = await readAppearanceTags();
  return cachedAppearanceTags;
}

export async function resolveAiAppearanceTagsByIds(
  tagIds: string[]
): Promise<AiAppearanceTag[]> {
  if (tagIds.length === 0) {
    return [];
  }

  const allTags = await loadAiAppearanceTags();
  const tagMap = new Map(allTags.map((tag) => [tag.id, tag]));
  const resolved: AiAppearanceTag[] = [];

  for (const tagId of tagIds) {
    const normalizedTagId = tagId.trim();
    if (!normalizedTagId) {
      continue;
    }

    const tag = tagMap.get(normalizedTagId);
    if (!tag) {
      throw new Error(`Unknown AI appearance tag id: ${normalizedTagId}`);
    }

    if (!resolved.some((item) => item.id === tag.id)) {
      resolved.push(tag);
    }
  }

  return resolved;
}
