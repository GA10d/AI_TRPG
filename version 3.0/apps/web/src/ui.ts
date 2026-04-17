import type {
  AiGenerationMetadata,
  CreateSessionRequest
} from "../../../packages/shared-types/src/index.ts";
import { zhCn, type UiText } from "./locales/index.tsx";

export type AppView =
  | "menu"
  | "story_select"
  | "game_setup"
  | "game_bootstrap"
  | "continue"
  | "records"
  | "settings"
  | "exit"
  | "game"
  | "settlement";

export type StatusState = {
  message: string;
  tone: "neutral" | "error";
};

export type GameActivityLogEntry = {
  id: string;
  createdAt: string;
  message: string;
  tone: StatusState["tone"];
};

export function getPlayModeOptions(
  text: UiText = zhCn
): Array<{
  value: CreateSessionRequest["playMode"];
  label: string;
  description: string;
}> {
  return [...text.options.playModes];
}

export const PLAY_MODE_OPTIONS = getPlayModeOptions();

export function getGmArchitectureOptions(
  text: UiText = zhCn
): Array<{
  value: CreateSessionRequest["gmArchitecture"];
  label: string;
  description: string;
}> {
  return [...text.options.gmArchitectures];
}

export const GM_ARCHITECTURE_OPTIONS = getGmArchitectureOptions();

export function getDifficultyOptions(
  text: UiText = zhCn
): Array<{
  value: CreateSessionRequest["difficulty"];
  label: string;
  description: string;
}> {
  return [...text.options.difficulties];
}

export const DIFFICULTY_OPTIONS = getDifficultyOptions();

export function getLogViewOptions(
  text: UiText = zhCn
): Array<{
  value: NonNullable<CreateSessionRequest["logViewMode"]>;
  label: string;
  description: string;
}> {
  return [...text.options.logViews];
}

export const LOG_VIEW_OPTIONS = getLogViewOptions();

export type MarkdownFontSizePreset =
  | "standard"
  | "large"
  | "xlarge"
  | "xxlarge";

export type MenuFontSizePreset =
  | "standard"
  | "large"
  | "xlarge"
  | "xxlarge";

export function getMarkdownFontSizeOptions(
  text: UiText = zhCn
): Array<{
  value: MarkdownFontSizePreset;
  label: string;
  description: string;
}> {
  return [...text.options.markdownFontSizes];
}

export const MARKDOWN_FONT_SIZE_OPTIONS = getMarkdownFontSizeOptions();

export function getMenuFontSizeOptions(
  text: UiText = zhCn
): Array<{
  value: MenuFontSizePreset;
  label: string;
  description: string;
}> {
  return [...text.options.menuFontSizes];
}

export const MENU_FONT_SIZE_OPTIONS = getMenuFontSizeOptions();

export function getMenuFontScale(value: MenuFontSizePreset): number {
  switch (value) {
    case "large":
      return 1.1;
    case "xlarge":
      return 1.2;
    case "xxlarge":
      return 1.3;
    case "standard":
    default:
      return 1;
  }
}

export function pickOption<T extends string>(
  value: T | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  return value && allowed.includes(value) ? value : fallback;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function renderJoinedList(items: string[], text: UiText = zhCn): string {
  return items.length > 0 ? items.join(" / ") : text.common.none;
}

export function clipText(
  content: string | null | undefined,
  maxLength = 180,
  text: UiText = zhCn
): string {
  const normalized = content?.replace(/\s+/g, " ").trim() ?? "";

  if (!normalized) {
    return text.common.noContent;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

export function buildPreviewLines(
  content: string | null | undefined,
  maxLines = 5,
  text: UiText = zhCn
): string[] {
  const normalized = content?.replace(/\r\n/g, "\n").trim() ?? "";
  if (!normalized) {
    return text.helperText.previewFallbackLines.slice(0, maxLines);
  }

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

export function formatAiGenerationMeta(
  meta: AiGenerationMetadata | null | undefined,
  text: UiText = zhCn
): string {
  if (!meta) {
    return "";
  }

  const segments: string[] = [];
  if (meta.provider) {
    segments.push(text.helperText.aiMeta.source(meta.provider));
  }
  if (typeof meta.durationMs === "number") {
    segments.push(
      text.helperText.aiMeta.duration(
        (meta.durationMs / 1000).toFixed(meta.durationMs >= 1000 ? 2 : 1)
      )
    );
  }
  if (typeof meta.usage?.totalTokens === "number") {
    segments.push(text.helperText.aiMeta.tokens(meta.usage.totalTokens));
  }
  if (meta.estimatedCost) {
    const currencySymbol = meta.estimatedCost.currency === "CNY" ? "¥" : "$";
    segments.push(
      text.helperText.aiMeta.cost(currencySymbol, meta.estimatedCost.amount.toFixed(6))
    );
  } else {
    segments.push(text.helperText.aiMeta.pendingCost);
  }

  return segments.join(text.helperText.aiMeta.separator);
}
