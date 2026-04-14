import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLanguageSystemPrompt,
  fromLocaleCode
} from "../../../../packages/shared-config/src/index.ts";
import type {
  EndingAdjudication,
  EndingJudgeDecision,
  EndingType,
  LocaleCode
} from "../../../../packages/shared-types/src/index.ts";

type PromptKind = "narrator";
export type StructuredPromptKind =
  | "ending_judge"
  | "session_memory_fact_extractor"
  | "session_memory_episode_compressor";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const singleAgentPromptDir = join(projectRoot, "apps", "prompt", "single_agent");
const endingJudgePromptDir = join(projectRoot, "apps", "prompt", "ending_judge");
const sessionMemoryPromptDir = join(projectRoot, "apps", "prompt", "session_memory");

const promptFileMap: Record<PromptKind, string> = {
  narrator: "narrator_prompt.txt"
};

const promptCache = new Map<PromptKind, string>();
const structuredPromptSpecMap: Record<
  StructuredPromptKind,
  {
    dir: string;
    promptFile: string;
    schemaFile: string;
  }
> = {
  ending_judge: {
    dir: endingJudgePromptDir,
    promptFile: "system_prompt.txt",
    schemaFile: "output_schema.json"
  },
  session_memory_fact_extractor: {
    dir: sessionMemoryPromptDir,
    promptFile: "fact_extractor_system_prompt.txt",
    schemaFile: "fact_extractor_output_schema.json"
  },
  session_memory_episode_compressor: {
    dir: sessionMemoryPromptDir,
    promptFile: "episode_compressor_system_prompt.txt",
    schemaFile: "episode_compressor_output_schema.json"
  }
};

const structuredPromptCache = new Map<StructuredPromptKind, string>();
const structuredSchemaCache = new Map<StructuredPromptKind, Record<string, unknown>>();

async function loadPrompt(kind: PromptKind): Promise<string> {
  const cachedPrompt = promptCache.get(kind);
  if (cachedPrompt) {
    return cachedPrompt;
  }

  const prompt = (await readFile(join(singleAgentPromptDir, promptFileMap[kind]), "utf8")).trim();
  promptCache.set(kind, prompt);
  return prompt;
}

export async function loadNarratorPrompt(): Promise<string> {
  return loadPrompt("narrator");
}

export async function loadStructuredTaskPrompt(kind: StructuredPromptKind): Promise<string> {
  const cachedPrompt = structuredPromptCache.get(kind);
  if (cachedPrompt) {
    return cachedPrompt;
  }

  const spec = structuredPromptSpecMap[kind];
  const prompt = (await readFile(join(spec.dir, spec.promptFile), "utf8")).trim();
  structuredPromptCache.set(kind, prompt);
  return prompt;
}

export async function loadStructuredTaskOutputSchema(
  kind: StructuredPromptKind
): Promise<Record<string, unknown>> {
  const cachedSchema = structuredSchemaCache.get(kind);
  if (cachedSchema) {
    return cachedSchema;
  }

  const spec = structuredPromptSpecMap[kind];
  const schema = JSON.parse(
    await readFile(join(spec.dir, spec.schemaFile), "utf8")
  ) as Record<string, unknown>;
  structuredSchemaCache.set(kind, schema);
  return schema;
}

export async function loadEndingJudgePrompt(): Promise<string> {
  return loadStructuredTaskPrompt("ending_judge");
}

export async function loadEndingJudgeOutputSchema(): Promise<Record<string, unknown>> {
  return loadStructuredTaskOutputSchema("ending_judge");
}

function buildAdditionalLanguageInstruction(
  locale: LocaleCode,
  options?: {
    profileId?: string;
  }
): string | null {
  if (options?.profileId !== "doubao") {
    return null;
  }

  const language = fromLocaleCode(locale);
  return `Use ${language.nativeName} (${language.code}) for all user-facing text.`;
}

