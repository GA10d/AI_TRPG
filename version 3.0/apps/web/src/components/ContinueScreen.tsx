import type { SessionSnapshot } from "../../../../packages/shared-types/src/index.ts";
import { formatDateTime } from "../ui.ts";
import { ScreenHeader } from "./ScreenHeader.tsx";

type ContinueScreenProps = {
  recentSnapshot: SessionSnapshot | null;
  isRestoring: boolean;
  onBack: () => void;
  onContinue: () => Promise<void>;
  onClearRecent: () => void;
};

export function ContinueScreen(props: ContinueScreenProps) {
  const { recentSnapshot, isRestoring, onBack, onContinue, onClearRecent } = props;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="继续游戏"
        description="优先从服务端恢复最近会话，失败时退回本地快照。"
        onBack={onBack}
      />

      {!recentSnapshot ? (
        <div className="empty-state">当前没有可继续的最近进度。</div>
      ) : (
        <div className="stack-grid">
          <div className="summary-card">
            <div className="meta-label">最近会话</div>
            <div className="summary-title">{recentSnapshot.contentSummary.storyTitle}</div>
            <div className="summary-text">
              规则：{recentSnapshot.contentSummary.ruleTitle}
            </div>
            <div className="summary-text">
              场景：{recentSnapshot.session.gameState.sceneId}
            </div>
            <div className="summary-text">回合：{recentSnapshot.session.currentRound}</div>
            <div className="summary-text">
              更新时间：{formatDateTime(recentSnapshot.session.updatedAt)}
            </div>
          </div>

          <div className="button-row">
            <button
              className="primary-button"
              disabled={isRestoring}
              onClick={() => void onContinue()}
              type="button"
            >
              {isRestoring ? "恢复中..." : "继续最近一局"}
            </button>
            <button className="ghost-button" onClick={onClearRecent} type="button">
              清除最近进度
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
