import type {
  ContentCatalogEntry,
  GmArchitecture,
  LocaleCode,
  PlayMode
} from "./content.ts";
import type {
  AiAppearanceTag,
  AiPersonalityTag,
  AiGenerationMetadata,
  SessionMemory,
  SessionRuntimeContextPack,
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

export type RoleTextModelConfigInput = {
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
};

export type AdvancedTextModelConfigInput = {
  narrator?: RoleTextModelConfigInput | null;
  primaryPlayer?: RoleTextModelConfigInput | null;
  companionOverrides?: Array<RoleTextModelConfigInput | null>;
};

export type RuntimeImageModelConfigInput = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  imageSize?: string;
  aspectRatio?: string;
  quality?: string;
  background?: string;
  outputFormat?: string;
  outputCompression?: number;
  watermark?: boolean;
};

export type ImageReferenceRole =
  | "character"
  | "previous_page"
  | "style_reference";

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
  appearanceTagIds: string[];
};

export type CreateSessionRequest = {
  ruleDirectoryName: string;
  storyDirectoryName: string;
  locale: LocaleCode;
  playMode: PlayMode;
  gmArchitecture: GmArchitecture;
  backgroundCompressionEnabled?: boolean;
  modelAccessMode: ModelAccessMode;
  characterConcept?: string;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  advancedTextModelConfig?: AdvancedTextModelConfigInput;
  primaryPlayerDisplayName?: string;
  primaryPlayerPersonalityTagIds?: string[];
  primaryPlayerAppearanceTagIds?: string[];
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

export type CreateSaveRequest = {
  worldlineId?: string | null;
};

export type LocalSaveSettings = {
  saveDirectory: string | null;
  effectiveSaveDirectory: string;
  usesDefaultSaveDirectory: boolean;
  hasSelectedSaveDirectory: boolean;
};

export type UpdateLocalSaveSettingsRequest = {
  saveDirectory: string | null;
};

export type PickLocalSaveDirectoryRequest = {
  initialDirectory?: string | null;
  title?: string | null;
};

export type PickLocalSaveDirectoryResponse = {
  selectedPath: string | null;
};

export type SessionSnapshot = {
  session: Session;
  messages: Message[];
  replay: ReplayEvent[];
  contentSummary: SessionContentSummary;
  memory?: SessionMemory;
};

export type SessionMemoryDebugResponse = {
  sessionId: string;
  memory: SessionMemory;
};

export type SessionMemoryRebuildResponse = {
  snapshot: SessionSnapshot;
  memory: SessionMemory;
};

export type SessionContextPackDebugResponse = {
  sessionId: string;
  contextPack: SessionRuntimeContextPack;
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

export type TurnResolutionStage =
  | "requesting_narrator"
  | "waiting_turn_narration"
  | "judging_ending"
  | "finalizing_turn"
  | "memory_deferred";

export type TurnResolutionStreamEvent =
  | {
      type: "stage";
      stage: TurnResolutionStage;
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

export type UpsertWorldlineComicPageRequest = {
  storyTitle: string;
  ruleTitle: string;
  locale: LocaleCode;
  pageIndex: number;
  storyPrompt: string;
  styleId?: string;
  storyMemorySummary?: string;
  characterReferences?: ComicCharacterReferenceInput[];
  imageProfileId?: string;
  runtimeImageModelConfig?: RuntimeImageModelConfigInput;
};

export type UpsertWorldlineComicPageResponse = PersistedComicMutationResponse & {
  created: boolean;
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
  dependence: "Mock" | "OpenAI" | "Google" | "DashScope";
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

export type ImageReferenceInput = {
  imageUrl: string;
  role?: ImageReferenceRole;
  label?: string;
};

export type ImageGenerationRequest = {
  prompt: string;
  trigger: ImagePromptTrigger;
  theme?: string;
  sceneId: string;
  characters?: ImageCharacterReference[];
  referenceImages?: ImageReferenceInput[];
  negativePrompt?: string;
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

export type ComicStylePreset = {
  id: string;
  name: string;
  prompt: string;
};

export type ComicReferenceImageInput = {
  imageUrl: string;
  role?: "character" | "previous_page";
  name?: string;
  appearance?: string;
};

export type ComicCharacterReferenceInput = {
  name?: string;
  appearance: string;
};

export type ComicPreviousPageInput = {
  pageNumber: number;
  prompt: string;
  summary?: string;
  imageUrl?: string | null;
};

export type ComicPageGenerationRequest = {
  storyPrompt: string;
  styleId?: string;
  sceneId?: string;
  pageNumber?: number;
  storyMemorySummary?: string;
  previousPages?: ComicPreviousPageInput[];
  referenceImages?: ComicReferenceImageInput[];
  characterReferences?: ComicCharacterReferenceInput[];
  negativePrompt?: string;
  allowFallback?: boolean;
  imageProfileId?: string;
  runtimeImageModelConfig?: RuntimeImageModelConfigInput;
};

export type ComicPageGenerationResponse = ImageGenerationResponse & {
  style: ComicStylePreset;
  pageNumber: number;
  continuationContext: string | null;
  characterReferenceCount: number;
  previousPageReferenceCount: number;
};

export type ComicMetadataGenerationRequest = {
  storyPrompt: string;
  styleId?: string;
  locale: LocaleCode;
  modelAccessMode: ModelAccessMode;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
};

export type ComicMetadataGenerationResponse = {
  title: string;
  description: string;
  rawText: string;
  provider: string;
  mode: ModelAccessMode;
  meta?: AiGenerationMetadata | null;
  style: ComicStylePreset;
};

export type ComicPromptPresetResponse = {
  styles: ComicStylePreset[];
  pageLayout: string;
};

export type PersistedImageAsset = {
  relativePath: string;
  storagePath: string;
  apiPath: string;
  mimeType: string | null;
};

export type PersistedComicAsset = {
  relativePath: string;
  storagePath: string;
  apiPath: string;
  mimeType: string | null;
};

export type PersistedComicReference = {
  referenceId: string;
  role: "character";
  name?: string | null;
  appearance?: string | null;
  sourceUrl?: string | null;
  createdAt: string;
  image: PersistedComicAsset;
};

export type PersistedComicPage = {
  pageId: string;
  pageNumber: number;
  storyPrompt: string;
  revisedPrompt: string;
  continuationContext: string | null;
  negativePrompt: string | null;
  provider: string;
  createdAt: string;
  style: ComicStylePreset;
  image: PersistedComicAsset;
  characterReferenceIds: string[];
  previousPageNumber: number | null;
};

export type PersistedComicProject = {
  comicId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string;
  storyPrompt: string;
  style: ComicStylePreset;
  pageCount: number;
  storageRoot: string;
  coverImage?: PersistedComicAsset | null;
  references: PersistedComicReference[];
  pages: PersistedComicPage[];
};

export type ComicProjectSummary = {
  comicId: string;
  title: string;
  description: string;
  style: ComicStylePreset;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
  storagePath: string;
  coverImage?: PersistedComicAsset | null;
};

export type CreatePersistedComicRequest = ComicPageGenerationRequest & {
  title?: string;
  description?: string;
  generateMetadata?: boolean;
  metadataLocale?: LocaleCode;
  metadataModelAccessMode?: ModelAccessMode;
  metadataModelProfileId?: string;
  metadataRuntimeModelConfig?: RuntimeModelConfigInput;
};

export type AppendPersistedComicPageRequest = {
  storyPrompt: string;
  referenceImages?: ComicReferenceImageInput[];
  negativePrompt?: string;
  storyMemorySummary?: string;
  allowFallback?: boolean;
  imageProfileId?: string;
  runtimeImageModelConfig?: RuntimeImageModelConfigInput;
};

export type PersistedComicMutationResponse = {
  project: PersistedComicProject;
  page: PersistedComicPage;
};

export type NpcPortraitVariant = {
  portraitId: string;
  source: "generated" | "story_asset";
  provider: string;
  createdAt: string | null;
  prompt: string | null;
  revisedPrompt: string;
  image: PersistedImageAsset;
};

export type NpcRosterEntry = {
  id: string;
  name: string;
  summary: string;
  promptText: string;
  portraitAssetUrl?: string | null;
  portraitStyleId?: string | null;
  selectedPortraitId?: string | null;
  portraitVariants?: NpcPortraitVariant[];
};

export type PrepareNpcPortraitsRequest = {
  ruleDirectoryName: string;
  storyDirectoryName: string;
  styleId?: string;
  imageProfileId?: string;
  runtimeImageModelConfig?: RuntimeImageModelConfigInput;
  promptTemplateConfig?: ImagePromptTemplateConfig;
};

export type PrepareNpcPortraitsResponse = {
  roster: NpcRosterEntry[];
  style: ComicStylePreset;
  generatedNpcIds: string[];
  reusedNpcIds: string[];
};

export type RegenerateNpcPortraitRequest = PrepareNpcPortraitsRequest & {
  npcId: string;
};

export type RegenerateNpcPortraitResponse = {
  npc: NpcRosterEntry;
  portrait: NpcPortraitVariant;
  style: ComicStylePreset;
};

export type SelectNpcPortraitRequest = {
  ruleDirectoryName: string;
  storyDirectoryName: string;
  styleId?: string;
  npcId: string;
  portraitId: string;
};

export type SelectNpcPortraitResponse = {
  npc: NpcRosterEntry;
  style: ComicStylePreset;
};

export type BootstrapResponse = {
  defaults: {
    locale: LocaleCode;
    playMode: PlayMode;
    gmArchitecture: GmArchitecture;
    backgroundCompressionEnabled: boolean;
    modelAccessMode: ModelAccessMode;
    modelProfileId: string;
    imageProfileId: string;
    logViewMode: "all" | "compact" | "hidden";
  };
  personalityTags: AiPersonalityTag[];
  appearanceTags: AiAppearanceTag[];
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
