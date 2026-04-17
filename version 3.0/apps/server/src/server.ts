import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { access, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  listEnabledLanguages,
  PHASE1_DEFAULTS,
  PHASE1_MODEL_ACCESS_MODE_OPTIONS,
  toLanguageOptionPayload
} from "../../../packages/shared-config/src/index.ts";
import type {
  AppendPersistedComicPageRequest,
  BootstrapResponse,
  CharacterConceptAssistRequest,
  CommitRoundRequest,
  CreateSaveRequest,
  ComicMetadataGenerationRequest,
  ComicPageGenerationRequest,
  CreatePersistedComicRequest,
  CreateSessionRequest,
  GenerateOpeningPreviewRequest,
  GenerateOpeningPreviewResponse,
  ImageGenerationRequest,
  LoadSaveRequest,
  PrepareNpcPortraitsRequest,
  PickLocalSaveDirectoryRequest,
  RegenerateNpcPortraitRequest,
  UpdateLocalSaveSettingsRequest,
  PrepareRoundRequest,
  SessionContextPackDebugResponse,
  SendPrivateChatRequest,
  SessionCreateStreamEvent,
  SessionMemoryDebugResponse,
  SessionMemoryRebuildResponse,
  SelectNpcPortraitRequest,
  SubmitManualNarrationRequest,
  SubmitTurnRequest,
  TurnResolutionStreamEvent,
  UpsertWorldlineComicPageRequest,
  UpdateStoryControlModeRequest
} from "../../../packages/shared-types/src/index.ts";
import {
  loadContentCatalog,
  loadPlayableContentBundle
} from "./content/index.ts";
import { loadAiAppearanceTags, loadAiPersonalityTags } from "./ai_players/index.ts";
import {
  listImageProfileSummaries
} from "./image_generation/config.ts";
import {
  generateImage,
  loadImagePromptTemplateConfig
} from "./image_generation/service.ts";
import {
  appendPersistedComicPage,
  createPersistedComicProject,
  deletePersistedComicProject,
  generateComicMetadata,
  generateComicPage,
  listPersistedComicProjects,
  loadWorldlineComicProject,
  loadPersistedComicProject,
  listComicPromptPresets,
  upsertWorldlineComicPage
} from "./comic_generation/index.ts";
import { resolveComicAssetAbsolutePath } from "./comic_generation/storage.ts";
import {
  loadNpcRosterWithPortraits,
  prepareNpcPortraits,
  regenerateNpcPortrait,
  resolveNpcPortraitAssetAbsolutePath,
  selectNpcPortrait
} from "./npc_portraits/index.ts";
import {
  buildDefaultCreateSessionRequest,
  commitPreparedRound,
  createSaveBundleForSession,
  createSessionSnapshot,
  createSessionSnapshotWithProgress,
  getSessionContextPackState,
  getSessionMemoryState,
  dismissEndingState,
  loadSessionFromSaveBundle,
  prepareRound,
  rebuildSessionMemoryForSession,
  sendPrivateChat,
  submitManualNarration,
  submitTurn,
  updateStoryControlMode
} from "./session/index.ts";
import { InMemorySessionStore } from "./session/store.ts";
import {
  getServerProxyStatus,
  listModelProfileSummaries
} from "./model_gateway/config.ts";
import {
  getLocalSaveSettings,
  pickLocalDirectoryWithNativeDialog,
  updateLocalSaveSettings
} from "./local_settings.ts";
import { resolveStoryOpening } from "./opening/service.ts";
import {
  clearSavedGamesFromDisk,
  deleteSavedGameFromDisk,
  listSavedGamesFromDisk,
  loadSaveBundleFromDisk,
  saveBundleToDisk
} from "./save_repository.ts";
import { generateCharacterConcept } from "./text_completion/service.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../..");
const contentRoot = join(projectRoot, "content");
const webDistRoot = join(projectRoot, "apps", "web", "dist");
const defaultLocalSaveRoot = join(projectRoot, "local_data", "saves");
const defaultComicRoot = join(projectRoot, "local_data", "comics");
const defaultNpcPortraitRoot = join(projectRoot, "local_data", "npc_portraits");
const localSettingsPath = join(projectRoot, "local_data", "settings.json");
const store = new InMemorySessionStore();
const port = Number(process.env.PORT ?? 4316);

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

