import type { ZhCnText } from "./zh_cn.ts";

type WidenLocalePrimitive<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T;

export type DeepLocaleText<T> = T extends (...args: infer Args) => unknown
  ? (...args: Args) => string
  : T extends readonly (infer Item)[]
    ? readonly DeepLocaleText<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepLocaleText<T[Key]> }
      : WidenLocalePrimitive<T>;

export type UiText = DeepLocaleText<ZhCnText>;
export type UiLocaleCode = "zh_cn" | "en_us" | "ja_jp";

export const DEFAULT_UI_LOCALE: UiLocaleCode = "zh_cn";

export const UI_LOCALE_OPTIONS = [
  { value: "zh_cn", label: "简体中文" },
  { value: "en_us", label: "English" },
  { value: "ja_jp", label: "日本語" }
] as const satisfies ReadonlyArray<{
  value: UiLocaleCode;
  label: string;
}>;
