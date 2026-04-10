import type {
  EndingState,
  PlaythroughEdge,
  PlaythroughGraph,
  PlaythroughGraphBundle,
  PlaythroughNode,
  SaveBundle,
  SaveRuntimeConfig,
  SessionSnapshot
} from "../../../packages/shared-types/src/index.ts";

const PLAYTHROUGH_GRAPHS_STORAGE_KEY = "trpg3.playthroughGraphs";
const ACTIVE_PLAYTHROUGH_GRAPH_ID_STORAGE_KEY = "trpg3.activePlaythroughGraphId";

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

function generateId(prefix: string): string {
  const rawId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${rawId}`;
}

function clipPreview(content: string | null | undefined, maxLength = 84): string | null {
  const normalized = content?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function buildSaveBundleFromSnapshot(
  snapshot: SessionSnapshot,
  runtimeConfig?: SaveRuntimeConfig
): SaveBundle {
  return {
    schemaVersion: snapshot.session.schemaVersion,
    savedAt: snapshot.session.updatedAt,
    session: snapshot.session,
    messages: snapshot.messages,
    replay: snapshot.replay,
    contentSummary: snapshot.contentSummary,
    runtimeConfig
  };
}

function loadGraphBundles(): PlaythroughGraphBundle[] {
  return readJson<PlaythroughGraphBundle[]>(PLAYTHROUGH_GRAPHS_STORAGE_KEY) ?? [];
}

function saveGraphBundles(bundles: PlaythroughGraphBundle[]): void {
  writeJson(PLAYTHROUGH_GRAPHS_STORAGE_KEY, bundles);
}

function loadActiveGraphId(): string | null {
  return readJson<string>(ACTIVE_PLAYTHROUGH_GRAPH_ID_STORAGE_KEY);
}

function saveActiveGraphId(graphId: string | null): void {
  if (graphId === null) {
    if (canUseStorage()) {
      window.localStorage.removeItem(ACTIVE_PLAYTHROUGH_GRAPH_ID_STORAGE_KEY);
    }
    return;
  }

  writeJson(ACTIVE_PLAYTHROUGH_GRAPH_ID_STORAGE_KEY, graphId);
}

function findGraphBundle(graphId: string): PlaythroughGraphBundle | null {
  return loadGraphBundles().find((item) => item.graph.id === graphId) ?? null;
}

function findActiveGraphBundle(): PlaythroughGraphBundle | null {
  const graphId = loadActiveGraphId();
  if (!graphId) {
    return null;
  }

  return findGraphBundle(graphId);
}

function upsertGraphBundle(nextBundle: PlaythroughGraphBundle): PlaythroughGraphBundle {
  const previous = loadGraphBundles().filter((item) => item.graph.id !== nextBundle.graph.id);
  const nextBundles = [nextBundle, ...previous].sort((left, right) =>
    right.graph.updatedAt.localeCompare(left.graph.updatedAt)
  );
  saveGraphBundles(nextBundles);
  saveActiveGraphId(nextBundle.graph.id);
  return nextBundle;
}

function getLatestGmContent(snapshot: SessionSnapshot): string | null {
  const gmMessage = [...snapshot.messages]
    .reverse()
    .find((message) => message.kind === "gm_narration" || message.kind === "gm_dialogue");
  return gmMessage?.content ?? null;
}

function getPlayerPreviewForRound(snapshot: SessionSnapshot): string | null {
  if (snapshot.session.currentRound <= 0) {
    return null;
  }

  const playerMessage = [...snapshot.messages]
    .reverse()
    .find(
      (message) =>
        message.round === snapshot.session.currentRound &&
        message.kind === "player_input"
    );
  return playerMessage?.content ?? null;
}

function deriveNodeKind(snapshot: SessionSnapshot): PlaythroughNode["nodeKind"] {
  if (snapshot.session.gameState.endingState) {
    return "ending";
  }

  if (snapshot.session.currentRound <= 0) {
    return "opening";
  }

  return "turn";
}

function deriveCheckpointKind(snapshot: SessionSnapshot): PlaythroughNode["checkpointKind"] {
  if (snapshot.session.gameState.endingState) {
    return "ending";
  }

  if (snapshot.session.currentRound <= 0) {
    return "opening";
  }

  return "turn";
}

function deriveExpandability(snapshot: SessionSnapshot): PlaythroughNode["expandability"] {
  if (snapshot.session.gameState.endingState) {
    return {
      mode: "special_followup_only",
      reason: "ending_confirmed"
    };
  }

  return {
    mode: "open"
  };
}

function deriveTerminalState(snapshot: SessionSnapshot): PlaythroughNode["terminalState"] {
  if (snapshot.session.gameState.endingState) {
    return {
      isTerminal: true,
      reason: "ending_confirmed",
      adjudicationSource: "mock"
    };
  }

  return {
    isTerminal: false,
    reason: "open",
    adjudicationSource: "unknown"
  };
}

function buildNodeFromSnapshot(
  graphId: string,
  snapshot: SessionSnapshot,
  saveBundle: SaveBundle,
  options: {
    parentNodeId: string | null;
    nodeId?: string;
    snapshotId?: string;
  }
): {
  node: PlaythroughNode;
  snapshotBlob: PlaythroughGraphBundle["snapshots"][number];
} {
  const nodeId = options.nodeId ?? generateId("node");
  const snapshotId = options.snapshotId ?? generateId("snap");
  const endingState: EndingState | null = snapshot.session.gameState.endingState ?? null;

  const node: PlaythroughNode = {
    id: nodeId,
    graphId,
    parentNodeId: options.parentNodeId,
    nodeKind: deriveNodeKind(snapshot),
    round: snapshot.session.currentRound,
    createdAt: snapshot.session.updatedAt,
    checkpointKind: deriveCheckpointKind(snapshot),
    sourceSessionId: snapshot.session.id,
    snapshotId,
    playerPreview: clipPreview(getPlayerPreviewForRound(snapshot)),
    gmPreview: clipPreview(getLatestGmContent(snapshot)),
    statusAtCapture: snapshot.session.status,
    expandability: deriveExpandability(snapshot),
    terminalState: deriveTerminalState(snapshot),
    endingState
  };

  return {
    node,
    snapshotBlob: {
      id: snapshotId,
      graphId,
      nodeId,
      createdAt: saveBundle.savedAt,
      saveBundle
    }
  };
}

function findNextRouteDepth(
  edges: PlaythroughEdge[],
  routeId: string
): number {
  const previousDepth = edges
    .filter((edge) => edge.routeId === routeId)
    .reduce((maxDepth, edge) => Math.max(maxDepth, edge.depthInRoute), 0);
  return previousDepth + 1;
}

function buildEdge(
  graph: PlaythroughGraph,
  parentNodeId: string,
  childNodeId: string
): PlaythroughEdge {
  const isBranchResume = graph.pendingContinuationFromNodeId === parentNodeId;
  const depthInRoute = findNextRouteDepth(
    findGraphBundle(graph.id)?.edges ?? [],
    graph.activeRouteId
  );

  return {
    id: generateId("edge"),
    graphId: graph.id,
    fromNodeId: parentNodeId,
    toNodeId: childNodeId,
    edgeKind: isBranchResume ? "branch_resume" : "turn_progression",
    routeId: graph.activeRouteId,
    depthInRoute,
    visualFamily:
      graph.activeRouteId.startsWith("route_main_") && !isBranchResume
        ? "mainline"
        : "branch"
  };
}

function buildRootGraphBundle(
  snapshot: SessionSnapshot,
  runtimeConfig?: SaveRuntimeConfig
): PlaythroughGraphBundle {
  const graphId = generateId("graph");
  const routeId = `route_main_${graphId}`;
  const saveBundle = buildSaveBundleFromSnapshot(snapshot, runtimeConfig);
  const { node, snapshotBlob } = buildNodeFromSnapshot(graphId, snapshot, saveBundle, {
    parentNodeId: null
  });

  const graph: PlaythroughGraph = {
    id: graphId,
    ruleId: snapshot.session.ruleId,
    storyId: snapshot.session.storyId,
    locale: snapshot.session.locale,
    createdAt: snapshot.session.createdAt,
    updatedAt: snapshot.session.updatedAt,
    rootNodeId: node.id,
    currentNodeId: node.id,
    activeRouteId: routeId,
    pendingContinuationFromNodeId: null,
    unlockedAtEnding: node.terminalState.isTerminal,
    firstEndingReachedAt: node.terminalState.isTerminal ? node.createdAt : undefined,
    nodeCount: 1,
    terminalNodeIds: node.terminalState.isTerminal ? [node.id] : []
  };

  return {
    graph,
    nodes: [node],
    edges: [],
    snapshots: [snapshotBlob]
  };
}

function isSameSnapshot(saveBundle: SaveBundle, snapshot: SessionSnapshot): boolean {
  return (
    saveBundle.session.id === snapshot.session.id &&
    saveBundle.session.currentRound === snapshot.session.currentRound &&
    saveBundle.session.updatedAt === snapshot.session.updatedAt &&
    saveBundle.session.storyId === snapshot.session.storyId &&
    saveBundle.session.ruleId === snapshot.session.ruleId
  );
}

export function loadActivePlaythroughGraph(): PlaythroughGraphBundle | null {
  return findActiveGraphBundle();
}

export function startPlaythroughGraph(
  snapshot: SessionSnapshot,
  runtimeConfig?: SaveRuntimeConfig
): PlaythroughGraphBundle {
  return upsertGraphBundle(buildRootGraphBundle(snapshot, runtimeConfig));
}

export function appendSnapshotToActivePlaythrough(
  snapshot: SessionSnapshot,
  runtimeConfig: SaveRuntimeConfig | undefined,
  playerInput: string
): PlaythroughGraphBundle | null {
  const currentBundle = findActiveGraphBundle();
  if (!currentBundle) {
    return startPlaythroughGraph(snapshot, runtimeConfig);
  }

  const parentNodeId = currentBundle.graph.currentNodeId;
  const saveBundle = buildSaveBundleFromSnapshot(snapshot, runtimeConfig);
  const { node, snapshotBlob } = buildNodeFromSnapshot(
    currentBundle.graph.id,
    snapshot,
    saveBundle,
    {
      parentNodeId
    }
  );
  const edge = buildEdge(currentBundle.graph, parentNodeId, node.id);
  const nextTerminalNodeIds = node.terminalState.isTerminal
    ? [...currentBundle.graph.terminalNodeIds, node.id]
    : currentBundle.graph.terminalNodeIds;

  const nextBundle: PlaythroughGraphBundle = {
    graph: {
      ...currentBundle.graph,
      updatedAt: snapshot.session.updatedAt,
      currentNodeId: node.id,
      pendingContinuationFromNodeId: null,
      unlockedAtEnding:
        currentBundle.graph.unlockedAtEnding || node.terminalState.isTerminal,
      firstEndingReachedAt:
        currentBundle.graph.firstEndingReachedAt ??
        (node.terminalState.isTerminal ? snapshot.session.updatedAt : undefined),
      nodeCount: currentBundle.graph.nodeCount + 1,
      terminalNodeIds: nextTerminalNodeIds
    },
    nodes: [
      ...currentBundle.nodes,
      {
        ...node,
        playerPreview: clipPreview(playerInput)
      }
    ],
    edges: [
      ...currentBundle.edges,
      edge
    ],
    snapshots: [
      ...currentBundle.snapshots,
      snapshotBlob
    ]
  };

  return upsertGraphBundle(nextBundle);
}

export function prepareResumeFromPlaythroughNode(
  nodeId: string
): {
  graphBundle: PlaythroughGraphBundle;
  saveBundle: SaveBundle;
} | null {
  const currentBundle = findActiveGraphBundle();
  if (!currentBundle) {
    return null;
  }

  const targetNode = currentBundle.nodes.find((node) => node.id === nodeId);
  const targetSnapshot = currentBundle.snapshots.find((snapshot) => snapshot.nodeId === nodeId);

  if (!targetNode || !targetSnapshot || targetNode.terminalState.isTerminal) {
    return null;
  }

  const nextBundle: PlaythroughGraphBundle = {
    ...currentBundle,
    graph: {
      ...currentBundle.graph,
      currentNodeId: nodeId,
      updatedAt: new Date().toISOString(),
      activeRouteId: generateId("route"),
      pendingContinuationFromNodeId: nodeId
    }
  };

  return {
    graphBundle: upsertGraphBundle(nextBundle),
    saveBundle: targetSnapshot.saveBundle
  };
}

export function syncCurrentPlaythroughSaveBundle(
  saveBundle: SaveBundle
): PlaythroughGraphBundle | null {
  const currentBundle = findActiveGraphBundle();
  if (!currentBundle) {
    return null;
  }

  const currentNodeId = currentBundle.graph.currentNodeId;
  const targetSnapshot = currentBundle.snapshots.find((snapshot) => snapshot.nodeId === currentNodeId);
  if (!targetSnapshot) {
    return null;
  }

  const nextBundle: PlaythroughGraphBundle = {
    ...currentBundle,
    graph: {
      ...currentBundle.graph,
      updatedAt: saveBundle.savedAt
    },
    snapshots: currentBundle.snapshots.map((snapshot) =>
      snapshot.id === targetSnapshot.id
        ? {
            ...snapshot,
            createdAt: saveBundle.savedAt,
            saveBundle
          }
        : snapshot
    )
  };

  return upsertGraphBundle(nextBundle);
}

export function relinkActivePlaythroughToSnapshot(
  snapshot: SessionSnapshot,
  runtimeConfig?: SaveRuntimeConfig
): PlaythroughGraphBundle | null {
  const graphBundles = loadGraphBundles();
  for (const bundle of graphBundles) {
    const matchedSnapshot = bundle.snapshots.find((item) =>
      isSameSnapshot(item.saveBundle, snapshot)
    );
    if (!matchedSnapshot) {
      continue;
    }

    const nextBundle: PlaythroughGraphBundle = {
      ...bundle,
      graph: {
        ...bundle.graph,
        currentNodeId: matchedSnapshot.nodeId,
        updatedAt: snapshot.session.updatedAt
      }
    };
    return upsertGraphBundle(nextBundle);
  }

  return startPlaythroughGraph(snapshot, runtimeConfig);
}

export function relinkActivePlaythroughToSaveBundle(
  saveBundle: SaveBundle,
  fallbackSnapshot?: SessionSnapshot,
  runtimeConfig?: SaveRuntimeConfig
): PlaythroughGraphBundle | null {
  const graphBundles = loadGraphBundles();
  for (const bundle of graphBundles) {
    const matchedSnapshot = bundle.snapshots.find(
      (item) =>
        item.saveBundle.session.id === saveBundle.session.id &&
        item.saveBundle.session.currentRound === saveBundle.session.currentRound &&
        item.saveBundle.session.updatedAt === saveBundle.session.updatedAt &&
        item.saveBundle.session.storyId === saveBundle.session.storyId &&
        item.saveBundle.session.ruleId === saveBundle.session.ruleId
    );

    if (!matchedSnapshot) {
      continue;
    }

    const nextBundle: PlaythroughGraphBundle = {
      ...bundle,
      graph: {
        ...bundle.graph,
        currentNodeId: matchedSnapshot.nodeId,
        updatedAt: saveBundle.savedAt
      }
    };
    return upsertGraphBundle(nextBundle);
  }

  if (fallbackSnapshot) {
    return startPlaythroughGraph(fallbackSnapshot, runtimeConfig);
  }

  return null;
}
