import type {
  CreateSessionRequest,
  ImagePromptTemplateConfig,
  RuntimeModelConfigInput,
  RuntimeImageModelConfigInput,
  SessionSnapshot
} from "../../../packages/shared-types/src/index.ts";
import type { UiLocaleCode } from "./locales/types.ts";
import type { OpeningPreviewDeliveryMode } from "./openingPreviewPreferences.ts";
import type { MarkdownFontSizePreset, MenuFontSizePreset } from "./ui.ts";

const RECENT_SNAPSHOT_STORAGE_KEY = "trpg3.recentSnapshot";
const SESSION_RECORDS_STORAGE_KEY = "trpg3.sessionRecords";
const WEB_DEFAULTS_STORAGE_KEY = "trpg3.webDefaults";
const PLAYTHROUGH_GRAPHS_STORAGE_KEY = "trpg3.playthroughGraphs";
const ACTIVE_PLAYTHROUGH_GRAPH_ID_STORAGE_KEY = "trpg3.activePlaythroughGraphId";
const MAX_SESSION_RECORDS = 20;

export type StoredWebDefaults = {
  uiLocale?: UiLocaleCode;
  locale: CreateSessionRequest["locale"];
  playMode: CreateSessionRequest["playMode"];
  gmArchitecture: CreateSessionRequest["gmArchitecture"];
  modelAccessMode: CreateSessionRequest["modelAccessMode"];
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  profileRuntimeConfigs?: Record<string, RuntimeModelConfigInput>;
  imageProfileId?: string;
  runtimeImageModelConfig?: RuntimeImageModelConfigInput;
  imageProfileRuntimeConfigs?: Record<string, RuntimeImageModelConfigInput>;
  imagePromptTemplateConfig?: ImagePromptTemplateConfig;
  debugEnabled: boolean;
  logViewMode: NonNullable<CreateSessionRequest["logViewMode"]>;
  openingPreviewDeliveryMode: OpeningPreviewDeliveryMode;
  showAiMetadata: boolean;
  markdownFontSize: MarkdownFontSizePreset;
  menuFontSize: MenuFontSizePreset;
};

export type SessionRecord = {
  sessionId: string;
  ruleTitle: string;
  storyTitle: string;
  locale: string;
  status: string;
  round: number;
  createdAt: string;
  updatedAt: string;
};

export type { SavedGameRecord } from "../../../packages/shared-types/src/index.ts";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(storageKey: string): T | null {
  if (!canUseStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014;
}

function clearPlaythroughGraphCache(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(PLAYTHROUGH_GRAPHS_STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_PLAYTHROUGH_GRAPH_ID_STORAGE_KEY);
}

function writeJson(storageKey: string, value: unknown): void {
  if (!canUseStorage()) {
    return;
  }

  const serializedValue = JSON.stringify(value);

  try {
    window.localStorage.setItem(storageKey, serializedValue);
    return;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      return;
    }
  }

  clearPlaythroughGraphCache();

  try {
    window.localStorage.setItem(storageKey, serializedValue);
    return;
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      return;
    }
  }

  removeItem(RECENT_SNAPSHOT_STORAGE_KEY);
  removeItem(SESSION_RECORDS_STORAGE_KEY);

  try {
    window.localStorage.setItem(storageKey, serializedValue);
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      return;
    }
  }
}

function removeItem(storageKey: string): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(storageKey);
}

function buildRecord(snapshot: SessionSnapshot): SessionRecord {
  return {
    sessionId: snapshot.session.id,
    ruleTitle: snapshot.contentSummary.ruleTitle,
    storyTitle: snapshot.contentSummary.storyTitle,
    locale: snapshot.contentSummary.resolvedLocale,
    status: snapshot.session.status,
    round: snapshot.session.currentRound,
    createdAt: snapshot.session.createdAt,
    updatedAt: snapshot.session.updatedAt
  };
}

export function loadRecentSessionSnapshot(): SessionSnapshot | null {
  return readJson<SessionSnapshot>(RECENT_SNAPSHOT_STORAGE_KEY);
}

export function clearRecentSessionSnapshot(): void {
  removeItem(RECENT_SNAPSHOT_STORAGE_KEY);
}

export function loadSessionRecords(): SessionRecord[] {
  return readJson<SessionRecord[]>(SESSION_RECORDS_STORAGE_KEY) ?? [];
}

export function clearSessionRecords(): void {
  removeItem(SESSION_RECORDS_STORAGE_KEY);
}

export function storeSessionSnapshot(snapshot: SessionSnapshot): SessionRecord[] {
  writeJson(RECENT_SNAPSHOT_STORAGE_KEY, snapshot);

  const nextRecord = buildRecord(snapshot);
  const previous = loadSessionRecords().filter((item) => item.sessionId !== nextRecord.sessionId);
  const nextRecords = [nextRecord, ...previous]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_SESSION_RECORDS);

  writeJson(SESSION_RECORDS_STORAGE_KEY, nextRecords);
  return nextRecords;
}

export function loadStoredWebDefaults(): StoredWebDefaults | null {
  return readJson<StoredWebDefaults>(WEB_DEFAULTS_STORAGE_KEY);
}

export function storeWebDefaults(defaults: StoredWebDefaults): void {
  writeJson(WEB_DEFAULTS_STORAGE_KEY, defaults);
}
