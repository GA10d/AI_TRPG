import type { ModelAccessMode } from "../../../../packages/shared-types/src/index.ts";
import {
  buildMockOpeningText,
  buildMockTurnResponse
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
        input.storyIntro,
        String(input.locale)
      ),
      provider: "mock-local",
      mode: "mock"
    };
  }

  async generateTurnNarration(input: TurnNarrationInput): Promise<TurnNarrationOutput> {
    return {
      text: buildMockTurnResponse(
        input.playerInput,
        String(input.locale),
        input.round,
        input.conversationContext
      ),
      provider: "mock-local",
      mode: "mock"
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