export async function buildNarratorSystemPrompt(
  locale: LocaleCode,
  options?: {
    profileId?: string;
  }
): Promise<string> {
  const basePrompt = await loadNarratorPrompt();
  return [
    basePrompt,
    "",
    buildLanguageSystemPrompt(locale),
    buildAdditionalLanguageInstruction(locale, options),
    "Return only player-facing narration unless the supplied prompt explicitly asks for something else."
  ].filter(Boolean).join("\n");
}

export async function buildStructuredAssistantSystemPrompt(
  kind: StructuredPromptKind,
  locale: LocaleCode,
  options?: {
    profileId?: string;
  }
): Promise<string> {
  const basePrompt = await loadStructuredTaskPrompt(kind);
  return [
    basePrompt,
    "",
    buildLanguageSystemPrompt(locale),
    buildAdditionalLanguageInstruction(locale, options)
  ].filter(Boolean).join("\n");
}

export async function buildEndingJudgeSystemPrompt(
  locale: LocaleCode,
  options?: {
    profileId?: string;
  }
): Promise<string> {
  return buildStructuredAssistantSystemPrompt("ending_judge", locale, options);
}

function normalizePlayerInfo(playerInfo: string): string {
  const trimmed = playerInfo.trim();
  return trimmed.length > 0 ? trimmed : "No player background was provided.";
}

export function buildSessionOpeningTaskText(input: {
  locale: LocaleCode;
  ruleTitle: string;
  storyTitle: string;
  playerInfo: string;
}): string {
  return [
    `Target language: ${input.locale}`,
    `Rule title: ${input.ruleTitle}`,
    `Story title: ${input.storyTitle}`,
    "",
    "Three files are attached in this request:",
    "- rule.txt contains the complete rule text.",
    "- story.txt contains the complete story text.",
    "- player_info.txt contains the player's setup text written during beginning / character creation.",
    "",
    "Task:",
    "Use the attached materials to begin the playable session.",
    "Write the first narrator reply that the player sees after pressing start.",
    "Start from the player's role and situation described in player_info.txt.",
    "Make the scene immediately playable, concrete, and immersive.",
    "End with a clear next beat, pressure point, or actionable opening.",
    "",
    "Player info preview:",
    normalizePlayerInfo(input.playerInfo),
    "",
    "Return only the narrator reply."
  ].join("\n");
}

export function buildTurnTaskText(input: {
  locale: LocaleCode;
  storyTitle: string;
  round: number;
  playerInput: string;
  conversationContext: string;
}): string {
  return [
    `Target language: ${input.locale}`,
    `Story title: ${input.storyTitle}`,
    `Round: ${input.round}`,
    "",
    "Latest player action:",
    input.playerInput.trim() || "No player action provided.",
    "",
    "Recent visible context:",
    input.conversationContext.trim() || "No recent conversation context.",
    "",
    "Task:",
    "Continue the story as the narrator.",
    "Keep the reply player-facing, specific, and actionable.",
    "Advance the situation instead of summarizing the past.",
    "Return only the narrator reply."
  ].join("\n");
}

export function buildEndingJudgeUserPrompt(input: {
  locale: LocaleCode;
  round: number;
  narrationText: string;
}): string {
  return [
    `Target language: ${input.locale}`,
    `Round: ${input.round}`,
    "",
    "Narrator reply to inspect:",
    input.narrationText.trim(),
    "",
    "Decide whether this reply means the game is already over.",
    "Entering a finale, epilogue, cleanup, or wrap-up is not enough by itself.",
    "Only mark GameOver as true if this exact narrator reply clearly indicates that active play has already ended."
  ].join("\n");
}

export function extractJsonPayload(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("Structured assistant did not return a JSON object.");
}

export function parseStructuredJsonObject(rawText: string): Record<string, unknown> {
  return JSON.parse(extractJsonPayload(rawText)) as Record<string, unknown>;
}

function normalizeTrimmedString(rawValue: unknown): string {
  return typeof rawValue === "string" ? rawValue.trim() : "";
}

