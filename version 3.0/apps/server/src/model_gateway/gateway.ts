import type { ModelAccessMode } from "../../../../packages/shared-types/src/index.ts";
import {
  buildMockOpeningText,
  buildMockTurnResponse
} from "../mock/index.ts";
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
        input.sceneId,
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
        input.sceneId,
        String(input.locale),
        input.round,
        input.sceneChanged
      ) + "\n\n" + input.stateSummary,
      provider: "mock-local",
      mode: "mock"
    };
  }
}

class ServerProxyPlaceholderGateway implements ModelGateway {
  async generateOpening(input: OpeningGenerationInput): Promise<OpeningGenerationOutput> {
    throw new Error(
      `server_proxy mode is not implemented yet for opening generation (${input.storyTitle}).`
    );
  }

  async generateTurnNarration(input: TurnNarrationInput): Promise<TurnNarrationOutput> {
    throw new Error(
      `server_proxy mode is not implemented yet for turn narration (round ${input.round}, scene ${input.sceneId}).`
    );
  }
}

const mockGateway = new MockModelGateway();
const serverProxyGateway = new ServerProxyPlaceholderGateway();

export function getModelGateway(accessMode: ModelAccessMode): ModelGateway {
  if (accessMode === "mock") {
    return mockGateway;
  }

  if (accessMode === "server_proxy") {
    return serverProxyGateway;
  }

  throw new Error(`Unsupported model access mode: ${accessMode}`);
}
