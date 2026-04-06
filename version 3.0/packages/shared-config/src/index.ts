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
