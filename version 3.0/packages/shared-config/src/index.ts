import { DEFAULT_LOCALE } from "./languages.ts";
import { getDefaultImageProfileId } from "./image_profiles.ts";
import { getDefaultModelProfileId } from "./model_profiles.ts";

export * from "./languages.ts";
export * from "./image_profiles.ts";
export * from "./model_profiles.ts";
export * from "./model_pricing.ts";

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
    id: "chatgpt",
    label: "ChatGPT",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible"
  },
  {
    id: "deepseek-chat",
    label: "DeepSeek Chat",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible"
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible"
  },
  {
    id: "gemini",
    label: "Gemini",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible"
  },
  {
    id: "qwen",
    label: "Qwen",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible"
  },
  {
    id: "custom-openai-compatible",
    label: "Custom OpenAI-Compatible",
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
    description: "通过 Node 服务端代理调用真实模型，支持多模型档案和 API key 覆盖"
  }
] as const;

export const PHASE1_DEFAULTS = {
  playMode: "single_player",
  gmArchitecture: "single_agent",
  backgroundCompressionEnabled: true,
  modelAccessMode: "mock",
  modelProfileId: getDefaultModelProfileId("mock"),
  imageProfileId: getDefaultImageProfileId(),
  locale: DEFAULT_LOCALE,
  logViewMode: DEFAULT_LOG_VIEW_MODE
} as const;
