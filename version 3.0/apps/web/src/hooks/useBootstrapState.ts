import { useEffect, useState } from "react";

import type {
  BootstrapResponse,
  CreateSessionRequest,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import { fetchBootstrap } from "../lib/trpgApiClient.ts";
import { loadStoredWebDefaults } from "../storage.ts";
import {
  GM_ARCHITECTURE_OPTIONS,
  LOG_VIEW_OPTIONS,
  MARKDOWN_FONT_SIZE_OPTIONS,
  MENU_FONT_SIZE_OPTIONS,
  PLAY_MODE_OPTIONS,
  type MarkdownFontSizePreset,
  type MenuFontSizePreset,
  type StatusState,
  pickOption
} from "../ui.ts";

type UseBootstrapStateArgs = {
  onStatusChange: (status: StatusState) => void;
};

const EMPTY_RUNTIME_MODEL_CONFIG: RuntimeModelConfigInput = {
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
  const matchingProfiles = bootstrap.modelProfiles.filter(
    (item) => item.accessMode === accessMode
  );

  if (preferredProfileId && matchingProfiles.some((item) => item.id === preferredProfileId)) {
    return preferredProfileId;
  }

  return matchingProfiles[0]?.id ?? bootstrap.defaults.modelProfileId;
}

export function useBootstrapState(args: UseBootstrapStateArgs) {
  const { onStatusChange } = args;
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [ruleDirectoryName, setRuleDirectoryName] = useState("");
  const [storyDirectoryName, setStoryDirectoryName] = useState("");
  const [locale, setLocale] = useState<CreateSessionRequest["locale"]>("zh-CN");
  const [playMode, setPlayMode] = useState<CreateSessionRequest["playMode"]>("single_player");
  const [gmArchitecture, setGmArchitecture] =
    useState<CreateSessionRequest["gmArchitecture"]>("single_agent");
  const [modelAccessMode, setModelAccessMode] =
    useState<CreateSessionRequest["modelAccessMode"]>("mock");
  const [modelProfileId, setModelProfileId] = useState("mock-local");
  const [runtimeModelConfig, setRuntimeModelConfigState] =
    useState<RuntimeModelConfigInput>(EMPTY_RUNTIME_MODEL_CONFIG);
  const [profileRuntimeConfigs, setProfileRuntimeConfigs] = useState<
    Record<string, RuntimeModelConfigInput>
  >({});
  const [debugEnabled, setDebugEnabled] = useState(true);
  const [logViewMode, setLogViewMode] =
    useState<NonNullable<CreateSessionRequest["logViewMode"]>>("compact");
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
        const legacyRuntimeModelConfig = sanitizeRuntimeModelConfig(
          storedDefaults?.runtimeModelConfig
        );

        if (
          !isRuntimeModelConfigEmpty(legacyRuntimeModelConfig) &&
          !storedProfileRuntimeConfigs[resolvedProfileId]
        ) {
          storedProfileRuntimeConfigs[resolvedProfileId] = legacyRuntimeModelConfig;
        }

        setBootstrap(data);
        setRuleDirectoryName(data.catalog[0]?.directoryName ?? "");
        setStoryDirectoryName(data.catalog[0]?.stories[0]?.directoryName ?? "");
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
            PLAY_MODE_OPTIONS.map((item) => item.value),
            data.defaults.playMode
          )
        );
        setGmArchitecture(
          pickOption(
            storedDefaults?.gmArchitecture,
            GM_ARCHITECTURE_OPTIONS.map((item) => item.value),
            data.defaults.gmArchitecture
          )
        );
        setModelAccessMode(resolvedAccessMode);
        setModelProfileId(resolvedProfileId);
        setProfileRuntimeConfigs(storedProfileRuntimeConfigs);
        setRuntimeModelConfigState(
          storedProfileRuntimeConfigs[resolvedProfileId] ?? EMPTY_RUNTIME_MODEL_CONFIG
        );
        setDebugEnabled(storedDefaults?.debugEnabled ?? true);
        setLogViewMode(
          pickOption(
            storedDefaults?.logViewMode,
            LOG_VIEW_OPTIONS.map((item) => item.value),
            data.defaults.logViewMode
          )
        );
        setShowAiMetadata(storedDefaults?.showAiMetadata ?? true);
        setMarkdownFontSize(
          pickOption(
            storedDefaults?.markdownFontSize,
            MARKDOWN_FONT_SIZE_OPTIONS.map((item) => item.value),
            "large"
          )
        );
        setMenuFontSize(
          pickOption(
            storedDefaults?.menuFontSize,
            MENU_FONT_SIZE_OPTIONS.map((item) => item.value),
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

  return {
    bootstrap,
    ruleDirectoryName,
    storyDirectoryName,
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
    markdownFontSize,
    menuFontSize,
    setRuleDirectoryName,
    setStoryDirectoryName,
    setLocale,
    setPlayMode,
    setGmArchitecture,
    setModelAccessMode,
    setModelProfileId,
    setRuntimeModelConfig,
    setProfileRuntimeConfig,
    clearProfileRuntimeConfigs,
    setDebugEnabled,
    setLogViewMode,
    setShowAiMetadata,
    setMarkdownFontSize,
    setMenuFontSize
  };
}
