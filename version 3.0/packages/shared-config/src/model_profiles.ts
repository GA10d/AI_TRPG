import type { ModelAccessMode } from "../../shared-types/src/index.ts";

export type ModelFeatureKey =
  | "mini_version"
  | "deep_think"
  | "json_output"
  | "tool_calls"
  | "file_upload";

export type ModelFeatureConfig = {
  supported: boolean;
  model: string | null;
  url: string | null;
};

export const MODEL_FEATURE_LABELS: Record<ModelFeatureKey, string> = {
  mini_version: "轻量版",
  deep_think: "深度思考",
  json_output: "结构化 JSON",
  tool_calls: "工具调用",
  file_upload: "文件上传"
};

export type ProviderDependence = "Mock" | "OpenAI" | "Google";

export type ModelProfileDefinition = {
  id: string;
  order: number;
  name: string;
  code: string;
  accessMode: ModelAccessMode;
  providerFamily: string;
  dependence: ProviderDependence;
  description: string;
  urlRequirements: boolean;
  baseUrl: string | null;
  baseModel: string | null;
  chargeUrl: string;
  docsUrl: string;
  envKeyCandidates: string[];
  modelEnvKeyCandidates: string[];
  baseUrlEnvKeyCandidates: string[];
  allowsCustomApiKey: boolean;
  allowsCustomBaseUrl: boolean;
  allowsCustomModel: boolean;
  features: Record<ModelFeatureKey, ModelFeatureConfig>;
};

