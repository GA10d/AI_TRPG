import { useEffect, useState } from "react";

import type {
  SavedGameRecord,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";
import {
  clearSavedGames,
  deleteSavedGame,
  fetchSavedGames
} from "../lib/trpgApiClient.ts";
import {
  clearRecentSessionSnapshot,
  clearSessionRecords,
  loadRecentSessionSnapshot,
  loadSessionRecords,
  storeSessionSnapshot,
  type SessionRecord
} from "../storage.ts";

export function useStoredProgress() {
  const [recentSnapshot, setRecentSnapshot] = useState<SessionSnapshot | null>(
    () => loadRecentSessionSnapshot()
  );
  const [records, setRecords] = useState<SessionRecord[]>(() => loadSessionRecords());
  const [savedGames, setSavedGames] = useState<SavedGameRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    void fetchSavedGames()
      .then((records) => {
        if (!cancelled) {
          setSavedGames(records);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedGames([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function commitSnapshot(snapshot: SessionSnapshot): void {
    setRecentSnapshot(snapshot);
    setRecords(storeSessionSnapshot(snapshot));
  }

  function commitSaveRecord(saveRecord: SavedGameRecord): void {
    setSavedGames((current) =>
      [saveRecord, ...current.filter((item) => item.saveId !== saveRecord.saveId)].sort((left, right) =>
        right.savedAt.localeCompare(left.savedAt)
      )
    );
  }

  function clearRecent(): void {
    clearRecentSessionSnapshot();
    setRecentSnapshot(null);
  }

  function clearRecordsList(): void {
    clearSessionRecords();
    setRecords([]);
  }

  async function refreshSavedGamesList(): Promise<void> {
    setSavedGames(await fetchSavedGames());
  }

  async function clearSavedGamesList(): Promise<void> {
    await clearSavedGames();
    setSavedGames([]);
  }

  async function removeSavedGameById(saveId: string): Promise<void> {
    await deleteSavedGame(saveId);
    setSavedGames((current) => current.filter((item) => item.saveId !== saveId));
  }

  return {
    recentSnapshot,
    records,
    savedGames,
    commitSnapshot,
    commitSaveRecord,
    clearRecent,
    clearRecordsList,
    refreshSavedGamesList,
    clearSavedGamesList,
    removeSavedGameById
  };
}
