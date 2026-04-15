import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";

import type {
  AdvancedTextModelConfigInput,
  AiAppearanceTag,
  AiGenerationMetadata,
  AiPersonalityTag,
  BootstrapResponse,
  CharacterConceptAssistMode,
  ComicStylePreset,
  CreateSessionAiCompanionInput,
  CreateSessionRequest,
  RoleTextModelConfigInput,
  RuntimeImageModelConfigInput,
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
import {
  deleteAiCompanionPreset,
  loadAiCompanionPresets,
  storeAiCompanionPreset,
  type StoredAiCompanionPreset
} from "../storage.ts";
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
  advancedTextModelEnabled: boolean;
  advancedTextModelConfig: AdvancedTextModelConfigInput | null;
  imageProfileId: string;
  runtimeImageModelConfig: RuntimeImageModelConfigInput;
  comicStyleId: string;
  comicStyles: ComicStylePreset[];
  comicStylesLoading: boolean;
  comicStylesError: string | null;
  debugEnabled: boolean;
  logViewMode: NonNullable<CreateSessionRequest["logViewMode"]>;
  openingPreviewDeliveryMode: OpeningPreviewDeliveryMode;
  markdownFontSize: MarkdownFontSizePreset;
  characterConcept: string;
  primaryPlayerDisplayName: string;
  primaryPlayerPersonalityTagIds: string[];
  primaryPlayerAppearanceTagIds: string[];
  aiCompanions: CreateSessionAiCompanionInput[];
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
  onAdvancedTextModelEnabledChange: (value: boolean) => void;
  onAdvancedNarratorTextModelConfigChange: (value: RoleTextModelConfigInput | null) => void;
  onAdvancedPrimaryPlayerTextModelConfigChange: (value: RoleTextModelConfigInput | null) => void;
  onAdvancedCompanionTextModelConfigChange: (
    index: number,
    value: RoleTextModelConfigInput | null
  ) => void;
  onImageProfileIdChange: (value: string) => void;
  onImageProfileRuntimeConfigChange: (
    profileId: string,
    value: RuntimeImageModelConfigInput
  ) => void;
  onComicStyleIdChange: (value: string) => void;
  onDebugEnabledChange: (value: boolean) => void;
  onLogViewModeChange: (
    value: NonNullable<CreateSessionRequest["logViewMode"]>
  ) => void;
  onOpeningPreviewDeliveryModeChange: (value: OpeningPreviewDeliveryMode) => void;
  onMarkdownFontSizeChange: (value: MarkdownFontSizePreset) => void;
  onCharacterConceptChange: (value: string) => void;
  onUpdatePrimaryPlayerName: (value: string) => void;
  onApplyPrimaryPlayerFromPreset: (value: CreateSessionAiCompanionInput) => void;
  onTogglePrimaryPlayerPersonalityTag: (personalityTagId: string) => void;
  onTogglePrimaryPlayerAppearanceTag: (appearanceTagId: string) => void;
  onAddAiCompanion: () => void;
  onAddAiCompanionFromPreset: (value: CreateSessionAiCompanionInput) => void;
  onRemoveAiCompanion: (index: number) => void;
  onUpdateAiCompanionName: (index: number, value: string) => void;
  onToggleAiCompanionPersonalityTag: (index: number, personalityTagId: string) => void;
  onToggleAiCompanionAppearanceTag: (index: number, appearanceTagId: string) => void;
};

type DragTarget = "left" | "right" | null;
type SetupDetailTab = "game" | "model" | "companions";
type PresetPickerTarget =
  | "companion"
  | "primary_player_personality"
  | "primary_player_appearance"
  | null;

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

