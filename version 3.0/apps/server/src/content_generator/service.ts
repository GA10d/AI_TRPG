import { createHash, randomUUID } from "node:crypto";
import { access, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_LOCALE,
  buildLanguageSystemPrompt,
  normalizeLocaleCode
} from "../../../../packages/shared-config/src/index.ts";
import type {
  AiGenerationMetadata,
  ContentGeneratorGeneratedFile,
  ContentGeneratorMode,
  ContentGeneratorPackageSummary,
  ContentGeneratorProgressStep,
  ContentGeneratorProgressStepId,
  ContentGeneratorRequest,
  ContentGeneratorResponse,
  ContentGeneratorRunMeta,
  ContentGeneratorStreamEvent,
  LocaleCode,
  RuleManifest,
  StoryManifest
} from "../../../../packages/shared-types/src/index.ts";
import { loadContentCatalog, loadPlayableContentBundle } from "../content/index.ts";
import { generateImage } from "../image_generation/service.ts";
import { getModelGateway } from "../model_gateway/index.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(currentDir, "../../../../..");
const ruleTemplatePath = join(workspaceRoot, "规则范式.md");
const storyTemplatePath = join(workspaceRoot, "剧本范式.md");

type RuleSpec = {
  idCandidate: string;
  title: string;
  themes: string[];
  tones: string[];
  supportsModes: string[];
  gmStyles: string[];
  contentWarnings: string[];
  worldview: string;
  judgementSystem: string;
  riskAndConsequences: string;
  characterCreation: string;
  actionAndSceneRules: string;
  optionalModules: string[];
  gmConstraints: string;
};

type StoryScene = {
  id: string;
  name: string;
  type: string;
  function: string;
  description: string;
  entryConditions: string;
  exitConditions: string;
  obtainableInfo: string;
  risks: string;
  hooks: string;
};

type StoryEntity = {
  id: string;
  name: string;
  type: string;
  surfaceImpression: string;
  appearance: string;
  ageRange: string;
  genderPresentation: string;
  props: string;
  motivation: string;
  relationshipToPlayer: string;
  knowledgeScope: string;
  obstacles: string;
  triggerLogic: string;
};

type StoryInformationUnit = {
  id: string;
  name: string;
  type: string;
  source: string;
  acquisition: string;
  credibility: string;
  purpose: string;
  relatedObjects: string[];
  isCore: boolean;
  needsCrossValidation: boolean;
};

type StoryTrigger = {
  id: string;
  name: string;
  condition: string;
  effect: string;
  scope: string;
  reversible: boolean;
};

type StoryBranchPoint = {
  id: string;
  name: string;
  trigger: string;
  choices: string[];
  consequences: string;
};

type StoryEnding = {
  id: string;
  name: string;
  type: string;
  conditions: string;
  blockedBy: string;
  theme: string;
};

type StorySpec = {
  idCandidate: string;
  title: string;
  tags: string[];
  tones: string[];
  playerCountMin: number;
  playerCountMax: number;
  recommendedLength: string;
  recommendedPacing: string;
  gmStyle: string;
  coverQuote: string;
  intro: string;
  playerRole: string;
  coreGoals: string;
  mainProgressAxis: string;
  scenes: StoryScene[];
  entities: StoryEntity[];
  informationUnits: StoryInformationUnit[];
  triggers: StoryTrigger[];
  risks: string;
  branchPoints: StoryBranchPoint[];
  endingStructure: StoryEnding[];
  agentConstraints: string;
  timeStructure: string;
  specialModules: string;
};

type AssetPlanEntry = {
  fileName: string;
  purpose: string;
  visualFocus: string;
  spoilerLevel: "low" | "medium" | "high";
};

type AssetPlan = {
  cover: AssetPlanEntry;
  otherAssets: AssetPlanEntry[];
};

type ExistingRuleContext = {
  directoryName: string;
  manifest: RuleManifest;
  introText: string;
  ruleText: string;
};

type GeneratedRulePackage = {
  directoryName: string;
  manifest: RuleManifest;
  introText: string;
  ruleMarkdown: string;
};

type GeneratedStoryPackage = {
  directoryName: string;
  manifest: StoryManifest;
  introText: string;
  storyMarkdown: string;
  beginningMarkdown: string;
  npcPrompts: Array<{
    fileName: string;
    prompt: string;
  }>;
  assetPlan: AssetPlan | null;
};

type GenerationContext = {
  locale: LocaleCode;
  modelAccessMode: ContentGeneratorRequest["modelAccessMode"];
  modelProfileId?: string;
  runtimeModelConfig?: ContentGeneratorRequest["runtimeModelConfig"];
  imageProfileId?: string;
  runtimeImageModelConfig?: ContentGeneratorRequest["runtimeImageModelConfig"];
  warnings: string[];
  generationRuns: ContentGeneratorRunMeta[];
};

function prefersChineseCopy(locale: LocaleCode): boolean {
  return locale.toLowerCase().startsWith("zh");
}

function pickProgressCopy(
  locale: LocaleCode,
  chineseText: string,
  englishText: string
): string {
  return prefersChineseCopy(locale) ? chineseText : englishText;
}

function getContentGeneratorStepLabel(
  stepId: ContentGeneratorProgressStepId,
  locale: LocaleCode
): string {
  switch (stepId) {
    case "load_existing_rule":
      return pickProgressCopy(locale, "读取关联规则", "Load linked rule");
    case "extract_rule":
      return pickProgressCopy(locale, "拆解规则结构", "Extract rule structure");
    case "generate_rule":
      return pickProgressCopy(locale, "生成规则文件", "Generate rule files");
    case "extract_story":
      return pickProgressCopy(locale, "拆解故事结构", "Extract story structure");
    case "generate_story":
      return pickProgressCopy(locale, "生成剧本主文件", "Generate story files");
    case "generate_supporting":
      return pickProgressCopy(locale, "生成开场与 NPC", "Generate opening and NPC files");
    case "plan_assets":
      return pickProgressCopy(locale, "规划美术资产", "Plan art assets");
    case "write_package":
      return pickProgressCopy(locale, "写入临时目录", "Write package into tmp");
    case "generate_assets":
      return pickProgressCopy(locale, "生成封面与配图", "Generate cover and support images");
    case "validate_package":
      return pickProgressCopy(locale, "检查临时内容包", "Validate staged package");
    case "commit_package":
      return pickProgressCopy(locale, "移动到 content", "Move package into content");
    case "cleanup_tmp":
      return pickProgressCopy(locale, "清理 tmp", "Clean tmp files");
    default:
      return stepId;
  }
}

function buildContentGeneratorProgressPlan(
  request: ContentGeneratorRequest,
  locale: LocaleCode
): ContentGeneratorProgressStep[] {
  const stepIds: ContentGeneratorProgressStepId[] = [];

  if (request.mode === "story_only") {
    stepIds.push("load_existing_rule");
  }

  if (request.mode === "rule_only" || request.mode === "rule_and_story") {
    stepIds.push("extract_rule", "generate_rule");
  }

  if (request.mode === "story_only" || request.mode === "rule_and_story") {
    stepIds.push("extract_story", "generate_story", "generate_supporting");

    if (request.generateImages !== false) {
      stepIds.push("plan_assets");
    }
  }

  stepIds.push("write_package");

  if (
    (request.mode === "story_only" || request.mode === "rule_and_story") &&
    request.generateImages !== false
  ) {
    stepIds.push("generate_assets");
  }

  stepIds.push("validate_package", "commit_package", "cleanup_tmp");

  return stepIds.map((id) => ({
    id,
    label: getContentGeneratorStepLabel(id, locale)
  }));
}

function buildStageProgress(index: number, totalSteps: number): number {
  if (totalSteps <= 0) {
    return 0;
  }

  return Math.max(4, Math.min(96, Math.round(((index + 0.5) / totalSteps) * 100)));
}

const templateCache = new Map<"rule" | "story", string>();

function clipPreview(content: string | null | undefined, limit = 280): string {
  const normalized = (content ?? "").replace(/\r\n/g, "\n").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function ensureString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function ensureStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return Array.from(
    new Set(
      value
        .map((item) => ensureString(item))
        .filter((item) => item.length > 0)
    )
  );
}

function ensureBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function ensureNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pickFirstHeading(rawText: string): string | null {
  const headingMatch = rawText.match(/^\s{0,3}#{1,6}\s+(.+)$/mu);
  if (headingMatch?.[1]) {
    return headingMatch[1].trim();
  }

  const emphasizedMatch = rawText.match(/^\s*\*{0,2}([^*\n]{2,80})\*{0,2}\s*$/mu);
  if (emphasizedMatch?.[1]) {
    return emphasizedMatch[1].trim();
  }

  const firstMeaningfulLine = rawText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstMeaningfulLine && firstMeaningfulLine.length <= 80 ? firstMeaningfulLine : null;
}

function sanitizeAsciiIdentifier(value: string, prefix: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toUpperCase();

  if (normalized.length > 0) {
    return normalized.slice(0, 64);
  }

  const hash = createHash("sha1").update(value).digest("hex").slice(0, 8).toUpperCase();
  return `${prefix}_${hash}`;
}

function sanitizeDirectoryName(value: string, fallbackPrefix: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");

  if (ascii.length > 0) {
    return ascii.slice(0, 64);
  }

  const hash = createHash("sha1").update(value).digest("hex").slice(0, 8);
  return `${fallbackPrefix}_${hash}`;
}

function sanitizeFileStem(value: string, fallbackPrefix: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "_")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[. ]+$/gu, "");

  if (sanitized.length > 0) {
    return sanitized.slice(0, 64);
  }

  const hash = createHash("sha1").update(value).digest("hex").slice(0, 8);
  return `${fallbackPrefix}_${hash}`;
}

function inferThemes(rawText: string): string[] {
  const source = rawText.toLowerCase();
  const mappings: Array<[string, string]> = [
    ["恐怖", "horror"],
    ["horror", "horror"],
    ["悬疑", "mystery"],
    ["mystery", "mystery"],
    ["调查", "investigation"],
    ["investigation", "investigation"],
    ["恋爱", "romance"],
    ["romance", "romance"],
    ["校园", "campus"],
    ["campus", "campus"],
    ["奇幻", "fantasy"],
    ["fantasy", "fantasy"],
    ["科幻", "science_fiction"],
    ["science fiction", "science_fiction"],
    ["生存", "survival"],
    ["survival", "survival"],
    ["冒险", "adventure"],
    ["adventure", "adventure"],
    ["推理", "deduction"],
    ["历史", "historical"],
    ["江户", "historical"],
    ["幕府", "historical"]
  ];

  const themes = mappings
    .filter(([keyword]) => source.includes(keyword))
    .map(([, theme]) => theme);

  return Array.from(new Set(themes)).slice(0, 6);
}

function inferTones(rawText: string): string[] {
  const source = rawText.toLowerCase();
  const mappings: Array<[string, string]> = [
    ["压抑", "oppressive"],
    ["oppressive", "oppressive"],
    ["高风险", "high-risk"],
    ["high-risk", "high-risk"],
    ["浪漫", "romantic"],
    ["romantic", "romantic"],
    ["慢热", "slow-burn"],
    ["slow-burn", "slow-burn"],
    ["黑暗", "dark"],
    ["dark", "dark"],
    ["写实", "grounded"],
    ["grounded", "grounded"],
    ["悬疑", "tense"],
    ["紧张", "tense"],
    ["温柔", "tender"],
    ["tender", "tender"],
    ["潮湿", "damp"],
    ["沉浸", "immersive"]
  ];

  const tones = mappings
    .filter(([keyword]) => source.includes(keyword))
    .map(([, tone]) => tone);

  return Array.from(new Set(tones)).slice(0, 6);
}

