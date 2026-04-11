import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLanguageSystemPrompt } from "../../../../packages/shared-config/src/index.ts";
import type {
  EndingAdjudication,
  LocaleCode
} from "../../../../packages/shared-types/src/index.ts";

type PromptKind = "narrator" | "ending_judge";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const promptDir = join(projectRoot, "apps", "prompt", "single_agent");

const promptFileMap: Record<PromptKind, string> = {
  narrator: "narrator_prompt.txt",
  ending_judge: "ending_judge_prompt.txt"
};

const promptCache = new Map<PromptKind, string>();

async function loadPrompt(kind: PromptKind): Promise<string> {
  const cachedPrompt = promptCache.get(kind);
  if (cachedPrompt) {
    return cachedPrompt;
  }

  const prompt = (
    await readFile(join(promptDir, promptFileMap[kind]), "utf8")
  ).trim();
  promptCache.set(kind, prompt);
  return prompt;
}

export async function loadNarratorPrompt(): Promise<string> {
  return loadPrompt("narrator");
}

export async function loadEndingJudgePrompt(): Promise<string> {
  return loadPrompt("ending_judge");
}

export async function buildNarratorSystemPrompt(locale: LocaleCode): Promise<string> {
  const basePrompt = await loadNarratorPrompt();
  return [
    basePrompt,
    "",
    buildLanguageSystemPrompt(locale),
    "Return only player-facing narration unless the supplied prompt explicitly asks for something else."
  ].join("\n");
}

export async function buildEndingJudgeSystemPrompt(locale: LocaleCode): Promise<string> {
  const basePrompt = await loadEndingJudgePrompt();
  return [
    basePrompt,
    "",
    buildLanguageSystemPrompt(locale)
  ].join("\n");
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
    "Decide whether this reply means the session has entered an ending."
  ].join("\n");
}

function extractJsonPayload(rawText: string): string {
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

  throw new Error("Ending judge did not return a JSON object.");
}

function normalizeEndingType(rawValue: unknown): "preset" | "hidden" | "emergent" {
  return rawValue === "preset" || rawValue === "hidden" ? rawValue : "emergent";
}

export function parseEndingJudgeResult(rawText: string): EndingAdjudication {
  const payload = JSON.parse(extractJsonPayload(rawText)) as {
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

  const isGameOver = payload.isGameOver === true;
  if (!isGameOver) {
    return {
      isGameOver: false,
      endingState: null,
      adjudicationSource: "single_agent"
    };
  }

  const endingState = payload.endingState;
  if (!endingState) {
    return {
      isGameOver: false,
      endingState: null,
      adjudicationSource: "single_agent"
    };
  }

  const endingId =
    typeof endingState.endingId === "string" && endingState.endingId.trim().length > 0
      ? endingState.endingId.trim()
      : "single_agent_ending";
  const title =
    typeof endingState.title === "string" && endingState.title.trim().length > 0
      ? endingState.title.trim()
      : "Ending Reached";
  const summary =
    typeof endingState.summary === "string" && endingState.summary.trim().length > 0
      ? endingState.summary.trim()
      : "The current narration indicates that the session has reached an ending.";
  const confirmedAtRound =
    typeof endingState.confirmedAtRound === "number" && Number.isFinite(endingState.confirmedAtRound)
      ? endingState.confirmedAtRound
      : 0;

  return {
    isGameOver: true,
    adjudicationSource:
      payload.adjudicationSource === "single_agent" ? "single_agent" : "single_agent",
    endingState: {
      endingId,
      endingType: normalizeEndingType(endingState.endingType),
      title,
      summary,
      confirmedAtRound
    }
  };
}
