import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  buildLanguageSystemPrompt,
  fromLocaleCode
} from "../../../../packages/shared-config/src/index.ts";
import type {
  AppendPersistedComicPageRequest,
  ComicCharacterReferenceInput,
  ComicProjectSummary,
  ComicMetadataGenerationRequest,
  ComicMetadataGenerationResponse,
  ComicPageGenerationRequest,
  ComicPageGenerationResponse,
  ComicPromptPresetResponse,
  ComicReferenceImageInput,
  ComicStylePreset,
  CreatePersistedComicRequest,
  ImageGenerationRequest,
  ImageReferenceInput,
  PersistedComicAsset,
  PersistedComicPage,
  PersistedComicProject,
  RuntimeImageModelConfigInput,
  UpsertWorldlineComicPageRequest,
  UpsertWorldlineComicPageResponse
} from "../../../../packages/shared-types/src/index.ts";
import { getModelGateway } from "../model_gateway/index.ts";
import { generateImage } from "../image_generation/service.ts";
import { logComicPipelineEvent } from "./logging.ts";
import {
  buildComicMetadataPrompt,
  buildComicPagePrompt,
  loadComicPromptPresets
} from "./prompt.ts";
import {
  createComicId,
  deleteComicProjectFromDisk,
  listComicProjectsFromDisk,
  loadComicProjectFromDisk,
  saveComicAssetToDisk,
  writeComicProjectToDisk
} from "./storage.ts";

const PASS_THROUGH_IMAGE_PROMPT_TEMPLATE_CONFIG: ImageGenerationRequest["promptTemplateConfig"] = {
  version: 1,
  defaultTheme: "comic",
  defaultTrigger: "manual",
  fallbackTriggerTemplate: "{basePrompt}",
  themes: {
    comic: ""
  },
  triggerTemplates: {
    manual: "{basePrompt}",
    character_portrait: "{basePrompt}",
    npc_intro: "{basePrompt}",
    scene_shift: "{basePrompt}"
  },
  characterClauseTemplate: "{joinedCharacters}",
  characterJoinSeparator: ", ",
  characterEntryTemplate: "{name}({appearance})"
};

const WORLDLINE_COMIC_IN_FLIGHT_REQUESTS = new Map<
  string,
  Promise<UpsertWorldlineComicPageResponse>
>();

type ComicPipelineLogContext = {
  comicRoot: string;
  source: string;
  operationId: string;
  worldlineId?: string;
  comicId?: string;
  pageNumber?: number;
  pageIndex?: number;
};

type ComicPageGenerationRequestWithLogContext = ComicPageGenerationRequest & {
  __logContext?: ComicPipelineLogContext;
};

function compactWhitespace(input: string): string {
  return input.replace(/\s+/gu, " ").trim();
}

function buildComicPipelineOperationId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function buildTextPreview(input: string, maxLength = 180): string {
  const compact = compactWhitespace(input);
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}

function sanitizeUrlForLog(input: string | undefined): string | null {
  const compact = compactWhitespace(input ?? "");
  if (!compact) {
    return null;
  }

  try {
    const url = new URL(compact);
    return `${url.origin}${url.pathname}`;
  } catch {
    return buildTextPreview(compact, 160);
  }
}

function summarizeRuntimeImageModelConfig(
  config: RuntimeImageModelConfigInput | undefined
): Record<string, unknown> | null {
  if (!config) {
    return null;
  }

  return {
    baseUrl: sanitizeUrlForLog(config.baseUrl),
    model: compactWhitespace(config.model ?? "") || null,
    imageSize: compactWhitespace(config.imageSize ?? "") || null,
    aspectRatio: compactWhitespace(config.aspectRatio ?? "") || null,
    quality: compactWhitespace(config.quality ?? "") || null,
    background: compactWhitespace(config.background ?? "") || null,
    outputFormat: compactWhitespace(config.outputFormat ?? "") || null,
    outputCompression:
      typeof config.outputCompression === "number" ? config.outputCompression : null,
    watermark: typeof config.watermark === "boolean" ? config.watermark : null
  };
}

function summarizePersistedComicAsset(asset: PersistedComicAsset): Record<string, unknown> {
  return {
    relativePath: asset.relativePath,
    mimeType: asset.mimeType ?? null,
    apiPath: asset.apiPath
  };
}

function summarizePersistedComicProject(project: PersistedComicProject): Record<string, unknown> {
  return {
    comicId: project.comicId,
    pageCount: project.pages.length,
    pageNumbers: project.pages.map((page) => page.pageNumber),
    coverImage: project.coverImage?.relativePath ?? null,
    pages: project.pages.map((page) => ({
      pageNumber: page.pageNumber,
      provider: page.provider,
      image: summarizePersistedComicAsset(page.image)
    }))
  };
}

function summarizeComicPageRequestForLog(
  request: ComicPageGenerationRequest,
  pageNumber: number
): Record<string, unknown> {
  return {
    pageNumber,
    requestedPageNumber: typeof request.pageNumber === "number" ? request.pageNumber : null,
    sceneId: buildSceneId(request, pageNumber),
    styleId: compactWhitespace(request.styleId ?? "") || null,
    allowFallback: request.allowFallback !== false,
    storyPromptLength: request.storyPrompt.length,
    storyPromptDigest: buildShortDigest(request.storyPrompt),
    storyPromptPreview: buildTextPreview(request.storyPrompt),
    storyMemorySummaryLength: compactWhitespace(request.storyMemorySummary ?? "").length,
    negativePromptLength: compactWhitespace(request.negativePrompt ?? "").length,
    previousPageCount: request.previousPages?.length ?? 0,
    latestPreviousPageNumber:
      [...(request.previousPages ?? [])].sort((left, right) => left.pageNumber - right.pageNumber).at(-1)
        ?.pageNumber ?? null,
    referenceImageCount: request.referenceImages?.length ?? 0,
    characterReferenceCount: request.characterReferences?.length ?? 0,
    imageProfileId: compactWhitespace(request.imageProfileId ?? "") || null,
    runtimeImageModelConfig: summarizeRuntimeImageModelConfig(request.runtimeImageModelConfig)
  };
}

function summarizeComicPagePromptBundleForLog(args: {
  prompt: string;
  style: ComicStylePreset;
  pageNumber: number;
  continuationContext: string | null;
  referenceImages: ImageReferenceInput[];
  characterReferenceCount: number;
  previousPageReferenceCount: number;
  sceneId: string;
}): Record<string, unknown> {
  return {
    pageNumber: args.pageNumber,
    styleId: args.style.id,
    styleName: args.style.name,
    promptDigest: buildShortDigest(args.prompt),
    promptLength: args.prompt.length,
    promptPreview: buildTextPreview(args.prompt),
    continuationContextPresent: Boolean(args.continuationContext),
    referenceImageCount: args.referenceImages.length,
    characterReferenceCount: args.characterReferenceCount,
    previousPageReferenceCount: args.previousPageReferenceCount,
    sceneId: args.sceneId
  };
}

