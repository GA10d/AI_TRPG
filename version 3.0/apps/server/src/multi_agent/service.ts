import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLanguageSystemPrompt } from "../../../../packages/shared-config/src/index.ts";
import type {
  Difficulty,
  LoadedContentBundle,
  LocaleCode
} from "../../../../packages/shared-types/src/index.ts";

export type MultiAgentPromptKind =
  | "beginning"
  | "dicer"
  | "director"
  | "narrator"
  | "npc_manager";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const multiAgentPromptDir = join(projectRoot, "apps", "prompt", "multi-agents");

const promptFileMap: Record<MultiAgentPromptKind, string> = {
  beginning: "data_Beginning.txt",
  dicer: "data_Dicer.txt",
  director: "data_Director.txt",
  narrator: "data_Narrator.txt",
  npc_manager: "data_NpcManager.txt"
};

const promptCache = new Map<string, string>();

function buildLabeledSection(label: string, content: string): string {
  return [
    `## ${label}`,
    content.trim() || "None."
  ].join("\n");
}

function buildBundleSection(bundle: LoadedContentBundle): string {
  return [
    buildLabeledSection(
      "Rule Information",
      [`Rule title: ${bundle.rule.manifest.title[bundle.rule.manifest.defaultLocale] ?? bundle.rule.manifest.id}`, "", bundle.rule.rule.content].join("\n")
    ),
    buildLabeledSection(
      "Story Information",
      [`Story title: ${bundle.story.manifest.title[bundle.story.manifest.defaultLocale] ?? bundle.story.manifest.id}`, "", bundle.story.story.content].join("\n")
    )
  ].join("\n\n");
}

function normalizeDifficulty(difficulty: Difficulty | undefined): Difficulty {
  return difficulty === "hard" ? "hard" : "easy";
}

async function loadPrompt(
  kind: MultiAgentPromptKind,
  difficulty: Difficulty = "easy"
): Promise<string> {
  const normalizedDifficulty = normalizeDifficulty(difficulty);
  const cacheKey = `${kind}:${normalizedDifficulty}`;
  const cachedPrompt = promptCache.get(cacheKey);
  if (cachedPrompt) {
    return cachedPrompt;
  }

  const prompt = (
    await readFile(
      join(multiAgentPromptDir, normalizedDifficulty, promptFileMap[kind]),
      "utf8"
    )
  ).trim();
  promptCache.set(cacheKey, prompt);
  return prompt;
}

export async function buildMultiAgentSystemPrompt(
  kind: MultiAgentPromptKind,
  locale: LocaleCode,
  difficulty: Difficulty = "easy"
): Promise<string> {
  const basePrompt = await loadPrompt(kind, difficulty);
  return [
    basePrompt,
    "",
    buildLanguageSystemPrompt(locale)
  ].join("\n");
}

export function buildDicerUserPrompt(input: {
  bundle: LoadedContentBundle;
  locale: LocaleCode;
  round: number;
  previousRoundContext: string;
  latestRoundContext: string;
  currentSubmittedInputs: string;
}): string {
  return [
    `Target language: ${input.locale}`,
    "Multi-agent task: Dicer",
    `Target narration round: ${input.round}`,
    "",
    "Source labeling contract:",
    "- Public history lines are labeled with speaker identity and round number.",
    "- Submitted inputs are the current party actions for the next narrator reply.",
    "- Keep your response internal-facing. Do not write player-facing narration.",
    "",
    buildBundleSection(input.bundle),
    "",
    buildLabeledSection("Previous Completed Public Round", input.previousRoundContext),
    "",
    buildLabeledSection("Latest Completed Public Round", input.latestRoundContext),
    "",
    buildLabeledSection("Current Submitted Party Inputs", input.currentSubmittedInputs),
    "",
    "Task:",
    "Evaluate the current submitted party actions under the provided rule and story materials.",
    "Preserve world consistency, identify invalid overreach if present, and describe the likely outcome and consequences.",
    "Return only the Dicer output for internal orchestration."
  ].join("\n");
}