function normalizeEndingType(rawValue: unknown): "preset" | "hidden" | "emergent" {
  return rawValue === "preset" || rawValue === "hidden" ? rawValue : "emergent";
}

function normalizeDecisionEndingType(rawValue: unknown): "" | EndingType {
  return rawValue === "preset" || rawValue === "hidden" || rawValue === "emergent" ? rawValue : "";
}

function buildDefaultEndingJudgeDecision(): EndingJudgeDecision {
  return {
    GameOver: false,
    Reason: "The latest narrator reply does not clearly confirm that the game has already ended.",
    EndingId: "",
    EndingType: "",
    EndingTitle: "",
    EndingSummary: ""
  };
}

export function parseEndingJudgeDecision(rawText: string): EndingJudgeDecision {
  const payload = parseStructuredJsonObject(rawText) as {
    GameOver?: unknown;
    Reason?: unknown;
    EndingId?: unknown;
    EndingType?: unknown;
    EndingTitle?: unknown;
    EndingSummary?: unknown;
    isGameOver?: unknown;
    adjudicationSource?: unknown;
    endingState?: {
      endingId?: unknown;
      endingType?: unknown;
      title?: unknown;
      summary?: unknown;
      confirmedAtRound?: unknown;
    } | null;
  };

  if ("GameOver" in payload) {
    const gameOver = payload.GameOver === true;
    const reason = normalizeTrimmedString(payload.Reason);
    const decision: EndingJudgeDecision = {
      GameOver: gameOver,
      Reason:
        reason ||
        (gameOver
          ? "The latest narrator reply clearly indicates that the game is already over."
          : buildDefaultEndingJudgeDecision().Reason),
      EndingId: gameOver ? normalizeTrimmedString(payload.EndingId) || "single_agent_ending" : "",
      EndingType: gameOver
        ? normalizeDecisionEndingType(payload.EndingType) || "emergent"
        : "",
      EndingTitle:
        gameOver ? normalizeTrimmedString(payload.EndingTitle) || "Ending Reached" : "",
      EndingSummary:
        gameOver
          ? normalizeTrimmedString(payload.EndingSummary) ||
            normalizeTrimmedString(payload.Reason) ||
            "The narrator reply indicates that the session has ended."
          : ""
    };

    return decision;
  }

  const isGameOver = payload.isGameOver === true;
  const endingState = payload.endingState;
  if (!isGameOver || !endingState) {
    return buildDefaultEndingJudgeDecision();
  }

  const endingId =
    normalizeTrimmedString(endingState.endingId) || "single_agent_ending";
  const title =
    normalizeTrimmedString(endingState.title) || "Ending Reached";
  const summary =
    normalizeTrimmedString(endingState.summary) ||
    "The current narration indicates that the session has reached an ending.";

  return {
    GameOver: true,
    Reason: summary,
    EndingId: endingId,
    EndingType: normalizeDecisionEndingType(endingState.endingType) || "emergent",
    EndingTitle: title,
    EndingSummary: summary
  };
}

export function buildEndingAdjudicationFromDecision(
  decision: EndingJudgeDecision,
  round: number
): EndingAdjudication {
  if (!decision.GameOver) {
    return {
      isGameOver: false,
      endingState: null,
      adjudicationSource: "single_agent"
    };
  }

  return {
    isGameOver: true,
    adjudicationSource: "single_agent",
    endingState: {
      endingId: decision.EndingId.trim() || "single_agent_ending",
      endingType: normalizeEndingType(decision.EndingType),
      title: decision.EndingTitle.trim() || "Ending Reached",
      summary:
        decision.EndingSummary.trim() ||
        decision.Reason.trim() ||
        "The current narration indicates that the session has ended.",
      confirmedAtRound: round
    }
  };
}

export function parseEndingJudgeResult(rawText: string, round: number = 0): EndingAdjudication {
  return buildEndingAdjudicationFromDecision(parseEndingJudgeDecision(rawText), round);
}
