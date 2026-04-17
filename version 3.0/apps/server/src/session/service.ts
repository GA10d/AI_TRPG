import { randomUUID } from "node:crypto";

import {
  DEFAULT_LOG_VIEW_MODE,
  PHASE1_DEFAULTS,
  getDefaultModelProfileId
} from "../../../../packages/shared-config/src/index.ts";
import type {
  AdvancedTextModelConfigInput,
  AiAppearanceTag,
  AiGenerationMetadata,
  AiPersonalityTag,
  CommitRoundRequest,
  CreateSessionAiCompanionInput,
  CreateSessionRequest,
  Message,
  MultiAgentAgentOutput,
  MultiAgentRoundState,
  MultiAgentState,
  Participant,
  PrepareRoundRequest,
  ReplayEvent,
  RoundDraft,
  SendPrivateChatRequest,
  SaveBundle,
  SessionCreateStage,
  SessionMemory,
  Session,
  SessionAiCompanion,
  SessionAiPrimaryPlayerConfig,
  SessionContentSummary,
  SessionRuntimeContextPack,
  SessionSnapshot,
  StoryControlMode,
  SubmitTurnRequest,
  SubmitManualNarrationRequest,
  UpdateStoryControlModeRequest
} from "../../../../packages/shared-types/src/index.ts";
import {
  buildDicerUserPrompt,
  buildDirectorUserPrompt,
  buildMultiAgentSystemPrompt,
  buildNarratorUserPrompt,
  buildNpcManagerUserPrompt
} from "../multi_agent/service.ts";
import {
  generateAiPrivateChatReply,
  generateAiRoundDraft,
  resolveAiAppearanceTagsByIds,
  resolveAiPersonalityTagsByIds
} from "../ai_players/index.ts";
import { buildSystemCreatedMessage } from "../mock/index.ts";
import { loadPlayableContentBundle } from "../content/index.ts";
import { getModelGateway } from "../model_gateway/index.ts";
import {
  buildCompanionContextPack,
  buildDebugContextPack,
  buildNarratorContextPack,
  buildPrivateChatContextPack,
  createEmptySessionMemory,
  rebuildSnapshotMemory
} from "./memory.ts";
import {
  resolveNarratorRuntimeSelection,
  resolveParticipantRuntimeSelection
} from "./store.ts";
import type { InMemorySessionStore, SessionRuntimeConfig } from "./store.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function buildFallbackContentSummary(session: Session): SessionContentSummary {
  return {
    ruleTitle: session.ruleId,
    storyTitle: session.storyId,
    requestedLocale: session.locale,
    resolvedLocale: session.locale
  };
}

function inferMessageChannel(message: Message): Message["channel"] {
  if (message.channel) {
    return message.channel;
  }

  if (message.visibility === "system" || message.kind === "system") {
    return "system";
  }

  if (message.kind === "private_chat" || message.visibility === "private") {
    return "private_chat";
  }

  return "public_story";
}

function findLocalHumanParticipant(session: Session): Participant {
  const participantId = session.localHumanParticipantId ?? session.playerParticipantId;
  const participant = session.participants.find((item) => item.id === participantId);

  if (!participant) {
    throw new Error("Session is missing its local human participant.");
  }

  return participant;
}

function buildPrivateChatThreadId(localHumanParticipantId: string, targetParticipantId: string): string {
  return ["private_chat", localHumanParticipantId, targetParticipantId].join(":");
}

function formatPublicMessageSpeaker(session: Session, message: Message): string {
  if (message.kind === "gm_narration" || message.kind === "gm_dialogue") {
    return "Narrator";
  }

  const sender = session.participants.find((participant) => participant.id === message.senderId);
  if (!sender) {
    return "Unknown";
  }

  return formatParticipantActionLabel(session, message.senderId, sender.displayName);
}

function formatParticipantActionLabel(
  session: Session,
  participantId: string,
  fallbackName: string
): string {
  if (
    session.localHumanParticipantId &&
    participantId === session.localHumanParticipantId &&
    participantId !== session.playerParticipantId
  ) {
    return `Primary Player Action - ${fallbackName}`;
  }

  if (participantId === session.playerParticipantId) {
    return session.partySetup?.primaryPlayerMode === "ai"
      ? `AI Protagonist Action - ${fallbackName}`
      : `Primary Player Action - ${fallbackName}`;
  }

  if ((session.companionParticipantIds ?? []).includes(participantId)) {
    return `AI Teammate Action - ${fallbackName}`;
  }

  return fallbackName;
}

function buildConversationContext(
  session: Session,
  messages: Message[]
): string {
  return messages
    .filter((message) => inferMessageChannel(message) === "public_story")
    .map((message) => `[${formatPublicMessageSpeaker(session, message)}][R${message.round}] ${message.content}`)
    .join("\n\n");
}

function isNarratorBackgroundCompressionEnabled(session: Session): boolean {
  return session.settings.backgroundCompressionEnabled ?? true;
}

function buildNarratorConversationContext(input: {
  snapshot: SessionSnapshot;
  latestPlayerInput: string;
  round: number;
}): string {
  if (!isNarratorBackgroundCompressionEnabled(input.snapshot.session)) {
    return buildConversationContext(input.snapshot.session, input.snapshot.messages);
  }

  return buildNarratorContextPack({
    snapshot: input.snapshot,
    latestPlayerInput: input.latestPlayerInput,
    round: input.round
  }).assembledText;
}

function isMultiAgentSession(session: Session): boolean {
  return session.gmArchitecture === "multi_agent";
}

function createEmptyMultiAgentState(): MultiAgentState {
  return {
    rounds: [],
    directorTask: null
  };
}

function getMultiAgentState(session: Session): MultiAgentState {
  return session.gameState.multiAgent ?? createEmptyMultiAgentState();
}

function findMultiAgentRoundState(
  state: MultiAgentState,
  round: number
): MultiAgentRoundState | null {
  return state.rounds.find((item) => item.round === round) ?? null;
}

function findMultiAgentOutput(
  state: MultiAgentState,
  role: keyof Pick<MultiAgentRoundState, "dicer" | "npcManager" | "director">,
  round: number
): MultiAgentAgentOutput | null {
  return findMultiAgentRoundState(state, round)?.[role] ?? null;
}

function upsertMultiAgentOutput(input: {
  state: MultiAgentState | null | undefined;
  round: number;
  role: keyof Pick<MultiAgentRoundState, "dicer" | "npcManager" | "director">;
  output: MultiAgentAgentOutput;
  directorTask?: MultiAgentState["directorTask"];
}): MultiAgentState {
  const currentState = input.state ?? createEmptyMultiAgentState();
  const existingRoundIndex = currentState.rounds.findIndex((item) => item.round === input.round);
  const nextRoundState: MultiAgentRoundState =
    existingRoundIndex >= 0
      ? {
          ...currentState.rounds[existingRoundIndex],
          [input.role]: input.output
        }
      : {
          round: input.round,
          [input.role]: input.output
        };
  const nextRounds =
    existingRoundIndex >= 0
      ? currentState.rounds.map((item, index) =>
          index === existingRoundIndex ? nextRoundState : item
        )
      : [...currentState.rounds, nextRoundState].sort((left, right) => left.round - right.round);

  return {
    ...currentState,
    rounds: nextRounds,
    directorTask: input.directorTask ?? currentState.directorTask ?? null
  };
}

function updateMultiAgentDirectorTask(
  state: MultiAgentState | null | undefined,
  directorTask: MultiAgentState["directorTask"]
): MultiAgentState {
  const currentState = state ?? createEmptyMultiAgentState();
  return {
    ...currentState,
    directorTask
  };
}

function buildPublicHistoryContext(
  session: Session,
  messages: Message[],
  maxRound?: number
): string {
  return messages
    .filter((message) => inferMessageChannel(message) === "public_story")
    .filter((message) => (typeof maxRound === "number" ? message.round <= maxRound : true))
    .map((message) => `[${formatPublicMessageSpeaker(session, message)}][R${message.round}] ${message.content}`)
    .join("\n\n");
}

function buildPublicRoundContext(
  session: Session,
  messages: Message[],
  round: number
): string {
  const lines = messages
    .filter((message) => inferMessageChannel(message) === "public_story" && message.round === round)
    .map((message) => `[${formatPublicMessageSpeaker(session, message)}][R${message.round}] ${message.content}`);

  return lines.length > 0 ? lines.join("\n") : `No public story items were recorded for round ${round}.`;
}

function buildSubmittedInputContext(
  session: Session,
  drafts: Array<{
    participantId: string;
    displayName: string;
    content: string;
  }>,
  round: number
): string {
  if (!drafts.length) {
    return `No submitted party inputs were recorded for round ${round}.`;
  }

  return drafts
    .map(
      (draft) =>
        `[${formatParticipantActionLabel(session, draft.participantId, draft.displayName)}][R${round}] ${draft.content}`
    )
    .join("\n");
}

function buildMultiAgentHistoryContext(
  state: MultiAgentState,
  role: keyof Pick<MultiAgentRoundState, "npcManager" | "director">,
  maxRound: number
): string {
  const lines = state.rounds
    .filter((item) => item.round <= maxRound)
    .map((item) => {
      const output = item[role];
      if (!output?.content.trim()) {
        return "";
      }

      const label = role === "npcManager" ? "NPC Manager" : "Director";
      return [`[${label}][R${item.round}]`, output.content.trim()].join("\n");
    })
    .filter(Boolean);

  if (!lines.length) {
    return role === "npcManager"
      ? "No previous NPC Manager outputs are recorded yet."
      : "No previous Director outputs are recorded yet.";
  }

  return lines.join("\n\n");
}

function buildMultiAgentSharedPublicContext(input: {
  snapshot: SessionSnapshot;
  latestPlayerInput: string;
  round: number;
}): string {
  if (!isNarratorBackgroundCompressionEnabled(input.snapshot.session)) {
    return (
      buildPublicHistoryContext(
        input.snapshot.session,
        input.snapshot.messages,
        input.round
      ) || "No shared public context yet."
    );
  }

  return buildNarratorContextPack({
    snapshot: input.snapshot,
    latestPlayerInput: input.latestPlayerInput,
    round: input.round
  }).assembledText;
}

function buildPrivateThreadContext(
  session: Session,
  messages: Message[],
  threadId: string,
  maxMessages = 10
): string {
  const threadMessages = messages
    .filter(
      (message) =>
        inferMessageChannel(message) === "private_chat" && message.threadId === threadId
    )
    .slice(-maxMessages);

  if (!threadMessages.length) {
    return "No private chat history yet.";
  }

  return threadMessages
    .map((message) => {
      const sender =
        session.participants.find((participant) => participant.id === message.senderId)?.displayName ??
        "Unknown";
      return `${sender}: ${message.content}`;
    })
    .join("\n");
}

function buildRelevantPrivateContextForParticipant(
  session: Session,
  messages: Message[],
  participantId: string
): string {
  if (!(session.companionParticipantIds ?? []).includes(participantId)) {
    return "No relevant private chat history for this character.";
  }

  const localHumanParticipant = findLocalHumanParticipant(session);
  const threadId = buildPrivateChatThreadId(localHumanParticipant.id, participantId);
  const threadContext = buildPrivateThreadContext(session, messages, threadId);

  return [
    `Private chat with ${localHumanParticipant.displayName}:`,
    threadContext
  ].join("\n");
}

