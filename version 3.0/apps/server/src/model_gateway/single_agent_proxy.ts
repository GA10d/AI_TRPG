import { Buffer } from "node:buffer";

import { estimateModelUsageCost } from "../../../../packages/shared-config/src/index.ts";
import type { AiGenerationUsage } from "../../../../packages/shared-types/src/index.ts";
import {
  buildEndingAdjudicationFromDecision,
  buildEndingJudgeSystemPrompt,
  buildEndingJudgeUserPrompt,
  buildNarratorSystemPrompt,
  parseStructuredJsonObject,
  buildSessionOpeningTaskText,
  buildTurnTaskText,
  buildStructuredAssistantSystemPrompt,
  loadEndingJudgeOutputSchema,
  parseEndingJudgeDecision
} from "../single_agent/service.ts";
import { buildMultiAgentSystemPrompt } from "../multi_agent/service.ts";
import { getServerProxyConfig, type ServerProxyConfig } from "./config.ts";
import type {
  EndingJudgeInput,
  EndingJudgeOutput,
  InitialSessionNarrationInput,
  StructuredAssistantInput,
  StructuredAssistantOutput,
  TurnNarrationInput,
  TurnNarrationOutput
} from "./types.ts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
      reasoning_content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
  error?: {
    message?: string;
  };
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
  error?: {
    message?: string;
  };
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    message?: string;
  };
};

type GeminiFileUploadResponse = {
  file?: {
    name?: string;
    uri?: string;
    mimeType?: string;
  };
  error?: {
    message?: string;
  };
};

type UploadedGeminiFile = {
  name: string;
  uri: string;
  mimeType: string;
};

type PromptFile = {
  fileName: string;
  content: string;
};

type TextCompletionResult = {
  text: string;
  reasoningContent?: string | null;
  durationMs: number;
  usage: AiGenerationUsage;
};

type ChatCompletionResponseFormat =
  | {
      type: "json_object";
    }
  | {
      type: "json_schema";
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
    };

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error &&
    error.name === "AbortError"
  );
}

