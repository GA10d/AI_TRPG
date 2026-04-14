import { randomUUID } from "node:crypto";

import type {
  Message,
  Participant,
  RoundDraft,
  Session,
  SessionContextPackSection,
  SessionEntityMemory,
  SessionEpisodeSummary,
  SessionFact,
  SessionFactKind,
  SessionMemory,
  SessionMemoryDelta,
  SessionMemoryScope,
  SessionOpenLoop,
  SessionRuntimeContextPack,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";
import { getModelGateway } from "../model_gateway/index.ts";
import {
  buildStructuredAssistantSystemPrompt,
  loadStructuredTaskOutputSchema
} from "../single_agent/service.ts";
import { resolveNarratorRuntimeSelection } from "./store.ts";
import type { SessionRuntimeConfig } from "./store.ts";

const SESSION_MEMORY_VERSION = 1;
const MAX_EPISODE_SUMMARIES = 8;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function clampUnitNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeTextKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function limitText(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
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

function normalizeScope(
  value: unknown,
  fallback: SessionMemoryScope
): SessionMemoryScope {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const rawVisibility =
    "visibility" in value ? normalizeString((value as { visibility?: unknown }).visibility) : "";
  const visibility =
    rawVisibility === "private" || rawVisibility === "gm_only" || rawVisibility === "public"
      ? rawVisibility
      : fallback.visibility;
  const participantId =
    "participantId" in value
      ? normalizeString((value as { participantId?: unknown }).participantId) || null
      : fallback.participantId ?? null;

  return {
    visibility,
    participantId: visibility === "private" ? participantId : null
  };
}

function normalizeScopeKey(scope: SessionMemoryScope): string {
  return `${scope.visibility}:${scope.participantId ?? "*"}`;
}

function guessFactKind(text: string, message: Message): SessionFactKind {
  const lowered = text.toLowerCase();
  if (/[?？]/u.test(text) || /\b(who|what|where|why|how)\b/u.test(lowered)) {
    return "question";
  }

  if (/(clue|evidence|hint|线索|证据|痕迹|发现)/u.test(text)) {
    return "clue";
  }

  if (/(goal|need to|must|plan|目标|必须|打算|准备)/u.test(text)) {
    return "goal";
  }

  if (/(location|room|house|forest|村|屋|房间|山|寺|地点)/u.test(text)) {
    return "location";
  }

  if (/(item|key|knife|book|artifact|钥匙|刀|书|遗物|道具)/u.test(text)) {
    return "item";
  }

  if (message.kind === "private_chat") {
    return "relationship";
  }

  if (message.kind === "gm_narration" || message.kind === "gm_dialogue") {
    return "state_change";
  }

  return "status";
}

function findParticipant(session: Session, participantId: string | null | undefined): Participant | null {
  if (!participantId) {
    return null;
  }

  return session.participants.find((item) => item.id === participantId) ?? null;
}

function buildPrivateChatThreadId(localHumanParticipantId: string, targetParticipantId: string): string {
  return ["private_chat", localHumanParticipantId, targetParticipantId].join(":");
}

function inferScopeFromMessage(session: Session, message: Message): SessionMemoryScope | null {
  if (message.visibility === "public" || inferMessageChannel(message) === "public_story") {
    return {
      visibility: "public",
      participantId: null
    };
  }

  if (message.visibility === "gm_only") {
    return {
      visibility: "gm_only",
      participantId: null
    };
  }

  if (inferMessageChannel(message) === "private_chat" || message.visibility === "private") {
    const companionId =
      message.relatedParticipantId ??
      session.companionParticipantIds?.find((candidate) => message.recipientIds.includes(candidate)) ??
      session.companionParticipantIds?.find((candidate) => candidate === message.senderId) ??
      null;

    if (!companionId) {
      return null;
    }

    return {
      visibility: "private",
      participantId: companionId
    };
  }

  return null;
}

function findLocalHumanParticipantId(session: Session): string | null {
  return session.localHumanParticipantId ?? session.playerParticipantId ?? null;
}

function buildSpeakerLabel(session: Session, message: Message): string {
  if (message.kind === "gm_narration" || message.kind === "gm_dialogue") {
    return "Narrator";
  }

  return findParticipant(session, message.senderId)?.displayName ?? "Unknown";
}

function buildPublicMessageLine(session: Session, message: Message): string {
  return `[R${message.round}] ${buildSpeakerLabel(session, message)}: ${message.content}`;
}

function buildPrivateMessageLine(session: Session, message: Message): string {
  return `${buildSpeakerLabel(session, message)}: ${message.content}`;
}

export function createEmptySessionMemory(timestamp: string = nowIso()): SessionMemory {
  return {
    version: SESSION_MEMORY_VERSION,
    facts: [],
    openLoops: [],
    episodeSummaries: [],
    entities: [],
    lastProcessedMessageId: null,
    updatedAt: timestamp
  };
}

export function getSessionMemory(snapshot: SessionSnapshot): SessionMemory {
  return snapshot.memory ?? createEmptySessionMemory(snapshot.session.updatedAt);
}

function buildMemoryOverview(memory: SessionMemory): string {
  const factLines = memory.facts
    .filter((item) => item.status === "active")
    .slice(-8)
    .map((fact) => `${fact.id} [${fact.kind}] (${normalizeScopeKey(fact.scope)}): ${fact.text}`);
  const openLoopLines = memory.openLoops
    .filter((item) => item.status === "open")
    .slice(-6)
    .map((loop) => `${loop.id} (${normalizeScopeKey(loop.scope)}): ${loop.title} - ${loop.summary}`);
  const entityLines = memory.entities
    .slice(-6)
    .map((entity) => `${entity.id} (${normalizeScopeKey(entity.scope)}): ${entity.name} - ${entity.summary}`);

  return [
    "Active facts:",
    ...(factLines.length ? factLines : ["None."]),
    "",
    "Open loops:",
    ...(openLoopLines.length ? openLoopLines : ["None."]),
    "",
    "Tracked entities:",
    ...(entityLines.length ? entityLines : ["None."])
  ].join("\n");
}

function buildStructuredExtractorUserPrompt(input: {
  snapshot: SessionSnapshot;
  memory: SessionMemory;
  newMessages: Message[];
}): string {
  const messageLines = input.newMessages.map((message) => {
    const scope = inferScopeFromMessage(input.snapshot.session, message);
    const sender = buildSpeakerLabel(input.snapshot.session, message);
    return [
      `- id: ${message.id}`,
      `  round: ${message.round}`,
      `  channel: ${inferMessageChannel(message) ?? "unknown"}`,
      `  visibility: ${message.visibility}`,
      `  sender: ${sender}`,
      `  relatedParticipantId: ${message.relatedParticipantId ?? ""}`,
      `  inferredScope: ${scope ? normalizeScopeKey(scope) : "ignore"}`,
      `  content: ${message.content}`
    ].join("\n");
  });

  return [
    `Target language: ${input.snapshot.session.locale}`,
    `Story title: ${input.snapshot.contentSummary.storyTitle}`,
    `Current round: ${input.snapshot.session.currentRound}`,
    "",
    "Current memory overview:",
    buildMemoryOverview(input.memory),
    "",
    "Participants:",
    ...input.snapshot.session.participants.map(
      (participant) => `- ${participant.id}: ${participant.displayName} (${participant.role})`
    ),
    "",
    "Incremental messages to inspect:",
    ...(messageLines.length ? messageLines : ["None."]),
    "",
    "Task:",
    "Return only the durable memory delta implied by these new messages.",
    "Use the provided source message ids exactly.",
    "If a new message clearly resolves an existing open loop or fact from the overview, include its id in the resolved arrays."
  ].join("\n");
}

function buildEpisodeCompressionUserPrompt(input: {
  snapshot: SessionSnapshot;
  messages: Message[];
  memory: SessionMemory;
}): string {
  const publicMessages = input.messages
    .filter((message) => inferMessageChannel(message) === "public_story")
    .map((message) => buildPublicMessageLine(input.snapshot.session, message));
  const openLoops = input.memory.openLoops
    .filter((item) => item.status === "open" && item.scope.visibility !== "private")
    .slice(-6)
    .map((loop) => `${loop.id}: ${loop.title} - ${loop.summary}`);
  const facts = input.memory.facts
    .filter((item) => item.status === "active" && item.scope.visibility !== "private")
    .slice(-8)
    .map((fact) => `${fact.id}: ${fact.text}`);

  return [
    `Target language: ${input.snapshot.session.locale}`,
    `Story title: ${input.snapshot.contentSummary.storyTitle}`,
    "",
    "Recent public messages:",
    ...(publicMessages.length ? publicMessages : ["None."]),
    "",
    "Relevant active facts:",
    ...(facts.length ? facts : ["None."]),
    "",
    "Open loops:",
    ...(openLoops.length ? openLoops : ["None."]),
    "",
    "Task:",
    "Summarize these recent developments into one durable episode summary.",
    "Focus on what changed, what remains unresolved, and what later prompts should remember."
  ].join("\n");
}

function buildHeuristicEntity(
  participant: Participant,
  scope: SessionMemoryScope,
  round: number
): SessionEntityMemory {
  return {
    id: `entity_${participant.id}`,
    scope,
    name: participant.displayName,
    aliases: [],
    summary: `${participant.displayName} is a tracked ${participant.role.replace(/_/gu, " ")} in this session.`,
    relatedFactIds: [],
    tags: [participant.role],
    lastUpdatedRound: round
  };
}

function buildHeuristicMemoryDelta(
  snapshot: SessionSnapshot,
  newMessages: Message[]
): SessionMemoryDelta {
  const facts: SessionFact[] = [];
  const openLoops: SessionOpenLoop[] = [];
  const entities: SessionEntityMemory[] = [];

  for (const message of newMessages) {
    const scope = inferScopeFromMessage(snapshot.session, message);
    if (!scope) {
      continue;
    }

    const compactText = limitText(message.content.replace(/\s+/gu, " "), 220);
    const sender = findParticipant(snapshot.session, message.senderId);
    const entityIds = [
      sender ? `entity_${sender.id}` : "",
      scope.visibility === "private" && scope.participantId ? `entity_${scope.participantId}` : ""
    ].filter(Boolean);

    const factId = `fact_${randomUUID()}`;
    facts.push({
      id: factId,
      kind: guessFactKind(message.content, message),
      scope,
      text:
        message.kind === "private_chat"
          ? `${sender?.displayName ?? "Unknown"} privately says: ${compactText}`
          : compactText,
      entityIds,
      sourceMessageIds: [message.id],
      roundFirstSeen: message.round,
      roundLastSeen: message.round,
      status: "active",
      confidence: message.kind === "gm_narration" ? 0.86 : 0.68,
      priority: message.kind === "gm_narration" ? 0.82 : 0.58,
      tags: message.tags ?? []
    });

    if (
      /[?？]/u.test(message.content) ||
      /(investigate|find out|where|why|who|how|search|look for|调查|查明|寻找|想知道|为什么|谁|如何|真相)/iu.test(
        message.content
      )
    ) {
      const summary = limitText(message.content.replace(/\s+/gu, " "), 180);
      openLoops.push({
        id: `loop_${randomUUID()}`,
        scope,
        title: limitText(summary, 48),
        summary,
        entityIds,
        relatedFactIds: [factId],
        sourceMessageIds: [message.id],
        introducedRound: message.round,
        lastMentionedRound: message.round,
        priority: message.kind === "gm_narration" ? 0.78 : 0.66,
        status: "open",
        tags: message.tags ?? []
      });
    }

    if (sender) {
      entities.push(buildHeuristicEntity(sender, scope, message.round));
    }

    if (scope.visibility === "private" && scope.participantId) {
      const targetParticipant = findParticipant(snapshot.session, scope.participantId);
      if (targetParticipant) {
        entities.push(buildHeuristicEntity(targetParticipant, scope, message.round));
      }
    }
  }

  return {
    newFacts: facts,
    supersededFactIds: [],
    resolvedFactIds: [],
    newOpenLoops: openLoops,
    resolvedOpenLoopIds: [],
    newEntities: entities,
    shouldRefreshEpisodeSummary: newMessages.some(
      (message) => inferMessageChannel(message) === "public_story"
    )
  };
}

function normalizeFact(rawValue: unknown, fallbackScope: SessionMemoryScope): SessionFact | null {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const kind = normalizeString((rawValue as { kind?: unknown }).kind);
  if (
    ![
      "identity",
      "location",
      "relationship",
      "clue",
      "item",
      "goal",
      "state_change",
      "secret",
      "question",
      "status"
    ].includes(kind)
  ) {
    return null;
  }

  const text = normalizeString((rawValue as { text?: unknown }).text);
  if (!text) {
    return null;
  }

  const roundFirstSeen = Number((rawValue as { roundFirstSeen?: unknown }).roundFirstSeen);
  const roundLastSeen = Number((rawValue as { roundLastSeen?: unknown }).roundLastSeen);
  const status = normalizeString((rawValue as { status?: unknown }).status);

  return {
    id: normalizeString((rawValue as { id?: unknown }).id) || `fact_${randomUUID()}`,
    kind: kind as SessionFactKind,
    scope: normalizeScope((rawValue as { scope?: unknown }).scope, fallbackScope),
    text,
    entityIds: normalizeStringArray((rawValue as { entityIds?: unknown }).entityIds),
    sourceMessageIds: normalizeStringArray(
      (rawValue as { sourceMessageIds?: unknown }).sourceMessageIds
    ),
    roundFirstSeen: Number.isFinite(roundFirstSeen) ? roundFirstSeen : 0,
    roundLastSeen: Number.isFinite(roundLastSeen) ? roundLastSeen : 0,
    status:
      status === "superseded" || status === "resolved" || status === "active"
        ? status
        : "active",
    confidence: clampUnitNumber((rawValue as { confidence?: unknown }).confidence, 0.7),
    priority: clampUnitNumber((rawValue as { priority?: unknown }).priority, 0.5),
    tags: normalizeStringArray((rawValue as { tags?: unknown }).tags)
  };
}

function normalizeOpenLoop(
  rawValue: unknown,
  fallbackScope: SessionMemoryScope
): SessionOpenLoop | null {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const title = normalizeString((rawValue as { title?: unknown }).title);
  const summary = normalizeString((rawValue as { summary?: unknown }).summary);
  if (!title || !summary) {
    return null;
  }

  const introducedRound = Number(
    (rawValue as { introducedRound?: unknown }).introducedRound
  );
  const lastMentionedRound = Number(
    (rawValue as { lastMentionedRound?: unknown }).lastMentionedRound
  );
  const status = normalizeString((rawValue as { status?: unknown }).status);

  return {
    id: normalizeString((rawValue as { id?: unknown }).id) || `loop_${randomUUID()}`,
    scope: normalizeScope((rawValue as { scope?: unknown }).scope, fallbackScope),
    title,
    summary,
    entityIds: normalizeStringArray((rawValue as { entityIds?: unknown }).entityIds),
    relatedFactIds: normalizeStringArray(
      (rawValue as { relatedFactIds?: unknown }).relatedFactIds
    ),
    sourceMessageIds: normalizeStringArray(
      (rawValue as { sourceMessageIds?: unknown }).sourceMessageIds
    ),
    introducedRound: Number.isFinite(introducedRound) ? introducedRound : 0,
    lastMentionedRound: Number.isFinite(lastMentionedRound) ? lastMentionedRound : 0,
    priority: clampUnitNumber((rawValue as { priority?: unknown }).priority, 0.5),
    status: status === "resolved" ? "resolved" : "open",
    tags: normalizeStringArray((rawValue as { tags?: unknown }).tags)
  };
}

function normalizeEntity(
  rawValue: unknown,
  fallbackScope: SessionMemoryScope
): SessionEntityMemory | null {
  if (!rawValue || typeof rawValue !== "object") {
    return null;
  }

  const name = normalizeString((rawValue as { name?: unknown }).name);
  if (!name) {
    return null;
  }

  const lastUpdatedRound = Number(
    (rawValue as { lastUpdatedRound?: unknown }).lastUpdatedRound
  );

  return {
    id:
      normalizeString((rawValue as { id?: unknown }).id) ||
      `entity_${name.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "") || randomUUID()}`,
    scope: normalizeScope((rawValue as { scope?: unknown }).scope, fallbackScope),
    name,
    aliases: normalizeStringArray((rawValue as { aliases?: unknown }).aliases),
    summary: normalizeString((rawValue as { summary?: unknown }).summary),
    relatedFactIds: normalizeStringArray(
      (rawValue as { relatedFactIds?: unknown }).relatedFactIds
    ),
    tags: normalizeStringArray((rawValue as { tags?: unknown }).tags),
    lastUpdatedRound: Number.isFinite(lastUpdatedRound) ? lastUpdatedRound : 0
  };
}

function normalizeMemoryDelta(
  rawData: Record<string, unknown>,
  newMessages: Message[]
): SessionMemoryDelta {
  const fallbackScope: SessionMemoryScope =
    (newMessages[0] && {
      visibility:
        newMessages[0].visibility === "gm_only"
          ? "gm_only"
          : newMessages[0].visibility === "private"
            ? "private"
            : "public",
      participantId: newMessages[0].relatedParticipantId ?? null
    }) ||
    {
      visibility: "public",
      participantId: null
    };

  return {
    newFacts: Array.isArray(rawData.newFacts)
      ? rawData.newFacts
          .map((item) => normalizeFact(item, fallbackScope))
          .filter((item): item is SessionFact => item !== null)
      : [],
    supersededFactIds: normalizeStringArray(rawData.supersededFactIds),
    resolvedFactIds: normalizeStringArray(rawData.resolvedFactIds),
    newOpenLoops: Array.isArray(rawData.newOpenLoops)
      ? rawData.newOpenLoops
          .map((item) => normalizeOpenLoop(item, fallbackScope))
          .filter((item): item is SessionOpenLoop => item !== null)
      : [],
    resolvedOpenLoopIds: normalizeStringArray(rawData.resolvedOpenLoopIds),
    newEntities: Array.isArray(rawData.newEntities)
      ? rawData.newEntities
          .map((item) => normalizeEntity(item, fallbackScope))
          .filter((item): item is SessionEntityMemory => item !== null)
      : [],
    shouldRefreshEpisodeSummary: rawData.shouldRefreshEpisodeSummary === true
  };
}

async function extractStructuredMemoryDelta(
  snapshot: SessionSnapshot,
  newMessages: Message[],
  runtimeConfig: SessionRuntimeConfig | null
): Promise<SessionMemoryDelta> {
  if (!newMessages.length) {
    return {
      newFacts: [],
      supersededFactIds: [],
      resolvedFactIds: [],
      newOpenLoops: [],
      resolvedOpenLoopIds: [],
      newEntities: [],
      shouldRefreshEpisodeSummary: false
    };
  }

  if (
    snapshot.session.modelAccessMode !== "mock" &&
    snapshot.session.modelAccessMode !== "server_proxy"
  ) {
    return buildHeuristicMemoryDelta(snapshot, newMessages);
  }

  const modelGateway = getModelGateway(snapshot.session.modelAccessMode);
  const memory = getSessionMemory(snapshot);
  const narratorRuntimeSelection = resolveNarratorRuntimeSelection(
    snapshot.session,
    runtimeConfig
  );

  try {
    const structured = await modelGateway.generateStructuredAssistantOutput({
      accessMode: snapshot.session.modelAccessMode,
      modelProfileId: narratorRuntimeSelection.modelProfileId,
      runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
      locale: snapshot.session.locale,
      systemPrompt: await buildStructuredAssistantSystemPrompt(
        "session_memory_fact_extractor",
        snapshot.session.locale,
        {
          profileId: narratorRuntimeSelection.modelProfileId
        }
      ),
      userPrompt: buildStructuredExtractorUserPrompt({
        snapshot,
        memory,
        newMessages
      }),
      schemaName: "session_memory_fact_extractor",
      outputSchema: await loadStructuredTaskOutputSchema("session_memory_fact_extractor"),
      temperature: 0
    });

    return normalizeMemoryDelta(structured.data, newMessages);
  } catch {
    return buildHeuristicMemoryDelta(snapshot, newMessages);
  }
}

function buildFallbackEpisodeCompression(
  snapshot: SessionSnapshot,
  messages: Message[],
  memory: SessionMemory
): SessionEpisodeSummary | null {
  const publicMessages = messages.filter((message) => inferMessageChannel(message) === "public_story");
  if (!publicMessages.length) {
    return null;
  }

  const summary = publicMessages
    .slice(-4)
    .map((message) => buildPublicMessageLine(snapshot.session, message))
    .join(" ");
  const roundStart = publicMessages[0]?.round ?? snapshot.session.currentRound;
  const roundEnd = publicMessages.at(-1)?.round ?? roundStart;

  return {
    id: `episode_${randomUUID()}`,
    scope: {
      visibility: "public",
      participantId: null
    },
    title: `Rounds ${roundStart}-${roundEnd}`,
    summary: limitText(summary, 420),
    roundStart,
    roundEnd,
    keyFactIds: memory.facts
      .filter((fact) => fact.status === "active" && fact.scope.visibility !== "private")
      .slice(-4)
      .map((fact) => fact.id),
    openLoopIds: memory.openLoops
      .filter((loop) => loop.status === "open" && loop.scope.visibility !== "private")
      .slice(-3)
      .map((loop) => loop.id),
    sourceMessageIds: publicMessages.map((message) => message.id),
    createdAt: nowIso()
  };
}

async function maybeCreateEpisodeSummary(
  snapshot: SessionSnapshot,
  newMessages: Message[],
  memory: SessionMemory,
  runtimeConfig: SessionRuntimeConfig | null,
  shouldRefreshEpisodeSummary: boolean
): Promise<SessionEpisodeSummary | null> {
  const publicMessages = newMessages.filter((message) => inferMessageChannel(message) === "public_story");
  if (!shouldRefreshEpisodeSummary || !publicMessages.length) {
    return null;
  }

  if (
    snapshot.session.modelAccessMode !== "mock" &&
    snapshot.session.modelAccessMode !== "server_proxy"
  ) {
    return buildFallbackEpisodeCompression(snapshot, newMessages, memory);
  }

  const modelGateway = getModelGateway(snapshot.session.modelAccessMode);
  const narratorRuntimeSelection = resolveNarratorRuntimeSelection(
    snapshot.session,
    runtimeConfig
  );
  try {
    const structured = await modelGateway.generateStructuredAssistantOutput({
      accessMode: snapshot.session.modelAccessMode,
      modelProfileId: narratorRuntimeSelection.modelProfileId,
      runtimeModelConfig: narratorRuntimeSelection.runtimeModelConfig,
      locale: snapshot.session.locale,
      systemPrompt: await buildStructuredAssistantSystemPrompt(
        "session_memory_episode_compressor",
        snapshot.session.locale,
        {
          profileId: narratorRuntimeSelection.modelProfileId
        }
      ),
      userPrompt: buildEpisodeCompressionUserPrompt({
        snapshot,
        messages: newMessages,
        memory
      }),
      schemaName: "session_memory_episode_compressor",
      outputSchema: await loadStructuredTaskOutputSchema("session_memory_episode_compressor"),
      temperature: 0
    });

    const roundStart = publicMessages[0]?.round ?? snapshot.session.currentRound;
    const roundEnd = publicMessages.at(-1)?.round ?? roundStart;

    return {
      id: `episode_${randomUUID()}`,
      scope: {
        visibility: "public",
        participantId: null
      },
      title: normalizeString(structured.data.title) || `Rounds ${roundStart}-${roundEnd}`,
      summary: normalizeString(structured.data.summary) || "No episode summary available.",
      roundStart,
      roundEnd,
      keyFactIds: normalizeStringArray(structured.data.keyFactIds),
      openLoopIds: normalizeStringArray(structured.data.openLoopIds),
      sourceMessageIds: publicMessages.map((message) => message.id),
      createdAt: nowIso()
    };
  } catch {
    return buildFallbackEpisodeCompression(snapshot, newMessages, memory);
  }
}

function mergeFact(previousFacts: SessionFact[], nextFact: SessionFact): SessionFact[] {
  const normalizedKey = `${normalizeScopeKey(nextFact.scope)}:${nextFact.kind}:${normalizeTextKey(nextFact.text)}`;
  const existingIndex = previousFacts.findIndex(
    (fact) =>
      `${normalizeScopeKey(fact.scope)}:${fact.kind}:${normalizeTextKey(fact.text)}` === normalizedKey
  );

  if (existingIndex < 0) {
    return [
      ...previousFacts,
      nextFact
    ];
  }

  const existing = previousFacts[existingIndex];
  const merged: SessionFact = {
    ...existing,
    id: existing.id,
    entityIds: Array.from(new Set([
      ...existing.entityIds,
      ...nextFact.entityIds
    ])),
    sourceMessageIds: Array.from(new Set([
      ...existing.sourceMessageIds,
      ...nextFact.sourceMessageIds
    ])),
    roundFirstSeen: Math.min(existing.roundFirstSeen, nextFact.roundFirstSeen),
    roundLastSeen: Math.max(existing.roundLastSeen, nextFact.roundLastSeen),
    status: nextFact.status === "active" ? "active" : existing.status,
    confidence: Math.max(existing.confidence, nextFact.confidence),
    priority: Math.max(existing.priority, nextFact.priority),
    tags: Array.from(new Set([
      ...(existing.tags ?? []),
      ...(nextFact.tags ?? [])
    ]))
  };

  return previousFacts.map((fact, index) => (index === existingIndex ? merged : fact));
}

function mergeOpenLoop(previousOpenLoops: SessionOpenLoop[], nextLoop: SessionOpenLoop): SessionOpenLoop[] {
  const normalizedKey = `${normalizeScopeKey(nextLoop.scope)}:${normalizeTextKey(nextLoop.title)}`;
  const existingIndex = previousOpenLoops.findIndex(
    (loop) => `${normalizeScopeKey(loop.scope)}:${normalizeTextKey(loop.title)}` === normalizedKey
  );

  if (existingIndex < 0) {
    return [
      ...previousOpenLoops,
      nextLoop
    ];
  }

  const existing = previousOpenLoops[existingIndex];
  const merged: SessionOpenLoop = {
    ...existing,
    entityIds: Array.from(new Set([
      ...existing.entityIds,
      ...nextLoop.entityIds
    ])),
    relatedFactIds: Array.from(new Set([
      ...existing.relatedFactIds,
      ...nextLoop.relatedFactIds
    ])),
    sourceMessageIds: Array.from(new Set([
      ...existing.sourceMessageIds,
      ...nextLoop.sourceMessageIds
    ])),
    introducedRound: Math.min(existing.introducedRound, nextLoop.introducedRound),
    lastMentionedRound: Math.max(existing.lastMentionedRound, nextLoop.lastMentionedRound),
    priority: Math.max(existing.priority, nextLoop.priority),
    status: nextLoop.status === "open" ? "open" : existing.status,
    tags: Array.from(new Set([
      ...(existing.tags ?? []),
      ...(nextLoop.tags ?? [])
    ]))
  };

  return previousOpenLoops.map((loop, index) => (index === existingIndex ? merged : loop));
}

function mergeEntity(previousEntities: SessionEntityMemory[], nextEntity: SessionEntityMemory): SessionEntityMemory[] {
  const normalizedKey = `${normalizeScopeKey(nextEntity.scope)}:${normalizeTextKey(nextEntity.name)}`;
  const existingIndex = previousEntities.findIndex(
    (entity) =>
      `${normalizeScopeKey(entity.scope)}:${normalizeTextKey(entity.name)}` === normalizedKey ||
      entity.id === nextEntity.id
  );

  if (existingIndex < 0) {
    return [
      ...previousEntities,
      nextEntity
    ];
  }

  const existing = previousEntities[existingIndex];
  const merged: SessionEntityMemory = {
    ...existing,
    aliases: Array.from(new Set([
      ...existing.aliases,
      ...nextEntity.aliases
    ])),
    summary: nextEntity.summary || existing.summary,
    relatedFactIds: Array.from(new Set([
      ...existing.relatedFactIds,
      ...nextEntity.relatedFactIds
    ])),
    tags: Array.from(new Set([
      ...existing.tags,
      ...nextEntity.tags
    ])),
    lastUpdatedRound: Math.max(existing.lastUpdatedRound, nextEntity.lastUpdatedRound)
  };

  return previousEntities.map((entity, index) => (index === existingIndex ? merged : entity));
}

export function mergeSessionMemory(input: {
  previousMemory: SessionMemory;
  delta: SessionMemoryDelta;
  lastProcessedMessageId?: string | null;
  episodeSummary?: SessionEpisodeSummary | null;
  updatedAt?: string;
}): SessionMemory {
  let facts = input.previousMemory.facts.slice();
  let openLoops = input.previousMemory.openLoops.slice();
  let entities = input.previousMemory.entities.slice();

  for (const factId of input.delta.supersededFactIds) {
    facts = facts.map((fact) =>
      fact.id === factId
        ? {
            ...fact,
            status: "superseded"
          }
        : fact
    );
  }

  for (const factId of input.delta.resolvedFactIds) {
    facts = facts.map((fact) =>
      fact.id === factId
        ? {
            ...fact,
            status: "resolved"
          }
        : fact
    );
  }

  for (const nextFact of input.delta.newFacts) {
    facts = mergeFact(facts, nextFact);
  }

  for (const loopId of input.delta.resolvedOpenLoopIds) {
    openLoops = openLoops.map((loop) =>
      loop.id === loopId
        ? {
            ...loop,
            status: "resolved"
          }
        : loop
    );
  }

  for (const nextLoop of input.delta.newOpenLoops) {
    openLoops = mergeOpenLoop(openLoops, nextLoop);
  }

  for (const nextEntity of input.delta.newEntities) {
    entities = mergeEntity(entities, nextEntity);
  }

  const episodeSummaries = input.episodeSummary
    ? [
        ...input.previousMemory.episodeSummaries,
        input.episodeSummary
      ].slice(-MAX_EPISODE_SUMMARIES)
    : input.previousMemory.episodeSummaries.slice(-MAX_EPISODE_SUMMARIES);

  return {
    version: SESSION_MEMORY_VERSION,
    facts,
    openLoops,
    entities,
    episodeSummaries,
    lastProcessedMessageId:
      input.lastProcessedMessageId ?? input.previousMemory.lastProcessedMessageId ?? null,
    updatedAt: input.updatedAt ?? nowIso()
  };
}

export async function updateSnapshotMemory(input: {
  snapshot: SessionSnapshot;
  newMessages: Message[];
  runtimeConfig: SessionRuntimeConfig | null;
}): Promise<SessionMemory> {
  const previousMemory = getSessionMemory(input.snapshot);
  const delta = await extractStructuredMemoryDelta(
    input.snapshot,
    input.newMessages,
    input.runtimeConfig
  );
  const previewMemory = mergeSessionMemory({
    previousMemory,
    delta,
    lastProcessedMessageId: input.newMessages.at(-1)?.id ?? previousMemory.lastProcessedMessageId,
    updatedAt: input.newMessages.at(-1)?.createdAt ?? nowIso()
  });
  const episodeSummary = await maybeCreateEpisodeSummary(
    {
      ...input.snapshot,
      memory: previewMemory
    },
    input.newMessages,
    previewMemory,
    input.runtimeConfig,
    delta.shouldRefreshEpisodeSummary
  );

  return mergeSessionMemory({
    previousMemory,
    delta,
    lastProcessedMessageId: input.newMessages.at(-1)?.id ?? previousMemory.lastProcessedMessageId,
    episodeSummary,
    updatedAt: input.newMessages.at(-1)?.createdAt ?? nowIso()
  });
}

export async function rebuildSnapshotMemory(input: {
  snapshot: SessionSnapshot;
  runtimeConfig: SessionRuntimeConfig | null;
}): Promise<SessionMemory> {
  let workingSnapshot: SessionSnapshot = {
    ...input.snapshot,
    memory: createEmptySessionMemory(input.snapshot.session.createdAt)
  };

  const relevantMessages = input.snapshot.messages.filter((message) => inferMessageChannel(message) !== "system");
  const chunkSize = 10;
  for (let index = 0; index < relevantMessages.length; index += chunkSize) {
    const chunk = relevantMessages.slice(index, index + chunkSize);
    const nextMemory = await updateSnapshotMemory({
      snapshot: workingSnapshot,
      newMessages: chunk,
      runtimeConfig: input.runtimeConfig
    });
    workingSnapshot = {
      ...workingSnapshot,
      memory: nextMemory
    };
  }

  return getSessionMemory(workingSnapshot);
}

function collectQueryTokens(text: string): string[] {
  return Array.from(
    new Set(
      (text.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? []).filter(
        (token) => token.length >= 2
      )
    )
  );
}

function scoreTextMatch(text: string, queryTokens: string[]): number {
  if (!queryTokens.length) {
    return 0;
  }

  const lowered = text.toLowerCase();
  return queryTokens.reduce((score, token) => score + (lowered.includes(token) ? 1 : 0), 0);
}

function scoreFact(fact: SessionFact, queryTokens: string[]): number {
  const base =
    (fact.status === "active" ? 3 : fact.status === "resolved" ? 1 : 0.5) +
    fact.priority * 3 +
    fact.confidence * 2;
  return base + scoreTextMatch([fact.text, ...(fact.tags ?? [])].join(" "), queryTokens);
}

function scoreOpenLoop(loop: SessionOpenLoop, queryTokens: string[]): number {
  const base = (loop.status === "open" ? 4 : 1) + loop.priority * 3;
  return base + scoreTextMatch(`${loop.title} ${loop.summary} ${(loop.tags ?? []).join(" ")}`, queryTokens);
}

function scoreEpisodeSummary(summary: SessionEpisodeSummary, queryTokens: string[]): number {
  return summary.roundEnd + scoreTextMatch(`${summary.title} ${summary.summary}`, queryTokens);
}

function isFactVisibleToNarrator(fact: SessionFact): boolean {
  return fact.scope.visibility === "public" || fact.scope.visibility === "gm_only";
}

function isFactVisibleToParticipant(fact: SessionFact, participantId: string): boolean {
  return (
    fact.scope.visibility === "public" ||
    (fact.scope.visibility === "private" && fact.scope.participantId === participantId)
  );
}

function isOpenLoopVisibleToNarrator(loop: SessionOpenLoop): boolean {
  return loop.scope.visibility === "public" || loop.scope.visibility === "gm_only";
}

function isOpenLoopVisibleToParticipant(loop: SessionOpenLoop, participantId: string): boolean {
  return (
    loop.scope.visibility === "public" ||
    (loop.scope.visibility === "private" && loop.scope.participantId === participantId)
  );
}

function getRecentPublicMessages(snapshot: SessionSnapshot, limit: number): Message[] {
  return snapshot.messages
    .filter((message) => inferMessageChannel(message) === "public_story")
    .slice(-limit);
}

function getRecentPrivateThreadMessages(
  snapshot: SessionSnapshot,
  participantId: string,
  limit: number
): Message[] {
  const localHumanParticipantId = findLocalHumanParticipantId(snapshot.session);
  if (!localHumanParticipantId) {
    return [];
  }

  const threadId = buildPrivateChatThreadId(localHumanParticipantId, participantId);
  return snapshot.messages
    .filter(
      (message) =>
        inferMessageChannel(message) === "private_chat" && message.threadId === threadId
    )
    .slice(-limit);
}

function formatPreparedInputs(preparedInputs: RoundDraft[]): string[] {
  if (!preparedInputs.length) {
    return [
      "No party actions are prepared yet."
    ];
  }

  return preparedInputs.map((draft) => {
    const roleLabel = draft.isPrimary
      ? draft.source === "ai"
        ? "AI Protagonist"
        : "Primary Player"
      : "AI Teammate";
    return `${roleLabel} - ${draft.displayName}: ${draft.content}`;
  });
}

function renderContextPack(sections: SessionContextPackSection[]): string {
  return sections
    .filter((section) => section.lines.length > 0)
    .map((section) => [`${section.label}:`, ...section.lines].join("\n"))
    .join("\n\n");
}

function buildSection(key: string, label: string, lines: string[]): SessionContextPackSection {
  return {
    key,
    label,
    lines
  };
}

export function buildNarratorContextPack(input: {
  snapshot: SessionSnapshot;
  latestPlayerInput?: string | null;
  round?: number;
}): SessionRuntimeContextPack {
  const snapshot = input.snapshot;
  const memory = getSessionMemory(snapshot);
  const latestPublicMessages = getRecentPublicMessages(snapshot, 8);
  const fallbackLatestInput =
    latestPublicMessages
      .slice()
      .reverse()
      .find((message) => message.kind === "player_input")
      ?.content ?? "";
  const focusText = [input.latestPlayerInput ?? "", fallbackLatestInput].join("\n").trim();
  const queryTokens = collectQueryTokens(focusText);
  const facts = memory.facts
    .filter((fact) => isFactVisibleToNarrator(fact))
    .sort((left, right) => scoreFact(right, queryTokens) - scoreFact(left, queryTokens))
    .slice(0, 10);
  const openLoops = memory.openLoops
    .filter((loop) => isOpenLoopVisibleToNarrator(loop))
    .sort((left, right) => scoreOpenLoop(right, queryTokens) - scoreOpenLoop(left, queryTokens))
    .slice(0, 5);
  const episodeSummaries = memory.episodeSummaries
    .filter((summary) => summary.scope.visibility !== "private")
    .sort((left, right) => scoreEpisodeSummary(right, queryTokens) - scoreEpisodeSummary(left, queryTokens))
    .slice(0, 2);
  const sections = [
    buildSection("runtime_state", "Runtime state", [
      `Story title: ${snapshot.contentSummary.storyTitle}`,
      `Round: ${input.round ?? snapshot.session.currentRound}`,
      `Latest player input: ${focusText || "No latest player input."}`
    ]),
    buildSection(
      "recent_public_raw",
      "Recent public raw window",
      latestPublicMessages.map((message) => buildPublicMessageLine(snapshot.session, message))
    ),
    buildSection(
      "retrieved_facts",
      "Retrieved facts",
      facts.map((fact) => `[${fact.kind}] ${fact.text}`)
    ),
    buildSection(
      "open_loops",
      "Open loops",
      openLoops.map((loop) => `${loop.title}: ${loop.summary}`)
    ),
    buildSection(
      "episode_summaries",
      "Fallback episode summaries",
      episodeSummaries.map((summary) => `${summary.title}: ${summary.summary}`)
    )
  ];

  return {
    target: "narrator",
    participantId: null,
    round: input.round ?? snapshot.session.currentRound,
    assembledText: renderContextPack(sections),
    sections,
    retrievedFactIds: facts.map((fact) => fact.id),
    retrievedOpenLoopIds: openLoops.map((loop) => loop.id),
    recentMessageIds: latestPublicMessages.map((message) => message.id),
    episodeSummaryIds: episodeSummaries.map((summary) => summary.id)
  };
}

export function buildCompanionContextPack(input: {
  snapshot: SessionSnapshot;
  participantId: string;
  round: number;
  preparedInputs: RoundDraft[];
}): SessionRuntimeContextPack {
  const snapshot = input.snapshot;
  const memory = getSessionMemory(snapshot);
  const latestPublicMessages = getRecentPublicMessages(snapshot, 6);
  const privateMessages = getRecentPrivateThreadMessages(snapshot, input.participantId, 6);
  const focusText = [
    ...formatPreparedInputs(input.preparedInputs),
    ...latestPublicMessages.slice(-2).map((message) => message.content)
  ].join("\n");
  const queryTokens = collectQueryTokens(focusText);
  const publicFacts = memory.facts
    .filter((fact) => fact.scope.visibility === "public")
    .sort((left, right) => scoreFact(right, queryTokens) - scoreFact(left, queryTokens))
    .slice(0, 7);
  const privateFacts = memory.facts
    .filter(
      (fact) =>
        fact.scope.visibility === "private" && fact.scope.participantId === input.participantId
    )
    .sort((left, right) => scoreFact(right, queryTokens) - scoreFact(left, queryTokens))
    .slice(0, 4);
  const openLoops = memory.openLoops
    .filter((loop) => isOpenLoopVisibleToParticipant(loop, input.participantId))
    .sort((left, right) => scoreOpenLoop(right, queryTokens) - scoreOpenLoop(left, queryTokens))
    .slice(0, 4);
  const sections = [
    buildSection("runtime_state", "Runtime state", [
      `Story title: ${snapshot.contentSummary.storyTitle}`,
      `Round: ${input.round}`,
      "Prepared party actions:",
      ...formatPreparedInputs(input.preparedInputs)
    ]),
    buildSection(
      "recent_public_raw",
      "Recent public raw window",
      latestPublicMessages.map((message) => buildPublicMessageLine(snapshot.session, message))
    ),
    buildSection(
      "retrieved_public_facts",
      "Retrieved public facts",
      publicFacts.map((fact) => `[${fact.kind}] ${fact.text}`)
    ),
    buildSection(
      "retrieved_private_facts",
      "Private facts for this teammate",
      privateFacts.map((fact) => `[${fact.kind}] ${fact.text}`)
    ),
    buildSection(
      "open_loops",
      "Open loops",
      openLoops.map((loop) => `${loop.title}: ${loop.summary}`)
    ),
    buildSection(
      "private_thread_raw",
      "Recent private thread raw window",
      privateMessages.length
        ? privateMessages.map((message) => buildPrivateMessageLine(snapshot.session, message))
        : ["No recent private chat history."]
    )
  ];

  return {
    target: "companion_public_turn",
    participantId: input.participantId,
    round: input.round,
    assembledText: renderContextPack(sections),
    sections,
    retrievedFactIds: [
      ...publicFacts.map((fact) => fact.id),
      ...privateFacts.map((fact) => fact.id)
    ],
    retrievedOpenLoopIds: openLoops.map((loop) => loop.id),
    recentMessageIds: [
      ...latestPublicMessages.map((message) => message.id),
      ...privateMessages.map((message) => message.id)
    ],
    episodeSummaryIds: []
  };
}

export function buildPrivateChatContextPack(input: {
  snapshot: SessionSnapshot;
  participantId: string;
  latestMessage?: string | null;
}): SessionRuntimeContextPack {
  const snapshot = input.snapshot;
  const memory = getSessionMemory(snapshot);
  const latestPublicMessages = getRecentPublicMessages(snapshot, 4);
  const privateMessages = getRecentPrivateThreadMessages(snapshot, input.participantId, 8);
  const focusText = [input.latestMessage ?? "", ...privateMessages.slice(-2).map((message) => message.content)].join("\n");
  const queryTokens = collectQueryTokens(focusText);
  const publicFacts = memory.facts
    .filter((fact) => fact.scope.visibility === "public")
    .sort((left, right) => scoreFact(right, queryTokens) - scoreFact(left, queryTokens))
    .slice(0, 5);
  const privateFacts = memory.facts
    .filter(
      (fact) =>
        fact.scope.visibility === "private" && fact.scope.participantId === input.participantId
    )
    .sort((left, right) => scoreFact(right, queryTokens) - scoreFact(left, queryTokens))
    .slice(0, 5);
  const openLoops = memory.openLoops
    .filter((loop) => isOpenLoopVisibleToParticipant(loop, input.participantId))
    .sort((left, right) => scoreOpenLoop(right, queryTokens) - scoreOpenLoop(left, queryTokens))
    .slice(0, 4);
  const sections = [
    buildSection("runtime_state", "Runtime state", [
      `Story title: ${snapshot.contentSummary.storyTitle}`,
      `Round: ${snapshot.session.currentRound}`,
      `Latest incoming private message: ${input.latestMessage?.trim() || "No latest message."}`
    ]),
    buildSection(
      "recent_public_raw",
      "Recent public raw window",
      latestPublicMessages.map((message) => buildPublicMessageLine(snapshot.session, message))
    ),
    buildSection(
      "retrieved_public_facts",
      "Relevant public facts",
      publicFacts.map((fact) => `[${fact.kind}] ${fact.text}`)
    ),
    buildSection(
      "retrieved_private_facts",
      "Relevant private facts",
      privateFacts.map((fact) => `[${fact.kind}] ${fact.text}`)
    ),
    buildSection(
      "open_loops",
      "Open loops",
      openLoops.map((loop) => `${loop.title}: ${loop.summary}`)
    ),
    buildSection(
      "private_thread_raw",
      "Recent private thread raw window",
      privateMessages.length
        ? privateMessages.map((message) => buildPrivateMessageLine(snapshot.session, message))
        : ["No private chat history yet."]
    )
  ];

  return {
    target: "private_chat",
    participantId: input.participantId,
    round: snapshot.session.currentRound,
    assembledText: renderContextPack(sections),
    sections,
    retrievedFactIds: [
      ...publicFacts.map((fact) => fact.id),
      ...privateFacts.map((fact) => fact.id)
    ],
    retrievedOpenLoopIds: openLoops.map((loop) => loop.id),
    recentMessageIds: [
      ...latestPublicMessages.map((message) => message.id),
      ...privateMessages.map((message) => message.id)
    ],
    episodeSummaryIds: []
  };
}

export function buildDebugContextPack(input: {
  snapshot: SessionSnapshot;
  target: "narrator" | "companion" | "private_chat";
  participantId?: string | null;
}): SessionRuntimeContextPack {
  if (input.target === "narrator") {
    return buildNarratorContextPack({
      snapshot: input.snapshot
    });
  }

  if (!input.participantId) {
    throw new Error("participantId is required for companion and private chat context inspection.");
  }

  if (input.target === "companion") {
    return buildCompanionContextPack({
      snapshot: input.snapshot,
      participantId: input.participantId,
      round:
        input.snapshot.session.gameState.roundInputState?.round ??
        input.snapshot.session.currentRound + 1,
      preparedInputs: input.snapshot.session.gameState.roundInputState?.drafts ?? []
    });
  }

  return buildPrivateChatContextPack({
    snapshot: input.snapshot,
    participantId: input.participantId
  });
}
