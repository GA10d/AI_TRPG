import type {
  Message,
  PersistedComicProject,
  SaveBundle
} from "../../../../packages/shared-types/src/index.ts";
import { normalizeComicGenerationInterval } from "../comicSchedule.ts";

type ExportParticipantMap = Map<string, string>;

export type CombinedComicExportSegment = {
  key: string;
  title: string;
  subtitle: string;
  roundStart: number;
  roundEnd: number;
  comicPageNumber: number | null;
  comicPageCreatedAt: string | null;
  messages: Message[];
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function clipText(value: string, limit = 220): string {
  const text = normalizeWhitespace(value);
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function inferMessageChannel(message: Message): Message["channel"] {
  if (message.channel) {
    return message.channel;
  }

  if (message.visibility === "system" || message.kind === "system") {
    return "system";
  }

  if (message.visibility === "private" || message.kind === "private_chat") {
    return "private_chat";
  }

  return "public_story";
}

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((left, right) => {
    if (left.round !== right.round) {
      return left.round - right.round;
    }

    const leftTime = left.createdAt || "";
    const rightTime = right.createdAt || "";
    if (leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime);
    }

    return left.id.localeCompare(right.id);
  });
}

function buildParticipantMap(saveBundle: SaveBundle): ExportParticipantMap {
  return new Map(
    saveBundle.session.participants.map((participant) => [participant.id, participant.displayName])
  );
}

function getParticipantName(
  participantMap: ExportParticipantMap,
  participantId: string | null | undefined
): string {
  if (!participantId) {
    return "Unknown";
  }

  return participantMap.get(participantId) ?? participantId;
}

function appendPublicStorySection(
  lines: string[],
  messages: Message[],
  participantMap: ExportParticipantMap
): void {
  const publicMessages = sortMessages(messages).filter(
    (message) => inferMessageChannel(message) === "public_story"
  );
  if (publicMessages.length === 0) {
    return;
  }

  lines.push("=== 公共剧情记录 ===", "");
  let currentRound: number | null = null;

  for (const message of publicMessages) {
    if (currentRound !== message.round) {
      currentRound = message.round;
      lines.push(`--- Round ${currentRound} ---`, "");
    }

    const speaker = getParticipantName(participantMap, message.senderId);
    const content = normalizeWhitespace(message.content);
    if (!content) {
      continue;
    }

    lines.push(`[${speaker}]`);
    lines.push(content);
    lines.push("");
  }
}

function appendPrivateChatSection(
  lines: string[],
  messages: Message[],
  participantMap: ExportParticipantMap
): void {
  const privateMessages = sortMessages(messages).filter(
    (message) => inferMessageChannel(message) === "private_chat"
  );
  if (privateMessages.length === 0) {
    return;
  }

  lines.push("=== 私聊记录 ===", "");

  for (const message of privateMessages) {
    const sender = getParticipantName(participantMap, message.senderId);
    const recipients =
      message.recipientIds
        .map((recipientId) => getParticipantName(participantMap, recipientId))
        .join(", ") || "Unknown";
    const content = normalizeWhitespace(message.content);
    if (!content) {
      continue;
    }

    lines.push(`[Round ${message.round}] ${sender} -> ${recipients}`);
    lines.push(content);
    lines.push("");
  }
}

function appendCurrentDraftSection(lines: string[], saveBundle: SaveBundle): void {
  const roundInputState = saveBundle.session.gameState.roundInputState;
  if (!roundInputState?.drafts?.length) {
    return;
  }

  lines.push("=== 当前未提交草稿 ===", "");
  lines.push(`轮次: ${roundInputState.round}`);
  lines.push(`阶段: ${roundInputState.phase}`);
  lines.push("");

  for (const draft of roundInputState.drafts) {
    const content = normalizeWhitespace(draft.content);
    if (!content) {
      continue;
    }

    lines.push(`[${draft.displayName || draft.participantId || "Unknown"}]`);
    lines.push(content);
    lines.push("");
  }
}

