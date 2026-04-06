import { useState } from "react";

import type { SaveBundle, SessionSnapshot } from "../../../../packages/shared-types/src/index.ts";
import {
  clearRecentSessionSnapshot,
  clearSavedGames,
  clearSessionRecords,
  loadRecentSessionSnapshot,
  loadSavedGames,
  loadSessionRecords,
  removeSavedGame,
  storeSaveBundle,
  storeSessionSnapshot,
  type SavedGameRecord,
  type SessionRecord
} from "../storage.ts";

export function useStoredProgress() {
  const [recentSnapshot, setRecentSnapshot] = useState<SessionSnapshot | null>(
    () => loadRecentSessionSnapshot()
  );
  const [records, setRecords] = useState<SessionRecord[]>(() => loadSessionRecords());
  const [savedGames, setSavedGames] = useState<SavedGameRecord[]>(() => loadSavedGames());

  function commitSnapshot(snapshot: SessionSnapshot): void {
    setRecentSnapshot(snapshot);
    setRecords(storeSessionSnapshot(snapshot));
  }

  function commitSaveBundle(saveBundle: SaveBundle): void {
    setSavedGames(storeSaveBundle(saveBundle));
  }

  function clearRecent(): void {
    clearRecentSessionSnapshot();
    setRecentSnapshot(null);
  }

  function clearRecordsList(): void {
    clearSessionRecords();
    setRecords([]);
  }

  function clearSavedGamesList(): void {
    clearSavedGames();
    setSavedGames([]);
  }

  function removeSavedGameById(saveId: string): void {
    setSavedGames(removeSavedGame(saveId));
  }

  return {
    recentSnapshot,
    records,
    savedGames,
    commitSnapshot,
    commitSaveBundle,
    clearRecent,
    clearRecordsList,
    clearSavedGamesList,
    removeSavedGameById
  };
}