export function buildNpcManagerUserPrompt(input: {
  bundle: LoadedContentBundle;
  locale: LocaleCode;
  round: number;
  sharedPublicContext: string;
  currentSubmittedInputs: string;
  ownHistory: string;
}): string {
  return [
    `Target language: ${input.locale}`,
    "Multi-agent task: NPC Manager",
    `Target narration round: ${input.round}`,
    "",
    "Source labeling contract:",
    "- Public history lines are labeled by speaker and round.",
    "- NPC Manager history is labeled by round and always belongs to this agent.",
    "- Submitted inputs are current party actions awaiting narration.",
    "- Return only the NPC Manager result for internal orchestration.",
    "",
    buildBundleSection(input.bundle),
    "",
    buildLabeledSection("Shared Public Context", input.sharedPublicContext),
    "",
    buildLabeledSection("Current Submitted Party Inputs", input.currentSubmittedInputs),
    "",
    buildLabeledSection("Aligned NPC Manager History", input.ownHistory),
    "",
    "Task:",
    "Update visible and background NPC behavior for the upcoming narrator reply.",
    "Keep every decision consistent with the supplied public history, current submitted inputs, and prior NPC Manager outputs."
  ].join("\n");
}

export function buildDirectorUserPrompt(input: {
  bundle: LoadedContentBundle;
  locale: LocaleCode;
  round: number;
  sharedPublicContext: string;
  ownHistory: string;
}): string {
  return [
    `Target language: ${input.locale}`,
    "Multi-agent task: Director",
    `Director memo round: ${input.round}`,
    "",
    "Source labeling contract:",
    "- Public history lines are labeled by speaker and round.",
    "- Director history is labeled by round and always belongs to this agent.",
    "- Your output is internal guidance for later narrator use, not player-facing narration.",
    "",
    buildBundleSection(input.bundle),
    "",
    buildLabeledSection("Shared Public Context", input.sharedPublicContext),
    "",
    buildLabeledSection("Aligned Director History", input.ownHistory),
    "",
    "Task:",
    "Update the world-state and pacing guidance for the just-finished public round.",
    "Call out any pacing stalls, timed events, ending drift, or light conflict injection opportunities only when justified by the supplied materials.",
    "Return only the new Director memo for this round."
  ].join("\n");
}

export function buildNarratorUserPrompt(input: {
  bundle: LoadedContentBundle;
  locale: LocaleCode;
  round: number;
  sharedPublicContext: string;
  latestCompletedRound: string;
  currentSubmittedInputs: string;
  dicerOutput: string;
  npcManagerOutput: string;
  directorOutput: string;
}): string {
  return [
    `Target language: ${input.locale}`,
    "Multi-agent task: Narrator",
    `Target narration round: ${input.round}`,
    "",
    "Source labeling contract:",
    "- Public history lines are labeled by speaker and round.",
    "- Dicer, NPC Manager, and Director sections are internal agent outputs.",
    "- Current submitted inputs are party actions that should drive the next narrator reply.",
    "- Return only the player-facing narrator reply.",
    "",
    buildBundleSection(input.bundle),
    "",
    buildLabeledSection("Shared Public Context", input.sharedPublicContext),
    "",
    buildLabeledSection("Latest Completed Public Round", input.latestCompletedRound),
    "",
    buildLabeledSection("Current Submitted Party Inputs", input.currentSubmittedInputs),
    "",
    buildLabeledSection("Current Director Output", input.directorOutput),
    "",
    buildLabeledSection("Current Dicer Output", input.dicerOutput),
    "",
    buildLabeledSection("Current NPC Manager Output", input.npcManagerOutput),
    "",
    "Task:",
    "Write the next player-facing narration.",
    "Treat the Dicer output as binding, preserve NPC behavior from NPC Manager, and translate Director guidance into natural story flow without exposing system language."
  ].join("\n");
}
