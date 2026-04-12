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
  const progressPercent = Math.max(
    8,
    Math.min(100, Math.round((sessionBootstrapState?.progress ?? 0.08) * 100))
  );
  const loadingTitle =
    sessionBootstrapState?.activeLabel ?? text.app.bootstrapStages.entered_game.label;
  const loadingDetail =
    sessionBootstrapState?.activeDetail ?? text.app.bootstrapStages.waiting_first_reply.detail;
  const loadingHint =
    sessionBootstrapState?.loadingHint?.trim() ||
    text.gameBootstrapScreen.defaultLoadingHint(storyTitle);
  const activeTip = tips[tipIndex] ?? text.gameBootstrapScreen.waitHint;

  return (
    <section className="bootstrap-screen">
      <div className="bootstrap-screen-inner">
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

        <div className="bootstrap-screen-copy">
          <div className="bootstrap-screen-story-label">{storyTitle}</div>
          <h1 className="bootstrap-screen-title">{loadingTitle}</h1>
          <p className="bootstrap-screen-hint">{loadingHint}</p>

          <div className="bootstrap-screen-progress-block">
            <div className="bootstrap-screen-progress-meta">
              <span>{text.gameBootstrapScreen.progressTitle}</span>
              <span>{text.gameBootstrapScreen.progressLabel(progressPercent)}</span>
            </div>
            <div
              aria-hidden="true"
              className="bootstrap-screen-progress-track"
            >
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

          <div aria-live="polite" className="bootstrap-screen-tip-block">
            <div className="bootstrap-screen-tip-label">{text.gameBootstrapScreen.tipLabel}</div>
            <p
              className="bootstrap-screen-tip-text"
              key={`${tipIndex}-${activeTip}`}
            >
              {activeTip}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
