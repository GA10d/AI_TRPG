import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren
} from "react";

import { enUs } from "./en_us.ts";
import { jaJp } from "./ja_jp.ts";
import {
  DEFAULT_UI_LOCALE,
  UI_LOCALE_OPTIONS,
  type UiLocaleCode,
  type UiText
} from "./types.ts";
import { zhCn } from "./zh_cn.ts";

export function resolveUiLocaleCode(
  locale: string | undefined | null
): UiLocaleCode {
  const normalized = (locale ?? "").trim().toLowerCase();

  if (!normalized) {
    return DEFAULT_UI_LOCALE;
  }

  switch (normalized) {
    case "en_us":
    case "en-us":
      return "en_us";
    case "ja_jp":
    case "ja-jp":
      return "ja_jp";
    case "zh_cn":
    case "zh-cn":
      return "zh_cn";
    default:
      return "en_us";
  }
}

export function getUiTextByLocale(locale: string | undefined | null): UiText {
  switch (resolveUiLocaleCode(locale)) {
    case "en_us":
      return enUs;
    case "ja_jp":
      return jaJp;
    case "zh_cn":
    default:
      return zhCn;
  }
}

const UiTextContext = createContext<UiText>(zhCn);

export function UiTextProvider(
  props: PropsWithChildren<{ locale: string | undefined | null }>
) {
  const { locale, children } = props;
  const value = useMemo(() => getUiTextByLocale(locale), [locale]);

  return <UiTextContext.Provider value={value}>{children}</UiTextContext.Provider>;
}

export function useUiText(): UiText {
  return useContext(UiTextContext);
}

export { DEFAULT_UI_LOCALE, UI_LOCALE_OPTIONS, zhCn, enUs, jaJp };
export type { UiLocaleCode, UiText };
