import { useEffect, useRef, useState } from "react";

import type {
  CreateSessionRequest,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";
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
        <p className="lead">
          当前版本已经具备 React 前端、Node 会话服务、mock 假闭环，以及可切换的
          `server_proxy` 多模型入口。现在可以从主菜单进入新游戏、继续游戏、战绩和设置页面。
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
            <div className="summary-text">还没有可继续的本地快照。</div>
          )}
        </div>

        <div className="summary-card">
          <div className="meta-label">默认设置</div>
          <div className="summary-text">语言：{locale}</div>
          <div className="summary-text">游戏模式：{playMode}</div>
          <div className="summary-text">主持架构：{gmArchitecture}</div>
          <div className="summary-text">模型模式：{modelAccessMode}</div>
          <div className="summary-text">模型档案：{modelProfileId}</div>
        </div>

        <div className="summary-card">
          <div className="meta-label">当前进度</div>
          <div className="summary-text">Phase 2 进行中</div>
          <div className="summary-text">
            已完成 React 前端迁移、状态化 mock 闭环，以及 `server_proxy` 多模型配置入口。
          </div>
        </div>
      </section>
    </div>
  );
}