export const MODEL_PROFILES: ModelProfileDefinition[] = [
  {
    id: "mock-local",
    order: 1,
    name: "Mock Local",
    code: "mock",
    accessMode: "mock",
    providerFamily: "mock",
    dependence: "Mock",
    description: "本地假数据模式，用于开发、调试和基础流程验证。",
    urlRequirements: false,
    baseUrl: null,
    baseModel: null,
    chargeUrl: "",
    docsUrl: "",
    envKeyCandidates: [],
    modelEnvKeyCandidates: [],
    baseUrlEnvKeyCandidates: [],
    allowsCustomApiKey: false,
    allowsCustomBaseUrl: false,
    allowsCustomModel: false,
    features: {
      mini_version: { supported: true, model: null, url: null },
      deep_think: { supported: true, model: null, url: null },
      json_output: { supported: true, model: null, url: null },
      tool_calls: { supported: false, model: null, url: null },
      file_upload: { supported: false, model: null, url: null }
    }
  },
  {
    id: "chatgpt",
    order: 10,
    name: "ChatGPT",
    code: "chatgpt",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible",
    dependence: "OpenAI",
    description: "使用 OpenAI 原生接口或兼容接口调用 GPT 系列文本模型。",
    urlRequirements: false,
    baseUrl: null,
    baseModel: "gpt-5.4",
    chargeUrl: "https://platform.openai.com/api-keys",
    docsUrl: "https://platform.openai.com/docs",
    envKeyCandidates: ["OPENAI_API_KEY", "TRPG_SERVER_PROXY_API_KEY"],
    modelEnvKeyCandidates: ["TRPG_CHATGPT_MODEL", "TRPG_SERVER_PROXY_MODEL"],
    baseUrlEnvKeyCandidates: ["TRPG_CHATGPT_BASE_URL", "TRPG_SERVER_PROXY_BASE_URL"],
    allowsCustomApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    features: {
      mini_version: { supported: true, model: "gpt-5.4-mini", url: null },
      deep_think: {
        supported: true,
        model: "gpt-5.4",
        url: "https://platform.openai.com/docs/guides/reasoning"
      },
      json_output: { supported: true, model: "gpt-5.4", url: null },
      tool_calls: { supported: true, model: "gpt-5.4", url: null },
      file_upload: {
        supported: true,
        model: "gpt-5.4",
        url: "https://platform.openai.com/docs/guides/pdf-files"
      }
    }
  },
  {
    id: "deepseek-chat",
    order: 20,
    name: "DeepSeek Chat",
    code: "deepseek",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible",
    dependence: "OpenAI",
    description: "使用 DeepSeek 的 OpenAI-compatible 文本接口。",
    urlRequirements: true,
    baseUrl: "https://api.deepseek.com",
    baseModel: "deepseek-chat",
    chargeUrl: "https://platform.deepseek.com/usage",
    docsUrl: "https://api-docs.deepseek.com/zh-cn/",
    envKeyCandidates: ["DEEPSEEK_API_KEY", "TRPG_SERVER_PROXY_API_KEY"],
    modelEnvKeyCandidates: [
      "TRPG_DEEPSEEK_CHAT_MODEL",
      "TRPG_DEEPSEEK_MODEL",
      "TRPG_SERVER_PROXY_MODEL"
    ],
    baseUrlEnvKeyCandidates: ["TRPG_DEEPSEEK_BASE_URL", "TRPG_SERVER_PROXY_BASE_URL"],
    allowsCustomApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    features: {
      mini_version: { supported: false, model: null, url: null },
      deep_think: {
        supported: true,
        model: "deepseek-reasoner",
        url: "https://api-docs.deepseek.com/guides/thinking_mode"
      },
      json_output: {
        supported: true,
        model: "deepseek-chat",
        url: "https://api.deepseek.com"
      },
      tool_calls: {
        supported: true,
        model: "deepseek-chat",
        url: "https://api.deepseek.com"
      },
      file_upload: { supported: false, model: null, url: null }
    }
  },
  {
    id: "deepseek-reasoner",
    order: 21,
    name: "DeepSeek Reasoner",
    code: "deepseek",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible",
    dependence: "OpenAI",
    description: "浣跨敤 DeepSeek Reasoner 鐨?OpenAI-compatible 鏂囨湰鎺ュ彛銆?",
    urlRequirements: true,
    baseUrl: "https://api.deepseek.com",
    baseModel: "deepseek-reasoner",
    chargeUrl: "https://platform.deepseek.com/usage",
    docsUrl: "https://api-docs.deepseek.com/zh-cn/",
    envKeyCandidates: ["DEEPSEEK_API_KEY", "TRPG_SERVER_PROXY_API_KEY"],
    modelEnvKeyCandidates: ["TRPG_DEEPSEEK_REASONER_MODEL"],
    baseUrlEnvKeyCandidates: ["TRPG_DEEPSEEK_BASE_URL", "TRPG_SERVER_PROXY_BASE_URL"],
    allowsCustomApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    features: {
      mini_version: { supported: false, model: null, url: null },
      deep_think: {
        supported: true,
        model: "deepseek-reasoner",
        url: "https://api-docs.deepseek.com/guides/thinking_mode"
      },
      json_output: {
        supported: true,
        model: "deepseek-reasoner",
        url: "https://api-docs.deepseek.com/guides/reasoning_model"
      },
      tool_calls: {
        supported: false,
        model: null,
        url: "https://api-docs.deepseek.com/guides/reasoning_model"
      },
      file_upload: { supported: false, model: null, url: null }
    }
  },
  {
    id: "gemini",
    order: 30,
    name: "Gemini",
    code: "gemini",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible",
    dependence: "Google",
    description: "使用 Gemini 的 OpenAI-compatible 接口模式。",
    urlRequirements: false,
    baseUrl: "https://generativelanguage.googleapis.com",
    baseModel: "gemini-3-pro-preview",
    chargeUrl: "https://aistudio.google.com/app/billing",
    docsUrl: "https://ai.google.dev/docs",
    envKeyCandidates: [
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "TRPG_SERVER_PROXY_API_KEY"
    ],
    modelEnvKeyCandidates: ["TRPG_GEMINI_MODEL", "TRPG_SERVER_PROXY_MODEL"],
    baseUrlEnvKeyCandidates: ["TRPG_GEMINI_BASE_URL", "TRPG_SERVER_PROXY_BASE_URL"],
    allowsCustomApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    features: {
      mini_version: { supported: true, model: "gemini-3-flash-preview", url: null },
      deep_think: {
        supported: true,
        model: "gemini-3-pro-preview",
        url: "https://ai.google.dev/gemini-api/docs/thinking"
      },
      json_output: { supported: true, model: "gemini-3-pro-preview", url: null },
      tool_calls: { supported: true, model: "gemini-3-pro-preview", url: null },
      file_upload: {
        supported: true,
        model: "gemini-3-pro-preview",
        url: "https://ai.google.dev/gemini-api/docs/files"
      }
    }
  },
  {
    id: "doubao",
    order: 35,
    name: "Doubao",
    code: "doubao",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible",
    dependence: "OpenAI",
    description: "使用火山引擎方舟（Doubao / Ark）的 OpenAI-compatible 接口。",
    urlRequirements: true,
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    baseModel: "doubao-seed-2-0-pro-260215",
    chargeUrl: "https://console.volcengine.com/ark",
    docsUrl: "https://www.volcengine.com/docs/82379/1099522",
    envKeyCandidates: [
      "DOUBAO_API_KEY",
      "TRPG_DOUBAO_API_KEY",
      "ARK_API_KEY",
      "TRPG_SERVER_PROXY_API_KEY"
    ],
    modelEnvKeyCandidates: ["TRPG_DOUBAO_MODEL", "TRPG_SERVER_PROXY_MODEL"],
    baseUrlEnvKeyCandidates: ["TRPG_DOUBAO_BASE_URL", "TRPG_SERVER_PROXY_BASE_URL"],
    allowsCustomApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    features: {
      mini_version: {
        supported: true,
        model: "doubao-seed-2-0-mini-260215",
        url: "https://www.volcengine.com/docs/6492/2250683"
      },
      deep_think: {
        supported: true,
        model: "doubao-seed-2-0-pro-260215",
        url: "https://www.volcengine.com/docs/6492/2250683"
      },
      json_output: {
        supported: true,
        model: "doubao-seed-2-0-pro-260215",
        url: "https://www.volcengine.com/docs/6492/2250683"
      },
      tool_calls: {
        supported: true,
        model: "doubao-seed-2-0-pro-260215",
        url: "https://www.volcengine.com/docs/6492/2250683"
      },
      file_upload: { supported: false, model: null, url: null }
    }
  },
  {
    id: "qwen",
    order: 36,
    name: "Qwen",
    code: "qwen",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible",
    dependence: "OpenAI",
    description: "Use Alibaba Cloud Model Studio Qwen models through the OpenAI-compatible interface.",
    urlRequirements: true,
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    baseModel: "qwen-plus",
    chargeUrl: "https://www.alibabacloud.com/help/en/model-studio/models",
    docsUrl: "https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen",
    envKeyCandidates: [
      "QWEN_API_KEY",
      "TRPG_QWEN_API_KEY",
      "DASHSCOPE_API_KEY",
      "BAILIAN_API_KEY",
      "TRPG_SERVER_PROXY_API_KEY"
    ],
    modelEnvKeyCandidates: ["TRPG_QWEN_MODEL", "TRPG_SERVER_PROXY_MODEL"],
    baseUrlEnvKeyCandidates: ["TRPG_QWEN_BASE_URL", "TRPG_SERVER_PROXY_BASE_URL"],
    allowsCustomApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    features: {
      mini_version: {
        supported: true,
        model: "qwen-flash",
        url: "https://www.alibabacloud.com/help/en/model-studio/models"
      },
      deep_think: {
        supported: true,
        model: "qwen-plus",
        url: "https://www.alibabacloud.com/help/en/model-studio/models"
      },
      json_output: {
        supported: true,
        model: "qwen-plus",
        url: "https://www.alibabacloud.com/help/en/model-studio/qwen-api-reference"
      },
      tool_calls: {
        supported: false,
        model: null,
        url: "https://www.alibabacloud.com/help/en/model-studio/qwen-api-reference"
      },
      file_upload: { supported: false, model: null, url: null }
    }
  },
  {
    id: "custom-openai-compatible",
    order: 40,
    name: "Custom OpenAI-Compatible",
    code: "custom_openai_compatible",
    accessMode: "server_proxy",
    providerFamily: "openai-compatible",
    dependence: "OpenAI",
    description: "为其他兼容 OpenAI 协议的服务预留自定义入口。",
    urlRequirements: true,
    baseUrl: null,
    baseModel: null,
    chargeUrl: "",
    docsUrl: "",
    envKeyCandidates: ["TRPG_CUSTOM_OPENAI_API_KEY", "TRPG_SERVER_PROXY_API_KEY"],
    modelEnvKeyCandidates: ["TRPG_CUSTOM_OPENAI_MODEL", "TRPG_SERVER_PROXY_MODEL"],
    baseUrlEnvKeyCandidates: ["TRPG_CUSTOM_OPENAI_BASE_URL", "TRPG_SERVER_PROXY_BASE_URL"],
    allowsCustomApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    features: {
      mini_version: { supported: false, model: null, url: null },
      deep_think: { supported: false, model: null, url: null },
      json_output: { supported: true, model: null, url: null },
      tool_calls: { supported: false, model: null, url: null },
      file_upload: { supported: false, model: null, url: null }
    }
  }
];

export function listModelProfiles(): ModelProfileDefinition[] {
  return [...MODEL_PROFILES].sort((left, right) => left.order - right.order);
}

export function getModelProfile(profileId: string): ModelProfileDefinition | null {
  const normalizedProfileId = profileId === "deepseek" ? "deepseek-chat" : profileId;
  return MODEL_PROFILES.find((item) => item.id === normalizedProfileId) ?? null;
}

export function getDefaultModelProfileId(accessMode: ModelAccessMode): string {
  if (accessMode === "mock") {
    return "mock-local";
  }

  return "chatgpt";
}
