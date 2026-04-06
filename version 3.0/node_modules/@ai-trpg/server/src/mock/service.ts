import { randomUUID } from "node:crypto";

import type { Message } from "../../../../packages/shared-types/src/index.ts";

function isEnglishLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("en");
}

export function buildMockOpeningText(
  storyTitle: string,
  storyIntro: string,
  sceneId: string,
  locale: string
): string {
  const cleanedIntro = storyIntro.replace(/\s+/g, " ").trim();
  const preview = cleanedIntro.slice(0, 240);

  if (isEnglishLocale(locale)) {
    return [
      `[Mock GM] Welcome to "${storyTitle}".`,
      preview,
      `Current opening scene: ${sceneId}.`,
      "This is a Phase 1 mock opening used to validate the session pipeline."
    ].join("\n\n");
  }

  return [
    `【Mock 主持】欢迎进入《${storyTitle}》。`,
    preview,
    `当前开场场景：${sceneId}。`,
    "这是一段 Phase 1 的假开场文本，用来验证会话创建、内容加载和前端链路。"
  ].join("\n\n");
}

export function buildMockTurnResponse(
  playerInput: string,
  sceneId: string,
  locale: string,
  round: number,
  sceneChanged: boolean
): string {
  const cleanedInput = playerInput.replace(/\s+/g, " ").trim();
  const sceneLine = isEnglishLocale(locale)
    ? sceneChanged
      ? `The scene focus has shifted to ${sceneId}.`
      : `The current scene remains ${sceneId}.`
    : sceneChanged
      ? `当前场景已推进到：${sceneId}。`
      : `当前场景仍然是：${sceneId}。`;

  if (isEnglishLocale(locale)) {
    return [
      `[Mock GM] Turn ${round} received.`,
      `You attempted: ${cleanedInput}`,
      sceneLine,
      "Phase 1 mock processing: the system records your action, keeps the scene stable, and returns a placeholder narration."
    ].join("\n\n");
  }

  return [
    `【Mock 主持】已收到第 ${round} 轮行动。`,
    `你的输入是：${cleanedInput}`,
    sceneLine,
    "这是 Phase 1 的假回合处理结果：系统会先记录玩家输入，暂时不推进复杂规则，只返回一段占位叙事。"
  ].join("\n\n");
}

export function buildSystemCreatedMessage(
  playerParticipantId: string,
  storyTitle: string,
  locale: string,
  timestamp: string
): Message {
  return {
    id: `msg_${randomUUID()}`,
    round: 0,
    createdAt: timestamp,
    senderId: "system",
    recipientIds: [playerParticipantId],
    visibility: "system",
    kind: "system",
    content: `Session created for ${storyTitle} (${locale}).`,
    tags: [
      "session_created"
    ]
  };
}