function summarizeComicPageResultForLog(
  result: ComicPageGenerationResponse
): Record<string, unknown> {
  return {
    pageNumber: result.pageNumber,
    provider: result.provider,
    mimeType: result.mimeType ?? null,
    cached: result.cached,
    styleId: result.style.id,
    continuationContextPresent: Boolean(result.continuationContext),
    revisedPromptDigest: buildShortDigest(result.revisedPrompt),
    revisedPromptLength: result.revisedPrompt.length,
    revisedPromptPreview: buildTextPreview(result.revisedPrompt),
    outputPath: result.outputPath ?? null
  };
}

function isSvgComicImageResult(result: {
  provider: string;
  mimeType?: string | null;
}): boolean {
  return compactWhitespace(result.mimeType ?? "").toLowerCase() === "image/svg+xml";
}

function isFallbackOrMockComicProvider(provider: string): boolean {
  const normalizedProvider = compactWhitespace(provider).toLowerCase();
  return (
    normalizedProvider.includes(":fallback") ||
    normalizedProvider.includes("image:mock") ||
    normalizedProvider.includes("mock-local")
  );
}

async function logComicPipelineWithContext(
  context: ComicPipelineLogContext | undefined,
  input: Omit<Parameters<typeof logComicPipelineEvent>[1], "source" | "operationId" | "worldlineId" | "comicId">
): Promise<void> {
  if (!context) {
    return;
  }

  await logComicPipelineEvent(context.comicRoot, {
    ...input,
    source: context.source,
    operationId: context.operationId,
    worldlineId: context.worldlineId ?? null,
    comicId: context.comicId ?? null,
    pageNumber:
      typeof input.pageNumber === "number"
        ? input.pageNumber
        : typeof context.pageNumber === "number"
          ? context.pageNumber
          : null,
    pageIndex:
      typeof input.pageIndex === "number"
        ? input.pageIndex
        : typeof context.pageIndex === "number"
          ? context.pageIndex
          : typeof context.pageNumber === "number"
            ? context.pageNumber - 1
            : null
  });
}

function buildShortDigest(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function buildSceneId(request: ComicPageGenerationRequest, pageNumber: number): string {
  const requestedSceneId = compactWhitespace(request.sceneId ?? "");
  if (requestedSceneId.length > 0) {
    return requestedSceneId;
  }

  const basis = JSON.stringify({
    storyPrompt: request.storyPrompt,
    styleId: request.styleId,
    pageNumber,
    storyMemorySummary: request.storyMemorySummary,
    negativePrompt: request.negativePrompt,
    previousPages: request.previousPages?.map((item) => ({
      pageNumber: item.pageNumber,
      prompt: item.prompt,
      summary: item.summary,
      imageDigest: item.imageUrl ? buildShortDigest(item.imageUrl) : null
    })) ?? [],
    referenceImages: request.referenceImages?.map((item) => ({
      role: item.role,
      name: item.name,
      appearance: item.appearance,
      imageDigest: buildShortDigest(item.imageUrl)
    })) ?? [],
    characterReferences: request.characterReferences?.map((item) => ({
      name: item.name,
      appearance: item.appearance
    })) ?? []
  });

  const digest = createHash("sha1").update(basis).digest("hex").slice(0, 12);
  return `comic-page-${pageNumber}-${digest}`;
}

function appendUniqueReferenceImage(
  bucket: ImageReferenceInput[],
  seenUrls: Set<string>,
  imageUrl: string,
  role: ImageReferenceInput["role"],
  label?: string
): void {
  const cleanUrl = compactWhitespace(imageUrl);
  if (!cleanUrl || seenUrls.has(cleanUrl)) {
    return;
  }

  seenUrls.add(cleanUrl);
  bucket.push({
    imageUrl: cleanUrl,
    role,
    label: compactWhitespace(label ?? "")
  });
}

function collectReferenceImages(request: ComicPageGenerationRequest): ImageReferenceInput[] {
  const output: ImageReferenceInput[] = [];
  const seenUrls = new Set<string>();
  const previousPages = [...(request.previousPages ?? [])].sort(
    (left, right) => left.pageNumber - right.pageNumber
  );
  const latestPreviousPage = previousPages.at(-1);

  if (latestPreviousPage?.imageUrl) {
    appendUniqueReferenceImage(
      output,
      seenUrls,
      latestPreviousPage.imageUrl,
      "previous_page",
      `Page ${latestPreviousPage.pageNumber}`
    );
  }

  for (const item of request.referenceImages ?? []) {
    appendUniqueReferenceImage(
      output,
      seenUrls,
      item.imageUrl,
      item.role ?? "character",
      item.name
    );
  }

  return output;
}

function collectCharacterReferences(
  request: ComicPageGenerationRequest
): ComicCharacterReferenceInput[] {
  return (request.characterReferences ?? [])
    .map((item) => ({
      name: compactWhitespace(item.name ?? "") || undefined,
      appearance: compactWhitespace(item.appearance)
    }))
    .filter((item) => item.appearance.length > 0);
}

function buildFallbackTitle(storyPrompt: string): string {
  const compact = compactWhitespace(storyPrompt);
  if (!compact) {
    return "Untitled Comic";
  }

  return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact;
}

function buildFallbackDescription(storyPrompt: string, styleName: string): string {
  const compact = compactWhitespace(storyPrompt);
  const description = compact
    ? `${styleName} comic adaptation of: ${compact}`
    : `${styleName} comic concept.`;

  return description.length > 200 ? `${description.slice(0, 197)}...` : description;
}

function buildWorldlineComicTitle(storyTitle: string): string {
  const cleanStoryTitle = compactWhitespace(storyTitle);
  return cleanStoryTitle || "Worldline Comic";
}

function buildWorldlineComicDescription(ruleTitle: string, storyTitle: string): string {
  const cleanRuleTitle = compactWhitespace(ruleTitle);
  const cleanStoryTitle = compactWhitespace(storyTitle);
  const combined = [cleanRuleTitle, cleanStoryTitle].filter(Boolean).join(" / ");
  return combined || "TRPG worldline comic archive.";
}

function inferMimeTypeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  if (lower.endsWith(".gif")) {
    return "image/gif";
  }

  return "image/png";
}

function buildRecoveredComicStyle(): ComicStylePreset {
  return {
    id: "recovered",
    name: "Recovered",
    prompt: "Recovered from copied local worldline comic assets."
  };
}

function buildRecoveredComicAsset(
  comicRoot: string,
  worldlineId: string,
  fileName: string
) {
  const relativePath = `pages/${fileName}`;
  return {
    relativePath,
    storagePath: join(comicRoot, worldlineId, "pages", fileName),
    apiPath: `/api/comic-assets/${encodeURIComponent(worldlineId)}/pages/${encodeURIComponent(fileName)}`,
    mimeType: inferMimeTypeFromFileName(fileName)
  };
}

