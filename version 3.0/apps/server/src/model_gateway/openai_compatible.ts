import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLanguageSystemPrompt } from "../../../../packages/shared-config/src/index.ts";
import type {
  OpeningGenerationInput,
  OpeningGenerationOutput,
  TurnNarrationInput,
  TurnNarrationOutput
} from "./types.ts";
import { getServerProxyConfig, type ServerProxyConfig } from "./config.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const beginningPromptDir = join(projectRoot, "apps", "prompt", "beginning");
const promptFileExtensions = new Set([
  ".txt",
  ".md",
  ".markdown"
]);

let cachedBeginningSystemPrompt: string | null = null;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type ChatCompletionResult = {
  text: string;
  durationMs: number;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
};

async function loadBeginningSystemPrompt(): Promise<string> {
  if (cachedBeginningSystemPrompt !== null) {
    return cachedBeginningSystemPrompt;
  }

  const fileNames = (await readdir(beginningPromptDir))
    .filter((fileName) => promptFileExtensions.has(extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, "en"));

  if (fileNames.length === 0) {
    throw new Error("apps/prompt/beginning 涓嬫病鏈夊彲鐢ㄧ殑绯荤粺鎻愮ず鏂囦欢銆?");
  }

  const contents = await Promise.all(
    fileNames.map((fileName) =>
      readFile(join(beginningPromptDir, fileName), "utf8").then((content) =>
        content.trim()
      )
    )
  );

  cachedBeginningSystemPrompt = contents.filter(Boolean).join("\n\n");
  return cachedBeginningSystemPrompt;
}

async function buildOpeningMessages(input: OpeningGenerationInput): Promise<ChatMessage[]> {
  const openingSystemPrompt = await loadBeginningSystemPrompt();

  return [
    {
      role: "system",
      content: openingSystemPrompt
    },
    {
      role: "user",
      content: [
        `Rule title: ${input.ruleTitle}`,
        "Rule content:",
        input.ruleText
      ].join("\n")
    },
    {
      role: "assistant",
      content: [
        `Story title: ${input.storyTitle}`,
        "Story content:",
        input.storyText
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Target language: ${input.locale}`,
        buildLanguageSystemPrompt(input.locale),
        "",
        "Task:",
        "Generate the opening preview text shown before the session starts.",
        "Keep the output immersive and player-facing.",
        "Do not reveal hidden spoilers unless they are necessary for the immediate setup.",
        "Return only the opening preview text."
      ].join("\n")
    }
  ];
}

function buildTurnMessages(input: TurnNarrationInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are the game master of a tabletop RPG session.",
        buildLanguageSystemPrompt(input.locale),
        "Respond with immersive narration that advances the scene.",
        "Stay grounded in the supplied state summary and end with a clear next beat or question."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Story title: ${input.storyTitle}`,
        `Round: ${input.round}`,
        `Player action: ${input.playerInput}`,
        "",
        "Recent conversation context:",
        input.conversationContext || "No recent conversation context.",
        "",
        "Task:",
        "Write the next GM narration for the player. Keep it concise, specific, and actionable."
      ].join("\n")
    }
  ];
}

function normalizeContent(rawContent: unknown): string {
  if (typeof rawContent === "string") {
    return rawContent.trim();
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (
          item &&
          typeof item === "object" &&
          "text" in item &&
          typeof (item as { text?: unknown }).text === "string"
        ) {
          return (item as { text: string }).text;
        }

        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

async function callChatCompletion(
  config: ServerProxyConfig,
  messages: ChatMessage[]
): Promise<ChatCompletionResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: config.temperature
    };

    if (config.maxTokens !== null) {
      payload.max_tokens = config.maxTokens;
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(
        data.error?.message ??
          `server_proxy request failed with HTTP ${response.status}.`
      );
    }

    const text = normalizeContent(data.choices?.[0]?.message?.content);
    if (!text) {
      throw new Error("server_proxy returned an empty completion.");
    }

    return {
      text,
      durationMs: Date.now() - startedAt,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? null,
        completionTokens: data.usage?.completion_tokens ?? null,
        totalTokens: data.usage?.total_tokens ?? null
      }
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function generateOpeningViaServerProxy(
  input: OpeningGenerationInput
): Promise<OpeningGenerationOutput> {
  const config = getServerProxyConfig({
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig
  });
  const completion = await callChatCompletion(config, await buildOpeningMessages(input));
  return {
    text: completion.text,
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy",
    meta: {
      provider: `${config.providerLabel}:${config.model}`,
      mode: "server_proxy",
      model: config.model,
      durationMs: completion.durationMs,
      estimatedCostUsd: null,
      usage: completion.usage
    }
  };
}

export async function generateTurnNarrationViaServerProxy(
  input: TurnNarrationInput
): Promise<TurnNarrationOutput> {
  const config = getServerProxyConfig({
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig
  });
  const completion = await callChatCompletion(config, buildTurnMessages(input));
  return {
    text: completion.text,
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy",
    meta: {
      provider: `${config.providerLabel}:${config.model}`,
      mode: "server_proxy",
      model: config.model,
      durationMs: completion.durationMs,
      estimatedCostUsd: null,
      usage: completion.usage
    },
    adjudication: null
  };
}
