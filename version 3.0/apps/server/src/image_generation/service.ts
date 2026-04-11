import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ImageCharacterReference,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImagePromptTemplateConfig
} from "../../../../packages/shared-types/src/index.ts";
import { getImageProviderConfig } from "./config.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const imagePromptConfigPath = join(
  projectRoot,
  "apps",
  "prompt",
  "image_generation",
  "prompt_templates.json"
);

let cachedPromptTemplateConfig: ImagePromptTemplateConfig | null = null;

function ensureRecordOfStrings(
  value: unknown,
  fieldName: string
): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      throw new Error(`${fieldName}.${key} must be a string.`);
    }
    output[key] = item;
  }

  return output;
}

function normalizePromptTemplateConfig(rawValue: unknown): ImagePromptTemplateConfig {
  if (typeof rawValue !== "object" || rawValue === null || Array.isArray(rawValue)) {
    throw new Error("Image prompt template config must be an object.");
  }

  const data = rawValue as Record<string, unknown>;
  const triggerTemplates = ensureRecordOfStrings(data.triggerTemplates, "triggerTemplates");
  const themes = ensureRecordOfStrings(data.themes, "themes");

  return {
    version:
      typeof data.version === "number" && Number.isFinite(data.version) ? data.version : 1,
    defaultTheme:
      typeof data.defaultTheme === "string" && data.defaultTheme.trim().length > 0
        ? data.defaultTheme.trim()
        : "parchment",
    defaultTrigger:
      data.defaultTrigger === "character_portrait" ||
      data.defaultTrigger === "npc_intro" ||
      data.defaultTrigger === "scene_shift"
        ? data.defaultTrigger
        : "manual",
    fallbackTriggerTemplate:
      typeof data.fallbackTriggerTemplate === "string" && data.fallbackTriggerTemplate.trim().length > 0
        ? data.fallbackTriggerTemplate.trim()
        : "{basePrompt}, {castClause} TRPG illustration, {themeStyle}, no text, no watermark",
    themes,
    triggerTemplates: {
      manual:
        triggerTemplates.manual ??
        "{basePrompt}, {castClause} TRPG illustration, {themeStyle}, no text, no watermark",
      character_portrait:
        triggerTemplates.character_portrait ??
        "{basePrompt}, portrait, {themeStyle}, no text, no watermark",
      npc_intro:
        triggerTemplates.npc_intro ??
        "{basePrompt}, NPC portrait, {castClause} {themeStyle}, no text, no watermark",
      scene_shift:
        triggerTemplates.scene_shift ??
        "{basePrompt}, scene illustration, {castClause} {themeStyle}, no text, no watermark"
    },
    characterClauseTemplate:
      typeof data.characterClauseTemplate === "string"
        ? data.characterClauseTemplate
        : "Keep recurring character consistency. Include these characters in-frame where suitable: {joinedCharacters}.",
    characterJoinSeparator:
      typeof data.characterJoinSeparator === "string" ? data.characterJoinSeparator : "; ",
    characterEntryTemplate:
      typeof data.characterEntryTemplate === "string"
        ? data.characterEntryTemplate
        : "{name}({appearance})"
  };
}

export async function loadImagePromptTemplateConfig(): Promise<ImagePromptTemplateConfig> {
  if (cachedPromptTemplateConfig) {
    return cachedPromptTemplateConfig;
  }

  const raw = await readFile(imagePromptConfigPath, "utf8");
  cachedPromptTemplateConfig = normalizePromptTemplateConfig(JSON.parse(raw));
  return cachedPromptTemplateConfig;
}

function buildCastClause(
  characters: ImageCharacterReference[] | undefined,
  promptTemplateConfig: ImagePromptTemplateConfig
): string {
  const normalizedCharacters = (characters ?? [])
    .map((item) => ({
      name: item.name.trim(),
      appearance: item.appearance.trim()
    }))
    .filter((item) => item.name.length > 0 && item.appearance.length > 0)
    .slice(0, 4);

  if (normalizedCharacters.length === 0) {
    return "";
  }

  const joinedCharacters = normalizedCharacters
    .map((item) =>
      promptTemplateConfig.characterEntryTemplate
        .replace("{name}", item.name)
        .replace("{appearance}", item.appearance)
    )
    .join(promptTemplateConfig.characterJoinSeparator);

  return promptTemplateConfig.characterClauseTemplate.replace(
    "{joinedCharacters}",
    joinedCharacters
  );
}

function buildFinalPrompt(
  request: ImageGenerationRequest,
  promptTemplateConfig: ImagePromptTemplateConfig
): string {
  const resolvedTheme = request.theme?.trim() || promptTemplateConfig.defaultTheme;
  const themeStyle =
    promptTemplateConfig.themes[resolvedTheme] ??
    promptTemplateConfig.themes[promptTemplateConfig.defaultTheme] ??
    "";
  const triggerTemplate =
    promptTemplateConfig.triggerTemplates[request.trigger] ??
    promptTemplateConfig.fallbackTriggerTemplate;
  const castClause = buildCastClause(request.characters, promptTemplateConfig);

  return triggerTemplate
    .replaceAll("{basePrompt}", request.prompt.trim())
    .replaceAll("{castClause}", castClause)
    .replaceAll("{themeStyle}", themeStyle)
    .replace(/\s+/gu, " ")
    .trim();
}