function normalizeGatewayError(
  error: unknown,
  config: ServerProxyConfig,
  operationLabel: string
): Error {
  if (isAbortError(error)) {
    const timeoutHint =
      config.profileId === "deepseek-reasoner"
        ? "You can raise TRPG_DEEPSEEK_REASONER_TIMEOUT_MS or TRPG_SERVER_PROXY_TIMEOUT_MS if needed."
        : "You can raise TRPG_SERVER_PROXY_TIMEOUT_MS if needed.";

    return new Error(
      `${config.profileName} ${operationLabel} timed out after ${Math.round(
        config.timeoutMs / 1000
      )}s. ${timeoutHint}`
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}

function normalizeContent(rawContent: unknown): string {
  if (typeof rawContent === "string") {
    return rawContent.trim();
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (
          item &&
          typeof item === "object" &&
          "text" in item &&
          typeof (item as { text?: unknown }).text === "string"
        ) {
          return (item as { text: string }).text;
        }

        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

function normalizeResponsesOutput(data: ResponsesApiResponse): string {
  if (typeof data.output_text === "string" && data.output_text.trim().length > 0) {
    return data.output_text.trim();
  }

  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((item) => item.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .trim() ?? ""
  );
}

function normalizeGeminiOutput(data: GeminiGenerateContentResponse): string {
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((item) => item.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .trim() ?? ""
  );
}

function buildOpenAiUsage(data: ChatCompletionResponse | ResponsesApiResponse): AiGenerationUsage {
  const promptTokens = data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? null;
  const completionTokens =
    data.usage?.completion_tokens ?? data.usage?.output_tokens ?? null;
  const promptCacheHitTokens =
    data.usage?.prompt_cache_hit_tokens ??
    data.usage?.input_tokens_details?.cached_tokens ??
    data.usage?.prompt_tokens_details?.cached_tokens ??
    null;
  const promptCacheMissTokens =
    data.usage?.prompt_cache_miss_tokens ??
    (typeof promptTokens === "number" && typeof promptCacheHitTokens === "number"
      ? Math.max(0, promptTokens - promptCacheHitTokens)
      : null);

  return {
    promptTokens,
    completionTokens,
    totalTokens: data.usage?.total_tokens ?? null,
    promptCacheHitTokens,
    promptCacheMissTokens
  };
}

function buildGeminiUsage(data: GeminiGenerateContentResponse): AiGenerationUsage {
  return {
    promptTokens: data.usageMetadata?.promptTokenCount ?? null,
    completionTokens: data.usageMetadata?.candidatesTokenCount ?? null,
    totalTokens: data.usageMetadata?.totalTokenCount ?? null,
    promptCacheHitTokens: null,
    promptCacheMissTokens: null
  };
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function callChatCompletion(
  config: ServerProxyConfig,
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    responseFormat?: ChatCompletionResponseFormat;
  }
): Promise<TextCompletionResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: options?.temperature ?? config.temperature
    };

    if (config.maxTokens !== null) {
      payload.max_tokens = config.maxTokens;
    }

    if (options?.responseFormat) {
      payload.response_format =
        options.responseFormat.type === "json_object"
          ? {
              type: "json_object"
            }
          : {
              type: "json_schema",
              json_schema: {
                name: options.responseFormat.name,
                strict: options.responseFormat.strict ?? true,
                schema: options.responseFormat.schema
              }
            };
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      throw new Error(
        data.error?.message ?? `server_proxy request failed with HTTP ${response.status}.`
      );
    }

    const text = normalizeContent(data.choices?.[0]?.message?.content);
    if (!text) {
      throw new Error("server_proxy returned an empty completion.");
    }

    return {
      text,
      reasoningContent: normalizeContent(data.choices?.[0]?.message?.reasoning_content),
      durationMs: Date.now() - startedAt,
      usage: buildOpenAiUsage(data)
    };
  } catch (error) {
    throw normalizeGatewayError(error, config, "request");
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildDefaultEndingJudgeDecision() {
  return {
    GameOver: false,
    Reason: "The latest narrator reply does not clearly confirm that the game has already ended.",
    EndingId: "",
    EndingType: "",
    EndingTitle: "",
    EndingSummary: ""
  } as const;
}

function shouldAttemptStrictStructuredSchema(config: ServerProxyConfig): boolean {
  return config.profileCode !== "deepseek" && config.profileId !== "custom-openai-compatible";
}

function buildInlineOpenAiFileData(content: string, mimeType: string = "text/plain"): string {
  return `data:${mimeType};base64,${Buffer.from(content, "utf8").toString("base64")}`;
}

function shouldFallbackToInlineOpenAiFileData(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes("api.files.write") ||
    normalizedMessage.includes("missing scopes") ||
    normalizedMessage.includes("insufficient permissions")
  );
}

function getGeminiApiRoot(config: ServerProxyConfig): string {
  return config.baseUrl.replace(/\/v1beta\/openai$/u, "");
}

async function uploadOpenAiUserFile(
  config: ServerProxyConfig,
  fileName: string,
  content: string
): Promise<string> {
  const formData = new FormData();
  formData.append("purpose", "user_data");
  formData.append(
    "file",
    new Blob([content], {
      type: "text/plain"
    }),
    fileName
  );

  const response = await fetch(`${config.baseUrl}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    },
    body: formData
  });

  const responseText = await readResponseText(response);
  let payload: { id?: string; error?: { message?: string } } = {};
  try {
    payload = responseText ? (JSON.parse(responseText) as typeof payload) : {};
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.id) {
    throw new Error(
      payload.error?.message ??
        (responseText || `OpenAI file upload failed with HTTP ${response.status}.`)
    );
  }

  return payload.id;
}

async function deleteOpenAiUserFile(
  config: ServerProxyConfig,
  fileId: string | null
): Promise<void> {
  if (!fileId) {
    return;
  }

  try {
    await fetch(`${config.baseUrl}/files/${fileId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.apiKey}`
      }
    });
  } catch {
    // Ignore cleanup failures.
  }
}

async function uploadGeminiUserFile(
  config: ServerProxyConfig,
  fileName: string,
  content: string
): Promise<UploadedGeminiFile> {
  const apiRoot = getGeminiApiRoot(config);
  const bytes = Buffer.from(content, "utf8");
  const startResponse = await fetch(`${apiRoot}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": config.apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": "text/plain",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      file: {
        display_name: fileName
      }
    })
  });

  if (!startResponse.ok) {
    throw new Error(
      `Gemini file upload start failed with HTTP ${startResponse.status}: ${await readResponseText(startResponse)}`
    );
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini file upload did not return an upload URL.");
  }

  const finalizeResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: bytes
  });

  const payload = (await finalizeResponse.json()) as GeminiFileUploadResponse;
  const uploadedFile = payload.file;
  if (!finalizeResponse.ok || !uploadedFile?.name || !uploadedFile.uri) {
    throw new Error(
      payload.error?.message ??
        `Gemini file upload failed with HTTP ${finalizeResponse.status}.`
    );
  }

  return {
    name: uploadedFile.name,
    uri: uploadedFile.uri,
    mimeType: uploadedFile.mimeType ?? "text/plain"
  };
}

