import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  LoadedContentBundle,
  LocaleCode,
  ModelAccessMode,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import { getModelGateway } from "../model_gateway/index.ts";
import type {
  OpeningGenerationInput,
  OpeningGenerationOutput,
  OpeningGenerationStreamOptions
} from "../model_gateway/types.ts";

const TEXT_ASSETS_DIR_NAME = "text_assets";

type ResolveStoryOpeningRequest = {
  modelAccessMode: ModelAccessMode;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  forceRegenerateOpening?: boolean;
};

type CachedBeginningAsset = {
  fileName: string;
  text: string;
};

function sanitizeLocaleForFileName(locale: LocaleCode): string {
  return String(locale).replace(/[^a-zA-Z0-9._-]+/gu, "_");
}

function buildBeginningFileCandidates(locale: LocaleCode): string[] {
  const normalizedLocale = sanitizeLocaleForFileName(locale);

  return [
    `beginning.${normalizedLocale}.md`,
    `beginning.${normalizedLocale}.txt`,
    "beginning.md",
    "beginning.txt"
  ];
}

function getTextAssetsDir(storyBaseDir: string): string {
  return join(storyBaseDir, TEXT_ASSETS_DIR_NAME);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readCachedBeginningAsset(
  storyBaseDir: string,
  locale: LocaleCode
): Promise<CachedBeginningAsset | null> {
  const textAssetsDir = getTextAssetsDir(storyBaseDir);

  if (!(await pathExists(textAssetsDir))) {
    return null;
  }

  for (const fileName of buildBeginningFileCandidates(locale)) {
    const absolutePath = join(textAssetsDir, fileName);
    if (!(await pathExists(absolutePath))) {
      continue;
    }

    const text = (await readFile(absolutePath, "utf8")).trim();
    if (!text) {
      continue;
    }

    return {
      fileName,
      text
    };
  }

  return null;
}

async function writeCachedBeginningAsset(
  storyBaseDir: string,
  locale: LocaleCode,
  text: string
): Promise<void> {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return;
  }

  const textAssetsDir = getTextAssetsDir(storyBaseDir);
  await mkdir(textAssetsDir, {
    recursive: true
  });

  const fileName = `beginning.${sanitizeLocaleForFileName(locale)}.md`;
  await writeFile(join(textAssetsDir, fileName), normalizedText, "utf8");
}

function buildOpeningInput(
  bundle: LoadedContentBundle,
  request: ResolveStoryOpeningRequest
): OpeningGenerationInput {
  const ruleTitle =
    bundle.rule.manifest.title[bundle.rule.manifest.defaultLocale] ?? bundle.rule.manifest.id;
  const storyTitle =
    bundle.story.manifest.title[bundle.story.manifest.defaultLocale] ?? bundle.story.manifest.id;

  return {
    accessMode: request.modelAccessMode,
    modelProfileId: request.modelProfileId,
    runtimeModelConfig: request.runtimeModelConfig,
    locale: bundle.resolvedLocale,
    ruleTitle,
    ruleText: bundle.rule.rule.content,
    storyTitle,
    storyText: bundle.story.story.content
  };
}

function buildCachedOpeningResult(
  text: string,
  request: ResolveStoryOpeningRequest,
  fileName: string
): OpeningGenerationOutput {
  return {
    text,
    provider: `local-cache:${TEXT_ASSETS_DIR_NAME}/${fileName}`,
    mode: request.modelAccessMode,
    meta: {
      provider: `local-cache:${TEXT_ASSETS_DIR_NAME}/${fileName}`,
      mode: request.modelAccessMode,
      model: null,
      durationMs: 0,
      estimatedCost: {
        amount: 0,
        currency: "USD",
        pricingModel: "local-cache",
        note: "Loaded from story text_assets cache."
      },
      usage: {
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        promptCacheHitTokens: null,
        promptCacheMissTokens: null
      }
    }
  };
}

function splitBeginningTextIntoChunks(text: string): string[] {
  const chunks = text.match(/\S+\s*|\n+/gu) ?? [text];
  if (chunks.length <= 1) {
    return chunks;
  }

  const mergedChunks: string[] = [];
  let currentChunk = "";

  for (const chunk of chunks) {
    if (currentChunk.length > 0 && currentChunk.length + chunk.length > 72 && !chunk.includes("\n")) {
      mergedChunks.push(currentChunk);
      currentChunk = chunk;
      continue;
    }

    currentChunk += chunk;
  }

  if (currentChunk.length > 0) {
    mergedChunks.push(currentChunk);
  }

  return mergedChunks;
}

async function emitCachedOpeningText(
  text: string,
  options?: OpeningGenerationStreamOptions
): Promise<void> {
  if (!options?.onTextDelta) {
    return;
  }

  for (const chunk of splitBeginningTextIntoChunks(text)) {
    if (options.signal?.aborted) {
      throw new Error("Opening preview stream aborted.");
    }

    await options.onTextDelta(chunk);
  }
}

export async function resolveStoryOpening(
  bundle: LoadedContentBundle,
  request: ResolveStoryOpeningRequest,
  options?: OpeningGenerationStreamOptions
): Promise<OpeningGenerationOutput> {
  if (!request.forceRegenerateOpening) {
    const cachedAsset = await readCachedBeginningAsset(
      bundle.story.baseDir,
      bundle.resolvedLocale
    );

    if (cachedAsset) {
      await emitCachedOpeningText(cachedAsset.text, options);
      return buildCachedOpeningResult(cachedAsset.text, request, cachedAsset.fileName);
    }
  }

  const modelGateway = getModelGateway(request.modelAccessMode);
  const openingInput = buildOpeningInput(bundle, request);
  const generatedOpening = options?.onTextDelta
    ? await modelGateway.streamOpening(openingInput, options)
    : await modelGateway.generateOpening(openingInput);

  try {
    await writeCachedBeginningAsset(
      bundle.story.baseDir,
      bundle.resolvedLocale,
      generatedOpening.text
    );
  } catch (error) {
    console.warn(
      `[opening-cache] failed to persist beginning for ${bundle.story.baseDir}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return generatedOpening;
}