function appendMemorySection(lines: string[], saveBundle: SaveBundle): void {
  const memory = saveBundle.memory;
  if (!memory) {
    return;
  }

  const activeFacts = memory.facts.filter((fact) => fact.status === "active");
  const openLoops = memory.openLoops.filter((loop) => loop.status === "open");
  const episodeSummaries = memory.episodeSummaries ?? [];

  if (episodeSummaries.length === 0 && activeFacts.length === 0 && openLoops.length === 0) {
    return;
  }

  lines.push("=== 记忆附录 ===", "");

  if (episodeSummaries.length > 0) {
    lines.push("-- Episode Summaries --", "");
    for (const episode of episodeSummaries) {
      lines.push(episode.title || "Untitled");
      lines.push(normalizeWhitespace(episode.summary) || "(empty)");
      lines.push("");
    }
  }

  if (activeFacts.length > 0) {
    lines.push("-- Active Facts --", "");
    for (const fact of activeFacts) {
      lines.push(`- [${fact.kind}] ${clipText(fact.text)}`);
    }
    lines.push("");
  }

  if (openLoops.length > 0) {
    lines.push("-- Open Loops --", "");
    for (const loop of openLoops) {
      lines.push(`- ${normalizeWhitespace(loop.title) || "Untitled"}`);
      const summary = clipText(loop.summary);
      if (summary) {
        lines.push(`  ${summary}`);
      }
    }
    lines.push("");
  }
}

