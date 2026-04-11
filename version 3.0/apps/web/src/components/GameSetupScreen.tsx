import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";

import type {
  AiGenerationMetadata,
  BootstrapResponse,
  CharacterConceptAssistMode,
  CreateSessionRequest,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import {
  buildPreviewLines,
  clipText,
  formatAiGenerationMeta,
  GM_ARCHITECTURE_OPTIONS,
  LOG_VIEW_OPTIONS,
  MARKDOWN_FONT_SIZE_OPTIONS,
  PLAY_MODE_OPTIONS,
  renderJoinedList,
  type MarkdownFontSizePreset
} from "../ui.ts";
import {
  OPENING_PREVIEW_DELIVERY_OPTIONS,
  type OpeningPreviewDeliveryMode
} from "../openingPreviewPreferences.ts";
import { MarkdownBlock } from "./MarkdownBlock.tsx";
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
  openingPreviewDeliveryMode: OpeningPreviewDeliveryMode;
  markdownFontSize: MarkdownFontSizePreset;
  characterConcept: string;
  characterConceptAssistLoading: boolean;
  characterConceptAssistMode: CharacterConceptAssistMode;
  isCreating: boolean;
  openingPreviewText: string;
  openingPreviewProvider: string | null;
  openingPreviewMeta: AiGenerationMetadata | null;
  openingPreviewLoading: boolean;
  openingPreviewError: string | null;
  showAiMetadata: boolean;
  onBack: () => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onRegenerateOpeningPreview: () => void;
  onAssistCharacterConcept: () => Promise<void>;
  onLocaleChange: (value: CreateSessionRequest["locale"]) => void;
  onPlayModeChange: (value: CreateSessionRequest["playMode"]) => void;
  onGmArchitectureChange: (value: CreateSessionRequest["gmArchitecture"]) => void;
  onModelAccessModeChange: (value: CreateSessionRequest["modelAccessMode"]) => void;
  onModelProfileIdChange: (value: string) => void;
  onDebugEnabledChange: (value: boolean) => void;
  onLogViewModeChange: (
    value: NonNullable<CreateSessionRequest["logViewMode"]>
  ) => void;
  onOpeningPreviewDeliveryModeChange: (value: OpeningPreviewDeliveryMode) => void;
  onMarkdownFontSizeChange: (value: MarkdownFontSizePreset) => void;
  onCharacterConceptChange: (value: string) => void;
};

type DragTarget = "left" | "right" | null;
type SetupDetailTab = "game" | "model" | "companions";

type SetupLayoutState = {
  leftWidth: number;
  rightWidth: number;
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
};

const SETUP_LAYOUT_STORAGE_KEY = "trpg3.gameSetupLayout";
const LEFT_MIN_WIDTH = 280;
const CENTER_MIN_WIDTH = 420;
const RIGHT_MIN_WIDTH = 280;
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

