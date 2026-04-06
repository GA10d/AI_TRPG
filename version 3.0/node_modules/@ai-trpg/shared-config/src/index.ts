import { DEFAULT_LOCALE } from "./languages.ts";

export * from "./languages.ts";

export const DEFAULT_LOG_VIEW_MODE = "compact";

export const SUPPORTED_MODEL_ACCESS_MODES = [
  "mock",
  "server_proxy",
  "browser_direct"
] as const;

export const DEFAULT_MODEL_PROFILES = [
  {
    id: "mock-local",
    label: "Mock Local",
    accessMode: "mock",
    providerFamily: "mock"
  },
  {
    id: "openai-compatible-proxy",
    label: "OpenAI Compatible Proxy",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible"
  }
] as const;

export const PHASE1_MODEL_ACCESS_MODE_OPTIONS = [
  {
    code: "mock",
    label: "Mock",
    description: "使用本地假数据生成开场和会话骨架"
  },
  {
    code: "server_proxy",
    label: "Server Proxy",
    description: "通过 Node 服务端代理调用真实模型，当前支持 OpenAI-compatible 文本接口"
  }
] as const;

export const PHASE1_DEFAULTS = {
  playMode: "single_player",
  gmArchitecture: "single_agent",
  modelAccessMode: "mock",
  locale: DEFAULT_LOCALE,
  logViewMode: DEFAULT_LOG_VIEW_MODE
} as const;
