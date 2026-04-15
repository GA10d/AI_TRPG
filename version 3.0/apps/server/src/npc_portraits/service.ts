import { randomUUID } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type {
  ComicStylePreset,
  ImagePromptTemplateConfig,
  NpcPortraitVariant,
  NpcRosterEntry,
  PrepareNpcPortraitsRequest,
  PrepareNpcPortraitsResponse,
  RegenerateNpcPortraitRequest,
  RegenerateNpcPortraitResponse,
  RuntimeImageModelConfigInput,
  SelectNpcPortraitRequest,
  SelectNpcPortraitResponse
} from "../../../../packages/shared-types/src/index.ts";
import { loadStoryPackage, loadStoryNpcRoster } from "../content/index.ts";
import { loadImagePromptTemplateConfig, generateImage } from "../image_generation/service.ts";
import { resolveComicStylePreset } from "../comic_generation/prompt.ts";
import {
  createNpcPortraitCollection,
  loadNpcPortraitCollectionFromDisk,
  resolveNpcPortraitAssetAbsolutePath,
  saveNpcPortraitAssetToDisk,
  type NpcPortraitCollection,
  type StoredNpcPortraitEntry,
  writeNpcPortraitCollectionToDisk
} from "./storage.ts";

const STORY_ASSET_PORTRAIT_ID = "__story_asset__";
const PREPARE_IN_FLIGHT = new Map<string, Promise<PrepareNpcPortraitsResponse>>();

