import { access, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  buildLocaleFallbackChain,
  DEFAULT_LOCALE,
  isKnownLocale,
  normalizeLocaleCode
} from "../../../../packages/shared-config/src/index.ts";
import type {
  ContentCatalogEntry,
  LoadedContentBundle,
  LoadedRulePackage,
  LoadedStoryPackage,
  LocaleCode,
  LocalizedTextAsset,
  RuleManifest,
  StoryManifest
} from "../../../../packages/shared-types/src/index.ts";

type AssetSelection = {
  locale: LocaleCode;
  relativePath: string;
  source: "localized" | "root-fallback";
};

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`字段 ${fieldName} 必须是非空字符串`);
  }
  return value;
}

function assertStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`字段 ${fieldName} 必须是非空字符串数组`);
  }
  return value;
}

function assertKnownLocale(value: unknown, fieldName: string): LocaleCode {
  const locale = assertString(value, fieldName);
  const normalizedLocale = normalizeLocaleCode(locale);

  if (!isKnownLocale(normalizedLocale)) {
    throw new Error(`字段 ${fieldName} 使用了未注册的语言代码：${locale}`);
  }

  return normalizedLocale;
}

function assertKnownLocaleArray(value: unknown, fieldName: string): LocaleCode[] {
  const locales = assertStringArray(value, fieldName).map((locale) => normalizeLocaleCode(locale));

  for (const locale of locales) {
    if (!isKnownLocale(locale)) {
      throw new Error(`字段 ${fieldName} 使用了未注册的语言代码：${locale}`);
    }
  }

  return Array.from(new Set(locales));
}

function assertNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`字段 ${fieldName} 必须是数字`);
  }
  return value;
}

function assertStringRecord(value: unknown, fieldName: string): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`字段 ${fieldName} 必须是对象`);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`字段 ${fieldName} 不能为空对象`);
  }

  for (const [key, item] of entries) {
    if (typeof key !== "string" || key.trim() === "") {
      throw new Error(`字段 ${fieldName} 的键必须是非空字符串`);
    }
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`字段 ${fieldName}.${key} 必须是非空字符串`);
    }
  }

  return value as Record<string, string>;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(targetPath: string): Promise<unknown> {
  const raw = await readFile(targetPath, "utf8");
  return JSON.parse(raw) as unknown;
}

function validateRuleManifest(raw: unknown, manifestPath: string): RuleManifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`规则清单格式不正确：${manifestPath}`);
  }

  const data = raw as Record<string, unknown>;

  return {
    schemaVersion: assertString(data.schemaVersion, "schemaVersion"),
    id: assertString(data.id, "id"),
    version: assertString(data.version, "version"),
    defaultLocale: assertKnownLocale(data.defaultLocale, "defaultLocale"),
    availableLocales: assertKnownLocaleArray(data.availableLocales, "availableLocales"),
    title: assertStringRecord(data.title, "title"),
    themes: assertStringArray(data.themes, "themes"),
    tones: assertStringArray(data.tones, "tones"),
    supportsModes: assertStringArray(data.supportsModes, "supportsModes"),
    gmStyles: assertStringArray(data.gmStyles, "gmStyles"),
    authoringSpec: assertString(data.authoringSpec, "authoringSpec"),
    contentWarnings: assertStringArray(data.contentWarnings, "contentWarnings")
  };
}

