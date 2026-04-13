import { useEffect, useState } from "react";

import type { SessionSnapshot } from "../../../../packages/shared-types/src/index.ts";
import { useUiText } from "../locales/index.tsx";

type SessionBootstrapStepStatus = "pending" | "active" | "completed";

type SessionBootstrapPanelState = {
  coverAssetUrl: string | null;
  loadingHint: string;
  progress: number;
  activeLabel: string;
  activeDetail: string;
  steps: Array<{
    stage: string;
    label: string;
    detail: string;
    status: SessionBootstrapStepStatus;
  }>;
};

type GameBootstrapScreenProps = {
  snapshot: SessionSnapshot | null;
  sessionBootstrapState: SessionBootstrapPanelState | null;
};

const BOOTSTRAP_STAGE_ORDER = [
  "entered_game",
  "loading_content",
  "assembling_prompt",
  "requesting_narrator",
  "waiting_first_reply",
  "finalizing_session"
] as const;

export function GameBootstrapScreen(props: GameBootstrapScreenProps) {
  const { snapshot, sessionBootstrapState } = props;
  const text = useUiText();
  const tips = text.gameBootstrapScreen.tips;
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    setTipIndex(0);
  }, [snapshot?.session.id, snapshot?.contentSummary.storyTitle, tips.length]);

  useEffect(() => {
    if (tips.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % tips.length);
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [tips]);

  const storyTitle =
    snapshot?.contentSummary.storyTitle?.trim() || text.gameBootstrapScreen.fallbackStoryTitle;
  const progressValue = Math.max(0.08, Math.min(1, sessionBootstrapState?.progress ?? 0.08));
  const progressPercent = Math.max(8, Math.min(100, Math.round(progressValue * 100)));
  const loadingTitle =
    sessionBootstrapState?.activeLabel ?? text.app.bootstrapStages.entered_game.label;
  const loadingDetail =
    sessionBootstrapState?.activeDetail ?? text.app.bootstrapStages.waiting_first_reply.detail;
  const loadingHint =
    sessionBootstrapState?.loadingHint?.trim() ||
    text.gameBootstrapScreen.defaultLoadingHint(storyTitle);
  const activeTip = tips[tipIndex] ?? text.gameBootstrapScreen.waitHint;

  const fallbackSteps = BOOTSTRAP_STAGE_ORDER.map((stageKey, index) => {
    const stageConfig = text.app.bootstrapStages[stageKey];
    const nextStageKey = BOOTSTRAP_STAGE_ORDER[index + 1];
    const nextStageProgress = nextStageKey
      ? text.app.bootstrapStages[nextStageKey].progress
      : 1.01;

    let status: SessionBootstrapStepStatus = "pending";
    if (progressValue >= stageConfig.progress) {
      status = progressValue < nextStageProgress ? "active" : "completed";
    }

    if (index === BOOTSTRAP_STAGE_ORDER.length - 1 && progressValue >= stageConfig.progress) {
      status = progressValue >= 0.995 ? "completed" : "active";
    }

    return {
      stage: stageKey,
      label: stageConfig.label,
      detail: stageConfig.detail,
      status
    };
  });

  const steps = sessionBootstrapState?.steps?.length
    ? sessionBootstrapState.steps
    : fallbackSteps;

  return (
    <section className="bootstrap-screen">
      <div className="bootstrap-screen-inner">
        <div className="bootstrap-screen-frame">
          <div className="bootstrap-screen-main">
            <div className="bootstrap-screen-visual-column">
              <div className="bootstrap-screen-cover-frame">
                {sessionBootstrapState?.coverAssetUrl ? (
                  <img
                    alt={text.gameBootstrapScreen.coverAlt(storyTitle)}
                    className="bootstrap-screen-cover"
                    src={sessionBootstrapState.coverAssetUrl}
                  />
                ) : (
                  <div className="bootstrap-screen-cover-fallback">
                    <div className="bootstrap-screen-cover-fallback-title">
                      {text.gameBootstrapScreen.fallbackCoverTitle}
                    </div>
                    <p>{text.gameBootstrapScreen.fallbackCoverDescription}</p>
                  </div>
                )}
              </div>

              <div className="bootstrap-screen-signal-strip">
                <span className="bootstrap-screen-signal-pill">ANOMALY STORY SYSTEM</span>
                <span className="bootstrap-screen-signal-pill">
                  {text.gameBootstrapScreen.progressLabel(progressPercent)}
                </span>
              </div>
            </div>

            <div className="bootstrap-screen-copy">
              <div className="bootstrap-screen-story-label">{storyTitle}</div>
              <h1 className="bootstrap-screen-title">{loadingTitle}</h1>
              <p className="bootstrap-screen-hint">{loadingHint}</p>

              <div className="bootstrap-screen-progress-block">
                <div className="bootstrap-screen-progress-meta">
                  <span>{text.gameBootstrapScreen.progressTitle}</span>
                  <span>{text.gameBootstrapScreen.progressLabel(progressPercent)}</span>
                </div>
                <div aria-hidden="true" className="bootstrap-screen-progress-track">
                  <div
                    className="bootstrap-screen-progress-bar"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <p aria-live="polite" className="bootstrap-screen-detail">
                {loadingDetail}
              </p>
              <p className="bootstrap-screen-wait">{text.gameBootstrapScreen.waitHint}</p>
            </div>
          </div>

          <div className="bootstrap-screen-stage-list">
            {steps.map((step) => (
              <div
                className={`bootstrap-screen-stage bootstrap-screen-stage-${step.status}`}
                key={step.stage}
              >
                <div className="bootstrap-screen-stage-head">
                  <span className="bootstrap-screen-stage-name">{step.label}</span>
                  <span className="bootstrap-screen-stage-status">
                    {step.status === "active"
                      ? "LIVE"
                      : step.status === "completed"
                        ? "LOCKED"
                        : "PENDING"}
                  </span>
                </div>
                <p className="bootstrap-screen-stage-detail">{step.detail}</p>
              </div>
            ))}
          </div>

          <div aria-live="polite" className="bootstrap-screen-tip-block">
            <div className="bootstrap-screen-tip-label">{text.gameBootstrapScreen.tipLabel}</div>
            <p className="bootstrap-screen-tip-text" key={`${tipIndex}-${activeTip}`}>
              {activeTip}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
