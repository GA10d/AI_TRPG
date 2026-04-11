import { Buffer } from "node:buffer";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLanguageSystemPrompt,
  estimateModelUsageCost,
  fromLocaleCode
} from "../../../../packages/shared-config/src/index.ts";
import type { AiGenerationUsage } from "../../../../packages/shared-types/src/index.ts";
import type {
  OpeningGenerationInput,
  OpeningGenerationOutput,
  OpeningGenerationStreamOptions,
  TurnNarrationInput,
  TurnNarrationOutput
} from "./types.ts";
import { getServerProxyConfig, type ServerProxyConfig } from "./config.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const beginningPromptDir = join(projectRoot, "apps", "prompt", "beginning");
const promptFileExtensions = new Set([".txt", ".md", ".markdown"]);

let cachedBeginningSystemPrompt: string | null = null;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
    message?: {
      content?: unknown;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type ResponsesApiResponse = {
  type?: string;
  delta?: string;
  text?: string;
  response?: {
    output_text?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
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

type ChatCompletionResult = {
  text: string;
  durationMs: number;
  usage: AiGenerationUsage;
};

type UploadedGeminiFile = {
  name: string;
  uri: string;
  mimeType: string;
};

type SseEventPayload = {
  event: string | null;
  data: string;
};

type StreamTextOptions = {
  onTextDelta?: (delta: string) => void | Promise<void>;
  signal?: AbortSignal;
};

async function loadBeginningSystemPrompt(): Promise<string> {
  if (cachedBeginningSystemPrompt !== null) {
    return cachedBeginningSystemPrompt;
  }

  const fileNames = (await readdir(beginningPromptDir))
    .filter((fileName) => promptFileExtensions.has(extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, "en"));

  if (fileNames.length === 0) {
    throw new Error("apps/prompt/beginning does not contain any prompt files.");
  }

  const contents = await Promise.all(
    fileNames.map((fileName) =>
      readFile(join(beginningPromptDir, fileName), "utf8").then((content) => content.trim())
    )
  );

  cachedBeginningSystemPrompt = contents.filter(Boolean).join("\n\n");
  return cachedBeginningSystemPrompt;
}

function buildOpeningTaskText(input: OpeningGenerationInput): string {
  return [
    `Target language: ${input.locale}`,
    buildLanguageSystemPrompt(input.locale),
    "",
    `Rule title: ${input.ruleTitle}`,
    `Story title: ${input.storyTitle}`,
    "Two files are attached in this request:",
    "- rule.txt contains the complete rule text.",
    "- story.txt contains the complete story text.",
    "",
    "Task:",
    "Generate the opening preview text shown before the session starts.",
    "Keep the output immersive and player-facing.",
    "Do not reveal hidden spoilers unless they are necessary for the immediate setup.",
    "Return only the opening preview text."
  ].join("\n");
}

async function buildOpeningMessages(input: OpeningGenerationInput): Promise<ChatMessage[]> {
  const openingSystemPrompt = await loadBeginningSystemPrompt();
  const languageDefinition = fromLocaleCode(input.locale);
  const openingLanguageLine = `请严格以${languageDefinition.nativeName}（${languageDefinition.code}）回答。`;

  return [
    {
      role: "system",
      content: [openingSystemPrompt, openingLanguageLine].filter(Boolean).join("\n")
    },
    {
      role: "user",
      content: [`Rule title: ${input.ruleTitle}`, "Rule content:", input.ruleText].join("\n")
    },
    {
      role: "assistant",
      content: [`Story title: ${input.storyTitle}`, "Story content:", input.storyText].join(
        "\n"
      )
    },
    {
      role: "user",
      content: buildOpeningTaskText(input)
    }
  ];
}

function buildTurnMessages(input: TurnNarrationInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are the game master of a tabletop RPG session.",
        buildLanguageSystemPrompt(input.locale),
        "Respond with immersive narration that advances the scene.",
        "Stay grounded in the supplied state summary and end with a clear next beat or question."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Story title: ${input.storyTitle}`,
        `Round: ${input.round}`,
        `Player action: ${input.playerInput}`,
        "",
        "Recent conversation context:",
        input.conversationContext || "No recent conversation context.",
        "",
        "Task:",
        "Write the next GM narration for the player. Keep it concise, specific, and actionable."
      ].join("\n")
    }
  ];
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
      .map((part) => part.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .trim() ?? ""
  );
}

function normalizeGeminiOutput(data: GeminiGenerateContentResponse): string {
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
      .trim() ?? ""
  );
}

function buildOpenAiUsage(data: ChatCompletionResponse | ResponsesApiResponse) {
  const promptTokens =
    data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? null;
  const completionTokens =
    data.usage?.completion_tokens ?? data.usage?.output_tokens ?? null;
  const promptCacheHitTokens =
    (data.usage as { prompt_cache_hit_tokens?: number } | undefined)?.prompt_cache_hit_tokens ??
    (
      data.usage as {
        input_tokens_details?: { cached_tokens?: number };
        prompt_tokens_details?: { cached_tokens?: number };
      } | undefined
    )?.input_tokens_details?.cached_tokens ??
    (
      data.usage as {
        input_tokens_details?: { cached_tokens?: number };
        prompt_tokens_details?: { cached_tokens?: number };
      } | undefined
    )?.prompt_tokens_details?.cached_tokens ??
    null;
  const promptCacheMissTokens =
    (data.usage as { prompt_cache_miss_tokens?: number } | undefined)?.prompt_cache_miss_tokens ??
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

function buildGeminiUsage(data: GeminiGenerateContentResponse) {
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

function splitTextIntoStreamChunks(text: string): string[] {
  const tokens = text.match(/\S+\s*|\n+/gu) ?? [text];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const token of tokens) {
    if (
      currentChunk.length > 0 &&
      currentChunk.length + token.length > 40 &&
      !token.includes("\n")
    ) {
      chunks.push(currentChunk);
      currentChunk = token;
      continue;
    }

    currentChunk += token;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Opening preview stream aborted.");
  }
}

async function emitTextAsChunks(
  text: string,
  options?: StreamTextOptions
): Promise<void> {
  for (const chunk of splitTextIntoStreamChunks(text)) {
    throwIfAborted(options?.signal);
    await options?.onTextDelta?.(chunk);
  }
}

function createCombinedAbortController(
  timeoutMs: number,
  signal: AbortSignal | undefined
): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const handleAbort = () => controller.abort();
  signal?.addEventListener("abort", handleAbort);

  return {
    controller,
    cleanup: () => {
      clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", handleAbort);
    }
  };
}

async function* readSseEvents(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<SseEventPayload> {
  if (!response.body) {
    throw new Error("Streaming response body is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      buffer += decoder
        .decode(value ?? new Uint8Array(), {
          stream: !done
        })
        .replace(/\r\n/gu, "\n");

      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf("\n\n");

        const lines = rawEvent
          .split(/\r?\n/u)
          .map((line) => line.trimEnd())
          .filter(Boolean);
        if (lines.length === 0) {
          continue;
        }

        let eventName: string | null = null;
        const dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice("event:".length).trim();
            continue;
          }

          if (line.startsWith("data:")) {
            dataLines.push(line.slice("data:".length).trimStart());
          }
        }

        if (dataLines.length === 0) {
          continue;
        }

        yield {
          event: eventName,
          data: dataLines.join("\n")
        };
      }

      if (done) {
        break;
      }
    }

    const trailing = buffer.trim();
    if (trailing.length > 0) {
      const dataLine = trailing
        .split(/\r?\n/u)
        .find((line) => line.trimStart().startsWith("data:"));
      if (dataLine) {
        yield {
          event: null,
          data: dataLine.trimStart().slice("data:".length).trimStart()
        };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function callChatCompletion(
  config: ServerProxyConfig,
  messages: ChatMessage[]
): Promise<ChatCompletionResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: config.temperature
    };

    if (config.maxTokens !== null) {
      payload.max_tokens = config.maxTokens;
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
      durationMs: Date.now() - startedAt,
      usage: buildOpenAiUsage(data)
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function callChatCompletionStream(
  config: ServerProxyConfig,
  messages: ChatMessage[],
  options?: StreamTextOptions
): Promise<ChatCompletionResult> {
  const startedAt = Date.now();
  const { controller, cleanup } = createCombinedAbortController(
    config.timeoutMs,
    options?.signal
  );
  let latestUsage: AiGenerationUsage = {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    promptCacheHitTokens: null,
    promptCacheMissTokens: null
  };
  let text = "";

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      messages,
      temperature: config.temperature,
      stream: true,
      stream_options: {
        include_usage: true
      }
    };

    if (config.maxTokens !== null) {
      payload.max_tokens = config.maxTokens;
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

    if (!response.ok) {
      const responseText = await readResponseText(response);
      throw new Error(
        responseText || `server_proxy stream request failed with HTTP ${response.status}.`
      );
    }

    for await (const event of readSseEvents(response, options?.signal)) {
      if (event.data === "[DONE]") {
        break;
      }

      const data = JSON.parse(event.data) as ChatCompletionResponse;
      if (data.error?.message) {
        throw new Error(data.error.message);
      }

      const delta = normalizeContent(data.choices?.[0]?.delta?.content);
      if (delta) {
        text += delta;
        await options?.onTextDelta?.(delta);
      }

      if (data.usage) {
        latestUsage = buildOpenAiUsage(data);
      }
    }

    if (!text) {
      throw new Error("server_proxy stream returned an empty completion.");
    }

    return {
      text,
      durationMs: Date.now() - startedAt,
      usage: latestUsage
    };
  } finally {
    cleanup();
  }
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

  const payload = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(
      payload.error?.message ?? `OpenAI file upload failed with HTTP ${response.status}.`
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
    // Ignore cleanup failures. Uploaded files expire automatically on the provider side.
  }
}

async function callOpenAiResponsesWithFiles(
  config: ServerProxyConfig,
  input: OpeningGenerationInput,
  openingSystemPrompt: string,
  ruleFileId: string,
  storyFileId: string
): Promise<ChatCompletionResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      instructions: openingSystemPrompt,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildOpeningTaskText(input)
            },
            {
              type: "input_file",
              file_id: ruleFileId
            },
            {
              type: "input_file",
              file_id: storyFileId
            }
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
      throw new Error("OpenAI responses request returned an empty opening preview.");
    }

    return {
      text,
      durationMs: Date.now() - startedAt,
      usage: buildOpenAiUsage(data)
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function callOpenAiResponsesWithFilesStream(
  config: ServerProxyConfig,
  input: OpeningGenerationInput,
  openingSystemPrompt: string,
  ruleFileId: string,
  storyFileId: string,
  options?: StreamTextOptions
): Promise<ChatCompletionResult> {
  const startedAt = Date.now();
  const { controller, cleanup } = createCombinedAbortController(
    config.timeoutMs,
    options?.signal
  );
  let latestUsage: AiGenerationUsage = {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    promptCacheHitTokens: null,
    promptCacheMissTokens: null
  };
  let text = "";

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      instructions: openingSystemPrompt,
      stream: true,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildOpeningTaskText(input)
            },
            {
              type: "input_file",
              file_id: ruleFileId
            },
            {
              type: "input_file",
              file_id: storyFileId
            }
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

    if (!response.ok) {
      const responseText = await readResponseText(response);
      throw new Error(
        responseText || `OpenAI responses stream failed with HTTP ${response.status}.`
      );
    }

    for await (const event of readSseEvents(response, options?.signal)) {
      if (event.data === "[DONE]") {
        break;
      }

      const data = JSON.parse(event.data) as ResponsesApiResponse;
      if (data.error?.message) {
        throw new Error(data.error.message);
      }

      if (data.type === "response.output_text.delta" && typeof data.delta === "string") {
        text += data.delta;
        await options?.onTextDelta?.(data.delta);
      }

      if (data.response?.usage) {
        latestUsage = buildOpenAiUsage({
          usage: data.response.usage
        } as ResponsesApiResponse);
      }

      if (
        data.type === "response.completed" &&
        !text &&
        typeof data.response?.output_text === "string" &&
        data.response.output_text.trim().length > 0
      ) {
        text = data.response.output_text.trim();
        await options?.onTextDelta?.(text);
      }
    }

    if (!text) {
      throw new Error("OpenAI responses stream returned an empty opening preview.");
    }

    return {
      text,
      durationMs: Date.now() - startedAt,
      usage: latestUsage
    };
  } finally {
    cleanup();
  }
}

function getGeminiApiRoot(config: ServerProxyConfig): string {
  return config.baseUrl.replace(/\/v1beta\/openai$/u, "");
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
    // Ignore cleanup failures. Gemini also expires uploaded files automatically.
  }
}

async function callGeminiGenerateContentWithFiles(
  config: ServerProxyConfig,
  input: OpeningGenerationInput,
  openingSystemPrompt: string,
  ruleFile: UploadedGeminiFile,
  storyFile: UploadedGeminiFile
): Promise<ChatCompletionResult> {
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
                text: openingSystemPrompt
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildOpeningTaskText(input)
                },
                {
                  file_data: {
                    mime_type: ruleFile.mimeType,
                    file_uri: ruleFile.uri
                  }
                },
                {
                  file_data: {
                    mime_type: storyFile.mimeType,
                    file_uri: storyFile.uri
                  }
                }
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
      throw new Error("Gemini generateContent returned an empty opening preview.");
    }

    return {
      text,
      durationMs: Date.now() - startedAt,
      usage: buildGeminiUsage(data)
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function callOpeningWithUploadedFiles(
  config: ServerProxyConfig,
  input: OpeningGenerationInput
): Promise<ChatCompletionResult> {
  const openingSystemPrompt = await loadBeginningSystemPrompt();

  if (config.dependence === "Google") {
    let uploadedRuleFile: UploadedGeminiFile | null = null;
    let uploadedStoryFile: UploadedGeminiFile | null = null;

    try {
      uploadedRuleFile = await uploadGeminiUserFile(
        config,
        "rule.txt",
        [`Rule title: ${input.ruleTitle}`, "", input.ruleText].join("\n")
      );
      uploadedStoryFile = await uploadGeminiUserFile(
        config,
        "story.txt",
        [`Story title: ${input.storyTitle}`, "", input.storyText].join("\n")
      );

      return await callGeminiGenerateContentWithFiles(
        config,
        input,
        openingSystemPrompt,
        uploadedRuleFile,
        uploadedStoryFile
      );
    } finally {
      await deleteGeminiUserFile(config, uploadedStoryFile?.name ?? null);
      await deleteGeminiUserFile(config, uploadedRuleFile?.name ?? null);
    }
  }

  let ruleFileId: string | null = null;
  let storyFileId: string | null = null;

  try {
    ruleFileId = await uploadOpenAiUserFile(
      config,
      "rule.txt",
      [`Rule title: ${input.ruleTitle}`, "", input.ruleText].join("\n")
    );
    storyFileId = await uploadOpenAiUserFile(
      config,
      "story.txt",
      [`Story title: ${input.storyTitle}`, "", input.storyText].join("\n")
    );

    return await callOpenAiResponsesWithFiles(
      config,
      input,
      openingSystemPrompt,
      ruleFileId,
      storyFileId
    );
  } finally {
    await deleteOpenAiUserFile(config, storyFileId);
    await deleteOpenAiUserFile(config, ruleFileId);
  }
}

async function callOpeningWithUploadedFilesStream(
  config: ServerProxyConfig,
  input: OpeningGenerationInput,
  options?: StreamTextOptions
): Promise<ChatCompletionResult> {
  const openingSystemPrompt = await loadBeginningSystemPrompt();

  if (config.dependence === "Google") {
    const completion = await callOpeningWithUploadedFiles(config, input);
    await emitTextAsChunks(completion.text, options);
    return completion;
  }

  let ruleFileId: string | null = null;
  let storyFileId: string | null = null;

  try {
    ruleFileId = await uploadOpenAiUserFile(
      config,
      "rule.txt",
      [`Rule title: ${input.ruleTitle}`, "", input.ruleText].join("\n")
    );
    storyFileId = await uploadOpenAiUserFile(
      config,
      "story.txt",
      [`Story title: ${input.storyTitle}`, "", input.storyText].join("\n")
    );

    return await callOpenAiResponsesWithFilesStream(
      config,
      input,
      openingSystemPrompt,
      ruleFileId,
      storyFileId,
      options
    );
  } finally {
    await deleteOpenAiUserFile(config, storyFileId);
    await deleteOpenAiUserFile(config, ruleFileId);
  }
}

export async function generateOpeningViaServerProxy(
  input: OpeningGenerationInput
): Promise<OpeningGenerationOutput> {
  const config = getServerProxyConfig({
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig
  });

  const completion = config.features.file_upload.supported
    ? await callOpeningWithUploadedFiles(config, input)
    : await callChatCompletion(config, await buildOpeningMessages(input));

  return {
    text: completion.text,
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy",
    meta: {
      provider: `${config.providerLabel}:${config.model}`,
      mode: "server_proxy",
      model: config.model,
      durationMs: completion.durationMs,
      estimatedCost: estimateModelUsageCost({
        model: config.model,
        usage: completion.usage
      }),
      usage: completion.usage
    }
  };
}

export async function streamOpeningViaServerProxy(
  input: OpeningGenerationInput,
  options?: OpeningGenerationStreamOptions
): Promise<OpeningGenerationOutput> {
  const config = getServerProxyConfig({
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig
  });

  const completion = config.features.file_upload.supported
    ? await callOpeningWithUploadedFilesStream(config, input, options)
    : await callChatCompletionStream(
        config,
        await buildOpeningMessages(input),
        options
      );

  return {
    text: completion.text,
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy",
    meta: {
      provider: `${config.providerLabel}:${config.model}`,
      mode: "server_proxy",
      model: config.model,
      durationMs: completion.durationMs,
      estimatedCost: estimateModelUsageCost({
        model: config.model,
        usage: completion.usage
      }),
      usage: completion.usage
    }
  };
}

export async function generateTurnNarrationViaServerProxy(
  input: TurnNarrationInput
): Promise<TurnNarrationOutput> {
  const config = getServerProxyConfig({
    modelProfileId: input.modelProfileId,
    runtimeModelConfig: input.runtimeModelConfig
  });
  const completion = await callChatCompletion(config, buildTurnMessages(input));
  return {
    text: completion.text,
    provider: `${config.providerLabel}:${config.model}`,
    mode: "server_proxy",
    meta: {
      provider: `${config.providerLabel}:${config.model}`,
      mode: "server_proxy",
      model: config.model,
      durationMs: completion.durationMs,
      estimatedCost: estimateModelUsageCost({
        model: config.model,
        usage: completion.usage
      }),
      usage: completion.usage
    },
    adjudication: null
  };
}
