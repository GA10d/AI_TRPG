import { randomUUID } from "node:crypto";

import {
  DEFAULT_LOCALE,
  normalizeLocaleCode
} from "../../../../packages/shared-config/src/index.ts";
import type {
  ContentGeneratorJobSnapshot,
  ContentGeneratorJobStatus,
  ContentGeneratorProgressStep,
  ContentGeneratorRequest,
  ContentGeneratorResponse
} from "../../../../packages/shared-types/src/index.ts";
import {
  buildContentGeneratorProgressPlan,
  generateContentPackage
} from "./service.ts";

type ContentGeneratorJobRecord = {
  jobId: string;
  request: ContentGeneratorRequest;
  status: ContentGeneratorJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  currentStepId: ContentGeneratorJobSnapshot["currentStepId"];
  currentStepLabel: string | null;
  currentDetail: string | null;
  progressPlan: ContentGeneratorProgressStep[];
  result: ContentGeneratorResponse | null;
  error: string | null;
};

const jobRecords = new Map<string, ContentGeneratorJobRecord>();
let contentGeneratorChain: Promise<void> = Promise.resolve();

const FINISHED_JOB_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_FINISHED_JOBS = 30;

function nowIso(): string {
  return new Date().toISOString();
}

function isFinishedStatus(status: ContentGeneratorJobStatus): boolean {
  return status === "completed" || status === "failed";
}

function getQueuedJobPosition(jobId: string): number | null {
  let position = 0;
  for (const [candidateJobId, record] of jobRecords.entries()) {
    if (record.status !== "queued") {
      continue;
    }

    position += 1;
    if (candidateJobId === jobId) {
      return position;
    }
  }

  return null;
}

function pruneFinishedJobs(): void {
  const now = Date.now();
  const removableIds: string[] = [];

  for (const [jobId, record] of jobRecords.entries()) {
    if (!isFinishedStatus(record.status) || !record.completedAt) {
      continue;
    }

    if (now - Date.parse(record.completedAt) > FINISHED_JOB_TTL_MS) {
      removableIds.push(jobId);
    }
  }

  const finishedRecords = Array.from(jobRecords.entries())
    .filter(([, record]) => isFinishedStatus(record.status))
    .sort((left, right) => {
      const leftTime = Date.parse(left[1].completedAt ?? left[1].createdAt);
      const rightTime = Date.parse(right[1].completedAt ?? right[1].createdAt);
      return rightTime - leftTime;
    });

  for (const [index, [jobId]] of finishedRecords.entries()) {
    if (index >= MAX_FINISHED_JOBS) {
      removableIds.push(jobId);
    }
  }

  for (const jobId of new Set(removableIds)) {
    jobRecords.delete(jobId);
  }
}

function buildJobSnapshot(record: ContentGeneratorJobRecord): ContentGeneratorJobSnapshot {
  return {
    jobId: record.jobId,
    status: record.status,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    queuePosition: record.status === "queued" ? getQueuedJobPosition(record.jobId) : null,
    progress: record.progress,
    currentStepId: record.currentStepId,
    currentStepLabel: record.currentStepLabel,
    currentDetail: record.currentDetail,
    progressPlan: record.progressPlan,
    result: record.result,
    error: record.error
  };
}

async function runContentGeneratorJob(
  jobId: string,
  contentRoot: string
): Promise<void> {
  const record = jobRecords.get(jobId);
  if (!record) {
    return;
  }

  record.status = "running";
  record.startedAt = nowIso();
  record.progress = Math.max(record.progress, 2);
  record.currentStepLabel =
    record.progressPlan[0]?.label ?? record.currentStepLabel ?? "Starting content generation";
  record.currentDetail =
    normalizeLocaleCode(record.request.locale || DEFAULT_LOCALE).toLowerCase().startsWith("zh")
      ? "任务已开始执行，当前内容会先生成到临时目录，再校验并提交。"
      : "The job is now running. Output will be staged in tmp, validated, and then committed.";

  try {
    const result = await generateContentPackage({
      contentRoot,
      request: record.request,
      onStage: async (event) => {
        const latest = jobRecords.get(jobId);
        if (!latest) {
          return;
        }

        latest.status = "running";
        latest.progress = event.progress;
        latest.currentStepId = event.stepId;
        latest.currentStepLabel = event.label;
        latest.currentDetail = event.detail;
      }
    });

    const latest = jobRecords.get(jobId);
    if (!latest) {
      return;
    }

    latest.status = "completed";
    latest.completedAt = nowIso();
    latest.progress = 100;
    latest.result = result;
    latest.error = null;
    latest.currentDetail =
      normalizeLocaleCode(latest.request.locale || DEFAULT_LOCALE).toLowerCase().startsWith("zh")
        ? "后台生成已完成，可以查看结果、预览文件，或继续创建下一包内容。"
        : "Background generation completed. You can now inspect the generated files and results.";
  } catch (error: unknown) {
    const latest = jobRecords.get(jobId);
    if (!latest) {
      return;
    }

    latest.status = "failed";
    latest.completedAt = nowIso();
    latest.error = error instanceof Error ? error.message : String(error);
    latest.currentDetail = latest.error;
  } finally {
    pruneFinishedJobs();
  }
}

export function createContentGeneratorJob(args: {
  contentRoot: string;
  request: ContentGeneratorRequest;
}): ContentGeneratorJobSnapshot {
  pruneFinishedJobs();

  const locale = normalizeLocaleCode(args.request.locale || DEFAULT_LOCALE);
  const progressPlan = buildContentGeneratorProgressPlan(args.request, locale);
  const jobId = `contentgen_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const record: ContentGeneratorJobRecord = {
    jobId,
    request: args.request,
    status: "queued",
    createdAt: nowIso(),
    startedAt: null,
    completedAt: null,
    progress: 0,
    currentStepId: null,
    currentStepLabel: progressPlan[0]?.label ?? null,
    currentDetail: locale.toLowerCase().startsWith("zh")
      ? "任务已加入后台队列。你可以离开当前界面，稍后再回来查看进度。"
      : "The job has been queued in the background. You can leave this screen and return later.",
    progressPlan,
    result: null,
    error: null
  };
  jobRecords.set(jobId, record);

  const queuedRun = contentGeneratorChain
    .catch(() => {})
    .then(async () => {
      await runContentGeneratorJob(jobId, args.contentRoot);
    });

  contentGeneratorChain = queuedRun.catch(() => {});
  return buildJobSnapshot(record);
}

export function getContentGeneratorJob(jobId: string): ContentGeneratorJobSnapshot | null {
  pruneFinishedJobs();
  const record = jobRecords.get(jobId);
  return record ? buildJobSnapshot(record) : null;
}