type OpeningPreviewStreamEvent =
  | {
      type: "delta";
      delta: string;
    }
  | {
      type: "done";
      result: GenerateOpeningPreviewResponse;
    }
  | {
      type: "error";
      message: string;
    };

type SessionCreateNdjsonEvent = SessionCreateStreamEvent;
type TurnResolutionNdjsonEvent = TurnResolutionStreamEvent;

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body) as T;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response: ServerResponse, statusCode: number, content: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(content);
}

function sendNdjsonEvent(
  response: ServerResponse,
  event: OpeningPreviewStreamEvent
): void {
  response.write(`${JSON.stringify(event)}\n`);
}

function sendSessionCreateEvent(
  response: ServerResponse,
  event: SessionCreateNdjsonEvent
): void {
  response.write(`${JSON.stringify(event)}\n`);
}

function sendTurnResolutionEvent(
  response: ServerResponse,
  event: TurnResolutionNdjsonEvent
): void {
  response.write(`${JSON.stringify(event)}\n`);
}

async function serveAbsoluteFile(
  response: ServerResponse,
  absolutePath: string,
  rootDir: string
): Promise<void> {
  if (!absolutePath.startsWith(rootDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  let fileContent: Buffer;
  try {
    fileContent = await readFile(absolutePath);
  } catch {
    sendText(response, 404, "Not Found");
    return;
  }

  const mimeType = mimeTypes[extname(absolutePath)] ?? "application/octet-stream";

  response.writeHead(200, {
    "Content-Type": mimeType
  });
  response.end(fileContent);
}

async function serveStaticFile(response: ServerResponse, relativePath: string): Promise<void> {
  const normalizedPath = relativePath === "/" ? "/index.html" : relativePath;
  const absolutePath = resolve(webDistRoot, `.${normalizedPath}`);
  await serveAbsoluteFile(response, absolutePath, webDistRoot);
}

async function serveApiOnlyHint(response: ServerResponse): Promise<void> {
  sendText(
    response,
    200,
    [
      "AI TRPG 3.0 API server is running.",
      "For the React front end, start Vite with `npm.cmd run dev:web` in `version 3.0`.",
      "The default Vite URL is http://127.0.0.1:4317/."
    ].join("\n")
  );
}

async function buildBootstrapResponse(
  catalog: BootstrapResponse["catalog"]
): Promise<BootstrapResponse> {
  const serverProxyStatus = getServerProxyStatus();
  const imagePromptTemplateConfig = await loadImagePromptTemplateConfig();
  const [personalityTags, appearanceTags] = await Promise.all([
    loadAiPersonalityTags(),
    loadAiAppearanceTags()
  ]);

  return {
    defaults: {
      locale: PHASE1_DEFAULTS.locale,
      playMode: PHASE1_DEFAULTS.playMode,
      difficulty: PHASE1_DEFAULTS.difficulty,
      gmArchitecture: PHASE1_DEFAULTS.gmArchitecture,
      backgroundCompressionEnabled: PHASE1_DEFAULTS.backgroundCompressionEnabled,
      modelAccessMode: PHASE1_DEFAULTS.modelAccessMode,
      modelProfileId: PHASE1_DEFAULTS.modelProfileId,
      imageProfileId: PHASE1_DEFAULTS.imageProfileId,
      logViewMode: PHASE1_DEFAULTS.logViewMode
    },
    personalityTags,
    appearanceTags,
    languages: listEnabledLanguages().map((item) => toLanguageOptionPayload(item.code)),
    modelAccessModes: PHASE1_MODEL_ACCESS_MODE_OPTIONS.map((item) => ({
      code: item.code,
      label: item.label,
      description: item.description,
      available: true,
      configured: item.code === "server_proxy" ? serverProxyStatus.configured : true,
      message:
        item.code === "server_proxy"
          ? serverProxyStatus.message
          : "mock 模式始终可用。"
    })),
    modelProfiles: listModelProfileSummaries(),
    serverProxyStatus,
    imageProfiles: listImageProfileSummaries(),
    imagePromptTemplateConfig,
    catalog
  };
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  if (!request.url) {
    return false;
  }

  const url = new URL(request.url, `http://127.0.0.1:${port}`);

  if (url.pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      now: new Date().toISOString()
    });
    return true;
  }

  if (url.pathname === "/api/bootstrap" && request.method === "GET") {
    const catalog = await loadContentCatalog(contentRoot);
    sendJson(response, 200, await buildBootstrapResponse(catalog));
    return true;
  }

  if (url.pathname.startsWith("/api/content-assets/") && request.method === "GET") {
    const relativeSegments = url.pathname
      .replace("/api/content-assets/", "")
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    const absolutePath = resolve(contentRoot, ...relativeSegments);
    await serveAbsoluteFile(response, absolutePath, contentRoot);
    return true;
  }

  if (url.pathname.startsWith("/api/npc-portrait-assets/") && request.method === "GET") {
    const relativeSegments = url.pathname
      .replace("/api/npc-portrait-assets/", "")
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));

    if (relativeSegments.length < 2) {
      sendJson(response, 400, {
        error: "INVALID_NPC_PORTRAIT_ASSET_REQUEST",
        message: "collectionId and asset path are required."
      });
      return true;
    }

    const [collectionId, ...assetSegments] = relativeSegments;
    const absolutePath = resolveNpcPortraitAssetAbsolutePath({
      portraitRoot: defaultNpcPortraitRoot,
      collectionId,
      relativePath: assetSegments.join("/")
    });
    await serveAbsoluteFile(response, absolutePath, join(defaultNpcPortraitRoot, collectionId));
    return true;
  }

  if (url.pathname === "/api/default-session-request" && request.method === "GET") {
    sendJson(response, 200, buildDefaultCreateSessionRequest());
    return true;
  }

  if (url.pathname === "/api/sessions" && request.method === "POST") {
    const payload = await readJsonBody<CreateSessionRequest>(request);
    const snapshot = await createSessionSnapshot(contentRoot, payload, store);
    sendJson(response, 201, snapshot);
    return true;
  }

  if (url.pathname === "/api/sessions/stream" && request.method === "POST") {
    const payload = await readJsonBody<CreateSessionRequest>(request);

    response.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.flushHeaders?.();

    try {
      const snapshot = await createSessionSnapshotWithProgress(contentRoot, payload, store, {
        onStage: async (event) => {
          if (response.writableEnded || response.destroyed) {
            return;
          }

          sendSessionCreateEvent(response, {
            type: "stage",
            ...event
          });
        }
      });

      if (!response.writableEnded && !response.destroyed) {
        sendSessionCreateEvent(response, {
          type: "done",
          snapshot
        });
        response.end();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!response.writableEnded && !response.destroyed) {
        sendSessionCreateEvent(response, {
          type: "error",
          message
        });
        response.end();
      }
    }

    return true;
  }

  if (url.pathname === "/api/previews/opening" && request.method === "POST") {
    const payload = await readJsonBody<GenerateOpeningPreviewRequest>(request);
    const bundle = await loadPlayableContentBundle(
      contentRoot,
      payload.ruleDirectoryName,
      payload.storyDirectoryName,
      payload.locale
    );
    const openingPreview = await resolveStoryOpening(bundle, {
      modelAccessMode: payload.modelAccessMode,
      modelProfileId: payload.modelProfileId,
      runtimeModelConfig: payload.runtimeModelConfig,
      difficulty: payload.difficulty,
      gmArchitecture: payload.gmArchitecture,
      forceRegenerateOpening: payload.forceRegenerateOpening
    });
    sendJson(response, 200, openingPreview);
    return true;
  }

  if (url.pathname === "/api/previews/opening/stream" && request.method === "POST") {
    const payload = await readJsonBody<GenerateOpeningPreviewRequest>(request);
    const bundle = await loadPlayableContentBundle(
      contentRoot,
      payload.ruleDirectoryName,
      payload.storyDirectoryName,
      payload.locale
    );

    response.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.flushHeaders?.();

    const abortController = new AbortController();
    request.on("close", () => abortController.abort());

    try {
      const openingPreview = await resolveStoryOpening(
        bundle,
        {
          modelAccessMode: payload.modelAccessMode,
          modelProfileId: payload.modelProfileId,
          runtimeModelConfig: payload.runtimeModelConfig,
          difficulty: payload.difficulty,
          gmArchitecture: payload.gmArchitecture,
          forceRegenerateOpening: payload.forceRegenerateOpening
        },
        {
          signal: abortController.signal,
          onTextDelta: async (delta) => {
            if (
              abortController.signal.aborted ||
              response.writableEnded ||
              response.destroyed
            ) {
              return;
            }

            sendNdjsonEvent(response, {
              type: "delta",
              delta
            });
          }
        }
      );

      if (!abortController.signal.aborted && !response.writableEnded && !response.destroyed) {
        sendNdjsonEvent(response, {
          type: "done",
          result: openingPreview
        });
        response.end();
      }
    } catch (error: unknown) {
      if (abortController.signal.aborted) {
        response.end();
        return true;
      }

      const message = error instanceof Error ? error.message : String(error);
      sendNdjsonEvent(response, {
        type: "error",
        message
      });
      response.end();
    }

    return true;
  }

  if (url.pathname === "/api/character-concept/assist" && request.method === "POST") {
    const payload = await readJsonBody<CharacterConceptAssistRequest>(request);
    const result = await generateCharacterConcept({
      mode: payload.mode,
      locale: payload.locale,
      modelAccessMode: payload.modelAccessMode,
      modelProfileId: payload.modelProfileId,
      runtimeModelConfig: payload.runtimeModelConfig,
      openingText: payload.openingText,
      currentText: payload.currentText,
      primaryPlayerDisplayName: payload.primaryPlayerDisplayName,
      primaryPlayerPersonalityTagIds: payload.primaryPlayerPersonalityTagIds
    });
    sendJson(response, 200, result);
    return true;
  }

  if (url.pathname === "/api/npcs" && request.method === "GET") {
    const ruleDirectoryName = url.searchParams.get("ruleDirectoryName")?.trim() ?? "";
    const storyDirectoryName = url.searchParams.get("storyDirectoryName")?.trim() ?? "";
    const styleId = url.searchParams.get("styleId")?.trim() ?? undefined;

    if (!ruleDirectoryName || !storyDirectoryName) {
      sendJson(response, 400, {
        error: "INVALID_NPC_REQUEST",
        message: "ruleDirectoryName and storyDirectoryName are required."
      });
      return true;
    }

    const roster = await loadNpcRosterWithPortraits({
      contentRoot,
      portraitRoot: defaultNpcPortraitRoot,
      ruleDirectoryName,
      storyDirectoryName,
      styleId
    });
    sendJson(response, 200, roster);
    return true;
  }

  if (url.pathname === "/api/npcs/portraits/prepare" && request.method === "POST") {
    const payload = await readJsonBody<PrepareNpcPortraitsRequest>(request);
    const result = await prepareNpcPortraits({
      contentRoot,
      portraitRoot: defaultNpcPortraitRoot,
      request: payload
    });
    sendJson(response, 200, result);
    return true;
  }

  if (url.pathname === "/api/npcs/portraits/regenerate" && request.method === "POST") {
    const payload = await readJsonBody<RegenerateNpcPortraitRequest>(request);
    const result = await regenerateNpcPortrait({
      contentRoot,
      portraitRoot: defaultNpcPortraitRoot,
      request: payload
    });
    sendJson(response, 200, result);
    return true;
  }

  if (url.pathname === "/api/npcs/portraits/select" && request.method === "POST") {
    const payload = await readJsonBody<SelectNpcPortraitRequest>(request);
    const result = await selectNpcPortrait({
      contentRoot,
      portraitRoot: defaultNpcPortraitRoot,
      request: payload
    });
    sendJson(response, 200, result);
    return true;
  }

  if (url.pathname === "/api/images/generate" && request.method === "POST") {
    const payload = await readJsonBody<ImageGenerationRequest>(request);
    const result = await generateImage(payload);
    sendJson(response, 200, result);
    return true;
  }

  if (url.pathname.startsWith("/api/comic-assets/") && request.method === "GET") {
    const relativeSegments = url.pathname
      .replace("/api/comic-assets/", "")
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));

    if (relativeSegments.length < 2) {
      sendJson(response, 400, {
        error: "INVALID_COMIC_ASSET_REQUEST",
        message: "comicId and asset path are required."
      });
      return true;
    }

    const [comicId, ...assetSegments] = relativeSegments;
    const absolutePath = resolveComicAssetAbsolutePath({
      comicRoot: defaultComicRoot,
      comicId,
      relativePath: assetSegments.join("/")
    });
    await serveAbsoluteFile(response, absolutePath, join(defaultComicRoot, comicId));
    return true;
  }

  if (url.pathname === "/api/comics/presets" && request.method === "GET") {
    sendJson(response, 200, await listComicPromptPresets());
    return true;
  }

  if (url.pathname === "/api/comics/projects" && request.method === "GET") {
    sendJson(response, 200, await listPersistedComicProjects(defaultComicRoot));
    return true;
  }

  if (url.pathname === "/api/comics/projects" && request.method === "POST") {
    const payload = await readJsonBody<CreatePersistedComicRequest>(request);
    const result = await createPersistedComicProject(defaultComicRoot, payload);
    sendJson(response, 201, result);
    return true;
  }

  const worldlineComicPagesMatch = url.pathname.match(/^\/api\/worldline-comics\/([^/]+)\/pages$/u);
  if (worldlineComicPagesMatch && request.method === "POST") {
    const worldlineId = decodeURIComponent(worldlineComicPagesMatch[1]);
    const payload = await readJsonBody<UpsertWorldlineComicPageRequest>(request);
    const result = await upsertWorldlineComicPage(defaultComicRoot, worldlineId, payload);
    sendJson(response, 200, result);
    return true;
  }

  const worldlineComicMatch = url.pathname.match(/^\/api\/worldline-comics\/([^/]+)$/u);
  if (worldlineComicMatch && request.method === "GET") {
    const worldlineId = decodeURIComponent(worldlineComicMatch[1]);

    try {
      const result = await loadWorldlineComicProject(defaultComicRoot, worldlineId);
      sendJson(response, 200, result);
    } catch {
      sendJson(response, 404, {
        error: "WORLDLINE_COMIC_NOT_FOUND",
        message: `Worldline comic not found: ${worldlineId}`
      });
    }

    return true;
  }

  const comicProjectPagesMatch = url.pathname.match(/^\/api\/comics\/projects\/([^/]+)\/pages$/u);
  if (comicProjectPagesMatch && request.method === "POST") {
    const comicId = decodeURIComponent(comicProjectPagesMatch[1]);
    const payload = await readJsonBody<AppendPersistedComicPageRequest>(request);
    const result = await appendPersistedComicPage(defaultComicRoot, comicId, payload);
    sendJson(response, 200, result);
    return true;
  }

  const comicProjectMatch = url.pathname.match(/^\/api\/comics\/projects\/([^/]+)$/u);
  if (comicProjectMatch && request.method === "GET") {
    const comicId = decodeURIComponent(comicProjectMatch[1]);
    const result = await loadPersistedComicProject(defaultComicRoot, comicId);
    sendJson(response, 200, result);
    return true;
  }

  if (comicProjectMatch && request.method === "DELETE") {
    const comicId = decodeURIComponent(comicProjectMatch[1]);
    const deleted = await deletePersistedComicProject(defaultComicRoot, comicId);
    sendJson(
      response,
      deleted ? 200 : 404,
      deleted
        ? { ok: true }
        : {
            error: "COMIC_NOT_FOUND",
            message: `Local comic not found: ${comicId}`
          }
    );
    return true;
  }

  if (url.pathname === "/api/comics/generate-page" && request.method === "POST") {
    const payload = await readJsonBody<ComicPageGenerationRequest>(request);
    const pageNumber =
      typeof payload.pageNumber === "number" && Number.isFinite(payload.pageNumber)
        ? Math.max(1, Math.floor(payload.pageNumber))
        : 1;
    const result = await generateComicPage({
      ...payload,
      __logContext: {
        comicRoot: defaultComicRoot,
        source: "api.comics.generate_page",
        operationId: `api_generate_page_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        pageNumber,
        pageIndex: pageNumber - 1
      }
    });
    sendJson(response, 200, result);
    return true;
  }

  if (url.pathname === "/api/comics/generate-metadata" && request.method === "POST") {
    const payload = await readJsonBody<ComicMetadataGenerationRequest>(request);
    const result = await generateComicMetadata(payload);
    sendJson(response, 200, result);
    return true;
  }

  if (url.pathname === "/api/saves/load" && request.method === "POST") {
    const payload = await readJsonBody<LoadSaveRequest>(request);
    const snapshot = loadSessionFromSaveBundle(payload.saveBundle, store);
    sendJson(response, 200, snapshot);
    return true;
  }

  if (url.pathname === "/api/local-settings" && request.method === "GET") {
    const localSettings = await getLocalSaveSettings(localSettingsPath, defaultLocalSaveRoot);
    sendJson(response, 200, localSettings);
    return true;
  }

  if (url.pathname === "/api/local-settings" && request.method === "POST") {
    const payload = await readJsonBody<UpdateLocalSaveSettingsRequest>(request);
    const localSettings = await updateLocalSaveSettings(
      localSettingsPath,
      defaultLocalSaveRoot,
      payload
    );
    sendJson(response, 200, localSettings);
    return true;
  }

  if (url.pathname === "/api/local-settings/pick-directory" && request.method === "POST") {
    const payload = await readJsonBody<PickLocalSaveDirectoryRequest>(request);
    const localSettings = await getLocalSaveSettings(localSettingsPath, defaultLocalSaveRoot);
    const selectedPath = await pickLocalDirectoryWithNativeDialog({
      initialDirectory: payload.initialDirectory ?? localSettings.effectiveSaveDirectory,
      title: payload.title
    });
    sendJson(response, 200, {
      selectedPath
    });
    return true;
  }

  if (url.pathname === "/api/saves" && request.method === "GET") {
    const localSettings = await getLocalSaveSettings(localSettingsPath, defaultLocalSaveRoot);
    const saves = await listSavedGamesFromDisk(localSettings.effectiveSaveDirectory);
    sendJson(response, 200, saves);
    return true;
  }

  if (url.pathname === "/api/saves" && request.method === "DELETE") {
    const localSettings = await getLocalSaveSettings(localSettingsPath, defaultLocalSaveRoot);
    await clearSavedGamesFromDisk(localSettings.effectiveSaveDirectory);
    sendJson(response, 200, {
      ok: true
    });
    return true;
  }

  if (
    url.pathname.startsWith("/api/saves/") &&
    url.pathname.endsWith("/bundle") &&
    request.method === "GET"
  ) {
    const saveId = decodeURIComponent(url.pathname.replace("/api/saves/", "").replace("/bundle", ""));
    const localSettings = await getLocalSaveSettings(localSettingsPath, defaultLocalSaveRoot);
    const saveBundle = await loadSaveBundleFromDisk(localSettings.effectiveSaveDirectory, saveId);
    sendJson(response, 200, saveBundle);
    return true;
  }

  if (
    url.pathname.startsWith("/api/saves/") &&
    url.pathname.endsWith("/load") &&
    request.method === "POST"
  ) {
    const saveId = decodeURIComponent(url.pathname.replace("/api/saves/", "").replace("/load", ""));
    const localSettings = await getLocalSaveSettings(localSettingsPath, defaultLocalSaveRoot);
    const saveBundle = await loadSaveBundleFromDisk(localSettings.effectiveSaveDirectory, saveId);
    const snapshot = loadSessionFromSaveBundle(saveBundle, store);
    sendJson(response, 200, snapshot);
    return true;
  }

  if (url.pathname.startsWith("/api/saves/") && request.method === "DELETE") {
    const saveId = decodeURIComponent(url.pathname.replace("/api/saves/", ""));
    const localSettings = await getLocalSaveSettings(localSettingsPath, defaultLocalSaveRoot);
    const deleted = await deleteSavedGameFromDisk(localSettings.effectiveSaveDirectory, saveId);
    sendJson(response, deleted ? 200 : 404, deleted ? { ok: true } : {
      error: "SAVE_NOT_FOUND",
      message: `Local save not found: ${saveId}`
    });
    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/rounds/prepare") &&
    request.method === "POST"
  ) {
    const sessionId = url.pathname.replace("/api/sessions/", "").replace("/rounds/prepare", "");
    const payload = await readJsonBody<PrepareRoundRequest>(request);
    const snapshot = await prepareRound(sessionId, payload, store);

    if (!snapshot) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `鏈壘鍒?session: ${sessionId}`
      });
      return true;
    }

    sendJson(response, 200, snapshot);
    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/rounds/commit/stream") &&
    request.method === "POST"
  ) {
    const sessionId = url.pathname
      .replace("/api/sessions/", "")
      .replace("/rounds/commit/stream", "");
    const payload = await readJsonBody<CommitRoundRequest>(request);

    response.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.flushHeaders?.();

    try {
      const snapshot = await commitPreparedRound(sessionId, payload, store, contentRoot, {
        onStage: async (event) => {
          if (response.writableEnded || response.destroyed) {
            return;
          }

          sendTurnResolutionEvent(response, {
            type: "stage",
            ...event
          });
        }
      });

      if (!snapshot) {
        if (!response.writableEnded && !response.destroyed) {
          sendTurnResolutionEvent(response, {
            type: "error",
            message: `session not found: ${sessionId}`
          });
          response.end();
        }
        return true;
      }

      if (!response.writableEnded && !response.destroyed) {
        sendTurnResolutionEvent(response, {
          type: "done",
          snapshot
        });
        response.end();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!response.writableEnded && !response.destroyed) {
        sendTurnResolutionEvent(response, {
          type: "error",
          message
        });
        response.end();
      }
    }

    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/rounds/commit") &&
    request.method === "POST"
  ) {
    const sessionId = url.pathname.replace("/api/sessions/", "").replace("/rounds/commit", "");
    const payload = await readJsonBody<CommitRoundRequest>(request);
    const snapshot = await commitPreparedRound(sessionId, payload, store, contentRoot);

    if (!snapshot) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `鏈壘鍒?session: ${sessionId}`
      });
      return true;
    }

    sendJson(response, 200, snapshot);
    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/manual-narration") &&
    request.method === "POST"
  ) {
    const sessionId = url.pathname.replace("/api/sessions/", "").replace("/manual-narration", "");
    const payload = await readJsonBody<SubmitManualNarrationRequest>(request);
    const snapshot = await submitManualNarration(sessionId, payload, store);

    if (!snapshot) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `session not found: ${sessionId}`
      });
      return true;
    }

    sendJson(response, 200, snapshot);
    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/private-chat") &&
    request.method === "POST"
  ) {
    const sessionId = url.pathname.replace("/api/sessions/", "").replace("/private-chat", "");
    const payload = await readJsonBody<SendPrivateChatRequest>(request);
    const snapshot = await sendPrivateChat(sessionId, payload, store);

    if (!snapshot) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `鏈壘鍒?session: ${sessionId}`
      });
      return true;
    }

    sendJson(response, 200, snapshot);
    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/story-control") &&
    request.method === "POST"
  ) {
    const sessionId = url.pathname.replace("/api/sessions/", "").replace("/story-control", "");
    const payload = await readJsonBody<UpdateStoryControlModeRequest>(request);
    const snapshot = await updateStoryControlMode(sessionId, payload, store);

    if (!snapshot) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `鏈壘鍒?session: ${sessionId}`
      });
      return true;
    }

    sendJson(response, 200, snapshot);
    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/ending/dismiss") &&
    request.method === "POST"
  ) {
    const sessionId = url.pathname.replace("/api/sessions/", "").replace("/ending/dismiss", "");
    const snapshot = await dismissEndingState(sessionId, store);

    if (!snapshot) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `session not found: ${sessionId}`
      });
      return true;
    }

    sendJson(response, 200, snapshot);
    return true;
  }

  if (url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/turns") && request.method === "POST") {
    const sessionId = url.pathname.replace("/api/sessions/", "").replace("/turns", "");
    const payload = await readJsonBody<SubmitTurnRequest>(request);
    const snapshot = await submitTurn(sessionId, payload, store, contentRoot);

    if (!snapshot) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `未找到 session: ${sessionId}`
      });
      return true;
    }

    sendJson(response, 200, snapshot);
    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/turns/stream") &&
    request.method === "POST"
  ) {
    const sessionId = url.pathname.replace("/api/sessions/", "").replace("/turns/stream", "");
    const payload = await readJsonBody<SubmitTurnRequest>(request);

    response.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.flushHeaders?.();

    try {
      const snapshot = await submitTurn(sessionId, payload, store, contentRoot, {
        onStage: async (event) => {
          if (response.writableEnded || response.destroyed) {
            return;
          }

          sendTurnResolutionEvent(response, {
            type: "stage",
            ...event
          });
        }
      });

      if (!snapshot) {
        if (!response.writableEnded && !response.destroyed) {
          sendTurnResolutionEvent(response, {
            type: "error",
            message: `session not found: ${sessionId}`
          });
          response.end();
        }
        return true;
      }

      if (!response.writableEnded && !response.destroyed) {
        sendTurnResolutionEvent(response, {
          type: "done",
          snapshot
        });
        response.end();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!response.writableEnded && !response.destroyed) {
        sendTurnResolutionEvent(response, {
          type: "error",
          message
        });
        response.end();
      }
    }

    return true;
  }

  if (url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/save") && request.method === "POST") {
    const sessionId = url.pathname.replace("/api/sessions/", "").replace("/save", "");
    const payload = await readJsonBody<CreateSaveRequest>(request).catch(() => ({
      worldlineId: null
    }));
    const result = createSaveBundleForSession(sessionId, store, {
      worldlineId: payload.worldlineId ?? null
    });

    if (!result) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `未找到 session: ${sessionId}`
      });
      return true;
    }

    const localSettings = await getLocalSaveSettings(localSettingsPath, defaultLocalSaveRoot);
    const saveRecord = await saveBundleToDisk(localSettings.effectiveSaveDirectory, result.saveBundle);
    sendJson(response, 200, {
      ...result,
      saveRecord
    });
    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/memory") &&
    request.method === "GET"
  ) {
    const sessionId = url.pathname.replace("/api/sessions/", "").replace("/memory", "");
    const memory = getSessionMemoryState(sessionId, store);

    if (!memory) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `session not found: ${sessionId}`
      });
      return true;
    }

    const payload: SessionMemoryDebugResponse = {
      sessionId,
      memory
    };
    sendJson(response, 200, payload);
    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/memory/rebuild") &&
    request.method === "POST"
  ) {
    const sessionId = url.pathname
      .replace("/api/sessions/", "")
      .replace("/memory/rebuild", "");
    const snapshot = await rebuildSessionMemoryForSession(sessionId, store);

    if (!snapshot || !snapshot.memory) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `session not found: ${sessionId}`
      });
      return true;
    }

    const payload: SessionMemoryRebuildResponse = {
      snapshot,
      memory: snapshot.memory
    };
    sendJson(response, 200, payload);
    return true;
  }

  if (
    url.pathname.startsWith("/api/sessions/") &&
    url.pathname.endsWith("/context-pack") &&
    request.method === "GET"
  ) {
    const sessionId = url.pathname
      .replace("/api/sessions/", "")
      .replace("/context-pack", "");
    const targetParam = url.searchParams.get("target")?.trim() ?? "narrator";
    const target =
      targetParam === "companion" || targetParam === "private_chat"
        ? targetParam
        : "narrator";
    const participantId = url.searchParams.get("participantId")?.trim() ?? null;
    if (target !== "narrator" && !participantId) {
      sendJson(response, 400, {
        error: "INVALID_CONTEXT_PACK_REQUEST",
        message: "participantId is required for companion and private_chat context packs."
      });
      return true;
    }
    const contextPack = getSessionContextPackState(
      sessionId,
      target,
      store,
      participantId
    );

    if (!contextPack) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `session not found: ${sessionId}`
      });
      return true;
    }

    const payload: SessionContextPackDebugResponse = {
      sessionId,
      contextPack
    };
    sendJson(response, 200, payload);
    return true;
  }

  if (url.pathname.startsWith("/api/sessions/") && request.method === "GET") {
    const sessionId = url.pathname.replace("/api/sessions/", "");
    const snapshot = store.get(sessionId);

    if (!snapshot) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `未找到 session: ${sessionId}`
      });
      return true;
    }

    sendJson(response, 200, snapshot);
    return true;
  }

  return false;
}

const server = createServer(async (request, response) => {
  try {
    const handledByApi = await handleApiRequest(request, response);
    if (handledByApi) {
      return;
    }

    if (!request.url) {
      sendText(response, 400, "Bad Request");
      return;
    }

    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (request.method === "GET") {
      if (await pathExists(webDistRoot)) {
        await serveStaticFile(response, url.pathname);
      } else {
        await serveApiOnlyHint(response);
      }
      return;
    }

    sendText(response, 404, "Not Found");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 500, {
      error: "INTERNAL_SERVER_ERROR",
      message
    });
  }
});

server.listen(port, () => {
  console.log(`Phase 2 transition server is running at http://127.0.0.1:${port}`);
});
