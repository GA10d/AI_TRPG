import { useState } from "react";

import type {
  PlaythroughGraphBundle,
  SaveBundle,
  SaveRuntimeConfig,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";
import {
  appendSnapshotToActivePlaythrough,
  loadActivePlaythroughGraph,
  prepareResumeFromPlaythroughNode,
  relinkActivePlaythroughToSaveBundle,
  relinkActivePlaythroughToSnapshot,
  startPlaythroughGraph,
  syncCurrentPlaythroughSaveBundle
} from "../playthroughGraph.ts";

export function usePlaythroughGraph() {
  const [activeGraphBundle, setActiveGraphBundle] = useState<PlaythroughGraphBundle | null>(
    () => loadActivePlaythroughGraph()
  );

  function beginFromSnapshot(
    snapshot: SessionSnapshot,
    runtimeConfig?: SaveRuntimeConfig
  ): PlaythroughGraphBundle {
    const nextBundle = startPlaythroughGraph(snapshot, runtimeConfig);
    setActiveGraphBundle(nextBundle);
    return nextBundle;
  }

  function captureTurn(
    snapshot: SessionSnapshot,
    runtimeConfig: SaveRuntimeConfig | undefined,
    playerInput: string
  ): PlaythroughGraphBundle | null {
    const nextBundle = appendSnapshotToActivePlaythrough(snapshot, runtimeConfig, playerInput);
    setActiveGraphBundle(nextBundle);
    return nextBundle;
  }

  function syncSavedBundle(saveBundle: SaveBundle): PlaythroughGraphBundle | null {
    const nextBundle = syncCurrentPlaythroughSaveBundle(saveBundle);
    setActiveGraphBundle(nextBundle);
    return nextBundle;
  }

  function relinkSnapshot(
    snapshot: SessionSnapshot,
    runtimeConfig?: SaveRuntimeConfig
  ): PlaythroughGraphBundle | null {
    const nextBundle = relinkActivePlaythroughToSnapshot(snapshot, runtimeConfig);
    setActiveGraphBundle(nextBundle);
    return nextBundle;
  }

  function relinkSaveBundle(
    saveBundle: SaveBundle,
    fallbackSnapshot?: SessionSnapshot,
    runtimeConfig?: SaveRuntimeConfig
  ): PlaythroughGraphBundle | null {
    const nextBundle = relinkActivePlaythroughToSaveBundle(
      saveBundle,
      fallbackSnapshot,
      runtimeConfig
    );
    setActiveGraphBundle(nextBundle);
    return nextBundle;
  }

  function prepareResume(nodeId: string): {
    graphBundle: PlaythroughGraphBundle;
    saveBundle: SaveBundle;
  } | null {
    const next = prepareResumeFromPlaythroughNode(nodeId);
    if (next?.graphBundle) {
      setActiveGraphBundle(next.graphBundle);
    }
    return next;
  }

  return {
    activeGraphBundle,
    beginFromSnapshot,
    captureTurn,
    syncSavedBundle,
    relinkSnapshot,
    relinkSaveBundle,
    prepareResume
  };
}
