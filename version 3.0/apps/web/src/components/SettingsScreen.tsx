import type {
  BootstrapResponse,
  CreateSessionRequest,
  RuntimeModelConfigInput
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
  modelProfileId: string;
  runtimeModelConfig: RuntimeModelConfigInput;
  debugEnabled: boolean;
  logViewMode: NonNullable<CreateSessionRequest["logViewMode"]>;
  showAiMetadata: boolean;
  onBack: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onLocaleChange: (value: CreateSessionRequest["locale"]) => void;
  onPlayModeChange: (value: CreateSessionRequest["playMode"]) => void;
  onGmArchitectureChange: (value: CreateSessionRequest["gmArchitecture"]) => void;
  onModelAccessModeChange: (value: CreateSessionRequest["modelAccessMode"]) => void;
  onModelProfileIdChange: (value: string) => void;
  onRuntimeModelConfigChange: (value: RuntimeModelConfigInput) => void;
  onDebugEnabledChange: (value: boolean) => void;
  onShowAiMetadataChange: (value: boolean) => void;
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
    modelProfileId,
    runtimeModelConfig,
    debugEnabled,
    logViewMode,
    showAiMetadata,
    onBack,
    onSubmit,
    onReset,
    onLocaleChange,
    onPlayModeChange,
    onGmArchitectureChange,
    onModelAccessModeChange,
    onModelProfileIdChange,
    onRuntimeModelConfigChange,
    onDebugEnabledChange,
    onShowAiMetadataChange,
    onLogViewModeChange
  } = props;

  const availableProfiles =
    bootstrap?.modelProfiles.filter((item) => item.accessMode === modelAccessMode) ?? [];
  const selectedProfile =
    availableProfiles.find((item) => item.id === modelProfileId) ?? availableProfiles[0] ?? null;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="设置"
        description="这里保存的是默认值，之后开始新游戏时会自动带入。"
        onBack={onBack}
      />

      {selectedProfile ? (
        <div
          className={`info-banner ${
            selectedProfile.configured ? "info-banner-success" : "info-banner-warning"
          }`}
        >
          <strong>{selectedProfile.name}</strong>
          <div>{selectedProfile.message}</div>
          {selectedProfile.missingEnvKeys.length ? (
            <div>缺少环境变量：{selectedProfile.missingEnvKeys.join("，")}</div>
          ) : null}
        </div>
      ) : null}

      <form className="form-grid" onSubmit={onSubmit}>
        <div className="grid-two">
          <label className="field">
            <span>默认语言</span>
            <select
              value={locale}
              onChange={(event) => onLocaleChange(event.target.value as CreateSessionRequest["locale"])}
            >
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
            <span>默认模型档案</span>
            <select
              value={selectedProfile?.id ?? modelProfileId}
              onChange={(event) => onModelProfileIdChange(event.target.value)}
            >
              {availableProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>

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
        </div>

        <div className="grid-two">
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
        </div>

        {modelAccessMode === "server_proxy" ? (
          <>
            <div className="grid-two">
              <label className="field">
                <span>默认 API Key 覆盖</span>
                <input
                  autoComplete="new-password"
                  className="text-input"
                  type="password"
                  placeholder="留空则读取本地 .env"
                  value={runtimeModelConfig.apiKey ?? ""}
                  onChange={(event) =>
                    onRuntimeModelConfigChange({
                      ...runtimeModelConfig,
                      apiKey: event.target.value
                    })
                  }
                />
              </label>

              <label className="field">
                <span>默认模型名覆盖</span>
                <input
                  className="text-input"
                  type="text"
                  placeholder={selectedProfile?.baseModel ?? "留空则使用档案默认模型"}
                  value={runtimeModelConfig.model ?? ""}
                  onChange={(event) =>
                    onRuntimeModelConfigChange({
                      ...runtimeModelConfig,
                      model: event.target.value
                    })
                  }
                />
              </label>
            </div>

            <label className="field">
              <span>默认 Base URL 覆盖</span>
              <input
                className="text-input"
                type="text"
                placeholder={selectedProfile?.baseUrl ?? "留空则使用档案默认 base url"}
                value={runtimeModelConfig.baseUrl ?? ""}
                onChange={(event) =>
                  onRuntimeModelConfigChange({
                    ...runtimeModelConfig,
                    baseUrl: event.target.value
                  })
                }
              />
            </label>

            <div className="hint-text">
              这些值仅保存在当前浏览器本地，适合本机开发。留空时，后端会回退到 `version
              3.0/.env` 里的模型配置。
            </div>
          </>
        ) : null}

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

        <label className="field checkbox-field">
          <span>AI 生成信息</span>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={showAiMetadata}
              onChange={(event) => onShowAiMetadataChange(event.target.checked)}
            />
            <span>{showAiMetadata ? "显示耗时 / token / 费用信息" : "隐藏耗时 / token / 费用信息"}</span>
          </label>
        </label>

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
