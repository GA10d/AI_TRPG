import { randomUUID } from "node:crypto";

import {
  DEFAULT_LOG_VIEW_MODE,
  PHASE1_DEFAULTS,
  getDefaultModelProfileId
} from "../../../../packages/shared-config/src/index.ts";
import type {
  AdvancedTextModelConfigInput,
  AiGenerationMetadata,
  AiPersonalityTag,
  CommitRoundRequest,
  CreateSessionAiCompanionInput,
  CreateSessionRequest,
  Message,
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
  SessionContentSummary,
  SessionRuntimeContextPack,
  SessionSnapshot,
  StoryControlMode,
  SubmitTurnRequest,
  SubmitManualNarrationRequest,
  UpdateStoryControlModeRequest
} from "../../../../packages/shared-types/src/index.ts";
import {
  generateAiPrivateChatReply,
  generateAiRoundDraft,
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
  rebuildSnapshotMemory,
  updateSnapshotMemory
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
  savedAt: string
): SaveBundle {
  return {
    schemaVersion: snapshot.session.schemaVersion,
    savedAt,
    session: snapshot.session,
    messages: snapshot.messages,
    replay: snapshot.replay,
    contentSummary: snapshot.contentSummary,
    memory: snapshot.memory,
    runtimeConfig: runtimeConfig ?? undefined
  };
}

async function attachUpdatedMemory(
  snapshot: SessionSnapshot,
  newMessages: Message[],
  runtimeConfig: SessionRuntimeConfig | null
): Promise<SessionSnapshot> {
  try {
    return {
      ...snapshot,
      memory: await updateSnapshotMemory({
        snapshot,
        newMessages,
        runtimeConfig
      })
    };
  } catch {
    return snapshot;
  }
}

async function resolveSessionAiCompanions(
  aiCompanions: CreateSessionAiCompanionInput[] | undefined
): Promise<SessionAiCompanion[]> {
  const normalizedCompanions = (aiCompanions ?? []).slice(0, 3);

  return Promise.all(
    normalizedCompanions.map(async (companion, index) => {
      const displayName = companion.displayName.trim() || `AI Companion ${index + 1}`;
      const personalityTags = await resolveAiPersonalityTagsByIds(
        companion.personalityTagIds ?? []
      );

      return {
        participantId: `companion_${randomUUID()}`,
        displayName,
        personalityTags
      };
    })
  );
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
        displayName: primaryPlayerMode === "ai" ? "AI主角" : "玩家",
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
      debugEnabled: request.debugEnabled ?? true,
      promptDebugEnabled: request.promptDebugEnabled ?? false,
      modelProfileId: narratorModelProfileId
    },
    partySetup: {
      primaryPlayerMode,
      aiCompanions
    },
    gameState: {
      phase: "playing",
      endingState: null,
      lastEndingJudgeResult: null,
      lastEndingJudgeDecision: null,
      roundInputState: null,
      storyControlMode: primaryPlayerMode === "ai" ? "intervene" : null
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

  const snapshotWithMemory = await attachUpdatedMemory(
    snapshot,
    messages.filter((message) => message.visibility !== "system"),
    sessionRuntimeConfig
  );

  store.save(snapshotWithMemory, sessionRuntimeConfig);
  return snapshotWithMemory;
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
    gmArchitecture: PHASE1_DEFAULTS.gmArchitecture,
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
      personalityTags: [],
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

export async function commitPreparedRound(
  sessionId: string,
  request: CommitRoundRequest,
  store: InMemorySessionStore
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
  const narratorContextPack = buildNarratorContextPack({
    snapshot: narratorInputSnapshot,
    latestPlayerInput: committedPartyInput,
    round: nextRound
  });
  const turnNarration = await modelGateway.generateTurnNarration({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    storyTitle: current.contentSummary.storyTitle,
    playerInput: committedPartyInput,
    round: nextRound,
    conversationContext: narratorContextPack.assembledText
  });
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

  const snapshotWithMemory = await attachUpdatedMemory(
    updatedSnapshot,
    [
      ...playerMessages,
      gmMessage
    ],
    runtimeConfig
  );
  store.save(snapshotWithMemory);
  return snapshotWithMemory;
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

  const snapshotWithMemory = await attachUpdatedMemory(
    updatedSnapshot,
    [
      gmMessage
    ],
    runtimeConfig
  );
  store.save(snapshotWithMemory);
  return snapshotWithMemory;
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

  const snapshotWithMemory = await attachUpdatedMemory(
    updatedSnapshot,
    [
      humanMessage,
      aiReplyMessage
    ],
    runtimeConfig
  );
  store.save(snapshotWithMemory);
  return snapshotWithMemory;
}

export async function submitTurn(
  sessionId: string,
  request: SubmitTurnRequest,
  store: InMemorySessionStore
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
  const narratorContextPack = buildNarratorContextPack({
    snapshot: narratorInputSnapshot,
    latestPlayerInput: labeledPlayerInput,
    round: nextRound
  });
  const turnNarration = await modelGateway.generateTurnNarration({
    accessMode: current.session.modelAccessMode,
    modelProfileId: narratorRuntimeSelection.modelProfileId,
    runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
    locale: current.session.locale,
    storyTitle: current.contentSummary.storyTitle,
    playerInput: labeledPlayerInput,
    round: nextRound,
    conversationContext: narratorContextPack.assembledText
  });
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

  const snapshotWithMemory = await attachUpdatedMemory(
    updatedSnapshot,
    [
      playerMessage,
      gmMessage
    ],
    runtimeConfig
  );
  store.save(snapshotWithMemory);
  return snapshotWithMemory;
}

export function createSaveBundleForSession(
  sessionId: string,
  store: InMemorySessionStore
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
    saveBundle: buildSaveBundle(nextSnapshot, runtimeConfig, savedAt)
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

