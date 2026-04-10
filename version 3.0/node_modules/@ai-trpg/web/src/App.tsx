import { useState } from "react";

import type {
  SaveBundle,
  SaveRuntimeConfig,
  SessionSnapshot
} from "../../../packages/shared-types/src/index.ts";
import {
  createSave,
  createSession,
  fetchSession,
  loadSaveBundle,
  submitTurn
} from "./lib/trpgApiClient.ts";
import { useBootstrapState } from "./hooks/useBootstrapState.ts";
import { usePlaythroughGraph } from "./hooks/usePlaythroughGraph.ts";
import { useStoredProgress } from "./hooks/useStoredProgress.ts";
import { ContinuePage } from "./pages/ContinuePage.tsx";
import { ExitPage } from "./pages/ExitPage.tsx";
import { GamePage } from "./pages/GamePage.tsx";
import { GameSetupPage } from "./pages/GameSetupPage.tsx";
import { MenuPage } from "./pages/MenuPage.tsx";
import { RecordsPage } from "./pages/RecordsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { StorySelectPage } from "./pages/StorySelectPage.tsx";
import { storeWebDefaults, type SavedGameRecord } from "./storage.ts";
import { type AppView, type StatusState } from "./ui.ts";

const initialStatus: StatusState = {
  message: "",
  tone: "neutral"
};

function normalizeRuntimeConfig(
  input: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  } | undefined
): SaveRuntimeConfig["runtimeModelConfig"] | undefined {
  if (!input) {
    return undefined;
  }

  const apiKey = input.apiKey?.trim() ?? "";
  const baseUrl = input.baseUrl?.trim() ?? "";
  const model = input.model?.trim() ?? "";

  if (!apiKey && !baseUrl && !model) {
    return undefined;
  }

  return {
    apiKey,
    baseUrl,
    model
  };
}

