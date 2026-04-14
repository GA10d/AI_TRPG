import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLanguageSystemPrompt,
  fromLocaleCode
} from "../../../../packages/shared-config/src/index.ts";
import type {
  CharacterConceptAssistMode,
  CharacterConceptAssistResponse,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import { resolveAiPersonalityTagsByIds } from "../ai_players/personality.ts";
import { getModelGateway } from "../model_gateway/index.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const textCompletionPromptDir = join(projectRoot, "apps", "prompt", "text_completion");

const promptFileMap: Record<CharacterConceptAssistMode, string> = {
  generate: "generation_prompt.txt",
  complete: "completion_prompt.txt"
};

const cachedPromptMap = new Map<CharacterConceptAssistMode, string>();

export type GenerateCharacterConceptInput = {
  mode: CharacterConceptAssistMode;
  locale: string;
  modelAccessMode: "mock" | "server_proxy" | "browser_direct";
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  openingText: string;
  currentText?: string;
  primaryPlayerDisplayName?: string;
  primaryPlayerPersonalityTagIds?: string[];
};

async function loadPrompt(mode: CharacterConceptAssistMode): Promise<string> {
  const cachedPrompt = cachedPromptMap.get(mode);
  if (cachedPrompt) {
    return cachedPrompt;
  }

  const prompt = (
    await readFile(join(textCompletionPromptDir, promptFileMap[mode]), "utf8")
  ).trim();
  cachedPromptMap.set(mode, prompt);
  return prompt;
}

function buildSystemPrompt(
  basePrompt: string,
  locale: GenerateCharacterConceptInput["locale"]
): string {
  const language = fromLocaleCode(locale);
  return [
    basePrompt,
    buildLanguageSystemPrompt(locale),
    `请严格使用 ${language.nativeName}（${language.code}）输出。`,
    "只返回适合直接填入角色输入框的正文，不要解释，不要加标题，不要使用 markdown。"
  ].join("\n");
}

function buildUserPrompt(input: GenerateCharacterConceptInput): string {
  const sharedSections = [
    `Target language: ${input.locale}`,
    "",
    "Opening preview:",
    input.openingText.trim(),
    ""
  ];

  if (input.mode === "generate") {
    return [
      ...sharedSections,
      "Task:",
      "Create a first-person TRPG player character concept based on the opening preview.",
      "Keep it grounded, vivid, and editable by the player.",
      "Aim for a compact but expressive paragraph.",
      "Do not add explanations outside the character concept."
    ].join("\n");
  }

  return [
    ...sharedSections,
    "Current character draft:",
    input.currentText?.trim() || "",
    "",
    "Task:",
    "Complete and refine the player's existing first-person character concept.",
    "Preserve the existing core identity and motivations.",
    "Make the result feel coherent, immersive, and directly editable by the player.",
    "Do not add explanations outside the character concept."
  ].join("\n");
}

async function buildPrimaryPlayerReferenceBlock(
  input: GenerateCharacterConceptInput
): Promise<string | null> {
  const displayName = input.primaryPlayerDisplayName?.trim() ?? "";
  const personalityTags = await resolveAiPersonalityTagsByIds(
    input.primaryPlayerPersonalityTagIds ?? []
  );
  if (!displayName && personalityTags.length === 0) {
    return null;
  }

  const lines = ["AI protagonist setup reference:"];
  if (displayName) {
    lines.push(`- Name: ${displayName}`);
  }

  if (personalityTags.length > 0) {
    lines.push(
      `- Personality cues: ${personalityTags
        .map((tag) => `${tag.keyword} (${tag.description})`)
        .join("; ")}`
    );
  }

  lines.push(
    "- Treat these cues as guidance while drafting the protagonist's identity, voice, and motivation.",
    "- Keep the result in first person, natural, and directly editable."
  );
  return lines.join("\n");
}

export async function generateCharacterConcept(
  input: GenerateCharacterConceptInput
): Promise<CharacterConceptAssistResponse> {
  const openingText = input.openingText.trim();
  if (!openingText) {
    throw new Error("AI 角色生成需要先拿到开场白内容。");
  }

  if (input.mode === "complete" && !(input.currentText?.trim().length ?? 0)) {
    throw new Error("AI 补全需要先输入一部分角色内容。");
  }

  const modelGateway = getModelGateway(input.modelAccessMode);
  const basePrompt = await loadPrompt(input.mode);
  const primaryPlayerReferenceBlock = await buildPrimaryPlayerReferenceBlock(input);
  const userPrompt = buildUserPrompt(input);
  const result = await modelGateway.generatePromptedText({
    accessMode: input.modelAccessMode,
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig,
    locale: input.locale,
    systemPrompt: buildSystemPrompt(basePrompt, input.locale),
    userPrompt: primaryPlayerReferenceBlock
      ? `${primaryPlayerReferenceBlock}\n\n${userPrompt}`
      : userPrompt
  });

  return {
    text: result.text,
    provider: result.provider,
    mode: result.mode,
    meta: result.meta
  };
}
