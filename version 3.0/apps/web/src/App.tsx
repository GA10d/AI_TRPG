import { useEffect, useRef, useState, type CSSProperties } from "react";

import type {
  AdvancedTextModelConfigInput,
  AiGenerationMetadata,
  CharacterConceptAssistMode,
  ComicCharacterReferenceInput,
  ComicPromptPresetResponse,
  ComicStylePreset,
  CreateSessionAiCompanionInput,
  CreateSessionRequest,
  GenerateOpeningPreviewRequest,
  LocalSaveSettings,
  Message,
  PersistedComicProject,
  ReplayEvent,
  SaveBundle,
  SaveRuntimeConfig,
  SessionCreateStage,
  RoundDraft,
  RoleTextModelConfigInput,
  SessionSnapshot,
  SessionAiCompanion,
  StoryControlMode
} from "../../../packages/shared-types/src/index.ts";
import {
  assistCharacterConcept,
  createSave,
  dismissEnding,
  fetchComicPromptPresets,
  fetchSaveBundle,
  fetchLocalSaveSettings,
  fetchSession,
  generateOpeningPreview,
  loadSavedGame,
  loadSaveBundle,
  loadWorldlineComicProject,
  pickLocalSaveDirectory,
  prepareRound,
  sendPrivateChat,
  submitManualNarration,
  streamCommitPreparedRound,
  streamCreateSession,
  streamOpeningPreview,
  streamSubmitTurn,
  upsertWorldlineComicPage,
  updateLocalSaveSettings,
  updateStoryControlMode
} from "./lib/trpgApiClient.ts";
import {
  exportComicHtml,
  exportCombinedStoryComicHtml,
  exportSaveBundleText
} from "./lib/saveExportPdf.ts";
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
import {
  getMenuFontScale,
  type AppView,
  type GameActivityLogEntry,
  type StatusState
} from "./ui.ts";

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
const DEFAULT_COMIC_STYLE_ID = "noir";

function resolveComicStyleId(
  styles: ComicStylePreset[],
  preferredStyleId: string | null | undefined
): string | undefined {
  const normalizedPreferredStyleId = preferredStyleId?.trim() ?? "";
  if (normalizedPreferredStyleId) {
    if (styles.length === 0) {
      return normalizedPreferredStyleId;
    }

    const matched = styles.find((style) => style.id === normalizedPreferredStyleId);
    if (matched) {
      return matched.id;
    }
  }

  return styles.find((style) => style.id === DEFAULT_COMIC_STYLE_ID)?.id ?? styles[0]?.id;
}

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

function normalizeEditableRuntimeModelConfig(
  input: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  } | undefined
): RoleTextModelConfigInput["runtimeModelConfig"] {
  return {
    apiKey: input?.apiKey?.trim() ?? "",
    baseUrl: input?.baseUrl?.trim() ?? "",
    model: input?.model?.trim() ?? ""
  };
}

function normalizeRoleTextModelConfigInput(
  input: RoleTextModelConfigInput | null | undefined
): RoleTextModelConfigInput | null {
  if (!input) {
    return null;
  }

  const modelProfileId = input.modelProfileId?.trim() ?? "";
  const runtimeModelConfig = normalizeRuntimeConfig(input.runtimeModelConfig);
  if (!modelProfileId && !runtimeModelConfig) {
    return null;
  }

  return {
    modelProfileId: modelProfileId || undefined,
    runtimeModelConfig
  };
}

function normalizeAdvancedTextModelConfigInput(
  input: AdvancedTextModelConfigInput | null | undefined
): AdvancedTextModelConfigInput | null {
  if (!input) {
    return null;
  }

  const narrator = normalizeRoleTextModelConfigInput(input.narrator);
  const primaryPlayer = normalizeRoleTextModelConfigInput(input.primaryPlayer);
  const companionOverrides = (input.companionOverrides ?? []).map((item) =>
    normalizeRoleTextModelConfigInput(item)
  );

  while (companionOverrides.length > 0 && !companionOverrides[companionOverrides.length - 1]) {
    companionOverrides.pop();
  }

  const hasCompanionOverride = companionOverrides.some(Boolean);
  if (!narrator && !primaryPlayer && !hasCompanionOverride) {
    return null;
  }

  return {
    narrator,
    primaryPlayer,
    companionOverrides
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
    personalityTagIds: [],
    appearanceTagIds: []
  };
}

function normalizeTagIdList(tagIds: string[] | undefined): string[] {
  return Array.from(
    new Set((tagIds ?? []).map((tagId) => tagId.trim()).filter((tagId) => tagId.length > 0))
  );
}

