import type {
  BootstrapResponse,
  CreateSessionRequest,
  ImagePromptTemplateConfig,
  RuntimeImageModelConfigInput,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import {
  GM_ARCHITECTURE_OPTIONS,
  LOG_VIEW_OPTIONS,
  MENU_FONT_SIZE_OPTIONS,
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
  profileRuntimeConfigs: Record<string, RuntimeModelConfigInput>;
  imageProfileId: string;
  runtimeImageModelConfig: RuntimeImageModelConfigInput;
  imageProfileRuntimeConfigs: Record<string, RuntimeImageModelConfigInput>;
  imagePromptTemplateConfig: ImagePromptTemplateConfig | null;
  debugEnabled: boolean;
  logViewMode: NonNullable<CreateSessionRequest["logViewMode"]>;
  showAiMetadata: boolean;
  menuFontSize: import("../ui.ts").MenuFontSizePreset;
  onBack: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onLocaleChange: (value: CreateSessionRequest["locale"]) => void;
  onPlayModeChange: (value: CreateSessionRequest["playMode"]) => void;
  onGmArchitectureChange: (value: CreateSessionRequest["gmArchitecture"]) => void;
  onModelAccessModeChange: (value: CreateSessionRequest["modelAccessMode"]) => void;
  onModelProfileIdChange: (value: string) => void;
  onProfileRuntimeConfigChange: (profileId: string, value: RuntimeModelConfigInput) => void;
  onImageProfileIdChange: (value: string) => void;
  onImageProfileRuntimeConfigChange: (
    profileId: string,
    value: RuntimeImageModelConfigInput
  ) => void;
  onImagePromptTemplateConfigChange: (value: ImagePromptTemplateConfig) => void;
  onDebugEnabledChange: (value: boolean) => void;
  onShowAiMetadataChange: (value: boolean) => void;
  onMenuFontSizeChange: (value: import("../ui.ts").MenuFontSizePreset) => void;
  onLogViewModeChange: (
    value: NonNullable<CreateSessionRequest["logViewMode"]>
  ) => void;
};

const EMPTY_RUNTIME_MODEL_CONFIG: RuntimeModelConfigInput = {
  apiKey: "",
  baseUrl: "",
  model: ""
};

const EMPTY_RUNTIME_IMAGE_MODEL_CONFIG: RuntimeImageModelConfigInput = {
  apiKey: "",
  baseUrl: "",
  model: ""
};

const IMAGE_TRIGGER_OPTIONS = [
  { value: "manual", label: "手动生成" },
  { value: "character_portrait", label: "角色立绘" },
  { value: "npc_intro", label: "NPC 展示" },
  { value: "scene_shift", label: "场景切换" }
] as const;

function getEffectiveRuntimeConfig(
  runtimeModelConfig: RuntimeModelConfigInput | RuntimeImageModelConfigInput | undefined
): RuntimeModelConfigInput {
  return {
    apiKey: runtimeModelConfig?.apiKey?.trim() || "",
    baseUrl: runtimeModelConfig?.baseUrl?.trim() || "",
    model: runtimeModelConfig?.model?.trim() || ""
  };
}

function resolveConfigStatus(
  configured: boolean,
  runtimeConfig: RuntimeModelConfigInput,
  isMock = false
): string {
  if (isMock) {
    return "内置可用";
  }

  if (runtimeConfig.apiKey || runtimeConfig.baseUrl || runtimeConfig.model) {
    return "已填写本地覆盖";
  }

  return configured ? "已配置" : "未配置";
}

export function SettingsScreen(props: SettingsScreenProps) {
  const {
    bootstrap,
    locale,
    playMode,
    gmArchitecture,
    modelAccessMode,
    modelProfileId,
    runtimeModelConfig,
    profileRuntimeConfigs,
    imageProfileId,
    runtimeImageModelConfig,
    imageProfileRuntimeConfigs,
    imagePromptTemplateConfig,
    debugEnabled,
    logViewMode,
    showAiMetadata,
    menuFontSize,
    onBack,
    onSubmit,
    onReset,
    onLocaleChange,
    onPlayModeChange,
    onGmArchitectureChange,
    onModelAccessModeChange,
    onModelProfileIdChange,
    onProfileRuntimeConfigChange,
    onImageProfileIdChange,
    onImageProfileRuntimeConfigChange,
    onImagePromptTemplateConfigChange,
    onDebugEnabledChange,
    onShowAiMetadataChange,
    onMenuFontSizeChange,
    onLogViewModeChange
  } = props;

  const selectedTextProfile =
    bootstrap?.modelProfiles.find((item) => item.id === modelProfileId) ?? null;
  const selectedImageProfile =
    bootstrap?.imageProfiles.find((item) => item.id === imageProfileId) ?? null;
  const effectiveTextRuntimeConfig = getEffectiveRuntimeConfig(
    profileRuntimeConfigs[modelProfileId] ?? runtimeModelConfig
  );
  const effectiveImageRuntimeConfig = getEffectiveRuntimeConfig(
    imageProfileRuntimeConfigs[imageProfileId] ?? runtimeImageModelConfig
  );
  const resolvedImagePromptTemplateConfig =
    imagePromptTemplateConfig ?? bootstrap?.imagePromptTemplateConfig ?? null;

  function updateTextRuntimeConfig(patch: Partial<RuntimeModelConfigInput>): void {
    if (!selectedTextProfile) {
      return;
    }

    onProfileRuntimeConfigChange(selectedTextProfile.id, {
      ...effectiveTextRuntimeConfig,
      ...patch
    });
  }

  function updateImageRuntimeConfig(patch: Partial<RuntimeImageModelConfigInput>): void {
    if (!selectedImageProfile) {
      return;
    }

    onImageProfileRuntimeConfigChange(selectedImageProfile.id, {
      ...effectiveImageRuntimeConfig,
      ...patch
    });
  }

  function updateImagePromptConfig(
    patch: Partial<ImagePromptTemplateConfig>
  ): void {
    if (!resolvedImagePromptTemplateConfig) {
      return;
    }

    onImagePromptTemplateConfigChange({
      ...resolvedImagePromptTemplateConfig,
      ...patch
    });
  }

  function updateThemeStyle(themeKey: string, value: string): void {
    if (!resolvedImagePromptTemplateConfig) {
      return;
    }

    updateImagePromptConfig({
      themes: {
        ...resolvedImagePromptTemplateConfig.themes,
        [themeKey]: value
      }
    });
  }

  function updateTriggerTemplate(
    trigger: keyof ImagePromptTemplateConfig["triggerTemplates"],
    value: string
  ): void {
    if (!resolvedImagePromptTemplateConfig) {
      return;
    }

    updateImagePromptConfig({
      triggerTemplates: {
        ...resolvedImagePromptTemplateConfig.triggerTemplates,
        [trigger]: value
      }
    });
  }

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="设置"
        description="这里保存的是默认值。文本模型、图片模型和文生图模板都会在后续新游戏中自动带入。"
        onBack={onBack}
      />

      <form className="form-grid" onSubmit={onSubmit}>
        <section className="summary-card">
          <div className="selection-column-header">
            <div>
              <div className="eyebrow">General</div>
              <div className="summary-title">基础偏好</div>
            </div>
          </div>

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

          <div className="grid-two">
            <label className="field">
              <span>菜单字号</span>
              <select
                value={menuFontSize}
                onChange={(event) =>
                  onMenuFontSizeChange(
                    event.target.value as import("../ui.ts").MenuFontSizePreset
                  )
                }
              >
                {MENU_FONT_SIZE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="summary-card">
              <div className="field checkbox-field">
                <span>调试选项</span>
                <label className="toggle-row">
                  <input
                    checked={debugEnabled}
                    onChange={(event) => onDebugEnabledChange(event.target.checked)}
                    type="checkbox"
                  />
                  <span>默认开启调试信息</span>
                </label>
                <label className="toggle-row">
                  <input
                    checked={showAiMetadata}
                    onChange={(event) => onShowAiMetadataChange(event.target.checked)}
                    type="checkbox"
                  />
                  <span>显示 AI 耗时、Token 与费用</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="summary-card">
          <div className="selection-column-header">
            <div>
              <div className="eyebrow">Text Model</div>
              <div className="summary-title">文本模型配置</div>
              <div className="summary-text">
                当前默认：
                {selectedTextProfile?.name ?? "未选择"} /{" "}
                {selectedTextProfile
                  ? resolveConfigStatus(
                      selectedTextProfile.configured,
                      effectiveTextRuntimeConfig,
                      selectedTextProfile.accessMode === "mock"
                    )
                  : "未配置"}
              </div>
            </div>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>模型接入模式</span>
              <select
                value={modelAccessMode}
                onChange={(event) =>
                  onModelAccessModeChange(event.target.value as CreateSessionRequest["modelAccessMode"])
                }
              >
                {bootstrap?.modelAccessModes.map((mode) => (
                  <option key={mode.code} value={mode.code}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>默认文本模型档案</span>
              <select
                value={modelProfileId}
                onChange={(event) => onModelProfileIdChange(event.target.value)}
              >
                {bootstrap?.modelProfiles
                  .filter((profile) => profile.accessMode === modelAccessMode)
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>API Key 覆盖</span>
              <input
                autoComplete="new-password"
                className="text-input"
                placeholder="留空则读取本地 .env"
                type="password"
                value={effectiveTextRuntimeConfig.apiKey}
                onChange={(event) =>
                  updateTextRuntimeConfig({
                    apiKey: event.target.value
                  })
                }
              />
            </label>

            <label className="field">
              <span>模型名覆盖</span>
              <input
                className="text-input"
                placeholder={selectedTextProfile?.baseModel ?? "留空使用默认模型"}
                type="text"
                value={effectiveTextRuntimeConfig.model}
                onChange={(event) =>
                  updateTextRuntimeConfig({
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
              placeholder={selectedTextProfile?.baseUrl ?? "留空使用默认 Base URL"}
              type="text"
              value={effectiveTextRuntimeConfig.baseUrl}
              onChange={(event) =>
                updateTextRuntimeConfig({
                  baseUrl: event.target.value
                })
              }
            />
          </label>

          <div className="button-row">
            <button
              className="ghost-button"
              onClick={() =>
                selectedTextProfile
                  ? onProfileRuntimeConfigChange(selectedTextProfile.id, EMPTY_RUNTIME_MODEL_CONFIG)
                  : undefined
              }
              type="button"
            >
              清空当前文本模型覆盖
            </button>
          </div>

          {selectedTextProfile ? (
            <div className="model-capability-list">
              {selectedTextProfile.featureDetails.map((feature) => (
                <div
                  className={`model-capability-item ${
                    feature.supported
                      ? "model-capability-item-supported"
                      : "model-capability-item-unsupported"
                  }`}
                  key={`${selectedTextProfile.id}:${feature.key}`}
                >
                  <div className="model-capability-row">
                    <span className="model-capability-label">{feature.label}</span>
                    <span className="model-capability-state">
                      {feature.supported ? "支持" : "不支持"}
                    </span>
                  </div>
                  <div className="model-capability-meta">
                    {selectedTextProfile.message}
                    {feature.model ? ` / 参考模型：${feature.model}` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="summary-card">
          <div className="selection-column-header">
            <div>
              <div className="eyebrow">Image Model</div>
              <div className="summary-title">文生图 Provider 配置</div>
              <div className="summary-text">
                当前默认：
                {selectedImageProfile?.name ?? "未选择"} /{" "}
                {selectedImageProfile
                  ? resolveConfigStatus(
                      selectedImageProfile.configured,
                      effectiveImageRuntimeConfig,
                      selectedImageProfile.dependence === "Mock"
                    )
                  : "未配置"}
              </div>
            </div>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>默认图片模型档案</span>
              <select
                value={imageProfileId}
                onChange={(event) => onImageProfileIdChange(event.target.value)}
              >
                {bootstrap?.imageProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>图片模型名覆盖</span>
              <input
                className="text-input"
                placeholder={selectedImageProfile?.baseModel ?? "留空使用默认模型"}
                type="text"
                value={effectiveImageRuntimeConfig.model}
                onChange={(event) =>
                  updateImageRuntimeConfig({
                    model: event.target.value
                  })
                }
              />
            </label>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>图片 API Key 覆盖</span>
              <input
                autoComplete="new-password"
                className="text-input"
                placeholder="留空则读取本地 .env"
                type="password"
                value={effectiveImageRuntimeConfig.apiKey}
                onChange={(event) =>
                  updateImageRuntimeConfig({
                    apiKey: event.target.value
                  })
                }
              />
            </label>

            <label className="field">
              <span>图片 Base URL 覆盖</span>
              <input
                className="text-input"
                placeholder={selectedImageProfile?.baseUrl ?? "留空使用默认 Base URL"}
                type="text"
                value={effectiveImageRuntimeConfig.baseUrl}
                onChange={(event) =>
                  updateImageRuntimeConfig({
                    baseUrl: event.target.value
                  })
                }
              />
            </label>
          </div>

          <div className="button-row">
            <button
              className="ghost-button"
              onClick={() =>
                selectedImageProfile
                  ? onImageProfileRuntimeConfigChange(
                      selectedImageProfile.id,
                      EMPTY_RUNTIME_IMAGE_MODEL_CONFIG
                    )
                  : undefined
              }
              type="button"
            >
              清空当前图片模型覆盖
            </button>
          </div>

          {selectedImageProfile ? (
            <div className="model-capability-list">
              {selectedImageProfile.featureDetails.map((feature) => (
                <div
                  className={`model-capability-item ${
                    feature.supported
                      ? "model-capability-item-supported"
                      : "model-capability-item-unsupported"
                  }`}
                  key={`${selectedImageProfile.id}:${feature.key}`}
                >
                  <div className="model-capability-row">
                    <span className="model-capability-label">{feature.label}</span>
                    <span className="model-capability-state">
                      {feature.supported ? "支持" : "不支持"}
                    </span>
                  </div>
                  <div className="model-capability-meta">
                    {selectedImageProfile.message}
                    {feature.model ? ` / 参考模型：${feature.model}` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {resolvedImagePromptTemplateConfig ? (
          <section className="summary-card">
            <div className="selection-column-header">
              <div>
                <div className="eyebrow">Image Prompt</div>
                <div className="summary-title">文生图模板</div>
                <div className="summary-text">
                  这里配置不同场景下的通用模板，实际生成时会与业务 prompt 自动拼接。
                </div>
              </div>
            </div>

            <div className="grid-two">
              <label className="field">
                <span>默认主题</span>
                <input
                  className="text-input"
                  type="text"
                  value={resolvedImagePromptTemplateConfig.defaultTheme}
                  onChange={(event) =>
                    updateImagePromptConfig({
                      defaultTheme: event.target.value
                    })
                  }
                />
              </label>

              <label className="field">
                <span>默认触发器</span>
                <select
                  value={resolvedImagePromptTemplateConfig.defaultTrigger}
                  onChange={(event) =>
                    updateImagePromptConfig({
                      defaultTrigger:
                        event.target.value as ImagePromptTemplateConfig["defaultTrigger"]
                    })
                  }
                >
                  {IMAGE_TRIGGER_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>兜底模板</span>
              <textarea
                rows={4}
                value={resolvedImagePromptTemplateConfig.fallbackTriggerTemplate}
                onChange={(event) =>
                  updateImagePromptConfig({
                    fallbackTriggerTemplate: event.target.value
                  })
                }
              />
            </label>

            <div className="grid-two">
              {Object.entries(resolvedImagePromptTemplateConfig.themes).map(([themeKey, themeStyle]) => (
                <label className="field" key={themeKey}>
                  <span>主题样式: {themeKey}</span>
                  <textarea
                    rows={4}
                    value={themeStyle}
                    onChange={(event) => updateThemeStyle(themeKey, event.target.value)}
                  />
                </label>
              ))}
            </div>

            <div className="grid-two">
              {Object.entries(resolvedImagePromptTemplateConfig.triggerTemplates).map(
                ([triggerKey, templateValue]) => (
                  <label className="field" key={triggerKey}>
                    <span>触发器模板: {triggerKey}</span>
                    <textarea
                      rows={5}
                      value={templateValue}
                      onChange={(event) =>
                        updateTriggerTemplate(
                          triggerKey as keyof ImagePromptTemplateConfig["triggerTemplates"],
                          event.target.value
                        )
                      }
                    />
                  </label>
                )
              )}
            </div>

            <div className="grid-two">
              <label className="field">
                <span>角色拼接模板</span>
                <textarea
                  rows={4}
                  value={resolvedImagePromptTemplateConfig.characterClauseTemplate}
                  onChange={(event) =>
                    updateImagePromptConfig({
                      characterClauseTemplate: event.target.value
                    })
                  }
                />
              </label>

              <label className="field">
                <span>角色条目模板</span>
                <textarea
                  rows={4}
                  value={resolvedImagePromptTemplateConfig.characterEntryTemplate}
                  onChange={(event) =>
                    updateImagePromptConfig({
                      characterEntryTemplate: event.target.value
                    })
                  }
                />
              </label>
            </div>

            <label className="field">
              <span>角色连接符</span>
              <input
                className="text-input"
                type="text"
                value={resolvedImagePromptTemplateConfig.characterJoinSeparator}
                onChange={(event) =>
                  updateImagePromptConfig({
                    characterJoinSeparator: event.target.value
                  })
                }
              />
            </label>
          </section>
        ) : null}

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