function findPrimaryPlayerParticipant(session: Session): Participant {
  const participant = session.participants.find(
    (item) => item.id === session.playerParticipantId
  );

  if (!participant) {
    throw new Error("Session is missing its primary player participant.");
  }

  return participant;
}

function findGmParticipant(session: Session): Participant {
  const participant = session.participants.find((item) => item.role === "gm");

  if (!participant) {
    throw new Error("Session is missing its GM participant.");
  }

  return participant;
}

function buildDraftFromText(input: {
  participant: Participant;
  content: string;
  source: "human" | "ai";
  isPrimary: boolean;
  editable: boolean;
  generatedAt?: string | null;
  aiMetadata?: AiGenerationMetadata | null;
}): RoundDraft {
  return {
    participantId: input.participant.id,
    displayName: input.participant.displayName,
    role: input.participant.role,
    isPrimary: input.isPrimary,
    status: "ready",
    source: input.source,
    content: input.content.trim(),
    editable: input.editable,
    generatedAt: input.generatedAt ?? null,
    aiMetadata: input.aiMetadata ?? null
  };
}

function buildCommittedPartyInput(session: Session, drafts: RoundDraft[]): string {
  return drafts
    .map(
      (draft) =>
        `${formatParticipantActionLabel(session, draft.participantId, draft.displayName)}: ${draft.content}`
    )
    .join("\n");
}

function getCompanionParticipants(session: Session): Participant[] {
  const companionIds = new Set(session.companionParticipantIds ?? []);
  return session.participants.filter((participant) => companionIds.has(participant.id));
}

function getCompanionTagMap(session: Session): Map<string, AiPersonalityTag[]> {
  return new Map(
    (session.partySetup?.aiCompanions ?? []).map((companion) => [
      companion.participantId,
      companion.personalityTags
    ])
  );
}

function getCompanionAppearanceTagMap(session: Session): Map<string, AiAppearanceTag[]> {
  return new Map(
    (session.partySetup?.aiCompanions ?? []).map((companion) => [
      companion.participantId,
      companion.appearanceTags
    ])
  );
}

function buildStoryRecipientIds(session: Session): string[] {
  return [
    session.localHumanParticipantId ?? session.playerParticipantId,
    session.playerParticipantId,
    ...(session.companionParticipantIds ?? [])
  ].filter((participantId, index, items) => items.indexOf(participantId) === index);
}

function buildSaveReplayEvent(sessionId: string, savedAt: string): ReplayEvent {
  return {
    id: `evt_${randomUUID()}`,
    round: 0,
    createdAt: savedAt,
    actorId: "system",
    type: "save_created",
    displayLevel: "core",
    summary: `Save created for session ${sessionId}`,
    payload: {
      savedAt
    }
  };
}

function buildLoadReplayEvent(sessionId: string, savedAt: string, loadedAt: string): ReplayEvent {
  return {
    id: `evt_${randomUUID()}`,
    round: 0,
    createdAt: loadedAt,
    actorId: "system",
    type: "save_loaded",
    displayLevel: "core",
    summary: `Save loaded for session ${sessionId}`,
    payload: {
      savedAt,
      loadedAt
    }
  };
}

type SessionCreateProgressHandler = (event: {
  stage: SessionCreateStage;
  label: string;
  detail: string;
  progress: number;
}) => void | Promise<void>;

type CreateSessionSnapshotOptions = {
  onStage?: SessionCreateProgressHandler;
};

type TurnResolutionProgressHandler = (event: {
  stage: "requesting_narrator" | "waiting_turn_narration" | "judging_ending" | "finalizing_turn" | "memory_deferred";
  label: string;
  detail: string;
  progress: number;
}) => void | Promise<void>;

type TurnResolutionOptions = {
  onStage?: TurnResolutionProgressHandler;
};

type SessionRoleModelConfig = NonNullable<
  NonNullable<SessionRuntimeConfig["roleModelConfigs"]>["narrator"]
>;

async function emitCreateSessionStage(
  options: CreateSessionSnapshotOptions | undefined,
  stage: SessionCreateStage,
  label: string,
  detail: string,
  progress: number
): Promise<void> {
  await options?.onStage?.({
    stage,
    label,
    detail,
    progress
  });
}

function buildSaveBundle(
  snapshot: SessionSnapshot,
  runtimeConfig: SessionRuntimeConfig | null,
  savedAt: string,
  worldlineId?: string | null
): SaveBundle {
  return {
    schemaVersion: snapshot.session.schemaVersion,
    savedAt,
    worldlineId: worldlineId ?? undefined,
    session: snapshot.session,
    messages: snapshot.messages,
    replay: snapshot.replay,
    contentSummary: snapshot.contentSummary,
    memory: snapshot.memory,
    runtimeConfig: runtimeConfig ?? undefined
  };
}

async function resolveSessionAiCompanions(
  aiCompanions: CreateSessionAiCompanionInput[] | undefined
): Promise<SessionAiCompanion[]> {
  const normalizedCompanions = (aiCompanions ?? []).slice(0, 3);

  return Promise.all(
    normalizedCompanions.map(async (companion, index) => {
      const displayName = companion.displayName.trim() || `AI Companion ${index + 1}`;
      const [personalityTags, appearanceTags] = await Promise.all([
        resolveAiPersonalityTagsByIds(companion.personalityTagIds ?? []),
        resolveAiAppearanceTagsByIds(companion.appearanceTagIds ?? [])
      ]);

      return {
        participantId: `companion_${randomUUID()}`,
        displayName,
        personalityTags,
        appearanceTags
      };
    })
  );
}

async function resolvePrimaryPlayerAiConfig(
  request: CreateSessionRequest,
  primaryPlayerMode: "human" | "ai"
): Promise<SessionAiPrimaryPlayerConfig | undefined> {
  if (primaryPlayerMode !== "ai") {
    return undefined;
  }

  const [personalityTags, appearanceTags] = await Promise.all([
    resolveAiPersonalityTagsByIds(request.primaryPlayerPersonalityTagIds ?? []),
    resolveAiAppearanceTagsByIds(request.primaryPlayerAppearanceTagIds ?? [])
  ]);

  return {
    displayName: request.primaryPlayerDisplayName?.trim() || "AI主角",
    personalityTags,
    appearanceTags
  };
}

function normalizeRuntimeModelConfig(
  input: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  } | null | undefined
): SessionRoleModelConfig["runtimeModelConfig"] | undefined {
  const apiKey = input?.apiKey?.trim() ?? "";
  const baseUrl = input?.baseUrl?.trim() ?? "";
  const model = input?.model?.trim() ?? "";

  if (!apiKey && !baseUrl && !model) {
    return undefined;
  }

  return {
    apiKey,
    baseUrl,
    model
  };
}

function normalizeRoleModelConfig(
  input:
    | AdvancedTextModelConfigInput["narrator"]
    | AdvancedTextModelConfigInput["primaryPlayer"]
    | null
    | undefined
): SessionRoleModelConfig | undefined {
  if (!input) {
    return undefined;
  }

  const modelProfileId = input.modelProfileId?.trim() ?? "";
  const runtimeModelConfig = normalizeRuntimeModelConfig(input.runtimeModelConfig);
  if (!modelProfileId && !runtimeModelConfig) {
    return undefined;
  }

  return {
    modelProfileId: modelProfileId || undefined,
    runtimeModelConfig
  };
}

function buildCreateSessionRuntimeConfig(input: {
  request: CreateSessionRequest;
  primaryPlayerMode: "human" | "ai";
  playerParticipantId: string;
  aiCompanions: SessionAiCompanion[];
}): SessionRuntimeConfig {
  const globalModelProfileId =
    input.request.modelProfileId ??
    getDefaultModelProfileId(input.request.modelAccessMode);
  const globalRuntimeConfig = normalizeRuntimeModelConfig(input.request.runtimeModelConfig);
  const narratorConfig = normalizeRoleModelConfig(
    input.request.advancedTextModelConfig?.narrator
  );
  const primaryPlayerConfig =
    input.primaryPlayerMode === "ai"
      ? normalizeRoleModelConfig(input.request.advancedTextModelConfig?.primaryPlayer)
      : undefined;
  const participantConfigs: NonNullable<
    NonNullable<SessionRuntimeConfig["roleModelConfigs"]>["participants"]
  > = {};

  if (primaryPlayerConfig) {
    participantConfigs[input.playerParticipantId] = primaryPlayerConfig;
  }

  (input.request.advancedTextModelConfig?.companionOverrides ?? []).forEach(
    (companionConfig, index) => {
      const normalizedConfig = normalizeRoleModelConfig(companionConfig);
      const companion = input.aiCompanions[index];
      if (normalizedConfig && companion) {
        participantConfigs[companion.participantId] = normalizedConfig;
      }
    }
  );

  const hasParticipantConfigs = Object.keys(participantConfigs).length > 0;
  const roleModelConfigs =
    narratorConfig || hasParticipantConfigs
      ? {
          narrator: narratorConfig,
          participants: hasParticipantConfigs ? participantConfigs : undefined
        }
      : undefined;

  return {
    modelProfileId: globalModelProfileId,
    runtimeModelConfig: globalRuntimeConfig,
    roleModelConfigs
  };
}

