import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";

import type {
  PlaythroughEdge,
  PlaythroughGraphBundle,
  PlaythroughNode
} from "../../../../packages/shared-types/src/index.ts";

type PlaythroughGraphPanelProps = {
  graphBundle: PlaythroughGraphBundle | null;
  isResuming: boolean;
  onContinueFromNode: (nodeId: string) => Promise<void>;
};

type NodePosition = {
  x: number;
  y: number;
};

type DragState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
} | null;

const NODE_LAYOUT_STORAGE_KEY = "trpg3.playthroughNodeLayouts";
const NODE_WIDTH = 220;
const NODE_HEIGHT = 92;
const COLUMN_GAP = 72;
const ROW_GAP = 28;
const PADDING_X = 24;
const PADDING_Y = 24;

function hashToInt(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildEdgeColor(edge: PlaythroughEdge): string {
  if (edge.visualFamily === "after_ending") {
    const hue = 275 + (hashToInt(edge.routeId) % 18);
    const lightness = Math.max(34, 58 - edge.depthInRoute * 5);
    return `hsl(${hue} 58% ${lightness}%)`;
  }

  const hue = edge.visualFamily === "branch"
    ? 160 + (hashToInt(edge.routeId) % 44)
    : 16 + (hashToInt(edge.routeId) % 18);
  const lightness = Math.max(30, 56 - edge.depthInRoute * 4);
  return `hsl(${hue} 62% ${lightness}%)`;
}

function deriveDepth(
  node: PlaythroughNode,
  nodesById: Map<string, PlaythroughNode>,
  cache: Map<string, number>
): number {
  const cached = cache.get(node.id);
  if (cached !== undefined) {
    return cached;
  }

  if (!node.parentNodeId) {
    cache.set(node.id, 0);
    return 0;
  }

  const parent = nodesById.get(node.parentNodeId);
  const depth = parent ? deriveDepth(parent, nodesById, cache) + 1 : 0;
  cache.set(node.id, depth);
  return depth;
}

function buildNodeTitle(node: PlaythroughNode): string {
  if (node.nodeKind === "opening") {
    return "开场";
  }

  if (node.nodeKind === "ending") {
    return node.endingState?.title ?? `结局 / R${node.round}`;
  }

  if (node.nodeKind === "debrief") {
    return "复盘";
  }

  if (node.nodeKind === "epilogue") {
    return "后日谈";
  }

  return `回合 ${node.round}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadStoredLayouts(): Record<string, Record<string, NodePosition>> {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(NODE_LAYOUT_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }
    return JSON.parse(rawValue) as Record<string, Record<string, NodePosition>>;
  } catch {
    return {};
  }
}

function saveStoredGraphLayout(
  graphId: string,
  positions: Record<string, NodePosition>
): void {
  if (!canUseStorage()) {
    return;
  }

  const nextLayouts = loadStoredLayouts();
  nextLayouts[graphId] = positions;
  window.localStorage.setItem(NODE_LAYOUT_STORAGE_KEY, JSON.stringify(nextLayouts));
}

function buildDefaultPositions(
  nodes: PlaythroughNode[]
): Record<string, NodePosition> {
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const depthCache = new Map<string, number>();
  const nextPositions: Record<string, NodePosition> = {};

  nodes.forEach((node, rowIndex) => {
    const depth = deriveDepth(node, nodesById, depthCache);
    nextPositions[node.id] = {
      x: PADDING_X + depth * (NODE_WIDTH + COLUMN_GAP),
      y: PADDING_Y + rowIndex * (NODE_HEIGHT + ROW_GAP)
    };
  });

  return nextPositions;
}

function mergeNodePositions(
  nodes: PlaythroughNode[],
  graphId: string
): Record<string, NodePosition> {
  const defaults = buildDefaultPositions(nodes);
  const stored = loadStoredLayouts()[graphId] ?? {};
  const nextPositions: Record<string, NodePosition> = {};

  for (const node of nodes) {
    nextPositions[node.id] = stored[node.id] ?? defaults[node.id];
  }

  return nextPositions;
}

export function PlaythroughGraphPanel(props: PlaythroughGraphPanelProps) {
  const {
    graphBundle,
    isResuming,
    onContinueFromNode
  } = props;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [dragState, setDragState] = useState<DragState>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const orderedNodes = useMemo(() => {
    if (!graphBundle?.graph.unlockedAtEnding) {
      return [];
    }

    return [...graphBundle.nodes].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }, [graphBundle]);

  const edgesByTarget = useMemo(() => {
    if (!graphBundle) {
      return new Map<string, PlaythroughEdge>();
    }

    return new Map(graphBundle.edges.map((edge) => [edge.toNodeId, edge] as const));
  }, [graphBundle]);

  useEffect(() => {
    if (!graphBundle?.graph.unlockedAtEnding) {
      setNodePositions({});
      return;
    }

    setNodePositions((current) => {
      const merged = mergeNodePositions(orderedNodes, graphBundle.graph.id);
      const currentKeys = Object.keys(current);
      const mergedKeys = Object.keys(merged);

      const isSame =
        currentKeys.length === mergedKeys.length &&
        mergedKeys.every((key) => {
          const currentPosition = current[key];
          const mergedPosition = merged[key];
          return (
            currentPosition &&
            currentPosition.x === mergedPosition.x &&
            currentPosition.y === mergedPosition.y
          );
        });

      return isSame ? current : merged;
    });
  }, [graphBundle, orderedNodes]);

  useEffect(() => {
    if (!graphBundle?.graph.unlockedAtEnding || !Object.keys(nodePositions).length) {
      return;
    }

    saveStoredGraphLayout(graphBundle.graph.id, nodePositions);
  }, [graphBundle, nodePositions]);

  useEffect(() => {
    if (!dragState || !graphBundle?.graph.unlockedAtEnding) {
      return;
    }

    function handlePointerMove(event: PointerEvent): void {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }

      const rect = scrollElement.getBoundingClientRect();
      const nextX = Math.max(
        PADDING_X,
        event.clientX - rect.left + scrollElement.scrollLeft - dragState.offsetX
      );
      const nextY = Math.max(
        PADDING_Y,
        event.clientY - rect.top + scrollElement.scrollTop - dragState.offsetY
      );

      setNodePositions((current) => ({
        ...current,
        [dragState.nodeId]: {
          x: nextX,
          y: nextY
        }
      }));
    }

    function handlePointerUp(): void {
      setDragState(null);
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, graphBundle]);

  if (!graphBundle?.graph.unlockedAtEnding) {
    return null;
  }

  const positionedNodes = orderedNodes.map((node) => ({
    node,
    x: nodePositions[node.id]?.x ?? PADDING_X,
    y: nodePositions[node.id]?.y ?? PADDING_Y
  }));

  const maxX = positionedNodes.reduce(
    (value, item) => Math.max(value, item.x + NODE_WIDTH),
    PADDING_X + NODE_WIDTH
  );
  const maxY = positionedNodes.reduce(
    (value, item) => Math.max(value, item.y + NODE_HEIGHT),
    PADDING_Y + NODE_HEIGHT
  );
  const viewWidth = maxX + PADDING_X;
  const viewHeight = maxY + PADDING_Y;

  function handleNodePointerDown(
    nodeId: string,
    event: ReactPointerEvent<HTMLElement>
  ): void {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    const currentPosition = nodePositions[nodeId];
    if (!currentPosition) {
      return;
    }

    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const rect = scrollElement.getBoundingClientRect();
    const pointerX = event.clientX - rect.left + scrollElement.scrollLeft;
    const pointerY = event.clientY - rect.top + scrollElement.scrollTop;

    setDragState({
      nodeId,
      offsetX: pointerX - currentPosition.x,
      offsetY: pointerY - currentPosition.y
    });
  }

  return (
    <section className={`summary-card playthrough-panel ${isExpanded ? "playthrough-panel-expanded" : "playthrough-panel-collapsed"}`}>
      <div className="record-header">
        <div>
          <div className="meta-label">分支回溯树</div>
          <div className="summary-title">
            已在结局后解锁，共 {graphBundle.graph.nodeCount} 个节点
          </div>
          <div className="summary-text">
            现在可以直接拖动节点重排视图，连线会实时跟随更新。
          </div>
        </div>
        <div className="playthrough-panel-tools">
          <button
            aria-label={isExpanded ? "收起分支回溯树" : "放大分支回溯树"}
            className="ghost-button playthrough-expand-button"
            onClick={() => setIsExpanded((current) => !current)}
            type="button"
          >
            <span aria-hidden="true" className="playthrough-expand-icon">
              {isExpanded ? "⊟" : "⊞"}
            </span>
            <span>{isExpanded ? "收起" : "放大"}</span>
          </button>

          <div className="flag-list">
          <span className="badge">主线 / 棕红</span>
          <span className="badge">分支 / 青绿</span>
          <span className="badge">结局后 / 紫色</span>
        </div>
      </div>

      </div>

      <div className="playthrough-graph-scroll" ref={scrollRef}>
        <div
          className="playthrough-graph-canvas"
          style={{
            width: `${viewWidth}px`,
            height: `${viewHeight}px`
          }}
        >
          <svg className="playthrough-graph-svg" height={viewHeight} width={viewWidth}>
            {graphBundle.edges.map((edge) => {
              const from = positionedNodes.find((item) => item.node.id === edge.fromNodeId);
              const to = positionedNodes.find((item) => item.node.id === edge.toNodeId);
              if (!from || !to) {
                return null;
              }

              const startX = from.x + NODE_WIDTH;
              const startY = from.y + NODE_HEIGHT / 2;
              const endX = to.x;
              const endY = to.y + NODE_HEIGHT / 2;
              const midX = (startX + endX) / 2;
              const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

              return (
                <path
                  key={edge.id}
                  d={path}
                  fill="none"
                  stroke={buildEdgeColor(edge)}
                  strokeLinecap="round"
                  strokeWidth={4}
                />
              );
            })}
          </svg>

          {positionedNodes.map(({ node, x, y }) => {
            const incomingEdge = edgesByTarget.get(node.id);
            const borderColor = incomingEdge ? buildEdgeColor(incomingEdge) : "rgba(122, 50, 32, 0.24)";
            const canContinue = !node.terminalState.isTerminal;
            const isCurrent = graphBundle.graph.currentNodeId === node.id;

            return (
              <article
                className={`playthrough-node ${isCurrent ? "playthrough-node-current" : ""} ${dragState?.nodeId === node.id ? "playthrough-node-dragging" : ""}`}
                key={node.id}
                onPointerDown={(event) => handleNodePointerDown(node.id, event)}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  borderColor
                }}
              >
                <div className="playthrough-node-meta">
                  <span>{node.nodeKind}</span>
                  <span>R{node.round}</span>
                </div>
                <div className="playthrough-node-title">{buildNodeTitle(node)}</div>
                <div className="playthrough-node-copy">
                  {node.playerPreview ?? node.gmPreview ?? "该节点暂无额外摘要。"}
                </div>
                <div className="playthrough-node-actions">
                  {isCurrent ? <span className="flag-chip">当前节点</span> : null}
                  {node.terminalState.isTerminal ? (
                    <span className="flag-chip">结局叶节点</span>
                  ) : (
                    <button
                      className="ghost-button playthrough-node-button"
                      disabled={isResuming || !canContinue}
                      onClick={() => void onContinueFromNode(node.id)}
                      type="button"
                    >
                      {isResuming ? "恢复中..." : "从此继续"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
