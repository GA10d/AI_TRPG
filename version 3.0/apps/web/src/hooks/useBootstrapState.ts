import { useEffect, useState } from "react";

import type {
  BootstrapResponse,
  CreateSessionRequest
} from "../../../../packages/shared-types/src/index.ts";
import { fetchBootstrap } from "../lib/trpgApiClient.ts";
import { loadStoredWebDefaults } from "../storage.ts";
import {
  GM_ARCHITECTURE_OPTIONS,
  LOG_VIEW_OPTIONS,
  PLAY_MODE_OPTIONS,
  type StatusState,
  pickOption
} from "../ui.ts";

type UseBootstrapStateArgs = {
  onStatusChange: (status: StatusState) => void;
};

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
  const [debugEnabled, setDebugEnabled] = useState(true);
  const [logViewMode, setLogViewMode] =
    useState<NonNullable<CreateSessionRequest["logViewMode"]>>("compact");

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const data = await fetchBootstrap();
        if (cancelled) {
          return;
        }

        const storedDefaults = loadStoredWebDefaults();
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
        setModelAccessMode(
          pickOption(
            storedDefaults?.modelAccessMode,
            data.modelAccessModes.map((item) => item.code),
            data.defaults.modelAccessMode
          )
        );
        setDebugEnabled(storedDefaults?.debugEnabled ?? true);
        setLogViewMode(
          pickOption(
            storedDefaults?.logViewMode,
            LOG_VIEW_OPTIONS.map((item) => item.value),
            data.defaults.logViewMode
          )
        );
        onStatusChange({
          message: "主菜单已准备好。",
          tone: "neutral"
        });
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

  return {
    bootstrap,
    ruleDirectoryName,
    storyDirectoryName,
    locale,
    playMode,
    gmArchitecture,
    modelAccessMode,
    debugEnabled,
    logViewMode,
    setRuleDirectoryName,
    setStoryDirectoryName,
    setLocale,
    setPlayMode,
    setGmArchitecture,
    setModelAccessMode,
    setDebugEnabled,
    setLogViewMode
  };
}
