import type { ModelAccessMode } from "../../../../packages/shared-types/src/index.ts";
import {
  buildMockOpeningText,
  buildMockTurnOutcome
} from "../mock/index.ts";
import {
  generateOpeningViaServerProxy,
  generatePromptedTextViaServerProxy,
  streamOpeningViaServerProxy,
  generateTurnNarrationViaServerProxy
} from "./openai_compatible.ts";
import type {
  ModelGateway,
  OpeningGenerationInput,
  OpeningGenerationStreamOptions,
  OpeningGenerationOutput,
  PromptedTextGenerationInput,
  PromptedTextGenerationOutput,
  TurnNarrationInput,
  TurnNarrationOutput
} from "./types.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitMockPreviewTextIntoChunks(text: string): string[] {
  const tokens = text.match(/\S+\s*|\n+/gu) ?? [text];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const token of tokens) {
    if (
      currentChunk.length > 0 &&
      currentChunk.length + token.length > 36 &&
      !token.includes("\n")
    ) {
      chunks.push(currentChunk);
      currentChunk = token;
      continue;
    }

    currentChunk += token;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

class MockModelGateway implements ModelGateway {
  async generateOpening(input: OpeningGenerationInput): Promise<OpeningGenerationOutput> {
    return {
      text: buildMockOpeningText(
        input.storyTitle,
        input.storyText,
        String(input.locale)
      ),
      provider: "mock-local",
      mode: "mock",
      meta: {
        provider: "mock-local",
        mode: "mock",
        model: "mock-local",
        durationMs: 0,
        estimatedCost: {
          amount: 0,
          currency: "USD",
          pricingModel: "mock-local",
          note: "Mock mode does not consume billable tokens."
        },
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          promptCacheHitTokens: null,
          promptCacheMissTokens: null
        }
      }
    };
  }

  async streamOpening(
    input: OpeningGenerationInput,
    options?: OpeningGenerationStreamOptions
  ): Promise<OpeningGenerationOutput> {
    const output = await this.generateOpening(input);
    const chunks = splitMockPreviewTextIntoChunks(output.text);

    for (const chunk of chunks) {
      if (options?.signal?.aborted) {
        throw new Error("Opening preview stream aborted.");
      }

      await options?.onTextDelta?.(chunk);
      await delay(24);
    }

    return output;
  }

  async generateTurnNarration(input: TurnNarrationInput): Promise<TurnNarrationOutput> {
    const outcome = buildMockTurnOutcome(
      input.playerInput,
      String(input.locale),
      input.round,
      input.conversationContext
    );
    return {
      text: outcome.text,
      provider: "mock-local",
      mode: "mock",
      meta: {
        provider: "mock-local",
        mode: "mock",
        model: "mock-local",
        durationMs: 0,
        estimatedCost: {
          amount: 0,
          currency: "USD",
          pricingModel: "mock-local",
          note: "Mock mode does not consume billable tokens."
        },
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          promptCacheHitTokens: null,
          promptCacheMissTokens: null
        }
      },
      adjudication: outcome.adjudication
    };
  }

  async generatePromptedText(
    input: PromptedTextGenerationInput
  ): Promise<PromptedTextGenerationOutput> {
    const currentTextMatch = input.userPrompt.match(/Current character draft:\n([\s\S]*?)\n(?:\n|$)/u);
    const currentText = currentTextMatch?.[1]?.trim() ?? "";
    const generatedText =
      currentText.length > 0
        ? `${currentText}\n我把录音笔和手电塞进外套口袋，告诉自己这趟回来不是为了逞强，而是为了把一直卡在心口的那件事查清楚。`
        : "我是个做民俗采访的自由撰稿人，背着旧相机和录音笔进山，表面上说是来补最后一篇稿，实际上是想确认多年前那场怪事到底有没有把我家人一起卷进去。";

    return {
      text: generatedText,
      provider: "mock-local",
      mode: "mock",
      meta: {
        provider: "mock-local",
        mode: "mock",
        model: "mock-local",
        durationMs: 0,
        estimatedCost: {
          amount: 0,
          currency: "USD",
          pricingModel: "mock-local",
          note: "Mock mode does not consume billable tokens."
        },
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          promptCacheHitTokens: null,
          promptCacheMissTokens: null
        }
      }
    };
  }
}

class ServerProxyModelGateway implements ModelGateway {
  async generateOpening(input: OpeningGenerationInput): Promise<OpeningGenerationOutput> {
    return generateOpeningViaServerProxy(input);
  }

  async streamOpening(
    input: OpeningGenerationInput,
    options?: OpeningGenerationStreamOptions
  ): Promise<OpeningGenerationOutput> {
    return streamOpeningViaServerProxy(input, options);
  }

  async generateTurnNarration(input: TurnNarrationInput): Promise<TurnNarrationOutput> {
    return generateTurnNarrationViaServerProxy(input);
  }

  async generatePromptedText(
    input: PromptedTextGenerationInput
  ): Promise<PromptedTextGenerationOutput> {
    return generatePromptedTextViaServerProxy(input);
  }
}

const mockGateway = new MockModelGateway();
const serverProxyGateway = new ServerProxyModelGateway();

export function getModelGateway(accessMode: ModelAccessMode): ModelGateway {
  if (accessMode === "mock") {
    return mockGateway;
  }

  if (accessMode === "server_proxy") {
    return serverProxyGateway;
  }

  throw new Error(`Unsupported model access mode: ${accessMode}`);
}