const EMPTY_RUNTIME_IMAGE_MODEL_CONFIG: RuntimeImageModelConfigInput = {
  apiKey: "",
  baseUrl: "",
  model: ""
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

function getEffectiveRuntimeConfig(
  runtimeConfig: RuntimeModelConfigInput | RuntimeImageModelConfigInput | undefined
): RuntimeModelConfigInput {
  return {
    apiKey: runtimeConfig?.apiKey?.trim() || "",
    baseUrl: runtimeConfig?.baseUrl?.trim() || "",
    model: runtimeConfig?.model?.trim() || ""
  };
}

function isImageProfileReady(
  selectedProfile: BootstrapResponse["imageProfiles"][number] | null,
  runtimeImageModelConfig: RuntimeModelConfigInput
): boolean {
  if (!selectedProfile) {
    return false;
  }

  if (selectedProfile.dependence === "Mock" || selectedProfile.configured) {
    return true;
  }

  const hasApiKey = (runtimeImageModelConfig.apiKey?.trim() ?? "").length > 0;
  const hasBaseUrl = (runtimeImageModelConfig.baseUrl?.trim() ?? "").length > 0;
  const hasModel = (runtimeImageModelConfig.model?.trim() ?? "").length > 0;
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

function normalizeRoleTextModelConfig(
  input: RoleTextModelConfigInput | null | undefined
): RoleTextModelConfigInput | null {
  if (!input) {
    return null;
  }

  const modelProfileId = input.modelProfileId?.trim() ?? "";
  const runtimeModelConfig = getEffectiveRuntimeConfig(input.runtimeModelConfig);
  if (
    !modelProfileId &&
    !runtimeModelConfig.apiKey &&
    !runtimeModelConfig.baseUrl &&
    !runtimeModelConfig.model
  ) {
    return null;
  }

  return {
    modelProfileId: modelProfileId || undefined,
    runtimeModelConfig:
      runtimeModelConfig.apiKey || runtimeModelConfig.baseUrl || runtimeModelConfig.model
        ? runtimeModelConfig
        : undefined
  };
}

export function GameSetupScreen(props: GameSetupScreenProps) {
  const text = useUiText();
  const setupText = text.gameSetupScreen;
  const settingsText = text.settingsScreen;
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
    advancedTextModelEnabled,
    advancedTextModelConfig,
    imageProfileId,
    runtimeImageModelConfig,
    comicStyleId,
    comicStyles,
    comicStylesLoading,
    comicStylesError,
    debugEnabled,
    logViewMode,
    openingPreviewDeliveryMode,
    markdownFontSize,
    characterConcept,
    primaryPlayerDisplayName,
    aiCompanions,
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
    onAdvancedTextModelEnabledChange,
    onAdvancedNarratorTextModelConfigChange,
    onAdvancedPrimaryPlayerTextModelConfigChange,
    onAdvancedCompanionTextModelConfigChange,
    onImageProfileIdChange,
    onImageProfileRuntimeConfigChange,
    onComicStyleIdChange,
    onDebugEnabledChange,
    onLogViewModeChange,
    onOpeningPreviewDeliveryModeChange,
    onMarkdownFontSizeChange,
    onCharacterConceptChange,
    onUpdatePrimaryPlayerName,
    primaryPlayerPersonalityTagIds,
    primaryPlayerAppearanceTagIds,
    onApplyPrimaryPlayerFromPreset,
    onTogglePrimaryPlayerPersonalityTag,
    onTogglePrimaryPlayerAppearanceTag,
    onAddAiCompanion,
    onAddAiCompanionFromPreset,
    onRemoveAiCompanion,
    onUpdateAiCompanionName,
    onToggleAiCompanionPersonalityTag,
    onToggleAiCompanionAppearanceTag
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<SetupLayoutState>(() => loadStoredLayout());
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [isCoverExpanded, setIsCoverExpanded] = useState(false);
  const [isSettingsDetailOpen, setIsSettingsDetailOpen] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<SetupDetailTab>("game");
  const [personalityEditorIndex, setPersonalityEditorIndex] = useState<number | null>(null);
  const [appearanceEditorIndex, setAppearanceEditorIndex] = useState<number | null>(null);
  const [isPrimaryPlayerPersonalityEditorOpen, setIsPrimaryPlayerPersonalityEditorOpen] =
    useState(false);
  const [isPrimaryPlayerAppearanceEditorOpen, setIsPrimaryPlayerAppearanceEditorOpen] =
    useState(false);
  const [savedCompanionPresets, setSavedCompanionPresets] = useState<StoredAiCompanionPreset[]>(
    () => loadAiCompanionPresets()
  );
  const [presetPickerTarget, setPresetPickerTarget] = useState<PresetPickerTarget>(null);

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

  useEffect(() => {
    if (personalityEditorIndex === null) {
      return;
    }

    if (personalityEditorIndex < aiCompanions.length) {
      return;
    }

    setPersonalityEditorIndex(aiCompanions.length ? aiCompanions.length - 1 : null);
  }, [aiCompanions.length, personalityEditorIndex]);

  useEffect(() => {
    if (appearanceEditorIndex === null) {
      return;
    }

    if (appearanceEditorIndex < aiCompanions.length) {
      return;
    }

    setAppearanceEditorIndex(aiCompanions.length ? aiCompanions.length - 1 : null);
  }, [aiCompanions.length, appearanceEditorIndex]);

  useEffect(() => {
    if (playMode === "story_mode") {
      return;
    }

    setIsPrimaryPlayerPersonalityEditorOpen(false);
    setIsPrimaryPlayerAppearanceEditorOpen(false);
    setPresetPickerTarget((current) =>
      current === "companion" ? current : null
    );
  }, [playMode]);

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

  function handleOpenPersonalityEditor(index: number): void {
    setIsPrimaryPlayerPersonalityEditorOpen(false);
    setIsPrimaryPlayerAppearanceEditorOpen(false);
    setPresetPickerTarget(null);
    setAppearanceEditorIndex(null);
    setPersonalityEditorIndex(index);
  }

  function handleClosePersonalityEditor(): void {
    setPersonalityEditorIndex(null);
  }

  function handleOpenAppearanceEditor(index: number): void {
    setIsPrimaryPlayerPersonalityEditorOpen(false);
    setIsPrimaryPlayerAppearanceEditorOpen(false);
    setPresetPickerTarget(null);
    setPersonalityEditorIndex(null);
    setAppearanceEditorIndex(index);
  }

  function handleCloseAppearanceEditor(): void {
    setAppearanceEditorIndex(null);
  }

  function handleOpenCompanionPresetPicker(): void {
    setPresetPickerTarget("companion");
  }

  function handleOpenPrimaryPlayerPersonalityEditor(): void {
    setPersonalityEditorIndex(null);
    setAppearanceEditorIndex(null);
    setPresetPickerTarget(null);
    setIsPrimaryPlayerAppearanceEditorOpen(false);
    setIsPrimaryPlayerPersonalityEditorOpen(true);
  }

  function handleClosePrimaryPlayerPersonalityEditor(): void {
    setIsPrimaryPlayerPersonalityEditorOpen(false);
  }

  function handleOpenPrimaryPlayerAppearanceEditor(): void {
    setPersonalityEditorIndex(null);
    setAppearanceEditorIndex(null);
    setPresetPickerTarget(null);
    setIsPrimaryPlayerPersonalityEditorOpen(false);
    setIsPrimaryPlayerAppearanceEditorOpen(true);
  }

  function handleClosePrimaryPlayerAppearanceEditor(): void {
    setIsPrimaryPlayerAppearanceEditorOpen(false);
  }

  function handleOpenPrimaryPlayerPresetPicker(mode: "personality" | "appearance"): void {
    setPresetPickerTarget(
      mode === "personality" ? "primary_player_personality" : "primary_player_appearance"
    );
  }

  function handleClosePresetPicker(): void {
    setPresetPickerTarget(null);
  }

  function handleSaveCompanionPreset(companion: CreateSessionAiCompanionInput): void {
    setSavedCompanionPresets(storeAiCompanionPreset(companion));
  }

  function handleUseSavedPreset(preset: StoredAiCompanionPreset): void {
    if (presetPickerTarget === "companion") {
      if (companionLimitReached) {
        return;
      }

      onAddAiCompanionFromPreset({
        displayName: preset.displayName,
        personalityTagIds: preset.personalityTagIds,
        appearanceTagIds: preset.appearanceTagIds
      });
      setPresetPickerTarget(null);
      return;
    }

    onApplyPrimaryPlayerFromPreset({
      displayName: preset.displayName,
      personalityTagIds: preset.personalityTagIds,
      appearanceTagIds: preset.appearanceTagIds
    });
    setPresetPickerTarget(null);
  }

  function handleDeleteCompanionPreset(presetId: string): void {
    setSavedCompanionPresets(deleteAiCompanionPreset(presetId));
  }

  function formatPresetTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();
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
  const selectedImageProfile =
    bootstrap?.imageProfiles.find((item) => item.id === imageProfileId) ??
    bootstrap?.imageProfiles[0] ??
    null;
  const selectedComicStyle =
    comicStyles.find((style) => style.id === comicStyleId) ?? comicStyles[0] ?? null;
  const comicStyleFieldHint = comicStylesLoading
    ? setupText.fields.comicStyleLoadingHint
    : comicStyles.length === 0
      ? comicStylesError
        ? `${setupText.fields.comicStyleUnavailableHint} ${setupText.model.message(comicStylesError)}`
        : setupText.fields.comicStyleUnavailableHint
      : `${setupText.fields.comicStyleHint}${
          selectedComicStyle ? ` ${setupText.model.message(selectedComicStyle.prompt)}` : ""
        }`;
  const effectiveImageRuntimeConfig = getEffectiveRuntimeConfig(runtimeImageModelConfig);
  const profileReady = isProfileReady(modelAccessMode, selectedProfile, runtimeModelConfig);
  const imageProfileReady = isImageProfileReady(
    selectedImageProfile,
    effectiveImageRuntimeConfig
  );
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
  const resolvedImageModelName =
    effectiveImageRuntimeConfig.model?.trim() ||
    selectedImageProfile?.baseModel ||
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
  const personalityTags = bootstrap?.personalityTags ?? [];
  const appearanceTags = bootstrap?.appearanceTags ?? [];
  const isStoryMode = playMode === "story_mode";
  const normalizedAdvancedTextModelConfig = advancedTextModelEnabled
    ? {
        narrator: normalizeRoleTextModelConfig(advancedTextModelConfig?.narrator),
        primaryPlayer: normalizeRoleTextModelConfig(advancedTextModelConfig?.primaryPlayer),
        companionOverrides: (advancedTextModelConfig?.companionOverrides ?? []).map((item) =>
          normalizeRoleTextModelConfig(item)
        )
      }
    : null;
  const advancedModelOverrideCount =
    (normalizedAdvancedTextModelConfig?.narrator ? 1 : 0) +
    (isStoryMode && normalizedAdvancedTextModelConfig?.primaryPlayer ? 1 : 0) +
    (normalizedAdvancedTextModelConfig?.companionOverrides ?? [])
      .slice(0, aiCompanions.length)
      .filter(Boolean).length;
  const companionLimitReached = aiCompanions.length >= 3;
  const hasSavedCompanionPresets = savedCompanionPresets.length > 0;
  const primaryPlayerSelectedPersonalityTags = personalityTags.filter((tag) =>
    primaryPlayerPersonalityTagIds.includes(tag.id)
  );
  const primaryPlayerSelectedAppearanceTags = appearanceTags.filter((tag) =>
    primaryPlayerAppearanceTagIds.includes(tag.id)
  );
  const editingCompanion =
    personalityEditorIndex !== null ? aiCompanions[personalityEditorIndex] ?? null : null;
  const editingCompanionSelectedTags = editingCompanion
    ? personalityTags.filter((tag) => editingCompanion.personalityTagIds.includes(tag.id))
    : [];
  const editingAppearanceCompanion =
    appearanceEditorIndex !== null ? aiCompanions[appearanceEditorIndex] ?? null : null;
  const editingCompanionSelectedAppearanceTags = editingAppearanceCompanion
    ? appearanceTags.filter((tag) =>
        (editingAppearanceCompanion.appearanceTagIds ?? []).includes(tag.id)
      )
    : [];
  const personalityTagSections: Array<{
    key: string;
    title: string;
    tags: AiPersonalityTag[];
  }> = [
    {
      key: "basic_positive",
      title: setupText.companions.basicPositiveLabel,
      tags: personalityTags.filter(
        (tag) => tag.group === "basic" && tag.polarity === "positive"
      )
    },
    {
      key: "basic_negative",
      title: setupText.companions.basicNegativeLabel,
      tags: personalityTags.filter(
        (tag) => tag.group === "basic" && tag.polarity === "negative"
      )
    },
    {
      key: "advanced_positive",
      title: setupText.companions.advancedPositiveLabel,
      tags: personalityTags.filter(
        (tag) => tag.group === "advanced" && tag.polarity === "positive"
      )
    },
    {
      key: "advanced_negative",
      title: setupText.companions.advancedNegativeLabel,
      tags: personalityTags.filter(
        (tag) => tag.group === "advanced" && tag.polarity === "negative"
      )
    }
  ].filter((section) => section.tags.length > 0);
  const appearanceTagSections: Array<{
    key: string;
    title: string;
    tags: AiAppearanceTag[];
  }> = [
    {
      key: "appearance",
      title: setupText.companions.appearanceLabel,
      tags: appearanceTags.filter((tag) => tag.category === "appearance")
    },
    {
      key: "outfit",
      title: setupText.companions.outfitLabel,
      tags: appearanceTags.filter((tag) => tag.category === "outfit")
    }
  ].filter((section) => section.tags.length > 0);

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

  function renderPrimaryPlayerConfiguratorCard(): React.ReactNode {
    if (!isStoryMode) {
      return null;
    }

    const previewPersonalityTags = primaryPlayerSelectedPersonalityTags.slice(0, 6);
    const hiddenPersonalityTagCount =
      primaryPlayerSelectedPersonalityTags.length - previewPersonalityTags.length;
    const previewAppearanceTags = primaryPlayerSelectedAppearanceTags.slice(0, 6);
    const hiddenAppearanceTagCount =
      primaryPlayerSelectedAppearanceTags.length - previewAppearanceTags.length;
    const protagonistNamePreview =
      primaryPlayerDisplayName.trim() || setupText.protagonist.namePlaceholder;

    return (
      <div className="companion-card story-mode-protagonist-card">
        <div className="selection-card-title">{setupText.protagonist.title}</div>
        <div className="summary-text">{setupText.protagonist.description}</div>
        <label className="companion-editor-field">
          <span>{setupText.protagonist.nameLabel}</span>
          <input
            type="text"
            value={primaryPlayerDisplayName}
            placeholder={setupText.protagonist.namePlaceholder}
            onChange={(event) => onUpdatePrimaryPlayerName(event.target.value)}
          />
        </label>
        <div className="summary-text">
          {setupText.protagonist.nameSummary(protagonistNamePreview)}
        </div>
        <div className="summary-text">
          {setupText.protagonist.selectionSummary(
            primaryPlayerSelectedPersonalityTags.length,
            primaryPlayerSelectedAppearanceTags.length
          )}
        </div>
        <div className="summary-text">
          {setupText.protagonist.savedPresetCount(savedCompanionPresets.length)}
        </div>

        <div className="companion-editor-selection">
          <div className="companion-selection-group">
            <div className="companion-selection-label">
              {setupText.protagonist.personalitySelectionLabel(
                primaryPlayerSelectedPersonalityTags.length
              )}
            </div>
            {primaryPlayerSelectedPersonalityTags.length ? (
              <div className="companion-selected-tags">
                {previewPersonalityTags.map((tag) => (
                  <span className="badge" key={tag.id}>
                    {tag.keyword}
                  </span>
                ))}
                {hiddenPersonalityTagCount > 0 ? (
                  <span className="badge">+{hiddenPersonalityTagCount}</span>
                ) : null}
              </div>
            ) : (
              <div className="companion-selected-placeholder">
                {setupText.protagonist.selectedPreviewEmpty}
              </div>
            )}
          </div>

          <div className="companion-selection-group">
            <div className="companion-selection-label">
              {setupText.protagonist.appearanceSelectionLabel(
                primaryPlayerSelectedAppearanceTags.length
              )}
            </div>
            {primaryPlayerSelectedAppearanceTags.length ? (
              <div className="companion-selected-tags">
                {previewAppearanceTags.map((tag) => (
                  <span className="badge" key={tag.id}>
                    {tag.keyword}
                  </span>
                ))}
                {hiddenAppearanceTagCount > 0 ? (
                  <span className="badge">+{hiddenAppearanceTagCount}</span>
                ) : null}
              </div>
            ) : (
              <div className="companion-selected-placeholder">
                {setupText.protagonist.appearancePreviewEmpty}
              </div>
            )}
          </div>
        </div>

        <div className="companion-editor-actions story-mode-protagonist-actions">
          <button
            className="ghost-button"
            onClick={handleOpenPrimaryPlayerPersonalityEditor}
            type="button"
          >
            {setupText.protagonist.configurePersonalityButton}
          </button>
          <button
            className="ghost-button"
            onClick={handleOpenPrimaryPlayerAppearanceEditor}
            type="button"
          >
            {setupText.protagonist.configureAppearanceButton}
          </button>
        </div>
      </div>
    );
  }

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

        {renderPrimaryPlayerConfiguratorCard()}
      </div>
    );
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

  function buildDefaultRoleTextModelConfig(): RoleTextModelConfigInput {
    return {
      modelProfileId,
      runtimeModelConfig: undefined
    };
  }

  function isAdvancedRoleTextModelReady(
    roleConfig: RoleTextModelConfigInput | null | undefined
  ): boolean {
    const normalizedRoleConfig = normalizeRoleTextModelConfig(roleConfig);
    if (!normalizedRoleConfig) {
      return true;
    }

    const resolvedProfileId = normalizedRoleConfig.modelProfileId ?? modelProfileId;
    const selectedRoleProfile =
      availableProfiles.find((profile) => profile.id === resolvedProfileId) ?? null;
    const resolvedRuntimeModelConfig =
      normalizedRoleConfig.runtimeModelConfig ?? runtimeModelConfig;

    return isProfileReady(
      modelAccessMode,
      selectedRoleProfile,
      resolvedRuntimeModelConfig
    );
  }

  const advancedModelReady =
    !advancedTextModelEnabled ||
    isAdvancedRoleTextModelReady(normalizedAdvancedTextModelConfig?.narrator) &&
      (!isStoryMode ||
        isAdvancedRoleTextModelReady(normalizedAdvancedTextModelConfig?.primaryPlayer)) &&
      (normalizedAdvancedTextModelConfig?.companionOverrides ?? [])
        .slice(0, aiCompanions.length)
        .every((item) => isAdvancedRoleTextModelReady(item));
  const narratorModelReady =
    normalizedAdvancedTextModelConfig?.narrator
      ? isAdvancedRoleTextModelReady(normalizedAdvancedTextModelConfig.narrator)
      : profileReady;
  const primaryPlayerModelReady =
    !isStoryMode
      ? true
      : normalizedAdvancedTextModelConfig?.primaryPlayer
        ? isAdvancedRoleTextModelReady(normalizedAdvancedTextModelConfig.primaryPlayer)
        : profileReady;
  const companionModelsReady = aiCompanions.every((_, index) => {
    const companionOverride =
      normalizedAdvancedTextModelConfig?.companionOverrides?.[index] ?? null;
    return companionOverride
      ? isAdvancedRoleTextModelReady(companionOverride)
      : profileReady;
  });
  const sessionTextModelReady =
    narratorModelReady &&
    primaryPlayerModelReady &&
    companionModelsReady &&
    advancedModelReady;
  const canAssistCharacterConcept =
    !characterConceptAssistLoading &&
    !isCreating &&
    !openingPreviewLoading &&
    hasPreviewText &&
    narratorModelReady;

  function renderAdvancedRoleModelCard(input: {
    title: string;
    description: string;
    roleConfig: RoleTextModelConfigInput | null | undefined;
    onChange: (value: RoleTextModelConfigInput | null) => void;
  }): React.ReactNode {
    const normalizedRoleConfig = normalizeRoleTextModelConfig(input.roleConfig);
    const usesDefaultModel = !normalizedRoleConfig;
    const resolvedProfileId = normalizedRoleConfig?.modelProfileId ?? modelProfileId;
    const selectedRoleProfile =
      availableProfiles.find((profile) => profile.id === resolvedProfileId) ?? selectedProfile;
    const roleReady = usesDefaultModel
      ? profileReady
      : isAdvancedRoleTextModelReady(normalizedRoleConfig);

    return (
      <article
        className={`setup-advanced-model-card${
          roleReady ? "" : " setup-advanced-model-card-warning"
        }`}
      >
        <div className="setup-advanced-model-card-head">
          <div>
            <div className="summary-title">{input.title}</div>
            <div className="summary-text">{input.description}</div>
          </div>
          <span className={`summary-chip${roleReady ? "" : " summary-chip-warning"}`}>
            {usesDefaultModel
              ? setupText.advancedModel.followDefaultBadge
              : roleReady
                ? setupText.model.ready
                : setupText.model.needsConfig}
          </span>
        </div>

        <label className="toggle-row">
          <input
            checked={usesDefaultModel}
            type="checkbox"
            onChange={(event) =>
              input.onChange(
                event.target.checked ? null : buildDefaultRoleTextModelConfig()
              )
            }
          />
          <span>{setupText.advancedModel.inheritDefault}</span>
        </label>

        {usesDefaultModel ? (
          <div className="summary-text">
            {setupText.advancedModel.followingDefault(
              selectedProfile?.name ?? setupText.model.notConfigured
            )}
          </div>
        ) : (
          <label className="field">
            <span>{setupText.advancedModel.roleModelProfile}</span>
            <select
              value={resolvedProfileId}
              onChange={(event) =>
                input.onChange({
                  ...(normalizedRoleConfig ?? buildDefaultRoleTextModelConfig()),
                  modelProfileId: event.target.value
                })
              }
            >
              {availableProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
            <div className="field-hint">
              {selectedRoleProfile?.description ?? setupText.fields.modelProfileHint}
            </div>
          </label>
        )}
      </article>
    );
  }

  function renderAdvancedTextModelSection(
    layoutMode: "sidebar" | "detail"
  ): React.ReactNode {
    const sectionClassName =
      layoutMode === "detail"
        ? "setup-advanced-model-section setup-advanced-model-section-full"
        : "setup-advanced-model-section";

    return (
      <div className={sectionClassName}>
        <div className="setup-advanced-model-toggle">
          <div>
            <div className="summary-title">{setupText.advancedModel.title}</div>
            <div className="summary-text">
              {advancedTextModelEnabled
                ? setupText.advancedModel.enabledSummary(advancedModelOverrideCount)
                : setupText.advancedModel.description}
            </div>
          </div>
          <label className="toggle-row">
            <input
              checked={advancedTextModelEnabled}
              type="checkbox"
              onChange={(event) => onAdvancedTextModelEnabledChange(event.target.checked)}
            />
            <span>
              {advancedTextModelEnabled
                ? setupText.advancedModel.enabled
                : setupText.advancedModel.disabled}
            </span>
          </label>
        </div>

        {advancedTextModelEnabled ? (
          <div className="setup-advanced-model-stack">
            {renderAdvancedRoleModelCard({
              title: setupText.advancedModel.narratorTitle,
              description: setupText.advancedModel.narratorDescription,
              roleConfig: normalizedAdvancedTextModelConfig?.narrator,
              onChange: onAdvancedNarratorTextModelConfigChange
            })}

            {isStoryMode
              ? renderAdvancedRoleModelCard({
                  title: setupText.advancedModel.primaryPlayerTitle,
                  description: setupText.advancedModel.primaryPlayerDescription,
                  roleConfig: normalizedAdvancedTextModelConfig?.primaryPlayer,
                  onChange: onAdvancedPrimaryPlayerTextModelConfigChange
                })
              : null}

            {aiCompanions.length > 0 ? (
              <div className="setup-advanced-model-group">
                <div className="setup-advanced-model-group-title">
                  {setupText.advancedModel.companionsTitle}
                </div>
                <div className="setup-advanced-model-stack">
                  {aiCompanions.map((companion, index) =>
                    renderAdvancedRoleModelCard({
                      title: setupText.advancedModel.companionTitle(
                        companion.displayName.trim() ||
                          setupText.advancedModel.companionFallback(index + 1)
                      ),
                      description: setupText.advancedModel.companionDescription,
                      roleConfig:
                        normalizedAdvancedTextModelConfig?.companionOverrides?.[index],
                      onChange: (value) =>
                        onAdvancedCompanionTextModelConfigChange(index, value)
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="summary-text">
                {setupText.advancedModel.noCompanions}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  function renderModelSettingsFields(layoutMode: "sidebar" | "detail"): React.ReactNode {
    const containerClassName =
      layoutMode === "detail" ? "setup-detail-fields-grid" : "setup-section-field-stack";

    return (
      <>
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

        {renderAdvancedTextModelSection(layoutMode)}
      </>
    );
  }

  function renderImageModelSettingsFields(layoutMode: "sidebar" | "detail"): React.ReactNode {
    const containerClassName =
      layoutMode === "detail" ? "setup-detail-fields-grid" : "setup-section-field-stack";

    return (
      <>
        <div className={containerClassName}>
          <SettingField
            label={setupText.fields.comicStyleLabel}
            hint={comicStyleFieldHint}
          >
            <select
              disabled={comicStylesLoading || comicStyles.length === 0}
              value={selectedComicStyle?.id ?? ""}
              onChange={(event) => onComicStyleIdChange(event.target.value)}
            >
              {comicStyles.length === 0 ? (
                <option value="">
                  {comicStylesLoading
                    ? setupText.fields.comicStyleLoadingOption
                    : setupText.fields.comicStyleUnavailableOption}
                </option>
              ) : (
                comicStyles.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.name}
                  </option>
                ))
              )}
            </select>
          </SettingField>

          <SettingField
            label={settingsText.imageModelProfile}
            hint={selectedImageProfile?.description ?? setupText.fields.modelProfileHint}
          >
            <select
              value={selectedImageProfile?.id ?? imageProfileId}
              onChange={(event) => onImageProfileIdChange(event.target.value)}
            >
              {bootstrap?.imageProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </SettingField>

          <SettingField
            label={settingsText.imageModelNameOverride}
            hint={
              selectedImageProfile?.baseModel
                ? setupText.model.referenceModel(selectedImageProfile.baseModel)
                : settingsText.modelPlaceholder
            }
          >
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
          </SettingField>

          <SettingField
            label={settingsText.imageApiKeyOverride}
            hint={settingsText.apiKeyPlaceholder}
          >
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
          </SettingField>

          <SettingField
            label={settingsText.imageBaseUrlOverride}
            hint={settingsText.baseUrlPlaceholder}
          >
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
          </SettingField>
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
      </>
    );
  }

  function renderCapabilityList(
    features:
      | BootstrapResponse["modelProfiles"][number]["featureDetails"]
      | BootstrapResponse["imageProfiles"][number]["featureDetails"]
  ): React.ReactNode {
    return (
      <div className="model-capability-list">
        {features.map((feature) => (
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
                {feature.supported ? setupText.model.supported : setupText.model.unsupported}
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
    );
  }

  function renderPersonalityTagSection(
    section: {
      key: string;
      title: string;
      tags: AiPersonalityTag[];
    },
    selectedTagIds: string[],
    onToggleTag: (personalityTagId: string) => void
  ): React.ReactNode {
    return (
      <div className="companion-tag-section" key={section.key}>
        <div className="companion-tag-section-title">{section.title}</div>
        <div className="companion-tag-list">
          {section.tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);

            return (
              <button
                className={`companion-tag-button${isSelected ? " companion-tag-button-selected" : ""}`}
                key={tag.id}
                onClick={() => onToggleTag(tag.id)}
                title={tag.description}
                type="button"
              >
                <span>{tag.keyword}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderAppearanceTagSection(
    section: {
      key: string;
      title: string;
      tags: AiAppearanceTag[];
    },
    selectedTagIds: string[],
    onToggleTag: (appearanceTagId: string) => void
  ): React.ReactNode {
    return (
      <div className="companion-tag-section" key={section.key}>
        <div className="companion-tag-section-title">{section.title}</div>
        <div className="companion-tag-list">
          {section.tags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);

            return (
              <button
                className={`companion-tag-button${isSelected ? " companion-tag-button-selected" : ""}`}
                key={tag.id}
                onClick={() => onToggleTag(tag.id)}
                title={tag.description}
                type="button"
              >
                <span>{tag.keyword}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderCompanionEditor(
    companion: CreateSessionAiCompanionInput,
    index: number
  ): React.ReactNode {
    const selectedPersonalityTags = personalityTags.filter((tag) =>
      companion.personalityTagIds.includes(tag.id)
    );
    const selectedAppearanceTags = appearanceTags.filter((tag) =>
      (companion.appearanceTagIds ?? []).includes(tag.id)
    );
    const companionDisplayName =
      companion.displayName.trim() || setupText.companions.namePlaceholder(index + 1);
    const previewPersonalityTags = selectedPersonalityTags.slice(0, 6);
    const hiddenPersonalityTagCount =
      selectedPersonalityTags.length - previewPersonalityTags.length;
    const previewAppearanceTags = selectedAppearanceTags.slice(0, 6);
    const hiddenAppearanceTagCount =
      selectedAppearanceTags.length - previewAppearanceTags.length;
    const canSavePreset =
      companion.displayName.trim().length > 0 ||
      companion.personalityTagIds.length > 0 ||
      (companion.appearanceTagIds?.length ?? 0) > 0;

    return (
      <div className="companion-card companion-editor-card" key={`companion-${index}`}>
        <div className="companion-editor-head">
          <div>
            <div className="selection-card-title">
              {setupText.companions.memberTitle(index + 1)}
            </div>
            <div className="summary-text">
              {setupText.companions.selectionSummary(
                selectedPersonalityTags.length,
                selectedAppearanceTags.length
              )}
            </div>
          </div>
          <button
            className="ghost-button ghost-button-small"
            onClick={() => onRemoveAiCompanion(index)}
            type="button"
          >
            {setupText.companions.removeButton}
          </button>
        </div>

        <label className="companion-editor-field">
          <span>{setupText.companions.nameLabel}</span>
          <input
            type="text"
            value={companion.displayName}
            placeholder={setupText.companions.namePlaceholder(index + 1)}
            onChange={(event) => onUpdateAiCompanionName(index, event.target.value)}
          />
        </label>

        <div className="companion-editor-selection">
          <div className="summary-text">{companionDisplayName}</div>
          <div className="companion-selection-group">
            <div className="companion-selection-label">
              {setupText.companions.personalitySelectionLabel(selectedPersonalityTags.length)}
            </div>
            {selectedPersonalityTags.length ? (
              <div className="companion-selected-tags">
                {previewPersonalityTags.map((tag) => (
                  <span className="badge" key={tag.id}>
                    {tag.keyword}
                  </span>
                ))}
                {hiddenPersonalityTagCount > 0 ? (
                  <span className="badge">+{hiddenPersonalityTagCount}</span>
                ) : null}
              </div>
            ) : (
              <div className="companion-selected-placeholder">
                {setupText.companions.selectedPreviewEmpty}
              </div>
            )}
          </div>
          <div className="companion-selection-group">
            <div className="companion-selection-label">
              {setupText.companions.appearanceSelectionLabel(selectedAppearanceTags.length)}
            </div>
            {selectedAppearanceTags.length ? (
              <div className="companion-selected-tags">
                {previewAppearanceTags.map((tag) => (
                  <span className="badge" key={tag.id}>
                    {tag.keyword}
                  </span>
                ))}
                {hiddenAppearanceTagCount > 0 ? (
                  <span className="badge">+{hiddenAppearanceTagCount}</span>
                ) : null}
              </div>
            ) : (
              <div className="companion-selected-placeholder">
                {setupText.companions.appearancePreviewEmpty}
              </div>
            )}
          </div>
        </div>

        <div className="companion-editor-actions">
          <button
            className="ghost-button"
            disabled={!canSavePreset}
            onClick={() => handleSaveCompanionPreset(companion)}
            type="button"
          >
            {setupText.companions.savePresetButton}
          </button>
          <button
            className="ghost-button"
            onClick={() => handleOpenPersonalityEditor(index)}
            type="button"
          >
            {setupText.companions.configureButton}
          </button>
          <button
            className="ghost-button"
            onClick={() => handleOpenAppearanceEditor(index)}
            type="button"
          >
            {setupText.companions.configureAppearanceButton}
          </button>
        </div>
      </div>
    );
  }

  function renderPersonalityEditorModal(): React.ReactNode {
    if (editingCompanion === null || personalityEditorIndex === null) {
      return null;
    }

    const companionDisplayName =
      editingCompanion.displayName.trim() ||
      setupText.companions.namePlaceholder(personalityEditorIndex + 1);

    return (
      <div
        aria-label={setupText.companions.configureButton}
        className="companion-personality-modal-backdrop"
        onClick={handleClosePersonalityEditor}
        role="dialog"
      >
        <div
          className="companion-personality-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="companion-personality-modal-header">
            <div>
              <div className="eyebrow">{setupText.companions.eyebrow}</div>
              <h2>{companionDisplayName}</h2>
              <div className="summary-text">
                {setupText.companions.configureDescription}
              </div>
            </div>
            <button
              className="ghost-button ghost-button-small"
              onClick={handleClosePersonalityEditor}
              type="button"
            >
              {setupText.modal.close}
            </button>
          </div>

          <div className="companion-personality-modal-summary">
            <div className="companion-personality-modal-selection">
              <div className="companion-personality-modal-selection-head">
                <div className="companion-personality-modal-selection-title">
                  {setupText.companions.selectedCount(editingCompanionSelectedTags.length)}
                </div>
                <div className="summary-text">{setupText.companions.tagHint}</div>
              </div>
              {editingCompanionSelectedTags.length ? (
                <div className="companion-selected-tags">
                  {editingCompanionSelectedTags.map((tag) => (
                    <span className="badge" key={tag.id}>
                      {tag.keyword}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="companion-selected-placeholder">
                  {setupText.companions.selectedPreviewEmpty}
                </div>
              )}
            </div>

            {personalityTagSections.length ? (
              <div className="companion-tag-sections">
                {personalityTagSections.map((section) =>
                  renderPersonalityTagSection(
                    section,
                    aiCompanions[personalityEditorIndex]?.personalityTagIds ?? [],
                    (tagId) => onToggleAiCompanionPersonalityTag(personalityEditorIndex, tagId)
                  )
                )}
              </div>
            ) : (
              <div className="empty-state companion-personality-modal-empty">
                {setupText.companions.noTags}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderCompanionPresetPickerModal(): React.ReactNode {
    if (!presetPickerTarget) {
      return null;
    }

    const isPrimaryPlayerPresetPicker =
      presetPickerTarget === "primary_player_personality" ||
      presetPickerTarget === "primary_player_appearance";
    const pickerText = isPrimaryPlayerPresetPicker
      ? setupText.protagonist
      : setupText.companions;
    const presetUseDisabled = presetPickerTarget === "companion" && companionLimitReached;

    return (
      <div
        aria-label={pickerText.loadPresetTitle}
        className="companion-personality-modal-backdrop"
        onClick={handleClosePresetPicker}
        role="dialog"
      >
        <div
          className="companion-personality-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="companion-personality-modal-header">
            <div>
              <div className="eyebrow">{pickerText.eyebrow}</div>
              <h2>{pickerText.loadPresetTitle}</h2>
              <div className="summary-text">{pickerText.loadPresetDescription}</div>
            </div>
            <button
              className="ghost-button ghost-button-small"
              onClick={handleClosePresetPicker}
              type="button"
            >
              {setupText.modal.close}
            </button>
          </div>

          <div className="companion-personality-modal-summary">
            {hasSavedCompanionPresets ? (
              <div className="companion-preset-list">
                {savedCompanionPresets.map((preset) => {
                  const selectedPersonalityTags = personalityTags.filter((tag) =>
                    preset.personalityTagIds.includes(tag.id)
                  );
                  const selectedAppearanceTags = appearanceTags.filter((tag) =>
                    (preset.appearanceTagIds ?? []).includes(tag.id)
                  );
                  const previewPersonalityTags = selectedPersonalityTags.slice(0, 6);
                  const hiddenPersonalityTagCount =
                    selectedPersonalityTags.length - previewPersonalityTags.length;
                  const previewAppearanceTags = selectedAppearanceTags.slice(0, 6);
                  const hiddenAppearanceTagCount =
                    selectedAppearanceTags.length - previewAppearanceTags.length;
                  const presetDisplayName =
                    preset.displayName.trim() || pickerText.presetNameFallback;

                  return (
                    <article className="companion-preset-item" key={preset.id}>
                      <div className="companion-preset-head">
                        <div className="companion-preset-meta">
                          <div className="selection-card-title">{presetDisplayName}</div>
                          <div className="summary-text">
                            {pickerText.selectionSummary(
                              preset.personalityTagIds.length,
                              preset.appearanceTagIds.length
                            )}
                          </div>
                          <div className="summary-text">
                            {setupText.companions.presetSavedAt(formatPresetTimestamp(preset.updatedAt))}
                          </div>
                        </div>

                        <div className="companion-preset-actions">
                          <button
                            className="ghost-button ghost-button-small"
                            disabled={presetUseDisabled}
                            onClick={() => handleUseSavedPreset(preset)}
                            type="button"
                          >
                            {pickerText.usePresetButton}
                          </button>
                          <button
                            className="ghost-button ghost-button-small ghost-button-danger"
                            onClick={() => handleDeleteCompanionPreset(preset.id)}
                            type="button"
                          >
                            {text.common.delete}
                          </button>
                        </div>
                      </div>

                      <div className="companion-selection-group">
                        <div className="companion-selection-label">
                          {pickerText.personalitySelectionLabel(selectedPersonalityTags.length)}
                        </div>
                        {selectedPersonalityTags.length ? (
                          <div className="companion-selected-tags">
                            {previewPersonalityTags.map((tag) => (
                              <span className="badge" key={tag.id}>
                                {tag.keyword}
                              </span>
                            ))}
                            {hiddenPersonalityTagCount > 0 ? (
                              <span className="badge">+{hiddenPersonalityTagCount}</span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="companion-selected-placeholder">
                            {pickerText.selectedPreviewEmpty}
                          </div>
                        )}
                      </div>
                      <div className="companion-selection-group">
                        <div className="companion-selection-label">
                          {pickerText.appearanceSelectionLabel(selectedAppearanceTags.length)}
                        </div>
                        {selectedAppearanceTags.length ? (
                          <div className="companion-selected-tags">
                            {previewAppearanceTags.map((tag) => (
                              <span className="badge" key={tag.id}>
                                {tag.keyword}
                              </span>
                            ))}
                            {hiddenAppearanceTagCount > 0 ? (
                              <span className="badge">+{hiddenAppearanceTagCount}</span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="companion-selected-placeholder">
                            {pickerText.appearancePreviewEmpty}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state companion-preset-modal-empty">
                {setupText.companions.noSavedPresets}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderPrimaryPlayerPersonalityEditorModal(): React.ReactNode {
    if (!isPrimaryPlayerPersonalityEditorOpen) {
      return null;
    }

    return (
      <div
        aria-label={setupText.protagonist.configurePersonalityButton}
        className="companion-personality-modal-backdrop"
        onClick={handleClosePrimaryPlayerPersonalityEditor}
        role="dialog"
      >
        <div
          className="companion-personality-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="companion-personality-modal-header">
            <div>
              <div className="eyebrow">{setupText.protagonist.eyebrow}</div>
              <h2>{setupText.protagonist.title}</h2>
              <div className="summary-text">
                {setupText.protagonist.configurePersonalityDescription}
              </div>
            </div>
            <div className="companion-personality-modal-header-actions">
              <button
                className="ghost-button ghost-button-small"
                disabled={!hasSavedCompanionPresets}
                onClick={() => handleOpenPrimaryPlayerPresetPicker("personality")}
                type="button"
              >
                {setupText.protagonist.loadPresetButton}
              </button>
              <button
                className="ghost-button ghost-button-small"
                onClick={handleClosePrimaryPlayerPersonalityEditor}
                type="button"
              >
                {setupText.modal.close}
              </button>
            </div>
          </div>

          <div className="companion-personality-modal-summary">
            <div className="companion-personality-modal-selection">
              <div className="companion-personality-modal-selection-head">
                <div className="companion-personality-modal-selection-title">
                  {setupText.protagonist.personalitySelectionLabel(
                    primaryPlayerSelectedPersonalityTags.length
                  )}
                </div>
                <div className="summary-text">{setupText.protagonist.tagHint}</div>
              </div>
              {primaryPlayerSelectedPersonalityTags.length ? (
                <div className="companion-selected-tags">
                  {primaryPlayerSelectedPersonalityTags.map((tag) => (
                    <span className="badge" key={tag.id}>
                      {tag.keyword}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="companion-selected-placeholder">
                  {setupText.protagonist.selectedPreviewEmpty}
                </div>
              )}
            </div>

            {personalityTagSections.length ? (
              <div className="companion-tag-sections">
                {personalityTagSections.map((section) =>
                  renderPersonalityTagSection(
                    section,
                    primaryPlayerPersonalityTagIds,
                    onTogglePrimaryPlayerPersonalityTag
                  )
                )}
              </div>
            ) : (
              <div className="empty-state companion-personality-modal-empty">
                {setupText.protagonist.noTags}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderPrimaryPlayerAppearanceEditorModal(): React.ReactNode {
    if (!isPrimaryPlayerAppearanceEditorOpen) {
      return null;
    }

    return (
      <div
        aria-label={setupText.protagonist.configureAppearanceButton}
        className="companion-personality-modal-backdrop"
        onClick={handleClosePrimaryPlayerAppearanceEditor}
        role="dialog"
      >
        <div
          className="companion-personality-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="companion-personality-modal-header">
            <div>
              <div className="eyebrow">{setupText.protagonist.eyebrow}</div>
              <h2>{setupText.protagonist.title}</h2>
              <div className="summary-text">
                {setupText.protagonist.configureAppearanceDescription}
              </div>
            </div>
            <div className="companion-personality-modal-header-actions">
              <button
                className="ghost-button ghost-button-small"
                disabled={!hasSavedCompanionPresets}
                onClick={() => handleOpenPrimaryPlayerPresetPicker("appearance")}
                type="button"
              >
                {setupText.protagonist.loadPresetButton}
              </button>
              <button
                className="ghost-button ghost-button-small"
                onClick={handleClosePrimaryPlayerAppearanceEditor}
                type="button"
              >
                {setupText.modal.close}
              </button>
            </div>
          </div>

          <div className="companion-personality-modal-summary">
            <div className="companion-personality-modal-selection">
              <div className="companion-personality-modal-selection-head">
                <div className="companion-personality-modal-selection-title">
                  {setupText.protagonist.appearanceSelectionLabel(
                    primaryPlayerSelectedAppearanceTags.length
                  )}
                </div>
                <div className="summary-text">{setupText.protagonist.appearanceTagHint}</div>
              </div>
              {primaryPlayerSelectedAppearanceTags.length ? (
                <div className="companion-selected-tags">
                  {primaryPlayerSelectedAppearanceTags.map((tag) => (
                    <span className="badge" key={tag.id}>
                      {tag.keyword}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="companion-selected-placeholder">
                  {setupText.protagonist.appearancePreviewEmpty}
                </div>
              )}
            </div>

            {appearanceTagSections.length ? (
              <div className="companion-tag-sections">
                {appearanceTagSections.map((section) =>
                  renderAppearanceTagSection(
                    section,
                    primaryPlayerAppearanceTagIds,
                    onTogglePrimaryPlayerAppearanceTag
                  )
                )}
              </div>
            ) : (
              <div className="empty-state companion-personality-modal-empty">
                {setupText.protagonist.noAppearanceTags}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderAppearanceEditorModal(): React.ReactNode {
    if (editingAppearanceCompanion === null || appearanceEditorIndex === null) {
      return null;
    }

    const companionDisplayName =
      editingAppearanceCompanion.displayName.trim() ||
      setupText.companions.namePlaceholder(appearanceEditorIndex + 1);

    return (
      <div
        aria-label={setupText.companions.configureAppearanceButton}
        className="companion-personality-modal-backdrop"
        onClick={handleCloseAppearanceEditor}
        role="dialog"
      >
        <div
          className="companion-personality-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="companion-personality-modal-header">
            <div>
              <div className="eyebrow">{setupText.companions.eyebrow}</div>
              <h2>{companionDisplayName}</h2>
              <div className="summary-text">
                {setupText.companions.configureAppearanceDescription}
              </div>
            </div>
            <button
              className="ghost-button ghost-button-small"
              onClick={handleCloseAppearanceEditor}
              type="button"
            >
              {setupText.modal.close}
            </button>
          </div>

          <div className="companion-personality-modal-summary">
            <div className="companion-personality-modal-selection">
              <div className="companion-personality-modal-selection-head">
                <div className="companion-personality-modal-selection-title">
                  {setupText.companions.appearanceSelectionLabel(
                    editingCompanionSelectedAppearanceTags.length
                  )}
                </div>
                <div className="summary-text">{setupText.companions.appearanceTagHint}</div>
              </div>
              {editingCompanionSelectedAppearanceTags.length ? (
                <div className="companion-selected-tags">
                  {editingCompanionSelectedAppearanceTags.map((tag) => (
                    <span className="badge" key={tag.id}>
                      {tag.keyword}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="companion-selected-placeholder">
                  {setupText.companions.appearancePreviewEmpty}
                </div>
              )}
            </div>

            {appearanceTagSections.length ? (
              <div className="companion-tag-sections">
                {appearanceTagSections.map((section) =>
                  renderAppearanceTagSection(
                    section,
                    aiCompanions[appearanceEditorIndex]?.appearanceTagIds ?? [],
                    (tagId) => onToggleAiCompanionAppearanceTag(appearanceEditorIndex, tagId)
                  )
                )}
              </div>
            ) : (
              <div className="empty-state companion-personality-modal-empty">
                {setupText.companions.noAppearanceTags}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderCompanionCards(gridClassName?: string): React.ReactNode {
    return (
      <div className={gridClassName ?? "companion-list"}>
        <div className="companion-card">
          <div className="selection-card-title">{setupText.companions.entryTitle}</div>
          <div className="summary-text">
            {isStoryMode
              ? setupText.companions.storyModeDescription
              : setupText.companions.entryDescription}
          </div>
          <div className="summary-text">
            {setupText.companions.count(aiCompanions.length)}
          </div>
        </div>

        {aiCompanions.length ? (
          aiCompanions.map((companion, index) => renderCompanionEditor(companion, index))
        ) : (
          <div className="companion-card">
            <div className="selection-card-title">{setupText.companions.emptyTitle}</div>
            <div className="summary-text">{setupText.companions.emptyDescription}</div>
          </div>
        )}

        <div className="companion-card">
          <div className="selection-card-title">{setupText.companions.addTitle}</div>
          <div className="summary-text">{setupText.companions.addDescription}</div>
          <div className="summary-text">
            {setupText.companions.savedPresetCount(savedCompanionPresets.length)}
          </div>
          {companionLimitReached ? (
            <div className="summary-text">{setupText.companions.limitReached}</div>
          ) : null}
          <div className="companion-editor-actions">
            <button
              className="ghost-button"
              disabled={companionLimitReached}
              onClick={onAddAiCompanion}
              type="button"
            >
              {setupText.companions.addButton}
            </button>
            <button
              className="ghost-button"
              disabled={companionLimitReached || !hasSavedCompanionPresets}
              onClick={handleOpenCompanionPresetPicker}
              type="button"
            >
              {setupText.companions.loadPresetButton}
            </button>
          </div>
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
              <div className="eyebrow">{settingsText.textModelEyebrow}</div>
              <div className="summary-title">{settingsText.textModelTitle}</div>
            </div>
            {renderModelSettingsFields("detail")}
          </article>

          {selectedProfile ? (
            <article className="summary-card settings-model-card">
              <div className="setup-section-heading">
                <div className="eyebrow">{settingsText.textModelEyebrow}</div>
                <div className="summary-title">{setupText.model.capabilitiesTitle}</div>
                <div className="summary-text">
                  {setupText.model.capabilitiesDescription}
                </div>
              </div>
              {renderCapabilityList(selectedProfile.featureDetails)}
            </article>
          ) : (
            <article className="summary-card settings-model-card">
              <div className="setup-section-heading">
                <div className="eyebrow">{settingsText.textModelEyebrow}</div>
                <div className="summary-title">{setupText.model.capabilitiesTitle}</div>
              </div>
              <div className="summary-text">{setupText.model.noCapabilities}</div>
            </article>
          )}

          <article className="summary-card settings-model-card">
            <div className="setup-section-heading">
              <div className="eyebrow">{settingsText.imageModelEyebrow}</div>
              <div className="summary-title">{settingsText.imageModelTitle}</div>
              {selectedImageProfile?.description ? (
                <div className="summary-text">{selectedImageProfile.description}</div>
              ) : null}
            </div>
            {renderImageModelSettingsFields("detail")}
          </article>

          {selectedImageProfile ? (
            <article className="summary-card settings-model-card">
              <div className="setup-section-heading">
                <div className="eyebrow">{settingsText.imageModelEyebrow}</div>
                <div className="summary-title">{setupText.model.capabilitiesTitle}</div>
                <div className="summary-text">
                  {selectedImageProfile.message || setupText.model.noExplanation}
                </div>
              </div>
              {renderCapabilityList(selectedImageProfile.featureDetails)}
            </article>
          ) : (
            <article className="summary-card settings-model-card">
              <div className="setup-section-heading">
                <div className="eyebrow">{settingsText.imageModelEyebrow}</div>
                <div className="summary-title">{setupText.model.capabilitiesTitle}</div>
              </div>
              <div className="summary-text">{setupText.model.noCapabilities}</div>
            </article>
          )}
        </div>

        <article className="summary-card settings-model-entry">
          <div className="settings-model-entry-head">
            <div>
              <div className="eyebrow">{settingsText.textModelEyebrow}</div>
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
              {advancedTextModelEnabled
                ? setupText.advancedModel.enabledSummary(advancedModelOverrideCount)
                : setupText.advancedModel.description}
            </div>
            <div className="summary-text">
              {setupText.model.message(
                selectedProfile?.message ?? setupText.model.noExplanation
              )}
            </div>
          </div>
        </article>

        <article className="summary-card settings-model-entry">
          <div className="settings-model-entry-head">
            <div>
              <div className="eyebrow">{settingsText.imageModelEyebrow}</div>
              <div className="summary-title">{settingsText.imageModelTitle}</div>
            </div>
          </div>
          <div className="settings-model-entry-grid">
            <div className="summary-text">
              {setupText.model.profile(
                selectedImageProfile?.name ?? setupText.model.notConfigured
              )}
            </div>
            <div className="summary-text">
              {setupText.model.comicStyle(
                selectedComicStyle?.name ?? setupText.model.notConfigured
              )}
            </div>
            <div className="summary-text">
              {setupText.model.resolvedModel(resolvedImageModelName)}
            </div>
            <div className="summary-text">
              {setupText.model.status(
                imageProfileReady ? setupText.model.ready : setupText.model.needsConfig
              )}
            </div>
            <div className="summary-text">
              {setupText.model.message(
                selectedImageProfile?.message ?? setupText.model.noExplanation
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
                      <div className="eyebrow">{settingsText.textModelEyebrow}</div>
                      <div className="summary-title">{settingsText.textModelTitle}</div>
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
                      <div className="summary-text">
                        {advancedTextModelEnabled
                          ? setupText.advancedModel.enabledSummary(advancedModelOverrideCount)
                          : setupText.advancedModel.description}
                      </div>
                    </div>
                  </article>

                  <article className="summary-card setup-section-card">
                    <div className="setup-section-heading">
                      <div className="eyebrow">{settingsText.imageModelEyebrow}</div>
                      <div className="summary-title">{settingsText.imageModelTitle}</div>
                      {selectedImageProfile?.description ? (
                        <div className="summary-text">{selectedImageProfile.description}</div>
                      ) : null}
                    </div>
                    {renderImageModelSettingsFields("sidebar")}
                    <div className="setup-section-summary-list">
                      <div className="summary-text">
                        {setupText.model.currentProfile(
                          selectedImageProfile?.name ?? setupText.model.notConfigured
                        )}
                      </div>
                      <div className="summary-text">
                        {setupText.model.comicStyle(
                          selectedComicStyle?.name ?? setupText.model.notConfigured
                        )}
                      </div>
                      <div className="summary-text">
                        {setupText.model.resolvedModel(resolvedImageModelName)}
                      </div>
                      <div className="summary-text">
                        {setupText.model.status(
                          imageProfileReady ? setupText.model.ready : setupText.model.needsConfig
                        )}
                      </div>
                      <div className="summary-text">
                        {setupText.model.message(
                          selectedImageProfile?.message ?? setupText.model.noExplanation
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
                      !sessionTextModelReady ||
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

      {renderPersonalityEditorModal()}
      {renderPrimaryPlayerPersonalityEditorModal()}
      {renderAppearanceEditorModal()}
      {renderPrimaryPlayerAppearanceEditorModal()}
      {renderCompanionPresetPickerModal()}

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
