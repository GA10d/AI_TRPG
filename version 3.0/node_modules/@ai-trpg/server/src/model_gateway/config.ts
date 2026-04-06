import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ServerProxyDependence = "OpenAI" | "Google";

export type ServerProxyConfig = {
  dependence: ServerProxyDependence;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  timeoutMs: number;
  providerLabel: string;
};

export type ServerProxyStatus = {
  available: boolean;
  configured: boolean;
  dependence: ServerProxyDependence;
  model: string | null;
  baseUrl: string | null;
  providerLabel: string | null;
  missingEnvKeys: string[];
  message: string;
};

let envLoaded = false;

function projectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
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

function normalizeDependence(rawValue: string | undefined): ServerProxyDependence {
  return rawValue === "Google" ? "Google" : "OpenAI";
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

function resolveApiKey(dependence: ServerProxyDependence): string {
  const apiKey =
    dependence === "Google"
      ? envFirst("TRPG_SERVER_PROXY_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")
      : envFirst("TRPG_SERVER_PROXY_API_KEY", "OPENAI_API_KEY");

  if (!apiKey) {
    throw new Error(
      dependence === "Google"
        ? "server_proxy requires TRPG_SERVER_PROXY_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY."
        : "server_proxy requires TRPG_SERVER_PROXY_API_KEY or OPENAI_API_KEY."
    );
  }

  return apiKey;
}

function getApiKeyCandidates(dependence: ServerProxyDependence): string[] {
  return dependence === "Google"
    ? ["TRPG_SERVER_PROXY_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]
    : ["TRPG_SERVER_PROXY_API_KEY", "OPENAI_API_KEY"];
}

function resolveProviderLabel(dependence: ServerProxyDependence): string {
  return dependence === "Google" ? "server-proxy:google-openai" : "server-proxy:openai";
}

export function getServerProxyStatus(): ServerProxyStatus {
  const dependence = normalizeDependence(envFirst("TRPG_SERVER_PROXY_DEPENDENCE"));
  const model = envFirst("TRPG_SERVER_PROXY_MODEL") ?? null;
  const apiKeyCandidates = getApiKeyCandidates(dependence);
  const apiKey = envFirst(...apiKeyCandidates);
  const baseUrl = normalizeBaseUrl(
    dependence,
    envFirst("TRPG_SERVER_PROXY_BASE_URL")
  );
  const missingEnvKeys: string[] = [];

  if (!model) {
    missingEnvKeys.push("TRPG_SERVER_PROXY_MODEL");
  }
  if (!apiKey) {
    missingEnvKeys.push(apiKeyCandidates.join(" | "));
  }

  const configured = missingEnvKeys.length === 0;
  const providerLabel = resolveProviderLabel(dependence);

  return {
    available: configured,
    configured,
    dependence,
    model,
    baseUrl,
    providerLabel,
    missingEnvKeys,
    message: configured
      ? `server_proxy 已就绪，将通过 ${providerLabel} 调用 ${model}.`
      : `server_proxy 尚未配置完整。缺少：${missingEnvKeys.join(", ")}`
  };
}

export function getServerProxyConfig(): ServerProxyConfig {
  const status = getServerProxyStatus();
  if (!status.configured || !status.model) {
    throw new Error(status.message);
  }
  const dependence = status.dependence;

  return {
    dependence,
    baseUrl: status.baseUrl ?? normalizeBaseUrl(dependence, undefined),
    apiKey: resolveApiKey(dependence),
    model: status.model,
    temperature: parseNumberOrDefault(
      envFirst("TRPG_SERVER_PROXY_TEMPERATURE"),
      0.7
    ),
    maxTokens: parseOptionalNumber(envFirst("TRPG_SERVER_PROXY_MAX_TOKENS")),
    timeoutMs: parseNumberOrDefault(
      envFirst("TRPG_SERVER_PROXY_TIMEOUT_MS"),
      60_000
    ),
    providerLabel: resolveProviderLabel(dependence)
  };
}