type NumberedWorldlineComicFile = {
  fileName: string;
  pageIndex: number;
  priority: number;
};

function buildWorldlineComicRequestKey(worldlineId: string, pageNumber: number): string {
  return `${worldlineId}:${pageNumber}`;
}

function buildWorldlineComicRelativePath(fileName: string): string {
  return `pages/${fileName}`.replace(/\\/g, "/").toLowerCase();
}

function isSvgWorldlineComicFile(fileName: string): boolean {
  return /\.svg$/iu.test(fileName);
}

function getWorldlineComicFilePriority(fileName: string): number {
  return isSvgWorldlineComicFile(fileName) ? 0 : 1;
}

function selectPreferredNumberedWorldlineComicFiles(
  files: NumberedWorldlineComicFile[]
): NumberedWorldlineComicFile[] {
  const preferredFiles = new Map<number, NumberedWorldlineComicFile>();

  for (const file of files) {
    const current = preferredFiles.get(file.pageIndex);
    if (
      !current ||
      file.priority > current.priority ||
      (file.priority === current.priority && file.fileName.localeCompare(current.fileName) < 0)
    ) {
      preferredFiles.set(file.pageIndex, file);
    }
  }

  return [...preferredFiles.values()].sort((left, right) => left.pageIndex - right.pageIndex);
}

async function listNumberedWorldlineComicFiles(
  comicRoot: string,
  worldlineId: string
): Promise<NumberedWorldlineComicFile[]> {
  const pagesDir = join(comicRoot, worldlineId, "pages");
  const entries = await readdir(pagesDir, {
    withFileTypes: true
  });

  return entries
    .filter((entry) => entry.isFile() && /^\d+\.(png|jpe?g|webp|gif|svg)$/iu.test(entry.name))
    .map((entry) => ({
      fileName: entry.name,
      pageIndex: Number.parseInt(entry.name, 10),
      priority: getWorldlineComicFilePriority(entry.name)
    }))
    .sort(
      (left, right) =>
        left.pageIndex - right.pageIndex ||
        right.priority - left.priority ||
        left.fileName.localeCompare(right.fileName)
    );
}

function buildRecoveredComicPage(args: {
  comicRoot: string;
  worldlineId: string;
  fileName: string;
  pageIndex: number;
  createdAt: string;
  style: ComicStylePreset;
}): PersistedComicPage {
  return {
    pageId: `recovered_${args.pageIndex}`,
    pageNumber: args.pageIndex + 1,
    storyPrompt: "",
    revisedPrompt: "",
    continuationContext: null,
    negativePrompt: null,
    provider: "recovered-local",
    createdAt: args.createdAt,
    style: args.style,
    image: buildRecoveredComicAsset(args.comicRoot, args.worldlineId, args.fileName),
    characterReferenceIds: [],
    previousPageNumber: args.pageIndex > 0 ? args.pageIndex : null
  };
}

async function recoverCopiedWorldlineComicProject(
  comicRoot: string,
  worldlineId: string
) {
  const numberedFiles = selectPreferredNumberedWorldlineComicFiles(
    await listNumberedWorldlineComicFiles(comicRoot, worldlineId)
  );

  if (numberedFiles.length === 0) {
    throw new Error(`Worldline comic not found: ${worldlineId}`);
  }

  const now = new Date().toISOString();
  const recoveredStyle = buildRecoveredComicStyle();
  return writeComicProjectToDisk(comicRoot, {
    comicId: worldlineId,
    createdAt: now,
    updatedAt: now,
    title: "Recovered Worldline Comic",
    description: "Recovered from copied local comic pages.",
    storyPrompt: "",
    style: recoveredStyle,
    pageCount: numberedFiles.length,
    storageRoot: "",
    coverImage: buildRecoveredComicAsset(comicRoot, worldlineId, numberedFiles[0].fileName),
    references: [],
    pages: numberedFiles.map(({ fileName, pageIndex }) =>
      buildRecoveredComicPage({
        comicRoot,
        worldlineId,
        fileName,
        pageIndex,
        createdAt: now,
        style: recoveredStyle
      })
    )
  });
}

async function syncWorldlineComicProjectWithLocalPages(
  comicRoot: string,
  worldlineId: string,
  project: PersistedComicProject
): Promise<PersistedComicProject> {
  const numberedFiles = selectPreferredNumberedWorldlineComicFiles(
    await listNumberedWorldlineComicFiles(comicRoot, worldlineId).catch(() => [])
  );
  if (numberedFiles.length === 0) {
    return project;
  }

  const preferredFilesByPageNumber = new Map(
    numberedFiles.map((file) => [file.pageIndex + 1, file] as const)
  );
  const recoveredCreatedAt = project.updatedAt || project.createdAt || new Date().toISOString();
  let repairedAnyExistingPage = false;
  const repairedPages = project.pages.map((page) => {
    const preferredFile = preferredFilesByPageNumber.get(page.pageNumber);
    if (!preferredFile) {
      return page;
    }

    const currentRelativePath = page.image.relativePath.replace(/\\/g, "/").toLowerCase();
    const preferredRelativePath = buildWorldlineComicRelativePath(preferredFile.fileName);
    const currentIsSvg =
      currentRelativePath.endsWith(".svg") || page.image.mimeType === "image/svg+xml";
    const preferredIsRaster = preferredFile.priority > 0;

    if (currentRelativePath === preferredRelativePath || !currentIsSvg || !preferredIsRaster) {
      return page;
    }

    repairedAnyExistingPage = true;
    return {
      ...page,
      image: buildRecoveredComicAsset(comicRoot, worldlineId, preferredFile.fileName)
    };
  });
  const existingPageNumbers = new Set(repairedPages.map((page) => page.pageNumber));
  const existingRelativePaths = new Set(
    repairedPages.map((page) => page.image.relativePath.replace(/\\/g, "/").toLowerCase())
  );
  const missingPages = numberedFiles.flatMap(({ fileName, pageIndex }) => {
    const pageNumber = pageIndex + 1;
    const relativePath = buildWorldlineComicRelativePath(fileName);
    if (existingPageNumbers.has(pageNumber) || existingRelativePaths.has(relativePath)) {
      return [];
    }

    return [
      buildRecoveredComicPage({
        comicRoot,
        worldlineId,
        fileName,
        pageIndex,
        createdAt: recoveredCreatedAt,
        style: project.style
      })
    ];
  });

  if (missingPages.length === 0) {
    if (!repairedAnyExistingPage) {
      return project;
    }
  } else if (!repairedAnyExistingPage) {
    // continue below to persist recovered pages
  }

  return writeComicProjectToDisk(comicRoot, {
    ...project,
    updatedAt: new Date().toISOString(),
    pageCount: repairedPages.length + missingPages.length,
    pages: [...repairedPages, ...missingPages]
  });
}

