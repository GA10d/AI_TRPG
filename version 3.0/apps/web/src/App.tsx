import { useEffect, useRef, useState, type CSSProperties } from "react";

import type {
  AiGenerationMetadata,
  CharacterConceptAssistMode,
  CreateSessionRequest,
  GenerateOpeningPreviewRequest,
  Message,
  ReplayEvent,
  SaveBundle,
  SaveRuntimeConfig,
  SessionSnapshot
} from "../../../packages/shared-types/src/index.ts";
import {
  assistCharacterConcept,
  createSave,
  createSession,
  fetchSession,
  generateOpeningPreview,
  loadSaveBundle,
  streamOpeningPreview,
  submitTurn
} from "./lib/trpgApiClient.ts";
import { useBootstrapState } from "./hooks/useBootstrapState.ts";
import { usePlaythroughGraph } from "./hooks/usePlaythroughGraph.ts";
import { useStoredProgress } from "./hooks/useStoredProgress.ts";
import { ContinuePage } from "./pages/ContinuePage.tsx";
import { ExitPage } from "./pages/ExitPage.tsx";
import { GamePage } from "./pages/GamePage.tsx";
import { GameSetupPage } from "./pages/GameSetupPage.tsx";
import { MenuPage } from "./pages/MenuPage.tsx";
import { RecordsPage } from "./pages/RecordsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { StorySelectPage } from "./pages/StorySelectPage.tsx";
import { storeWebDefaults, type SavedGameRecord } from "./storage.ts";
import { getMenuFontScale, type AppView, type StatusState } from "./ui.ts";

const initialStatus: StatusState = {
  message: "",
  tone: "neutral"
};

function createTemporaryId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function splitTextIntoRevealChunks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const paragraphChunks = normalized
    .split("\n")
    .flatMap((paragraph) => {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) {
        return ["\n"];
      }

      return trimmedParagraph.match(/.{1,18}(?:[锛屻€傦紒锛燂紱锛?.!?;:]|$)/gu) ?? [trimmedParagraph];
    });

  return paragraphChunks.filter(Boolean);
}

function normalizeRuntimeConfig(
  input: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  } | undefined
): SaveRuntimeConfig["runtimeModelConfig"] | undefined {
  if (!input) {
    return undefined;
  }

  const apiKey = input.apiKey?.trim() ?? "";
  const baseUrl = input.baseUrl?.trim() ?? "";
  const model = input.model?.trim() ?? "";

  if (!apiKey && !baseUrl && !model) {
    return undefined;
  }

  return {
    apiKey,
    baseUrl,
    model
  };
}

