export type LocaleCode = "zh-CN" | "en-US" | string;

export type PlayMode =
  | "single_player"
  | "single_player_with_npc"
  | "multiplayer";

export type GmArchitecture =
  | "single_agent"
  | "multi_agent";

export type RuleManifest = {
  schemaVersion: string;
  id: string;
  version: string;
  defaultLocale: LocaleCode;
  availableLocales: LocaleCode[];
  title: Record<string, string>;
  themes: string[];
  tones: string[];
  supportsModes: string[];
  gmStyles: string[];
  authoringSpec: string;
  contentWarnings: string[];
};

export type StoryManifest = {
  schemaVersion: string;
  id: string;
  version: string;
  ruleId: string;
  defaultLocale: LocaleCode;
  availableLocales: LocaleCode[];
  title: Record<string, string>;
  playerCount: {
    min: number;
    max: number;
  };
  supportsModes: string[];
  recommendedLength: string;
  recommendedPacing: string;
  gmStyle: string;
  tags: string[];
  contentWarnings: string[];
  authoringSpec: string;
  startSceneId: string;
};

export type LocalizedTextAsset = {
  locale: LocaleCode;
  source: "localized" | "root-fallback";
  relativePath: string;
  content: string;
};

export type LoadedRulePackage = {
  manifest: RuleManifest;
  baseDir: string;
  requestedLocale: LocaleCode;
  resolvedLocale: LocaleCode;
  intro: LocalizedTextAsset | null;
  rule: LocalizedTextAsset;
};

export type LoadedStoryPackage = {
  manifest: StoryManifest;
  baseDir: string;
  requestedLocale: LocaleCode;
  resolvedLocale: LocaleCode;
  intro: LocalizedTextAsset | null;
  story: LocalizedTextAsset;
};

export type LoadedContentBundle = {
  requestedLocale: LocaleCode;
  resolvedLocale: LocaleCode;
  rule: LoadedRulePackage;
  story: LoadedStoryPackage;
};

export type ContentCatalogStoryEntry = {
  storyId: string;
  directoryName: string;
  title: string;
  availableLocales: LocaleCode[];
};

export type ContentCatalogEntry = {
  ruleId: string;
  directoryName: string;
  defaultLocale: LocaleCode;
  availableLocales: LocaleCode[];
  ruleTitle: string;
  stories: ContentCatalogStoryEntry[];
};
