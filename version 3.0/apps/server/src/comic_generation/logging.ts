import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type ComicPipelineLogLevel = "info" | "warn" | "error";

type SerializedComicPipelineError = {
  name: string;
  message: string;
  stack: string | null;
};

type ComicPipelineLogRecord = {
  timestamp: string;
  level: ComicPipelineLogLevel;
  event: string;
  source: string | null;
  operationId: string | null;
  worldlineId: string | null;
  comicId: string | null;
  pageNumber: number | null;
  pageIndex: number | null;
  durationMs: number | null;
  details: Record<string, unknown> | null;
  error: SerializedComicPipelineError | null;
};

export type ComicPipelineLogInput = {
  timestamp?: string;
  level?: ComicPipelineLogLevel;
  event: string;
  source?: string | null;
  operationId?: string | null;
  worldlineId?: string | null;
  comicId?: string | null;
  pageNumber?: number | null;
  pageIndex?: number | null;
  durationMs?: number | null;
  details?: Record<string, unknown> | null;
  error?: unknown;
};

let comicPipelineLogWriteChain: Promise<void> = Promise.resolve();

function sanitizeFragment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "unknown";
}

function serializeError(error: unknown): SerializedComicPipelineError | null {
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

function enqueueComicPipelineLogWrite(task: () => Promise<void>): Promise<void> {
  const next = comicPipelineLogWriteChain.then(task, task);
  comicPipelineLogWriteChain = next.catch(() => undefined);
  return next;
}

export async function logComicPipelineEvent(
  comicRoot: string,
  input: ComicPipelineLogInput
): Promise<void> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const record: ComicPipelineLogRecord = {
    timestamp,
    level: input.level ?? "info",
    event: input.event,
    source: input.source ?? null,
    operationId: input.operationId ?? null,
    worldlineId: input.worldlineId ?? null,
    comicId: input.comicId ?? null,
    pageNumber: typeof input.pageNumber === "number" ? input.pageNumber : null,
    pageIndex: typeof input.pageIndex === "number" ? input.pageIndex : null,
    durationMs: typeof input.durationMs === "number" ? input.durationMs : null,
    details: input.details ?? null,
    error: serializeError(input.error)
  };
  const line = `${JSON.stringify(record)}\n`;

  await enqueueComicPipelineLogWrite(async () => {
    try {
      const logDir = join(comicRoot, "_pipeline_logs");
      await mkdir(logDir, { recursive: true });

      const dailyPath = join(logDir, `${timestamp.slice(0, 10)}.jsonl`);
      await appendFile(dailyPath, line, "utf8");

      const subjectId = record.worldlineId ?? record.comicId;
      if (subjectId) {
        const subjectDir = join(logDir, "subjects");
        await mkdir(subjectDir, { recursive: true });
        await appendFile(join(subjectDir, `${sanitizeFragment(subjectId)}.jsonl`), line, "utf8");
      }
    } catch (error) {
      console.warn(
        `[comic-pipeline-log] failed to write log: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}