function normalizeAiCompanionInput(
  companion: CreateSessionAiCompanionInput
): CreateSessionAiCompanionInput {
  return {
    displayName: companion.displayName.trim(),
    personalityTagIds: normalizeTagIdList(companion.personalityTagIds),
    appearanceTagIds: normalizeTagIdList(companion.appearanceTagIds)
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

type WorldlineComicPlan = {
  worldlineId: string;
  pageIndex: number;
  roundStart: number;
  roundEnd: number;
  storyPrompt: string;
  storyMemorySummary?: string;
};

type PendingComicGenerationTask = {
  pageNumber: number;
  startedAt: number;
};

type RecordExportKind = "text" | "comic_html" | "combined_html";

function buildComicGenerationTaskKey(worldlineId: string, pageNumber: number): string {
  return `${worldlineId}:${pageNumber}`;
}

function inferMessageChannel(message: Message): Message["channel"] {
  if (message.channel) {
    return message.channel;
  }

  if (message.visibility === "system" || message.kind === "system") {
    return "system";
  }

  if (message.visibility === "private" || message.kind === "private_chat") {
    return "private_chat";
  }

  return "public_story";
}

function buildWorldlineComicMemorySummary(snapshot: SessionSnapshot): string | undefined {
  const latestEpisodes = (snapshot.memory?.episodeSummaries ?? []).slice(-2);
  const openLoops = (snapshot.memory?.openLoops ?? [])
    .filter((item) => item.status === "open")
    .slice(0, 3);

  const sections: string[] = [];

  if (latestEpisodes.length > 0) {
    sections.push(
      [
        "Recent episode summaries:",
        ...latestEpisodes.map((item) => `- ${item.title}: ${item.summary}`)
      ].join("\n")
    );
  }

  if (openLoops.length > 0) {
    sections.push(
      [
        "Open questions:",
        ...openLoops.map((item) => `- ${item.title}: ${item.summary}`)
      ].join("\n")
    );
  }

  const summary = sections.join("\n\n").trim();
  return summary || undefined;
}

function buildAppearanceSummaryFromTags(
  appearanceTags: Array<{ category: string; description: string }>
): string | undefined {
  const appearanceDetails = appearanceTags
    .filter((tag) => tag.category === "appearance")
    .map((tag) => tag.description.trim())
    .filter(Boolean);
  const outfitDetails = appearanceTags
    .filter((tag) => tag.category === "outfit")
    .map((tag) => tag.description.trim())
    .filter(Boolean);
  const sections: string[] = [];

  if (appearanceDetails.length > 0) {
    sections.push(`appearance: ${appearanceDetails.join("; ")}`);
  }

  if (outfitDetails.length > 0) {
    sections.push(`outfit: ${outfitDetails.join("; ")}`);
  }

  return sections.length > 0 ? sections.join("; ") : undefined;
}

function buildCompanionAppearanceSummary(companion: SessionAiCompanion): string | undefined {
  return buildAppearanceSummaryFromTags(companion.appearanceTags ?? []);
}

function buildWorldlineComicCharacterReferences(
  snapshot: SessionSnapshot
): ComicCharacterReferenceInput[] | undefined {
  const references: ComicCharacterReferenceInput[] = [];
  const primaryPlayerConfig = snapshot.session.partySetup?.primaryPlayerConfig;
  const primaryPlayerAppearance = buildAppearanceSummaryFromTags(
    primaryPlayerConfig?.appearanceTags ?? []
  );

  if (snapshot.session.partySetup?.primaryPlayerMode === "ai" && primaryPlayerAppearance) {
    const primaryPlayerName =
      snapshot.session.participants.find(
        (participant) => participant.id === snapshot.session.playerParticipantId
      )?.displayName ?? "";

    references.push({
      name: primaryPlayerName.trim() || undefined,
      appearance: primaryPlayerAppearance
    });
  }

  references.push(
    ...(snapshot.session.partySetup?.aiCompanions ?? [])
      .map((companion) => {
        const appearance = buildCompanionAppearanceSummary(companion);
        if (!appearance) {
          return null;
        }

        const name = companion.displayName.trim();
        return {
          name: name || undefined,
          appearance
        };
      })
      .filter((item): item is ComicCharacterReferenceInput => item !== null)
  );

  return references.length > 0 ? references : undefined;
}

function buildWorldlineComicStoryPrompt(
  snapshot: SessionSnapshot,
  roundStart: number,
  roundEnd: number
): string {
  const participantNames = new Map(
    snapshot.session.participants.map((participant) => [participant.id, participant.displayName])
  );
  const relevantMessages = snapshot.messages.filter((message) => {
    if (inferMessageChannel(message) !== "public_story") {
      return false;
    }

    if (message.round < roundStart || message.round > roundEnd) {
      return false;
    }

    return (
      message.kind === "player_input" ||
      message.kind === "gm_narration" ||
      message.kind === "gm_dialogue"
    );
  });

  const lines: string[] = [
    `Story: ${snapshot.contentSummary.storyTitle}`,
    `Rulebook: ${snapshot.contentSummary.ruleTitle}`,
    roundStart === 0
      ? "Adapt the opening plus the first completed round into one comic page."
      : `Adapt rounds ${roundStart} to ${roundEnd} into one comic page.`,
    ""
  ];

  for (const message of relevantMessages) {
    const speaker =
      message.kind === "player_input"
        ? participantNames.get(message.senderId) ?? "Player"
        : "Narrator";
    const roundLabel = message.round === 0 ? "Opening" : `Round ${message.round}`;
    lines.push(`[${roundLabel} | ${speaker}]`);
    lines.push(message.content.trim());
    lines.push("");
  }

  const endingState = snapshot.session.gameState.endingState;
  if (endingState && roundEnd === endingState.confirmedAtRound) {
    lines.push("[Ending]");
    lines.push(`${endingState.title}: ${endingState.summary}`);
  }

  return lines.join("\n").trim();
}

function buildWorldlineComicPlan(
  snapshot: SessionSnapshot,
  worldlineId: string | null | undefined
): WorldlineComicPlan | null {
  const normalizedWorldlineId = worldlineId?.trim() ?? "";
  if (!normalizedWorldlineId) {
    return null;
  }

  const currentRound = snapshot.session.currentRound;
  if (currentRound <= 0) {
    return null;
  }

  const endingRound = snapshot.session.gameState.endingState?.confirmedAtRound ?? null;
  const isEndingRound = endingRound !== null && endingRound === currentRound;

  let pageIndex: number | null = null;
  let roundStart = currentRound;

  if (currentRound === 1) {
    pageIndex = 0;
    roundStart = 0;
  } else if (isEndingRound) {
    pageIndex = 1 + Math.floor(Math.max(currentRound - 2, 0) / 3);
  } else if ((currentRound - 1) % 3 === 0) {
    pageIndex = 1 + Math.floor((currentRound - 4) / 3);
    roundStart = Math.max(2, currentRound - 2);
  }

  if (pageIndex === null) {
    return null;
  }

  const storyPrompt = buildWorldlineComicStoryPrompt(snapshot, roundStart, currentRound);
  if (!storyPrompt) {
    return null;
  }

  return {
    worldlineId: normalizedWorldlineId,
    pageIndex,
    roundStart,
    roundEnd: currentRound,
    storyPrompt,
    storyMemorySummary: buildWorldlineComicMemorySummary(snapshot)
  };
}

export function App() {
  const [view, setView] = useState<AppView>("menu");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [activeSessionRuntimeConfig, setActiveSessionRuntimeConfig] =
    useState<SaveRuntimeConfig | null>(null);
  const [status, setStatus] = useState<StatusState>(initialStatus);
  const [gameActivityLog, setGameActivityLog] = useState<GameActivityLogEntry[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isPreparingRound, setIsPreparingRound] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [isDismissingEnding, setIsDismissingEnding] = useState(false);
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
  const [activeRecordExport, setActiveRecordExport] = useState<{
    saveId: string;
    kind: RecordExportKind;
  } | null>(null);
  const [worldlineComicProject, setWorldlineComicProject] = useState<PersistedComicProject | null>(
    null
  );
  const [comicPromptPresets, setComicPromptPresets] = useState<ComicPromptPresetResponse | null>(
    null
  );
  const [comicPromptPresetsError, setComicPromptPresetsError] = useState<string | null>(null);
  const [comicPromptPresetsLoading, setComicPromptPresetsLoading] = useState(false);
  const [isComicLoading, setIsComicLoading] = useState(false);
  const [pendingComicGenerationTasks, setPendingComicGenerationTasks] = useState<
    PendingComicGenerationTask[]
  >([]);
  const [turnInput, setTurnInput] = useState("");
  const [characterConcept, setCharacterConcept] = useState("");
  const [storyModePrimaryPlayerConfig, setStoryModePrimaryPlayerConfig] =
    useState<CreateSessionAiCompanionInput>(buildEmptyAiCompanion());
  const [aiCompanions, setAiCompanions] = useState<CreateSessionAiCompanionInput[]>([]);
  const [advancedTextModelEnabled, setAdvancedTextModelEnabled] = useState(false);
  const [advancedTextModelConfig, setAdvancedTextModelConfig] =
    useState<AdvancedTextModelConfigInput | null>(null);
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
  const pendingComicGenerationKeysRef = useRef<Set<string>>(new Set());
  const comicGenerationTaskCount = pendingComicGenerationTasks.length;
  const isComicGenerating = comicGenerationTaskCount > 0;

  const {
    bootstrap,
    ruleDirectoryName,
    storyDirectoryName,
    uiLocale,
    locale,
    playMode,
    gmArchitecture,
    backgroundCompressionEnabled,
    modelAccessMode,
    modelProfileId,
    runtimeModelConfig,
    profileRuntimeConfigs,
    imageProfileId,
    runtimeImageModelConfig,
    imageProfileRuntimeConfigs,
    comicStyleId,
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
    setBackgroundCompressionEnabled,
    setModelAccessMode,
    setModelProfileId,
    setProfileRuntimeConfig,
    clearProfileRuntimeConfigs,
    setImageProfileId,
    setImageProfileRuntimeConfig,
    clearImageProfileRuntimeConfigs,
    setComicStyleId,
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
    refreshCurrentSnapshot,
    syncSavedBundle,
    relinkSnapshot,
    relinkSaveBundle,
    prepareResume
  } = usePlaythroughGraph();

  const recentSave = savedGames[0] ?? null;
  const availableTextProfiles =
    bootstrap?.modelProfiles.filter((profile) => profile.accessMode === modelAccessMode) ?? [];
  const availableTextProfileIds = availableTextProfiles
    .map((profile) => profile.id)
    .join("|");
  const normalizedAdvancedTextModelConfig = advancedTextModelEnabled
    ? normalizeAdvancedTextModelConfigInput(advancedTextModelConfig)
    : null;
  const normalizedStoryModePrimaryPlayerConfig = normalizeAiCompanionInput(
    storyModePrimaryPlayerConfig
  );
  const normalizedGlobalRuntimeModelConfig =
    normalizeEditableRuntimeModelConfig(runtimeModelConfig);
  const availableComicStyles = comicPromptPresets?.styles ?? [];
  const resolvedComicStyleId = resolveComicStyleId(availableComicStyles, comicStyleId);
  const effectiveNarratorSelection = {
    modelProfileId:
      normalizedAdvancedTextModelConfig?.narrator?.modelProfileId?.trim() || modelProfileId,
    runtimeModelConfig:
      normalizedAdvancedTextModelConfig?.narrator?.runtimeModelConfig
        ? normalizeEditableRuntimeModelConfig(
            normalizedAdvancedTextModelConfig.narrator.runtimeModelConfig
          )
        : normalizedGlobalRuntimeModelConfig
  };
  const previewModelReady = hasPreviewModelConfig(
    modelAccessMode,
    bootstrap,
    effectiveNarratorSelection.modelProfileId,
    effectiveNarratorSelection.runtimeModelConfig
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

  useEffect(() => {
    if (!bootstrap) {
      return;
    }

    let cancelled = false;
    setComicPromptPresetsLoading(true);
    setComicPromptPresetsError(null);

    async function loadComicPromptPresets(): Promise<void> {
      try {
        const nextPresets = await fetchComicPromptPresets();
        if (cancelled) {
          return;
        }

        setComicPromptPresets(nextPresets);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setComicPromptPresets(null);
        setComicPromptPresetsError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setComicPromptPresetsLoading(false);
        }
      }
    }

    void loadComicPromptPresets();
    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  useEffect(() => {
    if (!resolvedComicStyleId || resolvedComicStyleId === comicStyleId) {
      return;
    }

    setComicStyleId(resolvedComicStyleId);
  }, [comicStyleId, resolvedComicStyleId, setComicStyleId]);

  useEffect(() => {
    if (!snapshot) {
      setActiveSessionRuntimeConfig(null);
    }
  }, [snapshot]);

  useEffect(() => {
    setGameActivityLog([]);
  }, [snapshot?.session.id]);

  useEffect(() => {
    setAdvancedTextModelConfig((current) => {
      if (!current) {
        return current;
      }

      const nextCompanionOverrides = [...(current.companionOverrides ?? [])].slice(
        0,
        aiCompanions.length
      );
      while (nextCompanionOverrides.length < aiCompanions.length) {
        nextCompanionOverrides.push(null);
      }

      const nextConfig: AdvancedTextModelConfigInput = {
        ...current,
        companionOverrides: nextCompanionOverrides
      };
      const currentNormalized = normalizeAdvancedTextModelConfigInput(current);
      const nextNormalized = normalizeAdvancedTextModelConfigInput(nextConfig);
      return JSON.stringify(currentNormalized) === JSON.stringify(nextNormalized)
        ? current
        : nextConfig;
    });
  }, [aiCompanions.length]);

  useEffect(() => {
    if (!bootstrap || availableTextProfiles.length === 0) {
      return;
    }

    const fallbackProfileId =
      modelProfileId || availableTextProfiles[0]?.id || bootstrap.defaults.modelProfileId;

    setAdvancedTextModelConfig((current) => {
      if (!current) {
        return current;
      }

      const normalizeForAccessMode = (
        roleConfig: RoleTextModelConfigInput | null | undefined
      ): RoleTextModelConfigInput | null => {
        const normalizedRole = normalizeRoleTextModelConfigInput(roleConfig);
        if (!normalizedRole) {
          return null;
        }

        const normalizedProfileId =
          normalizedRole.modelProfileId === "deepseek"
            ? "deepseek-chat"
            : normalizedRole.modelProfileId;
        const resolvedProfileId =
          normalizedProfileId &&
          availableTextProfiles.some((profile) => profile.id === normalizedProfileId)
            ? normalizedProfileId
            : fallbackProfileId;

        return {
          ...normalizedRole,
          modelProfileId: resolvedProfileId
        };
      };

      const nextConfig: AdvancedTextModelConfigInput = {
        narrator: normalizeForAccessMode(current.narrator),
        primaryPlayer: normalizeForAccessMode(current.primaryPlayer),
        companionOverrides: (current.companionOverrides ?? []).map((item) =>
          normalizeForAccessMode(item)
        )
      };

      const currentNormalized = normalizeAdvancedTextModelConfigInput(current);
      const nextNormalized = normalizeAdvancedTextModelConfigInput(nextConfig);
      return JSON.stringify(currentNormalized) === JSON.stringify(nextNormalized)
        ? current
        : nextConfig;
    });
  }, [
    availableTextProfileIds,
    bootstrap,
    modelAccessMode,
    modelProfileId
  ]);

  useEffect(() => {
    if (view !== "game" || !status.message.trim()) {
      return;
    }

    appendGameActivity(status.message, status.tone);
  }, [status.message, status.tone, view]);

  function applyLocalSaveSettings(nextSettings: LocalSaveSettings): void {
    setLocalSaveSettings(nextSettings);
    setLocalSaveDirectoryInput(nextSettings.saveDirectory ?? "");
  }

  function appendGameActivity(
    message: string,
    tone: StatusState["tone"] = "neutral"
  ): void {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    setGameActivityLog((current) => {
      const lastEntry = current[current.length - 1] ?? null;
      if (lastEntry && lastEntry.message === trimmedMessage && lastEntry.tone === tone) {
        return current;
      }

      return [
        ...current,
        {
          id: createTemporaryId("game_log"),
          createdAt: new Date().toISOString(),
          message: trimmedMessage,
          tone
        }
      ].slice(-48);
    });
  }

  function appendReasonerTimeoutHintIfNeeded(
    currentSnapshot: SessionSnapshot,
    errorMessage: string
  ): void {
    if (
      currentSnapshot.session.settings.modelProfileId === "deepseek-reasoner" &&
      /timed out after/iu.test(errorMessage)
    ) {
      appendGameActivity(uiText.app.status.reasonerTimeoutHint, "error");
    }
  }

  function appendPrepareRoundLogs(currentSnapshot: SessionSnapshot, playerInput: string): void {
    const targetRound = currentSnapshot.session.currentRound + 1;
    const participantsById = new Map(
      currentSnapshot.session.participants.map((participant) => [participant.id, participant])
    );
    const primaryParticipant =
      participantsById.get(currentSnapshot.session.playerParticipantId) ?? null;
    const companionNames = (currentSnapshot.session.companionParticipantIds ?? [])
      .map((participantId) => participantsById.get(participantId)?.displayName ?? "")
      .filter(Boolean);

    appendGameActivity(uiText.app.status.prepareRoundLogStart(targetRound));

    if (primaryParticipant?.role === "ai_player") {
      appendGameActivity(uiText.app.status.prepareRoundLogPrimaryAi(primaryParticipant.displayName));
    } else {
      appendGameActivity(uiText.app.status.prepareRoundLogPrimaryHuman);
    }

    if (companionNames.length > 0) {
      appendGameActivity(
        uiText.app.status.prepareRoundLogCompanions(
          companionNames.length,
          companionNames.join("、")
        )
      );
    }

    appendGameActivity(uiText.app.status.prepareRoundLogWait);
  }

  function applyTurnResolutionStageStatus(event: {
    label: string;
    detail: string;
  }): void {
    const detail = event.detail.trim();
    const label = event.label.trim();
    setStatus({
      message: detail || label,
      tone: "neutral"
    });
  }

  function appendCommitRoundLogs(currentSnapshot: SessionSnapshot, draftCount: number): void {
    const targetRound = currentSnapshot.session.currentRound + 1;
    appendGameActivity(uiText.app.status.commitRoundLogStart(targetRound, draftCount));
    appendGameActivity(uiText.app.status.commitRoundLogWait);
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
      getGraphRuntimeConfig(snapshot, snapshot.session.settings.modelProfileId)
    );
  }, [
    activeGraphBundle,
    isBootstrappingSession,
    relinkSnapshot,
    snapshot,
    view
  ]);

  useEffect(() => {
    pendingComicGenerationKeysRef.current.clear();
    setPendingComicGenerationTasks([]);
  }, [activeGraphBundle?.graph.id, view]);

  useEffect(() => {
    const worldlineId = activeGraphBundle?.graph.id ?? null;
    if (view !== "game" || !worldlineId) {
      setWorldlineComicProject(null);
      setIsComicLoading(false);
      return;
    }

    let cancelled = false;
    setIsComicLoading(true);

    void refreshWorldlineComicProject(worldlineId)
      .then((project) => {
        if (!cancelled) {
          setWorldlineComicProject(project);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWorldlineComicProject(null);
          appendGameActivity(
            uiText.gameScreen.comicLoadFailed(
              error instanceof Error ? error.message : String(error)
            ),
            "error"
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsComicLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeGraphBundle?.graph.id, uiLocale, view]);

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
          backgroundCompressionEnabled,
          modelAccessMode,
          modelProfileId: effectiveNarratorSelection.modelProfileId,
          runtimeModelConfig: effectiveNarratorSelection.runtimeModelConfig,
          primaryPlayerDisplayName:
            playMode === "story_mode"
              ? normalizedStoryModePrimaryPlayerConfig.displayName || undefined
              : undefined,
          primaryPlayerPersonalityTagIds:
            playMode === "story_mode"
              ? normalizedStoryModePrimaryPlayerConfig.personalityTagIds
              : undefined,
          primaryPlayerAppearanceTagIds:
            playMode === "story_mode"
              ? normalizedStoryModePrimaryPlayerConfig.appearanceTagIds
              : undefined,
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
    backgroundCompressionEnabled,
    locale,
    logViewMode,
    openingPreviewDeliveryMode,
    openingPreviewRegenerateNonce,
    modelAccessMode,
    playMode,
    previewModelReady,
    ruleDirectoryName,
    effectiveNarratorSelection.modelProfileId,
    effectiveNarratorSelection.runtimeModelConfig.apiKey,
    effectiveNarratorSelection.runtimeModelConfig.baseUrl,
    effectiveNarratorSelection.runtimeModelConfig.model,
    normalizedStoryModePrimaryPlayerConfig.displayName,
    normalizedStoryModePrimaryPlayerConfig.personalityTagIds.join("|"),
    normalizedStoryModePrimaryPlayerConfig.appearanceTagIds.join("|"),
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
      appendGameActivity(
        uiText.app.status.commitRoundLogCountdown(AUTO_COMMIT_COUNTDOWN_SECONDS)
      );
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
    currentSnapshot?: SessionSnapshot | null,
    profileIdOverride?: string
  ): SaveRuntimeConfig {
    const normalizedConfig = normalizeAdvancedTextModelConfigInput(
      advancedTextModelEnabled ? advancedTextModelConfig : null
    );
    const roleModelConfigs: NonNullable<SaveRuntimeConfig["roleModelConfigs"]> = {};
    const participantRoleConfigs: NonNullable<
      NonNullable<SaveRuntimeConfig["roleModelConfigs"]>["participants"]
    > = {};

    if (normalizedConfig?.narrator) {
      roleModelConfigs.narrator = {
        modelProfileId: normalizedConfig.narrator.modelProfileId,
        runtimeModelConfig: normalizeRuntimeConfig(
          normalizedConfig.narrator.runtimeModelConfig
        )
      };
    }

    if (currentSnapshot && normalizedConfig?.primaryPlayer) {
      participantRoleConfigs[currentSnapshot.session.playerParticipantId] = {
        modelProfileId: normalizedConfig.primaryPlayer.modelProfileId,
        runtimeModelConfig: normalizeRuntimeConfig(
          normalizedConfig.primaryPlayer.runtimeModelConfig
        )
      };
    }

    if (currentSnapshot) {
      (currentSnapshot.session.companionParticipantIds ?? []).forEach(
        (participantId, index) => {
          const companionConfig = normalizedConfig?.companionOverrides?.[index];
          if (!companionConfig) {
            return;
          }

          participantRoleConfigs[participantId] = {
            modelProfileId: companionConfig.modelProfileId,
            runtimeModelConfig: normalizeRuntimeConfig(companionConfig.runtimeModelConfig)
          };
        }
      );
    }

    if (Object.keys(participantRoleConfigs).length > 0) {
      roleModelConfigs.participants = participantRoleConfigs;
    }

    return {
      modelProfileId: profileIdOverride ?? modelProfileId,
      runtimeModelConfig: normalizeRuntimeConfig(runtimeModelConfig),
      roleModelConfigs:
        roleModelConfigs.narrator || roleModelConfigs.participants
          ? roleModelConfigs
          : undefined
    };
  }

  function buildSnapshotFallbackRuntimeConfig(
    currentSnapshot?: SessionSnapshot | null,
    profileIdOverride?: string
  ): SaveRuntimeConfig {
    return {
      modelProfileId:
        profileIdOverride ??
        currentSnapshot?.session.settings.modelProfileId ??
        modelProfileId,
      runtimeModelConfig: currentSnapshot
        ? undefined
        : normalizeRuntimeConfig(runtimeModelConfig)
    };
  }

  function getGraphRuntimeConfig(
    currentSnapshot?: SessionSnapshot | null,
    profileIdOverride?: string
  ): SaveRuntimeConfig {
    return (
      activeSessionRuntimeConfig ??
      buildSnapshotFallbackRuntimeConfig(currentSnapshot, profileIdOverride)
    );
  }

  async function refreshWorldlineComicProject(
    worldlineId: string
  ): Promise<PersistedComicProject | null> {
    const normalizedWorldlineId = worldlineId.trim();
    if (!normalizedWorldlineId) {
      return null;
    }

    return loadWorldlineComicProject(normalizedWorldlineId);
  }

  function beginComicGenerationTask(worldlineId: string, pageNumber: number): boolean {
    const taskKey = buildComicGenerationTaskKey(worldlineId, pageNumber);
    if (pendingComicGenerationKeysRef.current.has(taskKey)) {
      return false;
    }

    pendingComicGenerationKeysRef.current.add(taskKey);
    setPendingComicGenerationTasks((current) => [
      ...current,
      {
        pageNumber,
        startedAt: Date.now()
      }
    ]);
    return true;
  }

  function finishComicGenerationTask(worldlineId: string, pageNumber: number): void {
    pendingComicGenerationKeysRef.current.delete(
      buildComicGenerationTaskKey(worldlineId, pageNumber)
    );
    setPendingComicGenerationTasks((current) => {
      const next = [...current];
      const index = next.findIndex((task) => task.pageNumber === pageNumber);
      if (index < 0) {
        return current;
      }

      next.splice(index, 1);
      return next;
    });
  }

  async function maybeGenerateWorldlineComic(
    nextSnapshot: SessionSnapshot,
    worldlineId: string | null | undefined
  ): Promise<void> {
    const plan = buildWorldlineComicPlan(nextSnapshot, worldlineId);
    if (!plan) {
      return;
    }

    const pageNumber = plan.pageIndex + 1;
    if (
      worldlineComicProject?.comicId === plan.worldlineId &&
      worldlineComicProject.pages.some((page) => page.pageNumber === pageNumber)
    ) {
      return;
    }

    if (!beginComicGenerationTask(plan.worldlineId, pageNumber)) {
      return;
    }

    appendGameActivity(uiText.gameScreen.comicGenerationStart(pageNumber));

    try {
      const result = await upsertWorldlineComicPage(plan.worldlineId, {
        storyTitle: nextSnapshot.contentSummary.storyTitle,
        ruleTitle: nextSnapshot.contentSummary.ruleTitle,
        locale: nextSnapshot.contentSummary.resolvedLocale,
        pageIndex: plan.pageIndex,
        storyPrompt: plan.storyPrompt,
        styleId: resolvedComicStyleId,
        storyMemorySummary: plan.storyMemorySummary,
        characterReferences: buildWorldlineComicCharacterReferences(nextSnapshot),
        imageProfileId,
        runtimeImageModelConfig
      });

      setWorldlineComicProject(result.project);
      appendGameActivity(
        result.created
          ? uiText.gameScreen.comicGenerationDone(pageNumber)
          : uiText.gameScreen.comicAlreadyExists(pageNumber)
      );
    } catch (error) {
      appendGameActivity(
        uiText.gameScreen.comicGenerationFailed(
          error instanceof Error ? error.message : String(error)
        ),
        "error"
      );
    } finally {
      finishComicGenerationTask(plan.worldlineId, pageNumber);
    }
  }

  function updateAdvancedTextModelConfig(
    updater: (current: AdvancedTextModelConfigInput | null) => AdvancedTextModelConfigInput | null
  ): void {
    setAdvancedTextModelConfig((current) => {
      const next = updater(current);
      return normalizeAdvancedTextModelConfigInput(next);
    });
  }

  function handleAdvancedNarratorTextModelConfigChange(
    value: RoleTextModelConfigInput | null
  ): void {
    updateAdvancedTextModelConfig((current) => ({
      ...(current ?? {}),
      narrator: value ? normalizeRoleTextModelConfigInput(value) : null,
      companionOverrides: [...(current?.companionOverrides ?? [])]
    }));
  }

  function handleAdvancedPrimaryPlayerTextModelConfigChange(
    value: RoleTextModelConfigInput | null
  ): void {
    updateAdvancedTextModelConfig((current) => ({
      ...(current ?? {}),
      primaryPlayer: value ? normalizeRoleTextModelConfigInput(value) : null,
      companionOverrides: [...(current?.companionOverrides ?? [])]
    }));
  }

  function handleAdvancedCompanionTextModelConfigChange(
    index: number,
    value: RoleTextModelConfigInput | null
  ): void {
    updateAdvancedTextModelConfig((current) => {
      const nextCompanionOverrides = [...(current?.companionOverrides ?? [])];
      while (nextCompanionOverrides.length <= index) {
        nextCompanionOverrides.push(null);
      }

      nextCompanionOverrides[index] = value ? normalizeRoleTextModelConfigInput(value) : null;

      return {
        ...(current ?? {}),
        companionOverrides: nextCompanionOverrides
      };
    });
  }

  function saveDefaults(): void {
    storeWebDefaults({
      uiLocale,
      locale,
      playMode,
      gmArchitecture,
      backgroundCompressionEnabled,
      modelAccessMode,
      modelProfileId,
      runtimeModelConfig,
      profileRuntimeConfigs,
      imageProfileId,
      runtimeImageModelConfig,
      imageProfileRuntimeConfigs,
      comicStyleId: resolvedComicStyleId ?? comicStyleId,
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
      backgroundCompressionEnabled,
      modelAccessMode,
      modelProfileId,
      runtimeModelConfig,
      profileRuntimeConfigs,
      imageProfileId,
      runtimeImageModelConfig,
      imageProfileRuntimeConfigs,
      comicStyleId: resolvedComicStyleId ?? comicStyleId,
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

  function handleAddAiCompanionFromPreset(companion: CreateSessionAiCompanionInput): void {
    const normalizedCompanion = normalizeAiCompanionInput(companion);

    setAiCompanions((current) =>
      current.length >= 3
        ? current
        : [...current, normalizedCompanion]
    );
  }

  function handleApplyStoryModePrimaryPlayerPreset(
    companion: CreateSessionAiCompanionInput
  ): void {
    const normalizedCompanion = normalizeAiCompanionInput(companion);

    setStoryModePrimaryPlayerConfig((current) => ({
      ...current,
      displayName:
        current.displayName.trim().length > 0
          ? current.displayName
          : normalizedCompanion.displayName,
      personalityTagIds: normalizedCompanion.personalityTagIds,
      appearanceTagIds: normalizedCompanion.appearanceTagIds
    }));
  }

  function handleUpdateStoryModePrimaryPlayerName(displayName: string): void {
    setStoryModePrimaryPlayerConfig((current) => ({
      ...current,
      displayName
    }));
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

  function handleToggleAiCompanionAppearanceTag(
    index: number,
    appearanceTagId: string
  ): void {
    setAiCompanions((current) =>
      current.map((companion, itemIndex) => {
        if (itemIndex !== index) {
          return companion;
        }

        const currentAppearanceTagIds = companion.appearanceTagIds ?? [];
        const hasTag = currentAppearanceTagIds.includes(appearanceTagId);
        return {
          ...companion,
          appearanceTagIds: hasTag
            ? currentAppearanceTagIds.filter((tagId) => tagId !== appearanceTagId)
            : [...currentAppearanceTagIds, appearanceTagId]
        };
      })
    );
  }

  function handleToggleStoryModePrimaryPlayerPersonalityTag(
    personalityTagId: string
  ): void {
    setStoryModePrimaryPlayerConfig((current) => {
      const hasTag = current.personalityTagIds.includes(personalityTagId);
      return {
        ...current,
        personalityTagIds: hasTag
          ? current.personalityTagIds.filter((tagId) => tagId !== personalityTagId)
          : [...current.personalityTagIds, personalityTagId]
      };
    });
  }

  function handleToggleStoryModePrimaryPlayerAppearanceTag(
    appearanceTagId: string
  ): void {
    setStoryModePrimaryPlayerConfig((current) => {
      const currentAppearanceTagIds = current.appearanceTagIds ?? [];
      const hasTag = currentAppearanceTagIds.includes(appearanceTagId);
      return {
        ...current,
        appearanceTagIds: hasTag
          ? currentAppearanceTagIds.filter((tagId) => tagId !== appearanceTagId)
          : [...currentAppearanceTagIds, appearanceTagId]
      };
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
          backgroundCompressionEnabled,
          debugEnabled,
          promptDebugEnabled: false,
          modelProfileId: effectiveNarratorSelection.modelProfileId
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
    appendPrepareRoundLogs(currentSnapshot, playerInput);
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
      appendGameActivity(
        uiText.app.status.prepareRoundLogDone(
          nextSnapshot.session.gameState.roundInputState?.drafts.length ?? 0
        )
      );
      setStatus({
        message: options?.successMessage ?? uiText.app.status.roundDraftsReady,
        tone: "neutral"
      });
      return nextSnapshot;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      appendGameActivity(uiText.app.status.prepareRoundLogFailed(errorMessage), "error");
      appendReasonerTimeoutHintIfNeeded(currentSnapshot, errorMessage);
      setStatus({
        message: errorMessage,
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
    const primaryInputOverride = options?.primaryInputOverride ?? turnInput;
    appendCommitRoundLogs(
      currentSnapshot,
      currentSnapshot.session.gameState.roundInputState?.drafts.length ?? 0
    );
    setStatus({
      message: options?.pendingMessage ?? uiText.app.status.submitTurnPending,
      tone: "neutral"
    });

    try {
      const capturePreview = buildPreparedTurnCapturePreview(currentSnapshot, primaryInputOverride);
      const nextSnapshot = await streamCommitPreparedRound(
        currentSnapshot.session.id,
        {
          playerInput: primaryInputOverride?.trim() || undefined
        },
        {
          onStage: (event) => {
            applyTurnResolutionStageStatus(event);
          }
        }
      );
      commitSnapshot(nextSnapshot);
      const nextGraphBundle = captureTurn(
        nextSnapshot,
        getGraphRuntimeConfig(nextSnapshot, nextSnapshot.session.settings.modelProfileId),
        capturePreview
      );
      setTurnInput("");
      void maybeGenerateWorldlineComic(
        nextSnapshot,
        nextGraphBundle?.graph.id ?? activeGraphBundle?.graph.id ?? null
      );
      appendGameActivity(uiText.app.status.commitRoundLogDone(nextSnapshot.session.currentRound));
      setStatus({
        message:
          nextSnapshot.session.status === "ended"
            ? options?.endingSuccessMessage ?? uiText.app.status.turnCompleteEnded
            : options?.successMessage ?? uiText.app.status.turnComplete,
        tone: "neutral"
      });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      appendGameActivity(uiText.app.status.commitRoundLogFailed(errorMessage), "error");
      appendReasonerTimeoutHintIfNeeded(currentSnapshot, errorMessage);
      setStatus({
        message: errorMessage,
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
      const nextSnapshot = await streamSubmitTurn(
        currentSnapshot.session.id,
        {
          playerInput
        },
        {
          onStage: (event) => {
            applyTurnResolutionStageStatus(event);
          }
        }
      );
      commitSnapshot(nextSnapshot);
      const nextGraphBundle = captureTurn(
        nextSnapshot,
        getGraphRuntimeConfig(nextSnapshot, nextSnapshot.session.settings.modelProfileId),
        playerInput
      );
      setTurnInput("");
      void maybeGenerateWorldlineComic(
        nextSnapshot,
        nextGraphBundle?.graph.id ?? activeGraphBundle?.graph.id ?? null
      );
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      appendReasonerTimeoutHintIfNeeded(currentSnapshot, errorMessage);
      setStatus({
        message: errorMessage,
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

  async function handleDismissEnding(): Promise<void> {
    if (!snapshot) {
      setStatus({
        message: uiText.app.status.startGameFirst,
        tone: "error"
      });
      return;
    }

    if (!snapshot.session.gameState.endingState) {
      setStatus({
        message: uiText.app.status.dismissEndingUnavailable,
        tone: "error"
      });
      return;
    }

    setIsDismissingEnding(true);
    setStatus({
      message: uiText.app.status.dismissEndingPending,
      tone: "neutral"
    });

    try {
      const nextSnapshot = await dismissEnding(snapshot.session.id);
      commitSnapshot(nextSnapshot);
      refreshCurrentSnapshot(
        nextSnapshot,
        getGraphRuntimeConfig(nextSnapshot, nextSnapshot.session.settings.modelProfileId)
      );
      setStatus({
        message: uiText.app.status.dismissEndingSuccess,
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsDismissingEnding(false);
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
      .map(normalizeAiCompanionInput)
      .filter(
        (companion) =>
          companion.displayName.length > 0 ||
          companion.personalityTagIds.length > 0 ||
          companion.appearanceTagIds.length > 0
      );

    setIsCreating(true);
    setIsBootstrappingSession(true);
    setIsOpeningRevealInProgress(false);
    setActiveSessionRuntimeConfig(null);
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
          backgroundCompressionEnabled,
          modelAccessMode,
          characterConcept,
          modelProfileId,
          runtimeModelConfig,
          advancedTextModelConfig: normalizedAdvancedTextModelConfig ?? undefined,
          primaryPlayerDisplayName:
            playMode === "story_mode"
              ? normalizedStoryModePrimaryPlayerConfig.displayName || undefined
              : undefined,
          primaryPlayerPersonalityTagIds:
            playMode === "story_mode"
              ? normalizedStoryModePrimaryPlayerConfig.personalityTagIds
              : undefined,
          primaryPlayerAppearanceTagIds:
            playMode === "story_mode"
              ? normalizedStoryModePrimaryPlayerConfig.appearanceTagIds
              : undefined,
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
      const createdRuntimeConfig = buildSaveRuntimeConfig(
        nextSnapshot,
        modelProfileId
      );
      setActiveSessionRuntimeConfig(createdRuntimeConfig);
      beginFromSnapshot(
        nextSnapshot,
        createdRuntimeConfig
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
      setActiveSessionRuntimeConfig(null);
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
        getGraphRuntimeConfig(nextSnapshot, nextSnapshot.session.settings.modelProfileId),
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
      const result = await createSave(snapshot.session.id, {
        worldlineId: activeGraphBundle?.graph.id ?? null
      });
      commitSnapshot(result.snapshot);
      commitSaveRecord(result.saveRecord);
      syncSavedBundle(result.saveBundle);
      setActiveSessionRuntimeConfig(result.saveBundle.runtimeConfig ?? activeSessionRuntimeConfig);
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
      setActiveSessionRuntimeConfig(
        saveBundle.runtimeConfig ??
          buildSnapshotFallbackRuntimeConfig(
            nextSnapshot,
            nextSnapshot.session.settings.modelProfileId
          )
      );
      relinkSaveBundle(
        saveBundle,
        nextSnapshot,
        saveBundle.runtimeConfig ??
          buildSnapshotFallbackRuntimeConfig(
            nextSnapshot,
            nextSnapshot.session.settings.modelProfileId
          )
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
      const restoredRuntimeConfig = buildSnapshotFallbackRuntimeConfig(
        nextSnapshot,
        nextSnapshot.session.settings.modelProfileId
      );
      commitSnapshot(nextSnapshot);
      setTurnInput(getPreparedPrimaryDraft(nextSnapshot)?.content ?? "");
      setActiveSessionRuntimeConfig(restoredRuntimeConfig);
      relinkSnapshot(
        nextSnapshot,
        restoredRuntimeConfig,
        recentSave.worldlineId ?? undefined
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
      const restoredRuntimeConfig = buildSnapshotFallbackRuntimeConfig(
        nextSnapshot,
        nextSnapshot.session.settings.modelProfileId
      );
      commitSnapshot(nextSnapshot);
      setTurnInput(getPreparedPrimaryDraft(nextSnapshot)?.content ?? "");
      setActiveSessionRuntimeConfig(restoredRuntimeConfig);
      relinkSnapshot(
        nextSnapshot,
        restoredRuntimeConfig
      );
      setView("game");
      setStatus({
        message: uiText.app.status.latestSessionSynced,
        tone: "neutral"
      });
    } catch {
      const restoredRuntimeConfig = buildSnapshotFallbackRuntimeConfig(
        recentSnapshot,
        recentSnapshot.session.settings.modelProfileId
      );
      commitSnapshot(recentSnapshot);
      setTurnInput(getPreparedPrimaryDraft(recentSnapshot)?.content ?? "");
      setActiveSessionRuntimeConfig(restoredRuntimeConfig);
      relinkSnapshot(
        recentSnapshot,
        restoredRuntimeConfig
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
      const restoredRuntimeConfig = buildSnapshotFallbackRuntimeConfig(
        nextSnapshot,
        nextSnapshot.session.settings.modelProfileId
      );
      commitSnapshot(nextSnapshot);
      setTurnInput(getPreparedPrimaryDraft(nextSnapshot)?.content ?? "");
      setActiveSessionRuntimeConfig(restoredRuntimeConfig);
      relinkSnapshot(
        nextSnapshot,
        restoredRuntimeConfig,
        record.worldlineId ?? undefined
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
      setActiveSessionRuntimeConfig(
        prepared.saveBundle.runtimeConfig ??
          buildSnapshotFallbackRuntimeConfig(
            nextSnapshot,
            nextSnapshot.session.settings.modelProfileId
          )
      );
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
    setBackgroundCompressionEnabled(bootstrap.defaults.backgroundCompressionEnabled);
    setModelAccessMode(bootstrap.defaults.modelAccessMode);
    setModelProfileId(bootstrap.defaults.modelProfileId);
    clearProfileRuntimeConfigs();
    setImageProfileId(bootstrap.defaults.imageProfileId);
    clearImageProfileRuntimeConfigs();
    setComicStyleId(resolveComicStyleId(availableComicStyles, undefined) ?? "");
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

  async function withRecordExport(
    record: SavedGameRecord,
    kind: RecordExportKind,
    work: (saveBundle: SaveBundle, comicProject: PersistedComicProject | null) => Promise<void>
  ): Promise<void> {
    setActiveRecordExport({
      saveId: record.saveId,
      kind
    });

    const pendingStatus =
      kind === "text"
        ? uiText.app.status.exportingSaveAsText
        : kind === "comic_html"
          ? uiText.app.status.exportingComicHtml
          : uiText.app.status.exportingCombinedHtml;
    const successStatus =
      kind === "text"
        ? uiText.app.status.exportedSaveAsText
        : kind === "comic_html"
          ? uiText.app.status.exportedComicHtml
          : uiText.app.status.exportedCombinedHtml;

    setStatus({
      message: pendingStatus,
      tone: "neutral"
    });

    try {
      const saveBundle = await fetchSaveBundle(record.saveId);
      const worldlineId = record.worldlineId?.trim() ?? "";
      const comicProject = worldlineId ? await loadWorldlineComicProject(worldlineId) : null;
      await work(saveBundle, comicProject);
      setStatus({
        message: successStatus,
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setActiveRecordExport(null);
    }
  }

  async function handleExportSaveText(record: SavedGameRecord): Promise<void> {
    await withRecordExport(record, "text", async (saveBundle) => {
      exportSaveBundleText(record, saveBundle);
    });
  }

  async function handleExportComicHtml(record: SavedGameRecord): Promise<void> {
    if (!record.worldlineId?.trim()) {
      setStatus({
        message: uiText.app.status.noWorldlineComicForSave,
        tone: "error"
      });
      return;
    }

    await withRecordExport(record, "comic_html", async (saveBundle, comicProject) => {
      if (!comicProject || comicProject.pages.length === 0) {
        throw new Error(uiText.app.status.noComicPagesToExport);
      }

      await exportComicHtml(record, saveBundle, comicProject);
    });
  }

  async function handleExportCombinedHtml(record: SavedGameRecord): Promise<void> {
    if (!record.worldlineId?.trim()) {
      setStatus({
        message: uiText.app.status.noWorldlineComicForSave,
        tone: "error"
      });
      return;
    }

    await withRecordExport(record, "combined_html", async (saveBundle, comicProject) => {
      if (!comicProject || comicProject.pages.length === 0) {
        throw new Error(uiText.app.status.noComicPagesToExport);
      }

      await exportCombinedStoryComicHtml(record, saveBundle, comicProject);
    });
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
    setStoryModePrimaryPlayerConfig(buildEmptyAiCompanion());
    setAiCompanions([]);
    setActiveSessionRuntimeConfig(null);
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
        backgroundCompressionEnabled,
        modelAccessMode,
        modelProfileId: effectiveNarratorSelection.modelProfileId,
        runtimeModelConfig: effectiveNarratorSelection.runtimeModelConfig,
        primaryPlayerDisplayName:
          playMode === "story_mode"
            ? normalizedStoryModePrimaryPlayerConfig.displayName || undefined
            : undefined,
        primaryPlayerPersonalityTagIds:
          playMode === "story_mode"
            ? normalizedStoryModePrimaryPlayerConfig.personalityTagIds
            : undefined,
        primaryPlayerAppearanceTagIds:
          playMode === "story_mode"
            ? normalizedStoryModePrimaryPlayerConfig.appearanceTagIds
            : undefined,
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
          backgroundCompressionEnabled={backgroundCompressionEnabled}
          modelAccessMode={modelAccessMode}
          modelProfileId={modelProfileId}
          runtimeModelConfig={runtimeModelConfig}
          advancedTextModelEnabled={advancedTextModelEnabled}
          advancedTextModelConfig={advancedTextModelConfig}
          imageProfileId={imageProfileId}
          runtimeImageModelConfig={runtimeImageModelConfig}
          comicStyleId={resolvedComicStyleId ?? comicStyleId}
          comicStyles={availableComicStyles}
          comicStylesLoading={comicPromptPresetsLoading}
          comicStylesError={comicPromptPresetsError}
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
          onBackgroundCompressionEnabledChange={setBackgroundCompressionEnabled}
          onModelAccessModeChange={setModelAccessMode}
          onModelProfileIdChange={setModelProfileId}
          onAdvancedTextModelEnabledChange={setAdvancedTextModelEnabled}
          onAdvancedNarratorTextModelConfigChange={
            handleAdvancedNarratorTextModelConfigChange
          }
          onAdvancedPrimaryPlayerTextModelConfigChange={
            handleAdvancedPrimaryPlayerTextModelConfigChange
          }
          onAdvancedCompanionTextModelConfigChange={
            handleAdvancedCompanionTextModelConfigChange
          }
          onImageProfileIdChange={setImageProfileId}
          onImageProfileRuntimeConfigChange={setImageProfileRuntimeConfig}
          onComicStyleIdChange={setComicStyleId}
          onDebugEnabledChange={setDebugEnabled}
          onLogViewModeChange={setLogViewMode}
          onRegenerateOpeningPreview={handleRegenerateOpeningPreview}
          onAssistCharacterConcept={handleAssistCharacterConcept}
          onOpeningPreviewDeliveryModeChange={setOpeningPreviewDeliveryMode}
          onMarkdownFontSizeChange={setMarkdownFontSize}
          onCharacterConceptChange={setCharacterConcept}
          primaryPlayerDisplayName={storyModePrimaryPlayerConfig.displayName}
          primaryPlayerPersonalityTagIds={
            normalizedStoryModePrimaryPlayerConfig.personalityTagIds
          }
          primaryPlayerAppearanceTagIds={
            normalizedStoryModePrimaryPlayerConfig.appearanceTagIds
          }
          onUpdatePrimaryPlayerName={handleUpdateStoryModePrimaryPlayerName}
          onApplyPrimaryPlayerFromPreset={handleApplyStoryModePrimaryPlayerPreset}
          onTogglePrimaryPlayerPersonalityTag={
            handleToggleStoryModePrimaryPlayerPersonalityTag
          }
          onTogglePrimaryPlayerAppearanceTag={
            handleToggleStoryModePrimaryPlayerAppearanceTag
          }
          onAddAiCompanion={handleAddAiCompanion}
          onAddAiCompanionFromPreset={handleAddAiCompanionFromPreset}
          onRemoveAiCompanion={handleRemoveAiCompanion}
          onUpdateAiCompanionName={handleUpdateAiCompanionName}
          onToggleAiCompanionPersonalityTag={handleToggleAiCompanionPersonalityTag}
          onToggleAiCompanionAppearanceTag={handleToggleAiCompanionAppearanceTag}
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
          activeExport={activeRecordExport}
          onBack={() => setView("menu")}
          onClearSavedGames={handleClearSavedGames}
          onDeleteSavedGame={handleDeleteSavedGame}
          onExportComicHtml={handleExportComicHtml}
          onExportCombinedHtml={handleExportCombinedHtml}
          onExportSaveText={handleExportSaveText}
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
          status={status}
          activityLog={gameActivityLog}
          turnInput={turnInput}
          isBootstrappingSession={isBootstrappingSession}
          isOpeningRevealInProgress={isOpeningRevealInProgress}
          sessionBootstrapState={sessionBootstrapState}
          isPreparingRound={isPreparingRound}
          isSubmittingTurn={isSubmittingTurn}
          isDismissingEnding={isDismissingEnding}
          isInjectingManualNarration={isInjectingManualNarration}
          isSendingPrivateChat={isSendingPrivateChat}
          isUpdatingStoryControl={isUpdatingStoryControl}
          autoCommitCountdown={autoCommitCountdown}
          isSaving={isSaving}
          savedGames={savedGames}
          comicProject={worldlineComicProject}
          isComicLoading={isComicLoading}
          comicGenerationTaskCount={comicGenerationTaskCount}
          pendingComicGenerationTasks={pendingComicGenerationTasks}
          isRestoring={isRestoring}
          isResumingBranch={isResumingBranch}
          showAiMetadata={showAiMetadata}
          markdownFontSize={markdownFontSize}
          storyControlMode={storyControlMode}
          imageProfileId={imageProfileId}
          runtimeImageModelConfig={runtimeImageModelConfig}
          comicStyleId={resolvedComicStyleId ?? comicStyleId}
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
          onDismissEnding={handleDismissEnding}
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
        {status.message && view !== "game_bootstrap" && view !== "game" ? (
          <p className={`status-line ${status.tone === "error" ? "status-error" : ""}`}>
            {status.message}
          </p>
        ) : null}
      </main>
    </UiTextProvider>
  );
}
