import type { SessionSnapshot } from "../../../../packages/shared-types/src/index.ts";
import type { SavedGameRecord } from "../storage.ts";
import { formatDateTime } from "../ui.ts";
import { ScreenHeader } from "./ScreenHeader.tsx";

type ContinueScreenProps = {
  recentSave: SavedGameRecord | null;
  recentSnapshot: SessionSnapshot | null;
  isRestoring: boolean;
  onBack: () => void;
  onContinueSavedGame: () => Promise<void>;
  onContinueSnapshot: () => Promise<void>;
  onClearRecent: () => void;
  onRemoveRecentSave: () => void;
};

export function ContinueScreen(props: ContinueScreenProps) {
  const {
    recentSave,
    recentSnapshot,
    isRestoring,
    onBack,
    onContinueSavedGame,
    onContinueSnapshot,
    onClearRecent,
    onRemoveRecentSave
  } = props;

  const hasRecentSave = Boolean(recentSave);
  const hasRecentSnapshot = Boolean(recentSnapshot);

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="继续游戏"
        description="优先从手动存档恢复；如果还没有手动存档，再退回最近快照。"
        onBack={onBack}
      />

      {!hasRecentSave && !hasRecentSnapshot ? (
        <div className="empty-state">当前没有可继续的存档或最近进度。</div>
      ) : (
        <div className="stack-grid">
          {recentSave ? (
            <div className="summary-card">
              <div className="meta-label">最近存档</div>
              <div className="summary-title">{recentSave.storyTitle}</div>
              <div className="summary-text">规则：{recentSave.ruleTitle}</div>
              <div className="summary-text">场景：{recentSave.sceneId}</div>
              <div className="summary-text">回合：{recentSave.round}</div>
              <div className="summary-text">模型：{recentSave.modelProfileId}</div>
              <div className="summary-text">
                存档时间：{formatDateTime(recentSave.savedAt)}
              </div>
            </div>
          ) : null}

          {!recentSave && recentSnapshot ? (
            <div className="summary-card">
              <div className="meta-label">最近快照</div>
              <div className="summary-title">{recentSnapshot.contentSummary.storyTitle}</div>
              <div className="summary-text">规则：{recentSnapshot.contentSummary.ruleTitle}</div>
              <div className="summary-text">场景：{recentSnapshot.session.gameState.sceneId}</div>
              <div className="summary-text">回合：{recentSnapshot.session.currentRound}</div>
              <div className="summary-text">
                更新时间：{formatDateTime(recentSnapshot.session.updatedAt)}
              </div>
            </div>
          ) : null}

          <div className="button-row">
            {recentSave ? (
              <button
                className="primary-button"
                disabled={isRestoring}
                onClick={() => void onContinueSavedGame()}
                type="button"
              >
                {isRestoring ? "恢复中..." : "继续最近存档"}
              </button>
            ) : null}

            {!recentSave && recentSnapshot ? (
              <button
                className="primary-button"
                disabled={isRestoring}
                onClick={() => void onContinueSnapshot()}
                type="button"
              >
                {isRestoring ? "恢复中..." : "继续最近快照"}
              </button>
            ) : null}

            {recentSave ? (
              <button className="ghost-button" onClick={onRemoveRecentSave} type="button">
                删除最近存档
              </button>
            ) : null}

            {!recentSave && recentSnapshot ? (
              <button className="ghost-button" onClick={onClearRecent} type="button">
                清除最近快照
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
