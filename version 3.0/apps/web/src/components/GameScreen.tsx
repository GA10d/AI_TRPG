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
import { useUiText } from "../locales/index.tsx";
import type { SavedGameRecord } from "../storage.ts";
import {
  formatAiGenerationMeta,
  formatDateTime,
  type MarkdownFontSizePreset
} from "../ui.ts";
import { MarkdownBlock } from "./MarkdownBlock.tsx";
import { PlaythroughGraphPanel } from "./PlaythroughGraphPanel.tsx";

type SessionBootstrapStepStatus = "pending" | "active" | "completed";

type SessionBootstrapPanelState = {
  coverAssetUrl: string | null;
  loadingHint: string;
  progress: number;
  activeLabel: string;
  activeDetail: string;
  steps: Array<{
    stage: string;
    label: string;
    detail: string;
    status: SessionBootstrapStepStatus;
  }>;
};

type GameScreenProps = {
  snapshot: SessionSnapshot | null;
  activeGraphBundle: PlaythroughGraphBundle | null;
  turnInput: string;
  isBootstrappingSession: boolean;
  isOpeningRevealInProgress: boolean;
  sessionBootstrapState: SessionBootstrapPanelState | null;
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
    isOpeningRevealInProgress,
    sessionBootstrapState,
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
  const text = useUiText();

  const [activeDrawer, setActiveDrawer] = useState<GameDrawer>("none");
  const [npcRoster, setNpcRoster] = useState<NpcRosterEntry[]>([]);
  const [npcLoading, setNpcLoading] = useState(false);
  const [npcError, setNpcError] = useState<string | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [generatedPortraits, setGeneratedPortraits] = useState<
    Record<string, ImageGenerationResponse>
  >({});
  const [generatingNpcId, setGeneratingNpcId] = useState<string | null>(null);

  const actionLocked = isBootstrappingSession || isOpeningRevealInProgress;
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
  const composerDisabled = isSessionEnded || actionLocked;
  const endingJudgeJson = snapshot?.session.gameState.lastEndingJudgeResult
    ? JSON.stringify(snapshot.session.gameState.lastEndingJudgeResult, null, 2)
    : text.gameScreen.noEndingJudge;
  const selectedNpc =
    npcRoster.find((npc) => npc.id === selectedNpcId) ?? npcRoster[0] ?? null;
  const canUseQuickEndingTest =
    snapshot?.session.modelAccessMode === "mock" &&
    snapshot.session.status !== "ended" &&
    !actionLocked;
  const bootstrapProgressPercent = Math.max(
    8,
    Math.min(100, Math.round((sessionBootstrapState?.progress ?? 0.08) * 100))
  );
  const shouldShowBootstrapInline = isBootstrappingSession && !latestNarration?.content;
  const bootstrapStatusLabel =
    sessionBootstrapState?.activeLabel ?? text.app.bootstrapStages.entered_game.label;
  const bootstrapStatusDetail =
    sessionBootstrapState?.activeDetail ?? text.app.bootstrapStages.waiting_first_reply.detail;

  useEffect(() => {
    setNpcRoster([]);
    setNpcError(null);
    setSelectedNpcId(null);
    setGeneratedPortraits({});
    setGeneratingNpcId(null);
    setActiveDrawer("none");
  }, [snapshot?.session.id]);

  useEffect(() => {
    if (activeDrawer !== "npcs" || !snapshot || actionLocked) {
      return;
    }

    const ruleDirectoryName = snapshot.contentSummary.ruleDirectoryName?.trim() ?? "";
    const storyDirectoryName = snapshot.contentSummary.storyDirectoryName?.trim() ?? "";

    if (!ruleDirectoryName || !storyDirectoryName) {
      setNpcRoster([]);
      setSelectedNpcId(null);
      setNpcError(text.gameScreen.missingNpcContentInfo);
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
  }, [activeDrawer, actionLocked, snapshot]);

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
            <div className="eyebrow">{text.appName}</div>
            <h1>{text.gameScreen.emptyTitle}</h1>
            <p className="lead">{text.gameScreen.emptyDescription}</p>
          </div>
          <div className="button-row header-actions">
            <button className="ghost-button" onClick={onBack} type="button">
              {text.common.backToMenu}
            </button>
          </div>
        </div>
        <div className="empty-state">{text.gameScreen.emptyState}</div>
      </section>
    );
  }

  return (
    <section className="panel page-panel game-shell">
      <header className="game-hero">
        <div className="game-hero-copy">
          <div className="eyebrow">{text.gameScreen.heroEyebrow}</div>
          <h1>{snapshot.contentSummary.storyTitle}</h1>
          <p className="lead">
            {snapshot.contentSummary.ruleTitle} / Round {snapshot.session.currentRound} /{" "}
            {isBootstrappingSession
              ? text.gameScreen.creatingSession
              : isOpeningRevealInProgress
                ? text.gameScreen.openingScene
                : snapshot.session.status === "ended"
                  ? text.gameScreen.ended
                  : text.gameScreen.inProgress}
          </p>
        </div>

        <div className="game-toolbar">
          <button className="ghost-button" onClick={onBack} type="button">
            {text.common.backToMenu}
          </button>
          <button
            className="ghost-button"
            disabled={isSaving || actionLocked}
            onClick={() => void onSaveGame()}
            type="button"
          >
            {isSaving ? text.common.creating : text.common.save}
          </button>
          <button
            className="ghost-button"
            disabled={isRestoring || actionLocked}
            onClick={() => setActiveDrawer("saves")}
            type="button"
          >
            {isRestoring ? text.common.loading : text.common.load}
          </button>
          <button
            className="ghost-button"
            disabled={actionLocked}
            onClick={() => setActiveDrawer("npcs")}
            type="button"
          >
            {text.common.npc}
          </button>
          <button
            className="ghost-button"
            disabled={actionLocked}
            onClick={() => setActiveDrawer("details")}
            type="button"
          >
            {text.common.details}
          </button>
        </div>
      </header>

      <div className="game-main">
        <section className="summary-card game-focus-panel">
          <div className="game-panel-head">
            <div>
              <div className="meta-label">{text.gameScreen.currentNarration}</div>
              <div className="summary-title">
                {isSessionEnded
                  ? text.gameScreen.endedTitle
                  : shouldShowBootstrapInline
                    ? text.gameScreen.joiningSceneTitle
                    : text.gameScreen.advancingStoryTitle}
              </div>
            </div>
            {snapshot.session.gameState.endingState ? (
              <span className="flag-chip">{snapshot.session.gameState.endingState.title}</span>
            ) : null}
          </div>

          <div className="game-focus-scroll">
            {shouldShowBootstrapInline ? (
              <div className="game-inline-loading">
                <div className="game-inline-loading-copy">
                  <div className="meta-label">{text.gameScreen.bootstrapEyebrow}</div>
                  <div className="summary-title">{bootstrapStatusLabel}</div>
                  <p className="summary-text">{text.gameScreen.bootstrapWaiting}</p>
                </div>

                <div className="game-inline-loading-progress">
                  <div className="game-loading-progress-meta">
                    <span>{bootstrapStatusDetail}</span>
                    <span>{bootstrapProgressPercent}%</span>
                  </div>
                  <div className="game-loading-progress-track" aria-hidden="true">
                    <div
                      className="game-loading-progress-bar"
                      style={{ width: `${bootstrapProgressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <MarkdownBlock
                  className="story-markdown-block game-focus-markdown"
                  content={latestNarration?.content ?? text.gameScreen.noNarrationYet}
                  fontSizePreset={markdownFontSize}
                />

                {showAiMetadata && latestNarration?.aiMetadata ? (
                  <div className="ai-meta-line">
                    {formatAiGenerationMeta(latestNarration.aiMetadata, text)}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className="summary-card game-history-panel">
          <div className="game-panel-head">
            <div>
              <div className="meta-label">{text.gameScreen.recentContext}</div>
              <div className="summary-title">{text.gameScreen.recentContextTitle}</div>
            </div>
            <span className="summary-text">{text.gameScreen.recentItems(recentHistory.length)}</span>
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
                        {message.kind === "player_input"
                          ? text.gameScreen.playerRound(message.round)
                          : text.gameScreen.narratorRound(message.round)}
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
                <div className="empty-state">{text.gameScreen.historyEmpty}</div>
              )}
            </div>
          </div>
        </section>
      </div>

      {snapshot.session.gameState.endingState ? (
        <div className="info-banner info-banner-success">
          <div className="meta-label">{text.gameScreen.endingState}</div>
          <div className="summary-title">{snapshot.session.gameState.endingState.title}</div>
          <div className="summary-text">{snapshot.session.gameState.endingState.summary}</div>
        </div>
      ) : null}

      <form className="summary-card game-composer" onSubmit={onSubmitTurn}>
        <div className="game-panel-head">
          <div>
            <div className="meta-label">{text.gameScreen.yourAction}</div>
            <div className="summary-title">{text.gameScreen.actionTitle}</div>
          </div>
          <span className="summary-text">
            {composerDisabled ? text.gameScreen.inputLocked : text.gameScreen.submitTurnHint}
          </span>
        </div>

        <textarea
          disabled={composerDisabled}
          rows={5}
          placeholder={
            actionLocked
              ? text.gameScreen.initPlaceholder
              : text.gameScreen.actionPlaceholder
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
            {isSubmittingTurn ? text.common.creating : text.gameScreen.submitTurn}
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
                    <div className="eyebrow">{text.gameScreen.saveLoadEyebrow}</div>
                    <h2>{text.gameScreen.loadSaveTitle}</h2>
                    <p className="lead">{text.gameScreen.saveLoadDescription}</p>
                  </div>
                  <div className="button-row header-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setActiveDrawer("none")}
                      type="button"
                    >
                      {text.common.close}
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
                            {isRestoring ? text.common.loading : text.common.open}
                          </button>
                        </div>
                        <div className="summary-text">
                          {text.gameScreen.savedAt(formatDateTime(record.savedAt))}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">{text.gameScreen.noLocalSaves}</div>
                  )}
                </div>
              </div>
            ) : null}

            {activeDrawer === "npcs" ? (
              <div className="game-drawer-body">
                <div className="screen-header">
                  <div>
                    <div className="eyebrow">{text.gameScreen.npcEyebrow}</div>
                    <h2>{text.gameScreen.npcTitle}</h2>
                    <p className="lead">{text.gameScreen.npcDescription}</p>
                  </div>
                  <div className="button-row header-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setActiveDrawer("none")}
                      type="button"
                    >
                      {text.common.close}
                    </button>
                  </div>
                </div>

                {npcLoading ? <div className="empty-state">{text.gameScreen.loadingNpcFiles}</div> : null}
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
                        <div className="empty-state">{text.gameScreen.noNpcFiles}</div>
                      )}
                    </div>

                    <div className="summary-card game-npc-detail">
                      {selectedNpc ? (
                        <>
                          <div className="game-panel-head">
                            <div>
                              <div className="meta-label">{text.common.npc}</div>
                              <div className="summary-title">{selectedNpc.name}</div>
                            </div>
                            <button
                              className="ghost-button"
                              disabled={generatingNpcId === selectedNpc.id}
                              onClick={() => void handleGenerateNpcPortrait(selectedNpc)}
                              type="button"
                            >
                              {generatingNpcId === selectedNpc.id
                                ? text.gameScreen.generatingPortrait
                                : text.gameScreen.generatePortrait}
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
                              <div className="empty-state">{text.gameScreen.noPortraitYet}</div>
                            )}
                          </div>

                          <div className="summary-text">{selectedNpc.summary}</div>
                          <pre>{selectedNpc.promptText}</pre>
                          {generatedPortraits[selectedNpc.id] ? (
                            <div className="hint-text">
                              {text.common.provider}: {generatedPortraits[selectedNpc.id]?.provider}
                              {"\n"}
                              {text.common.prompt}: {generatedPortraits[selectedNpc.id]?.revisedPrompt}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="empty-state">{text.gameScreen.npcSelectHint}</div>
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
                    <div className="eyebrow">{text.gameScreen.detailsEyebrow}</div>
                    <h2>{text.gameScreen.detailsTitle}</h2>
                    <p className="lead">{text.gameScreen.detailsDescription}</p>
                  </div>
                  <div className="button-row header-actions">
                    <button
                      className="ghost-button"
                      onClick={() => setActiveDrawer("none")}
                      type="button"
                    >
                      {text.common.close}
                    </button>
                  </div>
                </div>

                <div className="grid-two">
                  <div className="summary-card">
                    <div className="meta-label">{text.gameScreen.sessionInfo}</div>
                    <div className="summary-text">
                      {text.gameScreen.sessionId(snapshot.session.id)}
                    </div>
                    <div className="summary-text">
                      {text.gameScreen.content(
                        snapshot.contentSummary.ruleTitle,
                        snapshot.contentSummary.storyTitle
                      )}
                    </div>
                    <div className="summary-text">
                      Model: {snapshot.session.modelAccessMode} /{" "}
                      {snapshot.session.settings.modelProfileId ?? "unknown"}
                    </div>
                  </div>

                  <div className="summary-card">
                    <div className="meta-label">{text.gameScreen.quickEndingTest}</div>
                    <div className="button-row">
                      <button
                        className="ghost-button"
                        disabled={!canUseQuickEndingTest || isSubmittingTurn}
                        onClick={() => void onQuickEndingTest()}
                        type="button"
                      >
                        {isSubmittingTurn ? text.common.creating : text.gameScreen.quickEndingTest}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="meta-label">{text.gameScreen.endingJudge}</div>
                  <pre>{endingJudgeJson}</pre>
                </div>

                <PlaythroughGraphPanel
                  graphBundle={activeGraphBundle}
                  isResuming={isResumingBranch}
                  onContinueFromNode={onContinueFromNode}
                />

                <div className="summary-card">
                  <div className="meta-label">{text.gameScreen.replayLog}</div>
                  <div className="replay-list">
                    {snapshot.replay.length ? (
                      snapshot.replay.map((event) => (
                        <article className="replay-item" key={event.id}>
                          <div className="replay-meta">
                            {event.type} / R{event.round}
                          </div>
                          <div className="replay-body">{event.summary}</div>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state">{text.gameScreen.noReplayLog}</div>
                    )}
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
