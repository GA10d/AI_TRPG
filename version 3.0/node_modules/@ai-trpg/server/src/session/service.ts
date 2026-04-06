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
  Session,
  SessionSnapshot,
  SubmitTurnRequest
} from "../../../../packages/shared-types/src/index.ts";
import {
  advanceMockGameState,
  buildSystemCreatedMessage,
  createInitialMockGameState
} from "../mock/index.ts";
import { getModelGateway } from "../model_gateway/index.ts";
import { loadPlayableContentBundle } from "../content/index.ts";
import type { InMemorySessionStore } from "./store.ts";

function nowIso(): string {
  return new Date().toISOString();
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
  const storyIntro = bundle.story.intro?.content ?? bundle.story.story.content;
  const modelProfileId =
    request.modelProfileId ?? getDefaultModelProfileId(request.modelAccessMode);
  const modelGateway = getModelGateway(request.modelAccessMode);
  const openingResult = await modelGateway.generateOpening({
    accessMode: request.modelAccessMode,
    modelProfileId,
    runtimeModelConfig: request.runtimeModelConfig,
    locale: bundle.resolvedLocale,
    storyTitle,
    storyIntro,
    sceneId: bundle.story.manifest.startSceneId
  });

  const session: Session = {
    id: sessionId,
    schemaVersion: "0.1.0",
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
      schemaVersion: "0.1.0",
      phase: "playing",
      sceneId: bundle.story.manifest.startSceneId,
      sceneState: {},
      actorState: {},
      storyFlags: {
        phase1_mock_mode: request.modelAccessMode === "mock"
      },
      clocks: {},
      discoveredInfoIds: [],
      objectiveState: {
        active: [],
        completed: [],
        failed: []
      },
      unresolvedHooks: [],
      endingState: null
    }
  };

  session.gameState = createInitialMockGameState(session.gameState, session.locale);

  const messages: Message[] = [
    buildSystemCreatedMessage(playerParticipantId, storyTitle, String(bundle.resolvedLocale), timestamp),
    {
      id: `msg_${randomUUID()}`,
      round: 0,
      createdAt: timestamp,
      senderId: gmParticipantId,
      recipientIds: [playerParticipantId],
      visibility: "public",
      kind: "gm_narration",
      content: openingResult.text,
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
      summary: "Mock opening generated",
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
    throw new Error("玩家输入不能为空");
  }

  const current = store.get(sessionId);
  if (!current) {
    return null;
  }

  const timestamp = nowIso();
  const nextRound = current.session.currentRound + 1;
  const playerParticipant = current.session.participants.find(
    (participant) => participant.id === current.session.playerParticipantId
  );
  const gmParticipant = current.session.participants.find((participant) => participant.role === "gm");

  if (!playerParticipant || !gmParticipant) {
    throw new Error("Session participants 不完整，无法提交 turn");
  }

  const playerMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: playerParticipant.id,
    recipientIds: [
      gmParticipant.id
    ],
    visibility: "public",
    kind: "player_input",
    content: trimmedInput,
    tags: [
      "turn_input"
    ]
  };

  const progression = advanceMockGameState(
    current.session.gameState,
    trimmedInput,
    current.session.locale,
    nextRound
  );
  const runtimeConfig = store.getRuntimeConfig(sessionId);

  const modelGateway = getModelGateway(current.session.modelAccessMode);
  const turnNarration = await modelGateway.generateTurnNarration({
    accessMode: current.session.modelAccessMode,
    modelProfileId:
      runtimeConfig?.modelProfileId ?? current.session.settings.modelProfileId,
    runtimeModelConfig: runtimeConfig?.runtimeModelConfig,
    locale: current.session.locale,
    playerInput: trimmedInput,
    sceneId: progression.nextGameState.sceneId,
    round: nextRound,
    sceneChanged: progression.sceneChanged,
    stateSummary: progression.stateSummary
  });

  const gmMessage: Message = {
    id: `msg_${randomUUID()}`,
    round: nextRound,
    createdAt: timestamp,
    senderId: gmParticipant.id,
    recipientIds: [
      playerParticipant.id
    ],
    visibility: "public",
    kind: "gm_narration",
    content: turnNarration.text,
    tags: [
      "turn_response",
      `provider:${turnNarration.provider}`
    ]
  };

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
      actorId: "system",
      type: "state_patch_applied",
      displayLevel: "core",
      summary: progression.sceneChanged
        ? `Scene moved to ${progression.nextGameState.sceneId}`
        : `State updated in ${progression.nextGameState.sceneId}`,
      payload: {
        sceneId: progression.nextGameState.sceneId,
        unlockedInfoIds: progression.unlockedInfoIds,
        completedObjectives: progression.completedObjectives,
        activeObjectives: progression.activatedObjectives,
        nightfall: progression.nextGameState.clocks.nightfall
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

  return store.update(sessionId, () => ({
    ...current,
    session: {
      ...current.session,
      currentRound: nextRound,
      updatedAt: timestamp,
      gameState: progression.nextGameState
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
