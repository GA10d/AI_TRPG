import { useEffect, useState } from "react";

import type {
  BootstrapResponse,
  CreateSessionRequest,
  ImagePromptTemplateConfig,
  RuntimeImageModelConfigInput,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import { fetchBootstrap } from "../lib/trpgApiClient.ts";
import {
  getOpeningPreviewDeliveryOptions,
  type OpeningPreviewDeliveryMode
} from "../openingPreviewPreferences.ts";
import { loadStoredWebDefaults } from "../storage.ts";
import {
  getDifficultyOptions,
  getGmArchitectureOptions,
  getLogViewOptions,
  getMarkdownFontSizeOptions,
  getMenuFontSizeOptions,
  getPlayModeOptions,
  type MarkdownFontSizePreset,
  type MenuFontSizePreset,
  type StatusState,
  pickOption
} from "../ui.ts";
import {
  DEFAULT_UI_LOCALE,
  resolveUiLocaleCode,
  type UiLocaleCode
} from "../locales/index.tsx";

type UseBootstrapStateArgs = {
  onStatusChange: (status: StatusState) => void;
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

function sanitizeRuntimeModelConfig(
  runtimeModelConfig: RuntimeModelConfigInput | undefined
): RuntimeModelConfigInput {
  return {
    apiKey: runtimeModelConfig?.apiKey?.trim() || "",
    baseUrl: runtimeModelConfig?.baseUrl?.trim() || "",
    model: runtimeModelConfig?.model?.trim() || ""
  };
}

function isRuntimeModelConfigEmpty(runtimeModelConfig: RuntimeModelConfigInput): boolean {
  return (
    !runtimeModelConfig.apiKey &&
    !runtimeModelConfig.baseUrl &&
    !runtimeModelConfig.model
  );
}

function sanitizeRuntimeImageModelConfig(
  runtimeImageModelConfig: RuntimeImageModelConfigInput | undefined
): RuntimeImageModelConfigInput {
  return {
    apiKey: runtimeImageModelConfig?.apiKey?.trim() || "",
    baseUrl: runtimeImageModelConfig?.baseUrl?.trim() || "",
    model: runtimeImageModelConfig?.model?.trim() || ""
  };
}

function isRuntimeImageModelConfigEmpty(
  runtimeImageModelConfig: RuntimeImageModelConfigInput
): boolean {
  return (
    !runtimeImageModelConfig.apiKey &&
    !runtimeImageModelConfig.baseUrl &&
    !runtimeImageModelConfig.model
  );
}

function sanitizeProfileRuntimeConfigs(
  profileRuntimeConfigs: Record<string, RuntimeModelConfigInput> | undefined
): Record<string, RuntimeModelConfigInput> {
  const nextConfigs: Record<string, RuntimeModelConfigInput> = {};

  for (const [profileId, runtimeModelConfig] of Object.entries(profileRuntimeConfigs ?? {})) {
    const sanitizedConfig = sanitizeRuntimeModelConfig(runtimeModelConfig);
    if (!isRuntimeModelConfigEmpty(sanitizedConfig)) {
      nextConfigs[profileId] = sanitizedConfig;
    }
  }

  return nextConfigs;
}

function sanitizeImageProfileRuntimeConfigs(
  profileRuntimeConfigs: Record<string, RuntimeImageModelConfigInput> | undefined
): Record<string, RuntimeImageModelConfigInput> {
  const nextConfigs: Record<string, RuntimeImageModelConfigInput> = {};

  for (const [profileId, runtimeImageModelConfig] of Object.entries(profileRuntimeConfigs ?? {})) {
    const sanitizedConfig = sanitizeRuntimeImageModelConfig(runtimeImageModelConfig);
    if (!isRuntimeImageModelConfigEmpty(sanitizedConfig)) {
      nextConfigs[profileId] = sanitizedConfig;
    }
  }

  return nextConfigs;
}

function upsertProfileRuntimeConfig(
  previousConfigs: Record<string, RuntimeModelConfigInput>,
  profileId: string,
  runtimeModelConfig: RuntimeModelConfigInput
): Record<string, RuntimeModelConfigInput> {
  if (!profileId) {
    return previousConfigs;
  }

  const nextConfigs = { ...previousConfigs };

  if (isRuntimeModelConfigEmpty(runtimeModelConfig)) {
    delete nextConfigs[profileId];
  } else {
    nextConfigs[profileId] = runtimeModelConfig;
  }

  return nextConfigs;
}

function upsertImageProfileRuntimeConfig(
  previousConfigs: Record<string, RuntimeImageModelConfigInput>,
  profileId: string,
  runtimeImageModelConfig: RuntimeImageModelConfigInput
): Record<string, RuntimeImageModelConfigInput> {
  if (!profileId) {
    return previousConfigs;
  }

  const nextConfigs = { ...previousConfigs };

  if (isRuntimeImageModelConfigEmpty(runtimeImageModelConfig)) {
    delete nextConfigs[profileId];
  } else {
    nextConfigs[profileId] = runtimeImageModelConfig;
  }

  return nextConfigs;
}

function areRuntimeModelConfigsEqual(
  left: RuntimeModelConfigInput,
  right: RuntimeModelConfigInput
): boolean {
  return (
    left.apiKey === right.apiKey &&
    left.baseUrl === right.baseUrl &&
    left.model === right.model
  );
}

function resolveModelProfileId(
  bootstrap: BootstrapResponse,
  accessMode: CreateSessionRequest["modelAccessMode"],
  preferredProfileId: string | undefined
): string {
  const normalizedPreferredProfileId =
    preferredProfileId === "deepseek" ? "deepseek-chat" : preferredProfileId;
  const matchingProfiles = bootstrap.modelProfiles.filter(
    (item) => item.accessMode === accessMode
  );

  if (
    normalizedPreferredProfileId &&
    matchingProfiles.some((item) => item.id === normalizedPreferredProfileId)
  ) {
    return normalizedPreferredProfileId;
  }

  return matchingProfiles[0]?.id ?? bootstrap.defaults.modelProfileId;
}

function resolveImageProfileId(
  bootstrap: BootstrapResponse,
  preferredProfileId: string | undefined
): string {
  if (preferredProfileId && bootstrap.imageProfiles.some((item) => item.id === preferredProfileId)) {
    return preferredProfileId;
  }

  return bootstrap.imageProfiles[0]?.id ?? bootstrap.defaults.imageProfileId;
}

function normalizeImagePromptTemplateRecord(
  baseRecord: Record<string, string>,
  overrideRecord: Record<string, string> | undefined
): Record<string, string> {
  const nextRecord: Record<string, string> = { ...baseRecord };

  for (const [key, value] of Object.entries(overrideRecord ?? {})) {
    if (typeof value === "string" && value.trim().length > 0) {
      nextRecord[key] = value.trim();
    }
  }

  return nextRecord;
}

function sanitizeImagePromptTemplateConfig(
  baseConfig: ImagePromptTemplateConfig,
  overrideConfig: ImagePromptTemplateConfig | undefined
): ImagePromptTemplateConfig {
  const defaultTrigger =
    overrideConfig?.defaultTrigger === "character_portrait" ||
    overrideConfig?.defaultTrigger === "npc_intro" ||
    overrideConfig?.defaultTrigger === "scene_shift"
      ? overrideConfig.defaultTrigger
      : overrideConfig?.defaultTrigger === "manual"
        ? "manual"
        : baseConfig.defaultTrigger;

  return {
    version: overrideConfig?.version ?? baseConfig.version,
    defaultTheme: overrideConfig?.defaultTheme?.trim() || baseConfig.defaultTheme,
    defaultTrigger,
    fallbackTriggerTemplate:
      overrideConfig?.fallbackTriggerTemplate?.trim() || baseConfig.fallbackTriggerTemplate,
    themes: normalizeImagePromptTemplateRecord(baseConfig.themes, overrideConfig?.themes),
    triggerTemplates: {
      manual:
        overrideConfig?.triggerTemplates?.manual?.trim() ||
        baseConfig.triggerTemplates.manual,
      character_portrait:
        overrideConfig?.triggerTemplates?.character_portrait?.trim() ||
        baseConfig.triggerTemplates.character_portrait,
      npc_intro:
        overrideConfig?.triggerTemplates?.npc_intro?.trim() ||
        baseConfig.triggerTemplates.npc_intro,
      scene_shift:
        overrideConfig?.triggerTemplates?.scene_shift?.trim() ||
        baseConfig.triggerTemplates.scene_shift
    },
    characterClauseTemplate:
      overrideConfig?.characterClauseTemplate?.trim() || baseConfig.characterClauseTemplate,
    characterJoinSeparator:
      overrideConfig?.characterJoinSeparator ?? baseConfig.characterJoinSeparator,
    characterEntryTemplate:
      overrideConfig?.characterEntryTemplate?.trim() || baseConfig.characterEntryTemplate
  };
}

export function useBootstrapState(args: UseBootstrapStateArgs) {
  const playModeOptions = getPlayModeOptions();
  const difficultyOptions = getDifficultyOptions();
  const gmArchitectureOptions = getGmArchitectureOptions();
  const logViewOptions = getLogViewOptions();
  const openingPreviewDeliveryOptions = getOpeningPreviewDeliveryOptions();
  const markdownFontSizeOptions = getMarkdownFontSizeOptions();
  const menuFontSizeOptions = getMenuFontSizeOptions();
  const { onStatusChange } = args;
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [ruleDirectoryName, setRuleDirectoryName] = useState("");
  const [storyDirectoryName, setStoryDirectoryName] = useState("");
  const [uiLocale, setUiLocale] = useState<UiLocaleCode>(DEFAULT_UI_LOCALE);
  const [locale, setLocale] = useState<CreateSessionRequest["locale"]>("zh-CN");
  const [playMode, setPlayMode] = useState<CreateSessionRequest["playMode"]>("single_player");
  const [difficulty, setDifficulty] =
    useState<CreateSessionRequest["difficulty"]>("easy");
  const [gmArchitecture, setGmArchitecture] =
    useState<CreateSessionRequest["gmArchitecture"]>("single_agent");
  const [backgroundCompressionEnabled, setBackgroundCompressionEnabled] = useState(true);
  const [modelAccessMode, setModelAccessMode] =
    useState<CreateSessionRequest["modelAccessMode"]>("mock");
  const [modelProfileId, setModelProfileId] = useState("mock-local");
  const [runtimeModelConfig, setRuntimeModelConfigState] =
    useState<RuntimeModelConfigInput>(EMPTY_RUNTIME_MODEL_CONFIG);
  const [profileRuntimeConfigs, setProfileRuntimeConfigs] = useState<
    Record<string, RuntimeModelConfigInput>
  >({});
  const [imageProfileId, setImageProfileId] = useState("mock-image");
  const [runtimeImageModelConfig, setRuntimeImageModelConfigState] =
    useState<RuntimeImageModelConfigInput>(EMPTY_RUNTIME_IMAGE_MODEL_CONFIG);
  const [imageProfileRuntimeConfigs, setImageProfileRuntimeConfigs] = useState<
    Record<string, RuntimeImageModelConfigInput>
  >({});
  const [comicStyleId, setComicStyleId] = useState("");
  const [imagePromptTemplateConfig, setImagePromptTemplateConfig] =
    useState<ImagePromptTemplateConfig | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(true);
  const [logViewMode, setLogViewMode] =
    useState<NonNullable<CreateSessionRequest["logViewMode"]>>("compact");
  const [openingPreviewDeliveryMode, setOpeningPreviewDeliveryMode] =
    useState<OpeningPreviewDeliveryMode>("stream");
  const [showAiMetadata, setShowAiMetadata] = useState(true);
  const [markdownFontSize, setMarkdownFontSize] =
    useState<MarkdownFontSizePreset>("large");
  const [menuFontSize, setMenuFontSize] =
    useState<MenuFontSizePreset>("standard");

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const data = await fetchBootstrap();
        if (cancelled) {
          return;
        }

        const storedDefaults = loadStoredWebDefaults();
        const resolvedAccessMode = pickOption(
          storedDefaults?.modelAccessMode,
          data.modelAccessModes.map((item) => item.code),
          data.defaults.modelAccessMode
        );
        const resolvedProfileId = resolveModelProfileId(
          data,
          resolvedAccessMode,
          storedDefaults?.modelProfileId ?? data.defaults.modelProfileId
        );
        const storedProfileRuntimeConfigs = sanitizeProfileRuntimeConfigs(
          storedDefaults?.profileRuntimeConfigs
        );
        const storedImageProfileRuntimeConfigs = sanitizeImageProfileRuntimeConfigs(
          storedDefaults?.imageProfileRuntimeConfigs
        );
        const legacyRuntimeModelConfig = sanitizeRuntimeModelConfig(
          storedDefaults?.runtimeModelConfig
        );
        const legacyRuntimeImageModelConfig = sanitizeRuntimeImageModelConfig(
          storedDefaults?.runtimeImageModelConfig
        );
        const resolvedImageProfileId = resolveImageProfileId(
          data,
          storedDefaults?.imageProfileId ?? data.defaults.imageProfileId
        );

        if (
          !isRuntimeModelConfigEmpty(legacyRuntimeModelConfig) &&
          !storedProfileRuntimeConfigs[resolvedProfileId]
        ) {
          storedProfileRuntimeConfigs[resolvedProfileId] = legacyRuntimeModelConfig;
        }

        if (
          !isRuntimeImageModelConfigEmpty(legacyRuntimeImageModelConfig) &&
          !storedImageProfileRuntimeConfigs[resolvedImageProfileId]
        ) {
          storedImageProfileRuntimeConfigs[resolvedImageProfileId] = legacyRuntimeImageModelConfig;
        }

        setBootstrap(data);
        setRuleDirectoryName(data.catalog[0]?.directoryName ?? "");
        setStoryDirectoryName(data.catalog[0]?.stories[0]?.directoryName ?? "");
        setUiLocale(
          resolveUiLocaleCode(storedDefaults?.uiLocale ?? storedDefaults?.locale)
        );
        setLocale(
          pickOption(
            storedDefaults?.locale,
            data.languages.map((item) => item.code),
            data.defaults.locale
          )
        );
        setPlayMode(
          pickOption(
            storedDefaults?.playMode,
            playModeOptions.map((item) => item.value),
            data.defaults.playMode
          )
        );
        setDifficulty(
          pickOption(
            storedDefaults?.difficulty,
            difficultyOptions.map((item) => item.value),
            data.defaults.difficulty
          )
        );
        setGmArchitecture(
          pickOption(
            storedDefaults?.gmArchitecture,
            gmArchitectureOptions.map((item) => item.value),
            data.defaults.gmArchitecture
          )
        );
        setBackgroundCompressionEnabled(
          storedDefaults?.backgroundCompressionEnabled ?? data.defaults.backgroundCompressionEnabled
        );
        setModelAccessMode(resolvedAccessMode);
        setModelProfileId(resolvedProfileId);
        setProfileRuntimeConfigs(storedProfileRuntimeConfigs);
        setRuntimeModelConfigState(
          storedProfileRuntimeConfigs[resolvedProfileId] ?? EMPTY_RUNTIME_MODEL_CONFIG
        );
        setImageProfileId(resolvedImageProfileId);
        setImageProfileRuntimeConfigs(storedImageProfileRuntimeConfigs);
        setRuntimeImageModelConfigState(
          storedImageProfileRuntimeConfigs[resolvedImageProfileId] ??
            EMPTY_RUNTIME_IMAGE_MODEL_CONFIG
        );
        setComicStyleId(storedDefaults?.comicStyleId?.trim() ?? "");
        setImagePromptTemplateConfig(
          sanitizeImagePromptTemplateConfig(
            data.imagePromptTemplateConfig,
            storedDefaults?.imagePromptTemplateConfig
          )
        );
        setDebugEnabled(storedDefaults?.debugEnabled ?? true);
        setLogViewMode(
          pickOption(
            storedDefaults?.logViewMode,
            logViewOptions.map((item) => item.value),
            data.defaults.logViewMode
          )
        );
        setOpeningPreviewDeliveryMode(
          pickOption(
            storedDefaults?.openingPreviewDeliveryMode,
            openingPreviewDeliveryOptions.map((item) => item.value),
            "stream"
          )
        );
        setShowAiMetadata(storedDefaults?.showAiMetadata ?? true);
        setMarkdownFontSize(
          pickOption(
            storedDefaults?.markdownFontSize,
            markdownFontSizeOptions.map((item) => item.value),
            "large"
          )
        );
        setMenuFontSize(
          pickOption(
            storedDefaults?.menuFontSize,
            menuFontSizeOptions.map((item) => item.value),
            "standard"
          )
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        onStatusChange({
          message: error instanceof Error ? error.message : String(error),
          tone: "error"
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [onStatusChange]);

  useEffect(() => {
    const stories =
      bootstrap?.catalog.find((item) => item.directoryName === ruleDirectoryName)?.stories ?? [];

    if (!stories.length) {
      return;
    }

    const stillExists = stories.some((item) => item.directoryName === storyDirectoryName);
    if (!stillExists) {
      setStoryDirectoryName(stories[0]?.directoryName ?? "");
    }
  }, [bootstrap, ruleDirectoryName, storyDirectoryName]);

  useEffect(() => {
    if (!bootstrap) {
      return;
    }

    const resolvedProfileId = resolveModelProfileId(
      bootstrap,
      modelAccessMode,
      modelProfileId
    );

    if (resolvedProfileId !== modelProfileId) {
      setModelProfileId(resolvedProfileId);
    }
  }, [bootstrap, modelAccessMode, modelProfileId]);

  useEffect(() => {
    const nextRuntimeModelConfig =
      profileRuntimeConfigs[modelProfileId] ?? EMPTY_RUNTIME_MODEL_CONFIG;

    if (!areRuntimeModelConfigsEqual(runtimeModelConfig, nextRuntimeModelConfig)) {
      setRuntimeModelConfigState(nextRuntimeModelConfig);
    }
  }, [modelProfileId, profileRuntimeConfigs, runtimeModelConfig]);

  useEffect(() => {
    const nextRuntimeImageModelConfig =
      imageProfileRuntimeConfigs[imageProfileId] ?? EMPTY_RUNTIME_IMAGE_MODEL_CONFIG;

    if (!areRuntimeModelConfigsEqual(runtimeImageModelConfig, nextRuntimeImageModelConfig)) {
      setRuntimeImageModelConfigState(nextRuntimeImageModelConfig);
    }
  }, [imageProfileId, imageProfileRuntimeConfigs, runtimeImageModelConfig]);

  function setRuntimeModelConfig(value: RuntimeModelConfigInput): void {
    const sanitizedConfig = sanitizeRuntimeModelConfig(value);
    setRuntimeModelConfigState(sanitizedConfig);
    setProfileRuntimeConfigs((previousConfigs) =>
      upsertProfileRuntimeConfig(previousConfigs, modelProfileId, sanitizedConfig)
    );
  }

  function setProfileRuntimeConfig(
    profileId: string,
    value: RuntimeModelConfigInput
  ): void {
    const sanitizedConfig = sanitizeRuntimeModelConfig(value);
    setProfileRuntimeConfigs((previousConfigs) =>
      upsertProfileRuntimeConfig(previousConfigs, profileId, sanitizedConfig)
    );

    if (profileId === modelProfileId) {
      setRuntimeModelConfigState(sanitizedConfig);
    }
  }

  function clearProfileRuntimeConfigs(): void {
    setProfileRuntimeConfigs({});
    setRuntimeModelConfigState(EMPTY_RUNTIME_MODEL_CONFIG);
  }

  function setRuntimeImageModelConfig(value: RuntimeImageModelConfigInput): void {
    const sanitizedConfig = sanitizeRuntimeImageModelConfig(value);
    setRuntimeImageModelConfigState(sanitizedConfig);
    setImageProfileRuntimeConfigs((previousConfigs) =>
      upsertImageProfileRuntimeConfig(previousConfigs, imageProfileId, sanitizedConfig)
    );
  }

  function setImageProfileRuntimeConfig(
    profileId: string,
    value: RuntimeImageModelConfigInput
  ): void {
    const sanitizedConfig = sanitizeRuntimeImageModelConfig(value);
    setImageProfileRuntimeConfigs((previousConfigs) =>
      upsertImageProfileRuntimeConfig(previousConfigs, profileId, sanitizedConfig)
    );

    if (profileId === imageProfileId) {
      setRuntimeImageModelConfigState(sanitizedConfig);
    }
  }

  function clearImageProfileRuntimeConfigs(): void {
    setImageProfileRuntimeConfigs({});
    setRuntimeImageModelConfigState(EMPTY_RUNTIME_IMAGE_MODEL_CONFIG);
  }

  return {
    bootstrap,
    ruleDirectoryName,
    storyDirectoryName,
    uiLocale,
    locale,
    playMode,
    difficulty,
    gmArchitecture,
    backgroundCompressionEnabled,
    modelAccessMode,
    modelProfileId,
    runtimeModelConfig,
    profileRuntimeConfigs,
    imageProfileId,
    runtimeImageModelConfig,
    imageProfileRuntimeConfigs,
    comicStyleId,
    imagePromptTemplateConfig,
    debugEnabled,
    logViewMode,
    openingPreviewDeliveryMode,
    showAiMetadata,
    markdownFontSize,
    menuFontSize,
    setRuleDirectoryName,
    setStoryDirectoryName,
    setUiLocale,
    setLocale,
    setPlayMode,
    setDifficulty,
    setGmArchitecture,
    setBackgroundCompressionEnabled,
    setModelAccessMode,
    setModelProfileId,
    setRuntimeModelConfig,
    setProfileRuntimeConfig,
    clearProfileRuntimeConfigs,
    setImageProfileId,
    setRuntimeImageModelConfig,
    setImageProfileRuntimeConfig,
    clearImageProfileRuntimeConfigs,
    setComicStyleId,
    setImagePromptTemplateConfig,
    setDebugEnabled,
    setLogViewMode,
    setOpeningPreviewDeliveryMode,
    setShowAiMetadata,
    setMarkdownFontSize,
    setMenuFontSize
  };
}
