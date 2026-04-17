import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AiAppearanceTag } from "../../../../packages/shared-types/src/index.ts";

type RawAppearanceEntry = {
  keyword?: unknown;
  description?: unknown;
};

type RawAppearanceCatalog = Record<
  string,
  RawAppearanceEntry[] | Record<string, RawAppearanceEntry[] | unknown> | unknown
>;

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
  subgroup: string | undefined,
  rawEntry: unknown,
  index: number
): AiAppearanceTag {
  if (typeof rawEntry !== "object" || rawEntry === null || Array.isArray(rawEntry)) {
    throw new Error(
      `Invalid appearance entry at ${subgroup ? `${category}.${subgroup}` : category}[${index}]`
    );
  }

  const entry = rawEntry as RawAppearanceEntry;
  const location = subgroup ? `${category}.${subgroup}[${index}]` : `${category}[${index}]`;
  const keyword = assertString(entry.keyword, `${location}.keyword`);
  const description = assertString(entry.description, `${location}.description`);

  return {
    id: `${category}:${keyword}`,
    category,
    subgroup,
    keyword,
    description
  };
}

function collectAppearanceEntries(input: {
  category: string;
  subgroup?: string;
  entries: unknown;
  tags: AiAppearanceTag[];
}): void {
  if (Array.isArray(input.entries)) {
    input.entries.forEach((entry, index) => {
      input.tags.push(
        normalizeAppearanceEntry(input.category, input.subgroup, entry, index)
      );
    });
    return;
  }

  if (typeof input.entries !== "object" || input.entries === null) {
    return;
  }

  for (const [subgroup, subgroupEntries] of Object.entries(input.entries)) {
    if (!Array.isArray(subgroupEntries)) {
      continue;
    }

    subgroupEntries.forEach((entry, index) => {
      input.tags.push(
        normalizeAppearanceEntry(input.category, subgroup.trim() || undefined, entry, index)
      );
    });
  }
}

async function readAppearanceTags(): Promise<AiAppearanceTag[]> {
  const rawText = await readFile(appearanceListPath, "utf8");
  const parsed = JSON.parse(rawText) as RawAppearanceCatalog;
  const tags: AiAppearanceTag[] = [];
  const seenTagIds = new Set<string>();

  for (const [category, entries] of Object.entries(parsed)) {
    const beforeCount = tags.length;
    collectAppearanceEntries({
      category: category.trim(),
      entries,
      tags
    });

    for (const tag of tags.slice(beforeCount)) {
      if (seenTagIds.has(tag.id)) {
        throw new Error(`Duplicate AI appearance tag id: ${tag.id}`);
      }

      seenTagIds.add(tag.id);
    }
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
