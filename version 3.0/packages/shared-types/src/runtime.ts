import type { GmArchitecture, LocaleCode, PlayMode } from "./content.ts";

export type SessionStatus =
  | "draft"
  | "active"
  | "paused"
  | "ending"
  | "ended";

export type ModelAccessMode =
  | "mock"
  | "server_proxy"
  | "browser_direct";

export type Visibility =
  | "public"
  | "private"
  | "gm_only"
  | "system";

export type EndingType =
  | "preset"
  | "hidden"
  | "emergent";

export type Participant = {
  id: string;
  role: "human_player" | "npc" | "gm" | "system";
  displayName: string;
  isAiControlled: boolean;
  isLocalUser: boolean;
  locale?: LocaleCode;
};

export type SessionSettings = {
  logViewMode: "all" | "compact" | "hidden";
  debugEnabled: boolean;
  promptDebugEnabled: boolean;
  modelProfileId?: string;
};

export type GameState = {
  schemaVersion: string;
  phase: "setup" | "playing" | "ending" | "ended";
  sceneId: string;
  sceneState: Record<string, unknown>;
  actorState: Record<string, unknown>;
  storyFlags: Record<string, boolean | number | string | null>;
  clocks: Record<string, number>;
  discoveredInfoIds: string[];
  objectiveState: {
    active: string[];
    completed: string[];
    failed: string[];
  };
  unresolvedHooks: string[];
  endingState: null | {
    endingId: string;
    endingType: EndingType;
    title: string;
    summary: string;
    confirmedAtRound: number;
  };
};

export type Session = {
  id: string;
  schemaVersion: string;
  status: SessionStatus;
  playMode: PlayMode;
  gmArchitecture: GmArchitecture;
  modelAccessMode: ModelAccessMode;
  locale: LocaleCode;
  ruleId: string;
  storyId: string;
  currentRound: number;
  createdAt: string;
  updatedAt: string;
  participants: Participant[];
  playerParticipantId: string;
  settings: SessionSettings;
  gameState: GameState;
};

export type Message = {
  id: string;
  round: number;
  createdAt: string;
  senderId: string;
  recipientIds: string[];
  visibility: Visibility;
  kind:
    | "player_input"
    | "npc_chat"
    | "gm_narration"
    | "gm_dialogue"
    | "system"
    | "debug";
  content: string;
  tags?: string[];
};

export type ReplayEvent = {
  id: string;
  round: number;
  createdAt: string;
  actorId: string;
  type:
    | "session_created"
    | "message_created"
    | "submission_locked"
    | "gm_response_received"
    | "adjudication_received"
    | "state_patch_applied"
    | "ending_candidate_detected"
    | "ending_confirmed"
    | "save_created"
    | "save_loaded";
  displayLevel: "core" | "detail" | "debug";
  summary: string;
  payload?: Record<string, unknown>;
};

export type StatePatchOp = {
  op: "set" | "increment" | "append" | "remove";
  path: string;
  value?: unknown;
  reason?: string;
};

export type EndingCandidate = {
  id: string;
  type: EndingType;
  title: string;
  summary: string;
  visibility: "public" | "hidden";
  confidence: number;
  reasons: string[];
};

export type AdjudicationResult = {
  id: string;
  round: number;
  sourceArchitecture: GmArchitecture;
  patchOps: StatePatchOp[];
  unlockedInfoIds: string[];
  sceneTransition: null | {
    fromSceneId: string;
    toSceneId: string;
    reason: string;
  };
  risks: {
    escalated: string[];
    relieved: string[];
  };
  isGameOver: boolean;
  endingCandidate: EndingCandidate | null;
  rationale: string[];
  followUpHooks: string[];
};

export type SaveBundle = {
  schemaVersion: string;
  savedAt: string;
  session: Session;
  messages: Message[];
  replay: ReplayEvent[];
  agentContexts: Record<string, Message[]>;
  derivedMemory?: {
    sceneSummary?: string;
    objectiveSummary?: string;
    actorSummaries?: Record<string, string>;
  };
};