function inferContentWarnings(rawText: string): string[] {
  const source = rawText.toLowerCase();
  const mappings: Array<[string, string]> = [
    ["血", "violence"],
    ["violence", "violence"],
    ["死亡", "death"],
    ["death", "death"],
    ["自杀", "suicide"],
    ["suicide", "suicide"],
    ["窒息", "suffocation"],
    ["背叛", "betrayal"],
    ["创伤", "trauma"],
    ["惊吓", "scare"],
    ["恐怖", "horror"],
    ["伦理", "ethical-conflict"],
    ["情感压迫", "emotional-pressure"],
    ["火灾", "fire"]
  ];

  const warnings = mappings
    .filter(([keyword]) => source.includes(keyword))
    .map(([, warning]) => warning);

  return Array.from(new Set(warnings)).slice(0, 8);
}

function extractSection(rawText: string, keywords: string[]): string {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());
  const headingPattern = /^\s{0,3}(#{1,6}\s+|(?:\*{0,2})?\d+[.)、]\s+|[一二三四五六七八九十]+[、.]\s+|(?:\*{0,2})?[A-Za-z][^:\n]{0,40}:)/u;
  let startIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = lines[index]?.trim().toLowerCase() ?? "";
    if (!normalized) {
      continue;
    }

    if (lowerKeywords.some((keyword) => normalized.includes(keyword))) {
      startIndex = index;
      break;
    }
  }

  if (startIndex < 0) {
    return "";
  }

  const collected: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() && headingPattern.test(line) && collected.length > 0) {
      break;
    }
    collected.push(line);
  }

  return collected.join("\n").trim();
}

function extractBulletItems(rawText: string): string[] {
  return rawText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/u, "").trim())
    .filter((line) => line.length > 0);
}

function inferPlayerCount(rawText: string): { min: number; max: number } {
  if (rawText.includes("多人")) {
    return { min: 2, max: 4 };
  }
  if (rawText.includes("双人")) {
    return { min: 2, max: 2 };
  }

  return { min: 1, max: 1 };
}

function extractSentences(rawText: string, limit: number): string[] {
  return rawText
    .replace(/\r\n/g, "\n")
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, limit);
}

function buildHeuristicRuleSpec(sourceText: string, fileName?: string | null): RuleSpec {
  const title = pickFirstHeading(sourceText) ?? basename(fileName ?? "规则", extname(fileName ?? "")) ?? "新规则";
  return {
    idCandidate: sanitizeAsciiIdentifier(title || fileName || "RULE", "RULE"),
    title,
    themes: inferThemes(sourceText).length > 0 ? inferThemes(sourceText) : ["custom"],
    tones: inferTones(sourceText).length > 0 ? inferTones(sourceText) : ["immersive"],
    supportsModes: ["single_player"],
    gmStyles: sourceText.includes("多 Agent") ? ["multi_agent"] : ["single_agent", "multi_agent"],
    contentWarnings: inferContentWarnings(sourceText),
    worldview:
      extractSection(sourceText, ["世界观", "设定", "一句话定位"]).trim() ||
      clipPreview(sourceText, 600),
    judgementSystem:
      extractSection(sourceText, ["判定", "战斗", "斩杀", "核心玩法循环"]).trim() ||
      "行动结果由主持根据风险、代价与场景阻力进行裁定。",
    riskAndConsequences:
      extractSection(sourceText, ["代价", "后果", "牺牲", "风险"]).trim() ||
      "玩家的每次推进都可能换来明确且持续的代价。",
    characterCreation:
      extractSection(sourceText, ["玩家能力", "角色创建", "玩家身份"]).trim() ||
      "玩家可在规则允许的世界观边界内创建角色，并承担相应代价。",
    actionAndSceneRules:
      extractSection(sourceText, ["行动", "场景", "章节结构", "玩法循环"]).trim() ||
      clipPreview(sourceText, 900),
    optionalModules: extractBulletItems(extractSection(sourceText, ["模块", "资源", "成长"])).slice(
      0,
      8
    ),
    gmConstraints:
      extractSection(sourceText, ["禁止", "信息控制", "ai身份", "主持"]).trim() ||
      "主持应维持题材气质，避免越界补写和过早揭露核心秘密。"
  };
}

function buildHeuristicStorySpec(sourceText: string, fileName?: string | null): StorySpec {
  const title =
    pickFirstHeading(sourceText) ?? basename(fileName ?? "剧本", extname(fileName ?? "")) ?? "新剧本";
  const playerCount = inferPlayerCount(sourceText);
  const backgroundSection =
    extractSection(sourceText, ["背景", "公开传闻", "intro", "故事"]).trim() ||
    clipPreview(sourceText, 900);
  const locationsSection = extractSection(sourceText, ["地点", "地图", "场景", "节点"]).trim();
  const entitySection = extractSection(sourceText, ["npc", "关键实体", "核心势力", "人物"]).trim();
  const clueSection = extractSection(sourceText, ["线索", "信息"]).trim();
  const endingsSection = extractSection(sourceText, ["结局"]).trim();

  const sceneSeeds = extractSentences(locationsSection || backgroundSection, 3);
  const scenes =
    sceneSeeds.length > 0
      ? sceneSeeds.map((line, index) => ({
          id: sanitizeAsciiIdentifier(`${title}_${index + 1}`, "SCENE").toLowerCase(),
          name: `节点 ${index + 1}`,
          type: index === 0 ? "开场" : "探索",
          function: index === 0 ? "建立局面与张力" : "推进调查与风险",
          description: line,
          entryConditions: index === 0 ? "默认开场" : "完成前一节点后可进入",
          exitConditions: "获取关键信息或做出推进选择后离开",
          obtainableInfo: clueSection || "可获得与核心事件相关的新线索。",
          risks: "停留、误判或错误互动会提升风险。",
          hooks: "继续深入当前事件链。"
        }))
      : [
          {
            id: "opening_scene",
            name: "开场节点",
            type: "开场",
            function: "建立局面与主问题",
            description: backgroundSection,
            entryConditions: "默认开场",
            exitConditions: "玩家开始主动行动",
            obtainableInfo: clueSection || "可获得第一批线索。",
            risks: "行动越深入，风险越快升级。",
            hooks: "指向更深层的真相或冲突。"
          }
        ];

  const entitySeeds = extractSentences(entitySection, 4);
  const entities = entitySeeds.map((line, index) => ({
    id: sanitizeAsciiIdentifier(`${title}_ENTITY_${index + 1}`, "ENTITY").toLowerCase(),
    name: `关键角色 ${index + 1}`,
    type: "NPC",
    surfaceImpression: line,
    appearance: "human, story-appropriate outfit, expressive face, grounded details",
    ageRange: "young adult",
    genderPresentation: "androgynous",
    props: "one story-related object",
    motivation: "与核心事件相关的隐性动机。",
    relationshipToPlayer: "与玩家存在合作、试探或阻碍关系。",
    knowledgeScope: "掌握部分与核心真相有关的信息。",
    obstacles: "可能隐瞒、误导或阻止玩家推进。",
    triggerLogic: "当玩家逼近真相或触碰禁区时，行为会发生变化。"
  }));

  const infoSeeds = extractSentences(clueSection || sourceText, 4);
  const informationUnits = infoSeeds.map((line, index) => ({
    id: sanitizeAsciiIdentifier(`${title}_INFO_${index + 1}`, "INFO").toLowerCase(),
    name: `信息 ${index + 1}`,
    type: "线索",
    source: "场景探索或人物互动",
    acquisition: "调查、对话或触发事件",
    credibility: index === 0 ? "高" : "中",
    purpose: line,
    relatedObjects: scenes.slice(0, 2).map((scene) => scene.id),
    isCore: index < 2,
    needsCrossValidation: index > 0
  }));

  return {
    idCandidate: sanitizeAsciiIdentifier(title || fileName || "STORY", "STORY"),
    title,
    tags: inferThemes(sourceText).length > 0 ? inferThemes(sourceText) : ["custom"],
    tones: inferTones(sourceText).length > 0 ? inferTones(sourceText) : ["immersive"],
    playerCountMin: playerCount.min,
    playerCountMax: playerCount.max,
    recommendedLength: sourceText.includes("长篇") ? "long" : sourceText.includes("短篇") ? "short" : "medium",
    recommendedPacing: sourceText.includes("快") ? "fast" : sourceText.includes("慢") ? "slow-burn" : "medium",
    gmStyle: sourceText.includes("强引导") ? "strong-guidance" : "atmospheric-guidance",
    coverQuote:
      extractSentences(backgroundSection, 2).join(" ").slice(0, 120) || "进入故事，面对隐藏的真相与代价。",
    intro: backgroundSection,
    playerRole:
      extractSection(sourceText, ["玩家角色", "玩家身份", "角色定位"]).trim() ||
      "玩家是被卷入核心事件的见证者与推动者，需要在有限信息下做出关键判断。",
    coreGoals:
      extractSection(sourceText, ["任务结构", "核心目标", "目标"]).trim() ||
      "玩家需要推进主线、拼合真相，并在风险持续升级前做出关键决定。",
    mainProgressAxis:
      extractSection(sourceText, ["推进", "主推进轴"]).trim() ||
      "调查推进 + 风险升级",
    scenes,
    entities,
    informationUnits,
    triggers: [
      {
        id: "trigger_progress_1",
        name: "推进触发器",
        condition: "玩家获得关键信息或进入新节点。",
        effect: "风险升级，更多实体或真相浮现。",
        scope: "剧情主线",
        reversible: false
      }
    ],
    risks:
      extractSection(sourceText, ["风险", "后果", "失败"]).trim() ||
      "拖延、误判和错误站队都会让局势更糟，并影响可达结局。",
    branchPoints: [
      {
        id: "branch_main_choice",
        name: "核心分支",
        trigger: "玩家接近终局或关键真相时触发。",
        choices: ["继续追索真相", "优先保全当下", "站队某一方"],
        consequences: "不同选择会改变后续阻力、可得信息与结局路线。"
      }
    ],
    endingStructure: [
      {
        id: "ending_primary",
        name: "主要结局",
        type: "emergent",
        conditions:
          endingsSection || "根据玩家掌握的信息、站队与承受的代价收束剧情。",
        blockedBy: "关键线索严重缺失或局势彻底失控。",
        theme: "真相、代价与选择"
      }
    ],
    agentConstraints:
      extractSection(sourceText, ["主持约束", "agent 约束", "约束"]).trim() ||
      "主持应保持悬念，不提前给出终局真相，也不替玩家做关键决定。",
    timeStructure:
      extractSection(sourceText, ["时间", "倒计时"]).trim() || "随着回合推进，局势会逐步升温。",
    specialModules:
      extractSection(sourceText, ["特殊机制", "冲突节点", "片段库"]).trim() ||
      "可以根据题材加入特殊事件、关系推进或冲突模块。"
  };
}