async function createSessionSnapshotInternal(
  contentRoot: string,
  request: CreateSessionRequest,
  store: InMemorySessionStore,
  options?: CreateSessionSnapshotOptions
): Promise<SessionSnapshot> {
  await emitCreateSessionStage(
    options,
    "loading_content",
    "读取规则与剧本",
    "正在加载 rule / story 文本，以及当前剧本的基础内容。",
    0.2
  );
  const bundle = await loadPlayableContentBundle(
    contentRoot,
    request.ruleDirectoryName,
    request.storyDirectoryName,
    request.locale
  );

  const timestamp = nowIso();
  const sessionId = randomUUID();
  const gmParticipantId = `gm_${randomUUID()}`;
  const playerParticipantId = `player_${randomUUID()}`;
  const primaryPlayerMode = request.playMode === "story_mode" ? "ai" : "human";
  const localHumanParticipantId =
    primaryPlayerMode === "ai" ? `local_${randomUUID()}` : playerParticipantId;
  const primaryPlayerConfig = await resolvePrimaryPlayerAiConfig(request, primaryPlayerMode);
  const primaryPlayerDisplayName =
    primaryPlayerMode === "ai"
      ? primaryPlayerConfig?.displayName?.trim() || "AI主角"
      : "玩家";
  const aiCompanions = await resolveSessionAiCompanions(request.aiCompanions);
  const ruleTitle =
    bundle.rule.manifest.title[bundle.rule.manifest.defaultLocale] ?? bundle.rule.manifest.id;
  const storyTitle =
    bundle.story.manifest.title[bundle.story.manifest.defaultLocale] ?? bundle.story.manifest.id;
  const globalModelProfileId =
    request.modelProfileId ?? getDefaultModelProfileId(request.modelAccessMode);
  const globalRuntimeModelConfig = normalizeRuntimeModelConfig(request.runtimeModelConfig);
  const narratorRuntimeConfig =
    normalizeRoleModelConfig(request.advancedTextModelConfig?.narrator)?.runtimeModelConfig ??
    globalRuntimeModelConfig;
  const narratorModelProfileId =
    normalizeRoleModelConfig(request.advancedTextModelConfig?.narrator)?.modelProfileId ??
    globalModelProfileId;
  const characterConcept = request.characterConcept?.trim() ?? "";
  const modelGateway = getModelGateway(request.modelAccessMode);
  const storyRecipientIds = [
    localHumanParticipantId,
    playerParticipantId,
    ...aiCompanions.map((companion) => companion.participantId)
  ].filter((participantId, index, items) => items.indexOf(participantId) === index);

  await emitCreateSessionStage(
    options,
    "assembling_prompt",
    "整理 Narrator 输入",
    "正在组合 narrator prompt、rule.txt、story.txt 和 player_info.txt。",
    0.42
  );

  await emitCreateSessionStage(
    options,
    "requesting_narrator",
    "请求 Narrator Agent",
    "正在把会话开场材料发送给模型，准备生成第一段叙事。",
    0.64
  );

  const openingPromise = modelGateway.generateInitialSessionNarration({
    accessMode: request.modelAccessMode,
    modelProfileId: narratorModelProfileId,
    runtimeModelConfig: narratorRuntimeConfig,
    locale: bundle.resolvedLocale,
    difficulty: request.difficulty,
    gmArchitecture: request.gmArchitecture,
    ruleTitle,
    ruleText: bundle.rule.rule.content,
    storyTitle,
    storyText: bundle.story.story.content,
    playerInfo: characterConcept
  });
  await emitCreateSessionStage(
    options,
    "waiting_first_reply",
    "等待首条叙事返回",
    "模型已经开始处理开场，正在等待第一条正式 narration 完成。",
    0.84
  );
  const openingResult = await openingPromise;

  await emitCreateSessionStage(
    options,
    "finalizing_session",
    "写入会话快照",
    "正在把首条叙事和本局配置写入正式会话。",
    0.96
  );

  const session: Session = {
    id: sessionId,
    schemaVersion: "0.2.0",
    status: "active",
    playMode: request.playMode,
    gmArchitecture: request.gmArchitecture,
    modelAccessMode: request.modelAccessMode,
    locale: bundle.resolvedLocale,
    ruleId: bundle.rule.manifest.id,
    storyId: bundle.story.manifest.id,
    currentRound: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    participants: [
      ...(primaryPlayerMode === "ai"
        ? [
            {
              id: localHumanParticipantId,
              role: "human_player" as const,
              displayName: "玩家",
              isAiControlled: false,
              isLocalUser: true,
              locale: bundle.resolvedLocale
            }
          ]
        : []),
      {
        id: playerParticipantId,
        role: primaryPlayerMode === "ai" ? "ai_player" : "human_player",
        displayName: primaryPlayerDisplayName,
        isAiControlled: primaryPlayerMode === "ai",
        isLocalUser: primaryPlayerMode !== "ai",
        locale: bundle.resolvedLocale
      },
      ...aiCompanions.map((companion) => ({
        id: companion.participantId,
        role: "ai_player" as const,
        displayName: companion.displayName,
        isAiControlled: true,
        isLocalUser: false,
        locale: bundle.resolvedLocale
      })),
      {
        id: gmParticipantId,
        role: "gm",
        displayName: "主持人",
        isAiControlled: true,
        isLocalUser: false,
        locale: bundle.resolvedLocale
      }
    ],
    playerParticipantId,
    localHumanParticipantId,
    companionParticipantIds: aiCompanions.map((companion) => companion.participantId),
    settings: {
      logViewMode: request.logViewMode ?? DEFAULT_LOG_VIEW_MODE,
      difficulty: request.difficulty,
      backgroundCompressionEnabled: request.backgroundCompressionEnabled ?? true,
      debugEnabled: request.debugEnabled ?? true,
      promptDebugEnabled: request.promptDebugEnabled ?? false,
      modelProfileId: narratorModelProfileId
    },
    partySetup: {
      primaryPlayerMode,
      primaryPlayerConfig,
      aiCompanions
    },
    gameState: {
      phase: "playing",
      endingState: null,
      lastEndingJudgeResult: null,
      lastEndingJudgeDecision: null,
      roundInputState: null,
      storyControlMode: primaryPlayerMode === "ai" ? "intervene" : null,
      multiAgent:
        request.gmArchitecture === "multi_agent"
          ? createEmptyMultiAgentState()
          : null
    }
  };

  const messages: Message[] = [
    buildSystemCreatedMessage(
      localHumanParticipantId,
      storyTitle,
      String(bundle.resolvedLocale),
      timestamp
    )
  ];

  if (characterConcept.length > 0) {
    messages.push({
      id: `msg_${randomUUID()}`,
      round: 0,
      createdAt: timestamp,
      senderId: playerParticipantId,
      recipientIds: [gmParticipantId],
      visibility: "gm_only",
      kind: "player_input",
      channel: "system",
      content: characterConcept,
      tags: ["player_info", "character_concept"]
    });
  }

  messages.push({
    id: `msg_${randomUUID()}`,
    round: 0,
    createdAt: timestamp,
    senderId: gmParticipantId,
    recipientIds: storyRecipientIds,
    visibility: "public",
    kind: "gm_narration",
    channel: "public_story",
    content: openingResult.text,
    aiMetadata: openingResult.meta,
    tags: ["opening", `provider:${openingResult.provider}`]
  });

  const replay: ReplayEvent[] = [
    {
      id: `evt_${randomUUID()}`,
      round: 0,
      createdAt: timestamp,
      actorId: "system",
      type: "session_created",
      displayLevel: "core",
      summary: `Session ${sessionId} created for ${storyTitle}`,
      payload: {
        ruleId: session.ruleId,
        storyId: session.storyId,
        locale: session.locale,
        primaryPlayerMode,
        aiCompanionCount: aiCompanions.length
      }
    },
    {
      id: `evt_${randomUUID()}`,
      round: 0,
      createdAt: timestamp,
      actorId: "system",
      type: "message_created",
      displayLevel: "detail",
      summary: "System welcome message recorded",
      payload: {
        messageId: messages[0]?.id ?? null
      }
    }
  ];

  if (characterConcept.length > 0) {
    replay.push({
      id: `evt_${randomUUID()}`,
      round: 0,
      createdAt: timestamp,
      actorId: playerParticipantId,
      type: "message_created",
      displayLevel: "detail",
      summary: "Player setup recorded",
      payload: {
        messageId: messages[1]?.id ?? null
      }
    });
  }

  replay.push({
    id: `evt_${randomUUID()}`,
    round: 0,
    createdAt: timestamp,
    actorId: gmParticipantId,
    type: "gm_response_received",
    displayLevel: "core",
    summary: "Opening narration generated",
    payload: {
      messageId: messages.at(-1)?.id ?? null,
      mode: request.modelAccessMode,
      provider: openingResult.provider
    }
  });

  const snapshot: SessionSnapshot = {
    session,
    messages,
    replay,
    memory: createEmptySessionMemory(timestamp),
    contentSummary: {
      ruleTitle,
      storyTitle,
      requestedLocale: request.locale,
      resolvedLocale: bundle.resolvedLocale,
      ruleDirectoryName: request.ruleDirectoryName,
      storyDirectoryName: request.storyDirectoryName
    }
  };

  const sessionRuntimeConfig = buildCreateSessionRuntimeConfig({
    request,
    primaryPlayerMode,
    playerParticipantId,
    aiCompanions
  });

  store.save(snapshot, sessionRuntimeConfig);
  if (request.gmArchitecture === "multi_agent") {
    void queueDirectorGeneration(sessionId, 0, contentRoot, store).catch(() => {});
  }
  scheduleBackgroundMemoryRefresh(sessionId, store);
  return snapshot;
}

export async function createSessionSnapshot(
  contentRoot: string,
  request: CreateSessionRequest,
  store: InMemorySessionStore
): Promise<SessionSnapshot> {
  return createSessionSnapshotInternal(contentRoot, request, store);
}

export async function createSessionSnapshotWithProgress(
  contentRoot: string,
  request: CreateSessionRequest,
  store: InMemorySessionStore,
  options?: CreateSessionSnapshotOptions
): Promise<SessionSnapshot> {
  return createSessionSnapshotInternal(contentRoot, request, store, options);
}

export function buildDefaultCreateSessionRequest(): CreateSessionRequest {
  return {
    ruleDirectoryName: "VHS",
    storyDirectoryName: "The_Silence",
    locale: PHASE1_DEFAULTS.locale,
    playMode: PHASE1_DEFAULTS.playMode,
    difficulty: PHASE1_DEFAULTS.difficulty,
    gmArchitecture: PHASE1_DEFAULTS.gmArchitecture,
    backgroundCompressionEnabled: PHASE1_DEFAULTS.backgroundCompressionEnabled,
    modelAccessMode: PHASE1_DEFAULTS.modelAccessMode,
    characterConcept: "",
    modelProfileId: PHASE1_DEFAULTS.modelProfileId,
    debugEnabled: true,
    promptDebugEnabled: false,
    logViewMode: PHASE1_DEFAULTS.logViewMode
  };
}

