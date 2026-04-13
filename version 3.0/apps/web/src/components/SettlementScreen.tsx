import type { PlaythroughGraphBundle, SessionSnapshot } from "../../../../packages/shared-types/src/index.ts";
import { useUiText } from "../locales/index.tsx";
import { PlaythroughGraphPanel } from "./PlaythroughGraphPanel.tsx";
import { ScreenHeader } from "./ScreenHeader.tsx";

type SettlementScreenProps = {
  snapshot: SessionSnapshot | null;
  activeGraphBundle: PlaythroughGraphBundle | null;
  isResumingBranch: boolean;
  onBackToGame: () => void;
  onContinueFromNode: (nodeId: string) => Promise<void>;
};

export function SettlementScreen(props: SettlementScreenProps) {
  const text = useUiText();
  const {
    snapshot,
    activeGraphBundle,
    isResumingBranch,
    onBackToGame,
    onContinueFromNode
  } = props;

  const endingState = snapshot?.session.gameState.endingState ?? null;

  return (
    <section className="panel page-panel settlement-screen">
      <ScreenHeader
        title={text.gameScreen.settlementPageTitle}
        description={text.gameScreen.settlementPageDescription}
        onBack={onBackToGame}
        backLabel={text.gameScreen.backToGame}
      />

      {endingState ? (
        <div className="info-banner info-banner-success">
          <div className="meta-label">{text.gameScreen.endingState}</div>
          <div className="summary-title">{endingState.title}</div>
          <div className="summary-text">{endingState.summary}</div>
        </div>
      ) : (
        <div className="info-banner">
          <div className="meta-label">{text.gameScreen.worldlineTab}</div>
          <div className="summary-text">{text.gameScreen.settlementNoEnding}</div>
        </div>
      )}

      <section className="summary-card settlement-panel">
        <div className="record-header">
          <div>
            <div className="meta-label">{text.playthroughGraph.eyebrow}</div>
            <div className="summary-title">
              {activeGraphBundle?.graph.unlockedAtEnding
                ? text.playthroughGraph.title(activeGraphBundle.graph.nodeCount)
                : text.gameScreen.worldlineLockedTitle}
            </div>
            <div className="summary-text">
              {activeGraphBundle?.graph.unlockedAtEnding
                ? text.gameScreen.settlementPageHint
                : text.gameScreen.worldlineEmpty}
            </div>
          </div>
        </div>

        {activeGraphBundle?.graph.unlockedAtEnding ? (
          <PlaythroughGraphPanel
            defaultExpanded
            graphBundle={activeGraphBundle}
            isResuming={isResumingBranch}
            onContinueFromNode={onContinueFromNode}
            variant="embedded"
          />
        ) : (
          <div className="empty-state">{text.gameScreen.worldlineEmpty}</div>
        )}
      </section>
    </section>
  );
}