function normalizeRuleSpec(raw: Record<string, unknown>, fallback: RuleSpec): RuleSpec {
  return {
    idCandidate:
      sanitizeAsciiIdentifier(
        ensureString(raw.idCandidate) || ensureString(raw.title) || fallback.title,
        "RULE"
      ),
    title: ensureString(raw.title) || fallback.title,
    themes: ensureStringArray(raw.themes, fallback.themes),
    tones: ensureStringArray(raw.tones, fallback.tones),
    supportsModes: ensureStringArray(raw.supportsModes, fallback.supportsModes),
    gmStyles: ensureStringArray(raw.gmStyles, fallback.gmStyles),
    contentWarnings: ensureStringArray(raw.contentWarnings, fallback.contentWarnings),
    worldview: ensureString(raw.worldview) || fallback.worldview,
    judgementSystem: ensureString(raw.judgementSystem) || fallback.judgementSystem,
    riskAndConsequences:
      ensureString(raw.riskAndConsequences) || fallback.riskAndConsequences,
    characterCreation: ensureString(raw.characterCreation) || fallback.characterCreation,
    actionAndSceneRules:
      ensureString(raw.actionAndSceneRules) || fallback.actionAndSceneRules,
    optionalModules: ensureStringArray(raw.optionalModules, fallback.optionalModules),
    gmConstraints: ensureString(raw.gmConstraints) || fallback.gmConstraints
  };
}

function normalizeStoryScene(raw: unknown, index: number, fallbackTitle: string): StoryScene {
  const data = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const name = ensureString(data.name) || `节点 ${index + 1}`;
  return {
    id:
      ensureString(data.id) ||
      sanitizeAsciiIdentifier(`${fallbackTitle}_${name}_${index + 1}`, "SCENE").toLowerCase(),
    name,
    type: ensureString(data.type) || (index === 0 ? "开场" : "探索"),
    function: ensureString(data.function) || "推动剧情",
    description: ensureString(data.description) || "这个节点承载了当前阶段的重要推进。",
    entryConditions: ensureString(data.entryConditions) || (index === 0 ? "默认开场" : "完成前一节点后进入"),
    exitConditions: ensureString(data.exitConditions) || "获得信息或做出推进选择后离开",
    obtainableInfo: ensureString(data.obtainableInfo) || "可获得新的剧情信息。",
    risks: ensureString(data.risks) || "停留和误判都会提升风险。",
    hooks: ensureString(data.hooks) || "指向下一个节点或新的冲突。"
  };
}

function normalizeStoryEntity(raw: unknown, index: number, fallbackTitle: string): StoryEntity {
  const data = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const name = ensureString(data.name) || `关键角色 ${index + 1}`;
  return {
    id:
      ensureString(data.id) ||
      sanitizeAsciiIdentifier(`${fallbackTitle}_${name}_${index + 1}`, "ENTITY").toLowerCase(),
    name,
    type: ensureString(data.type) || "NPC",
    surfaceImpression: ensureString(data.surfaceImpression) || "给人留下复杂且值得追查的第一印象。",
    appearance:
      ensureString(data.appearance) || "human, story-appropriate outfit, expressive face",
    ageRange: ensureString(data.ageRange) || "young adult",
    genderPresentation: ensureString(data.genderPresentation) || "androgynous",
    props: ensureString(data.props) || "one story-related object",
    motivation: ensureString(data.motivation) || "与核心事件深度相关。",
    relationshipToPlayer:
      ensureString(data.relationshipToPlayer) || "与玩家存在合作、试探或阻碍关系。",
    knowledgeScope: ensureString(data.knowledgeScope) || "掌握部分核心信息。",
    obstacles: ensureString(data.obstacles) || "可能造成误导、拖延或对抗。",
    triggerLogic: ensureString(data.triggerLogic) || "当玩家逼近真相时会改变行为。"
  };
}

function normalizeStoryInformationUnit(
  raw: unknown,
  index: number,
  fallbackTitle: string
): StoryInformationUnit {
  const data = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const name = ensureString(data.name) || `信息 ${index + 1}`;
  return {
    id:
      ensureString(data.id) ||
      sanitizeAsciiIdentifier(`${fallbackTitle}_${name}_${index + 1}`, "INFO").toLowerCase(),
    name,
    type: ensureString(data.type) || "线索",
    source: ensureString(data.source) || "场景或人物互动",
    acquisition: ensureString(data.acquisition) || "调查或触发事件",
    credibility: ensureString(data.credibility) || "中",
    purpose: ensureString(data.purpose) || "用于推进剧情理解。",
    relatedObjects: ensureStringArray(data.relatedObjects, []),
    isCore: ensureBoolean(data.isCore, index === 0),
    needsCrossValidation: ensureBoolean(data.needsCrossValidation, false)
  };
}

function normalizeStoryTrigger(raw: unknown, index: number): StoryTrigger {
  const data = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    id: ensureString(data.id) || `trigger_${index + 1}`,
    name: ensureString(data.name) || `触发器 ${index + 1}`,
    condition: ensureString(data.condition) || "满足推进条件时触发。",
    effect: ensureString(data.effect) || "剧情发生变化。",
    scope: ensureString(data.scope) || "主线",
    reversible: ensureBoolean(data.reversible, false)
  };
}

function normalizeStoryBranchPoint(raw: unknown, index: number): StoryBranchPoint {
  const data = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    id: ensureString(data.id) || `branch_${index + 1}`,
    name: ensureString(data.name) || `分支 ${index + 1}`,
    trigger: ensureString(data.trigger) || "到达关键时刻触发。",
    choices: ensureStringArray(data.choices, ["继续推进", "暂缓推进"]),
    consequences: ensureString(data.consequences) || "会改变后续信息、风险或结局。"
  };
}

function normalizeStoryEnding(raw: unknown, index: number): StoryEnding {
  const data = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    id: ensureString(data.id) || `ending_${index + 1}`,
    name: ensureString(data.name) || `结局 ${index + 1}`,
    type: ensureString(data.type) || "emergent",
    conditions: ensureString(data.conditions) || "根据玩家行动与状态达成。",
    blockedBy: ensureString(data.blockedBy) || "关键条件缺失时不可达。",
    theme: ensureString(data.theme) || "选择与代价"
  };
}

function normalizeStorySpec(raw: Record<string, unknown>, fallback: StorySpec): StorySpec {
  const title = ensureString(raw.title) || fallback.title;
  const scenesRaw = Array.isArray(raw.scenes) ? raw.scenes : fallback.scenes;
  const entitiesRaw = Array.isArray(raw.entities) ? raw.entities : fallback.entities;
  const infoRaw = Array.isArray(raw.informationUnits)
    ? raw.informationUnits
    : fallback.informationUnits;
  const triggersRaw = Array.isArray(raw.triggers) ? raw.triggers : fallback.triggers;
  const branchesRaw = Array.isArray(raw.branchPoints)
    ? raw.branchPoints
    : fallback.branchPoints;
  const endingsRaw = Array.isArray(raw.endingStructure)
    ? raw.endingStructure
    : fallback.endingStructure;

  return {
    idCandidate:
      sanitizeAsciiIdentifier(
        ensureString(raw.idCandidate) || title || fallback.title,
        "STORY"
      ),
    title,
    tags: ensureStringArray(raw.tags, fallback.tags),
    tones: ensureStringArray(raw.tones, fallback.tones),
    playerCountMin: Math.max(1, Math.floor(ensureNumber(raw.playerCountMin, fallback.playerCountMin))),
    playerCountMax: Math.max(
      Math.max(1, Math.floor(ensureNumber(raw.playerCountMax, fallback.playerCountMax))),
      Math.max(1, Math.floor(ensureNumber(raw.playerCountMin, fallback.playerCountMin)))
    ),
    recommendedLength: ensureString(raw.recommendedLength) || fallback.recommendedLength,
    recommendedPacing: ensureString(raw.recommendedPacing) || fallback.recommendedPacing,
    gmStyle: ensureString(raw.gmStyle) || fallback.gmStyle,
    coverQuote: ensureString(raw.coverQuote) || fallback.coverQuote,
    intro: ensureString(raw.intro) || fallback.intro,
    playerRole: ensureString(raw.playerRole) || fallback.playerRole,
    coreGoals: ensureString(raw.coreGoals) || fallback.coreGoals,
    mainProgressAxis: ensureString(raw.mainProgressAxis) || fallback.mainProgressAxis,
    scenes: scenesRaw.map((item, index) => normalizeStoryScene(item, index, title)),
    entities: entitiesRaw.map((item, index) => normalizeStoryEntity(item, index, title)),
    informationUnits: infoRaw.map((item, index) =>
      normalizeStoryInformationUnit(item, index, title)
    ),
    triggers: triggersRaw.map((item, index) => normalizeStoryTrigger(item, index)),
    risks: ensureString(raw.risks) || fallback.risks,
    branchPoints: branchesRaw.map((item, index) => normalizeStoryBranchPoint(item, index)),
    endingStructure: endingsRaw.map((item, index) => normalizeStoryEnding(item, index)),
    agentConstraints: ensureString(raw.agentConstraints) || fallback.agentConstraints,
    timeStructure: ensureString(raw.timeStructure) || fallback.timeStructure,
    specialModules: ensureString(raw.specialModules) || fallback.specialModules
  };
}

async function loadTemplate(kind: "rule" | "story"): Promise<string> {
  const cached = templateCache.get(kind);
  if (cached) {
    return cached;
  }

  const filePath = kind === "rule" ? ruleTemplatePath : storyTemplatePath;
  const content = (await readFile(filePath, "utf8")).trim();
  templateCache.set(kind, content);
  return content;
}

function buildStructuredTaskRun(task: string, provider: string, mode: ContentGeneratorRequest["modelAccessMode"], meta?: AiGenerationMetadata | null): ContentGeneratorRunMeta {
  return {
    task,
    provider,
    mode,
    meta: meta ?? null
  };
}

function buildHeuristicRun(task: string, mode: ContentGeneratorRequest["modelAccessMode"]): ContentGeneratorRunMeta {
  return {
    task,
    provider: "generator:heuristic",
    mode,
    meta: null
  };
}

async function runStructuredTask(
  generationContext: GenerationContext,
  args: {
    task: string;
    schemaName: string;
    outputSchema: Record<string, unknown>;
    systemPrompt: string;
    userPrompt: string;
  }
): Promise<Record<string, unknown> | null> {
  if (generationContext.modelAccessMode !== "server_proxy") {
    generationContext.generationRuns.push(buildHeuristicRun(args.task, generationContext.modelAccessMode));
    return null;
  }

  try {
    const gateway = getModelGateway(generationContext.modelAccessMode);
    const result = await gateway.generateStructuredAssistantOutput({
      accessMode: generationContext.modelAccessMode,
      modelProfileId: generationContext.modelProfileId,
      runtimeModelConfig: generationContext.runtimeModelConfig,
      locale: generationContext.locale,
      systemPrompt: args.systemPrompt,
      userPrompt: args.userPrompt,
      schemaName: args.schemaName,
      outputSchema: args.outputSchema,
      temperature: 0.1
    });
    generationContext.generationRuns.push(
      buildStructuredTaskRun(args.task, result.provider, result.mode, result.meta)
    );
    return result.data;
  } catch (error) {
    generationContext.warnings.push(
      `${args.task} 调用结构化生成失败，已回退到本地启发式逻辑：${
        error instanceof Error ? error.message : String(error)
      }`
    );
    generationContext.generationRuns.push(buildHeuristicRun(args.task, generationContext.modelAccessMode));
    return null;
  }
}

