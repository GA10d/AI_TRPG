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

export type AiGenerationUsage = {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  promptCacheHitTokens?: number | null;
  promptCacheMissTokens?: number | null;
};

export type AiGenerationCost = {
  amount: number;
  currency: "USD" | "CNY";
  pricingModel?: string | null;
  sourceUrl?: string | null;
  note?: string | null;
};

export type AiGenerationMetadata = {
  provider: string;
  mode: ModelAccessMode;
  model?: string | null;
  durationMs?: number | null;
  estimatedCost?: AiGenerationCost | null;
  usage?: AiGenerationUsage | null;
};

export type Visibility =
  | "public"
  | "private"
  | "gm_only"
  | "system";

export type EndingType =
  | "preset"
  | "hidden"
  | "emergent";

export type EndingState = {
  endingId: string;
  endingType: EndingType;
  title: string;
  summary: string;
  confirmedAtRound: number;
};

export type EndingAdjudication = {
  isGameOver: boolean;
  endingState: EndingState | null;
  adjudicationSource: "mock" | "single_agent" | "multi_agent" | "unknown";
};

export type PlaythroughNodeKind =
  | "opening"
  | "turn"
  | "manual"
  | "ending"
  | "debrief"
  | "epilogue";

export type PlaythroughExpandabilityMode =
  | "open"
  | "locked_by_ending"
  | "special_followup_only"
  | "closed";

export type PlaythroughEdgeKind =
  | "turn_progression"
  | "branch_resume"
  | "after_ending_followup";

export type PlaythroughVisualFamily =
  | "mainline"
  | "branch"
  | "after_ending";

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
  endingState?: EndingState | null;
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
  aiMetadata?: AiGenerationMetadata | null;
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
    | "ending_confirmed"
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

export type PlaythroughGraph = {
  id: string;
  ruleId: string;
  storyId: string;
  locale: LocaleCode;
  createdAt: string;
  updatedAt: string;
  rootNodeId: string;
  currentNodeId: string;
  activeRouteId: string;
  pendingContinuationFromNodeId?: string | null;
  unlockedAtEnding: boolean;
  firstEndingReachedAt?: string;
  nodeCount: number;
  terminalNodeIds: string[];
};

export type PlaythroughNode = {
  id: string;
  graphId: string;
  parentNodeId: string | null;
  nodeKind: PlaythroughNodeKind;
  round: number;
  createdAt: string;
  checkpointKind: "opening" | "turn" | "manual" | "ending";
  sourceSessionId: string;
  snapshotId: string;
  playerPreview: string | null;
  gmPreview: string | null;
  statusAtCapture: SessionStatus;
  expandability: {
    mode: PlaythroughExpandabilityMode;
    reason?: string;
  };
  terminalState: {
    isTerminal: boolean;
    reason: "open" | "ending_confirmed";
    adjudicationSource: "mock" | "single_agent" | "multi_agent" | "unknown";
  };
  endingState?: EndingState | null;
  tags?: string[];
};

export type PlaythroughEdge = {
  id: string;
  graphId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeKind: PlaythroughEdgeKind;
  routeId: string;
  depthInRoute: number;
  visualFamily: PlaythroughVisualFamily;
};

export type SnapshotBlob = {
  id: string;
  graphId: string;
  nodeId: string;
  createdAt: string;
  saveBundle: SaveBundle;
};

export type PlaythroughGraphBundle = {
  graph: PlaythroughGraph;
  nodes: PlaythroughNode[];
  edges: PlaythroughEdge[];
  snapshots: SnapshotBlob[];
};
