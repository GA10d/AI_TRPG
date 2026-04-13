import type {
  ContentCatalogEntry,
  GmArchitecture,
  LocaleCode,
  PlayMode
} from "./content.ts";
import type {
  AiPersonalityTag,
  AiGenerationMetadata,
  Message,
  ModelAccessMode,
  ReplayEvent,
  SavedGameRecord,
  SaveBundle,
  Session,
  SessionContentSummary
} from "./runtime.ts";
import type { StoryControlMode } from "./runtime.ts";

export type RuntimeModelConfigInput = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export type RuntimeImageModelConfigInput = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export type ImagePromptTrigger =
  | "manual"
  | "character_portrait"
  | "npc_intro"
  | "scene_shift";

export type ImagePromptTemplateConfig = {
  version: number;
  defaultTheme: string;
  defaultTrigger: ImagePromptTrigger;
  fallbackTriggerTemplate: string;
  themes: Record<string, string>;
  triggerTemplates: Record<ImagePromptTrigger, string>;
  characterClauseTemplate: string;
  characterJoinSeparator: string;
  characterEntryTemplate: string;
};

export type CreateSessionAiCompanionInput = {
  displayName: string;
  personalityTagIds: string[];
};

export type CreateSessionRequest = {
  ruleDirectoryName: string;
  storyDirectoryName: string;
  locale: LocaleCode;
  playMode: PlayMode;
  gmArchitecture: GmArchitecture;
  modelAccessMode: ModelAccessMode;
  characterConcept?: string;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  aiCompanions?: CreateSessionAiCompanionInput[];
  debugEnabled?: boolean;
  promptDebugEnabled?: boolean;
  logViewMode?: "all" | "compact" | "hidden";
};

export type GenerateOpeningPreviewRequest = CreateSessionRequest & {
  forceRegenerateOpening?: boolean;
};

export type GenerateOpeningPreviewResponse = {
  text: string;
  provider: string;
  mode: ModelAccessMode;
  meta?: AiGenerationMetadata | null;
};

export type CharacterConceptAssistMode = "generate" | "complete";

export type CharacterConceptAssistRequest = CreateSessionRequest & {
  mode: CharacterConceptAssistMode;
  openingText: string;
  currentText?: string;
};

export type CharacterConceptAssistResponse = {
  text: string;
  provider: string;
  mode: ModelAccessMode;
  meta?: AiGenerationMetadata | null;
};

export type SubmitTurnRequest = {
  playerInput: string;
};

export type PrepareRoundRequest = {
  playerInput?: string;
};

export type CommitRoundRequest = {
  playerInput?: string;
};

export type SendPrivateChatRequest = {
  targetParticipantId: string;
  content: string;
};

export type UpdateStoryControlModeRequest = {
  mode: StoryControlMode;
};

export type SubmitManualNarrationRequest = {
  narrationText: string;
};

export type LoadSaveRequest = {
  saveBundle: SaveBundle;
};

export type SessionSnapshot = {
  session: Session;
  messages: Message[];
  replay: ReplayEvent[];
  contentSummary: SessionContentSummary;
};

export type SessionCreateStage =
  | "loading_content"
  | "assembling_prompt"
  | "requesting_narrator"
  | "waiting_first_reply"
  | "finalizing_session";

export type SessionCreateStreamEvent =
  | {
      type: "stage";
      stage: SessionCreateStage;
      label: string;
      detail: string;
      progress: number;
    }
  | {
      type: "done";
      snapshot: SessionSnapshot;
    }
  | {
      type: "error";
      message: string;
    };

export type CreateSaveResponse = {
  snapshot: SessionSnapshot;
  saveBundle: SaveBundle;
  saveRecord: SavedGameRecord;
};

export type ModelFeatureSummary = {
  key: string;
  label: string;
  supported: boolean;
  model: string | null;
  url: string | null;
};

export type ModelProfileSummary = {
  id: string;
  name: string;
  code: string;
  accessMode: ModelAccessMode;
  providerFamily: string;
  dependence: "Mock" | "OpenAI" | "Google";
  description: string;
  urlRequirements: boolean;
  baseUrl: string | null;
  baseModel: string | null;
  chargeUrl: string;
  docsUrl: string;
  envKeyCandidates: string[];
  supportsFeatures: string[];
  featureDetails: ModelFeatureSummary[];
  allowsCustomApiKey: boolean;
  allowsCustomBaseUrl: boolean;
  allowsCustomModel: boolean;
  configured: boolean;
  available: boolean;
  missingEnvKeys: string[];
  message: string;
};

export type ServerProxyStatus = {
  available: boolean;
  configured: boolean;
  configuredProfileIds: string[];
  defaultProfileId: string;
  message: string;
};

export type ImageModelFeatureSummary = {
  key: string;
  label: string;
  supported: boolean;
  model: string | null;
  url: string | null;
};

export type ImageProfileSummary = {
  id: string;
  name: string;
  code: string;
  providerFamily: string;
  dependence: "Mock" | "OpenAI" | "Google";
  description: string;
  urlRequirements: boolean;
  baseUrl: string | null;
  baseModel: string | null;
  chargeUrl: string;
  docsUrl: string;
  envKeyCandidates: string[];
  allowsCustomApiKey: boolean;
  allowsCustomBaseUrl: boolean;
  allowsCustomModel: boolean;
  configured: boolean;
  available: boolean;
  missingEnvKeys: string[];
  message: string;
  featureDetails: ImageModelFeatureSummary[];
};

export type ImageCharacterReference = {
  name: string;
  appearance: string;
  portraitUrl?: string;
};

export type ImageGenerationRequest = {
  prompt: string;
  trigger: ImagePromptTrigger;
  theme?: string;
  sceneId: string;
  characters?: ImageCharacterReference[];
  allowFallback?: boolean;
  imageProfileId?: string;
  runtimeImageModelConfig?: RuntimeImageModelConfigInput;
  promptTemplateConfig?: ImagePromptTemplateConfig;
};

export type ImageGenerationResponse = {
  imageUrl: string;
  revisedPrompt: string;
  provider: string;
  cached: boolean;
  mimeType?: string | null;
  outputPath?: string | null;
};

export type NpcRosterEntry = {
  id: string;
  name: string;
  summary: string;
  promptText: string;
  portraitAssetUrl?: string | null;
};

export type BootstrapResponse = {
  defaults: {
    locale: LocaleCode;
    playMode: PlayMode;
    gmArchitecture: GmArchitecture;
    modelAccessMode: ModelAccessMode;
    modelProfileId: string;
    imageProfileId: string;
    logViewMode: "all" | "compact" | "hidden";
  };
  personalityTags: AiPersonalityTag[];
  languages: Array<{
    id: number;
    code: LocaleCode;
    label: string;
    nativeLabel: string;
  }>;
  modelAccessModes: Array<{
    code: ModelAccessMode;
    label: string;
    description: string;
    available: boolean;
    configured: boolean;
    message: string;
  }>;
  modelProfiles: ModelProfileSummary[];
  serverProxyStatus: ServerProxyStatus;
  imageProfiles: ImageProfileSummary[];
  imagePromptTemplateConfig: ImagePromptTemplateConfig;
  catalog: ContentCatalogEntry[];
};
