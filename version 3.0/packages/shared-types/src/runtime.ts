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
  isAiControlled?: boolean;
  isLocalUser?: boolean;
  locale?: LocaleCode;
};

export type SessionSettings = {
  logViewMode: "all" | "compact" | "hidden";
  debugEnabled?: boolean;
  promptDebugEnabled?: boolean;
  modelProfileId?: string;
};

export type GameState = {
  phase?: "setup" | "playing" | "ending" | "ended";
  endingState?: null | {
    endingId: string;
    endingType: EndingType;
    title: string;
    summary: string;
    confirmedAtRound: number;
  };
};

export type Session = {
  id: string;
  schemaVersion?: string;
  status: SessionStatus;
  playMode?: PlayMode;
  gmArchitecture?: GmArchitecture;
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
  actorId?: string;
  type:
    | "session_created"
    | "message_created"
    | "turn_submitted"
    | "gm_response_received"
    | "save_created"
    | "save_loaded";
  displayLevel: "core" | "detail" | "debug";
  summary: string;
  payload?: Record<string, unknown>;
};

export type SessionContentSummary = {
  ruleTitle: string;
  storyTitle: string;
  requestedLocale: LocaleCode;
  resolvedLocale: LocaleCode;
};

export type SaveRuntimeConfig = {
  modelProfileId?: string;
  runtimeModelConfig?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
};

export type SaveBundle = {
  schemaVersion?: string;
  savedAt: string;
  session: Session;
  messages: Message[];
  replay: ReplayEvent[];
  contentSummary?: SessionContentSummary;
  runtimeConfig?: SaveRuntimeConfig;
};
