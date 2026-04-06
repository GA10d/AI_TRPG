import type { SessionSnapshot } from "../../../../packages/shared-types/src/index.ts";
import { renderJoinedList } from "../ui.ts";
import { ScreenHeader } from "./ScreenHeader.tsx";

type GameScreenProps = {
  snapshot: SessionSnapshot | null;
  turnInput: string;
  isSubmittingTurn: boolean;
  onBack: () => void;
  onTurnInputChange: (value: string) => void;
  onSubmitTurn: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
};

export function GameScreen(props: GameScreenProps) {
  const {
    snapshot,
    turnInput,
    isSubmittingTurn,
    onBack,
    onTurnInputChange,
    onSubmitTurn
  } = props;

  if (!snapshot) {
    return (
      <section className="panel page-panel">
        <ScreenHeader
          title="游戏中"
          description="当前还没有活动会话。"
          onBack={onBack}
        />
        <div className="empty-state">暂无可展示的会话。</div>
      </section>
    );
  }

  const openingMessage =
    snapshot.messages.find((item) => item.kind === "gm_narration") ?? null;
  const storyFlags = Object.entries(snapshot.session.gameState.storyFlags);
  const clocks = Object.entries(snapshot.session.gameState.clocks);

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="游戏中"
        description="当前是单人假闭环页面，后面会继续接真实模型和更多交互。"
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
            <span className="meta-label">语言解析</span>
            <div>
              请求: {snapshot.contentSummary.requestedLocale} | 实际:{" "}
              {snapshot.contentSummary.resolvedLocale}
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

        <div className="game-area">
          <div className="game-topbar">
            <div>
              <div className="meta-label">当前状态</div>
              <div>
                scene={snapshot.session.gameState.sceneId} | status={snapshot.session.status}
              </div>
            </div>
            <div>
              <div className="meta-label">当前回合</div>
              <div>Round {snapshot.session.currentRound}</div>
            </div>
          </div>

          <div className="state-grid">
            <div className="state-card">
              <div className="meta-label">场景推进</div>
              <div className="state-primary">
                {String(
                  snapshot.session.gameState.sceneState.sceneTitle ??
                    snapshot.session.gameState.sceneId
                )}
              </div>
              <div className="state-secondary">
                {String(
                  snapshot.session.gameState.sceneState.lastSceneSummary ?? "暂无场景摘要"
                )}
              </div>
            </div>

            <div className="state-card">
              <div className="meta-label">目标状态</div>
              <div className="state-secondary">
                当前目标：{renderJoinedList(snapshot.session.gameState.objectiveState.active)}
              </div>
              <div className="state-secondary">
                已完成：
                {renderJoinedList(snapshot.session.gameState.objectiveState.completed)}
              </div>
              <div className="state-secondary">
                已失败：{renderJoinedList(snapshot.session.gameState.objectiveState.failed)}
              </div>
            </div>

            <div className="state-card">
              <div className="meta-label">时钟与线索</div>
              <div className="state-secondary">
                时钟：
                {clocks.length > 0
                  ? clocks.map(([key, value]) => `${key}=${value}`).join(" / ")
                  : "暂无"}
              </div>
              <div className="state-secondary">
                已发现信息：{renderJoinedList(snapshot.session.gameState.discoveredInfoIds)}
              </div>
            </div>

            <div className="state-card">
              <div className="meta-label">关键 Flags</div>
              <div className="flag-list">
                {storyFlags.map(([key, value]) => (
                  <span className="flag-chip" key={key}>
                    {key}={String(value)}
                  </span>
                ))}
              </div>
            </div>
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

          <form className="turn-form" onSubmit={onSubmitTurn}>
            <label className="field">
              <span>输入本轮行动</span>
              <textarea
                rows={5}
                placeholder="例如：我先去录像厅检查投影机和黑色录像带，再询问莉莉她昨晚最后看到了什么。"
                value={turnInput}
                onChange={(event) => onTurnInputChange(event.target.value)}
              />
            </label>

            <button className="primary-button" disabled={isSubmittingTurn} type="submit">
              {isSubmittingTurn ? "提交中..." : "提交本轮行动"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