function compactWhitespace(input: string): string {
  return input.replace(/\s+/gu, " ").trim();
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function buildPrepareKey(
  ruleDirectoryName: string,
  storyDirectoryName: string,
  styleId: string
): string {
  return [ruleDirectoryName.trim(), storyDirectoryName.trim(), styleId.trim()].join("::");
}

async function resolvePromptTemplateConfig(
  overrideConfig: ImagePromptTemplateConfig | undefined
): Promise<ImagePromptTemplateConfig> {
  return overrideConfig ? overrideConfig : loadImagePromptTemplateConfig();
}

async function resolveStoryPortraitPrompt(args: {
  contentRoot: string;
  ruleDirectoryName: string;
  storyDirectoryName: string;
}): Promise<string> {
  const storyBaseDir = resolve(
    args.contentRoot,
    args.ruleDirectoryName,
    "story",
    args.storyDirectoryName
  );
  const candidateRelativePaths = [
    "portrait_prompt.txt",
    "portrait_prompt.md",
    "character_portrait_prompt.txt",
    "character_portrait_prompt.md",
    join("text_assets", "portrait_prompt.txt"),
    join("text_assets", "portrait_prompt.md"),
    join("image_generation", "portrait_prompt.txt"),
    join("image_generation", "character_portrait_prompt.txt"),
    join("art_assets", "portrait_prompt.txt")
  ];

  for (const relativePath of candidateRelativePaths) {
    const absolutePath = join(storyBaseDir, relativePath);
    if (!(await pathExists(absolutePath))) {
      continue;
    }

    const rawText = await readFile(absolutePath, "utf8");
    const prompt = compactWhitespace(rawText);
    if (prompt) {
      return prompt;
    }
  }

  const story = await loadStoryPackage(
    args.contentRoot,
    args.ruleDirectoryName,
    args.storyDirectoryName
  );
  const storyTitle =
    story.manifest.title[story.manifest.defaultLocale] ?? story.manifest.id;
  const intro = compactWhitespace(story.intro?.content ?? "");
  const storyPreview = compactWhitespace(story.story.content).slice(0, 240);
  const tagText = story.manifest.tags.slice(0, 6).join(", ");

  return compactWhitespace(
    [
      `TRPG story portrait direction for ${storyTitle}.`,
      tagText ? `Genre and mood: ${tagText}.` : "",
      story.manifest.gmStyle ? `Narrative tone: ${story.manifest.gmStyle}.` : "",
      intro
        ? `Opening atmosphere: ${intro.slice(0, 220)}.`
        : storyPreview
          ? `Story context: ${storyPreview}.`
          : "",
      "Keep costumes, props, and visual mood aligned with this story setting."
    ].join(" ")
  );
}

function buildStaticPortraitVariant(npc: NpcRosterEntry): NpcPortraitVariant | null {
  if (!npc.portraitAssetUrl) {
    return null;
  }

  return {
    portraitId: STORY_ASSET_PORTRAIT_ID,
    source: "story_asset",
    provider: "content:story_asset",
    createdAt: null,
    prompt: null,
    revisedPrompt: "Story bundled portrait asset.",
    image: {
      relativePath: npc.portraitAssetUrl,
      storagePath: npc.portraitAssetUrl,
      apiPath: npc.portraitAssetUrl,
      mimeType: null
    }
  };
}

function mergeNpcRosterWithPortraits(args: {
  roster: NpcRosterEntry[];
  styleId: string;
  collection: NpcPortraitCollection | null;
}): NpcRosterEntry[] {
  return args.roster.map((npc) => {
    const storedEntry = args.collection?.npcs.find((item) => item.npcId === npc.id) ?? null;
    const staticPortrait = buildStaticPortraitVariant(npc);
    const portraitVariants = [
      ...(staticPortrait ? [staticPortrait] : []),
      ...(storedEntry?.portraits ?? [])
    ];
    const selectedPortraitId =
      storedEntry?.selectedPortraitId &&
      portraitVariants.some((variant) => variant.portraitId === storedEntry.selectedPortraitId)
        ? storedEntry.selectedPortraitId
        : staticPortrait?.portraitId ?? portraitVariants[0]?.portraitId ?? null;
    const selectedPortrait =
      portraitVariants.find((variant) => variant.portraitId === selectedPortraitId) ?? null;

    return {
      ...npc,
      portraitAssetUrl: selectedPortrait?.image.apiPath ?? null,
      portraitStyleId: args.styleId,
      selectedPortraitId,
      portraitVariants
    };
  });
}

function buildNpcPortraitPrompt(args: {
  storyPortraitPrompt: string;
  npc: NpcRosterEntry;
  style: ComicStylePreset;
}): string {
  return compactWhitespace(
    [
      args.storyPortraitPrompt,
      `NPC name: ${args.npc.name}.`,
      args.npc.promptText.trim() || args.npc.summary.trim() || args.npc.name,
      `Comic style reference: ${args.style.prompt}.`,
      "Single character portrait only. Preserve a stable face, outfit cues, props, and silhouette."
    ].join(" ")
  );
}

function upsertStoredNpcEntry(
  collection: NpcPortraitCollection,
  npcId: string
): StoredNpcPortraitEntry {
  const existing = collection.npcs.find((item) => item.npcId === npcId);
  if (existing) {
    return existing;
  }

  const created: StoredNpcPortraitEntry = {
    npcId,
    selectedPortraitId: null,
    portraits: []
  };
  collection.npcs.push(created);
  return created;
}

async function ensureCollection(args: {
  portraitRoot: string;
  ruleDirectoryName: string;
  storyDirectoryName: string;
  style: ComicStylePreset;
}): Promise<NpcPortraitCollection> {
  const existing = await loadNpcPortraitCollectionFromDisk({
    portraitRoot: args.portraitRoot,
    ruleDirectoryName: args.ruleDirectoryName,
    storyDirectoryName: args.storyDirectoryName,
    styleId: args.style.id
  });

  if (existing) {
    return existing;
  }

  return createNpcPortraitCollection({
    ruleDirectoryName: args.ruleDirectoryName,
    storyDirectoryName: args.storyDirectoryName,
    styleId: args.style.id,
    styleName: args.style.name,
    createdAt: new Date().toISOString()
  });
}

async function generateNpcPortraitVariant(args: {
  portraitRoot: string;
  collection: NpcPortraitCollection;
  npc: NpcRosterEntry;
  storyPortraitPrompt: string;
  style: ComicStylePreset;
  imageProfileId?: string;
  runtimeImageModelConfig?: RuntimeImageModelConfigInput;
  promptTemplateConfig: ImagePromptTemplateConfig;
}): Promise<NpcPortraitVariant> {
  const prompt = buildNpcPortraitPrompt({
    storyPortraitPrompt: args.storyPortraitPrompt,
    npc: args.npc,
    style: args.style
  });
  const now = new Date().toISOString();
  const portraitId = `portrait_${randomUUID()}`;
  const generated = await generateImage({
    prompt,
    trigger: "character_portrait",
    theme: args.promptTemplateConfig.defaultTheme,
    sceneId: [
      args.collection.ruleDirectoryName,
      args.collection.storyDirectoryName,
      args.collection.styleId,
      args.npc.id,
      now,
      portraitId
    ].join(":"),
    imageProfileId: args.imageProfileId,
    runtimeImageModelConfig: args.runtimeImageModelConfig,
    promptTemplateConfig: args.promptTemplateConfig,
    allowFallback: true,
    characters: [
      {
        name: args.npc.name,
        appearance: args.npc.promptText.trim() || args.npc.summary.trim() || args.npc.name
      }
    ]
  });
  const image = await saveNpcPortraitAssetToDisk({
    portraitRoot: args.portraitRoot,
    collectionId: args.collection.collectionId,
    npcId: args.npc.id,
    portraitId,
    sourceUrl: generated.imageUrl
  });

  return {
    portraitId,
    source: "generated",
    provider: generated.provider,
    createdAt: now,
    prompt,
    revisedPrompt: generated.revisedPrompt,
    image
  };
}

async function loadNpcPortraitContext(args: {
  contentRoot: string;
  portraitRoot: string;
  ruleDirectoryName: string;
  storyDirectoryName: string;
  styleId?: string;
}): Promise<{
  roster: NpcRosterEntry[];
  style: ComicStylePreset;
  collection: NpcPortraitCollection;
}> {
  const style = await resolveComicStylePreset(args.styleId);
  const [roster, collection] = await Promise.all([
    loadStoryNpcRoster(args.contentRoot, args.ruleDirectoryName, args.storyDirectoryName),
    ensureCollection({
      portraitRoot: args.portraitRoot,
      ruleDirectoryName: args.ruleDirectoryName,
      storyDirectoryName: args.storyDirectoryName,
      style
    })
  ]);

  return {
    roster,
    style,
    collection
  };
}

function findNpcOrThrow(roster: NpcRosterEntry[], npcId: string): NpcRosterEntry {
  const npc = roster.find((item) => item.id === npcId);
  if (!npc) {
    throw new Error(`NPC not found: ${npcId}`);
  }

  return npc;
}

export async function loadNpcRosterWithPortraits(args: {
  contentRoot: string;
  portraitRoot: string;
  ruleDirectoryName: string;
  storyDirectoryName: string;
  styleId?: string;
}): Promise<NpcRosterEntry[]> {
  const { roster, style, collection } = await loadNpcPortraitContext(args);
  return mergeNpcRosterWithPortraits({
    roster,
    styleId: style.id,
    collection
  });
}

export async function prepareNpcPortraits(args: {
  contentRoot: string;
  portraitRoot: string;
  request: PrepareNpcPortraitsRequest;
}): Promise<PrepareNpcPortraitsResponse> {
  const style = await resolveComicStylePreset(args.request.styleId);
  const prepareKey = buildPrepareKey(
    args.request.ruleDirectoryName,
    args.request.storyDirectoryName,
    style.id
  );
  const inFlight = PREPARE_IN_FLIGHT.get(prepareKey);
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    const promptTemplateConfig = await resolvePromptTemplateConfig(
      args.request.promptTemplateConfig
    );
    const storyPortraitPrompt = await resolveStoryPortraitPrompt({
      contentRoot: args.contentRoot,
      ruleDirectoryName: args.request.ruleDirectoryName,
      storyDirectoryName: args.request.storyDirectoryName
    });
    const { roster, collection } = await loadNpcPortraitContext({
      contentRoot: args.contentRoot,
      portraitRoot: args.portraitRoot,
      ruleDirectoryName: args.request.ruleDirectoryName,
      storyDirectoryName: args.request.storyDirectoryName,
      styleId: style.id
    });

    const generatedNpcIds: string[] = [];
    const reusedNpcIds: string[] = [];
    let workingCollection = collection;

    for (const npc of roster) {
      const latestCollection =
        (await loadNpcPortraitCollectionFromDisk({
          portraitRoot: args.portraitRoot,
          ruleDirectoryName: args.request.ruleDirectoryName,
          storyDirectoryName: args.request.storyDirectoryName,
          styleId: style.id
        })) ?? workingCollection;
      const storedEntry = upsertStoredNpcEntry(latestCollection, npc.id);
      if (storedEntry.portraits.length > 0) {
        reusedNpcIds.push(npc.id);
        workingCollection = latestCollection;
        continue;
      }

      const portrait = await generateNpcPortraitVariant({
        portraitRoot: args.portraitRoot,
        collection: latestCollection,
        npc,
        storyPortraitPrompt,
        style,
        imageProfileId: args.request.imageProfileId,
        runtimeImageModelConfig: args.request.runtimeImageModelConfig,
        promptTemplateConfig
      });
      storedEntry.portraits.push(portrait);
      storedEntry.selectedPortraitId = portrait.portraitId;
      generatedNpcIds.push(npc.id);
      latestCollection.updatedAt = new Date().toISOString();
      workingCollection = await writeNpcPortraitCollectionToDisk({
        portraitRoot: args.portraitRoot,
        collection: latestCollection
      });
    }

    return {
      roster: mergeNpcRosterWithPortraits({
        roster,
        styleId: style.id,
        collection: workingCollection
      }),
      style,
      generatedNpcIds,
      reusedNpcIds
    };
  })().finally(() => {
    PREPARE_IN_FLIGHT.delete(prepareKey);
  });

  PREPARE_IN_FLIGHT.set(prepareKey, task);
  return task;
}

