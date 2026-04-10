import type { FormEvent } from "react";

import type {
  PlaythroughGraphBundle,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";
import { PlaythroughGraphPanel } from "./PlaythroughGraphPanel.tsx";
import { ScreenHeader } from "./ScreenHeader.tsx";

type GameScreenProps = {
  snapshot: SessionSnapshot | null;
  activeGraphBundle: PlaythroughGraphBundle | null;
  turnInput: string;
  isSubmittingTurn: boolean;
  isSaving: boolean;
  isResumingBranch: boolean;
  onBack: () => void;
  onContinueFromNode: (nodeId: string) => Promise<void>;
  onSaveGame: () => Promise<void>;
  onTurnInputChange: (value: string) => void;
  onSubmitTurn: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function GameScreen(props: GameScreenProps) {
  const {
    snapshot,
    activeGraphBundle,
    turnInput,
    isSubmittingTurn,
    isSaving,
    isResumingBranch,
    onBack,
    onContinueFromNode,
    onSaveGame,
    onTurnInputChange,
    onSubmitTurn
  } = props;

  if (!snapshot) {
    return (
      <section className="panel page-panel">
        <ScreenHeader
          title="游戏中"
          description="当前还没有活动中的会话。"
          onBack={onBack}
        />
        <div className="empty-state">暂无可展示的会话。</div>
      </section>
    );
  }

  const openingMessage =
    snapshot.messages.find((item) => item.kind === "gm_narration") ?? null;
  const endingState = snapshot.session.gameState.endingState ?? null;
  const isSessionEnded = snapshot.session.status === "ended";

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="游戏中"
        description="当前版本以消息历史和回放日志为核心，结局后会解锁本地分支回溯树。"
        onBack={onBack}
      />

      <div className="result-content">
        <div className="meta-grid">
          <div className="meta-card">
            <span className="meta-label">Session ID</span>
            <code>{snapshot.session.id}</code>
          </div>

          <div className="meta-card">
            <span className="meta-label">内容</span>
            <div>
              {snapshot.contentSummary.ruleTitle} / {snapshot.contentSummary.storyTitle}
            </div>
          </div>

          <div className="meta-card">
            <span className="meta-label">当前进度</span>
            <div>
              状态：{snapshot.session.status} / Round {snapshot.session.currentRound}
            </div>
          </div>

          <div className="meta-card">
            <span className="meta-label">消息 / 回放</span>
            <div>
              {snapshot.messages.length} 条消息 / {snapshot.replay.length} 条回放
            </div>
          </div>
        </div>

        <div className="opening-block">
          <div className="meta-label">主持人开场</div>
          <pre>{openingMessage?.content ?? "暂未找到开场文本。"}</pre>
        </div>

        {endingState ? (
          <div className="info-banner info-banner-success">
            <div className="meta-label">结局状态</div>
            <div className="summary-title">{endingState.title}</div>
            <div className="summary-text">{endingState.summary}</div>
          </div>
        ) : null}

        <PlaythroughGraphPanel
          graphBundle={activeGraphBundle}
          isResuming={isResumingBranch}
          onContinueFromNode={onContinueFromNode}
        />

        <div className="game-area">
          <div className="button-row">
            <button
              className="ghost-button"
              disabled={isSaving}
              onClick={() => void onSaveGame()}
              type="button"
            >
              {isSaving ? "正在保存..." : "手动存档"}
            </button>
          </div>

          <div className="log-columns">
            <div className="log-card">
              <div className="meta-label">消息流</div>
              <div className="message-list">
                {snapshot.messages.map((message) => (
                  <article className="message-item" key={message.id}>
                    <div className="message-meta">
                      <span>
                        {message.kind} / R{message.round}
                      </span>
                    </div>
                    <div className="message-body">{message.content}</div>
                  </article>
                ))}
              </div>
            </div>

            <div className="log-card">
              <div className="meta-label">回放日志</div>
              <div className="replay-list">
                {snapshot.replay.map((event) => (
                  <article className="replay-item" key={event.id}>
                    <div className="replay-meta">
                      <span>
                        {event.type} / R{event.round}
                      </span>
                    </div>
                    <div className="replay-body">{event.summary}</div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          {isSessionEnded ? (
            <div className="info-banner info-banner-warning">
              <div className="meta-label">普通剧情已封口</div>
              <div className="summary-text">
                这个会话已经进入结局，不能继续往后提交普通剧情。你可以从上方树里的旧节点继续，生成新的分支。
              </div>
            </div>
          ) : null}

          <form className="turn-form" onSubmit={onSubmitTurn}>
            <label className="field">
              <span>输入本轮行动</span>
              <textarea
                disabled={isSessionEnded}
                rows={5}
                placeholder="例如：我先检查录像带，再询问主持人现场还剩下哪些值得注意的痕迹。"
                value={turnInput}
                onChange={(event) => onTurnInputChange(event.target.value)}
              />
            </label>

            <button
              className="primary-button"
              disabled={isSubmittingTurn || isSessionEnded}
              type="submit"
            >
              {isSubmittingTurn ? "提交中..." : "提交本轮行动"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
