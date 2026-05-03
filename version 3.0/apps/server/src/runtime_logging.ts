import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";

export type SerializedRuntimeError = {
  name: string;
  message: string;
  stack: string | null;
};

export type RuntimeLogRecord = {
  timestamp: string;
  level: RuntimeLogLevel;
  event: string;
  source: string | null;
  requestId: string | null;
  operationId: string | null;
  sessionId: string | null;
  jobId: string | null;
  route: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
  details: unknown;
  error: SerializedRuntimeError | null;
};

export type RuntimeLogInput = {
  timestamp?: string;
  level?: RuntimeLogLevel;
  event: string;
  source?: string | null;
  requestId?: string | null;
  operationId?: string | null;
  sessionId?: string | null;
  jobId?: string | null;
  route?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  details?: unknown;
  error?: unknown;
};

const MAX_STRING_LENGTH = 1200;
const MAX_ARRAY_ITEMS = 40;
const MAX_OBJECT_KEYS = 80;
const MAX_REDACTION_DEPTH = 5;

let runtimeLogWriteChain: Promise<void> = Promise.resolve();

function sanitizeFragment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96) || "unknown";
}

function shouldRedactKey(key: string): boolean {
  return /api[-_]?key|authorization|bearer|token|secret|password|credential|cookie/i.test(key);
}

function redactRuntimeDetails(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= MAX_REDACTION_DEPTH) {
    return "[max-depth]";
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactRuntimeDetails(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[${value.length - MAX_ARRAY_ITEMS} more items]`);
    }
    return items;
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    for (const [key, item] of entries) {
      output[key] = shouldRedactKey(key) ? "[redacted]" : redactRuntimeDetails(item, depth + 1);
    }

    const originalKeyCount = Object.keys(value as Record<string, unknown>).length;
    if (originalKeyCount > MAX_OBJECT_KEYS) {
      output.__truncatedKeys = originalKeyCount - MAX_OBJECT_KEYS;
    }
    return output;
  }

  return String(value);
}

export function serializeRuntimeError(error: unknown): SerializedRuntimeError | null {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null
    };
  }

  return {
    name: "NonError",
    message: String(error),
    stack: null
  };
}

function enqueueRuntimeLogWrite(task: () => Promise<void>): Promise<void> {
  const next = runtimeLogWriteChain.then(task, task);
  runtimeLogWriteChain = next.catch(() => undefined);
  return next;
}

export function buildRuntimeOperationId(prefix: string): string {
  return `${sanitizeFragment(prefix)}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function getRuntimeLogDir(projectRoot: string): string {
  const override = process.env.TRPG_RUNTIME_LOG_DIR?.trim();
  return override || join(projectRoot, "local_data", "runtime_logs");
}

export async function logRuntimeEvent(
  projectRoot: string,
  input: RuntimeLogInput
): Promise<void> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const record: RuntimeLogRecord = {
    timestamp,
    level: input.level ?? "info",
    event: input.event,
    source: input.source ?? null,
    requestId: input.requestId ?? null,
    operationId: input.operationId ?? null,
    sessionId: input.sessionId ?? null,
    jobId: input.jobId ?? null,
    route: input.route ?? null,
    method: input.method ?? null,
    path: input.path ?? null,
    statusCode: typeof input.statusCode === "number" ? input.statusCode : null,
    durationMs: typeof input.durationMs === "number" ? input.durationMs : null,
    details: redactRuntimeDetails(input.details ?? null),
    error: serializeRuntimeError(input.error)
  };

  const line = `${JSON.stringify(record)}\n`;
  await enqueueRuntimeLogWrite(async () => {
    try {
      const logDir = getRuntimeLogDir(projectRoot);
      await mkdir(logDir, { recursive: true });
      await appendFile(join(logDir, `${timestamp.slice(0, 10)}.jsonl`), line, "utf8");

      const subjectId = record.sessionId ?? record.jobId ?? record.operationId ?? record.requestId;
      if (subjectId) {
        const subjectDir = join(logDir, "subjects");
        await mkdir(subjectDir, { recursive: true });
        await appendFile(join(subjectDir, `${sanitizeFragment(subjectId)}.jsonl`), line, "utf8");
      }
    } catch (error) {
      console.warn(
        `[runtime-log] failed to write log: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}