async function deleteGeminiUserFile(
  config: ServerProxyConfig,
  fileName: string | null
): Promise<void> {
  if (!fileName) {
    return;
  }

  try {
    const apiRoot = getGeminiApiRoot(config);
    await fetch(`${apiRoot}/v1beta/files/${fileName}`, {
      method: "DELETE",
      headers: {
        "x-goog-api-key": config.apiKey
      }
    });
  } catch {
    // Ignore cleanup failures.
  }
}

async function callOpenAiResponsesWithFiles(
  config: ServerProxyConfig,
  systemPrompt: string,
  userPrompt: string,
  files: PromptFile[],
  fileIds: string[]
): Promise<TextCompletionResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      instructions: systemPrompt,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userPrompt
            },
            ...fileIds.map((fileId) => ({
              type: "input_file",
              file_id: fileId
            }))
          ]
        }
      ]
    };

    const response = await fetch(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = (await response.json()) as ResponsesApiResponse;
    if (!response.ok) {
      throw new Error(
        data.error?.message ?? `OpenAI responses request failed with HTTP ${response.status}.`
      );
    }

    const text = normalizeResponsesOutput(data);
    if (!text) {
      throw new Error("OpenAI responses request returned an empty completion.");
    }

    return {
      text,
      durationMs: Date.now() - startedAt,
      usage: buildOpenAiUsage(data)
    };
  } catch (error) {
    throw normalizeGatewayError(error, config, "responses request");
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function callOpenAiResponsesWithInlineFiles(
  config: ServerProxyConfig,
  systemPrompt: string,
  userPrompt: string,
  files: PromptFile[]
): Promise<TextCompletionResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      instructions: systemPrompt,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userPrompt
            },
            ...files.map((file) => ({
              type: "input_file",
              filename: file.fileName,
              file_data: buildInlineOpenAiFileData(file.content)
            }))
          ]
        }
      ]
    };

    const response = await fetch(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = (await response.json()) as ResponsesApiResponse;
    if (!response.ok) {
      throw new Error(
        data.error?.message ?? `OpenAI responses request failed with HTTP ${response.status}.`
      );
    }

    const text = normalizeResponsesOutput(data);
    if (!text) {
      throw new Error("OpenAI responses request returned an empty completion.");
    }

    return {
      text,
      durationMs: Date.now() - startedAt,
      usage: buildOpenAiUsage(data)
    };
  } catch (error) {
    throw normalizeGatewayError(error, config, "responses request");
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function callGeminiGenerateContentWithFiles(
  config: ServerProxyConfig,
  systemPrompt: string,
  userPrompt: string,
  files: UploadedGeminiFile[]
): Promise<TextCompletionResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();

  try {
    const apiRoot = getGeminiApiRoot(config);
    const response = await fetch(
      `${apiRoot}/v1beta/models/${config.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: systemPrompt
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: userPrompt
                },
                ...files.map((file) => ({
                  file_data: {
                    mime_type: file.mimeType,
                    file_uri: file.uri
                  }
                }))
              ]
            }
          ]
        }),
        signal: controller.signal
      }
    );

    const data = (await response.json()) as GeminiGenerateContentResponse;
    if (!response.ok) {
      throw new Error(
        data.error?.message ?? `Gemini generateContent failed with HTTP ${response.status}.`
      );
    }

    const text = normalizeGeminiOutput(data);
    if (!text) {
      throw new Error("Gemini generateContent returned an empty completion.");
    }

    return {
      text,
      durationMs: Date.now() - startedAt,
      usage: buildGeminiUsage(data)
    };
  } catch (error) {
    throw normalizeGatewayError(error, config, "generateContent request");
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function callPromptWithUploadedFiles(
  config: ServerProxyConfig,
  systemPrompt: string,
  userPrompt: string,
  files: PromptFile[]
): Promise<TextCompletionResult> {
  if (config.dependence === "Google") {
    const uploadedFiles: UploadedGeminiFile[] = [];

    try {
      for (const file of files) {
        uploadedFiles.push(await uploadGeminiUserFile(config, file.fileName, file.content));
      }

      return await callGeminiGenerateContentWithFiles(
        config,
        systemPrompt,
        userPrompt,
        uploadedFiles
      );
    } finally {
      for (const file of uploadedFiles.slice().reverse()) {
        await deleteGeminiUserFile(config, file.name);
      }
    }
  }

  const uploadedFileIds: string[] = [];
  try {
    for (const file of files) {
      uploadedFileIds.push(await uploadOpenAiUserFile(config, file.fileName, file.content));
    }

    return await callOpenAiResponsesWithFiles(
      config,
      systemPrompt,
      userPrompt,
      files,
      uploadedFileIds
    );
  } catch (error) {
    if (!shouldFallbackToInlineOpenAiFileData(error)) {
      throw error;
    }

    return await callOpenAiResponsesWithInlineFiles(config, systemPrompt, userPrompt, files);
  } finally {
    for (const fileId of uploadedFileIds.slice().reverse()) {
      await deleteOpenAiUserFile(config, fileId);
    }
  }
}

function buildNarratorMeta(
  config: ServerProxyConfig,
  completion: TextCompletionResult
): TurnNarrationOutput["meta"] {
  return {
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy",
    model: config.model,
    durationMs: completion.durationMs,
    estimatedCost: estimateModelUsageCost({
      model: config.model,
      usage: completion.usage
    }),
    usage: completion.usage,
    reasoningContent: completion.reasoningContent ?? null
  };
}

function buildPromptFilesForInitialSession(
  input: InitialSessionNarrationInput
): PromptFile[] {
  const playerInfo =
    input.playerInfo.trim().length > 0
      ? input.playerInfo.trim()
      : "No player background was provided.";

  return [
    {
      fileName: "rule.txt",
      content: [`Rule title: ${input.ruleTitle}`, "", input.ruleText].join("\n")
    },
    {
      fileName: "story.txt",
      content: [`Story title: ${input.storyTitle}`, "", input.storyText].join("\n")
    },
    {
      fileName: "player_info.txt",
      content: playerInfo
    }
  ];
}

function buildInlineInitialNarrationMessages(
  input: InitialSessionNarrationInput,
  systemPrompt: string
): ChatMessage[] {
  return [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: [
        buildSessionOpeningTaskText({
          locale: input.locale,
          ruleTitle: input.ruleTitle,
          storyTitle: input.storyTitle,
          playerInfo: input.playerInfo
        }),
        "",
        "Rule content:",
        input.ruleText,
        "",
        "Story content:",
        input.storyText,
        "",
        "Player info:",
        input.playerInfo.trim() || "No player background was provided."
      ].join("\n")
    }
  ];
}

async function buildInitialNarrationSystemPrompt(
  input: InitialSessionNarrationInput,
  profileId: string
): Promise<string> {
  if (input.gmArchitecture === "multi_agent") {
    return buildMultiAgentSystemPrompt("beginning", input.locale, input.difficulty);
  }

  return buildNarratorSystemPrompt(input.locale, {
    difficulty: input.difficulty,
    profileId
  });
}

export async function generateInitialSessionNarrationViaServerProxy(
  input: InitialSessionNarrationInput
): Promise<TurnNarrationOutput> {
  const config = getServerProxyConfig({
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig
  });
  const systemPrompt = await buildInitialNarrationSystemPrompt(input, config.profileId);
  const userPrompt = buildSessionOpeningTaskText({
    locale: input.locale,
    ruleTitle: input.ruleTitle,
    storyTitle: input.storyTitle,
    playerInfo: input.playerInfo
  });

  const completion = config.features.file_upload.supported
    ? await callPromptWithUploadedFiles(
        config,
        systemPrompt,
        userPrompt,
        buildPromptFilesForInitialSession(input)
      )
    : await callChatCompletion(
        config,
        buildInlineInitialNarrationMessages(input, systemPrompt)
      );

  return {
    text: completion.text,
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy",
    meta: buildNarratorMeta(config, completion)
  };
}

export async function generateTurnNarrationViaSingleAgentServerProxy(
  input: TurnNarrationInput
): Promise<TurnNarrationOutput> {
  const config = getServerProxyConfig({
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig
  });
  const systemPrompt = await buildNarratorSystemPrompt(input.locale, {
    difficulty: input.difficulty,
    profileId: config.profileId
  });
  const completion = await callChatCompletion(config, [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: buildTurnTaskText({
        locale: input.locale,
        storyTitle: input.storyTitle,
        round: input.round,
        playerInput: input.playerInput,
        conversationContext: input.conversationContext
      })
    }
  ]);

  return {
    text: completion.text,
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy",
    meta: buildNarratorMeta(config, completion)
  };
}

export async function generateStructuredAssistantOutputViaServerProxy(
  input: StructuredAssistantInput
): Promise<StructuredAssistantOutput> {
  const config = getServerProxyConfig({
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig
  });
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: input.systemPrompt
    },
    {
      role: "user",
      content: input.userPrompt
    }
  ];

  let completion: TextCompletionResult | null = null;
  let data: Record<string, unknown> | null = null;

  if (shouldAttemptStrictStructuredSchema(config)) {
    try {
      completion = await callChatCompletion(config, messages, {
        temperature: input.temperature ?? 0,
        responseFormat: {
          type: "json_schema",
          name: input.schemaName,
          schema: input.outputSchema,
          strict: true
        }
      });
      data = parseStructuredJsonObject(completion.text);
    } catch {
      completion = null;
      data = null;
    }
  }

  if (!completion || !data) {
    completion = await callChatCompletion(config, messages, {
      temperature: input.temperature ?? 0,
      responseFormat: {
        type: "json_object"
      }
    });
    data = parseStructuredJsonObject(completion.text);
  }

  return {
    data,
    rawText: completion.text,
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy",
    meta: buildNarratorMeta(config, completion)
  };
}

export async function judgeEndingViaServerProxy(
  input: EndingJudgeInput
): Promise<EndingJudgeOutput> {
  const config = getServerProxyConfig({
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig
  });
  const systemPrompt = await buildEndingJudgeSystemPrompt(input.locale, {
    profileId: config.profileId
  });
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: buildEndingJudgeUserPrompt({
        locale: input.locale,
        round: input.round,
        narrationText: input.narrationText
      })
    }
  ];

  let judgeDecision = null;
  let rawText = "";
  let meta: TurnNarrationOutput["meta"] | null = null;

  try {
    const structured = await generateStructuredAssistantOutputViaServerProxy({
      accessMode: input.accessMode,
      modelProfileId: input.modelProfileId,
      runtimeModelConfig: input.runtimeModelConfig,
      locale: input.locale,
      systemPrompt,
      userPrompt: messages[1]?.content ?? "",
      schemaName: "ending_judge_decision",
      outputSchema: await loadEndingJudgeOutputSchema(),
      temperature: 0
    });
    rawText = structured.rawText;
    meta = structured.meta;
    judgeDecision = parseEndingJudgeDecision(structured.rawText);
  } catch {
    judgeDecision = buildDefaultEndingJudgeDecision();
  }

  const adjudication = buildEndingAdjudicationFromDecision(judgeDecision, input.round);

  return {
    adjudication,
    judgeDecision,
    rawText,
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy",
    meta: meta ?? {
      provider: `${config.providerLabel}:${config.model}`,
      mode: "server_proxy",
      model: config.model,
      durationMs: null,
      estimatedCost: null,
      usage: null,
      reasoningContent: null
    }
  };
}
