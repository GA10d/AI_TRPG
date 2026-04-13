import type {
  BootstrapResponse,
  CreateSessionRequest,
  ImagePromptTemplateConfig,
  RuntimeImageModelConfigInput,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import {
  getFrontendThemeOptions,
  getGmArchitectureOptions,
  getLogViewOptions,
  getMenuFontSizeOptions,
  getPlayModeOptions
} from "../ui.ts";
import { useUiText, type UiText } from "../locales/index.tsx";
import { ScreenHeader } from "./ScreenHeader.tsx";
import type { FrontendThemePreset } from "../themePresets.ts";

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
  frontendTheme: FrontendThemePreset;
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
  onFrontendThemeChange: (value: FrontendThemePreset) => void;
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
  text: UiText["settingsScreen"],
  isMock = false
): string {
  if (isMock) {
    return text.configStatusBuiltIn;
  }

  if (runtimeConfig.apiKey || runtimeConfig.baseUrl || runtimeConfig.model) {
    return text.configStatusLocalOverride;
  }

  return configured ? text.configStatusConfigured : text.configStatusMissing;
}

export function SettingsScreen(props: SettingsScreenProps) {
  const text = useUiText();
  const settingsText = text.settingsScreen;
  const playModeOptions = getPlayModeOptions(text);
  const gmArchitectureOptions = getGmArchitectureOptions(text);
  const logViewOptions = getLogViewOptions(text);
  const menuFontSizeOptions = getMenuFontSizeOptions(text);
  const frontendThemeOptions = getFrontendThemeOptions(text);
  const imageTriggerOptions = [...text.options.imageTriggers];
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
    frontendTheme,
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
    onFrontendThemeChange,
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
        title={settingsText.title}
        description={settingsText.description}
        onBack={onBack}
      />

      <form className="form-grid" onSubmit={onSubmit}>
        <section className="summary-card">
          <div className="selection-column-header">
            <div>
              <div className="eyebrow">{settingsText.generalEyebrow}</div>
              <div className="summary-title">{settingsText.generalTitle}</div>
            </div>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>{settingsText.locale}</span>
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
              <span>{settingsText.playMode}</span>
              <select
                value={playMode}
                onChange={(event) =>
                  onPlayModeChange(event.target.value as CreateSessionRequest["playMode"])
                }
              >
                {playModeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>{settingsText.gmArchitecture}</span>
              <select
                value={gmArchitecture}
                onChange={(event) =>
                  onGmArchitectureChange(event.target.value as CreateSessionRequest["gmArchitecture"])
                }
              >
                {gmArchitectureOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>{settingsText.logViewMode}</span>
              <select
                value={logViewMode}
                onChange={(event) =>
                  onLogViewModeChange(
                    event.target.value as NonNullable<CreateSessionRequest["logViewMode"]>
                  )
                }
              >
                {logViewOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>{settingsText.menuFontSize}</span>
              <select
                value={menuFontSize}
                onChange={(event) =>
                  onMenuFontSizeChange(
                    event.target.value as import("../ui.ts").MenuFontSizePreset
                  )
                }
              >
                {menuFontSizeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>{settingsText.frontendTheme}</span>
              <select
                value={frontendTheme}
                onChange={(event) =>
                  onFrontendThemeChange(event.target.value as FrontendThemePreset)
                }
              >
                {frontendThemeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <div className="field-hint">
                {frontendThemeOptions.find((item) => item.value === frontendTheme)?.description}
              </div>
            </label>

            <div className="summary-card">
              <div className="field checkbox-field">
                <span>{settingsText.debugOptions}</span>
                <label className="toggle-row">
                  <input
                    checked={debugEnabled}
                    onChange={(event) => onDebugEnabledChange(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{settingsText.enableDebug}</span>
                </label>
                <label className="toggle-row">
                  <input
                    checked={showAiMetadata}
                    onChange={(event) => onShowAiMetadataChange(event.target.checked)}
                    type="checkbox"
                  />
                  <span>{settingsText.showAiMetadata}</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="summary-card">
          <div className="selection-column-header">
            <div>
              <div className="eyebrow">{settingsText.textModelEyebrow}</div>
              <div className="summary-title">{settingsText.textModelTitle}</div>
              <div className="summary-text">
                {settingsText.defaultSelectedSummary(
                  selectedTextProfile?.name ?? text.common.none,
                  selectedTextProfile
                    ? resolveConfigStatus(
                        selectedTextProfile.configured,
                        effectiveTextRuntimeConfig,
                        settingsText,
                        selectedTextProfile.accessMode === "mock"
                      )
                    : settingsText.configStatusMissing
                )}
              </div>
            </div>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>{settingsText.modelAccessMode}</span>
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
              <span>{settingsText.textModelProfile}</span>
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
              <span>{settingsText.apiKeyOverride}</span>
              <input
                autoComplete="new-password"
                className="text-input"
                placeholder={settingsText.apiKeyPlaceholder}
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
              <span>{settingsText.modelNameOverride}</span>
              <input
                className="text-input"
                placeholder={selectedTextProfile?.baseModel ?? settingsText.modelPlaceholder}
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
            <span>{settingsText.baseUrlOverride}</span>
            <input
              className="text-input"
              placeholder={selectedTextProfile?.baseUrl ?? settingsText.baseUrlPlaceholder}
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
              {settingsText.clearTextModelOverride}
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
                      {feature.supported ? settingsText.supported : settingsText.unsupported}
                    </span>
                  </div>
                  <div className="model-capability-meta">
                    {selectedTextProfile.message}
                    {feature.model ? settingsText.referenceModel(feature.model) : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="summary-card">
          <div className="selection-column-header">
            <div>
              <div className="eyebrow">{settingsText.imageModelEyebrow}</div>
              <div className="summary-title">{settingsText.imageModelTitle}</div>
              <div className="summary-text">
                {settingsText.defaultSelectedSummary(
                  selectedImageProfile?.name ?? text.common.none,
                  selectedImageProfile
                    ? resolveConfigStatus(
                        selectedImageProfile.configured,
                        effectiveImageRuntimeConfig,
                        settingsText,
                        selectedImageProfile.dependence === "Mock"
                      )
                    : settingsText.configStatusMissing
                )}
              </div>
            </div>
          </div>

          <div className="grid-two">
            <label className="field">
              <span>{settingsText.imageModelProfile}</span>
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
              <span>{settingsText.imageModelNameOverride}</span>
              <input
                className="text-input"
                placeholder={selectedImageProfile?.baseModel ?? settingsText.modelPlaceholder}
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
              <span>{settingsText.imageApiKeyOverride}</span>
              <input
                autoComplete="new-password"
                className="text-input"
                placeholder={settingsText.apiKeyPlaceholder}
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
              <span>{settingsText.imageBaseUrlOverride}</span>
              <input
                className="text-input"
                placeholder={selectedImageProfile?.baseUrl ?? settingsText.baseUrlPlaceholder}
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
              {settingsText.clearImageModelOverride}
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
                      {feature.supported ? settingsText.supported : settingsText.unsupported}
                    </span>
                  </div>
                  <div className="model-capability-meta">
                    {selectedImageProfile.message}
                    {feature.model ? settingsText.referenceModel(feature.model) : ""}
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
                <div className="eyebrow">{settingsText.imagePromptEyebrow}</div>
                <div className="summary-title">{settingsText.imagePromptTitle}</div>
                <div className="summary-text">
                  {settingsText.imagePromptDescription}
                </div>
              </div>
            </div>

            <div className="grid-two">
              <label className="field">
                <span>{settingsText.defaultTheme}</span>
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
                <span>{settingsText.defaultTrigger}</span>
                <select
                  value={resolvedImagePromptTemplateConfig.defaultTrigger}
                  onChange={(event) =>
                    updateImagePromptConfig({
                      defaultTrigger:
                        event.target.value as ImagePromptTemplateConfig["defaultTrigger"]
                    })
                  }
                >
                  {imageTriggerOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>{settingsText.fallbackTemplate}</span>
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
                  <span>{settingsText.themeStyle(themeKey)}</span>
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
                    <span>{settingsText.triggerTemplate(triggerKey)}</span>
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
                <span>{settingsText.characterClauseTemplate}</span>
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
                <span>{settingsText.characterEntryTemplate}</span>
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
              <span>{settingsText.characterJoinSeparator}</span>
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
            {settingsText.saveSettings}
          </button>
          <button className="ghost-button" onClick={onReset} type="button">
            {settingsText.resetDefaults}
          </button>
        </div>
      </form>
    </section>
  );
}
