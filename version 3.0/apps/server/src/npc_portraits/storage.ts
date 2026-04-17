import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import { join, resolve } from "node:path";

import type {
  NpcPortraitVariant,
  PersistedImageAsset
} from "../../../../packages/shared-types/src/index.ts";

export type StoredNpcPortraitEntry = {
  npcId: string;
  selectedPortraitId: string | null;
  portraits: NpcPortraitVariant[];
};

export type NpcPortraitCollection = {
  version: 1;
  collectionId: string;
  ruleDirectoryName: string;
  storyDirectoryName: string;
  styleId: string;
  styleName: string;
  createdAt: string;
  updatedAt: string;
  npcs: StoredNpcPortraitEntry[];
};

const COLLECTION_FILE_NAME = "portraits.json";
const COLLECTION_CACHE_NAMESPACE = "prompt_v2";

function buildDigest(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function sanitizeFragment(value: string): string {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  if (sanitized) {
    return sanitized;
  }

  return `id_${buildDigest(value)}`;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function buildCollectionId(
  ruleDirectoryName: string,
  storyDirectoryName: string,
  styleId: string
): string {
  const digest = buildDigest(
    [COLLECTION_CACHE_NAMESPACE, ruleDirectoryName, storyDirectoryName, styleId].join("::")
  );
  return [
    "npc_portraits",
    COLLECTION_CACHE_NAMESPACE,
    sanitizeFragment(ruleDirectoryName),
    sanitizeFragment(storyDirectoryName),
    sanitizeFragment(styleId),
    digest
  ].join("_");
}

function getCollectionDir(portraitRoot: string, collectionId: string): string {
  return join(portraitRoot, collectionId);
}

function getCollectionFilePath(portraitRoot: string, collectionId: string): string {
  return join(getCollectionDir(portraitRoot, collectionId), COLLECTION_FILE_NAME);
}

async function ensurePortraitRoot(portraitRoot: string): Promise<void> {
  await mkdir(portraitRoot, {
    recursive: true
  });
}

function buildAssetApiPath(collectionId: string, relativePath: string): string {
  const encodedSegments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));

  return `/api/npc-portrait-assets/${encodeURIComponent(collectionId)}/${encodedSegments.join("/")}`;
}

function withNormalizedAssetPaths(
  portraitRoot: string,
  collectionId: string,
  asset: PersistedImageAsset
): PersistedImageAsset {
  const relativePath = normalizeRelativePath(asset.relativePath);
  return {
    relativePath,
    storagePath: join(portraitRoot, collectionId, ...relativePath.split("/")),
    apiPath: buildAssetApiPath(collectionId, relativePath),
    mimeType: asset.mimeType ?? null
  };
}

function normalizeVariant(
  portraitRoot: string,
  collectionId: string,
  portrait: NpcPortraitVariant
): NpcPortraitVariant {
  return {
    ...portrait,
    image: withNormalizedAssetPaths(portraitRoot, collectionId, portrait.image)
  };
}

function normalizeCollection(
  portraitRoot: string,
  collection: NpcPortraitCollection
): NpcPortraitCollection {
  return {
    ...collection,
    npcs: collection.npcs.map((entry) => ({
      ...entry,
      portraits: entry.portraits.map((portrait) =>
        normalizeVariant(portraitRoot, collection.collectionId, portrait)
      )
    }))
  };
}

type ResolvedBinaryAsset = {
  bytes: Buffer;
  mimeType: string;
};

function parseDataUrl(sourceUrl: string): ResolvedBinaryAsset | null {
  const match = sourceUrl.match(/^data:([^;,]+);base64,(.+)$/u);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64")
  };
}

function guessExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    case "image/gif":
      return ".gif";
    default:
      return ".png";
  }
}

async function resolveBinaryAsset(sourceUrl: string): Promise<ResolvedBinaryAsset> {
  const inline = parseDataUrl(sourceUrl);
  if (inline) {
    return inline;
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to load asset: HTTP ${response.status}`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  return {
    mimeType,
    bytes: Buffer.from(await response.arrayBuffer())
  };
}

export async function loadNpcPortraitCollectionFromDisk(args: {
  portraitRoot: string;
  ruleDirectoryName: string;
  storyDirectoryName: string;
  styleId: string;
}): Promise<NpcPortraitCollection | null> {
  await ensurePortraitRoot(args.portraitRoot);
  const collectionId = buildCollectionId(
    args.ruleDirectoryName,
    args.storyDirectoryName,
    args.styleId
  );
  const filePath = getCollectionFilePath(args.portraitRoot, collectionId);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as NpcPortraitCollection;
    return normalizeCollection(args.portraitRoot, parsed);
  } catch {
    return null;
  }
}

export async function writeNpcPortraitCollectionToDisk(args: {
  portraitRoot: string;
  collection: NpcPortraitCollection;
}): Promise<NpcPortraitCollection> {
  await ensurePortraitRoot(args.portraitRoot);

  const normalized = normalizeCollection(args.portraitRoot, args.collection);
  const collectionDir = getCollectionDir(args.portraitRoot, normalized.collectionId);
  await mkdir(collectionDir, {
    recursive: true
  });
  await writeFile(
    getCollectionFilePath(args.portraitRoot, normalized.collectionId),
    JSON.stringify(normalized, null, 2),
    "utf8"
  );

  return normalized;
}

export async function saveNpcPortraitAssetToDisk(args: {
  portraitRoot: string;
  collectionId: string;
  npcId: string;
  portraitId: string;
  sourceUrl: string;
}): Promise<PersistedImageAsset> {
  await ensurePortraitRoot(args.portraitRoot);

  const collectionDir = getCollectionDir(args.portraitRoot, args.collectionId);
  const npcDir = join(collectionDir, "portraits", sanitizeFragment(args.npcId));
  await mkdir(npcDir, {
    recursive: true
  });

  const resolvedAsset = await resolveBinaryAsset(args.sourceUrl);
  const extension = guessExtension(resolvedAsset.mimeType);
  const fileName = `${sanitizeFragment(args.npcId)}_${sanitizeFragment(args.portraitId)}${extension}`;
  const storagePath = join(npcDir, fileName);
  await writeFile(storagePath, resolvedAsset.bytes);

  const relativePath = normalizeRelativePath(
    join("portraits", sanitizeFragment(args.npcId), fileName)
  );
  return {
    relativePath,
    storagePath,
    apiPath: buildAssetApiPath(args.collectionId, relativePath),
    mimeType: resolvedAsset.mimeType
  };
}

export function createNpcPortraitCollection(args: {
  ruleDirectoryName: string;
  storyDirectoryName: string;
  styleId: string;
  styleName: string;
  createdAt: string;
}): NpcPortraitCollection {
  return {
    version: 1,
    collectionId: buildCollectionId(args.ruleDirectoryName, args.storyDirectoryName, args.styleId),
    ruleDirectoryName: args.ruleDirectoryName,
    storyDirectoryName: args.storyDirectoryName,
    styleId: args.styleId,
    styleName: args.styleName,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
    npcs: []
  };
}

export function resolveNpcPortraitAssetAbsolutePath(args: {
  portraitRoot: string;
  collectionId: string;
  relativePath: string;
}): string {
  const collectionDir = getCollectionDir(args.portraitRoot, args.collectionId);
  const normalizedRelativePath = normalizeRelativePath(args.relativePath);
  const absolutePath = resolve(collectionDir, normalizedRelativePath);

  if (!absolutePath.startsWith(resolve(collectionDir))) {
    throw new Error("Forbidden NPC portrait asset path.");
  }

  return absolutePath;
}
