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
