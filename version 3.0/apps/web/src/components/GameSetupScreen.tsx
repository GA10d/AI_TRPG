import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";

import type {
  BootstrapResponse,
  CreateSessionRequest,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import {
  buildPreviewLines,
  clipText,
  GM_ARCHITECTURE_OPTIONS,
  LOG_VIEW_OPTIONS,
  PLAY_MODE_OPTIONS,
  renderJoinedList
} from "../ui.ts";
import { ScreenHeader } from "./ScreenHeader.tsx";

type GameSetupScreenProps = {
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
  characterConcept: string;
  isCreating: boolean;
  onBack: () => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
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
  onCharacterConceptChange: (value: string) => void;
};

type DragTarget = "left" | "right" | null;

type SetupLayoutState = {
  leftWidth: number;
  rightWidth: number;
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
};

const SETUP_LAYOUT_STORAGE_KEY = "trpg3.gameSetupLayout";
const LEFT_MIN_WIDTH = 280;
const CENTER_MIN_WIDTH = 420;
const RIGHT_MIN_WIDTH = 260;
const COLLAPSED_WIDTH = 52;
const SPLITTER_WIDTH = 14;
const DEFAULT_LAYOUT: SetupLayoutState = {
  leftWidth: 430,
  rightWidth: 360,
  isLeftCollapsed: false,
  isRightCollapsed: false
};

function clampNumber(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) {
    return minValue;
  }

  return Math.min(maxValue, Math.max(minValue, value));
}

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

