import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import type {
  BootstrapResponse,
  ContentGeneratorJobSnapshot,
  ContentGeneratorMode,
  ContentGeneratorProgressStepId,
  ContentGeneratorRequest,
  ContentGeneratorResponse,
  RuntimeImageModelConfigInput,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import {
  createContentGeneratorJob,
  fetchContentGeneratorJob
} from "../lib/trpgApiClient.ts";
import { ScreenHeader } from "./ScreenHeader.tsx";

type UploadedTextFile = {
  fileName: string;
  content: string;
};

type GenerationStepStatus = "pending" | "active" | "completed";

type GenerationUiStep = {
  id: ContentGeneratorProgressStepId;
  label: string;
  status: GenerationStepStatus;
};

type ContentGeneratorScreenProps = {
  bootstrap: BootstrapResponse | null;
  locale: string;
  modelAccessMode: ContentGeneratorRequest["modelAccessMode"];
  modelProfileId: string;
  runtimeModelConfig: RuntimeModelConfigInput;
  imageProfileId: string;
  runtimeImageModelConfig: RuntimeImageModelConfigInput;
  onModelAccessModeChange: (value: ContentGeneratorRequest["modelAccessMode"]) => void;
  onModelProfileIdChange: (value: string) => void;
  onRuntimeModelConfigChange: (value: RuntimeModelConfigInput) => void;
  onImageProfileIdChange: (value: string) => void;
  onRuntimeImageModelConfigChange: (value: RuntimeImageModelConfigInput) => void;
  onBack: () => void;
  onClose: () => void;
  onGenerationComplete?: (result: ContentGeneratorResponse) => void | Promise<void>;
};

const CONTENT_GENERATOR_JOB_STORAGE_KEY = "ai-trpg-content-generator:last-job-id";
const EMPTY_RUNTIME_MODEL_CONFIG: RuntimeModelConfigInput = {
  apiKey: "",
  baseUrl: "",
  model: ""
};
const EMPTY_RUNTIME_IMAGE_MODEL_CONFIG: RuntimeImageModelConfigInput = {
  apiKey: "",
  baseUrl: "",
  model: ""
};

function getGenerationStepLabel(stepId: ContentGeneratorProgressStepId): string {
  switch (stepId) {
    case "load_existing_rule":
      return "读取关联规则";
    case "extract_rule":
      return "拆解规则结构";
    case "generate_rule":
      return "生成规则文件";
    case "extract_story":
      return "拆解故事结构";
    case "generate_story":
      return "生成剧本主文件";
    case "generate_supporting":
      return "生成开场与 NPC";
    case "plan_assets":
      return "规划美术资产";
    case "write_package":
      return "写入临时目录";
    case "generate_assets":
      return "生成封面与 other 图";
    case "validate_package":
      return "检查临时内容包";
    case "commit_package":
      return "移动到 content";
    case "cleanup_tmp":
      return "清理 tmp";
    default:
      return stepId;
  }
}

function buildGenerationStepsFromJob(job: ContentGeneratorJobSnapshot | null): GenerationUiStep[] {
  if (!job) {
    return [];
  }

  const activeStepId = job.currentStepId ?? job.progressPlan[0]?.id ?? null;
  const activeIndex =
    activeStepId == null
      ? -1
      : job.progressPlan.findIndex((step) => step.id === activeStepId);

  return job.progressPlan.map((step, index) => ({
    id: step.id,
    label: step.label || getGenerationStepLabel(step.id),
    status:
      job.status === "completed"
        ? "completed"
        : activeIndex < 0
          ? "pending"
          : index < activeIndex
            ? "completed"
            : index === activeIndex
              ? "active"
              : "pending"
  }));
}

function getJobHeadline(job: ContentGeneratorJobSnapshot | null): string {
  if (!job) {
    return "";
  }

  switch (job.status) {
    case "queued":
      return "后台排队中";
    case "running":
      return job.currentStepLabel || job.progressPlan[0]?.label || "后台生成中";
    case "completed":
      return "生成完成";
    case "failed":
      return "生成失败";
    default:
      return "";
  }
}

function getJobDetail(job: ContentGeneratorJobSnapshot | null): string {
  if (!job) {
    return "";
  }

  if (job.currentDetail?.trim()) {
    return job.currentDetail;
  }

  switch (job.status) {
    case "queued":
      return job.queuePosition && job.queuePosition > 1
        ? `任务已进入后台队列，前面还有 ${job.queuePosition - 1} 个任务。`
        : "任务已进入后台队列，等待开始执行。";
    case "running":
      return "后台任务正在执行，生成中的内容会先进入 tmp 校验，再提交到 content。";
    case "completed":
      return "后台生成已完成，可以查看结果与文件预览。";
    case "failed":
      return job.error || "后台生成失败。";
    default:
      return "";
  }
}

function normalizeRuntimeModelConfig(
  value: RuntimeModelConfigInput | undefined
): RuntimeModelConfigInput {
  return {
    apiKey: value?.apiKey?.trim() || "",
    baseUrl: value?.baseUrl?.trim() || "",
    model: value?.model?.trim() || ""
  };
}

function normalizeRuntimeImageModelConfig(
  value: RuntimeImageModelConfigInput | undefined
): RuntimeImageModelConfigInput {
  return {
    apiKey: value?.apiKey?.trim() || "",
    baseUrl: value?.baseUrl?.trim() || "",
    model: value?.model?.trim() || ""
  };
}

function guessDirectoryName(fileName: string | null | undefined, prefix: string): string {
  const baseName = (fileName ?? "")
    .replace(/\.[^.]+$/u, "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");

  return baseName.length > 0 ? baseName.slice(0, 64) : prefix;
}

async function readUploadedTextFile(file: File | null): Promise<UploadedTextFile | null> {
  if (!file) {
    return null;
  }

  return {
    fileName: file.name,
    content: await file.text()
  };
}

export function ContentGeneratorScreen(props: ContentGeneratorScreenProps) {
  const {
    bootstrap,
    locale,
    modelAccessMode,
    modelProfileId,
    runtimeModelConfig,
    imageProfileId,
    runtimeImageModelConfig,
    onModelAccessModeChange,
    onModelProfileIdChange,
    onRuntimeModelConfigChange,
    onImageProfileIdChange,
    onRuntimeImageModelConfigChange,
    onBack,
    onClose,
    onGenerationComplete
  } = props;

  const [mode, setMode] = useState<ContentGeneratorMode>("rule_only");
  const [associatedRuleDirectoryName, setAssociatedRuleDirectoryName] = useState<string>("");
  const [ruleSource, setRuleSource] = useState<UploadedTextFile | null>(null);
  const [storySource, setStorySource] = useState<UploadedTextFile | null>(null);
  const [generateImages, setGenerateImages] = useState(true);
  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [activeJob, setActiveJob] = useState<ContentGeneratorJobSnapshot | null>(null);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [error, setError] = useState("");
  const completionNotifiedJobIdRef = useRef<string | null>(null);

  const ruleOptions = bootstrap?.catalog ?? [];
  const selectedRule =
    ruleOptions.find((item) => item.directoryName === associatedRuleDirectoryName) ?? null;
  const availableTextProfiles =
    bootstrap?.modelProfiles.filter((profile) => profile.accessMode === modelAccessMode) ?? [];
  const selectedTextProfile =
    availableTextProfiles.find((profile) => profile.id === modelProfileId) ??
    availableTextProfiles[0] ??
    null;
  const selectedImageProfile =
    bootstrap?.imageProfiles.find((profile) => profile.id === imageProfileId) ??
    bootstrap?.imageProfiles[0] ??
    null;
  const effectiveRuntimeModelConfig = normalizeRuntimeModelConfig(runtimeModelConfig);
  const effectiveRuntimeImageModelConfig =
    normalizeRuntimeImageModelConfig(runtimeImageModelConfig);
  const generationSteps = useMemo(
    () => buildGenerationStepsFromJob(activeJob),
    [activeJob]
  );
  const result = activeJob?.result ?? null;
  const isJobActive = activeJob?.status === "queued" || activeJob?.status === "running";
  const displayError = error || (activeJob?.status === "failed" ? activeJob.error ?? "" : "");

  useEffect(() => {
    if (mode === "story_only") {
      if (!associatedRuleDirectoryName && ruleOptions[0]?.directoryName) {
        setAssociatedRuleDirectoryName(ruleOptions[0].directoryName);
      }
      return;
    }

    if (mode === "rule_only") {
      setAssociatedRuleDirectoryName("");
    }
  }, [associatedRuleDirectoryName, mode, ruleOptions]);

  useEffect(() => {
    let cancelled = false;

    async function restoreLastJob(): Promise<void> {
      if (typeof window === "undefined") {
        return;
      }

      const savedJobId = window.localStorage.getItem(CONTENT_GENERATOR_JOB_STORAGE_KEY)?.trim();
      if (!savedJobId) {
        return;
      }

      try {
        const nextJob = await fetchContentGeneratorJob(savedJobId);
        if (cancelled) {
          return;
        }

        if (!nextJob) {
          window.localStorage.removeItem(CONTENT_GENERATOR_JOB_STORAGE_KEY);
          return;
        }

        setActiveJob(nextJob);
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : String(nextError));
      }
    }

    void restoreLastJob();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeJob || (activeJob.status !== "queued" && activeJob.status !== "running")) {
      return;
    }

    let cancelled = false;
    let polling = false;

    async function pollJob(): Promise<void> {
      if (polling) {
        return;
      }

      polling = true;
      try {
        const nextJob = await fetchContentGeneratorJob(activeJob.jobId);
        if (cancelled) {
          return;
        }

        if (!nextJob) {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(CONTENT_GENERATOR_JOB_STORAGE_KEY);
          }
          setActiveJob(null);
          setError("未找到对应的后台任务，可能服务端已重启。");
          return;
        }

        setActiveJob(nextJob);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      } finally {
        polling = false;
      }
    }

    const timer = window.setInterval(() => {
      void pollJob();
    }, 1200);
    void pollJob();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeJob?.jobId, activeJob?.status]);

  useEffect(() => {
    if (!activeJob?.result || activeJob.status !== "completed") {
      return;
    }

    if (completionNotifiedJobIdRef.current === activeJob.jobId) {
      return;
    }

    completionNotifiedJobIdRef.current = activeJob.jobId;
    void onGenerationComplete?.(activeJob.result);
  }, [activeJob, onGenerationComplete]);

  const guessedRuleDirectoryName = useMemo(() => {
    if (mode === "story_only") {
      return associatedRuleDirectoryName || "<请选择规则>";
    }

    return guessDirectoryName(ruleSource?.fileName, "AUTO_RULE");
  }, [associatedRuleDirectoryName, mode, ruleSource?.fileName]);

  const guessedStoryDirectoryName = useMemo(
    () => guessDirectoryName(storySource?.fileName, "AUTO_STORY"),
    [storySource?.fileName]
  );

  const targetPathPreview = useMemo(() => {
    if (mode === "rule_only") {
      return `content/${guessedRuleDirectoryName}/rule/`;
    }

    if (mode === "story_only") {
      return `content/${guessedRuleDirectoryName}/story/${guessedStoryDirectoryName}/`;
    }

    return `content/${guessedRuleDirectoryName}/story/${guessedStoryDirectoryName}/`;
  }, [guessedRuleDirectoryName, guessedStoryDirectoryName, mode]);

  function updateRuntimeModelConfig(
    patch: Partial<RuntimeModelConfigInput>
  ): void {
    onRuntimeModelConfigChange({
      ...effectiveRuntimeModelConfig,
      ...patch
    });
  }

  function updateRuntimeImageModelConfig(
    patch: Partial<RuntimeImageModelConfigInput>
  ): void {
    onRuntimeImageModelConfigChange({
      ...effectiveRuntimeImageModelConfig,
      ...patch
    });
  }

  async function handleRuleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    const uploaded = await readUploadedTextFile(nextFile);
    setRuleSource(uploaded);
    setError("");
  }

  async function handleStoryFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    const uploaded = await readUploadedTextFile(nextFile);
    setStorySource(uploaded);
    setError("");
  }

  async function handleGenerate(): Promise<void> {
    setError("");

    if (mode === "rule_only" && !ruleSource?.content.trim()) {
      setError("请先上传规则文件。");
      return;
    }

    if (mode === "story_only") {
      if (!storySource?.content.trim()) {
        setError("请先上传故事文件。");
        return;
      }

      if (!associatedRuleDirectoryName.trim()) {
        setError("请先选择这个故事要挂到哪套规则下面。");
        return;
      }
    }

    if (mode === "rule_and_story") {
      if (!ruleSource?.content.trim()) {
        setError("请先上传规则文件。");
        return;
      }
      if (!storySource?.content.trim()) {
        setError("请先上传故事文件。");
        return;
      }
    }

    const payload: ContentGeneratorRequest = {
      mode,
      locale,
      associatedRuleDirectoryName:
        mode === "story_only" ? associatedRuleDirectoryName : undefined,
      ruleSource,
      storySource,
      generateImages,
      forceOverwrite,
      modelAccessMode,
      modelProfileId,
      runtimeModelConfig: effectiveRuntimeModelConfig,
      imageProfileId,
      runtimeImageModelConfig: effectiveRuntimeImageModelConfig
    };

    setIsSubmittingJob(true);
    try {
      const nextJob = await createContentGeneratorJob(payload);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CONTENT_GENERATOR_JOB_STORAGE_KEY, nextJob.jobId);
      }
      setActiveJob(nextJob);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsSubmittingJob(false);
    }
  }

  return (
    <section className="panel page-panel content-generator-page">
      <ScreenHeader
        title="内容生成器"
        description="上传规则文件、故事文件，自动生成 version 3.0 所需内容包。支持单独上传规则、单独上传故事，以及规则与故事同时上传。"
        onBack={onBack}
        onClose={onClose}
      />

      <div className="content-generator-grid">
        <div className="content-generator-main">
          <div className="content-generator-card">
            <div className="eyebrow">生成模式</div>
            <div className="content-generator-mode-row">
              {[
                { value: "rule_only", label: "上传规则" },
                { value: "story_only", label: "上传故事" },
                { value: "rule_and_story", label: "同时上传规则与故事" }
              ].map((option) => (
                <button
                  className={`ghost-button content-generator-mode-button ${
                    mode === option.value ? "content-generator-mode-button-active" : ""
                  }`}
                  key={option.value}
                  onClick={() => {
                    setMode(option.value as ContentGeneratorMode);
                    setError("");
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {(mode === "rule_only" || mode === "rule_and_story") ? (
            <div className="content-generator-card">
              <div className="content-generator-card-head">
                <div>
                  <div className="eyebrow">规则文件</div>
                  <div className="summary-text">支持上传旧版 prompt 或整理后的规则文本。</div>
                </div>
                <div className="record-tag">{ruleSource?.fileName ?? "未上传"}</div>
              </div>
              <input
                accept=".txt,.md,.json"
                onChange={(event) => void handleRuleFileChange(event)}
                type="file"
              />
              {ruleSource ? (
                <textarea
                  className="content-generator-textarea"
                  onChange={(event) =>
                    setRuleSource((current) =>
                      current
                        ? {
                            ...current,
                            content: event.currentTarget.value
                          }
                        : current
                    )
                  }
                  value={ruleSource.content}
                />
              ) : null}
            </div>
          ) : null}

          {(mode === "story_only" || mode === "rule_and_story") ? (
            <div className="content-generator-card">
              <div className="content-generator-card-head">
                <div>
                  <div className="eyebrow">故事文件</div>
                  <div className="summary-text">支持上传旧版剧本文本，系统会自动拆成 3.0 所需文件。</div>
                </div>
                <div className="record-tag">{storySource?.fileName ?? "未上传"}</div>
              </div>
              <input
                accept=".txt,.md,.json"
                onChange={(event) => void handleStoryFileChange(event)}
                type="file"
              />
              {storySource ? (
                <textarea
                  className="content-generator-textarea"
                  onChange={(event) =>
                    setStorySource((current) =>
                      current
                        ? {
                            ...current,
                            content: event.currentTarget.value
                          }
                        : current
                    )
                  }
                  value={storySource.content}
                />
              ) : null}
            </div>
          ) : null}

          {mode === "story_only" ? (
            <div className="content-generator-card">
              <div className="eyebrow">关联规则</div>
              <div className="summary-text">
                单独上传故事时，必须明确它要挂到哪套规则下面。
              </div>
              {ruleOptions.length > 0 ? (
                <select
                  className="settings-select"
                  onChange={(event) => setAssociatedRuleDirectoryName(event.currentTarget.value)}
                  value={associatedRuleDirectoryName}
                >
                  {ruleOptions.map((rule) => (
                    <option key={rule.directoryName} value={rule.directoryName}>
                      {rule.ruleTitle} ({rule.directoryName})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="empty-state content-generator-empty-inline">
                  当前没有可用规则包，请先上传规则，或改用“同时上传规则与故事”。
                </div>
              )}
              {selectedRule ? (
                <div className="content-generator-rule-meta">
                  <div className="summary-text">规则 ID：{selectedRule.ruleId}</div>
                  <div className="summary-text">
                    标签：{selectedRule.themes.join(" / ") || "暂无"}
                  </div>
                  <div className="summary-text">默认语言：{selectedRule.defaultLocale}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="content-generator-card">
            <div className="eyebrow">生成选项</div>
            <label className="content-generator-checkbox">
              <input
                checked={generateImages}
                onChange={(event) => setGenerateImages(event.currentTarget.checked)}
                type="checkbox"
              />
              生成封面图与 other 图
            </label>
            <label className="content-generator-checkbox">
              <input
                checked={forceOverwrite}
                onChange={(event) => setForceOverwrite(event.currentTarget.checked)}
                type="checkbox"
              />
              允许覆盖已存在的目标包
            </label>

            <div className="content-generator-runtime">
              <div className="eyebrow">文本模型</div>
              <div className="grid-two">
                <label className="field">
                  <span>模型入口</span>
                  <select
                    value={modelAccessMode}
                    onChange={(event) =>
                      onModelAccessModeChange(
                        event.currentTarget.value as ContentGeneratorRequest["modelAccessMode"]
                      )
                    }
                  >
                    {bootstrap?.modelAccessModes.map((modeOption) => (
                      <option key={modeOption.code} value={modeOption.code}>
                        {modeOption.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>模型档案</span>
                  <select
                    value={selectedTextProfile?.id ?? modelProfileId}
                    onChange={(event) => onModelProfileIdChange(event.currentTarget.value)}
                  >
                    {availableTextProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid-two">
                <label className="field">
                  <span>API Key 覆盖</span>
                  <input
                    autoComplete="new-password"
                    className="text-input"
                    disabled={!selectedTextProfile?.allowsCustomApiKey}
                    placeholder="留空则沿用当前档案配置"
                    type="password"
                    value={effectiveRuntimeModelConfig.apiKey}
                    onChange={(event) =>
                      updateRuntimeModelConfig({
                        apiKey: event.currentTarget.value
                      })
                    }
                  />
                </label>

                <label className="field">
                  <span>模型名覆盖</span>
                  <input
                    className="text-input"
                    disabled={!selectedTextProfile?.allowsCustomModel}
                    placeholder={selectedTextProfile?.baseModel ?? "留空则沿用档案默认模型"}
                    type="text"
                    value={effectiveRuntimeModelConfig.model}
                    onChange={(event) =>
                      updateRuntimeModelConfig({
                        model: event.currentTarget.value
                      })
                    }
                  />
                </label>
              </div>

              <label className="field">
                <span>Base URL 覆盖</span>
                <input
                  className="text-input"
                  disabled={!selectedTextProfile?.allowsCustomBaseUrl}
                  placeholder={selectedTextProfile?.baseUrl ?? "留空则沿用档案默认地址"}
                  type="text"
                  value={effectiveRuntimeModelConfig.baseUrl}
                  onChange={(event) =>
                    updateRuntimeModelConfig({
                      baseUrl: event.currentTarget.value
                    })
                  }
                />
              </label>

              <div className="button-row">
                <button
                  className="ghost-button"
                  onClick={() => onRuntimeModelConfigChange(EMPTY_RUNTIME_MODEL_CONFIG)}
                  type="button"
                >
                  清空文本模型覆盖项
                </button>
              </div>
              {selectedTextProfile ? (
                <div className="summary-text">{selectedTextProfile.message}</div>
              ) : null}
            </div>

            <div className="content-generator-runtime">
              <div className="eyebrow">图片模型</div>
              <div className="grid-two">
                <label className="field">
                  <span>图片模型档案</span>
                  <select
                    value={selectedImageProfile?.id ?? imageProfileId}
                    onChange={(event) => onImageProfileIdChange(event.currentTarget.value)}
                  >
                    {bootstrap?.imageProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>图片模型名覆盖</span>
                  <input
                    className="text-input"
                    disabled={!selectedImageProfile?.allowsCustomModel}
                    placeholder={selectedImageProfile?.baseModel ?? "留空则沿用档案默认模型"}
                    type="text"
                    value={effectiveRuntimeImageModelConfig.model}
                    onChange={(event) =>
                      updateRuntimeImageModelConfig({
                        model: event.currentTarget.value
                      })
                    }
                  />
                </label>
              </div>

              <div className="grid-two">
                <label className="field">
                  <span>图片 API Key 覆盖</span>
                  <input
                    autoComplete="new-password"
                    className="text-input"
                    disabled={!selectedImageProfile?.allowsCustomApiKey}
                    placeholder="留空则沿用当前档案配置"
                    type="password"
                    value={effectiveRuntimeImageModelConfig.apiKey}
                    onChange={(event) =>
                      updateRuntimeImageModelConfig({
                        apiKey: event.currentTarget.value
                      })
                    }
                  />
                </label>

                <label className="field">
                  <span>图片 Base URL 覆盖</span>
                  <input
                    className="text-input"
                    disabled={!selectedImageProfile?.allowsCustomBaseUrl}
                    placeholder={selectedImageProfile?.baseUrl ?? "留空则沿用档案默认地址"}
                    type="text"
                    value={effectiveRuntimeImageModelConfig.baseUrl}
                    onChange={(event) =>
                      updateRuntimeImageModelConfig({
                        baseUrl: event.currentTarget.value
                      })
                    }
                  />
                </label>
              </div>

              <div className="button-row">
                <button
                  className="ghost-button"
                  onClick={() => onRuntimeImageModelConfigChange(EMPTY_RUNTIME_IMAGE_MODEL_CONFIG)}
                  type="button"
                >
                  清空图片模型覆盖项
                </button>
              </div>
              {selectedImageProfile ? (
                <div className="summary-text">{selectedImageProfile.message}</div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="content-generator-sidebar">
          <div className="content-generator-card">
            <div className="eyebrow">目标输出路径</div>
            <div className="summary-title content-generator-path">{targetPathPreview}</div>
            <div className="summary-text">
              单独上传故事时，路径会固定落到你选择的规则目录下。
            </div>
          </div>

          <div className="content-generator-card">
            <div className="eyebrow">操作</div>
            <button
              className="primary-button content-generator-submit"
              disabled={isSubmittingJob || isJobActive || (mode === "story_only" && ruleOptions.length === 0)}
              onClick={() => void handleGenerate()}
              type="button"
            >
              {isSubmittingJob
                ? "正在提交后台任务..."
                : isJobActive
                  ? "后台生成中..."
                  : "开始后台生成"}
            </button>
            <div className="summary-text">
              提交后任务会在后台继续运行，离开这个界面不会中断。
            </div>
            {displayError ? <div className="status-line status-error">{displayError}</div> : null}
          </div>

          {activeJob ? (
            <div className="content-generator-card">
              <div className="eyebrow">生成进度</div>
              <div className="content-generator-progress-head">
                <div className="summary-title">{getJobHeadline(activeJob)}</div>
                <div className="record-tag">{Math.round(activeJob.progress)}%</div>
              </div>
              <div aria-hidden="true" className="content-generator-progress-bar">
                <div
                  className="content-generator-progress-fill"
                  style={{ width: `${activeJob.progress}%` }}
                />
              </div>
              <div className="summary-text">{getJobDetail(activeJob)}</div>
              <div className="summary-text">Job ID：{activeJob.jobId}</div>
              {activeJob.status === "queued" && activeJob.queuePosition ? (
                <div className="summary-text">队列位置：{activeJob.queuePosition}</div>
              ) : null}
              <ul className="content-generator-progress-list">
                {generationSteps.map((step) => (
                  <li
                    className={`content-generator-progress-item content-generator-progress-item-${step.status}`}
                    key={step.id}
                  >
                    <span className="content-generator-progress-label">{step.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result ? (
            <div className="content-generator-card">
              <div className="eyebrow">生成结果</div>
              <div className="summary-title">{result.summary.ruleTitle}</div>
              <div className="summary-text">{result.summary.ruleOutputPath}</div>
              {result.summary.storyTitle ? (
                <>
                  <div className="summary-title content-generator-result-gap">
                    {result.summary.storyTitle}
                  </div>
                  <div className="summary-text">{result.summary.storyOutputPath}</div>
                </>
              ) : null}
              <div className="summary-text content-generator-result-gap">
                校验：{result.validation.ok ? "通过" : "失败"}
              </div>
              {result.validation.messages.map((message, index) => (
                <div className="summary-text" key={`${message}-${index}`}>
                  - {message}
                </div>
              ))}
              {result.warnings.length > 0 ? (
                <div className="content-generator-warning-block">
                  <div className="summary-title">注意事项</div>
                  {result.warnings.map((warning, index) => (
                    <div className="summary-text" key={`${warning}-${index}`}>
                      - {warning}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      {result ? (
        <div className="content-generator-results">
          <div className="eyebrow">生成文件预览</div>
          <div className="content-generator-file-list">
            {result.generatedFiles.map((file) => (
              <article className="record-card content-generator-file-card" key={file.path}>
                <div className="content-generator-file-head">
                  <div className="content-generator-file-path" title={file.path}>
                    {file.path}
                  </div>
                  <div className="record-tag">{file.kind}</div>
                </div>
                {file.kind === "image" && file.assetUrl ? (
                  <img
                    alt={file.path}
                    className="content-generator-image-preview"
                    src={file.assetUrl}
                  />
                ) : null}
                {file.preview ? (
                  <pre className="content-generator-preview">{file.preview}</pre>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
