import { useState } from "react";

import type {
  BootstrapResponse,
  CreateSessionRequest,
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

function hasProfileOverride(runtimeModelConfig: RuntimeModelConfigInput): boolean {
  return Boolean(
    runtimeModelConfig.apiKey?.trim() ||
      runtimeModelConfig.baseUrl?.trim() ||
      runtimeModelConfig.model?.trim()
  );
}

function getEffectiveRuntimeConfig(
  profile: BootstrapResponse["modelProfiles"][number],
  runtimeModelConfig: RuntimeModelConfigInput | undefined
): RuntimeModelConfigInput {
  return {
    apiKey: runtimeModelConfig?.apiKey?.trim() || "",
    baseUrl: runtimeModelConfig?.baseUrl?.trim() || "",
    model: runtimeModelConfig?.model?.trim() || ""
  };
}

function resolveProfileModel(
  profile: BootstrapResponse["modelProfiles"][number],
  runtimeModelConfig: RuntimeModelConfigInput
): string {
  return runtimeModelConfig.model || profile.baseModel || "未设置";
}

function resolveProfileBaseUrl(
  profile: BootstrapResponse["modelProfiles"][number],
  runtimeModelConfig: RuntimeModelConfigInput
): string {
  if (profile.accessMode === "mock") {
    return "本地 mock，无需 Base URL";
  }

  return runtimeModelConfig.baseUrl || profile.baseUrl || "未设置";
}

function resolveApiKeyStatus(
  profile: BootstrapResponse["modelProfiles"][number],
  runtimeModelConfig: RuntimeModelConfigInput
): string {
  if (profile.accessMode === "mock") {
    return "不需要";
  }

  if (runtimeModelConfig.apiKey) {
    return "已填写本地覆盖";
  }

  return profile.configured ? "已配置" : "未配置";
}

function resolveOpeningTransport(
  profile: BootstrapResponse["modelProfiles"][number]
): string {
  const fileUploadFeature = profile.featureDetails.find(
    (feature) => feature.key === "file_upload"
  );

  return fileUploadFeature?.supported
    ? "Beginning：rule / story 走文件上传，prompt_beginning 走文本。"
    : "Beginning：rule / story 与 prompt_beginning 都走纯文本。";
}

function resolveProfileStatus(
  profile: BootstrapResponse["modelProfiles"][number],
  runtimeModelConfig: RuntimeModelConfigInput
): string {
  if (profile.accessMode === "mock") {
    return "内置可用";
  }

  if (runtimeModelConfig.apiKey || runtimeModelConfig.baseUrl || runtimeModelConfig.model) {
    return "已填写本地覆盖";
  }

  return profile.configured ? "已配置" : "未配置";
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
    onDebugEnabledChange,
    onShowAiMetadataChange,
    onMenuFontSizeChange,
    onLogViewModeChange
  } = props;

  const allProfiles = bootstrap?.modelProfiles ?? [];
  const selectedProfile =
    allProfiles.find((item) => item.id === modelProfileId) ?? allProfiles[0] ?? null;
  const [isModelManagerOpen, setIsModelManagerOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState(modelProfileId);

  const editingProfile =
    allProfiles.find((item) => item.id === editingProfileId) ?? selectedProfile ?? null;
  const editingProfileRuntimeConfig = editingProfile
    ? getEffectiveRuntimeConfig(
        editingProfile,
        profileRuntimeConfigs[editingProfile.id] ??
          (editingProfile.id === modelProfileId ? runtimeModelConfig : EMPTY_RUNTIME_MODEL_CONFIG)
      )
    : EMPTY_RUNTIME_MODEL_CONFIG;
  const configuredProfilesCount = allProfiles.filter((profile) => {
    const profileRuntimeConfig = getEffectiveRuntimeConfig(
      profile,
      profileRuntimeConfigs[profile.id] ??
        (profile.id === modelProfileId ? runtimeModelConfig : EMPTY_RUNTIME_MODEL_CONFIG)
    );

    return profile.configured || profile.accessMode === "mock" || hasProfileOverride(profileRuntimeConfig);
  }).length;

  function handleOpenModelManager(): void {
    setEditingProfileId(selectedProfile?.id ?? allProfiles[0]?.id ?? "");
    setIsModelManagerOpen(true);
  }

  function handleSetProfileAsDefault(profile: BootstrapResponse["modelProfiles"][number]): void {
    onModelAccessModeChange(profile.accessMode);
    onModelProfileIdChange(profile.id);
  }

  function updateEditingProfileRuntimeConfig(patch: Partial<RuntimeModelConfigInput>): void {
    if (!editingProfile) {
      return;
    }

    onProfileRuntimeConfigChange(editingProfile.id, {
      ...editingProfileRuntimeConfig,
      ...patch
    });
  }

  return (
    <section className="panel page-panel">
      <ScreenHeader
        title="设置"
        description="这里保存的是默认值，之后开始新游戏时会自动带入。"
        onBack={onBack}
      />

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
              {allProfiles
                .filter((profile) => profile.accessMode === modelAccessMode)
                .map((profile) => (
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
            <div className="field-hint">控制主菜单和各界面常规 UI 文字的大小。</div>
          </label>
        </div>

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
            <span>
              {showAiMetadata
                ? "显示耗时 / token / 费用信息"
                : "隐藏耗时 / token / 费用信息"}
            </span>
          </label>
        </label>

        <section className="summary-card settings-model-entry">
          <div className="settings-model-entry-head">
            <div>
              <div className="eyebrow">Model Config</div>
              <div className="summary-title">配置模型信息</div>
              <div className="summary-text">
                当前默认：{selectedProfile?.name ?? "未选择模型"} / 已管理 {configuredProfilesCount} /{" "}
                {allProfiles.length} 个模型档案
              </div>
            </div>

            <button className="ghost-button" onClick={handleOpenModelManager} type="button">
              查看
            </button>
          </div>

          <div className="settings-model-entry-grid">
            <div className="summary-text">
              当前模型：{selectedProfile ? resolveProfileModel(selectedProfile, runtimeModelConfig) : "未设置"}
            </div>
            <div className="summary-text">
              API Key：{selectedProfile ? resolveApiKeyStatus(selectedProfile, runtimeModelConfig) : "未设置"}
            </div>
            <div className="summary-text">
              文件输入：{selectedProfile?.featureDetails.find((feature) => feature.key === "file_upload")?.supported ? "支持" : "不支持"}
            </div>
            <div className="summary-text">
              深度思考：{selectedProfile?.featureDetails.find((feature) => feature.key === "deep_think")?.supported ? "支持" : "不支持"}
            </div>
          </div>
        </section>

        <div className="button-row">
          <button className="primary-button" type="submit">
            保存设置
          </button>
          <button className="ghost-button" onClick={onReset} type="button">
            恢复默认
          </button>
        </div>
      </form>

      {isModelManagerOpen && editingProfile ? (
        <div
          className="settings-model-modal-backdrop"
          onClick={() => setIsModelManagerOpen(false)}
        >
          <div
            className="settings-model-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-model-modal-header">
              <div>
                <div className="eyebrow">Model Config</div>
                <h2>配置模型信息</h2>
                <div className="summary-text">
                  在这里查看模型能力，并为未配置或已配置的模型填写本地覆盖参数。
                </div>
              </div>

              <button
                className="ghost-button"
                onClick={() => setIsModelManagerOpen(false)}
                type="button"
              >
                关闭
              </button>
            </div>

            <div className="settings-model-modal-body">
              <aside className="settings-model-sidebar">
                <div className="settings-model-sidebar-title">模型列表</div>
                <div className="settings-model-list">
                  {allProfiles.map((profile) => {
                    const profileRuntimeConfig = getEffectiveRuntimeConfig(
                      profile,
                      profileRuntimeConfigs[profile.id] ??
                        (profile.id === modelProfileId
                          ? runtimeModelConfig
                          : EMPTY_RUNTIME_MODEL_CONFIG)
                    );

                    return (
                      <button
                        className={`settings-model-list-item ${
                          profile.id === editingProfile.id
                            ? "settings-model-list-item-active"
                            : ""
                        }`}
                        key={profile.id}
                        onClick={() => setEditingProfileId(profile.id)}
                        type="button"
                      >
                        <div className="settings-model-list-item-top">
                          <span className="summary-title">{profile.name}</span>
                          <span className="flag-chip">
                            {profile.id === modelProfileId ? "当前默认" : resolveProfileStatus(profile, profileRuntimeConfig)}
                          </span>
                        </div>
                        <div className="summary-text">
                          {profile.accessMode} / {profile.dependence}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="settings-model-detail">
                <article className="summary-card settings-model-card">
                  <div className="settings-model-card-top">
                    <div>
                      <div className="summary-title">{editingProfile.name}</div>
                      <div className="summary-text">
                        {editingProfile.accessMode} / {editingProfile.dependence}
                      </div>
                    </div>

                    <div className="flag-list">
                      {editingProfile.id === modelProfileId ? (
                        <span className="flag-chip">当前默认</span>
                      ) : (
                        <button
                          className="ghost-button ghost-button-small"
                          onClick={() => handleSetProfileAsDefault(editingProfile)}
                          type="button"
                        >
                          设为默认
                        </button>
                      )}
                      <span className="flag-chip">
                        {resolveProfileStatus(editingProfile, editingProfileRuntimeConfig)}
                      </span>
                    </div>
                  </div>

                  <div className="settings-model-meta">
                    <div className="summary-text">
                      模型：{resolveProfileModel(editingProfile, editingProfileRuntimeConfig)}
                    </div>
                    <div className="summary-text">
                      Base URL：{resolveProfileBaseUrl(editingProfile, editingProfileRuntimeConfig)}
                    </div>
                    <div className="summary-text">
                      API Key：{resolveApiKeyStatus(editingProfile, editingProfileRuntimeConfig)}
                    </div>
                    <div className="summary-text">{resolveOpeningTransport(editingProfile)}</div>
                    <div className="summary-text">{editingProfile.message}</div>
                    {editingProfile.missingEnvKeys.length ? (
                      <div className="summary-text">
                        缺少环境变量：{editingProfile.missingEnvKeys.join("、")}
                      </div>
                    ) : null}
                  </div>
                </article>

                <article className="summary-card settings-model-editor">
                  <div className="selection-column-header">
                    <div>
                      <div className="eyebrow">Overrides</div>
                      <div className="summary-title">本地覆盖参数</div>
                    </div>
                  </div>

                  {editingProfile.accessMode === "mock" ? (
                    <div className="hint-text">
                      Mock Local 是内置模型，不需要额外配置 API Key、Base URL 或模型名。
                    </div>
                  ) : (
                    <div className="settings-model-editor-grid">
                      <label className="field">
                        <span>API Key 覆盖</span>
                        <input
                          autoComplete="new-password"
                          className="text-input"
                          type="password"
                          placeholder="留空则读取本地 .env"
                          value={editingProfileRuntimeConfig.apiKey}
                          onChange={(event) =>
                            updateEditingProfileRuntimeConfig({
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
                          placeholder={editingProfile.baseModel ?? "留空则使用档案默认模型"}
                          value={editingProfileRuntimeConfig.model}
                          onChange={(event) =>
                            updateEditingProfileRuntimeConfig({
                              model: event.target.value
                            })
                          }
                        />
                      </label>

                      <label className="field settings-model-editor-field-full">
                        <span>Base URL 覆盖</span>
                        <input
                          className="text-input"
                          type="text"
                          placeholder={editingProfile.baseUrl ?? "留空则使用档案默认 Base URL"}
                          value={editingProfileRuntimeConfig.baseUrl}
                          onChange={(event) =>
                            updateEditingProfileRuntimeConfig({
                              baseUrl: event.target.value
                            })
                          }
                        />
                      </label>

                      <div className="settings-model-editor-actions">
                        <button
                          className="ghost-button"
                          onClick={() =>
                            onProfileRuntimeConfigChange(editingProfile.id, EMPTY_RUNTIME_MODEL_CONFIG)
                          }
                          type="button"
                        >
                          清空此模型覆盖
                        </button>
                      </div>

                      <div className="hint-text settings-model-editor-field-full">
                        这里保存的是浏览器本地覆盖参数。留空时，后端会回退到
                        `version 3.0/.env` 或模型档案中的默认配置。
                      </div>
                    </div>
                  )}
                </article>

                <article className="summary-card settings-model-card">
                  <div className="selection-column-header">
                    <div>
                      <div className="eyebrow">Capabilities</div>
                      <div className="summary-title">模型能力</div>
                    </div>
                  </div>

                  <div className="model-capability-list">
                    {editingProfile.featureDetails.map((feature) => (
                      <div
                        className={`model-capability-item ${
                          feature.supported
                            ? "model-capability-item-supported"
                            : "model-capability-item-unsupported"
                        }`}
                        key={`${editingProfile.id}:${feature.key}`}
                      >
                        <div className="model-capability-row">
                          <span className="model-capability-label">{feature.label}</span>
                          <span className="model-capability-state">
                            {feature.supported ? "支持" : "不支持"}
                          </span>
                        </div>
                        <div className="model-capability-meta">
                          {feature.model ? `参考模型：${feature.model}` : "未标注具体模型"}
                          {feature.url ? (
                            <>
                              {" · "}
                              <a href={feature.url} rel="noreferrer" target="_blank">
                                官方说明
                              </a>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
