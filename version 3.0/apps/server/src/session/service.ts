import { randomUUID } from "node:crypto";

import {
  DEFAULT_LOG_VIEW_MODE,
  PHASE1_DEFAULTS,
  getDefaultModelProfileId
} from "../../../../packages/shared-config/src/index.ts";
import type {
  CreateSessionRequest,
  Message,
  ReplayEvent,
  SaveBundle,
  Session,
  SessionContentSummary,
  SessionSnapshot,
  SubmitTurnRequest
} from "../../../../packages/shared-types/src/index.ts";
import { buildSystemCreatedMessage } from "../mock/index.ts";
import { loadPlayableContentBundle } from "../content/index.ts";
import { getModelGateway } from "../model_gateway/index.ts";
import { resolveStoryOpening } from "../opening/service.ts";
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

function buildConversationContext(messages: Message[], maxMessages = 6): string {
  return messages
    .slice(-maxMessages)
    .map((message) => {
      const speaker =
        message.kind === "player_input"
          ? "Player"
          : message.kind === "gm_narration" || message.kind === "gm_dialogue"
            ? "GM"
            : message.kind === "npc_chat"
              ? "NPC"
              : "System";
      return `[${speaker}][${message.kind}][R${message.round}] ${message.content}`;
    })
    .join("\n\n");
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
    runtimeConfig: runtimeConfig ?? undefined
  };
}

export async function createSessionSnapshot(
  contentRoot: string,
  request: CreateSessionRequest,
  store: InMemorySessionStore
): Promise<SessionSnapshot> {
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
  const ruleTitle =
    bundle.rule.manifest.title[bundle.rule.manifest.defaultLocale] ?? bundle.rule.manifest.id;
  const storyTitle =
    bundle.story.manifest.title[bundle.story.manifest.defaultLocale] ?? bundle.story.manifest.id;
  const modelProfileId =
    request.modelProfileId ?? getDefaultModelProfileId(request.modelAccessMode);
  const openingResult = await resolveStoryOpening(bundle, {
    modelAccessMode: request.modelAccessMode,
    modelProfileId,
    runtimeModelConfig: request.runtimeModelConfig,
  });

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
      {
        id: playerParticipantId,
        role: "human_player",
        displayName: "玩家",
        isAiControlled: false,
        isLocalUser: true,
        locale: bundle.resolvedLocale
      },
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
    settings: {
      logViewMode: request.logViewMode ?? DEFAULT_LOG_VIEW_MODE,
      debugEnabled: request.debugEnabled ?? true,
      promptDebugEnabled: request.promptDebugEnabled ?? false,
      modelProfileId
    },
    gameState: {
      phase: "playing",
      endingState: null
    }
  };

  const messages: Message[] = [
    buildSystemCreatedMessage(
      playerParticipantId,
      storyTitle,
      String(bundle.resolvedLocale),
      timestamp
    ),
    {
      id: `msg_${randomUUID()}`,
      round: 0,
      createdAt: timestamp,
      senderId: gmParticipantId,
      recipientIds: [playerParticipantId],
    visibility: "public",
    kind: "gm_narration",
    content: openingResult.text,
    aiMetadata: openingResult.meta,
    tags: [
      "opening",
      `provider:${openingResult.provider}`
      ]
    }
  ];

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
        locale: session.locale
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
    },
    {
      id: `evt_${randomUUID()}`,
      round: 0,
      createdAt: timestamp,
      actorId: gmParticipantId,
      type: "gm_response_received",
      displayLevel: "core",
      summary: "Opening narration generated",
      payload: {
        messageId: messages[1]?.id ?? null,
        mode: request.modelAccessMode,
        provider: openingResult.provider
      }
    }
  ];

  const snapshot: SessionSnapshot = {
    session,
    messages,
    replay,
    contentSummary: {
      ruleTitle,
      storyTitle,
      requestedLocale: request.locale,
      resolvedLocale: bundle.resolvedLocale
    }
  };

  store.save(snapshot, {
    modelProfileId,
    runtimeModelConfig: request.runtimeModelConfig
  });
  return snapshot;
}

export function buildDefaultCreateSessionRequest(): CreateSessionRequest {
  return {
    ruleDirectoryName: "VHS",
    storyDirectoryName: "The_Silence",
    locale: PHASE1_DEFAULTS.locale,
    playMode: PHASE1_DEFAULTS.playMode,
    gmArchitecture: PHASE1_DEFAULTS.gmArchitecture,
    modelAccessMode: PHASE1_DEFAULTS.modelAccessMode,
    modelProfileId: PHASE1_DEFAULTS.modelProfileId,
    debugEnabled: true,
    promptDebugEnabled: false,
    logViewMode: PHASE1_DEFAULTS.logViewMode
  };
}

export async function submitMockTurn(
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

  if (current.session.status === "ended") {
    throw new Error("当前会话已经进入结局，不能继续普通剧情。请从历史节点继续，或重新开始。");
  }

  const timestamp = nowIso();
  const nextRound = current.session.currentRound + 1;
  const playerParticipant = current.session.participants.find(
    (participant) => participant.id === current.session.playerParticipantId
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
    content: trimmedInput,
    tags: [
      "turn_input"
    ]
  };

  const runtimeConfig = store.getRuntimeConfig(sessionId);
  const modelGateway = getModelGateway(current.session.modelAccessMode);
  const turnNarration = await modelGateway.generateTurnNarration({
    accessMode: current.session.modelAccessMode,
    modelProfileId:
      runtimeConfig?.modelProfileId ?? current.session.settings.modelProfileId,
    runtimeModelConfig: runtimeConfig?.runtimeModelConfig,
    locale: current.session.locale,
    storyTitle: current.contentSummary.storyTitle,
    playerInput: trimmedInput,
    round: nextRound,
    conversationContext: buildConversationContext(current.messages)
  });

  const gmMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: gmParticipant.id,
    recipientIds: [playerParticipant.id],
    visibility: "public",
    kind: "gm_narration",
    content: turnNarration.text,
    aiMetadata: turnNarration.meta,
    tags: [
      "turn_response",
      `provider:${turnNarration.provider}`
    ]
  };

  const endingAdjudication = turnNarration.adjudication ?? null;
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
        mode: turnNarration.mode
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

  return store.update(sessionId, () => ({
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
            : "playing",
        endingState:
          endingAdjudication?.isGameOver && endingAdjudication.endingState
            ? endingAdjudication.endingState
            : current.session.gameState.endingState ?? null
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
    contentSummary: saveBundle.contentSummary ?? buildFallbackContentSummary(saveBundle.session)
  };

  store.save(snapshot, {
    modelProfileId:
      saveBundle.runtimeConfig?.modelProfileId ?? saveBundle.session.settings.modelProfileId,
    runtimeModelConfig: saveBundle.runtimeConfig?.runtimeModelConfig
  });

  return snapshot;
}
