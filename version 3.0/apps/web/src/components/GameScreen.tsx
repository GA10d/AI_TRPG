import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

import type {
  AiGenerationMetadata,
  ImageGenerationResponse,
  ImagePromptTemplateConfig,
  Message,
  NpcRosterEntry,
  PersistedComicProject,
  PlaythroughGraphBundle,
  RoundDraft,
  RuntimeImageModelConfigInput,
  SessionMemory,
  SessionSnapshot,
  SessionRuntimeContextPack,
  StoryControlMode
} from "../../../../packages/shared-types/src/index.ts";
import {
  fetchNpcRoster,
  fetchSessionContextPack,
  fetchSessionMemory,
  generateSceneImage,
  rebuildSessionMemory
} from "../lib/trpgApiClient.ts";
import { useUiText } from "../locales/index.tsx";
import type { SavedGameRecord } from "../storage.ts";
import {
  formatAiGenerationMeta,
  formatDateTime,
  type GameActivityLogEntry,
  type MarkdownFontSizePreset,
  type StatusState
} from "../ui.ts";
import { MarkdownBlock } from "./MarkdownBlock.tsx";
import { PlaythroughGraphPanel } from "./PlaythroughGraphPanel.tsx";

type SessionBootstrapStepStatus = "pending" | "active" | "completed";

type SessionBootstrapPanelState = {
  coverAssetUrl: string | null;
  loadingHint: string;
  progress: number;
  activeLabel: string;
  activeDetail: string;
  steps: Array<{
    stage: string;
    label: string;
    detail: string;
    status: SessionBootstrapStepStatus;
  }>;
};

type PendingComicGenerationTask = {
  pageNumber: number;
  startedAt: number;
};

