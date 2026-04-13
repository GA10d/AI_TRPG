import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AiPersonalityTag } from "../../../../packages/shared-types/src/index.ts";

type RawPersonalityEntry = {
  keyword?: unknown;
  description?: unknown;
};

type RawPersonalityCatalog = Record<string, Record<string, RawPersonalityEntry[] | unknown> | unknown>;

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const personalityListPath = join(
  projectRoot,
  "apps",
  "prompt",
  "personality_list",
  "personality_list.json"
);

let cachedPersonalityTags: AiPersonalityTag[] | null = null;

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid personality field: ${fieldName}`);
  }

  return value.trim();
}

function normalizePersonalityEntry(
  group: string,
  polarity: string,
  rawEntry: unknown,
  index: number
): AiPersonalityTag {
  if (typeof rawEntry !== "object" || rawEntry === null || Array.isArray(rawEntry)) {
    throw new Error(`Invalid personality entry at ${group}.${polarity}[${index}]`);
  }

  const entry = rawEntry as RawPersonalityEntry;
  const keyword = assertString(entry.keyword, `${group}.${polarity}[${index}].keyword`);
  const description = assertString(
    entry.description,
    `${group}.${polarity}[${index}].description`
  );

  return {
    id: `${group}:${polarity}:${keyword}`,
    group,
    polarity,
    keyword,
    description
  };
}

async function readPersonalityTags(): Promise<AiPersonalityTag[]> {
  const rawText = await readFile(personalityListPath, "utf8");
  const parsed = JSON.parse(rawText) as RawPersonalityCatalog;
  const tags: AiPersonalityTag[] = [];

  for (const [group, groupValue] of Object.entries(parsed)) {
    if (typeof groupValue !== "object" || groupValue === null || Array.isArray(groupValue)) {
      continue;
    }

    for (const [polarity, entries] of Object.entries(groupValue)) {
      if (!Array.isArray(entries)) {
        continue;
      }

      entries.forEach((entry, index) => {
        tags.push(normalizePersonalityEntry(group, polarity, entry, index));
      });
    }
  }

  if (tags.length === 0) {
    throw new Error("No personality tags were loaded from personality_list.json.");
  }

  return tags;
}

export async function loadAiPersonalityTags(): Promise<AiPersonalityTag[]> {
  if (cachedPersonalityTags) {
    return cachedPersonalityTags;
  }

  cachedPersonalityTags = await readPersonalityTags();
  return cachedPersonalityTags;
}

export async function resolveAiPersonalityTagsByIds(
  tagIds: string[]
): Promise<AiPersonalityTag[]> {
  if (tagIds.length === 0) {
    return [];
  }

  const allTags = await loadAiPersonalityTags();
  const tagMap = new Map(allTags.map((tag) => [tag.id, tag]));
  const resolved: AiPersonalityTag[] = [];

  for (const tagId of tagIds) {
    const normalizedTagId = tagId.trim();
    if (!normalizedTagId) {
      continue;
    }

    const tag = tagMap.get(normalizedTagId);
    if (!tag) {
      throw new Error(`Unknown AI personality tag id: ${normalizedTagId}`);
    }

    if (!resolved.some((item) => item.id === tag.id)) {
      resolved.push(tag);
    }
  }

  return resolved;
}
