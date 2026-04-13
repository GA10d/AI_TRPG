import type {
  BootstrapResponse,
  CharacterConceptAssistRequest,
  CharacterConceptAssistResponse,
  CommitRoundRequest,
  CreateSaveResponse,
  CreateSessionRequest,
  GenerateOpeningPreviewRequest,
  GenerateOpeningPreviewResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  NpcRosterEntry,
  PrepareRoundRequest,
  SaveBundle,
  SendPrivateChatRequest,
  SessionCreateStreamEvent,
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
      data = JSON.parse(responseText) as T & { message?: string };
    } catch {
      if (!response.ok) {
        throw new Error(responseText.trim());
      }

      throw new Error("The server returned a non-JSON response.");
    }
  }

  if (!response.ok) {
    throw new Error(data?.message ?? (responseText.trim() || "Request failed."));
  }

  if (!data) {
    throw new Error("The server returned an empty response.");
  }

  return data;
}

function normalizeNetworkError(error: unknown): Error {
  if (error instanceof DOMException && error.name === "AbortError") {
    return error;
  }

  if (error instanceof TypeError) {
    return new Error(
      "Unable to reach the local API service. Make sure the game server is running at http://127.0.0.1:4316/."
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

export async function streamCreateSession(
  payload: CreateSessionRequest,
  options?: {
    signal?: AbortSignal;
    onStage?: (event: Extract<SessionCreateStreamEvent, { type: "stage" }>) => void;
  }
): Promise<SessionSnapshot> {
  try {
    const response = await fetch("/api/sessions/stream", {
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
      throw new Error("The session creation stream did not return readable data.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalSnapshot: SessionSnapshot | null = null;

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

          const event = JSON.parse(rawLine) as SessionCreateStreamEvent;
          if (event.type === "stage") {
            options?.onStage?.(event);
            continue;
          }

          if (event.type === "error") {
            throw new Error(event.message || "Session creation failed.");
          }

          finalSnapshot = event.snapshot;
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
      const event = JSON.parse(trailing) as SessionCreateStreamEvent;
      if (event.type === "stage") {
        options?.onStage?.(event);
      } else if (event.type === "error") {
        throw new Error(event.message || "Session creation failed.");
      } else {
        finalSnapshot = event.snapshot;
      }
    }

    if (!finalSnapshot) {
      throw new Error("The session creation stream ended without a final session payload.");
    }

    return finalSnapshot;
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
      throw new Error("The preview stream did not return readable data.");
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
            throw new Error(event.message || "Opening preview streaming failed.");
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
        throw new Error(event.message || "Opening preview streaming failed.");
      } else {
        finalResult = event.result;
      }
    }

    if (!finalResult) {
      throw new Error("The opening preview stream ended without a final result.");
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
        "The character concept AI endpoint is not available right now. You may still be connected to an older version 3.0 server process, so please restart the server and try again."
      );
    }

    throw normalizeNetworkError(error);
  }
}

export async function fetchNpcRoster(
  ruleDirectoryName: string,
  storyDirectoryName: string
): Promise<NpcRosterEntry[]> {
  try {
    const searchParams = new URLSearchParams({
      ruleDirectoryName,
      storyDirectoryName
    });
    const response = await fetch(`/api/npcs?${searchParams.toString()}`);
    return parseJson<NpcRosterEntry[]>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function generateSceneImage(
  payload: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  try {
    const response = await fetch("/api/images/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return parseJson<ImageGenerationResponse>(response);
  } catch (error) {
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

export async function prepareRound(
  sessionId: string,
  payload: PrepareRoundRequest
): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/rounds/prepare`, {
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

export async function commitPreparedRound(
  sessionId: string,
  payload: CommitRoundRequest = {}
): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/rounds/commit`, {
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

export async function sendPrivateChat(
  sessionId: string,
  payload: SendPrivateChatRequest
): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/private-chat`, {
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
