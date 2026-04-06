import type { LocaleCode, ModelAccessMode } from "../../../../packages/shared-types/src/index.ts";

export type OpeningGenerationInput = {
  accessMode: ModelAccessMode;
  locale: LocaleCode;
  storyTitle: string;
  storyIntro: string;
  sceneId: string;
};

export type OpeningGenerationOutput = {
  text: string;
  provider: string;
  mode: ModelAccessMode;
};

export type TurnNarrationInput = {
  accessMode: ModelAccessMode;
  locale: LocaleCode;
  playerInput: string;
  sceneId: string;
  round: number;
  sceneChanged: boolean;
  stateSummary: string;
};

export type TurnNarrationOutput = {
  text: string;
  provider: string;
  mode: ModelAccessMode;
};

export interface ModelGateway {
  generateOpening(input: OpeningGenerationInput): Promise<OpeningGenerationOutput>;
  generateTurnNarration(input: TurnNarrationInput): Promise<TurnNarrationOutput>;
}