function parseMetadataJson(rawText: string): {
  title: string;
  description: string;
} | null {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/u);
  if (!jsonMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: unknown;
      description?: unknown;
    };
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const description =
      typeof parsed.description === "string" ? parsed.description.trim() : "";

    if (!title && !description) {
      return null;
    }

    return {
      title,
      description
    };
  } catch {
    return null;
  }
}

function buildFallbackMetadata(storyPrompt: string, styleName: string): {
  title: string;
  description: string;
} {
  const title = buildFallbackTitle(storyPrompt);
  return {
    title,
    description: buildFallbackDescription(storyPrompt, styleName)
  };
}

async function fileToDataUrl(storagePath: string, mimeType: string | null): Promise<string> {
  const bytes = await readFile(storagePath);
  return `data:${mimeType ?? "image/png"};base64,${bytes.toString("base64")}`;
}

async function buildPersistedReferenceInputs(project: Awaited<ReturnType<typeof loadComicProjectFromDisk>>): Promise<ComicReferenceImageInput[]> {
  const references = project.references
    .filter((item) => item.role === "character")
    .slice(0, 2);

  const output: ComicReferenceImageInput[] = [];
  for (const item of references) {
    output.push({
      role: "character",
      name: item.name ?? undefined,
      appearance: item.appearance ?? undefined,
      imageUrl: await fileToDataUrl(item.image.storagePath, item.image.mimeType)
    });
  }

  return output;
}

async function buildPersistedPreviousPages(project: Awaited<ReturnType<typeof loadComicProjectFromDisk>>): Promise<ComicPageGenerationRequest["previousPages"]> {
  const sortedPages = [...project.pages].sort((left, right) => left.pageNumber - right.pageNumber);
  const latestPageNumber = sortedPages.at(-1)?.pageNumber ?? null;
  const output: NonNullable<ComicPageGenerationRequest["previousPages"]> = [];

  for (const item of sortedPages) {
    output.push({
      pageNumber: item.pageNumber,
      prompt: item.storyPrompt,
      imageUrl:
        item.pageNumber === latestPageNumber
          ? await fileToDataUrl(item.image.storagePath, item.image.mimeType)
          : undefined
    });
  }

  return output;
}

async function resolveComicTitleAndDescription(
  request: CreatePersistedComicRequest
): Promise<{
  title: string;
  description: string;
}> {
  const cleanTitle = compactWhitespace(request.title ?? "");
  const cleanDescription = compactWhitespace(request.description ?? "");

  if (cleanTitle && cleanDescription) {
    return {
      title: cleanTitle,
      description: cleanDescription
    };
  }

  if (request.generateMetadata === false) {
    return {
      title: cleanTitle || buildFallbackTitle(request.storyPrompt),
      description:
        cleanDescription ||
        buildFallbackDescription(request.storyPrompt, (await buildComicPagePrompt(request)).style.name)
    };
  }

  try {
    const metadata = await generateComicMetadata({
      storyPrompt: request.storyPrompt,
      styleId: request.styleId,
      locale: request.metadataLocale ?? "zh-CN",
      modelAccessMode: request.metadataModelAccessMode ?? "mock",
      modelProfileId: request.metadataModelProfileId,
      runtimeModelConfig: request.metadataRuntimeModelConfig
    });

    return {
      title: cleanTitle || metadata.title,
      description: cleanDescription || metadata.description
    };
  } catch {
    const style = (await buildComicPagePrompt(request)).style;
    const fallback = buildFallbackMetadata(request.storyPrompt, style.name);
    return {
      title: cleanTitle || fallback.title,
      description: cleanDescription || fallback.description
    };
  }
}

export async function listComicPromptPresets(): Promise<ComicPromptPresetResponse> {
  return loadComicPromptPresets();
}

export async function generateComicPage(
  request: ComicPageGenerationRequestWithLogContext
): Promise<ComicPageGenerationResponse> {
  const logContext = request.__logContext;
  const startedAt = Date.now();
  const requestedPageNumber =
    typeof request.pageNumber === "number" && Number.isFinite(request.pageNumber)
      ? Math.max(1, Math.floor(request.pageNumber))
      : 1;

  await logComicPipelineWithContext(logContext, {
    event: "comic.generate.start",
    details: summarizeComicPageRequestForLog(request, requestedPageNumber)
  });

  try {
    const promptBundle = await buildComicPagePrompt(request);
    const referenceImages = collectReferenceImages(request);
    const characterReferences = collectCharacterReferences(request);
    const characterReferenceCount =
      referenceImages.filter((item) => (item.role ?? "character") === "character").length +
      characterReferences.length;
    const previousPageReferenceCount = referenceImages.filter(
      (item) => item.role === "previous_page"
    ).length;
    const sceneId = buildSceneId(request, promptBundle.pageNumber);

    await logComicPipelineWithContext(logContext, {
      event: "comic.generate.prompt_built",
      pageNumber: promptBundle.pageNumber,
      pageIndex: promptBundle.pageNumber - 1,
      details: summarizeComicPagePromptBundleForLog({
        prompt: promptBundle.prompt,
        style: promptBundle.style,
        pageNumber: promptBundle.pageNumber,
        continuationContext: promptBundle.continuationContext,
        referenceImages,
        characterReferenceCount,
        previousPageReferenceCount,
        sceneId
      })
    });

    const imageResult = await generateImage({
      prompt: promptBundle.prompt,
      trigger: "manual",
      theme: "comic",
      sceneId,
      referenceImages,
      negativePrompt: request.negativePrompt,
      allowFallback: request.allowFallback,
      imageProfileId: request.imageProfileId,
      runtimeImageModelConfig: request.runtimeImageModelConfig,
      promptTemplateConfig: PASS_THROUGH_IMAGE_PROMPT_TEMPLATE_CONFIG
    });

    const result = {
      ...imageResult,
      style: promptBundle.style,
      pageNumber: promptBundle.pageNumber,
      continuationContext: promptBundle.continuationContext,
      characterReferenceCount,
      previousPageReferenceCount
    };

    const suspiciousOutput =
      isSvgComicImageResult(result) || isFallbackOrMockComicProvider(result.provider);

    if (suspiciousOutput) {
      await logComicPipelineWithContext(logContext, {
        level: "warn",
        event: "comic.generate.suspicious_output",
        pageNumber: result.pageNumber,
        pageIndex: result.pageNumber - 1,
        details: {
          allowFallback: request.allowFallback !== false,
          ...summarizeComicPageResultForLog(result)
        }
      });
    }

    if (request.allowFallback === false && suspiciousOutput) {
      throw new Error(
        `Comic generation returned disallowed fallback output (${result.provider}, ${result.mimeType ?? "unknown"}).`
      );
    }

    await logComicPipelineWithContext(logContext, {
      event: "comic.generate.success",
      pageNumber: result.pageNumber,
      pageIndex: result.pageNumber - 1,
      durationMs: Date.now() - startedAt,
      details: summarizeComicPageResultForLog(result)
    });

    return result;
  } catch (error) {
    await logComicPipelineWithContext(logContext, {
      level: "error",
      event: "comic.generate.failure",
      pageNumber: requestedPageNumber,
      pageIndex: requestedPageNumber - 1,
      durationMs: Date.now() - startedAt,
      details: summarizeComicPageRequestForLog(request, requestedPageNumber),
      error
    });
    throw error;
  }
}

