import type {
  AiGenerationCost,
  AiGenerationUsage
} from "../../shared-types/src/runtime.ts";

type CurrencyCode = AiGenerationCost["currency"];

type FlatPricingRule = {
  kind: "flat";
  currency: CurrencyCode;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
  sourceUrl: string;
  note?: string;
};

type GeminiTieredPricingRule = {
  kind: "gemini-tiered";
  currency: CurrencyCode;
  promptThresholdTokens: number;
  inputPerMillionBelowOrEqualThreshold: number;
  inputPerMillionAboveThreshold: number;
  outputPerMillionBelowOrEqualThreshold: number;
  outputPerMillionAboveThreshold: number;
  sourceUrl: string;
  note?: string;
};

type DoubaoSeed16PricingRule = {
  kind: "doubao-seed-1-6-tiered";
  currency: CurrencyCode;
  tiers: Array<{
    maxPromptTokens: number;
    inputPerMillion: number;
    outputPerMillion: number;
    outputPerMillionShort?: number;
    shortOutputThresholdTokens?: number;
  }>;
  cachedInputPerMillion?: number;
  sourceUrl: string;
  note?: string;
};

type PricingRule =
  | FlatPricingRule
  | GeminiTieredPricingRule
  | DoubaoSeed16PricingRule;

type ModelPricingCatalogEntry = {
  modelNames: string[];
  pricing: PricingRule;
};

type PricingLookupInput = {
  model: string | null | undefined;
  usage: AiGenerationUsage | null | undefined;
};

const OPENAI_PRICING_URL = "https://platform.openai.com/docs/pricing";
const GEMINI_PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing";
const DEEPSEEK_PRICING_URL =
  "https://api-docs.deepseek.com/quick_start/pricing-details-usd";
const DOUBAO_PRICING_URL = "https://www.volcengine.com/docs/84458/1585097";

const MODEL_PRICING_CATALOG: ModelPricingCatalogEntry[] = [
  {
    modelNames: ["gpt-5.2", "gpt-5.2-chat-latest"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 1.75,
      cachedInputPerMillion: 0.175,
      outputPerMillion: 14,
      sourceUrl: OPENAI_PRICING_URL
    }
  },
  {
    modelNames: ["gpt-5.2-mini", "gpt-5-mini"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.4,
      cachedInputPerMillion: 0.04,
      outputPerMillion: 3.2,
      sourceUrl: OPENAI_PRICING_URL
    }
  },
  {
    modelNames: ["gpt-5-nano"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.1,
      cachedInputPerMillion: 0.01,
      outputPerMillion: 0.8,
      sourceUrl: OPENAI_PRICING_URL
    }
  },
  {
    modelNames: ["deepseek-chat"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.27,
      cachedInputPerMillion: 0.07,
      outputPerMillion: 1.1,
      sourceUrl: DEEPSEEK_PRICING_URL,
      note: "If DeepSeek does not return cache-hit tokens, the estimate assumes cache miss."
    }
  },
  {
    modelNames: ["deepseek-reasoner"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.55,
      cachedInputPerMillion: 0.14,
      outputPerMillion: 2.19,
      sourceUrl: DEEPSEEK_PRICING_URL,
      note: "If DeepSeek does not return cache-hit tokens, the estimate assumes cache miss."
    }
  },
  {
    modelNames: ["gemini-2.5-pro"],
    pricing: {
      kind: "gemini-tiered",
      currency: "USD",
      promptThresholdTokens: 200_000,
      inputPerMillionBelowOrEqualThreshold: 1.25,
      inputPerMillionAboveThreshold: 2.5,
      outputPerMillionBelowOrEqualThreshold: 10,
      outputPerMillionAboveThreshold: 15,
      sourceUrl: GEMINI_PRICING_URL
    }
  },
  {
    modelNames: ["gemini-2.5-flash"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.3,
      outputPerMillion: 2.5,
      sourceUrl: GEMINI_PRICING_URL
    }
  },
  {
    modelNames: ["gemini-2.5-flash-lite"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.1,
      outputPerMillion: 0.4,
      sourceUrl: GEMINI_PRICING_URL
    }
  },
  {
    modelNames: ["doubao-seed-1-6-251015", "doubao-seed-1.6", "doubao-seed-1-6"],
    pricing: {
      kind: "doubao-seed-1-6-tiered",
      currency: "CNY",
      tiers: [
        {
          maxPromptTokens: 32_000,
          inputPerMillion: 0.8,
          outputPerMillion: 8,
          outputPerMillionShort: 2,
          shortOutputThresholdTokens: 200
        },
        {
          maxPromptTokens: 128_000,
          inputPerMillion: 1.2,
          outputPerMillion: 16
        },
        {
          maxPromptTokens: 256_000,
          inputPerMillion: 2.4,
          outputPerMillion: 24
        }
      ],
      cachedInputPerMillion: 0.16,
      sourceUrl: DOUBAO_PRICING_URL,
      note:
        "Pricing follows the official Doubao-Seed-1.6 tiered table. If cache-hit tokens are unavailable, input tokens are treated as uncached."
    }
  }
];