export async function regenerateNpcPortrait(args: {
  contentRoot: string;
  portraitRoot: string;
  request: RegenerateNpcPortraitRequest;
}): Promise<RegenerateNpcPortraitResponse> {
  const promptTemplateConfig = await resolvePromptTemplateConfig(
    args.request.promptTemplateConfig
  );
  const storyPortraitPrompt = await resolveStoryPortraitPrompt({
    contentRoot: args.contentRoot,
    ruleDirectoryName: args.request.ruleDirectoryName,
    storyDirectoryName: args.request.storyDirectoryName
  });
  const { roster, style, collection } = await loadNpcPortraitContext({
    contentRoot: args.contentRoot,
    portraitRoot: args.portraitRoot,
    ruleDirectoryName: args.request.ruleDirectoryName,
    storyDirectoryName: args.request.storyDirectoryName,
    styleId: args.request.styleId
  });
  const npc = findNpcOrThrow(roster, args.request.npcId);
  const portrait = await generateNpcPortraitVariant({
    portraitRoot: args.portraitRoot,
    collection,
    npc,
    storyPortraitPrompt,
    style,
    imageProfileId: args.request.imageProfileId,
    runtimeImageModelConfig: args.request.runtimeImageModelConfig,
    promptTemplateConfig
  });

  const storedEntry = upsertStoredNpcEntry(collection, npc.id);
  storedEntry.portraits.push(portrait);
  storedEntry.selectedPortraitId = portrait.portraitId;
  collection.updatedAt = new Date().toISOString();
  const updatedCollection = await writeNpcPortraitCollectionToDisk({
    portraitRoot: args.portraitRoot,
    collection
  });
  const updatedNpc =
    mergeNpcRosterWithPortraits({
      roster,
      styleId: style.id,
      collection: updatedCollection
    }).find((item) => item.id === npc.id) ?? npc;

  return {
    npc: updatedNpc,
    portrait,
    style
  };
}

