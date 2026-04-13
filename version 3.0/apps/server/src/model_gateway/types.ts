import type {
  AiGenerationMetadata,
  EndingAdjudication,
  EndingJudgeDecision,
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

export type OpeningGenerationStreamOptions = {
  onTextDelta?: (delta: string) => void | Promise<void>;
  signal?: AbortSignal;
};

export type InitialSessionNarrationInput = {
  accessMode: ModelAccessMode;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  locale: LocaleCode;
  ruleTitle: string;
  ruleText: string;
  storyTitle: string;
  storyText: string;
  playerInfo: string;
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
};

export type EndingJudgeInput = {
  accessMode: ModelAccessMode;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  locale: LocaleCode;
  round: number;
  narrationText: string;
};

export type EndingJudgeOutput = {
  adjudication: EndingAdjudication;
  judgeDecision: EndingJudgeDecision;
  provider: string;
  mode: ModelAccessMode;
  meta: AiGenerationMetadata;
  rawText: string;
};

export type PromptedTextGenerationInput = {
  accessMode: ModelAccessMode;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  locale: LocaleCode;
  systemPrompt: string;
  userPrompt: string;
};

export type PromptedTextGenerationOutput = {
  text: string;
  provider: string;
  mode: ModelAccessMode;
  meta: AiGenerationMetadata;
};

export interface ModelGateway {
  generateOpening(input: OpeningGenerationInput): Promise<OpeningGenerationOutput>;
  streamOpening(
    input: OpeningGenerationInput,
    options?: OpeningGenerationStreamOptions
  ): Promise<OpeningGenerationOutput>;
  generateInitialSessionNarration(
    input: InitialSessionNarrationInput
  ): Promise<TurnNarrationOutput>;
  generateTurnNarration(input: TurnNarrationInput): Promise<TurnNarrationOutput>;
  judgeEnding(input: EndingJudgeInput): Promise<EndingJudgeOutput>;
  generatePromptedText(
    input: PromptedTextGenerationInput
  ): Promise<PromptedTextGenerationOutput>;
}