export async function prepareRound(
  sessionId: string,
  request: PrepareRoundRequest,
  store: InMemorySessionStore
): Promise<SessionSnapshot | null> {
  const current = store.get(sessionId);
  if (!current) {
    return null;
  }

  if (current.session.status === "ended") {
    throw new Error("The current session has already reached an ending and cannot prepare another round.");
  }

  const timestamp = nowIso();
  const targetRound = current.session.currentRound + 1;
  const primaryParticipant = findPrimaryPlayerParticipant(current.session);
  const companionParticipants = getCompanionParticipants(current.session);
  const companionTagMap = getCompanionTagMap(current.session);
  const companionAppearanceTagMap = getCompanionAppearanceTagMap(current.session);
  const runtimeConfig = store.getRuntimeConfig(sessionId);
  const preparedDrafts: RoundDraft[] = [];

  if (primaryParticipant.role === "human_player") {
    const trimmedInput = request.playerInput?.trim() ?? "";
    if (!trimmedInput) {
      throw new Error("Player input cannot be empty when preparing a round.");
    }

    preparedDrafts.push(
      buildDraftFromText({
        participant: primaryParticipant,
        content: trimmedInput,
        source: "human",
        isPrimary: true,
        editable: true
      })
    );
  } else {
    const primaryContextPack = buildCompanionContextPack({
      snapshot: current,
      participantId: primaryParticipant.id,
      round: targetRound,
      preparedInputs: []
    });
    const primaryRuntimeSelection = resolveParticipantRuntimeSelection(
      current.session,
      runtimeConfig,
      primaryParticipant.id
    );
    const generatedPrimaryDraft = await generateAiRoundDraft({
      accessMode: current.session.modelAccessMode,
      modelProfileId: primaryRuntimeSelection.modelProfileId,
      runtimeModelConfig: primaryRuntimeSelection.runtimeModelConfig,
      locale: current.session.locale,
      storyTitle: current.contentSummary.storyTitle,
      round: targetRound,
      participant: primaryParticipant,
      isPrimary: true,
      personalityTags: current.session.partySetup?.primaryPlayerConfig?.personalityTags ?? [],
      appearanceTags: current.session.partySetup?.primaryPlayerConfig?.appearanceTags ?? [],
      participants: current.session.participants,
      messages: current.messages,
      publicStoryContext: primaryContextPack.assembledText,
      privateContext: "Private context is already included in the runtime context pack above.",
      preparedInputs: []
    });

    preparedDrafts.push({
      ...generatedPrimaryDraft,
      editable: true
    });
  }

  const companionDrafts = await Promise.all(
    companionParticipants.map((participant) => {
      const companionContextPack = buildCompanionContextPack({
        snapshot: current,
        participantId: participant.id,
        round: targetRound,
        preparedInputs: preparedDrafts
      });
      const companionRuntimeSelection = resolveParticipantRuntimeSelection(
        current.session,
        runtimeConfig,
        participant.id
      );

      return generateAiRoundDraft({
        accessMode: current.session.modelAccessMode,
        modelProfileId: companionRuntimeSelection.modelProfileId,
        runtimeModelConfig: companionRuntimeSelection.runtimeModelConfig,
        locale: current.session.locale,
        storyTitle: current.contentSummary.storyTitle,
        round: targetRound,
        participant,
        isPrimary: false,
        personalityTags: companionTagMap.get(participant.id) ?? [],
        appearanceTags: companionAppearanceTagMap.get(participant.id) ?? [],
        participants: current.session.participants,
        messages: current.messages,
        publicStoryContext: companionContextPack.assembledText,
        privateContext: "Private context is already included in the runtime context pack above.",
        preparedInputs: preparedDrafts
      });
    })
  );

  const nextRoundState = {
    round: targetRound,
    phase: "ready_to_commit" as const,
    preparedAt: timestamp,
    drafts: [
      ...preparedDrafts,
      ...companionDrafts
    ]
  };

  return store.update(sessionId, (latest) => ({
    ...latest,
    session: {
      ...latest.session,
      updatedAt: timestamp,
      gameState: {
        ...latest.session.gameState,
        roundInputState: nextRoundState
      }
    },
    replay: [
      ...latest.replay,
      {
        id: `evt_${randomUUID()}`,
        round: targetRound,
        createdAt: timestamp,
        actorId: primaryParticipant.id,
        type: "round_prepared",
        displayLevel: "core",
        summary: `Prepared round ${targetRound} drafts`,
        payload: {
          participantCount: nextRoundState.drafts.length,
          aiDraftCount: companionDrafts.length + (primaryParticipant.role === "ai_player" ? 1 : 0)
        }
      }
    ]
  }));
}

async function loadSessionContentBundle(
  contentRoot: string,
  snapshot: SessionSnapshot
): Promise<Awaited<ReturnType<typeof loadPlayableContentBundle>>> {
  return loadPlayableContentBundle(
    contentRoot,
    snapshot.contentSummary.ruleDirectoryName ?? snapshot.session.ruleId,
    snapshot.contentSummary.storyDirectoryName ?? snapshot.session.storyId,
    snapshot.contentSummary.resolvedLocale
  );
}

function buildStoredAgentOutput(input: {
  content: string;
  provider: string;
  meta?: AiGenerationMetadata | null;
  createdAt?: string;
}): MultiAgentAgentOutput {
  return {
    createdAt: input.createdAt ?? nowIso(),
    content: input.content.trim(),
    provider: input.provider,
    meta: input.meta ?? null
  };
}

const directorGenerationChains = new Map<string, Promise<void>>();
const directorRoundPromises = new Map<string, Map<number, Promise<void>>>();

function getDirectorRoundPromiseMap(sessionId: string): Map<number, Promise<void>> {
  const existing = directorRoundPromises.get(sessionId);
  if (existing) {
    return existing;
  }

  const created = new Map<number, Promise<void>>();
  directorRoundPromises.set(sessionId, created);
  return created;
}

function setDirectorTaskState(
  sessionId: string,
  store: InMemorySessionStore,
  directorTask: MultiAgentState["directorTask"]
): void {
  store.update(sessionId, (current) => ({
    ...current,
    session: {
      ...current.session,
      gameState: {
        ...current.session.gameState,
        multiAgent: updateMultiAgentDirectorTask(
          current.session.gameState.multiAgent,
          directorTask
        )
      }
    }
  }));
}

function markDirectorTaskReady(
  sessionId: string,
  store: InMemorySessionStore,
  round: number,
  timestamp: string
): void {
  setDirectorTaskState(sessionId, store, {
    round,
    status: "ready",
    queuedAt: timestamp,
    startedAt: timestamp,
    completedAt: timestamp,
    error: null
  });
}