type GameScreenProps = {
  snapshot: SessionSnapshot | null;
  activeGraphBundle: PlaythroughGraphBundle | null;
  status: StatusState;
  activityLog: GameActivityLogEntry[];
  turnInput: string;
  isBootstrappingSession: boolean;
  isOpeningRevealInProgress: boolean;
  sessionBootstrapState: SessionBootstrapPanelState | null;
  isPreparingRound: boolean;
  isSubmittingTurn: boolean;
  isInjectingManualNarration: boolean;
  isSendingPrivateChat: boolean;
  isUpdatingStoryControl: boolean;
  autoCommitCountdown: number | null;
  isSaving: boolean;
  isRestoring: boolean;
  isResumingBranch: boolean;
  savedGames: SavedGameRecord[];
  comicProject: PersistedComicProject | null;
  isComicLoading: boolean;
  comicGenerationTaskCount: number;
  pendingComicGenerationTasks: PendingComicGenerationTask[];
  showAiMetadata: boolean;
  markdownFontSize: MarkdownFontSizePreset;
  storyControlMode: StoryControlMode | null;
  imageProfileId: string;
  runtimeImageModelConfig: RuntimeImageModelConfigInput;
  imagePromptTemplateConfig: ImagePromptTemplateConfig | null;
  onBack: () => void;
  onContinueFromNode: (nodeId: string) => Promise<void>;
  onLoadSavedGame: (record: SavedGameRecord) => Promise<void>;
  onQuickEndingTest: () => Promise<void>;
  onSubmitManualNarration: (narrationText: string) => Promise<boolean>;
  onSaveGame: () => Promise<void>;
  onSendPrivateChat: (targetParticipantId: string, content: string) => Promise<boolean>;
  onStoryControlModeChange: (mode: StoryControlMode) => Promise<void>;
  onTurnInputChange: (value: string) => void;
  onOpenSettlement: () => void;
  onSubmitTurn: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

type SidePanelMode = "history" | "round" | "comics" | "worldline" | "judge" | "reasoning";

type GameDrawer = "none" | "saves" | "npcs" | "details" | "private_chat";

type ReasoningRecord = {
  id: string;
  round: number;
  actorName: string;
  roundLabel: string;
  statusLabel: string;
  output: string;
  reasoningContent: string;
  createdAt: string | null;
  aiMetadata: AiGenerationMetadata;
};

function clampPanelSize(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatElapsedDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
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

function hasReasoningContent(
  meta: AiGenerationMetadata | null | undefined
): meta is AiGenerationMetadata & { reasoningContent: string } {
  return typeof meta?.reasoningContent === "string" && meta.reasoningContent.trim().length > 0;
}

function isNarrationMessage(message: Message): boolean {
  return message.kind === "gm_narration" || message.kind === "gm_dialogue";
}

function buildPrivateChatThreadId(
  localHumanParticipantId: string,
  targetParticipantId: string
): string {
  return ["private_chat", localHumanParticipantId, targetParticipantId].join(":");
}

function buildReasoningDraftRecord(
  draft: RoundDraft,
  reasoningMeta: AiGenerationMetadata & { reasoningContent: string },
  roundInputState: SessionSnapshot["session"]["gameState"]["roundInputState"] | null,
  fallbackRound: number,
  text: ReturnType<typeof useUiText>
): ReasoningRecord {
  const round = roundInputState?.round ?? fallbackRound;
  return {
    id: `draft:${draft.participantId}:${draft.generatedAt ?? roundInputState?.preparedAt ?? ""}`,
    round,
    actorName: draft.displayName,
    roundLabel: text.gameScreen.participantRound(draft.displayName, round),
    statusLabel: draft.isPrimary
      ? text.gameScreen.reasoningPrimaryDraftLabel
      : text.gameScreen.reasoningCompanionDraftLabel,
    output: draft.content,
    reasoningContent: reasoningMeta.reasoningContent.trim(),
    createdAt: draft.generatedAt ?? roundInputState?.preparedAt ?? null,
    aiMetadata: reasoningMeta
  };
}

export function GameScreen(props: GameScreenProps) {
  const {
    snapshot,
    activeGraphBundle,
    status,
    activityLog,
    turnInput,
    isBootstrappingSession,
    isOpeningRevealInProgress,
    sessionBootstrapState,
    isPreparingRound,
    isSubmittingTurn,
    isInjectingManualNarration,
    isSendingPrivateChat,
    isUpdatingStoryControl,
    autoCommitCountdown,
    isSaving,
    isRestoring,
    isResumingBranch,
    savedGames,
    comicProject,
    isComicLoading,
    comicGenerationTaskCount,
    pendingComicGenerationTasks,
    showAiMetadata,
    markdownFontSize,
    storyControlMode,
    imageProfileId,
    runtimeImageModelConfig,
    imagePromptTemplateConfig,
    onBack,
    onContinueFromNode,
    onLoadSavedGame,
    onQuickEndingTest,
    onSubmitManualNarration,
    onSaveGame,
    onSendPrivateChat,
    onStoryControlModeChange,
    onTurnInputChange,
    onOpenSettlement,
    onSubmitTurn
  } = props;
  const text = useUiText();

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<GameDrawer>("none");
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>("history");
  const [sidePanelWidth, setSidePanelWidth] = useState(420);
  const [composerHeight, setComposerHeight] = useState(240);
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [npcRoster, setNpcRoster] = useState<NpcRosterEntry[]>([]);
  const [npcLoading, setNpcLoading] = useState(false);
  const [npcError, setNpcError] = useState<string | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [selectedPrivateChatTargetId, setSelectedPrivateChatTargetId] = useState<string | null>(null);
  const [privateChatDrafts, setPrivateChatDrafts] = useState<Record<string, string>>({});
  const [manualNarrationDraft, setManualNarrationDraft] = useState("");
  const [comicLightboxPageNumber, setComicLightboxPageNumber] = useState<number | null>(null);
  const [generatedPortraits, setGeneratedPortraits] = useState<
    Record<string, ImageGenerationResponse>
  >({});
  const [generatingNpcId, setGeneratingNpcId] = useState<string | null>(null);
  const [debugMemory, setDebugMemory] = useState<SessionMemory | null>(null);
  const [debugNarratorContextPack, setDebugNarratorContextPack] = useState<SessionRuntimeContextPack | null>(null);
  const [debugCompanionContextPack, setDebugCompanionContextPack] = useState<SessionRuntimeContextPack | null>(null);
  const [debugMemoryLoading, setDebugMemoryLoading] = useState(false);
  const [debugMemoryError, setDebugMemoryError] = useState<string | null>(null);
  const [isRebuildingMemory, setIsRebuildingMemory] = useState(false);
  const [activityStageStartedAt, setActivityStageStartedAt] = useState<number | null>(null);
  const [activityStageNow, setActivityStageNow] = useState(() => Date.now());

  const actionLocked = isBootstrappingSession || isOpeningRevealInProgress;
  const publicStoryMessages =
    snapshot?.messages.filter((message) => inferMessageChannel(message) === "public_story") ?? [];
  const companionIdSet = new Set(snapshot?.session.companionParticipantIds ?? []);
  const companionParticipants =
    snapshot?.session.participants.filter((participant) => companionIdSet.has(participant.id)) ?? [];
  const localHumanParticipantId =
    snapshot?.session.localHumanParticipantId ?? snapshot?.session.playerParticipantId ?? null;
  const selectedPrivateChatTarget =
    companionParticipants.find((participant) => participant.id === selectedPrivateChatTargetId) ??
    companionParticipants[0] ??
    null;
  const debugCompanionParticipant = selectedPrivateChatTarget ?? companionParticipants[0] ?? null;
  const privateThreadId =
    localHumanParticipantId && selectedPrivateChatTarget
      ? buildPrivateChatThreadId(localHumanParticipantId, selectedPrivateChatTarget.id)
      : null;
  const privateThreadMessages =
    snapshot?.messages.filter(
      (message) =>
        inferMessageChannel(message) === "private_chat" && message.threadId === privateThreadId
    ) ?? [];
  const privateChatInput =
    selectedPrivateChatTarget ? privateChatDrafts[selectedPrivateChatTarget.id] ?? "" : "";
  const participantNameMap = new Map(
    snapshot?.session.participants.map((participant) => [participant.id, participant.displayName]) ?? []
  );
  const latestNarration =
    [...publicStoryMessages]
      .reverse()
      .find((message) => message.kind === "gm_narration" || message.kind === "gm_dialogue") ??
    null;
  const historyContextMessages = latestNarration
    ? publicStoryMessages.filter((message) => message.id !== latestNarration.id)
    : publicStoryMessages;
  const comicPages = comicProject?.pages ?? [];
  const isComicGenerating = comicGenerationTaskCount > 0;
  const existingComicPageNumbers = new Set(comicPages.map((page) => page.pageNumber));
  const visiblePendingComicGenerationTasks = [...pendingComicGenerationTasks]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .filter((task) => !existingComicPageNumbers.has(task.pageNumber));
  const hasComicEntries = comicPages.length > 0 || visiblePendingComicGenerationTasks.length > 0;
  const comicLightboxPage =
    comicPages.find((page) => page.pageNumber === comicLightboxPageNumber) ?? null;
  const comicLightboxIndex = comicLightboxPage
    ? comicPages.findIndex((page) => page.pageNumber === comicLightboxPage.pageNumber)
    : -1;
  const previousComicLightboxPage =
    comicLightboxIndex > 0 ? comicPages[comicLightboxIndex - 1] : null;
  const nextComicLightboxPage =
    comicLightboxIndex >= 0 && comicLightboxIndex < comicPages.length - 1
      ? comicPages[comicLightboxIndex + 1]
      : null;
  const isSessionEnded = snapshot?.session.status === "ended";
  const hasEndingState = Boolean(snapshot?.session.gameState.endingState);
  const primaryPlayerMode = snapshot?.session.partySetup?.primaryPlayerMode ?? "human";
  const resolvedStoryControlMode =
    primaryPlayerMode === "ai" && !hasEndingState ? storyControlMode ?? "intervene" : null;
  const storyAutoMode = resolvedStoryControlMode === "auto";
  const roundPreparationRequired =
    !hasEndingState &&
    (primaryPlayerMode === "ai" || (snapshot?.session.companionParticipantIds?.length ?? 0) > 0);
  const roundInputState = snapshot?.session.gameState.roundInputState ?? null;
  const roundDrafts = roundInputState?.drafts ?? [];
  const primaryDraft = roundDrafts.find((draft) => draft.isPrimary) ?? null;
  const composerDisabled =
    actionLocked ||
    isPreparingRound ||
    isSubmittingTurn ||
    isUpdatingStoryControl ||
    storyAutoMode;
  const endingJudgeDecision = snapshot?.session.gameState.lastEndingJudgeDecision ?? null;
  const endingJudgeJson = endingJudgeDecision
    ? JSON.stringify(endingJudgeDecision, null, 2)
    : snapshot?.session.gameState.lastEndingJudgeResult
      ? JSON.stringify(snapshot.session.gameState.lastEndingJudgeResult, null, 2)
      : text.gameScreen.noEndingJudge;
  const endingJudgeStatusLabel = endingJudgeDecision
    ? endingJudgeDecision.GameOver
      ? text.gameScreen.endingJudgeGameOverTrue
      : text.gameScreen.endingJudgeGameOverFalse
    : text.gameScreen.endingJudgePending;
  const endingJudgeStatusCopy = endingJudgeDecision?.Reason || text.gameScreen.noEndingJudge;
  const selectedNpc =
    npcRoster.find((npc) => npc.id === selectedNpcId) ?? npcRoster[0] ?? null;
  const canUseQuickEndingTest =
    snapshot?.session.modelAccessMode === "mock" &&
    snapshot.session.status !== "ended" &&
    !roundPreparationRequired &&
    !isPreparingRound &&
    !actionLocked;
  const reasoningRecords: ReasoningRecord[] = [
    ...publicStoryMessages.flatMap((message) => {
      if (!(isNarrationMessage(message) || message.kind === "player_input")) {
        return [];
      }

      if (!hasReasoningContent(message.aiMetadata)) {
        return [];
      }

      return [
        {
          id: message.id,
          round: message.round,
          actorName:
            message.kind === "player_input"
              ? participantNameMap.get(message.senderId) ?? text.app.pendingPlayerName
              : text.app.pendingNarratorName,
          roundLabel:
            message.kind === "player_input"
              ? text.gameScreen.participantRound(
                  participantNameMap.get(message.senderId) ?? text.app.pendingPlayerName,
                  message.round
                )
              : text.gameScreen.narratorRound(message.round),
          statusLabel: text.gameScreen.reasoningCommittedLabel,
          output: message.content,
          reasoningContent: message.aiMetadata.reasoningContent.trim(),
          createdAt: message.createdAt,
          aiMetadata: message.aiMetadata
        }
      ];
    }),
    ...roundDrafts.flatMap((draft) => {
      if (draft.source !== "ai" || !hasReasoningContent(draft.aiMetadata)) {
        return [];
      }

      return [
        buildReasoningDraftRecord(
          draft,
          draft.aiMetadata,
          roundInputState,
          (snapshot?.session.currentRound ?? 0) + 1,
          text
        )
      ];
    })
  ].sort((left, right) => {
    if (right.round !== left.round) {
      return right.round - left.round;
    }

    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return rightTime - leftTime;
  });
  const supportsReasoningPanel =
    snapshot?.session.settings.modelProfileId === "deepseek-reasoner";
  const storyControlLocked = isUpdatingStoryControl;
  const privateChatLocked =
    actionLocked ||
    isSessionEnded ||
    isPreparingRound ||
    isSubmittingTurn ||
    isSendingPrivateChat ||
    isUpdatingStoryControl ||
    storyAutoMode;
  const manualNarrationLocked =
    actionLocked ||
    isPreparingRound ||
    isSubmittingTurn ||
    isInjectingManualNarration;
  const bootstrapProgressPercent = Math.max(
    8,
    Math.min(100, Math.round((sessionBootstrapState?.progress ?? 0.08) * 100))
  );
  const shouldShowBootstrapInline = isBootstrappingSession && !latestNarration?.content;
  const latestActivityEntry = activityLog.at(-1) ?? null;
  const activityStatusText =
    status.message.trim() ||
    latestActivityEntry?.message ||
    text.gameScreen.activityLogIdle;
  const activityStatusTone =
    status.message.trim().length > 0 ? status.tone : latestActivityEntry?.tone ?? "neutral";
  const isActivityStageTimingActive =
    status.message.trim().length > 0 &&
    (
      isBootstrappingSession ||
      isPreparingRound ||
      isSubmittingTurn ||
      isInjectingManualNarration ||
      isSendingPrivateChat ||
      isUpdatingStoryControl ||
      isSaving ||
      isRestoring ||
      isResumingBranch ||
      isComicLoading ||
      isComicGenerating ||
      debugMemoryLoading ||
      isRebuildingMemory
    );
  const activityStatusWithTimer =
    isActivityStageTimingActive && activityStageStartedAt !== null
      ? `${activityStatusText} (${formatElapsedDuration(activityStageNow - activityStageStartedAt)})`
      : activityStatusText;
  const bootstrapStatusLabel =
    sessionBootstrapState?.activeLabel ?? text.app.bootstrapStages.entered_game.label;
  const bootstrapStatusDetail =
    sessionBootstrapState?.activeDetail ?? text.app.bootstrapStages.waiting_first_reply.detail;
  const composerHint = hasEndingState
    ? text.gameScreen.endingFollowupHint
    : roundPreparationRequired
    ? isPreparingRound
      ? text.gameScreen.preparingRoundHint
      : storyAutoMode
        ? autoCommitCountdown !== null
          ? text.gameScreen.storyAutoCountdownHint(autoCommitCountdown)
          : isSubmittingTurn
          ? text.gameScreen.autoSubmittingRound
          : text.gameScreen.storyAutoHint
        : roundInputState
        ? text.gameScreen.commitRoundHint(roundDrafts.length)
        : primaryPlayerMode === "ai"
          ? text.gameScreen.storyInterveneHint
          : text.gameScreen.prepareRoundHint
    : composerDisabled
      ? text.gameScreen.inputLocked
      : text.gameScreen.submitTurnHint;
  const submitButtonLabel = hasEndingState
    ? text.gameScreen.endingFollowupSubmit
    : storyAutoMode
    ? autoCommitCountdown !== null
      ? text.gameScreen.autoCommitCountdown(autoCommitCountdown)
      : isPreparingRound
      ? text.gameScreen.preparingRound
      : isSubmittingTurn
        ? text.gameScreen.autoSubmittingRound
        : text.gameScreen.autoRunning
    : roundPreparationRequired
    ? isPreparingRound
      ? text.gameScreen.preparingRound
      : isSubmittingTurn
        ? text.common.creating
      : roundInputState
        ? text.gameScreen.commitRound
        : text.gameScreen.prepareRound
    : isSubmittingTurn
      ? text.common.creating
      : text.gameScreen.submitTurn;
  const composerPlaceholder = actionLocked
    ? text.gameScreen.initPlaceholder
    : isPreparingRound
      ? text.gameScreen.draftingPlaceholder
      : hasEndingState
        ? text.gameScreen.endingFollowupPlaceholder
      : storyAutoMode
        ? text.gameScreen.autoModeLockedInput
      : primaryPlayerMode === "ai" && !primaryDraft
        ? text.gameScreen.aiDraftPlaceholder
        : text.gameScreen.actionPlaceholder;
  const worldlineNodeCount =
    activeGraphBundle?.graph.unlockedAtEnding ? activeGraphBundle.graph.nodeCount : 0;
  const sidePanelEyebrow =
    sidePanelMode === "round"
      ? text.gameScreen.roundDraftsEyebrow
      : sidePanelMode === "comics"
        ? text.gameScreen.comicEyebrow
      : sidePanelMode === "reasoning"
        ? text.gameScreen.reasoningEyebrow
      : sidePanelMode === "worldline"
        ? text.gameScreen.worldlineEyebrow
        : sidePanelMode === "judge"
          ? text.gameScreen.endingJudgeSideLabel
          : text.gameScreen.recentContext;
  const sidePanelTitle =
    sidePanelMode === "round"
      ? text.gameScreen.roundRepliesTitle
      : sidePanelMode === "comics"
        ? text.gameScreen.comicTitle
      : sidePanelMode === "reasoning"
        ? text.gameScreen.reasoningTitle
      : sidePanelMode === "worldline"
        ? text.gameScreen.worldlineTitle
        : sidePanelMode === "judge"
          ? text.gameScreen.judgeTabTitle
          : text.gameScreen.recentContextTitle;
  const sidePanelCountLabel =
    sidePanelMode === "round"
      ? roundDrafts.length
        ? text.gameScreen.roundDraftCount(roundDrafts.length)
        : text.gameScreen.roundDraftsEmpty
      : sidePanelMode === "comics"
        ? isComicLoading
          ? text.common.loading
          : comicPages.length
            ? text.gameScreen.comicCount(comicPages.length)
            : isComicGenerating
              ? `${text.common.generating} (${comicGenerationTaskCount})`
              : text.common.none
      : sidePanelMode === "reasoning"
        ? text.gameScreen.reasoningCount(reasoningRecords.length)
      : sidePanelMode === "worldline"
        ? worldlineNodeCount > 0
          ? text.gameScreen.worldlineNodeCount(worldlineNodeCount)
          : text.gameScreen.worldlineEmptyShort
        : sidePanelMode === "judge"
          ? endingJudgeStatusLabel
          : text.gameScreen.recentItems(historyContextMessages.length);
  const workspaceStyle = {
    "--game-side-width": `${sidePanelWidth}px`,
    "--game-composer-height": `${composerHeight}px`
  } as CSSProperties;

  useEffect(() => {
    setNpcRoster([]);
    setNpcError(null);
    setSelectedNpcId(null);
    setSelectedPrivateChatTargetId(null);
    setPrivateChatDrafts({});
    setManualNarrationDraft("");
    setComicLightboxPageNumber(null);
    setSidePanelMode("history");
    setSidePanelWidth(420);
    setComposerHeight(240);
    setGeneratedPortraits({});
    setGeneratingNpcId(null);
    setActiveDrawer("none");
    setDebugMemory(null);
    setDebugNarratorContextPack(null);
    setDebugCompanionContextPack(null);
    setDebugMemoryError(null);
    setDebugMemoryLoading(false);
    setIsRebuildingMemory(false);
  }, [snapshot?.session.id]);

  useEffect(() => {
    if (!supportsReasoningPanel && sidePanelMode === "reasoning") {
      setSidePanelMode("history");
    }
  }, [sidePanelMode, supportsReasoningPanel]);

  useEffect(() => {
    if (!isActivityStageTimingActive) {
      setActivityStageStartedAt(null);
      return;
    }

    const now = Date.now();
    setActivityStageStartedAt(now);
    setActivityStageNow(now);
  }, [isActivityStageTimingActive, status.message]);

  useEffect(() => {
    if (!isActivityStageTimingActive || activityStageStartedAt === null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActivityStageNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activityStageStartedAt, isActivityStageTimingActive]);

  useEffect(() => {
    if (sidePanelMode !== "comics") {
      setComicLightboxPageNumber(null);
    }
  }, [sidePanelMode]);

  useEffect(() => {
    if (
      comicLightboxPageNumber !== null &&
      !comicPages.some((page) => page.pageNumber === comicLightboxPageNumber)
    ) {
      setComicLightboxPageNumber(null);
    }
  }, [comicLightboxPageNumber, comicPages]);

  useEffect(() => {
    function syncPanelBounds(): void {
      const workspaceRect = workspaceRef.current?.getBoundingClientRect();

      if (workspaceRect) {
        const maxSideWidth = Math.max(300, Math.min(680, workspaceRect.width - 260));
        setSidePanelWidth((current) => clampPanelSize(current, 300, maxSideWidth));
        const maxComposerHeight = Math.max(220, workspaceRect.height - 240);
        setComposerHeight((current) => clampPanelSize(current, 220, maxComposerHeight));
      }
    }

    syncPanelBounds();
    window.addEventListener("resize", syncPanelBounds);
    return () => {
      window.removeEventListener("resize", syncPanelBounds);
    };
  }, []);

  useEffect(() => {
    if (activeDrawer !== "private_chat") {
      return;
    }

    if (storyAutoMode) {
      setActiveDrawer("none");
      return;
    }

    if (!companionParticipants.length) {
      setSelectedPrivateChatTargetId(null);
      return;
    }

    setSelectedPrivateChatTargetId((current) =>
      current && companionParticipants.some((participant) => participant.id === current)
        ? current
        : companionParticipants[0]?.id ?? null
    );
  }, [activeDrawer, companionParticipants, storyAutoMode]);

  useEffect(() => {
    if (activeDrawer !== "npcs" || !snapshot || actionLocked) {
      return;
    }

    const ruleDirectoryName = snapshot.contentSummary.ruleDirectoryName?.trim() ?? "";
    const storyDirectoryName = snapshot.contentSummary.storyDirectoryName?.trim() ?? "";

    if (!ruleDirectoryName || !storyDirectoryName) {
      setNpcRoster([]);
      setSelectedNpcId(null);
      setNpcError(text.gameScreen.missingNpcContentInfo);
      return;
    }

    let cancelled = false;
    setNpcLoading(true);
    setNpcError(null);

    void fetchNpcRoster(ruleDirectoryName, storyDirectoryName)
      .then((roster) => {
        if (cancelled) {
          return;
        }

        setNpcRoster(roster);
        setSelectedNpcId((current) =>
          current && roster.some((item) => item.id === current) ? current : roster[0]?.id ?? null
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setNpcRoster([]);
        setSelectedNpcId(null);
        setNpcError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setNpcLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDrawer, actionLocked, snapshot]);

  useEffect(() => {
    if (
      activeDrawer !== "details" ||
      !snapshot ||
      !snapshot.session.settings.debugEnabled
    ) {
      return;
    }

    let cancelled = false;
    setDebugMemoryLoading(true);
    setDebugMemoryError(null);

    void Promise.all([
      fetchSessionMemory(snapshot.session.id),
      fetchSessionContextPack({
        sessionId: snapshot.session.id,
        target: "narrator"
      }),
      debugCompanionParticipant
        ? fetchSessionContextPack({
            sessionId: snapshot.session.id,
            target: "companion",
            participantId: debugCompanionParticipant.id
          })
        : Promise.resolve(null)
    ])
      .then(([memoryResponse, narratorContextResponse, companionContextResponse]) => {
        if (cancelled) {
          return;
        }

        setDebugMemory(memoryResponse.memory);
        setDebugNarratorContextPack(narratorContextResponse.contextPack);
        setDebugCompanionContextPack(companionContextResponse?.contextPack ?? null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setDebugMemoryError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setDebugMemoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDrawer, debugCompanionParticipant, snapshot]);

  function handleResizeSidePanel(event: ReactPointerEvent<HTMLDivElement>): void {
    const containerRect = workspaceRef.current?.getBoundingClientRect();
    if (!containerRect || window.innerWidth <= 900) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidePanelWidth;
    const maxSideWidth = Math.max(300, Math.min(680, containerRect.width - 260));
    setIsResizingPanels(true);

    function handlePointerMove(moveEvent: PointerEvent): void {
      const deltaX = moveEvent.clientX - startX;
      setSidePanelWidth(clampPanelSize(startWidth - deltaX, 300, maxSideWidth));
    }

    function stopResize(): void {
      setIsResizingPanels(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  function handleResizeComposer(event: ReactPointerEvent<HTMLDivElement>): void {
    const workspaceRect = workspaceRef.current?.getBoundingClientRect();
    if (!workspaceRect || window.innerWidth <= 900) {
      return;
    }

    event.preventDefault();
    const startY = event.clientY;
    const startHeight = composerHeight;
    const maxComposerHeight = Math.max(220, workspaceRect.height - 240);
    setIsResizingPanels(true);

    function handlePointerMove(moveEvent: PointerEvent): void {
      const deltaY = moveEvent.clientY - startY;
      setComposerHeight(clampPanelSize(startHeight - deltaY, 220, maxComposerHeight));
    }

    function stopResize(): void {
      setIsResizingPanels(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  async function handleLoadSavedGame(record: SavedGameRecord): Promise<void> {
    setActiveDrawer("none");
    await onLoadSavedGame(record);
  }

  async function handleRebuildMemory(): Promise<void> {
    if (!snapshot) {
      return;
    }

    setIsRebuildingMemory(true);
    setDebugMemoryError(null);
    try {
      const rebuilt = await rebuildSessionMemory(snapshot.session.id);
      setDebugMemory(rebuilt.memory);

      const narratorContextResponse = await fetchSessionContextPack({
        sessionId: snapshot.session.id,
        target: "narrator"
      });
      setDebugNarratorContextPack(narratorContextResponse.contextPack);

      if (debugCompanionParticipant) {
        const companionContextResponse = await fetchSessionContextPack({
          sessionId: snapshot.session.id,
          target: "companion",
          participantId: debugCompanionParticipant.id
        });
        setDebugCompanionContextPack(companionContextResponse.contextPack);
      } else {
        setDebugCompanionContextPack(null);
      }
    } catch (error) {
      setDebugMemoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRebuildingMemory(false);
    }
  }

  async function handleGenerateNpcPortrait(npc: NpcRosterEntry): Promise<void> {
    if (!snapshot) {
      return;
    }

    setGeneratingNpcId(npc.id);
    setNpcError(null);

    try {
      const result = await generateSceneImage({
        prompt: npc.promptText.trim() || npc.summary.trim() || npc.name,
        trigger: "character_portrait",
        theme: imagePromptTemplateConfig?.defaultTheme,
        sceneId: `${snapshot.session.id}:${npc.id}`,
        imageProfileId,
        runtimeImageModelConfig,
        promptTemplateConfig: imagePromptTemplateConfig ?? undefined,
        allowFallback: true,
        characters: [
          {
            name: npc.name,
            appearance: npc.summary.trim() || npc.promptText.trim() || npc.name
          }
        ]
      });

      setGeneratedPortraits((current) => ({
        ...current,
        [npc.id]: result
      }));
    } catch (error) {
      setNpcError(error instanceof Error ? error.message : String(error));
    } finally {
      setGeneratingNpcId(null);
    }
  }

  async function handleSendPrivateChat(): Promise<void> {
    if (!selectedPrivateChatTarget) {
      return;
    }

    const didSend = await onSendPrivateChat(selectedPrivateChatTarget.id, privateChatInput);
    if (!didSend) {
      return;
    }

    setPrivateChatDrafts((current) => ({
      ...current,
      [selectedPrivateChatTarget.id]: ""
    }));
  }

  async function handleManualNarrationSubmit(): Promise<void> {
    const didSubmit = await onSubmitManualNarration(manualNarrationDraft);
    if (!didSubmit) {
      return;
    }

    setManualNarrationDraft("");
  }

  if (!snapshot) {
    return (
      <section className="panel page-panel">
        <div className="screen-header">
          <div>
            <div className="eyebrow">{text.appName}</div>
            <h1>{text.gameScreen.emptyTitle}</h1>
            <p className="lead">{text.gameScreen.emptyDescription}</p>
          </div>
          <div className="button-row header-actions">
            <button className="ghost-button" onClick={onBack} type="button">
              {text.common.backToMenu}
            </button>
          </div>
        </div>
        <div className="empty-state">{text.gameScreen.emptyState}</div>
      </section>
    );
  }

  return (
    <section className="panel page-panel game-shell">
      <header className="game-hero">
        <div className="game-hero-copy">
          <div className="eyebrow">{text.gameScreen.heroEyebrow}</div>
          <h1>{snapshot.contentSummary.storyTitle}</h1>
          <p className="lead">
            {snapshot.contentSummary.ruleTitle} / Round {snapshot.session.currentRound} /{" "}
            {isBootstrappingSession
              ? text.gameScreen.creatingSession
              : isOpeningRevealInProgress
                ? text.gameScreen.openingScene
                : snapshot.session.status === "ended"
                  ? text.gameScreen.ended
                  : text.gameScreen.inProgress}
          </p>
        </div>

        <div className="game-toolbar">
          <button className="ghost-button" onClick={onBack} type="button">
            {text.common.backToMenu}
          </button>
          <button
            className="ghost-button"
            disabled={isSaving || actionLocked}
            onClick={() => void onSaveGame()}
            type="button"
          >
            {isSaving ? text.common.creating : text.common.save}
          </button>
          <button
            className="ghost-button"
            disabled={isRestoring || actionLocked}
            onClick={() => setActiveDrawer("saves")}
            type="button"
          >
            {isRestoring ? text.common.loading : text.common.load}
          </button>
          {companionParticipants.length ? (
            <button
              className="ghost-button"
              disabled={actionLocked || storyAutoMode}
              onClick={() => setActiveDrawer("private_chat")}
              type="button"
            >
              {text.gameScreen.privateChatButton}
            </button>
          ) : null}
          <button
            className="ghost-button"
            disabled={actionLocked}
            onClick={() => setActiveDrawer("npcs")}
            type="button"
          >
            {text.common.npc}
          </button>
          <button
            className="ghost-button"
            disabled={actionLocked}
            onClick={() => setActiveDrawer("details")}
            type="button"
          >
            {text.common.details}
          </button>
        </div>
      </header>

      <div
        className={`game-workspace ${isResizingPanels ? "game-workspace-resizing" : ""}`}
        ref={workspaceRef}
        style={workspaceStyle}
      >
        <div className="game-top-panels">
          <section className="summary-card game-focus-panel">
            <div className="game-panel-head">
              <div>
                <div className="meta-label">{text.gameScreen.currentNarration}</div>
                <div className="summary-title">
                  {isSessionEnded
                    ? text.gameScreen.endedTitle
                    : shouldShowBootstrapInline
                      ? text.gameScreen.joiningSceneTitle
                      : text.gameScreen.advancingStoryTitle}
                </div>
              </div>
              {snapshot.session.gameState.endingState ? (
                <span className="flag-chip">{snapshot.session.gameState.endingState.title}</span>
              ) : null}
            </div>

            <div className="game-focus-scroll">
              {shouldShowBootstrapInline ? (
                <div className="game-inline-loading">
                  <div className="game-inline-loading-copy">
                    <div className="meta-label">{text.gameScreen.bootstrapEyebrow}</div>
                    <div className="summary-title">{bootstrapStatusLabel}</div>
                    <p className="summary-text">{text.gameScreen.bootstrapWaiting}</p>
                  </div>

                  <div className="game-inline-loading-progress">
                    <div className="game-loading-progress-meta">
                      <span>{bootstrapStatusDetail}</span>
                      <span>{bootstrapProgressPercent}%</span>
                    </div>
                    <div className="game-loading-progress-track" aria-hidden="true">
                      <div
                        className="game-loading-progress-bar"
                        style={{ width: `${bootstrapProgressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <MarkdownBlock
                    className="story-markdown-block game-focus-markdown"
                    content={latestNarration?.content ?? text.gameScreen.noNarrationYet}
                    fontSizePreset={markdownFontSize}
                  />

                  {showAiMetadata && latestNarration?.aiMetadata ? (
                    <div className="ai-meta-line">
                      {formatAiGenerationMeta(latestNarration.aiMetadata, text)}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>

          <div
            aria-label={text.gameScreen.resizeComposer}
            className="game-resizer game-resizer-row"
            onPointerDown={handleResizeComposer}
            role="separator"
          />

          <form className="summary-card game-composer" onSubmit={onSubmitTurn}>
            <div className="game-panel-head">
              <div>
                <div className="meta-label">{text.gameScreen.yourAction}</div>
                <div className="summary-title">
                  {hasEndingState
                    ? text.gameScreen.endingFollowupTitle
                    : text.gameScreen.actionTitle}
                </div>
              </div>
              <span className="summary-text">{composerHint}</span>
            </div>

            <textarea
              disabled={composerDisabled}
              rows={5}
              placeholder={composerPlaceholder}
              value={turnInput}
              onChange={(event) => onTurnInputChange(event.target.value)}
            />

            <div className="button-row game-composer-actions">
              {primaryPlayerMode === "ai" && !hasEndingState ? (
                <div className="game-story-control">
                  <div className="meta-label">{text.gameScreen.storyControlLabel}</div>
                  <div className="game-panel-toggle-row">
                    <button
                      className={`game-panel-toggle ${
                        resolvedStoryControlMode === "auto" ? "game-panel-toggle-active" : ""
                      }`}
                      disabled={storyControlLocked}
                      onClick={() => void onStoryControlModeChange("auto")}
                      type="button"
                    >
                      {text.gameScreen.storyControlAuto}
                    </button>
                    <button
                      className={`game-panel-toggle ${
                        resolvedStoryControlMode === "intervene"
                          ? "game-panel-toggle-active"
                          : ""
                      }`}
                      disabled={storyControlLocked}
                      onClick={() => void onStoryControlModeChange("intervene")}
                      type="button"
                    >
                      {text.gameScreen.storyControlIntervene}
                    </button>
                  </div>
                </div>
              ) : null}
              {hasEndingState ? (
                <button className="ghost-button" onClick={onOpenSettlement} type="button">
                  {text.gameScreen.openSettlementPage}
                </button>
              ) : null}
              <button
                className="primary-button"
                disabled={isSubmittingTurn || composerDisabled}
                type="submit"
              >
                {submitButtonLabel}
              </button>
            </div>
          </form>

          <div
            className={`game-activity-statusline ${
              activityStatusTone === "error" ? "game-activity-statusline-error" : ""
            }`}
          >
            <span className="game-activity-statusline-label">
              {text.gameScreen.activityLogEyebrow}
            </span>
            <span className="game-activity-statusline-message" title={activityStatusWithTimer}>
              {activityStatusWithTimer}
            </span>
          </div>
        </div>

        <div
          aria-label={text.gameScreen.resizeSidePanel}
          className="game-resizer game-resizer-column"
          onPointerDown={handleResizeSidePanel}
          role="separator"
        />

        <section className="summary-card game-side-panel">
          <div className="game-panel-head">
            <div>
              <div className="meta-label">{sidePanelEyebrow}</div>
              <div className="summary-title">{sidePanelTitle}</div>
            </div>
            <span className="summary-text">{sidePanelCountLabel}</span>
          </div>

          <div className="game-panel-toggle-row">
            <button
              className={`game-panel-toggle ${
                sidePanelMode === "history" ? "game-panel-toggle-active" : ""
              }`}
              onClick={() => setSidePanelMode("history")}
              type="button"
            >
              {text.gameScreen.historyTab}
            </button>
            <button
              className={`game-panel-toggle ${
                sidePanelMode === "round" ? "game-panel-toggle-active" : ""
              }`}
              disabled={!roundPreparationRequired}
              onClick={() => setSidePanelMode("round")}
              type="button"
            >
              {text.gameScreen.roundRepliesTab}
            </button>
            <button
              className={`game-panel-toggle ${
                sidePanelMode === "comics" ? "game-panel-toggle-active" : ""
              }`}
              onClick={() => setSidePanelMode("comics")}
              type="button"
            >
              {text.gameScreen.comicButton}
            </button>
            {supportsReasoningPanel ? (
              <button
                className={`game-panel-toggle ${
                  sidePanelMode === "reasoning" ? "game-panel-toggle-active" : ""
                }`}
                onClick={() => setSidePanelMode("reasoning")}
                type="button"
              >
                {text.gameScreen.reasoningTab}
              </button>
            ) : null}
            <button
              className={`game-panel-toggle ${
                sidePanelMode === "worldline" ? "game-panel-toggle-active" : ""
              }`}
              onClick={() => setSidePanelMode("worldline")}
              type="button"
            >
              {text.gameScreen.worldlineTab}
            </button>
            <button
              className={`game-panel-toggle ${
                sidePanelMode === "judge" ? "game-panel-toggle-active" : ""
              }`}
              onClick={() => setSidePanelMode("judge")}
              type="button"
            >
              {text.gameScreen.judgeTab}
            </button>
          </div>

          <div className="game-side-scroll">
            {sidePanelMode === "history" ? (
              <div className="game-history-list">
                {historyContextMessages.length ? (
                  historyContextMessages.map((message) => (
                    <article
                      className={`game-history-item ${
                        message.kind === "player_input"
                          ? "game-history-item-player"
                          : "game-history-item-gm"
                      }`}
                      key={message.id}
                    >
                      <div className="game-history-meta">
                        <span>
                          {message.kind === "player_input"
                            ? text.gameScreen.participantRound(
                                participantNameMap.get(message.senderId) ??
                                  text.app.pendingPlayerName,
                                message.round
                              )
                            : text.gameScreen.narratorRound(message.round)}
                        </span>
                        <span>{formatDateTime(message.createdAt)}</span>
                      </div>

                      {message.kind === "player_input" ? (
                        <div className="message-body">{message.content}</div>
                      ) : (
                        <MarkdownBlock
                          className="story-markdown-block message-body message-body-markdown"
                          content={message.content}
                          fontSizePreset={markdownFontSize}
                        />
                      )}
                    </article>
                  ))
                ) : (
                  <div className="empty-state">{text.gameScreen.historyEmpty}</div>
                )}
              </div>
            ) : sidePanelMode === "round" ? (
              isPreparingRound ? (
                <div className="empty-state">{text.gameScreen.draftingPlaceholder}</div>
              ) : roundDrafts.length ? (
                <div className="game-draft-list">
                  {roundDrafts.map((draft) => (
                    <article className="game-draft-item" key={draft.participantId}>
                      <div className="game-draft-item-head">
                        <div>
                          <div className="summary-title">{draft.displayName}</div>
                          <div className="summary-text">
                            {draft.isPrimary
                              ? text.gameScreen.primaryDraftLabel
                              : text.gameScreen.companionDraftLabel}
                          </div>
                        </div>
                        <div className="game-draft-item-flags">
                          <span className="badge">
                            {draft.source === "ai"
                              ? text.gameScreen.aiDraftBadge
                              : text.gameScreen.humanDraftBadge}
                          </span>
                          {draft.editable ? (
                            <span className="badge">{text.gameScreen.editableDraftBadge}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="message-body">{draft.content}</div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  {roundPreparationRequired
                    ? primaryPlayerMode === "ai"
                      ? text.gameScreen.aiDraftWaiting
                      : text.gameScreen.roundDraftsDescription
                    : text.gameScreen.roundRepliesEmpty}
                </div>
              )
            ) : sidePanelMode === "comics" ? (
              hasComicEntries ? (
                <div className="game-comic-grid">
                  {comicPages.map((page) => (
                    <article className="summary-card game-comic-card" key={page.pageId}>
                      <div className="game-comic-card-head">
                        <div>
                          <div className="meta-label">
                            {text.gameScreen.comicPageLabel(page.pageNumber)}
                          </div>
                          <div className="summary-text">
                            {formatDateTime(page.createdAt)}
                          </div>
                        </div>
                        <button
                          className="ghost-button"
                          onClick={() => setComicLightboxPageNumber(page.pageNumber)}
                          type="button"
                        >
                          {text.gameScreen.comicOpenLightbox}
                        </button>
                      </div>

                      <img
                        alt={text.gameScreen.comicPageAlt(page.pageNumber)}
                        className="game-comic-preview"
                        src={page.image.apiPath}
                      />
                    </article>
                  ))}
                  {visiblePendingComicGenerationTasks.map((task, index) => (
                    <article
                      aria-busy="true"
                      className="summary-card game-comic-card game-comic-card-pending"
                      key={`pending-comic-${task.pageNumber}-${task.startedAt}-${index}`}
                    >
                      <div className="game-comic-card-head">
                        <div>
                          <div className="meta-label">
                            {text.gameScreen.comicPageLabel(task.pageNumber)}
                          </div>
                          <div className="summary-text">
                            {`${text.gameScreen.comicGenerationStart(task.pageNumber)} (${formatElapsedDuration(
                              activityStageNow - task.startedAt
                            )})`}
                          </div>
                        </div>
                        <span className="badge">{text.common.generating}</span>
                      </div>

                      <div className="game-comic-preview-loading">
                        <div className="game-comic-loading">
                          <div aria-hidden="true" className="game-comic-spinner" />
                          <div className="summary-text game-comic-loading-copy">
                            {text.gameScreen.comicGeneratingHint}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : isComicLoading ? (
                <div className="empty-state">{text.common.loading}</div>
              ) : (
                <div className="empty-state">
                  {isComicGenerating
                    ? text.gameScreen.comicGeneratingHint
                    : text.gameScreen.comicEmpty}
                </div>
              )
            ) : sidePanelMode === "worldline" ? (
              activeGraphBundle?.graph.unlockedAtEnding ? (
                <PlaythroughGraphPanel
                  defaultExpanded
                  graphBundle={activeGraphBundle}
                  isResuming={isResumingBranch}
                  onContinueFromNode={onContinueFromNode}
                  variant="embedded"
                />
              ) : (
                <div className="empty-state">{text.gameScreen.worldlineEmpty}</div>
              )
            ) : sidePanelMode === "reasoning" ? (
              reasoningRecords.length ? (
                <div className="game-reasoning-list">
                  {reasoningRecords.map((record) => (
                    <article className="game-reasoning-item" key={record.id}>
                      <div className="game-reasoning-head">
                        <div>
                          <div className="summary-title">{record.actorName}</div>
                          <div className="summary-text">{record.roundLabel}</div>
                        </div>
                        <div className="game-draft-item-flags">
                          <span className="badge">{record.statusLabel}</span>
                        </div>
                      </div>

                      <div className="game-history-meta">
                        <span>
                          {record.createdAt ? formatDateTime(record.createdAt) : text.common.none}
                        </span>
                        <span>{record.aiMetadata.model}</span>
                      </div>

                      <div className="meta-label">{text.gameScreen.reasoningOutputLabel}</div>
                      <MarkdownBlock
                        className="story-markdown-block message-body message-body-markdown"
                        content={record.output}
                        fontSizePreset={markdownFontSize}
                      />

                      <div className="meta-label">{text.gameScreen.reasoningContentLabel}</div>
                      <pre className="game-reasoning-text">{record.reasoningContent}</pre>

                      {showAiMetadata ? (
                        <div className="ai-meta-line">
                          {formatAiGenerationMeta(record.aiMetadata, text)}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">{text.gameScreen.reasoningEmpty}</div>
              )
            ) : (
              <div className="game-judge-panel">
                {hasEndingState ? (
                  <article className="game-judge-item">
                    <div className="game-side-judge-head">
                      <span className="meta-label">{text.gameScreen.endingState}</span>
                      <span className="flag-chip">
                        {snapshot?.session.gameState.endingState?.title}
                      </span>
                    </div>
                    <div className="summary-text">
                      {snapshot?.session.gameState.endingState?.summary}
                    </div>
                  </article>
                ) : null}

                <article className="game-judge-item">
                  <div className="game-side-judge-head">
                    <span className="meta-label">{text.gameScreen.judgeTabTitle}</span>
                    <span
                      className={`flag-chip ${
                        endingJudgeDecision?.GameOver ? "flag-chip-warning" : ""
                      }`}
                    >
                      {endingJudgeStatusLabel}
                    </span>
                  </div>
                  <div className="summary-text">{endingJudgeStatusCopy}</div>
                  {endingJudgeDecision?.EndingTitle ? (
                    <div className="ai-meta-line">{endingJudgeDecision.EndingTitle}</div>
                  ) : null}
                  <div className="meta-label">{text.gameScreen.endingJudgeStructuredJson}</div>
                  <pre className="game-judge-json">{endingJudgeJson}</pre>
                </article>
              </div>
            )}
          </div>
        </section>
      </div>

      {snapshot.session.gameState.endingState ? (
        <div className="info-banner info-banner-success">
          <div className="meta-label">{text.gameScreen.endingState}</div>
          <div className="summary-title">{snapshot.session.gameState.endingState.title}</div>
          <div className="summary-text">{snapshot.session.gameState.endingState.summary}</div>
        </div>
      ) : null}

      {activeDrawer !== "none" ? (
        <div className="game-drawer-backdrop" onClick={() => setActiveDrawer("none")}>
          <aside className="game-drawer-panel" onClick={(event) => event.stopPropagation()}>
            {activeDrawer === "saves" ? (
              <div className="game-drawer-body">
                <div className="screen-header">
                  <div>
                    <div className="eyebrow">{text.gameScreen.saveLoadEyebrow}</div>
                    <h2>{text.gameScreen.loadSaveTitle}</h2>
                    <p className="lead">{text.gameScreen.saveLoadDescription}</p>
                  </div>
                  <div className="button-row header-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setActiveDrawer("none")}
                      type="button"
                    >
                      {text.common.close}
                    </button>
                  </div>
                </div>

                <div className="game-save-list">
                  {savedGames.length ? (
                    savedGames.map((record) => (
                      <article className="record-card" key={record.saveId}>
                        <div className="record-header">
                          <div>
                            <div className="summary-title">{record.storyTitle}</div>
                            <div className="summary-text">
                              {record.ruleTitle} / Round {record.round} / {record.status}
                            </div>
                          </div>
                          <button
                            className="ghost-button"
                            disabled={isRestoring}
                            onClick={() => void handleLoadSavedGame(record)}
                            type="button"
                          >
                            {isRestoring ? text.common.loading : text.common.open}
                          </button>
                        </div>
                        <div className="summary-text">
                          {text.gameScreen.savedAt(formatDateTime(record.savedAt))}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">{text.gameScreen.noLocalSaves}</div>
                  )}
                </div>
              </div>
            ) : null}

            {activeDrawer === "private_chat" ? (
              <div className="game-drawer-body">
                <div className="screen-header">
                  <div>
                    <div className="eyebrow">{text.gameScreen.privateChatEyebrow}</div>
                    <h2>{text.gameScreen.privateChatTitle}</h2>
                    <p className="lead">{text.gameScreen.privateChatDescription}</p>
                  </div>
                  <div className="button-row header-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setActiveDrawer("none")}
                      type="button"
                    >
                      {text.common.close}
                    </button>
                  </div>
                </div>

                <div className="game-private-chat-layout">
                  <div className="game-private-chat-list">
                    {companionParticipants.length ? (
                      companionParticipants.map((participant) => (
                        <button
                          className={`selection-card ${
                            selectedPrivateChatTarget?.id === participant.id
                              ? "selection-card-active"
                              : ""
                          }`}
                          key={participant.id}
                          onClick={() => setSelectedPrivateChatTargetId(participant.id)}
                          type="button"
                        >
                          <div className="selection-card-title">{participant.displayName}</div>
                          <div className="selection-card-copy">{text.gameScreen.privateChatTeammateHint}</div>
                        </button>
                      ))
                    ) : (
                      <div className="empty-state">{text.gameScreen.privateChatEmpty}</div>
                    )}
                  </div>

                  <div className="summary-card game-private-chat-panel">
                    {selectedPrivateChatTarget ? (
                      <>
                        <div className="game-panel-head">
                          <div>
                            <div className="meta-label">{text.gameScreen.privateChatWithEyebrow}</div>
                            <div className="summary-title">{selectedPrivateChatTarget.displayName}</div>
                          </div>
                          <span className="summary-text">{text.gameScreen.privateChatHistoryHint}</span>
                        </div>

                        <div className="game-private-chat-scroll">
                          <div className="game-private-chat-thread">
                            {privateThreadMessages.length ? (
                              privateThreadMessages.map((message) => {
                                const isSelf = message.senderId === localHumanParticipantId;
                                const senderLabel =
                                  participantNameMap.get(message.senderId) ??
                                  (isSelf ? text.gameScreen.privateChatYou : text.app.pendingPlayerName);

                                return (
                                  <article
                                    className={`game-private-chat-message ${
                                      isSelf
                                        ? "game-private-chat-message-self"
                                        : "game-private-chat-message-peer"
                                    }`}
                                    key={message.id}
                                  >
                                    <div className="game-private-chat-meta">
                                      <span>{senderLabel}</span>
                                      <span>{formatDateTime(message.createdAt)}</span>
                                    </div>
                                    <div className="message-body">{message.content}</div>
                                  </article>
                                );
                              })
                            ) : (
                              <div className="empty-state">{text.gameScreen.privateChatEmpty}</div>
                            )}
                          </div>
                        </div>

                        <div className="game-private-chat-composer">
                          <div className="meta-label">{text.gameScreen.privateChatInputLabel}</div>
                          <textarea
                            disabled={privateChatLocked}
                            placeholder={text.gameScreen.privateChatInputPlaceholder}
                            rows={4}
                            value={privateChatInput}
                            onChange={(event) =>
                              setPrivateChatDrafts((current) => ({
                                ...current,
                                [selectedPrivateChatTarget.id]: event.target.value
                              }))
                            }
                          />
                          <div className="button-row">
                            <button
                              className="primary-button"
                              disabled={privateChatLocked || !privateChatInput.trim()}
                              onClick={() => void handleSendPrivateChat()}
                              type="button"
                            >
                              {isSendingPrivateChat
                                ? text.gameScreen.privateChatSending
                                : text.gameScreen.privateChatSend}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="empty-state">{text.gameScreen.privateChatSelectHint}</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {activeDrawer === "npcs" ? (
              <div className="game-drawer-body">
                <div className="screen-header">
                  <div>
                    <div className="eyebrow">{text.gameScreen.npcEyebrow}</div>
                    <h2>{text.gameScreen.npcTitle}</h2>
                    <p className="lead">{text.gameScreen.npcDescription}</p>
                  </div>
                  <div className="button-row header-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setActiveDrawer("none")}
                      type="button"
                    >
                      {text.common.close}
                    </button>
                  </div>
                </div>

                {npcLoading ? <div className="empty-state">{text.gameScreen.loadingNpcFiles}</div> : null}
                {npcError ? <div className="info-banner info-banner-warning">{npcError}</div> : null}

                {!npcLoading && !npcError ? (
                  <div className="game-npc-layout">
                    <div className="game-npc-list">
                      {npcRoster.length ? (
                        npcRoster.map((npc) => (
                          <button
                            className={`selection-card ${
                              selectedNpc?.id === npc.id ? "selection-card-active" : ""
                            }`}
                            key={npc.id}
                            onClick={() => setSelectedNpcId(npc.id)}
                            type="button"
                          >
                            <div className="selection-card-title">{npc.name}</div>
                            <div className="selection-card-copy">{npc.summary}</div>
                          </button>
                        ))
                      ) : (
                        <div className="empty-state">{text.gameScreen.noNpcFiles}</div>
                      )}
                    </div>

                    <div className="summary-card game-npc-detail">
                      {selectedNpc ? (
                        <>
                          <div className="game-panel-head">
                            <div>
                              <div className="meta-label">{text.common.npc}</div>
                              <div className="summary-title">{selectedNpc.name}</div>
                            </div>
                            <button
                              className="ghost-button"
                              disabled={generatingNpcId === selectedNpc.id}
                              onClick={() => void handleGenerateNpcPortrait(selectedNpc)}
                              type="button"
                            >
                              {generatingNpcId === selectedNpc.id
                                ? text.gameScreen.generatingPortrait
                                : text.gameScreen.generatePortrait}
                            </button>
                          </div>

                          <div className="game-npc-portrait">
                            {generatedPortraits[selectedNpc.id]?.imageUrl ||
                            selectedNpc.portraitAssetUrl ? (
                              <img
                                alt={selectedNpc.name}
                                src={
                                  generatedPortraits[selectedNpc.id]?.imageUrl ??
                                  selectedNpc.portraitAssetUrl ??
                                  undefined
                                }
                              />
                            ) : (
                              <div className="empty-state">{text.gameScreen.noPortraitYet}</div>
                            )}
                          </div>

                          <div className="summary-text">{selectedNpc.summary}</div>
                          <pre>{selectedNpc.promptText}</pre>
                          {generatedPortraits[selectedNpc.id] ? (
                            <div className="hint-text">
                              {text.common.provider}: {generatedPortraits[selectedNpc.id]?.provider}
                              {"\n"}
                              {text.common.prompt}: {generatedPortraits[selectedNpc.id]?.revisedPrompt}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="empty-state">{text.gameScreen.npcSelectHint}</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeDrawer === "details" ? (
              <div className="game-drawer-body">
                <div className="screen-header">
                  <div>
                    <div className="eyebrow">{text.gameScreen.detailsEyebrow}</div>
                    <h2>{text.gameScreen.detailsTitle}</h2>
                    <p className="lead">{text.gameScreen.detailsDescription}</p>
                  </div>
                  <div className="button-row header-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setActiveDrawer("none")}
                      type="button"
                    >
                      {text.common.close}
                    </button>
                  </div>
                </div>

                <div className="grid-two">
                  <div className="summary-card">
                    <div className="meta-label">{text.gameScreen.sessionInfo}</div>
                    <div className="summary-text">
                      {text.gameScreen.sessionId(snapshot.session.id)}
                    </div>
                    <div className="summary-text">
                      {text.gameScreen.content(
                        snapshot.contentSummary.ruleTitle,
                        snapshot.contentSummary.storyTitle
                      )}
                    </div>
                    <div className="summary-text">
                      Model: {snapshot.session.modelAccessMode} /{" "}
                      {snapshot.session.settings.modelProfileId ?? "unknown"}
                    </div>
                  </div>

                  <div className="summary-card">
                    <div className="meta-label">{text.gameScreen.quickEndingTest}</div>
                    <div className="button-row">
                      <button
                        className="ghost-button"
                        disabled={!canUseQuickEndingTest || isSubmittingTurn || isInjectingManualNarration}
                        onClick={() => void onQuickEndingTest()}
                        type="button"
                      >
                        {isSubmittingTurn ? text.common.creating : text.gameScreen.quickEndingTest}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="meta-label">{text.gameScreen.manualNarrationTest}</div>
                  <div className="summary-text">
                    {text.gameScreen.manualNarrationTestDescription}
                  </div>
                  <label className="field">
                    <span>{text.gameScreen.manualNarrationInputLabel}</span>
                    <textarea
                      disabled={manualNarrationLocked}
                      onChange={(event) => setManualNarrationDraft(event.target.value)}
                      placeholder={text.gameScreen.manualNarrationInputPlaceholder}
                      value={manualNarrationDraft}
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="ghost-button"
                      disabled={manualNarrationLocked || manualNarrationDraft.trim().length === 0}
                      onClick={() => void handleManualNarrationSubmit()}
                      type="button"
                    >
                      {isInjectingManualNarration
                        ? text.gameScreen.manualNarrationSubmitting
                        : text.gameScreen.manualNarrationSubmit}
                    </button>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="meta-label">{text.gameScreen.endingJudge}</div>
                  {endingJudgeDecision ? (
                    <>
                      <div className="summary-title">
                        {endingJudgeDecision.GameOver
                          ? text.gameScreen.endingJudgeGameOverTrue
                          : text.gameScreen.endingJudgeGameOverFalse}
                      </div>
                      <div className="summary-text">{endingJudgeDecision.Reason}</div>
                      {endingJudgeDecision.GameOver && endingJudgeDecision.EndingTitle ? (
                        <div className="ai-meta-line">
                          {endingJudgeDecision.EndingTitle}
                        </div>
                      ) : null}
                      <div className="meta-label">{text.gameScreen.endingJudgeStructuredJson}</div>
                    </>
                  ) : null}
                  <pre>{endingJudgeJson}</pre>
                </div>

                {snapshot.session.settings.debugEnabled ? (
                  <>
                    <div className="summary-card">
                      <div className="game-panel-head">
                        <div>
                          <div className="meta-label">{text.gameScreen.memoryDebug}</div>
                          <div className="summary-text">
                            {text.gameScreen.memoryDebugDescription}
                          </div>
                        </div>
                        <button
                          className="ghost-button"
                          disabled={debugMemoryLoading || isRebuildingMemory}
                          onClick={() => void handleRebuildMemory()}
                          type="button"
                        >
                          {isRebuildingMemory
                            ? text.gameScreen.memoryRebuilding
                            : text.gameScreen.memoryRebuild}
                        </button>
                      </div>

                      {debugMemoryLoading ? (
                        <div className="empty-state">{text.common.loading}</div>
                      ) : null}
                      {debugMemoryError ? (
                        <div className="info-banner info-banner-warning">{debugMemoryError}</div>
                      ) : null}

                      {debugMemory ? (
                        <>
                          <div className="debug-memory-stats">
                            <div className="summary-text">
                              {text.gameScreen.memoryFacts(debugMemory.facts.length)}
                            </div>
                            <div className="summary-text">
                              {text.gameScreen.memoryOpenLoops(debugMemory.openLoops.length)}
                            </div>
                            <div className="summary-text">
                              {text.gameScreen.memoryEpisodes(
                                debugMemory.episodeSummaries.length
                              )}
                            </div>
                          </div>
                          <pre>{JSON.stringify(debugMemory, null, 2)}</pre>
                        </>
                      ) : !debugMemoryLoading ? (
                        <div className="empty-state">{text.gameScreen.noMemoryDebugData}</div>
                      ) : null}
                    </div>

                    <div className="summary-card">
                      <div className="meta-label">{text.gameScreen.narratorContextPack}</div>
                      <pre>
                        {debugNarratorContextPack?.assembledText ??
                          text.gameScreen.noMemoryDebugData}
                      </pre>
                    </div>

                    {debugCompanionParticipant ? (
                      <div className="summary-card">
                        <div className="meta-label">
                          {text.gameScreen.companionContextPack(
                            debugCompanionParticipant.displayName
                          )}
                        </div>
                        <pre>
                          {debugCompanionContextPack?.assembledText ??
                            text.gameScreen.noMemoryDebugData}
                        </pre>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div className="summary-card">
                  <div className="meta-label">{text.gameScreen.replayLog}</div>
                  <div className="replay-list">
                    {snapshot.replay.length ? (
                      snapshot.replay.map((event) => (
                        <article className="replay-item" key={event.id}>
                          <div className="replay-meta">
                            {event.type} / R{event.round}
                          </div>
                          <div className="replay-body">{event.summary}</div>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state">{text.gameScreen.noReplayLog}</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {comicLightboxPage ? (
        <div className="game-comic-lightbox" onClick={() => setComicLightboxPageNumber(null)}>
          <div
            className="game-comic-lightbox-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="game-comic-lightbox-head">
              <div>
                <div className="meta-label">
                  {text.gameScreen.comicPageLabel(comicLightboxPage.pageNumber)}
                </div>
                <div className="summary-text">
                  {formatDateTime(comicLightboxPage.createdAt)}
                </div>
              </div>
              <button
                className="ghost-button"
                onClick={() => setComicLightboxPageNumber(null)}
                type="button"
              >
                {text.common.close}
              </button>
            </div>

            <img
              alt={text.gameScreen.comicPageAlt(comicLightboxPage.pageNumber)}
              className="game-comic-lightbox-image"
              src={comicLightboxPage.image.apiPath}
            />

            <div className="button-row game-comic-lightbox-actions">
              <button
                className="ghost-button"
                disabled={!previousComicLightboxPage}
                onClick={() =>
                  setComicLightboxPageNumber(previousComicLightboxPage?.pageNumber ?? null)
                }
                type="button"
              >
                {text.gameScreen.comicPrevPage}
              </button>
              <button
                className="ghost-button"
                disabled={!nextComicLightboxPage}
                onClick={() => setComicLightboxPageNumber(nextComicLightboxPage?.pageNumber ?? null)}
                type="button"
              >
                {text.gameScreen.comicNextPage}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
