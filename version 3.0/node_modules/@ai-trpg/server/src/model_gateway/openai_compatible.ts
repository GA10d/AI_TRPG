import { buildLanguageSystemPrompt } from "../../../../packages/shared-config/src/index.ts";
import type {
  OpeningGenerationInput,
  OpeningGenerationOutput,
  TurnNarrationInput,
  TurnNarrationOutput
} from "./types.ts";
import { getServerProxyConfig, type ServerProxyConfig } from "./config.ts";

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
  error?: {
    message?: string;
  };
};

function buildOpeningMessages(input: OpeningGenerationInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are the game master of a tabletop RPG session.",
        buildLanguageSystemPrompt(input.locale),
        "Write a concise but atmospheric opening scene for the player.",
        "Do not mention hidden system rules or break immersion."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Story title: ${input.storyTitle}`,
        "Story introduction:",
        input.storyIntro,
        "",
        "Task:",
        "Write the opening narration that establishes the mood, the immediate situation, and a clear first hook for the player."
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
): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);

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

    return text;
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
  return {
    text: await callChatCompletion(config, buildOpeningMessages(input)),
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy"
  };
}

export async function generateTurnNarrationViaServerProxy(
  input: TurnNarrationInput
): Promise<TurnNarrationOutput> {
  const config = getServerProxyConfig({
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig
  });
  return {
    text: await callChatCompletion(config, buildTurnMessages(input)),
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy"
  };
}