async function runPromptedTextTask(
  generationContext: GenerationContext,
  args: {
    task: string;
    systemPrompt: string;
    userPrompt: string;
    fallbackText: string;
    normalize?: (value: string) => string;
  }
): Promise<string> {
  if (generationContext.modelAccessMode !== "server_proxy") {
    generationContext.generationRuns.push(buildHeuristicRun(args.task, generationContext.modelAccessMode));
    return args.fallbackText;
  }

  try {
    const gateway = getModelGateway(generationContext.modelAccessMode);
    const result = await gateway.generatePromptedText({
      accessMode: generationContext.modelAccessMode,
      modelProfileId: generationContext.modelProfileId,
      runtimeModelConfig: generationContext.runtimeModelConfig,
      locale: generationContext.locale,
      systemPrompt: args.systemPrompt,
      userPrompt: args.userPrompt
    });
    generationContext.generationRuns.push(
      buildStructuredTaskRun(args.task, result.provider, result.mode, result.meta)
    );
    const normalized = args.normalize ? args.normalize(result.text) : result.text.trim();
    return normalized || args.fallbackText;
  } catch (error) {
    generationContext.warnings.push(
      `${args.task} 调用文本生成失败，已回退到本地模板：${
        error instanceof Error ? error.message : String(error)
      }`
    );
    generationContext.generationRuns.push(buildHeuristicRun(args.task, generationContext.modelAccessMode));
    return args.fallbackText;
  }
}

function normalizePlainTextOutput(rawText: string): string {
  return rawText
    .trim()
    .replace(/^```(?:markdown|md|text)?\s*/iu, "")
    .replace(/```$/u, "")
    .replace(/^\s*#+\s+/mu, "")
    .trim();
}

function normalizeMarkdownOutput(rawText: string): string {
  return rawText
    .trim()
    .replace(/^```(?:markdown|md)?\s*/iu, "")
    .replace(/```$/u, "")
    .trim();
}

function buildRuleExtractionSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "idCandidate",
      "title",
      "themes",
      "tones",
      "supportsModes",
      "gmStyles",
      "contentWarnings",
      "worldview",
      "judgementSystem",
      "riskAndConsequences",
      "characterCreation",
      "actionAndSceneRules",
      "optionalModules",
      "gmConstraints"
    ],
    properties: {
      idCandidate: { type: "string" },
      title: { type: "string" },
      themes: { type: "array", items: { type: "string" } },
      tones: { type: "array", items: { type: "string" } },
      supportsModes: { type: "array", items: { type: "string" } },
      gmStyles: { type: "array", items: { type: "string" } },
      contentWarnings: { type: "array", items: { type: "string" } },
      worldview: { type: "string" },
      judgementSystem: { type: "string" },
      riskAndConsequences: { type: "string" },
      characterCreation: { type: "string" },
      actionAndSceneRules: { type: "string" },
      optionalModules: { type: "array", items: { type: "string" } },
      gmConstraints: { type: "string" }
    }
  };
}

function buildStoryExtractionSchema(): Record<string, unknown> {
  const stringField = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "idCandidate",
      "title",
      "tags",
      "tones",
      "playerCountMin",
      "playerCountMax",
      "recommendedLength",
      "recommendedPacing",
      "gmStyle",
      "coverQuote",
      "intro",
      "playerRole",
      "coreGoals",
      "mainProgressAxis",
      "scenes",
      "entities",
      "informationUnits",
      "triggers",
      "risks",
      "branchPoints",
      "endingStructure",
      "agentConstraints",
      "timeStructure",
      "specialModules"
    ],
    properties: {
      idCandidate: stringField,
      title: stringField,
      tags: { type: "array", items: stringField },
      tones: { type: "array", items: stringField },
      playerCountMin: { type: "number" },
      playerCountMax: { type: "number" },
      recommendedLength: stringField,
      recommendedPacing: stringField,
      gmStyle: stringField,
      coverQuote: stringField,
      intro: stringField,
      playerRole: stringField,
      coreGoals: stringField,
      mainProgressAxis: stringField,
      scenes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "name",
            "type",
            "function",
            "description",
            "entryConditions",
            "exitConditions",
            "obtainableInfo",
            "risks",
            "hooks"
          ],
          properties: {
            id: stringField,
            name: stringField,
            type: stringField,
            function: stringField,
            description: stringField,
            entryConditions: stringField,
            exitConditions: stringField,
            obtainableInfo: stringField,
            risks: stringField,
            hooks: stringField
          }
        }
      },
      entities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "name",
            "type",
            "surfaceImpression",
            "appearance",
            "ageRange",
            "genderPresentation",
            "props",
            "motivation",
            "relationshipToPlayer",
            "knowledgeScope",
            "obstacles",
            "triggerLogic"
          ],
          properties: {
            id: stringField,
            name: stringField,
            type: stringField,
            surfaceImpression: stringField,
            appearance: stringField,
            ageRange: stringField,
            genderPresentation: stringField,
            props: stringField,
            motivation: stringField,
            relationshipToPlayer: stringField,
            knowledgeScope: stringField,
            obstacles: stringField,
            triggerLogic: stringField
          }
        }
      },
      informationUnits: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "name",
            "type",
            "source",
            "acquisition",
            "credibility",
            "purpose",
            "relatedObjects",
            "isCore",
            "needsCrossValidation"
          ],
          properties: {
            id: stringField,
            name: stringField,
            type: stringField,
            source: stringField,
            acquisition: stringField,
            credibility: stringField,
            purpose: stringField,
            relatedObjects: { type: "array", items: stringField },
            isCore: { type: "boolean" },
            needsCrossValidation: { type: "boolean" }
          }
        }
      },
      triggers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "name", "condition", "effect", "scope", "reversible"],
          properties: {
            id: stringField,
            name: stringField,
            condition: stringField,
            effect: stringField,
            scope: stringField,
            reversible: { type: "boolean" }
          }
        }
      },
      risks: stringField,
      branchPoints: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "name", "trigger", "choices", "consequences"],
          properties: {
            id: stringField,
            name: stringField,
            trigger: stringField,
            choices: { type: "array", items: stringField },
            consequences: stringField
          }
        }
      },
      endingStructure: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "name", "type", "conditions", "blockedBy", "theme"],
          properties: {
            id: stringField,
            name: stringField,
            type: stringField,
            conditions: stringField,
            blockedBy: stringField,
            theme: stringField
          }
        }
      },
      agentConstraints: stringField,
      timeStructure: stringField,
      specialModules: stringField
    }
  };
}

function buildAssetPlanSchema(): Record<string, unknown> {
  const stringField = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["cover", "otherAssets"],
    properties: {
      cover: {
        type: "object",
        additionalProperties: false,
        required: ["fileName", "purpose", "visualFocus", "spoilerLevel"],
        properties: {
          fileName: stringField,
          purpose: stringField,
          visualFocus: stringField,
          spoilerLevel: {
            type: "string",
            enum: ["low", "medium", "high"]
          }
        }
      },
      otherAssets: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fileName", "purpose", "visualFocus", "spoilerLevel"],
          properties: {
            fileName: stringField,
            purpose: stringField,
            visualFocus: stringField,
            spoilerLevel: {
              type: "string",
              enum: ["low", "medium", "high"]
            }
          }
        }
      }
    }
  };
}

async function extractRuleSpec(
  generationContext: GenerationContext,
  sourceText: string,
  fileName?: string | null
): Promise<RuleSpec> {
  const fallback = buildHeuristicRuleSpec(sourceText, fileName);
  const systemPrompt = [
    "你是 TRPG 规则结构化编辑器。",
    buildLanguageSystemPrompt(generationContext.locale),
    "你的任务是从原始规则文本中抽取 RuleSpec。",
    "不要补写原文中不存在的强规则。",
    "如果信息不足，请返回空字符串或空数组，而不是编造。",
    "输出必须严格符合 JSON schema。"
  ].join("\n");
  const userPrompt = [
    "请抽取一份适合 version 3.0 内容生成器使用的 RuleSpec。",
    "字段说明：",
    "- idCandidate: 规则 ID 候选值，使用 ASCII 大写与下划线风格",
    "- title: 规则显示标题",
    "- themes / tones / supportsModes / gmStyles / contentWarnings: 简洁标签数组",
    "- worldview / judgementSystem / riskAndConsequences / characterCreation / actionAndSceneRules / gmConstraints: 提炼后的结构化摘要",
    "- optionalModules: 可选模块名称列表",
    "",
    "原始规则文本：",
    sourceText.trim()
  ].join("\n");

  const data = await runStructuredTask(generationContext, {
    task: "extract_rule_spec",
    schemaName: "content_generator_rule_spec",
    outputSchema: buildRuleExtractionSchema(),
    systemPrompt,
    userPrompt
  });

  if (!data) {
    return fallback;
  }

  return normalizeRuleSpec(data, fallback);
}

async function extractStorySpec(
  generationContext: GenerationContext,
  sourceText: string,
  fileName: string | null | undefined,
  linkedRule: ExistingRuleContext | GeneratedRulePackage
): Promise<StorySpec> {
  const fallback = buildHeuristicStorySpec(sourceText, fileName);
  const systemPrompt = [
    "你是 TRPG 剧本结构化编辑器。",
    buildLanguageSystemPrompt(generationContext.locale),
    "你的任务是从原始剧本文本中抽取 StorySpec。",
    "重点要保留场景、关键实体、信息单元、分支、结局和主持约束。",
    "不要把不存在的细节编造成硬设定。",
    "输出必须严格符合 JSON schema。"
  ].join("\n");
  const userPrompt = [
    `当前绑定规则：${linkedRule.manifest.title[linkedRule.manifest.defaultLocale] ?? linkedRule.manifest.id}`,
    "",
    "请抽取一份适合 version 3.0 内容生成器使用的 StorySpec。",
    "说明：",
    "- idCandidate 使用 ASCII 大写与下划线",
    "- scenes / entities / informationUnits / triggers / branchPoints / endingStructure 都必须返回数组",
    "- 尽量保留原剧本中的结构关系，但输出要适合程序后续再生成文件",
    "",
    "原始剧本文本：",
    sourceText.trim()
  ].join("\n");

  const data = await runStructuredTask(generationContext, {
    task: "extract_story_spec",
    schemaName: "content_generator_story_spec",
    outputSchema: buildStoryExtractionSchema(),
    systemPrompt,
    userPrompt
  });

  if (!data) {
    return fallback;
  }

  return normalizeStorySpec(data, fallback);
}

function renderRuleMarkdownFromSpec(spec: RuleSpec): string {
  const optionalModulesSection =
    spec.optionalModules.length > 0
      ? `\n## 可选模块\n\n${spec.optionalModules.map((item) => `- ${item}`).join("\n")}\n`
      : "";

  return `# ${spec.title}

## 世界观

${spec.worldview}

## 判定机制

${spec.judgementSystem}

## 风险与后果

${spec.riskAndConsequences}

## 角色创建

${spec.characterCreation}

## 行动与场景规则

${spec.actionAndSceneRules}
${optionalModulesSection}
## 主持约束

${spec.gmConstraints}
`.trim();
}