export async function generateComicMetadata(
  request: ComicMetadataGenerationRequest
): Promise<ComicMetadataGenerationResponse> {
  const { prompt, style } = await buildComicMetadataPrompt(request);

  if (request.modelAccessMode === "mock") {
    const title = buildFallbackTitle(request.storyPrompt);
    return {
      title,
      description: buildFallbackDescription(request.storyPrompt, style.name),
      rawText: JSON.stringify(
        {
          title,
          description: buildFallbackDescription(request.storyPrompt, style.name)
        },
        null,
        2
      ),
      provider: "mock-local",
      mode: "mock",
      meta: {
        provider: "mock-local",
        mode: "mock",
        model: "mock-local",
        durationMs: 0,
        estimatedCost: {
          amount: 0,
          currency: "USD",
          pricingModel: "mock-local",
          note: "Mock mode returns deterministic comic metadata."
        },
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          promptCacheHitTokens: null,
          promptCacheMissTokens: null
        }
      },
      style
    };
  }

  const gateway = getModelGateway(request.modelAccessMode);
  const language = fromLocaleCode(request.locale);
  const gatewayResult = await gateway.generatePromptedText({
    accessMode: request.modelAccessMode,
    modelProfileId: request.modelProfileId,
    runtimeModelConfig: request.runtimeModelConfig,
    locale: request.locale,
    systemPrompt: [
      "You generate concise comic metadata.",
      buildLanguageSystemPrompt(request.locale),
      `Return the title and description in ${language.englishName} (${language.code}).`,
      "Return valid JSON only."
    ].join("\n"),
    userPrompt: prompt
  });

  const parsed = parseMetadataJson(gatewayResult.text);
  const title = parsed?.title || buildFallbackTitle(request.storyPrompt);
  const description =
    parsed?.description || buildFallbackDescription(request.storyPrompt, style.name);

  return {
    title: title.length > 60 ? `${title.slice(0, 57)}...` : title,
    description:
      description.length > 200 ? `${description.slice(0, 197)}...` : description,
    rawText: gatewayResult.text,
    provider: gatewayResult.provider,
    mode: gatewayResult.mode,
    meta: gatewayResult.meta,
    style
  };
}

export async function listPersistedComicProjects(
  comicRoot: string
): Promise<ComicProjectSummary[]> {
  return listComicProjectsFromDisk(comicRoot);
}

export async function loadPersistedComicProject(
  comicRoot: string,
  comicId: string
) {
  return loadComicProjectFromDisk(comicRoot, comicId);
}

export async function deletePersistedComicProject(
  comicRoot: string,
  comicId: string
): Promise<boolean> {
  return deleteComicProjectFromDisk(comicRoot, comicId);
}

export async function createPersistedComicProject(
  comicRoot: string,
  request: CreatePersistedComicRequest
) {
  const operationId = buildComicPipelineOperationId("comic_create");
  const startedAt = Date.now();
  let comicId: string | undefined;

  await logComicPipelineEvent(comicRoot, {
    event: "comic.project.create.start",
    source: "comic.project.create",
    operationId,
    details: {
      requestedTitle: buildTextPreview(request.title ?? "", 80) || null,
      generateMetadata: request.generateMetadata !== false,
      ...summarizeComicPageRequestForLog(request, 1)
    }
  });

  try {
    const now = new Date().toISOString();
    const promptBundle = await buildComicPagePrompt(request);
    comicId = await createComicId(request.title || request.storyPrompt, now);
    const titleAndDescription = await resolveComicTitleAndDescription(request);
    const generatedPage = await generateComicPage({
      ...request,
      __logContext: {
        comicRoot,
        source: "comic.project.create.generate",
        operationId,
        comicId,
        pageNumber: promptBundle.pageNumber,
        pageIndex: promptBundle.pageNumber - 1
      }
    });

    const persistedReferences = [];
    for (const [index, reference] of (request.referenceImages ?? [])
      .filter((item) => (item.role ?? "character") === "character")
      .slice(0, 2)
      .entries()) {
      const image = await saveComicAssetToDisk({
        comicRoot,
        comicId,
        folderName: "references",
        fileNameStem: `ref-${index + 1}-${reference.name || "character"}`,
        sourceUrl: reference.imageUrl
      });

      persistedReferences.push({
        referenceId: `ref_${randomUUID().slice(0, 8)}`,
        role: "character" as const,
        name: compactWhitespace(reference.name ?? "") || null,
        appearance: compactWhitespace(reference.appearance ?? "") || null,
        sourceUrl: reference.imageUrl.startsWith("data:") ? null : reference.imageUrl,
        createdAt: now,
        image
      });
    }

    if (persistedReferences.length > 0) {
      await logComicPipelineEvent(comicRoot, {
        event: "comic.project.create.references_saved",
        source: "comic.project.create",
        operationId,
        comicId,
        details: {
          count: persistedReferences.length,
          references: persistedReferences.map((item) => ({
            referenceId: item.referenceId,
            name: item.name,
            image: summarizePersistedComicAsset(item.image)
          }))
        }
      });
    }

    const pageId = `page_${randomUUID().slice(0, 8)}`;
    const persistedImage = await saveComicAssetToDisk({
      comicRoot,
      comicId,
      folderName: "pages",
      fileNameStem: `page-${String(generatedPage.pageNumber).padStart(3, "0")}-${pageId}`,
      sourceUrl: generatedPage.imageUrl
    });

    await logComicPipelineEvent(comicRoot, {
      event: "comic.project.create.page_asset_saved",
      source: "comic.project.create",
      operationId,
      comicId,
      pageNumber: generatedPage.pageNumber,
      pageIndex: generatedPage.pageNumber - 1,
      details: {
        provider: generatedPage.provider,
        persistedImage: summarizePersistedComicAsset(persistedImage)
      }
    });

    const project = await writeComicProjectToDisk(comicRoot, {
      comicId,
      createdAt: now,
      updatedAt: now,
      title: titleAndDescription.title,
      description: titleAndDescription.description,
      storyPrompt: request.storyPrompt.trim(),
      style: promptBundle.style,
      pageCount: 1,
      storageRoot: "",
      coverImage: persistedImage,
      references: persistedReferences,
      pages: [
        {
          pageId,
          pageNumber: generatedPage.pageNumber,
          storyPrompt: request.storyPrompt.trim(),
          revisedPrompt: generatedPage.revisedPrompt,
          continuationContext: generatedPage.continuationContext,
          negativePrompt: compactWhitespace(request.negativePrompt ?? "") || null,
          provider: generatedPage.provider,
          createdAt: now,
          style: generatedPage.style,
          image: persistedImage,
          characterReferenceIds: persistedReferences.map((item) => item.referenceId),
          previousPageNumber: null
        }
      ]
    });

    await logComicPipelineEvent(comicRoot, {
      event: "comic.project.create.success",
      source: "comic.project.create",
      operationId,
      comicId,
      pageNumber: generatedPage.pageNumber,
      pageIndex: generatedPage.pageNumber - 1,
      durationMs: Date.now() - startedAt,
      details: {
        title: project.title,
        descriptionPreview: buildTextPreview(project.description, 120),
        page: {
          pageNumber: project.pages[0].pageNumber,
          provider: project.pages[0].provider,
          image: summarizePersistedComicAsset(project.pages[0].image)
        },
        project: summarizePersistedComicProject(project)
      }
    });

    return {
      project,
      page: project.pages[0]
    };
  } catch (error) {
    await logComicPipelineEvent(comicRoot, {
      level: "error",
      event: "comic.project.create.failure",
      source: "comic.project.create",
      operationId,
      comicId: comicId ?? null,
      durationMs: Date.now() - startedAt,
      details: {
        requestedTitle: buildTextPreview(request.title ?? "", 80) || null,
        ...summarizeComicPageRequestForLog(request, 1)
      },
      error
    });
    throw error;
  }
}

