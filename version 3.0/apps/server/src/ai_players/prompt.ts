import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fromLocaleCode } from "../../../../packages/shared-config/src/index.ts";
import type {
  AiPersonalityTag,
  LocaleCode
} from "../../../../packages/shared-types/src/index.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const promptDir = join(projectRoot, "apps", "prompt", "ai_player");

const cachedPromptFragments = new Map<string, string>();

async function loadPromptFragment(fileName: string): Promise<string> {
  const cached = cachedPromptFragments.get(fileName);
  if (cached) {
    return cached;
  }

  const text = (await readFile(join(promptDir, fileName), "utf8")).trim();
  cachedPromptFragments.set(fileName, text);
  return text;
}

function formatPersonalityTags(personalityTags: AiPersonalityTag[]): string {
  if (!personalityTags.length) {
    return "- No explicit personality tags were selected for this AI player.";
  }

  return personalityTags
    .map((tag) => `- ${tag.keyword}: ${tag.description}`)
    .join("\n");
}

export async function buildAiPlayerSystemPrompt(input: {
  locale: LocaleCode;
  personalityTags: AiPersonalityTag[];
}): Promise<string> {
  const [personalityPrompt, rulePrompt, languagePrompt] = await Promise.all([
    loadPromptFragment("personality.txt"),
    loadPromptFragment("rule.txt"),
    loadPromptFragment("language.txt")
  ]);
  const language = fromLocaleCode(input.locale);

  return [
    personalityPrompt,
    formatPersonalityTags(input.personalityTags),
    "",
    rulePrompt,
    "",
    languagePrompt,
    `${language.nativeName} (${language.code})`
  ]
    .join("\n")
    .trim();
}
