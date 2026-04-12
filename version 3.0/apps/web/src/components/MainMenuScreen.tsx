import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";

import type {
  CreateSessionRequest,
  SessionSnapshot
} from "../../../../packages/shared-types/src/index.ts";
import { MENU_ANNOUNCEMENTS } from "../content/menuAnnouncements.ts";
import {
  UI_LOCALE_OPTIONS,
  resolveUiLocaleCode,
  useUiText,
  type UiLocaleCode
} from "../locales/index.tsx";
import { formatDateTime } from "../ui.ts";

type MainMenuScreenProps = {
  recentSnapshot: SessionSnapshot | null;
  uiLocale: UiLocaleCode;
  locale: CreateSessionRequest["locale"];
  playMode: CreateSessionRequest["playMode"];
  gmArchitecture: CreateSessionRequest["gmArchitecture"];
  modelAccessMode: CreateSessionRequest["modelAccessMode"];
  modelProfileId: string;
  onUiLocaleChange: (value: UiLocaleCode) => void;
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
  const text = useUiText();
  const {
    recentSnapshot,
    uiLocale,
    locale,
    playMode,
    gmArchitecture,
    modelAccessMode,
    modelProfileId,
    onUiLocaleChange,
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

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
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
        } as CSSProperties
      }
    >
      <section className="panel hero-panel menu-panel-left">
        <div className="menu-panel-header">
          <div aria-hidden="true" className="menu-panel-header-spacer" />
          <div className="eyebrow">{text.mainMenu.eyebrow}</div>
          <div className="menu-language-picker">
            <select
              aria-label="Select UI language"
              className="menu-language-select"
              onChange={(event) =>
                onUiLocaleChange(resolveUiLocaleCode(event.currentTarget.value))
              }
              value={uiLocale}
            >
              {UI_LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <h1>{text.mainMenu.title}</h1>
        <p className="lead menu-lead">{text.mainMenu.description}</p>

        <div className="menu-button-list">
          <button className="menu-button" onClick={onOpenNewGame} type="button">
            {text.mainMenu.buttons.newGame}
          </button>
          <button className="menu-button" onClick={onOpenContinue} type="button">
            {text.mainMenu.buttons.continue}
          </button>
          <button className="menu-button" onClick={onOpenRecords} type="button">
            {text.mainMenu.buttons.records}
          </button>
          <button className="menu-button" onClick={onOpenSettings} type="button">
            {text.mainMenu.buttons.settings}
          </button>
          <button className="menu-button menu-button-danger" onClick={onOpenExit} type="button">
            {text.mainMenu.buttons.exit}
          </button>
        </div>

        <div className="menu-footer-links">
          <button className="ghost-button menu-link-button" type="button">
            {text.mainMenu.footer.about}
          </button>
          <button className="ghost-button menu-link-button" type="button">
            {text.mainMenu.footer.contact}
          </button>
        </div>
      </section>

      <button
        aria-label={text.mainMenu.splitterAriaLabel}
        className="menu-splitter"
        onPointerDown={handlePointerDown}
        type="button"
      >
        <span className="menu-splitter-line" />
      </button>

      <section className="panel summary-panel menu-panel-right">
        <div className="menu-notice-header">
          <div>
            <div className="eyebrow">{text.mainMenu.feed.eyebrow}</div>
            <h2>{text.mainMenu.feed.title}</h2>
          </div>
          <div className="summary-text">{text.mainMenu.feed.description}</div>
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
            {text.mainMenu.feed.showMore}
          </button>
        ) : null}

        <div className="menu-meta-strip">
          <div className="summary-card">
            <div className="meta-label">{text.mainMenu.recentProgress.label}</div>
            {recentSnapshot ? (
              <>
                <div className="summary-title">{recentSnapshot.contentSummary.storyTitle}</div>
                <div className="summary-text">
                  {text.mainMenu.recentProgress.roundAndStatus(
                    recentSnapshot.session.currentRound,
                    recentSnapshot.session.status
                  )}
                </div>
                <div className="summary-text">
                  {text.mainMenu.recentProgress.updatedAt(
                    formatDateTime(recentSnapshot.session.updatedAt)
                  )}
                </div>
              </>
            ) : (
              <div className="summary-text">{text.mainMenu.recentProgress.empty}</div>
            )}
          </div>

          <div className="summary-card">
            <div className="meta-label">{text.mainMenu.defaults.label}</div>
            <div className="summary-text">{text.mainMenu.defaults.locale(locale)}</div>
            <div className="summary-text">{text.mainMenu.defaults.playMode(playMode)}</div>
            <div className="summary-text">
              {text.mainMenu.defaults.gmArchitecture(gmArchitecture)}
            </div>
            <div className="summary-text">
              {text.mainMenu.defaults.modelAccessMode(modelAccessMode)}
            </div>
            <div className="summary-text">
              {text.mainMenu.defaults.modelProfile(modelProfileId)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
