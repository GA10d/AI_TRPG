import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BootstrapResponse,
  CreateSessionRequest,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";

type HealthResponse = {
  ok: boolean;
  now: string;
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../..");
const serverEntryPath = resolve(projectRoot, "apps/server/src/server.ts");
const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "4316"}`;

function getRequestedMode(): CreateSessionRequest["modelAccessMode"] {
  const rawArg = process.argv.find((item) => item.startsWith("--mode="));
  const cliValue = rawArg?.split("=", 2)[1];
  const envValue = process.env.TRPG_REAL_FLOW_MODE;
  const requested = (cliValue ?? envValue ?? "server_proxy").trim();

  if (requested === "mock" || requested === "server_proxy") {
    return requested;
  }

  return "server_proxy";
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message ?? `HTTP ${response.status}`);
  }

  return data;
}

async function waitForHealth(timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      const data = await parseJson<HealthResponse>(response);
      if (data.ok) {
        return true;
      }
    } catch {
      // ignore and retry
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  return false;
}

async function isServerAlreadyRunning(): Promise<boolean> {
  return waitForHealth(1_000);
}

function startLocalServer(): ChildProcess {
  return spawn(
    process.execPath,
    ["--experimental-strip-types", serverEntryPath],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
}

async function ensureServer(): Promise<{
  child: ChildProcess | null;
  startedByScript: boolean;
}> {
  if (await isServerAlreadyRunning()) {
    return {
      child: null,
      startedByScript: false
    };
  }

  const child = startLocalServer();
  let stdoutBuffer = "";
  let stderrBuffer = "";
  child.stdout?.on("data", (chunk) => {
    stdoutBuffer += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderrBuffer += String(chunk);
  });

  const ready = await waitForHealth(20_000);
  if (!ready) {
    child.kill();
    throw new Error(
      [
        "无法在 20 秒内启动本地服务。",
        stdoutBuffer ? `stdout:\n${stdoutBuffer.trim()}` : "",
        stderrBuffer ? `stderr:\n${stderrBuffer.trim()}` : ""
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  }

  return {
    child,
    startedByScript: true
  };
}

async function fetchBootstrapData(): Promise<BootstrapResponse> {
  const response = await fetch(`${baseUrl}/api/bootstrap`);
  return parseJson<BootstrapResponse>(response);
}

async function createNewSession(
  payload: CreateSessionRequest
): Promise<SessionSnapshot> {
  const response = await fetch(`${baseUrl}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson<SessionSnapshot>(response);
}

async function submitTurnForSession(
  sessionId: string,
  playerInput: string
): Promise<SessionSnapshot> {
  const response = await fetch(`${baseUrl}/api/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      playerInput
    })
  });

  return parseJson<SessionSnapshot>(response);
}

function buildRequestFromBootstrap(
  bootstrap: BootstrapResponse,
  mode: CreateSessionRequest["modelAccessMode"]
): CreateSessionRequest {
  const firstRule = bootstrap.catalog[0];
  const firstStory = firstRule?.stories[0];

  if (!firstRule || !firstStory) {
    throw new Error("当前 catalog 里没有可用的 rule/story。");
  }

  if (mode === "server_proxy" && !bootstrap.serverProxyStatus.available) {
    throw new Error(
      `${bootstrap.serverProxyStatus.message}\n请先参考 version 3.0/.env.example 配置真实模型。`
    );
  }

  return {
    ruleDirectoryName: firstRule.directoryName,
    storyDirectoryName: firstStory.directoryName,
    locale: bootstrap.defaults.locale,
    playMode: bootstrap.defaults.playMode,
    gmArchitecture: bootstrap.defaults.gmArchitecture,
    modelAccessMode: mode,
    debugEnabled: true,
    promptDebugEnabled: false,
    logViewMode: bootstrap.defaults.logViewMode
  };
}

async function main(): Promise<void> {
  const mode = getRequestedMode();
  const serverHandle = await ensureServer();

  try {
    console.log(`[flow] using base url: ${baseUrl}`);
    console.log(`[flow] model access mode: ${mode}`);
    console.log(
      `[flow] server source: ${serverHandle.startedByScript ? "spawned locally" : "existing instance"}`
    );

    const bootstrap = await fetchBootstrapData();
    const request = buildRequestFromBootstrap(bootstrap, mode);
    const created = await createNewSession(request);
    const progressed = await submitTurnForSession(
      created.session.id,
      "I inspect the video hall and ask what happened last night."
    );

    console.log(`[flow] created session: ${created.session.id}`);
    console.log(`[flow] story: ${created.contentSummary.storyTitle}`);
    console.log(`[flow] opening provider: ${created.messages[1]?.tags?.join(", ") ?? "unknown"}`);
    console.log(`[flow] round after turn: ${progressed.session.currentRound}`);
    console.log(`[flow] current scene: ${progressed.session.gameState.sceneId}`);
    console.log(
      `[flow] final narration preview: ${progressed.messages.at(-1)?.content.slice(0, 160) ?? "empty"}`
    );
    console.log("[flow] real business flow passed.");
  } finally {
    if (serverHandle.child) {
      serverHandle.child.kill();
    }
  }
}

void main();
