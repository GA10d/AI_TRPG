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

type SettingsScreenProps = {
  bootstrap: BootstrapResponse | null;
  locale: CreateSessionRequest["locale"];
  playMode: CreateSessionRequest["playMode"];
  gmArchitecture: CreateSessionRequest["gmArchitecture"];
  modelAccessMode: CreateSessionRequest["modelAccessMode"];
  debugEnabled: boolean;
  logViewMode: NonNullable<CreateSessionRequest["logViewMode"]>;
  onBack: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onLocaleChange: (value: CreateSessionRequest["locale"]) => void;
  onPlayModeChange: (value: CreateSessionRequest["playMode"]) => void;
  onGmArchitectureChange: (value: CreateSessionRequest["gmArchitecture"]) => void;
  onModelAccessModeChange: (value: CreateSessionRequest["modelAccessMode"]) => void;
  onDebugEnabledChange: (value: boolean) => void;
  onLogViewModeChange: (
    value: NonNullable<CreateSessionRequest["logViewMode"]>
  ) => void;
};

export function SettingsScreen(props: SettingsScreenProps) {
  const {
    bootstrap,
    locale,
    playMode,
    gmArchitecture,
    modelAccessMode,
    debugEnabled,
    logViewMode,
    onBack,
    onSubmit,
    onReset,
    onLocaleChange,
    onPlayModeChange,
    onGmArchitectureChange,
    onModelAccessModeChange,
    onDebugEnabledChange,
    onLogViewModeChange
  } = props;
  const selectedModelMode =
    bootstrap?.modelAccessModes.find((item) => item.code === modelAccessMode) ?? null;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="设置"
        description="保存的是默认值，之后开始新游戏时会自动带入。"
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
            <span>默认语言</span>
            <select value={locale} onChange={(event) => onLocaleChange(event.target.value as CreateSessionRequest["locale"])}>
              {bootstrap?.languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nativeLabel} / {language.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>默认模型模式</span>
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
            <span>默认游戏模式</span>
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
            <span>默认主持架构</span>
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
            <span>默认日志显示</span>
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
              <span>默认开启调试日志</span>
            </label>
          </label>
        </div>

        <div className="button-row">
          <button className="primary-button" type="submit">
            保存设置
          </button>
          <button className="ghost-button" onClick={onReset} type="button">
            恢复默认
          </button>
        </div>
      </form>
    </section>
  );
}
