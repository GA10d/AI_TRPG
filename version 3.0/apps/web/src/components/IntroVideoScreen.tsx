import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type IntroVideoStage = "idle" | "pass" | "selection";

const introVideoSources: Record<IntroVideoStage, string> = {
  idle: "/video/main%20idle.mp4",
  pass: "/video/main%20pass.mp4",
  selection: "/video/selection.mp4"
};
const SKIP_HOLD_DURATION_MS = 3000;
const VIDEO_CONTROL_SELECTOR = "[data-intro-video-control]";

type IntroVideoScreenProps = {
  completeOnSelectionInput?: boolean;
  onComplete?: () => void;
  passOverlay?: ReactNode;
  selectionOverlay?: ReactNode;
};

function isVideoControlEvent(event: Event): boolean {
  return event.target instanceof Element && event.target.closest(VIDEO_CONTROL_SELECTOR) !== null;
}

export function IntroVideoScreen({
  completeOnSelectionInput = true,
  onComplete,
  passOverlay = null,
  selectionOverlay = null
}: IntroVideoScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const holdSkipTimerRef = useRef<number | null>(null);
  const advanceRequestedRef = useRef(false);
  const completeRequestedRef = useRef(false);
  const [stage, setStage] = useState<IntroVideoStage>("idle");
  const [isMuted, setIsMuted] = useState(true);

  const completeIntro = useCallback(() => {
    if (completeRequestedRef.current) {
      return;
    }

    completeRequestedRef.current = true;
    onComplete?.();
  }, [onComplete]);

  const requestAdvance = useCallback(() => {
    if (stage !== "idle") {
      return;
    }

    advanceRequestedRef.current = true;
    setStage("pass");
  }, [stage]);

  useEffect(() => {
    const clearHoldSkipTimer = () => {
      if (holdSkipTimerRef.current === null) {
        return;
      }

      window.clearTimeout(holdSkipTimerRef.current);
      holdSkipTimerRef.current = null;
    };

    const startHoldSkipTimer = (event?: Event) => {
      if (event && isVideoControlEvent(event)) {
        return;
      }

      if (completeRequestedRef.current || holdSkipTimerRef.current !== null) {
        return;
      }

      holdSkipTimerRef.current = window.setTimeout(() => {
        holdSkipTimerRef.current = null;
        completeIntro();
      }, SKIP_HOLD_DURATION_MS);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      startHoldSkipTimer(event);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", clearHoldSkipTimer);
    window.addEventListener("pointerdown", startHoldSkipTimer);
    window.addEventListener("pointerup", clearHoldSkipTimer);
    window.addEventListener("pointercancel", clearHoldSkipTimer);
    window.addEventListener("touchstart", startHoldSkipTimer);
    window.addEventListener("touchend", clearHoldSkipTimer);
    window.addEventListener("touchcancel", clearHoldSkipTimer);
    window.addEventListener("blur", clearHoldSkipTimer);

    return () => {
      clearHoldSkipTimer();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", clearHoldSkipTimer);
      window.removeEventListener("pointerdown", startHoldSkipTimer);
      window.removeEventListener("pointerup", clearHoldSkipTimer);
      window.removeEventListener("pointercancel", clearHoldSkipTimer);
      window.removeEventListener("touchstart", startHoldSkipTimer);
      window.removeEventListener("touchend", clearHoldSkipTimer);
      window.removeEventListener("touchcancel", clearHoldSkipTimer);
      window.removeEventListener("blur", clearHoldSkipTimer);
    };
  }, [completeIntro]);

  useEffect(() => {
    if (stage !== "idle") {
      return;
    }

    const handleInput = (event: Event) => {
      if (isVideoControlEvent(event)) {
        return;
      }

      requestAdvance();
    };

    window.addEventListener("keydown", handleInput);
    window.addEventListener("pointerdown", handleInput);
    window.addEventListener("touchstart", handleInput);

    return () => {
      window.removeEventListener("keydown", handleInput);
      window.removeEventListener("pointerdown", handleInput);
      window.removeEventListener("touchstart", handleInput);
    };
  }, [requestAdvance, stage]);

  useEffect(() => {
    if (!completeOnSelectionInput || stage !== "selection") {
      return;
    }

    const handleInput = (event: Event) => {
      if (isVideoControlEvent(event)) {
        return;
      }

      completeIntro();
    };

    window.addEventListener("keydown", handleInput);
    window.addEventListener("pointerdown", handleInput);
    window.addEventListener("touchstart", handleInput);

    return () => {
      window.removeEventListener("keydown", handleInput);
      window.removeEventListener("pointerdown", handleInput);
      window.removeEventListener("touchstart", handleInput);
    };
  }, [completeIntro, completeOnSelectionInput, stage]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = isMuted;
    video.load();
    void video.play().catch(() => {
      // Muted autoplay should normally work; user input will retry playback below.
    });
  }, [isMuted, stage]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = isMuted;
    if (!isMuted) {
      void video.play().catch(() => {
        setIsMuted(true);
      });
    }
  }, [isMuted]);

  function handleVideoEnded(): void {
    const video = videoRef.current;

    if (stage === "idle") {
      if (advanceRequestedRef.current) {
        setStage("pass");
        return;
      }

      if (video) {
        video.currentTime = 0;
        void video.play();
      }
      return;
    }

    if (stage === "pass") {
      setStage("selection");
    }
  }

  return (
    <section className="intro-video-screen" data-stage={stage}>
      <video
        key={stage}
        ref={videoRef}
        className="intro-video"
        src={introVideoSources[stage]}
        autoPlay
        muted={isMuted}
        playsInline
        preload="auto"
        loop={stage === "selection"}
        onEnded={handleVideoEnded}
      />
      <video
        className="intro-video-preload"
        src={introVideoSources.pass}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <video
        className="intro-video-preload"
        src={introVideoSources.selection}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
      <div className="intro-video-ui-layer">
        {stage === "pass" ? passOverlay : null}
        {stage === "selection" ? selectionOverlay : null}
      </div>
      <button
        aria-label={isMuted ? "开启视频声音" : "关闭视频声音"}
        className="intro-video-sound-toggle"
        data-intro-video-control
        onClick={() => setIsMuted((current) => !current)}
        type="button"
      >
        <span className="intro-video-sound-icon" aria-hidden="true">
          {isMuted ? "MUTE" : "SOUND"}
        </span>
      </button>
    </section>
  );
}
