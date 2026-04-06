import { useState } from "react";

import type { SessionSnapshot } from "../../../packages/shared-types/src/index.ts";
import { createSession, fetchSession, submitTurn } from "./lib/trpgApiClient.ts";
import { useBootstrapState } from "./hooks/useBootstrapState.ts";
import { useStoredProgress } from "./hooks/useStoredProgress.ts";
import { ContinuePage } from "./pages/ContinuePage.tsx";
import { ExitPage } from "./pages/ExitPage.tsx";
import { GamePage } from "./pages/GamePage.tsx";
import { MenuPage } from "./pages/MenuPage.tsx";
import { NewGamePage } from "./pages/NewGamePage.tsx";
import { RecordsPage } from "./pages/RecordsPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { storeWebDefaults, type SessionRecord } from "./storage.ts";
import { type AppView, type StatusState } from "./ui.ts";

const initialStatus: StatusState = {
  message: "正在加载启动信息...",
  tone: "neutral"
};

export function App() {
  const [view, setView] = useState<AppView>("menu");
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [status, setStatus] = useState<StatusState>(initialStatus);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [turnInput, setTurnInput] = useState("");

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
    records,
    commitSnapshot: persistStoredSnapshot,
    clearRecent,
    clearRecordsList
  } = useStoredProgress();

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

  async function handleCreateSession(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();

    const selectedRule =
      bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ?? null;

    if (!bootstrap || !selectedRule || !storyDirectoryName) {
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
      setTurnInput("");
      setView("game");
      setStatus({
        message: "会话创建成功。",
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

    setIsSubmittingTurn(true);
    setStatus({
      message: "正在提交本轮行动...",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await submitTurn(snapshot.session.id, {
        playerInput: trimmedInput
      });
      commitSnapshot(nextSnapshot);
      setTurnInput("");
      setStatus({
        message: "本轮处理完成。",
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

  async function handleContinueRecent(): Promise<void> {
    if (!recentSnapshot) {
      setStatus({
        message: "本地还没有最近进度。",
        tone: "error"
      });
      return;
    }

    setIsRestoring(true);
    setStatus({
      message: "正在恢复最近进度...",
      tone: "neutral"
    });

    try {
      const nextSnapshot = await fetchSession(recentSnapshot.session.id);
      commitSnapshot(nextSnapshot);
      setView("game");
      setStatus({
        message: "已从服务端同步最近会话。",
        tone: "neutral"
      });
    } catch {
      commitSnapshot(recentSnapshot);
      setView("game");
      setStatus({
        message: "服务端未找到会话，已改用本地快照打开。",
        tone: "neutral"
      });
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleOpenRecord(record: SessionRecord): Promise<void> {
    setIsRestoring(true);

    try {
      const nextSnapshot = await fetchSession(record.sessionId);
      commitSnapshot(nextSnapshot);
      setView("game");
      setStatus({
        message: `已载入会话 ${record.sessionId}。`,
        tone: "neutral"
      });
    } catch (error) {
      setStatus({
        message:
          error instanceof Error
            ? `无法载入记录：${error.message}`
            : String(error),
        tone: "error"
      });
    } finally {
      setIsRestoring(false);
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
      message: "最近进度已清除。",
      tone: "neutral"
    });
  }

  function handleClearRecords(): void {
    clearRecordsList();
    setStatus({
      message: "本地战绩摘要已清空。",
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

  let content: React.ReactNode;

  switch (view) {
    case "new":
      content = (
        <NewGamePage
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
          isCreating={isCreating}
          onBack={() => setView("menu")}
          onSubmit={handleCreateSession}
          onRuleChange={setRuleDirectoryName}
          onStoryChange={setStoryDirectoryName}
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
    case "continue":
      content = (
        <ContinuePage
          recentSnapshot={recentSnapshot}
          isRestoring={isRestoring}
          onBack={() => setView("menu")}
          onContinue={handleContinueRecent}
          onClearRecent={handleClearRecent}
        />
      );
      break;
    case "records":
      content = (
        <RecordsPage
          records={records}
          isRestoring={isRestoring}
          onBack={() => setView("menu")}
          onClearRecords={handleClearRecords}
          onOpenRecord={handleOpenRecord}
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
          onClearRecords={handleClearRecords}
        />
      );
      break;
    case "game":
      content = (
        <GamePage
          snapshot={snapshot}
          turnInput={turnInput}
          isSubmittingTurn={isSubmittingTurn}
          onBack={() => setView("menu")}
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
          onOpenNewGame={() => setView("new")}
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
      <p className={`status-line ${status.tone === "error" ? "status-error" : ""}`}>
        {status.message}
      </p>
    </main>
  );
}
