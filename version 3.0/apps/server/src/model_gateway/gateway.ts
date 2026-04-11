import type { ModelAccessMode } from "../../../../packages/shared-types/src/index.ts";
import {
  buildMockOpeningText,
  buildMockTurnOutcome
} from "../mock/index.ts";
import {
  generateOpeningViaServerProxy,
  generateTurnNarrationViaServerProxy
} from "./openai_compatible.ts";
import type {
  ModelGateway,
  OpeningGenerationInput,
  OpeningGenerationOutput,
  TurnNarrationInput,
  TurnNarrationOutput
} from "./types.ts";

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
