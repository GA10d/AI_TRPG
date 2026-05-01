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
const DEEPSEEK_PRICING_URL = "https://api-docs.deepseek.com/quick_start/pricing/";
const DOUBAO_PRICING_URL = "https://www.volcengine.com/docs/84458/1585097";

const MODEL_PRICING_CATALOG: ModelPricingCatalogEntry[] = [
  {
    modelNames: ["gpt-5.4"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 2.5,
      cachedInputPerMillion: 0.25,
      outputPerMillion: 15,
      sourceUrl: OPENAI_PRICING_URL,
      note:
        "OpenAI notes that prompts above 272K input tokens are billed at a higher long-context rate for the full session."
    }
  },
  {
    modelNames: ["gpt-5.4-mini"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.75,
      cachedInputPerMillion: 0.075,
      outputPerMillion: 4.5,
      sourceUrl: OPENAI_PRICING_URL
    }
  },
  {
    modelNames: ["gpt-5.4-nano"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.2,
      cachedInputPerMillion: 0.02,
      outputPerMillion: 1.25,
      sourceUrl: OPENAI_PRICING_URL
    }
  },
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
    modelNames: ["deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.14,
      cachedInputPerMillion: 0.028,
      outputPerMillion: 0.28,
      sourceUrl: DEEPSEEK_PRICING_URL,
      note:
        "Deprecated deepseek-chat and deepseek-reasoner currently route to deepseek-v4-flash non-thinking/thinking modes. If DeepSeek does not return cache-hit tokens, the estimate assumes cache miss."
    }
  },
  {
    modelNames: ["deepseek-v4-pro"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.435,
      cachedInputPerMillion: 0.03625,
      outputPerMillion: 0.87,
      sourceUrl: DEEPSEEK_PRICING_URL,
      note:
        "Uses DeepSeek's limited-time 75% discount for deepseek-v4-pro through 2026-05-05 15:59 UTC. List prices are $1.74 input, $0.145 cached input, and $3.48 output per 1M tokens."
    }
  },
  {
    modelNames: ["gemini-3-pro-preview"],
    pricing: {
      kind: "gemini-tiered",
      currency: "USD",
      promptThresholdTokens: 200_000,
      inputPerMillionBelowOrEqualThreshold: 2,
      inputPerMillionAboveThreshold: 4,
      outputPerMillionBelowOrEqualThreshold: 12,
      outputPerMillionAboveThreshold: 18,
      sourceUrl: GEMINI_PRICING_URL,
      note: "Gemini 3 Pro is currently a preview model."
    }
  },
  {
    modelNames: ["gemini-3-flash-preview"],
    pricing: {
      kind: "flat",
      currency: "USD",
      inputPerMillion: 0.5,
      outputPerMillion: 3,
      sourceUrl: GEMINI_PRICING_URL,
      note: "Gemini 3 Flash is currently a preview model."
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
