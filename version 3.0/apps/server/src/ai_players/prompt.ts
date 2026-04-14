import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fromLocaleCode } from "../../../../packages/shared-config/src/index.ts";
import type {
  AiAppearanceTag,
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

function formatAppearanceTagLines(appearanceTags: AiAppearanceTag[]): string[] {
  return appearanceTags
    .map((tag) => `- ${tag.keyword}: ${tag.description}`)
    .filter((line) => line.trim().length > 0);
}

function formatAppearanceTags(appearanceTags: AiAppearanceTag[]): string {
  if (!appearanceTags.length) {
    return "- No explicit appearance tags were selected for this AI player.";
  }

  const visibleAppearanceTags = formatAppearanceTagLines(
    appearanceTags.filter((tag) => tag.category === "appearance")
  );
  const outfitTags = formatAppearanceTagLines(
    appearanceTags.filter((tag) => tag.category === "outfit")
  );
  const otherTags = formatAppearanceTagLines(
    appearanceTags.filter(
      (tag) => tag.category !== "appearance" && tag.category !== "outfit"
    )
  );
  const sections: string[] = [];

  if (visibleAppearanceTags.length) {
    sections.push(["Appearance:", ...visibleAppearanceTags].join("\n"));
  }

  if (outfitTags.length) {
    sections.push(["Outfit:", ...outfitTags].join("\n"));
  }

  if (otherTags.length) {
    sections.push(["Other visual cues:", ...otherTags].join("\n"));
  }

  return sections.join("\n\n").trim();
}

export async function buildAiPlayerSystemPrompt(input: {
  locale: LocaleCode;
  personalityTags: AiPersonalityTag[];
  appearanceTags: AiAppearanceTag[];
}): Promise<string> {
  const [personalityPrompt, appearancePrompt, rulePrompt, languagePrompt] = await Promise.all([
    loadPromptFragment("personality.txt"),
    loadPromptFragment("appearance.txt"),
    loadPromptFragment("rule.txt"),
    loadPromptFragment("language.txt")
  ]);
  const language = fromLocaleCode(input.locale);

  return [
    personalityPrompt,
    formatPersonalityTags(input.personalityTags),
    "",
    appearancePrompt,
    formatAppearanceTags(input.appearanceTags),
    "",
    rulePrompt,
    "",
    languagePrompt,
    `${language.nativeName} (${language.code})`
  ]
    .join("\n")
    .trim();
}