function validateStoryManifest(raw: unknown, manifestPath: string): StoryManifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`剧本清单格式不正确：${manifestPath}`);
  }

  const data = raw as Record<string, unknown>;
  const playerCount = data.playerCount;

  if (typeof playerCount !== "object" || playerCount === null || Array.isArray(playerCount)) {
    throw new Error(`字段 playerCount 必须是对象：${manifestPath}`);
  }

  const playerCountObject = playerCount as Record<string, unknown>;

  const defaultLocale = assertKnownLocale(data.defaultLocale, "defaultLocale");
  const availableLocales = assertKnownLocaleArray(data.availableLocales, "availableLocales");

  return {
    schemaVersion: assertString(data.schemaVersion, "schemaVersion"),
    id: assertString(data.id, "id"),
    version: assertString(data.version, "version"),
    ruleId: assertString(data.ruleId, "ruleId"),
    defaultLocale,
    availableLocales,
    title: assertStringRecord(data.title, "title"),
    playerCount: {
      min: assertNumber(playerCountObject.min, "playerCount.min"),
      max: assertNumber(playerCountObject.max, "playerCount.max")
    },
    supportsModes: assertStringArray(data.supportsModes, "supportsModes"),
    recommendedLength: assertString(data.recommendedLength, "recommendedLength"),
    recommendedPacing: assertString(data.recommendedPacing, "recommendedPacing"),
    gmStyle: assertString(data.gmStyle, "gmStyle"),
    tags: assertStringArray(data.tags, "tags"),
    contentWarnings: assertStringArray(data.contentWarnings, "contentWarnings"),
    authoringSpec: assertString(data.authoringSpec, "authoringSpec"),
    startSceneId: assertString(data.startSceneId, "startSceneId")
  };
}

function assertManifestLocaleConsistency(
  defaultLocale: LocaleCode,
  availableLocales: readonly LocaleCode[],
  manifestPath: string
): void {
  if (!availableLocales.includes(defaultLocale)) {
    throw new Error(`清单默认语言必须包含在 availableLocales 中：${manifestPath}`);
  }
}

function buildAssetCandidates(
  requestedLocale: LocaleCode,
  defaultLocale: LocaleCode,
  availableLocales: readonly LocaleCode[],
  localizedFilename: string,
  rootFallbackFilenames: string[]
): AssetSelection[] {
  const localeChain = buildLocaleFallbackChain(requestedLocale, defaultLocale, availableLocales);
  const candidates: AssetSelection[] = [];

  for (const locale of localeChain) {
    candidates.push({
      locale,
      relativePath: join("locales", locale, localizedFilename),
      source: "localized"
    });
  }

  for (const fileName of rootFallbackFilenames) {
    candidates.push({
      locale: defaultLocale,
      relativePath: fileName,
      source: "root-fallback"
    });
  }

  return candidates;
}

async function readLocalizedAsset(
  packageDir: string,
  requestedLocale: LocaleCode,
  defaultLocale: LocaleCode,
  availableLocales: readonly LocaleCode[],
  localizedFilename: string,
  rootFallbackFilenames: string[]
): Promise<LocalizedTextAsset | null> {
  const candidates = buildAssetCandidates(
    requestedLocale,
    defaultLocale,
    availableLocales,
    localizedFilename,
    rootFallbackFilenames
  );

  for (const candidate of candidates) {
    const absolutePath = join(packageDir, candidate.relativePath);
    if (await pathExists(absolutePath)) {
      const content = await readFile(absolutePath, "utf8");
      return {
        locale: candidate.locale,
        source: candidate.source,
        relativePath: candidate.relativePath,
        content
      };
    }
  }

  return null;
}

function normalizeContentRoot(contentRoot: string): string {
  return resolve(contentRoot);
}

export async function loadRulePackage(
  contentRoot: string,
  ruleId: string,
  requestedLocale: LocaleCode = DEFAULT_LOCALE
): Promise<LoadedRulePackage> {
  const normalizedRoot = normalizeContentRoot(contentRoot);
  const baseDir = join(normalizedRoot, ruleId, "rule");
  const manifestPath = join(baseDir, "manifest.json");

  if (!(await pathExists(manifestPath))) {
    throw new Error(`未找到规则清单文件：${manifestPath}`);
  }

  const manifest = validateRuleManifest(await readJsonFile(manifestPath), manifestPath);
  assertManifestLocaleConsistency(manifest.defaultLocale, manifest.availableLocales, manifestPath);

  const intro = await readLocalizedAsset(baseDir, requestedLocale, manifest.defaultLocale, manifest.availableLocales, "intro.md", [
    "intro.md",
    "intro.txt"
  ]);
  const rule = await readLocalizedAsset(baseDir, requestedLocale, manifest.defaultLocale, manifest.availableLocales, "rule.md", [
    "rule.md",
    "rule.txt"
  ]);

  if (!rule) {
    throw new Error(`规则正文缺失：${baseDir}`);
  }

  return {
    manifest,
    baseDir,
    requestedLocale,
    resolvedLocale: rule.locale,
    intro,
    rule
  };
}

