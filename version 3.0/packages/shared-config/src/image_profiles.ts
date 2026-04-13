export type ImageModelFeatureKey =
  | "text_to_image"
  | "reference_image";

export type ImageModelFeatureConfig = {
  supported: boolean;
  model: string | null;
  url: string | null;
};

export const IMAGE_MODEL_FEATURE_LABELS: Record<ImageModelFeatureKey, string> = {
  text_to_image: "Text to Image",
  reference_image: "Reference Image"
};

export type ImageProviderDependence = "Mock" | "OpenAI" | "Google";

export type ImageProfileDefinition = {
  id: string;
  order: number;
  name: string;
  code: string;
  providerFamily: string;
  dependence: ImageProviderDependence;
  description: string;
  urlRequirements: boolean;
  baseUrl: string | null;
  baseModel: string | null;
  chargeUrl: string;
  docsUrl: string;
  envKeyCandidates: string[];
  modelEnvKeyCandidates: string[];
  baseUrlEnvKeyCandidates: string[];
  allowsCustomApiKey: boolean;
  allowsCustomBaseUrl: boolean;
  allowsCustomModel: boolean;
  features: Record<ImageModelFeatureKey, ImageModelFeatureConfig>;
};

export const IMAGE_PROFILES: ImageProfileDefinition[] = [
  {
    id: "mock-image",
    order: 1,
    name: "Mock Image",
    code: "mock_image",
    providerFamily: "mock",
    dependence: "Mock",
    description: "Built-in placeholder generator for UI development and pipeline verification.",
    urlRequirements: false,
    baseUrl: null,
    baseModel: null,
    chargeUrl: "",
    docsUrl: "",
    envKeyCandidates: [],
    modelEnvKeyCandidates: [],
    baseUrlEnvKeyCandidates: [],
    allowsCustomApiKey: false,
    allowsCustomBaseUrl: false,
    allowsCustomModel: false,
    features: {
      text_to_image: { supported: true, model: null, url: null },
      reference_image: { supported: false, model: null, url: null }
    }
  },
  {
    id: "gemini-image",
    order: 10,
    name: "Gemini Image",
    code: "gemini_image",
    providerFamily: "google-native",
    dependence: "Google",
    description: "Use Gemini image generation for portraits and scene illustrations.",
    urlRequirements: false,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    baseModel: "gemini-3.1-flash-image-preview",
    chargeUrl: "https://ai.google.dev/pricing",
    docsUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
    envKeyCandidates: [
      "TRPG_IMAGE_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY"
    ],
    modelEnvKeyCandidates: [
      "TRPG_IMAGE_MODEL",
      "TRPG_GEMINI_IMAGE_MODEL"
    ],
    baseUrlEnvKeyCandidates: [
      "TRPG_IMAGE_BASE_URL",
      "TRPG_GEMINI_IMAGE_BASE_URL"
    ],
    allowsCustomApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    features: {
      text_to_image: {
        supported: true,
        model: "gemini-3.1-flash-image-preview",
        url: "https://ai.google.dev/gemini-api/docs/image-generation"
      },
      reference_image: {
        supported: true,
        model: "gemini-3.1-flash-image-preview",
        url: "https://ai.google.dev/gemini-api/docs/image-generation"
      }
    }
  },
  {
    id: "chatgpt-image",
    order: 20,
    name: "ChatGPT Image",
    code: "chatgpt_image",
    providerFamily: "openai-native",
    dependence: "OpenAI",
    description: "Use OpenAI GPT Image for native text-to-image generation.",
    urlRequirements: false,
    baseUrl: "https://api.openai.com/v1",
    baseModel: "gpt-image-1.5",
    chargeUrl: "https://openai.com/api/pricing/",
    docsUrl: "https://platform.openai.com/docs/guides/image-generation",
    envKeyCandidates: [
      "TRPG_CHATGPT_IMAGE_API_KEY",
      "OPENAI_API_KEY"
    ],
    modelEnvKeyCandidates: [
      "TRPG_CHATGPT_IMAGE_MODEL"
    ],
    baseUrlEnvKeyCandidates: [
      "TRPG_CHATGPT_IMAGE_BASE_URL"
    ],
    allowsCustomApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    features: {
      text_to_image: {
        supported: true,
        model: "gpt-image-1.5",
        url: "https://platform.openai.com/docs/guides/image-generation"
      },
      reference_image: {
        supported: false,
        model: null,
        url: null
      }
    }
  },
  {
    id: "doubao-image",
    order: 30,
    name: "Doubao Image",
    code: "doubao_image",
    providerFamily: "byteplus-openai-compatible",
    dependence: "OpenAI",
    description: "Use BytePlus ModelArk Seedream image generation through the OpenAI-compatible image API.",
    urlRequirements: false,
    baseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
    baseModel: "seedream-5-0-260128",
    chargeUrl: "https://www.byteplus.com/en/product/ModelArk",
    docsUrl: "https://docs.byteplus.com/en/docs/ModelArk/1824690",
    envKeyCandidates: [
      "TRPG_DOUBAO_IMAGE_API_KEY",
      "DOUBAO_API_KEY",
      "TRPG_DOUBAO_API_KEY",
      "ARK_API_KEY"
    ],
    modelEnvKeyCandidates: [
      "TRPG_DOUBAO_IMAGE_MODEL"
    ],
    baseUrlEnvKeyCandidates: [
      "TRPG_DOUBAO_IMAGE_BASE_URL",
      "TRPG_DOUBAO_BASE_URL"
    ],
    allowsCustomApiKey: true,
    allowsCustomBaseUrl: true,
    allowsCustomModel: true,
    features: {
      text_to_image: {
        supported: true,
        model: "seedream-5-0-260128",
        url: "https://docs.byteplus.com/en/docs/ModelArk/1824690"
      },
      reference_image: {
        supported: false,
        model: null,
        url: null
      }
    }
  }
];

export function listImageProfiles(): ImageProfileDefinition[] {
  return [...IMAGE_PROFILES].sort((left, right) => left.order - right.order);
}

export function getImageProfile(profileId: string): ImageProfileDefinition | null {
  return IMAGE_PROFILES.find((item) => item.id === profileId) ?? null;
}

export function getDefaultImageProfileId(): string {
  return "mock-image";
}
