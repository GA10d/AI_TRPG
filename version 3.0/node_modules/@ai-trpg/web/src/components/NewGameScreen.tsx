import type {
  BootstrapResponse,
  CreateSessionRequest
} from "../../../../packages/shared-types/src/index.ts";
import {
  GM_ARCHITECTURE_OPTIONS,
  LOG_VIEW_OPTIONS,
  PLAY_MODE_OPTIONS
} from "../ui.ts";
import { ScreenHeader } from "./ScreenHeader.tsx";

type NewGameScreenProps = {
  bootstrap: BootstrapResponse | null;
  ruleDirectoryName: string;
  storyDirectoryName: string;
  locale: CreateSessionRequest["locale"];
  playMode: CreateSessionRequest["playMode"];
  gmArchitecture: CreateSessionRequest["gmArchitecture"];
  modelAccessMode: CreateSessionRequest["modelAccessMode"];
  debugEnabled: boolean;
  logViewMode: NonNullable<CreateSessionRequest["logViewMode"]>;
  isCreating: boolean;
  onBack: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onRuleChange: (value: string) => void;
  onStoryChange: (value: string) => void;
  onLocaleChange: (value: CreateSessionRequest["locale"]) => void;
  onPlayModeChange: (value: CreateSessionRequest["playMode"]) => void;
  onGmArchitectureChange: (value: CreateSessionRequest["gmArchitecture"]) => void;
  onModelAccessModeChange: (value: CreateSessionRequest["modelAccessMode"]) => void;
  onDebugEnabledChange: (value: boolean) => void;
  onLogViewModeChange: (
    value: NonNullable<CreateSessionRequest["logViewMode"]>
  ) => void;
};

export function NewGameScreen(props: NewGameScreenProps) {
  const {
    bootstrap,
    ruleDirectoryName,
    storyDirectoryName,
    locale,
    playMode,
    gmArchitecture,
    modelAccessMode,
    debugEnabled,
    logViewMode,
    isCreating,
    onBack,
    onSubmit,
    onRuleChange,
    onStoryChange,
    onLocaleChange,
    onPlayModeChange,
    onGmArchitectureChange,
    onModelAccessModeChange,
    onDebugEnabledChange,
    onLogViewModeChange
  } = props;

  const selectedRule =
    bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ?? null;
  const stories = selectedRule?.stories ?? [];
  const selectedModelMode =
    bootstrap?.modelAccessModes.find((item) => item.code === modelAccessMode) ?? null;
  const isSelectedModeUnavailable = selectedModelMode?.available === false;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="开始游戏"
        description="创建新会话，并进入当前的 mock 假闭环。"
        onBack={onBack}
      />

      {selectedModelMode ? (
        <div
          className={`info-banner ${
            selectedModelMode.available ? "info-banner-success" : "info-banner-warning"
          }`}
        >
          <strong>{selectedModelMode.label}</strong>
          <div>{selectedModelMode.message}</div>
        </div>
      ) : null}

      <form className="form-grid" onSubmit={onSubmit}>
        <div className="grid-two">
          <label className="field">
            <span>规则</span>
            <select value={ruleDirectoryName} onChange={(event) => onRuleChange(event.target.value)}>
              {bootstrap?.catalog.map((rule) => (
                <option key={rule.directoryName} value={rule.directoryName}>
                  {rule.ruleTitle} ({rule.ruleId})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>剧本</span>
            <select value={storyDirectoryName} onChange={(event) => onStoryChange(event.target.value)}>
              {stories.map((story) => (
                <option key={story.directoryName} value={story.directoryName}>
                  {story.title} ({story.storyId})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid-two">
          <label className="field">
            <span>语言</span>
            <select value={locale} onChange={(event) => onLocaleChange(event.target.value as CreateSessionRequest["locale"])}>
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
              onChange={(event) =>
                onModelAccessModeChange(event.target.value as CreateSessionRequest["modelAccessMode"])
              }
            >
              {bootstrap?.modelAccessModes.map((mode) => (
                <option key={mode.code} value={mode.code}>
                  {mode.label} - {mode.description}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid-two">
          <label className="field">
            <span>游戏模式</span>
            <select
              value={playMode}
              onChange={(event) =>
                onPlayModeChange(event.target.value as CreateSessionRequest["playMode"])
              }
            >
              {PLAY_MODE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>主持架构</span>
            <select
              value={gmArchitecture}
              onChange={(event) =>
                onGmArchitectureChange(event.target.value as CreateSessionRequest["gmArchitecture"])
              }
            >
              {GM_ARCHITECTURE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid-two">
          <label className="field">
            <span>日志显示</span>
            <select
              value={logViewMode}
              onChange={(event) =>
                onLogViewModeChange(
                  event.target.value as NonNullable<CreateSessionRequest["logViewMode"]>
                )
              }
            >
              {LOG_VIEW_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field checkbox-field">
            <span>调试开关</span>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={debugEnabled}
                onChange={(event) => onDebugEnabledChange(event.target.checked)}
              />
              <span>开启调试日志</span>
            </label>
          </label>
        </div>

        <button
          className="primary-button"
          disabled={isCreating || isSelectedModeUnavailable}
          type="submit"
        >
          {isSelectedModeUnavailable
            ? "当前模型模式不可用"
            : isCreating
              ? "创建中..."
              : "创建会话"}
        </button>
      </form>
    </section>
  );
}
