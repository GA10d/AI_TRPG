import type {
  AiAppearanceTag,
  AiGenerationMetadata,
  AiPersonalityTag,
  LocaleCode,
  Message,
  ModelAccessMode,
  Participant,
  RoundDraft,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import { getModelGateway } from "../model_gateway/index.ts";
import { buildAiPlayerSystemPrompt } from "./prompt.ts";

function buildSpeakerLabel(
  participants: Participant[],
  senderId: string,
  kind: Message["kind"]
): string {
  if (kind === "gm_narration" || kind === "gm_dialogue") {
    return "Narrator";
  }

  const participant = participants.find((item) => item.id === senderId);
  if (participant) {
    if (participant.role === "human_player") {
      return participant.isLocalUser
        ? `Human Player - ${participant.displayName}`
        : participant.displayName;
    }

    if (participant.role === "ai_player") {
      return `AI Character - ${participant.displayName}`;
    }

    return participant.displayName;
  }

  return "Unknown";
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

function buildPublicStoryContext(
  messages: Message[],
  participants: Participant[]
): string {
  const visibleMessages = messages
    .filter((message) => inferMessageChannel(message) === "public_story");

  if (!visibleMessages.length) {
    return "No public story context has been recorded yet.";
  }

  return visibleMessages
    .map((message) => {
      const speaker = buildSpeakerLabel(participants, message.senderId, message.kind);
      return `[R${message.round}] ${speaker}: ${message.content}`;
    })
    .join("\n\n");
}

function buildPreparedInputSummary(drafts: RoundDraft[]): string {
  if (!drafts.length) {
    return "No party actions have been prepared yet.";
  }

  return drafts
    .map((draft) => {
      const label = draft.isPrimary
        ? draft.source === "ai"
          ? `AI Protagonist - ${draft.displayName}`
          : `Primary Player - ${draft.displayName}`
        : `AI Teammate - ${draft.displayName}`;
      return `${label}: ${draft.content}`;
    })
    .join("\n");
}

function buildParticipantRoleLabel(participant: Participant, isPrimary: boolean): string {
  if (isPrimary) {
    return participant.role === "ai_player" ? "primary AI protagonist" : "primary player";
  }

  return participant.role === "ai_player" ? "AI teammate" : participant.role;
}

function buildRoundDraftGuidance(input: {
  isPrimary: boolean;
  preparedInputs: RoundDraft[];
}): string[] {
  if (input.isPrimary) {
    return [
      "You are setting the party's first concrete move for this round.",
      "Stay proactive, but leave room for teammates to respond with their own distinct actions."
    ];
  }

  const hasPrimaryDraft = input.preparedInputs.some((draft) => draft.isPrimary);
  const guidance = [
    "You are reacting as a teammate, not replacing the primary protagonist.",
    "Do not repeat, restate, or lightly paraphrase another party member's prepared action.",
    "Add a distinct, complementary action, observation, concern, or question from your own perspective.",
    "Do not claim another character's family history, memories, possessions, or private motives as your own unless the story explicitly established that they are shared."
  ];

  if (hasPrimaryDraft) {
    guidance.push(
      "If the prepared actions already include something from the primary protagonist, treat that as another character's move and build on it instead of mirroring it."
    );
  }

  guidance.push(
    "If the public narration contains second-person wording tied to another character's personal hook, treat it as scene context rather than your own backstory."
  );

  return guidance;
}

function buildAiRoundUserPrompt(input: {
  storyTitle: string;
  locale: LocaleCode;
  round: number;
  participant: Participant;
  isPrimary: boolean;
  publicStoryContext: string;
  privateContext: string;
  preparedInputs: RoundDraft[];
  personalityTags: AiPersonalityTag[];
}): string {
  const personalitySummary = input.personalityTags.length
    ? input.personalityTags
        .map((tag) => `${tag.keyword}: ${tag.description}`)
        .join("\n")
    : "No explicit personality tags were selected.";

  return [
    `Story title: ${input.storyTitle}`,
    `Round: ${input.round}`,
    `Target language: ${input.locale}`,
    `Character name: ${input.participant.displayName}`,
    `Party role: ${buildParticipantRoleLabel(input.participant, input.isPrimary)}`,
    "",
    "Selected personality tags:",
    personalitySummary,
    "",
    "Runtime context pack:",
    input.publicStoryContext,
    "",
    "Supplemental private notes:",
    input.privateContext,
    "",
    "Already prepared party actions for this round:",
    buildPreparedInputSummary(input.preparedInputs),
    "",
    "Coordination guidance:",
    ...buildRoundDraftGuidance({
      isPrimary: input.isPrimary,
      preparedInputs: input.preparedInputs
    }),
    "",
    "Task:",
    "Write exactly one in-character public turn reply for this character.",
    "Keep it grounded, actionable, and easy for the narrator to continue from.",
    "Do not narrate outcomes, control other characters, or break role.",
    "A concise paragraph or two is enough."
  ].join("\n");
}

function buildAiPrivateChatUserPrompt(input: {
  storyTitle: string;
  locale: LocaleCode;
  participant: Participant;
  localHumanName: string;
  publicStoryContext: string;
  privateThreadContext: string;
  latestMessage: string;
}): string {
  return [
    `Story title: ${input.storyTitle}`,
    `Target language: ${input.locale}`,
    `Character name: ${input.participant.displayName}`,
    `Private chat partner: ${input.localHumanName}`,
    "",
    "Runtime context pack:",
    input.publicStoryContext,
    "",
    "Private chat history with this partner:",
    input.privateThreadContext,
    "",
    "Latest incoming private message:",
    input.latestMessage,
    "",
    "Task:",
    "Reply as this character in a private side conversation.",
    "Stay in character and respond directly to the latest message.",
    "Do not adopt another character's backstory, family history, or personal hooks as your own.",
    "Do not narrate outcomes, do not declare public actions, and do not speak for the user.",
    "A concise reply or two short paragraphs is enough."
  ].join("\n");
}

export async function generateAiRoundDraft(input: {
  accessMode: ModelAccessMode;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  locale: LocaleCode;
  storyTitle: string;
  round: number;
  participant: Participant;
  isPrimary: boolean;
  personalityTags: AiPersonalityTag[];
  appearanceTags: AiAppearanceTag[];
  participants: Participant[];
  messages: Message[];
  publicStoryContext?: string;
  privateContext?: string;
  preparedInputs: RoundDraft[];
}): Promise<RoundDraft> {
  const modelGateway = getModelGateway(input.accessMode);
  const systemPrompt = await buildAiPlayerSystemPrompt({
    locale: input.locale,
    personalityTags: input.personalityTags,
    appearanceTags: input.appearanceTags
  });
  const publicStoryContext =
    input.publicStoryContext ??
    buildPublicStoryContext(input.messages, input.participants);
  const privateContext = input.privateContext?.trim() || "No relevant private chat history.";
  const result = await modelGateway.generatePromptedText({
    accessMode: input.accessMode,
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig,
    locale: input.locale,
    systemPrompt,
    userPrompt: buildAiRoundUserPrompt({
      storyTitle: input.storyTitle,
      locale: input.locale,
      round: input.round,
      participant: input.participant,
      isPrimary: input.isPrimary,
      publicStoryContext,
      privateContext,
      preparedInputs: input.preparedInputs,
      personalityTags: input.personalityTags
    })
  });

  return {
    participantId: input.participant.id,
    displayName: input.participant.displayName,
    role: input.participant.role,
    isPrimary: input.isPrimary,
    status: "ready",
    source: "ai",
    content:
      result.text.trim() ||
      `${input.participant.displayName} pauses, studies the situation, and offers a cautious response.`,
    editable: false,
    generatedAt: new Date().toISOString(),
    aiMetadata: result.meta
  };
}

export async function generateAiPrivateChatReply(input: {
  accessMode: ModelAccessMode;
  modelProfileId?: string;
  runtimeModelConfig?: RuntimeModelConfigInput;
  locale: LocaleCode;
  storyTitle: string;
  participant: Participant;
  localHumanName: string;
  personalityTags: AiPersonalityTag[];
  appearanceTags: AiAppearanceTag[];
  participants: Participant[];
  messages: Message[];
  publicStoryContext?: string;
  privateThreadContext: string;
  latestMessage: string;
}): Promise<{
  content: string;
  provider: string;
  mode: ModelAccessMode;
  meta: AiGenerationMetadata;
}> {
  const modelGateway = getModelGateway(input.accessMode);
  const systemPrompt = await buildAiPlayerSystemPrompt({
    locale: input.locale,
    personalityTags: input.personalityTags,
    appearanceTags: input.appearanceTags
  });
  const publicStoryContext =
    input.publicStoryContext ??
    buildPublicStoryContext(input.messages, input.participants);
  const result = await modelGateway.generatePromptedText({
    accessMode: input.accessMode,
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig,
    locale: input.locale,
    systemPrompt,
    userPrompt: buildAiPrivateChatUserPrompt({
      storyTitle: input.storyTitle,
      locale: input.locale,
      participant: input.participant,
      localHumanName: input.localHumanName,
      publicStoryContext,
      privateThreadContext: input.privateThreadContext,
      latestMessage: input.latestMessage
    })
  });

  return {
    content:
      result.text.trim() ||
      `${input.participant.displayName} lowers their voice and gives a brief private reply.`,
    provider: result.provider,
    mode: result.mode,
    meta: result.meta
  };
}
