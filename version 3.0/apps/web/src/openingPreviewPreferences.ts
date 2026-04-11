export type OpeningPreviewDeliveryMode = "stream" | "complete";

export const OPENING_PREVIEW_DELIVERY_OPTIONS: Array<{
  value: OpeningPreviewDeliveryMode;
  label: string;
  description: string;
}> = [
  {
    value: "stream",
    label: "偏好流式",
    description: "边生成边显示，更快看到开场内容。"
  },
  {
    value: "complete",
    label: "完整传输",
    description: "等待全文完成后再一次性渲染。"
  }
];
