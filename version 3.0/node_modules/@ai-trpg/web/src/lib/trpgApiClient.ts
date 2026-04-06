import type {
  BootstrapResponse,
  CreateSessionRequest,
  SessionSnapshot,
  SubmitTurnRequest
} from "../../../../packages/shared-types/src/index.ts";

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message ?? "请求失败");
  }

  return data;
}

function normalizeNetworkError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(
      "无法连接到本地 API 服务。请确认 gameplay server 正在运行，并访问 http://127.0.0.1:4316/ 。"
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

export async function fetchSession(sessionId: string): Promise<SessionSnapshot> {
  try {
    const response = await fetch(`/api/sessions/${sessionId}`);
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
