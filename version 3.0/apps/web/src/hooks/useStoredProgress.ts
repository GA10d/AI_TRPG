import { useState } from "react";

import type { SessionSnapshot } from "../../../../packages/shared-types/src/index.ts";
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

  function commitSnapshot(snapshot: SessionSnapshot): void {
    setRecentSnapshot(snapshot);
    setRecords(storeSessionSnapshot(snapshot));
  }

  function clearRecent(): void {
    clearRecentSessionSnapshot();
    setRecentSnapshot(null);
  }

  function clearRecordsList(): void {
    clearSessionRecords();
    setRecords([]);
  }

  return {
    recentSnapshot,
    records,
    commitSnapshot,
    clearRecent,
    clearRecordsList
  };
}