function queueDirectorGeneration(
  sessionId: string,
  targetRound: number,
  contentRoot: string,
  store: InMemorySessionStore
): Promise<void> {
  const latestSnapshot = store.get(sessionId);
  if (!latestSnapshot || !isMultiAgentSession(latestSnapshot.session)) {
    return Promise.resolve();
  }

  if (latestSnapshot.session.status === "ended") {
    return Promise.resolve();
  }

  const existingOutput = findMultiAgentOutput(
    getMultiAgentState(latestSnapshot.session),
    "director",
    targetRound
  );
  if (existingOutput) {
    markDirectorTaskReady(sessionId, store, targetRound, existingOutput.createdAt);
    return Promise.resolve();
  }

  const roundPromiseMap = getDirectorRoundPromiseMap(sessionId);
  const existingPromise = roundPromiseMap.get(targetRound);
  if (existingPromise) {
    return existingPromise;
  }

  const queuedAt = nowIso();
  setDirectorTaskState(sessionId, store, {
    round: targetRound,
    status: "queued",
    queuedAt,
    startedAt: null,
    completedAt: null,
    error: null
  });

  const previous = directorGenerationChains.get(sessionId) ?? Promise.resolve();
  const promise = previous
    .catch(() => {})
    .then(async () => {
      const beforeRun = store.get(sessionId);
      if (!beforeRun || !isMultiAgentSession(beforeRun.session) || beforeRun.session.status === "ended") {
        return;
      }

      const alreadyReady = findMultiAgentOutput(
        getMultiAgentState(beforeRun.session),
        "director",
        targetRound
      );
      if (alreadyReady) {
        markDirectorTaskReady(sessionId, store, targetRound, alreadyReady.createdAt);
        return;
      }

      const startedAt = nowIso();
      setDirectorTaskState(sessionId, store, {
        round: targetRound,
        status: "running",
        queuedAt,
        startedAt,
        completedAt: null,
        error: null
      });

      const runtimeConfig = store.getRuntimeConfig(sessionId);
      const narratorRuntimeSelection = resolveNarratorRuntimeSelection(
        beforeRun.session,
        runtimeConfig
      );
      const modelGateway = getModelGateway(beforeRun.session.modelAccessMode);
      const bundle = await loadSessionContentBundle(contentRoot, beforeRun);
      const sharedPublicContext = buildMultiAgentSharedPublicContext({
        snapshot: beforeRun,
        latestPlayerInput: "",
        round: targetRound
      });
      const directorHistory = buildMultiAgentHistoryContext(
        getMultiAgentState(beforeRun.session),
        "director",
        targetRound - 1
      );
      const directorResult = await modelGateway.generatePromptedText({
        accessMode: beforeRun.session.modelAccessMode,
        modelProfileId: narratorRuntimeSelection.modelProfileId,
        runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
        locale: beforeRun.session.locale,
        systemPrompt: await buildMultiAgentSystemPrompt(
          "director",
          beforeRun.session.locale,
          beforeRun.session.settings.difficulty ?? PHASE1_DEFAULTS.difficulty
        ),
        userPrompt: buildDirectorUserPrompt({
          bundle,
          locale: beforeRun.session.locale,
          round: targetRound,
          sharedPublicContext,
          ownHistory: directorHistory
        })
      });
      const output = buildStoredAgentOutput({
        content: directorResult.text,
        provider: directorResult.provider,
        meta: directorResult.meta
      });

      store.update(sessionId, (current) => ({
        ...current,
        session: {
          ...current.session,
          gameState: {
            ...current.session.gameState,
            multiAgent: upsertMultiAgentOutput({
              state: updateMultiAgentDirectorTask(current.session.gameState.multiAgent, {
                round: targetRound,
                status: "ready",
                queuedAt,
                startedAt,
                completedAt: output.createdAt,
                error: null
              }),
              round: targetRound,
              role: "director",
              output
            })
          }
        }
      }));
    })
    .catch((error) => {
      setDirectorTaskState(sessionId, store, {
        round: targetRound,
        status: "failed",
        queuedAt,
        startedAt: null,
        completedAt: nowIso(),
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    })
    .finally(() => {
      const currentRoundPromises = directorRoundPromises.get(sessionId);
      currentRoundPromises?.delete(targetRound);
      if (currentRoundPromises && currentRoundPromises.size === 0) {
        directorRoundPromises.delete(sessionId);
      }

      if (directorGenerationChains.get(sessionId) === promise) {
        directorGenerationChains.delete(sessionId);
      }
    });

  roundPromiseMap.set(targetRound, promise);
  directorGenerationChains.set(sessionId, promise);
  return promise;
}

async function waitForDirectorOutput(input: {
  sessionId: string;
  currentSnapshot: SessionSnapshot;
  contentRoot: string;
  store: InMemorySessionStore;
  options?: TurnResolutionOptions;
}): Promise<MultiAgentAgentOutput | null> {
  const targetRound = input.currentSnapshot.session.currentRound;
  if (targetRound < 0) {
    return null;
  }

  const currentState = getMultiAgentState(input.currentSnapshot.session);
  const existingOutput = findMultiAgentOutput(currentState, "director", targetRound);
  if (existingOutput) {
    return existingOutput;
  }

  await emitTurnResolutionStage(
    input.options,
    "waiting_director",
    "等待 Director 输出",
    `正在等待第 ${targetRound} 轮 Director 后台指导完成。`,
    0.12
  );
  await queueDirectorGeneration(
    input.sessionId,
    targetRound,
    input.contentRoot,
    input.store
  );

  const latestSnapshot = input.store.get(input.sessionId);
  if (!latestSnapshot) {
    return null;
  }

  return findMultiAgentOutput(
    getMultiAgentState(latestSnapshot.session),
    "director",
    targetRound
  );
}

async function runMultiAgentTurnPipeline(input: {
  sessionId: string;
  currentSnapshot: SessionSnapshot;
  contentRoot: string;
  store: InMemorySessionStore;
  nextRound: number;
  playerMessages: Message[];
  submittedInputs: Array<{
    participantId: string;
    displayName: string;
    content: string;
  }>;
  committedPartyInput: string;
  options?: TurnResolutionOptions;
}): Promise<{
  directorOutput: MultiAgentAgentOutput | null;
  dicerOutput: MultiAgentAgentOutput;
  npcManagerOutput: MultiAgentAgentOutput;
  narratorText: string;
  narratorProvider: string;
  narratorMeta: AiGenerationMetadata;
  narratorMode: Session["modelAccessMode"];
  endingJudge: Awaited<ReturnType<ReturnType<typeof getModelGateway>["judgeEnding"]>>;
}> {
  const current = input.currentSnapshot;
  const runtimeConfig = input.store.getRuntimeConfig(input.sessionId);
  const narratorRuntimeSelection = resolveNarratorRuntimeSelection(
    current.session,
    runtimeConfig
  );
  const bundle = await loadSessionContentBundle(input.contentRoot, current);
  const interimSnapshot: SessionSnapshot = {
    ...current,
    messages: [
      ...current.messages,
      ...input.playerMessages
    ]
  };
  const previousRoundContext =
    current.session.currentRound > 0
      ? buildPublicRoundContext(
          current.session,
          current.messages,
          current.session.currentRound - 1
        )
      : "No earlier completed public round is available yet.";
  const latestCompletedRoundContext = buildPublicRoundContext(
    current.session,
    current.messages,
    current.session.currentRound
  );
  const currentSubmittedInputsContext = buildSubmittedInputContext(
    current.session,
    input.submittedInputs,
    input.nextRound
  );
  const sharedPublicContext = buildMultiAgentSharedPublicContext({
    snapshot: interimSnapshot,
    latestPlayerInput: input.committedPartyInput,
    round: input.nextRound
  });
  const directorOutput = await waitForDirectorOutput({
    sessionId: input.sessionId,
    currentSnapshot: current,
    contentRoot: input.contentRoot,
    store: input.store,
    options: input.options
  });
  const modelGateway = getModelGateway(current.session.modelAccessMode);

  await emitTurnResolutionStage(
    input.options,
    "requesting_support_agents",
    "请求 Dicer / NPC Manager",
    "正在把当前公共上下文和队伍输入发给 Dicer 与 NPC Manager。",
    0.28
  );
  const dicerPromise = modelGateway.generatePromptedText({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    systemPrompt: await buildMultiAgentSystemPrompt(
      "dicer",
      current.session.locale,
      current.session.settings.difficulty ?? PHASE1_DEFAULTS.difficulty
    ),
    userPrompt: buildDicerUserPrompt({
      bundle,
      locale: current.session.locale,
      round: input.nextRound,
      previousRoundContext,
      latestRoundContext: latestCompletedRoundContext,
      currentSubmittedInputs: currentSubmittedInputsContext
    })
  });
  const npcManagerPromise = modelGateway.generatePromptedText({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    systemPrompt: await buildMultiAgentSystemPrompt(
      "npc_manager",
      current.session.locale,
      current.session.settings.difficulty ?? PHASE1_DEFAULTS.difficulty
    ),
    userPrompt: buildNpcManagerUserPrompt({
      bundle,
      locale: current.session.locale,
      round: input.nextRound,
      sharedPublicContext,
      currentSubmittedInputs: currentSubmittedInputsContext,
      ownHistory: buildMultiAgentHistoryContext(
        getMultiAgentState(current.session),
        "npcManager",
        current.session.currentRound
      )
    })
  });

  await emitTurnResolutionStage(
    input.options,
    "waiting_support_agents",
    "等待 Dicer / NPC Manager",
    "支持 agent 已开始处理，正在等待规则判定和 NPC 管理结果返回。",
    0.46
  );
  const [dicerResult, npcManagerResult] = await Promise.all([
    dicerPromise,
    npcManagerPromise
  ]);
  const dicerOutput = buildStoredAgentOutput({
    content: dicerResult.text,
    provider: dicerResult.provider,
    meta: dicerResult.meta
  });
  const npcManagerOutput = buildStoredAgentOutput({
    content: npcManagerResult.text,
    provider: npcManagerResult.provider,
    meta: npcManagerResult.meta
  });

  await emitTurnResolutionStage(
    input.options,
    "requesting_narrator",
    "整理 Narrator 输入",
    "正在整合 Dicer、NPC Manager、Director 和当前回合输入。",
    0.62
  );
  const narratorPromise = modelGateway.generatePromptedText({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    systemPrompt: await buildMultiAgentSystemPrompt(
      "narrator",
      current.session.locale,
      current.session.settings.difficulty ?? PHASE1_DEFAULTS.difficulty
    ),
    userPrompt: buildNarratorUserPrompt({
      bundle,
      locale: current.session.locale,
      round: input.nextRound,
      sharedPublicContext,
      latestCompletedRound: latestCompletedRoundContext,
      currentSubmittedInputs: currentSubmittedInputsContext,
      dicerOutput: dicerOutput.content,
      npcManagerOutput: npcManagerOutput.content,
      directorOutput:
        directorOutput?.content.trim() || "No Director output is available for the previous completed round."
    })
  });
  await emitTurnResolutionStage(
    input.options,
    "waiting_turn_narration",
    "等待 Narrator 回复",
    "Narrator 已开始整合多 agent 结果，正在等待正式叙事。",
    0.76
  );
  const narratorResult = await narratorPromise;

  await emitTurnResolutionStage(
    input.options,
    "judging_ending",
    "进行结局判定",
    "Narrator 已回复，正在检查这段回复是否触发结局。",
    0.88
  );
  const endingJudge = await modelGateway.judgeEnding({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    round: input.nextRound,
    narrationText: narratorResult.text
  });

  return {
    directorOutput,
    dicerOutput,
    npcManagerOutput,
    narratorText: narratorResult.text,
    narratorProvider: narratorResult.provider,
    narratorMeta: narratorResult.meta,
    narratorMode: narratorResult.mode,
    endingJudge
  };
}

async function commitPreparedRoundWithMultiAgentGm(
  sessionId: string,
  store: InMemorySessionStore,
  contentRoot: string,
  current: SessionSnapshot,
  finalDrafts: RoundDraft[],
  options?: TurnResolutionOptions
): Promise<SessionSnapshot | null> {
  const timestamp = nowIso();
  const nextRound = current.session.currentRound + 1;
  const primaryParticipant = findPrimaryPlayerParticipant(current.session);
  const gmParticipant = findGmParticipant(current.session);
  const committedPartyInput = buildCommittedPartyInput(current.session, finalDrafts);
  const playerMessages: Message[] = finalDrafts.map((draft) => ({
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: draft.participantId,
    recipientIds: [gmParticipant.id],
    visibility: "public",
    kind: "player_input",
    channel: "public_story",
    content: draft.content,
    aiMetadata: draft.source === "ai" ? draft.aiMetadata ?? null : null,
    tags: [
      "turn_input",
      draft.isPrimary ? "primary_player" : "ai_teammate"
    ]
  }));
  const pipeline = await runMultiAgentTurnPipeline({
    sessionId,
    currentSnapshot: current,
    contentRoot,
    store,
    nextRound,
    playerMessages,
    submittedInputs: finalDrafts.map((draft) => ({
      participantId: draft.participantId,
      displayName: draft.displayName,
      content: draft.content
    })),
    committedPartyInput,
    options
  });
  const gmMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: gmParticipant.id,
    recipientIds: buildStoryRecipientIds(current.session),
    visibility: "public",
    kind: "gm_narration",
    channel: "public_story",
    content: pipeline.narratorText,
    aiMetadata: pipeline.narratorMeta,
    tags: [
      "turn_response",
      "multi_agent",
      `provider:${pipeline.narratorProvider}`
    ]
  };
  const endingAdjudication = pipeline.endingJudge.adjudication
    ? {
        ...pipeline.endingJudge.adjudication,
        adjudicationSource: "multi_agent" as const
      }
    : null;
  const multiAgentStateAfterDirector = getMultiAgentState(
    store.get(sessionId)?.session ?? current.session
  );
  const multiAgentStateWithOutputs = upsertMultiAgentOutput({
    state: upsertMultiAgentOutput({
      state: multiAgentStateAfterDirector,
      round: nextRound,
      role: "dicer",
      output: pipeline.dicerOutput
    }),
    round: nextRound,
    role: "npcManager",
    output: pipeline.npcManagerOutput
  });
  const replayEntries: ReplayEvent[] = [
    {
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: primaryParticipant.id,
      type: "turn_submitted",
      displayLevel: "core",
      summary: `Party committed round ${nextRound}`,
      payload: {
        participantCount: playerMessages.length,
        messageIds: playerMessages.map((message) => message.id),
        gmArchitecture: "multi_agent"
      }
    },
    ...playerMessages.map((message) => ({
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: message.senderId,
      type: "message_created" as const,
      displayLevel: "detail" as const,
      summary: "Prepared player input recorded",
      payload: {
        messageId: message.id
      }
    })),
    {
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "gm_response_received",
      displayLevel: "core",
      summary: "Multi-agent turn narration generated",
      payload: {
        messageId: gmMessage.id,
        provider: pipeline.narratorProvider,
        mode: pipeline.narratorMode,
        dicerProvider: pipeline.dicerOutput.provider,
        npcManagerProvider: pipeline.npcManagerOutput.provider,
        directorRound: current.session.currentRound,
        directorProvider: pipeline.directorOutput?.provider ?? null,
        endingJudgeProvider: pipeline.endingJudge.provider,
        endingJudgeRawText: pipeline.endingJudge.rawText
      }
    }
  ];

  if (endingAdjudication?.isGameOver && endingAdjudication.endingState) {
    replayEntries.push({
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "ending_confirmed",
      displayLevel: "core",
      summary: `Ending confirmed: ${endingAdjudication.endingState.title}`,
      payload: {
        endingId: endingAdjudication.endingState.endingId,
        endingType: endingAdjudication.endingState.endingType,
        adjudicationSource: endingAdjudication.adjudicationSource
      }
    });
  }

  await emitTurnResolutionStage(
    options,
    "finalizing_turn",
    "写入本轮结果",
    "正在把多 agent 结果、队伍输入和 Narrator 回复写入会话。",
    0.96
  );

  const updatedSnapshot = store.update(sessionId, (latest) => ({
    ...latest,
    session: {
      ...latest.session,
      status:
        endingAdjudication?.isGameOver && endingAdjudication.endingState
          ? "ended"
          : latest.session.status,
      currentRound: nextRound,
      updatedAt: timestamp,
      gameState: {
        ...latest.session.gameState,
        phase:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? "ended"
            : "playing",
        lastEndingJudgeResult: endingAdjudication,
        lastEndingJudgeDecision: pipeline.endingJudge.judgeDecision,
        endingState:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? endingAdjudication.endingState
            : latest.session.gameState.endingState ?? null,
        roundInputState: null,
        multiAgent: multiAgentStateWithOutputs
      }
    },
    messages: [
      ...latest.messages,
      ...playerMessages,
      gmMessage
    ],
    replay: [
      ...latest.replay,
      ...replayEntries
    ]
  }));

  if (!updatedSnapshot) {
    return null;
  }

  store.save(updatedSnapshot);
  if (updatedSnapshot.session.status !== "ended") {
    void queueDirectorGeneration(sessionId, nextRound, contentRoot, store).catch(() => {});
  }
  await emitTurnResolutionStage(
    options,
    "memory_deferred",
    "后台刷新记忆",
    "本轮已提交完成，memory 会在后台异步更新，不再阻塞你继续游戏。",
    1
  );
  scheduleBackgroundMemoryRefresh(sessionId, store);
  return updatedSnapshot;
}

export async function commitPreparedRound(
  sessionId: string,
  request: CommitRoundRequest,
  store: InMemorySessionStore,
  contentRoot: string,
  options?: TurnResolutionOptions
): Promise<SessionSnapshot | null> {
  const current = store.get(sessionId);
  if (!current) {
    return null;
  }

  if (current.session.status === "ended") {
    throw new Error("The current session has already reached an ending and cannot commit another round.");
  }

  const roundInputState = current.session.gameState.roundInputState;
  if (!roundInputState || roundInputState.phase !== "ready_to_commit") {
    throw new Error("There is no prepared round ready to commit.");
  }

  const primaryOverride = request.playerInput?.trim() ?? "";
  const finalDrafts = roundInputState.drafts.map((draft) => ({
    ...draft,
    content:
      draft.isPrimary && primaryOverride.length > 0
        ? primaryOverride
        : draft.content.trim()
  }));

  if (finalDrafts.some((draft) => draft.content.length === 0)) {
    throw new Error("All prepared drafts must contain text before committing the round.");
  }

  if (isMultiAgentSession(current.session)) {
    return commitPreparedRoundWithMultiAgentGm(
      sessionId,
      store,
      contentRoot,
      current,
      finalDrafts,
      options
    );
  }

  const timestamp = nowIso();
  const nextRound = current.session.currentRound + 1;
  const primaryParticipant = findPrimaryPlayerParticipant(current.session);
  const gmParticipant = findGmParticipant(current.session);
  const runtimeConfig = store.getRuntimeConfig(sessionId);
  const committedPartyInput = buildCommittedPartyInput(current.session, finalDrafts);
  const playerMessages: Message[] = finalDrafts.map((draft) => ({
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: draft.participantId,
    recipientIds: [gmParticipant.id],
    visibility: "public",
    kind: "player_input",
    channel: "public_story",
    content: draft.content,
    aiMetadata: draft.source === "ai" ? draft.aiMetadata ?? null : null,
    tags: [
      "turn_input",
      draft.isPrimary ? "primary_player" : "ai_teammate"
    ]
  }));

  const modelGateway = getModelGateway(current.session.modelAccessMode);
  const narratorRuntimeSelection = resolveNarratorRuntimeSelection(
    current.session,
    runtimeConfig
  );
  const narratorInputSnapshot: SessionSnapshot = {
    ...current,
    messages: [
      ...current.messages,
      ...playerMessages
    ]
  };
  const narratorConversationContext = buildNarratorConversationContext({
    snapshot: narratorInputSnapshot,
    latestPlayerInput: committedPartyInput,
    round: nextRound
  });
  await emitTurnResolutionStage(
    options,
    "requesting_narrator",
    "整理主持人输入",
    "正在整理队伍输入，并组装主持人需要的上下文。",
    0.18
  );
  const turnNarrationPromise = modelGateway.generateTurnNarration({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    difficulty: current.session.settings.difficulty ?? PHASE1_DEFAULTS.difficulty,
    storyTitle: current.contentSummary.storyTitle,
    playerInput: committedPartyInput,
    round: nextRound,
    conversationContext: narratorConversationContext
  });
  await emitTurnResolutionStage(
    options,
    "waiting_turn_narration",
    "等待主持人回复",
    "队伍输入已经提交，正在等待主持人生成本轮回复。",
    0.54
  );
  const turnNarration = await turnNarrationPromise;
  await emitTurnResolutionStage(
    options,
    "judging_ending",
    "进行结局判定",
    "主持人已回复，正在检查这段回复是否触发结局。",
    0.8
  );
  const endingJudge = await modelGateway.judgeEnding({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    round: nextRound,
    narrationText: turnNarration.text
  });

  const gmMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: gmParticipant.id,
    recipientIds: [primaryParticipant.id],
    visibility: "public",
    kind: "gm_narration",
    channel: "public_story",
    content: turnNarration.text,
    aiMetadata: turnNarration.meta,
    tags: [
      "turn_response",
      `provider:${turnNarration.provider}`
    ]
  };

  const endingAdjudication = endingJudge.adjudication ?? null;
  const replayEntries: ReplayEvent[] = [
    {
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: primaryParticipant.id,
      type: "turn_submitted",
      displayLevel: "core",
      summary: `Party committed round ${nextRound}`,
      payload: {
        participantCount: playerMessages.length,
        messageIds: playerMessages.map((message) => message.id)
      }
    },
    ...playerMessages.map((message) => ({
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: message.senderId,
      type: "message_created" as const,
      displayLevel: "detail" as const,
      summary: "Prepared player input recorded",
      payload: {
        messageId: message.id
      }
    })),
    {
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "gm_response_received",
      displayLevel: "core",
      summary: "Turn narration generated",
      payload: {
        messageId: gmMessage.id,
        provider: turnNarration.provider,
        mode: turnNarration.mode,
        endingJudgeProvider: endingJudge.provider,
        endingJudgeRawText: endingJudge.rawText
      }
    }
  ];

  if (endingAdjudication?.isGameOver && endingAdjudication.endingState) {
    replayEntries.push({
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "ending_confirmed",
      displayLevel: "core",
      summary: `Ending confirmed: ${endingAdjudication.endingState.title}`,
      payload: {
        endingId: endingAdjudication.endingState.endingId,
        endingType: endingAdjudication.endingState.endingType,
        adjudicationSource: endingAdjudication.adjudicationSource
      }
    });
  }

  await emitTurnResolutionStage(
    options,
    "finalizing_turn",
    "写入本轮结果",
    "正在把队伍输入、主持人回复和判定结果写入会话。",
    0.94
  );

  const updatedSnapshot = store.update(sessionId, (latest) => ({
    ...latest,
    session: {
      ...latest.session,
      status:
        endingAdjudication?.isGameOver && endingAdjudication.endingState
          ? "ended"
          : latest.session.status,
      currentRound: nextRound,
      updatedAt: timestamp,
      gameState: {
        ...latest.session.gameState,
        phase:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? "ended"
            : "playing",
        lastEndingJudgeResult: endingAdjudication,
        lastEndingJudgeDecision: endingJudge.judgeDecision,
        endingState:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? endingAdjudication.endingState
            : latest.session.gameState.endingState ?? null,
        roundInputState: null
      }
    },
    messages: [
      ...latest.messages,
      ...playerMessages,
      gmMessage
    ],
    replay: [
      ...latest.replay,
      ...replayEntries
    ]
  }));

  if (!updatedSnapshot) {
    return null;
  }
  store.save(updatedSnapshot);
  await emitTurnResolutionStage(
    options,
    "memory_deferred",
    "后台刷新记忆",
    "本轮已提交完成，memory 会在后台异步更新，不再阻塞你继续游戏。",
    1
  );
  scheduleBackgroundMemoryRefresh(sessionId, store);
  return updatedSnapshot;
}

