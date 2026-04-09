import { randomUUID } from "node:crypto";

import type { Message } from "../../../../packages/shared-types/src/index.ts";

function isEnglishLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("en");
}

function summarizeConversationContext(
  conversationContext: string,
  locale: string
): string {
  const compact = conversationContext.replace(/\s+/g, " ").trim();
  if (!compact) {
    return isEnglishLocale(locale)
      ? "No previous conversation context was supplied."
      : "当前还没有可引用的上一轮对话上下文。";
  }

  const preview = compact.slice(0, 180);
  return isEnglishLocale(locale)
    ? `Recent context: ${preview}`
    : `最近对话：${preview}`;
}

export function buildMockOpeningText(
  storyTitle: string,
  storyIntro: string,
  locale: string
): string {
  const cleanedIntro = storyIntro.replace(/\s+/g, " ").trim();
  const preview = cleanedIntro.slice(0, 240);

  if (isEnglishLocale(locale)) {
    return [
      `[Mock GM] Welcome to "${storyTitle}".`,
      preview,
      "This is a lightweight MVP mock opening used to validate the session pipeline."
    ].join("\n\n");
  }

  return [
    `【Mock 主持】欢迎进入《${storyTitle}》。`,
    preview,
    "这是当前 MVP 的轻量 mock 开场，用来验证会话创建、消息流和前端链路。"
  ].join("\n\n");
}

export function buildMockTurnResponse(
  playerInput: string,
  locale: string,
  round: number,
  conversationContext: string
): string {
  const cleanedInput = playerInput.replace(/\s+/g, " ").trim();
  const contextSummary = summarizeConversationContext(conversationContext, locale);

  if (isEnglishLocale(locale)) {
    return [
      `[Mock GM] Turn ${round} received.`,
      `You attempted: ${cleanedInput}`,
      contextSummary,
      "MVP mock processing keeps the experience conversation-first and returns a placeholder narration."
    ].join("\n\n");
  }

  return [
    `【Mock 主持】已收到第 ${round} 轮行动。`,
    `你的输入是：${cleanedInput}`,
    contextSummary,
    "当前 MVP 的 mock 处理会优先保留对话链路，只返回一段占位叙事，不再推进复杂状态树。"
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