export async function loadStoryPackage(
  contentRoot: string,
  ruleId: string,
  storyId: string,
  requestedLocale: LocaleCode = DEFAULT_LOCALE
): Promise<LoadedStoryPackage> {
  const normalizedRoot = normalizeContentRoot(contentRoot);
  const baseDir = join(normalizedRoot, ruleId, "story", storyId);
  const manifestPath = join(baseDir, "manifest.json");

  if (!(await pathExists(manifestPath))) {
    throw new Error(`未找到剧本清单文件：${manifestPath}`);
  }

  const manifest = validateStoryManifest(await readJsonFile(manifestPath), manifestPath);
  assertManifestLocaleConsistency(manifest.defaultLocale, manifest.availableLocales, manifestPath);

  const intro = await readLocalizedAsset(baseDir, requestedLocale, manifest.defaultLocale, manifest.availableLocales, "intro.md", [
    "intro.md",
    "intro.txt"
  ]);
  const story = await readLocalizedAsset(baseDir, requestedLocale, manifest.defaultLocale, manifest.availableLocales, "story.md", [
    "story.md",
    "story.txt"
  ]);

  if (!story) {
    throw new Error(`剧本正文缺失：${baseDir}`);
  }

  if (manifest.ruleId !== ruleId) {
    throw new Error(`剧本 ${storyId} 的 ruleId=${manifest.ruleId} 与目录规则 ${ruleId} 不一致`);
  }

  return {
    manifest,
    baseDir,
    requestedLocale,
    resolvedLocale: story.locale,
    intro,
    story
  };
}

export async function loadContentCatalog(contentRoot: string): Promise<ContentCatalogEntry[]> {
  const normalizedRoot = normalizeContentRoot(contentRoot);
  const catalogEntries = await readdir(normalizedRoot, { withFileTypes: true });
  const ruleDirectories = catalogEntries.filter((entry) => entry.isDirectory());
  const catalog: ContentCatalogEntry[] = [];

  for (const ruleDirectory of ruleDirectories) {
    const ruleId = ruleDirectory.name;
    const rulePackage = await loadRulePackage(normalizedRoot, ruleId, DEFAULT_LOCALE);
    const storyRoot = join(normalizedRoot, ruleId, "story");
    const storyItems = (await pathExists(storyRoot))
      ? await readdir(storyRoot, { withFileTypes: true })
      : [];

    const stories = [];
    for (const storyItem of storyItems) {
      if (!storyItem.isDirectory()) {
        continue;
      }

      const storyPackage = await loadStoryPackage(normalizedRoot, ruleId, storyItem.name, DEFAULT_LOCALE);
      stories.push({
        storyId: storyPackage.manifest.id,
        directoryName: storyItem.name,
        title: storyPackage.manifest.title[storyPackage.manifest.defaultLocale] ?? storyItem.name,
        availableLocales: storyPackage.manifest.availableLocales
      });
    }

    catalog.push({
      ruleId: rulePackage.manifest.id,
      directoryName: ruleId,
      defaultLocale: rulePackage.manifest.defaultLocale,
      availableLocales: rulePackage.manifest.availableLocales,
      ruleTitle: rulePackage.manifest.title[rulePackage.manifest.defaultLocale] ?? ruleId,
      stories
    });
  }

  return catalog;
}

export async function loadPlayableContentBundle(
  contentRoot: string,
  ruleId: string,
  storyDirectoryName: string,
  requestedLocale: LocaleCode = DEFAULT_LOCALE
): Promise<LoadedContentBundle> {
  const rule = await loadRulePackage(contentRoot, ruleId, requestedLocale);
  const story = await loadStoryPackage(contentRoot, ruleId, storyDirectoryName, requestedLocale);

  return {
    requestedLocale,
    resolvedLocale: story.resolvedLocale,
    rule,
    story
  };
}