function loadStoredLayout(): SetupLayoutState {
  if (typeof window === "undefined") {
    return DEFAULT_LAYOUT;
  }

  try {
    const rawValue = window.localStorage.getItem(SETUP_LAYOUT_STORAGE_KEY);
    if (!rawValue) {
      return DEFAULT_LAYOUT;
    }

    const parsed = JSON.parse(rawValue) as Partial<SetupLayoutState>;
    return {
      leftWidth:
        typeof parsed.leftWidth === "number" ? parsed.leftWidth : DEFAULT_LAYOUT.leftWidth,
      rightWidth:
        typeof parsed.rightWidth === "number" ? parsed.rightWidth : DEFAULT_LAYOUT.rightWidth,
      isLeftCollapsed:
        typeof parsed.isLeftCollapsed === "boolean"
          ? parsed.isLeftCollapsed
          : DEFAULT_LAYOUT.isLeftCollapsed,
      isRightCollapsed:
        typeof parsed.isRightCollapsed === "boolean"
          ? parsed.isRightCollapsed
          : DEFAULT_LAYOUT.isRightCollapsed
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function getLeftSegmentWidth(layout: SetupLayoutState): number {
  return layout.isLeftCollapsed ? COLLAPSED_WIDTH : layout.leftWidth;
}

function getRightSegmentWidth(layout: SetupLayoutState): number {
  return layout.isRightCollapsed ? COLLAPSED_WIDTH : layout.rightWidth;
}

function getLeftHandleWidth(layout: SetupLayoutState): number {
  return layout.isLeftCollapsed ? 0 : SPLITTER_WIDTH;
}

function getRightHandleWidth(layout: SetupLayoutState): number {
  return layout.isRightCollapsed ? 0 : SPLITTER_WIDTH;
}

function computeMaxLeftWidth(layout: SetupLayoutState, containerWidth: number): number {
  return Math.max(
    LEFT_MIN_WIDTH,
    containerWidth -
      getRightSegmentWidth(layout) -
      getLeftHandleWidth(layout) -
      getRightHandleWidth(layout) -
      CENTER_MIN_WIDTH
  );
}

function computeMaxRightWidth(layout: SetupLayoutState, containerWidth: number): number {
  return Math.max(
    RIGHT_MIN_WIDTH,
    containerWidth -
      getLeftSegmentWidth(layout) -
      getLeftHandleWidth(layout) -
      getRightHandleWidth(layout) -
      CENTER_MIN_WIDTH
  );
}

function normalizeLayout(
  layout: SetupLayoutState,
  containerWidth: number
): SetupLayoutState {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return layout;
  }

  let nextLayout = { ...layout };

  for (let index = 0; index < 2; index += 1) {
    if (!nextLayout.isLeftCollapsed) {
      nextLayout.leftWidth = clampNumber(
        nextLayout.leftWidth,
        LEFT_MIN_WIDTH,
        computeMaxLeftWidth(nextLayout, containerWidth)
      );
    }

    if (!nextLayout.isRightCollapsed) {
      nextLayout.rightWidth = clampNumber(
        nextLayout.rightWidth,
        RIGHT_MIN_WIDTH,
        computeMaxRightWidth(nextLayout, containerWidth)
      );
    }
  }

  return nextLayout;
}

function SettingField(props: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  const { label, hint, children } = props;

  return (
    <div className="field setting-field">
      <span>{label}</span>
      {children}
      <div className="field-hint">{hint}</div>
    </div>
  );
}

export function GameSetupScreen(props: GameSetupScreenProps) {
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
    characterConcept,
    isCreating,
    onBack,
    onClose,
    onSubmit,
    onLocaleChange,
    onPlayModeChange,
    onGmArchitectureChange,
    onModelAccessModeChange,
    onModelProfileIdChange,
    onRuntimeModelConfigChange,
    onDebugEnabledChange,
    onLogViewModeChange,
    onCharacterConceptChange
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<SetupLayoutState>(() => loadStoredLayout());
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SETUP_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    function syncLayout(): void {
      const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
      if (containerWidth <= 0) {
        return;
      }

      setLayout((current) => {
        const nextLayout = normalizeLayout(current, containerWidth);
        if (JSON.stringify(nextLayout) === JSON.stringify(current)) {
          return current;
        }
        return nextLayout;
      });
    }

    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => {
      window.removeEventListener("resize", syncLayout);
    };
  }, []);

  useEffect(() => {
    if (!dragTarget) {
      return;
    }

    function handlePointerMove(event: PointerEvent): void {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) {
        return;
      }

      setLayout((current) => {
        if (dragTarget === "left" && !current.isLeftCollapsed) {
          const nextLeftWidth = clampNumber(
            event.clientX - rect.left,
            LEFT_MIN_WIDTH,
            computeMaxLeftWidth(current, rect.width)
          );
          return {
            ...current,
            leftWidth: nextLeftWidth
          };
        }

        if (dragTarget === "right" && !current.isRightCollapsed) {
          const distanceFromRight = rect.right - event.clientX;
          const nextRightWidth = clampNumber(
            distanceFromRight,
            RIGHT_MIN_WIDTH,
            computeMaxRightWidth(current, rect.width)
          );
          return {
            ...current,
            rightWidth: nextRightWidth
          };
        }

        return current;
      });
    }

    function handlePointerUp(): void {
      setDragTarget(null);
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragTarget]);

  function handleSplitterPointerDown(
    target: DragTarget,
    event: ReactPointerEvent<HTMLButtonElement>
  ): void {
    event.preventDefault();
    setDragTarget(target);
  }

  function handleToggleLeftCollapse(): void {
    setLayout((current) => ({
      ...current,
      isLeftCollapsed: !current.isLeftCollapsed
    }));
  }

  function handleToggleRightCollapse(): void {
    setLayout((current) => ({
      ...current,
      isRightCollapsed: !current.isRightCollapsed
    }));
  }

  const selectedRule =
    bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName) ?? null;
  const selectedStory =
    selectedRule?.stories.find((item) => item.directoryName === storyDirectoryName) ?? null;
  const selectedModelMode =
    bootstrap?.modelAccessModes.find((item) => item.code === modelAccessMode) ?? null;
  const availableProfiles =
    bootstrap?.modelProfiles.filter((item) => item.accessMode === modelAccessMode) ?? [];
  const selectedProfile =
    availableProfiles.find((item) => item.id === modelProfileId) ?? availableProfiles[0] ?? null;
  const profileReady = isProfileReady(modelAccessMode, selectedProfile, runtimeModelConfig);
  const previewLines = buildPreviewLines(
    selectedStory?.intro ?? selectedRule?.ruleIntro ?? null,
    5
  );
  const previewHeadline =
    selectedStory?.coverQuote?.trim() ||
    clipText(selectedStory?.intro ?? selectedRule?.ruleIntro, 120);

  const leftPaneStyle: CSSProperties = {
    width: layout.leftWidth,
    minWidth: LEFT_MIN_WIDTH
  };

  const rightPaneStyle: CSSProperties = {
    width: layout.rightWidth,
    minWidth: RIGHT_MIN_WIDTH
  };

  return (
    <section className="panel page-panel setup-page-panel">
      <ScreenHeader
        title={selectedStory?.title ?? "游戏设置"}
        description="最后确认这一局的主持方式、模型入口和角色概念，然后再真正开局。"
        onBack={onBack}
        backLabel="返回选剧本"
        onClose={onClose}
        closeLabel="关闭"
      />

      <form className="setup-form" onSubmit={onSubmit}>
        <div
          className={`setup-resizable-layout ${dragTarget ? "setup-resizable-layout-dragging" : ""}`}
          ref={containerRef}
        >
          {layout.isLeftCollapsed ? (
            <button
              className="collapsed-pane-toggle"
              onClick={handleToggleLeftCollapse}
              type="button"
            >
              <span className="collapsed-pane-toggle-label">CONFIG</span>
              <span className="collapsed-pane-toggle-action">展开</span>
            </button>
          ) : (
            <>
              <section className="setup-pane setup-pane-left" style={leftPaneStyle}>
                <div className="selection-column-header">
                  <div>
                    <div className="eyebrow">Global Config</div>
                    <h2>全局配置</h2>
                  </div>
                  <button
                    className="ghost-button pane-toggle-button"
                    onClick={handleToggleLeftCollapse}
                    type="button"
                  >
                    收起
                  </button>
                </div>

                <div className="setup-pane-scroll">
                  <SettingField hint="控制内容文本和界面的基础语言。" label="语言">
                    <select
                      value={locale}
                      onChange={(event) =>
                        onLocaleChange(event.target.value as CreateSessionRequest["locale"])
                      }
                    >
                      {bootstrap?.languages.map((language) => (
                        <option key={language.code} value={language.code}>
                          {language.nativeLabel} / {language.label}
                        </option>
                      ))}
                    </select>
                  </SettingField>

                  <SettingField
                    hint="难度还没接入真实裁定，当前先固定为标准。"
                    label="难度"
                  >
                    <select disabled value="normal">
                      <option value="normal">标准（待开发）</option>
                    </select>
                  </SettingField>

                  <SettingField
                    hint="决定这局是纯 mock 还是通过代理接入真实模型。"
                    label="模型模式"
                  >
                    <select
                      value={modelAccessMode}
                      onChange={(event) =>
                        onModelAccessModeChange(
                          event.target.value as CreateSessionRequest["modelAccessMode"]
                        )
                      }
                    >
                      {bootstrap?.modelAccessModes.map((mode) => (
                        <option key={mode.code} value={mode.code}>
                          {mode.label}
                        </option>
                      ))}
                    </select>
                  </SettingField>

                  <SettingField
                    hint="为单 Agent / 多 Agent 主持预留统一入口。"
                    label="主持架构"
                  >
                    <select
                      value={gmArchitecture}
                      onChange={(event) =>
                        onGmArchitectureChange(
                          event.target.value as CreateSessionRequest["gmArchitecture"]
                        )
                      }
                    >
                      {GM_ARCHITECTURE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </SettingField>

                  <SettingField
                    hint="用于切换不同 provider 的默认模型档案。"
                    label="模型档案"
                  >
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
                  </SettingField>

                  <SettingField
                    hint="控制日志区域的细粒度，方便你游玩或排查。"
                    label="日志显示"
                  >
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
                  </SettingField>

                  <SettingField
                    hint="当前 MVP 先保留单人、单人 + NPC 和多人入口。"
                    label="游戏模式"
                  >
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
                  </SettingField>

                  {modelAccessMode === "server_proxy" ? (
                    <>
                      <SettingField hint="留空时优先读取本地 .env。" label="API Key 覆盖">
                        <input
                          autoComplete="new-password"
                          className="text-input"
                          placeholder="可选：覆盖当前档案的 API key"
                          type="password"
                          value={runtimeModelConfig.apiKey ?? ""}
                          onChange={(event) =>
                            onRuntimeModelConfigChange({
                              ...runtimeModelConfig,
                              apiKey: event.target.value
                            })
                          }
                        />
                      </SettingField>

                      <SettingField
                        hint="留空则使用模型档案的默认模型名。"
                        label="模型名覆盖"
                      >
                        <input
                          className="text-input"
                          placeholder={selectedProfile?.baseModel ?? "输入模型名"}
                          type="text"
                          value={runtimeModelConfig.model ?? ""}
                          onChange={(event) =>
                            onRuntimeModelConfigChange({
                              ...runtimeModelConfig,
                              model: event.target.value
                            })
                          }
                        />
                      </SettingField>

                      <SettingField
                        hint="兼容 OpenAI 风格代理接口。"
                        label="Base URL 覆盖"
                      >
                        <input
                          className="text-input"
                          placeholder={selectedProfile?.baseUrl ?? "输入 base URL"}
                          type="text"
                          value={runtimeModelConfig.baseUrl ?? ""}
                          onChange={(event) =>
                            onRuntimeModelConfigChange({
                              ...runtimeModelConfig,
                              baseUrl: event.target.value
                            })
                          }
                        />
                      </SettingField>
                    </>
                  ) : null}

                  <SettingField
                    hint="当前主要用于调试模型与运行时日志。"
                    label="调试模式"
                  >
                    <label className="toggle-row">
                      <input
                        checked={debugEnabled}
                        type="checkbox"
                        onChange={(event) => onDebugEnabledChange(event.target.checked)}
                      />
                      <span>{debugEnabled ? "开启" : "关闭"}</span>
                    </label>
                  </SettingField>
                </div>
              </section>

              <button
                aria-label="调整左侧配置栏宽度"
                className="story-resize-handle"
                onPointerDown={(event) => handleSplitterPointerDown("left", event)}
                type="button"
              >
                <span className="story-resize-handle-line" />
              </button>
            </>
          )}

          <section className="setup-pane setup-pane-center">
            <div className="selection-column-header">
              <div className="eyebrow">Opening Preview</div>
              <h2>开场预览</h2>
            </div>

            <div className="setup-pane-scroll">
              <div className="setup-preview-card">
                <div className="setup-preview-visual">
                  {false ? (
                    <img
                      alt={`${selectedStory?.title ?? "剧本"}封面`}
                      className="story-cover-image"
                      src={coverAsset.url}
                    />
                  ) : (
                    <div className="story-cover-placeholder">
                      <div className="eyebrow">Preview</div>
                      <h2>{selectedStory?.title ?? "未选择剧本"}</h2>
                      <p>{previewHeadline}</p>
                    </div>
                  )}
                </div>

                <div className="opening-block setup-preview-copy">
                  {previewLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>

                <div className="summary-card">
                  <div className="meta-label">当前舞台</div>
                  <div className="summary-text">
                    {selectedRule?.ruleTitle ?? "未选择规则"} / {selectedStory?.title ?? "未选择剧本"}
                  </div>
                  <div className="summary-text">
                    标签：{renderJoinedList(selectedStory?.tags ?? [])}
                  </div>
                  <div className="summary-text">
                    主持风格：{selectedStory?.gmStyle ?? "待定"}
                  </div>
                  <div className="summary-text">
                    模型状态：{selectedProfile?.message ?? selectedModelMode?.message ?? "未配置"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {layout.isRightCollapsed ? (
            <button
              className="collapsed-pane-toggle collapsed-pane-toggle-story"
              onClick={handleToggleRightCollapse}
              type="button"
            >
              <span className="collapsed-pane-toggle-label">ALLY</span>
              <span className="collapsed-pane-toggle-action">展开</span>
            </button>
          ) : (
            <>
              <button
                aria-label="调整右侧同行者栏宽度"
                className="story-resize-handle"
                onPointerDown={(event) => handleSplitterPointerDown("right", event)}
                type="button"
              >
                <span className="story-resize-handle-line" />
              </button>

              <section className="setup-pane setup-pane-right" style={rightPaneStyle}>
                <div className="selection-column-header">
                  <div>
                    <div className="eyebrow">Companions</div>
                    <h2>同行者</h2>
                  </div>
                  <button
                    className="ghost-button pane-toggle-button"
                    onClick={handleToggleRightCollapse}
                    type="button"
                  >
                    收起
                  </button>
                </div>

                <div className="setup-pane-scroll">
                  <div className="companion-list">
                    <div className="companion-card">
                      <div className="selection-card-title">AI 同伴入口</div>
                      <div className="summary-text">
                        这里会在后续接入 NPC 同伴与多玩家私聊视图。当前 Phase 2 先保留页面结构和操作位置。
                      </div>
                    </div>
                    <div className="companion-card">
                      <div className="selection-card-title">添加同伴</div>
                      <div className="summary-text">
                        待开发：支持创建、编辑和删除 AI 玩家。
                      </div>
                      <button className="ghost-button" disabled type="button">
                        + 添加同伴
                      </button>
                    </div>
                    <div className="companion-card">
                      <div className="selection-card-title">内容警告</div>
                      <div className="summary-text">
                        {renderJoinedList(
                          selectedStory?.contentWarnings ?? selectedRule?.contentWarnings ?? []
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="character-setup-bar">
          <div className="character-setup-copy">
            <div className="eyebrow">Character Setup</div>
            <h2>你是谁？</h2>
            <p className="summary-text">
              这一栏先保留玩家角色概念输入，后续再接 AI 补全和角色卡结构化输出。
            </p>
          </div>

          <div className="character-setup-controls">
            <textarea
              className="character-setup-input"
              placeholder="例如：我是来寻找失踪姐姐的纪录片学生，擅长摄影，但对湖边大火有难以解释的既视感。"
              value={characterConcept}
              onChange={(event) => onCharacterConceptChange(event.target.value)}
            />
            <div className="button-row">
              <button className="ghost-button" disabled type="button">
                AI 补全（待开发）
              </button>
              <button
                className="primary-button"
                disabled={isCreating || !profileReady || !selectedStory}
                type="submit"
              >
                {isCreating ? "正在创建会话..." : "开始游戏"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
