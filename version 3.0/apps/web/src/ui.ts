import type {
  AiGenerationMetadata,
  CreateSessionRequest
} from "../../../packages/shared-types/src/index.ts";

export type AppView =
  | "menu"
  | "story_select"
  | "game_setup"
  | "continue"
  | "records"
  | "settings"
  | "exit"
  | "game";

export type StatusState = {
  message: string;
  tone: "neutral" | "error";
};

export const PLAY_MODE_OPTIONS: Array<{
  value: CreateSessionRequest["playMode"];
  label: string;
  description: string;
}> = [
  {
    value: "single_player",
    label: "单人模式",
    description: "由你一个人推进剧情，适合最轻量的体验。"
  },
  {
    value: "single_player_with_npc",
    label: "单人 + NPC",
    description: "除你之外还会有 AI 同伴参与讨论与行动。"
  },
  {
    value: "multiplayer",
    label: "多人模式",
    description: "为后续联机流程预留，当前仍以单机路径为主。"
  }
];

export const GM_ARCHITECTURE_OPTIONS: Array<{
  value: CreateSessionRequest["gmArchitecture"];
  label: string;
  description: string;
}> = [
  {
    value: "single_agent",
    label: "单 Agent 主持",
    description: "由一个主持模型统一负责叙事与 NPC 扮演。"
  },
  {
    value: "multi_agent",
    label: "多 Agent 主持",
    description: "为未来多智能体协作保留入口，当前仍以单 Agent 为主。"
  }
];

export const LOG_VIEW_OPTIONS: Array<{
  value: NonNullable<CreateSessionRequest["logViewMode"]>;
  label: string;
  description: string;
}> = [
  {
    value: "all",
    label: "全部日志",
    description: "显示完整运行日志，方便排查。"
  },
  {
    value: "compact",
    label: "精简日志",
    description: "只保留关键事件，适合正常游玩。"
  },
  {
    value: "hidden",
    label: "隐藏日志",
    description: "将日志区域收敛为最低打扰。"
  }
];

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

export function renderJoinedList(items: string[]): string {
  return items.length > 0 ? items.join(" / ") : "暂无";
}

export function clipText(content: string | null | undefined, maxLength = 180): string {
  const normalized = content?.replace(/\s+/g, " ").trim() ?? "";

  if (!normalized) {
    return "暂无内容。";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

export function buildPreviewLines(content: string | null | undefined, maxLines = 5): string[] {
  const normalized = content?.replace(/\r\n/g, "\n").trim() ?? "";
  if (!normalized) {
    return [
      "夜幕正在收拢，旧磁带里的声音还没完全显形。",
      "这段预览区会在后续接入真实开场生成。",
      "当前先根据剧本简介和规则设定为你搭起氛围。"
    ];
  }

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);
}

export function formatAiGenerationMeta(meta: AiGenerationMetadata | null | undefined): string {
  if (!meta) {
    return "";
  }

  const segments: string[] = [];
  if (meta.provider) {
    segments.push(`来源：${meta.provider}`);
  }
  if (typeof meta.durationMs === "number") {
    segments.push(
      `耗时：${(meta.durationMs / 1000).toFixed(meta.durationMs >= 1000 ? 2 : 1)}s`
    );
  }
  if (typeof meta.usage?.totalTokens === "number") {
    segments.push(`Tokens：${meta.usage.totalTokens}`);
  }
  if (typeof meta.estimatedCostUsd === "number") {
    segments.push(`费用：$${meta.estimatedCostUsd.toFixed(6)}`);
  } else {
    segments.push("费用：待补充");
  }

  return segments.join(" · ");
}
