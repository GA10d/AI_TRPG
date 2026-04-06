import { useEffect, useRef, useState } from "react";

import type {
  CreateSessionRequest,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";
import { MENU_ANNOUNCEMENTS } from "../content/menuAnnouncements.ts";
import { formatDateTime } from "../ui.ts";

type MainMenuScreenProps = {
  recentSnapshot: SessionSnapshot | null;
  locale: CreateSessionRequest["locale"];
  playMode: CreateSessionRequest["playMode"];
  gmArchitecture: CreateSessionRequest["gmArchitecture"];
  modelAccessMode: CreateSessionRequest["modelAccessMode"];
  modelProfileId: string;
  onOpenNewGame: () => void;
  onOpenContinue: () => void;
  onOpenRecords: () => void;
  onOpenSettings: () => void;
  onOpenExit: () => void;
};

const MENU_SPLIT_RATIO_STORAGE_KEY = "trpg3.menuSplitRatio";
const DEFAULT_LEFT_RATIO = 50;
const MIN_LEFT_RATIO = 30;
const MAX_LEFT_RATIO = 70;
const INITIAL_NOTICE_COUNT = 10;
const NOTICE_LOAD_MORE_STEP = 5;

function clampRatio(rawValue: number): number {
  if (!Number.isFinite(rawValue)) {
    return DEFAULT_LEFT_RATIO;
  }

  return Math.min(MAX_LEFT_RATIO, Math.max(MIN_LEFT_RATIO, rawValue));
}

function loadStoredRatio(): number {
  if (typeof window === "undefined") {
    return DEFAULT_LEFT_RATIO;
  }

  const rawValue = window.localStorage.getItem(MENU_SPLIT_RATIO_STORAGE_KEY);
  return clampRatio(Number(rawValue));
}

export function MainMenuScreen(props: MainMenuScreenProps) {
  const {
    recentSnapshot,
    locale,
    playMode,
    gmArchitecture,
    modelAccessMode,
    modelProfileId,
    onOpenNewGame,
    onOpenContinue,
    onOpenRecords,
    onOpenSettings,
    onOpenExit
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftRatio, setLeftRatio] = useState<number>(() => loadStoredRatio());
  const [isDragging, setIsDragging] = useState(false);
  const [visibleNoticeCount, setVisibleNoticeCount] = useState(INITIAL_NOTICE_COUNT);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      MENU_SPLIT_RATIO_STORAGE_KEY,
      String(clampRatio(leftRatio))
    );
  }, [leftRatio]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    function updateRatio(clientX: number): void {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const nextRatio = ((clientX - rect.left) / rect.width) * 100;
      setLeftRatio(clampRatio(nextRatio));
    }

    function handlePointerMove(event: PointerEvent): void {
      updateRatio(event.clientX);
    }

    function handlePointerUp(): void {
      setIsDragging(false);
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging]);

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    setIsDragging(true);
  }

  const visibleAnnouncements = MENU_ANNOUNCEMENTS.slice(0, visibleNoticeCount);
  const hasMoreAnnouncements = MENU_ANNOUNCEMENTS.length > visibleAnnouncements.length;

  return (
    <div
      className={`menu-grid ${isDragging ? "menu-grid-dragging" : ""}`}
      ref={containerRef}
      style={
        {
          "--menu-left-ratio": `${leftRatio}%`
        } as React.CSSProperties
      }
    >
      <section className="panel hero-panel menu-panel-left">
        <div className="eyebrow">Main Menu</div>
        <h1>AI TRPG 3.0</h1>
        <p className="lead menu-lead">
          以文字叙事为核心的 AI TRPG 原型。你可以从这里开始新游戏、继续最近存档，
          或调整当前版本的默认模型与语言配置。
        </p>

        <div className="menu-button-list">
          <button className="menu-button" onClick={onOpenNewGame} type="button">
            开始游戏
          </button>
          <button className="menu-button" onClick={onOpenContinue} type="button">
            继续游戏
          </button>
          <button className="menu-button" onClick={onOpenRecords} type="button">
            战绩
          </button>
          <button className="menu-button" onClick={onOpenSettings} type="button">
            设置
          </button>
          <button className="menu-button menu-button-danger" onClick={onOpenExit} type="button">
            退出
          </button>
        </div>

        <div className="menu-footer-links">
          <button className="ghost-button menu-link-button" type="button">
            关于
          </button>
          <button className="ghost-button menu-link-button" type="button">
            联系我们
          </button>
        </div>
      </section>

      <button
        aria-label="拖拽调整主菜单左右宽度"
        className="menu-splitter"
        onPointerDown={handlePointerDown}
        type="button"
      >
        <span className="menu-splitter-line" />
      </button>

      <section className="panel summary-panel menu-panel-right">
        <div className="menu-notice-header">
          <div>
            <div className="eyebrow">Official Feed</div>
            <h2>公告与动态</h2>
          </div>
          <div className="summary-text">这里会展示最近的版本更新与开发动态。</div>
        </div>

        <div className="menu-notice-list">
          {visibleAnnouncements.map((announcement) => (
            <article className="menu-notice-card" key={announcement.id}>
              <div className="menu-notice-meta">{announcement.publishedAt}</div>
              <div className="summary-title menu-notice-title">{announcement.title}</div>
              <p className="summary-text menu-notice-body">{announcement.body}</p>
            </article>
          ))}
        </div>

        {hasMoreAnnouncements ? (
          <button
            className="ghost-button menu-more-button"
            onClick={() =>
              setVisibleNoticeCount((current) => current + NOTICE_LOAD_MORE_STEP)
            }
            type="button"
          >
            显示更多...
          </button>
        ) : null}

        <div className="menu-meta-strip">
          <div className="summary-card">
            <div className="meta-label">最近进度</div>
            {recentSnapshot ? (
              <>
                <div className="summary-title">{recentSnapshot.contentSummary.storyTitle}</div>
                <div className="summary-text">
                  回合 {recentSnapshot.session.currentRound} / 场景{" "}
                  {recentSnapshot.session.gameState.sceneId}
                </div>
                <div className="summary-text">
                  更新时间：{formatDateTime(recentSnapshot.session.updatedAt)}
                </div>
              </>
            ) : (
              <div className="summary-text">还没有可继续的本地进度。</div>
            )}
          </div>

          <div className="summary-card">
            <div className="meta-label">当前默认配置</div>
            <div className="summary-text">语言：{locale}</div>
            <div className="summary-text">模式：{playMode}</div>
            <div className="summary-text">主持架构：{gmArchitecture}</div>
            <div className="summary-text">模型模式：{modelAccessMode}</div>
            <div className="summary-text">模型档案：{modelProfileId}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