export async function updateStoryControlMode(
  sessionId: string,
  request: UpdateStoryControlModeRequest,
  store: InMemorySessionStore
): Promise<SessionSnapshot | null> {
  const current = store.get(sessionId);
  if (!current) {
    return null;
  }

  if (current.session.partySetup?.primaryPlayerMode !== "ai") {
    throw new Error("Story control mode is only available when the primary player is AI-controlled.");
  }

  const nextMode: StoryControlMode = request.mode === "auto" ? "auto" : "intervene";
  const timestamp = nowIso();

  return store.update(sessionId, (latest) => ({
    ...latest,
    session: {
      ...latest.session,
      updatedAt: timestamp,
      gameState: {
        ...latest.session.gameState,
        storyControlMode: nextMode
      }
    }
  }));
}

export async function dismissEndingState(
  sessionId: string,
  store: InMemorySessionStore
): Promise<SessionSnapshot | null> {
  const current = store.get(sessionId);
  if (!current) {
    return null;
  }

  const currentEndingState = current.session.gameState.endingState;
  if (!currentEndingState) {
    throw new Error("The current session is not locked in an ending.");
  }

  const timestamp = nowIso();
  const replayEvent: ReplayEvent = {
    id: `evt_${randomUUID()}`,
    round: current.session.currentRound,
    createdAt: timestamp,
    actorId: current.session.localHumanParticipantId ?? current.session.playerParticipantId,
    type: "ending_dismissed",
    displayLevel: "core",
    summary: `Ending dismissed: ${currentEndingState.title}`,
    payload: {
      endingId: currentEndingState.endingId,
      endingType: currentEndingState.endingType,
      endingTitle: currentEndingState.title,
      dismissedAs: "false_positive",
      previousJudgeReason:
        current.session.gameState.lastEndingJudgeDecision?.Reason ??
        current.session.gameState.lastEndingJudgeResult?.endingState?.summary ??
        null
    }
  };

  const updatedSnapshot = store.update(sessionId, (latest) => ({
    ...latest,
    session: {
      ...latest.session,
      status: "active",
      updatedAt: timestamp,
      gameState: {
        ...latest.session.gameState,
        phase: "playing",
        endingState: null,
        lastEndingJudgeResult: null,
        lastEndingJudgeDecision: null
      }
    },
    replay: [
      ...latest.replay,
      replayEvent
    ]
  }));

  if (!updatedSnapshot) {
    return null;
  }

  store.save(updatedSnapshot);
  return updatedSnapshot;
}

export async function submitManualNarration(
  sessionId: string,
  request: SubmitManualNarrationRequest,
  store: InMemorySessionStore
): Promise<SessionSnapshot | null> {
  const narrationText = request.narrationText.trim();
  if (!narrationText) {
    throw new Error("Manual narrator text cannot be empty.");
  }

  const current = store.get(sessionId);
  if (!current) {
    return null;
  }

  const timestamp = nowIso();
  const gmParticipant = findGmParticipant(current.session);
  const runtimeConfig = store.getRuntimeConfig(sessionId);
  const targetRound = current.session.currentRound;
  const modelGateway = getModelGateway(current.session.modelAccessMode);
  const narratorRuntimeSelection = resolveNarratorRuntimeSelection(
    current.session,
    runtimeConfig
  );
  const endingJudge = await modelGateway.judgeEnding({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    round: targetRound,
    narrationText
  });

  const gmMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: targetRound,
    createdAt: timestamp,
    senderId: gmParticipant.id,
    recipientIds: buildStoryRecipientIds(current.session),
    visibility: "public",
    kind: "gm_narration",
    channel: "public_story",
    content: narrationText,
    tags: [
      "manual_narration_test",
      "turn_response",
      "provider:manual_override"
    ]
  };

  const endingAdjudication = endingJudge.adjudication ?? null;
  const replayEntries: ReplayEvent[] = [
    {
      id: `evt_${randomUUID()}`,
      round: targetRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "message_created",
      displayLevel: "detail",
      summary: "Manual narrator reply injected",
      payload: {
        messageId: gmMessage.id,
        manual: true
      }
    },
    {
      id: `evt_${randomUUID()}`,
      round: targetRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "gm_response_received",
      displayLevel: "core",
      summary: "Manual narrator reply tested against ending judge",
      payload: {
        messageId: gmMessage.id,
        provider: "manual_override",
        mode: "manual_override",
        endingJudgeProvider: endingJudge.provider,
        endingJudgeRawText: endingJudge.rawText,
        manual: true
      }
    }
  ];

  if (endingAdjudication?.isGameOver && endingAdjudication.endingState) {
    replayEntries.push({
      id: `evt_${randomUUID()}`,
      round: targetRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "ending_confirmed",
      displayLevel: "core",
      summary: `Ending confirmed: ${endingAdjudication.endingState.title}`,
      payload: {
        endingId: endingAdjudication.endingState.endingId,
        endingType: endingAdjudication.endingState.endingType,
        adjudicationSource: endingAdjudication.adjudicationSource,
        manual: true
      }
    });
  }

  const updatedSnapshot = store.update(sessionId, () => ({
    ...current,
    session: {
      ...current.session,
      status:
        endingAdjudication?.isGameOver && endingAdjudication.endingState
          ? "ended"
          : current.session.status,
      updatedAt: timestamp,
      gameState: {
        ...current.session.gameState,
        phase:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? "ended"
            : current.session.gameState.endingState
              ? "ended"
              : "playing",
        lastEndingJudgeResult: endingAdjudication,
        lastEndingJudgeDecision: endingJudge.judgeDecision,
        endingState:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? endingAdjudication.endingState
            : current.session.gameState.endingState ?? null,
        roundInputState: null
      }
    },
    messages: [
      ...current.messages,
      gmMessage
    ],
    replay: [
      ...current.replay,
      ...replayEntries
    ]
  }));

  if (!updatedSnapshot) {
    return null;
  }

  store.save(updatedSnapshot);
  scheduleBackgroundMemoryRefresh(sessionId, store);
  return updatedSnapshot;
}

