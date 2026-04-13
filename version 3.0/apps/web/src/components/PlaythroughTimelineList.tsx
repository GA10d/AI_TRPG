import { useMemo, type CSSProperties } from "react";

import type {
  PlaythroughGraphBundle,
  PlaythroughNode
} from "../../../../packages/shared-types/src/index.ts";
import { useUiText } from "../locales/index.tsx";
import { formatDateTime } from "../ui.ts";

type PlaythroughTimelineListProps = {
  graphBundle: PlaythroughGraphBundle | null;
  isResuming: boolean;
  onContinueFromNode: (nodeId: string) => Promise<void>;
  emptyLabel: string;
  compact?: boolean;
};

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

function buildNodeTitle(
  node: PlaythroughNode,
  text: ReturnType<typeof useUiText>["playthroughGraph"]
): string {
  if (node.nodeKind === "opening") {
    return text.openingTitle;
  }

  if (node.nodeKind === "ending") {
    return node.endingState?.title ?? text.endingTitle(node.round);
  }

  if (node.nodeKind === "debrief") {
    return text.debriefTitle;
  }

  if (node.nodeKind === "epilogue") {
    return text.epilogueTitle;
  }

  return text.roundTitle(node.round);
}

function buildNodeTypeLabel(
  node: PlaythroughNode,
  text: ReturnType<typeof useUiText>["playthroughGraph"]
): string {
  switch (node.nodeKind) {
    case "opening":
      return text.openingTitle;
    case "ending":
      return text.endingShortLabel;
    case "debrief":
      return text.debriefShortLabel;
    case "epilogue":
      return text.epilogueShortLabel;
    case "manual":
      return text.manualShortLabel;
    case "turn":
    default:
      return text.roundShortLabel;
  }
}

export function PlaythroughTimelineList(props: PlaythroughTimelineListProps) {
  const text = useUiText();
  const {
    graphBundle,
    isResuming,
    onContinueFromNode,
    emptyLabel,
    compact = false
  } = props;

  const orderedNodes = useMemo(() => {
    if (!graphBundle?.graph.unlockedAtEnding) {
      return [];
    }

    return [...graphBundle.nodes].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }, [graphBundle]);

  const nodesById = useMemo(
    () => new Map(orderedNodes.map((node) => [node.id, node] as const)),
    [orderedNodes]
  );

  if (!orderedNodes.length) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  const depthCache = new Map<string, number>();

  return (
    <div className={`playthrough-timeline ${compact ? "playthrough-timeline-compact" : ""}`}>
      {orderedNodes.map((node) => {
        const depth = deriveDepth(node, nodesById, depthCache);
        const isCurrent = graphBundle?.graph.currentNodeId === node.id;
        const canContinue = !node.terminalState.isTerminal;
        const preview = node.playerPreview ?? node.gmPreview ?? text.playthroughGraph.noExtraSummary;

        return (
          <article
            className={`playthrough-timeline-item ${
              isCurrent ? "playthrough-timeline-item-current" : ""
            } ${node.terminalState.isTerminal ? "playthrough-timeline-item-terminal" : ""}`}
            key={node.id}
            style={
              {
                "--timeline-depth": String(Math.min(depth, 6))
              } as CSSProperties
            }
          >
            <div className="playthrough-timeline-rail" aria-hidden="true">
              <span className="playthrough-timeline-dot" />
            </div>

            <div className="playthrough-timeline-card">
              <div className="playthrough-timeline-meta">
                <span>{buildNodeTypeLabel(node, text.playthroughGraph)}</span>
                <span>R{node.round}</span>
                <span>{formatDateTime(node.createdAt)}</span>
              </div>

              <div className="playthrough-timeline-title">
                {buildNodeTitle(node, text.playthroughGraph)}
              </div>
              <div className="playthrough-timeline-copy">{preview}</div>

              <div className="playthrough-timeline-actions">
                {isCurrent ? (
                  <span className="flag-chip">{text.playthroughGraph.currentNode}</span>
                ) : null}
                {node.terminalState.isTerminal ? (
                  <span className="flag-chip">{text.playthroughGraph.endingLeaf}</span>
                ) : (
                  <button
                    className="ghost-button playthrough-timeline-button"
                    disabled={isResuming || !canContinue}
                    onClick={() => void onContinueFromNode(node.id)}
                    type="button"
                  >
                    {isResuming ? text.playthroughGraph.resumeBusy : text.playthroughGraph.continueFromHere}
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