function normalizeLayout(layout: SetupLayoutState, containerWidth: number): SetupLayoutState {
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
    openingPreviewDeliveryMode,
    markdownFontSize,
    characterConcept,
    characterConceptAssistLoading,
    characterConceptAssistMode,
    isCreating,
    openingPreviewText,
    openingPreviewProvider,
    openingPreviewMeta,
    openingPreviewLoading,
    openingPreviewError,
    showAiMetadata,
    onBack,
    onClose,
    onSubmit,
    onRegenerateOpeningPreview,
    onAssistCharacterConcept,
    onLocaleChange,
    onPlayModeChange,
    onGmArchitectureChange,
    onModelAccessModeChange,
    onModelProfileIdChange,
    onDebugEnabledChange,
    onLogViewModeChange,
    onOpeningPreviewDeliveryModeChange,
    onMarkdownFontSizeChange,
    onCharacterConceptChange
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<SetupLayoutState>(() => loadStoredLayout());
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [isCoverExpanded, setIsCoverExpanded] = useState(false);
  const [isSettingsDetailOpen, setIsSettingsDetailOpen] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<SetupDetailTab>("game");

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
        return JSON.stringify(nextLayout) === JSON.stringify(current) ? current : nextLayout;
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

  useEffect(() => {
    setIsCoverExpanded(false);
  }, [ruleDirectoryName, storyDirectoryName]);

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

  function handleOpenSettingsDetail(tab: SetupDetailTab): void {
    setActiveDetailTab(tab);
    setIsSettingsDetailOpen(true);
  }

  function handleCloseSettingsDetail(): void {
    setIsSettingsDetailOpen(false);
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
  const coverAsset = selectedStory?.assets.find((item) => item.type === "cover") ?? null;
  const previewLines = buildPreviewLines(
    selectedStory?.intro ?? selectedRule?.ruleIntro ?? null,
    5
  );
  const hasPreviewText = openingPreviewText.trim().length > 0;
  const previewMarkdownContent =
    hasPreviewText ? openingPreviewText : previewLines.join("\n\n");
  const openingPreviewMetaLine =
    showAiMetadata && !openingPreviewLoading
      ? formatAiGenerationMeta(openingPreviewMeta) ||
        (openingPreviewProvider ? `来源：${openingPreviewProvider}` : "")
      : "";
  const previewHeadline =
    selectedStory?.coverQuote?.trim() ||
    clipText(selectedStory?.intro ?? selectedRule?.ruleIntro, 120);
  const resolvedModelName =
    runtimeModelConfig.model?.trim() || selectedProfile?.baseModel || "未配置";
  const trimmedCharacterConcept = characterConcept.trim();
  const characterAssistButtonLabel =
    trimmedCharacterConcept.length > 0 ? "AI 补全" : "AI 生成";
  const characterAssistBusyLabel =
    characterConceptAssistMode === "complete" ? "AI 补全中..." : "AI 生成中...";
  const canAssistCharacterConcept =
    !characterConceptAssistLoading &&
    !isCreating &&
    !openingPreviewLoading &&
    hasPreviewText &&
    profileReady;

  const leftPaneStyle: CSSProperties = {
    width: layout.leftWidth,
    minWidth: LEFT_MIN_WIDTH
  };

  const rightPaneStyle: CSSProperties = {
    width: layout.rightWidth,
    minWidth: RIGHT_MIN_WIDTH
  };

  const detailTabs: Array<{
    value: SetupDetailTab;
    label: string;
    description: string;
  }> = [
    {
      value: "game",
      label: "游戏设置",
      description: "语言、主持方式、显示和游玩节奏相关配置。"
    },
    {
      value: "model",
      label: "模型设置",
      description: "模型入口、档案与当前能力概览。"
    },
    {
      value: "companions",
      label: "同行者设置",
      description: "AI 同伴入口、内容边界与后续扩展位。"
    }
  ];

  function renderGameSettingsFields(layoutMode: "sidebar" | "detail"): React.ReactNode {
    const containerClassName =
      layoutMode === "detail" ? "setup-detail-fields-grid" : "setup-section-field-stack";

    return (
      <div className={containerClassName}>
        <SettingField label="语言" hint="控制内容文本和界面的基础语言。">
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

        <SettingField label="难度" hint="难度还没接入真实裁定，当前先固定为标准。">
          <select disabled value="normal">
            <option value="normal">标准（待开发）</option>
          </select>
        </SettingField>

        <SettingField
          label="主持架构"
          hint="为单 Agent / 多 Agent 主持预留统一入口。"
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
          label="游戏模式"
          hint="当前 MVP 先保留单人、单人 + NPC 和多人入口。"
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
      </div>
    );
  }

  function renderModelSettingsFields(layoutMode: "sidebar" | "detail"): React.ReactNode {
    const containerClassName =
      layoutMode === "detail" ? "setup-detail-fields-grid" : "setup-section-field-stack";

    return (
      <div className={containerClassName}>
        <SettingField
          label="模型模式"
          hint="决定这局是纯 mock，还是通过代理接入真实模型。"
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
          label="模型档案"
          hint="这里只负责选择本局要使用的模型档案。"
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
          label="日志显示"
          hint="控制日志区域的细粒度，方便游玩或排查。"
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
          label="开场传输"
          hint="流式会边生成边显示；完整传输会等待全文完成后再显示。"
        >
          <select
            value={openingPreviewDeliveryMode}
            onChange={(event) =>
              onOpeningPreviewDeliveryModeChange(
                event.target.value as OpeningPreviewDeliveryMode
              )
            }
          >
            {OPENING_PREVIEW_DELIVERY_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </SettingField>

        <SettingField
          label="Markdown 字号"
          hint="控制 AI 正文、标题和列表的渲染大小。"
        >
          <select
            value={markdownFontSize}
            onChange={(event) =>
              onMarkdownFontSizeChange(
                event.target.value as MarkdownFontSizePreset
              )
            }
          >
            {MARKDOWN_FONT_SIZE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </SettingField>

        <SettingField
          label="调试模式"
          hint="当前主要用于调试模型与运行时日志。"
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
    );
  }

  function renderCompanionCards(gridClassName?: string): React.ReactNode {
    return (
      <div className={gridClassName ?? "companion-list"}>
        <div className="companion-card">
          <div className="selection-card-title">AI 同伴入口</div>
          <div className="summary-text">
            这里会在后续接入 NPC 同伴与多玩家私聊视图。当前 Phase 2 先保留页面结构和操作位置。
          </div>
        </div>

        <div className="companion-card">
          <div className="selection-card-title">添加同伴</div>
          <div className="summary-text">待开发：支持创建、编辑和删除 AI 玩家。</div>
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
    );
  }

  function renderGameSettingsDetailTab(): React.ReactNode {
    return (
      <div className="settings-model-overview">
        <div className="settings-model-grid">
          <article className="summary-card settings-model-card">
            <div className="setup-section-heading">
              <div className="eyebrow">Game</div>
              <div className="summary-title">基础游戏设置</div>
            </div>
            {renderGameSettingsFields("detail")}
          </article>

          <article className="summary-card settings-model-card">
            <div className="setup-section-heading">
              <div className="eyebrow">Display</div>
              <div className="summary-title">显示与调试</div>
            </div>
            <div className="setup-detail-fields-grid">
              <SettingField
                label="日志显示"
                hint="控制日志区域的细粒度，方便游玩或排查。"
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
                label="开场传输"
                hint="流式会边生成边显示；完整传输会等待全文完成后再显示。"
              >
                <select
                  value={openingPreviewDeliveryMode}
                  onChange={(event) =>
                    onOpeningPreviewDeliveryModeChange(
                      event.target.value as OpeningPreviewDeliveryMode
                    )
                  }
                >
                  {OPENING_PREVIEW_DELIVERY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </SettingField>

              <SettingField
                label="Markdown 字号"
                hint="控制 AI 正文、标题和列表的渲染大小。"
              >
                <select
                  value={markdownFontSize}
                  onChange={(event) =>
                    onMarkdownFontSizeChange(
                      event.target.value as MarkdownFontSizePreset
                    )
                  }
                >
                  {MARKDOWN_FONT_SIZE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </SettingField>

              <SettingField
                label="调试模式"
                hint="当前主要用于调试模型与运行时日志。"
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
          </article>
        </div>

        <article className="summary-card settings-model-entry">
          <div className="settings-model-entry-head">
            <div>
              <div className="eyebrow">Current Run</div>
              <div className="summary-title">当前局面概览</div>
            </div>
          </div>
          <div className="settings-model-entry-grid">
            <div className="summary-text">
              规则：{selectedRule?.ruleTitle ?? "未选择规则"}
            </div>
            <div className="summary-text">
              剧本：{selectedStory?.title ?? "未选择剧本"}
            </div>
            <div className="summary-text">
              标签：{renderJoinedList(selectedStory?.tags ?? [])}
            </div>
            <div className="summary-text">
              主持风格：{selectedStory?.gmStyle ?? "待定"}
            </div>
          </div>
        </article>
      </div>
    );
  }

  function renderModelSettingsDetailTab(): React.ReactNode {
    return (
      <div className="settings-model-overview">
        <div className="settings-model-grid">
          <article className="summary-card settings-model-card">
            <div className="setup-section-heading">
              <div className="eyebrow">Model</div>
              <div className="summary-title">模型入口设置</div>
            </div>
            {renderModelSettingsFields("detail")}
          </article>

          {selectedProfile ? (
            <article className="summary-card settings-model-card">
              <div className="setup-section-heading">
                <div className="eyebrow">Capabilities</div>
                <div className="summary-title">模型能力</div>
                <div className="summary-text">
                  这里会告诉你当前模型档案是否支持文件上传、深度思考、工具调用等能力。
                </div>
              </div>
              <div className="model-capability-list">
                {selectedProfile.featureDetails.map((feature) => (
                  <div
                    key={feature.key}
                    className={`model-capability-item ${
                      feature.supported
                        ? "model-capability-item-supported"
                        : "model-capability-item-unsupported"
                    }`}
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
          ) : (
            <article className="summary-card settings-model-card">
              <div className="setup-section-heading">
                <div className="eyebrow">Capabilities</div>
                <div className="summary-title">模型能力</div>
              </div>
              <div className="summary-text">当前没有可用模型档案，暂时无法显示能力信息。</div>
            </article>
          )}
        </div>

        <article className="summary-card settings-model-entry">
          <div className="settings-model-entry-head">
            <div>
              <div className="eyebrow">Summary</div>
              <div className="summary-title">当前模型概览</div>
            </div>
          </div>
          <div className="settings-model-entry-grid">
            <div className="summary-text">
              入口：{selectedModelMode?.label ?? "未配置"}
            </div>
            <div className="summary-text">
              档案：{selectedProfile?.name ?? "未配置"}
            </div>
            <div className="summary-text">实际模型：{resolvedModelName}</div>
            <div className="summary-text">
              状态：{profileReady ? "可创建会话" : "还需补全配置"}
            </div>
            <div className="summary-text">
              说明：{selectedProfile?.message ?? "未提供说明"}
            </div>
          </div>
        </article>
      </div>
    );
  }

  function renderCompanionSettingsDetailTab(): React.ReactNode {
    return (
      <div className="settings-model-overview">
        <article className="summary-card settings-model-entry">
          <div className="settings-model-entry-head">
            <div>
              <div className="eyebrow">Companions</div>
              <div className="summary-title">同行者设置</div>
            </div>
          </div>
          <div className="summary-text">
            这里集中展示同伴入口、扩展位和当前剧本的内容边界，后续多人玩法也会从这里展开。
          </div>
        </article>

        {renderCompanionCards("setup-detail-companion-grid")}
      </div>
    );
  }

  function renderActiveDetailTab(): React.ReactNode {
    if (activeDetailTab === "model") {
      return renderModelSettingsDetailTab();
    }

    if (activeDetailTab === "companions") {
      return renderCompanionSettingsDetailTab();
    }

    return renderGameSettingsDetailTab();
  }

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
                    <div className="eyebrow">Setup Overview</div>
                    <h2>设置概览</h2>
                  </div>
                  <div className="setup-pane-header-actions">
                    <button
                      className="ghost-button ghost-button-small pane-header-button"
                      onClick={() => handleOpenSettingsDetail("game")}
                      type="button"
                    >
                      详情
                    </button>
                    <button
                      className="ghost-button ghost-button-small pane-header-button pane-toggle-button"
                      onClick={handleToggleLeftCollapse}
                      type="button"
                    >
                      收起
                    </button>
                  </div>
                </div>

                <div className="setup-pane-scroll">
                  <article className="summary-card setup-section-card">
                    <div className="setup-section-heading">
                      <div className="eyebrow">Game</div>
                      <div className="summary-title">游戏设置</div>
                      <div className="summary-text">
                        管理语言、主持架构和本局的基础游玩方式。
                      </div>
                    </div>
                    {renderGameSettingsFields("sidebar")}
                  </article>

                  <article className="summary-card setup-section-card">
                    <div className="setup-section-heading">
                      <div className="eyebrow">Model</div>
                      <div className="summary-title">模型设置</div>
                      <div className="summary-text">
                        选择本局使用的模型入口、档案以及显示偏好。
                      </div>
                    </div>
                    {renderModelSettingsFields("sidebar")}
                    <div className="setup-section-summary-list">
                      <div className="summary-text">
                        当前档案：{selectedProfile?.name ?? selectedModelMode?.label ?? "未配置"}
                      </div>
                      <div className="summary-text">实际模型：{resolvedModelName}</div>
                      <div className="summary-text">
                        可用状态：{profileReady ? "可创建会话" : "还需补全配置"}
                      </div>
                    </div>
                  </article>

                  <article className="summary-card setup-section-card">
                    <div className="setup-section-heading">
                      <div className="eyebrow">Current Run</div>
                      <div className="summary-title">当前局面概览</div>
                    </div>
                    <div className="setup-section-summary-list">
                      <div className="summary-text">
                        规则：{selectedRule?.ruleTitle ?? "未选择规则"}
                      </div>
                      <div className="summary-text">
                        剧本：{selectedStory?.title ?? "未选择剧本"}
                      </div>
                      <div className="summary-text">
                        标签：{renderJoinedList(selectedStory?.tags ?? [])}
                      </div>
                      <div className="summary-text">
                        主持风格：{selectedStory?.gmStyle ?? "待定"}
                      </div>
                    </div>
                  </article>
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
              <div>
                <div className="eyebrow">Opening Preview</div>
                <h2>开场预览</h2>
              </div>
              <button
                className="ghost-button ghost-button-small"
                disabled={openingPreviewLoading}
                onClick={onRegenerateOpeningPreview}
                type="button"
              >
                {openingPreviewLoading ? "生成中..." : "重新生成开场白"}
              </button>
            </div>

            <div className="setup-pane-scroll">
              <div className="setup-preview-card">
                <div className="setup-preview-visual">
                  {coverAsset ? (
                    <>
                      <img
                        alt={`${selectedStory?.title ?? "剧本"}封面`}
                        className="story-cover-image"
                        src={coverAsset.url}
                      />
                      <button
                        aria-label="查看大图"
                        className="ghost-button story-cover-expand-button"
                        onClick={() => setIsCoverExpanded(true)}
                        type="button"
                      >
                        查看大图
                      </button>
                      <div className="story-cover-placeholder story-cover-overlay">
                        <div className="eyebrow">Preview</div>
                        <h2>{selectedStory?.title ?? "未选择剧本"}</h2>
                        <p>{previewHeadline}</p>
                      </div>
                    </>
                  ) : (
                    <div className="story-cover-placeholder">
                      <div className="eyebrow">Preview</div>
                      <h2>{selectedStory?.title ?? "未选择剧本"}</h2>
                      <p>{previewHeadline}</p>
                    </div>
                  )}
                </div>

                <div className="opening-block setup-preview-copy">
                  {openingPreviewLoading && !hasPreviewText ? (
                    <p>正在生成 AI 开场预览...</p>
                  ) : (
                    <MarkdownBlock
                      className="story-markdown-block opening-markdown setup-preview-markdown"
                      content={previewMarkdownContent}
                      fontSizePreset={markdownFontSize}
                    />
                  )}
                  {openingPreviewMetaLine ? (
                    <p className="preview-meta-line">{openingPreviewMetaLine}</p>
                  ) : null}
                  {openingPreviewLoading ? (
                    <p className="preview-meta-line">
                      {openingPreviewDeliveryMode === "stream"
                        ? "正在流式接收开场预览..."
                        : "正在等待完整开场预览..."}
                    </p>
                  ) : null}
                  {!openingPreviewLoading && openingPreviewError ? (
                    <p className="preview-meta-line preview-meta-line-error">
                      {openingPreviewError}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="character-setup-controls setup-pane-footer">
              <div className="companion-card character-setup-copy">
                <div className="eyebrow">Character Setup</div>
                <h2>你是谁？</h2>
                <p className="summary-text">
                  可以先自己写，也可以基于开场白让 AI 生成或补全一版角色概念。
                </p>
              </div>
              <div
                className={`character-setup-input-shell ${
                  characterConceptAssistLoading
                    ? "character-setup-input-shell-loading"
                    : ""
                }`}
              >
                <textarea
                  className="character-setup-input"
                  disabled={characterConceptAssistLoading}
                  placeholder="例如：我是来寻找失踪姐姐的纪录片学生，擅长摄影，但对湖边大火有难以解释的既视感。"
                  value={characterConcept}
                  onChange={(event) => onCharacterConceptChange(event.target.value)}
                />
                {characterConceptAssistLoading ? (
                  <div className="character-setup-loading-overlay">
                    <div className="character-setup-loading-bar" />
                    <div className="character-setup-loading-copy">
                      {characterConceptAssistMode === "complete"
                        ? "AI 正在补全角色概念..."
                        : "AI 正在生成角色概念..."}
                    </div>
                  </div>
                ) : null}
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
                    <h2>同行者设置</h2>
                  </div>
                  <div className="setup-pane-header-actions">
                    <button
                      className="ghost-button ghost-button-small pane-header-button"
                      onClick={() => handleOpenSettingsDetail("companions")}
                      type="button"
                    >
                      详情
                    </button>
                    <button
                      className="ghost-button ghost-button-small pane-header-button pane-toggle-button"
                      onClick={handleToggleRightCollapse}
                      type="button"
                    >
                      收起
                    </button>
                  </div>
                </div>

                <div className="setup-pane-scroll">
                  <article className="summary-card setup-section-card">
                    <div className="setup-section-heading">
                      <div className="eyebrow">Companions</div>
                      <div className="summary-title">同行者设置</div>
                      <div className="summary-text">
                        这里集中显示 AI 同伴入口、扩展位和当前剧本的内容边界。
                      </div>
                    </div>
                    {renderCompanionCards()}
                  </article>
                </div>

                <div className="setup-pane-footer setup-pane-actions-footer">
                  <button
                    className="ghost-button"
                    disabled={!canAssistCharacterConcept}
                    onClick={() => void onAssistCharacterConcept()}
                    type="button"
                  >
                    {characterConceptAssistLoading
                      ? characterAssistBusyLabel
                      : characterAssistButtonLabel}
                  </button>
                  <button
                    className="primary-button"
                    disabled={
                      isCreating ||
                      characterConceptAssistLoading ||
                      !profileReady ||
                      !selectedStory
                    }
                    type="submit"
                  >
                    {isCreating ? "正在创建会话..." : "开始游戏"}
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </form>

      {isSettingsDetailOpen ? (
        <div
          aria-label="设置详情"
          className="setup-detail-modal-backdrop"
          onClick={handleCloseSettingsDetail}
          role="dialog"
        >
          <div
            className="setup-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="setup-detail-modal-header">
              <div>
                <div className="eyebrow">Setup Detail</div>
                <h2>
                  {detailTabs.find((tab) => tab.value === activeDetailTab)?.label ?? "设置详情"}
                </h2>
                <div className="summary-text">
                  {detailTabs.find((tab) => tab.value === activeDetailTab)?.description ?? ""}
                </div>
              </div>
              <button
                className="ghost-button ghost-button-small"
                onClick={handleCloseSettingsDetail}
                type="button"
              >
                关闭
              </button>
            </div>

            <div className="setup-detail-tabs" role="tablist" aria-label="设置分类">
              {detailTabs.map((tab) => (
                <button
                  key={tab.value}
                  aria-selected={tab.value === activeDetailTab}
                  className={`setup-detail-tab ${
                    tab.value === activeDetailTab ? "setup-detail-tab-active" : ""
                  }`}
                  onClick={() => setActiveDetailTab(tab.value)}
                  role="tab"
                  type="button"
                >
                  <span className="setup-detail-tab-label">{tab.label}</span>
                  <span className="setup-detail-tab-copy">{tab.description}</span>
                </button>
              ))}
            </div>

            <div className="setup-detail-modal-body">{renderActiveDetailTab()}</div>
          </div>
        </div>
      ) : null}

      {coverAsset && isCoverExpanded ? (
        <div
          aria-label="剧本封面大图预览"
          className="story-cover-lightbox"
          onClick={() => setIsCoverExpanded(false)}
          role="dialog"
        >
          <div
            className="story-cover-lightbox-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="关闭大图预览"
              className="ghost-button story-cover-lightbox-close"
              onClick={() => setIsCoverExpanded(false)}
              type="button"
            >
              收起图片
            </button>
            <img
              alt={`${selectedStory?.title ?? "剧本"}封面大图`}
              className="story-cover-lightbox-image"
              src={coverAsset.url}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
