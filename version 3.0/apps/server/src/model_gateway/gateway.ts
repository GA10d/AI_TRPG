import type { ModelAccessMode } from "../../../../packages/shared-types/src/index.ts";
import {
  buildMockOpeningText,
  buildMockTurnOutcome
} from "../mock/index.ts";
import {
  generateOpeningViaServerProxy,
  streamOpeningViaServerProxy,
  generateTurnNarrationViaServerProxy
} from "./openai_compatible.ts";
import type {
  ModelGateway,
  OpeningGenerationInput,
  OpeningGenerationStreamOptions,
  OpeningGenerationOutput,
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
