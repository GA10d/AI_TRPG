import { useEffect, useState, type FormEvent } from "react";

import type {
  ImageGenerationResponse,
  ImagePromptTemplateConfig,
  NpcRosterEntry,
  PlaythroughGraphBundle,
  RuntimeImageModelConfigInput,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";
import { fetchNpcRoster, generateSceneImage } from "../lib/trpgApiClient.ts";
import type { SavedGameRecord } from "../storage.ts";
import {
  formatAiGenerationMeta,
  formatDateTime,
  type MarkdownFontSizePreset
} from "../ui.ts";
import { MarkdownBlock } from "./MarkdownBlock.tsx";
import { PlaythroughGraphPanel } from "./PlaythroughGraphPanel.tsx";

type GameScreenProps = {
  snapshot: SessionSnapshot | null;
  activeGraphBundle: PlaythroughGraphBundle | null;
  turnInput: string;
  isBootstrappingSession: boolean;
  isSubmittingTurn: boolean;
  isSaving: boolean;
  isRestoring: boolean;
  isResumingBranch: boolean;
  savedGames: SavedGameRecord[];
  showAiMetadata: boolean;
  markdownFontSize: MarkdownFontSizePreset;
  imageProfileId: string;
  runtimeImageModelConfig: RuntimeImageModelConfigInput;
  imagePromptTemplateConfig: ImagePromptTemplateConfig | null;
  onBack: () => void;
  onContinueFromNode: (nodeId: string) => Promise<void>;
  onLoadSavedGame: (record: SavedGameRecord) => Promise<void>;
  onQuickEndingTest: () => Promise<void>;
  onSaveGame: () => Promise<void>;
  onTurnInputChange: (value: string) => void;
  onSubmitTurn: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

type GameDrawer = "none" | "saves" | "npcs" | "details";

export function GameScreen(props: GameScreenProps) {
  const {
    snapshot,
    activeGraphBundle,
    turnInput,
    isBootstrappingSession,
    isSubmittingTurn,
    isSaving,
    isRestoring,
    isResumingBranch,
    savedGames,
    showAiMetadata,
    markdownFontSize,
    imageProfileId,
    runtimeImageModelConfig,
    imagePromptTemplateConfig,
    onBack,
    onContinueFromNode,
    onLoadSavedGame,
    onQuickEndingTest,
    onSaveGame,
    onTurnInputChange,
    onSubmitTurn
  } = props;

  const [activeDrawer, setActiveDrawer] = useState<GameDrawer>("none");
  const [npcRoster, setNpcRoster] = useState<NpcRosterEntry[]>([]);
  const [npcLoading, setNpcLoading] = useState(false);
  const [npcError, setNpcError] = useState<string | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [generatedPortraits, setGeneratedPortraits] = useState<
    Record<string, ImageGenerationResponse>
  >({});
  const [generatingNpcId, setGeneratingNpcId] = useState<string | null>(null);

  const visibleMessages =
    snapshot?.messages.filter((message) => message.kind !== "system") ?? [];
  const latestNarration =
    [...visibleMessages]
      .reverse()
      .find((message) => message.kind === "gm_narration" || message.kind === "gm_dialogue") ??
    null;
  const recentHistory = latestNarration
    ? visibleMessages.filter((message) => message.id !== latestNarration.id).slice(-8)
    : visibleMessages.slice(-8);
  const isSessionEnded = snapshot?.session.status === "ended";
  const composerDisabled = isSessionEnded || isBootstrappingSession;
  const endingJudgeJson = snapshot?.session.gameState.lastEndingJudgeResult
    ? JSON.stringify(snapshot.session.gameState.lastEndingJudgeResult, null, 2)
    : "暂无本轮结局判定结果。";
  const selectedNpc =
    npcRoster.find((npc) => npc.id === selectedNpcId) ?? npcRoster[0] ?? null;
  const canUseQuickEndingTest =
    snapshot?.session.modelAccessMode === "mock" &&
    snapshot.session.status !== "ended" &&
    !isBootstrappingSession;

  useEffect(() => {
    setNpcRoster([]);
    setNpcError(null);
    setSelectedNpcId(null);
    setGeneratedPortraits({});
    setGeneratingNpcId(null);
    setActiveDrawer("none");
  }, [snapshot?.session.id]);

  useEffect(() => {
    if (activeDrawer !== "npcs" || !snapshot || isBootstrappingSession) {
      return;
    }

    const ruleDirectoryName = snapshot.contentSummary.ruleDirectoryName?.trim() ?? "";
    const storyDirectoryName = snapshot.contentSummary.storyDirectoryName?.trim() ?? "";

    if (!ruleDirectoryName || !storyDirectoryName) {
      setNpcRoster([]);
      setSelectedNpcId(null);
      setNpcError("当前存档不包含内容目录信息，暂时无法读取 NPC 档案。");
      return;
    }

    let cancelled = false;
    setNpcLoading(true);
    setNpcError(null);

    void fetchNpcRoster(ruleDirectoryName, storyDirectoryName)
      .then((roster) => {
        if (cancelled) {
          return;
        }

        setNpcRoster(roster);
        setSelectedNpcId((current) =>
          current && roster.some((item) => item.id === current) ? current : roster[0]?.id ?? null
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setNpcRoster([]);
        setSelectedNpcId(null);
        setNpcError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setNpcLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDrawer, snapshot, isBootstrappingSession]);

  async function handleLoadSavedGame(record: SavedGameRecord): Promise<void> {
    setActiveDrawer("none");
    await onLoadSavedGame(record);
  }

  async function handleGenerateNpcPortrait(npc: NpcRosterEntry): Promise<void> {
    if (!snapshot) {
      return;
    }

    setGeneratingNpcId(npc.id);
    setNpcError(null);

    try {
      const result = await generateSceneImage({
        prompt: npc.promptText.trim() || npc.summary.trim() || npc.name,
        trigger: "character_portrait",
        theme: imagePromptTemplateConfig?.defaultTheme,
        sceneId: `${snapshot.session.id}:${npc.id}`,
        imageProfileId,
        runtimeImageModelConfig,
        promptTemplateConfig: imagePromptTemplateConfig ?? undefined,
        allowFallback: true,
        characters: [
          {
            name: npc.name,
            appearance: npc.summary.trim() || npc.promptText.trim() || npc.name
          }
        ]
      });

      setGeneratedPortraits((current) => ({
        ...current,
        [npc.id]: result
      }));
    } catch (error) {
      setNpcError(error instanceof Error ? error.message : String(error));
    } finally {
      setGeneratingNpcId(null);
    }
  }

  if (!snapshot) {
    return (
      <section className="panel page-panel">
        <div className="screen-header">
          <div>
            <div className="eyebrow">AI TRPG 3.0</div>
            <h1>游戏中</h1>
            <p className="lead">当前还没有活动中的会话。</p>
          </div>
          <div className="button-row header-actions">
            <button className="ghost-button" onClick={onBack} type="button">
              返回主菜单
            </button>
          </div>
        </div>
        <div className="empty-state">暂无可展示的游玩会话。</div>
      </section>
    );
  }

  return (
    <section className="panel page-panel game-shell">
      <header className="game-hero">
        <div className="game-hero-copy">
          <div className="eyebrow">Core Play</div>
          <h1>{snapshot.contentSummary.storyTitle}</h1>
          <p className="lead">
            {snapshot.contentSummary.ruleTitle} / Round {snapshot.session.currentRound} /{" "}
            {isBootstrappingSession
              ? "正在进入场景"
              : snapshot.session.status === "ended"
                ? "结局已锁定"
                : "进行中"}
          </p>
        </div>

        <div className="game-toolbar">
          <button className="ghost-button" onClick={onBack} type="button">
            返回菜单
          </button>
          <button
            className="ghost-button"
            disabled={isSaving || isBootstrappingSession}
            onClick={() => void onSaveGame()}
            type="button"
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
          <button
            className="ghost-button"
            disabled={isRestoring || isBootstrappingSession}
            onClick={() => setActiveDrawer("saves")}
            type="button"
          >
            {isRestoring ? "读档中..." : "读档"}
          </button>
          <button
            className="ghost-button"
            disabled={isBootstrappingSession}
            onClick={() => setActiveDrawer("npcs")}
            type="button"
          >
            NPC
          </button>
          <button
            className="ghost-button"
            disabled={isBootstrappingSession}
            onClick={() => setActiveDrawer("details")}
            type="button"
          >
            详情
          </button>
        </div>
      </header>

      {isBootstrappingSession ? (
        <div className="info-banner">
          <div className="meta-label">会话初始化</div>
          <div className="summary-text">
            已经进入游戏界面，正在后台建立正式会话。你现在看到的是渐显过渡内容，正式开场就绪后会自动替换。
          </div>
        </div>
      ) : null}

      <div className="game-main">
        <section className="summary-card game-focus-panel">
          <div className="game-panel-head">
            <div>
              <div className="meta-label">本轮叙事</div>
              <div className="summary-title">
                {isSessionEnded ? "当前会话已进入结局" : "主持人正在推进故事"}
              </div>
            </div>
            {snapshot.session.gameState.endingState ? (
              <span className="flag-chip">{snapshot.session.gameState.endingState.title}</span>
            ) : null}
          </div>

          <div className="game-focus-scroll">
            <MarkdownBlock
              className="story-markdown-block game-focus-markdown"
              content={latestNarration?.content ?? "尚未生成叙事文本。"}
              fontSizePreset={markdownFontSize}
            />

            {showAiMetadata && latestNarration?.aiMetadata ? (
              <div className="ai-meta-line">{formatAiGenerationMeta(latestNarration.aiMetadata)}</div>
            ) : null}
          </div>
        </section>

        <section className="summary-card game-history-panel">
          <div className="game-panel-head">
            <div>
              <div className="meta-label">最近上下文</div>
              <div className="summary-title">上一轮对话与铺垫</div>
            </div>
            <span className="summary-text">{recentHistory.length} 条</span>
          </div>

          <div className="game-history-scroll">
            <div className="game-history-list">
              {recentHistory.length ? (
                recentHistory.map((message) => (
                  <article
                    className={`game-history-item ${
                      message.kind === "player_input"
                        ? "game-history-item-player"
                        : "game-history-item-gm"
                    }`}
                    key={message.id}
                  >
                    <div className="game-history-meta">
                      <span>
                        {message.kind === "player_input" ? "玩家" : "主持人"} / R{message.round}
                      </span>
                      <span>{formatDateTime(message.createdAt)}</span>
                    </div>

                    {message.kind === "player_input" ? (
                      <div className="message-body">{message.content}</div>
                    ) : (
                      <MarkdownBlock
                        className="story-markdown-block message-body message-body-markdown"
                        content={message.content}
                        fontSizePreset={markdownFontSize}
                      />
                    )}
                  </article>
                ))
              ) : (
                <div className="empty-state">当前还没有足够的历史对话。</div>
              )}
            </div>
          </div>
        </section>
      </div>

      {snapshot.session.gameState.endingState ? (
        <div className="info-banner info-banner-success">
          <div className="meta-label">结局状态</div>
          <div className="summary-title">{snapshot.session.gameState.endingState.title}</div>
          <div className="summary-text">{snapshot.session.gameState.endingState.summary}</div>
        </div>
      ) : null}

      <form className="summary-card game-composer" onSubmit={onSubmitTurn}>
        <div className="game-panel-head">
          <div>
            <div className="meta-label">你的行动</div>
            <div className="summary-title">输入这一轮的行动或对话</div>
          </div>
          <span className="summary-text">
            {composerDisabled ? "会话未就绪，暂不可输入" : "输入后提交本轮行动"}
          </span>
        </div>

        <textarea
          disabled={composerDisabled}
          rows={5}
          placeholder={
            isBootstrappingSession
              ? "会话初始化中，正式开场完成后即可输入行动。"
              : "例如：我先检查门后的痕迹，再低声询问对方为什么会在这个时间出现在这里。"
          }
          value={turnInput}
          onChange={(event) => onTurnInputChange(event.target.value)}
        />

        <div className="button-row">
          <button
            className="primary-button"
            disabled={isSubmittingTurn || composerDisabled}
            type="submit"
          >
            {isSubmittingTurn ? "提交中..." : "提交本轮行动"}
          </button>
        </div>
      </form>

      {activeDrawer !== "none" ? (
        <div className="game-drawer-backdrop" onClick={() => setActiveDrawer("none")}>
          <aside className="game-drawer-panel" onClick={(event) => event.stopPropagation()}>
            {activeDrawer === "saves" ? (
              <div className="game-drawer-body">
                <div className="screen-header">
                  <div>
                    <div className="eyebrow">Save / Load</div>
                    <h2>读档</h2>
                    <p className="lead">主界面保留存档与读档入口，方便长线游玩。</p>
                  </div>
                  <div className="button-row header-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setActiveDrawer("none")}
                      type="button"
                    >
                      关闭
                    </button>
                  </div>
                </div>

                <div className="game-save-list">
                  {savedGames.length ? (
                    savedGames.map((record) => (
                      <article className="record-card" key={record.saveId}>
                        <div className="record-header">
                          <div>
                            <div className="summary-title">{record.storyTitle}</div>
                            <div className="summary-text">
                              {record.ruleTitle} / Round {record.round} / {record.status}
                            </div>
                          </div>
                          <button
                            className="ghost-button"
                            disabled={isRestoring}
                            onClick={() => void handleLoadSavedGame(record)}
                            type="button"
                          >
                            {isRestoring ? "读档中..." : "载入"}
                          </button>
                        </div>
                        <div className="summary-text">
                          保存时间：{formatDateTime(record.savedAt)}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">当前还没有可用的本地存档。</div>
                  )}
                </div>
              </div>
            ) : null}

            {activeDrawer === "npcs" ? (
              <div className="game-drawer-body">
                <div className="screen-header">
                  <div>
                    <div className="eyebrow">NPC</div>
                    <h2>角色档案</h2>
                    <p className="lead">在这里查看 NPC 文档、现有立绘，以及后续生成的 AI 立绘。</p>
                  </div>
                  <div className="button-row header-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setActiveDrawer("none")}
                      type="button"
                    >
                      关闭
                    </button>
                  </div>
                </div>

                {npcLoading ? <div className="empty-state">正在读取 NPC 档案...</div> : null}
                {npcError ? <div className="info-banner info-banner-warning">{npcError}</div> : null}

                {!npcLoading && !npcError ? (
                  <div className="game-npc-layout">
                    <div className="game-npc-list">
                      {npcRoster.length ? (
                        npcRoster.map((npc) => (
                          <button
                            className={`selection-card ${
                              selectedNpc?.id === npc.id ? "selection-card-active" : ""
                            }`}
                            key={npc.id}
                            onClick={() => setSelectedNpcId(npc.id)}
                            type="button"
                          >
                            <div className="selection-card-title">{npc.name}</div>
                            <div className="selection-card-copy">{npc.summary}</div>
                          </button>
                        ))
                      ) : (
                        <div className="empty-state">这个剧本暂时没有暴露可读的 NPC 文档。</div>
                      )}
                    </div>

                    <div className="summary-card game-npc-detail">
                      {selectedNpc ? (
                        <>
                          <div className="game-panel-head">
                            <div>
                              <div className="meta-label">NPC</div>
                              <div className="summary-title">{selectedNpc.name}</div>
                            </div>
                            <button
                              className="ghost-button"
                              disabled={generatingNpcId === selectedNpc.id}
                              onClick={() => void handleGenerateNpcPortrait(selectedNpc)}
                              type="button"
                            >
                              {generatingNpcId === selectedNpc.id ? "生成中..." : "AI 生成立绘"}
                            </button>
                          </div>

                          <div className="game-npc-portrait">
                            {generatedPortraits[selectedNpc.id]?.imageUrl ||
                            selectedNpc.portraitAssetUrl ? (
                              <img
                                alt={selectedNpc.name}
                                src={
                                  generatedPortraits[selectedNpc.id]?.imageUrl ??
                                  selectedNpc.portraitAssetUrl ??
                                  undefined
                                }
                              />
                            ) : (
                              <div className="empty-state">当前还没有这名 NPC 的立绘。</div>
                            )}
                          </div>

                          <div className="summary-text">{selectedNpc.summary}</div>
                          <pre>{selectedNpc.promptText}</pre>
                          {generatedPortraits[selectedNpc.id] ? (
                            <div className="hint-text">
                              Provider: {generatedPortraits[selectedNpc.id]?.provider}
                              {"\n"}
                              Prompt: {generatedPortraits[selectedNpc.id]?.revisedPrompt}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="empty-state">先从左侧选择一个 NPC。</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeDrawer === "details" ? (
              <div className="game-drawer-body">
                <div className="screen-header">
                  <div>
                    <div className="eyebrow">Details</div>
                    <h2>会话详情</h2>
                    <p className="lead">
                      非核心信息统一收在这里，包括结局判定、回放日志、分支图和调试辅助。
                    </p>
                  </div>
                  <div className="button-row header-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setActiveDrawer("none")}
                      type="button"
                    >
                      关闭
                    </button>
                  </div>
                </div>

                <div className="grid-two">
                  <div className="summary-card">
                    <div className="meta-label">会话信息</div>
                    <div className="summary-text">Session ID: {snapshot.session.id}</div>
                    <div className="summary-text">
                      内容：{snapshot.contentSummary.ruleTitle} / {snapshot.contentSummary.storyTitle}
                    </div>
                    <div className="summary-text">
                      模型：{snapshot.session.modelAccessMode} /{" "}
                      {snapshot.session.settings.modelProfileId ?? "unknown"}
                    </div>
                  </div>

                  <div className="summary-card">
                    <div className="meta-label">快捷操作</div>
                    <div className="button-row">
                      <button
                        className="ghost-button"
                        disabled={!canUseQuickEndingTest || isSubmittingTurn}
                        onClick={() => void onQuickEndingTest()}
                        type="button"
                      >
                        {isSubmittingTurn ? "处理中..." : "Mock 快速结局测试"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="meta-label">结局判定 JSON</div>
                  <pre>{endingJudgeJson}</pre>
                </div>

                <PlaythroughGraphPanel
                  graphBundle={activeGraphBundle}
                  isResuming={isResumingBranch}
                  onContinueFromNode={onContinueFromNode}
                />

                <div className="summary-card">
                  <div className="meta-label">回放日志</div>
                  <div className="replay-list">
                    {snapshot.replay.map((event) => (
                      <article className="replay-item" key={event.id}>
                        <div className="replay-meta">
                          {event.type} / R{event.round}
                        </div>
                        <div className="replay-body">{event.summary}</div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
