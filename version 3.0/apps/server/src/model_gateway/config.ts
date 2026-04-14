import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  getDefaultModelProfileId,
  getModelProfile,
  listModelProfiles,
  MODEL_FEATURE_LABELS,
  type ModelFeatureKey,
  type ModelProfileDefinition
} from "../../../../packages/shared-config/src/index.ts";
import type {
  ModelProfileSummary,
  RuntimeModelConfigInput,
  ServerProxyStatus
} from "../../../../packages/shared-types/src/index.ts";

export type ServerProxyDependence = "OpenAI" | "Google";

export type ServerProxyConfig = {
  profileId: string;
  profileName: string;
  profileCode: string;
  dependence: ServerProxyDependence;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  timeoutMs: number;
  providerLabel: string;
  features: ModelProfileDefinition["features"];
};

let envLoaded = false;

function projectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

function parseEnvFileContent(rawContent: string): Array<[string, string]> {
  const entries: Array<[string, string]> = [];

  for (const rawLine of rawContent.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries.push([key, value]);
  }

  return entries;
}

function loadLocalEnvFiles(): void {
  if (envLoaded) {
    return;
  }

  envLoaded = true;
  for (const fileName of [".env.local", ".env"]) {
    const fullPath = resolve(projectRoot(), fileName);
    if (!existsSync(fullPath)) {
      continue;
    }

    const content = readFileSync(fullPath, "utf8");
    for (const [key, value] of parseEnvFileContent(content)) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

function envFirst(...keys: string[]): string | undefined {
  loadLocalEnvFiles();

  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function parseNumberOrDefault(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalNumber(rawValue: string | undefined): number | null {
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveDefaultTimeoutMs(profileId: string): number {
  if (profileId === "doubao") {
    return 180_000;
  }

  return 60_000;
}

function normalizeDependence(profile: ModelProfileDefinition): ServerProxyDependence {
  return profile.dependence === "Google" ? "Google" : "OpenAI";
}

function normalizeBaseUrl(
  dependence: ServerProxyDependence,
  rawBaseUrl: string | undefined
): string {
  if (dependence === "Google") {
    const defaultBase = "https://generativelanguage.googleapis.com/v1beta/openai";
    const normalized = (rawBaseUrl ?? defaultBase).replace(/\/+$/u, "");
    return normalized.endsWith("/v1beta/openai")
      ? normalized
      : `${normalized}/v1beta/openai`;
  }

  return (rawBaseUrl ?? "https://api.openai.com/v1").replace(/\/+$/u, "");
}

function resolveProviderLabel(profile: ModelProfileDefinition): string {
  return profile.dependence === "Google"
    ? `server-proxy:google-openai:${profile.code}`
    : `server-proxy:openai:${profile.code}`;
}

function resolveProfile(profileId: string | undefined): ModelProfileDefinition {
  const targetProfile =
    (profileId ? getModelProfile(profileId) : null) ??
    getModelProfile(getDefaultModelProfileId("server_proxy"));

  if (!targetProfile) {
    throw new Error("No model profile could be resolved for server_proxy.");
  }

  if (targetProfile.accessMode !== "server_proxy") {
    throw new Error(`Model profile ${targetProfile.id} is not a server_proxy profile.`);
  }

  return targetProfile;
}

function pickRuntimeValue(
  runtimeModelConfig: RuntimeModelConfigInput | undefined,
  key: keyof RuntimeModelConfigInput
): string | undefined {
  const rawValue = runtimeModelConfig?.[key];
  return typeof rawValue === "string" && rawValue.trim().length > 0
    ? rawValue.trim()
    : undefined;
}

function resolveApiKey(
  profile: ModelProfileDefinition,
  runtimeModelConfig?: RuntimeModelConfigInput
): string | null {
  return pickRuntimeValue(runtimeModelConfig, "apiKey") ?? envFirst(...profile.envKeyCandidates) ?? null;
}

function resolveModelName(
  profile: ModelProfileDefinition,
  runtimeModelConfig?: RuntimeModelConfigInput
): string | null {
  return (
    pickRuntimeValue(runtimeModelConfig, "model") ??
    envFirst(...profile.modelEnvKeyCandidates) ??
    profile.baseModel
  );
}

function resolveBaseUrl(
  profile: ModelProfileDefinition,
  runtimeModelConfig?: RuntimeModelConfigInput
): string | null {
  const rawBaseUrl =
    pickRuntimeValue(runtimeModelConfig, "baseUrl") ??
    envFirst(...profile.baseUrlEnvKeyCandidates) ??
    profile.baseUrl ??
    undefined;

  if (!rawBaseUrl && profile.urlRequirements) {
    return null;
  }

  return normalizeBaseUrl(normalizeDependence(profile), rawBaseUrl);
}

function buildMissingKeys(
  profile: ModelProfileDefinition,
  runtimeModelConfig?: RuntimeModelConfigInput
): string[] {
  const missingKeys: string[] = [];

  if (!resolveApiKey(profile, runtimeModelConfig)) {
    missingKeys.push(profile.envKeyCandidates.join(" | "));
  }

  if (!resolveModelName(profile, runtimeModelConfig)) {
    missingKeys.push(profile.modelEnvKeyCandidates.join(" | "));
  }

  if (!resolveBaseUrl(profile, runtimeModelConfig)) {
    missingKeys.push(profile.baseUrlEnvKeyCandidates.join(" | "));
  }

  return missingKeys;
}

function buildProfileMessage(
  profile: ModelProfileDefinition,
  runtimeModelConfig?: RuntimeModelConfigInput
): string {
  const missingKeys = buildMissingKeys(profile, runtimeModelConfig);
  if (missingKeys.length === 0) {
    const resolvedModel = resolveModelName(profile, runtimeModelConfig);
    return `${profile.name} 已就绪，将使用 ${resolvedModel}.`;
  }

  return `${profile.name} 尚未配置完整。缺少：${missingKeys.join(", ")}`;
}

function buildFeatureDetails(
  profile: ModelProfileDefinition
): ModelProfileSummary["featureDetails"] {
  return (Object.entries(profile.features) as Array<
    [ModelFeatureKey, ModelProfileDefinition["features"][ModelFeatureKey]]
  >).map(([featureKey, featureConfig]) => ({
    key: featureKey,
    label: MODEL_FEATURE_LABELS[featureKey],
    supported: featureConfig.supported,
    model: featureConfig.model,
    url: featureConfig.url
  }));
}

export function listModelProfileSummaries(): ModelProfileSummary[] {
  return listModelProfiles().map((profile) => {
    const missingKeys =
      profile.accessMode === "server_proxy" ? buildMissingKeys(profile) : [];
    const configured = profile.accessMode === "mock" ? true : missingKeys.length === 0;
    const featureDetails = buildFeatureDetails(profile);

    return {
      id: profile.id,
      name: profile.name,
      code: profile.code,
      accessMode: profile.accessMode,
      providerFamily: profile.providerFamily,
      dependence: profile.dependence,
      description: profile.description,
      urlRequirements: profile.urlRequirements,
      baseUrl:
        profile.accessMode === "server_proxy" ? resolveBaseUrl(profile) : profile.baseUrl,
      baseModel:
        profile.accessMode === "server_proxy" ? resolveModelName(profile) : profile.baseModel,
      chargeUrl: profile.chargeUrl,
      docsUrl: profile.docsUrl,
      envKeyCandidates: profile.envKeyCandidates,
      supportsFeatures: featureDetails
        .filter((feature) => feature.supported)
        .map((feature) => feature.key),
      featureDetails,
      allowsCustomApiKey: profile.allowsCustomApiKey,
      allowsCustomBaseUrl: profile.allowsCustomBaseUrl,
      allowsCustomModel: profile.allowsCustomModel,
      configured,
      available: true,
      missingEnvKeys: missingKeys,
      message:
        profile.accessMode === "mock"
          ? "mock 模式始终可用。"
          : buildProfileMessage(profile)
    };
  });
}

export function getServerProxyStatus(): ServerProxyStatus {
  const summaries = listModelProfileSummaries().filter(
    (item) => item.accessMode === "server_proxy"
  );
  const configuredProfiles = summaries.filter((item) => item.configured);
  const configuredProfileIds = configuredProfiles.map((item) => item.id);
  const defaultProfileId = getDefaultModelProfileId("server_proxy");

  return {
    available: true,
    configured: configuredProfiles.length > 0,
    configuredProfileIds,
    defaultProfileId,
    message:
      configuredProfiles.length > 0
        ? `已检测到 ${configuredProfiles.length} 个可用的 server_proxy 模型档案。`
        : "当前没有完整的 server_proxy 环境配置，但仍可通过前端临时填写 API key、base url 和模型名。"
  };
}

export function getServerProxyConfig(input: {
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
}): ServerProxyConfig {
  const profile = resolveProfile(input.modelProfileId);
  const apiKey = resolveApiKey(profile, input.runtimeModelConfig);
  const model = resolveModelName(profile, input.runtimeModelConfig);
  const baseUrl = resolveBaseUrl(profile, input.runtimeModelConfig);
  const missingKeys = buildMissingKeys(profile, input.runtimeModelConfig);

  if (!apiKey || !model || !baseUrl || missingKeys.length > 0) {
    throw new Error(buildProfileMessage(profile, input.runtimeModelConfig));
  }

  return {
    profileId: profile.id,
    profileName: profile.name,
    profileCode: profile.code,
    dependence: normalizeDependence(profile),
    baseUrl,
    apiKey,
    model,
    temperature: parseNumberOrDefault(envFirst("TRPG_SERVER_PROXY_TEMPERATURE"), 0.7),
    maxTokens: parseOptionalNumber(envFirst("TRPG_SERVER_PROXY_MAX_TOKENS")),
    timeoutMs: parseNumberOrDefault(
      envFirst("TRPG_SERVER_PROXY_TIMEOUT_MS"),
      resolveDefaultTimeoutMs(profile.id)
    ),
    providerLabel: resolveProviderLabel(profile),
    features: profile.features
  };
}
