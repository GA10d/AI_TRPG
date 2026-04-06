import type {
  BootstrapResponse,
  CreateSessionRequest,
  SessionSnapshot,
  SubmitTurnRequest
} from "../../../packages/shared-types/src/index.ts";

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message ?? "请求失败");
  }

  return data;
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  const response = await fetch("/api/bootstrap");
  return parseJson<BootstrapResponse>(response);
}

export async function createSession(
  payload: CreateSessionRequest
): Promise<SessionSnapshot> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson<SessionSnapshot>(response);
}

export async function submitTurn(
  sessionId: string,
  payload: SubmitTurnRequest
): Promise<SessionSnapshot> {
  const response = await fetch(`/api/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson<SessionSnapshot>(response);
}
