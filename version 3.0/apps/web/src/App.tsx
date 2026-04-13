import { useEffect, useRef, useState, type CSSProperties } from "react";

import type {
  AiGenerationMetadata,
  CharacterConceptAssistMode,
  CreateSessionAiCompanionInput,
  CreateSessionRequest,
  GenerateOpeningPreviewRequest,
  LocalSaveSettings,
  Message,
  ReplayEvent,
  SaveBundle,
  SaveRuntimeConfig,
  SessionCreateStage,
  RoundDraft,
  SessionSnapshot,
  StoryControlMode
} from "../../../packages/shared-types/src/index.ts";
import {
  assistCharacterConcept,
  commitPreparedRound,
  createSave,
  fetchLocalSaveSettings,
  fetchSession,
  generateOpeningPreview,
  loadSavedGame,
  loadSaveBundle,
  pickLocalSaveDirectory,
  prepareRound,
  sendPrivateChat,
  submitManualNarration,
  streamCreateSession,
  streamOpeningPreview,
  submitTurn,
  updateLocalSaveSettings,
  updateStoryControlMode
} from "./lib/trpgApiClient.ts";
import { useBootstrapState } from "./hooks/useBootstrapState.ts";
import { usePlaythroughGraph } from "./hooks/usePlaythroughGraph.ts";
import { useStoredProgress } from "./hooks/useStoredProgress.ts";
import { ContinuePage } from "./pages/ContinuePage.tsx";
import { ExitPage } from "./pages/ExitPage.tsx";
import { GameBootstrapPage } from "./pages/GameBootstrapPage.tsx";
import { GamePage } from "./pages/GamePage.tsx";
import { GameSetupPage } from "./pages/GameSetupPage.tsx";
import {
  UiTextProvider,
  getUiTextByLocale,
  type UiLocaleCode,
  type UiText
} from "./locales/index.tsx";
import { MenuPage } from "./pages/MenuPage.tsx";
import { RecordsPage } from "./pages/RecordsPage.tsx";
import { SettlementPage } from "./pages/SettlementPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { StorySelectPage } from "./pages/StorySelectPage.tsx";
import { storeWebDefaults, type SavedGameRecord } from "./storage.ts";
import { getMenuFontScale, type AppView, type StatusState } from "./ui.ts";

const initialStatus: StatusState = {
  message: "",
  tone: "neutral"
};

type SessionBootstrapVisualStage = "entered_game" | SessionCreateStage;
type SessionBootstrapStepStatus = "pending" | "active" | "completed";

type SessionBootstrapPanelState = {
  coverAssetUrl: string | null;
  loadingHint: string;
  progress: number;
  activeLabel: string;
  activeDetail: string;
  steps: Array<{
    stage: SessionBootstrapVisualStage;
    label: string;
    detail: string;
    status: SessionBootstrapStepStatus;
  }>;
};

const SESSION_BOOTSTRAP_STAGE_ORDER: SessionBootstrapVisualStage[] = [
  "entered_game",
  "loading_content",
  "assembling_prompt",
  "requesting_narrator",
  "waiting_first_reply",
  "finalizing_session"
];
const AUTO_COMMIT_COUNTDOWN_SECONDS = 3;

function buildSessionBootstrapPanelState(text: UiText, input: {
  coverAssetUrl: string | null;
  loadingHint: string;
  activeStage: SessionBootstrapVisualStage;
}): SessionBootstrapPanelState {
  const stageMeta = text.app.bootstrapStages;
  const activeIndex = SESSION_BOOTSTRAP_STAGE_ORDER.indexOf(input.activeStage);
  const activeMeta = stageMeta[input.activeStage];

  return {
    coverAssetUrl: input.coverAssetUrl,
    loadingHint: input.loadingHint,
    progress: activeMeta.progress,
    activeLabel: activeMeta.label,
    activeDetail: activeMeta.detail,
    steps: SESSION_BOOTSTRAP_STAGE_ORDER.map((stage, index) => ({
      stage,
      label: stageMeta[stage].label,
      detail: stageMeta[stage].detail,
      status:
        index < activeIndex
          ? "completed"
          : index === activeIndex
            ? "active"
            : "pending"
    }))
  };
}

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

      return trimmedParagraph.match(/.{1,18}(?:[，。！？、；：,.!?;:]|$)/gu) ?? [trimmedParagraph];
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

function buildEmptyAiCompanion(): CreateSessionAiCompanionInput {
  return {
    displayName: "",
    personalityTagIds: []
  };
}

function sessionNeedsPreparedRound(snapshot: SessionSnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }

  if (snapshot.session.gameState.endingState) {
    return false;
  }

  const primaryPlayerMode = snapshot.session.partySetup?.primaryPlayerMode ?? "human";
  const companionCount = snapshot.session.companionParticipantIds?.length ?? 0;
  return primaryPlayerMode === "ai" || companionCount > 0;
}

function getPreparedPrimaryDraft(snapshot: SessionSnapshot | null): RoundDraft | null {
  return snapshot?.session.gameState.roundInputState?.drafts.find((draft) => draft.isPrimary) ?? null;
}

function getStoryControlMode(snapshot: SessionSnapshot | null): StoryControlMode | null {
  if (
    !snapshot ||
    snapshot.session.partySetup?.primaryPlayerMode !== "ai" ||
    snapshot.session.gameState.endingState
  ) {
    return null;
  }

  return snapshot.session.gameState.storyControlMode ?? "intervene";
}