function buildMockSvg(prompt: string, theme: string): string {
  const palettes: Record<string, { bg: string; fg: string; accent: string }> = {
    parchment: { bg: "#efe4c8", fg: "#3f2d18", accent: "#8f6a37" },
    nightwatch: { bg: "#122338", fg: "#f1f6ff", accent: "#77b7ff" },
    neon: { bg: "#101d1a", fg: "#effffb", accent: "#39f2c7" }
  };
  const palette = palettes[theme] ?? palettes.parchment;
  const lines = prompt
    .slice(0, 180)
    .match(/.{1,42}(?:\s|$)/gu) ?? [prompt.slice(0, 42)];

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bg}" />
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0.65" />
    </linearGradient>
  </defs>
  <rect width="768" height="1024" fill="url(#bg)" />
  <circle cx="384" cy="304" r="156" fill="${palette.fg}" fill-opacity="0.12" />
  <rect x="172" y="462" width="424" height="354" rx="36" fill="${palette.fg}" fill-opacity="0.1" />
  <text x="72" y="108" fill="${palette.fg}" font-family="Georgia, serif" font-size="40">AI TRPG IMAGE</text>
  <text x="72" y="166" fill="${palette.fg}" font-family="Georgia, serif" font-size="20">Mock preview</text>
  ${lines
    .map(
      (line, index) =>
        `<text x="72" y="${904 + index * 30}" fill="${palette.fg}" font-family="Georgia, serif" font-size="22">${line
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")}</text>`
    )
    .join("")}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function buildCacheKey(request: ImageGenerationRequest, finalPrompt: string, model: string | null): string {
  return createHash("sha1")
    .update(
      JSON.stringify({
        sceneId: request.sceneId,
        trigger: request.trigger,
        theme: request.theme,
        prompt: finalPrompt,
        model,
        characters: request.characters ?? []
      })
    )
    .digest("hex");
}

function extractGeminiImage(data: unknown): { bytes: Buffer; mimeType: string } | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const payload = data as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            data?: string;
            mimeType?: string;
          };
        }>;
      };
    }>;
  };

  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inlineData = part.inlineData;
      if (inlineData?.data) {
        return {
          bytes: Buffer.from(inlineData.data, "base64"),
          mimeType: inlineData.mimeType ?? "image/png"
        };
      }
    }
  }

  return null;
}

async function generateGeminiImage(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<{ imageUrl: string; mimeType: string }> {
  const response = await fetch(
    `${args.baseUrl.replace(/\/+$/u, "")}/models/${args.model}:generateContent?key=${encodeURIComponent(args.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: args.prompt
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    const message =
      typeof data?.error?.message === "string"
        ? data.error.message
        : `Gemini image request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  const image = extractGeminiImage(data);
  if (!image) {
    throw new Error("Gemini image request returned no image data.");
  }

  return {
    imageUrl: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`,
    mimeType: image.mimeType
  };
}

export async function generateImage(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const basePrompt = request.prompt.trim();
  if (!basePrompt) {
    throw new Error("Image prompt is required.");
  }

  const promptTemplateConfig = request.promptTemplateConfig
    ? normalizePromptTemplateConfig(request.promptTemplateConfig)
    : await loadImagePromptTemplateConfig();
  const finalPrompt = buildFinalPrompt(request, promptTemplateConfig);
  const providerConfig = getImageProviderConfig({
    imageProfileId: request.imageProfileId,
    runtimeImageModelConfig: request.runtimeImageModelConfig
  });
  const cacheKey = buildCacheKey(request, finalPrompt, providerConfig.model);

  try {
    if (
      providerConfig.dependence === "Google" &&
      providerConfig.baseUrl &&
      providerConfig.apiKey &&
      providerConfig.model
    ) {
      const generated = await generateGeminiImage({
        baseUrl: providerConfig.baseUrl,
        apiKey: providerConfig.apiKey,
        model: providerConfig.model,
        prompt: finalPrompt
      });

      return {
        imageUrl: generated.imageUrl,
        revisedPrompt: finalPrompt,
        provider: `${providerConfig.providerLabel}:${providerConfig.model}`,
        cached: false,
        mimeType: generated.mimeType,
        outputPath: null
      };
    }
  } catch (error) {
    if (request.allowFallback === false) {
      throw error;
    }
  }

  const fallbackTheme = request.theme?.trim() || promptTemplateConfig.defaultTheme;
  return {
    imageUrl: buildMockSvg(finalPrompt, fallbackTheme),
    revisedPrompt: finalPrompt,
    provider:
      providerConfig.dependence === "Mock"
        ? "image:mock"
        : `${providerConfig.providerLabel}:fallback`,
    cached: cacheKey.length > 0 ? false : false,
    mimeType: "image/svg+xml",
    outputPath: null
  };
}
