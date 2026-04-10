import { randomUUID } from "node:crypto";

import type {
  EndingAdjudication,
  Message
} from "../../../../packages/shared-types/src/index.ts";

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

function matchEndingKeyword(playerInput: string): "suicide" | "escape" | "truth" | null {
  const normalized = playerInput.toLowerCase();

  if (
    normalized.includes("自杀") ||
    normalized.includes("开枪打自己") ||
    normalized.includes("shoot myself") ||
    normalized.includes("kill myself") ||
    normalized.includes("suicide")
  ) {
    return "suicide";
  }

  if (
    normalized.includes("离开") ||
    normalized.includes("逃离") ||
    normalized.includes("逃走") ||
    normalized.includes("leave") ||
    normalized.includes("escape")
  ) {
    return "escape";
  }

  if (
    normalized.includes("真相") ||
    normalized.includes("录像带") ||
    normalized.includes("录影带") ||
    normalized.includes("truth") ||
    normalized.includes("tape")
  ) {
    return "truth";
  }

  return null;
}

function buildMockEndingAdjudication(
  playerInput: string,
  locale: string,
  round: number
): EndingAdjudication | null {
  const matchedEnding = matchEndingKeyword(playerInput);
  if (!matchedEnding) {
    return null;
  }

  if (matchedEnding === "suicide") {
    return {
      isGameOver: true,
      adjudicationSource: "mock",
      endingState: {
        endingId: "mock_bad_end_blood_echo",
        endingType: "emergent",
        title: isEnglishLocale(locale) ? "Blood Echo" : "血色回声",
        summary: isEnglishLocale(locale)
          ? "The player turns the weapon on themselves before the truth can fully surface. The night ends in a violent, self-inflicted silence."
          : "你在真相彻底浮现之前将枪口转向了自己。夜晚被一声短促而自毁的回响封住，调查也在这里中断。",
        confirmedAtRound: round
      }
    };
  }

  if (matchedEnding === "escape") {
    return {
      isGameOver: true,
      adjudicationSource: "mock",
      endingState: {
        endingId: "mock_end_walk_away",
        endingType: "preset",
        title: isEnglishLocale(locale) ? "Walk Away" : "转身离场",
        summary: isEnglishLocale(locale)
          ? "You abandon the investigation and choose survival over clarity. Whatever remains in the tapes is left behind at the lakeside."
          : "你放弃继续深究，把求生与离开放在了真相之前。湖边剩下的秘密，也就此被遗留在磁带和夜色里。",
        confirmedAtRound: round
      }
    };
  }

  return {
    isGameOver: true,
    adjudicationSource: "mock",
    endingState: {
      endingId: "mock_hidden_end_last_tape",
      endingType: "hidden",
      title: isEnglishLocale(locale) ? "The Last Tape" : "最后一盘带子",
      summary: isEnglishLocale(locale)
        ? "You pull the final truth out of the tape itself. The mystery resolves not through escape, but through finally hearing what the fire tried to erase."
        : "你把最后的真相直接从磁带里拽了出来。谜团不是通过逃离结束，而是通过听见那场火想抹掉的声音而终结。",
      confirmedAtRound: round
    }
  };
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

export function buildMockTurnOutcome(
  playerInput: string,
  locale: string,
  round: number,
  conversationContext: string
): {
  text: string;
  adjudication: EndingAdjudication | null;
} {
  const cleanedInput = playerInput.replace(/\s+/g, " ").trim();
  const contextSummary = summarizeConversationContext(conversationContext, locale);
  const adjudication = buildMockEndingAdjudication(playerInput, locale, round);

  if (adjudication?.isGameOver && adjudication.endingState) {
    if (isEnglishLocale(locale)) {
      return {
        text: [
          `[Mock GM] Turn ${round} resolves into an ending.`,
          `You chose: ${cleanedInput}`,
          `Ending unlocked: ${adjudication.endingState.title}`,
          adjudication.endingState.summary,
          contextSummary
        ].join("\n\n"),
        adjudication
      };
    }

    return {
      text: [
        `【Mock 主持】第 ${round} 轮行动导向了一个结局。`,
        `你的选择是：${cleanedInput}`,
        `已解锁结局：${adjudication.endingState.title}`,
        adjudication.endingState.summary,
        contextSummary
      ].join("\n\n"),
      adjudication
    };
  }

  if (isEnglishLocale(locale)) {
    return {
      text: [
        `[Mock GM] Turn ${round} received.`,
        `You attempted: ${cleanedInput}`,
        contextSummary,
        "MVP mock processing keeps the experience conversation-first and returns a placeholder narration."
      ].join("\n\n"),
      adjudication: null
    };
  }

  return {
    text: [
      `【Mock 主持】已收到第 ${round} 轮行动。`,
      `你的输入是：${cleanedInput}`,
      contextSummary,
      "当前 MVP 的 mock 处理会优先保留对话链路，并在命中预设关键词时返回最小结局裁定。"
    ].join("\n\n"),
    adjudication: null
  };
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
