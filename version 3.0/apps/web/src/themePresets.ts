export const FRONTEND_THEME_PRESETS = [
  "red_black_white",
  "blue_white_pink"
] as const;

export type FrontendThemePreset = (typeof FRONTEND_THEME_PRESETS)[number];

export const DEFAULT_FRONTEND_THEME: FrontendThemePreset = "red_black_white";
