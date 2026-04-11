import type {
  BootstrapResponse,
  CharacterConceptAssistRequest,
  CharacterConceptAssistResponse,
  CreateSaveResponse,
  CreateSessionRequest,
  GenerateOpeningPreviewRequest,
  GenerateOpeningPreviewResponse,
  SaveBundle,
  SessionSnapshot,
  SubmitTurnRequest
} from "../../../../packages/shared-types/src/index.ts";

type OpeningPreviewStreamEvent =
  | {
      type: "delta";
      delta: string;
    }
  | {
      type: "done";
      result: GenerateOpeningPreviewResponse;
    }
  | {
      type: "error";
      message: string;
    };

async function parseJson<T>(response: Response): Promise<T> {
  const responseText = await response.text();
  let data: (T & { message?: string }) | null = null;

  if (responseText.trim()) {
    try {
      data = JSON.parse(responseText) as T & {
        message?: string;
      };
    } catch {
      if (!response.ok) {
        throw new Error(responseText.trim());
      }

      throw new Error("服务端返回了非 JSON 响应。");
    }
  }

  if (!response.ok) {
    throw new Error(data?.message ?? (responseText.trim() || "请求失败"));
  }

  if (!data) {
    throw new Error("服务端返回了空响应。");
  }

  return data;
}

function normalizeNetworkError(error: unknown): Error {
  if (error instanceof DOMException && error.name === "AbortError") {
    return error;
  }

  if (error instanceof TypeError) {
    return new Error(
      "无法连接到本地 API 服务。请确认游戏服务正在运行，并访问 http://127.0.0.1:4316/ 。"
    );
  }

  return error instanceof Error ? error : new Error(String(error));
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  try {
    const response = await fetch("/api/bootstrap");
    return parseJson<BootstrapResponse>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function createSession(
  payload: CreateSessionRequest
): Promise<SessionSnapshot> {
  try {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return parseJson<SessionSnapshot>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function generateOpeningPreview(
  payload: GenerateOpeningPreviewRequest,
  options?: {
    signal?: AbortSignal;
  }
): Promise<GenerateOpeningPreviewResponse> {
  try {
    const response = await fetch("/api/previews/opening", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: options?.signal
    });

    return parseJson<GenerateOpeningPreviewResponse>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function streamOpeningPreview(
  payload: GenerateOpeningPreviewRequest,
  options?: {
    signal?: AbortSignal;
    onTextDelta?: (delta: string) => void;
  }
): Promise<GenerateOpeningPreviewResponse> {
  try {
    const response = await fetch("/api/previews/opening/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: options?.signal
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    if (!response.body) {
      throw new Error("预览流未返回可读取的数据。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: GenerateOpeningPreviewResponse | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), {
          stream: !done
        });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const rawLine = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");

          if (!rawLine) {
            continue;
          }

          const event = JSON.parse(rawLine) as OpeningPreviewStreamEvent;
          if (event.type === "delta") {
            options?.onTextDelta?.(event.delta);
            continue;
          }

          if (event.type === "error") {
            throw new Error(event.message || "开场预览流生成失败。");
          }

          finalResult = event.result;
        }

        if (done) {
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    const trailing = buffer.trim();
    if (trailing) {
      const event = JSON.parse(trailing) as OpeningPreviewStreamEvent;
      if (event.type === "delta") {
        options?.onTextDelta?.(event.delta);
      } else if (event.type === "error") {
        throw new Error(event.message || "开场预览流生成失败。");
      } else {
        finalResult = event.result;
      }
    }

    if (!finalResult) {
      throw new Error("开场预览流已结束，但没有收到最终结果。");
    }

    return finalResult;
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchSession(sessionId: string): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}`);
    return parseJson<SessionSnapshot>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function assistCharacterConcept(
  payload: CharacterConceptAssistRequest
): Promise<CharacterConceptAssistResponse> {
  try {
    const response = await fetch("/api/character-concept/assist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return parseJson<CharacterConceptAssistResponse>(response);
  } catch (error) {
    if (error instanceof Error && error.message === "Not Found") {
      throw new Error(
        "角色概念 AI 接口当前不可用。现在很可能仍连接着旧的 version 3.0 服务端进程，请重启服务端后再试。"
      );
    }

    throw normalizeNetworkError(error);
  }
}

export async function createSave(sessionId: string): Promise<CreateSaveResponse> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/save`, {
      method: "POST"
    });
    return parseJson<CreateSaveResponse>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function loadSaveBundle(saveBundle: SaveBundle): Promise<SessionSnapshot> {
  try {
    const response = await fetch("/api/saves/load", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        saveBundle
      })
    });
    return parseJson<SessionSnapshot>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function submitTurn(
  sessionId: string,
  payload: SubmitTurnRequest
): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/turns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return parseJson<SessionSnapshot>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}
