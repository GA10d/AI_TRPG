import type {
  CreateSessionRequest,
  RuntimeModelConfigInput,
  SaveBundle,
  SessionSnapshot
} from "../../../packages/shared-types/src/index.ts";

const RECENT_SNAPSHOT_STORAGE_KEY = "trpg3.recentSnapshot";
const SESSION_RECORDS_STORAGE_KEY = "trpg3.sessionRecords";
const SAVED_GAMES_STORAGE_KEY = "trpg3.savedGames";
const WEB_DEFAULTS_STORAGE_KEY = "trpg3.webDefaults";
const MAX_SESSION_RECORDS = 20;
const MAX_SAVED_GAMES = 12;

export type StoredWebDefaults = {
  locale: CreateSessionRequest["locale"];
  playMode: CreateSessionRequest["playMode"];
  gmArchitecture: CreateSessionRequest["gmArchitecture"];
  modelAccessMode: CreateSessionRequest["modelAccessMode"];
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  debugEnabled: boolean;
  logViewMode: NonNullable<CreateSessionRequest["logViewMode"]>;
};

export type SessionRecord = {
  sessionId: string;
  ruleTitle: string;
  storyTitle: string;
  locale: string;
  status: string;
  round: number;
  sceneId: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedGameRecord = {
  saveId: string;
  savedAt: string;
  sessionId: string;
  ruleTitle: string;
  storyTitle: string;
  locale: string;
  status: string;
  round: number;
  sceneId: string;
  updatedAt: string;
  modelAccessMode: string;
  modelProfileId: string;
  bundle: SaveBundle;
};

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

function writeJson(storageKey: string, value: unknown): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(value));
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
    sceneId: snapshot.session.gameState.sceneId,
    createdAt: snapshot.session.createdAt,
    updatedAt: snapshot.session.updatedAt
  };
}

function buildSavedGameRecord(saveBundle: SaveBundle): SavedGameRecord {
  return {
    saveId: `${saveBundle.session.id}:${saveBundle.savedAt}`,
    savedAt: saveBundle.savedAt,
    sessionId: saveBundle.session.id,
    ruleTitle: saveBundle.contentSummary.ruleTitle,
    storyTitle: saveBundle.contentSummary.storyTitle,
    locale: saveBundle.contentSummary.resolvedLocale,
    status: saveBundle.session.status,
    round: saveBundle.session.currentRound,
    sceneId: saveBundle.session.gameState.sceneId,
    updatedAt: saveBundle.session.updatedAt,
    modelAccessMode: saveBundle.session.modelAccessMode,
    modelProfileId:
      saveBundle.runtimeConfig?.modelProfileId ??
      saveBundle.session.settings.modelProfileId ??
      "unknown",
    bundle: saveBundle
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

export function loadSavedGames(): SavedGameRecord[] {
  return readJson<SavedGameRecord[]>(SAVED_GAMES_STORAGE_KEY) ?? [];
}

export function clearSavedGames(): void {
  removeItem(SAVED_GAMES_STORAGE_KEY);
}

export function removeSavedGame(saveId: string): SavedGameRecord[] {
  const nextRecords = loadSavedGames().filter((item) => item.saveId !== saveId);
  writeJson(SAVED_GAMES_STORAGE_KEY, nextRecords);
  return nextRecords;
}

export function storeSaveBundle(saveBundle: SaveBundle): SavedGameRecord[] {
  const nextRecord = buildSavedGameRecord(saveBundle);
  const previous = loadSavedGames().filter((item) => item.saveId !== nextRecord.saveId);
  const nextRecords = [nextRecord, ...previous]
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, MAX_SAVED_GAMES);

  writeJson(SAVED_GAMES_STORAGE_KEY, nextRecords);
  return nextRecords;
}

export function loadStoredWebDefaults(): StoredWebDefaults | null {
  return readJson<StoredWebDefaults>(WEB_DEFAULTS_STORAGE_KEY);
}

export function storeWebDefaults(defaults: StoredWebDefaults): void {
  writeJson(WEB_DEFAULTS_STORAGE_KEY, defaults);
}
