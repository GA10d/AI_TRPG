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

type NewGameScreenProps = {
  bootstrap: BootstrapResponse | null;
  ruleDirectoryName: string;
  storyDirectoryName: string;
  locale: CreateSessionRequest["locale"];
  playMode: CreateSessionRequest["playMode"];
  gmArchitecture: CreateSessionRequest["gmArchitecture"];
  modelAccessMode: CreateSessionRequest["modelAccessMode"];
  modelProfileId: string;
  runtimeModelConfig: RuntimeModelConfigInput;
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
  onModelProfileIdChange: (value: string) => void;
  onRuntimeModelConfigChange: (value: RuntimeModelConfigInput) => void;
  onDebugEnabledChange: (value: boolean) => void;
  onLogViewModeChange: (
    value: NonNullable<CreateSessionRequest["logViewMode"]>
  ) => void;
};

function isProfileReady(
  accessMode: CreateSessionRequest["modelAccessMode"],
  selectedProfile: BootstrapResponse["modelProfiles"][number] | null,
  runtimeModelConfig: RuntimeModelConfigInput
): boolean {
  if (accessMode === "mock") {
    return true;
  }

  if (!selectedProfile) {
    return false;
  }

  if (selectedProfile.configured) {
    return true;
  }

  const hasApiKey = (runtimeModelConfig.apiKey?.trim() ?? "").length > 0;
  const hasBaseUrl = (runtimeModelConfig.baseUrl?.trim() ?? "").length > 0;
  const hasModel = (runtimeModelConfig.model?.trim() ?? "").length > 0;
  const baseUrlReady =
    !selectedProfile.urlRequirements || hasBaseUrl || Boolean(selectedProfile.baseUrl);
  const modelReady = hasModel || Boolean(selectedProfile.baseModel);

  return hasApiKey && baseUrlReady && modelReady;
}

export function NewGameScreen(props: NewGameScreenProps) {
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
    isCreating,
    onBack,
    onSubmit,
    onRuleChange,
    onStoryChange,
    onLocaleChange,
    onPlayModeChange,
    onGmArchitectureChange,
    onModelAccessModeChange,
    onModelProfileIdChange,
    onRuntimeModelConfigChange,
    onDebugEnabledChange,
    onLogViewModeChange
  } = props;

  const selectedRule =
    bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ?? null;
  const stories = selectedRule?.stories ?? [];
  const selectedModelMode =
    bootstrap?.modelAccessModes.find((item) => item.code === modelAccessMode) ?? null;
  const availableProfiles =
    bootstrap?.modelProfiles.filter((item) => item.accessMode === modelAccessMode) ?? [];
  const selectedProfile =
    availableProfiles.find((item) => item.id === modelProfileId) ?? availableProfiles[0] ?? null;
  const profileReady = isProfileReady(modelAccessMode, selectedProfile, runtimeModelConfig);
  const isSelectedModeUnavailable = modelAccessMode === "server_proxy" && !profileReady;

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="开始游戏"
        description="创建新会话，并进入当前可运行的假闭环。"
        onBack={onBack}
      />

      {selectedModelMode ? (
        <div
          className={`info-banner ${
            isSelectedModeUnavailable ? "info-banner-warning" : "info-banner-success"
          }`}
        >
          <strong>{selectedProfile?.name ?? selectedModelMode.label}</strong>
          <div>{selectedProfile?.message ?? selectedModelMode.message}</div>
          {selectedProfile?.missingEnvKeys.length ? (
            <div>缺少环境变量：{selectedProfile.missingEnvKeys.join("，")}</div>
          ) : null}
          {modelAccessMode === "server_proxy" ? (
            <div>
              留空时会优先读取 `.env`；你也可以在当前页面临时覆盖 API key、模型名和 base
              URL。
            </div>
          ) : null}
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
            <span>模型档案</span>
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
        </div>

        <div className="grid-two">
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
        </div>

        {modelAccessMode === "server_proxy" ? (
          <>
            <div className="grid-two">
              <label className="field">
                <span>API Key 覆盖</span>
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
                <span>模型名覆盖</span>
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
              <span>Base URL 覆盖</span>
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
              这些覆盖值仅保存在当前浏览器本地。提交创建会话时会发送给本地 Node 服务，
              不会显示在普通回放日志里。
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
            <span>开启调试日志</span>
          </label>
        </label>

        <button
          className="primary-button"
          disabled={isCreating || isSelectedModeUnavailable}
          type="submit"
        >
          {isSelectedModeUnavailable
            ? "当前模型配置还不完整"
            : isCreating
              ? "创建中..."
              : "创建会话"}
        </button>
      </form>
    </section>
  );
}
