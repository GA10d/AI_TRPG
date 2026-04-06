import type { CreateSessionRequest } from "../../../packages/shared-types/src/index.ts";

export type AppView =
  | "menu"
  | "new"
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
}> = [
  { value: "single_player", label: "单人模式" },
  { value: "single_player_with_npc", label: "单人 + NPC" },
  { value: "multiplayer", label: "多人模式" }
];

export const GM_ARCHITECTURE_OPTIONS: Array<{
  value: CreateSessionRequest["gmArchitecture"];
  label: string;
}> = [
  { value: "single_agent", label: "单 Agent 主持" },
  { value: "multi_agent", label: "多 Agent 主持" }
];

export const LOG_VIEW_OPTIONS: Array<{
  value: NonNullable<CreateSessionRequest["logViewMode"]>;
  label: string;
}> = [
  { value: "all", label: "全部日志" },
  { value: "compact", label: "精简日志" },
  { value: "hidden", label: "隐藏日志" }
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
