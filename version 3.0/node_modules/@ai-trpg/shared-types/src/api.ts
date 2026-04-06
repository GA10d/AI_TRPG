import type { GmArchitecture, LocaleCode, PlayMode } from "./content.ts";
import type {
  Message,
  ModelAccessMode,
  ReplayEvent,
  Session
} from "./runtime.ts";

export type CreateSessionRequest = {
  ruleDirectoryName: string;
  storyDirectoryName: string;
  locale: LocaleCode;
  playMode: PlayMode;
  gmArchitecture: GmArchitecture;
  modelAccessMode: ModelAccessMode;
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

export type ServerProxyStatus = {
  available: boolean;
  configured: boolean;
  dependence: "OpenAI" | "Google";
  model: string | null;
  baseUrl: string | null;
  providerLabel: string | null;
  missingEnvKeys: string[];
  message: string;
};

export type BootstrapResponse = {
  defaults: {
    locale: LocaleCode;
    playMode: PlayMode;
    gmArchitecture: GmArchitecture;
    modelAccessMode: ModelAccessMode;
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
