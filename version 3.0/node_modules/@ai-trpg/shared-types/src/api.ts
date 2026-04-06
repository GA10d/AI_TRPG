import type { GmArchitecture, LocaleCode, PlayMode } from "./content.ts";
import type {
  Message,
  ModelAccessMode,
  ReplayEvent,
  Session
} from "./runtime.ts";

export type RuntimeModelConfigInput = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export type CreateSessionRequest = {
  ruleDirectoryName: string;
  storyDirectoryName: string;
  locale: LocaleCode;
  playMode: PlayMode;
  gmArchitecture: GmArchitecture;
  modelAccessMode: ModelAccessMode;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  debugEnabled?: boolean;
  promptDebugEnabled?: boolean;
  logViewMode?: "all" | "compact" | "hidden";
};

export type SubmitTurnRequest = {
  playerInput: string;
};

export type SessionSnapshot = {
  session: Session;
  messages: Message[];
  replay: ReplayEvent[];
  contentSummary: {
    ruleTitle: string;
    storyTitle: string;
    requestedLocale: LocaleCode;
    resolvedLocale: LocaleCode;
  };
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

export type BootstrapResponse = {
  defaults: {
    locale: LocaleCode;
    playMode: PlayMode;
    gmArchitecture: GmArchitecture;
    modelAccessMode: ModelAccessMode;
    modelProfileId: string;
    logViewMode: "all" | "compact" | "hidden";
  };
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
  catalog: Array<{
    ruleId: string;
    directoryName: string;
    defaultLocale: LocaleCode;
    availableLocales: LocaleCode[];
    ruleTitle: string;
    stories: Array<{
      storyId: string;
      directoryName: string;
      title: string;
      availableLocales: LocaleCode[];
    }>;
  }>;
};
