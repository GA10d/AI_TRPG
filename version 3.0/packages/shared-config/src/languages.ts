import type { LocaleCode } from "../../shared-types/src/index.ts";

export type LanguageDefinition = {
  id: number;
  code: LocaleCode;
  englishName: string;
  nativeName: string;
  textDirection: "ltr" | "rtl";
  aliases: LocaleCode[];
  fallbackLocales: LocaleCode[];
  enabled: boolean;
};

export type LanguageOptionPayload = {
  id: number;
  code: LocaleCode;
  label: string;
  nativeLabel: string;
};

export const DEFAULT_LOCALE = "zh-CN";

export const LANGUAGE_TABLE: Record<string, LanguageDefinition> = {
  "zh-CN": {
    id: 1,
    code: "zh-CN",
    englishName: "Simplified Chinese",
    nativeName: "简体中文",
    textDirection: "ltr",
    aliases: [
      "zh",
      "zh-Hans",
      "zh-Hans-CN"
    ],
    fallbackLocales: [],
    enabled: true
  },
  "zh-TW": {
    id: 2,
    code: "zh-TW",
    englishName: "Traditional Chinese",
    nativeName: "繁體中文",
    textDirection: "ltr",
    aliases: [
      "zh-Hant",
      "zh-Hant-TW"
    ],
    fallbackLocales: [],
    enabled: true
  },
  "en-US": {
    id: 3,
    code: "en-US",
    englishName: "English",
    nativeName: "English",
    textDirection: "ltr",
    aliases: [
      "en",
      "en-GB"
    ],
    fallbackLocales: [],
    enabled: true
  },
  ja: {
    id: 4,
    code: "ja",
    englishName: "Japanese",
    nativeName: "日本語",
    textDirection: "ltr",
    aliases: [
      "ja-JP"
    ],
    fallbackLocales: [],
    enabled: true
  },
  ko: {
    id: 5,
    code: "ko",
    englishName: "Korean",
    nativeName: "한국어",
    textDirection: "ltr",
    aliases: [
      "ko-KR"
    ],
    fallbackLocales: [],
    enabled: true
  },
  fr: {
    id: 6,
    code: "fr",
    englishName: "French",
    nativeName: "Français",
    textDirection: "ltr",
    aliases: [
      "fr-FR"
    ],
    fallbackLocales: [],
    enabled: true
  },
  de: {
    id: 7,
    code: "de",
    englishName: "German",
    nativeName: "Deutsch",
    textDirection: "ltr",
    aliases: [
      "de-DE"
    ],
    fallbackLocales: [],
    enabled: true
  },
  es: {
    id: 8,
    code: "es",
    englishName: "Spanish",
    nativeName: "Español",
    textDirection: "ltr",
    aliases: [
      "es-ES",
      "es-MX"
    ],
    fallbackLocales: [],
    enabled: true
  },
  pt: {
    id: 9,
    code: "pt",
    englishName: "Portuguese",
    nativeName: "Português",
    textDirection: "ltr",
    aliases: [
      "pt-PT",
      "pt-BR"
    ],
    fallbackLocales: [],
    enabled: true
  },
  it: {
    id: 10,
    code: "it",
    englishName: "Italian",
    nativeName: "Italiano",
    textDirection: "ltr",
    aliases: [
      "it-IT"
    ],
    fallbackLocales: [],
    enabled: true
  },
  ru: {
    id: 11,
    code: "ru",
    englishName: "Russian",
    nativeName: "Русский",
    textDirection: "ltr",
    aliases: [
      "ru-RU"
    ],
    fallbackLocales: [],
    enabled: true
  },
  ar: {
    id: 12,
    code: "ar",
    englishName: "Arabic",
    nativeName: "العربية",
    textDirection: "rtl",
    aliases: [
      "ar-SA"
    ],
    fallbackLocales: [],
    enabled: true
  },
  hi: {
    id: 13,
    code: "hi",
    englishName: "Hindi",
    nativeName: "हिन्दी",
    textDirection: "ltr",
    aliases: [
      "hi-IN"
    ],
    fallbackLocales: [],
    enabled: true
  },
  nl: {
    id: 14,
    code: "nl",
    englishName: "Dutch",
    nativeName: "Nederlands",
    textDirection: "ltr",
    aliases: [
      "nl-NL"
    ],
    fallbackLocales: [],
    enabled: true
  },
  sv: {
    id: 15,
    code: "sv",
    englishName: "Swedish",
    nativeName: "Svenska",
    textDirection: "ltr",
    aliases: [
      "sv-SE"
    ],
    fallbackLocales: [],
    enabled: true
  },
  no: {
    id: 16,
    code: "no",
    englishName: "Norwegian",
    nativeName: "Norsk",
    textDirection: "ltr",
    aliases: [
      "nb",
      "nb-NO",
      "no-NO"
    ],
    fallbackLocales: [],
    enabled: true
  },
  da: {
    id: 17,
    code: "da",
    englishName: "Danish",
    nativeName: "Dansk",
    textDirection: "ltr",
    aliases: [
      "da-DK"
    ],
    fallbackLocales: [],
    enabled: true
  },
  fi: {
    id: 18,
    code: "fi",
    englishName: "Finnish",
    nativeName: "Suomi",
    textDirection: "ltr",
    aliases: [
      "fi-FI"
    ],
    fallbackLocales: [],
    enabled: true
  },
  uk: {
    id: 19,
    code: "uk",
    englishName: "Ukrainian",
    nativeName: "Українська",
    textDirection: "ltr",
    aliases: [
      "uk-UA"
    ],
    fallbackLocales: [],
    enabled: true
  },
  pl: {
    id: 20,
    code: "pl",
    englishName: "Polish",
    nativeName: "Polski",
    textDirection: "ltr",
    aliases: [
      "pl-PL"
    ],
    fallbackLocales: [],
    enabled: true
  },
  cs: {
    id: 21,
    code: "cs",
    englishName: "Czech",
    nativeName: "Čeština",
    textDirection: "ltr",
    aliases: [
      "cs-CZ"
    ],
    fallbackLocales: [],
    enabled: true
  },
  sk: {
    id: 22,
    code: "sk",
    englishName: "Slovak",
    nativeName: "Slovenčina",
    textDirection: "ltr",
    aliases: [
      "sk-SK"
    ],
    fallbackLocales: [],
    enabled: true
  },
  hu: {
    id: 23,
    code: "hu",
    englishName: "Hungarian",
    nativeName: "Magyar",
    textDirection: "ltr",
    aliases: [
      "hu-HU"
    ],
    fallbackLocales: [],
    enabled: true
  },
  ro: {
    id: 24,
    code: "ro",
    englishName: "Romanian",
    nativeName: "Română",
    textDirection: "ltr",
    aliases: [
      "ro-RO"
    ],
    fallbackLocales: [],
    enabled: true
  },
  bg: {
    id: 25,
    code: "bg",
    englishName: "Bulgarian",
    nativeName: "Български",
    textDirection: "ltr",
    aliases: [
      "bg-BG"
    ],
    fallbackLocales: [],
    enabled: true
  },
  sr: {
    id: 26,
    code: "sr",
    englishName: "Serbian",
    nativeName: "Српски",
    textDirection: "ltr",
    aliases: [
      "sr-RS"
    ],
    fallbackLocales: [],
    enabled: true
  },
  bn: {
    id: 27,
    code: "bn",
    englishName: "Bengali",
    nativeName: "বাংলা",
    textDirection: "ltr",
    aliases: [
      "bn-BD"
    ],
    fallbackLocales: [],
    enabled: true
  },
  ur: {
    id: 28,
    code: "ur",
    englishName: "Urdu",
    nativeName: "اردو",
    textDirection: "rtl",
    aliases: [
      "ur-PK"
    ],
    fallbackLocales: [],
    enabled: true
  },
  ta: {
    id: 29,
    code: "ta",
    englishName: "Tamil",
    nativeName: "தமிழ்",
    textDirection: "ltr",
    aliases: [
      "ta-IN"
    ],
    fallbackLocales: [],
    enabled: true
  },
  te: {
    id: 30,
    code: "te",
    englishName: "Telugu",
    nativeName: "తెలుగు",
    textDirection: "ltr",
    aliases: [
      "te-IN"
    ],
    fallbackLocales: [],
    enabled: true
  },
  th: {
    id: 31,
    code: "th",
    englishName: "Thai",
    nativeName: "ไทย",
    textDirection: "ltr",
    aliases: [
      "th-TH"
    ],
    fallbackLocales: [],
    enabled: true
  },
  vi: {
    id: 32,
    code: "vi",
    englishName: "Vietnamese",
    nativeName: "Tiếng Việt",
    textDirection: "ltr",
    aliases: [
      "vi-VN"
    ],
    fallbackLocales: [],
    enabled: true
  },
  id: {
    id: 33,
    code: "id",
    englishName: "Indonesian",
    nativeName: "Bahasa Indonesia",
    textDirection: "ltr",
    aliases: [
      "id-ID"
    ],
    fallbackLocales: [],
    enabled: true
  },
  ms: {
    id: 34,
    code: "ms",
    englishName: "Malay",
    nativeName: "Bahasa Melayu",
    textDirection: "ltr",
    aliases: [
      "ms-MY"
    ],
    fallbackLocales: [],
    enabled: true
  },
  fil: {
    id: 35,
    code: "fil",
    englishName: "Filipino",
    nativeName: "Filipino",
    textDirection: "ltr",
    aliases: [
      "fil-PH",
      "tl"
    ],
    fallbackLocales: [],
    enabled: true
  },
  he: {
    id: 36,
    code: "he",
    englishName: "Hebrew",
    nativeName: "עברית",
    textDirection: "rtl",
    aliases: [
      "he-IL",
      "iw"
    ],
    fallbackLocales: [],
    enabled: true
  },
  fa: {
    id: 37,
    code: "fa",
    englishName: "Persian",
    nativeName: "فارسی",
    textDirection: "rtl",
    aliases: [
      "fa-IR"
    ],
    fallbackLocales: [],
    enabled: true
  },
  tr: {
    id: 38,
    code: "tr",
    englishName: "Turkish",
    nativeName: "Türkçe",
    textDirection: "ltr",
    aliases: [
      "tr-TR"
    ],
    fallbackLocales: [],
    enabled: true
  },
  el: {
    id: 39,
    code: "el",
    englishName: "Greek",
    nativeName: "Ελληνικά",
    textDirection: "ltr",
    aliases: [
      "el-GR"
    ],
    fallbackLocales: [],
    enabled: true
  },
  la: {
    id: 40,
    code: "la",
    englishName: "Latin",
    nativeName: "Latina",
    textDirection: "ltr",
    aliases: [],
    fallbackLocales: [],
    enabled: true
  }
};

