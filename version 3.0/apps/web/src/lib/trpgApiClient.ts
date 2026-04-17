import type {
  BootstrapResponse,
  CharacterConceptAssistRequest,
  CharacterConceptAssistResponse,
  CommitRoundRequest,
  ComicPromptPresetResponse,
  CreateSaveRequest,
  CreateSaveResponse,
  CreateSessionRequest,
  GenerateOpeningPreviewRequest,
  GenerateOpeningPreviewResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  LocalSaveSettings,
  NpcRosterEntry,
  PrepareNpcPortraitsRequest,
  PrepareNpcPortraitsResponse,
  PickLocalSaveDirectoryRequest,
  PickLocalSaveDirectoryResponse,
  PrepareRoundRequest,
  RegenerateNpcPortraitRequest,
  RegenerateNpcPortraitResponse,
  SavedGameRecord,
  SaveBundle,
  SendPrivateChatRequest,
  SessionContextPackDebugResponse,
  SessionCreateStreamEvent,
  SessionMemoryDebugResponse,
  SessionMemoryRebuildResponse,
  SessionSnapshot,
  SelectNpcPortraitRequest,
  SelectNpcPortraitResponse,
  StoryArtAssetsResponse,
  SubmitManualNarrationRequest,
  SubmitTurnRequest,
  TurnResolutionStreamEvent,
  UpsertWorldlineComicPageRequest,
  UpsertWorldlineComicPageResponse,
  UpdateLocalSaveSettingsRequest,
  UpdateStoryControlModeRequest,
  PersistedComicProject
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

export async function fetchComicPromptPresets(): Promise<ComicPromptPresetResponse> {
  try {
    const response = await fetch("/api/comics/presets");
    return parseJson<ComicPromptPresetResponse>(response);
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

async function readTurnResolutionStream(
  response: Response,
  options?: {
    onStage?: (event: Extract<TurnResolutionStreamEvent, { type: "stage" }>) => void;
  }
): Promise<SessionSnapshot> {
  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (!response.body) {
    throw new Error("The turn resolution stream did not return readable data.");
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

        const event = JSON.parse(rawLine) as TurnResolutionStreamEvent;
        if (event.type === "stage") {
          options?.onStage?.(event);
          continue;
        }

        if (event.type === "error") {
          throw new Error(event.message || "Turn resolution streaming failed.");
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
    const event = JSON.parse(trailing) as TurnResolutionStreamEvent;
    if (event.type === "stage") {
      options?.onStage?.(event);
    } else if (event.type === "error") {
      throw new Error(event.message || "Turn resolution streaming failed.");
    } else {
      finalSnapshot = event.snapshot;
    }
  }

  if (!finalSnapshot) {
    throw new Error("The turn resolution stream ended without a final session payload.");
  }

  return finalSnapshot;
}

export async function fetchSessionMemory(
  sessionId: string
): Promise<SessionMemoryDebugResponse> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/memory`);
    return parseJson<SessionMemoryDebugResponse>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchSessionContextPack(input: {
  sessionId: string;
  target: "narrator" | "companion" | "private_chat";
  participantId?: string | null;
}): Promise<SessionContextPackDebugResponse> {
  try {
    const searchParams = new URLSearchParams({
      target: input.target
    });
    if (input.participantId) {
      searchParams.set("participantId", input.participantId);
    }

    const response = await fetch(
      `/api/sessions/${input.sessionId}/context-pack?${searchParams.toString()}`
    );
    return parseJson<SessionContextPackDebugResponse>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function rebuildSessionMemory(
  sessionId: string
): Promise<SessionMemoryRebuildResponse> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/memory/rebuild`, {
      method: "POST"
    });
    return parseJson<SessionMemoryRebuildResponse>(response);
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
  storyDirectoryName: string,
  styleId?: string
): Promise<NpcRosterEntry[]> {
  try {
    const searchParams = new URLSearchParams({
      ruleDirectoryName,
      storyDirectoryName
    });
    if (styleId?.trim()) {
      searchParams.set("styleId", styleId.trim());
    }
    const response = await fetch(`/api/npcs?${searchParams.toString()}`);
    return parseJson<NpcRosterEntry[]>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchStoryArtAssets(
  ruleDirectoryName: string,
  storyDirectoryName: string
): Promise<StoryArtAssetsResponse> {
  try {
    const searchParams = new URLSearchParams({
      ruleDirectoryName,
      storyDirectoryName
    });
    const response = await fetch(`/api/story-art-assets?${searchParams.toString()}`);
    return parseJson<StoryArtAssetsResponse>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function prepareNpcPortraits(
  payload: PrepareNpcPortraitsRequest
): Promise<PrepareNpcPortraitsResponse> {
  try {
    const response = await fetch("/api/npcs/portraits/prepare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return parseJson<PrepareNpcPortraitsResponse>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function regenerateNpcPortrait(
  payload: RegenerateNpcPortraitRequest
): Promise<RegenerateNpcPortraitResponse> {
  try {
    const response = await fetch("/api/npcs/portraits/regenerate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return parseJson<RegenerateNpcPortraitResponse>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function selectNpcPortrait(
  payload: SelectNpcPortraitRequest
): Promise<SelectNpcPortraitResponse> {
  try {
    const response = await fetch("/api/npcs/portraits/select", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return parseJson<SelectNpcPortraitResponse>(response);
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

export async function createSave(
  sessionId: string,
  payload: CreateSaveRequest = {}
): Promise<CreateSaveResponse> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return parseJson<CreateSaveResponse>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function loadWorldlineComicProject(
  worldlineId: string
): Promise<PersistedComicProject | null> {
  try {
    const response = await fetch(`/api/worldline-comics/${encodeURIComponent(worldlineId)}`);
    if (response.status === 404) {
      return null;
    }

    return parseJson<PersistedComicProject>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function upsertWorldlineComicPage(
  worldlineId: string,
  payload: UpsertWorldlineComicPageRequest
): Promise<UpsertWorldlineComicPageResponse> {
  try {
    const response = await fetch(
      `/api/worldline-comics/${encodeURIComponent(worldlineId)}/pages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    return parseJson<UpsertWorldlineComicPageResponse>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchSavedGames(): Promise<SavedGameRecord[]> {
  try {
    const response = await fetch("/api/saves");
    return parseJson<SavedGameRecord[]>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchLocalSaveSettings(): Promise<LocalSaveSettings> {
  try {
    const response = await fetch("/api/local-settings");
    return parseJson<LocalSaveSettings>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function updateLocalSaveSettings(
  payload: UpdateLocalSaveSettingsRequest
): Promise<LocalSaveSettings> {
  try {
    const response = await fetch("/api/local-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return parseJson<LocalSaveSettings>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function pickLocalSaveDirectory(
  payload: PickLocalSaveDirectoryRequest
): Promise<string | null> {
  try {
    const response = await fetch("/api/local-settings/pick-directory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await parseJson<PickLocalSaveDirectoryResponse>(response);
    return data.selectedPath ?? null;
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function loadSavedGame(saveId: string): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/saves/${encodeURIComponent(saveId)}/load`, {
      method: "POST"
    });
    return parseJson<SessionSnapshot>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function fetchSaveBundle(saveId: string): Promise<SaveBundle> {
  try {
    const response = await fetch(`/api/saves/${encodeURIComponent(saveId)}/bundle`);
    return parseJson<SaveBundle>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function deleteSavedGame(saveId: string): Promise<void> {
  try {
    const response = await fetch(`/api/saves/${encodeURIComponent(saveId)}`, {
      method: "DELETE"
    });
    await parseJson<{ ok: true }>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}

export async function clearSavedGames(): Promise<void> {
  try {
    const response = await fetch("/api/saves", {
      method: "DELETE"
    });
    await parseJson<{ ok: true }>(response);
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

export async function streamSubmitTurn(
  sessionId: string,
  payload: SubmitTurnRequest,
  options?: {
    signal?: AbortSignal;
    onStage?: (event: Extract<TurnResolutionStreamEvent, { type: "stage" }>) => void;
  }
): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/turns/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: options?.signal
    });

    return await readTurnResolutionStream(response, options);
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

export async function streamCommitPreparedRound(
  sessionId: string,
  payload: CommitRoundRequest = {},
  options?: {
    signal?: AbortSignal;
    onStage?: (event: Extract<TurnResolutionStreamEvent, { type: "stage" }>) => void;
  }
): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/rounds/commit/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: options?.signal
    });

    return await readTurnResolutionStream(response, options);
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

export async function submitManualNarration(
  sessionId: string,
  payload: SubmitManualNarrationRequest
): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/manual-narration`, {
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

export async function updateStoryControlMode(
  sessionId: string,
  payload: UpdateStoryControlModeRequest
): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/story-control`, {
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

export async function dismissEnding(sessionId: string): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/ending/dismiss`, {
      method: "POST"
    });

    return parseJson<SessionSnapshot>(response);
  } catch (error) {
    throw normalizeNetworkError(error);
  }
}
