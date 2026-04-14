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
  reasoningContent?: string | null;
};

export type Visibility =
  | "public"
  | "private"
  | "gm_only"
  | "system";

export type MessageChannel =
  | "public_story"
  | "private_chat"
  | "system";

export type StoryControlMode =
  | "auto"
  | "intervene";

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

export type EndingJudgeDecision = {
  GameOver: boolean;
  Reason: string;
  EndingId: string;
  EndingType: "" | EndingType;
  EndingTitle: string;
  EndingSummary: string;
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
  role: "human_player" | "ai_player" | "npc" | "gm" | "system";
  displayName: string;
  isAiControlled?: boolean;
  isLocalUser?: boolean;
  locale?: LocaleCode;
};

export type AiPersonalityTag = {
  id: string;
  group: string;
  polarity: string;
  keyword: string;
  description: string;
};

export type AiAppearanceTag = {
  id: string;
  category: string;
  keyword: string;
  description: string;
};

export type SessionAiCompanion = {
  participantId: string;
  displayName: string;
  personalityTags: AiPersonalityTag[];
  appearanceTags: AiAppearanceTag[];
};

export type SessionPartySetup = {
  primaryPlayerMode: "human" | "ai";
  aiCompanions: SessionAiCompanion[];
};

export type RoundDraft = {
  participantId: string;
  displayName: string;
  role: Participant["role"];
  isPrimary: boolean;
  status: "ready";
  source: "human" | "ai";
  content: string;
  editable: boolean;
  generatedAt?: string | null;
  aiMetadata?: AiGenerationMetadata | null;
};

export type RoundInputState = {
  round: number;
  phase: "collecting" | "ready_to_commit";
  preparedAt: string;
  drafts: RoundDraft[];
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
  lastEndingJudgeResult?: EndingAdjudication | null;
  lastEndingJudgeDecision?: EndingJudgeDecision | null;
  roundInputState?: RoundInputState | null;
  storyControlMode?: StoryControlMode | null;
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
  localHumanParticipantId?: string | null;
  companionParticipantIds?: string[];
  settings: SessionSettings;
  partySetup?: SessionPartySetup;
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
    | "private_chat"
    | "gm_narration"
    | "gm_dialogue"
    | "system"
    | "debug";
  channel?: MessageChannel;
  threadId?: string | null;
  relatedParticipantId?: string | null;
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
    | "round_prepared"
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
  ruleDirectoryName?: string;
  storyDirectoryName?: string;
};

export type SessionMemoryVisibility =
  | "public"
  | "private"
  | "gm_only";

export type SessionMemoryScope = {
  visibility: SessionMemoryVisibility;
  participantId?: string | null;
};

export type SessionFactKind =
  | "identity"
  | "location"
  | "relationship"
  | "clue"
  | "item"
  | "goal"
  | "state_change"
  | "secret"
  | "question"
  | "status";

export type SessionFactStatus =
  | "active"
  | "superseded"
  | "resolved";

export type SessionFact = {
  id: string;
  kind: SessionFactKind;
  scope: SessionMemoryScope;
  text: string;
  entityIds: string[];
  sourceMessageIds: string[];
  roundFirstSeen: number;
  roundLastSeen: number;
  status: SessionFactStatus;
  confidence: number;
  priority: number;
  tags?: string[];
};

export type SessionOpenLoop = {
  id: string;
  scope: SessionMemoryScope;
  title: string;
  summary: string;
  entityIds: string[];
  relatedFactIds: string[];
  sourceMessageIds: string[];
  introducedRound: number;
  lastMentionedRound: number;
  priority: number;
  status: "open" | "resolved";
  tags?: string[];
};

export type SessionEpisodeSummary = {
  id: string;
  scope: SessionMemoryScope;
  title: string;
  summary: string;
  roundStart: number;
  roundEnd: number;
  keyFactIds: string[];
  openLoopIds: string[];
  sourceMessageIds: string[];
  createdAt: string;
};

export type SessionEntityMemory = {
  id: string;
  scope: SessionMemoryScope;
  name: string;
  aliases: string[];
  summary: string;
  relatedFactIds: string[];
  tags: string[];
  lastUpdatedRound: number;
};

export type SessionMemory = {
  version: number;
  facts: SessionFact[];
  openLoops: SessionOpenLoop[];
  episodeSummaries: SessionEpisodeSummary[];
  entities: SessionEntityMemory[];
  lastProcessedMessageId?: string | null;
  updatedAt: string;
};

export type SessionMemoryDelta = {
  newFacts: SessionFact[];
  supersededFactIds: string[];
  resolvedFactIds: string[];
  newOpenLoops: SessionOpenLoop[];
  resolvedOpenLoopIds: string[];
  newEntities: SessionEntityMemory[];
  shouldRefreshEpisodeSummary: boolean;
};

export type EpisodeCompressionResult = {
  title: string;
  summary: string;
  keyFactIds: string[];
  openLoopIds: string[];
};

export type SessionRuntimeContextPackTarget =
  | "narrator"
  | "companion_public_turn"
  | "private_chat";

export type SessionContextPackSection = {
  key: string;
  label: string;
  lines: string[];
};

export type SessionRuntimeContextPack = {
  target: SessionRuntimeContextPackTarget;
  participantId?: string | null;
  round: number;
  assembledText: string;
  sections: SessionContextPackSection[];
  retrievedFactIds: string[];
  retrievedOpenLoopIds: string[];
  recentMessageIds: string[];
  episodeSummaryIds: string[];
};

export type SaveRuntimeConfig = {
  modelProfileId?: string;
  runtimeModelConfig?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  roleModelConfigs?: {
    narrator?: {
      modelProfileId?: string;
      runtimeModelConfig?: {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      };
    };
    participants?: Record<
      string,
      | {
          modelProfileId?: string;
          runtimeModelConfig?: {
            apiKey?: string;
            baseUrl?: string;
            model?: string;
          };
        }
      | undefined
    >;
  };
};

export type SaveBundle = {
  schemaVersion?: string;
  savedAt: string;
  worldlineId?: string | null;
  session: Session;
  messages: Message[];
  replay: ReplayEvent[];
  contentSummary?: SessionContentSummary;
  memory?: SessionMemory;
  runtimeConfig?: SaveRuntimeConfig;
};

export type SavedGameRecord = {
  saveId: string;
  savedAt: string;
  sessionId: string;
  worldlineId?: string | null;
  ruleTitle: string;
  storyTitle: string;
  locale: string;
  status: string;
  round: number;
  updatedAt: string;
  modelAccessMode: string;
  modelProfileId: string;
  storagePath?: string | null;
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