function normalizeModelName(model: string | null | undefined): string | null {
  if (typeof model !== "string") {
    return null;
  }

  const normalized = model.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function toMillions(tokens: number): number {
  return tokens / 1_000_000;
}

function roundCost(value: number): number {
  return Number(value.toFixed(8));
}

function splitPromptTokens(usage: AiGenerationUsage | null | undefined): {
  cachedPromptTokens: number;
  uncachedPromptTokens: number;
  completionTokens: number;
} | null {
  const promptTokens =
    typeof usage?.promptTokens === "number" && Number.isFinite(usage.promptTokens)
      ? usage.promptTokens
      : null;
  const completionTokens =
    typeof usage?.completionTokens === "number" && Number.isFinite(usage.completionTokens)
      ? usage.completionTokens
      : null;

  if (promptTokens === null || completionTokens === null) {
    return null;
  }

  const cachedPromptTokens =
    typeof usage?.promptCacheHitTokens === "number" && Number.isFinite(usage.promptCacheHitTokens)
      ? Math.max(0, usage.promptCacheHitTokens)
      : 0;
  const explicitMissTokens =
    typeof usage?.promptCacheMissTokens === "number" &&
    Number.isFinite(usage.promptCacheMissTokens)
      ? Math.max(0, usage.promptCacheMissTokens)
      : null;
  const uncachedPromptTokens =
    explicitMissTokens !== null
      ? explicitMissTokens
      : Math.max(0, promptTokens - cachedPromptTokens);

  return {
    cachedPromptTokens,
    uncachedPromptTokens,
    completionTokens
  };
}

function buildFlatCost(
  pricing: FlatPricingRule,
  usage: AiGenerationUsage | null | undefined,
  pricingModel: string
): AiGenerationCost | null {
  const tokenSplit = splitPromptTokens(usage);
  if (!tokenSplit) {
    return null;
  }

  const inputRate =
    pricing.cachedInputPerMillion !== undefined
      ? toMillions(tokenSplit.cachedPromptTokens) * pricing.cachedInputPerMillion +
        toMillions(tokenSplit.uncachedPromptTokens) * pricing.inputPerMillion
      : toMillions(tokenSplit.cachedPromptTokens + tokenSplit.uncachedPromptTokens) *
        pricing.inputPerMillion;
  const outputCost = toMillions(tokenSplit.completionTokens) * pricing.outputPerMillion;

  return {
    amount: roundCost(inputRate + outputCost),
    currency: pricing.currency,
    pricingModel,
    sourceUrl: pricing.sourceUrl,
    note: pricing.note ?? null
  };
}

function buildGeminiTieredCost(
  pricing: GeminiTieredPricingRule,
  usage: AiGenerationUsage | null | undefined,
  pricingModel: string
): AiGenerationCost | null {
  const tokenSplit = splitPromptTokens(usage);
  if (!tokenSplit) {
    return null;
  }

  const promptTokens = tokenSplit.cachedPromptTokens + tokenSplit.uncachedPromptTokens;
  const useHighTier = promptTokens > pricing.promptThresholdTokens;
  const inputRate = useHighTier
    ? pricing.inputPerMillionAboveThreshold
    : pricing.inputPerMillionBelowOrEqualThreshold;
  const outputRate = useHighTier
    ? pricing.outputPerMillionAboveThreshold
    : pricing.outputPerMillionBelowOrEqualThreshold;

  return {
    amount: roundCost(
      toMillions(promptTokens) * inputRate +
        toMillions(tokenSplit.completionTokens) * outputRate
    ),
    currency: pricing.currency,
    pricingModel,
    sourceUrl: pricing.sourceUrl,
    note: pricing.note ?? null
  };
}

function buildDoubaoSeed16Cost(
  pricing: DoubaoSeed16PricingRule,
  usage: AiGenerationUsage | null | undefined,
  pricingModel: string
): AiGenerationCost | null {
  const tokenSplit = splitPromptTokens(usage);
  if (!tokenSplit) {
    return null;
  }

  const promptTokens = tokenSplit.cachedPromptTokens + tokenSplit.uncachedPromptTokens;
  const matchedTier = pricing.tiers.find((tier) => promptTokens <= tier.maxPromptTokens);
  if (!matchedTier) {
    return null;
  }

  const outputRate =
    matchedTier.outputPerMillionShort !== undefined &&
    matchedTier.shortOutputThresholdTokens !== undefined &&
    tokenSplit.completionTokens <= matchedTier.shortOutputThresholdTokens
      ? matchedTier.outputPerMillionShort
      : matchedTier.outputPerMillion;

  const inputCost =
    pricing.cachedInputPerMillion !== undefined
      ? toMillions(tokenSplit.cachedPromptTokens) * pricing.cachedInputPerMillion +
        toMillions(tokenSplit.uncachedPromptTokens) * matchedTier.inputPerMillion
      : toMillions(promptTokens) * matchedTier.inputPerMillion;

  return {
    amount: roundCost(inputCost + toMillions(tokenSplit.completionTokens) * outputRate),
    currency: pricing.currency,
    pricingModel,
    sourceUrl: pricing.sourceUrl,
    note: pricing.note ?? null
  };
}

function resolvePricingRule(model: string | null | undefined): ModelPricingCatalogEntry | null {
  const normalizedModel = normalizeModelName(model);
  if (!normalizedModel) {
    return null;
  }

  return (
    MODEL_PRICING_CATALOG.find((entry) => entry.modelNames.includes(normalizedModel)) ?? null
  );
}

export function estimateModelUsageCost(
  input: PricingLookupInput
): AiGenerationCost | null {
  const pricingEntry = resolvePricingRule(input.model);
  const pricingModel = normalizeModelName(input.model);
  if (!pricingEntry || !pricingModel) {
    return null;
  }

  if (pricingEntry.pricing.kind === "flat") {
    return buildFlatCost(pricingEntry.pricing, input.usage, pricingModel);
  }

  if (pricingEntry.pricing.kind === "gemini-tiered") {
    return buildGeminiTieredCost(pricingEntry.pricing, input.usage, pricingModel);
  }

  return buildDoubaoSeed16Cost(pricingEntry.pricing, input.usage, pricingModel);
}