export async function sendPrivateChat(
  sessionId: string,
  request: SendPrivateChatRequest,
  store: InMemorySessionStore
): Promise<SessionSnapshot | null> {
  const trimmedContent = request.content.trim();
  if (!trimmedContent) {
    throw new Error("Private chat content cannot be empty.");
  }

  const current = store.get(sessionId);
  if (!current) {
    return null;
  }

  if (current.session.status === "ended") {
    throw new Error("The current session has already reached an ending and cannot send private chat.");
  }

  if (
    current.session.partySetup?.primaryPlayerMode === "ai" &&
    current.session.gameState.storyControlMode === "auto"
  ) {
    throw new Error("Private chat is disabled while story mode is set to automatic play.");
  }

  const localHumanParticipant = findLocalHumanParticipant(current.session);
  const targetParticipant = getCompanionParticipants(current.session).find(
    (participant) => participant.id === request.targetParticipantId
  );

  if (!targetParticipant) {
    throw new Error("Private chat is only available with AI teammates in this build.");
  }

  const runtimeConfig = store.getRuntimeConfig(sessionId);
  const threadId = buildPrivateChatThreadId(localHumanParticipant.id, targetParticipant.id);
  const humanTimestamp = nowIso();
  const humanMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: current.session.currentRound,
    createdAt: humanTimestamp,
    senderId: localHumanParticipant.id,
    recipientIds: [targetParticipant.id],
    visibility: "private",
    kind: "private_chat",
    channel: "private_chat",
    threadId,
    relatedParticipantId: targetParticipant.id,
    content: trimmedContent,
    tags: ["private_chat", "human_private_chat"]
  };
  const interimMessages = [
    ...current.messages,
    humanMessage
  ];
  const privateChatInputSnapshot: SessionSnapshot = {
    ...current,
    messages: interimMessages
  };
  const privateChatContextPack = buildPrivateChatContextPack({
    snapshot: privateChatInputSnapshot,
    participantId: targetParticipant.id,
    latestMessage: trimmedContent
  });
  const targetRuntimeSelection = resolveParticipantRuntimeSelection(
    current.session,
    runtimeConfig,
    targetParticipant.id
  );
  const privateReply = await generateAiPrivateChatReply({
    accessMode: current.session.modelAccessMode,
    modelProfileId: targetRuntimeSelection.modelProfileId,
    runtimeModelConfig: targetRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    storyTitle: current.contentSummary.storyTitle,
    participant: targetParticipant,
    localHumanName: localHumanParticipant.displayName,
    personalityTags: getCompanionTagMap(current.session).get(targetParticipant.id) ?? [],
    appearanceTags:
      getCompanionAppearanceTagMap(current.session).get(targetParticipant.id) ?? [],
    participants: current.session.participants,
    messages: interimMessages,
    publicStoryContext: privateChatContextPack.assembledText,
    privateThreadContext: "Private thread context is already included in the runtime context pack above.",
    latestMessage: trimmedContent
  });
  const aiTimestamp = nowIso();
  const aiReplyMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: current.session.currentRound,
    createdAt: aiTimestamp,
    senderId: targetParticipant.id,
    recipientIds: [localHumanParticipant.id],
    visibility: "private",
    kind: "private_chat",
    channel: "private_chat",
    threadId,
    relatedParticipantId: targetParticipant.id,
    content: privateReply.content,
    aiMetadata: privateReply.meta,
    tags: ["private_chat", "ai_private_chat", `provider:${privateReply.provider}`]
  };

  const updatedSnapshot = store.update(sessionId, () => ({
    ...current,
    session: {
      ...current.session,
      updatedAt: aiTimestamp
    },
    messages: [
      ...current.messages,
      humanMessage,
      aiReplyMessage
    ],
    replay: [
      ...current.replay,
      {
        id: `evt_${randomUUID()}`,
        round: current.session.currentRound,
        createdAt: humanTimestamp,
        actorId: localHumanParticipant.id,
        type: "message_created",
        displayLevel: "detail",
        summary: `Private chat sent to ${targetParticipant.displayName}`,
        payload: {
          messageId: humanMessage.id,
          threadId
        }
      },
      {
        id: `evt_${randomUUID()}`,
        round: current.session.currentRound,
        createdAt: aiTimestamp,
        actorId: targetParticipant.id,
        type: "message_created",
        displayLevel: "detail",
        summary: `${targetParticipant.displayName} replied in private chat`,
        payload: {
          messageId: aiReplyMessage.id,
          threadId,
          provider: privateReply.provider,
          mode: privateReply.mode
        }
      }
    ]
  }));

  if (!updatedSnapshot) {
    return null;
  }

  store.save(updatedSnapshot);
  scheduleBackgroundMemoryRefresh(sessionId, store);
  return updatedSnapshot;
}

async function submitTurnWithMultiAgentGm(
  sessionId: string,
  store: InMemorySessionStore,
  contentRoot: string,
  current: SessionSnapshot,
  playerParticipant: Participant,
  gmParticipant: Participant,
  trimmedInput: string,
  options?: TurnResolutionOptions
): Promise<SessionSnapshot | null> {
  const timestamp = nowIso();
  const nextRound = current.session.currentRound + 1;
  const playerMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: playerParticipant.id,
    recipientIds: [gmParticipant.id],
    visibility: "public",
    kind: "player_input",
    channel: "public_story",
    content: trimmedInput,
    tags: [
      "turn_input"
    ]
  };
  const labeledPlayerInput = `${formatParticipantActionLabel(
    current.session,
    playerParticipant.id,
    playerParticipant.displayName
  )}: ${trimmedInput}`;
  const pipeline = await runMultiAgentTurnPipeline({
    sessionId,
    currentSnapshot: current,
    contentRoot,
    store,
    nextRound,
    playerMessages: [playerMessage],
    submittedInputs: [
      {
        participantId: playerParticipant.id,
        displayName: playerParticipant.displayName,
        content: trimmedInput
      }
    ],
    committedPartyInput: labeledPlayerInput,
    options
  });
  const gmMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: gmParticipant.id,
    recipientIds: buildStoryRecipientIds(current.session),
    visibility: "public",
    kind: "gm_narration",
    channel: "public_story",
    content: pipeline.narratorText,
    aiMetadata: pipeline.narratorMeta,
    tags: [
      "turn_response",
      "multi_agent",
      `provider:${pipeline.narratorProvider}`
    ]
  };
  const endingAdjudication = pipeline.endingJudge.adjudication
    ? {
        ...pipeline.endingJudge.adjudication,
        adjudicationSource: "multi_agent" as const
      }
    : null;
  const multiAgentStateAfterDirector = getMultiAgentState(
    store.get(sessionId)?.session ?? current.session
  );
  const multiAgentStateWithOutputs = upsertMultiAgentOutput({
    state: upsertMultiAgentOutput({
      state: multiAgentStateAfterDirector,
      round: nextRound,
      role: "dicer",
      output: pipeline.dicerOutput
    }),
    round: nextRound,
    role: "npcManager",
    output: pipeline.npcManagerOutput
  });
  const replayEntries: ReplayEvent[] = [
    {
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: playerParticipant.id,
      type: "turn_submitted",
      displayLevel: "core",
      summary: `Player submitted turn ${nextRound}`,
      payload: {
        messageId: playerMessage.id,
        gmArchitecture: "multi_agent"
      }
    },
    {
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: playerParticipant.id,
      type: "message_created",
      displayLevel: "detail",
      summary: "Player input recorded",
      payload: {
        messageId: playerMessage.id
      }
    },
    {
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "gm_response_received",
      displayLevel: "core",
      summary: "Multi-agent turn narration generated",
      payload: {
        messageId: gmMessage.id,
        provider: pipeline.narratorProvider,
        mode: pipeline.narratorMode,
        dicerProvider: pipeline.dicerOutput.provider,
        npcManagerProvider: pipeline.npcManagerOutput.provider,
        directorRound: current.session.currentRound,
        directorProvider: pipeline.directorOutput?.provider ?? null,
        endingJudgeProvider: pipeline.endingJudge.provider,
        endingJudgeRawText: pipeline.endingJudge.rawText
      }
    }
  ];

  if (endingAdjudication?.isGameOver && endingAdjudication.endingState) {
    replayEntries.push({
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "ending_confirmed",
      displayLevel: "core",
      summary: `Ending confirmed: ${endingAdjudication.endingState.title}`,
      payload: {
        endingId: endingAdjudication.endingState.endingId,
        endingType: endingAdjudication.endingState.endingType,
        adjudicationSource: endingAdjudication.adjudicationSource
      }
    });
  }

  await emitTurnResolutionStage(
    options,
    "finalizing_turn",
    "写入本轮结果",
    "正在把多 agent 结果、玩家输入和 Narrator 回复写入会话。",
    0.96
  );

  const updatedSnapshot = store.update(sessionId, () => ({
    ...current,
    session: {
      ...current.session,
      status:
        endingAdjudication?.isGameOver && endingAdjudication.endingState
          ? "ended"
          : current.session.status,
      currentRound: nextRound,
      updatedAt: timestamp,
      gameState: {
        ...current.session.gameState,
        phase:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? "ended"
            : current.session.gameState.endingState
              ? "ended"
              : "playing",
        lastEndingJudgeResult: endingAdjudication,
        lastEndingJudgeDecision: pipeline.endingJudge.judgeDecision,
        endingState:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? endingAdjudication.endingState
            : current.session.gameState.endingState ?? null,
        roundInputState: null,
        multiAgent: multiAgentStateWithOutputs
      }
    },
    messages: [
      ...current.messages,
      playerMessage,
      gmMessage
    ],
    replay: [
      ...current.replay,
      ...replayEntries
    ]
  }));

  if (!updatedSnapshot) {
    return null;
  }

  store.save(updatedSnapshot);
  if (updatedSnapshot.session.status !== "ended") {
    void queueDirectorGeneration(sessionId, nextRound, contentRoot, store).catch(() => {});
  }
  await emitTurnResolutionStage(
    options,
    "memory_deferred",
    "后台刷新记忆",
    "本轮已提交完成，memory 会在后台异步更新，不再阻塞你继续游戏。",
    1
  );
  scheduleBackgroundMemoryRefresh(sessionId, store);
  return updatedSnapshot;
}