function renderStoryMarkdownFromSpec(spec: StorySpec): string {
  const scenesSection = spec.scenes
    .map(
      (scene) => `#### ${scene.name} \`(${scene.id})\`

- 节点类型：${scene.type}
- 节点功能：${scene.function}
- 进入条件：${scene.entryConditions}
- 离开条件：${scene.exitConditions}
- 可获得信息：${scene.obtainableInfo}
- 节点风险：${scene.risks}
- 下一步钩子：${scene.hooks}

${scene.description}`
    )
    .join("\n\n");

  const entitiesSection = spec.entities
    .map(
      (entity) => `#### ${entity.name} \`(${entity.id})\`

- 类型：${entity.type}
- 表层印象：${entity.surfaceImpression}
- 外观：${entity.appearance}
- 动机：${entity.motivation}
- 与玩家关系：${entity.relationshipToPlayer}
- 知情范围：${entity.knowledgeScope}
- 阻碍：${entity.obstacles}
- 行为触发逻辑：${entity.triggerLogic}
- 标志性物件：${entity.props}`
    )
    .join("\n\n");

  const infoSection = spec.informationUnits
    .map(
      (item) => `#### ${item.name} \`(${item.id})\`

- 类型：${item.type}
- 来源：${item.source}
- 获取方式：${item.acquisition}
- 可信度：${item.credibility}
- 作用：${item.purpose}
- 关联对象：${item.relatedObjects.join(", ") || "无"}
- 是否核心信息：${item.isCore ? "是" : "否"}
- 是否需要交叉验证：${item.needsCrossValidation ? "是" : "否"}`
    )
    .join("\n\n");

  const triggerSection = spec.triggers
    .map(
      (item) => `- **${item.name}**：触发条件为“${item.condition}”，会带来“${item.effect}”，影响范围是 ${item.scope}，${item.reversible ? "可逆" : "不可逆"}。`
    )
    .join("\n");

  const branchSection = spec.branchPoints
    .map(
      (item) => `#### ${item.name} \`(${item.id})\`

- 触发时机：${item.trigger}
- 可选项：${item.choices.join(" / ")}
- 后果：${item.consequences}`
    )
    .join("\n\n");

  const endingSection = spec.endingStructure
    .map(
      (item) => `#### ${item.name} \`(${item.id})\`

- 结局类型：${item.type}
- 达成条件：${item.conditions}
- 禁止条件：${item.blockedBy}
- 主题落点：${item.theme}`
    )
    .join("\n\n");

  return `# ${spec.title}

## 剧本元信息

- 剧本名：${spec.title}
- 剧本 ID：${spec.idCandidate}
- 题材标签：${spec.tags.join(" / ")}
- 风格标签：${spec.tones.join(" / ")}
- 适用人数：${spec.playerCountMin} - ${spec.playerCountMax}
- 推荐流程长度：${spec.recommendedLength}
- 推荐节奏：${spec.recommendedPacing}
- 推荐主持风格：${spec.gmStyle}

## 故事 Intro

${spec.intro}

## 玩家角色定位

${spec.playerRole}

## 核心目标

${spec.coreGoals}

## 剧本主推进轴

${spec.mainProgressAxis}

## 场景 / 节点结构

${scenesSection}

## 关键实体

${entitiesSection || "暂无明确关键实体。"}

## 关键信息单元

${infoSection || "暂无明确关键信息单元。"}

## 触发器与状态变化

${triggerSection || "暂无额外触发器。"}

## 风险与后果

${spec.risks}

## 分支点

${branchSection || "暂无显式分支点。"}

## 结局结构

${endingSection}

## 主持约束 / Agent 约束

${spec.agentConstraints}

## 时间结构

${spec.timeStructure}

## 特殊机制模块

${spec.specialModules}
`.trim();
}

function renderRuleIntroFromSpec(spec: RuleSpec): string {
  return `${spec.title} 以 ${spec.themes.join(" / ")} 为主要题材，整体气质偏向 ${spec.tones.join(" / ") || "沉浸叙事"}。玩家会在这套规则里扮演被卷入核心冲突的人物，通过场景互动与主持裁定推进事件；成功与失败不会只体现在表面结果上，而会持续转化为具体代价、压力和局势变化。主持需要同时维持题材氛围与规则边界，让每次行动都产生明确、可感知的后果。`
    .replace(/\s+/gu, " ")
    .trim();
}

function renderStoryIntroFromSpec(spec: StorySpec): string {
  return `${spec.intro}\n\n你所扮演的角色定位是：${spec.playerRole}\n\n这部剧本主要围绕“${spec.mainProgressAxis}”展开，玩家需要在推进过程中处理以下核心目标：${spec.coreGoals}\n\n随着故事深入，${spec.risks}`;
}