export async function appendPersistedComicPage(
  comicRoot: string,
  comicId: string,
  request: AppendPersistedComicPageRequest
) {
  const operationId = buildComicPipelineOperationId("comic_append");
  const startedAt = Date.now();

  await logComicPipelineEvent(comicRoot, {
    event: "comic.project.append.start",
    source: "comic.project.append",
    operationId,
    comicId,
    details: {
      requestedStoryMemorySummaryLength: compactWhitespace(request.storyMemorySummary ?? "").length,
      requestReferenceImageCount: request.referenceImages?.length ?? 0,
      allowFallback: request.allowFallback !== false,
      storyPromptDigest: buildShortDigest(request.storyPrompt),
      storyPromptPreview: buildTextPreview(request.storyPrompt)
    }
  });

  try {
    const project = await loadComicProjectFromDisk(comicRoot, comicId);
    const now = new Date().toISOString();
    const requestReferenceImages =
      (request.referenceImages?.length ?? 0) > 0
        ? request.referenceImages!
        : await buildPersistedReferenceInputs(project);
    const previousPages = await buildPersistedPreviousPages(project);

    const generatedPage = await generateComicPage({
      storyPrompt: request.storyPrompt,
      styleId: project.style.id,
      pageNumber: project.pageCount + 1,
      storyMemorySummary: request.storyMemorySummary,
      previousPages,
      referenceImages: requestReferenceImages,
      negativePrompt: request.negativePrompt,
      allowFallback: request.allowFallback,
      imageProfileId: request.imageProfileId,
      runtimeImageModelConfig: request.runtimeImageModelConfig,
      __logContext: {
        comicRoot,
        source: "comic.project.append.generate",
        operationId,
        comicId,
        pageNumber: project.pageCount + 1,
        pageIndex: project.pageCount
      }
    });

    const nextReferences = [...project.references];
    const newReferenceIds: string[] = [];

    if ((request.referenceImages?.length ?? 0) > 0) {
      for (const [index, reference] of request.referenceImages!
        .filter((item) => (item.role ?? "character") === "character")
        .slice(0, 2)
        .entries()) {
        const image = await saveComicAssetToDisk({
          comicRoot,
          comicId,
          folderName: "references",
          fileNameStem: `ref-${project.references.length + index + 1}-${reference.name || "character"}`,
          sourceUrl: reference.imageUrl
        });

        const referenceId = `ref_${randomUUID().slice(0, 8)}`;
        nextReferences.push({
          referenceId,
          role: "character",
          name: compactWhitespace(reference.name ?? "") || null,
          appearance: compactWhitespace(reference.appearance ?? "") || null,
          sourceUrl: reference.imageUrl.startsWith("data:") ? null : reference.imageUrl,
          createdAt: now,
          image
        });
        newReferenceIds.push(referenceId);
      }
    }

    if (newReferenceIds.length > 0) {
      await logComicPipelineEvent(comicRoot, {
        event: "comic.project.append.references_saved",
        source: "comic.project.append",
        operationId,
        comicId,
        details: {
          count: newReferenceIds.length,
          newReferenceIds
        }
      });
    }

    const carriedReferenceIds =
      newReferenceIds.length > 0
        ? newReferenceIds
        : project.references
            .filter((item) => item.role === "character")
            .slice(0, 2)
            .map((item) => item.referenceId);

    const pageId = `page_${randomUUID().slice(0, 8)}`;
    const persistedImage = await saveComicAssetToDisk({
      comicRoot,
      comicId,
      folderName: "pages",
      fileNameStem: `page-${String(generatedPage.pageNumber).padStart(3, "0")}-${pageId}`,
      sourceUrl: generatedPage.imageUrl
    });

    await logComicPipelineEvent(comicRoot, {
      event: "comic.project.append.page_asset_saved",
      source: "comic.project.append",
      operationId,
      comicId,
      pageNumber: generatedPage.pageNumber,
      pageIndex: generatedPage.pageNumber - 1,
      details: {
        provider: generatedPage.provider,
        persistedImage: summarizePersistedComicAsset(persistedImage)
      }
    });

    const nextProject = await writeComicProjectToDisk(comicRoot, {
      ...project,
      updatedAt: now,
      pageCount: project.pageCount + 1,
      references: nextReferences,
      pages: [
        ...project.pages,
        {
          pageId,
          pageNumber: generatedPage.pageNumber,
          storyPrompt: request.storyPrompt.trim(),
          revisedPrompt: generatedPage.revisedPrompt,
          continuationContext: generatedPage.continuationContext,
          negativePrompt: compactWhitespace(request.negativePrompt ?? "") || null,
          provider: generatedPage.provider,
          createdAt: now,
          style: generatedPage.style,
          image: persistedImage,
          characterReferenceIds: carriedReferenceIds,
          previousPageNumber: project.pages.at(-1)?.pageNumber ?? null
        }
      ]
    });

    await logComicPipelineEvent(comicRoot, {
      event: "comic.project.append.success",
      source: "comic.project.append",
      operationId,
      comicId,
      pageNumber: generatedPage.pageNumber,
      pageIndex: generatedPage.pageNumber - 1,
      durationMs: Date.now() - startedAt,
      details: {
        appendedPageNumber: generatedPage.pageNumber,
        project: summarizePersistedComicProject(nextProject)
      }
    });

    return {
      project: nextProject,
      page: nextProject.pages.at(-1)!
    };
  } catch (error) {
    await logComicPipelineEvent(comicRoot, {
      level: "error",
      event: "comic.project.append.failure",
      source: "comic.project.append",
      operationId,
      comicId,
      durationMs: Date.now() - startedAt,
      details: {
        requestedStoryMemorySummaryLength: compactWhitespace(request.storyMemorySummary ?? "").length,
        requestReferenceImageCount: request.referenceImages?.length ?? 0,
        storyPromptDigest: buildShortDigest(request.storyPrompt),
        storyPromptPreview: buildTextPreview(request.storyPrompt)
      },
      error
    });
    throw error;
  }
}

