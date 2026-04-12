import { zhCn, type UiText } from "./locales/index.tsx";

export type OpeningPreviewDeliveryMode = "stream" | "complete";

export function getOpeningPreviewDeliveryOptions(
  text: UiText = zhCn
): Array<{
  value: OpeningPreviewDeliveryMode;
  label: string;
  description: string;
}> {
  return [...text.options.openingPreviewDelivery];
}

export const OPENING_PREVIEW_DELIVERY_OPTIONS = getOpeningPreviewDeliveryOptions();