function buildBeginningFromSpec(
  locale: LocaleCode,
  rulePackage: GeneratedRulePackage | ExistingRuleContext,
  storyPackage: GeneratedStoryPackage
): string {
  return [
    "### 游戏规则简介",
    `本场游戏采用《${rulePackage.manifest.title[rulePackage.manifest.defaultLocale] ?? rulePackage.manifest.id}》规则：${clipPreview(
      rulePackage.introText,
      220
    )}`,
    "",
    "### 背景故事概述",
    clipPreview(storyPackage.introText, 520),
    "",
    "### 游戏目的",
    clipPreview(
      storyPackage.storyMarkdown.match(/## 核心目标([\s\S]*?)## /u)?.[1] ??
        storyPackage.introText,
      420
    ),
    "",
    "### 角色确认",
    "请用几句话说明你的角色是谁、为什么会来到这里，以及你随身最重要的三样物品。如果你准备使用预设身份，也可以直接确认。",
    "",
    `你当前进入的默认场景是：${storyPackage.manifest.startSceneId}。`,
    `目标语言：${locale}。`
  ].join("\n");
}

function buildNpcPromptFallback(entity: StoryEntity, storySpec: StorySpec): string {
  return [
    entity.ageRange || "young adult",
    entity.genderPresentation || "androgynous presentation",
    entity.appearance || "story-appropriate face and outfit",
    entity.surfaceImpression || "subtle but expressive demeanor",
    entity.props || "one story-related prop",
    `${storySpec.tones.join(", ") || "immersive"} atmosphere`,
    "cinematic portrait"
  ]
    .filter((item) => item.trim().length > 0)
    .join(", ");
}

function buildAssetPlanFallback(storySpec: StorySpec): AssetPlan {
  return {
    cover: {
      fileName: "cover",
      purpose: "建立剧本第一眼的题材和情绪识别",
      visualFocus: `${storySpec.title} 的核心地点、氛围和象征物`,
      spoilerLevel: "low"
    },
    otherAssets: [
      {
        fileName: "map",
        purpose: "帮助玩家和主持理解空间关系",
        visualFocus: "场景之间的空间连接和关键区域",
        spoilerLevel: "low"
      },
      {
        fileName: "clue_board",
        purpose: "帮助理解人物与线索关系",
        visualFocus: "角色、证据和事件之间的关联",
        spoilerLevel: "low"
      },
      {
        fileName: "key_object",
        purpose: "突出最关键的象征物或物证",
        visualFocus: "最重要的物件、遗物或媒介",
        spoilerLevel: "low"
      }
    ]
  };
}

async function generateRuleIntro(
  generationContext: GenerationContext,
  spec: RuleSpec
): Promise<string> {
  const fallbackText = renderRuleIntroFromSpec(spec);
  const systemPrompt = [
    "你是 TRPG 规则入口文案编辑。",
    buildLanguageSystemPrompt(generationContext.locale),
    "请生成用于 rule/intro.txt 的简洁中文介绍。",
    "不要写标题、不要写条目、不要提具体剧本名。"
  ].join("\n");
  const userPrompt = [
    "请根据下面的 RuleSpec 生成一段 180 到 320 字的规则简介。",
    "重点说明题材、玩家通常扮演的人、行动与后果如何处理、主持风格是什么。",
    "",
    JSON.stringify(spec, null, 2)
  ].join("\n");

  return runPromptedTextTask(generationContext, {
    task: "generate_rule_intro",
    systemPrompt,
    userPrompt,
    fallbackText,
    normalize: normalizePlainTextOutput
  });
}

async function generateRuleMarkdown(
  generationContext: GenerationContext,
  spec: RuleSpec,
  sourceRuleText: string
): Promise<string> {
  const fallbackText = renderRuleMarkdownFromSpec(spec);
  const ruleTemplate = await loadTemplate("rule");
  const systemPrompt = [
    "你是 TRPG 规则文档作者助手。",
    buildLanguageSystemPrompt(generationContext.locale),
    "请把 RuleSpec 改写成可编辑、可维护的规则主文档。",
    "必须遵循《规则范式》的章节顺序，不要把剧本内容写入规则文档。",
    "输出纯 Markdown。"
  ].join("\n");
  const userPrompt = [
    "请生成 rule/rule.md。",
    "",
    "规则范式：",
    ruleTemplate,
    "",
    "RuleSpec：",
    JSON.stringify(spec, null, 2),
    "",
    "原始规则文本：",
    sourceRuleText.trim()
  ].join("\n");

  return runPromptedTextTask(generationContext, {
    task: "rewrite_rule_md",
    systemPrompt,
    userPrompt,
    fallbackText,
    normalize: normalizeMarkdownOutput
  });
}

async function generateStoryIntro(
  generationContext: GenerationContext,
  spec: StorySpec
): Promise<string> {
  const fallbackText = renderStoryIntroFromSpec(spec);
  const systemPrompt = [
    "你是 TRPG 剧本入口文案编辑。",
    buildLanguageSystemPrompt(generationContext.locale),
    "请生成用于 story/intro.txt 的玩家入口简介。",
    "可以营造氛围，但不要提前泄露终局真相。"
  ].join("\n");
  const userPrompt = [
    "请根据 StorySpec 生成一段 280 到 650 字的中文简介。",
    "必须让玩家知道自己身处什么局面、核心问题是什么、主要张力来自哪里。",
    "",
    JSON.stringify(spec, null, 2)
  ].join("\n");

  return runPromptedTextTask(generationContext, {
    task: "generate_story_intro",
    systemPrompt,
    userPrompt,
    fallbackText,
    normalize: normalizePlainTextOutput
  });
}

async function generateStoryMarkdown(
  generationContext: GenerationContext,
  spec: StorySpec,
  sourceStoryText: string,
  linkedRule: GeneratedRulePackage | ExistingRuleContext
): Promise<string> {
  const fallbackText = renderStoryMarkdownFromSpec(spec);
  const storyTemplate = await loadTemplate("story");
  const linkedRuleSummary = clipPreview(linkedRule.ruleText, 1200);
  const systemPrompt = [
    "你是 TRPG 剧本作者助手。",
    buildLanguageSystemPrompt(generationContext.locale),
    "请把 StorySpec 改写成结构化主持文档。",
    "必须遵循《剧本范式》的章节顺序，不要写成纯文学小说。",
    "输出纯 Markdown。"
  ].join("\n");
  const userPrompt = [
    "请生成 story/story.md。",
    "",
    "剧本范式：",
    storyTemplate,
    "",
    "StorySpec：",
    JSON.stringify(spec, null, 2),
    "",
    "关联规则摘要：",
    linkedRuleSummary,
    "",
    "原始剧本文本：",
    sourceStoryText.trim()
  ].join("\n");

  return runPromptedTextTask(generationContext, {
    task: "rewrite_story_md",
    systemPrompt,
    userPrompt,
    fallbackText,
    normalize: normalizeMarkdownOutput
  });
}

async function generateBeginningMarkdown(
  generationContext: GenerationContext,
  rulePackage: GeneratedRulePackage | ExistingRuleContext,
  storyPackage: GeneratedStoryPackage
): Promise<string> {
  const fallbackText = buildBeginningFromSpec(generationContext.locale, rulePackage, storyPackage);
  const systemPrompt = [
    "你是 TRPG 开场文案设计师。",
    buildLanguageSystemPrompt(generationContext.locale),
    "请生成玩家进入游戏后直接看到的 opening 文本。",
    "必须包含四个固定标题：游戏规则简介、背景故事概述、游戏目的、角色确认。",
    "不要泄露隐藏结局与终局真相。输出纯 Markdown。"
  ].join("\n");
  const userPrompt = [
    "请根据下面的资料生成 beginning 文本。",
    "",
    "规则简介：",
    rulePackage.introText,
    "",
    "规则主文档：",
    clipPreview(rulePackage.ruleText, 1600),
    "",
    "剧本简介：",
    storyPackage.introText,
    "",
    "剧本主文档：",
    clipPreview(storyPackage.storyMarkdown, 2200),
    "",
    "Story manifest：",
    JSON.stringify(storyPackage.manifest, null, 2)
  ].join("\n");

  return runPromptedTextTask(generationContext, {
    task: "generate_beginning",
    systemPrompt,
    userPrompt,
    fallbackText,
    normalize: normalizeMarkdownOutput
  });
}

async function generateNpcPrompt(
  generationContext: GenerationContext,
  entity: StoryEntity,
  storySpec: StorySpec,
  rulePackage: GeneratedRulePackage | ExistingRuleContext
): Promise<string> {
  const fallbackText = buildNpcPromptFallback(entity, storySpec);
  const systemPrompt = [
    "You are a character visual prompt writer.",
    "Return exactly one single-line English prompt for an image model.",
    "Describe only visible appearance and immediate vibe.",
    "Do not reveal plot twists or hidden backstory."
  ].join("\n");
  const userPrompt = [
    "Generate one single-line image prompt for this NPC portrait.",
    `Character name: ${entity.name}`,
    `Character type: ${entity.type}`,
    `Age range: ${entity.ageRange}`,
    `Gender presentation: ${entity.genderPresentation}`,
    `Visible appearance: ${entity.appearance}`,
    `Surface impression: ${entity.surfaceImpression}`,
    `Props: ${entity.props}`,
    `Story tones: ${storySpec.tones.join(", ")}`,
    `Worldview/style context: ${clipPreview(rulePackage.ruleText, 500)}`
  ].join("\n");

  return runPromptedTextTask(generationContext, {
    task: `generate_npc_prompt:${entity.id}`,
    systemPrompt,
    userPrompt,
    fallbackText,
    normalize: (value) => normalizePlainTextOutput(value).replace(/\n+/gu, " ")
  });
}

async function planAssets(
  generationContext: GenerationContext,
  storySpec: StorySpec
): Promise<AssetPlan> {
  const fallbackPlan = buildAssetPlanFallback(storySpec);
  const systemPrompt = [
    "你是叙事美术规划师。",
    buildLanguageSystemPrompt(generationContext.locale),
    "请为剧本生成一个小而实用的美术资产规划。",
    "必须返回 1 张 cover 和最多 3 张 other assets。",
    "优先选择真正帮助理解剧本的图片。"
  ].join("\n");
  const userPrompt = [
    "请输出 assetPlan。",
    "",
    JSON.stringify(
      {
        title: storySpec.title,
        intro: storySpec.intro,
        tags: storySpec.tags,
        tones: storySpec.tones,
        mainProgressAxis: storySpec.mainProgressAxis,
        scenes: storySpec.scenes.slice(0, 6),
        entities: storySpec.entities.slice(0, 6),
        informationUnits: storySpec.informationUnits.slice(0, 8)
      },
      null,
      2
    )
  ].join("\n");

  const data = await runStructuredTask(generationContext, {
    task: "plan_assets",
    schemaName: "content_generator_asset_plan",
    outputSchema: buildAssetPlanSchema(),
    systemPrompt,
    userPrompt
  });

  if (!data) {
    return fallbackPlan;
  }

  const coverRaw = (data.cover ?? {}) as Record<string, unknown>;
  const otherRaw = Array.isArray(data.otherAssets) ? data.otherAssets : fallbackPlan.otherAssets;
  return {
    cover: {
      fileName: sanitizeFileStem(ensureString(coverRaw.fileName) || fallbackPlan.cover.fileName, "cover"),
      purpose: ensureString(coverRaw.purpose) || fallbackPlan.cover.purpose,
      visualFocus: ensureString(coverRaw.visualFocus) || fallbackPlan.cover.visualFocus,
      spoilerLevel:
        ensureString(coverRaw.spoilerLevel) === "medium" || ensureString(coverRaw.spoilerLevel) === "high"
          ? (ensureString(coverRaw.spoilerLevel) as "medium" | "high")
          : "low"
    },
    otherAssets: otherRaw.slice(0, 3).map((item, index) => {
      const record = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
      const fallbackEntry = fallbackPlan.otherAssets[index] ?? fallbackPlan.otherAssets[0];
      const spoilerLevel = ensureString(record.spoilerLevel);
      return {
        fileName: sanitizeFileStem(ensureString(record.fileName) || fallbackEntry.fileName, `asset_${index + 1}`),
        purpose: ensureString(record.purpose) || fallbackEntry.purpose,
        visualFocus: ensureString(record.visualFocus) || fallbackEntry.visualFocus,
        spoilerLevel:
          spoilerLevel === "medium" || spoilerLevel === "high"
            ? (spoilerLevel as "medium" | "high")
            : "low"
      };
    })
  };
}

async function generateCoverPrompt(
  generationContext: GenerationContext,
  rulePackage: GeneratedRulePackage | ExistingRuleContext,
  storySpec: StorySpec,
  assetPlan: AssetPlan
): Promise<string> {
  const fallbackText = [
    storySpec.title,
    storySpec.coverQuote,
    storySpec.tones.join(", "),
    assetPlan.cover.visualFocus,
    "cinematic key art, atmospheric, no text, no watermark"
  ]
    .filter(Boolean)
    .join(", ");

  const systemPrompt = [
    "You are a key art prompt designer for narrative games.",
    "Return one single-line image prompt in English.",
    "Focus on atmosphere, place, symbolic objects, and avoid endgame spoilers."
  ].join("\n");
  const userPrompt = [
    `Story title: ${storySpec.title}`,
    `Cover quote: ${storySpec.coverQuote}`,
    `Story intro: ${clipPreview(storySpec.intro, 700)}`,
    `Story tones: ${storySpec.tones.join(", ")}`,
    `Rule context: ${clipPreview(rulePackage.ruleText, 500)}`,
    `Asset purpose: ${assetPlan.cover.purpose}`,
    `Visual focus: ${assetPlan.cover.visualFocus}`,
    "Output exactly one English prompt line."
  ].join("\n");

  return runPromptedTextTask(generationContext, {
    task: "generate_cover_prompt",
    systemPrompt,
    userPrompt,
    fallbackText,
    normalize: (value) => normalizePlainTextOutput(value).replace(/\n+/gu, " ")
  });
}

async function generateOtherAssetPrompt(
  generationContext: GenerationContext,
  asset: AssetPlanEntry,
  storySpec: StorySpec
): Promise<string> {
  const relevantScenes = storySpec.scenes.slice(0, 4).map((scene) => scene.name).join(", ");
  const relevantEntities = storySpec.entities.slice(0, 4).map((entity) => entity.name).join(", ");
  const fallbackText = [
    asset.fileName,
    asset.visualFocus,
    storySpec.tones.join(", "),
    relevantScenes,
    relevantEntities,
    "TRPG support asset, readable composition, no text, no watermark"
  ]
    .filter(Boolean)
    .join(", ");

  const systemPrompt = [
    "You are an auxiliary narrative asset prompt designer.",
    "Return one single-line image prompt in English.",
    "The prompt must match the asset type and avoid late-game spoilers."
  ].join("\n");
  const userPrompt = [
    `Asset fileName: ${asset.fileName}`,
    `Asset purpose: ${asset.purpose}`,
    `Visual focus: ${asset.visualFocus}`,
    `Story tones: ${storySpec.tones.join(", ")}`,
    `Relevant scenes: ${relevantScenes}`,
    `Relevant entities: ${relevantEntities}`,
    "Output exactly one English prompt line."
  ].join("\n");

  return runPromptedTextTask(generationContext, {
    task: `generate_asset_prompt:${asset.fileName}`,
    systemPrompt,
    userPrompt,
    fallbackText,
    normalize: (value) => normalizePlainTextOutput(value).replace(/\n+/gu, " ")
  });
}

function chooseImageTheme(tones: string[]): string | undefined {
  const joined = tones.join(" ").toLowerCase();
  if (joined.includes("dark") || joined.includes("oppressive") || joined.includes("tense")) {
    return "nightwatch";
  }
  if (joined.includes("romantic") || joined.includes("tender")) {
    return "parchment";
  }
  return undefined;
}

async function decodeImageResult(imageUrl: string): Promise<{ bytes: Buffer; mimeType: string }> {
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/u);
    if (!match?.[1] || !match[2]) {
      throw new Error("Unsupported data URL image payload.");
    }

    return {
      mimeType: match[1],
      bytes: Buffer.from(match[2], "base64")
    };
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Unable to download generated image: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    mimeType: response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream",
    bytes: Buffer.from(arrayBuffer)
  };
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