export async function submitTurn(
  sessionId: string,
  request: SubmitTurnRequest,
  store: InMemorySessionStore,
  contentRoot: string,
  options?: TurnResolutionOptions
): Promise<SessionSnapshot | null> {
  const trimmedInput = request.playerInput.trim();
  if (trimmedInput.length === 0) {
    throw new Error("玩家输入不能为空。");
  }

  const current = store.get(sessionId);
  if (!current) {
    return null;
  }

  const timestamp = nowIso();
  const nextRound = current.session.currentRound + 1;
  const submittingParticipantId = current.session.gameState.endingState
    ? current.session.localHumanParticipantId ?? current.session.playerParticipantId
    : current.session.playerParticipantId;
  const playerParticipant = current.session.participants.find(
    (participant) => participant.id === submittingParticipantId
  );
  const gmParticipant = current.session.participants.find(
    (participant) => participant.role === "gm"
  );

  if (!playerParticipant || !gmParticipant) {
    throw new Error("Session participants 不完整，无法提交 turn。");
  }

  if (isMultiAgentSession(current.session) && !current.session.gameState.endingState) {
    return submitTurnWithMultiAgentGm(
      sessionId,
      store,
      contentRoot,
      current,
      playerParticipant,
      gmParticipant,
      trimmedInput,
      options
    );
  }

  const playerMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: playerParticipant.id,
    recipientIds: [gmParticipant.id],
    visibility: "public",
    kind: "player_input",
    channel: "public_story",
    content: trimmedInput,
    tags: [
      "turn_input"
    ]
  };
  const labeledPlayerInput = `${formatParticipantActionLabel(
    current.session,
    playerParticipant.id,
    playerParticipant.displayName
  )}: ${trimmedInput}`;

  const runtimeConfig = store.getRuntimeConfig(sessionId);
  const modelGateway = getModelGateway(current.session.modelAccessMode);
  const narratorRuntimeSelection = resolveNarratorRuntimeSelection(
    current.session,
    runtimeConfig
  );
  const narratorInputSnapshot: SessionSnapshot = {
    ...current,
    messages: [
      ...current.messages,
      playerMessage
    ]
  };
  const narratorConversationContext = buildNarratorConversationContext({
    snapshot: narratorInputSnapshot,
    latestPlayerInput: labeledPlayerInput,
    round: nextRound
  });
  await emitTurnResolutionStage(
    options,
    "requesting_narrator",
    "整理主持人输入",
    "正在整理你的行动，并组装主持人需要的上下文。",
    0.18
  );
  const turnNarrationPromise = modelGateway.generateTurnNarration({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    difficulty: current.session.settings.difficulty ?? PHASE1_DEFAULTS.difficulty,
    storyTitle: current.contentSummary.storyTitle,
    playerInput: labeledPlayerInput,
    round: nextRound,
    conversationContext: narratorConversationContext
  });
  await emitTurnResolutionStage(
    options,
    "waiting_turn_narration",
    "等待主持人回复",
    "你的行动已经提交，正在等待主持人生成本轮回复。",
    0.54
  );
  const turnNarration = await turnNarrationPromise;
  await emitTurnResolutionStage(
    options,
    "judging_ending",
    "进行结局判定",
    "主持人已回复，正在检查这段回复是否触发结局。",
    0.8
  );
  const endingJudge = await modelGateway.judgeEnding({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    round: nextRound,
    narrationText: turnNarration.text
  });

  const gmMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: gmParticipant.id,
    recipientIds: buildStoryRecipientIds(current.session),
    visibility: "public",
    kind: "gm_narration",
    channel: "public_story",
    content: turnNarration.text,
    aiMetadata: turnNarration.meta,
    tags: [
      "turn_response",
      `provider:${turnNarration.provider}`
    ]
  };

  const endingAdjudication = endingJudge.adjudication ?? null;
  const replayEntries: ReplayEvent[] = [
    {
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: playerParticipant.id,
      type: "turn_submitted",
      displayLevel: "core",
      summary: `Player submitted turn ${nextRound}`,
      payload: {
        messageId: playerMessage.id
      }
    },
    {
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: playerParticipant.id,
      type: "message_created",
      displayLevel: "detail",
      summary: "Player input recorded",
      payload: {
        messageId: playerMessage.id
      }
    },
    {
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "gm_response_received",
      displayLevel: "core",
      summary: "Turn narration generated",
      payload: {
        messageId: gmMessage.id,
        provider: turnNarration.provider,
        mode: turnNarration.mode,
        endingJudgeProvider: endingJudge.provider,
        endingJudgeRawText: endingJudge.rawText
      }
    }
  ];

  if (endingAdjudication?.isGameOver && endingAdjudication.endingState) {
    replayEntries.push({
      id: `evt_${randomUUID()}`,
      round: nextRound,
      createdAt: timestamp,
      actorId: gmParticipant.id,
      type: "ending_confirmed",
      displayLevel: "core",
      summary: `Ending confirmed: ${endingAdjudication.endingState.title}`,
      payload: {
        endingId: endingAdjudication.endingState.endingId,
        endingType: endingAdjudication.endingState.endingType,
        adjudicationSource: endingAdjudication.adjudicationSource
      }
    });
  }

  await emitTurnResolutionStage(
    options,
    "finalizing_turn",
    "写入本轮结果",
    "正在把你的行动、主持人回复和判定结果写入会话。",
    0.94
  );

  const updatedSnapshot = store.update(sessionId, () => ({
    ...current,
    session: {
      ...current.session,
      status:
        endingAdjudication?.isGameOver && endingAdjudication.endingState
          ? "ended"
          : current.session.status,
      currentRound: nextRound,
      updatedAt: timestamp,
      gameState: {
        ...current.session.gameState,
        phase:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? "ended"
            : current.session.gameState.endingState
              ? "ended"
              : "playing",
        lastEndingJudgeResult: endingAdjudication,
        lastEndingJudgeDecision: endingJudge.judgeDecision,
        endingState:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? endingAdjudication.endingState
            : current.session.gameState.endingState ?? null,
        roundInputState: null
      }
    },
    messages: [
      ...current.messages,
      playerMessage,
      gmMessage
    ],
    replay: [
      ...current.replay,
      ...replayEntries
    ]
  }));

  if (!updatedSnapshot) {
    return null;
  }
  store.save(updatedSnapshot);
  await emitTurnResolutionStage(
    options,
    "memory_deferred",
    "后台刷新记忆",
    "本轮已提交完成，memory 会在后台异步更新，不再阻塞你继续游戏。",
    1
  );
  scheduleBackgroundMemoryRefresh(sessionId, store);
  return updatedSnapshot;
}

export function createSaveBundleForSession(
  sessionId: string,
  store: InMemorySessionStore,
  options?: {
    worldlineId?: string | null;
  }
): {
  snapshot: SessionSnapshot;
  saveBundle: SaveBundle;
} | null {
  const current = store.get(sessionId);
  if (!current) {
    return null;
  }

  const savedAt = nowIso();
  const saveEvent = buildSaveReplayEvent(sessionId, savedAt);
  const runtimeConfig = store.getRuntimeConfig(sessionId);

  const nextSnapshot = store.update(sessionId, (snapshot) => ({
    ...snapshot,
    session: {
      ...snapshot.session,
      updatedAt: savedAt
    },
    replay: [
      ...snapshot.replay,
      saveEvent
    ]
  }));

  if (!nextSnapshot) {
    return null;
  }

  return {
    snapshot: nextSnapshot,
    saveBundle: buildSaveBundle(
      nextSnapshot,
      runtimeConfig,
      savedAt,
      options?.worldlineId ?? null
    )
  };
}

export function loadSessionFromSaveBundle(
  saveBundle: SaveBundle,
  store: InMemorySessionStore
): SessionSnapshot {
  const loadedAt = nowIso();
  const loadEvent = buildLoadReplayEvent(
    saveBundle.session.id,
    saveBundle.savedAt,
    loadedAt
  );

  const snapshot: SessionSnapshot = {
    session: {
      ...saveBundle.session,
      updatedAt: loadedAt
    },
    messages: saveBundle.messages,
    replay: [
      ...saveBundle.replay,
      loadEvent
    ],
    memory: saveBundle.memory ?? createEmptySessionMemory(loadedAt),
    contentSummary: saveBundle.contentSummary ?? buildFallbackContentSummary(saveBundle.session)
  };

  store.save(snapshot, {
    modelProfileId:
      saveBundle.runtimeConfig?.modelProfileId ?? saveBundle.session.settings.modelProfileId,
    runtimeModelConfig: saveBundle.runtimeConfig?.runtimeModelConfig,
    roleModelConfigs: saveBundle.runtimeConfig?.roleModelConfigs
  });

  return snapshot;
}

export function getSessionMemoryState(
  sessionId: string,
  store: InMemorySessionStore
): SessionMemory | null {
  const snapshot = store.get(sessionId);
  return snapshot?.memory ?? null;
}

export function getSessionContextPackState(
  sessionId: string,
  target: "narrator" | "companion" | "private_chat",
  store: InMemorySessionStore,
  participantId?: string | null
): SessionRuntimeContextPack | null {
  const snapshot = store.get(sessionId);
  if (!snapshot) {
    return null;
  }

  return buildDebugContextPack({
    snapshot,
    target,
    participantId
  });
}

async function emitTurnResolutionStage(
  options: TurnResolutionOptions | undefined,
  stage: "requesting_narrator" | "waiting_turn_narration" | "judging_ending" | "finalizing_turn" | "memory_deferred",
  label: string,
  detail: string,
  progress: number
): Promise<void> {
  await options?.onStage?.({
    stage,
    label,
    detail,
    progress
  });
}

const memoryRefreshChains = new Map<string, Promise<void>>();

function scheduleBackgroundMemoryRefresh(
  sessionId: string,
  store: InMemorySessionStore,
  options?: {
    onQueued?: () => void | Promise<void>;
  }
): void {
  const previous = memoryRefreshChains.get(sessionId) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      await options?.onQueued?.();
      const latestSnapshot = store.get(sessionId);
      if (!latestSnapshot) {
        return;
      }

      const runtimeConfig = store.getRuntimeConfig(sessionId);
      const nextMemory = await rebuildSnapshotMemory({
        snapshot: latestSnapshot,
        runtimeConfig
      });

      store.update(sessionId, (current) => ({
        ...current,
        memory: nextMemory
      }));
    })
    .finally(() => {
      if (memoryRefreshChains.get(sessionId) === next) {
        memoryRefreshChains.delete(sessionId);
      }
    });

  memoryRefreshChains.set(sessionId, next);
}

export async function rebuildSessionMemoryForSession(
  sessionId: string,
  store: InMemorySessionStore
): Promise<SessionSnapshot | null> {
  const snapshot = store.get(sessionId);
  if (!snapshot) {
    return null;
  }

  const runtimeConfig = store.getRuntimeConfig(sessionId);
  const nextMemory = await rebuildSnapshotMemory({
    snapshot,
    runtimeConfig
  });
  const nextSnapshot = {
    ...snapshot,
    memory: nextMemory
  };
  store.save(nextSnapshot);
  return nextSnapshot;
}