export const SUPPORTED_LOCALES = Object.keys(LANGUAGE_TABLE) as LocaleCode[];

function normalizeLocaleInput(locale: LocaleCode): string {
  return String(locale).trim();
}

export function normalizeLocaleCode(locale: LocaleCode): LocaleCode {
  const rawLocale = normalizeLocaleInput(locale);
  const normalizedInput = rawLocale.toLowerCase();

  for (const [code, definition] of Object.entries(LANGUAGE_TABLE)) {
    if (code.toLowerCase() === normalizedInput) {
      return code;
    }

    for (const alias of definition.aliases) {
      if (String(alias).toLowerCase() === normalizedInput) {
        return code;
      }
    }
  }

  return rawLocale;
}

export function isKnownLocale(locale: LocaleCode): boolean {
  const normalized = normalizeLocaleCode(locale);
  return normalized in LANGUAGE_TABLE;
}

export function getLanguageDefinition(locale: LocaleCode): LanguageDefinition | null {
  const normalized = normalizeLocaleCode(locale);
  return LANGUAGE_TABLE[normalized] ?? null;
}

export function listEnabledLanguages(): LanguageDefinition[] {
  return Object.values(LANGUAGE_TABLE)
    .filter((item) => item.enabled)
    .sort((left, right) => left.id - right.id);
}