export function App() {
  const [view, setView] = useState<AppView>("menu");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [status, setStatus] = useState<StatusState>(initialStatus);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isResumingBranch, setIsResumingBranch] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [turnInput, setTurnInput] = useState("");
  const [characterConcept, setCharacterConcept] = useState("");

  const {
    bootstrap,
    ruleDirectoryName,
    storyDirectoryName,
    locale,
    playMode,
    gmArchitecture,
    modelAccessMode,
    modelProfileId,
    runtimeModelConfig,
    debugEnabled,
    logViewMode,
    setRuleDirectoryName,
    setStoryDirectoryName,
    setLocale,
    setPlayMode,
    setGmArchitecture,
    setModelAccessMode,
    setModelProfileId,
    setRuntimeModelConfig,
    setDebugEnabled,
    setLogViewMode
  } = useBootstrapState({
    onStatusChange: setStatus
  });

  const {
    recentSnapshot,
    savedGames,
    commitSnapshot: persistStoredSnapshot,
    commitSaveBundle,
    clearRecent,
    clearSavedGamesList,
    removeSavedGameById
  } = useStoredProgress();

  const {
    activeGraphBundle,
    beginFromSnapshot,
    captureTurn,
    syncSavedBundle,
    relinkSnapshot,
    relinkSaveBundle,
    prepareResume
  } = usePlaythroughGraph();

  const recentSave = savedGames[0] ?? null;

  function buildSaveRuntimeConfig(
    profileIdOverride?: string
  ): SaveRuntimeConfig {
    return {
      modelProfileId: profileIdOverride ?? modelProfileId,
      runtimeModelConfig: normalizeRuntimeConfig(runtimeModelConfig)
    };
  }

  function saveDefaults(): void {
    storeWebDefaults({
      locale,
      playMode,
      gmArchitecture,
      modelAccessMode,
      modelProfileId,
      runtimeModelConfig,
      debugEnabled,
      logViewMode
    });
  }

  function commitSnapshot(nextSnapshot: SessionSnapshot): void {
    setSnapshot(nextSnapshot);
    persistStoredSnapshot(nextSnapshot);
  }

  async function submitPlayerTurn(
    currentSnapshot: SessionSnapshot,
    playerInput: string,
    options?: {
      pendingMessage?: string;
      successMessage?: string;
      endingSuccessMessage?: string;
    }
  ): Promise<void> {
    setIsSubmittingTurn(true);
    setStatus({
      message: options?.pendingMessage ?? "正在提交本轮行动...",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await submitTurn(currentSnapshot.session.id, {
        playerInput
      });
      commitSnapshot(nextSnapshot);
      captureTurn(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId),
        playerInput
      );
      setTurnInput("");
      setStatus({
        message:
          nextSnapshot.session.status === "ended"
            ? options?.endingSuccessMessage ?? "本轮处理完成，并已进入结局。"
            : options?.successMessage ?? "本轮处理完成。",
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

  async function handleCreateSession(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    const selectedRule =
      bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ?? null;
    const selectedStory =
      selectedRule?.stories.find((item) => item.directoryName === storyDirectoryName) ?? null;

    if (!bootstrap || !selectedRule || !selectedStory) {
      setStatus({
        message: "当前没有可用的规则或剧本。",
        tone: "error"
      });
      return;
    }

    setIsCreating(true);
    setStatus({
      message: "正在创建会话...",
      tone: "neutral"
    });

    try {
      saveDefaults();
      const nextSnapshot = await createSession({
        ruleDirectoryName,
        storyDirectoryName,
        locale,
        playMode,
        gmArchitecture,
        modelAccessMode,
        modelProfileId,
        runtimeModelConfig,
        debugEnabled,
        promptDebugEnabled: false,
        logViewMode
      });
      commitSnapshot(nextSnapshot);
      beginFromSnapshot(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId)
      );
      setTurnInput("");
      setView("game");
      setStatus({
        message:
          characterConcept.trim().length > 0
            ? "会话创建成功，你的角色概念已记录在本局开场流程中。"
            : "会话创建成功。",
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

  async function handleSubmitTurn(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    if (!snapshot) {
      setStatus({
        message: "请先开始游戏。",
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

    await submitPlayerTurn(snapshot, trimmedInput);
  }

  async function handleQuickEndingTest(): Promise<void> {
    if (!snapshot) {
      setStatus({
        message: "请先开始游戏。",
        tone: "error"
      });
      return;
    }

    if (snapshot.session.modelAccessMode !== "mock") {
      setStatus({
        message: "快速结局测试按钮只在 mock 模式下可用。",
        tone: "error"
      });
      return;
    }

    await submitPlayerTurn(snapshot, "我掏出手枪自杀", {
      pendingMessage: "正在触发 mock 结局测试...",
      successMessage: "mock 结局测试已提交。",
      endingSuccessMessage: "mock 结局测试成功，当前会话已进入结局。"
    });
  }

  async function handleSaveGame(): Promise<void> {
    if (!snapshot) {
      setStatus({
        message: "当前没有可保存的会话。",
        tone: "error"
      });
      return;
    }

    setIsSaving(true);
    setStatus({
      message: "正在创建本地存档...",
      tone: "neutral"
    });

    try {
      const result = await createSave(snapshot.session.id);
      commitSnapshot(result.snapshot);
      commitSaveBundle(result.saveBundle);
      syncSavedBundle(result.saveBundle);
      setStatus({
        message: "手动存档已保存到本地。",
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function restoreFromSaveBundle(
    saveBundle: SaveBundle,
    successMessage: string
  ): Promise<void> {
    setIsRestoring(true);
    setStatus({
      message: "正在恢复存档...",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await loadSaveBundle(saveBundle);
      commitSnapshot(nextSnapshot);
      relinkSaveBundle(
        saveBundle,
        nextSnapshot,
        saveBundle.runtimeConfig ?? buildSaveRuntimeConfig(saveBundle.session.settings.modelProfileId)
      );
      setView("game");
      setStatus({
        message: successMessage,
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleContinueRecentSave(): Promise<void> {
    if (!recentSave) {
      setStatus({
        message: "当前没有最近存档。",
        tone: "error"
      });
      return;
    }

    return restoreFromSaveBundle(recentSave.bundle, "已从最近存档恢复会话。");
  }

  async function handleContinueRecentSnapshot(): Promise<void> {
    if (!recentSnapshot) {
      setStatus({
        message: "本地还没有最近进度。",
        tone: "error"
      });
      return;
    }

    setIsRestoring(true);
    setStatus({
      message: "正在恢复最近快照...",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await fetchSession(recentSnapshot.session.id);
      commitSnapshot(nextSnapshot);
      relinkSnapshot(
        nextSnapshot,
        buildSaveRuntimeConfig(nextSnapshot.session.settings.modelProfileId)
      );
      setView("game");
      setStatus({
        message: "已从服务端同步最近会话。",
        tone: "neutral"
      });
    } catch {
      commitSnapshot(recentSnapshot);
      relinkSnapshot(
        recentSnapshot,
        buildSaveRuntimeConfig(recentSnapshot.session.settings.modelProfileId)
      );
      setView("game");
      setStatus({
        message: "服务端未找到该会话，已改用本地快照打开。",
        tone: "neutral"
      });
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleLoadSavedGame(record: SavedGameRecord): Promise<void> {
    return restoreFromSaveBundle(record.bundle, `已载入存档：${record.storyTitle}`);
  }

  async function handleContinueFromNode(nodeId: string): Promise<void> {
    const prepared = prepareResume(nodeId);
    if (!prepared) {
      setStatus({
        message: "当前节点不可继续，或本地缺少对应快照。",
        tone: "error"
      });
      return;
    }

    setIsResumingBranch(true);
    setStatus({
      message: "正在从历史节点恢复，并准备生成新的分支...",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await loadSaveBundle(prepared.saveBundle);
      commitSnapshot(nextSnapshot);
      setTurnInput("");
      setView("game");
      setStatus({
        message: "已切换到所选节点。下一轮行动将从这里长出新的分支。",
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        tone: "error"
      });
    } finally {
      setIsResumingBranch(false);
    }
  }

  function handleSaveSettings(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    saveDefaults();
    setView("menu");
    setStatus({
      message: "默认设置已保存。",
      tone: "neutral"
    });
  }

  function handleResetSettings(): void {
    if (!bootstrap) {
      return;
    }

    setLocale(bootstrap.defaults.locale);
    setPlayMode(bootstrap.defaults.playMode);
    setGmArchitecture(bootstrap.defaults.gmArchitecture);
    setModelAccessMode(bootstrap.defaults.modelAccessMode);
    setModelProfileId(bootstrap.defaults.modelProfileId);
    setRuntimeModelConfig({
      apiKey: "",
      baseUrl: "",
      model: ""
    });
    setLogViewMode(bootstrap.defaults.logViewMode);
    setDebugEnabled(true);
    setStatus({
      message: "已恢复默认设置。",
      tone: "neutral"
    });
  }

  function handleClearRecent(): void {
    clearRecent();
    setStatus({
      message: "最近快照已清除。",
      tone: "neutral"
    });
  }

  function handleClearSavedGames(): void {
    clearSavedGamesList();
    setStatus({
      message: "本地存档已清空。",
      tone: "neutral"
    });
  }

  function handleRemoveRecentSave(): void {
    if (!recentSave) {
      return;
    }

    removeSavedGameById(recentSave.saveId);
    setStatus({
      message: "最近存档已删除。",
      tone: "neutral"
    });
  }

  function handleDeleteSavedGame(saveId: string): void {
    removeSavedGameById(saveId);
    setStatus({
      message: "该存档已删除。",
      tone: "neutral"
    });
  }

  function handleExit(): void {
    window.close();
    setStatus({
      message: "如果页面没有关闭，请直接关闭浏览器标签页。",
      tone: "neutral"
    });
  }

  function handleOpenStorySelect(): void {
    setCharacterConcept("");
    setView("story_select");
  }

  function handleEnterGameSetup(): void {
    const selectedRule =
      bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ?? null;
    const selectedStory =
      selectedRule?.stories.find((item) => item.directoryName === storyDirectoryName) ?? null;

    if (!selectedRule || !selectedStory) {
      setStatus({
        message: "请先选择一个可用剧本。",
        tone: "error"
      });
      return;
    }

    setView("game_setup");
  }

  let content: React.ReactNode;

  switch (view) {
    case "story_select":
      content = (
        <StorySelectPage
          bootstrap={bootstrap}
          ruleDirectoryName={ruleDirectoryName}
          storyDirectoryName={storyDirectoryName}
          onBack={() => setView("menu")}
          onClose={() => setView("menu")}
          onRuleChange={setRuleDirectoryName}
          onStoryChange={setStoryDirectoryName}
          onContinue={handleEnterGameSetup}
        />
      );
      break;
    case "game_setup":
      content = (
        <GameSetupPage
          bootstrap={bootstrap}
          ruleDirectoryName={ruleDirectoryName}
          storyDirectoryName={storyDirectoryName}
          locale={locale}
          playMode={playMode}
          gmArchitecture={gmArchitecture}
          modelAccessMode={modelAccessMode}
          modelProfileId={modelProfileId}
          runtimeModelConfig={runtimeModelConfig}
          debugEnabled={debugEnabled}
          logViewMode={logViewMode}
          characterConcept={characterConcept}
          isCreating={isCreating}
          onBack={() => setView("story_select")}
          onClose={() => setView("menu")}
          onSubmit={handleCreateSession}
          onLocaleChange={setLocale}
          onPlayModeChange={setPlayMode}
          onGmArchitectureChange={setGmArchitecture}
          onModelAccessModeChange={setModelAccessMode}
          onModelProfileIdChange={setModelProfileId}
          onRuntimeModelConfigChange={setRuntimeModelConfig}
          onDebugEnabledChange={setDebugEnabled}
          onLogViewModeChange={setLogViewMode}
          onCharacterConceptChange={setCharacterConcept}
        />
      );
      break;
    case "continue":
      content = (
        <ContinuePage
          recentSave={recentSave}
          recentSnapshot={recentSnapshot}
          isRestoring={isRestoring}
          onBack={() => setView("menu")}
          onContinueSavedGame={handleContinueRecentSave}
          onContinueSnapshot={handleContinueRecentSnapshot}
          onClearRecent={handleClearRecent}
          onRemoveRecentSave={handleRemoveRecentSave}
        />
      );
      break;
    case "records":
      content = (
        <RecordsPage
          savedGames={savedGames}
          isRestoring={isRestoring}
          onBack={() => setView("menu")}
          onClearSavedGames={handleClearSavedGames}
          onDeleteSavedGame={handleDeleteSavedGame}
          onLoadSavedGame={handleLoadSavedGame}
        />
      );
      break;
    case "settings":
      content = (
        <SettingsPage
          bootstrap={bootstrap}
          locale={locale}
          playMode={playMode}
          gmArchitecture={gmArchitecture}
          modelAccessMode={modelAccessMode}
          modelProfileId={modelProfileId}
          runtimeModelConfig={runtimeModelConfig}
          debugEnabled={debugEnabled}
          logViewMode={logViewMode}
          onBack={() => setView("menu")}
          onSubmit={handleSaveSettings}
          onReset={handleResetSettings}
          onLocaleChange={setLocale}
          onPlayModeChange={setPlayMode}
          onGmArchitectureChange={setGmArchitecture}
          onModelAccessModeChange={setModelAccessMode}
          onModelProfileIdChange={setModelProfileId}
          onRuntimeModelConfigChange={setRuntimeModelConfig}
          onDebugEnabledChange={setDebugEnabled}
          onLogViewModeChange={setLogViewMode}
        />
      );
      break;
    case "exit":
      content = (
        <ExitPage
          onBack={() => setView("menu")}
          onExit={handleExit}
          onClearRecent={handleClearRecent}
          onClearRecords={handleClearSavedGames}
        />
      );
      break;
    case "game":
      content = (
        <GamePage
          snapshot={snapshot}
          activeGraphBundle={activeGraphBundle}
          turnInput={turnInput}
          isSubmittingTurn={isSubmittingTurn}
          isSaving={isSaving}
          isResumingBranch={isResumingBranch}
          onBack={() => setView("menu")}
          onContinueFromNode={handleContinueFromNode}
          onQuickEndingTest={handleQuickEndingTest}
          onSaveGame={handleSaveGame}
          onTurnInputChange={setTurnInput}
          onSubmitTurn={handleSubmitTurn}
        />
      );
      break;
    case "menu":
    default:
      content = (
        <MenuPage
          recentSnapshot={recentSnapshot}
          locale={locale}
          playMode={playMode}
          gmArchitecture={gmArchitecture}
          modelAccessMode={modelAccessMode}
          modelProfileId={modelProfileId}
          onOpenNewGame={handleOpenStorySelect}
          onOpenContinue={() => setView("continue")}
          onOpenRecords={() => setView("records")}
          onOpenSettings={() => setView("settings")}
          onOpenExit={() => setView("exit")}
        />
      );
      break;
  }

  return (
    <main className="app-shell">
      {content}
      {status.message ? (
        <p className={`status-line ${status.tone === "error" ? "status-error" : ""}`}>
          {status.message}
        </p>
      ) : null}
    </main>
  );
}
