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
  SessionSnapshot
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
    {
      id: `msg_${randomUUID()}`,
      round: 0,
      createdAt: timestamp,
      senderId: "system",
      recipientIds: [playerParticipantId],
      visibility: "system",
      kind: "system",
      content: `Session created for ${storyTitle} (${bundle.resolvedLocale}).`,
      tags: [
        "session_created"
      ]
    },
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