function hasPreviewModelConfig(
  accessMode: CreateSessionRequest["modelAccessMode"],
  bootstrap: ReturnType<typeof useBootstrapState>["bootstrap"],
  modelProfileId: string,
  runtimeModelConfig: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }
): boolean {
  if (accessMode === "mock") {
    return true;
  }

  if (accessMode !== "server_proxy") {
    return false;
  }

  const selectedProfile =
    bootstrap?.modelProfiles.find((profile) => profile.id === modelProfileId) ?? null;

  if (!selectedProfile) {
    return false;
  }

  if (selectedProfile.configured) {
    return true;
  }

  const hasApiKey = (runtimeModelConfig.apiKey?.trim() ?? "").length > 0;
  const hasBaseUrl = (runtimeModelConfig.baseUrl?.trim() ?? "").length > 0;
  const hasModel = (runtimeModelConfig.model?.trim() ?? "").length > 0;
  const baseUrlReady =
    !selectedProfile.urlRequirements || hasBaseUrl || Boolean(selectedProfile.baseUrl);
  const modelReady = hasModel || Boolean(selectedProfile.baseModel);

  return hasApiKey && baseUrlReady && modelReady;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function App() {
  const [view, setView] = useState<AppView>("menu");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [status, setStatus] = useState<StatusState>(initialStatus);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isResumingBranch, setIsResumingBranch] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [turnInput, setTurnInput] = useState("");
  const [characterConcept, setCharacterConcept] = useState("");
  const [characterConceptAssistLoading, setCharacterConceptAssistLoading] = useState(false);
  const [characterConceptAssistMode, setCharacterConceptAssistMode] =
    useState<CharacterConceptAssistMode>("generate");
  const [openingPreviewText, setOpeningPreviewText] = useState("");
  const [openingPreviewProvider, setOpeningPreviewProvider] = useState<string | null>(null);
  const [openingPreviewMeta, setOpeningPreviewMeta] = useState<AiGenerationMetadata | null>(null);
  const [openingPreviewLoading, setOpeningPreviewLoading] = useState(false);
  const [openingPreviewError, setOpeningPreviewError] = useState<string | null>(null);
  const [openingPreviewRegenerateNonce, setOpeningPreviewRegenerateNonce] = useState(0);
  const [isBootstrappingSession, setIsBootstrappingSession] = useState(false);
  const lastHandledOpeningPreviewRegenerateNonceRef = useRef(0);
  const stagedOpeningRevealTimerRef = useRef<number | null>(null);
  const stagedSessionBootTokenRef = useRef(0);

  const {
    bootstrap,
    ruleDirectoryName,
    storyDirectoryName,
    locale,
    playMode,
    gmArchitecture,
    modelAccessMode,
    modelProfileId,
    runtimeModelConfig,
    profileRuntimeConfigs,
    imageProfileId,
    runtimeImageModelConfig,
    imageProfileRuntimeConfigs,
    imagePromptTemplateConfig,
    debugEnabled,
    logViewMode,
    openingPreviewDeliveryMode,
    showAiMetadata,
    markdownFontSize,
    menuFontSize,
    setRuleDirectoryName,
    setStoryDirectoryName,
    setLocale,
    setPlayMode,
    setGmArchitecture,
    setModelAccessMode,
    setModelProfileId,
    setProfileRuntimeConfig,
    clearProfileRuntimeConfigs,
    setImageProfileId,
    setImageProfileRuntimeConfig,
    clearImageProfileRuntimeConfigs,
    setImagePromptTemplateConfig,
    setDebugEnabled,
    setLogViewMode,
    setOpeningPreviewDeliveryMode,
    setShowAiMetadata,
    setMarkdownFontSize,
    setMenuFontSize
  } = useBootstrapState({
    onStatusChange: setStatus
  });

  const {
    recentSnapshot,
    savedGames,
    commitSnapshot: persistStoredSnapshot,
    commitSaveBundle,
    clearRecent,
    clearSavedGamesList,
    removeSavedGameById
  } = useStoredProgress();

  const {
    activeGraphBundle,
    beginFromSnapshot,
    captureTurn,
    syncSavedBundle,
    relinkSnapshot,
    relinkSaveBundle,
    prepareResume
  } = usePlaythroughGraph();

  const recentSave = savedGames[0] ?? null;
  const previewModelReady = hasPreviewModelConfig(
    modelAccessMode,
    bootstrap,
    modelProfileId,
    runtimeModelConfig
  );

  useEffect(() => {
    if (view !== "game_setup") {
      setOpeningPreviewMeta(null);
      setOpeningPreviewLoading(false);
      setOpeningPreviewError(null);
      return;
    }

    const selectedRule =
      bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ?? null;
    const selectedStory =
      selectedRule?.stories.find((item) => item.directoryName === storyDirectoryName) ?? null;

    if (!bootstrap || !selectedRule || !selectedStory) {
      setOpeningPreviewText("");
      setOpeningPreviewProvider(null);
      setOpeningPreviewMeta(null);
      setOpeningPreviewLoading(false);
      setOpeningPreviewError(null);
      return;
    }

    if (!previewModelReady) {
      setOpeningPreviewText("");
      setOpeningPreviewProvider(null);
      setOpeningPreviewMeta(null);
      setOpeningPreviewLoading(false);
      setOpeningPreviewError(
        modelAccessMode === "browser_direct"
          ? "当前模型模式暂不支持 AI 开场预览，请切换到 Mock 或 Server Proxy。"
          : "当前模型档案尚未配置完整，暂时只能显示静态预览文案。"
      );
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    const forceRegenerateOpening =
      openingPreviewRegenerateNonce > lastHandledOpeningPreviewRegenerateNonceRef.current;

    if (forceRegenerateOpening) {
      lastHandledOpeningPreviewRegenerateNonceRef.current = openingPreviewRegenerateNonce;
    }

    setOpeningPreviewText("");
    setOpeningPreviewProvider(null);
    setOpeningPreviewMeta(null);
    setOpeningPreviewLoading(true);
    setOpeningPreviewError(null);

    const timeoutHandle = window.setTimeout(async () => {
      try {
        const requestPayload: GenerateOpeningPreviewRequest = {
          ruleDirectoryName,
          storyDirectoryName,
          locale,
          playMode,
          gmArchitecture,
          modelAccessMode,
          modelProfileId,
          runtimeModelConfig,
          debugEnabled,
          promptDebugEnabled: false,
          logViewMode,
          forceRegenerateOpening
        };
        const result =
          openingPreviewDeliveryMode === "stream"
            ? await streamOpeningPreview(requestPayload, {
                signal: abortController.signal,
                onTextDelta: (delta) => {
                  if (cancelled) {
                    return;
                  }

                  setOpeningPreviewText((current) => current + delta);
                }
              })
            : await generateOpeningPreview(requestPayload, {
                signal: abortController.signal
              });

        if (cancelled) {
          return;
        }

        setOpeningPreviewText(result.text);
        setOpeningPreviewProvider(result.provider);
        setOpeningPreviewMeta(result.meta ?? null);
      } catch (error) {
        if (cancelled || isAbortError(error)) {
          return;
        }

        setOpeningPreviewText("");
        setOpeningPreviewProvider(null);
        setOpeningPreviewMeta(null);
        setOpeningPreviewError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setOpeningPreviewLoading(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      abortController.abort();
      window.clearTimeout(timeoutHandle);
    };
  }, [
    bootstrap,
    debugEnabled,
    gmArchitecture,
    locale,
    logViewMode,
    openingPreviewDeliveryMode,
    openingPreviewRegenerateNonce,
    modelAccessMode,
    modelProfileId,
    playMode,
    previewModelReady,
    ruleDirectoryName,
    runtimeModelConfig,
    storyDirectoryName,
    view
  ]);

  useEffect(
    () => () => {
      clearStagedOpeningReveal();
    },
    []
  );

  function buildSaveRuntimeConfig(
    profileIdOverride?: string
  ): SaveRuntimeConfig {
    return {
      modelProfileId: profileIdOverride ?? modelProfileId,
      runtimeModelConfig: normalizeRuntimeConfig(runtimeModelConfig)
    };
  }

  function saveDefaults(): void {
    storeWebDefaults({
      locale,
      playMode,
      gmArchitecture,
      modelAccessMode,
      modelProfileId,
      runtimeModelConfig,
      profileRuntimeConfigs,
      imageProfileId,
      runtimeImageModelConfig,
      imageProfileRuntimeConfigs,
      imagePromptTemplateConfig:
        imagePromptTemplateConfig ?? bootstrap?.imagePromptTemplateConfig,
      debugEnabled,
      logViewMode,
      openingPreviewDeliveryMode,
      showAiMetadata,
      markdownFontSize,
      menuFontSize
    });
  }

  function commitSnapshot(nextSnapshot: SessionSnapshot): void {
    setSnapshot(nextSnapshot);
    persistStoredSnapshot(nextSnapshot);
  }

  function clearStagedOpeningReveal(): void {
    if (stagedOpeningRevealTimerRef.current !== null) {
      window.clearInterval(stagedOpeningRevealTimerRef.current);
      stagedOpeningRevealTimerRef.current = null;
    }
  }

  function buildPendingSessionSnapshot(args: {
    ruleTitle: string;
    storyTitle: string;
    revealText: string;
  }): SessionSnapshot {
    const timestamp = new Date().toISOString();
    const sessionId = createTemporaryId("pending_session");
    const playerParticipantId = createTemporaryId("pending_player");
    const gmParticipantId = createTemporaryId("pending_gm");

    const messages: Message[] = [
      {
        id: createTemporaryId("msg"),
        round: 0,
        createdAt: timestamp,
        senderId: "system",
        recipientIds: [playerParticipantId],
        visibility: "system",
        kind: "system",
        content: `Session is being created for ${args.storyTitle} (${locale}).`,
        tags: ["session_booting"]
      },
      {
        id: createTemporaryId("msg"),
        round: 0,
        createdAt: timestamp,
        senderId: gmParticipantId,
        recipientIds: [playerParticipantId],
        visibility: "public",
        kind: "gm_narration",
        content: "",
        tags: ["opening", "pending_bootstrap"]
      }
    ];

    const replay: ReplayEvent[] = [
      {
        id: createTemporaryId("evt"),
        round: 0,
        createdAt: timestamp,
        actorId: "system",
        type: "session_created",
        displayLevel: "core",
        summary: "Session bootstrap started",
        payload: {
          revealPreviewLength: args.revealText.length
        }
      }
    ];

    if (characterConcept.trim().length > 0) {
      messages.splice(1, 0, {
        id: createTemporaryId("msg"),
        round: 0,
        createdAt: timestamp,
        senderId: playerParticipantId,
        recipientIds: [gmParticipantId],
        visibility: "public",
        kind: "player_input",
        content: characterConcept.trim(),
        tags: ["player_info", "character_concept", "pending_bootstrap"]
      });
    }

    return {
      session: {
        id: sessionId,
        schemaVersion: "0.2.0",
        status: "active",
        playMode,
        gmArchitecture,
        modelAccessMode,
        locale,
        ruleId: ruleDirectoryName,
        storyId: storyDirectoryName,
        currentRound: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        participants: [
          {
            id: playerParticipantId,
            role: "human_player",
            displayName: "鐜╁",
            isAiControlled: false,
            isLocalUser: true,
            locale
          },
          {
            id: gmParticipantId,
            role: "gm",
            displayName: "主持人",
            isAiControlled: true,
            isLocalUser: false,
            locale
          }
        ],
        playerParticipantId,
        settings: {
          logViewMode,
          debugEnabled,
          promptDebugEnabled: false,
          modelProfileId
        },
        gameState: {
          phase: "playing",
          endingState: null,
          lastEndingJudgeResult: null
        }
      },
      messages,
      replay,
      contentSummary: {
        ruleTitle: args.ruleTitle,
        storyTitle: args.storyTitle,
        requestedLocale: locale,
        resolvedLocale: locale,
        ruleDirectoryName,
        storyDirectoryName
      }
    };
  }

  function startStagedOpeningReveal(
    pendingSnapshot: SessionSnapshot,
    revealText: string
  ): void {
    clearStagedOpeningReveal();

    const revealChunks = splitTextIntoRevealChunks(revealText);
    if (!revealChunks.length) {
      setSnapshot(pendingSnapshot);
      return;
    }

    const bootToken = stagedSessionBootTokenRef.current;
    let chunkIndex = 0;

    setSnapshot(pendingSnapshot);

    stagedOpeningRevealTimerRef.current = window.setInterval(() => {
      if (stagedSessionBootTokenRef.current !== bootToken) {
        clearStagedOpeningReveal();
        return;
      }

      chunkIndex += 1;
      const nextContent = revealChunks.slice(0, chunkIndex).join("");

      setSnapshot((current) => {
        if (!current || current.session.id !== pendingSnapshot.session.id) {
          return current;
        }

        const nextMessages = current.messages.map((message, index, collection) =>
          index === collection.length - 1
            ? {
                ...message,
                content: nextContent
              }
            : message
        );

        return {
          ...current,
          session: {
            ...current.session,
            updatedAt: new Date().toISOString()
          },
          messages: nextMessages
        };
      });

      if (chunkIndex >= revealChunks.length) {
        clearStagedOpeningReveal();
      }
    }, 70);
  }

  async function submitPlayerTurn(
    currentSnapshot: SessionSnapshot,
    playerInput: string,
    options?: {
      pendingMessage?: string;
      successMessage?: string;
      endingSuccessMessage?: string;
    }
  ): Promise<void> {
    setIsSubmittingTurn(true);
    setStatus({
      message: options?.pendingMessage ?? "姝ｅ湪鎻愪氦鏈疆琛屽姩...",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await submitTurn(currentSnapshot.session.id, {
        playerInput
      });
      commitSnapshot(nextSnapshot);
      captureTurn(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId),
        playerInput
      );
      setTurnInput("");
      setStatus({
        message:
          nextSnapshot.session.status === "ended"
            ? options?.endingSuccessMessage ?? "本轮处理完成，并已进入结局。"
            : options?.successMessage ?? "本轮处理完成。",
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsSubmittingTurn(false);
    }
  }

  async function handleCreateSession(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    const selectedRule =
      bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ?? null;
    const selectedStory =
      selectedRule?.stories.find((item) => item.directoryName === storyDirectoryName) ?? null;

    if (!bootstrap || !selectedRule || !selectedStory) {
      setStatus({
        message: "当前没有可用的规则或剧本。",
        tone: "error"
      });
      return;
    }

    setIsCreating(true);
    setIsBootstrappingSession(true);
    setStatus({
      message: "正在进入游戏并创建正式会话...",
      tone: "neutral"
    });

    try {
      saveDefaults();

      const bootToken = stagedSessionBootTokenRef.current + 1;
      stagedSessionBootTokenRef.current = bootToken;

      const stagedRevealText =
        openingPreviewText.trim() ||
        selectedStory.intro?.trim() ||
        selectedStory.coverQuote?.trim() ||
        `${selectedStory.title} 的开场正在生成中……`;
      const pendingSnapshot = buildPendingSessionSnapshot({
        ruleTitle: selectedRule.ruleTitle,
        storyTitle: selectedStory.title,
        revealText: stagedRevealText
      });

      setTurnInput("");
      setView("game");
      startStagedOpeningReveal(pendingSnapshot, stagedRevealText);

      const nextSnapshot = await createSession({
        ruleDirectoryName,
        storyDirectoryName,
        locale,
        playMode,
        gmArchitecture,
        modelAccessMode,
        characterConcept,
        modelProfileId,
        runtimeModelConfig,
        debugEnabled,
        promptDebugEnabled: false,
        logViewMode
      });

      if (stagedSessionBootTokenRef.current !== bootToken) {
        return;
      }

      clearStagedOpeningReveal();
      commitSnapshot(nextSnapshot);
      beginFromSnapshot(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId)
      );
      setStatus({
        message:
          characterConcept.trim().length > 0
            ? "会话创建成功，你的角色设定已带入正式开场。"
            : "会话创建成功。",
        tone: "neutral"
      });
    } catch (error) {
      clearStagedOpeningReveal();
      setSnapshot(null);
      setView("game_setup");
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsCreating(false);
      setIsBootstrappingSession(false);
    }
  }

  async function handleSubmitTurn(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    if (!snapshot) {
      setStatus({
        message: "请先开始游戏。",
        tone: "error"
      });
      return;
    }

    const trimmedInput = turnInput.trim();
    if (!trimmedInput) {
      setStatus({
        message: "请输入本轮行动。",
        tone: "error"
      });
      return;
    }

    await submitPlayerTurn(snapshot, trimmedInput);
  }

  async function handleQuickEndingTest(): Promise<void> {
    if (!snapshot) {
      setStatus({
        message: "请先开始游戏。",
        tone: "error"
      });
      return;
    }

    if (snapshot.session.modelAccessMode !== "mock") {
      setStatus({
        message: "快速结局测试按钮只在 mock 模式下可用。",
        tone: "error"
      });
      return;
    }

    await submitPlayerTurn(snapshot, "鎴戞帍鍑烘墜鏋嚜鏉€", {
      pendingMessage: "姝ｅ湪瑙﹀彂 mock 缁撳眬娴嬭瘯...",
      successMessage: "mock 结局测试已提交。",
      endingSuccessMessage: "mock 结局测试成功，当前会话已进入结局。"
    });
  }

  async function handleSaveGame(): Promise<void> {
    if (!snapshot) {
      setStatus({
        message: "当前没有可保存的会话。",
        tone: "error"
      });
      return;
    }

    setIsSaving(true);
    setStatus({
      message: "姝ｅ湪鍒涘缓鏈湴瀛樻。...",
      tone: "neutral"
    });

    try {
      const result = await createSave(snapshot.session.id);
      commitSnapshot(result.snapshot);
      commitSaveBundle(result.saveBundle);
      syncSavedBundle(result.saveBundle);
      setStatus({
        message: "手动存档已保存到本地。",
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function restoreFromSaveBundle(
    saveBundle: SaveBundle,
    successMessage: string
  ): Promise<void> {
    setIsRestoring(true);
    setStatus({
      message: "姝ｅ湪鎭㈠瀛樻。...",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await loadSaveBundle(saveBundle);
      commitSnapshot(nextSnapshot);
      relinkSaveBundle(
        saveBundle,
        nextSnapshot,
        saveBundle.runtimeConfig ?? buildSaveRuntimeConfig(saveBundle.session.settings.modelProfileId)
      );
      setView("game");
      setStatus({
        message: successMessage,
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleContinueRecentSave(): Promise<void> {
    if (!recentSave) {
      setStatus({
        message: "当前没有最近存档。",
        tone: "error"
      });
      return;
    }

    return restoreFromSaveBundle(recentSave.bundle, "已从最近存档恢复会话。");
  }

  async function handleContinueRecentSnapshot(): Promise<void> {
    if (!recentSnapshot) {
      setStatus({
        message: "本地还没有最近进度。",
        tone: "error"
      });
      return;
    }

    setIsRestoring(true);
    setStatus({
      message: "姝ｅ湪鎭㈠鏈€杩戝揩鐓?..",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await fetchSession(recentSnapshot.session.id);
      commitSnapshot(nextSnapshot);
      relinkSnapshot(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId)
      );
      setView("game");
      setStatus({
        message: "已从服务端同步最近会话。",
        tone: "neutral"
      });
    } catch {
      commitSnapshot(recentSnapshot);
      relinkSnapshot(
        recentSnapshot,
        buildSaveRuntimeConfig(recentSnapshot.session.settings.modelProfileId)
      );
      setView("game");
      setStatus({
        message: "服务端未找到该会话，已改用本地快照打开。",
        tone: "neutral"
      });
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleLoadSavedGame(record: SavedGameRecord): Promise<void> {
    return restoreFromSaveBundle(record.bundle, `宸茶浇鍏ュ瓨妗ｏ細${record.storyTitle}`);
  }

  async function handleContinueFromNode(nodeId: string): Promise<void> {
    const prepared = prepareResume(nodeId);
    if (!prepared) {
      setStatus({
        message: "当前节点不可继续，或本地缺少对应快照。",
        tone: "error"
      });
      return;
    }

    setIsResumingBranch(true);
    setStatus({
      message: "姝ｅ湪浠庡巻鍙茶妭鐐规仮澶嶏紝骞跺噯澶囩敓鎴愭柊鐨勫垎鏀?..",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await loadSaveBundle(prepared.saveBundle);
      commitSnapshot(nextSnapshot);
      setTurnInput("");
      setView("game");
      setStatus({
        message: "已切换到所选节点。下一轮行动将从这里长出新的分支。",
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsResumingBranch(false);
    }
  }

  function handleSaveSettings(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    saveDefaults();
    setView("menu");
    setStatus({
      message: "默认设置已保存。",
      tone: "neutral"
    });
  }

  function handleResetSettings(): void {
    if (!bootstrap) {
      return;
    }

    setLocale(bootstrap.defaults.locale);
    setPlayMode(bootstrap.defaults.playMode);
    setGmArchitecture(bootstrap.defaults.gmArchitecture);
    setModelAccessMode(bootstrap.defaults.modelAccessMode);
    setModelProfileId(bootstrap.defaults.modelProfileId);
    clearProfileRuntimeConfigs();
    setImageProfileId(bootstrap.defaults.imageProfileId);
    clearImageProfileRuntimeConfigs();
    setImagePromptTemplateConfig(bootstrap.imagePromptTemplateConfig);
    setLogViewMode(bootstrap.defaults.logViewMode);
    setOpeningPreviewDeliveryMode("stream");
    setDebugEnabled(true);
    setShowAiMetadata(true);
    setMarkdownFontSize("large");
    setMenuFontSize("standard");
    setStatus({
      message: "已恢复默认设置。",
      tone: "neutral"
    });
  }

  function handleClearRecent(): void {
    clearRecent();
    setStatus({
      message: "最近快照已清除。",
      tone: "neutral"
    });
  }

  function handleClearSavedGames(): void {
    clearSavedGamesList();
    setStatus({
      message: "本地存档已清空。",
      tone: "neutral"
    });
  }

  function handleRemoveRecentSave(): void {
    if (!recentSave) {
      return;
    }

    removeSavedGameById(recentSave.saveId);
    setStatus({
      message: "最近存档已删除。",
      tone: "neutral"
    });
  }

  function handleDeleteSavedGame(saveId: string): void {
    removeSavedGameById(saveId);
    setStatus({
      message: "该存档已删除。",
      tone: "neutral"
    });
  }

  function handleExit(): void {
    window.close();
    setStatus({
      message: "如果页面没有关闭，请直接关闭浏览器标签页。",
      tone: "neutral"
    });
  }

  function handleOpenStorySelect(): void {
    setCharacterConcept("");
    setView("story_select");
  }

  function handleRegenerateOpeningPreview(): void {
    setOpeningPreviewRegenerateNonce((current) => current + 1);
  }

  async function handleAssistCharacterConcept(): Promise<void> {
    const openingText = openingPreviewText.trim();
    const trimmedCharacterConcept = characterConcept.trim();
    const nextMode: CharacterConceptAssistMode =
      trimmedCharacterConcept.length > 0 ? "complete" : "generate";

    if (!openingText) {
      setStatus({
        message: "请先等开场预览生成完成，再使用 AI 生成或补全角色概念。",
        tone: "error"
      });
      return;
    }

    setCharacterConceptAssistLoading(true);
    setCharacterConceptAssistMode(nextMode);
    setStatus({
      message:
        nextMode === "generate"
          ? "AI 姝ｅ湪鏍规嵁寮€鍦虹櫧鐢熸垚瑙掕壊姒傚康..."
          : "AI 姝ｅ湪鏍规嵁寮€鍦虹櫧琛ュ叏瑙掕壊姒傚康...",
      tone: "neutral"
    });

    try {
      const result = await assistCharacterConcept({
        ruleDirectoryName,
        storyDirectoryName,
        locale,
        playMode,
        gmArchitecture,
        modelAccessMode,
        modelProfileId,
        runtimeModelConfig,
        debugEnabled,
        promptDebugEnabled: false,
        logViewMode,
        mode: nextMode,
        openingText,
        currentText: trimmedCharacterConcept
      });

      setCharacterConcept(result.text);
      setStatus({
        message:
          nextMode === "generate"
            ? "AI 已生成角色概念，你可以继续手动修改。"
            : "AI 已补全角色概念，你可以继续手动修改。",
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setCharacterConceptAssistLoading(false);
    }
  }

  function handleEnterGameSetup(): void {
    const selectedRule =
      bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ?? null;
    const selectedStory =
      selectedRule?.stories.find((item) => item.directoryName === storyDirectoryName) ?? null;

    if (!selectedRule || !selectedStory) {
      setStatus({
        message: "请先选择一个可用剧本。",
        tone: "error"
      });
      return;
    }

    setView("game_setup");
  }

  let content: React.ReactNode;

  switch (view) {
    case "story_select":
      content = (
        <StorySelectPage
          bootstrap={bootstrap}
          ruleDirectoryName={ruleDirectoryName}
          storyDirectoryName={storyDirectoryName}
          onBack={() => setView("menu")}
          onClose={() => setView("menu")}
          onRuleChange={setRuleDirectoryName}
          onStoryChange={setStoryDirectoryName}
          onContinue={handleEnterGameSetup}
        />
      );
      break;
    case "game_setup":
      content = (
        <GameSetupPage
          bootstrap={bootstrap}
          ruleDirectoryName={ruleDirectoryName}
          storyDirectoryName={storyDirectoryName}
          locale={locale}
          playMode={playMode}
          gmArchitecture={gmArchitecture}
          modelAccessMode={modelAccessMode}
          modelProfileId={modelProfileId}
          runtimeModelConfig={runtimeModelConfig}
          debugEnabled={debugEnabled}
          logViewMode={logViewMode}
          openingPreviewDeliveryMode={openingPreviewDeliveryMode}
          characterConcept={characterConcept}
          characterConceptAssistLoading={characterConceptAssistLoading}
          characterConceptAssistMode={characterConceptAssistMode}
          isCreating={isCreating}
          openingPreviewText={openingPreviewText}
          openingPreviewProvider={openingPreviewProvider}
          openingPreviewMeta={openingPreviewMeta}
          openingPreviewLoading={openingPreviewLoading}
          openingPreviewError={openingPreviewError}
          showAiMetadata={showAiMetadata}
          markdownFontSize={markdownFontSize}
          onBack={() => setView("story_select")}
          onClose={() => setView("menu")}
          onSubmit={handleCreateSession}
          onLocaleChange={setLocale}
          onPlayModeChange={setPlayMode}
          onGmArchitectureChange={setGmArchitecture}
          onModelAccessModeChange={setModelAccessMode}
          onModelProfileIdChange={setModelProfileId}
          onDebugEnabledChange={setDebugEnabled}
          onLogViewModeChange={setLogViewMode}
          onRegenerateOpeningPreview={handleRegenerateOpeningPreview}
          onAssistCharacterConcept={handleAssistCharacterConcept}
          onOpeningPreviewDeliveryModeChange={setOpeningPreviewDeliveryMode}
          onMarkdownFontSizeChange={setMarkdownFontSize}
          onCharacterConceptChange={setCharacterConcept}
        />
      );
      break;
    case "continue":
      content = (
        <ContinuePage
          recentSave={recentSave}
          recentSnapshot={recentSnapshot}
          isRestoring={isRestoring}
          onBack={() => setView("menu")}
          onContinueSavedGame={handleContinueRecentSave}
          onContinueSnapshot={handleContinueRecentSnapshot}
          onClearRecent={handleClearRecent}
          onRemoveRecentSave={handleRemoveRecentSave}
        />
      );
      break;
    case "records":
      content = (
        <RecordsPage
          savedGames={savedGames}
          isRestoring={isRestoring}
          onBack={() => setView("menu")}
          onClearSavedGames={handleClearSavedGames}
          onDeleteSavedGame={handleDeleteSavedGame}
          onLoadSavedGame={handleLoadSavedGame}
        />
      );
      break;
    case "settings":
      content = (
        <SettingsPage
          bootstrap={bootstrap}
          locale={locale}
          playMode={playMode}
          gmArchitecture={gmArchitecture}
          modelAccessMode={modelAccessMode}
          modelProfileId={modelProfileId}
          runtimeModelConfig={runtimeModelConfig}
          profileRuntimeConfigs={profileRuntimeConfigs}
          imageProfileId={imageProfileId}
          runtimeImageModelConfig={runtimeImageModelConfig}
          imageProfileRuntimeConfigs={imageProfileRuntimeConfigs}
          imagePromptTemplateConfig={imagePromptTemplateConfig}
          debugEnabled={debugEnabled}
          logViewMode={logViewMode}
          showAiMetadata={showAiMetadata}
          menuFontSize={menuFontSize}
          onBack={() => setView("menu")}
          onSubmit={handleSaveSettings}
          onReset={handleResetSettings}
          onLocaleChange={setLocale}
          onPlayModeChange={setPlayMode}
          onGmArchitectureChange={setGmArchitecture}
          onModelAccessModeChange={setModelAccessMode}
          onModelProfileIdChange={setModelProfileId}
          onProfileRuntimeConfigChange={setProfileRuntimeConfig}
          onImageProfileIdChange={setImageProfileId}
          onImageProfileRuntimeConfigChange={setImageProfileRuntimeConfig}
          onImagePromptTemplateConfigChange={setImagePromptTemplateConfig}
          onDebugEnabledChange={setDebugEnabled}
          onShowAiMetadataChange={setShowAiMetadata}
          onMenuFontSizeChange={setMenuFontSize}
          onLogViewModeChange={setLogViewMode}
        />
      );
      break;
    case "exit":
      content = (
        <ExitPage
          onBack={() => setView("menu")}
          onExit={handleExit}
          onClearRecent={handleClearRecent}
          onClearRecords={handleClearSavedGames}
        />
      );
      break;
    case "game":
      content = (
        <GamePage
          snapshot={snapshot}
          activeGraphBundle={activeGraphBundle}
          turnInput={turnInput}
          isBootstrappingSession={isBootstrappingSession}
          isSubmittingTurn={isSubmittingTurn}
          isSaving={isSaving}
          savedGames={savedGames}
          isRestoring={isRestoring}
          isResumingBranch={isResumingBranch}
          showAiMetadata={showAiMetadata}
          markdownFontSize={markdownFontSize}
          imageProfileId={imageProfileId}
          runtimeImageModelConfig={runtimeImageModelConfig}
          imagePromptTemplateConfig={
            imagePromptTemplateConfig ?? bootstrap?.imagePromptTemplateConfig ?? null
          }
          onBack={() => setView("menu")}
          onContinueFromNode={handleContinueFromNode}
          onLoadSavedGame={handleLoadSavedGame}
          onQuickEndingTest={handleQuickEndingTest}
          onSaveGame={handleSaveGame}
          onTurnInputChange={setTurnInput}
          onSubmitTurn={handleSubmitTurn}
        />
      );
      break;
    case "menu":
    default:
      content = (
        <MenuPage
          recentSnapshot={recentSnapshot}
          locale={locale}
          playMode={playMode}
          gmArchitecture={gmArchitecture}
          modelAccessMode={modelAccessMode}
          modelProfileId={modelProfileId}
          onOpenNewGame={handleOpenStorySelect}
          onOpenContinue={() => setView("continue")}
          onOpenRecords={() => setView("records")}
          onOpenSettings={() => setView("settings")}
          onOpenExit={() => setView("exit")}
        />
      );
      break;
  }

  return (
    <main
      className="app-shell"
      style={{ "--ui-scale": String(getMenuFontScale(menuFontSize)) } as CSSProperties}
    >
      {content}
      {status.message ? (
        <p className={`status-line ${status.tone === "error" ? "status-error" : ""}`}>
          {status.message}
        </p>
      ) : null}
    </main>
  );
}
