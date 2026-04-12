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
  getGmArchitectureOptions,
  getLogViewOptions,
  getMarkdownFontSizeOptions,
  getPlayModeOptions,
  renderJoinedList,
  type MarkdownFontSizePreset
} from "../ui.ts";
import {
  getOpeningPreviewDeliveryOptions,
  type OpeningPreviewDeliveryMode
} from "../openingPreviewPreferences.ts";
import { useUiText } from "../locales/index.tsx";
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
  const text = useUiText();
  const setupText = text.gameSetupScreen;
  const playModeOptions = getPlayModeOptions(text);
  const gmArchitectureOptions = getGmArchitectureOptions(text);
  const logViewOptions = getLogViewOptions(text);
  const markdownFontSizeOptions = getMarkdownFontSizeOptions(text);
  const openingPreviewDeliveryOptions = getOpeningPreviewDeliveryOptions(text);
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
    5,
    text
  );
  const hasPreviewText = openingPreviewText.trim().length > 0;
  const previewMarkdownContent =
    hasPreviewText ? openingPreviewText : previewLines.join("\n\n");
  const openingPreviewMetaLine =
    showAiMetadata && !openingPreviewLoading
      ? formatAiGenerationMeta(openingPreviewMeta, text) ||
        (openingPreviewProvider ? setupText.preview.provider(openingPreviewProvider) : "")
      : "";
  const previewHeadline =
    selectedStory?.coverQuote?.trim() ||
    clipText(selectedStory?.intro ?? selectedRule?.ruleIntro, 120, text);
  const resolvedModelName =
    runtimeModelConfig.model?.trim() ||
    selectedProfile?.baseModel ||
    setupText.model.notConfigured;
  const trimmedCharacterConcept = characterConcept.trim();
  const characterAssistShowsComplete = trimmedCharacterConcept.length > 0;
  const characterAssistButtonLabel =
    characterAssistShowsComplete
      ? setupText.characterSetup.completeButton
      : setupText.characterSetup.generateButton;
  const characterAssistBusyLabel =
    characterConceptAssistMode === "complete"
      ? setupText.characterSetup.completing
      : setupText.characterSetup.generating;
  const characterAssistAriaLabel = characterConceptAssistLoading
    ? characterAssistBusyLabel
    : characterAssistButtonLabel;
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
      label: setupText.detailTabs.game.label,
      description: setupText.detailTabs.game.description
    },
    {
      value: "model",
      label: setupText.detailTabs.model.label,
      description: setupText.detailTabs.model.description
    },
    {
      value: "companions",
      label: setupText.detailTabs.companions.label,
      description: setupText.detailTabs.companions.description
    }
  ];

  function renderGameSettingsFields(layoutMode: "sidebar" | "detail"): React.ReactNode {
    const containerClassName =
      layoutMode === "detail" ? "setup-detail-fields-grid" : "setup-section-field-stack";

    return (
      <div className={containerClassName}>
        <SettingField
          label={setupText.fields.languageLabel}
          hint={setupText.fields.languageHint}
        >
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
          label={setupText.fields.difficultyLabel}
          hint={setupText.fields.difficultyHint}
        >
          <select disabled value="normal">
            <option value="normal">{setupText.fields.difficultyStandardPending}</option>
          </select>
        </SettingField>

        <SettingField
          label={setupText.fields.gmArchitectureLabel}
          hint={setupText.fields.gmArchitectureHint}
        >
          <select
            value={gmArchitecture}
            onChange={(event) =>
              onGmArchitectureChange(
                event.target.value as CreateSessionRequest["gmArchitecture"]
              )
            }
          >
            {gmArchitectureOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </SettingField>

        <SettingField
          label={setupText.fields.playModeLabel}
          hint={setupText.fields.playModeHint}
        >
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
          label={setupText.fields.modelModeLabel}
          hint={setupText.fields.modelModeHint}
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
          label={setupText.fields.modelProfileLabel}
          hint={setupText.fields.modelProfileHint}
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
          label={setupText.fields.logViewLabel}
          hint={setupText.fields.logViewHint}
        >
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
        </SettingField>

        <SettingField
          label={setupText.fields.previewDeliveryLabel}
          hint={setupText.fields.previewDeliveryHint}
        >
          <select
            value={openingPreviewDeliveryMode}
            onChange={(event) =>
              onOpeningPreviewDeliveryModeChange(
                event.target.value as OpeningPreviewDeliveryMode
              )
            }
          >
            {openingPreviewDeliveryOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </SettingField>

        <SettingField
          label={setupText.fields.markdownFontSizeLabel}
          hint={setupText.fields.markdownFontSizeHint}
        >
          <select
            value={markdownFontSize}
            onChange={(event) =>
              onMarkdownFontSizeChange(
                event.target.value as MarkdownFontSizePreset
              )
            }
          >
            {markdownFontSizeOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </SettingField>

        <SettingField
          label={setupText.fields.debugModeLabel}
          hint={setupText.fields.debugModeHint}
        >
          <label className="toggle-row">
            <input
              checked={debugEnabled}
              type="checkbox"
              onChange={(event) => onDebugEnabledChange(event.target.checked)}
            />
            <span>{debugEnabled ? setupText.fields.debugOn : setupText.fields.debugOff}</span>
          </label>
        </SettingField>
      </div>
    );
  }

  function renderCompanionCards(gridClassName?: string): React.ReactNode {
    return (
      <div className={gridClassName ?? "companion-list"}>
        <div className="companion-card">
          <div className="selection-card-title">{setupText.companions.entryTitle}</div>
          <div className="summary-text">
            {setupText.companions.entryDescription}
          </div>
        </div>

        <div className="companion-card">
          <div className="selection-card-title">{setupText.companions.addTitle}</div>
          <div className="summary-text">{setupText.companions.addDescription}</div>
          <button className="ghost-button" disabled type="button">
            {setupText.companions.addButton}
          </button>
        </div>

        <div className="companion-card">
          <div className="selection-card-title">{setupText.companions.warningsTitle}</div>
          <div className="summary-text">
            {renderJoinedList(
              selectedStory?.contentWarnings ?? selectedRule?.contentWarnings ?? [],
              text
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
              <div className="eyebrow">{setupText.detailTabs.game.label}</div>
              <div className="summary-title">{setupText.overview.gameTitle}</div>
            </div>
            {renderGameSettingsFields("detail")}
          </article>

          <article className="summary-card settings-model-card">
            <div className="setup-section-heading">
              <div className="eyebrow">{setupText.fields.logViewLabel}</div>
              <div className="summary-title">{setupText.fields.logViewLabel}</div>
            </div>
            <div className="setup-detail-fields-grid">
              <SettingField
                label={setupText.fields.logViewLabel}
                hint={setupText.fields.logViewHint}
              >
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
              </SettingField>

              <SettingField
                label={setupText.fields.previewDeliveryLabel}
                hint={setupText.fields.previewDeliveryHint}
              >
                <select
                  value={openingPreviewDeliveryMode}
                  onChange={(event) =>
                    onOpeningPreviewDeliveryModeChange(
                      event.target.value as OpeningPreviewDeliveryMode
                    )
                  }
                >
                  {openingPreviewDeliveryOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </SettingField>

              <SettingField
                label={setupText.fields.markdownFontSizeLabel}
                hint={setupText.fields.markdownFontSizeHint}
              >
                <select
                  value={markdownFontSize}
                  onChange={(event) =>
                    onMarkdownFontSizeChange(
                      event.target.value as MarkdownFontSizePreset
                    )
                  }
                >
                  {markdownFontSizeOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </SettingField>

              <SettingField
                label={setupText.fields.debugModeLabel}
                hint={setupText.fields.debugModeHint}
              >
                <label className="toggle-row">
                  <input
                    checked={debugEnabled}
                    type="checkbox"
                    onChange={(event) => onDebugEnabledChange(event.target.checked)}
                  />
                  <span>{debugEnabled ? setupText.fields.debugOn : setupText.fields.debugOff}</span>
                </label>
              </SettingField>
            </div>
          </article>
        </div>

        <article className="summary-card settings-model-entry">
          <div className="settings-model-entry-head">
            <div>
              <div className="eyebrow">{setupText.overview.currentRunTitle}</div>
              <div className="summary-title">{setupText.overview.currentRunTitle}</div>
            </div>
          </div>
          <div className="settings-model-entry-grid">
            <div className="summary-text">
              {setupText.currentRun.rule(selectedRule?.ruleTitle ?? setupText.currentRun.noRule)}
            </div>
            <div className="summary-text">
              {setupText.currentRun.story(selectedStory?.title ?? setupText.currentRun.noStory)}
            </div>
            <div className="summary-text">
              {setupText.currentRun.tags(renderJoinedList(selectedStory?.tags ?? [], text))}
            </div>
            <div className="summary-text">
              {setupText.currentRun.gmStyle(
                selectedStory?.gmStyle ?? setupText.currentRun.undecided
              )}
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
              <div className="eyebrow">{setupText.detailTabs.model.label}</div>
              <div className="summary-title">{setupText.model.entryTitle}</div>
            </div>
            {renderModelSettingsFields("detail")}
          </article>

          {selectedProfile ? (
            <article className="summary-card settings-model-card">
              <div className="setup-section-heading">
                <div className="eyebrow">{setupText.model.capabilitiesTitle}</div>
                <div className="summary-title">{setupText.model.capabilitiesTitle}</div>
                <div className="summary-text">
                  {setupText.model.capabilitiesDescription}
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
                        {feature.supported
                          ? setupText.model.supported
                          : setupText.model.unsupported}
                      </span>
                    </div>
                    <div className="model-capability-meta">
                      {feature.model
                        ? setupText.model.referenceModel(feature.model)
                        : setupText.model.noSpecificModel}
                      {feature.url ? (
                        <>
                          {" · "}
                          <a href={feature.url} rel="noreferrer" target="_blank">
                            {setupText.model.officialDocs}
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
                <div className="eyebrow">{setupText.model.capabilitiesTitle}</div>
                <div className="summary-title">{setupText.model.capabilitiesTitle}</div>
              </div>
              <div className="summary-text">{setupText.model.noCapabilities}</div>
            </article>
          )}
        </div>

        <article className="summary-card settings-model-entry">
          <div className="settings-model-entry-head">
            <div>
              <div className="eyebrow">{setupText.model.summaryTitle}</div>
              <div className="summary-title">{setupText.model.summaryTitle}</div>
            </div>
          </div>
          <div className="settings-model-entry-grid">
            <div className="summary-text">
              {setupText.model.accessMode(
                selectedModelMode?.label ?? setupText.model.notConfigured
              )}
            </div>
            <div className="summary-text">
              {setupText.model.profile(selectedProfile?.name ?? setupText.model.notConfigured)}
            </div>
            <div className="summary-text">{setupText.model.resolvedModel(resolvedModelName)}</div>
            <div className="summary-text">
              {setupText.model.status(
                profileReady ? setupText.model.ready : setupText.model.needsConfig
              )}
            </div>
            <div className="summary-text">
              {setupText.model.message(
                selectedProfile?.message ?? setupText.model.noExplanation
              )}
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
              <div className="eyebrow">{setupText.companions.eyebrow}</div>
              <div className="summary-title">{setupText.companions.title}</div>
            </div>
          </div>
          <div className="summary-text">
            {setupText.companions.description}
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
        title={selectedStory?.title ?? setupText.titleFallback}
        description={setupText.description}
        onBack={onBack}
        backLabel={setupText.backLabel}
        onClose={onClose}
        closeLabel={setupText.closeLabel}
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
              <span className="collapsed-pane-toggle-label">
                {setupText.layout.collapsedConfigLabel}
              </span>
              <span className="collapsed-pane-toggle-action">
                {setupText.layout.expandAction}
              </span>
            </button>
          ) : (
            <>
              <section className="setup-pane setup-pane-left" style={leftPaneStyle}>
                <div className="selection-column-header">
                  <div>
                    <div className="eyebrow">{setupText.overview.eyebrow}</div>
                    <h2>{setupText.overview.title}</h2>
                  </div>
                  <div className="setup-pane-header-actions">
                    <button
                      className="ghost-button ghost-button-small pane-header-button"
                      onClick={() => handleOpenSettingsDetail("game")}
                      type="button"
                    >
                      {setupText.layout.detailButton}
                    </button>
                    <button
                      className="ghost-button ghost-button-small pane-header-button pane-toggle-button"
                      onClick={handleToggleLeftCollapse}
                      type="button"
                    >
                      {setupText.layout.collapseButton}
                    </button>
                  </div>
                </div>

                <div className="setup-pane-scroll">
                  <article className="summary-card setup-section-card">
                    <div className="setup-section-heading">
                      <div className="eyebrow">{setupText.detailTabs.game.label}</div>
                      <div className="summary-title">{setupText.overview.gameTitle}</div>
                      <div className="summary-text">
                        {setupText.overview.gameDescription}
                      </div>
                    </div>
                    {renderGameSettingsFields("sidebar")}
                  </article>

                  <article className="summary-card setup-section-card">
                    <div className="setup-section-heading">
                      <div className="eyebrow">{setupText.detailTabs.model.label}</div>
                      <div className="summary-title">{setupText.detailTabs.model.label}</div>
                      <div className="summary-text">
                        {setupText.overview.modelDescription}
                      </div>
                    </div>
                    {renderModelSettingsFields("sidebar")}
                    <div className="setup-section-summary-list">
                      <div className="summary-text">
                        {setupText.model.currentProfile(
                          selectedProfile?.name ??
                            selectedModelMode?.label ??
                            setupText.model.notConfigured
                        )}
                      </div>
                      <div className="summary-text">
                        {setupText.model.resolvedModel(resolvedModelName)}
                      </div>
                      <div className="summary-text">
                        {setupText.model.status(
                          profileReady ? setupText.model.ready : setupText.model.needsConfig
                        )}
                      </div>
                    </div>
                  </article>

                  <article className="summary-card setup-section-card">
                    <div className="setup-section-heading">
                      <div className="eyebrow">{setupText.overview.currentRunTitle}</div>
                      <div className="summary-title">{setupText.overview.currentRunTitle}</div>
                    </div>
                    <div className="setup-section-summary-list">
                      <div className="summary-text">
                        {setupText.currentRun.rule(
                          selectedRule?.ruleTitle ?? setupText.currentRun.noRule
                        )}
                      </div>
                      <div className="summary-text">
                        {setupText.currentRun.story(
                          selectedStory?.title ?? setupText.currentRun.noStory
                        )}
                      </div>
                      <div className="summary-text">
                        {setupText.currentRun.tags(
                          renderJoinedList(selectedStory?.tags ?? [], text)
                        )}
                      </div>
                      <div className="summary-text">
                        {setupText.currentRun.gmStyle(
                          selectedStory?.gmStyle ?? setupText.currentRun.undecided
                        )}
                      </div>
                    </div>
                  </article>
                </div>

              </section>

              <button
                aria-label={setupText.layout.leftResizeAria}
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
                <div className="eyebrow">{setupText.preview.eyebrow}</div>
                <h2>{setupText.preview.title}</h2>
              </div>
              <button
                className="ghost-button ghost-button-small"
                disabled={openingPreviewLoading}
                onClick={onRegenerateOpeningPreview}
                type="button"
              >
                {openingPreviewLoading
                  ? setupText.preview.regenerateBusy
                  : setupText.preview.regenerate}
              </button>
            </div>

            <div className="setup-pane-scroll">
              <div className="setup-preview-card">
                <div className="setup-preview-visual">
                  {coverAsset ? (
                    <>
                      <img
                        alt={setupText.preview.coverAlt(
                          selectedStory?.title ?? setupText.preview.fallbackStoryTitle
                        )}
                        className="story-cover-image"
                        src={coverAsset.url}
                      />
                      <button
                        aria-label={setupText.preview.openCoverAria}
                        className="ghost-button story-cover-expand-button"
                        onClick={() => setIsCoverExpanded(true)}
                        type="button"
                      >
                        {setupText.preview.openCoverButton}
                      </button>
                      <div className="story-cover-placeholder story-cover-overlay">
                        <div className="eyebrow">{setupText.preview.eyebrow}</div>
                        <h2>{selectedStory?.title ?? setupText.preview.fallbackStoryTitle}</h2>
                        <p>{previewHeadline}</p>
                      </div>
                    </>
                  ) : (
                    <div className="story-cover-placeholder">
                      <div className="eyebrow">{setupText.preview.eyebrow}</div>
                      <h2>{selectedStory?.title ?? setupText.preview.fallbackStoryTitle}</h2>
                      <p>{previewHeadline}</p>
                    </div>
                  )}
                </div>

                <div className="opening-block setup-preview-copy">
                  {openingPreviewLoading && !hasPreviewText ? (
                    <p>{setupText.preview.generatingText}</p>
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
                        ? setupText.preview.streamingText
                        : setupText.preview.waitingText}
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
                <div className="eyebrow">{setupText.characterSetup.eyebrow}</div>
                <h2>{setupText.characterSetup.title}</h2>
                <p className="summary-text">
                  {setupText.characterSetup.description}
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
                  placeholder={setupText.characterSetup.placeholder}
                  value={characterConcept}
                  onChange={(event) => onCharacterConceptChange(event.target.value)}
                />
                {characterConceptAssistLoading ? (
                  <div className="character-setup-loading-overlay">
                    <div className="character-setup-loading-bar" />
                    <div className="character-setup-loading-copy">
                      {characterConceptAssistMode === "complete"
                        ? setupText.characterSetup.completing
                        : setupText.characterSetup.generating}
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
              <span className="collapsed-pane-toggle-label">
                {setupText.layout.collapsedAllyLabel}
              </span>
              <span className="collapsed-pane-toggle-action">
                {setupText.layout.expandAction}
              </span>
            </button>
          ) : (
            <>
              <button
                aria-label={setupText.layout.rightResizeAria}
                className="story-resize-handle"
                onPointerDown={(event) => handleSplitterPointerDown("right", event)}
                type="button"
              >
                <span className="story-resize-handle-line" />
              </button>

              <section className="setup-pane setup-pane-right" style={rightPaneStyle}>
                <div className="selection-column-header">
                    <div>
                    <div className="eyebrow">{setupText.companions.eyebrow}</div>
                    <h2>{setupText.companions.title}</h2>
                  </div>
                  <div className="setup-pane-header-actions">
                    <button
                      className="ghost-button ghost-button-small pane-header-button"
                      onClick={() => handleOpenSettingsDetail("companions")}
                      type="button"
                    >
                      {setupText.layout.detailButton}
                    </button>
                    <button
                      className="ghost-button ghost-button-small pane-header-button pane-toggle-button"
                      onClick={handleToggleRightCollapse}
                      type="button"
                    >
                      {setupText.layout.collapseButton}
                    </button>
                  </div>
                </div>

                <div className="setup-pane-scroll">
                  <article className="summary-card setup-section-card">
                    <div className="setup-section-heading">
                      <div className="eyebrow">{setupText.companions.eyebrow}</div>
                      <div className="summary-title">{setupText.companions.title}</div>
                      <div className="summary-text">
                        {setupText.companions.description}
                      </div>
                    </div>
                    {renderCompanionCards()}
                  </article>
                </div>

                <div className="setup-pane-footer setup-pane-actions-footer">
                  <button
                    aria-label={characterAssistAriaLabel}
                    className={`ghost-button character-assist-button${characterAssistShowsComplete ? " is-complete" : ""}`}
                    disabled={!canAssistCharacterConcept}
                    onClick={() => void onAssistCharacterConcept()}
                    type="button"
                  >
                    {characterConceptAssistLoading ? (
                      <span className="character-assist-button-static">
                        {characterAssistBusyLabel}
                      </span>
                    ) : (
                      <span aria-hidden="true" className="character-assist-button-label">
                        <span className="character-assist-button-text character-assist-button-text-generate">
                          {setupText.characterSetup.generateButton}
                        </span>
                        <span className="character-assist-button-text character-assist-button-text-complete">
                          {setupText.characterSetup.completeButton}
                        </span>
                      </span>
                    )}
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
                    {isCreating ? setupText.actions.creatingSession : setupText.actions.startGame}
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </form>

      {isSettingsDetailOpen ? (
        <div
          aria-label={setupText.modal.ariaLabel}
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
                <div className="eyebrow">{setupText.modal.titleFallback}</div>
                <h2>
                  {detailTabs.find((tab) => tab.value === activeDetailTab)?.label ??
                    setupText.modal.titleFallback}
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
                {setupText.modal.close}
              </button>
            </div>

            <div
              className="setup-detail-tabs"
              role="tablist"
              aria-label={setupText.modal.categoryTabsAria}
            >
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
          aria-label={setupText.coverDialogAria}
          className="story-cover-lightbox"
          onClick={() => setIsCoverExpanded(false)}
          role="dialog"
        >
          <div
            className="story-cover-lightbox-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label={setupText.closeCoverDialogAria}
              className="ghost-button story-cover-lightbox-close"
              onClick={() => setIsCoverExpanded(false)}
              type="button"
            >
              {setupText.closeImageButton}
            </button>
            <img
              alt={setupText.coverDialogAlt(
                selectedStory?.title ?? setupText.preview.fallbackStoryTitle
              )}
              className="story-cover-lightbox-image"
              src={coverAsset.url}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
