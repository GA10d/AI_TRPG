import { useEffect, useState } from "react";

import type {
  BootstrapResponse,
  CreateSessionRequest,
  SessionSnapshot
} from "../../../packages/shared-types/src/index.ts";
import { createSession, fetchBootstrap, submitTurn } from "./api.ts";

type StatusTone = "neutral" | "error";

type StatusState = {
  message: string;
  tone: StatusTone;
};

const initialStatus: StatusState = {
  message: "正在加载 bootstrap 数据...",
  tone: "neutral"
};

function formatMessageMeta(kind: string, round: number): string {
  return `${kind} · R${round}`;
}

function formatReplayMeta(type: string, round: number): string {
  return `${type} · R${round}`;
}

function renderList(items: string[]): string {
  return items.length > 0 ? items.join(" / ") : "暂无";
}

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [status, setStatus] = useState<StatusState>(initialStatus);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [ruleDirectoryName, setRuleDirectoryName] = useState("");
  const [storyDirectoryName, setStoryDirectoryName] = useState("");
  const [locale, setLocale] = useState("");
  const [playMode, setPlayMode] = useState("single_player");
  const [gmArchitecture, setGmArchitecture] = useState("single_agent");
  const [modelAccessMode, setModelAccessMode] = useState("mock");
  const [debugEnabled, setDebugEnabled] = useState(true);
  const [turnInput, setTurnInput] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const data = await fetchBootstrap();
        if (cancelled) {
          return;
        }

        setBootstrap(data);
        const firstRule = data.catalog[0];
        setRuleDirectoryName(firstRule?.directoryName ?? "");
        setStoryDirectoryName(firstRule?.stories[0]?.directoryName ?? "");
        setLocale(data.defaults.locale);
        setPlayMode(data.defaults.playMode);
        setGmArchitecture(data.defaults.gmArchitecture);
        setModelAccessMode(data.defaults.modelAccessMode);
        setStatus({
          message: "bootstrap 数据已加载，可以开始创建 session。",
          tone: "neutral"
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStatus({
          message: error instanceof Error ? error.message : String(error),
          tone: "error"
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRule = bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ?? null;
  const stories = selectedRule?.stories ?? [];

  useEffect(() => {
    if (!stories.length) {
      return;
    }

    const stillExists = stories.some((item) => item.directoryName === storyDirectoryName);
    if (!stillExists) {
      setStoryDirectoryName(stories[0]?.directoryName ?? "");
    }
  }, [stories, storyDirectoryName]);

  async function handleCreateSession(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!bootstrap) {
      return;
    }

    const payload: CreateSessionRequest = {
      ruleDirectoryName,
      storyDirectoryName,
      locale,
      playMode: playMode as CreateSessionRequest["playMode"],
      gmArchitecture: gmArchitecture as CreateSessionRequest["gmArchitecture"],
      modelAccessMode: modelAccessMode as CreateSessionRequest["modelAccessMode"],
      debugEnabled,
      promptDebugEnabled: false,
      logViewMode: "compact"
    };

    setIsCreating(true);
    setStatus({
      message: "正在创建 session...",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await createSession(payload);
      setSnapshot(nextSnapshot);
      setStatus({
        message: "Session 创建成功，已进入最小游戏页。",
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSubmitTurn(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!snapshot) {
      setStatus({
        message: "请先创建 session。",
        tone: "error"
      });
      return;
    }

    const trimmedInput = turnInput.trim();
    if (!trimmedInput) {
      setStatus({
        message: "请输入本轮行动。",
        tone: "error"
      });
      return;
    }

    setIsSubmittingTurn(true);
    setStatus({
      message: "正在提交本轮行动...",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await submitTurn(snapshot.session.id, {
        playerInput: trimmedInput
      });
      setSnapshot(nextSnapshot);
      setTurnInput("");
      setStatus({
        message: "本轮 mock 处理完成，消息流和回放已更新。",
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsSubmittingTurn(false);
    }
  }

  const openingMessage = snapshot?.messages.find((item) => item.kind === "gm_narration") ?? null;
  const storyFlags = snapshot ? Object.entries(snapshot.session.gameState.storyFlags) : [];
  const clocks = snapshot ? Object.entries(snapshot.session.gameState.clocks) : [];

  return (
    <main className="page-shell">
      <section className="panel panel-form">
        <div className="eyebrow">Phase 2 Transition</div>
        <h1>React 会话创建页</h1>
        <p className="lead">
          现在前端已经从静态脚本迁到 React/Vite。当前目标仍然克制，只验证最小 mock 闭环能稳定跑通。
        </p>

        <form className="form-grid" onSubmit={handleCreateSession}>
          <label className="field">
            <span>规则</span>
            <select
              value={ruleDirectoryName}
              onChange={(event) => setRuleDirectoryName(event.target.value)}
            >
              {bootstrap?.catalog.map((rule) => (
                <option key={rule.directoryName} value={rule.directoryName}>
                  {rule.ruleTitle} ({rule.ruleId})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>剧本</span>
            <select
              value={storyDirectoryName}
              onChange={(event) => setStoryDirectoryName(event.target.value)}
            >
              {stories.map((story) => (
                <option key={story.directoryName} value={story.directoryName}>
                  {story.title} ({story.storyId})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>语言</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value)}>
              {bootstrap?.languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nativeLabel} / {language.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>模型模式</span>
            <select
              value={modelAccessMode}
              onChange={(event) => setModelAccessMode(event.target.value)}
            >
              {bootstrap?.modelAccessModes.map((mode) => (
                <option key={mode.code} value={mode.code}>
                  {mode.label} - {mode.description}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>游玩模式</span>
            <select value={playMode} onChange={(event) => setPlayMode(event.target.value)}>
              <option value="single_player">single_player</option>
              <option value="single_player_with_npc">single_player_with_npc</option>
              <option value="multiplayer">multiplayer</option>
            </select>
          </label>

          <label className="field">
            <span>主持架构</span>
            <select
              value={gmArchitecture}
              onChange={(event) => setGmArchitecture(event.target.value)}
            >
              <option value="single_agent">single_agent</option>
              <option value="multi_agent">multi_agent</option>
            </select>
          </label>

          <label className="field-inline">
            <input
              type="checkbox"
              checked={debugEnabled}
              onChange={(event) => setDebugEnabled(event.target.checked)}
            />
            <span>开启 debug 日志</span>
          </label>

          <button className="primary-button" disabled={isCreating} type="submit">
            {isCreating ? "创建中..." : "创建 Session"}
          </button>
        </form>

        <p className={`status-line ${status.tone === "error" ? "status-error" : ""}`}>
          {status.message}
        </p>
      </section>

      <section className="panel panel-result">
        <div className="result-header">
          <h2>创建结果 / 最小游戏页</h2>
          <span className="badge">
            {snapshot ? "创建成功" : "尚未创建"}
          </span>
        </div>

        {!snapshot ? (
          <div className="empty-state">
            创建成功后，这里会显示 Session 基本信息、语言解析结果、消息流、回放日志和 turn 提交区。
          </div>
        ) : (
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
                  请求: {snapshot.contentSummary.requestedLocale} | 实际: {snapshot.contentSummary.resolvedLocale}
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
              <div className="meta-label">Mock 开场文本</div>
              <pre>{openingMessage?.content ?? "未找到 mock 开场文本"}</pre>
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
                    {String(snapshot.session.gameState.sceneState.sceneTitle ?? snapshot.session.gameState.sceneId)}
                  </div>
                  <div className="state-secondary">
                    {String(snapshot.session.gameState.sceneState.lastSceneSummary ?? "暂无场景摘要")}
                  </div>
                </div>

                <div className="state-card">
                  <div className="meta-label">目标状态</div>
                  <div className="state-secondary">
                    当前目标：{renderList(snapshot.session.gameState.objectiveState.active)}
                  </div>
                  <div className="state-secondary">
                    已完成：{renderList(snapshot.session.gameState.objectiveState.completed)}
                  </div>
                  <div className="state-secondary">
                    已失败：{renderList(snapshot.session.gameState.objectiveState.failed)}
                  </div>
                </div>

                <div className="state-card">
                  <div className="meta-label">时钟与线索</div>
                  <div className="state-secondary">
                    时钟：{clocks.length > 0 ? clocks.map(([key, value]) => `${key}=${value}`).join(" / ") : "暂无"}
                  </div>
                  <div className="state-secondary">
                    已发现信息：{renderList(snapshot.session.gameState.discoveredInfoIds)}
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
                          <span>{formatMessageMeta(message.kind, message.round)}</span>
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
                          <span>{formatReplayMeta(event.type, event.round)}</span>
                        </div>
                        <div className="replay-body">{event.summary}</div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>

              <form className="turn-form" onSubmit={handleSubmitTurn}>
                <label className="field">
                  <span>输入本轮行动</span>
                  <textarea
                    rows={5}
                    placeholder="例如：我先检查录像厅入口的地面痕迹，然后轻声询问莉莉她姐姐最后一次出现在哪。"
                    value={turnInput}
                    onChange={(event) => setTurnInput(event.target.value)}
                  />
                </label>

                <button className="primary-button" disabled={isSubmittingTurn} type="submit">
                  {isSubmittingTurn ? "提交中..." : "提交本轮行动"}
                </button>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
