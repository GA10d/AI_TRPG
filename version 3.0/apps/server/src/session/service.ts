import { randomUUID } from "node:crypto";

import {
  DEFAULT_LOG_VIEW_MODE,
  PHASE1_DEFAULTS
} from "../../../../packages/shared-config/src/index.ts";
import type {
  CreateSessionRequest,
  Message,
  ReplayEvent,
  Session,
  SessionSnapshot,
  SubmitTurnRequest
} from "../../../../packages/shared-types/src/index.ts";
import { loadPlayableContentBundle } from "../content/index.ts";
import type { InMemorySessionStore } from "./store.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function buildMockOpeningText(
  storyTitle: string,
  storyIntro: string,
  sceneId: string,
  locale: string
): string {
  const cleanedIntro = storyIntro.replace(/\s+/g, " ").trim();
  const preview = cleanedIntro.slice(0, 240);

  if (locale.toLowerCase().startsWith("en")) {
    return [
      `[Mock GM] Welcome to "${storyTitle}".`,
      preview,
      `Current opening scene: ${sceneId}.`,
      "This is a Phase 1 mock opening used to validate the session pipeline."
    ].join("\n\n");
  }

  return [
    `【Mock 主持】欢迎进入《${storyTitle}》。`,
    preview,
    `当前开场场景：${sceneId}。`,
    "这是一段 Phase 1 的假开场文本，用来验证会话创建、内容加载和前端链路。"
  ].join("\n\n");
}

function buildMockTurnResponse(
  playerInput: string,
  sceneId: string,
  locale: string,
  round: number
): string {
  const cleanedInput = playerInput.replace(/\s+/g, " ").trim();

  if (locale.toLowerCase().startsWith("en")) {
    return [
      `[Mock GM] Turn ${round} received.`,
      `You attempted: ${cleanedInput}`,
      `The current scene is still ${sceneId}.`,
      "Phase 1 mock processing: the system records your action, keeps the scene stable, and returns a placeholder narration."
    ].join("\n\n");
  }

  return [
    `【Mock 主持】已收到第 ${round} 轮行动。`,
    `你的输入是：${cleanedInput}`,
    `当前场景仍然是：${sceneId}。`,
    "这是 Phase 1 的假回合处理结果：系统会先记录玩家输入，暂时不推进复杂规则，只返回一段占位叙事。"
  ].join("\n\n");
}

function buildSystemCreatedMessage(
  playerParticipantId: string,
  storyTitle: string,
  locale: string,
  timestamp: string
): Message {
  const content = locale.toLowerCase().startsWith("en")
    ? `Session created for ${storyTitle} (${locale}).`
    : `Session created for ${storyTitle} (${locale}).`;

  return {
    id: `msg_${randomUUID()}`,
    round: 0,
    createdAt: timestamp,
    senderId: "system",
    recipientIds: [playerParticipantId],
    visibility: "system",
    kind: "system",
    content,
    tags: [
      "session_created"
    ]
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
  const storyIntro = bundle.story.intro?.content ?? bundle.story.story.content;
  const mockOpening = buildMockOpeningText(
    storyTitle,
    storyIntro,
    bundle.story.manifest.startSceneId,
    String(bundle.resolvedLocale)
  );

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
      modelProfileId:
        request.modelAccessMode === "mock"
          ? "mock-local"
          : "openai-compatible-proxy"
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
      content: mockOpening,
      tags: [
        "mock_opening"
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
        mode: request.modelAccessMode
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

  store.save(snapshot);
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
    debugEnabled: true,
    promptDebugEnabled: false,
    logViewMode: PHASE1_DEFAULTS.logViewMode
  };
}

export function submitMockTurn(
  sessionId: string,
  request: SubmitTurnRequest,
  store: InMemorySessionStore
): SessionSnapshot | null {
  const trimmedInput = request.playerInput.trim();
  if (trimmedInput.length === 0) {
    throw new Error("玩家输入不能为空");
  }

  return store.update(sessionId, (current) => {
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
      content: buildMockTurnResponse(
        trimmedInput,
        current.session.gameState.sceneId,
        String(current.session.locale),
        nextRound
      ),
      tags: [
        "mock_turn_response"
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
        summary: "Mock turn narration generated",
        payload: {
          messageId: gmMessage.id
        }
      }
    ];

    return {
      ...current,
      session: {
        ...current.session,
        currentRound: nextRound,
        updatedAt: timestamp,
        gameState: {
          ...current.session.gameState,
          storyFlags: {
            ...current.session.gameState.storyFlags,
            last_player_input: trimmedInput,
            last_mock_turn_round: nextRound
          }
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
    };
  });
}
