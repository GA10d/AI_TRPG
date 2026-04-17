import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import type {
  BootstrapResponse,
  ContentGeneratorMode,
  ContentGeneratorProgressStepId,
  ContentGeneratorRequest,
  ContentGeneratorResponse,
  RuntimeImageModelConfigInput,
  RuntimeModelConfigInput
} from "../../../../packages/shared-types/src/index.ts";
import { streamGenerateContentPackage } from "../lib/trpgApiClient.ts";
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

function buildPendingGenerationSteps(
  mode: ContentGeneratorMode,
  generateImages: boolean
): GenerationUiStep[] {
  const stepIds: ContentGeneratorProgressStepId[] = [];

  if (mode === "story_only") {
    stepIds.push("load_existing_rule");
  }

  if (mode === "rule_only" || mode === "rule_and_story") {
    stepIds.push("extract_rule", "generate_rule");
  }

  if (mode === "story_only" || mode === "rule_and_story") {
    stepIds.push("extract_story", "generate_story", "generate_supporting");

    if (generateImages) {
      stepIds.push("plan_assets");
    }
  }

  stepIds.push("write_package");

  if ((mode === "story_only" || mode === "rule_and_story") && generateImages) {
    stepIds.push("generate_assets");
  }

  stepIds.push("validate_package", "commit_package", "cleanup_tmp");

  return stepIds.map((id) => ({
    id,
    label: getGenerationStepLabel(id),
    status: "pending"
  }));
}

function advanceGenerationSteps(
  steps: GenerationUiStep[],
  activeStepId: ContentGeneratorProgressStepId
): GenerationUiStep[] {
  const activeIndex = steps.findIndex((step) => step.id === activeStepId);
  if (activeIndex < 0) {
    return steps;
  }

  return steps.map((step, index) => ({
    ...step,
    status:
      index < activeIndex
        ? "completed"
        : index === activeIndex
          ? "active"
          : "pending"
  }));
}

type ContentGeneratorScreenProps = {
  bootstrap: BootstrapResponse | null;
  locale: string;
  modelAccessMode: ContentGeneratorRequest["modelAccessMode"];
  modelProfileId: string;
  runtimeModelConfig: RuntimeModelConfigInput;
  imageProfileId: string;
  runtimeImageModelConfig: RuntimeImageModelConfigInput;
  onBack: () => void;
  onClose: () => void;
  onGenerationComplete?: (result: ContentGeneratorResponse) => void | Promise<void>;
};

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ContentGeneratorResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [generationSteps, setGenerationSteps] = useState<GenerationUiStep[]>([]);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationActiveLabel, setGenerationActiveLabel] = useState("");
  const [generationDetail, setGenerationDetail] = useState("");

  const ruleOptions = bootstrap?.catalog ?? [];
  const selectedRule = ruleOptions.find((item) => item.directoryName === associatedRuleDirectoryName) ?? null;

  function resetGenerationProgressState(): void {
    setGenerationSteps([]);
    setGenerationProgress(0);
    setGenerationActiveLabel("");
    setGenerationDetail("");
  }

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

  async function handleRuleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    const uploaded = await readUploadedTextFile(nextFile);
    setRuleSource(uploaded);
    setResult(null);
    setError("");
    resetGenerationProgressState();
  }

  async function handleStoryFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    const uploaded = await readUploadedTextFile(nextFile);
    setStorySource(uploaded);
    setResult(null);
    setError("");
    resetGenerationProgressState();
  }

  async function handleGenerate(): Promise<void> {
    setError("");
    setResult(null);

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
        setError("请先选择这个故事关联到哪套规则。");
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

    const initialSteps = buildPendingGenerationSteps(mode, generateImages);
    setGenerationSteps(initialSteps);
    setGenerationProgress(initialSteps.length > 0 ? 2 : 0);
    setGenerationActiveLabel(initialSteps[0]?.label ?? "准备开始");
    setGenerationDetail("正在准备生成内容包...");
    setIsGenerating(true);
    try {
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
        runtimeModelConfig,
        imageProfileId,
        runtimeImageModelConfig
      };
      const nextResult = await streamGenerateContentPackage(payload, {
        onStage: (event) => {
          setGenerationProgress(event.progress);
          setGenerationActiveLabel(getGenerationStepLabel(event.stepId));
          setGenerationDetail(event.detail);
          setGenerationSteps((current) =>
            advanceGenerationSteps(current.length > 0 ? current : initialSteps, event.stepId)
          );
        }
      });
      setGenerationProgress(100);
      setGenerationActiveLabel("生成完成");
      setGenerationDetail("所有步骤已完成，正在展示生成结果。");
      setGenerationSteps((current) =>
        (current.length > 0 ? current : initialSteps).map((step) => ({
          ...step,
          status: "completed"
        }))
      );
      setResult(nextResult);
      await onGenerationComplete?.(nextResult);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsGenerating(false);
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
                    setResult(null);
                    setError("");
                    resetGenerationProgressState();
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
              <input accept=".txt,.md,.json" onChange={(event) => void handleRuleFileChange(event)} type="file" />
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
              <input accept=".txt,.md,.json" onChange={(event) => void handleStoryFileChange(event)} type="file" />
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
                  <div className="summary-text">
                    默认语言：{selectedRule.defaultLocale}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="content-generator-card">
            <div className="eyebrow">生成选项</div>
            <label className="content-generator-checkbox">
              <input
                checked={generateImages}
                onChange={(event) => {
                  setGenerateImages(event.currentTarget.checked);
                  setResult(null);
                  resetGenerationProgressState();
                }}
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
              <div className="summary-text">文本模型入口：{modelAccessMode}</div>
              <div className="summary-text">文本模型档案：{modelProfileId || "未指定"}</div>
              <div className="summary-text">图片模型档案：{imageProfileId || "未指定"}</div>
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
              disabled={isGenerating || (mode === "story_only" && ruleOptions.length === 0)}
              onClick={() => void handleGenerate()}
              type="button"
            >
              {isGenerating ? "生成中..." : "开始生成内容包"}
            </button>
            {error ? <div className="status-line status-error">{error}</div> : null}
          </div>

          {generationSteps.length > 0 ? (
            <div className="content-generator-card">
              <div className="eyebrow">生成进度</div>
              <div className="content-generator-progress-head">
                <div className="summary-title">
                  {generationActiveLabel || (isGenerating ? "正在准备" : "已完成")}
                </div>
                <div className="record-tag">{Math.round(generationProgress)}%</div>
              </div>
              <div aria-hidden="true" className="content-generator-progress-bar">
                <div
                  className="content-generator-progress-fill"
                  style={{ width: `${generationProgress}%` }}
                />
              </div>
              <div className="summary-text">
                {generationDetail || (isGenerating ? "正在准备生成任务..." : "本轮生成步骤已完成。")}
              </div>
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
                  <div className="summary-title">{file.path}</div>
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