async function writeImageAsset(
  generationContext: GenerationContext,
  args: {
    ruleDirectoryName: string;
    storyDirectoryName: string;
    relativeDir: string;
    fileStem: string;
    prompt: string;
    sceneId: string;
    tones: string[];
    contentRoot: string;
  }
): Promise<ContentGeneratorGeneratedFile | null> {
  try {
    const generated = await generateImage({
      prompt: args.prompt,
      trigger: "manual",
      sceneId: args.sceneId,
      theme: chooseImageTheme(args.tones),
      allowFallback: true,
      imageProfileId: generationContext.imageProfileId,
      runtimeImageModelConfig: generationContext.runtimeImageModelConfig
    });
    generationContext.generationRuns.push({
      task: `generate_image:${args.relativeDir}/${args.fileStem}`,
      provider: generated.provider,
      mode: generationContext.modelAccessMode,
      meta: null
    });

    const { bytes, mimeType } = await decodeImageResult(generated.imageUrl);
    const extension = extensionFromMimeType(generated.mimeType || mimeType);
    const relativePath = join(args.relativeDir, `${args.fileStem}.${extension}`);
    const absoluteDir = join(args.contentRoot, args.ruleDirectoryName, "story", args.storyDirectoryName, args.relativeDir);
    await mkdir(absoluteDir, { recursive: true });
    const absolutePath = join(absoluteDir, `${args.fileStem}.${extension}`);
    await writeFile(absolutePath, bytes);

    const packageRelativePath = relative(args.contentRoot, absolutePath).replace(/\\/g, "/");
    return {
      path: `content/${packageRelativePath}`,
      kind: "image",
      preview: generated.revisedPrompt,
      assetUrl: `/api/content-assets/${encodeURIComponent(args.ruleDirectoryName)}/story/${encodeURIComponent(args.storyDirectoryName)}/${relativePath.replace(/\\/g, "/")}`
    };
  } catch (error) {
    generationContext.warnings.push(
      `生成图片 ${args.relativeDir}/${args.fileStem} 失败：${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function buildRuleManifest(spec: RuleSpec, locale: LocaleCode): RuleManifest {
  return {
    schemaVersion: "0.1.0",
    id: spec.idCandidate,
    version: "0.1.0",
    defaultLocale: locale,
    availableLocales: [locale],
    title: {
      [locale]: spec.title
    },
    themes: spec.themes.length > 0 ? spec.themes : ["custom"],
    tones: spec.tones.length > 0 ? spec.tones : ["immersive"],
    supportsModes: spec.supportsModes.length > 0 ? spec.supportsModes : ["single_player"],
    gmStyles: spec.gmStyles.length > 0 ? spec.gmStyles : ["single_agent"],
    authoringSpec: "规则范式(1)",
    contentWarnings: spec.contentWarnings
  };
}

function buildStoryManifest(
  spec: StorySpec,
  locale: LocaleCode,
  linkedRuleManifest: RuleManifest
): StoryManifest {
  const startSceneId = spec.scenes[0]?.id || "opening_scene";

  return {
    schemaVersion: "0.1.0",
    id: spec.idCandidate,
    version: "0.1.0",
    ruleId: linkedRuleManifest.id,
    defaultLocale: locale,
    availableLocales: [locale],
    title: {
      [locale]: spec.title
    },
    playerCount: {
      min: Math.max(1, spec.playerCountMin),
      max: Math.max(Math.max(1, spec.playerCountMin), spec.playerCountMax)
    },
    supportsModes:
      spec.playerCountMax > 1 ? ["single_player", "multiplayer"] : ["single_player"],
    coverQuote: spec.coverQuote
      ? {
          [locale]: spec.coverQuote
        }
      : undefined,
    recommendedLength: spec.recommendedLength || "medium",
    recommendedPacing: spec.recommendedPacing || "medium",
    gmStyle: spec.gmStyle || "atmospheric-guidance",
    tags: spec.tags.length > 0 ? spec.tags : ["custom"],
    contentWarnings: inferContentWarnings(
      [spec.intro, spec.coreGoals, spec.risks].join("\n")
    ),
    authoringSpec: "剧本范式(1)",
    startSceneId
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readExistingRuleContext(
  contentRoot: string,
  ruleDirectoryName: string,
  locale: LocaleCode
): Promise<ExistingRuleContext> {
  const ruleDir = join(contentRoot, ruleDirectoryName, "rule");
  const manifest = JSON.parse(
    await readFile(join(ruleDir, "manifest.json"), "utf8")
  ) as RuleManifest;
  const introPath = join(ruleDir, "intro.txt");
  const introText = (await pathExists(introPath)) ? await readFile(introPath, "utf8") : "";
  const ruleMarkdown = await readFile(join(ruleDir, "rule.md"), "utf8");

  return {
    directoryName: ruleDirectoryName,
    manifest: {
      ...manifest,
      defaultLocale: normalizeLocaleCode(manifest.defaultLocale || locale)
    },
    introText,
    ruleText: ruleMarkdown
  };
}

function assertRequestValidity(request: ContentGeneratorRequest): void {
  if (request.modelAccessMode === "browser_direct") {
    throw new Error("内容生成器当前只支持 mock 或 server_proxy，不支持 browser_direct。");
  }

  if (request.mode === "rule_only" && !(request.ruleSource?.content.trim().length ?? 0)) {
    throw new Error("上传规则模式需要提供规则文件内容。");
  }

  if (request.mode === "story_only") {
    if (!(request.storySource?.content.trim().length ?? 0)) {
      throw new Error("上传故事模式需要提供剧本文件内容。");
    }
    if (!(request.associatedRuleDirectoryName?.trim().length ?? 0)) {
      throw new Error("单独上传故事时必须选择关联规则。");
    }
  }

  if (request.mode === "rule_and_story") {
    if (!(request.ruleSource?.content.trim().length ?? 0)) {
      throw new Error("同时上传规则与故事时需要提供规则文件内容。");
    }
    if (!(request.storySource?.content.trim().length ?? 0)) {
      throw new Error("同时上传规则与故事时需要提供剧本文件内容。");
    }
  }
}

function makeGeneratedFile(path: string, kind: ContentGeneratorGeneratedFile["kind"], preview: string | null, assetUrl?: string | null): ContentGeneratorGeneratedFile {
  return {
    path,
    kind,
    preview,
    assetUrl: assetUrl ?? null
  };
}

async function writeRulePackage(
  contentRoot: string,
  rulePackage: GeneratedRulePackage
): Promise<ContentGeneratorGeneratedFile[]> {
  const ruleDir = join(contentRoot, rulePackage.directoryName, "rule");
  await mkdir(ruleDir, { recursive: true });
  await writeFile(join(ruleDir, "manifest.json"), `${JSON.stringify(rulePackage.manifest, null, 2)}\n`, "utf8");
  await writeFile(join(ruleDir, "intro.txt"), `${rulePackage.introText.trim()}\n`, "utf8");
  await writeFile(join(ruleDir, "rule.md"), `${rulePackage.ruleMarkdown.trim()}\n`, "utf8");

  const manifestPath = `content/${rulePackage.directoryName}/rule/manifest.json`;
  const introPath = `content/${rulePackage.directoryName}/rule/intro.txt`;
  const ruleMdPath = `content/${rulePackage.directoryName}/rule/rule.md`;
  return [
    makeGeneratedFile(manifestPath, "json", clipPreview(JSON.stringify(rulePackage.manifest, null, 2))),
    makeGeneratedFile(introPath, "text", clipPreview(rulePackage.introText)),
    makeGeneratedFile(ruleMdPath, "markdown", clipPreview(rulePackage.ruleMarkdown))
  ];
}

async function writeStoryPackage(
  contentRoot: string,
  ruleDirectoryName: string,
  storyPackage: GeneratedStoryPackage,
  locale: LocaleCode
): Promise<ContentGeneratorGeneratedFile[]> {
  const storyDir = join(contentRoot, ruleDirectoryName, "story", storyPackage.directoryName);
  await mkdir(join(storyDir, "npc_prompt"), { recursive: true });
  await mkdir(join(storyDir, "text_assets"), { recursive: true });
  await writeFile(join(storyDir, "manifest.json"), `${JSON.stringify(storyPackage.manifest, null, 2)}\n`, "utf8");
  await writeFile(join(storyDir, "intro.txt"), `${storyPackage.introText.trim()}\n`, "utf8");
  await writeFile(join(storyDir, "story.md"), `${storyPackage.storyMarkdown.trim()}\n`, "utf8");
  await writeFile(
    join(storyDir, "text_assets", `beginning.${locale}.md`),
    `${storyPackage.beginningMarkdown.trim()}\n`,
    "utf8"
  );

  const files: ContentGeneratorGeneratedFile[] = [
    makeGeneratedFile(
      `content/${ruleDirectoryName}/story/${storyPackage.directoryName}/manifest.json`,
      "json",
      clipPreview(JSON.stringify(storyPackage.manifest, null, 2))
    ),
    makeGeneratedFile(
      `content/${ruleDirectoryName}/story/${storyPackage.directoryName}/intro.txt`,
      "text",
      clipPreview(storyPackage.introText)
    ),
    makeGeneratedFile(
      `content/${ruleDirectoryName}/story/${storyPackage.directoryName}/story.md`,
      "markdown",
      clipPreview(storyPackage.storyMarkdown)
    ),
    makeGeneratedFile(
      `content/${ruleDirectoryName}/story/${storyPackage.directoryName}/text_assets/beginning.${locale}.md`,
      "markdown",
      clipPreview(storyPackage.beginningMarkdown)
    )
  ];

  for (const item of storyPackage.npcPrompts) {
    const filePath = join(storyDir, "npc_prompt", item.fileName);
    await writeFile(filePath, `${item.prompt.trim()}\n`, "utf8");
    files.push(
      makeGeneratedFile(
        `content/${ruleDirectoryName}/story/${storyPackage.directoryName}/npc_prompt/${item.fileName}`,
        "text",
        clipPreview(item.prompt)
      )
    );
  }

  return files;
}

async function validateGeneratedOutput(
  contentRoot: string,
  summary: ContentGeneratorPackageSummary,
  locale: LocaleCode
): Promise<ContentGeneratorResponse["validation"]> {
  const messages: string[] = [];

  try {
    await loadContentCatalog(contentRoot);
    messages.push("内容目录扫描通过。");

    if (summary.storyDirectoryName) {
      await loadPlayableContentBundle(
        contentRoot,
        summary.ruleDirectoryName,
        summary.storyDirectoryName,
        locale
      );
      messages.push("生成的规则与剧本包可被运行时正确读取。");
    } else {
      messages.push("规则包已写入，可被目录扫描识别。");
    }

    return {
      ok: true,
      messages
    };
  } catch (error) {
    messages.push(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      messages
    };
  }
}

function buildContentGeneratorTempPaths(contentRoot: string): {
  tempRoot: string;
  jobRoot: string;
  stagedContentRoot: string;
} {
  const normalizedContentRoot = resolve(contentRoot);
  const versionRoot = resolve(normalizedContentRoot, "..");
  const tempRoot = join(versionRoot, "tmp", "content_generator");
  const jobRoot = join(tempRoot, `job_${Date.now()}_${randomUUID().slice(0, 8)}`);
  return {
    tempRoot,
    jobRoot,
    stagedContentRoot: join(jobRoot, "content")
  };
}

async function prepareStagingWorkspace(args: {
  finalContentRoot: string;
  stagedContentRoot: string;
  ruleDirectoryName: string;
}): Promise<void> {
  await mkdir(args.stagedContentRoot, { recursive: true });
  const sourceRuleRoot = join(args.finalContentRoot, args.ruleDirectoryName);
  const stagedRuleRoot = join(args.stagedContentRoot, args.ruleDirectoryName);

  if (await pathExists(sourceRuleRoot)) {
    await cp(sourceRuleRoot, stagedRuleRoot, {
      recursive: true,
      force: true
    });
    return;
  }

  await mkdir(stagedRuleRoot, { recursive: true });
}

async function commitStagedDirectory(args: {
  stagedPath: string;
  targetPath: string;
}): Promise<void> {
  if (!(await pathExists(args.stagedPath))) {
    return;
  }

  await mkdir(dirname(args.targetPath), { recursive: true });

  if (!(await pathExists(args.targetPath))) {
    await rename(args.stagedPath, args.targetPath);
    return;
  }

  const backupPath = `${args.targetPath}.__backup__${Date.now()}_${randomUUID().slice(0, 8)}`;
  await rename(args.targetPath, backupPath);

  try {
    await rename(args.stagedPath, args.targetPath);
    await rm(backupPath, {
      recursive: true,
      force: true
    });
  } catch (error) {
    if (!(await pathExists(args.targetPath)) && (await pathExists(backupPath))) {
      await rename(backupPath, args.targetPath).catch(() => undefined);
    }

    throw error;
  }
}

async function cleanupStagingWorkspace(jobRoot: string): Promise<void> {
  await rm(jobRoot, {
    recursive: true,
    force: true
  });
}

export async function generateContentPackage(args: {
  contentRoot: string;
  request: ContentGeneratorRequest;
  onStage?: (
    event: Extract<ContentGeneratorStreamEvent, { type: "stage" }>
  ) => void | Promise<void>;
}): Promise<ContentGeneratorResponse> {
  assertRequestValidity(args.request);

  const locale = normalizeLocaleCode(args.request.locale || DEFAULT_LOCALE);
  const progressPlan = buildContentGeneratorProgressPlan(args.request, locale);
  const progressStepIndex = new Map(
    progressPlan.map((step, index) => [step.id, index] as const)
  );
  const generationContext: GenerationContext = {
    locale,
    modelAccessMode: args.request.modelAccessMode,
    modelProfileId: args.request.modelProfileId,
    runtimeModelConfig: args.request.runtimeModelConfig,
    imageProfileId: args.request.imageProfileId,
    runtimeImageModelConfig: args.request.runtimeImageModelConfig,
    warnings: [],
    generationRuns: []
  };

  async function reportStage(
    stepId: ContentGeneratorProgressStepId,
    chineseDetail: string,
    englishDetail: string
  ): Promise<void> {
    const stageIndex = progressStepIndex.get(stepId) ?? 0;
    await args.onStage?.({
      type: "stage",
      stepId,
      label: getContentGeneratorStepLabel(stepId, locale),
      detail: pickProgressCopy(locale, chineseDetail, englishDetail),
      progress: buildStageProgress(stageIndex, progressPlan.length)
    });
  }

  let linkedRule: ExistingRuleContext | GeneratedRulePackage | null = null;
  let rulePackage: GeneratedRulePackage | null = null;
  let storyPackage: GeneratedStoryPackage | null = null;
  let generatedStorySpec: StorySpec | null = null;
  const generatedFiles: ContentGeneratorGeneratedFile[] = [];

  if (args.request.mode === "rule_only" || args.request.mode === "rule_and_story") {
    await reportStage(
      "extract_rule",
      "正在解析上传的规则文本，提取规则结构与核心字段。",
      "Parsing the uploaded rule text and extracting the rule structure."
    );
    const ruleSourceText = args.request.ruleSource?.content.trim() ?? "";
    const ruleSpec = await extractRuleSpec(
      generationContext,
      ruleSourceText,
      args.request.ruleSource?.fileName
    );
    const ruleDirectoryName = sanitizeDirectoryName(ruleSpec.idCandidate, "rule");
    const ruleManifest = buildRuleManifest(ruleSpec, locale);
    const ruleDir = join(args.contentRoot, ruleDirectoryName, "rule");
    if ((await pathExists(join(ruleDir, "manifest.json"))) && !args.request.forceOverwrite) {
      throw new Error(
        `规则目录已存在：content/${ruleDirectoryName}/rule。若要覆盖，请开启 forceOverwrite。`
      );
    }

    await reportStage(
      "generate_rule",
      "正在生成规则简介与规则主文档。",
      "Generating the rule intro and the main rule document."
    );
    const ruleIntro = await generateRuleIntro(generationContext, ruleSpec);
    const ruleMarkdown = await generateRuleMarkdown(
      generationContext,
      ruleSpec,
      ruleSourceText
    );

    rulePackage = {
      directoryName: ruleDirectoryName,
      manifest: ruleManifest,
      introText: ruleIntro,
      ruleMarkdown
    };
    linkedRule = rulePackage;
  } else {
    await reportStage(
      "load_existing_rule",
      "正在读取你选择的关联规则，准备把故事挂到对应规则目录下。",
      "Loading the linked rule package selected for this story."
    );
    linkedRule = await readExistingRuleContext(
      args.contentRoot,
      args.request.associatedRuleDirectoryName!.trim(),
      locale
    );
  }

  if (args.request.mode === "story_only" || args.request.mode === "rule_and_story") {
    await reportStage(
      "extract_story",
      "正在解析故事文本，抽取场景、角色、线索与结局结构。",
      "Parsing the story text and extracting scenes, characters, clues, and endings."
    );
    const storySourceText = args.request.storySource?.content.trim() ?? "";
    const storySpec = await extractStorySpec(
      generationContext,
      storySourceText,
      args.request.storySource?.fileName,
      linkedRule!
    );
    const storyDirectoryName = sanitizeDirectoryName(storySpec.idCandidate, "story");
    const storyManifest = buildStoryManifest(storySpec, locale, linkedRule!.manifest);
    const storyDir = join(args.contentRoot, linkedRule!.directoryName, "story", storyDirectoryName);
    if ((await pathExists(join(storyDir, "manifest.json"))) && !args.request.forceOverwrite) {
      throw new Error(
        `剧本目录已存在：content/${linkedRule!.directoryName}/story/${storyDirectoryName}。若要覆盖，请开启 forceOverwrite。`
      );
    }

    await reportStage(
      "generate_story",
      "正在生成剧本简介与剧本主文档。",
      "Generating the story intro and the main story document."
    );
    const storyIntro = await generateStoryIntro(generationContext, storySpec);
    const storyMarkdown = await generateStoryMarkdown(
      generationContext,
      storySpec,
      storySourceText,
      linkedRule!
    );

    const provisionalStoryPackage: GeneratedStoryPackage = {
      directoryName: storyDirectoryName,
      manifest: storyManifest,
      introText: storyIntro,
      storyMarkdown,
      beginningMarkdown: "",
      npcPrompts: [],
      assetPlan: null
    };

    await reportStage(
      "generate_supporting",
      "正在生成开场文本与 NPC prompt。",
      "Generating the opening text and NPC prompt files."
    );
    provisionalStoryPackage.beginningMarkdown = await generateBeginningMarkdown(
      generationContext,
      linkedRule!,
      provisionalStoryPackage
    );

    const npcEntities = storySpec.entities
      .filter((entity) => {
        const type = entity.type.toLowerCase();
        return !type.includes("组织") && !type.includes("organization");
      })
      .slice(0, 8);

    provisionalStoryPackage.npcPrompts = [];
    for (const entity of npcEntities) {
      const npcPrompt = await generateNpcPrompt(
        generationContext,
        entity,
        storySpec,
        linkedRule!
      );
      provisionalStoryPackage.npcPrompts.push({
        fileName: `${sanitizeFileStem(entity.name, entity.id)}.txt`,
        prompt: npcPrompt
      });
    }

    if (args.request.generateImages !== false) {
      await reportStage(
        "plan_assets",
        "正在规划封面图和 other 图需要表现的内容。",
        "Planning the cover image and the supporting art assets."
      );
      provisionalStoryPackage.assetPlan = await planAssets(generationContext, storySpec);
    }

    storyPackage = provisionalStoryPackage;
    generatedStorySpec = storySpec;
  }

  const summary: ContentGeneratorPackageSummary = {
    ruleDirectoryName: linkedRule!.directoryName,
    ruleId: linkedRule!.manifest.id,
    ruleTitle: linkedRule!.manifest.title[linkedRule!.manifest.defaultLocale] ?? linkedRule!.manifest.id,
    ruleOutputPath: `content/${linkedRule!.directoryName}/rule`,
    storyDirectoryName: storyPackage?.directoryName ?? null,
    storyId: storyPackage?.manifest.id ?? null,
    storyTitle:
      storyPackage?.manifest.title[storyPackage.manifest.defaultLocale] ??
      storyPackage?.manifest.id ??
      null,
    storyOutputPath: storyPackage
      ? `content/${linkedRule!.directoryName}/story/${storyPackage.directoryName}`
      : null
  };

  const tempPaths = buildContentGeneratorTempPaths(args.contentRoot);
  let validation: ContentGeneratorResponse["validation"] = {
    ok: false,
    messages: []
  };

  try {
    await reportStage(
      "write_package",
      "正在把生成结果写入 tmp 临时目录。",
      "Writing the generated package into the tmp staging directory."
    );
    await prepareStagingWorkspace({
      finalContentRoot: args.contentRoot,
      stagedContentRoot: tempPaths.stagedContentRoot,
      ruleDirectoryName: linkedRule!.directoryName
    });

    if (rulePackage) {
      generatedFiles.push(...(await writeRulePackage(tempPaths.stagedContentRoot, rulePackage)));
    }

    if (storyPackage && linkedRule) {
      generatedFiles.push(
        ...(await writeStoryPackage(
          tempPaths.stagedContentRoot,
          linkedRule.directoryName,
          storyPackage,
          locale
        ))
      );

      if (storyPackage.assetPlan && generatedStorySpec) {
        await reportStage(
          "generate_assets",
          "正在生成封面图与 other 图，并写入 tmp/art_assets。",
          "Generating the cover and support images into the staged art_assets directory."
        );
        const coverPrompt = await generateCoverPrompt(
          generationContext,
          linkedRule,
          generatedStorySpec,
          storyPackage.assetPlan
        );

        const coverFile = await writeImageAsset(generationContext, {
          contentRoot: tempPaths.stagedContentRoot,
          ruleDirectoryName: linkedRule.directoryName,
          storyDirectoryName: storyPackage.directoryName,
          relativeDir: "art_assets",
          fileStem: sanitizeFileStem(storyPackage.assetPlan.cover.fileName, "cover"),
          prompt: coverPrompt,
          sceneId: storyPackage.manifest.startSceneId,
          tones: generatedStorySpec.tones
        });
        if (coverFile) {
          generatedFiles.push(coverFile);
        }

        for (const asset of storyPackage.assetPlan.otherAssets) {
          const otherPrompt = await generateOtherAssetPrompt(
            generationContext,
            asset,
            generatedStorySpec
          );
          const assetFile = await writeImageAsset(generationContext, {
            contentRoot: tempPaths.stagedContentRoot,
            ruleDirectoryName: linkedRule.directoryName,
            storyDirectoryName: storyPackage.directoryName,
            relativeDir: join("art_assets", "other"),
            fileStem: sanitizeFileStem(asset.fileName, asset.fileName),
            prompt: otherPrompt,
            sceneId: `${storyPackage.manifest.startSceneId}_${asset.fileName}`,
            tones: generatedStorySpec.tones
          });
          if (assetFile) {
            generatedFiles.push(assetFile);
          }
        }
      }
    }

    await reportStage(
      "validate_package",
      "正在检查 tmp 里的内容包是否完整且可被运行时读取。",
      "Checking that the staged package in tmp is complete and loadable by the runtime."
    );
    validation = await validateGeneratedOutput(tempPaths.stagedContentRoot, summary, locale);

    if (validation.ok) {
      await reportStage(
        "commit_package",
        "检查通过，正在把完整内容包移动到 content 目录。",
        "Validation passed. Moving the completed package into the content directory."
      );
      await commitStagedDirectory({
        stagedPath: join(tempPaths.stagedContentRoot, linkedRule!.directoryName),
        targetPath: join(args.contentRoot, linkedRule!.directoryName)
      });

      await reportStage(
        "cleanup_tmp",
        "正在清理 tmp 中的中间产物。",
        "Cleaning the remaining staged files from tmp."
      );
    } else {
      generationContext.warnings.push(
        "Temporary validation failed. The generated package was not moved into content."
      );
    }
  } finally {
    await cleanupStagingWorkspace(tempPaths.jobRoot).catch((error: unknown) => {
      generationContext.warnings.push(
        `Failed to clean tmp staging files: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }

  return {
    ok: true,
    mode: args.request.mode,
    summary,
    generatedFiles,
    validation,
    warnings: generationContext.warnings,
    generationRuns: generationContext.generationRuns
  };
}