export async function loadWorldlineComicProject(
  comicRoot: string,
  worldlineId: string
) {
  const operationId = buildComicPipelineOperationId("worldline_load");
  const startedAt = Date.now();
  const normalizedWorldlineId = compactWhitespace(worldlineId);

  await logComicPipelineEvent(comicRoot, {
    event: "worldline.load.start",
    source: "worldline.load",
    operationId,
    worldlineId: normalizedWorldlineId || null,
    details: {
      requestedWorldlineId: worldlineId,
      normalizedWorldlineId
    }
  });

  try {
    let recoveredFromLocalPages = false;
    let project = await loadComicProjectFromDisk(comicRoot, normalizedWorldlineId).catch(
      async (error) => {
        recoveredFromLocalPages = true;
        await logComicPipelineEvent(comicRoot, {
          level: "warn",
          event: "worldline.load.recover_from_local_pages",
          source: "worldline.load",
          operationId,
          worldlineId: normalizedWorldlineId || null,
          error
        });
        return recoverCopiedWorldlineComicProject(comicRoot, normalizedWorldlineId);
      }
    );

    if (project.comicId !== normalizedWorldlineId) {
      await logComicPipelineEvent(comicRoot, {
        event: "worldline.load.normalize_project_id",
        source: "worldline.load",
        operationId,
        worldlineId: normalizedWorldlineId,
        comicId: project.comicId,
        details: {
          fromComicId: project.comicId,
          toComicId: normalizedWorldlineId
        }
      });
      project = await writeComicProjectToDisk(comicRoot, {
        ...project,
        comicId: normalizedWorldlineId,
        storageRoot: ""
      });
    }

    const beforeSyncSummary = summarizePersistedComicProject(project);
    const syncedProject = await syncWorldlineComicProjectWithLocalPages(
      comicRoot,
      normalizedWorldlineId,
      project
    );
    const afterSyncSummary = summarizePersistedComicProject(syncedProject);

    if (JSON.stringify(beforeSyncSummary) !== JSON.stringify(afterSyncSummary)) {
      await logComicPipelineEvent(comicRoot, {
        event: "worldline.load.synced_local_pages",
        source: "worldline.load",
        operationId,
        worldlineId: normalizedWorldlineId,
        comicId: syncedProject.comicId,
        details: {
          before: beforeSyncSummary,
          after: afterSyncSummary
        }
      });
    }

    await logComicPipelineEvent(comicRoot, {
      event: "worldline.load.success",
      source: "worldline.load",
      operationId,
      worldlineId: normalizedWorldlineId,
      comicId: syncedProject.comicId,
      durationMs: Date.now() - startedAt,
      details: {
        recoveredFromLocalPages,
        project: afterSyncSummary
      }
    });

    return syncedProject;
  } catch (error) {
    await logComicPipelineEvent(comicRoot, {
      level: "error",
      event: "worldline.load.failure",
      source: "worldline.load",
      operationId,
      worldlineId: normalizedWorldlineId || null,
      durationMs: Date.now() - startedAt,
      error
    });
    throw error;
  }
}