function buildPreparedTurnCapturePreview(
  snapshot: SessionSnapshot,
  primaryOverride?: string
): string {
  const normalizedOverride = primaryOverride?.trim() ?? "";
  const drafts = (snapshot.session.gameState.roundInputState?.drafts ?? []).map((draft) =>
    draft.isPrimary && normalizedOverride.length > 0
      ? {
          ...draft,
          content: normalizedOverride
        }
      : draft
  );

  if (!drafts.length) {
    return "";
  }

  return drafts
    .map((draft) => `${draft.displayName}: ${draft.content}`)
    .join(" | ");
}

export function App() {
  const [view, setView] = useState<AppView>("menu");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [status, setStatus] = useState<StatusState>(initialStatus);
  const [isCreating, setIsCreating] = useState(false);
  const [isPreparingRound, setIsPreparingRound] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [isInjectingManualNarration, setIsInjectingManualNarration] = useState(false);
  const [isSendingPrivateChat, setIsSendingPrivateChat] = useState(false);
  const [isUpdatingStoryControl, setIsUpdatingStoryControl] = useState(false);
  const [storyControlModeOverride, setStoryControlModeOverride] = useState<StoryControlMode | null>(null);
  const [autoCommitCountdown, setAutoCommitCountdown] = useState<number | null>(null);
  const [localSaveSettings, setLocalSaveSettings] = useState<LocalSaveSettings | null>(null);
  const [localSaveDirectoryInput, setLocalSaveDirectoryInput] = useState("");
  const [isPickingLocalSaveDirectory, setIsPickingLocalSaveDirectory] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isResumingBranch, setIsResumingBranch] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [turnInput, setTurnInput] = useState("");
  const [characterConcept, setCharacterConcept] = useState("");
  const [aiCompanions, setAiCompanions] = useState<CreateSessionAiCompanionInput[]>([]);
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
  const [isOpeningRevealInProgress, setIsOpeningRevealInProgress] = useState(false);
  const [sessionBootstrapState, setSessionBootstrapState] =
    useState<SessionBootstrapPanelState | null>(null);
  const lastHandledOpeningPreviewRegenerateNonceRef = useRef(0);
  const stagedOpeningRevealTimerRef = useRef<number | null>(null);
  const stagedSessionBootTokenRef = useRef(0);
  const autoPreparedRoundKeyRef = useRef<string | null>(null);
  const autoCommittedRoundKeyRef = useRef<string | null>(null);

  const {
    bootstrap,
    ruleDirectoryName,
    storyDirectoryName,
    uiLocale,
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
    setUiLocale,
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
    commitSaveRecord,
    clearRecent,
    refreshSavedGamesList,
    clearSavedGamesList,
    removeSavedGameById
  } = useStoredProgress();
  const uiText = getUiTextByLocale(uiLocale);

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
  const roundPreparationRequired = sessionNeedsPreparedRound(snapshot);
  const snapshotStoryControlMode = getStoryControlMode(snapshot);
  const storyControlMode =
    snapshotStoryControlMode === null
      ? null
      : storyControlModeOverride ?? snapshotStoryControlMode;

  useEffect(() => {
    setStoryControlModeOverride(null);
  }, [snapshot?.session.id]);

  function applyLocalSaveSettings(nextSettings: LocalSaveSettings): void {
    setLocalSaveSettings(nextSettings);
    setLocalSaveDirectoryInput(nextSettings.saveDirectory ?? "");
  }

  useEffect(() => {
    let cancelled = false;

    void fetchLocalSaveSettings()
      .then((nextSettings) => {
        if (!cancelled) {
          applyLocalSaveSettings(nextSettings);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus({
            message: error instanceof Error ? error.message : String(error),
            tone: "error"
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!localSaveSettings?.effectiveSaveDirectory) {
      return;
    }

    void refreshSavedGamesList().catch((error) => {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    });
  }, [localSaveSettings?.effectiveSaveDirectory]);

  useEffect(() => {
    if (!snapshot || view === "game_bootstrap" || isBootstrappingSession) {
      return;
    }

    const graphHasCurrentSession =
      activeGraphBundle?.nodes.some((node) => node.sourceSessionId === snapshot.session.id) ?? false;

    if (graphHasCurrentSession) {
      return;
    }

    relinkSnapshot(
      snapshot,
      buildSaveRuntimeConfig(snapshot.session.settings.modelProfileId)
    );
  }, [
    activeGraphBundle,
    isBootstrappingSession,
    relinkSnapshot,
    snapshot,
    view
  ]);

  useEffect(() => {
    autoPreparedRoundKeyRef.current = null;
    autoCommittedRoundKeyRef.current = null;
    setAutoCommitCountdown(null);
  }, [snapshot?.session.id]);

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
          ? "This model mode does not support AI opening preview. Switch to Mock or Server Proxy."
          : "The current model profile is incomplete, so only static preview text can be shown."
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

  useEffect(() => {
    if (!snapshot || view !== "game") {
      return;
    }

    if (!sessionNeedsPreparedRound(snapshot)) {
      return;
    }

    if (snapshot.session.partySetup?.primaryPlayerMode !== "ai") {
      return;
    }

    if (snapshot.session.status === "ended") {
      return;
    }

    if (snapshot.session.gameState.roundInputState) {
      return;
    }

    if (
      isCreating ||
      isBootstrappingSession ||
      isOpeningRevealInProgress ||
      isPreparingRound ||
      isSubmittingTurn
    ) {
      return;
    }

    const autoPrepareKey = `${snapshot.session.id}:${snapshot.session.currentRound}`;
    if (autoPreparedRoundKeyRef.current === autoPrepareKey) {
      return;
    }

    autoPreparedRoundKeyRef.current = autoPrepareKey;

    void prepareRoundDrafts(snapshot, "", {
      pendingMessage: uiText.app.status.preparingAiLeaderDraft,
      successMessage: uiText.app.status.roundDraftsReady
    });
  }, [
    isBootstrappingSession,
    isCreating,
    isOpeningRevealInProgress,
    isPreparingRound,
    isSubmittingTurn,
    snapshot,
    uiText.app.status.preparingAiLeaderDraft,
    uiText.app.status.roundDraftsReady,
    view
  ]);

  useEffect(() => {
    if (!snapshot || view !== "game") {
      setAutoCommitCountdown(null);
      return;
    }

    if (snapshot.session.partySetup?.primaryPlayerMode !== "ai") {
      setAutoCommitCountdown(null);
      return;
    }

    if (storyControlMode !== "auto") {
      autoCommittedRoundKeyRef.current = null;
      setAutoCommitCountdown(null);
      return;
    }

    if (snapshot.session.status === "ended") {
      setAutoCommitCountdown(null);
      return;
    }

    if (snapshot.session.gameState.roundInputState?.phase !== "ready_to_commit") {
      setAutoCommitCountdown(null);
      return;
    }

    if (
      isCreating ||
      isBootstrappingSession ||
      isOpeningRevealInProgress ||
      isPreparingRound ||
      isSubmittingTurn ||
      isSendingPrivateChat ||
      isUpdatingStoryControl
    ) {
      setAutoCommitCountdown(null);
      return;
    }

    const autoCommitKey = `${snapshot.session.id}:${snapshot.session.currentRound}`;
    if (autoCommittedRoundKeyRef.current === autoCommitKey) {
      return;
    }

    if (autoCommitCountdown === null) {
      setAutoCommitCountdown(AUTO_COMMIT_COUNTDOWN_SECONDS);
      return;
    }

    if (autoCommitCountdown > 0) {
      const countdownHandle = window.setTimeout(() => {
        setAutoCommitCountdown((current) =>
          current === null ? null : Math.max(current - 1, 0)
        );
      }, 1000);

      return () => {
        window.clearTimeout(countdownHandle);
      };
    }

    autoCommittedRoundKeyRef.current = autoCommitKey;
    setAutoCommitCountdown(null);

    void commitPreparedRoundDrafts(snapshot, {
      pendingMessage: uiText.app.status.autoRoundSubmitting,
      successMessage: uiText.app.status.turnComplete,
      endingSuccessMessage: uiText.app.status.turnCompleteEnded,
      primaryInputOverride:
        turnInput.trim() || getPreparedPrimaryDraft(snapshot)?.content || undefined
    }).then((didCommit) => {
      if (!didCommit && autoCommittedRoundKeyRef.current === autoCommitKey) {
        autoCommittedRoundKeyRef.current = autoCommitKey;
      }
    });
  }, [
    autoCommitCountdown,
    isBootstrappingSession,
    isCreating,
    isOpeningRevealInProgress,
    isPreparingRound,
    isSendingPrivateChat,
    isSubmittingTurn,
    isUpdatingStoryControl,
    snapshot,
    turnInput,
    uiText.app.status.autoRoundSubmitting,
    uiText.app.status.turnComplete,
    uiText.app.status.turnCompleteEnded,
    storyControlMode,
    view
  ]);

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
      uiLocale,
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

  function handleUiLocaleChange(nextUiLocale: UiLocaleCode): void {
    setUiLocale(nextUiLocale);
    storeWebDefaults({
      uiLocale: nextUiLocale,
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

  function handleAddAiCompanion(): void {
    setAiCompanions((current) =>
      current.length >= 3 ? current : [...current, buildEmptyAiCompanion()]
    );
  }

  function handleRemoveAiCompanion(index: number): void {
    setAiCompanions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function handleUpdateAiCompanionName(index: number, displayName: string): void {
    setAiCompanions((current) =>
      current.map((companion, itemIndex) =>
        itemIndex === index
          ? {
              ...companion,
              displayName
            }
          : companion
      )
    );
  }

  function handleToggleAiCompanionPersonalityTag(
    index: number,
    personalityTagId: string
  ): void {
    setAiCompanions((current) =>
      current.map((companion, itemIndex) => {
        if (itemIndex !== index) {
          return companion;
        }

        const hasTag = companion.personalityTagIds.includes(personalityTagId);
        return {
          ...companion,
          personalityTagIds: hasTag
            ? companion.personalityTagIds.filter((tagId) => tagId !== personalityTagId)
            : [...companion.personalityTagIds, personalityTagId]
        };
      })
    );
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

  function replaceMessageContent(
    currentSnapshot: SessionSnapshot,
    messageId: string,
    content: string
  ): SessionSnapshot {
    return {
      ...currentSnapshot,
      session: {
        ...currentSnapshot.session,
        updatedAt: new Date().toISOString()
      },
      messages: currentSnapshot.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content
            }
          : message
      )
    };
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
        content: uiText.app.pendingSessionSystemMessage(args.storyTitle, locale),
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
        summary: uiText.app.pendingSessionReplaySummary,
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
            displayName: uiText.app.pendingPlayerName,
            isAiControlled: false,
            isLocalUser: true,
            locale
          },
          {
            id: gmParticipantId,
            role: "gm",
            displayName: uiText.app.pendingNarratorName,
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
          lastEndingJudgeResult: null,
          lastEndingJudgeDecision: null,
          storyControlMode: playMode === "story_mode" ? "intervene" : null
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

  function startOpeningNarrationReveal(
    finalSnapshot: SessionSnapshot,
    bootToken: number,
    options?: {
      onComplete?: () => void;
    }
  ): void {
    clearStagedOpeningReveal();

    const openingMessage =
      [...finalSnapshot.messages]
        .reverse()
        .find((message) => message.kind === "gm_narration" || message.kind === "gm_dialogue") ??
      null;

    if (!openingMessage) {
      setSnapshot(finalSnapshot);
      setIsOpeningRevealInProgress(false);
      options?.onComplete?.();
      return;
    }

    const revealChunks = splitTextIntoRevealChunks(openingMessage.content);
    if (!revealChunks.length) {
      setSnapshot(finalSnapshot);
      setIsOpeningRevealInProgress(false);
      options?.onComplete?.();
      return;
    }

    let chunkIndex = 0;
    setIsOpeningRevealInProgress(true);
    setSnapshot(replaceMessageContent(finalSnapshot, openingMessage.id, ""));

    stagedOpeningRevealTimerRef.current = window.setInterval(() => {
      if (stagedSessionBootTokenRef.current !== bootToken) {
        clearStagedOpeningReveal();
        setIsOpeningRevealInProgress(false);
        return;
      }

      chunkIndex += 1;
      const nextContent = revealChunks.slice(0, chunkIndex).join("");
      setSnapshot(replaceMessageContent(finalSnapshot, openingMessage.id, nextContent));

      if (chunkIndex >= revealChunks.length) {
        clearStagedOpeningReveal();
        setSnapshot(finalSnapshot);
        setIsOpeningRevealInProgress(false);
        options?.onComplete?.();
      }
    }, 46);
  }

  async function prepareRoundDrafts(
    currentSnapshot: SessionSnapshot,
    playerInput: string,
    options?: {
      pendingMessage?: string;
      successMessage?: string;
    }
  ): Promise<SessionSnapshot | null> {
    setIsPreparingRound(true);
    setStatus({
      message: options?.pendingMessage ?? uiText.app.status.preparingRoundDrafts,
      tone: "neutral"
    });

    try {
      const nextSnapshot = await prepareRound(currentSnapshot.session.id, {
        playerInput
      });
      commitSnapshot(nextSnapshot);
      setTurnInput(getPreparedPrimaryDraft(nextSnapshot)?.content ?? playerInput);
      setStatus({
        message: options?.successMessage ?? uiText.app.status.roundDraftsReady,
        tone: "neutral"
      });
      return nextSnapshot;
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
      return null;
    } finally {
      setIsPreparingRound(false);
    }
  }

  async function commitPreparedRoundDrafts(
    currentSnapshot: SessionSnapshot,
    options?: {
      pendingMessage?: string;
      successMessage?: string;
      endingSuccessMessage?: string;
      primaryInputOverride?: string;
    }
  ): Promise<boolean> {
    setIsSubmittingTurn(true);
    setStatus({
      message: options?.pendingMessage ?? uiText.app.status.submitTurnPending,
      tone: "neutral"
    });

    try {
      const primaryInputOverride = options?.primaryInputOverride ?? turnInput;
      const capturePreview = buildPreparedTurnCapturePreview(currentSnapshot, primaryInputOverride);
      const nextSnapshot = await commitPreparedRound(currentSnapshot.session.id, {
        playerInput: primaryInputOverride?.trim() || undefined
      });
      commitSnapshot(nextSnapshot);
      captureTurn(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId),
        capturePreview
      );
      setTurnInput("");
      setStatus({
        message:
          nextSnapshot.session.status === "ended"
            ? options?.endingSuccessMessage ?? uiText.app.status.turnCompleteEnded
            : options?.successMessage ?? uiText.app.status.turnComplete,
        tone: "neutral"
      });
      return true;
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
      return false;
    } finally {
      setIsSubmittingTurn(false);
    }
  }

  async function submitPlayerTurn(
    currentSnapshot: SessionSnapshot,
    playerInput: string,
    options?: {
      pendingMessage?: string;
      successMessage?: string;
      endingSuccessMessage?: string;
      followupSuccessMessage?: string;
    }
  ): Promise<void> {
    const wasAlreadyEnded = Boolean(currentSnapshot.session.gameState.endingState);
    setIsSubmittingTurn(true);
    setStatus({
      message: options?.pendingMessage ?? uiText.app.status.submitTurnPending,
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
          wasAlreadyEnded
            ? options?.followupSuccessMessage ?? uiText.app.status.endingFollowupComplete
            : nextSnapshot.session.status === "ended"
            ? options?.endingSuccessMessage ?? uiText.app.status.turnCompleteEnded
            : options?.successMessage ?? uiText.app.status.turnComplete,
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

  async function handleSendPrivateChat(
    targetParticipantId: string,
    content: string
  ): Promise<boolean> {
    if (!snapshot) {
      setStatus({
        message: uiText.app.status.startGameFirst,
        tone: "error"
      });
      return false;
    }

    if (storyControlMode === "auto") {
      setStatus({
        message: uiText.app.status.privateChatAutoModeUnavailable,
        tone: "error"
      });
      return false;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setStatus({
        message: uiText.app.status.enterPrivateChat,
        tone: "error"
      });
      return false;
    }

    setIsSendingPrivateChat(true);
    setStatus({
      message: uiText.app.status.sendingPrivateChat,
      tone: "neutral"
    });

    try {
      const nextSnapshot = await sendPrivateChat(snapshot.session.id, {
        targetParticipantId,
        content: trimmedContent
      });
      commitSnapshot(nextSnapshot);
      setStatus({
        message: uiText.app.status.privateChatSent,
        tone: "neutral"
      });
      return true;
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
      return false;
    } finally {
      setIsSendingPrivateChat(false);
    }
  }

  async function handleStoryControlModeChange(mode: StoryControlMode): Promise<void> {
    if (!snapshot) {
      setStatus({
        message: uiText.app.status.startGameFirst,
        tone: "error"
      });
      return;
    }

    if (snapshot.session.partySetup?.primaryPlayerMode !== "ai") {
      return;
    }

    const currentMode = storyControlMode ?? "intervene";
    if (currentMode === mode) {
      return;
    }

    setStoryControlModeOverride(mode);
    if (mode === "intervene") {
      setAutoCommitCountdown(null);
    }

    setIsUpdatingStoryControl(true);
    setStatus({
      message: uiText.app.status.storyControlSwitching,
      tone: "neutral"
    });

    try {
      const nextSnapshot = await updateStoryControlMode(snapshot.session.id, {
        mode
      });
      commitSnapshot(nextSnapshot);
      setStatus({
        message:
          mode === "auto"
            ? uiText.app.status.storyControlAutoEnabled
            : uiText.app.status.storyControlInterveneEnabled,
        tone: "neutral"
      });
    } catch (error) {
      setStoryControlModeOverride(snapshotStoryControlMode);
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsUpdatingStoryControl(false);
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
        message: uiText.app.status.noPlayableStory,
        tone: "error"
      });
      return;
    }

    const coverAssetUrl =
      selectedStory.assets.find((asset) => asset.type === "cover")?.url ?? null;
    const loadingHint =
      selectedStory.coverQuote?.trim() ||
      openingPreviewText.trim().split("\n").find((line) => line.trim().length > 0)?.trim() ||
      selectedStory.intro?.trim() ||
      uiText.gameBootstrapScreen.defaultLoadingHint(selectedStory.title);
    const normalizedAiCompanions = aiCompanions
      .map((companion) => ({
        displayName: companion.displayName.trim(),
        personalityTagIds: companion.personalityTagIds
      }))
      .filter(
        (companion) =>
          companion.displayName.length > 0 || companion.personalityTagIds.length > 0
      );

    setIsCreating(true);
    setIsBootstrappingSession(true);
    setIsOpeningRevealInProgress(false);
    setStatus({
      message: uiText.app.status.createSessionPending,
      tone: "neutral"
    });

    try {
      saveDefaults();

      const bootToken = stagedSessionBootTokenRef.current + 1;
      stagedSessionBootTokenRef.current = bootToken;

      const pendingSnapshot = buildPendingSessionSnapshot({
        ruleTitle: selectedRule.ruleTitle,
        storyTitle: selectedStory.title,
        revealText: loadingHint
      });

      setTurnInput("");
      setSnapshot(pendingSnapshot);
      setSessionBootstrapState(
        buildSessionBootstrapPanelState(uiText, {
          coverAssetUrl,
          loadingHint,
          activeStage: "entered_game"
        })
      );
      setView("game_bootstrap");

      const nextSnapshot = await streamCreateSession(
        {
          ruleDirectoryName,
          storyDirectoryName,
          locale,
          playMode,
          gmArchitecture,
          modelAccessMode,
          characterConcept,
          modelProfileId,
          runtimeModelConfig,
          aiCompanions: normalizedAiCompanions,
          debugEnabled,
          promptDebugEnabled: false,
          logViewMode
        },
        {
          onStage: (event) => {
            setSessionBootstrapState(
              buildSessionBootstrapPanelState(uiText, {
                coverAssetUrl,
                loadingHint,
                activeStage: event.stage
              })
            );
          }
        }
      );

      if (stagedSessionBootTokenRef.current !== bootToken) {
        return;
      }

      clearStagedOpeningReveal();
      persistStoredSnapshot(nextSnapshot);
      beginFromSnapshot(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId)
      );
      setSessionBootstrapState(null);
      setIsBootstrappingSession(false);
      setView("game");
      setStatus({
        message: uiText.app.status.narratorConnected,
        tone: "neutral"
      });
      startOpeningNarrationReveal(nextSnapshot, bootToken, {
        onComplete: () => {
          setStatus({
            message:
              characterConcept.trim().length > 0
                ? uiText.app.status.sessionCreatedWithCharacter
                : uiText.app.status.sessionCreated,
            tone: "neutral"
          });
        }
      });
    } catch (error) {
      clearStagedOpeningReveal();
      setSessionBootstrapState(null);
      setIsOpeningRevealInProgress(false);
      setSnapshot(null);
      setView("game_setup");
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsCreating(false);
      if (stagedOpeningRevealTimerRef.current === null) {
        setIsBootstrappingSession(false);
      }
    }
  }

  async function handleSubmitTurn(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    if (!snapshot) {
      setStatus({
        message: uiText.app.status.startGameFirst,
        tone: "error"
      });
      return;
    }

    if (!snapshot.session.gameState.endingState && storyControlMode === "auto") {
      setStatus({
        message: uiText.app.status.autoModeSubmitLocked,
        tone: "error"
      });
      return;
    }

    const trimmedInput = turnInput.trim();
    if (roundPreparationRequired) {
      if (snapshot.session.gameState.roundInputState?.phase === "ready_to_commit") {
        await commitPreparedRoundDrafts(snapshot);
        return;
      }

      if (
        snapshot.session.partySetup?.primaryPlayerMode !== "ai" &&
        !trimmedInput
      ) {
        setStatus({
          message: uiText.app.status.enterAction,
          tone: "error"
        });
        return;
      }

      await prepareRoundDrafts(snapshot, trimmedInput);
      return;
    }

    if (!trimmedInput) {
      setStatus({
        message: uiText.app.status.enterAction,
        tone: "error"
      });
      return;
    }

    await submitPlayerTurn(snapshot, trimmedInput);
  }

  async function handleQuickEndingTest(): Promise<void> {
    if (!snapshot) {
      setStatus({
        message: uiText.app.status.startGameFirst,
        tone: "error"
      });
      return;
    }

    if (sessionNeedsPreparedRound(snapshot)) {
      setStatus({
        message: uiText.app.status.quickEndingDraftModeUnavailable,
        tone: "error"
      });
      return;
    }

    if (snapshot.session.modelAccessMode !== "mock") {
      setStatus({
        message: uiText.app.status.quickEndingMockOnly,
        tone: "error"
      });
      return;
    }

    await submitPlayerTurn(snapshot, uiText.app.quickEndingTestInput, {
      pendingMessage: uiText.app.status.quickEndingTestPending,
      successMessage: uiText.app.status.quickEndingTestSuccess,
      endingSuccessMessage: uiText.app.status.quickEndingTestEnded
    });
  }

  async function handleSubmitManualNarration(narrationText: string): Promise<boolean> {
    if (!snapshot) {
      setStatus({
        message: uiText.app.status.startGameFirst,
        tone: "error"
      });
      return false;
    }

    const trimmedNarration = narrationText.trim();
    if (!trimmedNarration) {
      setStatus({
        message: uiText.app.status.enterManualNarration,
        tone: "error"
      });
      return false;
    }

    setIsInjectingManualNarration(true);
    setStatus({
      message: uiText.app.status.manualNarrationPending,
      tone: "neutral"
    });

    try {
      const nextSnapshot = await submitManualNarration(snapshot.session.id, {
        narrationText: trimmedNarration
      });
      commitSnapshot(nextSnapshot);
      captureTurn(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId),
        uiText.gameScreen.manualNarrationTest
      );
      setStatus({
        message:
          snapshot.session.gameState.endingState
            ? uiText.app.status.manualNarrationSuccess
            : nextSnapshot.session.status === "ended"
            ? uiText.app.status.manualNarrationEnded
            : uiText.app.status.manualNarrationSuccess,
        tone: "neutral"
      });
      return true;
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
      return false;
    } finally {
      setIsInjectingManualNarration(false);
    }
  }

  async function handleSaveGame(): Promise<void> {
    if (!snapshot) {
      setStatus({
        message: uiText.app.status.noActiveSessionToSave,
        tone: "error"
      });
      return;
    }

    const ensureSettings =
      localSaveSettings ?? (await fetchLocalSaveSettings().catch((error) => {
        setStatus({
          message: error instanceof Error ? error.message : String(error),
          tone: "error"
        });
        return null;
      }));

    if (!ensureSettings) {
      return;
    }

    if (!localSaveSettings) {
      applyLocalSaveSettings(ensureSettings);
    }

    if (!ensureSettings.hasSelectedSaveDirectory) {
      window.alert(`${uiText.app.saveDirectoryPrompt.title}\n${uiText.app.saveDirectoryPrompt.hint}`);

      const selectedDirectory = await pickLocalSaveDirectory({
        initialDirectory: ensureSettings.effectiveSaveDirectory,
        title: uiText.settingsScreen.localSaveDirectory
      }).catch((error) => {
        setStatus({
          message: error instanceof Error ? error.message : String(error),
          tone: "error"
        });
        return null;
      });

      if (!selectedDirectory) {
        setStatus({
          message: uiText.app.status.localSaveDirectorySelectionCancelled,
          tone: "neutral"
        });
        return;
      }

      try {
        const nextSettings = await updateLocalSaveSettings({
          saveDirectory: selectedDirectory
        });
        applyLocalSaveSettings(nextSettings);
      } catch (error) {
        setStatus({
          message: error instanceof Error ? error.message : String(error),
          tone: "error"
        });
        return;
      }
    }

    setIsSaving(true);
    setStatus({
      message: uiText.app.status.creatingLocalSave,
      tone: "neutral"
    });

    try {
      const result = await createSave(snapshot.session.id);
      commitSnapshot(result.snapshot);
      commitSaveRecord(result.saveRecord);
      syncSavedBundle(result.saveBundle);
      setStatus({
        message: uiText.app.status.localSaveCreated,
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
      message: uiText.app.status.loadingSelectedSave,
      tone: "neutral"
    });

    try {
      const nextSnapshot = await loadSaveBundle(saveBundle);
      commitSnapshot(nextSnapshot);
      setTurnInput(getPreparedPrimaryDraft(nextSnapshot)?.content ?? "");
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
        message: uiText.app.status.noRecentSave,
        tone: "error"
      });
      return;
    }

    setIsRestoring(true);
    setStatus({
      message: uiText.app.status.loadingSelectedSave,
      tone: "neutral"
    });

    try {
      const nextSnapshot = await loadSavedGame(recentSave.saveId);
      commitSnapshot(nextSnapshot);
      setTurnInput(getPreparedPrimaryDraft(nextSnapshot)?.content ?? "");
      relinkSnapshot(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId)
      );
      setView("game");
      setStatus({
        message: uiText.continueScreen.continueSave,
        tone: "neutral"
      });
    } catch (error) {
      setStoryControlModeOverride(null);
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleContinueRecentSnapshot(): Promise<void> {
    if (!recentSnapshot) {
      setStatus({
        message: uiText.app.status.noRecentSnapshot,
        tone: "error"
      });
      return;
    }

    setIsRestoring(true);
    setStatus({
      message: uiText.app.status.restoringLatestSnapshot,
      tone: "neutral"
    });

    try {
      const nextSnapshot = await fetchSession(recentSnapshot.session.id);
      commitSnapshot(nextSnapshot);
      setTurnInput(getPreparedPrimaryDraft(nextSnapshot)?.content ?? "");
      relinkSnapshot(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId)
      );
      setView("game");
      setStatus({
        message: uiText.app.status.latestSessionSynced,
        tone: "neutral"
      });
    } catch {
      commitSnapshot(recentSnapshot);
      setTurnInput(getPreparedPrimaryDraft(recentSnapshot)?.content ?? "");
      relinkSnapshot(
        recentSnapshot,
        buildSaveRuntimeConfig(recentSnapshot.session.settings.modelProfileId)
      );
      setView("game");
      setStatus({
        message: uiText.app.status.localSnapshotOpenedInstead,
        tone: "neutral"
      });
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleLoadSavedGame(record: SavedGameRecord): Promise<void> {
    setIsRestoring(true);
    setStatus({
      message: uiText.app.status.loadingSelectedSave,
      tone: "neutral"
    });

    try {
      const nextSnapshot = await loadSavedGame(record.saveId);
      commitSnapshot(nextSnapshot);
      setTurnInput(getPreparedPrimaryDraft(nextSnapshot)?.content ?? "");
      relinkSnapshot(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId)
      );
      setView("game");
      setStatus({
        message: `${uiText.common.load}: ${record.storyTitle}`,
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

  async function handleContinueFromNode(nodeId: string): Promise<void> {
    const prepared = prepareResume(nodeId);
    if (!prepared) {
      setStatus({
        message: uiText.app.status.nodeCannotResume,
        tone: "error"
      });
      return;
    }

    setIsResumingBranch(true);
    setStatus({
      message: uiText.app.status.switchingNode,
      tone: "neutral"
    });

    try {
      const nextSnapshot = await loadSaveBundle(prepared.saveBundle);
      commitSnapshot(nextSnapshot);
      setTurnInput(getPreparedPrimaryDraft(nextSnapshot)?.content ?? "");
      setView("game");
      setStatus({
        message: uiText.app.status.switchedNode,
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

  async function handleSaveSettings(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      const nextSettings = await updateLocalSaveSettings({
        saveDirectory: localSaveDirectoryInput.trim() || null
      });
      applyLocalSaveSettings(nextSettings);
      saveDefaults();
      setView("menu");
      setStatus({
        message: uiText.app.status.defaultSettingsSaved,
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    }
  }

  async function handleBrowseLocalSaveDirectory(): Promise<void> {
    setIsPickingLocalSaveDirectory(true);

    try {
      const selectedDirectory = await pickLocalSaveDirectory({
        initialDirectory:
          localSaveDirectoryInput.trim() ||
          localSaveSettings?.effectiveSaveDirectory ||
          null,
        title: uiText.settingsScreen.localSaveDirectory
      });

      if (!selectedDirectory) {
        return;
      }

      setLocalSaveDirectoryInput(selectedDirectory);
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsPickingLocalSaveDirectory(false);
    }
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
    setLocalSaveDirectoryInput("");
    setStatus({
      message: uiText.app.status.defaultsRestored,
      tone: "neutral"
    });
  }

  function handleClearRecent(): void {
    clearRecent();
    setStatus({
      message: uiText.app.status.recentSnapshotCleared,
      tone: "neutral"
    });
  }

  async function handleClearSavedGames(): Promise<void> {
    try {
      await clearSavedGamesList();
      setStatus({
        message: uiText.app.status.localSavesCleared,
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    }
  }

  async function handleRemoveRecentSave(): Promise<void> {
    if (!recentSave) {
      return;
    }

    try {
      await removeSavedGameById(recentSave.saveId);
      setStatus({
        message: uiText.app.status.recentSaveDeleted,
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    }
  }

  async function handleDeleteSavedGame(saveId: string): Promise<void> {
    try {
      await removeSavedGameById(saveId);
      setStatus({
        message: uiText.app.status.saveDeleted,
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    }
  }

  function handleExit(): void {
    window.close();
    setStatus({
      message: uiText.app.status.closeTabManually,
      tone: "neutral"
    });
  }

  function handleOpenStorySelect(): void {
    setCharacterConcept("");
    setAiCompanions([]);
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
        message: uiText.app.status.waitOpeningPreviewBeforeAssist,
        tone: "error"
      });
      return;
    }

    setCharacterConceptAssistLoading(true);
    setCharacterConceptAssistMode(nextMode);
    setStatus({
      message:
        nextMode === "generate"
          ? uiText.app.status.aiDraftingCharacterConcept
          : uiText.app.status.aiCompletingCharacterConcept,
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
            ? uiText.app.status.aiDraftedCharacterConcept
            : uiText.app.status.aiCompletedCharacterConcept,
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
        message: uiText.app.status.selectStoryFirst,
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
          aiCompanions={aiCompanions}
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
          onAddAiCompanion={handleAddAiCompanion}
          onRemoveAiCompanion={handleRemoveAiCompanion}
          onUpdateAiCompanionName={handleUpdateAiCompanionName}
          onToggleAiCompanionPersonalityTag={handleToggleAiCompanionPersonalityTag}
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
          localSaveDirectory={localSaveDirectoryInput}
          effectiveLocalSaveDirectory={localSaveSettings?.effectiveSaveDirectory ?? ""}
          localSaveDirectoryUsesDefault={localSaveSettings?.usesDefaultSaveDirectory ?? true}
          isPickingLocalSaveDirectory={isPickingLocalSaveDirectory}
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
          onLocalSaveDirectoryChange={setLocalSaveDirectoryInput}
          onBrowseLocalSaveDirectory={handleBrowseLocalSaveDirectory}
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
          isOpeningRevealInProgress={isOpeningRevealInProgress}
          sessionBootstrapState={sessionBootstrapState}
          isPreparingRound={isPreparingRound}
          isSubmittingTurn={isSubmittingTurn}
          isInjectingManualNarration={isInjectingManualNarration}
          isSendingPrivateChat={isSendingPrivateChat}
          isUpdatingStoryControl={isUpdatingStoryControl}
          autoCommitCountdown={autoCommitCountdown}
          isSaving={isSaving}
          savedGames={savedGames}
          isRestoring={isRestoring}
          isResumingBranch={isResumingBranch}
          showAiMetadata={showAiMetadata}
          markdownFontSize={markdownFontSize}
          storyControlMode={storyControlMode}
          imageProfileId={imageProfileId}
          runtimeImageModelConfig={runtimeImageModelConfig}
          imagePromptTemplateConfig={
            imagePromptTemplateConfig ?? bootstrap?.imagePromptTemplateConfig ?? null
          }
          onBack={() => setView("menu")}
          onContinueFromNode={handleContinueFromNode}
          onLoadSavedGame={handleLoadSavedGame}
          onQuickEndingTest={handleQuickEndingTest}
          onSubmitManualNarration={handleSubmitManualNarration}
          onSaveGame={handleSaveGame}
          onSendPrivateChat={handleSendPrivateChat}
          onStoryControlModeChange={handleStoryControlModeChange}
          onTurnInputChange={setTurnInput}
          onOpenSettlement={() => setView("settlement")}
          onSubmitTurn={handleSubmitTurn}
        />
      );
      break;
    case "settlement":
      content = (
        <SettlementPage
          snapshot={snapshot}
          activeGraphBundle={activeGraphBundle}
          isResumingBranch={isResumingBranch}
          onBackToGame={() => setView("game")}
          onContinueFromNode={handleContinueFromNode}
        />
      );
      break;
    case "game_bootstrap":
      content = (
        <GameBootstrapPage
          snapshot={snapshot}
          sessionBootstrapState={sessionBootstrapState}
        />
      );
      break;
    case "menu":
    default:
      content = (
        <MenuPage
          recentSnapshot={recentSnapshot}
          uiLocale={uiLocale}
          locale={locale}
          playMode={playMode}
          gmArchitecture={gmArchitecture}
          modelAccessMode={modelAccessMode}
          modelProfileId={modelProfileId}
          onUiLocaleChange={handleUiLocaleChange}
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
    <UiTextProvider locale={uiLocale}>
      <main
        className={view === "game_bootstrap" ? "app-shell app-shell-bootstrap" : "app-shell"}
        style={{ "--ui-scale": String(getMenuFontScale(menuFontSize)) } as CSSProperties}
      >
        {content}
        {status.message && view !== "game_bootstrap" ? (
          <p className={`status-line ${status.tone === "error" ? "status-error" : ""}`}>
            {status.message}
          </p>
        ) : null}
      </main>
    </UiTextProvider>
  );
}