export function buildSaveBundleTextExport(
  saveBundle: SaveBundle,
  sourceLabel: string
): string {
  const participantMap = buildParticipantMap(saveBundle);
  const contentSummary = saveBundle.contentSummary;
  const session = saveBundle.session;
  const lines: string[] = [
    "AI TRPG 存档文本导出",
    "",
    `源文件: ${sourceLabel}`,
    `导出时间: ${formatTimestamp(new Date().toISOString())}`,
    "",
    "=== 会话信息 ===",
    `规则: ${contentSummary?.ruleTitle || session.ruleId || "unknown"}`,
    `剧本: ${contentSummary?.storyTitle || session.storyId || "unknown"}`,
    `状态: ${session.status || "unknown"}`,
    `游戏模式: ${session.playMode || "unknown"}`,
    `模型入口: ${session.modelAccessMode || "unknown"}`,
    `模型档案: ${session.settings.modelProfileId || "unknown"}`,
    `当前回合: ${session.currentRound}`,
    `创建时间: ${formatTimestamp(session.createdAt)}`,
    `最后更新时间: ${formatTimestamp(session.updatedAt)}`,
    `存档时间: ${formatTimestamp(saveBundle.savedAt)}`,
    "",
    "=== 参与者 ==="
  ];

  for (const participant of session.participants) {
    lines.push(`- ${participant.displayName || participant.id}`);
  }

  lines.push("");

  const characterMessages = sortMessages(saveBundle.messages).filter(
    (message) =>
      message.visibility === "gm_only" &&
      Array.isArray(message.tags) &&
      message.tags.includes("character_concept")
  );
  if (characterMessages.length > 0) {
    lines.push("=== 角色设定 ===", "");
    for (const message of characterMessages) {
      const content = normalizeWhitespace(message.content);
      if (content) {
        lines.push(content, "");
      }
    }
  }

  appendPublicStorySection(lines, saveBundle.messages, participantMap);
  appendPrivateChatSection(lines, saveBundle.messages, participantMap);
  appendCurrentDraftSection(lines, saveBundle);
  appendMemorySection(lines, saveBundle);

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function isComicRelevantPublicMessage(message: Message): boolean {
  if (inferMessageChannel(message) !== "public_story") {
    return false;
  }

  return (
    message.kind === "player_input" ||
    message.kind === "gm_narration" ||
    message.kind === "gm_dialogue"
  );
}

function buildCombinedSegmentTitle(roundStart: number, roundEnd: number): string {
  if (roundStart === 0 && roundEnd === 0) {
    return "开局";
  }

  if (roundStart === 0) {
    return "开局与第 1 轮";
  }

  if (roundStart === roundEnd) {
    return `第 ${roundStart} 轮`;
  }

  return `第 ${roundStart}-${roundEnd} 轮`;
}

function buildCombinedSegmentSubtitle(
  roundStart: number,
  roundEnd: number,
  comicPageNumber: number | null
): string {
  const textScope =
    roundStart === 0 && roundEnd === 0
      ? "包含开场文本。"
      : roundStart === 0
      ? "包含开场文本与第 1 轮公共剧情。"
      : roundStart === roundEnd
        ? `包含第 ${roundStart} 轮公共剧情。`
        : `包含第 ${roundStart} 到第 ${roundEnd} 轮公共剧情。`;

  if (comicPageNumber === null) {
    return `${textScope} 当前没有对应漫画页。`;
  }

  return `${textScope} 对应漫画页：第 ${comicPageNumber} 张。`;
}

export function buildCombinedComicExportSegments(
  saveBundle: SaveBundle,
  comicProject: PersistedComicProject | null
): CombinedComicExportSegment[] {
  const relevantMessages = sortMessages(saveBundle.messages).filter(isComicRelevantPublicMessage);
  const maxRound = relevantMessages.reduce(
    (current, message) => Math.max(current, message.round),
    saveBundle.session.currentRound
  );
  const pagesByNumber = new Map((comicProject?.pages ?? []).map((page) => [page.pageNumber, page]));
  const segments: CombinedComicExportSegment[] = [];

  const openingPage = pagesByNumber.get(1) ?? null;
  const openingRoundEnd = maxRound > 0 ? 1 : 0;
  segments.push({
    key: "segment_opening",
    title: buildCombinedSegmentTitle(0, openingRoundEnd),
    subtitle: buildCombinedSegmentSubtitle(0, openingRoundEnd, openingPage?.pageNumber ?? null),
    roundStart: 0,
    roundEnd: openingRoundEnd,
    comicPageNumber: openingPage?.pageNumber ?? null,
    comicPageCreatedAt: openingPage?.createdAt ?? null,
    messages: relevantMessages.filter((message) => message.round >= 0 && message.round <= 1)
  });

  if (maxRound < 2) {
    return segments;
  }

  const comicGenerationInterval = normalizeComicGenerationInterval(
    saveBundle.session.settings.comicGenerationInterval ??
      saveBundle.runtimeConfig?.comicGenerationInterval
  );

  for (
    let roundStart = 2;
    roundStart <= maxRound;
    roundStart += comicGenerationInterval
  ) {
    const roundEnd = Math.min(roundStart + comicGenerationInterval - 1, maxRound);
    const comicPageNumber =
      2 + Math.floor((roundStart - 2) / comicGenerationInterval);
    const comicPage = pagesByNumber.get(comicPageNumber) ?? null;

    segments.push({
      key: `segment_${roundStart}_${roundEnd}`,
      title: buildCombinedSegmentTitle(roundStart, roundEnd),
      subtitle: buildCombinedSegmentSubtitle(roundStart, roundEnd, comicPage?.pageNumber ?? null),
      roundStart,
      roundEnd,
      comicPageNumber: comicPage?.pageNumber ?? null,
      comicPageCreatedAt: comicPage?.createdAt ?? null,
      messages: relevantMessages.filter(
        (message) => message.round >= roundStart && message.round <= roundEnd
      )
    });
  }

  return segments;
}

export function buildCombinedSegmentMessageLines(
  saveBundle: SaveBundle,
  segment: CombinedComicExportSegment
): string[] {
  const participantMap = buildParticipantMap(saveBundle);
  const lines: string[] = [];
  let currentRound: number | null = null;

  for (const message of segment.messages) {
    if (currentRound !== message.round) {
      currentRound = message.round;
      lines.push(message.round === 0 ? "【开场】" : `【Round ${message.round}】`);
    }

    const speaker = getParticipantName(participantMap, message.senderId);
    const content = normalizeWhitespace(message.content);
    if (!content) {
      continue;
    }

    lines.push(`${speaker}:`);
    lines.push(content);
    lines.push("");
  }

  if (lines.length === 0) {
    lines.push("这一段还没有可导出的公共剧情文本。");
  }

  return lines;
}