export async function upsertWorldlineComicPage(
  comicRoot: string,
  worldlineId: string,
  request: UpsertWorldlineComicPageRequest
): Promise<UpsertWorldlineComicPageResponse> {
  const operationId = buildComicPipelineOperationId("worldline_upsert");
  const startedAt = Date.now();
  const normalizedWorldlineId = compactWhitespace(worldlineId);
  const storyPrompt = request.storyPrompt.trim();
  const pageIndex = Math.max(0, Math.floor(request.pageIndex));
  const pageNumber = pageIndex + 1;

  await logComicPipelineEvent(comicRoot, {
    event: "worldline.upsert.start",
    source: "worldline.upsert",
    operationId,
    worldlineId: normalizedWorldlineId || null,
    pageNumber,
    pageIndex,
    details: {
      storyTitle: buildTextPreview(request.storyTitle, 80),
      ruleTitle: buildTextPreview(request.ruleTitle, 80),
      storyMemorySummaryLength: compactWhitespace(request.storyMemorySummary ?? "").length,
      ...summarizeComicPageRequestForLog(
        {
          ...request,
          storyPrompt
        },
        pageNumber
      )
    }
  });

  if (!normalizedWorldlineId) {
    await logComicPipelineEvent(comicRoot, {
      level: "error",
      event: "worldline.upsert.failure",
      source: "worldline.upsert",
      operationId,
      pageNumber,
      pageIndex,
      durationMs: Date.now() - startedAt,
      error: new Error("Worldline comic id is required.")
    });
    throw new Error("Worldline comic id is required.");
  }

  if (!storyPrompt) {
    await logComicPipelineEvent(comicRoot, {
      level: "error",
      event: "worldline.upsert.failure",
      source: "worldline.upsert",
      operationId,
      worldlineId: normalizedWorldlineId,
      pageNumber,
      pageIndex,
      durationMs: Date.now() - startedAt,
      error: new Error("Worldline comic story prompt is required.")
    });
    throw new Error("Worldline comic story prompt is required.");
  }
  const requestKey = buildWorldlineComicRequestKey(normalizedWorldlineId, pageNumber);
  const existingTask = WORLDLINE_COMIC_IN_FLIGHT_REQUESTS.get(requestKey);
  if (existingTask) {
    await logComicPipelineEvent(comicRoot, {
      event: "worldline.upsert.join_inflight",
      source: "worldline.upsert",
      operationId,
      worldlineId: normalizedWorldlineId,
      pageNumber,
      pageIndex
    });
    return existingTask;
  }

  const generationTask = (async (): Promise<UpsertWorldlineComicPageResponse> => {
    try {
      const now = new Date().toISOString();
      const existingProject = await loadWorldlineComicProject(
        comicRoot,
        normalizedWorldlineId
      ).catch(() => null);

      if (existingProject) {
        const existingPage = existingProject.pages.find((page) => page.pageNumber === pageNumber);
        if (existingPage) {
          const response = {
            project: existingProject,
            page: existingPage,
            created: false
          };
          await logComicPipelineEvent(comicRoot, {
            event: "worldline.upsert.page_already_exists",
            source: "worldline.upsert",
            operationId,
            worldlineId: normalizedWorldlineId,
            pageNumber,
            pageIndex,
            durationMs: Date.now() - startedAt,
            details: {
              page: {
                pageNumber: existingPage.pageNumber,
                provider: existingPage.provider,
                image: summarizePersistedComicAsset(existingPage.image)
              },
              project: summarizePersistedComicProject(existingProject)
            }
          });
          return response;
        }
      }

      const generatedPage = await generateComicPage({
        storyPrompt,
        styleId: existingProject?.style.id ?? request.styleId,
        pageNumber,
        storyMemorySummary: compactWhitespace(request.storyMemorySummary ?? "") || undefined,
        previousPages: existingProject
          ? await buildPersistedPreviousPages(existingProject)
          : undefined,
        characterReferences: collectCharacterReferences(request),
        allowFallback: false,
        imageProfileId: request.imageProfileId,
        runtimeImageModelConfig: request.runtimeImageModelConfig,
        __logContext: {
          comicRoot,
          source: "worldline.upsert.generate",
          operationId,
          worldlineId: normalizedWorldlineId,
          pageNumber,
          pageIndex
        }
      });

      if (isSvgComicImageResult(generatedPage) || isFallbackOrMockComicProvider(generatedPage.provider)) {
        await logComicPipelineEvent(comicRoot, {
          level: "warn",
          event: "worldline.upsert.suspicious_generated_page",
          source: "worldline.upsert",
          operationId,
          worldlineId: normalizedWorldlineId,
          pageNumber,
          pageIndex,
          details: summarizeComicPageResultForLog(generatedPage)
        });
      }

      const latestProject = await loadWorldlineComicProject(
        comicRoot,
        normalizedWorldlineId
      ).catch(() => existingProject);
      const latestExistingPage = latestProject?.pages.find((page) => page.pageNumber === pageNumber);
      if (latestExistingPage && latestProject) {
        const response = {
          project: latestProject,
          page: latestExistingPage,
          created: false
        };
        await logComicPipelineEvent(comicRoot, {
          event: "worldline.upsert.page_won_by_other_request",
          source: "worldline.upsert",
          operationId,
          worldlineId: normalizedWorldlineId,
          pageNumber,
          pageIndex,
          durationMs: Date.now() - startedAt,
          details: {
            page: {
              pageNumber: latestExistingPage.pageNumber,
              provider: latestExistingPage.provider,
              image: summarizePersistedComicAsset(latestExistingPage.image)
            }
          }
        });
        return response;
      }

      const pageId = `page_${randomUUID().slice(0, 8)}`;
      const persistedImage = await saveComicAssetToDisk({
        comicRoot,
        comicId: normalizedWorldlineId,
        folderName: "pages",
        fileNameStem: String(pageIndex),
        sourceUrl: generatedPage.imageUrl
      });

      await logComicPipelineEvent(comicRoot, {
        event: "worldline.upsert.page_asset_saved",
        source: "worldline.upsert",
        operationId,
        worldlineId: normalizedWorldlineId,
        comicId: normalizedWorldlineId,
        pageNumber,
        pageIndex,
        details: {
          provider: generatedPage.provider,
          persistedImage: summarizePersistedComicAsset(persistedImage)
        }
      });

      if (!latestProject) {
        const createdProject = await writeComicProjectToDisk(comicRoot, {
          comicId: normalizedWorldlineId,
          createdAt: now,
          updatedAt: now,
          title: buildWorldlineComicTitle(request.storyTitle),
          description: buildWorldlineComicDescription(request.ruleTitle, request.storyTitle),
          storyPrompt,
          style: generatedPage.style,
          pageCount: 1,
          storageRoot: "",
          coverImage: persistedImage,
          references: [],
          pages: [
            {
              pageId,
              pageNumber,
              storyPrompt,
              revisedPrompt: generatedPage.revisedPrompt,
              continuationContext: generatedPage.continuationContext,
              negativePrompt: null,
              provider: generatedPage.provider,
              createdAt: now,
              style: generatedPage.style,
              image: persistedImage,
              characterReferenceIds: [],
              previousPageNumber: null
            }
          ]
        });

        const response = {
          project: createdProject,
          page: createdProject.pages[0],
          created: true
        };
        await logComicPipelineEvent(comicRoot, {
          event: "worldline.upsert.success",
          source: "worldline.upsert",
          operationId,
          worldlineId: normalizedWorldlineId,
          comicId: createdProject.comicId,
          pageNumber,
          pageIndex,
          durationMs: Date.now() - startedAt,
          details: {
            created: true,
            project: summarizePersistedComicProject(createdProject)
          }
        });
        return response;
      }

      const nextProject = await writeComicProjectToDisk(comicRoot, {
        ...latestProject,
        updatedAt: now,
        pageCount: latestProject.pageCount + 1,
        pages: [
          ...latestProject.pages,
          {
            pageId,
            pageNumber,
            storyPrompt,
            revisedPrompt: generatedPage.revisedPrompt,
            continuationContext: generatedPage.continuationContext,
            negativePrompt: null,
            provider: generatedPage.provider,
            createdAt: now,
            style: generatedPage.style,
            image: persistedImage,
            characterReferenceIds: [],
            previousPageNumber: latestProject.pages.at(-1)?.pageNumber ?? null
          }
        ]
      });

      const response = {
        project: nextProject,
        page: nextProject.pages.at(-1)!,
        created: true
      };
      await logComicPipelineEvent(comicRoot, {
        event: "worldline.upsert.success",
        source: "worldline.upsert",
        operationId,
        worldlineId: normalizedWorldlineId,
        comicId: nextProject.comicId,
        pageNumber,
        pageIndex,
        durationMs: Date.now() - startedAt,
        details: {
          created: true,
          project: summarizePersistedComicProject(nextProject)
        }
      });
      return response;
    } catch (error) {
      await logComicPipelineEvent(comicRoot, {
        level: "error",
        event: "worldline.upsert.failure",
        source: "worldline.upsert",
        operationId,
        worldlineId: normalizedWorldlineId,
        comicId: normalizedWorldlineId,
        pageNumber,
        pageIndex,
        durationMs: Date.now() - startedAt,
        details: {
          storyTitle: buildTextPreview(request.storyTitle, 80),
          ruleTitle: buildTextPreview(request.ruleTitle, 80),
          storyPromptDigest: buildShortDigest(storyPrompt),
          storyPromptPreview: buildTextPreview(storyPrompt)
        },
        error
      });
      throw error;
    }
  })();

  WORLDLINE_COMIC_IN_FLIGHT_REQUESTS.set(requestKey, generationTask);

  try {
    return await generationTask;
  } finally {
    if (WORLDLINE_COMIC_IN_FLIGHT_REQUESTS.get(requestKey) === generationTask) {
      WORLDLINE_COMIC_IN_FLIGHT_REQUESTS.delete(requestKey);
    }
  }
}