export async function selectNpcPortrait(args: {
  contentRoot: string;
  portraitRoot: string;
  request: SelectNpcPortraitRequest;
}): Promise<SelectNpcPortraitResponse> {
  const { roster, style, collection } = await loadNpcPortraitContext({
    contentRoot: args.contentRoot,
    portraitRoot: args.portraitRoot,
    ruleDirectoryName: args.request.ruleDirectoryName,
    storyDirectoryName: args.request.storyDirectoryName,
    styleId: args.request.styleId
  });
  const mergedRoster = mergeNpcRosterWithPortraits({
    roster,
    styleId: style.id,
    collection
  });
  const npc = findNpcOrThrow(mergedRoster, args.request.npcId);
  const portraitExists =
    npc.portraitVariants?.some((portrait) => portrait.portraitId === args.request.portraitId) ??
    false;

  if (!portraitExists) {
    throw new Error(`NPC portrait not found: ${args.request.portraitId}`);
  }

  const storedEntry = upsertStoredNpcEntry(collection, args.request.npcId);
  storedEntry.selectedPortraitId = args.request.portraitId;
  collection.updatedAt = new Date().toISOString();
  const updatedCollection = await writeNpcPortraitCollectionToDisk({
    portraitRoot: args.portraitRoot,
    collection
  });
  const updatedNpc =
    mergeNpcRosterWithPortraits({
      roster,
      styleId: style.id,
      collection: updatedCollection
    }).find((item) => item.id === args.request.npcId) ?? npc;

  return {
    npc: updatedNpc,
    style
  };
}

export { resolveNpcPortraitAssetAbsolutePath };
