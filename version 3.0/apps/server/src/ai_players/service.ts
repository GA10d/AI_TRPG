import type {
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
  const participant = participants.find((item) => item.id === senderId);
  if (participant) {
    return participant.displayName;
  }

  if (kind === "gm_narration" || kind === "gm_dialogue") {
    return "Narrator";
  }

  return "Unknown";
}

function buildPublicStoryContext(
  messages: Message[],
  participants: Participant[],
  maxMessages = 12
): string {
  const visibleMessages = messages
    .filter((message) => message.visibility === "public")
    .slice(-maxMessages);

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
    .map((draft) => `${draft.displayName}: ${draft.content}`)
    .join("\n");
}

function buildParticipantRoleLabel(participant: Participant, isPrimary: boolean): string {
  if (isPrimary) {
    return participant.role === "ai_player" ? "primary AI protagonist" : "primary player";
  }

  return participant.role === "ai_player" ? "AI teammate" : participant.role;
}

function buildAiRoundUserPrompt(input: {
  storyTitle: string;
  locale: LocaleCode;
  round: number;
  participant: Participant;
  isPrimary: boolean;
  publicStoryContext: string;
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
    "Public story context:",
    input.publicStoryContext,
    "",
    "Already prepared party actions for this round:",
    buildPreparedInputSummary(input.preparedInputs),
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
    "Public story context:",
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
  participants: Participant[];
  messages: Message[];
  preparedInputs: RoundDraft[];
}): Promise<RoundDraft> {
  const modelGateway = getModelGateway(input.accessMode);
  const systemPrompt = await buildAiPlayerSystemPrompt({
    locale: input.locale,
    personalityTags: input.personalityTags
  });
  const publicStoryContext = buildPublicStoryContext(input.messages, input.participants);
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
    generatedAt: new Date().toISOString()
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
    personalityTags: input.personalityTags
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
