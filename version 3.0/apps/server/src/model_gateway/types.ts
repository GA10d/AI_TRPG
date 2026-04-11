import type {
  AiGenerationMetadata,
  EndingAdjudication,
  LocaleCode,
  ModelAccessMode,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";

export type OpeningGenerationInput = {
  accessMode: ModelAccessMode;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  locale: LocaleCode;
  ruleTitle: string;
  ruleText: string;
  storyTitle: string;
  storyText: string;
};

export type OpeningGenerationOutput = {
  text: string;
  provider: string;
  mode: ModelAccessMode;
  meta: AiGenerationMetadata;
};

export type TurnNarrationInput = {
  accessMode: ModelAccessMode;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  locale: LocaleCode;
  storyTitle: string;
  playerInput: string;
  round: number;
  conversationContext: string;
};

export type TurnNarrationOutput = {
  text: string;
  provider: string;
  mode: ModelAccessMode;
  meta: AiGenerationMetadata;
  adjudication?: EndingAdjudication | null;
};

export interface ModelGateway {
  generateOpening(input: OpeningGenerationInput): Promise<OpeningGenerationOutput>;
  generateTurnNarration(input: TurnNarrationInput): Promise<TurnNarrationOutput>;
}