export function getDefaultLanguageDefinition(): LanguageDefinition {
  return LANGUAGE_TABLE[DEFAULT_LOCALE];
}

export function fromLocaleCode(locale: LocaleCode): LanguageDefinition {
  const definition = getLanguageDefinition(locale);
  return definition ?? getDefaultLanguageDefinition();
}

export function buildLanguageSystemPrompt(locale: LocaleCode): string {
  const definition = fromLocaleCode(locale);
  return `Reply strictly in ${definition.englishName} (${definition.code}).`;
}

export function toLanguageOptionPayload(locale: LocaleCode): LanguageOptionPayload {
  const definition = fromLocaleCode(locale);
  return {
    id: definition.id,
    code: definition.code,
    label: definition.englishName,
    nativeLabel: definition.nativeName
  };
}

export function buildLocaleFallbackChain(
  requestedLocale: LocaleCode,
  packageDefaultLocale: LocaleCode,
  availableLocales: readonly LocaleCode[] = []
): LocaleCode[] {
  const normalizedRequested = normalizeLocaleCode(requestedLocale);
  const normalizedDefault = normalizeLocaleCode(packageDefaultLocale);
  const normalizedAvailable = availableLocales.map((locale) => normalizeLocaleCode(locale));
  const availableSet = new Set(normalizedAvailable);
  const requestedDefinition = getLanguageDefinition(normalizedRequested);
  const defaultDefinition = getLanguageDefinition(normalizedDefault);

  const chainCandidates = [
    normalizedRequested,
    ...(requestedDefinition?.fallbackLocales.map((locale) => normalizeLocaleCode(locale)) ?? []),
    normalizedDefault,
    ...(defaultDefinition?.fallbackLocales.map((locale) => normalizeLocaleCode(locale)) ?? [])
  ];

  const result: LocaleCode[] = [];
  const seen = new Set<string>();

  for (const candidate of chainCandidates) {
    const normalizedCandidate = normalizeLocaleCode(candidate);
    if (seen.has(normalizedCandidate)) {
      continue;
    }

    const isAllowedByPackage =
      availableSet.size === 0 ||
      availableSet.has(normalizedCandidate) ||
      normalizedCandidate === normalizedDefault;

    if (!isAllowedByPackage) {
      continue;
    }

    seen.add(normalizedCandidate);
    result.push(normalizedCandidate);
  }

  if (result.length === 0) {
    result.push(normalizedDefault);
  }

  return result;
}
