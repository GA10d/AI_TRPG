import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  listEnabledLanguages,
  PHASE1_DEFAULTS,
  PHASE1_MODEL_ACCESS_MODE_OPTIONS,
  toLanguageOptionPayload
} from "../../../packages/shared-config/src/index.ts";
import type {
  BootstrapResponse,
  CreateSessionRequest
} from "../../../packages/shared-types/src/index.ts";
import { loadContentCatalog } from "./content/index.ts";
import {
  buildDefaultCreateSessionRequest,
  createSessionSnapshot
} from "./session/index.ts";
import { InMemorySessionStore } from "./session/store.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../..");
const contentRoot = join(projectRoot, "content");
const webPublicRoot = join(projectRoot, "apps", "web", "public");
const store = new InMemorySessionStore();
const port = Number(process.env.PORT ?? 4316);

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body) as T;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response: ServerResponse, statusCode: number, content: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(content);
}

async function serveStaticFile(response: ServerResponse, relativePath: string): Promise<void> {
  const normalizedPath = relativePath === "/" ? "/index.html" : relativePath;
  const absolutePath = resolve(webPublicRoot, `.${normalizedPath}`);

  if (!absolutePath.startsWith(webPublicRoot)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  let fileContent: Buffer;
  try {
    fileContent = await readFile(absolutePath);
  } catch {
    sendText(response, 404, "Not Found");
    return;
  }

  const mimeType = mimeTypes[extname(absolutePath)] ?? "application/octet-stream";

  response.writeHead(200, {
    "Content-Type": mimeType
  });
  response.end(fileContent);
}

function buildBootstrapResponse(catalog: BootstrapResponse["catalog"]): BootstrapResponse {
  return {
    defaults: {
      locale: PHASE1_DEFAULTS.locale,
      playMode: PHASE1_DEFAULTS.playMode,
      gmArchitecture: PHASE1_DEFAULTS.gmArchitecture,
      modelAccessMode: PHASE1_DEFAULTS.modelAccessMode,
      logViewMode: PHASE1_DEFAULTS.logViewMode
    },
    languages: listEnabledLanguages().map((item) => toLanguageOptionPayload(item.code)),
    modelAccessModes: PHASE1_MODEL_ACCESS_MODE_OPTIONS.map((item) => ({
      code: item.code,
      label: item.label,
      description: item.description
    })),
    catalog
  };
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<boolean> {
  if (!request.url) {
    return false;
  }

  const url = new URL(request.url, `http://127.0.0.1:${port}`);

  if (url.pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      now: new Date().toISOString()
    });
    return true;
  }

  if (url.pathname === "/api/bootstrap" && request.method === "GET") {
    const catalog = await loadContentCatalog(contentRoot);
    sendJson(response, 200, buildBootstrapResponse(catalog));
    return true;
  }

  if (url.pathname === "/api/default-session-request" && request.method === "GET") {
    sendJson(response, 200, buildDefaultCreateSessionRequest());
    return true;
  }

  if (url.pathname === "/api/sessions" && request.method === "POST") {
    const payload = await readJsonBody<CreateSessionRequest>(request);
    const snapshot = await createSessionSnapshot(contentRoot, payload, store);
    sendJson(response, 201, snapshot);
    return true;
  }

  if (url.pathname.startsWith("/api/sessions/") && request.method === "GET") {
    const sessionId = url.pathname.replace("/api/sessions/", "");
    const snapshot = store.get(sessionId);

    if (!snapshot) {
      sendJson(response, 404, {
        error: "SESSION_NOT_FOUND",
        message: `未找到 session: ${sessionId}`
      });
      return true;
    }

    sendJson(response, 200, snapshot);
    return true;
  }

  return false;
}

const server = createServer(async (request, response) => {
  try {
    const handledByApi = await handleApiRequest(request, response);
    if (handledByApi) {
      return;
    }

    if (!request.url) {
      sendText(response, 400, "Bad Request");
      return;
    }

    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (request.method === "GET") {
      await serveStaticFile(response, url.pathname);
      return;
    }

    sendText(response, 404, "Not Found");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 500, {
      error: "INTERNAL_SERVER_ERROR",
      message
    });
  }
});

server.listen(port, () => {
  console.log(`Phase 1 server is running at http://127.0.0.1:${port}`);
});
