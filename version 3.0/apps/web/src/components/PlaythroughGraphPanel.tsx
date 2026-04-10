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

export function PlaythroughGraphPanel(props: PlaythroughGraphPanelProps) {
  const {
    graphBundle,
    isResuming,
    onContinueFromNode
  } = props;

  if (!graphBundle?.graph.unlockedAtEnding) {
    return null;
  }

  const orderedNodes = [...graphBundle.nodes].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
  const nodesById = new Map(orderedNodes.map((node) => [node.id, node] as const));
  const edgesByTarget = new Map(graphBundle.edges.map((edge) => [edge.toNodeId, edge] as const));
  const depthCache = new Map<string, number>();

  const positionedNodes = orderedNodes.map((node, rowIndex) => {
    const depth = deriveDepth(node, nodesById, depthCache);
    return {
      node,
      x: PADDING_X + depth * (NODE_WIDTH + COLUMN_GAP),
      y: PADDING_Y + rowIndex * (NODE_HEIGHT + ROW_GAP)
    };
  });

  const maxDepth = positionedNodes.reduce((value, item) => Math.max(value, item.x), PADDING_X);
  const maxY = positionedNodes.reduce((value, item) => Math.max(value, item.y), PADDING_Y);
  const viewWidth = maxDepth + NODE_WIDTH + PADDING_X;
  const viewHeight = maxY + NODE_HEIGHT + PADDING_Y;

  return (
    <section className="summary-card playthrough-panel">
      <div className="record-header">
        <div>
          <div className="meta-label">分支回溯树</div>
          <div className="summary-title">
            已在结局后解锁，共 {graphBundle.graph.nodeCount} 个节点
          </div>
          <div className="summary-text">
            普通剧情分支和结局后的特殊分支会使用不同色系。当前节点会被高亮。
          </div>
        </div>
        <div className="flag-list">
          <span className="badge">主线 / 棕红</span>
          <span className="badge">分支 / 青绿</span>
          <span className="badge">结局后 / 紫色</span>
        </div>
      </div>

      <div className="playthrough-graph-scroll">
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
                className={`playthrough-node ${isCurrent ? "playthrough-node-current" : ""}`}
                key={node.id}
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
