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
const projectRoot = resolve(currentDir, "../../../..");
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

function getRequestedProfileId(): string | undefined {
  const rawArg = process.argv.find((item) => item.startsWith("--profile="));
  const cliValue = rawArg?.split("=", 2)[1]?.trim();
  const envValue = process.env.TRPG_REAL_FLOW_PROFILE_ID?.trim();
  return cliValue || envValue || undefined;
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { message?: string };

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
  try {
    return spawn(process.execPath, ["--experimental-strip-types", serverEntryPath], {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `自动拉起本地服务失败：${message}\n如果你是在受限环境里运行，请先手动启动 dev:server，或者直接在本机双击 scripts/test_real_business.cmd。`
    );
  }
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

async function stopChildProcess(child: ChildProcess | null): Promise<void> {
  if (!child) {
    return;
  }

  if (child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise<void>((resolveStop) => {
    child.once("exit", () => resolveStop());
    child.kill();
    setTimeout(() => resolveStop(), 2_000);
  });
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
    body: JSON.stringify({ playerInput })
  });

  return parseJson<SessionSnapshot>(response);
}

function pickProfileId(
  bootstrap: BootstrapResponse,
  mode: CreateSessionRequest["modelAccessMode"]
): string {
  const requestedProfileId = getRequestedProfileId();
  const matchingProfiles = bootstrap.modelProfiles.filter((item) => item.accessMode === mode);

  if (requestedProfileId) {
    const requestedProfile = matchingProfiles.find((item) => item.id === requestedProfileId);
    if (!requestedProfile) {
      throw new Error(`未找到模型档案：${requestedProfileId}`);
    }

    return requestedProfile.id;
  }

  if (mode === "mock") {
    return matchingProfiles[0]?.id ?? bootstrap.defaults.modelProfileId;
  }

  const defaultConfigured = matchingProfiles.find(
    (item) =>
      item.id === bootstrap.serverProxyStatus.defaultProfileId && item.configured
  );
  if (defaultConfigured) {
    return defaultConfigured.id;
  }

  const firstConfigured = matchingProfiles.find((item) => item.configured);
  if (firstConfigured) {
    return firstConfigured.id;
  }

  throw new Error(
    `${bootstrap.serverProxyStatus.message}\n请先参考 version 3.0/.env.example 配置真实模型，或者在前端设置页里手动填写 API key / base url / 模型名。`
  );
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

  const modelProfileId = pickProfileId(bootstrap, mode);

  return {
    ruleDirectoryName: firstRule.directoryName,
    storyDirectoryName: firstStory.directoryName,
    locale: bootstrap.defaults.locale,
    playMode: bootstrap.defaults.playMode,
    gmArchitecture: bootstrap.defaults.gmArchitecture,
    modelAccessMode: mode,
    modelProfileId,
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
    console.log(`[flow] model profile: ${request.modelProfileId ?? "unknown"}`);

    const created = await createNewSession(request);
    const progressed = await submitTurnForSession(
      created.session.id,
      "I inspect the video hall and ask what happened last night."
    );

    console.log(`[flow] created session: ${created.session.id}`);
    console.log(`[flow] story: ${created.contentSummary.storyTitle}`);
    console.log(
      `[flow] opening provider: ${created.messages[1]?.tags?.join(", ") ?? "unknown"}`
    );
    console.log(`[flow] round after turn: ${progressed.session.currentRound}`);
    console.log(
      `[flow] final narration preview: ${progressed.messages.at(-1)?.content.slice(0, 160) ?? "empty"}`
    );
    console.log("[flow] real business flow passed.");
  } finally {
    await stopChildProcess(serverHandle.child);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
